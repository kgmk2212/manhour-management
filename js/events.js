// ============================================
// イベントハンドラ一括登録
// ============================================

import { exportBackup, importBackup, saveAutoBackupSetting, exportToExcel, handleFileImport, saveData } from './storage.js';
import {
    showTab,
    handleVersionChange,
    handleEstimateMonthChange,
    handleEstimateVersionChange,
    handleEstimateFilterTypeChange,
    setEstimateViewType,
    setEstimateFilterType,
    setActualViewType,
    setReportViewType,
    setReportFilterType,
    handleActualMemberChange,
    handleActualMonthChange,
    handleReportMonthChange,
    handleReportVersionChange,
    handleReportFilterTypeChange,
    showMemberOrderHelp,
    updateAllDisplays,
    toggleFilterLayout,
    handleEditActualMemberChange,
    handleEditFormNameChange,
    handleAddFormNameChange,
    initAnimationState
} from './ui.js';
import {
    switchQuickInputMode,
    filterQuickTaskList, showQuickTaskDropdown, hideQuickTaskDropdown,
    clearQuickTaskSelection, handleMemberChange,
    quickAddActual,
    handleQuickFormNameChange,
    switchQuickEstMonthType, updateQuickEstWorkMonthUI,
    updateQuickEstimateTotals, autoFillMember,
    toggleQuickMonthSplit, updateQuickMonthPreview,
    addQuickEstimate,
    saveQuickInputModeSetting
} from './quick.js';
import { openOtherWorkModal } from './other-work.js';
import {
    handleVacationTypeChange,
    addQuickVacation,
    addCompanyHoliday,
    handleVacationModalTypeChange,
    closeVacationModal,
    saveVacationFromModal
} from './vacation.js';
import { renderEstimateList } from './estimate.js';
import {
    toggleEstimateEditMode,
    closeEditEstimateModal,
    saveEstimateEdit,
    updateEditMonthPreview,
    toggleEditWorkMonthMode,
    closeEditTaskModal,
    saveTaskEdit
} from './estimate-edit.js';
import { openAddEstimateModal } from './estimate-add.js';
import { toggleWorkMonthSelectionMode, executeWorkMonthAssignment, cancelWorkMonthSelection } from './estimate-selection.js';
import {
    renderActualList,
    closeWorkModal,
    closeEditActualModal,
    saveActualEdit,
    openOtherWorkFromCalendar,
    openVacationFromCalendar,
    handleActualTaskSelect,
    handleActualProcessChange
} from './actual.js';
import {
    saveStickyFilterSetting,
    saveFloatingFilterSetting
} from './floating-filter.js';
import {
    updateReport,
    togglePhaseCollapse,
    loadReportSettings,
    saveReportSettings,
    loadDebugModeSetting,
    saveDebugModeSetting,
    updateProgressReport,
    openBulkRemainingModal,
    closeBulkRemainingModal,
    saveBulkRemaining
} from './report.js';
import {
    applyTheme,
    saveChartColorScheme,
    toggleMonthColorsSetting,
    changeReportMatrixBgColorMode,
    toggleProgressBarsSetting,
    toggleProgressPercentageSetting,
    saveProgressBarStyle,
    saveMatrixEstActFormat,
    loadMobileTabDesign,
    changeMobileTabDesign,
    saveDefaultViewTypeSetting,
    updateThemeElements
} from './theme.js';
import {
    closeProcessBreakdownModal,
    closeRemainingHoursModal
} from './modal.js';
import { debugModeEnabled } from './state.js';

