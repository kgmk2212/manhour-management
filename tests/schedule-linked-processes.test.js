// IT-ST/PG-PT連結ドラッグ機構の回帰テスト
// schedule.js はモジュール評価時にDOM/localStorageを触らないが、
// updateSchedule等が実行時にwindow.saveData/document.getElementByIdを参照するため
// history.test.js と同じ最小ポリフィルをimport前に用意する（js/配下のソースは変更しない）。
// handleScheduleDrag は末尾でshowToastを呼ぶため、document.createElement等も
// 最小限のフェイク要素で満たす（トースト自体の見た目はこのテストの関心事ではない）。
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

describe('handleScheduleDrag — 連結ペアの連動移動', () => {
    beforeEach(resetAll);

    test('連結中のITを移動するとSTも隙間ゼロを保ったまま追従する（週末をまたぐケース）', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([it, st]);

        // 2026-08-07(金)へ移動 → IT終了は週末をまたいで2026-08-10(月)
        Schedule.handleScheduleDrag('sch_it', '2026-08-07');

        const updatedIt = State.schedules.find(s => s.id === 'sch_it');
        const updatedSt = State.schedules.find(s => s.id === 'sch_st');
        assert.equal(updatedIt.startDate, '2026-08-07');
        assert.equal(updatedIt.endDate, '2026-08-10');
        assert.equal(updatedSt.startDate, '2026-08-11');
        assert.equal(updatedSt.endDate, '2026-08-11');
    });

    test('隙間がある場合、ITを移動してもSTは動かない', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-06', endDate: '2026-08-06', estimatedHours: 8 };
        State.setSchedules([it, st]);

        Schedule.handleScheduleDrag('sch_it', '2026-08-07');

        const updatedSt = State.schedules.find(s => s.id === 'sch_st');
        assert.equal(updatedSt.startDate, '2026-08-06', 'ITと隙間があるSTは移動しない');
    });

    test('STを単独で移動すると、STだけが動きITは変化しない（重なっても制約なし）', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([it, st]);

        Schedule.handleScheduleDrag('sch_st', '2026-08-03'); // ITと重なる日付へ

        const updatedIt = State.schedules.find(s => s.id === 'sch_it');
        const updatedSt = State.schedules.find(s => s.id === 'sch_st');
        assert.equal(updatedIt.startDate, '2026-08-03', 'ITは変化しない');
        assert.equal(updatedSt.startDate, '2026-08-03', 'STはITと重なる位置へ制約なく移動する');
    });

    test('PG→PTでも同様に連動する（連結ペアの一般化の確認）', () => {
        const pg = { ...base, id: 'sch_pg', process: 'PG', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const pt = { ...base, id: 'sch_pt', process: 'PT', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([pg, pt]);

        Schedule.handleScheduleDrag('sch_pg', '2026-08-07');

        const updatedPt = State.schedules.find(s => s.id === 'sch_pt');
        assert.equal(updatedPt.startDate, '2026-08-11');
    });

    test('連動した移動は1回のUndoで両方元に戻り、Redoで両方再適用される', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([it, st]);
        window.updateScheduleFn = Schedule.updateSchedule; // history.js の 'move' 適用が参照する

        Schedule.handleScheduleDrag('sch_it', '2026-08-07');
        assert.equal(State.schedules.find(s => s.id === 'sch_st').startDate, '2026-08-11');

        History.undo();
        assert.equal(State.schedules.find(s => s.id === 'sch_it').startDate, '2026-08-03', 'Undo1回でITが戻る');
        assert.equal(State.schedules.find(s => s.id === 'sch_st').startDate, '2026-08-05', 'Undo1回でSTも戻る');

        History.redo();
        assert.equal(State.schedules.find(s => s.id === 'sch_it').startDate, '2026-08-07');
        assert.equal(State.schedules.find(s => s.id === 'sch_st').startDate, '2026-08-11', 'Redo1回でSTも再適用される');
    });
});
