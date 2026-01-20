// ============================================
// UI操作・DOM操作
// ============================================

import {
    estimates, actuals,
    showMonthColorsSetting, showDeviationColorsSetting,
    showProgressBarsSetting, showProgressPercentageSetting,
    progressBarStyle, matrixEstActFormat, matrixDayMonthFormat,
    memberOrder, setMemberOrder
} from './state.js';
import { normalizeEstimate } from './utils.js';

// タブの順序を定義
const TAB_ORDER = ['quick', 'estimate', 'actual', 'report', 'settings'];

// ============================================
// タブ操作
// ============================================

export function showTab(tabName) {
    // 全タブからactiveクラスとテーマクラスを削除
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        // テーマクラスを削除
        const classes = Array.from(t.classList);
        classes.forEach(cls => {
            if (cls.startsWith('theme-') || cls.startsWith('pattern-') || cls.startsWith('tab-theme-')) {
                t.classList.remove(cls);
            }
        });
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // 対象のタブボタンを見つけてactiveクラスを追加
    const tabButtons = document.querySelectorAll('.tab');
    const tabIndex = TAB_ORDER.indexOf(tabName);
    if (tabIndex !== -1 && tabButtons[tabIndex]) {
        tabButtons[tabIndex].classList.add('active');
    }

    // タブコンテンツを表示
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');
    }

    // アクティブタブにテーマを適用（window経由）
    if (typeof window.updateThemeElements === 'function') {
        window.updateThemeElements();
    }

    // 見積一覧タブまたはレポートタブの場合、デフォルト表示形式を適用
    if (tabName === 'estimate') {
        if (typeof window.applyDefaultEstimateViewType === 'function') {
            window.applyDefaultEstimateViewType();
        }
    } else if (tabName === 'report') {
        if (typeof window.applyDefaultReportViewType === 'function') {
            window.applyDefaultReportViewType();
        }
        // レポートタブを開いた時は常にupdateReport()を呼び出してグラフを更新
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
        // フローティングフィルタボタンを表示
        if (typeof window.showFloatingFilterButton === 'function') {
            window.showFloatingFilterButton();
        }
        // フローティングパネルの状態を同期
        if (typeof window.syncFloatingFilters === 'function') {
            window.syncFloatingFilters();
        }
    } else {
        // レポートタブ以外ではフローティングフィルタボタンを非表示
        if (typeof window.hideFloatingFilterButton === 'function') {
            window.hideFloatingFilterButton();
        }
    }
}

export function nextTab() {
    const currentIndex = TAB_ORDER.findIndex(tab =>
        document.getElementById(tab).classList.contains('active')
    );
    if (currentIndex !== -1 && currentIndex < TAB_ORDER.length - 1) {
        showTab(TAB_ORDER[currentIndex + 1]);
    }
}

export function prevTab() {
    const currentIndex = TAB_ORDER.findIndex(tab =>
        document.getElementById(tab).classList.contains('active')
    );
    if (currentIndex > 0) {
        showTab(TAB_ORDER[currentIndex - 1]);
    }
}

export function initTabSwipe() {
    const content = document.querySelector('.content');
    if (!content) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let touchStartTarget = null;

    const minSwipeDistance = 100;
    const maxVerticalDistance = 50;

    function shouldDisableSwipe(target) {
        if (!target) return false;

        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            return true;
        }

        const segmentButton = target.closest('[id$="Buttons2"]');
        if (segmentButton) return true;

        const element = target.closest('.table-wrapper, .estimate-table-wrapper, .modal.active, .custom-dropdown, #dragHandle, #workMonthAssignmentMode');
        return element !== null;
    }

    content.addEventListener('touchstart', function (e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        touchStartTarget = e.target;
    }, { passive: true });

    content.addEventListener('touchend', function (e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        if (shouldDisableSwipe(touchStartTarget)) {
            return;
        }

        const diffX = touchEndX - touchStartX;
        const diffY = Math.abs(touchEndY - touchStartY);
        const absDiffX = Math.abs(diffX);

        if (diffY > maxVerticalDistance) {
            return;
        }

        if (diffY > absDiffX) {
            return;
        }

        if (diffX < -minSwipeDistance) {
            nextTab();
        } else if (diffX > minSwipeDistance) {
            prevTab();
        }
    }
}

// ============================================
// セグメントボタン
// ============================================

export function createSegmentButtons(containerId, selectId, items, currentValue, maxItems, onClickHandler) {
    const container = document.getElementById(containerId);
    const select = document.getElementById(selectId);

    if (!container || !select) return;

    container.className = 'segment-buttons';
    container.style.display = 'inline-flex';
    container.style.overflowX = 'auto';
    select.style.display = 'none';
    container.innerHTML = '';

    items.forEach((item, index) => {
        const button = document.createElement('button');
        button.textContent = item.label;
        button.value = item.value;

        if (item.value === currentValue) {
            button.classList.add('active');
        }

        button.onclick = () => onClickHandler(item.value, containerId);
        container.appendChild(button);
    });
}

export function updateSegmentButtonSelection(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.value === value) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// ============================================
// 表示タイプ設定
// ============================================

export function setEstimateViewType(type) {
    const viewTypeElement = document.getElementById('estimateViewType');
    if (viewTypeElement) {
        viewTypeElement.value = type;
    }

    const btnGrouped = document.getElementById('btnEstimateGrouped');
    const btnMatrix = document.getElementById('btnEstimateMatrix');
    const btnList = document.getElementById('btnEstimateList');

    if (btnGrouped) btnGrouped.classList.remove('active');
    if (btnMatrix) btnMatrix.classList.remove('active');
    if (btnList) btnList.classList.remove('active');

    if (type === 'grouped' && btnGrouped) {
        btnGrouped.classList.add('active');
    } else if (type === 'matrix' && btnMatrix) {
        btnMatrix.classList.add('active');
    } else if (type === 'list' && btnList) {
        btnList.classList.add('active');
    }

    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }
}

export function setActualViewType(type) {
    const viewTypeEl = document.getElementById('actualViewType');
    if (viewTypeEl) viewTypeEl.value = type;

    const btnMatrix = document.getElementById('btnActualMatrix');
    const btnList = document.getElementById('btnActualList');

    if (btnMatrix) btnMatrix.classList.remove('active');
    if (btnList) btnList.classList.remove('active');

    if (type === 'matrix' && btnMatrix) {
        btnMatrix.classList.add('active');
    } else if (type === 'list' && btnList) {
        btnList.classList.add('active');
    }

    if (typeof window.renderActualList === 'function') {
        window.renderActualList();
    }
}

export function setReportViewType(type) {
    const viewTypeEl = document.getElementById('reportViewType');
    if (viewTypeEl) viewTypeEl.value = type;

    if (typeof window.updateReport === 'function') {
        window.updateReport();
    }
}

// ============================================
// テーマカラー取得
// ============================================

export function getThemeColor() {
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
    return themeColors[window.currentThemeColor] || '#667eea';
}

// ============================================
// レイアウト設定
// ============================================

