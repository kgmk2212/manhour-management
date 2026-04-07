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

const PROCESS_ORDER = ['UI', 'PG', 'PT', 'IT', 'ST'];

/**
 * 連鎖ずらしを実行
 * @param {Object} changedSchedule - endDateが変更されたスケジュール
 * @param {string} oldEndDate - 変更前のendDate
 * @returns {Array<{id, version, task, process, member, oldStart, newStart, oldEnd, newEnd}>}
 */
export function cascadeShift(changedSchedule, oldEndDate) {
    if (changedSchedule.endDate === oldEndDate) return [];

    const results = [];
    const processed = new Set();
    processed.add(changedSchedule.id);

    const queue = [{ schedule: changedSchedule, oldEndDate }];

    while (queue.length > 0) {
        const { schedule: src, oldEndDate: srcOldEnd } = queue.shift();

        const oldEnd = new Date(srcOldEnd);
        const newEnd = new Date(src.endDate);
        const diffDays = Math.round((newEnd - oldEnd) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) continue;

        const targets = findDependentSchedules(src, srcOldEnd);

        targets.forEach(target => {
            if (processed.has(target.id)) return;
            processed.add(target.id);

            const targetOldStart = target.startDate;
            const targetOldEnd = target.endDate;

            const date = new Date(target.startDate);
            if (diffDays > 0) {
                let shifted = 0;
                while (shifted < diffDays) { date.setDate(date.getDate() + 1); shifted++; }
            } else {
                let shifted = 0;
                while (shifted < Math.abs(diffDays)) { date.setDate(date.getDate() - 1); shifted++; }
            }
            while (!isBusinessDay(date, target.member)) {
                date.setDate(date.getDate() + 1);
            }
            const newStartDate = formatDateForCheck(date);
            const newEndDate = calculateEndDate(newStartDate, target.estimatedHours, target.member);

            const updated = {
                ...target,
                startDate: newStartDate,
                endDate: newEndDate,
                updatedAt: new Date().toISOString()
            };

            if (updated.interruptions && updated.interruptions.length > 0) {
                updated.endDate = recalculateEndDateWithInterruptions(updated);
            }

            const newSchedules = schedules.map(s => s.id === target.id ? updated : s);
            setSchedules(newSchedules);

            results.push({
                id: target.id,
                version: target.version,
                task: target.task,
                process: target.process,
                member: target.member,
                oldStart: targetOldStart,
                newStart: newStartDate,
                oldEnd: targetOldEnd,
                newEnd: updated.endDate
            });

            queue.push({ schedule: updated, oldEndDate: targetOldEnd });
        });
    }

    return results;
}

/**
 * 依存する後続スケジュールを検索
 */
function findDependentSchedules(src, srcOldEndDate) {
    const targets = [];

    schedules.forEach(s => {
        if (s.id === src.id) return;

        // a) 同じ version + task の後続工程
        if (s.version === src.version && s.task === src.task) {
            const srcIdx = PROCESS_ORDER.indexOf(src.process);
            const targetIdx = PROCESS_ORDER.indexOf(s.process);
            if (targetIdx > srcIdx && s.startDate >= srcOldEndDate) {
                targets.push(s);
                return;
            }
        }

        // b) 同じ担当者の後続スケジュール
        if (s.member === src.member && s.startDate >= srcOldEndDate) {
            targets.push(s);
        }
    });

    return targets;
}

/**
 * 影響分析（実際には変更しない）
 * @param {string} scheduleId - 対象スケジュールID
 * @param {string} splitDate - 中断日
 * @param {number} consumedHours - 消化工数
 * @param {number} [insertHours] - 差し込み工数（0なら差し込みなし）
 * @returns {Object} { segments, impacts, insertPeriod }
 */
export function analyzeImpact(scheduleId, splitDate, consumedHours, insertHours = 0) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const member = schedule.member;
    const remainingHours = schedule.estimatedHours - consumedHours;

    // 前半セグメント
    const firstSegEnd = calculateEndDate(schedule.startDate, consumedHours, member);

    // 差し込み期間
    let insertPeriod = null;
    let lastSegStart;
    if (insertHours > 0) {
        const insertStart = getNextBusinessDay(firstSegEnd, member);
        const insertEnd = calculateEndDate(insertStart, insertHours, member);
        insertPeriod = { startDate: insertStart, endDate: insertEnd, hours: insertHours };
        lastSegStart = getNextBusinessDay(insertEnd, member);
    } else {
        lastSegStart = getNextBusinessDay(firstSegEnd, member);
    }

    // 後半セグメント
    const lastSegEnd = calculateEndDate(lastSegStart, remainingHours, member);

    const segments = [
        { startDate: schedule.startDate, endDate: firstSegEnd, hours: consumedHours, label: '前半' },
        { startDate: lastSegStart, endDate: lastSegEnd, hours: remainingHours, label: '後半' }
    ];

    // 新しいendDateから影響を計算
    const newEndDate = lastSegEnd;
    const oldEndDate = schedule.endDate;
    const impacts = [];

    if (newEndDate !== oldEndDate) {
        const processed = new Set();
        processed.add(schedule.id);

        const queue = [{
            id: schedule.id, version: schedule.version, task: schedule.task,
            process: schedule.process, member: schedule.member,
            endDate: newEndDate, oldEndDate
        }];

        while (queue.length > 0) {
            const src = queue.shift();
            const diffDays = Math.round(
                (new Date(src.endDate) - new Date(src.oldEndDate)) / (1000 * 60 * 60 * 24)
            );
            if (diffDays === 0) continue;

            schedules.forEach(s => {
                if (processed.has(s.id)) return;

                let isDependent = false;
                if (s.version === src.version && s.task === src.task) {
                    const srcIdx = PROCESS_ORDER.indexOf(src.process);
                    const targetIdx = PROCESS_ORDER.indexOf(s.process);
                    if (targetIdx > srcIdx && s.startDate >= src.oldEndDate) isDependent = true;
                }
                if (s.member === src.member && s.startDate >= src.oldEndDate) isDependent = true;

                if (!isDependent) return;
                processed.add(s.id);

                const date = new Date(s.startDate);
                if (diffDays > 0) {
                    let shifted = 0;
                    while (shifted < diffDays) { date.setDate(date.getDate() + 1); shifted++; }
                } else {
                    let shifted = 0;
                    while (shifted < Math.abs(diffDays)) { date.setDate(date.getDate() - 1); shifted++; }
                }
                while (!isBusinessDay(date, s.member)) { date.setDate(date.getDate() + 1); }

                const newTargetStart = formatDateForCheck(date);
                const newTargetEnd = calculateEndDate(newTargetStart, s.estimatedHours, s.member);

                impacts.push({
                    id: s.id, version: s.version, task: s.task,
                    process: s.process, member: s.member,
                    oldStart: s.startDate, newStart: newTargetStart,
                    oldEnd: s.endDate, newEnd: newTargetEnd
                });

                queue.push({
                    id: s.id, version: s.version, task: s.task,
                    process: s.process, member: s.member,
                    endDate: newTargetEnd, oldEndDate: s.endDate
                });
            });
        }
    }

    return { segments, impacts, insertPeriod };
}
