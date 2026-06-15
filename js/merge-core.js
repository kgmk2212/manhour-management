// ============================================
// merge-core.js — 差分マージ共通基盤
//   バックアップJSON / Excel 双方から使う、エンティティ非依存の
//   差分エンジン・プレビューモーダル・確定処理・undo ペイロード生成。
//   仕様書: docs/superpowers/specs/2026-06-15-backup-json-merge-design.md
// ============================================

import { pushAction } from './history.js';
import { saveData, autoBackup } from './storage.js';
import { showAlert } from './utils.js';

// --- 軽量 DOM ヘルパー（excel-import.js と同等。XSS 安全に textContent を使用） ---
export function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('data-') || k.startsWith('aria-')) e.setAttribute(k, v);
        else e[k] = v;
    }
    const list = Array.isArray(children) ? children : [children];
    for (const c of list) {
        if (c == null) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
}

// --- 比較正規化（既知の重複検出バグを根治）---
//   null/undefined → ''、NFKC 正規化（全角空白等を吸収）、trim
export function s(v) { return v == null ? '' : String(v).normalize('NFKC').trim(); }

// 日付を 'YYYY-MM-DD' に正規化（time 部・Date 型の揺れを吸収）
export function normalizeDate(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const str = String(value).trim();
    const m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return str;
}

// 工数等の数値を小数2桁に丸めて比較（浮動小数誤差を吸収）
export function roundNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * 差分検出（汎用）。既存側を greedy に 1:1 で消費し、未消費の既存を removed とする。
 * @param {Array} incoming 取込側レコード
 * @param {Array} existing 現在側レコード
 * @param {{keyOf:Function, valueEq:Function, emitChanged:boolean}} spec
 * @returns {{added:Array, changed:Array<{existing,incoming}>, unchanged:Array<{existing,incoming}>, removed:Array}}
 */
export function detectDiff(incoming, existing, spec) {
    const { keyOf, valueEq, emitChanged } = spec;
    const added = [], changed = [], unchanged = [], removed = [];
    const existingByKey = new Map();
    existing.forEach((rec, idx) => {
        const k = keyOf(rec);
        if (!existingByKey.has(k)) existingByKey.set(k, []);
        existingByKey.get(k).push({ idx, rec });
    });
    const consumed = new Set();
    for (const inc of (incoming || [])) {
        const k = keyOf(inc);
        const bucket = existingByKey.get(k);
        let matched = null;
        if (bucket) {
            for (const e of bucket) { if (!consumed.has(e.idx)) { matched = e; break; } }
        }
        if (matched) {
            consumed.add(matched.idx);
            if (emitChanged && !valueEq(matched.rec, inc)) {
                changed.push({ existing: matched.rec, incoming: inc });
            } else {
                unchanged.push({ existing: matched.rec, incoming: inc });
            }
        } else {
            added.push(inc);
        }
    }
    existing.forEach((rec, idx) => { if (!consumed.has(idx)) removed.push(rec); });
    return { added, changed, unchanged, removed };
}

// ============================================
// プレビューモーダル（動的生成・エンティティ非依存）
// ============================================

let previewState = null;