export function applyLayoutSettings() {
    // 見積一覧のレイアウトを適用
    const estimateCompact = document.getElementById('estimateFiltersCompact');
    const estimateSegmented = document.getElementById('estimateFiltersSegmented');
    if (window.estimateLayout === 'compact') {
        if (estimateCompact) estimateCompact.style.display = 'flex';
        if (estimateSegmented) estimateSegmented.style.display = 'none';
    } else {
        if (estimateCompact) estimateCompact.style.display = 'none';
        if (estimateSegmented) estimateSegmented.style.display = 'block';
    }

    // 実績一覧のレイアウトを適用
    const actualCompact = document.getElementById('actualFiltersCompact');
    const actualSegmented = document.getElementById('actualFiltersSegmented');
    if (window.actualLayout === 'compact') {
        if (actualCompact) actualCompact.style.display = 'flex';
        if (actualSegmented) actualSegmented.style.display = 'none';
    } else {
        if (actualCompact) actualCompact.style.display = 'none';
        if (actualSegmented) actualSegmented.style.display = 'block';
    }

    // レポートのレイアウトを適用
    const reportCompact = document.getElementById('reportFiltersCompact');
    const reportSegmented = document.getElementById('reportFiltersSegmented');
    if (window.reportLayout === 'compact') {
        if (reportCompact) reportCompact.style.display = 'flex';
        if (reportSegmented) reportSegmented.style.display = 'none';
    } else {
        if (reportCompact) reportCompact.style.display = 'none';
        if (reportSegmented) reportSegmented.style.display = 'block';
    }

    // 設定タブのボタンの状態を更新
    updateLayoutToggleButtons();
}

export function toggleFilterLayout(page, version) {
    const themeColor = getThemeColor();

    if (page === 'estimate') {
        const compact = document.getElementById('estimateFiltersCompact');
        const segmented = document.getElementById('estimateFiltersSegmented');

        const settingsButtons = document.querySelectorAll('#settings button[onclick*="toggleFilterLayout(\'estimate\'"]');
        const btnCompact = settingsButtons[0];
        const btnSegmented = settingsButtons[1];

        if (version === 'compact') {
            if (compact) compact.style.display = 'flex';
            if (segmented) segmented.style.display = 'none';
            if (btnCompact) {
                btnCompact.style.background = themeColor;
                btnCompact.style.color = 'white';
            }
            if (btnSegmented) {
                btnSegmented.style.background = 'white';
                btnSegmented.style.color = '#333';
            }
            window.estimateLayout = 'compact';
            if (typeof window.renderEstimateList === 'function') {
                window.renderEstimateList();
            }
        } else {
            const viewType = document.getElementById('estimateViewType').value;
            setEstimateViewType(viewType);
            if (compact) compact.style.display = 'none';
            if (segmented) segmented.style.display = 'block';
            if (btnCompact) {
                btnCompact.style.background = 'white';
                btnCompact.style.color = '#333';
            }
            if (btnSegmented) {
                btnSegmented.style.background = themeColor;
                btnSegmented.style.color = 'white';
            }
            window.estimateLayout = 'segmented';
        }
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
    } else if (page === 'actual') {
        const compact = document.getElementById('actualFiltersCompact');
        const segmented = document.getElementById('actualFiltersSegmented');

        const settingsButtons = document.querySelectorAll('#settings button[onclick*="toggleFilterLayout(\'actual\'"]');
        const btnCompact = settingsButtons[0];
        const btnSegmented = settingsButtons[1];

        if (version === 'compact') {
            const viewMode = document.getElementById('actualViewMode2');
            const memberSelect = document.getElementById('actualMemberSelect2');
            const monthFilter = document.getElementById('actualMonthFilter2');
            if (viewMode) document.getElementById('actualViewMode').value = viewMode.value;
            if (memberSelect) document.getElementById('actualMemberSelect').value = memberSelect.value;
            if (monthFilter) document.getElementById('actualMonthFilter').value = monthFilter.value;

            if (compact) compact.style.display = 'flex';
            if (segmented) segmented.style.display = 'none';
            if (btnCompact) {
                btnCompact.style.background = themeColor;
                btnCompact.style.color = 'white';
            }
            if (btnSegmented) {
                btnSegmented.style.background = 'white';
                btnSegmented.style.color = '#333';
            }
            window.actualLayout = 'compact';
            if (typeof window.renderActualList === 'function') {
                window.renderActualList();
            }
        } else {
            const viewMode = document.getElementById('actualViewMode');
            const memberSelect = document.getElementById('actualMemberSelect');
            const monthFilter = document.getElementById('actualMonthFilter');
            if (viewMode) document.getElementById('actualViewMode2').value = viewMode.value;
            if (memberSelect) document.getElementById('actualMemberSelect2').value = memberSelect.value;
            if (monthFilter) document.getElementById('actualMonthFilter2').value = monthFilter.value;

            const viewType = document.getElementById('actualViewType').value;
            setActualViewType(viewType);
            if (compact) compact.style.display = 'none';
            if (segmented) segmented.style.display = 'block';
            if (btnCompact) {
                btnCompact.style.background = 'white';
                btnCompact.style.color = '#333';
            }
            if (btnSegmented) {
                btnSegmented.style.background = themeColor;
                btnSegmented.style.color = 'white';
            }
            window.actualLayout = 'segmented';
        }
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
    } else if (page === 'report') {
        const compact = document.getElementById('reportFiltersCompact');
        const segmented = document.getElementById('reportFiltersSegmented');

        const settingsButtons = document.querySelectorAll('#settings button[onclick*="toggleFilterLayout(\'report\'"]');
        const btnCompact = settingsButtons[0];
        const btnSegmented = settingsButtons[1];

        if (version === 'compact') {
            const reportMonth2 = document.getElementById('reportMonth2');
            if (reportMonth2) document.getElementById('reportMonth').value = reportMonth2.value;

            if (compact) compact.style.display = 'flex';
            if (segmented) segmented.style.display = 'none';
            if (btnCompact) {
                btnCompact.style.background = themeColor;
                btnCompact.style.color = 'white';
            }
            if (btnSegmented) {
                btnSegmented.style.background = 'white';
                btnSegmented.style.color = '#333';
            }
            window.reportLayout = 'compact';
            if (typeof window.updateReport === 'function') {
                window.updateReport();
            }
        } else {
            const reportMonth = document.getElementById('reportMonth');
            if (reportMonth) document.getElementById('reportMonth2').value = reportMonth.value;

            const viewType = document.getElementById('reportViewType').value;
            setReportViewType(viewType);
            if (compact) compact.style.display = 'none';
            if (segmented) segmented.style.display = 'block';
            if (btnCompact) {
                btnCompact.style.background = 'white';
                btnCompact.style.color = '#333';
            }
            if (btnSegmented) {
                btnSegmented.style.background = themeColor;
                btnSegmented.style.color = 'white';
            }
            window.reportLayout = 'segmented';
        }
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
    }
}

