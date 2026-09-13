# 工程間「連結ペア」ドラッグ機構 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スケジュール（ガントチャート）で、同一版数+対応+担当者のIT→ST・PG→PTが隙間なく隣接している場合、前工程をドラッグすると後工程も追従し、後工程を単独でドラッグしたときはそれだけが動くようにする。

**Architecture:** 連結は永続フィールドを持たず、ドラッグのたびに「同一版数+対応+担当者」かつ「後工程の開始日＝前工程終了日の翌営業日」という位置関係から都度導出する。`js/constants.js` に前工程→後工程のペア定義（`PROCESS.LINKED_PAIRS`）を持ち、`js/schedule.js` の `handleScheduleDrag` がこの定義を使って前工程移動時に後工程を営業日ベースで再配置する。Undo/Redoは1回の操作で両方戻るよう `js/history.js` の `schedule_move` アクションを拡張する。`js/schedule-render.js` のドラッグプレビューは、連動対象があれば2本目のバーも追従表示する。

**Tech Stack:** 素のES Modules、Canvas 2D描画、`node --test`（node:test）、Playwright e2e。

**前提（着手前に必ず実行）:** このリポジトリは `experiment/ui-scaling` を直接編集しない運用。作業前に必ず

```bash
bash scripts/worktree.sh start schedule-linked-processes
```

を実行し、出力された worktree パス配下で以降のすべての Read/Edit/Write・テスト・コミットを行うこと。完了後は `bash scripts/worktree.sh finish` で統合する（`CLAUDE.md` の「開発フロー」節を参照）。

---

## Task 1: 連結ペア定数と判定ロジック（`getNextBusinessDay` / `findLinkedBackSchedule`）

**Files:**
- Modify: `js/constants.js:296-315`（`PROCESS` に `LINKED_PAIRS` を追加）
- Modify: `js/schedule.js:13`（`PROCESS` のimport追加）, `js/schedule.js:747`付近（新規関数2つを追加）
- Test: `tests/schedule-linked-processes.test.js`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`tests/schedule-linked-processes.test.js` を新規作成する:

```js
// IT-ST/PG-PT連結ドラッグ機構の回帰テスト
// schedule.js はモジュール評価時にDOM/localStorageを触らないが、
// updateSchedule等が実行時にwindow.saveData/document.getElementByIdを参照するため
// history.test.js と同じ最小ポリフィルをimport前に用意する（js/配下のソースは変更しない）。
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => [],
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
globalThis.alert = () => {};

const State = await import('../js/state.js');
const Schedule = await import('../js/schedule.js');

function resetAll() {
    globalThis.localStorage._map.clear();
    State.setSchedules([]);
    State.setCompanyHolidays([]);
    State.setVacations([]);
    State.setScheduleSettings({ hoursPerDay: 8 });
}

const base = {
    version: 'V1.0', task: '対応A', member: '山田', estimatedHours: 8,
    status: 'pending', color: '#000', note: '', createdAt: '', updatedAt: '',
};

describe('getNextBusinessDay', () => {
    beforeEach(resetAll);

    test('平日の翌日が平日ならその日を返す', () => {
        // 2026-08-03は月曜日
        assert.equal(Schedule.getNextBusinessDay('2026-08-03', '山田'), '2026-08-04');
    });

    test('金曜日の翌営業日は週明け月曜日になる（土日をスキップ）', () => {
        // 2026-08-07は金曜日
        assert.equal(Schedule.getNextBusinessDay('2026-08-07', '山田'), '2026-08-10');
    });
});

describe('findLinkedBackSchedule', () => {
    beforeEach(resetAll);

    test('IT終了日の翌営業日から始まるSTが同一版数/対応/担当者にあれば連結対象として返す', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(it, [it, st]).id, 'sch_st');
    });

    test('隙間がある場合は連結対象とみなさない', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-06', endDate: '2026-08-06' };
        assert.equal(Schedule.findLinkedBackSchedule(it, [it, st]), null);
    });

    test('担当者が異なる場合は連結対象とみなさない', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', member: '鈴木', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(it, [it, st]), null);
    });

    test('PG→PTペアでも同様に連結対象を返す（連結ペアの一般化）', () => {
        const pg = { ...base, id: 'sch_pg', process: 'PG', startDate: '2026-08-03', endDate: '2026-08-04' };
        const pt = { ...base, id: 'sch_pt', process: 'PT', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(pg, [pg, pt]).id, 'sch_pt');
    });

    test('後工程（ST）自身は前工程を持たないため常にnullを返す', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04' };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05' };
        assert.equal(Schedule.findLinkedBackSchedule(st, [it, st]), null);
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/schedule-linked-processes.test.js`
Expected: FAIL（`Schedule.getNextBusinessDay is not a function` および `Schedule.findLinkedBackSchedule is not a function`）

