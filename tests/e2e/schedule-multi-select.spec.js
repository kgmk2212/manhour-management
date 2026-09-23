// ガントの範囲選択・一括移動の実アプリ統合テスト。
// renderer.scheduleRects からバーの実座標を求め、実際のマウスイベントで
// js/schedule-render.js の setupDragAndDrop の経路（矩形選択・修飾クリック・一括ドラッグ）を通す。
// 2026-09-01(火)〜09-11(金) の平日はすべて営業日（祝日なし）。DAY_WIDTH は 28px（論理座標）。
import { test, expect } from "@playwright/test";

const base = {
  version: "V1.0", status: "pending", color: "#4a90d9", note: "",
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
};

const SEED_SCHEDULES = [
  { ...base, id: "sch_a", task: "対応A", process: "UI", member: "山田",
    startDate: "2026-09-02", endDate: "2026-09-02", estimatedHours: 8 },
  { ...base, id: "sch_b", task: "対応B", process: "PG", member: "鈴木",
    startDate: "2026-09-03", endDate: "2026-09-03", estimatedHours: 8 },
  // 佐藤の IT→ST は隙間ゼロで連結中（ST は選択しなくても追従する）
  { ...base, id: "sch_it", task: "対応C", process: "IT", member: "佐藤",
    startDate: "2026-09-02", endDate: "2026-09-03", estimatedHours: 16 },
  { ...base, id: "sch_st", task: "対応C", process: "ST", member: "佐藤",
    startDate: "2026-09-04", endDate: "2026-09-04", estimatedHours: 8 },
];

const seedEntries = (schedules) => ({
  manhour_estimates: JSON.stringify([]),
  manhour_actuals: JSON.stringify([]),
  manhour_schedules: JSON.stringify(schedules),
  manhour_scheduleSettings: JSON.stringify({ currentMonth: "2026-09", viewMode: "member" }),
  manhour_currentTab: "schedule",
});

const readSchedules = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
const startOf = (list, id) => list.find((s) => s.id === id).startDate;

/** 予定IDのバー中心（ページ座標）と 1日ぶんのピクセル幅を返す */
async function barCenter(page, id) {
  const canvasBox = await page.locator("#ganttTimelineCanvas").boundingBox();
  if (!canvasBox) throw new Error("#ganttTimelineCanvas の boundingBox が取れない");
  const info = await page.evaluate((scheduleId) => {
    const renderer = window.getScheduleRenderer?.();
    const rect = renderer?.scheduleRects.find((r) => r.schedule.id === scheduleId);
    if (!rect) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, uiScale: renderer.uiScale || 1 };
  }, id);
  if (!info) throw new Error(`${id} の矩形が見つからない`);
  return {
    x: canvasBox.x + (info.x + info.width / 2) * info.uiScale,
    y: canvasBox.y + (info.y + info.height / 2) * info.uiScale,
    left: canvasBox.x + info.x * info.uiScale,
    top: canvasBox.y + info.y * info.uiScale,
    right: canvasBox.x + (info.x + info.width) * info.uiScale,
    bottom: canvasBox.y + (info.y + info.height) * info.uiScale,
    dayPx: 28 * info.uiScale,
  };
}

/** 押して少しずつ動かして離す（mousemove を複数回発火させる） */
async function dragBy(page, from, dx, dy = 0) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(from.x + dx * (i / 6), from.y + dy * (i / 6), { steps: 2 });
  }
  await page.mouse.up();
}

async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, seedEntries(SEED_SCHEDULES));
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
  await expect(page.locator("#ganttTimelineCanvas")).toBeVisible();
  return errors;
}

const chip = (page) => page.locator("#scheduleSelectionChip");