export function updateLayoutToggleButtons() {
    const themeColor = getThemeColor();

    // 見積一覧のボタン
    const estimateButtons = document.querySelectorAll('#settings button[onclick*="toggleFilterLayout(\'estimate\'"]');
    if (estimateButtons.length >= 2) {
        const estimateCompact = document.getElementById('estimateFiltersCompact');
        const isCompactActive = estimateCompact && estimateCompact.style.display !== 'none';
        estimateButtons[0].style.background = isCompactActive ? themeColor : 'white';
        estimateButtons[0].style.color = isCompactActive ? 'white' : '#333';
        estimateButtons[1].style.background = !isCompactActive ? themeColor : 'white';
        estimateButtons[1].style.color = !isCompactActive ? 'white' : '#333';
    }

    // 実績一覧のボタン
    const actualButtons = document.querySelectorAll('#settings button[onclick*="toggleFilterLayout(\'actual\'"]');
    if (actualButtons.length >= 2) {
        const actualCompact = document.getElementById('actualFiltersCompact');
        const isCompactActive = actualCompact && actualCompact.style.display !== 'none';
        actualButtons[0].style.background = isCompactActive ? themeColor : 'white';
        actualButtons[0].style.color = isCompactActive ? 'white' : '#333';
        actualButtons[1].style.background = !isCompactActive ? themeColor : 'white';
        actualButtons[1].style.color = !isCompactActive ? 'white' : '#333';
    }

    // レポートのボタン
    const reportButtons = document.querySelectorAll('#settings button[onclick*="toggleFilterLayout(\'report\'"]');
    if (reportButtons.length >= 2) {
        const reportCompact = document.getElementById('reportFiltersCompact');
        const isCompactActive = reportCompact && reportCompact.style.display !== 'none';
        reportButtons[0].style.background = isCompactActive ? themeColor : 'white';
        reportButtons[0].style.color = isCompactActive ? 'white' : '#333';
        reportButtons[1].style.background = !isCompactActive ? themeColor : 'white';
        reportButtons[1].style.color = !isCompactActive ? 'white' : '#333';
    }
}

export function updateSegmentedButtons() {
    // クイック入力のモードボタン
    const quickActualModeBtn = document.getElementById('quickActualModeBtn');
    const quickEstimateModeBtn = document.getElementById('quickEstimateModeBtn');
    const quickVacationModeBtn = document.getElementById('quickVacationModeBtn');
    if (quickActualModeBtn && quickEstimateModeBtn && quickVacationModeBtn) {
        if (typeof window.quickInputMode !== 'undefined') {
            const mode = window.quickInputMode;
            quickActualModeBtn.classList.toggle('active', mode === 'actual');
            quickEstimateModeBtn.classList.toggle('active', mode === 'estimate');
            quickVacationModeBtn.classList.toggle('active', mode === 'vacation');
        }
    }

    // 見積一覧のセグメントボタン（表示形式）
    const btnEstimateGrouped = document.getElementById('btnEstimateGrouped');
    const btnEstimateMatrix = document.getElementById('btnEstimateMatrix');
    const btnEstimateList = document.getElementById('btnEstimateList');
    if (btnEstimateGrouped && btnEstimateMatrix && btnEstimateList) {
        const estimateViewType = document.getElementById('estimateViewType').value;
        btnEstimateGrouped.classList.toggle('active', estimateViewType === 'grouped');
        btnEstimateMatrix.classList.toggle('active', estimateViewType === 'matrix');
        btnEstimateList.classList.toggle('active', estimateViewType === 'list');
    }

    // 見積一覧のセグメントボタン（フィルタタイプ）
    const estimateFilterType = document.getElementById('estimateFilterType');
    const btnEstimateFilterMonth = document.getElementById('btnEstimateFilterMonth');
    const btnEstimateFilterVersion = document.getElementById('btnEstimateFilterVersion');
    if (estimateFilterType && btnEstimateFilterMonth && btnEstimateFilterVersion) {
        const type = estimateFilterType.value;
        btnEstimateFilterMonth.classList.toggle('active', type === 'month');
        btnEstimateFilterVersion.classList.toggle('active', type === 'version');
    }

    // 見積一覧のセグメントボタン（表示月）
    const estimateMonthButtons = document.getElementById('estimateMonthButtons2');
    if (estimateMonthButtons) {
        const estimateMonthFilter = document.getElementById('estimateMonthFilter');
        if (estimateMonthFilter) {
            updateSegmentButtonSelection('estimateMonthButtons2', estimateMonthFilter.value);
        }
    }

    // 見積一覧のセグメントボタン（版数）
    const estimateVersionButtons = document.getElementById('estimateVersionButtons2');
    if (estimateVersionButtons) {
        const estimateVersionFilter = document.getElementById('estimateVersionFilter');
        if (estimateVersionFilter) {
            updateSegmentButtonSelection('estimateVersionButtons2', estimateVersionFilter.value);
        }
    }

    // 実績一覧のセグメントボタン（表示形式）
    const btnActualMatrix = document.getElementById('btnActualMatrix');
    const btnActualList = document.getElementById('btnActualList');
    if (btnActualMatrix && btnActualList) {
        const actualViewType = document.getElementById('actualViewType').value;
        btnActualMatrix.classList.toggle('active', actualViewType === 'matrix');
        btnActualList.classList.toggle('active', actualViewType === 'list');
    }

    // 実績一覧のセグメントボタン（担当者）
    const actualMemberButtons = document.getElementById('actualMemberButtons2');
    if (actualMemberButtons) {
        const actualMemberSelect = document.getElementById('actualMemberSelect');
        if (actualMemberSelect) {
            updateSegmentButtonSelection('actualMemberButtons2', actualMemberSelect.value);
        }
    }

    // 実績一覧のセグメントボタン（表示期間）
    const actualMonthButtons = document.getElementById('actualMonthButtons2');
    if (actualMonthButtons) {
        const actualMonthFilter = document.getElementById('actualMonthFilter');
        if (actualMonthFilter) {
            updateSegmentButtonSelection('actualMonthButtons2', actualMonthFilter.value);
        }
    }

    // レポートのセグメントボタン（表示形式）
    const btnReportSummary = document.getElementById('btnReportSummary');
    const btnReportGrouped = document.getElementById('btnReportGrouped');
    const btnReportMatrix = document.getElementById('btnReportMatrix');
    const reportViewTypeEl = document.getElementById('reportViewType');
    if (btnReportSummary && btnReportGrouped && btnReportMatrix && reportViewTypeEl) {
        const reportViewType = reportViewTypeEl.value;
        btnReportSummary.classList.toggle('active', reportViewType === 'summary');
        btnReportGrouped.classList.toggle('active', reportViewType === 'grouped');
        btnReportMatrix.classList.toggle('active', reportViewType === 'matrix');
    }

    const reportFilterType = document.getElementById('reportFilterType');

    // フローティングフィルタパネルのセグメントボタン
    const floatingViewSummary = document.getElementById('floatingViewSummary');
    const floatingViewGrouped = document.getElementById('floatingViewGrouped');
    const floatingViewMatrix = document.getElementById('floatingViewMatrix');
    if (floatingViewSummary && floatingViewGrouped && floatingViewMatrix && reportViewTypeEl) {
        const reportViewType = reportViewTypeEl.value;
        floatingViewSummary.classList.toggle('active', reportViewType === 'summary');
        floatingViewGrouped.classList.toggle('active', reportViewType === 'grouped');
        floatingViewMatrix.classList.toggle('active', reportViewType === 'matrix');
    }

    const floatingFilterMonth = document.getElementById('floatingFilterMonth');
    const floatingFilterVersion = document.getElementById('floatingFilterVersion');
    if (floatingFilterMonth && floatingFilterVersion && reportFilterType) {
        const type = reportFilterType.value;
        floatingFilterMonth.classList.toggle('active', type === 'month');
        floatingFilterVersion.classList.toggle('active', type === 'version');
    }

    // レポートのセグメントボタン（表示月）
    const reportMonthButtons = document.getElementById('reportMonthButtons2');
    if (reportMonthButtons) {
        const reportMonth = document.getElementById('reportMonth');
        if (reportMonth) {
            updateSegmentButtonSelection('reportMonthButtons2', reportMonth.value);
        }
    }

    // レポートのフィルタタイプボタン
    if (reportFilterType) {
        const btnFilterMonth = document.getElementById('btnFilterMonth');
        const btnFilterVersion = document.getElementById('btnFilterVersion');
        if (btnFilterMonth && btnFilterVersion) {
            const type = reportFilterType.value;
            btnFilterMonth.classList.toggle('active', type === 'month');
            btnFilterVersion.classList.toggle('active', type === 'version');
        }
    }

    // レポートの版数ボタン
    const reportVersionButtons = document.getElementById('reportVersionButtons2');
    if (reportVersionButtons) {
        const reportVersion = document.getElementById('reportVersion');
        if (reportVersion) {
            updateSegmentButtonSelection('reportVersionButtons2', reportVersion.value);
        }
    }

    // 全てのセグメントボタンにテーマカラーを適用
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
    const gradient = gradients[window.currentThemeColor] || gradients['purple'];

    // 全てのセグメントボタンにテーマカラーを適用
    // 通常のセグメントボタンと、フローティングフィルタボタンの両方を対象にする
    const allSegmentButtons = document.querySelectorAll('.segment-buttons button, .floating-filter-buttons button, .floating-segment-buttons button');
    allSegmentButtons.forEach(btn => {
        if (btn.classList.contains('active')) {
            btn.style.background = gradient;
            btn.style.color = 'white';
            btn.style.borderColor = 'transparent';
        } else {
            btn.style.background = 'white';
            btn.style.color = '#333';
            btn.style.borderColor = '#ddd';
        }
    });
}

