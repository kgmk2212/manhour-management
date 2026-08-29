# 実績のまとめ変更（一括編集） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実績を複数選び（リストの ✓／条件／ガントのバー）、変えたい項目だけをまとめて変更・複製・削除し、1 回の Undo で全件戻せるようにする。

**Architecture:** DOM 非依存の適用エンジン `js/actual-bulk-core.js`（純粋関数、`node --test`）と、選択状態・選択バー・条件ポップオーバー・一括編集モーダルを担う UI モジュール `js/actual-bulk.js` を新設。既存の `history.js` に `actual_bulk_edit` を追加して一括 Undo を実現し、`actual.js`（リスト）と `actual-timeline.js`（ガント）は「選択の入口」を足すだけに留める。

**Tech Stack:** 素の HTML/CSS/ES Modules（フレームワーク無し）、`node --test`（ユニット）、Playwright（e2e、`playwright.config.js` が `tests/e2e/serve.mjs 8901` を起動）。

**Spec:** `docs/superpowers/specs/2026-08-29-actual-bulk-edit-design.md`

## Global Constraints

- 作業場所は feature worktree `D:/CCwork/.manhour-management-worktrees/feature-actual-bulk-edit`（ブランチ `feature/actual-bulk-edit`）。`experiment-ui-scaling` worktree のファイルは編集しない
- コミットは自分が編集したファイルのみ明示ステージ（`git add <file>...`、`-A` 禁止）。メッセージは Conventional Commits、末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- `js/constants.js` の定数を使う（工程一覧は `PROCESS.TYPES`）。新しい状態変数は `js/state.js`。関数に JSDoc
- `docs/CODEMAP.md` は手で編集しない（`js/**.js`・`index.html`・`style.css` 保存時に hook が再生成。CI は `node scripts/codemap.mjs --check`）
- 実績レコードの形: `{ id:number, date:'YYYY-MM-DD', version:string, task:string, process:string, member:string, hours:number, isReview?:true, createdAt:string }`。`version === ''` は「その他工数」で `process === ''` を許容。版数ありで工程なしは不正
- 見込残存 `remainingEstimates`・予定 `schedules`・見積 `estimates` は変更しない
- 日付演算は文字列分解 → `new Date(y, m-1, d)`（ローカル）で行い、`Date.parse`/`toISOString` の UTC 往復を使わない
- 一括削除は `confirm` あり（件数明示）。「同じ対応」の一致キーは版数＋対応名（工程を含めない）
- 完了報告の前に `/verify-ui`（Playwright 実動作）が PASS していること

---

## ファイル構成

| 区分 | ファイル | 責務 |
|---|---|---|
| 新規 | `js/actual-bulk-core.js` | 純粋ロジック: パッチ適用・検証・複製・削除・条件検索・同一対応・内訳集計・日付シフト |
| 新規 | `js/actual-bulk.js` | 選択状態の操作、選択バー、条件ポップオーバー、一括編集/複製モーダル、適用→pushAction→保存→再描画、Undo トースト |
| 新規 | `tests/actual-bulk-core.test.js` | エンジンのユニットテスト |
| 新規 | `tests/e2e/actual-bulk-edit.spec.js` | リスト／条件／タイムライン／モバイル／バリデーションの e2e |
| 変更 | `js/state.js` | `actualSelectionMode` / `selectedActualIds` / `setActualSelectionMode` |
| 変更 | `js/history.js` | `actual_bulk_edit` の undo/redo、`restoreBulkEdit` の削除・追加対応 |
| 変更 | `tests/history.test.js` | `actual_bulk_edit` の往復テスト |
| 変更 | `js/actual.js` | `renderActualListView` に ✓ 列・行クリック・選択ハイライト、`renderActualList` 末尾で選択 UI 更新 |
| 変更 | `js/actual-timeline.js` | バーの `.selected`、Ctrl/Shift クリック、右クリックメニュー、詳細パネルの選択/一括編集ボタン |
| 変更 | `js/init.js` | `window.*` 公開 |
| 変更 | `js/events.js` | ボタンのイベント登録 |
| 変更 | `js/modal.js` | `setupModalHandlers` に 2 モーダル追加 |
| 変更 | `js/ui.js` | `showTab` で実績タブを離れるとき選択クリア |
| 変更 | `index.html` | 選択モードボタン、選択バー＋条件ポップオーバー、一括編集モーダル、複製モーダル |
| 変更 | `style.css` | `bk-*`、`.actual-tl-bar.actual.selected`、`.actual-tl-ctx-menu` |
| 変更 | `docs/BACKLOG.md` | 複数 id バーの移動が 1 件しか動かない件を記録 |

---

### Task 1: 適用エンジン `js/actual-bulk-core.js`（純粋ロジック）

**Files:**
- Create: `js/actual-bulk-core.js`
- Test: `tests/actual-bulk-core.test.js`

**Interfaces:**
- Consumes: なし（DOM・state に依存しない）
- Produces（後続タスクが使う名前・型）:
  - `shiftDate(dateStr: string, days: number): string`
  - `isValidDateString(s: string): boolean`
  - `changedFields(before, after): string[]` — `'date'|'version'|'task'|'process'|'member'|'hours'|'isReview'`
  - `applyBulkPatch(actuals, ids: number[], patch: BulkPatch): { after: Actual[], changed: {before, after, fields}[], invalid: {id, reason}[] }`
  - `duplicateActuals(actuals, ids, date, nextId: () => number, now?: string): { after, added }`
  - `deleteActuals(actuals, ids): { after, deleted }`
  - `displayValue(field, actual): string`
  - `summarizeField(actuals, field): { value: string, count: number }[]`（件数降順）
  - `findByCondition(actuals, cond: { from, to, member, version, task, process }): Actual[]`（`version === '__none__'` は「その他工数」）
  - `sameTaskIds(actuals, seed, { sameMember }): number[]`
  - `BulkPatch = { version?: {set}, task?: {set}, process?: {set}, member?: {set}, isReview?: 'on'|'off', date?: {mode:'set', value} | {mode:'shift', days} }`

- [ ] **Step 1: 失敗するテストを書く**

`tests/actual-bulk-core.test.js`:

```js
// js/actual-bulk-core.js の特性テスト（DOM 非依存の純粋ロジック）
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    shiftDate, isValidDateString, changedFields, applyBulkPatch,
    duplicateActuals, deleteActuals, summarizeField, findByCondition, sameTaskIds, displayValue,
} from '../js/actual-bulk-core.js';

const A = (over) => ({ id: 1, date: '2026-08-17', version: 'V2.3', task: '帳票A', process: 'PG', member: '田中', hours: 6, createdAt: 'x', ...over });
const DATA = [
    A({ id: 1 }),
    A({ id: 2, version: '', task: '打ち合わせ', process: '' }),
    A({ id: 3, date: '2026-08-18', process: 'PT' }),
    A({ id: 4, date: '2026-08-19', member: '佐藤', task: 'ログイン', isReview: true }),
    A({ id: 5, date: '2026-08-24', version: 'V2.4', task: '帳票A（追補）', process: 'IT' }),
];

describe('shiftDate / isValidDateString', () => {
    test('月末・年末を跨いでも暦日でずれる', () => {
        assert.equal(shiftDate('2026-08-31', 1), '2026-09-01');
        assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
        assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
        assert.equal(shiftDate('2026-08-17', 0), '2026-08-17');
    });
    test('日付文字列の検証', () => {
        assert.equal(isValidDateString('2026-08-17'), true);
        assert.equal(isValidDateString('2026-02-30'), false);
        assert.equal(isValidDateString('2026/08/17'), false);
        assert.equal(isValidDateString(''), false);
    });
});

describe('applyBulkPatch', () => {
    test('指定した項目だけ変わり、変わった件だけ changed に入る', () => {
        const r = applyBulkPatch(DATA, [1, 3, 5], { version: { set: 'V2.4' }, task: { set: '帳票A（追補）' } });
        assert.equal(r.after.length, 5);
        assert.equal(r.changed.length, 2);                      // id5 は既に V2.4/追補 なので変化なし
        assert.deepEqual(r.changed.map(c => c.before.id), [1, 3]);
        assert.deepEqual(r.changed[0].fields, ['version', 'task']);
        assert.equal(r.after.find(a => a.id === 1).process, 'PG');   // 未指定項目は不変
        assert.equal(r.after.find(a => a.id === 2), DATA[1]);        // 対象外は同一参照
        assert.equal(r.invalid.length, 0);
        assert.equal(DATA[0].version, 'V2.3');                       // 入力は不変
    });
    test('その他工数に版数だけ付けると process-required', () => {
        const r = applyBulkPatch(DATA, [2], { version: { set: 'V2.3' } });
        assert.deepEqual(r.invalid, [{ id: 2, reason: 'process-required' }]);
        assert.equal(r.changed.length, 1);
    });
    test('版数を空にすると工程が空でも有効', () => {
        const r = applyBulkPatch(DATA, [1], { version: { set: '' }, process: { set: '' } });
        assert.equal(r.invalid.length, 0);
        assert.equal(r.after[0].version, '');
    });
    test('レビューの付与と除去、日付の指定・シフト', () => {
        const on = applyBulkPatch(DATA, [1], { isReview: 'on' });
        assert.equal(on.after[0].isReview, true);
        assert.deepEqual(on.changed[0].fields, ['isReview']);
        const off = applyBulkPatch(DATA, [4], { isReview: 'off' });
        assert.equal('isReview' in off.after[3], false);
        const set = applyBulkPatch(DATA, [1], { date: { mode: 'set', value: '2026-08-24' } });
        assert.equal(set.after[0].date, '2026-08-24');
        const shift = applyBulkPatch(DATA, [1, 3], { date: { mode: 'shift', days: 7 } });
        assert.equal(shift.after[0].date, '2026-08-24');
        assert.equal(shift.after[2].date, '2026-08-25');
    });
    test('空パッチは changed 0 件・invalid 0 件', () => {
        const r = applyBulkPatch(DATA, [1, 2], {});
        assert.equal(r.changed.length, 0);
        assert.equal(r.after, r.after); // 落ちないこと
    });
});

describe('duplicateActuals / deleteActuals', () => {
    test('複製は新 id・指定日・新 createdAt で追加し元は残す', () => {
        let next = 100;
        const r = duplicateActuals(DATA, [1, 3], '2026-08-24', () => next++, '2026-08-29T00:00:00.000Z');
        assert.equal(r.after.length, 7);
        assert.deepEqual(r.added.map(a => a.id), [100, 101]);
        assert.ok(r.added.every(a => a.date === '2026-08-24' && a.createdAt === '2026-08-29T00:00:00.000Z'));
        assert.equal(r.added[0].task, '帳票A');
        assert.equal(DATA.length, 5);
    });
    test('削除は deleted と after が排反', () => {
        const r = deleteActuals(DATA, [2, 4]);
        assert.deepEqual(r.deleted.map(a => a.id), [2, 4]);
        assert.deepEqual(r.after.map(a => a.id), [1, 3, 5]);
    });
});

describe('summarizeField / displayValue', () => {
    test('件数の多い順に集計し、空の版数・工程は表示名に置き換える', () => {
        assert.deepEqual(summarizeField(DATA, 'version'), [
            { value: 'V2.3', count: 3 }, { value: '（その他）', count: 1 }, { value: 'V2.4', count: 1 },
        ]);
        assert.equal(displayValue('process', DATA[1]), '—');
        assert.equal(displayValue('isReview', DATA[3]), 'あり');
        assert.equal(displayValue('isReview', DATA[0]), 'なし');
        assert.equal(displayValue('hours', DATA[0]), '6h');
    });
});

describe('findByCondition / sameTaskIds', () => {
    test('条件の組合せと「（なし）= その他工数」', () => {
        const c = { from: '2026-08-17', to: '2026-08-21', member: '田中', version: 'V2.3', task: '', process: '' };
        assert.deepEqual(findByCondition(DATA, c).map(a => a.id), [1, 3]);
        assert.deepEqual(findByCondition(DATA, { ...c, version: '__none__' }).map(a => a.id), [2]);
        assert.deepEqual(findByCondition(DATA, { from: '', to: '', member: '', version: '', task: '', process: 'PT' }).map(a => a.id), [3]);
        assert.equal(findByCondition(DATA, { from: '2026-08-25', to: '', member: '', version: '', task: '', process: '' }).length, 0);
    });
    test('同じ対応（版数＋対応名）を本人／全員で', () => {
        const all = [...DATA, A({ id: 6, member: '鈴木', date: '2026-08-20' })];
        assert.deepEqual(sameTaskIds(all, all[0], { sameMember: true }), [1, 3]);
        assert.deepEqual(sameTaskIds(all, all[0], { sameMember: false }), [1, 3, 6]);
    });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd D:/CCwork/.manhour-management-worktrees/feature-actual-bulk-edit && node --test tests/actual-bulk-core.test.js`
Expected: FAIL（`Cannot find module '../js/actual-bulk-core.js'`）

- [ ] **Step 3: 実装**

`js/actual-bulk-core.js`:

