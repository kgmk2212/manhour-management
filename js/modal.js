// ============================================
// モーダル関連機能（工程内訳・残存時間）
// ============================================

import * as State from './state.js';
import * as Estimate from './estimate.js';
import { formatHours, escapeHtml } from './utils.js';
import { pushAction } from './history.js';

// ============================================
// 工程内訳モーダル
// ============================================

// 工程内訳モーダルを表示
export function showProcessBreakdown(version, task, process, filteredActuals, filteredEstimates) {
    const modal = document.getElementById('processBreakdownModal');
    const title = document.getElementById('breakdownModalTitle');
    const content = document.getElementById('breakdownModalContent');

    if (!modal || !title || !content) {
        console.error('工程内訳モーダルの要素が見つかりません');
        return;
    }

    // タイトルを設定
    title.textContent = `担当者別内訳`;

    // 担当者別にデータを集計
    const memberData = {};

    // 見積データを集計
    filteredEstimates.forEach(e => {
        if (e.version === version && e.task === task && e.process === process) {
            if (!memberData[e.member]) {
                memberData[e.member] = { estimate: 0, actual: 0 };
            }
            memberData[e.member].estimate += e.hours;
        }
    });

    // 実績データを集計
    filteredActuals.forEach(a => {
        if (a.version === version && a.task === task && a.process === process) {
            if (!memberData[a.member]) {
                memberData[a.member] = { estimate: 0, actual: 0 };
            }
            memberData[a.member].actual += a.hours;
        }
    });

    // 担当者が複数いる場合のみ内訳を表示
    const members = Object.keys(memberData);
    if (members.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: #999;">データがありません</p>';
        modal.style.display = 'flex';
        return;
    }

    if (members.length === 1) {
        content.innerHTML = '<p style="text-align: center; color: #999;">この工程は1人が担当しています</p>';
        modal.style.display = 'flex';
        return;
    }

    // 合計値を計算
    let totalEst = 0;
    let totalAct = 0;
    members.forEach(member => {
        const data = memberData[member];
        totalEst += data.estimate;
        totalAct += data.actual;
    });

    // HTMLを生成（情報ヘッダー + テーブル）
    let html = '<div style="display: flex; flex-direction: column; gap: 16px;">';

    // 工程情報ヘッダー
    html += `<div style="background: var(--surface-elevated, #f8f9fa); padding: 10px 14px; border-radius: 6px; font-size: 13px; color: #555;">`;
    html += `<span style="font-weight: 600;">${escapeHtml(version)}</span>`;
    html += ` / ${escapeHtml(task)}`;
    html += ` / <span style="color: #1976d2;">${escapeHtml(process)}</span>`;
    html += `</div>`;

    // テーブルを生成（時間ベースの表示）
    html += '<div class="table-wrapper"><table>';
    html += '<tr><th>担当者</th><th style="text-align: right;">見積</th><th style="text-align: right;">実績</th><th style="text-align: right;">差異</th></tr>';

    members.sort().forEach(member => {
        const data = memberData[member];
        const diff = data.actual - data.estimate;

        html += '<tr>';
        html += `<td><strong>${escapeHtml(member)}</strong></td>`;
        html += `<td style="text-align: right;">${formatHours(data.estimate)}h</td>`;
        html += `<td style="text-align: right;">${formatHours(data.actual)}h</td>`;
        html += `<td style="text-align: right; color: ${diff >= 0 ? '#e74c3c' : '#27ae60'}">${(diff >= 0 ? '+' : '')}${formatHours(diff)}h</td>`;
        html += '</tr>';
    });

    // 合計行
    const totalDiff = totalAct - totalEst;
    html += '<tr style="background: var(--surface-elevated, #f5f5f5); font-weight: bold; border-top: 2px solid #ddd;">';
    html += '<td>合計</td>';
    html += `<td style="text-align: right;">${formatHours(totalEst)}h</td>`;
    html += `<td style="text-align: right;">${formatHours(totalAct)}h</td>`;
    html += `<td style="text-align: right; color: ${totalDiff >= 0 ? '#e74c3c' : '#27ae60'}">${(totalDiff >= 0 ? '+' : '')}${formatHours(totalDiff)}h</td>`;
    html += '</tr>';

    html += '</table></div>';

    // 横棒グラフ（見積と実績の内訳をバーで表示）
    if (totalEst > 0 || totalAct > 0) {
        const maxHours = Math.max(totalEst, totalAct, 1);
        html += '<div style="display: flex; flex-direction: column; gap: 12px;">';

        // 見積バー
        if (totalEst > 0) {
            html += '<div>';
            html += `<div style="font-size: 12px; font-weight: 600; color: #495057; margin-bottom: 4px;">見積 ${formatHours(totalEst)}h</div>`;
            html += '<div style="display: flex; height: 24px; border-radius: 4px; overflow: hidden; background: #eee;">';
            members.sort().forEach((member, index) => {
                const value = memberData[member].estimate;
                if (value === 0) return;
                const widthPct = (value / maxHours) * 100;
                const color = getBreakdownMemberColor(index);
                html += `<div style="width: ${widthPct}%; background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 600; min-width: 0; overflow: hidden;" title="${escapeHtml(member)}: ${formatHours(value)}h">${value >= maxHours * 0.08 ? formatHours(value) + 'h' : ''}</div>`;
            });
            html += '</div>';
            html += '</div>';
        }

        // 実績バー
        if (totalAct > 0) {
            html += '<div>';
            html += `<div style="font-size: 12px; font-weight: 600; color: #495057; margin-bottom: 4px;">実績 ${formatHours(totalAct)}h</div>`;
            html += '<div style="display: flex; height: 24px; border-radius: 4px; overflow: hidden; background: #eee;">';
            members.sort().forEach((member, index) => {
                const value = memberData[member].actual;
                if (value === 0) return;
                const widthPct = (value / maxHours) * 100;
                const color = getBreakdownMemberColor(index);
                html += `<div style="width: ${widthPct}%; background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 600; min-width: 0; overflow: hidden;" title="${escapeHtml(member)}: ${formatHours(value)}h">${value >= maxHours * 0.08 ? formatHours(value) + 'h' : ''}</div>`;
            });
            html += '</div>';
            html += '</div>';
        }

        // 凡例
        html += '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px;">';
        members.sort().forEach((member, index) => {
            const color = getBreakdownMemberColor(index);
            html += `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #555;">`;
            html += `<span style="width: 10px; height: 10px; background: ${color}; border-radius: 2px; flex-shrink: 0;"></span>`;
            html += `${escapeHtml(member)}`;
            html += `</span>`;
        });
        html += '</div>';

        html += '</div>';
    }

    html += '</div>';

    content.innerHTML = html;
    modal.style.display = 'flex';
}

