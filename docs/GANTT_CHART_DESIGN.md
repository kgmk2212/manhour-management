# ガントチャート機能 詳細設計書

> **ステータス**: 設計完了
> **作成日**: 2026-01-27
> **関連文書**: [GANTT_CHART_SPEC.md](./GANTT_CHART_SPEC.md)

---

## 1. データ構造設計

### 1.1 既存データ構造（参照用）

#### 見積データ `estimates`
```javascript
{
  id: number,              // Date.now() + Math.random()
  version: string,         // "1.0"
  task: string,            // "機能A"
  process: string,         // "UI" | "PG" | "PT" | "IT" | "ST"
  member: string,          // "田中"
  hours: number,           // 24
  workMonth: string,       // "2026-01"
  workMonths: string[],    // ["2026-01", "2026-02"]
  monthlyHours: object,    // {"2026-01": 16, "2026-02": 8}
  createdAt: string        // ISO形式
}
```

#### 実績データ `actuals`
```javascript
{
  id: number,              // Date.now()
  date: string,            // "2026-01-15"
  version: string,
  task: string,
  process: string,
  member: string,
  hours: number,
  createdAt: string
}
```

#### 休暇データ `vacations`
```javascript
{
  id: number,
  member: string,
  date: string,            // "2026-01-15"
  vacationType: string,
  hours: number
}
```

#### 会社休日 `companyHolidays`
```javascript
{
  id: number,
  name: string,
  startDate: string,       // "2026-01-01"
  endDate: string          // "2026-01-03"
}
```

### 1.2 新規データ構造

#### スケジュールデータ `schedules`
```javascript
{
  id: string,              // "sch_" + timestamp
  
  // 見積との紐付け（version + task + process + member で一意）
  version: string,         // "1.0"
  task: string,            // "機能A"
  process: string,         // "設計"
  member: string,          // "田中"
  
  // 計画情報
  startDate: string,       // "2026-01-15" 着手日（ユーザー指定）
  estimatedHours: number,  // 24 見積工数（estimatesから取得）
  endDate: string,         // "2026-01-20" 終了予定日（自動計算）
  
  // 状態
  status: string,          // "pending" | "in_progress" | "completed"
  
  // 表示
  color: string,           // "#4A90D9" タスクごとに自動割当
  
  // メタ
  note: string,            // メモ
  createdAt: string,
  updatedAt: string
}
```

#### スケジュール設定 `scheduleSettings`（localStorage用）
```javascript
{
  viewMode: string,        // "member" | "task" 表示モード
  displayRange: string,    // "month" | "week"
  hoursPerDay: number,     // 8 1日の作業時間
  currentMonth: string     // "2026-01" 表示中の月
}
```

### 1.3 state.js への追加

```javascript
// 既存の変数の後に追加
export let schedules = [];
export let nextScheduleId = 1;
export let scheduleSettings = {
  viewMode: 'member',
  displayRange: 'month',
  hoursPerDay: 8,
  currentMonth: null // 初期化時に設定
};

// Setter関数
export function setSchedules(value) { schedules = value; }
export function setNextScheduleId(value) { nextScheduleId = value; }
export function setScheduleSettings(value) { scheduleSettings = { ...scheduleSettings, ...value }; }
```

### 1.4 constants.js への追加

```javascript
// スケジュール関連定数
export const SCHEDULE = {
  STATUS: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed'
  },
  VIEW_MODE: {
    MEMBER: 'member',
    TASK: 'task'
  },
  DISPLAY_RANGE: {
    MONTH: 'month',
    WEEK: 'week'
  },
  DEFAULT_HOURS_PER_DAY: 8,
  BAR_HEIGHT: 24,
  ROW_HEIGHT: 36,
  HEADER_HEIGHT: 60,
  DAY_WIDTH: 30
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
```

---

## 2. ファイル構成

```
js/
├── schedule.js           # スケジュール管理（CRUD、計算）
├── schedule-render.js    # ガントチャート描画（Canvas）
├── schedule-modal.js     # モーダル操作
└── schedule-utils.js     # 営業日計算ユーティリティ
```

---

## 3. 主要関数設計

### 3.1 schedule.js - スケジュール管理

