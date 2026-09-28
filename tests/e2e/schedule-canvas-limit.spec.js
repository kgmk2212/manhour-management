// canvas の画素数の上限対策の実アプリ統合テスト。
// iOS（iPhone の Chrome も同じ WebKit）は canvas 1 枚あたり約 1,677 万画素を超えると何も描かれない（真っ白）。
// タスクが多く 3 段表示で縦に長いとき、iPhone として開いても上限内に収め、日付の行とバーが描かれることを確かめる。
import { test, expect } from "@playwright/test";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

const b = { status: "pending", color: "", note: "", interruptions: [] };
const MANY = [];
for (let i = 0; i < 120; i++) {
  MANY.push({ ...b, id: `s${i}`, member: ["田中", "佐藤", "鈴木", "高橋"][i % 4], version: `定期2026-${9 + (i % 3)}`,
    task: `処理${i % 17}：対応${i}の名前`, process: "PG",
    startDate: `2026-09-${String(1 + (i % 25)).padStart(2, "0")}`, endDate: `2026-09-${String(3 + (i % 25)).padStart(2, "0")}`, estimatedHours: 16 });
}

test("iPhone で縦に長い 3 段表示でも、canvas を上限内に収めて日付の行とバーを描く", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
  await page.addInitScript((sc) => {
    localStorage.clear();
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode: "member", memberLayout: "tasks", taskLabelStyle: "A" }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, MANY);
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);

  const m = await page.evaluate(() => {
    const r = window.getScheduleRenderer();
    const t = document.getElementById("ganttTimelineCanvas");
    const l = document.getElementById("ganttLabelCanvas");
    // 日付の行（上端）とバー 1 本の中央に色が塗られているか
    const ctx = t.getContext("2d");
    const s = r.timelineRasterScale;
    const header = ctx.getImageData(Math.round(100 * s), Math.round(35 * s), 1, 1).data;
    const rect = r.scheduleRects[0];
    const bar = ctx.getImageData(Math.round((rect.x + rect.width / 2) * s), Math.round((rect.y + rect.height / 2) * s), 1, 1).data;
    return { tArea: t.width * t.height, lArea: l.width * l.height, scale: s, headerAlpha: header[3], barAlpha: bar[3] };
  });
  expect(m.tArea).toBeLessThanOrEqual(16777216);
  expect(m.lArea).toBeLessThanOrEqual(16777216);
  expect(m.scale).toBeLessThan(3);
  expect(m.headerAlpha).toBe(255);
  expect(m.barAlpha).toBe(255);
});
