# 見積の作業月 UI 刷新（4 方式切替）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 見積登録／全工程編集モーダルの「工程ごとの作業月」を、現状 select・月チップ・ミニガント・工程×月マトリクスの 4 方式から設定で切り替えられるようにし、既定を月チップにする。

**Architecture:** 純関数 `estimate-work-months-core.js`（node --test 対象）＋ DOM コントローラ `estimate-work-months.js`（設定・行状態・連動・スロット生成・保存ペイロード）＋ 方式別レンダラ 3 ファイル（同一インターフェース、モックアップからの移植）。`estimate-add.js` は既存 7 関数の先頭で `WorkMonths.isActive()` なら委譲するだけで、legacy 経路は温存する（`splitHoursEvenly` 化のみ）。

**Tech Stack:** 純 HTML/CSS/JS（ES Modules）、localStorage、Playwright e2e（`tests/e2e/`、`playwright.config.js`）、`node --test`。

**Spec:** `docs/superpowers/specs/2026-09-12-estimate-work-months-design.md`

## Global Constraints

- フレームワーク・CDN 不使用。`js/constants.js` の定数を使う。JSDoc を関数に付ける。
- 保存データ形式は不変: `{ workMonth, workMonths: ['YYYY-MM', …], monthlyHours: { 'YYYY-MM': h } }`、`workMonth === workMonths[0]`。
- 均等按分は `Utils.splitHoursEvenly(totalHours, months)`（`js/utils.js:751`。0.01h 丸め・端数は最終月）。
- 設定キー `localStorage['manhour_estimateWorkMonthUi']`、値 `chips | gantt | matrix | legacy`、既定 `chips`。設定 select の id は `estimateWorkMonthUiSelect`。
- 方式固有コードは `js/estimate-work-months-<mode>.js` と `style.css` の `/* wm: <mode> */` ブロックに閉じる。共通側に方式名の分岐を書かない。
- DOM の差し替えを pointerup／touchend の中で行わない（`setTimeout(fn, 0)`）。
- モバイル（`window.innerWidth <= 768`）: タッチ目標 44px 以上、決定ボタンは sticky、`100vh` 不使用。
- コミットは自分が編集したファイルのみ `git add <file>...`（`-A` 禁止）。`js/**.js`・`index.html`・`style.css` を編集すると PostToolUse hook が `docs/CODEMAP.md` を再生成するので、コミットに含める。
- 作業は feature worktree `feature/estimate-work-months`（`/start-work estimate-work-months`）で行い、完了後 `/integrate`。

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| Create `js/estimate-work-months-core.js` | 純関数: `MODES` / `DEFAULT_MODE` / `resolveMode` / `monthRange` / `clampMonths` / `serializeMonths` / `parseMonths` / `isEvenSplit` / `buildPayload` |
| Create `js/estimate-work-months.js` | 設定の読み書き・設定 select 初期化、レンダラ登録、`isActive` / `forceMultiRadio` / `setupTable` / `applyDefaults` / `onRowAdded` / `setRowMonths` / `readRow` / `reset`、行状態（`data-wm-*`）、連動、期間クランプ、再描画 |
| Create `js/estimate-work-months-chips.js` | 案A レンダラ（`mockups/estimate-work-months/a-month-chips.html` の `renderControl`/`wire` を移植） |
| Create `js/estimate-work-months-gantt.js` | 案B レンダラ（`b-mini-gantt.html` の `renderControl`/`wire` を移植） |
| Create `js/estimate-work-months-matrix.js` | 案C レンダラ（`c-hours-matrix.html` のセル入力ロジックをスロット内グリッドに移植、`renderHeader` あり） |
| Modify `js/estimate-add.js` | 7 箇所の委譲分岐 + `splitHoursEvenly` 化 + `applyWorkMonthsMode()` 呼び出し + `resetAddEstimateForm` で `reset` |
| Modify `js/init.js` | import 3 レンダラ + コントローラ、`initWorkMonthUiSetting()` |
| Modify `index.html` | 設定行追加（`#hoursInputMethodSelect` の直後）、決定ボタン行に `class="add-est-footer"`、ラジオ行に `id="addEstMonthTypeRow"` |
| Modify `style.css` | `/* wm: common */` `/* wm: chips */` `/* wm: gantt */` `/* wm: matrix */` ブロック追加 |
| Create `tests/estimate-work-months-core.test.js` | core の単体テスト |
| Create `tests/e2e/estimate-work-months.spec.js` | chips / gantt / matrix × PC / mobile-390 の e2e |
| Modify `tests/e2e/estimate-month-follow.spec.js` | seed に `manhour_estimateWorkMonthUi: "legacy"` |

---

### Task 1: core（純関数）と単体テスト

**Files:**
- Create: `js/estimate-work-months-core.js`
- Test: `tests/estimate-work-months-core.test.js`

**Interfaces:**
- Produces:
  - `MODES: string[]` = `['chips','gantt','matrix','legacy']`、`DEFAULT_MODE = 'chips'`
  - `resolveMode(stored: string|null, available: string[]): string` — `stored === 'legacy'` はそのまま。`available` に含まれればそのまま。それ以外は `available.includes(DEFAULT_MODE) ? DEFAULT_MODE : 'legacy'`
  - `monthRange(start: string, end: string): string[]` — 両端含む昇順。`start > end` なら `[]`
  - `clampMonths(months: string[], range: string[]): { months: string[], changed: boolean }` — `range` 内の月だけ残す。全部外れたら `months[0] < range[0] ? [range[0]] : [range.at(-1)]`。`range` 空なら `{ months: [], changed: months.length > 0 }`
  - `serializeMonths(arr: string[]): string`（`,` 区切り昇順）／`parseMonths(str: string|undefined): string[]`
  - `isEvenSplit(monthly: Object, hours: number, months: string[], splitFn): boolean` — `splitFn(hours, months)` と全月 0.001 以内で一致
  - `buildPayload({ months, hours, manual, opened, splitFn }): { workMonth, workMonths, monthlyHours }` — `manual` があり `serializeMonths(months) === serializeMonths(opened)` なら `monthlyHours = manual`、それ以外は `splitFn(hours, months)`。`months` 空なら `{ workMonth: '', workMonths: [], monthlyHours: {} }`

- [ ] **Step 1: テストを書く**

