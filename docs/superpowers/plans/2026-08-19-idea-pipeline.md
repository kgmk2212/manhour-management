# アイデア自動実装パイプライン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Issues に書いたアイデアを、claude-code-action が自動でトリアージ→実装→検証→PR 化し、学習期間後は低リスク変更を自動マージ・自動デプロイまで流すパイプラインを構築する。

**Architecture:** GitHub Actions のイベント駆動。`triage.yml`（Issue→解釈＋レーン判定）→`implement.yml`（実装＋PR作成）→`lane-policy-check.yml`＋`e2e.yml`（機械ゲート）→ ブランチ保護＋`AUTO_MERGE_ENABLED` 変数（解禁スイッチ）→`deploy.yml`（既存を ui-scaling push でも発火）。判定ポリシーとプロンプトはリポ内ファイルでバージョン管理。

**Tech Stack:** GitHub Actions / anthropics/claude-code-action@v1 / gh CLI / @playwright/test（devDependency）/ node:test

**Spec:** `docs/superpowers/specs/2026-08-19-idea-pipeline-design.md`

## Global Constraints

- ベースブランチ・PR ターゲットはすべて `experiment/ui-scaling`
- ランタイム依存は増やさない（追加は devDependencies のみ。アプリ本体は素の HTML/CSS/JS を維持）
- コミットは Conventional Commits・自分が編集したファイルのみ明示ステージ（`git add -A` 禁止）
- リポジトリ: `kgmk2212/manhour-management`（公開）。**第三者の Issue で Claude が起動しないよう、triage/implement は `github.event.issue.user.login == github.repository_owner` ガード必須**（仕様書 §4.2 への追記事項）
- 秘密情報（トークン類）はコミットしない。ワークフローは `secrets.CLAUDE_CODE_OAUTH_TOKEN` を参照
- ユーザー向け文言・プロンプト・ドキュメントは日本語
- Phase A→D の順で作るが、観測ゲート（トリアージ精度確認・学習期間評価）は運用で並行する。学習期間中は全 PR 人間マージなので Phase C を先に作っても安全は保たれる

---

## File Structure（最終形）

```
.github/
├── ISSUE_TEMPLATE/idea.yml            # アイデア投入テンプレ（Task 2）
├── pipeline/
│   ├── auto-lane-policy.json          # lane:auto 触禁パス（Task 3）
│   └── prompts/
│       ├── triage.md                  # トリアージ指示書（Task 3）
│       ├── implement.md               # 実装指示書（Task 11）
│       └── design.md                  # 設計レーン指示書（Task 11）
└── workflows/
    ├── triage.yml                     # Task 4
    ├── e2e.yml                        # Task 7
    ├── deploy.yml                     # Task 8 で修正
    ├── implement.yml                  # Task 12
    ├── lane-policy-check.yml          # Task 10
    ├── revert.yml                     # Task 13
    └── pipeline-report.yml            # Task 15
scripts/pipeline/
    ├── setup-labels.sh                # Task 1
    ├── check-lane-policy.mjs          # Task 9
    └── report.mjs                     # Task 15
tests/
    ├── lane-policy.test.js            # Task 9
    ├── pipeline-report.test.js        # Task 15
    └── e2e/
        ├── serve.mjs                  # Task 6（MIME明示の静的サーバー）
        ├── seed.mjs                   # Task 6（最小データ）
        ├── smoke.spec.js              # Task 6
        └── capture.mjs                # Task 6（タブ別スクショ撮影）
playwright.config.js                   # Task 6
package.json                           # Task 6 で修正
docs/pipeline/SETUP.md                 # Task 5・16
```

---

# Phase A: 受け皿とトリアージ

### Task 1: ラベル作成スクリプト

**Files:**
- Create: `scripts/pipeline/setup-labels.sh`

**Interfaces:**
- Produces: ラベル名 `idea` / `lane:auto` / `lane:pr` / `lane:design` / `needs-clarification` / `verification-failed` / `pipeline-report`（以降の全タスクがこの名前に依存）

- [ ] **Step 1: スクリプト作成**

```bash
#!/usr/bin/env bash
# パイプライン用ラベルを作成する（冪等: 既存なら上書き更新）
set -euo pipefail
REPO="kgmk2212/manhour-management"

create() { # name color description
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force
}

create "idea"                 "0e8a16" "アイデア入口（トリアージ対象）"
create "lane:auto"            "1d76db" "自動走行枠（検証PASSで自動マージ候補）"
create "lane:pr"              "5319e7" "実装・PR作成まで自動、マージは人間"
create "lane:design"          "b60205" "設計書生成で停止（コードは書かない）"
create "needs-clarification"  "fbca04" "解釈に幅あり。回答コメントで再トリアージ"
create "verification-failed"  "e11d21" "検証FAILまたは実装中断"
create "pipeline-report"      "c5def5" "パイプライン週次レポート"
echo "done"
```

- [ ] **Step 2: 実行して確認**

Run: `bash scripts/pipeline/setup-labels.sh && gh label list --repo kgmk2212/manhour-management | grep -E "idea|lane:|clarification|verification|pipeline"`
Expected: 7 ラベルすべてが表示される

- [ ] **Step 3: Commit**

```bash
git add scripts/pipeline/setup-labels.sh
git commit -m "chore(pipeline): パイプライン用ラベル作成スクリプトを追加"
```

### Task 2: Issue テンプレート

**Files:**
- Create: `.github/ISSUE_TEMPLATE/idea.yml`

**Interfaces:**
- Produces: `idea` ラベルが自動付与された Issue（Task 4 のトリガー）

- [ ] **Step 1: テンプレート作成**

```yaml
name: 💡 アイデア
description: 「こうしたい」を1行から。自動でトリアージ・実装されます
labels: ["idea"]
body:
  - type: textarea
    id: idea
    attributes:
      label: やりたいこと
      description: 思いつきのままでOK。曖昧な場合はBotが質問を返します
      placeholder: 例）見積タブの合計行を目立たせたい
    validations:
      required: true
```

