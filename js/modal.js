// ============================================
// モーダル関連機能（工程内訳・残存時間）
// ============================================

import * as State from './state.js';
import * as Estimate from './estimate.js';
import { formatHours } from './utils.js';

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
    title.textContent = `${version} - ${task} [${process}] の内訳`;

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

    // HTMLを生成（グラフとテーブル）
    let html = '<div style="display: flex; flex-direction: column; gap: 30px;">';

    // グラフコンテナ
    html += '<div style="display: flex; flex-wrap: wrap; gap: 20px; justify-content: center;">';

    // 見積グラフ
    if (totalEst > 0) {
        html += '<div style="flex: 1; min-width: 250px; max-width: 350px;">';
        html += '<h4 style="text-align: center; margin: 0 0 10px 0; color: #495057; font-size: 14px;">見積内訳</h4>';
        html += '<canvas id="breakdownEstimateChart" class="donut-chart-canvas"></canvas>';
        html += '</div>';
    }

    // 実績グラフ
    if (totalAct > 0) {
        html += '<div style="flex: 1; min-width: 250px; max-width: 350px;">';
        html += '<h4 style="text-align: center; margin: 0 0 10px 0; color: #495057; font-size: 14px;">実績内訳</h4>';
        html += '<canvas id="breakdownActualChart" class="donut-chart-canvas"></canvas>';
        html += '</div>';
    }

    html += '</div>';

    // テーブルを生成
    html += '<div class="table-wrapper"><table>';
    html += '<tr><th>担当者</th><th>見積</th><th>実績</th><th>差異</th></tr>';

    members.sort().forEach(member => {
        const data = memberData[member];
        const diff = data.actual - data.estimate;

        html += '<tr>';
        html += `<td><strong>${member}</strong></td>`;
        html += `<td style="text-align: right;">${formatHours(data.estimate)}h</td>`;
        html += `<td style="text-align: right;">${formatHours(data.actual)}h</td>`;
        html += `<td style="text-align: right; color: ${diff >= 0 ? '#e74c3c' : '#27ae60'}">${(diff >= 0 ? '+' : '')}${formatHours(diff)}h</td>`;
        html += '</tr>';
    });

    // 合計行
    const totalDiff = totalAct - totalEst;
    html += '<tr style="background: #f5f5f5; font-weight: bold; border-top: 2px solid #ddd;">';
    html += '<td>合計</td>';
    html += `<td style="text-align: right;">${formatHours(totalEst)}h</td>`;
    html += `<td style="text-align: right;">${formatHours(totalAct)}h</td>`;
    html += `<td style="text-align: right; color: ${totalDiff >= 0 ? '#e74c3c' : '#27ae60'}">${(totalDiff >= 0 ? '+' : '')}${formatHours(totalDiff)}h</td>`;
    html += '</tr>';

    html += '</table></div>';
    html += '</div>';

    content.innerHTML = html;

    // グラフを描画
    setTimeout(() => {
        if (totalEst > 0) {
            drawBreakdownDonutChart('breakdownEstimateChart', memberData, 'estimate', members, totalEst);
        }
        if (totalAct > 0) {
            drawBreakdownDonutChart('breakdownActualChart', memberData, 'actual', members, totalAct);
        }
    }, 100);

    modal.style.display = 'flex';
}

