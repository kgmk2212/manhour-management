// ============================================
// アプリケーション定数定義
// ============================================

/**
 * レイアウト関連の定数
 */
export const LAYOUT = {
    // レスポンシブブレークポイント
    MOBILE_BREAKPOINT: 768,

    // ヘッダーとナビゲーション
    HEADER_HEIGHT: 60,
    TAB_TRIGGER_ZONE: 60,

    // アニメーション
    ANIMATION_DURATION_MS: 300,
    FADE_DURATION_MS: 200,

    // スペーシング（パディング・マージン）
    SPACING: {
        XS: 2,
        SM: 4,
        BASE: 6,
        MD: 8,
        LG: 10,
        XL: 12,
        XXL: 15,
        XXXL: 20
    }
};

/**
 * ジェスチャー認識関連の定数
 */
export const GESTURE = {
    // スワイプ判定
    MIN_SWIPE_DISTANCE: 100,
    MAX_VERTICAL_DISTANCE: 50,

    // タッチイベント
    TOUCH_SENSITIVITY: 0.5
};

/**
 * 進捗管理関連の定数
 */
export const PROGRESS = {
    // 見積比較閾値
    WARNING_THRESHOLD: 1.2,  // 見積の120%で警告
    EXCEEDED_THRESHOLD: 1.0, // 見積の100%で注意

    // ステータス定義
    STATUS: {
        COMPLETED: 'completed',
        ONTRACK: 'ontrack',
        WARNING: 'warning',
        EXCEEDED: 'exceeded',
        UNKNOWN: 'unknown'
    },

    // ステータス色
    STATUS_COLORS: {
        COMPLETED: '#27ae60',
        ONTRACK: '#3498db',
        WARNING: '#f39c12',
        EXCEEDED: '#e74c3c',
        UNKNOWN: '#999'
    },

    // ステータスラベル
    STATUS_LABELS: {
        COMPLETED: '完了',
        ONTRACK: '順調',
        WARNING: '注意',
        EXCEEDED: '超過',
        UNKNOWN: '未設定'
    }
};

/**
 * 計算関連の定数
 */
export const CALCULATIONS = {
    // デフォルト値
    DEFAULT_WORKING_DAYS: 20,
    HOURS_PER_DAY: 8,
    DAYS_PER_MONTH: 20,

    // 人月換算
    HOURS_PER_MAN_MONTH: 160,  // 20日 × 8時間

    // 丸め処理
    DECIMAL_PLACES: 2
};

/**
 * UI表示関連の定数
 */
export const UI = {
    // ページネーション
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 200,

    // セグメントボタン
    MAX_VISIBLE_SEGMENTS: 6,

    // テーブル
    MAX_TABLE_ROWS_BEFORE_PAGINATION: 100,

    // モーダル
    MODAL_Z_INDEX: 1000,
    OVERLAY_Z_INDEX: 999,

    // デフォルト値
    DEFAULT_MEMBER_LABEL: '未設定',

    // テーブル背景色
    TABLE_COLORS: {
        HEADER_BG: '#1565c0',
        ROW_BG: '#f5f5f5',
        SUBTOTAL_BG: '#fff3cd',
        DAILY_TOTAL_BG: '#ffc107',
        EMPTY_CELL_BG: '#fafafa',
        VACATION_BG: '#fff3e0',
        HOLIDAY_BG: '#ffebee'
    },

    // バッジ色
    BADGE_COLORS: {
        UNSET: '#dc3545',
        SET: '#28a745'
    },

    // フォントサイズ
    FONT_SIZES: {
        XS: 10,
        SM: 11,
        BASE: 12,
        MD: 13,
        LG: 14,
        XL: 15,
        XXL: 16,
        XXXL: 18
    },

    // 透明度
    OPACITY: {
        LIGHT: 0.15,
        MEDIUM: 0.2,
        STRONG: 0.3,
        HEAVY: 0.35,
        OPAQUE: 0.4
    }
};

/**
 * ストレージキー定義
 */
export const STORAGE_KEYS = {
    // データ
    ESTIMATES: 'manhour_estimates',
    ACTUALS: 'manhour_actuals',
    REMAINING_ESTIMATES: 'manhour_remainingEstimates',
    COMPANY_HOLIDAYS: 'manhour_companyHolidays',
    VACATIONS: 'manhour_vacations',

    // 設定
    THEME_COLOR: 'manhour_themeColor',
    THEME_PATTERN: 'manhour_themePattern',
    TAB_COLOR: 'manhour_tabColor',
    BACKGROUND_COLOR: 'manhour_backgroundColor',

    // UI状態
    CURRENT_TAB: 'manhour_currentTab',
    MEMBER_ORDER: 'manhour_memberOrder',

    // 表示設定
    SHOW_MONTH_COLORS: 'manhour_showMonthColors',
    SHOW_DEVIATION_COLORS: 'manhour_showDeviationColors',
    SHOW_PROGRESS_BARS: 'manhour_showProgressBars',
    SHOW_PROGRESS_PERCENTAGE: 'manhour_showProgressPercentage',

    // レイアウト
    ESTIMATE_LAYOUT: 'manhour_estimateLayout',
    ACTUAL_LAYOUT: 'manhour_actualLayout',
    REPORT_LAYOUT: 'manhour_reportLayout',

    // その他
    AUTO_BACKUP: 'manhour_autoBackup',
    QUICK_INPUT_MODE: 'manhour_quickInputMode',
    DEBUG_MODE: 'manhour_debugMode',

    // キャパシティ表示
    CAPACITY_DISPLAY_MODE: 'manhour_capacityDisplayMode'
};

