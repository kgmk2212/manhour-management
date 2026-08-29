// ============================================
// 仕様テスト: js/report.js computeInsights()
//   レポートタブ Phase3「担当者分析とインサイト」の判定ロジック。
//
//   旧実装の問題（2026-08-29 に判定を刷新）:
//     - 「最適な工程」が番兵値 1000 との比較だけで、実質無条件表示だった
//     - 「優れた見積精度」が全体合計比のみで、過小見積と過大見積が相殺すると緑になった
//     - 見積過大（実績 < 見積）を警告する経路が存在しなかった
//     - 担当者を一切参照していなかった（セクション名に反して担当者判定ゼロ）
//
//   新仕様の柱:
//     1. 評価母集団は「見積あり かつ 実績あり」のタスクのみ（未着手による誤警告を防ぐ）
//     2. バイアス（符号つき合計比）と、ばらつき（加重平均絶対乖離）を分けて判定する
//     3. 全体評価は必ず1件出す（無言レンジを作らない）
//     4. 担当者・工程・見積外作業を名指しで警告する
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { computeInsights } = await import('../js/report.js');

/** 見積レコード生成 */
const est = (task, hours, over = {}) => ({
    version: 'V1.0', task, process: 'PG', member: 'A', hours, ...over,
});
/** 実績レコード生成 */
const act = (task, hours, over = {}) => ({
    version: 'V1.0', task, process: 'PG', member: 'A', hours, ...over,
});

const titles = (insights) => insights.map(i => i.title);
const pick = (insights, title) => insights.find(i => i.title === title);

describe('computeInsights() — 全体評価', () => {
    test('見積と実績が一致していれば「優れた見積精度」を出す', () => {
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20)],
            [act('t1', 20), act('t2', 20)]
        );
        const good = pick(insights, '優れた見積精度');
        assert.ok(good, `success が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(good.type, 'success');
    });

    test('合計は一致していてもタスク単位で相殺しているなら success を出さず警告する', () => {
        // t1 は +50%、t2 は -50%。合計は 40h → 40h でバイアス 0 だが中身はばらばら
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20)],
            [act('t1', 30), act('t2', 10)]
        );
        assert.equal(pick(insights, '優れた見積精度'), undefined,
            '相殺しているのに success が出ている');
        const warn = pick(insights, 'タスク間のばらつきが大きい');
        assert.ok(warn, `ばらつき警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
    });

    test('実績が見積を大きく超過していれば「見積が不足」を警告する', () => {
        const insights = computeInsights([est('t1', 20)], [act('t1', 30)]);
        const warn = pick(insights, '見積が不足');
        assert.ok(warn, `超過警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
    });

    test('実績が見積を大きく下回れば「見積が過大」を警告する（旧実装には無かった経路）', () => {
        const insights = computeInsights([est('t1', 20)], [act('t1', 10)]);
        const warn = pick(insights, '見積が過大');
        assert.ok(warn, `過大見積の警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
    });

    test('良好でも警告水準でもない中間帯でも必ず全体評価を1件出す（無言レンジを作らない）', () => {
        // バイアス 0、ばらつき 20%（良好 15% 超・警告 30% 未満）
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20)],
            [act('t1', 24), act('t2', 16)]
        );
        const info = pick(insights, '見積精度は概ね良好');
        assert.ok(info, `中間帯の評価が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(info.type, 'info');
    });

    test('実績が未入力のタスクは評価対象に含めない（未着手を過大見積と誤判定しない）', () => {
        // t2 は着手前で実績なし。t1 だけを見れば見積どおり
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20)],
            [act('t1', 20)]
        );
        assert.ok(pick(insights, '優れた見積精度'),
            `未着手タスクを巻き込んで判定している: ${titles(insights).join(' / ')}`);
        assert.equal(pick(insights, '見積が過大'), undefined);
    });
});

describe('computeInsights() — 最適な工程', () => {
    test('精度の良い工程が無ければ「最適な工程」を出さない（旧実装は無条件表示だった）', () => {
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20, { process: 'UI' })],
            [act('t1', 40), act('t2', 40, { process: 'UI' })]
        );
        assert.equal(pick(insights, '最適な工程'), undefined,
            `全工程が倍以上超過なのに最適な工程が出ている: ${titles(insights).join(' / ')}`);
    });

    test('工程内で相殺しているだけの工程は「最適な工程」に選ばない', () => {
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20)],
            [act('t1', 30), act('t2', 10)]
        );
        assert.equal(pick(insights, '最適な工程'), undefined);
    });

    test('工数が僅少な工程は「最適な工程」に選ばない', () => {
        const insights = computeInsights(
            [est('t1', 20), est('t2', 2, { process: 'UI' }), est('t3', 2, { process: 'UI' })],
            [act('t1', 30), act('t2', 2, { process: 'UI' }), act('t3', 2, { process: 'UI' })]
        );
        assert.equal(pick(insights, '最適な工程'), undefined,
            `4h しかない工程を最適な工程に選んでいる: ${titles(insights).join(' / ')}`);
    });

    test('タスクが1件しかない工程は「最適な工程」に選ばない', () => {
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20, { process: 'UI' })],
            [act('t1', 20), act('t2', 40, { process: 'UI' })]
        );
        assert.equal(pick(insights, '最適な工程'), undefined);
    });

    test('精度が良く十分な工数がある工程は名指しで「最適な工程」に出す', () => {
        const insights = computeInsights(
            [est('t1', 10), est('t2', 10), est('t3', 20, { process: 'UI' })],
            [act('t1', 10), act('t2', 10), act('t3', 40, { process: 'UI' })]
        );
        const best = pick(insights, '最適な工程');
        assert.ok(best, `最適な工程が出ていない: ${titles(insights).join(' / ')}`);
        assert.match(best.message, /PG/);
    });

    test('乖離の大きい工程を名指しで警告する', () => {
        const insights = computeInsights(
            [est('t1', 10), est('t2', 10), est('t3', 20, { process: 'UI' })],
            [act('t1', 10), act('t2', 10), act('t3', 40, { process: 'UI' })]
        );
        const warn = pick(insights, '乖離の大きい工程');
        assert.ok(warn, `工程警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
        assert.match(warn.message, /UI/);
    });
});

