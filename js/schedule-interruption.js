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
    let guard = 0;
    while (!isBusinessDay(date, member)) {
        date.setDate(date.getDate() + 1);
        if (++guard > 365) return formatDateForCheck(date);
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
        if (segHours <= 0) {
            console.warn('calculateSegments: skipping interruption with non-positive segment hours', int);
            return;
        }

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

/**
 * スケジュールに中断を追加
 * @param {string} scheduleId - 対象スケジュールID
 * @param {Object} params - 中断パラメータ
 * @param {string} params.splitDate - 中断日（YYYY-MM-DD）
 * @param {number} params.consumedHours - 中断時点の消化工数
 * @param {string} params.reason - 中断理由
 * @param {Object} [params.insertOptions] - 差し込み作業（任意）
 * @param {string} params.insertOptions.version - 版数
 * @param {string} params.insertOptions.task - 対応名
 * @param {string} params.insertOptions.process - 工程
 * @param {number} params.insertOptions.hours - 工数
 * @param {string} params.insertOptions.member - 担当者（省略時は元スケジュールの担当者）
 * @returns {{ schedule: Object, insertedSchedule: Object|null, cascadeResults: Array }}
 */
export function addInterruption(scheduleId, params) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const oldEndDate = schedule.endDate;

    // 中断レコード作成
    const interruption = {
        id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        splitDate: params.splitDate,
        consumedHours: params.consumedHours,
        reason: params.reason || '',
        insertedScheduleId: null
    };

    // 差し込みスケジュール作成（オプション）
    let insertedSchedule = null;
    if (params.insertOptions) {
        const opts = params.insertOptions;
        const segEndDate = calculateEndDate(schedule.startDate, params.consumedHours, schedule.member);
        const insertMember = opts.member || schedule.member;
        const insertStartDate = getNextBusinessDay(segEndDate, insertMember);
        const insertEndDate = calculateEndDate(insertStartDate, opts.hours, insertMember);

        const insertId = `sch_${nextScheduleId}`;
        setNextScheduleId(nextScheduleId + 1);

        insertedSchedule = {
            id: insertId,
            version: opts.version,
            task: opts.task,
            process: opts.process,
            member: insertMember,
            startDate: insertStartDate,
            estimatedHours: opts.hours,
            endDate: insertEndDate,
            status: SCHEDULE.STATUS.PENDING,
            color: '',
            note: `${schedule.version}/${schedule.task}/${schedule.process} の差し込み作業`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        interruption.insertedScheduleId = insertId;
        setSchedules([...schedules, insertedSchedule]);
    }

    // 中断をスケジュールに追加
    const interruptions = [...(schedule.interruptions || []), interruption];
    const updatedSchedule = {
        ...schedule,
        interruptions,
        updatedAt: new Date().toISOString()
    };

    // endDate再計算
    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    // スケジュール配列を更新
    const newSchedules = schedules.map(s => s.id === scheduleId ? updatedSchedule : s);
    setSchedules(newSchedules);

    // 連鎖ずらし
    const cascadeResults = cascadeShift(updatedSchedule, oldEndDate);

    // 保存
    if (typeof window.saveData === 'function') window.saveData();

    return { schedule: updatedSchedule, insertedSchedule, cascadeResults };
}

/**
 * スケジュールから中断を取り消し
 * @param {string} scheduleId - 対象スケジュールID
 * @param {string} interruptionId - 中断ID
 * @param {boolean} deleteInserted - 差し込みスケジュールも削除するか
 * @returns {{ schedule: Object, cascadeResults: Array }}
 */
export function removeInterruption(scheduleId, interruptionId, deleteInserted = false) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const oldEndDate = schedule.endDate;
    const interruption = (schedule.interruptions || []).find(i => i.id === interruptionId);
    if (!interruption) return null;

    // 中断を削除
    const interruptions = (schedule.interruptions || []).filter(i => i.id !== interruptionId);
    const updatedSchedule = {
        ...schedule,
        interruptions,
        updatedAt: new Date().toISOString()
    };

    // endDate再計算
    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    // スケジュール配列を更新
    let newSchedules = schedules.map(s => s.id === scheduleId ? updatedSchedule : s);

    // 差し込みスケジュールの削除（オプション）
    if (deleteInserted && interruption.insertedScheduleId) {
        newSchedules = newSchedules.filter(s => s.id !== interruption.insertedScheduleId);
    }

    setSchedules(newSchedules);

    // 逆方向の連鎖ずらし（endDateが早まった場合）
    const cascadeResults = cascadeShift(updatedSchedule, oldEndDate);

    // 保存
    if (typeof window.saveData === 'function') window.saveData();

    return { schedule: updatedSchedule, cascadeResults };
}