// 内訳モーダル用の担当者カラーパレット
function getBreakdownMemberColor(index) {
    const colors = [
        '#5B7FD3', '#D4789C', '#4BA0C9', '#5BB88A',
        '#C4724D', '#6AAFAB', '#9B8EC4', '#C9A055',
        '#7CAA6E', '#B08DAA', '#6D9FBF', '#C48E6A'
    ];
    return colors[index % colors.length];
}

// 工程内訳ドーナツグラフを描画（レガシー互換: window公開用）
export function drawBreakdownDonutChart(canvasId, memberData, dataType, members, total) {
    // ドーナツグラフは横棒グラフに置き換え済みのため、このメソッドは互換性のために残す
    return;
}

// 工程内訳モーダルを開く（IDベースのラッパー）
export function openProcessBreakdown(version, task, process) {
    // データをフィルタリング
    const filteredEstimates = State.estimates.filter(e =>
        e.version === version && e.task === task && e.process === process
    );
    const filteredActuals = State.actuals.filter(a =>
        a.version === version && a.task === task && a.process === process
    );

    showProcessBreakdown(version, task, process, filteredActuals, filteredEstimates);
}

// Windowオブジェクトに公開
window.openProcessBreakdown = openProcessBreakdown;

export function closeProcessBreakdownModal() {
    document.getElementById('processBreakdownModal').style.display = 'none';
}

// ============================================
// 残存時間モーダル
// ============================================

