// Excel ファイルから見積・実績を追加読み込みする機能
// 仕様書: docs/superpowers/specs/2026-05-23-excel-append-import-design.md

import { estimates, actuals } from './state.js';

// プレビュー中の状態（モーダルが閉じられたらクリア）
let previewState = null;

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
 * 見積の競合を検出: (version, task, process, member) 一致
 * @returns {{ newRows, conflicts: [{ existing, incoming }] }}
 */
function detectEstimateConflicts(rows, existing) {
    const newRows = [];
    const conflicts = [];
    for (const incoming of rows) {
        const match = existing.find(e =>
            e.version === incoming.version &&
            e.task === incoming.task &&
            e.process === incoming.process &&
            e.member === incoming.member
        );
        if (match) conflicts.push({ existing: match, incoming });
        else newRows.push(incoming);
    }
    return { newRows, conflicts };
}

/**
 * 実績の重複検出: (date, member, version, task, process, hours) の完全一致のみ
 * @returns {{ newRows, duplicates: [{ existing, incoming }] }}
 */
function detectActualConflicts(rows, existing) {
    const newRows = [];
    const duplicates = [];
    for (const incoming of rows) {
        const exact = existing.find(a =>
            a.date === incoming.date &&
            a.member === incoming.member &&
            a.version === incoming.version &&
            a.task === incoming.task &&
            a.process === incoming.process &&
            Number(a.hours) === Number(incoming.hours)
        );
        if (exact) duplicates.push({ existing: exact, incoming });
        else newRows.push(incoming);
    }
    return { newRows, duplicates };
}

function buildRowIdentity(row) {
    return el('div', { class: 'excel-import-row-id' }, [
        el('span', { class: 'version', text: row.version }),
        el('span', { class: 'task', text: row.task }),
        el('span', { class: 'process', text: row.process }),
        el('span', { class: 'member', text: row.member })
    ]);
}

function buildCompareSide(label, hours, workMonths, sideClass, hoursChanged, monthsChanged) {
    const monthsStr = Array.isArray(workMonths) ? workMonths.join(', ') : (workMonths || '');
    return el('div', { class: `excel-import-compare-side ${sideClass}` }, [
        el('div', { class: 'excel-import-compare-side-label', text: label }),
        el('div', { class: `excel-import-field-row ${hoursChanged ? 'changed' : ''}` }, [
            el('span', { class: 'name', text: '工数' }),
            el('span', { class: 'val', text: `${hours} h` })
        ]),
        el('div', { class: `excel-import-field-row ${monthsChanged ? 'changed' : ''}` }, [
            el('span', { class: 'name', text: '作業月' }),
            el('span', { class: 'val', text: monthsStr || '—' })
        ])
    ]);
}

function buildConflictCard(conflict, index, defaultDecision) {
    const { existing, incoming } = conflict;
    const hoursChanged = Number(existing.hours) !== Number(incoming.hours);
    const existingMonths = (existing.workMonths || (existing.workMonth ? [existing.workMonth] : []));
    const incomingMonths = incoming.workMonths || [];
    const monthsChanged = existingMonths.join(',') !== incomingMonths.join(',');
    const decision = defaultDecision || 'overwrite';

    const card = el('div', {
        class: 'excel-import-compare-card',
        'data-state': decision,
        'data-index': String(index)
    }, [
        el('div', { class: 'excel-import-compare-header' }, [
            buildRowIdentity(incoming),
            buildChoiceGroup(`excelConflict_${index}`, decision, [
                { value: 'overwrite', label: '上書き', className: 'is-overwrite' },
                { value: 'skip', label: 'スキップ', className: 'is-skip' }
            ])
        ]),
        el('div', { class: 'excel-import-compare-body' }, [
            buildCompareSide('既存', existing.hours, existingMonths, 'existing', hoursChanged, monthsChanged),
            el('div', { class: 'excel-import-compare-arrow', text: '→' }),
            buildCompareSide('読み込み', incoming.hours, incomingMonths, 'incoming', hoursChanged, monthsChanged)
        ])
    ]);
    return card;
}

