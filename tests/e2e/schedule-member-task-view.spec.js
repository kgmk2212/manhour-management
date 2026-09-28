// ガント「担当者×タスク」表示の実アプリ統合テスト。
// 設計: docs/superpowers/specs/2026-09-29-schedule-member-task-view-design.md
// 今日は 2026-09-24（木）に固定。表示月 2026-09・表示月数 3 → 表示範囲は 8/1〜10/31。
import { test, expect } from "@playwright/test";

const base = { status: "pending", color: "", note: "", interruptions: [],
  createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
// 省略されることを前提にするテストがあるため、フォント（CI の Linux には日本語フォントが無く、日本語の文字幅が
// 手元と違う）に左右されないよう、英字を多く含む十分に長い名前にする
const LONG = "帳票A出力改修（Invoice PDF layout redesign and electronic bookkeeping law compliance for all templates）";
const SEED = [
  { ...base, id: "t1", member: "田中", version: "V2.4", task: LONG, process: "PG", startDate: "2026-09-14", endDate: "2026-09-18", estimatedHours: 40 },
  { ...base, id: "t2", member: "田中", version: "V2.3", task: "権限管理", process: "IT", startDate: "2026-09-24", endDate: "2026-09-25", estimatedHours: 16 },
  { ...base, id: "t3", member: "田中", version: "V2.4", task: "マスタ画面追加", process: "PG", startDate: "2026-09-24", endDate: "2026-10-02", estimatedHours: 56 },
  { ...base, id: "t4", member: "田中", version: "V2.2", task: "昔のタスク", process: "PG", startDate: "2026-06-01", endDate: "2026-06-05", estimatedHours: 40, status: "completed" },
  { ...base, id: "s1", member: "佐藤", version: "V2.4", task: "集計バッチ", process: "PT", startDate: "2026-09-24", endDate: "2026-09-28", estimatedHours: 24 },
];

async function open(page, { layout = "tasks", viewMode = "member" } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
  await page.addInitScript(({ sc, layout, viewMode }) => {
    localStorage.clear();
    localStorage.setItem("manhour_estimates", "[]");
    localStorage.setItem("manhour_actuals", "[]");
    localStorage.setItem("manhour_schedules", JSON.stringify(sc));
    localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode, memberLayout: layout }));
    localStorage.setItem("manhour_currentTab", "schedule");
  }, { sc: SEED, layout, viewMode });
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
  return errors;
}

const rowsOf = (page) => page.evaluate(() => window.getScheduleRenderer().rows.map((r) => ({
  type: r.type, label: r.label, member: r.member, clipped: !!r.labelClipped, collapsed: !!r.collapsed,
})));

/** 行 index の中央（ページ座標）。canvas は "#ganttLabelCanvas" / "#ganttTimelineCanvas" */
async function rowPoint(page, canvasSel, rowIndex, logicalX) {
  const box = await page.locator(canvasSel).boundingBox();
  const p = await page.evaluate(({ i }) => {
    const r = window.getScheduleRenderer();
    return { y: r.rowY(i), h: r.rowHeight(i), s: r.uiScale || 1 };
  }, { i: rowIndex });
  return { x: box.x + logicalX * p.s, y: box.y + (p.y + p.h / 2) * p.s };
}

/** ガントを横スクロールして、その日付を画面の左寄りに出す */
const scrollToDate = (page, date) => page.evaluate((d) => {
  const r = window.getScheduleRenderer();
  const [y, m, dd] = d.split("-").map(Number);
  r.scrollContainer.scrollLeft = Math.max(0, (r.dateToX(new Date(y, m - 1, dd)) - 60) * (r.uiScale || 1));
}, date);

/** 田中の帯の 9/24 のセルの x（logical） */
const stripX = (page, date) => page.evaluate((d) => {
  const r = window.getScheduleRenderer();
  const cells = [...r.stripCells.values()].flat();
  return cells.find((c) => c.date === d).x + 14;
}, date);

