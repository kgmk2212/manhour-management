// ============================================
// 仕様テスト: js/report.js computeEstimateShares()
//   担当者別レポートの「見積の自動分割」（2026-01-12 導入: 92c1c2e）の
//   按分計算。見積タスクと同一キー(version/task/process)の他メンバー実績分を
//   見積から差し引いて実績者側に付け替える。
//   不変条件: 按分後の合計は常に元見積(hours)と一致する（合計保存）。
//   旧実装は Math.max(0,...) クリップのみで、他者実績が見積を超えると
//   付け替え分が全額加算されて見積合計が膨張するバグがあった。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { computeEstimateShares } = await import('../js/report.js');

const EST = { version: 'V1.0', task: '対応X', process: 'UI', member: 'A', hours: 10 };
const act = (member, hours, over = {}) => ({
    version: 'V1.0', task: '対応X', process: 'UI', member, hours, date: '2026-07-01', ...over,
});

/** shares 配列を member -> hours の連想に変換 */
function byMember(shares) {
    const m = {};
    shares.forEach(s => { m[s.member] = (m[s.member] || 0) + s.hours; });
    return m;
}

const total = shares => shares.reduce((s, x) => s + x.hours, 0);

describe('computeEstimateShares() — 見積の自動分割（按分）', () => {
    test('他メンバー実績なし: 全額が元担当者', () => {
        const shares = computeEstimateShares(EST, [act('A', 5)]);
        assert.deepEqual(byMember(shares), { A: 10 });
    });

    test('導入コミットの例: 見積A10h・実績A5h/B2h → A8h/B2h', () => {
        const shares = computeEstimateShares(EST, [act('A', 5), act('B', 2)]);
        assert.deepEqual(byMember(shares), { A: 8, B: 2 });
        assert.equal(total(shares), 10);
    });

    test('他者実績が見積を超過: 付け替えは元見積まで（合計保存）', () => {
        // 旧実装バグ: A=max(0,10-15)=0, B=+15 で合計15hに膨張していた
        const shares = computeEstimateShares(EST, [act('B', 15)]);
        assert.deepEqual(byMember(shares), { A: 0, B: 10 });
        assert.equal(total(shares), 10);
    });

    test('複数他者で超過: 実績比例で配分（合計保存）', () => {
        const shares = computeEstimateShares(EST, [act('B', 8), act('C', 8)]);
        assert.deepEqual(byMember(shares), { A: 0, B: 5, C: 5 });
        assert.equal(total(shares), 10);
    });

    test('キー(version/task/process)が違う実績は按分に影響しない', () => {
        const others = [
            act('B', 5, { task: '別対応' }),
            act('B', 5, { process: 'PG' }),
            act('B', 5, { version: 'V2.0' }),
        ];
        const shares = computeEstimateShares(EST, others);
        assert.deepEqual(byMember(shares), { A: 10 });
    });

    test('同一メンバーの複数実績は付け替えず全額元担当者', () => {
        const shares = computeEstimateShares(EST, [act('A', 4), act('A', 8)]);
        assert.deepEqual(byMember(shares), { A: 10 });
    });
});
