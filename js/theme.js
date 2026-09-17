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

// 「自動」時のテーマ名→グラフスキームの対応（chartColorSchemes に同名キーが無いテーマ用）
const AUTO_SCHEME_FALLBACK = {
    'forest': 'green',
    'violet': 'purple',
    'ink': 'slate',
    'rose': 'purple',
    'amber': 'classic'
};

export function getActiveChartColorScheme() {
    if (selectedChartColorScheme === 'auto') {
        const theme = window.currentThemeColor;
        if (chartColorSchemes[theme]) {
            return chartColorSchemes[theme];
        }
        if (AUTO_SCHEME_FALLBACK[theme]) {
            return chartColorSchemes[AUTO_SCHEME_FALLBACK[theme]];
        }
        return chartColorSchemes['classic'];
    } else {
        return chartColorSchemes[selectedChartColorScheme] || chartColorSchemes['classic'];
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
    'ocean':  { accent: '#2A6080', accentHover: '#3A7498', accentLight: '#EDF3F8', sidebarActiveBg: 'rgba(42,96,128,0.2)' },
    'violet': { accent: '#5A4570', accentHover: '#6D5885', accentLight: '#F2EEF5', sidebarActiveBg: 'rgba(90,69,112,0.2)' },
    'amber':  { accent: '#7D5A28', accentHover: '#926C35', accentLight: '#F6F1E7', sidebarActiveBg: 'rgba(125,90,40,0.2)' },
    'ink':    { accent: '#1A1814', accentHover: '#2D2A25', accentLight: '#F0EEEA', sidebarActiveBg: 'rgba(255,255,255,0.08)' },
    'deep-blue': { accent: '#1E3A5F', accentHover: '#264D7A', accentLight: '#EFF4FA', sidebarActiveBg: 'rgba(30,58,95,0.2)' },
    'rose':      { accent: '#8E3050', accentHover: '#A44065', accentLight: '#FAF0F3', sidebarActiveBg: 'rgba(142,48,80,0.2)' },
    'teal':      { accent: '#0F766E', accentHover: '#14937A', accentLight: '#F0FDFA', sidebarActiveBg: 'rgba(15,118,110,0.2)' },
    'slate':     { accent: '#556270', accentHover: '#687888', accentLight: '#F1F4F6', sidebarActiveBg: 'rgba(85,98,112,0.2)' }
};

// ============================================
// アプリアイコン（favicon / iOS ホーム画面）のテーマ追従
// ============================================
// アイコンの構成は「背景＝テーマの accent」「時計の円周・棒グラフ1〜2本目＝薄緑固定」
// 「時計の針・棒グラフ3本目＝差し色」の3層。採用時（2026-09-13 案1「時計とグラフ」）の
// 骨格をどのテーマでも保つため、薄緑とレイアウトは不変とする。
// 図形の地色（時計の円周・棒グラフ1〜2本目）。テーマの accentLight とは切り離して固定する。
const ICON_FIGURE_COLOR = '#EBF5EA';

// ブランドのアンバー（style.css 定義）。差し色の基準色であり、既定テーマ forest のアイコン色。
const BRAND_AMBER = '#C4841D';

// 差し色（時計の針・棒グラフ3本目）のテーマ別定義。
// ブランドのアンバーをそのまま全テーマに載せると、背景が明るい・同系色のテーマで
// 差し色が沈んでしまう（teal 1.74 / amber 1.98 / slate 1.98 など、コントラスト比が
// forest の 2.56 を下回っていた）。そこでアンバーの色相を保ったまま明度・彩度だけを
// テーマごとに調整し、背景に対して最低 3:1 を確保している。
// forest / ink / deep-blue は既に十分なコントラストがあり、かつ forest は既定アイコン
// そのものなので、ブランドのアンバーを据え置く。
// 値を変えたら scripts/generate-app-icons.mjs 内の複製も更新し、PNGを再生成すること。
export const ICON_HIGHLIGHT_COLORS = {
    'forest': BRAND_AMBER,   // 2.56 - 既定アイコン。ブランドのアンバーを据え置く
    'ocean': '#E6B12E',      // 3.47 - 青背景に映えるよう明度を上げた金
    'violet': '#D5A11F',     // 3.55 - 紫＋金の古典的な組み合わせ
    'amber': '#EEBA2A',      // 3.47 - 背景と同系色のため明度差で分離
    'ink': BRAND_AMBER,      // 5.63 - 黒背景で最も映える。据え置き
    'deep-blue': BRAND_AMBER,// 3.65 - 既に3:1超。据え置き
    'rose': '#DCA039',       // 3.40 - 臙脂に調和する暖かみのあるアンティークゴールド
    'teal': '#F2B845',       // 3.05 - 背景が最も明るいテーマ。最も明るい金
    'slate': '#EFB839'       // 3.44 - 無彩色の背景に対し彩度の高い金で差をつける
};

// favicon: 背景（accent）と差し色だけを差し替えたSVGを都度生成し data URI として差し込む。
// apple-touch-icon: iOSの「ホーム画面に追加」はhref先を一度だけ取得して固定するため、
// data URIではなくテーマごとに事前生成したPNG（scripts/generate-app-icons.mjs）に切り替える。
/**
 * favicon用のSVG data URIを組み立てる。
 * @param {string} accent 背景に使うテーマのアクセントカラー（例: '#2D5A27'）
 * @param {string} [highlight] 差し色（時計の針・棒グラフ3本目）。省略時はブランドのアンバー
 * @returns {string} data:image/svg+xml, 形式のURI
 */
export function buildFaviconDataUri(accent, highlight = BRAND_AMBER) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
        `<rect width="100" height="100" rx="22" fill="${accent}"/>` +
        `<circle cx="33" cy="37" r="18" fill="none" stroke="${ICON_FIGURE_COLOR}" stroke-width="6"/>` +
        `<path d="M33 37 V25 M33 37 L41 43" fill="none" stroke="${highlight}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<rect x="52" y="62" width="9" height="20" rx="3" fill="${ICON_FIGURE_COLOR}"/>` +
        `<rect x="65" y="50" width="9" height="32" rx="3" fill="${ICON_FIGURE_COLOR}"/>` +
        `<rect x="78" y="36" width="9" height="46" rx="3" fill="${highlight}"/>` +
        `</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function updateAppIcons(themeColor, theme) {
    const faviconLink = document.querySelector('link[rel="icon"]');
    if (faviconLink) {
        faviconLink.href = buildFaviconDataUri(theme.accent, ICON_HIGHLIGHT_COLORS[themeColor] || BRAND_AMBER);
    }
    const touchIconLink = document.querySelector('link[rel="apple-touch-icon"]');
    if (touchIconLink) {
        touchIconLink.href = themeColor === 'forest'
            ? 'apple-touch-icon.png'
            : `apple-touch-icon-${themeColor}.png`;
    }
}

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

    updateAppIcons(themeColor, theme);

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
