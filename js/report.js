// ============================================
// レポート設定関連機能
// ============================================

import {
    reportSettings,
    setReportSettings,
    estimates,
    actuals,
    remainingEstimates,
    setRemainingEstimates,
    setEstimates,
    setActuals,
    companyHolidays,
    setCompanyHolidays,
    vacations,
    setVacations,
    setNextCompanyHolidayId,
    setNextVacationId,
    showMonthColorsSetting,
    showProgressBarsSetting,
    showProgressPercentageSetting,
    selectedChartColorScheme,
    debugModeEnabled,
    setDebugModeEnabled,
    matrixEstActFormat,

    currentThemeColor
} from './state.js';

import {
    getTargetVersions,
    determineProgressStatus,
    formatHours,
    filterByVersionAndTask,
    getWorkingDays,
    normalizeEstimate,
    getMonthColor,
    getDeviationColor,
    generateMonthColorLegend,
    sortMembers
} from './utils.js';
import { getActiveChartColorScheme } from './theme.js';

// ============================================
// レポート設定
// ============================================

export function loadReportSettings() {
    const saved = localStorage.getItem('reportSettings');
    if (saved) {
        try {
            const loadedSettings = JSON.parse(saved);
            // デフォルト値とマージして、古いデータに存在しないプロパティを補完
            const defaultSettings = {
                accuracyEnabled: true,
                anomalyEnabled: true,
                warningTasksEnabled: true,
                chartEnabled: true,
                trendEnabled: true,
                memberAnalysisEnabled: true,
                insightsEnabled: true
            };
            const mergedSettings = { ...defaultSettings, ...loadedSettings };
            setReportSettings(mergedSettings);
        } catch (error) {
            console.error('レポート設定の読み込みに失敗しました:', error);
            // デフォルト設定を使用
        }
    }

    // UIに反映
    const elements = {
        'reportAccuracyEnabled': reportSettings.accuracyEnabled,
        'reportAnomalyEnabled': reportSettings.anomalyEnabled,
        'reportWarningTasksEnabled': reportSettings.warningTasksEnabled,
        'reportChartEnabled': reportSettings.chartEnabled,
        'reportTrendEnabled': reportSettings.trendEnabled,
        'reportMemberAnalysisEnabled': reportSettings.memberAnalysisEnabled,
        'reportInsightsEnabled': reportSettings.insightsEnabled
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    });
}

export function saveReportSettings() {
    const settings = {
        accuracyEnabled: document.getElementById('reportAccuracyEnabled')?.checked ?? true,
        anomalyEnabled: document.getElementById('reportAnomalyEnabled')?.checked ?? true,
        warningTasksEnabled: document.getElementById('reportWarningTasksEnabled')?.checked ?? true,
        chartEnabled: document.getElementById('reportChartEnabled')?.checked ?? true,
        trendEnabled: document.getElementById('reportTrendEnabled')?.checked ?? true,
        memberAnalysisEnabled: document.getElementById('reportMemberAnalysisEnabled')?.checked ?? true,
        insightsEnabled: document.getElementById('reportInsightsEnabled')?.checked ?? true
    };

    setReportSettings(settings);
    localStorage.setItem('reportSettings', JSON.stringify(settings));
}

// ============================================
// デバッグモード設定
// ============================================

export function loadDebugModeSetting() {
    const saved = localStorage.getItem('debugModeEnabled');
    const isEnabled = saved === 'true';

    // State経由で設定
    setDebugModeEnabled(isEnabled);

    const checkbox = document.getElementById('debugModeEnabled');
    if (checkbox) checkbox.checked = isEnabled;
}

export function saveDebugModeSetting() {
    const checkbox = document.getElementById('debugModeEnabled');
    const isEnabled = checkbox ? checkbox.checked : false;

    setDebugModeEnabled(isEnabled);
    localStorage.setItem('debugModeEnabled', isEnabled);
}

// ============================================
// 進捗管理関連機能
// ============================================

// 進捗計算のキャッシュ
const progressCache = new Map();

/**
 * 進捗計算キャッシュをクリア
 * データ更新時に呼び出してキャッシュを無効化
 * @returns {void}
 */
export function clearProgressCache() {
    progressCache.clear();
}

/**
 * 対応単位での進捗情報を計算（キャッシング機構付き）
 * 見積・実績・見込残存工数から進捗率・EAC・ステータス・乖離を算出
 * @param {string} version - 版数
 * @param {string} task - 対応名
 * @param {string|null} [process=null] - 工程（未指定時は全工程集計）
 * @param {string|null} [member=null] - 担当者（未指定時は全担当者集計）
 * @returns {{estimatedHours: number, actualHours: number, remainingHours: number, eac: number, progressRate: number, status: string, statusLabel: string, statusColor: string, variance: number, variancePercent: number, hasRemainingData: boolean}} 進捗情報オブジェクト
 */
export function calculateProgress(version, task, process = null, member = null) {
    // キャッシュキーの生成
    const cacheKey = `${version}|${task}|${process}|${member}`;

    // キャッシュにあれば返す
    if (progressCache.has(cacheKey)) {
        return progressCache.get(cacheKey);
    }

    // 計算を実行
    // 見積工数を集計
    let estimatedHours = estimates
        .filter(e =>
            e.version === version &&
            e.task === task &&
            (process === null || e.process === process) &&
            (member === null || e.member === member)
        )
        .reduce((sum, e) => sum + e.hours, 0);

    // 実績工数を集計
    let actualHours = actuals
        .filter(a =>
            a.version === version &&
            a.task === task &&
            (process === null || a.process === process) &&
            (member === null || a.member === member)
        )
        .reduce((sum, a) => sum + a.hours, 0);

    // 見込残存時間を集計
    let remainingHours = remainingEstimates
        .filter(r =>
            r.version === version &&
            r.task === task &&
            (process === null || r.process === process) &&
            (member === null || r.member === member)
        )
        .reduce((sum, r) => sum + r.remainingHours, 0);

    // 予測総工数 = 実績 + 見込残存
    const eac = actualHours + remainingHours;

    // 進捗率 = 実績 / (実績 + 見込残存) × 100
    const progressRate = (actualHours + remainingHours) > 0
        ? (actualHours / (actualHours + remainingHours)) * 100
        : 0;

    // 状態判定
    let status = 'unknown';
    let statusLabel = '未設定';
    let statusColor = '#999';

    if (remainingHours === 0 && actualHours > 0) {
        status = 'completed';
        statusLabel = '完了';
        statusColor = '#27ae60';
    } else if (estimatedHours > 0) {
        if (eac <= estimatedHours) {
            status = 'ontrack';
            statusLabel = '順調';
            statusColor = '#3498db';
        } else if (eac <= estimatedHours * 1.2) {
            status = 'warning';
            statusLabel = '注意';
            statusColor = '#f39c12';
        } else {
            status = 'exceeded';
            statusLabel = '超過';
            statusColor = '#e74c3c';
        }
    }

    // 差異計算
    const variance = eac - estimatedHours;
    const variancePercent = estimatedHours > 0
        ? ((eac - estimatedHours) / estimatedHours) * 100
        : 0;

    // 計算結果をキャッシュに保存
    const result = {
        estimatedHours,
        actualHours,
        remainingHours,
        eac,
        progressRate: Math.round(progressRate * 10) / 10,
        status,
        statusLabel,
        statusColor,
        variance,
        variancePercent: Math.round(variancePercent * 10) / 10,
        hasRemainingData: remainingHours > 0 ||
            remainingEstimates.some(r => r.version === version && r.task === task)
    };

    progressCache.set(cacheKey, result);
    return result;
}

// 版数全体の進捗情報を計算
export function calculateVersionProgress(version) {
    const versionEstimates = estimates.filter(e => e.version === version);
    const versionActuals = actuals.filter(a => a.version === version);
    const versionRemaining = remainingEstimates.filter(r => r.version === version);

    const estimatedHours = versionEstimates.reduce((sum, e) => sum + e.hours, 0);
    const actualHours = versionActuals.reduce((sum, a) => sum + a.hours, 0);
    const remainingHours = versionRemaining.reduce((sum, r) => sum + r.remainingHours, 0);

    const eac = actualHours + remainingHours;
    const progressRate = (actualHours + remainingHours) > 0
        ? (actualHours / (actualHours + remainingHours)) * 100
        : 0;

    // タスク数
    const uniqueTasks = new Set([
        ...versionEstimates.map(e => e.task),
        ...versionActuals.map(a => a.task)
    ]);
    const completedTasks = [...uniqueTasks].filter(task => {
        const progress = calculateProgress(version, task);
        return progress.status === 'completed';
    }).length;

    return {
        estimatedHours,
        actualHours,
        remainingHours,
        eac,
        progressRate: Math.round(progressRate * 10) / 10,
        totalTasks: uniqueTasks.size,
        completedTasks,
        hasRemainingData: versionRemaining.length > 0
    };
}

// プログレスバーHTMLを生成
/**
 * 進捗バーのHTMLを生成
 * ステータスに応じた色・スタイルで進捗バーを描画（パーセンテージ表示オプション付き）
 * @param {number} progressRate - 進捗率（0-100以上の数値）
 * @param {string} status - ステータス（'completed'|'ontrack'|'warning'|'exceeded'|'unknown'）
 * @param {Object} [options={}] - オプション設定
 * @param {boolean} [options.showPercentage=true] - パーセンテージを表示するか
 * @param {string} [options.style='default'] - バースタイル（'default'|'modern'|'minimal'）
 * @returns {string} 進捗バーのHTML文字列
 */
export function createProgressBar(progressRate, status, options = {}) {
    const {
        showLabel = true,
        height = '20px',
        showEac = false,
        eac = 0,
        estimated = 0
    } = options;

    const statusColors = {
        completed: '#27ae60',
        ontrack: '#3498db',
        warning: '#f39c12',
        exceeded: '#e74c3c',
        unknown: '#bdc3c7'
    };

    const color = statusColors[status] || statusColors.unknown;
    const clampedRate = Math.min(100, Math.max(0, progressRate));

    // 超過の場合は見積対比でバー表示
    let barWidth = clampedRate;
    let overflowWidth = 0;

    if (status === 'exceeded' && estimated > 0 && eac > 0) {
        barWidth = (estimated / eac) * 100;
        overflowWidth = 100 - barWidth;
    }

    let html = `
        <div style="position: relative; background: #ecf0f1; border-radius: 10px; height: ${height}; overflow: hidden;">
            <div style="
                width: ${barWidth}%;
                height: 100%;
                background: ${color};
                border-radius: 10px;
                transition: width 0.3s ease;
            "></div>
    `;

    // 超過分のオーバーレイ
    if (overflowWidth > 0) {
        html += `
            <div style="
                position: absolute;
                right: 0;
                top: 0;
                width: ${overflowWidth}%;
                height: 100%;
                background: repeating-linear-gradient(
                    45deg,
                    ${color},
                    ${color} 5px,
                    rgba(255,255,255,0.3) 5px,
                    rgba(255,255,255,0.3) 10px
                );
                border-radius: 0 10px 10px 0;
            "></div>
        `;
    }

    // ラベル
    if (showLabel) {
        html += `
            <span style="
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                font-size: 13px;
                font-weight: 600;
                color: ${clampedRate > 50 ? 'white' : '#333'};
                text-shadow: ${clampedRate > 50 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'};
            ">${progressRate.toFixed(1)}%</span>
        `;
    }

    html += '</div>';

    return html;
}

// 状態バッジHTMLを生成
export function createStatusBadge(status, statusLabel) {
    const styles = {
        completed: { bg: '#e8f5e9', color: '#27ae60', icon: String.fromCharCode(10003) },
        ontrack: { bg: '#e3f2fd', color: '#1976d2', icon: String.fromCharCode(8594) },
        warning: { bg: '#fff3e0', color: '#f57c00', icon: String.fromCharCode(9888) },
        exceeded: { bg: '#fce4ec', color: '#c2185b', icon: '!' },
        unknown: { bg: '#f5f5f5', color: '#999', icon: '?' }
    };

    const style = styles[status] || styles.unknown;

    return `
        <span style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            background: ${style.bg};
            color: ${style.color};
        ">
            <span>${style.icon}</span>
            <span>${statusLabel}</span>
        </span>
    `;
}

