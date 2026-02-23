# 工数管理システム - アーキテクチャ構成

> **このファイルについて**
> - プロジェクトのファイル構成と各ファイルの役割を記載
> - ファイル追加・削除・変更時は必ずこのドキュメントも更新する
> - 最終更新: 2026-01-24

## 📁 ファイル構成

```
/
├── index.html              (HTML構造のみ)
├── style.css               (全CSS)
├── js/
│   ├── state.js           (グローバル変数・状態管理)
│   ├── storage.js         (localStorage操作・バックアップ)
│   ├── estimate.js        (見積管理機能 - メイン)
│   ├── estimate-add.js    (見積追加機能)
│   ├── estimate-edit.js   (見積編集機能)
│   ├── estimate-split.js  (見積分割機能)
│   ├── estimate-selection.js (見積選択機能)
│   ├── actual.js          (実績管理機能)
│   ├── quick.js           (クイック入力機能)
│   ├── report.js          (レポート・分析機能)
│   ├── vacation.js        (休暇・休日管理)
│   ├── other-work.js      (その他作業・会議)
│   ├── theme.js           (テーマ・UI設定)
│   ├── modal.js           (モーダル操作)
│   ├── ui.js              (UI操作・DOM操作)
│   ├── events.js          (イベントハンドラ統合)
│   ├── utils.js           (ユーティリティ関数)
│   └── init.js            (初期化処理)
├── CLAUDE.md              (開発ガイド・Claude Code指示)
├── 修正案リスト.md         (機能改善・修正案リスト)
└── ARCHITECTURE.md        (このファイル)
```

---

## 📄 各ファイルの詳細

### **index.html** (~2,000行)
**役割**: HTML構造のみを定義

**内容**:
- DOCTYPE宣言
- `<head>`: メタ情報、外部ライブラリ（SheetJS、japanese-holidays）の読み込み
- `<body>`: アプリケーションのDOM構造
- `<link rel="stylesheet" href="style.css">`
- `<script type="module" src="js/init.js"></script>`

**注意点**:
- スタイルは全て style.css に記述
- スクリプトは全て js/ ディレクトリに分割
- onclick 属性は維持（init.js で window に関数を公開）

---

### **style.css** (~1,500行)
**役割**: 全てのスタイル定義

**内容**:
- 元の index.html の 8-1492行目（`<style>` タグ内）
- レスポンシブデザイン（ブレークポイント: 768px）
- テーマカラー対応（CSS変数使用）
- モーダル、タブ、ボタン、フォームなどのスタイル

---

### **js/state.js** (~100行)
**役割**: グローバル変数・状態管理の一元化

**主要な変数**:
- `estimates` - 見積データ配列
- `actuals` - 実績データ配列
- `filteredEstimates` - フィルタリングされた見積データ
- `companyHolidays` - 会社休日データ
- `vacations` - 個人休暇データ
- `remainingEstimates` - 見込残存時間データ
- `nextCompanyHolidayId`, `nextVacationId` - ID管理
- `reportSettings` - レポート分析機能の設定
- `chartColorSchemes` - グラフカラースキーム定義

**エクスポート**:
```javascript
export let estimates = [];
export let actuals = [];
export function setEstimates(value) { estimates = value; }
export function setActuals(value) { actuals = value; }
// ... 他の変数とsetter
```

**依存関係**: なし（全モジュールから参照される）

---

### **js/storage.js** (~200行)
**役割**: localStorage操作とバックアップ機能

**主要関数**:
- `loadData()` - localStorage読み込み、初期データ設定
- `saveData(skipAutoBackup)` - データをlocalStorageに保存
- `exportBackup()` - バックアップJSONファイル出力
- `importBackup()` - バックアップファイル選択
- `handleFileImport(event)` - バックアップファイル読み込み・復元
- `autoBackup()` - 自動バックアップ処理
- `loadAutoBackupSetting()` - 自動バックアップ設定読み込み
- `saveAutoBackupSetting()` - 自動バックアップ設定保存

**依存関係**:
- `state.js` - 全グローバル変数
- `ui.js` - UI更新関数
- `theme.js` - テーマ設定

---

### **js/estimate.js** (42KB)
**役割**: 見積管理機能 - メイン表示・フィルタリング

