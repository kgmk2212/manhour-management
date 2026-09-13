// 実績タイムラインの右ペイン: タブ／表示形式を切り替えたときに body 直下の UI を残さない
//
// 右ペインのモバイル用オーバーレイ（#atlPaneOverlay）と選択中インジケータ
// （#atlSelectedIndicator）は document.body 直下に生成されるため、タブの
// display:none では消えない。切替時に明示的に片付けていないと、他タブの上に
// 暗幕が残り操作を全部飲み込む（body の overflow:hidden も残る）。
import { test, expect } from "@playwright/test";

const YM = new Date().toISOString().slice(0, 7); // タイムラインは当月を表示する
const D = (dd) => `${YM}-${String(dd).padStart(2, "0")}`;

const ESTIMATES = [
  { id: 1, version: "V2.3", task: "帳票A出力改修", process: "PG", member: "田中", hours: 40, workMonth: YM, workMonths: [YM], monthlyHours: { [YM]: 40 } },
  { id: 2, version: "V2.3", task: "ログイン画面改修", process: "UI", member: "佐藤", hours: 24, workMonth: YM, workMonths: [YM], monthlyHours: { [YM]: 24 } },
];
// 実績IDは見積IDと衝突させない（storage.js の id 重複修復が走って振り直されるため）
const ACTUALS = [
  { id: 101, date: D(17), version: "V2.3", task: "帳票A出力改修", process: "PG", member: "田中", hours: 6, createdAt: "2026-08-01T00:00:00.000Z" },
  { id: 102, date: D(18), version: "V2.3", task: "ログイン画面改修", process: "UI", member: "佐藤", hours: 8, createdAt: "2026-08-01T00:00:00.000Z" },
];

// 残工数が無い版数は「完了済み」と判定され右ペインのタスクカードが消えるため、
// 残工数を明示して仕掛かり中にしておく（id は見積/実績と別空間を使う）
const REMAINING = [
  { id: 201, version: "V2.3", task: "帳票A出力改修", process: "PG", member: "田中", remainingHours: 30, updatedAt: "2026-08-01T00:00:00.000Z", note: "" },
  { id: 202, version: "V2.3", task: "ログイン画面改修", process: "UI", member: "佐藤", remainingHours: 16, updatedAt: "2026-08-01T00:00:00.000Z", note: "" },
];

const SEED = {
  manhour_estimates: JSON.stringify(ESTIMATES),
  manhour_actuals: JSON.stringify(ACTUALS),
  manhour_remainingEstimates: JSON.stringify(REMAINING),
  manhour_currentTab: "actual",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, SEED);
  await page.goto("/index.html");
  await expect(page.locator("#actual")).toHaveClass(/active/);
  await page.evaluate(() => window.setActualViewType("timeline"));
  await expect(page.locator("#actualTimeline")).toBeVisible();
});

/** 画面中央の最前面要素の id（暗幕が残っていれば atlPaneOverlay になる） */
const topElementIdAtCenter = (page) =>
  page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return el ? el.id : null;
  });

test.describe("モバイル幅（iPhone 相当）", () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true });

  test("パネルを開いたまま他タブへ移ると暗幕もスクロールロックも残らない", async ({ page }) => {
    await page.locator("#atlTogglePane").tap();
    await expect(page.locator("#atlPaneOverlay")).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

    await page.evaluate(() => window.showTab("estimate"));
    await expect(page.locator("#estimate")).toHaveClass(/active/);

    await expect(page.locator("#atlPaneOverlay")).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(await topElementIdAtCenter(page)).not.toBe("atlPaneOverlay");
  });

  test("パネルを開いたまま表示形式を切り替えても暗幕が残らない", async ({ page }) => {
    await page.locator("#atlTogglePane").tap();
    await expect(page.locator("#atlPaneOverlay")).toBeVisible();

    await page.evaluate(() => window.setActualViewType("list"));
    await expect(page.locator("#actualTimeline")).toBeHidden();

    await expect(page.locator("#atlPaneOverlay")).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(await topElementIdAtCenter(page)).not.toBe("atlPaneOverlay");
  });

  test("バーの詳細パネルは他タブへ移ると閉じる", async ({ page }) => {
    await page.locator(".actual-tl-bar.actual").first().tap();
    await expect(page.locator("#atlDetailPanel")).toBeVisible();

    await page.evaluate(() => window.showTab("estimate"));
    await expect(page.locator("#estimate")).toHaveClass(/active/);

    await expect(page.locator("#atlDetailPanel")).toHaveCount(0);
  });

  test("選択中タスクのインジケータは他タブへ移ると消える", async ({ page }) => {
    await page.locator("#atlTogglePane").tap();
    await page.locator(".actual-tl-task-card").first().tap();
    await expect(page.locator("#atlSelectedIndicator")).toBeVisible();

    await page.evaluate(() => window.showTab("estimate"));
    await expect(page.locator("#estimate")).toHaveClass(/active/);

    await expect(page.locator("#atlSelectedIndicator")).toHaveCount(0);
  });
});

test.describe("PC 幅（対照: 暗幕を使わないのでデグレしない）", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  // #atlDetailPanel は body 直下の position:fixed な幅 360px の右パネル。
  // PC でもタブの display:none では消えないため、切替時に閉じる必要がある
  test("バーの詳細パネルは他タブへ移ると閉じる", async ({ page }) => {
    await page.locator(".actual-tl-bar.actual").first().click();
    await expect(page.locator("#atlDetailPanel")).toBeVisible();

    await page.evaluate(() => window.showTab("estimate"));
    await expect(page.locator("#estimate")).toHaveClass(/active/);

    await expect(page.locator("#atlDetailPanel")).toHaveCount(0);
  });

  test("バーの詳細パネルは表示形式を切り替えると閉じる", async ({ page }) => {
    await page.locator(".actual-tl-bar.actual").first().click();
    await expect(page.locator("#atlDetailPanel")).toBeVisible();

    await page.evaluate(() => window.setActualViewType("list"));
    await expect(page.locator("#actualTimeline")).toBeHidden();

    await expect(page.locator("#atlDetailPanel")).toHaveCount(0);
  });

  test("他タブから戻ってもタイムラインと右ペインが開いたまま使える", async ({ page }) => {
    await page.locator("#atlTogglePane").click();
    await expect(page.locator("#atlRightPane")).toHaveClass(/open/);

    await page.evaluate(() => window.showTab("estimate"));
    await expect(page.locator("#estimate")).toHaveClass(/active/);
    // PC ではオーバーレイは元から使われない
    await expect(page.locator("#atlPaneOverlay")).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

    await page.evaluate(() => window.showTab("actual"));
    await expect(page.locator("#actualTimeline")).toBeVisible();
    await expect(page.locator("#atlRightPane")).toHaveClass(/open/);
    await expect(page.locator(".actual-tl-task-card").first()).toBeVisible();
  });
});
