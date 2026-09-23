# 工数管理システム - 開発ガイド

> **重要**: このファイルはClaude Codeが参照する開発ガイドです。
> 作業開始前に必ずブランチを確認してください。

> **📁 ローカルのみのドキュメントについて（2026-09-14〜）**
> 本リポジトリは PUBLIC です。以下は `.gitignore` で追跡から外しており、**ローカルには実体があるが
> リモートには存在しません**。本ガイド中でこれらを参照している箇所には「(ローカルのみ)」と付記しています。
> クローンし直した環境では読めないので注意してください。
>
> `docs/superpowers/`（AI向け実装計画・設計書）／ `docs/architecture-consulting.md`（勤務先の内部方針を含む）／
> `SECURITY_AUDIT_REPORT.md`・`SECURITY_AUDIT_PROMPT.md`・`docs/RISK_ANALYSIS.md`（脆弱性・公開リスクの記述）／
> `IMPROVEMENT_PLAN.md`・`PHASE3_IMPLEMENTATION.md`・`CODEBASE_STRUCTURE.md`（陳腐化した旧計画）／
> `llm-analysis/data/`（実験ログ）
>
> 除外理由は `.gitignore` 内に1件ずつ記載。**新たにドキュメントを足すときは「公開リポジトリに
> 置いてよいか」を必ず判断すること**（勤務先の内部事情・脆弱性の所在・個人環境のパスは置かない）。
>
> **重要**: `js/` のコメント・`style.css`・`tests/`・`mockups/*/README.md` などにも
> `docs/superpowers/specs/...` を指す参照が約25箇所ある。**リポジトリ内のあらゆる
> `docs/superpowers/...` への言及はローカル専用パスを指す**と解釈すること（個別注記はしていない）。
> リモートには存在しないので、クローン環境でこれらを開こうとしても見つからない。

---

## ブランチ戦略

### 現在のブランチ構成

| ブランチ | 用途 | 作業内容 |
|----------|------|----------|
| `main` | **本線（統合専用・デプロイ起点）** | 機能開発・改善はここに集約。merge-core(差分/選択マージ)・CI・AI分析・Excel追加読み込み等の最新を含む。**直接編集はしない**。修正は `feature/<topic>` の隔離 worktree で行い、`scripts/worktree.sh finish` で統合する。push すると deploy.yml でルート配信される |
| `experiment/redesign` | リデザイン実験 | UI/UXの全面的なリデザイン（frontend-designスキル必須）。ブランチのみ存在、worktree は必要になったら作る |
| `experiment/sandbox` | 実験用 | 自由に試行錯誤（破壊的変更OK）。ブランチのみ存在、worktree は必要になったら作る |
| `experiment/llm-analysis` | main(旧ui-scaling) からの派生（2026-05-23〜） | Excel取り込みのデータ処理fix群。fixは本線に機能統合済みのため実質役目終了。ブランチのみ存在 |

> **注**: `feature/gantt-chart` は 2026-01-31 に main へマージ済み。`experiment/design-rebuild` は未使用のため削除済み。
> **注（2026-09-14〜）**: 旧`main`（`deploy: trigger Pages rebuild` の空コミット中心で開発実体が無かったブランチ）を
> `archive/main` へ退避し、実開発の本線だった `experiment/ui-scaling` を `main` にリネームして一本化した。
> **「本線＝main」に統一済み**（旧`experiment/ui-scaling`という名前は存在しない）。旧mainの履歴は`archive/main`で参照可能。
> 移行時の影響範囲・対応記録は `docs/superpowers/specs/2026-09-14-main-ui-scaling-unification.md`(ローカルのみ) を参照。

### Worktree構成

実在する worktree は1つだけ（他の experiment/\* はブランチのみ存在し、worktree は必要になったら `git worktree add` で作る）。

| ディレクトリ | ブランチ | 用途 |
|-------------|---------|------|
| `manhour-management` | `main` | 本線。**主 worktree**（`.git` の実体を持つ）。統合専用（直接編集しない） |
| `.manhour-worktrees/feature-<topic>` | `feature/<topic>` | 修正1件ごとの一時 worktree。`scripts/worktree.sh` が作成・削除まで自動で行う |

