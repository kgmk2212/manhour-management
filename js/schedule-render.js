// ============================================
// スケジュール描画モジュール（ガントチャートCanvas描画）
// 複数月連続表示対応（2キャンバス構成）
// ============================================

import { schedules, scheduleSettings, actuals, vacations, remainingEstimates, selectedScheduleIds,
    scheduleSelectionMode, setScheduleSelectionMode, taskSortOrder } from './state.js';
import { SCHEDULE } from './constants.js';
import { getTaskColor, isBusinessDay, calculateEndDate, getNextBusinessDay, findLinkedBackSchedule,
    businessDayDelta, planBatchMove } from './schedule.js';
import { calculateSegments, resolveSegmentStart } from './schedule-interruption.js';
import { sortMembers, escapeHtml, getTodayString } from './utils.js';
import { getDelayInfo } from './schedule-delay.js';
import { scheduleSpan, assignLanes, buildRowLayout, rowIndexAtY, fitRasterScale } from './schedule-lanes.js';
import { selectMemberTaskSchedules, buildMemberTaskRows, countDailyLoad, wrapLabel, applyTaskLabelStyle } from './schedule-member-task.js';
import { showGanttTip, hideGanttTip, currentGanttTipKey, bindTap } from './schedule-gantt-tips.js';
import { TiledSurface } from './schedule-tiles.js';
import { getMemberOrderString } from './members.js';
import { syncBulkDockOffset } from './actual-bulk.js';

// ============================================
// 定数
// ============================================

const { BAR_HEIGHT, ROW_HEIGHT, HEADER_HEIGHT, DAY_WIDTH, LABEL_WIDTH, ROW_PADDING, DEFAULT_DISPLAY_MONTHS, LANE_HEIGHT,
    TASK_ROW_HEIGHT_A, TASK_ROW_HEIGHT_DETAIL, TASK_ROW_HEIGHT_PROC_DETAIL, TASK_HEAD_ROW_HEIGHT } = SCHEDULE.CANVAS;
const TASK_ROW_HEIGHTS = { A: TASK_ROW_HEIGHT_A, detail: TASK_ROW_HEIGHT_DETAIL, procDetail: TASK_ROW_HEIGHT_PROC_DETAIL, head: TASK_HEAD_ROW_HEIGHT };
const LABEL_PADDING = 15; // テキスト右余白
const LABEL_DOT_LEFT = 14; // 左端からドットまで
const LABEL_DOT_SIZE = 8;  // ドットの直径
const LABEL_TEXT_OFFSET = LABEL_DOT_LEFT + LABEL_DOT_SIZE + 8; // ドット後テキスト開始位置
const { DELAYED, COMPLETED, TODAY_LINE, WEEKEND, HOLIDAY, GRID, MONTH_SEPARATOR,
    SURFACE, SURFACE_ELEVATED, BORDER, TEXT_PRIMARY, TEXT_MUTED, HEADER_BG, LABEL_BG } = SCHEDULE.COLORS;

const ZEBRA_LIGHT = '#FFFFFF';
const ZEBRA_DARK = '#FAFAF9';  // --surface-elevated に合わせる
const HOVER_HIGHLIGHT = 'rgba(45, 90, 39, 0.06)';  // --accent ベースの薄いハイライト
const BAR_RADIUS = 3;
// 範囲選択・一括移動（設計書 2026-09-24-schedule-multi-select-design.md）
const SELECTION_RING = '#2D5A27';                 // --accent
const SELECTION_HALO = 'rgba(45, 90, 39, 0.18)';  // --accent の淡いハロー
const MARQUEE_FILL = 'rgba(45, 90, 39, 0.07)';
const MARQUEE_MIN_PX = 4; // これ未満の移動は「空白クリック」とみなす
// 遅延予定の「超過のしっぽ」（設計書 2026-09-24-schedule-lanes-and-insert-drop-design.md §②）
const OVERRUN_FILL = 'rgba(185, 28, 28, 0.08)';   // --danger の淡い地
const OVERRUN_HATCH = 'rgba(185, 28, 28, 0.40)';  // --danger の斜線
const OVERRUN_TEXT = '#B91C1C';                   // --danger
// 担当者×タスク表示（設計書 2026-09-29-schedule-member-task-view-design.md）
const GROUP_ROW_BG = '#FAFAF9';                   // --surface-elevated
const LOAD_COLORS = ['#DCEBD9', '#E9B45A', '#C4841D']; // 1 本・2 本・3 本以上
const LOAD_STRIP_H = 18;
const TASK_LABEL_FONT_PX = 12.5;
const TASK_LABEL_LINE_H = 16;
const TASK_LABEL_INDENT = 30;   // 担当者の見出しの下のタスク行の字下げ
const TASK_SWATCH_W = 4;
const GROUP_CHEVRON_LEFT = 8;
const LABEL_FIT_MAX_RATIO = 0.4; // 幅合わせの上限（画面幅に対する割合）

/** @returns {boolean} 担当者別ビューを「担当者×タスク」表示で描くか */
export function isMemberTaskLayout() {
    return scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.MEMBER && scheduleSettings.memberLayout === 'tasks';
}

/**
 * 行の担当者（担当者の行・担当者×タスクの行なら担当者名、タスク別ビューの行なら null）
 * @param {Object|undefined} row
 * @returns {string|null}
 */
export function rowMember(row) {
    if (!row) return null;
    if (row.member) return row.member;
    return row.type === 'member' ? row.label : null;
}

/** @returns {boolean} 版数・処理名の見出し行（タスク名の見せ方「まとめる」）か */
function isHeadRow(row) {
    return !!row && (row.type === 'versionHead' || row.type === 'procHead');
}

/**
 * 見出し欄の字下げ（担当者×タスク表示は担当者の見出しの下なので深め。スマホは浅め）
 * @param {Object} row
 * @returns {number} logical px
 */
function labelIndent(row) {
    const narrow = window.innerWidth <= 768;
    const inMember = !!row.member;
    const base = inMember ? (narrow ? 14 : 20) : (narrow ? 8 : 12);
    const step = narrow ? 6 : 12;
    if (row.type === 'versionHead') return base;
    if (row.type === 'procHead') return base + step;
    if (row.labelMode === 'detail') return base + step * (row.proc ? 2 : 1);
    if (row.labelMode === 'procDetail') return base + step;
    return inMember ? (narrow ? 16 : TASK_LABEL_INDENT) : LABEL_DOT_LEFT;
}

/**
 * 担当者×タスク表示で行にするタスクの期間: 選んだ月（月ナビ・今日で決めた月）の 1 日から表示月数ぶん先の月末まで。
 * 選択月より前は含めない（遅延中の予定は今日まで掛かっているとみなすので、終わっていない過去のタスクは残る）。
 * スクロールで選択月が変わっても行は入れ替えない（rowPeriodMonth はスクロールでは変えない）
 * @returns {{start: string, end: string}}
 */
function memberTaskPeriod() {
    const ym = scheduleSettings.rowPeriodMonth || scheduleSettings.currentMonth;
    const [y, m] = (ym || formatDateString(new Date()).slice(0, 7)).split('-').map(Number);
    const months = scheduleSettings.displayMonths || DEFAULT_DISPLAY_MONTHS || 3;
    return { start: formatDateString(new Date(y, m - 1, 1)), end: formatDateString(new Date(y, m - 1 + months, 0)) };
}

/** 予定が占める最終日（遅延中は今日まで） */
function effectiveEnd(schedule, todayStr) {
    return getDelayInfo(schedule, todayStr).delayed ? todayStr : schedule.endDate;
}

function fillRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
}

function clipRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.clip();
}

// initDualCanvas後に実行されるセットアップコールバック
const pendingSetupCallbacks = [];

// ============================================
// ユーティリティ関数
// ============================================

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

function isHoliday(date) {
    if (!isWeekend(date) && !isBusinessDay(date, null)) {
        return true;
    }
    return false;
}

function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getMemberVacation(member, dateStr) {
    return vacations.find(v => v.member === member && v.date === dateStr) || null;
}

// ============================================
// Canvas描画クラス（複数月対応）
// ============================================

