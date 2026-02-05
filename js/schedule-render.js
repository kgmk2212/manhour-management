// ============================================
// スケジュール描画モジュール（ガントチャートCanvas描画）
// ============================================

import { schedules, scheduleSettings, estimates, actuals, vacations, companyHolidays, taskColorMap, remainingEstimates } from './state.js';
import { SCHEDULE, TASK_COLORS } from './constants.js';
import { getTaskColor, calculateEndDate, isBusinessDay } from './schedule.js';

// ローカルヘルパー関数（循環参照を避けるためutils.jsからインポートしない）
function formatHoursLocal(hours) {
    if (hours == null || isNaN(hours)) return '0.0';
    const fixed2 = hours.toFixed(2);
    if (fixed2.endsWith('0')) {
        return hours.toFixed(1);
    }
    return fixed2;
}
import { isCompanyHoliday } from './vacation.js';
import holiday_jp from 'https://cdn.jsdelivr.net/npm/@holiday-jp/holiday_jp@2.4.0/+esm';

// ============================================
// 定数
// ============================================

const { BAR_HEIGHT, ROW_HEIGHT, HEADER_HEIGHT, DAY_WIDTH, LABEL_WIDTH, ROW_PADDING } = SCHEDULE.CANVAS;
const { PLAN_BAR, ACTUAL_BAR, DELAYED, COMPLETED, TODAY_LINE, WEEKEND, HOLIDAY, GRID } = SCHEDULE.COLORS;

// ゼブラストライプの色
const ZEBRA_LIGHT = '#FFFFFF';
const ZEBRA_DARK = '#F8FAFC';
const HOVER_HIGHLIGHT = 'rgba(74, 144, 217, 0.08)';

// ============================================
// ユーティリティ関数
// ============================================

/**
 * 指定月の日数を取得
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {number}
 */
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * 日付が週末かどうかを判定
 * @param {Date} date
 * @returns {boolean}
 */
function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * 日付が祝日または会社休日かどうかを判定
 * @param {Date} date
 * @returns {boolean}
 */
function isHoliday(date) {
    // 週末でなく、営業日でもない場合は祝日/会社休日
    if (!isWeekend(date) && !isBusinessDay(date, null)) {
        return true;
    }
    return false;
}

/**
 * 日付を文字列に変換（YYYY-MM-DD形式）
 * @param {Date} date
 * @returns {string}
 */
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 担当者の休暇を取得
 * @param {string} member
 * @param {string} dateStr (YYYY-MM-DD)
 * @returns {object|null}
 */
function getMemberVacation(member, dateStr) {
    return vacations.find(v => v.member === member && v.date === dateStr) || null;
}

// ============================================
// Canvas描画クラス
// ============================================

