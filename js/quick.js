// ============================================
// クイック入力関連機能
// ============================================

import {
    estimates, actuals,
    quickInputMode, setQuickInputMode,
    rememberQuickInputMode, setRememberQuickInputMode
} from './state.js';
import { generateMonthOptions, generateMonthRange, showAlert, sortMembers } from './utils.js';
import * as Utils from './utils.js';
import * as Estimate from './estimate.js';
import { PROCESS } from './constants.js';

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
    const memberOrderInput = document.getElementById('memberOrder');
    const memberOrderValue = memberOrderInput ? memberOrderInput.value.trim() : '';
    const sortedMembers = sortMembers(members, memberOrderValue);

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

    // クイック入力の作業日に今日の日付を設定
    const today = now.toISOString().split('T')[0];
    const workDateInput = document.getElementById('quickWorkDate');
    if (workDateInput) {
        workDateInput.value = today;
    }

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

export function saveQuickInputModeSetting() {
    const checkbox = document.getElementById('rememberQuickInputMode');
    if (checkbox) {
        setRememberQuickInputMode(checkbox.checked);
        localStorage.setItem('rememberQuickInputMode', checkbox.checked);

        // オフにした場合は保存されたモードを削除
        if (!checkbox.checked) {
            localStorage.removeItem('quickInputMode');
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

// ============================================
// 見積簡易登録 (復活)
// ============================================

export function updateQuickEstWorkMonthUI() {
    const monthType = document.querySelector('input[name="quickEstMonthType"]:checked')?.value || 'single';
    if (monthType === 'single') return;

    const startMonthMulti = document.getElementById('quickEstStartMonthMulti');
    const endMonth = document.getElementById('quickEstEndMonth');

    if (!startMonthMulti || !endMonth) return;
    if (!startMonthMulti.value) return;

    // 工程別のデフォルト作業月を更新
    if (endMonth.value && startMonthMulti.value && endMonth.value !== startMonthMulti.value) {
        updateDefaultQuickProcessMonths(startMonthMulti.value, endMonth.value);
    } else if (endMonth.value === startMonthMulti.value) {
        updateDefaultQuickProcessMonths(startMonthMulti.value, endMonth.value);
    }
}

export function switchQuickEstMonthType() {
    const monthType = document.querySelector('input[name="quickEstMonthType"]:checked').value;
    const singleMonthInput = document.getElementById('quickEstSingleMonthInput');
    const multiMonthInput = document.getElementById('quickEstMultiMonthInput');

    if (monthType === 'single') {
        singleMonthInput.style.display = 'block';
        multiMonthInput.style.display = 'none';
        updateQuickEstimateTableHeader(false);
    } else {
        singleMonthInput.style.display = 'none';
        multiMonthInput.style.display = 'block';

        // 複数月モードの場合、開始月と終了月を同期
        const startMonth = document.getElementById('quickEstStartMonth').value;
        const startMonthMulti = document.getElementById('quickEstStartMonthMulti');
        const endMonth = document.getElementById('quickEstEndMonth');

        if (startMonth && startMonthMulti) {
            startMonthMulti.value = startMonth;
            // 終了月の選択肢を開始月より後の月のみに更新
            const currentEndValue = endMonth ? endMonth.value : '';
            generateMonthOptions('quickEstEndMonth', currentEndValue, startMonth);
            if (endMonth && !endMonth.value) {
                endMonth.value = startMonth;
            }
        }

        // テーブルに作業月列を追加（内部で選択肢も設定される）
        updateQuickEstimateTableHeader(true);
    }
}

export function updateQuickEstimateTotals() {
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    let totalHours = 0;

    processes.forEach(proc => {
        const hours = parseFloat(document.getElementById(`quickEst${proc}`).value) || 0;
        totalHours += hours;
    });

    const totalDays = (totalHours / 8).toFixed(1);
    const totalMonths = (totalHours / 160).toFixed(2);

    document.getElementById('quickEstTotalHours').textContent = totalHours.toFixed(1);
    document.getElementById('quickEstTotalDays').textContent = totalDays;
    document.getElementById('quickEstTotalMonths').textContent = totalMonths;

    // updateQuickMonthPreview(); // Split logic update
}

// 工程表のヘッダーと作業月列を更新（クイック入力用）
export function updateQuickEstimateTableHeader(showWorkMonthColumn) {
    const table = document.getElementById('quickEstimateTable');
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

        const processes = PROCESS.TYPES;
        bodyRows.forEach((row, index) => {
            if (row.children.length === 3) {
                const td = document.createElement('td');
                td.style.overflow = 'hidden';
                const processName = processes[index];
                const selStyle = isMobile
                    ? 'margin: 0; flex: 1; min-width: 0; max-width: 100%; box-sizing: border-box; font-size: 13px;'
                    : 'margin: 0; flex: 1;';
                td.innerHTML = `
                    <div style="display: flex; gap: ${isMobile ? '2px' : '5px'}; align-items: center;">
                        <select id="quickEst${processName}_startMonth" style="${selStyle}"></select>
                        <span style="font-size: ${isMobile ? '11px' : '14px'};">〜</span>
                        <select id="quickEst${processName}_endMonth" style="${selStyle}"></select>
                    </div>
                `;
                row.appendChild(td);
            }
        });

        // DOM更新後に選択肢を設定
        setTimeout(() => {
            const startMonthMulti = document.getElementById('quickEstStartMonthMulti');
            const endMonth = document.getElementById('quickEstEndMonth');
            if (startMonthMulti && endMonth && startMonthMulti.value && endMonth.value) {
                updateDefaultQuickProcessMonths(startMonthMulti.value, endMonth.value);
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

// 各工程のデフォルト作業月を設定（クイック入力用）
export function updateDefaultQuickProcessMonths(startMonth, endMonth) {
    const defaults = Estimate.calculateDefaultWorkMonths(startMonth, endMonth);
    const months = Utils.generateMonthRange(startMonth, endMonth);

    defaults.forEach(item => {
        const startSelect = document.getElementById(`quickEst${item.process}_startMonth`);
        const endSelect = document.getElementById(`quickEst${item.process}_endMonth`);

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

export function addQuickEstimate() {
    const version = document.getElementById('quickEstVersion').value;
    const formNameSelect = document.getElementById('quickEstFormNameSelect');
    const formNameInput = document.getElementById('quickEstFormName');
    const formName = (formNameInput.style.display === 'none' ? formNameSelect.value : formNameInput.value).trim();
    const taskName = document.getElementById('quickEstTask').value.trim();

    if (!version || !formName || !taskName) {
        alert('必須項目を入力してください');
        return;
    }

    const task = `${formName}：${taskName}`;
    const processes = PROCESS.TYPES;

    // 作業月の決定
    const monthType = document.querySelector('input[name="quickEstMonthType"]:checked').value;
    let startMonth, endMonth;
    if (monthType === 'single') {
        startMonth = document.getElementById('quickEstStartMonth').value;
        endMonth = null;
    } else {
        startMonth = document.getElementById('quickEstStartMonthMulti').value;
        endMonth = document.getElementById('quickEstEndMonth').value;
    }

    if (!startMonth) {
        alert('作業月を選択してください');
        return;
    }

    const isSingleMonth = !endMonth || startMonth === endMonth;

    processes.forEach(proc => {
        const member = document.getElementById(`quickEst${proc}_member`).value;
        const hours = parseFloat(document.getElementById(`quickEst${proc}`).value) || 0;

        if (hours > 0) {
            let workMonths, monthlyHours, workMonth;

            if (isSingleMonth) {
                // 単一月モード
                workMonth = startMonth;
                workMonths = [startMonth];
                monthlyHours = { [startMonth]: hours };
            } else {
                // 複数月モード: 各工程の作業月を取得
                const procStartMonth = document.getElementById(`quickEst${proc}_startMonth`)?.value;
                const procEndMonth = document.getElementById(`quickEst${proc}_endMonth`)?.value;

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

            estimates.push(est);
            Estimate.saveRemainingEstimate(version, task, proc, member, hours);
        }
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();

    // Reset form
    document.getElementById('quickEstTask').value = '';
    processes.forEach(proc => {
        document.getElementById(`quickEst${proc}`).value = '';
    });
    updateQuickEstimateTotals();

    showAlert('見積を簡易登録しました', true);
}

export function handleQuickFormNameChange() {
    const startMonth = document.getElementById('quickEstStartMonth');
    // logic placeholder
}

export function autoFillMember(changedFieldId) {
    // Reuse logic from estimate-add? Or copy it?
    // Copy simplified version
    const match = changedFieldId.match(/^quickEst(\w+)_member$/);
    if (!match) return;
    const process = match[1];
    const val = document.getElementById(changedFieldId).value;

    let target = null;
    if (process === 'PG') target = 'PT';
    else if (process === 'PT') target = 'PG';
    else if (process === 'IT') target = 'ST';
    else if (process === 'ST') target = 'IT';

    if (target) {
        const targetEl = document.getElementById(`quickEst${target}_member`);
        if (targetEl && !targetEl.value) targetEl.value = val;
    }
}

console.log('✅ モジュール quick.js loaded');