```js
// tests/estimate-work-months-core.test.js
// 仕様テスト: js/estimate-work-months-core.js（見積の作業月 UI 共通・純関数）
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => { globalThis.window = globalThis; });

const Core = await import('../js/estimate-work-months-core.js');
const split = (h, ms) => { const per = Math.round((h / ms.length) * 100) / 100; const r = {}; let acc = 0;
    ms.forEach((m, i) => { r[m] = i === ms.length - 1 ? Math.round((h - acc) * 100) / 100 : per; acc += per; }); return r; };

describe('resolveMode()', () => {
    const avail = ['chips', 'gantt', 'matrix'];
    test('登録済みの方式はそのまま', () => assert.equal(Core.resolveMode('gantt', avail), 'gantt'));
    test('legacy は常に有効', () => assert.equal(Core.resolveMode('legacy', []), 'legacy'));
    test('未設定・不正値は chips', () => { assert.equal(Core.resolveMode(null, avail), 'chips'); assert.equal(Core.resolveMode('nope', avail), 'chips'); });
    test('chips 未登録なら legacy', () => assert.equal(Core.resolveMode('nope', ['gantt']), 'legacy'));
});

describe('monthRange()', () => {
    test('両端含む・年跨ぎ', () => assert.deepEqual(Core.monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']));
    test('start > end は空', () => assert.deepEqual(Core.monthRange('2026-09', '2026-08'), []));
});

describe('clampMonths()', () => {
    const range = ['2026-08', '2026-09', '2026-10', '2026-11'];
    test('範囲内は不変', () => assert.deepEqual(Core.clampMonths(['2026-09', '2026-10'], range), { months: ['2026-09', '2026-10'], changed: false }));
    test('一部が外れたら残す', () => assert.deepEqual(Core.clampMonths(['2026-10', '2026-11', '2026-12'], range), { months: ['2026-10', '2026-11'], changed: true }));
    test('全部外れたら近い端の 1 月', () => {
        assert.deepEqual(Core.clampMonths(['2027-01'], range), { months: ['2026-11'], changed: true });
        assert.deepEqual(Core.clampMonths(['2026-06', '2026-07'], range), { months: ['2026-08'], changed: true });
    });
});

describe('serializeMonths() / parseMonths()', () => {
    test('往復・昇順・空', () => {
        assert.equal(Core.serializeMonths(['2026-10', '2026-08']), '2026-08,2026-10');
        assert.deepEqual(Core.parseMonths('2026-08,2026-10'), ['2026-08', '2026-10']);
        assert.deepEqual(Core.parseMonths(undefined), []);
        assert.deepEqual(Core.parseMonths(''), []);
    });
});

describe('buildPayload()', () => {
    const months = ['2026-08', '2026-09', '2026-10'];
    test('均等按分（splitFn 注入）と workMonth = 先頭', () => {
        const p = Core.buildPayload({ months, hours: 60, manual: null, opened: null, splitFn: split });
        assert.equal(p.workMonth, '2026-08'); assert.deepEqual(p.workMonths, months);
        assert.deepEqual(p.monthlyHours, { '2026-08': 20, '2026-09': 20, '2026-10': 20 });
    });
    test('端数は最終月（8h / 3 月）', () => {
        const p = Core.buildPayload({ months, hours: 8, manual: null, opened: null, splitFn: split });
        assert.deepEqual(p.monthlyHours, { '2026-08': 2.67, '2026-09': 2.67, '2026-10': 2.66 });
    });
    test('手動配分は月が開いた時と同じなら保持', () => {
        const manual = { '2026-08': 10, '2026-09': 40, '2026-10': 10 };
        const p = Core.buildPayload({ months, hours: 60, manual, opened: months, splitFn: split });
        assert.deepEqual(p.monthlyHours, manual);
    });
    test('月が変わったら手動配分を捨てて均等', () => {
        const manual = { '2026-08': 10, '2026-09': 40, '2026-10': 10 };
        const p = Core.buildPayload({ months: ['2026-09', '2026-10'], hours: 60, manual, opened: months, splitFn: split });
        assert.deepEqual(p.monthlyHours, { '2026-09': 30, '2026-10': 30 });
    });
    test('月が無ければ空', () => assert.deepEqual(Core.buildPayload({ months: [], hours: 8, manual: null, opened: null, splitFn: split }), { workMonth: '', workMonths: [], monthlyHours: {} }));
    test('isEvenSplit は丸め差を許容', () => {
        assert.equal(Core.isEvenSplit({ '2026-08': 2.67, '2026-09': 2.67, '2026-10': 2.66 }, 8, months, split), true);
        assert.equal(Core.isEvenSplit({ '2026-08': 1, '2026-09': 1, '2026-10': 6 }, 8, months, split), false);
    });
});
```

- [ ] **Step 2: 失敗を確認** — `node --test tests/estimate-work-months-core.test.js` → `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 実装**

```js
// js/estimate-work-months-core.js
/**
 * 見積の作業月 UI（4 方式切替）— 純関数。DOM・State に依存しない（node --test 対象）。
 * 設計: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md
 */
export const MODES = ['chips', 'gantt', 'matrix', 'legacy'];
export const DEFAULT_MODE = 'chips';

/** 保存値と登録済みレンダラから有効な方式を決める（不正値は chips、chips も無ければ legacy） */
export function resolveMode(stored, available) {
    if (stored === 'legacy') return 'legacy';
    if (stored && available.includes(stored)) return stored;
    return available.includes(DEFAULT_MODE) ? DEFAULT_MODE : 'legacy';
}

/** 'YYYY-MM' の両端を含む昇順配列。start > end なら [] */
export function monthRange(start, end) {
    const out = [];
    if (!start || !end || start > end) return out;
    let [y, m] = start.split('-').map(Number);
    const [y2, m2] = end.split('-').map(Number);
    while (y < y2 || (y === y2 && m <= m2)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m++; if (m > 12) { m = 1; y++; }
    }
    return out;
}

/** 期間外の月を捨て、全部外れたら近い端の 1 月に寄せる */
export function clampMonths(months, range) {
    const sorted = [...months].sort();
    if (!range.length) return { months: [], changed: sorted.length > 0 };
    const kept = sorted.filter(m => range.includes(m));
    if (kept.length === sorted.length) return { months: kept, changed: false };
    if (kept.length) return { months: kept, changed: true };
    return { months: [sorted[0] < range[0] ? range[0] : range[range.length - 1]], changed: true };
}