```js
// ============================================
// 実績の一括変更 — 適用エンジン（DOM・state 非依存の純粋ロジック）
//   UI は js/actual-bulk.js。ここは node --test で検証する
// ============================================

/** 比較対象のフィールド（isReview は真偽で別途比較） */
export const ACTUAL_FIELDS = ['date', 'version', 'task', 'process', 'member', 'hours'];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 暦日で日付をずらす（文字列分解 → ローカル Date。UTC 往復によるズレを避ける）
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} days 正で未来、負で過去
 * @returns {string}
 */
export function shiftDate(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = new Date(y, m - 1, d + days);
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

/**
 * 'YYYY-MM-DD' として実在する日付か
 * @param {string} s
 * @returns {boolean}
 */
export function isValidDateString(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return shiftDate(s, 0) === s; // 2026-02-30 のような日付は正規化で別日になる
}

/**
 * 2 レコード間で変わったフィールド名
 * @returns {string[]}
 */
export function changedFields(before, after) {
    const fields = ACTUAL_FIELDS.filter(f => before[f] !== after[f]);
    if (!!before.isReview !== !!after.isReview) fields.push('isReview');
    return fields;
}

/**
 * 1 レコードにパッチを適用した新オブジェクトを返す（入力は変更しない）
 * @param {object} actual
 * @param {object} patch BulkPatch
 * @returns {object}
 */
export function applyPatchToActual(actual, patch) {
    const o = { ...actual };
    if (patch.version) o.version = patch.version.set;
    if (patch.task) o.task = patch.task.set;
    if (patch.process) o.process = patch.process.set;
    if (patch.member) o.member = patch.member.set;
    if (patch.isReview === 'on') o.isReview = true;
    if (patch.isReview === 'off') delete o.isReview;
    if (patch.date) {
        if (patch.date.mode === 'set') o.date = patch.date.value;
        else if (patch.date.mode === 'shift') o.date = shiftDate(o.date, Number(patch.date.days) || 0);
    }
    return o;
}

/**
 * 実績 1 件の妥当性（saveActualEdit と同じ規則）
 * @returns {null | 'task-required' | 'process-required' | 'invalid-date'}
 */
export function validateActual(a) {
    if (!a.task || !String(a.task).trim()) return 'task-required';
    if (a.version && !a.process) return 'process-required';
    if (!isValidDateString(a.date)) return 'invalid-date';
    return null;
}

/**
 * 選択 ids にパッチを適用する
 * @param {object[]} actuals 全実績
 * @param {number[]} ids 対象 id
 * @param {object} patch BulkPatch
 * @returns {{ after: object[], changed: {before:object, after:object, fields:string[]}[], invalid: {id:number, reason:string}[] }}
 */
export function applyBulkPatch(actuals, ids, patch) {
    const idSet = new Set(ids);
    const changed = [];
    const invalid = [];
    const after = actuals.map(a => {
        if (!idSet.has(a.id)) return a;
        const next = applyPatchToActual(a, patch);
        const fields = changedFields(a, next);
        if (fields.length === 0) return a;
        const reason = validateActual(next);
        if (reason) invalid.push({ id: a.id, reason });
        changed.push({ before: a, after: next, fields });
        return next;
    });
    return { after, changed, invalid };
}

/**
 * 選択 ids を別日に複製する（元は残す）
 * @param {object[]} actuals
 * @param {number[]} ids
 * @param {string} date 複製先 'YYYY-MM-DD'
 * @param {() => number} nextId id 発番関数（State.nextId）
 * @param {string} [now] createdAt に入れる ISO 文字列
 * @returns {{ after: object[], added: object[] }}
 */
export function duplicateActuals(actuals, ids, date, nextId, now = new Date().toISOString()) {
    const idSet = new Set(ids);
    const added = actuals.filter(a => idSet.has(a.id)).map(a => ({ ...a, id: nextId(), date, createdAt: now }));
    return { after: [...actuals, ...added], added };
}

/**
 * 選択 ids を削除する
 * @returns {{ after: object[], deleted: object[] }}
 */
export function deleteActuals(actuals, ids) {
    const idSet = new Set(ids);
    return {
        after: actuals.filter(a => !idSet.has(a.id)),
        deleted: actuals.filter(a => idSet.has(a.id)),
    };
}

/**
 * 表示用の値（空の版数・工程、レビュー、工数）
 * @param {string} field
 * @param {object} a
 * @returns {string}
 */
export function displayValue(field, a) {
    if (field === 'isReview') return a.isReview ? 'あり' : 'なし';
    if (field === 'version') return a.version || '（その他）';
    if (field === 'process') return a.process || '—';
    if (field === 'hours') return `${Math.round(a.hours * 100) / 100}h`;
    return String(a[field] ?? '');
}

/**
 * フィールドの内訳（件数降順、同数は出現順）
 * @returns {{ value: string, count: number }[]}
 */
export function summarizeField(actuals, field) {
    const map = new Map();
    actuals.forEach(a => { const v = displayValue(field, a); map.set(v, (map.get(v) || 0) + 1); });
    return [...map].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
}

/**
 * 条件で実績を抽出する。空文字の条件は「指定なし」。version '__none__' は「その他工数（version === ''）」
 * @param {object[]} actuals
 * @param {{from:string,to:string,member:string,version:string,task:string,process:string}} cond
 * @returns {object[]}
 */
export function findByCondition(actuals, cond) {
    return actuals.filter(a =>
        (!cond.from || a.date >= cond.from) &&
        (!cond.to || a.date <= cond.to) &&
        (!cond.member || a.member === cond.member) &&
        (!cond.version || (cond.version === '__none__' ? a.version === '' : a.version === cond.version)) &&
        (!cond.task || a.task === cond.task) &&
        (!cond.process || a.process === cond.process)
    );
}

/**
 * seed と同じ対応（版数＋対応名。工程は含めない）の実績 id
 * @param {object[]} actuals
 * @param {object} seed
 * @param {{ sameMember?: boolean }} [opt] true なら同じ担当者に限定
 * @returns {number[]}
 */
export function sameTaskIds(actuals, seed, { sameMember = false } = {}) {
    return actuals
        .filter(a => a.version === seed.version && a.task === seed.task && (!sameMember || a.member === seed.member))
        .map(a => a.id);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/actual-bulk-core.test.js`
Expected: PASS（全テスト green）。あわせて `npm run lint` が新規ファイルで警告を出さないこと。

- [ ] **Step 5: コミット**

