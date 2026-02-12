// ============================================
// [GANTT-CHART] スケジュール管理モジュール
// ============================================

import {
    schedules, setSchedules, nextScheduleId, setNextScheduleId,
    scheduleSettings, setScheduleSettings,
    taskColorMap, setTaskColorMap,
    estimates, actuals, vacations, companyHolidays, remainingEstimates
} from './state.js';
import { getRemainingEstimate, saveRemainingEstimate } from './estimate.js';
import { SCHEDULE, TASK_COLORS } from './constants.js';
import { formatHours } from './utils.js';
import { renderGanttChart, setupCanvasClickHandler, setupDragAndDrop, setupTooltipHandler, setupTouchHandlers, getRenderer } from './schedule-render.js';

// getRendererをリエクスポート（ui.jsからwindow経由でアクセス用）
export { getRenderer as getScheduleRenderer };

// ============================================
// 初期化
// ============================================

/**
 * スケジュールモジュールを初期化
 */
export function initScheduleModule() {
    // 現在の月を設定
    if (!scheduleSettings.currentMonth) {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        setScheduleSettings({ currentMonth });
    }
    
    // 月表示を更新
    updateCurrentMonthDisplay();
    
    // Canvasクリックハンドラをセットアップ
    setupCanvasClickHandler((schedule) => {
        openScheduleDetailModal(schedule.id);
    });
    
    // ドラッグ&ドロップハンドラをセットアップ
    setupDragAndDrop((scheduleId, newStartDate) => {
        handleScheduleDrag(scheduleId, newStartDate);
    });
    
    // ツールチップハンドラをセットアップ
    setupTooltipHandler();

    // タッチイベントハンドラをセットアップ（モバイル対応）
    setupTouchHandlers(
        (schedule) => { openScheduleDetailModal(schedule.id); },
        (scheduleId, newStartDate) => { handleScheduleDrag(scheduleId, newStartDate); }
    );

    // キーボードショートカットをセットアップ
    setupKeyboardShortcuts();
    
    // スクロール同期リスナーを設定
    setupScrollSyncListener();

    // 初期描画
    renderScheduleView();

    console.log('[Schedule] Module initialized');
}

/**
 * スクロール同期リスナーを設定
 * 横スクロール位置の中央月をcurrentMonthに反映
 */
let scrollSyncSetup = false;
function setupScrollSyncListener() {
    // initDualCanvas後にコンテナが存在するので、MutationObserverで監視
    const observer = new MutationObserver(() => {
        const scrollContainer = document.getElementById('ganttTimelineScroll');
        if (scrollContainer && !scrollSyncSetup) {
            scrollSyncSetup = true;
            let scrollTimer = null;
            scrollContainer.addEventListener('scroll', () => {
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    const renderer = getRenderer();
                    if (!renderer) return;
                    const centerMonth = renderer.getVisibleCenterMonth();
                    if (centerMonth) {
                        const monthStr = `${centerMonth.year}-${String(centerMonth.month).padStart(2, '0')}`;
                        if (monthStr !== scheduleSettings.currentMonth) {
                            setScheduleSettings({ currentMonth: monthStr });
                            updateCurrentMonthDisplay();
                            updateUnscheduledBadge();
                        }
                    }
                }, 150);
            });
            observer.disconnect();
        }
    });
    const ganttContainer = document.getElementById('ganttContainer');
    if (ganttContainer) {
        observer.observe(ganttContainer, { childList: true, subtree: true });
    }
}

/**
 * 現在の月表示を更新
 */
export function updateCurrentMonthDisplay() {
    const display = document.getElementById('scheduleCurrentMonth');
    if (display && scheduleSettings.currentMonth) {
        const [year, month] = scheduleSettings.currentMonth.split('-');
        display.textContent = `${year}年${parseInt(month)}月`;
    }
}

/**
 * スケジュールビューを描画
 */
export function renderScheduleView() {
    // フィルタオプションを更新
    updateScheduleFilterOptions();

    // フィルタ件数を更新
    updateFilterResultCount();

    // サマリーを更新
    updateScheduleSummary();

    // 未スケジュールバッジを更新
    updateUnscheduledBadge();
    
    // フィルタされたスケジュールを取得
    const filteredSchedules = getFilteredSchedules();
    
    // 空メッセージの表示/非表示
    const emptyMessage = document.getElementById('scheduleEmptyMessage');
    const ganttContainer = document.getElementById('ganttContainer');
    
    if (filteredSchedules.length === 0) {
        if (emptyMessage) {
            emptyMessage.style.display = 'block';
            // フィルタ適用中とそうでない場合でメッセージを変える
            const hasFilters = scheduleSettings.filterVersion || scheduleSettings.filterMember || scheduleSettings.filterStatus;
            emptyMessage.innerHTML = hasFilters
                ? '<p>該当するスケジュールがありません</p><p style="font-size: 14px; color: #888;">フィルタ条件を変更してください</p>'
                : '<p>スケジュールがありません</p><p style="font-size: 14px; color: #888;">「+ 予定作成」ボタンから予定を追加してください</p>';
        }
        if (ganttContainer) ganttContainer.style.display = 'none';
    } else {
        if (emptyMessage) emptyMessage.style.display = 'none';
        if (ganttContainer) ganttContainer.style.display = 'block';
        
        // Canvas描画
        if (scheduleSettings.currentMonth) {
            const [year, month] = scheduleSettings.currentMonth.split('-').map(Number);
            renderGanttChart(year, month, filteredSchedules);

            // スクロール位置の保持: 再描画前の位置を復元
            const scrollEl = document.getElementById('ganttTimelineScroll');
            const prevScrollLeft = scrollEl ? scrollEl.scrollLeft : null;

            const renderer = getRenderer();
            if (renderer) {
                requestAnimationFrame(() => {
                    const el = document.getElementById('ganttTimelineScroll');
                    if (!el) return;
                    if (prevScrollLeft !== null && prevScrollLeft > 0) {
                        // 再描画: 直前のスクロール位置を維持
                        el.scrollLeft = prevScrollLeft;
                    } else if (typeof window._ganttScrollLeft === 'number' && window._ganttScrollLeft > 0) {
                        // タブ復帰: 保存済み位置を復元
                        el.scrollLeft = window._ganttScrollLeft;
                    } else {
                        // 初回: 現在月の位置へスクロール
                        renderer.scrollToMonth(year, month, false);
                    }
                });
            }
        }
    }
}

/**
 * サマリーを更新（フィルタ適用）
 */
export function updateScheduleSummary() {
    // フィルタされたスケジュールでサマリーを計算
    const filteredSchedules = getFilteredSchedules();
    
    const completed = filteredSchedules.filter(s => s.status === SCHEDULE.STATUS.COMPLETED).length;
    const inProgress = filteredSchedules.filter(s => s.status === SCHEDULE.STATUS.IN_PROGRESS).length;
    const total = filteredSchedules.length;
    const delayed = filteredSchedules.filter(s => isDelayed(s)).length;
    const remaining = filteredSchedules.reduce((sum, s) => {
        const progress = calculateProgress(s);
        return sum + progress.remainingHours;
    }, 0);
    
    // 本日の予定（今日が期間内にあるスケジュール）
    const today = new Date().toISOString().split('T')[0];
    const todaySchedules = filteredSchedules.filter(s => {
        return s.startDate <= today && s.endDate >= today && s.status !== SCHEDULE.STATUS.COMPLETED;
    }).length;
    
    const completedEl = document.getElementById('summaryCompleted');
    const inProgressEl = document.getElementById('summaryInProgress');
    const delayedEl = document.getElementById('summaryDelayed');
    const remainingEl = document.getElementById('summaryRemaining');
    const todayEl = document.getElementById('summaryToday');
    
    if (completedEl) completedEl.textContent = `${completed}/${total}`;
    if (inProgressEl) inProgressEl.textContent = `${inProgress}件`;
    if (delayedEl) delayedEl.textContent = `${delayed}件`;
    if (remainingEl) remainingEl.textContent = `${formatHours(remaining)}h`;
    if (todayEl) todayEl.textContent = `${todaySchedules}件`;
}

// ============================================
// 月ナビゲーション
// ============================================

/**
 * 月を移動
 * @param {number} delta - -1: 前月, 1: 次月
 */
