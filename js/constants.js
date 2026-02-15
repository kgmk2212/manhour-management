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

// タスク用カラーパレット（デフォルト = forest テーマ）
export const TASK_COLORS = [
    '#2D5A27', // 1  Forest（深緑）
    '#B44020', // 2  Terracotta（テラコッタ）
    '#1A5E8B', // 3  Lake Blue（湖青）
    '#C08418', // 4  Honey（蜂蜜色）
    '#6A4B8C', // 5  Heather（ヘザー）
    '#0A7E6C', // 6  Jade（翡翠）
    '#C45B0C', // 7  Burnt Orange（焦橙）
    '#A03060', // 8  Raspberry（木苺）
    '#3A5E9E', // 9  Wedgwood（ウェッジウッド）
    '#6B8E23', // 10 Olive（オリーブ）
    '#0C7890', // 11 Deep Aqua（深碧）
    '#7E2E6A', // 12 Plum（プラム）
    '#8B6B15', // 13 Antique Gold（古金）
    '#8A2040', // 14 Dark Cherry（暗桜）
    '#2E6B50', // 15 Malachite（孔雀石）
    '#9C4707', // 16 Copper（銅）
    '#0B657D', // 17 Spruce（針葉樹）
    '#AA380A', // 18 Vermillion（朱）
    '#5B4F8C', // 19 Wisteria（藤）
    '#456B2F', // 20 Moss（苔）
    '#C1206A', // 21 Peony（牡丹）
    '#1842A0', // 22 Midnight（夜空）
    '#8B5505', // 23 Bronze（青銅）
    '#116E34', // 24 Emerald（翠）
];