> **注（2026-09-24 片付け済み）**: 旧`manhour-ui-scaling` worktree（`experiment/ui-scaling`追跡）は廃止・撤去済み。
> そこにだけあったローカル専用資料（`docs/superpowers/` ほか冒頭の一覧）・`session-log/`・`node_modules/` は
> **すべて `manhour-management` に移設**した。ローカル専用資料を探すときは `manhour-management` 側を見ること。
> フォルダ本体は macOS のゴミ箱へ退避、ローカルの`experiment/ui-scaling`ブランチも削除済み（中身は`main`に統合済み）。

> **⚠️ worktree 削除の注意**: `.claude/commands` が symlink の場合は、削除前に必ず
> `rm -f <worktree>/.claude/commands` でリンクだけ先に外す（実体を辿って消してしまうため）。
> `scripts/worktree.sh` の `finish`/`drop` は自動でこれを判定・実行する。
> （旧・Windows前提の `cmd /c rmdir` 手順は撤去。経緯は
> `docs/superpowers/specs/2026-09-14-always-worktree-workflow-design.md`(ローカルのみ) を参照）

### 作業前の確認事項

```bash
git branch --show-current              # main なら「まだ隔離していない」
bash scripts/worktree.sh list          # 前回の統合忘れ・掃除漏れがないか
```

現在地が `manhour-management`（`main`）でコード修正を頼まれたら、**編集を始める前に**
`bash scripts/worktree.sh start <topic>` を実行する（下記「開発フロー」手順0）。

### どちらのブランチで作業するか

| ユーザーの依頼内容 | 作業ブランチ |
|-------------------|--------------|
| バグ修正、表示の微調整 | `main` |
| 既存機能（見積・実績・レポート・スケジュール）の改善 | `main` |
| UI/UXのリデザイン | `experiment/redesign` |
| 実験的な変更、新しいアイデアの試行 | `experiment/sandbox` |

**判断に迷う場合**: ユーザーに確認してください。

---

## experiment/redesign ブランチでの開発

`experiment/redesign` ブランチはUI/UXの全面的なリデザインを行うブランチです。

### リデザインブランチのルール

- **frontend-designスキル必須**: コード変更を伴うすべての作業で `frontend-design` スキルを使用する（バグ修正・機能追加・リファクタリング含む）
- **制約なし**: どのファイルでも自由に編集可能
- **破壊的変更OK**: 大胆なリファクタリングや設計変更を試せる
- **自動デプロイ**: ブランチを push すれば deploy.yml（`experiment/**` トリガ・全 experiment ブランチを動的に `/preview/<名前>/` へ展開）が自動配信する。一覧ページ: `https://kgmk2212.github.io/manhour-management/preview/`。⚠️ push トリガは「push したブランチ側の deploy.yml」で動くため、このブランチが 2026-08-20 版 deploy.yml を取り込むまでは従来どおり main 空コミットか `gh workflow run deploy.yml` で発火させる
- **mainへのマージ禁止**: ユーザーの明示的な指示がない限り、redesignの変更をmainにマージしない

---

## experiment/sandbox ブランチでの開発

`experiment/sandbox` ブランチは自由な試行錯誤のための場所です。

### 実験ブランチのルール

- **制約なし**: どのファイルでも自由に編集可能
- **破壊的変更OK**: 大胆なリファクタリングや設計変更を試せる
- **失敗を恐れない**: うまくいかなければブランチごと破棄できる
- **frontend-designスキル必須**: デザイン変更時は必ず `frontend-design` スキルを使用し、Quiet Depthコンセプトに調和するデザインで実装する
- **自動デプロイ**: ブランチを push すれば deploy.yml（`experiment/**` トリガ・全 experiment ブランチを動的に `/preview/<名前>/` へ展開）が自動配信する。一覧ページ: `https://kgmk2212.github.io/manhour-management/preview/`。⚠️ push トリガは「push したブランチ側の deploy.yml」で動くため、このブランチが 2026-08-20 版 deploy.yml を取り込むまでは従来どおり main 空コミットか `gh workflow run deploy.yml` で発火させる
- **mainへのマージ禁止**: ユーザーの明示的な指示がない限り、sandboxの変更をmainにマージしない

