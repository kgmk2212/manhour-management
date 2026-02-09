// ============================================
// モジュール統合・初期化処理
// ============================================

// 作成済みモジュールをインポート
import * as State from './state.js';
import * as Utils from './utils.js';
import * as Vacation from './vacation.js';
import * as Storage from './storage.js';
import * as UI from './ui.js';
import * as Theme from './theme.js';
import * as Estimate from './estimate.js';
import * as Actual from './actual.js';
import * as Quick from './quick.js';
import * as Report from './report.js';
import * as EstimateAdd from './estimate-add.js';
import * as OtherWork from './other-work.js';
import * as TabFilter from './tab-filter.js';
import * as Modal from './modal.js';
import * as EstimateEdit from './estimate-edit.js';
import * as EstimateSelection from './estimate-selection.js';
import * as EstimateSplit from './estimate-split.js';
import { initEventHandlers } from './events.js';
import * as Schedule from './schedule.js';

// ============================================
// グローバルスコープに公開（HTML onclick用）
// ============================================

// state.js のエクスポート（読み取り専用として公開）
window.estimates = State.estimates;
window.actuals = State.actuals;
window.filteredEstimates = State.filteredEstimates;
window.companyHolidays = State.companyHolidays;
window.vacations = State.vacations;
window.remainingEstimates = State.remainingEstimates;
window.nextCompanyHolidayId = State.nextCompanyHolidayId;
window.nextVacationId = State.nextVacationId;
window.reportSettings = State.reportSettings;
window.chartColorSchemes = State.chartColorSchemes;
window.phaseCollapsed = State.phaseCollapsed;
window.selectedChartColorScheme = State.selectedChartColorScheme;
window.monthColors = State.monthColors;
window.showMonthColorsSetting = State.showMonthColorsSetting;
window.reportMatrixBgColorMode = State.reportMatrixBgColorMode;
window.showProgressBarsSetting = State.showProgressBarsSetting;
window.showProgressPercentageSetting = State.showProgressPercentageSetting;
window.progressBarStyle = State.progressBarStyle;
window.matrixEstActFormat = State.matrixEstActFormat;
window.mobileTabDesign = State.mobileTabDesign;

window.debugModeEnabled = State.debugModeEnabled;
window.memberOrder = State.memberOrder;

// utils.js の関数
window.showAlert = Utils.showAlert;
window.closeCustomAlert = Utils.closeCustomAlert;
window.normalizeEstimate = Utils.normalizeEstimate;
window.generateMonthRange = Utils.generateMonthRange;
window.generateMonthOptions = Utils.generateMonthOptions;
window.getMonthColor = Utils.getMonthColor;
window.generateMonthColorLegend = Utils.generateMonthColorLegend;
window.getDeviationColor = Utils.getDeviationColor;

// vacation.js の関数
window.addCompanyHoliday = Vacation.addCompanyHoliday;
window.deleteCompanyHoliday = Vacation.deleteCompanyHoliday;
window.renderCompanyHolidayList = Vacation.renderCompanyHolidayList;
window.isCompanyHoliday = Vacation.isCompanyHoliday;
window.getCompanyHolidayName = Vacation.getCompanyHolidayName;
window.handleVacationTypeChange = Vacation.handleVacationTypeChange;
window.addQuickVacation = Vacation.addQuickVacation;
window.deleteVacation = Vacation.deleteVacation;
window.deleteVacationFromModal = Vacation.deleteVacationFromModal;
window.addVacationFromCalendar = Vacation.addVacationFromCalendar;
window.closeVacationModal = Vacation.closeVacationModal;
window.handleVacationModalTypeChange = Vacation.handleVacationModalTypeChange;
window.saveVacationFromModal = Vacation.saveVacationFromModal;
window.getVacation = Vacation.getVacation;

// storage.js の関数
window.loadAutoBackupSetting = Storage.loadAutoBackupSetting;
window.saveAutoBackupSetting = Storage.saveAutoBackupSetting;
window.saveData = Storage.saveData;
window.loadData = Storage.loadData;
window.autoBackup = Storage.autoBackup;
window.exportBackup = Storage.exportBackup;
window.importBackup = Storage.importBackup;
window.handleFileImport = Storage.handleFileImport;

