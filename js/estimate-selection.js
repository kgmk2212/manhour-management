// ============================================
// 選択モード・作業月割り当て関連機能
// ============================================

import {
    estimates, actuals,
    workMonthSelectionMode, setWorkMonthSelectionMode,
    selectedEstimateIds
} from './state.js';

import { getCurrentMonthWorkingDays, renderEstimateList, updateWorkMonthOptions } from './estimate.js';
import { formatHours } from './utils.js';

// ============================================
// 作業月選択モード
// ============================================

/**
 * 作業月選択モードのトグル
 */
export function toggleWorkMonthSelectionMode() {
    const checkbox1 = document.getElementById('workMonthSelectionMode');
    const checkbox2 = document.getElementById('workMonthSelectionMode2');

    if (checkbox1 && checkbox2) {
        if (event && event.target === checkbox1) {
            checkbox2.checked = checkbox1.checked;
            setWorkMonthSelectionMode(checkbox1.checked);
        } else if (event && event.target === checkbox2) {
            checkbox1.checked = checkbox2.checked;
            setWorkMonthSelectionMode(checkbox2.checked);
        } else {
            setWorkMonthSelectionMode(checkbox1.checked);
            checkbox2.checked = checkbox1.checked;
        }
    } else if (checkbox1) {
        setWorkMonthSelectionMode(checkbox1.checked);
    }

    const modePanel = document.getElementById('workMonthAssignmentMode');

    if (workMonthSelectionMode) {
        modePanel.style.display = 'block';
        selectedEstimateIds.clear();
        updateSelectedWorkHours();
        initDragHandle();
    } else {
        modePanel.style.display = 'none';
        selectedEstimateIds.clear();
    }

    renderEstimateList();
}

/**
 * 見積選択のトグル
 */
export function toggleEstimateSelection(id, event) {
    if (!workMonthSelectionMode) return;

    event.stopPropagation();

    if (selectedEstimateIds.has(id)) {
        selectedEstimateIds.delete(id);
    } else {
        selectedEstimateIds.add(id);
    }

    updateSelectedWorkHours();
    renderEstimateList();
}

/**
 * 対応の全工程を選択/解除
 */
export function selectTaskEstimates(version, task, event) {
    if (!workMonthSelectionMode) return;

    event.stopPropagation();

    const taskEstimates = estimates.filter(e => e.version === version && e.task === task);
    const taskIds = taskEstimates.map(e => e.id);

    const allSelected = taskIds.every(id => selectedEstimateIds.has(id));

    if (allSelected) {
        taskIds.forEach(id => selectedEstimateIds.delete(id));
    } else {
        taskIds.forEach(id => selectedEstimateIds.add(id));
    }

    updateSelectedWorkHours();
    renderEstimateList();
}

/**
 * 選択された工数を更新
 */
export function updateSelectedWorkHours() {
    const selectedEstimates = estimates.filter(e => selectedEstimateIds.has(e.id));
    const totalHours = selectedEstimates.reduce((sum, e) => sum + e.hours, 0);
    const days = totalHours / 8;

    const workingDaysPerMonth = getCurrentMonthWorkingDays();
    const months = days / workingDaysPerMonth;

    document.getElementById('selectedWorkHours').textContent =
        `選択中: ${formatHours(totalHours)}h (${days.toFixed(2)}人日 / ${months.toFixed(2)}人月)`;
}

/**
 * 作業月割り当てを実行
 */
export function executeWorkMonthAssignment() {
    if (selectedEstimateIds.size === 0) {
        alert('作業を選択してください');
        return;
    }

    const workMonth = document.getElementById('assignWorkMonth').value;
    const [year, month] = workMonth.split('-');

    if (!confirm(`選択した${selectedEstimateIds.size}件の作業に「${year}年${parseInt(month)}月」を割り当てますか？`)) {
        return;
    }

    estimates.forEach(e => {
        if (selectedEstimateIds.has(e.id)) {
            e.workMonth = workMonth;
        }
    });

    selectedEstimateIds.clear();
    if (typeof window.saveData === 'function') window.saveData();
    updateWorkMonthOptions();
    updateSelectedWorkHours();
    renderEstimateList();
    if (typeof window.updateReport === 'function') window.updateReport();

    alert('作業月を割り当てました');
}

/**
 * 作業月選択をキャンセル
 */
export function cancelWorkMonthSelection() {
    selectedEstimateIds.clear();
    updateSelectedWorkHours();
    renderEstimateList();
}

/**
 * ドラッグ機能の初期化
 */
export function initDragHandle() {
    const dragHandle = document.getElementById('dragHandle');
    const panel = document.getElementById('workMonthAssignmentMode');

    if (!dragHandle || !panel) return;

    let isDragging = false;
    let startY = 0;
    let startTop = 20;

    const savedTop = localStorage.getItem('manhour_panelTop');
    if (savedTop) {
        startTop = parseInt(savedTop);
        panel.style.top = startTop + 'px';
    }

    dragHandle.addEventListener('mousedown', function(e) {
        isDragging = true;
        startY = e.clientY;
        const currentTop = parseInt(panel.style.top) || 20;
        startTop = currentTop;
        dragHandle.style.background = 'rgba(0,0,0,0.2)';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;

        const deltaY = e.clientY - startY;
        let newTop = startTop + deltaY;

        const panelHeight = panel.offsetHeight;
        const maxTop = window.innerHeight - panelHeight - 10;
        newTop = Math.max(10, Math.min(newTop, maxTop));

        panel.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            dragHandle.style.background = 'rgba(0,0,0,0.1)';
            const currentTop = parseInt(panel.style.top) || 20;
            localStorage.setItem('manhour_panelTop', currentTop);
        }
    });

    dragHandle.addEventListener('touchstart', function(e) {
        isDragging = true;
        startY = e.touches[0].clientY;
        const currentTop = parseInt(panel.style.top) || 20;
        startTop = currentTop;
        dragHandle.style.background = 'rgba(0,0,0,0.2)';
        e.preventDefault();
    });

    document.addEventListener('touchmove', function(e) {
        if (!isDragging) return;

        const deltaY = e.touches[0].clientY - startY;
        let newTop = startTop + deltaY;

        const panelHeight = panel.offsetHeight;
        const maxTop = window.innerHeight - panelHeight - 10;
        newTop = Math.max(10, Math.min(newTop, maxTop));

        panel.style.top = newTop + 'px';
    });

    document.addEventListener('touchend', function() {
        if (isDragging) {
            isDragging = false;
            dragHandle.style.background = 'rgba(0,0,0,0.1)';
            const currentTop = parseInt(panel.style.top) || 20;
            localStorage.setItem('manhour_panelTop', currentTop);
        }
    });
}

console.log('✅ モジュール estimate-selection.js loaded');
