// スマホのガント: 「選択」モードでタップ選択 → 選択中のバーを長押しドラッグで一括移動する実アプリ統合テスト。
// タッチは CDP の touch イベントで送り、js/schedule-render.js の setupTouchHandlers の経路を通す。
// 2026-09-07(月)〜09-18(金) の平日はすべて営業日（祝日なし）。DAY_WIDTH は 28px（論理座標）。
// barCenter は日の境目でない位置へ横スクロールするので、描き直しでスクロール位置が丸められて
// 指の下の日付がずれる不具合（render の scrollLeft 復元）の回帰も兼ねる。
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const base = {
  version: "V1.0", status: "pending", color: "#4a90d9", note: "",
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
};

const SEED_SCHEDULES = [
  { ...base, id: "sch_a", task: "対応A", process: "UI", member: "山田",
    startDate: "2026-09-09", endDate: "2026-09-09", estimatedHours: 8 },
  { ...base, id: "sch_b", task: "対応B", process: "PG", member: "鈴木",
    startDate: "2026-09-10", endDate: "2026-09-10", estimatedHours: 8 },
];

const seedEntries = (schedules) => ({
  manhour_estimates: JSON.stringify([]),
  manhour_actuals: JSON.stringify([]),
  manhour_schedules: JSON.stringify(schedules),
  manhour_scheduleSettings: JSON.stringify({ currentMonth: "2026-09", viewMode: "member" }),
  manhour_currentTab: "schedule",
});

const readSchedules = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
const startOf = (list, id) => list.find((s) => s.id === id).startDate;

/** バーが画面の中ほどに来るよう横スクロールしてから、バー中心（ページ座標）を返す */
async function barCenter(page, id) {
  await page.evaluate((scheduleId) => {
    const renderer = window.getScheduleRenderer();
    const rect = renderer.scheduleRects.find((r) => r.schedule.id === scheduleId);
    const sc = renderer.scrollContainer;
    sc.scrollLeft = Math.max(0, rect.x * (renderer.uiScale || 1) - 60);
  }, id);
  await page.locator("#ganttTimelineCanvas").scrollIntoViewIfNeeded();
  const canvasBox = await page.locator("#ganttTimelineCanvas").boundingBox();
  const info = await page.evaluate((scheduleId) => {
    const renderer = window.getScheduleRenderer();
    const rect = renderer.scheduleRects.find((r) => r.schedule.id === scheduleId);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, uiScale: renderer.uiScale || 1 };
  }, id);
  return {
    x: canvasBox.x + (info.x + info.width / 2) * info.uiScale,
    y: canvasBox.y + (info.y + info.height / 2) * info.uiScale,
    dayPx: 28 * info.uiScale,
  };
}

/** 長押し（500ms 超）してから横へなぞり、指を止めてから離す */
async function longPressDrag(page, from, dx) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  await page.waitForTimeout(650);
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + dx * i / 8, y: from.y }] });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(150);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + dx, y: from.y }] });
  await page.waitForTimeout(60);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.describe("スマホのガントで複数選択・一括移動", () => {
  test("選択モードでタップして2本選び、長押しドラッグで同じ営業日数ずらせる", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries(SEED_SCHEDULES));
    await page.goto("/index.html");
    await expect(page.locator("#ganttTimelineCanvas")).toBeVisible();

    const modeBtn = page.locator("#scheduleSelectModeBtn");
    const dock = page.locator("#scheduleSelectionChip");
    await expect(modeBtn).toBeVisible();
    await expect(dock).toBeHidden();

    await modeBtn.tap();
    await expect(modeBtn).toHaveAttribute("aria-pressed", "true");
    await expect(dock).toBeVisible();
    await expect(page.locator("#scheduleSelectionCount")).toHaveText("0");
    await expect(page.locator("#scheduleSelectionHint")).toContainText("タップして選択");

    const a = await barCenter(page, "sch_a");
    await page.touchscreen.tap(a.x, a.y);
    const b = await barCenter(page, "sch_b");
    await page.touchscreen.tap(b.x, b.y);
    await expect(page.locator("#scheduleSelectionCount")).toHaveText("2");
    await expect(page.locator("#scheduleSelectionHint")).toContainText("長押しでまとめて移動");
    await expect(page.locator("#scheduleDetailModal")).toBeHidden();
    // タップ後の合成 mousemove でツールチップが出て残らない
    await expect(page.locator(".gantt-tooltip:visible")).toHaveCount(0);

    // 山田のバー(9/9 水)を長押しして5日ぶん右へ → 9/14(月)。水→月は 3営業日
    const a2 = await barCenter(page, "sch_a");
    await longPressDrag(page, a2, a2.dayPx * 5);

    const moved = await readSchedules(page);
    expect(startOf(moved, "sch_a")).toBe("2026-09-14");
    expect(startOf(moved, "sch_b")).toBe("2026-09-15"); // 9/10(木) + 3営業日

    // 移動後も選択は残り、「完了」で選択モードごと終わる
    await expect(page.locator("#scheduleSelectionCount")).toHaveText("2");
    await page.locator("#scheduleSelectionChip .ssc-done").tap();
    await expect(dock).toBeHidden();
    await expect(modeBtn).toHaveAttribute("aria-pressed", "false");

    // 選択モードでなければ、タップは従来どおり詳細を開く
    const a3 = await barCenter(page, "sch_a");
    await page.touchscreen.tap(a3.x, a3.y);
    await expect(page.locator("#scheduleDetailModal")).toBeVisible();

    expect(errors).toEqual([]);
  });
});
