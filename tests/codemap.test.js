// ============================================
// 仕様テスト: scripts/codemap.mjs
//   docs/CODEMAP.md を自動生成するコードマップ生成器。
//   「どの関数がどのファイルの何行にあるか」の索引を機械生成し、
//   探索のたびに js/ を総当たり Grep する無駄を減らすためのもの。
//   CI の鮮度チェック（--check）で誤情報化を防ぐため、
//   抽出は決定論的でなければならない。
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const { parseJsSource, parseHtmlIds, renderCodemap, countLines, isUpToDate } = await import('../scripts/codemap.mjs');

describe('isUpToDate() — 鮮度チェックは改行コードの差で誤検知しない', () => {
    // core.autocrlf=true の Windows では checkout 時に CODEMAP.md が CRLF になる一方、
    // 生成結果は常に LF。素朴な文字列比較だと毎回「最新ではない」と誤判定していた。
    test('内容が同じなら最新と判定する', () => {
        assert.equal(isUpToDate('# a\n- b\n', '# a\n- b\n'), true);
    });

    test('CRLF と LF の違いだけなら最新と判定する', () => {
        assert.equal(isUpToDate('# a\r\n- b\r\n', '# a\n- b\n'), true);
    });

    test('内容が違えば最新ではないと判定する', () => {
        assert.equal(isUpToDate('# a\n- b\n', '# a\n- c\n'), false);
    });

    test('ファイルが無い（空文字）場合は最新ではない', () => {
        assert.equal(isUpToDate('', '# a\n'), false);
    });
});

describe('countLines() — js/html/css で行数の数え方を揃える', () => {
    test('末尾改行による空要素を行として数えない', () => {
        assert.equal(countLines('a\nb\nc\n'), 3);
    });

    test('末尾改行が無いファイルも同じ行数になる', () => {
        assert.equal(countLines('a\nb\nc'), 3);
    });

    test('CRLF のファイルでも行数は同じ', () => {
        assert.equal(countLines('a\r\nb\r\nc\r\n'), 3);
    });

    test('空ファイルは 0 行', () => {
        assert.equal(countLines(''), 0);
    });

    test('parseJsSource の lines と一致する', () => {
        const src = 'export function a() {}\n\nexport const b = 1;\n';

        assert.equal(parseJsSource(src).lines, countLines(src));
    });
});

describe('parseJsSource() — エクスポート関数の抽出', () => {
    test('export function を名前と行番号で拾う', () => {
        const src = [
            'const x = 1;',
            'export function renderReport() {',
            '    return 1;',
            '}',
        ].join('\n');

        const result = parseJsSource(src);

        assert.deepEqual(result.exports, [{ name: 'renderReport', line: 2 }]);
    });

    test('export async function も拾う', () => {
        const src = 'export async function loadBackup(file) {\n}\n';

        const result = parseJsSource(src);

        assert.deepEqual(result.exports, [{ name: 'loadBackup', line: 1 }]);
    });

    test('export const も拾う', () => {
        const src = 'export const DEFAULT_HOURS = 7.5;\n';

        const result = parseJsSource(src);

        assert.deepEqual(result.exports, [{ name: 'DEFAULT_HOURS', line: 1 }]);
    });

    test('複数のエクスポートを出現順に並べる', () => {
        const src = [
            'export function a() {}',
            '',
            'export const b = 2;',
            'export async function c() {}',
        ].join('\n');

        const result = parseJsSource(src);

        assert.deepEqual(result.exports.map(e => e.name), ['a', 'b', 'c']);
        assert.deepEqual(result.exports.map(e => e.line), [1, 3, 4]);
    });
});

describe('parseJsSource() — window 公開関数の抽出', () => {
    test('window.X = で公開される関数を globals に入れる', () => {
        const src = [
            'function editActual(id) {}',
            'window.editActual = editActual;',
        ].join('\n');

        const result = parseJsSource(src);

        assert.deepEqual(result.globals, [{ name: 'editActual', line: 2 }]);
        assert.deepEqual(result.exports, []);
    });

    test('window 公開は定義行ではなく代入行の番号を返す', () => {
        const src = ['', '', 'window.saveEstimate = saveEstimate;'].join('\n');

        const result = parseJsSource(src);

        assert.equal(result.globals[0].line, 3);
    });
});

describe('parseJsSource() — 偽陽性を拾わない', () => {
    test('コメント行に書かれた export function は無視する', () => {
        const src = [
            '// export function oldName() は削除済み',
            ' * export function docExample() {}',
            'export function realOne() {}',
        ].join('\n');

        const result = parseJsSource(src);

        assert.deepEqual(result.exports, [{ name: 'realOne', line: 3 }]);
    });

    test('インデントされた（＝ネストした）定義は拾わない', () => {
        const src = [
            'export function outer() {',
            '    window.inner = inner;',
            '}',
        ].join('\n');

        const result = parseJsSource(src);

        assert.deepEqual(result.exports.map(e => e.name), ['outer']);
        assert.deepEqual(result.globals, []);
    });
});

