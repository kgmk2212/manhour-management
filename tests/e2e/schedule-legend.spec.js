// ガントの下のバーの色の凡例の実アプリ統合テスト（js/schedule-legend.js）。
import { test, expect } from "@playwright/test";

const b = { status: "pending", color: "", note: "", interruptions: [] };
const T = (id, m, ver, task, s, e) => ({ ...b, id, member: m, version: ver, task, process: "PG", startDate: s, endDate: e, estimatedHours: 16 });
const SEED = [
  T("a", "田中", "定期2026-10", "請求書出力：電子帳簿保存法対応", "2026-09-14", "2026-09-15"),
  T("b", "田中", "臨時2026-09", "権限管理：不具合修正", "2026-09-16", "2026-09-17"),
  T("c", "佐藤", "定期2026-10", "請求書出力：電子帳簿保存法対応", "2026-09-21", "2026-09-22"),
];

async function open(page, settings) {
  await page.clock.setFixedTime(new Date("2026-09-15T10:00:00"));
  await page.addInitScript(([sc, st]) => {
    localStorage.clear();
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode: "member", ...st }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, [SEED, settings]);
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
}

test("以前の表示では、表示中の対応を札で並べ、選ぶとその対応を強調・もう一度で解除する", async ({ page }) => {
  await open(page, { memberLayout: "lanes" });
  const legend = page.locator("#scheduleLegend");
  await expect(legend).toBeVisible();
  const items = legend.locator(".schedule-legend-item");
  await expect(items).toHaveCount(2); // 同じ版数・対応名は 1 件にまとめる
  await expect(items.first()).toContainText("定期2026-10");

  await items.first().click();
  await expect(items.first()).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.getScheduleRenderer().legendHighlight)).toContain("請求書出力：電子帳簿保存法対応");
  await page.mouse.move(5, 5); // マウスを離しても選んだ強調は残る
  expect(await page.evaluate(() => window.getScheduleRenderer().legendHighlight)).toContain("請求書出力");
  await items.first().click();
  expect(await page.evaluate(() => window.getScheduleRenderer().legendHighlight)).toBeNull();
});

test("担当者×タスク表示は、タスクの行が見えているときは出さず、全員を畳むと出す", async ({ page }) => {
  await open(page, { memberLayout: "tasks" });
  await expect(page.locator("#scheduleLegend")).toBeHidden();
  await page.evaluate(() => {
    const r = window.getScheduleRenderer();
    ["田中", "佐藤"].forEach((m) => r.collapsedMembers.add(m));
    r.render(r.currentYear, r.currentMonth, r.filteredSchedulesCache);
  });
  await expect(page.locator("#scheduleLegend")).toBeVisible();
  await expect(page.locator("#scheduleLegend .schedule-legend-item")).toHaveCount(2);
});

test.describe("スマホ", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("最初は閉じていて、開くと札が出る", async ({ page }) => {
    await open(page, { memberLayout: "lanes" });
    const chips = page.locator("#scheduleLegend .schedule-legend-chips");
    await expect(page.locator("#scheduleLegend")).toBeVisible();
    await expect(chips).toBeHidden();
    await page.locator("#scheduleLegend .schedule-legend-toggle").tap();
    await expect(chips).toBeVisible();
  });
});
