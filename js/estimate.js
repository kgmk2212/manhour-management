// ============================================
// 見積管理モジュール (estimate.js)
// ============================================

import {
    estimates, actuals, filteredEstimates, remainingEstimates,
    setEstimates, setFilteredEstimates,
    estimateEditMode, setEstimateEditMode,
    workMonthSelectionMode, setWorkMonthSelectionMode,
    selectedEstimateIds,
    currentThemeColor,
    showMonthColorsSetting,
    monthColors
} from './state.js';

import {
    normalizeEstimate,
    generateMonthRange,
    generateMonthOptions,
    getMonthColor,
    generateMonthColorLegend,
    showAlert,
    sortMembers
} from './utils.js';

// ============================================
// 月の実働日数計算
// ============================================

/**
 * 月の実働日数を計算（土日祝日・会社休日を除く）
 */
export function getWorkingDays(year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    let workingDays = 0;

    for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

        // window経由で祝日・会社休日判定関数を呼び出し
        const holiday = typeof window.getHoliday === 'function' ? window.getHoliday(dateStr) : null;
        const companyHol = typeof window.isCompanyHoliday === 'function' ? window.isCompanyHoliday(dateStr) : false;

        if (!isWeekend && !holiday && !companyHol) {
            workingDays++;
        }
    }

    return workingDays;
}

/**
 * 現在の年月の実働日数を取得（デフォルト値として使用）
 */
export function getCurrentMonthWorkingDays() {
    const now = new Date();
    return getWorkingDays(now.getFullYear(), now.getMonth() + 1);
}

/**
 * 数値を整数表示（小数点以下が0の場合）または小数表示
 */
export function formatNumber(num, decimals = 1) {
    const rounded = parseFloat(num.toFixed(decimals));
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(decimals);
}

/**
 * 実績または見積が「その他付随作業」かどうかを判定
 */
export function isOtherWork(item) {
    const hasVersion = item.version && item.version.trim() !== '';
    const hasTask = item.task && item.task.trim() !== '';
    return !hasVersion || !hasTask;
}

// ============================================
// デフォルト作業月の計算
// ============================================

/**
 * ウォーターフォール方式でデフォルトの作業月を計算
 */
export function calculateDefaultWorkMonths(startMonth, endMonth) {
    if (!startMonth || !endMonth) return [];

    const months = generateMonthRange(startMonth, endMonth);
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const result = [];

    processes.forEach((process, index) => {
        const monthIndex = Math.floor(index * months.length / processes.length);
        const assignedMonth = months[monthIndex];
        result.push({
            process: process,
            startMonth: assignedMonth,
            endMonth: assignedMonth
        });
    });

    return result;
}

// ============================================
// 見込残存時間管理
// ============================================

/**
 * 見込残存時間を保存/更新する関数
 */
export function saveRemainingEstimate(version, task, process, member, remainingHours) {
    const existingIndex = remainingEstimates.findIndex(r =>
        r.version === version &&
        r.task === task &&
        r.process === process &&
        r.member === member
    );

    const record = {
        id: existingIndex >= 0 ? remainingEstimates[existingIndex].id : Date.now() + Math.random(),
        version: version,
        task: task,
        process: process,
        member: member,
        remainingHours: remainingHours,
        updatedAt: new Date().toISOString(),
        note: ''
    };

    if (existingIndex >= 0) {
        remainingEstimates[existingIndex] = record;
    } else {
        remainingEstimates.push(record);
    }
}

/**
 * 見込残存時間を取得する関数
 */
export function getRemainingEstimate(version, task, process, member) {
    return remainingEstimates.find(r =>
        r.version === version &&
        r.task === task &&
        r.process === process &&
        r.member === member
    );
}

// ============================================
// 見積一覧レンダリング
// ============================================

/**
 * 見積一覧のメイン描画関数
 */
