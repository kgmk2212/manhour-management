// e2e: 担当者マスタ — 本機能のゴール（見積・実績が0件でも担当者を単独登録でき、
// 登録した瞬間から入力画面の担当者selectに反映される）をブラウザ上で検証する。
//
// 併せて、実装中のコードレビューで見つかった以下の回帰も e2e で恒久的に押さえる:
//   - 起動時のコンソールエラー0（未解決 import / 未ガードの DOM 読み取りの実害検出）
//   - 改名の既存データへの遡及反映
//   - アーカイブで新規入力selectから消えるが履歴は残る／復元で戻る
//   - 実績編集・見積編集・その他作業モーダルが開ける（旧 #memberOrder 読み取りクラッシュの回帰）
//   - 改名入力途中に別の担当者を操作しても入力値が失われない
//
// 設計: docs/superpowers/specs/2026-09-14-member-master-design.md
import { test, expect } from "@playwright/test";

const M = (id, name, archived = false) => ({ id, name, archived });

/** 既知の良性コンソールエラー（smoke.spec.js と同じ許容リスト） */
const isKnownBenign = (m) => {
  const url = m.location()?.url ?? "";
  return url.includes("analysis/latest.json") || url.includes(":11434/");
};

/** pageerror / console error を集める。返り値の配列を最後に空であることを検証する */
function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error" || isKnownBenign(m)) return;
    errors.push(`console: ${m.text()} @ ${m.location()?.url ?? "(no url)"}`);
  });
  return errors;
}

/** localStorage を毎テストまっさらにしてから seed を入れ、アプリを開く */
async function openApp(page, entries) {
  await page.addInitScript((e) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
  }, entries);
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
}

/** 設定タブ > 「表示」カテゴリ（担当者マスタUIが置かれている場所）を開く */
async function openMemberSettings(page) {
  await page.locator('.nav-item[data-tab="settings"]').click();
  await expect(page.locator("#settings")).toHaveClass(/active/);
  await page.locator('#settingsNav .settings-nav-item[data-category="display"]').click();
  await expect(page.locator("#memberNameInput")).toBeVisible();
}

/** アクティブ担当者行（保存済み表示状態）を名前で引く */
const memberRow = (page, name) =>
  page.locator("#memberList .member-row").filter({ has: page.locator(".member-name", { hasText: name }) });

/** クイック入力タブの担当者selectの選択肢テキスト一覧 */
async function quickMemberOptions(page) {
  await page.locator('.nav-item[data-tab="quick"]').click();
  await expect(page.locator("#quick")).toHaveClass(/active/);
  return page.locator("#quickMemberSelect option").allTextContents();
}

const readLS = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);

// ============================================
// シナリオ1: 本機能のゴール — データ0件から担当者を単独登録できる
// ============================================
test("データ0件でも担当者を単独で追加でき、クイック入力の担当者selectに即座に現れる", async ({ page }) => {
  const errors = collectErrors(page);
  // 見積0件・実績0件・担当者マスタ無し（完全に初回起動の状態）
  await openApp(page, { manhour_currentTab: "quick" });

  await openMemberSettings(page);
  // 前提: 担当者は1人も登録されていない
  await expect(page.locator("#memberList")).toContainText("担当者が登録されていません");
  // 前提: この時点でクイック入力の選択肢は「（自動）」だけ
  expect(await quickMemberOptions(page)).toEqual(["（自動）"]);

  await openMemberSettings(page);
  await page.locator("#memberNameInput").fill("山田");
  await page.locator("#btnAddMember").click();

  // 設定画面に反映され、入力欄はクリアされる
  await expect(page.locator("#memberList .member-row .member-name")).toHaveText("山田");
  await expect(page.locator("#memberNameInput")).toHaveValue("");
  // 永続化されている
  expect(await readLS(page, "manhour_members")).toEqual([M(1, "山田")]);

  // 本機能のゴール: 見積・実績が1件も無いまま、クイック入力の選択肢になっている
  expect(await quickMemberOptions(page)).toEqual(["（自動）", "山田"]);

  expect(errors, errors.join("\n")).toHaveLength(0);
});

