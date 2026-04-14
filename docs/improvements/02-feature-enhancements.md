# B. 機能拡張 設計書

> **カテゴリ**: 機能面の改善・追加
> **改善数**: 22件
> **優先度**: 高
> **関連ファイル**: js/report.js, js/schedule.js, js/schedule-render.js, js/storage.js, js/state.js

---

## 5. コラボレーション機能

### 5-1. データ共有メカニズム

#### 現状の課題
- データはlocalStorageに保存されており、個人のブラウザ内に閉じている
- チームメンバー間でデータを共有するにはJSONファイルの手動やり取りが必要
- 「チーム全体の工数」を見るには全員分のデータを手動でマージする必要がある

#### 提案内容
- JSONエクスポート/インポートの半自動化（共有フォルダ連携）
- マージ戦略の実装（競合検出・解決UI）
- 将来的にはWebSocketやFirebaseでのリアルタイム同期（サーバーサイド要件）

#### 実装方針

##### マージ戦略
```javascript
/**
 * マージ方針:
 * 1. IDベースのマッチング（同一IDのレコードは新しい方を採用）
 * 2. 新規レコード（相手にしかないID）は追加
 * 3. 競合レコード（同じIDで内容が異なる）はユーザーに確認
 */
function mergeData(localData, importedData) {
  const result = { added: [], updated: [], conflicts: [] };

  for (const imported of importedData) {
    const local = localData.find(l => l.id === imported.id);
    if (!local) {
      result.added.push(imported);
    } else if (JSON.stringify(local) !== JSON.stringify(imported)) {
      // タイムスタンプ比較で自動解決を試みる
      if (imported.updatedAt > local.updatedAt) {
        result.updated.push(imported);
      } else {
        result.conflicts.push({ local, imported });
      }
    }
  }
  return result;
}
```

##### 競合解決UI
```
┌─ データマージ結果 ──────────────────────────┐
│                                             │
│ ✅ 追加: 5件  🔄 更新: 3件  ⚠️ 競合: 2件   │
│                                             │
│ ── 競合 1/2 ──────────────────────────────  │
│ v2.0 / ログイン画面 / PG / 森               │
│                                             │
│ 📂 ローカル:  40h (更新: 4/13 10:00)        │
│ 📥 インポート: 45h (更新: 4/13 15:00)       │
│                                             │
│ [ローカルを維持] [インポートを採用] [スキップ] │
│                                             │
│ ── 競合 2/2 ──────────────────────────────  │
│ ...                                         │
│                                             │
│                     [すべて適用]              │
└─────────────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/storage.js` | mergeData(), detectConflicts()関数追加 |
| `js/ui.js` | 競合解決モーダルのレンダリング |
| `js/state.js` | updatedAtフィールドの追加（全エンティティ） |
| `index.html` | マージモーダルのHTML |
| `style.css` | 差分表示・競合ハイライトのスタイル |

##### 実装ステップ
1. 全エンティティにupdatedAtフィールドを追加
2. マージアルゴリズムの実装
3. 競合解決UIの構築
4. インポートフローのリファクタ（単純上書き → マージ提案）
5. マージ結果のサマリー表示

##### 工数見積
- 中〜大（3-4日）

---

### 5-2. メンバー別ビュー / チームビュー

#### 現状の課題
- レポートで個人とチーム全体の切り替えが直感的でない
- 「自分だけの工数」と「チーム全体の工数」を素早く行き来したい

#### 提案内容
- ヘッダーに「個人/チーム」トグルスイッチ
- 個人モード: ログインユーザー（設定で指定）のデータのみ表示
- チームモード: 全メンバーのデータを表示

#### 実装方針

```javascript
// js/state.js に追加
let currentViewMode = 'team';      // 'personal' | 'team'
let currentUserMember = '';        // 設定画面で指定する「自分の名前」

// ビューモード切り替え
function setViewMode(mode) {
  currentViewMode = mode;
  // 全タブのフィルターを更新
  refreshAllViews();
}
```