export function serializeMonths(arr) { return [...(arr || [])].sort().join(','); }
export function parseMonths(str) { return str ? str.split(',').filter(Boolean).sort() : []; }

/** monthly が splitFn(hours, months) と 0.001 以内で一致するか */
export function isEvenSplit(monthly, hours, months, splitFn) {
    const even = splitFn(hours, months);
    return months.every(m => Math.abs((Number(monthly?.[m]) || 0) - (even[m] || 0)) < 0.001)
        && Object.keys(monthly || {}).every(m => months.includes(m));
}

/**
 * 保存用ペイロード。手動配分は「開いた時と月が同じ」ときだけ保持し、それ以外は均等按分。
 * @param {{months:string[], hours:number, manual:Object|null, opened:string[]|null, splitFn:Function}} p
 */
export function buildPayload({ months, hours, manual, opened, splitFn }) {
    const ms = [...(months || [])].sort();
    if (!ms.length) return { workMonth: '', workMonths: [], monthlyHours: {} };
    const keepManual = !!manual && !!opened && serializeMonths(ms) === serializeMonths(opened);
    const monthlyHours = keepManual ? { ...manual } : splitFn(Number(hours) || 0, ms);
    return { workMonth: ms[0], workMonths: ms, monthlyHours };
}
```

- [ ] **Step 4: パス確認** — `node --test tests/estimate-work-months-core.test.js` → 全 PASS
- [ ] **Step 5: コミット** — `git add js/estimate-work-months-core.js tests/estimate-work-months-core.test.js docs/CODEMAP.md && git commit -m "feat(estimate-work-months): 作業月 UI 共通の純関数 core と単体テストを追加 (B-047)"`

---

### Task 2: コントローラ `js/estimate-work-months.js` と設定切替

**Files:**
- Create: `js/estimate-work-months.js`
- Modify: `index.html:1924-1932` の直後（設定行）、`index.html:2485`（ラジオ行に id）、`index.html:2594`（決定ボタン行に class）
- Modify: `js/init.js:30`（import）、`js/init.js:614`（初期化呼び出し）

**Interfaces:**
- Consumes: Task 1 の Core 全関数、`Utils.splitHoursEvenly`（`js/utils.js:751`）、`Utils.generateMonthOptions`（`js/utils.js:160`）、`Estimate.calculateDefaultWorkMonths`（`js/estimate.js:144`）
- Produces（`estimate-add.js` と各レンダラが使う）:
  - `registerRenderer(renderer)` — `{ id, label, render(slotEl, view, actions), renderHeader?(slotEl, view) }`
  - `getWorkMonthUiMode(): string` / `setWorkMonthUiMode(key)` / `initWorkMonthUiSetting()`
  - `isActive(): boolean` — `getWorkMonthUiMode() !== 'legacy'`
  - `forceMultiRadio(): boolean` — ラジオ行 `#addEstMonthTypeRow` を隠し、single なら `#addEstStartMonthMulti = #addEstEndMonth = #addEstStartMonth` にして multi を checked。**ラジオを変えたら true**（呼び手が `switchAddEstMonthType()` を呼ぶ）
  - `setupTable(table, show: boolean)` — `show`: `th/td[data-work-month-col]` を「最後の列の前」に用意（既にあれば再利用）、`table.classList.add('wm-active')`、モーダル `.modal-content` に `wm-active-modal`、終了月 select の option を「開始月以上」に再生成（開始 = 終了 を許す）、全行を `clampMonths` → `applyDefaults(Estimate.calculateDefaultWorkMonths(start, end))` → 全行描画。`!show`: th/td を除去しクラスを外す（dataset は残す）
  - `applyDefaults(defaults: {process,startMonth,endMonth}[])` — `data-wm-months` の無い主行だけに設定
  - `onRowAdded(row)` — extra 行。`data-wm-linked` も `data-wm-months` も無ければ `linked='1'`。スロット td を用意して描画
  - `setRowMonths(row, workMonths: string[], monthlyHours?: Object)` — `data-wm-months` / `data-wm-opened` を設定。`monthlyHours` が均等按分と違えば `data-wm-manual`。extra 行は主行と月が同じなら `linked='1'`、違えば `linked` を外す。描画
  - `readRow(row, hours): { workMonth, workMonths, monthlyHours }` — `Core.buildPayload` に `Utils.splitHoursEvenly` を注入
  - `reset(table)` — 全 `tr` の `data-wm-*` を削除、スロットとクラスを除去、ラジオ行の hidden を戻す
  - `WorkMonthView` / `WorkMonthActions` は設計書 §3.1 のとおり。`actions.setMonths(months)` は当該行（主行なら連動 extra 行も）だけ再描画し、`manual` を消す。`actions.setManual(monthly)` は値 > 0 の月を `months` に、`manual` を保存、行の時間 input（主行 `#addEst{proc}`、extra 行 `.est-extra-hours`）に合計を書き、`window.updateAddEstimateTotals?.()`。`actions.toggleLink()` は設計書 §3.3

- [ ] **Step 1: コントローラを書く**（要点。行状態は tr.dataset、主行は `tr[data-process][data-primary="true"]`、extra 行は `tr.est-extra-member-row[data-process]`）

