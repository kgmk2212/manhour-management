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
    setFilterBarMode,

    setCurrentThemeColor, setCurrentThemePattern, setCurrentTabColor, setCurrentBackgroundColor,
    currentThemeColor, setTaskColorMap, scheduleBarColorMode, setScheduleBarColorMode,
    isEstimateTabFirstView, setIsEstimateTabFirstView,
    isReportTabFirstView, setIsReportTabFirstView,
    mobileTabDesign, setMobileTabDesign
} from './state.js';


// ============================================
// グラフカラースキーム
// ============================================

export function getActiveChartColorScheme() {
    if (selectedChartColorScheme === 'auto') {
        if (chartColorSchemes[window.currentThemeColor]) {
            return chartColorSchemes[window.currentThemeColor];
        }
        return chartColorSchemes['forest'];
    } else {
        return chartColorSchemes[selectedChartColorScheme] || chartColorSchemes['forest'];
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

// 旧テーマ名 → 新テーマ名のマッピング
const THEME_MIGRATION = {
    'deep-blue': 'deep-blue', 'navy': 'ocean', 'ocean': 'ocean', 'sky': 'ocean', 'cyan': 'ocean',
    'teal': 'forest', 'green': 'forest', 'emerald': 'forest',
    'indigo': 'violet', 'purple': 'violet',
    'slate': 'ink',
    'forest': 'forest', 'violet': 'violet', 'amber': 'amber', 'ink': 'ink'
};

function migrateThemeColor(color) {
    return THEME_MIGRATION[color] || 'forest';
}

export function loadThemeSettings() {
    const savedSettings = localStorage.getItem('manhour_settings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.themeColor) {
                const migrated = migrateThemeColor(settings.themeColor);
                setCurrentThemeColor(migrated);
                const el = document.getElementById('themeColor');
                if (el) el.value = migrated;
            }
            if (settings.themePattern) {
                setCurrentThemePattern(settings.themePattern);
                const el = document.getElementById('themePattern');
                if (el) el.value = settings.themePattern;
            }
            if (settings.themeTabColor) {
                setCurrentTabColor(settings.themeTabColor);
            }
            if (settings.themeBackgroundColor) {
                setCurrentBackgroundColor(settings.themeBackgroundColor);
            }
        } catch (error) {
            console.error('テーマ設定の読み込みに失敗しました:', error);
        }
    } else {
        // 旧形式から読み込み（後方互換性）
        const savedColor = localStorage.getItem('manhour_themeColor');
        if (savedColor) {
            const migrated = migrateThemeColor(savedColor);
            setCurrentThemeColor(migrated);
            const el = document.getElementById('themeColor');
            if (el) el.value = migrated;
        }
    }

    loadMobileTabDesign();
    applyTheme();
}

// Ink & Amber テーマカラー定義
const THEME_COLORS = {
    'forest': { accent: '#2D5A27', accentHover: '#3A7232', accentLight: '#EBF5EA', sidebarActiveBg: 'rgba(45,90,39,0.2)' },
    'ocean':  { accent: '#1D6FA5', accentHover: '#2580B8', accentLight: '#EFF6FF', sidebarActiveBg: 'rgba(29,111,165,0.2)' },
    'violet': { accent: '#7C3AED', accentHover: '#8B5CF6', accentLight: '#F5F3FF', sidebarActiveBg: 'rgba(124,58,237,0.2)' },
    'amber':  { accent: '#C4841D', accentHover: '#D4941F', accentLight: '#FFF8ED', sidebarActiveBg: 'rgba(196,132,29,0.2)' },
    'ink':    { accent: '#1A1814', accentHover: '#2D2A25', accentLight: '#F0EEEA', sidebarActiveBg: 'rgba(255,255,255,0.08)' },
    'deep-blue': { accent: '#1E3A5F', accentHover: '#264D7A', accentLight: '#EFF4FA', sidebarActiveBg: 'rgba(30,58,95,0.2)' },
    'rose':      { accent: '#BE185D', accentHover: '#DB2777', accentLight: '#FDF2F8', sidebarActiveBg: 'rgba(190,24,93,0.2)' },
    'teal':      { accent: '#0F766E', accentHover: '#14937A', accentLight: '#F0FDFA', sidebarActiveBg: 'rgba(15,118,110,0.2)' },
    'slate':     { accent: '#475569', accentHover: '#64748B', accentLight: '#F1F5F9', sidebarActiveBg: 'rgba(71,85,105,0.2)' }
};

