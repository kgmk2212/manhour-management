// ============================================
// 回帰テスト: js/schedule-interruption.js
//   スケジュール中断・分割の純粋ロジック（calculateSegments 等）を検証する。
//   schedule-interruption.js は schedule.js 経由で history.js / schedule-render.js /
//   estimate.js / report.js / utils.js を推移的に import するが、いずれもモジュール
//   評価時に DOM を触らないため、history.test.js と同じ最小ポリフィルで足りる。
// ============================================
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => [],
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
globalThis.alert = () => {};

const State = await import('../js/state.js');
const SI = await import('../js/schedule-interruption.js');

function resetAll() {
    globalThis.localStorage._map.clear();
    State.setSchedules([]);
    State.setEstimates([]);
    State.setCompanyHolidays([]);
    State.setVacations([]);
    State.setScheduleSettings({ hoursPerDay: 8 });
    State.setNextScheduleId(100);
}

// 2026-09-14(月)始まり・週5日勤務・休日/休暇なしの固定フィクスチャ
const MEMBER = '田中';
function makeSchedule(overrides = {}) {
    return {
        id: 'sch_1',
        version: 'V1',
        task: 'T',
        process: 'PG',
        member: MEMBER,
        startDate: '2026-09-14',
        estimatedHours: 40,
        endDate: '2026-09-18',
        status: 'pending',
        interruptions: [],
        ...overrides,
    };
}

describe('resolveSegmentStart', () => {
    beforeEach(resetAll);

    test('resumeDate が未設定なら自動計算値をそのまま返す', () => {
        assert.equal(
            SI.resolveSegmentStart('2026-09-16', '2026-09-15', undefined, MEMBER),
            '2026-09-16'
        );
        assert.equal(
            SI.resolveSegmentStart('2026-09-16', '2026-09-15', null, MEMBER),
            '2026-09-16'
        );
    });

    test('resumeDate が前セグメント終了日より後の営業日ならそのまま採用される', () => {
        assert.equal(
            SI.resolveSegmentStart('2026-09-16', '2026-09-15', '2026-09-18', MEMBER),
            '2026-09-18'
        );
    });

    test('resumeDate が自動計算値より前でも、前セグメント終了日より後なら尊重される（差し込みより前に戻せる）', () => {
        // 差し込み作業の都合で自動値は 2026-09-21 だが、ユーザーは 2026-09-16 を指定
        assert.equal(
            SI.resolveSegmentStart('2026-09-21', '2026-09-15', '2026-09-16', MEMBER),
            '2026-09-16'
        );
    });

    test('resumeDate が前セグメント終了日と同日なら翌営業日へクランプされる', () => {
        assert.equal(
            SI.resolveSegmentStart('2026-09-16', '2026-09-15', '2026-09-15', MEMBER),
            '2026-09-16'
        );
    });

    test('resumeDate が前セグメント終了日より前なら翌営業日へクランプされる', () => {
        assert.equal(
            SI.resolveSegmentStart('2026-09-16', '2026-09-15', '2026-09-10', MEMBER),
            '2026-09-16'
        );
    });

    test('クランプ後の日付は前セグメント終了日が金曜なら翌月曜になる（土日をスキップ）', () => {
        assert.equal(
            SI.resolveSegmentStart('2026-09-21', '2026-09-18', '2026-09-01', MEMBER),
            '2026-09-21'
        );
    });

    test('resumeDate が非営業日（土曜）なら翌営業日（月曜）へ寄せられる', () => {
        assert.equal(
            SI.resolveSegmentStart('2026-09-16', '2026-09-15', '2026-09-19', MEMBER),
            '2026-09-21'
        );
    });
});

