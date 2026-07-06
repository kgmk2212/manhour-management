// ============================================
// 特性テスト: js/state.js
//   汎用一意IDカウンター nextId() / setNextRecordId() の振る舞いを固定する。
//   state.js のsetter群は `window.xxx = value` を副作用として実行するため、
//   Node実行時には `window` がグローバルに存在する必要がある。
//   これは state.js 自体を変更せず、テスト側で最小限のポリフィルを
//   用意することで対応する（グローバルCLAUDE.mdの「絶対ルール」通り
//   js/配下のソースは一切変更していない）。
//
//   注意: state.js の nextRecordId は ESM モジュールの単一インスタンスで
//   あり、テスト間で状態が共有される（プロセス内でキャッシュされるため）。
//   そのため各テストは末尾で setNextRecordId() により次のテストに影響しない
//   状態へ明示的にリセットしている。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    // state.js の setter は window.xxx = value を実行するため必須のポリフィル
    globalThis.window = globalThis;
});

const { nextId, setNextRecordId, nextRecordId } = await import('../js/state.js');

describe('nextId() — 単調増加する一意ID発番', () => {
    test('初期値は1から始まる（モジュール初期状態を観測した値）', () => {
        // このテストはファイル内で最初に実行される前提（他テストが先に
        // カウンタを進めていない状態）。node:test はデフォルトでファイル内の
        // describe/test を定義順に直列実行するため、この前提は成立する。
        assert.equal(nextRecordId, 1);
    });

    test('呼び出すたびに1ずつ増える連番を返す', () => {
        setNextRecordId(1); // 前提を明示的に固定
        assert.equal(nextId(), 1);
        assert.equal(nextId(), 2);
        assert.equal(nextId(), 3);
    });

    test('nextId()の戻り値は呼び出し時点のカウンタ値そのもの（呼び出し後にインクリメントされる）', () => {
        setNextRecordId(10);
        const first = nextId();
        assert.equal(first, 10);
        // 呼び出し後、モジュールの nextRecordId（ライブバインディング）は11に進んでいる
        assert.equal(nextId(), 11);
    });

    test('setNextRecordId() でカウンタを任意の値に再初期化できる（storage.jsのロード時復元用途）', () => {
        setNextRecordId(100);
        assert.equal(nextId(), 100);
        assert.equal(nextId(), 101);
    });

    test('setNextRecordId() は window.nextRecordId にも同じ値を反映する（レガシーグローバル互換のため）', () => {
        setNextRecordId(42);
        assert.equal(globalThis.window.nextRecordId, 42);
        nextId();
        assert.equal(globalThis.window.nextRecordId, 43);
    });
});
