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

    debugModeEnabled, setDebugModeEnabled,
    selectedChartColorScheme,
    setCurrentThemeColor, setCurrentThemePattern, setCurrentTabColor, setCurrentBackgroundColor,
    setEstimateLayout, setActualLayout, setReportLayout, setMemberOrder
} from './state.js';

import { showAlert } from './utils.js';
import { clearProgressCache } from './report.js';

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
// データ保存・読み込み
// ============================================

/**
 * すべてのデータをlocalStorageに保存
 * 見積・実績・休日・休暇・設定・キャッシュを同期保存し、必要に応じて自動バックアップを実行
 * @param {boolean} [skipAutoBackup=false] - 自動バックアップをスキップするか
 * @returns {void}
 */
export function saveData(skipAutoBackup = false) {
    const memberOrderEl = document.getElementById('memberOrder');
    const data = {
        estimates: estimates,
        actuals: actuals,
        companyHolidays: companyHolidays,
        vacations: vacations,
        settings: {
            memberOrder: memberOrderEl ? memberOrderEl.value.trim() : '',
            themeColor: window.currentThemeColor,
            themePattern: window.currentThemePattern,
            themeTabColor: window.currentTabColor,
            autoBackup: window.autoBackupEnabled,
            estimateLayout: window.estimateLayout,
            actualLayout: window.actualLayout,
            reportLayout: window.reportLayout,
            showMonthColors: showMonthColorsSetting,
            reportMatrixBgColorMode: reportMatrixBgColorMode,
            showProgressBars: showProgressBarsSetting,
            showProgressPercentage: showProgressPercentageSetting,
            progressBarStyle: progressBarStyle,
            matrixEstActFormat: matrixEstActFormat,

            defaultEstimateViewType: document.getElementById('defaultEstimateViewType') ? document.getElementById('defaultEstimateViewType').value : 'matrix',
            defaultReportViewType: document.getElementById('defaultReportViewType') ? document.getElementById('defaultReportViewType').value : 'matrix',
            chartColorScheme: selectedChartColorScheme
        }
    };

    localStorage.setItem('manhour_estimates', JSON.stringify(estimates));
    localStorage.setItem('manhour_actuals', JSON.stringify(actuals));
    localStorage.setItem('manhour_companyHolidays', JSON.stringify(companyHolidays));
    localStorage.setItem('manhour_vacations', JSON.stringify(vacations));
    localStorage.setItem('manhour_remainingEstimates', JSON.stringify(remainingEstimates));
    localStorage.setItem('manhour_settings', JSON.stringify(data.settings));

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

    // 帳票名リストを更新
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

    // 設定を読み込み
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.memberOrder) setMemberOrder(settings.memberOrder);
            if (settings.themeColor) setCurrentThemeColor(settings.themeColor);
            if (settings.themePattern) setCurrentThemePattern(settings.themePattern);
            if (settings.themeTabColor) setCurrentTabColor(settings.themeTabColor);
            if (settings.autoBackup !== undefined) window.autoBackupEnabled = settings.autoBackup;
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

        } catch (error) {
            console.error('設定の読み込みに失敗しました:', error);
            // デフォルト設定を使用（エラーは表示しない）
        }
    }

    // レイアウト設定を適用（window経由で呼び出し）
    if (typeof window.applyLayoutSettings === 'function') {
        window.applyLayoutSettings();
    }
}

// ============================================
// バックアップ・復元
// ============================================

/**
 * 自動バックアップを実行
 * 全データをJSON形式でファイルとしてダウンロード（タイムスタンプ付きファイル名）
 * @returns {void}
 */