- [ ] **Step 2: Commit**

```bash
git add .github/ISSUE_TEMPLATE/idea.yml
git commit -m "feat(pipeline): アイデア投入用Issueテンプレートを追加"
```

### Task 3: 触禁ポリシーとトリアージプロンプト

**Files:**
- Create: `.github/pipeline/auto-lane-policy.json`
- Create: `.github/pipeline/prompts/triage.md`

**Interfaces:**
- Produces: `auto-lane-policy.json` のスキーマ `{ "forbiddenPaths": string[] }`（Task 9 のスクリプトと triage.md が参照）
- Produces: トリアージコメントの見出し書式 `## 🔎 トリアージ結果`（Task 11 の implement.md が「この見出しのコメントを読む」ことに依存）

- [ ] **Step 1: ポリシーファイル作成**

```json
{
  "description": "lane:auto では変更禁止のパス（前方一致）。データ整合性に関わるモジュール。",
  "forbiddenPaths": [
    "js/storage.js",
    "js/state.js",
    "js/merge-core.js",
    "js/history.js",
    "js/excel-import.js"
  ]
}
```

- [ ] **Step 2: triage.md 作成**

````markdown
# トリアージ指示書

あなたは工数管理システム（素の HTML/CSS/JS・localStorage）のトリアージ担当。
対象 Issue 番号はワークフローの prompt で渡される。以下を順に実行する。

## 手順

1. `gh issue view <番号> --comments` で本文と既存コメントを読む。
2. リポジトリを Read/Grep で調査し、アイデアがどのファイル・画面に関わるか特定する。
3. 解釈が2つ以上成り立つ場合は【質問】へ。一義的なら【判定】へ。

## 判定基準（上から順に評価し、最初に該当したレーンに決める）

- **lane:design**: データモデル（保存されるデータの形）の変更を伴う／複数画面にまたがる新機能
- **lane:auto**: 次を**すべて**満たす — ①表示・文言・スタイル・既知バグ修正の範囲
  ②変更が及ぶファイルが `.github/pipeline/auto-lane-policy.json` の forbiddenPaths に含まれない
  ③受入条件を Playwright の DOM 判定または node:test で機械検証できる
- **lane:pr**: 上記以外すべて（迷ったら lane:pr。軽い方に倒さない）

## 【判定】の場合の出力

1. Issue に次の形式でコメントする（見出しは一字一句この通り）:

```
## 🔎 トリアージ結果

### 解釈
（私はこの Issue を「…」という依頼と解釈した。対象は <ファイル/画面>。）

### 受入条件
- [ ] （機械検証可能な条件を列挙。例: #estimateList 内の合計行に background が設定されている）

### レーン判定: lane:xxx
根拠: （判定基準のどれに該当したか）
```

2. `gh issue edit <番号> --add-label "lane:xxx"` でラベルを付ける。

## 【質問】の場合の出力

1. 解釈の候補を A/B… で列挙し、どれかを問うコメントを投稿する。
2. `gh issue edit <番号> --add-label "needs-clarification"` を実行する。
3. lane ラベルは付けない。

## 禁止事項

- コードの変更・コミット・PR 作成（トリアージは読み取り＋Issue 操作のみ）
- 受入条件のない lane:auto 判定
````

- [ ] **Step 3: Commit**

```bash
git add .github/pipeline/auto-lane-policy.json .github/pipeline/prompts/triage.md
git commit -m "feat(pipeline): 触禁ポリシーとトリアージプロンプトを追加"
```

### Task 4: triage.yml ワークフロー

**Files:**
- Create: `.github/workflows/triage.yml`

**Interfaces:**
- Consumes: `idea` ラベル（Task 1・2）、`.github/pipeline/prompts/triage.md`（Task 3）
- Produces: lane ラベルの付与イベント（Task 12 の implement.yml のトリガー）

- [ ] **Step 1: ワークフロー作成**

```yaml
# アイデアIssueのトリアージ: 解釈文＋受入条件をコメントし、レーン判定ラベルを付与する。
# 判定基準の調整は .github/pipeline/prompts/triage.md を編集する。
name: Idea Triage

on:
  issues:
    types: [opened, labeled]
  issue_comment:
    types: [created]

permissions:
  contents: read
  issues: write
  pull-requests: read
  actions: read

concurrency:
  group: triage-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  triage:
    # オーナーのIssueのみ（公開リポのため第三者Issueでは起動しない）。
    # opened: ideaラベル付きで作成 / labeled: 後からideaを付けた場合 / comment: 質問への回答で再トリアージ。
    # lane済み・質問中(commentイベント以外)は二重実行しない。
    if: >
      github.event.issue.user.login == github.repository_owner &&
      !github.event.issue.pull_request &&
      (
        (github.event_name == 'issues' && github.event.action == 'opened' && contains(github.event.issue.labels.*.name, 'idea')) ||
        (github.event_name == 'issues' && github.event.action == 'labeled' && github.event.label.name == 'idea') ||
        (github.event_name == 'issue_comment' && contains(github.event.issue.labels.*.name, 'needs-clarification') && github.event.comment.user.login == github.repository_owner)
      ) &&
      !contains(github.event.issue.labels.*.name, 'lane:auto') &&
      !contains(github.event.issue.labels.*.name, 'lane:pr') &&
      !contains(github.event.issue.labels.*.name, 'lane:design')
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      # PIPELINE_PAT 必須: GITHUB_TOKEN によるラベル付与は後続ワークフロー（implement.yml）を
      # 発火させない（GitHub の再帰防止仕様）。SETUP.md §1.5 参照。
      GH_TOKEN: ${{ secrets.PIPELINE_PAT }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: experiment/ui-scaling

      - name: Run triage
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: ${{ secrets.PIPELINE_PAT }}
          prompt: |
            対象 Issue: #${{ github.event.issue.number }}
            リポジトリ直下の .github/pipeline/prompts/triage.md を読み、
            その指示に従ってこの Issue のトリアージだけを実行してください。
            （needs-clarification 中の再トリアージの場合は、最新の回答コメントを踏まえて再判定し、
            判定できたら needs-clarification ラベルを外してください: gh issue edit --remove-label）
          claude_args: |
            --allowedTools "Read,Grep,Glob,Bash(gh issue view:*),Bash(gh issue comment:*),Bash(gh issue edit:*)"
```

