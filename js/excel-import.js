// Excel ファイルから見積・実績を追加読み込みする機能
// 仕様書: docs/superpowers/specs/2026-05-23-excel-append-import-design.md

import { estimates, actuals } from './state.js';
import { detectDiff, openMergePreview, s as mcS, normalizeDate as mcND, roundNum } from './merge-core.js';

/**
 * 軽量 DOM 構築ヘルパー。
 * - `attrs.class` はクラス名、`data-*` は data 属性、それ以外はプロパティ
 * - text プロパティを指定すると textContent を設定（安全に文字列を入れる用）
 * - children は配列で子ノードを渡す（null は無視）
 */
function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('data-') || k.startsWith('aria-')) e.setAttribute(k, v);
        else e[k] = v;
    }
    for (const c of children) {
        if (c == null) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
}

const SHEET_ALIASES = {
    estimate: ['見積', '見積シート', 'estimate', 'estimates'],
    actual: ['実績', '実績シート', 'actual', 'actuals']
};

// キー: 内部標準名、値: 同義語の配列（小文字化して比較）
const HEADER_ALIASES = {
    version: ['版数', 'バージョン', 'version', 'ver'],
    task: ['対応名', 'タスク', 'task', '案件名'],
    process: ['工程', 'プロセス', 'process'],
    member: ['担当', '担当者', '担当者名', 'メンバー', 'member', 'assignee'],
    hours_estimate: ['見積工数(h)', '見積工数', '工数(h)', '工数', 'hours', 'h'],
    hours_actual: ['工数(h)', '工数', 'hours', 'h', '実績工数(h)', '実績工数'],
    workMonth: ['作業月', '対象月', 'workmonth', 'workMonths'],
    date: ['日付', 'date', '実績日']
};

// 版数 / 工程 は空欄 OK（任意項目）
const ESTIMATE_REQUIRED = ['task', 'member', 'hours_estimate'];
const ESTIMATE_OPTIONAL = ['version', 'process', 'workMonth'];
const ACTUAL_REQUIRED = ['date', 'task', 'member', 'hours_actual'];
const ACTUAL_OPTIONAL = ['version', 'process'];

function normalizeHeader(raw) {
    if (raw == null) return '';
    return String(raw).trim().toLowerCase().replace(/\s+/g, '');
}

function findHeaderIndex(headers, targetKey) {
    const aliases = (HEADER_ALIASES[targetKey] || []).map(normalizeHeader);
    for (let i = 0; i < headers.length; i++) {
        const h = normalizeHeader(headers[i]);
        if (aliases.includes(h)) return i;
    }
    return -1;
}

function findSheetByAlias(workbook, key) {
    const aliases = SHEET_ALIASES[key].map(normalizeHeader);
    for (const sheetName of workbook.SheetNames) {
        if (aliases.includes(normalizeHeader(sheetName))) {
            return workbook.Sheets[sheetName];
        }
    }
    return null;
}

/**
 * 作業月の単一値を 'YYYY-MM' に正規化する。
 * Date オブジェクト / 'YYYY-MM' / 'YYYY/MM' / 'YYYY-MM-DD' / 'YYYY/MM/DD' / 'YYYY年M月' に対応。
 * 認識できない値は '' を返す。
 */
