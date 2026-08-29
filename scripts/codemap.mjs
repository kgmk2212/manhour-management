#!/usr/bin/env node
// ============================================
// codemap.mjs — docs/CODEMAP.md 生成器
//   「どの関数がどのファイルの何行にあるか」の索引を機械生成する。
//   目的は探索コストの削減: js/ を総当たり Grep する代わりに
//   CODEMAP.md を 1 回 Grep すれば場所が分かる状態を保つ。
//   手書きの CODEBASE_STRUCTURE.md が誤情報化した反省から、
//   索引は必ず生成物とし CI(--check) で鮮度を守る。
//
//   使い方:
//     node scripts/codemap.mjs           docs/CODEMAP.md を書き出す
//     node scripts/codemap.mjs --check   生成結果と差があれば exit 1（CI用）
// ============================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = path.join(ROOT, 'docs', 'CODEMAP.md');

/** 装飾だけのコメント行（`// ====` や `// ----`）か */
function isDecorationLine(text) {
    return /^[=\-*\s]*$/.test(text);
}

/**
 * ファイル内容の行数を数える。js/html/css で数え方を揃えるための唯一の実装。
 * 末尾改行が作る空要素は行として数えない（CRLF/LF どちらでも同じ値になる）。
 * @param {string} source
 * @returns {number}
 */
export function countLines(source) {
    const parts = source.split('\n');
    return parts.length > 0 && parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;
}

/**
 * JS ソースからエクスポート・window 公開・冒頭タイトル・行数を抽出する。
 * 行頭一致に限定することで、コメント内や入れ子の定義を拾わない。
 * @param {string} source
 * @returns {{exports: {name: string, line: number}[], globals: {name: string, line: number}[], title: string, lines: number}}
 */
export function parseJsSource(source) {
    // 行末の CR を落としてから解析する。CRLF のまま扱うと `(.*)$` が CR を越えられず、
    // Windows の working tree(CRLF) と CI(LF) で title の抽出結果が食い違って
    // 生成物が環境依存になる（CI の鮮度チェックが永久に一致しなくなる）。
    const rawLines = source.split('\n').map(line => (line.endsWith('\r') ? line.slice(0, -1) : line));
    const lines = countLines(source);

    const exports = [];
    const globals = [];

    rawLines.forEach((line, i) => {
        const lineNo = i + 1;
        let m = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line);
        if (m) { exports.push({ name: m[1], line: lineNo }); return; }

        m = /^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
        if (m) { exports.push({ name: m[1], line: lineNo }); return; }

        m = /^window\.([A-Za-z_$][\w$]*)\s*=/.exec(line);
        if (m) { globals.push({ name: m[1], line: lineNo }); }
    });

    return { exports, globals, title: extractTitle(rawLines), lines };
}

/** 冒頭のバナーコメントから、装飾でない最初の本文行を取り出す */
function extractTitle(rawLines) {
    if (!rawLines.length || !/^\s*(\/\/|\/\*)/.test(rawLines[0])) return '';
    for (const line of rawLines.slice(0, 6)) {
        const m = /^\s*(?:\/\/+|\/\*+|\*)\s?(.*)$/.exec(line);
        if (!m) break;
        const text = m[1].trim();
        if (text && !isDecorationLine(text)) return text;
    }
    return '';
}

/**
 * HTML から id 属性を行番号付きで抽出する（同一 id は最初の 1 件のみ）。
 * @param {string} source
 * @returns {{id: string, line: number}[]}
 */
export function parseHtmlIds(source) {
    const seen = new Set();
    const result = [];
    source.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/\sid="([^"]+)"/g)) {
            if (seen.has(m[1])) continue;
            seen.add(m[1]);
            result.push({ id: m[1], line: i + 1 });
        }
    });
    return result;
}

/**
 * 索引を Markdown に整形する。
 * CI の差分チェックを成立させるため、生成日時など実行ごとに変わる値は出力しない。
 * @param {{jsFiles: object[], htmlFiles: object[], cssFiles: object[]}} data
 * @returns {string}
 */
