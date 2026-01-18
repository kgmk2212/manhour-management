// ============================================
// グローバル変数・状態管理
// ============================================

// データ配列
export let estimates = [];
export let filteredEstimates = []; // フィルタリングされた見積データ（renderEstimateList関数で設定）
export let actuals = [];

// 休日・休暇データ
export let companyHolidays = []; // 会社休日データ
export let vacations = []; // 個人休暇データ
export let remainingEstimates = []; // 見込残存時間データ

// ID管理
export let nextCompanyHolidayId = 1;
export let nextVacationId = 1;

// レポート分析機能の設定
export let reportSettings = {
    accuracyEnabled: true,
    anomalyEnabled: true,
    warningTasksEnabled: true,
    chartEnabled: true,
    trendEnabled: true,
    memberAnalysisEnabled: true,
    insightsEnabled: true
};

// グラフカラースキーム定義（テーマカラーに対応）
export const chartColorSchemes = {
    'classic': {
        name: 'クラシック',
        barColors: {
            estimate: '#667eea',  // クラシック紫青
            actual: '#43e97b'     // クラシック緑
        },
        processColors: {
            'UI': '#667eea',  // クラシック紫青
            'PG': '#f093fb',  // クラシックピンク紫
            'PT': '#4facfe',  // クラシック青
            'IT': '#43e97b',  // クラシック緑
            'ST': '#fa709a'   // クラシックピンク
        }
    },
    'purple': {
        name: '紫',
        barColors: {
            estimate: '#ba68c8',  // 薄い紫
            actual: '#80cbc4'     // 薄いティール
        },
        processColors: {
            'UI': '#64b5f6',  // 薄い青
            'PG': '#81c784',  // 薄い緑
            'PT': '#ffb74d',  // 薄いオレンジ
            'IT': '#e57373',  // 薄い赤
            'ST': '#ba68c8'   // 薄い紫
        }
    },
    'indigo': {
        name: 'インディゴ',
        barColors: {
            estimate: '#9fa8da',  // 薄いインディゴ
            actual: '#ffb74d'     // 薄いオレンジ
        },
        processColors: {
            'UI': '#90caf9',  // 薄い青
            'PG': '#a5d6a7',  // 薄い緑
            'PT': '#ffcc80',  // 薄いオレンジ
            'IT': '#ef9a9a',  // 薄い赤
            'ST': '#ce93d8'   // 薄い紫
        }
    },
    'deep-blue': {
        name: 'ディープブルー',
        barColors: {
            estimate: '#64b5f6',  // 薄いディープブルー
            actual: '#ffb74d'     // 薄いオレンジ
        },
        processColors: {
            'UI': '#64b5f6',  // 薄い青
            'PG': '#81c784',  // 薄い緑
            'PT': '#ffb74d',  // 薄いオレンジ
            'IT': '#e57373',  // 薄い赤
            'ST': '#ba68c8'   // 薄い紫
        }
    },
    'ocean': {
        name: 'オーシャン',
        barColors: {
            estimate: '#81d4fa',  // 薄いオーシャンブルー
            actual: '#a5d6a7'     // 薄い緑
        },
        processColors: {
            'UI': '#81d4fa',  // 薄い水色
            'PG': '#80cbc4',  // 薄いティール
            'PT': '#ffcc80',  // 薄いオレンジ
            'IT': '#f48fb1',  // 薄いピンク
            'ST': '#ce93d8'   // 薄い紫
        }
    },
    'sky': {
        name: 'スカイブルー',
        barColors: {
            estimate: '#81d4fa',  // 薄いスカイブルー
            actual: '#f48fb1'     // 薄いピンク
        },
        processColors: {
            'UI': '#90caf9',  // 薄いブルー
            'PG': '#a5d6a7',  // 薄いグリーン
            'PT': '#ffcc80',  // 薄いオレンジ
            'IT': '#ef9a9a',  // 薄いレッド
            'ST': '#ce93d8'   // 薄いパープル
        }
    },
    'navy': {
        name: 'ネイビー',
        barColors: {
            estimate: '#7986cb',  // 薄いネイビー
            actual: '#ffb74d'     // 薄いオレンジ
        },
        processColors: {
            'UI': '#64b5f6',  // 薄いブルー
            'PG': '#81c784',  // 薄いグリーン
            'PT': '#ffb74d',  // 薄いオレンジ
            'IT': '#e57373',  // 薄いレッド
            'ST': '#ba68c8'   // 薄いパープル
        }
    },
    'teal': {
        name: 'ティール',
        barColors: {
            estimate: '#80cbc4',  // 薄いティール
            actual: '#ce93d8'     // 薄い紫
        },
        processColors: {
            'UI': '#81d4fa',  // 薄いシアン系ブルー
            'PG': '#80cbc4',  // 薄いティール
            'PT': '#ffb74d',  // 薄いオレンジ
            'IT': '#f48fb1',  // 薄いピンク
            'ST': '#ce93d8'   // 薄い紫
        }
    },
    'cyan': {
        name: 'シアン',
        barColors: {
            estimate: '#80deea',  // 薄いシアン
            actual: '#f48fb1'     // 薄いピンク
        },
        processColors: {
            'UI': '#80deea',  // 薄いシアン
            'PG': '#80cbc4',  // 薄いティール
            'PT': '#ffcc80',  // 薄いアンバー
            'IT': '#f48fb1',  // 薄いピンク
            'ST': '#ce93d8'   // 薄い紫
        }
    },
    'green': {
        name: 'グリーン',
        barColors: {
            estimate: '#81c784',  // 薄い緑
            actual: '#ffb74d'     // 薄いオレンジ
        },
        processColors: {
            'UI': '#64b5f6',  // 薄い青
            'PG': '#81c784',  // 薄い緑
            'PT': '#ffb74d',  // 薄いオレンジ
            'IT': '#e57373',  // 薄い赤
            'ST': '#ba68c8'   // 薄い紫
        }
    },
    'emerald': {
        name: 'エメラルド',
        barColors: {
            estimate: '#80cbc4',  // 薄いエメラルド
            actual: '#ce93d8'     // 薄いパープル
        },
        processColors: {
            'UI': '#81d4fa',  // 薄いスカイブルー
            'PG': '#80cbc4',  // 薄いティール
            'PT': '#ffcc80',  // 薄いアンバー
            'IT': '#f48fb1',  // 薄いピンク
            'ST': '#ce93d8'   // 薄いパープル
        }
    },
    'slate': {
        name: 'スレート',
        barColors: {
            estimate: '#90a4ae',  // 薄いスレート
            actual: '#81c784'     // 薄い緑
        },
        processColors: {
            'UI': '#64b5f6',  // 薄いブルー
            'PG': '#81c784',  // 薄いグリーン
            'PT': '#ffb74d',  // 薄いオレンジ
            'IT': '#e57373',  // 薄いレッド
            'ST': '#ba68c8'   // 薄いパープル
        }
    }
};