export class GanttChartRenderer {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scheduleRects = []; // クリック判定用のスケジュール矩形情報
        this.currentYear = null;
        this.currentMonth = null;
        this.daysInMonth = 0;
        this.totalWidth = 0;
        this.totalHeight = 0;
        this.hoverRowIndex = -1; // ホバー中の行インデックス
        this.rows = []; // 行データ（ホバー描画用）
        this.filteredSchedulesCache = null; // フィルタされたスケジュールのキャッシュ
        this.dpr = window.devicePixelRatio || 1; // 高DPIディスプレイ対応
    }

    /**
     * ガントチャートを描画
     * @param {number} year
     * @param {number} month (1-12)
     * @param {Array} filteredSchedules - フィルタされたスケジュール（省略時は全件使用）
     */
    render(year, month, filteredSchedules = null) {
        this.currentYear = year;
        this.currentMonth = month;
        this.daysInMonth = getDaysInMonth(year, month);
        this.scheduleRects = [];

        // 表示するスケジュールをフィルタリング
        const sourceSchedules = filteredSchedules || schedules;
        const visibleSchedules = this.getVisibleSchedulesFromSource(year, month, sourceSchedules);

        // 行データを構築
        const rows = this.buildRows(visibleSchedules);
        this.rows = rows; // ホバー描画用にキャッシュ
        this.filteredSchedulesCache = filteredSchedules;

        // Canvasサイズを計算・設定
        this.totalWidth = LABEL_WIDTH + (this.daysInMonth * DAY_WIDTH);
        this.totalHeight = HEADER_HEIGHT + (rows.length * ROW_HEIGHT);

        // 最小高さを設定
        this.totalHeight = Math.max(this.totalHeight, 300);

        // 高DPIディスプレイ対応
        // Canvas要素の実際のピクセルサイズをデバイスピクセル比で拡大
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.totalWidth * this.dpr;
        this.canvas.height = this.totalHeight * this.dpr;

        // CSS上のサイズは論理サイズを維持
        this.canvas.style.width = this.totalWidth + 'px';
        this.canvas.style.height = this.totalHeight + 'px';

        // コンテキストをスケール
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        // 描画開始
        this.ctx.clearRect(0, 0, this.totalWidth, this.totalHeight);

        // 背景描画
        this.drawBackground();

        // ヘッダー描画（日付）
        this.drawHeader();

        // グリッド描画
        this.drawGrid(rows.length);

        // 今日の線を描画
        this.drawTodayLine();

        // 行を描画
        this.drawRows(rows);
    }

    /**
     * 指定月に表示すべきスケジュールを取得
     */
    getVisibleSchedules(year, month) {
        return this.getVisibleSchedulesFromSource(year, month, schedules);
    }

    /**
     * 指定月に表示すべきスケジュールを取得（ソース配列指定版）
     */
    getVisibleSchedulesFromSource(year, month, sourceSchedules) {
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);

        return sourceSchedules.filter(schedule => {
            const startDate = new Date(schedule.startDate);
            const endDate = new Date(schedule.endDate);

            // スケジュールが月の範囲と重なるかチェック
            return startDate <= monthEnd && endDate >= monthStart;
        });
    }

    /**
     * 行データを構築
     */
    buildRows(visibleSchedules) {
        const viewMode = scheduleSettings.viewMode;
        const rows = [];

        if (viewMode === SCHEDULE.VIEW_MODE.MEMBER) {
            // 担当者ごとにグループ化
            const memberMap = new Map();

            visibleSchedules.forEach(schedule => {
                if (!memberMap.has(schedule.member)) {
                    memberMap.set(schedule.member, []);
                }
                memberMap.get(schedule.member).push(schedule);
            });

            memberMap.forEach((scheduleList, member) => {
                rows.push({
                    label: member,
                    type: 'member',
                    schedules: scheduleList
                });
            });
        } else {
            // タスクごとにグループ化
            const taskMap = new Map();

            visibleSchedules.forEach(schedule => {
                const taskKey = `${schedule.version}-${schedule.task}`;
                if (!taskMap.has(taskKey)) {
                    taskMap.set(taskKey, {
                        label: schedule.task,
                        version: schedule.version,
                        schedules: []
                    });
                }
                taskMap.get(taskKey).schedules.push(schedule);
            });

            taskMap.forEach(taskData => {
                rows.push({
                    label: taskData.label,
                    type: 'task',
                    version: taskData.version,
                    schedules: taskData.schedules
                });
            });
        }

        return rows;
    }

    /**
     * 背景を描画
     */
    drawBackground() {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.totalWidth, this.totalHeight);
    }

    /**
     * ヘッダー（日付行）を描画
     */
    drawHeader() {
        const ctx = this.ctx;

        // ヘッダー背景
        ctx.fillStyle = '#F5F5F5';
        ctx.fillRect(0, 0, this.totalWidth, HEADER_HEIGHT);

        // 月表示
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            `${this.currentYear}年${this.currentMonth}月`,
            LABEL_WIDTH / 2,
            HEADER_HEIGHT / 4
        );

        // 日付を描画
        ctx.font = '12px sans-serif';
        for (let day = 1; day <= this.daysInMonth; day++) {
            const x = LABEL_WIDTH + (day - 1) * DAY_WIDTH;
            const date = new Date(this.currentYear, this.currentMonth - 1, day);
            const dayOfWeek = date.getDay();

            // 背景色（週末・祝日）
            if (isWeekend(date)) {
                ctx.fillStyle = WEEKEND;
                ctx.fillRect(x, 0, DAY_WIDTH, HEADER_HEIGHT);
            } else if (isHoliday(date)) {
                ctx.fillStyle = HOLIDAY;
                ctx.fillRect(x, 0, DAY_WIDTH, HEADER_HEIGHT);
            }

            // 曜日の色
            if (dayOfWeek === 0) {
                ctx.fillStyle = '#E53935'; // 日曜：赤
            } else if (dayOfWeek === 6) {
                ctx.fillStyle = '#1E88E5'; // 土曜：青
            } else if (isHoliday(date)) {
                ctx.fillStyle = '#E53935'; // 祝日：赤
            } else {
                ctx.fillStyle = '#333333';
            }

            // 日付
            ctx.textAlign = 'center';
            ctx.fillText(String(day), x + DAY_WIDTH / 2, HEADER_HEIGHT / 2);

            // 曜日（短縮形）
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            ctx.font = '10px sans-serif';
            ctx.fillText(dayNames[dayOfWeek], x + DAY_WIDTH / 2, HEADER_HEIGHT * 3 / 4);
            ctx.font = '12px sans-serif';
        }

        // ヘッダー下部の線
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, HEADER_HEIGHT);
        ctx.lineTo(this.totalWidth, HEADER_HEIGHT);
        ctx.stroke();
    }

    /**
     * グリッドを描画
     */
    drawGrid(rowCount) {
        const ctx = this.ctx;
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 0.5;

        // 縦線（日付区切り）
        for (let day = 0; day <= this.daysInMonth; day++) {
            const x = LABEL_WIDTH + day * DAY_WIDTH;
            ctx.beginPath();
            ctx.moveTo(x, HEADER_HEIGHT);
            ctx.lineTo(x, this.totalHeight);
            ctx.stroke();
        }

        // 横線（行区切り）
        for (let row = 0; row <= rowCount; row++) {
            const y = HEADER_HEIGHT + row * ROW_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.totalWidth, y);
            ctx.stroke();
        }

        // ラベル列と日付列の区切り線
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(LABEL_WIDTH, 0);
        ctx.lineTo(LABEL_WIDTH, this.totalHeight);
        ctx.stroke();
    }

    /**
     * 今日の線を描画
     */
    drawTodayLine() {
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();

        // 今月でなければ描画しない
        if (todayYear !== this.currentYear || todayMonth !== this.currentMonth) {
            return;
        }

        const ctx = this.ctx;
        const x = LABEL_WIDTH + (todayDate - 0.5) * DAY_WIDTH;

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
     * 行を描画
     */
    drawRows(rows) {
        const ctx = this.ctx;

        rows.forEach((row, index) => {
            const y = HEADER_HEIGHT + index * ROW_HEIGHT;

            // ゼブラストライプの背景を描画
            const zebraColor = index % 2 === 0 ? ZEBRA_LIGHT : ZEBRA_DARK;
            ctx.fillStyle = zebraColor;
            ctx.fillRect(LABEL_WIDTH, y, this.totalWidth - LABEL_WIDTH, ROW_HEIGHT);

            // ホバー行のハイライト
            if (index === this.hoverRowIndex) {
                ctx.fillStyle = HOVER_HIGHLIGHT;
                ctx.fillRect(0, y, this.totalWidth, ROW_HEIGHT);
            }

            // 週末・祝日の背景を描画（ゼブラの上に重ねる）
            for (let day = 1; day <= this.daysInMonth; day++) {
                const date = new Date(this.currentYear, this.currentMonth - 1, day);
                const x = LABEL_WIDTH + (day - 1) * DAY_WIDTH;

                if (isWeekend(date)) {
                    ctx.fillStyle = index % 2 === 0 ? '#F5F5F5' : '#EFEFEF';
                    ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                } else if (isHoliday(date)) {
                    ctx.fillStyle = index % 2 === 0 ? '#FFF8E7' : '#FFF3D9';
                    ctx.fillRect(x, y, DAY_WIDTH, ROW_HEIGHT);
                }
            }

            // ラベル背景（ゼブラ対応）
            ctx.fillStyle = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
            ctx.fillRect(0, y, LABEL_WIDTH, ROW_HEIGHT);

            ctx.fillStyle = '#333333';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // ラベルテキストを省略
            const maxLabelWidth = LABEL_WIDTH - 10;
            let labelText = row.label;
            while (ctx.measureText(labelText).width > maxLabelWidth && labelText.length > 0) {
                labelText = labelText.slice(0, -1);
            }
            if (labelText !== row.label) {
                labelText += '…';
            }

            ctx.fillText(labelText, 5, y + ROW_HEIGHT / 2);

            // スケジュールバーを描画
            row.schedules.forEach(schedule => {
                this.drawScheduleBar(schedule, y);
            });
        });
    }

    /**
     * スケジュールバーを描画
     */
    drawScheduleBar(schedule, rowY) {
        const ctx = this.ctx;
        const monthStart = new Date(this.currentYear, this.currentMonth - 1, 1);
        const monthEnd = new Date(this.currentYear, this.currentMonth, 0);

        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        // 表示範囲内の開始・終了日を計算
        const visibleStart = startDate < monthStart ? monthStart : startDate;
        const visibleEnd = endDate > monthEnd ? monthEnd : endDate;

        // 日付からX座標を計算
        const startDay = visibleStart.getDate();
        const endDay = visibleEnd.getDate();

        const barX = LABEL_WIDTH + (startDay - 1) * DAY_WIDTH;
        const barWidth = (endDay - startDay + 1) * DAY_WIDTH;
        const barY = rowY + ROW_PADDING;

        // タスクの色を取得
        const taskColor = getTaskColor(schedule.version, schedule.task);

        // 計画バー（下層・薄い色）
        ctx.fillStyle = this.lightenColor(taskColor, 0.6);
        ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);

        // 計画バーの枠線
        ctx.strokeStyle = taskColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, BAR_HEIGHT);

        // 進捗情報を取得（見込み残存時間を考慮）
        const progressInfo = this.getScheduleProgress(schedule);

        // 実績バーを描画（進捗率に応じて）
        if (progressInfo.progressRate > 0) {
            const actualBarWidth = barWidth * (progressInfo.progressRate / 100);

            ctx.fillStyle = taskColor;
            ctx.fillRect(barX, barY, actualBarWidth, BAR_HEIGHT);
        }

        // 見込み残存時間がある場合は上部に小さなインジケータ
        if (progressInfo.hasUserRemaining) {
            ctx.fillStyle = '#ffc107';
            ctx.fillRect(barX, barY - 3, barWidth, 2);
        }

        // ステータスに応じた装飾
        if (schedule.status === SCHEDULE.STATUS.COMPLETED) {
            // 完了：チェックマーク
            ctx.fillStyle = COMPLETED;
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText('✓', barX + barWidth - 3, barY + BAR_HEIGHT / 2);
        } else if (this.isDelayed(schedule)) {
            // 遅延：警告アイコン
            ctx.fillStyle = DELAYED;
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', barX + barWidth - 3, barY + BAR_HEIGHT / 2);
        }

        // バー上のテキスト表示
        if (barWidth > 30) {
            const progressRate = Math.round(progressInfo.progressRate);
            ctx.font = '11px sans-serif';
            ctx.textBaseline = 'middle';

            // 工程名（左寄せ）
            if (barWidth > 60) {
                ctx.fillStyle = '#333333';
                ctx.textAlign = 'left';
                let processText = schedule.process || '';
                const maxTextWidth = barWidth - 45;
                while (ctx.measureText(processText).width > maxTextWidth && processText.length > 0) {
                    processText = processText.slice(0, -1);
                }
                if (processText !== schedule.process) {
                    processText += '…';
                }
                ctx.fillText(processText, barX + 4, barY + BAR_HEIGHT / 2);
            }

            // 進捗率（右寄せ）
            ctx.textAlign = 'right';
            ctx.fillStyle = progressRate >= 100 ? '#198754' : (progressRate > 0 ? '#0d6efd' : '#6c757d');
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText(`${progressRate}%`, barX + barWidth - 4, barY + BAR_HEIGHT / 2);
        }

        // クリック判定用の矩形情報を保存
        this.scheduleRects.push({
            schedule,
            x: barX,
            y: barY,
            width: barWidth,
            height: BAR_HEIGHT
        });
    }

    /**
     * スケジュールに対応する実績時間を取得
     */
    getScheduleActualHours(schedule) {
        const relatedActuals = actuals.filter(a =>
            a.version === schedule.version &&
            a.task === schedule.task &&
            a.process === schedule.process &&
            a.member === schedule.member
        );

        return relatedActuals.reduce((sum, a) => sum + (a.hours || 0), 0);
    }

    /**
     * スケジュールの進捗情報を取得（見込み残存時間を考慮）
     */
    getScheduleProgress(schedule) {
        const actualHours = this.getScheduleActualHours(schedule);
        const estimatedHours = schedule.estimatedHours || 0;
        
        // 見込み残存時間を取得
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
        
        // 進捗率計算
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

    /**
     * スケジュールが遅延しているか判定
     */
    isDelayed(schedule) {
        if (schedule.status === SCHEDULE.STATUS.COMPLETED) {
            return false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(schedule.endDate);

        // 終了日を過ぎていて未完了なら遅延
        if (today > endDate) {
            return true;
        }

        // 進捗率が予定より遅れている場合も遅延とみなす
        const startDate = new Date(schedule.startDate);
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        const elapsedDays = Math.ceil((today - startDate) / (1000 * 60 * 60 * 24));

        const actualHours = this.getScheduleActualHours(schedule);
        const estimatedHours = schedule.estimatedHours || 0;

        if (elapsedDays > 0 && estimatedHours > 0) {
            const expectedProgress = elapsedDays / totalDays;
            const actualProgress = actualHours / estimatedHours;

            // 予定進捗の80%未満なら遅延
            if (actualProgress < expectedProgress * 0.8) {
                return true;
            }
        }

        return false;
    }

    /**
     * 色を明るくする
     */
    lightenColor(hex, factor) {
        // HEXをRGBに変換
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);

        // 明るくする
        const newR = Math.round(r + (255 - r) * factor);
        const newG = Math.round(g + (255 - g) * factor);
        const newB = Math.round(b + (255 - b) * factor);

        // RGBをHEXに戻す
        return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }

    /**
     * クリック位置からスケジュールを取得
     * @param {number} x
     * @param {number} y
     * @returns {object|null}
     */
    getScheduleAtPosition(x, y) {
        for (const rect of this.scheduleRects) {
            if (x >= rect.x && x <= rect.x + rect.width &&
                y >= rect.y && y <= rect.y + rect.height) {
                return rect.schedule;
            }
        }
        return null;
    }

    /**
     * クリック位置から日付を取得
     * @param {number} x
     * @returns {Date|null}
     */
    getDateAtPosition(x) {
        if (x < LABEL_WIDTH) {
            return null;
        }

        const dayIndex = Math.floor((x - LABEL_WIDTH) / DAY_WIDTH);
        if (dayIndex < 0 || dayIndex >= this.daysInMonth) {
            return null;
        }

        return new Date(this.currentYear, this.currentMonth - 1, dayIndex + 1);
    }

    /**
     * Y座標から行インデックスを取得
     * @param {number} y
     * @returns {number} 行インデックス（-1は行外）
     */
    getRowIndexAtPosition(y) {
        if (y < HEADER_HEIGHT) {
            return -1;
        }

        const rowIndex = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
        if (rowIndex < 0 || rowIndex >= this.rows.length) {
            return -1;
        }

        return rowIndex;
    }

    /**
     * ホバー行を設定して再描画
     * @param {number} rowIndex
     */
    setHoverRow(rowIndex) {
        if (this.hoverRowIndex !== rowIndex) {
            this.hoverRowIndex = rowIndex;
            // 軽量な再描画
            this.render(this.currentYear, this.currentMonth, this.filteredSchedulesCache);
        }
    }
}