describe('calculateSegments', () => {
    beforeEach(resetAll);

    test('中断なしなら単一セグメントを返す', () => {
        const schedule = makeSchedule();
        const segments = SI.calculateSegments(schedule);
        assert.deepEqual(segments, [
            { startDate: '2026-09-14', endDate: '2026-09-18', hours: 40, index: 0,
              interruptionId: null, isPinned: false }
        ]);
    });

    test('中断1件（差し込みなし）で2セグメントに分割される', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '', insertedScheduleId: null }
            ]
        });
        const segments = SI.calculateSegments(schedule);
        assert.equal(segments.length, 2);
        assert.deepEqual(segments[0], { startDate: '2026-09-14', endDate: '2026-09-15', hours: 16, index: 0,
            interruptionId: null, isPinned: false });
        assert.equal(segments[1].startDate, '2026-09-16');
        assert.equal(segments[1].hours, 24);
    });

    test('中断2件で3セグメントに分割される', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '', insertedScheduleId: null },
                { id: 'int_2', splitDate: '2026-09-17', consumedHours: 32, reason: '', insertedScheduleId: null }
            ]
        });
        const segments = SI.calculateSegments(schedule);
        assert.equal(segments.length, 3);
        assert.equal(segments[0].hours, 16);
        assert.equal(segments[1].hours, 16);
        assert.equal(segments[2].index, 2); // 修正1が正しく効いていることの確認
    });

    test('セグメントに interruptionId と isPinned が付与される', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '', insertedScheduleId: null }
            ]
        });
        const segments = SI.calculateSegments(schedule);
        assert.equal(segments[0].interruptionId, null, '先頭セグメントは常に null');
        assert.equal(segments[0].isPinned, false);
        assert.equal(segments[1].interruptionId, 'int_1', '残作業セグメントは直前の中断に支配される');
        assert.equal(segments[1].isPinned, false);
    });

    test('resumeDate を設定するとそのセグメントがその日から始まり isPinned になる', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '',
                  insertedScheduleId: null, resumeDate: '2026-09-21' }
            ]
        });
        const segments = SI.calculateSegments(schedule);
        assert.equal(segments[1].startDate, '2026-09-21');
        assert.equal(segments[1].isPinned, true);
        // 24h（3営業日）: 09-21, 09-22, 09-23
        assert.equal(segments[1].endDate, '2026-09-23');
    });

    test('前セグメント終了日以前の resumeDate は翌営業日へクランプされる', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '',
                  insertedScheduleId: null, resumeDate: '2026-09-14' }
            ]
        });
        const segments = SI.calculateSegments(schedule);
        // seg0 は 09-14〜09-15。クランプ先は 09-16
        assert.equal(segments[1].startDate, '2026-09-16');
    });

    test('非営業日（土曜）の resumeDate は翌営業日（月曜）へ寄る', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '',
                  insertedScheduleId: null, resumeDate: '2026-09-19' }
            ]
        });
        const segments = SI.calculateSegments(schedule);
        assert.equal(segments[1].startDate, '2026-09-21');
    });

    test('ピンなしのセグメントは差し込み作業の endDate に追従し続ける', () => {
        const inserted = {
            id: 'sch_ins', version: 'V2', task: '差込', process: 'PG', member: MEMBER,
            startDate: '2026-09-16', estimatedHours: 16, endDate: '2026-09-17',
            status: 'pending', interruptions: []
        };
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '',
                  insertedScheduleId: 'sch_ins' }
            ]
        });
        State.setSchedules([schedule, inserted]);

        assert.equal(SI.calculateSegments(schedule)[1].startDate, '2026-09-18');

        // 差し込み作業を後ろにずらすと残作業も追従する
        State.setSchedules([schedule, { ...inserted, startDate: '2026-09-21', endDate: '2026-09-22' }]);
        assert.equal(SI.calculateSegments(schedule)[1].startDate, '2026-09-23');
    });

    test('ピン留め済みセグメントは差し込み作業の移動に追従しない（絶対位置を維持）', () => {
        const inserted = {
            id: 'sch_ins', version: 'V2', task: '差込', process: 'PG', member: MEMBER,
            startDate: '2026-09-16', estimatedHours: 16, endDate: '2026-09-17',
            status: 'pending', interruptions: []
        };
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '',
                  insertedScheduleId: 'sch_ins', resumeDate: '2026-09-18' }
            ]
        });
        State.setSchedules([schedule, inserted]);
        assert.equal(SI.calculateSegments(schedule)[1].startDate, '2026-09-18');

        State.setSchedules([schedule, { ...inserted, startDate: '2026-09-21', endDate: '2026-09-22' }]);
        assert.equal(SI.calculateSegments(schedule)[1].startDate, '2026-09-18', 'ピンは動かない');
    });

    test('先頭セグメントを移動してもピン留め済みの後続セグメントは動かない', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '',
                  insertedScheduleId: null, resumeDate: '2026-09-23' }
            ]
        });
        const moved = { ...schedule, startDate: '2026-09-16' };
        const segments = SI.calculateSegments(moved);
        assert.equal(segments[0].startDate, '2026-09-16');
        assert.equal(segments[1].startDate, '2026-09-23', 'ピンは絶対位置を維持する');
    });

    test('中断2件・片方だけピン留めされている場合、各セグメントのinterruptionId/isPinnedが正しく引き継がれる', () => {
        const schedule = makeSchedule({
            interruptions: [
                { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '',
                  insertedScheduleId: null, resumeDate: '2026-09-21' }, // ピン留めあり
                { id: 'int_2', splitDate: '2026-09-22', consumedHours: 32, reason: '',
                  insertedScheduleId: null } // ピン留めなし
            ]
        });
        const segments = SI.calculateSegments(schedule);

        // セグメント0（先頭・09-14〜09-15、16h）: 中断なしの区間
        assert.equal(segments[0].interruptionId, null);
        assert.equal(segments[0].isPinned, false);

        // セグメント1（int_1に支配される・resumeDate=09-21から開始）: ピン留めあり
        assert.equal(segments[1].startDate, '2026-09-21');
        assert.equal(segments[1].interruptionId, 'int_1');
        assert.equal(segments[1].isPinned, true);

        // セグメント2（int_2に支配される・自動計算）: ピン留めなし
        assert.equal(segments[2].interruptionId, 'int_2');
        assert.equal(segments[2].isPinned, false);
    });
});

