// ============================================
// 見積追加関連機能
// ============================================

import * as State from './state.js';
import * as Utils from './utils.js';
import * as Estimate from './estimate.js';
import { PROCESS } from './constants.js';
import { renderEstimateList } from './estimate.js';
import { updateSchedule } from './schedule.js';

// ============================================
// 見積追加モーダル関連
// ============================================

// フォームに入力中のデータがあるか（モーダルを開いた後、閉じて再度開く時に保持する）
let hasFormData = false;

// 単一工程モードの状態
let singleProcessMode = null; // null: 通常, { version, task, process } のオブジェクト

export function openAddEstimateModal() {
    // セレクトの選択肢は常に最新化（データ変更に追従）
    if (typeof window.updateVersionOptions === 'function') window.updateVersionOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();

    if (!hasFormData) {
        // 新規: フォームを初期化
        initAddEstimateForm();
    }
    // 保持中: そのまま表示（選択肢の更新のみ済み）

    // 単一工程モードでなければ通常表示に戻す
    if (!singleProcessMode) {
        exitSingleProcessMode();
    }

    document.getElementById('addEstimateModal').style.display = 'flex';
    constrainProcessTableOnMobile();
}

/**
 * 単一工程モードでモーダルを開く（対応詳細モーダルからの工程追加用）
 */
export function openAddEstimateSingleProcess(version, task, process) {
    singleProcessMode = { version, task, process };
    hasFormData = false;

    // セレクトの選択肢を最新化
    if (typeof window.updateVersionOptions === 'function') window.updateVersionOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    initAddEstimateForm();

    const modal = document.getElementById('addEstimateModal');
    modal.style.display = 'flex';

    // --- UI制限 ---
    // セグメントコントロール非表示
    const modeSelector = document.getElementById('addEstModeSelector');
    if (modeSelector) modeSelector.style.display = 'none';

    // 版数をpre-fill＋読み取り専用
    const versionSelect = document.getElementById('addEstVersion');
    if (versionSelect) {
        versionSelect.value = version;
        versionSelect.disabled = true;
    }

    // 帳票名・対応名をpre-fill＋読み取り専用
    const formNameSelect = document.getElementById('addEstFormNameSelect');
    const formNameInput = document.getElementById('addEstFormName');
    const taskInput = document.getElementById('addEstTask');

    if (task.includes('：')) {
        const parts = task.split('：');
        if (formNameSelect) {
            let found = false;
            for (let i = 0; i < formNameSelect.options.length; i++) {
                if (formNameSelect.options[i].value === parts[0]) { found = true; break; }
            }
            if (found) {
                formNameSelect.value = parts[0];
                formNameSelect.style.display = 'block';
                formNameSelect.disabled = true;
                if (formNameInput) formNameInput.style.display = 'none';
            } else {
                formNameSelect.style.display = 'none';
                if (formNameInput) {
                    formNameInput.style.display = 'block';
                    formNameInput.value = parts[0];
                    formNameInput.readOnly = true;
                }
            }
        }
        if (taskInput) { taskInput.value = parts.slice(1).join('：'); taskInput.readOnly = true; }
    } else {
        if (formNameSelect) { formNameSelect.value = ''; formNameSelect.disabled = true; }
        if (taskInput) { taskInput.value = task; taskInput.readOnly = true; }
    }

    // 対象工程以外のtbody行を非表示
    const table = document.getElementById('addEstimateTable');
    if (table) {
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row, i) => {
            const proc = PROCESS.TYPES[i];
            row.style.display = (proc === process) ? '' : 'none';
        });
    }

    // 合計行を非表示（1工程のみ）
    const totals = document.getElementById('addEstimateTotals');
    if (totals) totals.style.display = 'none';

    // モーダルタイトルを変更
    const titleEl = modal.querySelector('.modal-header h3');
    if (titleEl) titleEl.textContent = `📝 ${process} 工程を追加`;

    // 対象工程の時間フィールドにフォーカス
    setTimeout(() => {
        const hoursField = document.getElementById(`addEst${process}`);
        if (hoursField) hoursField.focus();
    }, 100);

    constrainProcessTableOnMobile();
}

/**
 * 全工程一括編集モードでモーダルを開く（対応詳細モーダルから）
 */
