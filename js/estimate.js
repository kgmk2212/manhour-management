// ============================================
// 見積管理モジュール (estimate.js)
// ============================================

import {
    estimates, actuals, filteredEstimates, remainingEstimates,
    schedules,
    setEstimates, setFilteredEstimates,
    workMonthSelectionMode, setWorkMonthSelectionMode,
    selectedEstimateIds,
    currentThemeColor,
    showMonthColorsSetting,
    monthColors
} from './state.js';

import {
    normalizeEstimate,
    generateMonthRange,
    generateMonthOptions,
    getMonthColor,
    generateMonthColorLegend,
    showAlert,
    sortMembers,
    escapeHtml,
    escapeForHandler
} from './utils.js';

// ============================================
// 月の実働日数計算
// ============================================

/**
 * 月の実働日数を計算（土日祝日・会社休日を除く）
 */
export function getWorkingDays(year, month) {
    const lastDay = new Date(year, month, 0).getDate();
    let workingDays = 0;

    for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

        // window経由で祝日・会社休日判定関数を呼び出し
        const holiday = typeof window.getHoliday === 'function' ? window.getHoliday(dateStr) : null;
        const companyHol = typeof window.isCompanyHoliday === 'function' ? window.isCompanyHoliday(dateStr) : false;

        if (!isWeekend && !holiday && !companyHol) {
            workingDays++;
        }
    }

    return workingDays;
}

/**
 * フィルタ済みデータから換算用の稼働日数とラベルを計算
 * レポートタブの renderReportMatrix と同じロジック：
 * - 特定月選択時はその月の営業日数を使用
 * - それ以外はデータに含まれる作業月の平均営業日数を計算
 * @param {string} selectedMonth - 選択された月（'all' または 'YYYY-MM'）
 * @param {Array} estimateData - 見積データ配列
 * @returns {{ workingDaysPerMonth: number, workDaysLabel: string }}
 */
function calculateConversionBasis(selectedMonth, estimateData) {
    let workingDaysPerMonth = 20;
    let workDaysLabel = 'デフォルト20日';

    if (selectedMonth && selectedMonth !== 'all') {
        // 特定の月が選択されている場合
        const [year, month] = selectedMonth.split('-');
        const calculatedDays = getWorkingDays(parseInt(year), parseInt(month));
        if (calculatedDays > 0) {
            workingDaysPerMonth = calculatedDays;
            workDaysLabel = `${year}年${parseInt(month)}月の営業日数（${workingDaysPerMonth}日）`;
        }
    } else {
        // 全期間/版数別の場合: 見積もりに含まれる作業月の平均営業日数を計算
        const workMonthsSet = new Set();
        estimateData.forEach(e => {
            const est = normalizeEstimate(e);
            if (est.workMonths && est.workMonths.length > 0) {
                est.workMonths.forEach(m => workMonthsSet.add(m));
            }
        });

        if (workMonthsSet.size > 0) {
            let totalDays = 0;
            workMonthsSet.forEach(m => {
                const [y, mo] = m.split('-');
                totalDays += getWorkingDays(parseInt(y), parseInt(mo));
            });
            workingDaysPerMonth = Math.round(totalDays / workMonthsSet.size);
            if (workMonthsSet.size === 1) {
                const singleMonth = [...workMonthsSet][0];
                const [y, mo] = singleMonth.split('-');
                workDaysLabel = `${y}年${parseInt(mo)}月の営業日数（${workingDaysPerMonth}日）`;
            } else {
                workDaysLabel = `${workMonthsSet.size}ヶ月の平均営業日数（${workingDaysPerMonth}日）`;
            }
        }
    }

    return { workingDaysPerMonth, workDaysLabel };
}

/**
 * 現在の年月の実働日数を取得（デフォルト値として使用）
 */
export function getCurrentMonthWorkingDays() {
    const now = new Date();
    return getWorkingDays(now.getFullYear(), now.getMonth() + 1);
}

/**
 * 数値を整数表示（小数点以下が0の場合）または小数表示
 */
export function formatNumber(num, decimals = 1) {
    const rounded = parseFloat(num.toFixed(decimals));
    return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(decimals);
}

/**
 * 実績または見積が「その他付随作業」かどうかを判定
 */
export function isOtherWork(item) {
    const hasVersion = item.version && item.version.trim() !== '';
    const hasTask = item.task && item.task.trim() !== '';
    return !hasVersion || !hasTask;
}

// ============================================
// デフォルト作業月の計算
// ============================================

/**
 * ウォーターフォール方式でデフォルトの作業月を計算
 */
export function calculateDefaultWorkMonths(startMonth, endMonth) {
    if (!startMonth || !endMonth) return [];

    const months = generateMonthRange(startMonth, endMonth);
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const result = [];

    processes.forEach((process, index) => {
        const monthIndex = Math.floor(index * months.length / processes.length);
        const assignedMonth = months[monthIndex];
        result.push({
            process: process,
            startMonth: assignedMonth,
            endMonth: assignedMonth
        });
    });

    return result;
}

// ============================================
// 見込残存時間管理
// ============================================

/**
 * 見込残存時間を保存/更新する関数
 */
/**
 * 見込残存時間を保存/更新
 * 同一バージョン・対応・工程・担当者のレコードがあれば更新、なければ新規作成
 * @param {string} version - 版数
 * @param {string} task - 対応名
 * @param {string} process - 工程（UI/PG/PT/IT/ST）
 * @param {string} member - 担当者名
 * @param {number} remainingHours - 見込残存時間（h）
 * @returns {void}
 */
export function saveRemainingEstimate(version, task, process, member, remainingHours) {
    const existingIndex = remainingEstimates.findIndex(r =>
        r.version === version &&
        r.task === task &&
        r.process === process &&
        r.member === member
    );

    const record = {
        id: existingIndex >= 0 ? remainingEstimates[existingIndex].id : Date.now() + Math.random(),
        version: version,
        task: task,
        process: process,
        member: member,
        remainingHours: remainingHours,
        updatedAt: new Date().toISOString(),
        note: ''
    };

    if (existingIndex >= 0) {
        remainingEstimates[existingIndex] = record;
    } else {
        remainingEstimates.push(record);
    }
}

/**
 * 見込残存時間を取得する関数
 */
export function getRemainingEstimate(version, task, process, member) {
    return remainingEstimates.find(r =>
        r.version === version &&
        r.task === task &&
        r.process === process &&
        r.member === member
    );
}

/**
 * 見込残存時間を削除する関数
 * @param {string} version - 版数
 * @param {string} task - 対応名
 * @param {string} process - 工程
 * @param {string} member - 担当者名
 * @returns {boolean} 削除に成功したかどうか
 */
export function deleteRemainingEstimate(version, task, process, member) {
    const index = remainingEstimates.findIndex(r =>
        r.version === version &&
        r.task === task &&
        r.process === process &&
        r.member === member
    );
    
    if (index >= 0) {
        const removed = remainingEstimates[index];
        remainingEstimates.splice(index, 1);
        localStorage.setItem('remainingEstimates', JSON.stringify(remainingEstimates));
        console.log(`[RemainingEstimate] 削除: ${version}/${task}/${process}/${member} (${removed.remainingHours}h)`);
        return true;
    }
    return false;
}

/**
 * 孤立した見込残存データをクリーンアップする関数
 * 対応する見積データが存在しない見込残存データを削除する
 * 
 * 安全性の保証：
 * - 見積データ（version/task/process/member）に完全一致するレコードが存在する場合は絶対に削除しない
 * - 見積データに対応するレコードが存在しない場合のみ削除対象とする
 * 
 * @returns {number} 削除したレコード数
 */
export function cleanupOrphanedRemainingEstimates() {
    if (!remainingEstimates || remainingEstimates.length === 0) {
        return 0;
    }
    
    const orphanedIndices = [];
    
    // 各見込残存データに対して、対応する見積データが存在するかチェック
    remainingEstimates.forEach((remaining, index) => {
        // 対応する見積データを検索
        const matchingEstimate = estimates.find(e =>
            e.version === remaining.version &&
            e.task === remaining.task &&
            e.process === remaining.process &&
            e.member === remaining.member
        );
        
        // 対応する見積データが存在しない場合、孤立データとしてマーク
        if (!matchingEstimate) {
            orphanedIndices.push(index);
        }
    });
    
    // 孤立データがない場合は終了
    if (orphanedIndices.length === 0) {
        return 0;
    }
    
    // インデックスを降順にソートして、後ろから削除（インデックスがずれないように）
    orphanedIndices.sort((a, b) => b - a);
    
    // 削除実行（ログ出力）
    orphanedIndices.forEach(index => {
        const removed = remainingEstimates[index];
        console.log(`[Cleanup] 孤立した見込残存データを削除: ${removed.version}/${removed.task}/${removed.process}/${removed.member} (${removed.remainingHours}h)`);
        remainingEstimates.splice(index, 1);
    });
    
    // localStorageに保存
    localStorage.setItem('remainingEstimates', JSON.stringify(remainingEstimates));
    
    console.log(`[Cleanup] ${orphanedIndices.length}件の孤立データを削除しました`);
    return orphanedIndices.length;
}