function normalizeMonthToken(v) {
    if (v == null) return '';
    if (v instanceof Date && !isNaN(v.getTime())) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }
    const s = String(v).trim();
    if (!s) return '';
    let m = s.match(/^(\d{4})[-/年\.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    // 'Mon Jun 01 2026 ...' のような Date.toString() 形式
    const dateLike = new Date(s);
    if (!isNaN(dateLike.getTime())) {
        const y = dateLike.getFullYear();
        const mm = String(dateLike.getMonth() + 1).padStart(2, '0');
        return `${y}-${mm}`;
    }
    return '';
}

function parseWorkMonths(value) {
    if (value == null || value === '') return [];
    if (value instanceof Date) {
        const t = normalizeMonthToken(value);
        return t ? [t] : [];
    }
    return String(value)
        .split(',')
        .map(s => normalizeMonthToken(s))
        .filter(Boolean);
}

function normalizeDate(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(value).trim();
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!m) return '';
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function extractEstimateRows(sheet, XLSX) {
    if (!sheet) return { rows: [], invalid: [], error: null };

    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (aoa.length === 0) return { rows: [], invalid: [], error: null };

    const headers = aoa[0];
    const colMap = {};
    for (const key of [...ESTIMATE_REQUIRED, ...ESTIMATE_OPTIONAL]) {
        colMap[key] = findHeaderIndex(headers, key);
    }

    const missing = ESTIMATE_REQUIRED.filter(k => colMap[k] === -1);
    if (missing.length > 0) {
        const jp = { task: '対応名', member: '担当', hours_estimate: '見積工数' };
        return {
            rows: [], invalid: [],
            error: `見積シートの必須列が不足しています: ${missing.map(k => `「${jp[k]}」`).join(', ')}`
        };
    }

    const rows = [];
    const invalid = [];
    for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || r.every(c => c === '' || c == null)) continue;

        const row = {
            version: String(r[colMap.version] ?? '').trim(),
            task: String(r[colMap.task] ?? '').trim(),
            process: String(r[colMap.process] ?? '').trim(),
            member: String(r[colMap.member] ?? '').trim(),
            hours: Number(r[colMap.hours_estimate]),
            workMonths: parseWorkMonths(colMap.workMonth >= 0 ? r[colMap.workMonth] : ''),
            _rowNum: i + 1
        };

        const problems = [];
        if (!row.task) problems.push('対応名が空');
        if (!row.member) problems.push('担当が空');
        if (!Number.isFinite(row.hours)) problems.push('見積工数が数値でない');

        if (problems.length > 0) {
            invalid.push({ rowNum: row._rowNum, reason: problems.join(' / ') });
        } else {
            rows.push(row);
        }
    }
    return { rows, invalid, error: null };
}

function extractActualRows(sheet, XLSX) {
    if (!sheet) return { rows: [], invalid: [], error: null };

    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (aoa.length === 0) return { rows: [], invalid: [], error: null };

    const headers = aoa[0];
    const colMap = {};
    for (const key of [...ACTUAL_REQUIRED, ...ACTUAL_OPTIONAL]) {
        colMap[key] = findHeaderIndex(headers, key);
    }

    const missing = ACTUAL_REQUIRED.filter(k => colMap[k] === -1);
    if (missing.length > 0) {
        const jp = { date: '日付', task: '対応名', member: '担当', hours_actual: '工数' };
        return {
            rows: [], invalid: [],
            error: `実績シートの必須列が不足しています: ${missing.map(k => `「${jp[k]}」`).join(', ')}`
        };
    }

    const rows = [];
    const invalid = [];
    for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || r.every(c => c === '' || c == null)) continue;

        const row = {
            date: normalizeDate(r[colMap.date]),
            version: String(r[colMap.version] ?? '').trim(),
            task: String(r[colMap.task] ?? '').trim(),
            process: String(r[colMap.process] ?? '').trim(),
            member: String(r[colMap.member] ?? '').trim(),
            hours: Number(r[colMap.hours_actual]),
            _rowNum: i + 1
        };

        const problems = [];
        if (!row.date) problems.push('日付が不正');
        if (!row.member) problems.push('担当が空');
        if (!row.task) problems.push('対応名が空');
        if (!Number.isFinite(row.hours)) problems.push('工数が数値でない');

        if (problems.length > 0) {
            invalid.push({ rowNum: row._rowNum, reason: problems.join(' / ') });
        } else {
            rows.push(row);
        }
    }
    return { rows, invalid, error: null };
}

async function parseWorkbook(file) {
    const XLSX = await import('../lib/xlsx.mjs');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

    const errors = [];
    const estimateSheet = findSheetByAlias(wb, 'estimate');
    const actualSheet = findSheetByAlias(wb, 'actual');

    if (!estimateSheet && !actualSheet) {
        errors.push('「見積」または「実績」という名前のシートが見つかりません');
        return { estimateRows: [], estimateInvalid: [], actualRows: [], actualInvalid: [], errors };
    }

    const est = extractEstimateRows(estimateSheet, XLSX);
    const act = extractActualRows(actualSheet, XLSX);
    if (est.error) errors.push(est.error);
    if (act.error) errors.push(act.error);

    return {
        estimateRows: est.rows,
        estimateInvalid: est.invalid,
        actualRows: act.rows,
        actualInvalid: act.invalid,
        errors
    };
}

// ============================================
//  差分マージ共通基盤(merge-core)を使ったアダプタ
//  旧: 独自プレビューモーダル/競合検出/undo は merge-core に統合済み
// ============================================