// 進捗管理レポートを更新
export function updateProgressReport() {
    const versionFilter = document.getElementById('progressVersionFilter')?.value || 'all';
    const statusFilter = document.getElementById('progressStatusFilter')?.value || 'all';

    // 版数選択肢を更新
    updateProgressVersionOptions();

    // サマリーカードを更新
    renderProgressSummaryCards(versionFilter);

    // 詳細テーブルを更新
    renderProgressDetailTable(versionFilter, statusFilter);
}

// 版数選択肢を更新
export function updateProgressVersionOptions() {
    const select = document.getElementById('progressVersionFilter');
    const bulkSelect = document.getElementById('bulkRemainingVersionFilter');
    if (!select) return;

    const versions = [...new Set([
        ...estimates.map(e => e.version),
        ...actuals.map(a => a.version)
    ])].filter(v => v && v.trim() !== '').sort();

    // DOM最適化: DocumentFragmentを使用してセレクトボックスを更新
    const updateSelectOptions = (selectElement, options, allLabel = '全版数') => {
        const currentValue = selectElement.value;
        const fragment = document.createDocumentFragment();

        // 「全版数」オプション
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = allLabel;
        fragment.appendChild(allOption);

        // 各版数のオプション
        options.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            fragment.appendChild(option);
        });

        selectElement.innerHTML = '';
        selectElement.appendChild(fragment);
        selectElement.value = currentValue || 'all';
    };

    updateSelectOptions(select, versions);
    if (bulkSelect) {
        updateSelectOptions(bulkSelect, versions);
    }
}

// サマリーカードをレンダリング
export function renderProgressSummaryCards(versionFilter) {
    const container = document.getElementById('progressSummaryCards');
    if (!container) return;

    // フィルタリング
    const targetVersions = getTargetVersions(estimates, actuals, versionFilter);

    // 全体統計
    let totalEstimated = 0, totalActual = 0, totalRemaining = 0;
    let completedTasks = 0, totalTasks = 0;

    targetVersions.forEach(version => {
        const progress = calculateVersionProgress(version);
        totalEstimated += progress.estimatedHours;
        totalActual += progress.actualHours;
        totalRemaining += progress.remainingHours;
        completedTasks += progress.completedTasks;
        totalTasks += progress.totalTasks;
    });

    const totalEac = totalActual + totalRemaining;
    const overallProgress = totalEac > 0 ? (totalActual / totalEac) * 100 : 0;
    const variance = totalEac - totalEstimated;

    // 状態別カウント
    let statusCounts = { completed: 0, ontrack: 0, warning: 0, exceeded: 0, unknown: 0 };
    targetVersions.forEach(version => {
        const tasks = [...new Set([
            ...estimates.filter(e => e.version === version).map(e => e.task),
            ...actuals.filter(a => a.version === version).map(a => a.task)
        ])];
        tasks.forEach(task => {
            const progress = calculateProgress(version, task);
            statusCounts[progress.status]++;
        });
    });

    container.innerHTML = `
        <div class="stat-card theme-bg theme-${currentThemeColor}">
            <h3>全体進捗率</h3>
            <div class="value">${overallProgress.toFixed(1)}%</div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-top: 5px;">
                ${completedTasks}/${totalTasks} 対応完了
            </div>
        </div>
        <div class="stat-card theme-bg theme-${currentThemeColor}">
            <h3>予測総工数</h3>
            <div class="value">${totalEac.toFixed(1)}h</div>
            <div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-top: 5px;">
                見積: ${totalEstimated.toFixed(1)}h / 差異: ${variance >= 0 ? '+' : ''}${variance.toFixed(1)}h
            </div>
        </div>
        <div class="stat-card theme-bg theme-${currentThemeColor}">
            <h3>実績 / 残存</h3>
            <div class="value">${totalActual.toFixed(1)}h / ${totalRemaining.toFixed(1)}h</div>
        </div>
        <div class="stat-card theme-bg theme-${currentThemeColor}">
            <h3>状態別</h3>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
                <span style="background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 10px; font-size: 12px;">
                    ${String.fromCharCode(10003)} ${statusCounts.completed}
                </span>
                <span style="background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 10px; font-size: 12px;">
                    ${String.fromCharCode(8594)} ${statusCounts.ontrack}
                </span>
                <span style="background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 10px; font-size: 12px;">
                    ${String.fromCharCode(9888)} ${statusCounts.warning}
                </span>
                <span style="background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 10px; font-size: 12px;">
                    ! ${statusCounts.exceeded}
                </span>
            </div>
        </div>
    `;
}

// 詳細テーブルをレンダリング
export function renderProgressDetailTable(versionFilter, statusFilter) {
    const container = document.getElementById('progressDetailTable');
    if (!container) return;

    // フィルタリング
    const targetVersions = getTargetVersions(estimates, actuals, versionFilter);

    let html = '<div class="table-wrapper"><table style="width: 100%; border-collapse: collapse;">';
    html += `
        <thead>
            <tr style="background: #f8f9fa;">
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">版数</th>
                <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">対応名</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">見積</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">実績</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">残存</th>
                <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">予測総工数</th>
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd; width: 150px;">進捗</th>
                <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">状態</th>
            </tr>
        </thead>
        <tbody>
    `;

    let rowCount = 0;
    targetVersions.forEach(version => {
        const tasks = [...new Set([
            ...estimates.filter(e => e.version === version).map(e => e.task),
            ...actuals.filter(a => a.version === version).map(a => a.task)
        ])].sort();

        tasks.forEach(task => {
            const progress = calculateProgress(version, task);

            // ステータスフィルタ
            if (statusFilter !== 'all' && progress.status !== statusFilter) return;

            rowCount++;
            const borderColor = {
                completed: '#27ae60',
                ontrack: '#3498db',
                warning: '#f39c12',
                exceeded: '#e74c3c',
                unknown: '#ccc'
            }[progress.status] || '#ccc';

            html += `
                <tr style="border-left: 4px solid ${borderColor};">
                    <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>${version}</strong></td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${task}</td>
                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${progress.estimatedHours.toFixed(1)}h</td>
                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${progress.actualHours.toFixed(1)}h</td>
                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">
                        ${progress.hasRemainingData
                    ? progress.remainingHours.toFixed(1) + 'h'
                    : '<span style="color: #999;">未設定</span>'}
                    </td>
                    <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee; font-weight: 600;">
                        ${progress.eac.toFixed(1)}h
                        ${progress.variance !== 0
                    ? `<span style="font-size: 13px; color: ${progress.variance > 0 ? '#e74c3c' : '#27ae60'};">
                                (${progress.variance > 0 ? '+' : ''}${progress.variance.toFixed(1)})
                               </span>`
                    : ''}
                    </td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">
                        ${createProgressBar(progress.progressRate, progress.status, {
                        showEac: true,
                        eac: progress.eac,
                        estimated: progress.estimatedHours
                    })}
                    </td>
                    <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${createStatusBadge(progress.status, progress.statusLabel)}</td>
                </tr>
            `;
        });
    });

    if (rowCount === 0) {
        html += '<tr><td colspan="8" style="text-align: center; color: #999; padding: 40px;">該当するデータがありません</td></tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// 一括編集モーダルを開く
export function openBulkRemainingModal() {
    updateProgressVersionOptions();
    renderBulkRemainingTable();
    document.getElementById('bulkRemainingModal').style.display = 'flex';
}

// 一括編集モーダルを閉じる
export function closeBulkRemainingModal() {
    document.getElementById('bulkRemainingModal').style.display = 'none';
}

// 一括編集テーブルをレンダリング
export function renderBulkRemainingTable() {
    const versionFilter = document.getElementById('bulkRemainingVersionFilter')?.value || 'all';
    const tbody = document.getElementById('bulkRemainingTableBody');
    if (!tbody) return;

    // 版数でフィルタリング
    const targetVersions = getTargetVersions(estimates, actuals, versionFilter);

    let html = '';
    let rowIndex = 0;

    targetVersions.forEach(version => {
        // この版数のタスクと工程と担当者の組み合わせを取得
        const combinations = new Map();

        estimates.filter(e => e.version === version).forEach(e => {
            const key = `${e.task}|${e.process}|${e.member}`;
            if (!combinations.has(key)) {
                combinations.set(key, { version, task: e.task, process: e.process, member: e.member, estimatedHours: 0, actualHours: 0 });
            }
            combinations.get(key).estimatedHours += e.hours;
        });

        actuals.filter(a => a.version === version).forEach(a => {
            const key = `${a.task}|${a.process}|${a.member}`;
            if (!combinations.has(key)) {
                combinations.set(key, { version, task: a.task, process: a.process, member: a.member, estimatedHours: 0, actualHours: 0 });
            }
            combinations.get(key).actualHours += a.hours;
        });

        // 各組み合わせについて行を生成
        combinations.forEach((data, key) => {
            // window経由でgetRemainingEstimateを呼び出し
            const existing = typeof window.getRemainingEstimate === 'function'
                ? window.getRemainingEstimate(data.version, data.task, data.process, data.member)
                : null;
            const remainingHours = existing ? existing.remainingHours : '';
            const eac = data.actualHours + (parseFloat(remainingHours) || 0);

            // 状態判定
            let status = 'unknown';
            let statusLabel = '未設定';
            if (remainingHours !== '' && parseFloat(remainingHours) === 0 && data.actualHours > 0) {
                status = 'completed';
                statusLabel = '完了';
            } else if (data.estimatedHours > 0 && remainingHours !== '') {
                if (eac <= data.estimatedHours) {
                    status = 'ontrack';
                    statusLabel = '順調';
                } else if (eac <= data.estimatedHours * 1.2) {
                    status = 'warning';
                    statusLabel = '注意';
                } else {
                    status = 'exceeded';
                    statusLabel = '超過';
                }
            }

            html += `
                <tr data-row-index="${rowIndex}"
                    data-version="${data.version}"
                    data-task="${data.task}"
                    data-process="${data.process}"
                    data-member="${data.member}">
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.version}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.task}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.process}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.member}</td>
                    <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">${data.estimatedHours.toFixed(1)}h</td>
                    <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">${data.actualHours.toFixed(1)}h</td>
                    <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">
                        <input type="number"
                               class="bulk-remaining-input"
                               value="${remainingHours}"
                               step="0.5"
                               min="0"
                               placeholder="0"
                               onchange="updateBulkRowStatus(this)"
                               style="width: 70px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; text-align: right;">
                    </td>
                    <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;" class="bulk-eac">
                        ${remainingHours !== '' ? eac.toFixed(1) + 'h' : '-'}
                    </td>
                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee;" class="bulk-status">
                        ${createStatusBadge(status, statusLabel)}
                    </td>
                </tr>
            `;
            rowIndex++;
        });
    });

    if (rowIndex === 0) {
        html = '<tr><td colspan="9" style="text-align: center; color: #999; padding: 40px;">該当するデータがありません</td></tr>';
    }

    tbody.innerHTML = html;
}

// 一括編集の行ステータスを更新
export function updateBulkRowStatus(input) {
    const row = input.closest('tr');
    const version = row.dataset.version;
    const task = row.dataset.task;
    const process = row.dataset.process;
    const member = row.dataset.member;

    // 見積と実績を再計算
    const estimatedHours = estimates
        .filter(e => e.version === version && e.task === task && e.process === process && e.member === member)
        .reduce((sum, e) => sum + e.hours, 0);
    const actualHours = actuals
        .filter(a => a.version === version && a.task === task && a.process === process && a.member === member)
        .reduce((sum, a) => sum + a.hours, 0);

    const remainingHours = parseFloat(input.value);
    const eacCell = row.querySelector('.bulk-eac');
    const statusCell = row.querySelector('.bulk-status');

    if (!isNaN(remainingHours)) {
        const eac = actualHours + remainingHours;
        eacCell.textContent = eac.toFixed(1) + 'h';

        // 状態判定
        let status = 'unknown';
        let statusLabel = '未設定';
        if (remainingHours === 0 && actualHours > 0) {
            status = 'completed';
            statusLabel = '完了';
        } else if (estimatedHours > 0) {
            if (eac <= estimatedHours) {
                status = 'ontrack';
                statusLabel = '順調';
            } else if (eac <= estimatedHours * 1.2) {
                status = 'warning';
                statusLabel = '注意';
            } else {
                status = 'exceeded';
                statusLabel = '超過';
            }
        }
        statusCell.innerHTML = createStatusBadge(status, statusLabel);
    } else {
        eacCell.textContent = '-';
        statusCell.innerHTML = createStatusBadge('unknown', '未設定');
    }
}

// 一括編集を保存
export function saveBulkRemaining() {
    const rows = document.querySelectorAll('#bulkRemainingTableBody tr[data-row-index]');
    let savedCount = 0;

    rows.forEach(row => {
        const version = row.dataset.version;
        const task = row.dataset.task;
        const process = row.dataset.process;
        const member = row.dataset.member;
        const input = row.querySelector('.bulk-remaining-input');
        const value = input?.value;

        if (value !== '' && !isNaN(parseFloat(value))) {
            if (typeof window.saveRemainingEstimate === 'function') {
                window.saveRemainingEstimate(version, task, process, member, parseFloat(value));
            }
            savedCount++;
        }
    });

    if (typeof window.saveData === 'function') window.saveData();
    closeBulkRemainingModal();
    if (typeof window.updateReport === 'function') window.updateReport();

    alert(`${savedCount}件の見込残存時間を保存しました`);
}

// ============================================
// フェーズ折りたたみ
// ============================================

export function togglePhaseCollapse(phaseId) {
    phaseCollapsed[phaseId] = !phaseCollapsed[phaseId];
    const content = document.getElementById(phaseId + '-content');
    const arrow = document.getElementById(phaseId + '-arrow');
    if (content) {
        content.style.display = phaseCollapsed[phaseId] ? 'none' : 'block';
    }
    if (arrow) {
        arrow.textContent = phaseCollapsed[phaseId] ? '▶' : '▼';
    }
}

// ============================================
// 進捗バー関連
// ============================================

export function getProgressColor(progressRate) {
    if (progressRate >= 100) {
        return '#2e7d32'; // ダークグリーン - 完了
    } else if (progressRate >= 90) {
        return '#4caf50'; // グリーン - ほぼ完了
    } else if (progressRate >= 70) {
        return '#66bb6a'; // ライトグリーン - 完了間近
    } else if (progressRate >= 30) {
        return '#42a5f5'; // ブルー - 進行中
    } else if (progressRate >= 10) {
        return '#90caf9'; // ライトブルー - 開始
    } else {
        return '#e0e0e0'; // 薄いグレー - 未着手
    }
}

export function generateProgressBar(version, task, process) {
    // 設定でオフになっている場合は何も表示しない
    if (!showProgressBarsSetting) {
        return '';
    }

    // 実績を集計
    let actualHours = actuals
        .filter(a => a.version === version && a.task === task && a.process === process)
        .reduce((sum, a) => sum + a.hours, 0);

    // 見込残存時間のデータが存在するかチェック
    const remainingData = remainingEstimates
        .filter(r => r.version === version && r.task === task && r.process === process);

    // 見込残存時間を集計
    let remainingHours = remainingData.reduce((sum, r) => sum + r.remainingHours, 0);

    // 見込残存時間のデータが存在しない場合は、見積時間から算出（フォールバック）
    if (remainingData.length === 0) {
        // 見積データを検索
        const estData = estimates.find(e => e.version === version && e.task === task && e.process === process);
        if (estData && estData.hours > 0) {
            // 見積 - 実績 = 残（マイナスは0）
            remainingHours = Math.max(0, estData.hours - actualHours);
        } else {
            // 見積もなし → バーを表示しない
            return '';
        }
    }

    // 進捗率を計算
    let progressRate = 0;

    if (remainingHours === 0 && actualHours > 0) {
        // 見込残存が0hで実績があれば100%（完了）
        progressRate = 100;
    } else if (remainingHours === 0 && actualHours === 0) {
        // 見込残存が0hで実績もなし → 完了または作業不要（100%）
        progressRate = 100;
    } else if (actualHours + remainingHours > 0) {
        // 見込残存データがあれば計算
        progressRate = (actualHours / (actualHours + remainingHours)) * 100;
    }

    const barColor = getProgressColor(progressRate);
    const barWidth = Math.min(progressRate, 100); // 100%を超えても表示は100%まで
    const displayRate = progressRate.toFixed(0);
    const remainingDisplay = remainingHours.toFixed(1);

    let progressBarHtml = '';

    if (progressBarStyle === 'bottom') {
        // セル下部に表示するスタイル（未進捗部分も表示）
        progressBarHtml = `
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: #e8e8e8; border-top: 1px solid #d0d0d0; overflow: hidden;" title="進捗率: ${displayRate}% | 実績: ${actualHours.toFixed(1)}h | 残: ${remainingDisplay}h">
                <div style="height: 100%; width: ${barWidth}%; background: ${barColor}; transition: width 0.3s;"></div>
            </div>
        `;
    } else {
        // セル内に表示するスタイル（デフォルト）
        const percentageHtml = showProgressPercentageSetting
            ? `<div style="font-size: 9px; color: #888; margin-top: 2px; text-align: center;">${displayRate}%</div>`
            : '';

        progressBarHtml = `
            <div style="margin-top: 6px; position: relative;" title="進捗率: ${displayRate}% | 実績: ${actualHours.toFixed(1)}h | 残: ${remainingDisplay}h">
                <div style="height: 3px; background: #f0f0f0; border-radius: 2px; overflow: hidden;">
                    <div style="height: 100%; width: ${barWidth}%; background: ${barColor}; transition: width 0.3s;"></div>
                </div>
                ${percentageHtml}
            </div>
        `;
    }

    return progressBarHtml;
}

// ============================================
// レポート更新メイン関数
// ============================================

export function getAnalysisGradients() {
    const gradients = {
        'purple': {
            phase1: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            phase2: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            phase3: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
        },
        'deep-blue': {
            phase1: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
            phase2: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            phase3: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)'
        },
        'teal': {
            phase1: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
            phase2: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
            phase3: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)'
        },
        'cyan': {
            phase1: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
            phase2: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)',
            phase3: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
        },
        'ocean': {
            phase1: 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 100%)',
            phase2: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
            phase3: 'linear-gradient(135deg, #14b8a6 0%, #34d399 100%)'
        },
        'sky': {
            phase1: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
            phase2: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)',
            phase3: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
        },
        'indigo': {
            phase1: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
            phase2: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
            phase3: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)'
        },
        'navy': {
            phase1: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
            phase2: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
            phase3: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)'
        },
        'slate': {
            phase1: 'linear-gradient(135deg, #334155 0%, #475569 100%)',
            phase2: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)',
            phase3: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)'
        },
        'green': {
            phase1: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
            phase2: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)',
            phase3: 'linear-gradient(135deg, #0891b2 0%, #14b8a6 100%)'
        },
        'emerald': {
            phase1: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            phase2: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)',
            phase3: 'linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)'
        }
    };
    return gradients[currentThemeColor] || gradients['purple'];
}