// ui.js の関数
window.showTab = UI.showTab;
window.nextTab = UI.nextTab;
window.prevTab = UI.prevTab;
window.initTabSwipe = UI.initTabSwipe;
window.initSmartSticky = UI.initSmartSticky;
window.createSegmentButtons = UI.createSegmentButtons;
window.updateSegmentButtonSelection = UI.updateSegmentButtonSelection;
window.setEstimateViewType = UI.setEstimateViewType;
window.setActualViewType = UI.setActualViewType;
window.setReportViewType = UI.setReportViewType;
window.getThemeColor = UI.getThemeColor;
window.applyLayoutSettings = UI.applyLayoutSettings;
window.toggleFilterLayout = UI.toggleFilterLayout;
window.updateLayoutToggleButtons = UI.updateLayoutToggleButtons;
window.updateSegmentedButtons = UI.updateSegmentedButtons;
window.updateMemberOptions = UI.updateMemberOptions;
window.updateVersionOptions = UI.updateVersionOptions;
window.updateFormNameOptions = UI.updateFormNameOptions;
window.updateReportVersionOptions = UI.updateReportVersionOptions;
window.updateMonthOptions = UI.updateMonthOptions;
window.updateEstimateMonthOptions = UI.updateEstimateMonthOptions;
window.updateEstimateVersionOptions = UI.updateEstimateVersionOptions;
window.updateActualMonthOptions = UI.updateActualMonthOptions;
window.getDefaultMonth = UI.getDefaultMonth;
window.setDefaultActualMonth = UI.setDefaultActualMonth;
window.setDefaultReportMonth = UI.setDefaultReportMonth;
window.setDefaultEstimateMonth = UI.setDefaultEstimateMonth;
window.syncMonthToReport = UI.syncMonthToReport;
window.syncMonthToEstimate = UI.syncMonthToEstimate;
window.syncVersionToReport = UI.syncVersionToReport;
window.syncVersionToEstimate = UI.syncVersionToEstimate;
window.syncFilterTypeToReport = UI.syncFilterTypeToReport;
window.syncFilterTypeToEstimate = UI.syncFilterTypeToEstimate;
window.updateFilterTypeButtons = UI.updateFilterTypeButtons;
window.handleActualMemberChange = UI.handleActualMemberChange;
window.handleActualMonthChange = UI.handleActualMonthChange;
window.handleEstimateMonthChange = UI.handleEstimateMonthChange;
window.handleEstimateVersionChange = UI.handleEstimateVersionChange;
window.handleReportMonthChange = UI.handleReportMonthChange;
window.handleReportVersionChange = UI.handleReportVersionChange;
window.handleEstimateFilterTypeChange = UI.handleEstimateFilterTypeChange;
window.setEstimateFilterType = UI.setEstimateFilterType;
window.handleReportFilterTypeChange = UI.handleReportFilterTypeChange;
window.setReportFilterType = UI.setReportFilterType;
window.handleVersionChange = UI.handleVersionChange;
window.handleQuickFormNameChange = UI.handleQuickFormNameChange;
window.handleAddFormNameChange = UI.handleAddFormNameChange;
window.handleEditFormNameChange = UI.handleEditFormNameChange;
window.handleEditActualMemberChange = UI.handleEditActualMemberChange;
window.updateAllDisplays = UI.updateAllDisplays;
window.showMemberOrderHelp = UI.showMemberOrderHelp;

// theme.js の関数
window.getActiveChartColorScheme = Theme.getActiveChartColorScheme;
window.saveChartColorScheme = Theme.saveChartColorScheme;
window.loadChartColorScheme = Theme.loadChartColorScheme;
window.updateChartColorPreview = Theme.updateChartColorPreview;
window.loadThemeSettings = Theme.loadThemeSettings;
window.applyTheme = Theme.applyTheme;
window.updateThemePreview = Theme.updateThemePreview;
window.updateThemeElements = Theme.updateThemeElements;
window.updateBodyBackground = Theme.updateBodyBackground;
window.updateElementTheme = Theme.updateElementTheme;
window.toggleMonthColorsSetting = Theme.toggleMonthColorsSetting;
window.toggleDeviationColorsSetting = Theme.toggleDeviationColorsSetting;
window.toggleProgressBarsSetting = Theme.toggleProgressBarsSetting;
window.toggleProgressPercentageSetting = Theme.toggleProgressPercentageSetting;
window.saveProgressBarStyle = Theme.saveProgressBarStyle;
window.saveMatrixEstActFormat = Theme.saveMatrixEstActFormat;