export function openEditAllProcesses(version, task) {
    // まず通常の登録モーダル初期化を再利用
    hasFormData = false;
    openAddEstimateModal();

    const modal = document.getElementById('addEstimateModal');

    // 編集モードフラグをセット
    modal.dataset.editMode = 'true';
    modal.dataset.editVersion = version;
    modal.dataset.editTask = task;

    // タイトル変更
    const titleEl = modal.querySelector('.modal-header h3');
    if (titleEl) titleEl.textContent = '全工程を編集';

    // 「その他工数」タブを非表示
    const modeSelector = document.getElementById('addEstModeSelector');
    if (modeSelector) modeSelector.style.display = 'none';

    // 版数をプリフィル
    const versionSelect = document.getElementById('addEstVersion');
    if (versionSelect) versionSelect.value = version;

    // 帳票名・対応名を分解してプリフィル（editTask()と同じロジック）
    let formName = '';
    let taskName = '';
    if (task.includes('：')) {
        const parts = task.split('：');
        formName = parts[0];
        taskName = parts.slice(1).join('：');
    } else if (task.includes('_')) {
        const parts = task.split('_');
        formName = parts[0];
        taskName = parts.slice(1).join('_');
    } else {
        taskName = task;
    }

    const formNameSelect = document.getElementById('addEstFormNameSelect');
    const formNameInput = document.getElementById('addEstFormName');

    if (formNameSelect) {
        let formNameExists = false;
        for (let i = 0; i < formNameSelect.options.length; i++) {
            if (formNameSelect.options[i].value === formName) {
                formNameExists = true;
                break;
            }
        }
        if (formNameExists) {
            formNameSelect.value = formName;
            formNameSelect.style.display = 'block';
            if (formNameInput) {
                formNameInput.style.display = 'none';
                formNameInput.value = formName;
            }
        } else if (formName) {
            formNameSelect.value = '__new__';
            formNameSelect.style.display = 'none';
            if (formNameInput) {
                formNameInput.style.display = 'block';
                formNameInput.value = formName;
            }
        }
    }

    const taskInput = document.getElementById('addEstTask');
    if (taskInput) taskInput.value = taskName;

    // 既存データで工程テーブルをプリフィル
    const taskEstimates = State.estimates.filter(e => e.version === version && e.task === task);

    // 作業月のプリフィル: 最も多い作業月を初期値にする
    const monthCounts = {};
    taskEstimates.forEach(e => {
        const est = Utils.normalizeEstimate(e);
        if (est.workMonths && est.workMonths.length > 0) {
            est.workMonths.forEach(m => {
                monthCounts[m] = (monthCounts[m] || 0) + 1;
            });
        }
    });
    const sortedMonths = Object.entries(monthCounts).sort((a, b) => b[1] - a[1]);
    if (sortedMonths.length > 0) {
        const mostCommonMonth = sortedMonths[0][0];
        const startMonthSelect = document.getElementById('addEstStartMonth');
        if (startMonthSelect) startMonthSelect.value = mostCommonMonth;
    }

    // 各工程の担当・工数をプリフィル
    PROCESS.TYPES.forEach(proc => {
        const est = taskEstimates.find(e => e.process === proc);
        const memberSelect = document.getElementById(`addEst${proc}_member`);
        const hoursInput = document.getElementById(`addEst${proc}`);
        if (est) {
            if (memberSelect) memberSelect.value = est.member;
            if (hoursInput) hoursInput.value = est.hours;
        } else {
            if (memberSelect) memberSelect.value = '';
            if (hoursInput) hoursInput.value = '';
        }
    });

    // ボタンテキスト変更
    const submitBtn = document.getElementById('addEstSubmitBtn');
    if (submitBtn) submitBtn.textContent = '保存';

    updateAddEstimateTotals();
}

/**
 * 全工程一括編集の保存処理
 */
