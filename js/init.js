// ============================================
// モジュール統合・初期化処理
// ============================================

// 作成済みモジュールをインポート
import * as State from './state.js';
import * as Utils from './utils.js';
import * as Vacation from './vacation.js';

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

// ============================================
// 初期化処理はindex.html内のDOMContentLoadedで実行
// ============================================

console.log('✅ モジュール init.js loaded (state, utils, vacation)');