**主要関数**:
- `renderEstimateList()` - 見積一覧表示
- `renderEstimateGrouped()` - グループ化表示
- `renderEstimateMatrix()` - マトリクス表示
- `renderEstimateListView()` - リスト表示
- `deleteEstimate(id)` - 見積削除
- `deleteTask(version, task)` - タスク削除
- フィルタリング・集計関連関数

**依存関係**:
- `state.js` - estimates
- `storage.js` - saveData
- `ui.js` - UI更新
- `utils.js` - ユーティリティ関数

---

### **js/estimate-add.js** (23KB)
**役割**: 見積追加機能

**主要関数**:
- `addEstimate()` - 見積追加（通常）
- `addEstimateWithMonthSplit()` - 見積追加（月分割）
- `clearEstimateForm()` - 見積フォームクリア
- `toggleMonthSplit()` - 月分割入力モード切替
- `updateMonthPreview()` - 月プレビュー更新
- 月分割関連の計算・UI更新関数

**依存関係**:
- `state.js` - estimates
- `storage.js` - saveData
- `ui.js` - UI更新

---

### **js/estimate-edit.js** (20KB)
**役割**: 見積編集機能

**主要関数**:
- `editTask(version, taskName)` - タスク編集
- `closeEditTaskModal()` - タスク編集モーダルを閉じる
- `saveTaskEdit()` - タスク編集を保存
- `toggleEstimateEditMode()` - 見積編集モード切替

**依存関係**:
- `state.js` - estimates
- `storage.js` - saveData
- `ui.js` - UI更新

---

### **js/estimate-split.js** (15KB)
**役割**: 見積分割機能

**主要関数**:
- `openSplitEstimateModal(id)` - 見積分割モーダル表示
- `closeSplitEstimateModal()` - 見積分割モーダル閉じる
- `updateSplitPreview()` - 分割プレビュー更新
- `executeSplitEstimate()` - 見積分割実行

**依存関係**:
- `state.js` - estimates
- `storage.js` - saveData

---

### **js/estimate-selection.js** (7KB)
**役割**: 見積選択・作業月一括割り当て

**主要関数**:
- `toggleWorkMonthSelectionMode()` - 作業月選択モード切替
- `toggleEstimateSelection(id, event)` - 見積選択/解除
- `selectTaskEstimates(version, task, event)` - タスク単位で選択
- `executeWorkMonthAssignment()` - 作業月一括割り当て実行
- `cancelWorkMonthSelection()` - 作業月選択キャンセル

**依存関係**:
- `state.js` - estimates
- `storage.js` - saveData

---

### **js/actual.js** (57KB)
**役割**: 実績管理機能

**主要関数**:
- `deleteActual(id)` - 実績削除
- 実績フィルタリング関連関数
- 実績リスト表示関連関数

**依存関係**:
- `state.js` - actuals
- `storage.js` - saveData
- `ui.js` - UI更新

---

### **js/quick.js** (22KB)
**役割**: クイック入力タブの機能

**主要関数**:
- `switchQuickInputMode(mode)` - クイック入力モード切替（actual/estimate/vacation）
- `quickAddActual()` - クイック実績追加
- `addQuickEstimate()` - クイック見積追加
- `addQuickEstimateNormal()` - クイック見積追加（通常）
- `addQuickEstimateWithMonthSplit()` - クイック見積追加（月分割）
- `updateQuickTaskList()` - タスクリスト更新
- `updateQuickMemberSelect()` - 担当者セレクト更新
- `handleMemberChange()` - 担当者変更ハンドラ
- `showQuickTaskDropdown()` - タスクドロップダウン表示
- `hideQuickTaskDropdown()` - タスクドロップダウン非表示
- `clearQuickTaskSelection()` - タスク選択クリア
- `filterQuickTaskList()` - タスクリストフィルタリング
- `selectQuickTask(value, display)` - タスク選択
- `renderTodayActuals()` - 今日の実績を表示
- `switchQuickEstMonthType()` - 見積月タイプ切替
- `updateQuickEstWorkMonthUI()` - 見積作業月UI更新
- `updateQuickEstimateTableHeader()` - 見積テーブルヘッダー更新
- `calculateDefaultWorkMonths()` - デフォルト作業月計算
- `updateDefaultProcessMonths()` - 各工程のデフォルト月更新
- `updateQuickEstimateTotals()` - 見積合計更新
- `toggleQuickMonthSplit()` - 月分割パネル表示切替
- `updateQuickMonthPreview()` - 月プレビュー更新
- `handleQuickFormNameChange()` - 帳票名変更ハンドラ

