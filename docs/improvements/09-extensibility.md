# I. 国際化・拡張性 設計書

> **カテゴリ**: 国際化と拡張性
> **改善数**: 9件
> **優先度**: 低
> **関連ファイル**: 全ファイル（i18n）、js/constants.js, js/state.js

---

## 25. 多言語対応（i18n）

### 現状の課題
- UI文言がすべてHTMLとJavaScript内にハードコードされた日本語
- 英語チームや海外拠点で利用できない
- 文言変更のたびにコード修正が必要

### 提案内容
- 翻訳キーマップ（JSON）による文言の外部化
- 日本語/英語の2言語対応（将来拡張可能な設計）
- 動的な言語切替（リロード不要）

### 実装方針

#### 翻訳ファイル構造
```javascript
// js/i18n/ja.js
export const ja = {
  // ナビゲーション
  'nav.quickInput': 'クイック入力',
  'nav.report': 'レポート',
  'nav.estimateList': '見積一覧',
  'nav.actualList': '実績一覧',
  'nav.schedule': 'スケジュール',
  'nav.settings': '設定',

  // クイック入力
  'quick.actual': '実績入力',
  'quick.estimate': '見積登録',
  'quick.vacation': '休暇登録',

  // フォームラベル
  'form.version': 'バージョン',
  'form.task': 'タスク',
  'form.process': '工程',
  'form.member': 'メンバー',
  'form.hours': '時間',
  'form.date': '日付',
  'form.save': '保存',
  'form.cancel': 'キャンセル',
  'form.delete': '削除',

  // レポート
  'report.progress': '進捗状況',
  'report.accuracy': '見積精度',
  'report.anomalies': '異常検知',
  'report.trend': 'トレンド分析',

  // ステータス
  'status.completed': '完了',
  'status.ontrack': '順調',
  'status.warning': '注意',
  'status.exceeded': '超過',

  // メッセージ
  'msg.saved': '保存しました',
  'msg.deleted': '削除しました',
  'msg.confirmDelete': '本当に削除しますか？',
  'msg.importSuccess': 'データをインポートしました',
  'msg.exportSuccess': 'バックアップを作成しました',

  // 工程名
  'process.UI': 'UI設計',
  'process.PG': 'プログラミング',
  'process.PT': '単体テスト',
  'process.IT': '結合テスト',
  'process.ST': 'システムテスト',

  // 日付
  'date.today': '今日',
  'date.yesterday': '昨日',
  'date.thisWeek': '今週',
  'date.thisMonth': '今月',
  'date.weekdays': ['日', '月', '火', '水', '木', '金', '土'],
  'date.months': ['1月', '2月', '3月', '4月', '5月', '6月',
                   '7月', '8月', '9月', '10月', '11月', '12月'],
};
```

```javascript
// js/i18n/en.js
export const en = {
  'nav.quickInput': 'Quick Input',
  'nav.report': 'Report',
  'nav.estimateList': 'Estimates',
  'nav.actualList': 'Actuals',
  'nav.schedule': 'Schedule',
  'nav.settings': 'Settings',

  'quick.actual': 'Log Hours',
  'quick.estimate': 'Add Estimate',
  'quick.vacation': 'Log Vacation',

  'form.version': 'Version',
  'form.task': 'Task',
  'form.process': 'Phase',
  'form.member': 'Member',
  'form.hours': 'Hours',
  'form.date': 'Date',
  'form.save': 'Save',
  'form.cancel': 'Cancel',
  'form.delete': 'Delete',

  'status.completed': 'Completed',
  'status.ontrack': 'On Track',
  'status.warning': 'At Risk',
  'status.exceeded': 'Exceeded',

  'msg.saved': 'Saved successfully',
  'msg.deleted': 'Deleted successfully',
  'msg.confirmDelete': 'Are you sure you want to delete?',

  'process.UI': 'UI Design',
  'process.PG': 'Programming',
  'process.PT': 'Unit Test',
  'process.IT': 'Integration Test',
  'process.ST': 'System Test',

  'date.today': 'Today',
  'date.yesterday': 'Yesterday',
  'date.thisWeek': 'This Week',
  'date.thisMonth': 'This Month',
  'date.weekdays': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  'date.months': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
```