// ============================================
// オプション更新
// ============================================

export function updateMemberOptions() {
    const members = new Set();
    estimates.forEach(e => members.add(e.member));
    actuals.forEach(a => members.add(a.member));

    let sortedMembers;
    const memberOrderInput = document.getElementById('memberOrder');
    const memberOrderValue = memberOrderInput ? memberOrderInput.value.trim() : '';

    if (memberOrderValue) {
        const orderList = memberOrderValue.split(',').map(m => m.trim()).filter(m => m);
        const orderedMembers = [];
        const unorderedMembers = [];

        orderList.forEach(name => {
            if (members.has(name)) {
                orderedMembers.push(name);
            }
        });

        Array.from(members).forEach(m => {
            if (!orderedMembers.includes(m)) {
                unorderedMembers.push(m);
            }
        });

        sortedMembers = [...orderedMembers, ...unorderedMembers.sort()];
    } else {
        sortedMembers = Array.from(members).sort();
    }

    // 各工程の担当者選択肢を更新
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    processes.forEach(process => {
        // 見積管理タブ
        const select = document.getElementById(`est${process}_member`);
        if (select) {
            updateSelectOptions(select, sortedMembers, true);
        }

        // クイック入力の見積登録フォーム
        const quickEstSelect = document.getElementById(`quickEst${process}_member`);
        if (quickEstSelect) {
            updateSelectOptions(quickEstSelect, sortedMembers, true);
        }

        // 見積登録モーダル
        const addEstSelect = document.getElementById(`addEst${process}_member`);
        if (addEstSelect) {
            updateSelectOptions(addEstSelect, sortedMembers, true);
        }
    });

    // クイック入力の担当者選択肢
    const quickMemberSelect = document.getElementById('quickMember');
    if (quickMemberSelect) {
        updateSelectOptions(quickMemberSelect, sortedMembers, false, true);
    }

    // その他作業の担当者選択肢
    const otherWorkMemberSelect = document.getElementById('otherWorkMember');
    if (otherWorkMemberSelect) {
        const currentValue = otherWorkMemberSelect.value;
        otherWorkMemberSelect.innerHTML = '<option value="">選択...</option>';
        sortedMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member;
            option.textContent = member;
            otherWorkMemberSelect.appendChild(option);
        });
        if (currentValue && sortedMembers.includes(currentValue)) {
            otherWorkMemberSelect.value = currentValue;
        }
    }

    // 実績編集モーダルの担当者選択肢
    const editActualMemberSelect = document.getElementById('editActualMember');
    if (editActualMemberSelect) {
        updateSelectOptions(editActualMemberSelect, sortedMembers, false, true);
    }

    // 休暇登録フォームの担当者選択肢
    const quickVacationMemberSelect = document.getElementById('quickVacationMember');
    if (quickVacationMemberSelect) {
        updateSelectOptions(quickVacationMemberSelect, sortedMembers, false, true);
    }

    // 見積編集モーダルの担当者選択肢
    const editEstimateMemberSelect = document.getElementById('editEstimateMember');
    if (editEstimateMemberSelect) {
        updateSelectOptions(editEstimateMemberSelect, sortedMembers, false);
    }
}

// セレクトオプション更新ヘルパー
function updateSelectOptions(select, members, addEmpty = false, selectFirst = false) {
    const currentValue = select.value;
    select.innerHTML = addEmpty ? '<option value="">-</option>' : '';

    members.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        select.appendChild(option);
    });

    if (currentValue && members.includes(currentValue)) {
        select.value = currentValue;
    } else if (selectFirst && members.length > 0) {
        select.value = members[0];
    }
}

export function updateVersionOptions() {
    try {
        const versions = new Set();
        estimates.forEach(e => {
            if (e.version) versions.add(e.version);
        });
        actuals.forEach(a => {
            if (a.version) versions.add(a.version);
        });

        const sortedVersions = Array.from(versions).sort();

        const versionSelects = [
            'estVersion',
            'quickEstVersion',
            'editActualVersion',
            'editEstimateVersion',
            'addEstVersion'
        ];

        versionSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- 版数を選択 --</option>';

                const newOption = document.createElement('option');
                newOption.value = '__new__';
                newOption.textContent = '+ 新しい版数を追加...';
                select.appendChild(newOption);

                sortedVersions.forEach(version => {
                    const option = document.createElement('option');
                    option.value = version;
                    option.textContent = version;
                    select.appendChild(option);
                });

                if (currentValue && currentValue !== '__new__') {
                    select.value = currentValue;
                } else if (sortedVersions.length > 0 && selectId === 'addEstVersion') {
                    select.value = sortedVersions[sortedVersions.length - 1];
                }
            }
        });

        updateReportVersionOptions(sortedVersions);
    } catch (e) {
        console.error('updateVersionOptions error:', e);
    }
}

