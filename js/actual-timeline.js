// ============================================
// タイムライン実績入力モジュール (actual-timeline.js)
// ============================================

import {
    estimates, actuals, schedules, memberOrder
} from './state.js';

import { showAlert, sortMembers, formatHours, escapeHtml } from './utils.js';
import { getHoliday, getDayOfWeek } from './actual.js';
import { getTaskColor } from './schedule.js';
import { pushAction } from './history.js';
import { saveData } from './storage.js';

// ============================================
// モジュール内部状態
// ============================================

/** 現在の表示年月 (YYYY-MM) */
let currentMonth = '';

/** 現在のビューモード: 'gantt' | 'daily' */
let viewMode = 'gantt';

/** 右ペイン開閉状態 */
let paneOpen = false;

/** 日別ビュー: 現在の日付 (YYYY-MM-DD) */
let currentDate = '';

/** ドラッグ状態 */
let dragState = null;

/** モバイル: タップ選択されたタスク */
let selectedTask = null;

/** DOM参照キャッシュ */
const dom = {};

/** ガントビューの日幅(px) */
const GANTT_DAY_WIDTH = 36;

/** ガント行の最小高さ(px) — 予定レーンと実績レーンの2段構成 */
const GANTT_ROW_HEIGHT_MIN = 56;

/** 実績バー1本あたりの高さ(px) */
const ACTUAL_BAR_H = 20;
/** 実績バー間のギャップ(px) */
const ACTUAL_BAR_GAP = 3;

/** 予定レーンの高さ(px) — 行上部 */
const SCHEDULE_LANE_H = 16;
/** 実績レーン開始Y(px) — 予定レーン + 区切り余白 */
const ACTUAL_LANE_TOP = 20;

/** 日別ビューの1時間幅(px) */
const DAILY_HOUR_WIDTH = 100;

/** 日別ビューの業務時間 */
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

/** HEX色をRGBAに変換 */
function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/** メンバーアバター色パレット */
const AVATAR_COLORS = [
    '#2D5A27', '#1D6FA5', '#7C3AED', '#C4841D',
    '#BE185D', '#0F766E', '#475569', '#1E3A5F',
    '#C42020', '#128F40'
];

// ============================================
// 初期化
// ============================================

/**
 * タイムラインモジュール初期化
 */
export function initActualTimeline() {
    // DOM参照をキャッシュ
    dom.container = document.getElementById('actualTimeline');
    dom.labelsHeader = document.getElementById('atlLabelsHeader');
    dom.labelsBody = document.getElementById('atlLabelsBody');
    dom.timelineScroll = document.getElementById('atlTimelineScroll');
    dom.timelineHeader = document.getElementById('atlTimelineHeader');
    dom.timelineBody = document.getElementById('atlTimelineBody');
    dom.currentMonth = document.getElementById('atlCurrentMonth');
    dom.rightPane = document.getElementById('atlRightPane');
    dom.paneBody = document.getElementById('atlPaneBody');

    if (!dom.container) return;

    // 初期月を設定
    const now = new Date();
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    currentDate = now.toISOString().slice(0, 10);

    // ナビゲーションボタン
    document.getElementById('atlPrevMonth')?.addEventListener('click', () => navigateMonth(-1));
    document.getElementById('atlNextMonth')?.addEventListener('click', () => navigateMonth(1));
    document.getElementById('atlToday')?.addEventListener('click', goToToday);

    // ビュー切替
    document.getElementById('atlViewGantt')?.addEventListener('click', () => setViewMode('gantt'));
    document.getElementById('atlViewDaily')?.addEventListener('click', () => setViewMode('daily'));

    // 右ペイントグル
    document.getElementById('atlTogglePane')?.addEventListener('click', togglePane);
    document.getElementById('atlPaneClose')?.addEventListener('click', () => setPane(false));

    // モバイル用オーバーレイ要素を作成
    createPaneOverlay();

    // スクロール同期
    setupScrollSync();

    // タイムライン内スワイプ（日別: 日付切替、ガント: 月切替）
    setupTimelineSwipe();

    console.log('✅ actual-timeline.js: 初期化完了');
}

// ============================================
// メインレンダリング
// ============================================

/**
 * タイムラインビューを描画
 */
export function renderActualTimeline() {
    if (!dom.container) return;

    if (viewMode === 'gantt') {
        renderGanttView();
    } else {
        renderDailyView();
    }

    renderRightPane();
}

// ============================================
// ガントビュー
// ============================================

/**
 * メンバーごとの行高さを事前計算
 * 同日バー重なり数に応じて行を広げる
 */
function calcMemberRowHeights(members, year, month) {
    const heights = {};
    members.forEach(member => {
        const memberActuals = getActualsForMember(member, year, month);
        const groupedActuals = groupActualsByDateTask(memberActuals);
        const mergedBars = mergeAdjacentActuals(groupedActuals);

        // 各日の同時バー数を計算
        let maxOverlap = 1;
        const dayBars = {};
        mergedBars.forEach(bar => {
            const start = new Date(bar.startDate);
            const end = new Date(bar.endDate);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const key = d.toISOString().slice(0, 10);
                if (!dayBars[key]) dayBars[key] = 0;
                dayBars[key]++;
            }
        });
        Object.values(dayBars).forEach(count => {
            maxOverlap = Math.max(maxOverlap, count);
        });

        // 行高さ = 予定レーン + 実績レーン（バー数分）
        const actualLaneH = Math.max(
            GANTT_ROW_HEIGHT_MIN - ACTUAL_LANE_TOP,
            maxOverlap * (ACTUAL_BAR_H + ACTUAL_BAR_GAP) + ACTUAL_BAR_GAP
        );
        heights[member] = ACTUAL_LANE_TOP + actualLaneH;
    });
    return heights;
}

/**
 * ガントビュー描画
 */
function renderGanttView() {
    const [year, month] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date().toISOString().slice(0, 10);

    // 月表示更新
    dom.currentMonth.textContent = `${year}年${month}月`;
    dom.labelsHeader.textContent = '担当者';

    // タイムラインのheight制約をリセット（日別ビューで設定される場合）
    dom.timelineBody.style.height = '';
    dom.timelineBody.style.position = '';

    // メンバーリスト取得
    const members = getTimelineMembers();

    // メンバーごとの行高さを事前計算（実績バーの重なり数に応じて動的に決定）
    const memberRowHeights = calcMemberRowHeights(members, year, month);

    // ヘッダー描画
    renderGanttHeader(year, month, daysInMonth, today);

    // ラベル描画
    renderGanttLabels(members, memberRowHeights);

    // タイムライン本体描画
    renderGanttBody(members, year, month, daysInMonth, today, memberRowHeights);
}

/**
 * ガントヘッダー描画（日付行）
 */
function renderGanttHeader(year, month, daysInMonth, today) {
    let html = '';
    const totalWidth = daysInMonth * GANTT_DAY_WIDTH;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = new Date(dateStr).getDay();
        const holiday = getHoliday(dateStr);
        const isWeekend = dow === 0 || dow === 6;
        const isToday = dateStr === today;
        const dayLabel = getDayOfWeek(dateStr);

        let cls = 'actual-tl-day-header';
        if (isWeekend) cls += ' weekend';
        if (holiday) cls += ' holiday';
        if (isToday) cls += ' today';

        html += `<div class="${cls}" style="width:${GANTT_DAY_WIDTH}px;min-width:${GANTT_DAY_WIDTH}px;" data-date="${dateStr}">
            <span class="actual-tl-day-num">${d}</span>
            <span class="actual-tl-day-label">${dayLabel}</span>
        </div>`;
    }

    dom.timelineHeader.innerHTML = html;
    dom.timelineHeader.style.width = `${totalWidth}px`;
}

/**
 * ガントラベル列描画
 */
function renderGanttLabels(members, memberRowHeights) {
    let html = '';
    members.forEach((member, i) => {
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const initial = member.charAt(0);
        const totalHours = getMemberTotalHours(member, currentMonth);
        const rowH = memberRowHeights[member] || GANTT_ROW_HEIGHT_MIN;
        html += `<div class="actual-tl-label-row" data-member="${escapeHtml(member)}" style="height:${rowH}px;">
            <div class="actual-tl-avatar" style="background:${color};">${escapeHtml(initial)}</div>
            <div class="actual-tl-label-info">
                <div class="actual-tl-label-name">${escapeHtml(member)}</div>
                <div class="actual-tl-label-meta">${formatHours(totalHours)}h</div>
            </div>
        </div>`;
    });
    dom.labelsBody.innerHTML = html;
}

/**
 * ガント本体描画（日セル + バー）
 */
function renderGanttBody(members, year, month, daysInMonth, today, memberRowHeights) {
    const totalWidth = daysInMonth * GANTT_DAY_WIDTH;
    let html = '';

    members.forEach((member) => {
        const rowH = memberRowHeights[member] || GANTT_ROW_HEIGHT_MIN;
        html += `<div class="actual-tl-row" data-member="${escapeHtml(member)}" style="height:${rowH}px;">`;

        // 背景セル
        html += '<div class="actual-tl-row-bg">';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dow = new Date(dateStr).getDay();
            const holiday = getHoliday(dateStr);
            const isWeekend = dow === 0 || dow === 6;
            let cls = 'actual-tl-day-cell';
            if (isWeekend) cls += ' weekend';
            if (holiday) cls += ' holiday';
            html += `<div class="${cls}" style="width:${GANTT_DAY_WIDTH}px;min-width:${GANTT_DAY_WIDTH}px;" data-date="${dateStr}"></div>`;
        }
        html += '</div>';

        // 予定バー（上部レーン）— 同一version+taskの工程違いを結合、休日をスキップ
        const memberSchedules = getSchedulesForMember(member, year, month);
        const mergedSchedules = mergeSchedulesByTask(memberSchedules);
        mergedSchedules.forEach(sch => {
            const color = getTaskColor(sch.version, sch.task);
            // 休日をスキップして営業日のみの連続区間に分割
            const segments = splitScheduleByWorkdays(sch.startDate, sch.endDate, year, month, daysInMonth);
            segments.forEach((seg, segIdx) => {
                const barInfo = calcGanttBar(seg.start, seg.end, year, month, daysInMonth);
                if (!barInfo) return;
                const isFirst = segIdx === 0;
                html += `<div class="actual-tl-bar scheduled" style="left:${barInfo.left}px;width:${barInfo.width}px;background:${hexToRgba(color, 0.35)};${isFirst ? `border-left:3px solid ${color};` : ''}top:4px;height:${SCHEDULE_LANE_H - 4}px;"
                    data-schedule-ids="${sch.ids.join(',')}" title="${escapeHtml(sch.task)} (予定)">
                    ${isFirst ? `<span class="actual-tl-bar-text">${escapeHtml(sch.task)}</span>` : ''}
                </div>`;
            });
        });

        // 実績バー（solid）— 隣接日を結合して表示
        const memberActuals = getActualsForMember(member, year, month);
        const groupedActuals = groupActualsByDateTask(memberActuals);
        const mergedBars = mergeAdjacentActuals(groupedActuals);

        // 全実績バーを実績レーン（下部）に配置
        const allBars = mergedBars;
        const barLayout = calculateBarLayout(allBars, ACTUAL_LANE_TOP);

        allBars.forEach((bar, idx) => {
            const startDay = new Date(bar.startDate).getDate();
            const endDay = new Date(bar.endDate).getDate();
            const spanDays = endDay - startDay + 1;
            const left = (startDay - 1) * GANTT_DAY_WIDTH + 1;
            const width = spanDays * GANTT_DAY_WIDTH - 2;
            const color = getTaskColor(bar.version, bar.task);
            const layout = barLayout[idx];
            const mergedClass = bar.days > 1 ? ' merged' : '';

            if (bar.days === 1) {
                // 単日バー
                html += `<div class="actual-tl-bar actual${mergedClass}" style="left:${left}px;width:${width}px;height:${layout.height}px;top:${layout.top}px;background:${color};"
                    data-actual-ids="${bar.ids.join(',')}" data-start-date="${bar.startDate}" data-end-date="${bar.endDate}" data-member="${escapeHtml(member)}"
                    title="${escapeHtml(bar.task)} ${bar.totalHours}h">
                    <span class="actual-tl-bar-hours">${bar.totalHours}h</span>
                </div>`;
            } else {
                // 複数日バー
                html += `<div class="actual-tl-bar actual${mergedClass}" style="left:${left}px;width:${width}px;height:${layout.height}px;top:${layout.top}px;background:${color};"
                    data-actual-ids="${bar.ids.join(',')}" data-start-date="${bar.startDate}" data-end-date="${bar.endDate}" data-member="${escapeHtml(member)}"
                    title="${escapeHtml(bar.task)} ${bar.totalHours}h (${bar.days}日間)">
                    <span class="actual-tl-bar-text">${escapeHtml(bar.task)}</span>
                    <span class="actual-tl-bar-hours">${bar.totalHours}h</span>
                </div>`;
            }
        });

        // 今日ライン
        if (today.startsWith(`${year}-${String(month).padStart(2, '0')}`)) {
            const todayDay = new Date(today).getDate();
            const todayLeft = (todayDay - 1) * GANTT_DAY_WIDTH + GANTT_DAY_WIDTH / 2;
            html += `<div class="actual-tl-today-line" style="left:${todayLeft}px;"></div>`;
        }

        html += '</div>';
    });

    dom.timelineBody.innerHTML = html;
    dom.timelineBody.style.width = `${totalWidth}px`;

    // イベント設定
    setupGanttEvents();
}

