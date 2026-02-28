// ============================================
// ダッシュボード機能
// ============================================
// 独立モジュール: state.js と constants.js のみに依存
// 削除手順: このファイル + index.html のタブ/コンテンツ + init.js の import + style.css の Dashboard セクション

import { estimates, actuals, remainingEstimates } from './state.js';
import { PROGRESS, CALCULATIONS } from './constants.js';

// ============================================
// ユーティリティ
// ============================================

/**
 * HTML特殊文字をエスケープする
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================
// KPI集計
// ============================================

/**
 * @typedef {Object} DashboardMetrics
 * @property {number} totalEstimate - 総見積工数
 * @property {number} totalActual - 総実績工数
 * @property {number} variance - 差異（時間）
 * @property {number} variancePercent - 差異（割合）
 * @property {number} progressRate - 全体進捗率
 */

/**
 * 主要KPIを集計する
 * @returns {DashboardMetrics}
 */
function calcDashboardMetrics() {
    const totalEstimate = estimates.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
    const totalActual = actuals.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
    const variance = totalActual - totalEstimate;
    const variancePercent = totalEstimate > 0
        ? Math.round((variance / totalEstimate) * 1000) / 10
        : 0;
    const progressRate = totalEstimate > 0
        ? Math.round((totalActual / totalEstimate) * 1000) / 10
        : 0;

    return { totalEstimate, totalActual, variance, variancePercent, progressRate };
}

/**
 * 数値を表示用にフォーマットする
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
function formatHours(value, decimals = 1) {
    return value.toFixed(decimals);
}

// ============================================
// 変化方向インジケーター
// ============================================

const DASHBOARD_PREV_METRICS_KEY = 'manhour_dashboardPrevMetrics';

/**
 * @typedef {'up' | 'down' | 'none'} TrendDirection
 */

/**
 * 前回のメトリクスをlocalStorageから読み込む
 * @returns {DashboardMetrics | null}
 */