function saveEditAllProcesses() {
    const modal = document.getElementById('addEstimateModal');
    const oldVersion = modal.dataset.editVersion;
    const oldTask = modal.dataset.editTask;

    // フォームから値を取得
    const version = document.getElementById('addEstVersion').value;
    const formNameSelect = document.getElementById('addEstFormNameSelect');
    const formNameInput = document.getElementById('addEstFormName');
    const formName = (formNameInput.style.display === 'none' ? formNameSelect.value : formNameInput.value).trim();
    const taskName = document.getElementById('addEstTask').value.trim();

    if (!version) { alert('版数を選択してください'); return; }
    if (!formName) { alert('帳票名を入力してください'); return; }
    if (!taskName) { alert('対応名を入力してください'); return; }

    const newTask = `${formName}：${taskName}`;

    // 作業月の取得
    const monthType = document.querySelector('input[name="addEstMonthType"]:checked')?.value || 'single';
    let startMonth, endMonth;
    if (monthType === 'single') {
        startMonth = document.getElementById('addEstStartMonth').value;
        endMonth = null;
    } else {
        startMonth = document.getElementById('addEstStartMonthMulti').value;
        endMonth = document.getElementById('addEstEndMonth').value;
    }

    const isSingleMonth = !endMonth || startMonth === endMonth;

    // 既存の見積データを取得
    const taskEstimates = State.estimates.filter(e => e.version === oldVersion && e.task === oldTask);

    // 各工程を処理
    PROCESS.TYPES.forEach(proc => {
        const memberSelect = document.getElementById(`addEst${proc}_member`);
        const hoursInput = document.getElementById(`addEst${proc}`);
        const member = memberSelect ? memberSelect.value : '';
        const hours = parseFloat(hoursInput ? hoursInput.value : '') || 0;

        const existingEst = taskEstimates.find(e => e.process === proc);

        if (existingEst && hours > 0) {
            // 既存あり + 入力あり → 更新
            const idx = State.estimates.findIndex(e => e.id === existingEst.id);
            if (idx !== -1) {
                let workMonth, workMonths, monthlyHours;
                if (isSingleMonth) {
                    workMonth = startMonth;
                    workMonths = startMonth ? [startMonth] : existingEst.workMonths || [];
                    monthlyHours = startMonth ? { [startMonth]: hours } : existingEst.monthlyHours || {};
                } else {
                    // 複数月: 工程別作業月があればそれを使う
                    const procStartMonth = document.getElementById(`addEst${proc}_startMonth`)?.value;
                    const procEndMonth = document.getElementById(`addEst${proc}_endMonth`)?.value;
                    if (procStartMonth && procEndMonth && procStartMonth !== procEndMonth) {
                        const months = Utils.generateMonthRange(procStartMonth, procEndMonth);
                        workMonth = procStartMonth;
                        workMonths = months;
                        monthlyHours = {};
                        months.forEach(m => { monthlyHours[m] = hours / months.length; });
                    } else {
                        workMonth = procStartMonth || startMonth;
                        workMonths = workMonth ? [workMonth] : existingEst.workMonths || [];
                        monthlyHours = workMonth ? { [workMonth]: hours } : existingEst.monthlyHours || {};
                    }
                }

                State.estimates[idx] = {
                    ...State.estimates[idx],
                    member: member,
                    hours: hours,
                    workMonth: workMonth || State.estimates[idx].workMonth,
                    workMonths: workMonths.length > 0 ? workMonths : State.estimates[idx].workMonths,
                    monthlyHours: Object.keys(monthlyHours).length > 0 ? monthlyHours : State.estimates[idx].monthlyHours
                };

                // 見込残存時間の調整
                Estimate.saveRemainingEstimate(oldVersion, oldTask, proc, member, hours);
            }
        } else if (!existingEst && hours > 0 && member) {
            // 既存なし + 入力あり → 新規作成
            let workMonth, workMonths, monthlyHours;
            if (isSingleMonth) {
                workMonth = startMonth || '';
                workMonths = startMonth ? [startMonth] : [];
                monthlyHours = startMonth ? { [startMonth]: hours } : {};
            } else {
                const procStartMonth = document.getElementById(`addEst${proc}_startMonth`)?.value;
                const procEndMonth = document.getElementById(`addEst${proc}_endMonth`)?.value;
                if (procStartMonth && procEndMonth && procStartMonth !== procEndMonth) {
                    const months = Utils.generateMonthRange(procStartMonth, procEndMonth);
                    workMonth = procStartMonth;
                    workMonths = months;
                    monthlyHours = {};
                    months.forEach(m => { monthlyHours[m] = hours / months.length; });
                } else {
                    workMonth = procStartMonth || startMonth || '';
                    workMonths = workMonth ? [workMonth] : [];
                    monthlyHours = workMonth ? { [workMonth]: hours } : {};
                }
            }

            const newEst = {
                id: Date.now() + Math.random(),
                version: oldVersion,
                task: oldTask,
                process: proc,
                member: member,
                hours: hours,
                workMonth: workMonth,
                workMonths: workMonths,
                monthlyHours: monthlyHours,
                createdAt: new Date().toISOString()
            };
            State.estimates.push(newEst);
            Estimate.saveRemainingEstimate(oldVersion, oldTask, proc, member, hours);
        }
        // 既存あり + 入力なし → そのまま残す
        // 既存なし + 入力なし → スキップ
    });

    // 版数・対応名が変更されていれば一括更新
    if (oldVersion !== version || oldTask !== newTask) {
        State.estimates.forEach((est, index) => {
            if (est.version === oldVersion && est.task === oldTask) {
                State.estimates[index] = { ...est, version: version, task: newTask };
            }
        });
        State.actuals.forEach((act, index) => {
            if (act.version === oldVersion && act.task === oldTask) {
                State.actuals[index] = { ...act, version: version, task: newTask };
            }
        });
        // スケジュール連動
        State.schedules.forEach(s => {
            if (s.version === oldVersion && s.task === oldTask) {
                updateSchedule(s.id, { version: version, task: newTask });
            }
        });
    }

    // 保存・UI更新
    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
    renderEstimateList();
    if (typeof window.updateReport === 'function') window.updateReport();

    resetEditMode();
    resetAddEstimateForm();
    modal.style.display = 'none';

    Utils.showAlert('全工程を更新しました', true);
}

/**
 * 編集モードのUIをリセット
 */
