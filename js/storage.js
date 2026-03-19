// ============================================
// localStorage・バックアップ機能
// ============================================

import {
    estimates, setEstimates,
    actuals, setActuals,
    companyHolidays, setCompanyHolidays,
    vacations, setVacations,
    remainingEstimates, setRemainingEstimates,
    setNextCompanyHolidayId, setNextVacationId,
    showMonthColorsSetting, setShowMonthColorsSetting,
    reportMatrixBgColorMode, setReportMatrixBgColorMode,
    showProgressBarsSetting, setShowProgressBarsSetting,
    showProgressPercentageSetting, setShowProgressPercentageSetting,
    progressBarStyle, setProgressBarStyle,
    matrixEstActFormat, setMatrixEstActFormat,
    filterBarMode, setFilterBarMode,
    scheduleBarColorMode, setScheduleBarColorMode,

    debugModeEnabled, setDebugModeEnabled,
    devFeaturesEnabled, setDevFeaturesEnabled,
    selectedChartColorScheme,
    setCurrentThemeColor, setCurrentThemePattern, setCurrentTabColor, setCurrentBackgroundColor,
    setEstimateLayout, setActualLayout, setReportLayout, setMemberOrder,
    // [GANTT-CHART] スケジュール関連
    schedules, setSchedules, setNextScheduleId,
    scheduleSettings, setScheduleSettings,
    taskColorMap, setTaskColorMap,
    taskSortOrder, setTaskSortOrder,
    setWorkDetailStyle, setModalDesignStyle,
    layoutDensity, setLayoutDensity,
    autoBackupFrequency, setAutoBackupFrequency,
    autoBackupMaxCount, setAutoBackupMaxCount,
    otherWorkTemplates, setOtherWorkTemplates
} from './state.js';

import { showAlert, escapeHtml, formatHours } from './utils.js';
import { clearProgressCache } from './report.js';
import { TASK_COLORS, THEME_TASK_COLORS } from './constants.js';
import { loadHistory } from './history.js';

// ============================================
// 自動バックアップ設定
// ============================================

export function loadAutoBackupSetting() {
    const saved = localStorage.getItem('autoBackupEnabled');
    window.autoBackupEnabled = saved === 'true';
    const checkbox = document.getElementById('autoBackupEnabled');
    if (checkbox) checkbox.checked = window.autoBackupEnabled;
}

export function saveAutoBackupSetting() {
    const checkbox = document.getElementById('autoBackupEnabled');
    if (checkbox) {
        window.autoBackupEnabled = checkbox.checked;
        localStorage.setItem('autoBackupEnabled', window.autoBackupEnabled);
    }
}

// ============================================
// 自動バックアップ頻度・保持数設定
// ============================================

export function loadAutoBackupFrequency() {
    const saved = localStorage.getItem('autoBackupFrequency');
    if (saved) setAutoBackupFrequency(saved);
    const el = document.getElementById('autoBackupFrequency');
    if (el) el.value = autoBackupFrequency;
}

export function saveAutoBackupFrequency() {
    const el = document.getElementById('autoBackupFrequency');
    if (el) {
        setAutoBackupFrequency(el.value);
        localStorage.setItem('autoBackupFrequency', el.value);
    }
}

export function loadAutoBackupMaxCount() {
    const saved = localStorage.getItem('autoBackupMaxCount');
    if (saved) setAutoBackupMaxCount(parseInt(saved, 10));
    const el = document.getElementById('autoBackupMaxCount');
    if (el) el.value = autoBackupMaxCount;
}

export function saveAutoBackupMaxCount() {
    const el = document.getElementById('autoBackupMaxCount');
    if (el) {
        setAutoBackupMaxCount(parseInt(el.value, 10));
        localStorage.setItem('autoBackupMaxCount', el.value);
    }
}

/**
 * 自動バックアップ頻度チェック
 * 頻度設定に基づいて、バックアップを実行すべきかどうかを判定
 * @returns {boolean} バックアップを実行すべきならtrue
 */
function shouldRunAutoBackup() {
    if (autoBackupFrequency === 'every') return true;

    const lastBackupTime = localStorage.getItem('lastAutoBackupTime');
    if (!lastBackupTime) return true;

    const now = Date.now();
    const elapsed = now - parseInt(lastBackupTime, 10);

    if (autoBackupFrequency === 'hourly') {
        return elapsed >= 60 * 60 * 1000; // 1時間
    } else if (autoBackupFrequency === 'daily') {
        return elapsed >= 24 * 60 * 60 * 1000; // 24時間
    }

    return true;
}

/**
 * localStorageにバックアップを保存し、古いバックアップを自動削除
 */
function saveBackupToLocalStorage(data) {
    const key = 'manhour_autoBackup_' + Date.now();
    try {
        localStorage.setItem(key, JSON.stringify(data));
        localStorage.setItem('lastAutoBackupTime', String(Date.now()));
    } catch (e) {
        console.warn('自動バックアップの保存に失敗しました（容量不足の可能性）:', e);
        // 容量不足の場合は古いバックアップを削除してリトライ
        cleanupOldBackups(1);
        try {
            localStorage.setItem(key, JSON.stringify(data));
            localStorage.setItem('lastAutoBackupTime', String(Date.now()));
        } catch (e2) {
            console.error('リトライ後も自動バックアップの保存に失敗:', e2);
        }
    }

    // 保持数を超えたバックアップを削除
    cleanupOldBackups(autoBackupMaxCount);
}

/**
 * 古い自動バックアップをlocalStorageから削除
 * @param {number} keepCount - 保持するバックアップ数
 */
function cleanupOldBackups(keepCount) {
    const backupKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('manhour_autoBackup_')) {
            backupKeys.push(key);
        }
    }

    // タイムスタンプ順にソート（新しい順）
    backupKeys.sort((a, b) => {
        const tsA = parseInt(a.replace('manhour_autoBackup_', ''), 10);
        const tsB = parseInt(b.replace('manhour_autoBackup_', ''), 10);
        return tsB - tsA;
    });

    // keepCount を超えたものを削除
    for (let i = keepCount; i < backupKeys.length; i++) {
        localStorage.removeItem(backupKeys[i]);
    }
}

/**
 * localStorageに保存されている自動バックアップ一覧を取得
 * @returns {Array<{key: string, timestamp: number, dateStr: string, size: number}>}
 */
export function getAutoBackupList() {
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('manhour_autoBackup_')) {
            const ts = parseInt(key.replace('manhour_autoBackup_', ''), 10);
            const date = new Date(ts);
            const data = localStorage.getItem(key);
            backups.push({
                key,
                timestamp: ts,
                dateStr: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
                size: data ? data.length : 0
            });
        }
    }
    backups.sort((a, b) => b.timestamp - a.timestamp);
    return backups;
}

/**
 * 古い自動バックアップを全て削除
 */
export function clearAllAutoBackups() {
    const backups = getAutoBackupList();
    backups.forEach(b => localStorage.removeItem(b.key));
    renderAutoBackupList();
    showAlert(`${backups.length}件の自動バックアップを削除しました`, true);
}

/**
 * 自動バックアップから復元
 * @param {string} key - localStorageキー
 */
