// ============================================
// テーマ・UI設定
// ============================================

import {
    chartColorSchemes,
    selectedChartColorScheme, setSelectedChartColorScheme,
    showMonthColorsSetting, setShowMonthColorsSetting,
    reportMatrixBgColorMode, setReportMatrixBgColorMode,
    showProgressBarsSetting, setShowProgressBarsSetting,
    showProgressPercentageSetting, setShowProgressPercentageSetting,
    progressBarStyle, setProgressBarStyle,
    matrixEstActFormat, setMatrixEstActFormat,

    setCurrentThemeColor, setCurrentThemePattern, setCurrentTabColor, setCurrentBackgroundColor,
    isEstimateTabFirstView, setIsEstimateTabFirstView,
    isReportTabFirstView, setIsReportTabFirstView,
    mobileTabDesign, setMobileTabDesign,
    setDesignTheme,
    setSidebarLayout
} from './state.js';


// ============================================
// グラフカラースキーム
// ============================================

export function getActiveChartColorScheme() {
    if (selectedChartColorScheme === 'auto') {
        if (chartColorSchemes[window.currentThemeColor]) {
            return chartColorSchemes[window.currentThemeColor];
        }
        return chartColorSchemes['deep-blue'];
    } else {
        return chartColorSchemes[selectedChartColorScheme] || chartColorSchemes['deep-blue'];
    }
}

export function saveChartColorScheme() {
    const selector = document.getElementById('chartColorScheme');
    if (selector) {
        setSelectedChartColorScheme(selector.value);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        updateChartColorPreview();
        const reportTab = document.getElementById('report');
        if (reportTab && reportTab.style.display !== 'none') {
            if (typeof window.updateReport === 'function') {
                window.updateReport();
            }
        }
    }
}

export function loadChartColorScheme() {
    const savedSettings = localStorage.getItem('manhour_settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.chartColorScheme) {
                setSelectedChartColorScheme(settings.chartColorScheme);
                const selector = document.getElementById('chartColorScheme');
                if (selector) {
                    selector.value = selectedChartColorScheme;
                }
            }
        } catch (error) {
            console.error('チャート配色設定の読み込みに失敗しました:', error);
            // デフォルト設定を使用
        }
    }
    updateChartColorPreview();
}

export function updateChartColorPreview() {
    const scheme = getActiveChartColorScheme();
    if (!scheme) return;

    const estimateBar = document.getElementById('chartPreviewEstimateBar');
    const actualBar = document.getElementById('chartPreviewActualBar');
    if (estimateBar) estimateBar.style.backgroundColor = scheme.barColors.estimate;
    if (actualBar) actualBar.style.backgroundColor = scheme.barColors.actual;

    const uiPreview = document.getElementById('chartPreviewUI');
    const pgPreview = document.getElementById('chartPreviewPG');
    const ptPreview = document.getElementById('chartPreviewPT');
    const itPreview = document.getElementById('chartPreviewIT');
    const stPreview = document.getElementById('chartPreviewST');

    if (uiPreview) uiPreview.style.backgroundColor = scheme.processColors['UI'];
    if (pgPreview) pgPreview.style.backgroundColor = scheme.processColors['PG'];
    if (ptPreview) ptPreview.style.backgroundColor = scheme.processColors['PT'];
    if (itPreview) itPreview.style.backgroundColor = scheme.processColors['IT'];
    if (stPreview) stPreview.style.backgroundColor = scheme.processColors['ST'];
}

// ============================================
// テーマ設定
// ============================================