```bash
git add js/actual-bulk-core.js tests/actual-bulk-core.test.js
git commit -m "feat(actual-bulk): 実績一括変更の適用エンジン（純粋ロジック）を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Undo/Redo に `actual_bulk_edit` を追加（`js/history.js`）

**Files:**
- Modify: `js/history.js:223-228`（applyUndo の `estimate_bulk_edit` 分岐の直後）, `js/history.js:333-336`（applyRedo 同様）, `js/history.js:412-440`（`restoreBulkEdit`）
- Test: `tests/history.test.js`（末尾に describe を追加）

**Interfaces:**
- Consumes: `State.actuals` / `State.setActuals`（既存）
- Produces: アクション型 `'actual_bulk_edit'`。`data` の形:
  `{ beforeActuals?: Actual[], afterActuals?: Actual[], deletedActuals?: Actual[], addedActualIds?: number[] }`
  - 編集: `beforeActuals` + `afterActuals`（変更対象のみ）
  - 削除: `deletedActuals`
  - 複製: `afterActuals`（追加分）+ `addedActualIds`

- [ ] **Step 1: 失敗するテストを書く**

`tests/history.test.js` の末尾に追加（ファイル先頭のポリフィルと `resetAll` はそのまま使う）:

```js
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
});
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/history.test.js`
Expected: 新 3 テストが FAIL（`未対応のUndoタイプ: actual_bulk_edit` の警告とともに undo が適用されない）

- [ ] **Step 3: 実装**

`js/history.js` applyUndo（:223 付近）の `estimate_bulk_edit` 分岐の直後に追加:

```js
    } else if (t === 'actual_bulk_edit') {
        // 実績の一括編集/削除/複製: 変更前に復元
        restoreBulkEdit(action.data, 'before');
```

applyRedo（:333 付近）の `estimate_bulk_edit` 分岐の直後に追加:

```js
    } else if (t === 'actual_bulk_edit') {
        restoreBulkEdit(action.data, 'after');
```

`restoreBulkEdit` の実績ブロック（:431-439）を次に置き換える:

```js
    const actuals = direction === 'before' ? data.beforeActuals : data.afterActuals;
    if (actuals) {
        actuals.forEach(act => {
            const idx = State.actuals.findIndex(a => a.id === act.id);
            if (idx !== -1) {
                State.actuals[idx] = { ...act };
            } else {
                // 複製の redo など、一度消えたレコードを戻す
                State.actuals.push({ ...act });
            }
        });
    }
    // 一括削除: undo で復元、redo で再削除
    if (data.deletedActuals && data.deletedActuals.length) {
        if (direction === 'before') {
            const existing = new Set(State.actuals.map(a => a.id));
            data.deletedActuals.forEach(a => { if (!existing.has(a.id)) State.actuals.push({ ...a }); });
        } else {
            const ids = new Set(data.deletedActuals.map(a => a.id));
            State.setActuals(State.actuals.filter(a => !ids.has(a.id)));
        }
    }
    // 一括複製: undo で追加分を除去（redo は afterActuals の push で戻る）
    if (direction === 'before' && data.addedActualIds && data.addedActualIds.length) {
        const ids = new Set(data.addedActualIds);
        State.setActuals(State.actuals.filter(a => !ids.has(a.id)));
    }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/history.test.js && node --test`
Expected: すべて PASS（既存の `estimate_bulk_edit`/`task_edit` テストも含む）

- [ ] **Step 5: コミット**

```bash
git add js/history.js tests/history.test.js
git commit -m "feat(history): 実績一括変更 actual_bulk_edit の Undo/Redo（編集・削除・複製）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 選択状態とリストの選択モード・選択バー

**Files:**
- Modify: `js/state.js:250-252`（見積関連の直後に実績の選択状態）, `js/state.js:424-427`（setter の隣）
- Create: `js/actual-bulk.js`（このタスクでは選択・選択バー部分。モーダルは Task 4 以降で同ファイルに追記）
- Modify: `js/actual.js:5-8`（import）, `js/actual.js:110-166`（`renderActualList` 末尾）, `js/actual.js:720-762`（`renderActualListView` の表）
- Modify: `index.html:951`（`<div id="actualList"></div>` の前後）
- Modify: `js/init.js:248-263` 付近（`window.*` 公開）, `js/events.js:106-`（ボタン登録）, `js/ui.js:162-166`（`showTab` の早期リターン直後）
- Modify: `style.css`（末尾に追記）
- Test: `tests/e2e/actual-bulk-edit.spec.js`（新規。このタスクでは選択モードのテストのみ）

**Interfaces:**
- Consumes: なし（Task 1/2 の関数はまだ使わない）
- Produces:
  - `state.js`: `actualSelectionMode: boolean`, `selectedActualIds: Set<number>`, `setActualSelectionMode(v)`
  - `actual-bulk.js` exports: `toggleActualSelectionMode()`, `toggleActualSelection(id, event)`, `toggleAllVisibleActuals(event)`, `clearActualSelection()`, `selectActualIds(ids, { replace = false })`, `deselectActualIds(ids)`, `getSelectedActuals()`, `updateActualSelectionUI()`
  - DOM id: `#btnActualSelectionMode`, `#actualSelectionTray`, `#actualSelectionCount`, `#btnBulkActualEdit`, `#btnBulkActualCopy`, `#btnBulkActualDelete`, `#btnBulkActualClear`, `#btnBulkActualCondition`, `#actualSelectAll`
  - 一覧の行: `<tr data-actual-id="…" class="is-selected">`

- [ ] **Step 1: 失敗する e2e テストを書く**

`tests/e2e/actual-bulk-edit.spec.js`（新規）:

```js
// 実績のまとめ変更（一括編集）— リスト選択／条件／タイムライン／モバイル
import { test, expect } from "@playwright/test";

const YM = new Date().toISOString().slice(0, 7); // タイムラインは当月を表示するため当月の日付で seed する
const D = (dd) => `${YM}-${String(dd).padStart(2, "0")}`;

const ESTIMATES = [
  { id: 1, version: "V2.3", task: "帳票A出力改修", process: "PG", member: "田中", hours: 40, workMonth: YM, workMonths: [YM], monthlyHours: { [YM]: 40 } },
  { id: 2, version: "V2.4", task: "帳票A出力改修（追補）", process: "PG", member: "田中", hours: 40, workMonth: YM, workMonths: [YM], monthlyHours: { [YM]: 40 } },
  { id: 3, version: "V2.3", task: "ログイン画面改修", process: "UI", member: "佐藤", hours: 24, workMonth: YM, workMonths: [YM], monthlyHours: { [YM]: 24 } },
];
const A = (id, dd, version, task, process, member, hours, extra = {}) =>
  ({ id, date: D(dd), version, task, process, member, hours, createdAt: "2026-08-01T00:00:00.000Z", ...extra });
const ACTUALS = [
  A(1, 17, "V2.3", "帳票A出力改修", "PG", "田中", 6),
  A(2, 17, "", "打ち合わせ", "", "田中", 2),
  A(3, 17, "V2.3", "ログイン画面改修", "UI", "佐藤", 8),
  A(4, 18, "V2.3", "帳票A出力改修", "PG", "田中", 8),
  A(5, 18, "V2.3", "ログイン画面改修", "PG", "佐藤", 6, { isReview: true }),
  A(7, 19, "V2.3", "帳票A出力改修", "PT", "田中", 8),
  A(9, 20, "V2.3", "帳票A出力改修", "PT", "田中", 7),
  A(11, 21, "V2.3", "帳票A出力改修", "IT", "田中", 8),
  A(13, 24, "V2.4", "帳票A出力改修（追補）", "IT", "田中", 8),
];
const TARGET_IDS = [1, 4, 7, 9, 11];

const SEED = {
  manhour_estimates: JSON.stringify(ESTIMATES),
  manhour_actuals: JSON.stringify(ACTUALS),
  manhour_currentTab: "actual",
};
const readActuals = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("manhour_actuals")));

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, SEED);
  await page.goto("/index.html");
  await expect(page.locator("#actual")).toHaveClass(/active/);
  await page.selectOption("#actualViewType", "list");
  await page.selectOption("#actualMonthFilter", "all");
});

test("選択モード: 行クリックで選択し、選択バーに件数と合計が出る", async ({ page }) => {
  await expect(page.locator("#actualSelectionTray")).toBeHidden();
  await page.locator("#btnActualSelectionMode").click();
  await expect(page.locator("#actualSelectionTray")).toBeVisible();
  await expect(page.locator("#actualSelectionCount")).toContainText("0 件");

  await page.locator('tr[data-actual-id="1"] td:nth-child(3)').click();
  await page.locator('tr[data-actual-id="4"] td:nth-child(3)').click();
  await expect(page.locator("#actualSelectionCount")).toContainText("2 件");
  await expect(page.locator("#actualSelectionCount")).toContainText("14h");
  await expect(page.locator('tr[data-actual-id="1"]')).toHaveClass(/is-selected/);

  // Shift+クリックで範囲選択（表示順で 4 → 11 の間）
  await page.locator('tr[data-actual-id="11"] td:nth-child(3)').click({ modifiers: ["Shift"] });
  const n = await page.locator("tr.is-selected").count();
  expect(n).toBeGreaterThanOrEqual(3);

  // ヘッダーの ✓ で表示中を全選択 → 解除
  await page.locator("#actualSelectAll").click();
  await expect(page.locator("#actualSelectionCount")).toContainText(`${ACTUALS.length} 件`);
  await page.locator("#btnBulkActualClear").click();
  await expect(page.locator("#actualSelectionCount")).toContainText("0 件");

  // モードを切ると ✓ 列が消え、操作列が戻る
  await page.locator("#btnActualSelectionMode").click();
  await expect(page.locator("#actualSelectionTray")).toBeHidden();
  await expect(page.locator("#actualSelectAll")).toHaveCount(0);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js`
Expected: FAIL（`#btnActualSelectionMode` が存在しない）

- [ ] **Step 3: state.js に選択状態を追加**

`js/state.js` の :252 `export const selectedEstimateIds = new Set();` の直後:

```js

// 実績関連（一括変更）
export let actualSelectionMode = false;      // 実績リストの選択モード
export const selectedActualIds = new Set();  // 選択中の実績ID（リスト／タイムラインで共有）
```

`js/state.js` の `setWorkMonthSelectionMode`（:424-427）の直後:

```js

export function setActualSelectionMode(value) {
    actualSelectionMode = value;
    window.actualSelectionMode = value;
}
```

- [ ] **Step 4: index.html に選択モードボタンと選択バーを追加**

`index.html:951` の `<div id="actualList"></div>` の**直前**に:

```html
                <!-- 実績の一括変更: 選択モード切替 -->
                <div id="actualSelectionToolbar" style="display: flex; justify-content: flex-end; margin: 0 0 8px;">
                    <button type="button" class="btn btn-secondary btn-small" id="btnActualSelectionMode">選択モード</button>
                </div>
```

`<div id="actualTimeline" …>…</div>` の閉じタグの**直後**（実績タブ `#actual` の末尾）に:

```html
                <!-- 実績の一括変更: 選択バー（下部トレイ）＋ 条件で選択 ポップオーバー -->
                <div id="actualSelectionTray" class="bk-dock" style="display: none;">
                    <div id="actualConditionPopover" class="bk-pop" style="display: none;" role="dialog" aria-label="条件で選択">
                        <div class="bk-pop-head">
                            <span class="bk-pop-title">条件で選択 <span class="bk-muted">— 条件に合う実績をまとめて ✓ にする</span></span>
                            <button type="button" class="bk-x" id="btnActualConditionClose" aria-label="閉じる">&times;</button>
                        </div>
                        <div class="bk-cond">
                            <label>期間</label>
                            <div class="bk-cond-range"><input type="date" id="actualCondFrom"><span>〜</span><input type="date" id="actualCondTo"></div>
                            <label>担当</label><select id="actualCondMember"><option value="">指定なし</option></select>
                            <label>版数</label><select id="actualCondVersion"><option value="">指定なし</option><option value="__none__">（なし = その他工数）</option></select>
                            <label>対応名</label><select id="actualCondTask"><option value="">指定なし</option></select>
                            <label>工程</label><select id="actualCondProcess"><option value="">指定なし</option></select>
                        </div>
                        <div class="bk-pop-foot">
                            <div class="bk-hits" id="actualCondHits">該当<b>0</b>件</div>
                            <div class="bk-pop-actions">
                                <button type="button" class="btn btn-secondary btn-small" id="btnActualConditionReplace" disabled>この条件だけを選択</button>
                                <button type="button" class="btn btn-primary btn-small" id="btnActualConditionAdd" disabled>選択に追加</button>
                            </div>
                        </div>
                    </div>
                    <div class="bk-bar" role="toolbar" aria-label="選択した実績への操作">
                        <span class="bk-bar-count" id="actualSelectionCount">0 件選択中</span>
                        <button type="button" class="btn btn-ghost" id="btnBulkActualCondition">条件で選択…</button>
                        <button type="button" class="btn btn-primary" id="btnBulkActualEdit" disabled>一括編集</button>
                        <button type="button" class="btn btn-ghost" id="btnBulkActualCopy" disabled>別日に複製</button>
                        <button type="button" class="btn btn-ghost" id="btnBulkActualDelete" disabled>削除</button>
                        <button type="button" class="btn btn-ghost" id="btnBulkActualClear" disabled>選択解除</button>
                    </div>
                </div>
```

- [ ] **Step 5: `js/actual-bulk.js` を新規作成（選択と選択バー）**

```js
// ============================================
// 実績の一括変更 — UI（選択状態・選択バー・条件で選択・一括編集/複製モーダル）
//   純粋ロジックは js/actual-bulk-core.js
// ============================================

import {
    actuals, estimates, setActuals, nextId, memberOrder,
    actualSelectionMode, setActualSelectionMode, selectedActualIds,
} from './state.js';
import { pushAction, undo } from './history.js';
import { showAlert, sortMembers, formatHours, escapeHtml } from './utils.js';
import { PROCESS } from './constants.js';
import {
    applyBulkPatch, duplicateActuals, deleteActuals, summarizeField, displayValue,
    findByCondition, sameTaskIds, isValidDateString,
} from './actual-bulk-core.js';

const $ = (id) => document.getElementById(id);

// ============================================
// 選択状態
// ============================================

/** 表示中の一覧行を DOM 順で返す（Shift 範囲選択と全選択に使う） */
function visibleRowIds() {
    return [...document.querySelectorAll('#actualList tr[data-actual-id]')].map(tr => Number(tr.dataset.actualId));
}

let lastClickedId = null;

/** 選択モードのオン/オフ。オフで選択もクリア */
export function toggleActualSelectionMode() {
    setActualSelectionMode(!actualSelectionMode);
    selectedActualIds.clear();
    lastClickedId = null;
    closeActualConditionPopover();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    updateActualSelectionUI();
}

/**
 * 一覧の行クリック。Shift で直前クリック行との範囲選択
 * @param {number} id
 * @param {MouseEvent} [event]
 */
export function toggleActualSelection(id, event) {
    if (!actualSelectionMode) return;
    if (event) event.stopPropagation();
    const ids = visibleRowIds();
    if (event && event.shiftKey && lastClickedId !== null && ids.includes(lastClickedId) && ids.includes(id)) {
        const [a, b] = [ids.indexOf(lastClickedId), ids.indexOf(id)].sort((x, y) => x - y);
        ids.slice(a, b + 1).forEach(x => selectedActualIds.add(x));
    } else if (selectedActualIds.has(id)) {
        selectedActualIds.delete(id);
    } else {
        selectedActualIds.add(id);
    }
    lastClickedId = id;
    updateActualSelectionUI();
}

/** ヘッダーの ✓: 表示中を全選択／全解除 */
export function toggleAllVisibleActuals(event) {
    if (event) event.stopPropagation();
    const ids = visibleRowIds();
    const all = ids.length > 0 && ids.every(x => selectedActualIds.has(x));
    ids.forEach(x => all ? selectedActualIds.delete(x) : selectedActualIds.add(x));
    updateActualSelectionUI();
}

export function clearActualSelection() {
    selectedActualIds.clear();
    lastClickedId = null;
    updateActualSelectionUI();
}

/**
 * id 群を選択に加える（タイムライン・条件から使う）
 * @param {number[]} ids
 * @param {{ replace?: boolean }} [opt] true なら現在の選択を置き換える
 */
export function selectActualIds(ids, { replace = false } = {}) {
    if (replace) selectedActualIds.clear();
    ids.forEach(x => selectedActualIds.add(Number(x)));
    updateActualSelectionUI();
}

export function deselectActualIds(ids) {
    ids.forEach(x => selectedActualIds.delete(Number(x)));
    updateActualSelectionUI();
}

/** 選択中の実績レコード（存在しない id は無視） */
export function getSelectedActuals() {
    return actuals.filter(a => selectedActualIds.has(a.id));
}

/** 選択バー・一覧の行・タイムラインのバーの見た目を状態に合わせる（再描画はしない） */
export function updateActualSelectionUI() {
    const viewType = $('actualViewType')?.value;
    const selected = getSelectedActuals();
    const n = selected.length;

    // 実在しない id を掃除
    const alive = new Set(actuals.map(a => a.id));
    [...selectedActualIds].forEach(x => { if (!alive.has(x)) selectedActualIds.delete(x); });

    const tray = $('actualSelectionTray');
    if (tray) tray.style.display = (actualSelectionMode || viewType === 'timeline') ? 'flex' : 'none';

    const modeBtn = $('btnActualSelectionMode');
    if (modeBtn) {
        modeBtn.classList.toggle('is-on', actualSelectionMode);
        modeBtn.textContent = actualSelectionMode ? '✓ 選択モード' : '選択モード';
        modeBtn.style.display = viewType === 'timeline' ? 'none' : '';
    }

    const count = $('actualSelectionCount');
    if (count) {
        count.innerHTML = n
            ? `${n} 件選択中<span class="bk-bar-sub"> · 合計 ${formatHours(selected.reduce((s, a) => s + a.hours, 0))}h</span>`
            : `0 件選択中<span class="bk-bar-sub"> · ${viewType === 'timeline' ? 'バーをクリックして選択' : '行をクリックして選択'}</span>`;
    }
    ['btnBulkActualEdit', 'btnBulkActualCopy', 'btnBulkActualDelete', 'btnBulkActualClear'].forEach(id => { const b = $(id); if (b) b.disabled = n === 0; });

    // 一覧の行
    document.querySelectorAll('#actualList tr[data-actual-id]').forEach(tr => {
        const on = selectedActualIds.has(Number(tr.dataset.actualId));
        tr.classList.toggle('is-selected', on);
        const cb = tr.querySelector('input.bk-cb'); if (cb) cb.checked = on;
    });
    const all = $('actualSelectAll');
    if (all) { const ids = visibleRowIds(); all.checked = ids.length > 0 && ids.every(x => selectedActualIds.has(x)); }

    // タイムラインのバー（全 id が選択済みなら selected）
    document.querySelectorAll('.actual-tl-bar.actual[data-actual-ids]').forEach(bar => {
        const ids = bar.dataset.actualIds.split(',').map(Number);
        bar.classList.toggle('selected', ids.length > 0 && ids.every(x => selectedActualIds.has(x)));
    });
}

// ============================================
// 条件で選択（Task 6 で実装。ここでは閉じる関数のみ）
// ============================================

export function closeActualConditionPopover() {
    const pop = $('actualConditionPopover');
    if (pop) pop.style.display = 'none';
    const b = $('btnBulkActualCondition'); if (b) b.classList.remove('is-on');
}

console.log('✅ モジュール actual-bulk.js loaded');
```

（`estimates`, `nextId`, `memberOrder`, `pushAction`, `undo`, `showAlert`, `sortMembers`, `escapeHtml`, `PROCESS`, core 関数の多くは Task 4〜6 で使う。ESLint の `no-unused-vars` が出る場合はこのタスクでは import を最小にし、使うタスクで追加する。）

- [ ] **Step 6: `js/actual.js` の一覧に ✓ 列・行クリックを追加**

import（:5-8）を次に変更:

```js
import {
    estimates, actuals, remainingEstimates,
    setActuals,
    nextId,
    actualSelectionMode, selectedActualIds } from './state.js';
```

`renderActualListView`（:720）のヘッダー行を置き換え:

```js
    const selMode = actualSelectionMode;
    let html = '<div class="table-wrapper"><table class="bk-table"><tr>'
        + (selMode ? '<th class="bk-th-check"><input type="checkbox" class="bk-cb" id="actualSelectAll" onclick="toggleAllVisibleActuals(event)" aria-label="表示中を全選択"></th>' : '')
        + '<th>日付</th><th>版数</th><th>対応名</th><th>工程</th><th>担当</th><th>実績工数</th>'
        + (selMode ? '' : '<th>操作</th>') + '</tr>';
```

行の生成（:744-759 の `sortedActuals.forEach`）を置き換え:

```js
    sortedActuals.forEach(a => {
        const on = selMode && selectedActualIds.has(a.id);
        html += `
            <tr data-actual-id="${a.id}" class="${on ? 'is-selected' : ''}" ${selMode ? `onclick="toggleActualSelection(${a.id}, event)"` : ''}>
                ${selMode ? `<td class="bk-th-check"><input type="checkbox" class="bk-cb" ${on ? 'checked' : ''} onclick="toggleActualSelection(${a.id}, event)" aria-label="この実績を選択"></td>` : ''}
                <td>${escapeHtml(a.date)}</td>
                <td>${escapeHtml(a.version)}</td>
                <td>${escapeHtml(a.task)}</td>
                <td><span class="badge badge-${escapeHtml(a.process.toLowerCase())}">${escapeHtml(a.process)}</span>${reviewBadgeHtml(a.isReview)}</td>
                <td>${escapeHtml(a.member)}</td>
                <td>${escapeHtml(String(a.hours))}h</td>
                ${selMode ? '' : `<td>
                    <button class="btn btn-primary btn-small" onclick="editActual(${a.id})" style="margin-right: 5px;">編集</button>
                    <button class="btn btn-danger btn-small" onclick="deleteActual(${a.id})">削除</button>
                </td>`}
            </tr>
        `;
    });
```

`renderActualList`（:110-166）の末尾、`updateSegmentedButtons` の呼び出しの直後に:

```js
    // 一括変更の選択 UI（選択バー・行のハイライト）を表示形式に合わせる
    if (typeof window.updateActualSelectionUI === 'function') window.updateActualSelectionUI();
```

- [ ] **Step 7: init.js / events.js / ui.js の配線**

`js/init.js`: 先頭の `import * as ActualTimeline from './actual-timeline.js';`（:26）の直後に
`import * as ActualBulk from './actual-bulk.js';` を追加し、`window.saveActualEdit = Actual.saveActualEdit;`（:263）の直後に:

```js
// 実績の一括変更（onclick 文字列から呼ぶもの）
window.toggleActualSelection = ActualBulk.toggleActualSelection;
window.toggleAllVisibleActuals = ActualBulk.toggleAllVisibleActuals;
window.updateActualSelectionUI = ActualBulk.updateActualSelectionUI;
window.clearActualSelection = ActualBulk.clearActualSelection;
window.selectActualIds = ActualBulk.selectActualIds;
window.deselectActualIds = ActualBulk.deselectActualIds;
```

`js/events.js`: import 群の末尾（:104 の state.js import の直後）に
`import * as ActualBulk from './actual-bulk.js';` を追加し、`initEventHandlers` の本文冒頭（:108 の前）に:

```js
    // 実績の一括変更
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('btnActualSelectionMode', ActualBulk.toggleActualSelectionMode);
    bind('btnBulkActualClear', ActualBulk.clearActualSelection);
```

`js/ui.js` `showTab`（:162-166 の早期リターンの直後）に:

```js
    // 実績タブを離れるときは一括変更の選択を持ち越さない
    if (currentTabId === 'actual' && tabName !== 'actual' && typeof window.clearActualSelection === 'function') {
        window.clearActualSelection();
    }
```

- [ ] **Step 8: style.css に選択 UI のスタイルを追記（ファイル末尾）**

```css
/* ============================================
   実績の一括変更（bk-*）: 選択モード・選択バー・条件ポップオーバー・一括編集モーダル
   設計: docs/superpowers/specs/2026-08-29-actual-bulk-edit-design.md
   ============================================ */
.bk-table th.bk-th-check, .bk-table td.bk-th-check { width: 38px; text-align: center; padding-left: 10px; padding-right: 6px; }
.bk-table tr[onclick] { cursor: pointer; }
.bk-table tr.is-selected td { background: var(--accent-light); }
.bk-table tr.is-hit td { background: var(--accent-secondary-light); }
.bk-cb { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; vertical-align: middle; }
.bk-muted { color: var(--text-muted); }
#btnActualSelectionMode.is-on { background: var(--accent); color: #fff; border-color: var(--accent); }

.bk-dock { position: sticky; bottom: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 14px; pointer-events: none; z-index: 20; }
.bk-bar {
    pointer-events: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    background: var(--text-primary); color: #fff; padding: 10px 14px; border-radius: 12px;
    box-shadow: 0 10px 28px rgba(26, 24, 20, .28); width: min(100%, 760px);
}
.bk-bar-count { font-weight: 700; margin-right: auto; font-size: calc(15px * var(--ui-scale)); }
.bk-bar-sub { font-weight: 500; color: rgba(255, 255, 255, .7); }
.bk-bar .btn { padding: 6px 12px; font-size: calc(14px * var(--ui-scale)); }
.bk-bar .btn-primary { background: #fff; color: var(--text-primary); }
.bk-bar .btn-primary:hover { background: #f1efe9; }
.bk-bar .btn-ghost { background: rgba(255, 255, 255, .1); color: #fff; border: 1px solid rgba(255, 255, 255, .28); }
.bk-bar .btn-ghost:hover { background: rgba(255, 255, 255, .18); }
.bk-bar .btn-ghost.is-on { background: #fff; color: var(--text-primary); }
.bk-bar .btn:disabled { opacity: .4; cursor: default; }

.bk-pop { pointer-events: auto; width: min(100%, 760px); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 30px rgba(26, 24, 20, .16); padding: 12px 14px; }
.bk-pop-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.bk-pop-title { font-size: calc(13px * var(--ui-scale)); font-weight: 800; color: var(--accent); letter-spacing: .04em; }
.bk-pop-title .bk-muted { font-weight: 500; letter-spacing: 0; }
.bk-x { border: 0; background: none; color: var(--text-muted); font: inherit; font-size: calc(18px * var(--ui-scale)); cursor: pointer; padding: 2px 6px; }
.bk-cond { display: grid; grid-template-columns: 56px minmax(0, 1fr) 56px minmax(0, 1fr); gap: 8px 10px; align-items: center; }
.bk-cond label { font-size: calc(13.5px * var(--ui-scale)); font-weight: 600; color: var(--text-secondary); }
.bk-cond select, .bk-cond input { width: 100%; min-width: 0; padding: 6px 8px; font-size: calc(14px * var(--ui-scale)); }
.bk-cond-range { display: flex; gap: 6px; align-items: center; min-width: 0; }
.bk-cond-range input { flex: 1 1 0; }
.bk-cond-range span { color: var(--text-muted); font-size: calc(13px * var(--ui-scale)); }
.bk-pop-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
.bk-pop-actions { display: flex; gap: 8px; }
.bk-pop-note { color: var(--accent-secondary); font-weight: 600; margin-left: 8px; font-size: calc(13px * var(--ui-scale)); }
.bk-hits { font-size: calc(14px * var(--ui-scale)); color: var(--text-secondary); }
.bk-hits b { font-size: calc(20px * var(--ui-scale)); color: var(--accent); font-weight: 800; margin: 0 2px; }
.bk-hits.is-zero b { color: var(--danger); }
@media (max-width: 640px) { .bk-cond { grid-template-columns: 56px minmax(0, 1fr); } }

/* 一括編集モーダルの項目行 */
.bk-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 99px; padding: 2px; background: var(--surface-elevated); flex-shrink: 0; }
.bk-seg button { border: 0; background: none; font: inherit; font-size: calc(13px * var(--ui-scale)); font-weight: 600; color: var(--text-secondary); padding: 4px 11px; border-radius: 99px; cursor: pointer; white-space: nowrap; }
.bk-seg button.is-on { background: var(--surface); color: var(--accent); box-shadow: var(--shadow-sm); }
.bk-field { padding: 10px 0; border-bottom: 1px solid var(--border-light); }
.bk-field-head { display: flex; justify-content: space-between; align-items: center; gap: 8px 10px; flex-wrap: wrap; }
.bk-field-head > div:first-child { flex: 1 1 200px; min-width: 0; }
.bk-field-name { font-weight: 700; color: var(--text-primary); font-size: calc(15px * var(--ui-scale)); }
.bk-field-current { font-size: calc(12.5px * var(--ui-scale)); color: var(--text-muted); margin-top: 1px; }
.bk-field-body { margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.bk-field-body select, .bk-field-body input { width: auto; min-width: 160px; }
.bk-field.is-keep .bk-field-body { display: none; }
.bk-preview { margin-top: 14px; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 14px; }
.bk-preview-title { font-size: calc(12.5px * var(--ui-scale)); font-weight: 700; color: var(--text-secondary); letter-spacing: .04em; }
.bk-preview-title .bk-muted { font-weight: 500; letter-spacing: 0; margin-left: 6px; }
.bk-preview p { margin-top: 6px; font-size: calc(13.5px * var(--ui-scale)); line-height: 1.55; }
.bk-diff { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: calc(14px * var(--ui-scale)); margin-top: 8px; line-height: 1.5; }
.bk-diff-date { color: var(--text-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.bk-diff .old { color: var(--text-muted); text-decoration: line-through; }
.bk-diff .new { color: var(--accent); font-weight: 700; }
.bk-diff-f { font-size: calc(12px * var(--ui-scale)); color: var(--text-muted); font-weight: 600; margin-right: 2px; }
.bk-sep { color: var(--border); margin: 0 6px; }
.bk-warn { color: var(--danger); font-size: calc(13.5px * var(--ui-scale)); margin-top: 8px; font-weight: 600; }

/* 適用後のトースト（元に戻す付き） */
.bk-undo-toast {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 10001;
    background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--accent);
    border-radius: 10px; padding: 10px 14px; box-shadow: var(--shadow-md);
    display: flex; gap: 12px; align-items: center; font-size: calc(14.5px * var(--ui-scale));
}
.bk-undo-toast button { border: 0; background: none; color: var(--accent); font: inherit; font-weight: 700; cursor: pointer; padding: 2px 4px; }
.bk-undo-toast .bk-x { color: var(--text-muted); font-weight: 600; }

/* タイムライン: 選択中のバーと右クリックメニュー */
.actual-tl-bar.actual.selected { outline: 3px solid var(--text-primary); outline-offset: 1px; }
.actual-tl-ctx-menu {
    position: fixed; z-index: 10002; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md);
    box-shadow: 0 12px 30px rgba(26, 24, 20, .18); min-width: 260px; max-width: 340px; padding: 6px;
}
.actual-tl-ctx-head { padding: 8px 10px 10px; border-bottom: 1px solid var(--border-light); margin-bottom: 4px; display: flex; flex-direction: column; gap: 2px; font-size: calc(12.5px * var(--ui-scale)); color: var(--text-secondary); }
.actual-tl-ctx-head b { font-size: calc(14.5px * var(--ui-scale)); color: var(--text-primary); }
.actual-tl-ctx-item { display: block; width: 100%; text-align: left; border: 0; background: none; font: inherit; font-size: calc(14px * var(--ui-scale)); padding: 8px 10px; border-radius: 6px; cursor: pointer; color: var(--text-primary); }
.actual-tl-ctx-item:hover { background: var(--accent-light); }
.actual-tl-ctx-item.is-primary { font-weight: 700; color: var(--accent); }
.actual-tl-ctx-sep { height: 1px; background: var(--border-light); margin: 4px 0; }
```

- [ ] **Step 9: e2e が通ることを確認**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js && node --test && npm run lint`
Expected: PASS。`node scripts/codemap.mjs --check` も緑（hook が再生成しているはず。赤なら `node scripts/codemap.mjs` を実行して `docs/CODEMAP.md` もコミットに含める）

- [ ] **Step 10: コミット**

```bash
git add js/state.js js/actual-bulk.js js/actual.js js/init.js js/events.js js/ui.js index.html style.css tests/e2e/actual-bulk-edit.spec.js docs/CODEMAP.md
git commit -m "feat(actual-bulk): 実績リストの選択モードと選択バーを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 一括編集モーダル（項目ごとの「変更しない／変更する」＋プレビュー＋適用＋Undo トースト）

**Files:**
- Modify: `js/actual-bulk.js`（追記）, `index.html`（`#bulkRemainingModal` の直前にモーダル追加）, `js/modal.js:456-471`, `js/events.js`（ボタン登録）, `js/init.js`（公開）
- Test: `tests/e2e/actual-bulk-edit.spec.js`（テスト追加）

**Interfaces:**
- Consumes: Task 1 `applyBulkPatch`, `summarizeField`, `displayValue`, `isValidDateString`; Task 2 `actual_bulk_edit`; Task 3 の選択状態
- Produces: `openBulkActualEditModal()`, `closeBulkActualEditModal()`, `applyBulkActualEdit()`, `showUndoToast(message)`; DOM `#bulkActualEditModal`, `#bulkActualEditTitle`, `#bulkActualFields`, `#bulkActualPreview`, `#btnBulkActualApply`, `#btnBulkActualEditCancel`, `#btnCloseBulkActualEditModal`, `.bk-undo-toast`
- パッチ UI の DOM 規約: 項目行 `.bk-field[data-field=version|task|process|member|isReview|date]`、セグメント `button[data-seg][data-v]`、値 `[data-val]`

- [ ] **Step 1: 失敗する e2e テストを書く**（`actual-bulk-edit.spec.js` に追記）

```js
test("一括編集: 5 件の版数・対応名を付け替え、他は不変、Undo で全件戻る", async ({ page }) => {
  await page.locator("#btnActualSelectionMode").click();
  for (const id of TARGET_IDS) await page.locator(`tr[data-actual-id="${id}"] td:nth-child(3)`).click();
  await expect(page.locator("#actualSelectionCount")).toContainText("5 件");

  await page.locator("#btnBulkActualEdit").click();
  const modal = page.locator("#bulkActualEditModal");
  await expect(modal).toBeVisible();
  await expect(page.locator("#bulkActualEditTitle")).toContainText("5 件");
  await expect(page.locator('.bk-field[data-field="version"] .bk-field-current')).toContainText("V2.3 ×5");
  await expect(page.locator("#btnBulkActualApply")).toBeDisabled(); // まだ何も変えていない

  await page.locator('.bk-field[data-field="version"] button[data-seg][data-v="set"]').click();
  await page.locator('.bk-field[data-field="version"] select[data-val]').selectOption("V2.4");
  await page.locator('.bk-field[data-field="task"] button[data-seg][data-v="set"]').click();
  await page.locator('.bk-field[data-field="task"] select[data-val]').selectOption("帳票A出力改修（追補）");
  await expect(page.locator("#bulkActualPreview")).toContainText("変わる 5 件");
  await expect(page.locator("#btnBulkActualApply")).toBeEnabled();
  await page.locator("#btnBulkActualApply").click();
  await expect(modal).toBeHidden();

  let saved = await readActuals(page);
  for (const id of TARGET_IDS) {
    const a = saved.find((x) => x.id === id);
    expect(a.version).toBe("V2.4");
    expect(a.task).toBe("帳票A出力改修（追補）");
  }
  expect(saved.find((x) => x.id === 2)).toEqual(ACTUALS.find((x) => x.id === 2)); // 打ち合わせは不変
  expect(saved.find((x) => x.id === 3)).toEqual(ACTUALS.find((x) => x.id === 3));
  await expect(page.locator("#actualSelectionCount")).toContainText("0 件");

  // トーストの「元に戻す」で 1 回で全件復元
  await page.locator(".bk-undo-toast button.bk-undo").click();
  saved = await readActuals(page);
  expect(saved.map((a) => ({ ...a }))).toEqual(ACTUALS);
});

test("一括編集: その他工数に版数だけ付けると警告が出て適用できない", async ({ page }) => {
  await page.locator("#btnActualSelectionMode").click();
  await page.locator('tr[data-actual-id="2"] td:nth-child(3)').click();
  await page.locator("#btnBulkActualEdit").click();
  await page.locator('.bk-field[data-field="version"] button[data-seg][data-v="set"]').click();
  await page.locator('.bk-field[data-field="version"] select[data-val]').selectOption("V2.3");
  await expect(page.locator("#bulkActualPreview .bk-warn")).toContainText("工程が空");
  await expect(page.locator("#btnBulkActualApply")).toBeDisabled();
  await page.locator('.bk-field[data-field="process"] button[data-seg][data-v="set"]').click();
  await page.locator('.bk-field[data-field="process"] select[data-val]').selectOption("PG");
  await expect(page.locator("#btnBulkActualApply")).toBeEnabled();
  await page.locator("#btnBulkActualEditCancel").click();
  await expect(page.locator("#bulkActualEditModal")).toBeHidden();
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js -g "一括編集"`
Expected: FAIL（`#bulkActualEditModal` が存在しない）

- [ ] **Step 3: index.html にモーダルを追加**（`<!-- 見込残存時間一括編集モーダル -->`（:2043）の直前）

```html
    <!-- 実績の一括編集モーダル -->
    <div id="bulkActualEditModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="bulkActualEditTitle">選択した実績を一括編集</h3>
                <button class="modal-close" id="btnCloseBulkActualEditModal" aria-label="閉じる">&times;</button>
            </div>
            <div class="modal-body">
                <div id="bulkActualFields"></div>
                <div id="bulkActualPreview"></div>
            </div>
            <div class="modal-footer" style="justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="btnBulkActualEditCancel">キャンセル</button>
                <button type="button" class="btn btn-primary" id="btnBulkActualApply" disabled>適用</button>
            </div>
        </div>
    </div>
```

- [ ] **Step 4: `js/actual-bulk.js` にモーダルを実装**（`console.log(...)` の前に追記）

```js
// ============================================
// 一括編集モーダル
// ============================================

const PATCH_FIELDS = ['version', 'task', 'process', 'member', 'isReview', 'date'];
const FIELD_LABEL = { date: '日付', version: '版数', task: '対応名', process: '工程', member: '担当', isReview: 'レビュー', hours: '工数' };

/** モーダル内で編集中のパッチ（UI 状態）。適用時に BulkPatch へ変換する */
let ui = null;

function newPatchUI() {
    return {
        version: { on: false, val: '' }, task: { on: false, val: '', free: '' }, process: { on: false, val: '' },
        member: { on: false, val: '' }, isReview: 'keep', date: { mode: 'keep', value: '', days: 7 },
    };
}

/** 版数一覧（見積＋実績）。空版数は含めない */
function versionOptions() {
    return [...new Set([...estimates.map(e => e.version), ...actuals.map(a => a.version)].filter(Boolean))].sort();
}
/** 対応名候補。version が null なら全体、'' はその他工数の実績由来 */
function taskOptions(version) {
    const src = version === null
        ? [...estimates.map(e => e.task), ...actuals.map(a => a.task)]
        : [...estimates.filter(e => e.version === version).map(e => e.task), ...actuals.filter(a => a.version === version).map(a => a.task)];
    return [...new Set(src.filter(Boolean))];
}
function memberOptions() {
    return sortMembers([...new Set([...estimates.map(e => e.member), ...actuals.map(a => a.member)].filter(Boolean))], memberOrder || '');
}
const opt = (arr, cur, labelFn) => arr.map(v => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(labelFn ? labelFn(v) : v)}</option>`).join('');

