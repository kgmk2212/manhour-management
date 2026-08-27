// ============================================
// 仕様テスト: js/utils.js getEstimateHoursForMonth()
//   「指定月に計上すべき見積工数」の全タブ共通の唯一の実装。
//   見積一覧タブ(estimate.js)・レポートタブ(report.js)・
//   レポート分析の担当者分析/インサイト(report-analytics.js)で
//   3実装が分岐し、月フィルタ時の見積合計がタブ間で食い違っていた
//   （月未設定見積: 0 vs 全額、分配欠損: 均等割り vs 0）問題の再発防止。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { getEstimateHoursForMonth } = await import('../js/utils.js');

describe('getEstimateHoursForMonth() — monthlyHours に分配がある場合', () => {
    const est = {
        hours: 30,
        workMonths: ['2026-07', '2026-08', '2026-09'],
        monthlyHours: { '2026-07': 10, '2026-08': 15, '2026-09': 5 },
    };

    test('該当月の分配値を返す', () => {
        assert.equal(getEstimateHoursForMonth(est, '2026-07'), 10);
        assert.equal(getEstimateHoursForMonth(est, '2026-08'), 15);
    });

    test('分配値が 0 の月は 0 を返す（truthy 判定で無視しない）', () => {
        const e = { hours: 10, workMonths: ['2026-07', '2026-08'], monthlyHours: { '2026-07': 0, '2026-08': 10 } };
        assert.equal(getEstimateHoursForMonth(e, '2026-07'), 0);
    });

    test('文字列の分配値は数値に変換して返す', () => {
        const e = { hours: 10, workMonths: ['2026-07'], monthlyHours: { '2026-07': '7.5' } };
        assert.equal(getEstimateHoursForMonth(e, '2026-07'), 7.5);
    });

    test('workMonths に含まれない月は 0 を返す', () => {
        assert.equal(getEstimateHoursForMonth(est, '2026-10'), 0);
    });
});

describe('getEstimateHoursForMonth() — 作業月が未設定の見積', () => {
    test('どの月を指定しても全額を計上する（見積一覧・レポートの月フィルタ表示仕様と一致）', () => {
        const e = { hours: 20, workMonths: [], monthlyHours: {} };
        assert.equal(getEstimateHoursForMonth(e, '2026-07'), 20);
        assert.equal(getEstimateHoursForMonth(e, '2026-12'), 20);
    });

    test('workMonths/monthlyHours プロパティ自体が無くても全額を計上する', () => {
        const e = { hours: 8 };
        assert.equal(getEstimateHoursForMonth(e, '2026-07'), 8);
    });

    test('hours が数値でない場合は 0（NaN を伝播させない）', () => {
        assert.equal(getEstimateHoursForMonth({ workMonths: [], monthlyHours: {} }, '2026-07'), 0);
        assert.equal(getEstimateHoursForMonth({ hours: undefined }, '2026-07'), 0);
    });
});

describe('getEstimateHoursForMonth() — workMonths はあるが monthlyHours に該当月が無い場合', () => {
    test('workMonths に含まれる月でも分配が無ければ 0（勝手に均等割りしない）', () => {
        const e = { hours: 30, workMonths: ['2026-07', '2026-08'], monthlyHours: {} };
        assert.equal(getEstimateHoursForMonth(e, '2026-07'), 0);
    });

    test('workMonths に含まれない月も 0', () => {
        const e = { hours: 30, workMonths: ['2026-07'], monthlyHours: {} };
        assert.equal(getEstimateHoursForMonth(e, '2026-10'), 0);
    });
});

describe('getEstimateHoursForMonth() — 旧形式（workMonth 単数のみ）', () => {
    test('workMonth と一致する月は全額（normalizeEstimate による変換と同等）', () => {
        const e = { hours: 12, workMonth: '2026-07' };
        assert.equal(getEstimateHoursForMonth(e, '2026-07'), 12);
    });

    test('workMonth と異なる月は 0', () => {
        const e = { hours: 12, workMonth: '2026-07' };
        assert.equal(getEstimateHoursForMonth(e, '2026-08'), 0);
    });
});
