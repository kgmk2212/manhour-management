# コードベース構造調査レポート

## 1. ディレクトリ構造とファイル一覧

```
/Users/kmori/Documents/work/manhour-management/
├── index.html                      (メインHTMLファイル: 144,859 bytes)
├── style.css                       (スタイルシート)
├── js/                             (JavaScriptモジュール - 19ファイル)
│   ├── init.js                     (494行)- アプリケーション初期化
│   ├── state.js                    (430行)- グローバル状態管理
│   ├── constants.js                (261行)- 定数定義
│   ├── utils.js                    (615行)- ユーティリティ関数
│   ├── storage.js                  (581行)- localStorage/バックアップ管理
│   ├── ui.js                       (2,279行)- DOM操作・UI制御
│   ├── estimate.js                 (941行)- 見積管理（メイン表示）
│   ├── estimate-add.js             (606行)- 見積追加機能
│   ├── estimate-edit.js            (544行)- 見積編集機能
│   ├── estimate-split.js           (379行)- 見積分割機能
│   ├── estimate-selection.js       (233行)- 見積選択・作業月割当
│   ├── actual.js                   (1,493行)- 実績管理機能
│   ├── quick.js                    (603行)- クイック入力機能
│   ├── report.js                   (2,469行)- レポート・分析・グラフ描画
│   ├── vacation.js                 (227行)- 休暇・休日管理
│   ├── other-work.js               (216行)- 会議・その他作業
│   ├── theme.js                    (552行)- テーマ・UI設定
│   ├── modal.js                    (486行)- モーダル操作・ドラッグ処理
│   └── events.js                   (770行)- イベントハンドラ統合
├── test-modules.html               (モジュール読み込みテスト)
├── ドキュメント
│   ├── CLAUDE.md                   (開発ガイド)
│   ├── ARCHITECTURE.md             (アーキテクチャ仕様)
│   ├── PHASE3_IMPLEMENTATION.md    (Phase 3実装計画)
│   ├── IMPROVEMENT_PLAN.md         (改善計画)
│   └── 修正案リスト.md
└── .gitignore, README.md, など
```

**合計行数:** 14,837行（JavaScriptのみ）

---

## 2. index.htmlの構造（セクション分け）

**5つのメインタブに分割:**

| タブ | ID | 説明 |
|-----|-----|------|
| クイック入力 | `#quick` | 実績・見積・休暇のクイック入力 |
| 見積一覧 | `#estimate` | 見積データの一覧・管理 |
| 実績一覧 | `#actual` | 実績データの一覧・カレンダー表示 |
| レポート | `#report` | 分析・グラフ・レポート表示 |
| 設定 | `#settings` | テーマ・表示設定・バックアップ |

**HTML構成:**
```html
<head>
  - メタ情報・文字コード
  - ExcelJS（Excelファイル出力）
  - holiday_jp（日本の祝日API）
  - style.css
  - 早期テーマ適用スクリプト（ちらつき防止）
</head>

<body>
  <header>バージョン・バックアップボタン</header>
  <div class="tabs">5つのタブボタン</div>
  <div class="content">各タブのコンテンツ領域</div>
  <script type="module" src="js/init.js"></script>
</body>
```

---

## 3. JavaScript関数の分類（機能別）

### A. 状態管理・データ層

| ファイル | 主要責務 | 関数数 |
|---------|---------|-------|
| **state.js** | グローバル変数・ゲッター/セッター | 30+ |
| **storage.js** | localStorage・バックアップ・復元 | 8 |
| **constants.js** | 定数定義（マジックナンバー排除） | 11の定数オブジェクト |

### B. 見積管理機能（estimate系 4ファイル）

| ファイル | 主要責務 | 関数数 | 行数 |
|---------|---------|-------|------|
| **estimate.js** | 見積一覧表示・フィルタリング | 20+ | 941 |
| **estimate-add.js** | 見積追加（通常・月分割） | 15+ | 606 |
| **estimate-edit.js** | 見積編集・タスク編集 | 10+ | 544 |
| **estimate-split.js** | 見積分割機能 | 8 | 379 |
| **estimate-selection.js** | 見積選択・作業月割当 | 8 | 233 |

### C. 実績管理機能

| ファイル | 主要責務 | 関数数 | 行数 |
|---------|---------|-------|------|
| **actual.js** | 実績管理・カレンダー表示 | 40+ | 1,493 |
| **quick.js** | クイック入力インターフェース | 30+ | 603 |

### D. 分析・レポート機能

| ファイル | 主要責務 | 関数数 | 行数 |
|---------|---------|-------|------|
| **report.js** | レポート表示・グラフ描画・分析 | 50+ | 2,469 |
| **vacation.js** | 休暇・会社休日管理 | 15 | 227 |
| **other-work.js** | 会議・その他作業 | 7 | 216 |

### E. UI・ユーザー操作

| ファイル | 主要責務 | 関数数 | 行数 |
|---------|---------|-------|------|
| **ui.js** | DOM操作・フォーム管理・タブ切替 | 60+ | 2,279 |
| **theme.js** | テーマ・色設定・UI状態管理 | 25+ | 552 |
| **modal.js** | モーダル操作・ドラッグ処理 | 15 | 486 |