/**
 * レポート用のフィルタリング済みデータを取得
 * @param {string} filterType - フィルタタイプ（'month' | 'version'）
 * @param {string} selectedMonth - 選択された月
 * @param {string} selectedVersion - 選択された版数
 * @returns {Object} { filteredActuals, filteredEstimates }
 */
function filterReportData(filterType, selectedMonth, selectedVersion) {
    const isOtherWork = typeof window.isOtherWork === 'function' ? window.isOtherWork : (() => false);
    let filteredActuals = actuals;
    let filteredEstimates = estimates;

    if (filterType === 'month') {
        if (selectedMonth !== 'all') {
            filteredActuals = actuals.filter(a => {
                if (isOtherWork(a)) {
                    return a.date && a.date.startsWith(selectedMonth);
                }
                return a.date && a.date.startsWith(selectedMonth);
            });

            filteredEstimates = estimates.filter(e => {
                const est = normalizeEstimate(e);
                if (!est.workMonths || est.workMonths.length === 0) {
                    return true;
                }
                return est.workMonths.includes(selectedMonth);
            }).map(e => {
                const est = normalizeEstimate(e);
                let hoursForMonth = 0;
                if (est.monthlyHours && est.monthlyHours[selectedMonth] !== undefined) {
                    hoursForMonth = est.monthlyHours[selectedMonth];
                } else if (!est.workMonths || est.workMonths.length === 0) {
                    hoursForMonth = est.hours;
                }
                return { ...est, hours: hoursForMonth };
            });
        } else {
            filteredEstimates = estimates.map(e => normalizeEstimate(e));
        }
    } else {
        if (selectedVersion !== 'all') {
            filteredActuals = actuals.filter(a => a.version === selectedVersion);
            filteredEstimates = estimates.filter(e => e.version === selectedVersion).map(e => normalizeEstimate(e));
        } else {
            filteredEstimates = estimates.map(e => normalizeEstimate(e));
        }
    }

    return { filteredActuals, filteredEstimates };
}

/**
 * レポートタイトルを更新
 * @param {string} filterType - フィルタタイプ
 * @param {string} selectedMonth - 選択された月
 * @param {string} selectedVersion - 選択された版数
 */
function updateReportTitle(filterType, selectedMonth, selectedVersion) {
    const titleElement = document.getElementById('reportPeriodTitle');
    if (!titleElement) return;

    if (filterType === 'month') {
        if (selectedMonth === 'all') {
            titleElement.textContent = '全期間の集計';
        } else {
            const [year, month] = selectedMonth.split('-');
            titleElement.textContent = `${year}年${parseInt(month)}月の集計`;
        }
    } else {
        if (selectedVersion === 'all') {
            titleElement.textContent = '全版数の集計';
        } else {
            titleElement.textContent = `${selectedVersion} の集計`;
        }
    }
}

/**
 * レポートサマリーを計算・表示
 * @param {Array} filteredActuals - フィルタ済み実績データ
 * @param {Array} filteredEstimates - フィルタ済み見積データ
 * @param {number} workingDaysPerMonth - 月間稼働日数
 */
function displayReportSummary(filteredActuals, filteredEstimates, workingDaysPerMonth) {
    const totalEst = filteredEstimates.reduce((sum, e) => sum + e.hours, 0);
    const totalAct = filteredActuals.reduce((sum, a) => sum + a.hours, 0);
    const diff = totalAct - totalEst;
    const rate = totalEst > 0 ? (totalAct / totalEst * 100).toFixed(1) : 0;

    const estManDays = (totalEst / 8).toFixed(1);
    const estManMonths = (totalEst / 8 / workingDaysPerMonth).toFixed(2);
    const actManDays = (totalAct / 8).toFixed(1);
    const actManMonths = (totalAct / 8 / workingDaysPerMonth).toFixed(2);

    document.getElementById('totalEstimate').textContent = totalEst.toFixed(1) + 'h';
    document.getElementById('totalActual').textContent = totalAct.toFixed(1) + 'h';
    document.getElementById('totalDiff').textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1) + 'h';
    document.getElementById('actualRate').textContent = rate + '%';

    document.getElementById('totalEstimateManpower').textContent = `${estManDays}人日 / ${estManMonths}人月`;
    document.getElementById('totalActualManpower').textContent = `${actManDays}人日 / ${actManMonths}人月`;
}

/**
 * レポートを更新（メイン関数）
 * フィルタ条件に基づいてデータを抽出し、各種レポートビューを描画
 */
export function updateReport() {
    const filterType = document.getElementById('reportFilterType').value;
    const selectedMonth = document.getElementById('reportMonth').value;
    const selectedVersion = document.getElementById('reportVersion').value;
    const viewType = document.getElementById('reportViewType').value;

    // フィルタリング
    const { filteredActuals, filteredEstimates } = filterReportData(filterType, selectedMonth, selectedVersion);

    // タイトル更新
    updateReportTitle(filterType, selectedMonth, selectedVersion);

    // 月間稼働日数を取得
    const getWorkingDays = typeof window.getWorkingDays === 'function' ? window.getWorkingDays : (() => 20);
    let workingDaysPerMonth = 20;
    if (filterType === 'month' && selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        workingDaysPerMonth = getWorkingDays(parseInt(year), parseInt(month));
    }

    // サマリー表示
    displayReportSummary(filteredActuals, filteredEstimates, workingDaysPerMonth);

    // レポート詳細ビューをクリア
    document.getElementById('reportDetailView').innerHTML = '';

    // 分析機能の表示
    renderReportAnalytics(filteredActuals, filteredEstimates, selectedMonth, workingDaysPerMonth);

    // 詳細ビュー表示
    if (viewType === 'grouped') {
        renderReportGrouped(filteredActuals, filteredEstimates);
    } else if (viewType === 'matrix') {
        renderReportMatrix(filteredActuals, filteredEstimates, selectedMonth);
    }

    renderMemberReport(filteredActuals, filteredEstimates);
    renderVersionReport(filteredActuals, filteredEstimates);
    updateProgressReport();

    // セグメントボタンのハイライトを更新
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }
}