```js
// js/estimate-work-months.js
import * as Core from './estimate-work-months-core.js';
import * as Utils from './utils.js';
import * as Estimate from './estimate.js';

const STORAGE_KEY = 'manhour_estimateWorkMonthUi';
const TABLE_ID = 'addEstimateTable';
const renderers = new Map();

export function registerRenderer(r) { renderers.set(r.id, r); }
export function getWorkMonthUiMode() { return Core.resolveMode(localStorage.getItem(STORAGE_KEY), [...renderers.keys()]); }
export function setWorkMonthUiMode(key) { if (key === 'legacy' || renderers.has(key)) localStorage.setItem(STORAGE_KEY, key); }
export function isActive() { return getWorkMonthUiMode() !== 'legacy'; }

/** 設定画面の select を初期化（init.js から呼ぶ）。option はレンダラ登録から作る */
export function initWorkMonthUiSetting() {
    const select = document.getElementById('estimateWorkMonthUiSelect');
    if (!select) return;
    select.innerHTML = '';
    [...renderers.values()].forEach(r => select.appendChild(new Option(r.label, r.id)));
    select.appendChild(new Option('現状（開始〜終了の select）', 'legacy'));
    select.value = getWorkMonthUiMode();
    select.addEventListener('change', () => setWorkMonthUiMode(select.value));
}

const isMobile = () => window.innerWidth <= 768;
const periodMonths = () => {
    const s = document.getElementById('addEstStartMonthMulti')?.value, e = document.getElementById('addEstEndMonth')?.value;
    return Core.monthRange(s, e);
};
const primaryOf = row => document.querySelector(`#${TABLE_ID} tr[data-process="${row.dataset.process}"][data-primary="true"]`);
const isExtra = row => row.classList.contains('est-extra-member-row');
const isLinked = row => isExtra(row) && row.dataset.wmLinked === '1';
const ownMonths = row => Core.parseMonths(row.dataset.wmMonths);
const effectiveMonths = row => isLinked(row) ? ownMonths(primaryOf(row) || row) : ownMonths(row);
const hoursInput = row => isExtra(row) ? row.querySelector('.est-extra-hours') : document.getElementById(`addEst${row.dataset.process}`);
const rowHours = row => Number(hoursInput(row)?.value) || 0;
const manualOf = row => { try { return row.dataset.wmManual ? JSON.parse(row.dataset.wmManual) : null; } catch { return null; } };
const allRows = () => [...document.querySelectorAll(`#${TABLE_ID} tbody tr[data-process]`)];
const memberLabel = row => {
    const sel = isExtra(row) ? row.querySelector('.est-extra-member') : document.getElementById(`addEst${row.dataset.process}_member`);
    return `${row.dataset.process}${row.dataset.review === 'true' ? ' レビュー' : ''} ${sel?.value || ''}`.trim();
};
```

```js
// スロットの用意（th/td を「最後の列の前」に。既存の data-work-month-col を再利用）
function ensureSlot(rowOrHead, tag) {
    let cell = rowOrHead.querySelector('[data-work-month-col]');
    if (!cell) {
        cell = document.createElement(tag);
        cell.dataset.workMonthCol = 'true';
        rowOrHead.insertBefore(cell, rowOrHead.lastElementChild);
    }
    cell.classList.add('wm-slot');
    return cell;
}

function view(row) {
    const months = periodMonths();
    const selected = effectiveMonths(row);
    const manual = manualOf(row);
    const hours = rowHours(row);
    const monthly = manual && !isLinked(row) && Core.serializeMonths(Object.keys(manual)) === Core.serializeMonths(selected)
        ? manual : Utils.splitHoursEvenly(hours, selected);
    return { months, selected, linked: isLinked(row), extra: isExtra(row), hours, monthly, manual: !!manual && !isLinked(row), isMobile: isMobile(), label: memberLabel(row) };
}

function actions(row) {
    return {
        setMonths(months) {
            const { months: ms } = Core.clampMonths(months, periodMonths());
            row.dataset.wmMonths = Core.serializeMonths(ms);
            delete row.dataset.wmManual;
            renderRow(row); renderDependents(row);
        },
        setManual(monthly) {
            const ms = Object.keys(monthly).filter(m => Number(monthly[m]) > 0).sort();
            if (!ms.length) { renderRow(row); return; }
            row.dataset.wmMonths = Core.serializeMonths(ms);
            row.dataset.wmManual = JSON.stringify(Object.fromEntries(ms.map(m => [m, Number(monthly[m])])));
            const total = Math.round(ms.reduce((a, m) => a + Number(monthly[m]), 0) * 100) / 100;
            const inp = hoursInput(row); if (inp) inp.value = total;
            window.updateAddEstimateTotals?.();
            renderRow(row); renderDependents(row);
        },
        toggleLink() {
            if (!isExtra(row)) return;
            if (isLinked(row)) { row.dataset.wmMonths = Core.serializeMonths(effectiveMonths(row)); delete row.dataset.wmLinked; }
            else { row.dataset.wmLinked = '1'; delete row.dataset.wmManual; }
            renderRow(row);
        },
    };
}

function renderRow(row) {
    const r = renderers.get(getWorkMonthUiMode()); if (!r) return;
    const slot = ensureSlot(row, 'td');
    r.render(slot, view(row), actions(row));
}
/** 主行が変わったら連動中の extra 行を描き直す */
function renderDependents(row) {
    if (isExtra(row)) return;
    allRows().filter(x => isExtra(x) && x.dataset.process === row.dataset.process && isLinked(x)).forEach(renderRow);
}
```

```js
export function forceMultiRadio() {
    if (!isActive()) return false;
    document.getElementById('addEstMonthTypeRow')?.setAttribute('hidden', '');
    const single = document.querySelector('input[name="addEstMonthType"][value="single"]');
    const multi = document.querySelector('input[name="addEstMonthType"][value="multi"]');
    if (!single?.checked) return false;
    const m = document.getElementById('addEstStartMonth')?.value;
    if (m) { document.getElementById('addEstStartMonthMulti').value = m; Utils.generateMonthOptions('addEstEndMonth', m, null); document.getElementById('addEstEndMonth').value = m; }
    multi.checked = true;
    return true;
}

export function setupTable(table, show) {
    const head = table.querySelector('thead tr');
    if (!show) {
        head?.querySelector('[data-work-month-col]')?.remove();
        allRows().forEach(r => r.querySelector('[data-work-month-col]')?.remove());
        table.classList.remove('wm-active');
        table.closest('.modal-content')?.classList.remove('wm-active-modal');
        return;
    }
    // 終了月の option を「開始月以上」に（開始 = 終了 を許す）
    const startEl = document.getElementById('addEstStartMonthMulti'), endEl = document.getElementById('addEstEndMonth');
    if (startEl?.value) {
        const prevMonth = Core.monthRange(shiftMonth(startEl.value, -1), shiftMonth(startEl.value, -1))[0];
        const keep = endEl.value && endEl.value >= startEl.value ? endEl.value : startEl.value;
        Utils.generateMonthOptions('addEstEndMonth', keep, prevMonth); endEl.value = keep;
    }
    table.classList.add('wm-active');
    table.closest('.modal-content')?.classList.add('wm-active-modal');
    const r = renderers.get(getWorkMonthUiMode());
    const th = ensureSlot(head, 'th');
    if (r?.renderHeader) r.renderHeader(th, { months: periodMonths(), isMobile: isMobile() }); else th.textContent = '作業月';
    const range = periodMonths();
    allRows().forEach(row => {
        if (row.dataset.wmMonths) {
            const { months, changed } = Core.clampMonths(ownMonths(row), range);
            if (changed) { row.dataset.wmMonths = Core.serializeMonths(months); delete row.dataset.wmManual; row.dataset.wmClamped = '1'; }
        }
        if (isExtra(row) && !row.dataset.wmLinked && !row.dataset.wmMonths) row.dataset.wmLinked = '1';
    });
    applyDefaults(Estimate.calculateDefaultWorkMonths(startEl?.value, endEl?.value));
    allRows().forEach(renderRow);
}
function shiftMonth(ym, delta) { let [y, m] = ym.split('-').map(Number); m += delta; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; }