export function updateFormNameOptions() {
    try {
        const formNames = new Set();
        estimates.forEach(e => {
            if (e.task) {
                if (e.task.includes('_')) {
                    const formName = e.task.split('_')[0];
                    if (formName.trim()) {
                        formNames.add(formName.trim());
                    }
                } else if (e.task.includes('：')) {
                    const formName = e.task.split('：')[0];
                    if (formName.trim()) {
                        formNames.add(formName.trim());
                    }
                }
            }
        });

        const sortedFormNames = Array.from(formNames).sort();

        const selectIds = ['quickEstFormNameSelect', 'addEstFormNameSelect', 'editTaskFormNameSelect'];
        selectIds.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- 帳票名を選択 --</option>';

                sortedFormNames.forEach(formName => {
                    const option = document.createElement('option');
                    option.value = formName;
                    option.textContent = formName;
                    select.appendChild(option);
                });

                const newOption = document.createElement('option');
                newOption.value = '__new__';
                newOption.textContent = '新規入力';
                select.appendChild(newOption);

                if (currentValue && (currentValue === '__new__' || sortedFormNames.includes(currentValue))) {
                    select.value = currentValue;
                }
            }
        });
    } catch (e) {
        console.error('updateFormNameOptions error:', e);
    }
}

export function updateReportVersionOptions(sortedVersions) {
    try {
        if (!sortedVersions) {
            const versions = new Set();
            estimates.forEach(e => {
                if (e.version && e.version.trim() !== '') {
                    versions.add(e.version);
                }
            });
            actuals.forEach(a => {
                if (a.version && a.version.trim() !== '') {
                    versions.add(a.version);
                }
            });
            sortedVersions = Array.from(versions).sort();
        } else {
            sortedVersions = sortedVersions.slice().sort();
        }

        const select = document.getElementById('reportVersion');
        const select2 = document.getElementById('reportVersion2');

        if (!select) return;

        const isFirstLoad = !select.dataset.initialized;
        const lastVersion = sortedVersions.length > 0 ? sortedVersions[sortedVersions.length - 1] : 'all';
        const currentValue = isFirstLoad ? lastVersion : (select.value || 'all');

        select.innerHTML = '<option value="all">全版数</option>';
        if (select2) select2.innerHTML = '<option value="all">全版数</option>';

        sortedVersions.forEach(version => {
            const option = document.createElement('option');
            option.value = version;
            option.textContent = version;
            select.appendChild(option);

            if (select2) {
                const option2 = document.createElement('option');
                option2.value = version;
                option2.textContent = version;
                select2.appendChild(option2);
            }
        });

        select.value = currentValue;
        if (select2) select2.value = currentValue;
        select.dataset.initialized = 'true';

        // セグメントボタン版を生成
        const items = [
            { value: 'all', label: '全版数' },
            ...sortedVersions.map(version => ({
                value: version,
                label: version
            }))
        ];
        createSegmentButtons(
            'reportVersionButtons2',
            'reportVersion2',
            items,
            currentValue,
            8,
            handleReportVersionChange
        );
    } catch (e) {
        console.error('updateReportVersionOptions error:', e);
    }
}

export function updateMonthOptions() {
    const select = document.getElementById('reportMonth');
    const select2 = document.getElementById('reportMonth2');
    const months = new Set();

    actuals.forEach(a => {
        if (a.date) {
            const month = a.date.substring(0, 7);
            months.add(month);
        }
    });

    const sortedMonths = Array.from(months).sort();

    select.innerHTML = '<option value="all">全期間</option>';
    if (select2) select2.innerHTML = '<option value="all">全期間</option>';

    sortedMonths.forEach(month => {
        const [year, monthNum] = month.split('-');
        const option = document.createElement('option');
        option.value = month;
        option.textContent = `${year}年${parseInt(monthNum)}月`;
        select.appendChild(option);

        if (select2) {
            const option2 = document.createElement('option');
            option2.value = month;
            option2.textContent = `${year}年${parseInt(monthNum)}月`;
            select2.appendChild(option2);
        }
    });

    const items = [
        { value: 'all', label: '全期間' },
        ...sortedMonths.slice().map(month => {
            const [year, monthNum] = month.split('-');
            return {
                value: month,
                label: `${year}/${parseInt(monthNum)}`
            };
        })
    ];
    const currentValue = select.value || 'all';
    createSegmentButtons(
        'reportMonthButtons2',
        'reportMonth2',
        items,
        currentValue,
        8,
        handleReportMonthChange
    );
}

export function updateEstimateMonthOptions() {
    const select = document.getElementById('estimateMonthFilter');
    const select2 = document.getElementById('estimateMonthFilter2');
    if (!select) return;

    const months = new Set();

    estimates.forEach(e => {
        const est = normalizeEstimate(e);
        est.workMonths.forEach(month => {
            if (month && month !== 'unassigned') {
                months.add(month);
            }
        });
    });

    const sortedMonths = Array.from(months).sort().reverse();

    select.innerHTML = '<option value="all">全期間</option>';
    if (select2) select2.innerHTML = '<option value="all">全期間</option>';

    sortedMonths.forEach(month => {
        const [year, monthNum] = month.split('-');
        const option = document.createElement('option');
        option.value = month;
        option.textContent = `${year}年${parseInt(monthNum)}月`;
        select.appendChild(option);

        if (select2) {
            const option2 = document.createElement('option');
            option2.value = month;
            option2.textContent = `${year}年${parseInt(monthNum)}月`;
            select2.appendChild(option2);
        }
    });

    const items = [
        { value: 'all', label: '全期間' },
        ...sortedMonths.slice().reverse().map(month => {
            const [year, monthNum] = month.split('-');
            return {
                value: month,
                label: `${year}/${parseInt(monthNum)}`
            };
        })
    ];
    const currentValue = select.value || 'all';
    createSegmentButtons(
        'estimateMonthButtons2',
        'estimateMonthFilter2',
        items,
        currentValue,
        8,
        handleEstimateMonthChange
    );
}

export function updateEstimateVersionOptions() {
    const select = document.getElementById('estimateVersionFilter');
    const select2 = document.getElementById('estimateVersionFilter2');
    if (!select) return;

    const versions = new Set();

    estimates.forEach(e => {
        if (e.version) {
            versions.add(e.version);
        }
    });

    const sortedVersions = Array.from(versions).sort().reverse();

    select.innerHTML = '<option value="all">全版数</option>';
    if (select2) select2.innerHTML = '<option value="all">全版数</option>';

    sortedVersions.forEach(version => {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        select.appendChild(option);

        if (select2) {
            const option2 = document.createElement('option');
            option2.value = version;
            option2.textContent = version;
            select2.appendChild(option2);
        }
    });

    const defaultValue = sortedVersions.length > 0 ? sortedVersions[0] : 'all';
    select.value = defaultValue;
    if (select2) select2.value = defaultValue;

    const items = [
        { value: 'all', label: '全版数' },
        ...sortedVersions.slice().reverse().map(version => {
            return {
                value: version,
                label: version
            };
        })
    ];
    createSegmentButtons(
        'estimateVersionButtons2',
        'estimateVersionFilter2',
        items,
        defaultValue,
        8,
        handleEstimateVersionChange
    );
}