// ============================================
// レポート分析レンダリング
// ============================================

/**
 * Phase 1: 見積精度分析を描画
 * 工程別精度、異常値検出、警告タスク一覧を表示
 * @param {Array} filteredEstimates - フィルタ済み見積データ
 * @param {Array} filteredActuals - フィルタ済み実績データ
 * @returns {string} HTMLコンテンツ
 */
function renderPhase1AccuracyAnalysis(filteredEstimates, filteredActuals) {
    if (!reportSettings.accuracyEnabled && !reportSettings.anomalyEnabled && !reportSettings.warningTasksEnabled) {
        return '';
    }

    let html = '';
    html += `<div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #dee2e6;">`;
    html += `<h3 onclick="togglePhaseCollapse('phase1')" style="margin: 0; color: #495057; font-size: 18px; cursor: pointer; display: flex; align-items: center; user-select: none;">`;
    html += `<span id="phase1-arrow" style="margin-right: 10px; font-size: 14px;">${phaseCollapsed.phase1 ? '▶' : '▼'}</span>`;
    html += 'Phase 1: 見積精度分析</h3>';
    html += `<div id="phase1-content" style="display: ${phaseCollapsed.phase1 ? 'none' : 'block'}; margin-top: 15px;">`;

    // 工程別の精度計算
    if (reportSettings.accuracyEnabled) {
        html += renderProcessAccuracy(filteredEstimates, filteredActuals);
    }

    // 異常値の強調表示
    if (reportSettings.anomalyEnabled) {
        html += renderAnomalyDetection(filteredEstimates, filteredActuals);
    }

    // 警告タスク一覧
    if (reportSettings.warningTasksEnabled) {
        html += renderWarningTasks(filteredEstimates, filteredActuals);
    }

    html += '</div>'; // close phase1-content
    html += '</div>';

    return html;
}

/**
 * 工程別見積精度を描画
 */
function renderProcessAccuracy(filteredEstimates, filteredActuals) {
    const processSummary = {};
    const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];

    filteredEstimates.forEach(e => {
        const processKey = processOrder.includes(e.process) ? e.process : 'その他';
        if (!processSummary[processKey]) {
            processSummary[processKey] = { estimate: 0, actual: 0 };
        }
        processSummary[processKey].estimate += e.hours;
    });

    filteredActuals.forEach(a => {
        const processKey = processOrder.includes(a.process) ? a.process : 'その他';
        if (!processSummary[processKey]) {
            processSummary[processKey] = { estimate: 0, actual: 0 };
        }
        processSummary[processKey].actual += a.hours;
    });

    let html = '<div style="background: #ffffff; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e9ecef;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">工程別見積精度</h4>';
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">';

    const sortedProcesses = [
        ...processOrder.filter(p => processSummary[p]),
        ...(processSummary['その他'] ? ['その他'] : [])
    ];

    sortedProcesses.forEach(proc => {
        const data = processSummary[proc];
        const accuracy = data.estimate > 0 ? (data.actual / data.estimate * 100).toFixed(1) : 0;
        const isOverrun = accuracy > 150;
        const isGood = accuracy >= 80 && accuracy <= 120;

        html += '<div style="background: #f8f9fa; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e9ecef;">';
        html += `<div style="font-weight: 600; margin-bottom: 5px; color: #495057;">${proc}</div>`;
        html += `<div style="font-size: 22px; font-weight: bold; color: ${isOverrun ? '#dc3545' : isGood ? '#28a745' : '#ffc107'};">${accuracy}%</div>`;
        html += `<div style="font-size: 14px; color: #6c757d;">${data.estimate.toFixed(1)}h → ${data.actual.toFixed(1)}h</div>`;
        html += '</div>';
    });

    html += '</div></div>';
    return html;
}

/**
 * 異常値検出（50%以上超過）を描画
 */
function renderAnomalyDetection(filteredEstimates, filteredActuals) {
    const anomalies = [];
    const taskSummary = {};

    filteredEstimates.forEach(e => {
        const key = `${e.version}-${e.task}-${e.process}`;
        if (!taskSummary[key]) {
            taskSummary[key] = { version: e.version, task: e.task, process: e.process, estimate: 0, actual: 0 };
        }
        taskSummary[key].estimate += e.hours;
    });

    filteredActuals.forEach(a => {
        const key = `${a.version}-${a.task}-${a.process}`;
        if (!taskSummary[key]) {
            taskSummary[key] = { version: a.version, task: a.task, process: a.process, estimate: 0, actual: 0 };
        }
        taskSummary[key].actual += a.hours;
    });

    Object.values(taskSummary).forEach(task => {
        const overrun = task.estimate > 0 ? ((task.actual - task.estimate) / task.estimate * 100) : 0;
        if (overrun > 50) {
            anomalies.push({ ...task, overrun });
        }
    });

    if (anomalies.length === 0) {
        return '';
    }

    anomalies.sort((a, b) => b.overrun - a.overrun);

    let html = '<div style="background: #fff5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #f5c6cb;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #721c24; font-size: 16px;">異常値検出（50%以上超過）</h4>';
    html += `<div style="color: #856404; font-size: 14px; margin-bottom: 10px;">検出数: ${anomalies.length}件</div>`;
    html += '<div style="max-height: 200px; overflow-y: auto;">';

    anomalies.slice(0, 10).forEach(anomaly => {
        html += '<div style="background: #ffffff; padding: 8px; border-radius: 4px; margin-bottom: 5px; font-size: 13px; border: 1px solid #f5c6cb;">';
        html += `<div style="font-weight: 600; color: #495057;">${anomaly.version} - ${anomaly.task} [${anomaly.process}]</div>`;
        html += `<div style="color: #495057;">見積: ${anomaly.estimate.toFixed(1)}h → 実績: ${anomaly.actual.toFixed(1)}h <span style="color: #dc3545; font-weight: bold;">(+${anomaly.overrun.toFixed(0)}%)</span></div>`;
        html += '</div>';
    });

    if (anomalies.length > 10) {
        html += `<div style="text-align: center; padding: 5px; color: #6c757d;">他 ${anomalies.length - 10}件...</div>`;
    }

    html += '</div></div>';
    return html;
}

/**
 * 要注意タスク一覧を描画
 */
function renderWarningTasks(filteredEstimates, filteredActuals) {
    const warnings = [];
    const taskSummary = {};

    filteredEstimates.forEach(e => {
        const key = `${e.version}-${e.task}`;
        if (!taskSummary[key]) {
            taskSummary[key] = { version: e.version, task: e.task, estimate: 0, actual: 0, processes: new Set() };
        }
        taskSummary[key].estimate += e.hours;
        taskSummary[key].processes.add(e.process);
    });

    filteredActuals.forEach(a => {
        const key = `${a.version}-${a.task}`;
        if (!taskSummary[key]) {
            taskSummary[key] = { version: a.version, task: a.task, estimate: 0, actual: 0, processes: new Set() };
        }
        taskSummary[key].actual += a.hours;
        taskSummary[key].processes.add(a.process);
    });

    Object.values(taskSummary).forEach(task => {
        const overrun = task.estimate > 0 ? ((task.actual - task.estimate) / task.estimate * 100) : 0;
        if (overrun > 50) {
            warnings.push({ ...task, overrun, processCount: task.processes.size });
        }
    });

    if (warnings.length === 0) {
        return '';
    }

    warnings.sort((a, b) => b.overrun - a.overrun);

    let html = '<div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">要注意タスク</h4>';
    html += '<div style="max-height: 150px; overflow-y: auto;">';

    warnings.slice(0, 5).forEach((warning, idx) => {
        html += '<div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 5px; border: 1px solid #e9ecef;">';
        html += `<div style="font-weight: 600; color: #495057;">#${idx + 1} ${warning.version} - ${warning.task}</div>`;
        html += `<div style="font-size: 13px; color: #495057;">見積: ${warning.estimate.toFixed(1)}h → 実績: ${warning.actual.toFixed(1)}h <span style="color: #dc3545; font-weight: bold;">(+${warning.overrun.toFixed(0)}%)</span></div>`;
        html += `<div style="font-size: 12px; color: #6c757d;">工程数: ${warning.processCount}</div>`;
        html += '</div>';
    });

    html += '</div></div>';
    return html;
}

/**
 * Phase 2: ビジュアル分析を描画
 * 工程別バーチャート、月別推移を表示
 * @param {Array} filteredEstimates - フィルタ済み見積データ
 * @param {Array} filteredActuals - フィルタ済み実績データ
 * @param {string} selectedMonth - 選択された月（'all'で全期間）
 * @returns {string} HTMLコンテンツ
 */
function renderPhase2VisualAnalysis(filteredEstimates, filteredActuals, selectedMonth) {
    if (!reportSettings.chartEnabled && !reportSettings.trendEnabled) {
        return '';
    }

    let html = '';
    html += `<div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #dee2e6;">`;
    html += `<h3 onclick="togglePhaseCollapse('phase2')" style="margin: 0; color: #495057; font-size: 18px; cursor: pointer; display: flex; align-items: center; user-select: none;">`;
    html += `<span id="phase2-arrow" style="margin-right: 10px; font-size: 14px;">${phaseCollapsed.phase2 ? '▶' : '▼'}</span>`;
    html += 'Phase 2: ビジュアル分析</h3>';
    html += `<div id="phase2-content" style="display: ${phaseCollapsed.phase2 ? 'none' : 'block'}; margin-top: 15px;">`;

    // 工程別バーチャート
    if (reportSettings.chartEnabled) {
        html += renderProcessBarChart(filteredEstimates, filteredActuals);
    }

    // 月別推移分析
    if (reportSettings.trendEnabled && selectedMonth === 'all') {
        html += renderMonthlyTrend(filteredEstimates, filteredActuals);
    }

    html += '</div>'; // close phase2-content
    html += '</div>';

    return html;
}

/**
 * 工程別見積vs実績バーチャートを描画
 */
function renderProcessBarChart(filteredEstimates, filteredActuals) {
    const processSummary = {};
    const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];

    filteredEstimates.forEach(e => {
        const processKey = processOrder.includes(e.process) ? e.process : 'その他';
        if (!processSummary[processKey]) {
            processSummary[processKey] = { estimate: 0, actual: 0 };
        }
        processSummary[processKey].estimate += e.hours;
    });

    filteredActuals.forEach(a => {
        const processKey = processOrder.includes(a.process) ? a.process : 'その他';
        if (!processSummary[processKey]) {
            processSummary[processKey] = { estimate: 0, actual: 0 };
        }
        processSummary[processKey].actual += a.hours;
    });

    const maxHours = Math.max(...Object.values(processSummary).map(p => Math.max(p.estimate, p.actual)));

    let html = '<div style="background: #ffffff; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e9ecef;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">工程別見積vs実績</h4>';

    const sortedProcesses = [
        ...processOrder.filter(p => processSummary[p]),
        ...(processSummary['その他'] ? ['その他'] : [])
    ];

    sortedProcesses.forEach(proc => {
        const data = processSummary[proc];
        const estWidth = (data.estimate / maxHours * 100).toFixed(1);
        const actWidth = (data.actual / maxHours * 100).toFixed(1);

        html += '<div style="margin-bottom: 15px;">';
        html += `<div style="font-weight: 600; margin-bottom: 5px; color: #495057;">${proc}</div>`;
        html += '<div style="display: grid; grid-template-columns: 60px 1fr; gap: 10px; align-items: center;">';
        html += '<div style="text-align: right; font-size: 13px; color: #6c757d;">見積</div>';
        html += `<div style="background: #e9ecef; border-radius: 4px; height: 20px; position: relative;">`;
        html += `<div style="background: #4dabf7; height: 100%; width: ${estWidth}%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 5px; min-width: 30px;">`;
        html += `<span style="font-size: 12px; font-weight: 600; color: white;">${data.estimate.toFixed(1)}h</span>`;
        html += '</div></div>';
        html += '<div style="text-align: right; font-size: 13px; color: #6c757d;">実績</div>';
        html += `<div style="background: #e9ecef; border-radius: 4px; height: 20px;">`;
        html += `<div style="background: ${data.actual > data.estimate ? '#dc3545' : '#28a745'}; height: 100%; width: ${actWidth}%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 5px; min-width: 30px;">`;
        html += `<span style="font-size: 12px; font-weight: 600; color: white;">${data.actual.toFixed(1)}h</span>`;
        html += '</div></div>';
        html += '</div></div>';
    });

    html += '</div>';
    return html;
}

