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
window.showDeviationColorsSetting = State.showDeviationColorsSetting;
window.showProgressBarsSetting = State.showProgressBarsSetting;
window.showProgressPercentageSetting = State.showProgressPercentageSetting;
window.progressBarStyle = State.progressBarStyle;
window.matrixEstActFormat = State.matrixEstActFormat;
window.matrixDayMonthFormat = State.matrixDayMonthFormat;
window.debugModeEnabled = State.debugModeEnabled;

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

// theme.js の関数
window.getActiveChartColorScheme = Theme.getActiveChartColorScheme;
window.saveChartColorScheme = Theme.saveChartColorScheme;
window.loadChartColorScheme = Theme.loadChartColorScheme;
window.updateChartColorPreview = Theme.updateChartColorPreview;
window.loadThemeSettings = Theme.loadThemeSettings;
window.applyTheme = Theme.applyTheme;
window.updateThemePreview = Theme.updateThemePreview;
window.updateThemeElements = Theme.updateThemeElements;
window.updateFloatingFilterTheme = Theme.updateFloatingFilterTheme;
window.updateBodyBackground = Theme.updateBodyBackground;
window.updateElementTheme = Theme.updateElementTheme;
window.toggleMonthColorsSetting = Theme.toggleMonthColorsSetting;
window.toggleDeviationColorsSetting = Theme.toggleDeviationColorsSetting;
window.toggleProgressBarsSetting = Theme.toggleProgressBarsSetting;
window.toggleProgressPercentageSetting = Theme.toggleProgressPercentageSetting;
window.saveProgressBarStyle = Theme.saveProgressBarStyle;
window.saveMatrixEstActFormat = Theme.saveMatrixEstActFormat;
window.saveMatrixDayMonthFormat = Theme.saveMatrixDayMonthFormat;
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
window.renderEstimateList = Estimate.renderEstimateList;
window.renderEstimateGrouped = Estimate.renderEstimateGrouped;
window.renderEstimateMatrix = Estimate.renderEstimateMatrix;
window.renderEstimateDetailList = Estimate.renderEstimateDetailList;
window.deleteEstimate = Estimate.deleteEstimate;
window.deleteTask = Estimate.deleteTask;
window.editEstimate = Estimate.editEstimate;
window.closeEditEstimateModal = Estimate.closeEditEstimateModal;
window.saveEstimateEdit = Estimate.saveEstimateEdit;
window.toggleEditWorkMonthMode = Estimate.toggleEditWorkMonthMode;
window.updateEditMonthPreview = Estimate.updateEditMonthPreview;
window.updateEditManualTotal = Estimate.updateEditManualTotal;
window.editTask = Estimate.editTask;
window.closeEditTaskModal = Estimate.closeEditTaskModal;
window.saveTaskEdit = Estimate.saveTaskEdit;
window.toggleEstimateEditMode = Estimate.toggleEstimateEditMode;
window.toggleWorkMonthSelectionMode = Estimate.toggleWorkMonthSelectionMode;
window.toggleEstimateSelection = Estimate.toggleEstimateSelection;
window.selectTaskEstimates = Estimate.selectTaskEstimates;
window.updateSelectedWorkHours = Estimate.updateSelectedWorkHours;
window.executeWorkMonthAssignment = Estimate.executeWorkMonthAssignment;
window.cancelWorkMonthSelection = Estimate.cancelWorkMonthSelection;
window.initDragHandle = Estimate.initDragHandle;
window.updateWorkMonthOptions = Estimate.updateWorkMonthOptions;
window.openSplitEstimateModal = Estimate.openSplitEstimateModal;
window.closeSplitEstimateModal = Estimate.closeSplitEstimateModal;
window.updateSplitPreview = Estimate.updateSplitPreview;
window.updateSplitManualTotal = Estimate.updateSplitManualTotal;
window.executeSplitEstimate = Estimate.executeSplitEstimate;
window.clearEstimateForm = Estimate.clearEstimateForm;
window.toggleMonthSplit = Estimate.toggleMonthSplit;
window.updateMonthPreview = Estimate.updateMonthPreview;
window.updateManualTotal = Estimate.updateManualTotal;

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

// state.js の追加エクスポート（テーマ・レイアウト関連）
window.estimateEditMode = State.estimateEditMode;
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

console.log('✅ init.js: データロード完了', {
    estimates: State.estimates.length,
    actuals: State.actuals.length
});

console.log('✅ モジュール init.js loaded (state, utils, vacation, storage, ui, theme, estimate, actual)');
