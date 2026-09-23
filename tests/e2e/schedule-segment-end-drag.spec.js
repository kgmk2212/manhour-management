// 分割バーの前半セグメントの右端ドラッグで「最終作業日」（保存は営業日数 workedDays）を変える実アプリ統合テスト。
// renderer.scheduleRects から前半セグメントの右端の実座標を求め、実際のマウスイベント
// （mousedown → mousemove → mouseup）で js/schedule-render.js の setupDragAndDrop の経路を通す。
// 2026-08-03(月)〜の平日はすべて営業日。DAY_WIDTH は 28px（論理座標）。
import { test, expect } from "@playwright/test";

const MEMBER = "山田";

const SEED_SCHEDULES = [
  { id: "sch_main", version: "V1.0", task: "対応A", process: "PG", member: MEMBER,
    startDate: "2026-08-03", endDate: "2026-08-07", estimatedHours: 40,
    status: "pending", color: "#4a90d9", note: "",
    interruptions: [
      { id: "int_1", splitDate: "2026-08-04", workedDays: 2, consumedHours: 16,
        reason: "", insertedScheduleId: null }
    ],
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

/** 前半セグメント（segmentIndex=0）の右端（ページ座標）と uiScale を返す */
async function getFirstSegmentRightEdge(page) {
  const canvasBox = await page.locator("#ganttTimelineCanvas").boundingBox();
  if (!canvasBox) throw new Error("#ganttTimelineCanvas の boundingBox が取れない");
  const info = await page.evaluate(() => {
    const renderer = window.getScheduleRenderer?.();
    const rect = renderer?.scheduleRects.find(
      (r) => r.schedule.id === "sch_main" && (r.segmentIndex ?? 0) === 0
    );
    if (!rect) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      endInterruptionId: rect.endInterruptionId, uiScale: renderer.uiScale || 1 };
  });
  if (!info) throw new Error("前半セグメントの矩形が見つからない");
  expect(info.endInterruptionId).toBe("int_1");
  return {
    x: canvasBox.x + (info.x + info.width - 2) * info.uiScale,
    y: canvasBox.y + (info.y + info.height / 2) * info.uiScale,
    dayPx: 28 * info.uiScale,
  };
}

test.describe("分割バー右端のドラッグで中断日（最終作業日）を変える", () => {
  test("右端を2日ぶん右へドラッグすると前半が延び、消化工数は変わらず Undo で戻る", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries(SEED_SCHEDULES));
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);

    const edge = await getFirstSegmentRightEdge(page);

    // 右端にホバーするとリサイズカーソルになる
    await page.mouse.move(edge.x, edge.y);
    await expect(page.locator("#ganttTimelineCanvas")).toHaveCSS("cursor", "col-resize");

    const targetX = edge.x + edge.dayPx * 2;
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(edge.x + (targetX - edge.x) * (i / 6), edge.y, { steps: 2 });
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    const main = (await readSchedules(page)).find((s) => s.id === "sch_main");
    expect(main.interruptions).toHaveLength(1);
    expect(main.interruptions[0].workedDays).toBe(4);
    expect(main.interruptions[0].splitDate).toBe("2026-08-06");
    expect(main.interruptions[0].consumedHours).toBe(16);
    expect(main.startDate).toBe("2026-08-03");
    // 後半 24h は 08-07(金) から3営業日（土日と 08-11 山の日を飛ばして 08-12 まで）
    expect(main.endDate).toBe("2026-08-12");

    await page.evaluate(() => window.historyUndo());
    const undone = (await readSchedules(page)).find((s) => s.id === "sch_main");
    expect(undone.interruptions[0].workedDays).toBe(2);
    expect(undone.endDate).toBe("2026-08-07");

    expect(errors).toEqual([]);
  });

  test("バーの中央を掴むと従来どおりバー全体が動き、前半の日数は保たれる", async ({ page }) => {
    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries(SEED_SCHEDULES));
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);

    const edge = await getFirstSegmentRightEdge(page);
    const cx = edge.x - edge.dayPx; // 前半セグメント（2日幅）の中ほど
    await page.mouse.move(cx, edge.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(cx + edge.dayPx * 7 * (i / 6), edge.y, { steps: 2 });
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    const main = (await readSchedules(page)).find((s) => s.id === "sch_main");
    expect(main.startDate > "2026-08-03").toBe(true);
    expect(main.interruptions[0].workedDays).toBe(2);
    // 前半は移動後の開始日から 2 営業日で終わる
    const segEnd = await page.evaluate(async () => {
      const m = await import("./js/schedule-interruption.js");
      const st = JSON.parse(localStorage.getItem("manhour_schedules")).find((s) => s.id === "sch_main");
      return m.calculateSegments(st)[0];
    });
    expect(segEnd.startDate).toBe(main.startDate);
    expect(segEnd.endDate > main.startDate).toBe(true);
  });
});
