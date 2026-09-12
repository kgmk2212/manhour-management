// ============================================
// 見積の作業月 UI — 案B: ミニガントのバー
//   月のマス目（トラック）の上に 1 本のバー。バー本体ドラッグ = 移動（長さ維持・端でクランプ）、
//   両端のつまみドラッグ = 開始／終了の伸縮、空いている月をタップ = そこまで広がる。
//   ←→ = 移動、Shift+←→ = 右端の伸縮。単一月のバーはラベルを詰める（.is-single）。
//   移植元: mockups/estimate-work-months/b-mini-gantt.html
//   インターフェース: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md §3.1
// ============================================
import { buildCellFrame, fmtMonth } from './estimate-work-months.js';

/** 'YYYY-MM'[] → '8月' または '8〜10月' の表示用範囲文字列（ms は 1 件以上を想定） */
const fmtRange = ms => ms.length === 1 ? fmtMonth(ms[0]) : `${Number(ms[0].slice(5))}〜${fmtMonth(ms[ms.length - 1])}`;

/**
 * 行スロットにミニガント（月のマス目 + バー）を描く
 * @param {HTMLElement} slot - td.wm-slot
 * @param {Object} view - WorkMonthView
 * @param {Object} actions - WorkMonthActions
 */
function render(slot, view, actions) {
    const control = buildCellFrame(slot, view, actions);
    const { months, selected, linked, label } = view;
    const n = Math.max(months.length, 1);
    const s = months.indexOf(selected[0]);
    const e = months.indexOf(selected[selected.length - 1]);
    const hasBar = selected.length > 0 && s >= 0 && e >= 0;

    const track = document.createElement('div');
    track.className = 'wg-track' + (linked ? ' is-linked' : '');
    track.style.setProperty('--n', String(n));
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', `${label} の作業月${hasBar ? ` ${fmtRange(selected)}` : ''}${linked ? '（工程に連動）' : ''}`);

    months.forEach((m, i) => {
        const cell = document.createElement('div');
        cell.className = 'wg-cell' + (hasBar && i >= s && i <= e ? ' is-covered' : '');
        cell.dataset.i = String(i);
        cell.textContent = fmtMonth(m);
        track.appendChild(cell);
    });

    if (hasBar) {
        const bar = document.createElement('div');
        bar.className = 'wg-bar' + (s === e ? ' is-single' : '');
        bar.style.setProperty('--s', String(s));
        bar.style.setProperty('--e', String(e));
        bar.tabIndex = linked ? -1 : 0;

        const handleL = document.createElement('span');
        handleL.className = 'wg-handle l';
        handleL.setAttribute('aria-hidden', 'true');
        const labelEl = document.createElement('span');
        labelEl.className = 'wg-label';
        labelEl.textContent = fmtRange(selected);
        const handleR = document.createElement('span');
        handleR.className = 'wg-handle r';
        handleR.setAttribute('aria-hidden', 'true');
        bar.append(handleL, labelEl, handleR);
        track.appendChild(bar);

        const setLabel = (a, b) => {
            labelEl.textContent = fmtRange(months.slice(a, b + 1));
            bar.classList.toggle('is-single', a === b);
        };
        if (!linked) wire(track, bar, slot, view, actions, months, s, e, setLabel);
    }
    control.appendChild(track);
}

/**
 * バーの操作を結線する（本体ドラッグ = 移動、つまみドラッグ = 伸縮、空きセルタップ = 拡張、キーボード）
 * @param {HTMLElement} track
 * @param {HTMLElement} bar
 * @param {HTMLElement} slot
 * @param {Object} view
 * @param {Object} actions
 * @param {string[]} months
 * @param {number} s0 - 描画時点の開始 index
 * @param {number} e0 - 描画時点の終了 index
 * @param {(a: number, b: number) => void} setLabel
 */
function wire(track, bar, slot, view, actions, months, s0, e0, setLabel) {
    const n = months.length;
    const clamp = i => Math.max(0, Math.min(n - 1, i));
    const idxAt = x => {
        const r = track.getBoundingClientRect();
        return clamp(Math.floor((x - r.left) / (r.width / n)));
    };
    let mode = null;
    let startIdx = 0;
    let live = [s0, e0];

    const apply = (a, b) => {
        bar.style.setProperty('--s', String(a));
        bar.style.setProperty('--e', String(b));
        setLabel(a, b);
        track.querySelectorAll('.wg-cell').forEach((c, i) => c.classList.toggle('is-covered', i >= a && i <= b));
        live = [a, b];
    };
    const previewFor = i => {
        const d = i - startIdx;
        if (mode === 'move') {
            const len = e0 - s0;
            const a = clamp(Math.min(s0 + d, n - 1 - len));
            return [a, a + len];
        }
        if (mode === 'l') return [Math.min(i, e0), e0];
        if (mode === 'r') return [s0, Math.max(i, s0)];
        // tap: 空いている月まで広げる
        return [Math.min(s0, i), Math.max(e0, i)];
    };
    /** 確定して描き直し、バーへフォーカスを戻す */
    const commit = (a, b) => {
        actions.setMonths(months.slice(a, b + 1));
        slot.querySelector('.wg-bar')?.focus({ preventScroll: true });
    };

    track.addEventListener('pointerdown', e => {
        e.preventDefault();
        const h = e.target.closest('.wg-handle');
        mode = h ? (h.classList.contains('l') ? 'l' : 'r') : e.target.closest('.wg-bar') ? 'move' : 'tap';
        startIdx = idxAt(e.clientX);
        track.setPointerCapture(e.pointerId);
        if (mode !== 'tap') bar.classList.add('is-dragging');
        apply(...previewFor(startIdx));
    });
    track.addEventListener('pointermove', e => {
        if (!mode) return;
        apply(...previewFor(idxAt(e.clientX)));
    });
    track.addEventListener('pointerup', () => {
        if (!mode) return;
        const [a, b] = live;
        mode = null;
        bar.classList.remove('is-dragging');
        // DOM の差し替えは touchend が届いた後に回す（Chromium のタッチで次のタップの
        // click が合成されない実測があるため。案A・chips.js と同じ理由）
        setTimeout(() => commit(a, b), 0);
    });
    track.addEventListener('pointercancel', () => {
        if (!mode) return;
        mode = null;
        bar.classList.remove('is-dragging');
        // ブラウザがスクロールに取った: 塗りを捨てて確定前の状態に戻す
        setTimeout(() => actions.setMonths(view.selected), 0);
    });
    bar.addEventListener('keydown', e => {
        const [a, b] = [s0, e0];
        const map = {
            ArrowRight: e.shiftKey ? [a, clamp(b + 1)] : [clamp(Math.min(a + 1, n - 1 - (b - a))), clamp(Math.min(a + 1, n - 1 - (b - a))) + (b - a)],
            ArrowLeft: e.shiftKey ? [a, Math.max(a, b - 1)] : [clamp(a - 1), clamp(a - 1) + (b - a)],
        };
        if (!map[e.key]) return;
        e.preventDefault();
        const [na, nb] = map[e.key];
        commit(na, nb);
    });
}

/** 案B レンダラ */
export const ganttRenderer = { id: 'gantt', label: 'ミニガント', render };

console.log('✅ モジュール estimate-work-months-gantt.js loaded');