- [ ] **Step 3: `PROCESS.LINKED_PAIRS` を追加**

`js/constants.js:296-315` の `PROCESS` オブジェクトに `LINKED_PAIRS` を追加する:

```js
export const PROCESS = {
    // 工程タイプ（ウォーターフォール順序）
    TYPES: ['UI', 'PG', 'PT', 'IT', 'ST'],

    // 工程名
    UI: 'UI',
    PG: 'PG',
    PT: 'PT',
    IT: 'IT',
    ST: 'ST',

    // 工程別色（チャート・グラフ用）
    COLORS: {
        UI: '#4dabf7',
        PG: '#20c997',
        PT: '#ff922b',
        IT: '#51cf66',
        ST: '#f06595'
    },

    // 連結ペア（前工程→後工程）。同一版数+対応+担当者で後工程が前工程の
    // 終了日の翌営業日から始まる場合、ドラッグ操作で連動させる対象。
    LINKED_PAIRS: [
        ['IT', 'ST'],
        ['PG', 'PT']
    ]
};
```

- [ ] **Step 4: `getNextBusinessDay` / `findLinkedBackSchedule` を実装**

`js/schedule.js:13` の import を修正する（`PROCESS` を追加）:

```js
import { SCHEDULE, PROCESS, TASK_COLORS, THEME_TASK_COLORS } from './constants.js';
```

`js/schedule.js:747`（`countBusinessDays` の直後、`// モーダル操作` セクションの直前）に以下を追加する:

