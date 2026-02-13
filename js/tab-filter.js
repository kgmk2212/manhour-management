// ============================================
// タブ内フィルタドロワー
// ============================================

import { enableDragScroll } from './utils.js';

// 実績月フィルタの全月展開状態（ページ固定フィルタと共有）
let _actualMonthExpanded = false;
export function getActualMonthExpanded() { return _actualMonthExpanded; }
export function setActualMonthExpanded(val) { _actualMonthExpanded = val; }

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

export function saveTabFilterButtonStyle() {
    const select = document.getElementById('tabFilterButtonStyle');
    if (!select) return;
    localStorage.setItem('tabFilterButtonStyle', select.value);
    applyFilterButtonStyle();
}

export function loadTabFilterButtonStyle() {
    const saved = localStorage.getItem('tabFilterButtonStyle');
    const style = saved || 'pill';
    const select = document.getElementById('tabFilterButtonStyle');
    if (select) {
        select.value = style;
    }
    return style;
}

// フィルタボタンスタイルの適用
export function applyFilterButtonStyle() {
    const drawer = document.getElementById('tabFilterDrawer');
    if (!drawer) return;

    const style = loadTabFilterButtonStyle();
    drawer.classList.remove('style-pill', 'style-segment');
    drawer.classList.add(`style-${style}`);
}

export function saveTabFilterLayout() {
    const select = document.getElementById('tabFilterLayout');
    if (!select) return;
    localStorage.setItem('tabFilterLayout', select.value);
    applyFilterLayout();
}

export function loadTabFilterLayout() {
    const saved = localStorage.getItem('tabFilterLayout');
    const layout = saved || 'two-lines';
    const select = document.getElementById('tabFilterLayout');
    if (select) {
        select.value = layout;
    }
    return layout;
}

// フィルタレイアウトの適用
export function applyFilterLayout() {
    const drawer = document.getElementById('tabFilterDrawer');
    if (!drawer) return;

    const layout = loadTabFilterLayout();
    drawer.classList.remove('layout-one-line', 'layout-two-lines');
    drawer.classList.add(`layout-${layout}`);
}

// ページ内フィルタ非表示設定
export function saveHideInlineFilters() {
    const checkbox = document.getElementById('hideInlineFilters');
    if (!checkbox) return;
    localStorage.setItem('hideInlineFilters', checkbox.checked);
    applyInlineFilterVisibility();
}

export function loadHideInlineFilters() {
    const saved = localStorage.getItem('hideInlineFilters');
    const hidden = saved === 'true';
    const checkbox = document.getElementById('hideInlineFilters');
    if (checkbox) {
        checkbox.checked = hidden;
    }
    return hidden;
}