// 作業月配列→先頭月＋均等割り（追加時の付随フィールド）
function deriveMonthFields(workMonths, hours) {
    if (!Array.isArray(workMonths) || workMonths.length === 0) return { workMonth: '', monthlyHours: {} };
    const monthlyHours = {};
    const per = hours / workMonths.length;
    for (const m of workMonths) monthlyHours[m] = per;
    return { workMonth: workMonths[0], monthlyHours };
}

function genId() { return Date.now() + Math.random(); }

function monthsKey(rec) {
    const arr = Array.isArray(rec.workMonths) ? rec.workMonths : (rec.workMonth ? [rec.workMonth] : []);
    return arr.slice().sort().join(',');
}

// パース結果 → merge-core のセクション配列（Excel は追加インポートのため removed は無効）
function buildSections(result) {
    const sections = [];

    const estSpec = {
        keyOf: r => [mcS(r.version), mcS(r.task), mcS(r.process), mcS(r.member)].join('|'),
        valueEq: (a, b) => roundNum(a.hours) === roundNum(b.hours) && monthsKey(a) === monthsKey(b),
        emitChanged: true
    };
    const estDiff = detectDiff(result.estimateRows, estimates, estSpec);
    estDiff.removed = [];
    if (estDiff.added.length + estDiff.changed.length > 0) {
        sections.push({
            id: 'estimates', field: 'estimates', label: '見積', icon: '📋', kind: 'records', allowOverwrite: true,
            keyFields: ['version', 'task', 'process', 'member'],
            compareFields: [{ key: 'hours', label: '工数' }, { key: 'workMonths', label: '作業月' }],
            diff: estDiff,
            apply: {
                add(rec) {
                    const m = deriveMonthFields(rec.workMonths, rec.hours);
                    const r = { ...rec, workMonth: m.workMonth, monthlyHours: m.monthlyHours, id: genId() };
                    estimates.push(r);
                    return r;
                },
                overwrite(existing, incoming) {
                    const idx = estimates.findIndex(e => e.id === existing.id);
                    if (idx < 0) return null;
                    const before = { ...estimates[idx] };
                    const m = deriveMonthFields(incoming.workMonths, incoming.hours);
                    const after = { ...estimates[idx], hours: incoming.hours, workMonth: m.workMonth, workMonths: incoming.workMonths, monthlyHours: m.monthlyHours };
                    estimates[idx] = after;
                    return { before, after: { ...after } };
                },
                remove() { /* 追加インポートのため削除しない */ }
            }
        });
    }

    const actSpec = {
        keyOf: r => [mcND(r.date), mcS(r.member), mcS(r.version), mcS(r.task), mcS(r.process), roundNum(r.hours)].join('|'),
        valueEq: () => true, emitChanged: false
    };
    const actDiff = detectDiff(result.actualRows, actuals, actSpec);
    actDiff.removed = [];
    if (actDiff.added.length > 0) {
        sections.push({
            id: 'actuals', field: 'actuals', label: '実績', icon: '⏱', kind: 'records', allowOverwrite: false,
            keyFields: ['date', 'member', 'version', 'task', 'process'],
            compareFields: [{ key: 'hours', label: '工数' }],
            diff: actDiff,
            apply: {
                add(rec) { const r = { ...rec, id: genId() }; actuals.push(r); return r; },
                overwrite() { return null; },
                remove() { }
            }
        });
    }

    return sections;
}

/**
 * Excel ファイル取り込みのエントリポイント（差分マージ UI を共有）
 * @param {File} file - xlsx/xls ファイル
 */
export async function handleExcelImport(file) {
    let result;
    try {
        result = await parseWorkbook(file);
    } catch (err) {
        console.error('Excel パースエラー:', err);
        (window.showAlert || alert)('Excel ファイルの読み込みに失敗しました: ' + err.message, false);
        return;
    }
    const fatal = result.errors.length > 0 && result.estimateRows.length === 0 && result.actualRows.length === 0;
    if (fatal) {
        (window.showAlert || alert)('Excel ファイルを確認してください\n\n' + result.errors.join('\n'), false);
        return;
    }
    const sections = buildSections(result);
    if (sections.length === 0) {
        (window.showAlert || alert)('取り込める差分がありません（既存と重複、またはデータなし）', true);
        return;
    }
    openMergePreview(sections, { fileName: file.name, sourceLabel: 'Excel' });
}

console.log('✅ モジュール excel-import.js loaded (merge-core adapter)');