// Phaseセクションの折り畳み状態
export let phaseCollapsed = {
    phase1: false,
    phase2: false,
    phase3: false
};

// 選択されているグラフカラースキーム（'auto'の場合はテーマカラーに追従）
export let selectedChartColorScheme = 'auto';

// 月カラー定義
export const monthColors = {
    '01': { bg: 'rgba(200, 220, 240, 0.25)', rgb: '200, 220, 240', name: '1月', label: '1月' },   // 雪・冬空
    '02': { bg: 'rgba(180, 140, 180, 0.20)', rgb: '180, 140, 180', name: '2月', label: '2月' },   // 梅
    '03': { bg: 'rgba(255, 180, 200, 0.20)', rgb: '255, 180, 200', name: '3月', label: '3月' },   // 桃・早咲き桜
    '04': { bg: 'rgba(255, 200, 210, 0.20)', rgb: '255, 200, 210', name: '4月', label: '4月' },   // 桜
    '05': { bg: 'rgba(120, 200, 120, 0.20)', rgb: '120, 200, 120', name: '5月', label: '5月' },   // 新緑
    '06': { bg: 'rgba(130, 160, 210, 0.20)', rgb: '130, 160, 210', name: '6月', label: '6月' },   // 紫陽花・梅雨
    '07': { bg: 'rgba(100, 180, 220, 0.20)', rgb: '100, 180, 220', name: '7月', label: '7月' },   // 海・空
    '08': { bg: 'rgba(255, 180, 80, 0.20)', rgb: '255, 180, 80', name: '8月', label: '8月' },     // 向日葵・太陽
    '09': { bg: 'rgba(210, 160, 130, 0.20)', rgb: '210, 160, 130', name: '9月', label: '9月' },   // 秋の始まり
    '10': { bg: 'rgba(230, 120, 80, 0.20)', rgb: '230, 120, 80', name: '10月', label: '10月' },   // 紅葉
    '11': { bg: 'rgba(180, 120, 80, 0.20)', rgb: '180, 120, 80', name: '11月', label: '11月' },   // 枯葉
    '12': { bg: 'rgba(160, 180, 210, 0.22)', rgb: '160, 180, 210', name: '12月', label: '12月' }  // 冬・クリスマス
};

