// 今日の線が行の背景・バーに隠れず、行のある部分でも見えることの実アプリ統合テスト。
import { test, expect } from "@playwright/test";

const b = { status: "pending", color: "", note: "", interruptions: [] };
const SEED = [
  { ...b, id: "a", member: "田中", version: "V1", task: "A", process: "PG", startDate: "2026-09-21", endDate: "2026-09-30", estimatedHours: 40 },
  { ...b, id: "c", member: "佐藤", version: "V1", task: "C", process: "PG", startDate: "2026-09-01", endDate: "2026-09-04", estimatedHours: 32 },
];

test("今日の線は行の背景とバーより手前に描かれる（行のある高さでも赤い）", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
  await page.addInitScript((sc) => {
    localStorage.clear();
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode: "member" }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, SEED);
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);

  // 行の中（バーの無い行＝佐藤、バーの上＝田中）で、今日の列の中央のピクセルが赤いこと
  const px = await page.evaluate(() => {
    const r = window.getScheduleRenderer();
    const ctx = r.timelineCtx;
    const s = r.timelineRasterScale;
    const x = (r.dateToX(new Date(2026, 8, 24, 12)) + 14) * s;
    return r.rows.map((row, i) => {
      const y = (r.rowY(i) + r.rowHeight(i) / 2) * s;
      const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return { label: row.label, rgb: [d[0], d[1], d[2]] };
    });
  });
  for (const p of px) {
    const [r, g, bl] = p.rgb;
    expect(r - Math.max(g, bl), `${p.label}: ${p.rgb}`).toBeGreaterThan(60);
  }
});
