# 工数管理システム - 開発ガイド

> **重要**: このファイルはClaude Codeが参照する開発ガイドです。
> 作業開始前に必ずブランチを確認してください。

---

## ブランチ戦略

### 現在のブランチ構成

| ブランチ | 用途 | 作業内容 |
|----------|------|----------|
| `experiment/ui-scaling` | **現行の正系開発ライン** | 機能開発・改善はここ。merge-core(差分/選択マージ)・CI・AI分析・Excel追加読み込み等の最新を含む。worktree: `manhour-ui-scaling` |
| `main` | デプロイ起点 | 現状は `deploy: trigger Pages rebuild` の空コミット中心で、アプリ本体の開発実体は実験ライン側にある |
| `experiment/redesign` | リデザイン実験 | UI/UXの全面的なリデザイン（frontend-designスキル必須） |
| `experiment/sandbox` | 実験用 | 自由に試行錯誤（破壊的変更OK） |
| `experiment/llm-analysis` | ui-scaling からの派生（2026-05-23〜） | Excel取り込みのデータ処理fix群。fixは ui-scaling に機能統合済みのため実質役目終了。worktree: `manhour-llm-analysis` |

> **注**: `feature/gantt-chart` は 2026-01-31 に main へマージ済み。`experiment/design-rebuild` は未使用のため削除済み。
> **注（2026-06）**: 現在アクティブに開発しているのは `experiment/ui-scaling`。詳細は memory の `project-branch-topology` を参照。退避タグ `backup/ui-scaling-before-resync-8366f0d` あり。

### Worktree構成

各ブランチは専用のディレクトリで作業します。

| ディレクトリ | ブランチ | 用途 |
|-------------|---------|------|
| `manhour-ui-scaling` | `experiment/ui-scaling` | **現行の正系開発ライン** |
| `manhour-management` | `main` | デプロイ起点（メイン worktree） |
| `manhour-llm-analysis` | `experiment/llm-analysis` | Excel取り込みfix派生（ui-scaling に統合済み） |
| `manhour-redesign` | `experiment/redesign` | リデザイン実験 |
| `manhour-experiment` | `experiment/sandbox` | 実験用 |
| `manhour-impl` | `experiment/redesign-impl` | リデザイン実装 |
| `manhour-analytics` | `experiment/analytics` | 分析系実験 |
| `manhour-fixes` | `experiment/fixes` | 修正系実験 |

> **⚠️ worktree 削除時の注意**: 各 worktree の `.claude/commands` は `.shared/commands` への
> ジャンクション。worktree を削除する前に必ず `cmd /c rmdir "<worktree>\.claude\commands"` で
> リンク解除すること。`git worktree remove --force` や `Remove-Item -Recurse` はジャンクション
> 越しに実体（全コマンド定義）を削除する（2026-08-19 に実害発生・復旧済み）。

### 作業前の確認事項

```bash
# 現在のブランチを確認
git branch
```

### どちらのブランチで作業するか

| ユーザーの依頼内容 | 作業ブランチ |
|-------------------|--------------|
| バグ修正、表示の微調整 | `experiment/ui-scaling` |
| 既存機能（見積・実績・レポート・スケジュール）の改善 | `experiment/ui-scaling` |
| UI/UXのリデザイン | `experiment/redesign` |
| 実験的な変更、新しいアイデアの試行 | `experiment/sandbox` |

> **注（2026-06）**: 機能開発・改善は現行の正系 `experiment/ui-scaling` で行う（旧記載の `main` 起点から実態が移行済み）。`main` への取り込み方針はユーザー判断のため、マージ時は確認すること。

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
├── js/                 # JavaScriptモジュール（19ファイル）
│   ├── state.js        # グローバル状態管理
│   ├── storage.js      # localStorage操作
│   ├── constants.js    # 定数定義
│   ├── init.js         # 初期化処理
│   ├── estimate*.js    # 見積管理
│   ├── actual.js       # 実績管理
│   ├── report.js       # レポート・分析
│   └── ...
├── docs/               # 設計ドキュメント
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

## 開発フロー（自動検証・自動デプロイ）

コード修正タスクでは、ユーザーが毎回指示しなくても以下を自動で実行する:

1. **実動作検証**: 修正後、Playwright による実ブラウザ検証（手順は `/verify-ui`）で修正が効いていることを機械判定で確認する。検証が PASS するまで「完了」と報告しない。
2. **デプロイ**: 検証が取れたら `/deploy` を実行し、デプロイ完了まで進める。途中でユーザーに確認を求めない。
3. **コンフリクト回避**: 他セッションとの並行作業が常にありうる前提で、コミットは自分が編集したファイルのみを明示ステージする（`git add <file>...`、`-A` 禁止）。

> この方針は `.claude/settings.json` の UserPromptSubmit hook（`.shared/hooks/inject-dev-flow.py`）でも毎ターン注入される（`.claude/` は gitignore のためローカル設定）。

### 並列セッション統合機構（parallel-mode）

複数セッションの並列作業を安全に統合する仕組み。フラグファイル
`.shared/hooks/parallel-mode.on` が存在する間だけ有効（`/parallel-mode on|off|status` で切替）。

- **有効時**: コード修正タスクは `/start-work <topic>` で専用 worktree（`feature/<topic>`）に
  隔離してから作業し、完了時に `/integrate` で「rebase → /verify-ui → ff-only マージ →
  /deploy → worktree 掃除」まで自動実行する。**ui-scaling worktree は統合専用**（直接編集しない）。
- **無効時（フラグ無し）**: 従来どおり本節上部の開発フロー（直接編集 + 明示ステージ）。
- **claims 層（2026-08-20〜）**: 独立フラグ `.shared/hooks/claims.on` が存在する間だけ、
  /start-work が `.shared/claims/` に着手宣言（topic・ブランチ・BACKLOG ID）を書き、hook が
  着手中一覧を毎ターン注入する（二重着手の可視化）。**参考情報のみで、停止・ロックは一切しない**。
  `/parallel-mode claims-off` で即無効化。設計:
  `docs/superpowers/specs/2026-08-20-claims-layer-design.md`（原本: 各 `.orig-20260820`）。
- **元に戻す**: `/parallel-mode off` で即復帰。完全撤去の手順と設計は
  `docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md` §6 を参照
  （hook 原本バックアップ: `.shared/hooks/inject-dev-flow.py.orig-20260819`）。

---

## コーディング規約

- `js/constants.js` の定数を使用（マジックナンバー禁止）
- 新しい状態変数は `js/state.js` に追加
- JSDocコメントを関数に付与
- 既存のコードスタイルに合わせる

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

---

## 関連ドキュメント

- `docs/GANTT_CHART_SPEC.md` - ガントチャート仕様書
- `docs/GANTT_CHART_DESIGN.md` - 詳細設計書
- `ARCHITECTURE.md` - アーキテクチャ構成
- `CODEBASE_STRUCTURE.md` - コードベース構造
