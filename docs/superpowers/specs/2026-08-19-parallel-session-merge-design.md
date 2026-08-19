# 並列セッション統合機構「parallel-mode」設計書

- 日付: 2026-08-19
- ステータス: レビュー待ち
- 対象ライン: `experiment/ui-scaling`（現行の正系開発ライン）
- 関連: `CLAUDE.md`（開発フロー）、`.shared/hooks/inject-dev-flow.py`、memory `worktree-commands-junction` / `branch-strategy-current`

---

## 1. 背景と課題

現状、複数の Claude Code セッションが **同一 worktree（`experiment-ui-scaling`）・同一ブランチを共有**して並列作業しており、防御策は「自分が編集したファイルのみ明示ステージ（`git add <file>`、`-A` 禁止）」という規約のみである。

この形には規約では防げない問題が残る。

1. **静かな混入**: 2セッションが同じファイルに触ると、git のマージ以前にワーキングツリー上で編集が上書き・混入する。マージコンフリクトと違い検出されない。
2. **ホットスポット構造**: `style.css`（8,810行）、`js/ui.js`（4,316行）、`index.html`（3,448行）に UI 系タスクのほぼすべてが触るため、「たまたま別ファイル」が成立しにくい。
3. **マージが発生しない**: 同一ブランチのため git の並列統合機構（ブランチ・マージ・コンフリクト検出）が一切働かない。

## 2. 要件

| # | 要件 | 由来 |
|---|------|------|
| R1 | 並列作業が**マージとして安全に統合**される（静かな混入をゼロにする） | ユーザー指示「複数セッションで同時並列作業を行っても問題なくマージできるように」 |
| R2 | **ユーザーの操作フローを一切変えない**（今まで通り ui-scaling のフォルダでセッションを開いて依頼するだけ） | ユーザー指示「不便になるのは避けたい」 |
| R3 | **簡単に元に戻せる**（ワンアクションのキルスイッチ + 完全撤去手順） | ユーザー指示「簡単に元に戻せるようにしたうえでやってほしい」 |
| R4 | アプリコード（index.html / style.css / js/）には一切触れない | R3 の帰結（戻す対象を運用ファイルだけに限定する） |

## 3. 方式概要

**「1セッション = 1 worktree = 1短命 feature ブランチ」**を徹底し、統合を ff-only マージで直列化する。

```
ユーザー: ui-scaling フォルダでセッション起動 → 依頼（今まで通り）
セッション:
  /start-work <topic>   … feature/<topic> ブランチ + 専用 worktree を作り、そこへ移動
  （実装・コミット）     … 隔離された worktree 内で通常の開発フロー
  /integrate            … rebase → /verify-ui → ff-only マージ → push → /deploy → 掃除
```

モード切替は**フラグファイル1つ**で行う: `.shared/hooks/parallel-mode.on` が
- **無い** → hook は現行の開発フロー文言を**逐語（byte 同一）**で注入 = 現行運用そのまま
- **有る** → parallel-mode 版の開発フロー文言を注入

## 4. コンポーネント

### 4.1 `/start-work <topic>`（新規: `.shared/commands/start-work.md`）

コード修正タスクの開始時にセッション自身が実行する。

1. `experiment/ui-scaling` の最新 HEAD から `feature/<topic>` ブランチを作成
2. worktree を `D:/CCwork/.manhour-management-worktrees/feature-<topic>` に作成（既存命名規約に一致）
3. `.claude/settings.json` をコピーし、`.claude/commands` → `.shared\commands` のジャンクションを作成（memory `worktree-commands-junction` の作法）
4. セッションは以後その worktree で作業する（作業ディレクトリを移動）

エッジケース: 同名 worktree/ブランチが既に存在する場合は連番サフィックスを付与。

### 4.2 `/integrate`（新規: `.shared/commands/integrate.md`）

作業完了時にセッション自身が実行する。**verify を通らない変更は本線に入らない**構造にする。

1. 未コミット分をコミット（自分が編集したファイルのみ明示ステージ — 現行規約を継承）
2. `experiment/ui-scaling` の最新へ rebase（コンフリクトは文脈を持つ当該セッションが解消）
3. feature worktree 内で `/verify-ui` を実行し PASS を確認（rebase 後の状態で検証する点が重要）
4. ui-scaling worktree で `git merge --ff-only feature/<topic>` を実行
   - ref とワーキングツリーが同時に更新される（`git push .` による ref 直接更新は checked-out worktree が stale になるため使わない）
   - ff-only が失敗 = 他セッションが先に統合 → 手順2へ戻って再 rebase・再検証・再試行（統合の直列化）
5. `experiment/ui-scaling` を `origin` へ push し、`/deploy` を実行（main 空コミットで Pages デプロイ発火 — 現行フローを継承）。feature ブランチ自体は origin へ push しない（短命・ローカル完結）
6. 掃除: feature worktree を remove、feature ブランチを削除。残存している他の `feature-*` worktree があれば一覧と経過日数を報告（掃除漏れ検出）