export function loadThemeSettings() {
    const savedSettings = localStorage.getItem('manhour_settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.themeColor) {
                setCurrentThemeColor(settings.themeColor);
                const el = document.getElementById('themeColor');
                if (el) el.value = settings.themeColor;
            }
            if (settings.themePattern) {
                setCurrentThemePattern(settings.themePattern);
                const el = document.getElementById('themePattern');
                if (el) el.value = settings.themePattern;
            }
            if (settings.themeTabColor) {
                setCurrentTabColor(settings.themeTabColor);
                const el = document.getElementById('themeTabColor');
                if (el) el.value = settings.themeTabColor;
            }
            if (settings.themeBackgroundColor) {
                setCurrentBackgroundColor(settings.themeBackgroundColor);
                const el = document.getElementById('themeBackgroundColor');
                if (el) el.value = settings.themeBackgroundColor;
            }
            if (settings.designTheme) {
                setDesignTheme(settings.designTheme);
                const el = document.getElementById('designTheme');
                if (el) el.value = settings.designTheme;
            }
            if (settings.sidebarLayout !== undefined) {
                setSidebarLayout(settings.sidebarLayout);
                const el = document.getElementById('sidebarLayout');
                if (el) el.checked = settings.sidebarLayout;
            }
        } catch (error) {
            console.error('テーマ設定の読み込みに失敗しました:', error);
            // デフォルトテーマを使用
        }
    } else {
        // 旧形式から読み込み（後方互換性）
        const savedColor = localStorage.getItem('manhour_themeColor');
        const savedPattern = localStorage.getItem('manhour_themePattern');
        const savedTabColor = localStorage.getItem('manhour_themeTabColor');

        if (savedColor) {
            setCurrentThemeColor(savedColor);
            const el = document.getElementById('themeColor');
            if (el) el.value = savedColor;
        }

        if (savedPattern) {
            setCurrentThemePattern(savedPattern);
            const el = document.getElementById('themePattern');
            if (el) el.value = savedPattern;
        }

        if (savedTabColor) {
            setCurrentTabColor(savedTabColor);
            const el = document.getElementById('themeTabColor');
            if (el) el.value = savedTabColor;
        }
    }

    loadMobileTabDesign();
    applyTheme();
}

/**
 * デザインテーマを適用
 * body と html にdata-design-theme属性を設定し、テーマ固有のフォントを動的読み込み
 */
export function applyDesignTheme() {
    const designThemeEl = document.getElementById('designTheme');
    const theme = (designThemeEl && designThemeEl.value) || window.designTheme || 'default';
    setDesignTheme(theme);

    if (theme === 'default') {
        delete document.body.dataset.designTheme;
        delete document.documentElement.dataset.designTheme;
    } else {
        document.body.dataset.designTheme = theme;
        document.documentElement.dataset.designTheme = theme;
    }

    // Graphite用フォントを動的ロード
    if (theme === 'graphite' && !document.getElementById('graphite-fonts')) {
        const link = document.createElement('link');
        link.id = 'graphite-fonts';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap';
        document.head.appendChild(link);
    }
}

/**
 * サイドバーレイアウトを適用
 */
export function applySidebarLayout() {
    const sidebarEl = document.getElementById('sidebarLayout');
    const enabled = sidebarEl ? sidebarEl.checked : (window.sidebarLayout || false);
    setSidebarLayout(enabled);

    if (enabled) {
        document.body.dataset.layout = 'sidebar';
        document.documentElement.dataset.layout = 'sidebar';
    } else {
        delete document.body.dataset.layout;
        delete document.documentElement.dataset.layout;
    }
}