/** UI 状態 → BulkPatch（core の入力形） */
function toBulkPatch(u) {
    const p = {};
    if (u.version.on) p.version = { set: u.version.val };
    if (u.task.on) p.task = { set: u.task.val === '__free__' ? u.task.free.trim() : u.task.val };
    if (u.process.on) p.process = { set: u.process.val };
    if (u.member.on) p.member = { set: u.member.val };
    if (u.isReview !== 'keep') p.isReview = u.isReview;
    if (u.date.mode === 'set') p.date = { mode: 'set', value: u.date.value };
    if (u.date.mode === 'shift') p.date = { mode: 'shift', days: Number(u.date.days) || 0 };
    return p;
}

function summaryText(targets, field) {
    const parts = summarizeField(targets, field).map(s => `${escapeHtml(s.value)} ×${s.count}`);
    return parts.length > 3 ? `${parts.slice(0, 3).join('、')}、他 ${parts.length - 3} 種` : (parts.join('、') || '—');
}
const segBtn = (field, v, cur, label) => `<button type="button" data-seg data-field="${field}" data-v="${v}" class="${cur === v ? 'is-on' : ''}">${label}</button>`;

function renderPatchFields(targets) {
    const u = ui;
    const fld = (field, isKeep, seg, body) => `
        <div class="bk-field ${isKeep ? 'is-keep' : ''}" data-field="${field}">
            <div class="bk-field-head">
                <div><div class="bk-field-name">${FIELD_LABEL[field]}</div><div class="bk-field-current">現在: ${summaryText(targets, field)}</div></div>
                <div class="bk-seg">${seg}</div>
            </div>
            <div class="bk-field-body">${body}</div>
        </div>`;
    const two = (field, on) => segBtn(field, 'keep', on ? 'set' : 'keep', '変更しない') + segBtn(field, 'set', on ? 'set' : 'keep', '変更する');
    const tOpts = taskOptions(u.version.on ? u.version.val : null);
    const dm = u.date.mode;
    $('bulkActualFields').innerHTML = [
        fld('version', !u.version.on, two('version', u.version.on),
            `<select data-val>${opt(['', ...versionOptions()], u.version.val, v => v || '（なし = その他工数）')}</select>`),
        fld('task', !u.task.on, two('task', u.task.on),
            `<select data-val>${opt([...tOpts, '__free__'], u.task.val, v => v === '__free__' ? '（直接入力）' : v)}</select>`
            + `<input type="text" data-free placeholder="対応名を入力" value="${escapeHtml(u.task.free)}" style="${u.task.val === '__free__' ? '' : 'display:none'}">`),
        fld('process', !u.process.on, two('process', u.process.on),
            `<select data-val>${opt(['', ...PROCESS.TYPES], u.process.val, v => v || '（なし）')}</select>`),
        fld('member', !u.member.on, two('member', u.member.on),
            `<select data-val>${opt(memberOptions(), u.member.val)}</select>`),
        fld('isReview', true, segBtn('isReview', 'keep', u.isReview, '変更しない') + segBtn('isReview', 'on', u.isReview, '付ける') + segBtn('isReview', 'off', u.isReview, '外す'), ''),
        fld('date', dm === 'keep', segBtn('date', 'keep', dm, '変更しない') + segBtn('date', 'set', dm, '指定日に') + segBtn('date', 'shift', dm, '日数をずらす'),
            dm === 'set'
                ? `<input type="date" data-val value="${u.date.value}">`
                : `<input type="number" data-val value="${u.date.days}" step="1" style="width:90px;min-width:0"> <span class="bk-muted">日（マイナスで前へ）</span>`),
    ].join('');
}

