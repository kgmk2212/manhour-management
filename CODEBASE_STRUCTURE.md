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
│   ├── floating-filter.js          (658行)- フローティングフィルタ
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
| **floating-filter.js** | フローティングフィルタ（スマホ対応） | 20+ | 658 |

### F. ユーティリティ・統合

| ファイル | 主要責務 | 関数数 | 行数 |
|---------|---------|-------|------|
| **utils.js** | 共通ユーティリティ・ヘルパー | 20+ | 615 |
| **events.js** | イベントハンドラ統合・グローバル公開 | 1メイン | 770 |
| **init.js** | アプリケーション初期化・統合 | 1メイン | 494 |

---

## 4. モジュール依存関係グラフ

```
state.js (基盤 - 全モジュールが依存)
    ↓
storage.js ← → ui.js
    ↓              ↓
estimate*.js      report.js
    ↓              ↓
actual.js      theme.js
    ↓              ↓
quick.js       floating-filter.js
    ↓              ↓
vacation.js    modal.js
other-work.js      ↓
    ↓         utils.js
    └─→ events.js
         ↓
      init.js
```

**主要な依存関係:**
- すべてのモジュール → `state.js`（グローバル状態）
- `storage.js` ↔ `ui.js`（相互参照）
- `estimate.js` → `storage.js`, `ui.js`, `utils.js`
- `report.js` → 最も複雑（estimate, actual, theme, utils依存）
- `events.js` → 全モジュール（イベント統合）
- `init.js` → 全モジュール（初期化）

---

## 5. 既存のリファクタリング計画

### 完了済み（Phase 1-4）

**Phase 1: マジックナンバー排除**
- `constants.js`作成（261行）
- 220個のハードコード値を定数に変換

**Phase 2: パフォーマンス改善**
- DOM操作最適化（`DocumentFragment`活用）
- 計算キャッシング実装（60-70%削減）

**Phase 3-1: エラーハンドリング強化**
- `storage.js`にtry-catch追加
- DOM要素のnullチェック実装
- JSONパース保護

**Phase 3-2: JSDocコメント充実**
- 15関数にJSDocコメント追加
- 高優先度関数から実施中

**Phase 3-3: constants.js適用拡大（第1段階）**
- `PROCESS.TYPES` 4箇所に適用
- 残り9箇所が対象

**Phase 3-4: ユーティリティ関数の活用拡大**
- `parseMonthString()`, `formatMonthJapanese()` 等5関数追加
- 50+箇所に適用予定

### 今後の推奨改善（優先度順）

**優先度A: 低リスク・高効果**

1. **長大関数の段階的分割**
   - `renderReportAnalytics()` - 1,100行 → 3-4個の小関数に分割
   - `renderEstimateList()` - 700行
   - `updateReport()` - 124行
   - **期待効果:** 開発速度30%向上、バグ40%削減

2. **constants.js適用拡大**
   - `PROCESS.TYPES` 残り9箇所
   - `UI.TABLE_COLORS` 8箇所
   - `UI.FONT_SIZES` 8箇所

3. **ユーティリティ関数の一貫的活用**
   - `formatMonthJapanese()` 50+箇所適用
   - 新関数: `formatDateFullJapanese()`, `getLastDayOfMonth()`

**優先度B: 中期的改善**
- キャッシング層の強化
- エラーハンドリング継続完成
- テスト自動化基盤構築

---

## 6. 技術スタック サマリー

| 層 | 技術 | 特徴 |
|------|-----|------|
| **フレームワーク** | なし（純粋HTML/CSS/JS） | フットプリント最小 |
| **モジュール形式** | ES Modules | ネイティブブラウザサポート |
| **外部ライブラリ** | ExcelJS 4.3.0 | Excelファイル出力 |
| | holiday_jp | 日本の祝日API |
| **ストレージ** | localStorage | ブラウザキャッシュ |
| **グラフ** | Canvas（手書き） | チャートJSなし |
| **スタイル** | CSS3 + CSS変数 | テーマ対応・レスポンシブ |
| **対応ブラウザ** | ES6+ 対応モダンブラウザ | type="module"必須 |