// サマリー更新はschedule.jsで実装済み

// ============================================
// ツールチップ
// ============================================

let tooltipElement = null;
let currentTooltipSchedule = null;

/**
 * ツールチップ要素を作成
 */
function createTooltipElement() {
    if (tooltipElement) return tooltipElement;
    
    tooltipElement = document.createElement('div');
    tooltipElement.id = 'ganttTooltip';
    tooltipElement.className = 'gantt-tooltip';
    tooltipElement.style.display = 'none';
    document.body.appendChild(tooltipElement);
    
    return tooltipElement;
}

/**
 * ツールチップを表示
 */
function showTooltip(schedule, x, y, renderer) {
    const tooltip = createTooltipElement();

    // 進捗計算（見込み残存時間を考慮）
    const progressInfo = renderer.getScheduleProgress(schedule);
    const progressRate = Math.round(progressInfo.progressRate);

    // ステータスラベル
    const statusLabels = {
        'pending': '未着手',
        'in_progress': '進行中',
        'completed': '完了'
    };
    const statusLabel = statusLabels[schedule.status] || '未着手';

    // 遅延判定
    const isDelayedSchedule = renderer.isDelayed(schedule);

    // 残時間の表示（ユーザー入力がある場合は★マーク付き）
    const remainingDisplay = progressInfo.hasUserRemaining
        ? `${formatHoursLocal(progressInfo.remainingHours)}h ★`
        : `${formatHoursLocal(progressInfo.remainingHours)}h`;

    tooltip.innerHTML = `
        <div class="tooltip-header">
            <strong>${schedule.task}</strong>
            <span class="tooltip-status ${schedule.status || 'pending'}">${statusLabel}</span>
        </div>
        <div class="tooltip-body">
            <div class="tooltip-row">
                <span class="tooltip-label">工程:</span>
                <span>${schedule.process}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">担当:</span>
                <span>${schedule.member}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">期間:</span>
                <span>${schedule.startDate} 〜 ${schedule.endDate}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">進捗:</span>
                <span class="${isDelayedSchedule ? 'delayed' : ''}">${progressRate}% (${formatHoursLocal(progressInfo.actualHours)}h / ${progressInfo.estimatedHours}h)</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">残:</span>
                <span>${remainingDisplay}</span>
            </div>
            ${isDelayedSchedule ? '<div class="tooltip-warning">⚠️ 遅延中</div>' : ''}
        </div>
    `;
    
    // 位置調整
    tooltip.style.display = 'block';
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let posX = x + 15;
    let posY = y + 15;
    
    // 画面外にはみ出す場合の調整
    if (posX + tooltipRect.width > viewportWidth - 10) {
        posX = x - tooltipRect.width - 15;
    }
    if (posY + tooltipRect.height > viewportHeight - 10) {
        posY = y - tooltipRect.height - 15;
    }
    
    tooltip.style.left = `${posX}px`;
    tooltip.style.top = `${posY}px`;
    
    currentTooltipSchedule = schedule;
}