```javascript
/**
 * 予定を追加
 * @param {Object} data - 予定データ
 * @param {string} data.version
 * @param {string} data.task
 * @param {string} data.process
 * @param {string} data.member
 * @param {string} data.startDate - 着手日 YYYY-MM-DD
 * @param {number} data.estimatedHours - 見積工数
 * @param {string} [data.note]
 * @returns {Object} 作成された予定
 */
export function addSchedule(data) { }

/**
 * 予定を更新
 * @param {string} id - 予定ID
 * @param {Object} updates - 更新データ
 * @returns {Object|null} 更新された予定
 */
export function updateSchedule(id, updates) { }

/**
 * 予定を削除
 * @param {string} id - 予定ID
 * @returns {boolean} 成功/失敗
 */
export function deleteSchedule(id) { }

/**
 * 担当者別に予定を取得
 * @param {string} member - 担当者名
 * @returns {Array} 予定配列
 */
export function getSchedulesByMember(member) { }

/**
 * 期間内の予定を取得
 * @param {string} startDate - 開始日 YYYY-MM-DD
 * @param {string} endDate - 終了日 YYYY-MM-DD
 * @returns {Array} 予定配列
 */
export function getSchedulesByDateRange(startDate, endDate) { }

/**
 * 見積データから予定を検索（紐付け用）
 * @param {string} version
 * @param {string} task
 * @param {string} process
 * @param {string} member
 * @returns {Object|null} 予定
 */
export function findScheduleByEstimate(version, task, process, member) { }

/**
 * 予定の進捗を計算
 * @param {Object} schedule - 予定データ
 * @returns {Object} { actualHours, progressRate, remainingHours, isDelayed }
 */
export function calculateProgress(schedule) { }

/**
 * タスクに色を割り当て（未割当の場合）
 * @param {string} task - タスク名
 * @returns {string} 色コード
 */
export function getTaskColor(task) { }
```

### 3.2 schedule-utils.js - 営業日計算

```javascript
/**
 * 指定日が営業日かどうか判定
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} member - 担当者名（個人休暇考慮用）
 * @returns {boolean}
 */
export function isBusinessDay(dateStr, member) { }

/**
 * 次の営業日を取得
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} member - 担当者名
 * @returns {string} YYYY-MM-DD
 */
export function getNextBusinessDay(dateStr, member) { }

/**
 * 営業日を加算して終了日を計算
 * @param {string} startDate - 着手日 YYYY-MM-DD
 * @param {number} hours - 見積工数
 * @param {string} member - 担当者名
 * @param {number} hoursPerDay - 1日の作業時間（デフォルト8）
 * @returns {string} 終了日 YYYY-MM-DD
 */
export function calculateEndDate(startDate, hours, member, hoursPerDay = 8) { }

/**
 * 2つの日付間の営業日数を計算
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {string} member - 担当者名
 * @returns {number} 営業日数
 */
export function countBusinessDays(startDate, endDate, member) { }

/**
 * 指定月の日付配列を生成
 * @param {string} yearMonth - YYYY-MM
 * @returns {Array<{date: string, dayOfWeek: number, isHoliday: boolean, holidayName: string}>}
 */
export function getMonthDays(yearMonth) { }
```

### 3.3 schedule-render.js - ガントチャート描画

```javascript
/**
 * ガントチャートを初期化
 * @param {string} canvasId - Canvas要素のID
 */
export function initGanttChart(canvasId) { }

/**
 * ガントチャートを描画
 * @param {string} yearMonth - 表示月 YYYY-MM
 * @param {string} viewMode - 'member' | 'task'
 */
export function renderGanttChart(yearMonth, viewMode) { }

/**
 * 日付ヘッダーを描画
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} days - 日付配列
 */
function drawDateHeader(ctx, days) { }

/**
 * 予定バーを描画
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} schedule - 予定データ
 * @param {number} rowIndex - 行インデックス
 * @param {Array} days - 日付配列
 */
function drawScheduleBar(ctx, schedule, rowIndex, days) { }

/**
 * 実績バーを描画（予定バーの上に重ねる）
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} schedule - 予定データ
 * @param {Array} actualDates - 実績のある日付配列
 * @param {number} rowIndex
 * @param {Array} days
 */
function drawActualBar(ctx, schedule, actualDates, rowIndex, days) { }

/**
 * 今日ラインを描画
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} days
 */
function drawTodayLine(ctx, days) { }

/**
 * Canvas上の座標からスケジュールを特定
 * @param {number} x
 * @param {number} y
 * @returns {Object|null} schedule
 */
export function getScheduleAtPosition(x, y) { }

/**
 * ドラッグ処理を初期化
 */
export function initDragHandlers() { }

/**
 * 月を移動
 * @param {number} delta - -1: 前月, 1: 次月
 */
export function navigateMonth(delta) { }

/**
 * 今日に移動
 */
export function goToToday() { }
```