**依存関係**:
- `state.js` - estimates, actuals
- `storage.js` - saveData
- `ui.js` - UI更新
- `utils.js` - ユーティリティ関数
- `vacation.js` - 休暇関連

---

### **js/report.js** (110KB)
**役割**: レポート・分析機能（グラフ描画を含む）

**主要関数**:
- `updateReport()` - レポート更新（メイン処理）
- `renderReportAnalytics()` - 分析セクション表示
  - 精度スコア計算
  - 異常検知
  - 警告タスク表示
  - トレンド分析
  - インサイト生成
- `renderReportGrouped()` - グループ化レポート表示（版数→タスク→工程）
- `renderReportMatrix()` - マトリクスレポート表示（担当者×タスク）
- `renderMemberReport()` - 担当者別レポート表示
- `renderVersionReport()` - 版数別レポート表示
- `loadReportSettings()` - レポート設定読み込み
- `saveReportSettings()` - レポート設定保存
- `getAnalysisGradients()` - 分析グラデーション色取得

**依存関係**:
- `state.js` - estimates, actuals, reportSettings
- `chart.js` - グラフ描画
- `utils.js` - getDeviationColor, normalizeEstimate
- `ui.js` - UI更新

---

### **js/vacation.js** (~400行)
**役割**: 休暇・休日管理機能

**主要関数**:
- `addQuickVacation()` - クイック休暇追加
- `deleteVacation(id)` - 休暇削除
- `deleteVacationFromModal(id, member, date)` - モーダルから休暇削除
- `addVacationFromCalendar(member, date)` - カレンダーから休暇追加
- `saveVacationFromModal()` - モーダルから休暇保存
- `closeVacationModal()` - 休暇モーダル閉じる
- `handleVacationTypeChange()` - 休暇タイプ変更ハンドラ
- `handleVacationModalTypeChange()` - モーダル内休暇タイプ変更
- `addCompanyHoliday()` - 会社休日追加
- `deleteCompanyHoliday(id)` - 会社休日削除
- `renderCompanyHolidayList()` - 会社休日リスト表示
- `isCompanyHoliday(dateStr)` - 会社休日判定
- `getCompanyHolidayName(dateStr)` - 会社休日名取得
- `getVacation(member, dateStr)` - 休暇取得

**依存関係**:
- `state.js` - vacations, companyHolidays
- `storage.js` - saveData
- `ui.js` - UI更新

---

### **js/other-work.js** (~200行)
**役割**: その他作業・会議の管理

**主要関数**:
- `addMeeting()` - 会議追加
- `addOtherWork()` - その他作業追加
- `openOtherWorkModal()` - その他作業モーダル表示
- `closeOtherWorkModal()` - その他作業モーダル閉じる
- `switchOtherWorkTab(tab)` - その他作業タブ切替（会議/その他）

**依存関係**:
- `state.js` - actuals
- `storage.js` - saveData
- `quick-input.js` - renderTodayActuals

---

### **js/theme.js** (~500行)
**役割**: テーマ・UI設定管理

**主要関数**:
- `loadThemeSettings()` - テーマ設定読み込み
- `applyTheme()` - テーマ適用
- `updateThemePreview()` - テーマプレビュー更新
- `updateThemeElements()` - テーマ要素更新
- `updateBodyBackground()` - 背景更新
- `updateElementTheme(element)` - 要素にテーマ適用
- `getThemeColor()` - テーマカラー取得
- `getActiveChartColorScheme()` - アクティブなグラフカラースキーム取得
- `saveChartColorScheme()` - グラフカラースキーム保存
- `loadChartColorScheme()` - グラフカラースキーム読み込み
- `updateChartColorPreview()` - カラープレビュー更新
- `updateFloatingFilterTheme()` - フローティングフィルタテーマ更新
- `toggleMonthColorsSetting()` - 月別色表示設定切替
- `toggleDeviationColorsSetting()` - 差異色表示設定切替
- `toggleProgressBarsSetting()` - プログレスバー表示設定切替
- `toggleProgressPercentageSetting()` - プログレスバー%表示設定切替
- `saveProgressBarStyle()` - プログレスバースタイル保存
- `saveMatrixEstActFormat()` - マトリクス見積実績表示形式保存
- `saveMatrixDayMonthFormat()` - マトリクス人日人月表示形式保存

**依存関係**:
- `state.js` - chartColorSchemes

---

