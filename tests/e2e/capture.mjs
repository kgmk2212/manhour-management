// usage: node tests/e2e/capture.mjs <outdir> [port]
// 各タブのスクリーンショットを outdir に保存する（serve.mjs を自前起動）
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { SEED_ENTRIES } from "./seed.mjs";

const outdir = process.argv[2] ?? "qa-out";
const port = Number(process.argv[3] ?? 8902);
mkdirSync(outdir, { recursive: true });
const server = spawn("node", ["tests/e2e/serve.mjs", String(port)], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 1500));
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, SEED_ENTRIES);
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  for (const tab of ["quick", "report", "analytics", "estimate", "actual", "schedule", "settings"]) {
    const nav = page.locator(`.nav-item[data-tab="${tab}"]`);
    if (!(await nav.isVisible())) continue;
    await nav.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outdir}/${tab}.png`, fullPage: false });
  }
  await browser.close();
} finally {
  server.kill();
}
console.log(`screenshots -> ${outdir}`);
