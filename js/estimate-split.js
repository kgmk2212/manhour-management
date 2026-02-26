// ============================================
// 見積分割・フォーム関連機能
// ============================================

import { estimates } from './state.js';
import { pushAction } from './history.js';

import {
    normalizeEstimate,
    generateMonthRange,
    generateMonthOptions,
    showAlert,
    escapeHtml
} from './utils.js';

import { renderEstimateList } from './estimate.js';

// ============================================
// 月分割モーダル
// ============================================

/**
 * 月分割モーダルを開く
 */
export function openSplitEstimateModal(id) {
    const estimate = estimates.find(e => e.id === id);
    if (!estimate) {
        alert('データが見つかりません');
        return;
    }

    const est = normalizeEstimate(estimate);

    document.getElementById('splitEstimateId').value = id;
    document.getElementById('splitEstimateInfo').innerHTML = `
        <strong>${escapeHtml(est.version)}</strong> - ${escapeHtml(est.task)} [${escapeHtml(est.process)}] (${escapeHtml(est.member)})<br>
        現在の工数: ${est.hours.toFixed(1)}h
    `;
    document.getElementById('splitTotalHours').value = est.hours;

    if (est.monthlyHours && Object.keys(est.monthlyHours).length > 0) {
        document.querySelector('input[name="splitMethodModal"][value="manual"]').checked = true;
    } else {
        document.querySelector('input[name="splitMethodModal"][value="equal"]').checked = true;
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let defaultStart = currentMonth;
    let defaultEnd = currentMonth;

    if (est.workMonths.length > 0) {
        defaultStart = est.workMonths[0];
        defaultEnd = est.workMonths[est.workMonths.length - 1];
    }

    generateMonthOptions('splitStartMonth', defaultStart);
    generateMonthOptions('splitEndMonth', defaultEnd);

    updateSplitPreview();

    document.getElementById('splitEstimateModal').style.display = 'flex';
}

/**
 * 月分割モーダルを閉じる
 */
export function closeSplitEstimateModal() {
    document.getElementById('splitEstimateModal').style.display = 'none';
}

/**
 * 分割プレビューを更新
 */
export function updateSplitPreview() {
    const totalHours = parseFloat(document.getElementById('splitTotalHours').value) || 0;
    const startMonth = document.getElementById('splitStartMonth').value;
    const endMonth = document.getElementById('splitEndMonth').value;
    const method = document.querySelector('input[name="splitMethodModal"]:checked').value;
    const preview = document.getElementById('splitPreview');

    if (!startMonth || !endMonth || totalHours <= 0) {
        preview.innerHTML = '<p style="color: #999; font-size: 14px;">作業期間を選択してください</p>';
        return;
    }

    if (startMonth > endMonth) {
        preview.innerHTML = '<p style="color: #e74c3c; font-size: 14px;">⚠️ 開始月は終了月より前にしてください</p>';
        return;
    }

    const months = generateMonthRange(startMonth, endMonth);

    const estimateId = parseFloat(document.getElementById('splitEstimateId').value);
    const currentEstimate = estimates.find(e => e.id === estimateId);
    const normalizedEstimate = normalizeEstimate(currentEstimate);
    const currentMonthlyHours = normalizedEstimate && normalizedEstimate.monthlyHours ? normalizedEstimate.monthlyHours : {};

    let html = '<div style="background: white; padding: 15px; border-radius: 5px; border: 1px solid var(--accent);">';
    html += '<strong style="color: var(--text-primary);">📋 分割プレビュー</strong><br>';
    html += '<div style="margin-top: 10px;">';

    if (method === 'equal') {
        const hoursPerMonth = (totalHours / months.length).toFixed(1);
        months.forEach(month => {
            const [y, m] = month.split('-');
            html += `<div style="padding: 5px 0; border-bottom: 1px solid #eee;">`;
            html += `${y}年${parseInt(m)}月: <strong>${hoursPerMonth}h</strong>`;
            html += `</div>`;
        });
        html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--accent); font-weight: 600;">`;
        html += `合計: ${totalHours}h (${months.length}ヶ月)`;
        html += `</div>`;
    } else {
        let calculatedTotal = 0;
        months.forEach((month, index) => {
            const [y, m] = month.split('-');
            const existingHours = currentMonthlyHours[month] !== undefined ? currentMonthlyHours[month] : 0;
            calculatedTotal += existingHours;
            html += `<div style="padding: 5px 0; display: flex; align-items: center; gap: 10px;">`;
            html += `<label style="flex: 1;">${y}年${parseInt(m)}月:</label>`;
            html += `<input type="number" id="splitMonthHours_${index}" value="${existingHours}" step="0.1" min="0" `;
            html += `onchange="updateSplitManualTotal()" style="width: 100px; padding: 5px; border: 1px solid #ccc; border-radius: 4px;"> h`;
            html += `</div>`;
        });
        html += `<div id="splitManualTotal" style="margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--accent); font-weight: 600;">`;
        const isMatch = Math.abs(calculatedTotal - totalHours) < 0.01;
        const color = isMatch ? '#27ae60' : '#e74c3c';
        html += `合計: <span style="color: ${color};">${calculatedTotal.toFixed(1)}h</span> / 目標: ${totalHours}h`;
        if (Math.abs(calculatedTotal - totalHours) >= 0.01) {
            const diff = calculatedTotal - totalHours;
            if (diff > 0) {
                html += ` <span style="color: #e74c3c;">(+${diff.toFixed(1)}h 超過)</span>`;
            } else {
                html += ` <span style="color: #f39c12;">(${diff.toFixed(1)}h 不足)</span>`;
            }
        } else {
            html += ' <span style="color: #27ae60;">✓</span>';
        }
        html += `</div>`;
    }

    html += '</div></div>';
    preview.innerHTML = html;
}

