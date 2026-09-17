// ============================================
// 回帰テスト: js/schedule-render.js
//   buildDragPreviews（ドラッグ中プレビュー計算）を検証する。
//   schedule-render.js は Canvas 描画を含むが、buildDragPreviews 自体は
//   純粋な計算関数で、モジュール評価時にも DOM を触らない
//   （import 自体は素の node でも成功することを確認済み）ため、
//   schedule-interruption.test.js と同じ最小ポリフィルで足りる。
// ============================================
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
function createFakeElement() {
    return {
        className: '',
        innerHTML: '',
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        remove() {},
        setAttribute() {},
        getAttribute: () => null,
    };
}
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => [],
    createElement: () => createFakeElement(),
    body: createFakeElement(),
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
globalThis.alert = () => {};

const State = await import('../js/state.js');
const SR = await import('../js/schedule-render.js');

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

// 中断1件: splitDate 2026-09-15・consumedHours 16 → seg0: 09-14〜09-15（16h）
// seg1（残作業）は自動計算では 09-16 開始・24h
function makeInterruptedSchedule(overrides = {}) {
    return makeSchedule({
        interruptions: [
            { id: 'int_1', splitDate: '2026-09-15', consumedHours: 16, reason: '', insertedScheduleId: null }
        ],
        ...overrides,
    });
}

describe('buildDragPreviews', () => {
    beforeEach(resetAll);

    test('残作業セグメント（segmentIndex=1）を前セグメント終了日より前の日付へドラッグ → 前セグメント終了日の翌営業日にクランプされる', () => {
        const schedule = makeInterruptedSchedule();
        State.setSchedules([schedule]);

        // 前セグメント（seg0）終了日は 2026-09-15。それより前の 09-10 へドラッグ
        const previews = SR.buildDragPreviews(schedule, '2026-09-10', 1);

        assert.equal(previews[0].newStartDate, '2026-09-16', 'seg0終了日(09-15)の翌営業日(09-16)へクランプされる');
        assert.equal(previews[0].segmentIndex, 1);
    });

    test('残作業セグメントを非営業日（土曜）へドラッグ → 翌営業日（月曜）へスナップされる', () => {
        const schedule = makeInterruptedSchedule();
        State.setSchedules([schedule]);

        // 2026-09-19 は土曜日
        const previews = SR.buildDragPreviews(schedule, '2026-09-19', 1);

        assert.equal(previews[0].newStartDate, '2026-09-21', '土曜(09-19)の翌営業日である月曜(09-21)へ寄る');
    });

    test('残作業セグメントを妥当な営業日へドラッグ → クランプなしでそのまま使われる', () => {
        const schedule = makeInterruptedSchedule();
        State.setSchedules([schedule]);

        // 2026-09-21 は月曜（前セグメント終了日より後の平日）
        const previews = SR.buildDragPreviews(schedule, '2026-09-21', 1);

        assert.equal(previews[0].newStartDate, '2026-09-21');
    });

    test('先頭セグメント（segmentIndex=0）をドラッグ → 補正は適用されず渡した newStartDate がそのまま使われる', () => {
        const schedule = makeInterruptedSchedule();
        State.setSchedules([schedule]);

        // 土曜（本来クランプ対象になりそうな日付）でも、segmentIndex=0 には
        // クランプの概念自体が無いため補正されない
        const previews = SR.buildDragPreviews(schedule, '2026-09-19', 0);

        assert.equal(previews[0].newStartDate, '2026-09-19');
        assert.equal(previews[0].segmentIndex, 0);
    });

    test('中断のないスケジュール（segments=null）でも segmentIndex=0 なら渡した日付がそのまま使われる', () => {
        const schedule = makeSchedule();
        State.setSchedules([schedule]);

        const previews = SR.buildDragPreviews(schedule, '2026-09-19', 0);

        assert.equal(previews[0].newStartDate, '2026-09-19');
        assert.equal(previews[0].segments, null);
    });

    test('連動する後工程がある残作業セグメントをクランプ対象の日付へドラッグ → 連動先プレビューもクランプ後の位置を起点にする', () => {
        // PG→PT連結ペア。schedule.endDate(09-18, 金)の翌営業日(09-21, 月)から
        // PTが始まっているので findLinkedBackSchedule に拾われる
        const schedule = makeInterruptedSchedule();
        const linkedPt = makeSchedule({
            id: 'sch_pt', process: 'PT', startDate: '2026-09-21', endDate: '2026-09-22'
        });
        State.setSchedules([schedule, linkedPt]);

        // 前セグメント終了日(09-15)より前の09-10へドラッグ → 自セグメントは09-16へクランプされるはず
        const previews = SR.buildDragPreviews(schedule, '2026-09-10', 1);

        assert.equal(previews[0].newStartDate, '2026-09-16', '自セグメントはクランプ後の日付');
        assert.equal(previews.length, 2, '連動先プレビューも含まれる');
        assert.equal(previews[1].schedule.id, 'sch_pt');
        // 連動先は自セグメントのクランプ後位置を起点に計算されるため、
        // クランプ前の生値（09-10）を起点にした場合より後ろになる
        assert.ok(
            previews[1].newStartDate >= previews[0].newStartDate,
            `連動先(${previews[1].newStartDate})が自セグメントのクランプ後位置(${previews[0].newStartDate})より前になってはならない`
        );
    });
});