export function applyTheme() {
    const colorEl = document.getElementById('themeColor');
    const patternEl = document.getElementById('themePattern');
    const tabColorEl = document.getElementById('themeTabColor');
    const backgroundColorEl = document.getElementById('themeBackgroundColor');
    const tabs = document.querySelector('.tabs');

    // DOM要素が存在する場合はその値を使用、なければstate変数（window経由）を使用
    // DOM要素の値を更新しつつ、state変数も同期
    if (colorEl && colorEl.value) {
        setCurrentThemeColor(colorEl.value);
    } else if (!window.currentThemeColor) {
        setCurrentThemeColor('deep-blue');
    }

    if (patternEl && patternEl.value) {
        setCurrentThemePattern(patternEl.value);
    } else if (!window.currentThemePattern) {
        setCurrentThemePattern('gradient');
    }

    if (tabColorEl && tabColorEl.value) {
        setCurrentTabColor(tabColorEl.value);
    }

    if (backgroundColorEl && backgroundColorEl.value) {
        setCurrentBackgroundColor(backgroundColorEl.value);
    }

    applyDesignTheme();
    applySidebarLayout();
    updateThemePreview();
    updateThemeElements();

    if (selectedChartColorScheme === 'auto') {
        updateChartColorPreview();
        const reportTab = document.getElementById('report');
        if (reportTab && reportTab.classList.contains('active')) {
            if (typeof window.updateReport === 'function') {
                window.updateReport();
            }
        }
    }

    if (tabs) {
        tabs.classList.remove('is-classic', 'is-dock', 'is-capsule');
        tabs.classList.add(`is-${window.mobileTabDesign || 'classic'}`);
        // スタイル適用完了を示すクラスを追加（ちらつき防止）
        tabs.classList.add('style-ready');
    }

    if (typeof window.saveData === 'function') {
        window.saveData(true);
    }
}

export function updateThemePreview() {
    const preview = document.getElementById('themePreview');
    if (!preview) return;

    const colorClass = `theme-${window.currentThemeColor}`;
    const patternClass = window.currentThemePattern !== 'none' ? `pattern-${window.currentThemePattern}` : '';

    preview.className = '';
    preview.classList.add('theme-bg', colorClass);
    if (patternClass) {
        preview.classList.add(patternClass);
    }
}

export function updateThemeElements() {
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

    const solidColors = {
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

    // デザインテーマがアクティブな場合、カラーテーマのインラインスタイルをスキップ
    // （CSSオーバーライドが全て処理するため）
    const isDesignThemeActive = window.designTheme && window.designTheme !== 'default';

    if (isDesignThemeActive) {
        // デザインテーマ時はインラインスタイルをクリアしてCSS側に制御を委ねる
        document.documentElement.style.removeProperty('--theme-gradient');
        document.documentElement.style.removeProperty('--theme-color');
        document.documentElement.style.removeProperty('--early-theme-gradient');
        document.documentElement.style.removeProperty('--early-bg-gradient');
        delete document.documentElement.dataset.earlyTheme;

        const headerEl = document.querySelector('header');
        if (headerEl) headerEl.style.background = '';
        document.body.style.background = '';

        const quickInput = document.querySelector('.quick-input');
        if (quickInput) {
            quickInput.style.background = '';
            quickInput.className = quickInput.className.replace(/theme-\w+/g, '').trim();
            if (!quickInput.classList.contains('quick-input')) quickInput.classList.add('quick-input');
        }

        const summaryCards = document.querySelectorAll('.stats-grid .stat-card');
        summaryCards.forEach(card => {
            card.style.background = '';
            card.className = card.className.replace(/theme-\w+/g, '').trim();
            if (!card.classList.contains('stat-card')) card.classList.add('stat-card');
        });

        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
            activeTab.style.background = '';
            activeTab.className = activeTab.className.replace(/tab-theme-\w+/g, '').trim();
        }

        const estimateTotalCard = document.getElementById('estimateTotalCard');
        if (estimateTotalCard) estimateTotalCard.style.background = '';

        // 設定UIのカラーテーマセクションを視覚的に無効化
        const themeColorSection = document.getElementById('themeColor');
        if (themeColorSection) {
            themeColorSection.closest('.form-group')?.closest('div[style]')?.classList.add('design-theme-disabled');
        }

        return;
    }

    // デザインテーマが無効の場合、カラーテーマセクションを再有効化
    const disabledSection = document.querySelector('.design-theme-disabled');
    if (disabledSection) disabledSection.classList.remove('design-theme-disabled');

    document.documentElement.style.setProperty('--theme-gradient', gradients[window.currentThemeColor] || gradients['deep-blue']);
    document.documentElement.style.setProperty('--theme-color', solidColors[window.currentThemeColor] || solidColors['deep-blue']);

    // 早期テーマ適用用のCSS変数とdata属性も更新（ちらつき防止スクリプトとの同期）
    document.documentElement.style.setProperty('--early-theme-gradient', gradients[window.currentThemeColor] || gradients['deep-blue']);
    document.documentElement.dataset.earlyTheme = window.currentThemeColor || 'deep-blue';

    updateBodyBackground();

    // ページヘッダー
    const headerEl = document.querySelector('header');
    if (headerEl) {
        headerEl.style.background = gradients[window.currentThemeColor] || gradients['deep-blue'];
    }

    // クイック入力エリア
    const quickInput = document.querySelector('.quick-input');
    if (quickInput) {
        updateElementTheme(quickInput);
    }

    // レポートサマリーカード
    const summaryCards = document.querySelectorAll('.stats-grid .stat-card');
    summaryCards.forEach(card => updateElementTheme(card));

    // 版数ヘッダー
    const versionHeaders = document.querySelectorAll('.version-header');
    versionHeaders.forEach(header => updateElementTheme(header));

    // アクティブタブ
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        updateElementTheme(activeTab);
    }

    // モーダルヘッダー
    const modalHeaders = document.querySelectorAll('.modal-header');
    modalHeaders.forEach(header => {
        header.className = header.className.replace(/modal-theme-\w+/g, '').trim();
        header.classList.add('modal-header', `modal-theme-${window.currentThemeColor}`);
    });

    // 設定タブのレイアウト切り替えボタン（window経由）
    if (typeof window.updateLayoutToggleButtons === 'function') {
        window.updateLayoutToggleButtons();
    }

    // セグメントボタンの色を更新（window経由）
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }

    // 見積合計カード
    const estimateTotalCard = document.getElementById('estimateTotalCard');
    if (estimateTotalCard) {
        estimateTotalCard.style.background = gradients[window.currentThemeColor] || gradients['deep-blue'];
    }

    // 見積一覧の担当者別合計カード（見積タブがアクティブな場合のみ）
    const estimateTab = document.getElementById('estimate');
    if (estimateTab && estimateTab.classList.contains('active')) {
        if (typeof window.renderEstimateList === 'function') {
            window.renderEstimateList();
        }
    }

}