function resetEditMode() {
    const modal = document.getElementById('addEstimateModal');
    if (modal.dataset.editMode === 'true') {
        modal.dataset.editMode = '';
        modal.dataset.editVersion = '';
        modal.dataset.editTask = '';

        const titleEl = modal.querySelector('.modal-header h3');
        if (titleEl) titleEl.textContent = '📝 見積登録';

        const modeSelector = document.getElementById('addEstModeSelector');
        if (modeSelector) modeSelector.style.display = '';

        const submitBtn = document.getElementById('addEstSubmitBtn');
        if (submitBtn) submitBtn.textContent = '登録';
    }
}

/**
 * 単一工程モードを解除して通常表示に戻す
 */
function exitSingleProcessMode() {
    if (!singleProcessMode) return;
    singleProcessMode = null;

    // セグメントコントロール再表示
    const modeSelector = document.getElementById('addEstModeSelector');
    if (modeSelector) modeSelector.style.display = '';

    // フィールドのdisabled/readOnlyを解除
    const versionSelect = document.getElementById('addEstVersion');
    if (versionSelect) versionSelect.disabled = false;

    const formNameSelect = document.getElementById('addEstFormNameSelect');
    if (formNameSelect) formNameSelect.disabled = false;

    const formNameInput = document.getElementById('addEstFormName');
    if (formNameInput) formNameInput.readOnly = false;

    const taskInput = document.getElementById('addEstTask');
    if (taskInput) taskInput.readOnly = false;

    // 全tbody行を再表示
    const table = document.getElementById('addEstimateTable');
    if (table) {
        table.querySelectorAll('tbody tr').forEach(row => {
            row.style.display = '';
        });
    }

    // 合計行を再表示
    const totals = document.getElementById('addEstimateTotals');
    if (totals) totals.style.display = '';

    // タイトルを元に戻す
    const modal = document.getElementById('addEstimateModal');
    const titleEl = modal?.querySelector('.modal-header h3');
    if (titleEl) titleEl.textContent = '📝 見積登録';
}

/**
 * モバイル表示時に工程テーブルの幅を画面内に収める
 * テーブルの width:100% が正しく解決されないため、ピクセル値で直接指定する
 */
function constrainProcessTableOnMobile() {
    if (window.innerWidth > 768) return;

    const table = document.getElementById('addEstimateTable');
    if (!table) return;

    const wrapper = table.closest('.estimate-table-wrapper');
    if (!wrapper) return;

    // ラッパーの実際の幅をピクセルで取得
    const wrapperWidth = wrapper.offsetWidth;
    if (wrapperWidth <= 0) return;

    // テーブル幅をピクセルで直接指定
    // グローバル table { min-width: 600px } を上書きする必要がある
    table.style.tableLayout = 'fixed';
    table.style.width = wrapperWidth + 'px';
    table.style.minWidth = '0';
    table.style.maxWidth = wrapperWidth + 'px';

    // th の幅を設定（table-layout: fixed で最初の行が列幅を決定）
    const ths = table.querySelectorAll('thead th');
    if (ths.length >= 3) {
        ths[0].style.width = '44px';  // 工程
        ths[1].style.width = '';       // 担当（残りスペース）
        ths[2].style.width = '64px';   // 時間
    }

    // select要素を列幅に収める
    table.querySelectorAll('select, input[type="number"]').forEach(el => {
        el.style.width = '100%';
        el.style.maxWidth = '100%';
        el.style.minWidth = '0';
        el.style.boxSizing = 'border-box';
    });
}

/**
 * モーダルを閉じる（入力中のデータは保持）
 */
export function closeAddEstimateModal() {
    const modal = document.getElementById('addEstimateModal');
    modal.style.display = 'none';

    // 編集モードの場合はリセット
    if (modal.dataset.editMode === 'true') {
        resetEditMode();
        resetAddEstimateForm();
        return;
    }

    if (singleProcessMode) {
        // 単一工程モードの場合はリセットして通常に戻す
        exitSingleProcessMode();
        resetAddEstimateForm();
    } else {
        // 通常モード: 何か入力されていればフラグを立てる
        hasFormData = checkHasFormData();
    }
}

/**
 * フォームに入力データがあるかチェック
 */
function checkHasFormData() {
    if (document.getElementById('addEstVersion')?.value) return true;
    if (document.getElementById('addEstFormNameSelect')?.value) return true;
    if (document.getElementById('addEstFormName')?.value) return true;
    if (document.getElementById('addEstTask')?.value) return true;
    for (const proc of PROCESS.TYPES) {
        if (parseFloat(document.getElementById(`addEst${proc}`)?.value) > 0) return true;
    }
    // その他工数
    if (document.getElementById('addEstOtherTask')?.value) return true;
    if (parseFloat(document.getElementById('addEstOtherHours')?.value) > 0) return true;
    return false;
}

/**
 * フォームを完全にリセット（登録完了後に呼ぶ）
 */
