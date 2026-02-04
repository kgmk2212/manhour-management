// ============================================
// フローティングフィルタ・スティッキーフィルタ関連機能
// ============================================

import { enableDragScroll } from './utils.js';

// 選択中ボタンを表示エリア内にスクロールするヘルパー関数
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

// ============================================
// スティッキーフィルタ
// ============================================

// Stickyフィルタのイベントハンドラー保持用
let stickyScrollHandler = null;
let stickyResizeHandler = null;

// フィルタ固定表示設定の保存
export function saveStickyFilterSetting() {
    const checkbox = document.getElementById('stickyFilterEnabled');
    if (!checkbox) return;
    const enabled = checkbox.checked;
    localStorage.setItem('stickyFilterEnabled', enabled);

    // 設定変更時に機能を有効/無効化
    if (enabled) {
        enableStickyFilters();
    } else {
        disableStickyFilters();
    }
}

// フィルタ固定表示設定の読み込み
export function loadStickyFilterSetting() {
    const saved = localStorage.getItem('stickyFilterEnabled');
    const enabled = saved === 'true'; // デフォルトOFF
    const checkbox = document.getElementById('stickyFilterEnabled');
    if (checkbox) {
        checkbox.checked = enabled;
    }
    return enabled;
}

// Stickyフィルタを有効化
export function enableStickyFilters() {
    // 既に有効な場合は何もしない
    if (stickyScrollHandler) return;

    const container = document.querySelector('.container');
    if (!container) return;

    // 全てのsticky-filter-containerを取得
    const stickyFilters = document.querySelectorAll('.sticky-filter-container');

    // 各フィルタにプレースホルダーを作成（既存のものがない場合のみ）
    stickyFilters.forEach(filter => {
        // 既存のプレースホルダーをチェック
        const existingPlaceholder = filter.previousElementSibling;
        if (!existingPlaceholder || !existingPlaceholder.classList.contains('sticky-placeholder')) {
            const placeholder = document.createElement('div');
            placeholder.className = 'sticky-placeholder';
            filter.parentNode.insertBefore(placeholder, filter);
        }
    });

    // スクロールイベント監視（windowスクロール）
    stickyScrollHandler = function () {
        stickyFilters.forEach(filter => {
            // 表示されているフィルタのみ処理
            if (filter.offsetParent === null) return;

            const placeholder = filter.previousElementSibling;
            if (!placeholder) return;

            const containerRect = container.getBoundingClientRect();

            // プレースホルダーの現在位置を取得（元々あった位置）
            const placeholderRect = placeholder.getBoundingClientRect();

            // プレースホルダーが画面上端に達したら固定
            if (placeholderRect.top <= 0 && !filter.classList.contains('is-sticky')) {
                // Sticky化
                const filterHeight = filter.offsetHeight;
                placeholder.style.height = filterHeight + 'px';
                placeholder.classList.add('active');
                filter.classList.add('is-sticky');

                // containerの幅に合わせる
                filter.style.width = containerRect.width + 'px';
                filter.style.left = containerRect.left + 'px';
            }
            // プレースホルダーが画面上端より下にある場合は固定解除
            else if (placeholderRect.top > 0 && filter.classList.contains('is-sticky')) {
                // Sticky解除
                placeholder.classList.remove('active');
                placeholder.style.height = '';
                filter.classList.remove('is-sticky');
                filter.style.width = '';
                filter.style.left = '';
            }
        });
    };

    window.addEventListener('scroll', stickyScrollHandler);

    // ウィンドウリサイズ時の対応
    stickyResizeHandler = function () {
        const container = document.querySelector('.container');
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const stickyFilters = document.querySelectorAll('.sticky-filter-container.is-sticky');

        stickyFilters.forEach(filter => {
            filter.style.width = containerRect.width + 'px';
            filter.style.left = containerRect.left + 'px';
        });
    };

    window.addEventListener('resize', stickyResizeHandler);
}