test.describe("担当者×タスク表示", () => {
  test("担当者の見出し行の下にタスク行が並び、表示範囲外のタスクは出ない", async ({ page }) => {
    const errors = await open(page);
    const rows = await rowsOf(page);
    expect(rows.filter((r) => r.type === "memberGroup").map((r) => r.label).sort()).toEqual(["佐藤", "田中"]);
    expect(rows.some((r) => r.label === "昔のタスク")).toBe(false);
    const tanaka = rows.findIndex((r) => r.label === "田中");
    expect(rows.slice(tanaka + 1, tanaka + 4).every((r) => r.type === "memberTask" && r.member === "田中")).toBe(true);
    // 長いタスク名は折り返しても収まらず省略される
    expect(rows.find((r) => r.label === LONG).clipped).toBe(true);
    expect(errors).toEqual([]);
  });

  test("設定で今までの表示に戻せる", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.showTab("settings"));
    await page.locator('.settings-nav-item[data-category="display"]').click();
    await expect(page.locator('input[name="scheduleMemberLayout"][value="tasks"]')).toBeChecked();
    await page.locator('input[name="scheduleMemberLayout"][value="lanes"]').evaluate((el) => el.click());
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_scheduleSettings")));
    expect(saved.memberLayout).toBe("lanes");
    await page.evaluate(() => window.showTab("schedule"));
    expect((await rowsOf(page)).every((r) => r.type === "member")).toBe(true);
  });

  test("担当者の見出しをクリックすると畳み、もう一度で開く", async ({ page }) => {
    await open(page);
    const rows = await rowsOf(page);
    const idx = rows.findIndex((r) => r.label === "田中");
    let pt = await rowPoint(page, "#ganttLabelCanvas", idx, 40);
    await page.mouse.click(pt.x, pt.y);
    let after = await rowsOf(page);
    expect(after.filter((r) => r.member === "田中").length).toBe(1);
    expect(after.find((r) => r.label === "田中").collapsed).toBe(true);
    // 畳んだ行は従来の担当者行と同じく、その人の全タスクのバーを描く（重なりは段に分ける）
    const collapsedRow = await page.evaluate(() => {
      const r = window.getScheduleRenderer();
      const i = r.rows.findIndex((x) => x.label === "田中");
      const top = r.rowY(i), bottom = top + r.rowHeight(i);
      const ids = r.scheduleRects.filter((x) => x.y >= top && x.y < bottom).map((x) => x.schedule.id).sort();
      return { ids, lanes: r.rows[i].lanes.laneCount, strip: r.stripCells.has(i) };
    });
    expect(collapsedRow.ids).toEqual(["t1", "t2", "t3"]);
    expect(collapsedRow.lanes).toBeGreaterThan(1);
    expect(collapsedRow.strip).toBe(false);
    pt = await rowPoint(page, "#ganttLabelCanvas", after.findIndex((r) => r.label === "田中"), 40);
    await page.mouse.click(pt.x, pt.y);
    after = await rowsOf(page);
    expect(after.filter((r) => r.member === "田中").length).toBe(4);
  });

  test("PC: 省略された見出しと帯にマウスを乗せると吹き出しが出る", async ({ page }) => {
    await open(page);
    const rows = await rowsOf(page);
    const longIdx = rows.findIndex((r) => r.label === LONG);
    const lp = await rowPoint(page, "#ganttLabelCanvas", longIdx, 80);
    await page.mouse.move(lp.x, lp.y);
    await expect(page.locator("#ganttTip")).toBeVisible();
    await expect(page.locator("#ganttTip")).toContainText("bookkeeping");

    const gIdx = rows.findIndex((r) => r.label === "田中");
    // 帯の 9/24 のセルを表の見えている範囲の中央までスクロールし、その画面座標を求める
    // （見出し欄の下に隠れた位置へマウスを動かすと、見出しの吹き出しが出てしまう。CI で実際に起きた）
    const sp = await page.evaluate(({ i, d }) => {
      const r = window.getScheduleRenderer();
      const cell = r.stripCells.get(i).find((c) => c.date === d);
      const s = r.uiScale || 1;
      r.scrollContainer.scrollLeft = Math.max(0, (cell.x + 14) * s - r.scrollContainer.clientWidth / 2);
      const box = document.getElementById("ganttTimelineCanvas").getBoundingClientRect();
      return { x: box.left + (cell.x + 14) * s, y: box.top + (r.rowY(i) + r.rowHeight(i) / 2) * s };
    }, { i: gIdx, d: "2026-09-24" });
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [sp.x, sp.y])).toBe("ganttTimelineCanvas");
    await page.mouse.move(sp.x, sp.y - 200);
    await expect(page.locator("#ganttTip")).toBeHidden();
    await page.mouse.move(sp.x, sp.y);
    await page.mouse.move(sp.x + 2, sp.y);
    // 9/24 に表示されているバーは 権限管理 IT・マスタ PG の 2 本（遅延のはみ出しはバーではないので数えない）
    await expect(page.locator("#ganttTip")).toContainText("2 本");
    await expect(page.locator("#ganttTip")).toContainText("権限管理 IT");
  });

  test("別担当者のグループへドラッグすると担当者変更、同じ担当者の別タスク行へは担当者を変えない", async ({ page }) => {
    await open(page);
    await scrollToDate(page, "2026-09-20");
    await page.waitForTimeout(100);
    const bar = async (id) => page.evaluate((i) => {
      const r = window.getScheduleRenderer();
      const rect = r.scheduleRects.find((x) => x.schedule.id === i);
      return { x: rect.x + 10, y: rect.y + rect.height / 2, s: r.uiScale || 1 };
    }, id);
    // 描き直しで横スクロール位置が変わるので、canvas の位置はドラッグのたびに取り直す
    const drag = async (from, toY) => {
      const box = await page.locator("#ganttTimelineCanvas").boundingBox();
      await page.mouse.move(box.x + from.x * from.s, box.y + from.y * from.s);
      await page.mouse.down();
      for (let k = 1; k <= 8; k++) {
        await page.mouse.move(box.x + from.x * from.s, box.y + (from.y + (toY - from.y) * (k / 8)) * from.s, { steps: 2 });
        await page.waitForTimeout(20);
      }
      await page.mouse.up();
      await page.waitForTimeout(150);
    };
    const member = async (id) => (await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")))).find((s) => s.id === id).member;

    // 田中のマスタ PG（t3）を、田中の権限管理の行へ → 担当者は変わらない
    const rows = await rowsOf(page);
    const kIdx = rows.findIndex((r) => r.label === "権限管理");
    const kY = await page.evaluate((i) => { const r = window.getScheduleRenderer(); return r.rowY(i) + r.rowHeight(i) / 2; }, kIdx);
    await drag(await bar("t3"), kY);
    expect(await member("t3")).toBe("田中");

    // 同じ t3 を佐藤のタスク行へ → 担当者が佐藤に変わる
    const sIdx = (await rowsOf(page)).findIndex((r) => r.label === "集計バッチ");
    const sY = await page.evaluate((i) => { const r = window.getScheduleRenderer(); return r.rowY(i) + r.rowHeight(i) / 2; }, sIdx);
    await scrollToDate(page, "2026-09-20");
    await drag(await bar("t3"), sY);
    expect(await member("t3")).toBe("佐藤");
  });

  test("見出し欄の境目をダブルクリックすると一番長い見出しの幅まで広がり、省略が減る", async ({ page }) => {
    await open(page);
    const before = await page.evaluate(() => window.getScheduleRenderer().labelWidth);
    await page.locator(".gantt-resize-handle").dblclick();
    const after = await page.evaluate(() => window.getScheduleRenderer().labelWidth);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(Math.floor(1280 * 0.4));
    expect(await page.evaluate(() => localStorage.getItem("schedule_label_width_memberTasks"))).toBe(String(after));
  });

  test("タスク別ビューでも長い見出しは折り返して省略を記録する", async ({ page }) => {
    await open(page, { viewMode: "task", layout: "lanes" });
    const rows = await rowsOf(page);
    expect(rows.every((r) => r.type === "task")).toBe(true);
    expect(rows.find((r) => r.label === LONG).clipped).toBe(true);
    expect(rows.find((r) => r.label === "権限管理").clipped).toBe(false);
  });
});

