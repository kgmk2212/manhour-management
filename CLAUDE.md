# 工数管理システム - 開発ガイド

> **重要**: このファイルはClaude Codeが参照する開発ガイドです。
> 作業開始前に必ずブランチを確認してください。

---

## ブランチ戦略

### 現在のブランチ構成

| ブランチ | 用途 | 作業内容 |
|----------|------|----------|
| `main` | 安定版 | バグ修正、微調整、既存機能の改善 |
| `experiment/sandbox` | 実験用 | 自由に試行錯誤（破壊的変更OK） |

> **注**: `feature/gantt-chart` は 2026-01-31 に main へマージ済み。`experiment/design-rebuild` は未使用のため削除済み。

### Worktree構成

各ブランチは専用のディレクトリで作業します。

| ディレクトリ | ブランチ | 用途 |
|-------------|---------|------|
| `manhour-management` | `main` | 安定版（メイン） |
| `manhour-experiment` | `experiment/sandbox` | 実験用 |

### 作業前の確認事項

```bash
# 現在のブランチを確認
git branch
```

### どちらのブランチで作業するか

| ユーザーの依頼内容 | 作業ブランチ |
|-------------------|--------------|
| バグ修正、表示の微調整 | `main` |
| 既存機能（見積・実績・レポート・スケジュール）の改善 | `main` |
| 実験的な変更、新しいアイデアの試行 | `experiment/sandbox` |

**判断に迷う場合**: ユーザーに確認してください。

---

## 実験ブランチでの開発

`experiment/sandbox` ブランチは自由な試行錯誤のための場所です。

### 実験ブランチのルール

- **制約なし**: どのファイルでも自由に編集可能
- **破壊的変更OK**: 大胆なリファクタリングや設計変更を試せる
- **失敗を恐れない**: うまくいかなければブランチごと破棄できる

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
└── CLAUDE.md           # このファイル
```

---

## 技術スタック

- **フレームワーク**: なし（純粋なHTML/CSS/JavaScript）
- **モジュール**: ES Modules
- **データ保存**: localStorage
- **外部ライブラリ**: ExcelJS, holiday_jp

---

## コーディング規約

- `js/constants.js` の定数を使用（マジックナンバー禁止）
- 新しい状態変数は `js/state.js` に追加
- JSDocコメントを関数に付与
- 既存のコードスタイルに合わせる

---

## 関連ドキュメント

- `docs/GANTT_CHART_SPEC.md` - ガントチャート仕様書
- `docs/GANTT_CHART_DESIGN.md` - 詳細設計書
- `ARCHITECTURE.md` - アーキテクチャ構成
- `CODEBASE_STRUCTURE.md` - コードベース構造