- [ ] **Step 2: YAML 構文の静的確認**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/triage.yml','utf8'); if(!/anthropics\/claude-code-action@v1/.test(y)) throw 1; console.log('ok')"`
Expected: `ok`（依存なしの最低限チェック。本検証は push 後の実発火＝Task 5）

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/triage.yml
git commit -m "feat(pipeline): トリアージワークフローを追加"
```

- [ ] **Step 4: main ミラースクリプト作成**（`issues`/`issue_comment`/`schedule` トリガーのワークフローは **default branch（main）上のファイルしか発火しない**ため、該当4本を main へミラーする仕組みが必要）

`scripts/pipeline/mirror-workflows-to-main.sh`:

```bash
#!/usr/bin/env bash
# issues/issue_comment/schedule トリガーのワークフローは default branch (main) 上のみ発火する。
# ui-scaling を正本とし、該当ワークフローを main worktree へコピーして push する。
set -euo pipefail
MAIN_WT="../../manhour-management"   # D:/CCwork/manhour-management（main の worktree）
FILES="triage.yml implement.yml revert.yml pipeline-report.yml"
for f in $FILES; do
  if [ -f ".github/workflows/$f" ]; then
    cp ".github/workflows/$f" "$MAIN_WT/.github/workflows/$f"
  fi
done
cd "$MAIN_WT"
git add .github/workflows
git commit -m "ci(pipeline): イベント駆動ワークフローを ui-scaling からミラー" || { echo "変更なし"; exit 0; }
git push origin main
```

- [ ] **Step 5: Commit**

```bash
git add scripts/pipeline/mirror-workflows-to-main.sh
git commit -m "chore(pipeline): ワークフローのmainミラースクリプトを追加"
```

### Task 5: セットアップ手順書＋Phase A 実地検証

**Files:**
- Create: `docs/pipeline/SETUP.md`

**Interfaces:**
- Consumes: Task 1〜4 の成果物すべて
- Produces: `CLAUDE_CODE_OAUTH_TOKEN` Secret／変数 `AUTO_MERGE_ENABLED=false`（Task 12 が参照）

- [ ] **Step 1: SETUP.md 作成**

````markdown
# パイプライン セットアップ手順（1回だけ）

## 1. Claude GitHub App（要ユーザー操作）
Claude Code のターミナルで `/install-github-app` を実行し、リポジトリ
`kgmk2212/manhour-management` に App をインストール。フローの中で
Secret `CLAUDE_CODE_OAUTH_TOKEN` が作成される（既存サブスクのクォータで動く）。

## 1.5 PIPELINE_PAT（要ユーザー操作）
GITHUB_TOKEN で行った操作（ラベル付与・PR作成・push・auto-merge予約）は**後続ワークフローを発火させない**
（GitHub の再帰防止仕様）。パイプラインの連鎖 triage→implement→checks→auto-merge→deploy を通すため、
fine-grained PAT を作成して Secret に登録する:
1. https://github.com/settings/personal-access-tokens/new で対象リポジトリを `kgmk2212/manhour-management` に限定し、
   Repository permissions: **Contents=Read and write / Issues=Read and write / Pull requests=Read and write**
2. `gh secret set PIPELINE_PAT --repo kgmk2212/manhour-management`（値を貼り付け）
3. 失効したら同権限で再発行して再登録（triage が起動しなくなったら失効を疑う）

## 2. リポジトリ変数（自動マージ解禁スイッチ・初期OFF）
```bash
gh variable set AUTO_MERGE_ENABLED --repo kgmk2212/manhour-management --body "false"
```

## 2.5 Auto-merge 機能の有効化（リポジトリ設定）
```bash
gh api -X PATCH repos/kgmk2212/manhour-management -F allow_auto_merge=true
```

## 3. ラベル
```bash
bash scripts/pipeline/setup-labels.sh
```

## 4. ブランチ保護（Phase C 完了後に実施 — required checks が存在してから）
`gh pr merge --auto` がチェック完了を待つための前提。**「PR必須」は有効にしない**
（対話セッションからの ui-scaling 直接 push を塞がないため）。
```bash
gh api -X PUT "repos/kgmk2212/manhour-management/branches/experiment%2Fui-scaling/protection" \
  --input - <<'EOF'
{
  "required_status_checks": { "strict": false, "contexts": ["e2e", "lane-policy-check"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

## 5. 解禁（学習期間の基準を満たしたら）
基準: 2〜4週経過 かつ lane:auto 判定10件以上で人間判断との不一致0件（週次レポートで確認）。
```bash
gh variable set AUTO_MERGE_ENABLED --repo kgmk2212/manhour-management --body "true"
```

## 6. ワークフローの main ミラー（運用ルール）
issues / issue_comment / schedule トリガーは **default branch（main）上のワークフローしか発火しない**。
`triage.yml` / `implement.yml` / `revert.yml` / `pipeline-report.yml` を変更したら必ず
`bash scripts/pipeline/mirror-workflows-to-main.sh` を実行して main に反映する（正本は ui-scaling 側）。
````

- [ ] **Step 2: Commit & Push**

```bash
git add docs/pipeline/SETUP.md
git commit -m "docs(pipeline): セットアップ手順書を追加"
git push origin experiment/ui-scaling
bash scripts/pipeline/mirror-workflows-to-main.sh
```

- [ ] **Step 3: ユーザー操作の依頼**

SETUP.md §1（`/install-github-app`）と §1.5（PIPELINE_PAT の作成・登録）はユーザーにしかできないため、ここで依頼して完了を待つ。§2・§2.5・§3 は Bash で代行実行する。

- [ ] **Step 4: 実地検証（トリアージの実発火）**

```bash
gh issue create --repo kgmk2212/manhour-management \
  --title "テスト: クイックタブの見出し文言を確認したい" \
  --body "パイプラインPhase Aの動作確認用。クイック入力タブの見出しをわかりやすくしたい。" \
  --label idea
gh run list --repo kgmk2212/manhour-management --workflow "Idea Triage" --limit 1
```
Expected: run が起動し、数分内に Issue へ「## 🔎 トリアージ結果」コメント＋lane ラベルが付く（`gh issue view <N> --comments` で確認）。FAIL の場合は run ログを読み、triage.yml / プロンプトを修正して再実行。

---

# Phase B: 検証のCI常設化とデプロイ経路

### Task 6: Playwright e2e 基盤（サーバー・seed・スモーク・撮影）

**Files:**
- Create: `tests/e2e/serve.mjs`, `tests/e2e/seed.mjs`, `tests/e2e/smoke.spec.js`, `tests/e2e/capture.mjs`, `playwright.config.js`
- Modify: `package.json`（devDeps・scripts 追加）

**Interfaces:**
- Produces: `npm run e2e`（Task 7 の CI と Task 11 の implement.md が実行）／`node tests/e2e/capture.mjs <outdir>`（implement.md がスクショ撮影に使用）
- Produces: `seed.mjs` の `export const SEED_ENTRIES`（key→JSON文字列 の localStorage エントリ）

- [ ] **Step 1: 静的サーバー serve.mjs 作成**（Python 版 serve.py の教訓＝MIME 明示を移植。verify-ui コマンド参照）

```js
// usage: node tests/e2e/serve.mjs <port> [root]
// ES Modules 配信のため MIME を明示する静的サーバー（依存なし）
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};
const port = Number(process.argv[2] ?? 8901);
const root = process.argv[3] ?? process.cwd();

createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(root, path === "" ? "index.html" : path);
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} at http://127.0.0.1:${port}`));
```

- [ ] **Step 2: seed.mjs 作成**（キーは `js/constants.js` の STORAGE_KEYS 準拠）

```js
// e2e 用の最小 seed（localStorage エントリ）。値は JSON 文字列。
export const SEED_ENTRIES = {
  manhour_estimates: JSON.stringify([
    { id: 1, version: "V1.0", task: "対応A", process: "PG", member: "山田", hours: 40,
      workMonth: "2026-08", workMonths: ["2026-08"], monthlyHours: { "2026-08": 40 } },
  ]),
  manhour_actuals: JSON.stringify([]),
  manhour_currentTab: "quick",
};
```

- [ ] **Step 3: smoke.spec.js 作成**

```js
// スモーク: 起動して全タブが描画され、コンソールエラー0であること（白画面事故の恒久対策）
import { test, expect } from "@playwright/test";
import { SEED_ENTRIES } from "./seed.mjs";

const TABS = ["quick", "report", "analytics", "estimate", "actual", "schedule", "settings"];

test("全タブが描画されコンソールエラーが出ない", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.addInitScript((entries) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, SEED_ENTRIES);

  await page.goto("/index.html");
  await expect(page.locator(".tab-content.active")).toHaveCount(1);

  let visited = 0;
  for (const tab of TABS) {
    const nav = page.locator(`.nav-item[data-tab="${tab}"]`);
    if (!(await nav.isVisible())) continue; // 設定で隠れるタブ（schedule等）はスキップ
    await nav.click();
    await expect(page.locator(`#${tab}`)).toHaveClass(/active/);
    visited++;
  }
  expect(visited, "最低5タブは検証する").toBeGreaterThanOrEqual(5);
  expect(errors, errors.join("\n")).toHaveLength(0);
});
```

- [ ] **Step 4: capture.mjs 作成**（implement エージェントが PR 用スクショを撮る道具）

```js
// usage: node tests/e2e/capture.mjs <outdir> [port]
// 各タブのスクリーンショットを outdir に保存する（serve.mjs を自前起動）
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { SEED_ENTRIES } from "./seed.mjs";

