// 割り込みドロップの実アプリ統合テスト。
// 実マウスでバーを掴み、同じ担当者の予定と重なる位置へドロップして
// 「割り込む／並行にする／キャンセル」メニューの各経路と Undo を localStorage で機械判定する。
// ドラッグは「カーソル位置の日付＝新しい開始日」になる（js/schedule-render.js の mousemove）。
// 2026-08-03(月)〜08-07(金) はすべて営業日、08-11 は山の日。
import { test, expect } from "@playwright/test";

const MEMBER = "山田";
const base = { version: "V1.0", member: MEMBER, status: "pending", color: "", note: "", interruptions: [],
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };

const SEED = [
  { ...base, id: "A", task: "A", process: "PG", startDate: "2026-08-03", endDate: "2026-08-04", estimatedHours: 16 },
  { ...base, id: "B", task: "B", process: "PG", startDate: "2026-08-05", endDate: "2026-08-06", estimatedHours: 16 },
  { ...base, id: "C", task: "C", process: "PG", startDate: "2026-08-17", endDate: "2026-08-17", estimatedHours: 8 },
  { ...base, id: "X", task: "X", process: "PG", startDate: "2026-08-24", endDate: "2026-08-24", estimatedHours: 8 },
];

const readSchedules = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));
const byId = async (page, id) => (await readSchedules(page)).find((s) => s.id === id);

async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.addInitScript((sc) => {
    localStorage.clear();
    localStorage.setItem("manhour_estimates", "[]");
    localStorage.setItem("manhour_actuals", "[]");
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-08", viewMode: "member" }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, SEED);
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
  return errors;
}

/** バー X を掴み、targetDate の列までドラッグして離す */
async function dragXTo(page, targetDate) {
  const canvasBox = await page.locator("#ganttTimelineCanvas").boundingBox();
  const info = await page.evaluate((date) => {
    const r = window.getScheduleRenderer();
    const rect = r.scheduleRects.find((x) => x.schedule.id === "X");
    const [y, m, d] = date.split("-").map(Number);
    return { rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      targetX: r.dateToX(new Date(y, m - 1, d)) + 14, uiScale: r.uiScale || 1 };
  }, targetDate);
  const s = info.uiScale;
  // 右端（最終作業日ドラッグの判定帯）を避けて左寄りを掴む
  const sx = canvasBox.x + (info.rect.x + 8) * s;
  const sy = canvasBox.y + (info.rect.y + info.rect.h / 2) * s;
  const tx = canvasBox.x + info.targetX * s;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(sx + (tx - sx) * (i / 10), sy, { steps: 2 });
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
}

test.describe("割り込みドロップ", () => {
  test("重なる位置に落とすとメニューが出て、『割り込む』で後ろが押され、空きで止まり、Undo 1回で全部戻る", async ({ page }) => {
    const errors = await open(page);
    await dragXTo(page, "2026-08-05"); // B の開始日に落とす

    const menu = page.locator("#insertDropMenu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("割り込む（後ろ 1 件を押す）");
    await expect(menu).toContainText("8/5 → 8/6");

    await menu.getByRole("button", { name: /割り込む/ }).click();
    await expect(menu).toHaveCount(0);

    expect((await byId(page, "X")).startDate).toBe("2026-08-05");
    const b = await byId(page, "B");
    expect([b.startDate, b.endDate]).toEqual(["2026-08-06", "2026-08-07"]);
    expect((await byId(page, "A")).startDate).toBe("2026-08-03");
    expect((await byId(page, "C")).startDate).toBe("2026-08-17"); // 空きが吸収して動かない

    await page.evaluate(() => window.historyUndo());
    expect((await byId(page, "X")).startDate).toBe("2026-08-24");
    expect((await byId(page, "B")).startDate).toBe("2026-08-05");
    expect(errors).toEqual([]);
  });

  test("前の予定の途中に落とすと、その直後に寄せる案内が出る", async ({ page }) => {
    await open(page);
    await dragXTo(page, "2026-08-04"); // A(8/3〜8/4) の途中
    const menu = page.locator("#insertDropMenu");
    await expect(menu).toContainText("8/5 から");
    await expect(menu).toContainText("A PG の後ろに入ります");
    await menu.getByRole("button", { name: /割り込む/ }).click();
    expect((await byId(page, "X")).startDate).toBe("2026-08-05");
    expect((await byId(page, "B")).startDate).toBe("2026-08-06");
  });

  test("『並行にする』は落とした予定だけ動かし、他は動かさない", async ({ page }) => {
    await open(page);
    await dragXTo(page, "2026-08-05");
    await page.locator("#insertDropMenu").getByRole("button", { name: /並行にする/ }).click();
    expect((await byId(page, "X")).startDate).toBe("2026-08-05");
    expect((await byId(page, "B")).startDate).toBe("2026-08-05");
  });

  test("『キャンセル』と Esc は何も動かさない", async ({ page }) => {
    await open(page);
    await dragXTo(page, "2026-08-05");
    await page.locator("#insertDropMenu").getByRole("button", { name: "キャンセル" }).click();
    expect((await byId(page, "X")).startDate).toBe("2026-08-24");
    // ドラッグ中の仮表示が消え、バーは元の位置に描き直されている
    const xRect = await page.evaluate(() => {
      const r = window.getScheduleRenderer();
      const rect = r.scheduleRects.find((x) => x.schedule.id === "X");
      return { x: rect.x, expected: r.dateToX(new Date(2026, 7, 24)) };
    });
    expect(xRect.x).toBeCloseTo(xRect.expected, 0);

    await dragXTo(page, "2026-08-05");
    await expect(page.locator("#insertDropMenu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#insertDropMenu")).toHaveCount(0);
    expect((await byId(page, "X")).startDate).toBe("2026-08-24");
    expect((await byId(page, "B")).startDate).toBe("2026-08-05");
  });

  test("重ならない位置へのドロップはメニューを出さずにそのまま移動する", async ({ page }) => {
    await open(page);
    await dragXTo(page, "2026-08-12");
    await expect(page.locator("#insertDropMenu")).toHaveCount(0);
    expect((await byId(page, "X")).startDate).toBe("2026-08-12");
  });

  test("メニューの外側をタッチすると閉じ、何も動かさない（iOS 対策）", async ({ page }) => {
    await open(page);
    await dragXTo(page, "2026-08-05");
    await expect(page.locator("#insertDropMenu")).toBeVisible();
    await page.evaluate(() => {
      document.body.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [] }));
    });
    await expect(page.locator("#insertDropMenu")).toHaveCount(0);
    expect((await byId(page, "X")).startDate).toBe("2026-08-24");
  });
});
