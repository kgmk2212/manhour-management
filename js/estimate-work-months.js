// ============================================
// 見積の作業月 UI（4 方式切替）— 共通コントローラ
//   ・設定（localStorage 'manhour_estimateWorkMonthUi'）の読み書きと設定画面の select
//   ・レンダラ登録（chips / gantt / matrix。方式固有コードはここに書かない）
//   ・行状態を tr.dataset に持つ: data-wm-months / data-wm-linked / data-wm-manual / data-wm-opened
//   ・担当者行・レビュー行の「工程行への連動」、作業期間変更時のクランプ、保存ペイロード
//   estimate-add.js は isActive() のとき生成・プリフィル・読み取りをここへ委譲する。
// 設計: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md
// ============================================
import * as Core from './estimate-work-months-core.js';
import * as Utils from './utils.js';
import * as Estimate from './estimate.js';

const STORAGE_KEY = 'manhour_estimateWorkMonthUi';
const TABLE_ID = 'addEstimateTable';
const MOBILE_MAX_WIDTH = 768;

/** id → レンダラ { id, label, render(slotEl, view, actions), renderHeader?(thEl, view) } */
const renderers = new Map();

// ---------- 設定 ----------

/**
 * 方式レンダラを登録する（init.js からモジュール評価時に呼ぶ）
 * @param {{id: string, label: string, render: Function, renderHeader?: Function}} renderer
 */
export function registerRenderer(renderer) {
    if (!renderer || !renderer.id || typeof renderer.render !== 'function') return;
    renderers.set(renderer.id, renderer);
}

/**
 * 現在の方式キーを返す（不正値・未登録は chips、chips 未登録なら legacy）
 * @returns {string}
 */
export function getWorkMonthUiMode() {
    return Core.resolveMode(localStorage.getItem(STORAGE_KEY), [...renderers.keys()]);
}

/**
 * 方式キーを保存する（legacy または登録済みレンダラのみ）
 * @param {string} key
 */
export function setWorkMonthUiMode(key) {
    if (key === 'legacy' || renderers.has(key)) localStorage.setItem(STORAGE_KEY, key);
}

/** 新方式（legacy 以外）が有効か */
export function isActive() {
    return getWorkMonthUiMode() !== 'legacy';
}

/**
 * 設定画面の「見積の作業月 UI」select を初期化する（init.js から呼ぶ）。option はレンダラ登録から作る
 */
export function initWorkMonthUiSetting() {
    const select = document.getElementById('estimateWorkMonthUiSelect');
    if (!select) return;
    select.innerHTML = '';
    [...renderers.values()].forEach(r => select.appendChild(new Option(r.label, r.id)));
    select.appendChild(new Option('現状（開始〜終了の select）', 'legacy'));
    select.value = getWorkMonthUiMode();
    select.addEventListener('change', () => setWorkMonthUiMode(select.value));
}

// ---------- 行状態のヘルパ ----------

const isMobile = () => window.innerWidth <= MOBILE_MAX_WIDTH;
const table = () => document.getElementById(TABLE_ID);
const startEl = () => document.getElementById('addEstStartMonthMulti');
const endEl = () => document.getElementById('addEstEndMonth');
const periodMonths = () => Core.monthRange(startEl()?.value, endEl()?.value);
const allRows = () => [...(table()?.querySelectorAll('tbody tr[data-process]') || [])];
const isExtra = row => row.classList.contains('est-extra-member-row');
const primaryOf = row => table()?.querySelector(`tr[data-process="${row.dataset.process}"][data-primary="true"]`) || null;
const isLinked = row => isExtra(row) && row.dataset.wmLinked === '1';
const ownMonths = row => Core.parseMonths(row.dataset.wmMonths);
const effectiveMonths = row => isLinked(row) ? ownMonths(primaryOf(row) || row) : ownMonths(row);
const hoursInput = row => isExtra(row) ? row.querySelector('.est-extra-hours') : document.getElementById(`addEst${row.dataset.process}`);
const rowHours = row => Number(hoursInput(row)?.value) || 0;
const manualOf = row => {
    try { return row.dataset.wmManual ? JSON.parse(row.dataset.wmManual) : null; } catch { return null; }
};
const memberLabel = row => {
    const sel = isExtra(row) ? row.querySelector('.est-extra-member') : document.getElementById(`addEst${row.dataset.process}_member`);
    return `${row.dataset.process}${row.dataset.review === 'true' ? ' レビュー' : ''} ${sel?.value || ''}`.trim();
};