export function applyInlineFilterVisibility() {
    const hidden = loadHideInlineFilters();
    if (hidden) {
        document.documentElement.dataset.inlineFilter = 'hidden';
    } else {
        document.documentElement.dataset.inlineFilter = 'visible';
    }
    // 表示時はapplyLayoutSettings()で正しいcompact/segmentedを表示させる
    if (!hidden && typeof window.applyLayoutSettings === 'function') {
        window.applyLayoutSettings();
    }
    // タブフィルタの内容を更新（表示形式ボタンの追加/削除のため）
    const drawer = document.getElementById('tabFilterDrawer');
    if (drawer && (drawer.classList.contains('is-expanded') || drawer.classList.contains('is-always-expanded'))) {
        updateTabFilterContent(false);
    }
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
    const tabs = document.querySelector('.tabs');
    if (!drawer) return;

    // 常時展開モードの場合は何もしない
    if (drawer.classList.contains('is-always-expanded')) return;

    // スクロール検出を一時停止（ドロワー展開によるレイアウト変更で誤検出されるのを防ぐ）
    window.isTabInteracting = true;

    // タブバーを強制的に表示状態にする（PC表示時の消失防止）
    if (tabs) {
        tabs.classList.remove('is-hidden');
    }

    const isExpanded = drawer.classList.toggle('is-expanded');
    if (toggle) {
        toggle.classList.toggle('is-active', isExpanded);
    }

    // フィルタ内容を更新
    if (isExpanded) {
        updateTabFilterContent();
    }

    // アニメーション完了後にフラグを解除（CSSトランジション0.3sより長く設定）
    setTimeout(() => {
        window.isTabInteracting = false;
    }, 400);
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
    } else if (tabId === 'actual') {
        renderActualFilters(content, scrollToActive);
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

    // 月フィルタボタンを生成（昇順ソート）
    const monthButtons = generateFilterButtons(reportMonth, (value) => {
        reportMonth.value = value;
        if (typeof window.handleReportMonthChange === 'function') {
            window.handleReportMonthChange(value, 'reportMonthButtons2');
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    }, 'month');

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

    // 月フィルタボタンを生成（昇順ソート）
    const monthButtons = generateFilterButtons(estimateMonth, (value) => {
        estimateMonth.value = value;
        if (typeof window.handleEstimateMonthChange === 'function') {
            window.handleEstimateMonthChange(value);
        } else {
            estimateMonth.dispatchEvent(new Event('change'));
        }
        updateTabFilterContent(false); // クリック時はスクロールしない
    }, 'month');

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

// 実績タブ用フィルタ
function renderActualFilters(container, scrollToActive = true) {
    showFilterToggle();

    const actualMonth = document.getElementById('actualMonthFilter');

    if (!actualMonth) {
        container.innerHTML = '';
        return;
    }

    // 再描画前にスクロール位置を保存
    const oldMonthContainer = document.getElementById('tabFilterActualMonthButtons');
    const savedMonthScroll = oldMonthContainer ? oldMonthContainer.scrollLeft : 0;

    // データがある月のSetを構築
    const monthsWithData = new Set();
    if (window.actuals) {
        window.actuals.forEach(a => {
            if (a.date) monthsWithData.add(a.date.substring(0, 7));
        });
    }

    const isExpanded = _actualMonthExpanded;
    const currentValue = actualMonth.value;

    // ボタン生成（データあり/なしで出し分け）
    const allOption = Array.from(actualMonth.options).find(o => o.value === 'all');
    const monthOptions = Array.from(actualMonth.options)
        .filter(o => o.value !== 'all')
        .sort((a, b) => a.value.localeCompare(b.value));

    let monthButtons = '';
    if (allOption) {
        const isActive = currentValue === 'all' ? 'active' : '';
        monthButtons += `<button data-value="all" class="${isActive}">${allOption.text}</button>`;
    }
    monthOptions.forEach(opt => {
        const hasData = monthsWithData.has(opt.value);
        const isSelected = String(opt.value) === String(currentValue);
        // 非展開時: データあり月 or 現在選択中の月のみ表示
        if (!isExpanded && !hasData && !isSelected) return;
        const classes = [
            isSelected ? 'active' : '',
            !hasData ? 'no-data' : ''
        ].filter(Boolean).join(' ');
        monthButtons += `<button data-value="${opt.value}" class="${classes}">${opt.text}</button>`;
    });

    // 全月表示トグルボタン（データなし月が存在する場合のみ）
    const hasEmptyMonths = monthOptions.some(o => !monthsWithData.has(o.value));
    let toggleHtml = '';
    if (hasEmptyMonths) {
        const toggleLabel = isExpanded ? '◂' : '▸';
        toggleHtml = `<button class="month-toggle-btn" id="actualMonthToggle">${toggleLabel}</button>`;
    }

    // ページ内フィルタ非表示時はカレンダー/リスト切替を表示
    const hidden = loadHideInlineFilters();
    let viewTypeRow = '';
    if (hidden) {
        const currentViewType = document.getElementById('actualViewType')?.value || 'matrix';
        viewTypeRow = `
            <div class="tab-filter-row">
                <span class="tab-filter-label">表示:</span>
                <div class="tab-filter-buttons" id="tabFilterActualViewType">
                    <button data-value="matrix" class="${currentViewType === 'matrix' ? 'active' : ''}">カレンダー</button>
                    <button data-value="list" class="${currentViewType === 'list' ? 'active' : ''}">リスト</button>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        ${viewTypeRow}
        <div class="tab-filter-row">
            <span class="tab-filter-label">表示月:</span>
            <div class="tab-filter-buttons" id="tabFilterActualMonthButtons">${monthButtons}</div>
            ${toggleHtml}
        </div>
    `;

    // 表示形式ボタンのイベント設定（ページ内フィルタ非表示時のみ）
    if (hidden) {
        const viewTypeBtns = document.getElementById('tabFilterActualViewType');
        if (viewTypeBtns) {
            viewTypeBtns.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.isTabInteracting = true;
                    setTimeout(() => { window.isTabInteracting = false; }, 300);
                    const value = btn.dataset.value;
                    viewTypeBtns.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    if (typeof window.setActualViewType === 'function') {
                        window.setActualViewType(value);
                    }
                });
            });
        }
    }

    // 全月表示トグルのイベント
    const toggleBtn = document.getElementById('actualMonthToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.isTabInteracting = true;
            setTimeout(() => { window.isTabInteracting = false; }, 300);
            _actualMonthExpanded = !_actualMonthExpanded;
            renderActualFilters(container, false);
        });
    }

    // 月ボタンにイベントを設定
    setupFilterButtonEvents(container, 'tabFilterActualMonthButtons', actualMonth, (value) => {
        actualMonth.value = value;
        if (typeof window.handleActualMonthChange === 'function') {
            window.handleActualMonthChange(value, 'actualMonthButtons2');
        } else {
            actualMonth.dispatchEvent(new Event('change'));
        }
        updateTabFilterContent(false);
    });

    // ドラッグスクロールを有効化
    const monthBtnContainer = document.getElementById('tabFilterActualMonthButtons');
    if (monthBtnContainer) enableDragScroll(monthBtnContainer);

    // 初期表示時のみ、選択中ボタンを表示エリア内にスクロール
    if (scrollToActive) {
        scrollToActiveButton(monthBtnContainer);
    } else {
        if (monthBtnContainer) monthBtnContainer.scrollLeft = savedMonthScroll;
    }
}

