// iOS「ホーム画面に追加」用アイコン（apple-touch-icon-<テーマ名>.png）をテーマカラーごとに生成する。
// favicon は index.html 表示時に js/theme.js が data URI で動的生成するため対象外
// （iOSの「ホーム画面に追加」はhref先を一度だけ取得して固定するため、PNGを事前に用意する必要がある）。
//
// 使い方: node scripts/generate-app-icons.mjs
// 環境依存のブラウザ実行ファイルパスを直指定したい場合（このリポジトリのCI/クラウド環境等）:
//   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/generate-app-icons.mjs
//
// THEME_COLORS はここに複製している。js/theme.js の THEME_COLORS を変更したら、
// このファイルの THEME_COLORS も同じ内容に合わせて更新し、本スクリプトを再実行すること。
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const THEME_COLORS = {
  forest: { accent: "#2D5A27", accentLight: "#EBF5EA" },
  ocean: { accent: "#2A6080", accentLight: "#EDF3F8" },
  violet: { accent: "#5A4570", accentLight: "#F2EEF5" },
  amber: { accent: "#7D5A28", accentLight: "#F6F1E7" },
  ink: { accent: "#1A1814", accentLight: "#F0EEEA" },
  "deep-blue": { accent: "#1E3A5F", accentLight: "#EFF4FA" },
  rose: { accent: "#8E3050", accentLight: "#FAF0F3" },
  teal: { accent: "#0F766E", accentLight: "#F0FDFA" },
  slate: { accent: "#556270", accentLight: "#F1F4F6" },
};

const SIZE = 180;

function buildHtml(accent, light) {
  return `<!DOCTYPE html><html><head><style>
html,body{margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden;}
svg{display:block;width:${SIZE}px;height:${SIZE}px;}
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${accent}"/>
  <circle cx="33" cy="37" r="18" fill="none" stroke="${light}" stroke-width="6"/>
  <path d="M33 37 V25 M33 37 L41 43" fill="none" stroke="${light}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="52" y="62" width="9" height="20" rx="3" fill="${light}"/>
  <rect x="65" y="50" width="9" height="32" rx="3" fill="${light}"/>
  <rect x="78" y="36" width="9" height="46" rx="3" fill="${light}"/>
</svg>
</body></html>`;
}

const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });

for (const [name, { accent, accentLight }] of Object.entries(THEME_COLORS)) {
  await page.setContent(buildHtml(accent, accentLight));
  const buf = await page.screenshot({ type: "png" });
  const outPath = name === "forest" ? "apple-touch-icon.png" : `apple-touch-icon-${name}.png`;
  await writeFile(outPath, buf);
  console.log(`✅ ${outPath}`);
}

await browser.close();
