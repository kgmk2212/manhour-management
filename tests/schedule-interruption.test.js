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

describe('calculateSegments', () => {
    beforeEach(resetAll);

    test('中断なしなら単一セグメントを返す', () => {
        const schedule = makeSchedule();
        const segments = SI.calculateSegments(schedule);
        assert.deepEqual(segments, [
            { startDate: '2026-09-14', endDate: '2026-09-18', hours: 40, index: 0 }
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
        assert.deepEqual(segments[0], { startDate: '2026-09-14', endDate: '2026-09-15', hours: 16, index: 0 });
        assert.equal(segments[1].startDate, '2026-09-16');
        assert.equal(segments[1].hours, 24);
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