function buildChoiceGroup(name, currentValue, options) {
    const group = el('div', { class: 'excel-import-choice-group' });
    for (const opt of options) {
        const id = `${name}_${opt.value}`;
        const input = el('input', { type: 'radio', name, id, value: opt.value });
        if (currentValue === opt.value) input.checked = true;
        const label = el('label', { htmlFor: id, class: opt.className || '', text: opt.label });
        group.appendChild(input);
        group.appendChild(label);
    }
    return group;
}

function buildSheetChip(kind, name, icon, newCount, conflictOrDupCount, invalidCount, conflictLabel) {
    const checkbox = el('input', { type: 'checkbox', 'data-sheet-checkbox': kind });
    checkbox.checked = true;

    const counts = el('div', { class: 'excel-import-sheet-chip-counts' }, [
        el('span', { class: 'excel-import-tag-add', text: `+${newCount} 追加` })
    ]);
    if (conflictOrDupCount > 0) {
        const cls = kind === 'estimate' ? 'excel-import-tag-conflict' : 'excel-import-tag-skip';
        counts.appendChild(el('span', { class: cls, text: `${conflictLabel} ${conflictOrDupCount} 件` }));
    }
    if (invalidCount > 0) {
        counts.appendChild(el('span', { class: 'excel-import-tag-skip', text: `⚠ 無効 ${invalidCount} 件` }));
    }

    return el('label', { class: 'excel-import-sheet-chip', 'data-sheet': kind }, [
        checkbox,
        el('div', { class: 'excel-import-sheet-chip-icon', text: icon }),
        el('div', { class: 'excel-import-sheet-chip-body' }, [
            el('div', { class: 'excel-import-sheet-chip-name', text: name }),
            counts
        ])
    ]);
}

function buildWarnings() {
    if (!previewState) return null;
    const blocks = [];

    if (previewState.parseErrors.length > 0) {
        const ul = el('ul', { class: 'excel-import-warning-list' });
        for (const e of previewState.parseErrors) ul.appendChild(el('li', { text: e }));
        blocks.push(el('div', {}, [
            el('div', { class: 'excel-import-warning-title', text: 'パースに関する警告' }),
            ul
        ]));
    }

    const buildInvalidList = (label, invalids) => {
        if (invalids.length === 0) return null;
        const ul = el('ul', { class: 'excel-import-warning-list' });
        for (const inv of invalids.slice(0, 5)) {
            ul.appendChild(el('li', { text: `${inv.rowNum} 行目: ${inv.reason}` }));
        }
        if (invalids.length > 5) ul.appendChild(el('li', { text: `ほか ${invalids.length - 5} 件` }));
        return el('div', {}, [
            el('div', { class: 'excel-import-warning-title', text: `${label}: 取り込めない行が ${invalids.length} 件あります` }),
            ul
        ]);
    };
    const est = buildInvalidList('見積シート', previewState.estimateInvalid);
    const act = buildInvalidList('実績シート', previewState.actualInvalid);
    if (est) blocks.push(est);
    if (act) blocks.push(act);

    if (blocks.length === 0) return null;
    return el('div', { class: 'excel-import-warning' }, [
        el('div', { text: '⚠' }),
        el('div', { class: 'excel-import-warning-body' }, blocks)
    ]);
}

function buildConflictSection() {
    if (!previewState || previewState.estimateConflicts.length === 0 || !previewState.sheets.estimate) {
        return null;
    }
    const wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { class: 'excel-import-section-title', text: `見積シート: 競合 ${previewState.estimateConflicts.length} 件の処理を選択` }));

    const bulkBar = el('div', { class: 'excel-import-bulk-bar' }, [
        el('div', { class: 'excel-import-bulk-label', text: '⚡ 一括設定' }),
        buildChoiceGroup('excelBulk', previewState.bulkMode, [
            { value: 'overwrite', label: '全て上書き', className: 'is-overwrite' },
            { value: 'skip', label: '全てスキップ', className: 'is-skip' },
            { value: 'individual', label: '個別判断' }
        ])
    ]);
    wrap.appendChild(bulkBar);

    for (let i = 0; i < previewState.estimateConflicts.length; i++) {
        wrap.appendChild(buildConflictCard(previewState.estimateConflicts[i], i, previewState.decisions[i]));
    }
    return wrap;
}

