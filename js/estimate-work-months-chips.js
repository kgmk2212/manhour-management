// ============================================
// 見積の作業月 UI — 案A: 月チップのレール
//   行の上に期間内の月を並べる。タップ = その月だけ、なぞる（pointerdown→move→up）= 範囲。
//   Shift+クリック / Shift+←→ で範囲を伸ばす。Space/Enter でフォーカス中の月だけにする。
//   連続して選ばれた月は 1 本のピルに見える（角丸を範囲の両端だけに付ける）。
//   移植元: mockups/estimate-work-months/a-month-chips.html
//   インターフェース: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md §3.1
// ============================================
import { buildCellFrame, fmtMonth } from './estimate-work-months.js';

/**
 * 行スロットにレールを描く
 * @param {HTMLElement} slot - td.wm-slot
 * @param {Object} view - WorkMonthView
 * @param {Object} actions - WorkMonthActions
 */
function render(slot, view, actions) {
    const control = buildCellFrame(slot, view, actions);
    const { months, selected, linked } = view;
    const on = new Set(selected);

    const rail = document.createElement('div');
    rail.className = 'wm-rail' + (linked ? ' is-linked' : '');
    rail.style.setProperty('--n', String(Math.max(months.length, 1)));
    rail.setAttribute('role', 'group');
    rail.setAttribute('aria-label', `${view.label} の作業月${linked ? '（工程に連動）' : ''}`);

    months.forEach((m, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wm-chip';
        b.dataset.m = m;
        b.textContent = fmtMonth(m);
        b.setAttribute('aria-pressed', String(on.has(m)));
        if (linked) { b.tabIndex = -1; b.setAttribute('aria-disabled', 'true'); }
        if (on.has(m)) {
            b.classList.add('is-on');
            if (!on.has(months[i - 1])) b.classList.add('is-start');
            if (!on.has(months[i + 1])) b.classList.add('is-end');
        }
        rail.appendChild(b);
    });
    control.appendChild(rail);
    if (!linked) wire(rail, slot, view, actions);
}

/**
 * レールの操作を結線する（なぞり・Shift・キーボード）
 * @param {HTMLElement} rail
 * @param {HTMLElement} slot
 * @param {Object} view
 * @param {Object} actions
 */
function wire(rail, slot, view, actions) {
    const { months, selected } = view;
    const idx = m => months.indexOf(m);
    const chips = () => Array.from(rail.querySelectorAll('.wm-chip'));
    const chipAt = x => {
        const r = rail.getBoundingClientRect();
        return Math.max(0, Math.min(months.length - 1, Math.floor((x - r.left) / (r.width / months.length))));
    };
    let anchor = -1;
    let live = null;

    const paint = (a, b) => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        chips().forEach((c, i) => {
            const onI = i >= lo && i <= hi;
            c.classList.toggle('is-on', onI);
            c.classList.toggle('is-start', onI && i === lo);
            c.classList.toggle('is-end', onI && i === hi);
        });
        live = [lo, hi];
    };
    /** 確定して描き直し、末尾の月にフォーカスを戻す */
    const commit = (lo, hi) => {
        actions.setMonths(months.slice(lo, hi + 1));
        slot.querySelector(`.wm-chip[data-m="${months[hi]}"]`)?.focus({ preventScroll: true });
    };
    const extendTo = j => {
        const cur = selected.map(idx).filter(i => i >= 0);
        if (!cur.length) { commit(j, j); return; }
        commit(Math.min(...cur, j), Math.max(...cur, j));
    };

    rail.addEventListener('pointerdown', e => {
        const c = e.target.closest('.wm-chip');
        if (!c) return;
        e.preventDefault();
        if (e.shiftKey) { extendTo(idx(c.dataset.m)); return; }
        anchor = idx(c.dataset.m);
        rail.setPointerCapture(e.pointerId);
        rail.classList.add('is-painting');
        paint(anchor, anchor);
    });
    rail.addEventListener('pointermove', e => {
        if (anchor < 0) return;
        paint(anchor, chipAt(e.clientX));
    });
    rail.addEventListener('pointerup', () => {
        if (anchor < 0 || !live) return;
        const [lo, hi] = live;
        anchor = -1;
        rail.classList.remove('is-painting');
        // DOM の差し替えは touchend が届いた後に回す（pointerup の中で差し替えると、
        // Chromium のタッチ操作で次のタップの click が合成されない）
        setTimeout(() => commit(lo, hi), 0);
    });
    rail.addEventListener('pointercancel', () => {
        if (anchor < 0) return;
        anchor = -1;
        rail.classList.remove('is-painting');
        // ブラウザがスクロールに取った: 塗りを捨てて確定前の状態に戻す
        setTimeout(() => actions.setMonths(selected), 0);
    });
    rail.addEventListener('keydown', e => {
        const c = e.target.closest('.wm-chip');
        if (!c) return;
        const i = idx(c.dataset.m);
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); commit(i, i); return; }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const j = Math.max(0, Math.min(months.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
            if (e.shiftKey) extendTo(j); else chips()[j]?.focus();
        }
    });
}

/** 案A レンダラ */
export const chipsRenderer = { id: 'chips', label: '月チップ（推奨）', render };

console.log('✅ モジュール estimate-work-months-chips.js loaded');
