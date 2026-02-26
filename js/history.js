// ============================================
// グローバル Undo/Redo & 変更履歴
// ============================================

import * as State from './state.js';
import * as Utils from './utils.js';

const MAX_HISTORY = 50;
const STORAGE_KEY_UNDO = 'manhour_undoHistory';
const STORAGE_KEY_REDO = 'manhour_redoHistory';

let undoStack = [];
let redoStack = [];

// ============================================
// スタック操作
// ============================================

/**
 * 操作をUndoスタックに記録
 */
export function pushAction(action) {
    const entry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        ...action
    };
    undoStack.push(entry);
    if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
    }
    redoStack.length = 0;
    saveHistory();
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

/**
 * 全履歴を返す（表示用）
 */
export function getHistory() {
    return {
        undo: [...undoStack].reverse(),
        redo: [...redoStack]
    };
}

// ============================================
// Undo
// ============================================

export function undo() {
    if (undoStack.length === 0) {
        Utils.showAlert('元に戻す操作がありません', true);
        return;
    }

    const action = undoStack.pop();
    redoStack.push(action);

    applyUndo(action);
    saveHistory();
    refreshUI(action);
    showScheduleToast(action, 'undo');
}

// ============================================
// Redo
// ============================================

export function redo() {
    if (redoStack.length === 0) {
        Utils.showAlert('やり直す操作がありません', true);
        return;
    }

    const action = redoStack.pop();
    undoStack.push(action);

    applyRedo(action);
    saveHistory();
    refreshUI(action);
    showScheduleToast(action, 'redo');
}

// ============================================
// 指定アクションまで連続Undo
// ============================================

export function revertToAction(targetId) {
    let found = false;
    for (let i = undoStack.length - 1; i >= 0; i--) {
        if (undoStack[i].id === targetId) {
            found = true;
            break;
        }
    }
    if (!found) return;

    while (undoStack.length > 0) {
        const top = undoStack[undoStack.length - 1];
        const action = undoStack.pop();
        redoStack.push(action);
        applyUndo(action);
        if (top.id === targetId) break;
    }
    saveHistory();
    fullRefreshUI();
}

// ============================================
// Undo/Redo の逆操作ロジック
// ============================================

function applyUndo(action) {
    const t = action.type;

    // --- 見積 ---
    if (t === 'estimate_add' || t === 'estimate_add_other') {
        const ids = new Set(action.data.added.map(e => e.id));
        State.estimates = State.estimates.filter(e => !ids.has(e.id));
    } else if (t === 'estimate_edit') {
        const idx = State.estimates.findIndex(e => e.id === action.data.before.id);
        if (idx !== -1) State.estimates[idx] = { ...action.data.before };
    } else if (t === 'estimate_delete') {
        State.estimates.push(...action.data.deleted);
        if (action.data.deletedRemaining) {
            State.remainingEstimates.push(...action.data.deletedRemaining);
        }
    } else if (t === 'task_delete') {
        State.estimates.push(...action.data.deleted);
        if (action.data.deletedRemaining) {
            State.remainingEstimates.push(...action.data.deletedRemaining);
        }
    } else if (t === 'estimate_bulk_edit') {
        // 一括編集: 変更前の状態に復元
        restoreBulkEdit(action.data, 'before');
    } else if (t === 'task_edit') {
        restoreBulkEdit(action.data, 'before');

    // --- 実績 ---
    } else if (t === 'actual_add') {
        const id = action.data.added.id;
        State.setActuals(State.actuals.filter(a => a.id !== id));
    } else if (t === 'actual_edit') {
        if (action.data.isNew) {
            // 新規追加だった場合: 削除
            State.setActuals(State.actuals.filter(a => a.id !== action.data.after.id));
        } else {
            const idx = State.actuals.findIndex(a => a.id === action.data.before.id);
            if (idx !== -1) State.actuals[idx] = { ...action.data.before };
        }
    } else if (t === 'actual_delete') {
        State.actuals.push(action.data.deleted);

    // --- 休暇 ---
    } else if (t === 'vacation_add') {
        State.setVacations(State.vacations.filter(v => v.id !== action.data.added.id));
    } else if (t === 'vacation_delete') {
        State.vacations.push(action.data.deleted);

    // --- 会社休日 ---
    } else if (t === 'holiday_add') {
        State.setCompanyHolidays(State.companyHolidays.filter(h => h.id !== action.data.added.id));
    } else if (t === 'holiday_delete') {
        State.companyHolidays.push(action.data.deleted);

    // --- スケジュール ---
    } else if (t.startsWith('schedule_')) {
        applyScheduleUndo(action);
    }

    if (typeof window.saveData === 'function') window.saveData();
}