### **js/modal.js** (~400行)
**役割**: モーダル操作・ドラッグ処理

**主要関数**:
- `setupModalHandlers()` - モーダルハンドラ設定
- `initDragHandle()` - ドラッグハンドル初期化
- `handleMouseDown(event)` - マウスダウンハンドラ
- `handleModalClose(event)` - モーダルクローズハンドラ
- `openSplitEstimateModal(id)` - 分割見積モーダル表示
- `closeSplitEstimateModal()` - 分割見積モーダル閉じる
- `showProcessBreakdown(version, task, process, filteredActuals, filteredEstimates)` - 工程内訳モーダル表示
- `closeProcessBreakdownModal()` - 工程内訳モーダル閉じる
- `openRemainingHoursModal(version, task, process)` - 見込残存時間モーダル表示
- `closeRemainingHoursModal()` - 見込残存時間モーダル閉じる
- `updateRemainingHoursInput(version, task, process, member)` - 見込残存時間入力更新
- `updateRemainingHoursActualsList(version, task, process, member)` - 見込残存時間実績リスト更新
- `saveRemainingHoursFromModal()` - 見込残存時間保存
- `closeWorkMonthAssignmentMode()` - 作業月割り当てモード終了

**依存関係**:
- `state.js` - estimates, actuals
- `chart.js` - グラフ描画
- `storage.js` - saveData

---

### **js/events.js** (32KB)
**役割**: イベントハンドラ統合（HTML onclick属性の代替）

**主要関数**:
- HTML要素のイベントリスナー登録
- クリック・変更イベントハンドラ
- 各モジュールの関数を呼び出す橋渡し役

**依存関係**:
- 全モジュール - イベント発生時に各モジュールの関数を呼び出し

---

### **js/ui.js** (89KB)
**役割**: UI操作・DOM操作

**主要関数**:
- `showTab(tabName)` - タブ切替
- `nextTab()` - 次のタブへ移動
- `prevTab()` - 前のタブへ移動
- `initTabSwipe()` - タブスワイプ初期化
- `updateMemberOptions()` - 担当者オプション更新
- `updateVersionOptions()` - 版数オプション更新
- `updateFormNameOptions()` - 帳票名オプション更新
- `updateReportVersionOptions(sortedVersions)` - レポート版数オプション更新
- `updateMonthOptions()` - 月オプション更新
- `updateEstimateMonthOptions()` - 見積月オプション更新
- `updateActualMonthOptions()` - 実績月オプション更新
- `updateEstimateVersionOptions()` - 見積版数オプション更新
- `getDefaultMonth(selectElement)` - デフォルト月取得
- `setDefaultActualMonth()` - デフォルト実績月設定
- `setDefaultReportMonth()` - デフォルトレポート月設定
- `setDefaultEstimateMonth()` - デフォルト見積月設定
- `handleVersionChange(selectId)` - 版数変更ハンドラ
- `handleEditActualMemberChange()` - 実績編集担当者変更ハンドラ
- `handleQuickFormNameChange()` - クイック帳票名変更ハンドラ
- `handleAddFormNameChange()` - 追加帳票名変更ハンドラ
- `handleEditFormNameChange()` - 編集帳票名変更ハンドラ
- `handleEstimateTaskInput()` - 見積タスク入力ハンドラ
- `handleEstimateFilterTypeChange()` - 見積フィルタタイプ変更ハンドラ
- `setEstimateFilterType(type)` - 見積フィルタタイプ設定
- `setEstimateViewType(type)` - 見積表示タイプ設定
- `setActualViewType(type)` - 実績表示タイプ設定
- `setReportViewType(type)` - レポート表示タイプ設定
- `applyLayoutSettings()` - レイアウト設定適用
- `toggleFilterLayout(page, version)` - フィルタレイアウト切替
- `applyDefaultEstimateViewType()` - デフォルト見積表示タイプ適用
- `applyDefaultReportViewType()` - デフォルトレポート表示タイプ適用
- `saveDefaultViewTypeSetting()` - デフォルト表示タイプ設定保存
- `updateLayoutToggleButtons()` - レイアウト切替ボタン更新
- `updateSegmentedButtons()` - セグメントボタン更新
- `createSegmentButtons(containerId, selectId, items, currentValue, maxItems, onClickHandler)` - セグメントボタン生成
- `updateSegmentButtonSelection(containerId, value)` - セグメントボタン選択更新
- `togglePhaseCollapse(phaseId)` - フェーズ折り畳み切替
- `showMemberOrderHelp()` - 担当者順序ヘルプ表示
- `updateAllDisplays()` - 全表示更新

