// 実績登録/編集モーダルで版数を変えたとき、対応名が候補 select のまま新版数の候補から選べること
// - 候補 select で選ばれていた旧版数の対応名は持ち越さず（テキストボックス化せず）、
//   新版数の候補一覧から選択・保存できる
// - 同名の対応が新版数にもあればそれを再選択する
// - 対照: 自由入力中（新規入力...）の名前は版数を変えても保持される（既存仕様）
import { test, expect } from "@playwright/test";

const ESTIMATES = [
  { id: 1, version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 40,
    workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
  { id: 2, version: "V2.0", task: "対応B", process: "PG", member: "山田", hours: 40,
    workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
  { id: 3, version: "V1.0", task: "共通対応", process: "PG", member: "山田", hours: 10,
    workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 10 } },
  { id: 4, version: "V2.0", task: "共通対応", process: "PG", member: "山田", hours: 10,
    workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 10 } },
];

const ACTUALS = [
  // 前日の実績: 新規登録時に版数・対応名のプリセット元になる
  { id: 201, date: "2026-08-19", version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 1,
    createdAt: "2026-08-19T09:00:00.000Z" },
  // 編集対象
  { id: 202, date: "2026-08-20", version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 2,
    createdAt: "2026-08-20T10:00:00.000Z" },
];

const SEED = {
  manhour_estimates: JSON.stringify(ESTIMATES),
  manhour_actuals: JSON.stringify(ACTUALS),
  manhour_currentTab: "actual",
};

const readActuals = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("manhour_actuals")));

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, SEED);
  await page.goto("/index.html");
  await expect(page.locator("#actual")).toHaveClass(/active/);
});

test("新規登録: 版数を変えると対応名は候補 select のままで、新版数の候補を選んで保存できる", async ({ page }) => {
  await page.evaluate(() => window.addActualFromCalendar("山田", "2026-08-21"));
  await expect(page.locator("#editActualModal")).toBeVisible();

  const version = page.locator("#editActualVersion");
  const taskSelect = page.locator("#editActualTaskSelect");
  const taskInput = page.locator("#editActualTaskSearch");

  // 前回実績（V1.0/対応A）がプリセットされている
  await expect(version).toHaveValue("V1.0");
  await expect(taskSelect).toBeVisible();
  await expect(taskSelect).toHaveValue("対応A");

  // 版数を変える → 対応名はテキストボックス化せず、候補 select が空で表示される
  await version.selectOption("V2.0");
  await expect(taskSelect).toBeVisible();
  await expect(taskInput).toBeHidden();
  await expect(taskSelect).toHaveValue("");
  await expect(taskSelect.locator('option[value="対応B"]')).toHaveCount(1);

  // 新版数の候補を選んで保存できる
  await taskSelect.selectOption("対応B");
  await expect(page.locator("#editActualProcess")).toHaveValue("PG");
  await page.locator("#btnSaveActualEdit").click();
  await expect(page.locator("#editActualModal")).toBeHidden();

  const saved = (await readActuals(page)).find((a) => a.date === "2026-08-21");
  expect(saved).toMatchObject({ version: "V2.0", task: "対応B", process: "PG", member: "山田" });
});

test("新規登録: 同名の対応が新版数にもあればそれを再選択する", async ({ page }) => {
  await page.evaluate(() => window.addActualFromCalendar("山田", "2026-08-21"));
  await expect(page.locator("#editActualModal")).toBeVisible();

  const version = page.locator("#editActualVersion");
  const taskSelect = page.locator("#editActualTaskSelect");

  await taskSelect.selectOption("共通対応");
  await version.selectOption("V2.0");

  await expect(taskSelect).toBeVisible();
  await expect(taskSelect).toHaveValue("共通対応");
  await expect(page.locator("#editActualTaskSearch")).toBeHidden();
});

test("編集: 版数を変えると対応名は候補 select のままで新版数の候補から選べる", async ({ page }) => {
  await page.evaluate(() => window.editActual(202));
  await expect(page.locator("#editActualModal")).toBeVisible();

  const version = page.locator("#editActualVersion");
  const taskSelect = page.locator("#editActualTaskSelect");
  const taskInput = page.locator("#editActualTaskSearch");

  await expect(version).toHaveValue("V1.0");
  await expect(taskSelect).toHaveValue("対応A");

  await version.selectOption("V2.0");
  await expect(taskSelect).toBeVisible();
  await expect(taskInput).toBeHidden();
  await expect(taskSelect).toHaveValue("");
  await expect(taskSelect.locator('option[value="対応B"]')).toHaveCount(1);
});

test("対照: 自由入力中（新規入力...）の名前は版数を変えても保持される", async ({ page }) => {
  await page.evaluate(() => window.addActualFromCalendar("山田", "2026-08-21"));
  await expect(page.locator("#editActualModal")).toBeVisible();

  const version = page.locator("#editActualVersion");
  const taskSelect = page.locator("#editActualTaskSelect");
  const taskInput = page.locator("#editActualTaskSearch");

  await taskSelect.selectOption("__NEW__");
  await expect(taskInput).toBeVisible();
  await taskInput.fill("打ち合わせ");

  await version.selectOption("V2.0");
  await expect(taskInput).toBeVisible();
  await expect(taskInput).toHaveValue("打ち合わせ");
  await expect(taskSelect).toBeHidden();
});