#### i18nエンジン
```javascript
// js/i18n/i18n.js
import { ja } from './ja.js';
import { en } from './en.js';

const locales = { ja, en };
let currentLocale = 'ja';

/**
 * 翻訳テキストを取得
 * @param {string} key - 翻訳キー（ドット区切り）
 * @param {Object} params - テンプレート変数
 */
export function t(key, params = {}) {
  const text = locales[currentLocale]?.[key]
    ?? locales['ja']?.[key]  // フォールバック: 日本語
    ?? key;                  // 最終フォールバック: キーそのまま

  // テンプレート変数の展開: "{{count}}件削除" → "3件削除"
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] ?? '');
}

/**
 * 言語切替
 */
export function setLocale(locale) {
  if (!locales[locale]) return;
  currentLocale = locale;
  localStorage.setItem('manhour_locale', locale);
  updateAllTexts();
}

/**
 * DOM上の翻訳テキストを一括更新
 * data-i18n属性を持つ要素を対象
 */
function updateAllTexts() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
}

/**
 * 初期化: ブラウザ言語またはlocalStorage設定から
 */
export function initI18n() {
  const saved = localStorage.getItem('manhour_locale');
  const browserLocale = navigator.language.slice(0, 2);
  currentLocale = saved || (locales[browserLocale] ? browserLocale : 'ja');
  updateAllTexts();
}
```

#### HTML側の変更
```html
<!-- Before -->
<button>保存</button>
<label>バージョン</label>

<!-- After -->
<button data-i18n="form.save">保存</button>
<label data-i18n="form.version">バージョン</label>
```

#### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/i18n/` | 新規ディレクトリ（ja.js, en.js, i18n.js） |
| `index.html` | 全文言要素にdata-i18n属性追加 |
| `js/init.js` | i18n初期化の呼び出し |
| `js/ui.js` | 動的テキスト生成箇所でt()を使用 |
| `js/actual.js` | メッセージ文字列をt()に置換 |
| `js/estimate.js` | 同上 |

#### 実装ステップ
1. i18nエンジンの作成
2. 日本語翻訳ファイルの作成（全文言の洗い出し）
3. HTMLの静的テキストにdata-i18n属性を付与
4. JS内の文字列をt()関数に置換（段階的）
5. 英語翻訳ファイルの作成
6. 設定画面に言語切替UIを追加
7. 日付/数値のロケール対応

#### 工数見積
- 特大（7-10日：文言洗い出しと全置換が大きい）

---

## 26. カスタマイズ性

### 26-1. 工程名のカスタマイズ

#### 現状の課題
- UI/PG/PT/IT/STの5工程がconstants.jsに固定定義
- プロジェクトによって工程が異なる（企画/設計/開発/QA/リリースなど）
- 工程を追加/変更するにはコードの直接変更が必要

#### 提案内容
- 設定画面で工程名の追加/編集/削除/並び替え
- デフォルトプリセット（ウォーターフォール、アジャイル）の用意

#### 実装方針

```javascript
// js/constants.js の変更
// Before: 固定定数
// export const PROCESSES = ['UI', 'PG', 'PT', 'IT', 'ST'];

// After: 設定可能な工程定義
export const DEFAULT_PROCESS_PRESETS = {
  waterfall: [
    { id: 'UI', name: 'UI設計', color: '#4A90D9' },
    { id: 'PG', name: 'プログラミング', color: '#50C878' },
    { id: 'PT', name: '単体テスト', color: '#FFB347' },
    { id: 'IT', name: '結合テスト', color: '#FF6B6B' },
    { id: 'ST', name: 'システムテスト', color: '#9B59B6' }
  ],
  agile: [
    { id: 'PLAN', name: '企画/設計', color: '#4A90D9' },
    { id: 'DEV', name: '開発', color: '#50C878' },
    { id: 'TEST', name: 'テスト', color: '#FFB347' },
    { id: 'REVIEW', name: 'レビュー', color: '#FF6B6B' },
    { id: 'DEPLOY', name: 'デプロイ', color: '#9B59B6' }
  ],
  custom: []  // ユーザー定義
};

// 現在の工程定義を取得
export function getProcesses() {
  const settings = getSettings();
  return settings.customProcesses || DEFAULT_PROCESS_PRESETS.waterfall;
}
```

