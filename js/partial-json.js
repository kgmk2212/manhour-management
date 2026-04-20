/**
 * Lenient partial-JSON パーサ
 *
 * ストリーミング中の未完了 JSON 文字列を、閉じ括弧やクォートを補って
 * 「現時点で読める範囲」でパースする。
 *
 * 戦略:
 *   1. 末尾のトレイリングカンマや半端な記号を除去
 *   2. 開いている文字列を閉じる
 *   3. 開いている配列・オブジェクトを閉じる
 *   4. JSON.parse に通す
 *   5. 失敗したら undefined を返す
 *
 * 完璧ではないが、Ollama が format:SCHEMA で吐く構造化 JSON には十分。
 */

/**
 * 部分 JSON 文字列を lenient にパース
 * @param {string} input
 * @returns {object | undefined}
 */
export function parsePartialJson(input) {
    if (!input) return undefined;
    const trimmed = input.trimStart();
    if (!trimmed || trimmed[0] !== '{') return undefined;

    const completed = completeJson(trimmed);
    if (!completed) return undefined;
    try {
        return JSON.parse(completed);
    } catch {
        return undefined;
    }
}

/**
 * 開いたままの文字列/配列/オブジェクトを閉じて JSON として完成させる
 */
function completeJson(input) {
    const stack = [];
    let inString = false;
    let escaped = false;
    let lastNonWsIdx = -1;

    for (let i = 0; i < input.length; i++) {
        const c = input[i];

        if (!/\s/.test(c)) lastNonWsIdx = i;

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (c === '\\') {
                escaped = true;
            } else if (c === '"') {
                inString = false;
            }
            continue;
        }

        if (c === '"') {
            inString = true;
            continue;
        }
        if (c === '{' || c === '[') {
            stack.push(c);
        } else if (c === '}' || c === ']') {
            stack.pop();
        }
    }

    // 末尾が不完全な場合の処理
    let tail = input.slice(0, lastNonWsIdx + 1);

    // 文字列の途中で切れた場合は閉じる
    if (inString) {
        // エスケープ途中なら 1 文字落とす
        if (escaped) tail = tail.slice(0, -1);
        // ペンディングの \u エスケープ（不完全）も落とす
        tail = dropIncompleteEscape(tail);
        tail += '"';
    }

    // 先に pending value（"key":<末尾>）を埋めてから、カンマを除去
    tail = fillPendingValue(tail);
    tail = stripTrailingPunctuation(tail);

    // スタックを閉じる
    while (stack.length > 0) {
        const open = stack.pop();
        tail += open === '{' ? '}' : ']';
    }

    return tail;
}

/**
 * 末尾のカンマやコロンを削除（閉じ括弧を追加する前の後始末）
 */
function stripTrailingPunctuation(s) {
    // トレイリングカンマのみ除去（コロンは fillPendingValue で処理済み）
    return s.replace(/,\s*$/, '').replace(/,\s*([}\]])/g, '$1');
}

/**
 * "key":<ws>  のように値が来る前にスタックを閉じると不正 JSON になる。
 * 末尾に "key":  が残っていれば null を補完する
 */
function fillPendingValue(s) {
    // 最後のキー + コロン + （ホワイトスペースのみ）パターン
    // 例: {"foo":"bar","baz":   ← baz の値がまだない
    const m = s.match(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*$/);
    if (m) return s + 'null';
    return s;
}

/**
 * 末尾の \u エスケープが不完全な場合に落とす（\u, \u1, \u12, \u123）
 */
function dropIncompleteEscape(s) {
    return s.replace(/\\u[0-9a-fA-F]{0,3}$/, '')
            .replace(/\\$/, '');
}
