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