describe('getNextBusinessDay', () => {
    beforeEach(resetAll);

    test('金曜日の翌営業日は月曜日（土日をスキップ）', () => {
        assert.equal(SI.getNextBusinessDay('2026-09-18', MEMBER), '2026-09-21');
    });
});

describe('calculateConsumedHoursAtDate', () => {
    beforeEach(resetAll);

    test('中断なしなら開始日からの営業日数×1日工数', () => {
        const schedule = makeSchedule();
        // 2026-09-14(月)〜2026-09-16(水) = 3営業日 × 8h = 24h
        assert.equal(SI.calculateConsumedHoursAtDate(schedule, '2026-09-16'), 24);
    });
});

describe('recalculateEndDateWithInterruptions', () => {
    beforeEach(resetAll);

    test('中断なしなら endDate は変化しない', () => {
        const schedule = makeSchedule();
        assert.equal(SI.recalculateEndDateWithInterruptions(schedule), '2026-09-18');
    });
});

describe('addInterruption / removeInterruption / cascadeShift', () => {
    beforeEach(resetAll);

    test('差し込みありで中断を追加すると endDate が伸び、後続の同担当者スケジュールが連鎖ずれする', () => {
        const target = makeSchedule();
        // 同担当者・startDate=旧endDate の後続スケジュール（8h・1日）
        const follower = {
            id: 'sch_2', version: 'V1', task: 'T2', process: 'PG', member: MEMBER,
            startDate: '2026-09-18', estimatedHours: 8, endDate: '2026-09-18',
            status: 'pending', interruptions: []
        };
        State.setSchedules([target, follower]);

        const result = SI.addInterruption('sch_1', {
            splitDate: '2026-09-15',
            consumedHours: 16,
            reason: '緊急対応',
            insertOptions: { version: 'V2', task: '差込', process: 'PG', hours: 8 }
        });

        assert.ok(result);
        assert.equal(result.schedule.interruptions.length, 1);
        assert.equal(result.insertedSchedule.startDate, '2026-09-16');
        assert.equal(result.insertedSchedule.endDate, '2026-09-16');
        // 中断+差し込みで見積工数消化完了が3日後ろ倒しになり endDate が伸びる
        assert.equal(result.schedule.endDate, '2026-09-21');

        // 連鎖ずれ: follower は3日分（カレンダー日）後ろ倒しの上で直近営業日にスナップ
        assert.equal(result.cascadeResults.length, 1);
        assert.equal(result.cascadeResults[0].id, 'sch_2');
        assert.equal(result.cascadeResults[0].oldStart, '2026-09-18');
        assert.equal(result.cascadeResults[0].newStart, '2026-09-21');
        assert.equal(result.cascadeResults[0].newEnd, '2026-09-21');

        const updatedFollower = State.schedules.find(s => s.id === 'sch_2');
        assert.equal(updatedFollower.startDate, '2026-09-21');
    });

    test('removeInterruption で中断を取り消すと interruptions が空になる（endDateは再計算されず維持される既知の制約）', () => {
        const target = makeSchedule();
        State.setSchedules([target]);

        const added = SI.addInterruption('sch_1', {
            splitDate: '2026-09-15',
            consumedHours: 16,
            reason: '',
            insertOptions: { version: 'V2', task: '差込', process: 'PG', hours: 8 }
        });
        const interruptionId = added.schedule.interruptions[0].id;

        const removed = SI.removeInterruption('sch_1', interruptionId, false);

        assert.equal(removed.schedule.interruptions.length, 0);
        // 既知の制約（Task A2 コメント参照）: endDate は addInterruption 後の値のまま
        assert.equal(removed.schedule.endDate, '2026-09-21');
        // 差し込みスケジュールは deleteInserted=false のため残る
        assert.ok(State.schedules.find(s => s.id === added.insertedSchedule.id));
    });

    test('removeInterruption(deleteInserted=true) で差し込みスケジュールも削除される', () => {
        const target = makeSchedule();
        State.setSchedules([target]);

        const added = SI.addInterruption('sch_1', {
            splitDate: '2026-09-15',
            consumedHours: 16,
            reason: '',
            insertOptions: { version: 'V2', task: '差込', process: 'PG', hours: 8 }
        });
        const interruptionId = added.schedule.interruptions[0].id;
        const insertedId = added.insertedSchedule.id;

        SI.removeInterruption('sch_1', interruptionId, true);

        assert.equal(State.schedules.find(s => s.id === insertedId), undefined);
    });

    test('3段階の連鎖（sch_1→sch_2→sch_3）が正しく後ろ倒しされる', () => {
        const target = makeSchedule(); // sch_1: 2026-09-14〜09-18, 40h
        const follower1 = {
            id: 'sch_2', version: 'V1', task: 'T2', process: 'PG', member: MEMBER,
            startDate: '2026-09-18', estimatedHours: 8, endDate: '2026-09-18',
            status: 'pending', interruptions: []
        };
        const follower2 = {
            id: 'sch_3', version: 'V1', task: 'T3', process: 'PG', member: MEMBER,
            startDate: '2026-09-18', estimatedHours: 8, endDate: '2026-09-18',
            status: 'pending', interruptions: []
        };
        State.setSchedules([target, follower1, follower2]);

        const result = SI.addInterruption('sch_1', {
            splitDate: '2026-09-15',
            consumedHours: 16,
            reason: '',
            insertOptions: { version: 'V2', task: '差込', process: 'PG', hours: 8 }
        });

        // follower1・follower2 とも同担当者・startDate>=旧endDateのため連鎖対象になるはず
        assert.equal(result.cascadeResults.length, 2);
        const updated2 = State.schedules.find(s => s.id === 'sch_2');
        const updated3 = State.schedules.find(s => s.id === 'sch_3');
        assert.ok(updated2.startDate > '2026-09-18');
        assert.ok(updated3.startDate > '2026-09-18');
        // processedのSetにより二重処理されず、それぞれ1回だけ結果に現れる
        const ids = result.cascadeResults.map(r => r.id).sort();
        assert.deepEqual(ids, ['sch_2', 'sch_3']);
    });

    test('真の直列連鎖（sch_1→sch_2→sch_3、sch_2の移動がsch_3に波及する）', () => {
        const sch1 = makeSchedule({ id: 'sch_1', task: 'TaskA', process: 'UI', member: 'Alice' });
        // sch_2は sch_1 と別task・同member（条件B経由でsch_1から直接連鎖）
        const sch2 = {
            id: 'sch_2', version: 'V1', task: 'TaskB', process: 'PG', member: 'Alice',
            startDate: '2026-09-18', estimatedHours: 8, endDate: '2026-09-18',
            status: 'pending', interruptions: []
        };
        // sch_3は sch_2 と同task・別member（sch_1からは直接見つからず、sch_2経由でのみ連鎖）
        const sch3 = {
            id: 'sch_3', version: 'V1', task: 'TaskB', process: 'PT', member: 'Bob',
            startDate: '2026-09-21', estimatedHours: 8, endDate: '2026-09-21',
            status: 'pending', interruptions: []
        };
        State.setSchedules([sch1, sch2, sch3]);

        const result = SI.addInterruption('sch_1', {
            splitDate: '2026-09-15',
            consumedHours: 16,
            reason: '',
            insertOptions: { version: 'V2', task: '差込', process: 'PG', hours: 8 }
        });

        // sch_2・sch_3 両方とも最終的に連鎖対象になっているはず
        const ids = result.cascadeResults.map(r => r.id).sort();
        assert.deepEqual(ids, ['sch_2', 'sch_3']);

        const updated2 = State.schedules.find(s => s.id === 'sch_2');
        const updated3 = State.schedules.find(s => s.id === 'sch_3');
        // sch_3 の新startDateは sch_2 の新endDate以降にスナップされているはず（sch_2の移動に波及した証拠）
        assert.ok(updated3.startDate > sch3.startDate, `sch_3が後ろ倒しされていること: ${updated3.startDate}`);
        assert.ok(updated2.startDate > sch2.startDate, `sch_2が後ろ倒しされていること: ${updated2.startDate}`);
    });
});

