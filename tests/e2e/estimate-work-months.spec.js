// 見積の作業月 UI（4 方式切替）: 月チップ / ミニガント / 工程×月マトリクス の 3 方式について、
// 同じ 8 行の見積・同じ課題「PG を 8〜10月／PG レビューは 10月だけ／IT を 11月へ／他は不変」を
// PC（マウス）と iPhone 相当（390×664・タッチ）で最短手順で操作し、保存された workMonths / monthlyHours を検証する。
// legacy（現状 select）の回帰は tests/e2e/estimate-month-follow.spec.js が担う。
// 設計: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md
import { test, expect } from "@playwright/test";

const VERSION = "V1.0";
const TASK = "帳票A：対応A";

/** 見積 seed: 作業期間 2026-08〜11。PG は 山田・佐藤 の 2 人 + レビュー鈴木。既定はウォーターフォール式（UI=8, PG=9, PT・IT=10, ST=11） */
const SEED_ESTIMATES = [
  { id: 1, version: VERSION, task: TASK, process: "UI", member: "山田", hours: 16, workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 16 } },
  { id: 2, version: VERSION, task: TASK, process: "PG", member: "山田", hours: 60, workMonth: "2026-09", workMonths: ["2026-09"], monthlyHours: { "2026-09": 60 } },
  { id: 3, version: VERSION, task: TASK, process: "PG", member: "佐藤", hours: 40, workMonth: "2026-09", workMonths: ["2026-09"], monthlyHours: { "2026-09": 40 } },
  { id: 4, version: VERSION, task: TASK, process: "PG", member: "鈴木", hours: 8, isReview: true, workMonth: "2026-09", workMonths: ["2026-09"], monthlyHours: { "2026-09": 8 } },
  { id: 5, version: VERSION, task: TASK, process: "PT", member: "山田", hours: 24, workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 24 } },
  { id: 6, version: VERSION, task: TASK, process: "PT", member: "鈴木", hours: 4, isReview: true, workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 4 } },
  { id: 7, version: VERSION, task: TASK, process: "IT", member: "佐藤", hours: 16, workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 16 } },
  { id: 8, version: VERSION, task: TASK, process: "ST", member: "鈴木", hours: 16, workMonth: "2026-11", workMonths: ["2026-11"], monthlyHours: { "2026-11": 16 } },
];

const seedEntries = (mode) => ({
  manhour_estimates: JSON.stringify(SEED_ESTIMATES),
  manhour_actuals: JSON.stringify([]),
  manhour_currentTab: "estimate",
  manhour_estimateWorkMonthUi: mode,
});

const VARIANTS = [
  { name: "PC", touch: false, use: {} },
  { name: "mobile-390", touch: true, use: { viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true } },
];

const PRIMARY = (proc) => `#addEstimateTable tr[data-process="${proc}"][data-primary="true"]`;
const REVIEW = (proc) => `#addEstimateTable tr.est-extra-member-row[data-process="${proc}"][data-review="true"]`;

/** ページを開き、console/page エラーを集め、seed を投入して「全工程を編集」を開く */
async function openEditAll(page, mode) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const url = m.location()?.url ?? "";
    if (url.includes("analysis/latest.json") || url.includes(":11434/")) return; // 既知の良性エラー（smoke と同じ）
    errors.push(`console: ${m.text()} @ ${url}`);
  });
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, seedEntries(mode));
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
  await page.evaluate(([v, t]) => window.openEditAllProcesses(v, t), [VERSION, TASK]);
  const modal = page.locator("#addEstimateModal");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".modal-header h3")).toHaveText("全工程を編集");
  // プリフィルは setTimeout(50) の後に走る
  await expect(page.locator(`${PRIMARY("PG")} [data-work-month-col]`)).toBeVisible();
  await page.waitForTimeout(150);
  return { modal, errors };
}