export function renderEstimateList() {
    const container = document.getElementById('estimateList');
    if (!container) return;

    const viewTypeElement = document.getElementById('estimateViewType');
    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const versionFilterElement = document.getElementById('estimateVersionFilter');

    if (!viewTypeElement || !monthFilterElement) return;

    const viewType = viewTypeElement.value;
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';
    const monthFilter = monthFilterElement.value;
    const versionFilter = versionFilterElement ? versionFilterElement.value : 'all';

    if (estimates.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">見積データがありません</p>';
        const totalHoursElement = document.getElementById('estimateTotalHours');
        const totalManpowerElement = document.getElementById('estimateTotalManpower');
        if (totalHoursElement) totalHoursElement.textContent = '0h';
        if (totalManpowerElement) totalManpowerElement.textContent = '0人日 / 0人月';
        const memberSummaryContainer = document.getElementById('estimateMemberSummary');
        if (memberSummaryContainer) memberSummaryContainer.style.display = 'none';
        return;
    }

    // フィルタを適用
    let filtered = estimates;

    if (filterType === 'version') {
        if (versionFilter !== 'all') {
            filtered = estimates.filter(e => e.version === versionFilter);
        }
    } else {
        if (monthFilter !== 'all') {
            filtered = estimates.filter(e => {
                const est = normalizeEstimate(e);
                if (!est.workMonths || est.workMonths.length === 0) {
                    return true;
                }
                return est.workMonths.includes(monthFilter);
            });
        }
    }

    // グローバル変数を更新
    setFilteredEstimates(filtered);

    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">選択した期間に見積データがありません</p>';
        const totalHoursElement = document.getElementById('estimateTotalHours');
        const totalManpowerElement = document.getElementById('estimateTotalManpower');
        if (totalHoursElement) totalHoursElement.textContent = '0h';
        if (totalManpowerElement) totalManpowerElement.textContent = '0人日 / 0人月';
        const memberSummaryContainer = document.getElementById('estimateMemberSummary');
        if (memberSummaryContainer) memberSummaryContainer.style.display = 'none';
        return;
    }

    // 合計工数を計算
    let totalHours = 0;
    if (filterType === 'version') {
        totalHours = filtered.reduce((sum, e) => sum + e.hours, 0);
    } else {
        if (monthFilter === 'all') {
            totalHours = filtered.reduce((sum, e) => sum + e.hours, 0);
        } else {
            filtered.forEach(e => {
                const est = normalizeEstimate(e);
                if (est.monthlyHours && est.monthlyHours[monthFilter]) {
                    totalHours += est.monthlyHours[monthFilter];
                } else if (!est.workMonths || est.workMonths.length === 0) {
                    totalHours += est.hours;
                }
            });
        }
    }

    // 人日・人月を計算
    let workingDaysPerMonth = 20;
    if (monthFilter !== 'all') {
        const [year, month] = monthFilter.split('-');
        const calculatedDays = getWorkingDays(parseInt(year), parseInt(month));
        workingDaysPerMonth = calculatedDays > 0 ? calculatedDays : 20;
    }
    const totalManDays = (totalHours / 8).toFixed(1);
    const totalManMonths = (totalHours / 8 / workingDaysPerMonth).toFixed(2);

    // 合計を表示
    const totalHoursElement = document.getElementById('estimateTotalHours');
    const totalManpowerElement = document.getElementById('estimateTotalManpower');
    if (totalHoursElement) totalHoursElement.textContent = totalHours.toFixed(1) + 'h';
    if (totalManpowerElement) totalManpowerElement.textContent = `${totalManDays}人日 / ${totalManMonths}人月`;

    // 換算基準を表示
    const conversionParams = document.getElementById('estimateConversionParams');
    if (conversionParams) {
        let workDaysLabel = 'デフォルト20日';
        if (filterType === 'month' && monthFilter !== 'all') {
            const [year, month] = monthFilter.split('-');
            const calculatedDays = getWorkingDays(parseInt(year), parseInt(month));
            const days = calculatedDays > 0 ? calculatedDays : 20; // Use calculatedDays if valid, else 20. But logic above used calculatedDays or 20. 
            // Reuse logic:
            workDaysLabel = `${year}年${parseInt(month)}月の営業日数（${workingDaysPerMonth}日）`;
        }
        conversionParams.innerHTML = `<strong>換算基準:</strong> 1人日 = 8h、1人月 = ${workingDaysPerMonth}人日（${workDaysLabel}）`;
        conversionParams.style.display = 'block';
    }



    // 合計カードにテーマカラーのグラデーションを適用
    const totalCard = document.getElementById('estimateTotalCard');
    if (totalCard) {
        const gradients = {
            'purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'deep-blue': 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
            'teal': 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
            'cyan': 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
            'ocean': 'linear-gradient(135deg, #0c4a6e 0%, #075985 100%)',
            'sky': 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
            'indigo': 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
            'navy': 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
            'slate': 'linear-gradient(135deg, #334155 0%, #475569 100%)',
            'green': 'linear-gradient(135deg, #047857 0%, #059669 100%)',
            'emerald': 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
        };
        totalCard.style.background = gradients[currentThemeColor] || gradients['purple'];
    }

    // 担当者別の合計を集計
    const memberSummary = {};
    filtered.forEach(e => {
        const est = normalizeEstimate(e);
        const member = est.member || '未設定';

        if (!memberSummary[member]) {
            memberSummary[member] = 0;
        }

        if (filterType === 'version') {
            memberSummary[member] += est.hours;
        } else {
            if (monthFilter === 'all') {
                memberSummary[member] += est.hours;
            } else if (est.monthlyHours && est.monthlyHours[monthFilter]) {
                memberSummary[member] += est.monthlyHours[monthFilter];
            } else if (!est.workMonths || est.workMonths.length === 0) {
                memberSummary[member] += est.hours;
            }
        }
    });

    // 担当者別合計を表示
    const memberSummaryContainer = document.getElementById('estimateMemberSummary');
    const memberSummaryContent = document.getElementById('estimateMemberSummaryContent');
    if (memberSummaryContainer && memberSummaryContent) {
        const memberSet = new Set(Object.keys(memberSummary));
        let sortedMembers = [];
        const memberOrderElement = document.getElementById('memberOrder');
        const memberOrderInput = memberOrderElement ? memberOrderElement.value.trim() : '';

        sortedMembers = sortMembers(Array.from(memberSet), memberOrderInput);

        if (sortedMembers.length > 0) {
            memberSummaryContainer.style.display = 'block';
            const themeColors = {
                'purple': '#667eea',
                'deep-blue': '#1e3c72',
                'teal': '#0f766e',
                'cyan': '#0891b2',
                'ocean': '#0c4a6e',
                'sky': '#0369a1',
                'indigo': '#4338ca',
                'navy': '#1e40af',
                'slate': '#334155',
                'green': '#047857',
                'emerald': '#059669'
            };
            const borderColor = themeColors[currentThemeColor] || '#667eea';

            let memberHtml = '';
            sortedMembers.forEach(member => {
                const hours = memberSummary[member];
                const days = (hours / 8).toFixed(1);
                const months = (hours / 8 / workingDaysPerMonth).toFixed(2);
                memberHtml += `
                    <div style="background: white; padding: 10px 15px; border-radius: 6px; border-left: 4px solid ${borderColor}; min-width: 150px;">
                        <div style="font-size: 13px; color: #666; margin-bottom: 3px;">${member}</div>
                        <div style="font-size: 18px; font-weight: 700; color: #333;">${hours.toFixed(1)}h</div>
                        <div style="font-size: 12px; color: #666; font-weight: 500;">${days}人日 / ${months}人月</div>
                    </div>
                `;
            });
            memberSummaryContent.innerHTML = memberHtml;
        } else {
            memberSummaryContainer.style.display = 'none';
        }
    }

    if (viewType === 'grouped') {
        renderEstimateGrouped();
    } else if (viewType === 'matrix') {
        renderEstimateMatrix();
    } else {
        renderEstimateDetailList();
    }

    // セグメントボタンのハイライトを更新
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }
}