window.saveDefaultViewTypeSetting = Theme.saveDefaultViewTypeSetting;
window.applyDefaultEstimateViewType = Theme.applyDefaultEstimateViewType;
window.applyDefaultReportViewType = Theme.applyDefaultReportViewType;

// estimate.js の関数
window.getWorkingDays = Estimate.getWorkingDays;
window.getCurrentMonthWorkingDays = Estimate.getCurrentMonthWorkingDays;
window.formatNumber = Estimate.formatNumber;
window.isOtherWork = Estimate.isOtherWork;
window.calculateDefaultWorkMonths = Estimate.calculateDefaultWorkMonths;
window.saveRemainingEstimate = Estimate.saveRemainingEstimate;
window.getRemainingEstimate = Estimate.getRemainingEstimate;
window.deleteRemainingEstimate = Estimate.deleteRemainingEstimate;
window.cleanupOrphanedRemainingEstimates = Estimate.cleanupOrphanedRemainingEstimates;
window.renderEstimateList = Estimate.renderEstimateList;
window.renderEstimateGrouped = Estimate.renderEstimateGrouped;
window.renderEstimateMatrix = Estimate.renderEstimateMatrix;
window.renderEstimateDetailList = Estimate.renderEstimateDetailList;
window.deleteEstimate = Estimate.deleteEstimate;
window.deleteTask = Estimate.deleteTask;
window.updateWorkMonthOptions = Estimate.updateWorkMonthOptions;
window.showEstimateDetail = Estimate.showEstimateDetail;
window.showOtherWorkTaskDetail = Estimate.showOtherWorkTaskDetail;
window.closeEstimateDetailModal = Estimate.closeEstimateDetailModal;
window.editEstimateFromModal = Estimate.editEstimateFromModal;
window.deleteEstimateFromModal = Estimate.deleteEstimateFromModal;

// estimate-edit.js の関数
window.editEstimate = EstimateEdit.editEstimate;
window.closeEditEstimateModal = EstimateEdit.closeEditEstimateModal;
window.saveEstimateEdit = EstimateEdit.saveEstimateEdit;
window.toggleEditWorkMonthMode = EstimateEdit.toggleEditWorkMonthMode;
window.updateEditMonthPreview = EstimateEdit.updateEditMonthPreview;
window.updateEditManualTotal = EstimateEdit.updateEditManualTotal;
window.editTask = EstimateEdit.editTask;
window.closeEditTaskModal = EstimateEdit.closeEditTaskModal;
window.saveTaskEdit = EstimateEdit.saveTaskEdit;


// estimate-selection.js の関数
window.toggleWorkMonthSelectionMode = EstimateSelection.toggleWorkMonthSelectionMode;
window.toggleEstimateSelection = EstimateSelection.toggleEstimateSelection;
window.selectTaskEstimates = EstimateSelection.selectTaskEstimates;
window.updateSelectedWorkHours = EstimateSelection.updateSelectedWorkHours;
window.executeWorkMonthAssignment = EstimateSelection.executeWorkMonthAssignment;
window.cancelWorkMonthSelection = EstimateSelection.cancelWorkMonthSelection;
window.initDragHandle = EstimateSelection.initDragHandle;

// estimate-split.js の関数
window.openSplitEstimateModal = EstimateSplit.openSplitEstimateModal;
window.closeSplitEstimateModal = EstimateSplit.closeSplitEstimateModal;
window.updateSplitPreview = EstimateSplit.updateSplitPreview;
window.updateSplitManualTotal = EstimateSplit.updateSplitManualTotal;
window.executeSplitEstimate = EstimateSplit.executeSplitEstimate;
window.clearEstimateForm = EstimateSplit.clearEstimateForm;
window.toggleMonthSplit = EstimateSplit.toggleMonthSplit;
window.updateMonthPreview = EstimateSplit.updateMonthPreview;
window.updateManualTotal = EstimateSplit.updateManualTotal;

