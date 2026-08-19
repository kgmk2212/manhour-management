// スモーク: 起動して全タブが描画され、コンソールエラー0であること（白画面事故の恒久対策）
import { test, expect } from "@playwright/test";
import { SEED_ENTRIES } from "./seed.mjs";

const TABS = ["quick", "report", "analytics", "estimate", "actual", "schedule", "settings"];

test("全タブが描画されコンソールエラーが出ない", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, SEED_ENTRIES);

  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);

  let visited = 0;
  for (const tab of TABS) {
    const nav = page.locator(`.nav-item[data-tab="${tab}"]`);
    if (!(await nav.isVisible())) continue; // 設定で隠れるタブ（schedule等）はスキップ
    await nav.click();
    await expect(page.locator(`#${tab}`)).toHaveClass(/active/);
    visited++;
  }
  expect(visited, "最低5タブは検証する").toBeGreaterThanOrEqual(5);
  expect(errors, errors.join("\n")).toHaveLength(0);
});