export function applyDefaults(defaults) {
    (defaults || []).forEach(d => {
        const row = document.querySelector(`#${TABLE_ID} tr[data-process="${d.process}"][data-primary="true"]`);
        if (row && !row.dataset.wmMonths) row.dataset.wmMonths = Core.serializeMonths(Core.monthRange(d.startMonth, d.endMonth));
    });
}
export function onRowAdded(row) {
    const table = document.getElementById(TABLE_ID);
    if (!table?.classList.contains('wm-active')) return;
    if (!row.dataset.wmLinked && !row.dataset.wmMonths) row.dataset.wmLinked = '1';
    renderRow(row);
}
export function setRowMonths(row, workMonths, monthlyHours) {
    const ms = [...(workMonths || [])].sort();
    if (!ms.length) return;
    row.dataset.wmMonths = Core.serializeMonths(ms);
    row.dataset.wmOpened = row.dataset.wmMonths;
    delete row.dataset.wmManual;
    if (monthlyHours && !Core.isEvenSplit(monthlyHours, rowHours(row), ms, Utils.splitHoursEvenly)) row.dataset.wmManual = JSON.stringify(monthlyHours);
    if (isExtra(row)) {
        const p = primaryOf(row);
        if (p && Core.serializeMonths(ownMonths(p)) === row.dataset.wmMonths && !row.dataset.wmManual) row.dataset.wmLinked = '1'; else delete row.dataset.wmLinked;
    }
    renderRow(row);
}
export function readRow(row, hours) {
    return Core.buildPayload({ months: effectiveMonths(row), hours, manual: isLinked(row) ? null : manualOf(row), opened: Core.parseMonths(row.dataset.wmOpened), splitFn: Utils.splitHoursEvenly });
}
export function reset(table) {
    setupTable(table, false);
    allRows().forEach(r => ['wmMonths', 'wmLinked', 'wmManual', 'wmOpened', 'wmClamped'].forEach(k => delete r.dataset[k]));
    document.getElementById('addEstMonthTypeRow')?.removeAttribute('hidden');
}
```

（時間 input の変更で均等按分の表示を更新するため、`setupTable(show)` で一度だけ `table.addEventListener('input', e => { const row = e.target.closest('tr[data-process]'); if (row && e.target.matches('input[type="number"]') && !e.target.closest('.wm-slot')) renderRow(row); })` を `table.dataset.wmInputBound` ガード付きで登録する。）

- [ ] **Step 2: index.html** — ラジオ行 `index.html:2485` の `<div style="display: flex; gap: 10px; margin-bottom: 4px;">` に `id="addEstMonthTypeRow"` を追加。決定ボタン行 `index.html:2594` の `<div style="display: flex; gap: 10px; margin-top: 20px;">` に `class="add-est-footer"` を追加。設定行を `index.html:1932`（`</div>` の後、`<div class="setting-group-heading">開発</div>` の前）に追加:

```html
                                <div class="setting-row">
                                    <div class="setting-info">
                                        <div class="setting-label">見積の作業月 UI</div>
                                        <div class="setting-desc">見積登録／全工程編集の工程ごとの作業月の選び方（実使用で比較中。決着後に残す方式だけにします）</div>
                                    </div>
                                    <div class="setting-control">
                                        <select id="estimateWorkMonthUiSelect"></select>
                                    </div>
                                </div>
```

- [ ] **Step 3: init.js** — `js/init.js:30` の後に `import { initWorkMonthUiSetting, registerRenderer } from './estimate-work-months.js';`（レンダラ import は Task 3〜5 で追加）。`js/init.js:614` の `initHoursInputSetting();` の直後に `initWorkMonthUiSetting();`。
- [ ] **Step 4: 動作確認** — `node tests/e2e/serve.mjs 8901` を起動し、Playwright で設定タブに select が出て option が `legacy` のみ（レンダラ未登録）であること、`localStorage.manhour_estimateWorkMonthUi` が変わることを確認。`node --test` 全 PASS（`tests/codemap.test.js` 含む）。
- [ ] **Step 5: コミット** — `git add js/estimate-work-months.js index.html js/init.js docs/CODEMAP.md && git commit -m "feat(estimate-work-months): 作業月 UI の共通コントローラと設定切替を追加 (B-047)"`

---

### Task 3: `estimate-add.js` の委譲分岐と `splitHoursEvenly` 化、共通 CSS、legacy e2e の seed 更新

**Files:**
- Modify: `js/estimate-add.js`（`:5-11` import、`:23-41` openAddEstimateModal、`:254` の後、`:617` constrainProcessTableOnMobile、`:720` resetAddEstimateForm、`:968` updateAddEstimateTableHeader、`:1064` updateDefaultAddProcessMonths、`:1151` ensureExtraRowMonthCell、`:1267` prefillRowWorkMonths、`:1290-1294` computeRowWorkMonths）
- Modify: `style.css`（末尾に `/* wm: common */`）
- Modify: `tests/e2e/estimate-month-follow.spec.js:25-29`

**Interfaces:**
- Consumes: Task 2 の `isActive` / `forceMultiRadio` / `setupTable` / `applyDefaults` / `onRowAdded` / `setRowMonths` / `readRow` / `reset`

- [ ] **Step 1: import と委譲** — `js/estimate-add.js:11` の後に `import * as WorkMonths from './estimate-work-months.js';`。以下をそれぞれの関数に入れる:

```js
// openAddEstimateModal: `document.getElementById('addEstimateModal').style.display = 'flex';` の直後
    applyWorkMonthsMode();