// Stickyフィルタを無効化
export function disableStickyFilters() {
    // イベントリスナーを削除
    if (stickyScrollHandler) {
        window.removeEventListener('scroll', stickyScrollHandler);
        stickyScrollHandler = null;
    }

    if (stickyResizeHandler) {
        window.removeEventListener('resize', stickyResizeHandler);
        stickyResizeHandler = null;
    }

    // Stickyクラスを削除
    const stickyFilters = document.querySelectorAll('.sticky-filter-container.is-sticky');
    stickyFilters.forEach(filter => {
        filter.classList.remove('is-sticky');
        filter.style.width = '';
        filter.style.left = '';
    });

    // プレースホルダーのスタイルをリセット
    const placeholders = document.querySelectorAll('.sticky-placeholder.active');
    placeholders.forEach(placeholder => {
        placeholder.classList.remove('active');
        placeholder.style.height = '';
    });
}

// Stickyフィルタの初期化
export function initStickyFilters() {
    const enabled = loadStickyFilterSetting();
    if (enabled) {
        enableStickyFilters();
    }
}

// ============================================
// フローティングフィルタパネル
// ============================================

// フローティングフィルタ設定の保存
export function saveFloatingFilterSetting() {
    const checkbox = document.getElementById('floatingFilterEnabled');
    if (!checkbox) return;
    const enabled = checkbox.checked;
    localStorage.setItem('floatingFilterEnabled', enabled);

    // 設定変更時にボタンの表示/非表示を切り替え
    // フィルタ対応タブ（レポート・見積・実績）にいる場合のみ反映
    const activeTab = document.querySelector('.tab-content.active');
    const activeTabId = activeTab ? activeTab.id : null;
    if (activeTabId === 'report' || activeTabId === 'estimate' || activeTabId === 'actual') {
        if (enabled) {
            showFloatingFilterButton();
        } else {
            hideFloatingFilterButton();
        }
    }
}

// フローティングフィルタ設定の読み込み
export function loadFloatingFilterSetting() {
    const saved = localStorage.getItem('floatingFilterEnabled');
    const enabled = saved === 'true'; // デフォルトOFF
    const checkbox = document.getElementById('floatingFilterEnabled');
    if (checkbox) {
        checkbox.checked = enabled;
    }
    return enabled;
}

// フローティングフィルタボタンを表示
export function showFloatingFilterButton() {
    const enabled = loadFloatingFilterSetting();
    if (!enabled) return;

    const toggle = document.getElementById('floatingFilterToggle');
    if (toggle) {
        toggle.style.display = 'flex';
    }
}

// フローティングフィルタボタンを非表示
export function hideFloatingFilterButton() {
    const toggle = document.getElementById('floatingFilterToggle');
    const panel = document.getElementById('floatingFilterPanel');
    if (toggle) {
        toggle.style.display = 'none';
    }
    if (panel) {
        panel.classList.remove('show');
    }
}

// フローティングパネルの開閉トグル
export function toggleFloatingFilterPanel(event) {
    if (event) {
        event.stopPropagation(); // イベント伝播を防ぐ
    }

    // 現在のアクティブなタブを確認
    // tab-content.active を探す
    let activeTabId = 'report'; // デフォルト
    const activeContent = document.querySelector('.tab-content.active');
    if (activeContent) {
        activeTabId = activeContent.id;
    }

    let targetPanelId = 'floatingFilterPanel'; // デフォルト（レポート用）
    if (activeTabId === 'estimate') {
        targetPanelId = 'floatingFilterPanelEstimate';
    } else if (activeTabId === 'actual') {
        targetPanelId = 'floatingFilterPanelActual';
    }

    const targetPanel = document.getElementById(targetPanelId);

    // 他のすべてのパネルを閉じる
    const allPanels = document.querySelectorAll('.floating-filter-panel');
    allPanels.forEach(p => {
        if (p.id !== targetPanelId) {
            p.classList.remove('show');
        }
    });

    if (targetPanel) {
        if (targetPanel.classList.contains('show')) {
            targetPanel.classList.remove('show');
        } else {
            targetPanel.classList.add('show');
            // パネルを開く時に状態を同期
            if (activeTabId === 'estimate') {
                syncFloatingEstimateFilters();
            } else if (activeTabId === 'actual') {
                syncFloatingActualFilters();
            } else {
                syncFloatingFilters();
            }
        }
    }
}

