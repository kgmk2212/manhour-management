// ============================================
// 回帰テスト: js/history.js の Undo/Redo 逆操作
//   2026-08-19 監査で確定したバグの再発防止:
//   - `State.estimates = ...`（ESM 名前空間への代入）は strict mode で
//     TypeError になるため、undo(estimate_add) / redo(estimate_delete) /
//     undo(task_edit の追加行除去) が実行時に破綻していた
//   - 未知の action type は黙って消費され、Undo が無反応になっていた
//
//   history.js はモジュール評価時に DOM / localStorage を触らないが、
//   pushAction → saveHistory が localStorage を、undo/redo が
//   document.getElementById（履歴モーダル更新）と window.*（再描画
//   ファンアウト）を関数実行時に参照するため、最小限のポリフィルを
//   import 前にグローバルへ用意する（js/ 配下のソースは変更しない）。
// ============================================
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- ポリフィル（import より先に評価される必要があるため top-level） ---
globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
// Utils.showAlert は DOM 不在時に alert() へフォールバックする
globalThis.alert = () => {};

const State = await import('../js/state.js');
const History = await import('../js/history.js');

/** 各テストを空スタック・固定データから始める */
function resetAll() {
    globalThis.localStorage._map.clear();
    History.loadHistory(); // localStorage が空なので両スタックが [] になる
    State.setEstimates([]);
    State.setActuals([]);
    State.setRemainingEstimates([]);
    State.setNextRecordId(1000);
}

describe('applyUndo/applyRedo — 見積系の逆操作が State setter 経由で成立する', () => {
    beforeEach(resetAll);

    test('estimate_add の Undo で追加した見積が取り除かれる', () => {
        const added = { id: 1, version: 'v1', task: 'T', process: 'PG', hours: 8 };
        State.setEstimates([added]);
        History.pushAction({ type: 'estimate_add', data: { added: [added] } });

        History.undo();

        assert.equal(State.estimates.length, 0);
    });

    test('estimate_delete の Redo で削除が再適用される（remainingEstimates も含む）', () => {
        const del = { id: 2, version: 'v1', task: 'T', process: 'PG', hours: 4 };
        const rem = { id: 3, version: 'v1', task: 'T', process: 'PG', member: 'A', hours: 2 };
        // 削除直後の状態を再現（実データからは既に消えている）
        State.setEstimates([]);
        State.setRemainingEstimates([]);
        History.pushAction({
            type: 'estimate_delete',
            data: { deleted: [del], deletedRemaining: [rem] },
        });

        History.undo(); // 復元（in-place push 経路）
        assert.equal(State.estimates.length, 1);
        assert.equal(State.remainingEstimates.length, 1);

        History.redo(); // 再削除（filter 経路 = 旧実装では TypeError）
        assert.equal(State.estimates.length, 0);
        assert.equal(State.remainingEstimates.length, 0);
    });

    test('estimate_add_batch（見積編集時の担当者追加）の Undo で追加分が取り除かれる', () => {
        const kept = { id: 5, version: 'v1', task: 'T', process: 'PG', hours: 8 };
        const added = { id: 6, version: 'v1', task: 'T', process: 'PG', member: 'B', hours: 4 };
        State.setEstimates([kept, added]);
        History.pushAction({ type: 'estimate_add_batch', data: { added: [added] } });

        History.undo();
        assert.deepEqual(State.estimates.map(e => e.id), [5]);

        History.redo();
        assert.deepEqual(State.estimates.map(e => e.id).sort(), [5, 6]);
    });

    test('task_edit の Undo で編集時に新規追加された見積行が除去される', () => {
        const kept = { id: 10, version: 'v1', task: 'T', process: 'PG', hours: 8 };
        const addedInEdit = { id: 11, version: 'v1', task: 'T', process: 'PT', hours: 4 };
        State.setEstimates([kept, addedInEdit]);
        History.pushAction({
            type: 'task_edit',
            data: {
                beforeEstimates: [{ ...kept }],
                afterEstimates: [{ ...kept }],
                addedEstimateIds: [11],
            },
        });

        History.undo();

        assert.deepEqual(State.estimates.map(e => e.id), [10]);
    });
});

describe('applyUndo/applyRedo — 未知の action type', () => {
    beforeEach(resetAll);

    test('未知 type の Undo は console.warn で可視化される（例外にはならない）', () => {
        const warns = [];
        const origWarn = console.warn;
        console.warn = (...args) => { warns.push(args.join(' ')); };
        try {
            State.setEstimates([{ id: 20 }]);
            History.pushAction({ type: 'totally_unknown_type', data: {} });
            History.undo();
        } finally {
            console.warn = origWarn;
        }

        assert.equal(State.estimates.length, 1); // データは無傷
        assert.ok(
            warns.some(w => w.includes('totally_unknown_type')),
            `console.warn に未知 type 名が含まれること（実際: ${JSON.stringify(warns)}）`
        );
        // 適用不可のエントリはスタックから消費されない（履歴ズレ防止）
        assert.equal(History.canUndo(), true);
    });
});