export function resetAddEstimateForm() {
    hasFormData = false;

    // モードを通常に戻す
    switchEstimateMode('normal');

    // 通常モードのフォームをリセット
    document.getElementById('addEstVersion').value = '';

    const formNameSelect = document.getElementById('addEstFormNameSelect');
    const formNameInput = document.getElementById('addEstFormName');
    formNameSelect.value = '';
    formNameSelect.style.display = 'block';
    formNameInput.value = '';
    formNameInput.style.display = 'none';

    const addEstTask = document.getElementById('addEstTask');
    if (addEstTask) addEstTask.value = '';

    const singleRadio = document.querySelector('input[name="addEstMonthType"][value="single"]');
    if (singleRadio) singleRadio.checked = true;
    switchAddEstMonthType();

    PROCESS.TYPES.forEach(proc => {
        const memberEl = document.getElementById(`addEst${proc}_member`);
        const hoursEl = document.getElementById(`addEst${proc}`);
        if (memberEl) memberEl.value = '';
        if (hoursEl) hoursEl.value = '';
    });

    updateAddEstimateTotals();

    // その他工数フォームをリセット
    const otherTask = document.getElementById('addEstOtherTask');
    const otherMember = document.getElementById('addEstOtherMember');
    const otherHours = document.getElementById('addEstOtherHours');
    if (otherTask) otherTask.value = '';
    if (otherMember) otherMember.value = '';
    if (otherHours) otherHours.value = '';
}

// 現在の見積モード（'normal' or 'other'）
let currentEstimateMode = 'normal';

/**
 * 見積モードの切り替え（セグメントコントロール）
 * @param {string} mode - 'normal' または 'other'
 */
export function switchEstimateMode(mode) {
    currentEstimateMode = mode;

    const normalForm = document.getElementById('addEstNormalForm');
    const otherForm = document.getElementById('addEstOtherForm');
    const segmentBtns = document.querySelectorAll('#addEstModeSelector .segment-btn');

    // セグメントボタンのアクティブ状態を更新
    segmentBtns.forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // フォームの表示切替
    if (mode === 'other') {
        normalForm.style.display = 'none';
        otherForm.style.display = 'block';
    } else {
        normalForm.style.display = 'block';
        otherForm.style.display = 'none';
    }
}

/**
 * 現在の見積モードを取得
 */
export function getCurrentEstimateMode() {
    return currentEstimateMode;
}

/**
 * その他工数フォームの担当者セレクト初期化
 */
export function initOtherWorkMemberSelect() {
    const select = document.getElementById('addEstOtherMember');
    if (!select) return;

    // 担当者を estimates と actuals から取得
    const members = new Set();
    State.estimates.forEach(e => { if (e.member) members.add(e.member); });
    State.actuals.forEach(a => { if (a.member) members.add(a.member); });

    select.innerHTML = '<option value="">-- 担当者を選択 --</option>';
    select.innerHTML += '<option value="__all__">全員</option>';
    Array.from(members).sort().forEach(member => {
        select.innerHTML += `<option value="${Utils.escapeHtml(member)}">${Utils.escapeHtml(member)}</option>`;
    });
}

/**
 * 全担当者のリストを取得
 */
function getAllMembers() {
    const members = new Set();
    State.estimates.forEach(e => { if (e.member) members.add(e.member); });
    State.actuals.forEach(a => { if (a.member) members.add(a.member); });
    return Array.from(members).sort();
}

// 担当者の自動コピー機能（PG↔PT、IT↔ST）
export function autoFillMember(changedFieldId) {
    // フィールドIDからプレフィックス（add/quick）と工程を抽出
    const match = changedFieldId.match(/^(add|quick)Est(\w+)_member$/);
    if (!match) return;

    const prefix = match[1];
    const changedProcess = match[2];

    // 変更されたフィールドの値を取得
    const changedValue = document.getElementById(changedFieldId).value;
    if (!changedValue) return; // 空の場合は何もしない

    // コピー先の工程を決定（PG↔PT、IT↔ST）
    let targetProcess = null;
    if (changedProcess === 'PG') targetProcess = 'PT';
    else if (changedProcess === 'PT') targetProcess = 'PG';
    else if (changedProcess === 'IT') targetProcess = 'ST';
    else if (changedProcess === 'ST') targetProcess = 'IT';

    if (!targetProcess) return; // 対象外の工程

    // コピー先フィールドを取得
    const targetFieldId = `${prefix}Est${targetProcess}_member`;
    const targetField = document.getElementById(targetFieldId);

    // コピー先が空の場合のみ自動コピー
    if (targetField && !targetField.value) {
        targetField.value = changedValue;
    }
}

