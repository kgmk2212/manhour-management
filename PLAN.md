# 工数管理システム - ファイル分割実装計画（詳細版）

## 目標
約16,000行の index.html を17ファイルに分割する。

## 制約
- フレームワーク、トランスパイル、バンドラ禁止
- ES Modules のみ使用
- 挙動を一切変えない（リファクタリングのみ）
- HTML の onclick 属性は維持

---

## 📁 17ファイル構成

### Phase 1: 基盤構築（完了✅）
1. **style.css** (1,482行) ✅
2. **js/state.js** (約300行) ✅
3. **js/utils.js** (約200行) ✅

### Phase 2: 機能モジュール作成（4/12完了）
4. **js/vacation.js** (約200行) ✅
5. **js/storage.js** (約300行) ⬜
6. **js/theme.js** (約500行) ⬜
7. **js/chart.js** (約600行) ⬜
8. **js/modal.js** (約400行) ⬜
9. **js/filter.js** (約600行) ⬜
10. **js/other-work.js** (約200行) ⬜
11. **js/estimate.js** (約800行) ⬜
12. **js/actual.js** (約300行) ⬜
13. **js/quick-input.js** (約600行) ⬜
14. **js/report.js** (約1,200行) ⬜
15. **js/ui.js** (約1,000行) ⬜

### Phase 3: 統合（1/2完了）
16. **js/init.js** (約200行) ✅
17. **index.html** (更新済み、クリーンアップ待ち) ⬜

---

## 📋 各モジュールの詳細

### ✅ js/state.js (完了)
**グローバル変数・状態管理（30個）**

エクスポート内容：
- データ配列: `estimates`, `actuals`, `filteredEstimates`
- 休日・休暇: `companyHolidays`, `vacations`, `remainingEstimates`
- ID管理: `nextCompanyHolidayId`, `nextVacationId`
- 設定: `reportSettings`, `chartColorSchemes`, `phaseCollapsed`, `selectedChartColorScheme`
- 月カラー: `monthColors`
- 表示設定: `showMonthColorsSetting`, `showDeviationColorsSetting`, `showProgressBarsSetting`, `showProgressPercentageSetting`, `progressBarStyle`, `matrixEstActFormat`, `matrixDayMonthFormat`, `debugModeEnabled`
- Setter関数（各変数用）

### ✅ js/utils.js (完了)
**ユーティリティ関数（8個）**

1. `showAlert(message, dismissible)` - カスタムアラート表示
2. `closeCustomAlert()` - アラートを閉じる
3. `normalizeEstimate(e)` - 見積データ正規化
4. `generateMonthRange(startMonth, endMonth)` - 月範囲生成
5. `generateMonthOptions(selectId, selectedValue, minValue)` - 月選択肢生成
6. `getMonthColor(workMonths)` - 月から背景色取得
7. `generateMonthColorLegend(usedMonths, hasMultipleMonths, hasUnassigned)` - 月カラー凡例生成
8. `getDeviationColor(estimate, actual)` - 乖離率から背景色取得

### ✅ js/vacation.js (完了)
**休暇・休日管理（14個）**

会社休日関連：
1. `addCompanyHoliday()` - 会社休日追加
2. `deleteCompanyHoliday(id)` - 会社休日削除
3. `renderCompanyHolidayList()` - 会社休日リスト表示
4. `isCompanyHoliday(dateStr)` - 会社休日判定
5. `getCompanyHolidayName(dateStr)` - 会社休日名取得

個人休暇関連：
6. `handleVacationTypeChange()` - 休暇タイプ変更ハンドラ
7. `addQuickVacation()` - クイック休暇追加
8. `deleteVacation(id)` - 休暇削除
9. `deleteVacationFromModal(id, member, date)` - モーダルから休暇削除
10. `addVacationFromCalendar(member, date)` - カレンダーから休暇追加
11. `closeVacationModal()` - 休暇モーダルを閉じる
12. `handleVacationModalTypeChange()` - モーダル内休暇タイプ変更
13. `saveVacationFromModal()` - モーダルから休暇保存
14. `getVacation(member, dateStr)` - 休暇取得

---

## ⬜ 未完了モジュールの詳細

### 1. js/storage.js (最優先)
**localStorage・バックアップ（9関数）**