```js
/**
 * 指定日の翌営業日を返す
 * @param {string} dateStr - 起点日（YYYY-MM-DD）
 * @param {string} member - 担当者名（休暇チェック用）
 * @returns {string} - 翌営業日（YYYY-MM-DD）
 */
export function getNextBusinessDay(dateStr, member) {
    const date = new Date(dateStr);
    do {
        date.setDate(date.getDate() + 1);
    } while (!isBusinessDay(date, member));
    return formatDateForCheck(date);
}

/**
 * 前工程スケジュールに連結中の後工程スケジュールを探す
 * 「同一版数+対応+担当者」かつ「後工程の開始日＝前工程終了日の翌営業日」の場合のみ
 * 連結中とみなす（隙間があれば独立した2本として扱う）。
 * @param {Object} frontSchedule - 前工程側のスケジュール
 * @param {Object[]} allSchedules - 検索対象のスケジュール一覧
 * @returns {Object|null} - 連結中の後工程スケジュール（無ければnull）
 */
export function findLinkedBackSchedule(frontSchedule, allSchedules) {
    const pair = PROCESS.LINKED_PAIRS.find(([front]) => front === frontSchedule.process);
    if (!pair) return null;

    const [, backProcess] = pair;
    const expectedBackStart = getNextBusinessDay(frontSchedule.endDate, frontSchedule.member);

    return allSchedules.find(s =>
        s.id !== frontSchedule.id &&
        s.version === frontSchedule.version &&
        s.task === frontSchedule.task &&
        s.member === frontSchedule.member &&
        s.process === backProcess &&
        s.startDate === expectedBackStart
    ) || null;
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `node --test tests/schedule-linked-processes.test.js`
Expected: PASS（全8ケース）

- [ ] **Step 6: コミット**

```bash
git add js/constants.js js/schedule.js tests/schedule-linked-processes.test.js
git commit -m "feat(schedule): IT-ST/PG-PT連結判定ロジックを追加"
```

---

## Task 2: `handleScheduleDrag` の連動移動 + Undo/Redoの一括化

**Files:**
- Modify: `js/schedule.js:1681-1706`（`handleScheduleDrag`）
- Modify: `js/history.js:481-489`（`applyScheduleUndo` の `move` ケース）, `js/history.js:541-549`（`applyScheduleRedo` の `move` ケース）
- Test: `tests/schedule-linked-processes.test.js`（追記）

- [ ] **Step 1: 失敗するテストを書く**

`tests/schedule-linked-processes.test.js` の末尾に追記する（`History` のimportも追加）:

```js
const History = await import('../js/history.js');
```

（このimport行は既存の `const Schedule = await import(...)` の直後に追加する）

```js
describe('handleScheduleDrag — 連結ペアの連動移動', () => {
    beforeEach(resetAll);

    test('連結中のITを移動するとSTも隙間ゼロを保ったまま追従する（週末をまたぐケース）', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([it, st]);

        // 2026-08-07(金)へ移動 → IT終了は週末をまたいで2026-08-10(月)
        Schedule.handleScheduleDrag('sch_it', '2026-08-07');

        const updatedIt = State.schedules.find(s => s.id === 'sch_it');
        const updatedSt = State.schedules.find(s => s.id === 'sch_st');
        assert.equal(updatedIt.startDate, '2026-08-07');
        assert.equal(updatedIt.endDate, '2026-08-10');
        assert.equal(updatedSt.startDate, '2026-08-11');
        assert.equal(updatedSt.endDate, '2026-08-11');
    });

    test('隙間がある場合、ITを移動してもSTは動かない', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-06', endDate: '2026-08-06', estimatedHours: 8 };
        State.setSchedules([it, st]);

        Schedule.handleScheduleDrag('sch_it', '2026-08-07');

        const updatedSt = State.schedules.find(s => s.id === 'sch_st');
        assert.equal(updatedSt.startDate, '2026-08-06', 'ITと隙間があるSTは移動しない');
    });

    test('STを単独で移動すると、STだけが動きITは変化しない（重なっても制約なし）', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([it, st]);

        Schedule.handleScheduleDrag('sch_st', '2026-08-03'); // ITと重なる日付へ

        const updatedIt = State.schedules.find(s => s.id === 'sch_it');
        const updatedSt = State.schedules.find(s => s.id === 'sch_st');
        assert.equal(updatedIt.startDate, '2026-08-03', 'ITは変化しない');
        assert.equal(updatedSt.startDate, '2026-08-03', 'STはITと重なる位置へ制約なく移動する');
    });

    test('PG→PTでも同様に連動する（連結ペアの一般化の確認）', () => {
        const pg = { ...base, id: 'sch_pg', process: 'PG', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const pt = { ...base, id: 'sch_pt', process: 'PT', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([pg, pt]);

        Schedule.handleScheduleDrag('sch_pg', '2026-08-07');

        const updatedPt = State.schedules.find(s => s.id === 'sch_pt');
        assert.equal(updatedPt.startDate, '2026-08-11');
    });

    test('連動した移動は1回のUndoで両方元に戻り、Redoで両方再適用される', () => {
        const it = { ...base, id: 'sch_it', process: 'IT', startDate: '2026-08-03', endDate: '2026-08-04', estimatedHours: 16 };
        const st = { ...base, id: 'sch_st', process: 'ST', startDate: '2026-08-05', endDate: '2026-08-05', estimatedHours: 8 };
        State.setSchedules([it, st]);
        window.updateScheduleFn = Schedule.updateSchedule; // history.js の 'move' 適用が参照する

        Schedule.handleScheduleDrag('sch_it', '2026-08-07');
        assert.equal(State.schedules.find(s => s.id === 'sch_st').startDate, '2026-08-11');

        History.undo();
        assert.equal(State.schedules.find(s => s.id === 'sch_it').startDate, '2026-08-03', 'Undo1回でITが戻る');
        assert.equal(State.schedules.find(s => s.id === 'sch_st').startDate, '2026-08-05', 'Undo1回でSTも戻る');

        History.redo();
        assert.equal(State.schedules.find(s => s.id === 'sch_it').startDate, '2026-08-07');
        assert.equal(State.schedules.find(s => s.id === 'sch_st').startDate, '2026-08-11', 'Redo1回でSTも再適用される');
    });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `node --test tests/schedule-linked-processes.test.js`
Expected: FAIL（新しい4ケースが `updatedSt.startDate` の不一致等で失敗。既存の未変更 `handleScheduleDrag` は連動しないため）

- [ ] **Step 3: `handleScheduleDrag` を修正**

`js/schedule.js:1681-1706` を以下に置き換える:

```js
/**
 * ドラッグによるスケジュール移動を処理
 * 同一版数+対応+担当者で連結中の後工程（IT→ST, PG→PT）があれば、
 * 隙間ゼロを保ったまま後工程も連動して移動する。
 * @param {string} scheduleId - スケジュールID
 * @param {string} newStartDate - 新しい開始日（YYYY-MM-DD）
 */
export function handleScheduleDrag(scheduleId, newStartDate) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    // 移動前の状態を保存
    const oldStartDate = schedule.startDate;
    const oldEndDate = schedule.endDate;

    // 移動前の位置関係で連結中の後工程を判定（ドラッグ中は他の変更が起きない前提）
    const linkedBefore = findLinkedBackSchedule(schedule, schedules);

    // 新しい終了日を計算
    const newEndDate = calculateEndDate(newStartDate, schedule.estimatedHours, schedule.member);

    let linkedData = null;
    if (linkedBefore) {
        const linkedNewStartDate = getNextBusinessDay(newEndDate, linkedBefore.member);
        const linkedNewEndDate = calculateEndDate(linkedNewStartDate, linkedBefore.estimatedHours, linkedBefore.member);
        linkedData = {
            scheduleId: linkedBefore.id,
            oldStartDate: linkedBefore.startDate,
            oldEndDate: linkedBefore.endDate,
            newStartDate: linkedNewStartDate,
            newEndDate: linkedNewEndDate
        };
    }

    // Undo用に記録（連動分があれば1つのアクションにまとめる）
    pushAction({
        type: 'schedule_move',
        description: `スケジュール移動: ${schedule.task} (${schedule.process})`,
        data: { scheduleId, oldStartDate, oldEndDate, newStartDate, newEndDate, linked: linkedData }
    });

    // スケジュールを更新
    updateSchedule(scheduleId, {
        startDate: newStartDate,
        endDate: newEndDate
    });
    if (linkedData) {
        updateSchedule(linkedData.scheduleId, {
            startDate: linkedData.newStartDate,
            endDate: linkedData.newEndDate
        });
    }

    showToast('予定を移動しました', 'success', 3000, { onUndo: () => window.historyUndo() });
}
```

- [ ] **Step 4: `history.js` の `move` ケースを修正（Undo）**

`js/history.js:481-489` を以下に置き換える:

```js
        case 'move':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, {
                    startDate: action.data.oldStartDate,
                    endDate: action.data.oldEndDate
                });
                if (action.data.linked) {
                    window.updateScheduleFn(action.data.linked.scheduleId, {
                        startDate: action.data.linked.oldStartDate,
                        endDate: action.data.linked.oldEndDate
                    });
                }
            }
            break;
```

- [ ] **Step 5: `history.js` の `move` ケースを修正（Redo）**

`js/history.js:541-549` を以下に置き換える:

```js
        case 'move':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, {
                    startDate: action.data.newStartDate,
                    endDate: action.data.newEndDate
                });
                if (action.data.linked) {
                    window.updateScheduleFn(action.data.linked.scheduleId, {
                        startDate: action.data.linked.newStartDate,
                        endDate: action.data.linked.newEndDate
                    });
                }
            }
            break;
```

- [ ] **Step 6: テストが通ることを確認**

Run: `node --test tests/schedule-linked-processes.test.js`
Expected: PASS（全13ケース）

- [ ] **Step 7: 既存テストに影響がないことを確認**

Run: `npm test`
Expected: PASS（全テストファイルが成功。特に `tests/history.test.js` が引き続き通ること）

- [ ] **Step 8: コミット**

```bash
git add js/schedule.js js/history.js tests/schedule-linked-processes.test.js
git commit -m "feat(schedule): 連結ペアのドラッグ連動移動とUndo/Redoの一括化を実装"
```

---

## Task 3: e2e統合テスト（実アプリ経由での検証）

**Files:**
- Create: `tests/e2e/schedule-linked-drag.spec.js`

Task 1・2で実装した本体ロジックに対する統合確認。`window.handleScheduleDrag` / `window.historyUndo` / `window.historyRedo` の実アプリでの結線と、localStorageへの永続化を検証する（この時点で本体ロジックは実装済みのため、テストは最初から成功するはずです＝回帰確認としての位置づけ）。

- [ ] **Step 1: e2eテストを書く**

`tests/e2e/schedule-linked-drag.spec.js` を新規作成する:

```js
// IT-ST連結ドラッグ機構の統合テスト。
// 2026-08-17(月)は日本の祝日と重ならない平日なので、休日カレンダーの
// 実装差異に依存せず「隙間ゼロを保ったまま連動する」ことだけを検証できる。
import { test, expect } from "@playwright/test";

const VERSION = "V1.0";
const TASK = "対応A";
const MEMBER = "山田";

const SEED_SCHEDULES_LINKED = [
  { id: "sch_it", version: VERSION, task: TASK, process: "IT", member: MEMBER,
    startDate: "2026-08-03", endDate: "2026-08-04", estimatedHours: 16,
    status: "pending", color: "#4a90d9", note: "",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  { id: "sch_st", version: VERSION, task: TASK, process: "ST", member: MEMBER,
    startDate: "2026-08-05", endDate: "2026-08-05", estimatedHours: 8,
    status: "pending", color: "#4a90d9", note: "",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
];

const seedEntries = (schedules) => ({
  manhour_estimates: JSON.stringify([]),
  manhour_actuals: JSON.stringify([]),
  manhour_schedules: JSON.stringify(schedules),
  manhour_scheduleSettings: JSON.stringify({ currentMonth: "2026-08" }),
  manhour_currentTab: "schedule",
});

test.describe("IT-ST連結ドラッグ（実アプリ統合）", () => {
  test("隙間なく隣接するITを移動するとSTも連動し、1回のUndo/Redoで両方戻る", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const url = m.location()?.url ?? "";
      if (url.includes("analysis/latest.json") || url.includes(":11434/")) return;
      errors.push(`console: ${m.text()} @ ${url}`);
    });
    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries(SEED_SCHEDULES_LINKED));
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);

    await page.evaluate(() => window.handleScheduleDrag("sch_it", "2026-08-17"));

    const afterMove = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
    expect(afterMove.find((s) => s.id === "sch_it").startDate).toBe("2026-08-17");
    expect(afterMove.find((s) => s.id === "sch_st").startDate).toBe("2026-08-19");

    await page.evaluate(() => window.historyUndo());
    const afterUndo = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
    expect(afterUndo.find((s) => s.id === "sch_it").startDate).toBe("2026-08-03");
    expect(afterUndo.find((s) => s.id === "sch_st").startDate).toBe("2026-08-05");

    await page.evaluate(() => window.historyRedo());
    const afterRedo = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
    expect(afterRedo.find((s) => s.id === "sch_it").startDate).toBe("2026-08-17");
    expect(afterRedo.find((s) => s.id === "sch_st").startDate).toBe("2026-08-19");

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
```

- [ ] **Step 2: テストを実行して確認**

Run: `npx playwright test tests/e2e/schedule-linked-drag.spec.js`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/schedule-linked-drag.spec.js
git commit -m "test(schedule): IT-ST連結ドラッグの実アプリ統合テストを追加"
```

---

## Task 4: ドラッグプレビューの複数バー追従表示（`schedule-render.js`）

> **注意:** このタスクはCanvas描画（ドラッグ中の見た目・モーション）を変更する。ユーザーのグローバルCLAUDE.md
> のルールG1により、UI/見た目に関わる変更は `frontend-design` スキルの使用が必須。ただしここでの変更は
> 「既存のプレビューバー描画（色・枠線・角丸など）をそのまま2本目にも適用する」という機械的な複製であり、
> 新しい見た目の意思決定は発生しない。着手前に一度 `frontend-design` スキルを起動し、この方針
> （既存スタイルの複製であり新規デザインではない）で問題ないことを確認してから進めること。

**Files:**
- Modify: `js/schedule-render.js:8`（importに`calculateEndDate`, `getNextBusinessDay`, `findLinkedBackSchedule`を追加）
- Modify: `js/schedule-render.js:1893-1933`（`drawDragPreview`を複数バー対応に変更）
- Modify: `js/schedule-render.js:1746-1753`（マウスの`mousemove`ハンドラ）
- Modify: `js/schedule-render.js:2054-2061`（タッチの`touchmove`ハンドラ）

このタスクはCanvas描画のみを対象とし、自動テストでの検証は行わない（Canvas上の視覚的な追従表示は既存コードにもピクセル単位のテストが無く、今回もその方針を踏襲する）。代わりに手動確認を必須とする。

- [ ] **Step 1: `drawDragPreview`を複数バー対応にする**

`js/schedule-render.js:8` の import を修正する:

```js
import { getTaskColor, isBusinessDay, calculateEndDate, getNextBusinessDay, findLinkedBackSchedule } from './schedule.js';
```

`js/schedule-render.js:1893-1933` の `drawDragPreview` を以下に置き換える:

```js
function drawDragPreview(renderer, previews) {
    // render()内部で日付ベースのスクロール位置保持が行われる
    renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);

    const ctx = renderer.timelineCtx;

    previews.forEach(({ schedule, newStartDate }) => {
        const originalStart = new Date(schedule.startDate);
        const originalEnd = new Date(schedule.endDate);
        const duration = Math.ceil((originalEnd - originalStart) / (1000 * 60 * 60 * 24));

        const newStart = new Date(newStartDate);
        const newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + duration);

        const visibleStart = newStart < renderer.rangeStart ? renderer.rangeStart : newStart;
        const visibleEnd = newEnd > renderer.rangeEnd ? renderer.rangeEnd : newEnd;

        const barX = renderer.dateToX(visibleStart);
        const barEndX = renderer.dateToX(visibleEnd) + DAY_WIDTH;
        const barWidth = barEndX - barX;

        const originalRect = renderer.scheduleRects.find(r => r.schedule.id === schedule.id);
        if (!originalRect) return;

        const barY = originalRect.y;

        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#1D6FA5';  // --info
        fillRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);
        ctx.strokeStyle = '#2D5A27';  // --accent
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        strokeRoundRect(ctx, barX, barY, barWidth, BAR_HEIGHT, BAR_RADIUS);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = TEXT_PRIMARY;
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(newStartDate.slice(5), barX + barWidth / 2, barY - 5);
    });
}