export function navigateScheduleMonth(delta) {
    if (!scheduleSettings.currentMonth) return;

    const [year, month] = scheduleSettings.currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    const newYear = date.getFullYear();
    const newMonthNum = date.getMonth() + 1;
    const newMonth = `${newYear}-${String(newMonthNum).padStart(2, '0')}`;

    const renderer = getRenderer();

    // 描画範囲内ならスムーズスクロールのみ
    if (renderer && renderer.isMonthInRange(newYear, newMonthNum)) {
        setScheduleSettings({ currentMonth: newMonth });
        updateCurrentMonthDisplay();
        updateUnscheduledBadge();
        renderer.scrollToMonth(newYear, newMonthNum, true);
    } else {
        // 範囲外なら再描画してからスクロール
        setScheduleSettings({ currentMonth: newMonth });
        updateCurrentMonthDisplay();
        renderScheduleView();
        if (renderer) {
            renderer.scrollToMonth(newYear, newMonthNum, false);
        }
    }
}

/**
 * 今日の月に移動
 */
export function goToScheduleToday() {
    const now = new Date();
    const newYear = now.getFullYear();
    const newMonthNum = now.getMonth() + 1;
    const currentMonth = `${newYear}-${String(newMonthNum).padStart(2, '0')}`;

    const renderer = getRenderer();

    setScheduleSettings({ currentMonth });
    updateCurrentMonthDisplay();

    // 範囲内なら今日の位置へスクロール
    if (renderer && renderer.isMonthInRange(newYear, newMonthNum)) {
        updateUnscheduledBadge();
        renderer.scrollToToday(true);
    } else {
        // 範囲外なら再描画して今日へスクロール
        renderScheduleView();
        const newRenderer = getRenderer();
        if (newRenderer) {
            newRenderer.scrollToToday(false);
        }
    }
}

// ============================================
// 表示モード切替
// ============================================

/**
 * 表示モードを設定
 * @param {'member' | 'task'} mode
 */
export function setScheduleViewMode(mode) {
    setScheduleSettings({ viewMode: mode });
    
    // ボタンのアクティブ状態を更新
    const memberBtn = document.getElementById('viewMemberBtn');
    const taskBtn = document.getElementById('viewTaskBtn');
    
    if (memberBtn && taskBtn) {
        memberBtn.classList.toggle('active', mode === 'member');
        taskBtn.classList.toggle('active', mode === 'task');
    }
    
    renderScheduleView();
}

// ============================================
// CRUD操作
// ============================================

/**
 * 予定を追加
 */