##### UI変更（設定画面）
```
┌─ 工程設定 ──────────────────────────────────┐
│                                              │
│ プリセット: [ウォーターフォール ▼]             │
│                                              │
│ ┌───┬──────────────┬─────────┬──────┐      │
│ │ ≡ │ UI設計        │ 🔵      │ [✕]  │      │  ← ドラッグで並替
│ │ ≡ │ プログラミング │ 🟢      │ [✕]  │      │
│ │ ≡ │ 単体テスト    │ 🟡      │ [✕]  │      │
│ │ ≡ │ 結合テスト    │ 🔴      │ [✕]  │      │
│ │ ≡ │ システムテスト │ 🟣      │ [✕]  │      │
│ └───┴──────────────┴─────────┴──────┘      │
│                                              │
│ [+ 工程を追加]                                │
│                                              │
│ ⚠ 工程を削除すると、既存データの工程名は        │
│   そのまま残ります（選択肢からは消えます）       │
└──────────────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/constants.js` | 固定PROCESSES配列をgetProcesses()に変更 |
| `js/state.js` | customProcesses設定の管理 |
| `js/ui.js` | 工程ドロップダウンの動的生成、設定画面UI |
| `js/estimate.js` | 工程参照をgetProcesses()に変更 |
| `js/actual.js` | 同上 |
| `js/report.js` | 工程別集計の動的対応 |

##### 実装ステップ
1. getProcesses()関数の作成
2. constants.jsの固定参照を動的参照に置換
3. 設定画面の工程編集UI
4. ドラッグ&ドロップによる並び替え
5. プリセットの適用処理
6. 既存データとの整合性チェック

##### 技術的考慮事項
- 工程削除時に既存データが壊れないこと
- 工程名変更時に既存データを更新するかの選択肢

##### 工数見積
- 中〜大（3-4日）

---

### 26-2. カスタムフィールド

#### 提案内容
- 見積/実績にプロジェクト固有のフィールドを追加
- フィールド型: テキスト、数値、選択肢、日付

#### 実装方針

```javascript
// カスタムフィールド定義
const customFieldDefs = [
  {
    id: 'cf_priority',
    name: '優先度',
    type: 'select',          // text | number | select | date
    options: ['高', '中', '低'],
    target: ['estimate', 'actual'],  // 適用先
    required: false,
    defaultValue: '中'
  },
  {
    id: 'cf_category',
    name: 'カテゴリ',
    type: 'select',
    options: ['新規', '改善', 'バグ修正', '保守'],
    target: ['estimate'],
    required: false
  }
];

// 実績/見積データへの格納
{
  id: "act_001",
  // ... 既存フィールド
  customFields: {
    cf_priority: '高',
    cf_category: '新規'
  }
}
```

##### UI: 入力フォームへの動的追加
```
通常フィールド:
  バージョン: [v2.0 ▼]
  タスク:     [ログイン画面 ▼]
  工程:       [PG ▼]
  時間:       [3.0]

カスタムフィールド（動的に表示）:
  優先度:     [高 ▼]
  カテゴリ:   [新規 ▼]
```

##### 工数見積
- 大（4-5日）

---

### 26-3. ワークフロー定義

#### 提案内容
- 工程の順序や承認フローをプロジェクトごとに設定
- 「UIが完了したらPGを開始可能」のような依存ルール

#### 実装方針
- スケジュール管理のクリティカルパス機能（B-7-1）と連携
- 工程の順序定義がガントチャートの依存関係に自動反映

##### 工数見積
- 大（4-5日、クリティカルパスが前提）

---

## 27. 外部連携

### 27-1. CSV/TSVインポート

#### 現状の課題
- Excel以外のフォーマット（CSV、TSV）からのインポートが未対応
- GoogleスプレッドシートからのデータはCSVが一般的

#### 提案内容
- CSV/TSVファイルのパース・インポート
- カラムマッピングUI（ファイルの列と見積/実績フィールドの紐づけ）

#### 実装方針

