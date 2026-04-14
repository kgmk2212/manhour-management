# C. ビジュアル・デザイン 設計書

> **カテゴリ**: デザイン・表示の改善
> **改善数**: 12件
> **優先度**: 高
> **関連ファイル**: style.css, js/theme.js, js/ui.js, index.html

---

## 9. ダークモード

### 現状の課題
- 9つのテーマカラーがあるが、すべてライト背景（#F7F6F3）
- 長時間のPC作業で目が疲れるという声が想定される
- OS設定のダークモードに追従しない
- 夜間や暗い環境での視認性が低い

### 提案内容
- ライト/ダーク/OS連動の3モードを設定画面で選択可能
- `prefers-color-scheme`メディアクエリによるOS連動
- 既存の9テーマカラーはダークモードでも維持（アクセントカラーとして）

### 実装方針

#### CSS変数の拡張
```css
/* 既存のライトモード変数 */
:root {
  --bg: #F7F6F3;
  --surface: #FFFFFF;
  --surface-elevated: #FAFAF9;
  --border: #E7E5E0;
  --border-light: #F0EEEA;
  --text-primary: #1A1814;
  --text-secondary: #6B6560;
  --text-muted: #9C9690;
  --sidebar-bg: #1A1814;
}

/* ダークモード変数 */
[data-theme-mode="dark"] {
  --bg: #121212;
  --surface: #1E1E1E;
  --surface-elevated: #2A2A2A;
  --border: #3A3A3A;
  --border-light: #2E2E2E;
  --text-primary: #E8E6E3;
  --text-secondary: #A8A29E;
  --text-muted: #78716C;
  --sidebar-bg: #0A0A0A;

  /* ステータスカラーの調整（暗い背景で映える明度に） */
  --status-success: #4ADE80;
  --status-warning: #FBBF24;
  --status-danger: #F87171;
  --status-info: #60A5FA;

  /* シャドウの調整（暗い背景では薄く） */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* OS連動 */
@media (prefers-color-scheme: dark) {
  [data-theme-mode="auto"] {
    --bg: #121212;
    --surface: #1E1E1E;
    /* ... ダークモードと同じ変数 ... */
  }
}
```

#### テーマ×モードの組み合わせ
```
テーマカラー: forest, ocean, violet, amber, ink, deep-blue, rose, teal, slate
モード:       light, dark, auto

→ テーマカラーはアクセントカラー（ボタン、サイドバーアクティブ、リンク）に使用
→ モードは背景/テキスト/ボーダーのベースカラーを切り替え
→ 9テーマ × 3モード = 27パターン（自動生成可能）
```

#### ダークモード時のアクセントカラー調整
```javascript
// js/theme.js の拡張
function adjustAccentForDarkMode(accentColor) {
  // ダークモードではアクセントカラーの明度を上げる
  const hsl = hexToHSL(accentColor);
  if (isDarkMode()) {
    hsl.l = Math.max(hsl.l, 50);  // 最低50%の明度を保証
    hsl.s = Math.min(hsl.s, 80);  // 彩度を若干抑える
  }
  return hslToHex(hsl);
}
```

#### 切替UI（設定画面）
```
┌─ 外観設定 ─────────────────────────┐
│                                    │
│ テーマモード:                       │
│ ┌──────┐ ┌──────┐ ┌──────┐       │
│ │  ☀️  │ │  🌙  │ │  💻  │       │
│ │ライト │ │ ダーク│ │ 自動 │       │
│ └──────┘ └──────┘ └──────┘       │
│                                    │
│ アクセントカラー:                    │
│ 🟢 🔵 🟣 🟡 ⬛ 🔷 🩷 🩵 ⬜       │
└────────────────────────────────────┘
```

#### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `style.css` | ダークモード変数定義（約200行追加）、`@media print`でダーク無効化 |
| `js/theme.js` | モード管理、OS連動リスナー、アクセント調整 |
| `js/ui.js` | 設定画面のモード切替UI |
| `js/state.js` | themeMode設定の追加 |
| `js/storage.js` | テーマモードの永続化 |
| `index.html` | `data-theme-mode`属性の追加、FOUC防止スクリプト更新 |

