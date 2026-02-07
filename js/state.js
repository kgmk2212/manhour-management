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
    phase1: true,
    phase2: true,
    phase3: true
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
export let reportMatrixBgColorMode = 'month'; // レポートマトリクスの背景色モード: 'none', 'month', 'deviation'
export let showProgressBarsSetting = true; // 進捗バー表示設定
export let showProgressPercentageSetting = true; // 進捗バーのパーセンテージ表示設定
export let progressBarStyle = 'inline'; // 進捗バーのスタイル: inline, bottom
export let matrixEstActFormat = 'twoRows'; // 見積と実績の表示形式: twoRows, slash

export let debugModeEnabled = false; // デバッグモード設定
export let devFeaturesEnabled = false; // 開発中の機能を表示するか
export let memberOrder = ''; // 担当者の表示順

// 見積関連
export let workMonthSelectionMode = false; // 作業月選択モード
export const selectedEstimateIds = new Set(); // 選択された見積ID

// テーマカラー関連
export let currentThemeColor = 'deep-blue';
export let currentThemePattern = 'gradient';
export let currentTabColor = 'deep-blue';
export let currentBackgroundColor = 'default';

// レイアウト設定（セグメント表示に固定）
export let estimateLayout = 'segmented';
export let actualLayout = 'segmented';
export let reportLayout = 'segmented';

// 初回表示フラグ
export let isEstimateTabFirstView = true;
export let isReportTabFirstView = true;

// クイック入力関連
export let quickInputMode = 'actual'; // クイック入力のモード
export let rememberQuickInputMode = false; // クイック入力のモードを記憶するか
export let mobileTabDesign = 'capsule'; // モバイルタブのデザイン: 'classic', 'dock', 'capsule'
export let workDetailStyle = 'modern'; // 作業詳細モーダルのスタイル: 'modern', 'classic'

// フィルタ状態の保持（画面遷移・データ更新時に維持するため）
export let estimateFilterState = {
    month: null,       // null = 未設定（デフォルト適用）
    version: null
};
export let reportFilterState = {
    filterType: 'version',  // 'version' or 'month'
    month: null,
    version: null
};

// ============================================
// Setter関数（他のモジュールから変更可能にする）
// ============================================

export function setEstimates(value) {
    estimates = value;
    window.estimates = value;
}

export function setFilteredEstimates(value) {
    filteredEstimates = value;
    window.filteredEstimates = value;
}

export function setActuals(value) {
    actuals = value;
    window.actuals = value;
}

export function setCompanyHolidays(value) {
    companyHolidays = value;
    window.companyHolidays = value;
}

export function setVacations(value) {
    vacations = value;
    window.vacations = value;
}

export function setRemainingEstimates(value) {
    remainingEstimates = value;
    window.remainingEstimates = value;
}

export function setNextCompanyHolidayId(value) {
    nextCompanyHolidayId = value;
    window.nextCompanyHolidayId = value;
}

export function setNextVacationId(value) {
    nextVacationId = value;
    window.nextVacationId = value;
}

export function setReportSettings(value) {
    reportSettings = value;
    window.reportSettings = value;
}

export function setPhaseCollapsed(value) {
    phaseCollapsed = value;
    window.phaseCollapsed = value;
}

export function setSelectedChartColorScheme(value) {
    selectedChartColorScheme = value;
    window.selectedChartColorScheme = value;
}

export function setShowMonthColorsSetting(value) {
    showMonthColorsSetting = value;
    window.showMonthColorsSetting = value;
}

export function setReportMatrixBgColorMode(value) {
    reportMatrixBgColorMode = value;
    window.reportMatrixBgColorMode = value;
}

export function setShowProgressBarsSetting(value) {
    showProgressBarsSetting = value;
    window.showProgressBarsSetting = value;
}

export function setShowProgressPercentageSetting(value) {
    showProgressPercentageSetting = value;
    window.showProgressPercentageSetting = value;
}

export function setProgressBarStyle(value) {
    progressBarStyle = value;
    window.progressBarStyle = value;
}

export function setMatrixEstActFormat(value) {
    matrixEstActFormat = value;
    window.matrixEstActFormat = value;
}



export function setDebugModeEnabled(value) {
    debugModeEnabled = value;
    window.debugModeEnabled = value;
}

export function setDevFeaturesEnabled(value) {
    devFeaturesEnabled = value;
    window.devFeaturesEnabled = value;
}

export function setWorkMonthSelectionMode(value) {
    workMonthSelectionMode = value;
    window.workMonthSelectionMode = value;
}

export function setMemberOrder(value) {
    memberOrder = value;
    window.memberOrder = value;
}

export function setCurrentThemeColor(value) {
    currentThemeColor = value;
    window.currentThemeColor = value;
}

export function setCurrentThemePattern(value) {
    currentThemePattern = value;
    window.currentThemePattern = value;
}

export function setCurrentTabColor(value) {
    currentTabColor = value;
    window.currentTabColor = value;
}

export function setCurrentBackgroundColor(value) {
    currentBackgroundColor = value;
    window.currentBackgroundColor = value;
}

export function setEstimateLayout(value) {
    estimateLayout = value;
    window.estimateLayout = value;
}

export function setActualLayout(value) {
    actualLayout = value;
    window.actualLayout = value;
}

export function setReportLayout(value) {
    reportLayout = value;
    window.reportLayout = value;
}

export function setIsEstimateTabFirstView(value) {
    isEstimateTabFirstView = value;
    window.isEstimateTabFirstView = value;
}

export function setIsReportTabFirstView(value) {
    isReportTabFirstView = value;
    window.isReportTabFirstView = value;
}

export function setQuickInputMode(value) {
    quickInputMode = value;
    window.quickInputMode = value;
}

export function setRememberQuickInputMode(value) {
    rememberQuickInputMode = value;
    window.rememberQuickInputMode = value;
}

export function setMobileTabDesign(value) {
    mobileTabDesign = value;
    window.mobileTabDesign = value;
}

export function setWorkDetailStyle(value) {
    workDetailStyle = value;
    window.workDetailStyle = value;
}


// ============================================
// [GANTT-CHART] スケジュール関連変数
// ============================================

// スケジュールデータ
export let schedules = [];
export let nextScheduleId = 1;

// スケジュール設定
export let scheduleSettings = {
    viewMode: 'member',      // 'member' | 'task'
    displayRange: 'month',   // 'month' | 'week'
    hoursPerDay: 8,          // 1日の作業時間
    currentMonth: null,      // 表示中の月（YYYY-MM）
    filterVersion: '',       // フィルタ: 版数
    filterMember: '',        // フィルタ: 担当者
    filterStatus: ''         // フィルタ: ステータス
};

// タスク色マッピング（タスク名 → 色）
export let taskColorMap = {};

// スケジュール関連Setter
export function setSchedules(value) {
    schedules = value;
}

export function setNextScheduleId(value) {
    nextScheduleId = value;
}

export function setScheduleSettings(value) {
    scheduleSettings = { ...scheduleSettings, ...value };
}

export function setTaskColorMap(value) {
    taskColorMap = value;
}

// フィルタ状態Setter
export function setEstimateFilterState(state) {
    estimateFilterState = { ...estimateFilterState, ...state };
}

export function setReportFilterState(state) {
    reportFilterState = { ...reportFilterState, ...state };
}