失敗時の安全性: verify 失敗・rebase 中断のときは統合を中止し、feature ブランチと worktree はそのまま残す（本線は汚れない）。ui-scaling worktree が dirty で merge できない場合は**自動で reset せず**状況を報告して停止する。

### 4.3 hook 分岐（改修: `.shared/hooks/inject-dev-flow.py`）

- 改修前に原本を `.shared/hooks/inject-dev-flow.py.orig-20260819` として保存する（**`.shared` は git 管理外**であることを確認済みのため、git ではなくファイルコピーでバックアップ）
- フラグ無し時の注入文言は現行 `FLOW_TEXT` と **byte 同一**を保証（検証計画 §7 で機械確認）
- フラグ有り時は parallel-mode 版文言を注入。骨子:
  - コード修正を伴うタスクは着手前に `/start-work` で隔離し、完了時に `/integrate` で統合する
  - 質問・調査・ドキュメントのみのタスクは隔離不要
  - ui-scaling 系の作業ディレクトリでのみ適用（hook が CWD を判定。redesign 等の他ラインには現行文言を注入）
  - verify-ui PASS まで完了と報告しない・明示ステージ、の現行規律は維持
- 現行と同じ安全設計を維持: 失敗時は無音 no-op で exit 0、`ensure_ascii=True`

### 4.4 `/parallel-mode on|off|status`（新規: `.shared/commands/parallel-mode.md`）

フラグファイルの作成・削除・状態表示のみを行う最小トグル。`off` が即時キルスイッチ（次のプロンプトから現行運用の文言に戻る）。

### 4.5 `CLAUDE.md` 追記（git 管理内）

「開発フロー」節に parallel-mode の運用（両モードの説明・切替方法・戻し方）を追記する。git 管理内なので `git revert` で戻せる。

## 5. 運用ルールの変更点

- **ui-scaling worktree では直接編集しない**（統合専用にする）。parallel-mode ON 中の唯一の運用変更。
- ユーザーの操作は変わらない: 今まで通り ui-scaling のフォルダでセッションを開いて依頼するだけ。隔離・統合・掃除はセッションが hook の注入指示に従って自動で行う（R2）。
- ユーザー自身がブラウザで動作確認する対象は「統合後の ui-scaling」= 確認場所は今まで通り1箇所。作業中の検証スクショはセッションが /verify-ui で提示する。

## 6. 元に戻す手順（R3）

| レベル | 操作 | 効果 |
|--------|------|------|
| 即時キルスイッチ | `/parallel-mode off`（= フラグファイル削除1つ） | 次のプロンプトから全セッションが現行運用の文言（byte 同一）に戻る |
| 完全撤去 | フラグ削除 + commands 3ファイル削除 + hook を `.orig-20260819` から復元 + CLAUDE.md 追記を revert | 導入前の状態に完全復帰。アプリコードは無変更（R4）のため影響ゼロ |
| 進行中作業の回収 | 各 feature ブランチを `/integrate` で統合してから戻す。破棄する場合は `git worktree remove` + `git branch -D` | 作業の取りこぼしなし |

## 7. 検証計画（実装後のリハーサル）

1. **byte 同一性**: フラグ OFF 状態で hook を実行し、出力 JSON が現行版と完全一致することを diff で機械確認
2. **並列統合（別ファイル）**: 模擬タスク2件を start-work → integrate で通し、両方が ff で統合されること
3. **並列統合（同一ファイル）**: 同一ファイルを編集する2件で、後発が rebase コンフリクト解消 → verify → 統合まで自動で回ること
4. **キルスイッチ**: `/parallel-mode off` 後の hook 出力が現行版と一致すること
5. リハーサル中の模擬コミットは統合後に revert し、本線に痕跡を残さない

## 8. 段階導入

- **Phase 1**: コマンド3件 + hook 改修 + フラグを **OFF のまま**配置（この時点で挙動変化ゼロ）
- **Phase 2**: リハーサル（§7）を実施し PASS を確認
- **Phase 3**: 既存セッションが区切りを迎えたタイミングでフラグ ON（ON 前に開始したセッションは旧指示のまま動くため、切替は区切りで行う）

## 9. 非対象（YAGNI）

- `style.css` の機能別分割 — 効果は大きいが、進行中の全ブランチ（feature/backup-json-merge 等）と衝突するため、統合が落ち着いたタイミングの**別タスク**とする
- マージキューの完全自動化（常駐統合エージェント）— ff-only 直列化で十分
- `experiment/redesign` / `experiment/sandbox` 等の他ライン — 対象外（現行文言を維持）

## 10. 未確認事項（実装時に確認）

- redesign 等の他 worktree の `.claude/settings.json` が同じ hook を参照しているか（参照している場合も CWD 判定により現行文言が注入されるため挙動は変わらないが、確認の上で実装する）