/**
 * ガントバーの左位置と幅を計算
 */
/**
 * 予定の日付範囲を営業日のみの連続区間に分割（休日スキップ）
 */
function splitScheduleByWorkdays(startDate, endDate, year, month, daysInMonth) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month - 1, daysInMonth);
    const start = new Date(startDate) < monthStart ? monthStart : new Date(startDate);
    const end = new Date(endDate) > monthEnd ? monthEnd : new Date(endDate);

    const segments = [];
    let segStart = null;
    let segEnd = null;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().slice(0, 10);
        const dow = d.getDay();
        const isHoliday = dow === 0 || dow === 6 || !!getHoliday(ds);

        if (isHoliday) {
            // 休日 → 現在のセグメントを閉じる
            if (segStart) {
                segments.push({ start: segStart, end: segEnd });
                segStart = null;
                segEnd = null;
            }
        } else {
            // 営業日
            if (!segStart) segStart = ds;
            segEnd = ds;
        }
    }
    if (segStart) {
        segments.push({ start: segStart, end: segEnd });
    }
    return segments;
}

function calcGanttBar(startDate, endDate, year, month, daysInMonth) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month - 1, daysInMonth);
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < monthStart || start > monthEnd) return null;

    const clampedStart = start < monthStart ? monthStart : start;
    const clampedEnd = end > monthEnd ? monthEnd : end;

    const startDay = clampedStart.getDate();
    const endDay = clampedEnd.getDate();

    const left = (startDay - 1) * GANTT_DAY_WIDTH;
    const width = (endDay - startDay + 1) * GANTT_DAY_WIDTH;

    return { left, width };
}

// ============================================
// 日別ビュー
// ============================================

/** 日別ビュー: 1時間あたりの高さ(px) — 縦軸=時間 */
const DAILY_HOUR_HEIGHT = 72;
/** 日別ビュー: 昼休み帯の高さ(px) — 業務スロットより小さく */
const LUNCH_ZONE_HEIGHT = 36;
/** 日別ビュー: 1メンバー列の幅(px) */
const DAILY_COL_WIDTH = 140;
/** 昼休み時間帯 */
const LUNCH_START = 12;
const LUNCH_END = 13;
/** 午前の業務時間数 */
const MORNING_HOURS = LUNCH_START - WORK_START_HOUR; // 3h (9,10,11)
/** 午後の業務時間数 */
const AFTERNOON_HOURS = WORK_END_HOUR - LUNCH_END; // 5h (13,14,15,16,17)
/** 昼休みゾーンのY開始位置 */
const LUNCH_ZONE_TOP = MORNING_HOURS * DAILY_HOUR_HEIGHT;
/** 午後スロットのY開始位置 */
const AFTERNOON_TOP = LUNCH_ZONE_TOP + LUNCH_ZONE_HEIGHT;


/** 業務時間をY座標に変換（昼休みゾーン挿入対応） */
function workHoursToY(accHours) {
    if (accHours <= MORNING_HOURS) {
        return accHours * DAILY_HOUR_HEIGHT;
    }
    // 午前を超えた分は午後ゾーンに配置
    return AFTERNOON_TOP + (accHours - MORNING_HOURS) * DAILY_HOUR_HEIGHT;
}

/** 現在時刻をY座標に変換 */
function clockToY(hour, minutes) {
    const m = minutes || 0;
    if (hour < LUNCH_START) {
        return (hour - WORK_START_HOUR + m / 60) * DAILY_HOUR_HEIGHT;
    }
    if (hour >= LUNCH_START && hour < LUNCH_END) {
        return LUNCH_ZONE_TOP; // 昼休み中
    }
    return AFTERNOON_TOP + (hour - LUNCH_END + m / 60) * DAILY_HOUR_HEIGHT;
}

/**
 * 日別ビュー描画 — 縦軸=時間(9:00-18:00)、横軸=担当者
 */