// 見積フィルタの状態をフローティングパネルに同期
export function syncFloatingEstimateFilters() {
    // フィルタタイプの同期
    const mainFilterType = document.getElementById('estimateFilterType');
    if (mainFilterType) {
        const filterType = mainFilterType.value;
        setFloatingEstFilterType(filterType, false);
    }

    // 月フィルタの同期
    const mainMonth = document.getElementById('estimateMonthFilter');
    const floatingMonthButtons = document.getElementById('floatingEstMonthButtons');
    if (mainMonth && floatingMonthButtons) {
        const currentValue = mainMonth.value;
        floatingMonthButtons.innerHTML = '';
        Array.from(mainMonth.options).forEach(option => {
            const btn = document.createElement('button');
            btn.textContent = option.text;
            btn.onclick = function (e) {
                e.stopPropagation();
                syncFloatingEstMonthFilter(option.value);
            };
            if (String(option.value) === String(currentValue)) btn.classList.add('active');
            floatingMonthButtons.appendChild(btn);
        });
    }

    // 版数フィルタの同期
    const mainVersion = document.getElementById('estimateVersionFilter');
    const floatingVersionButtons = document.getElementById('floatingEstVersionButtons');
    if (mainVersion && floatingVersionButtons) {
        const currentValue = mainVersion.value;
        floatingVersionButtons.innerHTML = '';

        // オプションを取得して並び替え（全版数を先頭に、残りを昇順に）
        const options = Array.from(mainVersion.options);
        const allOption = options.find(o => o.value === 'all');
        const otherOptions = options.filter(o => o.value !== 'all');

        // 昇順にソート
        otherOptions.sort((a, b) => a.text.localeCompare(b.text));

        const sortedOptions = [];
        if (allOption) sortedOptions.push(allOption);
        sortedOptions.push(...otherOptions);

        sortedOptions.forEach(option => {
            const btn = document.createElement('button');
            btn.textContent = option.text;
            btn.onclick = function (e) {
                e.stopPropagation();
                syncFloatingEstVersionFilter(option.value);
            };
            if (String(option.value) === String(currentValue)) btn.classList.add('active');
            floatingVersionButtons.appendChild(btn);
        });
    }

    // 表示形式の同期（設定から取得）
    const mainViewType = document.getElementById('defaultEstimateViewType');
    if (mainViewType) {
        const viewType = mainViewType.value;
        setFloatingEstViewType(viewType, false);
    }

    // 編集モードの同期
    const mainEditMode = document.getElementById('estimateEditMode2');
    const floatingEditMode = document.getElementById('floatingEstimateEditMode');
    if (mainEditMode && floatingEditMode) {
        // mainEditMode自体がinput要素（またはinputを含むlabelかもしれないがIDはinputについている）
        // IDがinput要素についている場合はそのままcheckedを参照
        if (mainEditMode.tagName === 'INPUT') {
            floatingEditMode.checked = mainEditMode.checked;
        } else {
            // 万が一コンテナだった場合のフォールバック
            const input = mainEditMode.querySelector('input');
            if (input) floatingEditMode.checked = input.checked;
        }
    }

    // テーマとボタンのスタイルを更新
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }

    // ドラッグスクロールを有効化
    if (floatingMonthButtons) enableDragScroll(floatingMonthButtons);
    if (floatingVersionButtons) enableDragScroll(floatingVersionButtons);

    // 選択中ボタンを表示エリア内にスクロール
    scrollToActiveButton(floatingMonthButtons);
    scrollToActiveButton(floatingVersionButtons);
}

// 見揮: フィルタタイプ設定
export function setFloatingEstFilterType(type, applyToMain = true) {
    // 全てのフィルタ要素を表示状態に保つ（フィルタタイプによる非表示を廃止）
    const monthGroup = document.getElementById('floatingEstMonthGroup');
    const versionGroup = document.getElementById('floatingEstVersionGroup');
    if (monthGroup) monthGroup.style.display = 'block';
    if (versionGroup) versionGroup.style.display = 'block';

    if (applyToMain) {
        const mainFilterType = document.getElementById('estimateFilterType');
        if (mainFilterType) {
            mainFilterType.value = type;
            // Use handler if available to avoid crash on null .onchange
            if (typeof window.handleEstimateFilterTypeChange === 'function') {
                window.handleEstimateFilterTypeChange();
            } else {
                mainFilterType.dispatchEvent(new Event('change'));
            }
        }
    }

    // テーマ更新
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }
}

