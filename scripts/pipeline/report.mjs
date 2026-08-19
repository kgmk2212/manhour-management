// 週次レポート生成。stdin に gh api で集めた Issue JSON 配列を受け取り Markdown を出力する。
// 形式: [{ number, title, labels: string[], state, prState: "merged"|"open"|"closed"|null }]
import { readFileSync } from "node:fs";

export function buildReport(issues) {
  const count = (label) => issues.filter((i) => i.labels.includes(label)).length;
  const lines = [
    `## 📊 パイプライン週次レポート`,
    ``,
    `- 処理件数: ${issues.length}`,
    `- lane:auto: ${count("lane:auto")} / lane:pr: ${count("lane:pr")} / lane:design: ${count("lane:design")} / needs-clarification: ${count("needs-clarification")} / verification-failed: ${count("verification-failed")}`,
    ``,
    `| Issue | タイトル | ラベル | PR |`,
    `|---|---|---|---|`,
    ...issues.map((i) => `| #${i.number} | ${i.title} | ${i.labels.filter((l) => l !== "idea").join(", ") || "-"} | ${i.prState ?? "-"} |`),
    ``,
    `> 解禁基準: 2〜4週経過 かつ lane:auto 10件以上で人間判断との不一致0件（ラベル張り替え・PR不採用が不一致のシグナル）`,
  ];
  return lines.join("\n");
}

if (process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("report.mjs")) {
  const issues = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(buildReport(issues));
}