export function updateBodyBackground() {
    const colorGradients = {
        'purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'deep-blue': 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        'teal': 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
        'cyan': 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
        'ocean': 'linear-gradient(135deg, #0c4a6e 0%, #0284c7 100%)',
        'sky': 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
        'indigo': 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
        'navy': 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
        'slate': 'linear-gradient(135deg, #334155 0%, #475569 100%)',
        'green': 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
        'emerald': 'linear-gradient(135deg, #059669 0%, #34d399 100%)'
    };

    const bgColorToUse = (window.currentBackgroundColor && window.currentBackgroundColor !== 'same')
        ? window.currentBackgroundColor
        : window.currentThemeColor;

    const gradient = colorGradients[bgColorToUse] || colorGradients['deep-blue'];
    document.body.style.background = gradient;
}

export function updateElementTheme(element) {
    const isTab = element.classList.contains('tab');

    let tabColorToUse = window.currentThemeColor;
    if (isTab) {
        if (window.currentTabColor === 'same') {
            tabColorToUse = window.currentThemeColor;
        } else if (window.currentTabColor === 'default') {
            tabColorToUse = null;
        } else {
            tabColorToUse = window.currentTabColor;
        }
    }

    const colorClass = isTab && tabColorToUse ? `tab-theme-${tabColorToUse}` : `theme-${window.currentThemeColor}`;
    const patternClass = !isTab && window.currentThemePattern !== 'none' ? `pattern-${window.currentThemePattern}` : '';

    const classes = Array.from(element.classList);
    classes.forEach(cls => {
        if (cls.startsWith('theme-') || cls.startsWith('pattern-') || cls.startsWith('tab-theme-')) {
            element.classList.remove(cls);
        }
    });

    if (isTab) {
        if (tabColorToUse) {
            element.classList.add(`tab-theme-${tabColorToUse}`);
        }
    } else {
        element.classList.add('theme-bg', colorClass);
        if (patternClass) {
            element.classList.add(patternClass);
        }
    }
}