### 実験が成功したら

ユーザーに報告し、`main` へのマージ方法を相談してください。

### 実験を破棄する場合

```bash
git worktree remove ../manhour-experiment
git branch -D experiment/sandbox
```

---

## プロジェクト構造

```
/
├── index.html          # メインHTML
├── style.css           # スタイルシート
├── js/                 # JavaScriptモジュール（43ファイル・約42,000行）
│   ├── state.js        # グローバル状態管理
│   ├── storage.js      # localStorage操作
│   ├── constants.js    # 定数定義
│   ├── init.js         # 初期化処理（window への公開もここに集約）
│   ├── estimate*.js    # 見積管理
│   ├── actual*.js      # 実績管理（actual-timeline.js はタイムライン表示）
│   ├── report*.js      # レポート・分析
│   ├── schedule*.js    # スケジュール・ガント
│   └── ...             # 全ファイルの一覧は docs/CODEMAP.md（自動生成）
├── scripts/            # 開発用スクリプト
│   ├── codemap.mjs     # docs/CODEMAP.md 生成器
│   └── pipeline/       # アイデア自動実装パイプライン用
├── tests/              # 特性テスト（node --test）・e2e（Playwright）
├── docs/               # 設計ドキュメント
│   ├── CODEMAP.md                    # 関数・要素IDの索引（自動生成）
│   ├── GANTT_CHART_SPEC.md           # ガントチャート仕様書
│   ├── GANTT_CHART_DESIGN.md         # 詳細設計書
│   └── GANTT_CHART_IMPLEMENTATION_PLAN.md  # 実装計画
├── mockups/            # デザインモックアップ（機能別サブフォルダ）
│   ├── mobile-backup-access/  # モバイル版バックアップ復元アクセス改善
│   └── timeline-actuals/      # タイムライン実績入力（D&D）
└── CLAUDE.md           # このファイル
```

---

## 技術スタック

- **フレームワーク**: なし（純粋なHTML/CSS/JavaScript）
- **モジュール**: ES Modules
- **データ保存**: localStorage
- **外部ライブラリ**: SheetJS (xlsx.mjs), japanese-holidays.js ※すべてローカルバンドル（CDN不使用）

---

## 開発フロー（隔離 → 検証 → 統合）

> **絶対ルール**: `manhour-management`（`main`）を直接編集しない。統合専用ディレクトリとする。
> `js/` / `index.html` / `style.css` / `tests/` を伴う修正タスクは、1件ごとに必ず専用 worktree に隔離する。
> 質問・調査のみ、`docs/` のみの更新は隔離不要。判断に迷ったら隔離する（隔離のコストはほぼゼロ、衝突のコストは大きい）。

0. **隔離（着手前に必ず実行）**:
   ```bash
   bash scripts/worktree.sh start <topic>   # 出力されたパスが以後の作業ディレクトリ
   ```
   以後このタスクの Read/Edit/Write・テスト・検証は**すべてそのパス配下**で行う。
   `start` は本線の `node_modules` を symlink で共有する（`finish` の e2e 用）。本線に無ければ先に本線で `npm install`。
1. **実装**: 隔離 worktree 内で実装し、自分が編集したファイルのみ明示ステージしてコミットする
   （`git add <file>...`、`-A` 禁止）。
2. **実動作検証**: Playwright（`npm run e2e`、`tests/e2e/` 配下）で修正が効いていることを機械判定で確認する。検証が PASS するまで「完了」と報告しない。
3. **統合**:
   ```bash
   bash scripts/worktree.sh finish
   ```
   rebase → `npm run e2e` → ff-only マージ → push（`deploy.yml` の `main` トリガで Pages 再デプロイ発火・ルート配信）→ worktree 削除まで自動実行する。途中でユーザーに確認を求めない。
   rebase がコンフリクトで停止した場合は、自タスクと本線側の意図を両立する形で解消し
   `git rebase --continue` 後に `finish` を再実行する。両立の判断がつかなければ
   `git rebase --abort` してユーザーに報告し停止する（勝手にどちらかを捨てない）。

