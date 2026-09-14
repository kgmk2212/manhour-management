import { test } from "node:test";
import assert from "node:assert/strict";
import { findStaleRefs, isIncludedPath } from "../scripts/check-stale-branch-refs.mjs";

test("自動化サーフェス配下の参照は違反として検出する", () => {
  const files = [{ path: ".github/workflows/e2e.yml", content: "branches: [experiment/ui-scaling]\n" }];
  const violations = findStaleRefs(files, ["experiment/ui-scaling"]);
  assert.deepEqual(violations, [{ path: ".github/workflows/e2e.yml", line: 1, name: "experiment/ui-scaling" }]);
});

test("docs/ 配下（歴史的記述）は対象外", () => {
  const files = [{ path: "docs/superpowers/specs/2026-01-01-x.md", content: "experiment/ui-scaling で実施した\n" }];
  assert.deepEqual(findStaleRefs(files, ["experiment/ui-scaling"]), []);
});

test("mockups/ 配下も対象外", () => {
  const files = [{ path: "mockups/foo/README.md", content: "experiment/ui-scaling に統合済み\n" }];
  assert.deepEqual(findStaleRefs(files, ["experiment/ui-scaling"]), []);
});

test("該当なしなら空配列", () => {
  const files = [{ path: "scripts/worktree.sh", content: "MAINLINE_BRANCH=\"${MANHOUR_MAINLINE:-main}\"\n" }];
  assert.deepEqual(findStaleRefs(files, ["experiment/ui-scaling"]), []);
});

test("isIncludedPath: 対象プレフィックス", () => {
  assert.equal(isIncludedPath(".github/workflows/ci.yml"), true);
  assert.equal(isIncludedPath(".github/pipeline/prompts/implement.md"), true);
  assert.equal(isIncludedPath("scripts/worktree.sh"), true);
  assert.equal(isIncludedPath(".claude-worktree.json"), true);
});

test("isIncludedPath: 対象外", () => {
  assert.equal(isIncludedPath("docs/CLAUDE.md"), false);
  assert.equal(isIncludedPath("mockups/foo/README.md"), false);
  assert.equal(isIncludedPath(".github/retired-branches.json"), false);
});

test("行番号は1始まり・複数行にまたがっても正しく検出する", () => {
  const files = [{ path: "scripts/x.sh", content: "line1\nexperiment/ui-scaling\nline3\n" }];
  assert.deepEqual(findStaleRefs(files, ["experiment/ui-scaling"]), [
    { path: "scripts/x.sh", line: 2, name: "experiment/ui-scaling" },
  ]);
});