```javascript
/**
 * CSVパーサー（軽量実装）
 * ダブルクォート対応、改行コード自動判定
 */
function parseCSV(text, delimiter = ',') {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++;  // エスケープされたクォート
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++;  // CRLF
      } else {
        currentField += char;
      }
    }
  }

  // 最後の行
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rows.push(currentRow);
  }

  return rows;
}

/**
 * TSV判定
 */
function detectDelimiter(text) {
  const firstLine = text.split('\n')[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return tabCount > commaCount ? '\t' : ',';
}
```

##### カラムマッピングUI
```
┌─ CSVインポート ──────────────────────────────┐
│                                               │
│ ファイル: data.csv (50行)                      │
│                                               │
│ カラムマッピング:                              │
│ ┌──────────────┬──────────────┐              │
│ │ CSVの列      │ 対応フィールド │              │
│ ├──────────────┼──────────────┤              │
│ │ A列: date    │ [日付 ▼]     │              │
│ │ B列: version │ [バージョン ▼]│              │
│ │ C列: task    │ [タスク ▼]    │              │
│ │ D列: phase   │ [工程 ▼]     │              │
│ │ E列: name    │ [メンバー ▼]  │              │
│ │ F列: hours   │ [時間 ▼]     │              │
│ │ G列: note    │ [(無視) ▼]   │              │
│ └──────────────┴──────────────┘              │
│                                               │
│ プレビュー（先頭5行）:                         │
│ │ 2026-04-01 │ v2.0 │ ログイン │ PG │ 森 │ 3 ││
│ │ ...                                        ││
│                                               │
│          [キャンセル] [インポート実行]          │
└───────────────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/csv-utils.js` | 新規: CSVパーサー |
| `js/storage.js` | CSVインポート処理 |
| `js/ui.js` | カラムマッピングUI |
| `style.css` | マッピングUIのスタイル |

##### 実装ステップ
1. CSVパーサーの実装（ダブルクォート、マルチバイト対応）
2. デリミタ自動検出（CSV/TSV判定）
3. カラムマッピングUIの構築
4. プレビュー表示
5. マッピング適用・データ変換
6. 既存のインポートフローとの統合

##### 工数見積
- 中（2-3日）

---

### 27-2. Jira/Redmine連携（将来構想）

#### 提案内容
- チケットIDと工数の紐づけ
- REST API経由でのチケット情報取得

#### 実装方針
- サーバーサイド（プロキシ）が必要（CORS制約）
- クライアント側はチケットIDフィールドの追加のみ
- 将来のバックエンドサーバー構築時に本格対応

#### 初期対応（クライアントのみ）
```javascript
// 実績データにチケットID欄を追加
{
  id: "act_001",
  // ... 既存フィールド
  ticketId: "PROJ-123",     // Jira/Redmineチケット番号
  ticketUrl: "https://jira.example.com/browse/PROJ-123"
}
```

##### 工数見積
- 小（1日：チケットIDフィールドの追加のみ）
- 大（5日以上：API連携を含む場合、サーバーサイド必要）

---

### 27-3. Google Calendar連携（将来構想）

#### 提案内容
- Googleカレンダーの予定から工数を推定
- 会議の時間を自動的に「その他」実績として入力

#### 前提
- Google Calendar API利用にはOAuth認証が必要
- サーバーサイドが必要（APIキーの保護）
- 現状のスタックでは実装困難、将来課題として記録

##### 工数見積
- 特大（サーバーサイド構築を含む）

---

## まとめ

| # | 改善 | 優先度 | 工数 | 依存関係 |
|---|------|--------|------|----------|
| 25 | 多言語対応 | 低 | 特大 | なし（段階的に可能） |
| 26-1 | 工程カスタマイズ | 中 | 中〜大 | なし |
| 26-2 | カスタムフィールド | 低 | 大 | なし |
| 26-3 | ワークフロー定義 | 低 | 大 | クリティカルパス(7-1) |
| 27-1 | CSV/TSVインポート | 中 | 中 | なし |
| 27-2 | Jira/Redmine連携 | 低 | 小〜大 | サーバーサイド |
| 27-3 | Google Calendar連携 | 低 | 特大 | サーバーサイド |
