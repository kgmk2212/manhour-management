#!/usr/bin/env node
/**
 * JS 版 summarize の出力が Python 版と一致するかを検証
 *
 * 使い方:
 *   node tests/verify_js_summarize.mjs tests/sample_backup.json
 *   node tests/verify_js_summarize.mjs tests/sample_backup_v2.json
 *
 * 戻り値: 差分ありで exit 1、一致で exit 0
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

// js/llm-summarize.js を動的 import
const summarizeModule = await import(resolve(__dirname, '../../js/llm-summarize.js'));
const { summarize } = summarizeModule;

const backupPath = process.argv[2] || 'tests/sample_backup.json';
const absoluteBackup = resolve(backupPath);
const backup = JSON.parse(readFileSync(absoluteBackup, 'utf-8'));

// Python 版を実行して要約 JSON を取得
const tmp = mkdtempSync(join(tmpdir(), 'llm-summarize-verify-'));
const pyOutput = join(tmp, 'py.json');
execFileSync('python3', [
    resolve(__dirname, '..', 'summarize.py'),
    '--input', absoluteBackup,
    '--output', pyOutput,
], { stdio: 'inherit' });
const pyResult = JSON.parse(readFileSync(pyOutput, 'utf-8'));

// JS 版を実行
const jsResult = summarize(backup, { generatedAt: pyResult.generated_at });

// 比較（generated_at は同一化済み）
const diffs = diff(pyResult, jsResult, '');

if (diffs.length === 0) {
    console.log(`✅ 完全一致: ${backupPath}`);
    process.exit(0);
}

console.error(`❌ ${diffs.length} 件の差分: ${backupPath}`);
for (const d of diffs.slice(0, 30)) console.error(`  ${d}`);
if (diffs.length > 30) console.error(`  ... (+${diffs.length - 30} more)`);

// 参考用に両方保存
const jsOutput = join(tmp, 'js.json');
writeFileSync(jsOutput, JSON.stringify(jsResult, null, 2));
console.error(`\nPython出力: ${pyOutput}`);
console.error(`JS出力:     ${jsOutput}`);
console.error(`比較: diff ${pyOutput} ${jsOutput}`);
process.exit(1);


function diff(a, b, path) {
    const diffs = [];
    if (typeof a !== typeof b) {
        diffs.push(`${path}: type ${typeof a} vs ${typeof b}`);
        return diffs;
    }
    if (a === null || b === null) {
        if (a !== b) diffs.push(`${path}: ${a} vs ${b}`);
        return diffs;
    }
    if (Array.isArray(a)) {
        if (!Array.isArray(b)) {
            diffs.push(`${path}: array vs non-array`);
            return diffs;
        }
        if (a.length !== b.length) {
            diffs.push(`${path}: array length ${a.length} vs ${b.length}`);
        }
        const n = Math.max(a.length, b.length);
        for (let i = 0; i < n; i++) {
            diffs.push(...diff(a[i], b[i], `${path}[${i}]`));
        }
        return diffs;
    }
    if (typeof a === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) {
            if (!(k in a)) { diffs.push(`${path}.${k}: missing in py`); continue; }
            if (!(k in b)) { diffs.push(`${path}.${k}: missing in js`); continue; }
            diffs.push(...diff(a[k], b[k], `${path}.${k}`));
        }
        return diffs;
    }
    // プリミティブ
    if (typeof a === 'number' && typeof b === 'number') {
        // 小数丸めの微差を許容（0.15 違いまで）
        if (Math.abs(a - b) > 0.15) diffs.push(`${path}: ${a} vs ${b}`);
    } else if (a !== b) {
        diffs.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
    return diffs;
}
