import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../scripts/pipeline/report.mjs";

const issues = [
  { number: 10, title: "A", labels: ["idea", "lane:auto"], state: "closed", prState: "merged" },
  { number: 11, title: "B", labels: ["idea", "lane:pr"], state: "open", prState: "open" },
  { number: 12, title: "C", labels: ["idea", "needs-clarification"], state: "open", prState: null },
];

test("件数集計と各Issueの行が含まれる", () => {
  const md = buildReport(issues);
  assert.match(md, /処理件数: 3/);
  assert.match(md, /lane:auto: 1/);
  assert.match(md, /lane:pr: 1/);
  assert.match(md, /needs-clarification: 1/);
  assert.match(md, /#10/);
  assert.match(md, /merged/);
});

test("0件でも壊れない", () => {
  assert.match(buildReport([]), /処理件数: 0/);
});
