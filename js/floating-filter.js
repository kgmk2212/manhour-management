// ============================================
// フローティングフィルタ・スティッキーフィルタ関連機能
// ============================================

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
    const enabled = saved === null || saved === 'true';
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
    // レポートタブにいる場合のみ反映
    const reportTab = document.getElementById('report');
    if (reportTab && reportTab.classList.contains('active')) {
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
    const enabled = saved === null || saved === 'true';
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
    const panel = document.getElementById('floatingFilterPanel');
    if (panel) {
        if (panel.classList.contains('show')) {
            panel.classList.remove('show');
        } else {
            panel.classList.add('show');
            // パネルを開く時に状態を同期
            syncFloatingFilters();
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

    // 表示形式の同期
    const mainViewType = document.getElementById('reportViewType');
    if (mainViewType) {
        const viewType = mainViewType.value;
        setFloatingViewType(viewType, false);
    }

    // テーマを適用
    if (typeof window.updateFloatingFilterTheme === 'function') {
        window.updateFloatingFilterTheme();
    }
}

// フィルタタイプの設定（月別/版数別）
export function setFloatingFilterType(type, applyToMain = true) {
    const monthBtn = document.getElementById('floatingFilterMonth');
    const versionBtn = document.getElementById('floatingFilterVersion');
    const monthGroup = document.getElementById('floatingMonthGroup');
    const versionGroup = document.getElementById('floatingVersionGroup');

    if (type === 'month') {
        if (monthGroup) monthGroup.style.display = 'block';
        if (versionGroup) versionGroup.style.display = 'none';
    } else {
        if (monthGroup) monthGroup.style.display = 'none';
        if (versionGroup) versionGroup.style.display = 'block';
    }

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

    // メインフィルタに反映
    if (applyToMain) {
        const mainViewType = document.getElementById('reportViewType');
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

// パネル外クリックで閉じるイベントの初期化
export function initFloatingFilterEvents() {
    document.addEventListener('click', function (event) {
        const panel = document.getElementById('floatingFilterPanel');
        const toggle = document.getElementById('floatingFilterToggle');

        if (!panel || !toggle) return;

        // パネルが開いている場合のみ処理
        if (panel.classList.contains('show')) {
            // クリックがパネル内、またはトグルボタンの場合は何もしない
            if (panel.contains(event.target) || toggle.contains(event.target)) {
                return;
            }
            // それ以外の場合はパネルを閉じる
            event.stopPropagation();
            event.preventDefault();
            panel.classList.remove('show');
        }
    }, true); // キャプチャフェーズで実行

    // パネル内のクリックでイベント伝播を止める
    const panel = document.getElementById('floatingFilterPanel');
    if (panel) {
        panel.addEventListener('click', function (event) {
            event.stopPropagation();
        });
    }
}

console.log('✅ モジュール floating-filter.js loaded');