export function updateActualMonthOptions() {
    const select = document.getElementById('actualMonthFilter');
    const select2 = document.getElementById('actualMonthFilter2');

    const currentValue = select ? select.value : 'all';

    const months = new Set();

    actuals.forEach(a => {
        if (a.date) {
            const month = a.date.substring(0, 7);
            months.add(month);
        }
    });

    const sortedMonths = Array.from(months).sort().reverse();

    if (select) {
        select.innerHTML = '<option value="all">全期間</option>';
        sortedMonths.forEach(month => {
            const [year, monthNum] = month.split('-');
            const option = document.createElement('option');
            option.value = month;
            option.textContent = `${year}年${parseInt(monthNum)}月`;
            select.appendChild(option);
        });
    }

    if (select2) {
        select2.innerHTML = '<option value="all">全期間</option>';
        sortedMonths.forEach(month => {
            const [year, monthNum] = month.split('-');
            const option2 = document.createElement('option');
            option2.value = month;
            option2.textContent = `${year}年${parseInt(monthNum)}月`;
            select2.appendChild(option2);
        });
    }

    const validValue = sortedMonths.includes(currentValue) || currentValue === 'all' ? currentValue : 'all';
    if (select) select.value = validValue;
    if (select2) select2.value = validValue;

    const items = [
        { value: 'all', label: '全期間' },
        ...sortedMonths.slice().reverse().map(month => {
            const [year, monthNum] = month.split('-');
            return {
                value: month,
                label: `${year}/${parseInt(monthNum)}`
            };
        })
    ];
    createSegmentButtons(
        'actualMonthButtons2',
        'actualMonthFilter2',
        items,
        validValue,
        8,
        handleActualMonthChange
    );
}

// ============================================
// デフォルト月設定
// ============================================

export function getDefaultMonth(selectElement) {
    const options = Array.from(selectElement.options);
    // 'all' と 'unassigned' を除外（'unassigned' は文字列比較で日付より大きくなるため）
    const monthOptions = options.filter(opt => opt.value !== 'all' && opt.value !== 'unassigned');

    if (monthOptions.length > 0) {
        const latestMonth = monthOptions.reduce((latest, opt) => {
            return opt.value > latest ? opt.value : latest;
        }, monthOptions[0].value);
        return latestMonth;
    }

    return 'all';
}

export function setDefaultActualMonth() {
    const select = document.getElementById('actualMonthFilter');
    if (!select) return;

    const select2 = document.getElementById('actualMonthFilter2');

    const defaultMonth = getDefaultMonth(select);
    select.value = defaultMonth;
    if (select2) select2.value = defaultMonth;

    updateSegmentButtonSelection('actualMonthButtons2', defaultMonth);
}

export function setDefaultReportMonth() {
    const select = document.getElementById('reportMonth');
    if (!select) return;

    const select2 = document.getElementById('reportMonth2');

    const defaultMonth = getDefaultMonth(select);
    select.value = defaultMonth;
    if (select2) select2.value = defaultMonth;

    updateSegmentButtonSelection('reportMonthButtons2', defaultMonth);
}

export function setDefaultEstimateMonth() {
    const select = document.getElementById('estimateMonthFilter');
    if (!select) return 'all';

    const defaultMonth = getDefaultMonth(select);
    select.value = defaultMonth;

    // セグメントボタンと2番目のselectも更新
    const select2 = document.getElementById('estimateMonthFilter2');
    if (select2) select2.value = defaultMonth;
    updateSegmentButtonSelection('estimateMonthButtons2', defaultMonth);

    return defaultMonth;
}

// ============================================
// フィルタ同期ハンドラ
// ============================================

export function syncMonthToReport(value) {
    const reportMonth = document.getElementById('reportMonth');
    const reportMonth2 = document.getElementById('reportMonth2');
    if (reportMonth) reportMonth.value = value;
    if (reportMonth2) reportMonth2.value = value;

    const reportMonthButtons2 = document.getElementById('reportMonthButtons2');
    if (reportMonthButtons2) {
        updateSegmentButtonSelection('reportMonthButtons2', value);
    }
}

export function syncMonthToEstimate(value) {
    const estimateMonthFilter = document.getElementById('estimateMonthFilter');
    const estimateMonthFilter2 = document.getElementById('estimateMonthFilter2');
    if (estimateMonthFilter) estimateMonthFilter.value = value;
    if (estimateMonthFilter2) estimateMonthFilter2.value = value;

    const estimateMonthButtons2 = document.getElementById('estimateMonthButtons2');
    if (estimateMonthButtons2) {
        updateSegmentButtonSelection('estimateMonthButtons2', value);
    }
}

export function syncVersionToReport(value) {
    const reportVersion = document.getElementById('reportVersion');
    const reportVersion2 = document.getElementById('reportVersion2');
    if (reportVersion) reportVersion.value = value;
    if (reportVersion2) reportVersion2.value = value;

    const reportVersionButtons2 = document.getElementById('reportVersionButtons2');
    if (reportVersionButtons2) {
        updateSegmentButtonSelection('reportVersionButtons2', value);
    }
}

export function syncVersionToEstimate(value) {
    const estimateVersionFilter = document.getElementById('estimateVersionFilter');
    const estimateVersionFilter2 = document.getElementById('estimateVersionFilter2');
    if (estimateVersionFilter) estimateVersionFilter.value = value;
    if (estimateVersionFilter2) estimateVersionFilter2.value = value;

    const estimateVersionButtons2 = document.getElementById('estimateVersionButtons2');
    if (estimateVersionButtons2) {
        updateSegmentButtonSelection('estimateVersionButtons2', value);
    }
}

export function syncFilterTypeToReport(type) {
    const reportFilterType = document.getElementById('reportFilterType');
    if (reportFilterType && reportFilterType.value !== type) {
        reportFilterType.value = type;

        const monthFilterCompact = document.getElementById('reportMonthFilterCompact');
        const versionFilterCompact = document.getElementById('reportVersionFilterCompact');
        const monthFilterSegmented = document.getElementById('reportMonthFilterSegmented');
        const versionFilterSegmented = document.getElementById('reportVersionFilterSegmented');

        if (type === 'month') {
            if (monthFilterCompact) monthFilterCompact.style.display = 'flex';
            if (versionFilterCompact) versionFilterCompact.style.display = 'none';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'none';
        } else {
            if (monthFilterCompact) monthFilterCompact.style.display = 'none';
            if (versionFilterCompact) versionFilterCompact.style.display = 'flex';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'none';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';
        }

        updateFilterTypeButtons(type);
    }
}

export function syncFilterTypeToEstimate(type) {
    const estimateFilterType = document.getElementById('estimateFilterType');
    if (estimateFilterType && estimateFilterType.value !== type) {
        estimateFilterType.value = type;

        const monthFilterCompact = document.getElementById('estimateMonthFilterCompact');
        const versionFilterCompact = document.getElementById('estimateVersionFilterCompact');
        const monthFilterSegmented = document.getElementById('estimateMonthFilterSegmented');
        const versionFilterSegmented = document.getElementById('estimateVersionFilterSegmented');

        if (type === 'month') {
            if (monthFilterCompact) monthFilterCompact.style.display = 'flex';
            if (versionFilterCompact) versionFilterCompact.style.display = 'none';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'none';
        } else {
            if (monthFilterCompact) monthFilterCompact.style.display = 'none';
            if (versionFilterCompact) versionFilterCompact.style.display = 'flex';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'none';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';
        }

        const themeColor = getThemeColor();
        const btnMonth = document.getElementById('btnEstimateFilterMonth');
        const btnVersion = document.getElementById('btnEstimateFilterVersion');

        if (type === 'month') {
            if (btnMonth) btnMonth.classList.add('active');
            if (btnVersion) btnVersion.classList.remove('active');
        } else {
            if (btnMonth) btnMonth.classList.remove('active');
            if (btnVersion) btnVersion.classList.add('active');
        }
    }
}

