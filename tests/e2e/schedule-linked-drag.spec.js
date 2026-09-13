// IT-ST連結ドラッグ機構の統合テスト。
// 2026-08-17(月)は日本の祝日と重ならない平日なので、休日カレンダーの
// 実装差異に依存せず「隙間ゼロを保ったまま連動する」ことだけを検証できる。
import { test, expect } from "@playwright/test";

const VERSION = "V1.0";
const TASK = "対応A";
const MEMBER = "山田";

const SEED_SCHEDULES_LINKED = [
  { id: "sch_it", version: VERSION, task: TASK, process: "IT", member: MEMBER,
    startDate: "2026-08-03", endDate: "2026-08-04", estimatedHours: 16,
    status: "pending", color: "#4a90d9", note: "",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  { id: "sch_st", version: VERSION, task: TASK, process: "ST", member: MEMBER,
    startDate: "2026-08-05", endDate: "2026-08-05", estimatedHours: 8,
    status: "pending", color: "#4a90d9", note: "",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
];

const seedEntries = (schedules) => ({
  manhour_estimates: JSON.stringify([]),
  manhour_actuals: JSON.stringify([]),
  manhour_schedules: JSON.stringify(schedules),
  manhour_scheduleSettings: JSON.stringify({ currentMonth: "2026-08" }),
  manhour_currentTab: "schedule",
});

test.describe("IT-ST連結ドラッグ（実アプリ統合）", () => {
  test("隙間なく隣接するITを移動するとSTも連動し、1回のUndo/Redoで両方戻る", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const url = m.location()?.url ?? "";
      if (url.includes("analysis/latest.json") || url.includes(":11434/")) return;
      errors.push(`console: ${m.text()} @ ${url}`);
    });
    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries(SEED_SCHEDULES_LINKED));
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);

    await page.evaluate(() => window.handleScheduleDrag("sch_it", "2026-08-17"));

    const afterMove = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
    expect(afterMove.find((s) => s.id === "sch_it").startDate).toBe("2026-08-17");
    expect(afterMove.find((s) => s.id === "sch_st").startDate).toBe("2026-08-19");

    await page.evaluate(() => window.historyUndo());
    const afterUndo = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
    expect(afterUndo.find((s) => s.id === "sch_it").startDate).toBe("2026-08-03");
    expect(afterUndo.find((s) => s.id === "sch_st").startDate).toBe("2026-08-05");

    await page.evaluate(() => window.historyRedo());
    const afterRedo = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
    expect(afterRedo.find((s) => s.id === "sch_it").startDate).toBe("2026-08-17");
    expect(afterRedo.find((s) => s.id === "sch_st").startDate).toBe("2026-08-19");

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