##### UI変更
```
ヘッダーバー:
┌───────────────────────────────────────┐
│ 工数管理  [👤 個人] [👥 チーム]  ⚙️    │
└───────────────────────────────────────┘
```

##### 実装ステップ
1. 設定画面に「自分の名前」設定を追加
2. ヘッダーにトグルスイッチを追加
3. フィルターロジックにviewModeを組み込む
4. 各画面（見積/実績/レポート/スケジュール）にフィルター適用

##### 工数見積
- 中（2日）

---

### 5-3. コメント・メモ機能

#### 現状の課題
- 実績レコードに「なぜこの時間がかかったか」を記録する場所がない
- 振り返り時に数字だけでは背景がわからない

#### 提案内容
- 各実績/見積レコードにメモフィールドを追加
- メモ付きレコードにはバッジ表示

#### 実装方針

```javascript
// actual のデータモデル拡張
{
  id: "act_001",
  date: "2026-04-14",
  version: "v2.0",
  task: "ログイン画面",
  process: "PG",
  member: "森",
  hours: 3.0,
  memo: "認証ロジックの仕様変更対応で想定より時間がかかった",  // 追加
  createdAt: "2026-04-14T10:00:00"
}
```

##### UI変更
```
実績入力フォーム:
┌──────────────────────────────────────┐
│ 時間: [3.0] h                        │
│                                      │
│ メモ (任意):                          │
│ ┌──────────────────────────────────┐ │
│ │ 認証ロジックの仕様変更対応で      │ │
│ │ 想定より時間がかかった           │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘

実績一覧:
│ 4/14 │ ログイン │ PG │ 3.0h │ 💬 │  ← メモアイコン（ホバーで表示）
```

##### 実装ステップ
1. データモデルにmemoフィールド追加
2. 入力フォームにtextareaを追加
3. 一覧表示でのメモバッジ/ツールチップ
4. 既存データとの後方互換性確保

##### 工数見積
- 小（1日）

---

## 6. レポート・分析の強化

### 6-1. 時系列トレンドグラフ

#### 現状の課題
- レポートは現時点のスナップショットのみ
- 「先月と比べてどう変化したか」が見えない
- 工数の増減傾向を把握できない

#### 提案内容
- 週次/月次の工数推移を折れ線グラフで表示
- メンバー別、工程別のトレンド比較
- 移動平均線による平滑化

#### 実装方針

##### データ集計
```javascript
/**
 * 週次トレンドデータの生成
 * @param {Array} actuals - 実績データ
 * @param {string} groupBy - 'member' | 'process' | 'version'
 * @param {number} weeks - 集計する週数
 */
function generateWeeklyTrend(actuals, groupBy, weeks = 12) {
  const weeklyData = {};

  for (const actual of actuals) {
    const weekStart = getWeekStart(actual.date);
    const key = actual[groupBy];

    if (!weeklyData[weekStart]) weeklyData[weekStart] = {};
    if (!weeklyData[weekStart][key]) weeklyData[weekStart][key] = 0;
    weeklyData[weekStart][key] += actual.hours;
  }

  return weeklyData;
}
```

##### UI変更
```
レポートタブに新セクション追加:
┌─ 📈 トレンド分析 ────────────────────────────────┐
│                                                   │
│ 表示: [週次 ▼]  グループ: [メンバー別 ▼]  期間: 12週│
│                                                   │
│ 80h ┤                                             │
│     │          ╱╲                                 │
│ 60h ┤    ╱╲  ╱  ╲  ╱──                           │
│     │   ╱  ╲╱    ╲╱                               │
│ 40h ┤──╱                    ── 森                  │
│     │                       ── 田中                │
│ 20h ┤                       ── 佐藤                │
│     │                                             │
│   0 ┼──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──        │
│       W1 W2 W3 W4 W5 W6 W7 W8 W9 W10W11W12      │
│                                                   │
│ 平均: 森 52h/週  田中 48h/週  佐藤 35h/週          │
└───────────────────────────────────────────────────┘
```