#### 実装ステップ
1. ダークモード用CSS変数の定義（`:root`のオーバーライド）
2. `data-theme-mode`属性のHTML適用
3. theme.jsのモード切替ロジック
4. 9テーマ各色のダークモード時の明度/彩度調整
5. OS連動（`prefers-color-scheme`リスナー）
6. FOUC防止（ページ読込前にモード適用）
7. 設定画面UI
8. `@media print`でのダーク無効化
9. Canvas描画（ガントチャート）のダーク対応
10. 画像/アイコンのダーク対応確認

#### 技術的考慮事項
- Canvas描画のガントチャートはCSS変数を参照していないため、JS側でテーマ色を渡す必要あり
- 印刷時はライトモード強制（黒背景のPDFは非実用的）
- サードパーティライブラリ（SheetJS）の出力に影響しないことを確認
- ダークモードでのコントラスト比をWCAG AA基準（4.5:1）以上に維持

#### 工数見積
- 大（4-6日）
  - CSS変数定義: 1日
  - JS実装: 1日
  - Canvas対応: 1日
  - 全画面の確認・微調整: 1-2日
  - Edge case対応: 0.5日

---

## 10. 情報密度の最適化

### 10-1. コンパクトモード

#### 現状の課題
- フォントサイズ13-14px、パディング12-16pxが固定
- 大型モニター使用時に情報が疎に見える
- 一覧画面で一度に見える行数が限られる

#### 提案内容
- コンパクト/通常/ゆったりの3段階の密度設定
- 行の高さ、フォントサイズ、パディングを一括調整

#### 実装方針

```css
/* 密度設定 */
:root {
  --density-font-size: 14px;
  --density-line-height: 1.5;
  --density-padding: 12px;
  --density-gap: 12px;
  --density-row-height: 40px;
}

[data-density="compact"] {
  --density-font-size: 12px;
  --density-line-height: 1.3;
  --density-padding: 6px;
  --density-gap: 6px;
  --density-row-height: 28px;
}

[data-density="comfortable"] {
  --density-font-size: 15px;
  --density-line-height: 1.6;
  --density-padding: 16px;
  --density-gap: 16px;
  --density-row-height: 48px;
}
```

#### 影響箇所
- テーブル行の高さ（見積一覧、実績一覧）
- カードのパディング（レポート、クイック入力）
- フォームフィールドのサイズ
- サイドバーのナビ項目の高さ

#### 実装ステップ
1. CSS変数による密度トークンの定義
2. 既存CSSのハードコード値を変数に置換
3. 設定画面で3段階の切替UI
4. モバイルでは「ゆったり」を強制（タップ領域確保）

#### 工数見積
- 中（2-3日）

---

### 10-2. フォーカスモード

#### 現状の課題
- 「今日の実績を入力するだけ」の人にとって画面の情報が多すぎる
- サイドバー、フィルター、統計情報が入力の邪魔

#### 提案内容
- 入力フォームだけを中央に大きく表示するモード
- `F11`キーまたはボタンで切替
- 入力完了後に自動的に通常モードに戻る

#### 実装方針

```css
.focus-mode .sidebar { display: none; }
.focus-mode .tab-header { display: none; }
.focus-mode .filter-bar { display: none; }
.focus-mode .main-content {
  max-width: 600px;
  margin: 0 auto;
  padding-top: 10vh;
}
.focus-mode .quick-input-form {
  transform: scale(1.1);
}
```

#### 工数見積
- 小（1日）

---

### 10-3. カラム表示のカスタマイズ

#### 現状の課題
- テーブルに表示される列が固定
- 不要な列（人日換算、工程など）を非表示にして見やすくしたい

#### 提案内容
- 各テーブルビューで表示列をチェックボックスで選択
- 設定はテーブルごとに保存

#### 実装方針

