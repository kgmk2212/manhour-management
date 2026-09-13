// 複数月見積（workMonths が複数ある見積）は、実際には合計時間から算出した1つの連続ブロックにしか
// ならない（月ごとに分割されたスケジュールは存在しない）。そのため「既にスケジュール済みか」の判定は
// スケジュール期間が表示月と重なるかではなく、タスク/工程/担当者/版数の一致そのもので行う必要がある。
// 本テストは、生成済みスケジュールが最初の月だけで収まる（総工数が少なく後続の作業月まで期間が
// 伸びない）ケースで、後続の月に切り替えても「未スケジュール」候補として再度出てこないことを確認する。
import { test, expect } from "@playwright/test";

const VERSION = "V1.0";
const TASK = "対応A";

// 見積: 2026-08〜2026-09 の2ヶ月にまたがるが、合計8hしかないため実際のスケジュールは
// 2026-08-03 の1日で完結する（＝09月まで期間が伸びない）。
const SEED_ESTIMATES = [
  { id: 1, version: VERSION, task: TASK, process: "PG", member: "山田", hours: 8,
    workMonth: "2026-08", workMonths: ["2026-08", "2026-09"], monthlyHours: { "2026-08": 4, "2026-09": 4 } },
];

// 上の見積に対応する、既に登録済みのスケジュール（08月内だけで完結する短いブロック）
const SEED_SCHEDULES = [
  { id: "sch_1", version: VERSION, task: TASK, process: "PG", member: "山田",
    startDate: "2026-08-03", endDate: "2026-08-03", estimatedHours: 8,
    status: "pending", color: "#4a90d9", note: "",
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
];

const seedEntries = () => ({
  manhour_estimates: JSON.stringify(SEED_ESTIMATES),
  manhour_actuals: JSON.stringify([]),
  manhour_schedules: JSON.stringify(SEED_SCHEDULES),
  manhour_scheduleSettings: JSON.stringify({ currentMonth: "2026-09" }),
  manhour_currentTab: "schedule",
});

test.describe("複数月見積の既存スケジュール判定", () => {
  test("翌月に切り替えても既に登録済みの複数月見積は未スケジュール候補に出ない", async ({ page }) => {
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
    }, seedEntries());
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);
    await expect(page.locator("#scheduleCurrentMonth")).toContainText("9月");

    // 未スケジュールバッジ: 09月には対象見積が無いはず（既に08月で完結するスケジュールがある）
    await page.evaluate(() => window.updateUnscheduledBadge());
    await expect(page.locator("#unscheduledBadge")).toBeHidden();

    // 自動生成モーダルのプレビューでも候補として出ない（既存スケジュールとして除外される）
    await page.evaluate(() => window.openAutoGenerateModal());
    await page.selectOption("#autoGenVersion", VERSION);
    await page.waitForTimeout(50);
    const preview = page.locator("#autoGenPreview");
    await expect(preview).toContainText("生成対象: 0件");
    await expect(preview).toContainText("1件は既にスケジュールが存在するためスキップ");

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
