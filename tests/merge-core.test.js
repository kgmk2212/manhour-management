// ============================================
// 特性テスト: js/merge-core.js
//   差分マージエンジン detectDiff() と、その正規化ヘルパー s()/normalizeDate()/roundNum()
//   の「現在の振る舞い」をそのまま固定する。
//   期待値はすべて `node -e "import('./js/merge-core.js')..."` で実際の出力を
//   観測してから書き写したものであり、仕様からの推測値ではない。
//   バグらしき挙動を見つけた場合もコードは直さず、コメントで
//   「現状の挙動（要確認）」と明記した上で実際の値を assert する。
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// merge-core.js は import 時点では document/window に触れない
// （el()/openMergePreview() 等 DOM 操作は呼び出し時のみ発生し、今回のテスト対象
//   である detectDiff/s/normalizeDate/roundNum は純粋関数なのでポリフィル不要）。
const { detectDiff, s, normalizeDate, roundNum } = await import('../js/merge-core.js');

// 実運用（merge-json.js の実績セクション）と同じ形の spec。
// keyOf: 日付+担当者+版数+タスク+工程で一意キーを作る
// valueEq: 工数(hours)が丸め後一致するか
function actualLikeSpec() {
    return {
        keyOf: r => [normalizeDate(r.date), s(r.member), s(r.version), s(r.task), s(r.process)].join('|'),
        valueEq: (a, b) => roundNum(a.hours) === roundNum(b.hours),
        emitChanged: true
    };
}

describe('s() — 比較用文字列正規化', () => {
    test('null/undefined/空文字は空文字になる', () => {
        assert.equal(s(null), '');
        assert.equal(s(undefined), '');
        assert.equal(s(''), '');
    });

    test('前後空白をtrimする', () => {
        assert.equal(s('  abc  '), 'abc');
    });

    test('全角文字はNFKC正規化で半角化・全角空白もtrimされる', () => {
        assert.equal(s('ａｂｃ　'), 'abc');
    });

    test('数値・真偽値は文字列化される', () => {
        assert.equal(s(123), '123');
        assert.equal(s(0), '0');
        assert.equal(s(false), 'false');
        assert.equal(s(true), 'true');
    });

    test('配列はjoin(",")相当の文字列表現になる（String()の挙動）', () => {
        assert.equal(s([1, 2, 3]), '1,2,3');
    });

    test('プレーンオブジェクトは"[object Object]"になる', () => {
        assert.equal(s({}), '[object Object]');
    });
});

describe('normalizeDate() — 日付文字列を YYYY-MM-DD に正規化', () => {
    test('null/undefined/空文字は空文字', () => {
        assert.equal(normalizeDate(null), '');
        assert.equal(normalizeDate(undefined), '');
        assert.equal(normalizeDate(''), '');
    });

    test('既にYYYY-MM-DD形式はそのまま', () => {
        assert.equal(normalizeDate('2026-07-05'), '2026-07-05');
    });

    test('スラッシュ区切り・ゼロ埋めなしをゼロ埋めYYYY-MM-DDに変換', () => {
        assert.equal(normalizeDate('2026/7/5'), '2026-07-05');
        assert.equal(normalizeDate('2026-7-5'), '2026-07-05');
    });

    test('時刻付き文字列は日付部分のみ抽出（Tセパレータ・スペースセパレータ両対応）', () => {
        assert.equal(normalizeDate('2026-07-05T10:00:00Z'), '2026-07-05');
        assert.equal(normalizeDate('2026-07-05 12:34'), '2026-07-05');
    });

    test('Dateオブジェクトはローカル日時のYYYY-MM-DDに変換', () => {
        assert.equal(normalizeDate(new Date(2026, 6, 5)), '2026-07-05');
    });

    test('日付として解釈できない文字列はそのまま返す（フォールバック）', () => {
        assert.equal(normalizeDate('not-a-date'), 'not-a-date');
    });
});

describe('roundNum() — 数値を小数2桁に丸める（比較用）', () => {
    test('null/undefined/空文字/非数値文字列は0になる', () => {
        assert.equal(roundNum(null), 0);
        assert.equal(roundNum(undefined), 0);
        assert.equal(roundNum(''), 0);
        assert.equal(roundNum('abc'), 0);
    });

    test('数値・数値文字列は小数2桁に丸められる', () => {
        assert.equal(roundNum(3.456), 3.46);
        assert.equal(roundNum('3.456'), 3.46);
        assert.equal(roundNum('  5  '), 5);
        assert.equal(roundNum(0), 0);
    });

    // 現状の挙動（要確認）: 浮動小数点表現の誤差により、素朴には
    // 「3.005 は四捨五入で3.00になりそう」「-1.005 は -1.01になりそう」と
    // 予想されるが、実際は Math.round(v*100)/100 の2進浮動小数点誤差の影響で
    // 3.005 -> 3.01、-1.005 -> -1 になる。バグではなく Math.round の既知の
    // 浮動小数点特性であり、意図的に修正しない前提でこの値を固定する。
    test('浮動小数点誤差により3.005は3.01、-1.005は-1に丸められる（現状の挙動）', () => {
        assert.equal(roundNum(3.005), 3.01);
        assert.equal(roundNum(-1.005), -1);
    });

    // 現状の挙動（要確認）: カンマ区切りの数値文字列（"5,000"）はNumber()が
    // NaNを返すため0にフォールバックする。3桁区切り表記の入力は非対応。
    test('カンマ区切り数値文字列は非対応で0になる（現状の挙動）', () => {
        assert.equal(roundNum('5,000'), 0);
    });
});