// 見込残存時間入力モーダルを開く
export function openRemainingHoursModal(version, task, process) {
    // 工程の担当者を取得
    const estMembers = new Set();
    const actMembers = new Set();

    State.estimates.forEach(e => {
        if (e.version === version && e.task === task && e.process === process) {
            estMembers.add(e.member);
        }
    });

    State.actuals.forEach(a => {
        if (a.version === version && a.task === task && a.process === process) {
            actMembers.add(a.member);
        }
    });

    const allMembers = [...new Set([...estMembers, ...actMembers])].sort();
    const memberDisplay = allMembers.length > 0 ? allMembers.join(', ') : '-';

    // タスク工程レベルの見積合計
    const totalEstHours = State.estimates
        .filter(e => e.version === version && e.task === task && e.process === process)
        .reduce((sum, e) => sum + e.hours, 0);

    // 情報表示エリアを更新（担当者一覧を表示）
    document.getElementById('remainingHoursInfo').innerHTML = `
        <div><strong>版数:</strong> ${escapeHtml(version)}</div>
        <div><strong>対応名:</strong> ${escapeHtml(task)}</div>
        <div><strong>工程:</strong> ${escapeHtml(process)}</div>
        <div><strong>担当者:</strong> ${escapeHtml(memberDisplay)}</div>
        <div><strong>見積合計:</strong> ${totalEstHours.toFixed(1)}h</div>
    `;

    // 担当者セレクトは非表示（タスク工程レベルで管理するため）
    document.getElementById('remainingHoursMemberSelect').style.display = 'none';
    const select = document.getElementById('remainingHoursMember');
    // 後方互換性のためにmember値を設定（保存時に使用）
    if (allMembers.length > 0) {
        select.innerHTML = `<option value="${escapeHtml(allMembers[0])}">${escapeHtml(allMembers[0])}</option>`;
        select.value = allMembers[0];
    }

    // タスク工程レベルの残存時間を表示
    updateRemainingHoursInput(version, task, process);

    // 全担当者の実績リストを表示
    updateRemainingHoursActualsList(version, task, process);

    // モーダルにデータを保存
    document.getElementById('remainingHoursModal').dataset.version = version;
    document.getElementById('remainingHoursModal').dataset.task = task;
    document.getElementById('remainingHoursModal').dataset.process = process;

    // モーダルを表示
    document.getElementById('remainingHoursModal').style.display = 'flex';
}

// 見込残存時間の入力フィールドを更新（タスク工程レベル）
export function updateRemainingHoursInput(version, task, process, member) {
    // タスク工程レベルで検索（memberは無視）
    const existing = State.remainingEstimates.find(r =>
        r.version === version &&
        r.task === task &&
        r.process === process
    );

    document.getElementById('remainingHoursInput').value = existing ? existing.remainingHours : '';
}

// 実績リストを更新（タスク工程レベル：全担当者の実績を表示）
export function updateRemainingHoursActualsList(version, task, process, member) {
    // 現在のレポートのフィルタ条件を取得
    const filterType = document.getElementById('reportFilterType')?.value;
    const filterMonth = document.getElementById('reportMonth')?.value;
    const filterVersion = document.getElementById('reportVersion')?.value;

    // 全担当者の実績を取得（タスク工程レベル）
    let filteredActuals = State.actuals.filter(a =>
        a.version === version &&
        a.task === task &&
        a.process === process
    );

    // フィルタ条件に基づいてさらに絞り込み
    if (filterType === 'month' && filterMonth !== 'all') {
        filteredActuals = filteredActuals.filter(a => a.date && a.date.startsWith(filterMonth));
    } else if (filterType === 'version' && filterVersion !== 'all') {
        filteredActuals = filteredActuals.filter(a => a.version === filterVersion);
    }

    // 日付でソート（古い順）
    filteredActuals.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateA.localeCompare(dateB);
    });

    const actualsListDiv = document.getElementById('remainingHoursActualsList');
    const actualsContentDiv = document.getElementById('remainingHoursActualsContent');

    if (filteredActuals.length === 0) {
        actualsListDiv.style.display = 'none';
    } else {
        actualsListDiv.style.display = 'block';

        // 実績リストのHTML生成（担当者名も表示）
        let html = '<div style="font-size: 13px;">';

        filteredActuals.forEach((actual, index) => {
            const dateStr = actual.date ? actual.date : '日付なし';
            const bgColor = index % 2 === 0 ? 'white' : '#f1f3f5';

            html += `
                <div style="padding: 8px; background: ${bgColor}; border-radius: 4px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 500; color: #333;">${dateStr} <span style="color: #888; font-size: 12px;">${escapeHtml(actual.member)}</span></div>
                        ${actual.memo ? `<div style="color: #666; font-size: 12px; margin-top: 2px;">${escapeHtml(actual.memo)}</div>` : ''}
                    </div>
                    <div style="font-weight: 600; color: #495057; white-space: nowrap; margin-left: 12px;">${formatHours(actual.hours)}h</div>
                </div>
            `;
        });

        // 合計時間を計算して最後に表示
        const totalHours = filteredActuals.reduce((sum, a) => sum + a.hours, 0);
        html += `<div style="margin-top: 10px; padding: 8px; background: white; border-radius: 4px; font-weight: 600; color: #333;">合計: ${formatHours(totalHours)}h</div>`;

        html += '</div>';
        actualsContentDiv.innerHTML = html;
    }
}

// 見込残存時間モーダルを閉じる
export function closeRemainingHoursModal() {
    document.getElementById('remainingHoursModal').style.display = 'none';
}