function applyRedo(action) {
    const t = action.type;

    // --- 見積 ---
    if (t === 'estimate_add' || t === 'estimate_add_other') {
        State.estimates.push(...action.data.added);
    } else if (t === 'estimate_edit') {
        const idx = State.estimates.findIndex(e => e.id === action.data.after.id);
        if (idx !== -1) State.estimates[idx] = { ...action.data.after };
    } else if (t === 'estimate_delete') {
        const ids = new Set(action.data.deleted.map(e => e.id));
        State.estimates = State.estimates.filter(e => !ids.has(e.id));
        if (action.data.deletedRemaining) {
            const rIds = new Set(action.data.deletedRemaining.map(r => r.id));
            State.remainingEstimates = State.remainingEstimates.filter(r => !rIds.has(r.id));
        }
    } else if (t === 'task_delete') {
        const ids = new Set(action.data.deleted.map(e => e.id));
        State.estimates = State.estimates.filter(e => !ids.has(e.id));
        if (action.data.deletedRemaining) {
            const rIds = new Set(action.data.deletedRemaining.map(r => r.id));
            State.remainingEstimates = State.remainingEstimates.filter(r => !rIds.has(r.id));
        }
    } else if (t === 'estimate_bulk_edit') {
        restoreBulkEdit(action.data, 'after');
    } else if (t === 'task_edit') {
        restoreBulkEdit(action.data, 'after');

    // --- 実績 ---
    } else if (t === 'actual_add') {
        State.actuals.push(action.data.added);
    } else if (t === 'actual_edit') {
        if (action.data.isNew) {
            State.actuals.push(action.data.after);
        } else {
            const idx = State.actuals.findIndex(a => a.id === action.data.after.id);
            if (idx !== -1) State.actuals[idx] = { ...action.data.after };
        }
    } else if (t === 'actual_delete') {
        State.setActuals(State.actuals.filter(a => a.id !== action.data.deleted.id));

    // --- 休暇 ---
    } else if (t === 'vacation_add') {
        State.vacations.push(action.data.added);
    } else if (t === 'vacation_delete') {
        State.setVacations(State.vacations.filter(v => v.id !== action.data.deleted.id));

    // --- 会社休日 ---
    } else if (t === 'holiday_add') {
        State.companyHolidays.push(action.data.added);
    } else if (t === 'holiday_delete') {
        State.setCompanyHolidays(State.companyHolidays.filter(h => h.id !== action.data.deleted.id));

    // --- スケジュール ---
    } else if (t.startsWith('schedule_')) {
        applyScheduleRedo(action);
    }

    if (typeof window.saveData === 'function') window.saveData();
}

// ============================================
// 一括編集の復元ヘルパー
// ============================================

function restoreBulkEdit(data, direction) {
    // direction: 'before' (undo) or 'after' (redo)
    const estimates = direction === 'before' ? data.beforeEstimates : data.afterEstimates;
    if (estimates) {
        estimates.forEach(est => {
            const idx = State.estimates.findIndex(e => e.id === est.id);
            if (idx !== -1) {
                State.estimates[idx] = { ...est };
            } else {
                State.estimates.push({ ...est });
            }
        });
        // undo時に新規追加されたレコードを除去
        if (direction === 'before' && data.addedEstimateIds) {
            const addedIds = new Set(data.addedEstimateIds);
            State.estimates = State.estimates.filter(e => !addedIds.has(e.id));
        }
    }

    const actuals = direction === 'before' ? data.beforeActuals : data.afterActuals;
    if (actuals) {
        actuals.forEach(act => {
            const idx = State.actuals.findIndex(a => a.id === act.id);
            if (idx !== -1) {
                State.actuals[idx] = { ...act };
            }
        });
    }
}

// ============================================
// スケジュール Undo/Redo（schedule.js から移植）
// ============================================

