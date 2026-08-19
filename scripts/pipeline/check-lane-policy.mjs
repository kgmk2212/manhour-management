// lane:auto の PR が触禁パスに触れていないか検査する。
// usage: git diff --name-only ... | node scripts/pipeline/check-lane-policy.mjs --policy <path> --lane <name>
// lane が "lane:auto" 以外なら pass-through（exit 0）。違反があれば一覧を出力して exit 1。
import { readFileSync } from "node:fs";

export function findViolations(files, forbiddenPaths) {
  const norm = (p) => p.replaceAll("\\", "/");
  return files
    .map(norm)
    .filter((f) => forbiddenPaths.some((fp) => f === norm(fp) || f.startsWith(norm(fp) + "/")));
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/").split("/").pop());
if (isMain) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; };
  const lane = arg("--lane") ?? "";
  if (lane !== "lane:auto") { console.log(`lane=${lane || "(none)"}: 検査対象外（pass）`); process.exit(0); }
  const policy = JSON.parse(readFileSync(arg("--policy"), "utf8"));
  const files = readFileSync(0, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  const violations = findViolations(files, policy.forbiddenPaths);
  if (violations.length) { console.error(`触禁パス違反:\n${violations.join("\n")}`); process.exit(1); }
  console.log(`OK: ${files.length} ファイル、違反なし`);
}
