// ============================================
// クイック入力関連機能
// ============================================

import {
    estimates, actuals,
    quickInputMode, setQuickInputMode,
    rememberQuickInputMode, setRememberQuickInputMode
} from './state.js';
import { generateMonthOptions } from './utils.js';

// クイック入力用の状態変数
let allQuickTasks = [];
let selectedQuickTask = null;
let selectedMemberFilter = null;

// ============================================
// タスクリスト管理
// ============================================

export function updateQuickTaskList() {
    // 見積データから一意のタスクを抽出（担当者情報も含む）
    const taskMap = new Map();
    estimates.forEach(e => {
        const key = `${e.version}|${e.task}|${e.process}|${e.member}`;
        if (!taskMap.has(key)) {
            taskMap.set(key, {
                version: e.version,
                task: e.task,
                process: e.process,
                member: e.member,
                display: `${e.version} - ${e.task} [${e.process}] (${e.member})`
            });
        }
    });

    allQuickTasks = Array.from(taskMap.values());

    // 担当者セレクトボックスを更新
    updateQuickMemberSelect();
}

export function updateQuickMemberSelect() {
    const select = document.getElementById('quickMemberSelect');
    if (!select) return;

    const members = new Set();

    // 見積データから担当者を抽出
    estimates.forEach(e => members.add(e.member));

    // 表示順が設定されている場合はそれを使用
    let sortedMembers;
    const memberOrderInput = document.getElementById('memberOrder');
    const memberOrderValue = memberOrderInput ? memberOrderInput.value.trim() : '';
    if (memberOrderValue) {
        const orderList = memberOrderValue.split(',').map(m => m.trim()).filter(m => m);
        const orderedMembers = orderList.filter(m => members.has(m));
        const unorderedMembers = Array.from(members).filter(m => !orderedMembers.includes(m)).sort();
        sortedMembers = [...orderedMembers, ...unorderedMembers];
    } else {
        sortedMembers = Array.from(members).sort();
    }

    // オプションを生成
    const currentValue = select.value;
    select.innerHTML = '<option value="">（自動）</option>';
    sortedMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        select.appendChild(option);
    });

    // 前回選択していた値を復元
    if (currentValue && sortedMembers.includes(currentValue)) {
        select.value = currentValue;
    }
}

// ============================================
// ドロップダウン操作
// ============================================

export function handleMemberChange() {
    const memberSelect = document.getElementById('quickMemberSelect');
    const selectedMember = memberSelect ? memberSelect.value : '';
    selectedMemberFilter = selectedMember || null;

    // 対応が既に選択されている場合
    if (selectedQuickTask) {
        // 何もしない（担当者変更として扱う）
        return;
    }

    // 対応が未選択の場合、ドロップダウンを更新
    const searchInput = document.getElementById('quickTaskSearch');
    if (searchInput && searchInput.value) {
        filterQuickTaskList();
    }
}

export function showQuickTaskDropdown() {
    filterQuickTaskList();
}