1. `loadData()` - localStorage読み込み、初期データ設定
2. `saveData(skipAutoBackup)` - データをlocalStorageに保存
3. `exportBackup()` - バックアップJSONファイル出力
4. `importBackup()` - バックアップファイル選択
5. `handleFileImport(event)` - バックアップファイル読み込み・復元
6. `autoBackup()` - 自動バックアップ処理
7. `loadAutoBackupSetting()` - 自動バックアップ設定読み込み
8. `saveAutoBackupSetting()` - 自動バックアップ設定保存
9. `updateMemberOptions()` - 担当者オプション更新（saveData内で使用）

依存: state.js, ui.js, theme.js

### 2. js/theme.js
**テーマ・UI設定（20関数）**

1. `loadThemeSettings()` - テーマ設定読み込み
2. `applyTheme()` - テーマ適用
3. `updateThemePreview()` - テーマプレビュー更新
4. `updateThemeElements()` - テーマ要素更新
5. `updateBodyBackground()` - 背景更新
6. `updateElementTheme(element)` - 要素にテーマ適用
7. `getThemeColor()` - テーマカラー取得
8. `getActiveChartColorScheme()` - アクティブなグラフカラースキーム取得
9. `saveChartColorScheme()` - グラフカラースキーム保存
10. `loadChartColorScheme()` - グラフカラースキーム読み込み
11. `updateChartColorPreview()` - カラープレビュー更新
12. `updateFloatingFilterTheme()` - フローティングフィルタテーマ更新
13. `toggleMonthColorsSetting()` - 月別色表示設定切替
14. `toggleDeviationColorsSetting()` - 差異色表示設定切替
15. `toggleProgressBarsSetting()` - プログレスバー表示設定切替
16. `toggleProgressPercentageSetting()` - プログレスバー%表示設定切替
17. `saveProgressBarStyle()` - プログレスバースタイル保存
18. `saveMatrixEstActFormat()` - マトリクス見積実績表示形式保存
19. `saveMatrixDayMonthFormat()` - マトリクス人日人月表示形式保存
20. `applyDefaultEstimateViewType()` - デフォルト見積表示タイプ適用
21. `applyDefaultReportViewType()` - デフォルトレポート表示タイプ適用

依存: state.js

### 3. js/chart.js
**グラフ描画（7関数）**

1. `drawMemberComparisonChart(members, memberSummary)` - 担当者比較棒グラフ
2. `drawMemberDonutChart(member, index, filteredEstimates, filteredActuals)` - 担当者別ドーナツグラフ
3. `drawBreakdownDonutChart(canvasId, memberData, dataType, members, total)` - 工程内訳ドーナツグラフ
4. グラフ描画ユーティリティ関数（複数）

依存: state.js, theme.js

### 4. js/modal.js
**モーダル操作（15関数）**

1. `setupModalHandlers()` - モーダルハンドラ設定
2. `initDragHandle()` - ドラッグハンドル初期化
3. `handleMouseDown(event)` - マウスダウンハンドラ
4. `handleModalClose(event)` - モーダルクローズハンドラ
5. `openSplitEstimateModal(id)` - 分割見積モーダル表示
6. `closeSplitEstimateModal()` - 分割見積モーダル閉じる
7. `showProcessBreakdown(version, task, process, filteredActuals, filteredEstimates)` - 工程内訳モーダル表示
8. `closeProcessBreakdownModal()` - 工程内訳モーダル閉じる
9. `openRemainingHoursModal(version, task, process)` - 見込残存時間モーダル表示
10. `closeRemainingHoursModal()` - 見込残存時間モーダル閉じる
11. `updateRemainingHoursInput(version, task, process, member)` - 見込残存時間入力更新
12. `updateRemainingHoursActualsList(version, task, process, member)` - 見込残存時間実績リスト更新
13. `saveRemainingHoursFromModal()` - 見込残存時間保存
14. `closeWorkMonthAssignmentMode()` - 作業月割り当てモード終了
15. その他モーダル関連関数

依存: state.js, chart.js, storage.js

### 5. js/filter.js
**フィルタ管理（25関数）**

Sticky Filter:
1. `saveStickyFilterSetting()` - Sticky Filter設定保存
2. `loadStickyFilterSetting()` - Sticky Filter設定読み込み
3. `enableStickyFilters()` - Sticky Filter有効化
4. `disableStickyFilters()` - Sticky Filter無効化
5. `initStickyFilters()` - Sticky Filter初期化