### 3.4 schedule-modal.js - モーダル操作

```javascript
/**
 * 予定作成モーダルを開く
 * @param {Object} [prefill] - 事前入力データ
 */
export function openCreateScheduleModal(prefill) { }

/**
 * 予定作成モーダルを閉じる
 */
export function closeCreateScheduleModal() { }

/**
 * 予定詳細/編集モーダルを開く
 * @param {string} scheduleId
 */
export function openScheduleDetailModal(scheduleId) { }

/**
 * 予定詳細モーダルを閉じる
 */
export function closeScheduleDetailModal() { }

/**
 * モーダルから予定を保存
 */
export function saveScheduleFromModal() { }

/**
 * モーダルから予定を削除
 */
export function deleteScheduleFromModal() { }

/**
 * 見積選択時に工数を自動入力
 * @param {string} version
 * @param {string} task
 * @param {string} process
 * @param {string} member
 */
export function populateEstimateHours(version, task, process, member) { }

/**
 * 着手日変更時に終了日を再計算
 */
export function recalculateEndDate() { }
```

---

## 4. HTML構造設計

### 4.1 タブボタン（index.html）
```html
<!-- 既存のタブボタンの後に追加 -->
<button class="tab-button" onclick="showTab('schedule')">
  <span class="tab-icon">📅</span>
  <span class="tab-label">スケジュール</span>
</button>
```

### 4.2 タブコンテンツ（index.html）
```html
<div id="schedule" class="tab-content">
  <!-- ツールバー -->
  <div class="schedule-toolbar">
    <div class="schedule-nav">
      <button onclick="navigateMonth(-1)" class="nav-btn">◀ 前月</button>
      <span id="scheduleCurrentMonth" class="current-month">2026年1月</span>
      <button onclick="navigateMonth(1)" class="nav-btn">次月 ▶</button>
      <button onclick="goToToday()" class="nav-btn today-btn">今日</button>
    </div>
    <div class="schedule-view-toggle">
      <button onclick="setScheduleViewMode('member')" class="view-btn active" id="viewMemberBtn">担当者別</button>
      <button onclick="setScheduleViewMode('task')" class="view-btn" id="viewTaskBtn">タスク別</button>
    </div>
    <div class="schedule-actions">
      <button onclick="openCreateScheduleModal()" class="btn btn-primary">+ 予定作成</button>
    </div>
  </div>
  
  <!-- サマリーパネル -->
  <div class="schedule-summary" id="scheduleSummary">
    <div class="summary-item">
      <span class="summary-label">完了</span>
      <span class="summary-value" id="summaryCompleted">0/0</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">遅延</span>
      <span class="summary-value warning" id="summaryDelayed">0件</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">残作業</span>
      <span class="summary-value" id="summaryRemaining">0h</span>
    </div>
  </div>
  
  <!-- ガントチャート -->
  <div class="gantt-container" id="ganttContainer">
    <canvas id="ganttCanvas"></canvas>
  </div>
</div>

<!-- 予定作成モーダル -->
<div id="createScheduleModal" class="modal" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <h3>予定の作成</h3>
      <button class="close-btn" onclick="closeCreateScheduleModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>版数</label>
        <select id="scheduleVersion" onchange="updateScheduleTaskOptions()">
          <option value="">選択してください</option>
        </select>
      </div>
      <div class="form-group">
        <label>タスク</label>
        <select id="scheduleTask" onchange="updateScheduleProcessOptions()">
          <option value="">選択してください</option>
        </select>
      </div>
      <div class="form-group">
        <label>工程</label>
        <select id="scheduleProcess" onchange="updateScheduleMemberOptions()">
          <option value="">選択してください</option>
        </select>
      </div>
      <div class="form-group">
        <label>担当者</label>
        <select id="scheduleMember" onchange="populateEstimateHours()">
          <option value="">選択してください</option>
        </select>
      </div>
      <div class="form-group">
        <label>見積工数</label>
        <input type="number" id="scheduleEstimatedHours" readonly>
        <span class="unit">時間</span>
      </div>
      <div class="form-group">
        <label>着手日</label>
        <input type="date" id="scheduleStartDate" onchange="recalculateEndDate()">
      </div>
      <div class="form-group">
        <label>終了予定日</label>
        <input type="text" id="scheduleEndDate" readonly>
        <span class="calculated-days" id="scheduleWorkingDays"></span>
      </div>
      <div class="form-group">
        <label>メモ</label>
        <textarea id="scheduleNote" rows="2"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button onclick="closeCreateScheduleModal()" class="btn btn-secondary">キャンセル</button>
      <button onclick="saveScheduleFromModal()" class="btn btn-primary">作成</button>
    </div>
  </div>
</div>

<!-- 予定詳細モーダル -->
<div id="scheduleDetailModal" class="modal" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <h3 id="scheduleDetailTitle">予定詳細</h3>
      <button class="close-btn" onclick="closeScheduleDetailModal()">×</button>
    </div>
    <div class="modal-body">
      <!-- 進捗状況 -->
      <div class="progress-section">
        <div class="progress-bar-container">
          <div class="progress-bar" id="detailProgressBar"></div>
        </div>
        <div class="progress-stats">
          <span id="detailProgressRate">0%</span>
        </div>
      </div>
      
      <!-- 計画情報 -->
      <div class="detail-info">
        <div class="info-row">
          <span class="info-label">計画期間</span>
          <span class="info-value" id="detailPlanPeriod"></span>
        </div>
        <div class="info-row">
          <span class="info-label">見積工数</span>
          <span class="info-value" id="detailEstimatedHours"></span>
        </div>
        <div class="info-row">
          <span class="info-label">実績工数</span>
          <span class="info-value" id="detailActualHours"></span>
        </div>
        <div class="info-row">
          <span class="info-label">残作業</span>
          <span class="info-value" id="detailRemainingHours"></span>
        </div>
      </div>
      
      <!-- 実績一覧 -->
      <div class="actual-list" id="detailActualList">
        <!-- 動的に生成 -->
      </div>
      
      <!-- 編集フォーム -->
      <div class="edit-section">
        <div class="form-group">
          <label>着手日</label>
          <input type="date" id="detailStartDate" onchange="recalculateEndDateDetail()">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button onclick="deleteScheduleFromModal()" class="btn btn-danger">削除</button>
      <button onclick="closeScheduleDetailModal()" class="btn btn-secondary">閉じる</button>
      <button onclick="saveScheduleDetailChanges()" class="btn btn-primary">保存</button>
    </div>
  </div>
</div>
```