export function updateFilterTypeButtons(type) {
    const btnMonth = document.getElementById('btnFilterMonth');
    const btnVersion = document.getElementById('btnFilterVersion');

    if (btnMonth) btnMonth.classList.toggle('active', type === 'month');
    if (btnVersion) btnVersion.classList.toggle('active', type === 'version');
}

// ============================================
// フィルタ変更ハンドラ
// ============================================

export function handleActualMemberChange(value, containerId) {
    const select = document.getElementById('actualMemberSelect');
    const select2 = document.getElementById('actualMemberSelect2');
    if (select) select.value = value;
    if (select2) select2.value = value;
    updateSegmentButtonSelection(containerId, value);
    if (typeof window.renderActualList === 'function') {
        window.renderActualList();
    }
}

export function handleActualMonthChange(value, containerId) {
    const select = document.getElementById('actualMonthFilter');
    const select2 = document.getElementById('actualMonthFilter2');
    if (select) select.value = value;
    if (select2) select2.value = value;
    updateSegmentButtonSelection(containerId, value);
    if (typeof window.renderActualList === 'function') {
        window.renderActualList();
    }
}

export function handleEstimateMonthChange(value, containerId) {
    const filterElement = document.getElementById('estimateMonthFilter');
    if (filterElement) {
        filterElement.value = value;
    }
    updateSegmentButtonSelection(containerId, value);
    syncMonthToReport(value);
    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }
}

export function handleEstimateVersionChange(value, containerId) {
    const filterElement = document.getElementById('estimateVersionFilter');
    if (filterElement) {
        filterElement.value = value;
    }
    updateSegmentButtonSelection(containerId, value);
    syncVersionToReport(value);
    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }
}

export function handleReportMonthChange(value, containerId) {
    const select = document.getElementById('reportMonth');
    const select2 = document.getElementById('reportMonth2');
    if (select) select.value = value;
    if (select2) select2.value = value;
    updateSegmentButtonSelection(containerId, value);
    syncMonthToEstimate(value);
    if (typeof window.updateReport === 'function') {
        window.updateReport();
    }
}

export function handleReportVersionChange(value, containerId) {
    const select = document.getElementById('reportVersion');
    const select2 = document.getElementById('reportVersion2');
    if (select) select.value = value;
    if (select2) select2.value = value;
    updateSegmentButtonSelection(containerId, value);
    syncVersionToEstimate(value);
    if (typeof window.updateReport === 'function') {
        window.updateReport();
    }
}

export function handleEstimateFilterTypeChange() {
    const filterType = document.getElementById('estimateFilterType').value;
    const monthFilterCompact = document.getElementById('estimateMonthFilterCompact');
    const versionFilterCompact = document.getElementById('estimateVersionFilterCompact');
    const monthFilterSegmented = document.getElementById('estimateMonthFilterSegmented');
    const versionFilterSegmented = document.getElementById('estimateVersionFilterSegmented');

    if (filterType === 'month') {
        if (monthFilterCompact) monthFilterCompact.style.display = 'flex';
        if (versionFilterCompact) versionFilterCompact.style.display = 'none';
        if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
        if (versionFilterSegmented) versionFilterSegmented.style.display = 'none';

        const estimateMonthEl = document.getElementById('estimateMonthFilter');
        if (estimateMonthEl) {
            // 月オプションが「全期間」のみの場合、確実に 'all' を設定
            const hasMonthOptions = estimateMonthEl.options.length > 1;
            if (!hasMonthOptions) {
                estimateMonthEl.value = 'all';
                const estimateMonthEl2 = document.getElementById('estimateMonthFilter2');
                if (estimateMonthEl2) estimateMonthEl2.value = 'all';
                updateSegmentButtonSelection('estimateMonthButtons2', 'all');
            } else {
                // 月オプションがある場合は最新の月を選択（セグメントボタンも更新される）
                setDefaultEstimateMonth();
            }
        }
    } else {
        if (monthFilterCompact) monthFilterCompact.style.display = 'none';
        if (versionFilterCompact) versionFilterCompact.style.display = 'flex';
        if (monthFilterSegmented) monthFilterSegmented.style.display = 'none';
        if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';

        const estimateVersionEl = document.getElementById('estimateVersionFilter');
        if (estimateVersionEl && (!estimateVersionEl.value || estimateVersionEl.value === 'all')) {
            const options = estimateVersionEl.options;
            if (options.length > 1) {
                estimateVersionEl.value = options[1].value;
                const estimateVersion2El = document.getElementById('estimateVersionFilter2');
                if (estimateVersion2El) estimateVersion2El.value = options[1].value;
                updateSegmentButtonSelection('estimateVersionButtons2', options[1].value);
            }
        }
    }

    syncFilterTypeToReport(filterType);

    if (filterType === 'month') {
        const estimateMonthEl = document.getElementById('estimateMonthFilter');
        if (estimateMonthEl && estimateMonthEl.value) {
            syncMonthToReport(estimateMonthEl.value);
        }
    } else {
        const estimateVersionEl = document.getElementById('estimateVersionFilter');
        if (estimateVersionEl && estimateVersionEl.value) {
            syncVersionToReport(estimateVersionEl.value);
        }
    }

    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }
}

export function setEstimateFilterType(type) {
    const filterTypeEl = document.getElementById('estimateFilterType');
    if (filterTypeEl) filterTypeEl.value = type;

    const btnMonth = document.getElementById('btnEstimateFilterMonth');
    const btnVersion = document.getElementById('btnEstimateFilterVersion');

    if (type === 'month') {
        if (btnMonth) btnMonth.classList.add('active');
        if (btnVersion) btnVersion.classList.remove('active');
    } else {
        if (btnMonth) btnMonth.classList.remove('active');
        if (btnVersion) btnVersion.classList.add('active');
    }

    handleEstimateFilterTypeChange();
}

