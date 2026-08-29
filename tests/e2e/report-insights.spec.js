// レポートタブ Phase3「担当者分析とインサイト」の判定が実画面で機能していること。
//
// 旧実装は「優れた見積精度（全体合計比 90〜110%）」と「最適な工程（無条件表示）」
// ばかりが出て、見積過大・担当者ごとの偏りを検出できなかった。
// ここでは実データを流し込んで、判定が状況に応じて切り替わることを DOM で確認する。
import { test, expect } from "@playwright/test";

const M = "2026-08";

const estRec = (id, task, member, hours, process = "PG") => ({
  id, version: "V1.0", task, process, member, hours,
  workMonth: M, workMonths: [M], monthlyHours: { [M]: hours },
});
const actRec = (id, task, member, hours, process = "PG") => ({
  id, date: "2026-08-03", version: "V1.0", task, process, member, hours,
});

const seed = (estimates, actuals) => ({
  manhour_estimates: JSON.stringify(estimates),
  manhour_actuals: JSON.stringify(actuals),
  manhour_currentTab: "report",
});

/** 見積は合計一致だが、担当者ごとに +50% / -50% と相殺しているケース */
const CANCEL_OUT = seed(
  [estRec(1, "対応A", "山田", 40), estRec(2, "対応B", "佐藤", 40)],
  [actRec(101, "対応A", "山田", 60), actRec(102, "対応B", "佐藤", 20)]
);

/** 見積どおりに進行しているケース（緑が出てよい対照） */
const ACCURATE = seed(
  [estRec(1, "対応A", "山田", 40), estRec(2, "対応B", "佐藤", 40)],
  [actRec(101, "対応A", "山田", 40), actRec(102, "対応B", "佐藤", 40)]
);

/** 実績が見積の半分しか無いケース（旧実装では警告が一切出なかった） */
const OVER_ESTIMATED = seed(
  [estRec(1, "対応A", "山田", 40), estRec(2, "対応B", "佐藤", 40)],
  [actRec(101, "対応A", "山田", 20), actRec(102, "対応B", "佐藤", 20)]
);

/** インサイトカードを [{ type, title, message }] で読み出す */
const readInsights = (page) =>
  page.evaluate(() => {
    const heading = [...document.querySelectorAll("#reportDetailView h4")]
      .find((h) => h.textContent.trim() === "インサイト");
    if (!heading) return [];
    return [...heading.parentElement.children]
      .filter((el) => el.tagName === "DIV")
      .map((card) => {
        const style = card.getAttribute("style") || "";
        const type = style.includes("#fff5f5") ? "warning"
          : style.includes("#d4edda") ? "success"
            : "info";
        const [titleEl, messageEl] = card.querySelectorAll("div");
        return {
          type,
          title: (titleEl?.textContent || "").trim(),
          message: (messageEl?.textContent || "").trim(),
        };
      });
  });

/** seed を入れてレポートタブを当月表示にする */
async function openReport(page, entries) {
  await page.addInitScript((data) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }, entries);
  await page.goto("/index.html");
  // ES Modules の読み込み完了を待ってからタブと月フィルタを明示的に設定する
  await page.waitForFunction(() => typeof window.showTab === "function" && typeof window.updateReport === "function");
  await page.evaluate((m) => {
    window.showTab("report");
    document.getElementById("reportMonth").value = m;
    window.updateReport();
  }, M);
  await expect(page.locator("#report")).toHaveClass(/active/);
}

const titles = (insights) => insights.map((i) => i.title);

test("合計が一致していても担当者間で相殺しているなら緑を出さず警告する", async ({ page }) => {
  await openReport(page,CANCEL_OUT);
  const insights = await readInsights(page);

  expect(titles(insights), "ばらつき警告が必要").toContain("タスク間のばらつきが大きい");
  expect(titles(insights), "合計一致でも緑にしない").not.toContain("優れた見積精度");
  expect(titles(insights), "工程内で相殺しているだけなら最適な工程は出さない").not.toContain("最適な工程");
  expect(insights.every((i) => i.type === "warning"), "全件 warning であること").toBe(true);
});

test("相殺しているケースでは超過側・余裕側の担当者を名指しする", async ({ page }) => {
  await openReport(page,CANCEL_OUT);
  const insights = await readInsights(page);

  const over = insights.find((i) => i.title === "見積を超過しがちな担当者");
  expect(over, "超過側の担当者警告が必要").toBeTruthy();
  expect(over.message).toContain("山田");
  expect(over.message).not.toContain("佐藤");

  const under = insights.find((i) => i.title === "見積に余裕がある担当者");
  expect(under, "余裕側の担当者警告が必要").toBeTruthy();
  expect(under.message).toContain("佐藤");
});

test("実績が見積を大きく下回れば「見積が過大」を警告する", async ({ page }) => {
  await openReport(page,OVER_ESTIMATED);
  const insights = await readInsights(page);

  expect(titles(insights)).toContain("見積が過大");
  expect(titles(insights)).toContain("見積に余裕がある担当者");
  expect(titles(insights), "半分しか消化していないのに最適な工程は出さない").not.toContain("最適な工程");
});

test("本当に見積どおりなら「優れた見積精度」と「最適な工程」を出す（対照）", async ({ page }) => {
  await openReport(page,ACCURATE);
  const insights = await readInsights(page);

  const good = insights.find((i) => i.title === "優れた見積精度");
  expect(good, "見積どおりなら緑が出ること").toBeTruthy();
  expect(good.type).toBe("success");
  expect(titles(insights)).toContain("最適な工程");
  expect(insights.some((i) => i.type === "warning"), "警告は出ないこと").toBe(false);
});