##### 実装方針（Canvas描画）
- 既存のスケジュール画面でCanvas描画の実績があるため、同様のアプローチを採用
- グラフ描画用のユーティリティ関数群を `js/chart-utils.js` として新規作成
- レスポンシブ対応（Canvas幅のリサイズ追従）

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/chart-utils.js` | 新規: グラフ描画ユーティリティ |
| `js/report.js` | トレンド集計・表示セクション追加 |
| `js/ui.js` | トレンドフィルターUI |
| `index.html` | Canvas要素・フィルターUI |
| `style.css` | トレンドセクションのスタイル |

##### 実装ステップ
1. chart-utils.js: 軸描画、折れ線描画、凡例表示の汎用関数
2. 週次/月次の集計関数
3. メンバー別/工程別/バージョン別のグループ化
4. Canvas上でのインタラクション（ホバーでツールチップ）
5. 期間選択フィルター
6. 移動平均線のオプション

##### 工数見積
- 大（4-5日）

---

### 6-2. メンバー負荷バランス表示

#### 現状の課題
- 特定メンバーに負荷が偏っていても気づきにくい
- 「誰が忙しくて誰に余裕があるか」の一覧がない

#### 提案内容
- メンバー×月の工数ヒートマップ
- 負荷率（実績/稼働可能時間）のバー表示
- アンバランスの自動検出・アラート

#### 実装方針

##### UI変更
```
レポートタブに新セクション追加:
┌─ 👥 メンバー負荷バランス ──────────────────────┐
│                                                │
│ 期間: 2026年4月                                │
│                                                │
│ 森   ████████████████████░░░░ 160h/176h (91%) │ ⚠ 高負荷
│ 田中 ████████████████░░░░░░░░ 130h/176h (74%) │
│ 佐藤 ████████████░░░░░░░░░░░░ 100h/176h (57%) │
│ 鈴木 █████████████████████░░░ 168h/176h (95%) │ 🔴 過負荷
│                                                │
│ チーム平均: 79%  標準偏差: 16%                   │
│ ⚠ 負荷の偏りが大きいです（σ > 15%）             │
└────────────────────────────────────────────────┘
```

##### 稼働可能時間の計算
```javascript
function getAvailableHours(member, month) {
  const workDays = getWorkDaysInMonth(month);  // 営業日数
  const vacationDays = getVacationDays(member, month);
  const holidayDays = getCompanyHolidays(month);

  const availableDays = workDays - vacationDays - holidayDays;
  return availableDays * 8;  // 1日8時間
}
```

##### 実装ステップ
1. 稼働可能時間の計算（営業日 - 休暇 - 祝日）
2. メンバー別実績集計
3. 負荷率バーのレンダリング
4. 偏り検出（標準偏差計算）
5. 閾値超過時のアラート表示

##### 工数見積
- 中（2-3日）

---

### 6-3. カスタムレポート（ピボットテーブル）

#### 現状の課題
- レポートの軸（行/列）が固定で、独自の集計ができない
- 「タスク×月」「メンバー×工程」などの自由な組み合わせが見たい

#### 提案内容
- 行軸・列軸・値をユーザーが自由に選択できるピボットテーブル
- 行/列: バージョン、タスク、工程、メンバー、月、週
- 値: 実績時間（合計/平均）、見積時間、乖離率

#### 実装方針

```javascript
/**
 * ピボットテーブル生成
 * @param {Array} data - 元データ
 * @param {string} rowField - 行軸フィールド
 * @param {string} colField - 列軸フィールド
 * @param {string} valueField - 値フィールド
 * @param {string} aggregation - 'sum' | 'avg' | 'count'
 */