test.describe("ガントの範囲選択・一括移動", () => {
  test("空白ドラッグで2本を矩形選択し、まとめて3営業日ずらすと1回のUndoで両方戻る", async ({ page }) => {
    const errors = await open(page);
    const a = await barCenter(page, "sch_a");
    const b = await barCenter(page, "sch_b");
    await expect(chip(page)).toBeHidden();

    // 山田・鈴木の2行を囲む（左上はバーの無い空白から始める）
    const from = { x: Math.min(a.left, b.left) - a.dayPx * 0.5, y: Math.min(a.top, b.top) - 2 };
    const to = { x: Math.max(a.right, b.right) + 2, y: Math.max(a.bottom, b.bottom) + 2 };
    await dragBy(page, from, to.x - from.x, to.y - from.y);

    await expect(chip(page)).toBeVisible();
    await expect(page.locator("#scheduleSelectionCount")).toHaveText("2");

    // 山田のバー(9/2 水)を5日ぶん右へ → 9/7(月)。水→月は 3営業日
    await dragBy(page, await barCenter(page, "sch_a"), a.dayPx * 5);

    const moved = await readSchedules(page);
    expect(startOf(moved, "sch_a")).toBe("2026-09-07");
    expect(startOf(moved, "sch_b")).toBe("2026-09-08"); // 9/3(木) + 3営業日
    expect(startOf(moved, "sch_it")).toBe("2026-09-02"); // 選択外は動かない
    await expect(page.locator("#scheduleDetailModal")).toBeHidden();

    await page.evaluate(() => window.historyUndo());
    const undone = await readSchedules(page);
    expect(startOf(undone, "sch_a")).toBe("2026-09-02");
    expect(startOf(undone, "sch_b")).toBe("2026-09-03");

    expect(errors).toEqual([]);
  });

  test("Shiftクリックで選ぶと詳細は開かず、選択外の連結後工程（ST）も追従する", async ({ page }) => {
    const errors = await open(page);

    await page.keyboard.down("Shift");
    await page.mouse.click((await barCenter(page, "sch_it")).x, (await barCenter(page, "sch_it")).y);
    await page.mouse.click((await barCenter(page, "sch_b")).x, (await barCenter(page, "sch_b")).y);
    await page.keyboard.up("Shift");

    await expect(page.locator("#scheduleDetailModal")).toBeHidden();
    await expect(page.locator("#scheduleSelectionCount")).toHaveText("2");

    // IT(9/2 水) を1日ぶん右へ → 9/3(木)。+1営業日
    // （左方向は表示範囲の左端に近く自動スクロールが効くため右方向で検証する）
    const it = await barCenter(page, "sch_it");
    await dragBy(page, { x: it.left + it.dayPx * 0.5, y: it.y }, it.dayPx);

    const moved = await readSchedules(page);
    expect(startOf(moved, "sch_it")).toBe("2026-09-03");
    expect(moved.find((s) => s.id === "sch_it").endDate).toBe("2026-09-04");
    expect(startOf(moved, "sch_st")).toBe("2026-09-07"); // IT の新終了日(金)の翌営業日(月)
    expect(startOf(moved, "sch_b")).toBe("2026-09-04");
    expect(startOf(moved, "sch_a")).toBe("2026-09-02");

    expect(errors).toEqual([]);
  });

  test("空白クリック・Esc・✕ボタンで選択を解除できる", async ({ page }) => {
    const errors = await open(page);
    const a = await barCenter(page, "sch_a");

    const select = async () => {
      await page.keyboard.down("Shift");
      await page.mouse.click(a.x, a.y);
      await page.keyboard.up("Shift");
      await expect(chip(page)).toBeVisible();
    };

    await select();
    await page.mouse.click(a.left - a.dayPx * 0.5, a.y); // バーの左の空白
    await expect(chip(page)).toBeHidden();

    await select();
    await page.keyboard.press("Escape");
    await expect(chip(page)).toBeHidden();

    await select();
    await page.locator("#scheduleSelectionChip .ssc-clear").click();
    await expect(chip(page)).toBeHidden();

    expect(errors).toEqual([]);
  });
});
