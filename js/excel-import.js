// Excel ファイルから見積・実績を追加読み込みする機能
// 仕様書: docs/superpowers/specs/2026-05-23-excel-append-import-design.md

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

const ESTIMATE_REQUIRED = ['version', 'task', 'process', 'member', 'hours_estimate'];
const ESTIMATE_OPTIONAL = ['workMonth'];
const ACTUAL_REQUIRED = ['date', 'version', 'task', 'process', 'member', 'hours_actual'];

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

function parseWorkMonths(value) {
    if (value == null || value === '') return [];
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
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
        const jp = { version: '版数', task: '対応名', process: '工程', member: '担当', hours_estimate: '見積工数' };
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
        if (!row.version) problems.push('版数が空');
        if (!row.task) problems.push('対応名が空');
        if (!row.process) problems.push('工程が空');
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
    for (const key of ACTUAL_REQUIRED) {
        colMap[key] = findHeaderIndex(headers, key);
    }

    const missing = ACTUAL_REQUIRED.filter(k => colMap[k] === -1);
    if (missing.length > 0) {
        const jp = { date: '日付', version: '版数', task: '対応名', process: '工程', member: '担当', hours_actual: '工数' };
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
        if (!row.process) problems.push('工程が空');
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

/**
 * Excel ファイル取り込みのエントリポイント
 * @param {File} file - ユーザーが選択した xlsx/xls ファイル
 */
export async function handleExcelImport(file) {
    try {
        const result = await parseWorkbook(file);
        console.log('parseWorkbook result:', result);
        const msg = [
            `見積行: ${result.estimateRows.length} 件（無効 ${result.estimateInvalid.length}）`,
            `実績行: ${result.actualRows.length} 件（無効 ${result.actualInvalid.length}）`,
            result.errors.length > 0 ? `エラー: ${result.errors.join(' / ')}` : ''
        ].filter(Boolean).join('\n');
        alert(msg);
    } catch (err) {
        console.error('Excel パースエラー:', err);
        alert('Excel ファイルの読み込みに失敗しました: ' + err.message);
    }
}

console.log('✅ モジュール excel-import.js loaded');