describe('analyzeImpact', () => {
    beforeEach(resetAll);

    test('state を変更せず前半/後半セグメントと影響対象を返す', () => {
        const target = makeSchedule();
        const follower = {
            id: 'sch_2', version: 'V1', task: 'T2', process: 'PG', member: MEMBER,
            startDate: '2026-09-18', estimatedHours: 8, endDate: '2026-09-18',
            status: 'pending', interruptions: []
        };
        State.setSchedules([target, follower]);
        const before = JSON.stringify(State.schedules);

        const result = SI.analyzeImpact('sch_1', '2026-09-15', 16, 8);

        assert.equal(JSON.stringify(State.schedules), before, 'analyzeImpact は state を変更しない');
        assert.equal(result.segments[0].label, '前半');
        assert.equal(result.segments[1].label, '後半');
        assert.equal(result.insertPeriod.hours, 8);
        assert.equal(result.impacts.length, 1);
        assert.equal(result.impacts[0].id, 'sch_2');
    });

    test('consumedHours === estimatedHours（残り0）なら前半のみ1件で newEndDate は firstSegEnd と一致する', () => {
        const target = makeSchedule(); // estimatedHours=40, startDate=2026-09-14(月)
        State.setSchedules([target]);

        // 40h ちょうど消化: firstSegEnd = 2026-09-14起点の5営業日目 = 2026-09-18(金)
        const result = SI.analyzeImpact('sch_1', '2026-09-18', 40, 0);

        assert.equal(result.segments.length, 1);
        assert.equal(result.segments[0].label, '前半');
        assert.equal(result.segments[0].hours, 40);
        assert.equal(result.segments[0].endDate, '2026-09-18');
        assert.equal(result.insertPeriod, null);
        // newEndDate（= firstSegEnd）が旧endDate('2026-09-18')と一致するため impacts は空
        assert.equal(result.impacts.length, 0);
    });

    test('consumedHours > estimatedHours（見積超過）でも前半のみ1件で hours は実際の consumedHours になる', () => {
        const target = makeSchedule(); // estimatedHours=40
        State.setSchedules([target]);

        // 48h（見積超過分8h含む）消化: firstSegEnd = 2026-09-14起点の6営業日目 = 2026-09-21(月、土日スキップ)
        const result = SI.analyzeImpact('sch_1', '2026-09-21', 48, 0);

        assert.equal(result.segments.length, 1);
        assert.equal(result.segments[0].label, '前半');
        assert.equal(result.segments[0].hours, 48);
        assert.equal(result.segments[0].endDate, '2026-09-21');
        assert.equal(result.insertPeriod, null);
    });

    test('差し込みあり・残り0の場合、newEndDate は insertPeriod.endDate と一致する（影響分析にも反映される）', () => {
        const target = makeSchedule(); // estimatedHours=40
        const follower = {
            id: 'sch_2', version: 'V1', task: 'T2', process: 'PG', member: MEMBER,
            startDate: '2026-09-18', estimatedHours: 8, endDate: '2026-09-18',
            status: 'pending', interruptions: []
        };
        State.setSchedules([target, follower]);

        // 40h ちょうど消化 + 8h差し込み: 後半セグメントは無く、insertPeriod.endDateが新終了日になる
        const result = SI.analyzeImpact('sch_1', '2026-09-18', 40, 8);

        assert.equal(result.segments.length, 1);
        assert.equal(result.segments[0].label, '前半');
        assert.ok(result.insertPeriod, 'insertPeriod が設定されていること');
        // insertPeriod は firstSegEnd(2026-09-18=金)の翌営業日(2026-09-21=月)から1日(8h)
        assert.equal(result.insertPeriod.startDate, '2026-09-21');
        assert.equal(result.insertPeriod.endDate, '2026-09-21');
        // newEndDateが2026-09-21に伸びるため、follower(旧startDate=2026-09-18)は連鎖対象になる
        assert.equal(result.impacts.length, 1);
        assert.equal(result.impacts[0].id, 'sch_2');
        assert.equal(result.impacts[0].newStart, '2026-09-21');
    });
});