describe('parseJsSource() — ファイル冒頭の役割コメント', () => {
    test('バナーコメントの本文行を title にする', () => {
        const src = [
            '// ============================================',
            '// 実績管理モジュール (actual.js)',
            '// ============================================',
            'export function a() {}',
        ].join('\n');

        const result = parseJsSource(src);

        assert.equal(result.title, '実績管理モジュール (actual.js)');
    });

    test('冒頭がコメントでなければ title は空になる', () => {
        const src = 'export function a() {}\n';

        const result = parseJsSource(src);

        assert.equal(result.title, '');
    });
});

describe('parseJsSource() — 改行コードに依存しない', () => {
    // CI(Linux/LF) と Windows working tree(CRLF) で抽出結果が食い違うと、
    // 生成物が環境依存になり CI の鮮度チェックが永久に一致しなくなる。
    const lf = [
        '// ============================================',
        '// 実績管理モジュール (actual.js)',
        '// ============================================',
        'export function addActual() {}',
        'window.editActual = editActual;',
    ].join('\n') + '\n';
    const crlf = lf.replace(/\n/g, '\r\n');

    test('CRLF のソースでも title を抽出する', () => {
        assert.equal(parseJsSource(crlf).title, '実績管理モジュール (actual.js)');
    });

    test('CRLF と LF で完全に同じ結果を返す', () => {
        assert.deepEqual(parseJsSource(crlf), parseJsSource(lf));
    });

    test('CRLF でも export / window を取りこぼさない', () => {
        const r = parseJsSource(crlf);

        assert.deepEqual(r.exports, [{ name: 'addActual', line: 4 }]);
        assert.deepEqual(r.globals, [{ name: 'editActual', line: 5 }]);
    });
});

describe('parseHtmlIds() — 改行コードに依存しない', () => {
    test('CRLF でも LF と同じ結果を返す', () => {
        const lf = '<div id="a">\n<span id="b"></span>\n';

        assert.deepEqual(parseHtmlIds(lf.replace(/\n/g, '\r\n')), parseHtmlIds(lf));
    });
});

describe('parseJsSource() — 行数', () => {
    test('lines は総行数を返す', () => {
        const src = 'a\nb\nc\n';

        const result = parseJsSource(src);

        assert.equal(result.lines, 3);
    });
});

describe('parseHtmlIds()', () => {
    test('id 属性を行番号付きで拾う', () => {
        const src = [
            '<div class="tabs">',
            '  <div id="quickActualForm" class="quick-input-form">',
            '</div>',
        ].join('\n');

        assert.deepEqual(parseHtmlIds(src), [{ id: 'quickActualForm', line: 2 }]);
    });

    test('同じ id が複数回現れても最初の1件だけ返す', () => {
        const src = [
            '<div id="dup"></div>',
            '<div id="dup"></div>',
        ].join('\n');

        assert.deepEqual(parseHtmlIds(src), [{ id: 'dup', line: 1 }]);
    });

    test('1行に複数の id があればすべて拾う', () => {
        const src = '<div id="a"><span id="b"></span></div>';

        assert.deepEqual(parseHtmlIds(src).map(e => e.id), ['a', 'b']);
    });
});

describe('renderCodemap() — 決定論的な出力', () => {
    const input = {
        jsFiles: [
            { path: 'js/actual.js', title: '実績管理モジュール', lines: 100, exports: [{ name: 'addActual', line: 10 }], globals: [{ name: 'editActual', line: 20 }] },
        ],
        htmlFiles: [
            { path: 'index.html', lines: 50, ids: [{ id: 'quick', line: 5 }] },
        ],
        cssFiles: [{ path: 'style.css', lines: 30 }],
    };

    test('同じ入力からは常に同じ文字列を生成する', () => {
        assert.equal(renderCodemap(input), renderCodemap(input));
    });

    test('関数名と行番号が出力に含まれる', () => {
        const out = renderCodemap(input);

        assert.match(out, /addActual:10/);
        assert.match(out, /editActual:20/);
        assert.match(out, /quick:5/);
    });

    test('手編集を禁じる警告を先頭に含む', () => {
        assert.match(renderCodemap(input), /自動生成/);
    });

    test('生成日時など実行ごとに変わる値を含めない（CI の差分チェックを壊さないため）', () => {
        const out = renderCodemap(input);

        assert.doesNotMatch(out, /\d{4}-\d{2}-\d{2}/);
    });
});