**掃除漏れの確認**: `bash scripts/worktree.sh list`

> 経緯: 以前は `.shared/hooks/parallel-mode.on` というフラグ有無で「隔離するかどうか」を
> 切り替える設計だったが、`.shared/` 自体がWindows時代の設計でgit管理外だったため、
> macOS移行時に実体ごと消失していた（フラグは無いのに条件分岐の記述だけが残り、
> 「フラグ無し→在来フロー→直接編集」に読めてしまっていた）。運用の要をgit管理下の
> `scripts/worktree.sh` に置き、条件分岐を無くして常時隔離に一本化したのが現行版。
> 詳細: `docs/superpowers/specs/2026-09-14-always-worktree-workflow-design.md`(ローカルのみ)。

> **hookによる強制（2026-09-14〜）**: 上記は文書化しただけでは「AIエージェントが読み飛ばす/
> 忘れる」リスクが残るため、`~/.claude/hooks/worktree-guard.py`（全プロジェクト共通）が
> PreToolUse hookとしてEdit/Write/NotebookEditの直前に発火し、`main`
> ブランチ上で `js/` / `index.html` / `style.css` / `tests/` / `scripts/` を直接編集しようと
> すると**ハーネスレベルで強制的にブロック**する（設定: リポジトリ直下の
> `.claude-worktree.json`）。例外的に直接編集が必要な場合のみ、リポジトリ直下に
> `.claude-worktree-bypass` ファイルを作成する（ユーザーの明示的な許可がある場合のみ。
> gitignore済み）。この仕組みは他プロジェクトにも同じ `worktree-guard.py` を使って
> `.claude-worktree.json` を置くだけで導入できる（プロジェクト固有のスクリプトは不要）。

---

## デザイン判断の方針（2026-09-17〜）

**配色・アイコン・見た目の調整など「デザイン判断」を伴うタスクは、実装者本人ではなく
上位モデル（Opus）に Agent ツール経由でやらせる。** 実装（ファイル編集・テスト・
worktree統合・push）は通常どおり進めてよいが、色や形など「見た目をどう決めるか」の
判断部分は Opus に委ねる。

理由: 2026-09-17、favicon/apple-touch-iconをテーマカラーに追従させる際、
実装モデル（Sonnet）が「アンバーの差し色を廃止し2色構成に統一する」という
デザイン判断を自己判断で行い、ユーザーの意図（背景色だけを変えたい・既存の
グラフィック配色は保持したい）と食い違う結果になった。

運用: Agent ツールで `model: "opus"` を指定してデザイン判断を依頼し、
決定した配色・仕様を実装（Sonnet可）に引き継ぐ。判断に迷うデザイン変更は
実装前にこの手順を踏むこと。

---

## アイデア自動実装パイプライン

「💡 アイデア」Issue を起点に triage→implement→PR→（解禁後）自動マージ→デプロイが自動で走る。

- 設計: `docs/superpowers/specs/2026-08-19-idea-pipeline-design.md`(ローカルのみ) ／ セットアップ・解禁手順: `docs/pipeline/SETUP.md`
- 判定基準の調整は `.github/pipeline/prompts/*.md` と `auto-lane-policy.json` を編集
- パイプラインが作る PR（`pipeline/issue-*`）と対話セッションは並行しうる。**対話セッションで
  main に push する前に `git pull --rebase`** を徹底する
- 撤回はマージ済み PR か元 Issue に `/revert` コメント

---

## コーディング規約

- `js/constants.js` の定数を使用（マジックナンバー禁止）
- 新しい状態変数は `js/state.js` に追加
- JSDocコメントを関数に付与
- 既存のコードスタイルに合わせる

---

## コードマップ（探索コストの削減）

`docs/CODEMAP.md` は js/・index.html の「どこに何があるか」の索引（`名前:行番号` 形式）。
**自動生成物なので手で編集しない。**

