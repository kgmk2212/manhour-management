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

test("一括削除は確認あり、複製は指定日に新規追加。どちらも Undo で戻る", async ({ page }) => {
  await page.locator("#btnActualSelectionMode").click();
  await page.locator('tr[data-actual-id="101"] td:nth-child(3)').click();
  await page.locator('tr[data-actual-id="104"] td:nth-child(3)').click();

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
  await page.locator('tr[data-actual-id="102"] td:nth-child(3)').click();
  page.once("dialog", (d) => { expect(d.message()).toContain("1 件"); d.accept(); });
  await page.locator("#btnBulkActualDelete").click();
  saved = await readActuals(page);
  expect(saved.find((a) => a.id === 102)).toBeUndefined();
  await page.locator(".bk-undo-toast button.bk-undo").click();
  saved = await readActuals(page);
  expect(saved.find((a) => a.id === 102)).toEqual(ACTUALS.find((a) => a.id === 102));

  // 削除（confirm を dismiss → 何も変わらない）
  await page.locator('tr[data-actual-id="103"] td:nth-child(3)').click();
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#btnBulkActualDelete").click();
  expect((await readActuals(page)).find((a) => a.id === 103)).toBeTruthy();
});

test("条件で選択: 担当・版数・対応名で該当 5 件、ハイライトと件数、選択に追加", async ({ page }) => {
  await page.locator("#btnActualSelectionMode").click();
  await page.locator("#btnBulkActualCondition").click();
  await expect(page.locator("#actualConditionPopover")).toBeVisible();
  await expect(page.locator("#btnActualConditionAdd")).toBeEnabled(); // 条件なし = 全件該当

  await page.selectOption("#actualCondMember", "田中");
  await page.selectOption("#actualCondVersion", "V2.3");
  await page.selectOption("#actualCondTask", "帳票A出力改修");
  await expect(page.locator("#actualCondHits")).toContainText("5");
  await expect(page.locator("#actualCondHits")).toContainText("37.0h");
  expect(await page.locator("tr.is-hit").count()).toBe(5);

  await page.locator("#btnActualConditionAdd").click();
  await expect(page.locator("#actualConditionPopover")).toBeHidden();
  await expect(page.locator("#actualSelectionCount")).toContainText("5 件");
  expect(await page.locator("tr.is-hit").count()).toBe(0);

  // 「この条件だけを選択」は置き換え（102 = 打ち合わせ。その他工数なので version は空）
  await page.locator('tr[data-actual-id="102"] td:nth-child(3)').click();
  await expect(page.locator("#actualSelectionCount")).toContainText("6 件");
  await page.locator("#btnBulkActualCondition").click();
  await page.selectOption("#actualCondVersion", "__none__");
  await page.selectOption("#actualCondTask", "");
  await expect(page.locator("#actualCondHits")).toContainText("1");
  await page.locator("#btnActualConditionReplace").click();
  await expect(page.locator("#actualSelectionCount")).toContainText("1 件");

  // 表示フィルタ外の該当は注記される
  // #actualViewMode/#actualMemberSelect はコンパクト版レイアウト（既定は segmented のため非表示）に
  // ぶら下がっており selectOption が使えないため、実際にユーザーが操作する segmented 側の
  // <select id="actualViewMode2">（表示・変更イベントは js/events.js が #actualViewMode に同期）と
  // window に公開済みの handleActualMemberChange を使う（Task 3 の setActualViewType 経由と同じ方針）。
  await page.selectOption("#actualViewMode2", "member");
  await page.evaluate(() => window.handleActualMemberChange("佐藤", "actualMemberButtons2"));
  await page.locator("#btnBulkActualCondition").click();
  await page.selectOption("#actualCondVersion", "V2.3");
  await page.selectOption("#actualCondMember", "田中");
  await expect(page.locator("#actualCondHits")).toContainText("表示外");
});

test("タイムライン: 結合バーから 5 件を選び、詳細パネルの一括編集で付け替える", async ({ page }) => {
  await page.evaluate(() => window.setActualViewType("timeline"));
  const bar = page.locator(`.actual-tl-bar.actual[data-actual-ids="${TARGET_IDS.join(",")}"]`);
  await expect(bar).toBeVisible();
  await expect(page.locator("#actualSelectionTray")).toBeVisible(); // タイムラインではトレイ常設

  // 条件で選択のハイライトもタイムラインのバーに効く（結合バー = 5件がまるごと一致）
  await page.locator("#btnBulkActualCondition").click();
  await expect(page.locator("#actualConditionPopover")).toBeVisible();
  await page.selectOption("#actualCondMember", "田中");
  await page.selectOption("#actualCondVersion", "V2.3");
  await page.selectOption("#actualCondTask", "帳票A出力改修");
  await expect(page.locator(".actual-tl-bar.actual.is-hit")).toHaveCount(1);
  await page.locator("#btnActualConditionClose").click();
  await expect(page.locator("#actualConditionPopover")).toBeHidden();

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
  await page.evaluate(() => window.setActualViewType("timeline"));
  const bar = page.locator(`.actual-tl-bar.actual[data-actual-ids="${TARGET_IDS.join(",")}"]`);
  await bar.click({ modifiers: ["Control"] });
  await expect(bar).toHaveClass(/selected/);
  await expect(page.locator("#actualSelectionCount")).toContainText("5 件");
  await expect(page.locator("#atlDetailPanel")).toHaveCount(0); // 修飾キー時は詳細を開かない
  await bar.click({ modifiers: ["Control"] });
  await expect(bar).not.toHaveClass(/selected/);
  await expect(page.locator("#actualSelectionCount")).toContainText("0 件");

  await page.locator('.actual-tl-bar.actual[data-actual-ids="102"]').click({ button: "right" });
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
