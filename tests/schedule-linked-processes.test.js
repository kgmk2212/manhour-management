// IT-ST/PG-PT連結ドラッグ機構の回帰テスト
// schedule.js はモジュール評価時にDOM/localStorageを触らないが、
// updateSchedule等が実行時にwindow.saveData/document.getElementByIdを参照するため
// history.test.js と同じ最小ポリフィルをimport前に用意する（js/配下のソースは変更しない）。
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
const Schedule = await import('../js/schedule.js');

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

describe('getNextBusinessDay', () => {
    beforeEach(resetAll);

    test('平日の翌日が平日ならその日を返す', () => {
        // 2026-08-03は月曜日
        assert.equal(Schedule.getNextBusinessDay('2026-08-03', '山田'), '2026-08-04');
    });

    test('金曜日の翌営業日は週明け月曜日になる（土日をスキップ）', () => {
        // 2026-08-07は金曜日
        assert.equal(Schedule.getNextBusinessDay('2026-08-07', '山田'), '2026-08-10');
    });
});

describe('findLinkedBackSchedule', () => {
    beforeEach(resetAll);

    test('IT終了日の翌営業日から始まるSTが同一版数/対応/担当者にあれば連結対象として返す', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(it, [it, st]).id, 'sch_st');
    });

    test('隙間がある場合は連結対象とみなさない', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-06', endDate: '2026-08-06' };
        assert.equal(Schedule.findLinkedBackSchedule(it, [it, st]), null);
    });

    test('担当者が異なる場合は連結対象とみなさない', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', member: '鈴木', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(it, [it, st]), null);
    });

    test('PG→PTペアでも同様に連結対象を返す（連結ペアの一般化）', () => {
        const pg = { ...base, id: 'sch_pg', process: 'PG', startDate: '2026-08-03', endDate: '2026-08-04' };
        const pt = { ...base, id: 'sch_pt', process: 'PT', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(pg, [pg, pt]).id, 'sch_pt');
    });

    test('後工程（ST）自身は前工程を持たないため常にnullを返す', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(st, [it, st]), null);
    });
});