function applyScheduleUndo(action) {
    const { schedules, setSchedules } = State;
    const subType = action.type.replace('schedule_', '');

    switch (subType) {
        case 'move':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, {
                    startDate: action.data.oldStartDate,
                    endDate: action.data.oldEndDate
                });
            }
            break;
        case 'create':
            if (typeof window.deleteScheduleFn === 'function') {
                window.deleteScheduleFn(action.data.schedule.id);
            }
            break;
        case 'batch_create': {
            const idsToRemove = new Set(action.data.schedules.map(s => s.id));
            setSchedules(schedules.filter(s => !idsToRemove.has(s.id)));
            break;
        }
        case 'delete':
            setSchedules([...schedules, action.data.schedule]);
            break;
        case 'batch_delete':
            setSchedules([...schedules, ...action.data.schedules]);
            break;
        case 'status_change':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, { status: action.data.oldStatus });
            }
            break;
        case 'detail_update':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, action.data.oldValues);
            }
            if (action.data.oldRemainingHours !== null && action.data.oldRemainingHours !== undefined) {
                if (typeof window.saveRemainingEstimateFn === 'function') {
                    const k = action.data.scheduleKey;
                    window.saveRemainingEstimateFn(k.version, k.task, k.process, k.member, action.data.oldRemainingHours);
                }
            } else if (action.data.scheduleKey) {
                if (typeof window.deleteRemainingEstimateFn === 'function') {
                    const k = action.data.scheduleKey;
                    window.deleteRemainingEstimateFn(k.version, k.task, k.process, k.member);
                }
            }
            break;
        case 'update':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, action.data.oldValues);
            }
            break;
    }

    if (typeof window.renderScheduleView === 'function') window.renderScheduleView();
}

function applyScheduleRedo(action) {
    const { schedules, setSchedules } = State;
    const subType = action.type.replace('schedule_', '');

    switch (subType) {
        case 'move':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, {
                    startDate: action.data.newStartDate,
                    endDate: action.data.newEndDate
                });
            }
            break;
        case 'create':
            setSchedules([...schedules, action.data.schedule]);
            break;
        case 'batch_create':
            setSchedules([...schedules, ...action.data.schedules]);
            break;
        case 'delete':
            setSchedules(schedules.filter(s => s.id !== action.data.schedule.id));
            break;
        case 'batch_delete': {
            const idsToRemove = new Set(action.data.schedules.map(s => s.id));
            setSchedules(schedules.filter(s => !idsToRemove.has(s.id)));
            break;
        }
        case 'status_change':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, { status: action.data.newStatus });
            }
            break;
        case 'detail_update':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, action.data.newValues);
            }
            if (action.data.newRemainingHours !== null && action.data.newRemainingHours !== undefined) {
                if (typeof window.saveRemainingEstimateFn === 'function') {
                    const k = action.data.scheduleKey;
                    window.saveRemainingEstimateFn(k.version, k.task, k.process, k.member, action.data.newRemainingHours);
                }
            } else if (action.data.scheduleKey) {
                if (typeof window.deleteRemainingEstimateFn === 'function') {
                    const k = action.data.scheduleKey;
                    window.deleteRemainingEstimateFn(k.version, k.task, k.process, k.member);
                }
            }
            break;
        case 'update':
            if (typeof window.updateScheduleFn === 'function') {
                window.updateScheduleFn(action.data.scheduleId, action.data.newValues);
            }
            break;
    }

    if (typeof window.renderScheduleView === 'function') window.renderScheduleView();
}

// ============================================
// UI更新
// ============================================

function refreshUI(action) {
    const t = action.type;
    if (t.startsWith('estimate') || t.startsWith('task')) {
        if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
        if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
        if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
        if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
        if (typeof window.updateReport === 'function') window.updateReport();
        if (typeof window.renderScheduleView === 'function') window.renderScheduleView();
    }
    if (t.startsWith('actual')) {
        if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
    }
    if (t === 'vacation_add' || t === 'vacation_delete') {
        // 休暇はupdateAllDisplays内のカレンダー描画で反映される
        if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
    }
    if (t === 'holiday_add' || t === 'holiday_delete') {
        if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();
        if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
    }
}

function fullRefreshUI() {
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
    if (typeof window.renderScheduleView === 'function') window.renderScheduleView();
    if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();
    if (typeof window.renderVacationList === 'function') window.renderVacationList();
}

/**
 * スケジュール操作時のみトーストを表示
 */
function showScheduleToast(action, mode) {
    if (!action.type.startsWith('schedule_')) return;
    if (typeof window.showScheduleToast !== 'function') return;

    const verb = mode === 'undo' ? '元に戻しました' : 'やり直しました';
    window.showScheduleToast(`${action.description || '操作'}を${verb}`, 'info');
}