/**
 * ドラッグ中のスケジュールについて、連動対象（連結中の後工程）があれば
 * そのプレビュー用エントリも含めた配列を組み立てる
 * @param {Object} schedule - ドラッグ中のスケジュール
 * @param {string} newStartDate - ドラッグ先の新しい開始日
 * @returns {{schedule: Object, newStartDate: string}[]}
 */
function buildDragPreviews(schedule, newStartDate) {
    const previews = [{ schedule, newStartDate }];
    const linked = findLinkedBackSchedule(schedule, schedules);
    if (linked) {
        const frontNewEnd = calculateEndDate(newStartDate, schedule.estimatedHours, schedule.member);
        const linkedNewStart = getNextBusinessDay(frontNewEnd, linked.member);
        previews.push({ schedule: linked, newStartDate: linkedNewStart });
    }
    return previews;
}
```

- [ ] **Step 2: マウスの`mousemove`ハンドラを更新**

`js/schedule-render.js:1746-1753` を以下に置き換える:

```js
                const newDate = renderer.getDateAtPosition(x);
                if (newDate) {
                    const dateStr = formatDateForDrag(newDate);
                    if (dateStr !== dragState.previewDate) {
                        dragState.previewDate = dateStr;
                        drawDragPreview(renderer, buildDragPreviews(dragState.schedule, dateStr));
                    }
                }
