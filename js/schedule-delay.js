// ============================================
// スケジュールの遅延（期限超過）情報（純粋関数）
// 設計: docs/superpowers/specs/2026-09-24-schedule-lanes-and-insert-drop-design.md §②
// ============================================

import { SCHEDULE } from './constants.js';
import { countBusinessDays } from './schedule.js';
import { addDaysToDateString } from './utils.js';

/**
 * 終了日を過ぎて未完了かどうかと、超過期間を返す
 * @param {Object} schedule - endDate / status / member を持つ予定
 * @param {string} todayStr - 今日（YYYY-MM-DD）
 * @returns {{delayed: false} | {delayed: true, overrunStart: string, overrunEnd: string, businessDays: number}}
 */
export function getDelayInfo(schedule, todayStr) {
    if (schedule.status === SCHEDULE.STATUS.COMPLETED) return { delayed: false };
    if (!(schedule.endDate < todayStr)) return { delayed: false };
    const overrunStart = addDaysToDateString(schedule.endDate, 1);
    return {
        delayed: true,
        overrunStart,
        overrunEnd: todayStr,
        businessDays: countBusinessDays(overrunStart, todayStr, schedule.member)
    };
}
