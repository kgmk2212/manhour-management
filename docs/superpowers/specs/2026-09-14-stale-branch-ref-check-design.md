# 退避済みブランチ名 残存チェック 設計書

- 作成: 2026-09-14
- 状態: 導入済み・期間限定運用中
- 関連: `docs/superpowers/specs/2026-09-14-main-ui-scaling-unification.md`（本チェックの導入理由となった移行作業）

---

## 1. 背景

`main`/`experiment/ui-scaling` の統合作業で、`experiment/ui-scaling` という文字列を直書きしていた
箇所を手作業で洗い出して修正した（ワークフロー7ファイル・設定2ファイル・パイプラインprompt2ファイル・
セットアップ手順書2ファイル）。手作業での洗い出しは**見落としがあり得る**ため、機械的に検査する
仕組みを用意し、しばらく運用して見落としを拾う。

## 2. やること・やらないこと

### やること
- git管理下のファイルのうち、**自動化サーフェス**（実行時に参照され続けて壊れる可能性がある場所）
  に退避済みブランチ名が残っていないかをCIで検査する
- 対象: `.github/workflows/`, `.github/pipeline/`, `scripts/`, `.claude-worktree.json`
- 検査対象の名前一覧は `.github/retired-branches.json` に集約し、今後別のブランチが退避されたら
  ここにエントリを追加するだけで検査対象になる

### やらないこと（スコープ外・重要）
- **`docs/` や `mockups/` 配下は対象外**。これらは設計判断の履歴を記録する資料であり、
  「過去にそのブランチ名を使っていた」という記述自体は正しい歴史的事実なので、検査すると
  誤検知になる。プレフィックスで機械的に除外している
- **ユーザーのローカルマシンは検査できない**。このチェックはリポジトリにpushされた内容に対して
  GitHub Actions上で走るものであり、ローカルのworktree構成・シェルの環境変数・IDE設定などは
  対象範囲外。ローカル環境の後片付けは `docs/superpowers/specs/2026-09-14-main-ui-scaling-unification.md`
  の「ローカル環境への影響」を参照し、手動で確認する

## 3. 実装

- `scripts/check-stale-branch-refs.mjs`: `git ls-files` で追跡ファイル一覧を取得し、
  自動化サーフェスに絞ってから退避済み名を検索する。純粋関数 `findStaleRefs` / `isIncludedPath` を
  export し、`tests/stale-branch-refs.test.js` で単体テストする（`check-lane-policy.mjs` と同じ流儀）
- `ci.yml` の `checks` ジョブ（依存ゼロ）に追加。lint と違い npm 依存が無いため、この位置が適切
- 設定: `.github/retired-branches.json`

## 4. 運用期間

目安1ヶ月（〜2026-10-14頃）。以下を満たしたら役目を終えたと判断し、`ci.yml` からステップを削除、
`scripts/check-stale-branch-refs.mjs` / `tests/stale-branch-refs.test.js` / `.github/retired-branches.json`
を削除してよい:

- この期間中、実際に検知した違反が0件（＝手作業の洗い出しが漏れなく完了していたことの確認が取れた）
- 新たなブランチの退避・リネームの予定がない

逆に運用中に1件でも検知した場合は、その修正を反映した上で運用期間を延長し、
「他にも見落としがないか」を再度手動で見直すこと。