export class GanttChartRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // 2キャンバス構成
        this.labelCanvas = null;
        this.labelCtx = null;
        this.timelineCanvas = canvas; // 初期はsingle canvas、initDualCanvas後に変更
        this.timelineCtx = canvas.getContext('2d');
        this.scrollContainer = null;
        this.labelScrollContainer = null;
        this.dualCanvasInitialized = false;

        // 複数月範囲
        this.rangeStart = null;
        this.rangeEnd = null;
        this.totalDays = 0;
        this.monthBoundaries = [];

        // 互換用
        this.currentYear = null;
        this.currentMonth = null;
        this.daysInMonth = 0;

        this.scheduleRects = [];
        this.totalWidth = 0;
        this.timelineWidth = 0;
        this.totalHeight = 0;
        this.hoverRowIndex = -1;
        this.rows = [];
        this.rowLayout = { offsets: [], heights: [], totalHeight: HEADER_HEIGHT };
        this.collapsedMembers = new Set(); // 担当者×タスク表示で畳んでいる担当者（セッション内のみ）
        this.stripCells = new Map();       // 担当者の見出し行 index → 帯のセル [{x, date, list}]
        this.filteredSchedulesCache = null;
        this.dpr = window.devicePixelRatio || 1;
        this.uiScale = 1;  // render() 時に CSS var --ui-scale から再取得
        this.highlightedScheduleId = null;
        this.newlyCreatedIds = new Set();
        this.newlyCreatedTimer = null;
        this.customLabelWidths = this.loadCustomLabelWidths();
        this.resizeHandle = null;
        this.completedVersions = new Set();  // 完了済み版数（グレーアウト対象）
    }

    /**
     * canvas ガント専用のスケール値を CSS 変数 --gantt-scale から取得。
     * UI テキスト用の --ui-scale とは独立した値を使い、解像度に応じて
     * より積極的にガント全体を拡縮する。
     * canvas 内描画は logical 座標、CSS 表示寸法は logical × scale で扱う。
     */
    getUiScale() {
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue('--gantt-scale').trim();
        const parsed = parseFloat(raw);
        return (parsed > 0 && isFinite(parsed)) ? parsed : 1;
    }

    /**
     * イベント座標を canvas 内の logical 座標に変換。
     * uiScale 倍に拡大表示しているため、CSS px を uiScale で除算する。
     */
    eventToLogical(event, canvas) {
        const rect = canvas.getBoundingClientRect();
        const scale = this.uiScale || 1;
        return {
            x: (event.clientX - rect.left) / scale,
            y: (event.clientY - rect.top) / scale
        };
    }

    /**
     * 2キャンバス構造を動的に構築
     */
    initDualCanvas() {
        if (this.dualCanvasInitialized) return;

        const originalCanvas = this.canvas;
        const container = originalCanvas.parentElement;
        if (!container) return;

        // 元のcanvasを非表示
        originalCanvas.style.display = 'none';

        // outer container
        const outer = document.createElement('div');
        outer.className = 'gantt-outer';
        outer.id = 'ganttOuter';

        // label canvas
        // 見出し欄・表・日付の行は、それぞれタイルに分けて見えている付近だけ描く（js/schedule-tiles.js）。
        // id は従来の canvas と同じにしてあり、イベントや座標の計算は getBoundingClientRect で従来どおり行える
        this.labelCanvas = document.createElement('div');
        this.labelCanvas.id = 'ganttLabelCanvas';

        // 縦横のスクロールを 1 つの領域（#ganttTimelineScroll）にまとめる。見出し欄は左に、日付の行は上に
        // sticky で固定する（スクロール中に JS で描き直さないので、スマホの慣性スクロールでも揺れない）
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.className = 'gantt-timeline-scroll';
        this.scrollContainer.id = 'ganttTimelineScroll';

        // timeline canvas
        this.timelineCanvas = document.createElement('div');
        this.timelineCanvas.id = 'ganttTimelineCanvas';

        // label scroll container（左に固定。モバイル時はラベルだけ横スクロールできる）
        this.labelScrollContainer = document.createElement('div');
        this.labelScrollContainer.className = 'gantt-label-scroll';
        this.labelScrollContainer.id = 'ganttLabelScroll';
        this.labelScrollContainer.appendChild(this.labelCanvas);

        // PC時のみリサイズハンドルを追加（見出し欄の右隣に固定）
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'gantt-resize-handle';

        // 日付の行の写し（上に固定）。描き終えたときに各 canvas の上端から 1 回だけ写す
        this.stickyRow = document.createElement('div');
        this.stickyRow.className = 'gantt-sticky-row';
        this.stickyRow.id = 'ganttStickyRow';
        this.stickyCorner = document.createElement('div');
        this.stickyCorner.className = 'gantt-sticky-corner';
        this.stickyCornerInner = document.createElement('div');
        this.stickyCorner.appendChild(this.stickyCornerInner);
        this.stickyGap = document.createElement('div');
        this.stickyGap.className = 'gantt-sticky-gap';
        this.stickyHeader = document.createElement('div');
        this.stickyHeader.className = 'gantt-sticky-header';
        this.stickyHeader.id = 'ganttStickyHeader';
        this.stickyRow.append(this.stickyCorner, this.stickyGap, this.stickyHeader);

        const body = document.createElement('div');
        body.className = 'gantt-body';
        body.append(this.labelScrollContainer, this.resizeHandle, this.timelineCanvas);

        this.scrollContainer.append(this.stickyRow, body);
        outer.appendChild(this.scrollContainer);
        container.appendChild(outer);
        this.timelineSurface = new TiledSurface(this.timelineCanvas, this.scrollContainer);
        this.labelSurface = new TiledSurface(this.labelCanvas, this.scrollContainer);
        this.stickyHeaderSurface = new TiledSurface(this.stickyHeader, this.scrollContainer);
        this.stickyCornerSurface = new TiledSurface(this.stickyCornerInner, null);
        this.timelineCtx = this.timelineSurface.ctx;
        this.labelCtx = this.labelSurface.ctx;
        // 描き終えた後の集計（バーの位置など）用の作業 canvas
        this.scratchCtx = document.createElement('canvas').getContext('2d');

        // スクロールで見えてきたタイルを作って描く（今あるタイルは描き直さないので揺れない）
        const onScroll = () => this.scheduleSurfaceUpdate();
        this.scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        // 見出し欄だけを横スクロールしたとき（モバイル）は、角の日付の行も一緒にずらす
        this.labelScrollContainer.addEventListener('scroll', () => {
            this.stickyCornerInner.style.transform = `translateX(${-this.labelScrollContainer.scrollLeft}px)`;
        }, { passive: true });

        this.dualCanvasInitialized = true;

        // 遅延セットアップのコールバックを実行
        pendingSetupCallbacks.forEach(fn => fn());
        pendingSetupCallbacks.length = 0;

        // PC時のリサイズハンドルをセットアップ
        this.setupResizeHandle();
    }

    /** 固定の日付の行を描き直す（描き終えたときに呼ぶ。スクロール中は呼ばない） */
    scheduleStickyHeaderUpdate() {
        this.updateStickyHeader();
    }

    /** 固定の日付の行の大きさを合わせる（中身はタイルで描く） */
    updateStickyHeader() {
        if (!this.stickyRow) return;
        const scale = this.uiScale || 1;
        const cssH = HEADER_HEIGHT * scale;
        const labelCssW = this.labelScrollContainer.clientWidth || this.labelWidth * scale;
        const handleCssW = this.resizeHandle && this.resizeHandle.offsetParent ? this.resizeHandle.offsetWidth : 0;
        this.stickyRow.style.height = `${cssH}px`;
        this.stickyRow.style.marginBottom = `${-cssH}px`;
        this.stickyGap.style.width = `${handleCssW}px`;
        this.stickyCorner.style.width = `${labelCssW}px`;
        this.stickyCorner.style.height = `${cssH}px`;
    }

    /** 次のフレームで、見えている付近のタイルを作って描く（スクロール中の連続呼び出しをまとめる） */
    scheduleSurfaceUpdate() {
        if (this._surfaceRaf) return;
        this._surfaceRaf = requestAnimationFrame(() => {
            this._surfaceRaf = null;
            this.updateSurfaces();
        });
    }

    updateSurfaces() {
        if (!this.timelineSurface) return;
        this.timelineSurface.update();
        this.labelSurface.update();
        this.stickyHeaderSurface.update();
        this.stickyCornerSurface.update({ x: 0, y: 0, w: this.labelWidth * (this.uiScale || 1), h: HEADER_HEIGHT * (this.uiScale || 1) });
    }

    /**
     * タイル 1 枚を描く: ctx をそのタイルのものに差し替えて場面を描き、集計（バーの位置など）は元に戻す
     * @param {'timeline'|'label'} kind
     * @param {CanvasRenderingContext2D} ctx - タイルの ctx（論理座標で描ける変換済み）
     * @param {{x: number, y: number, w: number, h: number}|null} clip - 描く範囲（論理座標）。null は全体
     * @param {Function} scene - 描く場面
     */
    paintInto(kind, ctx, clip, scene) {
        const key = kind === 'timeline' ? 'timelineCtx' : 'labelCtx';
        const prevCtx = this[key];
        const kept = { scheduleRects: this.scheduleRects, overrunRects: this.overrunRects, stripCells: this.stripCells };
        this[key] = ctx;
        this._paintClip = clip;
        this.scheduleRects = [];
        this.overrunRects = [];
        this.stripCells = new Map();
        try {
            scene();
        } finally {
            this[key] = prevCtx;
            this._paintClip = null;
            Object.assign(this, kept);
        }
    }

    /** 表の場面（日付の行・格子・行・今日の線・選択の枠） */
    paintTimelineScene() {
        this.drawTimelineBackground();
        this.drawHeader();
        this.drawGrid();
        this.drawMonthSeparators();
        this.drawRows(this.rows);
        this.drawTodayLine();
        this.drawSelectionRings(selectedScheduleIds);
    }

    /** 見出し欄の場面 */
    paintLabelScene() {
        this.drawLabelBackground();
        this.drawLabelHeader();
        this.drawLabelColumn(this.rows);
    }

    /** 描く範囲（タイル）に入る日の範囲 [開始, 終了)（全体を描くときは全日） */
    paintDayRange() {
        const c = this._paintClip;
        if (!c) return [0, this.totalDays];
        return [Math.max(0, Math.floor(c.x / DAY_WIDTH) - 1), Math.min(this.totalDays, Math.ceil((c.x + c.w) / DAY_WIDTH) + 1)];
    }

    /** @returns {boolean} 描く範囲（タイル）に縦方向で掛かるか */
    paintHitsY(y, h) {
        const c = this._paintClip;
        return !c || (y + h >= c.y && y <= c.y + c.h);
    }

    /** 表として見えている横幅（CSS px。左に固定した見出し欄とリサイズハンドルを除く） */
    timelineViewportWidth() {
        if (!this.scrollContainer) return 0;
        const labelCssW = this.labelScrollContainer ? this.labelScrollContainer.offsetWidth : 0;
        const handleCssW = this.resizeHandle && this.resizeHandle.offsetParent ? this.resizeHandle.offsetWidth : 0;
        return Math.max(0, this.scrollContainer.clientWidth - labelCssW - handleCssW);
    }

    /**
     * PC時のラベル列リサイズハンドルをセットアップ
     */
    setupResizeHandle() {
        if (!this.resizeHandle) return;

        const handle = this.resizeHandle;
        let isDragging = false;
        let startX = 0;
        let startWidth = 0;
        const MIN_WIDTH = 80;
        const MAX_WIDTH = 500;

        const onMouseDown = (e) => {
            // モバイル時は無効
            if (window.innerWidth <= 768) return;
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startWidth = this.labelWidth;
            handle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const scale = this.uiScale || 1;
            // delta は CSS px、startWidth/MIN/MAX は logical px なので統一する
            const deltaLogical = (e.clientX - startX) / scale;
            const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + deltaLogical));
            // ドラッグ中はコンテナ幅のみ変更（軽量）。CSS px へ戻す
            if (this.labelScrollContainer) {
                this.labelScrollContainer.style.width = (newWidth * scale) + 'px';
            }
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            const scale = this.uiScale || 1;
            const deltaLogical = (e.clientX - startX) / scale;
            const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + deltaLogical));
            const key = this.labelWidthKey();
            // localStorage には logical 値で保存する
            this.customLabelWidths[key] = newWidth;
            this.saveCustomLabelWidth(key, newWidth);
            // 新しい幅で再描画
            this.render(this.currentYear, this.currentMonth, this.filteredSchedulesCache);
        };

        handle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        // ダブルクリック: 一番長い見出しを 1 行で書ける幅に合わせる（上限 画面幅の 40%）
        handle.addEventListener('dblclick', () => {
            if (window.innerWidth <= 768) return;
            const width = this.measureFitLabelWidth();
            const key = this.labelWidthKey();
            this.customLabelWidths[key] = width;
            this.saveCustomLabelWidth(key, width);
            this.render(this.currentYear, this.currentMonth, this.filteredSchedulesCache);
        });
    }

    /**
     * 見出しを 1 行で書いたときに一番長い見出しが収まる幅（logical px）
     * @returns {number}
     */
    measureFitLabelWidth() {
        const ctx = this.labelCtx;
        const scale = this.uiScale || 1;
        let widest = 0;
        this.rows.forEach(row => {
            if (row.type === 'task' || row.type === 'memberTask') {
                // 各段を 1 行で書いたときの一番長い段に合わせる
                ctx.font = `600 ${TASK_LABEL_FONT_PX + 0.5}px system-ui, -apple-system, sans-serif`;
                const pieces = row.labelMode === 'detail' ? [row.detail ?? row.label] : [row.proc || '', row.detail ?? row.label, row.version || ''];
                const w = Math.max(...pieces.map(t => ctx.measureText(t).width));
                widest = Math.max(widest, labelIndent(row) + TASK_SWATCH_W + 8 + w + LABEL_PADDING);
            } else if (isHeadRow(row)) {
                ctx.font = '700 12.5px system-ui, -apple-system, sans-serif';
                widest = Math.max(widest, labelIndent(row) + ctx.measureText(row.label).width + LABEL_PADDING + (row.type === 'versionHead' ? 44 : 0));
            } else {
                ctx.font = '600 13px system-ui, -apple-system, sans-serif';
                const extra = row.type === 'memberGroup' ? 48 : 0; // 件数の表示ぶん
                widest = Math.max(widest, LABEL_TEXT_OFFSET + ctx.measureText(row.label).width + LABEL_PADDING + extra);
            }
        });
        const max = Math.min(500, Math.floor(window.innerWidth * LABEL_FIT_MAX_RATIO / scale));
        return Math.max(80, Math.min(max, Math.ceil(widest)));
    }

    /**
     * カスタムラベル幅をlocalStorageから読み込み
     */
    /**
     * 畳んだ担当者の見出し（▸・ドット・名前・件数）がちょうど入る幅（logical px）。画面幅の 40% を上限にする
     * @param {Object[]} rows - すべて畳んだ担当者の見出し行
     * @returns {number}
     */
    measureCollapsedGroupWidth(rows) {
        const ctx = this.labelCtx;
        const nameX = GROUP_CHEVRON_LEFT + 16 + LABEL_DOT_SIZE + 8;
        let widest = 0;
        rows.forEach(row => {
            ctx.font = '600 13px system-ui, -apple-system, sans-serif';
            const nameW = ctx.measureText(row.label).width;
            ctx.font = '500 11.5px system-ui, -apple-system, sans-serif';
            const countW = ctx.measureText(`${row.taskCount} 件`).width;
            widest = Math.max(widest, nameX + nameW + 12 + countW + 10);
        });
        const max = Math.floor(window.innerWidth * LABEL_FIT_MAX_RATIO / (this.uiScale || 1));
        return Math.max(60, Math.min(max, Math.ceil(widest)));
    }

    /** 見出し欄の幅を覚えるキー（担当者×タスク表示は担当者別と別に覚える） */
    labelWidthKey(viewMode = scheduleSettings.viewMode) {
        return isMemberTaskLayout() ? 'memberTasks' : viewMode;
    }

    loadCustomLabelWidths() {
        const widths = { member: null, task: null, memberTasks: null };
        try {
            for (const mode of ['member', 'task', 'memberTasks']) {
                const saved = localStorage.getItem(`schedule_label_width_${mode}`);
                if (saved) {
                    const width = parseInt(saved, 10);
                    if (width >= 80 && width <= 500) widths[mode] = width;
                }
            }
            // 旧キーからの移行
            const legacy = localStorage.getItem('schedule_label_width');
            if (legacy) {
                const w = parseInt(legacy, 10);
                if (w >= 80 && w <= 500) {
                    if (!widths.member) widths.member = w;
                    if (!widths.task) widths.task = w;
                }
                localStorage.removeItem('schedule_label_width');
            }
        } catch (e) { /* ignore */ }
        return widths;
    }

    /**
     * カスタムラベル幅をlocalStorageに保存
     */
    saveCustomLabelWidth(viewMode, width) {
        try {
            localStorage.setItem(`schedule_label_width_${viewMode}`, String(width));
        } catch (e) { /* ignore */ }
    }

    /**
     * 複数月の範囲を計算
     */
    calculateMonthRange(year, month) {
        const displayMonths = scheduleSettings.displayMonths || DEFAULT_DISPLAY_MONTHS || 3;
        const halfBefore = Math.floor((displayMonths - 1) / 2);

        this.monthBoundaries = [];
        let totalDays = 0;

        for (let i = 0; i < displayMonths; i++) {
            const d = new Date(year, month - 1 - halfBefore + i, 1);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const days = getDaysInMonth(y, m);

            this.monthBoundaries.push({
                year: y,
                month: m,
                startDayOffset: totalDays,
                daysInMonth: days
            });
            totalDays += days;
        }

        this.totalDays = totalDays;
        const first = this.monthBoundaries[0];
        const last = this.monthBoundaries[this.monthBoundaries.length - 1];
        this.rangeStart = new Date(first.year, first.month - 1, 1);
        this.rangeEnd = new Date(last.year, last.month - 1, last.daysInMonth);
    }

    /**
     * スケジュールデータに合わせて表示範囲を拡張
     * 登録されているスケジュールの月がすべて表示されるようにし、
     * ドラッグ移動用に前後1ヶ月のバッファを追加する
     */
    expandRangeForSchedules(sourceSchedules) {
        if (!sourceSchedules || sourceSchedules.length === 0) return;

        let minDate = this.rangeStart;
        let maxDate = this.rangeEnd;

        for (const s of sourceSchedules) {
            const startDate = new Date(s.startDate);
            const endDate = new Date(s.endDate);
            if (startDate < minDate) minDate = new Date(startDate);
            if (endDate > maxDate) maxDate = new Date(endDate);
        }

        // スケジュールが現在の範囲内に収まっていれば拡張不要
        if (minDate >= this.rangeStart && maxDate <= this.rangeEnd) return;

        // バッファ: スケジュール範囲の前後1ヶ月を追加
        const bufferStart = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
        const bufferEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0); // 翌月末

        // 元の範囲とバッファ範囲の広い方を採用
        const newStart = bufferStart < this.rangeStart ? bufferStart : this.rangeStart;
        const newEndMonth = new Date(bufferEnd.getFullYear(), bufferEnd.getMonth(), 1);
        const origEndMonth = new Date(this.rangeEnd.getFullYear(), this.rangeEnd.getMonth(), 1);
        const finalEndMonth = newEndMonth > origEndMonth ? newEndMonth : origEndMonth;

        // monthBoundaries を再構築
        this.monthBoundaries = [];
        let totalDays = 0;
        const cursor = new Date(newStart.getFullYear(), newStart.getMonth(), 1);

        while (cursor <= finalEndMonth) {
            const y = cursor.getFullYear();
            const m = cursor.getMonth() + 1;
            const days = getDaysInMonth(y, m);

            this.monthBoundaries.push({
                year: y,
                month: m,
                startDayOffset: totalDays,
                daysInMonth: days
            });
            totalDays += days;

            cursor.setMonth(cursor.getMonth() + 1);
        }

        this.totalDays = totalDays;
        const first = this.monthBoundaries[0];
        const last = this.monthBoundaries[this.monthBoundaries.length - 1];
        this.rangeStart = new Date(first.year, first.month - 1, 1);
        this.rangeEnd = new Date(last.year, last.month - 1, last.daysInMonth);
    }

    /**
     * 日付→X座標（timelineCanvas上）
     */
    dateToX(date) {
        const diffMs = date.getTime() - this.rangeStart.getTime();
        const dayOffset = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return dayOffset * DAY_WIDTH;
    }

    /**
     * X座標→日付（timelineCanvas上）
     */
    xToDate(x) {
        if (x < 0) return null;
        const dayOffset = Math.floor(x / DAY_WIDTH);
        if (dayOffset < 0 || dayOffset >= this.totalDays) return null;
        const date = new Date(this.rangeStart);
        date.setDate(date.getDate() + dayOffset);
        return date;
    }

    /**
     * ガントチャートを描画（複数月対応）
     */
    render(year, month, filteredSchedules = null) {
        this.currentYear = year;
        this.currentMonth = month;
        this.daysInMonth = getDaysInMonth(year, month);

        // スクロール位置を日付ベースで保存（expandRangeForSchedulesでキャンバス幅が変わるため、
        // ピクセル値ではなく日付に変換して保持する）。scrollLeft は CSS px なので
        // uiScale で除算して logical 座標に戻してから日付計算する。
        let savedScrollDate = null;
        // 1日未満の端数（logical px）も保持する。丸めると描き直しのたびに最大1日ぶん横に跳ね、
        // ドラッグ中は指・カーソルの下の日付がずれる
        let savedScrollRemainder = 0;
        const prevUiScale = this.uiScale || 1;
        if (this.scrollContainer && this.scrollContainer.scrollLeft > 0 && this.rangeStart) {
            const logicalScroll = this.scrollContainer.scrollLeft / prevUiScale;
            const dayOffset = Math.floor(logicalScroll / DAY_WIDTH);
            savedScrollRemainder = logicalScroll - dayOffset * DAY_WIDTH;
            savedScrollDate = new Date(this.rangeStart);
            savedScrollDate.setDate(savedScrollDate.getDate() + dayOffset);
        }

        // 2キャンバス構造を初期化
        this.initDualCanvas();

        // 複数月の範囲を計算
        this.calculateMonthRange(year, month);

        this.scheduleRects = [];
        this.overrunRects = [];
        this.stripCells = new Map();

        // 表示範囲内のスケジュールをフィルタ
        const todayStr = getTodayString();
        let sourceSchedules = filteredSchedules || schedules;
        // 担当者×タスク表示: 表示範囲（月ナビの月を中心に表示月数ぶん）に掛かるタスクだけを行にする
        if (isMemberTaskLayout()) {
            const period = memberTaskPeriod();
            sourceSchedules = selectMemberTaskSchedules(sourceSchedules, period, (s) => effectiveEnd(s, todayStr));
        }

        // スケジュールデータに合わせて表示範囲を拡張
        this.expandRangeForSchedules(sourceSchedules);

        const visibleSchedules = this.getVisibleSchedulesForRange(sourceSchedules);

        // 行データを構築
        const rows = this.buildRows(visibleSchedules);
        this.rows = rows;
        // 行ごとに重なりレーンを割り当て、可変行高のレイアウトを作る
        // 遅延予定は今日までの「超過のしっぽ」も占有するので、その分も期間に含める
        const useLanes = scheduleSettings.laneLayout !== false;
        const showOverrun = scheduleSettings.showOverrun !== false;
        rows.forEach(row => {
            // 開いている担当者の見出し行はバーを描かない（帯だけ）。畳んだ見出し行は従来の担当者行と同じくバーを段分けで描く。
            // 段分けオフ（従来表示）は全予定を1段に重ね描きする
            if (!useLanes || (row.type === 'memberGroup' && !row.collapsed) || isHeadRow(row)) {
                row.lanes = { laneOf: new Map(), laneCount: 1 };
                return;
            }
            row.lanes = assignLanes(row.schedules, (s) => {
                const span = scheduleSpan(s, (s.interruptions || []).length > 0 ? calculateSegments(s) : null);
                const delay = showOverrun ? getDelayInfo(s, todayStr) : { delayed: false };
                return delay.delayed && delay.overrunEnd > span.end ? { ...span, end: delay.overrunEnd } : span;
            });
        });
        this.rowLayout = buildRowLayout(rows.map(r => r.lanes.laneCount),
            { headerHeight: HEADER_HEIGHT, rowHeight: ROW_HEIGHT, laneHeight: LANE_HEIGHT },
            rows.map(r => r.baseHeight));
        this.filteredSchedulesCache = filteredSchedules;

        // サイズ計算
        const isMobile = window.innerWidth <= 768;
        const viewMode = scheduleSettings.viewMode;

        // ラベル幅をコンテンツに合わせて計算
        this.labelWidth = this.calculateLabelWidth(rows, isMobile, viewMode);

        this.timelineWidth = this.totalDays * DAY_WIDTH;
        this.totalWidth = this.labelWidth + this.timelineWidth;
        this.totalHeight = this.rowLayout.totalHeight;
        this.totalHeight = Math.max(this.totalHeight, 300);

        this.dpr = window.devicePixelRatio || 1;
        this.uiScale = this.getUiScale();
        // raster は logical × dpr × uiScale、CSS は logical × uiScale、
        // setTransform は dpr × uiScale で logical 座標を raster へ写像する。
        // 見出し欄・表・日付の行はタイルに分けて描くので、1 枚の canvas の上限を気にせず元の解像度で描ける
        const rasterScale = this.dpr * this.uiScale;
        this.timelineRasterScale = rasterScale;
        this.labelRasterScale = rasterScale;
        this.timelineSurface.resize(this.timelineWidth, this.totalHeight, this.uiScale, rasterScale);
        this.labelSurface.resize(this.labelWidth, this.totalHeight, this.uiScale, rasterScale);
        this.stickyHeaderSurface.resize(this.timelineWidth, HEADER_HEIGHT, this.uiScale, rasterScale);
        this.stickyCornerSurface.resize(this.labelWidth, HEADER_HEIGHT, this.uiScale, rasterScale);

        // モバイル時のラベルスクロールコンテナ設定
        if (this.labelScrollContainer) {
            if (isMobile) {
                // ラベルは画面幅の40%まで、超えた分は横スクロール可能
                // labelWidth は logical なので CSS では uiScale 倍を上限とする
                const labelCssWidth = this.labelWidth * this.uiScale;
                const maxVisible = Math.min(labelCssWidth, Math.floor(window.innerWidth * 0.4));
                this.labelScrollContainer.style.maxWidth = maxVisible + 'px';
                this.labelScrollContainer.style.width = '';
            } else {
                this.labelScrollContainer.style.maxWidth = '';
                this.labelScrollContainer.style.width = '';
            }
        }

        // リサイズハンドルの表示制御（PC時のみ表示）
        if (this.resizeHandle) {
            this.resizeHandle.style.display = isMobile ? 'none' : '';
            this.resizeHandle.style.left = `${this.labelWidth * this.uiScale}px`;
        }

        // 描画: まず作業 canvas に全体を 1 回描いて、バーの位置・帯のセル・見出しの省略などを集計する
        // （今日の線は行ごとにバーの下へ描く（drawTodayMarkBehindBars）。drawTodayLine は行の無い余白と日付の行の印）
        const scratch = this.scratchCtx;
        scratch.setTransform(1, 0, 0, 1, 0, 0);
        const collectT = this.timelineCtx;
        const collectL = this.labelCtx;
        this.timelineCtx = scratch;
        this.labelCtx = scratch;
        try {
            this.paintTimelineScene();
            this.paintLabelScene();
        } finally {
            this.timelineCtx = collectT;
            this.labelCtx = collectL;
        }
        // タイルごとの描き方を登録し、見えている付近のタイルを描く
        this.timelineSurface.setPainter((ctx, clip) => this.paintInto('timeline', ctx, clip, () => this.paintTimelineScene()));
        this.labelSurface.setPainter((ctx, clip) => this.paintInto('label', ctx, clip, () => this.paintLabelScene()));
        this.stickyHeaderSurface.setPainter((ctx, clip) => this.paintInto('timeline', ctx, clip, () => {
            ctx.fillStyle = HEADER_BG;
            ctx.fillRect(clip.x, 0, clip.w, HEADER_HEIGHT);
            this.drawHeader();
            this.drawTodayLine();
        }));
        this.stickyCornerSurface.setPainter((ctx, clip) => this.paintInto('label', ctx, clip, () => this.drawLabelHeader()));
        this.timelineSurface.invalidate();
        this.labelSurface.invalidate();
        this.stickyHeaderSurface.invalidate();
        this.stickyCornerSurface.invalidate();
        updateScheduleSelectionChip();

        // スクロール位置を日付から復元（キャンバス幅が変わっても正しい位置にスクロール）
        // dateToX は logical 座標を返すので CSS px には uiScale を掛ける。
        if (this.scrollContainer && savedScrollDate !== null) {
            this.scrollContainer.scrollLeft = (this.dateToX(savedScrollDate) + savedScrollRemainder) * this.uiScale;
        }
        // 固定の日付の行の大きさを合わせ、見えている付近のタイルを描く
        this.updateStickyHeader();
        this.updateSurfaces();
    }

    /**
     * 範囲内に表示すべきスケジュールを取得
     */
    getVisibleSchedulesForRange(sourceSchedules) {
        return sourceSchedules.filter(schedule => {
            const startDate = new Date(schedule.startDate);
            const endDate = new Date(schedule.endDate);
            return startDate <= this.rangeEnd && endDate >= this.rangeStart;
        });
    }

    /**
     * 後方互換用: 単月フィルタ
     */
    getVisibleSchedules(year, month) {
        return this.getVisibleSchedulesFromSource(year, month, schedules);
    }

    getVisibleSchedulesFromSource(year, month, sourceSchedules) {
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);
        return sourceSchedules.filter(schedule => {
            const startDate = new Date(schedule.startDate);
            const endDate = new Date(schedule.endDate);
            return startDate <= monthEnd && endDate >= monthStart;
        });
    }

    /**
     * 行データを構築
     */
    buildRows(visibleSchedules) {
        const viewMode = scheduleSettings.viewMode;
        const rows = [];

        // 担当者順の取得
        const orderString = getMemberOrderString();

        const style = scheduleSettings.taskLabelStyle || 'A';
        if (isMemberTaskLayout()) {
            const members = sortMembers([...new Set(visibleSchedules.map(s => s.member))], orderString);
            return applyTaskLabelStyle(buildMemberTaskRows(visibleSchedules, {
                memberOrder: members, taskSortOrder, collapsed: this.collapsedMembers
            }), style, TASK_ROW_HEIGHTS);
        }

        if (viewMode === SCHEDULE.VIEW_MODE.MEMBER) {
            const memberMap = new Map();
            visibleSchedules.forEach(schedule => {
                if (!memberMap.has(schedule.member)) {
                    memberMap.set(schedule.member, []);
                }
                memberMap.get(schedule.member).push(schedule);
            });
            const sortedMembers = sortMembers([...memberMap.keys()], orderString);
            sortedMembers.forEach(member => {
                rows.push({ label: member, type: 'member', schedules: memberMap.get(member) });
            });
        } else {
            const taskMap = new Map();
            visibleSchedules.forEach(schedule => {
                const taskKey = `${schedule.version}-${schedule.task}`;
                if (!taskMap.has(taskKey)) {
                    taskMap.set(taskKey, { label: schedule.task, version: schedule.version, schedules: [] });
                }
                taskMap.get(taskKey).schedules.push(schedule);
            });
            taskMap.forEach(taskData => {
                rows.push({ label: taskData.label, type: 'task', version: taskData.version, schedules: taskData.schedules });
            });
            // タスク別ビューもタスク名の見せ方（3段／まとめる）に合わせて行を組み替える
            return applyTaskLabelStyle(rows, style, TASK_ROW_HEIGHTS);
        }

        return rows;
    }

    /**
     * ラベル列の最適幅を計算（コンテンツ幅ベース）
     */
    calculateLabelWidth(rows, isMobile, viewMode) {
        const key = this.labelWidthKey(viewMode);
        // PC時はカスタム幅があればそれを使用（表示ごと）
        if (!isMobile && this.customLabelWidths[key]) return this.customLabelWidths[key];
        if (!isMobile) return LABEL_WIDTH;
        // 担当者×タスク表示で全員を畳んでいるときは、以前の担当者別表示と同じく中身（▸・名前・件数）が入る幅まで狭める
        // （件数の分も含めて測るので、名前が件数に押されて見えなくなることはない）。PC は利用者が決めた幅のまま変えない
        if (isMemberTaskLayout() && rows.length > 0 && rows.every(r => r.type === 'memberGroup' && r.collapsed)) {
            return this.measureCollapsedGroupWidth(rows);
        }
        // タスク名の行は折り返すので、スマホでは画面幅の 40% までに収めて折り返させる
        if (isMemberTaskLayout() || rows.some(r => r.type === 'task' || r.type === 'memberTask')) {
            return Math.max(80, Math.floor(window.innerWidth * LABEL_FIT_MAX_RATIO / (this.uiScale || 1)));
        }

        // canvasでテキスト幅を計測
        const ctx = this.labelCtx;
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        let maxTextWidth = 0;
        rows.forEach(row => {
            const w = ctx.measureText(row.label).width;
            if (w > maxTextWidth) maxTextWidth = w;
        });

        // テキスト幅 + テキスト開始オフセット + 右余白をキャンバス幅とする
        const hasDot = rows.some(r => r.color || r.type === 'member');
        const textStart = hasDot ? LABEL_TEXT_OFFSET : LABEL_DOT_LEFT;
        const contentWidth = Math.max(40, Math.ceil(textStart + maxTextWidth + LABEL_PADDING));
        return contentWidth;
    }

    // ============================================
    // 描画メソッド
    // ============================================

    drawTimelineBackground() {
        this.timelineCtx.fillStyle = SURFACE;
        this.timelineCtx.fillRect(0, 0, this.timelineWidth, this.totalHeight);
    }

    drawLabelBackground() {
        this.labelCtx.fillStyle = SURFACE;
        this.labelCtx.fillRect(0, 0, this.labelWidth, this.totalHeight);
    }

    /**
     * ヘッダー描画（timelineCanvas）- 2段構成: 月名 + 日付/曜日
     * Ink & Amber デザインシステム準拠
     */
    drawHeader() {
        const ctx = this.timelineCtx;
        const monthRowH = 20; // 月名行の高さ
        const dayZoneY = monthRowH; // 日付ゾーンの開始Y

        // ヘッダー全体の背景（--surface-elevated）
        ctx.fillStyle = HEADER_BG;
        ctx.fillRect(0, 0, this.timelineWidth, HEADER_HEIGHT);

        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

        // 今日の日付
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1) 日付ゾーンの背景（週末・祝日・今日）を先に描画
        for (const mb of this.monthBoundaries) {
            const monthX = mb.startDayOffset * DAY_WIDTH;
            for (let day = 1; day <= mb.daysInMonth; day++) {
                const x = monthX + (day - 1) * DAY_WIDTH;
                const date = new Date(mb.year, mb.month - 1, day);

                if (date.getTime() === today.getTime()) {
                    // 今日: アクセントライト背景
                    ctx.fillStyle = '#EBF5EA';  // --accent-light
                    ctx.fillRect(x, dayZoneY, DAY_WIDTH, HEADER_HEIGHT - dayZoneY);
                } else if (isWeekend(date)) {
                    ctx.fillStyle = WEEKEND;
                    ctx.fillRect(x, dayZoneY, DAY_WIDTH, HEADER_HEIGHT - dayZoneY);
                } else if (isHoliday(date)) {
                    ctx.fillStyle = HOLIDAY;
                    ctx.fillRect(x, dayZoneY, DAY_WIDTH, HEADER_HEIGHT - dayZoneY);
                }
            }
        }

        // 2) 月名行の背景と月名テキスト（上段）
        for (let i = 0; i < this.monthBoundaries.length; i++) {
            const mb = this.monthBoundaries[i];
            const monthX = mb.startDayOffset * DAY_WIDTH;
            const monthWidth = mb.daysInMonth * DAY_WIDTH;

            // 月名行: surface-elevated ベースに交互で微妙な差
            ctx.fillStyle = i % 2 === 0 ? '#F5F4F2' : HEADER_BG;
            ctx.fillRect(monthX, 0, monthWidth, monthRowH);

            // 月名テキスト（--text-primary, 600 weight）
            ctx.fillStyle = TEXT_PRIMARY;
            ctx.font = '600 12px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${mb.year}年${mb.month}月`, monthX + monthWidth / 2, monthRowH / 2);
        }

        // 月名行と日付行の区切り線（--border-light）
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, monthRowH);
        ctx.lineTo(this.timelineWidth, monthRowH);
        ctx.stroke();

        // 3) 日付・曜日テキスト（下段）
        const dayNumY = dayZoneY + (HEADER_HEIGHT - dayZoneY) * 0.35;
        const dayNameY = dayZoneY + (HEADER_HEIGHT - dayZoneY) * 0.75;

        for (const mb of this.monthBoundaries) {
            const monthX = mb.startDayOffset * DAY_WIDTH;
            for (let day = 1; day <= mb.daysInMonth; day++) {
                const x = monthX + (day - 1) * DAY_WIDTH;
                const date = new Date(mb.year, mb.month - 1, day);
                const dayOfWeek = date.getDay();
                const isToday = date.getTime() === today.getTime();

                if (isToday) {
                    // 今日: アクセントカラー
                    ctx.fillStyle = '#2D5A27';  // --accent
                } else if (dayOfWeek === 0 || isHoliday(date)) {
                    ctx.fillStyle = '#B91C1C';  // --danger
                } else if (dayOfWeek === 6) {
                    ctx.fillStyle = '#1D6FA5';  // --info
                } else {
                    ctx.fillStyle = TEXT_MUTED;
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '600 11px system-ui, -apple-system, sans-serif';
                ctx.fillText(String(day), x + DAY_WIDTH / 2, dayNumY);

                ctx.font = '10px system-ui, -apple-system, sans-serif';
                ctx.fillText(dayNames[dayOfWeek], x + DAY_WIDTH / 2, dayNameY);
            }
        }

        // 4) 月境界の区切り線（ヘッダー内、--border）
        for (const mb of this.monthBoundaries) {
            if (mb.startDayOffset === 0) continue;
            const x = mb.startDayOffset * DAY_WIDTH;
            ctx.strokeStyle = BORDER;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, HEADER_HEIGHT);
            ctx.stroke();
        }

        // ヘッダー下部の線（--border）
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, HEADER_HEIGHT);
        ctx.lineTo(this.timelineWidth, HEADER_HEIGHT);
        ctx.stroke();
    }

    /**
     * ラベルヘッダー描画（labelCanvas）
     * Ink & Amber デザインシステム準拠
     */
    drawLabelHeader() {
        const ctx = this.labelCtx;
        ctx.fillStyle = HEADER_BG;
        ctx.fillRect(0, 0, this.labelWidth, HEADER_HEIGHT);

        // ヘッダーラベル（表示モードに応じて動的に変更）
        const headerLabel = scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.TASK ? 'タスク'
            : isMemberTaskLayout() ? '担当者 / タスク' : '担当者';
        ctx.fillStyle = TEXT_MUTED;
        ctx.font = '600 12px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(headerLabel, 14, HEADER_HEIGHT / 2);

        // ヘッダー下部の線（--border）
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, HEADER_HEIGHT);
        ctx.lineTo(this.labelWidth, HEADER_HEIGHT);
        ctx.stroke();

        // 右端の区切り線（--border）
        ctx.strokeStyle = BORDER;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.labelWidth - 0.5, 0);
        ctx.lineTo(this.labelWidth - 0.5, this.totalHeight);
        ctx.stroke();
    }

    /**
     * グリッド描画（timelineCanvas）
     * Ink & Amber: --border-light で繊細なグリッド
     */
    drawGrid() {
        const ctx = this.timelineCtx;

        // 縦線（--border-light: 繊細な区切り）
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 0.5;
        const [gridFrom, gridTo] = this.paintDayRange();
        for (let day = gridFrom; day <= gridTo; day++) {
            const x = day * DAY_WIDTH;
            ctx.beginPath();
            ctx.moveTo(x, HEADER_HEIGHT);
            ctx.lineTo(x, this.totalHeight);
            ctx.stroke();
        }

        // 横線（--border-light: 行区切り）
        const lineYs = [...this.rowLayout.offsets, this.rowLayout.totalHeight];
        lineYs.forEach(y => {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.timelineWidth, y);
            ctx.stroke();
        });
    }

    /**
     * 月境界線を描画（ボディ部分）
     * Ink & Amber: --border で控えめな区切り
     */
    drawMonthSeparators() {
        const ctx = this.timelineCtx;
        for (const mb of this.monthBoundaries) {
            if (mb.startDayOffset === 0) continue;
            const x = mb.startDayOffset * DAY_WIDTH;

            // 控えめな実線（--border）
            ctx.strokeStyle = BORDER;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, HEADER_HEIGHT);
            ctx.lineTo(x, this.totalHeight);
            ctx.stroke();
        }
    }

    /**
     * 今日の線を描画
     * Ink & Amber: ソリッド2px赤ライン + 上部に丸インジケータ
     */
    /** @returns {number|null} 今日の列の左端 x（表示範囲外なら null） */
    todayColumnX() {
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        if (today < this.rangeStart || today > this.rangeEnd) return null;
        return this.dateToX(today);
    }

    /**
     * 今日の線を、行の背景の上・バーの下に描く（バーや遅延のはみ出しを縦に切らないよう、その下に回す）
     * @param {number} y - 行の上端
     * @param {number} h - 行の高さ
     */
    drawTodayMarkBehindBars(y, h) {
        const colX = this.todayColumnX();
        if (colX === null) return;
        this.timelineCtx.fillStyle = TODAY_LINE;
        this.timelineCtx.fillRect(colX + DAY_WIDTH / 2 - 1, y, 2, h);
    }

    /** 今日の線の残り（行の無い下の余白）と、日付の行の小さな丸 */
    drawTodayLine() {
        const colX = this.todayColumnX();
        if (colX === null) return;
        const ctx = this.timelineCtx;
        const x = colX + DAY_WIDTH / 2;
        const rowsBottom = this.rowLayout.totalHeight;
        ctx.fillStyle = TODAY_LINE;
        ctx.fillRect(x - 1, rowsBottom, 2, this.totalHeight - rowsBottom);

        // 月名行と日付行の境界に小さな丸インジケータ
        const monthRowH = 20;
        ctx.beginPath();
        ctx.arc(x, monthRowH, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 行を描画（timelineCanvas - バーのみ）
     * Ink & Amber デザインシステム準拠
     */
    drawRows(rows) {
        const ctx = this.timelineCtx;

        const [dayFrom, dayTo] = this.paintDayRange();
        rows.forEach((row, index) => {
            const y = this.rowY(index);
            const rowH = this.rowHeight(index);
            // タイルに掛からない行は描かない（集計のための全体描画では全行を描く）
            if (!this.paintHitsY(y, rowH)) return;

            // ゼブラストライプ
            const zebraColor = index % 2 === 0 ? ZEBRA_LIGHT : ZEBRA_DARK;
            ctx.fillStyle = zebraColor;
            ctx.fillRect(0, y, this.timelineWidth, rowH);

            // ホバー行のハイライト
            if (index === this.hoverRowIndex) {
                ctx.fillStyle = HOVER_HIGHLIGHT;
                ctx.fillRect(0, y, this.timelineWidth, rowH);
            }

            // 担当者名（担当者別・担当者×タスクの場合、休暇チェック用）
            const memberName = rowMember(row);

            // 週末・祝日・担当者休暇の背景（全日数分）
            for (let dayOffset = dayFrom; dayOffset < dayTo; dayOffset++) {
                const date = new Date(this.rangeStart);
                date.setDate(date.getDate() + dayOffset);
                const x = dayOffset * DAY_WIDTH;

                if (isWeekend(date)) {
                    // 週末: #FAF9F7 ベース（ゼブラで微差）
                    ctx.fillStyle = index % 2 === 0 ? '#FAF9F7' : '#F5F4F2';
                    ctx.fillRect(x, y, DAY_WIDTH, rowH);
                } else if (isHoliday(date)) {
                    // 祝日: --accent-secondary-light ベース
                    ctx.fillStyle = index % 2 === 0 ? '#FFF8ED' : '#FFF3E0';
                    ctx.fillRect(x, y, DAY_WIDTH, rowH);
                } else if (memberName) {
                    // 担当者休暇チェック（担当者別ビューのみ）
                    const dateStr = formatDateString(date);
                    const vacation = getMemberVacation(memberName, dateStr);
                    if (vacation) {
                        if (vacation.hours >= 8 || vacation.vacationType !== '時間休') {
                            // 全日休暇: 薄い紫系
                            ctx.fillStyle = index % 2 === 0 ? '#F5F0F7' : '#EFE9F2';
                            ctx.fillRect(x, y, DAY_WIDTH, rowH);
                        } else {
                            // 時間休（部分休暇）
                            ctx.fillStyle = index % 2 === 0 ? '#F9F4FB' : '#F4EFF6';
                            ctx.fillRect(x, y + rowH / 2, DAY_WIDTH, rowH / 2);
                        }
                    }
                }
            }

            // 完了版数の行かどうかを判定（行全体のグレーアウト用）
            const isCompletedRow = this.completedVersions.size > 0 &&
                row.schedules.length > 0 &&
                row.schedules.every(s => this.completedVersions.has(s.version));

            // 完了済み版数の行は背景をさらに淡くする
            if (isCompletedRow) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
                ctx.fillRect(0, y, this.timelineWidth, rowH);
            }

            // 今日の線（行の背景の上・バーの下）
            this.drawTodayMarkBehindBars(y, rowH);

            // 開いている担当者の見出し行: バーの代わりに日ごとの本数の帯（畳んだ見出し行は下で従来どおりバーを描く）
            if (row.type === 'memberGroup' && !row.collapsed) {
                this.drawLoadStrip(row, index, y, rowH);
                return;
            }
            // 版数・処理名の見出し行はバーを描かない
            if (isHeadRow(row)) return;
            // 基本の高さが標準より高い行（3段など）は、1段目のバーを基本の高さの中央に置く
            const barBaseY = y + ((row.baseHeight ?? ROW_HEIGHT) - ROW_HEIGHT) / 2;

            // スケジュールバーを描画（開始日昇順＝後のバーが手前に重なる）
            const sorted = [...row.schedules].sort((a, b) =>
                new Date(a.startDate) - new Date(b.startDate)
            );
            // レーンごとに下へずらして描く（重なった予定を別の段に分ける）
            sorted.forEach(schedule => {
                const lane = row.lanes ? (row.lanes.laneOf.get(schedule.id) || 0) : 0;
                this.drawScheduleBar(schedule, barBaseY + lane * LANE_HEIGHT, index);
            });
        });
    }

    /**
     * ラベル列を描画（labelCanvas）
     * Ink & Amber: メンバードット + 600 weight フォント
     */
    drawLabelColumn(rows) {
        const ctx = this.labelCtx;
        const dotSize = LABEL_DOT_SIZE;
        const dotLeftPad = LABEL_DOT_LEFT;
        const textLeftPad = LABEL_TEXT_OFFSET;

        rows.forEach((row, index) => {
            const y = this.rowY(index);
            const rowH = this.rowHeight(index);
            if (!this.paintHitsY(y, rowH)) return;

            // ゼブラ背景
            ctx.fillStyle = index % 2 === 0 ? ZEBRA_LIGHT : ZEBRA_DARK;
            ctx.fillRect(0, y, this.labelWidth, rowH);

            // ホバーハイライト
            if (index === this.hoverRowIndex) {
                ctx.fillStyle = HOVER_HIGHLIGHT;
                ctx.fillRect(0, y, this.labelWidth, rowH);
            }

            // 横線（--border-light）
            ctx.strokeStyle = GRID;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y + rowH);
            ctx.lineTo(this.labelWidth, y + rowH);
            ctx.stroke();

            const centerY = y + rowH / 2;

            // 担当者×タスク表示の見出し行・タスク行、タスク別ビューの行は専用の描き方
            if (row.type === 'memberGroup') {
                this.drawGroupLabel(row, index, y, rowH);
                return;
            }
            if (isHeadRow(row)) {
                this.drawHeadLabel(row, y, rowH);
                return;
            }
            if (row.type === 'memberTask' || row.type === 'task') {
                this.drawTaskLabel(row, y, rowH);
                return;
            }

            // 完了済み版数の行かどうか判定
            const isCompletedRow = this.completedVersions.size > 0 &&
                row.schedules.length > 0 &&
                row.schedules.every(s => this.completedVersions.has(s.version));

            // メンバードット（色付き丸）
            if (row.color || row.type === 'member') {
                const dotColor = row.color || this.getMemberDotColor(row.label, index);
                ctx.fillStyle = isCompletedRow ? TEXT_MUTED : dotColor;
                if (isCompletedRow) ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.arc(dotLeftPad + dotSize / 2, centerY, dotSize / 2, 0, Math.PI * 2);
                ctx.fill();
                if (isCompletedRow) ctx.globalAlpha = 1.0;
            }

            // ラベルテキスト
            ctx.fillStyle = isCompletedRow ? TEXT_MUTED : TEXT_PRIMARY;
            ctx.font = isCompletedRow
                ? '400 13px system-ui, -apple-system, sans-serif'
                : '600 13px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            const labelStartX = (row.color || row.type === 'member') ? textLeftPad : dotLeftPad;
            const maxLabelWidth = this.labelWidth - labelStartX - 8;
            let labelText = row.label;

            // 完了版数の行は先頭に ✓ を付与
            if (isCompletedRow) {
                labelText = '✓ ' + labelText;
            }

            while (ctx.measureText(labelText).width > maxLabelWidth && labelText.length > 0) {
                labelText = labelText.slice(0, -1);
            }
            if (labelText !== row.label && labelText !== '✓ ' + row.label) {
                labelText += '…';
            }

            ctx.fillText(labelText, labelStartX, centerY);
        });
    }

    /**
     * 担当者×タスク表示の担当者の見出し（▾・ドット・名前・件数）
     */
    drawGroupLabel(row, index, y, rowH) {
        const ctx = this.labelCtx;
        const centerY = y + rowH / 2;
        // 畳んだ行は従来の担当者行（バーの行）なので、見出しの背景は他の担当者行と同じにする
        if (row.collapsed) {
            ctx.fillStyle = index % 2 === 0 ? ZEBRA_LIGHT : ZEBRA_DARK;
            ctx.fillRect(0, y, this.labelWidth, rowH - 0.5);
        }
        if (!row.collapsed) {
            ctx.fillStyle = GROUP_ROW_BG;
            ctx.fillRect(0, y, this.labelWidth, rowH - 0.5);
        }

        // ▾（畳んでいるときは ▸）
        ctx.save();
        ctx.strokeStyle = TEXT_MUTED;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const cx = GROUP_CHEVRON_LEFT + 5;
        if (row.collapsed) {
            ctx.moveTo(cx - 2, centerY - 4); ctx.lineTo(cx + 2, centerY); ctx.lineTo(cx - 2, centerY + 4);
        } else {
            ctx.moveTo(cx - 4, centerY - 2); ctx.lineTo(cx, centerY + 2); ctx.lineTo(cx + 4, centerY - 2);
        }
        ctx.stroke();
        ctx.restore();

        const dotX = GROUP_CHEVRON_LEFT + 16;
        ctx.fillStyle = this.getMemberDotColor(row.label, index);
        ctx.beginPath();
        ctx.arc(dotX + LABEL_DOT_SIZE / 2, centerY, LABEL_DOT_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();

        const countText = `${row.taskCount} 件`;
        ctx.font = '500 11.5px system-ui, -apple-system, sans-serif';
        const countW = ctx.measureText(countText).width;
        ctx.fillStyle = TEXT_MUTED;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(countText, this.labelWidth - 10, centerY);

        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = TEXT_PRIMARY;
        ctx.textAlign = 'left';
        const nameX = dotX + LABEL_DOT_SIZE + 8;
        const { lines } = wrapLabel(row.label, this.labelWidth - nameX - countW - 18, 1, (t) => ctx.measureText(t).width);
        ctx.fillText(lines[0], nameX, centerY);
    }

    /**
     * 版数・処理名の見出し行（タスク名の見せ方「まとめる」）。版数の見出しは件数付き
     */
    drawHeadLabel(row, y, rowH) {
        const ctx = this.labelCtx;
        const centerY = y + rowH / 2;
        const x = labelIndent(row);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let right = this.labelWidth - 10;
        if (row.type === 'versionHead') {
            ctx.font = '500 11px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = TEXT_MUTED;
            ctx.textAlign = 'right';
            const cnt = `${row.taskCount} 件`;
            ctx.fillText(cnt, right, centerY);
            right -= ctx.measureText(cnt).width + 8;
            ctx.textAlign = 'left';
            ctx.font = '700 12px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = TEXT_MUTED;
        } else {
            ctx.font = `600 ${TASK_LABEL_FONT_PX}px system-ui, -apple-system, sans-serif`;
            ctx.fillStyle = TEXT_PRIMARY;
        }
        const { lines, clipped } = wrapLabel(row.label, right - x, 1, (t) => ctx.measureText(t).width);
        ctx.fillText(lines[0], x, centerY);
        row.labelClipped = clipped;
        row.fullLabel = { version: row.type === 'versionHead' ? '版数' : (row.version || ''), name: row.label };
    }

    /**
     * タスクの見出し（色の目印＋タスク名）。タスク名の見せ方（row.labelMode）で書き分ける
     * - 'A': 版数 ／ 処理名（太字 1 行）／ 対応名（残りの高さで折り返し）
     * - 'detail': 対応名だけ（処理名の見出しの下）
     * - 'procDetail': 処理名（太字 1 行）／ 対応名（1 行）
     * 対応名は文節の切れ目で折り返し、入らない分は …。省略したかと全文を row.labelClipped / row.fullLabel に記録する
     */
    drawTaskLabel(row, y, rowH) {
        const ctx = this.labelCtx;
        const indent = labelIndent(row);
        const isCompletedRow = this.completedVersions.size > 0 &&
            row.schedules.length > 0 &&
            row.schedules.every(s => this.completedVersions.has(s.version));
        const mode = row.labelMode || 'A';
        const baseH = row.baseHeight ?? rowH;

        // 色の目印（基本の高さの範囲に描く。段が増えて行が高くなっても 1 段目に揃える）
        ctx.fillStyle = isCompletedRow ? TEXT_MUTED : getTaskColor(row.version, row.label);
        fillRoundRect(ctx, indent, y + 6, TASK_SWATCH_W, baseH - 12, 2);

        const textX = indent + TASK_SWATCH_W + 8;
        const maxWidth = this.labelWidth - textX - 8;
        const font = (weight, px) => `${weight} ${px}px system-ui, -apple-system, sans-serif`;
        const measureWith = (f) => (t) => { ctx.font = f; return ctx.measureText(t).width; };
        const proc = row.proc || '';
        const detail = row.detail ?? row.label;
        const lines = []; // { text, font, color }
        let clipped = false;
        const push = (text, f, color, maxLines, phrase) => {
            const r = wrapLabel(text, maxWidth, maxLines, measureWith(f), { phrase });
            if (r.clipped) clipped = true;
            r.lines.forEach(t => lines.push({ text: t, font: f, color }));
        };
        const textColor = isCompletedRow ? TEXT_MUTED : TEXT_PRIMARY;
        const procFont = font(600, TASK_LABEL_FONT_PX + 0.5);
        const detailFont = font(500, TASK_LABEL_FONT_PX);
        const lineSlots = Math.max(1, Math.floor((baseH - 6) / TASK_LABEL_LINE_H));

        if (mode === 'A') {
            push(`${isCompletedRow ? '✓ ' : ''}${row.version || ''}`, font(600, TASK_LABEL_FONT_PX - 2), TEXT_MUTED, 1, false);
            if (proc) push(proc, procFont, textColor, 1, false);
            push(detail, proc ? detailFont : procFont, textColor, Math.max(1, lineSlots - lines.length), true);
        } else if (mode === 'procDetail') {
            push(proc, procFont, textColor, 1, false);
            push(detail, detailFont, textColor, 1, true);
        } else {
            push(detail, detailFont, textColor, Math.max(2, lineSlots), true);
        }
        row.labelClipped = clipped;
        row.fullLabel = { version: row.version || '', name: row.label };

        // 基本の高さの中で上下中央に並べる（版数の行は少し詰める）
        const lineH = (l) => (l.color === TEXT_MUTED && mode === 'A' && l === lines[0] ? TASK_LABEL_LINE_H - 2 : TASK_LABEL_LINE_H);
        const blockH = lines.reduce((sum, l) => sum + lineH(l), 0);
        let lineY = y + (baseH - blockH) / 2;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        lines.forEach(l => {
            const h = lineH(l);
            ctx.font = l.font;
            ctx.fillStyle = l.color;
            ctx.fillText(l.text, textX, lineY + h / 2);
            lineY += h;
        });
    }

    /**
     * 担当者の見出し行の帯（その日に表示されているバーの本数。2 本以上の日は数字も出す）。セルを this.stripCells に記録する
     */
    drawLoadStrip(row, index, y, rowH) {
        const ctx = this.timelineCtx;
        const days = [];
        for (let i = 0; i < this.totalDays; i++) {
            const d = new Date(this.rangeStart);
            d.setDate(d.getDate() + i);
            days.push(formatDateString(d));
        }
        // その日に表示されているバーの本数（分割された予定は区間ごと）
        const load = countDailyLoad(row.schedules, days, (s) => ((s.interruptions || []).length > 0
            ? calculateSegments(s).map(seg => ({ start: seg.startDate, end: seg.endDate }))
            : [{ start: s.startDate, end: s.endDate }]));

        const top = y + (rowH - LOAD_STRIP_H) / 2;
        const cells = [];
        days.forEach((ds, i) => {
            const list = load.get(ds);
            if (!list) return;
            const x = i * DAY_WIDTH;
            const n = list.length;
            ctx.fillStyle = LOAD_COLORS[Math.min(n, 3) - 1];
            ctx.fillRect(x + 1, top, DAY_WIDTH - 2, LOAD_STRIP_H);
            // 1 本の日は色だけ（数字を出すのは重なっている日）
            if (n >= 2) {
                ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                ctx.fillStyle = n >= 3 ? '#FFFFFF' : TEXT_PRIMARY;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(n), x + DAY_WIDTH / 2, top + LOAD_STRIP_H / 2 + 0.5);
            }
            cells.push({ x, date: ds, list });
        });
        this.stripCells.set(index, cells);
    }

    /**
     * 担当者の帯のセル（その日の予定一覧）を座標から引く
     * @returns {{rowIndex: number, x: number, date: string, list: Object[]}|null}
     */
    getStripCellAtPosition(x, y) {
        const rowIndex = this.getRowIndexAtPosition(y);
        const cells = this.stripCells.get(rowIndex);
        if (!cells) return null;
        const cell = cells.find(c => x >= c.x && x < c.x + DAY_WIDTH);
        return cell ? { rowIndex, ...cell } : null;
    }

    /** 担当者×タスク表示の担当者を畳む・開く */
    toggleMemberCollapsed(member) {
        if (this.collapsedMembers.has(member)) this.collapsedMembers.delete(member);
        else this.collapsedMembers.add(member);
        this.render(this.currentYear, this.currentMonth, this.filteredSchedulesCache);
    }

    /**
     * メンバードットの色を取得
     */
    getMemberDotColor(label, index) {
        // メンバー用：タスク色と区別するためニュートラル・低彩度系
        const dotColors = [
            '#5C6B7A', '#7A6B5C', '#6B5C7A', '#5C7A6B',
            '#7A5C6B', '#6B7A5C', '#5C6B8A', '#8A6B5C',
            '#6B5C8A', '#5C8A6B', '#7A7A5C', '#5C7A7A'
        ];
        return dotColors[index % dotColors.length];
    }

    /**
     * スケジュールバーを描画（dateToX座標系）
     *
     * @param {Object} schedule
     * @param {number} rowY - バーを置くレーンの上端 Y（行上端＋レーン×LANE_HEIGHT）
     * @param {number} rowIndex - 行 index（ゼブラ判定用）
     */
    drawScheduleBar(schedule, rowY, rowIndex) {
        const ctx = this.timelineCtx;

        if (schedule.interruptions && schedule.interruptions.length > 0) {
            this.drawSplitScheduleBar(schedule, rowY, rowIndex);
            return;
        }

        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        // 描画範囲にクリップ
        const visibleStart = startDate < this.rangeStart ? this.rangeStart : startDate;
        const visibleEnd = endDate > this.rangeEnd ? this.rangeEnd : endDate;

        if (visibleStart > visibleEnd) return;

        const barX = this.dateToX(visibleStart);
        const barEndX = this.dateToX(visibleEnd) + DAY_WIDTH;
        const barWidth = barEndX - barX;
        const barY = rowY + ROW_PADDING;

        // 完了版数かどうか
        const isCompletedVersion = this.completedVersions.has(schedule.version);

        // タスクの色を取得
        const taskColor = isCompletedVersion
            ? this.desaturateColor(getTaskColor(schedule.version, schedule.task), 0.7)
            : getTaskColor(schedule.version, schedule.task);
        const lightColor = this.lightenColor(taskColor, 0.6);

        // 完了版数はアルファを下げる
        if (isCompletedVersion) {
            ctx.save();
            ctx.globalAlpha = 0.35;
        }

        const isEvenRow = rowIndex % 2 === 0;

        // 休日の日を事前計算（座標と背景色を記録）
        const holidayDays = [];
        const current = new Date(visibleStart);
        while (current <= visibleEnd) {
            if (!isBusinessDay(current, schedule.member)) {
                const hx = this.dateToX(current);
                // セルの背景色を判定（Ink & Amber 準拠）
                let bgColor;
                if (isWeekend(current)) {
                    bgColor = isEvenRow ? '#FAF9F7' : '#F5F4F2';
                } else if (isHoliday(current)) {
                    bgColor = isEvenRow ? '#FFF8ED' : '#FFF3E0';
                } else {
                    // 担当者休暇
                    bgColor = isEvenRow ? '#F5F0F7' : '#EFE9F2';
                }
                holidayDays.push({ x: hx, bgColor });
            }
            current.setDate(current.getDate() + 1);
        }

        // 進捗情報
        const progressInfo = this.getScheduleProgress(schedule);

        // === バー描画（単一の角丸クリップ内で全て描画） ===
        ctx.save();
        clipRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);

        // ベースバー（ソリッドカラー）
        ctx.fillStyle = taskColor;
        ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);

        // 未進捗部分を薄い色で上塗り
        if (progressInfo.progressRate < 100) {
            if (progressInfo.progressRate > 0) {
                const actualBarWidth = barWidth * (progressInfo.progressRate / 100);
                ctx.fillStyle = lightColor;
                ctx.fillRect(barX + actualBarWidth, barY, barWidth - actualBarWidth, BAR_HEIGHT);
            } else {
                ctx.fillStyle = lightColor;
                ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);
            }
        }

        // 休日セル: バーの該当部分を背景色で塗りつぶし
        holidayDays.forEach(({ x, bgColor }) => {
            ctx.globalAlpha = 0.82;
            ctx.fillStyle = bgColor;
            ctx.fillRect(x, barY, DAY_WIDTH, BAR_HEIGHT);
        });
        ctx.globalAlpha = 1.0;

        // レビュー予定は斜めストライプで本作業と区別
        if (schedule.isReview) {
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 3;
            const stripeGap = 8;
            for (let sx = barX - BAR_HEIGHT; sx < barX + barWidth + BAR_HEIGHT; sx += stripeGap) {
                ctx.beginPath();
                ctx.moveTo(sx, barY + BAR_HEIGHT);
                ctx.lineTo(sx + BAR_HEIGHT, barY);
                ctx.stroke();
            }
        }

        ctx.restore();

        // 長押しハイライト（モバイルドラッグ開始時）
        if (this.highlightedScheduleId === schedule.id) {
            ctx.save();
            ctx.shadowColor = taskColor;
            ctx.shadowBlur = 8;
            ctx.strokeStyle = taskColor;
            ctx.lineWidth = 2;
            strokeRoundRect(ctx, barX - 1, barY - 1, barWidth + 2, BAR_HEIGHT + 2, BAR_RADIUS);
            ctx.restore();
        }

        // 新規作成ハイライト（--accent-secondary の破線グロー）
        if (this.newlyCreatedIds.has(schedule.id)) {
            ctx.save();
            ctx.shadowColor = SCHEDULE.COLORS.HOLIDAY;
            ctx.shadowBlur = 10;
            ctx.strokeStyle = '#C4841D';  // --accent-secondary
            ctx.lineWidth = 2.5;
            ctx.setLineDash([4, 2]);
            strokeRoundRect(ctx, barX - 1, barY - 1, barWidth + 2, BAR_HEIGHT + 2, BAR_RADIUS);
            ctx.setLineDash([]);
            ctx.restore();
        }

        // テキスト表示（工程 | ステータスアイコン | %を重ならないよう配置）
        {
            const progressRate = Math.round(progressInfo.progressRate);
            const barCenterY = barY + BAR_HEIGHT / 2;
            ctx.textBaseline = 'middle';

            const percentText = `${progressRate}%`;
            const rightPad = 6;
            const processLeftPad = 6;
            const gap = 4;

            // ステータスアイコン判定
            let statusIcon = '';
            if (schedule.status === SCHEDULE.STATUS.COMPLETED) {
                statusIcon = '✓';
            } else if (this.isDelayed(schedule)) {
                statusIcon = '!';
            }

            const sysFont = 'system-ui, -apple-system, sans-serif';

            // 各要素の幅を測定
            ctx.font = `bold 10px ${sysFont}`;
            const percentWidth = ctx.measureText(percentText).width;
            ctx.font = `bold 11px ${sysFont}`;
            const iconWidth = statusIcon ? ctx.measureText(statusIcon).width + 2 : 0;
            ctx.font = `600 11px ${sysFont}`;
            const processText = schedule.isReview ? `${schedule.process || ''} R` : (schedule.process || '');
            const processWidth = ctx.measureText(processText).width;

            // テキスト色（白ベース、半透明で階調をつける）
            const textColor = '#ffffff';
            const textColorMuted = 'rgba(255,255,255,0.75)';

            // バー内に全要素が収まるか判定
            const rightOccupied = percentWidth + iconWidth + rightPad;
            const allInsideWidth = processLeftPad + processWidth + gap + rightOccupied;
            const fitsInside = barWidth >= allInsideWidth;

            if (fitsInside) {
                // バー内に全て収まる: [工程 ... アイコン %]
                ctx.font = `600 11px ${sysFont}`;
                ctx.fillStyle = textColor;
                ctx.textAlign = 'left';
                ctx.fillText(processText, barX + processLeftPad, barCenterY);

                if (statusIcon) {
                    ctx.fillStyle = textColor;
                    ctx.font = `bold 11px ${sysFont}`;
                    ctx.textAlign = 'right';
                    ctx.fillText(statusIcon, barX + barWidth - rightPad - percentWidth - 2, barCenterY);
                }

                ctx.textAlign = 'right';
                ctx.fillStyle = textColorMuted;
                ctx.font = `bold 10px ${sysFont}`;
                ctx.fillText(percentText, barX + barWidth - rightPad, barCenterY);
            } else {
                // バー内に収まらない: 工程を優先、%は余裕があれば表示
                const availableWidth = barWidth - processLeftPad - rightPad;

                const bothFitCompact = processWidth + gap + percentWidth <= availableWidth;

                if (bothFitCompact) {
                    ctx.font = `600 11px ${sysFont}`;
                    ctx.fillStyle = textColor;
                    ctx.textAlign = 'left';
                    ctx.fillText(processText, barX + processLeftPad, barCenterY);

                    ctx.textAlign = 'right';
                    ctx.fillStyle = textColorMuted;
                    ctx.font = `bold 10px ${sysFont}`;
                    ctx.fillText(percentText, barX + barWidth - rightPad, barCenterY);
                } else if (processWidth <= availableWidth) {
                    ctx.font = `600 11px ${sysFont}`;
                    ctx.fillStyle = textColor;
                    ctx.textAlign = 'left';
                    ctx.fillText(processText, barX + processLeftPad, barCenterY);
                }
            }
        }

        // 完了版数のアルファを復元
        if (isCompletedVersion) {
            ctx.restore();
        }

        // クリック判定用矩形（分割バーと形を揃えるためセグメント情報を必ず持たせる）
        this.scheduleRects.push({
            schedule,
            x: barX,
            y: barY,
            width: barWidth,
            height: BAR_HEIGHT,
            segmentIndex: 0,
            interruptionId: null,
            isPinned: false,
            segmentStartDate: schedule.startDate
        });

        this.drawOverrunTail(schedule, barY);
    }

    /**
     * 中断のあるスケジュールをセグメント単位で分割描画する。
     * drawScheduleBar と同じ視覚言語（進捗按分・休日オーバーレイ・レビューストライプ・
     * 長押し/新規作成ハイライト）をセグメントごとに適用し、境界に ✂ マークと
     * 点線コネクタを重ねる。
     *
     * @param {Object} schedule
     * @param {number} rowY - バーを置くレーンの上端 Y（行上端＋レーン×LANE_HEIGHT）
     * @param {number} rowIndex - 行 index（ゼブラ判定用）
     */
    drawSplitScheduleBar(schedule, rowY, rowIndex) {
        const ctx = this.timelineCtx;
        const segments = calculateSegments(schedule);
        if (segments.length === 0) return;

        const isCompletedVersion = this.completedVersions.has(schedule.version);
        const taskColor = isCompletedVersion
            ? this.desaturateColor(getTaskColor(schedule.version, schedule.task), 0.7)
            : getTaskColor(schedule.version, schedule.task);
        const lightColor = this.lightenColor(taskColor, 0.6);

        if (isCompletedVersion) {
            ctx.save();
            ctx.globalAlpha = 0.35;
        }

        const barY = rowY + ROW_PADDING;
        const isEvenRow = rowIndex % 2 === 0;

        // スケジュール全体の進捗を、セグメントの見積工数で先頭から按分する
        const progressInfo = this.getScheduleProgress(schedule);
        let doneHours = schedule.estimatedHours > 0
            ? schedule.estimatedHours * (progressInfo.progressRate / 100)
            : 0;

        const segmentRects = [];
        const sysFont = 'system-ui, -apple-system, sans-serif';

        segments.forEach((seg, i) => {
            const segStart = new Date(seg.startDate);
            const segEnd = new Date(seg.endDate);

            const visStart = segStart < this.rangeStart ? this.rangeStart : segStart;
            const visEnd = segEnd > this.rangeEnd ? this.rangeEnd : segEnd;
            if (visStart > visEnd) {
                doneHours = Math.max(0, doneHours - seg.hours);
                return;
            }

            const barX = this.dateToX(visStart);
            const barEndX = this.dateToX(visEnd) + DAY_WIDTH;
            const barWidth = barEndX - barX;

            const holidayDays = [];
            const current = new Date(visStart);
            while (current <= visEnd) {
                if (!isBusinessDay(current, schedule.member)) {
                    const hx = this.dateToX(current);
                    let bgColor;
                    if (isWeekend(current)) {
                        bgColor = isEvenRow ? '#FAF9F7' : '#F5F4F2';
                    } else if (isHoliday(current)) {
                        bgColor = isEvenRow ? '#FFF8ED' : '#FFF3E0';
                    } else {
                        bgColor = isEvenRow ? '#F5F0F7' : '#EFE9F2';
                    }
                    holidayDays.push({ x: hx, bgColor });
                }
                current.setDate(current.getDate() + 1);
            }

            const segProgressRatio = seg.hours > 0 ? Math.min(1, Math.max(0, doneHours / seg.hours)) : 1;
            doneHours = Math.max(0, doneHours - seg.hours);

            ctx.save();
            clipRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);

            ctx.fillStyle = taskColor;
            ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);

            if (segProgressRatio < 1) {
                if (segProgressRatio > 0) {
                    const doneWidth = barWidth * segProgressRatio;
                    ctx.fillStyle = lightColor;
                    ctx.fillRect(barX + doneWidth, barY, barWidth - doneWidth, BAR_HEIGHT);
                } else {
                    ctx.fillStyle = lightColor;
                    ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);
                }
            }

            holidayDays.forEach(({ x, bgColor }) => {
                ctx.globalAlpha = 0.82;
                ctx.fillStyle = bgColor;
                ctx.fillRect(x, barY, DAY_WIDTH, BAR_HEIGHT);
            });
            ctx.globalAlpha = 1.0;

            if (schedule.isReview) {
                ctx.strokeStyle = 'rgba(255,255,255,0.45)';
                ctx.lineWidth = 3;
                const stripeGap = 8;
                for (let sx = barX - BAR_HEIGHT; sx < barX + barWidth + BAR_HEIGHT; sx += stripeGap) {
                    ctx.beginPath();
                    ctx.moveTo(sx, barY + BAR_HEIGHT);
                    ctx.lineTo(sx + BAR_HEIGHT, barY);
                    ctx.stroke();
                }
            }

            ctx.restore();

            // 長押し/新規作成ハイライトはセグメント単位で適用する
            // （複数セグメントにまたがる一体の枠線は将来改善の余地として許容する）
            if (this.highlightedScheduleId === schedule.id) {
                ctx.save();
                ctx.shadowColor = taskColor;
                ctx.shadowBlur = 8;
                ctx.strokeStyle = taskColor;
                ctx.lineWidth = 2;
                strokeRoundRect(ctx, barX - 1, barY - 1, barWidth + 2, BAR_HEIGHT + 2, BAR_RADIUS);
                ctx.restore();
            }
            if (this.newlyCreatedIds.has(schedule.id)) {
                ctx.save();
                ctx.shadowColor = SCHEDULE.COLORS.HOLIDAY;
                ctx.shadowBlur = 10;
                ctx.strokeStyle = '#C4841D';
                ctx.lineWidth = 2.5;
                ctx.setLineDash([4, 2]);
                strokeRoundRect(ctx, barX - 1, barY - 1, barWidth + 2, BAR_HEIGHT + 2, BAR_RADIUS);
                ctx.setLineDash([]);
                ctx.restore();
            }

            // ✂マーク（セグメント境界）。再開日がピン留めされたセグメントは
            // 絵文字フォントに頼らないCanvas描画の「旗」グリフで、
            // 「この開始日は自動で動かない」ことを ✂ より強く示す
            ctx.save();
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.85;
            if (i < segments.length - 1) {
                ctx.textAlign = 'right';
                ctx.fillText('✂', barX + barWidth - 2, barY + BAR_HEIGHT - 3);
            }
            if (i > 0 && !seg.isPinned) {
                ctx.textAlign = 'left';
                ctx.fillText('✂', barX + 2, barY + BAR_HEIGHT - 3);
            }
            ctx.restore();

            // ピン留め済みセグメントは左端に「旗」グリフ（ポール+ペナント）を描き、
            // 「この開始日は自動で動かない／差し込み作業に追従しない」ことを示す。
            // ポール自体がアンカー線を兼ねるため、✂の代わりにこの一体グリフのみを描く
            if (i > 0 && seg.isPinned) {
                ctx.save();
                ctx.globalAlpha = 0.95;
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.4;
                ctx.lineCap = 'round';
                ctx.shadowColor = 'rgba(0,0,0,0.25)';
                ctx.shadowBlur = 1.5;

                const poleX = barX + 3;
                const poleTop = barY + 4;
                const poleBottom = barY + BAR_HEIGHT - 4;

                ctx.beginPath();
                ctx.moveTo(poleX, poleTop);
                ctx.lineTo(poleX, poleBottom);
                ctx.stroke();

                const flagWidth = 6;
                const flagHeight = 6;
                ctx.beginPath();
                ctx.moveTo(poleX, poleTop);
                ctx.lineTo(poleX + flagWidth, poleTop + flagHeight / 2);
                ctx.lineTo(poleX, poleTop + flagHeight);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }

            // テキスト: 工程名（先頭以外は「(続)」）。%とステータスアイコンは最終セグメントのみ
            if (barWidth > 30) {
                const barCenterY = barY + BAR_HEIGHT / 2;
                ctx.textBaseline = 'middle';
                const label = i === 0 ? (schedule.process || '') : `${schedule.process || ''}(続)`;
                const isLastSegment = i === segments.length - 1;

                if (isLastSegment) {
                    const progressRate = Math.round(progressInfo.progressRate);
                    const percentText = `${progressRate}%`;
                    let statusIcon = '';
                    if (schedule.status === SCHEDULE.STATUS.COMPLETED) {
                        statusIcon = '✓';
                    } else if (this.isDelayed(schedule)) {
                        statusIcon = '!';
                    }

                    ctx.font = `bold 10px ${sysFont}`;
                    const percentWidth = ctx.measureText(percentText).width;
                    ctx.font = `bold 11px ${sysFont}`;
                    const iconWidth = statusIcon ? ctx.measureText(statusIcon).width + 2 : 0;
                    ctx.font = `600 11px ${sysFont}`;
                    const labelWidth = ctx.measureText(label).width;

                    const rightPad = 6;
                    const processLeftPad = 6;
                    const gap = 4;
                    const rightOccupied = percentWidth + iconWidth + rightPad;
                    const fitsInside = barWidth >= processLeftPad + labelWidth + gap + rightOccupied;

                    ctx.font = `600 11px ${sysFont}`;
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'left';
                    ctx.fillText(label, barX + processLeftPad, barCenterY);

                    if (fitsInside) {
                        if (statusIcon) {
                            ctx.font = `bold 11px ${sysFont}`;
                            ctx.textAlign = 'right';
                            ctx.fillText(statusIcon, barX + barWidth - rightPad - percentWidth - 2, barCenterY);
                        }
                        ctx.textAlign = 'right';
                        ctx.fillStyle = 'rgba(255,255,255,0.75)';
                        ctx.font = `bold 10px ${sysFont}`;
                        ctx.fillText(percentText, barX + barWidth - rightPad, barCenterY);
                    }
                } else {
                    ctx.font = `600 11px ${sysFont}`;
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'left';
                    ctx.fillText(label, barX + 6, barCenterY);
                }
            }

            segmentRects.push({
                barX, barY, barWidth,
                segmentIndex: i,
                interruptionId: seg.interruptionId,
                endInterruptionId: seg.endInterruptionId ?? null,
                isPinned: !!seg.isPinned,
                segmentStartDate: seg.startDate,
                segmentEndDate: seg.endDate
            });
        });

        for (let i = 0; i < segmentRects.length - 1; i++) {
            const r1 = segmentRects[i];
            const r2 = segmentRects[i + 1];
            const lineY = barY + BAR_HEIGHT / 2;

            ctx.save();
            ctx.beginPath();
            // 中断の間をつなぐ線は目立ちすぎないよう細い点線にする。
            // 再開日を固定した区間は点を細かくして区別する（固定していることは ✂ マークの強さでも示している）
            ctx.lineWidth = 1;
            if (r2.isPinned) {
                ctx.setLineDash([2, 3]);
                ctx.globalAlpha = 0.45;
            } else {
                ctx.setLineDash([4, 4]);
                ctx.globalAlpha = 0.35;
            }
            ctx.strokeStyle = taskColor;
            ctx.moveTo(r1.barX + r1.barWidth, lineY);
            ctx.lineTo(r2.barX, lineY);
            ctx.stroke();
            ctx.restore();
        }

        if (isCompletedVersion) {
            ctx.restore();
        }

        segmentRects.forEach((r) => {
            this.scheduleRects.push({
                schedule,
                x: r.barX,
                y: r.barY,
                width: r.barWidth,
                height: BAR_HEIGHT,
                segmentIndex: r.segmentIndex,
                interruptionId: r.interruptionId,
                endInterruptionId: r.endInterruptionId,
                isPinned: r.isPinned,
                segmentStartDate: r.segmentStartDate,
                segmentEndDate: r.segmentEndDate
            });

        const lastRect = segmentRects[segmentRects.length - 1];
        if (lastRect) this.drawOverrunTail(schedule, lastRect.barY);
        });
    }

    /**
     * 遅延予定の「超過のしっぽ」（終了日翌日〜今日）と「! 実績/予定h」バッジを描く
     * @param {Object} schedule
     * @param {number} barY - バー上端 Y（logical）
     */
    drawOverrunTail(schedule, barY) {
        if (scheduleSettings.showOverrun === false) return;
        const info = getDelayInfo(schedule, getTodayString());
        if (!info.delayed) return;
        const toDate = (ds) => {
            const [y, m, d] = ds.split('-').map(Number);
            return new Date(y, m - 1, d);
        };
        const start = toDate(info.overrunStart);
        const end = toDate(info.overrunEnd);
        const visibleStart = start < this.rangeStart ? this.rangeStart : start;
        const visibleEnd = end > this.rangeEnd ? this.rangeEnd : end;
        if (visibleStart > visibleEnd) return;

        const ctx = this.timelineCtx;
        const x = this.dateToX(visibleStart);
        const width = this.dateToX(visibleEnd) + DAY_WIDTH - x;
        const progress = this.getScheduleProgress(schedule);
        const label = `! ${Math.round(progress.actualHours * 10) / 10}/${schedule.estimatedHours}h`;

        // 半透明の地に斜線ハッチ（予定の延長ではなく「はみ出し」だと分かる見た目）
        ctx.save();
        // 地を不透明にしてから淡い赤を重ねる（下に描いた今日の線などが透けないよう、バーと同じく手前に見せる）
        ctx.fillStyle = SURFACE;
        fillRoundRect(ctx, x, barY, width, BAR_HEIGHT, BAR_RADIUS);
        ctx.fillStyle = OVERRUN_FILL;
        fillRoundRect(ctx, x, barY, width, BAR_HEIGHT, BAR_RADIUS);
        ctx.beginPath();
        ctx.rect(x, barY, width, BAR_HEIGHT);
        ctx.clip();
        ctx.strokeStyle = OVERRUN_HATCH;
        ctx.lineWidth = 1;
        for (let hx = x - BAR_HEIGHT; hx < x + width; hx += 6) {
            ctx.beginPath();
            ctx.moveTo(hx, barY + BAR_HEIGHT);
            ctx.lineTo(hx + BAR_HEIGHT, barY);
            ctx.stroke();
        }
        ctx.restore();

        // バッジは収まるときだけしっぽの中に描く（短いしっぽはバー側の「!」で足りる）
        ctx.save();
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        if (ctx.measureText(label).width + 8 <= width) {
            ctx.fillStyle = OVERRUN_TEXT;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + 4, barY + BAR_HEIGHT / 2);
        }
        ctx.restore();

        this.overrunRects.push({ scheduleId: schedule.id, x, y: barY, width, label });
    }

    /**
     * 休日ストライプ描画
     */
    /**
     * 休日セルのバー部分を背景色で覆い、バーの色をかすかに残す
     * セル背景とほぼ同じだが微かにバー色がわかり、休み明けの続きが視認できる
     */
    drawHolidayOverlay(ctx, x, y, width, height) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, width, height);
        ctx.restore();
    }

    // ============================================
    // 進捗・遅延計算
    // ============================================

    getScheduleActualHours(schedule) {
        // 本作業とレビューの実績を取り違えないよう isReview の一致も条件にする
        const relatedActuals = actuals.filter(a =>
            a.version === schedule.version &&
            a.task === schedule.task &&
            a.process === schedule.process &&
            a.member === schedule.member &&
            !a.isReview === !schedule.isReview
        );
        return relatedActuals.reduce((sum, a) => sum + (a.hours || 0), 0);
    }

    getScheduleProgress(schedule) {
        const actualHours = this.getScheduleActualHours(schedule);
        const estimatedHours = schedule.estimatedHours || 0;

        // タスク工程レベルで残存を取得（memberは検索キーに含めない）
        // 見込残存は本作業の管理値のため、レビュー予定では使わない
        const remainingEstimate = schedule.isReview ? null : remainingEstimates.find(r =>
            r.version === schedule.version &&
            r.task === schedule.task &&
            r.process === schedule.process
        );

        let remainingHours;
        let hasUserRemaining = false;

        if (remainingEstimate && remainingEstimate.remainingHours !== undefined) {
            remainingHours = remainingEstimate.remainingHours;
            hasUserRemaining = true;
        } else {
            remainingHours = Math.max(0, estimatedHours - actualHours);
        }

        let progressRate;
        if (schedule.status === SCHEDULE.STATUS.COMPLETED) {
            progressRate = 100;
            remainingHours = 0;
        } else if (hasUserRemaining && estimatedHours > 0) {
            progressRate = ((estimatedHours - remainingHours) / estimatedHours) * 100;
        } else if (estimatedHours > 0) {
            progressRate = (actualHours / estimatedHours) * 100;
        } else {
            progressRate = 0;
        }

        return {
            actualHours,
            estimatedHours,
            remainingHours: Math.max(remainingHours, 0),
            progressRate: Math.round(Math.min(Math.max(progressRate, 0), 100) * 10) / 10,
            hasUserRemaining
        };
    }

    isDelayed(schedule) {
        if (schedule.status === SCHEDULE.STATUS.COMPLETED) return false;

        // 日付はローカル深夜同士で比較する（UTCパース混在だと日数差が9時間ズレて切り上げが1日狂う）
        const parseLocal = (ds) => {
            const [y, m, d] = String(ds).split('-').map(Number);
            return new Date(y, m - 1, d);
        };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = parseLocal(schedule.endDate);

        if (today > endDate) return true;

        const startDate = parseLocal(schedule.startDate);
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const elapsedDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));

        const actualHours = this.getScheduleActualHours(schedule);
        const estimatedHours = schedule.estimatedHours || 0;

        if (elapsedDays > 0 && estimatedHours > 0) {
            const expectedProgress = elapsedDays / totalDays;
            const actualProgress = actualHours / estimatedHours;
            if (actualProgress < expectedProgress * 0.8) return true;
        }

        return false;
    }

    lightenColor(hex, factor) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const newR = Math.round(r + (255 - r) * factor);
        const newG = Math.round(g + (255 - g) * factor);
        const newB = Math.round(b + (255 - b) * factor);
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }

    /**
     * 色を彩度を下げてグレー寄りにする
     * @param {string} hex - ヘックスカラー
     * @param {number} amount - 彩度低下量（0=変化なし, 1=完全グレー）
     */
    desaturateColor(hex, amount) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
        const newR = Math.round(r + (gray - r) * amount);
        const newG = Math.round(g + (gray - g) * amount);
        const newB = Math.round(b + (gray - b) * amount);
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }

    // ============================================
    // 座標→データ変換（timelineCanvas座標系）
    // ============================================

    getScheduleAtPosition(x, y) {
        // 後に描画された（手前に表示される）バーを優先するため逆順で検索
        for (let i = this.scheduleRects.length - 1; i >= 0; i--) {
            const rect = this.scheduleRects[i];
            if (x >= rect.x && x <= rect.x + rect.width &&
                y >= rect.y && y <= rect.y + rect.height) {
                return rect.schedule;
            }
        }
        return null;
    }

    /**
     * 選択中の予定のバーに強調リングを描く（分割バーは全セグメントに描く）
     * @param {Set<string>} ids - 強調する予定ID
     */
    drawSelectionRings(ids) {
        if (!ids || ids.size === 0) return;
        const ctx = this.timelineCtx;
        ctx.save();
        this.scheduleRects.forEach(r => {
            if (!ids.has(r.schedule.id)) return;
            ctx.strokeStyle = SELECTION_HALO;
            ctx.lineWidth = 5;
            strokeRoundRect(ctx, r.x - 3, r.y - 3, r.width + 6, r.height + 6, BAR_RADIUS + 3);
            ctx.strokeStyle = SELECTION_RING;
            ctx.lineWidth = 2;
            strokeRoundRect(ctx, r.x - 1.5, r.y - 1.5, r.width + 3, r.height + 3, BAR_RADIUS + 1.5);
        });
        ctx.restore();
    }

    /**
     * 矩形（timeline 座標）と重なるバーの予定IDを返す
     * @returns {Set<string>}
     */
    getScheduleIdsInRect(x1, y1, x2, y2) {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        const ids = new Set();
        this.scheduleRects.forEach(r => {
            if (r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY) {
                ids.add(r.schedule.id);
            }
        });
        return ids;
    }

    /**
     * 座標から「どのスケジュールのどのセグメントを掴んだか」を返す
     * `getScheduleAtPosition` の上位互換。ドラッグ経路のみが使う。
     * @param {number} x - timelineCanvas 座標系のX
     * @param {number} y - timelineCanvas 座標系のY
     * @returns {{schedule: Object, segmentIndex: number, interruptionId: string|null,
     *            isPinned: boolean, segmentStartDate: string}|null}
     */
    getScheduleRectAtPosition(x, y) {
        // 後に描画された（手前に表示される）バーを優先するため逆順で検索
        for (let i = this.scheduleRects.length - 1; i >= 0; i--) {
            const rect = this.scheduleRects[i];
            if (x >= rect.x && x <= rect.x + rect.width &&
                y >= rect.y && y <= rect.y + rect.height) {
                return {
                    schedule: rect.schedule,
                    segmentIndex: rect.segmentIndex ?? 0,
                    interruptionId: rect.interruptionId ?? null,
                    isPinned: !!rect.isPinned,
                    segmentStartDate: rect.segmentStartDate || rect.schedule.startDate
                };
            }
        }
        return null;
    }

    /**
     * 座標が「中断で終わるセグメントの右端」付近なら、その情報を返す（右端ドラッグ判定用）
     * @param {number} x - timelineCanvas 座標系のX
     * @param {number} y - timelineCanvas 座標系のY
     * @returns {{schedule: Object, interruptionId: string, segmentStartDate: string,
     *            segmentEndDate: string}|null}
     */
    getSegmentEndEdgeAtPosition(x, y) {
        for (let i = this.scheduleRects.length - 1; i >= 0; i--) {
            const rect = this.scheduleRects[i];
            if (!rect.endInterruptionId) continue;
            const right = rect.x + rect.width;
            if (x >= right - SEGMENT_EDGE_HIT_PX && x <= right + SEGMENT_EDGE_HIT_PX &&
                y >= rect.y && y <= rect.y + rect.height) {
                return {
                    schedule: rect.schedule,
                    interruptionId: rect.endInterruptionId,
                    segmentStartDate: rect.segmentStartDate,
                    segmentEndDate: rect.segmentEndDate
                };
            }
        }
        return null;
    }

    getDateAtPosition(x) {
        return this.xToDate(x);
    }

    /** @returns {number} 行 index の上端 Y（logical） */
    rowY(index) {
        return this.rowLayout.offsets[index] ?? (HEADER_HEIGHT + index * ROW_HEIGHT);
    }

    /** @returns {number} 行 index の高さ（logical） */
    rowHeight(index) {
        return this.rowLayout.heights[index] ?? ROW_HEIGHT;
    }

    getRowIndexAtPosition(y) {
        return rowIndexAtY(this.rowLayout, y);
    }

    setHoverRow(rowIndex) {
        if (this.hoverRowIndex !== rowIndex) {
            this.hoverRowIndex = rowIndex;
            this.render(this.currentYear, this.currentMonth, this.filteredSchedulesCache);
        }
    }

    /**
     * 指定月の先頭位置までスクロール
     */
    scrollToMonth(year, month, smooth = true) {
        if (!this.scrollContainer) return;
        const mb = this.monthBoundaries.find(m => m.year === year && m.month === month);
        if (mb) {
            // 月の1日の左端をラベル列の右端にぴったり合わせる
            // logical px (startDayOffset * DAY_WIDTH) を CSS px に変換するため uiScale を掛ける
            this.scrollContainer.scrollTo({
                left: mb.startDayOffset * DAY_WIDTH * (this.uiScale || 1),
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    }

    /**
     * 今日の位置までスクロール
     */
    scrollToToday(smooth = true) {
        if (!this.scrollContainer) return;
        const today = new Date();
        if (today < this.rangeStart || today > this.rangeEnd) return;
        const x = this.dateToX(today);
        const containerWidth = this.timelineViewportWidth();
        this.scrollContainer.scrollTo({
            left: Math.max(0, x - containerWidth / 3),
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    /**
     * 指定月が描画範囲内かチェック
     */
    isMonthInRange(year, month) {
        return this.monthBoundaries.some(m => m.year === year && m.month === month);
    }

    /**
     * スクロール位置中央の月を取得
     */
    getVisibleCenterMonth() {
        if (!this.scrollContainer) return null;
        const centerX = this.scrollContainer.scrollLeft + this.timelineViewportWidth() / 2;
        const date = this.xToDate(centerX);
        if (!date) return null;
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1
        };
    }
}

// ============================================
// ツールチップ
// ============================================

let tooltipElement = null;
let currentTooltipSchedule = null;

function createTooltipElement() {
    if (tooltipElement) return tooltipElement;
    tooltipElement = document.createElement('div');
    tooltipElement.id = 'ganttTooltip';
    tooltipElement.className = 'gantt-tooltip';
    tooltipElement.style.display = 'none';
    document.body.appendChild(tooltipElement);
    return tooltipElement;
}

function showTooltip(schedule, x, y, renderer) {
    const tooltip = createTooltipElement();
    const progressInfo = renderer.getScheduleProgress(schedule);
    const progressRate = Math.round(progressInfo.progressRate);

    const statusLabels = { 'pending': '未着手', 'in_progress': '進行中', 'completed': '完了' };
    const statusLabel = statusLabels[schedule.status] || '未着手';
    const isDelayedSchedule = renderer.isDelayed(schedule);
    const remainingDisplay = progressInfo.hasUserRemaining
        ? `${progressInfo.remainingHours.toFixed(1)}h ★`
        : `${progressInfo.remainingHours.toFixed(1)}h`;

    tooltip.innerHTML = `
        <div class="tooltip-header">
            <strong>${escapeHtml(schedule.task)}</strong>
            <span class="tooltip-status ${schedule.status || 'pending'}">${statusLabel}</span>
        </div>
        <div class="tooltip-body">
            <div class="tooltip-row"><span class="tooltip-label">工程:</span><span>${escapeHtml(schedule.process)}${schedule.isReview ? '（レビュー）' : ''}</span></div>
            <div class="tooltip-row"><span class="tooltip-label">担当:</span><span>${escapeHtml(schedule.member)}</span></div>
            <div class="tooltip-row"><span class="tooltip-label">期間:</span><span>${escapeHtml(schedule.startDate)} 〜 ${escapeHtml(schedule.endDate)}</span></div>
            <div class="tooltip-row"><span class="tooltip-label">進捗:</span><span class="${isDelayedSchedule ? 'delayed' : ''}">${progressRate}% (${progressInfo.actualHours.toFixed(1)}h / ${progressInfo.estimatedHours}h)</span></div>
            <div class="tooltip-row"><span class="tooltip-label">残:</span><span>${remainingDisplay}</span></div>
            ${isDelayedSchedule ? `<div class="tooltip-warning">⚠️ 遅延 ${getDelayInfo(schedule, getTodayString()).businessDays} 営業日</div>` : ''}
        </div>
    `;

    tooltip.style.display = 'block';
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = x + 15;
    let posY = y + 15;
    if (posX + tooltipRect.width > viewportWidth - 10) posX = x - tooltipRect.width - 15;
    if (posY + tooltipRect.height > viewportHeight - 10) posY = y - tooltipRect.height - 15;

    tooltip.style.left = `${posX}px`;
    tooltip.style.top = `${posY}px`;
    currentTooltipSchedule = schedule;
}

function hideTooltip() {
    if (tooltipElement) tooltipElement.style.display = 'none';
    currentTooltipSchedule = null;
}

/** YYYY-MM-DD → M/D */
function monthDay(ds) {
    const [, m, d] = ds.split('-').map(Number);
    return `${m}/${d}`;
}

/**
 * 担当者の帯のセルに、その日の予定一覧の吹き出しを出す（同じセルの再タップで閉じる）
 * @param {ScheduleRenderer} renderer
 * @param {{rowIndex: number, x: number, date: string, list: Object[]}} cell
 * @param {HTMLCanvasElement} canvas - タイムライン canvas
 * @param {boolean} touch - タップで出すなら true
 */
function showStripTip(renderer, cell, canvas, touch) {
    const row = renderer.rows[cell.rowIndex];
    const key = `strip:${row.member}:${cell.date}`;
    if (currentGanttTipKey() === key) {
        if (touch) hideGanttTip();
        return;
    }
    const today = getTodayString();
    const items = cell.list.map(s => {
        const late = getDelayInfo(s, today).delayed ? '（遅延）' : '';
        return `<li>${escapeHtml(s.task)} ${escapeHtml(s.process)}${s.isReview ? ' R' : ''}${late}</li>`;
    }).join('');
    const box = canvas.getBoundingClientRect();
    const scale = renderer.uiScale || 1;
    const top = box.top + renderer.rowY(cell.rowIndex) * scale;
    showGanttTip({
        key,
        html: `<small>${escapeHtml(row.member)} ・ ${monthDay(cell.date)} ・ ${cell.list.length} 本</small><ul>${items}</ul>`,
        anchor: { left: box.left + cell.x * scale, top, bottom: top + renderer.rowHeight(cell.rowIndex) * scale },
        touch
    });
}

/**
 * 省略された見出しの全文の吹き出しを出す（同じ見出しの再タップで閉じる）
 */
function showLabelTip(renderer, rowIndex, labelCanvas, touch) {
    const row = renderer.rows[rowIndex];
    const key = `label:${rowIndex}:${row.label}`;
    if (currentGanttTipKey() === key) {
        if (touch) hideGanttTip();
        return;
    }
    const box = labelCanvas.getBoundingClientRect();
    const scale = renderer.uiScale || 1;
    const top = box.top + renderer.rowY(rowIndex) * scale;
    showGanttTip({
        key,
        html: `<small>${escapeHtml(row.fullLabel.version)}</small>${escapeHtml(row.fullLabel.name)}`,
        anchor: { left: box.left + 24 * scale, top, bottom: top + renderer.rowHeight(rowIndex) * scale },
        touch
    });
}

/**
 * 見出し欄（ラベル canvas）の操作: 担当者の見出しで畳む・開く、省略された見出しで全文を出す
 * PC はクリック／マウスを乗せる、スマホはタップ（指が動いた操作はタップとみなさない）
 */
function setupLabelInteractions() {
    const labelCanvas = document.getElementById('ganttLabelCanvas');
    if (!labelCanvas || labelCanvas._labelInteractionSetup) return;
    labelCanvas._labelInteractionSetup = true;

    const rowAt = (clientY) => {
        const renderer = getRenderer();
        if (!renderer) return { renderer: null, index: -1, row: null };
        const box = labelCanvas.getBoundingClientRect();
        const index = renderer.getRowIndexAtPosition((clientY - box.top) / (renderer.uiScale || 1));
        return { renderer, index, row: index >= 0 ? renderer.rows[index] : null };
    };

    labelCanvas.addEventListener('mousemove', (event) => {
        if (Date.now() - lastTouchEndTime < SYNTHETIC_MOUSE_WINDOW_MS) return;
        const { renderer, index, row } = rowAt(event.clientY);
        labelCanvas.style.cursor = row && row.type === 'memberGroup' ? 'pointer' : '';
        if (row && row.labelClipped) showLabelTip(renderer, index, labelCanvas, false);
        else if (String(currentGanttTipKey()).startsWith('label:')) hideGanttTip();
    });
    labelCanvas.addEventListener('mouseleave', () => {
        if (String(currentGanttTipKey()).startsWith('label:')) hideGanttTip();
    });
    labelCanvas.addEventListener('click', (event) => {
        if (Date.now() - lastTouchEndTime < SYNTHETIC_MOUSE_WINDOW_MS) return;
        const { renderer, row } = rowAt(event.clientY);
        if (row && row.type === 'memberGroup') {
            hideGanttTip();
            renderer.toggleMemberCollapsed(row.member);
        }
    });
    bindTap(labelCanvas, (touch) => {
        lastTouchEndTime = Date.now();
        const { renderer, index, row } = rowAt(touch.clientY);
        if (!row) { hideGanttTip(); return; }
        if (row.type === 'memberGroup') {
            hideGanttTip();
            renderer.toggleMemberCollapsed(row.member);
        } else if (row.labelClipped) {
            showLabelTip(renderer, index, labelCanvas, true);
        } else {
            hideGanttTip();
        }
    });
}

/**
 * ツールチップイベントをセットアップ（timelineCanvas用）
 */
export function setupTooltipHandler() {
    // 遅延セットアップ: timelineCanvasはinitDualCanvas後に存在する
    const setupOnCanvas = () => {
        const canvas = document.getElementById('ganttTimelineCanvas');
        if (!canvas) return false;
        if (canvas._tooltipSetup) return true;

        canvas.addEventListener('mousemove', (event) => {
            if (dragState.isDragging) { hideTooltip(); return; }
            // タップ後にブラウザが合成する mousemove ではツールチップを出さない（ガントに被さって残るため）
            if (Date.now() - lastTouchEndTime < SYNTHETIC_MOUSE_WINDOW_MS) return;

            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const _s = renderer.uiScale || 1;
            const x = (event.clientX - rect.left) / _s;
            const y = (event.clientY - rect.top) / _s;

            const rowIndex = renderer.getRowIndexAtPosition(y);
            renderer.setHoverRow(rowIndex);

            const schedule = renderer.getScheduleAtPosition(x, y);
            if (schedule) {
                if (currentTooltipSchedule !== schedule) {
                    showTooltip(schedule, event.clientX, event.clientY, renderer);
                }
            } else {
                hideTooltip();
            }

            // 担当者×タスク表示の帯: その日の予定一覧
            const cell = !schedule ? renderer.getStripCellAtPosition(x, y) : null;
            if (cell) {
                showStripTip(renderer, cell, canvas, false);
            } else if (String(currentGanttTipKey()).startsWith('strip:')) {
                hideGanttTip();
            }
        });

        canvas.addEventListener('mouseleave', () => {
            hideTooltip();
            if (String(currentGanttTipKey()).startsWith('strip:')) hideGanttTip();
            const renderer = getRenderer();
            if (renderer) renderer.setHoverRow(-1);
        });

        canvas._tooltipSetup = true;
        setupLabelInteractions();
        return true;
    };

    // initDualCanvas後にセットアップ
    if (!setupOnCanvas()) {
        pendingSetupCallbacks.push(setupOnCanvas);
    }
}

// ============================================
// レンダラーインスタンス管理
// ============================================

let rendererInstance = null;

export function getRenderer() {
    // timelineCanvasが存在すればそちらを使用
    const timelineCanvas = document.getElementById('ganttTimelineCanvas');
    const canvas = timelineCanvas || document.getElementById('ganttCanvas');
    if (!canvas) return null;

    if (!rendererInstance) {
        rendererInstance = new GanttChartRenderer(canvas);
    }

    return rendererInstance;
}

export function renderGanttChart(year, month, filteredSchedules = null) {
    const renderer = getRenderer();
    if (renderer) {
        renderer.render(year, month, filteredSchedules);
    }
}

// ============================================
// コンテキストメニュー（右クリック）
// ============================================

let scheduleCtxMenuDocHandler = null;
let scheduleCtxMenuKeyHandler = null;

function closeScheduleContextMenu() {
    if (scheduleCtxMenuDocHandler) { document.removeEventListener('mousedown', scheduleCtxMenuDocHandler, true); scheduleCtxMenuDocHandler = null; }
    if (scheduleCtxMenuKeyHandler) { document.removeEventListener('keydown', scheduleCtxMenuKeyHandler); scheduleCtxMenuKeyHandler = null; }
    const m = document.getElementById('scheduleCtxMenu');
    if (m) m.remove();
}

/**
 * @param {Object} schedule - 対象スケジュール
 * @param {string} clickDateStr - 右クリックした日付（YYYY-MM-DD）
 * @param {number} x - clientX
 * @param {number} y - clientY
 * @param {{interruptionId: string|null, isPinned: boolean}|null} pinInfo
 *        右クリックしたセグメントのピン情報。ピン留め済みなら解除項目を出す
 */
function showScheduleContextMenu(schedule, clickDateStr, x, y, pinInfo) {
    closeScheduleContextMenu();

    const canUnpin = !!(pinInfo && pinInfo.isPinned && pinInfo.interruptionId);
    const unpinItem = canUnpin
        ? '<button type="button" class="schedule-ctx-item" data-act="unpin">📌 再開日の固定を解除</button>'
        : '';

    const menu = document.createElement('div');
    menu.className = 'schedule-ctx-menu';
    menu.id = 'scheduleCtxMenu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
        <div class="schedule-ctx-head"><b>${escapeHtml(schedule.task)}</b><span>${escapeHtml(schedule.version)} ・ ${escapeHtml(schedule.process)} ・ ${escapeHtml(schedule.member)}</span></div>
        <button type="button" class="schedule-ctx-item" data-act="detail">詳細を表示</button>
        <button type="button" class="schedule-ctx-item" data-act="interrupt">✂ ${escapeHtml(clickDateStr)} で中断</button>
        ${unpinItem}
        <div class="schedule-ctx-sep"></div>
        <button type="button" class="schedule-ctx-item is-danger" data-act="delete">削除</button>
    `;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;

    menu.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'detail') {
            window.openScheduleDetailModal(schedule.id);
        } else if (btn.dataset.act === 'interrupt') {
            window.openInterruptionModal(schedule.id, clickDateStr);
        } else if (btn.dataset.act === 'unpin') {
            if (typeof window.clearSegmentPin === 'function' &&
                !window.clearSegmentPin(schedule.id, pinInfo.interruptionId)) {
                window.showToast?.('再開日の固定解除に失敗しました', 'error');
            }
        } else if (btn.dataset.act === 'delete') {
            if (confirm('このスケジュールを削除しますか？')) window.deleteSchedule(schedule.id);
        }
        closeScheduleContextMenu();
    });
    scheduleCtxMenuDocHandler = (ev) => { if (!menu.contains(ev.target)) closeScheduleContextMenu(); };
    document.addEventListener('mousedown', scheduleCtxMenuDocHandler, true);
    scheduleCtxMenuKeyHandler = (ev) => { if (ev.key === 'Escape') closeScheduleContextMenu(); };
    document.addEventListener('keydown', scheduleCtxMenuKeyHandler);
}

// ============================================
// クリックイベントハンドラ
// ============================================

export function setupCanvasClickHandler(onScheduleClick) {
    const setupOnCanvas = () => {
        const canvas = document.getElementById('ganttTimelineCanvas');
        if (!canvas) return false;
        if (canvas._clickSetup) return true;

        canvas.addEventListener('click', (event) => {
            // タッチ後のsynthetic clickを抑止
            if (Date.now() - lastTouchEndTime < 300) return;

            if (dragState.isDragging || dragState.wasDragging) {
                dragState.wasDragging = false;
                return;
            }

            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const _s = renderer.uiScale || 1;
            const x = (event.clientX - rect.left) / _s;
            const y = (event.clientY - rect.top) / _s;

            const schedule = renderer.getScheduleAtPosition(x, y);
            if (schedule && onScheduleClick) {
                onScheduleClick(schedule);
            }
        });

        canvas.addEventListener('contextmenu', (event) => {
            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const _s = renderer.uiScale || 1;
            const x = (event.clientX - rect.left) / _s;
            const y = (event.clientY - rect.top) / _s;

            const hit = renderer.getScheduleRectAtPosition(x, y);
            const schedule = hit ? hit.schedule : null;
            if (schedule) {
                event.preventDefault();
                const clickDate = renderer.getDateAtPosition(x);
                const dateStr = clickDate ? formatDateForDrag(clickDate) : schedule.startDate;
                showScheduleContextMenu(schedule, dateStr, event.clientX, event.clientY,
                    { interruptionId: hit.interruptionId, isPinned: hit.isPinned });
            }
        });

        canvas._clickSetup = true;
        return true;
    };

    // initDualCanvas後にセットアップ
    if (!setupOnCanvas()) {
        pendingSetupCallbacks.push(setupOnCanvas);
    }
}

// ============================================
// ドラッグ&ドロップ
// ============================================

const LONG_PRESS_MS = 300; // この時間以上押していたらクリック扱いにしない
/** 分割バー右端の「最終作業日ドラッグ」判定幅（px, 論理座標） */
const SEGMENT_EDGE_HIT_PX = 5;

const dragState = {
    isDragging: false,
    wasDragging: false,
    schedule: null,
    startX: 0,
    startY: 0,
    maxMovedX: 0,
    maxMovedY: 0,
    originalStartDate: null,
    previewDate: null,
    autoScrollId: null,
    pressStartTime: 0,
    originalRowIndex: -1,
    targetRowIndex: -1,
    // 掴んでいるセグメント（0 = バー全体／先頭セグメント）
    segmentIndex: 0,
    interruptionId: null,
    segmentOriginalStart: null,
    // 中断で終わるセグメントの右端を掴んでいる（最終作業日の変更）
    edgeMode: false,
    edgeSegmentStart: null,
    edgeOriginalCache: null,
    // 選択中の複数バーをまとめて動かしている（日付方向のみ）
    groupMode: false,
    groupDelta: 0
};

/** 空白ドラッグによる範囲選択の状態 */
const marqueeState = {
    active: false,
    additive: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
};

/**
 * ドラッグ終了時にセグメント関連の状態を初期化する。
 * マウス系・タッチ系あわせて5箇所のリセット地点から呼ぶ（配線漏れ防止のため関数化）。
 */
function clearDragSegment() {
    dragState.segmentIndex = 0;
    dragState.interruptionId = null;
    dragState.segmentOriginalStart = null;
    dragState.edgeMode = false;
    dragState.edgeSegmentStart = null;
    dragState.edgeOriginalCache = null;
    dragState.groupMode = false;
    dragState.groupDelta = 0;
}

// ============================================
// 範囲選択（PC・マウスのみ）
// ============================================

/** 選択状態を反映して再描画する */
function redrawWithSelection() {
    const renderer = getRenderer();
    if (renderer) renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
    else updateScheduleSelectionChip();
}

/**
 * ツールバーの「N件選択中」チップを選択状態に合わせて更新する。
 * 削除などで存在しなくなった予定IDはここで選択から外す。
 */
export function updateScheduleSelectionChip() {
    const existing = new Set(schedules.map(s => s.id));
    [...selectedScheduleIds].forEach(id => { if (!existing.has(id)) selectedScheduleIds.delete(id); });

    const count = selectedScheduleIds.size;
    const modeBtn = document.getElementById('scheduleSelectModeBtn');
    if (modeBtn) {
        modeBtn.classList.toggle('is-on', scheduleSelectionMode);
        modeBtn.setAttribute('aria-pressed', String(scheduleSelectionMode));
    }

    const chip = document.getElementById('scheduleSelectionChip');
    if (!chip) return;
    // 選択モード中は0件でも出す（何をすればよいかの案内と「完了」を見せるため）
    chip.hidden = count === 0 && !scheduleSelectionMode;
    const countEl = document.getElementById('scheduleSelectionCount');
    if (countEl) countEl.textContent = String(count);
    const hintEl = document.getElementById('scheduleSelectionHint');
    if (hintEl) {
        hintEl.textContent = scheduleSelectionMode
            ? (count >= 2 ? ' · 選択中のバーを長押しでまとめて移動' : ' · バーをタップして選択')
            : ' · 選択中のバーをドラッグでまとめて移動 · Esc で解除';
    }
    const clearBtn = chip.querySelector('.ssc-clear');
    if (clearBtn) clearBtn.disabled = count === 0;
    const doneBtn = chip.querySelector('.ssc-done');
    if (doneBtn) doneBtn.hidden = !scheduleSelectionMode;
    if (!chip.hidden) syncBulkDockOffset(); // スマホのタブ Dock に重ならないよう下端をずらす
}

/**
 * スマホ用の選択モードを切り替える。終了時は選択も解除する。
 * @param {boolean} [force] - 指定すればその状態にする
 */
export function toggleScheduleSelectionMode(force) {
    const next = typeof force === 'boolean' ? force : !scheduleSelectionMode;
    setScheduleSelectionMode(next);
    if (!next) selectedScheduleIds.clear();
    redrawWithSelection();
}

/** 範囲選択を解除する（ツールバーの ✕・Esc・ビュー切替から呼ぶ） */
export function clearScheduleSelection() {
    if (selectedScheduleIds.size === 0) return;
    selectedScheduleIds.clear();
    redrawWithSelection();
}

/** 範囲選択中の矩形と、その時点で選ばれる予定のリングを描く */
function drawMarquee(renderer) {
    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
    const { startX, startY, currentX, currentY, additive } = marqueeState;
    const hits = renderer.getScheduleIdsInRect(startX, startY, currentX, currentY);
    const preview = additive ? new Set([...selectedScheduleIds, ...hits]) : hits;
    // render() は確定済みの選択でリングを描いている。新たに入る分だけ重ねる
    renderer.drawSelectionRings(new Set([...preview].filter(id => !selectedScheduleIds.has(id))));

    const ctx = renderer.timelineCtx;
    const x = Math.min(startX, currentX), y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX), h = Math.abs(currentY - startY);
    ctx.save();
    ctx.fillStyle = MARQUEE_FILL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = SELECTION_RING;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.setLineDash([]);
    ctx.restore();
    if (hits.size > 0) {
        drawPillLabel(ctx, `${preview.size}件`, currentX + 8, currentY + 8, 'left');
    }
}

/**
 * アクセント色の小さなピル型ラベルを描く（範囲選択の件数・一括移動の営業日数）
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x - align が 'left' なら左端、'center' なら中心
 * @param {number} y - ピルの上端
 * @param {'left'|'center'} align
 */
function drawPillLabel(ctx, text, x, y, align) {
    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    const padX = 7, h = 18;
    const w = ctx.measureText(text).width + padX * 2;
    const left = align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = SELECTION_RING;
    fillRoundRect(ctx, left, y, w, h, h / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + padX, y + h / 2 + 0.5);
    ctx.restore();
}

/** 範囲選択を確定する（空白クリックなら選択解除） */
function finishMarquee(renderer) {
    if (!marqueeState.active) return;
    marqueeState.active = false;
    const moved = Math.abs(marqueeState.currentX - marqueeState.startX) >= MARQUEE_MIN_PX ||
        Math.abs(marqueeState.currentY - marqueeState.startY) >= MARQUEE_MIN_PX;
    if (moved && renderer) {
        const hits = renderer.getScheduleIdsInRect(
            marqueeState.startX, marqueeState.startY, marqueeState.currentX, marqueeState.currentY);
        if (!marqueeState.additive) selectedScheduleIds.clear();
        hits.forEach(id => selectedScheduleIds.add(id));
    } else if (!marqueeState.additive) {
        selectedScheduleIds.clear();
    }
    redrawWithSelection();
}

/**
 * 一括移動中のポインタ位置から移動量（営業日）を求め、変わっていればプレビューを描き直す。
 * マウス・タッチ共通。掴んだバーの担当者カレンダーで営業日数を数える。
 * @param {Object} renderer
 * @param {number} x - timeline 座標のX
 */
function updateGroupDrag(renderer, x) {
    const date = renderer.getDateAtPosition(x);
    if (!date) return;
    const dateStr = formatDateForDrag(date);
    if (dateStr === dragState.previewDate) return;
    dragState.previewDate = dateStr;
    dragState.groupDelta = businessDayDelta(dragState.originalStartDate, dateStr, dragState.schedule.member);
    drawGroupPreview(renderer);
}

/**
 * 一括移動のプレビュー: 動く予定（連結追従分を含む）のゴーストと、掴んだバーの上に移動量ラベルを描く
 */
function drawGroupPreview(renderer) {
    const delta = dragState.groupDelta;
    const moves = planBatchMove([...selectedScheduleIds], schedules, delta);
    const previews = moves
        .map(m => ({ schedule: schedules.find(s => s.id === m.scheduleId), newStartDate: m.newStartDate }))
        .filter(p => p.schedule);
    if (previews.length === 0) {
        renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
        return;
    }
    drawDragPreview(renderer, previews, -1, false);

    const grabbed = moves.find(m => m.scheduleId === dragState.schedule.id);
    const rect = renderer.scheduleRects.find(r => r.schedule.id === dragState.schedule.id);
    if (!grabbed || !rect) return;
    const newStart = new Date(grabbed.newStartDate);
    const x = renderer.dateToX(newStart < renderer.rangeStart ? renderer.rangeStart : newStart);
    const sign = delta > 0 ? '+' : '−';
    drawPillLabel(renderer.timelineCtx, `${sign}${Math.abs(delta)}営業日 · ${moves.length}件`,
        x, Math.max(HEADER_HEIGHT + 2, rect.y - 22), 'left');
}

/**
 * 右端ドラッグ中のプレビュー: 最終作業日を仮に差し替えたスケジュールで再描画する。
 * 描画キャッシュは元に戻しておき、キャンセル時の再描画で仮の値が残らないようにする。
 */
function renderEdgePreview(renderer, dateStr) {
    const original = dragState.edgeOriginalCache;
    if (!original) return;
    const target = dragState.schedule;
    const workedUntil = dateStr < dragState.edgeSegmentStart ? dragState.edgeSegmentStart : dateStr;
    const temp = {
        ...target,
        interruptions: (target.interruptions || []).map(i =>
            i.id === dragState.interruptionId ? { ...i, workedUntil, workedDays: undefined } : i)
    };
    const segs = calculateSegments(temp);
    if (segs.length > 0) temp.endDate = segs[segs.length - 1].endDate;
    renderer.render(renderer.currentYear, renderer.currentMonth,
        original.map(s => s.id === target.id ? temp : s));
    renderer.filteredSchedulesCache = original;
}

/**
 * @param {Function} onScheduleUpdate - (scheduleId, newStartDate, segmentIndex, interruptionId) 日付移動の確定
 * @param {Function} onMemberChange - (scheduleId, newMember, startDate) 担当者変更の確定
 * @param {Function} [onSegmentEndChange] - (scheduleId, interruptionId, newWorkedUntil) 右端ドラッグの確定
 * @param {Function} [onBatchMove] - (scheduleIds, delta) 選択中の予定の一括移動の確定
 */
export function setupDragAndDrop(onScheduleUpdate, onMemberChange, onSegmentEndChange, onBatchMove) {
    const setupOnCanvas = () => {
        const canvas = document.getElementById('ganttTimelineCanvas');
        if (!canvas) return false;
        if (canvas._dragSetup) return true;

        canvas.addEventListener('mousedown', (event) => {
            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const _s = renderer.uiScale || 1;
            const x = (event.clientX - rect.left) / _s;
            const y = (event.clientY - rect.top) / _s;
            if (event.button !== 0) return;
            // タッチ直後にブラウザが合成する mousedown は無視する（タップ選択を解除してしまうため）
            if (Date.now() - lastTouchEndTime < SYNTHETIC_MOUSE_WINDOW_MS) return;

            // Shift/⌘/Ctrl＋バー → 選択の切り替え（ドラッグも詳細モーダルも開始しない）
            const isModifier = event.shiftKey || event.metaKey || event.ctrlKey;
            const modHit = isModifier && onBatchMove ? renderer.getScheduleRectAtPosition(x, y) : null;
            if (modHit) {
                const id = modHit.schedule.id;
                if (selectedScheduleIds.has(id)) selectedScheduleIds.delete(id);
                else selectedScheduleIds.add(id);
                dragState.wasDragging = true; // 直後の click で詳細モーダルを開かせない
                redrawWithSelection();
                return;
            }

            // 中断で終わるセグメントの右端 → 最終作業日の変更（バー移動より優先）
            const edge = onSegmentEndChange && Array.isArray(renderer.filteredSchedulesCache)
                ? renderer.getSegmentEndEdgeAtPosition(x, y) : null;
            if (edge) {
                dragState.isDragging = true;
                dragState.edgeMode = true;
                dragState.schedule = edge.schedule;
                dragState.interruptionId = edge.interruptionId;
                dragState.edgeSegmentStart = edge.segmentStartDate;
                dragState.edgeOriginalCache = renderer.filteredSchedulesCache;
                dragState.originalStartDate = edge.segmentEndDate;
                dragState.previewDate = null;
                dragState.startX = x;
                dragState.startY = y;
                dragState.maxMovedX = 0;
                dragState.maxMovedY = 0;
                dragState.pressStartTime = Date.now();
                dragState.originalRowIndex = -1;
                dragState.targetRowIndex = -1;
                canvas.style.cursor = 'col-resize';
                return;
            }

            const hit = renderer.getScheduleRectAtPosition(x, y);
            if (!hit && onBatchMove) {
                // 空白 → 範囲選択
                marqueeState.active = true;
                marqueeState.additive = isModifier;
                marqueeState.startX = marqueeState.currentX = x;
                marqueeState.startY = marqueeState.currentY = y;
                event.preventDefault(); // テキスト選択を起こさない
                return;
            }
            if (hit) {
                const schedule = hit.schedule;
                const rowIndex = renderer.getRowIndexAtPosition(y);
                // 選択中（2件以上）のバーを掴んだら一括移動。選択外を掴んだら選択を解除して単体移動
                const isGroup = !!onBatchMove && selectedScheduleIds.size >= 2 && selectedScheduleIds.has(schedule.id);
                if (!isGroup && selectedScheduleIds.size > 0) {
                    selectedScheduleIds.clear();
                    redrawWithSelection();
                }
                dragState.isDragging = true;
                dragState.groupMode = isGroup;
                dragState.groupDelta = 0;
                dragState.schedule = schedule;
                dragState.segmentIndex = hit.segmentIndex;
                dragState.interruptionId = hit.interruptionId;
                dragState.segmentOriginalStart = hit.segmentStartDate;
                dragState.startX = x;
                dragState.startY = y;
                dragState.maxMovedX = 0;
                dragState.maxMovedY = 0;
                // セグメントを掴んだときは「そのセグメントの開始日」が基準になる
                dragState.originalStartDate = hit.segmentStartDate;
                dragState.previewDate = null;
                dragState.pressStartTime = Date.now();
                dragState.originalRowIndex = rowIndex;
                dragState.targetRowIndex = rowIndex;
                canvas.style.cursor = 'grabbing';
            }
        });

        canvas.addEventListener('mousemove', (event) => {
            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const _s = renderer.uiScale || 1;
            const x = (event.clientX - rect.left) / _s;
            const y = (event.clientY - rect.top) / _s;

            if (marqueeState.active) {
                marqueeState.currentX = x;
                marqueeState.currentY = y;
                drawMarquee(renderer);
                canvas.style.cursor = 'crosshair';
                return;
            }

            if (dragState.isDragging && dragState.schedule && dragState.edgeMode) {
                dragState.maxMovedX = Math.max(dragState.maxMovedX, Math.abs(x - dragState.startX));
                dragState.maxMovedY = Math.max(dragState.maxMovedY, Math.abs(y - dragState.startY));
                const newDate = renderer.getDateAtPosition(x);
                if (newDate) {
                    const dateStr = formatDateForDrag(newDate);
                    if (dateStr !== dragState.previewDate) {
                        dragState.previewDate = dateStr;
                        renderEdgePreview(renderer, dateStr);
                    }
                }
                canvas.style.cursor = 'col-resize';
            } else if (dragState.isDragging && dragState.schedule) {
                dragState.maxMovedX = Math.max(dragState.maxMovedX, Math.abs(x - dragState.startX));
                dragState.maxMovedY = Math.max(dragState.maxMovedY, Math.abs(y - dragState.startY));

                let rowChanged = false;
                // 一括移動は日付方向のみ
                if (dragState.groupMode) updateGroupDrag(renderer, x);
                // 残作業セグメント（segmentIndex > 0）は担当者変更できないため行追従しない
                if (!dragState.groupMode && scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.MEMBER && renderer.rows &&
                    dragState.segmentIndex === 0) {
                    const rowIndex = renderer.getRowIndexAtPosition(y);
                    if (rowIndex >= 0 && rowIndex !== dragState.targetRowIndex) {
                        dragState.targetRowIndex = rowIndex;
                        rowChanged = true;
                    }
                }

                const newDate = dragState.groupMode ? null : renderer.getDateAtPosition(x);
                if (newDate) {
                    const dateStr = formatDateForDrag(newDate);
                    if (dateStr !== dragState.previewDate || rowChanged) {
                        dragState.previewDate = dateStr;
                        drawDragPreview(
                            renderer,
                            buildDragPreviews(dragState.schedule, dateStr, dragState.segmentIndex),
                            dragState.targetRowIndex
                        );
                    }
                } else if (rowChanged && !dragState.groupMode) {
                    const fallbackDate = dragState.previewDate || dragState.originalStartDate;
                    drawDragPreview(
                        renderer,
                        buildDragPreviews(dragState.schedule, fallbackDate, dragState.segmentIndex),
                        dragState.targetRowIndex
                    );
                }

                // 端に近づいたら自動横スクロール
                const scrollContainer = renderer.scrollContainer;
                if (scrollContainer) {
                    const scrollRect = scrollContainer.getBoundingClientRect();
                    const edgeZone = 40; // 端から40px以内でスクロール開始
                    // 見出し欄（左に固定）の右端から測る
                    const viewLeft = scrollRect.left + (scrollRect.width - renderer.timelineViewportWidth());
                    const cursorX = event.clientX - viewLeft;
                    const containerWidth = renderer.timelineViewportWidth();

                    if (dragState.autoScrollId) {
                        cancelAnimationFrame(dragState.autoScrollId);
                        dragState.autoScrollId = null;
                    }

                    if (cursorX < edgeZone) {
                        // 左端: 左にスクロール
                        const speed = Math.max(2, Math.round((edgeZone - cursorX) / 5));
                        const autoScroll = () => {
                            if (!dragState.isDragging) return;
                            scrollContainer.scrollLeft -= speed;
                            dragState.autoScrollId = requestAnimationFrame(autoScroll);
                        };
                        dragState.autoScrollId = requestAnimationFrame(autoScroll);
                    } else if (cursorX > containerWidth - edgeZone) {
                        // 右端: 右にスクロール
                        const speed = Math.max(2, Math.round((cursorX - (containerWidth - edgeZone)) / 5));
                        const autoScroll = () => {
                            if (!dragState.isDragging) return;
                            scrollContainer.scrollLeft += speed;
                            dragState.autoScrollId = requestAnimationFrame(autoScroll);
                        };
                        dragState.autoScrollId = requestAnimationFrame(autoScroll);
                    }
                }
            } else if (onSegmentEndChange && renderer.getSegmentEndEdgeAtPosition(x, y)) {
                canvas.style.cursor = 'col-resize';
            } else {
                const schedule = renderer.getScheduleAtPosition(x, y);
                canvas.style.cursor = schedule ? 'grab' : 'default';
            }
        });

        canvas.addEventListener('mouseup', (event) => {
            if (marqueeState.active) {
                finishMarquee(getRenderer());
                canvas.style.cursor = 'default';
                return;
            }
            if (!dragState.isDragging) return;

            // 自動スクロールを停止
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }

            const renderer = getRenderer();
            const rect = canvas.getBoundingClientRect();
            const _s = (renderer && renderer.uiScale) || 1;
            const x = (event.clientX - rect.left) / _s;

            const movedX = Math.abs(x - dragState.startX);
            const didMove = dragState.maxMovedX > 3 || dragState.maxMovedY > 3;
            const pressDuration = Date.now() - dragState.pressStartTime;

            let didUpdate = false;

            // 残作業セグメント（segmentIndex > 0）は担当者変更の対象にしない（設計書 §7-2）
            const memberChanged = !dragState.edgeMode && !dragState.groupMode &&
                renderer && scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.MEMBER &&
                dragState.segmentIndex === 0 &&
                dragState.targetRowIndex >= 0 &&
                dragState.targetRowIndex !== dragState.originalRowIndex &&
                !!rowMember(renderer.rows && renderer.rows[dragState.targetRowIndex]) &&
                rowMember(renderer.rows[dragState.targetRowIndex]) !== dragState.schedule.member &&
                renderer.rows && renderer.rows[dragState.targetRowIndex];

            if (dragState.groupMode) {
                if (dragState.groupDelta !== 0 && onBatchMove) {
                    onBatchMove([...selectedScheduleIds], dragState.groupDelta);
                    didUpdate = true;
                }
            } else if (dragState.edgeMode) {
                if (dragState.previewDate && dragState.previewDate !== dragState.originalStartDate) {
                    const workedUntil = dragState.previewDate < dragState.edgeSegmentStart
                        ? dragState.edgeSegmentStart : dragState.previewDate;
                    onSegmentEndChange(dragState.schedule.id, dragState.interruptionId, workedUntil);
                    didUpdate = true;
                }
            } else if (memberChanged && onMemberChange) {
                const newMember = rowMember(renderer.rows[dragState.targetRowIndex]);
                // 縦ドラッグ（担当者変更）中は日付を変更しない（掴んだ位置のオフセットによる意図しない日付ずれを防ぐ）
                onMemberChange(dragState.schedule.id, newMember, dragState.originalStartDate);
                didUpdate = true;
            } else if (dragState.previewDate && dragState.previewDate !== dragState.originalStartDate && onScheduleUpdate) {
                // previewDateが元の開始日と異なればドラッグ成功（ピクセル距離ではなく日付変化で判定）
                onScheduleUpdate(
                    dragState.schedule.id, dragState.previewDate,
                    dragState.segmentIndex, dragState.interruptionId
                );
                didUpdate = true;
            }

            // 移動距離または押下時間が閾値を超えていたらクリック（モーダル表示）を抑止
            if (didMove || pressDuration > LONG_PRESS_MS) {
                dragState.wasDragging = true;
            }

            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;
            dragState.targetRowIndex = -1;
            dragState.originalRowIndex = -1;
            clearDragSegment();
            canvas.style.cursor = 'default';

            // onScheduleUpdate が呼ばれた場合は renderScheduleView 内でスクロール位置保持付きの
            // 再描画が済んでいるため、ここでの再描画は不要（二重描画でスクロール位置が飛ぶ原因）
            if (!didUpdate && renderer) {
                renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
            }
        });

        canvas.addEventListener('mouseleave', () => {
            // 範囲選択はキャンバス外に出た時点の矩形で確定する
            if (marqueeState.active) finishMarquee(getRenderer());

            // 自動スクロールを停止
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }

            if (dragState.isDragging) {
                dragState.isDragging = false;
                dragState.schedule = null;
                dragState.previewDate = null;
                dragState.targetRowIndex = -1;
                dragState.originalRowIndex = -1;
                clearDragSegment();

                const renderer = getRenderer();
                if (renderer) {
                    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
                }
            }
            canvas.style.cursor = 'default';
        });

        canvas._dragSetup = true;
        return true;
    };

    // Escキー
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && marqueeState.active) {
            marqueeState.active = false;
            redrawWithSelection();
            return;
        }
        // ドラッグ中でなく、モーダルも開いていなければ Esc で選択解除
        if (event.key === 'Escape' && !dragState.isDragging && selectedScheduleIds.size > 0 &&
            !document.querySelector('.modal[style*="flex"]')) {
            clearScheduleSelection();
            return;
        }
        if (event.key === 'Escape' && dragState.isDragging) {
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }
            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;
            dragState.targetRowIndex = -1;
            dragState.originalRowIndex = -1;
            clearDragSegment();

            const renderer = getRenderer();
            const canvas = document.getElementById('ganttTimelineCanvas');
            if (renderer) {
                renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
            }
            if (canvas) canvas.style.cursor = 'default';
        }
    });

    // initDualCanvas後にセットアップ
    if (!setupOnCanvas()) {
        pendingSetupCallbacks.push(setupOnCanvas);
    }
}

function formatDateForDrag(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * @param {Object} renderer
 * @param {{schedule: Object, newStartDate: string, segmentIndex?: number, segments?: Object[]}[]} previews
 * @param {number} targetRowIndex - 縦ドラッグ先の行（-1 なら縦移動なし）
 * @param {boolean} [showDateLabels=true] - 各ゴーストの上に新しい開始日を描くか（一括移動では1つのラベルにまとめる）
 */
function drawDragPreview(renderer, previews, targetRowIndex, showDateLabels = true) {
    // render()内部で日付ベースのスクロール位置保持が行われる
    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);

    const ctx = renderer.timelineCtx;

    previews.forEach(({ schedule, newStartDate, segmentIndex = 0, segments }, index) => {
        // セグメントドラッグ時はバー長をセグメントの期間から求める
        let spanStartDate = schedule.startDate;
        let spanEndDate = schedule.endDate;
        if (segmentIndex > 0) {
            // buildDragPreviews が計算済みの segments を優先し、再計算を避ける。
            // buildDragPreviews を経由しない将来の呼び出し元向けにフォールバックも残す
            const segs = segments || calculateSegments(schedule);
            const seg = segs[segmentIndex];
            if (seg) {
                spanStartDate = seg.startDate;
                spanEndDate = seg.endDate;
            }
        }

        const originalStart = new Date(spanStartDate);
        const originalEnd = new Date(spanEndDate);
        const duration = Math.ceil((originalEnd - originalStart) / (1000 * 60 * 60 * 24));

        const newStart = new Date(newStartDate);
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + duration);

        const visibleStart = newStart < renderer.rangeStart ? renderer.rangeStart : newStart;
        const visibleEnd = newEnd > renderer.rangeEnd ? renderer.rangeEnd : newEnd;

        const barX = renderer.dateToX(visibleStart);
        const barEndX = renderer.dateToX(visibleEnd) + DAY_WIDTH;
        const barWidth = barEndX - barX;

        // 同一 id の矩形が複数ある（分割バー）ため segmentIndex も一致条件に加える。
        // これを怠ると常に先頭セグメントの Y 座標を拾ってしまう
        const originalRect = renderer.scheduleRects.find(
            r => r.schedule.id === schedule.id && (r.segmentIndex ?? 0) === segmentIndex
        );
        if (!originalRect) return;

        // 連動追従バー（2件目以降）と残作業セグメントは担当者変更の対象にならないため、常に自分の行に描画する
        // 別の担当者の行に来たときだけ担当者変更のプレビュー（担当者×タスク表示で同じ担当者の別タスク行は日付移動のみ）
        const targetMember = rowMember(renderer.rows && renderer.rows[targetRowIndex]);
        const isMemberDrag = index === 0 && segmentIndex === 0 &&
            targetRowIndex >= 0 && targetRowIndex !== dragState.originalRowIndex &&
            scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.MEMBER &&
            !!targetMember && targetMember !== schedule.member;
        const barY = isMemberDrag
            ? renderer.rowY(targetRowIndex) + ROW_PADDING
            : originalRect.y;

        if (isMemberDrag) {
            const rowY = renderer.rowY(targetRowIndex);
            const rowH = renderer.rowHeight(targetRowIndex);
            ctx.fillStyle = 'rgba(45, 90, 39, 0.10)';
            ctx.fillRect(0, rowY, renderer.timelineWidth, rowH);

            const labelCtx = renderer.labelCtx;
            if (labelCtx) {
                labelCtx.fillStyle = 'rgba(45, 90, 39, 0.10)';
                labelCtx.fillRect(0, rowY, renderer.labelWidth, rowH);
            }

            const targetRow = renderer.rows[targetRowIndex];
            if (targetRow) {
                ctx.fillStyle = '#2D5A27';
                ctx.font = '600 11px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.globalAlpha = 0.9;
                ctx.fillText(`→ ${targetMember}`, barX + barWidth / 2, barY - 5);
                ctx.globalAlpha = 1.0;
            }
        }

        ctx.globalAlpha = 0.6;
        ctx.fillStyle = isMemberDrag ? '#2D5A27' : '#1D6FA5';  // --info
        fillRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);
        ctx.strokeStyle = '#2D5A27';  // --accent
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        strokeRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        if (!isMemberDrag && showDateLabels) {
            ctx.fillStyle = TEXT_PRIMARY;
            ctx.font = '600 11px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(newStartDate.slice(5), barX + barWidth / 2, barY - 5);
        }
    });
}

/**
 * ドラッグ中のスケジュールについて、連動対象（連結中の後工程）があれば
 * そのプレビュー用エントリも含めた配列を組み立てる
 * @param {Object} schedule - ドラッグ中のスケジュール
 * @param {string} newStartDate - ドラッグ先の新しい開始日
 * @param {number} [segmentIndex=0] - 掴んでいるセグメントの index（0 = バー全体／先頭）
 * @returns {{schedule: Object, newStartDate: string, segmentIndex: number,
 *            segments: Object[]|null}[]} segments は calculateSegments の計算結果
 *            （中断なしの場合は null）。drawDragPreview 側での再計算を避けるために含める
 */
export function buildDragPreviews(schedule, newStartDate, segmentIndex = 0) {
    const hasInterruptions = (schedule.interruptions || []).length > 0;
    const segments = hasInterruptions ? calculateSegments(schedule) : null;

    // 残作業セグメント（segmentIndex > 0）は、確定後に resolveSegmentStart で
    // クランプ・非営業日寄せされた表示になる。プレビューもそれに揃えることで、
    // ドラッグ中に見えていた位置と確定後の位置がズレないようにする。
    // newStartDate 自体（コミット時に resumeDate へ書き込まれる生の値）は変えない。
    let displayStartDate = newStartDate;
    if (segments && segmentIndex > 0) {
        const prevSeg = segments[segmentIndex - 1];
        if (prevSeg) {
            displayStartDate = resolveSegmentStart(newStartDate, prevSeg.endDate, newStartDate, schedule.member);
        }
    }

    // calculateSegments はここで計算済みなので、drawDragPreview 側では再計算させず
    // このエントリの segments をそのまま使わせる
    const previews = [{ schedule, newStartDate: displayStartDate, segmentIndex, segments }];

    // 中間セグメントを動かしても schedule.endDate は変わらないため、
    // 後工程の連動プレビューは最終セグメントを掴んだときだけ出す
    if (segments && segmentIndex !== segments.length - 1) return previews;

    const linked = findLinkedBackSchedule(schedule, schedules);
    if (linked) {
        const seg = segments ? segments[segmentIndex] : null;
        const hours = seg ? seg.hours : schedule.estimatedHours;
        // 連動先の起点はクランプ後の displayStartDate を使う（自セグメントの表示位置と矛盾させない）
        const frontNewEnd = calculateEndDate(displayStartDate, hours, schedule.member);
        const linkedNewStart = getNextBusinessDay(frontNewEnd, linked.member);
        // 連動先は常に segmentIndex 0（先頭）扱いなので segments は使われない
        previews.push({ schedule: linked, newStartDate: linkedNewStart, segmentIndex: 0, segments: null });
    }
    return previews;
}

// ============================================
// タッチイベントハンドラ（モバイル対応）
// ============================================

const LONG_PRESS_DELAY = 500;
/** タッチ終了からこの時間内のマウスイベントはブラウザの合成とみなす */
const SYNTHETIC_MOUSE_WINDOW_MS = 600;
const TOUCH_MOVE_THRESHOLD = 10;

let lastTouchEndTime = 0;

const touchState = {
    touchId: null,
    startX: 0,
    startY: 0,
    startClientX: 0,
    startClientY: 0,
    longPressTimer: null,
    isLongPress: false,
    isDragging: false,
    hasMoved: false,
    schedule: null
};

function resetTouchState() {
    if (touchState.longPressTimer) {
        clearTimeout(touchState.longPressTimer);
        touchState.longPressTimer = null;
    }
    touchState.touchId = null;
    touchState.isLongPress = false;
    touchState.isDragging = false;
    touchState.hasMoved = false;
    touchState.schedule = null;
}

/**
 * タッチイベントをセットアップ（クリック・ドラッグ統合）
 * @param {Function} onScheduleClick - バータップ時のコールバック
 * @param {Function} onScheduleUpdate - バードラッグ完了時のコールバック
 * @param {Function} onMemberChange - 担当者変更時のコールバック
 * @param {Function} [onBatchMove] - (scheduleIds, delta) 選択中の予定の一括移動の確定
 */
export function setupTouchHandlers(onScheduleClick, onScheduleUpdate, onMemberChange, onBatchMove) {
    const setupOnCanvas = () => {
        const canvas = document.getElementById('ganttTimelineCanvas');
        if (!canvas) return false;
        if (canvas._touchSetup) return true;

        // --- touchstart ---
        canvas.addEventListener('touchstart', (event) => {
            if (event.touches.length !== 1) return;

            const touch = event.touches[0];
            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const _s = renderer.uiScale || 1;
            const x = (touch.clientX - rect.left) / _s;
            const y = (touch.clientY - rect.top) / _s;

            touchState.touchId = touch.identifier;
            touchState.startX = x;
            touchState.startY = y;
            touchState.startClientX = touch.clientX;
            touchState.startClientY = touch.clientY;

            const hit = renderer.getScheduleRectAtPosition(x, y);
            const schedule = hit ? hit.schedule : null;
            touchState.schedule = schedule;

            if (schedule) {
                touchState.longPressTimer = setTimeout(() => {
                    touchState.isLongPress = true;
                    touchState.isDragging = true;

                    if (navigator.vibrate) navigator.vibrate(30);

                    // 選択中（2件以上）のバーの長押しは一括移動。選択外なら選択を解除して単体移動（PC と同じ規則）
                    const isGroup = !!onBatchMove && selectedScheduleIds.size >= 2 && selectedScheduleIds.has(schedule.id);
                    if (!isGroup) selectedScheduleIds.clear();
                    dragState.groupMode = isGroup;
                    dragState.groupDelta = 0;
                    dragState.isDragging = true;
                    dragState.schedule = schedule;
                    dragState.segmentIndex = hit.segmentIndex;
                    dragState.interruptionId = hit.interruptionId;
                    dragState.segmentOriginalStart = hit.segmentStartDate;
                    dragState.startX = x;
                    dragState.startY = y;
                    // セグメントを掴んだときは「そのセグメントの開始日」が基準になる
                    dragState.originalStartDate = hit.segmentStartDate;
                    dragState.previewDate = null;
                    const rowIndex = renderer.getRowIndexAtPosition(y);
                    dragState.originalRowIndex = rowIndex;
                    dragState.targetRowIndex = rowIndex;

                    renderer.highlightedScheduleId = schedule.id;
                    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
                }, LONG_PRESS_DELAY);
            }
        }, { passive: true });

        // --- touchmove ---
        canvas.addEventListener('touchmove', (event) => {
            if (event.touches.length !== 1) return;

            const touch = Array.from(event.touches).find(t => t.identifier === touchState.touchId);
            if (!touch) return;

            const dx = touch.clientX - touchState.startClientX;
            const dy = touch.clientY - touchState.startClientY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 長押し前に動いたらタイマー解除、ネイティブスクロールに委譲
            if (!touchState.isLongPress && distance > TOUCH_MOVE_THRESHOLD) {
                touchState.hasMoved = true;
                if (touchState.longPressTimer) {
                    clearTimeout(touchState.longPressTimer);
                    touchState.longPressTimer = null;
                }
                return;
            }

            // ドラッグ中: スクロール抑止してバー移動
            if (touchState.isDragging && dragState.isDragging) {
                event.preventDefault();

                const renderer = getRenderer();
                if (!renderer) return;

                const rect = canvas.getBoundingClientRect();
                const _s = renderer.uiScale || 1;
                const x = (touch.clientX - rect.left) / _s;
                const y = (touch.clientY - rect.top) / _s;

                let rowChanged = false;
                // 一括移動は日付方向のみ
                if (dragState.groupMode) updateGroupDrag(renderer, x);
                // 残作業セグメント（segmentIndex > 0）は担当者変更できないため行追従しない
                if (!dragState.groupMode && scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.MEMBER && renderer.rows &&
                    dragState.segmentIndex === 0) {
                    const rowIndex = renderer.getRowIndexAtPosition(y);
                    if (rowIndex >= 0 && rowIndex !== dragState.targetRowIndex) {
                        dragState.targetRowIndex = rowIndex;
                        rowChanged = true;
                    }
                }

                const newDate = dragState.groupMode ? null : renderer.getDateAtPosition(x);
                if (newDate) {
                    const dateStr = formatDateForDrag(newDate);
                    if (dateStr !== dragState.previewDate || rowChanged) {
                        dragState.previewDate = dateStr;
                        drawDragPreview(
                            renderer,
                            buildDragPreviews(dragState.schedule, dateStr, dragState.segmentIndex),
                            dragState.targetRowIndex
                        );
                    }
                } else if (rowChanged && !dragState.groupMode) {
                    const fallbackDate = dragState.previewDate || dragState.originalStartDate;
                    drawDragPreview(
                        renderer,
                        buildDragPreviews(dragState.schedule, fallbackDate, dragState.segmentIndex),
                        dragState.targetRowIndex
                    );
                }

                // 端に近づいたら自動スクロール
                const scrollContainer = renderer.scrollContainer;
                if (scrollContainer) {
                    const scrollRect = scrollContainer.getBoundingClientRect();
                    const edgeZone = 40;
                    // 見出し欄（左に固定）の右端から測る
                    const viewLeft = scrollRect.left + (scrollRect.width - renderer.timelineViewportWidth());
                    const cursorX = touch.clientX - viewLeft;
                    const containerWidth = renderer.timelineViewportWidth();

                    if (dragState.autoScrollId) {
                        cancelAnimationFrame(dragState.autoScrollId);
                        dragState.autoScrollId = null;
                    }

                    if (cursorX < edgeZone) {
                        const speed = Math.max(2, Math.round((edgeZone - cursorX) / 5));
                        const autoScroll = () => {
                            if (!dragState.isDragging) return;
                            scrollContainer.scrollLeft -= speed;
                            dragState.autoScrollId = requestAnimationFrame(autoScroll);
                        };
                        dragState.autoScrollId = requestAnimationFrame(autoScroll);
                    } else if (cursorX > containerWidth - edgeZone) {
                        const speed = Math.max(2, Math.round((cursorX - (containerWidth - edgeZone)) / 5));
                        const autoScroll = () => {
                            if (!dragState.isDragging) return;
                            scrollContainer.scrollLeft += speed;
                            dragState.autoScrollId = requestAnimationFrame(autoScroll);
                        };
                        dragState.autoScrollId = requestAnimationFrame(autoScroll);
                    }
                }
            }
        }, { passive: false });

        // --- touchend ---
        canvas.addEventListener('touchend', () => {
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }

            const renderer = getRenderer();

            if (touchState.isDragging && dragState.isDragging) {
                // ドラッグ完了
                // ハイライトを先にクリア（renderScheduleView の描画に反映させるため）
                if (renderer) {
                    renderer.highlightedScheduleId = null;
                }

                let didUpdate = false;

                // 残作業セグメント（segmentIndex > 0）は担当者変更の対象にしない（設計書 §7-2）
                const memberChanged = renderer && !dragState.groupMode && scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.MEMBER &&
                    dragState.segmentIndex === 0 &&
                    dragState.targetRowIndex >= 0 &&
                    dragState.targetRowIndex !== dragState.originalRowIndex &&
                    !!rowMember(renderer.rows && renderer.rows[dragState.targetRowIndex]) &&
                    rowMember(renderer.rows[dragState.targetRowIndex]) !== dragState.schedule.member &&
                    renderer.rows && renderer.rows[dragState.targetRowIndex];

                if (dragState.groupMode) {
                    if (dragState.groupDelta !== 0 && onBatchMove) {
                        onBatchMove([...selectedScheduleIds], dragState.groupDelta);
                        didUpdate = true;
                    }
                } else if (memberChanged && onMemberChange) {
                    const newMember = rowMember(renderer.rows[dragState.targetRowIndex]);
                    // 縦ドラッグ（担当者変更）中は日付を変更しない（掴んだ位置のオフセットによる意図しない日付ずれを防ぐ）
                    onMemberChange(dragState.schedule.id, newMember, dragState.originalStartDate);
                    didUpdate = true;
                } else if (dragState.previewDate && dragState.previewDate !== dragState.originalStartDate && onScheduleUpdate) {
                    // previewDateが元の開始日と異なればドラッグ成功（ピクセル距離ではなく日付変化で判定）
                    onScheduleUpdate(
                        dragState.schedule.id, dragState.previewDate,
                        dragState.segmentIndex, dragState.interruptionId
                    );
                    didUpdate = true;
                }

                dragState.isDragging = false;
                dragState.wasDragging = true;
                dragState.schedule = null;
                dragState.previewDate = null;
                dragState.targetRowIndex = -1;
                dragState.originalRowIndex = -1;
                clearDragSegment();

                // onScheduleUpdate が呼ばれた場合は renderScheduleView 内でスクロール位置保持付きの
                // 再描画が済んでいるため、ここでの再描画は不要
                if (!didUpdate && renderer) {
                    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
                }
            } else if (touchState.schedule && !touchState.isDragging && !touchState.hasMoved) {
                if (scheduleSelectionMode) {
                    // 選択モード中のタップ: 選択の切り替え（詳細は開かない）
                    const id = touchState.schedule.id;
                    if (selectedScheduleIds.has(id)) selectedScheduleIds.delete(id);
                    else selectedScheduleIds.add(id);
                    redrawWithSelection();
                } else if (onScheduleClick) {
                    // タップ: 詳細モーダルを開く
                    onScheduleClick(touchState.schedule);
                }
            } else if (!touchState.schedule && !touchState.hasMoved && renderer) {
                // 担当者×タスク表示の帯のタップ: その日の予定一覧（帯以外のタップは吹き出しを閉じる）
                const cell = renderer.getStripCellAtPosition(touchState.startX, touchState.startY);
                if (cell) showStripTip(renderer, cell, canvas, true);
                else hideGanttTip();
            }

            // ツールチップ非表示
            hideTooltip();
            if (renderer) renderer.setHoverRow(-1);

            lastTouchEndTime = Date.now();
            resetTouchState();
        }, { passive: true });

        // --- touchcancel ---
        canvas.addEventListener('touchcancel', () => {
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }

            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;
            dragState.targetRowIndex = -1;
            dragState.originalRowIndex = -1;
            clearDragSegment();

            const renderer = getRenderer();
            if (renderer) {
                renderer.highlightedScheduleId = null;
                renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
            }

            resetTouchState();
        }, { passive: true });

        canvas._touchSetup = true;
        return true;
    };

    if (!setupOnCanvas()) {
        pendingSetupCallbacks.push(setupOnCanvas);
    }
}