function renderPreview(targets) {
    const { changed, invalid } = applyBulkPatch(actuals, targets.map(a => a.id), toBulkPatch(ui));
    const box = $('bulkActualPreview');
    let html = `<div class="bk-preview"><div class="bk-preview-title">変更後プレビュー<span class="bk-muted">対象 ${targets.length} 件 · 変わる ${changed.length} 件</span></div>`;
    if (!changed.length) {
        html += '<p class="bk-muted">「変更する」に切り替えて値を選ぶと、ここに変更前 → 変更後が出ます。</p>';
    } else {
        html += '<div class="bk-diff">';
        changed.slice(0, 3).forEach(c => {
            const diff = c.fields.map(f => `<span class="bk-diff-f">${FIELD_LABEL[f]}</span><span class="old">${escapeHtml(displayValue(f, c.before))}</span> → <span class="new">${escapeHtml(displayValue(f, c.after))}</span>`).join('<span class="bk-sep">·</span>');
            html += `<span class="bk-diff-date">${escapeHtml(c.before.date)} ${escapeHtml(c.before.member)}</span><span>${diff}</span>`;
        });
        html += '</div>';
        if (changed.length > 3) html += `<p class="bk-muted">他 ${changed.length - 3} 件も同じ規則で変わります。</p>`;
    }
    const proc = invalid.filter(i => i.reason === 'process-required').length;
    const date = invalid.filter(i => i.reason === 'invalid-date').length;
    const task = invalid.filter(i => i.reason === 'task-required').length;
    if (proc) html += `<p class="bk-warn">⚠ ${proc} 件で版数があるのに工程が空です。工程も「変更する」で指定してください。</p>`;
    if (date) html += `<p class="bk-warn">⚠ ${date} 件で日付が不正です。</p>`;
    if (task) html += `<p class="bk-warn">⚠ ${task} 件で対応名が空です。</p>`;
    box.innerHTML = html + '</div>';
    $('btnBulkActualApply').disabled = changed.length === 0 || invalid.length > 0;
    $('btnBulkActualApply').textContent = `${targets.length} 件に適用`;
}

function rerenderModal() {
    const targets = getSelectedActuals();
    renderPatchFields(targets);
    renderPreview(targets);
}

/** 選択中の実績を対象に一括編集モーダルを開く */
export function openBulkActualEditModal() {
    const targets = getSelectedActuals();
    if (!targets.length) { showAlert('実績を選択してください', false); return; }
    ui = newPatchUI();
    ui.version.val = versionOptions()[0] || '';
    ui.task.val = taskOptions(null)[0] || '__free__';
    ui.process.val = PROCESS.TYPES[0];
    ui.member.val = memberOptions()[0] || '';
    ui.date.value = targets[0].date;
    $('bulkActualEditTitle').textContent = `選択した ${targets.length} 件を一括編集`;
    rerenderModal();
    $('bulkActualEditModal').style.display = 'flex';
}

