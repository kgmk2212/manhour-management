// 中断後「残作業セグメント」の独立移動の実アプリ統合テスト。
// Canvas 上の座標特定は不安定なため、ドラッグ完了時に呼ばれる window.handleSegmentDrag を
// 直接叩き、localStorage に落ちた結果で機械判定する。
// 2026-09 の平日はすべて営業日（祝日データは isBusinessDay 経由で判定されるが、
// このテストは endDate の絶対値ではなく「ピンが効く／自動追従が止まる」ことのみを見る）。
import { test, expect } from "@playwright/test";

const VERSION = "V1.0";
const TASK = "対応A";
const MEMBER = "山田";

const SEED_SCHEDULES = [
  { id: "sch_main", version: VERSION, task: TASK, process: "PG", member: MEMBER,
    startDate: "2026-08-03", endDate: "2026-08-07", estimatedHours: 40,
    status: "pending", color: "#4a90d9", note: "",
    interruptions: [
      { id: "int_1", splitDate: "2026-08-04", consumedHours: 16, reason: "緊急対応",
        insertedScheduleId: "sch_ins" }
    ],
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  { id: "sch_ins", version: "V2.0", task: "差込", process: "PG", member: MEMBER,
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

const readSchedules = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));

test.describe("残作業セグメントの独立移動（実アプリ統合）", () => {
  test("handleSegmentDrag で resumeDate がピン留めされ、Undo/Redo で往復する", async ({ page }) => {
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
    }, seedEntries(SEED_SCHEDULES));
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);

    const before = await readSchedules(page);
    const beforeMain = before.find((s) => s.id === "sch_main");
    expect(beforeMain.interruptions[0].resumeDate).toBeUndefined();
    const beforeEndDate = beforeMain.endDate;

    // 残作業セグメント（int_1 が支配）を 2026-08-17(月) へドロップ
    await page.evaluate(() => window.handleSegmentDrag("sch_main", "int_1", "2026-08-17"));

    const afterMove = await readSchedules(page);
    const movedMain = afterMove.find((s) => s.id === "sch_main");
    expect(movedMain.interruptions[0].resumeDate).toBe("2026-08-17");
    expect(movedMain.startDate).toBe("2026-08-03");
    expect(movedMain.estimatedHours).toBe(40);
    expect(movedMain.endDate).not.toBe(beforeEndDate);
    // 差し込み作業は動かない（設計書 §7-5: cascadeShift は自動実行しない）
    expect(afterMove.find((s) => s.id === "sch_ins").startDate).toBe("2026-08-05");

    // 見積は一切書き換わらない
    expect(await page.evaluate(() => localStorage.getItem("manhour_estimates"))).toBe("[]");

    await page.evaluate(() => window.historyUndo());
    const afterUndo = await readSchedules(page);
    const undoneMain = afterUndo.find((s) => s.id === "sch_main");
    expect(undoneMain.interruptions[0].resumeDate).toBeUndefined();
    expect(undoneMain.endDate).toBe(beforeEndDate);

    await page.evaluate(() => window.historyRedo());
    const afterRedo = await readSchedules(page);
    expect(afterRedo.find((s) => s.id === "sch_main").interruptions[0].resumeDate).toBe("2026-08-17");

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("ピン留め後は差し込み作業を動かしても残作業セグメントが追従しない", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries(SEED_SCHEDULES));
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);

    await page.evaluate(() => window.handleSegmentDrag("sch_main", "int_1", "2026-08-17"));
    const pinnedEnd = (await readSchedules(page)).find((s) => s.id === "sch_main").endDate;

    // 差し込み作業を後ろへ移動しても、ピン留め済みの残作業は絶対位置を維持する
    await page.evaluate(() => window.handleScheduleDrag("sch_ins", "2026-08-12"));

    const after = await readSchedules(page);
    const main = after.find((s) => s.id === "sch_main");
    expect(main.interruptions[0].resumeDate).toBe("2026-08-17");
    expect(main.endDate).toBe(pinnedEnd);

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("clearSegmentPin でピンが外れ自動追従に戻る", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries(SEED_SCHEDULES));
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);

    // シードの endDate はテストフィクスチャの固定値であり、自動計算ロジック
    // （calculateSegments の実際の日数計算）と一致する保証がない。
    // そのため「自動計算に戻す」を検証する基準値は、シード値ではなく
    // clearSegmentPin を一度呼んで得られる実際の自動計算結果を使う（既に未固定
    // なので resumeDate 自体は変化しない、endDate 再計算だけが走る no-op）。
    await page.evaluate(() => window.clearSegmentPin("sch_main", "int_1"));
    const autoEnd = (await readSchedules(page)).find((s) => s.id === "sch_main").endDate;

    await page.evaluate(() => window.handleSegmentDrag("sch_main", "int_1", "2026-08-17"));
    const pinnedEnd = (await readSchedules(page)).find((s) => s.id === "sch_main").endDate;
    expect(pinnedEnd).not.toBe(autoEnd);

    await page.evaluate(() => window.clearSegmentPin("sch_main", "int_1"));

    const after = await readSchedules(page);
    const main = after.find((s) => s.id === "sch_main");
    expect(main.interruptions[0].resumeDate).toBeUndefined();
    expect(main.endDate).toBe(autoEnd);

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
