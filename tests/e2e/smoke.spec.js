// スモーク: 起動して全タブが描画され、コンソールエラー0であること（白画面事故の恒久対策）
import { test, expect } from "@playwright/test";
import { SEED_ENTRIES } from "./seed.mjs";

const TABS = ["quick", "report", "analytics", "estimate", "actual", "schedule", "settings"];

test("全タブが描画されコンソールエラーが出ない", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  // 既知の良性エラーの許容リスト:
  // - analysis/latest.json の 404 — js/ai-analysis.js が起動時プローブとして fetch する
  //   任意ファイル（キャッシュ→ファイル→空 のフォールバック設計）。ファイル不存在は正常系であり、
  //   Chrome が自動記録する 404 のみが残る。これ以外のコンソールエラーは引き続き FAIL させる。
  // - Ollama への接続拒否 — js/llm-analyze.js が AI 分析タブ表示時に可用性プローブ
  //   （/api/tags → localhost:11434）を投げる。Ollama 不在の環境（CI 含む）では
  //   ERR_CONNECTION_REFUSED がフォールバック付きの正常系であり、Chrome が自動記録する
  //   ネットワークエラーのみが残る（アプリは「未接続」表示に落ちる設計）。
  const isKnownBenign = (m) => {
    if (m.type() !== "error") return false;
    const url = m.location()?.url ?? "";
    return url.includes("analysis/latest.json") || url.includes(":11434/");
  };

  page.on("console", (m) => {
    // 発生元 URL を記録に含める（"Failed to load resource" 系はテキストに URL を含まず、
    // CI 失敗時に原因リソースを特定できないため）
    if (m.type() === "error" && !isKnownBenign(m)) {
      const loc = m.location()?.url ?? "(no url)";
      errors.push(`console: ${m.text()} @ ${loc}`);
    }
  });

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