export function closeBulkActualEditModal() {
    $('bulkActualEditModal').style.display = 'none';
    ui = null;
}

/** モーダル内のセグメント／値変更（イベント委譲。Task 4 Step 5 で登録） */
function onBulkFieldClick(e) {
    const btn = e.target.closest('button[data-seg]'); if (!btn || !ui) return;
    const f = btn.dataset.field, v = btn.dataset.v;
    if (f === 'isReview') ui.isReview = v;
    else if (f === 'date') ui.date.mode = v;
    else {
        ui[f].on = v === 'set';
        if (f === 'version') { const to = taskOptions(ui.version.on ? ui.version.val : null); if (!to.includes(ui.task.val) && ui.task.val !== '__free__') ui.task.val = to[0] || '__free__'; }
    }
    rerenderModal();
}
function onBulkFieldChange(e) {
    const row = e.target.closest('.bk-field'); if (!row || !ui) return;
    const f = row.dataset.field, v = e.target.value;
    if (e.target.matches('[data-free]')) { ui.task.free = v; renderPreview(getSelectedActuals()); return; }
    if (f === 'date') { if (ui.date.mode === 'set') ui.date.value = v; else ui.date.days = v; }
    else if (f === 'version') { ui.version.val = v; const to = taskOptions(v); if (!to.includes(ui.task.val) && ui.task.val !== '__free__') ui.task.val = to[0] || '__free__'; }
    else ui[f].val = v;
    rerenderModal();
}

/** 適用: エンジン → State → pushAction → 保存 → 再描画 */
export function applyBulkActualEdit() {
    const targets = getSelectedActuals();
    const patch = toBulkPatch(ui);
    const { after, changed, invalid } = applyBulkPatch(actuals, targets.map(a => a.id), patch);
    if (!changed.length || invalid.length) return;
    setActuals(after);
    const fields = [...new Set(changed.flatMap(c => c.fields))].map(f => FIELD_LABEL[f]).join('・');
    pushAction({
        type: 'actual_bulk_edit',
        description: `実績一括編集: ${fields} × ${changed.length}件`,
        data: { beforeActuals: changed.map(c => ({ ...c.before })), afterActuals: changed.map(c => ({ ...c.after })) },
    });
    afterBulkChange(`${changed.length} 件の実績を更新しました`);
    closeBulkActualEditModal();
}

/** 一括操作後の共通後処理: 保存・選択クリア・全画面更新・Undo トースト */
function afterBulkChange(message) {
    if (typeof window.saveData === 'function') window.saveData();
    selectedActualIds.clear();
    lastClickedId = null;
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
    updateActualSelectionUI();
    showUndoToast(message);
}

/** 「元に戻す」付きトースト（8 秒で消える） */
export function showUndoToast(message) {
    document.querySelectorAll('.bk-undo-toast').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'bk-undo-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" class="bk-undo">元に戻す</button><button type="button" class="bk-x" aria-label="閉じる">&times;</button>`;
    el.querySelector('.bk-undo').addEventListener('click', () => { el.remove(); undo(); });
    el.querySelector('.bk-x').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
}

/** モーダルのイベント委譲を登録（initEventHandlers から 1 回呼ぶ） */
export function initBulkActualModalEvents() {
    const modal = $('bulkActualEditModal'); if (!modal) return;
    modal.addEventListener('click', onBulkFieldClick);
    modal.addEventListener('change', onBulkFieldChange);
    modal.addEventListener('input', (e) => { if (e.target.matches('[data-free]') && ui) { ui.task.free = e.target.value; renderPreview(getSelectedActuals()); } });
}
```

- [ ] **Step 5: 配線**

`js/events.js` の Task 3 で追加した `bind(...)` 群の直後に:

```js
    bind('btnBulkActualEdit', ActualBulk.openBulkActualEditModal);
    bind('btnBulkActualEditCancel', ActualBulk.closeBulkActualEditModal);
    bind('btnCloseBulkActualEditModal', ActualBulk.closeBulkActualEditModal);
    bind('btnBulkActualApply', ActualBulk.applyBulkActualEdit);
    ActualBulk.initBulkActualModalEvents();
```

`js/modal.js` `setupModalHandlers` の配列（:456-471）に追加:

```js
        { id: 'bulkActualEditModal', closeFunc: () => { if (typeof window.closeBulkActualEditModal === 'function') window.closeBulkActualEditModal(); } },
```

`js/init.js` の Task 3 で追加した公開の直後に:

```js
window.openBulkActualEditModal = ActualBulk.openBulkActualEditModal;
window.closeBulkActualEditModal = ActualBulk.closeBulkActualEditModal;
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js && node --test && npm run lint`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add js/actual-bulk.js js/events.js js/modal.js js/init.js index.html tests/e2e/actual-bulk-edit.spec.js docs/CODEMAP.md
git commit -m "feat(actual-bulk): 一括編集モーダル（変更しない/変更する・プレビュー・一括Undo）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 一括削除と別日に複製

**Files:**
- Modify: `js/actual-bulk.js`（追記）, `index.html`（複製モーダル）, `js/modal.js`, `js/events.js`, `js/init.js`
- Test: `tests/e2e/actual-bulk-edit.spec.js`（追記）

**Interfaces:**
- Consumes: Task 1 `deleteActuals`, `duplicateActuals`, `isValidDateString`; Task 4 `afterBulkChange`
- Produces: `deleteSelectedActuals()`, `openBulkActualCopyModal()`, `closeBulkActualCopyModal()`, `applyBulkActualCopy()`; DOM `#bulkActualCopyModal`, `#bulkActualCopyDate`, `#bulkActualCopyPreview`, `#btnBulkActualCopyApply`, `#btnBulkActualCopyCancel`, `#btnCloseBulkActualCopyModal`

- [ ] **Step 1: 失敗する e2e テストを書く**（追記）

```js
test("一括削除は確認あり、複製は指定日に新規追加。どちらも Undo で戻る", async ({ page }) => {
  await page.locator("#btnActualSelectionMode").click();
  await page.locator('tr[data-actual-id="1"] td:nth-child(3)').click();
  await page.locator('tr[data-actual-id="4"] td:nth-child(3)').click();

  // 複製
  await page.locator("#btnBulkActualCopy").click();
  await expect(page.locator("#bulkActualCopyModal")).toBeVisible();
  await page.locator("#bulkActualCopyDate").fill(D(26));
  await expect(page.locator("#bulkActualCopyPreview")).toContainText("2 件");
  await page.locator("#btnBulkActualCopyApply").click();
  let saved = await readActuals(page);
  expect(saved.length).toBe(ACTUALS.length + 2);
  const copies = saved.filter((a) => a.date === D(26));
  expect(copies.map((a) => a.task).sort()).toEqual(["帳票A出力改修", "帳票A出力改修"]);
  expect(new Set(saved.map((a) => a.id)).size).toBe(saved.length); // id は一意
  await page.locator(".bk-undo-toast button.bk-undo").click();
  expect((await readActuals(page)).length).toBe(ACTUALS.length);

  // 削除（confirm を accept）
  await page.locator('tr[data-actual-id="2"] td:nth-child(3)').click();
  page.once("dialog", (d) => { expect(d.message()).toContain("1 件"); d.accept(); });
  await page.locator("#btnBulkActualDelete").click();
  saved = await readActuals(page);
  expect(saved.find((a) => a.id === 2)).toBeUndefined();
  await page.locator(".bk-undo-toast button.bk-undo").click();
  saved = await readActuals(page);
  expect(saved.find((a) => a.id === 2)).toEqual(ACTUALS.find((a) => a.id === 2));

  // 削除（confirm を dismiss → 何も変わらない）
  await page.locator('tr[data-actual-id="3"] td:nth-child(3)').click();
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#btnBulkActualDelete").click();
  expect((await readActuals(page)).find((a) => a.id === 3)).toBeTruthy();
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js -g "一括削除"`
Expected: FAIL（`#bulkActualCopyModal` が存在しない）

- [ ] **Step 3: index.html に複製モーダルを追加**（Task 4 のモーダルの直後）

```html
    <!-- 実績の一括複製モーダル -->
    <div id="bulkActualCopyModal" class="modal">
        <div class="modal-content" style="max-width: min(calc(480px * var(--ui-scale)), 90vw);">
            <div class="modal-header">
                <h3 id="bulkActualCopyTitle">選択した実績を別日に複製</h3>
                <button class="modal-close" id="btnCloseBulkActualCopyModal" aria-label="閉じる">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">複製先の日付</label>
                    <input type="date" id="bulkActualCopyDate" style="max-width: 200px;">
                </div>
                <div id="bulkActualCopyPreview"></div>
            </div>
            <div class="modal-footer" style="justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="btnBulkActualCopyCancel">キャンセル</button>
                <button type="button" class="btn btn-primary" id="btnBulkActualCopyApply">複製</button>
            </div>
        </div>
    </div>
```

- [ ] **Step 4: `js/actual-bulk.js` に削除・複製を追記**

```js
// ============================================
// 一括削除・別日に複製
// ============================================

/** 選択中の実績を確認のうえ削除（Undo 可） */
export function deleteSelectedActuals() {
    const targets = getSelectedActuals();
    if (!targets.length) return;
    if (!confirm(`${targets.length} 件の実績を削除しますか？`)) return;
    const { after, deleted } = deleteActuals(actuals, targets.map(a => a.id));
    setActuals(after);
    pushAction({ type: 'actual_bulk_edit', description: `実績一括削除: ${deleted.length}件`, data: { deletedActuals: deleted.map(a => ({ ...a })) } });
    afterBulkChange(`${deleted.length} 件の実績を削除しました`);
}

function renderCopyPreview() {
    const targets = getSelectedActuals();
    const date = $('bulkActualCopyDate').value;
    const ok = isValidDateString(date);
    const list = targets.slice(0, 4).map(a => `<span class="bk-diff-date">${escapeHtml(a.date)} → <b>${escapeHtml(date || '?')}</b></span><span>${escapeHtml(a.member)} ${escapeHtml(a.task)} ${escapeHtml(a.process || '—')} ${formatHours(a.hours)}h</span>`).join('');
    $('bulkActualCopyPreview').innerHTML = `<div class="bk-preview"><div class="bk-preview-title">複製プレビュー<span class="bk-muted">${targets.length} 件を新規追加（元は残す）</span></div><div class="bk-diff">${list}</div>${targets.length > 4 ? `<p class="bk-muted">他 ${targets.length - 4} 件</p>` : ''}${ok ? '' : '<p class="bk-warn">⚠ 複製先の日付を入力してください。</p>'}</div>`;
    $('btnBulkActualCopyApply').disabled = !ok;
    $('btnBulkActualCopyApply').textContent = `${targets.length} 件を複製`;
}

export function openBulkActualCopyModal() {
    const targets = getSelectedActuals();
    if (!targets.length) { showAlert('実績を選択してください', false); return; }
    $('bulkActualCopyTitle').textContent = `選択した ${targets.length} 件を別日に複製`;
    $('bulkActualCopyDate').value = targets[0].date;
    renderCopyPreview();
    $('bulkActualCopyModal').style.display = 'flex';
}

export function closeBulkActualCopyModal() {
    $('bulkActualCopyModal').style.display = 'none';
}

export function applyBulkActualCopy() {
    const targets = getSelectedActuals();
    const date = $('bulkActualCopyDate').value;
    if (!targets.length || !isValidDateString(date)) return;
    const { after, added } = duplicateActuals(actuals, targets.map(a => a.id), date, nextId);
    setActuals(after);
    pushAction({ type: 'actual_bulk_edit', description: `実績一括複製: ${added.length}件 → ${date}`, data: { afterActuals: added.map(a => ({ ...a })), addedActualIds: added.map(a => a.id) } });
    afterBulkChange(`${added.length} 件の実績を ${date} に複製しました`);
    closeBulkActualCopyModal();
}

/** 複製モーダルの日付変更でプレビュー更新（initEventHandlers から呼ぶ） */
export function initBulkActualCopyEvents() {
    const input = $('bulkActualCopyDate'); if (!input) return;
    input.addEventListener('change', renderCopyPreview);
    input.addEventListener('input', renderCopyPreview);
}
```

- [ ] **Step 5: 配線**

`js/events.js`（Task 4 の bind 群の直後）:

```js
    bind('btnBulkActualDelete', ActualBulk.deleteSelectedActuals);
    bind('btnBulkActualCopy', ActualBulk.openBulkActualCopyModal);
    bind('btnBulkActualCopyCancel', ActualBulk.closeBulkActualCopyModal);
    bind('btnCloseBulkActualCopyModal', ActualBulk.closeBulkActualCopyModal);
    bind('btnBulkActualCopyApply', ActualBulk.applyBulkActualCopy);
    ActualBulk.initBulkActualCopyEvents();
```

`js/modal.js` の配列に追加:

```js
        { id: 'bulkActualCopyModal', closeFunc: () => { if (typeof window.closeBulkActualCopyModal === 'function') window.closeBulkActualCopyModal(); } },
```

`js/init.js` に追加:

```js
window.closeBulkActualCopyModal = ActualBulk.closeBulkActualCopyModal;
window.deleteSelectedActuals = ActualBulk.deleteSelectedActuals;
```

