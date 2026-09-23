// 中断（分割）モーダルの既定値と残工数入力の実アプリ統合テスト。
// 既定: 差し込み作業は作らない／後続はずらさない。工数は「残工数」で入力し、消化工数は逆算する。
// モーダルは window.openInterruptionModal で開き、実際の入力・ボタン押下経路を通して
// localStorage に落ちた結果で機械判定する。2026-08-03〜07 は平日（営業日）。
import { test, expect } from "@playwright/test";

const MEMBER = "山田";

const SEED_SCHEDULES = [
  { id: "sch_main", version: "V1.0", task: "対応A", process: "PG", member: MEMBER,
    startDate: "2026-08-03", endDate: "2026-08-07", estimatedHours: 40,
    status: "pending", color: "#4a90d9", note: "", interruptions: [],
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
  // 同担当者の後続（元の endDate 以降に開始）。連鎖ずらしの対象になりうる
  { id: "sch_next", version: "V1.0", task: "対応B", process: "PG", member: MEMBER,
    startDate: "2026-08-10", endDate: "2026-08-10", estimatedHours: 8,
    status: "pending", color: "#4a90d9", note: "", interruptions: [],
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" },
];

const seedEntries = (schedules) => ({
  manhour_estimates: JSON.stringify([]),
  manhour_actuals: JSON.stringify([]),
  manhour_schedules: JSON.stringify(schedules),
  manhour_scheduleSettings: JSON.stringify({ currentMonth: "2026-08" }),
  manhour_currentTab: "schedule",
});

const readSchedules = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("manhour_schedules")));

async function openModal(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, seedEntries(SEED_SCHEDULES));
  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);
  await page.evaluate(() => window.openInterruptionModal("sch_main", "2026-08-04"));
  await expect(page.locator("#interruptionModal")).toBeVisible();
  return errors;
}

test.describe("中断モーダルの既定値と残工数入力", () => {
  test("既定は差し込みなし・後続ずらしなしで、残工数から消化工数を逆算して分割する", async ({ page }) => {
    const errors = await openModal(page);

    await expect(page.locator("#interruptionCreateInsert")).not.toBeChecked();
    await expect(page.locator("#interruptionInsertSection")).toBeHidden();
    await expect(page.locator("#interruptionShiftDependents")).not.toBeChecked();
    // 初期値: 08-03〜08-04 の2営業日×8h=16h 消化 → 残 24h
    await expect(page.locator("#interruptionRemainingHours")).toHaveValue("24");
    await expect(page.locator("#interruptionConsumedAuto")).toContainText("消化 16h");

    await page.locator("#interruptionRemainingHours").fill("30");
    await expect(page.locator("#interruptionConsumedAuto")).toContainText("消化 10h");

    await page.getByRole("button", { name: "影響を確認" }).click();
    await expect(page.locator("#impactPreviewContent")).toContainText("後続のスケジュールはずらしません");
    await page.locator("#impactPreviewModal").getByRole("button", { name: "適用する" }).click();

    const after = await readSchedules(page);
    expect(after).toHaveLength(2); // 差し込み作業は作られない
    const main = after.find((s) => s.id === "sch_main");
    expect(main.interruptions).toHaveLength(1);
    expect(main.interruptions[0].consumedHours).toBe(10);
    expect(main.interruptions[0].insertedScheduleId).toBeNull();
    expect(main.estimatedHours).toBe(40);
    // 後続は動かない
    const next = after.find((s) => s.id === "sch_next");
    expect(next.startDate).toBe("2026-08-10");
    expect(next.endDate).toBe("2026-08-10");
    expect(errors).toEqual([]);
  });

  test("差し込みを作成し『後続もずらす』を選ぶと後続が連鎖でずれる", async ({ page }) => {
    const errors = await openModal(page);

    await page.locator("#interruptionCreateInsert").check();
    await expect(page.locator("#interruptionInsertSection")).toBeVisible();
    await page.locator("#interruptionInsertTask").fill("差込");
    await page.locator("#interruptionInsertHours").fill("16");
    // 版数は select。seed の estimates が空なので選択肢を直接足して選ぶ
    await page.evaluate(() => {
      const sel = document.getElementById("interruptionInsertVersion");
      sel.add(new Option("V2.0", "V2.0"));
      sel.value = "V2.0";
    });
    await page.locator("#interruptionShiftDependents").check();

    await page.getByRole("button", { name: "影響を確認" }).click();
    await expect(page.locator("#impactPreviewContent")).toContainText("影響を受けるスケジュール");
    await page.locator("#impactPreviewModal").getByRole("button", { name: "適用する" }).click();

    const after = await readSchedules(page);
    expect(after).toHaveLength(3);
    const next = after.find((s) => s.id === "sch_next");
    expect(next.startDate > "2026-08-10").toBe(true);
    expect(errors).toEqual([]);
  });

  test("残工数が見積以上なら警告して適用しない", async ({ page }) => {
    await openModal(page);
    await page.locator("#interruptionRemainingHours").fill("40");
    await page.getByRole("button", { name: "影響を確認" }).click();
    await expect(page.locator("#impactPreviewModal")).toBeHidden();
    await expect(page.locator("#interruptionModal")).toBeVisible();
  });
});
