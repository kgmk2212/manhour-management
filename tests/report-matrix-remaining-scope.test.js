// ============================================
// 仕様テスト: js/report.js の対応別マトリクス — 見込残存を絡めた判定の集計範囲
//   見込残存 remainingEstimates は (version, task, process) 単位で月を持たない
//   「工程全体」の値。一方でレポートの月フィルタは見積を月按分し、実績をその月だけに
//   絞る（filterReportData）。この両者を混ぜると
//     ・実績の文字色 = (当月実績 + 全体残存) / 当月按分見積  → 分割工程ほど過大に赤くなる
//     ・進捗率       = 当月実績 / (当月実績 + 全体残存)      → 前月までの実績を無視する
//   というズレが出る（BACKLOG B-039①）。
//   → 残存が絡む判定だけは月フィルタを無視し、その工程の「全期間」の見積・実績で行う。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { buildFullRangeTotals, getFullRangeTotals, evaluateMatrixCellStatus } =
    await import('../js/report.js');

const est = (over = {}) => ({
    version: 'V1.0', task: '対応X', process: 'UI', member: 'A', hours: 100, ...over,
});
const act = (over = {}) => ({
    version: 'V1.0', task: '対応X', process: 'UI', member: 'A', hours: 10,
    date: '2026-06-10', ...over,
});

describe('buildFullRangeTotals() — 月フィルタに依らない工程単位の見積・実績', () => {
    test('同一 version/task/process の見積・実績を全期間で合算する', () => {
        const map = buildFullRangeTotals(
            [est({ hours: 60, member: 'A' }), est({ hours: 40, member: 'B' })],
            [act({ hours: 25, date: '2026-06-10' }), act({ hours: 15, date: '2026-07-03' })]
        );
        assert.deepEqual(getFullRangeTotals(map, 'V1.0', '対応X', 'UI'), { est: 100, act: 40 });
    });

    test('月按分（monthlyHours）があっても見積は全期間の hours を使う', () => {
        // 100h を 6月50h / 7月50h に分割した見積レコード（hours は全期間合計のまま）
        const split = est({
            hours: 100,
            workMonths: ['2026-06', '2026-07'],
            monthlyHours: { '2026-06': 50, '2026-07': 50 },
        });
        const map = buildFullRangeTotals([split], []);
        assert.equal(getFullRangeTotals(map, 'V1.0', '対応X', 'UI').est, 100);
    });

    test('version/task/process が違うものは混ざらない', () => {
        const map = buildFullRangeTotals(
            [est({ hours: 10 }), est({ hours: 20, process: 'PG' }), est({ hours: 30, task: '対応Y' })],
            []
        );
        assert.equal(getFullRangeTotals(map, 'V1.0', '対応X', 'UI').est, 10);
        assert.equal(getFullRangeTotals(map, 'V1.0', '対応X', 'PG').est, 20);
        assert.equal(getFullRangeTotals(map, 'V1.0', '対応Y', 'UI').est, 30);
    });

    test('該当キーが無ければ 0 を返す（未登録セルで NaN にしない）', () => {
        const map = buildFullRangeTotals([], []);
        assert.deepEqual(getFullRangeTotals(map, 'V1.0', '無い対応', 'UI'), { est: 0, act: 0 });
    });

    test('isOtherWork 判定されたレコードはマトリクスと同じ「その他付随作業」キーにまとめる', () => {
        const isOtherWorkFn = (r) => !r.version || r.version.trim() === '';
        const map = buildFullRangeTotals(
            [est({ version: '', task: '打合せ', hours: 5 })],
            [act({ version: '', task: '打合せ', hours: 3 })],
            isOtherWorkFn
        );
        assert.deepEqual(getFullRangeTotals(map, 'その他付随作業', '打合せ', 'UI'), { est: 5, act: 3 });
    });

    test('対応名が空の「その他付随作業」は「未分類作業」に寄せる（マトリクスの表示キーと一致）', () => {
        const isOtherWorkFn = () => true;
        const map = buildFullRangeTotals([est({ task: '', hours: 7 })], [], isOtherWorkFn);
        assert.equal(getFullRangeTotals(map, 'その他付随作業', '未分類作業', 'UI').est, 7);
    });

    test('hours が欠損・非数値でも NaN にしない', () => {
        const map = buildFullRangeTotals([est({ hours: undefined })], [act({ hours: null })]);
        assert.deepEqual(getFullRangeTotals(map, 'V1.0', '対応X', 'UI'), { est: 0, act: 0 });
    });
});

describe('evaluateMatrixCellStatus() — 実績の文字色と進捗率', () => {
    test('予測総工数（実績+残存）が見積ちょうどなら safe-normal', () => {
        const s = evaluateMatrixCellStatus({ estHours: 100, actHours: 40, remainingHours: 60 });
        assert.equal(s.colorClass, 'safe-normal');
    });

    test('2ヶ月に分割した工程を6月フィルタで見ても、全期間値で判定すれば赤にならない', () => {
        // 全体100h（6月50h/7月50h）・6月までの実績40h・残存60h
        // 旧実装は当月按分の見積50hと比べて ratio=2.0 → over だった
        const s = evaluateMatrixCellStatus({ estHours: 100, actHours: 40, remainingHours: 60 });
        assert.notEqual(s.colorClass, 'over');
        assert.notEqual(s.colorClass, 'warning');
    });

    test('10%超の超過見込みは over', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 100, actHours: 80, remainingHours: 31 }).colorClass, 'over');
    });

    test('0〜10%の超過見込みは warning', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 100, actHours: 80, remainingHours: 25 }).colorClass, 'warning');
    });

    test('10%以上の余裕は safe-bright', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 100, actHours: 40, remainingHours: 40 }).colorClass, 'safe-bright');
    });

    test('見積0で実績ありは over', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 0, actHours: 5, remainingHours: 0 }).colorClass, 'over');
    });

    test('見積0・実績0なら色を付けない', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 0, actHours: 0, remainingHours: 0 }).colorClass, '');
    });

    test('見積ありで実績も残存も0なら色を付けない（着手前のセル）', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 50, actHours: 0, remainingHours: 0 }).colorClass, '');
    });

    test('進捗率は全期間の実績 ÷ (全期間の実績 + 全体残存)', () => {
        const s = evaluateMatrixCellStatus({ estHours: 100, actHours: 40, remainingHours: 60 });
        assert.equal(Math.round(s.progressRate), 40);
    });

    test('7月フィルタでも進捗率は0%にならない（分子が当月実績に切られない）', () => {
        // 6月に40h消化済み・7月の実績は0・残存60h。全期間の実績40hで判定する
        const s = evaluateMatrixCellStatus({ estHours: 100, actHours: 40, remainingHours: 60 });
        assert.ok(s.progressRate > 0);
    });

    test('残存0なら進捗率100%', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 100, actHours: 90, remainingHours: 0 }).progressRate, 100);
    });

    test('実績も残存も0なら進捗率0%', () => {
        assert.equal(evaluateMatrixCellStatus({ estHours: 100, actHours: 0, remainingHours: 0 }).progressRate, 0);
    });

    test('remainingHours が null/NaN でも 0 として扱う', () => {
        const s = evaluateMatrixCellStatus({ estHours: 100, actHours: 50, remainingHours: null });
        assert.equal(s.progressRate, 100);
        assert.equal(s.colorClass, 'safe-bright');
    });
});
