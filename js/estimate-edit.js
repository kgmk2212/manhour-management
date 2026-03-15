// ============================================
// 見積編集・対応名編集関連機能
// ============================================

import {
    estimates, actuals, remainingEstimates, schedules
} from './state.js';
import { pushAction } from './history.js';

import {
    normalizeEstimate,
    generateMonthRange,
    generateMonthOptions,
    showAlert
} from './utils.js';

import { saveRemainingEstimate, deleteRemainingEstimate, renderEstimateList, isOtherWork } from './estimate.js';
import { updateSchedule, calculateEndDate, showToast } from './schedule.js';

// ============================================
// 見積編集
// ============================================

/**
 * 見積編集モーダルを開く
 */
export function editEstimate(id) {
    const estimate = estimates.find(e => e.id === id);
    if (!estimate) {
        alert('データが見つかりません');
        return;
    }

    const isOther = isOtherWork(estimate);

    document.getElementById('editEstimateId').value = id;
    document.getElementById('editEstimateVersion').value = estimate.version;
    document.getElementById('editEstimateTaskSearch').value = estimate.task;
    document.getElementById('editEstimateProcess').value = estimate.process;
    document.getElementById('editEstimateHours').value = estimate.hours;

    // その他工数の場合、版数・工程フィールドを非表示
    const versionGroup = document.getElementById('editEstimateVersion').closest('.form-group');
    const processGroup = document.getElementById('editEstimateProcess').closest('.form-group');
    if (versionGroup) versionGroup.style.display = isOther ? 'none' : '';
    if (processGroup) processGroup.style.display = isOther ? 'none' : '';

    const taskDatalist = document.getElementById('editEstimateTaskList');
    taskDatalist.innerHTML = '';
    const uniqueTasks = [...new Set([...estimates.map(e => e.task), ...actuals.map(a => a.task)])];
    uniqueTasks.sort().forEach(task => {
        const option = document.createElement('option');
        option.value = task;
        taskDatalist.appendChild(option);
    });

    const memberSelect = document.getElementById('editEstimateMember');
    const allMembers = new Set();
    estimates.forEach(e => allMembers.add(e.member));
    actuals.forEach(a => allMembers.add(a.member));

    let sortedMembers;
    const memberOrderInput = document.getElementById('memberOrder').value.trim();
    if (memberOrderInput) {
        const orderList = memberOrderInput.split(',').map(m => m.trim()).filter(m => m);
        const orderedMembers = [];
        const unorderedMembers = [];

        orderList.forEach(name => {
            if (allMembers.has(name)) {
                orderedMembers.push(name);
            }
        });

        Array.from(allMembers).forEach(m => {
            if (!orderedMembers.includes(m)) {
                unorderedMembers.push(m);
            }
        });

        sortedMembers = [...orderedMembers, ...unorderedMembers.sort()];
    } else {
        sortedMembers = Array.from(allMembers).sort();
    }

    memberSelect.innerHTML = '';
    sortedMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        memberSelect.appendChild(option);
    });

    memberSelect.value = estimate.member;

    // 追加担当者行をクリア
    clearEditExtraMembers();

    // memberOptionsのHTMLを保持（追加行で再利用）
    window._editEstMemberOptionsHTML = memberSelect.innerHTML;

    generateMonthOptions('editEstimateWorkMonth', estimate.workMonth || '');
    const workMonthSelect = document.getElementById('editEstimateWorkMonth');
    workMonthSelect.insertAdjacentHTML('afterbegin', '<option value="">-- 作業月を選択 --</option>');
    workMonthSelect.value = estimate.workMonth || '';

    const est = normalizeEstimate(estimate);
    if (est.workMonths && est.workMonths.length > 1) {
        document.querySelector('input[name="editWorkMonthMode"][value="multi"]').checked = true;
        toggleEditWorkMonthMode();
        generateMonthOptions('editStartMonth', est.workMonths[0]);
        generateMonthOptions('editEndMonth', est.workMonths[est.workMonths.length - 1]);
        document.getElementById('editStartMonth').value = est.workMonths[0];
        document.getElementById('editEndMonth').value = est.workMonths[est.workMonths.length - 1];

        if (est.monthlyHours && Object.keys(est.monthlyHours).length > 0) {
            document.querySelector('input[name="editSplitMethod"][value="manual"]').checked = true;
        }

        updateEditMonthPreview();
    } else {
        document.querySelector('input[name="editWorkMonthMode"][value="single"]').checked = true;
        toggleEditWorkMonthMode();
    }

    document.getElementById('editEstimateModal').style.display = 'flex';
}