function getPreviousMetrics() {
    try {
        const raw = localStorage.getItem(DASHBOARD_PREV_METRICS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

/**
 * 現在のメトリクスをlocalStorageに保存する
 * @param {DashboardMetrics} metrics
 */
function saveCurrentMetrics(metrics) {
    try {
        localStorage.setItem(DASHBOARD_PREV_METRICS_KEY, JSON.stringify({
            totalEstimate: metrics.totalEstimate,
            totalActual: metrics.totalActual,
            variance: metrics.variance,
            progressRate: metrics.progressRate
        }));
    } catch (e) {
        // localStorageエラーは無視
    }
}

/**
 * 2つの数値を比較してトレンド方向を返す
 * @param {number} current
 * @param {number} previous
 * @returns {TrendDirection}
 */
function getTrendDirection(current, previous) {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'none';
}

/**
 * トレンド方向に対応するHTMLインジケーターを返す
 * @param {TrendDirection} direction
 * @returns {string}
 */
function renderTrendIndicator(direction) {
    if (direction === 'up') return '<span class="dashboard-trend dashboard-trend-up">↑</span>';
    if (direction === 'down') return '<span class="dashboard-trend dashboard-trend-down">↓</span>';
    return '<span class="dashboard-trend dashboard-trend-none">→</span>';
}

// ============================================
// KPIサマリーカード描画
// ============================================

/**
 * KPIサマリーカードセクションのHTMLを返す
 * @param {DashboardMetrics} metrics
 * @param {DashboardMetrics | null} prevMetrics - 前回のメトリクス（変化方向表示用）
 * @returns {string}
 */
function renderSummaryCards(metrics, prevMetrics) {
    const varianceClass = metrics.variance > 0 ? 'dashboard-card-negative' : metrics.variance < 0 ? 'dashboard-card-positive' : '';
    const varianceSign = metrics.variance > 0 ? '+' : '';

    // トレンドインジケーター（前回データがない場合は空文字）
    const estTrend = prevMetrics ? renderTrendIndicator(getTrendDirection(metrics.totalEstimate, prevMetrics.totalEstimate)) : '';
    const actTrend = prevMetrics ? renderTrendIndicator(getTrendDirection(metrics.totalActual, prevMetrics.totalActual)) : '';
    const varTrend = prevMetrics ? renderTrendIndicator(getTrendDirection(Math.abs(metrics.variance), Math.abs(prevMetrics.variance))) : '';
    const progTrend = prevMetrics ? renderTrendIndicator(getTrendDirection(metrics.progressRate, prevMetrics.progressRate)) : '';

    return `
        <div class="dashboard-section">
            <div class="dashboard-grid dashboard-grid-4">
                <div class="dashboard-card dashboard-card-estimate">
                    <h3 class="dashboard-card-label">総見積工数 ${estTrend}</h3>
                    <div class="dashboard-card-value">${formatHours(metrics.totalEstimate)}h</div>
                    <div class="dashboard-card-sub">${formatHours(metrics.totalEstimate / (CALCULATIONS.DAYS_PER_MONTH * CALCULATIONS.HOURS_PER_DAY), 2)} 人月</div>
                </div>
                <div class="dashboard-card dashboard-card-actual">
                    <h3 class="dashboard-card-label">総実績工数 ${actTrend}</h3>
                    <div class="dashboard-card-value">${formatHours(metrics.totalActual)}h</div>
                    <div class="dashboard-card-sub">${formatHours(metrics.totalActual / (CALCULATIONS.DAYS_PER_MONTH * CALCULATIONS.HOURS_PER_DAY), 2)} 人月</div>
                </div>
                <div class="dashboard-card ${varianceClass}">
                    <h3 class="dashboard-card-label">差異 ${varTrend}</h3>
                    <div class="dashboard-card-value">${varianceSign}${formatHours(metrics.variance)}h</div>
                    <div class="dashboard-card-sub">${varianceSign}${metrics.variancePercent}%</div>
                </div>
                <div class="dashboard-card dashboard-card-progress">
                    <h3 class="dashboard-card-label">実績率 ${progTrend}</h3>
                    <div class="dashboard-card-value">${metrics.progressRate}%</div>
                    <div class="dashboard-card-sub">${formatHours(metrics.totalActual)}h / ${formatHours(metrics.totalEstimate)}h</div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// 版数別進捗計算
// ============================================

/**
 * @typedef {Object} VersionProgressResult
 * @property {string} version
 * @property {number} estimatedHours
 * @property {number} actualHours
 * @property {number} remainingHours
 * @property {number} eac
 * @property {number} progressRate
 * @property {string} status - 'completed' | 'ontrack' | 'warning' | 'exceeded' | 'unknown'
 * @property {string} statusLabel
 * @property {string} statusColor
 * @property {number} totalTasks
 * @property {number} completedTasks
 */

/**
 * ステータスを判定する
 * @param {number} estimatedHours
 * @param {number} actualHours
 * @param {number} remainingHours
 * @param {number} eac
 * @returns {{ status: string, statusLabel: string, statusColor: string }}
 */
function determineStatus(estimatedHours, actualHours, remainingHours, eac) {
    if (estimatedHours === 0) {
        return { status: PROGRESS.STATUS.UNKNOWN, statusLabel: '不明', statusColor: PROGRESS.STATUS_COLORS.UNKNOWN };
    }
    if (remainingHours === 0 && actualHours > 0) {
        return { status: PROGRESS.STATUS.COMPLETED, statusLabel: '完了', statusColor: PROGRESS.STATUS_COLORS.COMPLETED };
    }
    if (eac > estimatedHours * PROGRESS.WARNING_THRESHOLD) {
        return { status: PROGRESS.STATUS.EXCEEDED, statusLabel: '超過', statusColor: PROGRESS.STATUS_COLORS.EXCEEDED };
    }
    if (eac > estimatedHours) {
        return { status: PROGRESS.STATUS.WARNING, statusLabel: '注意', statusColor: PROGRESS.STATUS_COLORS.WARNING };
    }
    return { status: PROGRESS.STATUS.ONTRACK, statusLabel: '順調', statusColor: PROGRESS.STATUS_COLORS.ONTRACK };
}

/**
 * 全版数の進捗を計算し、進捗率の昇順でソートして返す
 * @returns {VersionProgressResult[]}
 */
function calcAllVersionProgress() {
    // 版数の一覧を estimates から動的に抽出
    const versions = [...new Set(estimates.map(e => e.version).filter(Boolean))];

    return versions.map(version => {
        const versionEstimates = estimates.filter(e => e.version === version);
        const versionActuals = actuals.filter(a => a.version === version);
        const versionRemaining = remainingEstimates.filter(r => r.version === version);

        const estimatedHours = versionEstimates.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
        const actualHours = versionActuals.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        const remainingHours = versionRemaining.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
        const eac = actualHours + remainingHours;
        const progressRate = estimatedHours > 0
            ? Math.round((actualHours / estimatedHours) * 1000) / 10
            : 0;

        // タスク数の集計
        const uniqueTasks = [...new Set(versionEstimates.map(e => `${e.task}_${e.process}`))];
        const totalTasks = uniqueTasks.length;
        const completedTasks = uniqueTasks.filter(key => {
            const [task, process] = key.split('_');
            const taskRemaining = versionRemaining.filter(r => r.task === task && r.process === process);
            const taskRemainingHours = taskRemaining.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
            const taskActuals = versionActuals.filter(a => a.task === task && a.process === process);
            const taskActualHours = taskActuals.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
            return taskRemainingHours === 0 && taskActualHours > 0;
        }).length;

        const { status, statusLabel, statusColor } = determineStatus(estimatedHours, actualHours, remainingHours, eac);

        return {
            version, estimatedHours, actualHours, remainingHours, eac,
            progressRate, status, statusLabel, statusColor, totalTasks, completedTasks
        };
    }).sort((a, b) => a.progressRate - b.progressRate);
}

/**
 * @typedef {Object} TaskProgressResult
 * @property {string} task
 * @property {string} process
 * @property {number} estimatedHours
 * @property {number} actualHours
 * @property {number} remainingHours
 * @property {number} eac
 * @property {number} progressRate
 * @property {string} status
 * @property {string} statusLabel
 * @property {string} statusColor
 */

/**
 * 指定版数内のタスク別進捗を返す
 * @param {string} version
 * @returns {TaskProgressResult[]}
 */
function calcTaskProgressForVersion(version) {
    const versionEstimates = estimates.filter(e => e.version === version);
    const versionActuals = actuals.filter(a => a.version === version);
    const versionRemaining = remainingEstimates.filter(r => r.version === version);

    // タスク×工程の一意キーを抽出
    const uniqueKeys = [...new Set(versionEstimates.map(e => `${e.task}\t${e.process}`))];

    return uniqueKeys.map(key => {
        const [task, process] = key.split('\t');
        const estimatedHours = versionEstimates
            .filter(e => e.task === task && e.process === process)
            .reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
        const actualHours = versionActuals
            .filter(a => a.task === task && a.process === process)
            .reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
        const remainingHours = versionRemaining
            .filter(r => r.task === task && r.process === process)
            .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
        const eac = actualHours + remainingHours;
        const progressRate = estimatedHours > 0
            ? Math.round((actualHours / estimatedHours) * 1000) / 10
            : 0;

        const { status, statusLabel, statusColor } = determineStatus(estimatedHours, actualHours, remainingHours, eac);

        return { task, process, estimatedHours, actualHours, remainingHours, eac, progressRate, status, statusLabel, statusColor };
    });
}

// ============================================
// 版数別進捗描画
// ============================================

/**
 * 版数別進捗セクションのHTMLを返す
 * @param {VersionProgressResult[]} versionProgress
 * @returns {string}
 */
function renderVersionProgress(versionProgress) {
    if (versionProgress.length === 0) {
        return `
            <div class="dashboard-section">
                <h2 class="dashboard-section-title">版数別進捗</h2>
                <p class="dashboard-empty-message">版数データが登録されていません</p>
            </div>
        `;
    }

    const items = versionProgress.map(vp => {
        const barWidth = Math.min(vp.progressRate, 150);
        const eacLabel = `EAC: ${formatHours(vp.eac)}h / 見積: ${formatHours(vp.estimatedHours)}h`;
        const versionId = escapeHtml(vp.version);
        return `
            <div class="dashboard-version-item" data-status="${vp.status}" data-version="${versionId}">
                <div class="dashboard-version-header dashboard-clickable">
                    <span class="dashboard-version-name">
                        <span class="dashboard-expand-icon">▶</span>
                        ${versionId}
                    </span>
                    <span class="dashboard-version-status" style="color: ${vp.statusColor}">${vp.statusLabel}</span>
                </div>
                <div class="dashboard-progress-bar-container">
                    <div class="dashboard-progress-bar" style="width: ${barWidth}%; background-color: ${vp.statusColor}"></div>
                </div>
                <div class="dashboard-version-details">
                    <span>${vp.progressRate}%</span>
                    <span>${eacLabel}</span>
                    <span>${vp.completedTasks}/${vp.totalTasks} タスク完了</span>
                </div>
                <div class="dashboard-task-breakdown" style="display: none;"></div>
            </div>
        `;
    }).join('');

    return `
        <div class="dashboard-section">
            <h2 class="dashboard-section-title">版数別進捗</h2>
            ${items}
        </div>
    `;
}

/**
 * 版数アイテムのクリックイベントをバインドする
 * @param {Element} container
 */
function bindVersionToggleEvents(container) {
    const headers = container.querySelectorAll('.dashboard-version-header.dashboard-clickable');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.dashboard-version-item');
            if (!item) return;
            const version = item.dataset.version;
            const breakdown = item.querySelector('.dashboard-task-breakdown');
            const icon = header.querySelector('.dashboard-expand-icon');
            if (!breakdown) return;

            const isExpanded = breakdown.style.display !== 'none';
            if (isExpanded) {
                breakdown.style.display = 'none';
                if (icon) icon.textContent = '▶';
                item.classList.remove('dashboard-version-expanded');
            } else {
                // タスク内訳を計算して描画
                const tasks = calcTaskProgressForVersion(version);
                breakdown.innerHTML = renderTaskBreakdown(tasks);
                breakdown.style.display = 'block';
                if (icon) icon.textContent = '▼';
                item.classList.add('dashboard-version-expanded');
            }
        });
    });
}

/**
 * タスク内訳のHTMLを返す
 * @param {TaskProgressResult[]} tasks
 * @returns {string}
 */
function renderTaskBreakdown(tasks) {
    if (tasks.length === 0) {
        return '<p class="dashboard-empty-message">タスクがありません</p>';
    }

    const rows = tasks.map(t => `
        <tr class="dashboard-task-row" data-status="${t.status}">
            <td class="dashboard-task-name">${escapeHtml(t.task)}</td>
            <td class="dashboard-task-process">${escapeHtml(t.process)}</td>
            <td class="dashboard-task-hours">${formatHours(t.estimatedHours)}h</td>
            <td class="dashboard-task-hours">${formatHours(t.actualHours)}h</td>
            <td class="dashboard-task-hours">${formatHours(t.remainingHours)}h</td>
            <td class="dashboard-task-status" style="color: ${t.statusColor}">${t.statusLabel}</td>
        </tr>
    `).join('');

    return `
        <table class="dashboard-task-table">
            <thead>
                <tr>
                    <th>対応名</th>
                    <th>工程</th>
                    <th>見積</th>
                    <th>実績</th>
                    <th>残</th>
                    <th>状態</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

// ============================================
// アラート検出
// ============================================

/**
 * @typedef {'overrun' | 'anomaly'} AlertType
 */

/**
 * @typedef {Object} AlertItem
 * @property {AlertType} type
 * @property {string} version
 * @property {string} task
 * @property {number} estimatedHours
 * @property {number} actualHours
 * @property {number} overrunPercent - 超過率(%)
 */

/**
 * アラート対象タスクを検出し、超過率の降順でソートして返す
 * @returns {AlertItem[]}
 */
function detectAlerts() {
    // 版数×タスク単位で集計
    /** @type {Map<string, { version: string, task: string, estimated: number, actual: number }>} */
    const taskMap = new Map();

    for (const e of estimates) {
        if (!e.version || !e.task) continue;
        const key = `${e.version}\t${e.task}`;
        if (!taskMap.has(key)) {
            taskMap.set(key, { version: e.version, task: e.task, estimated: 0, actual: 0 });
        }
        taskMap.get(key).estimated += Number(e.hours) || 0;
    }

    for (const a of actuals) {
        if (!a.version || !a.task) continue;
        const key = `${a.version}\t${a.task}`;
        if (!taskMap.has(key)) {
            taskMap.set(key, { version: a.version, task: a.task, estimated: 0, actual: 0 });
        }
        taskMap.get(key).actual += Number(a.hours) || 0;
    }

    /** @type {AlertItem[]} */
    const alerts = [];

    for (const entry of taskMap.values()) {
        if (entry.estimated <= 0) continue;
        const ratio = entry.actual / entry.estimated;
        const overrunPercent = Math.round((ratio - 1) * 1000) / 10;

        // 超過アラート: 実績 ÷ 見積 ≥ 1.2（120%）
        if (ratio >= PROGRESS.WARNING_THRESHOLD) {
            alerts.push({
                type: 'overrun',
                version: entry.version,
                task: entry.task,
                estimatedHours: entry.estimated,
                actualHours: entry.actual,
                overrunPercent
            });
        }
        // 異常値警告: 乖離率50%以上（超過アラートと重複しない）
        else if (Math.abs(ratio - 1) >= 0.5) {
            alerts.push({
                type: 'anomaly',
                version: entry.version,
                task: entry.task,
                estimatedHours: entry.estimated,
                actualHours: entry.actual,
                overrunPercent
            });
        }
    }

    // 超過率の降順（重要度順）でソート
    return alerts.sort((a, b) => b.overrunPercent - a.overrunPercent);
}

// ============================================
// アラート描画
// ============================================

/**
 * アラートセクションのHTMLを返す
 * @param {AlertItem[]} alerts
 * @returns {string}
 */
function renderAlerts(alerts) {
    if (alerts.length === 0) {
        return `
            <div class="dashboard-section">
                <h2 class="dashboard-section-title">アラート</h2>
                <div class="dashboard-alert-ok">
                    <span class="dashboard-alert-ok-icon">✓</span>
                    問題なし — すべてのタスクが正常範囲内です
                </div>
            </div>
        `;
    }

    const items = alerts.map(alert => {
        const typeClass = alert.type === 'overrun' ? 'dashboard-alert-overrun' : 'dashboard-alert-anomaly';
        const typeLabel = alert.type === 'overrun' ? '超過' : '異常値';
        const sign = alert.overrunPercent > 0 ? '+' : '';
        return `
            <div class="dashboard-alert-item ${typeClass}" data-alert-version="${escapeHtml(alert.version)}" data-alert-task="${escapeHtml(alert.task)}">
                <div class="dashboard-alert-header dashboard-clickable">
                    <span class="dashboard-expand-icon">▶</span>
                    <span class="dashboard-alert-badge">${typeLabel}</span>
                    <span class="dashboard-alert-version">${escapeHtml(alert.version)}</span>
                    <span class="dashboard-alert-task">${escapeHtml(alert.task)}</span>
                    <span class="dashboard-alert-percent">${sign}${alert.overrunPercent}%</span>
                </div>
                <div class="dashboard-alert-detail">
                    見積: ${formatHours(alert.estimatedHours)}h → 実績: ${formatHours(alert.actualHours)}h
                </div>
                <div class="dashboard-alert-breakdown" style="display: none;"></div>
            </div>
        `;
    }).join('');

    return `
        <div class="dashboard-section">
            <h2 class="dashboard-section-title">アラート <span class="dashboard-alert-count">${alerts.length}件</span></h2>
            ${items}
        </div>
    `;
}

/**
 * アラート項目の工程別内訳データを取得する
 * @param {string} version
 * @param {string} task
 * @returns {{ process: string, member: string, estimated: number, actual: number }[]}
 */
function getAlertTaskDetail(version, task) {
    /** @type {Map<string, { process: string, member: string, estimated: number, actual: number }>} */
    const detailMap = new Map();

    const taskEstimates = estimates.filter(e => e.version === version && e.task === task);
    for (const e of taskEstimates) {
        const key = `${e.process || ''}\t${e.member || ''}`;
        if (!detailMap.has(key)) {
            detailMap.set(key, { process: e.process || '', member: e.member || '', estimated: 0, actual: 0 });
        }
        detailMap.get(key).estimated += Number(e.hours) || 0;
    }

    const taskActuals = actuals.filter(a => a.version === version && a.task === task);
    for (const a of taskActuals) {
        const key = `${a.process || ''}\t${a.member || ''}`;
        if (!detailMap.has(key)) {
            detailMap.set(key, { process: a.process || '', member: a.member || '', estimated: 0, actual: 0 });
        }
        detailMap.get(key).actual += Number(a.hours) || 0;
    }

    return [...detailMap.values()];
}

/**
 * アラート内訳のHTMLを返す
 * @param {{ process: string, member: string, estimated: number, actual: number }[]} details
 * @returns {string}
 */
function renderAlertBreakdown(details) {
    if (details.length === 0) {
        return '<p class="dashboard-empty-message">詳細データがありません</p>';
    }

    const rows = details.map(d => {
        const diff = d.actual - d.estimated;
        const diffSign = diff > 0 ? '+' : '';
        const diffClass = diff > 0 ? 'dashboard-alert-diff-over' : '';
        return `
            <tr>
                <td>${escapeHtml(d.process)}</td>
                <td>${escapeHtml(d.member)}</td>
                <td class="dashboard-task-hours">${formatHours(d.estimated)}h</td>
                <td class="dashboard-task-hours">${formatHours(d.actual)}h</td>
                <td class="dashboard-task-hours ${diffClass}">${diffSign}${formatHours(diff)}h</td>
            </tr>
        `;
    }).join('');

    return `
        <table class="dashboard-task-table">
            <thead>
                <tr>
                    <th>工程</th>
                    <th>担当</th>
                    <th>見積</th>
                    <th>実績</th>
                    <th>差異</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

/**
 * アラート項目のクリックイベントをバインドする
 * @param {Element} container
 */
function bindAlertToggleEvents(container) {
    const headers = container.querySelectorAll('.dashboard-alert-header.dashboard-clickable');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.dashboard-alert-item');
            if (!item) return;
            const version = item.dataset.alertVersion;
            const task = item.dataset.alertTask;
            const breakdown = item.querySelector('.dashboard-alert-breakdown');
            const icon = header.querySelector('.dashboard-expand-icon');
            if (!breakdown) return;

            const isExpanded = breakdown.style.display !== 'none';
            if (isExpanded) {
                breakdown.style.display = 'none';
                if (icon) icon.textContent = '▶';
                item.classList.remove('dashboard-alert-expanded');
            } else {
                const details = getAlertTaskDetail(version, task);
                breakdown.innerHTML = renderAlertBreakdown(details);
                breakdown.style.display = 'block';
                if (icon) icon.textContent = '▼';
                item.classList.add('dashboard-alert-expanded');
            }
        });
    });
}

// ============================================
// 担当者別ワークロード
// ============================================

/**
 * @typedef {Object} MemberWorkload
 * @property {string} member
 * @property {number} estimatedHours
 * @property {number} actualHours
 * @property {number|null} accuracyPercent - 見積精度(%)
 * @property {boolean} isOverCapacity - キャパシティ超過フラグ
 */

/**
 * 全担当者のワークロードを集計して返す
 * @returns {MemberWorkload[]}
 */
function calcMemberWorkload() {
    /** @type {Map<string, { estimated: number, actual: number }>} */
    const memberMap = new Map();

    for (const e of estimates) {
        const m = e.member || '';
        if (!m) continue;
        if (!memberMap.has(m)) memberMap.set(m, { estimated: 0, actual: 0 });
        memberMap.get(m).estimated += Number(e.hours) || 0;
    }

    for (const a of actuals) {
        const m = a.member || '';
        if (!m) continue;
        if (!memberMap.has(m)) memberMap.set(m, { estimated: 0, actual: 0 });
        memberMap.get(m).actual += Number(a.hours) || 0;
    }

    const capacity = CALCULATIONS.HOURS_PER_MAN_MONTH;

    return [...memberMap.entries()].map(([member, data]) => ({
        member,
        estimatedHours: data.estimated,
        actualHours: data.actual,
        accuracyPercent: data.estimated > 0
            ? Math.round((data.actual / data.estimated) * 1000) / 10
            : null,
        isOverCapacity: data.actual > capacity
    })).sort((a, b) => b.actualHours - a.actualHours);
}

/**
 * 担当者別ワークロードセクションのHTMLを返す
 * @param {MemberWorkload[]} workloads
 * @returns {string}
 */
function renderMemberWorkload(workloads) {
    if (workloads.length === 0) {
        return `
            <div class="dashboard-section">
                <h2 class="dashboard-section-title">担当者別ワークロード</h2>
                <p class="dashboard-empty-message">担当者データがありません</p>
            </div>
        `;
    }

    // バーの最大値を算出（見積と実績の大きい方）
    const maxHours = Math.max(...workloads.map(w => Math.max(w.estimatedHours, w.actualHours)), 1);

    const items = workloads.map(w => {
        const estWidth = (w.estimatedHours / maxHours) * 100;
        const actWidth = (w.actualHours / maxHours) * 100;
        const overClass = w.isOverCapacity ? ' dashboard-member-over' : '';
        const accuracyText = w.accuracyPercent !== null ? `${w.accuracyPercent}%` : '-';
        return `
            <div class="dashboard-member-item${overClass}" data-member="${escapeHtml(w.member)}">
                <div class="dashboard-member-header dashboard-clickable">
                    <span class="dashboard-expand-icon">▶</span>
                    <span class="dashboard-member-name">${escapeHtml(w.member)}</span>
                    ${w.isOverCapacity ? '<span class="dashboard-member-warning">超過</span>' : ''}
                    <span class="dashboard-member-accuracy">精度: ${accuracyText}</span>
                </div>
                <div class="dashboard-member-bars">
                    <div class="dashboard-member-bar-row">
                        <span class="dashboard-member-bar-label">見積</span>
                        <div class="dashboard-member-bar-track">
                            <div class="dashboard-member-bar dashboard-member-bar-est" style="width: ${estWidth}%"></div>
                        </div>
                        <span class="dashboard-member-bar-value">${formatHours(w.estimatedHours)}h</span>
                    </div>
                    <div class="dashboard-member-bar-row">
                        <span class="dashboard-member-bar-label">実績</span>
                        <div class="dashboard-member-bar-track">
                            <div class="dashboard-member-bar dashboard-member-bar-act${overClass}" style="width: ${actWidth}%"></div>
                        </div>
                        <span class="dashboard-member-bar-value">${formatHours(w.actualHours)}h</span>
                    </div>
                </div>
                <div class="dashboard-member-breakdown" style="display: none;"></div>
            </div>
        `;
    }).join('');

    return `
        <div class="dashboard-section">
            <h2 class="dashboard-section-title">担当者別ワークロード</h2>
            ${items}
        </div>
    `;
}

/**
 * 担当者のタスク別実績一覧を取得する
 * @param {string} member
 * @returns {{ version: string, task: string, hours: number, date: string }[]}
 */
function getMemberTaskDetails(member) {
    return actuals
        .filter(a => a.member === member)
        .map(a => ({
            version: a.version || '',
            task: a.task || '',
            hours: Number(a.hours) || 0,
            date: a.date || ''
        }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * 担当者実績内訳のHTMLを返す
 * @param {{ version: string, task: string, hours: number, date: string }[]} details
 * @returns {string}
 */
function renderMemberBreakdown(details) {
    if (details.length === 0) {
        return '<p class="dashboard-empty-message">実績データがありません</p>';
    }

    const rows = details.map(d => `
        <tr>
            <td>${escapeHtml(d.date)}</td>
            <td>${escapeHtml(d.version)}</td>
            <td>${escapeHtml(d.task)}</td>
            <td class="dashboard-task-hours">${formatHours(d.hours)}h</td>
        </tr>
    `).join('');

    return `
        <table class="dashboard-task-table">
            <thead>
                <tr>
                    <th>日付</th>
                    <th>版数</th>
                    <th>対応名</th>
                    <th>工数</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

/**
 * 担当者アイテムのクリックイベントをバインドする
 * @param {Element} container
 */
function bindMemberToggleEvents(container) {
    const headers = container.querySelectorAll('.dashboard-member-header.dashboard-clickable');
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.dashboard-member-item');
            if (!item) return;
            const member = item.dataset.member;
            const breakdown = item.querySelector('.dashboard-member-breakdown');
            const icon = header.querySelector('.dashboard-expand-icon');
            if (!breakdown) return;

            const isExpanded = breakdown.style.display !== 'none';
            if (isExpanded) {
                breakdown.style.display = 'none';
                if (icon) icon.textContent = '▶';
                item.classList.remove('dashboard-member-expanded');
            } else {
                const details = getMemberTaskDetails(member);
                breakdown.innerHTML = renderMemberBreakdown(details);
                breakdown.style.display = 'block';
                if (icon) icon.textContent = '▼';
                item.classList.add('dashboard-member-expanded');
            }
        });
    });
}

// ============================================
// 活動履歴フィード
// ============================================

/**
 * 直近の活動履歴セクションのHTMLを返す
 * @returns {string}
 */
function renderRecentActivity() {
    // 実績データを日付降順でソートし直近10件を取得
    const sorted = [...actuals]
        .filter(a => a.date)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 10);

    // 直近7日間に実績があるか判定
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
    const hasRecentActivity = actuals.some(a => a.date && a.date >= sevenDaysAgoStr);

    if (sorted.length === 0) {
        return `
            <div class="dashboard-section">
                <h2 class="dashboard-section-title">直近の活動</h2>
                <p class="dashboard-empty-message">実績データがありません</p>
            </div>
        `;
    }

    const warning = !hasRecentActivity
        ? '<div class="dashboard-activity-warning">直近7日間に実績入力がありません</div>'
        : '';

    const items = sorted.map(a => `
        <div class="dashboard-activity-item">
            <span class="dashboard-activity-date">${escapeHtml(a.date || '')}</span>
            <span class="dashboard-activity-member">${escapeHtml(a.member || '')}</span>
            <span class="dashboard-activity-task">${escapeHtml(a.task || '')}</span>
            <span class="dashboard-activity-hours">${formatHours(Number(a.hours) || 0)}h</span>
        </div>
    `).join('');

    return `
        <div class="dashboard-section">
            <h2 class="dashboard-section-title">直近の活動</h2>
            ${warning}
            ${items}
        </div>
    `;
}