| 項目 | 内容 |
|------|------|
| 使い方 | 関数・要素IDを探すときは、`js/` を総当たり Grep する**前に** CODEMAP.md を Grep する。当たった行番号をそのまま `Read` の `offset` に渡せば該当箇所だけ読める |
| 再生成 | `node scripts/codemap.mjs`（`js/**.js`・`index.html`・`style.css` の編集時は PostToolUse hook が自動実行） |
| 鮮度保証 | CI の `checks` ジョブが `node scripts/codemap.mjs --check` で検査。ずれていれば赤くなる |
| マージ | `.gitattributes` の `merge=codemap` で、衝突時は本線側を採用（生成物なので人が選ぶ意味がない）。有効化は一度だけ `git config merge.codemap.driver true`（`.git/config` は全 worktree 共有）。未登録でも通常の3wayマージに落ちるだけで壊れない |
| テスト | `tests/codemap.test.js`（`node --test`） |

**なぜ生成物にしたか**: 手書きの `CODEBASE_STRUCTURE.md`(ローカルのみ) は2ヶ月で誤情報化した
（「19ファイル」と書かれていたが実際は34ファイル、行数も全て古い）。誤った索引は
無いよりも害が大きいため、索引は人が書かず機械が生成し CI が守る。

### 探索の原則

実測（2026-08-29・全25セッション）に基づく方針:

- **同じファイルの同じ範囲を二度読まない** — Read 347回のうち143回（41.2%・約124K tok）が
  同一セッション内の重複読みだった。PreToolUse hook が重複時に警告する（ブロックはしない）
- **複数ファイルにまたがる調査は Explore エージェントに委譲する** — 子の `tool_result` は
  本体の文脈に入らないため、以降の全ターンでの再送コストが消える。実測で Agent 1回あたり
  317 tok に対し、自前調査は1セッション 5K〜46K tok を文脈に積む
- 読むときは `offset`/`limit` で必要な範囲だけ（現状67%は実施済み）

> hook 本体は `.shared/hooks/`（gitignore 外の共有ディレクトリ）。
> 各フラグ（`codemap-autogen.on` / `dup-read-guard.on` / `search-policy.on`）を
> 消せばその機能だけ即座に無効化できる。

---

## モックアップ管理

モックアップは設計判断の重要な記録資料としてGitに含める。

### ルール

- **機能別サブフォルダ**: `mockups/<機能名>/` に格納する（例: `mockups/timeline-actuals/`）
- **Gitに含める**: モックアップは設計判断の材料であり、ADRと同様に後から振り返れるようにする
- **ADRとの紐づけ**: モックアップに基づく設計判断を行った場合、ADRを作成し相互リンクする
  - ADR内でモックアップファイルへのパスを記載する
  - モックアップフォルダ内にREADME.mdを置き、関連ADRへのリンクと各案の概要を記載する
- **ライフサイクル**: 採用/不採用が決定したモックアップも履歴として保持する。不要になった場合はGit履歴に残した上で削除可

### 現在のモックアップ

| フォルダ | 機能 | 状態 |
|---------|------|------|
| `mockups/mobile-backup-access/` | モバイル版バックアップ復元アクセス改善 | 検討中 |
| `mockups/timeline-actuals/` | タイムライン実績入力（D&D） | 検討中 |
| `mockups/actual-bulk-edit/` | 実績のまとめ変更（選択一括編集／条件置換／表直接編集の3案比較） | 案1 採用・設計書 `docs/superpowers/specs/2026-08-29-actual-bulk-edit-design.md`(ローカルのみ) |
| `mockups/schedule-redesign/` | スケジュール機能の刷新（案A ガント磨き込み／案B 担当者×日の負荷格子／案C 計画ボード＋進捗ガント の3案比較） | 検討中（推奨 案C の段階導入・B-010） |

---

## 関連ドキュメント

- `docs/GANTT_CHART_SPEC.md` - ガントチャート仕様書
- `docs/GANTT_CHART_DESIGN.md` - 詳細設計書
- `docs/CODEMAP.md` - 関数・要素IDの索引（自動生成。**何かを探すときはまずこれ**）
- `ARCHITECTURE.md` - アーキテクチャ構成（依存関係・技術仕様。ファイルサイズ等の数値は古い）
- `CODEBASE_STRUCTURE.md` - コードベース構造（⚠️ ローカルのみ・2026-06-14 時点の手書き記録。現状と不一致のため参照非推奨）
