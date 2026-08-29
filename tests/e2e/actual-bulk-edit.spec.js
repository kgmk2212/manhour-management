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
// 実績IDは見積ID（1〜3）と重複させない。
// storage.js の initializeRecordIdAndDedup は見積/実績の id 空間を共有と見なし、
// 重複IDのレコードを検出すると自動的に新しいIDへ振り直してしまうため（旧
// Date.now()+Math.random() 由来のID衝突を修復するための仕組み）、ここで
// 見積IDと衝突しない番号（101〜）を割る。ブリーフの元の番号（1,2,3,...）は
// この衝突を踏んでしまうため、テスト側で調整した。
const ACTUALS = [
  A(101, 17, "V2.3", "帳票A出力改修", "PG", "田中", 6),
  A(102, 17, "", "打ち合わせ", "", "田中", 2),
  A(103, 17, "V2.3", "ログイン画面改修", "UI", "佐藤", 8),
  A(104, 18, "V2.3", "帳票A出力改修", "PG", "田中", 8),
  A(105, 18, "V2.3", "ログイン画面改修", "PG", "佐藤", 6, { isReview: true }),
  A(107, 19, "V2.3", "帳票A出力改修", "PT", "田中", 8),
  A(109, 20, "V2.3", "帳票A出力改修", "PT", "田中", 7),
  A(111, 21, "V2.3", "帳票A出力改修", "IT", "田中", 8),
  A(113, 24, "V2.4", "帳票A出力改修（追補）", "IT", "田中", 8),
];
const TARGET_IDS = [101, 104, 107, 109, 111];

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
  // 表示形式/表示期間はセグメントボタンUIが既定表示で、裏の <select> は非表示のため
  // selectOption ではなく実際のクリックと同じ経路（window に公開された関数）で切り替える
  await page.evaluate(() => window.setActualViewType("list"));
  await page.evaluate(() => window.handleActualMonthChange("all", "actualMonthButtons2"));
});

test("選択モード: 行クリックで選択し、選択バーに件数と合計が出る", async ({ page }) => {
  await expect(page.locator("#actualSelectionTray")).toBeHidden();
  await page.locator("#btnActualSelectionMode").click();
  await expect(page.locator("#actualSelectionTray")).toBeVisible();
  await expect(page.locator("#actualSelectionCount")).toContainText("0 件");

  await page.locator('tr[data-actual-id="101"] td:nth-child(3)').click();
  await page.locator('tr[data-actual-id="104"] td:nth-child(3)').click();
  await expect(page.locator("#actualSelectionCount")).toContainText("2 件");
  // 合計は formatHours() 表示（末尾0埋めの "14.0h"。既存の集計表示と揃えるための仕様）
  await expect(page.locator("#actualSelectionCount")).toContainText("14.0h");
  await expect(page.locator('tr[data-actual-id="101"]')).toHaveClass(/is-selected/);

  // Shift+クリックで範囲選択（表示順で 104 → 111 の間）
  await page.locator('tr[data-actual-id="111"] td:nth-child(3)').click({ modifiers: ["Shift"] });
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
  expect(saved.find((x) => x.id === 102)).toEqual(ACTUALS.find((x) => x.id === 102)); // 打ち合わせは不変
  expect(saved.find((x) => x.id === 103)).toEqual(ACTUALS.find((x) => x.id === 103));
  await expect(page.locator("#actualSelectionCount")).toContainText("0 件");

  // トーストの「元に戻す」で 1 回で全件復元
  await page.locator(".bk-undo-toast button.bk-undo").click();
  saved = await readActuals(page);
  expect(saved.map((a) => ({ ...a }))).toEqual(ACTUALS);
});

test("一括編集: その他工数に版数だけ付けると警告が出て適用できない", async ({ page }) => {
  await page.locator("#btnActualSelectionMode").click();
  await page.locator('tr[data-actual-id="102"] td:nth-child(3)').click();
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