export function initAddEstimateForm() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 版数オプションを生成（updateVersionOptionsで全てのセレクトが更新される）
    if (typeof window.updateVersionOptions === 'function') window.updateVersionOptions();

    // 担当者オプションを生成（updateMemberOptionsで全てのセレクトが更新される）
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();

    // 作業月セレクトボックスの初期化
    Utils.generateMonthOptions('addEstStartMonth', currentMonth);
    Utils.generateMonthOptions('addEstStartMonthMulti', currentMonth);
    Utils.generateMonthOptions('addEstEndMonth', currentMonth);

    // その他工数フォームの初期化
    Utils.generateMonthOptions('addEstOtherMonth', currentMonth);
    initOtherWorkMemberSelect();

    // 複数月選択の期間変更時にリアルタイム更新
    const startMonthMulti = document.getElementById('addEstStartMonthMulti');
    const endMonth = document.getElementById('addEstEndMonth');
    if (startMonthMulti) {
        startMonthMulti.addEventListener('change', function () {
            // 開始月が変更されたら、終了月の選択肢を更新（開始月より後の月のみ）
            const currentEndValue = endMonth.value;
            Utils.generateMonthOptions('addEstEndMonth', currentEndValue, startMonthMulti.value);

            // 開始月が終了月より後の場合、終了月を開始月に合わせる
            if (endMonth.value < startMonthMulti.value) {
                endMonth.value = startMonthMulti.value;
            }

            updateAddEstWorkMonthUI();
        });
    }
    if (endMonth) {
        endMonth.addEventListener('change', function () {
            // 終了月が変更されたら、終了月が開始月より前の場合、開始月を終了月に合わせる
            if (endMonth.value < startMonthMulti.value) {
                startMonthMulti.value = endMonth.value;
                // 開始月変更に伴い終了月の選択肢も再生成が必要だが、
                // startMonthMultiのchangeイベントは発火しないのでここで処理
                Utils.generateMonthOptions('addEstEndMonth', endMonth.value, startMonthMulti.value);
            }
            updateAddEstWorkMonthUI();
        });
    }
}

// 作業月UIの更新（見積登録モーダル用）
export function updateAddEstWorkMonthUI() {
    const monthType = document.querySelector('input[name="addEstMonthType"]:checked')?.value || 'single';

    if (monthType === 'single') {
        // 単一月モードでは何もしない
        return;
    }

    // 複数月モードの場合のみ処理
    const startMonthMulti = document.getElementById('addEstStartMonthMulti');
    const endMonth = document.getElementById('addEstEndMonth');

    if (!startMonthMulti || !endMonth) return;
    if (!startMonthMulti.value) return;

    // 工程別のデフォルト作業月を更新
    if (endMonth.value && startMonthMulti.value !== endMonth.value) {
        updateDefaultAddProcessMonths(startMonthMulti.value, endMonth.value);
    } else if (endMonth.value === startMonthMulti.value) {
        // 開始月と終了月が同じ場合も更新
        updateDefaultAddProcessMonths(startMonthMulti.value, endMonth.value);
    }
}

export function switchAddEstMonthType() {
    const monthTypeRadio = document.querySelector('input[name="addEstMonthType"]:checked');
    if (!monthTypeRadio) return;

    const monthType = monthTypeRadio.value;
    const singleMonthInput = document.getElementById('addEstSingleMonthInput');
    const multiMonthInput = document.getElementById('addEstMultiMonthInput');

    if (monthType === 'single') {
        singleMonthInput.style.display = 'block';
        multiMonthInput.style.display = 'none';
        updateAddEstimateTableHeader(false);
    } else {
        singleMonthInput.style.display = 'none';
        multiMonthInput.style.display = 'block';

        // 複数月モードの場合、開始月と終了月を同期
        const startMonth = document.getElementById('addEstStartMonth').value;
        const startMonthMulti = document.getElementById('addEstStartMonthMulti');
        const endMonth = document.getElementById('addEstEndMonth');

        if (startMonth && startMonthMulti) {
            startMonthMulti.value = startMonth;
            // 終了月の選択肢を開始月より後の月のみに更新
            const currentEndValue = endMonth ? endMonth.value : '';
            Utils.generateMonthOptions('addEstEndMonth', currentEndValue, startMonth);
            if (endMonth && !endMonth.value) {
                endMonth.value = startMonth;
            }
        }

        // テーブルに作業月列を追加（内部で選択肢も設定される）
        updateAddEstimateTableHeader(true);
    }
}