// テーマ別カラーパレット
// 各テーマのアクセントカラーと調和する24色セット
export const THEME_TASK_COLORS = {
    // Forest: 森林・大地の自然色、アーシーで落ち着いた配色
    'forest': TASK_COLORS,

    // Ocean: 海と空の涼やかな配色、コーラルやサンドのアクセント
    'ocean': [
        '#1D6FA5', // 1  Ocean（大洋）
        '#C44320', // 2  Coral（珊瑚）
        '#2D8A4E', // 3  Seagrass（海草）
        '#C88A14', // 4  Sand（砂金）
        '#7040C0', // 5  Sea Urchin（海胆紫）
        '#0A8276', // 6  Lagoon（礁湖）
        '#D46018', // 7  Sunset（夕陽）
        '#B82868', // 8  Anemone（海葵）
        '#2848B8', // 9  Deep Sea（深海）
        '#6B8F15', // 10 Kelp（海藻）
        '#0898A8', // 11 Turquoise（碧玉）
        '#8830C0', // 12 Iris（虹彩）
        '#A88010', // 13 Gold Sand（金砂）
        '#A01850', // 14 Hibiscus（仏桑華）
        '#1454A5', // 15 Steel Blue（鉄紺）
        '#A85010', // 16 Amber（琥珀）
        '#0A6858', // 17 Mangrove（紅樹林）
        '#C04010', // 18 Vermillion（朱）
        '#5C30B8', // 19 Violet（菫）
        '#186890', // 20 Tidal（潮青）
        '#C82070', // 21 Fuchsia（桃紫）
        '#284890', // 22 Cobalt（紺碧）
        '#8A6810', // 23 Driftwood（流木）
        '#186040', // 24 Coastal（海松）
    ],

    // Violet: 華やかで創造的、紫を軸にした鮮烈な配色
    'violet': [
        '#7C3AED', // 1  Violet（菫）
        '#D03020', // 2  Ruby（紅玉）
        '#1880A0', // 3  Sapphire（蒼玉）
        '#D89018', // 4  Marigold（金盞花）
        '#2D6A30', // 5  Emerald（翠玉）
        '#0A8880', // 6  Malachite（孔雀石）
        '#E06010', // 7  Tangerine（蜜柑）
        '#C82068', // 8  Magenta（紅紫）
        '#1848C0', // 9  Lapis（瑠璃）
        '#6A9018', // 10 Chartreuse（黄緑）
        '#0888A8', // 11 Cyan（水色）
        '#A028C0', // 12 Amethyst（紫水晶）
        '#B88010', // 13 Gold（黄金）
        '#B81848', // 14 Crimson（深紅）
        '#3058C0', // 15 Indigo（藍）
        '#A85010', // 16 Copper（銅）
        '#108868', // 17 Jade（翡翠）
        '#C84018', // 18 Vermillion（朱）
        '#4828C0', // 19 Royal Purple（帝紫）
        '#0A7088', // 20 Dark Teal（深碧）
        '#E02878', // 21 Hot Pink（艶桃）
        '#204898', // 22 Navy（紺）
        '#888010', // 23 Olive（橄欖）
        '#5820A8', // 24 Deep Purple（深紫）
    ],

    // Amber: 暖かく豊かな配色、金・橙・琥珀を軸に
    'amber': [
        '#C4841D', // 1  Amber（琥珀）
        '#C83828', // 2  Cinnabar（辰砂）
        '#1860A0', // 3  Lapis（瑠璃）
        '#2D6A30', // 4  Basil（蘖）
        '#7840B8', // 5  Iris（鳶尾花）
        '#1A8070', // 6  Verdigris（緑青）
        '#D05A10', // 7  Tangerine（蜜柑）
        '#B82060', // 8  Ruby（紅玉）
        '#3050B0', // 9  Cobalt（紺碧）
        '#688A18', // 10 Olive（橄欖）
        '#0880A0', // 11 Teal（碧玉）
        '#9030C0', // 12 Lavender（藤紫）
        '#A06C08', // 13 Dark Gold（暗金）
        '#A01848', // 14 Garnet（柘榴石）
        '#1A6890', // 15 Steel（鉄紺）
        '#B04E08', // 16 Burnt Sienna（焦茶）
        '#108860', // 17 Emerald（翠）
        '#B83810', // 18 Rust（錆朱）
        '#6030B0', // 19 Purple（紫）
        '#0A6878', // 20 Petrol（石油青）
        '#C82068', // 21 Magenta（紅紫）
        '#284890', // 22 Indigo（藍）
        '#807010', // 23 Bronze（青銅）
        '#903010', // 24 Mahogany（桃花心木）
    ],

    // Ink: 落ち着いたインク色、彩度を抑えた洗練された配色
    'ink': [
        '#3A3632', // 1  Charcoal（墨炭）
        '#8B3A2A', // 2  Sienna（赤茶）
        '#2A5A80', // 3  Slate Blue（石板青）
        '#8A7020', // 4  Ochre（黄土）
        '#5A408A', // 5  Muted Purple（灰紫）
        '#2A6A60', // 6  Muted Teal（灰碧）
        '#A0582A', // 7  Burnt Umber（焦茶）
        '#8A305A', // 8  Muted Rose（灰薔薇）
        '#3A4A7A', // 9  Storm（嵐）
        '#5A7A2A', // 10 Sage（鼠緑）
        '#2A6A7A', // 11 Muted Cyan（灰水色）
        '#6A3A8A', // 12 Dusty Violet（灰菫）
        '#7A6A1A', // 13 Antique Gold（古金）
        '#7A2A40', // 14 Wine（葡萄酒）
        '#2A4A70', // 15 Denim（藍鼠）
        '#7A4A1A', // 16 Sepia（墨茶）
        '#2A5A4A', // 17 Forest（暗緑）
        '#8A3A1A', // 18 Rust（錆）
        '#4A3A7A', // 19 Dusk（薄暮）
        '#2A5A5A', // 20 Pewter（錫）
        '#8A2A4A', // 21 Burgundy（葡萄）
        '#2A3A6A', // 22 Slate（石板）
        '#6A5A1A', // 23 Brass（真鍮）
        '#4A3A2A', // 24 Espresso（珈琲）
    ],

    // Deep Blue: 重厚で権威的、紺を軸にした深い配色
    'deep-blue': [
        '#1E3A5F', // 1  Deep Blue（紺青）
        '#C03A20', // 2  Scarlet（緋）
        '#2A7A40', // 3  Eucalyptus（灰緑）
        '#C08818', // 4  Saffron（蕃紅花）
        '#7038B0', // 5  Purple（紫）
        '#0A7A78', // 6  Teal（碧玉）
        '#D06018', // 7  Orange（橙）
        '#B82060', // 8  Cerise（仏桑華）
        '#2040B0', // 9  Royal Blue（瑠璃）
        '#5A8A18', // 10 Lime（黄緑）
        '#0890A0', // 11 Cerulean（空色）
        '#8028C0', // 12 Violet（菫）
        '#A08010', // 13 Mustard（芥子）
        '#A01848', // 14 Crimson（深紅）
        '#185290', // 15 Sapphire（蒼玉）
        '#A05010', // 16 Copper（銅）
        '#0A7860', // 17 Malachite（孔雀石）
        '#B83818', // 18 Rust（錆朱）
        '#5A30B0', // 19 Indigo（藍）
        '#1A5A80', // 20 Dusk Blue（暮青）
        '#C02868', // 21 Rose（薔薇）
        '#1A3890', // 22 Navy（紺）
        '#807010', // 23 Bronze（青銅）
        '#1A4A3A', // 24 Dark Teal（深碧）
    ],

    // Rose: 華やかなピンク/ベリー系、グリーンとティールのコントラスト
    'rose': [
        '#BE185D', // 1  Rose（薔薇）
        '#C83828', // 2  Poppy（罌粟）
        '#1A6A90', // 3  Dusk Blue（暮青）
        '#C08818', // 4  Honey（蜂蜜）
        '#7838C0', // 5  Violet（菫）
        '#0A807A', // 6  Teal（碧玉）
        '#D06818', // 7  Tangerine（蜜柑）
        '#1A5A30', // 8  Emerald（翠）
        '#3048B8', // 9  Lapis（瑠璃）
        '#6A8A18', // 10 Olive（橄欖）
        '#0888A0', // 11 Cyan（水色）
        '#9030B0', // 12 Orchid（蘭）
        '#A07A10', // 13 Gold（黄金）
        '#8A1A38', // 14 Berry（漿果）
        '#2A5A80', // 15 Slate Blue（石板青）
        '#A05010', // 16 Copper（銅）
        '#1A6A58', // 17 Jade（翡翠）
        '#B04018', // 18 Terracotta（テラコッタ）
        '#5A28B0', // 19 Purple（紫）
        '#0A6880', // 20 Petrol（石油青）
        '#D82878', // 21 Fuchsia（桃紫）
        '#1A3A80', // 22 Navy（紺）
        '#807018', // 23 Olive Gold（橄欖金）
        '#6A1A38', // 24 Mulberry（桑実）
    ],

    // Teal: 清涼感のあるティール/グリーン系、暖色のアクセント
    'teal': [
        '#0F766E', // 1  Teal（碧玉）
        '#C04020', // 2  Coral（珊瑚）
        '#1A58A0', // 3  Sapphire（蒼玉）
        '#C88818', // 4  Marigold（金盞花）
        '#7040B0', // 5  Iris（鳶尾花）
        '#2A6A30', // 6  Leaf（若葉）
        '#D06018', // 7  Pumpkin（南瓜）
        '#B82860', // 8  Rose（薔薇）
        '#2848B0', // 9  Cobalt（紺碧）
        '#6A8A1A', // 10 Moss（苔）
        '#0A88A8', // 11 Turquoise（碧玉）
        '#8030B8', // 12 Amethyst（紫水晶）
        '#A07A10', // 13 Gold（黄金）
        '#A01848', // 14 Crimson（深紅）
        '#1A5890', // 15 Steel（鉄紺）
        '#A05010', // 16 Copper（銅）
        '#1A7A58', // 17 Jade（翡翠）
        '#B84018', // 18 Rust（錆朱）
        '#5A30A8', // 19 Purple（紫）
        '#0A6070', // 20 Deep Teal（深碧）
        '#C82068', // 21 Magenta（紅紫）
        '#2A4890', // 22 Indigo（藍）
        '#807010', // 23 Bronze（青銅）
        '#0A5A48', // 24 Deep Green（深翠）
    ],

    // Slate: プロフェッショナル、彩度を抑えた落ち着いた配色
    'slate': [
        '#475569', // 1  Slate（石板）
        '#8A4030', // 2  Muted Red（灰赤）
        '#2A5A80', // 3  Muted Blue（灰青）
        '#8A7028', // 4  Muted Gold（灰金）
        '#5A4088', // 5  Muted Purple（灰紫）
        '#2A6A62', // 6  Muted Teal（灰碧）
        '#9A5A20', // 7  Muted Orange（灰橙）
        '#8A3058', // 8  Muted Pink（灰桃）
        '#3A4888', // 9  Muted Indigo（灰藍）
        '#5A7A28', // 10 Muted Green（灰緑）
        '#2A6A7A', // 11 Muted Cyan（灰水色）
        '#6A3888', // 12 Muted Violet（灰菫）
        '#7A6A18', // 13 Muted Yellow（灰金茶）
        '#7A2840', // 14 Muted Rose（灰薔薇）
        '#2A4870', // 15 Muted Navy（灰紺）
        '#7A4A18', // 16 Muted Amber（灰琥珀）
        '#2A5A4A', // 17 Muted Emerald（灰翠）
        '#8A3A18', // 18 Muted Rust（灰錆）
        '#4A3880', // 19 Muted Purple（灰紫②）
        '#2A5868', // 20 Muted Petrol（灰鉛青）
        '#8A2858', // 21 Muted Magenta（灰紅紫）
        '#2A3868', // 22 Muted Dark（灰暗）
        '#6A5A18', // 23 Muted Bronze（灰青銅）
        '#3A4A48', // 24 Muted Charcoal（灰炭）
    ],
};
