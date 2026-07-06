// ============================================
// 特性テスト: js/estimate.js
//   月の実働日数計算 getWorkingDays() の振る舞いを固定する。
//   getWorkingDays() は内部で window.getHoliday / window.isCompanyHoliday を
//   参照するため、Node実行時には `window` がグローバルに存在する必要がある
//   （estimate.js 自体は変更していない）。
//   window.getHoliday / isCompanyHoliday を定義しない場合は「土日のみ除外」
//   の挙動になる（typeof チェックで関数でなければ null/false 扱い）。
// ============================================
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { getWorkingDays } = await import('../js/estimate.js');

describe('getWorkingDays() — 祝日・会社休日関数が未定義の場合（土日のみ除外）', () => {
    beforeEach(() => {
        // 各テスト前に祝日判定関数を未定義状態にリセット
        delete globalThis.window.getHoliday;
        delete globalThis.window.isCompanyHoliday;
    });

    test('2026年7月（31日・平日23日）', () => {
        assert.equal(getWorkingDays(2026, 7), 23);
    });

    test('2026年1月（31日・平日22日）', () => {
        assert.equal(getWorkingDays(2026, 1), 22);
    });

    test('2026年2月（平年28日・平日20日）', () => {
        assert.equal(getWorkingDays(2026, 2), 20);
    });

    test('2024年2月（うるう年29日・平日21日）', () => {
        assert.equal(getWorkingDays(2024, 2), 21);
    });
});

describe('getWorkingDays() — window.getHoliday / isCompanyHoliday が定義されている場合', () => {
    test('祝日・会社休日として判定された平日はさらに除外される', () => {
        globalThis.window.isCompanyHoliday = (dateStr) => dateStr === '2026-07-15';
        globalThis.window.getHoliday = (dateStr) => (dateStr === '2026-07-20' ? { name: 'test-holiday' } : null);
        // 土日のみ除外の23日から、祝日1日+会社休日1日の平日2日がさらに除外され21日
        assert.equal(getWorkingDays(2026, 7), 21);
        delete globalThis.window.getHoliday;
        delete globalThis.window.isCompanyHoliday;
    });
});
