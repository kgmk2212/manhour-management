// ============================================
// [GANTT-CHART] スケジュール中断・差し込み管理
// ============================================

import {
    schedules, setSchedules, nextScheduleId, setNextScheduleId,
    scheduleSettings
} from './state.js';
import {
    isBusinessDay, calculateEndDate, countBusinessDays, formatDateForCheck
} from './schedule.js';
import { SCHEDULE, PROCESS } from './constants.js';

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
        return countBusinessDays(schedule.startDate, splitDate, schedule.member) * hoursPerDay;
    }

    const segments = calculateSegments(schedule);
    let consumed = 0;

    for (const seg of segments) {
        if (splitDate < seg.startDate) break;
        if (splitDate <= seg.endDate) {
            consumed += countBusinessDays(seg.startDate, splitDate, schedule.member) * hoursPerDay;
            break;
        }
        consumed += seg.hours;
    }

    return Math.min(consumed, schedule.estimatedHours);
}

/**
 * セグメント開始日を正規化する（ピン留めの解決を一箇所に集約）
 *
 * 規則（設計書 §7-1 のユーザー確定事項）:
 *   ① resumeDate 未設定 → 自動計算値（従来どおり連続計算・差し込み追従）
 *   ② resumeDate が前セグメント終了日以前 → 前セグメント終了日の翌営業日へクランプ
 *   ③ resumeDate が非営業日 → 直近の翌営業日へ寄せる
 * 自動計算値より前の resumeDate は（②に該当しない限り）尊重する。
 * これにより差し込み作業より前へ残作業を戻す操作が可能になる。
 *
 * @param {string} autoStartDate - resumeDate が無い場合に使う自動計算値（YYYY-MM-DD）
 * @param {string} prevSegEndDate - 直前セグメントの終了日（YYYY-MM-DD）
 * @param {string|null|undefined} resumeDate - ピン留めされた再開日
 * @param {string} member - 担当者名（営業日判定に使う）
 * @returns {string} 正規化されたセグメント開始日（YYYY-MM-DD）
 */
export function resolveSegmentStart(autoStartDate, prevSegEndDate, resumeDate, member) {
    if (!resumeDate) return autoStartDate;

    if (resumeDate <= prevSegEndDate) {
        console.warn(
            `resolveSegmentStart: resumeDate(${resumeDate}) は前セグメント終了日(${prevSegEndDate}) 以前のためクランプします`
        );
        return getNextBusinessDay(prevSegEndDate, member);
    }

    if (!isBusinessDay(new Date(resumeDate), member)) {
        return getNextBusinessDay(resumeDate, member);
    }

    return resumeDate;
}

/**
 * スケジュールをセグメントに分割
 *
 * セグメントの終了日は、中断が workedUntil（その中断の直前まで作業した最終日）を持てば
 * それを採用し（日付主導）、持たなければ消化工数から営業日換算する（工数主導・旧データ互換）。
 * workedUntil がセグメント開始日より前ならセグメント開始日へクランプする。
 *
 * @param {Object} schedule - スケジュールオブジェクト
 * @param {Array<Object>} [lookupSchedules] - 差し込みスケジュールの参照先（既定は state の schedules。
 *   プレビュー時に未作成の差し込みを混ぜて計算するために使う）
 * @returns {Array<{startDate: string, endDate: string, hours: number, index: number,
 *                  interruptionId: string|null, endInterruptionId: string|null, isPinned: boolean}>}
 *   interruptionId: そのセグメントの開始日を支配している中断の id（先頭は null）
 *   endInterruptionId: そのセグメントを終わらせている中断の id（末尾は null）
 *   isPinned: その中断が resumeDate を持つか（＝自動追従しない）
 */