**依存関係**:
- `state.js` - 全グローバル変数
- `storage.js` - saveData
- `estimate.js` - 見積関連
- `report.js` - updateReport
- `theme.js` - テーマ関連

---

### **js/utils.js** (~300行)
**役割**: ユーティリティ関数

**主要関数**:
- `showAlert(message, dismissible)` - カスタムアラート表示
- `closeCustomAlert()` - カスタムアラート閉じる
- `normalizeEstimate(e)` - 見積データ正規化
- `generateMonthRange(startMonth, endMonth)` - 月範囲生成
- `generateMonthOptions(selectId, selectedValue, minValue)` - 月オプション生成
- `getDeviationColor(estimate, actual)` - 差異カラー取得
- `getMonthColor(workMonths)` - 月カラー取得
- `generateMonthColorLegend(usedMonths, hasMultipleMonths, hasUnassigned)` - 月色凡例生成

**依存関係**: なし（ユーティリティのみ）

---

### **js/init.js** (~200行)
**役割**: アプリケーション初期化・モジュール統合

**内容**:
1. 全モジュールのインポート
2. グローバルスコープへの関数公開（HTML onclick対応）
3. DOMContentLoaded イベントで初期化実行

**主要処理**:
```javascript
// 全モジュールをインポート
import * as State from './state.js';
import * as Storage from './storage.js';
import * as Estimate from './estimate.js';
// ... 他のモジュール

// グローバルスコープに公開（HTML onclick用）
window.showTab = UI.showTab;
window.quickAddActual = QuickInput.quickAddActual;
window.addEstimate = Estimate.addEstimate;
// ... 他の関数

// 初期化処理
document.addEventListener('DOMContentLoaded', function() {
    Storage.loadData();
    UI.initTabSwipe();
    Theme.applyTheme();
    Modal.setupModalHandlers();
    Modal.initDragHandle();
    Filter.loadStickyFilterSetting();
    Filter.loadFloatingFilterSetting();
    Storage.loadAutoBackupSetting();
    // ... 他の初期化
});
```

**依存関係**: 全モジュール

---

## 🔗 依存関係グラフ

```
state.js (基盤)
    ↓
storage.js → ui.js → report.js (グラフ描画含む)
    ↓         ↓         ↓
estimate.js   ↓     theme.js
  ├─ estimate-add.js
  ├─ estimate-edit.js
  ├─ estimate-split.js
  └─ estimate-selection.js
    ↓         ↓         ↓
actual.js     ↓
vacation.js   ↓         ↓
other-work.js ↓         ↓
    ↓         ↓         ↓
  quick.js → modal.js
    ↓         ↓
  utils.js (ユーティリティ)
    ↓
  events.js (イベントハンドラ統合)
    ↓
  init.js (統合・初期化)
```

---

## 🛠️ 技術仕様

### モジュールシステム
- **ES Modules** (type="module")
- `export` / `import` で依存関係を明示
- HTML の `onclick` 属性のため、init.js で `window` オブジェクトに関数を公開

### グローバル変数の管理
- **state.js** で一元管理
- 各モジュールは state.js をインポートして使用
- 変更が必要な場合は setter 関数を提供

### ファイルサイズ制約
- **制約なし** - GitHub Pages で静的ファイルとして配信
- ビルド工程・トランスパイル・バンドラは不使用
- ブラウザが直接 ES Modules を読み込む

### 互換性
- モダンブラウザ（ES6+ 対応）
- type="module" サポート必須

---

## 📝 変更履歴

### 2026-01-24
- アーキテクチャドキュメントを最新の構成に更新
- 19個のJavaScriptモジュール構成に更新
- estimate関連を5ファイルに分割（estimate.js, estimate-add.js, estimate-edit.js, estimate-split.js, estimate-selection.js）
- floating-filter.js を削除（フローティングフィルタ・スティッキーフィルタ機能廃止）
- events.js を追加（イベントハンドラ統合）
- chart.js を削除（report.js に統合）
- quick-input.js → quick.js に名称変更

### 2026-01-17
- 初版作成
- 単一HTMLファイルから複数ファイル構成に分割
- 17個のJavaScriptモジュールに機能分割
- CSS を style.css に分離