// 見積: 表示形式設定
export function setFloatingEstViewType(type, applyToMain = true) {
    // ボタンのactiveクラス制御
    const btnGrouped = document.getElementById('floatingEstViewGrouped');
    const btnMatrix = document.getElementById('floatingEstViewMatrix');
    const btnList = document.getElementById('floatingEstViewList');

    if (btnGrouped) btnGrouped.classList.remove('active');
    if (btnMatrix) btnMatrix.classList.remove('active');
    if (btnList) btnList.classList.remove('active');

    if (type === 'grouped' && btnGrouped) btnGrouped.classList.add('active');
    if (type === 'matrix' && btnMatrix) btnMatrix.classList.add('active');
    if (type === 'list' && btnList) btnList.classList.add('active');

    if (applyToMain) {
        // Update UI logic directly
        if (typeof window.setEstimateViewType === 'function') {
            window.setEstimateViewType(type);
        } else {
            // Fallback - 設定から取得
            const mainViewType = document.getElementById('defaultEstimateViewType');
            if (mainViewType) {
                mainViewType.value = type;
                if (typeof window.renderEstimateList === 'function') {
                    window.renderEstimateList();
                }
            }
        }
    }

    // テーマ更新
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }
}

// 見積: 月変更
export function syncFloatingEstMonthFilter(value) {
    const mainMonth = document.getElementById('estimateMonthFilter');
    if (mainMonth) {
        mainMonth.value = value;
        // Use handler if available
        if (typeof window.handleEstimateMonthChange === 'function') {
            window.handleEstimateMonthChange(value);
        } else {
            mainMonth.dispatchEvent(new Event('change'));
        }
        syncFloatingEstimateFilters();
    }
}

// 見積: 版数変更
export function syncFloatingEstVersionFilter(value) {
    const mainVersion = document.getElementById('estimateVersionFilter');
    if (mainVersion) {
        mainVersion.value = value;
        // Use handler if available
        if (typeof window.handleEstimateVersionChange === 'function') {
            window.handleEstimateVersionChange(value);
        } else {
            mainVersion.dispatchEvent(new Event('change'));
        }
        syncFloatingEstimateFilters();
    }
}

// 編集モード切り替え
window.toggleEstimateEditMode = function (checked) {
    const mainEditMode = document.getElementById('estimateEditMode2');
    if (mainEditMode) {
        const checkbox = mainEditMode.querySelector('input');
        if (checkbox && checkbox.checked !== checked) {
            checkbox.click(); // クリックイベントを発火させて既存のロジックを実行
        }
    }
}

// メインフィルタの状態をフローティングパネルに同期
export function syncFloatingFilters() {
    // フィルタタイプの同期
    const mainFilterType = document.getElementById('reportFilterType');
    if (mainFilterType) {
        const filterType = mainFilterType.value;
        setFloatingFilterType(filterType, false);
    }

    // 月フィルタの同期（セグメントボタンを生成）
    const mainReportMonth = document.getElementById('reportMonth');
    const floatingMonthButtons = document.getElementById('floatingMonthButtons');
    if (mainReportMonth && floatingMonthButtons) {
        const currentValue = mainReportMonth.value;
        floatingMonthButtons.innerHTML = '';

        // オプションからボタンを生成
        Array.from(mainReportMonth.options).forEach(option => {
            const btn = document.createElement('button');
            btn.textContent = option.text;
            btn.onclick = function (e) {
                e.stopPropagation();
                syncFloatingMonthFilter(option.value);
            };
            // 型を統一して比較（両方とも文字列に変換）
            if (String(option.value) === String(currentValue)) {
                btn.classList.add('active');
            }
            floatingMonthButtons.appendChild(btn);
        });
    }

    // 版数フィルタの同期（セグメントボタンを生成）
    const mainReportVersion = document.getElementById('reportVersion');
    const floatingVersionButtons = document.getElementById('floatingVersionButtons');
    if (mainReportVersion && floatingVersionButtons) {
        const currentValue = mainReportVersion.value;
        floatingVersionButtons.innerHTML = '';

        // オプションからボタンを生成
        Array.from(mainReportVersion.options).forEach(option => {
            const btn = document.createElement('button');
            btn.textContent = option.text;
            btn.onclick = function (e) {
                e.stopPropagation();
                syncFloatingVersionFilter(option.value);
            };
            // 型を統一して比較（両方とも文字列に変換）
            if (String(option.value) === String(currentValue)) {
                btn.classList.add('active');
            }
            floatingVersionButtons.appendChild(btn);
        });
    }

    // 表示形式の同期（設定から取得）
    const mainViewType = document.getElementById('defaultReportViewType');
    if (mainViewType) {
        const viewType = mainViewType.value;
        setFloatingViewType(viewType, false);
    }

    // テーマを適用
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }

    // ドラッグスクロールを有効化
    if (floatingMonthButtons) enableDragScroll(floatingMonthButtons);
    if (floatingVersionButtons) enableDragScroll(floatingVersionButtons);

    // 選択中ボタンを表示エリア内にスクロール
    scrollToActiveButton(floatingMonthButtons);
    scrollToActiveButton(floatingVersionButtons);
}