test.describe("ガントの縦スクロール", () => {
  /** 担当者 8 人 × 3 タスク（32 行）で、外枠の高さを超える量の予定 */
  const MANY = [];
  ["田中", "佐藤", "鈴木", "高橋", "伊藤", "渡辺", "山本", "中村"].forEach((m, mi) => {
    for (let k = 0; k < 3; k++) {
      MANY.push({ ...base, id: `m${mi}-${k}`, member: m, version: "V1", task: `タスク${m}${k}`, process: "PG",
        startDate: `2026-09-${String(14 + k * 3).padStart(2, "0")}`, endDate: `2026-09-${String(15 + k * 3).padStart(2, "0")}`, estimatedHours: 16 });
    }
  });
  const openMany = async (page) => {
    await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
    await page.addInitScript((sc) => {
      localStorage.clear();
      localStorage.setItem("manhour_schedules", JSON.stringify(sc));
      localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode: "member", memberLayout: "tasks" }));
      localStorage.setItem("manhour_currentTab", "schedule");
    }, MANY);
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);
  };

  test("PC: 外枠の高さを超える行は、外枠の中を縦スクロールして見られる（見出し欄と表が一緒に動く）", async ({ page }) => {
    await openMany(page);
    // ガントを描き終えて外枠が溢れるまで待つ（並列実行で負荷が高いと、描画前に測ってしまうことがある）
    await expect.poll(() => page.evaluate(() => {
      const o = document.getElementById("ganttOuter");
      return o ? o.scrollHeight - o.clientHeight : 0;
    })).toBeGreaterThan(0);
    const m = await page.evaluate(() => {
      const o = document.getElementById("ganttOuter");
      return { client: o.clientHeight, scroll: o.scrollHeight, canvas: document.getElementById("ganttTimelineCanvas").getBoundingClientRect().height };
    });
    expect(m.scroll).toBeGreaterThan(m.client);
    expect(m.scroll).toBeGreaterThanOrEqual(m.canvas);
    const box = await page.locator("#ganttOuter").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => document.getElementById("ganttOuter").scrollTop)).toBeGreaterThan(0);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => ({
      outer: document.getElementById("ganttOuter").scrollTop,
      labelTop: document.getElementById("ganttLabelCanvas").getBoundingClientRect().top,
      timelineTop: document.getElementById("ganttTimelineCanvas").getBoundingClientRect().top,
    }));
    expect(after.outer).toBeGreaterThan(0);
    expect(after.labelTop).toBeCloseTo(after.timelineTop, 0);

    // 日付の行が外枠の上端に固定されて見えている（写しの canvas に日付の文字が描かれている）
    const sticky = await page.evaluate(() => {
      const el = document.getElementById("ganttStickyHeader");
      const o = document.getElementById("ganttOuter").getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const data = el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4 * 97) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return { hidden: el.hidden, topDiff: Math.abs(b.top - o.top), widthDiff: Math.abs(b.width - o.width), colors: colors.size };
    });
    expect(sticky.hidden).toBe(false);
    expect(sticky.topDiff).toBeLessThanOrEqual(2);
    expect(sticky.widthDiff).toBeLessThanOrEqual(20);
    expect(sticky.colors).toBeGreaterThan(3);

    // 一番上まで戻すと写しは消える
    await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.getElementById("ganttStickyHeader").hidden)).toBe(true);
  });
});