// 工程表のヘッダーと作業月列を更新（見積登録モーダル用）
export function updateAddEstimateTableHeader(showWorkMonthColumn) {
    const table = document.getElementById('addEstimateTable');
    if (!table) return;

    const headerRow = table.querySelector('thead tr');
    const bodyRows = table.querySelectorAll('tbody tr');

    if (!headerRow) return;

    if (showWorkMonthColumn) {
        const isMobile = window.innerWidth <= 768;
        // 作業月列を追加
        if (headerRow.children.length === 3) {
            const th = document.createElement('th');
            th.style.width = isMobile ? '100px' : '150px';
            th.style.padding = '8px';
            th.textContent = '作業月';
            headerRow.appendChild(th);

            // モバイル時、既存列幅を再調整（4列構成）
            if (isMobile) {
                const ths = headerRow.children;
                ths[0].style.width = '40px';   // 工程
                ths[2].style.width = '50px';   // 時間
            }
        }

        bodyRows.forEach((row, index) => {
            if (row.children.length === 3) {
                const td = document.createElement('td');
                td.style.overflow = 'hidden';
                const processes = PROCESS.TYPES;
                const processName = processes[index];
                const selStyle = isMobile
                    ? 'margin: 0; flex: 1; min-width: 0; max-width: 100%; box-sizing: border-box; font-size: 13px;'
                    : 'margin: 0; flex: 1;';
                td.innerHTML = `
                    <div style="display: flex; gap: ${isMobile ? '2px' : '5px'}; align-items: center;">
                        <select id="addEst${processName}_startMonth" style="${selStyle}"></select>
                        <span style="font-size: ${isMobile ? '11px' : '14px'};">〜</span>
                        <select id="addEst${processName}_endMonth" style="${selStyle}"></select>
                    </div>
                `;
                row.appendChild(td);
            }
        });

        // DOM更新後に選択肢を設定
        setTimeout(() => {
            const startMonthMulti = document.getElementById('addEstStartMonthMulti');
            const endMonth = document.getElementById('addEstEndMonth');
            if (startMonthMulti && endMonth && startMonthMulti.value && endMonth.value) {
                updateDefaultAddProcessMonths(startMonthMulti.value, endMonth.value);
            }
        }, 0);
    } else {
        // 作業月列を削除
        if (headerRow.children.length === 4) {
            headerRow.removeChild(headerRow.lastChild);
        }

        bodyRows.forEach(row => {
            if (row.children.length === 4) {
                row.removeChild(row.lastChild);
            }
        });
    }
}

// 各工程のデフォルト作業月を設定（見積登録モーダル用）
export function updateDefaultAddProcessMonths(startMonth, endMonth) {
    const defaults = Estimate.calculateDefaultWorkMonths(startMonth, endMonth);
    const months = Utils.generateMonthRange(startMonth, endMonth);

    defaults.forEach(item => {
        const startSelect = document.getElementById(`addEst${item.process}_startMonth`);
        const endSelect = document.getElementById(`addEst${item.process}_endMonth`);

        if (startSelect && endSelect) {
            // セレクトボックスに選択肢を設定（年なし表示）
            startSelect.innerHTML = '';
            endSelect.innerHTML = '';
            months.forEach(month => {
                startSelect.innerHTML += `<option value="${month}">${parseInt(month.substring(5))}月</option>`;
                endSelect.innerHTML += `<option value="${month}">${parseInt(month.substring(5))}月</option>`;
            });

            // デフォルト値を設定
            startSelect.value = item.startMonth;
            endSelect.value = item.endMonth;
        }
    });
}

export function updateAddEstimateTotals() {
    const processes = PROCESS.TYPES;
    let totalHours = 0;

    processes.forEach(proc => {
        const hours = parseFloat(document.getElementById(`addEst${proc}`).value) || 0;
        totalHours += hours;
    });

    const totalDays = (totalHours / 8).toFixed(1);
    const totalMonths = (totalHours / 160).toFixed(2);

    document.getElementById('addEstTotalHours').textContent = totalHours.toFixed(1);
    document.getElementById('addEstTotalDays').textContent = totalDays;
    document.getElementById('addEstTotalMonths').textContent = totalMonths;
}

export function addEstimateFromModal() {
    // 編集モードの場合は編集用の保存処理へ
    const modal = document.getElementById('addEstimateModal');
    if (modal.dataset.editMode === 'true') {
        return saveEditAllProcesses();
    }

    // モードに応じて処理を分岐
    if (currentEstimateMode === 'other') {
        addOtherWorkEstimate();
    } else {
        addNormalEstimate();
    }
}

/**
 * その他工数の登録
 */