// フィルタボタンのHTML生成
// sortType: 'none' | 'version' | 'month'
function generateFilterButtons(selectElement, onChange, sortType = 'none') {
    const currentValue = selectElement.value;
    let options = Array.from(selectElement.options);

    // 版数の場合は昇順ソート（後方互換: sortType === true も対応）
    if (sortType === 'version' || sortType === true) {
        const allOption = options.find(o => o.value === 'all');
        const otherOptions = options.filter(o => o.value !== 'all');
        otherOptions.sort((a, b) => a.text.localeCompare(b.text));
        options = [];
        if (allOption) options.push(allOption);
        options.push(...otherOptions);
    }
    // 月の場合は昇順ソート（YYYY-MM形式なので文字列ソートでOK）
    else if (sortType === 'month') {
        const allOption = options.find(o => o.value === 'all');
        const otherOptions = options.filter(o => o.value !== 'all');
        otherOptions.sort((a, b) => a.value.localeCompare(b.value));
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

    buttonContainer.querySelectorAll('button[data-value]').forEach(btn => {
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

// 選択中ボタンを表示エリア内にスクロール（同期的に実行）
function scrollToActiveButton(container) {
    if (!container) return;
    const activeBtn = container.querySelector('button.active');
    if (activeBtn) {
        const containerRect = container.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (container.clientWidth / 2) + (btnRect.width / 2);
        container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'instant' });
    }
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
    const filterTabs = ['report', 'estimate', 'actual'];
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
    loadTabFilterButtonStyle();
    loadTabFilterLayout();
    loadHideInlineFilters();

    // 設定を適用
    applyTabBarVisibility();
    applyFilterExpansion();
    applyFilterButtonStyle();
    applyFilterLayout();
    applyInlineFilterVisibility();

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

    // ボタンスタイル選択のイベント
    const styleSelect = document.getElementById('tabFilterButtonStyle');
    if (styleSelect) {
        styleSelect.addEventListener('change', saveTabFilterButtonStyle);
    }

    // レイアウト選択のイベント
    const layoutSelect = document.getElementById('tabFilterLayout');
    if (layoutSelect) {
        layoutSelect.addEventListener('change', saveTabFilterLayout);
    }

    // ページ内フィルタ非表示チェックボックスのイベント
    const hideInlineCheckbox = document.getElementById('hideInlineFilters');
    if (hideInlineCheckbox) {
        hideInlineCheckbox.addEventListener('change', saveHideInlineFilters);
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
window.getActualMonthExpanded = getActualMonthExpanded;
window.setActualMonthExpanded = setActualMonthExpanded;

console.log('tab-filter.js loaded');
