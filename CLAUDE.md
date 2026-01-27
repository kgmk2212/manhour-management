# 工数管理システム - 開発ガイド

> **重要**: このファイルはClaude Codeが参照する開発ガイドです。
> 作業開始前に必ずブランチを確認してください。

---

## ブランチ戦略

### 現在のブランチ構成

| ブランチ | 用途 | 作業内容 |
|----------|------|----------|
| `main` | 安定版 | バグ修正、微調整、既存機能の改善 |
| `feature/gantt-chart` | 新機能開発 | ガントチャート（スケジュール管理）機能 |

### 作業前の確認事項

```bash
# 現在のブランチを確認
git branch
```

### どちらのブランチで作業するか

| ユーザーの依頼内容 | 作業ブランチ |
|-------------------|--------------|
| バグ修正、表示の微調整 | `main` |
| 既存機能（見積・実績・レポート）の改善 | `main` |
| ガントチャート機能の実装 | `feature/gantt-chart` |
| スケジュール関連の作業 | `feature/gantt-chart` |

**判断に迷う場合**: ユーザーに確認してください。

---

## ガントチャート開発時の注意（競合回避）

### 原則: 既存コードの中間に挿入しない

| ファイル | 変更方法 |
|----------|----------|
| `js/schedule*.js` | 新規ファイル（自由に編集可） |
| `js/state.js` | **末尾に追加**（`// === Schedule ===` セクション） |
| `js/storage.js` | **末尾に追加**（既存関数は編集しない） |
| `js/constants.js` | **末尾に追加**（`SCHEDULE` 定数） |
| `js/init.js` | **末尾に追加**（schedule初期化処理） |
| `index.html` | タブとモーダルを**既存構造の末尾に追加** |
| `style.css` | **末尾に追加**（`.schedule-*` クラス） |

### 絶対に触らないファイル（main側で編集される可能性が高い）

- `js/report.js` - レポート機能（mainで改善される可能性）
- `js/estimate*.js` - 見積機能
- `js/actual.js` - 実績機能
- `js/ui.js` - 共通UI（必要な場合はユーザーに確認）

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
