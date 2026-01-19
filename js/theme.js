// ============================================
// テーマ・UI設定
// ============================================

import {
    chartColorSchemes,
    selectedChartColorScheme, setSelectedChartColorScheme,
    showMonthColorsSetting, setShowMonthColorsSetting,
    showDeviationColorsSetting, setShowDeviationColorsSetting,
    showProgressBarsSetting, setShowProgressBarsSetting,
    showProgressPercentageSetting, setShowProgressPercentageSetting,
    progressBarStyle, setProgressBarStyle,
    matrixEstActFormat, setMatrixEstActFormat,
    matrixDayMonthFormat, setMatrixDayMonthFormat,
    setCurrentThemeColor, setCurrentThemePattern, setCurrentTabColor, setCurrentBackgroundColor,
    isEstimateTabFirstView, setIsEstimateTabFirstView,
    isReportTabFirstView, setIsReportTabFirstView
} from './state.js';

// ============================================
// グラフカラースキーム
// ============================================

export function getActiveChartColorScheme() {
    if (selectedChartColorScheme === 'auto') {
        if (chartColorSchemes[window.currentThemeColor]) {
            return chartColorSchemes[window.currentThemeColor];
        }
        return chartColorSchemes['purple'];
    } else {
        return chartColorSchemes[selectedChartColorScheme] || chartColorSchemes['purple'];
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
        const settings = JSON.parse(savedSettings);
        if (settings.chartColorScheme) {
            setSelectedChartColorScheme(settings.chartColorScheme);
            const selector = document.getElementById('chartColorScheme');
            if (selector) {
                selector.value = selectedChartColorScheme;
            }
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

    applyTheme();
}

export function applyTheme() {
    const colorEl = document.getElementById('themeColor');
    const patternEl = document.getElementById('themePattern');
    const tabColorEl = document.getElementById('themeTabColor');
    const backgroundColorEl = document.getElementById('themeBackgroundColor');

    // DOM要素から値を読み取る（存在する場合のみ更新、loadThemeSettingsで設定された値を保持）
    if (colorEl && colorEl.value) window.currentThemeColor = colorEl.value;
    if (patternEl && patternEl.value) window.currentThemePattern = patternEl.value;
    if (tabColorEl && tabColorEl.value) window.currentTabColor = tabColorEl.value;
    if (backgroundColorEl && backgroundColorEl.value) window.currentBackgroundColor = backgroundColorEl.value;

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

    document.documentElement.style.setProperty('--theme-gradient', gradients[window.currentThemeColor] || gradients['purple']);
    document.documentElement.style.setProperty('--theme-color', solidColors[window.currentThemeColor] || solidColors['purple']);

    updateBodyBackground();

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
        estimateTotalCard.style.background = gradients[window.currentThemeColor] || gradients['purple'];
    }

    // 見積一覧の担当者別合計カード（見積タブがアクティブな場合のみ）
    const estimateTab = document.getElementById('estimate');
    if (estimateTab && estimateTab.classList.contains('active')) {
        if (typeof window.renderEstimateList === 'function') {
            window.renderEstimateList();
        }
    }

    // フローティングフィルタ
    updateFloatingFilterTheme();
}

export function updateFloatingFilterTheme() {
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

    const toggle = document.getElementById('floatingFilterToggle');
    if (toggle) {
        toggle.style.background = gradient;
    }

    const header = document.querySelector('.floating-filter-panel-header');
    if (header) {
        header.style.background = gradient;
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

    const gradient = colorGradients[bgColorToUse] || colorGradients['purple'];
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

export function toggleDeviationColorsSetting() {
    const checkbox = document.getElementById('showDeviationColorsCheckbox');
    if (checkbox) {
        setShowDeviationColorsSetting(checkbox.checked);
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

export function saveMatrixDayMonthFormat() {
    const selectedFormat = document.querySelector('input[name="matrixDayMonthFormat"]:checked');
    if (selectedFormat) {
        setMatrixDayMonthFormat(selectedFormat.value);
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
// デフォルト表示形式
// ============================================

export function applyDefaultEstimateViewType() {
    if (!isEstimateTabFirstView) {
        return;
    }
    setIsEstimateTabFirstView(false);

    const savedSettings = localStorage.getItem('manhour_settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        const defaultViewType = settings.defaultEstimateViewType || 'grouped';
        const estimateViewTypeElement = document.getElementById('estimateViewType');
        if (estimateViewTypeElement && estimateViewTypeElement.value !== defaultViewType) {
            estimateViewTypeElement.value = defaultViewType;
            if (typeof window.setEstimateViewType === 'function') {
                window.setEstimateViewType(defaultViewType);
            }
        }
    }
}

export function applyDefaultReportViewType() {
    if (!isReportTabFirstView) {
        return;
    }
    setIsReportTabFirstView(false);

    const savedSettings = localStorage.getItem('manhour_settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        const defaultViewType = settings.defaultReportViewType || 'grouped';
        const reportViewTypeElement = document.getElementById('reportViewType');
        if (reportViewTypeElement && reportViewTypeElement.value !== defaultViewType) {
            reportViewTypeElement.value = defaultViewType;
            if (typeof window.setReportViewType === 'function') {
                window.setReportViewType(defaultViewType);
            }
        }
    }
}

console.log('✅ モジュール theme.js loaded');
