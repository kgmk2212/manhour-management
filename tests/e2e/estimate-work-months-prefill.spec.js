// 全工程編集を開いたときの「登録済み作業月のプリフィル」回帰テスト（B-047 / B-022① 関連）。
// 既存の estimate-work-months.spec.js は「工程ごとに月が違う（タスク全体で複数月）」ケースだけを見ており、
// 全工程が同じ単月で登録されているケースが素通りしていた。そこでは行に登録月が載らず、
// ウォーターフォールの既定月がそのまま保存されて登録内容が書き換わる。
// 月は「今日」からの相対で作るため、実行時期が変わっても成立する。
import { test, expect } from "@playwright/test";

const VERSION = "V1.0";
const TASK = "帳票A：対応A";

/** 今月から delta ヶ月後の 'YYYY-MM' */
const ym = (delta) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** 月ラベル（'2026-09' → '9月'） */
const label = (m) => `${Number(m.slice(5))}月`;

/** 全工程（UI〜ST）＋ PG の複数担当・レビューを、すべて同じ単月 m で登録した seed */
const seedFor = (m) => [
  { id: 1, version: VERSION, task: TASK, process: "UI", member: "山田", hours: 16, workMonth: m, workMonths: [m], monthlyHours: { [m]: 16 } },
  { id: 2, version: VERSION, task: TASK, process: "PG", member: "山田", hours: 60, workMonth: m, workMonths: [m], monthlyHours: { [m]: 60 } },
  { id: 3, version: VERSION, task: TASK, process: "PG", member: "佐藤", hours: 40, workMonth: m, workMonths: [m], monthlyHours: { [m]: 40 } },
  { id: 4, version: VERSION, task: TASK, process: "PG", member: "鈴木", hours: 8, isReview: true, workMonth: m, workMonths: [m], monthlyHours: { [m]: 8 } },
  { id: 5, version: VERSION, task: TASK, process: "PT", member: "山田", hours: 24, workMonth: m, workMonths: [m], monthlyHours: { [m]: 24 } },
  { id: 6, version: VERSION, task: TASK, process: "IT", member: "佐藤", hours: 16, workMonth: m, workMonths: [m], monthlyHours: { [m]: 16 } },
  { id: 7, version: VERSION, task: TASK, process: "ST", member: "鈴木", hours: 16, workMonth: m, workMonths: [m], monthlyHours: { [m]: 16 } },
];

const PRIMARY = (proc) => `#addEstimateTable tr[data-process="${proc}"][data-primary="true"]`;
const EXTRA = (proc) => `#addEstimateTable tr.est-extra-member-row[data-process="${proc}"]:not([data-review="true"])`;
const REVIEW = (proc) => `#addEstimateTable tr.est-extra-member-row[data-process="${proc}"][data-review="true"]`;

/** seed を入れて「全工程を編集」を開く */
async function openEditAll(page, mode, seed) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url ?? "";
    if (url.includes("analysis/latest.json") || url.includes(":11434/")) return; // 既知の良性エラー
    errors.push(`console: ${msg.text()} @ ${url}`);
  });
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, {
    manhour_estimates: JSON.stringify(seed),
    manhour_actuals: JSON.stringify([]),
    manhour_currentTab: "estimate",
    manhour_estimateWorkMonthUi: mode,
  });
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
  await page.evaluate(([v, t]) => window.openEditAllProcesses(v, t), [VERSION, TASK]);
  const modal = page.locator("#addEstimateModal");
  await expect(modal).toBeVisible();
  await expect(page.locator(`${PRIMARY("PG")} [data-work-month-col]`)).toBeVisible();
  await page.waitForTimeout(200); // プリフィルは setTimeout の後に走る
  return { modal, errors };
}

/** 何も触らず保存し、登録済みの月・工数が 1 件も変わっていないことを確かめる */
async function saveAndExpectUnchanged(page, modal, seed, errors) {
  await page.locator("#addEstSubmitBtn").click();
  await expect(modal).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("manhour_estimates")));
  const byId = Object.fromEntries(saved.map((e) => [e.id, e]));
  for (const e of seed) {
    expect(byId[e.id], `id=${e.id} が残っている`).toBeTruthy();
    expect(byId[e.id].workMonths, `id=${e.id}（${e.process}/${e.member}）の作業月`).toEqual(e.workMonths);
    expect(byId[e.id].workMonth, `id=${e.id} の workMonth`).toBe(e.workMonth);
    expect(byId[e.id].monthlyHours, `id=${e.id} の月別工数`).toEqual(e.monthlyHours);
    expect(byId[e.id].hours, `id=${e.id} の工数`).toBe(e.hours);
  }
  expect(errors, errors.join("\n")).toEqual([]);
}