// レコード系セクションの値フィールドを文字列化
function fmtField(field, rec) {
    const raw = rec ? rec[field.key] : undefined;
    if (typeof field.format === 'function') return field.format(raw, rec);
    if (Array.isArray(raw)) return raw.join(', ');
    if (raw == null || raw === '') return '—';
    return String(raw);
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

function buildRowIdentity(section, rec) {
    return el('div', { class: 'excel-import-row-id' },
        section.keyFields.map(f => el('span', { class: 'key-part', text: s(rec[f]) || '—' }))
    );
}

function buildCompareSide(label, section, rec, sideClass, changedKeys) {
    const rows = section.compareFields.map(field =>
        el('div', { class: `excel-import-field-row ${changedKeys.has(field.key) ? 'changed' : ''}` }, [
            el('span', { class: 'name', text: field.label }),
            el('span', { class: 'val', text: fmtField(field, rec) })
        ])
    );
    return el('div', { class: `excel-import-compare-side ${sideClass}` }, [
        el('div', { class: 'excel-import-compare-side-label', text: label }),
        ...rows
    ]);
}

function buildConflictCard(section, index, pair, decision) {
    const { existing, incoming } = pair;
    const changedKeys = new Set();
    for (const field of section.compareFields) {
        if (s(existing[field.key]) !== s(incoming[field.key]) &&
            String(fmtField(field, existing)) !== String(fmtField(field, incoming))) {
            changedKeys.add(field.key);
        }
    }
    return el('div', {
        class: 'excel-import-compare-card',
        'data-state': decision,
        'data-section': section.id,
        'data-index': String(index),
        'data-row-kind': 'changed'
    }, [
        el('div', { class: 'excel-import-compare-header' }, [
            buildRowIdentity(section, incoming),
            buildChoiceGroup(`chg_${section.id}_${index}`, decision, [
                { value: 'overwrite', label: '上書き', className: 'is-overwrite' },
                { value: 'keep', label: '維持', className: 'is-skip' }
            ])
        ]),
        el('div', { class: 'excel-import-compare-body' }, [
            buildCompareSide('既存', section, existing, 'existing', changedKeys),
            el('div', { class: 'excel-import-compare-arrow', text: '→' }),
            buildCompareSide('取込', section, incoming, 'incoming', changedKeys)
        ])
    ]);
}

// セクション本体（チップ ON 時に表示）
// 1レコードを「キー識別 + 値フィールド」の1行で表示
function buildCompactRow(section, rec) {
    const idParts = (section.keyFields || []).map(f => s(rec[f]) || '—').join(' / ');
    const vals = (section.compareFields || []).map(fld => `${fld.label} ${fmtField(fld, rec)}`).join(' ・ ');
    return el('div', { class: 'merge-compact-row' }, [
        el('span', { class: 'merge-compact-id', text: idParts || '(キーなし)' }),
        vals ? el('span', { class: 'merge-compact-val', text: vals }) : null
    ]);
}

// 追加/削除レコードの内容を折りたたみ(<details>)で一覧表示。件数が多い場合は先頭のみ
function buildRecordListDetails(section, records, labelText) {
    const det = el('details', { class: 'merge-record-details' });
    if (records.length <= 5) det.open = true;
    det.appendChild(el('summary', { class: 'merge-record-summary', text: `${labelText} ${records.length} 件の内容を表示` }));
    const box = el('div', { class: 'merge-record-list' });
    const MAX = 200;
    records.slice(0, MAX).forEach(r => box.appendChild(buildCompactRow(section, r)));
    if (records.length > MAX) {
        box.appendChild(el('div', { class: 'excel-import-muted-note', text: `…ほか ${records.length - MAX} 件（全 ${records.length} 件中先頭 ${MAX} 件を表示）` }));
    }
    det.appendChild(box);
    return det;
}

function buildSectionBody(section) {
    const frag = document.createDocumentFragment();

    if (section.kind === 'toggle') {
        const cb = el('input', { type: 'checkbox', 'data-toggle-section': section.id });
        cb.checked = !!section.toggleOn;
        frag.appendChild(el('label', { class: 'excel-import-bulk-bar' }, [
            cb, el('span', { class: 'excel-import-bulk-label', text: `${section.label}を取り込む（現在の値を上書き）` })
        ]));
        return frag;
    }
    if (section.kind === 'historyAppend') {
        const cb = el('input', { type: 'checkbox', 'data-toggle-section': section.id });
        cb.checked = !!section.toggleOn;
        frag.appendChild(el('label', { class: 'excel-import-bulk-bar' }, [
            cb, el('span', { class: 'excel-import-bulk-label', text: `${section.label} ${section.incomingNew} 件を追加で取り込む` })
        ]));
        return frag;
    }

    // records
    const d = section.diff;
    // changed: 行単位
    if (section.allowOverwrite && d.changed.length > 0) {
        frag.appendChild(el('div', { class: 'excel-import-section-title', text: `変更 ${d.changed.length} 件の処理を選択` }));
        frag.appendChild(el('div', { class: 'excel-import-bulk-bar' }, [
            el('div', { class: 'excel-import-bulk-label', text: '一括設定' }),
            buildChoiceGroup(`bulk_${section.id}`, section.bulk, [
                { value: 'overwrite', label: '全て上書き', className: 'is-overwrite' },
                { value: 'keep', label: '全て維持', className: 'is-skip' },
                { value: 'individual', label: '個別判断' }
            ])
        ]));
        for (let i = 0; i < d.changed.length; i++) {
            frag.appendChild(buildConflictCard(section, i, d.changed[i], section.changedDecisions[i]));
        }
    }
    // added: 件数＋一括
    if (d.added.length > 0) {
        frag.appendChild(el('label', { class: 'excel-import-bulk-bar', 'data-added-bar': section.id }, [
            el('input', { type: 'checkbox', 'data-added-section': section.id, checked: section.addedOn }),
            el('span', { class: 'excel-import-bulk-label', text: `追加する ${d.added.length} 件を取り込む` })
        ]));
        frag.appendChild(buildRecordListDetails(section, d.added, '追加'));
    }
    // removed: 件数＋一括（既定は保持）
    if (d.removed.length > 0) {
        frag.appendChild(el('div', { class: 'excel-import-bulk-bar' }, [
            el('div', { class: 'excel-import-bulk-label', text: `現在のデータにのみ存在 ${d.removed.length} 件（読み込むファイルには無い）` }),
            buildChoiceGroup(`rmv_${section.id}`, section.removedBulk, [
                { value: 'keep', label: '保持', className: 'is-skip' },
                { value: 'delete', label: '削除', className: 'is-overwrite' }
            ])
        ]));
        frag.appendChild(buildRecordListDetails(section, d.removed, '現在のデータのみ'));
    }
    // unchanged: 件数のみ
    if (d.unchanged.length > 0) {
        frag.appendChild(el('div', { class: 'excel-import-muted-note', text: `変更なし ${d.unchanged.length} 件` }));
    }
    return frag;
}

function buildSectionChip(section) {
    const cb = el('input', { type: 'checkbox', 'data-sheet-checkbox': section.id });
    cb.checked = section.on;
    const counts = el('div', { class: 'excel-import-sheet-chip-counts' });
    if (section.kind === 'records') {
        const d = section.diff;
        if (d.added.length) counts.appendChild(el('span', { class: 'excel-import-tag-add', text: `追加 ${d.added.length}` }));
        if (d.changed.length) counts.appendChild(el('span', { class: 'excel-import-tag-conflict', text: `変更 ${d.changed.length}` }));
        if (d.removed.length) counts.appendChild(el('span', { class: 'excel-import-tag-skip', text: `現在のみ ${d.removed.length}` }));
        if (d.unchanged.length) counts.appendChild(el('span', { class: 'excel-import-tag-skip', text: `変更なし ${d.unchanged.length}` }));
        if (!d.added.length && !d.changed.length && !d.removed.length) {
            counts.appendChild(el('span', { class: 'excel-import-tag-skip', text: '差分なし' }));
        }
    } else {
        counts.appendChild(el('span', { class: 'excel-import-tag-add', text: section.present ? '取込可' : 'なし' }));
    }
    return el('label', { class: `excel-import-sheet-chip ${section.on ? '' : 'disabled'}`, 'data-sheet': section.id }, [
        cb,
        el('div', { class: 'excel-import-sheet-chip-body' }, [
            el('div', { class: 'excel-import-sheet-chip-name', text: section.label }),
            counts
        ])
    ]);
}

// セクションごとの反映件数を算出
function sectionCounts(section) {
    if (!section.on) return { add: 0, overwrite: 0, del: 0, skip: 0 };
    if (section.kind === 'toggle') return { add: section.toggleOn ? 1 : 0, overwrite: 0, del: 0, skip: 0 };
    if (section.kind === 'historyAppend') return { add: section.toggleOn ? section.incomingNew : 0, overwrite: 0, del: 0, skip: 0 };
    const d = section.diff;
    const add = section.addedOn ? d.added.length : 0;
    let overwrite = 0, keep = 0;
    if (section.allowOverwrite) {
        for (const dec of section.changedDecisions) { if (dec === 'overwrite') overwrite++; else keep++; }
    }
    let del = 0;
    if (section.removedBulk === 'delete') del = d.removed.length;
    return { add, overwrite, del, skip: keep + d.unchanged.length };
}

function computeSummary() {
    const sum = { total: 0, add: 0, overwrite: 0, del: 0, skip: 0 };
    for (const sec of previewState.sections) {
        const c = sectionCounts(sec);
        sum.add += c.add; sum.overwrite += c.overwrite; sum.del += c.del; sum.skip += c.skip;
    }
    sum.total = sum.add + sum.overwrite + sum.del;
    return sum;
}

function refreshSummaryUI() {
    const root = previewState.root;
    const s2 = computeSummary();
    const set = (field, val) => { const el2 = root.querySelector(`[data-field="${field}"]`); if (el2) el2.textContent = val; };
    set('total', s2.total); set('add', s2.add); set('overwrite', s2.overwrite); set('del', s2.del); set('skip', s2.skip);
    const footer = root.querySelector('#mergeFooterCount');
    if (footer) footer.textContent = s2.total;
    const btn = root.querySelector('#btnConfirmMerge');
    if (btn) { btn.textContent = `マージ（${s2.total}件）`; btn.disabled = s2.total === 0; }
}

function buildStat(kind, label, field) {
    return el('div', { class: 'excel-import-stat', 'data-kind': kind }, [
        el('div', { class: 'excel-import-stat-label', text: label }),
        el('div', { class: 'excel-import-stat-value', 'data-field': field, text: '0' })
    ]);
}

function closeMergePreview() {
    if (previewState && previewState.root) previewState.root.style.display = 'none';
    previewState = null;
}

/**
 * マージ確認モーダルを開く。
 * @param {Array} sections - セクション定義（records / toggle / historyAppend）
 * @param {{fileName:string, sourceLabel:string}} opts
 */
export function openMergePreview(sections, opts = {}) {
    // セクションに decision 初期値を付与
    for (const sec of sections) {
        sec.on = sec.on !== false;
        if (sec.kind === 'records') {
            sec.bulk = 'overwrite';
            sec.changedDecisions = (sec.diff.changed || []).map(() => 'overwrite');
            sec.addedOn = true;
            sec.removedBulk = 'keep';
        } else {
            sec.toggleOn = false; // 設定系・履歴は既定 OFF
            if (sec.kind === 'historyAppend') sec.incomingNew = sec.incomingNew || 0;
        }
    }

    const root = getOrCreateModal();
    previewState = { sections, root, fileName: opts.fileName || '', sourceLabel: opts.sourceLabel || '', afterApply: opts.afterApply || null };

    root.querySelector('#mergeFileName').textContent = opts.fileName || '';
    root.querySelector('#mergeSourceLabel').textContent = opts.sourceLabel || 'バックアップ';

    const chips = root.querySelector('#mergeSheets');
    chips.textContent = '';
    const body = root.querySelector('#mergeSections');
    body.textContent = '';
    for (const sec of sections) {
        chips.appendChild(buildSectionChip(sec));
        const wrap = el('div', { class: 'merge-section-block', 'data-section-block': sec.id }, [
            el('div', { class: 'excel-import-section-title', text: sec.label }),
            el('div', { class: 'merge-section-content', 'data-section-content': sec.id }, [buildSectionBody(sec)])
        ]);
        if (!sec.on) wrap.style.display = 'none';
        body.appendChild(wrap);
    }

    attachHandlers();
    refreshSummaryUI();
    root.style.display = 'flex';
    root.tabIndex = -1;
    root.focus();
}

// モーダル DOM を一度だけ生成して使い回す
function getOrCreateModal() {
    let root = document.getElementById('mergePreviewModal');
    if (root) return root;
    root = el('div', { id: 'mergePreviewModal', class: 'modal excel-import-modal' }, [
        el('div', { class: 'modal-content excel-import-modal-content' }, [
            el('div', { class: 'modal-header excel-import-header' }, [
                el('div', { class: 'excel-import-header-body' }, [
                    el('h3', { class: 'excel-import-title', text: '取り込み内容の確認' }),
                    el('div', { class: 'excel-import-subtitle' }, [
                        el('span', { id: 'mergeSourceLabel', text: 'バックアップ' }),
                        document.createTextNode(' '),
                        el('span', { class: 'excel-import-filename', id: 'mergeFileName' })
                    ])
                ]),
                el('button', { class: 'modal-close', id: 'btnCloseMerge', text: '×' })
            ]),
            el('div', { class: 'modal-body excel-import-body' }, [
                el('div', { class: 'excel-import-big-summary', id: 'mergeSummary' }, [
                    buildStat('total', '反映予定', 'total'),
                    buildStat('add', '追加', 'add'),
                    buildStat('overwrite', '上書き', 'overwrite'),
                    buildStat('skip', '削除', 'del'),
                    buildStat('skip', '維持/同一', 'skip')
                ]),
                el('div', { class: 'excel-import-sheets', id: 'mergeSheets' }),
                el('div', { id: 'mergeSections' })
            ]),
            el('div', { class: 'modal-footer excel-import-footer' }, [
                el('label', { class: 'excel-import-footer-info', style: 'display:flex;align-items:center;gap:8px;' }, [
                    (() => { const cb = el('input', { type: 'checkbox', id: 'mergePreBackup' }); cb.checked = true; return cb; })(),
                    el('span', { text: 'マージ前に現在のデータをバックアップ' })
                ]),
                el('div', { class: 'excel-import-footer-actions' }, [
                    el('span', { class: 'excel-import-footer-info' }, [
                        document.createTextNode('反映 '),
                        el('strong', { id: 'mergeFooterCount', text: '0' }),
                        document.createTextNode(' 件')
                    ]),
                    el('button', { class: 'btn', id: 'btnCancelMerge', text: 'キャンセル' }),
                    el('button', { class: 'btn btn-primary', id: 'btnConfirmMerge', text: 'マージ' })
                ])
            ])
        ])
    ]);
    document.body.appendChild(root);
    // 背景クリックで閉じる
    root.addEventListener('mousedown', (e) => { if (e.target === root) closeMergePreview(); });
    return root;
}

function findSection(id) { return previewState.sections.find(s2 => s2.id === id); }

function attachHandlers() {
    const root = previewState.root;
    root.querySelector('#btnCloseMerge').onclick = closeMergePreview;
    root.querySelector('#btnCancelMerge').onclick = closeMergePreview;
    root.onkeydown = (e) => { if (e.key === 'Escape') closeMergePreview(); };

    // セクション ON/OFF チップ
    root.querySelectorAll('input[data-sheet-checkbox]').forEach(input => {
        input.onchange = (e) => {
            const sec = findSection(e.target.dataset.sheetCheckbox);
            sec.on = e.target.checked;
            const chip = e.target.closest('.excel-import-sheet-chip');
            if (chip) chip.classList.toggle('disabled', !sec.on);
            const block = root.querySelector(`[data-section-block="${sec.id}"]`);
            if (block) block.style.display = sec.on ? '' : 'none';
            refreshSummaryUI();
        };
    });

    // 変更: 一括トグル
    root.querySelectorAll('input[name^="bulk_"]').forEach(input => {
        input.onchange = (e) => {
            const id = e.target.name.slice('bulk_'.length);
            const sec = findSection(id);
            sec.bulk = e.target.value;
            if (e.target.value !== 'individual') {
                for (let i = 0; i < sec.changedDecisions.length; i++) sec.changedDecisions[i] = e.target.value;
                root.querySelectorAll(`.excel-import-compare-card[data-section="${id}"]`).forEach(card => {
                    const idx = Number(card.dataset.index);
                    card.dataset.state = sec.changedDecisions[idx];
                    const rb = card.querySelector(`input[value="${sec.changedDecisions[idx]}"]`);
                    if (rb) rb.checked = true;
                });
            }
            refreshSummaryUI();
        };
    });

    // 変更: 個別トグル
    root.querySelectorAll('.excel-import-compare-card[data-row-kind="changed"]').forEach(card => {
        const id = card.dataset.section;
        const idx = Number(card.dataset.index);
        card.querySelectorAll(`input[name="chg_${id}_${idx}"]`).forEach(input => {
            input.onchange = (e) => {
                const sec = findSection(id);
                sec.changedDecisions[idx] = e.target.value;
                card.dataset.state = e.target.value;
                if (sec.bulk !== 'individual') {
                    sec.bulk = 'individual';
                    const indRb = root.querySelector(`input[name="bulk_${id}"][value="individual"]`);
                    if (indRb) indRb.checked = true;
                }
                refreshSummaryUI();
            };
        });
    });

    // 追加: 一括チェック
    root.querySelectorAll('input[data-added-section]').forEach(input => {
        input.onchange = (e) => { findSection(e.target.dataset.addedSection).addedOn = e.target.checked; refreshSummaryUI(); };
    });

    // 削除(現在のみ): 保持/削除
    root.querySelectorAll('input[name^="rmv_"]').forEach(input => {
        input.onchange = (e) => { findSection(e.target.name.slice('rmv_'.length)).removedBulk = e.target.value; refreshSummaryUI(); };
    });

    // 設定系トグル
    root.querySelectorAll('input[data-toggle-section]').forEach(input => {
        input.onchange = (e) => { findSection(e.target.dataset.toggleSection).toggleOn = e.target.checked; refreshSummaryUI(); };
    });

    root.querySelector('#btnConfirmMerge').onclick = applyMerge;
}

// 標準の view 再描画群（storage.js 復元末尾と同じ）
function refreshAllViews() {
    const fns = [
        'applyTheme', 'applyLayoutSettings', 'updateMonthOptions', 'setDefaultReportMonth',
        'updateEstimateMonthOptions', 'updateEstimateVersionOptions', 'setDefaultEstimateMonth',
        'updateActualMonthOptions', 'updateMemberOptions', 'updateQuickTaskList',
        'renderEstimateList', 'renderActualList', 'renderTodayActuals', 'updateReport',
        'renderCompanyHolidayList', 'renderScheduleView'
    ];
    for (const name of fns) {
        if (typeof window[name] === 'function') { try { window[name](); } catch { /* ignore */ } }
    }
}

/**
 * 確定処理。各セクションの apply フック経由で State を更新し、undo 用の差分を集約する。
 */
function applyMerge() {
    if (!previewState) return;
    const root = previewState.root;
    const preBackup = root.querySelector('#mergePreBackup');
    if (preBackup && preBackup.checked) {
        try { autoBackup(); } catch { /* ignore */ }
    }

    const entities = {};   // { field: { added:[], overwritten:[{before,after}], removed:[] } }
    const toggles = {};    // { field: {before, after} }
    const historyChange = null;

    for (const sec of previewState.sections) {
        if (!sec.on) continue;
        if (sec.kind === 'records') {
            const ch = { added: [], overwritten: [], removed: [] };
            const d = sec.diff;
            if (sec.addedOn) {
                for (const rec of d.added) { const added = sec.apply.add(rec); ch.added.push(added); }
            }
            if (sec.allowOverwrite) {
                for (let i = 0; i < d.changed.length; i++) {
                    if (sec.changedDecisions[i] === 'overwrite') {
                        const res = sec.apply.overwrite(d.changed[i].existing, d.changed[i].incoming);
                        if (res) ch.overwritten.push(res); // {before, after}
                    }
                }
            }
            if (sec.removedBulk === 'delete') {
                for (const rec of d.removed) { sec.apply.remove(rec); ch.removed.push(rec); }
            }
            if (ch.added.length || ch.overwritten.length || ch.removed.length) entities[sec.field] = ch;
        } else if (sec.kind === 'toggle' && sec.toggleOn) {
            const res = sec.apply.toggle();   // returns {field, before, after} or null
            if (res) toggles[res.field] = { before: res.before, after: res.after };
        } else if (sec.kind === 'historyAppend' && sec.toggleOn) {
            if (typeof sec.apply.append === 'function') {
                const res = sec.apply.append();
                if (res && res.field) toggles[res.field] = { before: res.before, after: res.after };
            }
        }
    }

    // ID 再採番など（merge-json が渡すコールバック）
    if (previewState.afterApply) { try { previewState.afterApply(entities, toggles); } catch { /* ignore */ } }

    // undo 登録（差分のみ）
    if (Object.keys(entities).length || Object.keys(toggles).length) {
        pushAction({
            type: 'data_merge',
            description: `${previewState.sourceLabel || 'バックアップ'}をマージ`,
            data: { source: 'json', entities, toggles }
        });
    }

    saveData(true);

    const sum = computeSummary();
    closeMergePreview();
    refreshAllViews();
    showAlert(`${sum.total} 件を取り込みました`, true);
}

console.log('✅ モジュール merge-core.js loaded');