test.describe("担当者×タスク表示（スマホ）", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test("タップで吹き出し・同じ所の再タップで閉じる・スクロールで閉じる・見出し行のタップで畳む", async ({ page }) => {
    const errors = await open(page);
    const rows = await rowsOf(page);
    const longIdx = rows.findIndex((r) => r.label === LONG);
    // 下部のタブバーに隠れないよう、ガントを画面の上寄りまでスクロールしてから座標を取る
    await page.locator("#ganttLabelCanvas").evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 120));
    await page.waitForTimeout(100);
    const lp = await rowPoint(page, "#ganttLabelCanvas", longIdx, 40);
    await page.touchscreen.tap(lp.x, lp.y);
    await expect(page.locator("#ganttTip")).toBeVisible();
    await page.touchscreen.tap(lp.x, lp.y);
    await expect(page.locator("#ganttTip")).toBeHidden();

    await page.touchscreen.tap(lp.x, lp.y);
    await expect(page.locator("#ganttTip")).toBeVisible();
    await page.evaluate(() => window.scrollBy(0, -60));
    await expect(page.locator("#ganttTip")).toBeHidden();

    const gIdx = (await rowsOf(page)).findIndex((r) => r.label === "田中");
    const gp = await rowPoint(page, "#ganttLabelCanvas", gIdx, 30);
    await page.touchscreen.tap(gp.x, gp.y);
    expect((await rowsOf(page)).find((r) => r.label === "田中").collapsed).toBe(true);

    // 全員を畳んでも見出し欄は名前と件数が入る幅を保つ（名前だけの幅に縮んで名前が消えていた）
    const widthOpen = await page.evaluate(() => window.getScheduleRenderer().labelWidth);
    await page.evaluate(() => { const r = window.getScheduleRenderer(); r.collapsedMembers.add("佐藤"); r.collapsedMembers.add("田中"); r.render(r.currentYear, r.currentMonth, r.filteredSchedulesCache); });
    const allCollapsed = await rowsOf(page);
    expect(allCollapsed.every((r) => r.type === "memberGroup" && r.collapsed)).toBe(true);
    expect(await page.evaluate(() => window.getScheduleRenderer().labelWidth)).toBe(widthOpen);
    expect(errors).toEqual([]);
  });
});