// ============================================
// localStorage 永続化
// ============================================

export function saveHistory() {
    try {
        localStorage.setItem(STORAGE_KEY_UNDO, JSON.stringify(undoStack));
        localStorage.setItem(STORAGE_KEY_REDO, JSON.stringify(redoStack));
    } catch (e) {
        // localStorage容量超過時は古い履歴を削除
        while (undoStack.length > 10) undoStack.shift();
        redoStack.length = 0;
        try {
            localStorage.setItem(STORAGE_KEY_UNDO, JSON.stringify(undoStack));
            localStorage.setItem(STORAGE_KEY_REDO, JSON.stringify(redoStack));
        } catch (e2) {
            console.error('History save failed:', e2);
        }
    }
}

export function loadHistory() {
    try {
        const undoData = localStorage.getItem(STORAGE_KEY_UNDO);
        const redoData = localStorage.getItem(STORAGE_KEY_REDO);
        undoStack = undoData ? JSON.parse(undoData) : [];
        redoStack = redoData ? JSON.parse(redoData) : [];
    } catch (e) {
        console.error('History load failed:', e);
        undoStack = [];
        redoStack = [];
    }
}

// ============================================
// キーボードショートカット
// ============================================

export function setupGlobalKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // 入力フィールドにフォーカスがある場合はブラウザ標準動作を優先
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
            return;
        }

        // Ctrl+Z / Cmd+Z → Undo
        if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
            event.preventDefault();
            undo();
            return;
        }

        // Ctrl+Y / Cmd+Shift+Z → Redo
        if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
            event.preventDefault();
            redo();
            return;
        }

        // Ctrl+Shift+H → 変更履歴モーダル
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'H') {
            event.preventDefault();
            openHistoryModal();
            return;
        }
    });
}

// ============================================
// 変更履歴モーダル
// ============================================

export function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;
    renderHistoryList();
    modal.style.display = 'flex';
}

export function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.style.display = 'none';
}

function renderHistoryList() {
    const container = document.getElementById('historyList');
    if (!container) return;

    const { undo: undoItems, redo: redoItems } = getHistory();

    if (undoItems.length === 0 && redoItems.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">変更履歴はありません</div>';
        return;
    }

    const typeIcons = {
        estimate_add: '📝', estimate_add_other: '📝',
        estimate_edit: '✏️', estimate_bulk_edit: '✏️',
        estimate_delete: '🗑️', task_delete: '🗑️', task_edit: '✏️',
        actual_add: '📊', actual_edit: '✏️', actual_delete: '🗑️',
        vacation_add: '🏖️', vacation_delete: '🗑️',
        holiday_add: '📅', holiday_delete: '🗑️',
    };

    let html = '';

    // Redo items (undone actions, shown at top, dimmed)
    redoItems.forEach(item => {
        const icon = item.type.startsWith('schedule_') ? '📋' : (typeIcons[item.type] || '📋');
        const time = formatTime(item.timestamp);
        html += `<div class="history-item history-item-undone">
            <span class="history-icon">${icon}</span>
            <div class="history-info">
                <div class="history-desc">${Utils.escapeHtml(item.description || item.type)}</div>
                <div class="history-time">${time}（取り消し済み）</div>
            </div>
        </div>`;
    });

    // Current position marker
    if (redoItems.length > 0) {
        html += '<div class="history-current-marker">▼ 現在の状態</div>';
    }

    // Undo items (active history, newest first)
    undoItems.forEach((item, index) => {
        const icon = item.type.startsWith('schedule_') ? '📋' : (typeIcons[item.type] || '📋');
        const time = formatTime(item.timestamp);
        const isLatest = index === 0;
        html += `<div class="history-item ${isLatest ? 'history-item-latest' : ''}">
            <span class="history-icon">${icon}</span>
            <div class="history-info">
                <div class="history-desc">${Utils.escapeHtml(item.description || item.type)}</div>
                <div class="history-time">${time}</div>
            </div>
            <button class="history-revert-btn" onclick="window.revertToAction(${JSON.stringify(item.id)})">ここまで戻す</button>
        </div>`;
    });

    container.innerHTML = html;
}

function formatTime(timestamp) {
    try {
        const d = new Date(timestamp);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        if (isToday) return `${h}:${m}`;
        return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`;
    } catch {
        return '';
    }
}