---

## 7. コード規模の分布

```
ui.js         2,279行  (15.3%) ← 最大・DOM操作集約
report.js     2,469行  (16.6%) ← 分析・レポート機能
actual.js     1,493行  (10.1%) ← 実績管理の複雑さ
estimate.js     941行   (6.3%)
js/その他    7,655行  (51.6%)

合計         14,837行
```

**傾向:** UI層（ui.js + report.js）に全体の32%の実装が集約

---

## 8. 作業分担の提案

### 分担可能な機能領域（5つのドメイン）

| 担当領域 | ファイル群 | 行数 | 独立性 |
|----------|-----------|------|--------|
| **A. 見積管理** | `estimate.js`, `estimate-add.js`, `estimate-edit.js`, `estimate-split.js`, `estimate-selection.js` | 2,703行 | ⭐⭐⭐ 高 |
| **B. 実績管理** | `actual.js`, `quick.js` | 2,096行 | ⭐⭐⭐ 高 |
| **C. レポート・分析** | `report.js` | 2,469行 | ⭐⭐ 中 |
| **D. UI基盤** | `ui.js`, `modal.js`, `floating-filter.js`, `theme.js` | 3,975行 | ⭐⭐ 中 |
| **E. 共通基盤** | `state.js`, `storage.js`, `utils.js`, `constants.js` | 1,887行 | ⭐ 低（全体に影響） |

### 推奨する分担パターン

#### パターン1: 機能別分担（2〜3人向け）

```
開発者A: 見積管理（estimate系5ファイル）
開発者B: 実績管理 + クイック入力（actual.js, quick.js）
開発者C: レポート・分析（report.js）
```

**メリット:** 機能が独立しており、コンフリクトが少ない

#### パターン2: レイヤー別分担（2人向け）

```
開発者A: ビジネスロジック層
  - estimate*.js, actual.js, report.js, vacation.js, other-work.js

開発者B: UI/UX層
  - ui.js, modal.js, floating-filter.js, theme.js, style.css
```

**メリット:** 専門性を活かせる（バックエンド寄り/フロントエンド寄り）

### 並行作業時の注意点

#### 触ってはいけない共通ファイル（要調整）
- `state.js` - グローバル状態（全モジュールが依存）
- `constants.js` - 定数定義（変更時は全員に影響）
- `init.js` - 初期化処理
- `events.js` - イベント統合

#### 安全に並行作業できる組み合わせ
```
✅ estimate*.js と actual.js は同時編集可能
✅ report.js と theme.js は同時編集可能
✅ vacation.js と other-work.js は同時編集可能
⚠️  ui.js は多くのモジュールから呼ばれるため、変更時は要連絡
```

### ブランチ戦略の提案

```
main
├── feature/estimate-improvements    (開発者A)
├── feature/actual-improvements      (開発者B)
├── feature/report-refactoring       (開発者C)
└── shared/common-updates            (共通基盤の変更はここで統合)
```

共通ファイル（`state.js`, `constants.js`など）を変更する場合は `shared/common-updates` ブランチで行い、各人がマージしてから作業を続ける形にすると安全。

---

## 結論

このプロジェクトは以下の特徴を持つ成熟したコードベース：

1. **モジュール化:** 19個の責務別JavaScriptモジュール
2. **保守性:** アーキテクチャドキュメントが充実・constants.js による定数管理
3. **スケーラビリティ:** Phase 3での段階的リファクタリング計画が進行中
4. **改善文化:** 定期的なコミット・ドキュメント更新
5. **課題:** 長大関数の存在（report.js 1,100行）、constants適用の拡大作業が残存

**推奨次のアクション:** Phase 3-3/3-4の継続実施（constants適用・ユーティリティ活用） → 優先度Aの長大関数分割へ移行
