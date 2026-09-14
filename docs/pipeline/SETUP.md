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
（対話セッションからの main 直接 push を塞がないため）。
```bash
gh api -X PUT "repos/kgmk2212/manhour-management/branches/main/protection" \
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

解禁前チェック: 週次レポートの「判定不一致」が計測されていること／implement.yml の Gate に
信頼側ポリシー再検査が入っていること（PR 側チェック無効化への対抗）。

## 6. ワークフローの main ミラー（2026-09-14 廃止）
issues / issue_comment / schedule トリガーは **default branch（main）上のワークフローしか発火しない**。
以前は正本の `experiment/ui-scaling` から default branch だった `main`（デプロイ起点のみ・開発実体なし）へ
`triage.yml` / `implement.yml` / `revert.yml` / `pipeline-report.yml` を都度コピーする
`scripts/pipeline/mirror-workflows-to-main.sh` が必要だった。

2026-09-14、`main`（旧: ほぼ空コミットのみ）を `archive/main` へ退避し、`experiment/ui-scaling` を
`main` にリネームして一本化したため、**正本と default branch が同じブランチになり、ミラー自体が不要になった**。
上記スクリプトは削除済み。ワークフローを変更したら通常どおり `main` に直接 push すれば発火する。
