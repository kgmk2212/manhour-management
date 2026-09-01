// ビューポート診断（js/viewport-diag.js）の計測が壊れていないことを守る。
// iPhone 実機でしか再現しない Dock のずれ（BACKLOG B-045）の証拠採取用コードなので、
// 「正常時は無反応」「ずれたら検出して記録」「補正で下端に戻せる」の3点を固定する。
// ⚠️ B-045 の原因特定・修正が済んだら、診断コードごとこの spec も削除する。
import { test, expect } from "@playwright/test";
import { SEED_ENTRIES } from "./seed.mjs";

const MOBILE = { width: 390, height: 664 };
const KEY = "manhour_viewportDiag_v1";

/** ログを読み出す */
const readLog = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]"), KEY);

/**
 * 初期化完了（DOMContentLoaded の initViewportDiag 実行）を待つ。
 * #mobileTabBar は静的 HTML なので、可視だけでは JS 初期化前の可能性がある
 */
const waitDiagReady = async page => {
  await expect
    .poll(() => page.evaluate(() => typeof window.repairDockPosition === "function"))
    .toBe(true);
  await expect.poll(async () => (await readLog(page)).length).toBeGreaterThan(0);
};

test.describe("ビューポート診断", () => {
  test.use({ viewport: MOBILE, hasTouch: true });

  test("正常時は gap=0・ずれ判定なしで記録され、バックアップは追跡記録が残る", async ({ page }) => {
    await page.addInitScript(entries => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, SEED_ENTRIES);
    await page.goto("/index.html");
    await expect(page.locator("#mobileTabBar")).toBeVisible();
    await waitDiagReady(page);

    const first = (await readLog(page))[0];
    expect(first.label).toBe("init");
    expect(first.gap).toBe(0);
    expect(first.vvGap).toBe(0);
    expect(first.desynced).toBe(false);

    // バックアップ実行 → 契機と追跡スナップショットが記録される
    const download = page.waitForEvent("download");
    await page.locator("#hamburgerBtn").tap();
    await page.locator("#btnExportBackup").tap();
    await download;
    await expect
      .poll(async () => (await readLog(page)).map(r => r.label))
      .toEqual(expect.arrayContaining(["backup:export", "backup:export+400ms"]));
  });

  test("Dock が下端から浮けば検出し、補正で下端へ戻せる（スライド途中は誤検知しない）", async ({ page }) => {
    await page.addInitScript(entries => {
      localStorage.clear();
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, SEED_ENTRIES);
    await page.goto("/index.html");
    await expect(page.locator("#mobileTabBar")).toBeVisible();
    await waitDiagReady(page);

    // 浮き上がりを再現 → 検出される
    const floated = await page.evaluate(() => {
      const dock = document.getElementById("mobileTabBar");
      dock.style.transition = "none";
      dock.style.bottom = "90px";
      window.dispatchEvent(new Event("focus"));
      const log = JSON.parse(localStorage.getItem("manhour_viewportDiag_v1"));
      return log[log.length - 1];
    });
    expect(floated.gap).toBe(90);
    expect(floated.desynced).toBe(true);

    // 補正で下端へ戻る
    const repaired = await page.evaluate(() => {
      window.repairDockPosition();
      const dock = document.getElementById("mobileTabBar");
      return Math.round(window.innerHeight - dock.getBoundingClientRect().bottom);
    });
    expect(repaired).toBe(0);

    // is-hidden のスライド途中（0 〜 -barH の間）は異常としない
    const midwayAdded = await page.evaluate(() => {
      const dock = document.getElementById("mobileTabBar");
      window.resetDockPosition();
      dock.style.transform = "translateY(50%)";
      const before = JSON.parse(localStorage.getItem("manhour_viewportDiag_v1")).length;
      window.dispatchEvent(new Event("resize"));
      const after = JSON.parse(localStorage.getItem("manhour_viewportDiag_v1")).length;
      dock.style.transform = "";
      dock.style.transition = "";
      return after - before;
    });
    expect(midwayAdded).toBe(0);
  });
});
