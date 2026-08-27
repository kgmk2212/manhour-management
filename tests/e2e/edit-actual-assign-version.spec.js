// 版数のない実績（その他工数）の編集で版数・工程を付与できること
// - 編集モーダルで版数・工程 select がグレーアウトされない
// - 版数を選ぶと対応名が候補 select モードへ切り替わる（候補に無い名前は自由入力のまま保持）
// - 保存すると localStorage の実績に version/process が反映され、他の実績は変化しない
import { test, expect } from "@playwright/test";

const ESTIMATES = [
  { id: 1, version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 40,
    workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
];

const ACTUALS = [
  // 版数なし（その他工数）: 候補に無い対応名
  { id: 101, date: "2026-08-20", version: "", task: "打ち合わせ", process: "", member: "山田", hours: 1,
    createdAt: "2026-08-20T09:00:00.000Z" },
  // 対照: 通常の版数付き実績（変化してはいけない）
  { id: 102, date: "2026-08-20", version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 2,
    createdAt: "2026-08-20T10:00:00.000Z" },
  // 版数なしだが対応名が見積候補と一致する
  { id: 103, date: "2026-08-20", version: "", task: "対応A", process: "", member: "山田", hours: 1,
    createdAt: "2026-08-20T11:00:00.000Z" },
];

const SEED = {
  manhour_estimates: JSON.stringify(ESTIMATES),
  manhour_actuals: JSON.stringify(ACTUALS),
  manhour_currentTab: "actual",
};

/** 保存済み実績を id で取り出す */
const readActual = (page, id) =>
  page.evaluate((id) => JSON.parse(localStorage.getItem("manhour_actuals")).find((a) => a.id === id), id);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, SEED);
  await page.goto("/index.html");
  await expect(page.locator("#actual")).toHaveClass(/active/);
});

test("その他工数の編集: 版数・工程が有効で、候補に無い対応名は保持して保存できる", async ({ page }) => {
  await page.evaluate(() => window.editActual(101));
  await expect(page.locator("#editActualModal")).toBeVisible();

  const version = page.locator("#editActualVersion");
  const process = page.locator("#editActualProcess");
  const taskSelect = page.locator("#editActualTaskSelect");
  const taskInput = page.locator("#editActualTaskSearch");
  const reviewGroup = page.locator("#editActualIsReviewGroup");

  // グレーアウトされていない
  await expect(version).toBeEnabled();
  await expect(process).toBeEnabled();
  // 開いた直後は自由入力モード（レビュー行は非表示）
  await expect(taskInput).toBeVisible();
  await expect(taskInput).toHaveValue("打ち合わせ");
  await expect(taskSelect).toBeHidden();
  await expect(reviewGroup).toBeHidden();

  // 版数を付ける → 候補に「打ち合わせ」は無いので自由入力のまま名前を保持、レビュー行が現れる
  await version.selectOption("V1.0");
  await expect(taskInput).toBeVisible();
  await expect(taskInput).toHaveValue("打ち合わせ");
  await expect(taskSelect).toBeHidden();
  await expect(reviewGroup).toBeVisible();

  await process.selectOption("PG");
  await page.locator("#btnSaveActualEdit").click();
  await expect(page.locator("#editActualModal")).toBeHidden();

  const saved = await readActual(page, 101);
  expect(saved).toMatchObject({ version: "V1.0", process: "PG", task: "打ち合わせ", hours: 1 });

  // 対照: 通常実績は変化しない
  const control = await readActual(page, 102);
  expect(control).toMatchObject({ version: "V1.0", process: "PG", task: "対応A", hours: 2 });
});

test("その他工数の編集: 対応名が候補にあれば候補 select に切り替わり、版数を空に戻すと自由入力へ戻る", async ({ page }) => {
  await page.evaluate(() => window.editActual(103));
  await expect(page.locator("#editActualModal")).toBeVisible();

  const version = page.locator("#editActualVersion");
  const taskSelect = page.locator("#editActualTaskSelect");
  const taskInput = page.locator("#editActualTaskSearch");

  await version.selectOption("V1.0");
  await expect(taskSelect).toBeVisible();
  await expect(taskSelect).toHaveValue("対応A");
  await expect(taskInput).toBeHidden();

  // 版数を外すと自由入力モードへ戻り、名前は保持される
  await version.selectOption("");
  await expect(taskInput).toBeVisible();
  await expect(taskInput).toHaveValue("対応A");
  await expect(taskSelect).toBeHidden();
  await expect(page.locator("#editActualIsReviewGroup")).toBeHidden();
});

test("対照: 通常実績の編集は従来どおり候補 select モードで開く", async ({ page }) => {
  await page.evaluate(() => window.editActual(102));
  await expect(page.locator("#editActualModal")).toBeVisible();

  await expect(page.locator("#editActualVersion")).toHaveValue("V1.0");
  await expect(page.locator("#editActualVersion")).toBeEnabled();
  await expect(page.locator("#editActualProcess")).toHaveValue("PG");
  await expect(page.locator("#editActualTaskSelect")).toBeVisible();
  await expect(page.locator("#editActualTaskSelect")).toHaveValue("対応A");
  await expect(page.locator("#editActualTaskSearch")).toBeHidden();
  await expect(page.locator("#editActualIsReviewGroup")).toBeVisible();
});
