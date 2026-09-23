// ============================================
// 割り込みドロップ（重なる位置へのドロップで後ろの予定を押し出す）
// 設計: docs/superpowers/specs/2026-09-24-schedule-lanes-and-insert-drop-design.md §③④
// ============================================

import { SCHEDULE } from './constants.js';
import { getNextBusinessDay, findLinkedBackSchedule, endDateForStart } from './schedule.js';
import { calculateSegments } from './schedule-interruption.js';
import { escapeHtml } from './utils.js';

/** 押し出しの連鎖の上限（データ異常時の無限ループ防止） */
const MAX_PUSH_STEPS = 1000;

/**
 * 予定が実際に占める期間の一覧（分割予定はセグメントごと）
 * @param {Object} schedule
 * @returns {Array<{start: string, end: string}>}
 */
function spansOf(schedule) {
    if ((schedule.interruptions || []).length > 0) {
        return calculateSegments(schedule).map(seg => ({ start: seg.startDate, end: seg.endDate }));
    }
    return [{ start: schedule.startDate, end: schedule.endDate }];
}

/**
 * 2つの予定の期間が1日でも重なるか（分割予定はセグメント単位で判定）
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
export function schedulesOverlap(a, b) {
    const sa = spansOf(a);
    const sb = spansOf(b);
    return sa.some(x => sb.some(y => x.start <= y.end && y.start <= x.end));
}

/** 開始日を差し替えた予定（終了日は休日・休暇・中断を考慮して再計算） */
function moveTo(schedule, startDate) {
    return { ...schedule, startDate, endDate: endDateForStart(schedule, startDate) };
}

/**
 * 予定 X を newStartDate へドロップしたときの割り込み計画を立てる（状態は変更しない）
 *
 * - 対象は X と同じ担当者の未完了の予定。完了済みは押さず、衝突相手にもしない
 * - X が移動前から重なっていた予定は「意図した並行」とみなして衝突にしない
 * - X より前に始まる予定の途中に落とした場合は、X をその予定の直後（翌営業日）に寄せる
 * - 新しく重なった予定は、ぶつかった相手の終了日の翌営業日へ押し、押した先でも同じ規則で連鎖させる
 *   （押された予定どうしも、元から重なっていた組は押さない）
 * - 連結中の後工程（IT→ST / PG→PT）は、前工程の新しい終了日の翌営業日へ追従させる
 *
 * @param {string} scheduleId - ドロップした予定の ID
 * @param {string} newStartDate - ドロップ先の開始日（YYYY-MM-DD）
 * @param {Object[]} allSchedules - 全スケジュール
 * @returns {{collided: boolean, placedStart: string, snappedAfterId: string|null, pushedCount: number,
 *            moves: {scheduleId: string, oldStartDate: string, oldEndDate: string,
 *                    newStartDate: string, newEndDate: string}[]}|null}
 *   collided=false のときは moves は空（通常の移動で足りる）
 */
export function planInsertDrop(scheduleId, newStartDate, allSchedules) {
    const x = allSchedules.find(s => s.id === scheduleId);
    if (!x) return null;

    const isActive = (s) => s.status !== SCHEDULE.STATUS.COMPLETED;
    const linkedOf = (s) => findLinkedBackSchedule(s, allSchedules);
    const xLinked = linkedOf(x);
    const peers = allSchedules.filter(s =>
        s.id !== x.id && s.member === x.member && isActive(s) && (!xLinked || s.id !== xLinked.id));

    let newX = moveTo(x, newStartDate);
    const conflicts = peers.filter(p => !schedulesOverlap(p, x) && schedulesOverlap(p, newX));
    if (conflicts.length === 0) {
        return { collided: false, placedStart: newStartDate, snappedAfterId: null, pushedCount: 0, moves: [] };
    }

    // 前から続いている予定の途中に落とした → その予定の直後へ寄せる
    let snappedAfterId = null;
    const preds = conflicts.filter(p => p.startDate < newX.startDate);
    if (preds.length > 0) {
        const last = preds.reduce((a, b) => (b.endDate > a.endDate ? b : a));
        snappedAfterId = last.id;
        newX = moveTo(x, getNextBusinessDay(last.endDate, x.member));
    }

    const original = new Map(allSchedules.map(s => [s.id, s]));
    const moved = new Map([[x.id, newX]]);
    const queue = [x.id];

    const follow = (front) => {
        const back = linkedOf(original.get(front.id));
        if (!back) return;
        const current = moved.get(back.id) || back;
        const start = getNextBusinessDay(front.endDate, back.member);
        if (current.startDate === start) return;
        moved.set(back.id, moveTo(back, start));
        queue.push(back.id);
    };
    follow(newX);

    let steps = 0;
    while (queue.length > 0 && steps++ < MAX_PUSH_STEPS) {
        const srcId = queue.shift();
        const src = moved.get(srcId);
        const srcOrig = original.get(srcId);
        peers.forEach(p => {
            if (p.id === srcId) return;
            const current = moved.get(p.id) || p;
            if (!schedulesOverlap(current, src)) return;
            if (schedulesOverlap(p, srcOrig)) return; // 元から並行していた組は押さない
            const start = getNextBusinessDay(src.endDate, p.member);
            if (current.startDate >= start) return;
            const next = moveTo(p, start);
            moved.set(p.id, next);
            queue.push(p.id);
            follow(next);
        });
    }

    const moves = [...moved.values()]
        .map(s => {
            const o = original.get(s.id);
            return {
                scheduleId: s.id,
                oldStartDate: o.startDate,
                oldEndDate: o.endDate,
                newStartDate: s.startDate,
                newEndDate: s.endDate
            };
        })
        .filter(m => m.newStartDate !== m.oldStartDate || m.newEndDate !== m.oldEndDate);

    return {
        collided: true,
        placedStart: newX.startDate,
        snappedAfterId,
        pushedCount: moves.filter(m => m.scheduleId !== x.id && (!xLinked || m.scheduleId !== xLinked.id)).length,
        moves
    };
}

