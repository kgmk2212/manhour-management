// レポートタブの担当者分析（Phase3 担当者別パフォーマンス／担当者別レポート）の見積は、
// 登録された担当者にそのまま加算し、他担当者の実績による按分・付け替えを行わないこと。
// → 月フィルタ時に見積一覧タブの「担当者別合計」と同じ値になる。
import { test, expect } from "@playwright/test";

const M = "2026-08";
const estRec = (id, version, task, process, member, hours, month = M) => ({
  id, version, task, process, member, hours,
  workMonth: month, workMonths: [month], monthlyHours: { [month]: hours },
});

const ESTIMATES = [
  // 同一タスクを 2 人で担当（それぞれ見積レコードあり）
  estRec(1, "V1.0", "対応X", "UI", "山田", 10),
  estRec(2, "V1.0", "対応X", "UI", "鈴木", 4),
  // 別月（今月フィルタで除外される）
  estRec(3, "V1.0", "対応Y", "PG", "山田", 6, "2026-07"),
  // その他工数（版数なし）は担当者ごとの見積
  estRec(4, "", "打ち合わせ", "", "山田", 2),
];

const ACTUALS = [
  { id: 101, date: "2026-08-03", version: "V1.0", task: "対応X", process: "UI", member: "山田", hours: 5 },
  { id: 102, date: "2026-08-03", version: "V1.0", task: "対応X", process: "UI", member: "鈴木", hours: 2 },
  // 見積の無い人が同じタスクに実績を付けた（旧実装ではここへ見積が付け替わっていた）
  { id: 103, date: "2026-08-04", version: "V1.0", task: "対応X", process: "UI", member: "佐藤", hours: 3 },
  { id: 104, date: "2026-08-05", version: "", task: "打ち合わせ", process: "", member: "山田", hours: 1 },
  { id: 105, date: "2026-08-05", version: "", task: "打ち合わせ", process: "", member: "鈴木", hours: 1 },
];

const SEED = {
  manhour_estimates: JSON.stringify(ESTIMATES),
  manhour_actuals: JSON.stringify(ACTUALS),
  manhour_currentTab: "report",
};

// 期待値（登録担当者ベース）: 山田 10+2=12h / 鈴木 4h / 佐藤 0h、実績 山田 6h / 鈴木 3h / 佐藤 3h
const EXPECTED_EST = { 山田: 12, 鈴木: 4, 佐藤: 0 };
const EXPECTED_ACT = { 山田: 6, 鈴木: 3, 佐藤: 3 };

/** レポートの月フィルタを当月に設定して再描画 */
async function applyReportMonth(page) {
  await page.evaluate((m) => {
    const sel = document.getElementById("reportMonth");
    sel.value = m;
    window.updateReport();
  }, M);
}

/** Phase3 担当者別パフォーマンスのカード（担当者 → {est, act}） */
const readPerformanceCards = (page) =>
  page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#reportDetailView div").forEach((d) => {
      if (!/^見積: [\d.]+h$/.test(d.textContent.trim())) return;
      const member = d.previousElementSibling?.textContent.trim();
      const actEl = d.nextElementSibling?.nextElementSibling;
      out[member] = {
        est: parseFloat(d.textContent.replace("見積:", "")),
        act: parseFloat((actEl?.textContent || "").replace("実績:", "")),
      };
    });
    return out;
  });

/** 担当者別レポート表（担当者 → {est, act}） */
const readMemberReportTable = (page) =>
  page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#memberReport table tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 3) return;
      out[tds[0].textContent.trim()] = { est: parseFloat(tds[1].textContent), act: parseFloat(tds[2].textContent) };
    });
    return out;
  });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, SEED);
  await page.goto("/index.html");
  await expect(page.locator("#report")).toHaveClass(/active/);
  await applyReportMonth(page);
});

test("Phase3 担当者別パフォーマンス: 見積は登録担当者にそのまま計上（按分しない）", async ({ page }) => {
  const cards = await readPerformanceCards(page);
  expect(Object.keys(cards).sort()).toEqual(Object.keys(EXPECTED_EST).sort());
  for (const [member, est] of Object.entries(EXPECTED_EST)) {
    expect(cards[member].est, `${member} の見積`).toBeCloseTo(est, 1);
    expect(cards[member].act, `${member} の実績`).toBeCloseTo(EXPECTED_ACT[member], 1);
  }
});

test("担当者別レポート表: 見積は登録担当者にそのまま計上（按分しない）", async ({ page }) => {
  const rows = await readMemberReportTable(page);
  for (const [member, est] of Object.entries(EXPECTED_EST)) {
    expect(rows[member], `${member} の行`).toBeTruthy();
    expect(rows[member].est, `${member} の見積`).toBeCloseTo(est, 1);
    expect(rows[member].act, `${member} の実績`).toBeCloseTo(EXPECTED_ACT[member], 1);
  }
});

test("見積一覧タブの担当者別合計（同じ月フィルタ）とレポートの見積が一致する", async ({ page }) => {
  const cards = await readPerformanceCards(page);

  await page.evaluate((m) => {
    window.showTab("estimate");
    const monthSel = document.getElementById("estimateMonthFilter");
    if (monthSel) monthSel.value = m;
    const verSel = document.getElementById("estimateVersionFilter");
    if (verSel) verSel.value = "all";
    window.renderEstimateList();
  }, M);

  const listTotals = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll("#estimateMemberSummaryContent > div").forEach((card) => {
      const [nameEl, hoursEl] = card.querySelectorAll("div");
      out[nameEl.textContent.trim()] = parseFloat(hoursEl.textContent);
    });
    return out;
  });

  expect(listTotals).toEqual({ 山田: 12, 鈴木: 4 });
  for (const [member, hours] of Object.entries(listTotals)) {
    expect(cards[member].est, `${member}: レポート見積 vs 見積一覧`).toBeCloseTo(hours, 1);
  }
});