// ============================================
// シナリオ2: 起動時にJSエラーが出ない（未解決import・未ガードDOM読み取りの実害検出）
// ============================================
test("担当者マスタ導入後もデータ0件のアプリが無エラーで起動する", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { manhour_currentTab: "quick" });

  // members.js が読み込まれ、マスタ参照ヘルパーが window に公開されている
  expect(await page.evaluate(() => typeof window.getActiveMemberNames)).toBe("function");
  expect(await page.evaluate(() => window.getActiveMemberNames())).toEqual([]);
  // 旧 #memberOrder テキスト欄は撤去済み
  expect(await page.evaluate(() => document.getElementById("memberOrder"))).toBeNull();

  await page.waitForTimeout(300);
  expect(errors, errors.join("\n")).toHaveLength(0);
});

// ============================================
// シナリオ3: 改名が既存データへ遡及する
// ============================================
test("改名すると既存の見積データの担当者名も遡及して置き換わる", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, {
    manhour_members: JSON.stringify([M(1, "山田")]),
    manhour_estimates: JSON.stringify([
      { id: 1, version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 40,
        workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
    ]),
    manhour_actuals: JSON.stringify([]),
    manhour_currentTab: "estimate",
  });

  // 前提: 見積一覧に「山田」が出ている
  await page.evaluate(() => window.setEstimateViewType("list"));
  await expect(page.locator("#estimateList")).toContainText("山田");

  await openMemberSettings(page);
  // 既存データを持つ担当者の改名は confirm で件数確認が出る（承諾する）
  page.on("dialog", (d) => d.accept());
  await memberRow(page, "山田").getByRole("button", { name: "改名" }).click();

  const renameInput = page.locator("#memberRenameInput_1");
  await expect(renameInput).toBeVisible();
  await expect(renameInput).toHaveValue("山田");
  await renameInput.fill("田中");
  await page.locator("#memberList .member-row").getByRole("button", { name: "保存" }).click();

  // (a) 設定画面が新しい名前を表示する
  await expect(page.locator("#memberList .member-row .member-name")).toHaveText("田中");
  expect(await readLS(page, "manhour_members")).toEqual([M(1, "田中")]);

  // (b) 見積一覧の表示が新しい名前に追随し、旧名は消えている
  await page.locator('.nav-item[data-tab="estimate"]').click();
  await expect(page.locator("#estimate")).toHaveClass(/active/);
  await expect(page.locator("#estimateList")).toContainText("田中");
  await expect(page.locator("#estimateList")).not.toContainText("山田");
  // 永続化された見積データ自体も置き換わっている
  expect((await readLS(page, "manhour_estimates"))[0].member).toBe("田中");

  expect(errors, errors.join("\n")).toHaveLength(0);
});