describe('detectDiff() — 差分検出（2パス照合）', () => {
    test('全件追加: 既存が空なら全件added', () => {
        const result = detectDiff(
            [{ task: 'A', hours: 3 }],
            [],
            { keyOf: r => r.task, valueEq: (a, b) => a.hours === b.hours, emitChanged: true }
        );
        assert.deepEqual(result, {
            added: [{ task: 'A', hours: 3 }],
            changed: [],
            unchanged: [],
            removed: []
        });
    });

    test('全件削除: 取込が空なら既存が全件removed', () => {
        const result = detectDiff(
            [],
            [{ task: 'A', hours: 3 }],
            { keyOf: r => r.task, valueEq: (a, b) => a.hours === b.hours, emitChanged: true }
        );
        assert.deepEqual(result, {
            added: [],
            changed: [],
            unchanged: [],
            removed: [{ task: 'A', hours: 3 }]
        });
    });

    test('完全一致（キー+値）はunchanged', () => {
        const result = detectDiff(
            [{ task: 'A', hours: 3 }],
            [{ task: 'A', hours: 3 }],
            { keyOf: r => r.task, valueEq: (a, b) => a.hours === b.hours, emitChanged: true }
        );
        assert.deepEqual(result, {
            added: [],
            changed: [],
            unchanged: [{ existing: { task: 'A', hours: 3 }, incoming: { task: 'A', hours: 3 } }],
            removed: []
        });
    });

    test('同一キーで値が異なる場合はchanged（emitChanged:true）', () => {
        const result = detectDiff(
            [{ task: 'A', hours: 5 }],
            [{ task: 'A', hours: 3 }],
            { keyOf: r => r.task, valueEq: (a, b) => a.hours === b.hours, emitChanged: true }
        );
        assert.deepEqual(result, {
            added: [],
            changed: [{ existing: { task: 'A', hours: 3 }, incoming: { task: 'A', hours: 5 } }],
            unchanged: [],
            removed: []
        });
    });

    test('emitChanged:false の場合、値が異なってもunchanged扱い（見積等の単一キー用途）', () => {
        const result = detectDiff(
            [{ task: 'A', hours: 5 }],
            [{ task: 'A', hours: 3 }],
            { keyOf: r => r.task, valueEq: (a, b) => a.hours === b.hours, emitChanged: false }
        );
        assert.deepEqual(result, {
            added: [],
            changed: [],
            unchanged: [{ existing: { task: 'A', hours: 3 }, incoming: { task: 'A', hours: 5 } }],
            removed: []
        });
    });

    test('両方空配列なら全て空', () => {
        const result = detectDiff([], [], { keyOf: r => r.task, valueEq: (a, b) => a.hours === b.hours, emitChanged: true });
        assert.deepEqual(result, { added: [], changed: [], unchanged: [], removed: [] });
    });

    // 過去のバグ修正対象: 同一キーで工数が異なる複数実績が併存する場合、
    // greedy な1パス照合だと本来完全一致するペアが横取りされ、
    // 「3h→5h の変更」+「5hの削除」のような誤ペアリングを起こしていた。
    // 2パス照合（Pass1で完全一致を先取り→Pass2で残りを照合）によりこれを防ぐ。
    test('同一キー・複数実績: 完全一致するペアを優先し誤ペアリングを避ける（2パス照合の中核挙動）', () => {
        // 既存: hours=3 と hours=5 の2件が同一キーで併存
        // 取込: hours=5（既存と完全一致） と hours=7（新しい値）
        // 期待: 5同士がunchangedで先取りされ、残った7が残った3とchangedになる
        //       （3が誤って"削除"、7が誤って"追加"にはならない）
        const existing = [{ task: 'A', hours: 3 }, { task: 'A', hours: 5 }];
        const incoming = [{ task: 'A', hours: 5 }, { task: 'A', hours: 7 }];
        const result = detectDiff(incoming, existing, {
            keyOf: r => r.task, valueEq: (a, b) => a.hours === b.hours, emitChanged: true
        });
        assert.deepEqual(result, {
            added: [],
            changed: [{ existing: { task: 'A', hours: 3 }, incoming: { task: 'A', hours: 7 } }],
            unchanged: [{ existing: { task: 'A', hours: 5 }, incoming: { task: 'A', hours: 5 } }],
            removed: []
        });
    });

    test('実運用相当spec: 日付フォーマット違い・全角空白混じりの表記ゆれはkeyOf内のnormalizeDate/sで吸収されunchangedになる', () => {
        const existing = [{ date: '2026-07-01', member: 'kmori', version: 'v1', task: 'T1', process: 'PG', hours: 3 }];
        const incoming = [{ date: '2026/07/01', member: '  kmori　', version: 'v1', task: 'T1', process: 'PG', hours: 3 }];
        const result = detectDiff(incoming, existing, actualLikeSpec());
        assert.deepEqual(result, {
            added: [],
            changed: [],
            unchanged: [{ existing: existing[0], incoming: incoming[0] }],
            removed: []
        });
    });
});