---

## 5. storage.js 拡張

### 5.1 saveData() への追加
```javascript
// 既存の保存処理の後に追加
localStorage.setItem('manhour_schedules', JSON.stringify(schedules));
localStorage.setItem('manhour_scheduleSettings', JSON.stringify(scheduleSettings));
```

### 5.2 loadData() への追加
```javascript
// 既存の読み込み処理の後に追加
const savedSchedules = localStorage.getItem('manhour_schedules');
const savedScheduleSettings = localStorage.getItem('manhour_scheduleSettings');

if (savedSchedules) setSchedules(JSON.parse(savedSchedules));
if (savedScheduleSettings) {
  setScheduleSettings(JSON.parse(savedScheduleSettings));
}

// スケジュールIDの最大値を設定
if (schedules.length > 0) {
  const maxId = Math.max(...schedules.map(s => {
    const match = s.id.match(/sch_(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }));
  setNextScheduleId(maxId + 1);
}
```

---

## 6. テスト観点

### 6.1 営業日計算
- [ ] 土日が正しくスキップされる
- [ ] 祝日（holiday_jp）が正しくスキップされる
- [ ] 会社休日が正しくスキップされる
- [ ] 個人休暇が正しくスキップされる
- [ ] 月またぎの計算が正しい
- [ ] 年またぎの計算が正しい

### 6.2 データ操作
- [ ] 予定の追加が正常に動作
- [ ] 予定の更新が正常に動作
- [ ] 予定の削除が正常に動作
- [ ] localStorage保存/読み込みが正常

### 6.3 表示
- [ ] 月表示が正しく描画される
- [ ] 担当者別/タスク別切り替えが正常
- [ ] 予定バーが正しい位置・長さ
- [ ] 実績バーが正しく重なる
- [ ] 遅延タスクが赤でハイライト
- [ ] 今日ラインが正しい位置

### 6.4 操作
- [ ] ドラッグで着手日変更が可能
- [ ] クリックで詳細モーダル表示
- [ ] モーダルから編集・削除が可能

---

## 変更履歴

| 日付 | 変更内容 | 担当 |
|------|----------|------|
| 2026-01-27 | 初版作成 | Claude |