// actual.js の関数
window.getDayOfWeek = Actual.getDayOfWeek;
window.getHoliday = Actual.getHoliday;
window.renderTodayActuals = Actual.renderTodayActuals;
window.renderActualList = Actual.renderActualList;
window.updateMemberSelectOptions = Actual.updateMemberSelectOptions;
window.renderMemberCalendar = Actual.renderMemberCalendar;
window.setupCalendarSwipe = Actual.setupCalendarSwipe;
window.renderActualMatrix = Actual.renderActualMatrix;
window.renderActualListView = Actual.renderActualListView;
window.showWorkDetail = Actual.showWorkDetail;
window.closeWorkModal = Actual.closeWorkModal;
window.deleteActual = Actual.deleteActual;
window.editActualFromModal = Actual.editActualFromModal;
window.deleteActualFromModal = Actual.deleteActualFromModal;
window.addActualFromCalendar = Actual.addActualFromCalendar;
window.editActual = Actual.editActual;
window.closeEditActualModal = Actual.closeEditActualModal;
window.saveActualEdit = Actual.saveActualEdit;
window.getPreviousActual = Actual.getPreviousActual;
window.getLatestActualBeforeDate = Actual.getLatestActualBeforeDate;
window.updateEditActualTaskList = Actual.updateEditActualTaskList;
window.openOtherWorkFromCalendar = Actual.openOtherWorkFromCalendar;
window.openVacationFromCalendar = Actual.openVacationFromCalendar;
window.openOtherWorkModalWithContext = Actual.openOtherWorkModalWithContext;
window.handleActualTaskSelect = Actual.handleActualTaskSelect;

// state.js の追加エクスポート（テーマ・レイアウト関連）

window.workMonthSelectionMode = State.workMonthSelectionMode;
window.selectedEstimateIds = State.selectedEstimateIds;
window.currentThemeColor = State.currentThemeColor;
window.currentThemePattern = State.currentThemePattern;
window.currentTabColor = State.currentTabColor;
window.currentBackgroundColor = State.currentBackgroundColor;
window.estimateLayout = State.estimateLayout;
window.actualLayout = State.actualLayout;
window.reportLayout = State.reportLayout;
window.isEstimateTabFirstView = State.isEstimateTabFirstView;
window.isReportTabFirstView = State.isReportTabFirstView;
window.estimateFilterState = State.estimateFilterState;
window.reportFilterState = State.reportFilterState;
window.setEstimateFilterState = State.setEstimateFilterState;
window.setReportFilterState = State.setReportFilterState;

// quick.js の関数
window.updateQuickTaskList = Quick.updateQuickTaskList;
window.updateQuickMemberSelect = Quick.updateQuickMemberSelect;
window.handleMemberChange = Quick.handleMemberChange;
window.showQuickTaskDropdown = Quick.showQuickTaskDropdown;
window.hideQuickTaskDropdown = Quick.hideQuickTaskDropdown;
window.clearQuickTaskSelection = Quick.clearQuickTaskSelection;
window.filterQuickTaskList = Quick.filterQuickTaskList;
window.selectQuickTask = Quick.selectQuickTask;
window.quickAddActual = Quick.quickAddActual;
window.switchQuickInputMode = Quick.switchQuickInputMode;
window.initQuickEstimateForm = Quick.initQuickEstimateForm;
window.initQuickTaskDropdownHandler = Quick.initQuickTaskDropdownHandler;

// estimate-add.js の関数
window.openAddEstimateModal = EstimateAdd.openAddEstimateModal;
window.closeAddEstimateModal = EstimateAdd.closeAddEstimateModal;
window.autoFillMember = EstimateAdd.autoFillMember;
window.initAddEstimateForm = EstimateAdd.initAddEstimateForm;
window.updateAddEstWorkMonthUI = EstimateAdd.updateAddEstWorkMonthUI;
window.switchAddEstMonthType = EstimateAdd.switchAddEstMonthType;
window.updateAddEstimateTableHeader = EstimateAdd.updateAddEstimateTableHeader;
window.updateDefaultAddProcessMonths = EstimateAdd.updateDefaultAddProcessMonths;
window.updateAddEstimateTotals = EstimateAdd.updateAddEstimateTotals;
window.addEstimateFromModal = EstimateAdd.addEstimateFromModal;
window.addEstimateFromModalNormal = EstimateAdd.addEstimateFromModalNormal;
window.switchEstimateMode = EstimateAdd.switchEstimateMode;

