// ============================================
// [GANTT-CHART] スケジュール中断・差し込み管理
// ============================================

import {
    schedules, setSchedules, nextScheduleId, setNextScheduleId,
    scheduleSettings, estimates
} from './state.js';
import {
    isBusinessDay, calculateEndDate, countBusinessDays, formatDateForCheck
} from './schedule.js';
import { SCHEDULE } from './constants.js';

/**
 * 翌営業日を取得
 * @param {string} dateStr - 基準日（YYYY-MM-DD）
 * @param {string} member - 担当者名
 * @returns {string} 翌営業日（YYYY-MM-DD）
 */
export function getNextBusinessDay(dateStr, member) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    while (!isBusinessDay(date, member)) {
        date.setDate(date.getDate() + 1);
    }
    return formatDateForCheck(date);
}

/**
 * 指定日までの消化工数を自動計算
 * 既存の中断がある場合は、該当セグメント内の営業日から算出
 * @param {Object} schedule - スケジュールオブジェクト
 * @param {string} splitDate - 中断日（YYYY-MM-DD）
 * @returns {number} 消化工数（時間）
 */
export function calculateConsumedHoursAtDate(schedule, splitDate) {
    const hoursPerDay = scheduleSettings.hoursPerDay || 8;
    const interruptions = schedule.interruptions || [];

    if (interruptions.length === 0) {
        // 中断なし: startDate〜splitDateの営業日数 x hoursPerDay
        return countBusinessDays(schedule.startDate, splitDate, schedule.member) * hoursPerDay;
    }

    // 既存中断あり: セグメントを計算して、splitDateが属するセグメントまでの累計
    const segments = calculateSegments(schedule);
    let consumed = 0;

    for (const seg of segments) {
        if (splitDate < seg.startDate) break;
        if (splitDate <= seg.endDate) {
            // このセグメント内で中断
            consumed += countBusinessDays(seg.startDate, splitDate, schedule.member) * hoursPerDay;
            break;
        }
        consumed += seg.hours;
    }

    return Math.min(consumed, schedule.estimatedHours);
}

/**
 * スケジュールをセグメントに分割
 * @param {Object} schedule - スケジュールオブジェクト
 * @returns {Array<{startDate: string, endDate: string, hours: number, index: number}>}
 */
export function calculateSegments(schedule) {
    const interruptions = schedule.interruptions || [];

    if (interruptions.length === 0) {
        return [{
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            hours: schedule.estimatedHours,
            index: 0
        }];
    }

    // consumedHoursの昇順でソート
    const sorted = [...interruptions].sort((a, b) => a.consumedHours - b.consumedHours);
    const segments = [];
    let segStartDate = schedule.startDate;
    let prevConsumed = 0;

    sorted.forEach((int, i) => {
        const segHours = int.consumedHours - prevConsumed;
        if (segHours <= 0) return;

        const segEndDate = calculateEndDate(segStartDate, segHours, schedule.member);
        segments.push({
            startDate: segStartDate,
            endDate: segEndDate,
            hours: segHours,
            index: i
        });

        // 次セグメントの開始日を決定
        if (int.insertedScheduleId) {
            const inserted = schedules.find(s => s.id === int.insertedScheduleId);
            if (inserted) {
                segStartDate = getNextBusinessDay(inserted.endDate, schedule.member);
            } else {
                segStartDate = getNextBusinessDay(segEndDate, schedule.member);
            }
        } else {
            segStartDate = getNextBusinessDay(segEndDate, schedule.member);
        }

        prevConsumed = int.consumedHours;
    });

    // 最終セグメント: 残り工数
    const remainingHours = schedule.estimatedHours - prevConsumed;
    if (remainingHours > 0) {
        const segEndDate = calculateEndDate(segStartDate, remainingHours, schedule.member);
        segments.push({
            startDate: segStartDate,
            endDate: segEndDate,
            hours: remainingHours,
            index: sorted.length
        });
    }

    return segments;
}

/**
 * 中断を考慮してendDateを再計算
 * @param {Object} schedule - スケジュールオブジェクト
 * @returns {string} 新しいendDate（YYYY-MM-DD）
 */
export function recalculateEndDateWithInterruptions(schedule) {
    const segments = calculateSegments(schedule);
    if (segments.length === 0) return schedule.startDate;
    return segments[segments.length - 1].endDate;
}