/**
 * 月別推移を描画
 */
function renderMonthlyTrend(filteredEstimates, filteredActuals) {
    const monthlyData = {};

    filteredEstimates.forEach(e => {
        const est = normalizeEstimate(e);
        if (est.workMonths) {
            est.workMonths.forEach(month => {
                if (!monthlyData[month]) {
                    monthlyData[month] = { estimate: 0, actual: 0 };
                }
                const monthlyHoursVal = est.monthlyHours ? est.monthlyHours[month] : 0;
                monthlyData[month].estimate += monthlyHoursVal || 0;
            });
        }
    });

    filteredActuals.forEach(a => {
        const month = a.date ? a.date.substring(0, 7) : a.workMonth;
        if (month) {
            if (!monthlyData[month]) {
                monthlyData[month] = { estimate: 0, actual: 0 };
            }
            monthlyData[month].actual += a.hours;
        }
    });

    const sortedMonths = Object.keys(monthlyData).sort();

    if (sortedMonths.length <= 1) {
        return '';
    }

    let html = '<div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">月別推移</h4>';

    const maxMonthlyHours = Math.max(...Object.values(monthlyData).map(m => Math.max(m.estimate, m.actual)));

    sortedMonths.slice(-6).forEach(month => {
        const data = monthlyData[month];
        const [year, monthNum] = month.split('-');
        if (!year || !monthNum) return;
        const estWidth = maxMonthlyHours > 0 ? (data.estimate / maxMonthlyHours * 100).toFixed(1) : 0;
        const actWidth = maxMonthlyHours > 0 ? (data.actual / maxMonthlyHours * 100).toFixed(1) : 0;
        const diff = data.actual - data.estimate;

        html += '<div style="margin-bottom: 12px;">';
        html += `<div style="font-weight: 600; margin-bottom: 5px; color: #495057;">${year}年${parseInt(monthNum)}月</div>`;
        html += '<div style="display: flex; gap: 10px;">';
        html += '<div style="flex: 1;">';
        html += '<div style="display: flex; align-items: center; gap: 5px; margin-bottom: 4px;">';
        html += '<span style="font-size: 12px; color: #6c757d; min-width: 40px;">見積</span>';
        html += `<div style="flex: 1; background: #e9ecef; border-radius: 4px; height: 20px;">`;
        html += `<div style="background: #4dabf7; height: 100%; width: ${estWidth}%; border-radius: 4px;"></div>`;
        html += '</div>';
        html += `<span style="font-size: 12px; color: #495057; min-width: 50px; text-align: right;">${data.estimate.toFixed(1)}h</span>`;
        html += '</div>';
        html += '<div style="display: flex; align-items: center; gap: 5px;">';
        html += '<span style="font-size: 12px; color: #6c757d; min-width: 40px;">実績</span>';
        html += `<div style="flex: 1; background: #e9ecef; border-radius: 4px; height: 20px;">`;
        html += `<div style="background: ${data.actual > data.estimate ? '#dc3545' : '#28a745'}; height: 100%; width: ${actWidth}%; border-radius: 4px;"></div>`;
        html += '</div>';
        html += `<span style="font-size: 12px; color: #495057; min-width: 50px; text-align: right;">${data.actual.toFixed(1)}h</span>`;
        html += '</div>';
        html += '</div>';
        html += `<div style="min-width: 60px; text-align: right; font-size: 13px; color: ${diff > 0 ? '#dc3545' : '#28a745'}; font-weight: 600; display: flex; align-items: center; justify-content: flex-end;">${diff > 0 ? '+' : ''}${diff.toFixed(1)}h</div>`;
        html += '</div></div>';
    });

    html += '</div>';
    return html;
}

/**
 * Phase 3: 担当者分析とインサイトを描画
 * 担当者別パフォーマンス、グラフ、AIインサイトを表示
 * @param {Array} filteredEstimates - フィルタ済み見積データ
 * @param {Array} filteredActuals - フィルタ済み実績データ
 * @param {number} workingDaysPerMonth - 月あたり稼働日数
 * @returns {Object} { html: string, chartData: Object|null }
 */
function renderPhase3MemberAnalysis(filteredEstimates, filteredActuals, workingDaysPerMonth) {
    if (!reportSettings.memberAnalysisEnabled && !reportSettings.insightsEnabled) {
        return { html: '', chartData: null };
    }

    let html = '';
    let chartData = null;

    html += `<div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #dee2e6;">`;
    html += `<h3 onclick="togglePhaseCollapse('phase3')" style="margin: 0; color: #495057; font-size: 18px; cursor: pointer; display: flex; align-items: center; user-select: none;">`;
    html += `<span id="phase3-arrow" style="margin-right: 10px; font-size: 14px;">${phaseCollapsed.phase3 ? '▶' : '▼'}</span>`;
    html += 'Phase 3: 担当者分析とインサイト</h3>';
    html += `<div id="phase3-content" style="display: ${phaseCollapsed.phase3 ? 'none' : 'block'}; margin-top: 15px;">`;

    // 担当者別パフォーマンス
    if (reportSettings.memberAnalysisEnabled) {
        const result = renderMemberPerformance(filteredEstimates, filteredActuals, workingDaysPerMonth);
        html += result.html;
        chartData = result.chartData;
    }

    // AIライクなインサイト
    if (reportSettings.insightsEnabled) {
        html += renderInsights(filteredEstimates, filteredActuals);
    }

    html += '</div>'; // close phase3-content
    html += '</div>';

    return { html, chartData };
}

/**
 * 担当者別パフォーマンスを描画
 */
function renderMemberPerformance(filteredEstimates, filteredActuals, workingDaysPerMonth) {
    const memberSummary = {};
    const memberTasks = {};

    const allMembers = new Set();
    filteredEstimates.forEach(e => allMembers.add(e.member));
    filteredActuals.forEach(a => allMembers.add(a.member));

    allMembers.forEach(member => {
        memberSummary[member] = { estimate: 0, actual: 0 };
        memberTasks[member] = new Set();
    });

    filteredEstimates.forEach(estimate => {
        const relatedActuals = filteredActuals.filter(a =>
            a.version === estimate.version &&
            a.task === estimate.task &&
            a.process === estimate.process
        );

        let otherMembersActualHours = 0;
        const otherMembersHours = {};

        relatedActuals.forEach(actual => {
            if (actual.member !== estimate.member) {
                otherMembersActualHours += actual.hours;
                otherMembersHours[actual.member] = (otherMembersHours[actual.member] || 0) + actual.hours;
            }
        });

        const originalMemberEstimate = Math.max(0, estimate.hours - otherMembersActualHours);
        memberSummary[estimate.member].estimate += originalMemberEstimate;
        memberTasks[estimate.member].add(`${estimate.version}-${estimate.task}`);

        Object.keys(otherMembersHours).forEach(otherMember => {
            if (!memberSummary[otherMember]) {
                memberSummary[otherMember] = { estimate: 0, actual: 0 };
                memberTasks[otherMember] = new Set();
            }
            memberSummary[otherMember].estimate += otherMembersHours[otherMember];
            memberTasks[otherMember].add(`${estimate.version}-${estimate.task}`);
        });
    });

    filteredActuals.forEach(a => {
        if (!memberSummary[a.member]) {
            memberSummary[a.member] = { estimate: 0, actual: 0 };
            memberTasks[a.member] = new Set();
        }
        memberSummary[a.member].actual += a.hours;
        memberTasks[a.member].add(`${a.version}-${a.task}`);
    });

    const memberOrderElement = document.getElementById('memberOrder');
    const memberOrderInput = memberOrderElement ? memberOrderElement.value.trim() : '';
    const members = sortMembers(Object.keys(memberSummary), memberOrderInput);

    if (members.length === 0) {
        return { html: '', chartData: null };
    }

    let html = '<div style="background: #ffffff; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #e9ecef;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">担当者別パフォーマンス</h4>';

    // グラフセクション
    html += '<div style="margin-bottom: 20px;">';
    html += '<h5 style="margin: 0 0 10px 0; color: #495057; font-size: 14px; font-weight: 600;">見積 vs 実績 比較</h5>';
    html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 6px; overflow-x: auto;">';
    html += '<canvas id="memberComparisonChart" style="max-width: 100%; height: 300px;"></canvas>';
    html += '</div>';
    html += '</div>';

    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">';

    members.forEach(member => {
        const data = memberSummary[member];
        const accuracy = data.estimate > 0 ? (data.actual / data.estimate * 100).toFixed(1) : 0;
        const diff = data.actual - data.estimate;
        const estManDays = (data.estimate / 8).toFixed(1);
        const actManDays = (data.actual / 8).toFixed(1);
        const estManMonths = (data.estimate / 8 / workingDaysPerMonth).toFixed(2);
        const actManMonths = (data.actual / 8 / workingDaysPerMonth).toFixed(2);
        const taskCount = memberTasks[member] ? memberTasks[member].size : 0;

        html += '<div style="background: #f8f9fa; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef;">';
        html += `<div style="font-weight: 600; margin-bottom: 8px; color: #495057;">${member}</div>`;
        html += `<div style="font-size: 13px; color: #495057; margin-bottom: 2px;">見積: ${data.estimate.toFixed(1)}h</div>`;
        html += `<div style="font-size: 12px; color: #6c757d; margin-left: 10px; margin-bottom: 6px;">${estManDays}人日 / ${estManMonths}人月</div>`;
        html += `<div style="font-size: 13px; color: #495057; margin-bottom: 2px;">実績: ${data.actual.toFixed(1)}h</div>`;
        html += `<div style="font-size: 12px; color: #6c757d; margin-left: 10px; margin-bottom: 6px;">${actManDays}人日 / ${actManMonths}人月</div>`;
        html += `<div style="font-size: 13px; color: #495057;">精度: <span style="font-weight: 600;">${accuracy}%</span></div>`;
        html += `<div style="font-size: 13px; color: #495057;">差分: <span style="color: ${diff > 0 ? '#dc3545' : '#28a745'};">${diff > 0 ? '+' : ''}${diff.toFixed(1)}h</span></div>`;
        html += `<div style="font-size: 12px; color: #6c757d; margin-top: 5px;">担当タスク: ${taskCount}件</div>`;
        html += '</div>';
    });

    html += '</div>';

    // 内訳ドーナツグラフセクション
    html += '<div style="margin-top: 20px;">';
    html += '<h5 style="margin: 0 0 10px 0; color: #495057; font-size: 14px; font-weight: 600;">担当者別 工数内訳</h5>';
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">';

    members.forEach((member, index) => {
        html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center;">';
        html += `<div style="font-weight: 600; margin-bottom: 10px; color: #495057;">${member}</div>`;
        html += `<canvas id="memberDonutChart_${index}" class="donut-chart-canvas"></canvas>`;
        html += '</div>';
    });

    html += '</div></div>';
    html += '</div>';

    const chartData = {
        members: members,
        memberSummary: memberSummary,
        filteredEstimates: filteredEstimates,
        filteredActuals: filteredActuals
    };

    return { html, chartData };
}

/**
 * AIライクなインサイトを描画
 */
