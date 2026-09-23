// 重なりレーン化（可変行高）と遅延表現の実アプリ統合テスト。
import { test, expect } from "@playwright/test";

const MEMBER = "山田";
const base = { version: "V1.0", member: MEMBER, status: "pending", color: "", note: "", interruptions: [],
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };

const seed = (schedules, extra = {}) => ({
  manhour_estimates: "[]", manhour_actuals: JSON.stringify(extra.actuals || []),
  manhour_schedules: JSON.stringify(schedules),
  manhour_scheduleSettings: JSON.stringify({ currentMonth: "2026-08", viewMode: "member" }),
  manhour_currentTab: "schedule",
});

async function open(page, schedules, extra) {
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, seed(schedules, extra));
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
}

const rectsOf = (page) => page.evaluate(() => {
  const r = window.getScheduleRenderer();
  return {
    rects: r.scheduleRects.map((x) => ({ id: x.schedule.id, y: x.y, x: x.x, w: x.width, h: x.height })),
    layout: r.rowLayout, uiScale: r.uiScale || 1,
  };
});

test.describe("重なりレーン化", () => {
  test("同じ担当者の重なる予定は下段に積まれ、行が伸び、下段のバーをクリックすると詳細が開く", async ({ page }) => {
    await open(page, [
      { ...base, id: "a", task: "A", process: "PG", startDate: "2026-08-03", endDate: "2026-08-07", estimatedHours: 40 },
      { ...base, id: "b", task: "B", process: "PG", startDate: "2026-08-05", endDate: "2026-08-06", estimatedHours: 16 },
      { ...base, id: "c", member: "佐藤", task: "C", process: "PG", startDate: "2026-08-03", endDate: "2026-08-04", estimatedHours: 16 },
    ]);
    const { rects, layout, uiScale } = await rectsOf(page);
    const a = rects.find((r) => r.id === "a");
    const b = rects.find((r) => r.id === "b");
    const c = rects.find((r) => r.id === "c");
    expect(b.y - a.y).toBe(28);                 // LANE_HEIGHT
    // a・b の行は 36 + 28 に伸び、別担当者 c のバーはその行の範囲に入らない
    const rowA = layout.offsets.findIndex((o, i) => a.y >= o && a.y < o + layout.heights[i]);
    expect(layout.heights[rowA]).toBe(64);
    const rowTop = layout.offsets[rowA];
    expect(c.y < rowTop || c.y >= rowTop + 64).toBe(true);
    expect(layout.heights.filter((h) => h === 36)).toHaveLength(layout.heights.length - 1);

    const box = await page.locator("#ganttTimelineCanvas").boundingBox();
    await page.mouse.click(box.x + (b.x + b.w / 2) * uiScale, box.y + (b.y + b.h / 2) * uiScale);
    await expect(page.locator("#scheduleDetailModal")).toBeVisible();
    await expect(page.locator("#scheduleDetailTitle")).toContainText("B");
  });
});

test.describe("遅延表現", () => {
  test("終了日を過ぎた未完了予定は今日までのしっぽが描かれ、完了済みには描かれない", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-12T10:00:00"));
    await open(page, [
      { ...base, id: "late", task: "遅延", process: "PG", startDate: "2026-08-03", endDate: "2026-08-05", estimatedHours: 24 },
      { ...base, id: "done", task: "完了", process: "PG", member: "佐藤", status: "completed",
        startDate: "2026-08-03", endDate: "2026-08-05", estimatedHours: 24 },
    ], { actuals: [{ id: 1, date: "2026-08-04", version: "V1.0", task: "遅延", process: "PG", member: MEMBER, hours: 10 }] });

    const tails = await page.evaluate(() => window.getScheduleRenderer().overrunRects);
    expect(tails.map((t) => t.scheduleId)).toEqual(["late"]);
    const late = (await rectsOf(page)).rects.find((r) => r.id === "late");
    expect(tails[0].x).toBeCloseTo(late.x + late.w, 0);  // バー右端から始まる
    expect(tails[0].width).toBe(7 * 28);                   // 08-06〜08-12 の7日

    const label = await page.evaluate(() => window.getScheduleRenderer().overrunRects[0].label);
    expect(label).toBe("! 10/24h");
  });
});