// ============================================
// 見積一覧レンダリング
// ============================================

/**
 * 見積データにフィルタを適用
 * @param {string} filterType - フィルタタイプ（'month' | 'version'）
 * @param {string} monthFilter - 月フィルタ値
 * @param {string} versionFilter - 版数フィルタ値
 * @returns {Array} フィルタ済み見積配列
 */
function applyEstimateFilters(filterType, monthFilter, versionFilter) {
    let filtered = estimates;

    // 版数フィルタを適用
    if (versionFilter !== 'all') {
        // 選択された版数の作業予定月を収集
        const versionMonths = new Set();
        estimates.filter(e => e.version === versionFilter).forEach(e => {
            const est = normalizeEstimate(e);
            if (est.workMonths) {
                est.workMonths.forEach(m => versionMonths.add(m));
            }
        });

        filtered = filtered.filter(e => {
            if (e.version === versionFilter) return true;
            // その他工数は、版の作業予定月と重なるものを含める
            if (isOtherWork(e)) {
                const est = normalizeEstimate(e);
                if (!est.workMonths || est.workMonths.length === 0) return true;
                return est.workMonths.some(m => versionMonths.has(m));
            }
            return false;
        });
    }

    // 月フィルタを適用
    if (monthFilter !== 'all') {
        filtered = filtered.filter(e => {
            const est = normalizeEstimate(e);
            if (!est.workMonths || est.workMonths.length === 0) {
                return true;
            }
            return est.workMonths.includes(monthFilter);
        });
    }

    return filtered;
}

/**
 * 見積の合計工数を計算
 * @param {Array} filtered - フィルタ済み見積配列
 * @param {string} filterType - フィルタタイプ
 * @param {string} monthFilter - 月フィルタ値
 * @returns {number} 合計工数（時間）
 */
function calculateEstimateTotalHours(filtered, filterType, monthFilter) {
    let totalHours = 0;

    if (monthFilter === 'all') {
        // 月指定なし: 全工数を合算
        totalHours = filtered.reduce((sum, e) => sum + e.hours, 0);
    } else {
        // 月指定あり: 月別工数があればそれを使用（filterType問わず）
        filtered.forEach(e => {
            const est = normalizeEstimate(e);
            if (est.monthlyHours && est.monthlyHours[monthFilter]) {
                totalHours += est.monthlyHours[monthFilter];
            } else if (!est.workMonths || est.workMonths.length === 0) {
                totalHours += est.hours;
            }
        });
    }

    return totalHours;
}

/**
 * 合計工数・人日・人月をDOM要素に表示
 * @param {number} totalHours - 合計工数
 * @param {number} workingDaysPerMonth - 月間稼働日数
 * @param {string} workDaysLabel - 営業日数のラベル
 * @param {number} headcount - 担当者数
 * @param {string} monthFilter - 月フィルタ値
 */
function displayEstimateTotals(totalHours, workingDaysPerMonth, workDaysLabel, headcount, monthFilter) {
    const totalManDays = (totalHours / 8).toFixed(1);
    const totalManMonths = (totalHours / 8 / workingDaysPerMonth).toFixed(2);

    const totalHoursElement = document.getElementById('estimateTotalHours');
    const totalManpowerElement = document.getElementById('estimateTotalManpower');
    if (totalHoursElement) totalHoursElement.textContent = totalHours.toFixed(1) + 'h';
    if (totalManpowerElement) totalManpowerElement.textContent = `${totalManDays}人日 / ${totalManMonths}人月`;

    // 月標準工数を表示（特定月選択時のみ）
    updateEstimateStandardDisplay(totalHours, workingDaysPerMonth, headcount, monthFilter);

    // 換算基準を表示
    const conversionParams = document.getElementById('estimateConversionParams');
    if (conversionParams) {
        conversionParams.innerHTML = `<strong>換算基準:</strong> 1人日 = 8h、1人月 = ${workingDaysPerMonth}人日（${workDaysLabel}）`;
        conversionParams.style.display = 'block';
    }

    // 合計カードにテーマカラーのグラデーションを適用
    applyTotalCardTheme();
}

/**
 * 月標準工数の表示を更新
 */
