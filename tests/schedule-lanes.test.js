import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleSpan, assignLanes, buildRowLayout, rowIndexAtY } from '../js/schedule-lanes.js';

const s = (id, startDate, endDate, extra = {}) => ({ id, startDate, endDate, ...extra });

describe('scheduleSpan', () => {
    test('中断なしは startDate〜endDate', () => {
        assert.deepEqual(scheduleSpan(s('a', '2026-09-14', '2026-09-18')), { start: '2026-09-14', end: '2026-09-18' });
    });
    test('segments を渡すと最小開始〜最大終了', () => {
        const segs = [{ startDate: '2026-09-14', endDate: '2026-09-15' }, { startDate: '2026-09-21', endDate: '2026-09-22' }];
        assert.deepEqual(scheduleSpan(s('a', '2026-09-14', '2026-09-22'), segs), { start: '2026-09-14', end: '2026-09-22' });
    });
});

describe('assignLanes', () => {
    test('重ならなければ全部レーン0', () => {
        const r = assignLanes([s('a', '2026-09-14', '2026-09-15'), s('b', '2026-09-16', '2026-09-18')]);
        assert.equal(r.laneCount, 1);
        assert.equal(r.laneOf.get('a'), 0);
        assert.equal(r.laneOf.get('b'), 0);
    });
    test('終了日と開始日が同日なら重なりとみなす', () => {
        const r = assignLanes([s('a', '2026-09-14', '2026-09-16'), s('b', '2026-09-16', '2026-09-18')]);
        assert.equal(r.laneCount, 2);
        assert.equal(r.laneOf.get('b'), 1);
    });
    test('3本重なりは3レーン、空いた上段は再利用する', () => {
        const r = assignLanes([
            s('a', '2026-09-14', '2026-09-18'),
            s('b', '2026-09-15', '2026-09-16'),
            s('c', '2026-09-16', '2026-09-17'),
            s('d', '2026-09-17', '2026-09-18'),
        ]);
        assert.equal(r.laneOf.get('a'), 0);
        assert.equal(r.laneOf.get('b'), 1);
        assert.equal(r.laneOf.get('c'), 2);
        assert.equal(r.laneOf.get('d'), 1); // b は 09-16 で終わるので d は b の段に入る
        assert.equal(r.laneCount, 3);
    });
    test('開始日が同じなら入力順を保つ（安定）', () => {
        const r = assignLanes([s('x', '2026-09-14', '2026-09-14'), s('y', '2026-09-14', '2026-09-14')]);
        assert.equal(r.laneOf.get('x'), 0);
        assert.equal(r.laneOf.get('y'), 1);
    });
    test('spanOf で分割予定の期間を差し替えられる', () => {
        const spans = new Map([['a', { start: '2026-09-14', end: '2026-09-25' }]]);
        const r = assignLanes([s('a', '2026-09-14', '2026-09-15'), s('b', '2026-09-22', '2026-09-22')],
            (sc) => spans.get(sc.id) || scheduleSpan(sc));
        assert.equal(r.laneOf.get('b'), 1);
    });
});

describe('buildRowLayout / rowIndexAtY', () => {
    const cfg = { headerHeight: 50, rowHeight: 36, laneHeight: 28 };
    test('レーン数に応じて行の高さが伸び、オフセットが累積する', () => {
        const layout = buildRowLayout([1, 3, 1], cfg);
        assert.deepEqual(layout.heights, [36, 92, 36]);
        assert.deepEqual(layout.offsets, [50, 86, 178]);
        assert.equal(layout.totalHeight, 214);
    });
    test('Y 座標から行を引く（境界は下の行、範囲外は -1）', () => {
        const layout = buildRowLayout([1, 3, 1], cfg);
        assert.equal(rowIndexAtY(layout, 49), -1);
        assert.equal(rowIndexAtY(layout, 50), 0);
        assert.equal(rowIndexAtY(layout, 85.9), 0);
        assert.equal(rowIndexAtY(layout, 86), 1);
        assert.equal(rowIndexAtY(layout, 177), 1);
        assert.equal(rowIndexAtY(layout, 213), 2);
        assert.equal(rowIndexAtY(layout, 214), -1);
    });
});
