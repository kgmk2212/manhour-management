// ============================================
// 仕様テスト: js/report.js sumEstimateHoursByMember()
//   担当者別レポート / Phase3 担当者別パフォーマンスの見積集計。
//   見積は登録された担当者にそのまま加算する（他担当者の実績による
//   按分・付け替えは行わない）。複数人で担当するタスクは担当者ごとに
//   見積レコードがあるので、それぞれの hours を各担当者に加算すればよい。
//   → 見積一覧タブの「担当者別合計」と同じ値になる。
//   （2026-08-29 に旧「見積の自動分割（按分）」computeEstimateShares を撤去）
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { sumEstimateHoursByMember } = await import('../js/report.js');

const est = (member, hours, over = {}) => ({
    version: 'V1.0', task: '対応X', process: 'UI', member, hours, ...over,
});

describe('sumEstimateHoursByMember() — 見積は登録担当者にそのまま加算', () => {
    test('担当者ごとに hours を合算する', () => {
        const totals = sumEstimateHoursByMember([est('A', 10), est('A', 2, { process: 'PG' }), est('B', 4)]);
        assert.deepEqual(totals, { A: 12, B: 4 });
    });

    test('同一タスクを複数人で担当: 各担当者の見積レコードがそのまま各人に計上される', () => {
        const totals = sumEstimateHoursByMember([est('A', 10), est('B', 4)]);
        assert.deepEqual(totals, { A: 10, B: 4 });
        assert.equal(totals.A + totals.B, 14);
    });

    test('見積が無い担当者はキーに現れない（実績だけの人は 0 扱いを呼び出し側で行う）', () => {
        const totals = sumEstimateHoursByMember([est('A', 10)]);
        assert.deepEqual(Object.keys(totals), ['A']);
    });

    test('空配列は空オブジェクト', () => {
        assert.deepEqual(sumEstimateHoursByMember([]), {});
    });
});
