// ============================================
// 仕様テスト: js/report.js の対応別マトリクス — 文字色と進捗率の集計基準
//
//   見込残存 remainingEstimates は (version, task, process) 単位で月を持たない
//   「工程全体」の値。一方でレポートの月フィルタは見積を月按分し、実績をその月だけに
//   絞る（filterReportData）。両者は粒度が違うので、基準を使い分ける（BACKLOG B-039①）。
//
//   ・実績の文字色 … 月別表示では「その月に割り当てた見積 vs その月の実績」で判定する
//                    （見込残存は月に割り振れないので色には使わない）。
//                    全期間表示では従来どおり予測総工数 EAC（実績 + 見込残存）で判定する。
//   ・進捗率       … 常に工程全体（全期間の実績 ÷ (全期間の実績 + 全体残存)）。
//                    月で切ると前月までの実績が消えて 0% に見えてしまうため。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { buildFullRangeTotals, getFullRangeTotals, evaluateMatrixCellColor, calcMatrixProgressRate } =
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

describe('evaluateMatrixCellColor() — 月別表示: その月の見積に対する実績で判定', () => {
    // 月別表示では見込残存を渡さない（月に割り振れないため）
    const monthly = (estHours, actHours) => evaluateMatrixCellColor({ estHours, actHours });

    test('その月の見積を10%超で超過したら over', () => {
        assert.equal(monthly(50, 60), 'over');
    });

    test('その月の見積を0〜10%超過したら warning', () => {
        assert.equal(monthly(50, 52), 'warning');
    });

    test('その月の見積に対し10%以上余っていれば safe-bright', () => {
        assert.equal(monthly(50, 40), 'safe-bright');
    });

    test('その月の見積に対し0〜10%余っていれば safe-normal', () => {
        assert.equal(monthly(50, 48), 'safe-normal');
    });

    test('全体残存が大きくても、その月の実績が見積内なら赤にしない', () => {
        // 6月按分50h・6月実績40h・工程全体の残存60h → 残存は色に使わない
        assert.equal(evaluateMatrixCellColor({ estHours: 50, actHours: 40 }), 'safe-bright');
    });

    test('その月の実績がまだ無ければ色を付けない（着手前のセル）', () => {
        assert.equal(monthly(50, 0), '');
    });

    test('その月の見積が無いのに実績があれば over', () => {
        assert.equal(monthly(0, 5), 'over');
    });

    test('見積も実績も無ければ色を付けない', () => {
        assert.equal(monthly(0, 0), '');
    });
});

describe('evaluateMatrixCellColor() — 全期間表示: 予測総工数(実績+見込残存)で判定', () => {
    test('予測総工数が見積ちょうどなら safe-normal', () => {
        assert.equal(evaluateMatrixCellColor({ estHours: 100, actHours: 40, remainingHours: 60 }), 'safe-normal');
    });

    test('10%超の超過見込みは over', () => {
        assert.equal(evaluateMatrixCellColor({ estHours: 100, actHours: 80, remainingHours: 31 }), 'over');
    });

    test('0〜10%の超過見込みは warning', () => {
        assert.equal(evaluateMatrixCellColor({ estHours: 100, actHours: 80, remainingHours: 25 }), 'warning');
    });

    test('10%以上の余裕見込みは safe-bright', () => {
        assert.equal(evaluateMatrixCellColor({ estHours: 100, actHours: 40, remainingHours: 40 }), 'safe-bright');
    });

    test('remainingHours が null/NaN でも 0 として扱う', () => {
        assert.equal(evaluateMatrixCellColor({ estHours: 100, actHours: 50, remainingHours: null }), 'safe-bright');
    });
});

describe('calcMatrixProgressRate() — 進捗率は常に工程全体', () => {
    test('全期間の実績 ÷ (全期間の実績 + 全体残存)', () => {
        assert.equal(Math.round(calcMatrixProgressRate({ actHours: 40, remainingHours: 60 })), 40);
    });

    test('その月の実績が0でも、工程全体で進んでいれば0%にならない', () => {
        // 7月フィルタ（7月の実績は0）でも、6月までの40hが効く
        assert.ok(calcMatrixProgressRate({ actHours: 40, remainingHours: 60 }) > 0);
    });

    test('残存0なら100%', () => {
        assert.equal(calcMatrixProgressRate({ actHours: 90, remainingHours: 0 }), 100);
    });

    test('実績も残存も0なら0%', () => {
        assert.equal(calcMatrixProgressRate({ actHours: 0, remainingHours: 0 }), 0);
    });

    test('null/NaN は 0 として扱う', () => {
        assert.equal(calcMatrixProgressRate({ actHours: 50, remainingHours: null }), 100);
        assert.equal(calcMatrixProgressRate({}), 0);
    });
});