Floating Filter:
6. `saveFloatingFilterSetting()` - Floating Filter設定保存
7. `loadFloatingFilterSetting()` - Floating Filter設定読み込み
8. `showFloatingFilterButton()` - Floating Filterボタン表示
9. `hideFloatingFilterButton()` - Floating Filterボタン非表示
10. `toggleFloatingFilterPanel(event)` - Floating Filterパネル切替
11. `syncFloatingFilters()` - Floating Filter同期
12. `setFloatingFilterType(type, applyToMain)` - Floating Filterタイプ設定
13. `setFloatingViewType(type, applyToMain)` - Floating Filter表示タイプ設定
14. `syncFloatingMonthFilter(value)` - Floating Filter月同期
15. `syncFloatingVersionFilter(value)` - Floating Filter版数同期

フィルタ変更ハンドラ:
16. `handleActualMonthChange(value, containerId)` - 実績月変更ハンドラ
17. `handleEstimateMonthChange(value, containerId)` - 見積月変更ハンドラ
18. `handleEstimateVersionChange(value, containerId)` - 見積版数変更ハンドラ
19. `handleReportMonthChange(value, containerId)` - レポート月変更ハンドラ
20. `handleReportVersionChange(value, containerId)` - レポート版数変更ハンドラ
21. `handleReportFilterTypeChange()` - レポートフィルタタイプ変更
22. `setReportFilterType(type)` - レポートフィルタタイプ設定
23. `syncMonthToReport(value)` - 月をレポートに同期
24. `syncVersionToReport(value)` - 版数をレポートに同期
25. その他フィルタ関連関数

依存: state.js, ui.js, report.js

### 6. js/other-work.js
**その他作業・会議（5関数）**

1. `addMeeting()` - 会議追加
2. `addOtherWork()` - その他作業追加
3. `openOtherWorkModal()` - その他作業モーダル表示
4. `closeOtherWorkModal()` - その他作業モーダル閉じる
5. `switchOtherWorkTab(tab)` - その他作業タブ切替（会議/その他）

依存: state.js, storage.js, quick-input.js

### 7. js/estimate.js (最大規模)
**見積管理（58関数）**

基本操作:
1. `addEstimate()` - 見積追加（通常）
2. `addEstimateWithMonthSplit()` - 見積追加（月分割）
3. `editTask(version, taskName)` - タスク編集
4. `closeEditTaskModal()` - タスク編集モーダルを閉じる
5. `saveTaskEdit()` - タスク編集を保存
6. `deleteEstimate(id)` - 見積削除
7. `deleteTask(version, task)` - タスク削除
8. `clearEstimateForm()` - 見積フォームクリア

編集モード:
9. `toggleEstimateEditMode()` - 見積編集モード切替
10. `toggleWorkMonthSelectionMode()` - 作業月選択モード切替
11. `toggleEstimateSelection(id, event)` - 見積選択/解除
12. `selectTaskEstimates(version, task, event)` - タスク単位で選択
13. `updateSelectedWorkHours()` - 選択された見積の合計工数更新
14. `executeWorkMonthAssignment()` - 作業月一括割り当て実行
15. `cancelWorkMonthSelection()` - 作業月選択キャンセル

見積分割:
16. `openSplitEstimateModal(id)` - 見積分割モーダル表示
17. `closeSplitEstimateModal()` - 見積分割モーダル閉じる
18. `updateSplitPreview()` - 分割プレビュー更新
19. `executeSplitEstimate()` - 見積分割実行

月分割入力:
20. `toggleMonthSplit()` - 月分割入力モード切替
21. `updateMonthPreview()` - 月プレビュー更新
22. `updateManualTotal()` - 手動入力合計更新
23. `updateSplitManualTotal()` - 分割手動入力合計更新

オプション更新:
24. `updateWorkMonthOptions()` - 作業月オプション更新
25. `updateVersionOptions()` - 版数オプション更新
26. `updateFormNameOptions()` - 帳票名オプション更新

表示関連:
27. `renderEstimateList()` - 見積一覧表示
28. `renderEstimateGrouped()` - グループ化表示
29. `renderEstimateMatrix()` - マトリクス表示
30. `renderEstimateListView()` - リスト表示
31-58. その他の見積関連関数（フィルタリング、集計、ソートなど）

依存: state.js, storage.js, ui.js, utils.js

### 8. js/actual.js
**実績管理（33関数）**

基本操作:
1. `deleteActual(id)` - 実績削除
2. `editActual(id)` - 実績編集
3. `saveEditActual()` - 実績編集保存
4. `closeEditActualModal()` - 実績編集モーダル閉じる