- [ ] **Step 6: テスト確認 → コミット**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js && node --test && npm run lint`
Expected: PASS

```bash
git add js/actual-bulk.js js/events.js js/modal.js js/init.js index.html tests/e2e/actual-bulk-edit.spec.js docs/CODEMAP.md
git commit -m "feat(actual-bulk): 選択した実績の一括削除（確認あり）と別日に複製

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 条件で選択（ポップオーバー）

**Files:**
- Modify: `js/actual-bulk.js`（`closeActualConditionPopover` を置き換え・追記）, `js/events.js`, `js/actual.js`（行の `is-hit`）
- Test: `tests/e2e/actual-bulk-edit.spec.js`（追記）

**Interfaces:**
- Consumes: Task 1 `findByCondition`; Task 3 の DOM（`#actualConditionPopover` と各 `#actualCond*`）
- Produces: `toggleActualConditionPopover()`, `closeActualConditionPopover()`, `updateActualConditionHits()`, `applyActualCondition(mode: 'add'|'replace')`, `getActualCondition()`, `isActualConditionOpen()`

- [ ] **Step 1: 失敗する e2e テストを書く**（追記）

```js
test("条件で選択: 担当・版数・対応名で該当 5 件、ハイライトと件数、選択に追加", async ({ page }) => {
  await page.locator("#btnActualSelectionMode").click();
  await page.locator("#btnBulkActualCondition").click();
  await expect(page.locator("#actualConditionPopover")).toBeVisible();
  await expect(page.locator("#btnActualConditionAdd")).toBeEnabled(); // 条件なし = 全件該当

  await page.selectOption("#actualCondMember", "田中");
  await page.selectOption("#actualCondVersion", "V2.3");
  await page.selectOption("#actualCondTask", "帳票A出力改修");
  await expect(page.locator("#actualCondHits")).toContainText("5");
  await expect(page.locator("#actualCondHits")).toContainText("37h");
  expect(await page.locator("tr.is-hit").count()).toBe(5);

  await page.locator("#btnActualConditionAdd").click();
  await expect(page.locator("#actualConditionPopover")).toBeHidden();
  await expect(page.locator("#actualSelectionCount")).toContainText("5 件");
  expect(await page.locator("tr.is-hit").count()).toBe(0);

  // 「この条件だけを選択」は置き換え
  await page.locator('tr[data-actual-id="2"] td:nth-child(3)').click();
  await expect(page.locator("#actualSelectionCount")).toContainText("6 件");
  await page.locator("#btnBulkActualCondition").click();
  await page.selectOption("#actualCondVersion", "__none__");
  await page.selectOption("#actualCondTask", "");
  await expect(page.locator("#actualCondHits")).toContainText("1");
  await page.locator("#btnActualConditionReplace").click();
  await expect(page.locator("#actualSelectionCount")).toContainText("1 件");

  // 表示フィルタ外の該当は注記される
  await page.selectOption("#actualMemberSelect", "佐藤").catch(() => {});
  await page.selectOption("#actualViewMode", "member");
  await page.selectOption("#actualMemberSelect", "佐藤");
  await page.locator("#btnBulkActualCondition").click();
  await page.selectOption("#actualCondVersion", "V2.3");
  await page.selectOption("#actualCondMember", "田中");
  await expect(page.locator("#actualCondHits")).toContainText("表示外");
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js -g "条件で選択"`
Expected: FAIL（ポップオーバーが開かない／件数が更新されない）

- [ ] **Step 3: `js/actual-bulk.js` の条件セクションを実装**（Task 3 で置いた `closeActualConditionPopover` を置き換え）

```js
// ============================================
// 条件で選択（ポップオーバー）
// ============================================

let condOpen = false;

export const isActualConditionOpen = () => condOpen;

/** 現在の条件（DOM から読む） */
export function getActualCondition() {
    return {
        from: $('actualCondFrom')?.value || '', to: $('actualCondTo')?.value || '',
        member: $('actualCondMember')?.value || '', version: $('actualCondVersion')?.value || '',
        task: $('actualCondTask')?.value || '', process: $('actualCondProcess')?.value || '',
    };
}

function fillConditionOptions() {
    const keep = (sel) => sel.value;
    const m = $('actualCondMember'); const mv = keep(m);
    m.innerHTML = `<option value="">指定なし</option>${opt(memberOptions(), mv)}`;
    const v = $('actualCondVersion'); const vv = keep(v);
    v.innerHTML = `<option value="">指定なし</option><option value="__none__" ${vv === '__none__' ? 'selected' : ''}>（なし = その他工数）</option>${opt(versionOptions(), vv)}`;
    const t = $('actualCondTask'); const tv = keep(t);
    t.innerHTML = `<option value="">指定なし</option>${opt(taskOptions(null), tv)}`;
    const p = $('actualCondProcess'); const pv = keep(p);
    p.innerHTML = `<option value="">指定なし</option>${opt(PROCESS.TYPES, pv)}`;
}

/** 該当件数・合計・表示外注記・一覧ハイライトを更新 */
export function updateActualConditionHits() {
    if (!condOpen) return;
    const hits = findByCondition(actuals, getActualCondition());
    const visible = new Set(visibleRowIds());
    const hidden = visible.size ? hits.filter(a => !visible.has(a.id)).length : 0;
    const box = $('actualCondHits');
    box.classList.toggle('is-zero', hits.length === 0);
    box.innerHTML = `該当<b>${hits.length}</b>件${hits.length ? ` · ${formatHours(hits.reduce((s, a) => s + a.hours, 0))}h` : ' — 条件を広げてください'}${hidden ? `<span class="bk-pop-note">表示外 ${hidden} 件を含む</span>` : ''}`;
    $('btnActualConditionAdd').disabled = hits.length === 0;
    $('btnActualConditionReplace').disabled = hits.length === 0;
    const hitIds = new Set(hits.map(a => a.id));
    document.querySelectorAll('#actualList tr[data-actual-id]').forEach(tr => tr.classList.toggle('is-hit', hitIds.has(Number(tr.dataset.actualId))));
    document.querySelectorAll('.actual-tl-bar.actual[data-actual-ids]').forEach(bar => {
        const ids = bar.dataset.actualIds.split(',').map(Number);
        bar.classList.toggle('is-hit', ids.every(x => hitIds.has(x)));
    });
}

export function toggleActualConditionPopover() {
    if (condOpen) { closeActualConditionPopover(); return; }
    condOpen = true;
    fillConditionOptions();
    $('actualConditionPopover').style.display = 'block';
    $('btnBulkActualCondition').classList.add('is-on');
    updateActualConditionHits();
}

export function closeActualConditionPopover() {
    condOpen = false;
    const pop = $('actualConditionPopover'); if (pop) pop.style.display = 'none';
    const b = $('btnBulkActualCondition'); if (b) b.classList.remove('is-on');
    document.querySelectorAll('#actualList tr.is-hit, .actual-tl-bar.is-hit').forEach(el => el.classList.remove('is-hit'));
}

/**
 * 条件に合う実績を選択へ
 * @param {'add'|'replace'} mode add=和集合、replace=置き換え
 */
export function applyActualCondition(mode) {
    const hits = findByCondition(actuals, getActualCondition());
    if (!hits.length) return;
    selectActualIds(hits.map(a => a.id), { replace: mode === 'replace' });
    closeActualConditionPopover();
}

/** 条件入力のイベント登録（initEventHandlers から呼ぶ） */
export function initActualConditionEvents() {
    ['actualCondFrom', 'actualCondTo', 'actualCondMember', 'actualCondVersion', 'actualCondTask', 'actualCondProcess'].forEach(id => {
        const el = $(id); if (el) { el.addEventListener('change', updateActualConditionHits); el.addEventListener('input', updateActualConditionHits); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && condOpen) closeActualConditionPopover(); });
}
```

`updateActualSelectionUI()` の末尾に 1 行追加（再描画後も該当ハイライトを保つ）:

```js
    if (condOpen) updateActualConditionHits();
```

- [ ] **Step 4: 配線**（`js/events.js` の bind 群に追加）

```js
    bind('btnBulkActualCondition', ActualBulk.toggleActualConditionPopover);
    bind('btnActualConditionClose', ActualBulk.closeActualConditionPopover);
    bind('btnActualConditionAdd', () => ActualBulk.applyActualCondition('add'));
    bind('btnActualConditionReplace', () => ActualBulk.applyActualCondition('replace'));
    ActualBulk.initActualConditionEvents();
```

- [ ] **Step 5: テスト確認 → コミット**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js && node --test && npm run lint`
Expected: PASS

```bash
git add js/actual-bulk.js js/events.js docs/CODEMAP.md tests/e2e/actual-bulk-edit.spec.js
git commit -m "feat(actual-bulk): 条件で選択（該当件数・ハイライト・追加/置き換え）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: タイムライン（ガント）からの選択

**Files:**
- Modify: `js/actual-timeline.js`
  - import（ファイル先頭の `from './state.js'`）に `selectedActualIds` を追加
  - :336-353（ガントのバー描画）に `selected` クラス
  - :1236-1240（バーのクリック登録）に `contextmenu`
  - :1870-1887 `onActualBarClick` に修飾キー分岐
  - :2034-2037 `showBarDetailPanel` の `.actual-tl-dp-actions`、:2098-2107 `showGroupDetailPanel` にボタン追加
  - 新規: `onActualBarContextMenu(e)`, `showBarContextMenu(ids, x, y)`, `closeBarContextMenu()`, `barIdsOf(bar)`
- Test: `tests/e2e/actual-bulk-edit.spec.js`（追記）

**Interfaces:**
- Consumes: Task 3 `window.selectActualIds` / `window.deselectActualIds` / `window.updateActualSelectionUI`; Task 4 `window.openBulkActualEditModal`; Task 1 `sameTaskIds`（`actual-bulk-core.js` から import）
- Produces: DOM `.actual-tl-bar.actual.selected`、`.actual-tl-ctx-menu`（`#atlCtxMenu`）、詳細パネル内 `#atlDpSelect`, `#atlDpSelectSame`, `#atlDpBulkEdit`

- [ ] **Step 1: 失敗する e2e テストを書く**（追記）

```js
test("タイムライン: 結合バーから 5 件を選び、詳細パネルの一括編集で付け替える", async ({ page }) => {
  await page.selectOption("#actualViewType", "timeline");
  const bar = page.locator(`.actual-tl-bar.actual[data-actual-ids="${TARGET_IDS.join(",")}"]`);
  await expect(bar).toBeVisible();
  await expect(page.locator("#actualSelectionTray")).toBeVisible(); // タイムラインではトレイ常設

  // クリック → 詳細パネル → 「この 5 件を一括編集…」
  await bar.click();
  await expect(page.locator("#atlDetailPanel")).toBeVisible();
  await expect(page.locator("#atlDpBulkEdit")).toContainText("5 件");
  await page.locator("#atlDpBulkEdit").click();
  await expect(page.locator("#bulkActualEditModal")).toBeVisible();
  await page.locator('.bk-field[data-field="version"] button[data-seg][data-v="set"]').click();
  await page.locator('.bk-field[data-field="version"] select[data-val]').selectOption("V2.4");
  await page.locator('.bk-field[data-field="task"] button[data-seg][data-v="set"]').click();
  await page.locator('.bk-field[data-field="task"] select[data-val]').selectOption("帳票A出力改修（追補）");
  await page.locator("#btnBulkActualApply").click();
  const saved = await readActuals(page);
  for (const id of TARGET_IDS) expect(saved.find((a) => a.id === id).version).toBe("V2.4");
  // 結合バーの表示名が変わる（id 集合は同じ）
  await expect(page.locator(`.actual-tl-bar.actual[data-actual-ids="${TARGET_IDS.join(",")}"]`)).toContainText("帳票A出力改修（追補）");
});

test("タイムライン: Ctrl+クリックでトグル、右クリックでメニュー、Escape で閉じる", async ({ page }) => {
  await page.selectOption("#actualViewType", "timeline");
  const bar = page.locator(`.actual-tl-bar.actual[data-actual-ids="${TARGET_IDS.join(",")}"]`);
  await bar.click({ modifiers: ["Control"] });
  await expect(bar).toHaveClass(/selected/);
  await expect(page.locator("#actualSelectionCount")).toContainText("5 件");
  await expect(page.locator("#atlDetailPanel")).toHaveCount(0); // 修飾キー時は詳細を開かない
  await bar.click({ modifiers: ["Control"] });
  await expect(bar).not.toHaveClass(/selected/);
  await expect(page.locator("#actualSelectionCount")).toContainText("0 件");

  await page.locator('.actual-tl-bar.actual[data-actual-ids="2"]').click({ button: "right" });
  const menu = page.locator("#atlCtxMenu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("打ち合わせ");
  await menu.locator("button", { hasText: "このバーの 1 件を選択" }).click();
  await expect(page.locator("#actualSelectionCount")).toContainText("1 件");
  await expect(menu).toHaveCount(0);

  await bar.click({ button: "right" });
  await menu.locator("button", { hasText: "同じ対応をすべて選択（田中" }).click();
  await expect(page.locator("#actualSelectionCount")).toContainText("6 件"); // 1 + 5

  await bar.click({ button: "right" });
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js -g "タイムライン"`
Expected: FAIL（`#atlDpBulkEdit` が無い／`selected` が付かない）