/**
 * 分割手動設定の合計更新
 */
export function updateSplitManualTotal() {
    const totalHours = parseFloat(document.getElementById('splitTotalHours').value) || 0;
    const startMonth = document.getElementById('splitStartMonth').value;
    const endMonth = document.getElementById('splitEndMonth').value;

    if (!startMonth || !endMonth) return;

    const months = generateMonthRange(startMonth, endMonth);
    let total = 0;

    months.forEach((month, index) => {
        const input = document.getElementById(`splitMonthHours_${index}`);
        if (input) {
            total += parseFloat(input.value) || 0;
        }
    });

    const manualTotalDiv = document.getElementById('splitManualTotal');
    if (manualTotalDiv) {
        const diff = total - totalHours;
        const color = Math.abs(diff) < 0.01 ? '#27ae60' : (diff > 0 ? '#e74c3c' : '#f39c12');
        manualTotalDiv.innerHTML = `合計: <span style="color: ${color};">${total.toFixed(1)}h</span> / 目標: ${totalHours}h`;

        if (Math.abs(diff) < 0.01) {
            manualTotalDiv.innerHTML += ' <span style="color: #27ae60;">✓</span>';
        } else if (diff > 0) {
            manualTotalDiv.innerHTML += ` <span style="color: #e74c3c;">(+${diff.toFixed(1)}h 超過)</span>`;
        } else {
            manualTotalDiv.innerHTML += ` <span style="color: #f39c12;">(${diff.toFixed(1)}h 不足)</span>`;
        }
    }
}

/**
 * 月分割を実行
 */
export function executeSplitEstimate() {
    const id = parseFloat(document.getElementById('splitEstimateId').value);
    const totalHours = parseFloat(document.getElementById('splitTotalHours').value) || 0;
    const startMonth = document.getElementById('splitStartMonth').value;
    const endMonth = document.getElementById('splitEndMonth').value;
    const method = document.querySelector('input[name="splitMethodModal"]:checked').value;

    if (!startMonth || !endMonth || totalHours <= 0) {
        alert('作業期間を正しく設定してください');
        return;
    }

    if (startMonth > endMonth) {
        alert('開始月は終了月より前にしてください');
        return;
    }

    const months = generateMonthRange(startMonth, endMonth);
    const monthlyHours = {};

    if (method === 'equal') {
        const hoursPerMonth = totalHours / months.length;
        months.forEach(month => {
            monthlyHours[month] = hoursPerMonth;
        });
    } else {
        let total = 0;
        months.forEach((month, index) => {
            const input = document.getElementById(`splitMonthHours_${index}`);
            const hours = input ? parseFloat(input.value) || 0 : 0;
            monthlyHours[month] = hours;
            total += hours;
        });

        if (Math.abs(total - totalHours) > 0.01) {
            alert(`月別工数の合計(${total.toFixed(1)}h)が総工数(${totalHours}h)と一致しません`);
            return;
        }
    }

    const estimateIndex = estimates.findIndex(e => e.id === id);
    if (estimateIndex !== -1) {
        const beforeEstimate = { ...estimates[estimateIndex] };
        estimates[estimateIndex] = {
            ...estimates[estimateIndex],
            workMonth: startMonth,
            workMonths: months,
            monthlyHours: monthlyHours
        };

        pushAction({
            type: 'estimate_edit',
            description: `見積月分割: ${beforeEstimate.task} (${beforeEstimate.process})`,
            data: { before: beforeEstimate, after: { ...estimates[estimateIndex] } }
        });

        if (typeof window.saveData === 'function') window.saveData();
        closeSplitEstimateModal();
        renderEstimateList();
        if (typeof window.updateReport === 'function') window.updateReport();

        showAlert('見積を月別に分割しました', true);
    } else {
        showAlert('データの更新に失敗しました', false);
    }
}

// ============================================
// 旧式フォーム関連
// ============================================

/**
 * 見積フォームをクリア（旧式フォーム用）
 */