export function autoBackup() {
    // 現在の設定を取得
    const memberOrderEl = document.getElementById('memberOrder');
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

        defaultEstimateViewType: document.getElementById('defaultEstimateViewType') ? document.getElementById('defaultEstimateViewType').value : 'grouped',
        defaultReportViewType: document.getElementById('defaultReportViewType') ? document.getElementById('defaultReportViewType').value : 'grouped',
        chartColorScheme: selectedChartColorScheme,
        memberOrder: memberOrderEl ? memberOrderEl.value.trim() : '',
        stickyFilterEnabled: localStorage.getItem('stickyFilterEnabled') !== 'false',
        floatingFilterEnabled: localStorage.getItem('floatingFilterEnabled') !== 'false',
        debugModeEnabled: debugModeEnabled
    };

    const data = {
        estimates: estimates,
        actuals: actuals,
        companyHolidays: companyHolidays,
        vacations: vacations,
        remainingEstimates: remainingEstimates,
        settings: settings,
        timestamp: new Date().toISOString(),
        version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    // ローカルタイムでファイル名を生成
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hour}-${minute}-${second}`;

    a.href = url;
    a.download = `工数管理_バックアップ_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportBackup() {
    autoBackup();
    showAlert('バックアップを作成しました', true);
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

                if (confirm('現在のデータを復元したデータで上書きしますか？')) {
                    setEstimates(data.estimates || []);
                    setActuals(data.actuals || []);
                    setCompanyHolidays(data.companyHolidays || []);
                    setVacations(data.vacations || []);
                    setRemainingEstimates(data.remainingEstimates || []);

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

                        // Stickyフィルタ設定を復元
                        if (data.settings.stickyFilterEnabled !== undefined) {
                            localStorage.setItem('stickyFilterEnabled', data.settings.stickyFilterEnabled);
                            const checkbox = document.getElementById('stickyFilterEnabled');
                            if (checkbox) checkbox.checked = data.settings.stickyFilterEnabled;
                            if (data.settings.stickyFilterEnabled) {
                                if (typeof window.enableStickyFilters === 'function') {
                                    window.enableStickyFilters();
                                }
                            } else {
                                if (typeof window.disableStickyFilters === 'function') {
                                    window.disableStickyFilters();
                                }
                            }
                        }

                        // フローティングフィルタ設定を復元
                        if (data.settings.floatingFilterEnabled !== undefined) {
                            localStorage.setItem('floatingFilterEnabled', data.settings.floatingFilterEnabled);
                            const checkbox = document.getElementById('floatingFilterEnabled');
                            if (checkbox) checkbox.checked = data.settings.floatingFilterEnabled;
                        }

                        // デバッグモード設定を復元
                        if (data.settings.debugModeEnabled !== undefined) {
                            setDebugModeEnabled(data.settings.debugModeEnabled);
                            localStorage.setItem('debugModeEnabled', debugModeEnabled);
                            const checkbox = document.getElementById('debugModeEnabled');
                            if (checkbox) checkbox.checked = debugModeEnabled;
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
                    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
                    if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
                    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
                    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
                    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
                    if (typeof window.renderActualList === 'function') window.renderActualList();
                    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
                    if (typeof window.updateReport === 'function') window.updateReport();
                    if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();

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

console.log('✅ モジュール storage.js loaded');

export async function exportToExcel() {
    if (typeof ExcelJS === 'undefined') {
        alert('Excel出力ライブラリが読み込まれていません。');
        return;
    }

    try {
        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();
        workbook.modified = new Date();

        // 1. 実績シート
        const actualSheet = workbook.addWorksheet('実績');
        actualSheet.columns = [
            { header: '日付', key: 'date', width: 12 },
            { header: '版数', key: 'version', width: 15 },
            { header: '対応名', key: 'task', width: 30 },
            { header: '工程', key: 'process', width: 8 },
            { header: '担当', key: 'member', width: 12 },
            { header: '工数(h)', key: 'hours', width: 10 }
        ];

        // 実績データを日付順、担当者順でソート
        const sortedActuals = [...actuals].sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.member.localeCompare(b.member);
        });

        sortedActuals.forEach(a => {
            actualSheet.addRow({
                date: a.date,
                version: a.version || '',
                task: a.task,
                process: a.process,
                member: a.member,
                hours: a.hours
            });
        });

        // 2. 見積シート
        const estimateSheet = workbook.addWorksheet('見積');
        estimateSheet.columns = [
            { header: '版数', key: 'version', width: 15 },
            { header: '対応名', key: 'task', width: 30 },
            { header: '工程', key: 'process', width: 8 },
            { header: '担当', key: 'member', width: 12 },
            { header: '見積工数(h)', key: 'hours', width: 12 },
            { header: '作業月', key: 'workMonths', width: 20 }
        ];

        estimates.forEach(e => {
            estimateSheet.addRow({
                version: e.version,
                task: e.task,
                process: e.process,
                member: e.member,
                hours: e.hours,
                workMonths: Array.isArray(e.workMonths) ? e.workMonths.join(',') : (e.workMonth || '')
            });
        });

        // ファイル生成とダウンロード
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

        a.href = url;
        a.download = `工数管理_エクスポート_${timestamp}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        if (typeof window.showAlert === 'function') {
            window.showAlert('Excelファイルを出力しました', true);
        }

    } catch (error) {
        console.error('Excel出力エラー:', error);
        alert('Excel出力中にエラーが発生しました: ' + error.message);
    }
}
