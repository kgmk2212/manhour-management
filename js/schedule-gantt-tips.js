// ============================================
// ガントの小さな吹き出し（省略された見出しの全文・担当者の帯のその日の予定一覧）
// PC はマウスを乗せている間、スマホはタップで出す。スクロールが始まったら閉じる。
// 設計: docs/superpowers/specs/2026-09-29-schedule-member-task-view-design.md
// ============================================

/** タップで出した吹き出しを自動で閉じるまでの時間 */
const TOUCH_TIP_TIMEOUT_MS = 4000;
/** 指がこれ以上動いた操作はスクロールとみなし、タップ扱いにしない */
export const TAP_SLOP_PX = 10;

let tipEl = null;
let tipKey = null;
let tipTimer = null;
let scrollHandlerBound = false;

function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.id = 'ganttTip';
    tipEl.className = 'gantt-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    if (!scrollHandlerBound) {
        // 縦（ページ）・横（ガント）どちらのスクロールでも閉じる。scroll は泡立たないので capture で拾う
        document.addEventListener('scroll', () => { if (tipKey !== null) hideGanttTip(); }, { capture: true, passive: true });
        scrollHandlerBound = true;
    }
    return tipEl;
}

/**
 * 吹き出しを出す
 * @param {Object} params
 * @param {string} params.key - 何に対する吹き出しか（同じ key の再タップで閉じる判定に使う）
 * @param {string} params.html - 中身（呼び出し側でエスケープ済みの HTML）
 * @param {{left: number, top: number, bottom: number}} params.anchor - 指す対象の画面座標
 * @param {boolean} [params.touch=false] - タップで出したなら true（一定時間で閉じる）
 */
export function showGanttTip({ key, html, anchor, touch = false }) {
    const el = ensureTip();
    el.innerHTML = html;
    el.hidden = false;
    tipKey = key;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - w - 8));
    const below = anchor.bottom + 4;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 4) : below;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    clearTimeout(tipTimer);
    if (touch) tipTimer = setTimeout(hideGanttTip, TOUCH_TIP_TIMEOUT_MS);
}

/** 吹き出しを閉じる */
export function hideGanttTip() {
    clearTimeout(tipTimer);
    tipKey = null;
    if (tipEl) tipEl.hidden = true;
}

/** @returns {string|null} いま出している吹き出しの key */
export function currentGanttTipKey() {
    return tipKey;
}

/**
 * 要素にタップ判定を付ける（指の移動が TAP_SLOP_PX 未満で離したときだけ onTap を呼ぶ）
 * @param {HTMLElement} el
 * @param {(touch: Touch) => void} onTap - 離した位置の Touch を渡す
 */
export function bindTap(el, onTap) {
    let start = null;
    let moved = false;
    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) { start = null; return; }
        start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        moved = false;
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
        if (!start || e.touches.length !== 1) return;
        const t = e.touches[0];
        if (Math.hypot(t.clientX - start.x, t.clientY - start.y) >= TAP_SLOP_PX) moved = true;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
        if (!start || moved) { start = null; return; }
        start = null;
        const t = e.changedTouches[0];
        if (t) onTap(t);
    }, { passive: true });
}
