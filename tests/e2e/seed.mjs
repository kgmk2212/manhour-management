// e2e 用の最小 seed（localStorage エントリ）。値は JSON 文字列。
export const SEED_ENTRIES = {
  manhour_estimates: JSON.stringify([
    { id: 1, version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 40,
      workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
  ]),
  manhour_actuals: JSON.stringify([]),
  manhour_currentTab: "quick",
};