function pivot(data, rowField, colField, valueField, aggregation = 'sum') {
  const result = {};
  const colKeys = new Set();

  for (const item of data) {
    const rowKey = item[rowField] || '(未設定)';
    const colKey = item[colField] || '(未設定)';
    colKeys.add(colKey);

    if (!result[rowKey]) result[rowKey] = {};
    if (!result[rowKey][colKey]) result[rowKey][colKey] = [];
    result[rowKey][colKey].push(item[valueField]);
  }

  // 集計
  for (const row of Object.keys(result)) {
    for (const col of Object.keys(result[row])) {
      const values = result[row][col];
      result[row][col] = aggregation === 'sum'
        ? values.reduce((a, b) => a + b, 0)
        : aggregation === 'avg'
          ? values.reduce((a, b) => a + b, 0) / values.length
          : values.length;
    }
  }

  return { data: result, columns: [...colKeys].sort() };
}
```

##### UI変更
```
┌─ 📊 カスタムレポート ─────────────────────────┐
│                                               │
│ 行: [タスク ▼]  列: [月 ▼]  値: [実績合計 ▼]  │
│                                               │
│           │ 2月   │ 3月   │ 4月   │ 合計  │
│ ──────────┼───────┼───────┼───────┼───────│
│ ログイン   │  20h  │  35h  │  15h  │  70h  │
│ API設計    │  15h  │  40h  │  30h  │  85h  │
│ テスト     │   -   │  10h  │  25h  │  35h  │
│ ──────────┼───────┼───────┼───────┼───────│
│ 合計      │  35h  │  85h  │  70h  │ 190h  │
│                                               │
│ [Excel出力] [コピー]                           │
└───────────────────────────────────────────────┘
```

##### 実装ステップ
1. ピボットエンジン（汎用関数）の実装
2. 軸選択UIの構築
3. テーブルレンダリング（合計行/列の自動計算）
4. ソート・フィルター機能
5. Excel/CSVエクスポート
6. レポートプリセットの保存/呼出

##### 工数見積
- 大（4-5日）

---

### 6-4. PDF/画像エクスポート

#### 現状の課題
- レポートをそのまま経営層に見せる手段がない
- スクリーンショットは解像度・範囲の問題がある
- Excel出力はあるが、ビジュアルなレポートが欲しい

#### 提案内容
- レポート画面をPDFとして出力
- 個別のチャート/テーブルを画像（PNG）として出力

#### 実装方針

```javascript
// html2canvas + jsPDFアプローチ（外部ライブラリ）
// もしくはブラウザのprint APIを活用

/**
 * レポートセクションをPDF出力
 * ブラウザのprint APIを活用したゼロ依存アプローチ
 */
function exportReportAsPDF() {
  // 印刷用CSSを適用
  document.body.classList.add('print-mode');

  // 不要な要素を非表示（サイドバー、フィルター、ボタン）
  // A4横向きに最適化したレイアウトを適用

  window.print();

  document.body.classList.remove('print-mode');
}
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `style.css` | `@media print`セクションの追加 |
| `js/report.js` | PDF出力ボタン・処理 |

##### 実装ステップ
1. `@media print` CSSの作成（サイドバー非表示、余白調整、ページ区切り）
2. 印刷用のヘッダー/フッター（日付、ページ番号）
3. Canvas要素のprint対応（img変換）
4. 「PDFエクスポート」ボタンの追加
5. 印刷プレビューの確認・調整

##### 工数見積
- 中（2-3日）

---

### 6-5. ベロシティ計算

#### 提案内容
- スプリント/期間ごとの工数消化速度を計算
- 残工数からの完了予測日を表示
- バーンダウンチャート

#### 実装方針

```javascript
/**
 * ベロシティ計算
 * @param {Array} actuals - 実績データ
 * @param {string} periodType - 'weekly' | 'biweekly' | 'monthly'
 */
function calculateVelocity(actuals, periodType = 'weekly') {
  const periods = groupByPeriod(actuals, periodType);
  const velocities = periods.map(p => p.totalHours);

  return {
    current: velocities[velocities.length - 1],
    average: velocities.reduce((a, b) => a + b, 0) / velocities.length,
    trend: calculateTrend(velocities),  // 上昇/下降/安定
    forecast: forecastCompletion(velocities, getRemainingHours())
  };
}
```

##### 工数見積
- 中（2-3日）

---

### 6-6. コスト換算

#### 提案内容
- 工数×単価で金額ベースの分析
- メンバーランク/スキルレベル別の単価設定
- 予算対比の表示

#### 実装方針