export function calculateSegments(schedule, lookupSchedules = schedules) {
    const interruptions = schedule.interruptions || [];

    if (interruptions.length === 0) {
        return [{
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            hours: schedule.estimatedHours,
            index: 0,
            interruptionId: null,
            endInterruptionId: null,
            isPinned: false
        }];
    }

    const sorted = [...interruptions].sort((a, b) => a.consumedHours - b.consumedHours);
    const segments = [];
    let segStartDate = schedule.startDate;
    // 現在の segStartDate を支配している中断（先頭セグメントは null）
    let segStartInterruption = null;
    let prevConsumed = 0;

    sorted.forEach((int) => {
        const segHours = int.consumedHours - prevConsumed;
        if (segHours <= 0) {
            console.warn('calculateSegments: skipping interruption with non-positive segment hours', int);
            return;
        }

        const segEndDate = int.workedUntil
            ? (int.workedUntil < segStartDate ? segStartDate : int.workedUntil)
            : calculateEndDate(segStartDate, segHours, schedule.member);
        segments.push({
            startDate: segStartDate,
            endDate: segEndDate,
            hours: segHours,
            index: segments.length,
            interruptionId: segStartInterruption ? segStartInterruption.id : null,
            endInterruptionId: int.id,
            isPinned: !!(segStartInterruption && segStartInterruption.resumeDate)
        });

        let autoStartDate;
        if (int.insertedScheduleId) {
            const inserted = lookupSchedules.find(s => s.id === int.insertedScheduleId);
            autoStartDate = inserted
                ? getNextBusinessDay(inserted.endDate, schedule.member)
                : getNextBusinessDay(segEndDate, schedule.member);
        } else {
            autoStartDate = getNextBusinessDay(segEndDate, schedule.member);
        }

        segStartDate = resolveSegmentStart(autoStartDate, segEndDate, int.resumeDate, schedule.member);
        segStartInterruption = int;
        prevConsumed = int.consumedHours;
    });

    const remainingHours = schedule.estimatedHours - prevConsumed;
    if (remainingHours > 0) {
        const segEndDate = calculateEndDate(segStartDate, remainingHours, schedule.member);
        segments.push({
            startDate: segStartDate,
            endDate: segEndDate,
            hours: remainingHours,
            index: segments.length,
            interruptionId: segStartInterruption ? segStartInterruption.id : null,
            endInterruptionId: null,
            isPinned: !!(segStartInterruption && segStartInterruption.resumeDate)
        });
    }

    return segments;
}

/**
 * 中断を考慮して endDate を再計算
 * 既知の制約: interruptions が0件になった場合は schedule.endDate をそのまま返す
 * （calculateEndDate による再計算は行わない）。redesign オリジナルの挙動を踏襲。
 * @param {Object} schedule - スケジュールオブジェクト
 * @returns {string} 新しい endDate（YYYY-MM-DD）
 */
export function recalculateEndDateWithInterruptions(schedule) {
    const segments = calculateSegments(schedule);
    if (segments.length === 0) return schedule.startDate;
    return segments[segments.length - 1].endDate;
}

/**
 * 中断の追加・編集を仮適用したときのセグメントと終了日を計算する（state は変更しない）
 * @param {Object} schedule - 対象スケジュール
 * @param {Object} draft - 中断の入力値 { splitDate, workedUntil, consumedHours, reason }
 * @param {Object} [options]
 * @param {string|null} [options.editingId=null] - 既存の中断を編集する場合その id（差し込み・再開日は引き継ぐ）
 * @param {number} [options.insertHours=0] - 新規の差し込み作業の工数（0なら差し込みなし。編集時は無視）
 * @returns {{ schedule: Object, interruption: Object, segments: Array, newEndDate: string,
 *             insertPeriod: {startDate: string, endDate: string, hours: number}|null }}
 */