// ============================================
// メイン描画
// ============================================

/**
 * ダッシュボード全体を描画する
 * タブ切替時に呼び出されるエントリポイント
 */
export function renderDashboard() {
    const container = document.querySelector('#dashboard .dashboard-container');
    if (!container) return;

    try {
        // データが存在しない場合は空状態を表示
        if (!estimates || estimates.length === 0) {
            container.innerHTML = renderEmptyState();
            return;
        }

        // KPI集計
        const metrics = calcDashboardMetrics();
        const prevMetrics = getPreviousMetrics();

        // 版数別進捗
        const versionProgress = calcAllVersionProgress();

        // アラート検出
        const alerts = detectAlerts();

        // 担当者別ワークロード
        const workloads = calcMemberWorkload();

        // 各セクションを組み立て
        const panelRow = `<div class="dashboard-panels">${renderAlerts(alerts)}${renderMemberWorkload(workloads)}</div>`;
        const sections = [
            renderSummaryCards(metrics, prevMetrics),
            renderVersionProgress(versionProgress),
            panelRow,
            renderRecentActivity(),
        ];

        container.innerHTML = `<div class="dashboard-content">${sections.join('')}</div>`;

        // クリックでインライン展開/折りたたみ
        bindVersionToggleEvents(container);
        bindAlertToggleEvents(container);
        bindMemberToggleEvents(container);

        // 現在のメトリクスを保存（次回表示時の変化方向比較用）
        saveCurrentMetrics(metrics);
    } catch (e) {
        console.error('ダッシュボード描画エラー:', e);
        container.innerHTML = `
            <div class="dashboard-content">
                <p style="padding: 40px; text-align: center; color: #e74c3c;">
                    ダッシュボードの表示中にエラーが発生しました
                </p>
            </div>
        `;
    }
}

/**
 * データなし時の空状態メッセージを返す
 * @returns {string} HTML文字列
 */
function renderEmptyState() {
    return `
        <div class="dashboard-empty-state">
            <div class="dashboard-empty-icon">📊</div>
            <h3>データがありません</h3>
            <p>見積データを登録すると、ダッシュボードに集計情報が表示されます。</p>
            <p style="margin-top: 12px;">
                <button onclick="showTab('quick')" class="dashboard-empty-action">クイック入力へ</button>
            </p>
        </div>
    `;
}