```javascript
// js/state.js
const columnPreferences = {
  estimateMatrix: {
    visible: ['version', 'task', 'process', 'member', 'hours', 'workMonths'],
    hidden: ['mandays', 'taskSequenceIndex']
  },
  actualList: {
    visible: ['date', 'version', 'task', 'process', 'member', 'hours'],
    hidden: ['createdAt', 'completedAt']
  }
};
```

##### UI変更
```
テーブルヘッダー右上:
┌─────────┐
│ ⚙ カラム │ ← クリックでドロップダウン
├─────────┤
│ ☑ 日付   │
│ ☑ バージョン│
│ ☑ タスク  │
│ ☑ 工程   │
│ ☑ メンバー│
│ ☑ 時間   │
│ ☐ 人日   │
│ ☐ 作成日  │
└─────────┘
```

#### 工数見積
- 中（2日）

---

### 10-4. 行の折りたたみ

#### 現状の課題
- バージョン/タスク数が増えると一覧が長大になり全体像が見えない
- グループ化表示では折りたたみがない

#### 提案内容
- バージョン単位、タスク単位で行の折りたたみ/展開
- 折りたたみ状態の保持

#### 実装方針

```javascript
// 折りたたみ状態管理
const collapseState = {
  'v2.0': false,           // false = 展開
  'v2.0/ログイン画面': true  // true = 折りたたみ
};

function toggleCollapse(key) {
  collapseState[key] = !collapseState[key];
  renderTable();
}
```

##### UI変更
```
│ ▼ v2.0 (合計: 120h)                     │  ← クリックで折りたたみ
│   ▼ ログイン画面 (40h)                    │
│     UI  / 森  / 10h                      │
│     PG  / 森  / 20h                      │
│     PT  / 田中 / 10h                     │
│   ▶ API設計 (50h)                        │  ← 折りたたまれた行
│   ▼ テスト (30h)                          │
│     IT  / 佐藤 / 15h                     │
│     ST  / 佐藤 / 15h                     │
│ ▶ v1.5 (合計: 80h)                       │  ← バージョン単位で折りたたみ
```

#### 工数見積
- 中（2日）

---

## 11. データビジュアライゼーション

### 11-1. ヒートマップ（貢献度カレンダー）

#### 現状の課題
- カレンダービューは日付と実績リストを表示するが、工数の多寡が直感的にわからない
- 「忙しかった日」と「余裕があった日」を一目で把握したい

#### 提案内容
- GitHubのContribution Graphのような工数ヒートマップ
- 色の濃さで1日の合計工数を表現
- 年間/月間の俯瞰ビュー

#### 実装方針

```javascript
/**
 * ヒートマップデータの生成
 * @param {Array} actuals - 実績データ
 * @param {string} year - 対象年
 * @returns {Map} 日付→工数のマッピング
 */
function generateHeatmapData(actuals, year) {
  const heatmap = new Map();

  for (const actual of actuals) {
    if (!actual.date.startsWith(year)) continue;
    const current = heatmap.get(actual.date) || 0;
    heatmap.set(actual.date, current + actual.hours);
  }

  return heatmap;
}

/**
 * 工数→色の変換
 * 0h: #ebedf0 (薄いグレー)
 * 1-3h: #9be9a8 (薄い緑)
 * 4-6h: #40c463 (緑)
 * 7-8h: #30a14e (濃い緑)
 * 9h+: #216e39 (最も濃い緑)
 */
function hoursToColor(hours, isDarkMode = false) {
  const lightColors = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
  const darkColors = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
  const colors = isDarkMode ? darkColors : lightColors;

  if (hours === 0) return colors[0];
  if (hours <= 3) return colors[1];
  if (hours <= 6) return colors[2];
  if (hours <= 8) return colors[3];
  return colors[4];
}
```