/**
 * ツールチップを非表示
 */
function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.style.display = 'none';
    }
    currentTooltipSchedule = null;
}

/**
 * ツールチップイベントをセットアップ
 */
export function setupTooltipHandler() {
    const canvas = document.getElementById('ganttCanvas');
    if (!canvas) return;
    
    canvas.addEventListener('mousemove', (event) => {
        // ドラッグ中はツールチップを表示しない
        if (dragState.isDragging) {
            hideTooltip();
            return;
        }
        
        const renderer = getRenderer();
        if (!renderer) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // ホバー行のハイライト更新
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
        if (renderer) {
            renderer.setHoverRow(-1);
        }
    });
}

// ============================================
// エクスポート用インスタンス管理
// ============================================

let rendererInstance = null;

/**
 * レンダラーインスタンスを取得または作成
 */
export function getRenderer() {
    const canvas = document.getElementById('ganttCanvas');
    if (!canvas) return null;

    if (!rendererInstance || rendererInstance.canvas !== canvas) {
        rendererInstance = new GanttChartRenderer(canvas);
    }

    return rendererInstance;
}

/**
 * ガントチャートを描画
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @param {Array} filteredSchedules - フィルタされたスケジュール（省略時は全件）
 */
export function renderGanttChart(year, month, filteredSchedules = null) {
    const renderer = getRenderer();
    if (renderer) {
        renderer.render(year, month, filteredSchedules);
    }
}