/** 'YYYY-MM' → '8月' */
export const fmtMonth = m => `${Number(m.slice(5))}月`;

/**
 * スロット（th/td）を「最後の列の前」に用意する。既存の data-work-month-col があれば再利用
 * @param {HTMLElement} rowOrHead
 * @param {'th'|'td'} tag
 */
function ensureSlot(rowOrHead, tag) {
    let cell = rowOrHead.querySelector('[data-work-month-col]');
    if (!cell) {
        cell = document.createElement(tag);
        cell.dataset.workMonthCol = 'true';
        rowOrHead.insertBefore(cell, rowOrHead.lastElementChild);
    }
    cell.classList.add('wm-slot');
    return cell;
}

/**
 * レンダラに渡す読み取り専用ビュー
 * @param {HTMLTableRowElement} row
 */
function buildView(row) {
    const months = periodMonths();
    const selected = effectiveMonths(row);
    const linked = isLinked(row);
    const manual = linked ? null : manualOf(row);
    const hours = rowHours(row);
    const useManual = !!manual && Core.serializeMonths(Object.keys(manual)) === Core.serializeMonths(selected);
    return {
        months, selected, linked, extra: isExtra(row), hours,
        monthly: useManual ? { ...manual } : Utils.splitHoursEvenly(hours, selected),
        manual: useManual, isMobile: isMobile(), label: memberLabel(row),
        clamped: row.dataset.wmClamped === '1',
    };
}

/**
 * レンダラに渡す操作。行状態を更新して当該行（主行なら連動行も）を描き直す
 * @param {HTMLTableRowElement} row
 */
function buildActions(row) {
    return {
        setMonths(months) {
            const { months: ms } = Core.clampMonths(months, periodMonths());
            row.dataset.wmMonths = Core.serializeMonths(ms);
            delete row.dataset.wmManual;
            delete row.dataset.wmClamped;
            renderRow(row);
            renderDependents(row);
        },
        setManual(monthly) {
            const ms = Object.keys(monthly || {}).filter(m => Number(monthly[m]) > 0).sort();
            if (!ms.length) { renderRow(row); return; }
            row.dataset.wmMonths = Core.serializeMonths(ms);
            row.dataset.wmManual = JSON.stringify(Object.fromEntries(ms.map(m => [m, Number(monthly[m])])));
            delete row.dataset.wmClamped;
            const total = Math.round(ms.reduce((a, m) => a + Number(monthly[m]), 0) * 100) / 100;
            const inp = hoursInput(row);
            if (inp) inp.value = total;
            if (typeof window.updateAddEstimateTotals === 'function') window.updateAddEstimateTotals();
            renderRow(row);
            renderDependents(row);
        },
        toggleLink() {
            if (!isExtra(row)) return;
            if (isLinked(row)) {
                row.dataset.wmMonths = Core.serializeMonths(effectiveMonths(row));
                delete row.dataset.wmLinked;
            } else {
                row.dataset.wmLinked = '1';
                delete row.dataset.wmManual;
            }
            renderRow(row);
        },
    };
}

const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M9 17H7A5 5 0 0 1 7 7h2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
const ICON_UNLINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7h1a5 5 0 0 1 0 10h-1"/><path d="M8 17H7A5 5 0 0 1 7 7h1"/><line x1="12" y1="9" x2="12" y2="15" stroke-dasharray="2 2"/></svg>';

/**
 * スロットの共通枠を作る（鎖ボタン or 空枠 ＋ 方式固有コントロールの入れ物）。レンダラが最初に呼ぶ
 * @param {HTMLElement} slot - td
 * @param {Object} view - buildView の結果
 * @param {Object} actions - buildActions の結果
 * @returns {HTMLElement} 方式固有コントロールを入れる要素
 */