export function handleReportFilterTypeChange() {
    try {
        const filterTypeEl = document.getElementById('reportFilterType');
        if (!filterTypeEl) return;

        const filterType = filterTypeEl.value;
        const monthFilterCompact = document.getElementById('reportMonthFilterCompact');
        const versionFilterCompact = document.getElementById('reportVersionFilterCompact');
        const monthFilterSegmented = document.getElementById('reportMonthFilterSegmented');
        const versionFilterSegmented = document.getElementById('reportVersionFilterSegmented');

        if (filterType === 'month') {
            if (monthFilterCompact) monthFilterCompact.style.display = 'flex';
            if (versionFilterCompact) versionFilterCompact.style.display = 'none';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'none';

            const reportMonthEl = document.getElementById('reportMonth');
            if (reportMonthEl) {
                // 月オプションが「全期間」のみの場合、確実に 'all' を設定
                const hasMonthOptions = reportMonthEl.options.length > 1;
                if (!hasMonthOptions) {
                    reportMonthEl.value = 'all';
                    const reportMonth2El = document.getElementById('reportMonth2');
                    if (reportMonth2El) reportMonth2El.value = 'all';
                    updateSegmentButtonSelection('reportMonthButtons2', 'all');
                } else {
                    // 月オプションがある場合は最新の月を選択（セグメントボタンも更新される）
                    setDefaultReportMonth();
                }
            }
        } else {
            if (monthFilterCompact) monthFilterCompact.style.display = 'none';
            if (versionFilterCompact) versionFilterCompact.style.display = 'flex';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'none';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';

            const reportVersionEl = document.getElementById('reportVersion');
            if (reportVersionEl && (!reportVersionEl.value || reportVersionEl.value === 'all')) {
                const options = reportVersionEl.options;
                if (options.length > 1) {
                    reportVersionEl.value = options[1].value;
                    const reportVersion2El = document.getElementById('reportVersion2');
                    if (reportVersion2El) reportVersion2El.value = options[1].value;
                    updateSegmentButtonSelection('reportVersionButtons2', options[1].value);
                }
            }
        }

        updateFilterTypeButtons(filterType);
        syncFilterTypeToEstimate(filterType);

        if (filterType === 'month') {
            const reportMonthEl = document.getElementById('reportMonth');
            if (reportMonthEl && reportMonthEl.value) {
                syncMonthToEstimate(reportMonthEl.value);
            }
        } else {
            const reportVersionEl = document.getElementById('reportVersion');
            if (reportVersionEl && reportVersionEl.value) {
                syncVersionToEstimate(reportVersionEl.value);
            }
        }

        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    } catch (e) {
        console.error('handleReportFilterTypeChange error:', e);
    }
}

export function setReportFilterType(type) {
    try {
        const filterTypeEl = document.getElementById('reportFilterType');
        if (filterTypeEl) filterTypeEl.value = type;
        handleReportFilterTypeChange();
    } catch (e) {
        console.error('setReportFilterType error:', e);
    }
}

// ============================================
// 版数・帳票名変更ハンドラ
// ============================================

export function handleVersionChange(selectId) {
    const select = document.getElementById(selectId);
    if (select.value === '__new__') {
        const newVersion = prompt('新しい版数を入力してください（例: 第2025.12版）');
        if (newVersion && newVersion.trim()) {
            const option = document.createElement('option');
            option.value = newVersion.trim();
            option.textContent = newVersion.trim();
            select.insertBefore(option, select.options[2]);
            select.value = newVersion.trim();
        } else {
            select.value = '';
        }
    }

    if (selectId === 'editActualVersion') {
        const modal = document.getElementById('editActualModal');
        const memberSelect = document.getElementById('editActualMember');
        let member = memberSelect ? memberSelect.value : null;

        if (!member && modal && modal.dataset.calendarMember) {
            member = modal.dataset.calendarMember;
        }

        if (member && typeof window.updateEditActualTaskList === 'function') {
            const editIdInput = document.getElementById('editActualId');
            const isEditMode = editIdInput && editIdInput.value !== '';
            window.updateEditActualTaskList(member, isEditMode, select.value);
        }
    }
}

export function handleQuickFormNameChange() {
    const select = document.getElementById('quickEstFormNameSelect');
    const input = document.getElementById('quickEstFormName');

    if (select.value === '__new__') {
        select.style.display = 'none';
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.value = select.value;
    }
}

export function handleAddFormNameChange() {
    const select = document.getElementById('addEstFormNameSelect');
    const input = document.getElementById('addEstFormName');

    if (select.value === '__new__') {
        select.style.display = 'none';
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.value = select.value;
    }
}

export function handleEditFormNameChange() {
    const select = document.getElementById('editTaskFormNameSelect');
    const input = document.getElementById('editTaskFormName');

    if (select.value === '__new__') {
        select.style.display = 'none';
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.value = select.value;
    }
}

export function handleEditActualMemberChange() {
    const memberSelect = document.getElementById('editActualMember');
    const versionSelect = document.getElementById('editActualVersion');
    const member = memberSelect ? memberSelect.value : null;
    const version = versionSelect ? versionSelect.value : null;

    if (member && typeof window.updateEditActualTaskList === 'function') {
        const editIdInput = document.getElementById('editActualId');
        const isEditMode = editIdInput && editIdInput.value !== '';
        window.updateEditActualTaskList(member, isEditMode, version);
    }
}

// ============================================
// 設定値を読み込んでUIに反映
// ============================================

export function syncSettingsToUI() {
    // チェックボックス
    const checkboxMap = {
        'showMonthColorsCheckbox': showMonthColorsSetting,
        'showDeviationColorsCheckbox': showDeviationColorsSetting,
        'showProgressBarsCheckbox': showProgressBarsSetting,
        'showProgressPercentageCheckbox': showProgressPercentageSetting,
        'autoBackupEnabled': window.autoBackupEnabled
    };

    Object.entries(checkboxMap).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    });

    // 進捗バースタイル（ラジオボタン）
    if (progressBarStyle) {
        const radioButton = document.querySelector(`input[name="progressBarStyle"][value="${progressBarStyle}"]`);
        if (radioButton) radioButton.checked = true;
    }

    // 見積/実績表示形式（ラジオボタン）
    if (matrixEstActFormat) {
        const radioButton = document.querySelector(`input[name="matrixEstActFormat"][value="${matrixEstActFormat}"]`);
        if (radioButton) radioButton.checked = true;
    }

    // 日付/月表示形式（ラジオボタン）
    if (matrixDayMonthFormat) {
        const radioButton = document.querySelector(`input[name="matrixDayMonthFormat"][value="${matrixDayMonthFormat}"]`);
        if (radioButton) radioButton.checked = true;
    }

    // 担当者の表示順
    const memberOrderEl = document.getElementById('memberOrder');
    if (memberOrderEl && memberOrder) {
        memberOrderEl.value = memberOrder;
    }

    // テーマ設定の要素は Theme.loadThemeSettings で別途同期されるが、
    // ここでも念のため、State と window 変数を最終確認
}

/**
 * 全ての画面表示を更新
 */
export function updateAllDisplays() {
    console.log('🔄 全画面更新実行');

    // 担当者表示順をDOMから取得して状態に反映
    const memberOrderEl = document.getElementById('memberOrder');
    if (memberOrderEl) {
        const newValue = memberOrderEl.value.trim();
        setMemberOrder(newValue);
    }

    // 各モジュールのレンダリング関数を呼び出し
    // window を介して呼び出す（循環参照を避けるためと、init.js で確実に公開されているため）
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();

    console.log('✅ 全画面更新完了');
}

/**
 * 担当者表示順のヘルプを表示
 */
export function showMemberOrderHelp() {
    const helpMsg = `
        <strong>担当者表示順の設定方法:</strong><br><br>
        1. 担当者の名前をカンマ(,)区切りで入力します<br>
        2. ここで指定した順番で、実績一覧やレポートに表示されます<br>
        3. 指定しなかった担当者は、指定された人の後ろに名前順で表示されます<br><br>
        例: <code>佐藤,田中,山田</code><br><br>
        ※入力後は「設定を適用」ボタンを押すか、欄外をクリックすると反映されます。
    `;
    if (typeof window.showAlert === 'function') {
        window.showAlert(helpMsg, true);
    } else {
        alert('担当者表示順の設定方法:\n\n1. 担当者の名前をカンマ(,)区切りで入力します\n2. 指定した順番で表示されます\n3. 指定しなかった人は後ろに名前順で表示されます');
    }
}

console.log('✅ モジュール ui.js loaded');