// ============================================
// 表示設定
// ============================================

export function toggleMonthColorsSetting() {
    const checkbox = document.getElementById('showMonthColorsCheckbox');
    if (checkbox) {
        setShowMonthColorsSetting(checkbox.checked);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        if (typeof window.renderEstimateList === 'function') {
            window.renderEstimateList();
        }
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    }
}

export function changeReportMatrixBgColorMode() {
    const selectedRadio = document.querySelector('input[name="reportMatrixBgColorMode"]:checked');
    if (selectedRadio) {
        setReportMatrixBgColorMode(selectedRadio.value);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    }
}

export function toggleProgressBarsSetting() {
    const checkbox = document.getElementById('showProgressBarsCheckbox');
    if (checkbox) {
        setShowProgressBarsSetting(checkbox.checked);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    }
}

export function toggleProgressPercentageSetting() {
    const checkbox = document.getElementById('showProgressPercentageCheckbox');
    if (checkbox) {
        setShowProgressPercentageSetting(checkbox.checked);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    }
}

export function saveProgressBarStyle() {
    const selectedStyle = document.querySelector('input[name="progressBarStyle"]:checked');
    if (selectedStyle) {
        setProgressBarStyle(selectedStyle.value);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    }
}

export function saveMatrixEstActFormat() {
    const selectedFormat = document.querySelector('input[name="matrixEstActFormat"]:checked');
    if (selectedFormat) {
        setMatrixEstActFormat(selectedFormat.value);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    }
}



export function saveDefaultViewTypeSetting() {
    if (typeof window.saveData === 'function') {
        window.saveData(true);
    }
}

// ============================================
// モバイルタブデザイン設定
// ============================================

export function loadMobileTabDesign() {
    try {
        const saved = localStorage.getItem('mobileTabDesign');
        if (saved) {
            setMobileTabDesign(saved);
            const el = document.getElementById('mobileTabDesign');
            if (el) el.value = saved;
        }
    } catch (e) { }
}

export function changeMobileTabDesign() {
    const el = document.getElementById('mobileTabDesign');
    if (!el) return;

    const value = el.value;
    setMobileTabDesign(value);
    localStorage.setItem('mobileTabDesign', value);
    applyTheme();
}

// ============================================
// デフォルト表示形式
// ============================================

export function applyDefaultEstimateViewType() {
    // isEstimateTabFirstView check removed to ensure execution
    const savedSettings = localStorage.getItem('manhour_settings');
    let defaultViewType = 'matrix';

    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            defaultViewType = settings.defaultEstimateViewType || 'matrix';
        } catch (error) {
            console.error('見積ビュー設定の読み込みに失敗しました:', error);
            // デフォルト値を使用
        }
    }

    // 設定の表示形式を直接使用するため、setEstimateViewTypeを呼び出し
    if (typeof window.setEstimateViewType === 'function') {
        window.setEstimateViewType(defaultViewType);
    }
}

export function applyDefaultReportViewType() {
    // isReportTabFirstView check removed

    const savedSettings = localStorage.getItem('manhour_settings');
    let defaultViewType = 'matrix';

    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            defaultViewType = settings.defaultReportViewType || 'matrix';
        } catch (error) {
            console.error('レポートビュー設定の読み込みに失敗しました:', error);
            // デフォルト値を使用
        }
    }

    // 設定の表示形式を直接使用するため、setReportViewTypeを呼び出し
    if (typeof window.setReportViewType === 'function') {
        window.setReportViewType(defaultViewType);
    }
}

console.log('✅ モジュール theme.js loaded');