export function addSchedule(data) {
    const id = `sch_${nextScheduleId}`;
    setNextScheduleId(nextScheduleId + 1);
    
    const schedule = {
        id,
        version: data.version,
        task: data.task,
        process: data.process,
        member: data.member,
        startDate: data.startDate,
        estimatedHours: data.estimatedHours,
        endDate: data.endDate || calculateEndDate(data.startDate, data.estimatedHours, data.member),
        status: SCHEDULE.STATUS.PENDING,
        color: getTaskColor(data.task),
        note: data.note || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    setSchedules([...schedules, schedule]);

    if (typeof window.saveData === 'function') {
        window.saveData();
    }

    renderScheduleView();
    return schedule;
}

/**
 * 予定を追加（レンダリングなし、バッチ用）
 * @param {Object} data - スケジュールデータ
 * @returns {Object} 作成されたスケジュール
 */
function addScheduleSilent(data) {
    const id = `sch_${nextScheduleId}`;
    setNextScheduleId(nextScheduleId + 1);

    const schedule = {
        id,
        version: data.version,
        task: data.task,
        process: data.process,
        member: data.member,
        startDate: data.startDate,
        estimatedHours: data.estimatedHours,
        endDate: data.endDate || calculateEndDate(data.startDate, data.estimatedHours, data.member),
        status: SCHEDULE.STATUS.PENDING,
        color: getTaskColor(data.task),
        note: data.note || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    setSchedules([...schedules, schedule]);
    return schedule;
}

/**
 * 予定を更新
 */
export function updateSchedule(id, updates) {
    const index = schedules.findIndex(s => s.id === id);
    if (index === -1) return null;
    
    const updated = {
        ...schedules[index],
        ...updates,
        updatedAt: new Date().toISOString()
    };
    
    const newSchedules = [...schedules];
    newSchedules[index] = updated;
    setSchedules(newSchedules);
    
    if (typeof window.saveData === 'function') {
        window.saveData();
    }
    
    renderScheduleView();
    return updated;
}

/**
 * 予定を削除
 */
export function deleteSchedule(id) {
    setSchedules(schedules.filter(s => s.id !== id));
    
    if (typeof window.saveData === 'function') {
        window.saveData();
    }
    
    renderScheduleView();
    return true;
}

// ============================================
// 進捗計算
// ============================================

/**
 * 予定の進捗を計算（見込み残存時間を優先使用）
 */
export function calculateProgress(schedule) {
    // 対応する実績を取得
    const relatedActuals = actuals.filter(a =>
        a.version === schedule.version &&
        a.task === schedule.task &&
        a.process === schedule.process &&
        a.member === schedule.member
    );
    
    const actualHours = relatedActuals.reduce((sum, a) => sum + (a.hours || 0), 0);
    const estimatedHours = schedule.estimatedHours || 0;
    
    // 見込み残存時間を取得（ユーザーが入力した値を優先）
    const remainingEstimate = getRemainingEstimate(
        schedule.version, 
        schedule.task, 
        schedule.process, 
        schedule.member
    );
    
    // 見込み残存時間がある場合はそれを使用、なければ計算値
    let remainingHours;
    let hasUserRemaining = false;
    
    if (remainingEstimate && remainingEstimate.remainingHours !== undefined) {
        remainingHours = remainingEstimate.remainingHours;
        hasUserRemaining = true;
    } else {
        remainingHours = Math.max(0, estimatedHours - actualHours);
    }
    
    // 進捗率の計算
    // 見込み残存時間がある場合: (見積 - 残存) / 見積 * 100
    // ない場合: 実績 / 見積 * 100
    let progressRate;
    if (hasUserRemaining && estimatedHours > 0) {
        progressRate = ((estimatedHours - remainingHours) / estimatedHours) * 100;
    } else if (estimatedHours > 0) {
        progressRate = (actualHours / estimatedHours) * 100;
    } else {
        progressRate = 0;
    }
    
    // 完了ステータスの場合は100%
    if (schedule.status === SCHEDULE.STATUS.COMPLETED) {
        progressRate = 100;
        remainingHours = 0;
    }
    
    return {
        actualHours,
        progressRate: Math.min(Math.max(progressRate, 0), 100),
        remainingHours: Math.max(remainingHours, 0),
        hasUserRemaining,
        estimatedHours,
        isDelayed: isDelayed(schedule)
    };
}

/**
 * 遅延判定
 */
export function isDelayed(schedule) {
    if (schedule.status === SCHEDULE.STATUS.COMPLETED) return false;
    
    const today = new Date().toISOString().split('T')[0];
    return schedule.endDate < today;
}

// ============================================
// ユーティリティ
// ============================================

/**
 * タスクに色を割り当て
 * @param {string} version - 版数（オプション、タスクと組み合わせてキーを作成）
 * @param {string} task - タスク名
 * @returns {string} - 色コード
 */
export function getTaskColor(version, task) {
    // 引数が1つだけの場合は旧互換モード
    if (task === undefined) {
        task = version;
        version = '';
    }
    
    // 版数とタスク名を組み合わせたキーを使用
    const key = version ? `${version}/${task}` : task;
    
    if (taskColorMap[key]) {
        return taskColorMap[key];
    }
    
    // 未割当の場合、新しい色を割り当て
    const usedColors = Object.values(taskColorMap);
    const availableColors = TASK_COLORS.filter(c => !usedColors.includes(c));
    const color = availableColors.length > 0 
        ? availableColors[0] 
        : TASK_COLORS[Object.keys(taskColorMap).length % TASK_COLORS.length];
    
    const newMap = { ...taskColorMap, [key]: color };
    setTaskColorMap(newMap);
    
    return color;
}

/**
 * 日付が営業日かどうか判定
 * @param {Date} date - 判定する日付
 * @param {string} member - 担当者名（休暇チェック用）
 * @returns {boolean}
 */
export function isBusinessDay(date, member) {
    const dayOfWeek = date.getDay();
    
    // 土日チェック
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false;
    }
    
    const dateStr = formatDateForCheck(date);
    
    // 祝日チェック（holiday_jp）
    try {
        if (window.holiday_jp && window.holiday_jp.isHoliday(date)) {
            return false;
        }
    } catch (e) {
        // holiday_jpが利用できない場合は無視
    }
    
    // 会社休日チェック
    const isCompanyHolidayDate = companyHolidays.some(h => h.date === dateStr);
    if (isCompanyHolidayDate) {
        return false;
    }
    
    // 担当者の休暇チェック
    if (member) {
        const hasVacation = vacations.some(v =>
            v.member === member &&
            v.date === dateStr &&
            (v.hours >= 8 || v.vacationType !== '時間休')
        );
        if (hasVacation) {
            return false;
        }
    }
    
    return true;
}

/**
 * 日付をYYYY-MM-DD形式に変換
 */
function formatDateForCheck(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 終了日を計算（営業日ベース）
 * @param {string} startDate - 開始日（YYYY-MM-DD）
 * @param {number} hours - 見積工数
 * @param {string} member - 担当者名
 * @returns {string} - 終了日（YYYY-MM-DD）
 */
export function calculateEndDate(startDate, hours, member) {
    const hoursPerDay = scheduleSettings.hoursPerDay || 8;
    const requiredDays = Math.ceil(hours / hoursPerDay);
    
    if (requiredDays <= 0) {
        return startDate;
    }
    
    const date = new Date(startDate);
    let businessDaysCount = 0;
    
    // 開始日が営業日ならカウント開始
    if (isBusinessDay(date, member)) {
        businessDaysCount = 1;
    }
    
    // 必要な営業日数に達するまでループ
    while (businessDaysCount < requiredDays) {
        date.setDate(date.getDate() + 1);
        if (isBusinessDay(date, member)) {
            businessDaysCount++;
        }
    }
    
    return formatDateForCheck(date);
}

/**
 * 2つの日付間の営業日数を計算
 */
export function countBusinessDays(startDate, endDate, member) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    
    const current = new Date(start);
    while (current <= end) {
        if (isBusinessDay(current, member)) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }
    
    return count;
}

// ============================================
// モーダル操作
// ============================================

let currentEditingScheduleId = null;

/**
 * 予定作成モーダルを開く
 */
export function openCreateScheduleModal() {
    currentEditingScheduleId = null;
    
    // フォームをリセット
    const form = {
        version: document.getElementById('scheduleVersion'),
        task: document.getElementById('scheduleTask'),
        process: document.getElementById('scheduleProcess'),
        member: document.getElementById('scheduleMember'),
        estimatedHours: document.getElementById('scheduleEstimatedHours'),
        startDate: document.getElementById('scheduleStartDate'),
        endDate: document.getElementById('scheduleEndDate'),
        workingDays: document.getElementById('scheduleWorkingDays'),
        note: document.getElementById('scheduleNote')
    };
    
    // 版数オプションを更新
    updateScheduleVersionOptions();
    
    // 着手日を今日に設定
    const today = new Date().toISOString().split('T')[0];
    if (form.startDate) form.startDate.value = today;
    
    // モーダルを表示
    const modal = document.getElementById('createScheduleModal');
    if (modal) modal.style.display = 'flex';
}

/**
 * 予定作成モーダルを閉じる
 */
export function closeCreateScheduleModal() {
    const modal = document.getElementById('createScheduleModal');
    if (modal) modal.style.display = 'none';
}

/**
 * 予定詳細モーダルを開く
 */
export function openScheduleDetailModal(scheduleId) {
    currentEditingScheduleId = scheduleId;
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;
    
    // タイトル
    const title = document.getElementById('scheduleDetailTitle');
    if (title) title.textContent = `${schedule.version} / ${schedule.task} / ${schedule.process}`;
    
    // 進捗
    const progress = calculateProgress(schedule);
    const progressBar = document.getElementById('detailProgressBar');
    const progressRate = document.getElementById('detailProgressRate');
    
    // 完了ステータスの場合は100%表示
    const displayRate = schedule.status === SCHEDULE.STATUS.COMPLETED ? 100 : progress.progressRate;
    if (progressBar) progressBar.style.width = `${displayRate}%`;
    if (progressRate) progressRate.textContent = `${displayRate.toFixed(0)}%`;
    
    // 情報
    document.getElementById('detailPlanPeriod').textContent = 
        `${schedule.startDate} 〜 ${schedule.endDate}`;
    document.getElementById('detailEstimatedHours').textContent = 
        `${schedule.estimatedHours}h`;
    document.getElementById('detailActualHours').textContent =
        `${formatHours(progress.actualHours)}h`;

    // 残作業表示（見込み残存時間がある場合は★マーク付き）
    const remainingText = progress.hasUserRemaining
        ? `${formatHours(progress.remainingHours)}h ★`
        : `${formatHours(progress.remainingHours)}h`;
    document.getElementById('detailRemainingHours').textContent = remainingText;
    
    // 見込み残存時間入力欄
    const userRemainingInput = document.getElementById('detailUserRemainingHours');
    if (userRemainingInput) {
        const remainingEstimate = getRemainingEstimate(
            schedule.version, schedule.task, schedule.process, schedule.member
        );
        userRemainingInput.value = remainingEstimate ? remainingEstimate.remainingHours : '';
    }
    
    // ステータスボタンを更新
    updateStatusButtons(schedule.status || SCHEDULE.STATUS.PENDING);
    
    // 着手日
    const startDateInput = document.getElementById('detailStartDate');
    if (startDateInput) startDateInput.value = schedule.startDate;
    
    // 関連する実績一覧を表示
    renderDetailActualList(schedule);
    
    // モーダルを表示
    const modal = document.getElementById('scheduleDetailModal');
    if (modal) modal.style.display = 'flex';
}

/**
 * 詳細モーダルに実績一覧を表示
 */
function renderDetailActualList(schedule) {
    const container = document.getElementById('detailActualList');
    if (!container) return;
    
    // 対応する実績を取得
    const relatedActuals = actuals.filter(a =>
        a.version === schedule.version &&
        a.task === schedule.task &&
        a.process === schedule.process &&
        a.member === schedule.member
    ).sort((a, b) => b.date.localeCompare(a.date)); // 日付降順
    
    if (relatedActuals.length === 0) {
        container.innerHTML = '<p class="text-muted">実績データがありません</p>';
        return;
    }
    
    const html = `
        <h4>実績履歴（最新5件）</h4>
        <table class="actual-list-table">
            <thead>
                <tr>
                    <th>日付</th>
                    <th>時間</th>
                </tr>
            </thead>
            <tbody>
                ${relatedActuals.slice(0, 5).map(a => `
                    <tr>
                        <td>${a.date}</td>
                        <td>${a.hours}h</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        ${relatedActuals.length > 5 ? `<p class="text-muted">...他${relatedActuals.length - 5}件</p>` : ''}
    `;
    
    container.innerHTML = html;
}

/**
 * 予定詳細モーダルを閉じる
 */
export function closeScheduleDetailModal() {
    const modal = document.getElementById('scheduleDetailModal');
    if (modal) modal.style.display = 'none';
    currentEditingScheduleId = null;
}

/**
 * スケジュール詳細から対応する見積の編集モーダルを開く
 */
export function openEstimateFromSchedule() {
    if (!currentEditingScheduleId) return;
    const schedule = schedules.find(s => s.id === currentEditingScheduleId);
    if (!schedule) return;

    // 対応する見積を検索
    const estimate = estimates.find(e =>
        e.version === schedule.version &&
        e.task === schedule.task &&
        e.process === schedule.process &&
        e.member === schedule.member
    );

    if (!estimate) {
        showToast('対応する見積データが見つかりません', 'warning');
        return;
    }

    // スケジュール詳細モーダルを閉じてから見積編集モーダルを開く
    closeScheduleDetailModal();

    if (typeof window.editEstimate === 'function') {
        window.editEstimate(estimate.id);
    }
}

/**
 * モーダルから予定を保存
 */
export function saveScheduleFromModal() {
    const version = document.getElementById('scheduleVersion')?.value;
    const task = document.getElementById('scheduleTask')?.value;
    const process = document.getElementById('scheduleProcess')?.value;
    const member = document.getElementById('scheduleMember')?.value;
    const estimatedHours = parseFloat(document.getElementById('scheduleEstimatedHours')?.value) || 0;
    const startDate = document.getElementById('scheduleStartDate')?.value;
    const note = document.getElementById('scheduleNote')?.value || '';
    
    if (!version || !task || !process || !member || !startDate || estimatedHours <= 0) {
        showToast('必須項目を入力してください', 'warning');
        return;
    }
    
    const newSchedule = addSchedule({
        version, task, process, member, estimatedHours, startDate, note
    });

    pushUndoAction({
        type: 'create',
        schedule: { ...newSchedule }
    });

    highlightNewSchedules([newSchedule.id]);

    closeCreateScheduleModal();
    showToast('予定を作成しました', 'success');
}

/**
 * 詳細モーダルから変更を保存
 */
export function saveScheduleDetailChanges() {
    if (!currentEditingScheduleId) return;

    const startDate = document.getElementById('detailStartDate')?.value;
    if (!startDate) return;

    const schedule = schedules.find(s => s.id === currentEditingScheduleId);
    if (!schedule) return;

    // 終了日を再計算
    const endDate = calculateEndDate(startDate, schedule.estimatedHours, schedule.member);

    pushUndoAction({
        type: 'update',
        scheduleId: currentEditingScheduleId,
        oldValues: { startDate: schedule.startDate, endDate: schedule.endDate },
        newValues: { startDate, endDate }
    });

    updateSchedule(currentEditingScheduleId, { startDate, endDate });
    closeScheduleDetailModal();
}

/**
 * モーダルから予定を削除
 */
export function deleteScheduleFromModal() {
    if (!currentEditingScheduleId) return;

    if (!confirm('この予定を削除しますか？')) return;

    const schedule = schedules.find(s => s.id === currentEditingScheduleId);
    if (schedule) {
        pushUndoAction({
            type: 'delete',
            schedule: { ...schedule }
        });
    }

    deleteSchedule(currentEditingScheduleId);
    closeScheduleDetailModal();
    showToast('予定を削除しました（Ctrl+Zで元に戻す）', 'success');
}

// ============================================
// フォーム連携
// ============================================

/**
 * 版数オプションを更新
 */
export function updateScheduleVersionOptions() {
    const select = document.getElementById('scheduleVersion');
    if (!select) return;
    
    const versions = [...new Set(estimates.map(e => e.version))].sort();
    
    select.innerHTML = '<option value="">選択してください</option>';
    versions.forEach(v => {
        select.innerHTML += `<option value="${v}">${v}</option>`;
    });
}

/**
 * タスクオプションを更新
 */
export function updateScheduleTaskOptions() {
    const versionSelect = document.getElementById('scheduleVersion');
    const taskSelect = document.getElementById('scheduleTask');
    if (!versionSelect || !taskSelect) return;
    
    const version = versionSelect.value;
    const tasks = [...new Set(
        estimates.filter(e => e.version === version).map(e => e.task)
    )].sort();
    
    taskSelect.innerHTML = '<option value="">選択してください</option>';
    tasks.forEach(t => {
        taskSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });
    
    // 下位のセレクトをリセット
    document.getElementById('scheduleProcess').innerHTML = '<option value="">選択してください</option>';
    document.getElementById('scheduleMember').innerHTML = '<option value="">選択してください</option>';
    document.getElementById('scheduleEstimatedHours').value = '';
}

/**
 * 工程オプションを更新
 */
export function updateScheduleProcessOptions() {
    const version = document.getElementById('scheduleVersion')?.value;
    const task = document.getElementById('scheduleTask')?.value;
    const processSelect = document.getElementById('scheduleProcess');
    if (!processSelect) return;
    
    const processes = [...new Set(
        estimates.filter(e => e.version === version && e.task === task).map(e => e.process)
    )];
    
    processSelect.innerHTML = '<option value="">選択してください</option>';
    processes.forEach(p => {
        processSelect.innerHTML += `<option value="${p}">${p}</option>`;
    });
    
    // 下位のセレクトをリセット
    document.getElementById('scheduleMember').innerHTML = '<option value="">選択してください</option>';
    document.getElementById('scheduleEstimatedHours').value = '';
}

/**
 * 担当者オプションを更新
 */
export function updateScheduleMemberOptions() {
    const version = document.getElementById('scheduleVersion')?.value;
    const task = document.getElementById('scheduleTask')?.value;
    const process = document.getElementById('scheduleProcess')?.value;
    const memberSelect = document.getElementById('scheduleMember');
    if (!memberSelect) return;
    
    const members = [...new Set(
        estimates.filter(e => 
            e.version === version && e.task === task && e.process === process
        ).map(e => e.member)
    )];
    
    memberSelect.innerHTML = '<option value="">選択してください</option>';
    members.forEach(m => {
        memberSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });
    
    document.getElementById('scheduleEstimatedHours').value = '';
}

/**
 * 見積工数を自動入力
 */
export function populateScheduleEstimateHours() {
    const version = document.getElementById('scheduleVersion')?.value;
    const task = document.getElementById('scheduleTask')?.value;
    const process = document.getElementById('scheduleProcess')?.value;
    const member = document.getElementById('scheduleMember')?.value;
    
    const estimate = estimates.find(e =>
        e.version === version && e.task === task && 
        e.process === process && e.member === member
    );
    
    const hoursInput = document.getElementById('scheduleEstimatedHours');
    if (hoursInput && estimate) {
        hoursInput.value = estimate.hours;
        recalculateScheduleEndDate();
    }
}

/**
 * 終了日を再計算
 */
export function recalculateScheduleEndDate() {
    const startDate = document.getElementById('scheduleStartDate')?.value;
    const hours = parseFloat(document.getElementById('scheduleEstimatedHours')?.value) || 0;
    const member = document.getElementById('scheduleMember')?.value;
    
    if (!startDate || hours <= 0) {
        document.getElementById('scheduleEndDate').value = '';
        document.getElementById('scheduleWorkingDays').textContent = '';
        return;
    }
    
    const endDate = calculateEndDate(startDate, hours, member);
    document.getElementById('scheduleEndDate').value = endDate;
    
    const days = Math.ceil(hours / (scheduleSettings.hoursPerDay || 8));
    document.getElementById('scheduleWorkingDays').textContent = `（${days}営業日）`;
}

/**
 * スケジュールの見込み残存時間を保存
 */
export function saveScheduleRemainingHours() {
    if (!currentEditingScheduleId) return;
    
    const schedule = schedules.find(s => s.id === currentEditingScheduleId);
    if (!schedule) return;
    
    const input = document.getElementById('detailUserRemainingHours');
    const value = parseFloat(input?.value);
    
    if (isNaN(value) || value < 0) {
        showToast('有効な数値を入力してください', 'warning');
        return;
    }
    
    // 見込み残存時間を保存
    saveRemainingEstimate(
        schedule.version,
        schedule.task,
        schedule.process,
        schedule.member,
        value
    );
    
    // データ保存
    if (typeof window.saveData === 'function') {
        window.saveData();
    }
    
    // 進捗を再計算して表示更新
    const progress = calculateProgress(schedule);
    
    const progressBar = document.getElementById('detailProgressBar');
    const progressRate = document.getElementById('detailProgressRate');
    if (progressBar) progressBar.style.width = `${progress.progressRate}%`;
    if (progressRate) progressRate.textContent = `${progress.progressRate.toFixed(0)}%`;
    
    const remainingText2 = `${formatHours(progress.remainingHours)}h ★`;
    document.getElementById('detailRemainingHours').textContent = remainingText2;
    
    // ガントチャートを再描画
    renderScheduleView();
    
    showToast('見込み残存時間を更新しました', 'success');
}

/**
 * 詳細モーダルで終了日を再計算
 */
export function recalculateScheduleEndDateDetail() {
    if (!currentEditingScheduleId) return;
    
    const schedule = schedules.find(s => s.id === currentEditingScheduleId);
    if (!schedule) return;
    
    const startDate = document.getElementById('detailStartDate')?.value;
    if (!startDate) return;
    
    // プレビューとして計算（保存はまだしない）
    const endDate = calculateEndDate(startDate, schedule.estimatedHours, schedule.member);
    document.getElementById('detailPlanPeriod').textContent = `${startDate} 〜 ${endDate}`;
}

// ============================================
// 自動スケジュール生成
// ============================================

/**
 * 見積からスケジュールを自動生成
 * @param {object} options - 生成オプション
 * @param {string} options.version - 対象版数
 * @param {string} options.startDate - 開始日
 * @param {string} options.mode - 生成モード ('member' | 'task' | 'all')
 * @param {string} options.member - 対象担当者（mode='member'の場合）
 * @param {string} options.task - 対象タスク（mode='task'の場合）
 * @returns {Array} - 生成されたスケジュール
 */
export function generateSchedulesFromEstimates(options) {
    const { version, startDate, mode = 'all', member, task } = options;
    
    // 対象の見積をフィルタ
    let targetEstimates = estimates.filter(e => e.version === version);
    
    if (mode === 'member' && member) {
        targetEstimates = targetEstimates.filter(e => e.member === member);
    } else if (mode === 'task' && task) {
        targetEstimates = targetEstimates.filter(e => e.task === task);
    }
    
    if (targetEstimates.length === 0) {
        return [];
    }
    
    // 担当者ごとにグループ化して順次割り当て
    const memberEstimates = new Map();
    targetEstimates.forEach(est => {
        if (!memberEstimates.has(est.member)) {
            memberEstimates.set(est.member, []);
        }
        memberEstimates.get(est.member).push(est);
    });
    
    const generatedSchedules = [];
    
    memberEstimates.forEach((estList, memberName) => {
        // 工程順でソート（UI → PG → PT → IT → ST）
        const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
        estList.sort((a, b) => {
            const orderA = processOrder.indexOf(a.process);
            const orderB = processOrder.indexOf(b.process);
            if (orderA !== orderB) return orderA - orderB;
            // 同じ工程ならタスク名でソート
            return a.task.localeCompare(b.task);
        });
        
        let currentDate = startDate;
        
        estList.forEach(est => {
            // 既存スケジュールがあるかチェック
            const existingSchedule = schedules.find(s =>
                s.version === est.version &&
                s.task === est.task &&
                s.process === est.process &&
                s.member === est.member
            );
            
            if (existingSchedule) {
                // 既存がある場合はスキップ（または更新オプションを追加可能）
                return;
            }
            
            // 終了日を計算
            const endDate = calculateEndDate(currentDate, est.hours, memberName);
            
            // スケジュールを作成（バッチ用、レンダリングなし）
            const schedule = addScheduleSilent({
                version: est.version,
                task: est.task,
                process: est.process,
                member: memberName,
                estimatedHours: est.hours,
                startDate: currentDate,
                endDate: endDate,
                note: `見積ID: ${est.id} から自動生成`
            });

            generatedSchedules.push(schedule);

            // 次のスケジュールの開始日を更新（終了日の翌営業日）
            const nextDate = new Date(endDate);
            nextDate.setDate(nextDate.getDate() + 1);
            while (!isBusinessDay(nextDate, memberName)) {
                nextDate.setDate(nextDate.getDate() + 1);
            }
            currentDate = formatDateForCheck(nextDate);
        });
    });

    // バッチ完了後に1回だけ保存＆描画
    if (generatedSchedules.length > 0) {
        if (typeof window.saveData === 'function') window.saveData();
        renderScheduleView();
    }

    return generatedSchedules;
}

/**
 * 自動生成モーダルを開く
 */
export function openAutoGenerateModal() {
    // 版数オプションを更新
    updateAutoGenerateVersionOptions();
    
    // デフォルト開始日を今日に設定
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('autoGenStartDate');
    if (startDateInput) startDateInput.value = today;
    
    // モードをリセット
    const modeSelect = document.getElementById('autoGenMode');
    if (modeSelect) modeSelect.value = 'all';
    updateAutoGenerateTargetOptions();
    
    // モーダルを表示
    const modal = document.getElementById('autoGenerateModal');
    if (modal) modal.style.display = 'flex';
}

/**
 * 自動生成モーダルを閉じる
 */
export function closeAutoGenerateModal() {
    const modal = document.getElementById('autoGenerateModal');
    if (modal) modal.style.display = 'none';
}

/**
 * 自動生成の版数オプションを更新
 */
export function updateAutoGenerateVersionOptions() {
    const select = document.getElementById('autoGenVersion');
    if (!select) return;
    
    const versions = [...new Set(estimates.map(e => e.version))].sort();
    
    select.innerHTML = '<option value="">選択してください</option>';
    versions.forEach(v => {
        select.innerHTML += `<option value="${v}">${v}</option>`;
    });
}

/**
 * 自動生成のターゲットオプションを更新
 */
export function updateAutoGenerateTargetOptions() {
    const mode = document.getElementById('autoGenMode')?.value;
    const version = document.getElementById('autoGenVersion')?.value;
    const targetContainer = document.getElementById('autoGenTargetContainer');
    const targetSelect = document.getElementById('autoGenTarget');
    
    if (!targetContainer || !targetSelect) return;
    
    if (mode === 'all' || !version) {
        targetContainer.style.display = 'none';
        return;
    }
    
    targetContainer.style.display = 'block';
    
    let options = [];
    if (mode === 'member') {
        options = [...new Set(
            estimates.filter(e => e.version === version).map(e => e.member)
        )].sort();
        targetSelect.previousElementSibling.textContent = '対象担当者';
    } else if (mode === 'task') {
        options = [...new Set(
            estimates.filter(e => e.version === version).map(e => e.task)
        )].sort();
        targetSelect.previousElementSibling.textContent = '対象タスク';
    }
    
    targetSelect.innerHTML = '<option value="">選択してください</option>';
    options.forEach(opt => {
        targetSelect.innerHTML += `<option value="${opt}">${opt}</option>`;
    });
}

/**
 * 自動生成プレビューを更新
 */
export function updateAutoGeneratePreview() {
    const version = document.getElementById('autoGenVersion')?.value;
    const startDate = document.getElementById('autoGenStartDate')?.value;
    const mode = document.getElementById('autoGenMode')?.value;
    const target = document.getElementById('autoGenTarget')?.value;
    
    const previewContainer = document.getElementById('autoGenPreview');
    if (!previewContainer) return;
    
    if (!version || !startDate) {
        previewContainer.innerHTML = '<p class="text-muted">版数と開始日を選択してください</p>';
        return;
    }
    
    // 対象の見積を取得
    let targetEstimates = estimates.filter(e => e.version === version);
    
    if (mode === 'member' && target) {
        targetEstimates = targetEstimates.filter(e => e.member === target);
    } else if (mode === 'task' && target) {
        targetEstimates = targetEstimates.filter(e => e.task === target);
    }
    
    // 既存スケジュールを除外
    const newEstimates = targetEstimates.filter(est => {
        return !schedules.some(s =>
            s.version === est.version &&
            s.task === est.task &&
            s.process === est.process &&
            s.member === est.member
        );
    });
    
    const totalHours = newEstimates.reduce((sum, e) => sum + e.hours, 0);
    const existingCount = targetEstimates.length - newEstimates.length;
    
    previewContainer.innerHTML = `
        <div class="preview-stats">
            <p><strong>生成対象:</strong> ${newEstimates.length}件</p>
            <p><strong>合計工数:</strong> ${formatHours(totalHours)}h</p>
            ${existingCount > 0 ? `<p class="text-warning">※ ${existingCount}件は既にスケジュールが存在するためスキップされます</p>` : ''}
        </div>
        <div class="preview-list">
            ${newEstimates.slice(0, 10).map(e => `
                <div class="preview-item">
                    <span class="preview-task">${e.task}</span>
                    <span class="preview-process">${e.process}</span>
                    <span class="preview-member">${e.member}</span>
                    <span class="preview-hours">${e.hours}h</span>
                </div>
            `).join('')}
            ${newEstimates.length > 10 ? `<p class="text-muted">...他${newEstimates.length - 10}件</p>` : ''}
        </div>
    `;
}

/**
 * スケジュールのステータスを更新
 * @param {string} status - 新しいステータス ('pending' | 'in_progress' | 'completed')
 */
export function setScheduleStatus(status) {
    if (!currentEditingScheduleId) return;

    const schedule = schedules.find(s => s.id === currentEditingScheduleId);
    if (schedule) {
        pushUndoAction({
            type: 'status_change',
            scheduleId: currentEditingScheduleId,
            oldStatus: schedule.status || 'pending',
            newStatus: status
        });
    }

    updateSchedule(currentEditingScheduleId, { status });

    // ステータスボタンのアクティブ状態を更新
    updateStatusButtons(status);

    // 進捗表示を更新（上で取得した schedule を再利用）
    if (schedule) {
        const progress = calculateProgress(schedule);
        const progressRate = document.getElementById('detailProgressRate');
        if (progressRate) {
            progressRate.textContent = status === 'completed' ? '100%' : `${progress.progressRate.toFixed(0)}%`;
        }
    }
}

/**
 * ステータスボタンのアクティブ状態を更新
 */
function updateStatusButtons(activeStatus) {
    const buttons = document.querySelectorAll('#detailStatusButtons .status-btn');
    buttons.forEach(btn => {
        const btnStatus = btn.getAttribute('data-status');
        btn.classList.toggle('active', btnStatus === activeStatus);
    });
}

// ============================================
// Undo/Redo スタック
// ============================================

const undoStack = [];
const redoStack = [];
const MAX_UNDO_HISTORY = 50;

/**
 * Undo/Redo用に操作を記録
 */
function pushUndoAction(action) {
    undoStack.push(action);
    if (undoStack.length > MAX_UNDO_HISTORY) {
        undoStack.shift();
    }
    // 新しい操作が入ったらRedoスタックをクリア
    redoStack.length = 0;
}

/**
 * Undo: 直前の操作を元に戻す
 */
export function undoScheduleAction() {
    if (undoStack.length === 0) {
        showToast('元に戻す操作がありません', 'info');
        return;
    }

    const action = undoStack.pop();
    redoStack.push(action);

    switch (action.type) {
        case 'move':
            updateSchedule(action.scheduleId, {
                startDate: action.oldStartDate,
                endDate: action.oldEndDate
            });
            showToast('移動を元に戻しました', 'info');
            break;

        case 'create':
            deleteSchedule(action.schedule.id);
            showToast('作成を元に戻しました', 'info');
            break;

        case 'batch_create': {
            const idsToRemove = new Set(action.schedules.map(s => s.id));
            setSchedules(schedules.filter(s => !idsToRemove.has(s.id)));
            if (typeof window.saveData === 'function') window.saveData();
            renderScheduleView();
            showToast(`${action.schedules.length}件の作成を元に戻しました`, 'info');
            break;
        }

        case 'delete':
            setSchedules([...schedules, action.schedule]);
            if (typeof window.saveData === 'function') window.saveData();
            renderScheduleView();
            showToast('削除を元に戻しました', 'info');
            break;

        case 'batch_delete':
            setSchedules([...schedules, ...action.schedules]);
            if (typeof window.saveData === 'function') window.saveData();
            renderScheduleView();
            showToast(`${action.schedules.length}件の削除を元に戻しました`, 'info');
            break;

        case 'status_change':
            updateSchedule(action.scheduleId, { status: action.oldStatus });
            showToast('ステータス変更を元に戻しました', 'info');
            break;

        case 'update':
            updateSchedule(action.scheduleId, action.oldValues);
            showToast('変更を元に戻しました', 'info');
            break;

        default:
            // 後方互換: type なしの旧エントリ（ドラッグ）
            updateSchedule(action.scheduleId, {
                startDate: action.oldStartDate,
                endDate: action.oldEndDate
            });
            showToast('元に戻しました', 'info');
            break;
    }
}

/**
 * Redo: 元に戻した操作をやり直す
 */
export function redoScheduleAction() {
    if (redoStack.length === 0) {
        showToast('やり直す操作がありません', 'info');
        return;
    }

    const action = redoStack.pop();
    undoStack.push(action);

    switch (action.type) {
        case 'move':
            updateSchedule(action.scheduleId, {
                startDate: action.newStartDate,
                endDate: action.newEndDate
            });
            showToast('移動をやり直しました', 'info');
            break;

        case 'create':
            setSchedules([...schedules, action.schedule]);
            if (typeof window.saveData === 'function') window.saveData();
            renderScheduleView();
            showToast('作成をやり直しました', 'info');
            break;

        case 'batch_create':
            setSchedules([...schedules, ...action.schedules]);
            if (typeof window.saveData === 'function') window.saveData();
            renderScheduleView();
            showToast(`${action.schedules.length}件の作成をやり直しました`, 'info');
            break;

        case 'delete':
            setSchedules(schedules.filter(s => s.id !== action.schedule.id));
            if (typeof window.saveData === 'function') window.saveData();
            renderScheduleView();
            showToast('削除をやり直しました', 'info');
            break;

        case 'batch_delete': {
            const idsToRemove = new Set(action.schedules.map(s => s.id));
            setSchedules(schedules.filter(s => !idsToRemove.has(s.id)));
            if (typeof window.saveData === 'function') window.saveData();
            renderScheduleView();
            showToast(`${action.schedules.length}件の削除をやり直しました`, 'info');
            break;
        }

        case 'status_change':
            updateSchedule(action.scheduleId, { status: action.newStatus });
            showToast('ステータス変更をやり直しました', 'info');
            break;

        case 'update':
            updateSchedule(action.scheduleId, action.newValues);
            showToast('変更をやり直しました', 'info');
            break;

        default:
            updateSchedule(action.scheduleId, {
                startDate: action.newStartDate,
                endDate: action.newEndDate
            });
            showToast('やり直しました', 'info');
            break;
    }
}

/**
 * ドラッグによるスケジュール移動を処理
 * @param {string} scheduleId - スケジュールID
 * @param {string} newStartDate - 新しい開始日（YYYY-MM-DD）
 */
export function handleScheduleDrag(scheduleId, newStartDate) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    // 移動前の状態を保存
    const oldStartDate = schedule.startDate;
    const oldEndDate = schedule.endDate;

    // 新しい終了日を計算
    const newEndDate = calculateEndDate(newStartDate, schedule.estimatedHours, schedule.member);

    // Undo用に記録
    pushUndoAction({
        type: 'move',
        scheduleId,
        oldStartDate,
        oldEndDate,
        newStartDate,
        newEndDate
    });

    // スケジュールを更新
    updateSchedule(scheduleId, {
        startDate: newStartDate,
        endDate: newEndDate
    });
}

/**
 * 自動生成を実行
 */
export function executeAutoGenerate() {
    const version = document.getElementById('autoGenVersion')?.value;
    const startDate = document.getElementById('autoGenStartDate')?.value;
    const mode = document.getElementById('autoGenMode')?.value;
    const target = document.getElementById('autoGenTarget')?.value;
    
    if (!version || !startDate) {
        showToast('版数と開始日を選択してください', 'warning');
        return;
    }
    
    const options = {
        version,
        startDate,
        mode,
        member: mode === 'member' ? target : null,
        task: mode === 'task' ? target : null
    };
    
    const generated = generateSchedulesFromEstimates(options);

    closeAutoGenerateModal();

    if (generated.length > 0) {
        pushUndoAction({
            type: 'batch_create',
            schedules: generated.map(s => ({ ...s }))
        });

        highlightNewSchedules(generated.map(s => s.id));

        showToast(`${generated.length}件のスケジュールを生成しました（Ctrl+Zで元に戻す）`, 'success');
    } else {
        showToast('生成対象のスケジュールがありませんでした', 'info');
    }
}

// ============================================
// フィルタリング
// ============================================

/**
 * フィルタを適用してスケジュールを絞り込み
 * @returns {Array} フィルタされたスケジュール
 */
export function getFilteredSchedules() {
    const { filterVersion, filterMember, filterStatus } = scheduleSettings;
    
    return schedules.filter(schedule => {
        // 版数フィルタ
        if (filterVersion && schedule.version !== filterVersion) {
            return false;
        }
        
        // 担当者フィルタ
        if (filterMember && schedule.member !== filterMember) {
            return false;
        }
        
        // ステータスフィルタ
        if (filterStatus && schedule.status !== filterStatus) {
            return false;
        }
        
        return true;
    });
}

/**
 * フィルタを適用
 */
export function applyScheduleFilters() {
    const version = document.getElementById('scheduleFilterVersion')?.value || '';
    const member = document.getElementById('scheduleFilterMember')?.value || '';
    const status = document.getElementById('scheduleFilterStatus')?.value || '';
    
    setScheduleSettings({
        filterVersion: version,
        filterMember: member,
        filterStatus: status
    });
    
    renderScheduleView();
    updateFilterResultCount();
}

/**
 * フィルタ結果の件数を更新
 */
export function updateFilterResultCount() {
    const countElement = document.getElementById('scheduleFilterCount');
    if (!countElement) return;
    
    const filtered = getFilteredSchedules();
    const total = schedules.length;
    
    const hasFilters = scheduleSettings.filterVersion || scheduleSettings.filterMember || scheduleSettings.filterStatus;
    
    if (hasFilters) {
        countElement.innerHTML = `<strong>${filtered.length}</strong> / ${total}件`;
    } else {
        countElement.innerHTML = total > 0 ? `${total}件` : '';
    }
}

/**
 * フィルタをクリア
 */
export function clearScheduleFilters() {
    setScheduleSettings({
        filterVersion: '',
        filterMember: '',
        filterStatus: ''
    });
    
    // UI更新
    const versionSelect = document.getElementById('scheduleFilterVersion');
    const memberSelect = document.getElementById('scheduleFilterMember');
    const statusSelect = document.getElementById('scheduleFilterStatus');
    
    if (versionSelect) versionSelect.value = '';
    if (memberSelect) memberSelect.value = '';
    if (statusSelect) statusSelect.value = '';
    
    renderScheduleView();
}

/**
 * フィルタされたスケジュールを一括削除
 */
export function deleteFilteredSchedules() {
    const filteredSchedules = getFilteredSchedules();
    
    if (filteredSchedules.length === 0) {
        showToast('削除するスケジュールがありません', 'info');
        return;
    }
    
    const hasFilters = scheduleSettings.filterVersion || scheduleSettings.filterMember || scheduleSettings.filterStatus;
    const message = hasFilters
        ? `フィルタに一致する${filteredSchedules.length}件のスケジュールを削除しますか？`
        : `すべてのスケジュール（${filteredSchedules.length}件）を削除しますか？`;
    
    if (!confirm(message)) {
        return;
    }
    
    // Undo用にコピーを保存
    pushUndoAction({
        type: 'batch_delete',
        schedules: filteredSchedules.map(s => ({ ...s }))
    });

    // 削除するIDのセット
    const idsToDelete = new Set(filteredSchedules.map(s => s.id));

    // 削除を実行
    setSchedules(schedules.filter(s => !idsToDelete.has(s.id)));

    if (typeof window.saveData === 'function') {
        window.saveData();
    }

    renderScheduleView();
    showToast(`${filteredSchedules.length}件のスケジュールを削除しました（Ctrl+Zで元に戻す）`, 'success');
}

/**
 * スケジュールをExcelに出力
 */
export async function exportSchedulesToExcel() {
    if (typeof ExcelJS === 'undefined') {
        showToast('ExcelJSライブラリが読み込まれていません', 'error');
        return;
    }
    
    const filteredSchedules = getFilteredSchedules();
    
    if (filteredSchedules.length === 0) {
        showToast('出力するスケジュールがありません', 'info');
        return;
    }
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('スケジュール');
    
    // ヘッダー
    worksheet.columns = [
        { header: '版数', key: 'version', width: 10 },
        { header: 'タスク', key: 'task', width: 20 },
        { header: '工程', key: 'process', width: 10 },
        { header: '担当者', key: 'member', width: 12 },
        { header: '着手日', key: 'startDate', width: 12 },
        { header: '終了日', key: 'endDate', width: 12 },
        { header: '見積(h)', key: 'estimatedHours', width: 10 },
        { header: '実績(h)', key: 'actualHours', width: 10 },
        { header: '残(h)', key: 'remainingHours', width: 10 },
        { header: '進捗率', key: 'progressRate', width: 10 },
        { header: 'ステータス', key: 'status', width: 12 }
    ];
    
    // ヘッダースタイル
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
    };
    
    // データ行
    filteredSchedules.forEach(schedule => {
        const progress = calculateProgress(schedule);
        const statusLabels = {
            'pending': '未着手',
            'in_progress': '進行中',
            'completed': '完了'
        };
        
        worksheet.addRow({
            version: schedule.version,
            task: schedule.task,
            process: schedule.process,
            member: schedule.member,
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            estimatedHours: schedule.estimatedHours,
            actualHours: progress.actualHours,
            remainingHours: progress.remainingHours,
            progressRate: `${progress.progressRate.toFixed(0)}%`,
            status: statusLabels[schedule.status] || '未着手'
        });
    });
    
    // ファイル保存
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const today = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `スケジュール_${today}.xlsx`;
    a.click();
    
    URL.revokeObjectURL(url);
}


// ============================================
// トースト通知
// ============================================

let toastContainer = null;

/**
 * トーストコンテナを作成
 */
function createToastContainer() {
    if (toastContainer) return toastContainer;
    
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
    
    return toastContainer;
}

/**
 * トースト通知を表示
 * @param {string} message - メッセージ
 * @param {string} type - 'success' | 'error' | 'info' | 'warning'
 * @param {number} duration - 表示時間（ms）
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = createToastContainer();
    
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
        warning: '⚠'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // 自動で消す
    setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);
    
    return toast;
}

// ============================================
// キーボードショートカット
// ============================================

/**
 * キーボードショートカットをセットアップ
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // スケジュールタブがアクティブでない場合は無視
        const scheduleTab = document.getElementById('schedule');
        if (!scheduleTab || scheduleTab.style.display === 'none' || !scheduleTab.classList.contains('active')) {
            // タブのアクティブ状態を別の方法でチェック
            const activeTab = document.querySelector('.tab-content.active, .tab-content[style*="block"]');
            if (!activeTab || activeTab.id !== 'schedule') {
                return;
            }
        }
        
        // 入力フィールドにフォーカスがある場合は無視
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
            return;
        }
        
        // Ctrl+Z / Ctrl+Y: Undo/Redo（モーダル状態に関わらず動作）
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            undoScheduleAction();
            return;
        }
        if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            redoScheduleAction();
            return;
        }

        // モーダルが開いている場合はEsc以外を無視
        const openModal = document.querySelector('.modal[style*="flex"]');
        if (openModal && event.key !== 'Escape') {
            return;
        }

        switch (event.key) {
            case 'n':
            case 'N':
                // N: 新規作成
                if (!event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    openCreateScheduleModal();
                }
                break;
                
            case 'ArrowLeft':
                // ←: 前月
                if (!event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    navigateScheduleMonth(-1);
                }
                break;
                
            case 'ArrowRight':
                // →: 次月
                if (!event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    navigateScheduleMonth(1);
                }
                break;
                
            case 't':
            case 'T':
                // T: 今日へ移動
                if (!event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    goToScheduleToday();
                }
                break;
                
            case 'm':
            case 'M':
                // M: 担当者別表示
                if (!event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    setScheduleViewMode('member');
                }
                break;
                
            case 'k':
            case 'K':
                // K: タスク別表示
                if (!event.ctrlKey && !event.metaKey) {
                    event.preventDefault();
                    setScheduleViewMode('task');
                }
                break;
                
            case 'Escape':
                // Esc: モーダルを閉じる
                if (openModal) {
                    event.preventDefault();
                    if (openModal.id === 'createScheduleModal') {
                        closeCreateScheduleModal();
                    } else if (openModal.id === 'scheduleDetailModal') {
                        closeScheduleDetailModal();
                    } else if (openModal.id === 'autoGenerateModal') {
                        closeAutoGenerateModal();
                    }
                }
                break;
        }
    });
}

/**
 * フィルタオプションを更新
 */
export function updateScheduleFilterOptions() {
    // 版数オプション
    const versionSelect = document.getElementById('scheduleFilterVersion');
    if (versionSelect) {
        const versions = [...new Set(schedules.map(s => s.version))].sort();
        const currentValue = versionSelect.value;
        
        versionSelect.innerHTML = '<option value="">すべて</option>';
        versions.forEach(v => {
            versionSelect.innerHTML += `<option value="${v}"${v === currentValue ? ' selected' : ''}>${v}</option>`;
        });
    }
    
    // 担当者オプション
    const memberSelect = document.getElementById('scheduleFilterMember');
    if (memberSelect) {
        const members = [...new Set(schedules.map(s => s.member))].sort();
        const currentValue = memberSelect.value;
        
        memberSelect.innerHTML = '<option value="">すべて</option>';
        members.forEach(m => {
            memberSelect.innerHTML += `<option value="${m}"${m === currentValue ? ' selected' : ''}>${m}</option>`;
        });
    }
}

// ============================================
// 未スケジュールバッジ
// ============================================

/**
 * 現在の表示月に対応する未スケジュール見積を取得
 * @returns {Array} 未スケジュールの見積一覧
 */
function getUnscheduledEstimates() {
    const currentMonth = scheduleSettings.currentMonth; // e.g. "2026-02"
    if (!currentMonth) return [];

    return estimates.filter(est => {
        // 作業月がガントチャートの表示月を含むか
        if (!est.workMonths || !est.workMonths.includes(currentMonth)) return false;
        // スケジュール未作成か
        return !schedules.some(s =>
            s.version === est.version &&
            s.task === est.task &&
            s.process === est.process &&
            s.member === est.member
        );
    });
}

/**
 * 未スケジュールの見積件数をバッジで表示
 * ガントチャート表示月の見積で、スケジュール未作成の件数を「⚡ 自動生成」ボタンに表示
 */
export function updateUnscheduledBadge() {
    const badge = document.getElementById('unscheduledBadge');
    if (!badge) return;

    const unscheduled = getUnscheduledEstimates();

    if (unscheduled.length > 0) {
        badge.textContent = unscheduled.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
        // バッジが消えたらドロップダウンも閉じる
        const dropdown = document.getElementById('unscheduledDropdown');
        if (dropdown) dropdown.style.display = 'none';
    }
}

/**
 * 未スケジュール一覧ドロップダウンの表示/非表示を切替
 */
export function toggleUnscheduledDropdown() {
    const dropdown = document.getElementById('unscheduledDropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
    }

    const unscheduled = getUnscheduledEstimates();
    if (unscheduled.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    const currentMonth = scheduleSettings.currentMonth;
    const [y, m] = currentMonth.split('-');
    const monthLabel = `${y}年${parseInt(m)}月`;

    // 版数＋対応名でグループ化
    const groups = new Map();
    unscheduled.forEach(est => {
        const key = `${est.version}/${est.task}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(est);
    });

    const today = new Date().toISOString().split('T')[0];

    let html = `<div class="unscheduled-dropdown-header">
        <label class="unscheduled-select-all">
            <input type="checkbox" id="unscheduledSelectAll" checked onchange="toggleUnscheduledSelectAll(this.checked)">
            <span>${monthLabel} 未スケジュール（${unscheduled.length}件）</span>
        </label>
    </div>`;

    html += '<ul class="unscheduled-dropdown-list">';

    let groupIndex = 0;
    groups.forEach((items, key) => {
        const [version, task] = key.split('/');
        const details = items.map(e => `${e.process}(${e.member})`).join(', ');
        const groupId = `unscheduled-group-${groupIndex}`;
        html += `<li class="unscheduled-dropdown-item">
            <label class="unscheduled-item-label">
                <input type="checkbox" class="unscheduled-group-check" id="${groupId}"
                       data-version="${version}" data-task="${task}" checked
                       onchange="updateUnscheduledCount()">
                <div class="unscheduled-item-text">
                    <span class="unscheduled-task-name" title="${version} / ${task}">${task}</span>
                    <span class="unscheduled-task-detail">${details}</span>
                </div>
            </label>
        </li>`;
        groupIndex++;
    });

    html += '</ul>';

    html += `<div class="unscheduled-dropdown-footer">
        <div class="unscheduled-date-row">
            <label for="unscheduledStartDate">開始日</label>
            <input type="date" id="unscheduledStartDate" value="${today}" class="unscheduled-date-input">
        </div>
        <button class="btn btn-primary unscheduled-dropdown-action"
                id="unscheduledRegisterBtn"
                onclick="registerCheckedSchedules()">
            選択した <span id="unscheduledCheckedCount">${groups.size}</span>件を登録
        </button>
    </div>`;

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    // 左はみ出し防止
    fixDropdownOverflow(dropdown);

    // 外側クリックで閉じる
    const closeHandler = (e) => {
        if (!dropdown.contains(e.target) && !document.getElementById('unscheduledBadge').contains(e.target)) {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

/**
 * ドロップダウン内の全チェックボックスの選択/解除を切り替え
 */
export function toggleUnscheduledSelectAll(checked) {
    const checkboxes = document.querySelectorAll('.unscheduled-group-check');
    checkboxes.forEach(cb => { cb.checked = checked; });
    updateUnscheduledCount();
}

/**
 * チェック済み件数を更新して「登録」ボタンのラベルに反映
 */
export function updateUnscheduledCount() {
    const checkboxes = document.querySelectorAll('.unscheduled-group-check');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const countSpan = document.getElementById('unscheduledCheckedCount');
    if (countSpan) countSpan.textContent = checkedCount;

    const registerBtn = document.getElementById('unscheduledRegisterBtn');
    if (registerBtn) registerBtn.disabled = checkedCount === 0;

    // 全選択チェックボックスの状態を更新
    const selectAll = document.getElementById('unscheduledSelectAll');
    if (selectAll) {
        selectAll.checked = checkedCount === checkboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }
}

/**
 * ドロップダウンでチェックされた見積に対してスケジュールを一括作成
 */
export function registerCheckedSchedules() {
    const startDate = document.getElementById('unscheduledStartDate')?.value;
    if (!startDate) {
        showToast('開始日を入力してください', 'warning');
        return;
    }

    // チェック済みの版数/対応ペアを収集
    const checkboxes = document.querySelectorAll('.unscheduled-group-check:checked');
    if (checkboxes.length === 0) {
        showToast('登録する項目を選択してください', 'warning');
        return;
    }

    const checkedPairs = new Set();
    checkboxes.forEach(cb => {
        checkedPairs.add(`${cb.dataset.version}/${cb.dataset.task}`);
    });

    // マッチする未スケジュール見積を取得
    const unscheduled = getUnscheduledEstimates();
    const targetEstimates = unscheduled.filter(est =>
        checkedPairs.has(`${est.version}/${est.task}`)
    );

    if (targetEstimates.length === 0) {
        showToast('対象の見積がありません', 'info');
        return;
    }

    // 担当者ごとにグループ化して工程順で直列配置
    const memberEstimates = new Map();
    targetEstimates.forEach(est => {
        if (!memberEstimates.has(est.member)) {
            memberEstimates.set(est.member, []);
        }
        memberEstimates.get(est.member).push(est);
    });

    const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const generatedSchedules = [];

    memberEstimates.forEach((estList, memberName) => {
        estList.sort((a, b) => {
            const orderA = processOrder.indexOf(a.process);
            const orderB = processOrder.indexOf(b.process);
            if (orderA !== orderB) return orderA - orderB;
            return a.task.localeCompare(b.task);
        });

        let currentDate = startDate;

        estList.forEach(est => {
            // 既存スケジュールがないか再確認
            const existing = schedules.find(s =>
                s.version === est.version &&
                s.task === est.task &&
                s.process === est.process &&
                s.member === est.member
            );
            if (existing) return;

            const endDate = calculateEndDate(currentDate, est.hours, memberName);

            const schedule = addScheduleSilent({
                version: est.version,
                task: est.task,
                process: est.process,
                member: memberName,
                estimatedHours: est.hours,
                startDate: currentDate,
                endDate: endDate,
                note: `見積ID: ${est.id} から一括作成`
            });

            generatedSchedules.push(schedule);

            // 次のスケジュールの開始日を更新
            const nextDate = new Date(endDate);
            nextDate.setDate(nextDate.getDate() + 1);
            while (!isBusinessDay(nextDate, memberName)) {
                nextDate.setDate(nextDate.getDate() + 1);
            }
            currentDate = formatDateForCheck(nextDate);
        });
    });

    if (generatedSchedules.length > 0) {
        if (typeof window.saveData === 'function') window.saveData();
        renderScheduleView();

        pushUndoAction({
            type: 'batch_create',
            schedules: generatedSchedules.map(s => ({ ...s }))
        });

        highlightNewSchedules(generatedSchedules.map(s => s.id));

        showToast(`${generatedSchedules.length}件のスケジュールを作成しました（Ctrl+Zで元に戻す）`, 'success');
    } else {
        showToast('作成対象のスケジュールがありませんでした', 'info');
    }

    // ドロップダウンを閉じる
    const dropdown = document.getElementById('unscheduledDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

/**
 * ドロップダウンのはみ出しを修正
 */
function fixDropdownOverflow(dropdown) {
    requestAnimationFrame(() => {
        // モバイル時: 画面幅に合わせて固定配置
        if (window.innerWidth <= 768) {
            dropdown.style.position = 'fixed';
            dropdown.style.right = '8px';
            dropdown.style.left = '8px';
            dropdown.style.top = '';
            dropdown.style.maxWidth = 'none';
            dropdown.style.minWidth = '0';
            dropdown.style.width = 'auto';
            // ボタンの直下に表示
            const badge = document.getElementById('unscheduledBadge');
            if (badge) {
                const badgeRect = badge.getBoundingClientRect();
                dropdown.style.top = (badgeRect.bottom + 6) + 'px';
            }
            return;
        }

        // PC時: 左側はみ出しのみ修正
        dropdown.style.position = '';
        dropdown.style.maxWidth = '';
        dropdown.style.minWidth = '';
        dropdown.style.width = '';
        const rect = dropdown.getBoundingClientRect();
        if (rect.left < 0) {
            dropdown.style.right = 'auto';
            dropdown.style.left = '0';
        } else {
            dropdown.style.right = '0';
            dropdown.style.left = '';
        }
    });
}

/**
 * 新しく作成されたスケジュールを一時的にハイライトする
 * @param {Array<string>} scheduleIds - ハイライトするスケジュールID配列
 * @param {number} duration - ハイライト時間（ms）、デフォルト5000
 */
function highlightNewSchedules(scheduleIds, duration = 5000) {
    const renderer = getRenderer();
    if (!renderer) return;

    // 前回のタイマーをクリア
    if (renderer.newlyCreatedTimer) {
        clearTimeout(renderer.newlyCreatedTimer);
    }

    renderer.newlyCreatedIds = new Set(scheduleIds);

    // 再描画してハイライト表示
    if (renderer.currentYear && renderer.currentMonth) {
        renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
    }

    // 一定時間後にクリア
    renderer.newlyCreatedTimer = setTimeout(() => {
        renderer.newlyCreatedIds.clear();
        renderer.newlyCreatedTimer = null;
        if (renderer.currentYear && renderer.currentMonth) {
            renderer.render(renderer.currentYear, renderer.currentMonth, renderer.filteredSchedulesCache);
        }
    }, duration);
}