/**
 * 見積編集モーダルを閉じる
 */
export function closeEditEstimateModal() {
    document.getElementById('editEstimateModal').style.display = 'none';
}

/**
 * 見積編集を保存
 */
export function saveEstimateEdit() {
    const id = parseFloat(document.getElementById('editEstimateId').value);
    const task = document.getElementById('editEstimateTaskSearch').value;
    const member = document.getElementById('editEstimateMember').value;
    const hours = parseFloat(document.getElementById('editEstimateHours').value);
    const mode = document.querySelector('input[name="editWorkMonthMode"]:checked').value;

    // その他工数の場合、版数・工程は元の値を維持
    const originalEstimate = estimates.find(e => e.id === id);
    const isOther = originalEstimate && isOtherWork(originalEstimate);
    const version = isOther ? (originalEstimate.version || '') : document.getElementById('editEstimateVersion').value;
    const process = isOther ? (originalEstimate.process || '') : document.getElementById('editEstimateProcess').value;

    if (!task || !member || !hours) {
        alert('すべての項目を入力してください');
        return;
    }

    if (!isOther && (!version || !process)) {
        alert('版数と工程を入力してください');
        return;
    }

    const estimateIndex = estimates.findIndex(e => e.id === id);
    if (estimateIndex === -1) {
        showAlert('データの更新に失敗しました', false);
        return;
    }

    let workMonth = '';
    let workMonths = [];
    let monthlyHours = {};

    if (mode === 'single') {
        workMonth = document.getElementById('editEstimateWorkMonth').value;
        if (workMonth) {
            workMonths = [workMonth];
            monthlyHours = { [workMonth]: hours };
        }
    } else {
        const startMonth = document.getElementById('editStartMonth').value;
        const endMonth = document.getElementById('editEndMonth').value;
        const method = document.querySelector('input[name="editSplitMethod"]:checked').value;

        if (!startMonth || !endMonth) {
            alert('作業期間を正しく設定してください');
            return;
        }

        if (startMonth > endMonth) {
            alert('開始月は終了月より前にしてください');
            return;
        }

        const months = generateMonthRange(startMonth, endMonth);
        workMonth = startMonth;
        workMonths = months;

        if (method === 'equal') {
            const hoursPerMonth = hours / months.length;
            months.forEach(month => {
                monthlyHours[month] = hoursPerMonth;
            });
        } else {
            let total = 0;
            months.forEach((month, index) => {
                const input = document.getElementById(`editMonthHours_${index}`);
                const monthHours = input ? parseFloat(input.value) || 0 : 0;
                monthlyHours[month] = monthHours;
                total += monthHours;
            });

            if (Math.abs(total - hours) > 0.01) {
                alert(`月別工数の合計(${total.toFixed(1)}h)が総工数(${hours}h)と一致しません`);
                return;
            }
        }
    }

    const oldEstimate = { ...estimates[estimateIndex] };

    // キー項目（version/task/process/member）が変更されたかチェック
    const keyChanged = 
        oldEstimate.version !== version ||
        oldEstimate.task !== task ||
        oldEstimate.process !== process ||
        oldEstimate.member !== member;

    estimates[estimateIndex] = {
        ...estimates[estimateIndex],
        version: version,
        task: task,
        process: process,
        member: member,
        hours: hours,
        workMonth: workMonth,
        workMonths: workMonths,
        monthlyHours: monthlyHours
    };

    // キー項目が変更された場合、旧データの見込み残存を削除
    if (keyChanged) {
        deleteRemainingEstimate(
            oldEstimate.version,
            oldEstimate.task,
            oldEstimate.process,
            oldEstimate.member
        );
    }

    // タスク工程レベルで残存を取得
    const existingRemaining = remainingEstimates.find(r =>
        r.version === version &&
        r.task === task &&
        r.process === process
    );

    let remainingAdjusted = false;
    let oldRemainingHours = null;
    let newRemainingHours = null;

    if (!existingRemaining) {
        // 見込み残存が未設定 → タスク工程レベルの見積合計で作成
        const totalEstHours = estimates
            .filter(e => e.version === version && e.task === task && e.process === process)
            .reduce((sum, e) => sum + e.hours, 0);
        saveRemainingEstimate(version, task, process, member, totalEstHours);
    } else if (oldEstimate.hours && oldEstimate.hours !== hours) {
        // 見積時間が変更された → タスク工程レベルの残存を差分調整
        oldRemainingHours = existingRemaining.remainingHours;
        const hoursDiff = hours - oldEstimate.hours;
        newRemainingHours = Math.max(0, Math.round((oldRemainingHours + hoursDiff) * 10) / 10);
        saveRemainingEstimate(version, task, process, member, newRemainingHours);
        remainingAdjusted = true;
    }

    // スケジュール連動: 旧キーで対応するスケジュールを検索し自動更新
    const relatedSchedule = schedules.find(s =>
        s.version === oldEstimate.version &&
        s.task === oldEstimate.task &&
        s.process === oldEstimate.process &&
        s.member === oldEstimate.member
    );

    let scheduleToastMsg = '';
    if (relatedSchedule) {
        const newEndDate = calculateEndDate(relatedSchedule.startDate, hours, member);
        const updates = { estimatedHours: hours, endDate: newEndDate };
        if (keyChanged) {
            updates.version = version;
            updates.task = task;
            updates.process = process;
            updates.member = member;
        }
        updateSchedule(relatedSchedule.id, updates);
        // saveDataはupdateSchedule内で呼ばれる

        if (keyChanged) {
            scheduleToastMsg = `スケジュールも更新しました（終了日: ${newEndDate}）`;
        } else if (relatedSchedule.estimatedHours !== hours) {
            scheduleToastMsg = `見積工数の変更に伴い、スケジュールの終了日を ${newEndDate} に更新しました`;
        }
    }

    pushAction({
        type: 'estimate_edit',
        description: `見積編集: ${task} (${process || 'その他'})`,
        data: { before: oldEstimate, after: { ...estimates[estimateIndex] } }
    });

    // 追加担当者行を新規見積レコードとして作成
    const extraMembers = collectEditExtraMembers();
    const newEstimates = [];
    extraMembers.forEach((entry, i) => {
        const newEst = {
            id: Date.now() + i + Math.random(),
            version: version,
            task: task,
            process: process,
            member: entry.member,
            hours: entry.hours,
            workMonth: workMonth,
            workMonths: workMonths.length > 0 ? [...workMonths] : [],
            monthlyHours: { ...monthlyHours }
        };
        // 複数月分割の場合、追加担当者の工数比で按分
        if (workMonths.length > 1 && Object.keys(monthlyHours).length > 0) {
            const ratio = entry.hours / hours;
            const adjustedMonthlyHours = {};
            workMonths.forEach(m => {
                adjustedMonthlyHours[m] = Math.round((monthlyHours[m] || 0) * ratio * 10) / 10;
            });
            newEst.monthlyHours = adjustedMonthlyHours;
        } else if (workMonth) {
            newEst.monthlyHours = { [workMonth]: entry.hours };
        }
        estimates.push(newEst);
        newEstimates.push(newEst);

        // 見込み残存を設定
        saveRemainingEstimate(version, task, process, entry.member, entry.hours);
    });

    if (newEstimates.length > 0) {
        pushAction({
            type: 'estimate_add_batch',
            description: `見積追加(編集時): ${task} (${process || 'その他'}) × ${newEstimates.length}件`,
            data: { added: newEstimates.map(e => ({ ...e })) }
        });
    }

    if (!relatedSchedule) {
        if (typeof window.saveData === 'function') window.saveData();
    }

    closeEditEstimateModal();

    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
    renderEstimateList();
    if (typeof window.updateReport === 'function') window.updateReport();

    if (scheduleToastMsg) {
        showToast(scheduleToastMsg, 'info', 5000);
    }
    if (remainingAdjusted) {
        showToast(`見込み残存時間を ${oldRemainingHours}h → ${newRemainingHours}h に調整しました`, 'info', 5000);
    }

    const mainMsg = newEstimates.length > 0
        ? `見積データを更新しました（+ ${newEstimates.length}件の担当者を追加）`
        : '見積データを更新しました';
    showAlert(mainMsg, true);
}

