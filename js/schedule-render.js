// ============================================
// スケジュール描画モジュール（ガントチャートCanvas描画）
// 複数月連続表示対応（2キャンバス構成）
// ============================================

import { schedules, scheduleSettings, actuals, vacations, remainingEstimates, memberOrder } from './state.js';
import { SCHEDULE } from './constants.js';
import { getTaskColor, isBusinessDay } from './schedule.js';
import { sortMembers } from './utils.js';

// ============================================
// 定数
// ============================================

const { BAR_HEIGHT, ROW_HEIGHT, HEADER_HEIGHT, DAY_WIDTH, LABEL_WIDTH, ROW_PADDING, DEFAULT_DISPLAY_MONTHS } = SCHEDULE.CANVAS;
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
        this.filteredSchedulesCache = null;
        this.dpr = window.devicePixelRatio || 1;
        this.highlightedScheduleId = null;
        this.newlyCreatedIds = new Set();
        this.newlyCreatedTimer = null;
        this.customLabelWidths = this.loadCustomLabelWidths();
        this.resizeHandle = null;
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
        this.labelCanvas = document.createElement('canvas');
        this.labelCanvas.id = 'ganttLabelCanvas';
        this.labelCtx = this.labelCanvas.getContext('2d');

        // timeline scroll container
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.className = 'gantt-timeline-scroll';
        this.scrollContainer.id = 'ganttTimelineScroll';

        // timeline canvas
        this.timelineCanvas = document.createElement('canvas');
        this.timelineCanvas.id = 'ganttTimelineCanvas';
        this.timelineCtx = this.timelineCanvas.getContext('2d');

        // label scroll container（モバイル時のラベル横スクロール用）
        this.labelScrollContainer = document.createElement('div');
        this.labelScrollContainer.className = 'gantt-label-scroll';
        this.labelScrollContainer.id = 'ganttLabelScroll';
        this.labelScrollContainer.appendChild(this.labelCanvas);

        this.scrollContainer.appendChild(this.timelineCanvas);
        outer.appendChild(this.labelScrollContainer);

        // PC時のみリサイズハンドルを追加
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'gantt-resize-handle';
        outer.appendChild(this.resizeHandle);

        outer.appendChild(this.scrollContainer);
        container.appendChild(outer);

        this.dualCanvasInitialized = true;

        // 遅延セットアップのコールバックを実行
        pendingSetupCallbacks.forEach(fn => fn());
        pendingSetupCallbacks.length = 0;

        // PC時のリサイズハンドルをセットアップ
        this.setupResizeHandle();
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
            const delta = e.clientX - startX;
            const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
            // ドラッグ中はコンテナ幅のみ変更（軽量）
            if (this.labelScrollContainer) {
                this.labelScrollContainer.style.width = newWidth + 'px';
            }
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            const delta = e.clientX - startX;
            const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
            const viewMode = scheduleSettings.viewMode;
            this.customLabelWidths[viewMode] = newWidth;
            this.saveCustomLabelWidth(viewMode, newWidth);
            // 新しい幅で再描画
            this.render(this.currentYear, this.currentMonth, this.filteredSchedulesCache);
        };

        handle.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * カスタムラベル幅をlocalStorageから読み込み
     */
    loadCustomLabelWidths() {
        const widths = { member: null, task: null };
        try {
            for (const mode of ['member', 'task']) {
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
        // ピクセル値ではなく日付に変換して保持する）
        let savedScrollDate = null;
        if (this.scrollContainer && this.scrollContainer.scrollLeft > 0 && this.rangeStart) {
            const dayOffset = Math.floor(this.scrollContainer.scrollLeft / DAY_WIDTH);
            savedScrollDate = new Date(this.rangeStart);
            savedScrollDate.setDate(savedScrollDate.getDate() + dayOffset);
        }

        // 2キャンバス構造を初期化
        this.initDualCanvas();

        // 複数月の範囲を計算
        this.calculateMonthRange(year, month);

        this.scheduleRects = [];

        // 表示範囲内のスケジュールをフィルタ
        const sourceSchedules = filteredSchedules || schedules;

        // スケジュールデータに合わせて表示範囲を拡張
        this.expandRangeForSchedules(sourceSchedules);

        const visibleSchedules = this.getVisibleSchedulesForRange(sourceSchedules);

        // 行データを構築
        const rows = this.buildRows(visibleSchedules);
        this.rows = rows;
        this.filteredSchedulesCache = filteredSchedules;

        // サイズ計算
        const isMobile = window.innerWidth <= 768;
        const viewMode = scheduleSettings.viewMode;

        // ラベル幅をコンテンツに合わせて計算
        this.labelWidth = this.calculateLabelWidth(rows, isMobile, viewMode);

        this.timelineWidth = this.totalDays * DAY_WIDTH;
        this.totalWidth = this.labelWidth + this.timelineWidth;
        this.totalHeight = HEADER_HEIGHT + (rows.length * ROW_HEIGHT);
        this.totalHeight = Math.max(this.totalHeight, 300);

        this.dpr = window.devicePixelRatio || 1;

        // Timeline canvas サイズ設定
        this.timelineCanvas.width = this.timelineWidth * this.dpr;
        this.timelineCanvas.height = this.totalHeight * this.dpr;
        this.timelineCanvas.style.width = this.timelineWidth + 'px';
        this.timelineCanvas.style.height = this.totalHeight + 'px';
        this.timelineCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // Label canvas サイズ設定
        this.labelCanvas.width = this.labelWidth * this.dpr;
        this.labelCanvas.height = this.totalHeight * this.dpr;
        this.labelCanvas.style.width = this.labelWidth + 'px';
        this.labelCanvas.style.height = this.totalHeight + 'px';
        this.labelCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // モバイル時のラベルスクロールコンテナ設定
        if (this.labelScrollContainer) {
            if (isMobile) {
                // ラベルは画面幅の40%まで、超えた分は横スクロール可能
                const maxVisible = Math.min(this.labelWidth, Math.floor(window.innerWidth * 0.4));
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
        }

        // 描画
        this.drawTimelineBackground();
        this.drawLabelBackground();
        this.drawHeader();
        this.drawLabelHeader();
        this.drawGrid(rows.length);
        this.drawMonthSeparators();
        this.drawTodayLine();
        this.drawRows(rows);
        this.drawLabelColumn(rows);

        // スクロール位置を日付から復元（キャンバス幅が変わっても正しい位置にスクロール）
        if (this.scrollContainer && savedScrollDate !== null) {
            this.scrollContainer.scrollLeft = this.dateToX(savedScrollDate);
        }
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
        const memberOrderEl = document.getElementById('memberOrder');
        const orderString = memberOrder || (memberOrderEl ? memberOrderEl.value.trim() : '');

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
        }

        return rows;
    }

    /**
     * ラベル列の最適幅を計算（コンテンツ幅ベース）
     */
    calculateLabelWidth(rows, isMobile, viewMode) {
        // PC時はカスタム幅があればそれを使用（ビューモード別）
        if (!isMobile && this.customLabelWidths[viewMode]) return this.customLabelWidths[viewMode];
        if (!isMobile) return LABEL_WIDTH;

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
        const headerLabel = scheduleSettings.viewMode === SCHEDULE.VIEW_MODE.TASK ? 'タスク' : '担当者';
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
    drawGrid(rowCount) {
        const ctx = this.timelineCtx;

        // 縦線（--border-light: 繊細な区切り）
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 0.5;
        for (let day = 0; day <= this.totalDays; day++) {
            const x = day * DAY_WIDTH;
            ctx.beginPath();
            ctx.moveTo(x, HEADER_HEIGHT);
            ctx.lineTo(x, this.totalHeight);
            ctx.stroke();
        }

        // 横線（--border-light: 行区切り）
        for (let row = 0; row <= rowCount; row++) {
            const y = HEADER_HEIGHT + row * ROW_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.timelineWidth, y);
            ctx.stroke();
        }
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
    drawTodayLine() {
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        if (today < this.rangeStart || today > this.rangeEnd) return;

        const ctx = this.timelineCtx;
        const x = this.dateToX(today) + DAY_WIDTH / 2;

        // ソリッドライン（--danger）— ボディ部分のみ
        ctx.strokeStyle = TODAY_LINE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, HEADER_HEIGHT);
        ctx.lineTo(x, this.totalHeight);
        ctx.stroke();

        // 月名行と日付行の境界に小さな丸インジケータ
        const monthRowH = 20;
        ctx.fillStyle = TODAY_LINE;
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

        rows.forEach((row, index) => {
            const y = HEADER_HEIGHT + index * ROW_HEIGHT;

            // ゼブラストライプ
            const zebraColor = index % 2 === 0 ? ZEBRA_LIGHT : ZEBRA_DARK;
            ctx.fillStyle = zebraColor;
            ctx.fillRect(0, y, this.timelineWidth, ROW_HEIGHT);

            // ホバー行のハイライト
            if (index === this.hoverRowIndex) {
                ctx.fillStyle = HOVER_HIGHLIGHT;
                ctx.fillRect(0, y, this.timelineWidth, ROW_HEIGHT);
            }

            // 担当者名（担当者別ビューの場合、休暇チェック用）
            const memberName = row.type === 'member' ? row.label : null;

            // 週末・祝日・担当者休暇の背景（全日数分）
            for (let dayOffset = 0; dayOffset < this.totalDays; dayOffset++) {
                const date = new Date(this.rangeStart);
                date.setDate(date.getDate() + dayOffset);
                const x = dayOffset * DAY_WIDTH;

                if (isWeekend(date)) {
                    // 週末: #FAF9F7 ベース（ゼブラで微差）
                    ctx.fillStyle = index % 2 === 0 ? '#FAF9F7' : '#F5F4F2';
                    ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                } else if (isHoliday(date)) {
                    // 祝日: --accent-secondary-light ベース
                    ctx.fillStyle = index % 2 === 0 ? '#FFF8ED' : '#FFF3E0';
                    ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                } else if (memberName) {
                    // 担当者休暇チェック（担当者別ビューのみ）
                    const dateStr = formatDateString(date);
                    const vacation = getMemberVacation(memberName, dateStr);
                    if (vacation) {
                        if (vacation.hours >= 8 || vacation.vacationType !== '時間休') {
                            // 全日休暇: 薄い紫系
                            ctx.fillStyle = index % 2 === 0 ? '#F5F0F7' : '#EFE9F2';
                            ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                        } else {
                            // 時間休（部分休暇）
                            ctx.fillStyle = index % 2 === 0 ? '#F9F4FB' : '#F4EFF6';
                            ctx.fillRect(x, y + ROW_HEIGHT / 2, DAY_WIDTH, ROW_HEIGHT / 2);
                        }
                    }
                }
            }

            // スケジュールバーを描画（開始日昇順＝後のバーが手前に重なる）
            const sorted = [...row.schedules].sort((a, b) =>
                new Date(a.startDate) - new Date(b.startDate)
            );
            sorted.forEach(schedule => {
                this.drawScheduleBar(schedule, y);
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
            const y = HEADER_HEIGHT + index * ROW_HEIGHT;

            // ゼブラ背景
            ctx.fillStyle = index % 2 === 0 ? ZEBRA_LIGHT : ZEBRA_DARK;
            ctx.fillRect(0, y, this.labelWidth, ROW_HEIGHT);

            // ホバーハイライト
            if (index === this.hoverRowIndex) {
                ctx.fillStyle = HOVER_HIGHLIGHT;
                ctx.fillRect(0, y, this.labelWidth, ROW_HEIGHT);
            }

            // 横線（--border-light）
            ctx.strokeStyle = GRID;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y + ROW_HEIGHT);
            ctx.lineTo(this.labelWidth, y + ROW_HEIGHT);
            ctx.stroke();

            const centerY = y + ROW_HEIGHT / 2;

            // メンバードット（色付き丸）
            if (row.color || row.type === 'member') {
                const dotColor = row.color || this.getMemberDotColor(row.label, index);
                ctx.fillStyle = dotColor;
                ctx.beginPath();
                ctx.arc(dotLeftPad + dotSize / 2, centerY, dotSize / 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // ラベルテキスト（--text-primary, 600 weight）
            ctx.fillStyle = TEXT_PRIMARY;
            ctx.font = '600 13px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            const labelStartX = (row.color || row.type === 'member') ? textLeftPad : dotLeftPad;
            const maxLabelWidth = this.labelWidth - labelStartX - 8;
            let labelText = row.label;
            while (ctx.measureText(labelText).width > maxLabelWidth && labelText.length > 0) {
                labelText = labelText.slice(0, -1);
            }
            if (labelText !== row.label) {
                labelText += '…';
            }

            ctx.fillText(labelText, labelStartX, centerY);
        });
    }

    /**
     * メンバードットの色を取得
     */
    getMemberDotColor(label, index) {
        const dotColors = [
            '#2D5A27', '#1D6FA5', '#C4841D', '#B91C1C',
            '#7C3AED', '#0D9488', '#EA580C', '#DB2777',
            '#4F46E5', '#65A30D', '#0891B2', '#9333EA'
        ];
        return dotColors[index % dotColors.length];
    }

    /**
     * スケジュールバーを描画（dateToX座標系）
     */
    drawScheduleBar(schedule, rowY) {
        const ctx = this.timelineCtx;

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

        // タスクの色を取得
        const taskColor = getTaskColor(schedule.version, schedule.task);
        const lightColor = this.lightenColor(taskColor, 0.6);

        // 行インデックス（ゼブラストライプ・背景色判定用）
        const rowIndex = Math.round((rowY - HEADER_HEIGHT) / ROW_HEIGHT);
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
            const processText = schedule.process || '';
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

        // クリック判定用矩形
        this.scheduleRects.push({
            schedule,
            x: barX,
            y: barY,
            width: barWidth,
            height: BAR_HEIGHT
        });
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
        const relatedActuals = actuals.filter(a =>
            a.version === schedule.version &&
            a.task === schedule.task &&
            a.process === schedule.process &&
            a.member === schedule.member
        );
        return relatedActuals.reduce((sum, a) => sum + (a.hours || 0), 0);
    }

    getScheduleProgress(schedule) {
        const actualHours = this.getScheduleActualHours(schedule);
        const estimatedHours = schedule.estimatedHours || 0;

        const remainingEstimate = remainingEstimates.find(r =>
            r.version === schedule.version &&
            r.task === schedule.task &&
            r.process === schedule.process &&
            r.member === schedule.member
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
            progressRate: Math.min(Math.max(progressRate, 0), 100),
            hasUserRemaining
        };
    }

    isDelayed(schedule) {
        if (schedule.status === SCHEDULE.STATUS.COMPLETED) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(schedule.endDate);

        if (today > endDate) return true;

        const startDate = new Date(schedule.startDate);
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

    getDateAtPosition(x) {
        return this.xToDate(x);
    }

    getRowIndexAtPosition(y) {
        if (y < HEADER_HEIGHT) return -1;
        const rowIndex = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
        if (rowIndex < 0 || rowIndex >= this.rows.length) return -1;
        return rowIndex;
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
            this.scrollContainer.scrollTo({
                left: mb.startDayOffset * DAY_WIDTH,
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
        const containerWidth = this.scrollContainer.clientWidth;
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
        const centerX = this.scrollContainer.scrollLeft + this.scrollContainer.clientWidth / 2;
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
            <strong>${schedule.task}</strong>
            <span class="tooltip-status ${schedule.status || 'pending'}">${statusLabel}</span>
        </div>
        <div class="tooltip-body">
            <div class="tooltip-row"><span class="tooltip-label">工程:</span><span>${schedule.process}</span></div>
            <div class="tooltip-row"><span class="tooltip-label">担当:</span><span>${schedule.member}</span></div>
            <div class="tooltip-row"><span class="tooltip-label">期間:</span><span>${schedule.startDate} 〜 ${schedule.endDate}</span></div>
            <div class="tooltip-row"><span class="tooltip-label">進捗:</span><span class="${isDelayedSchedule ? 'delayed' : ''}">${progressRate}% (${progressInfo.actualHours.toFixed(1)}h / ${progressInfo.estimatedHours}h)</span></div>
            <div class="tooltip-row"><span class="tooltip-label">残:</span><span>${remainingDisplay}</span></div>
            ${isDelayedSchedule ? '<div class="tooltip-warning">⚠️ 遅延中</div>' : ''}
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

            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

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
        });

        canvas.addEventListener('mouseleave', () => {
            hideTooltip();
            const renderer = getRenderer();
            if (renderer) renderer.setHoverRow(-1);
        });

        canvas._tooltipSetup = true;
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
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const schedule = renderer.getScheduleAtPosition(x, y);
            if (schedule && onScheduleClick) {
                onScheduleClick(schedule);
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
    pressStartTime: 0
};

export function setupDragAndDrop(onScheduleUpdate) {
    const setupOnCanvas = () => {
        const canvas = document.getElementById('ganttTimelineCanvas');
        if (!canvas) return false;
        if (canvas._dragSetup) return true;

        canvas.addEventListener('mousedown', (event) => {
            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const schedule = renderer.getScheduleAtPosition(x, y);
            if (schedule) {
                dragState.isDragging = true;
                dragState.schedule = schedule;
                dragState.startX = x;
                dragState.startY = y;
                dragState.maxMovedX = 0;
                dragState.maxMovedY = 0;
                dragState.originalStartDate = schedule.startDate;
                dragState.previewDate = null;
                dragState.pressStartTime = Date.now();
                canvas.style.cursor = 'grabbing';
            }
        });

        canvas.addEventListener('mousemove', (event) => {
            const renderer = getRenderer();
            if (!renderer) return;

            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            if (dragState.isDragging && dragState.schedule) {
                dragState.maxMovedX = Math.max(dragState.maxMovedX, Math.abs(x - dragState.startX));
                dragState.maxMovedY = Math.max(dragState.maxMovedY, Math.abs(y - dragState.startY));

                const newDate = renderer.getDateAtPosition(x);
                if (newDate) {
                    const dateStr = formatDateForDrag(newDate);
                    if (dateStr !== dragState.previewDate) {
                        dragState.previewDate = dateStr;
                        drawDragPreview(renderer, dragState.schedule, dateStr);
                    }
                }

                // 端に近づいたら自動横スクロール
                const scrollContainer = renderer.scrollContainer;
                if (scrollContainer) {
                    const scrollRect = scrollContainer.getBoundingClientRect();
                    const edgeZone = 40; // 端から40px以内でスクロール開始
                    const cursorX = event.clientX - scrollRect.left;
                    const containerWidth = scrollRect.width;

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
            } else {
                const schedule = renderer.getScheduleAtPosition(x, y);
                canvas.style.cursor = schedule ? 'grab' : 'default';
            }
        });

        canvas.addEventListener('mouseup', (event) => {
            if (!dragState.isDragging) return;

            // 自動スクロールを停止
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }

            const renderer = getRenderer();
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;

            const movedX = Math.abs(x - dragState.startX);
            const didMove = dragState.maxMovedX > 3 || dragState.maxMovedY > 3;
            const pressDuration = Date.now() - dragState.pressStartTime;

            let didUpdate = false;
            // previewDateが元の開始日と異なればドラッグ成功（ピクセル距離ではなく日付変化で判定）
            if (dragState.previewDate && dragState.previewDate !== dragState.originalStartDate && onScheduleUpdate) {
                onScheduleUpdate(dragState.schedule.id, dragState.previewDate);
                didUpdate = true;
            }

            // 移動距離または押下時間が閾値を超えていたらクリック（モーダル表示）を抑止
            if (didMove || pressDuration > LONG_PRESS_MS) {
                dragState.wasDragging = true;
            }

            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;
            canvas.style.cursor = 'default';

            // onScheduleUpdate が呼ばれた場合は renderScheduleView 内でスクロール位置保持付きの
            // 再描画が済んでいるため、ここでの再描画は不要（二重描画でスクロール位置が飛ぶ原因）
            if (!didUpdate && renderer) {
                renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
            }
        });

        canvas.addEventListener('mouseleave', () => {
            // 自動スクロールを停止
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }

            if (dragState.isDragging) {
                dragState.isDragging = false;
                dragState.schedule = null;
                dragState.previewDate = null;

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
        if (event.key === 'Escape' && dragState.isDragging) {
            if (dragState.autoScrollId) {
                cancelAnimationFrame(dragState.autoScrollId);
                dragState.autoScrollId = null;
            }
            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;

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

function drawDragPreview(renderer, schedule, newStartDate) {
    // render()内部で日付ベースのスクロール位置保持が行われる
    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);

    const ctx = renderer.timelineCtx;

    const originalStart = new Date(schedule.startDate);
    const originalEnd = new Date(schedule.endDate);
    const duration = Math.ceil((originalEnd - originalStart) / (1000 * 60 * 60 * 24));

    const newStart = new Date(newStartDate);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + duration);

    const visibleStart = newStart < renderer.rangeStart ? renderer.rangeStart : newStart;
    const visibleEnd = newEnd > renderer.rangeEnd ? renderer.rangeEnd : newEnd;

    const barX = renderer.dateToX(visibleStart);
    const barEndX = renderer.dateToX(visibleEnd) + DAY_WIDTH;
    const barWidth = barEndX - barX;

    const originalRect = renderer.scheduleRects.find(r => r.schedule.id === schedule.id);
    if (!originalRect) return;

    const barY = originalRect.y;

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#1D6FA5';  // --info
    fillRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);
    ctx.strokeStyle = '#2D5A27';  // --accent
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    strokeRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = TEXT_PRIMARY;
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(newStartDate.slice(5), barX + barWidth / 2, barY - 5);
}

// ============================================
// タッチイベントハンドラ（モバイル対応）
// ============================================

const LONG_PRESS_DELAY = 500;
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
 */
export function setupTouchHandlers(onScheduleClick, onScheduleUpdate) {
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
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            touchState.touchId = touch.identifier;
            touchState.startX = x;
            touchState.startY = y;
            touchState.startClientX = touch.clientX;
            touchState.startClientY = touch.clientY;

            const schedule = renderer.getScheduleAtPosition(x, y);
            touchState.schedule = schedule;

            if (schedule) {
                touchState.longPressTimer = setTimeout(() => {
                    touchState.isLongPress = true;
                    touchState.isDragging = true;

                    if (navigator.vibrate) navigator.vibrate(30);

                    dragState.isDragging = true;
                    dragState.schedule = schedule;
                    dragState.startX = x;
                    dragState.startY = y;
                    dragState.originalStartDate = schedule.startDate;
                    dragState.previewDate = null;

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
                const x = touch.clientX - rect.left;

                const newDate = renderer.getDateAtPosition(x);
                if (newDate) {
                    const dateStr = formatDateForDrag(newDate);
                    if (dateStr !== dragState.previewDate) {
                        dragState.previewDate = dateStr;
                        drawDragPreview(renderer, dragState.schedule, dateStr);
                    }
                }

                // 端に近づいたら自動スクロール
                const scrollContainer = renderer.scrollContainer;
                if (scrollContainer) {
                    const scrollRect = scrollContainer.getBoundingClientRect();
                    const edgeZone = 40;
                    const cursorX = touch.clientX - scrollRect.left;
                    const containerWidth = scrollRect.width;

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
                if (dragState.previewDate && onScheduleUpdate) {
                    onScheduleUpdate(dragState.schedule.id, dragState.previewDate);
                    didUpdate = true;
                }

                dragState.isDragging = false;
                dragState.wasDragging = true;
                dragState.schedule = null;
                dragState.previewDate = null;

                // onScheduleUpdate が呼ばれた場合は renderScheduleView 内でスクロール位置保持付きの
                // 再描画が済んでいるため、ここでの再描画は不要
                if (!didUpdate && renderer) {
                    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
                }
            } else if (touchState.schedule && !touchState.isDragging && !touchState.hasMoved) {
                // タップ: 詳細モーダルを開く
                if (onScheduleClick) {
                    onScheduleClick(touchState.schedule);
                }
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