// ============================================
// シナリオ4: アーカイブは新規入力selectから隠すが履歴は保持する
// ============================================
test("アーカイブすると新規入力の選択肢から消えるが、既存の見積・実績データは残る", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, {
    manhour_members: JSON.stringify([M(1, "山田"), M(2, "佐藤")]),
    manhour_estimates: JSON.stringify([
      { id: 1, version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 40,
        workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
    ]),
    manhour_actuals: JSON.stringify([
      { id: 101, date: "2026-08-20", version: "V1.0", task: "対応A", process: "PG", member: "山田",
        hours: 8, createdAt: "2026-08-20T09:00:00.000Z" },
    ]),
    manhour_currentTab: "quick",
  });

  // 前提: 2人ともクイック入力の選択肢に出ている
  expect(await quickMemberOptions(page)).toEqual(["（自動）", "山田", "佐藤"]);

  await openMemberSettings(page);
  await memberRow(page, "山田").getByRole("button", { name: "アーカイブ" }).click();

  // (a) 新規入力用のselectから消える（残る担当者はそのまま）
  expect(await quickMemberOptions(page)).toEqual(["（自動）", "佐藤"]);

  // (b) 履歴は消えていない: 見積一覧・実績一覧に「山田」がそのまま出る
  await page.locator('.nav-item[data-tab="estimate"]').click();
  await page.evaluate(() => window.setEstimateViewType("list"));
  await expect(page.locator("#estimateList")).toContainText("山田");

  await page.locator('.nav-item[data-tab="actual"]').click();
  await expect(page.locator("#actual")).toHaveClass(/active/);
  await page.evaluate(() => window.setActualViewType("list"));
  await page.evaluate(() => window.handleActualMonthChange("all", "actualMonthButtons2"));
  await expect(page.locator("#actualList")).toContainText("山田");
  // 実データは1件も削除されていない
  expect(await readLS(page, "manhour_estimates")).toHaveLength(1);
  expect(await readLS(page, "manhour_actuals")).toHaveLength(1);

  // (c) 「アーカイブ済み」を展開すると山田が復元ボタン付きで出る
  await openMemberSettings(page);
  await expect(page.locator("#archivedMemberCount")).toHaveText("1");
  await expect(page.locator("#memberList")).not.toContainText("山田");
  await page.locator(".member-archived-toggle").click();
  await expect(page.locator("#archivedMemberSection")).not.toHaveClass(/collapsed/);
  const archivedRow = page.locator("#archivedMemberList .member-row");
  await expect(archivedRow.locator(".member-name")).toHaveText("山田");
  await expect(archivedRow.getByRole("button", { name: "復元" })).toBeVisible();
  // マスタ上は archived: true で保持（削除ではない）
  expect(await readLS(page, "manhour_members")).toEqual([M(1, "山田", true), M(2, "佐藤")]);

  expect(errors, errors.join("\n")).toHaveLength(0);
});

// ============================================
// シナリオ5: 復元でアクティブに戻る
// ============================================
test("アーカイブした担当者を復元すると、再び新規入力の選択肢に現れる", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, {
    manhour_members: JSON.stringify([M(1, "山田"), M(2, "佐藤")]),
    manhour_estimates: JSON.stringify([]),
    manhour_actuals: JSON.stringify([]),
    manhour_currentTab: "settings",
  });

  await openMemberSettings(page);
  await memberRow(page, "山田").getByRole("button", { name: "アーカイブ" }).click();
  await expect(page.locator("#archivedMemberCount")).toHaveText("1");
  expect(await quickMemberOptions(page)).toEqual(["（自動）", "佐藤"]);

  await openMemberSettings(page);
  await page.locator(".member-archived-toggle").click();
  await page.locator("#archivedMemberList .member-row").getByRole("button", { name: "復元" }).click();

  // アーカイブ一覧は空になり、アクティブ一覧（末尾）に戻る
  await expect(page.locator("#archivedMemberCount")).toHaveText("0");
  await expect(page.locator("#archivedMemberList")).toContainText("アーカイブ済みの担当者はいません");
  await expect(page.locator("#memberList .member-row .member-name")).toHaveText(["佐藤", "山田"]);

  // 新規入力の選択肢に復帰する
  expect(await quickMemberOptions(page)).toEqual(["（自動）", "佐藤", "山田"]);
  expect(await readLS(page, "manhour_members")).toEqual([M(2, "佐藤"), M(1, "山田")]);

  expect(errors, errors.join("\n")).toHaveLength(0);
});