// 見込残存時間を保存（タスク工程レベル）
export function saveRemainingHoursFromModal() {
    const modal = document.getElementById('remainingHoursModal');
    const version = modal.dataset.version;
    const task = modal.dataset.task;
    const process = modal.dataset.process;
    const member = document.getElementById('remainingHoursMember').value || '';
    const hours = parseFloat(document.getElementById('remainingHoursInput').value);

    if (isNaN(hours) || hours < 0) {
        alert('正しい時間を入力してください');
        return;
    }

    // 変更前の状態を記録
    const oldRemaining = Estimate.getRemainingEstimate(version, task, process);
    const beforeCopy = oldRemaining ? { ...oldRemaining } : null;

    // 見込残存時間を保存（タスク工程レベル）
    Estimate.saveRemainingEstimate(version, task, process, member, hours);

    // 変更後の状態を記録
    const newRemaining = Estimate.getRemainingEstimate(version, task, process);

    pushAction({
        type: 'remaining_edit',
        description: `見込残存変更: ${task} (${process}) ${hours}h`,
        data: {
            before: beforeCopy,
            after: newRemaining ? { ...newRemaining } : null
        }
    });

    if (typeof window.saveData === 'function') window.saveData(true);

    // モーダルを閉じてから画面を更新
    closeRemainingHoursModal();

    // 画面を更新
    if (typeof window.updateReport === 'function') window.updateReport();
}

// ============================================
// モーダル共通処理
// ============================================

// モーダルのクリック・ドラッグハンドラーをセットアップ
export function setupModalHandlers() {
    // モーダルIDと閉じる関数のマッピング
    const modals = [
        { id: 'workModal', closeFunc: () => { if (typeof window.closeWorkModal === 'function') window.closeWorkModal(); } },
        { id: 'editActualModal', closeFunc: () => { if (typeof window.closeEditActualModal === 'function') window.closeEditActualModal(); } },
        { id: 'bulkRemainingModal', closeFunc: () => { if (typeof window.closeBulkRemainingModal === 'function') window.closeBulkRemainingModal(); } },
        { id: 'vacationModal', closeFunc: () => { if (typeof window.closeVacationModal === 'function') window.closeVacationModal(); } },
        { id: 'editEstimateModal', closeFunc: () => { if (typeof window.closeEditEstimateModal === 'function') window.closeEditEstimateModal(); } },
        { id: 'editTaskModal', closeFunc: () => { if (typeof window.closeEditTaskModal === 'function') window.closeEditTaskModal(); } },
        { id: 'processBreakdownModal', closeFunc: closeProcessBreakdownModal },
        { id: 'addEstimateModal', closeFunc: () => { if (typeof window.closeAddEstimateModal === 'function') window.closeAddEstimateModal(); } },
        { id: 'splitEstimateModal', closeFunc: () => { if (typeof window.closeSplitEstimateModal === 'function') window.closeSplitEstimateModal(); } },
        { id: 'otherWorkModal', closeFunc: () => { if (typeof window.closeOtherWorkModal === 'function') window.closeOtherWorkModal(); } },
        { id: 'createScheduleModal', closeFunc: () => { if (typeof window.closeCreateScheduleModal === 'function') window.closeCreateScheduleModal(); } },
        { id: 'scheduleDetailModal', closeFunc: () => { if (typeof window.closeScheduleDetailModal === 'function') window.closeScheduleDetailModal(); } },
        { id: 'autoGenerateModal', closeFunc: () => { if (typeof window.closeAutoGenerateModal === 'function') window.closeAutoGenerateModal(); } }
    ];

    modals.forEach(modal => {
        const modalElement = document.getElementById(modal.id);
        if (!modalElement) return;

        let mouseDownTarget = null;

        // mousedownイベントで開始位置を記録
        modalElement.addEventListener('mousedown', (e) => {
            mouseDownTarget = e.target;
        });

        // mouseupイベントで終了位置を確認
        modalElement.addEventListener('mouseup', (e) => {
            // preventOutsideClickがtrueの場合は、外側クリックで閉じない
            if (modal.preventOutsideClick) {
                return;
            }

            // mousedownとmouseupの両方がモーダル背景（.modal）だった場合のみ閉じる
            if (mouseDownTarget === modalElement && e.target === modalElement) {
                modal.closeFunc();
            }
            mouseDownTarget = null;
        });

        // マウスがモーダル外に出た場合、リセット
        modalElement.addEventListener('mouseleave', () => {
            mouseDownTarget = null;
        });
    });
}

console.log('✅ モジュール modal.js loaded');