export function simulateInterruption(schedule, draft, { editingId = null, insertHours = 0 } = {}) {
    const existing = schedule.interruptions || [];
    const original = editingId ? existing.find(i => i.id === editingId) : null;
    const interruption = {
        insertedScheduleId: null,
        ...(original || {}),
        id: original ? original.id : '__draft__',
        splitDate: draft.splitDate,
        consumedHours: draft.consumedHours,
        reason: draft.reason ?? (original ? original.reason : '')
    };
    if (draft.workedUntil) interruption.workedUntil = draft.workedUntil;
    else delete interruption.workedUntil;

    const temp = {
        ...schedule,
        interruptions: [...existing.filter(i => i.id !== interruption.id), interruption]
    };

    let insertPeriod = null;
    let lookup = schedules;
    if (!original && insertHours > 0) {
        const closed = calculateSegments(temp).find(seg => seg.endInterruptionId === interruption.id);
        const closedEnd = closed ? closed.endDate : schedule.startDate;
        const insertStart = getNextBusinessDay(closedEnd, schedule.member);
        const insertEnd = calculateEndDate(insertStart, insertHours, schedule.member);
        insertPeriod = { startDate: insertStart, endDate: insertEnd, hours: insertHours };
        interruption.insertedScheduleId = '__draft_insert__';
        lookup = [...schedules, { id: '__draft_insert__', startDate: insertStart, endDate: insertEnd }];
    }

    const segments = calculateSegments(temp, lookup);
    let newEndDate = segments.length > 0 ? segments[segments.length - 1].endDate : schedule.startDate;
    // 残り工数が無い（後半セグメントなし）場合、差し込み作業の終了までを元作業の期間とみなす
    const lastSeg = segments[segments.length - 1];
    if (insertPeriod && lastSeg && lastSeg.endInterruptionId === interruption.id && insertPeriod.endDate > newEndDate) {
        newEndDate = insertPeriod.endDate;
    }

    return { schedule: temp, interruption, segments, newEndDate, insertPeriod };
}

/**
 * スケジュールに中断を追加
 * @param {string} scheduleId - 対象スケジュールID
 * @param {Object} params - 中断パラメータ
 * @param {string} params.splitDate - 中断日（YYYY-MM-DD）
 * @param {string} [params.workedUntil] - 中断前のセグメントの最終作業日（YYYY-MM-DD）。
 *   指定するとセグメント終了日を日付で決める。省略時は consumedHours から営業日換算（旧挙動）
 * @param {number} params.consumedHours - 中断時点の消化工数
 * @param {string} params.reason - 中断理由
 * @param {Object} [params.insertOptions] - 差し込み作業（任意）
 * @param {string} params.insertOptions.version - 版数
 * @param {string} params.insertOptions.task - 対応名
 * @param {string} params.insertOptions.process - 工程
 * @param {number} params.insertOptions.hours - 工数
 * @param {string} [params.insertOptions.member] - 担当者（省略時は元スケジュールの担当者）
 * @param {boolean} [params.shiftDependents=false] - 後続スケジュールを連鎖でずらすか。
 *   既定はずらさない（中断した残作業をいつやるか決める前に後続を動かすと、意図して重ねた配置まで崩れるため）
 * @returns {{ schedule: Object, insertedSchedule: Object|null, cascadeResults: Array }|null}
 */
export function addInterruption(scheduleId, params) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const oldEndDate = schedule.endDate;

    const interruption = {
        id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        splitDate: params.splitDate,
        consumedHours: params.consumedHours,
        reason: params.reason || '',
        insertedScheduleId: null
    };
    if (params.workedUntil) interruption.workedUntil = params.workedUntil;

    let insertedSchedule = null;
    if (params.insertOptions) {
        const opts = params.insertOptions;
        const closed = calculateSegments({
            ...schedule,
            interruptions: [...(schedule.interruptions || []), interruption]
        }).find(seg => seg.endInterruptionId === interruption.id);
        const segEndDate = closed ? closed.endDate : schedule.startDate;
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

    const interruptions = [...(schedule.interruptions || []), interruption];
    const updatedSchedule = {
        ...schedule,
        interruptions,
        updatedAt: new Date().toISOString()
    };

    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    const newSchedules = schedules.map(s => s.id === scheduleId ? updatedSchedule : s);
    setSchedules(newSchedules);

    const cascadeResults = params.shiftDependents ? cascadeShift(updatedSchedule, oldEndDate) : [];

    if (typeof window.saveData === 'function') window.saveData();

    return { schedule: updatedSchedule, insertedSchedule, cascadeResults };
}