function renderInsights(filteredEstimates, filteredActuals) {
    const insights = [];

    const totalEst = filteredEstimates.reduce((sum, e) => sum + e.hours, 0);
    const totalAct = filteredActuals.reduce((sum, a) => sum + a.hours, 0);
    const overallAccuracy = totalEst > 0 ? (totalAct / totalEst * 100) : 0;

    if (overallAccuracy > 120) {
        insights.push({
            type: 'warning',
            title: '見積精度に課題',
            message: `全体で見積を${(overallAccuracy - 100).toFixed(0)}%超過しています。タスク分解の見直しが必要かもしれません。`
        });
    } else if (overallAccuracy >= 90 && overallAccuracy <= 110) {
        insights.push({
            type: 'success',
            title: '優れた見積精度',
            message: `見積精度${overallAccuracy.toFixed(1)}%で、非常に正確な見積ができています。`
        });
    }

    const processSummary = {};
    filteredEstimates.forEach(e => {
        const processKey = e.process || 'その他';
        if (!processSummary[processKey]) processSummary[processKey] = { estimate: 0, actual: 0 };
        processSummary[processKey].estimate += e.hours;
    });
    filteredActuals.forEach(a => {
        const processKey = a.process || 'その他';
        if (!processSummary[processKey]) processSummary[processKey] = { estimate: 0, actual: 0 };
        processSummary[processKey].actual += a.hours;
    });

    let bestProcess = null;
    let bestAccuracy = 1000;
    Object.entries(processSummary).forEach(([proc, data]) => {
        if (data.estimate > 0) {
            const accuracy = Math.abs(100 - (data.actual / data.estimate * 100));
            if (accuracy < bestAccuracy) {
                bestAccuracy = accuracy;
                bestProcess = proc;
            }
        }
    });

    if (bestProcess) {
        insights.push({
            type: 'info',
            title: '最適な工程',
            message: `${bestProcess}工程の見積精度が最も高く、計画通りに進行しています。`
        });
    }

    if (insights.length === 0) {
        return '';
    }

    let html = '<div style="background: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef;">';
    html += '<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">インサイト</h4>';

    insights.forEach(insight => {
        const bgColor = insight.type === 'warning' ? '#fff5f5' :
            insight.type === 'success' ? '#d4edda' :
                '#cce5ff';
        const borderColor = insight.type === 'warning' ? '#f5c6cb' :
            insight.type === 'success' ? '#c3e6cb' :
                '#b8daff';
        const textColor = insight.type === 'warning' ? '#721c24' :
            insight.type === 'success' ? '#155724' :
                '#004085';

        html += `<div style="background: ${bgColor}; padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px solid ${borderColor};">`;
        html += `<div style="font-weight: 600; margin-bottom: 3px; color: ${textColor};">${insight.title}</div>`;
        html += `<div style="font-size: 13px; color: ${textColor};">${insight.message}</div>`;
        html += '</div>';
    });

    html += '</div>';
    return html;
}

/**
 * レポート分析セクション全体を描画
 * Phase 1-3のサブ関数を呼び出してHTMLを構築
 * @param {Array} filteredActuals - フィルタ済み実績データ
 * @param {Array} filteredEstimates - フィルタ済み見積データ
 * @param {string} selectedMonth - 選択された月
 * @param {number} workingDaysPerMonth - 月あたり稼働日数
 */
export function renderReportAnalytics(filteredActuals, filteredEstimates, selectedMonth, workingDaysPerMonth) {
    const container = document.getElementById('reportDetailView');
    let html = '';

    // Phase 1: 見積精度分析
    html += renderPhase1AccuracyAnalysis(filteredEstimates, filteredActuals);

    // Phase 2: ビジュアル分析
    html += renderPhase2VisualAnalysis(filteredEstimates, filteredActuals, selectedMonth);

    // Phase 3: 担当者分析とインサイト
    const phase3Result = renderPhase3MemberAnalysis(filteredEstimates, filteredActuals, workingDaysPerMonth);
    html += phase3Result.html;

    container.innerHTML += html;

    // Phase 3のグラフを描画（DOMが更新された後に実行）
    if (phase3Result.chartData) {
        setTimeout(() => {
            drawMemberComparisonChart(phase3Result.chartData.members, phase3Result.chartData.memberSummary);
            phase3Result.chartData.members.forEach((member, index) => {
                drawMemberDonutChart(member, index, phase3Result.chartData.filteredEstimates, phase3Result.chartData.filteredActuals);
            });
        }, 200);
    }
}

// ============================================
// 担当者別・版数別レポート
// ============================================

export function renderMemberReport(filteredActuals, filteredEstimates) {
    // 見積データと実績データから担当者を動的に抽出
    const allMembers = new Set();
    filteredEstimates.forEach(e => allMembers.add(e.member));
    filteredActuals.forEach(a => allMembers.add(a.member));

    // 表示順が設定されている場合はそれを使用
    const memberOrderInput = document.getElementById('memberOrder');
    const memberOrderValue = memberOrderInput ? memberOrderInput.value.trim() : '';
    const members = sortMembers(allMembers, memberOrderValue);

    if (members.length === 0) {
        document.getElementById('memberReport').innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">データがありません</p>';
        return;
    }

    // 自動分割ロジック
    const adjustedEstimates = {};
    members.forEach(member => {
        adjustedEstimates[member] = 0;
    });

    filteredEstimates.forEach(estimate => {
        const relatedActuals = filteredActuals.filter(a =>
            a.version === estimate.version &&
            a.task === estimate.task &&
            a.process === estimate.process
        );

        let otherMembersActualHours = 0;
        const otherMembersHours = {};

        relatedActuals.forEach(actual => {
            if (actual.member !== estimate.member) {
                otherMembersActualHours += actual.hours;
                otherMembersHours[actual.member] = (otherMembersHours[actual.member] || 0) + actual.hours;
            }
        });

        const originalMemberEstimate = Math.max(0, estimate.hours - otherMembersActualHours);
        adjustedEstimates[estimate.member] = (adjustedEstimates[estimate.member] || 0) + originalMemberEstimate;

        Object.keys(otherMembersHours).forEach(otherMember => {
            adjustedEstimates[otherMember] = (adjustedEstimates[otherMember] || 0) + otherMembersHours[otherMember];
        });
    });

    const isMobile = window.innerWidth <= 768;
    const headers = isMobile
        ? '<tr><th>担当</th><th>見積</th><th>実績</th><th>差</th><th>率</th></tr>'
        : '<tr><th>担当者</th><th>見積工数</th><th>実績工数</th><th>差異</th><th>差異率</th></tr>';

    let html = `<div class="table-wrapper"><table>${headers}`;

    members.forEach(member => {
        const est = adjustedEstimates[member] || 0;
        const act = filteredActuals.filter(a => a.member === member).reduce((sum, a) => sum + a.hours, 0);
        const diff = act - est;
        const rate = est > 0 ? ((diff / est) * 100).toFixed(1) : 0;

        html += `
            <tr>
                <td><strong>${member}</strong></td>
                <td>${est.toFixed(1)}h</td>
                <td>${act.toFixed(1)}h</td>
                <td style="color: ${diff >= 0 ? '#e74c3c' : '#27ae60'}">${(diff >= 0 ? '+' : '')}${diff.toFixed(1)}h</td>
                <td>${rate}%</td>
            </tr>
        `;
    });

    html += '</table></div>';
    document.getElementById('memberReport').innerHTML = html;
}

export function renderVersionReport(filteredActuals, filteredEstimates) {
    const versions = [...new Set(filteredEstimates.map(e => e.version))];

    if (versions.length === 0) {
        document.getElementById('versionReport').innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">該当する見積データがありません</p>';
        return;
    }

    const isMobile = window.innerWidth <= 768;
    const headers = isMobile
        ? '<tr><th>版</th><th>見積</th><th>実績</th><th>進捗</th></tr>'
        : '<tr><th>版数</th><th>見積工数</th><th>実績工数</th><th>進捗率</th></tr>';

    let html = `<div class="table-wrapper"><table>${headers}`;

    versions.forEach(version => {
        const est = filteredEstimates.filter(e => e.version === version).reduce((sum, e) => sum + e.hours, 0);
        const act = filteredActuals.filter(a => a.version === version).reduce((sum, a) => sum + a.hours, 0);
        const progress = est > 0 ? (act / est * 100).toFixed(1) : 0;

        html += `
            <tr>
                <td><strong>${version}</strong></td>
                <td>${est.toFixed(1)}h</td>
                <td>${act.toFixed(1)}h</td>
                <td>${progress}%</td>
            </tr>
        `;
    });

    html += '</table></div>';
    document.getElementById('versionReport').innerHTML = html;
}

// ============================================
// グループ表示・マトリクス表示
// ============================================