function renderDailyView() {
    const dateStr = currentDate;
    const dow = getDayOfWeek(dateStr);

    // 日表示に更新（休日/祝日表示）
    const d = new Date(dateStr);
    const dayOfWeek = d.getDay();
    const holiday = getHoliday(dateStr);
    const isHoliday = dayOfWeek === 0 || dayOfWeek === 6 || !!holiday;
    let headerText = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${dow})`;
    if (holiday) headerText += ` ${holiday}`;
    else if (isHoliday) headerText += ' 休日';
    dom.currentMonth.textContent = headerText;

    const members = getTimelineMembers();
    const totalHeight = (MORNING_HOURS + AFTERNOON_HOURS) * DAILY_HOUR_HEIGHT + LUNCH_ZONE_HEIGHT;
    const totalWidth = members.length * DAILY_COL_WIDTH;

    // ラベル列 → 時間ラベル（9:00〜17:00）
    renderDailyTimeLabels(totalHeight);

    // ヘッダー → メンバー名
    renderDailyMemberHeader(members);

    // 本体 → 縦時間 × 横メンバーのグリッド
    renderDailyBody(members, dateStr, totalWidth, totalHeight);
}

/**
 * 日別: 時間ラベル列（左サイドに9:00〜17:00を縦表示）
 */
function renderDailyTimeLabels(totalHeight) {
    dom.labelsHeader.textContent = '時間';

    let html = '';
    const now = new Date();
    const isToday = currentDate === now.toISOString().slice(0, 10);
    const currentHour = now.getHours();

    // 午前スロット (9:00-11:00)
    for (let h = WORK_START_HOUR; h < LUNCH_START; h++) {
        const isNow = isToday && h === currentHour;
        let cls = 'actual-tl-dv-time-label';
        if (isNow) cls += ' now';
        html += `<div class="${cls}" style="height:${DAILY_HOUR_HEIGHT}px;">
            <span class="actual-tl-dv-time-text">${h}:00</span>
        </div>`;
    }

    // 昼休みゾーン
    html += `<div class="actual-tl-dv-time-label lunch-zone" style="height:${LUNCH_ZONE_HEIGHT}px;">
        <span class="actual-tl-dv-time-text">昼休み</span>
    </div>`;

    // 午後スロット (13:00-17:00)
    for (let h = LUNCH_END; h < WORK_END_HOUR; h++) {
        const isNow = isToday && h === currentHour;
        let cls = 'actual-tl-dv-time-label';
        if (isNow) cls += ' now';
        html += `<div class="${cls}" style="height:${DAILY_HOUR_HEIGHT}px;">
            <span class="actual-tl-dv-time-text">${h}:00</span>
        </div>`;
    }

    dom.labelsBody.innerHTML = `<div style="height:${totalHeight}px;">${html}</div>`;
}

/**
 * 日別: メンバーヘッダー（上部に横並び）
 */
function renderDailyMemberHeader(members) {
    let html = '';
    members.forEach((member, i) => {
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const initial = member.charAt(0);
        const dayHours = getMemberDayHours(member, currentDate);
        html += `<div class="actual-tl-dv-member-header" style="width:${DAILY_COL_WIDTH}px;min-width:${DAILY_COL_WIDTH}px;">
            <div class="actual-tl-dv-member-avatar" style="background:${color};">${escapeHtml(initial)}</div>
            <div class="actual-tl-dv-member-info">
                <div class="actual-tl-dv-member-name">${escapeHtml(member)}</div>
                <div class="actual-tl-dv-member-hours">${formatHours(dayHours)}h</div>
            </div>
        </div>`;
    });

    dom.timelineHeader.innerHTML = html;
    dom.timelineHeader.style.width = `${members.length * DAILY_COL_WIDTH}px`;
}

/**
 * 日別: 本体描画（縦=時間、横=メンバー列）
 */
function renderDailyBody(members, dateStr, totalWidth, totalHeight) {
    let html = '';

    // 休日/祝日チェック — 休日はバーを一切表示しない
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();
    const isHoliday = dayOfWeek === 0 || dayOfWeek === 6 || !!getHoliday(dateStr);

    // 時間グリッド背景（午前 + 昼休みゾーン + 午後）
    html += '<div class="actual-tl-dv-grid" style="position:absolute;inset:0;pointer-events:none;">';
    // 午前グリッド線 (9:00-11:00)
    for (let h = WORK_START_HOUR; h < LUNCH_START; h++) {
        const top = (h - WORK_START_HOUR) * DAILY_HOUR_HEIGHT;
        html += `<div class="actual-tl-dv-grid-line" style="top:${top}px;height:${DAILY_HOUR_HEIGHT}px;"></div>`;
    }
    // 昼休みゾーン
    html += `<div class="actual-tl-dv-grid-line lunch-zone" style="top:${LUNCH_ZONE_TOP}px;height:${LUNCH_ZONE_HEIGHT}px;"></div>`;
    // 午後グリッド線 (13:00-17:00)
    for (let h = LUNCH_END; h < WORK_END_HOUR; h++) {
        const top = AFTERNOON_TOP + (h - LUNCH_END) * DAILY_HOUR_HEIGHT;
        html += `<div class="actual-tl-dv-grid-line" style="top:${top}px;height:${DAILY_HOUR_HEIGHT}px;"></div>`;
    }
    // 現在時刻ライン
    const now = new Date();
    if (dateStr === now.toISOString().slice(0, 10)) {
        const nowHour = now.getHours();
        const nowMin = now.getMinutes();
        if (nowHour >= WORK_START_HOUR && nowHour < WORK_END_HOUR && !(nowHour >= LUNCH_START && nowHour < LUNCH_END)) {
            const nowTop = clockToY(nowHour, nowMin);
            html += `<div class="actual-tl-dv-now-line" style="top:${nowTop}px;"></div>`;
        }
    }
    html += '</div>';

    // メンバー列
    members.forEach((member, i) => {
        const colLeft = i * DAILY_COL_WIDTH;
        html += `<div class="actual-tl-dv-column" data-member="${escapeHtml(member)}" style="left:${colLeft}px;width:${DAILY_COL_WIDTH}px;height:${totalHeight}px;">`;

        // 昼休みゾーンオーバーレイ（各列に描画）
        html += `<div class="actual-tl-dv-lunch-overlay" style="top:${LUNCH_ZONE_TOP}px;height:${LUNCH_ZONE_HEIGHT}px;"></div>`;

        if (!isHoliday) {
            // 予定ブロック（背景として薄く表示 — 昼休みを除いた午前+午後領域）
            const memberSchedules = getSchedulesForDate(member, dateStr);
            const mergedDaySch = mergeSchedulesByTask(memberSchedules);
            mergedDaySch.forEach(sch => {
                const color = getTaskColor(sch.version, sch.task);
                // 午前領域
                html += `<div class="actual-tl-dv-sch-block" style="top:0;height:${LUNCH_ZONE_TOP}px;background:${hexToRgba(color, 0.12)};border-left:3px solid ${hexToRgba(color, 0.4)};"
                    data-schedule-ids="${sch.ids.join(',')}" title="${escapeHtml(sch.task)} (予定)">
                    <span class="actual-tl-dv-sch-label" style="color:${color};">${escapeHtml(sch.task)}</span>
                </div>`;
                // 午後領域
                const afternoonHeight = AFTERNOON_HOURS * DAILY_HOUR_HEIGHT;
                html += `<div class="actual-tl-dv-sch-block" style="top:${AFTERNOON_TOP}px;height:${afternoonHeight}px;background:${hexToRgba(color, 0.12)};border-left:3px solid ${hexToRgba(color, 0.4)};"
                    data-schedule-ids="${sch.ids.join(',')}" title="${escapeHtml(sch.task)} (予定)">
                </div>`;
            });

            // 実績ブロック（縦に積み上げ — 昼休みゾーンを自動的にスキップ）
            const dayActuals = actuals.filter(a => a.date === dateStr && a.member === member);
            let accumulatedHours = 0;
            dayActuals.forEach(act => {
                const top = workHoursToY(accumulatedHours);
                const endHours = accumulatedHours + act.hours;

                // バーが午前→午後をまたぐ場合は分割して描画
                if (accumulatedHours < MORNING_HOURS && endHours > MORNING_HOURS) {
                    // 午前部分
                    const morningPart = MORNING_HOURS - accumulatedHours;
                    const morningTop = workHoursToY(accumulatedHours);
                    const morningHeight = morningPart * DAILY_HOUR_HEIGHT;
                    const color = getTaskColor(act.version, act.task);
                    html += `<div class="actual-tl-dv-block" style="top:${morningTop}px;height:${morningHeight}px;background:${color};"
                        data-actual-id="${act.id}" data-member="${escapeHtml(member)}"
                        title="${escapeHtml(act.task)} ${act.hours}h">
                        <span class="actual-tl-dv-block-task">${escapeHtml(act.task)}</span>
                        <span class="actual-tl-dv-block-hours">${act.hours}h</span>
                    </div>`;
                    // 午後部分
                    const afternoonPart = endHours - MORNING_HOURS;
                    const afternoonTop = AFTERNOON_TOP;
                    const afternoonHeight = afternoonPart * DAILY_HOUR_HEIGHT;
                    html += `<div class="actual-tl-dv-block" style="top:${afternoonTop}px;height:${afternoonHeight}px;background:${color};"
                        data-actual-id="${act.id}" data-member="${escapeHtml(member)}"
                        title="${escapeHtml(act.task)} ${act.hours}h (続き)">
                        <span class="actual-tl-dv-block-task">${escapeHtml(act.task)}</span>
                    </div>`;
                } else {
                    // 午前のみ or 午後のみ — 通常描画
                    const height = act.hours * DAILY_HOUR_HEIGHT;
                    const color = getTaskColor(act.version, act.task);
                    html += `<div class="actual-tl-dv-block" style="top:${top}px;height:${height}px;background:${color};"
                        data-actual-id="${act.id}" data-member="${escapeHtml(member)}"
                        title="${escapeHtml(act.task)} ${act.hours}h">
                        <span class="actual-tl-dv-block-task">${escapeHtml(act.task)}</span>
                        <span class="actual-tl-dv-block-hours">${act.hours}h</span>
                    </div>`;
                }
                accumulatedHours += act.hours;
            });
        }

        html += '</div>';
    });

    dom.timelineBody.innerHTML = html;
    dom.timelineBody.style.width = `${totalWidth}px`;
    dom.timelineBody.style.height = `${totalHeight}px`;
    dom.timelineBody.style.position = 'relative';

    // イベント設定
    setupDailyEvents();
}

// ============================================
// 右ペイン（タスクパネル）
// ============================================

/**
 * 右ペインを描画
 */
function renderRightPane() {
    if (!dom.paneBody) return;

    const members = getTimelineMembers();
    let html = '';

    members.forEach((member, i) => {
        const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const initial = member.charAt(0);
        const memberTasks = getTasksForMember(member);

        if (memberTasks.length === 0) return;

        html += `<div class="actual-tl-pane-section" data-member="${escapeHtml(member)}">
            <div class="actual-tl-pane-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <div class="actual-tl-sec-avatar" style="background:${color};">${escapeHtml(initial)}</div>
                <span class="actual-tl-sec-name">${escapeHtml(member)}</span>
                <span class="actual-tl-sec-count">${memberTasks.length}</span>
                <span class="actual-tl-sec-arrow">&#9662;</span>
            </div>
            <div class="actual-tl-pane-cards">`;

        memberTasks.forEach(task => {
            const taskColor = getTaskColor(task.version, task.task);
            html += `<div class="actual-tl-task-card" draggable="false"
                data-version="${escapeHtml(task.version)}" data-task="${escapeHtml(task.task)}"
                data-process="${escapeHtml(task.process)}" data-member="${escapeHtml(member)}"
                data-hours="${task.hours}">
                <div class="actual-tl-tc-bar" style="background:${taskColor};"></div>
                <div class="actual-tl-tc-info">
                    <div class="actual-tl-tc-name">${escapeHtml(task.task)}</div>
                    <div class="actual-tl-tc-detail">
                        <span class="actual-tl-tc-badge">${escapeHtml(task.version)}</span>
                        <span class="actual-tl-tc-badge">${escapeHtml(task.process)}</span>
                    </div>
                </div>
                <span class="actual-tl-tc-hours">${formatHours(task.hours)}h</span>
            </div>`;
        });

        html += '</div></div>';
    });

    if (!html) {
        html = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">タスクがありません</div>';
    }

    dom.paneBody.innerHTML = html;

    // タスクカードにドラッグイベント設定
    setupTaskCardDrag();
}

// ============================================
// ドラッグ&ドロップ: 右ペインからのドラッグ
// ============================================

/**
 * タスクカードのドラッグイベント設定
 * モバイル: タップで選択 → パネル閉じ → タイムラインタップで配置
 * デスクトップ: ドラッグ&ドロップ
 */
function setupTaskCardDrag() {
    const cards = dom.paneBody?.querySelectorAll('.actual-tl-task-card');
    if (!cards) return;

    cards.forEach(card => {
        card.addEventListener('mousedown', onCardMouseDown);
        if (isMobile()) {
            // モバイル: タップで選択モード
            card.addEventListener('click', onCardTapSelect);
        } else {
            card.addEventListener('touchstart', onCardTouchStart, { passive: false });
        }
    });
}

/**
 * モバイルでカードをタップ → 選択してパネルを閉じる
 */
function onCardTapSelect(e) {
    e.stopPropagation();
    const card = e.currentTarget;
    const version = card.dataset.version;
    const task = card.dataset.task;
    const process = card.dataset.process;
    const member = card.dataset.member;
    const hours = parseFloat(card.dataset.hours) || 1;
    const color = getTaskColor(version, task);

    // 既に同じタスクが選択されていたら解除
    if (selectedTask && selectedTask.version === version && selectedTask.task === task && selectedTask.member === member) {
        clearSelectedTask();
        return;
    }

    // 選択状態を設定
    selectedTask = { version, task, process, member, hours, color };

    // 既存の選択をクリア
    dom.paneBody?.querySelectorAll('.actual-tl-task-card.selected').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    // パネルを閉じる
    setPane(false);

    // 選択中の表示をトースト的に出す
    showSelectedTaskIndicator();
}

/**
 * 選択中タスクインジケータ表示
 */
function showSelectedTaskIndicator() {
    removeSelectedTaskIndicator();
    if (!selectedTask) return;

    const indicator = document.createElement('div');
    indicator.className = 'actual-tl-selected-indicator';
    indicator.id = 'atlSelectedIndicator';
    indicator.innerHTML = `
        <div class="actual-tl-si-bar" style="background:${selectedTask.color};"></div>
        <span class="actual-tl-si-text">${escapeHtml(selectedTask.task)}</span>
        <span class="actual-tl-si-hint">タイムラインをタップして配置</span>
        <button class="actual-tl-si-cancel" id="atlSiCancel">&times;</button>
    `;
    document.body.appendChild(indicator);
    indicator.querySelector('#atlSiCancel').addEventListener('click', clearSelectedTask);
    requestAnimationFrame(() => indicator.classList.add('visible'));
}

function removeSelectedTaskIndicator() {
    document.getElementById('atlSelectedIndicator')?.remove();
}

function clearSelectedTask() {
    selectedTask = null;
    dom.paneBody?.querySelectorAll('.actual-tl-task-card.selected').forEach(c => c.classList.remove('selected'));
    removeSelectedTaskIndicator();
}

/**
 * 選択中タスクをタイムライン上のタップ位置に配置
 */
function placeSelectedTaskAtPosition(e, row) {
    if (!selectedTask) return;

    const rect = row.getBoundingClientRect();
    const relX = e.clientX - rect.left + dom.timelineScroll.scrollLeft;
    const member = row.dataset.member;

    let date, defaultHours;
    if (viewMode === 'gantt') {
        const [yr, mo] = currentMonth.split('-').map(Number);
        const dayIdx = Math.floor(relX / GANTT_DAY_WIDTH);
        const daysInMonth = new Date(yr, mo, 0).getDate();
        const day = Math.max(1, Math.min(daysInMonth, dayIdx + 1));
        date = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        defaultHours = selectedTask.hours;
    } else {
        date = currentDate;
        const hourOffset = relX / DAILY_HOUR_WIDTH;
        defaultHours = Math.max(0.5, Math.round(hourOffset * 2) / 2);
    }

    // インラインエディタを表示して工数確認
    const dropInfo = {
        row: row,
        rect: row.getBoundingClientRect(),
        member: member,
        date: date
    };
    const cardState = {
        version: selectedTask.version,
        task: selectedTask.task,
        process: selectedTask.process,
        hours: defaultHours,
        color: selectedTask.color
    };
    showInlineEditor(dropInfo, cardState);

    clearSelectedTask();
}

function onCardMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    startCardDrag(e.currentTarget, e.clientX, e.clientY);
    document.addEventListener('mousemove', onCardMouseMove);
    document.addEventListener('mouseup', onCardMouseUp);
}

/** カードのタッチ: ロングプレスで開始（スクロールと共存） */
let cardLongPressTimer = null;
let cardTouchStartPos = null;

function onCardTouchStart(e) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const card = e.currentTarget;

    cardTouchStartPos = { x: touch.clientX, y: touch.clientY };

    // ロングプレスタイマー設定
    cardLongPressTimer = setTimeout(() => {
        cardLongPressTimer = null;
        card.classList.add('long-press-active');
        if (navigator.vibrate) navigator.vibrate(30);
        startCardDrag(card, touch.clientX, touch.clientY);
        document.addEventListener('touchmove', onCardTouchMove, { passive: false });
        document.addEventListener('touchend', onCardTouchEnd);
    }, LONG_PRESS_DELAY);

    // 移動でキャンセル用
    document.addEventListener('touchmove', onCardTouchCancelCheck, { passive: true });
    document.addEventListener('touchend', onCardTouchCancelCleanup);
}

function onCardTouchCancelCheck(e) {
    if (!cardTouchStartPos || !cardLongPressTimer) return;
    const touch = e.touches[0];
    const dist = Math.abs(touch.clientX - cardTouchStartPos.x) + Math.abs(touch.clientY - cardTouchStartPos.y);
    if (dist > TOUCH_MOVE_THRESHOLD) {
        // スクロール意図 → ロングプレスキャンセル
        clearTimeout(cardLongPressTimer);
        cardLongPressTimer = null;
        document.removeEventListener('touchmove', onCardTouchCancelCheck);
        document.removeEventListener('touchend', onCardTouchCancelCleanup);
    }
}

function onCardTouchCancelCleanup() {
    if (cardLongPressTimer) {
        clearTimeout(cardLongPressTimer);
        cardLongPressTimer = null;
    }
    document.removeEventListener('touchmove', onCardTouchCancelCheck);
    document.removeEventListener('touchend', onCardTouchCancelCleanup);
}

function startCardDrag(card, x, y) {
    const version = card.dataset.version;
    const task = card.dataset.task;
    const process = card.dataset.process;
    const member = card.dataset.member;
    const hours = parseFloat(card.dataset.hours) || 1;
    const color = getTaskColor(version, task);

    dragState = {
        type: 'card',
        version, task, process, member, hours, color,
        startX: x, startY: y,
        ghost: null
    };
}

function onCardMouseMove(e) {
    if (!dragState || dragState.type !== 'card') return;
    updateCardDrag(e.clientX, e.clientY);
}

function onCardTouchMove(e) {
    if (!dragState || dragState.type !== 'card') return;
    e.preventDefault();
    const touch = e.touches[0];
    updateCardDrag(touch.clientX, touch.clientY);
}

function updateCardDrag(x, y) {
    // 一定距離動いたらゴースト表示
    const dist = Math.abs(x - dragState.startX) + Math.abs(y - dragState.startY);
    if (dist < 5) return;

    if (!dragState.ghost) {
        dragState.ghost = createDragGhost(dragState);
        document.body.appendChild(dragState.ghost);
    }

    dragState.ghost.style.left = `${x + 12}px`;
    dragState.ghost.style.top = `${y - 16}px`;

    // ドロップターゲットのハイライト
    updateDropTarget(x, y);
}

function onCardMouseUp(e) {
    document.removeEventListener('mousemove', onCardMouseMove);
    document.removeEventListener('mouseup', onCardMouseUp);
    finishCardDrag(e.clientX, e.clientY);
}

function onCardTouchEnd(e) {
    document.removeEventListener('touchmove', onCardTouchMove);
    document.removeEventListener('touchend', onCardTouchEnd);
    // ロングプレスのビジュアルクリーンアップ
    document.querySelectorAll('.actual-tl-task-card.long-press-active').forEach(c =>
        c.classList.remove('long-press-active')
    );
    const touch = e.changedTouches[0];
    finishCardDrag(touch.clientX, touch.clientY);
}

function finishCardDrag(x, y) {
    if (!dragState || dragState.type !== 'card') {
        dragState = null;
        return;
    }

    // ゴースト削除
    if (dragState.ghost) {
        dragState.ghost.remove();
    }

    // ドロップターゲットをクリア
    clearDropTargets();

    // ドロップ先判定
    const dropInfo = getDropInfo(x, y);
    if (dropInfo) {
        showInlineEditor(dropInfo, dragState);
    }

    dragState = null;
}

/**
 * ドラッグゴースト要素作成
 */
function createDragGhost(state) {
    const ghost = document.createElement('div');
    ghost.className = 'actual-tl-drag-ghost';
    ghost.innerHTML = `
        <div class="actual-tl-dg-bar" style="background:${state.color};"></div>
        <span>${escapeHtml(state.task)}</span>
    `;
    return ghost;
}

/**
 * ドロップターゲットハイライト更新
 */
function updateDropTarget(_x, y) {
    clearDropTargets();

    const rows = dom.timelineBody?.querySelectorAll('.actual-tl-row');
    const labels = dom.labelsBody?.querySelectorAll('.actual-tl-label-row');
    if (!rows) return;

    rows.forEach((row, i) => {
        const rect = row.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
            row.classList.add('drop-target');
            if (labels && labels[i]) {
                labels[i].classList.add('drop-target');
            }
        }
    });
}

function clearDropTargets() {
    document.querySelectorAll('.actual-tl-row.drop-target, .actual-tl-label-row.drop-target').forEach(el => {
        el.classList.remove('drop-target');
    });
}

/**
 * ドロップ先情報を取得
 */
function getDropInfo(x, y) {
    const rows = dom.timelineBody?.querySelectorAll('.actual-tl-row');
    if (!rows) return null;

    for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
            const member = row.dataset.member;
            const relX = x - rect.left + dom.timelineScroll.scrollLeft;

            if (viewMode === 'gantt') {
                const dayIdx = Math.floor(relX / GANTT_DAY_WIDTH);
                const [yr, mo] = currentMonth.split('-').map(Number);
                const daysInMonth = new Date(yr, mo, 0).getDate();
                const day = Math.max(1, Math.min(daysInMonth, dayIdx + 1));
                const date = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                return { member, date, row, rect };
            } else {
                const hourOffset = relX / DAILY_HOUR_WIDTH;
                const hour = Math.floor(WORK_START_HOUR + hourOffset);
                return { member, date: currentDate, hour, row, rect };
            }
        }
    }
    return null;
}

// ============================================
// 空エリアドラッグ → タスクピッカー
// ============================================

function setupGanttEvents() {
    const rows = dom.timelineBody?.querySelectorAll('.actual-tl-row');
    if (!rows) return;

    rows.forEach(row => {
        row.addEventListener('mousedown', onRowMouseDown);
        row.addEventListener('touchstart', onRowTouchStart, { passive: false });
    });

    // 実績バーにクリックイベント
    const actualBars = dom.timelineBody?.querySelectorAll('.actual-tl-bar.actual');
    actualBars?.forEach(bar => {
        bar.addEventListener('click', onActualBarClick);
    });

    // 予定バーにクリックイベント（クイック登録）
    const scheduledBars = dom.timelineBody?.querySelectorAll('.actual-tl-bar.scheduled');
    scheduledBars?.forEach(bar => {
        bar.addEventListener('click', onScheduledBarClick);
    });
}

function setupDailyEvents() {
    // 新レイアウト: カラムベースのイベント
    const columns = dom.timelineBody?.querySelectorAll('.actual-tl-dv-column');
    if (columns) {
        columns.forEach(col => {
            col.addEventListener('mousedown', onRowMouseDown);
            col.addEventListener('touchstart', onRowTouchStart, { passive: false });
        });
    }

    // 旧レイアウト互換: 行ベースのイベント
    const rows = dom.timelineBody?.querySelectorAll('.actual-tl-row');
    if (rows) {
        rows.forEach(row => {
            row.addEventListener('mousedown', onRowMouseDown);
            row.addEventListener('touchstart', onRowTouchStart, { passive: false });
        });
    }

    // 実績ブロックにクリックイベント
    const actualBlocks = dom.timelineBody?.querySelectorAll('.actual-tl-dv-block, .actual-tl-bar.actual');
    actualBlocks?.forEach(block => {
        block.addEventListener('click', onActualBarClick);
    });

    // 予定ブロックにクリックイベント
    const schBlocks = dom.timelineBody?.querySelectorAll('.actual-tl-dv-sch-block, .actual-tl-bar.scheduled');
    schBlocks?.forEach(block => {
        block.addEventListener('click', onScheduledBarClick);
    });
}

/**
 * 行上のマウスダウン → 空エリアドラッグ開始 or 選択タスク配置
 */
function onRowMouseDown(e) {
    // バー上のクリックは無視
    if (e.target.closest('.actual-tl-bar')) return;
    if (e.button !== 0) return;

    // モバイル: タスク選択中なら即配置
    if (selectedTask && isMobile()) {
        e.preventDefault();
        placeSelectedTaskAtPosition(e, e.currentTarget);
        return;
    }
    e.preventDefault();

    const row = e.currentTarget;
    const rect = row.getBoundingClientRect();
    const relX = e.clientX - rect.left + dom.timelineScroll.scrollLeft;
    const member = row.dataset.member;

    dragState = {
        type: 'area',
        member,
        row,
        startX: relX,
        startClientX: e.clientX,
        startClientY: e.clientY,
        selectRect: null,
        moved: false
    };

    document.addEventListener('mousemove', onAreaMouseMove);
    document.addEventListener('mouseup', onAreaMouseUp);
}

function onAreaMouseMove(e) {
    if (!dragState || dragState.type !== 'area') return;

    const dist = Math.abs(e.clientX - dragState.startClientX) + Math.abs(e.clientY - dragState.startClientY);
    if (dist < 5) return;
    dragState.moved = true;

    updateAreaDragVisual(e);
}

function onAreaMouseUp(e) {
    document.removeEventListener('mousemove', onAreaMouseMove);
    document.removeEventListener('mouseup', onAreaMouseUp);

    if (!dragState || dragState.type !== 'area') {
        dragState = null;
        return;
    }

    if (!dragState.moved) {
        dragState = null;
        return;
    }

    // 選択矩形削除
    if (dragState.selectRect) {
        dragState.selectRect.remove();
    }

    // 選択範囲からタスクピッカー表示
    const member = dragState.member;
    let date, hours;

    if (viewMode === 'gantt') {
        const [yr, mo] = currentMonth.split('-').map(Number);
        const dayIdx = Math.floor(dragState.snappedX1 / GANTT_DAY_WIDTH);
        const day = Math.max(1, dayIdx + 1);
        date = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const days = Math.round((dragState.snappedX2 - dragState.snappedX1) / GANTT_DAY_WIDTH);
        hours = days * 8; // デフォルト8h/日
    } else {
        date = currentDate;
        hours = (dragState.snappedX2 - dragState.snappedX1) / DAILY_HOUR_WIDTH;
    }

    showTaskPicker(e.clientX, e.clientY, member, date, hours);

    dragState = null;
}

// ============================================
// 空エリアドラッグ: タッチイベント対応
// ============================================

/** ロングプレス判定用定数 */
const LONG_PRESS_DELAY = 400;
const TOUCH_MOVE_THRESHOLD = 10;

/** タッチ状態 */
let touchAreaState = null;

function onRowTouchStart(e) {
    if (e.target.closest('.actual-tl-bar')) return;
    if (e.touches.length !== 1) return;

    // モバイル: タスク選択中なら即配置
    if (selectedTask) {
        e.preventDefault();
        const touch = e.touches[0];
        placeSelectedTaskAtPosition(touch, e.currentTarget);
        return;
    }

    const touch = e.touches[0];
    const row = e.currentTarget;
    const rect = row.getBoundingClientRect();
    const relX = touch.clientX - rect.left + dom.timelineScroll.scrollLeft;
    const member = row.dataset.member;

    // ロングプレスタイマー開始
    touchAreaState = {
        member,
        row,
        startX: relX,
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        longPressTimer: null,
        isLongPress: false,
        hasMoved: false
    };

    touchAreaState.longPressTimer = setTimeout(() => {
        if (!touchAreaState) return;
        touchAreaState.isLongPress = true;

        // 触覚フィードバック
        if (navigator.vibrate) navigator.vibrate(30);

        // ドラッグ状態に移行
        dragState = {
            type: 'area',
            member,
            row,
            startX: relX,
            startClientX: touch.clientX,
            startClientY: touch.clientY,
            selectRect: null,
            moved: false
        };
    }, LONG_PRESS_DELAY);

    document.addEventListener('touchmove', onAreaTouchMove, { passive: false });
    document.addEventListener('touchend', onAreaTouchEnd);
}

function onAreaTouchMove(e) {
    if (!touchAreaState) return;
    const touch = e.touches[0];
    const dist = Math.abs(touch.clientX - touchAreaState.startClientX) +
                 Math.abs(touch.clientY - touchAreaState.startClientY);

    // ロングプレス待ち中に動いたらキャンセル（スクロール意図）
    if (!touchAreaState.isLongPress && dist > TOUCH_MOVE_THRESHOLD) {
        clearTimeout(touchAreaState.longPressTimer);
        touchAreaState = null;
        return;
    }

    // ロングプレス成功後のドラッグ操作
    if (dragState && dragState.type === 'area') {
        e.preventDefault(); // スクロール抑制
        // onAreaMouseMoveと同じロジックを再利用
        const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
        dragState.moved = true;
        updateAreaDragVisual(fakeEvent);
    }
}

function onAreaTouchEnd(e) {
    document.removeEventListener('touchmove', onAreaTouchMove);
    document.removeEventListener('touchend', onAreaTouchEnd);

    if (touchAreaState) {
        clearTimeout(touchAreaState.longPressTimer);
    }

    if (dragState && dragState.type === 'area' && dragState.moved) {
        // 選択矩形削除
        if (dragState.selectRect) {
            dragState.selectRect.remove();
        }

        const member = dragState.member;
        let date, hours;
        const touch = e.changedTouches[0];

        if (viewMode === 'gantt') {
            const [yr, mo] = currentMonth.split('-').map(Number);
            const dayIdx = Math.floor(dragState.snappedX1 / GANTT_DAY_WIDTH);
            const day = Math.max(1, dayIdx + 1);
            date = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const days = Math.round((dragState.snappedX2 - dragState.snappedX1) / GANTT_DAY_WIDTH);
            hours = days * 8;
        } else {
            date = currentDate;
            hours = (dragState.snappedX2 - dragState.snappedX1) / DAILY_HOUR_WIDTH;
        }

        showTaskPicker(touch.clientX, touch.clientY, member, date, hours);
    }

    dragState = null;
    touchAreaState = null;
}

/**
 * エリアドラッグ描画更新（マウス・タッチ共通）
 */
function updateAreaDragVisual(e) {
    if (!dragState || dragState.type !== 'area') return;

    const row = dragState.row;
    const rect = row.getBoundingClientRect();
    const relX = e.clientX - rect.left + dom.timelineScroll.scrollLeft;

    const x1 = Math.min(dragState.startX, relX);
    const x2 = Math.max(dragState.startX, relX);

    let snappedX1, snappedX2, label;
    if (viewMode === 'gantt') {
        snappedX1 = Math.floor(x1 / GANTT_DAY_WIDTH) * GANTT_DAY_WIDTH;
        snappedX2 = Math.ceil(x2 / GANTT_DAY_WIDTH) * GANTT_DAY_WIDTH;
        const days = Math.round((snappedX2 - snappedX1) / GANTT_DAY_WIDTH);
        label = `${days}日`;
    } else {
        const snapUnit = DAILY_HOUR_WIDTH / 2;
        snappedX1 = Math.floor(x1 / snapUnit) * snapUnit;
        snappedX2 = Math.ceil(x2 / snapUnit) * snapUnit;
        const hours = (snappedX2 - snappedX1) / DAILY_HOUR_WIDTH;
        label = `${hours}h`;
    }

    if (!dragState.selectRect) {
        dragState.selectRect = document.createElement('div');
        dragState.selectRect.className = 'actual-tl-drag-select';
        row.appendChild(dragState.selectRect);
    }

    dragState.selectRect.style.left = `${snappedX1}px`;
    dragState.selectRect.style.width = `${snappedX2 - snappedX1}px`;
    dragState.selectRect.innerHTML = `<span class="actual-tl-ds-label">${label}</span>`;
    dragState.snappedX1 = snappedX1;
    dragState.snappedX2 = snappedX2;
}

// ============================================
// インラインエディタ
// ============================================

/**
 * インラインエディタ表示（右ペインドラッグ後）
 */
function showInlineEditor(dropInfo, cardState) {
    // 既存のエディタを閉じる
    closeInlineEditor();

    const editor = document.createElement('div');
    editor.className = 'actual-tl-inline-editor';
    editor.id = 'atlInlineEditor';

    const defaultHours = cardState.hours || 1;

    editor.innerHTML = `
        <input type="number" class="actual-tl-ie-input" value="${defaultHours}" min="0.5" max="24" step="0.5" id="atlIeHours">
        <span class="actual-tl-ie-unit">h</span>
        <button class="actual-tl-ie-btn confirm" id="atlIeConfirm" title="確定">&#10003;</button>
        <button class="actual-tl-ie-btn cancel" id="atlIeCancel" title="キャンセル">&#10005;</button>
    `;

    // 位置設定（モバイルではCSS側で上書きされるため、デスクトップ用のみ設定）
    if (!isMobile()) {
        const rowRect = dropInfo.row.getBoundingClientRect();
        editor.style.position = 'fixed';
        editor.style.left = `${Math.min(rowRect.right - 200, dropInfo.rect.left + 10)}px`;
        editor.style.top = `${rowRect.top + rowRect.height / 2 - 16}px`;
    }

    document.body.appendChild(editor);

    const input = editor.querySelector('#atlIeHours');
    input.focus();
    input.select();

    // 確定
    editor.querySelector('#atlIeConfirm').addEventListener('click', () => {
        const hours = parseFloat(input.value);
        if (!hours || hours <= 0) {
            closeInlineEditor();
            return;
        }
        createActualFromDrop(dropInfo.member, dropInfo.date, cardState, hours);
        closeInlineEditor();
    });

    // キャンセル
    editor.querySelector('#atlIeCancel').addEventListener('click', closeInlineEditor);

    // Enterで確定、Escでキャンセル
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const hours = parseFloat(input.value);
            if (hours && hours > 0) {
                createActualFromDrop(dropInfo.member, dropInfo.date, cardState, hours);
            }
            closeInlineEditor();
        } else if (e.key === 'Escape') {
            closeInlineEditor();
        }
    });

    // 外クリックで閉じる
    setTimeout(() => {
        document.addEventListener('mousedown', onEditorOutsideClick);
    }, 0);
}

function onEditorOutsideClick(e) {
    const editor = document.getElementById('atlInlineEditor');
    if (editor && !editor.contains(e.target)) {
        closeInlineEditor();
    }
}

function closeInlineEditor() {
    const editor = document.getElementById('atlInlineEditor');
    if (editor) editor.remove();
    document.removeEventListener('mousedown', onEditorOutsideClick);
}

// ============================================
// タスクピッカーポップアップ
// ============================================

/**
 * タスクピッカー表示（空エリアドラッグ後）
 */
function showTaskPicker(x, y, member, date, defaultHours) {
    closeTaskPicker();

    const tasks = getTasksForMember(member);
    if (tasks.length === 0) {
        // タスクがない場合は全タスクを表示
        const allTasks = getAllTasks();
        if (allTasks.length === 0) {
            showAlert('見積データがありません', false);
            return;
        }
    }

    const picker = document.createElement('div');
    picker.className = 'actual-tl-task-picker';
    picker.id = 'atlTaskPicker';

    const dateLabel = formatDateLabel(date);
    const allTasks = getTasksForMember(member).length > 0 ? getTasksForMember(member) : getAllTasks();

    picker.innerHTML = `
        <div class="actual-tl-tp-header">
            <div class="actual-tl-tp-title">タスクを選択</div>
            <div class="actual-tl-tp-time">${escapeHtml(member)} / ${dateLabel}</div>
            <input type="text" class="actual-tl-tp-search" placeholder="検索..." id="atlTpSearch">
        </div>
        <div class="actual-tl-tp-list" id="atlTpList">
            ${renderTaskPickerItems(allTasks)}
        </div>
        <div class="actual-tl-tp-footer">
            <label>工数:</label>
            <input type="number" id="atlTpHours" value="${Math.round(defaultHours * 10) / 10}" min="0.5" max="24" step="0.5">
            <span class="actual-tl-tpf-unit">h</span>
            <div style="flex:1;"></div>
            <button class="actual-tl-tp-btn cancel" id="atlTpCancel">キャンセル</button>
            <button class="actual-tl-tp-btn confirm" id="atlTpConfirm">確定</button>
        </div>
    `;

    // 位置調整
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + 300 > vw) left = vw - 310;
    if (top + 360 > vh) top = vh - 370;
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;

    document.body.appendChild(picker);

    let selectedTask = null;

    // 検索
    picker.querySelector('#atlTpSearch').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allTasks.filter(t =>
            t.task.toLowerCase().includes(query) ||
            t.version.toLowerCase().includes(query) ||
            t.process.toLowerCase().includes(query)
        );
        picker.querySelector('#atlTpList').innerHTML = renderTaskPickerItems(filtered);
        bindTaskPickerItems(picker, member, date);
    });

    // タスク選択バインド
    bindTaskPickerItems(picker, member, date);

    function bindTaskPickerItems() {
        picker.querySelectorAll('.actual-tl-tp-item').forEach(item => {
            item.addEventListener('click', () => {
                picker.querySelectorAll('.actual-tl-tp-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedTask = {
                    version: item.dataset.version,
                    task: item.dataset.task,
                    process: item.dataset.process
                };
            });
        });
    }

    // 確定
    picker.querySelector('#atlTpConfirm').addEventListener('click', () => {
        if (!selectedTask) {
            showAlert('タスクを選択してください', false);
            return;
        }
        const hours = parseFloat(picker.querySelector('#atlTpHours').value);
        if (!hours || hours <= 0) {
            showAlert('工数を入力してください', false);
            return;
        }
        createActual(member, date, selectedTask.version, selectedTask.task, selectedTask.process, hours);
        closeTaskPicker();
    });

    // キャンセル
    picker.querySelector('#atlTpCancel').addEventListener('click', closeTaskPicker);

    // Escで閉じる
    picker.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeTaskPicker();
    });

    // 外クリック
    setTimeout(() => {
        document.addEventListener('mousedown', onPickerOutsideClick);
    }, 0);

    // フォーカス
    picker.querySelector('#atlTpSearch').focus();
}

function onPickerOutsideClick(e) {
    const picker = document.getElementById('atlTaskPicker');
    if (picker && !picker.contains(e.target)) {
        closeTaskPicker();
    }
}

function closeTaskPicker() {
    const picker = document.getElementById('atlTaskPicker');
    if (picker) picker.remove();
    document.removeEventListener('mousedown', onPickerOutsideClick);
}

function renderTaskPickerItems(tasks) {
    return tasks.map(t => {
        const color = getTaskColor(t.version, t.task);
        return `<div class="actual-tl-tp-item" data-version="${escapeHtml(t.version)}" data-task="${escapeHtml(t.task)}" data-process="${escapeHtml(t.process)}">
            <div class="actual-tl-tpi-bar" style="background:${color};"></div>
            <div class="actual-tl-tpi-info">
                <div class="actual-tl-tpi-name">${escapeHtml(t.task)}</div>
                <div class="actual-tl-tpi-detail">
                    <span class="actual-tl-tpi-badge">${escapeHtml(t.version)}</span>
                    <span class="actual-tl-tpi-badge">${escapeHtml(t.process)}</span>
                </div>
            </div>
            <span class="actual-tl-tpi-hours">${formatHours(t.hours)}h</span>
        </div>`;
    }).join('');
}

// ============================================
// バー操作（Phase 4）
// ============================================

/**
 * 実績バークリック → 詳細パネル
 */
function onActualBarClick(e) {
    e.stopPropagation();
    const bar = e.currentTarget;
    const actualId = bar.dataset.actualId;
    const actualIds = bar.dataset.actualIds;

    if (actualId) {
        showBarDetailPanel(actualId);
    } else if (actualIds) {
        // 複数のactualがまとまっている場合
        const ids = actualIds.split(',');
        if (ids.length === 1) {
            showBarDetailPanel(ids[0]);
        } else {
            showGroupDetailPanel(ids);
        }
    }
}

/**
 * 予定バークリック → クイック登録
 */
function onScheduledBarClick(e) {
    e.stopPropagation();
    const bar = e.currentTarget;
    const scheduleId = bar.dataset.scheduleId;
    const schedule = schedules.find(s => String(s.id) === String(scheduleId));
    if (!schedule) return;

    // 確認ダイアログ → 即登録
    const member = bar.closest('.actual-tl-row')?.dataset.member || schedule.member;
    const date = viewMode === 'gantt' ? bar.dataset.date || getCurrentGanttDate(bar) : currentDate;

    showQuickRegisterConfirm(e.clientX, e.clientY, schedule, member, date);
}

/**
 * クイック登録確認ポップアップ
 */
function showQuickRegisterConfirm(x, y, schedule, member, date) {
    closeTaskPicker(); // 既存のピッカーを閉じる
    closeInlineEditor();

    const popup = document.createElement('div');
    popup.className = 'actual-tl-task-picker'; // 同じスタイルを再利用
    popup.id = 'atlTaskPicker';
    popup.style.width = '260px';

    const dateLabel = formatDateLabel(date || new Date().toISOString().slice(0, 10));
    const defaultHours = schedule.hoursPerDay || 8;

    popup.innerHTML = `
        <div class="actual-tl-tp-header">
            <div class="actual-tl-tp-title">予定から登録</div>
            <div class="actual-tl-tp-time">${escapeHtml(schedule.task)} / ${dateLabel}</div>
        </div>
        <div style="padding:12px 14px;">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
                ${escapeHtml(schedule.version)} / ${escapeHtml(schedule.process)}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <label style="font-size:11px;font-weight:600;">工数:</label>
                <input type="number" id="atlQuickHours" value="${defaultHours}" min="0.5" max="24" step="0.5"
                    style="width:60px;padding:4px 6px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;text-align:center;">
                <span style="font-size:11px;color:var(--text-muted);">h</span>
            </div>
        </div>
        <div class="actual-tl-tp-footer">
            <div style="flex:1;"></div>
            <button class="actual-tl-tp-btn cancel" id="atlTpCancel">キャンセル</button>
            <button class="actual-tl-tp-btn confirm" id="atlTpConfirm">登録</button>
        </div>
    `;

    // 位置
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + 260 > vw) left = vw - 270;
    if (top + 200 > vh) top = vh - 210;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    document.body.appendChild(popup);

    const input = popup.querySelector('#atlQuickHours');
    input.focus();
    input.select();

    popup.querySelector('#atlTpConfirm').addEventListener('click', () => {
        const hours = parseFloat(input.value);
        if (!hours || hours <= 0) return;
        createActual(member, date, schedule.version, schedule.task, schedule.process, hours);
        closeTaskPicker();
    });

    popup.querySelector('#atlTpCancel').addEventListener('click', closeTaskPicker);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const hours = parseFloat(input.value);
            if (hours && hours > 0) {
                createActual(member, date, schedule.version, schedule.task, schedule.process, hours);
            }
            closeTaskPicker();
        } else if (e.key === 'Escape') {
            closeTaskPicker();
        }
    });

    setTimeout(() => {
        document.addEventListener('mousedown', onPickerOutsideClick);
    }, 0);
}

/**
 * バー詳細パネル表示
 */
function showBarDetailPanel(actualId) {
    const actual = actuals.find(a => String(a.id) === String(actualId));
    if (!actual) return;

    closeDetailPanel();

    const color = getTaskColor(actual.version, actual.task);
    const panel = document.createElement('div');
    panel.className = 'actual-tl-detail-panel';
    panel.id = 'atlDetailPanel';

    panel.innerHTML = `
        <div class="actual-tl-dp-header">
            <span class="actual-tl-dp-title">実績詳細</span>
            <button class="actual-tl-dp-close" id="atlDpClose">&times;</button>
        </div>
        <div class="actual-tl-dp-body">
            <div class="actual-tl-dp-color-bar" style="background:${color};"></div>
            <div class="actual-tl-dp-field">
                <label>タスク</label>
                <span>${escapeHtml(actual.task)}</span>
            </div>
            <div class="actual-tl-dp-field">
                <label>版数</label>
                <span>${escapeHtml(actual.version)}</span>
            </div>
            <div class="actual-tl-dp-field">
                <label>工程</label>
                <span>${escapeHtml(actual.process)}</span>
            </div>
            <div class="actual-tl-dp-field">
                <label>担当者</label>
                <span>${escapeHtml(actual.member)}</span>
            </div>
            <div class="actual-tl-dp-field">
                <label>日付</label>
                <span>${actual.date}</span>
            </div>
            <div class="actual-tl-dp-field">
                <label>工数</label>
                <span>${formatHours(actual.hours)}h</span>
            </div>
            <div class="actual-tl-dp-actions">
                <button class="btn btn-secondary btn-sm" id="atlDpEdit">編集</button>
                <button class="btn btn-sm" id="atlDpDelete" style="background:var(--danger);color:#fff;border-color:var(--danger);">削除</button>
            </div>
        </div>
    `;

    document.body.appendChild(panel);
    // アニメーションのため少し遅延
    requestAnimationFrame(() => panel.classList.add('open'));

    panel.querySelector('#atlDpClose').addEventListener('click', closeDetailPanel);

    panel.querySelector('#atlDpEdit').addEventListener('click', () => {
        closeDetailPanel();
        // 既存の編集モーダルを呼び出す
        if (typeof window.editActual === 'function') {
            window.editActual(actual.id);
        }
    });

    panel.querySelector('#atlDpDelete').addEventListener('click', () => {
        if (confirm('この実績を削除しますか？')) {
            deleteActualById(actual.id);
            closeDetailPanel();
        }
    });
}

/**
 * グループ詳細パネル（同日・同タスクの複数実績）
 */
function showGroupDetailPanel(ids) {
    const items = ids.map(id => actuals.find(a => String(a.id) === String(id))).filter(Boolean);
    if (items.length === 0) return;

    // 1件なら通常の詳細パネル
    if (items.length === 1) {
        showBarDetailPanel(ids[0]);
        return;
    }

    // 複数件: タスクごとにグループ化して一覧表示
    closeDetailPanel();
    const totalHours = items.reduce((s, a) => s + (a.hours || 0), 0);
    const dateLabel = items[0].date || '';

    let listHtml = '';
    items.forEach(a => {
        const color = getTaskColor(a.version, a.task);
        listHtml += `
            <div class="actual-tl-dp-item" data-actual-id="${a.id}">
                <div class="actual-tl-dp-item-color" style="background:${color};"></div>
                <div class="actual-tl-dp-item-info">
                    <div class="actual-tl-dp-item-task">${escapeHtml(a.task)}</div>
                    <div class="actual-tl-dp-item-meta">${escapeHtml(a.version)} / ${escapeHtml(a.process)} / ${escapeHtml(a.member)}</div>
                </div>
                <div class="actual-tl-dp-item-hours">${formatHours(a.hours)}h</div>
            </div>`;
    });

    const panel = document.createElement('div');
    panel.className = 'actual-tl-detail-panel';
    panel.id = 'atlDetailPanel';
    panel.innerHTML = `
        <div class="actual-tl-dp-header">
            <span class="actual-tl-dp-title">${dateLabel} の実績（${items.length}件）</span>
            <button class="actual-tl-dp-close" id="atlDpClose">&times;</button>
        </div>
        <div class="actual-tl-dp-body">
            <div class="actual-tl-dp-total">合計 <strong>${formatHours(totalHours)}h</strong></div>
            <div class="actual-tl-dp-list">${listHtml}</div>
        </div>
    `;

    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('open'));

    panel.querySelector('#atlDpClose').addEventListener('click', closeDetailPanel);

    // 各アイテムクリックで個別詳細へ
    panel.querySelectorAll('.actual-tl-dp-item').forEach(item => {
        item.addEventListener('click', () => {
            showBarDetailPanel(item.dataset.actualId);
        });
    });
}

function closeDetailPanel() {
    const panel = document.getElementById('atlDetailPanel');
    if (panel) {
        panel.classList.remove('open');
        setTimeout(() => panel.remove(), 300);
    }
}

/**
 * バーリサイズ設定（日別ビュー）
 */
function setupBarResize(bar) {
    const leftHandle = bar.querySelector('.actual-tl-bar-resize.left');
    const rightHandle = bar.querySelector('.actual-tl-bar-resize.right');

    if (rightHandle) {
        rightHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            startBarResize(bar, 'right', e.clientX);
        });
    }

    if (leftHandle) {
        leftHandle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            startBarResize(bar, 'left', e.clientX);
        });
    }
}

function startBarResize(bar, direction, startX) {
    const actualId = bar.dataset.actualId;
    const actual = actuals.find(a => String(a.id) === String(actualId));
    if (!actual) return;

    const origLeft = parseFloat(bar.style.left);
    const origWidth = parseFloat(bar.style.width);
    const snapUnit = DAILY_HOUR_WIDTH / 2; // 30分スナップ

    const onMove = (e) => {
        const dx = e.clientX - startX;

        if (direction === 'right') {
            const newWidth = Math.max(snapUnit, Math.round((origWidth + dx) / snapUnit) * snapUnit);
            bar.style.width = `${newWidth}px`;
            const hours = newWidth / DAILY_HOUR_WIDTH;
            const hoursLabel = bar.querySelector('.actual-tl-bar-hours');
            if (hoursLabel) hoursLabel.textContent = `${Math.round(hours * 10) / 10}h`;
        } else {
            const maxDx = origWidth - snapUnit;
            const clampedDx = Math.max(-origLeft, Math.min(maxDx, Math.round(dx / snapUnit) * snapUnit));
            bar.style.left = `${origLeft + clampedDx}px`;
            bar.style.width = `${origWidth - clampedDx}px`;
            const hours = (origWidth - clampedDx) / DAILY_HOUR_WIDTH;
            const hoursLabel = bar.querySelector('.actual-tl-bar-hours');
            if (hoursLabel) hoursLabel.textContent = `${Math.round(hours * 10) / 10}h`;
        }
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        // 新しい工数を計算して保存
        const newWidth = parseFloat(bar.style.width);
        const newHours = Math.round((newWidth / DAILY_HOUR_WIDTH) * 10) / 10;

        if (newHours !== actual.hours && newHours > 0) {
            const oldHours = actual.hours;
            actual.hours = newHours;
            saveData();
            pushAction({
                type: 'editActual',
                id: actual.id,
                before: { ...actual, hours: oldHours },
                after: { ...actual }
            });
            showToast(`工数を${formatHours(newHours)}hに変更しました`);
            renderActualTimeline();
        }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ============================================
// CRUD操作
// ============================================

/**
 * ドロップからの実績作成
 */
function createActualFromDrop(member, date, cardState, hours) {
    createActual(member, date, cardState.version, cardState.task, cardState.process, hours);
}

/**
 * 実績作成
 */
function createActual(member, date, version, task, process, hours) {
    const id = Date.now() + Math.random();
    const newActual = { id, date, version, task, process, member, hours };

    actuals.push(newActual);
    saveData();
    pushAction({
        type: 'addActual',
        data: { ...newActual }
    });

    showToast(`実績を登録: ${task} ${formatHours(hours)}h`);

    // 再描画
    renderActualTimeline();

    // 他のビューも更新
    if (typeof window.renderTodayActuals === 'function') {
        window.renderTodayActuals();
    }
}

/**
 * 実績削除
 */
function deleteActualById(id) {
    const idx = actuals.findIndex(a => String(a.id) === String(id));
    if (idx === -1) return;

    const deleted = actuals.splice(idx, 1)[0];
    saveData();
    pushAction({
        type: 'deleteActual',
        data: { ...deleted }
    });

    showToast('実績を削除しました');
    renderActualTimeline();

    if (typeof window.renderTodayActuals === 'function') {
        window.renderTodayActuals();
    }
}

// ============================================
// ナビゲーション
// ============================================

function navigateMonth(delta) {
    const [year, month] = currentMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + delta, 1);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    if (viewMode === 'daily') {
        // 日別ビューの場合は月の1日に移動
        currentDate = `${currentMonth}-01`;
    }

    renderActualTimeline();
}

function goToToday() {
    const now = new Date();
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    currentDate = now.toISOString().slice(0, 10);
    renderActualTimeline();

    // 今日の列にスクロール
    if (viewMode === 'gantt') {
        const todayDay = now.getDate();
        const scrollLeft = (todayDay - 1) * GANTT_DAY_WIDTH - dom.timelineScroll.clientWidth / 2;
        dom.timelineScroll.scrollLeft = Math.max(0, scrollLeft);
    }
}

function setViewMode(mode) {
    viewMode = mode;

    const btnGantt = document.getElementById('atlViewGantt');
    const btnDaily = document.getElementById('atlViewDaily');
    if (btnGantt) btnGantt.classList.toggle('active', mode === 'gantt');
    if (btnDaily) btnDaily.classList.toggle('active', mode === 'daily');

    // 日別ビューでナビゲーションボタンの動作を切替
    const prevBtn = document.getElementById('atlPrevMonth');
    const nextBtn = document.getElementById('atlNextMonth');
    if (mode === 'daily') {
        prevBtn?.setAttribute('title', '前日');
        nextBtn?.setAttribute('title', '次日');
        // ナビを日単位に変更
        prevBtn?.replaceWith(prevBtn.cloneNode(true));
        nextBtn?.replaceWith(nextBtn.cloneNode(true));
        document.getElementById('atlPrevMonth')?.addEventListener('click', () => navigateDay(-1));
        document.getElementById('atlNextMonth')?.addEventListener('click', () => navigateDay(1));
    } else {
        prevBtn?.setAttribute('title', '前月');
        nextBtn?.setAttribute('title', '次月');
        prevBtn?.replaceWith(prevBtn.cloneNode(true));
        nextBtn?.replaceWith(nextBtn.cloneNode(true));
        document.getElementById('atlPrevMonth')?.addEventListener('click', () => navigateMonth(-1));
        document.getElementById('atlNextMonth')?.addEventListener('click', () => navigateMonth(1));
    }

    renderActualTimeline();
}

function navigateDay(delta) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta);
    currentDate = d.toISOString().slice(0, 10);
    currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderActualTimeline();
}

// ============================================
// 右ペイン制御
// ============================================

function togglePane() {
    setPane(!paneOpen);
}

function setPane(open) {
    paneOpen = open;
    if (dom.rightPane) {
        dom.rightPane.classList.toggle('open', open);
    }
    const toggleBtn = document.getElementById('atlTogglePane');
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', open);
    }
    // モバイルオーバーレイ制御（モバイル時のみ）
    const overlay = document.getElementById('atlPaneOverlay');
    if (overlay && isMobile()) {
        overlay.classList.toggle('active', open);
        // bodyスクロールをロック/解除
        document.body.style.overflow = open ? 'hidden' : '';
    } else if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * モバイル用ペインオーバーレイ作成
 */
function createPaneOverlay() {
    if (document.getElementById('atlPaneOverlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'actual-tl-pane-overlay';
    overlay.id = 'atlPaneOverlay';
    overlay.addEventListener('click', () => setPane(false));
    document.body.appendChild(overlay);
}

/** モバイル判定 */
function isMobile() {
    return window.innerWidth <= 768;
}

// ============================================
// スクロール同期
// ============================================

function setupScrollSync() {
    if (!dom.timelineScroll || !dom.labelsBody) return;

    // タイムラインの縦スクロールとラベルを同期
    dom.timelineScroll.addEventListener('scroll', () => {
        dom.labelsBody.scrollTop = dom.timelineScroll.scrollTop;
    });

    dom.labelsBody.addEventListener('scroll', () => {
        dom.timelineScroll.scrollTop = dom.labelsBody.scrollTop;
    });
}

/**
 * タイムライン内横スワイプ → 日別:日切替 / ガント:月切替（指追従アニメーション付き）
 */
function setupTimelineSwipe() {
    const el = dom.container;
    if (!el) return;

    let startX = 0, startY = 0, swiping = false, confirmed = false, startTime = 0;

    el.addEventListener('touchstart', (e) => {
        // ドラッグ中やペイン内は除外
        if (dragState || e.target.closest('.actual-tl-right-pane, .actual-tl-task-card')) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
        swiping = true;
        confirmed = false;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;

        if (!confirmed) {
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                // 縦優勢ならキャンセル
                if (Math.abs(dy) > Math.abs(dx) * 1.2) {
                    swiping = false;
                    return;
                }
                confirmed = true;
                // メイン領域にトランジションなしの追従を開始
                dom.timelineScroll.style.transition = 'none';
                dom.labelsBody.style.transition = 'none';
            }
            return;
        }

        if (e.cancelable) e.preventDefault();

        // 指追従: コンテンツ全体を横にずらす
        const clamped = Math.max(-120, Math.min(120, dx));
        const opacity = 1 - Math.abs(clamped) / 300;
        dom.timelineScroll.style.transform = `translateX(${clamped}px)`;
        dom.timelineScroll.style.opacity = opacity;
        dom.labelsBody.style.transform = `translateX(${clamped}px)`;
        dom.labelsBody.style.opacity = opacity;
    }, { passive: false });

    el.addEventListener('touchend', (e) => {
        if (!swiping) return;
        swiping = false;

        const dx = e.changedTouches[0].clientX - startX;
        const elapsed = Date.now() - startTime;
        const velocity = Math.abs(dx) / elapsed;
        const threshold = velocity > 0.4 ? 30 : 60;

        if (confirmed && Math.abs(dx) > threshold) {
            const direction = dx > 0 ? -1 : 1; // 右スワイプ → 前日/前月
            // アニメーション: スライドアウト
            const slideOut = direction > 0 ? -200 : 200;
            dom.timelineScroll.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            dom.timelineScroll.style.transform = `translateX(${slideOut}px)`;
            dom.timelineScroll.style.opacity = '0';
            dom.labelsBody.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            dom.labelsBody.style.transform = `translateX(${slideOut}px)`;
            dom.labelsBody.style.opacity = '0';

            setTimeout(() => {
                // ナビゲーション実行
                if (viewMode === 'daily') {
                    navigateDay(direction);
                } else {
                    navigateMonth(direction);
                }
                // スライドイン（反対側から）
                dom.timelineScroll.style.transition = 'none';
                dom.timelineScroll.style.transform = `translateX(${-slideOut}px)`;
                dom.timelineScroll.style.opacity = '0';
                dom.labelsBody.style.transition = 'none';
                dom.labelsBody.style.transform = `translateX(${-slideOut}px)`;
                dom.labelsBody.style.opacity = '0';
                requestAnimationFrame(() => {
                    dom.timelineScroll.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                    dom.timelineScroll.style.transform = 'translateX(0)';
                    dom.timelineScroll.style.opacity = '1';
                    dom.labelsBody.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
                    dom.labelsBody.style.transform = 'translateX(0)';
                    dom.labelsBody.style.opacity = '1';
                });
            }, 200);
        } else {
            // 戻す
            dom.timelineScroll.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            dom.timelineScroll.style.transform = 'translateX(0)';
            dom.timelineScroll.style.opacity = '1';
            dom.labelsBody.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            dom.labelsBody.style.transform = 'translateX(0)';
            dom.labelsBody.style.opacity = '1';
        }
    }, { passive: true });
}

// ============================================
// データ取得ヘルパー
// ============================================

/**
 * タイムラインに表示するメンバーリスト取得
 */
function getTimelineMembers() {
    const memberSet = new Set();

    // 見積からメンバーを取得
    estimates.forEach(est => {
        if (est.member) memberSet.add(est.member);
    });

    // 実績からメンバーを取得
    actuals.forEach(act => {
        if (act.member) memberSet.add(act.member);
    });

    // スケジュールからメンバーを取得
    schedules.forEach(sch => {
        if (sch.member) memberSet.add(sch.member);
    });

    // 設定画面のDOM要素から表示順を取得（他のビューと同じ方式）
    const memberOrderEl = document.getElementById('memberOrder');
    const memberOrderInput = memberOrderEl ? memberOrderEl.value.trim() : (memberOrder || '');
    return sortMembers(Array.from(memberSet), memberOrderInput);
}

/**
 * メンバーの月合計工数
 */
function getMemberTotalHours(member, yearMonth) {
    return actuals
        .filter(a => a.member === member && a.date && a.date.startsWith(yearMonth))
        .reduce((sum, a) => sum + (a.hours || 0), 0);
}

/**
 * メンバーの日合計工数
 */
function getMemberDayHours(member, dateStr) {
    return actuals
        .filter(a => a.member === member && a.date === dateStr)
        .reduce((sum, a) => sum + (a.hours || 0), 0);
}

/**
 * メンバーのスケジュール取得（月）
 */
function getSchedulesForMember(member, year, month) {
    return schedules.filter(s => {
        if (s.member !== member) return false;
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        return (s.startDate && s.startDate.startsWith(monthStr)) ||
               (s.endDate && s.endDate.startsWith(monthStr)) ||
               (s.startDate <= `${monthStr}-31` && s.endDate >= `${monthStr}-01`);
    });
}

/**
 * メンバーのスケジュール取得（日）
 */
function getSchedulesForDate(member, dateStr) {
    return schedules.filter(s =>
        s.member === member && s.startDate <= dateStr && s.endDate >= dateStr
    );
}

/**
 * メンバーの実績取得（月）
 */
function getActualsForMember(member, year, month) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    return actuals.filter(a => a.member === member && a.date && a.date.startsWith(monthStr));
}

/**
 * 実績を日+タスクでグループ化
 */
function groupActualsByDateTask(memberActuals) {
    const groups = {};
    memberActuals.forEach(a => {
        const key = `${a.date}|${a.version}|${a.task}`;
        if (!groups[key]) {
            groups[key] = {
                date: a.date,
                version: a.version,
                task: a.task,
                hours: 0,
                ids: []
            };
        }
        groups[key].hours += a.hours || 0;
        groups[key].ids.push(a.id);
    });
    return Object.values(groups);
}

/**
 * 予定（スケジュール）を version+task でグループ化し、日付範囲を結合
 * 同じ対応の別工程を1本のバーにまとめる
 */
function mergeSchedulesByTask(scheduleList) {
    if (scheduleList.length === 0) return [];

    // version+task でグループ化
    const byTask = {};
    scheduleList.forEach(s => {
        const key = `${s.version}|${s.task}`;
        if (!byTask[key]) byTask[key] = { version: s.version, task: s.task, ranges: [], ids: [] };
        byTask[key].ranges.push({ start: s.startDate, end: s.endDate });
        byTask[key].ids.push(s.id);
    });

    const merged = [];

    Object.values(byTask).forEach(group => {
        // 日付範囲をソートして隣接・重複をマージ
        group.ranges.sort((a, b) => a.start.localeCompare(b.start));

        let current = { start: group.ranges[0].start, end: group.ranges[0].end };

        for (let i = 1; i < group.ranges.length; i++) {
            const r = group.ranges[i];
            // 現在の終了日の翌日以内に次の開始日があれば結合
            const nextDay = new Date(current.end);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = nextDay.toISOString().slice(0, 10);

            if (r.start <= nextDayStr) {
                // 隣接または重複 → 結合（終了日は最大を取る）
                if (r.end > current.end) current.end = r.end;
            } else {
                // 非隣接 → 新バー
                merged.push({
                    version: group.version,
                    task: group.task,
                    startDate: current.start,
                    endDate: current.end,
                    ids: group.ids
                });
                current = { start: r.start, end: r.end };
            }
        }
        merged.push({
            version: group.version,
            task: group.task,
            startDate: current.start,
            endDate: current.end,
            ids: group.ids
        });
    });

    return merged;
}

/**
 * 隣接する日の同じタスクを結合する
 * groupActualsByDateTask の結果を受け取り、連続した日の同一 version+task をマージ
 */
function mergeAdjacentActuals(groupedActuals) {
    if (groupedActuals.length === 0) return [];

    // version+task でグループ分け
    const byTask = {};
    groupedActuals.forEach(g => {
        const key = `${g.version}|${g.task}`;
        if (!byTask[key]) byTask[key] = [];
        byTask[key].push(g);
    });

    const merged = [];

    Object.entries(byTask).forEach(([, groups]) => {
        // 日付順にソート
        groups.sort((a, b) => a.date.localeCompare(b.date));

        let current = {
            startDate: groups[0].date,
            endDate: groups[0].date,
            version: groups[0].version,
            task: groups[0].task,
            totalHours: groups[0].hours,
            days: 1,
            ids: [...groups[0].ids]
        };

        for (let i = 1; i < groups.length; i++) {
            const g = groups[i];
            // 前日の翌日か判定
            const prevDate = new Date(current.endDate);
            prevDate.setDate(prevDate.getDate() + 1);
            const nextDateStr = prevDate.toISOString().slice(0, 10);

            if (g.date === nextDateStr) {
                // 隣接日 → 結合
                current.endDate = g.date;
                current.totalHours += g.hours;
                current.days++;
                current.ids.push(...g.ids);
            } else {
                // 非隣接 → 新バー開始
                merged.push(current);
                current = {
                    startDate: g.date,
                    endDate: g.date,
                    version: g.version,
                    task: g.task,
                    totalHours: g.hours,
                    days: 1,
                    ids: [...g.ids]
                };
            }
        }
        merged.push(current);
    });

    // 開始日でソート（表示の安定性のため）
    merged.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return merged;
}

/**
 * 同じ日に重なるバーの垂直レイアウトを計算
 * 重なりがないバーも異なるスロットに分散配置し、視覚的な密集を避ける
 * @param {Array} mergedBars バー配列
 * @param {number} laneTop レーン開始Y座標（デフォルト: 0）
 * @returns {Array<{top: number, height: number}>} 各バーの top と height
 */
function calculateBarLayout(mergedBars, laneTop) {
    const lt = laneTop !== undefined ? laneTop : 0;

    if (mergedBars.length === 0) return [];

    // 各日にどのバーが存在するかマッピング
    const dayBars = {};
    mergedBars.forEach((bar, idx) => {
        const start = new Date(bar.startDate);
        const end = new Date(bar.endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const key = d.toISOString().slice(0, 10);
            if (!dayBars[key]) dayBars[key] = [];
            dayBars[key].push(idx);
        }
    });

    // グリーディなスロット割当: 重なりのあるバーを優先的にスロット配分
    const assignedSlots = {};

    // 重なり数が多い日から処理（安定的なスロット割当）
    Object.entries(dayBars)
        .sort(([, a], [, b]) => b.length - a.length)
        .forEach(([, barIndices]) => {
            const usedSlots = new Set();
            barIndices.forEach(idx => {
                if (assignedSlots[idx] !== undefined) {
                    usedSlots.add(assignedSlots[idx]);
                }
            });
            let nextSlot = 0;
            barIndices.forEach(idx => {
                if (assignedSlots[idx] !== undefined) return;
                while (usedSlots.has(nextSlot)) nextSlot++;
                assignedSlots[idx] = nextSlot;
                usedSlots.add(nextSlot);
                nextSlot++;
            });
        });

    // 未割当バーにもスロット分散
    let nextFreeSlot = 0;
    mergedBars.forEach((_, idx) => {
        if (assignedSlots[idx] === undefined) {
            assignedSlots[idx] = nextFreeSlot++;
        }
    });

    // バーの高さ = 固定（行高さは事前にバー数に合わせて計算済み）
    const barH = ACTUAL_BAR_H;
    const step = barH + ACTUAL_BAR_GAP;

    return mergedBars.map((_, idx) => {
        const slot = assignedSlots[idx] || 0;
        const top = lt + ACTUAL_BAR_GAP + slot * step;
        return { top, height: barH };
    });
}

/**
 * メンバーのタスク一覧（estimatesから）
 */
function getTasksForMember(member) {
    const taskMap = {};
    estimates.forEach(est => {
        if (est.member !== member) return;
        const key = `${est.version}|${est.task}|${est.process}`;
        if (!taskMap[key]) {
            taskMap[key] = {
                version: est.version || '',
                task: est.task || '',
                process: est.process || '',
                hours: 0,
                member: est.member
            };
        }
        taskMap[key].hours += est.hours || 0;
    });
    return Object.values(taskMap);
}

/**
 * 全タスク取得
 */
function getAllTasks() {
    const taskMap = {};
    estimates.forEach(est => {
        const key = `${est.version}|${est.task}|${est.process}`;
        if (!taskMap[key]) {
            taskMap[key] = {
                version: est.version || '',
                task: est.task || '',
                process: est.process || '',
                hours: 0
            };
        }
        taskMap[key].hours += est.hours || 0;
    });
    return Object.values(taskMap);
}

/**
 * 現在のガントビューの日付取得（バー要素から）
 */
function getCurrentGanttDate(bar) {
    // バーの位置から日付を推定
    const left = parseFloat(bar.style.left) || 0;
    const dayIdx = Math.floor(left / GANTT_DAY_WIDTH);
    const [yr, mo] = currentMonth.split('-').map(Number);
    const day = Math.max(1, dayIdx + 1);
    return `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ============================================
// UI ヘルパー
// ============================================

/**
 * 日付ラベルフォーマット
 */
function formatDateLabel(dateStr) {
    const d = new Date(dateStr);
    const dow = getDayOfWeek(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${dow})`;
}

/**
 * トースト通知
 */
function showToast(message) {
    showAlert(message, true);
}