```javascript
// 設定画面で単価を管理
const costSettings = {
  defaultRate: 5000,        // デフォルト単価（円/h）
  memberRates: {
    "森": 6000,
    "田中": 5000,
    "佐藤": 4000
  },
  currency: "JPY",
  budgets: {
    "v2.0": 5000000          // バージョン別予算
  }
};
```

##### 工数見積
- 中（2日）

---

## 7. スケジュール管理の強化

### 7-1. クリティカルパス表示

#### 現状の課題
- ガントチャートでタスクの時間軸は見えるが、どのタスクが遅延すると全体に影響するかわからない
- プロジェクトマネージャーが「今何を急ぐべきか」を判断する材料が不足

#### 提案内容
- 依存関係を定義し、クリティカルパスを自動計算
- クリティカルパス上のタスクを赤くハイライト

#### 実装方針

```javascript
// スケジュールデータの拡張
{
  id: "sch_001",
  // ... 既存フィールド
  dependencies: ["sch_000"],  // 先行タスクのID
  isCritical: false           // 計算結果（動的）
}

/**
 * クリティカルパス計算（CPM法）
 * 1. Forward Pass: 最早開始時刻（ES）・最早終了時刻（EF）を計算
 * 2. Backward Pass: 最遅開始時刻（LS）・最遅終了時刻（LF）を計算
 * 3. フロート = LS - ES （フロート0のタスクがクリティカルパス上）
 */
function calculateCriticalPath(schedules) {
  // Forward Pass
  for (const sch of topologicalSort(schedules)) {
    sch.es = Math.max(0, ...sch.dependencies.map(d => d.ef));
    sch.ef = sch.es + sch.duration;
  }

  // Backward Pass
  const projectEnd = Math.max(...schedules.map(s => s.ef));
  for (const sch of topologicalSort(schedules).reverse()) {
    const successors = schedules.filter(s => s.dependencies.includes(sch.id));
    sch.lf = successors.length ? Math.min(...successors.map(s => s.ls)) : projectEnd;
    sch.ls = sch.lf - sch.duration;
  }

  // フロート計算
  for (const sch of schedules) {
    sch.float = sch.ls - sch.es;
    sch.isCritical = sch.float === 0;
  }

  return schedules.filter(s => s.isCritical);
}
```

##### ガントチャートでの表示
```
通常タスク:   ████████████  （通常の色）
クリティカル: ████████████  （赤色 + 太枠 + ⚡マーク）
依存関係:     ──────────▶   （矢印線で接続）
```

##### 実装ステップ
1. 依存関係フィールドの追加（データモデル拡張）
2. 依存関係の設定UI（ドラッグで線を引く or セレクトボックス）
3. CPM計算エンジンの実装
4. ガントチャート上のクリティカルパスハイライト描画
5. 依存関係の矢印線の描画
6. トポロジカルソートの実装（循環依存の検出含む）

##### 工数見積
- 大（5-7日）

---

### 7-2. 自動リスケジュール

#### 提案内容
- タスクの遅延時、後続タスクの日程を自動で調整する提案を表示
- 「適用」ボタンで一括変更、または個別に調整

#### 実装方針

```javascript
/**
 * 遅延影響のシミュレーション
 * @param {string} delayedScheduleId - 遅延したスケジュールID
 * @param {number} delayDays - 遅延日数
 * @returns {Array} 影響を受けるスケジュールと新しい日程の提案
 */
function simulateDelay(delayedScheduleId, delayDays) {
  const affected = [];
  const queue = [delayedScheduleId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const successors = schedules.filter(s =>
      s.dependencies.includes(currentId)
    );

    for (const successor of successors) {
      const newStart = addBusinessDays(successor.startDate, delayDays);
      const newEnd = addBusinessDays(successor.endDate, delayDays);

      affected.push({
        id: successor.id,
        originalStart: successor.startDate,
        originalEnd: successor.endDate,
        proposedStart: newStart,
        proposedEnd: newEnd,
        delayDays
      });

      queue.push(successor.id);
    }
  }

  return affected;
}
```