export function initEventHandlers() {
    if (debugModeEnabled) console.log('✅ events.js: イベントハンドラ初期化開始');
    const exportBtn = document.getElementById('btnExportBackup');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportBackup);
    }

    const importBtn = document.getElementById('btnImportBackup');
    if (importBtn) {
        importBtn.addEventListener('click', importBackup);
    }

    // タブ切り替え
    // タブ切り替え（イベント委譲）
    const handleTabClick = (e) => {
        const tab = e.target.closest('.tab[data-tab]');
        if (tab) {
            // ダブルタップやタッチ+クリックでの重複実行防止
            if (e.type === 'touchstart') {
                e.preventDefault(); // クリックイベントの発生を防ぐ
            }

            if (debugModeEnabled) console.log(`✅ Tab ${e.type} Detected:`, tab.dataset.tab);

            if (typeof showTab === 'function') {
                showTab(tab.dataset.tab);
            } else {
                console.error('❌ showTab is not a function!');
            }
        }
    };

    document.addEventListener('click', handleTabClick);
    document.addEventListener('touchstart', handleTabClick, { passive: false });

    // ============================================
    // クイック入力: 共通 & 実績
    // ============================================

    // モード切り替えボタン
    ['actual', 'estimate', 'vacation'].forEach(mode => {
        const btn = document.getElementById(`quick${mode.charAt(0).toUpperCase() + mode.slice(1)}ModeBtn`);
        if (btn) {
            btn.addEventListener('click', () => switchQuickInputMode(mode));
        }
    });

    // 検索・フィルタ
    const quickTaskSearch = document.getElementById('quickTaskSearch');
    if (quickTaskSearch) {
        quickTaskSearch.addEventListener('input', filterQuickTaskList);
        quickTaskSearch.addEventListener('click', showQuickTaskDropdown);

        // 外クリックで閉じる
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('quickTaskDropdown');
            if (dropdown && dropdown.style.display !== 'none') {
                if (!quickTaskSearch.contains(e.target) && !dropdown.contains(e.target)) {
                    hideQuickTaskDropdown();
                }
            }
        });
    }

    const quickTaskClearBtn = document.getElementById('quickTaskClearBtn');
    if (quickTaskClearBtn) {
        quickTaskClearBtn.addEventListener('click', clearQuickTaskSelection);
    }

    const quickMemberSelect = document.getElementById('quickMemberSelect');
    if (quickMemberSelect) {
        quickMemberSelect.addEventListener('change', handleMemberChange);
    }

    // 担当者表示順 (自動保存 & 即時反映)
    const memberOrderEl = document.getElementById('memberOrder');
    if (memberOrderEl) {
        memberOrderEl.addEventListener('change', () => {
            // UI.updateAllDisplays() saves via saveData() internally or we call it explicitly?
            // updateAllDisplays calls setMemberOrder then render...
            // Let's call updateAllDisplays directly if possible, or saveData.
            // Save data first to persist
            import('./storage.js').then(m => m.saveData(true));
            import('./ui.js').then(m => m.updateAllDisplays());
        });
    }

    // アクションボタン
    const btnQuickAddActual = document.getElementById('btnQuickAddActual');
    if (btnQuickAddActual) {
        btnQuickAddActual.addEventListener('click', quickAddActual);
    }

    const btnOpenOtherWork = document.getElementById('btnOpenOtherWork');
    if (btnOpenOtherWork) {
        btnOpenOtherWork.addEventListener('click', openOtherWorkModal);
    }

    // ============================================
    // クイック入力: 見積
    // ============================================

    const quickEstVersion = document.getElementById('quickEstVersion');
    if (quickEstVersion) {
        quickEstVersion.addEventListener('change', () => handleVersionChange('quickEstVersion'));
    }

    const quickEstFormNameSelect = document.getElementById('quickEstFormNameSelect');
    if (quickEstFormNameSelect) {
        quickEstFormNameSelect.addEventListener('change', handleQuickFormNameChange);
    }

    // 月タイプ (Radio delegation)
    const monthTypeRadios = document.querySelectorAll('input[name="quickEstMonthType"]');
    monthTypeRadios.forEach(radio => {
        radio.addEventListener('change', switchQuickEstMonthType);
    });

    // 作業月変更
    ['quickEstStartMonth', 'quickEstStartMonthMulti', 'quickEstEndMonth'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateQuickEstWorkMonthUI);
    });

    // テーブル内のInputs (Delegation or specific selection)
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    processes.forEach(proc => {
        // 工数入力
        const hourInput = document.getElementById(`quickEst${proc}`);
        if (hourInput) {
            hourInput.addEventListener('input', updateQuickEstimateTotals);
        }
        // 担当変更 (自動入力)
        const memberSelect = document.getElementById(`quickEst${proc}_member`);
        if (memberSelect) {
            memberSelect.addEventListener('change', (e) => autoFillMember(e.target.id));
        }
    });

    // 見積登録ボタン
    const btnAddQuickEstimate = document.getElementById('btnAddQuickEstimate');
    if (btnAddQuickEstimate) {
        btnAddQuickEstimate.addEventListener('click', addQuickEstimate);
    }

    // ============================================
    // クイック入力: 月分割
    // ============================================

    const quickEnableMonthSplit = document.getElementById('quickEnableMonthSplit');
    if (quickEnableMonthSplit) {
        quickEnableMonthSplit.addEventListener('change', toggleQuickMonthSplit);
    }

    const quickTotalHours = document.getElementById('quickTotalHours');
    if (quickTotalHours) {
        quickTotalHours.addEventListener('input', updateQuickMonthPreview);
    }

    ['quickStartMonth', 'quickEndMonth'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateQuickMonthPreview);
    });

    const splitMethodRadios = document.querySelectorAll('input[name="quickSplitMethod"]');
    splitMethodRadios.forEach(radio => {
        radio.addEventListener('change', updateQuickMonthPreview);
    });

    // ============================================
    // クイック入力: 休暇
    // ============================================

    const quickVacationType = document.getElementById('quickVacationType');
    if (quickVacationType) {
        quickVacationType.addEventListener('change', handleVacationTypeChange);
    }

    const btnAddQuickVacation = document.getElementById('btnAddQuickVacation');
    if (btnAddQuickVacation) {
        btnAddQuickVacation.addEventListener('click', addQuickVacation);
    }


    // ============================================
    // 見積一覧タブ
    // ============================================

    // 新規登録ボタン
    const btnOpenAddEstimateModal = document.getElementById('btnOpenAddEstimateModal');
    if (btnOpenAddEstimateModal) {
        btnOpenAddEstimateModal.addEventListener('click', openAddEstimateModal);
    }

    // フィルタ
    const estimateFilterType = document.getElementById('estimateFilterType');
    if (estimateFilterType) estimateFilterType.addEventListener('change', handleEstimateFilterTypeChange);

    const estimateMonthFilter = document.getElementById('estimateMonthFilter');
    if (estimateMonthFilter) estimateMonthFilter.addEventListener('change', (e) => handleEstimateMonthChange(e.target.value, 'estimateMonthButtons2'));

    const estimateVersionFilter = document.getElementById('estimateVersionFilter');
    if (estimateVersionFilter) estimateVersionFilter.addEventListener('change', (e) => handleEstimateVersionChange(e.target.value, 'estimateVersionButtons2'));



    // モードトグル
    const workMonthSelectionMode = document.getElementById('workMonthSelectionMode');
    if (workMonthSelectionMode) workMonthSelectionMode.addEventListener('change', toggleWorkMonthSelectionMode);

    const estimateEditMode = document.getElementById('estimateEditMode');
    if (estimateEditMode) estimateEditMode.addEventListener('change', toggleEstimateEditMode);

    // Segmented Buttons (Version 2 Layout)
    const btnEstimateFilterMonth = document.getElementById('btnEstimateFilterMonth');
    if (btnEstimateFilterMonth) btnEstimateFilterMonth.addEventListener('click', () => setEstimateFilterType('month'));

    const btnEstimateFilterVersion = document.getElementById('btnEstimateFilterVersion');
    if (btnEstimateFilterVersion) btnEstimateFilterVersion.addEventListener('click', () => setEstimateFilterType('version'));

    const estimateMonthFilter2 = document.getElementById('estimateMonthFilter2');
    if (estimateMonthFilter2) {
        estimateMonthFilter2.addEventListener('change', (e) => {
            const mainFilter = document.getElementById('estimateMonthFilter');
            if (mainFilter) mainFilter.value = e.target.value;
            handleEstimateMonthChange(e.target.value, 'estimateMonthButtons2');
        });
    }

    const estimateVersionFilter2 = document.getElementById('estimateVersionFilter2');
    if (estimateVersionFilter2) {
        estimateVersionFilter2.addEventListener('change', (e) => {
            const mainFilter = document.getElementById('estimateVersionFilter');
            if (mainFilter) mainFilter.value = e.target.value;
            handleEstimateVersionChange(e.target.value, 'estimateVersionButtons2');
        });
    }

    ['grouped', 'matrix', 'list'].forEach(type => {
        const btn = document.getElementById(`btnEstimate${type.charAt(0).toUpperCase() + type.slice(1)}`);
        if (btn) btn.addEventListener('click', () => {
            setEstimateViewType(type);
            saveData(true);
        });
    });

    const workMonthSelectionMode2 = document.getElementById('workMonthSelectionMode2');
    if (workMonthSelectionMode2) workMonthSelectionMode2.addEventListener('change', toggleWorkMonthSelectionMode);

    const estimateEditMode2 = document.getElementById('estimateEditMode2');
    if (estimateEditMode2) estimateEditMode2.addEventListener('change', toggleEstimateEditMode);

    // 作業月割り当てモードパネル
    const btnCloseWorkMonthAssignment = document.getElementById('btnCloseWorkMonthAssignmentMode');
    if (btnCloseWorkMonthAssignment) {
        btnCloseWorkMonthAssignment.addEventListener('click', () => {
            // 閉じるボタンカスタムロジック: チェックボックスを外してトグルを呼ぶ
            const chk = document.getElementById('workMonthSelectionMode');
            if (chk) {
                chk.checked = false;
                toggleWorkMonthSelectionMode();
            }
        });
    }

    const btnExecuteAssignment = document.getElementById('btnExecuteWorkMonthAssignment');
    if (btnExecuteAssignment) btnExecuteAssignment.addEventListener('click', executeWorkMonthAssignment);

    const btnCancelAssignment = document.getElementById('btnCancelWorkMonthSelection');
    if (btnCancelAssignment) btnCancelAssignment.addEventListener('click', cancelWorkMonthSelection);

    // ============================================
    // 実績タブ
    // ============================================

    // ビュー切り替え
    const btnActualMatrix = document.getElementById('btnActualMatrix');
    if (btnActualMatrix) {
        btnActualMatrix.addEventListener('click', () => setActualViewType('matrix'));
    }

    const btnActualList = document.getElementById('btnActualList');
    if (btnActualList) {
        btnActualList.addEventListener('click', () => setActualViewType('list'));
    }

    // フィルタ (Compact)
    const actualMemberSelect = document.getElementById('actualMemberSelect');
    if (actualMemberSelect) {
        actualMemberSelect.addEventListener('change', (e) => handleActualMemberChange(e.target.value, 'actualMemberButtons2'));
    }

    const actualMonthFilter = document.getElementById('actualMonthFilter');
    if (actualMonthFilter) {
        actualMonthFilter.addEventListener('change', (e) => handleActualMonthChange(e.target.value, 'actualMonthButtons2'));
    }

    const actualViewMode = document.getElementById('actualViewMode');
    if (actualViewMode) {
        actualViewMode.addEventListener('change', renderActualList);
    }

    // Segmented layout specific
    const actualViewMode2 = document.getElementById('actualViewMode2');
    if (actualViewMode2) {
        actualViewMode2.addEventListener('change', (e) => {
            const mainMode = document.getElementById('actualViewMode');
            if (mainMode) mainMode.value = e.target.value;
            renderActualList();
        });
    }

    const actualMemberSelect2 = document.getElementById('actualMemberSelect2');
    if (actualMemberSelect2) {
        actualMemberSelect2.addEventListener('change', (e) => {
            const mainFilter = document.getElementById('actualMemberSelect');
            if (mainFilter) mainFilter.value = e.target.value;
            handleActualMemberChange(e.target.value, 'actualMemberButtons2');
        });
    }

    const actualMonthFilter2 = document.getElementById('actualMonthFilter2');
    if (actualMonthFilter2) {
        actualMonthFilter2.addEventListener('change', (e) => {
            const mainFilter = document.getElementById('actualMonthFilter');
            if (mainFilter) mainFilter.value = e.target.value;
            handleActualMonthChange(e.target.value, 'actualMonthButtons2');
        });
    }

    // ============================================
    // レポートタブ
    // ============================================

    // フィルタタイプ
    const reportFilterType = document.getElementById('reportFilterType');
    if (reportFilterType) {
        reportFilterType.addEventListener('change', handleReportFilterTypeChange);
    }

    const btnFilterMonth = document.getElementById('btnFilterMonth');
    if (btnFilterMonth) {
        btnFilterMonth.addEventListener('click', () => setReportFilterType('month'));
    }

    const btnFilterVersion = document.getElementById('btnFilterVersion');
    if (btnFilterVersion) {
        btnFilterVersion.addEventListener('click', () => setReportFilterType('version'));
    }

    // 期間・版数選択
    const reportMonth = document.getElementById('reportMonth');
    if (reportMonth) {
        reportMonth.addEventListener('change', (e) => handleReportMonthChange(e.target.value, 'reportMonthButtons2'));
    }

    const reportVersion = document.getElementById('reportVersion');
    if (reportVersion) {
        reportVersion.addEventListener('change', (e) => handleReportVersionChange(e.target.value, 'reportVersionButtons2'));
    }

    const reportMonth2 = document.getElementById('reportMonth2');
    if (reportMonth2) {
        reportMonth2.addEventListener('change', (e) => {
            const mainFilter = document.getElementById('reportMonth');
            if (mainFilter) mainFilter.value = e.target.value;
            handleReportMonthChange(e.target.value, 'reportMonthButtons2');
        });
    }

    const reportVersion2 = document.getElementById('reportVersion2');
    if (reportVersion2) {
        reportVersion2.addEventListener('change', (e) => {
            const mainFilter = document.getElementById('reportVersion');
            if (mainFilter) mainFilter.value = e.target.value;
            handleReportVersionChange(e.target.value, 'reportVersionButtons2');
        });
    }



    ['Summary', 'Grouped', 'Matrix'].forEach(type => {
        const btn = document.getElementById(`btnReport${type}`);
        if (btn) {
            btn.addEventListener('click', () => setReportViewType(type.toLowerCase()));
        }
    });

    // Bulk Remaining
    const btnOpenBulkRemaining = document.getElementById('btnOpenBulkRemaining');
    if (btnOpenBulkRemaining) {
        btnOpenBulkRemaining.addEventListener('click', openBulkRemainingModal);
    }

    const btnCloseBulkRemaining = document.getElementById('btnCloseBulkRemaining');
    if (btnCloseBulkRemaining) {
        btnCloseBulkRemaining.addEventListener('click', closeBulkRemainingModal);
    }

    const btnSaveBulkRemaining = document.getElementById('btnSaveBulkRemaining');
    if (btnSaveBulkRemaining) {
        btnSaveBulkRemaining.addEventListener('click', saveBulkRemaining);
    }

    // Progress Report Filters
    const progressVersionFilter = document.getElementById('progressVersionFilter');
    if (progressVersionFilter) {
        progressVersionFilter.addEventListener('change', updateProgressReport);
    }

    const progressStatusFilter = document.getElementById('progressStatusFilter');
    if (progressStatusFilter) {
        progressStatusFilter.addEventListener('change', updateProgressReport);
    }

    // ============================================
    // 設定
    // ============================================

    // テーマ
    ['themeColor', 'themePattern', 'themeTabColor', 'themeBackgroundColor'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', applyTheme);
    });

    const chartColorScheme = document.getElementById('chartColorScheme');
    if (chartColorScheme) {
        chartColorScheme.addEventListener('change', saveChartColorScheme);
    }

    // 表示設定 (Report & Theme shared)
    // Note: showMonthColorsCheckbox etc were previously handled by saveReportSettings, 
    // but they are primarily theme settings now or mixed. 
    // Using toggle functions from theme.js which call save logic and UI update.

    const showMonthColorsCheckbox = document.getElementById('showMonthColorsCheckbox');
    if (showMonthColorsCheckbox) {
        showMonthColorsCheckbox.addEventListener('change', (e) => {
            toggleMonthColorsSetting();
            saveReportSettings(); // Also save to report settings if needed, or theme handles it? 
            // Theme.js toggles usually save preference. Report settings might duplicate.
            // Let's call both or just one if unified. 
            // toggleMonthColorsSetting saves to localStorage 'showMonthColorsCheckbox'.
            // report.js load uses 'report_settings'.
            // Keeping both for now or as per original logic.
        });
    }

    document.querySelectorAll('input[name="reportMatrixBgColorMode"]').forEach(radio => {
        radio.addEventListener('change', changeReportMatrixBgColorMode);
    });

    const showProgressBarsCheckbox = document.getElementById('showProgressBarsCheckbox');
    if (showProgressBarsCheckbox) showProgressBarsCheckbox.addEventListener('change', toggleProgressBarsSetting);

    const showProgressPercentageCheckbox = document.getElementById('showProgressPercentageCheckbox');
    if (showProgressPercentageCheckbox) showProgressPercentageCheckbox.addEventListener('change', toggleProgressPercentageSetting);

    document.querySelectorAll('input[name="progressBarStyle"]').forEach(radio => {
        radio.addEventListener('change', saveProgressBarStyle);
    });

    document.querySelectorAll('input[name="matrixEstActFormat"]').forEach(radio => {
        radio.addEventListener('change', saveMatrixEstActFormat);
    });



    ['defaultEstimateViewType', 'defaultReportViewType'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveDefaultViewTypeSetting);
    });

    // バックアップ・モード
    const autoBackupEnabled = document.getElementById('autoBackupEnabled');
    if (autoBackupEnabled) autoBackupEnabled.addEventListener('change', saveAutoBackupSetting);

    const rememberQuickInputMode = document.getElementById('rememberQuickInputMode');
    if (rememberQuickInputMode) rememberQuickInputMode.addEventListener('change', saveQuickInputModeSetting);

    // 担当者順序
    const memberOrder = document.getElementById('memberOrder');
    if (memberOrder) memberOrder.addEventListener('change', updateAllDisplays);

    const btnShowMemberOrderHelp = document.getElementById('btnShowMemberOrderHelp');
    if (btnShowMemberOrderHelp) btnShowMemberOrderHelp.addEventListener('click', showMemberOrderHelp);

    const btnUpdateAllDisplays = document.getElementById('btnUpdateAllDisplays');
    if (btnUpdateAllDisplays) btnUpdateAllDisplays.addEventListener('click', updateAllDisplays);

    // フィルタ固定
    const stickyFilterEnabled = document.getElementById('stickyFilterEnabled');
    if (stickyFilterEnabled) stickyFilterEnabled.addEventListener('change', saveStickyFilterSetting);

    const floatingFilterEnabled = document.getElementById('floatingFilterEnabled');
    if (floatingFilterEnabled) floatingFilterEnabled.addEventListener('change', saveFloatingFilterSetting);

    // 会社休日
    const btnAddCompanyHoliday = document.getElementById('btnAddCompanyHoliday');
    if (btnAddCompanyHoliday) btnAddCompanyHoliday.addEventListener('click', addCompanyHoliday);

    const mobileTabDesignDropdown = document.getElementById('mobileTabDesign');
    if (mobileTabDesignDropdown) {
        mobileTabDesignDropdown.addEventListener('change', changeMobileTabDesign);
    }

    // Excel・ファイル
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) btnExportExcel.addEventListener('click', exportToExcel);

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', handleFileImport);

    // レイアウト
    const layoutToggles = document.querySelectorAll('.layout-toggle');
    layoutToggles.forEach(btn => {
        btn.addEventListener('click', () => toggleFilterLayout(btn.dataset.target));
    });

    const debugModeCheckbox = document.getElementById('debugModeCheckbox');
    if (debugModeCheckbox) {
        debugModeCheckbox.addEventListener('change', saveDebugModeSetting);
    }

    // Report Analysis Settings
    const reportAnalysisSettings = [
        'reportAccuracyEnabled', 'reportAnomalyEnabled', 'reportWarningTasksEnabled',
        'reportChartEnabled', 'reportTrendEnabled',
        'reportMemberAnalysisEnabled', 'reportInsightsEnabled'
    ];

    reportAnalysisSettings.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                saveReportSettings();
                updateReport();
            });
        }
    });

    // Edit Estimate Modal
    const btnCloseEditEstimateModal = document.getElementById('btnCloseEditEstimateModal');
    if (btnCloseEditEstimateModal) btnCloseEditEstimateModal.addEventListener('click', closeEditEstimateModal);

    const btnCloseEditEstimateModalCancel = document.getElementById('btnCloseEditEstimateModalCancel');
    if (btnCloseEditEstimateModalCancel) btnCloseEditEstimateModalCancel.addEventListener('click', closeEditEstimateModal);

    const btnSaveEstimateEdit = document.getElementById('btnSaveEstimateEdit');
    if (btnSaveEstimateEdit) btnSaveEstimateEdit.addEventListener('click', saveEstimateEdit);

    const editEstimateVersion = document.getElementById('editEstimateVersion');
    if (editEstimateVersion) editEstimateVersion.addEventListener('change', () => handleVersionChange('editEstimateVersion'));

    // editEstimateHours oninput -> updateEditMonthPreview (syncEditTotalHours)
    const editEstimateHours = document.getElementById('editEstimateHours');
    if (editEstimateHours) editEstimateHours.addEventListener('input', updateEditMonthPreview);

    document.querySelectorAll('input[name="editWorkMonthMode"]').forEach(radio => {
        radio.addEventListener('change', toggleEditWorkMonthMode);
    });

    ['editStartMonth', 'editEndMonth'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateEditMonthPreview);
    });

    document.querySelectorAll('input[name="editSplitMethod"]').forEach(radio => {
        radio.addEventListener('change', updateEditMonthPreview);
    });

    const btnCloseEditTaskModal = document.getElementById('btnCloseEditTaskModal');
    if (btnCloseEditTaskModal) btnCloseEditTaskModal.addEventListener('click', closeEditTaskModal);

    const btnCloseEditTaskModalCancel = document.getElementById('btnCloseEditTaskModalCancel');
    if (btnCloseEditTaskModalCancel) btnCloseEditTaskModalCancel.addEventListener('click', closeEditTaskModal);

    const btnSaveTaskEdit = document.getElementById('btnSaveTaskEdit');
    if (btnSaveTaskEdit) btnSaveTaskEdit.addEventListener('click', saveTaskEdit);

    const editTaskVersion = document.getElementById('editTaskVersion');
    if (editTaskVersion) editTaskVersion.addEventListener('change', () => handleVersionChange('editTaskVersion'));

    const editTaskFormNameSelect = document.getElementById('editTaskFormNameSelect');
    if (editTaskFormNameSelect) editTaskFormNameSelect.addEventListener('change', handleEditFormNameChange);


    const btnCloseWorkModal = document.getElementById('btnCloseWorkModal');
    if (btnCloseWorkModal) btnCloseWorkModal.addEventListener('click', closeWorkModal);

    // Edit Actual Modal
    const btnCloseEditActualModal = document.getElementById('btnCloseEditActualModal');
    if (btnCloseEditActualModal) btnCloseEditActualModal.addEventListener('click', closeEditActualModal);

    const btnCloseEditActualModalCancel = document.getElementById('btnCloseEditActualModalCancel');
    if (btnCloseEditActualModalCancel) btnCloseEditActualModalCancel.addEventListener('click', closeEditActualModal);

    const btnSaveActualEdit = document.getElementById('btnSaveActualEdit');
    if (btnSaveActualEdit) btnSaveActualEdit.addEventListener('click', saveActualEdit);

    const editActualVersion = document.getElementById('editActualVersion');
    if (editActualVersion) editActualVersion.addEventListener('change', () => handleVersionChange('editActualVersion'));

    const editActualMember = document.getElementById('editActualMember');
    if (editActualMember) editActualMember.addEventListener('change', handleEditActualMemberChange);

    const editActualTaskSelect = document.getElementById('editActualTaskSelect');
    if (editActualTaskSelect) editActualTaskSelect.addEventListener('change', handleActualTaskSelect);

    const editActualProcess = document.getElementById('editActualProcess');
    if (editActualProcess) editActualProcess.addEventListener('change', handleActualProcessChange);

    // その他作業・休暇登録ボタン (カレンダーからの新規登録時に表示)
    // イベント委譲を使用して確実にイベントをキャッチする
    const editActualModal = document.getElementById('editActualModal');
    if (editActualModal) {
        editActualModal.addEventListener('click', (e) => {
            const otherBtn = e.target.closest('#editActualOtherBtn');
            if (otherBtn) {
                openOtherWorkFromCalendar();
                return;
            }

            const vacationBtn = e.target.closest('#editActualVacationBtn');
            if (vacationBtn) {
                openVacationFromCalendar();
                return;
            }
        });
    }


    // Vacation Modal
    const btnCloseVacationModal = document.getElementById('btnCloseVacationModal');
    if (btnCloseVacationModal) btnCloseVacationModal.addEventListener('click', closeVacationModal);

    const btnCloseVacationModalCancel = document.getElementById('btnCloseVacationModalCancel');
    if (btnCloseVacationModalCancel) btnCloseVacationModalCancel.addEventListener('click', closeVacationModal);

    const vacationModalType = document.getElementById('vacationModalType');
    if (vacationModalType) vacationModalType.addEventListener('change', handleVacationModalTypeChange);

    const btnSaveVacationFromModal = document.getElementById('btnSaveVacationFromModal');
    if (btnSaveVacationFromModal) btnSaveVacationFromModal.addEventListener('click', saveVacationFromModal);

    // Add Estimate Modal
    const addEstVersion = document.getElementById('addEstVersion');
    if (addEstVersion) addEstVersion.addEventListener('change', () => handleVersionChange('addEstVersion'));

    const addEstFormNameSelect = document.getElementById('addEstFormNameSelect');
    if (addEstFormNameSelect) addEstFormNameSelect.addEventListener('change', handleAddFormNameChange);

    // Remaining Hours Modal
    const btnCloseRemainingHoursModal = document.getElementById('btnCloseRemainingHoursModal');
    if (btnCloseRemainingHoursModal) btnCloseRemainingHoursModal.addEventListener('click', closeRemainingHoursModal);

    // Process Breakdown Modal
    const btnCloseProcessBreakdownModal = document.getElementById('btnCloseProcessBreakdownModal');
    if (btnCloseProcessBreakdownModal) btnCloseProcessBreakdownModal.addEventListener('click', closeProcessBreakdownModal);

    if (debugModeEnabled) console.log('✅ events.js: イベントハンドラ初期化完了');

    // Expose for generated HTML
    window.togglePhaseCollapse = togglePhaseCollapse;
    window.handleActualTaskSelect = handleActualTaskSelect;

    // アニメーション状態の初期化
    initAnimationState();
}