// 月別色付け設定
export let showMonthColorsSetting = true;
export let showDeviationColorsSetting = true; // 乖離率背景色の表示設定
export let showProgressBarsSetting = true; // 進捗バー表示設定
export let showProgressPercentageSetting = true; // 進捗バーのパーセンテージ表示設定
export let progressBarStyle = 'inline'; // 進捗バーのスタイル: inline, bottom
export let matrixEstActFormat = 'twoRows'; // 見積と実績の表示形式: twoRows, slash
export let matrixDayMonthFormat = 'inline'; // 人日/人月の表示形式: inline, separate, side, arrow
export let debugModeEnabled = false; // デバッグモード設定

// 見積編集モード関連
export let estimateEditMode = false; // 見積編集モード
export let workMonthSelectionMode = false; // 作業月選択モード
export const selectedEstimateIds = new Set(); // 選択された見積ID

// テーマカラー関連
export let currentThemeColor = 'purple';
export let currentThemePattern = 'gradient';
export let currentTabColor = 'purple';
export let currentBackgroundColor = 'default';

// レイアウト設定
export let estimateLayout = 'compact';
export let actualLayout = 'compact';
export let reportLayout = 'compact';

// 初回表示フラグ
export let isEstimateTabFirstView = true;
export let isReportTabFirstView = true;

// ============================================
// Setter関数（他のモジュールから変更可能にする）
// ============================================

export function setEstimates(value) {
    estimates = value;
}

export function setFilteredEstimates(value) {
    filteredEstimates = value;
}

export function setActuals(value) {
    actuals = value;
}

export function setCompanyHolidays(value) {
    companyHolidays = value;
}

export function setVacations(value) {
    vacations = value;
}

export function setRemainingEstimates(value) {
    remainingEstimates = value;
}

export function setNextCompanyHolidayId(value) {
    nextCompanyHolidayId = value;
}

export function setNextVacationId(value) {
    nextVacationId = value;
}

export function setReportSettings(value) {
    reportSettings = value;
}

export function setPhaseCollapsed(value) {
    phaseCollapsed = value;
}

export function setSelectedChartColorScheme(value) {
    selectedChartColorScheme = value;
}

export function setShowMonthColorsSetting(value) {
    showMonthColorsSetting = value;
}

export function setShowDeviationColorsSetting(value) {
    showDeviationColorsSetting = value;
}

export function setShowProgressBarsSetting(value) {
    showProgressBarsSetting = value;
}

export function setShowProgressPercentageSetting(value) {
    showProgressPercentageSetting = value;
}

export function setProgressBarStyle(value) {
    progressBarStyle = value;
}

export function setMatrixEstActFormat(value) {
    matrixEstActFormat = value;
}

export function setMatrixDayMonthFormat(value) {
    matrixDayMonthFormat = value;
}

export function setDebugModeEnabled(value) {
    debugModeEnabled = value;
}

export function setEstimateEditMode(value) {
    estimateEditMode = value;
}

export function setWorkMonthSelectionMode(value) {
    workMonthSelectionMode = value;
}

export function setCurrentThemeColor(value) {
    currentThemeColor = value;
}

export function setCurrentThemePattern(value) {
    currentThemePattern = value;
}

export function setCurrentTabColor(value) {
    currentTabColor = value;
}

export function setCurrentBackgroundColor(value) {
    currentBackgroundColor = value;
}

export function setEstimateLayout(value) {
    estimateLayout = value;
}

export function setActualLayout(value) {
    actualLayout = value;
}

export function setReportLayout(value) {
    reportLayout = value;
}

export function setIsEstimateTabFirstView(value) {
    isEstimateTabFirstView = value;
}

export function setIsReportTabFirstView(value) {
    isReportTabFirstView = value;
}