export function buildCellFrame(slot, view, actions) {
    slot.innerHTML = '';
    const cell = document.createElement('div');
    cell.className = 'wm-cell';
    if (view.extra) {
        const proc = slot.closest('tr')?.dataset.process || '';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wm-link' + (view.linked ? '' : ' is-off');
        b.setAttribute('aria-pressed', String(view.linked));
        b.innerHTML = view.linked ? ICON_LINK : ICON_UNLINK;
        b.title = view.linked ? `${proc} の月に連動中（押すと個別に設定）` : `個別に設定中（押すと ${proc} の月に合わせる）`;
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', () => actions.toggleLink());
        cell.appendChild(b);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'wm-link-slot';
        spacer.setAttribute('aria-hidden', 'true');
        cell.appendChild(spacer);
    }
    const control = document.createElement('div');
    control.className = 'wm-control';
    cell.appendChild(control);
    if (view.manual) {
        const tag = document.createElement('span');
        tag.className = 'wm-manual-tag';
        tag.textContent = '手動配分';
        cell.appendChild(tag);
    }
    if (view.clamped) {
        const note = document.createElement('div');
        note.className = 'wm-note';
        note.textContent = '作業期間の外だった月を期間内に寄せました';
        cell.appendChild(note);
    }
    slot.appendChild(cell);
    return control;
}

/** 1 行のスロットを描く */
function renderRow(row) {
    const r = renderers.get(getWorkMonthUiMode());
    if (!r) return;
    const slot = ensureSlot(row, 'td');
    r.render(slot, buildView(row), buildActions(row));
}

/** 主行が変わったら、連動中の担当者行・レビュー行を描き直す */
function renderDependents(row) {
    if (isExtra(row)) return;
    allRows().filter(x => isExtra(x) && x.dataset.process === row.dataset.process && isLinked(x)).forEach(renderRow);
}

// ---------- estimate-add.js から呼ばれる入口 ----------

/**
 * 新方式ではラジオを「複数月」に固定し、ラジオ行を隠す。single だった場合は単一月 select の値を期間に写す
 * @returns {boolean} ラジオを切り替えたら true（呼び手が switchAddEstMonthType() を呼ぶ）
 */
export function forceMultiRadio() {
    if (!isActive()) return false;
    // ラジオ行は inline の display:flex を持つので hidden 属性では消えない。style で隠す（reset で戻す）
    const radioRow = document.getElementById('addEstMonthTypeRow');
    if (radioRow) radioRow.style.display = 'none';
    const single = document.querySelector('input[name="addEstMonthType"][value="single"]');
    const multi = document.querySelector('input[name="addEstMonthType"][value="multi"]');
    if (!single || !multi || !single.checked) return false;
    const m = document.getElementById('addEstStartMonth')?.value;
    if (m) {
        if (startEl()) startEl().value = m;
        Utils.generateMonthOptions('addEstEndMonth', m, Core.shiftMonth(m, -1));
        if (endEl()) endEl().value = m;
    }
    multi.checked = true;
    return true;
}

/**
 * 作業月スロット列を作る／外す（updateAddEstimateTableHeader からの委譲先）
 * @param {HTMLTableElement} tableEl
 * @param {boolean} show
 */
export function setupTable(tableEl, show) {
    const head = tableEl.querySelector('thead tr');
    if (!head) return;
    if (!show) {
        head.querySelector('[data-work-month-col]')?.remove();
        allRows().forEach(r => r.querySelector('[data-work-month-col]')?.remove());
        tableEl.classList.remove('wm-active');
        tableEl.closest('.modal-content')?.classList.remove('wm-active-modal');
        return;
    }
    // 終了月の option を「開始月以上」に（開始 = 終了 を許す。legacy は開始より後のみ）
    const s = startEl(), e = endEl();
    if (s?.value && e) {
        const keep = e.value && e.value >= s.value ? e.value : s.value;
        Utils.generateMonthOptions('addEstEndMonth', keep, Core.shiftMonth(s.value, -1));
        e.value = keep;
    }
    tableEl.classList.add('wm-active');
    tableEl.closest('.modal-content')?.classList.add('wm-active-modal');

    const r = renderers.get(getWorkMonthUiMode());
    const th = ensureSlot(head, 'th');
    th.innerHTML = '';
    if (r?.renderHeader) r.renderHeader(th, { months: periodMonths(), isMobile: isMobile() });
    else th.textContent = '作業月';

    const range = periodMonths();
    allRows().forEach(row => {
        if (row.dataset.wmMonths) {
            const { months, changed } = Core.clampMonths(ownMonths(row), range);
            if (changed) {
                row.dataset.wmMonths = Core.serializeMonths(months);
                delete row.dataset.wmManual;
                row.dataset.wmClamped = '1';
            }
        }
        if (isExtra(row) && !row.dataset.wmLinked && !row.dataset.wmMonths) row.dataset.wmLinked = '1';
    });
    applyDefaults(Estimate.calculateDefaultWorkMonths(s?.value, e?.value));
    allRows().forEach(renderRow);
    bindHoursInput(tableEl);
}

