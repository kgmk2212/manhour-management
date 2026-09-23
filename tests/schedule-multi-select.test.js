// スケジュール範囲選択・一括移動（営業日シフト／一括移動計画／Undo）の回帰テスト
// schedule.js が実行時に参照する window/document/localStorage の最小ポリフィルを
// import 前に用意する（schedule-linked-processes.test.js と同じ方式。js/配下は変更しない）。
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function createFakeElement() {
    return {
        className: '',
        innerHTML: '',
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: () => {},
        querySelector: () => null,
        addEventListener: () => {},
        remove: () => {},
    };
}

globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => [],
    createElement: () => createFakeElement(),
    body: { appendChild: () => {} },
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
globalThis.alert = () => {};
// showToastの自動消去タイマー（既定3000ms）がテストの終了を遅延させないよう即時実行にする
globalThis.setTimeout = (fn) => { if (typeof fn === 'function') fn(); return 0; };
const State = await import('../js/state.js');
const Schedule = await import('../js/schedule.js');
const History = await import('../js/history.js');

function resetAll() {
    globalThis.localStorage._map.clear();
    State.setSchedules([]);
    State.setCompanyHolidays([]);
    State.setVacations([]);
    State.setScheduleSettings({ hoursPerDay: 8 });
}

const base = {
    version: 'V1.0', task: '対応A', member: '山田', estimatedHours: 8,
    status: 'pending', color: '#000', note: '', createdAt: '', updatedAt: '',
};
const byId = (id) => State.schedules.find(s => s.id === id);

// 2026-08: 3(月)〜7(金), 10(月)〜14(金)。8-11 は山の日だが祝日判定は window.getHoliday 依存で
// このテスト環境では未定義のため平日扱いになる（休日実装差に依存しない）。
describe('shiftBusinessDays', () => {
    beforeEach(resetAll);

    test('金曜日を+1すると週明け月曜日になる', () => {
        assert.equal(Schedule.shiftBusinessDays('2026-08-07', 1, '山田'), '2026-08-10');
    });
    test('月曜日を-1すると前週金曜日になる', () => {
        assert.equal(Schedule.shiftBusinessDays('2026-08-10', -1, '山田'), '2026-08-07');
    });
    test('0なら同じ日を返す', () => {
        assert.equal(Schedule.shiftBusinessDays('2026-08-05', 0, '山田'), '2026-08-05');
    });
    test('担当者の休暇日を飛ばす', () => {
        State.setVacations([{ member: '山田', date: '2026-08-04', hours: 8, vacationType: '全休' }]);
        assert.equal(Schedule.shiftBusinessDays('2026-08-03', 1, '山田'), '2026-08-05');
        assert.equal(Schedule.shiftBusinessDays('2026-08-03', 1, '鈴木'), '2026-08-04');
    });
});

describe('businessDayDelta', () => {
    beforeEach(resetAll);

    test('月曜から翌週月曜は+5、逆は-5', () => {
        assert.equal(Schedule.businessDayDelta('2026-08-03', '2026-08-10', '山田'), 5);
        assert.equal(Schedule.businessDayDelta('2026-08-10', '2026-08-03', '山田'), -5);
    });
    test('同日は0', () => {
        assert.equal(Schedule.businessDayDelta('2026-08-05', '2026-08-05', '山田'), 0);
    });
    test('土曜日に落とした場合は直前の金曜日までで数える', () => {
        assert.equal(Schedule.businessDayDelta('2026-08-03', '2026-08-08', '山田'), 4);
    });
    test('前方向で日曜日に落とした場合は直後の月曜日までで数える', () => {
        assert.equal(Schedule.businessDayDelta('2026-08-12', '2026-08-09', '山田'), -2);
    });
});

describe('planBatchMove', () => {
    beforeEach(resetAll);

    test('担当者の異なる2本を同じ営業日数だけずらす（週末またぎ）', () => {
        const a = { ...base, id: 'a', process: 'UI', startDate: '2026-08-05', endDate: '2026-08-05' };
        const b = { ...base, id: 'b', member: '鈴木', process: 'PG', startDate: '2026-08-06', endDate: '2026-08-07', estimatedHours: 16 };
        const moves = Schedule.planBatchMove(['a', 'b'], [a, b], 3);
        const ma = moves.find(m => m.scheduleId === 'a');
        const mb = moves.find(m => m.scheduleId === 'b');
        assert.deepEqual([ma.newStartDate, ma.newEndDate], ['2026-08-10', '2026-08-10']);
        assert.deepEqual([mb.newStartDate, mb.newEndDate], ['2026-08-11', '2026-08-12']);
        assert.equal(ma.oldStartDate, '2026-08-05');
    });

    test('選択外の連結後工程（ST）は前工程の新終了日の翌営業日に追従する', () => {
        const it = { ...base, id: 'it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        const moves = Schedule.planBatchMove(['it'], [it, st], 4);
        assert.equal(moves.length, 2);
        const mst = moves.find(m => m.scheduleId === 'st');
        assert.equal(moves.find(m => m.scheduleId === 'it').newEndDate, '2026-08-10');
        assert.equal(mst.newStartDate, '2026-08-11');
    });

    test('後工程も選択されていても重複せず、翌営業日ルールで配置される', () => {
        const it = { ...base, id: 'it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        const moves = Schedule.planBatchMove(['st', 'it'], [it, st], 4);
        assert.equal(moves.length, 2);
        assert.equal(moves.find(m => m.scheduleId === 'st').newStartDate, '2026-08-11');
    });

    test('存在しないIDは無視し、delta=0なら空配列', () => {
        const a = { ...base, id: 'a', process: 'UI', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.deepEqual(Schedule.planBatchMove(['a', 'zzz'], [a], 0), []);
        assert.equal(Schedule.planBatchMove(['a', 'zzz'], [a], 1).length, 1);
    });
});

describe('handleScheduleBatchDrag — 1回のUndo/Redoで全件往復', () => {
    beforeEach(resetAll);

    test('一括移動→Undo→Redo', () => {
        const a = { ...base, id: 'a', process: 'UI', startDate: '2026-08-05', endDate: '2026-08-05' };
        const b = { ...base, id: 'b', member: '鈴木', process: 'PG', startDate: '2026-08-06', endDate: '2026-08-06' };
        State.setSchedules([a, b]);
        window.updateScheduleFn = Schedule.updateSchedule; // history.js の適用処理が参照する

        Schedule.handleScheduleBatchDrag(['a', 'b'], -2);
        assert.equal(byId('a').startDate, '2026-08-03');
        assert.equal(byId('b').startDate, '2026-08-04');

        History.undo();
        assert.equal(byId('a').startDate, '2026-08-05');
        assert.equal(byId('b').startDate, '2026-08-06');

        History.redo();
        assert.equal(byId('a').startDate, '2026-08-03');
        assert.equal(byId('b').endDate, '2026-08-04');
    });
});