function computeSummary() {
    if (!previewState) return { total: 0, add: 0, overwrite: 0, skip: 0, addDetail: '', skipDetail: '', totalDetail: '' };
    const estOn = previewState.sheets.estimate;
    const actOn = previewState.sheets.actual;
    const estNew = estOn ? previewState.estimateNew.length : 0;
    const actNew = actOn ? previewState.actualNew.length : 0;
    let overwrite = 0, conflictSkip = 0;
    if (estOn) {
        for (const d of previewState.decisions) {
            if (d === 'overwrite') overwrite++; else conflictSkip++;
        }
    }
    const dupSkip = actOn ? previewState.actualDuplicates.length : 0;
    const add = estNew + actNew;
    const total = add + overwrite;
    const skip = conflictSkip + dupSkip;
    return {
        total, add, overwrite, skip,
        addDetail: `見積 +${estNew} ・ 実績 +${actNew}`,
        skipDetail: `競合 ${conflictSkip} ・ 完全重複 ${dupSkip}`,
        totalDetail: `見積 ${estOn ? estNew + overwrite : 0} ・ 実績 ${actNew}`
    };
}

function refreshSummaryUI() {
    const s = computeSummary();
    const summary = document.getElementById('excelImportSummary');
    if (!summary) return;
    summary.querySelector('[data-field="total"]').textContent = s.total;
    summary.querySelector('[data-field="add"]').textContent = s.add;
    summary.querySelector('[data-field="overwrite"]').textContent = s.overwrite;
    summary.querySelector('[data-field="skip"]').textContent = s.skip;
    summary.querySelector('[data-field="addDetail"]').textContent = s.addDetail;
    summary.querySelector('[data-field="skipDetail"]').textContent = s.skipDetail;
    summary.querySelector('[data-field="totalDetail"]').textContent = s.totalDetail;
    const footerCount = document.getElementById('excelImportFooterCount');
    if (footerCount) footerCount.textContent = s.total;
    const confirmBtn = document.getElementById('btnConfirmExcelImport');
    if (confirmBtn) {
        confirmBtn.textContent = `取り込む（${s.total}件）`;
        confirmBtn.disabled = s.total === 0;
    }
}

function openPreviewModal(fileName, parseResult) {
    const estConflict = detectEstimateConflicts(parseResult.estimateRows, estimates);
    const actConflict = detectActualConflicts(parseResult.actualRows, actuals);

    previewState = {
        fileName,
        estimateNew: estConflict.newRows,
        estimateConflicts: estConflict.conflicts,
        actualNew: actConflict.newRows,
        actualDuplicates: actConflict.duplicates,
        estimateInvalid: parseResult.estimateInvalid,
        actualInvalid: parseResult.actualInvalid,
        parseErrors: parseResult.errors,
        sheets: {
            estimate: parseResult.estimateRows.length > 0 || parseResult.estimateInvalid.length > 0,
            actual: parseResult.actualRows.length > 0 || parseResult.actualInvalid.length > 0
        },
        bulkMode: 'overwrite',
        decisions: estConflict.conflicts.map(() => 'overwrite')
    };

    document.getElementById('excelImportFileName').textContent = fileName;

    // シートチップを構築
    const sheetsEl = document.getElementById('excelImportSheets');
    sheetsEl.textContent = '';
    if (previewState.sheets.estimate) {
        sheetsEl.appendChild(buildSheetChip('estimate', '見積シート', '📋', estConflict.newRows.length, estConflict.conflicts.length, parseResult.estimateInvalid.length, '⚠ 競合'));
    }
    if (previewState.sheets.actual) {
        sheetsEl.appendChild(buildSheetChip('actual', '実績シート', '⏱', actConflict.newRows.length, actConflict.duplicates.length, parseResult.actualInvalid.length, '重複スキップ'));
    }

    // 競合プレビュー
    const conflictEl = document.getElementById('excelImportConflictSection');
    conflictEl.textContent = '';
    const conflictFrag = buildConflictSection();
    if (conflictFrag) conflictEl.appendChild(conflictFrag);

    // 警告
    const warnEl = document.getElementById('excelImportWarnings');
    warnEl.textContent = '';
    const warnNode = buildWarnings();
    if (warnNode) {
        warnEl.appendChild(warnNode);
        warnEl.style.display = '';
    } else {
        warnEl.style.display = 'none';
    }

    refreshSummaryUI();
    attachPreviewEventHandlers();
    document.getElementById('excelImportPreviewModal').style.display = 'flex';
}

