// 退避・リネーム済みのブランチ名が、CI/自動化ファイルに直書きされたまま残っていないか検査する。
// 対象は「自動化サーフェス」（workflows・pipeline設定・scripts・.claude-worktree.json）に限定し、
// docs/ や mockups/ のような歴史的記述（過去の意思決定の記録）は対象外にする。
// 理由: あるブランチが別名にリネームされても、過去の設計書がその名前を含んでいるのは正しい状態であり、
// 検査すべきは「実行時に参照され続けて壊れる」箇所だけだから。
// usage: node scripts/check-stale-branch-refs.mjs [--config <path>]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const INCLUDE_PREFIXES = [".github/workflows/", ".github/pipeline/", "scripts/"];
const INCLUDE_EXACT = [".claude-worktree.json"];

export function isIncludedPath(path) {
  const norm = path.replaceAll("\\", "/");
  return INCLUDE_EXACT.includes(norm) || INCLUDE_PREFIXES.some((p) => norm.startsWith(p));
}

// files: [{ path, content }]  retiredNames: string[]
// 戻り値: [{ path, line, name }]
export function findStaleRefs(files, retiredNames) {
  const violations = [];
  for (const { path, content } of files) {
    if (!isIncludedPath(path)) continue;
    const lines = content.split("\n");
    lines.forEach((lineText, i) => {
      for (const name of retiredNames) {
        if (lineText.includes(name)) {
          violations.push({ path, line: i + 1, name });
        }
      }
    });
  }
  return violations;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : process.argv[i + 1];
  };
  const configPath = arg("--config", ".github/retired-branches.json");
  const { retired } = JSON.parse(readFileSync(configPath, "utf8"));
  const retiredNames = retired.map((r) => r.name);

  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const files = tracked
    .filter((path) => isIncludedPath(path))
    .flatMap((path) => {
      try {
        return [{ path, content: readFileSync(path, "utf8") }];
      } catch {
        return []; // 作業ツリーで削除済み・未ステージ等（git ls-files は index 基準のため起こりうる）
      }
    });

  const violations = findStaleRefs(files, retiredNames);
  if (violations.length) {
    console.error("退避済みブランチ名への参照が残っています:");
    for (const v of violations) {
      const note = retired.find((r) => r.name === v.name)?.note ?? "";
      console.error(`  ${v.path}:${v.line}  "${v.name}"  ${note}`);
    }
    process.exit(1);
  }
  console.log(`OK: 退避済みブランチ名（${retiredNames.join(", ")}）への参照なし（対象 ${files.length} ファイル）`);
}
