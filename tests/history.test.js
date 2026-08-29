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

    test('actual_add（addMeeting の全員分一括登録）の Undo/Redo が全件を対象にする', () => {
        // other-work.js の addMeeting は data.added（先頭1件）+ data.addedAll（全件）を渡す
        const meetings = [
            { id: 31, version: '', task: '打ち合わせ', member: 'A', hours: 1 },
            { id: 32, version: '', task: '打ち合わせ', member: 'B', hours: 1 },
            { id: 33, version: '', task: '打ち合わせ', member: 'C', hours: 1 },
        ];
        State.setActuals([...meetings]);
        History.pushAction({
            type: 'actual_add',
            data: { added: meetings[0], addedAll: meetings.map(m => ({ ...m })) },
        });

        History.undo();
        assert.equal(State.actuals.length, 0, 'Undo で3件すべて取り除かれること');

        History.redo();
        assert.deepEqual(State.actuals.map(a => a.id).sort(), [31, 32, 33], 'Redo で3件すべて復元されること');
    });

    test('actual_add（単件・addedAll なし）の Undo は従来どおり1件を取り除く', () => {
        const single = { id: 41, version: 'v1', task: 'T', member: 'A', hours: 2 };
        State.setActuals([single]);
        History.pushAction({ type: 'actual_add', data: { added: single } });

        History.undo();
        assert.equal(State.actuals.length, 0);

        History.redo();
        assert.deepEqual(State.actuals.map(a => a.id), [41]);
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

describe('actual_bulk_edit — 実績の一括編集・削除・複製の往復', () => {
    beforeEach(resetAll);
    const a1 = { id: 1, date: '2026-08-17', version: 'V2.3', task: 'T', process: 'PG', member: 'A', hours: 6 };
    const a2 = { id: 2, date: '2026-08-18', version: 'V2.3', task: 'T', process: 'PT', member: 'A', hours: 8 };

    test('編集: undo で before に戻り、redo で after になる', () => {
        const a1After = { ...a1, version: 'V2.4' };
        State.setActuals([a1After, a2]);
        History.pushAction({ type: 'actual_bulk_edit', data: { beforeActuals: [a1], afterActuals: [a1After] } });

        History.undo();
        assert.equal(State.actuals.find(a => a.id === 1).version, 'V2.3');
        History.redo();
        assert.equal(State.actuals.find(a => a.id === 1).version, 'V2.4');
        assert.equal(State.actuals.length, 2);
    });

    test('削除: undo で復元、redo で再削除', () => {
        State.setActuals([a2]);
        History.pushAction({ type: 'actual_bulk_edit', data: { deletedActuals: [a1] } });

        History.undo();
        assert.deepEqual(State.actuals.map(a => a.id).sort(), [1, 2]);
        History.redo();
        assert.deepEqual(State.actuals.map(a => a.id), [2]);
    });

    test('複製: undo で追加分が消え、redo で戻る', () => {
        const copy = { ...a1, id: 100, date: '2026-08-24' };
        State.setActuals([a1, a2, copy]);
        History.pushAction({ type: 'actual_bulk_edit', data: { afterActuals: [copy], addedActualIds: [100] } });

        History.undo();
        assert.deepEqual(State.actuals.map(a => a.id), [1, 2]);
        History.redo();
        assert.deepEqual(State.actuals.map(a => a.id).sort((x, y) => x - y), [1, 2, 100]);
    });

    test('削除 undo で同じ id が既に存在する場合は二重に追加しない', () => {
        // a1 が既に State に存在する状態で、削除の undo を実行
        State.setActuals([a1, a2]);
        History.pushAction({ type: 'actual_bulk_edit', data: { deletedActuals: [a1] } });

        History.undo();
        const a1Records = State.actuals.filter(a => a.id === 1);
        assert.equal(a1Records.length, 1, 'a1 が二重に追加されていないこと');
        assert.equal(State.actuals.length, 2);
    });

    test('複製 redo で追加分が既に存在する場合は上書きのみで二重に追加しない', () => {
        const copy = { ...a1, id: 100, date: '2026-08-24' };
        State.setActuals([a1, a2, copy]);
        History.pushAction({ type: 'actual_bulk_edit', data: { afterActuals: [copy], addedActualIds: [100] } });

        History.undo();
        assert.deepEqual(State.actuals.map(a => a.id), [1, 2]);
        // undo 後、copy が out-of-band で再追加されたと仮定
        State.actuals.push({ ...copy });
        History.redo();
        const ids = State.actuals.map(a => a.id).sort((x, y) => x - y);
        assert.deepEqual(ids, [1, 2, 100]);
        assert.equal(State.actuals.filter(a => a.id === 100).length, 1, 'id 100 が二重に追加されていないこと');
    });

    test('既存の estimate_bulk_edit は存在しない実績 id を無視する（従来挙動）', () => {
        // a1 が存在しない状態で estimate_bulk_edit の beforeActuals/afterActuals に a1 を含める
        State.setActuals([a2]);
        History.pushAction({
            type: 'estimate_bulk_edit',
            data: {
                beforeEstimates: [],
                afterEstimates: [],
                beforeActuals: [a1],
                afterActuals: [{ ...a1, version: 'V2.4' }],
            },
        });

        History.undo();
        assert.deepEqual(State.actuals.map(a => a.id), [2], 'undo 後も a1 が復活しないこと');
        History.redo();
        assert.deepEqual(State.actuals.map(a => a.id), [2], 'redo 後も a1 が復活しないこと');
    });
});