export function renderCodemap({ jsFiles, htmlFiles, cssFiles }) {
    const out = [];
    out.push('<!-- 自動生成ファイル: `node scripts/codemap.mjs` で再生成する。手で編集しない。 -->');
    out.push('# コードマップ');
    out.push('');
    out.push('コード内の関数・要素を探すときは、`js/` を総当たり Grep する前に**このファイルを Grep** する。');
    out.push('`名前:行番号` 形式なので、当たった行番号を `Read` の `offset` に渡せば該当箇所だけ読める。');
    out.push('');

    const jsLines = jsFiles.reduce((a, f) => a + f.lines, 0);
    out.push(`## js/ — ${jsFiles.length} ファイル / ${jsLines.toLocaleString('en-US')} 行`);
    out.push('');
    for (const f of jsFiles) {
        const head = f.title ? `${f.path} — ${f.title}` : f.path;
        out.push(`### ${head} (${f.lines}行)`);
        if (f.exports.length) out.push(`- export: ${f.exports.map(e => `${e.name}:${e.line}`).join(', ')}`);
        if (f.globals.length) out.push(`- window: ${f.globals.map(e => `${e.name}:${e.line}`).join(', ')}`);
        if (!f.exports.length && !f.globals.length) out.push('- (公開シンボルなし)');
        out.push('');
    }

    for (const f of htmlFiles) {
        out.push(`## ${f.path} — ${f.lines}行 / 要素ID ${f.ids.length}件`);
        out.push('');
        out.push(f.ids.map(e => `${e.id}:${e.line}`).join(', '));
        out.push('');
    }

    if (cssFiles.length) {
        out.push('## スタイル');
        out.push('');
        for (const f of cssFiles) out.push(`- ${f.path} — ${f.lines}行`);
        out.push('');
    }

    return out.join('\n');
}

/**
 * 既存の CODEMAP.md が生成結果と一致しているか（＝最新か）を判定する。
 * core.autocrlf=true の Windows では checkout 時にファイルが CRLF になる一方、
 * 生成結果は常に LF。改行コードの差だけで「古い」と誤判定しないよう正規化して比較する。
 * @param {string} current 現在のファイル内容（未生成なら空文字）
 * @param {string} generated 生成結果
 * @returns {boolean}
 */
export function isUpToDate(current, generated) {
    const normalize = (s) => s.replace(/\r\n/g, '\n');
    return normalize(current) === normalize(generated);
}

/** リポジトリを走査して renderCodemap への入力を組み立てる */
function collect() {
    const jsDir = path.join(ROOT, 'js');
    const jsFiles = fs.readdirSync(jsDir)
        .filter(n => n.endsWith('.js'))
        .sort()
        .map(n => {
            const parsed = parseJsSource(fs.readFileSync(path.join(jsDir, n), 'utf8'));
            return { path: `js/${n}`, ...parsed };
        });

    const htmlFiles = ['index.html']
        .filter(n => fs.existsSync(path.join(ROOT, n)))
        .map(n => {
            const src = fs.readFileSync(path.join(ROOT, n), 'utf8');
            return { path: n, lines: countLines(src), ids: parseHtmlIds(src) };
        });

    const cssFiles = ['style.css']
        .filter(n => fs.existsSync(path.join(ROOT, n)))
        .map(n => ({ path: n, lines: countLines(fs.readFileSync(path.join(ROOT, n), 'utf8')) }));

    return { jsFiles, htmlFiles, cssFiles };
}

// CLI: 直接実行されたときだけ動く（テストからの import では動かさない）
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const generated = renderCodemap(collect());
    if (process.argv.includes('--check')) {
        const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
        if (!isUpToDate(current, generated)) {
            console.error('docs/CODEMAP.md が最新ではありません。`node scripts/codemap.mjs` を実行してコミットしてください。');
            process.exit(1);
        }
        console.log('docs/CODEMAP.md は最新です。');
    } else {
        fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
        fs.writeFileSync(OUT_PATH, generated, 'utf8');
        console.log(`docs/CODEMAP.md を生成しました（${generated.split('\n').length} 行）。`);
    }
}