/** 要素の中心座標。sticky なフッターの裏に来ないよう、スクロール容器の中央に寄せてから測る */
async function center(page, selector) {
  const loc = page.locator(selector);
  await loc.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(50);
  const b = await loc.boundingBox();
  if (!b) throw new Error(`boundingBox が取れない: ${selector}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/**
 * ドラッグ／なぞり（タッチは CDP の touch イベント、PC はマウス）。
 * タッチは 1 ステップ 30ms の実指相当の速度で動かし、最後に指を止めて（同位置の touchMove）から離す。
 * 待ち無しの瞬間スワイプや動いたまま離す動きだと Chromium がフリングと見なし、直後のタップの click を
 * 1 回飲み込む（ローカル Windows と CI の Linux で閾値が違う。切り分け済みで製品側の問題ではない）。
 */
async function drag(page, touch, fromSel, toSel) {
  const from = await center(page, fromSel);
  const to = await center(page, toSel);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }] });
      await page.waitForTimeout(30);
    }
    // 指を止める（速度ゼロ）→ 離す
    await page.waitForTimeout(150);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: to.x, y: to.y }] });
    await page.waitForTimeout(60);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForTimeout(120);
}

async function tap(page, touch, selector) {
  if (touch) {
    const c = await center(page, selector);
    await page.touchscreen.tap(c.x, c.y);
  } else {
    await page.locator(selector).click();
  }
  await page.waitForTimeout(120);
}

/** 保存して永続化結果を検証（3 方式で同一） */
async function saveAndAssert(page, modal, errors) {
  await page.locator("#addEstSubmitBtn").click();
  await expect(modal).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_estimates")));
  const byId = Object.fromEntries(saved.map((e) => [e.id, e]));
  expect(byId[2].workMonths).toEqual(["2026-08", "2026-09", "2026-10"]);
  expect(byId[2].monthlyHours).toEqual({ "2026-08": 20, "2026-09": 20, "2026-10": 20 });
  expect(byId[3].workMonths).toEqual(["2026-08", "2026-09", "2026-10"]);       // 佐藤は連動で追従（均等按分）
  expect(byId[3].monthlyHours).toEqual({ "2026-08": 13.33, "2026-09": 13.33, "2026-10": 13.34 });
  expect(byId[4].workMonths).toEqual(["2026-10"]);                             // レビューは個別化して 10月だけ
  expect(byId[4].monthlyHours).toEqual({ "2026-10": 8 });
  expect(byId[7].workMonths).toEqual(["2026-11"]);                             // IT の移動
  for (const id of [1, 5, 6, 8]) expect(byId[id].workMonths).toEqual(SEED_ESTIMATES[id - 1].workMonths);
  for (const e of SEED_ESTIMATES) expect(byId[e.id].hours).toBe(e.hours);
  expect(errors, errors.join("\n")).toEqual([]);
}

/** モバイル: 決定ボタンが最前面で押せる・タッチ目標が 44px 以上 */
async function assertMobileReachability(page, targetSelector) {
  const res = await page.evaluate((sel) => {
    const save = document.querySelector("#addEstSubmitBtn");
    const r = save.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const target = document.querySelector(sel);
    return {
      saveInView: r.top >= 0 && r.bottom <= window.innerHeight,
      saveFrontmost: hit === save || save.contains(hit),
      targetHeight: target ? target.getBoundingClientRect().height : 0,
      pageScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  }, targetSelector);
  expect(res.saveInView, "保存ボタンが画面内").toBe(true);
  expect(res.saveFrontmost, "保存ボタンが最前面").toBe(true);
  expect(res.targetHeight, `タッチ目標の高さ ${targetSelector}`).toBeGreaterThanOrEqual(44);
  expect(res.pageScrollWidth).toBeLessThanOrEqual(res.innerWidth);
}

// ------------------------------------------------------------
// 案A 月チップ
// ------------------------------------------------------------
for (const variant of VARIANTS) {
  test.describe(`chips ${variant.name}`, () => {
    test.use(variant.use);

    test("全工程編集: なぞって範囲・鎖で個別化・タップで移動 → 保存", async ({ page }) => {
      const { modal, errors } = await openEditAll(page, "chips");
      await expect(page.locator("#addEstMonthTypeRow")).toBeHidden();                 // ラジオは隠れる
      await expect(page.locator(`${PRIMARY("PG")} .wm-chip.is-on`)).toHaveText(["9月"]); // 既存の月が載る
      await expect(page.locator(`${REVIEW("PG")} .wm-rail`)).toHaveClass(/is-linked/);   // レビュー行は連動で開く

      await drag(page, variant.touch, `${PRIMARY("PG")} .wm-chip[data-m="2026-08"]`, `${PRIMARY("PG")} .wm-chip[data-m="2026-10"]`);
      await expect(page.locator(`${PRIMARY("PG")} .wm-chip.is-on`)).toHaveCount(3);
      await expect(page.locator(`${REVIEW("PG")} .wm-chip.is-on`)).toHaveCount(3);      // 連動行が追従

      await tap(page, variant.touch, `${REVIEW("PG")} .wm-link`);
      await expect(page.locator(`${REVIEW("PG")} .wm-rail`)).not.toHaveClass(/is-linked/);
      await tap(page, variant.touch, `${REVIEW("PG")} .wm-chip[data-m="2026-10"]`);
      await expect(page.locator(`${REVIEW("PG")} .wm-chip.is-on`)).toHaveText(["10月"]);

      await tap(page, variant.touch, `${PRIMARY("IT")} .wm-chip[data-m="2026-11"]`);
      await expect(page.locator(`${PRIMARY("IT")} .wm-chip.is-on`)).toHaveText(["11月"]);

      if (variant.touch) await assertMobileReachability(page, `${PRIMARY("PG")} .wm-chip`);
      await page.screenshot({ path: `test-results/estimate-work-months-chips-${variant.name}.png` });
      await saveAndAssert(page, modal, errors);
    });
  });
}

test.describe("chips 見積登録（新規）", () => {
  test("期間 8〜10月・PG をなぞって 8〜9月 → 登録", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await page.addInitScript((entries) => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seedEntries("chips"));
    await page.goto("/index.html");
    await page.evaluate(() => window.openAddEstimateModal());
    const modal = page.locator("#addEstimateModal");
    await expect(modal).toBeVisible();
    await expect(page.locator("#addEstMonthTypeRow")).toBeHidden();

    await page.selectOption("#addEstVersion", VERSION);
    const formSel = page.locator("#addEstFormNameSelect");
    if (await formSel.isVisible()) {
      const hasA = await formSel.locator('option[value="帳票A"]').count();
      if (hasA) await formSel.selectOption("帳票A");
      else { await formSel.selectOption("__new__"); await page.fill("#addEstFormName", "帳票A"); }
    } else {
      await page.fill("#addEstFormName", "帳票A");
    }
    await page.fill("#addEstTask", "対応B");
    await page.selectOption("#addEstStartMonthMulti", "2026-08");
    await page.selectOption("#addEstEndMonth", "2026-10");
    await page.waitForTimeout(100);
    await expect(page.locator(`${PRIMARY("PG")} .wm-chip`)).toHaveCount(3);

    await page.selectOption("#addEstPG_member", "山田");
    await page.fill("#addEstPG", "30");
    await drag(page, false, `${PRIMARY("PG")} .wm-chip[data-m="2026-08"]`, `${PRIMARY("PG")} .wm-chip[data-m="2026-09"]`);
    await expect(page.locator(`${PRIMARY("PG")} .wm-chip.is-on`)).toHaveCount(2);

    await page.locator("#addEstSubmitBtn").click();
    await expect(modal).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_estimates")));
    const added = saved.filter((e) => e.task === "帳票A：対応B");
    expect(added).toHaveLength(1);
    expect(added[0].process).toBe("PG");
    expect(added[0].workMonths).toEqual(["2026-08", "2026-09"]);
    expect(added[0].monthlyHours).toEqual({ "2026-08": 15, "2026-09": 15 });
    expect(errors, errors.join("\n")).toEqual([]);
  });
});

// ------------------------------------------------------------
// 案B ミニガント
// ------------------------------------------------------------
for (const variant of VARIANTS) {
  test.describe(`gantt ${variant.name}`, () => {
    test.use(variant.use);

    test("全工程編集: つまみで伸縮・鎖で個別化・バーを移動 → 保存", async ({ page }) => {
      const { modal, errors } = await openEditAll(page, "gantt");
      await expect(page.locator(`${PRIMARY("PG")} .wg-label`)).toHaveText("9月");

      await drag(page, variant.touch, `${PRIMARY("PG")} .wg-handle.l`, `${PRIMARY("PG")} .wg-cell[data-i="0"]`);
      await drag(page, variant.touch, `${PRIMARY("PG")} .wg-handle.r`, `${PRIMARY("PG")} .wg-cell[data-i="2"]`);
      await expect(page.locator(`${PRIMARY("PG")} .wg-label`)).toHaveText("8〜10月");
      await expect(page.locator(`${REVIEW("PG")} .wg-label`)).toHaveText("8〜10月");   // 連動行が追従

      await tap(page, variant.touch, `${REVIEW("PG")} .wm-link`);
      await drag(page, variant.touch, `${REVIEW("PG")} .wg-handle.l`, `${REVIEW("PG")} .wg-cell[data-i="2"]`);
      await expect(page.locator(`${REVIEW("PG")} .wg-label`)).toHaveText("10月");

      await drag(page, variant.touch, `${PRIMARY("IT")} .wg-label`, `${PRIMARY("IT")} .wg-cell[data-i="3"]`);
      await expect(page.locator(`${PRIMARY("IT")} .wg-label`)).toHaveText("11月");

      if (variant.touch) await assertMobileReachability(page, `${PRIMARY("PG")} .wg-track`);
      await page.screenshot({ path: `test-results/estimate-work-months-gantt-${variant.name}.png` });
      await saveAndAssert(page, modal, errors);
    });
  });
}

// ------------------------------------------------------------
// 案C 工程×月マトリクス
// ------------------------------------------------------------
for (const variant of VARIANTS) {
  test.describe(`matrix ${variant.name}`, () => {
    test.use(variant.use);

    test("全工程編集: セルに工数を入れて月を決める → 保存", async ({ page }) => {
      const { modal, errors } = await openEditAll(page, "matrix");
      const set = async (rowSel, month, value) => {
        const input = page.locator(`${rowSel} input.wx-cell[data-m="${month}"]`);
        await input.scrollIntoViewIfNeeded();
        await input.fill(value);
        await input.press("Tab");
        await page.waitForTimeout(80);
      };
      await expect(page.locator(`${PRIMARY("PG")} input.wx-cell[data-m="2026-09"]`)).toHaveValue("60");

      await set(PRIMARY("PG"), "2026-08", "20");
      await set(PRIMARY("PG"), "2026-09", "20");
      await set(PRIMARY("PG"), "2026-10", "20");
      await expect(page.locator("#addEstPG")).toHaveValue("60");                           // 合計は不変
      await expect(page.locator(`${REVIEW("PG")} .wx-mirror.is-on`)).toHaveCount(3);        // 連動行が追従

      await tap(page, variant.touch, `${REVIEW("PG")} .wm-link`);
      await set(REVIEW("PG"), "2026-10", "8");
      await set(REVIEW("PG"), "2026-08", "");
      await set(REVIEW("PG"), "2026-09", "");
      await expect(page.locator(`${REVIEW("PG")} input.wx-cell.is-on`)).toHaveCount(1);

      await set(PRIMARY("IT"), "2026-11", "16");                                           // 先に新しい月へ入れる
      await set(PRIMARY("IT"), "2026-10", "");
      await expect(page.locator(`${PRIMARY("IT")} input.wx-cell.is-on`)).toHaveCount(1);

      if (variant.touch) await assertMobileReachability(page, `${PRIMARY("PG")} input.wx-cell`);
      await page.screenshot({ path: `test-results/estimate-work-months-matrix-${variant.name}.png` });
      await saveAndAssert(page, modal, errors);
    });
  });
}
