// ============================================
// タブ内フィルタドロワー
// ============================================

import { enableDragScroll } from './utils.js';

// 設定の保存/読み込み
export function saveTabBarAlwaysVisible() {
    const checkbox = document.getElementById('tabBarAlwaysVisible');
    if (!checkbox) return;
    localStorage.setItem('tabBarAlwaysVisible', checkbox.checked);
    applyTabBarVisibility();
}

export function loadTabBarAlwaysVisible() {
    const saved = localStorage.getItem('tabBarAlwaysVisible');
    const enabled = saved === 'true';
    const checkbox = document.getElementById('tabBarAlwaysVisible');
    if (checkbox) {
        checkbox.checked = enabled;
    }
    return enabled;
}

export function saveTabFilterAlwaysExpanded() {
    const checkbox = document.getElementById('tabFilterAlwaysExpanded');
    if (!checkbox) return;
    localStorage.setItem('tabFilterAlwaysExpanded', checkbox.checked);
    applyFilterExpansion();
}

export function loadTabFilterAlwaysExpanded() {
    const saved = localStorage.getItem('tabFilterAlwaysExpanded');
    const enabled = saved === 'true';
    const checkbox = document.getElementById('tabFilterAlwaysExpanded');
    if (checkbox) {
        checkbox.checked = enabled;
    }
    return enabled;
}

// タブバー常時表示の適用
export function applyTabBarVisibility() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;

    const alwaysVisible = loadTabBarAlwaysVisible();
    if (alwaysVisible) {
        tabs.classList.add('is-always-visible');
    } else {
        tabs.classList.remove('is-always-visible');
    }
}

// フィルタ展開状態の適用
export function applyFilterExpansion() {
    const drawer = document.getElementById('tabFilterDrawer');
    const tabs = document.querySelector('.tabs');
    const toggle = document.getElementById('tabFilterToggle');
    if (!drawer || !tabs) return;

    const alwaysExpanded = loadTabFilterAlwaysExpanded();
    if (alwaysExpanded) {
        drawer.classList.add('is-always-expanded');
        tabs.classList.add('filter-always-expanded');
        if (toggle) toggle.style.display = 'none';
    } else {
        drawer.classList.remove('is-always-expanded');
        tabs.classList.remove('filter-always-expanded');
        if (toggle) toggle.style.display = '';
    }
}

// フィルタドロワーのトグル
export function toggleTabFilterDrawer() {
    const drawer = document.getElementById('tabFilterDrawer');
    const toggle = document.getElementById('tabFilterToggle');
    if (!drawer) return;

    // 常時展開モードの場合は何もしない
    if (drawer.classList.contains('is-always-expanded')) return;

    const isExpanded = drawer.classList.toggle('is-expanded');
    if (toggle) {
        toggle.classList.toggle('is-active', isExpanded);
    }

    // フィルタ内容を更新
    if (isExpanded) {
        updateTabFilterContent();
    }
}

// 現在のタブに応じたフィルタ内容を更新
// scrollToActive: 初期表示時にアクティブボタンをスクロールするかどうか（デフォルト: true）
export function updateTabFilterContent(scrollToActive = true) {
    const content = document.getElementById('tabFilterContent');
    if (!content) return;

    // 現在のアクティブタブを取得
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;

    const tabId = activeTab.id;

    // タブに応じてフィルタ内容を生成
    if (tabId === 'report') {
        renderReportFilters(content, scrollToActive);
    } else if (tabId === 'estimate') {
        renderEstimateFilters(content, scrollToActive);
    } else {
        // フィルタが不要なタブ
        content.innerHTML = '';
        hideFilterToggle();
    }
}