export function applyTheme() {
    const colorEl = document.getElementById('themeColor');
    const prevTheme = currentThemeColor;

    // DOM要素が存在する場合はその値を使用
    if (colorEl && colorEl.value) {
        setCurrentThemeColor(colorEl.value);
    } else if (!window.currentThemeColor) {
        setCurrentThemeColor('forest');
    }

    // テーマ変更時（テーマカラーモードの場合）: タスクカラーマップをリセット
    if (prevTheme && prevTheme !== currentThemeColor && scheduleBarColorMode === 'theme') {
        setTaskColorMap({});
        rerenderScheduleIfVisible();
    }

    // パターンとタブカラーは新デザインでは未使用だが互換性のため維持
    const patternEl = document.getElementById('themePattern');
    if (patternEl && patternEl.value) {
        setCurrentThemePattern(patternEl.value);
    }
    const tabColorEl = document.getElementById('themeTabColor');
    if (tabColorEl && tabColorEl.value) {
        setCurrentTabColor(tabColorEl.value);
    }
    const backgroundColorEl = document.getElementById('themeBackgroundColor');
    if (backgroundColorEl && backgroundColorEl.value) {
        setCurrentBackgroundColor(backgroundColorEl.value);
    }

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

    // カラースウォッチのactive状態を更新
    const swatches = document.querySelectorAll('.color-swatch[data-theme]');
    swatches.forEach(s => {
        s.classList.toggle('active', s.dataset.theme === window.currentThemeColor);
    });

    if (typeof window.saveData === 'function') {
        window.saveData(true);
    }
}

export function updateThemePreview() {
    // Ink & Amber: テーマプレビューは不要（カラースウォッチで直接選択）
    // 互換性のために関数は維持
}

export function updateThemeElements() {
    const themeColor = window.currentThemeColor || 'forest';
    const theme = THEME_COLORS[themeColor] || THEME_COLORS['forest'];

    // CSS変数を更新（Ink & Amber デザインシステム）
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-hover', theme.accentHover);
    root.style.setProperty('--accent-light', theme.accentLight);
    root.style.setProperty('--sidebar-active-bg', theme.sidebarActiveBg);
    root.style.setProperty('--success', theme.accent);

    // 旧CSS変数も互換性のため設定
    root.style.setProperty('--theme-color', theme.accent);
    root.style.setProperty('--theme-gradient', theme.accent);

    // モーダルヘッダーのテーマカラーを更新
    const modalHeaders = document.querySelectorAll('.modal-header');
    modalHeaders.forEach(header => {
        header.className = header.className.replace(/modal-theme-\w+/g, '').trim();
        header.classList.add('modal-header', `modal-theme-${themeColor}`);
    });

    // セグメントボタンの色を更新（window経由）
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }

    // 見積合計カード - 新デザインではアクセントカラーベースに
    const estimateTotalCard = document.getElementById('estimateTotalCard');
    if (estimateTotalCard) {
        estimateTotalCard.style.background = theme.accent;
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
    // Ink & Amber デザイン: 背景色はCSS変数 var(--bg) で制御
    // body のインラインスタイルをクリア（旧デザインの残り）
    document.body.style.background = '';
}

export function updateElementTheme(element) {
    // Ink & Amber デザイン: テーマはCSS変数で制御されるため、
    // 要素への個別のテーマクラス適用は最小限
    const classes = Array.from(element.classList);
    classes.forEach(cls => {
        if (cls.startsWith('theme-') || cls.startsWith('pattern-') || cls.startsWith('tab-theme-')) {
            element.classList.remove(cls);
        }
    });

    // Ink & Amber: テーマカラーはCSS変数で自動適用
    // theme-bgクラスがある要素は残す（CSSで対応）
    if (element.classList.contains('theme-bg') || !element.classList.contains('tab')) {
        element.classList.add('theme-bg');
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



function rerenderScheduleIfVisible() {
    const scheduleTab = document.getElementById('schedule');
    if (scheduleTab && scheduleTab.classList.contains('active')) {
        if (typeof window.renderScheduleView === 'function') {
            setTimeout(() => window.renderScheduleView(), 100);
        }
    }
}

export function changeScheduleBarColorMode() {
    const selected = document.querySelector('input[name="scheduleBarColorMode"]:checked');
    if (selected) {
        setScheduleBarColorMode(selected.value);
        setTaskColorMap({});
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        rerenderScheduleIfVisible();
    }
}

export function changeFilterBarMode() {
    const selected = document.querySelector('input[name="filterBarMode"]:checked');
    if (selected) {
        setFilterBarMode(selected.value);
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
        if (typeof window.applyFilterBarMode === 'function') {
            window.applyFilterBarMode();
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
