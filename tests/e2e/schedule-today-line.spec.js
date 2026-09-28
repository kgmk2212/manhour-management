// 今日の線は行の背景の上・バーの下に描く（バーと遅延のはみ出しを縦に切らない）ことの実アプリ統合テスト。
import { test, expect } from "@playwright/test";

const b = { status: "pending", color: "", note: "", interruptions: [] };
const SEED = [
  // 田中: 9/24 をまたぐバー
  { ...b, id: "a", member: "田中", version: "V1", task: "A", process: "PG", startDate: "2026-09-21", endDate: "2026-09-30", estimatedHours: 40 },
  // 佐藤: 9/4 に終わって未完了 → 9/5〜今日（9/24）まで遅延のはみ出し
  { ...b, id: "c", member: "佐藤", version: "V1", task: "C", process: "PG", startDate: "2026-09-01", endDate: "2026-09-04", estimatedHours: 32 },
  // 鈴木: 完了済みで 9/24 にバーもはみ出しも無い
  { ...b, id: "d", member: "鈴木", version: "V1", task: "D", process: "PG", startDate: "2026-09-01", endDate: "2026-09-02", estimatedHours: 16, status: "completed" },
];
const EST = SEED.map((s, i) => ({ id: 100 + i, version: s.version, task: s.task, process: s.process, member: s.member, hours: 40, workMonth: "2026-09" }));

test("今日の線はバー・遅延のはみ出しの下に描かれ、何も無い行では見える", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
  await page.addInitScript(([sc, est]) => {
    localStorage.clear();
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_estimates", JSON.stringify(est));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode: "member" }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, [SEED, EST]);
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);

  // 各担当者の行で、1 段目のバーの高さの中央・今日の列の中央のピクセル
  const px = await page.evaluate(() => {
    const r = window.getScheduleRenderer();
    const ctx = r.timelineCtx;
    const s = r.timelineRasterScale;
    const x = (r.dateToX(new Date(2026, 8, 24, 12)) + 14) * s;
    const out = {};
    r.rows.forEach((row, i) => {
      const y = (r.rowY(i) + 18) * s;
      const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      out[row.label] = [d[0], d[1], d[2]];
    });
    return out;
  });
  const isLineRed = ([r, g, bl]) => r > 150 && g < 70 && bl < 70;
  expect(isLineRed(px["鈴木"]), `鈴木: ${px["鈴木"]}`).toBe(true);   // 何も無い行では線が見える
  expect(isLineRed(px["田中"]), `田中: ${px["田中"]}`).toBe(false);  // バーの下
  expect(isLineRed(px["佐藤"]), `佐藤: ${px["佐藤"]}`).toBe(false);  // 遅延のはみ出しの下
});
