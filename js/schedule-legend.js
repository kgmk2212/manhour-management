// ============================================
// ガントの下に出すバーの色の凡例（どの色がどの対応か）
// 担当者別の以前の表示（段分け）や、担当者×タスク表示で全員を畳んでいるときは、行の見出しにタスク名が無いので補う。
// 札を選ぶ（PC はマウスを乗せる）と、その対応のバーだけを強調し、ほかを薄くする。
// モックアップ: mockups/schedule-legend/
// ============================================

import { getTaskColor } from './schedule.js';
import { escapeHtml } from './utils.js';

/** 凡例の項目のキー（版数と対応名） */
export const legendKey = (version, task) => `${version}\u0000${task}`;

/** スマホで凡例を開いているか（セッション内だけ覚える。最初は閉じる） */
let mobileOpen = false;
/** クリック／タップで固定した強調（マウスを離しても消えない） */
let pinnedKey = null;

/**
 * 凡例を出すか: 担当者別の以前の表示、または担当者×タスク表示で全員を畳んでいるとき
 * @param {Object[]} rows - renderer.rows
 * @returns {boolean}
 */
export function shouldShowLegend(rows) {
    if (!rows || rows.length === 0) return false;
    if (rows.every(r => r.type === 'member')) return true;
    return rows.every(r => r.type === 'memberGroup' && r.collapsed);
}

/**
 * 表示中の予定に出てくる対応（版数・対応名の組）を、版数 → 対応名の順に並べる
 * @param {Object[]} rows
 * @returns {Array<{key: string, version: string, task: string}>}
 */
export function legendItems(rows) {
    const map = new Map();
    rows.forEach(r => (r.schedules || []).forEach(s => {
        const key = legendKey(s.version, s.task);
        if (!map.has(key)) map.set(key, { key, version: s.version || '', task: s.task || '' });
    }));
    return [...map.values()].sort((a, b) => a.version.localeCompare(b.version, 'ja') || a.task.localeCompare(b.task, 'ja'));
}

/**
 * 凡例を描き直す（renderer.render の最後に呼ぶ）
 * @param {Object} renderer - ScheduleRenderer
 */
export function renderScheduleLegend(renderer) {
    const box = document.getElementById('scheduleLegend');
    if (!box) return;
    const rows = renderer.rows || [];
    if (!shouldShowLegend(rows)) {
        box.hidden = true;
        box.innerHTML = '';
        box.dataset.signature = '';
        if (renderer.legendHighlight) { renderer.legendHighlight = null; pinnedKey = null; }
        return;
    }
    const items = legendItems(rows);
    if (pinnedKey && !items.some(i => i.key === pinnedKey)) pinnedKey = null;
    const isMobile = window.innerWidth <= 768;
    const open = !isMobile || mobileOpen;

    box.hidden = false;
    // 項目・開閉が前回と同じなら中身は作り直さず、選んでいる札の表示だけ更新する
    // （強調の切り替えで描き直すたびに作り直すと、マウスを乗せた札が置き換わってクリックが届かない）
    const signature = `${open}|${isMobile}|${items.map(i => i.key).join('|')}`;
    if (box.dataset.signature === signature) {
        box.querySelectorAll('.schedule-legend-item').forEach(btn => {
            btn.setAttribute('aria-pressed', String(items[Number(btn.dataset.index)]?.key === pinnedKey));
        });
        return;
    }
    box.dataset.signature = signature;
    box.innerHTML = `
        <div class="schedule-legend-head">
            <span class="schedule-legend-title">凡例</span>
            <span class="schedule-legend-note">${items.length} 件 ・ 選ぶとそのバーが目立ちます</span>
            ${isMobile ? `<button type="button" class="schedule-legend-toggle" aria-expanded="${open}">${open ? '閉じる' : '開く'}</button>` : ''}
        </div>
        <div class="schedule-legend-chips"${open ? '' : ' hidden'}>
            ${items.map((i, n) => `<button type="button" class="schedule-legend-item" data-index="${n}" aria-pressed="${pinnedKey === i.key}" style="--legend-color:${getTaskColor(i.version, i.task)}">
                <i class="schedule-legend-swatch"></i><span class="schedule-legend-ver">${escapeHtml(i.version)}</span><span class="schedule-legend-name">${escapeHtml(i.task)}</span>
            </button>`).join('')}
        </div>`;

    const setHighlight = (key) => {
        if (renderer.legendHighlight === key) return;
        renderer.legendHighlight = key;
        renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
    };
    box.querySelector('.schedule-legend-toggle')?.addEventListener('click', () => {
        mobileOpen = !mobileOpen;
        renderScheduleLegend(renderer);
    });
    // キーには区切りの制御文字が入るので属性には入れず、番号から項目を引く（HTML では NUL が置き換えられる）
    box.querySelectorAll('.schedule-legend-item').forEach(btn => {
        const key = items[Number(btn.dataset.index)].key;
        btn.addEventListener('click', () => {
            pinnedKey = pinnedKey === key ? null : key;
            // マウスを乗せた時点で同じ対応を強調済みでも、選んだ状態の表示は更新する
            if (renderer.legendHighlight === pinnedKey) renderScheduleLegend(renderer);
            else setHighlight(pinnedKey);
        });
        if (!isMobile) {
            btn.addEventListener('mouseenter', () => setHighlight(key));
            btn.addEventListener('mouseleave', () => setHighlight(pinnedKey));
        }
    });
}