// フィルタタイプの設定（月別/版数別）
export function setFloatingFilterType(type, applyToMain = true) {
    // 全てのフィルタ要素を表示状態に保つ
    const monthGroup = document.getElementById('floatingMonthGroup');
    const versionGroup = document.getElementById('floatingVersionGroup');
    if (monthGroup) monthGroup.style.display = 'block';
    if (versionGroup) versionGroup.style.display = 'block';

    // メインフィルタに反映
    if (applyToMain) {
        const mainFilterType = document.getElementById('reportFilterType');
        if (mainFilterType) {
            mainFilterType.value = type;
            if (typeof window.handleReportFilterTypeChange === 'function') {
                window.handleReportFilterTypeChange();
            }
        }
    }

    // テーマカラーを適用
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }
}

// 表示形式の設定
export function setFloatingViewType(type, applyToMain = true) {
    // 表示形式の同期は、メインフィルタに反映した後の updateReport 内の updateSegmentedButtons で行われる

    // メインフィルタに反映（設定から取得）
    if (applyToMain) {
        const mainViewType = document.getElementById('defaultReportViewType');
        if (mainViewType) {
            mainViewType.value = type;
            if (typeof window.updateReport === 'function') {
                window.updateReport();
            }
        }
    }

    // テーマカラーを適用
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }
}

// 月フィルタの同期
export function syncFloatingMonthFilter(value) {
    const mainMonth = document.getElementById('reportMonth');
    if (mainMonth) {
        mainMonth.value = value;
        if (typeof window.handleReportMonthChange === 'function') {
            window.handleReportMonthChange(value, 'reportMonthButtons2');
        }
        // ボタンの状態を更新
        syncFloatingFilters();
    }
}

// 版数フィルタの同期
export function syncFloatingVersionFilter(value) {
    const mainVersion = document.getElementById('reportVersion');
    if (mainVersion) {
        mainVersion.value = value;
        if (typeof window.handleReportVersionChange === 'function') {
            window.handleReportVersionChange(value, 'reportVersionButtons2');
        }
        // ボタンの状態を更新
        syncFloatingFilters();
    }
}

// ============================================
// 実績一覧用フローティングフィルタ
// ============================================