##### 工数見積
- 中（2-3日、クリティカルパスの依存関係が前提）

---

### 7-3. マイルストーン管理

#### 提案内容
- ガントチャート上にマイルストーン（◆マーク）を配置
- リリース日、レビュー日、デモ日などのイベントを登録

#### 実装方針

```javascript
// データモデル
const milestones = [
  {
    id: "ms_001",
    name: "α版リリース",
    date: "2026-05-01",
    type: "release",        // release / review / demo / deadline
    color: "#E53E3E",
    description: "社内テスト用のα版"
  }
];
```

##### ガントチャートでの表示
```
          4月                          5月
──────────────────────────────────────────────
  ████████████████                    ◆ α版リリース
     ████████████████████████
        ██████████
──────────────────────────────────────────────
                                      │
                                      ▼ 縦線で強調
```

##### 実装ステップ
1. マイルストーンのデータモデル定義
2. マイルストーン登録/編集モーダル
3. ガントチャート上のマイルストーン描画（◆マーク + 縦線）
4. マイルストーンまでの残日数表示

##### 工数見積
- 中（2日）

---

### 7-4. リソース平準化

#### 提案内容
- メンバーの日別/週別の稼働率を計算
- 100%を超えるオーバーアロケーションを検出
- タスクのシフト提案（余裕のある日/メンバーに移動）

#### 実装方針

```javascript
/**
 * リソース平準化の提案
 * 過負荷日のタスクを余裕日に移動する案を生成
 */
function suggestLeveling(schedules, member) {
  const dailyLoad = calculateDailyLoad(schedules, member);
  const overloaded = dailyLoad.filter(d => d.hours > 8);
  const underloaded = dailyLoad.filter(d => d.hours < 6);

  const suggestions = [];
  for (const over of overloaded) {
    const excess = over.hours - 8;
    const candidate = underloaded.find(u =>
      u.hours + excess <= 8 &&
      isWithinDependencyConstraints(over.tasks, u.date)
    );

    if (candidate) {
      suggestions.push({
        task: over.tasks[over.tasks.length - 1],  // 最後のタスクを移動候補
        from: over.date,
        to: candidate.date,
        hours: excess
      });
    }
  }

  return suggestions;
}
```

##### 工数見積
- 大（3-4日）

---

## 8. データ管理の堅牢化

### 8-1. localStorage容量監視

#### 現状の課題
- localStorageの容量上限（5-10MB）に近づいても警告がない
- 上限到達で書き込み失敗 → データロスの可能性

#### 提案内容
- 現在の使用量をバイト単位で表示
- 閾値（80%）超過時にアラート
- データの圧縮オプション

#### 実装方針

```javascript
/**
 * localStorage使用量の計算
 */
function getStorageUsage() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('manhour_')) {
      total += localStorage.getItem(key).length * 2;  // UTF-16
    }
  }

  return {
    usedBytes: total,
    usedMB: (total / 1024 / 1024).toFixed(2),
    estimatedMaxMB: 5,
    percentage: ((total / (5 * 1024 * 1024)) * 100).toFixed(1)
  };
}
```

##### UI変更（設定画面）
```
┌─ ストレージ使用量 ──────────────────────┐
│                                        │
│ ████████████░░░░░░░░ 3.2MB / 5MB (64%) │
│                                        │
│ 内訳:                                  │
│   実績データ:   1.8MB (56%)             │
│   見積データ:   0.8MB (25%)             │
│   スケジュール: 0.4MB (13%)             │
│   設定・その他: 0.2MB (6%)              │
│                                        │
│ [古いデータを圧縮] [不要データを削除]     │
└────────────────────────────────────────┘
```

##### 実装ステップ
1. ストレージ使用量の計算関数
2. 設定画面にウィジェット追加
3. カテゴリ別の内訳計算
4. 閾値超過アラート
5. 古いデータのアーカイブ/圧縮機能

##### 工数見積
- 小〜中（1-2日）

---

### 8-2. IndexedDB移行