const outdir = process.argv[2] ?? "qa-out";
const port = Number(process.argv[3] ?? 8902);
mkdirSync(outdir, { recursive: true });
const server = spawn("node", ["tests/e2e/serve.mjs", String(port)], { stdio: "inherit" });
await new Promise((r) => setTimeout(r, 1500));
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.addInitScript((e) => { localStorage.clear(); for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); }, SEED_ENTRIES);
  await page.goto(`http://127.0.0.1:${port}/index.html`);
  for (const tab of ["quick", "report", "analytics", "estimate", "actual", "schedule", "settings"]) {
    const nav = page.locator(`.nav-item[data-tab="${tab}"]`);
    if (!(await nav.isVisible())) continue;
    await nav.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outdir}/${tab}.png`, fullPage: false });
  }
  await browser.close();
} finally {
  server.kill();
}
console.log(`screenshots -> ${outdir}`);
```

- [ ] **Step 5: playwright.config.js 作成**

```js
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:8901", viewport: { width: 1400, height: 900 } },
  webServer: {
    command: "node tests/e2e/serve.mjs 8901",
    url: "http://127.0.0.1:8901/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 6: package.json 修正**（devDeps と scripts。既存の lint/test は変更しない）

scripts に `"e2e": "playwright test"` を追加、devDependencies に `"@playwright/test": "^1.50.0"` を追加。

Run: `npm install`
Expected: エラーなし（package-lock.json が更新される）

- [ ] **Step 7: node --test が e2e を拾わないことを確認**

Run: `npm test`
Expected: 既存 48 件のみ実行され PASS（`node --test` は `*.test.js` のみ対象なので `smoke.spec.js` は対象外のはず。もし拾われたら package.json の test を `node --test tests/*.test.js` に修正する）

- [ ] **Step 8: スモーク実行（ローカル）**

Run: `npx playwright install chromium && npm run e2e`
Expected: 1 passed。FAIL ならエラー内容（セレクタ・コンソールエラー）を調査して直す（既存アプリ側の実バグが見つかる可能性もある。その場合はこの計画と別に Issue 化し、テスト側は実挙動に合わせない＝バグを固定しない）

- [ ] **Step 9: Commit**

```bash
git add tests/e2e/serve.mjs tests/e2e/seed.mjs tests/e2e/smoke.spec.js tests/e2e/capture.mjs playwright.config.js package.json package-lock.json
git commit -m "test(e2e): Playwrightスモークテスト基盤を常設（起動・全タブ描画・コンソールエラー0）"
```

### Task 7: e2e.yml ワークフロー

**Files:**
- Create: `.github/workflows/e2e.yml`

**Interfaces:**
- Consumes: `npm run e2e`（Task 6）
- Produces: 必須チェック名 `e2e`（SETUP.md §4 のブランチ保護が参照。**job 名を変えたら保護設定も変えること**）

- [ ] **Step 1: ワークフロー作成**

```yaml
# 実ブラウザスモーク: PR と ui-scaling への push で起動・全タブ描画・コンソールエラー0 を検証する。
# ブランチ保護の required check（名前: e2e）。
name: e2e

on:
  pull_request:
  push:
    branches: [experiment/ui-scaling]

permissions:
  contents: read

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    name: e2e
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - name: Upload failure traces
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-results
          path: test-results/
          retention-days: 7
```

- [ ] **Step 2: Commit & Push で実発火確認**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci(e2e): Playwrightスモークを必須チェックとして追加"
git push origin experiment/ui-scaling
gh run watch --repo kgmk2212/manhour-management $(gh run list --repo kgmk2212/manhour-management --workflow e2e --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: conclusion success

### Task 8: deploy.yml の発火条件追加

**Files:**
- Modify: `.github/workflows/deploy.yml:4-10`（`on.push.branches`）

**Interfaces:**
- Produces: ui-scaling への push（自動マージ含む）で Pages 再デプロイ（空コミット不要に）

- [ ] **Step 1: トリガー修正**

`on.push.branches` を `[main]` から `[main, experiment/ui-scaling]` に変更し、コメントを更新する:

```yaml
on:
  # main または experiment/ui-scaling への push で実行
  # （ジョブは常に main をルート、各実験ブランチを preview/ 配下に展開する。従来の
  #   「main へ空コミットで発火」はパイプライン経路では不要になった）
  push:
    branches:
      - main
      - experiment/ui-scaling
  workflow_dispatch:
```

- [ ] **Step 2: Commit & Push で実発火確認**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(deploy): experiment/ui-scaling への push でも Pages デプロイを発火"
git push origin experiment/ui-scaling
gh run list --repo kgmk2212/manhour-management --workflow "Deploy to GitHub Pages" --limit 1
```
Expected: ui-scaling への push を契機に deploy run が起動し success（preview/ui-scaling が更新される）

---

# Phase C: 自動実装とゲート

### Task 9: lane ポリシー検査スクリプト（TDD）

**Files:**
- Create: `scripts/pipeline/check-lane-policy.mjs`
- Test: `tests/lane-policy.test.js`

**Interfaces:**
- Consumes: `auto-lane-policy.json` の `{ forbiddenPaths: string[] }`（Task 3）
- Produces: `findViolations(files: string[], forbiddenPaths: string[]): string[]`（export）と CLI（`node scripts/pipeline/check-lane-policy.mjs --policy <path> --lane <name>`、変更ファイル一覧を stdin 改行区切りで受け取り、違反あり exit 1）。Task 10 が CLI を使用

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test tests/lane-policy.test.js`
Expected: FAIL（module not found）

- [ ] **Step 3: 実装**

```js
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
```

- [ ] **Step 4: テスト PASS を確認**

Run: `node --test tests/lane-policy.test.js`
Expected: 4 pass

- [ ] **Step 5: Commit**

```bash
git add scripts/pipeline/check-lane-policy.mjs tests/lane-policy.test.js
git commit -m "feat(pipeline): laneポリシー検査スクリプトを追加（TDD）"
```

### Task 10: lane-policy-check.yml ワークフロー

**Files:**
- Create: `.github/workflows/lane-policy-check.yml`

**Interfaces:**
- Consumes: `check-lane-policy.mjs` の CLI（Task 9）、PR に付く `lane:auto` ラベル（Task 12 が付与）
- Produces: 必須チェック名 `lane-policy-check`（SETUP.md §4 が参照）

- [ ] **Step 1: ワークフロー作成**

```yaml
# lane:auto ラベルの PR が触禁パスに触れていないことを機械検査する（LLMの自己申告に依存しない壁）。
# lane:auto 以外の PR は pass-through。ブランチ保護の required check（名前: lane-policy-check）。
name: lane-policy-check

on:
  pull_request:
    types: [opened, synchronize, labeled, unlabeled]

permissions:
  contents: read
  pull-requests: read

jobs:
  lane-policy-check:
    name: lane-policy-check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
      - name: Check forbidden paths
        run: |
          LANE=""
          if [ "${{ contains(github.event.pull_request.labels.*.name, 'lane:auto') }}" = "true" ]; then
            LANE="lane:auto"
          fi
          gh pr diff ${{ github.event.pull_request.number }} --name-only \
            | node scripts/pipeline/check-lane-policy.mjs --policy .github/pipeline/auto-lane-policy.json --lane "$LANE"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/lane-policy-check.yml
git commit -m "ci(pipeline): lane:auto PRの触禁パス機械検査を追加"
```

### Task 11: 実装プロンプトと設計プロンプト

**Files:**
- Create: `.github/pipeline/prompts/implement.md`
- Create: `.github/pipeline/prompts/design.md`

**Interfaces:**
- Consumes: トリアージコメント書式 `## 🔎 トリアージ結果`（Task 3）、`npm run e2e`・`capture.mjs`（Task 6）
- Produces: ブランチ命名 `pipeline/issue-<番号>`・PR 本文書式（Task 12・13 が依存）

- [ ] **Step 1: implement.md 作成**

````markdown
# 実装指示書（lane:auto / lane:pr 共通）

あなたは工数管理システムの実装担当。対象 Issue 番号はワークフローの prompt で渡される。

## 前提知識
- 素の HTML/CSS/JS（ES Modules）・localStorage。フレームワーク・ランタイム依存の追加は禁止
- コーディング規約: `js/constants.js` の定数を使う（マジックナンバー禁止）／新しい状態変数は `js/state.js`
  ／関数に JSDoc／既存スタイルに合わせる

## 手順（この順で。飛ばさない）
1. `gh issue view <番号> --comments` で本文と「## 🔎 トリアージ結果」コメント（解釈・受入条件）を読む。
   解釈と受入条件が実装の仕様。**受入条件に無いことを勝手に足さない（YAGNI）**。
2. ブランチ作成: `git switch -c pipeline/issue-<番号> origin/experiment/ui-scaling`
3. 実装する。lane:auto の場合 `.github/pipeline/auto-lane-policy.json` の forbiddenPaths は変更禁止。
   受入条件の実現に触禁ファイルの変更が必要と判明したら、実装を中断して Issue にその旨をコメントし、
   `gh issue edit <番号> --add-label needs-clarification --remove-label lane:auto` して終了する。
4. 検証: `npm run lint` → `npm test` → `npm run e2e` がすべて PASS すること。
   受入条件は Playwright で機械確認する（tests/e2e/ の serve.mjs・seed.mjs を流用した一時スクリプトで可）。
5. スクショ: `node tests/e2e/capture.mjs qa/issue-<番号>` で撮影し、変更に関係するタブの画像を確認する。
6. コミット（Conventional Commits・日本語）: コード → `qa/issue-<番号>/` の順で分けてコミットし push。
   スクショコミットの SHA を控える。
7. PR 作成（ベース experiment/ui-scaling）:
   `gh pr create --base experiment/ui-scaling --label <laneラベル> --title "<type>: <要約> (#<番号>)" --body "<下記書式>"`
   本文書式:
   ```
   Closes #<番号>

   ## 解釈（トリアージより）
   <転記>

   ## 受入条件と検証結果
   - [x] <条件> — <どう機械確認したか>

   ## スクリーンショット
   ![<タブ>](https://raw.githubusercontent.com/kgmk2212/manhour-management/<スクショコミットSHA>/qa/issue-<番号>/<タブ>.png)

   ## 変更概要
   <diff の要約>
   ```
8. 掃除コミット: `git rm -r qa/issue-<番号>` して "chore: QAスクショを削除（squash用）" でコミットし push
   （squash マージ後のツリーに残さないため。raw URL は SHA 固定なので PR 上の画像は表示され続ける）。

## 禁止事項
- マージ・自動マージ設定（ワークフロー側が判断する）／ui-scaling への直接 push
- 受入条件の書き換え・削除／検証 FAIL のまま PR を non-draft にすること（FAILなら draft で作成し本文に FAIL 内容を明記）
````

- [ ] **Step 2: design.md 作成**

````markdown
# 設計レーン指示書（lane:design）

あなたは工数管理システムの設計担当。コードは一切変更しない。

## 手順
1. `gh issue view <番号> --comments` で本文とトリアージ結果を読む。
2. リポジトリを調査し、設計書を `docs/superpowers/specs/<今日の日付>-issue-<番号>-<slug>-design.md` に書く。
   含める: 背景／要求の解釈／データモデルへの影響／UI案／実装方針の選択肢と推奨／受入条件案。
3. UI 変更を伴う場合は `mockups/<slug>/` に静的 HTML モックアップ（1〜3案）と README.md を作る。
4. ブランチ `pipeline/issue-<番号>` で設計書（＋モックアップ）だけをコミットし、
   `gh pr create --base experiment/ui-scaling --label lane:design --title "docs: <要約>の設計書 (#<番号>)"`
   で PR を作成。本文に「実装はこの設計の承認後、別 Issue で」と明記し、`Refs #<番号>`（Closes ではない）。
5. Issue に設計書の要点（選択肢と推奨案）をコメントする。

## 禁止事項
- js/・index.html・style.css の変更（docs/ と mockups/ のみ変更可）
````

- [ ] **Step 3: Commit**

```bash
git add .github/pipeline/prompts/implement.md .github/pipeline/prompts/design.md
git commit -m "feat(pipeline): 実装・設計レーンのプロンプトを追加"
```

### Task 12: implement.yml ワークフロー

**Files:**
- Create: `.github/workflows/implement.yml`

**Interfaces:**
- Consumes: lane ラベル付与イベント（Task 4）、prompts（Task 11）、`AUTO_MERGE_ENABLED` 変数（Task 5）
- Produces: PR（ブランチ `pipeline/issue-<番号>`、lane ラベル付き）。Task 13・15 が参照

- [ ] **Step 1: ワークフロー作成**

```yaml
# lane ラベルが付いたアイデアIssueを実装しPRを作る。lane:design は設計書PRで停止。
# AUTO_MERGE_ENABLED=true かつ lane:auto のときだけ自動マージを予約する（required checks 全緑が条件）。
name: Idea Implement

on:
  issues:
    types: [labeled]

permissions:
  contents: write
  issues: write
  pull-requests: write
  actions: read

concurrency:
  group: implement          # 同時実装は1件（衝突回避）。後続はキュー
  cancel-in-progress: false

jobs:
  implement:
    if: >
      github.event.issue.user.login == github.repository_owner &&
      !github.event.issue.pull_request &&
      (github.event.label.name == 'lane:auto' || github.event.label.name == 'lane:pr' || github.event.label.name == 'lane:design')
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      # PIPELINE_PAT 必須: GITHUB_TOKEN で作った PR は checks（e2e 等）を発火させず、
      # auto-merge 予約もマージ後の deploy を発火させない（再帰防止仕様）。SETUP.md §1.5 参照。
      GH_TOKEN: ${{ secrets.PIPELINE_PAT }}
      ISSUE: ${{ github.event.issue.number }}
      LANE: ${{ github.event.label.name }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: experiment/ui-scaling
          fetch-depth: 0
          token: ${{ secrets.PIPELINE_PAT }}   # push が PAT 経由になり PR の checks が発火する
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
        if: env.LANE != 'lane:design'

      - name: Run implementation
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: ${{ secrets.PIPELINE_PAT }}
          prompt: |
            対象 Issue: #${{ env.ISSUE }}（レーン: ${{ env.LANE }}）
            リポジトリ直下の ${{ env.LANE == 'lane:design' && '.github/pipeline/prompts/design.md' || '.github/pipeline/prompts/implement.md' }} を読み、
            その指示に従って作業してください。
          claude_args: |
            --allowedTools "Read,Grep,Glob,Write,Edit,Bash(git:*),Bash(gh issue:*),Bash(gh pr create:*),Bash(gh pr view:*),Bash(npm:*),Bash(npx playwright:*),Bash(node:*)"

      - name: Gate (auto-merge or notify)
        if: success()
        run: |
          PR=$(gh pr list --head "pipeline/issue-${ISSUE}" --json number -q '.[0].number' || true)
          if [ -z "$PR" ]; then
            echo "PRが見つからない（needs-clarification降格等の正常系もある）"; exit 0
          fi
          if [ "$LANE" = "lane:auto" ] && [ "${{ vars.AUTO_MERGE_ENABLED }}" = "true" ]; then
            gh pr merge "$PR" --squash --auto
            gh issue comment "$ISSUE" --body "🤖 PR #$PR を作成しました。チェック全緑で**自動マージ→自動デプロイ**されます。取り消しは PR クローズ、事後の撤回は \`/revert\` コメント。"
          else
            gh issue comment "$ISSUE" --body "🤖 PR #$PR の準備ができました（レーン: $LANE / 学習期間中）。内容を確認してマージしてください。"
          fi

      - name: Report failure
        if: failure()
        run: |
          gh issue edit "$ISSUE" --add-label verification-failed
          gh issue comment "$ISSUE" --body "⚠️ 自動実装が失敗しました。ログ: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }} — 修正後に lane ラベルを付け直すと再実行されます。"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/implement.yml
git commit -m "feat(pipeline): 自動実装ワークフローを追加（レーン別・学習期間ゲート付き）"
```

### Task 13: revert.yml ワークフロー

**Files:**
- Create: `.github/workflows/revert.yml`

**Interfaces:**
- Consumes: マージ済み PR（ブランチ `pipeline/issue-<番号>`）、`/revert` コメント
- Produces: ui-scaling への revert コミット push（Task 8 により自動デプロイ）

- [ ] **Step 1: ワークフロー作成**

```yaml
# マージ済みPR（または元Issue）への /revert コメントで squash コミットを打ち消して push する即時撤回。
name: Revert

on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  revert:
    if: >
      startsWith(github.event.comment.body, '/revert') &&
      github.event.comment.user.login == github.repository_owner
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      # PIPELINE_PAT 必須: GITHUB_TOKEN の push は deploy.yml を発火させない（再帰防止仕様）
      GH_TOKEN: ${{ secrets.PIPELINE_PAT }}
      NUM: ${{ github.event.issue.number }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: experiment/ui-scaling
          fetch-depth: 0
          token: ${{ secrets.PIPELINE_PAT }}
      - name: Revert merge commit
        run: |
          set -euo pipefail
          if [ "${{ github.event.issue.pull_request != null }}" = "true" ]; then
            PR="$NUM"
          else
            PR=$(gh pr list --head "pipeline/issue-${NUM}" --state merged --json number -q '.[0].number')
          fi
          [ -n "$PR" ] || { gh issue comment "$NUM" --body "⚠️ /revert: マージ済みPRが見つかりません"; exit 1; }
          SHA=$(gh pr view "$PR" --json mergeCommit -q '.mergeCommit.oid')
          [ -n "$SHA" ] || { gh issue comment "$NUM" --body "⚠️ /revert: PR #$PR はマージされていません"; exit 1; }
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git revert --no-edit "$SHA"
          git push origin experiment/ui-scaling
          gh issue comment "$NUM" --body "↩️ PR #$PR（$SHA）を revert して push しました。デプロイは自動で走ります。"
```

- [ ] **Step 2: Commit & Push（Phase C 一括）**

```bash
git add .github/workflows/revert.yml
git commit -m "feat(pipeline): /revert コメントによる即時撤回ワークフローを追加"
git push origin experiment/ui-scaling
bash scripts/pipeline/mirror-workflows-to-main.sh
```

### Task 14: ブランチ保護設定と Phase C 実地検証（dry-run）

**Files:** なし（運用操作）

**Interfaces:**
- Consumes: Task 5〜13 のすべて

- [ ] **Step 1: ブランチ保護を適用**（SETUP.md §4 のコマンドを実行）

Run: SETUP.md §4 の `gh api -X PUT ...` をそのまま実行
Expected: HTTP 200。`gh api repos/kgmk2212/manhour-management/branches/experiment%2Fui-scaling/protection -q .required_status_checks.contexts` が `["e2e","lane-policy-check"]` を返す

- [ ] **Step 2: dry-run Issue 投入**

```bash
gh issue create --repo kgmk2212/manhour-management \
  --title "クイックタブの見出し横に絵文字を追加したい" \
  --body "Phase C dry-run。クイック入力タブの見出しに ⚡ を1つ付けたい（表示のみの小変更）。" \
  --label idea
```

- [ ] **Step 3: パイプラインの通し確認**

Expected（順に確認）:
1. Idea Triage run 成功 → Issue に解釈＋受入条件コメント、`lane:auto` ラベル
2. Idea Implement run 成功 → PR 作成（スクショ埋め込み・`Closes #N`・lane:auto ラベル）
3. PR チェック: `e2e` と `lane-policy-check` が緑
4. 学習期間（AUTO_MERGE_ENABLED=false）なので自動マージされず「準備ができました」コメント
5. 手動で `gh pr merge <PR> --squash` → Issue 自動クローズ → deploy run 起動 → preview 反映
6. Issue に `/revert` コメント → Revert run 成功 → 変更が打ち消される → deploy 再実行

FAIL した工程はログを読み、対応するワークフロー/プロンプトを修正して再実行。**全工程 PASS までこのタスクは完了扱いにしない**

---

# Phase D: 学習期間の計測と運用ドキュメント

### Task 15: 週次レポート（TDD＋ワークフロー）

**Files:**
- Create: `scripts/pipeline/report.mjs`
- Test: `tests/pipeline-report.test.js`
- Create: `.github/workflows/pipeline-report.yml`

**Interfaces:**
- Consumes: `idea` ラベルの Issue 群（gh api で取得した JSON）
- Produces: `buildReport(issues: Array<{number,title,labels:string[],state,prState:string|null}>): string`（Markdown を返す）

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `node --test tests/pipeline-report.test.js`
Expected: FAIL（module not found）

- [ ] **Step 3: 実装**

```js
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
```

- [ ] **Step 4: テスト PASS を確認**

Run: `node --test tests/pipeline-report.test.js`
Expected: 2 pass

- [ ] **Step 5: ワークフロー作成**

```yaml
# 週次でアイデアIssueの処理状況を集計し、pipeline-report ラベル付きIssueとして起票する。
name: Pipeline Report

on:
  schedule:
    - cron: "0 21 * * 5"   # 土曜 6:00 JST
  workflow_dispatch:

permissions:
  contents: read
  issues: write
  pull-requests: read

jobs:
  report:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: experiment/ui-scaling   # 本ワークフローは main 上のミラーから発火するが、スクリプトの正本は ui-scaling
      - name: Build and post report
        run: |
          set -euo pipefail
          SINCE=$(date -u -d "7 days ago" +%Y-%m-%dT%H:%M:%SZ)
          gh issue list --label idea --state all --search "created:>=$SINCE" \
            --json number,title,labels,state \
            -q '[.[] | {number, title, state, labels: [.labels[].name]}]' > issues.json
          node -e '
            const fs = require("fs");
            const issues = JSON.parse(fs.readFileSync("issues.json", "utf8"));
            const { execSync } = require("child_process");
            for (const i of issues) {
              try {
                const pr = JSON.parse(execSync(`gh pr list --head pipeline/issue-${i.number} --state all --json state`, {encoding:"utf8"}));
                i.prState = pr[0] ? pr[0].state.toLowerCase() : null;
              } catch { i.prState = null; }
            }
            fs.writeFileSync("issues.json", JSON.stringify(issues));
          '
          node scripts/pipeline/report.mjs < issues.json > report.md
          gh issue create --label pipeline-report \
            --title "パイプライン週次レポート $(date +%Y-%m-%d)" \
            --body-file report.md
```

- [ ] **Step 6: Commit & Push、手動発火で確認**

```bash
git add scripts/pipeline/report.mjs tests/pipeline-report.test.js .github/workflows/pipeline-report.yml
git commit -m "feat(pipeline): 週次レポート（学習期間の判定一致計測）を追加"
git push origin experiment/ui-scaling
bash scripts/pipeline/mirror-workflows-to-main.sh
gh workflow run "Pipeline Report" --repo kgmk2212/manhour-management --ref main
```
Expected: run 成功、`pipeline-report` ラベルの Issue が作られ表が表示される

### Task 16: 運用ドキュメント整備

**Files:**
- Modify: `CLAUDE.md`（「開発フロー」節の後にパイプライン節を追加）
- Modify: `docs/superpowers/specs/2026-08-19-idea-pipeline-design.md`（オーナーガード追記）

**Interfaces:**
- Consumes: 全タスクの成果物

- [ ] **Step 1: CLAUDE.md にパイプライン節を追加**（「並列セッション統合機構」節の直後）

```markdown
### アイデア自動実装パイプライン

「💡 アイデア」Issue を起点に triage→implement→PR→（解禁後）自動マージ→デプロイが自動で走る。
- 設計: `docs/superpowers/specs/2026-08-19-idea-pipeline-design.md` ／ セットアップ・解禁手順: `docs/pipeline/SETUP.md`
- 判定基準の調整は `.github/pipeline/prompts/*.md` と `auto-lane-policy.json` を編集
- パイプラインが作る PR（`pipeline/issue-*`）と対話セッションは並行しうる。**対話セッションで
  ui-scaling に push する前に `git pull --rebase`** を徹底する
- 撤回はマージ済み PR か元 Issue に `/revert` コメント
```

- [ ] **Step 2: 仕様書 §4.2 にオーナーガードを追記**

triage.yml のトリガー説明に「発火条件に Issue 作成者＝リポジトリオーナーを含む（公開リポで第三者の Issue により Claude が起動しないため）」の1文を追加する。

- [ ] **Step 3: Commit & Push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-19-idea-pipeline-design.md
git commit -m "docs(pipeline): 運用ガイドをCLAUDE.mdに追加、仕様書にオーナーガードを追記"
git push origin experiment/ui-scaling
```

---

## Self-Review 結果（作成時に実施済み）

- **Spec coverage**: 仕様書 §4.1〜4.9・§6・§7 の全要素にタスクあり（§4.6 自動マージ=Task 12 Gate step、§4.9 解禁基準=Task 15 レポート脚注＋SETUP.md §5）。「解禁の実施」自体は数週間後の運用のため SETUP.md §5 に手順として残置
- **Placeholder scan**: 全コードブロック実内容。プロンプト2本・ワークフロー6本・スクリプト4本すべて全文掲載
- **Type consistency**: ラベル名 7 種（Task 1）／ブランチ `pipeline/issue-<番号>`（Task 11・12・13・15）／check 名 `e2e`・`lane-policy-check`（Task 7・10・SETUP.md §4）／`findViolations`・`buildReport` のシグネチャ一致を確認
```