export function hideQuickTaskDropdown() {
    const dropdown = document.getElementById('quickTaskDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

export function clearQuickTaskSelection() {
    const searchInput = document.getElementById('quickTaskSearch');
    const clearBtn = document.getElementById('quickTaskClearBtn');
    const memberSelect = document.getElementById('quickMemberSelect');

    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    selectedQuickTask = null;

    // 担当者もリセット
    if (memberSelect) memberSelect.value = '';
    selectedMemberFilter = null;

    // ドロップダウンを非表示
    hideQuickTaskDropdown();
}

export function filterQuickTaskList() {
    const searchInput = document.getElementById('quickTaskSearch');
    const dropdown = document.getElementById('quickTaskDropdown');
    if (!searchInput || !dropdown) return;

    const searchText = searchInput.value.toLowerCase();

    // 担当者フィルタが設定されている場合は絞り込む
    let filtered = allQuickTasks;
    if (selectedMemberFilter) {
        filtered = filtered.filter(taskInfo => taskInfo.member === selectedMemberFilter);
    }

    // 検索テキストで絞り込む
    if (searchText) {
        filtered = filtered.filter(taskInfo =>
            taskInfo.display.toLowerCase().includes(searchText)
        );
    }

    if (filtered.length === 0) {
        const msg = selectedMemberFilter
            ? `${selectedMemberFilter}さんの対応が見つかりません`
            : '該当する対応が見つかりません';
        dropdown.innerHTML = `<div class="custom-dropdown-empty">${msg}</div>`;
    } else {
        dropdown.innerHTML = filtered.map(taskInfo => {
            const value = `${taskInfo.version}|${taskInfo.task}|${taskInfo.process}|${taskInfo.member}`;
            return `<div class="custom-dropdown-item" onmousedown="selectQuickTask('${value.replace(/'/g, "\\'")}', '${taskInfo.display.replace(/'/g, "\\'")}')">${taskInfo.display}</div>`;
        }).join('');
    }

    dropdown.style.display = 'block';
}

export function selectQuickTask(value, display) {
    selectedQuickTask = value;
    const [version, task, process, member] = value.split('|');

    const searchInput = document.getElementById('quickTaskSearch');
    const clearBtn = document.getElementById('quickTaskClearBtn');
    const memberSelect = document.getElementById('quickMemberSelect');
    const dropdown = document.getElementById('quickTaskDropdown');

    // 表示を更新
    if (searchInput) {
        searchInput.value = `${version} - ${task} [${process}]`;
    }

    // ×ボタンを表示
    if (clearBtn) {
        clearBtn.style.display = 'block';
    }

    // 担当者フィルタが未設定の場合、見積の担当者を自動設定
    if (!selectedMemberFilter && memberSelect) {
        memberSelect.value = member;
    }

    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// ============================================
// 実績追加
// ============================================

export function quickAddActual() {
    const hoursInput = document.getElementById('quickHours');
    const memberSelect = document.getElementById('quickMemberSelect');
    const workDateInput = document.getElementById('quickWorkDate');

    const hours = hoursInput ? parseFloat(hoursInput.value) : 0;
    const memberOverride = memberSelect ? memberSelect.value : '';
    const workDate = workDateInput ? workDateInput.value : '';

    if (!selectedQuickTask || !hours) {
        alert('対応と実績工数を入力してください');
        return;
    }

    const [version, task, process, originalMember] = selectedQuickTask.split('|');

    // 担当者の決定ロジック
    const finalMember = memberOverride || originalMember;

    // 作業日の決定: 入力があればそれを使用、なければ今日
    const finalDate = workDate || new Date().toISOString().split('T')[0];

    actuals.push({
        id: Date.now(),
        date: finalDate,
        version: version,
        task: task,
        process: process,
        member: finalMember,
        hours: hours,
        createdAt: new Date().toISOString()
    });

    if (typeof window.saveData === 'function') window.saveData();

    // 次の入力のために、今追加した実績をデフォルト選択
    selectedQuickTask = `${version}|${task}|${process}|${finalMember}`;

    // 検索ボックスに表示
    const searchInput = document.getElementById('quickTaskSearch');
    if (searchInput) {
        searchInput.value = `${version} - ${task} [${process}]`;
    }

    // 工数は8にリセット
    if (hoursInput) hoursInput.value = '8';

    // クリアボタンを表示
    const clearBtn = document.getElementById('quickTaskClearBtn');
    if (clearBtn) clearBtn.style.display = 'inline-block';

    // 担当者選択はリセット
    if (memberSelect) memberSelect.value = '';
    selectedMemberFilter = null;

    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.showAlert === 'function') window.showAlert('実績を追加しました', true);
}

// ============================================
// モード切り替え
// ============================================

export function switchQuickInputMode(mode) {
    setQuickInputMode(mode);

    const actualForm = document.getElementById('quickActualForm');
    const estimateForm = document.getElementById('quickEstimateForm');
    const vacationForm = document.getElementById('quickVacationForm');
    const modeTitle = document.getElementById('quickModeTitle');
    const bottomTitle = document.getElementById('quickBottomTitle');
    const actualBtn = document.getElementById('quickActualModeBtn');
    const estimateBtn = document.getElementById('quickEstimateModeBtn');
    const vacationBtn = document.getElementById('quickVacationModeBtn');
    const todayActuals = document.getElementById('todayActuals');

    // 全てのフォームとボタンをリセット
    if (actualForm) actualForm.style.display = 'none';
    if (estimateForm) estimateForm.style.display = 'none';
    if (vacationForm) vacationForm.style.display = 'none';
    if (actualBtn) actualBtn.classList.remove('active');
    if (estimateBtn) estimateBtn.classList.remove('active');
    if (vacationBtn) vacationBtn.classList.remove('active');

    if (mode === 'actual') {
        if (actualForm) actualForm.style.display = 'block';
        if (modeTitle) modeTitle.textContent = '今日の実績を入力';
        if (bottomTitle) {
            bottomTitle.textContent = '今日の入力済み実績';
            bottomTitle.style.display = 'block';
        }
        if (todayActuals) todayActuals.style.display = 'block';
        if (actualBtn) actualBtn.classList.add('active');

        // 前回の実績を自動選択
        if (typeof window.setQuickInputPreviousActual === 'function') {
            window.setQuickInputPreviousActual();
        }
    } else if (mode === 'estimate') {
        if (estimateForm) estimateForm.style.display = 'block';
        if (modeTitle) modeTitle.textContent = '新規見積登録';
        if (bottomTitle) bottomTitle.style.display = 'none';
        if (todayActuals) todayActuals.style.display = 'none';
        if (estimateBtn) estimateBtn.classList.add('active');
    } else if (mode === 'vacation') {
        if (vacationForm) vacationForm.style.display = 'block';
        if (modeTitle) modeTitle.textContent = '休暇登録';
        if (bottomTitle) bottomTitle.style.display = 'none';
        if (todayActuals) todayActuals.style.display = 'none';
        if (vacationBtn) vacationBtn.classList.add('active');

        // 休暇登録フォームの日付を今日に設定
        const today = new Date().toISOString().split('T')[0];
        const vacationDate = document.getElementById('quickVacationDate');
        if (vacationDate) vacationDate.value = today;
    }

    // 全てのセグメントボタンの色を更新
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }

    // 設定で記憶が有効な場合、localStorageに保存
    if (rememberQuickInputMode) {
        localStorage.setItem('quickInputMode', mode);
    }
}

// ============================================
// 初期化
// ============================================

export function initQuickEstimateForm() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 作業月セレクトボックスの初期化
    generateMonthOptions('quickEstStartMonth', currentMonth);
    generateMonthOptions('quickEstStartMonthMulti', currentMonth);
    generateMonthOptions('quickEstEndMonth', currentMonth);
    generateMonthOptions('quickStartMonth', currentMonth);
    generateMonthOptions('quickEndMonth', currentMonth);

    // 前回モードを記憶する設定の読み込み
    const savedRememberMode = localStorage.getItem('rememberQuickInputMode');
    setRememberQuickInputMode(savedRememberMode === 'true');

    // チェックボックスのUIに反映
    const rememberCheckbox = document.getElementById('rememberQuickInputMode');
    if (rememberCheckbox) {
        rememberCheckbox.checked = rememberQuickInputMode;
    }

    // 前回モードの復元
    if (rememberQuickInputMode) {
        const savedMode = localStorage.getItem('quickInputMode');
        if (savedMode && (savedMode === 'actual' || savedMode === 'estimate')) {
            quickInputMode = savedMode;
            switchQuickInputMode(savedMode);
        }
    }
}

// ============================================
// 外部クリックハンドラー
// ============================================

export function initQuickTaskDropdownHandler() {
    document.addEventListener('click', function (event) {
        const dropdown = document.getElementById('quickTaskDropdown');
        const searchInput = document.getElementById('quickTaskSearch');

        if (dropdown && searchInput) {
            // クリックされた要素がドロップダウンまたは検索入力欄でない場合
            if (!dropdown.contains(event.target) && event.target !== searchInput) {
                hideQuickTaskDropdown();
            }
        }
    });
}

// ============================================
// Getter/Setter（状態アクセス用）
// ============================================

export function getSelectedQuickTask() {
    return selectedQuickTask;
}

export function setSelectedQuickTask(value) {
    selectedQuickTask = value;
}

export function getQuickInputMode() {
    return quickInputMode;
}

console.log('✅ モジュール quick.js loaded');