/**
 * クリックイベントハンドラをセットアップ
 */
export function setupCanvasClickHandler(onScheduleClick) {
    const canvas = document.getElementById('ganttCanvas');
    if (!canvas) return;

    canvas.addEventListener('click', (event) => {
        // ドラッグ中はクリックイベントを無視
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
    previewDate: null
};

/**
 * ドラッグ&ドロップイベントをセットアップ
 */
export function setupDragAndDrop(onScheduleUpdate) {
    const canvas = document.getElementById('ganttCanvas');
    if (!canvas) return;

    // マウスダウン
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

    // マウスムーブ
    canvas.addEventListener('mousemove', (event) => {
        const renderer = getRenderer();
        if (!renderer) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // ドラッグ中
        if (dragState.isDragging && dragState.schedule) {
            const newDate = renderer.getDateAtPosition(x);
            if (newDate) {
                const dateStr = formatDateForDrag(newDate);
                if (dateStr !== dragState.previewDate) {
                    dragState.previewDate = dateStr;
                    // プレビュー描画
                    drawDragPreview(renderer, dragState.schedule, dateStr);
                }
            }
        } else {
            // ホバー時のカーソル変更
            const schedule = renderer.getScheduleAtPosition(x, y);
            canvas.style.cursor = schedule ? 'grab' : 'default';
        }
    });

    // マウスアップ
    canvas.addEventListener('mouseup', (event) => {
        if (!dragState.isDragging) return;

        const renderer = getRenderer();
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;

        // 移動距離チェック（小さい移動は無視）
        const movedX = Math.abs(x - dragState.startX);

        if (movedX > DAY_WIDTH / 2 && dragState.previewDate && onScheduleUpdate) {
            // 着手日を更新
            onScheduleUpdate(dragState.schedule.id, dragState.previewDate);
            dragState.wasDragging = true;
        }

        // ドラッグ状態をリセット
        dragState.isDragging = false;
        dragState.schedule = null;
        dragState.previewDate = null;
        canvas.style.cursor = 'default';

        // 再描画
        if (renderer) {
            renderer.render(renderer.currentYear, renderer.currentMonth);
        }
    });

    // マウスリーブ（Canvas外にマウスが出た場合）
    canvas.addEventListener('mouseleave', () => {
        if (dragState.isDragging) {
            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;

            const renderer = getRenderer();
            if (renderer) {
                renderer.render(renderer.currentYear, renderer.currentMonth);
            }
        }
        canvas.style.cursor = 'default';
    });

    // Escキーでキャンセル
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && dragState.isDragging) {
            dragState.isDragging = false;
            dragState.schedule = null;
            dragState.previewDate = null;

            const renderer = getRenderer();
            const canvas = document.getElementById('ganttCanvas');
            if (renderer) {
                renderer.render(renderer.currentYear, renderer.currentMonth);
            }
            if (canvas) {
                canvas.style.cursor = 'default';
            }
        }
    });
}