// ============================================
// シナリオ6: 旧 #memberOrder 読み取りでクラッシュしていたモーダルが開く
// ============================================
test("実績編集・見積編集・その他作業のモーダルがクラッシュせず開き、担当者selectが埋まる", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, {
    manhour_members: JSON.stringify([M(1, "山田"), M(2, "佐藤"), M(3, "鈴木", true)]),
    manhour_estimates: JSON.stringify([
      { id: 1, version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 40,
        workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
    ]),
    manhour_actuals: JSON.stringify([
      { id: 101, date: "2026-08-20", version: "V1.0", task: "対応A", process: "PG", member: "山田",
        hours: 8, createdAt: "2026-08-20T09:00:00.000Z" },
    ]),
    manhour_currentTab: "actual",
  });

  // 実績編集モーダル（既存データの編集なのでアーカイブ済みも選べる）
  await page.evaluate(() => window.editActual(101));
  await expect(page.locator("#editActualModal")).toBeVisible();
  await expect(page.locator("#editActualMember")).toHaveValue("山田");
  expect(await page.locator("#editActualMember option").allTextContents()).toEqual(
    expect.arrayContaining(["山田", "佐藤", "鈴木"])
  );
  await page.evaluate(() => window.closeEditActualModal());
  await expect(page.locator("#editActualModal")).toBeHidden();

  // 見積編集モーダル
  await page.evaluate(() => window.editEstimate(1));
  await expect(page.locator("#editEstimateModal")).toBeVisible();
  await expect(page.locator("#editEstimateMember")).toHaveValue("山田");
  expect(await page.locator("#editEstimateMember option").allTextContents()).toEqual(
    expect.arrayContaining(["山田", "佐藤", "鈴木"])
  );
  await page.evaluate(() => window.closeEditEstimateModal());
  await expect(page.locator("#editEstimateModal")).toBeHidden();

  // その他作業モーダル（新規データ作成なのでアクティブのみ）
  await page.evaluate(() => window.openOtherWorkModal());
  await expect(page.locator("#otherWorkModal")).toBeVisible();
  expect(await page.locator("#otherWorkMember option").allTextContents()).toEqual(["選択...", "山田", "佐藤"]);
  await page.evaluate(() => window.closeOtherWorkModal());
  await expect(page.locator("#otherWorkModal")).toBeHidden();

  expect(errors, errors.join("\n")).toHaveLength(0);
});

// ============================================
// シナリオ7: 改名入力途中に別の担当者を操作しても入力値が失われない
// ============================================
test("改名の入力途中に別の担当者をアーカイブしても、入力中の値が保持される", async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, {
    manhour_members: JSON.stringify([M(1, "山田"), M(2, "佐藤")]),
    manhour_estimates: JSON.stringify([]),
    manhour_actuals: JSON.stringify([]),
    manhour_currentTab: "settings",
  });

  await openMemberSettings(page);
  // 山田の改名を開始し、まだ保存しない
  await memberRow(page, "山田").getByRole("button", { name: "改名" }).click();
  const renameInput = page.locator("#memberRenameInput_1");
  await expect(renameInput).toBeVisible();
  await renameInput.fill("山田 太郎");

  // 別の担当者（佐藤）をアーカイブ → 一覧が再描画される
  await memberRow(page, "佐藤").getByRole("button", { name: "アーカイブ" }).click();
  await expect(page.locator("#archivedMemberCount")).toHaveText("1");

  // 入力途中の値が m.name（保存済みの「山田」）に巻き戻っていない
  await expect(renameInput).toBeVisible();
  await expect(renameInput).toHaveValue("山田 太郎");
  // まだ保存していないのでマスタ上の名前は元のまま
  expect(await readLS(page, "manhour_members")).toEqual([M(1, "山田"), M(2, "佐藤", true)]);

  // そのまま保存すれば入力途中の値が確定する（参照データ0件なので confirm は出ない）
  await page.locator("#memberList .member-row").getByRole("button", { name: "保存" }).click();
  await expect(page.locator("#memberList .member-row .member-name")).toHaveText("山田 太郎");

  expect(errors, errors.join("\n")).toHaveLength(0);
});