export function renderReportGrouped(filteredActuals, filteredEstimates) {
    const container = document.getElementById('reportDetailView');

    // window経由で関数を呼び出し
    const isOtherWork = typeof window.isOtherWork === 'function' ? window.isOtherWork : (() => false);
    const getWorkingDays = typeof window.getWorkingDays === 'function' ? window.getWorkingDays : (() => 20);

    // 選択月の実働日数を取得
    const selectedMonth = document.getElementById('reportMonth').value;
    let workingDaysPerMonth = 20;
    if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        workingDaysPerMonth = getWorkingDays(parseInt(year), parseInt(month));
    }

    // 版数ごとにグループ化
    const versionGroups = {};

    filteredEstimates.forEach(e => {
        let version, taskKey;
        if (isOtherWork(e)) {
            version = 'その他付随作業';
            taskKey = e.task && e.task.trim() !== '' ? e.task : '未分類作業';
        } else {
            version = e.version;
            taskKey = e.task;
        }

        if (!versionGroups[version]) {
            versionGroups[version] = {};
        }
        if (!versionGroups[version][taskKey]) {
            versionGroups[version][taskKey] = {
                task: taskKey,
                estimates: {},
                actuals: {}
            };
        }
        if (!versionGroups[version][taskKey].estimates[e.process]) {
            versionGroups[version][taskKey].estimates[e.process] = { members: new Set(), hours: 0 };
        }
        versionGroups[version][taskKey].estimates[e.process].members.add(e.member);
        versionGroups[version][taskKey].estimates[e.process].hours += e.hours;
    });

    filteredActuals.forEach(a => {
        let version, taskKey;
        if (isOtherWork(a)) {
            version = 'その他付随作業';
            taskKey = a.task && a.task.trim() !== '' ? a.task : '未分類作業';
        } else {
            version = a.version;
            taskKey = a.task;
        }

        if (!versionGroups[version]) {
            versionGroups[version] = {};
        }
        if (!versionGroups[version][taskKey]) {
            versionGroups[version][taskKey] = {
                task: taskKey,
                estimates: {},
                actuals: {}
            };
        }
        if (!versionGroups[version][taskKey].actuals[a.process]) {
            versionGroups[version][taskKey].actuals[a.process] = { members: new Set(), hours: 0 };
        }
        versionGroups[version][taskKey].actuals[a.process].members.add(a.member);
        versionGroups[version][taskKey].actuals[a.process].hours += a.hours;
    });

    if (Object.keys(versionGroups).length === 0) {
        container.innerHTML += '<p style="color: #999; text-align: center; padding: 40px;">該当するデータがありません</p>';
        return;
    }

    let html = '<h3 style="margin-top: 30px;">対応別詳細（見積 vs 実績）</h3>';
    html += '<div style="margin-bottom: 30px;">';

    const versions = Object.keys(versionGroups).sort((a, b) => {
        if (a === 'その他付随作業') return 1;
        if (b === 'その他付随作業') return -1;
        return a.localeCompare(b);
    });

    versions.forEach(version => {
        let tableBody = '';
        let versionTotalEst = 0;
        let versionTotalAct = 0;

        Object.values(versionGroups[version]).forEach(taskGroup => {
            const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
            const allProcesses = new Set([...Object.keys(taskGroup.estimates), ...Object.keys(taskGroup.actuals)]);

            const sortedProcesses = [
                ...processOrder.filter(p => allProcesses.has(p)),
                ...[...allProcesses].filter(p => !processOrder.includes(p))
            ];

            if (sortedProcesses.length === 0) return;

            let totalEst = 0;
            let totalAct = 0;
            sortedProcesses.forEach(proc => {
                const est = taskGroup.estimates[proc] || { members: new Set(), hours: 0 };
                const act = taskGroup.actuals[proc] || { members: new Set(), hours: 0 };
                totalEst += est.hours;
                totalAct += act.hours;
            });
            const totalDiff = totalAct - totalEst;

            versionTotalEst += totalEst;
            versionTotalAct += totalAct;

            sortedProcesses.forEach((proc, index) => {
                const est = taskGroup.estimates[proc] || { members: new Set(), hours: 0 };
                const act = taskGroup.actuals[proc] || { members: new Set(), hours: 0 };
                const diff = act.hours - est.hours;

                let memberDisplay = '-';
                if (act.members.size > 0) {
                    memberDisplay = Array.from(act.members).join(',');
                } else if (est.members.size > 0) {
                    memberDisplay = Array.from(est.members).join(',');
                }

                const progressBarHtml = generateProgressBar(version, taskGroup.task, proc);

                tableBody += '<tr>';
                if (index === 0) {
                    let taskDisplayHtml = taskGroup.task;
                    if (taskGroup.task.includes('：')) {
                        const parts = taskGroup.task.split('：');
                        const restPart = parts.slice(1).join('：');
                        taskDisplayHtml = `${parts[0]}<br><span style="font-size: 13px; font-weight: normal;">${restPart}</span>`;
                    }
                    tableBody += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; font-weight: 600;">${taskDisplayHtml}</td>`;
                }
                tableBody += `<td><span class="badge badge-${proc.toLowerCase()}">${proc}</span></td>`;
                tableBody += `<td style="word-break: break-word;">${memberDisplay}</td>`;
                tableBody += `<td style="text-align: right;">${est.hours > 0 ? est.hours.toFixed(1) + 'h' : '-'}</td>`;
                tableBody += `<td style="text-align: right;">${act.hours > 0 ? act.hours.toFixed(1) + 'h' : '-'}</td>`;
                tableBody += `<td style="text-align: right; color: ${diff > 0 ? '#e74c3c' : diff < 0 ? '#27ae60' : '#666'}">${diff !== 0 ? (diff > 0 ? '+' : '') + diff.toFixed(1) + 'h' : '-'}</td>`;
                const progressCellStyle = progressBarHtml && progressBarStyle === 'bottom'
                    ? 'min-width: 100px; padding: 8px 8px 12px 8px; position: relative;'
                    : 'min-width: 100px; padding: 8px;';
                tableBody += `<td style="${progressCellStyle}">${progressBarHtml || '<span style="color: #ccc; font-size: 13px;">-</span>'}</td>`;
                if (index === 0) {
                    tableBody += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; text-align: right;">
                        <div style="font-weight: 600;">見積: ${totalEst.toFixed(1)}h</div>
                        <div style="font-weight: 600;">実績: ${totalAct.toFixed(1)}h</div>
                        <div style="font-weight: 700; color: ${totalDiff > 0 ? '#e74c3c' : totalDiff < 0 ? '#27ae60' : '#666'}">差異: ${totalDiff > 0 ? '+' : ''}${totalDiff.toFixed(1)}h</div>
                    </td>`;
                }
                tableBody += '</tr>';
            });
        });

        if (tableBody) {
            const versionTotalDiff = versionTotalAct - versionTotalEst;

            html += `<div style="margin-bottom: 30px;">`;
            html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${version}</h3>`;
            html += '<div class="table-wrapper"><table class="estimate-grouped">';
            html += '<tr><th style="min-width: 150px;">対応名</th><th style="min-width: 80px;">工程</th><th style="min-width: 80px;">担当</th><th style="min-width: 80px;">見積</th><th style="min-width: 80px;">実績</th><th style="min-width: 80px;">差異</th><th style="min-width: 100px;">進捗</th><th style="min-width: 100px;">対応合計</th></tr>';
            html += tableBody;

            html += '<tr style="background: #f5f5f5; font-weight: bold; border-top: 2px solid #ddd;">';
            html += `<td style="padding: 12px; position: sticky; left: 0; background: #f5f5f5; z-index: 1;">合計</td>`;
            html += '<td></td>';
            html += '<td></td>';
            html += `<td style="text-align: right;">${versionTotalEst.toFixed(1)}h</td>`;
            html += `<td style="text-align: right;">${versionTotalAct.toFixed(1)}h</td>`;
            html += `<td style="text-align: right; color: ${versionTotalDiff > 0 ? '#e74c3c' : versionTotalDiff < 0 ? '#27ae60' : '#666'}">${versionTotalDiff > 0 ? '+' : ''}${versionTotalDiff.toFixed(1)}h</td>`;
            html += '<td></td>';
            html += '<td></td>';
            html += '</tr>';

            html += '</table></div>';
            html += '</div>';
        }
    });

    html += '</div>';
    container.innerHTML += html;
}

export function renderReportMatrix(filteredActuals, filteredEstimates, selectedMonth) {
    const container = document.getElementById('reportDetailView');
    const isOtherWork = typeof window.isOtherWork === 'function' ? window.isOtherWork : (() => false);
    const bgColorMode = window.reportMatrixBgColorMode || 'deviation';
    const showMonthColors = bgColorMode === 'month';
    const isMobile = window.innerWidth <= 768;

    const usedMonths = new Set();
    let hasMultipleMonths = false;
    let hasUnassigned = false;

    // Calculate Working Days for Conversion Basis
    let workingDaysPerMonth = 20;
    let workDaysLabel = 'デフォルト20日';
    if (selectedMonth && selectedMonth !== 'all') {
        // 特定の月が選択されている場合
        const [year, month] = selectedMonth.split('-');
        const calculatedDays = getWorkingDays(parseInt(year), parseInt(month));
        if (calculatedDays > 0) {
            workingDaysPerMonth = calculatedDays;
            workDaysLabel = `${year}年${parseInt(month)}月の営業日数（${workingDaysPerMonth}日）`;
        }
    } else {
        // 全期間/版数別の場合: 見積もりに含まれる作業月の平均営業日数を計算
        const workMonthsSet = new Set();
        filteredEstimates.forEach(e => {
            const est = normalizeEstimate(e);
            if (est.workMonths && est.workMonths.length > 0) {
                est.workMonths.forEach(m => workMonthsSet.add(m));
            }
        });
        
        if (workMonthsSet.size > 0) {
            let totalDays = 0;
            workMonthsSet.forEach(m => {
                const [year, month] = m.split('-');
                totalDays += getWorkingDays(parseInt(year), parseInt(month));
            });
            workingDaysPerMonth = Math.round(totalDays / workMonthsSet.size);
            if (workMonthsSet.size === 1) {
                const singleMonth = [...workMonthsSet][0];
                const [year, month] = singleMonth.split('-');
                workDaysLabel = `${year}年${parseInt(month)}月の営業日数（${workingDaysPerMonth}日）`;
            } else {
                workDaysLabel = `${workMonthsSet.size}ヶ月の平均営業日数（${workingDaysPerMonth}日）`;
            }
        }
    }

    // Update Conversion Params Header
    const conversionParams = document.getElementById('reportConversionParams');
    if (conversionParams) {
        conversionParams.innerHTML = `<strong>換算基準:</strong> 1人日 = 8h、1人月 = ${workingDaysPerMonth}人日（${workDaysLabel}）`;
        conversionParams.style.display = 'block';
    }

    const versionGroups = {};

    filteredEstimates.forEach(e => {
        let version, taskKey;
        if (isOtherWork(e)) {
            version = 'その他付随作業';
            taskKey = e.task && e.task.trim() !== '' ? e.task : '未分類作業';
        } else {
            version = e.version;
            taskKey = e.task;
        }

        if (!versionGroups[version]) versionGroups[version] = {};
        if (!versionGroups[version][taskKey]) {
            versionGroups[version][taskKey] = { task: taskKey, estimates: {}, actuals: {} };
        }

        const est = normalizeEstimate(e);
        if (est.workMonths && est.workMonths.length > 0) {
            est.workMonths.forEach(m => usedMonths.add(m));
            if (est.workMonths.length > 1) hasMultipleMonths = true;
        } else {
            hasUnassigned = true;
        }

        if (!versionGroups[version][taskKey].estimates[e.process]) {
            versionGroups[version][taskKey].estimates[e.process] = {
                members: new Set(),
                hours: 0,
                workMonths: est.workMonths || []
            };
        }
        versionGroups[version][taskKey].estimates[e.process].members.add(e.member);
        versionGroups[version][taskKey].estimates[e.process].hours += e.hours;
    });

    filteredActuals.forEach(a => {
        let version, taskKey;
        if (isOtherWork(a)) {
            version = 'その他付随作業';
            taskKey = a.task && a.task.trim() !== '' ? a.task : '未分類作業';
        } else {
            version = a.version;
            taskKey = a.task;
        }

        if (!versionGroups[version]) versionGroups[version] = {};
        if (!versionGroups[version][taskKey]) {
            versionGroups[version][taskKey] = { task: taskKey, estimates: {}, actuals: {} };
        }
        if (!versionGroups[version][taskKey].actuals[a.process]) {
            versionGroups[version][taskKey].actuals[a.process] = { members: new Set(), hours: 0 };
        }
        versionGroups[version][taskKey].actuals[a.process].members.add(a.member);
        versionGroups[version][taskKey].actuals[a.process].hours += a.hours;
    });

    if (Object.keys(versionGroups).length === 0) {
        container.innerHTML += '<p style="color: #999; text-align: center; padding: 40px;">該当するデータがありません</p>';
        return;
    }

    const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
    let html = '<h3 style="margin-top: 30px;">対応別マトリクス（見積 vs 実績）</h3>';
    if (showMonthColors) html += generateMonthColorLegend(usedMonths, hasMultipleMonths, hasUnassigned);

    html += '<div class="matrix-container">';

    const versions = Object.keys(versionGroups).sort((a, b) => {
        if (a === 'その他付随作業') return 1;
        if (b === 'その他付随作業') return -1;
        return a.localeCompare(b);
    });

    versions.forEach(version => {
        // const versionProcesses = new Set();
        // Object.values(versionGroups[version]).forEach(taskGroup => {
        //     Object.keys(taskGroup.estimates).forEach(p => versionProcesses.add(p));
        //     Object.keys(taskGroup.actuals).forEach(p => versionProcesses.add(p));
        // });

        const displayProcesses = processOrder;

        let contentHtml = '';
        let versionTotalEst = 0;
        let versionTotalAct = 0;

        Object.values(versionGroups[version]).forEach(taskGroup => {
            let totalEst = 0;
            let totalAct = 0;
            const taskCells = [];

            displayProcesses.forEach(proc => {
                const est = taskGroup.estimates[proc] || { members: new Set(), hours: 0, workMonths: [] };
                const act = taskGroup.actuals[proc] || { members: new Set(), hours: 0 };
                totalEst += est.hours;
                totalAct += act.hours;
                taskCells.push({ proc, est, act });
            });

            if (totalEst > 0 || totalAct > 0) {
                versionTotalEst += totalEst;
                versionTotalAct += totalAct;

                let taskDisplayHtml = taskGroup.task;
                if (taskGroup.task.includes('：')) {
                    const parts = taskGroup.task.split('：');
                    const restPart = parts.slice(1).join('：');
                    taskDisplayHtml = `${parts[0]}<br><span style="font-size: 13px; font-weight: normal;">${restPart}</span>`;
                }

                contentHtml += '<tr>';
                contentHtml += `<td class="matrix-header-task">${taskDisplayHtml}</td>`;
                taskCells.forEach(({ proc, est, act }) => {
                    if (est.hours > 0 || act.hours > 0) {
                        const bgColor = bgColorMode === 'month' ? getMonthColor(est.workMonths || []).bg : '';
                        const cellInner = renderCellOptionA(version, taskGroup.task, proc, est, act, bgColorMode, workingDaysPerMonth);
                        const onclick = getCellOnclick(version, taskGroup.task, proc, est, act);
                        const title = bgColorMode === 'month' ? `title="${getMonthColor(est.workMonths || []).tooltip}"` : '';

                        // deviation mode default style
                        let devStyle = '';
                        if (bgColorMode === 'deviation') {
                            devStyle = `background: ${getDeviationColor(est.hours, act.hours)};`;
                        }

                        contentHtml += `<td style="${bgColor ? 'background:' + bgColor + ';' : devStyle} padding: 4px; cursor: pointer;" ${onclick} ${title}>${cellInner}</td>`;
                    } else {
                        contentHtml += `<td style="text-align: center; color: #ccc;">-</td>`;
                    }
                });

                // Total Column using renderCellOptionA
                const totalDiff = totalAct - totalEst;
                const totalBgColor = bgColorMode === 'deviation' ? getDeviationColor(totalEst, totalAct) : '#ffffff';
                const totalCellInner = renderCellOptionA(
                    version,
                    taskGroup.task,
                    'total',
                    { hours: totalEst, members: new Set() },
                    { hours: totalAct, members: new Set() },
                    bgColorMode,
                    workingDaysPerMonth
                );

                contentHtml += `<td style="text-align: center; background: ${totalBgColor}; padding: 4px;">${totalCellInner}</td></tr>`;
            }
        });

        if (contentHtml) {
            const versionTotalDiff = versionTotalAct - versionTotalEst;
            html += `<div style="margin-bottom: 30px;">`;
            html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${version}</h3>`;

            html += '<div class="matrix-table-wrapper"><table class="matrix-table">';
            html += '<tr><th class="matrix-header-task">対応名</th>';
            displayProcesses.forEach(proc => {
                html += `<th style="min-width: 80px; text-align: center;">${proc}</th>`;
            });
            html += '<th style="min-width: 90px; text-align: center;">合計</th></tr>';
            html += contentHtml;
            html += '<tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #ddd;">';
            html += `<td class="matrix-header-task">合計</td>`;
            displayProcesses.forEach(() => html += '<td></td>');
            const vBg = bgColorMode === 'deviation' ? getDeviationColor(versionTotalEst, versionTotalAct) : '#f8fafc';
            html += `<td style="text-align: center; background: ${vBg}; padding: 4px;">
                <div style="font-weight: 600;">${versionTotalEst.toFixed(1)}<span style="margin: 0 2px; color: #ccc;">/</span>${versionTotalAct.toFixed(1)}</div>
                <div class="matrix-diff ${versionTotalDiff > 0 ? 'diff-negative' : 'diff-positive'}" style="margin-top: 2px;">${versionTotalDiff > 0 ? '+' : ''}${versionTotalDiff.toFixed(1)}</div>
            </td></tr></table></div>`;

            html += '</div>';
        }
    });

    html += '</div>';
    container.innerHTML += html;
}

// 案A（改：Formatted 2-Row Layout）のセルレンダリング
function renderCellOptionA(version, task, process, est, act, bgColorMode, workingDaysPerMonth = 20) {
    const diff = act.hours - est.hours;
    let isOver = false;
    let isWarning = false;
    let isSafeBright = false;
    let isSafeNormal = false;

    // 4-Stage Color Logic (Applied to Actual value)
    if (est.hours > 0 && act.hours > 0) {
        const ratio = act.hours / est.hours;
        if (ratio > 1.1) {
            isOver = true;      // Red (> 110%)
        } else if (ratio > 1.0) {
            isWarning = true;   // Orange (100% - 110%)
        } else if (ratio < 0.9) {
            isSafeBright = true; // Bright Green (< 90%)
        } else {
            isSafeNormal = true; // Green (90% - 100%)
        }
    } else if (est.hours === 0 && act.hours > 0) {
        isOver = true; // No estimate -> Red
    }

    const actColorClass = isOver ? 'over' : (isWarning ? 'warning' : (isSafeBright ? 'safe-bright' : (isSafeNormal ? 'safe-normal' : '')));

    // Unit Calculations
    const estDays = est.hours / 8;
    const actDays = act.hours / 8;

    // Estimate Text Generation
    let estText = '-';
    if (est.hours > 0) {
        if (process === 'total') {
            const estMonths = est.hours / 8 / workingDaysPerMonth;
            estText = `<div style="line-height: 1.4;">
                <span class="a-val">${est.hours.toFixed(1)}h</span><br>
                <span style="font-size: 10px; font-weight: 400; color: #666;">
                    (${estDays.toFixed(1)}人日 / ${estMonths.toFixed(2)}人月)
                </span>
            </div>`;
        } else {
            estText = `<span class="a-val">${est.hours.toFixed(1)}h</span><span class="unit-info">(${estDays.toFixed(1)}人日)</span>`;
        }
    }

    // For Actual, handle Total column specific Person-Months
    let actText = '-';
    if (act.hours > 0) {
        if (process === 'total') {
            const actMonths = act.hours / 8 / workingDaysPerMonth;
            actText = `<div style="line-height: 1.4;">
                <span class="a-val">${act.hours.toFixed(1)}h</span><br>
                <span style="font-size: 10px; font-weight: 400; color: #666;">
                    (${actDays.toFixed(1)}人日 / ${actMonths.toFixed(2)}人月)
                </span>
            </div>`;
        } else {
            actText = `<span class="a-val">${act.hours.toFixed(1)}h</span><span class="unit-info">(${actDays.toFixed(1)}人日)</span>`;
        }
    }

    let memberDisplay = '-';
    if (act.members.size > 0) memberDisplay = Array.from(act.members).join(',');
    else if (est.members.size > 0) memberDisplay = Array.from(est.members).join(',');

    const memberText = memberDisplay !== '-' ? `(${memberDisplay})` : '';

    const diffText = diff !== 0
        ? (diff > 0 ? '+' : '') + diff.toFixed(1) + 'h'
        : '±0h';

    return `
        <div class="matrix-cell-content">
            <div class="opt-a-row a-est">
                ${estText}
            </div>
            <div class="opt-a-row a-act ${actColorClass}">
                ${actText}
            </div>
            <div class="matrix-diff ${diff > 0 ? 'diff-negative' : (diff < 0 ? 'diff-positive' : '')}">${diffText}</div>
            ${memberText ? `<div class="m-member">${memberText}</div>` : ''}
        </div>
    `;
}

// セルクリック時のイベント取得
function getCellOnclick(version, task, process, est, act) {
    const totalMembers = new Set([...est.members, ...act.members]);
    const v = version.replace(/'/g, "\\'");
    const t = task.replace(/'/g, "\\'");
    const p = process.replace(/'/g, "\\'");
    if (totalMembers.size > 1) {
        return `onclick="openProcessBreakdown('${v}', '${t}', '${p}')"`;
    } else {
        return `onclick="openRemainingHoursModal('${v}', '${t}', '${p}')"`;
    }
}

// 担当者別見積vs実績比較グラフを描画
function drawMemberComparisonChart(members, memberSummary) {
    const canvas = document.getElementById('memberComparisonChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // キャンバスのサイズを設定
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // モバイル対応：画面幅に応じてパディングと凡例位置を調整
    const isMobile = width < 768;
    const padding = isMobile
        ? { top: 30, right: 20, bottom: 90, left: 50 }
        : { top: 40, right: 100, bottom: 60, left: 80 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // データの最大値を取得
    let maxValue = 0;
    members.forEach(member => {
        const data = memberSummary[member];
        maxValue = Math.max(maxValue, data.estimate, data.actual);
    });
    maxValue = Math.ceil(maxValue * 1.1) || 10;

    // 背景を塗りつぶす
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // グリッド線を描画
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();

        // Y軸ラベル
        const value = maxValue - (maxValue / 5) * i;
        ctx.fillStyle = '#495057';
        ctx.font = isMobile ? '10px sans-serif' : '12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(value.toFixed(0) + 'h', padding.left - 10, y + 4);
    }
    ctx.setLineDash([]);

    // バーを描画
    const barSpacing = isMobile ? 2 : 5;
    const groupWidth = chartWidth / members.length;
    const barWidth = isMobile
        ? (groupWidth * 0.7) / 2 - barSpacing
        : (groupWidth * 0.8) / 2 - barSpacing;

    const colorScheme = getActiveChartColorScheme();

    members.forEach((member, index) => {
        const data = memberSummary[member];
        const x = padding.left + groupWidth * index + groupWidth / 2;

        // 見積のバー
        const estimateHeight = (data.estimate / maxValue) * chartHeight;
        ctx.fillStyle = '#4dabf7';
        ctx.fillRect(x - barWidth - barSpacing, padding.top + chartHeight - estimateHeight, barWidth, estimateHeight);

        // 実績のバー
        const actualHeight = (data.actual / maxValue) * chartHeight;
        ctx.fillStyle = data.actual > data.estimate ? '#e74c3c' : '#27ae60';
        ctx.fillRect(x + barSpacing, padding.top + chartHeight - actualHeight, barWidth, actualHeight);

        // X軸ラベル（担当者名）
        ctx.fillStyle = '#495057';
        ctx.font = isMobile ? '9px sans-serif' : '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x, padding.top + chartHeight + 15);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(member, 0, 0);
        ctx.restore();
    });

    // 凡例を描画
    if (isMobile) {
        const legendY = padding.top + chartHeight + 70;
        const legendX = width / 2 - 60;

        ctx.fillStyle = '#4dabf7';
        ctx.fillRect(legendX, legendY, 12, 12);
        ctx.fillStyle = '#495057';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('見積', legendX + 18, legendY + 10);

        ctx.fillStyle = '#27ae60';
        ctx.fillRect(legendX + 60, legendY, 12, 12);
        ctx.fillStyle = '#495057';
        ctx.fillText('実績', legendX + 78, legendY + 10);
    } else {
        ctx.fillStyle = '#4dabf7';
        ctx.fillRect(padding.left + chartWidth + 10, padding.top, 15, 15);
        ctx.fillStyle = '#495057';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('見積', padding.left + chartWidth + 30, padding.top + 12);

        ctx.fillStyle = '#27ae60';
        ctx.fillRect(padding.left + chartWidth + 10, padding.top + 25, 15, 15);
        ctx.fillStyle = '#495057';
        ctx.fillText('実績', padding.left + chartWidth + 30, padding.top + 37);
    }

    // タイトル
    ctx.fillStyle = '#495057';
    ctx.font = isMobile ? 'bold 12px sans-serif' : 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('担当者別 見積 vs 実績 (時間)', width / 2, isMobile ? 18 : 20);
}

// 担当者別工数内訳ドーナツグラフを描画
function drawMemberDonutChart(member, index, filteredEstimates, filteredActuals) {
    const canvasId = `memberDonutChart_${index}`;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // キャンバスのサイズを設定
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const isMobile = width < 768;
    const legendHeight = isMobile ? 60 : 0;
    const centerX = width / 2;
    const centerY = isMobile ? (height - legendHeight) / 2 : height / 2 - 10;

    // キャンバスサイズが小さすぎる場合は描画をスキップ
    const calculatedRadius = isMobile
        ? Math.min(width, height - legendHeight - 40) / 2.5
        : Math.min(width, height - 40) / 2.2;
    const radius = Math.max(calculatedRadius, 10); // 最小半径を10pxに設定

    // 半径計算が負または非常に小さい場合は早期リターン
    if (calculatedRadius <= 0 || width <= 0 || height <= 0) {
        ctx.fillStyle = '#6c757d';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('表示領域不足', Math.max(centerX, 50), Math.max(centerY, 50));
        return;
    }

    const innerRadius = radius * 0.5;

    const processHours = {};
    filteredActuals
        .filter(a => a.member === member)
        .forEach(a => {
            const process = a.process || 'その他';
            processHours[process] = (processHours[process] || 0) + a.hours;
        });

    const processes = Object.keys(processHours);
    if (processes.length === 0) {
        ctx.fillStyle = '#6c757d';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('実績データなし', centerX, centerY);
        return;
    }

    const total = processes.reduce((sum, p) => sum + processHours[p], 0);
    const colorScheme = getActiveChartColorScheme();

    // 工程の色を取得
    const processColors = {
        'UI': '#4dabf7',
        'PG': '#20c997',
        'PT': '#ff922b',
        'IT': '#51cf66',
        'ST': '#f06595',
        'その他': '#ced4da'
    };

    let startAngle = -Math.PI / 2;
    processes.forEach((process) => {
        const angle = (processHours[process] / total) * 2 * Math.PI;
        const endAngle = startAngle + angle;

        ctx.fillStyle = processColors[process] || '#adb5bd';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();

        startAngle = endAngle;
    });

    ctx.fillStyle = '#495057';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total.toFixed(1) + 'h', centerX, centerY);

    // 凡例
    let legendY = isMobile ? centerY + radius + 20 : height - (processes.length * 15) - 10;
    ctx.textAlign = 'left';
    ctx.font = '10px sans-serif';
    processes.forEach(process => {
        ctx.fillStyle = processColors[process] || '#adb5bd';
        ctx.fillRect(10, legendY, 8, 8);
        ctx.fillStyle = '#495057';
        ctx.fillText(`${process}: ${processHours[process].toFixed(1)}h`, 22, legendY + 8);
        legendY += 14;
    });
}

console.log('✅ モジュール report.js loaded');
