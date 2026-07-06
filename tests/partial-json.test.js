// ============================================
// 特性テスト: js/partial-json.js
//   ストリーミング中の未完了JSON文字列を lenient にパースする
//   parsePartialJson() の「現在の振る舞い」を固定する。
//   期待値は `node -e "import('./js/partial-json.js')..."` で実際の出力を
//   観測してから書き写したもの。
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// 依存なし・DOM操作なしのモジュールなのでポリフィル不要
const { parsePartialJson } = await import('../js/partial-json.js');

describe('parsePartialJson() — 空/不正入力', () => {
    test('空文字・null・undefinedはundefinedを返す', () => {
        assert.equal(parsePartialJson(''), undefined);
        assert.equal(parsePartialJson(null), undefined);
        assert.equal(parsePartialJson(undefined), undefined);
    });

    test('"{"で始まらない入力（配列・自由文字列）はundefinedを返す', () => {
        assert.equal(parsePartialJson('not json at all'), undefined);
        assert.equal(parsePartialJson('[1,2,3]'), undefined);
    });

    test('先頭の空白は無視して"{"始まりと判定する', () => {
        assert.deepEqual(parsePartialJson('   {"a":1}   '), { a: 1 });
    });
});

describe('parsePartialJson() — 完全なJSON', () => {
    test('空オブジェクト', () => {
        assert.deepEqual(parsePartialJson('{}'), {});
    });

    test('完全なフラットオブジェクト', () => {
        assert.deepEqual(parsePartialJson('{"a":1,"b":2}'), { a: 1, b: 2 });
    });
});

describe('parsePartialJson() — 途中で切れたJSON', () => {
    test('オブジェクトが"{"のみで切れている場合は空オブジェクトを補完', () => {
        assert.deepEqual(parsePartialJson('{'), {});
    });

    test('値がまだ来ていないキー("key":で切れる)はnullを補完する', () => {
        assert.deepEqual(parsePartialJson('{"a":1,"b":'), { a: 1, b: null });
        assert.deepEqual(parsePartialJson('{"a":'), { a: null });
    });

    test('文字列値の途中で切れた場合は閉じクォートを補って値を確定する', () => {
        assert.deepEqual(parsePartialJson('{"a":"hello'), { a: 'hello' });
    });

    test('配列の途中で切れた場合は閉じ括弧を補う', () => {
        assert.deepEqual(parsePartialJson('{"a":[1,2,3'), { a: [1, 2, 3] });
    });

    test('ネストしたオブジェクトの途中で切れた場合も閉じ括弧を補う', () => {
        assert.deepEqual(parsePartialJson('{"a":{"b":1'), { a: { b: 1 } });
    });

    test('ネストした配列内オブジェクトの途中で切れた場合も復元する', () => {
        assert.deepEqual(parsePartialJson('{"list":[{"x":1},{"y":2'), { list: [{ x: 1 }, { y: 2 }] });
    });

    test('末尾のトレイリングカンマは除去される', () => {
        assert.deepEqual(parsePartialJson('{"a":1,}'), { a: 1 });
    });

    // 現状の挙動（要確認）: 文字列値の途中でバックスラッシュ（エスケープ開始）
    // だけが来て切れた場合、そのバックスラッシュごと1文字落として閉じる。
    // 結果として "esc\" の末尾の "\" が失われ "esc" になる。ストリーミング表示
    // 用途では許容範囲だが、エスケープ文字そのものを保持したい用途では
    // データ欠落になりうる。バグ修正はせず、この挙動をそのまま固定する。
    test('文字列末尾がエスケープ開始("\\")で切れた場合はエスケープごと落として閉じる（現状の挙動）', () => {
        assert.deepEqual(parsePartialJson('{"a":"esc\\'), { a: 'esc' });
    });

    // 現状の挙動（要確認）: \u エスケープが不完全（"\u00"など）な場合、
    // その不完全なエスケープシーケンス自体を切り捨てて閉じる。
    test('不完全な\\uエスケープはシーケンスごと切り捨てられる（現状の挙動）', () => {
        assert.deepEqual(parsePartialJson('{"a":"unicode \\u00'), { a: 'unicode ' });
    });
});