// other-work.js の関数
window.addMeeting = OtherWork.addMeeting;
window.addOtherWork = OtherWork.addOtherWork;
window.openOtherWorkModal = OtherWork.openOtherWorkModal;
window.closeOtherWorkModal = OtherWork.closeOtherWorkModal;
window.switchOtherWorkTab = OtherWork.switchOtherWorkTab;


// modal.js の関数
window.showProcessBreakdown = Modal.showProcessBreakdown;
window.drawBreakdownDonutChart = Modal.drawBreakdownDonutChart;
window.closeProcessBreakdownModal = Modal.closeProcessBreakdownModal;
window.openRemainingHoursModal = Modal.openRemainingHoursModal;
window.updateRemainingHoursInput = Modal.updateRemainingHoursInput;
window.updateRemainingHoursActualsList = Modal.updateRemainingHoursActualsList;
window.closeRemainingHoursModal = Modal.closeRemainingHoursModal;
window.saveRemainingHoursFromModal = Modal.saveRemainingHoursFromModal;
window.setupModalHandlers = Modal.setupModalHandlers;

// report.js の関数
window.loadReportSettings = Report.loadReportSettings;
window.saveReportSettings = Report.saveReportSettings;
window.loadDebugModeSetting = Report.loadDebugModeSetting;
window.saveDebugModeSetting = Report.saveDebugModeSetting;
window.loadDevFeaturesSetting = Report.loadDevFeaturesSetting;
window.saveDevFeaturesSetting = Report.saveDevFeaturesSetting;
window.calculateProgress = Report.calculateProgress;
window.calculateVersionProgress = Report.calculateVersionProgress;
window.createProgressBar = Report.createProgressBar;
window.createStatusBadge = Report.createStatusBadge;
window.updateProgressReport = Report.updateProgressReport;
window.updateProgressVersionOptions = Report.updateProgressVersionOptions;
window.renderProgressSummaryCards = Report.renderProgressSummaryCards;
window.renderProgressDetailTable = Report.renderProgressDetailTable;
window.openBulkRemainingModal = Report.openBulkRemainingModal;
window.closeBulkRemainingModal = Report.closeBulkRemainingModal;
window.renderBulkRemainingTable = Report.renderBulkRemainingTable;
window.updateBulkRowStatus = Report.updateBulkRowStatus;
window.saveBulkRemaining = Report.saveBulkRemaining;
window.togglePhaseCollapse = Report.togglePhaseCollapse;
window.getProgressColor = Report.getProgressColor;
window.generateProgressBar = Report.generateProgressBar;
window.getAnalysisGradients = Report.getAnalysisGradients;
window.updateReport = Report.updateReport;
window.updateCapacityAnalysis = Report.updateCapacityAnalysis;
window.renderReportAnalytics = Report.renderReportAnalytics;
window.renderMemberReport = Report.renderMemberReport;
window.renderVersionReport = Report.renderVersionReport;
window.renderReportGrouped = Report.renderReportGrouped;
window.renderReportMatrix = Report.renderReportMatrix;
window.toggleProgressSection = Report.toggleProgressSection;

