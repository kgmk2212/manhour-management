# main / experiment/ui-scaling 統合記録

- 作成: 2026-09-14
- 状態: 実施済み
- 対象: ブランチ構成そのもの（機能実装ではない）

---

## 1. 背景

`main` は `deploy: trigger Pages rebuild` の空コミット中心で、アプリ本体の開発実体は
`experiment/ui-scaling` 側にあるという状態が長く続いていた（CLAUDE.md に何度も追記される形で
運用でカバーしていた）。この二重構造自体が混乱の元だったため、統合することにした。

## 2. 決定事項

1. 旧 `main`（ほぼ空コミットのみ）を `archive/main` ブランチとして退避（履歴を残す）
2. `experiment/ui-scaling` を GitHub 上で `main` にリネームし、本線を一本化

作業はユーザーがGitHub Settingsで実施（デフォルトブランチの一時変更 → 旧`main`削除 → リネーム）。

## 3. 影響範囲と対応

### GitHub Pages配信への影響: なし
`deploy.yml` は `actions/deploy-pages@v4`（GitHub Actions配信）方式で、チェックアウト先も
`ref: main` とハードコードされているため、デフォルトブランチ設定やブランチリネームの影響を
受けない。またリネーム自体は `push` イベントではないため、リネーム直後に自動再デプロイもされない
（次に `main` へ実際に push されたタイミングで、新しい内容がルートに反映される）。

### PR#8（`experiment/ui-scaling` → `main` の同期PR）
head を `experiment/ui-scaling`、base を `main` とするPRだったため、リネームにより
head/baseが同一ブランチに収束し、GitHub側で自動クローズされた。対応不要。

### ブランチ名を直接埋め込んでいた箇所（要修正・修正済み）

以下、`experiment/ui-scaling` という文字列をハードコードしていたため、リネームだけでは
追従せず壊れる状態だった。すべて `main` に置き換え済み。

| ファイル | 内容 |
|---|---|
| `.claude-worktree.json` | `mainBranches` — worktree隔離ガード(hook)の対象ブランチ |
| `scripts/worktree.sh` | `MAINLINE_BRANCH` のデフォルト値 |
| `.github/workflows/e2e.yml` | pushトリガー |
| `.github/workflows/test.yml` | pushトリガー |
| `.github/workflows/ci.yml` | pushトリガー（`main`と重複列挙されていたため削除） |
| `.github/workflows/implement.yml` | checkout ref・base判定 |
| `.github/workflows/triage.yml` | checkout ref |
| `.github/workflows/revert.yml` | checkout ref・base判定・push先 |
| `.github/workflows/pipeline-report.yml` | checkout ref |
| `.github/pipeline/prompts/implement.md` | パイプラインAIへの指示文中のブランチ名 |
| `.github/pipeline/prompts/design.md` | 同上 |
| `docs/pipeline/SETUP.md` | ブランチ保護対象・ミラー手順の記述 |
| `docs/pipeline/MIGRATION_CHECKLIST.md` | 会社Org移管時の確認事項（将来使う想定の生きた手順書） |
| `CLAUDE.md` | ブランチ戦略・worktree構成・開発フロー全般 |

### 廃止した仕組み: `scripts/pipeline/mirror-workflows-to-main.sh`

issues/issue_comment/schedule トリガーのワークフロー（`triage.yml`/`implement.yml`/`revert.yml`/
`pipeline-report.yml`）は **default branchのワークフローしか発火しない**という GitHub Actions の
仕様があり、旧構成では「正本は`experiment/ui-scaling`・defaultは`main`」とズレていたため、
変更のたびに正本からmainへコピーするスクリプトが必要だった。

統合により正本とdefault branchが同じ`main`になったため、このミラー機構は完全に不要になった。
スクリプト本体は削除済み。今後はワークフローを変更したら通常どおり`main`に直接pushすればよい。

### ローカル環境への影響（クラウドセッションでは対応不可・ユーザー側対応が必要）

- `origin/main` の中身が完全に別物（旧ui-scalingの内容）に置き換わったため、ローカルの`main`
  worktreeは `git fetch && git reset --hard origin/main` が必要（fast-forwardできないため）
- 旧`manhour-ui-scaling` worktree（`experiment/ui-scaling`追跡）は追跡先ブランチが消滅したため
  `git worktree remove` で削除し、ローカルブランチも削除する

## 4. 再発防止（運用中）

同種の「特定ブランチ名をコードに直書きしていたせいで、リネーム時に見落として壊れる」を
今後検出するため、`scripts/check-stale-branch-refs.mjs` によるCIチェックを導入し、
一定期間（目安1ヶ月）運用する。設計は `docs/superpowers/specs/2026-09-14-stale-branch-ref-check-design.md`
を参照。

**注意**: このチェックはgit管理下のファイルのみが対象。ユーザーのローカルマシンの環境・
worktree構成・シェル設定等はクラウドセッションからは検査できないため、上記「ローカル環境への影響」
は引き続き手動確認が必要。