// openEditAllProcesses: `} else if (uniqueMonths.length === 1) { ... }` ブロックの閉じ括弧の直後（:254 の後）
    applyWorkMonthsMode();
// 新規 private 関数（openAddEstimateModal の直前に置く）
/** 新方式が有効ならラジオを複数月に固定し、作業月スロットを作る */
function applyWorkMonthsMode() {
    if (!WorkMonths.isActive()) return;
    if (WorkMonths.forceMultiRadio()) switchAddEstMonthType();
}
// constrainProcessTableOnMobile: 先頭
    if (WorkMonths.isActive()) return;
// resetAddEstimateForm: `switchAddEstMonthType();`（:720）の直前
    WorkMonths.reset(document.getElementById('addEstimateTable'));
// updateAddEstimateTableHeader: `if (!headerRow) return;` の直後
    if (WorkMonths.isActive()) { WorkMonths.setupTable(table, showWorkMonthColumn); return; }
// updateDefaultAddProcessMonths: 先頭（defaults 計算の直後）
    if (WorkMonths.isActive()) { WorkMonths.applyDefaults(defaults); return; }
// ensureExtraRowMonthCell: `if (!table || !row) return;` の直後
    if (WorkMonths.isActive()) { WorkMonths.onRowAdded(row); return; }
// prefillRowWorkMonths: 先頭。呼び出し側（:311, :319）は normalizeEstimate の結果を丸ごと渡すよう変えて monthlyHours も届ける
    if (WorkMonths.isActive()) { WorkMonths.setRowMonths(rowEl, workMonths, monthlyHours); return; }
//   → シグネチャを prefillRowWorkMonths(rowEl, workMonths, monthlyHours = null) にし、:311 を
//      const n = Utils.normalizeEstimate(procEstimates[0]); prefillRowWorkMonths(primaryRow, n.workMonths, n.monthlyHours);
//      :319 も同様に const n = Utils.normalizeEstimate(est); prefillRowWorkMonths(row, n.workMonths, n.monthlyHours);
// computeRowWorkMonths: 先頭
    if (WorkMonths.isActive()) return WorkMonths.readRow(rowEl, hours);
// computeRowWorkMonths の rangeResult（:1291-1295）を splitHoursEvenly 化（B-041①）
    const rangeResult = (start, end) => {
        const months = Utils.generateMonthRange(start, end);
        return { workMonth: start, workMonths: months, monthlyHours: Utils.splitHoursEvenly(hours, months) };
    };
```

- [ ] **Step 2: 共通 CSS**（`style.css` 末尾。`mockups/estimate-work-months/common.css` の `wm-*` から移植。`mk-*` は移植しない）

```css
/* ============================================================
   wm: common — 見積の作業月 UI（4 方式切替）共通部品
   設計: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md
   ============================================================ */
