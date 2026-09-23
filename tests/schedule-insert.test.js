// ============================================
// 回帰テスト: js/schedule-insert.js
//   割り込みドロップの計画 planInsertDrop（ドミノ式の押し出し）を検証する。
//   schedule-interruption.js は schedule.js 経由で history.js / schedule-render.js /
//   estimate.js / report.js / utils.js を推移的に import するが、いずれもモジュール
//   評価時に DOM を触らないため、history.test.js と同じ最小ポリフィルで足りる。
// ============================================
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
// showToast（schedule.js）が document.createElement / document.body を使うため、
// handleScheduleDrag 等 schedule.js の関数呼び出しに耐えられる最小限のフェイク要素を用意する。
function createFakeElement() {
    return {
        className: '',
        innerHTML: '',
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        remove() {},
        setAttribute() {},
        getAttribute: () => null,
    };
}
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => [],
    createElement: () => createFakeElement(),
    body: createFakeElement(),
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
globalThis.alert = () => {};

const { planInsertDrop } = await import('../js/schedule-insert.js');

// node テストでは祝日ライブラリが無いので、平日＝営業日。2026-09-14 は月曜。
const M = '山田';
const sc = (id, startDate, endDate, hours, extra = {}) => ({
    id, version: 'V1', task: id, process: 'PG', member: M, startDate, endDate,
    estimatedHours: hours, status: 'pending', interruptions: [], ...extra
});
const moveOf = (plan, id) => plan.moves.find(m => m.scheduleId === id);

describe('planInsertDrop', () => {
    test('重ならない位置なら collided=false で何も押さない', () => {
        const all = [sc('X', '2026-09-28', '2026-09-28', 8), sc('A', '2026-09-14', '2026-09-15', 16)];
        const plan = planInsertDrop('X', '2026-09-16', all);
        assert.equal(plan.collided, false);
        assert.deepEqual(plan.moves, []);
    });

    test('ぶつかった予定だけ押し、空きがあればそこで止まる', () => {
        const all = [
            sc('A', '2026-09-14', '2026-09-15', 16),
            sc('B', '2026-09-21', '2026-09-22', 16), // A と B の間は 16〜18 の3日空き
            sc('X', '2026-09-28', '2026-09-28', 8),
        ];
        const plan = planInsertDrop('X', '2026-09-14', all);
        assert.equal(plan.collided, true);
        assert.equal(plan.placedStart, '2026-09-14');
        assert.deepEqual([moveOf(plan, 'A').newStartDate, moveOf(plan, 'A').newEndDate], ['2026-09-15', '2026-09-16']);
        assert.equal(moveOf(plan, 'B'), undefined, 'B は空きが吸収するので動かない');
        assert.equal(plan.pushedCount, 1);
    });

    test('詰まっている予定は連鎖して押す', () => {
        const all = [
            sc('A', '2026-09-14', '2026-09-15', 16),
            sc('B', '2026-09-16', '2026-09-17', 16),
            sc('X', '2026-09-28', '2026-09-29', 16),
        ];
        const plan = planInsertDrop('X', '2026-09-14', all);
        assert.equal(moveOf(plan, 'A').newStartDate, '2026-09-16');
        assert.equal(moveOf(plan, 'B').newStartDate, '2026-09-18');
        assert.equal(moveOf(plan, 'B').newEndDate, '2026-09-21'); // 金→土日を飛ばして月
        assert.equal(plan.pushedCount, 2);
    });

    test('X が元から重なっていた予定（意図した並行）は衝突にしない', () => {
        const all = [
            sc('P', '2026-09-14', '2026-09-18', 40),
            sc('X', '2026-09-15', '2026-09-15', 8),
        ];
        const plan = planInsertDrop('X', '2026-09-16', all);
        assert.equal(plan.collided, false);
    });

    test('押された予定と元から並行していた予定は、押された予定に押されない', () => {
        const all = [
            sc('A', '2026-09-14', '2026-09-15', 16),
            sc('Q', '2026-09-15', '2026-09-16', 16), // A と元から重なっている
            sc('X', '2026-09-28', '2026-09-28', 8),
        ];
        const plan = planInsertDrop('X', '2026-09-14', all);
        // X(14) は A と Q のどちらとも新しく重なる？ X は 14 のみ → A だけと重なる
        assert.equal(moveOf(plan, 'A').newStartDate, '2026-09-15');
        assert.equal(moveOf(plan, 'Q'), undefined, 'Q は A と元から並行なので押されない');
    });

    test('完了済みの予定は押さず、衝突相手にもしない', () => {
        const all = [
            sc('D', '2026-09-14', '2026-09-15', 16, { status: 'completed' }),
            sc('X', '2026-09-28', '2026-09-28', 8),
        ];
        const plan = planInsertDrop('X', '2026-09-14', all);
        assert.equal(plan.collided, false);
    });

    test('前から続いている予定の途中に落とすと、その予定の直後に寄せてから後ろを押す', () => {
        const all = [
            sc('A', '2026-09-14', '2026-09-16', 24),
            sc('B', '2026-09-17', '2026-09-17', 8),
            sc('X', '2026-09-28', '2026-09-28', 8),
        ];
        const plan = planInsertDrop('X', '2026-09-15', all);
        assert.equal(plan.placedStart, '2026-09-17');
        assert.equal(plan.snappedAfterId, 'A');
        assert.equal(moveOf(plan, 'A'), undefined);
        assert.equal(moveOf(plan, 'B').newStartDate, '2026-09-18');
    });

    test('他の担当者の予定は動かさない', () => {
        const all = [
            sc('O', '2026-09-14', '2026-09-15', 16, { member: '佐藤' }),
            sc('X', '2026-09-28', '2026-09-28', 8),
        ];
        assert.equal(planInsertDrop('X', '2026-09-14', all).collided, false);
    });

    test('押された予定に連結中の後工程があれば一緒に追従する', () => {
        const all = [
            sc('A', '2026-09-14', '2026-09-15', 16, { task: 'T', process: 'PG' }),
            sc('A2', '2026-09-16', '2026-09-16', 8, { task: 'T', process: 'PT' }), // A に連結
            sc('X', '2026-09-28', '2026-09-28', 8),
        ];
        const plan = planInsertDrop('X', '2026-09-14', all);
        assert.equal(moveOf(plan, 'A').newEndDate, '2026-09-16');
        assert.equal(moveOf(plan, 'A2').newStartDate, '2026-09-17');
    });

    test('X に連結中の後工程は X に追従し、押し出し件数には数えない', () => {
        const all = [
            sc('X', '2026-09-28', '2026-09-28', 8, { task: 'T', process: 'IT' }),
            sc('X2', '2026-09-29', '2026-09-29', 8, { task: 'T', process: 'ST' }),
            sc('A', '2026-09-14', '2026-09-14', 8),
        ];
        const plan = planInsertDrop('X', '2026-09-14', all);
        assert.equal(moveOf(plan, 'X2').newStartDate, '2026-09-15');
        // A(14) は X(14) に押されて 15 へ → X2(15) と重なるので X2 の後ろ 16 へ
        assert.equal(moveOf(plan, 'A').newStartDate, '2026-09-16');
        assert.equal(plan.pushedCount, 1);
    });
});