##### UI変更
```
レポートタブ or 実績タブに追加:
┌─ 📅 年間工数ヒートマップ (2026) ──────────────────────┐
│                                                       │
│     1月    2月    3月    4月                           │
│ 月 ░░░░░ ░░░░░ ▓▓▓▓░ ▓▓░░░                          │
│ 火 ░░░░░ ▓░░░░ ▓▓▓░░ ▓░░░░                          │
│ 水 ░▓░░░ ▓▓░░░ ▓▓▓▓░ ░░░░░                          │
│ 木 ░░░░░ ░▓░░░ ▓▓▓▓▓ ░░░░░                          │
│ 金 ░░▓░░ ░░░░░ ▓▓▓░░ ░░░░░                          │
│                                                       │
│ 凡例: ░なし ░1-3h ▒4-6h ▓7-8h █9h+                    │
│                                                       │
│ 年間合計: 1,240h  平均: 6.2h/営業日  入力率: 92%       │
└───────────────────────────────────────────────────────┘
```

##### 実装方針（SVG描画）
```html
<!-- SVGベースのヒートマップ -->
<svg width="720" height="120">
  <!-- 各日のセル: 12px × 12px, 2pxギャップ -->
  <rect x="0" y="0" width="12" height="12" rx="2"
        fill="#40c463" data-date="2026-01-05" data-hours="5.0">
    <title>2026-01-05: 5.0h</title>
  </rect>
  <!-- ... -->
</svg>
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/report.js` | ヒートマップデータ集計・SVG生成 |
| `js/ui.js` | ヒートマップセクションの表示切替 |
| `index.html` | ヒートマップコンテナのHTML |
| `style.css` | ヒートマップのレスポンシブ・ツールチップスタイル |

##### 実装ステップ
1. ヒートマップデータ生成関数
2. SVGレンダリング（年間ビュー: 52週 × 7日）
3. 色分け関数（テーマカラー対応）
4. ホバーでのツールチップ表示
5. クリックでその日の実績一覧に遷移
6. 月間ビューの実装
7. ダークモード対応
8. 年/月の切替フィルター

##### 工数見積
- 中（2-3日）

---

### 11-2. バーンダウンチャート

#### 現状の課題
- 「あとどれだけ作業が残っているか」の推移が見えない
- 進捗が順調なのか遅れているのかの客観的な指標がない

#### 提案内容
- 残工数（見積合計 - 実績消化分）の日次推移を折れ線で表示
- 理想線（均等消化した場合の線）との比較
- バージョン/タスク単位で表示切替

#### 実装方針

```javascript
/**
 * バーンダウンチャートデータの生成
 * @param {string} version - 対象バージョン
 * @param {string} startDate - 開始日
 * @param {string} endDate - 終了日
 */
function generateBurndown(version, startDate, endDate) {
  const totalEstimate = estimates
    .filter(e => e.version === version)
    .reduce((sum, e) => sum + e.hours, 0);

  const dailyActuals = actuals
    .filter(a => a.version === version)
    .reduce((acc, a) => {
      acc[a.date] = (acc[a.date] || 0) + a.hours;
      return acc;
    }, {});

  // 理想線（線形）
  const workDays = getWorkDaysBetween(startDate, endDate);
  const dailyBurn = totalEstimate / workDays.length;
  const idealLine = workDays.map((date, i) => ({
    date,
    remaining: totalEstimate - dailyBurn * (i + 1)
  }));

  // 実績線（累積）
  let consumed = 0;
  const actualLine = workDays.map(date => {
    consumed += dailyActuals[date] || 0;
    return { date, remaining: totalEstimate - consumed };
  });

  return { totalEstimate, idealLine, actualLine };
}
```

##### UI変更
```
┌─ 📉 バーンダウンチャート ──────────────────────┐
│                                                │
│ バージョン: [v2.0 ▼]                            │
│                                                │
│ 200h ┤╲                                       │
│      │  ╲─── 理想線                            │
│ 150h ┤    ╲                                    │
│      │      ╲      ╱─ 実績線                   │
│ 100h ┤        ╲  ╱                             │
│      │          ╳  ← 遅れ始めたポイント          │
│  50h ┤        ╱  ╲                             │
│      │      ╱      ╲                           │
│   0h ┤────────────────╲─                       │
│       4/1   4/8   4/15  4/22  4/30             │
│                                                │
│ 現在の状況: 15h 遅れ（理想: 残80h / 実績: 残95h）│
│ 予測完了日: 5/8 （当初: 4/30）                   │
└────────────────────────────────────────────────┘
```

