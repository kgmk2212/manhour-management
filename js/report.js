// ============================================
// レポート設定関連機能
// ============================================

import {
    reportSettings,
    setReportSettings,
    estimates,
    actuals,
    remainingEstimates,
    currentThemeColor
} from './state.js';

// ============================================
// レポート設定
// ============================================

export function loadReportSettings() {
    const saved = localStorage.getItem('reportSettings');
    if (saved) {
        const loadedSettings = JSON.parse(saved);
        setReportSettings(loadedSettings);
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

    // State経由で設定（setDebugModeEnabledがあれば）
    if (typeof window.setDebugModeEnabled === 'function') {
        window.setDebugModeEnabled(isEnabled);
    }

    const checkbox = document.getElementById('debugModeEnabled');
    if (checkbox) checkbox.checked = isEnabled;
}

export function saveDebugModeSetting() {
    const checkbox = document.getElementById('debugModeEnabled');
    const isEnabled = checkbox ? checkbox.checked : false;

    if (typeof window.setDebugModeEnabled === 'function') {
        window.setDebugModeEnabled(isEnabled);
    }
    localStorage.setItem('debugModeEnabled', isEnabled);
}

// ============================================
// 進捗管理関連機能
// ============================================

// 対応単位での進捗情報を計算
export function calculateProgress(version, task, process = null, member = null) {
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

    return {
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
                font-size: 11px;
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
        ontrack:   { bg: '#e3f2fd', color: '#1976d2', icon: String.fromCharCode(8594) },
        warning:   { bg: '#fff3e0', color: '#f57c00', icon: String.fromCharCode(9888) },
        exceeded:  { bg: '#fce4ec', color: '#c2185b', icon: '!' },
        unknown:   { bg: '#f5f5f5', color: '#999', icon: '?' }
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

    const currentValue = select.value;
    select.innerHTML = '<option value="all">全版数</option>';
    versions.forEach(v => {
        select.innerHTML += `<option value="${v}">${v}</option>`;
    });
    select.value = currentValue || 'all';

    if (bulkSelect) {
        const bulkCurrentValue = bulkSelect.value;
        bulkSelect.innerHTML = '<option value="all">全版数</option>';
        versions.forEach(v => {
            bulkSelect.innerHTML += `<option value="${v}">${v}</option>`;
        });
        bulkSelect.value = bulkCurrentValue || 'all';
    }
}

// サマリーカードをレンダリング
export function renderProgressSummaryCards(versionFilter) {
    const container = document.getElementById('progressSummaryCards');
    if (!container) return;

    // フィルタリング
    let targetVersions = versionFilter === 'all'
        ? [...new Set([...estimates.map(e => e.version), ...actuals.map(a => a.version)])]
            .filter(v => v && v.trim() !== '')
        : [versionFilter];

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
            <div style="font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 5px;">
                ${completedTasks}/${totalTasks} 対応完了
            </div>
        </div>
        <div class="stat-card theme-bg theme-${currentThemeColor}">
            <h3>予測総工数</h3>
            <div class="value">${totalEac.toFixed(1)}h</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.8); margin-top: 5px;">
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
    let targetVersions = versionFilter === 'all'
        ? [...new Set([...estimates.map(e => e.version), ...actuals.map(a => a.version)])]
            .filter(v => v && v.trim() !== '').sort()
        : [versionFilter];

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
                            ? `<span style="font-size: 11px; color: ${progress.variance > 0 ? '#e74c3c' : '#27ae60'};">
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
    let targetVersions = versionFilter === 'all'
        ? [...new Set([...estimates.map(e => e.version), ...actuals.map(a => a.version)])]
            .filter(v => v && v.trim() !== '').sort()
        : [versionFilter];

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

console.log('✅ モジュール report.js loaded');