```

- [ ] **Step 3: タッチの`touchmove`ハンドラを更新**

`js/schedule-render.js:2054-2061` を以下に置き換える:

```js
                const newDate = renderer.getDateAtPosition(x);
                if (newDate) {
                    const dateStr = formatDateForDrag(newDate);
                    if (dateStr !== dragState.previewDate) {
                        dragState.previewDate = dateStr;
                        drawDragPreview(renderer, buildDragPreviews(dragState.schedule, dateStr));
                    }
                }
```

- [ ] **Step 4: 自動テストを再実行し、既存機能を壊していないことを確認**

Run: `npm test && npx playwright test tests/e2e/schedule-linked-drag.spec.js tests/e2e/schedule-multimonth-candidate.spec.js`
Expected: PASS

- [ ] **Step 5: 手動確認（開発サーバーで実際にドラッグする）**

`run` スキルまたは `npm run e2e -- --ui` 等でアプリを起動し、以下を実機で確認する:
1. 版数・対応・担当者が同じでIT→STが隙間なく隣接するスケジュールを用意する（自動生成、または手動でIT/STを隣接させて配置）。
2. ITバーをドラッグ開始し、マウスボタンを離す前にSTバーもプレビュー表示として一緒に追従することを確認する。
3. ドロップ後、ITとSTが隙間ゼロを保ったまま両方移動していることを確認する。
4. STバーだけを単独でドラッグし、ITが動かないことを確認する。
5. スクリーンショットを1枚撮り、動作の記録として残す。

- [ ] **Step 6: コミット**

```bash
git add js/schedule-render.js
git commit -m "feat(schedule): ドラッグプレビューで連結中の後工程バーも追従表示する"
```

---

## 統合

全タスク完了後、`bash scripts/worktree.sh finish` を実行して `experiment/ui-scaling` へ統合する（rebase → `npm run e2e` → ff-onlyマージ → push まで自動）。