##### 実装ステップ
1. バーンダウンデータの集計関数
2. Canvas描画（理想線 + 実績線の折れ線グラフ）
3. 予測完了日の計算（直近の消化速度から外挿）
4. ホバーで日次詳細表示
5. バージョン/タスクフィルター
6. レポートセクションへの組み込み

##### 工数見積
- 中（3日）

---

### 11-3. ツリーマップ

#### 提案内容
- バージョン→タスク→工程の階層を面積で表現
- 面積 = 工数の比率
- クリックでドリルダウン

#### 実装方針

```javascript
/**
 * ツリーマップデータの生成
 * Squarifiedアルゴリズムで面積配分
 */
function generateTreemapData(data, level = 'version') {
  const tree = {};

  for (const item of data) {
    const path = [item.version, item.task, item.process];
    let current = tree;

    for (const segment of path) {
      if (!current[segment]) current[segment] = { children: {}, hours: 0 };
      current[segment].hours += item.hours;
      current = current[segment].children;
    }
  }

  return tree;
}

/**
 * Squarifiedレイアウト
 * 目標: なるべく正方形に近い矩形で面積を分割
 */
function squarify(data, rect) {
  // 面積比に基づいて矩形を再帰的に分割
  const sorted = Object.entries(data)
    .sort((a, b) => b[1].hours - a[1].hours);

  // ... Squarifiedアルゴリズム実装
}
```

##### UI変更
```
┌─ 🌳 工数ツリーマップ ─────────────────────────────┐
│                                                    │
│ ┌────────────────────────┬──────────────┐         │
│ │                        │              │         │
│ │   v2.0 / ログイン画面   │  v2.0 / API  │         │
│ │      (120h)            │   (80h)      │         │
│ │                        │              │         │
│ ├──────────────┬─────────┼──────────────┤         │
│ │  v1.5        │ v2.0    │   v1.5       │         │
│ │  バグ修正     │ テスト   │   保守       │         │
│ │  (50h)       │ (40h)   │   (30h)      │         │
│ └──────────────┴─────────┴──────────────┘         │
│                                                    │
│ クリックでドリルダウン | 合計: 320h                  │
└────────────────────────────────────────────────────┘
```

##### 工数見積
- 大（3-4日）

---

### 11-4. サンキーダイアグラム

#### 提案内容
- 工程間の工数フロー（設計→実装→テストの比率）を可視化
- メンバー→工程、工程→タスクの関係を視覚的に

#### 実装方針
- SVGベースの描画
- ノード（工程/メンバー）間のフロー幅 = 工数比率
- ホバーでフローのハイライト

##### 工数見積
- 大（4-5日）

---

## まとめ

| # | 改善 | 優先度 | 工数 | 効果 |
|---|------|--------|------|------|
| 9 | ダークモード | 高 | 大 | 目の疲労軽減、モダンUI |
| 10-1 | コンパクトモード | 中 | 中 | 大画面での情報量最適化 |
| 10-2 | フォーカスモード | 中 | 小 | 入力に集中できる環境 |
| 10-3 | カラム表示カスタマイズ | 中 | 中 | 不要情報の排除 |
| 10-4 | 行の折りたたみ | 高 | 中 | 大量データの俯瞰 |
| 11-1 | ヒートマップ | 高 | 中 | 工数パターンの直感的把握 |
| 11-2 | バーンダウンチャート | 高 | 中 | 進捗の可視化 |
| 11-3 | ツリーマップ | 低 | 大 | 工数配分の俯瞰 |
| 11-4 | サンキーダイアグラム | 低 | 大 | 工程フローの可視化 |