/** 時間 input が変わったら均等按分の表示を更新する（1 度だけ委譲登録） */
function bindHoursInput(tableEl) {
    if (tableEl.dataset.wmInputBound === '1') return;
    tableEl.dataset.wmInputBound = '1';
    tableEl.addEventListener('input', ev => {
        if (!tableEl.classList.contains('wm-active')) return;
        const target = ev.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'number' || target.closest('.wm-slot')) return;
        const row = target.closest('tr[data-process]');
        if (row) { renderRow(row); renderDependents(row); }
    });
}

/**
 * 既定の作業月（ウォーターフォール）を、月が未設定の主行にだけ入れる
 * @param {{process: string, startMonth: string, endMonth: string}[]} defaults
 */
export function applyDefaults(defaults) {
    (defaults || []).forEach(d => {
        const row = table()?.querySelector(`tr[data-process="${d.process}"][data-primary="true"]`);
        if (row && !row.dataset.wmMonths) row.dataset.wmMonths = Core.serializeMonths(Core.monthRange(d.startMonth, d.endMonth));
    });
}

/**
 * 追加担当者行・レビュー行が作られた／再確認されたとき（ensureExtraRowMonthCell からの委譲先）
 * @param {HTMLTableRowElement} row
 */
export function onRowAdded(row) {
    const t = table();
    if (!t || !t.classList.contains('wm-active') || !row) return;
    if (!row.dataset.wmLinked && !row.dataset.wmMonths) row.dataset.wmLinked = '1';
    renderRow(row);
}

/**
 * 既存見積の月をプリフィルする（prefillRowWorkMonths からの委譲先）
 * @param {HTMLTableRowElement} row
 * @param {string[]} workMonths
 * @param {Object<string, number>|null} monthlyHours
 */
export function setRowMonths(row, workMonths, monthlyHours = null) {
    const ms = [...(workMonths || [])].sort();
    if (!row || !ms.length) return;
    row.dataset.wmMonths = Core.serializeMonths(ms);
    row.dataset.wmOpened = row.dataset.wmMonths;
    delete row.dataset.wmManual;
    if (monthlyHours && !Core.isEvenSplit(monthlyHours, rowHours(row), ms, Utils.splitHoursEvenly)) {
        row.dataset.wmManual = JSON.stringify(monthlyHours);
    }
    if (isExtra(row)) {
        const p = primaryOf(row);
        const same = p && Core.serializeMonths(ownMonths(p)) === row.dataset.wmMonths;
        if (same && !row.dataset.wmManual) row.dataset.wmLinked = '1'; else delete row.dataset.wmLinked;
    }
    if (table()?.classList.contains('wm-active')) renderRow(row);
}

/**
 * 保存用に行の月を読む（computeRowWorkMonths からの委譲先）
 * @param {HTMLTableRowElement} row
 * @param {number} hours
 * @returns {{workMonth: string, workMonths: string[], monthlyHours: Object<string, number>}}
 */
export function readRow(row, hours) {
    if (!row) return { workMonth: '', workMonths: [], monthlyHours: {} };
    return Core.buildPayload({
        months: effectiveMonths(row),
        hours,
        manual: isLinked(row) ? null : manualOf(row),
        opened: Core.parseMonths(row.dataset.wmOpened),
        splitFn: Utils.splitHoursEvenly,
    });
}

/**
 * フォームリセット時に行状態とスロットを消す（resetAddEstimateForm からの委譲先）
 * @param {HTMLTableElement|null} tableEl
 */
export function reset(tableEl) {
    if (tableEl) setupTable(tableEl, false);
    allRows().forEach(r => ['wmMonths', 'wmLinked', 'wmManual', 'wmOpened', 'wmClamped'].forEach(k => delete r.dataset[k]));
    const radioRow = document.getElementById('addEstMonthTypeRow');
    if (radioRow) radioRow.style.display = 'flex';
}

console.log('✅ モジュール estimate-work-months.js loaded');