// 「今月より後の単月」と「過去の単月」の両方を見る。過去月は、期間セレクトが今月起点に
// すり替わる不具合（登録月が跡形もなく消える）を捕まえるため。
const CASES = [
  { name: "今月+2 の単月", month: ym(2) },
  { name: "過去（今月-3）の単月", month: ym(-3) },
];

for (const c of CASES) {
  test.describe(`全工程が同じ単月で登録済み: ${c.name}`, () => {
    test("chips: 全行に登録月が載り、そのまま保存しても変わらない", async ({ page }) => {
      const seed = seedFor(c.month);
      const { modal, errors } = await openEditAll(page, "chips", seed);

      // 期間は登録内容どおり（開始 = 終了 = 登録月）
      await expect(page.locator("#addEstStartMonthMulti")).toHaveValue(c.month);
      await expect(page.locator("#addEstEndMonth")).toHaveValue(c.month);

      // 全工程の行が登録月で点灯している（既定月ではない）
      for (const proc of ["UI", "PG", "PT", "IT", "ST"]) {
        await expect(page.locator(`${PRIMARY(proc)} .wm-chip.is-on`), `${proc} の月チップ`).toHaveText([label(c.month)]);
      }
      await expect(page.locator(`${EXTRA("PG")} .wm-chip.is-on`)).toHaveText([label(c.month)]);
      await expect(page.locator(`${REVIEW("PG")} .wm-chip.is-on`)).toHaveText([label(c.month)]);

      await saveAndExpectUnchanged(page, modal, seed, errors);
    });

    test("gantt: 全行のバーが登録月に載り、そのまま保存しても変わらない", async ({ page }) => {
      const seed = seedFor(c.month);
      const { modal, errors } = await openEditAll(page, "gantt", seed);

      await expect(page.locator("#addEstStartMonthMulti")).toHaveValue(c.month);
      await expect(page.locator("#addEstEndMonth")).toHaveValue(c.month);

      for (const proc of ["UI", "PG", "PT", "IT", "ST"]) {
        await expect(page.locator(`${PRIMARY(proc)} .wg-label`), `${proc} のバー`).toHaveText(label(c.month));
      }
      await expect(page.locator(`${EXTRA("PG")} .wg-label`)).toHaveText(label(c.month));
      await expect(page.locator(`${REVIEW("PG")} .wg-label`)).toHaveText(label(c.month));

      await saveAndExpectUnchanged(page, modal, seed, errors);
    });

    test("matrix: 全行のセルに登録月の工数が入り、そのまま保存しても変わらない", async ({ page }) => {
      const seed = seedFor(c.month);
      const { modal, errors } = await openEditAll(page, "matrix", seed);

      await expect(page.locator("#addEstStartMonthMulti")).toHaveValue(c.month);
      await expect(page.locator("#addEstEndMonth")).toHaveValue(c.month);

      // 工数はモーダルを開いた直後から見えている（開いた時点では 0 で描いて描き直さない、を防ぐ）
      const hoursOf = { UI: "16", PG: "60", PT: "24", IT: "16", ST: "16" };
      for (const [proc, h] of Object.entries(hoursOf)) {
        await expect(page.locator(`${PRIMARY(proc)} input.wx-cell[data-m="${c.month}"]`), `${proc} のセル`).toHaveValue(h);
      }
      // 連動中の担当者行・レビュー行はミラー表示（工数が見えている）
      await expect(page.locator(`${EXTRA("PG")} .wx-mirror.is-on`)).toHaveText(["40"]);
      await expect(page.locator(`${REVIEW("PG")} .wx-mirror.is-on`)).toHaveText(["8"]);

      await saveAndExpectUnchanged(page, modal, seed, errors);
    });
  });
}
