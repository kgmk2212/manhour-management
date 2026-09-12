// ============================================
// 仕様テスト: js/estimate-work-months-core.js
//   見積の作業月 UI（4 方式切替）の共通・純関数。
//   方式の解決、月の範囲・クランプ、dataset との往復、保存ペイロード（均等按分／手動配分の保持）。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const Core = await import('../js/estimate-work-months-core.js');

/** js/utils.js splitHoursEvenly と同じ仕様（0.01h 丸め・端数は最終月）の注入用 */
const split = (h, ms) => {
    const per = Math.round((h / ms.length) * 100) / 100;
    const r = {};
    let acc = 0;
    ms.forEach((m, i) => {
        r[m] = i === ms.length - 1 ? Math.round((h - acc) * 100) / 100 : per;
        acc += per;
    });
    return r;
};

describe('resolveMode()', () => {
    const avail = ['chips', 'gantt', 'matrix'];
    test('登録済みの方式はそのまま', () => assert.equal(Core.resolveMode('gantt', avail), 'gantt'));
    test('legacy は常に有効', () => assert.equal(Core.resolveMode('legacy', []), 'legacy'));
    test('未設定・不正値は chips', () => {
        assert.equal(Core.resolveMode(null, avail), 'chips');
        assert.equal(Core.resolveMode('nope', avail), 'chips');
    });
    test('chips 未登録なら legacy', () => assert.equal(Core.resolveMode('nope', ['gantt']), 'legacy'));
});

describe('monthRange() / shiftMonth()', () => {
    test('両端含む・年跨ぎ', () => {
        assert.deepEqual(Core.monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
    });
    test('start > end は空', () => assert.deepEqual(Core.monthRange('2026-09', '2026-08'), []));
    test('shiftMonth は年を跨ぐ', () => {
        assert.equal(Core.shiftMonth('2026-01', -1), '2025-12');
        assert.equal(Core.shiftMonth('2026-12', 1), '2027-01');
    });
});

describe('clampMonths()', () => {
    const range = ['2026-08', '2026-09', '2026-10', '2026-11'];
    test('範囲内は不変', () => {
        assert.deepEqual(Core.clampMonths(['2026-09', '2026-10'], range), { months: ['2026-09', '2026-10'], changed: false });
    });
    test('一部が外れたら残す', () => {
        assert.deepEqual(Core.clampMonths(['2026-10', '2026-11', '2026-12'], range), { months: ['2026-10', '2026-11'], changed: true });
    });
    test('全部外れたら近い端の 1 月', () => {
        assert.deepEqual(Core.clampMonths(['2027-01'], range), { months: ['2026-11'], changed: true });
        assert.deepEqual(Core.clampMonths(['2026-06', '2026-07'], range), { months: ['2026-08'], changed: true });
    });
    test('期間が空なら月も空', () => {
        assert.deepEqual(Core.clampMonths(['2026-08'], []), { months: [], changed: true });
    });
});

describe('serializeMonths() / parseMonths()', () => {
    test('往復・昇順・空', () => {
        assert.equal(Core.serializeMonths(['2026-10', '2026-08']), '2026-08,2026-10');
        assert.deepEqual(Core.parseMonths('2026-08,2026-10'), ['2026-08', '2026-10']);
        assert.deepEqual(Core.parseMonths(undefined), []);
        assert.deepEqual(Core.parseMonths(''), []);
    });
});

describe('buildPayload()', () => {
    const months = ['2026-08', '2026-09', '2026-10'];
    test('均等按分（splitFn 注入）と workMonth = 先頭', () => {
        const p = Core.buildPayload({ months, hours: 60, manual: null, opened: null, splitFn: split });
        assert.equal(p.workMonth, '2026-08');
        assert.deepEqual(p.workMonths, months);
        assert.deepEqual(p.monthlyHours, { '2026-08': 20, '2026-09': 20, '2026-10': 20 });
    });
    test('端数は最終月（8h / 3 月）', () => {
        const p = Core.buildPayload({ months, hours: 8, manual: null, opened: null, splitFn: split });
        assert.deepEqual(p.monthlyHours, { '2026-08': 2.67, '2026-09': 2.67, '2026-10': 2.66 });
    });
    test('手動配分は月が開いた時と同じなら保持', () => {
        const manual = { '2026-08': 10, '2026-09': 40, '2026-10': 10 };
        const p = Core.buildPayload({ months, hours: 60, manual, opened: months, splitFn: split });
        assert.deepEqual(p.monthlyHours, manual);
    });
    test('月が変わったら手動配分を捨てて均等', () => {
        const manual = { '2026-08': 10, '2026-09': 40, '2026-10': 10 };
        const p = Core.buildPayload({ months: ['2026-09', '2026-10'], hours: 60, manual, opened: months, splitFn: split });
        assert.deepEqual(p.monthlyHours, { '2026-09': 30, '2026-10': 30 });
    });
    test('月が無ければ空', () => {
        assert.deepEqual(Core.buildPayload({ months: [], hours: 8, manual: null, opened: null, splitFn: split }),
            { workMonth: '', workMonths: [], monthlyHours: {} });
    });
    test('isEvenSplit は丸め差を許容し、余計な月キーは不一致', () => {
        assert.equal(Core.isEvenSplit({ '2026-08': 2.67, '2026-09': 2.67, '2026-10': 2.66 }, 8, months, split), true);
        assert.equal(Core.isEvenSplit({ '2026-08': 1, '2026-09': 1, '2026-10': 6 }, 8, months, split), false);
        assert.equal(Core.isEvenSplit({ '2026-08': 4, '2026-09': 4, '2026-11': 0 }, 8, ['2026-08', '2026-09'], split), false);
    });
});