/**
 * 作業月モードの切り替え
 */
export function toggleEditWorkMonthMode() {
    const mode = document.querySelector('input[name="editWorkMonthMode"]:checked').value;
    const singleSection = document.getElementById('editSingleMonthSection');
    const multiSection = document.getElementById('editMultiMonthSection');

    if (mode === 'single') {
        singleSection.style.display = 'block';
        multiSection.style.display = 'none';
    } else {
        singleSection.style.display = 'none';
        multiSection.style.display = 'block';

        const singleMonthValue = document.getElementById('editEstimateWorkMonth').value;
        let defaultMonth;
        if (singleMonthValue) {
            defaultMonth = singleMonthValue;
        } else {
            const now = new Date();
            defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        generateMonthOptions('editStartMonth', defaultMonth);
        generateMonthOptions('editEndMonth', defaultMonth);

        updateEditMonthPreview();
    }
}

/**
 * 編集モーダルの月別プレビュー更新
 */
export function updateEditMonthPreview() {
    const totalHours = parseFloat(document.getElementById('editEstimateHours').value) || 0;
    const startMonth = document.getElementById('editStartMonth').value;
    const endMonth = document.getElementById('editEndMonth').value;
    const method = document.querySelector('input[name="editSplitMethod"]:checked').value;
    const preview = document.getElementById('editMonthPreview');

    if (!startMonth || !endMonth || totalHours <= 0) {
        preview.innerHTML = '<p style="color: #999; font-size: 14px;">総工数と作業期間を入力してください</p>';
        return;
    }

    if (startMonth > endMonth) {
        preview.innerHTML = '<p style="color: #e74c3c; font-size: 14px;">⚠️ 開始月は終了月より前にしてください</p>';
        return;
    }

    const months = generateMonthRange(startMonth, endMonth);

    const estimateId = parseFloat(document.getElementById('editEstimateId').value);
    const currentEstimate = estimates.find(e => e.id === estimateId);
    const normalizedEstimate = normalizeEstimate(currentEstimate);
    const savedMonthlyHours = normalizedEstimate && normalizedEstimate.monthlyHours ? normalizedEstimate.monthlyHours : {};

    // 既存のDOM入力フィールドから編集中の値を取得（再生成時に値が失われないようにする）
    const editedMonthlyHours = {};
    months.forEach((month, index) => {
        const input = document.getElementById(`editMonthHours_${index}`);
        if (input) {
            editedMonthlyHours[month] = parseFloat(input.value) || 0;
        }
    });
    const hasEditedValues = Object.keys(editedMonthlyHours).length > 0;
    const currentMonthlyHours = hasEditedValues ? editedMonthlyHours : savedMonthlyHours;

    let html = '<div style="background: white; padding: 15px; border-radius: 5px; border: 1px solid var(--accent); max-height: 300px; overflow-y: auto;">';
    html += '<strong style="color: var(--text-primary);">📋 月別工数</strong><br>';
    html += '<div style="margin-top: 10px;">';

    if (method === 'equal') {
        const hoursPerMonth = (totalHours / months.length).toFixed(1);
        months.forEach(month => {
            const [y, m] = month.split('-');
            html += `<div style="padding: 5px 0; border-bottom: 1px solid #eee;">`;
            html += `${y}年${parseInt(m)}月: <strong>${hoursPerMonth}h</strong>`;
            html += `</div>`;
        });
        html += `<div style="margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--accent); font-weight: 600;">`;
        html += `合計: ${totalHours}h (${months.length}ヶ月)`;
        html += `</div>`;
    } else {
        let calculatedTotal = 0;
        months.forEach((month, index) => {
            const [y, m] = month.split('-');
            const existingHours = currentMonthlyHours[month] !== undefined ? currentMonthlyHours[month] : 0;
            calculatedTotal += existingHours;
            html += `<div style="padding: 5px 0; display: flex; align-items: center; gap: 10px;">`;
            html += `<label style="flex: 1;">${y}年${parseInt(m)}月:</label>`;
            html += `<input type="number" id="editMonthHours_${index}" value="${existingHours}" step="0.1" min="0" `;
            html += `onchange="updateEditManualTotal()" style="width: 100px; padding: 5px; border: 1px solid #ccc; border-radius: 4px;"> h`;
            html += `</div>`;
        });

        html += `<div id="editManualTotal" style="margin-top: 10px; padding-top: 10px; border-top: 2px solid var(--accent); font-weight: 600;">`;
        const isMatch = Math.abs(calculatedTotal - totalHours) < 0.01;
        const color = isMatch ? '#27ae60' : '#e74c3c';
        html += `合計: <span style="color: ${color};">${calculatedTotal.toFixed(1)}h</span> / 目標: ${totalHours}h`;
        html += `</div>`;
    }

    html += '</div></div>';
    preview.innerHTML = html;
}

/**
 * 手動設定の合計更新
 */
export function updateEditManualTotal() {
    const totalHours = parseFloat(document.getElementById('editEstimateHours').value) || 0;
    const startMonth = document.getElementById('editStartMonth').value;
    const endMonth = document.getElementById('editEndMonth').value;

    if (!startMonth || !endMonth) return;

    const months = generateMonthRange(startMonth, endMonth);
    let total = 0;

    months.forEach((month, index) => {
        const input = document.getElementById(`editMonthHours_${index}`);
        if (input) {
            total += parseFloat(input.value) || 0;
        }
    });

    const totalDiv = document.getElementById('editManualTotal');
    if (totalDiv) {
        const diff = total - totalHours;
        const color = Math.abs(diff) < 0.01 ? '#27ae60' : (diff > 0 ? '#e74c3c' : '#f39c12');
        totalDiv.innerHTML = `合計: <span style="color: ${color};">${total.toFixed(1)}h</span> / 目標: ${totalHours}h`;

        if (Math.abs(diff) < 0.01) {
            totalDiv.innerHTML += ' <span style="color: #27ae60;">✓</span>';
        } else if (diff > 0) {
            totalDiv.innerHTML += ` <span style="color: #e74c3c;">(+${diff.toFixed(1)}h 超過)</span>`;
        } else {
            totalDiv.innerHTML += ` <span style="color: #f39c12;">(${diff.toFixed(1)}h 不足)</span>`;
        }
    }
}

// ============================================
// 編集モーダル 担当者追加
// ============================================

/**
 * 編集モーダルに追加担当者行を追加
 */
export function addEditEstimateMemberRow() {
    const container = document.getElementById('editEstExtraMembers');
    if (!container) return;

    const idx = container.children.length;
    const row = document.createElement('div');
    row.className = 'edit-est-member-row edit-est-member-extra';
    row.dataset.extraIndex = idx;

    const memberOptions = window._editEstMemberOptionsHTML || '';
    row.innerHTML = `
        <select class="edit-est-extra-member">${memberOptions}</select>
        <div class="edit-est-hours-input">
            <input type="number" class="edit-est-extra-hours" step="0.5" min="0" placeholder="h">
            <span class="edit-est-hours-unit">h</span>
        </div>
        <div class="edit-est-row-action">
            <button type="button" class="edit-est-remove-btn" onclick="removeEditEstimateMemberRow(this)" title="この行を削除">&times;</button>
        </div>
    `;

    container.appendChild(row);
}

/**
 * 追加担当者行を削除
 */
export function removeEditEstimateMemberRow(btn) {
    const row = btn.closest('.edit-est-member-extra');
    if (row) row.remove();
}

/**
 * 追加担当者行をすべてクリア
 */
export function clearEditExtraMembers() {
    const container = document.getElementById('editEstExtraMembers');
    if (container) container.innerHTML = '';
}

/**
 * 追加担当者行のデータを収集
 * @returns {Array<{member: string, hours: number}>}
 */
function collectEditExtraMembers() {
    const container = document.getElementById('editEstExtraMembers');
    if (!container) return [];

    const entries = [];
    container.querySelectorAll('.edit-est-member-extra').forEach(row => {
        const member = row.querySelector('.edit-est-extra-member')?.value;
        const hours = parseFloat(row.querySelector('.edit-est-extra-hours')?.value) || 0;
        if (member && hours > 0) {
            entries.push({ member, hours });
        }
    });
    return entries;
}

// ============================================
// 対応名編集
// ============================================

/**
 * 対応名をクリックして編集
 */
export function editTask(version, taskName) {
    document.getElementById('editTaskOldVersion').value = version;
    document.getElementById('editTaskOldName').value = taskName;

    const versionSelect = document.getElementById('editTaskVersion');
    const versions = [...new Set(estimates.map(e => e.version))].sort();
    versionSelect.innerHTML = '<option value="">-- 版数を選択 --</option>';
    const newOption = document.createElement('option');
    newOption.value = '__new__';
    newOption.textContent = '+ 新しい版数を追加...';
    versionSelect.appendChild(newOption);
    versions.forEach(v => {
        const option = document.createElement('option');
        option.value = v;
        option.textContent = v;
        versionSelect.appendChild(option);
    });
    versionSelect.value = version;
    versionSelect.style.display = 'block';
    const versionInput = document.getElementById('editTaskVersionInput');
    if (versionInput) {
        versionInput.style.display = 'none';
        versionInput.value = '';
    }

    let formName = '';
    let task = '';
    if (taskName.includes('：')) {
        const parts = taskName.split('：');
        formName = parts[0];
        task = parts.slice(1).join('：');
    } else if (taskName.includes('_')) {
        const parts = taskName.split('_');
        formName = parts[0];
        task = parts.slice(1).join('_');
    } else {
        task = taskName;
    }

    const formNameSelect = document.getElementById('editTaskFormNameSelect');
    const formNameInput = document.getElementById('editTaskFormName');

    let formNameExists = false;
    for (let i = 0; i < formNameSelect.options.length; i++) {
        if (formNameSelect.options[i].value === formName) {
            formNameExists = true;
            break;
        }
    }

    const editTaskFormNameWrap = document.getElementById('editTaskFormNameInputWrap');
    if (formNameExists) {
        formNameSelect.value = formName;
        formNameSelect.style.display = 'block';
        if (editTaskFormNameWrap) editTaskFormNameWrap.style.display = 'none';
        formNameInput.value = formName;
    } else {
        formNameSelect.value = '__new__';
        formNameSelect.style.display = 'none';
        if (editTaskFormNameWrap) editTaskFormNameWrap.style.display = 'flex';
        formNameInput.value = formName;
    }

    document.getElementById('editTaskName').value = task;

    document.getElementById('editTaskModal').style.display = 'flex';
}

/**
 * 対応名編集モーダルを閉じる
 */
export function closeEditTaskModal() {
    document.getElementById('editTaskModal').style.display = 'none';
}

/**
 * 対応名編集を保存
 */
export function saveTaskEdit() {
    const oldVersion = document.getElementById('editTaskOldVersion').value;
    const oldTaskName = document.getElementById('editTaskOldName').value;
    const versionSelect = document.getElementById('editTaskVersion');
    const versionInput = document.getElementById('editTaskVersionInput');
    const newVersion = (versionInput && versionInput.style.display !== 'none' ? versionInput.value : versionSelect.value).trim();

    const formNameSelect = document.getElementById('editTaskFormNameSelect');
    const formNameInput = document.getElementById('editTaskFormName');
    const formName = (formNameSelect.style.display !== 'none' ? formNameSelect.value : formNameInput.value).trim();

    const taskName = document.getElementById('editTaskName').value.trim();

    if (!newVersion || !formName || !taskName) {
        alert('すべての項目を入力してください');
        return;
    }

    const newTaskName = `${formName}：${taskName}`;

    if (oldVersion === newVersion && oldTaskName === newTaskName) {
        alert('版数と対応名が変更されていません');
        return;
    }

    // Undo用: 変更前のスナップショット
    const beforeEstimates = estimates.filter(e => e.version === oldVersion && e.task === oldTaskName).map(e => ({ ...e }));
    const beforeActuals = actuals.filter(a => a.version === oldVersion && a.task === oldTaskName).map(a => ({ ...a }));

    let updatedCount = 0;
    estimates.forEach((est, index) => {
        if (est.version === oldVersion && est.task === oldTaskName) {
            estimates[index] = {
                ...est,
                version: newVersion,
                task: newTaskName
            };
            updatedCount++;
        }
    });

    let actualUpdateCount = 0;
    actuals.forEach((act, index) => {
        if (act.version === oldVersion && act.task === oldTaskName) {
            actuals[index] = {
                ...act,
                version: newVersion,
                task: newTaskName
            };
            actualUpdateCount++;
        }
    });

    // スケジュール連動: 同じ版数・対応名のスケジュールも更新
    let scheduleUpdateCount = 0;
    schedules.forEach(s => {
        if (s.version === oldVersion && s.task === oldTaskName) {
            updateSchedule(s.id, { version: newVersion, task: newTaskName });
            scheduleUpdateCount++;
        }
    });

    if (updatedCount > 0) {
        const afterEstimates = estimates.filter(e => e.version === newVersion && e.task === newTaskName).map(e => ({ ...e }));
        const afterActuals = actuals.filter(a => a.version === newVersion && a.task === newTaskName).map(a => ({ ...a }));
        pushAction({
            type: 'task_edit',
            description: `対応名変更: ${oldTaskName} → ${newTaskName}`,
            data: { beforeEstimates, afterEstimates, beforeActuals, afterActuals }
        });

        // updateSchedule内でsaveDataが呼ばれるが、スケジュールがない場合も保存
        if (scheduleUpdateCount === 0 && typeof window.saveData === 'function') window.saveData();
        closeEditTaskModal();

        if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
        if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
        renderEstimateList();
        if (typeof window.updateReport === 'function') window.updateReport();

        let message = `${updatedCount}件の見積データを変更しました`;
        if (actualUpdateCount > 0) {
            message += `\n${actualUpdateCount}件の実績データも変更しました`;
        }
        if (scheduleUpdateCount > 0) {
            message += `\n${scheduleUpdateCount}件のスケジュールデータも変更しました`;
        }
        alert(message);
    } else {
        alert('変更対象のデータが見つかりませんでした');
    }
}

// ============================================
console.log('✅ モジュール estimate-edit.js loaded');
