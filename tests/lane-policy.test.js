import { test } from "node:test";
import assert from "node:assert/strict";
import { findViolations } from "../scripts/pipeline/check-lane-policy.mjs";

test("触禁パスに前方一致するファイルを違反として返す", () => {
  const forbidden = ["js/storage.js", "js/state.js"];
  assert.deepEqual(findViolations(["js/ui.js", "js/storage.js"], forbidden), ["js/storage.js"]);
});

test("違反なしなら空配列", () => {
  assert.deepEqual(findViolations(["style.css", "index.html"], ["js/storage.js"]), []);
});

test("パス区切りの表記ゆれ（バックスラッシュ）を正規化して照合する", () => {
  assert.deepEqual(findViolations(["js\\storage.js"], ["js/storage.js"]), ["js/storage.js"]);
});

test("前方一致はディレクトリ境界で判定する（js/state.js は js/state-view.js に一致しない）", () => {
  assert.deepEqual(findViolations(["js/state-view.js"], ["js/state.js"]), []);
});

test("policy 側の末尾スラッシュを正規化して照合する", () => {
  assert.deepEqual(findViolations(["js/storage.js"], ["js/storage.js/"]), ["js/storage.js"]);
  assert.deepEqual(findViolations([".github/workflows/x.yml"], [".github/"]), [".github/workflows/x.yml"]);
});