表示関連:
5. `renderActualList()` - 実績一覧表示
6. `renderActualMatrix()` - カレンダー表示
7. `renderActualListView()` - リスト表示
8. `showWorkDetail(member, date)` - 作業詳細表示
9. `closeWorkModal()` - 作業詳細モーダル閉じる

フィルタリング:
10-20. フィルタリング関連関数

集計:
21-33. 集計・統計関連関数

依存: state.js, storage.js, ui.js, vacation.js

### 9. js/quick-input.js
**クイック入力（24関数）**

モード切替:
1. `switchQuickInputMode(mode)` - クイック入力モード切替（actual/estimate/vacation）

実績入力:
2. `quickAddActual()` - クイック実績追加
3. `renderTodayActuals()` - 今日の実績を表示

見積入力:
4. `addQuickEstimate()` - クイック見積追加
5. `addQuickEstimateNormal()` - クイック見積追加（通常）
6. `addQuickEstimateWithMonthSplit()` - クイック見積追加（月分割）

タスク選択:
7. `updateQuickTaskList()` - タスクリスト更新
8. `showQuickTaskDropdown()` - タスクドロップダウン表示
9. `hideQuickTaskDropdown()` - タスクドロップダウン非表示
10. `clearQuickTaskSelection()` - タスク選択クリア
11. `filterQuickTaskList()` - タスクリストフィルタリング
12. `selectQuickTask(value, display)` - タスク選択

UI更新:
13. `updateQuickMemberSelect()` - 担当者セレクト更新
14. `handleMemberChange()` - 担当者変更ハンドラ
15. `switchQuickEstMonthType()` - 見積月タイプ切替
16. `updateQuickEstWorkMonthUI()` - 見積作業月UI更新
17. `updateQuickEstimateTableHeader()` - 見積テーブルヘッダー更新

月計算:
18. `calculateDefaultWorkMonths()` - デフォルト作業月計算
19. `updateDefaultProcessMonths()` - 各工程のデフォルト月更新
20. `updateQuickEstimateTotals()` - 見積合計更新

月分割:
21. `toggleQuickMonthSplit()` - 月分割パネル表示切替
22. `updateQuickMonthPreview()` - 月プレビュー更新
23. `handleQuickFormNameChange()` - 帳票名変更ハンドラ
24. その他クイック入力関連関数

依存: state.js, storage.js, ui.js, utils.js, vacation.js

### 10. js/report.js
**レポート・分析（30関数）**

メイン処理:
1. `updateReport()` - レポート更新（メイン処理）

分析機能:
2. `renderReportAnalytics()` - 分析セクション表示
   - 精度スコア計算
   - 異常検知
   - 警告タスク表示
   - トレンド分析
   - インサイト生成

表示形式:
3. `renderReportGrouped()` - グループ化レポート表示（版数→タスク→工程）
4. `renderReportMatrix()` - マトリクスレポート表示（担当者×タスク）
5. `renderMemberReport()` - 担当者別レポート表示
6. `renderVersionReport()` - 版数別レポート表示

設定:
7. `loadReportSettings()` - レポート設定読み込み
8. `saveReportSettings()` - レポート設定保存

ビジュアル:
9. `getAnalysisGradients()` - 分析グラデーション色取得
10-30. その他レポート関連関数（集計、フィルタリング、ソートなど）

依存: state.js, chart.js, utils.js, ui.js

### 11. js/ui.js
**UI操作・DOM操作（15個の主要関数 + 多数の補助関数）**

タブ操作:
1. `showTab(tabName)` - タブ切替
2. `nextTab()` - 次のタブへ移動
3. `prevTab()` - 前のタブへ移動
4. `initTabSwipe()` - タブスワイプ初期化

オプション更新:
5. `updateMemberOptions()` - 担当者オプション更新
6. `updateVersionOptions()` - 版数オプション更新
7. `updateFormNameOptions()` - 帳票名オプション更新
8. `updateReportVersionOptions(sortedVersions)` - レポート版数オプション更新
9. `updateMonthOptions()` - 月オプション更新
10. `updateEstimateMonthOptions()` - 見積月オプション更新
11. `updateActualMonthOptions()` - 実績月オプション更新
12. `updateEstimateVersionOptions()` - 見積版数オプション更新

デフォルト設定:
13. `getDefaultMonth(selectElement)` - デフォルト月取得
14. `setDefaultActualMonth()` - デフォルト実績月設定
15. `setDefaultReportMonth()` - デフォルトレポート月設定
16. `setDefaultEstimateMonth()` - デフォルト見積月設定

