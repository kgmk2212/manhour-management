// ============================================
// 見積の作業月 UI — 案C: 工程×月マトリクス
//   行のスロット内に月数ぶんのセル（wx-cell）をグリッドで並べる。値 > 0 の月が作業月。
//   合計は既存の「時間」列がそのまま担う（このレンダラは時間 input を触らない）。
//   セルを変えると手動配分（setManual）、全セル空は拒否して直前の値に戻す。
//   移植元: mockups/estimate-work-months/c-hours-matrix.html（buildRow の月セル部分のみ。
//     表全体の差し替えではなく、作業月スロット 1 個の中にグリッドを収める形に変更）
//   インターフェース: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md §3.1, §4.3
// ============================================
import { buildCellFrame, fmtMonth } from './estimate-work-months.js';

/**
 * 行スロットに月別セルのグリッドを描く
 * @param {HTMLElement} slot - td.wm-slot
 * @param {Object} view - WorkMonthView
 * @param {Object} actions - WorkMonthActions
 */
function render(slot, view, actions) {
    const control = buildCellFrame(slot, view, actions);
    const { months, linked, monthly, label } = view;

    // スマホは thead を隠すので、行ごとにセルの上へ月ラベルを置く
    if (view.isMobile && months.length) control.appendChild(buildHead(months, 'wx-head wx-head-inline'));

    const grid = document.createElement('div');
    grid.className = 'wx-grid';
    grid.style.setProperty('--n', String(Math.max(months.length, 1)));
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', `${label} の月別工数`);

    months.forEach(m => {
        const v = Number(monthly[m]) || 0;
        if (linked) {
            const mirror = document.createElement('div');
            mirror.className = 'wx-mirror' + (v > 0 ? ' is-on' : '');
            mirror.textContent = v > 0 ? String(v) : '–';
            grid.appendChild(mirror);
        } else {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'wx-cell' + (v > 0 ? ' is-on' : '');
            input.step = '0.25';
            input.min = '0';
            input.inputMode = 'decimal';
            input.placeholder = '–';
            input.dataset.m = m;
            input.setAttribute('aria-label', `${label} ${fmtMonth(m)} の工数`);
            if (v > 0) input.value = String(v);
            grid.appendChild(input);
        }
    });
    control.appendChild(grid);

    if (!linked) {
        wire(slot, grid, view, actions);
        if (view.manual) {
            const even = document.createElement('button');
            even.type = 'button';
            even.className = 'wx-even';
            even.textContent = '均等にする';
            even.addEventListener('click', () => actions.setMonths(view.selected));
            control.appendChild(even);
        }
    }
}

/**
 * グリッドの操作を結線する（セル確定で手動配分・全セル空は拒否して元に戻す・Enter で確定）
 * @param {HTMLElement} slot - td.wm-slot（全セル空のときの再描画後にスロットを引き直すため）
 * @param {HTMLElement} grid
 * @param {Object} view
 * @param {Object} actions
 */
function wire(slot, grid, view, actions) {
    grid.addEventListener('change', e => {
        if (!e.target.matches('input.wx-cell')) return;
        const map = {};
        grid.querySelectorAll('input.wx-cell').forEach(i => { map[i.dataset.m] = Number(i.value) || 0; });
        if (!Object.values(map).some(v => v > 0)) {
            // 全セル空: 直前の月に戻す（手動配分は破棄され、均等按分の表示に戻る）
            actions.setMonths(view.selected);
            const freshControl = slot.querySelector('.wm-control');
            if (freshControl) {
                const note = document.createElement('div');
                note.className = 'wm-note';
                note.textContent = '少なくとも 1 つの月に工数が必要です';
                freshControl.appendChild(note);
            }
            return;
        }
        actions.setManual(map);
    });
    grid.addEventListener('keydown', e => {
        // Enter は次のセルへ移らず、その場で確定する（change を発火させて blur）
        if (e.key === 'Enter' && e.target.matches('input.wx-cell')) {
            e.preventDefault();
            e.target.blur();
        }
    });
}

/**
 * 見出しスロットに月ラベル（例: 「8月 / 2026」）を並べる
 * @param {HTMLElement} th - th.wm-slot
 * @param {{months: string[], isMobile: boolean}} info
 */
function renderHeader(th, { months }) {
    if (!months.length) { th.textContent = '作業月'; return; }
    th.appendChild(buildHead(months, 'wx-head'));
}

/**
 * 月ラベルの並び（見出し用。スマホでは各行のセル上にも置く）
 * @param {string[]} months
 * @param {string} className
 * @returns {HTMLElement}
 */
function buildHead(months, className) {
    const head = document.createElement('div');
    head.className = className;
    head.style.setProperty('--n', String(months.length));
    months.forEach(m => {
        const cell = document.createElement('div');
        cell.className = 'wx-head-month';
        const label = document.createElement('span');
        label.textContent = fmtMonth(m);
        const year = document.createElement('small');
        year.textContent = m.slice(0, 4);
        cell.append(label, year);
        head.appendChild(cell);
    });
    return head;
}

/** 案C レンダラ */
export const matrixRenderer = { id: 'matrix', label: '工程×月マトリクス', render, renderHeader };

console.log('✅ モジュール estimate-work-months-matrix.js loaded');