function updateEstimateStandardDisplay(totalHours, workingDays, headcount, monthFilter) {
    const elA = document.getElementById('estimateStandardA');
    const elB = document.getElementById('estimateStandardB');
    if (!elA || !elB) return;

    const mode = localStorage.getItem('manhour_estimateStandardDisplay') || 'subtext';
    const isMonthSelected = monthFilter && monthFilter !== 'all';

    // 両方非表示にリセット
    elA.style.display = 'none';
    elB.style.display = 'none';

    if (!isMonthSelected || mode === 'none') return;

    const standardHours = workingDays * 8 * headcount;
    const diff = standardHours - totalHours;
    const absDiff = Math.abs(diff).toFixed(1);

    if (mode === 'subtext') {
        elA.style.display = '';
        elA.textContent = `月標準: ${standardHours}h（${workingDays}日×8h×${headcount}人）`;
    } else if (mode === 'bar') {
        elB.style.display = '';
        const diffLabel = diff >= 0
            ? `<span style="background: rgba(255,255,255,0.15); padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">余裕 ${absDiff}h</span>`
            : `<span style="background: rgba(239,68,68,0.3); padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">超過 ${absDiff}h</span>`;
        elB.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <span style="opacity: 0.85;">月標準工数: <strong style="font-size: 15px;">${standardHours}h</strong> <span style="opacity: 0.7; font-size: 12px;">（${workingDays}日×8h×${headcount}人）</span></span>
            ${diffLabel}
        </div>`;
    }
}

/**
 * 合計カードにテーマカラーを適用
 */
function applyTotalCardTheme() {
    const totalCard = document.getElementById('estimateTotalCard');
    if (!totalCard) return;

    totalCard.style.background = 'var(--accent)';
}

/**
 * 担当者別の合計を集計
 * @param {Array} filtered - フィルタ済み見積配列
 * @param {string} filterType - フィルタタイプ
 * @param {string} monthFilter - 月フィルタ値
 * @returns {Object} 担当者名をキー、工数を値とするオブジェクト
 */
function calculateMemberSummary(filtered, filterType, monthFilter) {
    const memberSummary = {};

    filtered.forEach(e => {
        const est = normalizeEstimate(e);
        const member = est.member || '未設定';

        if (!memberSummary[member]) {
            memberSummary[member] = 0;
        }

        if (monthFilter === 'all') {
            // 月指定なし: 全工数を合算
            memberSummary[member] += est.hours;
        } else if (est.monthlyHours && est.monthlyHours[monthFilter]) {
            // 月指定あり: 月別工数を使用（filterType問わず）
            memberSummary[member] += est.monthlyHours[monthFilter];
        } else if (!est.workMonths || est.workMonths.length === 0) {
            memberSummary[member] += est.hours;
        }
    });

    return memberSummary;
}

/**
 * 担当者別合計をDOM要素に表示
 * @param {Object} memberSummary - 担当者別工数オブジェクト
 * @param {number} workingDaysPerMonth - 月間稼働日数
 */
function renderEstimateMemberSummary(memberSummary, workingDaysPerMonth) {
    const memberSummaryContainer = document.getElementById('estimateMemberSummary');
    const memberSummaryContent = document.getElementById('estimateMemberSummaryContent');
    if (!memberSummaryContainer || !memberSummaryContent) return;

    const memberOrderElement = document.getElementById('memberOrder');
    const memberOrderInput = memberOrderElement ? memberOrderElement.value.trim() : '';
    const sortedMembers = sortMembers(Object.keys(memberSummary), memberOrderInput);

    if (sortedMembers.length === 0) {
        memberSummaryContainer.style.display = 'none';
        return;
    }

    memberSummaryContainer.style.display = 'block';

    const borderColor = 'var(--accent)';

    let memberHtml = '';
    sortedMembers.forEach(member => {
        const hours = memberSummary[member];
        const days = (hours / 8).toFixed(1);
        const months = (hours / 8 / workingDaysPerMonth).toFixed(2);
        memberHtml += `
            <div style="background: white; padding: 10px 15px; border-radius: 6px; border-left: 4px solid ${borderColor}; min-width: 150px;">
                <div style="font-size: 13px; color: #666; margin-bottom: 3px;">${escapeHtml(member)}</div>
                <div style="font-size: 18px; font-weight: 700; color: #333;">${hours.toFixed(1)}h</div>
                <div style="font-size: 12px; color: #666; font-weight: 500;">${days}人日 / ${months}人月</div>
            </div>
        `;
    });
    memberSummaryContent.innerHTML = memberHtml;
}

/**
 * 空状態を表示（データなし/フィルタ結果なし）
 * @param {HTMLElement} container - コンテナ要素
 * @param {string} message - 表示メッセージ
 */
function showEstimateEmptyState(container, message) {
    container.innerHTML = `<p style="color: #999; text-align: center; padding: 40px;">${message}</p>`;
    const totalHoursElement = document.getElementById('estimateTotalHours');
    const totalManpowerElement = document.getElementById('estimateTotalManpower');
    if (totalHoursElement) totalHoursElement.textContent = '0h';
    if (totalManpowerElement) totalManpowerElement.textContent = '0人日 / 0人月';
    const elA = document.getElementById('estimateStandardA');
    const elB = document.getElementById('estimateStandardB');
    if (elA) elA.style.display = 'none';
    if (elB) elB.style.display = 'none';
    const memberSummaryContainer = document.getElementById('estimateMemberSummary');
    if (memberSummaryContainer) memberSummaryContainer.style.display = 'none';
}

/**
 * 見積一覧をレンダリング（メイン関数）
 * フィルタ・表示形式に応じて、グループ形式/マトリクス形式/詳細リストを描画
 * 合計工数・人日・人月を計算し、担当者別サマリーを表示
 */
export function renderEstimateList() {
    const container = document.getElementById('estimateList');
    if (!container) return;

    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const versionFilterElement = document.getElementById('estimateVersionFilter');
    const defaultViewTypeElement = document.getElementById('defaultEstimateViewType');

    if (!monthFilterElement) return;

    const viewType = defaultViewTypeElement ? defaultViewTypeElement.value : 'matrix';
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';
    const monthFilter = monthFilterElement.value;
    const versionFilter = versionFilterElement ? versionFilterElement.value : 'all';

    // データがない場合
    if (estimates.length === 0) {
        showEstimateEmptyState(container, '見積データがありません');
        return;
    }

    // フィルタを適用
    const filtered = applyEstimateFilters(filterType, monthFilter, versionFilter);
    setFilteredEstimates(filtered);

    // フィルタ結果が空の場合
    if (filtered.length === 0) {
        showEstimateEmptyState(container, '選択した期間に見積データがありません');
        return;
    }

    // 月間稼働日数を取得（レポートタブと同じ仕様: 月選択値をそのまま使用）
    const { workingDaysPerMonth, workDaysLabel } = calculateConversionBasis(monthFilter, filtered);

    // 担当者別集計
    const memberSummary = calculateMemberSummary(filtered, filterType, monthFilter);
    const headcount = Math.max(1, Object.keys(memberSummary).length);

    // 合計工数を計算・表示
    const totalHours = calculateEstimateTotalHours(filtered, filterType, monthFilter);
    displayEstimateTotals(totalHours, workingDaysPerMonth, workDaysLabel, headcount, monthFilter);

    // 担当者別表示
    renderEstimateMemberSummary(memberSummary, workingDaysPerMonth);

    // ビュータイプに応じて描画
    if (viewType === 'grouped') {
        renderEstimateGrouped();
    } else if (viewType === 'matrix') {
        renderEstimateMatrix();
    } else {
        renderEstimateDetailList();
    }

    // セグメントボタンのハイライトを更新
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }
}

/**
 * グループ形式での見積一覧描画
 */
export function renderEstimateGrouped() {
    const container = document.getElementById('estimateList');

    function getTaskWorkMonths(version, task) {
        const taskEstimates = estimates.filter(e => e.version === version && e.task === task);
        const allMonths = new Set();
        taskEstimates.forEach(e => {
            const est = normalizeEstimate(e);
            if (est.workMonths && est.workMonths.length > 0) {
                est.workMonths.forEach(month => allMonths.add(month));
            }
        });
        return Array.from(allMonths).sort();
    }

    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const workMonthFilter = monthFilterElement ? monthFilterElement.value : 'all';
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';

    const { workingDaysPerMonth } = calculateConversionBasis(workMonthFilter, filteredEstimates);

    if (filteredEstimates.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">該当する見積データがありません</p>';
        return;
    }

    const allDisplayEstimates = filteredEstimates;

    // 版数ごとにグループ化
    const versionGroups = {};
    allDisplayEstimates.forEach(e => {
        if (!versionGroups[e.version]) {
            versionGroups[e.version] = {};
        }
        const taskKey = e.task;
        if (!versionGroups[e.version][taskKey]) {
            versionGroups[e.version][taskKey] = {
                task: e.task,
                processes: []
            };
        }

        const est = normalizeEstimate(e);
        let displayHours = e.hours;
        if (workMonthFilter !== 'all' && est.monthlyHours && est.monthlyHours[workMonthFilter]) {
            displayHours = est.monthlyHours[workMonthFilter];
        }

        versionGroups[e.version][taskKey].processes.push({
            process: e.process,
            member: e.member,
            hours: displayHours,
            id: e.id
        });
    });

    let html = '<div style="margin-bottom: 30px;">';

    // その他工数（空文字版）を末尾に配置するソート
    const sortedVersionKeys = Object.keys(versionGroups).sort((a, b) => {
        if (a === '' && b !== '') return 1;
        if (a !== '' && b === '') return -1;
        return a.localeCompare(b);
    });

    sortedVersionKeys.forEach(version => {
        const versionDisplay = escapeHtml(version) || 'その他工数';
        const isOtherWorkVersion = !version;

        // その他工数の場合、合計のみの簡略表示
        if (isOtherWorkVersion) {
            const versionTotal = Object.values(versionGroups[version])
                .reduce((sum, taskGroup) => sum + taskGroup.processes.reduce((s, p) => s + p.hours, 0), 0);
            const versionDays = versionTotal / 8;
            const versionMonths = versionTotal / 8 / workingDaysPerMonth;

            html += `<div style="margin-bottom: 30px;">`;
            html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${versionDisplay}</h3>`;
            html += '<div class="table-wrapper"><table class="estimate-grouped">';

            // 対応名ごとに1行で表示（工程列なし）
            html += '<tr><th style="min-width: 200px;">対応名</th><th style="min-width: 80px;">担当</th><th style="min-width: 150px;">工数</th></tr>';

            Object.values(versionGroups[version]).forEach(taskGroup => {
                const total = taskGroup.processes.reduce((sum, p) => sum + p.hours, 0);
                const days = total / 8;
                const months = total / 8 / workingDaysPerMonth;
                const members = escapeHtml([...new Set(taskGroup.processes.map(p => p.member))].join(', '));

                let taskDisplayHtml = escapeHtml(taskGroup.task) || '(未設定)';
                const escapedTask = escapeForHandler(taskGroup.task || '');

                html += `<tr style="cursor: pointer;" onclick="showOtherWorkTaskDetail('${escapeForHandler(version)}', '${escapedTask}')">`;
                html += `<td style="font-weight: 600;">${taskDisplayHtml}</td>`;
                html += `<td>${members}</td>`;
                html += `<td style="text-align: right;">
                    <div style="font-weight: 700; color: #1976d2;">${formatNumber(total, 1)}h</div>
                    <div class="manpower-display" style="font-size: 13px; color: #666;">${formatNumber(days, 1)}人日 / ${formatNumber(months, 2)}人月</div>
                </td>`;
                html += '</tr>';
            });

            html += `<tr style="background: #f5f5f5; font-weight: 700;">`;
            html += `<td style="text-align: right; padding-right: 20px;">その他工数 合計</td>`;
            html += `<td></td>`;
            html += `<td style="text-align: right;">
                <div>${formatNumber(versionTotal, 1)}h</div>
                <div style="font-size: 15px; margin-bottom: 3px;">${formatNumber(versionDays, 1)}人日 / ${formatNumber(versionMonths, 2)}人月</div>
            </td>`;
            html += `</tr>`;

            html += '</table></div>';
            html += '</div>';
            return;
        }

        html += `<div style="margin-bottom: 30px;">`;
        html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${versionDisplay}</h3>`;
        html += '<div class="table-wrapper"><table class="estimate-grouped">';

        if (workMonthSelectionMode) {
            html += '<tr><th style="min-width: 50px;">選択</th><th style="min-width: 200px;">対応名</th><th style="min-width: 80px;">工程</th><th style="min-width: 80px;">担当</th><th style="min-width: 80px;">工数</th><th style="min-width: 150px;">対応合計</th></tr>';
        } else {
            html += '<tr><th style="min-width: 200px;">対応名</th><th style="min-width: 80px;">工程</th><th style="min-width: 80px;">担当</th><th style="min-width: 80px;">工数</th><th style="min-width: 150px;">対応合計</th></tr>';
        }

        Object.values(versionGroups[version]).forEach(taskGroup => {
            const total = taskGroup.processes.reduce((sum, p) => sum + p.hours, 0);
            const days = total / 8;
            const months = total / 8 / workingDaysPerMonth;

            const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
            const sortedProcesses = taskGroup.processes.sort((a, b) =>
                processOrder.indexOf(a.process) - processOrder.indexOf(b.process)
            );

            const taskWorkMonths = getTaskWorkMonths(version, taskGroup.task);

            let workMonthBadgeInline = '';
            let workMonthBadgeBlock = '';

            if (taskWorkMonths.length === 0) {
                workMonthBadgeInline = ' <span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">未設定</span>';
                workMonthBadgeBlock = '<div style="margin-top: 4px;"><span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">未設定</span></div>';
            } else if (taskWorkMonths.length === 1) {
                const [y, m] = taskWorkMonths[0].split('-');
                workMonthBadgeInline = ` <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y}年${parseInt(m)}月</span>`;
                workMonthBadgeBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y}年${parseInt(m)}月</span></div>`;
            } else {
                const [y1, m1] = taskWorkMonths[0].split('-');
                const [y2, m2] = taskWorkMonths[taskWorkMonths.length - 1].split('-');
                workMonthBadgeInline = ` <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月</span>`;
                workMonthBadgeBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">${y1}年${parseInt(m1)}月</span> <span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: normal; white-space: nowrap;">〜${y2}年${parseInt(m2)}月</span></div>`;
            }

            let taskDisplayHtml = escapeHtml(taskGroup.task);
            if (taskGroup.task.includes(':') || taskGroup.task.includes('：')) {
                let separator = ':';
                let parts;
                if (taskGroup.task.includes(':')) {
                    parts = taskGroup.task.split(':');
                } else {
                    separator = '：';
                    parts = taskGroup.task.split('：');
                }
                const restPart = escapeHtml(parts.slice(1).join(separator));
                taskDisplayHtml = `${escapeHtml(parts[0])}<span class="task-separator-inline">${separator} ${restPart}</span><span class="task-separator-break"><br><span style="font-size: 13px; font-weight: normal;">${restPart}</span></span>`;
            }

            taskDisplayHtml += `<span class="work-month-inline">${workMonthBadgeInline}</span><span class="work-month-block">${workMonthBadgeBlock}</span>`;

            const taskIds = taskGroup.processes.map(p => p.id);
            const allSelected = taskIds.every(id => selectedEstimateIds.has(id));

            sortedProcesses.forEach((proc, index) => {
                const estimate = estimates.find(e => e.id === proc.id);
                const est = normalizeEstimate(estimate);
                const isOutOfFilter = proc.isOutOfFilter || false;
                const grayStyle = isOutOfFilter ? 'opacity: 0.4;' : '';
                const grayPrefix = isOutOfFilter ? '○ ' : '';

                let processWorkMonthInline = '';
                let processWorkMonthBlock = '';

                if (est.workMonths.length > 0) {
                    if (est.workMonths.length === 1) {
                        const [y, m] = est.workMonths[0].split('-');
                        processWorkMonthInline = `<span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px; white-space: nowrap;">${y}年${parseInt(m)}月</span>`;
                        processWorkMonthBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap;">${y}年${parseInt(m)}月</span></div>`;
                    } else {
                        const [y1, m1] = est.workMonths[0].split('-');
                        const [y2, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                        processWorkMonthInline = `<span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px; white-space: nowrap;">${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月</span>`;
                        processWorkMonthBlock = `<div style="margin-top: 4px;"><span style="background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap;">${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月</span></div>`;
                    }
                } else {
                    processWorkMonthInline = `<span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px; white-space: nowrap;">未設定</span>`;
                    processWorkMonthBlock = `<div style="margin-top: 4px;"><span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; white-space: nowrap;">未設定</span></div>`;
                }

                html += '<tr>';

                if (workMonthSelectionMode) {
                    if (index === 0) {
                        html += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; text-align: center; cursor: pointer;" onclick="selectTaskEstimates('${escapeForHandler(version)}', '${escapeForHandler(taskGroup.task)}', event)">
                            <input type="checkbox" ${allSelected ? 'checked' : ''} style="width: auto; cursor: pointer;" onclick="selectTaskEstimates('${escapeForHandler(version)}', '${escapeForHandler(taskGroup.task)}', event)">
                        </td>`;
                    }
                }

                if (index === 0) {
                    html += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; font-weight: 600;">${taskDisplayHtml}</td>`;
                }

                if (workMonthSelectionMode) {
                    const isSelected = selectedEstimateIds.has(proc.id);
                    html += `<td style="cursor: pointer; ${grayStyle}" onclick="toggleEstimateSelection(${proc.id}, event)">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} style="width: auto; margin-right: 6px; cursor: pointer;" onclick="toggleEstimateSelection(${proc.id}, event)">
                        <div>
                            <span>${grayPrefix}</span><span class="badge badge-${escapeHtml(proc.process.toLowerCase())}">${escapeHtml(proc.process)}</span>
                            <span class="work-month-inline">${processWorkMonthInline}</span>
                        </div>
                        <div class="work-month-block">${processWorkMonthBlock}</div>
                    </td>`;
                } else {
                    html += `<td class="clickable-cell" style="cursor: pointer; ${grayStyle}" onclick="showEstimateDetail(${proc.id})"><span>${grayPrefix}</span><span class="badge badge-${escapeHtml(proc.process.toLowerCase())}">${escapeHtml(proc.process)}</span></td>`;
                }

                html += `<td style="${grayStyle}">${escapeHtml(proc.member)}</td>`;
                html += `<td style="text-align: right; ${grayStyle}">${proc.hours}h</td>`;

                if (index === 0) {
                    html += `<td rowspan="${sortedProcesses.length}" style="vertical-align: top; padding-top: 12px; text-align: right;">
                        <div style="font-weight: 700; color: #1976d2; font-size: 16px; margin-bottom: 4px;">${formatNumber(total, 1)}h</div>
                        <div class="manpower-display" style="font-size: 13px; color: #666;">${formatNumber(days, 1)}人日 / ${formatNumber(months, 2)}人月</div>
                    </td>`;
                }

                html += '</tr>';
            });
        });

        const versionTotal = Object.values(versionGroups[version])
            .reduce((sum, taskGroup) => sum + taskGroup.processes.reduce((s, p) => s + p.hours, 0), 0);
        const versionDays = versionTotal / 8;
        const versionMonths = versionTotal / 8 / workingDaysPerMonth;

        const versionLabel = version || 'その他工数';
        html += `<tr style="background: #f5f5f5; font-weight: 700;">`;
        if (workMonthSelectionMode) {
            html += `<td></td>`;
        }
        html += `<td style="text-align: right; padding-right: 20px;">${versionLabel} 合計</td>`;
        html += `<td colspan="2"></td>`;
        html += `<td style="text-align: right;">${formatNumber(versionTotal, 1)}h</td>`;
        html += `<td style="text-align: right;">
            <div style="font-size: 15px; margin-bottom: 3px;">${formatNumber(versionDays, 1)}人日 / ${formatNumber(versionMonths, 2)}人月</div>
        </td>`;
        html += `</tr>`;

        html += '</table></div>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * マトリクス形式での見積一覧描画
 */