describe('computeInsights() — 担当者', () => {
    test('見積を超過しがちな担当者を名指しで警告する', () => {
        const insights = computeInsights(
            [est('t1', 20, { member: 'A' }), est('t2', 20, { member: 'B' })],
            [act('t1', 40, { member: 'A' }), act('t2', 20, { member: 'B' })]
        );
        const warn = pick(insights, '見積を超過しがちな担当者');
        assert.ok(warn, `担当者警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
        assert.match(warn.message, /A/);
        assert.doesNotMatch(warn.message, /B/);
    });

    test('見積が過大な担当者を名指しで警告する', () => {
        const insights = computeInsights(
            [est('t1', 20, { member: 'A' }), est('t2', 20, { member: 'B' })],
            [act('t1', 10, { member: 'A' }), act('t2', 20, { member: 'B' })]
        );
        const warn = pick(insights, '見積に余裕がある担当者');
        assert.ok(warn, `過大見積の担当者警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.match(warn.message, /A/);
    });

    test('実績が未登録の担当者は判定対象にしない', () => {
        const insights = computeInsights(
            [est('t1', 20, { member: 'A' }), est('t2', 20, { member: 'B' })],
            [act('t1', 20, { member: 'A' })]
        );
        assert.equal(pick(insights, '見積に余裕がある担当者'), undefined,
            `実績未登録の担当者を過大見積と判定している: ${titles(insights).join(' / ')}`);
    });

    test('担当者が1人だけなら担当者インサイトは出さない（全体評価と重複するため）', () => {
        const insights = computeInsights([est('t1', 20)], [act('t1', 40)]);
        assert.equal(pick(insights, '見積を超過しがちな担当者'), undefined);
    });
});

describe('computeInsights() — 月の標準工数に対する割当（キャパシティ）', () => {
    // 標準工数 = 営業日数 × 8h − その担当者の休暇時間。ここでは 20日 × 8h = 160h/人。
    const capacity = (over = {}) => ({
        workingDays: 20,
        hoursPerDay: 8,
        periodLabel: '2026年8月',
        vacationHoursByMember: {},
        ...over,
    });

    test('標準工数を超えて見積が割り当てられた担当者を名指しする', () => {
        // A は 200h（125%）、B は 150h（94%）
        const insights = computeInsights(
            [est('t1', 200, { member: 'A' }), est('t2', 150, { member: 'B' })],
            [act('t1', 200, { member: 'A' }), act('t2', 150, { member: 'B' })],
            capacity()
        );
        const warn = pick(insights, 'キャパシティ超過の担当者');
        assert.ok(warn, `キャパ超過の担当者警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
        assert.match(warn.message, /A/);
        assert.doesNotMatch(warn.message, /B/);
    });

    test('標準工数に対して見積が少ない担当者を名指しする', () => {
        // A は 160h（100%）、B は 60h（37%）
        const insights = computeInsights(
            [est('t1', 160, { member: 'A' }), est('t2', 60, { member: 'B' })],
            [act('t1', 160, { member: 'A' }), act('t2', 60, { member: 'B' })],
            capacity()
        );
        const warn = pick(insights, 'キャパシティに余裕がある担当者');
        assert.ok(warn, `キャパ余裕の担当者警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.match(warn.message, /B/);
    });

    test('休暇時間を標準工数から差し引いて判定する', () => {
        const estimates = [est('t1', 130, { member: 'A' }), est('t2', 130, { member: 'B' })];
        const actuals = [act('t1', 130, { member: 'A' }), act('t2', 130, { member: 'B' })];

        // 休暇なし: 130h / 160h = 81% で超過ではない
        assert.equal(
            pick(computeInsights(estimates, actuals, capacity()), 'キャパシティ超過の担当者'),
            undefined
        );

        // A が 48h 休暇 → 標準 112h に減り、130h は 116% で超過
        const withVacation = computeInsights(estimates, actuals,
            capacity({ vacationHoursByMember: { A: 48 } }));
        const warn = pick(withVacation, 'キャパシティ超過の担当者');
        assert.ok(warn, `休暇を差し引いていない: ${titles(withVacation).join(' / ')}`);
        assert.match(warn.message, /A/);
    });

    test('チーム全体の割当が標準工数を超えていれば警告する', () => {
        const insights = computeInsights(
            [est('t1', 200, { member: 'A' }), est('t2', 200, { member: 'B' })],
            [act('t1', 200, { member: 'A' }), act('t2', 200, { member: 'B' })],
            capacity()
        );
        const warn = pick(insights, 'チームのキャパシティ超過');
        assert.ok(warn, `チーム全体のキャパ警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
    });

    test('チーム全体の割当が標準工数に対して少なければ警告する', () => {
        const insights = computeInsights(
            [est('t1', 50, { member: 'A' }), est('t2', 50, { member: 'B' })],
            [act('t1', 50, { member: 'A' }), act('t2', 50, { member: 'B' })],
            capacity()
        );
        const warn = pick(insights, 'チームの割当不足');
        assert.ok(warn, `チーム全体の割当不足警告が出ていない: ${titles(insights).join(' / ')}`);
    });

    test('対象期間が特定できない場合はキャパシティ判定を出さない', () => {
        const insights = computeInsights(
            [est('t1', 200, { member: 'A' }), est('t2', 200, { member: 'B' })],
            [act('t1', 200, { member: 'A' }), act('t2', 200, { member: 'B' })]
        );
        assert.equal(pick(insights, 'チームのキャパシティ超過'), undefined);
        assert.equal(pick(insights, 'キャパシティ超過の担当者'), undefined);
    });

    test('見積が割り当てられていない担当者はキャパシティ判定の対象にしない', () => {
        const insights = computeInsights(
            [est('t1', 160, { member: 'A' })],
            [act('t1', 160, { member: 'A' }), act('t2', 10, { member: 'B' })],
            capacity()
        );
        assert.equal(pick(insights, 'キャパシティに余裕がある担当者'), undefined,
            `見積の無い担当者を低稼働扱いしている: ${titles(insights).join(' / ')}`);
    });

    test('営業日数が取れない場合は判定しない', () => {
        const insights = computeInsights(
            [est('t1', 200, { member: 'A' }), est('t2', 200, { member: 'B' })],
            [act('t1', 200, { member: 'A' }), act('t2', 200, { member: 'B' })],
            capacity({ workingDays: 0 })
        );
        assert.equal(pick(insights, 'チームのキャパシティ超過'), undefined);
    });
});

describe('computeInsights() — 見積外の作業', () => {
    test('見積が無いタスクに実績が積まれていれば警告する', () => {
        const insights = computeInsights(
            [est('t1', 20)],
            [act('t1', 20), act('t2', 10)]
        );
        const warn = pick(insights, '見積外の作業');
        assert.ok(warn, `見積外作業の警告が出ていない: ${titles(insights).join(' / ')}`);
        assert.equal(warn.type, 'warning');
    });

    test('見積外の実績がごく僅かなら警告しない', () => {
        const insights = computeInsights(
            [est('t1', 20)],
            [act('t1', 20), act('t2', 2)]
        );
        assert.equal(pick(insights, '見積外の作業'), undefined);
    });
});

describe('computeInsights() — 全体の振る舞い', () => {
    test('データが無ければ空配列を返す', () => {
        assert.deepEqual(computeInsights([], []), []);
    });

    test('見積だけで実績が1件も無ければ全体評価を出さない', () => {
        const insights = computeInsights([est('t1', 20)], []);
        assert.equal(pick(insights, '優れた見積精度'), undefined);
        assert.equal(pick(insights, '見積が過大'), undefined);
    });

    test('警告が多発しても表示件数は6件までに抑える', () => {
        const estimates = [];
        const actuals = [];
        ['A', 'B', 'C', 'D'].forEach((m, i) => {
            estimates.push(est(`t${i}`, 20, { member: m, process: 'PG' }));
            actuals.push(act(`t${i}`, 60, { member: m, process: 'PG' }));
            estimates.push(est(`u${i}`, 20, { member: m, process: 'UI' }));
            actuals.push(act(`u${i}`, 4, { member: m, process: 'UI' }));
        });
        actuals.push(act('x1', 30, { member: 'A', process: 'ST' }));
        const insights = computeInsights(estimates, actuals);
        assert.ok(insights.length <= 6, `インサイトが多すぎる: ${insights.length}件`);
    });

    test('警告が無いときは全体評価を先頭に置く（工程の補足より先に読ませる）', () => {
        const insights = computeInsights(
            [est('t1', 20), est('t2', 20)],
            [act('t1', 20), act('t2', 20)]
        );
        assert.equal(insights[0].title, '優れた見積精度',
            `全体評価が先頭でない: ${titles(insights).join(' / ')}`);
    });

    test('警告を成功・情報より前に並べる', () => {
        const insights = computeInsights(
            [est('t1', 10, { member: 'A' }), est('t2', 10, { member: 'A' }),
                est('t3', 20, { member: 'B', process: 'UI' })],
            [act('t1', 10, { member: 'A' }), act('t2', 10, { member: 'A' }),
                act('t3', 40, { member: 'B', process: 'UI' })]
        );
        const firstNonWarning = insights.findIndex(i => i.type !== 'warning');
        if (firstNonWarning !== -1) {
            const rest = insights.slice(firstNonWarning);
            assert.ok(rest.every(i => i.type !== 'warning'),
                `warning が後方に混ざっている: ${insights.map(i => `${i.type}:${i.title}`).join(' / ')}`);
        }
    });
});