// 実績フィルタの状態をフローティングパネルに同期
export function syncFloatingActualFilters() {
    // 表示モードの同期
    const mainViewMode = document.getElementById('actualViewMode');
    if (mainViewMode) {
        const viewMode = mainViewMode.value;
        updateFloatingActualViewModeButtons(viewMode);

        // 担当者グループの表示/非表示
        const memberGroup = document.getElementById('floatingActualMemberGroup');
        if (memberGroup) {
            memberGroup.style.display = viewMode === 'member' ? 'block' : 'none';
        }
    }

    // 担当者フィルタの同期
    const mainMember = document.getElementById('actualMemberSelect');
    const floatingMemberButtons = document.getElementById('floatingActualMemberButtons');
    if (mainMember && floatingMemberButtons) {
        const currentValue = mainMember.value;
        floatingMemberButtons.innerHTML = '';
        Array.from(mainMember.options).forEach(option => {
            const btn = document.createElement('button');
            btn.textContent = option.text;
            btn.onclick = function (e) {
                e.stopPropagation();
                setFloatingActualMember(option.value);
            };
            if (String(option.value) === String(currentValue)) btn.classList.add('active');
            floatingMemberButtons.appendChild(btn);
        });
        enableDragScroll(floatingMemberButtons);
    }

    // 表示形式の同期
    const mainViewType = document.getElementById('actualViewType');
    if (mainViewType) {
        updateFloatingActualViewTypeButtons(mainViewType.value);
    }

    // 月フィルタの同期
    const mainMonth = document.getElementById('actualMonthFilter');
    const floatingMonthButtons = document.getElementById('floatingActualMonthButtons');
    if (mainMonth && floatingMonthButtons) {
        const currentValue = mainMonth.value;
        floatingMonthButtons.innerHTML = '';
        Array.from(mainMonth.options).forEach(option => {
            const btn = document.createElement('button');
            btn.textContent = option.text;
            btn.onclick = function (e) {
                e.stopPropagation();
                setFloatingActualMonth(option.value);
            };
            if (String(option.value) === String(currentValue)) btn.classList.add('active');
            floatingMonthButtons.appendChild(btn);
        });
        enableDragScroll(floatingMonthButtons);
        scrollToActiveButton(floatingMonthButtons);
    }

    // テーマ更新
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }
}

// 表示モードボタンの状態を更新
function updateFloatingActualViewModeButtons(mode) {
    const btnAll = document.getElementById('floatingActualViewModeAll');
    const btnMember = document.getElementById('floatingActualViewModeMember');
    if (btnAll) btnAll.classList.toggle('active', mode === 'all');
    if (btnMember) btnMember.classList.toggle('active', mode === 'member');
}

// 表示形式ボタンの状態を更新
function updateFloatingActualViewTypeButtons(type) {
    const btnMatrix = document.getElementById('floatingActualViewTypeMatrix');
    const btnList = document.getElementById('floatingActualViewTypeList');
    if (btnMatrix) btnMatrix.classList.toggle('active', type === 'matrix');
    if (btnList) btnList.classList.toggle('active', type === 'list');
}

// 表示モード変更
window.setFloatingActualViewMode = function(mode) {
    const mainViewMode = document.getElementById('actualViewMode');
    if (mainViewMode) {
        mainViewMode.value = mode;
        mainViewMode.dispatchEvent(new Event('change'));
    }
    syncFloatingActualFilters();
};

// 担当者変更
function setFloatingActualMember(value) {
    const mainMember = document.getElementById('actualMemberSelect');
    if (mainMember) {
        mainMember.value = value;
        mainMember.dispatchEvent(new Event('change'));
    }
    syncFloatingActualFilters();
}

// 表示形式変更
window.setFloatingActualViewType = function(type) {
    const mainViewType = document.getElementById('actualViewType');
    if (mainViewType) {
        mainViewType.value = type;
        mainViewType.dispatchEvent(new Event('change'));
    }
    syncFloatingActualFilters();
};

// 月フィルタ変更
function setFloatingActualMonth(value) {
    const mainMonth = document.getElementById('actualMonthFilter');
    if (mainMonth) {
        mainMonth.value = value;
        mainMonth.dispatchEvent(new Event('change'));
    }
    syncFloatingActualFilters();
}

// パネル外クリックで閉じるイベントの初期化
export function initFloatingFilterEvents() {
    document.addEventListener('click', function (event) {
        const toggle = document.getElementById('floatingFilterToggle');

        // トグルボタンのクリックは toggleFloatingFilterPanel で処理されるため無視
        if (toggle && toggle.contains(event.target)) {
            return;
        }

        // 開いている全てのパネルを確認
        const openPanels = document.querySelectorAll('.floating-filter-panel.show');
        openPanels.forEach(panel => {
            // クリックがパネル内部でなければ閉じる
            if (!panel.contains(event.target)) {
                panel.classList.remove('show');
            }
        });
    });

    // パネル内のクリックイベント伝播を止める（念のため詳細設定）
    // （document click リスナーでの contains チェックで十分だが、安全策）
    const panels = document.querySelectorAll('.floating-filter-panel');
    panels.forEach(panel => {
        panel.addEventListener('click', function (event) {
            event.stopPropagation();
        });
    });
}

console.log('✅ モジュール floating-filter.js loaded');