export function renderEstimateMatrix() {
    const container = document.getElementById('estimateList');

    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const workMonthFilter = monthFilterElement ? monthFilterElement.value : 'all';
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';

    const { workingDaysPerMonth } = calculateConversionBasis(workMonthFilter, filteredEstimates);

    const usedMonths = new Set();
    let hasMultipleMonths = false;
    let hasUnassigned = false;

    const versionGroups = {};
    filteredEstimates.forEach(e => {
        if (!versionGroups[e.version]) {
            versionGroups[e.version] = {};
        }
        const taskKey = e.task;
        if (!versionGroups[e.version][taskKey]) {
            versionGroups[e.version][taskKey] = {
                task: e.task,
                processes: {}
            };
        }

        const est = normalizeEstimate(e);
        let displayHours = e.hours;
        if (workMonthFilter !== 'all' && est.monthlyHours && est.monthlyHours[workMonthFilter]) {
            displayHours = est.monthlyHours[workMonthFilter];
        }

        if (est.workMonths && est.workMonths.length > 0) {
            est.workMonths.forEach(m => usedMonths.add(m));
            if (est.workMonths.length > 1) {
                hasMultipleMonths = true;
            }
        } else {
            hasUnassigned = true;
        }

                // 工程が空の場合はIDをキーにして上書きを防止（その他工数は同じ空工程の複数アイテムがある）
        const processKey = e.process || `_${e.id}`;
        versionGroups[e.version][taskKey].processes[processKey] = {
            member: e.member,
            hours: displayHours,
            id: e.id,
            workMonths: est.workMonths || []
        };
    });

    const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const showMonthColors = showMonthColorsSetting;

    let html = '<div style="margin-bottom: 30px;">';

    if (showMonthColors) {
        html += generateMonthColorLegend(usedMonths, hasMultipleMonths, hasUnassigned);
    }

    // その他工数（空文字版）を末尾に配置するソート
    const sortedMatrixVersionKeys = Object.keys(versionGroups).sort((a, b) => {
        if (a === '' && b !== '') return 1;
        if (a !== '' && b === '') return -1;
        return a.localeCompare(b);
    });

    sortedMatrixVersionKeys.forEach(version => {
        const versionDisplay = escapeHtml(version) || 'その他工数';
        const isOtherWorkVersion = !version;

        // その他工数の場合、対応名と合計のみの簡略表示
        if (isOtherWorkVersion) {
            html += `<div style="margin-bottom: 30px;">`;
            html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${versionDisplay}</h3>`;
            html += '<div class="table-wrapper"><table class="estimate-matrix">';
            html += '<tr><th style="min-width: 200px;">対応名</th><th style="min-width: 80px; text-align: center;">担当</th><th style="min-width: 80px; text-align: center;">合計</th></tr>';

            Object.values(versionGroups[version]).forEach(group => {
                let taskDisplayHtml = escapeHtml(group.task) || '(未設定)';

                let total = 0;
                const members = new Set();
                Object.values(group.processes).forEach(p => {
                    total += p.hours;
                    members.add(p.member);
                });

                const totalDays = total / 8;
                const totalMonths = totalDays / workingDaysPerMonth;

                const escapedTask = escapeForHandler(group.task || '');
                html += `<tr style="cursor: pointer;" onclick="showOtherWorkTaskDetail('${escapeForHandler(version)}', '${escapedTask}')">`;
                html += `<td style="font-weight: 600;">${taskDisplayHtml}</td>`;
                html += `<td style="text-align: center;">${escapeHtml([...members].join(', '))}</td>`;
                html += `<td style="text-align: center;">
                    <div style="font-weight: 700; color: #1976d2;">${total.toFixed(1)}h</div>
                    <div style="font-size: 11px; color: #666;">${totalDays.toFixed(1)}人日</div>
                    <div style="font-size: 11px; color: #666;">${totalMonths.toFixed(2)}人月</div>
                </td>`;
                html += '</tr>';
            });

            html += '</table></div>';
            html += '</div>';
            return;
        }

        html += `<div style="margin-bottom: 30px;">`;
        html += `<h3 class="version-header theme-bg theme-${currentThemeColor}" style="color: white; padding: 12px 20px; border-radius: 8px; margin: 0 0 15px 0; font-size: 18px;">${versionDisplay}</h3>`;
        html += '<div class="table-wrapper"><table class="estimate-matrix">';
        html += '<tr><th style="min-width: 200px;">対応名</th>';
        processOrder.forEach(proc => {
            html += `<th style="min-width: 100px; text-align: center;">${proc}</th>`;
        });
        html += '<th style="min-width: 80px; text-align: center;">合計</th></tr>';

        Object.values(versionGroups[version]).forEach(group => {
            let taskDisplayHtml = escapeHtml(group.task);
            if (group.task.includes('：')) {
                const parts = group.task.split('：');
                const restPart = escapeHtml(parts.slice(1).join('：'));
                taskDisplayHtml = `${escapeHtml(parts[0])}<br><span style="font-size: 13px; font-weight: normal;">${restPart}</span>`;
            }

            const escapedVer = escapeForHandler(version);
            const escapedTsk = escapeForHandler(group.task);

            html += '<tr>';
            html += `<td class="clickable-cell" style="font-weight: 600; cursor: pointer;"
                onclick="showTaskDetail('${escapedVer}', '${escapedTsk}')"
                onmouseover="this.style.color='var(--theme-color, #1976d2)'"
                onmouseout="this.style.color=''">${taskDisplayHtml}</td>`;

            let total = 0;
            processOrder.forEach(proc => {
                if (group.processes[proc]) {
                    const p = group.processes[proc];
                    total += p.hours;

                    const monthColor = showMonthColors ? getMonthColor(p.workMonths) : { bg: '', tooltip: '' };
                    const bgStyle = showMonthColors ? `background: ${monthColor.bg};` : '';

                    html += `<td class="clickable-cell" style="text-align: center; cursor: pointer; transition: background 0.2s; ${bgStyle}"
                        onclick="showEstimateDetail(${p.id})"
                        ${showMonthColors ? `title="${monthColor.tooltip}"` : ''}
                        onmouseover="this.style.background='#e3f2fd'"
                        onmouseout="this.style.background='${showMonthColors ? monthColor.bg : ''}'">
                        <div style="font-weight: 600;">${p.hours.toFixed(1)}h</div>
                        <div style="font-size: 12px; color: #666;">(${escapeHtml(p.member)})</div>
                    </td>`;
                } else {
                    html += `<td style="text-align: center; color: #ccc;">-</td>`;
                }
            });

            const totalDays = total / 8;
            const totalMonths = totalDays / workingDaysPerMonth;

            html += `<td style="text-align: center;">
                <div style="font-weight: 700; color: #1976d2;">${total.toFixed(1)}h</div>
                <div style="font-size: 11px; color: #666;">${totalDays.toFixed(1)}人日</div>
                <div style="font-size: 11px; color: #666;">${totalMonths.toFixed(2)}人月</div>
            </td>`;
            html += '</tr>';
        });

        html += '</table></div>';
        html += '</div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * 詳細リスト形式での見積一覧描画
 */
export function renderEstimateDetailList() {
    const container = document.getElementById('estimateList');

    const monthFilterElement = document.getElementById('estimateMonthFilter');
    const filterTypeElement = document.getElementById('estimateFilterType');
    const workMonthFilter = monthFilterElement ? monthFilterElement.value : 'all';
    const filterType = filterTypeElement ? filterTypeElement.value : 'month';

    let html = '<div class="table-wrapper"><table><tr><th>版数</th><th>対応名</th><th>工程</th><th>担当</th><th>見積工数</th><th>作業予定月</th><th>操作</th></tr>';

    filteredEstimates.forEach(e => {
        const est = normalizeEstimate(e);

        let displayHours = est.hours;
        if (filterType === 'month' && workMonthFilter !== 'all' && est.monthlyHours[workMonthFilter]) {
            displayHours = est.monthlyHours[workMonthFilter];
        }

        let workMonthDisplay = '-';
        if (est.workMonths.length > 0) {
            if (est.workMonths.length === 1) {
                const [y, m] = est.workMonths[0].split('-');
                workMonthDisplay = `${y}年${parseInt(m)}月`;
            } else {
                const [y1, m1] = est.workMonths[0].split('-');
                const [y2, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                workMonthDisplay = `${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月`;
                workMonthDisplay += '<br><small style="color: #666;">';
                est.workMonths.forEach((month, idx) => {
                    const [y, m] = month.split('-');
                    const hours = est.monthlyHours[month] || 0;
                    if (idx > 0) workMonthDisplay += ', ';
                    workMonthDisplay += `${y}年${parseInt(m)}月:${hours.toFixed(1)}h`;
                });
                workMonthDisplay += '</small>';
            }
        }

        html += `
            <tr>
                <td>${escapeHtml(est.version)}</td>
                <td>${escapeHtml(est.task)}</td>
                <td><span class="badge badge-${escapeHtml(est.process.toLowerCase())}">${escapeHtml(est.process)}</span></td>
                <td>${escapeHtml(est.member)}</td>
                <td>${displayHours.toFixed(1)}h</td>
                <td>${workMonthDisplay}</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="editEstimate(${est.id})" style="margin-right: 5px;">編集</button>
                    <button class="btn btn-small" onclick="openSplitEstimateModal(${est.id})" style="margin-right: 5px; background: var(--info); color: white;">分割</button>
                    <button class="btn btn-danger btn-small" onclick="deleteEstimate(${est.id})">削除</button>
                </td>
            </tr>
        `;
    });

    html += '</table></div>';
    container.innerHTML = html;
}

// ============================================
// 見積CRUD操作
// ============================================

/**
 * 見積を削除
 */
export function deleteEstimate(id) {
    const estimate = estimates.find(e => e.id === id);
    if (!estimate) return;

    const detail = `この見積を削除しますか？\n\n対応名: ${estimate.task}\n工程: ${estimate.process}\n工数: ${estimate.hours}h\n担当: ${estimate.member}`;
    if (!confirm(detail)) return;

    const warning = '【警告】この操作は取り消せません。\n本当に削除してもよろしいですか？';
    if (!confirm(warning)) return;

    // 関連するスケジュールを検索
    const relatedSchedule = schedules.find(s =>
        s.version === estimate.version &&
        s.task === estimate.task &&
        s.process === estimate.process &&
        s.member === estimate.member
    );

    if (relatedSchedule) {
        if (confirm('対応するスケジュールも削除しますか？')) {
            if (typeof window.deleteSchedule === 'function') {
                window.deleteSchedule(relatedSchedule.id);
            }
            if (typeof window.showToast === 'function') {
                window.showToast('関連するスケジュールも削除しました', 'success');
            }
        } else {
            if (typeof window.showToast === 'function') {
                window.showToast('スケジュールは残っています', 'info');
            }
        }
    }

    // 関連する見込み残存データも削除
    deleteRemainingEstimate(estimate.version, estimate.task, estimate.process, estimate.member);

    const newEstimates = estimates.filter(e => e.id !== id);
    setEstimates(newEstimates);

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateEstimateVersionOptions === 'function') window.updateEstimateVersionOptions();
    renderEstimateList();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.renderScheduleView === 'function') window.renderScheduleView();
    showAlert('見積を削除しました', true);
}

/**
 * 対応ごと削除
 */
export function deleteTask(version, task) {
    const taskEstimates = estimates.filter(e => e.version === version && e.task === task);
    if (taskEstimates.length === 0) return;

    // 関連するスケジュールを検索
    const relatedSchedules = schedules.filter(s =>
        s.version === version && s.task === task
    );

    const processes = taskEstimates.map(e => e.process).join(', ');
    const totalHours = taskEstimates.reduce((sum, e) => sum + e.hours, 0);

    const detail = `この対応を削除しますか？\n\n版数: ${version}\n対応名: ${task}\n工程数: ${taskEstimates.length}件\n工程: ${processes}\n合計工数: ${totalHours}h`;
    if (!confirm(detail)) return;

    const warning = '【警告】この操作は取り消せません。\nこの対応に含まれる全ての工程が削除されます。\n本当に削除してもよろしいですか？';
    if (!confirm(warning)) return;

    // 関連するスケジュールを削除
    if (relatedSchedules.length > 0) {
        if (confirm(`対応するスケジュール（${relatedSchedules.length}件）も削除しますか？`)) {
            relatedSchedules.forEach(s => {
                if (typeof window.deleteSchedule === 'function') {
                    window.deleteSchedule(s.id);
                }
            });
            if (typeof window.showToast === 'function') {
                window.showToast(`関連するスケジュール${relatedSchedules.length}件を削除しました`, 'success');
            }
        }
    }

    // 関連する見込み残存データも削除
    taskEstimates.forEach(est => {
        deleteRemainingEstimate(est.version, est.task, est.process, est.member);
    });

    const newEstimates = estimates.filter(e => !(e.version === version && e.task === task));
    setEstimates(newEstimates);

    if (typeof window.saveData === 'function') window.saveData();
    renderEstimateList();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.renderScheduleView === 'function') window.renderScheduleView();
    showAlert('対応を削除しました', true);
}

// ============================================
// 作業月関連
// ============================================

/**
 * 作業月オプションを更新
 */
export function updateWorkMonthOptions() {
    const select = document.getElementById('assignWorkMonth');
    if (!select) return;

    const filter = document.getElementById('estimateMonthFilter');

    const months = new Set();

    estimates.forEach(e => {
        if (e.workMonth) {
            months.add(e.workMonth);
        }
    });

    actuals.forEach(a => {
        if (a.date) {
            const month = a.date.substring(0, 7);
            months.add(month);
        }
    });

    const now = new Date();
    for (let i = -3; i <= 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthStr);
    }

    const sortedMonths = Array.from(months).sort();

    select.innerHTML = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        return `<option value="${m}">${year}年${parseInt(month)}月</option>`;
    }).join('');

    // filterの更新はui.jsのupdateEstimateMonthOptionsで行うため削除
    // if (filter) { ... }
}

// ============================================
// 見積詳細モーダル
// ============================================

/**
 * 見積詳細モーダルを表示
 * @param {number} estimateId - 見積ID
 */
export function showEstimateDetail(estimateId) {
    const estimate = estimates.find(e => e.id === estimateId);
    if (!estimate) return;

    const est = normalizeEstimate(estimate);
    const isClassic = window.modalDesignStyle === 'classic';

    const isOther = isOtherWork(est);
    let html;

    if (isClassic) {
        // クラシック: main と同じレイアウト
        document.getElementById('estimateDetailModalTitle').textContent = isOther ? `その他工数 - ${est.task}` : `見積詳細 - ${est.task}`;

        let workMonthDisplay = '<span style="color: #999;">未設定</span>';
        if (est.workMonths && est.workMonths.length > 0) {
            if (est.workMonths.length === 1) {
                const [y, m] = est.workMonths[0].split('-');
                workMonthDisplay = `${y}年${parseInt(m)}月`;
            } else {
                const months = est.workMonths.map(wm => {
                    const [y, m] = wm.split('-');
                    const hours = est.monthlyHours && est.monthlyHours[wm] ? est.monthlyHours[wm].toFixed(1) : '0.0';
                    return `${y}年${parseInt(m)}月: ${hours}h`;
                });
                workMonthDisplay = months.join('<br>');
            }
        }

        html = `
            <div class="estimate-detail-item">
                ${isOther ? '' : `<div class="estimate-detail-row">
                    <span class="estimate-detail-label">版数:</span>
                    <span class="estimate-detail-value">${escapeHtml(est.version) || '(なし)'}</span>
                </div>`}
                <div class="estimate-detail-row">
                    <span class="estimate-detail-label">対応名:</span>
                    <span class="estimate-detail-value">${escapeHtml(est.task)}</span>
                </div>
                ${isOther ? '' : `<div class="estimate-detail-row">
                    <span class="estimate-detail-label">工程:</span>
                    <span class="estimate-detail-value"><span class="badge badge-${escapeHtml(est.process.toLowerCase())}">${escapeHtml(est.process)}</span></span>
                </div>`}
                <div class="estimate-detail-row">
                    <span class="estimate-detail-label">担当:</span>
                    <span class="estimate-detail-value">${escapeHtml(est.member)}</span>
                </div>
                <div class="estimate-detail-row">
                    <span class="estimate-detail-label">見積工数:</span>
                    <span class="estimate-detail-value" style="font-weight: 700; color: #1976d2; font-size: 18px;">${est.hours.toFixed(1)}h</span>
                </div>
                <div class="estimate-detail-row">
                    <span class="estimate-detail-label">作業予定月:</span>
                    <span class="estimate-detail-value">${workMonthDisplay}</span>
                </div>
            </div>
            <div style="margin-top: 20px; text-align: center; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button onclick="editEstimateFromModal(${est.id})"
                        style="padding: 10px 20px; background: var(--info); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    編集
                </button>
                <button onclick="deleteEstimateFromModal(${est.id})"
                        style="padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    削除
                </button>
            </div>
        `;
    } else {
        // モダン: 新デザイン
        document.getElementById('estimateDetailModalTitle').textContent = isOther ? `その他工数` : '見積詳細';

        let workMonthCards = '';
        if (est.workMonths && est.workMonths.length > 0) {
            const monthItems = est.workMonths.map(wm => {
                const [y, m] = wm.split('-');
                const hours = est.monthlyHours && est.monthlyHours[wm] ? est.monthlyHours[wm].toFixed(1) : null;
                if (est.workMonths.length === 1) {
                    return `<span class="ed-month-tag">${y}年${parseInt(m)}月</span>`;
                }
                return `<span class="ed-month-tag">${y}年${parseInt(m)}月<strong>${hours || '0.0'}h</strong></span>`;
            });
            workMonthCards = monthItems.join('');
        }

        html = `
            <div class="ed-hero">
                ${isOther ? '' : `<div class="ed-version">${escapeHtml(est.version) || '版数なし'}</div>`}
                <div class="ed-task-name">${escapeHtml(est.task)}</div>
                <div class="ed-hours-row">
                    ${isOther ? '' : `<span class="badge badge-${escapeHtml(est.process.toLowerCase())}">${escapeHtml(est.process)}</span>`}
                    <span class="ed-hours">${est.hours.toFixed(1)}<span class="ed-hours-unit">h</span></span>
                </div>
                <div class="ed-hours-label">見積工数</div>
            </div>
            <div class="ed-meta">
                <span class="ed-meta-item"><span class="ed-meta-label">担当</span>${escapeHtml(est.member)}</span>
            </div>
            ${workMonthCards ? `
            <div class="ed-section">
                <div class="ed-section-label">作業予定月</div>
                <div class="ed-months">${workMonthCards}</div>
            </div>
            ` : ''}
            <div class="ed-actions">
                <button class="btn btn-primary" onclick="editEstimateFromModal(${est.id})">編集</button>
                <a href="#" class="ed-delete-link" onclick="event.preventDefault(); deleteEstimateFromModal(${est.id})">削除</a>
            </div>
        `;
    }

    document.getElementById('estimateDetailModalBody').innerHTML = html;
    document.getElementById('estimateDetailModal').style.display = 'flex';
}

/**
 * 対応詳細モーダルを表示（全工程の一覧 + 未登録工程の追加）
 * @param {string} version - 版数
 * @param {string} task - 対応名
 */
export function showTaskDetail(version, task) {
    const processOrder = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const taskEstimates = estimates.filter(e => e.version === version && e.task === task);
    if (taskEstimates.length === 0) return;

    // 工程ごとにグループ化（同一工程に複数見積がある場合も対応）
    const processEstimates = {};
    processOrder.forEach(proc => {
        processEstimates[proc] = taskEstimates.filter(e => e.process === proc);
    });

    const totalHours = taskEstimates.reduce((sum, e) => sum + e.hours, 0);
    const existingCount = processOrder.filter(proc => processEstimates[proc].length > 0).length;
    const totalDays = totalHours / 8;
    const totalMonths = totalDays / 20;

    const escapedVersion = escapeForHandler(version);
    const escapedTask = escapeForHandler(task);

    const isClassic = window.modalDesignStyle === 'classic';
    let html;

    if (isClassic) {
        document.getElementById('estimateDetailModalTitle').textContent = `対応詳細 - ${task}`;

        html = `<div style="margin-bottom: 12px; font-size: 14px; color: #666;">版数: ${escapeHtml(version)} | 合計: <strong style="color: #1976d2;">${totalHours.toFixed(1)}h</strong> (${totalDays.toFixed(1)}人日)</div>`;
        html += '<div style="display: flex; flex-direction: column; gap: 10px;">';

        processOrder.forEach(proc => {
            const ests = processEstimates[proc];
            if (ests.length > 0) {
                ests.forEach(estimate => {
                    const est = normalizeEstimate(estimate);
                    let workMonthDisplay = '';
                    if (est.workMonths && est.workMonths.length > 0) {
                        if (est.workMonths.length === 1) {
                            const [y, m] = est.workMonths[0].split('-');
                            workMonthDisplay = `${parseInt(m)}月`;
                        } else {
                            const [, m1] = est.workMonths[0].split('-');
                            const [, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                            workMonthDisplay = `${parseInt(m1)}月〜${parseInt(m2)}月`;
                        }
                    }

                    html += `<div style="background: #f8f9fa; border-radius: 8px; padding: 12px; border: 1px solid #e9ecef;">`;
                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">`;
                    html += `<span><span class="badge badge-${proc.toLowerCase()}" style="margin-right: 8px;">${proc}</span>${escapeHtml(est.member)}</span>`;
                    html += `<span style="font-weight: 700; color: #1976d2;">${est.hours.toFixed(1)}h</span>`;
                    html += `</div>`;
                    if (workMonthDisplay) {
                        html += `<div style="font-size: 12px; color: #666; margin-bottom: 6px;">作業月: ${workMonthDisplay}</div>`;
                    }
                    html += `<div style="display: flex; gap: 8px; justify-content: flex-end;">`;
                    html += `<button onclick="editEstimateFromModal(${est.id})" style="padding: 4px 12px; background: var(--info); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">編集</button>`;
                    html += `<button onclick="deleteEstimateFromTaskModal('${escapedVersion}', '${escapedTask}', ${est.id})" style="padding: 4px 12px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">削除</button>`;
                    html += `</div></div>`;
                });
            } else {
                html += `<div style="background: #fafafa; border-radius: 8px; padding: 12px; border: 1px dashed #ccc; opacity: 0.6;">`;
                html += `<div style="display: flex; justify-content: space-between; align-items: center;">`;
                html += `<span><span class="badge badge-${proc.toLowerCase()}" style="margin-right: 8px;">${proc}</span><span style="color: #999;">未登録</span></span>`;
                html += `<button onclick="addProcessFromTaskModal('${escapedVersion}', '${escapedTask}', '${proc}')" style="padding: 4px 12px; background: #198754; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">追加</button>`;
                html += `</div></div>`;
            }
        });

        html += '</div>';
        html += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #dee2e6; display: flex; justify-content: space-between; align-items: center;">`;
        html += `<button onclick="editTaskFromTaskModal('${escapedVersion}', '${escapedTask}')" style="padding: 6px 14px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">対応名を編集</button>`;
        html += `<button onclick="deleteTaskFromModal('${escapedVersion}', '${escapedTask}')" style="padding: 6px 14px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">対応を全削除</button>`;
        html += `</div>`;
    } else {
        // モダン: Quiet Depth デザイン
        document.getElementById('estimateDetailModalTitle').textContent = '対応詳細';

        html = `
            <div class="ed-hero">
                <div class="ed-version">${escapeHtml(version)}</div>
                <div class="ed-task-name">${escapeHtml(task)}</div>
                <div class="ed-hours-row">
                    <span class="ed-hours">${totalHours.toFixed(1)}<span class="ed-hours-unit">h</span></span>
                </div>
                <div class="ed-hours-label">${existingCount}工程 / 合計見積工数</div>
            </div>
            <div class="ed-section">
                <div class="ed-section-label">工程別内訳</div>
        `;

        processOrder.forEach(proc => {
            const ests = processEstimates[proc];
            if (ests.length > 0) {
                ests.forEach(estimate => {
                    const est = normalizeEstimate(estimate);
                    let monthTag = '';
                    if (est.workMonths && est.workMonths.length > 0) {
                        if (est.workMonths.length === 1) {
                            const [, m] = est.workMonths[0].split('-');
                            monthTag = `<span class="ed-month-tag">${parseInt(m)}月</span>`;
                        } else {
                            const [, m1] = est.workMonths[0].split('-');
                            const [, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                            monthTag = `<span class="ed-month-tag">${parseInt(m1)}月〜${parseInt(m2)}月</span>`;
                        }
                    }

                    html += `
                        <div class="wd-card">
                            <div class="wd-card-header">
                                <div>
                                    <span class="badge badge-${proc.toLowerCase()}">${proc}</span>
                                    <span class="wd-card-title">${escapeHtml(est.member)}</span>
                                    ${monthTag}
                                </div>
                                <span class="wd-card-hours">${est.hours.toFixed(1)}h</span>
                            </div>
                            <div class="wd-card-actions">
                                <a href="#" class="wd-edit-link" onclick="event.preventDefault(); editEstimateFromModal(${est.id})">編集</a>
                                <a href="#" class="wd-delete-link" onclick="event.preventDefault(); deleteEstimateFromTaskModal('${escapedVersion}', '${escapedTask}', ${est.id})">削除</a>
                            </div>
                        </div>`;
                });
            } else {
                html += `
                    <div class="wd-card wd-card-empty">
                        <div class="wd-card-header">
                            <div>
                                <span class="badge badge-${proc.toLowerCase()}">${proc}</span>
                                <span style="color: #999; font-size: 13px;">未登録</span>
                            </div>
                            <span class="wd-card-hours" style="color: #ccc;">--</span>
                        </div>
                        <div class="wd-card-actions">
                            <a href="#" class="wd-edit-link" onclick="event.preventDefault(); addProcessFromTaskModal('${escapedVersion}', '${escapedTask}', '${proc}')">追加</a>
                        </div>
                    </div>`;
            }
        });

        html += '</div>';

        // 合計の人日/人月
        html += `
            <div class="ed-meta">
                <span class="ed-meta-item"><span class="ed-meta-label">人日</span>${totalDays.toFixed(1)}</span>
                <span class="ed-meta-item"><span class="ed-meta-label">人月</span>${totalMonths.toFixed(2)}</span>
            </div>
        `;

        html += `
            <div class="ed-actions">
                <button class="btn btn-secondary" onclick="editTaskFromTaskModal('${escapedVersion}', '${escapedTask}')">対応名を編集</button>
                <a href="#" class="ed-delete-link" onclick="event.preventDefault(); deleteTaskFromModal('${escapedVersion}', '${escapedTask}')">対応を全削除</a>
            </div>`;
    }

    document.getElementById('estimateDetailModalBody').innerHTML = html;
    document.getElementById('estimateDetailModal').style.display = 'flex';
}

