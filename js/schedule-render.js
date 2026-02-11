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
const { DELAYED, COMPLETED, TODAY_LINE, WEEKEND, HOLIDAY, GRID, MONTH_SEPARATOR } = SCHEDULE.COLORS;

const ZEBRA_LIGHT = '#FFFFFF';
const ZEBRA_DARK = '#F8FAFC';
const HOVER_HIGHLIGHT = 'rgba(74, 144, 217, 0.08)';

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

        this.scrollContainer.appendChild(this.timelineCanvas);
        outer.appendChild(this.labelCanvas);
        outer.appendChild(this.scrollContainer);
        container.appendChild(outer);

        this.dualCanvasInitialized = true;

        // 遅延セットアップのコールバックを実行
        pendingSetupCallbacks.forEach(fn => fn());
        pendingSetupCallbacks.length = 0;
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

        // 2キャンバス構造を初期化
        this.initDualCanvas();

        // 複数月の範囲を計算
        this.calculateMonthRange(year, month);

        this.scheduleRects = [];

        // 表示範囲内のスケジュールをフィルタ
        const sourceSchedules = filteredSchedules || schedules;
        const visibleSchedules = this.getVisibleSchedulesForRange(sourceSchedules);

        // 行データを構築
        const rows = this.buildRows(visibleSchedules);
        this.rows = rows;
        this.filteredSchedulesCache = filteredSchedules;

        // サイズ計算
        this.timelineWidth = this.totalDays * DAY_WIDTH;
        this.totalWidth = LABEL_WIDTH + this.timelineWidth;
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
        this.labelCanvas.width = LABEL_WIDTH * this.dpr;
        this.labelCanvas.height = this.totalHeight * this.dpr;
        this.labelCanvas.style.width = LABEL_WIDTH + 'px';
        this.labelCanvas.style.height = this.totalHeight + 'px';
        this.labelCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

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

    // ============================================
    // 描画メソッド
    // ============================================

    drawTimelineBackground() {
        this.timelineCtx.fillStyle = '#FFFFFF';
        this.timelineCtx.fillRect(0, 0, this.timelineWidth, this.totalHeight);
    }

    drawLabelBackground() {
        this.labelCtx.fillStyle = '#FFFFFF';
        this.labelCtx.fillRect(0, 0, LABEL_WIDTH, this.totalHeight);
    }

    /**
     * ヘッダー描画（timelineCanvas）- 2段構成: 月名 + 日付/曜日
     */
    drawHeader() {
        const ctx = this.timelineCtx;
        const monthRowH = 20; // 月名行の高さ
        const dayZoneY = monthRowH; // 日付ゾーンの開始Y

        // ヘッダー全体の背景
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, this.timelineWidth, HEADER_HEIGHT);

        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

        // 1) 日付ゾーンの背景（週末・祝日）を先に描画
        for (const mb of this.monthBoundaries) {
            const monthX = mb.startDayOffset * DAY_WIDTH;
            for (let day = 1; day <= mb.daysInMonth; day++) {
                const x = monthX + (day - 1) * DAY_WIDTH;
                const date = new Date(mb.year, mb.month - 1, day);

                if (isWeekend(date)) {
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

            // 月名行の交互背景で区別しやすく
            ctx.fillStyle = i % 2 === 0 ? '#E8EEF4' : '#F0F4F8';
            ctx.fillRect(monthX, 0, monthWidth, monthRowH);

            // 月名テキスト
            ctx.fillStyle = '#1a1a1a';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${mb.year}年${mb.month}月`, monthX + monthWidth / 2, monthRowH / 2);
        }

        // 月名行と日付行の区切り線
        ctx.strokeStyle = '#CCCCCC';
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

                if (dayOfWeek === 0) {
                    ctx.fillStyle = '#E53935';
                } else if (dayOfWeek === 6) {
                    ctx.fillStyle = '#1E88E5';
                } else if (isHoliday(date)) {
                    ctx.fillStyle = '#E53935';
                } else {
                    ctx.fillStyle = '#333333';
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '12px sans-serif';
                ctx.fillText(String(day), x + DAY_WIDTH / 2, dayNumY);

                ctx.font = '10px sans-serif';
                ctx.fillText(dayNames[dayOfWeek], x + DAY_WIDTH / 2, dayNameY);
            }
        }

        // 4) 月境界の区切り線（ヘッダー内）
        for (const mb of this.monthBoundaries) {
            if (mb.startDayOffset === 0) continue;
            const x = mb.startDayOffset * DAY_WIDTH;
            ctx.strokeStyle = '#90A4AE';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, HEADER_HEIGHT);
            ctx.stroke();
        }

        // ヘッダー下部の線
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, HEADER_HEIGHT);
        ctx.lineTo(this.timelineWidth, HEADER_HEIGHT);
        ctx.stroke();
    }

    /**
     * ラベルヘッダー描画（labelCanvas）
     */
    drawLabelHeader() {
        const ctx = this.labelCtx;
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, LABEL_WIDTH, HEADER_HEIGHT);

        // ヘッダー下部の線
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, HEADER_HEIGHT);
        ctx.lineTo(LABEL_WIDTH, HEADER_HEIGHT);
        ctx.stroke();

        // 右端の区切り線
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LABEL_WIDTH - 0.5, 0);
        ctx.lineTo(LABEL_WIDTH - 0.5, this.totalHeight);
        ctx.stroke();
    }

    /**
     * グリッド描画（timelineCanvas）
     */
    drawGrid(rowCount) {
        const ctx = this.timelineCtx;
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 0.5;

        // 縦線
        for (let day = 0; day <= this.totalDays; day++) {
            const x = day * DAY_WIDTH;
            ctx.beginPath();
            ctx.moveTo(x, HEADER_HEIGHT);
            ctx.lineTo(x, this.totalHeight);
            ctx.stroke();
        }

        // 横線
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
     */
    drawMonthSeparators() {
        const ctx = this.timelineCtx;
        for (const mb of this.monthBoundaries) {
            if (mb.startDayOffset === 0) continue;
            const x = mb.startDayOffset * DAY_WIDTH;

            // 半透明の帯で境界を強調
            ctx.fillStyle = 'rgba(144, 164, 174, 0.12)';
            ctx.fillRect(x - 2, HEADER_HEIGHT, 4, this.totalHeight - HEADER_HEIGHT);

            // 太めの実線
            ctx.strokeStyle = '#78909C';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, HEADER_HEIGHT);
            ctx.lineTo(x, this.totalHeight);
            ctx.stroke();
        }
    }

    /**
     * 今日の線を描画
     */
    drawTodayLine() {
        const today = new Date();
        today.setHours(12, 0, 0, 0);

        if (today < this.rangeStart || today > this.rangeEnd) return;

        const ctx = this.timelineCtx;
        const x = this.dateToX(today) + DAY_WIDTH / 2;

        ctx.strokeStyle = TODAY_LINE;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(x, HEADER_HEIGHT);
        ctx.lineTo(x, this.totalHeight);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /**
     * 行を描画（timelineCanvas - バーのみ）
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
                    ctx.fillStyle = index % 2 === 0 ? '#F5F5F5' : '#EFEFEF';
                    ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                } else if (isHoliday(date)) {
                    ctx.fillStyle = index % 2 === 0 ? '#FFF0E0' : '#FFE8D0';
                    ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                } else if (memberName) {
                    // 担当者休暇チェック（担当者別ビューのみ）
                    const dateStr = formatDateString(date);
                    const vacation = getMemberVacation(memberName, dateStr);
                    if (vacation) {
                        if (vacation.hours >= 8 || vacation.vacationType !== '時間休') {
                            // 全日休暇（有休・特休・代休・振休 等）
                            ctx.fillStyle = index % 2 === 0 ? '#F3E5F5' : '#EDE0F0';
                            ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                        } else {
                            // 時間休（部分休暇）
                            ctx.fillStyle = index % 2 === 0 ? '#F9F0FB' : '#F4EBF6';
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
     */
    drawLabelColumn(rows) {
        const ctx = this.labelCtx;

        rows.forEach((row, index) => {
            const y = HEADER_HEIGHT + index * ROW_HEIGHT;

            // ゼブラ背景
            ctx.fillStyle = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            ctx.fillRect(0, y, LABEL_WIDTH, ROW_HEIGHT);

            // ホバーハイライト
            if (index === this.hoverRowIndex) {
                ctx.fillStyle = HOVER_HIGHLIGHT;
                ctx.fillRect(0, y, LABEL_WIDTH, ROW_HEIGHT);
            }

            // 横線
            ctx.strokeStyle = GRID;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y + ROW_HEIGHT);
            ctx.lineTo(LABEL_WIDTH, y + ROW_HEIGHT);
            ctx.stroke();

            // ラベルテキスト
            ctx.fillStyle = '#333333';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            const maxLabelWidth = LABEL_WIDTH - 10;
            let labelText = row.label;
            while (ctx.measureText(labelText).width > maxLabelWidth && labelText.length > 0) {
                labelText = labelText.slice(0, -1);
            }
            if (labelText !== row.label) {
                labelText += '…';
            }

            ctx.fillText(labelText, 5, y + ROW_HEIGHT / 2);
        });
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

        // 休日の日を事前計算
        const holidayXs = [];
        const current = new Date(visibleStart);
        while (current <= visibleEnd) {
            if (!isBusinessDay(current, schedule.member)) {
                holidayXs.push(this.dateToX(current));
            }
            current.setDate(current.getDate() + 1);
        }

        // 計画バー
        ctx.fillStyle = lightColor;
        ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);

        // 枠線
        ctx.strokeStyle = taskColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, BAR_HEIGHT);

        // 進捗情報
        const progressInfo = this.getScheduleProgress(schedule);

        // 実績バー
        if (progressInfo.progressRate > 0) {
            const actualBarWidth = barWidth * (progressInfo.progressRate / 100);
            ctx.fillStyle = taskColor;
            ctx.fillRect(barX, barY, actualBarWidth, BAR_HEIGHT);
        }

        // 休日セル: 背景色で塗りつぶし、バーの色をかすかに残す
        holidayXs.forEach(hx => {
            this.drawHolidayOverlay(ctx, hx, barY, DAY_WIDTH, BAR_HEIGHT);
        });

        // 見込み残存インジケータ
        if (progressInfo.hasUserRemaining) {
            ctx.fillStyle = '#ffc107';
            ctx.fillRect(barX, barY - 3, barWidth, 2);
        }

        // テキスト表示（工程 | ステータスアイコン | %を重ならないよう配置）
        {
            const progressRate = Math.round(progressInfo.progressRate);
            const barCenterY = barY + BAR_HEIGHT / 2;
            ctx.textBaseline = 'middle';

            const percentText = `${progressRate}%`;
            const rightPad = 4;
            const processLeftPad = 4;
            const gap = 4;

            // ステータスアイコン判定
            let statusIcon = '';
            let statusColor = '';
            if (schedule.status === SCHEDULE.STATUS.COMPLETED) {
                statusIcon = '✓';
                statusColor = COMPLETED;
            } else if (this.isDelayed(schedule)) {
                statusIcon = '!';
                statusColor = DELAYED;
            }

            // 各要素の幅を測定
            ctx.font = 'bold 10px sans-serif';
            const percentWidth = ctx.measureText(percentText).width;
            ctx.font = 'bold 11px sans-serif';
            const iconWidth = statusIcon ? ctx.measureText(statusIcon).width + 2 : 0;
            ctx.font = '11px sans-serif';
            const processText = schedule.process || '';
            const processWidth = ctx.measureText(processText).width;

            // バー内に全要素が収まるか判定
            const rightOccupied = percentWidth + iconWidth + rightPad;
            const allInsideWidth = processLeftPad + processWidth + gap + rightOccupied;
            const fitsInside = barWidth >= allInsideWidth;

            if (fitsInside) {
                // バー内に全て収まる: [工程 ... アイコン %]
                ctx.font = '11px sans-serif';
                ctx.fillStyle = '#333333';
                ctx.textAlign = 'left';
                ctx.fillText(processText, barX + processLeftPad, barCenterY);

                if (statusIcon) {
                    ctx.fillStyle = statusColor;
                    ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'right';
                    ctx.fillText(statusIcon, barX + barWidth - rightPad - percentWidth - 2, barCenterY);
                }

                ctx.textAlign = 'right';
                ctx.fillStyle = progressRate >= 100 ? '#198754' : (progressRate > 0 ? '#0d6efd' : '#6c757d');
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText(percentText, barX + barWidth - rightPad, barCenterY);
            } else {
                // バー内に収まらない: 工程を優先、%は余裕があれば表示
                const availableWidth = barWidth - processLeftPad - rightPad;

                // 工程+%が入るか（アイコン無しで）
                const bothFitCompact = processWidth + gap + percentWidth <= availableWidth;

                if (bothFitCompact) {
                    // 工程と%だけ表示（アイコン省略）
                    ctx.font = '11px sans-serif';
                    ctx.fillStyle = '#333333';
                    ctx.textAlign = 'left';
                    ctx.fillText(processText, barX + processLeftPad, barCenterY);

                    ctx.textAlign = 'right';
                    ctx.fillStyle = progressRate >= 100 ? '#198754' : (progressRate > 0 ? '#0d6efd' : '#6c757d');
                    ctx.font = 'bold 10px sans-serif';
                    ctx.fillText(percentText, barX + barWidth - rightPad, barCenterY);
                } else if (processWidth <= availableWidth) {
                    // 工程のみ表示（%省略）
                    ctx.font = '11px sans-serif';
                    ctx.fillStyle = '#333333';
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

const dragState = {
    isDragging: false,
    wasDragging: false,
    schedule: null,
    startX: 0,
    startY: 0,
    originalStartDate: null,
    previewDate: null,
    autoScrollId: null
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
                dragState.originalStartDate = schedule.startDate;
                dragState.previewDate = null;
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
            if (movedX > DAY_WIDTH / 2 && dragState.previewDate && onScheduleUpdate) {
                onScheduleUpdate(dragState.schedule.id, dragState.previewDate);
                dragState.wasDragging = true;
            }

            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;
            canvas.style.cursor = 'default';

            if (renderer) {
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
    ctx.fillStyle = '#4A90D9';
    ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);
    ctx.strokeStyle = '#2171C9';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(barX, barY, barWidth, BAR_HEIGHT);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = '#333';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(newStartDate.slice(5), barX + barWidth / 2, barY - 5);
}