// schedule.js の関数
window.initScheduleModule = Schedule.initScheduleModule;
window.renderScheduleView = Schedule.renderScheduleView;
window.navigateScheduleMonth = Schedule.navigateScheduleMonth;
window.goToScheduleToday = Schedule.goToScheduleToday;
window.setScheduleViewMode = Schedule.setScheduleViewMode;
window.addSchedule = Schedule.addSchedule;
window.updateSchedule = Schedule.updateSchedule;
window.deleteSchedule = Schedule.deleteSchedule;
window.openCreateScheduleModal = Schedule.openCreateScheduleModal;
window.closeCreateScheduleModal = Schedule.closeCreateScheduleModal;
window.openScheduleDetailModal = Schedule.openScheduleDetailModal;
window.closeScheduleDetailModal = Schedule.closeScheduleDetailModal;
window.saveScheduleFromModal = Schedule.saveScheduleFromModal;
window.saveScheduleDetailChanges = Schedule.saveScheduleDetailChanges;
window.deleteScheduleFromModal = Schedule.deleteScheduleFromModal;
window.updateScheduleVersionOptions = Schedule.updateScheduleVersionOptions;
window.updateScheduleTaskOptions = Schedule.updateScheduleTaskOptions;
window.updateScheduleProcessOptions = Schedule.updateScheduleProcessOptions;
window.updateScheduleMemberOptions = Schedule.updateScheduleMemberOptions;
window.populateScheduleEstimateHours = Schedule.populateScheduleEstimateHours;
window.recalculateScheduleEndDate = Schedule.recalculateScheduleEndDate;
window.recalculateScheduleEndDateDetail = Schedule.recalculateScheduleEndDateDetail;
window.saveScheduleRemainingHours = Schedule.saveScheduleRemainingHours;
window.isBusinessDay = Schedule.isBusinessDay;
window.countBusinessDays = Schedule.countBusinessDays;
window.generateSchedulesFromEstimates = Schedule.generateSchedulesFromEstimates;
window.openAutoGenerateModal = Schedule.openAutoGenerateModal;
window.closeAutoGenerateModal = Schedule.closeAutoGenerateModal;
window.updateAutoGenerateVersionOptions = Schedule.updateAutoGenerateVersionOptions;
window.updateAutoGenerateTargetOptions = Schedule.updateAutoGenerateTargetOptions;
window.updateAutoGeneratePreview = Schedule.updateAutoGeneratePreview;
window.executeAutoGenerate = Schedule.executeAutoGenerate;
window.handleScheduleDrag = Schedule.handleScheduleDrag;
window.setScheduleStatus = Schedule.setScheduleStatus;
window.getFilteredSchedules = Schedule.getFilteredSchedules;
window.applyScheduleFilters = Schedule.applyScheduleFilters;
window.clearScheduleFilters = Schedule.clearScheduleFilters;
window.updateScheduleFilterOptions = Schedule.updateScheduleFilterOptions;
window.exportSchedulesToExcel = Schedule.exportSchedulesToExcel;
window.deleteFilteredSchedules = Schedule.deleteFilteredSchedules;
window.showToast = Schedule.showToast;
window.updateFilterResultCount = Schedule.updateFilterResultCount;
window.calculateEndDate = Schedule.calculateEndDate;
window.getTaskColor = Schedule.getTaskColor;

// state.js のスケジュール関連エクスポート
window.schedules = State.schedules;
window.scheduleSettings = State.scheduleSettings;
window.taskColorMap = State.taskColorMap;

// ============================================
// 初期化処理
// ============================================

// ESモジュールはHTMLパース完了後に実行されるため、
// モジュールレベルでloadDataを呼び出してデータをロードする
// これにより、index.html内のDOMContentLoadedリスナーより先にデータがロードされる
Storage.loadData();

// loadData後に配列参照が変わるため、window変数を再設定
window.estimates = State.estimates;
window.actuals = State.actuals;
window.companyHolidays = State.companyHolidays;
window.vacations = State.vacations;
window.remainingEstimates = State.remainingEstimates;
window.memberOrder = State.memberOrder;
window.schedules = State.schedules;
window.scheduleSettings = State.scheduleSettings;
window.taskColorMap = State.taskColorMap;

// 孤立した見込残存データをクリーンアップ（担当者変更などで残った不要データを削除）
const cleanedCount = Estimate.cleanupOrphanedRemainingEstimates();
if (cleanedCount > 0) {
    console.log(`✅ init.js: ${cleanedCount}件の孤立した見込残存データを削除しました`);
}

console.log('✅ init.js: データロード完了', {
    estimates: State.estimates.length,
    actuals: State.actuals.length
});

console.log('✅ モジュール init.js loaded (state, utils, vacation, storage, ui, theme, estimate, actual, quick, report, estimate-add, other-work, modal, estimate-edit, estimate-selection, estimate-split)');