:root { --wm-on: var(--accent); --wm-on-text: #FFFFFF; --wm-mirror: var(--accent-light); --wm-mirror-text: var(--accent); --wm-track: var(--surface-elevated); }
.estimate-table th.wm-slot { text-align: left; padding-left: calc(42px * var(--ui-scale)); width: 40%; min-width: 200px; }
.estimate-table td.wm-slot { text-align: left; padding: 6px 8px; }
.wm-cell { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; column-gap: 8px; min-width: 0; }
.wm-link-slot { display: block; width: 30px; height: 1px; }
.wm-link { width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--accent); background: var(--accent-light); color: var(--accent); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.wm-link svg { width: 16px; height: 16px; }
.wm-link.is-off { color: var(--text-muted); border-color: var(--border); border-style: dashed; background: var(--surface); }
.wm-manual-tag { display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: var(--accent-secondary-light); color: var(--accent-secondary); white-space: nowrap; }
.wm-note { grid-column: 1 / -1; font-size: 12px; color: var(--accent-secondary); margin-top: 4px; }
@media (max-width: 768px) {
    .estimate-table.wm-active, .estimate-table.wm-active tbody { display: block; }
    .estimate-table.wm-active thead { display: none; }
    .estimate-table.wm-active tbody tr { display: grid; grid-template-columns: 40px minmax(0, 1fr) 68px 40px; grid-template-areas: "a b c e" "d d d d"; column-gap: 6px; row-gap: 6px; padding: 8px 6px; border-bottom: 1px solid var(--border-light); }
    .estimate-table.wm-active tbody td { display: block; width: auto !important; position: static !important; padding: 0; border: 0; }
    .estimate-table.wm-active tbody td:nth-child(1) { grid-area: a; align-self: center; }
    .estimate-table.wm-active tbody td:nth-child(2) { grid-area: b; }
    .estimate-table.wm-active tbody td:nth-child(3) { grid-area: c; }
    .estimate-table.wm-active tbody td:nth-child(4) { grid-area: d; }
    .estimate-table.wm-active tbody td:nth-child(5) { grid-area: e; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
    .wm-cell { grid-template-columns: 40px minmax(0, 1fr); }
    .wm-link, .wm-link-slot { width: 40px; } .wm-link { height: 40px; }
    .wm-active-modal .add-est-footer { position: sticky; bottom: 0; background: var(--surface); padding: 10px 0 calc(10px + env(safe-area-inset-bottom)); margin-top: 12px; border-top: 1px solid var(--border-light); z-index: 2; }
    .wm-active-modal .add-est-footer .btn { flex: 1; min-height: 44px; }
}
```

- [ ] **Step 3: legacy e2e の seed** — `tests/e2e/estimate-month-follow.spec.js:25-29` の `SEED_ENTRIES` に `manhour_estimateWorkMonthUi: "legacy",` を追加。
- [ ] **Step 4: 確認** — `npx playwright test tests/e2e/estimate-month-follow.spec.js`（CI=1 で自前サーバー）→ PASS（legacy 回帰なし、`monthlyHours` は `splitHoursEvenly` の丸め値になるので期待値 `{ "2026-11": 40 }` は変わらない）。`node --test` PASS。
- [ ] **Step 5: コミット** — `git add js/estimate-add.js style.css tests/e2e/estimate-month-follow.spec.js docs/CODEMAP.md && git commit -m "feat(estimate-add): 作業月 UI を WorkMonths コントローラへ委譲し均等按分を splitHoursEvenly 化 (B-047, B-041①)"`

---

### Task 4: 案A 月チップ レンダラ + e2e（chips）

**Files:**
- Create: `js/estimate-work-months-chips.js`
- Modify: `js/init.js`（import + `registerRenderer(chipsRenderer)`）、`style.css`（`/* wm: chips */`）
- Create: `tests/e2e/estimate-work-months.spec.js`

**Interfaces:**
- Consumes: `registerRenderer`、`WorkMonthView` / `WorkMonthActions`
- Produces: `export const chipsRenderer = { id: 'chips', label: '月チップ（推奨）', render }`

移植元 → 先の対応: `mockups/estimate-work-months/a-month-chips.html` の `renderControl(row, api)` / `wire(...)`
| モックアップ | 本実装 |
|---|---|
| `api.months()` | `view.months` |
| `api.effectiveMonths(row)` | `view.selected` |
| `api.isLinked(row)` | `view.linked` |
| `api.rowLabel(row)` | `view.label` |
| `api.fmtMonth(m)` | ローカル `fmtMonth = m => \`${Number(m.slice(5))}月\`` |
| `api.setMonths(row.id, ms, verb, { focus })` | `actions.setMonths(ms)` の後に `slot.querySelector(\`[data-m="${ms.at(-1)}"]\`)?.focus({ preventScroll: true })` |
| `api.render()`（pointercancel） | `actions.setMonths(view.selected)`（確定前に戻す） |
| `el(html)` | ローカルの `template` ヘルパ |
| 鎖ボタン（common.js の `buildLinkBtn`） | レンダラ側で描く: extra 行なら `<button class="wm-link" aria-pressed>` を `.wm-cell` の 1 列目に、主行なら `<span class="wm-link-slot">`。click → `actions.toggleLink()` |

- [ ] **Step 1: レンダラを書く** — `render(slot, view, actions)` は `slot.innerHTML = ''` → `.wm-cell`（鎖 or 空枠 + `.wm-rail`）を組み立てる。`view.manual` なら `.wm-manual-tag`「手動配分」をレールの後に付ける。`row.dataset.wmClamped` の注記は `view` に無いので出さない（コントローラ側で `wm-note` を描く場合は Task 2 で追加）。pointerup 内の確定は `setTimeout(0)`。
- [ ] **Step 2: CSS** — `a-month-chips.html` の `<style>` を `/* wm: chips */` として移植。`.mk-frame.is-mobile` セレクタは `@media (max-width: 768px)` に置き換える。
- [ ] **Step 3: init.js に登録** — `import { chipsRenderer } from './estimate-work-months-chips.js';` と、`initWorkMonthUiSetting()` より前（モジュール評価時）に `registerRenderer(chipsRenderer);`
- [ ] **Step 4: e2e を書く** — `tests/e2e/estimate-work-months.spec.js`。seed は本計画の共通シナリオ:

```js
const VERSION = "V1.0", TASK = "帳票A：対応A";
const SEED_ESTIMATES = [
  { id: 1, version: VERSION, task: TASK, process: "UI", member: "山田", hours: 16, workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 16 } },
  { id: 2, version: VERSION, task: TASK, process: "PG", member: "山田", hours: 60, workMonth: "2026-09", workMonths: ["2026-09"], monthlyHours: { "2026-09": 60 } },
  { id: 3, version: VERSION, task: TASK, process: "PG", member: "佐藤", hours: 40, workMonth: "2026-09", workMonths: ["2026-09"], monthlyHours: { "2026-09": 40 } },
  { id: 4, version: VERSION, task: TASK, process: "PG", member: "鈴木", hours: 8,  isReview: true, workMonth: "2026-09", workMonths: ["2026-09"], monthlyHours: { "2026-09": 8 } },
  { id: 5, version: VERSION, task: TASK, process: "PT", member: "山田", hours: 24, workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 24 } },
  { id: 6, version: VERSION, task: TASK, process: "PT", member: "鈴木", hours: 4,  isReview: true, workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 4 } },
  { id: 7, version: VERSION, task: TASK, process: "IT", member: "佐藤", hours: 16, workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 16 } },
  { id: 8, version: VERSION, task: TASK, process: "ST", member: "鈴木", hours: 16, workMonth: "2026-11", workMonths: ["2026-11"], monthlyHours: { "2026-11": 16 } },
];
```
  共通の後始末アサート（3 方式で同じ）:
```js
const byId = Object.fromEntries(saved.map(e => [e.id, e]));
expect(byId[2].workMonths).toEqual(["2026-08", "2026-09", "2026-10"]); expect(byId[2].monthlyHours).toEqual({ "2026-08": 20, "2026-09": 20, "2026-10": 20 });
expect(byId[3].workMonths).toEqual(["2026-08", "2026-09", "2026-10"]); expect(byId[3].monthlyHours).toEqual({ "2026-08": 13.33, "2026-09": 13.33, "2026-10": 13.34 });
expect(byId[4].workMonths).toEqual(["2026-10"]); expect(byId[4].monthlyHours).toEqual({ "2026-10": 8 });
expect(byId[7].workMonths).toEqual(["2026-11"]);
for (const id of [1, 5, 6, 8]) expect(byId[id].workMonths).toEqual(SEED_ESTIMATES[id - 1].workMonths);
```
  chips の操作（PC はマウス、mobile-390 は CDP `Input.dispatchTouchEvent` のなぞりと `page.touchscreen.tap`）:
  1. PG 主行のレール `tr[data-process="PG"][data-primary="true"] .wm-chip[data-m="2026-08"]` から `[data-m="2026-10"]` へなぞる
  2. `tr.est-extra-member-row[data-process="PG"][data-review="true"] .wm-link` をタップ → 同じ行の `.wm-chip[data-m="2026-10"]` をタップ
  3. `tr[data-process="IT"][data-primary="true"] .wm-chip[data-m="2026-11"]` をタップ
  4. mobile では `#addEstSubmitBtn` の中心で `document.elementFromPoint` がボタン自身、PG 主行のチップ高さ ≥ 44 を判定
  5. `#addEstSubmitBtn` クリック → モーダル非表示 → 保存内容アサート。`pageerror` / console error ゼロ（`estimate-month-follow.spec.js:41-48` の除外規則を流用）
  加えて「見積登録（新規）」1 本: `window.openAddEstimateModal()` → 版数 `V1.0`・帳票名（`#addEstFormNameSelect` が無い場合は `__new__` + `#addEstFormName`）・対応名を入れ、期間 `2026-08〜2026-10`、PG 山田 30h、PG レールで 8〜9月をなぞる → 登録 → 保存された PG の `workMonths` が `["2026-08","2026-09"]`、`monthlyHours` が `{ "2026-08": 15, "2026-09": 15 }`。
- [ ] **Step 5: 実行** — `CI=1 npx playwright test tests/e2e/estimate-work-months.spec.js -g chips` → PASS（PC / mobile-390）。`npx playwright test tests/e2e/estimate-month-follow.spec.js` も PASS。
- [ ] **Step 6: コミット** — `git add js/estimate-work-months-chips.js js/init.js style.css tests/e2e/estimate-work-months.spec.js docs/CODEMAP.md && git commit -m "feat(estimate-work-months): 案A 月チップのレールを追加し既定方式にする (B-047)"`

---

### Task 5: 案B ミニガント レンダラ + e2e（gantt）

**Files:**
- Create: `js/estimate-work-months-gantt.js`（`b-mini-gantt.html` の `renderControl`/`wire` を Task 4 と同じ対応表で移植。`api.setMonths(..., { focus: '.wg-bar' })` → `actions.setMonths(ms)` の後 `slot.querySelector('.wg-bar')?.focus({ preventScroll: true })`）
- Modify: `js/init.js`（import + register）、`style.css`（`/* wm: gantt */`。`.mk-frame.is-mobile` → `@media (max-width: 768px)`）
- Modify: `tests/e2e/estimate-work-months.spec.js`（`describe('gantt')` 追加）

**Interfaces:** `export const ganttRenderer = { id: 'gantt', label: 'ミニガント', render }`

- [ ] **Step 1: レンダラ** — つまみは `position:absolute` の両端、`.is-single` で詰める（モックアップの最終形）。pointerup 内の確定は `setTimeout(0)`。
- [ ] **Step 2: CSS / 登録**
- [ ] **Step 3: e2e** — 操作: PG 主行 `.wg-handle.l` を `.wg-cell[data-i="0"]` へドラッグ、`.wg-handle.r` を `[data-i="2"]` へ → PG レビュー行の `.wm-link` タップ → その行の `.wg-handle.l` を `[data-i="2"]` へ → IT 主行の `.wg-label` を `[data-i="3"]` へ。mobile はつまみ高さ ≥ 44。保存アサートは Task 4 と同一。
- [ ] **Step 4: 実行** — `-g gantt` PASS、`-g chips` も PASS。
- [ ] **Step 5: コミット** — `git commit -m "feat(estimate-work-months): 案B ミニガントのバーを追加 (B-047)"`（対象: gantt.js / init.js / style.css / spec / CODEMAP）

---

### Task 6: 案C 工程×月マトリクス レンダラ + e2e（matrix）

**Files:**
- Create: `js/estimate-work-months-matrix.js`
- Modify: `js/init.js`、`style.css`（`/* wm: matrix */`）、`tests/e2e/estimate-work-months.spec.js`（`describe('matrix')`）

**Interfaces:** `export const matrixRenderer = { id: 'matrix', label: '工程×月マトリクス', render, renderHeader }`

- [ ] **Step 1: レンダラ** — `renderHeader(th, { months })`: `.wx-head` グリッドに月ラベル（`8月` + 小さく年）。`render(slot, view, actions)`: `.wm-cell` の 2 列目に `.wx-grid`（`grid-template-columns: repeat(n, minmax(56px, 1fr))`）。非連動: `<input type="number" class="wx-cell" step="0.25" inputmode="decimal" data-m placeholder="–">`、`change` で行内全セルを集めて `actions.setManual(map)`（全部空なら `actions.setMonths(view.selected)` で戻し `.wm-note` に「少なくとも 1 つの月に工数が必要です」）。連動: `.wx-mirror`（値または `–`）。配分が不均等なら「均等にする」ボタン → `actions.setMonths(view.selected)`（manual が消えて均等に戻る）。
  時間 input の変更時はコントローラの `input` 委譲で再描画され、均等値が出る。
- [ ] **Step 2: CSS / 登録** — `c-hours-matrix.html` の `wx-*` を移植（`.wx-grid` の列定義はスロット内グリッド版に変更、`.wx-c-proc/.wx-c-member` の sticky は不要）。モバイルは `.wx-grid { overflow-x: auto }`。
- [ ] **Step 3: e2e** — 操作（`fill` + `Tab`）: PG 主行 `input.wx-cell[data-m="2026-08"]`=20, `[2026-09]`=20, `[2026-10]`=20 → PG レビュー行 `.wm-link` → `[2026-10]`=8, `[2026-08]`='', `[2026-09]`='' → IT `[2026-11]`=16 → `[2026-10]`=''。保存アサートは Task 4 と同一（佐藤の 13.33/13.33/13.34 は連動の均等按分）。mobile は `.wx-grid` が `scrollWidth > clientWidth` でも本文が横に溢れないこと（`document.documentElement.scrollWidth === 390`）。
- [ ] **Step 4: 実行** — 3 方式すべて PASS、`node --test` PASS。
- [ ] **Step 5: コミット** — `git commit -m "feat(estimate-work-months): 案C 工程×月マトリクスを追加 (B-047)"`

---

### Task 7: 仕上げ（/verify-ui 撮影・BACKLOG・モックアップ README・統合）

- [ ] **Step 1: /verify-ui** — 設定で 4 方式を切り替え、登録／全工程編集の両モーダルを PC と 390px で撮影（`test-results/` へ）。決定ボタンの `elementFromPoint` 判定を再確認。
- [ ] **Step 2: ドキュメント** — `docs/BACKLOG.md` B-047 に「実装済み（4 方式切替、既定 chips）・実使用比較中」、B-041① に「全工程編集側は解消（`splitHoursEvenly` 化）」、B-046 に「新方式で解消（legacy のみ残存）」を追記。`mockups/estimate-work-months/README.md` の「ステータス」を更新。
- [ ] **Step 3: コミット** — `git add docs/BACKLOG.md mockups/estimate-work-months/README.md && git commit -m "docs(backlog): B-047 作業月 UI 4 方式切替を実装済みに更新"`
- [ ] **Step 4: 統合** — `/integrate`（rebase → /verify-ui → ff-only マージ → /deploy → worktree 掃除）。node_modules ジャンクションを張った場合は掃除前に PowerShell から `rmdir`。
