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
        ONTRACK: '#1D6FA5',
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
        BAR_HEIGHT: 24,
        ROW_HEIGHT: 36,
        HEADER_HEIGHT: 50,
        DAY_WIDTH: 28,
        LABEL_WIDTH: 200,  // 長い名前に対応するため拡大
        ROW_PADDING: 6,
        DEFAULT_DISPLAY_MONTHS: 3  // デフォルト表示月数
    },

    // 色設定（Ink & Amber デザインシステム準拠）
    COLORS: {
        PLAN_BAR: '#B3D4FC',      // 計画バー（薄い青）
        ACTUAL_BAR: '#4A90D9',    // 実績バー（濃い青）
        DELAYED: '#B91C1C',       // 遅延（--danger）
        COMPLETED: '#2D5A27',     // 完了（--accent）
        TODAY_LINE: '#B91C1C',    // 今日ライン（--danger: ソリッド赤）
        WEEKEND: '#FAF9F7',       // 週末背景（モックアップ準拠）
        HOLIDAY: '#FFF8ED',       // 祝日背景（--accent-secondary-light）
        GRID: '#F0EEEA',          // グリッド線（--border-light）
        MONTH_SEPARATOR: '#E7E5E0', // 月境界線（--border）
        // 追加: Ink & Amber デザイン色
        SURFACE: '#FFFFFF',
        SURFACE_ELEVATED: '#FAFAF9',
        BORDER: '#E7E5E0',
        TEXT_PRIMARY: '#1A1814',
        TEXT_MUTED: '#9C9690',
        HEADER_BG: '#FAFAF9',    // ヘッダー背景（--surface-elevated）
        LABEL_BG: '#FAFAF9'      // ラベル列背景
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

// タスク用カラーパレット（Ink & Amber デザインシステム準拠）
// 全色が明確に識別可能な配色（類似色を排除）
export const TASK_COLORS = [
    '#1E54CC', // 1  Blue（青）
    '#C42020', // 2  Red（赤）
    '#128F40', // 3  Green（緑）
    '#BF6804', // 4  Amber（琥珀）
    '#6A30D0', // 5  Purple（紫）
    '#0A8276', // 6  Teal（青緑）
    '#CF4C08', // 7  Orange（橙）
    '#C1206A', // 8  Pink（桃）
    '#433BC8', // 9  Indigo（藍）
    '#578E0A', // 10 Lime（黄緑）
    '#067E9C', // 11 Cyan（水色）
    '#7E2AD0', // 12 Violet（菫）
    '#B07A03', // 13 Yellow（山吹）
    '#A51350', // 14 Rose（ローズ）
    '#025A8C', // 15 Sky Blue（空色）
    '#9C4707', // 16 Copper（銅）
    '#04855C', // 17 Emerald（翠）
    '#AA380A', // 18 Vermillion（朱）
    '#5C22BF', // 19 Deep Purple（深紫）
    '#0B657D', // 20 Dark Cyan（深水色）
    '#8B5505', // 21 Gold（金茶）
    '#8A0F32', // 22 Crimson（深紅）
    '#1842BE', // 23 Royal Blue（瑠璃）
    '#116E34', // 24 Forest（深緑）
];