- [ ] **Step 3: `js/actual-timeline.js` を変更**

(a) import: `from './state.js'` の import 名に `selectedActualIds` を追加。`from './actual-bulk-core.js'` の import を新設:

```js
import { sameTaskIds } from './actual-bulk-core.js';
```

(b) バー描画（:336 `const mergedClass = ...` の直後）:

```js
            const selectedClass = bar.ids.length > 0 && bar.ids.every(id => selectedActualIds.has(Number(id))) ? ' selected' : '';
```
そして :340 と :347 の `class="actual-tl-bar actual${mergedClass}"` を `class="actual-tl-bar actual${mergedClass}${selectedClass}"` に（2 箇所）。

(c) バーのイベント登録（:1236-1240 の `bar.addEventListener('click', onActualBarClick);` の直後）:

```js
        bar.addEventListener('contextmenu', onActualBarContextMenu);
```

(d) `onActualBarClick`（:1870）を置き換え:

```js
/** バー要素が持つ実績 id（単一 data-actual-id か複数 data-actual-ids） */
function barIdsOf(bar) {
    const raw = bar.dataset.actualIds || bar.dataset.actualId || '';
    return raw.split(',').filter(Boolean).map(Number);
}

/**
 * 実績バークリック → 詳細パネル。Ctrl/Meta/Shift 付きなら選択トグルのみ
 */
function onActualBarClick(e) {
    e.stopPropagation();
    const bar = e.currentTarget;
    const ids = barIdsOf(bar);
    if (ids.length === 0) return;

    if ((e.ctrlKey || e.metaKey || e.shiftKey) && typeof window.selectActualIds === 'function') {
        const all = ids.every(id => selectedActualIds.has(id));
        if (all) window.deselectActualIds(ids); else window.selectActualIds(ids);
        return;
    }
    if (ids.length === 1) {
        showBarDetailPanel(ids[0]);
    } else {
        showGroupDetailPanel(ids);
    }
}

/** 右クリック → 選択メニュー */
function onActualBarContextMenu(e) {
    const ids = barIdsOf(e.currentTarget);
    if (ids.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    showBarContextMenu(ids, e.clientX, e.clientY);
}

function closeBarContextMenu() {
    const m = document.getElementById('atlCtxMenu');
    if (m) m.remove();
}

/**
 * バーの選択メニュー（詳細パネルと同じ操作を右クリックで）
 * @param {number[]} ids
 * @param {number} x clientX
 * @param {number} y clientY
 */
function showBarContextMenu(ids, x, y) {
    closeBarContextMenu();
    const items = ids.map(id => actuals.find(a => a.id === id)).filter(Boolean);
    if (!items.length) return;
    const b = items[0];
    const allSel = ids.every(id => selectedActualIds.has(id));
    const procs = [...new Set(items.map(a => a.process || '—'))].join('·');
    const dates = items.map(a => a.date).sort();
    const sameMember = sameTaskIds(actuals, b, { sameMember: true });
    const sameAll = sameTaskIds(actuals, b, { sameMember: false });
    const total = items.reduce((s, a) => s + (a.hours || 0), 0);

    const menu = document.createElement('div');
    menu.className = 'actual-tl-ctx-menu';
    menu.id = 'atlCtxMenu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
        <div class="actual-tl-ctx-head"><b>${escapeHtml(b.task)}</b><span>${escapeHtml(b.version || '（その他）')} · ${escapeHtml(b.member)} · ${escapeHtml(procs)}</span><span>${dates[0]}${dates[0] !== dates[dates.length - 1] ? '〜' + dates[dates.length - 1] : ''} · ${ids.length} 件 · ${formatHours(total)}h</span></div>
        <button type="button" class="actual-tl-ctx-item" data-act="select">${allSel ? 'このバーの選択を外す' : `このバーの ${ids.length} 件を選択`}</button>
        <button type="button" class="actual-tl-ctx-item" data-act="same-member">同じ対応をすべて選択（${escapeHtml(b.member)} · ${sameMember.length} 件）</button>
        <button type="button" class="actual-tl-ctx-item" data-act="same-all">同じ対応をすべて選択（全員 · ${sameAll.length} 件）</button>
        <div class="actual-tl-ctx-sep"></div>
        <button type="button" class="actual-tl-ctx-item is-primary" data-act="edit">この ${ids.length} 件を一括編集…</button>
    `;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;

    menu.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-act]'); if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'select') { if (allSel) window.deselectActualIds(ids); else window.selectActualIds(ids); }
        else if (act === 'same-member') window.selectActualIds(sameMember);
        else if (act === 'same-all') window.selectActualIds(sameAll);
        else if (act === 'edit') { window.selectActualIds(ids, { replace: true }); window.openBulkActualEditModal(); }
        closeBarContextMenu();
    });
    const onDoc = (ev) => { if (!menu.contains(ev.target)) { closeBarContextMenu(); document.removeEventListener('mousedown', onDoc, true); } };
    document.addEventListener('mousedown', onDoc, true);
    const onKey = (ev) => { if (ev.key === 'Escape') { closeBarContextMenu(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}
```

(e) `showBarDetailPanel`（:2034-2037）の `.actual-tl-dp-actions` を置き換え:

```js
            <div class="actual-tl-dp-actions">
                <button class="btn btn-secondary btn-sm" id="atlDpEdit">編集</button>
                <button class="btn btn-secondary btn-sm" id="atlDpSelect">${selectedActualIds.has(actual.id) ? '選択を外す' : '選択に追加'}</button>
                <button class="btn btn-sm" id="atlDpDelete" style="background:var(--danger);color:#fff;border-color:var(--danger);">削除</button>
            </div>
```
とし、`#atlDpDelete` のリスナー登録（:2055）の直後に:

```js
    panel.querySelector('#atlDpSelect').addEventListener('click', () => {
        if (selectedActualIds.has(actual.id)) window.deselectActualIds([actual.id]); else window.selectActualIds([actual.id]);
        closeDetailPanel();
    });
```

(f) `showGroupDetailPanel`（:2098-2107）の `panel.innerHTML` の `.actual-tl-dp-body` 末尾（`<div class="actual-tl-dp-list">…</div>` の直後）に:

```js
            <div class="actual-tl-dp-actions">
                <button class="btn btn-secondary btn-sm" id="atlDpSelect">${ids.every(id => selectedActualIds.has(Number(id))) ? 'このバーの選択を外す' : `このバーの ${items.length} 件を選択`}</button>
                <button class="btn btn-secondary btn-sm" id="atlDpSelectSame">同じ対応をすべて選択</button>
                <button class="btn btn-primary btn-sm" id="atlDpBulkEdit">この ${items.length} 件を一括編集…</button>
            </div>
```
そして `#atlDpClose` のリスナー（:2112）の直後に:

```js
    const numIds = ids.map(Number);
    panel.querySelector('#atlDpSelect').addEventListener('click', () => {
        if (numIds.every(id => selectedActualIds.has(id))) window.deselectActualIds(numIds); else window.selectActualIds(numIds);
        closeDetailPanel();
    });
    panel.querySelector('#atlDpSelectSame').addEventListener('click', () => {
        window.selectActualIds(sameTaskIds(actuals, items[0], { sameMember: true }));
        closeDetailPanel();
    });
    panel.querySelector('#atlDpBulkEdit').addEventListener('click', () => {
        window.selectActualIds(numIds, { replace: true });
        closeDetailPanel();
        if (typeof window.openBulkActualEditModal === 'function') window.openBulkActualEditModal();
    });
```

（`showGroupDetailPanel` の `ids` は文字列配列で来るため `Number()` を通す。`items` は既に `String(a.id) === String(id)` で解決済み。）

- [ ] **Step 4: `renderActualTimeline` 後に選択 UI を同期**

`js/actual-timeline.js` `renderActualTimeline`（:143-153）の `renderRightPane();` の直後に:

```js
    if (typeof window.updateActualSelectionUI === 'function') window.updateActualSelectionUI();
```

- [ ] **Step 5: テスト確認 → コミット**

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js && node --test && npm run lint`
Expected: PASS。あわせて既存 `tests/e2e/smoke.spec.js` も PASS（バー移動・作成に影響がないこと）: `npx playwright test tests/e2e/smoke.spec.js`

```bash
git add js/actual-timeline.js docs/CODEMAP.md tests/e2e/actual-bulk-edit.spec.js
git commit -m "feat(actual-timeline): ガントのバーから実績を選択（詳細パネル・Ctrl/Shift・右クリック）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: モバイル確認・BACKLOG 記録・全体検証

**Files:**
- Test: `tests/e2e/actual-bulk-edit.spec.js`（モバイル viewport のテスト追記）
- Modify: `docs/BACKLOG.md`（既知不具合の記録）

- [ ] **Step 1: モバイル e2e を追記**

```js
test.describe("モバイル幅", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("行タップで選択でき、トレイが画面内に出る", async ({ page }) => {
    await page.locator("#btnActualSelectionMode").click();
    await page.locator('tr[data-actual-id="1"] td:nth-child(3)').tap().catch(() => page.locator('tr[data-actual-id="1"] td:nth-child(3)').click());
    await expect(page.locator("#actualSelectionCount")).toContainText("1 件");
    const tray = page.locator("#actualSelectionTray .bk-bar");
    await expect(tray).toBeVisible();
    const box = await tray.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    await page.locator("#btnBulkActualEdit").click();
    await expect(page.locator("#bulkActualEditModal")).toBeVisible();
    const body = page.locator("#bulkActualEditModal .modal-body");
    expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true); // 横はみ出しなし
  });
});
```

Run: `npx playwright test tests/e2e/actual-bulk-edit.spec.js -g "モバイル"`
Expected: PASS（失敗したら `style.css` の `.bk-bar`/`.bk-field-head` の折り返しを調整。`@media (max-width: 640px)` で `.bk-field-body select, .bk-field-body input { min-width: 0; width: 100%; }` を追加）

- [ ] **Step 2: BACKLOG に既知不具合を記録**

`docs/BACKLOG.md` の `[確認済]` 不具合一覧（`- [B-0xx]` が並ぶ節）の末尾に、`grep -o "B-0[0-9]*" docs/BACKLOG.md | sort | tail -1` で最大番号を確認して +1 した ID で追記:

```md
- [B-0NN] [確認済] 実績タイムラインで複数 id を持つ結合バーをドラッグ移動すると `ids[0]` の 1 件しか動かない
  （`js/actual-timeline.js` `onBarMouseDown` 付近の `ids[0]` 参照）。一括変更エンジン（`js/actual-bulk-core.js`
  `applyBulkPatch` の日付シフト）で全 id を動かす形へ置き換える候補。設計: `docs/superpowers/specs/2026-08-29-actual-bulk-edit-design.md` §4.6
```

- [ ] **Step 3: 全体検証**

Run:
```bash
node --test
npm run lint
node scripts/codemap.mjs --check
npx playwright test
```
Expected: すべて PASS / 緑

- [ ] **Step 4: コミット**

```bash
git add tests/e2e/actual-bulk-edit.spec.js docs/BACKLOG.md style.css
git commit -m "test(actual-bulk): モバイル幅の e2e と、結合バー移動の既知不具合を BACKLOG に記録

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 実動作検証と統合

- [ ] **Step 1: `/verify-ui`** で実ブラウザ検証（リスト選択 → 一括編集 → Undo、条件で選択、タイムラインの右クリック、スマホ幅）。PASS のスクリーンショットを worktree 内に残す（/integrate の掃除で消える）
- [ ] **Step 2: `/integrate`**（rebase → 検証 → ff-only マージ → /deploy → worktree 掃除）。`.shared/claims/actual-bulk-edit.md` は /integrate が掃除しない場合は手で削除する
- [ ] **Step 3: 報告** — 3 経路の操作数、テスト件数、デプロイ URL、BACKLOG に記録した既知不具合

---

## Self-Review（作成時に実施）

- **Spec coverage**: §4.1 選択モード→Task 3、§4.2 選択バー→Task 3、§4.3 条件→Task 6、§4.4 モーダル→Task 4、§4.5 削除/複製→Task 5、§4.6 タイムライン→Task 7、§4.7 モバイル→Task 8、§5 状態→Task 3、§6 エンジン→Task 1、§7 Undo→Task 2、§8 他データ非干渉→エンジンが actuals 以外を触らない、§10 変更箇所→各 Task、§12 テスト→Task 1/2/3-8、§13 受け入れ→Task 8/9
- **Placeholder scan**: TBD/TODO なし。各ステップにコードあり
- **Type consistency**: `selectActualIds(ids, { replace })` / `deselectActualIds(ids)` / `updateActualSelectionUI()` / `openBulkActualEditModal()` の名前は Task 3・4・7 で一致。`actual_bulk_edit` の `data` キー（`beforeActuals`/`afterActuals`/`deletedActuals`/`addedActualIds`）は Task 2・4・5 で一致。`BulkPatch` の形（`{set}` / `isReview: 'on'|'off'` / `date: {mode, value|days}`）は Task 1 と Task 4 `toBulkPatch` で一致