// 工程内訳ドーナツグラフを描画
export function drawBreakdownDonutChart(canvasId, memberData, dataType, members, total) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // キャンバスのサイズを設定
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const isMobile = width < 768;
    const legendHeight = members.length * 16 + 20;
    const centerX = width / 2;
    const centerY = isMobile ? (height - legendHeight) / 2 : height / 2 - 10;
    const radius = isMobile
        ? Math.min(width, height - legendHeight - 40) / 2.5
        : Math.min(width, height - 40) / 2.2;
    const innerRadius = radius * 0.5;

    // 担当者の色を取得（パステルカラー）
    const memberColors = [
        '#667eea', '#f093fb', '#4facfe', '#43e97b',
        '#fa709a', '#30cfd0', '#a8edea', '#fbc2eb',
        '#96e6a1', '#d4fc79', '#84fab0', '#8fd3f4'
    ];

    const getMemberColor = (index) => {
        return memberColors[index % memberColors.length];
    };

    // ドーナツを描画
    let startAngle = -Math.PI / 2;
    members.forEach((member, index) => {
        const value = memberData[member][dataType];
        if (value === 0) return;

        const angle = (value / total) * 2 * Math.PI;
        const endAngle = startAngle + angle;

        ctx.fillStyle = getMemberColor(index);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();

        startAngle = endAngle;
    });

    // 中央に合計を表示
    ctx.fillStyle = '#495057';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatHours(total) + 'h', centerX, centerY - 5);
    ctx.font = '11px sans-serif';
    ctx.fillText(dataType === 'estimate' ? '合計見積' : '合計実績', centerX, centerY + 12);

    // 凡例を描画
    const legendX = 10;
    const legendStartY = isMobile
        ? centerY + radius + 20
        : height - 10 - (members.length * 16);
    let legendY = legendStartY;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = isMobile ? '10px sans-serif' : '11px sans-serif';

    members.forEach((member, index) => {
        const value = memberData[member][dataType];
        if (value === 0) return;

        const percentage = (value / total * 100).toFixed(1);

        ctx.fillStyle = getMemberColor(index);
        ctx.fillRect(legendX, legendY, 10, 10);

        ctx.fillStyle = '#495057';
        const label = `${member} (${percentage}%)`;
        ctx.fillText(label, legendX + 15, legendY + 5);

        legendY += isMobile ? 14 : 16;
    });
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

    // 情報表示エリアを更新
    document.getElementById('remainingHoursInfo').innerHTML = `
        <div><strong>版数:</strong> ${version}</div>
        <div><strong>対応名:</strong> ${task}</div>
        <div><strong>工程:</strong> ${process}</div>
    `;

    // 担当者設定
    const select = document.getElementById('remainingHoursMember');
    if (allMembers.length > 1) {
        // 担当者が複数いる場合は選択できるようにする
        document.getElementById('remainingHoursMemberSelect').style.display = 'block';
        select.innerHTML = allMembers.map(m => `<option value="${m}">${m}</option>`).join('');

        // 最初の担当者の見込残存時間と実績リストを表示
        updateRemainingHoursInput(version, task, process, allMembers[0]);
        updateRemainingHoursActualsList(version, task, process, allMembers[0]);

        // 担当者変更時に見込残存時間と実績リストを更新
        select.onchange = function () {
            updateRemainingHoursInput(version, task, process, this.value);
            updateRemainingHoursActualsList(version, task, process, this.value);
        };
    } else if (allMembers.length === 1) {
        // 担当者が1人の場合は非表示だが、selectには値を設定
        document.getElementById('remainingHoursMemberSelect').style.display = 'none';
        select.innerHTML = `<option value="${allMembers[0]}">${allMembers[0]}</option>`;
        select.value = allMembers[0];
        updateRemainingHoursInput(version, task, process, allMembers[0]);
        updateRemainingHoursActualsList(version, task, process, allMembers[0]);
    } else {
        // 担当者がいない場合
        document.getElementById('remainingHoursMemberSelect').style.display = 'none';
        select.innerHTML = '';
        document.getElementById('remainingHoursInput').value = '';
        document.getElementById('remainingHoursActualsList').style.display = 'none';
    }

    // モーダルにデータを保存
    document.getElementById('remainingHoursModal').dataset.version = version;
    document.getElementById('remainingHoursModal').dataset.task = task;
    document.getElementById('remainingHoursModal').dataset.process = process;

    // モーダルを表示
    document.getElementById('remainingHoursModal').style.display = 'flex';
}

// 見込残存時間の入力フィールドを更新
export function updateRemainingHoursInput(version, task, process, member) {
    const existing = State.remainingEstimates.find(r =>
        r.version === version &&
        r.task === task &&
        r.process === process &&
        r.member === member
    );

    document.getElementById('remainingHoursInput').value = existing ? existing.remainingHours : '';
}

// 実績リストを更新（現在の表示条件でフィルタ）
export function updateRemainingHoursActualsList(version, task, process, member) {
    // 現在のレポートのフィルタ条件を取得
    const filterType = document.getElementById('reportFilterType').value;
    const filterMonth = document.getElementById('reportMonth').value;
    const filterVersion = document.getElementById('reportVersion').value;

    // 該当する実績を取得
    let filteredActuals = State.actuals.filter(a =>
        a.version === version &&
        a.task === task &&
        a.process === process &&
        a.member === member
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

        // 実績リストのHTML生成
        let html = '<div style="font-size: 13px;">';

        // 各実績を表示
        filteredActuals.forEach((actual, index) => {
            const dateStr = actual.date ? actual.date : '日付なし';
            const bgColor = index % 2 === 0 ? 'white' : '#f1f3f5';

            html += `
                <div style="padding: 8px; background: ${bgColor}; border-radius: 4px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 500; color: #333;">${dateStr}</div>
                        ${actual.memo ? `<div style="color: #666; font-size: 12px; margin-top: 2px;">${actual.memo}</div>` : ''}
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

// 見込残存時間を保存
export function saveRemainingHoursFromModal() {
    const modal = document.getElementById('remainingHoursModal');
    const version = modal.dataset.version;
    const task = modal.dataset.task;
    const process = modal.dataset.process;
    const member = document.getElementById('remainingHoursMember').value;
    const hours = parseFloat(document.getElementById('remainingHoursInput').value);

    if (!member) {
        alert('担当者が設定されていません');
        return;
    }

    if (isNaN(hours) || hours < 0) {
        alert('正しい時間を入力してください');
        return;
    }

    // 見込残存時間を保存
    Estimate.saveRemainingEstimate(version, task, process, member, hours);
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
        { id: 'autoGenerateModal', closeFunc: () => { if (typeof window.closeAutoGenerateModal === 'function') window.closeAutoGenerateModal(); } },
        { id: 'scheduleChangeConfirmModal', closeFunc: () => { if (typeof window.closeScheduleChangeConfirmModal === 'function') window.closeScheduleChangeConfirmModal(); } }
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