function closePreviewModal() {
    document.getElementById('excelImportPreviewModal').style.display = 'none';
    previewState = null;
}

function attachPreviewEventHandlers() {
    const modal = document.getElementById('excelImportPreviewModal');

    // 閉じるボタン
    const closeBtn = document.getElementById('btnCloseExcelImportPreview');
    if (closeBtn) closeBtn.onclick = closePreviewModal;
    const cancelBtn = document.getElementById('btnCancelExcelImport');
    if (cancelBtn) cancelBtn.onclick = closePreviewModal;

    // Esc で閉じる
    modal.onkeydown = (e) => { if (e.key === 'Escape') closePreviewModal(); };

    // 一括トグル
    modal.querySelectorAll('input[name="excelBulk"]').forEach(input => {
        input.onchange = (e) => {
            previewState.bulkMode = e.target.value;
            if (e.target.value !== 'individual') {
                for (let i = 0; i < previewState.decisions.length; i++) {
                    previewState.decisions[i] = e.target.value;
                }
                modal.querySelectorAll('.excel-import-compare-card').forEach(card => {
                    const idx = Number(card.dataset.index);
                    card.dataset.state = previewState.decisions[idx];
                    const rb = card.querySelector(`input[value="${previewState.decisions[idx]}"]`);
                    if (rb) rb.checked = true;
                });
            }
            refreshSummaryUI();
        };
    });

    // 個別トグル
    modal.querySelectorAll('.excel-import-compare-card').forEach(card => {
        const idx = Number(card.dataset.index);
        card.querySelectorAll(`input[name="excelConflict_${idx}"]`).forEach(input => {
            input.onchange = (e) => {
                previewState.decisions[idx] = e.target.value;
                card.dataset.state = e.target.value;
                if (previewState.bulkMode !== 'individual') {
                    previewState.bulkMode = 'individual';
                    const indRb = modal.querySelector('input[name="excelBulk"][value="individual"]');
                    if (indRb) indRb.checked = true;
                }
                refreshSummaryUI();
            };
        });
    });

    // シートチェックボックス
    modal.querySelectorAll('input[data-sheet-checkbox]').forEach(input => {
        input.onchange = (e) => {
            const sheet = e.target.dataset.sheetCheckbox;
            previewState.sheets[sheet] = e.target.checked;
            const chip = e.target.closest('.excel-import-sheet-chip');
            if (chip) chip.classList.toggle('disabled', !e.target.checked);
            const conflictSection = document.getElementById('excelImportConflictSection');
            if (sheet === 'estimate') {
                conflictSection.style.display = e.target.checked ? '' : 'none';
            }
            refreshSummaryUI();
        };
    });

    modal.tabIndex = -1;
    modal.focus();
}

/**
 * Excel ファイル取り込みのエントリポイント
 * @param {File} file - ユーザーが選択した xlsx/xls ファイル
 */
export async function handleExcelImport(file) {
    try {
        const result = await parseWorkbook(file);
        const fatal = result.errors.length > 0 &&
                      result.estimateRows.length === 0 && result.actualRows.length === 0 &&
                      result.estimateInvalid.length === 0 && result.actualInvalid.length === 0;
        if (fatal) {
            alert('Excel ファイルを確認してください\n\n' + result.errors.join('\n'));
            return;
        }
        if (result.estimateRows.length === 0 && result.actualRows.length === 0 &&
            result.estimateInvalid.length === 0 && result.actualInvalid.length === 0) {
            alert('取り込めるデータがありません');
            return;
        }
        openPreviewModal(file.name, result);
    } catch (err) {
        console.error('Excel パースエラー:', err);
        alert('Excel ファイルの読み込みに失敗しました: ' + err.message);
    }
}

console.log('✅ モジュール excel-import.js loaded');