test.describe("ガントの縦スクロール（スマホ）", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("表の上を上へスワイプすると、ページではなくガントの中が縦スクロールする", async ({ page, context }) => {
    const MANY = [];
    ["田中", "佐藤", "鈴木", "高橋", "伊藤", "渡辺", "山本", "中村"].forEach((m, mi) => {
      for (let k = 0; k < 3; k++) {
        MANY.push({ ...base, id: `m${mi}-${k}`, member: m, version: "V1", task: `タスク${m}${k}`, process: "PG",
          startDate: `2026-09-${String(14 + k * 3).padStart(2, "0")}`, endDate: `2026-09-${String(15 + k * 3).padStart(2, "0")}`, estimatedHours: 16 });
      }
    });
    await page.clock.setFixedTime(new Date("2026-09-24T10:00:00"));
    await page.addInitScript((sc) => {
      localStorage.clear();
      localStorage.setItem("manhour_schedules", JSON.stringify(sc));
      localStorage.setItem("manhour_scheduleSettings", JSON.stringify({ currentMonth: "2026-09", viewMode: "member", memberLayout: "tasks" }));
      localStorage.setItem("manhour_currentTab", "schedule");
    }, MANY);
    await page.goto("/index.html");
    await expect(page.locator(".tab-content.active")).toHaveCount(1);
    // ガントの外枠を画面の上寄りに出してから、表の中ほどを上へスワイプする
    await page.locator("#ganttOuter").evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 80));
    await page.waitForTimeout(100);
    const winBefore = await page.evaluate(() => window.scrollY);
    const box = await page.locator("#ganttTimelineScroll").boundingBox();
    const x = box.x + box.width / 2, y = box.y + 300;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 20 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ outer: document.getElementById("ganttOuter").scrollTop, win: window.scrollY }));
    expect(after.outer).toBeGreaterThan(0);
    expect(after.win).toBe(winBefore);
  });
});