export function clearEstimateForm() {
    document.getElementById('estVersion').value = '';
    document.getElementById('estTask').value = '';
    ['UI', 'PG', 'PT', 'IT', 'ST'].forEach(proc => {
        document.getElementById(`est${proc}`).value = '';
        document.getElementById(`est${proc}_member`).value = '';
        const checkbox = document.getElementById(`split${proc}`);
        if (checkbox) {
            checkbox.checked = false;
        }
    });

    document.getElementById('enableMonthSplit').checked = false;
    toggleMonthSplit();
}

/**
 * 月分割モードのトグル（旧式フォーム用）
 */
export function toggleMonthSplit() {
    const enabled = document.getElementById('enableMonthSplit').checked;
    const panel = document.getElementById('monthSplitPanel');

    if (enabled) {
        panel.style.display = 'block';

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        generateMonthOptions('startMonth', currentMonth);
        generateMonthOptions('endMonth', currentMonth);

        updateMonthPreview();
    } else {
        panel.style.display = 'none';
    }
}

/**
 * 月別プレビューを更新（旧式フォーム用）
 */
export function updateMonthPreview() {
    const totalHours = parseFloat(document.getElementById('totalHours').value) || 0;
    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;
    const method = document.querySelector('input[name="splitMethod"]:checked').value;
    const preview = document.getElementById('monthPreview');

    if (!startMonth || !endMonth || totalHours <= 0) {
        preview.innerHTML = '<p style="color: #999; font-size: 14px;">総工数と作業期間を入力してください</p>';
        return;
    }

    if (startMonth > endMonth) {
        preview.innerHTML = '<p style="color: #e74c3c; font-size: 14px;">⚠️ 開始月は終了月より前にしてください</p>';
        return;
    }

    const months = generateMonthRange(startMonth, endMonth);
    let html = '<div style="background: white; padding: 15px; border-radius: 5px; border: 1px solid #2196f3;">';
    html += '<strong style="color: #1976d2;">📋 プレビュー</strong><br>';
    html += '<div style="margin-top: 10px;">';

    if (method === 'equal') {
        const hoursPerMonth = (totalHours / months.length).toFixed(1);
        months.forEach(month => {
            const [y, m] = month.split('-');
            html += `<div style="padding: 5px 0; border-bottom: 1px solid #eee;">`;
            html += `${y}年${parseInt(m)}月: <strong>${hoursPerMonth}h</strong>`;
            html += `</div>`;
        });
        html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 2px solid #2196f3; font-weight: 600;">`;
        html += `合計: ${totalHours}h (${months.length}ヶ月)`;
        html += `</div>`;
    } else {
        months.forEach((month, index) => {
            const [y, m] = month.split('-');
            html += `<div style="padding: 5px 0; display: flex; align-items: center; gap: 10px;">`;
            html += `<label style="flex: 1;">${y}年${parseInt(m)}月:</label>`;
            html += `<input type="number" id="monthHours_${index}" value="0" step="0.1" min="0" `;
            html += `onchange="updateManualTotal()" style="width: 100px; padding: 5px; border: 1px solid #ccc; border-radius: 4px;"> h`;
            html += `</div>`;
        });
        html += `<div id="manualTotal" style="margin-top: 10px; padding-top: 10px; border-top: 2px solid #2196f3; font-weight: 600;">`;
        html += `合計: 0h / 目標: ${totalHours}h`;
        html += `</div>`;
    }

    html += '</div></div>';
    preview.innerHTML = html;
}

/**
 * 手動設定の合計更新（旧式フォーム用）
 */
export function updateManualTotal() {
    const totalHours = parseFloat(document.getElementById('totalHours').value) || 0;
    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;

    if (!startMonth || !endMonth) return;

    const months = generateMonthRange(startMonth, endMonth);
    let total = 0;

    months.forEach((month, index) => {
        const input = document.getElementById(`monthHours_${index}`);
        if (input) {
            total += parseFloat(input.value) || 0;
        }
    });

    const manualTotalDiv = document.getElementById('manualTotal');
    if (manualTotalDiv) {
        const diff = total - totalHours;
        const color = Math.abs(diff) < 0.01 ? '#27ae60' : (diff > 0 ? '#e74c3c' : '#f39c12');
        manualTotalDiv.innerHTML = `合計: <span style="color: ${color};">${total.toFixed(1)}h</span> / 目標: ${totalHours}h`;

        if (Math.abs(diff) < 0.01) {
            manualTotalDiv.innerHTML += ' <span style="color: #27ae60;">✓</span>';
        } else if (diff > 0) {
            manualTotalDiv.innerHTML += ` <span style="color: #e74c3c;">(+${diff.toFixed(1)}h 超過)</span>`;
        } else {
            manualTotalDiv.innerHTML += ` <span style="color: #f39c12;">(${diff.toFixed(1)}h 不足)</span>`;
        }
    }
}

console.log('✅ モジュール estimate-split.js loaded');