export function restoreFromAutoBackup(key) {
    const data = localStorage.getItem(key);
    if (!data) {
        showAlert('バックアップデータが見つかりません', false);
        return;
    }

    if (!confirm('このバックアップからデータを復元しますか？現在のデータは上書きされます。')) {
        return;
    }

    try {
        const parsed = JSON.parse(data);
        // handleFileImportと同じ復元ロジックを再利用するため、Blobを使う
        const blob = new Blob([JSON.stringify(parsed)], { type: 'application/json' });
        const file = new File([blob], 'autobackup.json', { type: 'application/json' });
        const event = { target: { files: [file], value: '' } };
        handleFileImport(event);
    } catch (e) {
        console.error('自動バックアップ復元エラー:', e);
        showAlert('バックアップデータの復元に失敗しました', false);
    }
}

/**
 * 自動バックアップ一覧をDOM上に描画
 */
export function renderAutoBackupList() {
    const container = document.getElementById('autoBackupList');
    if (!container) return;

    const backups = getAutoBackupList();

    if (backups.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; margin: 0;">保存された自動バックアップはありません</p>';
        return;
    }

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    let html = '<div style="display: flex; flex-direction: column; gap: 4px;">';
    backups.forEach((b, i) => {
        html += `<div style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--surface); border-radius: 4px; font-size: 12px;">
            <span style="flex: 1; color: var(--text-primary);">${b.dateStr}</span>
            <span style="color: var(--text-muted); font-size: 11px;">${formatSize(b.size)}</span>
            <button class="btn btn-sm" data-backup-key="${b.key}" data-action="restore" style="padding: 2px 8px; font-size: 11px;">復元</button>
            <button class="btn btn-sm" data-backup-key="${b.key}" data-action="download" style="padding: 2px 8px; font-size: 11px;">DL</button>
            <button class="btn btn-sm" data-backup-key="${b.key}" data-action="delete" style="padding: 2px 8px; font-size: 11px; color: var(--danger, #dc3545);">削除</button>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    // イベント設定
    container.querySelectorAll('button[data-backup-key]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.backupKey;
            const action = btn.dataset.action;
            if (action === 'restore') {
                restoreFromAutoBackup(key);
            } else if (action === 'download') {
                downloadAutoBackup(key);
            } else if (action === 'delete') {
                localStorage.removeItem(key);
                renderAutoBackupList();
                showAlert('バックアップを削除しました', true);
            }
        });
    });
}

/**
 * 自動バックアップをファイルとしてダウンロード
 * @param {string} key - localStorageキー
 */
function downloadAutoBackup(key) {
    const data = localStorage.getItem(key);
    if (!data) return;

    const ts = parseInt(key.replace('manhour_autoBackup_', ''), 10);
    const date = new Date(ts);
    const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工数管理_自動バックアップ_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// データ保存・読み込み
// ============================================

/**
 * すべてのデータをlocalStorageに保存
 * 見積・実績・休日・休暇・設定・キャッシュを同期保存し、必要に応じて自動バックアップを実行
 * @param {boolean} [skipAutoBackup=false] - 自動バックアップをスキップするか
 * @returns {void}
 */
export function saveData(skipAutoBackup = false) {
    // 担当者順はステート変数を優先（DOM要素が非表示の場合があるため）
    const memberOrderEl = document.getElementById('memberOrder');
    const memberOrderValue = window.memberOrder || (memberOrderEl ? memberOrderEl.value.trim() : '');
    const data = {
        estimates: estimates,
        actuals: actuals,
        companyHolidays: companyHolidays,
        vacations: vacations,
        settings: {
            memberOrder: memberOrderValue,
            themeColor: window.currentThemeColor,
            themePattern: window.currentThemePattern,
            themeTabColor: window.currentTabColor,
            autoBackup: window.autoBackupEnabled,
            autoBackupFrequency: autoBackupFrequency,
            autoBackupMaxCount: autoBackupMaxCount,
            estimateLayout: window.estimateLayout,
            actualLayout: window.actualLayout,
            reportLayout: window.reportLayout,
            showMonthColors: showMonthColorsSetting,
            reportMatrixBgColorMode: reportMatrixBgColorMode,
            showProgressBars: showProgressBarsSetting,
            showProgressPercentage: showProgressPercentageSetting,
            progressBarStyle: progressBarStyle,
            matrixEstActFormat: matrixEstActFormat,
            filterBarMode: filterBarMode,
            scheduleBarColorMode: scheduleBarColorMode,

            defaultEstimateViewType: document.getElementById('defaultEstimateViewType') ? document.getElementById('defaultEstimateViewType').value : 'matrix',
            defaultReportViewType: document.getElementById('defaultReportViewType') ? document.getElementById('defaultReportViewType').value : 'matrix',
            chartColorScheme: selectedChartColorScheme,
            workDetailStyle: window.workDetailStyle,
            modalDesignStyle: window.modalDesignStyle,
            layoutDensity: window.layoutDensity || 'comfortable',
            estimateStandardDisplay: document.getElementById('estimateStandardDisplay') ? document.getElementById('estimateStandardDisplay').value : 'subtext'
        }
    };

    localStorage.setItem('manhour_estimates', JSON.stringify(estimates));
    localStorage.setItem('manhour_actuals', JSON.stringify(actuals));
    localStorage.setItem('manhour_companyHolidays', JSON.stringify(companyHolidays));
    localStorage.setItem('manhour_vacations', JSON.stringify(vacations));
    localStorage.setItem('manhour_remainingEstimates', JSON.stringify(remainingEstimates));
    // [GANTT-CHART] スケジュールデータ保存
    localStorage.setItem('manhour_schedules', JSON.stringify(schedules));
    localStorage.setItem('manhour_scheduleSettings', JSON.stringify(scheduleSettings));
    localStorage.setItem('manhour_taskColorMap', JSON.stringify(taskColorMap));
    localStorage.setItem('manhour_taskSortOrder', JSON.stringify(taskSortOrder));
    localStorage.setItem('manhour_settings', JSON.stringify(data.settings));
    localStorage.setItem('manhour_estimateStandardDisplay', data.settings.estimateStandardDisplay);
    localStorage.setItem('manhour_otherWorkTemplates', JSON.stringify(otherWorkTemplates));

    // 進捗計算キャッシュをクリア
    clearProgressCache();

    // 作業月選択肢を更新（window経由で呼び出し）
    if (typeof window.updateWorkMonthOptions === 'function') {
        window.updateWorkMonthOptions();
    }

    // 版数選択肢を更新
    if (typeof window.updateVersionOptions === 'function') {
        window.updateVersionOptions();
    }

    // 処理名リストを更新
    if (typeof window.updateFormNameOptions === 'function') {
        window.updateFormNameOptions();
    }

    // 自動バックアップが有効な場合のみ実行
    if (!skipAutoBackup && window.autoBackupEnabled) {
        autoBackup();
    }
}

/**
 * すべてのデータをlocalStorageから読み込み
 * 見積・実績・休日・休暇・設定を復元し、ID最大値を再計算してセット
 * データ破損時はエラーハンドリングを実行してデフォルト値を使用
 * @returns {void}
 */
export function loadData() {
    const savedEstimates = localStorage.getItem('manhour_estimates');
    const savedActuals = localStorage.getItem('manhour_actuals');
    const savedCompanyHolidays = localStorage.getItem('manhour_companyHolidays');
    const savedVacations = localStorage.getItem('manhour_vacations');
    const savedRemainingEstimates = localStorage.getItem('manhour_remainingEstimates');
    const savedSettings = localStorage.getItem('manhour_settings');

    try {
        if (savedEstimates) setEstimates(JSON.parse(savedEstimates));
        if (savedActuals) setActuals(JSON.parse(savedActuals));
        if (savedCompanyHolidays) setCompanyHolidays(JSON.parse(savedCompanyHolidays));
        if (savedVacations) setVacations(JSON.parse(savedVacations));
        if (savedRemainingEstimates) setRemainingEstimates(JSON.parse(savedRemainingEstimates));
        // [GANTT-CHART] スケジュールデータ読み込み
        const savedSchedules = localStorage.getItem('manhour_schedules');
        const savedScheduleSettings = localStorage.getItem('manhour_scheduleSettings');
        const savedTaskColorMap = localStorage.getItem('manhour_taskColorMap');
        if (savedSchedules) setSchedules(JSON.parse(savedSchedules));
        if (savedScheduleSettings) setScheduleSettings(JSON.parse(savedScheduleSettings));
        if (savedTaskColorMap) {
            const parsed = JSON.parse(savedTaskColorMap);
            // パレット変更時: どのテーマパレットにもない色が含まれていたらリセット
            const allColors = new Set();
            Object.values(THEME_TASK_COLORS).forEach(p => p.forEach(c => allColors.add(c)));
            const hasOldColors = Object.values(parsed).some(c => !allColors.has(c));
            if (hasOldColors) {
                setTaskColorMap({});
            } else {
                setTaskColorMap(parsed);
            }
        }
        // タスク着手順の読み込み
        const savedTaskSortOrder = localStorage.getItem('manhour_taskSortOrder');
        if (savedTaskSortOrder) {
            setTaskSortOrder(JSON.parse(savedTaskSortOrder));
        }
        // その他工数テンプレートの読み込み
        const savedTemplates = localStorage.getItem('manhour_otherWorkTemplates');
        if (savedTemplates) {
            setOtherWorkTemplates(JSON.parse(savedTemplates));
        }
    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);
        alert('保存されたデータの読み込みに失敗しました。データが破損している可能性があります。');
        // データをリセット（オプション）
        // localStorage.clear();
    }

    // 次のIDを設定
    if (companyHolidays.length > 0) {
        const ids = companyHolidays.map(h => h.id).filter(id => typeof id === 'number' && !isNaN(id));
        if (ids.length > 0) {
            setNextCompanyHolidayId(Math.max(...ids) + 1);
        }
    }
    if (vacations.length > 0) {
        const ids = vacations.map(v => v.id).filter(id => typeof id === 'number' && !isNaN(id));
        if (ids.length > 0) {
            setNextVacationId(Math.max(...ids) + 1);
        }
    }

    // [GANTT-CHART] スケジュールIDの最大値を設定
    if (schedules.length > 0) {
        const maxId = Math.max(...schedules.map(s => {
            const match = s.id.match(/sch_(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }));
        setNextScheduleId(maxId + 1);
    }

    // 設定を読み込み
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.memberOrder) setMemberOrder(settings.memberOrder);
            if (settings.themeColor) setCurrentThemeColor(settings.themeColor);
            if (settings.themePattern) setCurrentThemePattern(settings.themePattern);
            if (settings.themeTabColor) setCurrentTabColor(settings.themeTabColor);
            if (settings.autoBackup !== undefined) window.autoBackupEnabled = settings.autoBackup;
            if (settings.autoBackupFrequency) {
                setAutoBackupFrequency(settings.autoBackupFrequency);
                localStorage.setItem('autoBackupFrequency', settings.autoBackupFrequency);
            }
            if (settings.autoBackupMaxCount !== undefined) {
                setAutoBackupMaxCount(settings.autoBackupMaxCount);
                localStorage.setItem('autoBackupMaxCount', String(settings.autoBackupMaxCount));
            }
            // レイアウト設定は読み込まない（セグメント表示に固定）
            if (settings.showMonthColors !== undefined) {
                setShowMonthColorsSetting(settings.showMonthColors);
            }
            // レポートマトリクスの背景色モード設定を読み込み（新形式）
            if (settings.reportMatrixBgColorMode) {
                setReportMatrixBgColorMode(settings.reportMatrixBgColorMode);
            } else if (settings.showDeviationColors !== undefined) {
                // 旧形式からの移行処理
                setReportMatrixBgColorMode(settings.showDeviationColors ? 'deviation' : 'none');
            }
            // 進捗バー表示の設定を読み込み
            if (settings.showProgressBars !== undefined) {
                setShowProgressBarsSetting(settings.showProgressBars);
            }
            // 進捗バーのパーセンテージ表示の設定を読み込み
            if (settings.showProgressPercentage !== undefined) {
                setShowProgressPercentageSetting(settings.showProgressPercentage);
            }
            // 進捗バーのスタイル設定を読み込み
            if (settings.progressBarStyle) {
                setProgressBarStyle(settings.progressBarStyle);
            }
            // 見積と実績の表示形式の設定を読み込み
            if (settings.matrixEstActFormat) {
                setMatrixEstActFormat(settings.matrixEstActFormat);
            }
            // フィルタバー表示モードの設定を読み込み
            if (settings.filterBarMode) {
                setFilterBarMode(settings.filterBarMode);
            }
            // スケジュールバー色モードの設定を読み込み
            if (settings.scheduleBarColorMode) {
                setScheduleBarColorMode(settings.scheduleBarColorMode);
            }
            // 開発中の機能表示設定を読み込み
            if (settings.devFeaturesEnabled !== undefined) {
                setDevFeaturesEnabled(settings.devFeaturesEnabled);
            }
            // 作業詳細モーダルのスタイル設定を読み込み
            if (settings.workDetailStyle) {
                setWorkDetailStyle(settings.workDetailStyle);
                const el = document.getElementById('workDetailStyle');
                if (el) el.value = settings.workDetailStyle;
            }
            // モーダル全体のデザインスタイル設定を読み込み
            if (settings.modalDesignStyle) {
                setModalDesignStyle(settings.modalDesignStyle);
                const el = document.getElementById('modalDesignStyle');
                if (el) el.value = settings.modalDesignStyle;
            }
            // レイアウト密度設定を読み込み
            if (settings.layoutDensity) {
                setLayoutDensity(settings.layoutDensity);
                const el = document.getElementById('layoutDensity');
                if (el) el.value = settings.layoutDensity;
            }

            if (settings.estimateStandardDisplay) {
                const el = document.getElementById('estimateStandardDisplay');
                if (el) el.value = settings.estimateStandardDisplay;
                localStorage.setItem('manhour_estimateStandardDisplay', settings.estimateStandardDisplay);
            }

        } catch (error) {
            console.error('設定の読み込みに失敗しました:', error);
            // デフォルト設定を使用（エラーは表示しない）
        }
    }

    // レイアウト設定を適用（window経由で呼び出し）
    if (typeof window.applyLayoutSettings === 'function') {
        window.applyLayoutSettings();
    }

    // Undo/Redo 履歴を復元
    loadHistory();
}

// ============================================
// バックアップ・復元
// ============================================

/**
 * バックアップデータオブジェクトを生成
 * @returns {Object} バックアップデータ
 */
function createBackupData() {
    const memberOrderEl = document.getElementById('memberOrder');
    const memberOrderValue = window.memberOrder || (memberOrderEl ? memberOrderEl.value.trim() : '');
    const settings = {
        themeColor: window.currentThemeColor,
        themePattern: window.currentThemePattern,
        themeTabColor: window.currentTabColor,
        themeBackgroundColor: window.currentBackgroundColor,
        estimateLayout: window.estimateLayout,
        actualLayout: window.actualLayout,
        reportLayout: window.reportLayout,
        showMonthColors: showMonthColorsSetting,
        reportMatrixBgColorMode: reportMatrixBgColorMode,
        showProgressBars: showProgressBarsSetting,
        showProgressPercentage: showProgressPercentageSetting,
        progressBarStyle: progressBarStyle,
        matrixEstActFormat: matrixEstActFormat,
        filterBarMode: filterBarMode,
        scheduleBarColorMode: scheduleBarColorMode,

        defaultEstimateViewType: document.getElementById('defaultEstimateViewType') ? document.getElementById('defaultEstimateViewType').value : 'grouped',
        defaultReportViewType: document.getElementById('defaultReportViewType') ? document.getElementById('defaultReportViewType').value : 'grouped',
        chartColorScheme: selectedChartColorScheme,
        memberOrder: memberOrderValue,
        debugModeEnabled: debugModeEnabled,
        devFeaturesEnabled: devFeaturesEnabled,
        workDetailStyle: window.workDetailStyle,
        estimateStandardDisplay: document.getElementById('estimateStandardDisplay') ? document.getElementById('estimateStandardDisplay').value : 'subtext'
    };

    return {
        estimates: estimates,
        actuals: actuals,
        companyHolidays: companyHolidays,
        vacations: vacations,
        remainingEstimates: remainingEstimates,
        schedules: schedules,
        scheduleSettings: { ...scheduleSettings },
        taskColorMap: { ...taskColorMap },
        settings: settings,
        timestamp: new Date().toISOString(),
        version: '1.1'
    };
}

/**
 * 自動バックアップを実行
 * 頻度設定に基づきlocalStorageにバックアップを保存し、古いものを自動削除
 * @returns {void}
 */
export function autoBackup() {
    // 頻度チェック
    if (!shouldRunAutoBackup()) return;

    const data = createBackupData();

    // localStorageに保存（自動管理）
    saveBackupToLocalStorage(data);
}

/**
 * 手動バックアップ（ファイルダウンロード）
 * @returns {void}
 */
export function downloadBackup() {
    const data = createBackupData();

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    // ローカルタイムでファイル名を生成（YYYYMMDD-HHmm形式）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${year}${month}${day}-${hour}${minute}`;

    a.href = url;
    a.download = `工数管理_バックアップ_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportBackup() {
    downloadBackup();
    showAlert('バックアップファイルをダウンロードしました', true);
}

export function importBackup() {
    document.getElementById('fileInput').click();
}

/**
 * ファイルをインポート（JSON/Excel形式に対応）
 * JSONファイルの場合: 全データ（見積・実績・休日・休暇・設定）を復元
 * Excelファイルの場合: 実績データのみをインポート
 * @param {Event} event - ファイル選択イベント
 * @returns {void}
 */
export function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
        // JSONファイルの処理
        const reader = new FileReader();
        reader.onerror = function (e) {
            console.error('ファイル読み込みエラー:', reader.error);
            const message = debugModeEnabled
                ? 'ファイルの読み込みに失敗しました: ' + reader.error.message
                : 'ファイルの読み込みに失敗しました';
            showAlert(message, false);
        };
        reader.onload = function (e) {
            try {
                const data = JSON.parse(e.target.result);

                // 現在のデータが空かどうかをチェック
                const hasExistingData = estimates.length > 0 ||
                    actuals.length > 0 ||
                    companyHolidays.length > 0 ||
                    vacations.length > 0 ||
                    remainingEstimates.length > 0 ||
                    schedules.length > 0;

                // データがある場合: マージか上書きかを選択
                if (hasExistingData) {
                    showImportChoiceDialog(data);
                    return;
                }

                // データが空の場合: そのまま上書き
                if (true) {
                    setEstimates(data.estimates || []);
                    setActuals(data.actuals || []);
                    setCompanyHolidays(data.companyHolidays || []);
                    setVacations(data.vacations || []);
                    setRemainingEstimates(data.remainingEstimates || []);

                    // スケジュールデータの復元
                    if (data.schedules) {
                        setSchedules(data.schedules);
                        // nextScheduleIdを設定
                        const maxId = data.schedules.reduce((max, s) => {
                            const match = s.id && s.id.match(/sch_(\d+)/);
                            return match ? Math.max(max, parseInt(match[1], 10)) : max;
                        }, 0);
                        setNextScheduleId(maxId + 1);
                    }
                    if (data.scheduleSettings) {
                        setScheduleSettings(data.scheduleSettings);
                    }
                    if (data.taskColorMap) {
                        // パレット変更時: どのテーマパレットにもない色が含まれていたらリセット
                        const allColors = new Set();
                        Object.values(THEME_TASK_COLORS).forEach(p => p.forEach(c => allColors.add(c)));
                        const hasOldColors = Object.values(data.taskColorMap).some(c => !allColors.has(c));
                        if (hasOldColors) {
                            setTaskColorMap({});
                        } else {
                            setTaskColorMap(data.taskColorMap);
                        }
                    }

                    // 次のIDを設定
                    if (companyHolidays.length > 0) {
                        const ids = companyHolidays.map(h => h.id).filter(id => typeof id === 'number' && !isNaN(id));
                        if (ids.length > 0) {
                            setNextCompanyHolidayId(Math.max(...ids) + 1);
                        }
                    }
                    if (vacations.length > 0) {
                        const ids = vacations.map(v => v.id).filter(id => typeof id === 'number' && !isNaN(id));
                        if (ids.length > 0) {
                            setNextVacationId(Math.max(...ids) + 1);
                        }
                    }

                    // 設定を復元
                    if (data.settings) {
                        // テーマ設定を復元
                        if (data.settings.themeColor) {
                            setCurrentThemeColor(data.settings.themeColor);
                            const el = document.getElementById('themeColor');
                            if (el) el.value = data.settings.themeColor;
                        }
                        if (data.settings.themePattern) {
                            setCurrentThemePattern(data.settings.themePattern);
                            const el = document.getElementById('themePattern');
                            if (el) el.value = data.settings.themePattern;
                        }
                        if (data.settings.themeTabColor) {
                            setCurrentTabColor(data.settings.themeTabColor);
                            const el = document.getElementById('themeTabColor');
                            if (el) el.value = data.settings.themeTabColor;
                        }
                        if (data.settings.themeBackgroundColor) {
                            setCurrentBackgroundColor(data.settings.themeBackgroundColor);
                            const el = document.getElementById('themeBackgroundColor');
                            if (el) el.value = data.settings.themeBackgroundColor;
                        }

                        // レイアウト設定を復元
                        if (data.settings.estimateLayout) window.estimateLayout = data.settings.estimateLayout;
                        if (data.settings.actualLayout) window.actualLayout = data.settings.actualLayout;
                        if (data.settings.reportLayout) window.reportLayout = data.settings.reportLayout;
                        // セグメントボタン表示チェックボックスを同期
                        const isSegmented = window.estimateLayout === 'segmented' || window.actualLayout === 'segmented' || window.reportLayout === 'segmented';
                        localStorage.setItem('showSegmentButtons', isSegmented);
                        const segChk = document.getElementById('showSegmentButtons');
                        if (segChk) segChk.checked = isSegmented;

                        // 月色分け設定を復元
                        if (data.settings.showMonthColors !== undefined) {
                            setShowMonthColorsSetting(data.settings.showMonthColors);
                            const checkbox = document.getElementById('showMonthColorsCheckbox');
                            if (checkbox) checkbox.checked = data.settings.showMonthColors;
                        }

                        // レポートマトリクスの背景色モード設定を復元
                        if (data.settings.reportMatrixBgColorMode) {
                            setReportMatrixBgColorMode(data.settings.reportMatrixBgColorMode);
                            const radioButton = document.querySelector(`input[name="reportMatrixBgColorMode"][value="${data.settings.reportMatrixBgColorMode}"]`);
                            if (radioButton) radioButton.checked = true;
                        } else if (data.settings.showDeviationColors !== undefined) {
                            // 旧形式からの移行処理
                            const mode = data.settings.showDeviationColors ? 'deviation' : 'none';
                            setReportMatrixBgColorMode(mode);
                            const radioButton = document.querySelector(`input[name="reportMatrixBgColorMode"][value="${mode}"]`);
                            if (radioButton) radioButton.checked = true;
                        }

                        // 進捗バー表示設定を復元
                        if (data.settings.showProgressBars !== undefined) {
                            setShowProgressBarsSetting(data.settings.showProgressBars);
                            const checkbox = document.getElementById('showProgressBarsCheckbox');
                            if (checkbox) checkbox.checked = data.settings.showProgressBars;
                        }

                        // 進捗バーのパーセンテージ表示設定を復元
                        if (data.settings.showProgressPercentage !== undefined) {
                            setShowProgressPercentageSetting(data.settings.showProgressPercentage);
                            const checkbox = document.getElementById('showProgressPercentageCheckbox');
                            if (checkbox) checkbox.checked = data.settings.showProgressPercentage;
                        }

                        // 進捗バーのスタイル設定を復元
                        if (data.settings.progressBarStyle) {
                            setProgressBarStyle(data.settings.progressBarStyle);
                            const radioButton = document.querySelector(`input[name="progressBarStyle"][value="${data.settings.progressBarStyle}"]`);
                            if (radioButton) radioButton.checked = true;
                        }

                        // デフォルト表示形式を復元
                        if (data.settings.defaultEstimateViewType) {
                            const select = document.getElementById('defaultEstimateViewType');
                            if (select) select.value = data.settings.defaultEstimateViewType;
                        }
                        if (data.settings.defaultReportViewType) {
                            const select = document.getElementById('defaultReportViewType');
                            if (select) select.value = data.settings.defaultReportViewType;
                        }

                        // 担当者表示順を復元
                        if (data.settings.memberOrder) {
                            const memberOrderEl = document.getElementById('memberOrder');
                            if (memberOrderEl) memberOrderEl.value = data.settings.memberOrder;
                        }


                        // フィルタバー表示モードを復元
                        if (data.settings.filterBarMode) {
                            setFilterBarMode(data.settings.filterBarMode);
                            const radioButton = document.querySelector(`input[name="filterBarMode"][value="${data.settings.filterBarMode}"]`);
                            if (radioButton) radioButton.checked = true;
                            if (typeof window.applyFilterBarMode === 'function') window.applyFilterBarMode();
                        }

                        // スケジュールバー色モードを復元
                        if (data.settings.scheduleBarColorMode) {
                            setScheduleBarColorMode(data.settings.scheduleBarColorMode);
                            const radio = document.querySelector(`input[name="scheduleBarColorMode"][value="${data.settings.scheduleBarColorMode}"]`);
                            if (radio) radio.checked = true;
                        }

                        // デバッグモード設定を復元
                        if (data.settings.debugModeEnabled !== undefined) {
                            setDebugModeEnabled(data.settings.debugModeEnabled);
                            localStorage.setItem('debugModeEnabled', debugModeEnabled);
                            const checkbox = document.getElementById('debugModeEnabled');
                            if (checkbox) checkbox.checked = debugModeEnabled;
                        }
                        // 開発中機能表示設定を復元
                        if (data.settings.devFeaturesEnabled !== undefined) {
                            setDevFeaturesEnabled(data.settings.devFeaturesEnabled);
                            localStorage.setItem('devFeaturesEnabled', devFeaturesEnabled);
                            const checkbox = document.getElementById('devFeaturesEnabled');
                            if (checkbox) checkbox.checked = devFeaturesEnabled;
                            // タブの表示/非表示を更新
                            if (typeof window.loadDevFeaturesSetting === 'function') {
                                window.loadDevFeaturesSetting();
                            }
                        }
                    } else if (data.memberOrder) {
                        // 旧形式（settingsがない場合）の後方互換性
                        const memberOrderEl = document.getElementById('memberOrder');
                        if (memberOrderEl) memberOrderEl.value = data.memberOrder;
                    }

                    saveData(true); // 復元時は自動バックアップをスキップ

                    // テーマを適用
                    if (typeof window.applyTheme === 'function') {
                        window.applyTheme();
                    }

                    // レイアウトを適用
                    if (typeof window.applyLayoutSettings === 'function') {
                        window.applyLayoutSettings();
                    }

                    // UI更新
                    // 復元後はレポートの保存済みフィルタをクリアしてデフォルト（現在月）を適用
                    try { localStorage.removeItem('manhour_reportFilterState'); } catch (e) { /* ignore */ }
                    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
                    if (typeof window.setDefaultReportMonth === 'function') window.setDefaultReportMonth();
                    if (typeof window.updateEstimateMonthOptions === 'function') window.updateEstimateMonthOptions();
                    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
                    if (typeof window.setDefaultEstimateMonth === 'function') window.setDefaultEstimateMonth();
                    if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
                    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
                    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
                    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
                    if (typeof window.renderActualList === 'function') window.renderActualList();
                    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
                    if (typeof window.updateReport === 'function') window.updateReport();
                    if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();
                    if (typeof window.renderScheduleView === 'function') window.renderScheduleView();

                    showAlert('データを復元しました', true);
                }
            } catch (error) {
                console.error('ファイル読み込みエラー:', error);
                const message = debugModeEnabled
                    ? 'ファイルの読み込みに失敗しました: ' + error.message
                    : 'ファイルの読み込みに失敗しました';
                showAlert(message, false);
            }
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        // Excelファイルの処理（window経由で呼び出し）
        if (typeof window.handleExcelImport === 'function') {
            window.handleExcelImport(file);
        } else {
            alert('対応していないファイル形式です。JSON ファイルを選択してください。');
        }
    } else {
        alert('対応していないファイル形式です。JSON または Excel ファイルを選択してください。');
    }

    event.target.value = '';
}

// ============================================
// インポート選択ダイアログ
// ============================================

/**
 * インポート時に上書き/マージ選択ダイアログを表示
 * @param {Object} importedData - インポートされたデータ
 */
function showImportChoiceDialog(importedData) {
    // 既存のダイアログがあれば削除
    const existing = document.getElementById('importChoiceModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'importChoiceModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 420px;">
            <div class="modal-header modal-theme-ink">
                <h3>データのインポート</h3>
                <span class="close" onclick="document.getElementById('importChoiceModal').remove()">&times;</span>
            </div>
            <div class="modal-body" style="padding: 20px;">
                <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
                    現在のデータが存在します。インポート方法を選択してください。
                </p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button id="importChoiceReplace" class="btn" style="padding: 12px; text-align: left;">
                        <div style="font-weight: 600; font-size: 13px;">全データを上書き</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">現在のデータをインポートデータで完全に置き換えます</div>
                    </button>
                    <button id="importChoiceMerge" class="btn" style="padding: 12px; text-align: left;">
                        <div style="font-weight: 600; font-size: 13px;">差分をマージ</div>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">差分を確認し、項目ごとに取り込む/スキップを選べます</div>
                    </button>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="document.getElementById('importChoiceModal').remove()" class="btn btn-secondary btn-sm">キャンセル</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('importChoiceReplace').addEventListener('click', () => {
        modal.remove();
        applyFullReplace(importedData);
    });

    document.getElementById('importChoiceMerge').addEventListener('click', () => {
        modal.remove();
        showMergeDialog(importedData);
    });
}

/**
 * 既存のフルリプレース処理を実行
 * @param {Object} data - インポートデータ
 */
function applyFullReplace(data) {
    setEstimates(data.estimates || []);
    setActuals(data.actuals || []);
    setCompanyHolidays(data.companyHolidays || []);
    setVacations(data.vacations || []);
    setRemainingEstimates(data.remainingEstimates || []);

    if (data.schedules) {
        setSchedules(data.schedules);
        const maxId = data.schedules.reduce((max, s) => {
            const match = s.id && s.id.match(/sch_(\d+)/);
            return match ? Math.max(max, parseInt(match[1], 10)) : max;
        }, 0);
        setNextScheduleId(maxId + 1);
    }
    if (data.scheduleSettings) setScheduleSettings(data.scheduleSettings);
    if (data.taskColorMap) {
        const allColors = new Set();
        Object.values(THEME_TASK_COLORS).forEach(p => p.forEach(c => allColors.add(c)));
        const hasOldColors = Object.values(data.taskColorMap).some(c => !allColors.has(c));
        setTaskColorMap(hasOldColors ? {} : data.taskColorMap);
    }

    if (companyHolidays.length > 0) {
        const ids = companyHolidays.map(h => h.id).filter(id => typeof id === 'number' && !isNaN(id));
        if (ids.length > 0) setNextCompanyHolidayId(Math.max(...ids) + 1);
    }
    if (vacations.length > 0) {
        const ids = vacations.map(v => v.id).filter(id => typeof id === 'number' && !isNaN(id));
        if (ids.length > 0) setNextVacationId(Math.max(...ids) + 1);
    }

    if (data.settings) applyImportedSettings(data.settings, data.memberOrder);

    saveData(true);
    if (typeof window.applyTheme === 'function') window.applyTheme();
    if (typeof window.applyLayoutSettings === 'function') window.applyLayoutSettings();
    refreshAllUI();
    showAlert('データを復元しました', true);
}

/**
 * 設定データを適用（上書きインポート・マージ共通）
 */
function applyImportedSettings(settings, legacyMemberOrder) {
    if (!settings) {
        if (legacyMemberOrder) {
            const el = document.getElementById('memberOrder');
            if (el) el.value = legacyMemberOrder;
        }
        return;
    }

    // テーマ設定
    if (settings.themeColor) {
        setCurrentThemeColor(settings.themeColor);
        const el = document.getElementById('themeColor');
        if (el) el.value = settings.themeColor;
    }
    if (settings.themePattern) {
        setCurrentThemePattern(settings.themePattern);
        const el = document.getElementById('themePattern');
        if (el) el.value = settings.themePattern;
    }
    if (settings.themeTabColor) {
        setCurrentTabColor(settings.themeTabColor);
        const el = document.getElementById('themeTabColor');
        if (el) el.value = settings.themeTabColor;
    }
    if (settings.themeBackgroundColor) {
        setCurrentBackgroundColor(settings.themeBackgroundColor);
        const el = document.getElementById('themeBackgroundColor');
        if (el) el.value = settings.themeBackgroundColor;
    }

    // レイアウト設定
    if (settings.estimateLayout) window.estimateLayout = settings.estimateLayout;
    if (settings.actualLayout) window.actualLayout = settings.actualLayout;
    if (settings.reportLayout) window.reportLayout = settings.reportLayout;

    // 月色分け設定
    if (settings.showMonthColors !== undefined) {
        setShowMonthColorsSetting(settings.showMonthColors);
        const checkbox = document.getElementById('showMonthColorsCheckbox');
        if (checkbox) checkbox.checked = settings.showMonthColors;
    }

    // レポートマトリクス背景色モード
    if (settings.reportMatrixBgColorMode) {
        setReportMatrixBgColorMode(settings.reportMatrixBgColorMode);
    }

    // 進捗バー設定
    if (settings.showProgressBars !== undefined) setShowProgressBarsSetting(settings.showProgressBars);
    if (settings.showProgressPercentage !== undefined) setShowProgressPercentageSetting(settings.showProgressPercentage);
    if (settings.progressBarStyle) setProgressBarStyle(settings.progressBarStyle);
    if (settings.matrixEstActFormat) setMatrixEstActFormat(settings.matrixEstActFormat);
    if (settings.filterBarMode) {
        setFilterBarMode(settings.filterBarMode);
        if (typeof window.applyFilterBarMode === 'function') window.applyFilterBarMode();
    }
    if (settings.scheduleBarColorMode) setScheduleBarColorMode(settings.scheduleBarColorMode);

    // 担当者順
    if (settings.memberOrder) {
        setMemberOrder(settings.memberOrder);
        const el = document.getElementById('memberOrder');
        if (el) el.value = settings.memberOrder;
    }

    // デバッグ・開発設定
    if (settings.debugModeEnabled !== undefined) {
        setDebugModeEnabled(settings.debugModeEnabled);
        localStorage.setItem('debugModeEnabled', debugModeEnabled);
    }
    if (settings.devFeaturesEnabled !== undefined) {
        setDevFeaturesEnabled(settings.devFeaturesEnabled);
        localStorage.setItem('devFeaturesEnabled', devFeaturesEnabled);
        if (typeof window.loadDevFeaturesSetting === 'function') window.loadDevFeaturesSetting();
    }

    // レイアウト密度
    if (settings.layoutDensity) {
        setLayoutDensity(settings.layoutDensity);
        const el = document.getElementById('layoutDensity');
        if (el) el.value = settings.layoutDensity;
    }
}

/**
 * 全UI更新（インポート後）
 */
function refreshAllUI() {
    try { localStorage.removeItem('manhour_reportFilterState'); } catch (e) { /* ignore */ }
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.setDefaultReportMonth === 'function') window.setDefaultReportMonth();
    if (typeof window.updateEstimateMonthOptions === 'function') window.updateEstimateMonthOptions();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    if (typeof window.setDefaultEstimateMonth === 'function') window.setDefaultEstimateMonth();
    if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();
    if (typeof window.renderScheduleView === 'function') window.renderScheduleView();
}

// ============================================
// データマージ機能
// ============================================

/**
 * 見積のマッチングキーを生成
 * version + task + process + member + workMonths
 */
function estimateKey(e) {
    const months = Array.isArray(e.workMonths) ? e.workMonths.sort().join(',') : (e.workMonth || '');
    return `${e.version}|${e.task}|${e.process}|${e.member}|${months}`;
}

/**
 * 実績のマッチングキーを生成
 * version + task + process + member + date
 */
function actualKey(a) {
    return `${a.version || ''}|${a.task}|${a.process}|${a.member}|${a.date}`;
}

/**
 * 2つのデータ配列を比較して差分を生成
 * @param {Array} currentArr - 現在のデータ
 * @param {Array} importArr - インポートデータ
 * @param {Function} keyFn - キー生成関数
 * @param {Function} compareFn - 同一キーの値比較関数
 * @returns {Object} { onlyCurrent, onlyImport, conflicts, identical }
 */
function compareArrays(currentArr, importArr, keyFn, compareFn) {
    const currentMap = new Map();
    const importMap = new Map();

    currentArr.forEach(item => {
        const k = keyFn(item);
        currentMap.set(k, item);
    });
    importArr.forEach(item => {
        const k = keyFn(item);
        importMap.set(k, item);
    });

    const onlyCurrent = [];
    const onlyImport = [];
    const conflicts = [];
    const identical = [];

    // Check current items
    for (const [k, item] of currentMap) {
        if (!importMap.has(k)) {
            onlyCurrent.push({ key: k, current: item });
        } else {
            const importItem = importMap.get(k);
            if (compareFn(item, importItem)) {
                identical.push({ key: k, current: item, imported: importItem });
            } else {
                conflicts.push({ key: k, current: item, imported: importItem });
            }
        }
    }

    // Check import-only items
    for (const [k, item] of importMap) {
        if (!currentMap.has(k)) {
            onlyImport.push({ key: k, imported: item });
        }
    }

    return { onlyCurrent, onlyImport, conflicts, identical };
}

/**
 * 見積の値比較
 */
function estimatesEqual(a, b) {
    return a.hours === b.hours;
}

/**
 * 実績の値比較
 */
function actualsEqual(a, b) {
    return a.hours === b.hours;
}

/**
 * 見積項目の表示名を生成
 */
function estimateLabel(e) {
    return `${e.version} / ${e.task} / ${e.process} / ${e.member}`;
}

/**
 * 実績項目の表示名を生成
 */
function actualLabel(a) {
    return `${a.date} ${a.task} / ${a.process} / ${a.member}`;
}

/**
 * マージダイアログを表示
 * @param {Object} importedData - インポートされたデータ
 */
function showMergeDialog(importedData) {
    const importEstimates = importedData.estimates || [];
    const importActuals = importedData.actuals || [];

    const estDiff = compareArrays(estimates, importEstimates, estimateKey, estimatesEqual);
    const actDiff = compareArrays(actuals, importActuals, actualKey, actualsEqual);

    // 既存のダイアログがあれば削除
    const existing = document.getElementById('mergeModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mergeModal';
    modal.className = 'modal';
    modal.style.display = 'flex';

    let bodyHtml = '';

    // Summary
    const totalChanges = estDiff.onlyImport.length + estDiff.conflicts.length +
                          actDiff.onlyImport.length + actDiff.conflicts.length;

    bodyHtml += `<div class="merge-summary">
        <div class="merge-summary-counts">
            <span class="merge-summary-item"><span class="merge-summary-dot" style="background: var(--accent);"></span> 追加可能: ${estDiff.onlyImport.length + actDiff.onlyImport.length}件</span>
            <span class="merge-summary-item"><span class="merge-summary-dot" style="background: #F57F17;"></span> 競合: ${estDiff.conflicts.length + actDiff.conflicts.length}件</span>
            <span class="merge-summary-item"><span class="merge-summary-dot" style="background: var(--text-muted);"></span> 同一: ${estDiff.identical.length + actDiff.identical.length}件</span>
            <span class="merge-summary-item"><span class="merge-summary-dot" style="background: var(--info);"></span> 現在のみ: ${estDiff.onlyCurrent.length + actDiff.onlyCurrent.length}件</span>
        </div>
    </div>`;

    if (totalChanges === 0) {
        bodyHtml += `<div class="merge-section" style="text-align: center; padding: 40px 16px;">
            <div style="font-size: 14px; color: var(--text-secondary);">差分がありません</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">インポートデータと現在のデータは同一です</div>
        </div>`;
    }

    // --- 見積: インポートのみ（追加候補） ---
    if (estDiff.onlyImport.length > 0) {
        bodyHtml += `<div class="merge-section">
            <div class="merge-section-title">
                <span style="color: var(--accent);">見積 - 追加候補</span>
                <span class="merge-count">${estDiff.onlyImport.length}件</span>
                <label style="margin-left: auto; font-size: 11px; font-weight: normal; display: flex; align-items: center; gap: 4px;">
                    <input type="checkbox" class="merge-select-all" data-group="est-add" checked> 全選択
                </label>
            </div>`;
        estDiff.onlyImport.forEach((item, i) => {
            bodyHtml += `<div class="merge-item">
                <input type="checkbox" class="merge-cb" data-type="est-add" data-idx="${i}" checked>
                <div class="merge-item-info">
                    <div class="merge-item-key">${escapeHtml(estimateLabel(item.imported))}</div>
                    <div class="merge-item-diff">${formatHours(item.imported.hours)}h</div>
                </div>
            </div>`;
        });
        bodyHtml += `</div>`;
    }

    // --- 見積: 競合 ---
    if (estDiff.conflicts.length > 0) {
        bodyHtml += `<div class="merge-section">
            <div class="merge-section-title">
                <span style="color: #F57F17;">見積 - 競合</span>
                <span class="merge-count">${estDiff.conflicts.length}件</span>
            </div>`;
        estDiff.conflicts.forEach((item, i) => {
            bodyHtml += `<div class="merge-item">
                <div class="merge-item-info">
                    <div class="merge-item-key">${escapeHtml(estimateLabel(item.current))}</div>
                    <div class="merge-item-diff">現在: ${formatHours(item.current.hours)}h → インポート: ${formatHours(item.imported.hours)}h</div>
                </div>
                <select class="merge-action-select" data-type="est-conflict" data-idx="${i}">
                    <option value="keep">現在を維持</option>
                    <option value="import">インポートで更新</option>
                </select>
            </div>`;
        });
        bodyHtml += `</div>`;
    }

    // --- 実績: インポートのみ（追加候補） ---
    if (actDiff.onlyImport.length > 0) {
        bodyHtml += `<div class="merge-section">
            <div class="merge-section-title">
                <span style="color: var(--accent);">実績 - 追加候補</span>
                <span class="merge-count">${actDiff.onlyImport.length}件</span>
                <label style="margin-left: auto; font-size: 11px; font-weight: normal; display: flex; align-items: center; gap: 4px;">
                    <input type="checkbox" class="merge-select-all" data-group="act-add" checked> 全選択
                </label>
            </div>`;
        actDiff.onlyImport.forEach((item, i) => {
            bodyHtml += `<div class="merge-item">
                <input type="checkbox" class="merge-cb" data-type="act-add" data-idx="${i}" checked>
                <div class="merge-item-info">
                    <div class="merge-item-key">${escapeHtml(actualLabel(item.imported))}</div>
                    <div class="merge-item-diff">${formatHours(item.imported.hours)}h</div>
                </div>
            </div>`;
        });
        bodyHtml += `</div>`;
    }

    // --- 実績: 競合 ---
    if (actDiff.conflicts.length > 0) {
        bodyHtml += `<div class="merge-section">
            <div class="merge-section-title">
                <span style="color: #F57F17;">実績 - 競合</span>
                <span class="merge-count">${actDiff.conflicts.length}件</span>
            </div>`;
        actDiff.conflicts.forEach((item, i) => {
            bodyHtml += `<div class="merge-item">
                <div class="merge-item-info">
                    <div class="merge-item-key">${escapeHtml(actualLabel(item.current))}</div>
                    <div class="merge-item-diff">現在: ${formatHours(item.current.hours)}h → インポート: ${formatHours(item.imported.hours)}h</div>
                </div>
                <select class="merge-action-select" data-type="act-conflict" data-idx="${i}">
                    <option value="keep">現在を維持</option>
                    <option value="import">インポートで更新</option>
                </select>
            </div>`;
        });
        bodyHtml += `</div>`;
    }

    // --- 同一データ（折りたたみ） ---
    const identicalCount = estDiff.identical.length + actDiff.identical.length;
    if (identicalCount > 0) {
        bodyHtml += `<div class="merge-section">
            <details>
                <summary style="cursor: pointer; font-size: 12px; color: var(--text-muted);">同一データ (${identicalCount}件) - 変更なし</summary>
                <div style="margin-top: 8px;">`;
        estDiff.identical.slice(0, 20).forEach(item => {
            bodyHtml += `<div style="font-size: 11px; color: var(--text-muted); padding: 2px 0;">${escapeHtml(estimateLabel(item.current))} - ${formatHours(item.current.hours)}h</div>`;
        });
        actDiff.identical.slice(0, 20).forEach(item => {
            bodyHtml += `<div style="font-size: 11px; color: var(--text-muted); padding: 2px 0;">${escapeHtml(actualLabel(item.current))} - ${formatHours(item.current.hours)}h</div>`;
        });
        if (identicalCount > 40) {
            bodyHtml += `<div style="font-size: 11px; color: var(--text-muted); padding: 4px 0;">...他${identicalCount - 40}件</div>`;
        }
        bodyHtml += `</div></details></div>`;
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header modal-theme-ink">
                <h3>データマージ</h3>
                <span class="close" onclick="document.getElementById('mergeModal').remove()">&times;</span>
            </div>
            <div class="merge-dialog-body">
                ${bodyHtml}
            </div>
            <div class="modal-footer" style="justify-content: space-between;">
                <button onclick="document.getElementById('mergeModal').remove()" class="btn btn-secondary btn-sm">キャンセル</button>
                ${totalChanges > 0
                    ? `<button id="mergeApplyBtn" class="btn btn-sm" style="background: var(--accent); color: #fff;">マージ実行</button>`
                    : ''}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 全選択チェックボックスのイベント
    modal.querySelectorAll('.merge-select-all').forEach(cb => {
        cb.addEventListener('change', () => {
            const group = cb.dataset.group;
            modal.querySelectorAll(`.merge-cb[data-type="${group}"]`).forEach(itemCb => {
                itemCb.checked = cb.checked;
            });
        });
    });

    // マージ実行ボタン
    const applyBtn = document.getElementById('mergeApplyBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            executeMerge(estDiff, actDiff, importedData, modal);
        });
    }
}

/**
 * マージを実行
 */
function executeMerge(estDiff, actDiff, importedData, modal) {
    let addedEstimates = 0;
    let updatedEstimates = 0;
    let addedActuals = 0;
    let updatedActuals = 0;

    // 見積 - 追加
    const estAddCbs = modal.querySelectorAll('.merge-cb[data-type="est-add"]');
    estAddCbs.forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.dataset.idx, 10);
            const item = estDiff.onlyImport[idx];
            if (item) {
                const newEst = { ...item.imported };
                // IDを新しく振る
                newEst.id = Date.now() + Math.random();
                estimates.push(newEst);
                addedEstimates++;
            }
        }
    });

    // 見積 - 競合解決
    const estConflictSelects = modal.querySelectorAll('.merge-action-select[data-type="est-conflict"]');
    estConflictSelects.forEach(select => {
        if (select.value === 'import') {
            const idx = parseInt(select.dataset.idx, 10);
            const item = estDiff.conflicts[idx];
            if (item) {
                const existIdx = estimates.findIndex(e => estimateKey(e) === item.key);
                if (existIdx !== -1) {
                    estimates[existIdx] = { ...estimates[existIdx], hours: item.imported.hours };
                    // monthlyHours もインポートから取得（存在する場合）
                    if (item.imported.monthlyHours) {
                        estimates[existIdx].monthlyHours = { ...item.imported.monthlyHours };
                    }
                    updatedEstimates++;
                }
            }
        }
    });

    // 実績 - 追加
    const actAddCbs = modal.querySelectorAll('.merge-cb[data-type="act-add"]');
    actAddCbs.forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.dataset.idx, 10);
            const item = actDiff.onlyImport[idx];
            if (item) {
                const newAct = { ...item.imported };
                newAct.id = Date.now() + Math.random();
                actuals.push(newAct);
                addedActuals++;
            }
        }
    });

    // 実績 - 競合解決
    const actConflictSelects = modal.querySelectorAll('.merge-action-select[data-type="act-conflict"]');
    actConflictSelects.forEach(select => {
        if (select.value === 'import') {
            const idx = parseInt(select.dataset.idx, 10);
            const item = actDiff.conflicts[idx];
            if (item) {
                const existIdx = actuals.findIndex(a => actualKey(a) === item.key);
                if (existIdx !== -1) {
                    actuals[existIdx] = { ...actuals[existIdx], hours: item.imported.hours };
                    updatedActuals++;
                }
            }
        }
    });

    modal.remove();

    // ステート更新
    setEstimates([...estimates]);
    setActuals([...actuals]);

    saveData(true);

    // 進捗キャッシュクリア
    clearProgressCache();

    refreshAllUI();

    const parts = [];
    if (addedEstimates > 0) parts.push(`見積${addedEstimates}件追加`);
    if (updatedEstimates > 0) parts.push(`見積${updatedEstimates}件更新`);
    if (addedActuals > 0) parts.push(`実績${addedActuals}件追加`);
    if (updatedActuals > 0) parts.push(`実績${updatedActuals}件更新`);

    if (parts.length > 0) {
        showAlert(`マージ完了: ${parts.join('、')}`, true);
    } else {
        showAlert('変更はありませんでした', true);
    }
}

console.log('✅ モジュール storage.js loaded');

export async function exportToExcel() {
    let XLSX;
    try {
        XLSX = await import('../lib/xlsx.mjs');
    } catch {
        alert('Excel出力ライブラリが読み込まれていません。');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // 1. 実績シート
        const sortedActuals = [...actuals].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.member.localeCompare(b.member);
        });

        const actualData = [
            ['日付', '版数', '対応名', '工程', '担当', '工数(h)'],
            ...sortedActuals.map(a => [a.date, a.version || '', a.task, a.process, a.member, a.hours])
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(actualData);
        ws1['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 10 }];
        XLSX.utils.book_append_sheet(wb, ws1, '実績');

        // 2. 見積シート
        const estimateData = [
            ['版数', '対応名', '工程', '担当', '見積工数(h)', '作業月'],
            ...estimates.map(e => [
                e.version, e.task, e.process, e.member, e.hours,
                Array.isArray(e.workMonths) ? e.workMonths.join(',') : (e.workMonth || '')
            ])
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(estimateData);
        ws2['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws2, '見積');

        // ファイル生成とダウンロード
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        XLSX.writeFile(wb, `工数管理_エクスポート_${timestamp}.xlsx`);

        if (typeof window.showAlert === 'function') {
            window.showAlert('Excelファイルを出力しました', true);
        }

    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力中にエラーが発生しました: ' + error.message);
    }
}