#### 現状の課題
- localStorage: 5-10MB上限、同期API（大量データでUIブロック）
- データ量がチーム規模に比例して増加し、上限に到達するリスク

#### 提案内容
- IndexedDBへの段階的移行
- 移行期間中はlocalStorageとのデュアルライト
- 非同期APIによるUI応答性の改善

#### 実装方針

```javascript
/**
 * IndexedDB ストレージアダプタ
 * storage.jsのインターフェースを維持しつつバックエンドを切替
 */
class IndexedDBStorage {
  constructor(dbName = 'manhour_db', version = 1) {
    this.dbName = dbName;
    this.version = version;
  }

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // オブジェクトストアの作成
        if (!db.objectStoreNames.contains('estimates')) {
          const store = db.createObjectStore('estimates', { keyPath: 'id' });
          store.createIndex('version', 'version');
          store.createIndex('member', 'member');
        }
        if (!db.objectStoreNames.contains('actuals')) {
          const store = db.createObjectStore('actuals', { keyPath: 'id' });
          store.createIndex('date', 'date');
          store.createIndex('member', 'member');
          store.createIndex('version', 'version');
        }
        if (!db.objectStoreNames.contains('schedules')) {
          db.createObjectStore('schedules', { keyPath: 'id' });
        }
        // ... 他のストア
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put(storeName, data) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
```

##### 移行戦略
```
Phase 1: ストレージアダプタ層の導入（localStorage直接呼出をラップ）
Phase 2: IndexedDBアダプタの実装（同じインターフェース）
Phase 3: デュアルライト（両方に書き込み、IndexedDBから読み出し）
Phase 4: localStorage書き込み停止、マイグレーションユーティリティ提供
Phase 5: localStorage完全廃止
```

##### 工数見積
- 大〜特大（5-7日）

---

### 8-3. PWA化（Service Worker）

#### 提案内容
- Service Workerによるオフライン動作
- プッシュ通知（入力リマインダー）
- ホーム画面追加（App Shell）

#### 実装方針

```javascript
// service-worker.js
const CACHE_NAME = 'manhour-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/js/init.js',
  '/js/state.js',
  // ... すべてのJSファイル
  '/lib/xlsx.mjs',
  '/lib/japanese-holidays.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
```

```json
// manifest.json
{
  "name": "工数管理システム",
  "short_name": "工数管理",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F7F6F3",
  "theme_color": "#2D5A27",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

##### 実装ステップ
1. manifest.jsonの作成
2. Service Workerの実装（キャッシュ戦略: Cache First）
3. index.htmlへのSW登録コード追加
4. オフライン時のフォールバック画面
5. アイコンの作成（192x192, 512x512）
6. キャッシュの更新戦略（バージョニング）

##### 工数見積
- 中〜大（3-4日）

---

## まとめ

| # | 改善 | 優先度 | 工数 | 依存関係 |
|---|------|--------|------|----------|
| 5-1 | データ共有/マージ | 高 | 中〜大 | なし |
| 5-2 | 個人/チームビュー | 中 | 中 | なし |
| 5-3 | コメント・メモ | 高 | 小 | なし |
| 6-1 | 時系列トレンド | 高 | 大 | chart-utils新規作成 |
| 6-2 | 負荷バランス | 高 | 中 | なし |
| 6-3 | カスタムレポート | 中 | 大 | なし |
| 6-4 | PDF出力 | 低 | 中 | なし |
| 6-5 | ベロシティ | 中 | 中 | なし |
| 6-6 | コスト換算 | 低 | 中 | なし |
| 7-1 | クリティカルパス | 高 | 大 | データモデル拡張 |
| 7-2 | 自動リスケジュール | 中 | 中 | 7-1が前提 |
| 7-3 | マイルストーン | 中 | 中 | なし |
| 7-4 | リソース平準化 | 低 | 大 | 7-1推奨 |
| 8-1 | 容量監視 | 高 | 小〜中 | なし |
| 8-2 | IndexedDB移行 | 中 | 大〜特大 | ストレージアダプタ |
| 8-3 | PWA化 | 中 | 中〜大 | なし |