/**
 * ドラッグ用の日付フォーマット
 */
function formatDateForDrag(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * ドラッグプレビューを描画
 */
function drawDragPreview(renderer, schedule, newStartDate) {
    // まず現在の状態を再描画
    renderer.render(renderer.currentYear, renderer.currentMonth);

    const ctx = renderer.ctx;
    const monthStart = new Date(renderer.currentYear, renderer.currentMonth - 1, 1);
    const monthEnd = new Date(renderer.currentYear, renderer.currentMonth, 0);

    // 新しい開始日から終了日を計算（同じ期間を維持）
    const originalStart = new Date(schedule.startDate);
    const originalEnd = new Date(schedule.endDate);
    const duration = Math.ceil((originalEnd - originalStart) / (1000 * 60 * 60 * 24));

    const newStart = new Date(newStartDate);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + duration);

    // 表示範囲内の開始・終了日を計算
    const visibleStart = newStart < monthStart ? monthStart : newStart;
    const visibleEnd = newEnd > monthEnd ? monthEnd : newEnd;

    const startDay = visibleStart.getDate();
    const endDay = visibleEnd.getDate();

    const barX = LABEL_WIDTH + (startDay - 1) * DAY_WIDTH;
    const barWidth = (endDay - startDay + 1) * DAY_WIDTH;

    // 元のバーの行位置を見つける
    const originalRect = renderer.scheduleRects.find(r => r.schedule.id === schedule.id);
    if (!originalRect) return;

    const barY = originalRect.y;

    // プレビューバーを半透明で描画
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#4A90D9';
    ctx.fillRect(barX, barY, barWidth, BAR_HEIGHT);
    ctx.strokeStyle = '#2171C9';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(barX, barY, barWidth, BAR_HEIGHT);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    // 新しい日付を表示
    ctx.fillStyle = '#333';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(newStartDate.slice(5), barX + barWidth / 2, barY - 5);
}