/**
 * 対応詳細モーダルから未登録工程を追加
 */
export function addProcessFromTaskModal(version, task, process) {
    closeEstimateDetailModal();
    if (typeof window.openAddEstimateSingleProcess === 'function') {
        window.openAddEstimateSingleProcess(version, task, process);
    }
}

/**
 * 対応詳細モーダルから単一工程を削除（モーダルを再描画）
 */
export function deleteEstimateFromTaskModal(version, task, estimateId) {
    const beforeCount = estimates.length;
    deleteEstimate(estimateId);

    if (estimates.length < beforeCount) {
        const remaining = estimates.filter(e => e.version === version && e.task === task);
        if (remaining.length === 0) {
            closeEstimateDetailModal();
        } else {
            showTaskDetail(version, task);
        }
    }
}

/**
 * 対応詳細モーダルから対応を全削除
 */
export function deleteTaskFromModal(version, task) {
    closeEstimateDetailModal();
    deleteTask(version, task);
}

/**
 * 対応詳細モーダルから対応名を編集
 */
export function editTaskFromTaskModal(version, task) {
    closeEstimateDetailModal();
    if (typeof window.editTask === 'function') {
        window.editTask(version, task);
    }
}

/**
 * その他工数のタスク詳細を表示（同一タスクの全見積を一覧表示）
 * @param {string} version - 版数
 * @param {string} task - タスク名
 */
