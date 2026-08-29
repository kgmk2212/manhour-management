// ============================================
// 実績の一括変更 — UI（選択状態・選択バー・条件で選択・一括編集/複製モーダル）
//   純粋ロジックは js/actual-bulk-core.js
// ============================================

import {
    actuals,
    actualSelectionMode, setActualSelectionMode, selectedActualIds,
} from './state.js';
import { formatHours } from './utils.js';

const $ = (id) => document.getElementById(id);

// ============================================
// 選択状態
// ============================================

/** 表示中の一覧行を DOM 順で返す（Shift 範囲選択と全選択に使う） */
function visibleRowIds() {
    return [...document.querySelectorAll('#actualList tr[data-actual-id]')].map(tr => Number(tr.dataset.actualId));
}

let lastClickedId = null;

/** 選択モードのオン/オフ。オフで選択もクリア */
export function toggleActualSelectionMode() {
    setActualSelectionMode(!actualSelectionMode);
    selectedActualIds.clear();
    lastClickedId = null;
    closeActualConditionPopover();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    updateActualSelectionUI();
}

/**
 * 一覧の行クリック。Shift で直前クリック行との範囲選択
 * @param {number} id
 * @param {MouseEvent} [event]
 */
export function toggleActualSelection(id, event) {
    if (!actualSelectionMode) return;
    if (event) event.stopPropagation();
    const ids = visibleRowIds();
    if (event && event.shiftKey && lastClickedId !== null && ids.includes(lastClickedId) && ids.includes(id)) {
        const [a, b] = [ids.indexOf(lastClickedId), ids.indexOf(id)].sort((x, y) => x - y);
        ids.slice(a, b + 1).forEach(x => selectedActualIds.add(x));
    } else if (selectedActualIds.has(id)) {
        selectedActualIds.delete(id);
    } else {
        selectedActualIds.add(id);
    }
    lastClickedId = id;
    updateActualSelectionUI();
}

/** ヘッダーの ✓: 表示中を全選択／全解除 */
export function toggleAllVisibleActuals(event) {
    if (event) event.stopPropagation();
    const ids = visibleRowIds();
    const all = ids.length > 0 && ids.every(x => selectedActualIds.has(x));
    ids.forEach(x => all ? selectedActualIds.delete(x) : selectedActualIds.add(x));
    updateActualSelectionUI();
}

export function clearActualSelection() {
    selectedActualIds.clear();
    lastClickedId = null;
    updateActualSelectionUI();
}

/**
 * id 群を選択に加える（タイムライン・条件から使う）
 * @param {number[]} ids
 * @param {{ replace?: boolean }} [opt] true なら現在の選択を置き換える
 */
export function selectActualIds(ids, { replace = false } = {}) {
    if (replace) selectedActualIds.clear();
    ids.forEach(x => selectedActualIds.add(Number(x)));
    updateActualSelectionUI();
}

export function deselectActualIds(ids) {
    ids.forEach(x => selectedActualIds.delete(Number(x)));
    updateActualSelectionUI();
}

/** 選択中の実績レコード（存在しない id は無視） */
export function getSelectedActuals() {
    return actuals.filter(a => selectedActualIds.has(a.id));
}

/** 選択バー・一覧の行・タイムラインのバーの見た目を状態に合わせる（再描画はしない） */
export function updateActualSelectionUI() {
    const viewType = $('actualViewType')?.value;
    const selected = getSelectedActuals();
    const n = selected.length;

    // 実在しない id を掃除
    const alive = new Set(actuals.map(a => a.id));
    [...selectedActualIds].forEach(x => { if (!alive.has(x)) selectedActualIds.delete(x); });

    const tray = $('actualSelectionTray');
    if (tray) tray.style.display = (actualSelectionMode || viewType === 'timeline') ? 'flex' : 'none';

    const modeBtn = $('btnActualSelectionMode');
    if (modeBtn) {
        modeBtn.classList.toggle('is-on', actualSelectionMode);
        modeBtn.textContent = actualSelectionMode ? '✓ 選択モード' : '選択モード';
        modeBtn.style.display = viewType === 'timeline' ? 'none' : '';
    }

    const count = $('actualSelectionCount');
    if (count) {
        count.innerHTML = n
            ? `${n} 件選択中<span class="bk-bar-sub"> · 合計 ${formatHours(selected.reduce((s, a) => s + a.hours, 0))}h</span>`
            : `0 件選択中<span class="bk-bar-sub"> · ${viewType === 'timeline' ? 'バーをクリックして選択' : '行をクリックして選択'}</span>`;
    }
    ['btnBulkActualEdit', 'btnBulkActualCopy', 'btnBulkActualDelete', 'btnBulkActualClear'].forEach(id => { const b = $(id); if (b) b.disabled = n === 0; });

    // 一覧の行
    document.querySelectorAll('#actualList tr[data-actual-id]').forEach(tr => {
        const on = selectedActualIds.has(Number(tr.dataset.actualId));
        tr.classList.toggle('is-selected', on);
        const cb = tr.querySelector('input.bk-cb'); if (cb) cb.checked = on;
    });
    const all = $('actualSelectAll');
    if (all) { const ids = visibleRowIds(); all.checked = ids.length > 0 && ids.every(x => selectedActualIds.has(x)); }

    // タイムラインのバー（全 id が選択済みなら selected）
    document.querySelectorAll('.actual-tl-bar.actual[data-actual-ids]').forEach(bar => {
        const ids = bar.dataset.actualIds.split(',').map(Number);
        bar.classList.toggle('selected', ids.length > 0 && ids.every(x => selectedActualIds.has(x)));
    });
}

// ============================================
// 条件で選択（Task 6 で実装。ここでは閉じる関数のみ）
// ============================================

export function closeActualConditionPopover() {
    const pop = $('actualConditionPopover');
    if (pop) pop.style.display = 'none';
    const b = $('btnBulkActualCondition'); if (b) b.classList.remove('is-on');
}

console.log('✅ モジュール actual-bulk.js loaded');