// ============================================
// DOMContentLoaded 初期化処理
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('✅ init.js: DOMContentLoaded イベント発火');

    // 各種設定の読み込み
    Storage.loadAutoBackupSetting();
    Theme.loadThemeSettings();
    Report.loadReportSettings();
    Theme.loadChartColorScheme();
    Report.loadDebugModeSetting();
    Report.loadDevFeaturesSetting();

    // localStorageからフィルタ状態を復元（オプション更新より前に実行）
    UI.loadFilterStatesFromStorage();

    // オプションの更新
    UI.updateMonthOptions();
    UI.updateEstimateMonthOptions();
    UI.updateEstimateVersionOptions();
    UI.updateActualMonthOptions();
    UI.updateMemberOptions();
    UI.updateVersionOptions();
    UI.updateFormNameOptions();
    Quick.updateQuickTaskList();
    Estimate.updateWorkMonthOptions();

    // 見込残存時間入力モーダル: 外クリックで閉じる
    const remainingHoursModal = document.getElementById('remainingHoursModal');
    if (remainingHoursModal) {
        remainingHoursModal.addEventListener('click', function (event) {
            if (event.target === remainingHoursModal) {
                Modal.closeRemainingHoursModal();
            }
        });
    }

    // 見積一覧のデフォルトを版数別（全版数・現在月）に設定
    const filterTypeElement = document.getElementById('estimateFilterType');
    if (filterTypeElement) {
        filterTypeElement.value = 'version';
        UI.setEstimateFilterType('version');
    }

    // クイック入力の見積登録フォームを初期化
    Quick.initQuickEstimateForm();

    // 各タブのデフォルト月を設定（localStorageから復元された場合はスキップ）
    // 見積タブはupdateEstimateMonthOptionsで既に設定済みなのでスキップ
    UI.setDefaultActualMonth();

    // 保存されたレポートフィルタ条件を復元（リロード時）
    // 復元できなかった場合のみデフォルト設定を適用
    const reportFilterRestored = UI.restoreReportFilterState();
    if (!reportFilterRestored) {
        // レポートのフィルタタイプをデフォルト設定
        const reportFilterType = document.getElementById('reportFilterType');
        if (reportFilterType) {
            reportFilterType.value = 'version';
            UI.handleReportFilterTypeChange();
        }
        UI.setDefaultReportMonth();
    }

    // デフォルトの表示形式を適用（View Type）
    Theme.applyDefaultEstimateViewType();
    Theme.applyDefaultReportViewType();

    // 全ての設定をUI要素に同期（描画前に実行して担当者順等を反映）
    UI.syncSettingsToUI();

    // 表示の更新
    Estimate.renderEstimateList();
    Actual.renderActualList();
    Actual.renderTodayActuals();
    Report.updateReport();
    Vacation.renderCompanyHolidayList();

    // キャパシティ表示設定の初期化
    Report.initCapacitySettings();

    // 進捗管理セクションの折りたたみ状態を復元
    Report.initProgressSectionState();

    // キャパシティ表示モード変更時の再描画
    document.addEventListener('capacityDisplayModeChanged', () => {
        Report.updateReport();
    });

    // セグメントボタンの初期色をテーマカラーに設定
    UI.updateSegmentedButtons();

    // レイアウト設定を適用（loadDataはDOMContentLoaded前に実行されるため、ここで再適用）
    UI.applyLayoutSettings();

    // モバイルでタブのスワイプ切り替え機能を追加
    UI.initTabSwipe();

    // スマートStickyタブ（スクロール連動表示）を初期化
    if (typeof UI.initSmartSticky === 'function') {
        UI.initSmartSticky();
    }

    // モーダルのクリックハンドラーをセットアップ
    Modal.setupModalHandlers();


    // タブ内フィルタドロワーの初期化
    TabFilter.initTabFilter();

    // グローバルイベントハンドラの初期化（index.htmlから移行）
    initEventHandlers();

    // タブインジケーター（スライドアニメーション）を初期化
    // ※showTabの前に初期化して、showTab内でupdateTabIndicatorが呼ばれるようにする
    UI.initTabIndicator();

    // 保存されたタブを復元（リロード時に前回のタブに戻る）
    // ※initTabIndicator後に呼ぶことで、showTab内のupdateTabIndicatorが正しく動作する
    try {
        const savedTab = localStorage.getItem('manhour_currentTab');
        if (savedTab && ['quick', 'estimate', 'actual', 'report', 'settings'].includes(savedTab)) {
            UI.showTab(savedTab);
        } else {
            // savedTabがない場合はデフォルトタブを表示（is-hidden解除のためshowTabを呼ぶ）
            UI.showTab('quick');
        }
    } catch (e) {
        // localStorageエラーは無視、デフォルトタブを表示
        UI.showTab('quick');
    }

    // スケジュール（ガントチャート）モジュールの初期化
    Schedule.initScheduleModule();

    console.log('✅ init.js: 初期化処理完了');
});