/**
 * 既存の中断を編集する（差し込みスケジュール・再開日のピン留めは引き継ぐ）
 * @param {string} scheduleId - 対象スケジュールID
 * @param {string} interruptionId - 編集する中断ID
 * @param {Object} params - { splitDate, workedUntil, consumedHours, reason, shiftDependents }
 * @returns {{ schedule: Object, cascadeResults: Array }|null}
 */
export function updateInterruption(scheduleId, interruptionId, params) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;
    if (!(schedule.interruptions || []).some(i => i.id === interruptionId)) return null;

    const oldEndDate = schedule.endDate;
    const { schedule: simulated } = simulateInterruption(schedule, params, { editingId: interruptionId });
    const updatedSchedule = {
        ...schedule,
        interruptions: simulated.interruptions,
        updatedAt: new Date().toISOString()
    };
    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    setSchedules(schedules.map(s => s.id === scheduleId ? updatedSchedule : s));

    const cascadeResults = params.shiftDependents ? cascadeShift(updatedSchedule, oldEndDate) : [];

    if (typeof window.saveData === 'function') window.saveData();

    return { schedule: updatedSchedule, cascadeResults };
}

/**
 * スケジュールから中断を取り消し
 * @param {string} scheduleId - 対象スケジュールID
 * @param {string} interruptionId - 中断ID
 * @param {boolean} [deleteInserted=false] - 差し込みスケジュールも削除するか
 * @returns {{ schedule: Object, cascadeResults: Array }|null}
 */
export function removeInterruption(scheduleId, interruptionId, deleteInserted = false) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const oldEndDate = schedule.endDate;
    const interruption = (schedule.interruptions || []).find(i => i.id === interruptionId);
    if (!interruption) return null;

    const interruptions = (schedule.interruptions || []).filter(i => i.id !== interruptionId);
    const updatedSchedule = {
        ...schedule,
        interruptions,
        updatedAt: new Date().toISOString()
    };

    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    let newSchedules = schedules.map(s => s.id === scheduleId ? updatedSchedule : s);

    if (deleteInserted && interruption.insertedScheduleId) {
        newSchedules = newSchedules.filter(s => s.id !== interruption.insertedScheduleId);
    }

    setSchedules(newSchedules);

    const cascadeResults = cascadeShift(updatedSchedule, oldEndDate);

    if (typeof window.saveData === 'function') window.saveData();

    return { schedule: updatedSchedule, cascadeResults };
}

/**
 * 連鎖ずらしを実行
 * 注意: このBFSはモジュールレベルの `schedules` 配列を読み書きしながら進行する。
 * 各反復で `setSchedules` により状態を更新し、次の対象探索は更新後の状態を参照する
 * （`processed` Setで二重処理を防止、`srcOldEnd` で対象抽出のカットオフ日を固定）。
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
 * scheduleがsrc（基準スケジュール）に依存しているか判定
 * 「同版数・同対応名で工程順が後」または「同担当者でstartDateがカットオフ日以降」を依存とみなす
 * @param {Object} schedule - 判定対象
 * @param {Object} src - 基準スケジュール（version/task/process/member）
 * @param {string} cutoffDate - この日付以降startDateなら対象
 * @returns {boolean}
 */
function isDependentSchedule(schedule, src, cutoffDate) {
    const order = PROCESS.TYPES;
    if (schedule.version === src.version && schedule.task === src.task) {
        const srcIdx = order.indexOf(src.process);
        const targetIdx = order.indexOf(schedule.process);
        if (targetIdx > srcIdx && schedule.startDate >= cutoffDate) return true;
    }
    if (schedule.member === src.member && schedule.startDate >= cutoffDate) return true;
    return false;
}

