// iOS「ホーム画面に追加」用アイコン（apple-touch-icon-<テーマ名>.png）をテーマカラーごとに生成する。
// favicon は index.html 表示時に js/theme.js が data URI で動的生成するため対象外
// （iOSの「ホーム画面に追加」はhref先を一度だけ取得して固定するため、PNGを事前に用意する必要がある）。
//
// 使い方: node scripts/generate-app-icons.mjs
// 環境依存のブラウザ実行ファイルパスを直指定したい場合（このリポジトリのCI/クラウド環境等）:
//   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/generate-app-icons.mjs
//
// テーマに追従するのは「背景色だけ」。時計・棒グラフの図形は採用時
// （2026-09-13 案1「時計とグラフ」）の配色を固定で維持する。この方針は
// js/theme.js の buildFaviconDataUri() と一致させること。
//
// THEME_ACCENTS はここに複製している。js/theme.js の THEME_COLORS の accent を変更したら、
// このファイルの THEME_ACCENTS も同じ内容に合わせて更新し、本スクリプトを再実行すること。
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const THEME_ACCENTS = {
  forest: "#2D5A27",
  ocean: "#2A6080",
  violet: "#5A4570",
  amber: "#7D5A28",
  ink: "#1A1814",
  "deep-blue": "#1E3A5F",
  rose: "#8E3050",
  teal: "#0F766E",
  slate: "#556270",
};

// 図形の地色（時計の円周・棒グラフ1〜2本目）
const FIGURE = "#EBF5EA";
// 差し色（時計の針・棒グラフ3本目）
const HIGHLIGHT = "#C4841D";

const SIZE = 180;

function buildHtml(accent) {
  return `<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden;}
svg{display:block;width:${SIZE}px;height:${SIZE}px;}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${accent}"/>
  <circle cx="33" cy="37" r="18" fill="none" stroke="${FIGURE}" stroke-width="6"/>
  <path d="M33 37 V25 M33 37 L41 43" fill="none" stroke="${HIGHLIGHT}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="52" y="62" width="9" height="20" rx="3" fill="${FIGURE}"/>
  <rect x="65" y="50" width="9" height="32" rx="3" fill="${FIGURE}"/>
  <rect x="78" y="36" width="9" height="46" rx="3" fill="${HIGHLIGHT}"/>
</svg>
</body></html>`;
}

const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

for (const [name, accent] of Object.entries(THEME_ACCENTS)) {
  await page.setContent(buildHtml(accent));
  const buf = await page.screenshot({ type: "png" });
  const outPath = name === "forest" ? "apple-touch-icon.png" : `apple-touch-icon-${name}.png`;
  await writeFile(outPath, buf);
  console.log(`✅ ${outPath}`);
}

await browser.close();