変更ハンドラ:
17. `handleVersionChange(selectId)` - 版数変更ハンドラ
18. `handleEditActualMemberChange()` - 実績編集担当者変更ハンドラ
19. `handleQuickFormNameChange()` - クイック帳票名変更ハンドラ
20. `handleAddFormNameChange()` - 追加帳票名変更ハンドラ
21. `handleEditFormNameChange()` - 編集帳票名変更ハンドラ
22. `handleEstimateTaskInput()` - 見積タスク入力ハンドラ

フィルタ・表示タイプ:
23. `handleEstimateFilterTypeChange()` - 見積フィルタタイプ変更ハンドラ
24. `setEstimateFilterType(type)` - 見積フィルタタイプ設定
25. `setEstimateViewType(type)` - 見積表示タイプ設定
26. `setActualViewType(type)` - 実績表示タイプ設定
27. `setReportViewType(type)` - レポート表示タイプ設定

レイアウト:
28. `applyLayoutSettings()` - レイアウト設定適用
29. `toggleFilterLayout(page, version)` - フィルタレイアウト切替
30. `applyDefaultEstimateViewType()` - デフォルト見積表示タイプ適用
31. `applyDefaultReportViewType()` - デフォルトレポート表示タイプ適用
32. `saveDefaultViewTypeSetting()` - デフォルト表示タイプ設定保存
33. `updateLayoutToggleButtons()` - レイアウト切替ボタン更新

セグメントボタン:
34. `updateSegmentedButtons()` - セグメントボタン更新
35. `createSegmentButtons(containerId, selectId, items, currentValue, maxItems, onClickHandler)` - セグメントボタン生成
36. `updateSegmentButtonSelection(containerId, value)` - セグメントボタン選択更新

その他:
37. `togglePhaseCollapse(phaseId)` - フェーズ折り畳み切替
38. `showMemberOrderHelp()` - 担当者順序ヘルプ表示
39. `updateAllDisplays()` - 全表示更新

依存: state.js, storage.js, estimate.js, report.js, theme.js

---

## 🔗 モジュール依存関係グラフ

```
state.js (基盤)
    ↓
utils.js, vacation.js
    ↓
storage.js → theme.js
    ↓         ↓
ui.js     chart.js
    ↓         ↓
estimate.js, actual.js, quick-input.js
    ↓
report.js, filter.js, modal.js, other-work.js
    ↓
init.js (統合)
```

---

## 🔍 重要な技術仕様

### グローバル変数の管理
```javascript
// state.js で export
export let estimates = [];
export function setEstimates(value) { estimates = value; }

// 他のモジュールで import
import { estimates, setEstimates } from './state.js';
```

### HTML onclick の橋渡し
```javascript
// init.js で window に公開（約100箇所）
import { quickAddActual } from './quick-input.js';
window.quickAddActual = quickAddActual;
```

### 初期化順序（init.js の DOMContentLoaded）
```javascript
1. loadData() - データ読み込み
2. updateMemberOptions() 等 - オプション更新
3. setupModalHandlers() - モーダル設定
4. renderEstimateList() 等 - 初期描画
5. initTabSwipe() - UI初期化
```

---

## ⚠️ リスク管理

### 高リスク項目
- **循環依存**: state.js を基盤として一方向依存を徹底
- **onclick 公開漏れ**: init.js で全約100箇所を明示的に公開
- **初期化順序**: 依存関係を考慮した順序で実行

### 対策
- 各モジュール作成後にブラウザコンソールで構文エラー確認
- 最終的に全機能を手動テスト
- Git で各ステップをコミット、問題時はロールバック

---

## ✅ 検証チェックリスト

### 機能別検証
- [ ] クイック入力（実績・見積・休暇）が動作
- [ ] 見積一覧（グループ・マトリクス・詳細）表示
- [ ] 実績一覧（カレンダー・マトリクス・リスト）表示
- [ ] レポート（サマリー・グループ・マトリクス）表示
- [ ] グラフ描画（ドーナツ・棒グラフ）動作
- [ ] モーダル（全10種類）開閉
- [ ] テーマ変更動作
- [ ] フィルタ（月別・版数別）動作
- [ ] バックアップ・復元動作
- [ ] localStorage 保存・読み込み

---

## 📝 成功の定義

1. 全ての既存機能が分割後も同じように動作する
2. 各ファイルが1,000行以下（report.js, ui.jsを除く）
3. 機能ごとにファイルが分かれ、関数が探しやすい
4. 既存のlocalStorageデータが問題なく読み込める