/**
 * グループ形式での見積一覧描画
 */
export function renderEstimateGrouped() {
    const container = document.getElementById('estimateList');

    function getTaskWorkMonths(version, task) {
        const taskEstimates = estimates.filter(e => e.version === version && e.task === task);
        const allMonths = new Set();
        taskEstimates.forEach(e => {
            const est = normalizeEstimate(e);
            if (est.workMonths && est.workMonths.length > 0) {
                est.workMonths.forEach(month => allMonths.add(month));
            }
        });
        return Array.from(allMonths).sort();
    }

    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const workMonthFilter = monthFilterElement ? monthFilterElement.value : 'all';
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';

    let workingDaysPerMonth = 20;
    if (filterType === 'month' && workMonthFilter !== 'all') {
        const [year, month] = workMonthFilter.split('-');
        const calculatedDays = getWorkingDays(parseInt(year), parseInt(month));
        workingDaysPerMonth = calculatedDays > 0 ? calculatedDays : 20;
    }

    if (filteredEstimates.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">該当する見積データがありません</p>';
        return;
    }

    const allDisplayEstimates = filteredEstimates;

    // 版数ごとにグループ化
    const versionGroups = {};
    allDisplayEstimates.forEach(e => {
        if (!versionGroups[e.version]) {
            versionGroups[e.version] = {};
        }
        const taskKey = e.task;
        if (!versionGroups[e.version][taskKey]) {
            versionGroups[e.version][taskKey] = {
                task: e.task,
                processes: []
            };
        }

        const est = normalizeEstimate(e);
        let displayHours = e.hours;
        if (filterType === 'month' && workMonthFilter !== 'all' && est.monthlyHours && est.monthlyHours[workMonthFilter]) {
            displayHours = est.monthlyHours[workMonthFilter];
        }

        versionGroups[e.version][taskKey].processes.push({
            process: e.process,
            member: e.member,
            hours: displayHours,
            id: e.id
        });
    });

    let html = '<div style="margin-bottom: 30px;">';

    // 換算基準は共通エリアに表示するため、ここでは表示しない
    // html += `<div style="background: #e3f2fd; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; color: #1565c0;">
    //    <strong>換算基準:</strong> 1人日 = 8h、1人月 = ${workingDaysPerMonth}人日（${workDaysLabel}）
    // </div>`;

    Object.keys(versionGroups).sort().forEach(version => {
        html += `<div style="margin-bottom: 30px;">`;
        html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${version}</h3>`;
        html += '<div class="table-wrapper"><table class="estimate-grouped">';

        if (workMonthSelectionMode) {
            if (estimateEditMode) {
                html += '<tr><th style="min-width: 50px;">選択</th><th style="min-width: 200px;">対応名</th><th style="min-width: 80px;">工程</th><th style="min-width: 80px;">担当</th><th style="min-width: 80px;">工数</th><th style="min-width: 150px;">対応合計</th><th style="min-width: 100px;">操作</th></tr>';
            } else {
                html += '<tr><th style="min-width: 50px;">選択</th><th style="min-width: 200px;">対応名</th><th style="min-width: 80px;">工程</th><th style="min-width: 80px;">担当</th><th style="min-width: 80px;">工数</th><th style="min-width: 150px;">対応合計</th></tr>';
            }
        } else {
            if (estimateEditMode) {
                html += '<tr><th style="min-width: 200px;">対応名</th><th style="min-width: 80px;">工程</th><th style="min-width: 80px;">担当</th><th style="min-width: 80px;">工数</th><th style="min-width: 150px;">対応合計</th><th style="min-width: 100px;">操作</th></tr>';
            } else {
                html += '<tr><th style="min-width: 200px;">対応名</th><th style="min-width: 80px;">工程</th><th style="min-width: 80px;">担当</th><th style="min-width: 80px;">工数</th><th style="min-width: 150px;">対応合計</th></tr>';
            }
        }

        Object.values(versionGroups[version]).forEach(taskGroup => {
            const total = taskGroup.processes.reduce((sum, p) => sum + p.hours, 0);
            const days = total / 8;
            const months = total / 8 / workingDaysPerMonth;

            const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
            const sortedProcesses = taskGroup.processes.sort((a, b) =>
                processOrder.indexOf(a.process) - processOrder.indexOf(b.process)
            );

            const taskWorkMonths = getTaskWorkMonths(version, taskGroup.task);

            let workMonthBadgeInline = '';
            let workMonthBadgeBlock = '';

            if (taskWorkMonths.length === 0) {
                workMonthBadgeInline = ' <span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">未設定</span>';
                workMonthBadgeBlock = '<div style="margin-top: 4px;"><span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">未設定</span></div>';
            } else if (taskWorkMonths.length === 1) {
                const [y, m] = taskWorkMonths[0].split('-');
                workMonthBadgeInline = ` <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y}年${parseInt(m)}月</span>`;
                workMonthBadgeBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y}年${parseInt(m)}月</span></div>`;
            } else {
                const [y1, m1] = taskWorkMonths[0].split('-');
                const [y2, m2] = taskWorkMonths[taskWorkMonths.length - 1].split('-');
                workMonthBadgeInline = ` <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月</span>`;
                workMonthBadgeBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y1}年${parseInt(m1)}月</span> <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">〜${y2}年${parseInt(m2)}月</span></div>`;
            }

            let taskDisplayHtml = taskGroup.task;
            if (taskGroup.task.includes(':') || taskGroup.task.includes('：')) {
                let separator = ':';
                let parts;
                if (taskGroup.task.includes(':')) {
                    parts = taskGroup.task.split(':');
                } else {
                    separator = '：';
                    parts = taskGroup.task.split('：');
                }
                const restPart = parts.slice(1).join(separator);
                taskDisplayHtml = `${parts[0]}<span class="task-separator-inline">${separator} ${restPart}</span><span class="task-separator-break"><br><span style="font-size: 13px; font-weight: normal;">${restPart}</span></span>`;
            }

            taskDisplayHtml += `<span class="work-month-inline">${workMonthBadgeInline}</span><span class="work-month-block">${workMonthBadgeBlock}</span>`;

            const taskIds = taskGroup.processes.map(p => p.id);
            const allSelected = taskIds.every(id => selectedEstimateIds.has(id));

            sortedProcesses.forEach((proc, index) => {
                const estimate = estimates.find(e => e.id === proc.id);
                const est = normalizeEstimate(estimate);
                const isOutOfFilter = proc.isOutOfFilter || false;
                const grayStyle = isOutOfFilter ? 'opacity: 0.4;' : '';
                const grayPrefix = isOutOfFilter ? '○ ' : '';

                let processWorkMonthInline = '';
                let processWorkMonthBlock = '';

                if (est.workMonths.length > 0) {
                    if (est.workMonths.length === 1) {
                        const [y, m] = est.workMonths[0].split('-');
                        processWorkMonthInline = `<span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px; white-space: nowrap;">${y}年${parseInt(m)}月</span>`;
                        processWorkMonthBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap;">${y}年${parseInt(m)}月</span></div>`;
                    } else {
                        const [y1, m1] = est.workMonths[0].split('-');
                        const [y2, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                        processWorkMonthInline = `<span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px; white-space: nowrap;">${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月</span>`;
                        processWorkMonthBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap;">${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月</span></div>`;
                    }
                } else {
                    processWorkMonthInline = `<span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px; white-space: nowrap;">未設定</span>`;
                    processWorkMonthBlock = `<div style="margin-top: 4px;"><span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap;">未設定</span></div>`;
                }

                html += '<tr>';

                if (workMonthSelectionMode) {
                    if (index === 0) {
                        html += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; text-align: center; cursor: pointer;" onclick="selectTaskEstimates('${version}', '${taskGroup.task.replace(/'/g, "\\'")}', event)">
                            <input type="checkbox" ${allSelected ? 'checked' : ''} style="width: auto; cursor: pointer;" onclick="selectTaskEstimates('${version}', '${taskGroup.task.replace(/'/g, "\\'")}', event)">
                        </td>`;
                    }
                }

                if (index === 0) {
                    if (estimateEditMode) {
                        html += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; font-weight: 600;">
                            <div style="display: flex; align-items: flex-start; gap: 8px;">
                                <div style="flex: 1; cursor: pointer; color: #007bff;" onclick="editTask('${version}', '${taskGroup.task.replace(/'/g, "\\'")}')" title="クリックして対応名を編集">${taskDisplayHtml}</div>
                                <span onclick="deleteTask('${version}', '${taskGroup.task.replace(/'/g, "\\'")}'); event.stopPropagation();" style="cursor: pointer; font-size: 18px; color: #dc3545; flex-shrink: 0;" title="対応ごと削除">🗑️</span>
                            </div>
                        </td>`;
                    } else {
                        html += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; font-weight: 600;">${taskDisplayHtml}</td>`;
                    }
                }

                if (workMonthSelectionMode) {
                    const isSelected = selectedEstimateIds.has(proc.id);
                    html += `<td style="cursor: pointer; ${grayStyle}" onclick="toggleEstimateSelection(${proc.id}, event)">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} style="width: auto; margin-right: 6px; cursor: pointer;" onclick="toggleEstimateSelection(${proc.id}, event)">
                        <div>
                            <span>${grayPrefix}</span><span class="badge badge-${proc.process.toLowerCase()}">${proc.process}</span>
                            <span class="work-month-inline">${processWorkMonthInline}</span>
                        </div>
                        <div class="work-month-block">${processWorkMonthBlock}</div>
                    </td>`;
                } else {
                    html += `<td style="${grayStyle}"><span>${grayPrefix}</span><span class="badge badge-${proc.process.toLowerCase()}">${proc.process}</span></td>`;
                }

                html += `<td style="${grayStyle}">${proc.member}</td>`;
                html += `<td style="text-align: right; ${grayStyle}">${proc.hours}h</td>`;

                if (index === 0) {
                    html += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; text-align: right;">
                        <div style="font-weight: 700; color: #1976d2; font-size: 16px; margin-bottom: 4px;">${formatNumber(total, 1)}h</div>
                        <div class="manpower-display" style="font-size: 13px; color: #666;">${formatNumber(days, 1)}人日 / ${formatNumber(months, 2)}人月</div>
                    </td>`;
                }

                if (estimateEditMode) {
                    html += `<td style="text-align: center;">
                        <span onclick="editEstimate(${proc.id})" style="cursor: pointer; font-size: 18px; margin-right: 10px;" title="編集">✏️</span>
                        <span onclick="deleteEstimate(${proc.id})" style="cursor: pointer; font-size: 18px; color: #dc3545;" title="削除">🗑️</span>
                    </td>`;
                }
                html += '</tr>';
            });
        });

        const versionTotal = Object.values(versionGroups[version])
            .reduce((sum, taskGroup) => sum + taskGroup.processes.reduce((s, p) => s + p.hours, 0), 0);
        const versionDays = versionTotal / 8;
        const versionMonths = versionTotal / 8 / workingDaysPerMonth;

        html += `<tr style="background: #f5f5f5; font-weight: 700;">`;
        if (workMonthSelectionMode) {
            html += `<td></td>`;
        }
        html += `<td style="text-align: right; padding-right: 20px;">${version} 合計</td>`;
        html += `<td colspan="2"></td>`;
        html += `<td style="text-align: right;">${formatNumber(versionTotal, 1)}h</td>`;
        html += `<td style="text-align: right;">
            <div style="font-size: 15px; margin-bottom: 3px;">${formatNumber(versionDays, 1)}人日 / ${formatNumber(versionMonths, 2)}人月</div>
        </td>`;
        if (estimateEditMode) {
            html += `<td></td>`;
        }
        html += `</tr>`;

        html += '</table></div>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * マトリクス形式での見積一覧描画
 */
export function renderEstimateMatrix() {
    const container = document.getElementById('estimateList');

    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const workMonthFilter = monthFilterElement ? monthFilterElement.value : 'all';
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';

    const usedMonths = new Set();
    let hasMultipleMonths = false;
    let hasUnassigned = false;

    const versionGroups = {};
    filteredEstimates.forEach(e => {
        if (!versionGroups[e.version]) {
            versionGroups[e.version] = {};
        }
        const taskKey = e.task;
        if (!versionGroups[e.version][taskKey]) {
            versionGroups[e.version][taskKey] = {
                task: e.task,
                processes: {}
            };
        }

        const est = normalizeEstimate(e);
        let displayHours = e.hours;
        if (filterType === 'month' && workMonthFilter !== 'all' && est.monthlyHours && est.monthlyHours[workMonthFilter]) {
            displayHours = est.monthlyHours[workMonthFilter];
        }

        if (est.workMonths && est.workMonths.length > 0) {
            est.workMonths.forEach(m => usedMonths.add(m));
            if (est.workMonths.length > 1) {
                hasMultipleMonths = true;
            }
        } else {
            hasUnassigned = true;
        }

        versionGroups[e.version][taskKey].processes[e.process] = {
            member: e.member,
            hours: displayHours,
            id: e.id,
            workMonths: est.workMonths || []
        };
    });

    const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const showMonthColors = showMonthColorsSetting;

    let html = '<div style="margin-bottom: 30px;">';

    if (showMonthColors) {
        html += generateMonthColorLegend(usedMonths, hasMultipleMonths, hasUnassigned);
    }

    Object.keys(versionGroups).sort().forEach(version => {
        html += `<div style="margin-bottom: 30px;">`;
        html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${version}</h3>`;
        html += '<div class="table-wrapper"><table class="estimate-matrix">';
        html += '<tr><th style="min-width: 200px;">対応名</th>';
        processOrder.forEach(proc => {
            html += `<th style="min-width: 100px; text-align: center;">${proc}</th>`;
        });
        html += '<th style="min-width: 80px; text-align: center;">合計</th></tr>';

        Object.values(versionGroups[version]).forEach(group => {
            let taskDisplayHtml = group.task;
            if (group.task.includes('：')) {
                const parts = group.task.split('：');
                const restPart = parts.slice(1).join('：');
                taskDisplayHtml = `${parts[0]}<br><span style="font-size: 13px; font-weight: normal;">${restPart}</span>`;
            }

            html += '<tr>';
            if (estimateEditMode) {
                html += `<td style="font-weight: 600;">
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <div style="flex: 1; cursor: pointer; color: #007bff;" onclick="editTask('${version}', '${group.task.replace(/'/g, "\\'")}')" title="クリックして対応名を編集">${taskDisplayHtml}</div>
                        <span onclick="deleteTask('${version}', '${group.task.replace(/'/g, "\\'")}'); event.stopPropagation();" style="cursor: pointer; font-size: 18px; color: #dc3545; flex-shrink: 0;" title="対応ごと削除">🗑️</span>
                    </div>
                </td>`;
            } else {
                html += `<td style="font-weight: 600;">${taskDisplayHtml}</td>`;
            }

            let total = 0;
            processOrder.forEach(proc => {
                if (group.processes[proc]) {
                    const p = group.processes[proc];
                    total += p.hours;

                    const monthColor = showMonthColors ? getMonthColor(p.workMonths) : { bg: '', tooltip: '' };
                    const bgStyle = showMonthColors ? `background: ${monthColor.bg};` : '';

                    if (estimateEditMode) {
                        html += `<td style="text-align: center; cursor: pointer; transition: background 0.2s; ${bgStyle}"
                            onclick="editEstimate(${p.id})"
                            ${showMonthColors ? `title="${monthColor.tooltip}"` : ''}
                            onmouseover="this.style.background='#e3f2fd'"
                            onmouseout="this.style.background='${showMonthColors ? monthColor.bg : ''}'">
                            <div style="font-weight: 600;">${p.hours.toFixed(1)}h</div>
                            <div style="font-size: 12px; color: #666;">(${p.member})</div>
                            <div style="font-size: 10px; color: #1976d2; margin-top: 2px;">✏️ 編集</div>
                        </td>`;
                    } else {
                        html += `<td style="text-align: center; ${bgStyle}" ${showMonthColors ? `title="${monthColor.tooltip}"` : ''}>
                            <div style="font-weight: 600;">${p.hours.toFixed(1)}h</div>
                            <div style="font-size: 12px; color: #666;">(${p.member})</div>
                        </td>`;
                    }
                } else {
                    html += `<td style="text-align: center; color: #ccc;">-</td>`;
                }
            });

            const totalDays = total / 8;
            const totalMonths = totalDays / 20;

            html += `<td style="text-align: center;">
                <div style="font-weight: 700; color: #1976d2;">${total.toFixed(1)}h</div>
                <div style="font-size: 11px; color: #666;">${totalDays.toFixed(1)}人日</div>
                <div style="font-size: 11px; color: #666;">${totalMonths.toFixed(2)}人月</div>
            </td>`;
            html += '</tr>';
        });

        html += '</table></div>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * 詳細リスト形式での見積一覧描画
 */
export function renderEstimateDetailList() {
    const container = document.getElementById('estimateList');

    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const workMonthFilter = monthFilterElement ? monthFilterElement.value : 'all';
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';

    let html = '<div class="table-wrapper"><table><tr><th>版数</th><th>対応名</th><th>工程</th><th>担当</th><th>見積工数</th><th>作業予定月</th><th>操作</th></tr>';

    filteredEstimates.forEach(e => {
        const est = normalizeEstimate(e);

        let displayHours = est.hours;
        if (filterType === 'month' && workMonthFilter !== 'all' && est.monthlyHours[workMonthFilter]) {
            displayHours = est.monthlyHours[workMonthFilter];
        }

        let workMonthDisplay = '-';
        if (est.workMonths.length > 0) {
            if (est.workMonths.length === 1) {
                const [y, m] = est.workMonths[0].split('-');
                workMonthDisplay = `${y}年${parseInt(m)}月`;
            } else {
                const [y1, m1] = est.workMonths[0].split('-');
                const [y2, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                workMonthDisplay = `${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月`;
                workMonthDisplay += '<br><small style="color: #666;">';
                est.workMonths.forEach((month, idx) => {
                    const [y, m] = month.split('-');
                    const hours = est.monthlyHours[month] || 0;
                    if (idx > 0) workMonthDisplay += ', ';
                    workMonthDisplay += `${y}年${parseInt(m)}月:${hours.toFixed(1)}h`;
                });
                workMonthDisplay += '</small>';
            }
        }

        html += `
            <tr>
                <td>${est.version}</td>
                <td>${est.task}</td>
                <td><span class="badge badge-${est.process.toLowerCase()}">${est.process}</span></td>
                <td>${est.member}</td>
                <td>${displayHours.toFixed(1)}h</td>
                <td>${workMonthDisplay}</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="editEstimate(${est.id})" style="margin-right: 5px;">編集</button>
                    <button class="btn btn-small" onclick="openSplitEstimateModal(${est.id})" style="margin-right: 5px; background: #3498db; color: white;">分割</button>
                    <button class="btn btn-danger btn-small" onclick="deleteEstimate(${est.id})">削除</button>
                </td>
            </tr>
        `;
    });

    html += '</table></div>';
    container.innerHTML = html;
}

// ============================================
// 見積CRUD操作
// ============================================

/**
 * 見積を削除
 */
export function deleteEstimate(id) {
    const estimate = estimates.find(e => e.id === id);
    if (!estimate) return;

    const detail = `この見積を削除しますか？\n\n対応名: ${estimate.task}\n工程: ${estimate.process}\n工数: ${estimate.hours}h\n担当: ${estimate.member}`;
    if (!confirm(detail)) return;

    const warning = '【警告】この操作は取り消せません。\n本当に削除してもよろしいですか？';
    if (!confirm(warning)) return;

    const newEstimates = estimates.filter(e => e.id !== id);
    setEstimates(newEstimates);

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    renderEstimateList();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
    if (typeof window.updateReport === 'function') window.updateReport();
    showAlert('見積を削除しました', true);
}

/**
 * 対応ごと削除
 */
export function deleteTask(version, task) {
    const taskEstimates = estimates.filter(e => e.version === version && e.task === task);
    if (taskEstimates.length === 0) return;

    const processes = taskEstimates.map(e => e.process).join(', ');
    const totalHours = taskEstimates.reduce((sum, e) => sum + e.hours, 0);

    const detail = `この対応を削除しますか？\n\n版数: ${version}\n対応名: ${task}\n工程数: ${taskEstimates.length}件\n工程: ${processes}\n合計工数: ${totalHours}h`;
    if (!confirm(detail)) return;

    const warning = '【警告】この操作は取り消せません。\nこの対応に含まれる全ての工程が削除されます。\n本当に削除してもよろしいですか？';
    if (!confirm(warning)) return;

    const newEstimates = estimates.filter(e => !(e.version === version && e.task === task));
    setEstimates(newEstimates);

    if (typeof window.saveData === 'function') window.saveData();
    renderEstimateList();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
    if (typeof window.updateReport === 'function') window.updateReport();
    showAlert('対応を削除しました', true);
}

// ============================================
// 作業月関連
// ============================================

/**
 * 作業月オプションを更新
 */
export function updateWorkMonthOptions() {
    const select = document.getElementById('assignWorkMonth');
    if (!select) return;

    const filter = document.getElementById('estimateMonthFilter');

    const months = new Set();

    estimates.forEach(e => {
        if (e.workMonth) {
            months.add(e.workMonth);
        }
    });

    actuals.forEach(a => {
        if (a.date) {
            const month = a.date.substring(0, 7);
            months.add(month);
        }
    });

    const now = new Date();
    for (let i = -3; i <= 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthStr);
    }

    const sortedMonths = Array.from(months).sort();

    select.innerHTML = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        return `<option value="${m}">${year}年${parseInt(month)}月</option>`;
    }).join('');

    // filterの更新はui.jsのupdateEstimateMonthOptionsで行うため削除
    // if (filter) { ... }
}

console.log('✅ モジュール estimate.js loaded');
