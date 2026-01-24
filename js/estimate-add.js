// ============================================
// 見積追加関連機能
// ============================================

import * as State from './state.js';
import * as Utils from './utils.js';
import * as Estimate from './estimate.js';
import { PROCESS } from './constants.js';

// ============================================
// 見積追加モーダル関連
// ============================================

export function openAddEstimateModal() {
    initAddEstimateForm();
    document.getElementById('addEstimateModal').style.display = 'flex';
}

export function closeAddEstimateModal() {
    document.getElementById('addEstimateModal').style.display = 'none';
    // フォームをリセット
    document.getElementById('addEstVersion').value = '';

    // 帳票名のselectとinputをリセット
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

    document.getElementById('addEnableMonthSplit').checked = false;
    toggleAddMonthSplit();
    updateAddEstimateTotals();
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
    Utils.generateMonthOptions('addStartMonth', currentMonth);
    Utils.generateMonthOptions('addEndMonth', currentMonth);

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
        // 作業月列を追加
        if (headerRow.children.length === 3) {
            const th = document.createElement('th');
            th.style.width = '150px';
            th.style.padding = '8px';
            th.textContent = '作業月';
            headerRow.appendChild(th);
        }

        bodyRows.forEach((row, index) => {
            if (row.children.length === 3) {
                const td = document.createElement('td');
                const processes = PROCESS.TYPES;
                const processName = processes[index];
                td.innerHTML = `
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <select id="addEst${processName}_startMonth" style="margin: 0; flex: 1;"></select>
                        <span>〜</span>
                        <select id="addEst${processName}_endMonth" style="margin: 0; flex: 1;"></select>
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

export function toggleAddMonthSplit() {
    const enabled = document.getElementById('addEnableMonthSplit').checked;
    const panel = document.getElementById('addMonthSplitPanel');

    if (enabled) {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
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

export function updateAddMonthPreview() {
    const startMonth = document.getElementById('addStartMonth').value;
    const endMonth = document.getElementById('addEndMonth').value;
    const totalHours = parseFloat(document.getElementById('addTotalHours').value) || 0;
    const method = document.querySelector('input[name="addSplitMethod"]:checked').value;
    const preview = document.getElementById('addMonthPreview');

    if (!startMonth || !endMonth || totalHours <= 0) {
        preview.innerHTML = '';
        return;
    }

    const months = Utils.generateMonthRange(startMonth, endMonth);
    if (months.length === 0) {
        preview.innerHTML = '';
        return;
    }

    let html = '<div style="background: #f0f0f0; padding: 10px; border-radius: 5px;">';
    html += '<strong>分割プレビュー:</strong><br>';

    if (method === 'equal') {
        const hoursPerMonth = (totalHours / months.length).toFixed(1);
        months.forEach(month => {
            html += `<div style="margin-top: 5px;">${month}: ${hoursPerMonth}h</div>`;
        });
    } else {
        months.forEach(month => {
            html += `<div style="margin-top: 5px; display: flex; align-items: center; gap: 10px;">`;
            html += `<span style="min-width: 100px;">${month}:</span>`;
            html += `<input type="number" id="addMonthHours_${month}" step="0.1" min="0" placeholder="0" style="width: 80px; padding: 4px;" oninput="checkAddMonthTotal()"> h`;
            html += `</div>`;
        });
    }

    html += '</div>';
    preview.innerHTML = html;
}

export function checkAddMonthTotal() {
    const startMonth = document.getElementById('addStartMonth').value;
    const endMonth = document.getElementById('addEndMonth').value;
    const totalHours = parseFloat(document.getElementById('addTotalHours').value) || 0;

    if (!startMonth || !endMonth) return;

    const months = Utils.generateMonthRange(startMonth, endMonth);
    let sum = 0;

    months.forEach(month => {
        const input = document.getElementById(`addMonthHours_${month}`);
        if (input) {
            sum += parseFloat(input.value) || 0;
        }
    });

    const preview = document.getElementById('addMonthPreview');
    const existingWarning = preview.querySelector('.total-warning');
    if (existingWarning) {
        existingWarning.remove();
    }

    if (Math.abs(sum - totalHours) > 0.01) {
        const warning = document.createElement('div');
        warning.className = 'total-warning';
        warning.style.cssText = 'color: #d32f2f; margin-top: 10px; font-weight: 600;';
        warning.textContent = `⚠️ 合計: ${sum.toFixed(1)}h（総工数: ${totalHours.toFixed(1)}h）`;
        preview.appendChild(warning);
    }
}

export function addEstimateFromModal() {
    const version = document.getElementById('addEstVersion').value;

    // 帳票名を取得（selectまたはinputから）
    const formNameSelect = document.getElementById('addEstFormNameSelect');
    const formNameInput = document.getElementById('addEstFormName');
    const formName = (formNameInput.style.display === 'none' ? formNameSelect.value : formNameInput.value).trim();

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
    const monthSplitEnabled = document.getElementById('addEnableMonthSplit').checked;

    if (monthSplitEnabled) {
        // 月分割モード
        const splitProcesses = [];
        processes.forEach(proc => {
            if (document.getElementById(`addSplit${proc}`).checked) {
                splitProcesses.push(proc);
            }
        });

        if (splitProcesses.length === 0) {
            alert('分割する工程を少なくとも一つ選択してください');
            return;
        }

        addEstimateFromModalWithMonthSplit(version, task, processes, splitProcesses);
    } else {
        // 通常モード
        addEstimateFromModalNormal(version, task, processes, startMonth, endMonth);
    }
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
    closeAddEstimateModal();
    Utils.showAlert('見積を登録しました', true);
}

export function addEstimateFromModalWithMonthSplit(version, task, processes, splitProcesses) {
    const startMonth = document.getElementById('addStartMonth').value;
    const endMonth = document.getElementById('addEndMonth').value;
    const totalHours = parseFloat(document.getElementById('addTotalHours').value) || 0;
    const method = document.querySelector('input[name="addSplitMethod"]:checked').value;

    if (!startMonth || !endMonth) {
        alert('作業期間を選択してください');
        return;
    }

    if (totalHours <= 0) {
        alert('総工数を入力してください');
        return;
    }

    const months = Utils.generateMonthRange(startMonth, endMonth);

    if (months.length === 0) {
        alert('有効な作業期間を選択してください');
        return;
    }

    let monthlyHours = {};

    if (method === 'equal') {
        const hoursPerMonth = totalHours / months.length;
        months.forEach(month => {
            monthlyHours[month] = hoursPerMonth;
        });
    } else {
        let total = 0;
        months.forEach(month => {
            const input = document.getElementById(`addMonthHours_${month}`);
            const hours = parseFloat(input.value) || 0;
            monthlyHours[month] = hours;
            total += hours;
        });

        if (Math.abs(total - totalHours) > 0.01) {
            alert(`月別工数の合計（${total}h）が総工数（${totalHours}h）と一致しません`);
            return;
        }
    }

    processes.forEach(proc => {
        const member = document.getElementById(`addEst${proc}_member`).value;
        const hours = parseFloat(document.getElementById(`addEst${proc}`).value) || 0;

        if (hours > 0) {
            const est = {
                id: Date.now() + Math.random(),
                version: version,
                task: task,
                process: proc,
                member: member,
                hours: totalHours,
                workMonth: startMonth,
                workMonths: months,
                monthlyHours: monthlyHours,
                createdAt: new Date().toISOString()
            };

            if (splitProcesses.includes(proc)) {
                State.estimates.push(est);
                // 見込残存時間も自動設定（総工数と同じ）
                Estimate.saveRemainingEstimate(version, task, proc, member, totalHours);
            } else {
                // 分割対象外の工程は通常通り登録
                est.hours = hours;
                est.monthlyHours = { [startMonth]: hours };
                est.workMonths = [startMonth];
                State.estimates.push(est);
                // 見込残存時間も自動設定（見積時間と同じ）
                Estimate.saveRemainingEstimate(version, task, proc, member, hours);
            }
        }
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.updateReport === 'function') window.updateReport();
    closeAddEstimateModal();
    Utils.showAlert('見積を登録しました', true);
}

console.log('✅ モジュール estimate-add.js loaded');
