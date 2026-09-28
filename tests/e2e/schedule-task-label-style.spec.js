// ガントのタスク名の見せ方（3段／版数・処理名でまとめる／まとめる・見出し減）の実アプリ統合テスト。
// 設計: docs/superpowers/specs/2026-09-29-schedule-member-task-view-design.md（追記: タスク名の見せ方）
import { test, expect } from "@playwright/test";

const b = { status: "pending", color: "", note: "", interruptions: [],
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
const T = (id, m, ver, task, s, e) => ({ ...b, id, member: m, version: ver, task, process: "PG", startDate: s, endDate: e, estimatedHours: 16 });
const SEED = [
  T("a", "田中", "定期2026-10", "請求書出力：電子帳簿保存法対応", "2026-09-14", "2026-09-15"),
  T("b", "田中", "定期2026-10", "請求書出力：宛名の敬称切替", "2026-09-16", "2026-09-17"),
  T("c", "田中", "定期2026-10", "取引先マスタ保守画面：取引先区分の追加", "2026-09-24", "2026-09-25"),
  T("d", "田中", "臨時2026-09", "権限管理：不具合修正", "2026-09-28", "2026-09-29"),
];

async function open(page, { style, viewMode = "member", layout = "tasks" }) {
  await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
  await page.addInitScript(({ sc, style, viewMode, layout }) => {
    localStorage.clear();
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode, memberLayout: layout, ...(style ? { taskLabelStyle: style } : {}) }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, { sc: SEED, style, viewMode, layout });
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
}

const shape = (page) => page.evaluate(() => {
  const r = window.getScheduleRenderer();
  return r.rows.map((row, i) => `${row.type}${row.labelMode ? `/${row.labelMode}` : ""}:${row.label}@${r.rowHeight(i)}`);
});

test.describe("タスク名の見せ方", () => {
  test("既定は 3 段（版数／処理名／対応名）で、タスク行は 68px", async ({ page }) => {
    await open(page, {});
    expect(await shape(page)).toEqual([
      "memberGroup:田中@36",
      "memberTask/A:請求書出力：電子帳簿保存法対応@68",
      "memberTask/A:請求書出力：宛名の敬称切替@68",
      "memberTask/A:取引先マスタ保守画面：取引先区分の追加@68",
      "memberTask/A:権限管理：不具合修正@68",
    ]);
    // バーは 3 段の行の中で上下中央
    const bar = await page.evaluate(() => {
      const r = window.getScheduleRenderer();
      const rect = r.scheduleRects.find((x) => x.schedule.id === "a");
      const i = r.rows.findIndex((x) => x.label === "請求書出力：電子帳簿保存法対応");
      return { top: rect.y - r.rowY(i), h: rect.height, rowH: r.rowHeight(i) };
    });
    expect(Math.abs(bar.top + bar.h / 2 - bar.rowH / 2)).toBeLessThanOrEqual(1);
  });

  test("まとめる: 版数 → 処理名の見出し行の下に対応名の行が並ぶ", async ({ page }) => {
    await open(page, { style: "C" });
    expect(await shape(page)).toEqual([
      "memberGroup:田中@36",
      "versionHead:定期2026-10@26",
      "procHead:請求書出力@26",
      "memberTask/detail:請求書出力：電子帳簿保存法対応@38",
      "memberTask/detail:請求書出力：宛名の敬称切替@38",
      "procHead:取引先マスタ保守画面@26",
      "memberTask/detail:取引先マスタ保守画面：取引先区分の追加@38",
      "versionHead:臨時2026-09@26",
      "procHead:権限管理@26",
      "memberTask/detail:権限管理：不具合修正@38",
    ]);
  });

  test("まとめる（見出し減）: 対応が 1 件の処理名は見出し行を作らず 1 行にまとめる。設定画面で切り替えられる", async ({ page }) => {
    await open(page, { style: "C" });
    await page.evaluate(() => window.showTab("settings"));
    await page.locator('.settings-nav-item[data-category="display"]').click();
    await expect(page.locator('input[name="scheduleTaskLabelStyle"][value="C"]')).toBeChecked();
    await page.locator('input[name="scheduleTaskLabelStyle"][value="C2"]').evaluate((el) => el.click());
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_scheduleSettings")))).taskLabelStyle).toBe("C2");
    await page.evaluate(() => window.showTab("schedule"));
    expect(await shape(page)).toEqual([
      "memberGroup:田中@36",
      "versionHead:定期2026-10@26",
      "procHead:請求書出力@26",
      "memberTask/detail:請求書出力：電子帳簿保存法対応@38",
      "memberTask/detail:請求書出力：宛名の敬称切替@38",
      "memberTask/procDetail:取引先マスタ保守画面：取引先区分の追加@46",
      "versionHead:臨時2026-09@26",
      "memberTask/procDetail:権限管理：不具合修正@46",
    ]);
  });

  test("タスク別ビューにも同じ見せ方が効く（まとめる）", async ({ page }) => {
    await open(page, { style: "C", viewMode: "task", layout: "lanes" });
    const rows = await shape(page);
    expect(rows.filter((r) => r.startsWith("versionHead")).length).toBe(2);
    expect(rows.filter((r) => r.startsWith("procHead")).length).toBe(3);
    expect(rows.filter((r) => r.startsWith("task/detail")).length).toBe(4);
  });
});
