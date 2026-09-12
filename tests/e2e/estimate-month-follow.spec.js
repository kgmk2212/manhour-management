// 全工程を編集（複数月・3ヶ月以上）: 工程行の作業月セルで「単一月の行は開始月だけ変えれば終了月が追従する」
// ことと、範囲行は期間を保ちつつ開始>終了になったときだけ相互にクランプされることを、実ブラウザで検証する。
// PC と iPhone 相当（390×664・タッチ）の両方で、保存ボタンまで通して永続化結果を確認する。
import { test, expect } from "@playwright/test";

const VERSION = "V1.0";
const TASK = "帳票A：対応A";

/** 見積 seed（2026-08〜2026-11 の 4 ヶ月にまたがる対応。PT は 2 人体制） */
const SEED_ESTIMATES = [
  { id: 1, version: VERSION, task: TASK, process: "UI", member: "山田", hours: 8,
    workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 8 } },
  { id: 2, version: VERSION, task: TASK, process: "PG", member: "山田", hours: 40,
    workMonth: "2026-08", workMonths: ["2026-08", "2026-09"], monthlyHours: { "2026-08": 20, "2026-09": 20 } },
  { id: 3, version: VERSION, task: TASK, process: "PT", member: "山田", hours: 16,
    workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 16 } },
  { id: 4, version: VERSION, task: TASK, process: "PT", member: "佐藤", hours: 8,
    workMonth: "2026-10", workMonths: ["2026-10"], monthlyHours: { "2026-10": 8 } },
  { id: 5, version: VERSION, task: TASK, process: "IT", member: "山田", hours: 8,
    workMonth: "2026-11", workMonths: ["2026-11"], monthlyHours: { "2026-11": 8 } },
  { id: 6, version: VERSION, task: TASK, process: "ST", member: "山田", hours: 8,
    workMonth: "2026-11", workMonths: ["2026-11"], monthlyHours: { "2026-11": 8 } },
];

const SEED_ENTRIES = {
  manhour_estimates: JSON.stringify(SEED_ESTIMATES),
  manhour_actuals: JSON.stringify([]),
  manhour_currentTab: "estimate",
};

const VARIANTS = [
  { name: "PC", use: {} },
  { name: "mobile-390", use: { viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true } },
];

for (const variant of VARIANTS) {
  test.describe(variant.name, () => {
    test.use(variant.use);

    test("全工程編集: 単一月の行は開始月の変更に終了月が追従し、範囲行はクランプのみ", async ({ page }) => {
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
      }, SEED_ENTRIES);

      await page.goto("/index.html");
      await expect(page.locator(".tab-content.active")).toHaveCount(1);

      // 「全工程を編集」を開く（対応詳細モーダル経由と同じ公開関数）
      await page.evaluate(([v, t]) => window.openEditAllProcesses(v, t), [VERSION, TASK]);
      const modal = page.locator("#addEstimateModal");
      await expect(modal).toBeVisible();
      await expect(modal.locator(".modal-header h3")).toHaveText("全工程を編集");

      // 複数月モード（全体期間 2026-08〜2026-11）でプリフィルが完了していること
      await expect(page.locator("#addEstStartMonthMulti")).toHaveValue("2026-08");
      await expect(page.locator("#addEstEndMonth")).toHaveValue("2026-11");
      const uiStart = page.locator("#addEstUI_startMonth");
      const uiEnd = page.locator("#addEstUI_endMonth");
      const pgStart = page.locator("#addEstPG_startMonth");
      const pgEnd = page.locator("#addEstPG_endMonth");
      const itStart = page.locator("#addEstIT_startMonth");
      const itEnd = page.locator("#addEstIT_endMonth");
      const stStart = page.locator("#addEstST_startMonth");
      const stEnd = page.locator("#addEstST_endMonth");
      await expect(uiStart).toHaveValue("2026-08");
      await expect(uiEnd).toHaveValue("2026-08");
      await expect(pgStart).toHaveValue("2026-08");
      await expect(pgEnd).toHaveValue("2026-09");

      // (a) 単一月の行: 開始月を後ろへ → 終了月が追従
      await uiStart.selectOption("2026-10");
      await expect(uiEnd).toHaveValue("2026-10");
      // (b) 単一月の行: 開始月を前へ戻す → 終了月も前へ追従（単純クランプでは実現できないケース）
      await uiStart.selectOption("2026-08");
      await expect(uiEnd).toHaveValue("2026-08");

      // (c) 範囲行（8〜9）: 開始月が終了月を越えたら終了月をクランプ
      await pgStart.selectOption("2026-11");
      await expect(pgEnd).toHaveValue("2026-11");

      // (d) 単一月の行（11〜11）: 終了月を前へ → 開始月をクランプ
      await itEnd.selectOption("2026-09");
      await expect(itStart).toHaveValue("2026-09");

      // (e) 対照: 範囲行は期間を保つ。11〜11 → 開始 9 で追従 9〜9 → 終了 11 で範囲 9〜11 → 開始 10 でも終了は動かない
      await stStart.selectOption("2026-09");
      await expect(stEnd).toHaveValue("2026-09");
      await stEnd.selectOption("2026-11");
      await expect(stStart).toHaveValue("2026-09");
      await stStart.selectOption("2026-10");
      await expect(stEnd).toHaveValue("2026-11");

      // (f) 追加担当者行（PT 佐藤 10〜10）でも同じ追従が効く
      const extraPt = page.locator('tr.est-extra-member-row[data-process="PT"]').first();
      await expect(extraPt.locator(".est-extra-member")).toHaveValue("佐藤");
      const extraStart = extraPt.locator(".est-extra-month-start");
      const extraEnd = extraPt.locator(".est-extra-month-end");
      await expect(extraStart).toHaveValue("2026-10");
      await extraStart.selectOption("2026-08");
      await expect(extraEnd).toHaveValue("2026-08");

      // 証跡スクショ（test-results/ は gitignore 対象）
      await page.locator("#addEstimateTable").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/estimate-month-follow-${variant.name}.png` });

      // 保存して永続化された作業月を確認（モバイルでも保存ボタンまで到達できること）
      await page.locator("#addEstSubmitBtn").click();
      await expect(modal).toBeHidden();

      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_estimates")));
      const byId = Object.fromEntries(saved.map((e) => [e.id, e]));
      expect(byId[1].workMonths).toEqual(["2026-08"]);                 // UI: 10 → 8 に戻した単一月
      expect(byId[2].workMonths).toEqual(["2026-11"]);                 // PG: クランプで 11〜11
      expect(byId[2].monthlyHours).toEqual({ "2026-11": 40 });
      expect(byId[3].workMonths).toEqual(["2026-10"]);                 // 対照: 触っていない PT 山田は不変
      expect(byId[4].workMonths).toEqual(["2026-08"]);                 // PT 佐藤: 追加行の追従
      expect(byId[5].workMonths).toEqual(["2026-09"]);                 // IT: 終了月変更で開始月クランプ
      expect(byId[6].workMonths).toEqual(["2026-10", "2026-11"]);      // ST: 範囲行は期間維持

      expect(errors, errors.join("\n")).toEqual([]);
    });
  });
}