/**
 * 依存する後続スケジュールを検索
 */
function findDependentSchedules(src, srcOldEndDate) {
    const targets = [];

    schedules.forEach(s => {
        if (s.id === src.id) return;
        if (isDependentSchedule(s, src, srcOldEndDate)) {
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
 * @param {number} [insertHours=0] - 差し込み工数（0なら差し込みなし）
 * @param {Object} [options]
 * @param {string} [options.workedUntil] - 中断前セグメントの最終作業日（日付主導でセグメントを切る）
 * @param {string|null} [options.editingId] - 既存の中断を編集する場合その id
 * @returns {Object|null} { segments, impacts, insertPeriod }
 * @remarks consumedHours が estimatedHours 以上（見積超過含む）の場合、
 *   残り工数が無いため「後半」セグメントは省略される。
 */
export function analyzeImpact(scheduleId, splitDate, consumedHours, insertHours = 0, options = {}) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const sim = simulateInterruption(
        schedule,
        { splitDate, consumedHours, workedUntil: options.workedUntil },
        { editingId: options.editingId || null, insertHours }
    );
    const insertPeriod = sim.insertPeriod;
    const newEndDate = sim.newEndDate;
    const segments = sim.segments.map((seg, idx, arr) => ({
        startDate: seg.startDate,
        endDate: seg.endDate,
        hours: seg.hours,
        label: arr.length === 1 ? '前半'
            : arr.length === 2 ? (idx === 0 ? '前半' : '後半')
                : `第${idx + 1}区間`
    }));

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
                if (!isDependentSchedule(s, src, src.oldEndDate)) return;
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

/**
 * セグメントの再開日をピン留め／解除する
 *
 * `cascadeShift` は呼ばない（設計書 §7-5: セグメント移動で後続を自動でずらさない）。
 * 後続への影響件数が必要な場合は呼び出し側で `countDependentSchedules` を使う。
 *
 * @param {string} scheduleId - 対象スケジュールID
 * @param {string} interruptionId - 対象中断ID（＝セグメント境界の識別子）
 * @param {string|null} resumeDate - 固定したい再開日（YYYY-MM-DD）。null でピン解除
 * @returns {{schedule: Object, oldInterruptions: Array, newInterruptions: Array,
 *            oldEndDate: string, newEndDate: string}|null}
 */
export function setSegmentResumeDate(scheduleId, interruptionId, resumeDate) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const interruptions = schedule.interruptions || [];
    if (!interruptions.some(i => i.id === interruptionId)) return null;

    const oldInterruptions = interruptions.map(i => ({ ...i }));
    const oldEndDate = schedule.endDate;

    const newInterruptions = interruptions.map(i => {
        if (i.id !== interruptionId) return { ...i };
        const next = { ...i };
        if (resumeDate) {
            next.resumeDate = resumeDate;
        } else {
            delete next.resumeDate;
        }
        return next;
    });

    const updatedSchedule = {
        ...schedule,
        interruptions: newInterruptions,
        updatedAt: new Date().toISOString()
    };
    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    setSchedules(schedules.map(s => s.id === scheduleId ? updatedSchedule : s));

    if (typeof window.saveData === 'function') window.saveData();

    return {
        schedule: updatedSchedule,
        oldInterruptions,
        newInterruptions: newInterruptions.map(i => ({ ...i })),
        oldEndDate,
        newEndDate: updatedSchedule.endDate
    };
}

/**
 * endDate 変更によって影響を受ける後続スケジュールの件数を数える（state は変更しない）
 * @param {Object} changedSchedule - endDate が変更されたスケジュール（変更後の値を持つ）
 * @param {string} oldEndDate - 変更前の endDate
 * @returns {number}
 */
export function countDependentSchedules(changedSchedule, oldEndDate) {
    if (changedSchedule.endDate === oldEndDate) return 0;
    return findDependentSchedules(changedSchedule, oldEndDate).length;
}