/**
 * バリデーション関連の定数
 */
export const VALIDATION = {
    // 文字列長
    MAX_VERSION_LENGTH: 50,
    MAX_TASK_NAME_LENGTH: 100,
    MAX_FORM_NAME_LENGTH: 100,
    MAX_MEMBER_NAME_LENGTH: 50,

    // 数値範囲
    MIN_HOURS: 0.1,
    MAX_HOURS: 999.9,

    // 日付
    MIN_YEAR: 2000,
    MAX_YEAR: 2100
};

/**
 * エラーメッセージ
 */
export const ERROR_MESSAGES = {
    REQUIRED_FIELD: '必須項目です',
    INVALID_NUMBER: '有効な数値を入力してください',
    INVALID_DATE: '有効な日付を入力してください',
    OUT_OF_RANGE: '値が範囲外です',
    DUPLICATE_ENTRY: '既に登録されています',
    SAVE_FAILED: '保存に失敗しました',
    LOAD_FAILED: '読み込みに失敗しました',
    NETWORK_ERROR: 'ネットワークエラーが発生しました'
};

/**
 * 成功メッセージ
 */
export const SUCCESS_MESSAGES = {
    SAVED: '保存しました',
    DELETED: '削除しました',
    UPDATED: '更新しました',
    IMPORTED: 'インポートしました',
    EXPORTED: 'エクスポートしました'
};

/**
 * 工程（プロセス）関連の定数
 */
export const PROCESS = {
    // 工程タイプ（ウォーターフォール順序）
    TYPES: ['UI', 'PG', 'PT', 'IT', 'ST'],

    // 工程名
    UI: 'UI',
    PG: 'PG',
    PT: 'PT',
    IT: 'IT',
    ST: 'ST',

    // 工程別色（チャート・グラフ用）
    COLORS: {
        UI: '#4dabf7',
        PG: '#20c997',
        PT: '#ff922b',
        IT: '#51cf66',
        ST: '#f06595'
    }
};


// ============================================
// [GANTT-CHART] スケジュール関連定数
// ============================================

export const SCHEDULE = {
    // ステータス
    STATUS: {
        PENDING: 'pending',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed'
    },

    // 表示モード
    VIEW_MODE: {
        MEMBER: 'member',
        TASK: 'task'
    },

    // 表示範囲
    DISPLAY_RANGE: {
        MONTH: 'month',
        WEEK: 'week'
    },

    // デフォルト値
    DEFAULT_HOURS_PER_DAY: 8,

    // Canvas描画設定
    CANVAS: {
        BAR_HEIGHT: 20,
        ROW_HEIGHT: 32,
        HEADER_HEIGHT: 50,
        DAY_WIDTH: 28,
        LABEL_WIDTH: 200,  // 長い名前に対応するため拡大
        ROW_PADDING: 6
    },

    // 色設定
    COLORS: {
        PLAN_BAR: '#B3D4FC',      // 計画バー（薄い青）
        ACTUAL_BAR: '#4A90D9',    // 実績バー（濃い青）
        DELAYED: '#FF6B6B',       // 遅延（赤）
        COMPLETED: '#50C878',     // 完了（緑）
        TODAY_LINE: '#FF5722',    // 今日ライン（オレンジ）
        WEEKEND: '#F5F5F5',       // 週末背景
        HOLIDAY: '#FFF3E0',       // 祝日背景
        GRID: '#E0E0E0'           // グリッド線
    }
};

/**
 * キャパシティ超過表示モード
 */
export const CAPACITY_DISPLAY_MODE = {
    STRIPE: 'stripe',           // 案1: ストライプパターンのみ
    STRIPE_WARNING: 'stripe_warning', // 案1+3: ストライプ + 警告アイコン/アニメーション
    STRIPE_BG: 'stripe_bg',     // 案1+6: ストライプ + 背景色変化
    GAUGE: 'gauge'              // 案4: ゲージ表示
};

// タスク用カラーパレット（自動割当用）
export const TASK_COLORS = [
    '#4A90D9', // 青
    '#50C878', // 緑
    '#FFB347', // オレンジ
    '#FF6B6B', // 赤
    '#9B59B6', // 紫
    '#1ABC9C', // ティール
    '#F39C12', // 黄
    '#E74C3C', // 深赤
    '#3498DB', // 明るい青
    '#2ECC71'  // 明るい緑
];