export function showOtherWorkTaskDetail(version, task) {
    const taskEstimates = filteredEstimates.filter(e => e.version === version && e.task === task);
    if (taskEstimates.length === 0) return;

    // 1件だけの場合は通常の詳細表示
    if (taskEstimates.length === 1) {
        showEstimateDetail(taskEstimates[0].id);
        return;
    }

    const isClassic = window.modalDesignStyle === 'classic';
    const totalHours = taskEstimates.reduce((sum, e) => sum + e.hours, 0);
    let html;

    if (isClassic) {
        document.getElementById('estimateDetailModalTitle').textContent = `その他工数 - ${task || '(未設定)'}`;

        html = '<div style="margin-bottom: 12px; font-size: 14px; color: #666;">このタスクには複数の見積があります</div>';
        html += '<div style="display: flex; flex-direction: column; gap: 12px;">';

        taskEstimates.forEach(estimate => {
            const est = normalizeEstimate(estimate);
            let workMonthDisplay = '<span style="color: #999;">未設定</span>';
            if (est.workMonths && est.workMonths.length > 0) {
                if (est.workMonths.length === 1) {
                    const [y, m] = est.workMonths[0].split('-');
                    workMonthDisplay = `${y}年${parseInt(m)}月`;
                } else {
                    const [y1, m1] = est.workMonths[0].split('-');
                    const [y2, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                    workMonthDisplay = `${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月`;
                }
            }

            html += `<div style="background: #f8f9fa; border-radius: 8px; padding: 12px; border: 1px solid #e9ecef;">`;
            html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">`;
            html += `<span style="font-weight: 600;">${escapeHtml(est.member)}</span>`;
            html += `<span style="font-weight: 700; color: #1976d2; font-size: 16px;">${est.hours.toFixed(1)}h</span>`;
            html += `</div>`;
            html += `<div style="font-size: 12px; color: #666; margin-bottom: 8px;">作業月: ${workMonthDisplay}</div>`;
            html += `<div style="display: flex; gap: 8px; justify-content: flex-end;">`;
            html += `<button onclick="editEstimateFromModal(${est.id})"
                        style="padding: 6px 14px; background: var(--info); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                        編集</button>`;
            html += `<button onclick="deleteEstimateFromModal(${est.id})"
                        style="padding: 6px 14px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                        削除</button>`;
            html += `</div></div>`;
        });

        html += '</div>';
        html += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #dee2e6; text-align: right;">`;
        html += `<span style="font-weight: 700; font-size: 16px;">合計: <span style="color: #1976d2;">${totalHours.toFixed(1)}h</span></span>`;
        html += `</div>`;
    } else {
        // モダン: Quiet Depth デザイン
        document.getElementById('estimateDetailModalTitle').textContent = 'その他工数';

        html = `
            <div class="ed-hero">
                <div class="ed-task-name">${escapeHtml(task) || '(未設定)'}</div>
                <div class="ed-hours-row">
                    <span class="ed-hours">${totalHours.toFixed(1)}<span class="ed-hours-unit">h</span></span>
                </div>
                <div class="ed-hours-label">${taskEstimates.length}名分の合計見積</div>
            </div>
            <div class="ed-section">
                <div class="ed-section-label">担当者別内訳</div>
        `;

        taskEstimates.forEach(estimate => {
            const est = normalizeEstimate(estimate);
            let monthTag = '';
            if (est.workMonths && est.workMonths.length > 0) {
                if (est.workMonths.length === 1) {
                    const [y, m] = est.workMonths[0].split('-');
                    monthTag = `<span class="ed-month-tag">${parseInt(m)}月</span>`;
                } else {
                    const [y1, m1] = est.workMonths[0].split('-');
                    const [y2, m2] = est.workMonths[est.workMonths.length - 1].split('-');
                    monthTag = `<span class="ed-month-tag">${parseInt(m1)}月〜${parseInt(m2)}月</span>`;
                }
            }

            html += `
                <div class="wd-card">
                    <div class="wd-card-header">
                        <div>
                            <span class="wd-card-title">${escapeHtml(est.member)}</span>
                            ${monthTag}
                        </div>
                        <span class="wd-card-hours">${est.hours.toFixed(1)}h</span>
                    </div>
                    <div class="wd-card-actions">
                        <a href="#" class="wd-edit-link" onclick="event.preventDefault(); editEstimateFromModal(${est.id})">編集</a>
                        <a href="#" class="wd-delete-link" onclick="event.preventDefault(); deleteEstimateFromModal(${est.id})">削除</a>
                    </div>
                </div>`;
        });

        html += '</div>';
    }

    document.getElementById('estimateDetailModalBody').innerHTML = html;
    document.getElementById('estimateDetailModal').style.display = 'flex';
}

/**
 * 見積詳細モーダルを閉じる
 */
export function closeEstimateDetailModal() {
    document.getElementById('estimateDetailModal').style.display = 'none';
}

/**
 * 見積詳細モーダルから編集画面へ
 * @param {number} id - 見積ID
 */
export function editEstimateFromModal(id) {
    closeEstimateDetailModal();
    if (typeof window.editEstimate === 'function') {
        window.editEstimate(id);
    }
}

/**
 * 見積詳細モーダルから削除実行
 * @param {number} id - 見積ID
 */
export function deleteEstimateFromModal(id) {
    const beforeCount = estimates.length;
    deleteEstimate(id);
    if (estimates.length < beforeCount) {
        closeEstimateDetailModal();
    }
}

console.log('✅ モジュール estimate.js loaded');