function addOtherWorkEstimate() {
    const taskName = document.getElementById('addEstOtherTask').value.trim();
    const memberValue = document.getElementById('addEstOtherMember').value;
    const workMonth = document.getElementById('addEstOtherMonth').value;
    const hours = parseFloat(document.getElementById('addEstOtherHours').value) || 0;

    if (!taskName) {
        alert('作業名を入力してください');
        return;
    }

    if (!memberValue) {
        alert('担当者を選択してください');
        return;
    }

    if (!workMonth) {
        alert('作業月を選択してください');
        return;
    }

    if (hours <= 0) {
        alert('見積工数を入力してください');
        return;
    }

    // 登録対象の担当者リストを決定
    const members = memberValue === '__all__' ? getAllMembers() : [memberValue];

    if (members.length === 0) {
        alert('登録対象の担当者がいません');
        return;
    }

    // 各担当者分の見積を登録
    members.forEach((member, index) => {
        const est = {
            id: Date.now() + index + Math.random(),
            version: '',
            task: taskName,
            process: '',
            member: member,
            hours: hours,
            workMonth: workMonth,
            workMonths: [workMonth],
            monthlyHours: { [workMonth]: hours },
            createdAt: new Date().toISOString()
        };
        State.estimates.push(est);
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.updateReport === 'function') window.updateReport();
    resetAddEstimateForm();
    document.getElementById('addEstimateModal').style.display = 'none';

    const message = members.length > 1
        ? `その他工数を${members.length}名分登録しました`
        : 'その他工数を登録しました';
    Utils.showAlert(message, true);
}

/**
 * 通常の見積登録
 */
function addNormalEstimate() {
    const taskName = document.getElementById('addEstTask').value.trim();

    // ラジオボタンの選択に応じて適切なセレクトボックスから値を取得
    const monthType = document.querySelector('input[name="addEstMonthType"]:checked').value;
    let startMonth, endMonth;

    if (monthType === 'single') {
        startMonth = document.getElementById('addEstStartMonth').value;
        endMonth = null;
    } else {
        startMonth = document.getElementById('addEstStartMonthMulti').value;
        endMonth = document.getElementById('addEstEndMonth').value;
    }

    // 通常モード: 版数・帳票名・対応名を検証
    const version = document.getElementById('addEstVersion').value;

    // 帳票名を取得（selectまたはinputから）
    const formNameSelect = document.getElementById('addEstFormNameSelect');
    const formNameInput = document.getElementById('addEstFormName');
    const formName = (formNameInput.style.display === 'none' ? formNameSelect.value : formNameInput.value).trim();

    if (!version || version === '新規追加') {
        alert('版数を選択してください');
        return;
    }

    if (!formName) {
        alert('帳票名を入力してください');
        return;
    }

    if (!taskName) {
        alert('対応名を入力してください');
        return;
    }

    // 帳票名と対応名を結合
    const task = `${formName}：${taskName}`;

    if (!startMonth) {
        alert('作業月を選択してください');
        return;
    }

    const processes = PROCESS.TYPES;
    addEstimateFromModalNormal(version, task, processes, startMonth, endMonth);
}

export function addEstimateFromModalNormal(version, task, processes, startMonth, endMonth) {
    const isSingleMonth = !endMonth || startMonth === endMonth;

    processes.forEach(proc => {
        const member = document.getElementById(`addEst${proc}_member`).value;
        const hours = parseFloat(document.getElementById(`addEst${proc}`).value) || 0;

        if (hours > 0) {
            let workMonths, monthlyHours, workMonth;

            if (isSingleMonth) {
                // 単一月モード
                workMonth = startMonth;
                workMonths = [startMonth];
                monthlyHours = { [startMonth]: hours };
            } else {
                // 複数月モード: 各工程の作業月を取得
                const procStartMonth = document.getElementById(`addEst${proc}_startMonth`)?.value;
                const procEndMonth = document.getElementById(`addEst${proc}_endMonth`)?.value;

                if (procStartMonth && procEndMonth) {
                    if (procStartMonth === procEndMonth) {
                        workMonth = procStartMonth;
                        workMonths = [procStartMonth];
                        monthlyHours = { [procStartMonth]: hours };
                    } else {
                        const months = Utils.generateMonthRange(procStartMonth, procEndMonth);
                        workMonth = procStartMonth;
                        workMonths = months;
                        monthlyHours = {};
                        months.forEach(m => {
                            monthlyHours[m] = hours / months.length;
                        });
                    }
                } else {
                    // 工程別作業月が設定されていない場合は全期間
                    const months = Utils.generateMonthRange(startMonth, endMonth);
                    workMonth = startMonth;
                    workMonths = months;
                    monthlyHours = {};
                    months.forEach(m => {
                        monthlyHours[m] = hours / months.length;
                    });
                }
            }

            const est = {
                id: Date.now() + Math.random(),
                version: version,
                task: task,
                process: proc,
                member: member,
                hours: hours,
                workMonth: workMonth,
                workMonths: workMonths,
                monthlyHours: monthlyHours,
                createdAt: new Date().toISOString()
            };

            State.estimates.push(est);

            // 見込残存時間も自動設定（見積時間と同じ）
            Estimate.saveRemainingEstimate(version, task, proc, member, hours);
        }
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.updateReport === 'function') window.updateReport();

    // 単一工程モードの場合、対応詳細モーダルに戻る
    const returnTo = singleProcessMode ? { version: singleProcessMode.version, task: singleProcessMode.task, process: singleProcessMode.process } : null;

    exitSingleProcessMode();
    resetAddEstimateForm();
    document.getElementById('addEstimateModal').style.display = 'none';

    if (returnTo) {
        Utils.showAlert(`${returnTo.process} 工程を登録しました`, true);
        setTimeout(() => {
            if (typeof window.showTaskDetail === 'function') {
                window.showTaskDetail(returnTo.version, returnTo.task);
            }
        }, 200);
    } else {
        Utils.showAlert('見積を登録しました', true);
    }
}

console.log('✅ モジュール estimate-add.js loaded');