// ============================================
// 重なり時メニュー（DOM）
// ============================================

let menuDocHandler = null;
let menuKeyHandler = null;

/** 割り込みメニューを閉じる */
export function closeInsertDropMenu() {
    if (menuDocHandler) {
        document.removeEventListener('mousedown', menuDocHandler, true);
        document.removeEventListener('touchstart', menuDocHandler, true);
        menuDocHandler = null;
    }
    if (menuKeyHandler) { document.removeEventListener('keydown', menuKeyHandler); menuKeyHandler = null; }
    const m = document.getElementById('insertDropMenu');
    if (m) m.remove();
}

/** YYYY-MM-DD → M/D */
function md(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}`;
}

/**
 * 重なる位置へのドロップで「割り込む／並行にする／キャンセル」を選ぶメニューを出す
 * @param {Object} params
 * @param {Object} params.schedule - ドロップした予定
 * @param {Object} params.plan - planInsertDrop の結果
 * @param {Object[]} params.allSchedules - 表示名の解決に使う全スケジュール
 * @param {number} params.x - 表示位置 clientX
 * @param {number} params.y - 表示位置 clientY
 * @param {Function} params.onInsert - 「割り込む」
 * @param {Function} params.onParallel - 「並行にする」
 * @param {Function} [params.onCancel] - キャンセル・Esc・外側クリック（ドラッグの仮表示を消す再描画など）
 */
export function showInsertDropMenu({ schedule, plan, allSchedules, x, y, onInsert, onParallel, onCancel = () => {} }) {
    closeInsertDropMenu();

    const byId = new Map(allSchedules.map(s => [s.id, s]));
    const pushed = plan.moves.filter(m => m.scheduleId !== schedule.id);
    const snapped = plan.snappedAfterId ? byId.get(plan.snappedAfterId) : null;
    const moveLines = pushed.map(m => {
        const s = byId.get(m.scheduleId);
        return `<li><span class="insert-drop-name">${escapeHtml(s.task)} ${escapeHtml(s.process)}</span>` +
            `<span class="insert-drop-date">${md(m.oldStartDate)} → ${md(m.newStartDate)}</span></li>`;
    }).join('');

    const menu = document.createElement('div');
    menu.className = 'schedule-ctx-menu insert-drop-menu';
    menu.id = 'insertDropMenu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
        <div class="schedule-ctx-head"><b>${escapeHtml(schedule.task)} ${escapeHtml(schedule.process)} を ${md(plan.placedStart)} から</b>
            <span>${snapped ? `${escapeHtml(snapped.task)} ${escapeHtml(snapped.process)} の後ろに入ります` : '同じ担当者の予定と重なります'}</span></div>
        <button type="button" class="schedule-ctx-item is-primary" data-act="insert">割り込む（後ろ ${plan.pushedCount} 件を押す）</button>
        ${moveLines ? `<ul class="insert-drop-moves">${moveLines}</ul>` : ''}
        <button type="button" class="schedule-ctx-item" data-act="parallel">並行にする（重ねて置く）</button>
        <div class="schedule-ctx-sep"></div>
        <button type="button" class="schedule-ctx-item" data-act="cancel">キャンセル</button>
    `;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;

    menu.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        closeInsertDropMenu();
        if (act === 'insert') onInsert();
        else if (act === 'parallel') onParallel();
        else onCancel();
    });
    menuDocHandler = (ev) => { if (!menu.contains(ev.target)) { closeInsertDropMenu(); onCancel(); } };
    // iOS Safari は空白部分のタップで mousedown を合成しないことがあるため touchstart でも閉じる
    document.addEventListener('mousedown', menuDocHandler, true);
    document.addEventListener('touchstart', menuDocHandler, { capture: true, passive: true });
    menuKeyHandler = (ev) => { if (ev.key === 'Escape') { closeInsertDropMenu(); onCancel(); } };
    document.addEventListener('keydown', menuKeyHandler);
}