// レポートタブ用フィルタ
function renderReportFilters(container, scrollToActive = true) {
    showFilterToggle();

    const reportMonth = document.getElementById('reportMonth');
    const reportVersion = document.getElementById('reportVersion');

    if (!reportMonth || !reportVersion) {
        container.innerHTML = '';
        return;
    }

    // 再描画前にスクロール位置を保存
    const oldVersionContainer = document.getElementById('tabFilterVersionButtons');
    const oldMonthContainer = document.getElementById('tabFilterMonthButtons');
    const savedVersionScroll = oldVersionContainer ? oldVersionContainer.scrollLeft : 0;
    const savedMonthScroll = oldMonthContainer ? oldMonthContainer.scrollLeft : 0;

    // 月フィルタボタンを生成
    const monthButtons = generateFilterButtons(reportMonth, (value) => {
        reportMonth.value = value;
        if (typeof window.handleReportMonthChange === 'function') {
            window.handleReportMonthChange(value, 'reportMonthButtons2');
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    });

    // 版数フィルタボタンを生成
    const versionButtons = generateFilterButtons(reportVersion, (value) => {
        reportVersion.value = value;
        if (typeof window.handleReportVersionChange === 'function') {
            window.handleReportVersionChange(value, 'reportVersionButtons2');
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    });

    container.innerHTML = `
        <div class="tab-filter-row">
            <span class="tab-filter-label">版数:</span>
            <div class="tab-filter-buttons" id="tabFilterVersionButtons">${versionButtons}</div>
        </div>
        <div class="tab-filter-row">
            <span class="tab-filter-label">表示月:</span>
            <div class="tab-filter-buttons" id="tabFilterMonthButtons">${monthButtons}</div>
        </div>
    `;

    // ボタンにイベントを設定
    setupFilterButtonEvents(container, 'tabFilterVersionButtons', reportVersion, (value) => {
        reportVersion.value = value;
        if (typeof window.handleReportVersionChange === 'function') {
            window.handleReportVersionChange(value, 'reportVersionButtons2');
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    });

    setupFilterButtonEvents(container, 'tabFilterMonthButtons', reportMonth, (value) => {
        reportMonth.value = value;
        if (typeof window.handleReportMonthChange === 'function') {
            window.handleReportMonthChange(value, 'reportMonthButtons2');
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    });

    // ドラッグスクロールを有効化
    const versionBtnContainer = document.getElementById('tabFilterVersionButtons');
    const monthBtnContainer = document.getElementById('tabFilterMonthButtons');
    if (versionBtnContainer) enableDragScroll(versionBtnContainer);
    if (monthBtnContainer) enableDragScroll(monthBtnContainer);

    // 初期表示時のみ、選択中ボタンを表示エリア内にスクロール
    // それ以外は保存したスクロール位置を復元
    if (scrollToActive) {
        scrollToActiveButton(versionBtnContainer);
        scrollToActiveButton(monthBtnContainer);
    } else {
        if (versionBtnContainer) versionBtnContainer.scrollLeft = savedVersionScroll;
        if (monthBtnContainer) monthBtnContainer.scrollLeft = savedMonthScroll;
    }
}

// 見積タブ用フィルタ
function renderEstimateFilters(container, scrollToActive = true) {
    showFilterToggle();

    const estimateMonth = document.getElementById('estimateMonthFilter');
    const estimateVersion = document.getElementById('estimateVersionFilter');

    if (!estimateMonth || !estimateVersion) {
        container.innerHTML = '';
        return;
    }

    // 再描画前にスクロール位置を保存
    const oldVersionContainer = document.getElementById('tabFilterEstVersionButtons');
    const oldMonthContainer = document.getElementById('tabFilterEstMonthButtons');
    const savedVersionScroll = oldVersionContainer ? oldVersionContainer.scrollLeft : 0;
    const savedMonthScroll = oldMonthContainer ? oldMonthContainer.scrollLeft : 0;

    // 月フィルタボタンを生成
    const monthButtons = generateFilterButtons(estimateMonth, (value) => {
        estimateMonth.value = value;
        if (typeof window.handleEstimateMonthChange === 'function') {
            window.handleEstimateMonthChange(value);
        } else {
            estimateMonth.dispatchEvent(new Event('change'));
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    });

    // 版数フィルタボタンを生成（ソート済み）
    const versionButtons = generateFilterButtons(estimateVersion, (value) => {
        estimateVersion.value = value;
        if (typeof window.handleEstimateVersionChange === 'function') {
            window.handleEstimateVersionChange(value);
        } else {
            estimateVersion.dispatchEvent(new Event('change'));
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    }, true);

    container.innerHTML = `
        <div class="tab-filter-row">
            <span class="tab-filter-label">版数:</span>
            <div class="tab-filter-buttons" id="tabFilterEstVersionButtons">${versionButtons}</div>
        </div>
        <div class="tab-filter-row">
            <span class="tab-filter-label">表示月:</span>
            <div class="tab-filter-buttons" id="tabFilterEstMonthButtons">${monthButtons}</div>
        </div>
    `;

    // ボタンにイベントを設定
    setupFilterButtonEvents(container, 'tabFilterEstVersionButtons', estimateVersion, (value) => {
        estimateVersion.value = value;
        if (typeof window.handleEstimateVersionChange === 'function') {
            window.handleEstimateVersionChange(value);
        } else {
            estimateVersion.dispatchEvent(new Event('change'));
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    });

    setupFilterButtonEvents(container, 'tabFilterEstMonthButtons', estimateMonth, (value) => {
        estimateMonth.value = value;
        if (typeof window.handleEstimateMonthChange === 'function') {
            window.handleEstimateMonthChange(value);
        } else {
            estimateMonth.dispatchEvent(new Event('change'));
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    });

    // ドラッグスクロールを有効化
    const versionBtnContainer = document.getElementById('tabFilterEstVersionButtons');
    const monthBtnContainer = document.getElementById('tabFilterEstMonthButtons');
    if (versionBtnContainer) enableDragScroll(versionBtnContainer);
    if (monthBtnContainer) enableDragScroll(monthBtnContainer);

    // 初期表示時のみ、選択中ボタンを表示エリア内にスクロール
    // それ以外は保存したスクロール位置を復元
    if (scrollToActive) {
        scrollToActiveButton(versionBtnContainer);
        scrollToActiveButton(monthBtnContainer);
    } else {
        if (versionBtnContainer) versionBtnContainer.scrollLeft = savedVersionScroll;
        if (monthBtnContainer) monthBtnContainer.scrollLeft = savedMonthScroll;
    }
}

// フィルタボタンのHTML生成
function generateFilterButtons(selectElement, onChange, sortVersion = false) {
    const currentValue = selectElement.value;
    let options = Array.from(selectElement.options);

    // 版数の場合はソート
    if (sortVersion) {
        const allOption = options.find(o => o.value === 'all');
        const otherOptions = options.filter(o => o.value !== 'all');
        otherOptions.sort((a, b) => a.text.localeCompare(b.text));
        options = [];
        if (allOption) options.push(allOption);
        options.push(...otherOptions);
    }

    return options.map(option => {
        const isActive = String(option.value) === String(currentValue);
        return `<button data-value="${option.value}" class="${isActive ? 'active' : ''}">${option.text}</button>`;
    }).join('');
}

// フィルタボタンにイベントを設定
function setupFilterButtonEvents(container, containerId, selectElement, onChange) {
    const buttonContainer = document.getElementById(containerId);
    if (!buttonContainer) return;

    buttonContainer.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            // スクロール検出を一時停止（タブが隠れるのを防ぐ）
            window.isTabInteracting = true;
            setTimeout(() => {
                window.isTabInteracting = false;
            }, 300);
            const value = btn.dataset.value;
            onChange(value);
        });
    });
}

// 選択中ボタンを表示エリア内にスクロール
function scrollToActiveButton(container) {
    if (!container) return;
    setTimeout(() => {
        const activeBtn = container.querySelector('button.active');
        if (activeBtn) {
            const containerRect = container.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (container.clientWidth / 2) + (btnRect.width / 2);
            container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'instant' });
        }
    }, 10);
}

// フィルタトグルボタンの表示/非表示
function showFilterToggle() {
    const tabs = document.querySelector('.tabs');
    if (tabs) {
        tabs.removeAttribute('data-filter-hidden');
    }
}

function hideFilterToggle() {
    const tabs = document.querySelector('.tabs');
    const drawer = document.getElementById('tabFilterDrawer');
    if (tabs) {
        tabs.setAttribute('data-filter-hidden', 'true');
    }
    if (drawer) {
        drawer.classList.remove('is-expanded');
    }
    const toggle = document.getElementById('tabFilterToggle');
    if (toggle) {
        toggle.classList.remove('is-active');
    }
}

// タブ切り替え時のフィルタ更新
export function onTabChange(tabId) {
    const drawer = document.getElementById('tabFilterDrawer');
    const toggle = document.getElementById('tabFilterToggle');

    // フィルタが必要なタブかどうか
    const filterTabs = ['report', 'estimate'];
    const needsFilter = filterTabs.includes(tabId);

    if (needsFilter) {
        showFilterToggle();
        // 常時展開または展開中の場合はフィルタ内容を更新
        if (drawer && (drawer.classList.contains('is-expanded') || drawer.classList.contains('is-always-expanded'))) {
            updateTabFilterContent();
        }
    } else {
        hideFilterToggle();
    }
}

// 初期化
export function initTabFilter() {
    // 設定を読み込み
    loadTabBarAlwaysVisible();
    loadTabFilterAlwaysExpanded();

    // 設定を適用
    applyTabBarVisibility();
    applyFilterExpansion();

    // トグルボタンのイベント
    const toggle = document.getElementById('tabFilterToggle');
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTabFilterDrawer();
        });
    }

    // 設定チェックボックスのイベント
    const tabBarCheckbox = document.getElementById('tabBarAlwaysVisible');
    if (tabBarCheckbox) {
        tabBarCheckbox.addEventListener('change', saveTabBarAlwaysVisible);
    }

    const filterCheckbox = document.getElementById('tabFilterAlwaysExpanded');
    if (filterCheckbox) {
        filterCheckbox.addEventListener('change', saveTabFilterAlwaysExpanded);
    }

    // 初期タブのフィルタ状態を設定
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        onTabChange(activeTab.id);
    }

    console.log('Tab filter initialized');
}

// グローバルに公開
window.toggleTabFilterDrawer = toggleTabFilterDrawer;
window.updateTabFilterContent = updateTabFilterContent;
window.onTabFilterChange = onTabChange;

console.log('tab-filter.js loaded');
