// 大きなガントを iPhone で開いても、真っ白にならず、ぼやけないことの実アプリ統合テスト。
// iOS（iPhone の Chrome も同じ WebKit）は canvas 1 枚あたり約 1,677 万画素・ページ全体の canvas メモリにも上限がある。
// 表はタイル（js/schedule-tiles.js）に分け、見えている付近だけを元の解像度で描く。
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

test("iPhone で縦に長い 3 段表示でも、見えている付近のタイルだけを元の解像度で描き、日付の行とバーが見える", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
  await page.addInitScript((sc) => {
    localStorage.clear();
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode: "member", memberLayout: "tasks", taskLabelStyle: "A" }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, MANY);
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
  // ガントを画面に出す
  await page.locator("#ganttTimelineScroll").evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 60));
  await page.waitForTimeout(200);

  const m = await page.evaluate(() => {
    const r = window.getScheduleRenderer();
    const tiles = [...document.querySelectorAll("#ganttTimelineCanvas canvas, #ganttLabelCanvas canvas, #ganttStickyRow canvas")];
    const areas = tiles.map((c) => c.width * c.height);
    const s = r.timelineRasterScale;
    // 見えている範囲にあるバー 1 本の中央と、日付の行のピクセル
    const vis = r.timelineSurface.visibleRect();
    const inView = r.scheduleRects.find((x) => x.x * r.uiScale >= vis.x && (x.x + x.width) * r.uiScale <= vis.x + vis.w
      && x.y * r.uiScale >= vis.y && (x.y + x.height) * r.uiScale <= vis.y + vis.h);
    const px = (lx, ly) => r.timelineCtx.getImageData(Math.round(lx * s), Math.round(ly * s), 1, 1).data;
    const bar = inView ? px(inView.x + inView.width / 2, inView.y + inView.height / 2) : [0, 0, 0, 0];
    const header = px(vis.x / r.uiScale + 20, 35);
    return { count: tiles.length, maxArea: Math.max(...areas), totalArea: areas.reduce((a, b) => a + b, 0), scale: s,
      fullArea: r.timelineWidth * r.totalHeight * s * s, barAlpha: bar[3], headerAlpha: header[3], found: !!inView };
  });
  expect(m.scale).toBe(3);                          // 解像度は下げない（ぼやけない）
  expect(m.maxArea).toBeLessThanOrEqual(16777216);  // タイル 1 枚は上限内
  expect(m.totalArea).toBeLessThan(m.fullArea / 4); // 全体を描かず、見えている付近だけ
  expect(m.found).toBe(true);
  expect(m.barAlpha).toBe(255);
  expect(m.headerAlpha).toBe(255);

  // 下へスクロールすると、見えてきた所のタイルが描かれる
  const before = await page.evaluate(() => [...document.querySelectorAll("#ganttTimelineCanvas canvas")].map((c) => c.style.top).join(","));
  await page.evaluate(() => { document.getElementById("ganttTimelineScroll").scrollTop = 3000; });
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("#ganttTimelineCanvas canvas")].map((c) => c.style.top).join(","))).not.toBe(before);
});
