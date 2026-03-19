// ============================================
// 実績管理モジュール (actual.js)
// ============================================

import {
    estimates, actuals, remainingEstimates,
    setActuals
} from './state.js';

import { showAlert, sortMembers, formatHours, normalizeEstimate, escapeHtml, escapeForHandler } from './utils.js';
import { saveRemainingEstimate, getRemainingEstimate, isOtherWork } from './estimate.js';
import { pushAction } from './history.js';

// ============================================
// カレンダー実績入力 検索式の状態管理
// ============================================

/** カレンダーからの実績入力で選択されたタスク情報 */
let selectedCalendarTask = null;

/** カレンダー実績入力のタスク一覧（検索・フィルタ用） */
let calendarTaskList = [];

// ============================================
// 祝日・曜日判定
// ============================================

/**
 * 曜日を取得
 */
export function getDayOfWeek(dateStr) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const date = new Date(dateStr);
    return days[date.getDay()];
}

/**
 * 祝日を判定
 * @param {string} dateStr - 'YYYY-MM-DD' 形式の日付文字列
 * @returns {string|null} 祝日名、祝日でなければ null
 */
export function getHoliday(dateStr) {
    if (typeof JapaneseHolidays !== 'undefined' && typeof JapaneseHolidays.isHoliday === 'function') {
        try {
            const date = new Date(dateStr + 'T00:00:00');
            const name = JapaneseHolidays.isHoliday(date);
            return name || null;
        } catch (error) {
            console.error('Holiday check error:', error);
        }
    }
    return null;
}

// ============================================
// 今日の実績表示
// ============================================

/**
 * 今日の実績を表示
 */
export function renderTodayActuals() {
    const today = new Date().toISOString().split('T')[0];
    const todayData = actuals.filter(a => a.date === today);

    const container = document.getElementById('todayActuals');

    if (todayData.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">まだ実績が入力されていません</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table><tr><th>時刻</th><th>版数</th><th>対応名</th><th>工程</th><th>担当</th><th style="text-align: right;">工数</th><th>操作</th></tr>';

    let totalHours = 0;
    todayData.forEach(a => {
        totalHours += a.hours;
        let time = '-';
        if (a.createdAt) {
            const date = new Date(a.createdAt);
            if (!isNaN(date.getTime())) {
                time = date.toLocaleTimeString('ja-JP');
            }
        }
        html += `
            <tr class="actual-row-clickable" onclick="editActual(${a.id})" title="クリックして編集">
                <td>${time}</td>
                <td>${escapeHtml(a.version)}</td>
                <td>${escapeHtml(a.task)}</td>
                <td><span class="badge badge-${escapeHtml(a.process.toLowerCase())}">${escapeHtml(a.process)}</span></td>
                <td>${escapeHtml(a.member)}</td>
                <td style="text-align: right;">${escapeHtml(String(a.hours))}h</td>
                <td>
                    <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); deleteActual(${a.id})">削除</button>
                </td>
            </tr>
        `;
    });

    html += `<tr style="background: var(--accent); color: #fff; font-weight: 700;">
        <td colspan="5" style="text-align: right;">合計</td>
        <td style="text-align: right;">${formatHours(totalHours)}h</td>
        <td></td>
    </tr>`;
    html += '</table></div>';
    container.innerHTML = html;
}

// ============================================
// 実績一覧
// ============================================

/**
 * 実績一覧のメイン描画関数
 */
/**
 * 実績一覧をレンダリング（メイン関数）
 * フィルタ・表示形式に応じて、カレンダー形式/マトリクス形式/リスト形式を描画
 * @returns {void}
 */
export function renderActualList() {
    const container = document.getElementById('actualList');
    const viewType = document.getElementById('actualViewType').value;

    // リスト表示時のみ担当者選択を表示（リストは常に担当者別）
    // カレンダー/グリッドは常に全担当者
    const memberSelectGroup = document.getElementById('memberSelectGroup');
    const memberSelectGroup2 = document.getElementById('memberSelectGroup2');
    if (viewType === 'list') {
        memberSelectGroup.style.display = 'flex';
        if (memberSelectGroup2) memberSelectGroup2.style.display = 'flex';
        updateMemberSelectOptions();
    } else {
        memberSelectGroup.style.display = 'none';
        if (memberSelectGroup2) memberSelectGroup2.style.display = 'none';
    }

    // 全期間選択時に実績データがない場合のみメッセージ表示
    // 特定月が選択されている場合はカレンダーを表示する
    const selectedMonth = document.getElementById('actualMonthFilter').value;
    if (actuals.length === 0 && selectedMonth === 'all') {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">実績データがありません</p>';
        return;
    }

    if (viewType === 'timeline') {
        // タイムラインビュー: 専用コンテナを表示
        container.style.display = 'none';
        const tlContainer = document.getElementById('actualTimeline');
        if (tlContainer) tlContainer.style.display = '';
        if (typeof window.renderActualTimeline === 'function') {
            window.renderActualTimeline();
        }
    } else {
        // 従来ビュー: actualListを表示、タイムラインを非表示
        container.style.display = '';
        const tlContainer = document.getElementById('actualTimeline');
        if (tlContainer) tlContainer.style.display = 'none';

        if (viewType === 'matrix') {
            // カレンダーは常に全担当者表示
            renderActualMatrix();
        } else if (viewType === 'grid') {
            renderCalendarGrid();
        } else {
            // リストは常に担当者別表示
            renderActualListView();
        }
    }

    // セグメントボタンのハイライトを更新
    if (typeof window.updateSegmentedButtons === 'function') {
        window.updateSegmentedButtons();
    }
}

/**
 * 担当者選択オプションを更新
 */
export function updateMemberSelectOptions() {
    const select = document.getElementById('actualMemberSelect');
    const select2 = document.getElementById('actualMemberSelect2');
    const currentValue = select.value;

    const allMembers = new Set();
    actuals.forEach(a => allMembers.add(a.member));
    estimates.forEach(e => allMembers.add(e.member));

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

    select.innerHTML = '';
    if (select2) select2.innerHTML = '';

    sortedMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        select.appendChild(option);

        if (select2) {
            const option2 = document.createElement('option');
            option2.value = member;
            option2.textContent = member;
            select2.appendChild(option2);
        }
    });

    if (currentValue && sortedMembers.includes(currentValue)) {
        select.value = currentValue;
        if (select2) select2.value = currentValue;
    } else if (sortedMembers.length > 0) {
        select.value = sortedMembers[0];
        if (select2) select2.value = sortedMembers[0];
    }

    // セグメントボタン版を生成
    const items = sortedMembers.map(member => ({
        value: member,
        label: member
    }));
    const selectedValue = select.value;
    if (typeof window.createSegmentButtons === 'function') {
        window.createSegmentButtons(
            'actualMemberButtons2',
            'actualMemberSelect2',
            items,
            selectedValue,
            6,
            typeof window.handleActualMemberChange === 'function' ? window.handleActualMemberChange : null
        );
    }
}

/**
 * 担当者別カレンダー表示
 */
/**
 * 担当者別カレンダー形式で実績を表示
 * 月別の日付×担当者マトリクスを生成し、祝日・休暇・その他作業を表示
 * @returns {void}
 */
export function renderMemberCalendar() {
    const container = document.getElementById('actualList');
    const selectedMonth = document.getElementById('actualMonthFilter').value;
    const selectedMember = document.getElementById('actualMemberSelect').value;

    if (!selectedMember) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">担当者を選択してください</p>';
        return;
    }

    let filteredActuals = actuals.filter(a => a.member === selectedMember);
    if (selectedMonth !== 'all') {
        filteredActuals = filteredActuals.filter(a => a.date && a.date.startsWith(selectedMonth));
    }

    // 全期間選択でデータがない場合のみメッセージ表示
    // 特定月が選択されている場合はデータがなくてもカレンダーを表示
    if (filteredActuals.length === 0 && selectedMonth === 'all') {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">選択した期間に実績データがありません</p>';
        return;
    }

    const dates = filteredActuals.map(a => a.date).sort();
    let startDate, endDate;

    if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        const yearNum = parseInt(year);
        const monthNum = parseInt(month);

        startDate = `${year}-${month}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (dates.length > 0) {
        const [minYear, minMonth] = dates[0].split('-');
        const [maxYear, maxMonth] = dates[dates.length - 1].split('-');

        startDate = `${minYear}-${minMonth}-01`;
        const lastDay = new Date(parseInt(maxYear), parseInt(maxMonth), 0).getDate();
        endDate = `${maxYear}-${maxMonth}-${String(lastDay).padStart(2, '0')}`;
    } else {
        // ここには到達しないはず（全期間でデータなしは上で早期リターン）
        return;
    }

    const allDates = [];
    let currentDateStr = startDate;
    while (currentDateStr <= endDate) {
        allDates.push(currentDateStr);
        const [y, m, d] = currentDateStr.split('-').map(Number);
        const nextDate = new Date(y, m - 1, d + 1);
        currentDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    }

    const totalHours = filteredActuals.reduce((sum, a) => sum + a.hours, 0);
    const workedDays = new Set(filteredActuals.map(a => a.date)).size;

    // 営業日数を計算（土日祝を除く）
    const businessDays = allDates.filter(date => {
        const dayOfWeek = getDayOfWeek(date);
        const holiday = getHoliday(date);
        const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';
        const isHoliday = holiday !== null;
        return !isWeekend && !isHoliday;
    }).length;

    let html = `<h3 style="margin-bottom: 10px;">${escapeHtml(selectedMember)}の実績カレンダー</h3>`;

    if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        html += `<div style="margin-bottom: 15px;">
            <p style="margin: 0 0 5px 0; font-weight: 600;">${year}年${parseInt(month)}月の合計</p>
            <p style="margin: 0; color: #666; font-size: 14px;">稼働日数: ${workedDays}日<span style="margin-left: 20px;">営業日数: ${businessDays}日</span><span style="margin-left: 20px;">合計工数: ${formatHours(totalHours)}h</span></p>
        </div>`;
    }

    html += '<div id="calendarTableWrapper" class="table-wrapper" style="overflow-x: auto;"><table style="min-width: 100%;">';
    html += '<tr><th style="min-width: 120px;">日付</th><th style="min-width: 300px;">作業内容</th><th style="min-width: 80px;">工数</th></tr>';

    allDates.forEach(date => {
        const dayOfWeek = getDayOfWeek(date);
        const holiday = getHoliday(date);
        const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';
        const isHoliday = holiday !== null;

        const dayActuals = filteredActuals.filter(a => a.date === date);

        const bgColor = (isWeekend || isHoliday) ? '#ffebee' : 'white';
        const dateColor = (isWeekend || isHoliday) ? 'color: #c62828;' : '';

        const [year, m, day] = date.split('-');
        const dateDisplay = isHoliday
            ? `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})<span class="holiday-inline"> ${escapeHtml(holiday)}</span><span class="holiday-break"><br><span style="font-size: 11px; font-weight: normal;">${escapeHtml(holiday)}</span></span>`
            : `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})`;

        if (dayActuals.length === 0) {
            html += `<tr style="background: ${bgColor};">`;
            html += `<td style="font-weight: 500; ${dateColor}">${dateDisplay}</td>`;
            html += `<td style="color: #999;">-</td>`;
            html += `<td style="text-align: center; color: #999;">-</td>`;
            html += `</tr>`;
        } else {
            dayActuals.forEach((actual, index) => {
                if (index === 0) {
                    html += `<tr style="background: ${bgColor};">`;
                    html += `<td rowspan="${dayActuals.length}" style="font-weight: 500; ${dateColor} vertical-align: top; padding-top: 12px;">${dateDisplay}</td>`;
                } else {
                    html += `<tr style="background: ${bgColor};">`;
                }
                html += `<td style="font-size: 14px;">${escapeHtml(actual.version)} - ${escapeHtml(actual.task)} [${escapeHtml(actual.process)}]</td>`;
                html += `<td style="text-align: center; font-weight: 600;">${actual.hours}h</td>`;
                html += `</tr>`;
            });
        }
    });

    html += `<tr style="background: #1565c0; color: white; font-weight: 700;">`;
    html += `<td>総合計</td>`;
    html += `<td style="text-align: right;">${workedDays}日稼働<span style="margin-left: 16px;">${businessDays}営業日</span></td>`;
    html += `<td style="text-align: center;">${formatHours(totalHours)}h</td>`;
    html += `</tr>`;

    html += '</table></div>';
    container.innerHTML = html;

    setupCalendarSwipe();
}

/**
 * カレンダースワイプ機能のセットアップ
 */
export function setupCalendarSwipe() {
    const wrapper = document.getElementById('calendarTableWrapper');
    if (!wrapper) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    wrapper.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleCalendarSwipe();
    }, { passive: true });

    function handleCalendarSwipe() {
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            const monthSelect = document.getElementById('actualMonthFilter');
            const monthSelect2 = document.getElementById('actualMonthFilter2');
            const currentIndex = monthSelect.selectedIndex;

            if (diffX > 0) {
                if (currentIndex < monthSelect.options.length - 1) {
                    monthSelect.selectedIndex = currentIndex + 1;
                    const newValue = monthSelect.value;
                    if (monthSelect2) monthSelect2.value = newValue;
                    if (typeof window.updateSegmentButtonSelection === 'function') {
                        window.updateSegmentButtonSelection('actualMonthButtons2', newValue);
                    }
                    monthSelect.dispatchEvent(new Event('change'));
                }
            } else {
                if (currentIndex > 1) {
                    monthSelect.selectedIndex = currentIndex - 1;
                    const newValue = monthSelect.value;
                    if (monthSelect2) monthSelect2.value = newValue;
                    if (typeof window.updateSegmentButtonSelection === 'function') {
                        window.updateSegmentButtonSelection('actualMonthButtons2', newValue);
                    }
                    monthSelect.dispatchEvent(new Event('change'));
                }
            }
        }
    }
}

/**
 * 実績マトリクス表示
 */
export function renderActualMatrix() {
    const container = document.getElementById('actualList');
    const selectedMonth = document.getElementById('actualMonthFilter').value;
    const memberOrderInput = document.getElementById('memberOrder').value.trim();

    let filteredActuals = actuals;
    if (selectedMonth !== 'all') {
        filteredActuals = actuals.filter(a => a.date && a.date.startsWith(selectedMonth));
    }

    // 全期間選択でデータがない場合のみメッセージ表示
    // 特定月が選択されている場合はデータがなくてもカレンダーを表示
    if (filteredActuals.length === 0 && selectedMonth === 'all') {
        container.innerHTML = '<p class="cm-no-data">選択した期間に実績データがありません</p>';
        return;
    }

    // メンバーリストは全実績・見積から取得（選択月にデータがなくても表示できるように）
    const allMembers = new Set();
    actuals.forEach(a => allMembers.add(a.member));
    estimates.forEach(e => allMembers.add(e.member));
    let members = [...allMembers];

    members = sortMembers(members, memberOrderInput);

    // メンバーがいない場合はメッセージ表示
    if (members.length === 0) {
        container.innerHTML = '<p class="cm-no-data">担当者データがありません</p>';
        return;
    }

    const dates = filteredActuals.map(a => a.date).sort();

    let startDate, endDate;
    if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        const yearNum = parseInt(year);
        const monthNum = parseInt(month);

        startDate = `${year}-${month}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    } else if (dates.length > 0) {
        const minDate = dates[0];
        const maxDate = dates[dates.length - 1];

        const [minYear, minMonth] = minDate.split('-');
        const [maxYear, maxMonth] = maxDate.split('-');

        startDate = `${minYear}-${minMonth}-01`;
        const lastDay = new Date(parseInt(maxYear), parseInt(maxMonth), 0).getDate();
        endDate = `${maxYear}-${maxMonth}-${String(lastDay).padStart(2, '0')}`;
    } else {
        // ここには到達しないはず
        return;
    }

    const allDates = [];
    let currentDateStr = startDate;
    while (currentDateStr <= endDate) {
        allDates.push(currentDateStr);
        const [y, m, d] = currentDateStr.split('-').map(Number);
        const nextDate = new Date(y, m - 1, d + 1);
        currentDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
    }

    // 営業日数を計算（土日祝を除く）
    const businessDays = allDates.filter(date => {
        const dayOfWeek = getDayOfWeek(date);
        const holiday = getHoliday(date);
        const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';
        const isHoliday = holiday !== null;
        return !isWeekend && !isHoliday;
    }).length;

    let html = '';

    if (selectedMonth !== 'all') {
        const [year, month] = selectedMonth.split('-');
        const workedDays = new Set(filteredActuals.map(a => a.date)).size;

        html += `<div class="cm-summary">
            <h3 class="cm-summary-title">${year}年${parseInt(month)}月の合計</h3>
            <p class="cm-summary-meta">稼働日数: ${workedDays}日<span class="cm-summary-spacer">営業日数: ${businessDays}日</span></p>
        </div>`;

        html += '<div id="calendarTableWrapper" class="table-wrapper"><table class="actual-matrix">';

        html += '<tr class="cm-row-month-header"><th class="cm-th-date">総合計</th>';

        let monthGrandTotal = 0;
        members.forEach(member => {
            const memberTotal = filteredActuals.filter(a => a.member === member).reduce((sum, a) => sum + a.hours, 0);
            monthGrandTotal += memberTotal;
            html += `<th class="cm-th-member-total">${formatHours(memberTotal)}h</th>`;
        });

        html += `<th class="cm-daily-total cm-th-daily-total-accent">${formatHours(monthGrandTotal)}h</th>`;
        html += '</tr>';

        html += '<tr><th class="cm-th-date">日付</th>';

        members.forEach(member => {
            html += `<th class="cm-th-member">${escapeHtml(member)}</th>`;
        });
        html += '<th class="cm-daily-total cm-th-daily-total">日別合計</th></tr>';
    } else {
        html += '<div id="calendarTableWrapper" class="table-wrapper"><table class="actual-matrix">';
        html += '<tr><th class="cm-th-date">日付</th>';

        members.forEach(member => {
            html += `<th class="cm-th-member">${escapeHtml(member)}</th>`;
        });
        html += '<th class="cm-daily-total cm-th-daily-total">日別合計</th></tr>';
    }

    let currentMonth = '';
    let monthTotals = {};
    members.forEach(m => monthTotals[m] = 0);
    let monthTotal = 0;

    allDates.forEach(date => {
        const dateObj = new Date(date);
        const month = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月`;
        const dayOfWeek = getDayOfWeek(date);
        const isWeekend = dayOfWeek === '土' || dayOfWeek === '日';

        const holiday = getHoliday(date);
        const isHoliday = holiday !== null;

        if (selectedMonth === 'all' && currentMonth && currentMonth !== month) {
            html += '<tr class="cm-row-subtotal">';
            html += `<td>${currentMonth} 小計</td>`;
            members.forEach(member => {
                html += `<td class="cm-subtotal-cell">${formatHours(monthTotals[member])}h</td>`;
            });
            html += `<td class="cm-daily-total cm-daily-total-subtotal">${formatHours(monthTotal)}h</td>`;
            html += '</tr>';

            members.forEach(m => monthTotals[m] = 0);
            monthTotal = 0;
        }

        currentMonth = month;

        const companyHolidayName = typeof window.getCompanyHolidayName === 'function' ? window.getCompanyHolidayName(date) : null;
        const isCompanyHol = companyHolidayName !== null;

        let rowClass = 'cm-row-normal';
        if (isWeekend || isHoliday) {
            rowClass = 'cm-row-weekend';
        } else if (isCompanyHol) {
            rowClass = 'cm-row-company-holiday';
        }
        html += `<tr class="${rowClass}">`;

        const [year, m, day] = date.split('-');
        let dateClass = '';
        let dateDisplay = '';

        if (isHoliday) {
            dateClass = ' cm-date-holiday';
            dateDisplay = `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})<span class="holiday-inline"> ${escapeHtml(holiday)}</span><span class="holiday-break"><br><span class="cm-holiday-sub">${escapeHtml(holiday)}</span></span>`;
        } else if (isCompanyHol) {
            dateClass = ' cm-date-company-holiday';
            dateDisplay = `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})<span class="holiday-inline"> ${escapeHtml(companyHolidayName)}</span><span class="holiday-break"><br><span class="cm-holiday-sub">${escapeHtml(companyHolidayName)}</span></span>`;
        } else if (isWeekend) {
            dateClass = ' cm-date-holiday';
            dateDisplay = `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})`;
        } else {
            dateDisplay = `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})`;
        }

        html += `<td class="cm-date-cell${dateClass}">${dateDisplay}</td>`;

        let dayTotal = 0;

        members.forEach(member => {
            const dayActuals = filteredActuals.filter(a => a.member === member && a.date === date);
            const memberDayTotal = dayActuals.reduce((sum, a) => sum + a.hours, 0);
            const memberVacations = typeof window.getVacation === 'function' ? window.getVacation(member, date) : [];

            dayTotal += memberDayTotal;
            monthTotals[member] += memberDayTotal;

            let cellContent = '';
            let cellClass = 'cm-cell cm-cell-empty';
            let onclick = `addActualFromCalendar('${escapeForHandler(member)}', '${escapeForHandler(date)}')`;
            let title = '実績を登録';

            if (memberDayTotal > 0) {
                cellClass = 'cm-cell cm-cell-work';
                onclick = `showWorkDetail('${escapeForHandler(member)}', '${escapeForHandler(date)}')`;
                cellContent = `<strong>${formatHours(memberDayTotal)}</strong>`;
                title = '';
            } else if (memberVacations.length > 0) {
                cellClass = 'cm-cell cm-cell-vacation';
                onclick = `showWorkDetail('${escapeForHandler(member)}', '${escapeForHandler(date)}')`;
                const vacationLabels = memberVacations.map(v => v.vacationType).join(',');
                const totalVacationHours = memberVacations.reduce((sum, v) => sum + v.hours, 0);
                cellContent = `<span class="cm-vacation-label">${vacationLabels}</span>`;
                if (totalVacationHours < 8) {
                    cellContent += `<br><span class="cm-vacation-hours">${totalVacationHours}h</span>`;
                }
                title = '休暇';
            } else {
                cellContent = '<span class="cm-empty-dash">-</span>';
            }

            html += `<td class="${cellClass}"
                        onclick="${onclick}" title="${title}">
                ${cellContent}
            </td>`;
        });

        monthTotal += dayTotal;

        if (dayTotal > 0) {
            html += `<td class="cm-daily-total cm-daily-total-data">${formatHours(dayTotal)}h</td>`;
        } else {
            html += `<td class="cm-daily-total cm-daily-total-empty">-</td>`;
        }

        html += '</tr>';
    });

    if (selectedMonth === 'all' && currentMonth) {
        html += '<tr class="cm-row-subtotal">';
        html += `<td>${currentMonth} 小計</td>`;
        members.forEach(member => {
            html += `<td class="cm-subtotal-cell">${formatHours(monthTotals[member])}h</td>`;
        });
        html += `<td class="cm-daily-total cm-daily-total-subtotal">${formatHours(monthTotal)}h</td>`;
        html += '</tr>';
    }

    html += '<tr class="cm-row-grand-total">';
    html += '<td>総合計</td>';
    let grandTotal = 0;

    members.forEach(member => {
        const memberTotal = filteredActuals.filter(a => a.member === member).reduce((sum, a) => sum + a.hours, 0);
        grandTotal += memberTotal;
        html += `<td class="cm-subtotal-cell">${formatHours(memberTotal)}h</td>`;
    });

    html += `<td class="cm-daily-total cm-daily-total-grand">${formatHours(grandTotal)}h</td>`;
    html += '</tr>';

    html += '</table></div>';

    container.innerHTML = html;

    setupCalendarSwipe();
}

/**
 * 実績リスト表示
 */
export function renderActualListView() {
    const container = document.getElementById('actualList');
    const selectedMonth = document.getElementById('actualMonthFilter').value;

    let filteredActuals = actuals;

    // リストは常に担当者別表示
    const selectedMember = document.getElementById('actualMemberSelect').value;
    if (selectedMember) {
        filteredActuals = filteredActuals.filter(a => a.member === selectedMember);
    }

    if (selectedMonth !== 'all') {
        filteredActuals = filteredActuals.filter(a => a.date && a.date.startsWith(selectedMonth));
    }

    let html = '<div class="table-wrapper"><table><tr><th>日付</th><th>版数</th><th>対応名</th><th>工程</th><th>担当</th><th style="text-align: right;">実績工数</th><th>操作</th></tr>';

    // 担当者順を取得
    const memberOrderInput = document.getElementById('memberOrder').value.trim();
    const orderList = memberOrderInput ? memberOrderInput.split(',').map(m => m.trim()).filter(m => m) : [];

    const getMemberIndex = (member) => {
        const idx = orderList.indexOf(member);
        return idx >= 0 ? idx : orderList.length + member.charCodeAt(0);
    };

    const sortedActuals = [...filteredActuals].sort((a, b) => {
        // まず日付で降順ソート
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;
        // 同日付なら担当者順でソート
        return getMemberIndex(a.member) - getMemberIndex(b.member);
    });

    if (sortedActuals.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 40px;">選択した条件に該当する実績データがありません</p>';
        return;
    }

    let totalHours = 0;
    sortedActuals.forEach(a => {
        totalHours += a.hours;
        html += `
            <tr class="actual-row-clickable" onclick="editActual(${a.id})" title="クリックして編集">
                <td>${escapeHtml(a.date)}</td>
                <td>${escapeHtml(a.version)}</td>
                <td>${escapeHtml(a.task)}</td>
                <td><span class="badge badge-${escapeHtml(a.process.toLowerCase())}">${escapeHtml(a.process)}</span></td>
                <td>${escapeHtml(a.member)}</td>
                <td style="text-align: right;">${escapeHtml(String(a.hours))}h</td>
                <td>
                    <button class="btn btn-danger btn-small" onclick="event.stopPropagation(); deleteActual(${a.id})">削除</button>
                </td>
            </tr>
        `;
    });

    html += `<tr style="background: var(--accent); color: #fff; font-weight: 700;">
        <td colspan="5" style="text-align: right;">合計</td>
        <td style="text-align: right;">${formatHours(totalHours)}h</td>
        <td></td>
    </tr>`;
    html += '</table></div>';
    container.innerHTML = html;
}

// ============================================
// 作業詳細モーダル
// ============================================

/**
 * 作業詳細モーダルを表示
 */
export function showWorkDetail(member, date) {
    const dayActuals = actuals.filter(a => a.member === member && a.date === date);
    const memberVacations = typeof window.getVacation === 'function' ? window.getVacation(member, date) : [];

    if (dayActuals.length === 0 && memberVacations.length === 0) return;

    const [year, month, day] = date.split('-');
    const dayOfWeek = getDayOfWeek(date);

    const isClassic = window.modalDesignStyle === 'classic';
    let html = '';
    const totalHours = dayActuals.reduce((sum, a) => sum + a.hours, 0);

    if (isClassic) {
        // クラシック: main と同じレイアウト
        document.getElementById('modalTitle').textContent =
            `${member}さんの作業 - ${year}年${parseInt(month)}月${parseInt(day)}日(${dayOfWeek})`;

        if (memberVacations.length > 0) {
            html += '<div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #f57c00;">';
            html += '<div style="font-weight: 600; color: #f57c00; margin-bottom: 10px;">休暇</div>';
            memberVacations.forEach(vacation => {
                html += `
                    <div style="margin-bottom: 8px; padding: 10px; background: white; border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${escapeHtml(vacation.vacationType)}</strong>
                                <span style="color: #666; font-size: 14px; margin-left: 10px;">${vacation.hours}h</span>
                            </div>
                            <button onclick="deleteVacationFromModal(${vacation.id}, '${escapeForHandler(member)}', '${escapeForHandler(date)}')" style="background: none; border: none; color: #95a5a6; cursor: pointer; font-size: 12px; padding: 4px 8px; text-decoration: underline;">削除</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        dayActuals.forEach(actual => {
            html += `
                <div class="work-item work-item-clickable" onclick="editActualFromModal(${actual.id})" title="クリックして編集">
                    <div class="work-item-header">
                        <div class="work-item-title">${escapeHtml(actual.task)}</div>
                        <div class="work-item-hours">${actual.hours}h</div>
                    </div>
                    <div class="work-item-details">
                        <span><strong>版数:</strong> ${escapeHtml(actual.version) || '(なし)'}</span>
                        <span><strong>工程:</strong> ${actual.process ? `<span class="badge badge-${escapeHtml(actual.process.toLowerCase())}">${escapeHtml(actual.process)}</span>` : '(なし)'}</span>
                    </div>
                    <div style="margin-top: 8px; text-align: right;">
                        <button onclick="event.stopPropagation(); deleteActualFromModal(${actual.id}, '${escapeForHandler(member)}', '${escapeForHandler(date)}')" style="background: none; border: none; color: #95a5a6; cursor: pointer; font-size: 12px; padding: 4px 8px; text-decoration: underline;">削除</button>
                    </div>
                </div>
            `;
        });

        html += `
            <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #eee; text-align: right;">
                <strong style="font-size: 16px;">合計: ${formatHours(totalHours)}時間</strong>
                <span style="color: #666; font-size: 14px; margin-left: 10px;">(${dayActuals.length}件)</span>
            </div>
            <div style="margin-top: 15px; text-align: center; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button onclick="addActualFromCalendar('${escapeForHandler(member)}', '${escapeForHandler(date)}'); closeWorkModal();"
                        style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    + 新しい実績を追加
                </button>
                <button onclick="addVacationFromCalendar('${escapeForHandler(member)}', '${escapeForHandler(date)}'); closeWorkModal();"
                        style="padding: 10px 20px; background: #f57c00; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    + 休暇を追加
                </button>
            </div>
        `;
    } else {
        // モダン: 新デザイン
        document.getElementById('modalTitle').textContent =
            `${member}さんの作業 - ${parseInt(month)}/${parseInt(day)}(${dayOfWeek})`;

        const vacationHours = memberVacations.reduce((sum, v) => sum + (v.hours || 0), 0);
        const grandTotal = totalHours + vacationHours;

        html += `
            <div class="wd-hero">
                <div class="wd-hero-hours">${formatHours(grandTotal)}<span class="wd-hours-unit">h</span></div>
                <div class="wd-hero-label">合計工数${dayActuals.length > 0 ? ` (${dayActuals.length}件)` : ''}</div>
            </div>
        `;

        if (memberVacations.length > 0) {
            html += '<div class="wd-section">';
            html += '<div class="wd-section-label">休暇</div>';
            memberVacations.forEach(vacation => {
                html += `
                    <div class="wd-vacation">
                        <div class="wd-vacation-header">
                            <span class="wd-vacation-type">${escapeHtml(vacation.vacationType)}</span>
                            <span class="wd-vacation-hours">${vacation.hours}h</span>
                        </div>
                        <div class="wd-vacation-actions">
                            <a href="#" class="wd-delete-link" onclick="event.preventDefault(); deleteVacationFromModal(${vacation.id}, '${escapeForHandler(member)}', '${escapeForHandler(date)}')">削除</a>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        if (dayActuals.length > 0) {
            html += '<div class="wd-section">';
            html += '<div class="wd-section-label">作業内容</div>';
            dayActuals.forEach(actual => {
                html += `
                    <div class="wd-card wd-card-clickable" onclick="editActualFromModal(${actual.id})" title="クリックして編集">
                        <div class="wd-card-header">
                            <div class="wd-card-title">${escapeHtml(actual.task)}</div>
                            <div class="wd-card-hours">${actual.hours}h</div>
                        </div>
                        <div class="wd-card-meta">
                            <span>${escapeHtml(actual.version) || '版数なし'}</span>
                            <span style="color: #ccc;">·</span>
                            ${actual.process ? `<span class="badge badge-${escapeHtml(actual.process.toLowerCase())}">${escapeHtml(actual.process)}</span>` : '<span>工程なし</span>'}
                        </div>
                        <div class="wd-card-actions">
                            <a href="#" class="wd-delete-link" onclick="event.stopPropagation(); event.preventDefault(); deleteActualFromModal(${actual.id}, '${escapeForHandler(member)}', '${escapeForHandler(date)}')">削除</a>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        html += `
            <div class="wd-add-actions">
                <button class="wd-add-btn wd-add-btn-actual" onclick="addActualFromCalendar('${escapeForHandler(member)}', '${escapeForHandler(date)}'); closeWorkModal();">
                    + 実績を追加
                </button>
                <button class="wd-add-btn wd-add-btn-vacation" onclick="addVacationFromCalendar('${escapeForHandler(member)}', '${escapeForHandler(date)}'); closeWorkModal();">
                    + 休暇を追加
                </button>
            </div>
        `;
    }

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('workModal').style.display = 'flex';
}

/**
 * 作業詳細モーダルを閉じる
 */
export function closeWorkModal() {
    document.getElementById('workModal').style.display = 'none';
}

/**
 * グリッド表示の日別詳細モーダルを表示（全担当者の実績を表示）
 * @param {string} date - 'YYYY-MM-DD' 形式の日付文字列
 */
export function showGridDayDetail(date) {
    const dayActuals = actuals.filter(a => a.date === date);
    if (dayActuals.length === 0) return;

    const [year, month, day] = date.split('-');
    const dayOfWeek = getDayOfWeek(date);

    const isClassic = window.modalDesignStyle === 'classic';
    const totalHours = dayActuals.reduce((sum, a) => sum + a.hours, 0);

    // 担当者別にグループ化
    const memberGroup = {};
    dayActuals.forEach(a => {
        if (!memberGroup[a.member]) memberGroup[a.member] = [];
        memberGroup[a.member].push(a);
    });

    let html = '';

    if (isClassic) {
        document.getElementById('modalTitle').textContent =
            `${year}年${parseInt(month)}月${parseInt(day)}日(${dayOfWeek})の作業`;

        Object.keys(memberGroup).forEach(member => {
            const memberActuals = memberGroup[member];
            const memberTotal = memberActuals.reduce((sum, a) => sum + a.hours, 0);

            html += `<div style="margin-bottom: 16px;">`;
            html += `<div style="font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border-light);">${escapeHtml(member)} (${formatHours(memberTotal)}h)</div>`;

            memberActuals.forEach(actual => {
                html += `
                    <div class="work-item work-item-clickable" onclick="editActualFromModal(${actual.id})" title="クリックして編集">
                        <div class="work-item-header">
                            <div class="work-item-title">${escapeHtml(actual.task)}</div>
                            <div class="work-item-hours">${actual.hours}h</div>
                        </div>
                        <div class="work-item-details">
                            <span><strong>版数:</strong> ${escapeHtml(actual.version) || '(なし)'}</span>
                            <span><strong>工程:</strong> ${actual.process ? `<span class="badge badge-${escapeHtml(actual.process.toLowerCase())}">${escapeHtml(actual.process)}</span>` : '(なし)'}</span>
                        </div>
                        <div style="margin-top: 8px; text-align: right;">
                            <button onclick="event.stopPropagation(); deleteActualFromModal(${actual.id}, '${escapeForHandler(member)}', '${escapeForHandler(date)}')" style="background: none; border: none; color: #95a5a6; cursor: pointer; font-size: 12px; padding: 4px 8px; text-decoration: underline;">削除</button>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        });

        html += `
            <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #eee; text-align: right;">
                <strong style="font-size: 16px;">合計: ${formatHours(totalHours)}時間</strong>
                <span style="color: #666; font-size: 14px; margin-left: 10px;">(${dayActuals.length}件)</span>
            </div>
        `;
    } else {
        document.getElementById('modalTitle').textContent =
            `${parseInt(month)}/${parseInt(day)}(${dayOfWeek})の作業`;

        html += `
            <div class="wd-hero">
                <div class="wd-hero-hours">${formatHours(totalHours)}<span class="wd-hours-unit">h</span></div>
                <div class="wd-hero-label">合計工数 (${dayActuals.length}件)</div>
            </div>
        `;

        Object.keys(memberGroup).forEach(member => {
            const memberActuals = memberGroup[member];
            const memberTotal = memberActuals.reduce((sum, a) => sum + a.hours, 0);

            html += '<div class="wd-section">';
            html += `<div class="wd-section-label">${escapeHtml(member)} (${formatHours(memberTotal)}h)</div>`;

            memberActuals.forEach(actual => {
                html += `
                    <div class="wd-card wd-card-clickable" onclick="editActualFromModal(${actual.id})" title="クリックして編集">
                        <div class="wd-card-header">
                            <div class="wd-card-title">${escapeHtml(actual.task)}</div>
                            <div class="wd-card-hours">${actual.hours}h</div>
                        </div>
                        <div class="wd-card-meta">
                            <span>${escapeHtml(actual.version) || '版数なし'}</span>
                            <span style="color: #ccc;">·</span>
                            ${actual.process ? `<span class="badge badge-${escapeHtml(actual.process.toLowerCase())}">${escapeHtml(actual.process)}</span>` : '<span>工程なし</span>'}
                        </div>
                        <div class="wd-card-actions">
                            <a href="#" class="wd-delete-link" onclick="event.stopPropagation(); event.preventDefault(); deleteActualFromModal(${actual.id}, '${escapeForHandler(member)}', '${escapeForHandler(date)}')">削除</a>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        });
    }

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('workModal').style.display = 'flex';
}

// ============================================
// 実績CRUD操作
// ============================================

/**
 * 実績を削除
 */
export function deleteActual(id) {
    if (!confirm('この実績を削除しますか?')) return;
    const deleted = actuals.find(a => a.id === id);
    const newActuals = actuals.filter(a => a.id !== id);
    setActuals(newActuals);
    if (deleted) {
        pushAction({
            type: 'actual_delete',
            description: `実績削除: ${deleted.task} (${deleted.process}) ${deleted.hours}h`,
            data: { deleted: { ...deleted } }
        });
    }
    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    renderActualList();
    renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();
    showAlert('実績を削除しました', true);
}

/**
 * 作業詳細モーダルから編集
 */
export function editActualFromModal(id) {
    closeWorkModal();
    editActual(id);
}

/**
 * 作業詳細モーダルから削除
 */
export function deleteActualFromModal(id, member, date) {
    if (confirm('この実績を削除しますか？')) {
        const deleted = actuals.find(a => a.id === id);
        const newActuals = actuals.filter(a => a.id !== id);
        setActuals(newActuals);
        if (deleted) {
            pushAction({
                type: 'actual_delete',
                description: `実績削除: ${deleted.task} (${deleted.process}) ${deleted.hours}h`,
                data: { deleted: { ...deleted } }
            });
        }
        if (typeof window.saveData === 'function') window.saveData();
        renderActualList();
        renderTodayActuals();
        if (typeof window.updateReport === 'function') window.updateReport();

        const remainingActuals = actuals.filter(a => a.member === member && a.date === date);
        if (remainingActuals.length > 0) {
            showWorkDetail(member, date);
        } else {
            closeWorkModal();
        }
    }
}

/**
 * カレンダーから実績を新規登録
 */
export function addActualFromCalendar(member, date) {
    document.getElementById('editActualId').value = '';
    document.getElementById('editActualDate').value = date;

    const previousActual = getPreviousActual(member, date);

    const versionSelect = document.getElementById('editActualVersion');
    if (previousActual) {
        versionSelect.value = previousActual.version;
    } else {
        if (versionSelect.options.length > 2) {
            versionSelect.value = versionSelect.options[versionSelect.options.length - 1].value;
        } else {
            versionSelect.value = '';
        }
    }

    // 検索式UIに切り替え
    document.getElementById('editActualTaskSelect').style.display = 'none';
    document.getElementById('editActualTaskSelect').value = '';
    document.getElementById('editActualTaskSearch').style.display = 'none';
    document.getElementById('editActualTaskSearch').value = '';
    const searchContainer = document.getElementById('editActualTaskSearchContainer');
    const searchInput = document.getElementById('editActualTaskSearchInput');
    const clearBtn = document.getElementById('editActualTaskClearBtn');
    const dropdown = document.getElementById('editActualTaskDropdown');
    if (searchContainer) searchContainer.style.display = 'block';
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (dropdown) dropdown.style.display = 'none';
    selectedCalendarTask = null;

    if (previousActual) {
        document.getElementById('editActualProcess').value = previousActual.process;
    } else {
        document.getElementById('editActualProcess').value = 'UI';
    }

    const memberSelect = document.getElementById('editActualMember');
    const memberDisplay = document.getElementById('editActualMemberDisplay');

    memberSelect.innerHTML = '';
    const option = document.createElement('option');
    option.value = member;
    option.textContent = member;
    memberSelect.appendChild(option);
    memberSelect.value = member;

    memberSelect.style.display = 'none';
    memberDisplay.style.display = 'block';
    memberDisplay.textContent = member;

    document.getElementById('editActualHours').value = '8';
    document.getElementById('editActualRemainingHours').value = '';

    const modalTitle = document.querySelector('#editActualModal .modal-header h3');
    const [year, month, day] = date.split('-');
    modalTitle.textContent = `実績を新規登録 - ${member} (${year}/${parseInt(month)}/${parseInt(day)})`;

    // タスク一覧を検索式UI用にビルド（Bug 1: 検索式に変更）
    buildCalendarTaskList(member, versionSelect.value, document.getElementById('editActualProcess').value);

    if (previousActual) {
        // 前回の実績があれば検索ボックスに表示して選択済みにする
        const matchTask = calendarTaskList.find(t =>
            t.version === previousActual.version && t.task === previousActual.task && t.process === previousActual.process
        );
        if (matchTask && searchInput) {
            selectedCalendarTask = matchTask;
            searchInput.value = matchTask.display;
            if (clearBtn) clearBtn.style.display = 'block';
        }
    }

    document.getElementById('editActualOtherBtn').style.display = 'block';
    document.getElementById('editActualVacationBtn').style.display = 'block';
    document.getElementById('editActualModal').dataset.calendarMember = member;
    document.getElementById('editActualModal').dataset.calendarDate = date;

    document.getElementById('editActualModal').style.display = 'flex';
}

/**
 * 実績を編集
 */
export function editActual(id) {
    const actual = actuals.find(a => a.id === id);
    if (!actual) {
        showAlert('データが見つかりません');
        return;
    }

    document.getElementById('editActualId').value = id;
    document.getElementById('editActualDate').value = actual.date;

    const isOther = isOtherWork(actual);
    const versionSelect = document.getElementById('editActualVersion');
    const taskSelect = document.getElementById('editActualTaskSelect');
    const taskInput = document.getElementById('editActualTaskSearch');
    const processSelect = document.getElementById('editActualProcess');

    // 編集時は検索式UIを非表示にしてselect式に戻す
    const searchContainer = document.getElementById('editActualTaskSearchContainer');
    if (searchContainer) searchContainer.style.display = 'none';
    selectedCalendarTask = null;

    if (isOther) {
        // その他工数: 版数・工程は非表示/無効化し、対応名は自由入力
        versionSelect.value = '';
        versionSelect.disabled = true;
        taskSelect.style.display = 'none';
        taskInput.style.display = 'block';
        taskInput.value = actual.task;
        processSelect.value = actual.process;
        processSelect.disabled = true;
    } else {
        versionSelect.value = actual.version;
        versionSelect.disabled = false;
        processSelect.disabled = false;
        updateEditActualTaskList(actual.member, true, actual.version, actual.process);
        taskSelect.style.display = 'block';
        taskInput.style.display = 'none';
        taskSelect.value = actual.task;
    }

    document.getElementById('editActualProcess').value = actual.process;
    document.getElementById('editActualHours').value = actual.hours;

    const existingRemaining = getRemainingEstimate(actual.version, actual.task, actual.process, actual.member);
    document.getElementById('editActualRemainingHours').value = existingRemaining ? existingRemaining.remainingHours : '';

    const modalTitle = document.querySelector('#editActualModal .modal-header h3');
    const [year, month, day] = actual.date.split('-');
    modalTitle.textContent = `実績データを編集 - ${actual.member} (${year}/${parseInt(month)}/${parseInt(day)})`;

    const memberSelect = document.getElementById('editActualMember');
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

    memberSelect.value = actual.member;

    memberSelect.style.display = 'block';
    document.getElementById('editActualMemberDisplay').style.display = 'none';

    document.getElementById('editActualOtherBtn').style.display = 'none';
    document.getElementById('editActualVacationBtn').style.display = 'none';

    document.getElementById('editActualModal').style.display = 'flex';
}

/**
 * 実績編集モーダルを閉じる
 */
export function closeEditActualModal() {
    document.getElementById('editActualModal').style.display = 'none';
    // その他工数編集で無効化したフィールドを復元
    const versionSelect = document.getElementById('editActualVersion');
    const processSelect = document.getElementById('editActualProcess');
    if (versionSelect) versionSelect.disabled = false;
    if (processSelect) processSelect.disabled = false;
    // カレンダー検索式の状態をリセット
    selectedCalendarTask = null;
    calendarTaskList = [];
    const dropdown = document.getElementById('editActualTaskDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

/**
 * 実績編集を保存
 */
/**
 * 実績の新規作成または更新を保存
 * 新規/更新を判定し、見込残存時間も同時に保存
 * @returns {void}
 */
export function saveActualEdit() {
    const id = parseFloat(document.getElementById('editActualId').value);
    const date = document.getElementById('editActualDate').value;
    let version = document.getElementById('editActualVersion').value;

    const taskSelect = document.getElementById('editActualTaskSelect');
    const taskInput = document.getElementById('editActualTaskSearch');
    const searchInput = document.getElementById('editActualTaskSearchInput');

    // カレンダー検索式で選択されたタスクがある場合はそれを優先
    let task;
    if (selectedCalendarTask) {
        task = selectedCalendarTask.task;
        version = selectedCalendarTask.version;
        document.getElementById('editActualVersion').value = version;
        document.getElementById('editActualProcess').value = selectedCalendarTask.process;
    } else if (taskSelect.style.display !== 'none' && taskSelect.value && taskSelect.value !== '__NEW__') {
        task = taskSelect.value;
    } else if (taskInput.style.display !== 'none' && taskInput.value) {
        task = taskInput.value;
    } else if (searchInput) {
        // 検索ボックスのコンテナが表示されている場合
        const searchContainer = document.getElementById('editActualTaskSearchContainer');
        if (searchContainer && searchContainer.style.display !== 'none' && searchInput.value) {
            task = searchInput.value;
        } else {
            task = '';
        }
    } else {
        task = '';
    }

    const process = document.getElementById('editActualProcess').value;
    const member = document.getElementById('editActualMember').value;
    const hours = parseFloat(document.getElementById('editActualHours').value);
    const remainingHoursInput = document.getElementById('editActualRemainingHours');
    const remainingHours = remainingHoursInput.value !== '' ? parseFloat(remainingHoursInput.value) : null;

    // その他作業（version空）の場合、processは必須としない
    const isOtherWorkEdit = !version;
    if (!date || !task || (!isOtherWorkEdit && !process) || !member || !hours) {
        showAlert('すべての項目を入力してください');
        return;
    }

    // Bug 3: 実績時間の警告チェック
    // 単一エントリが12hを超える場合の確認
    if (hours > 12) {
        if (!confirm(`入力された工数が ${hours}h です。1件で12時間を超えていますが、この値で保存しますか？`)) {
            return;
        }
    }

    // その日のメンバーの合計が16hを超える場合の警告
    const existingHoursForDay = actuals
        .filter(a => a.member === member && a.date === date && a.id !== id)
        .reduce((sum, a) => sum + a.hours, 0);
    const totalDayHours = existingHoursForDay + hours;
    if (totalDayHours > 16) {
        if (!confirm(`${member} の ${date} の合計工数が ${totalDayHours.toFixed(1)}h になります（16時間超）。この値で保存しますか？`)) {
            return;
        }
    }

    if (id && !isNaN(id)) {
        const actualIndex = actuals.findIndex(a => a.id === id);
        if (actualIndex !== -1) {
            const beforeActual = { ...actuals[actualIndex] };
            actuals[actualIndex] = {
                ...actuals[actualIndex],
                date: date,
                version: version,
                task: task,
                process: process,
                member: member,
                hours: hours
            };

            pushAction({
                type: 'actual_edit',
                description: `実績編集: ${task} (${process}) ${hours}h`,
                data: { before: beforeActual, after: { ...actuals[actualIndex] }, isNew: false }
            });

            if (remainingHours !== null && !isNaN(remainingHours)) {
                saveRemainingEstimate(version, task, process, member, remainingHours);
            }

            if (typeof window.saveData === 'function') window.saveData();
            closeEditActualModal();

            if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
            if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
            if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
            if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
            renderTodayActuals();
            renderActualList();
            if (typeof window.updateReport === 'function') window.updateReport();

            showAlert('実績データを更新しました', true);
        } else {
            showAlert('データの更新に失敗しました', false);
        }
    } else {
        const newActual = {
            id: Date.now() + Math.random(),
            date: date,
            version: version,
            task: task,
            process: process,
            member: member,
            hours: hours,
            createdAt: new Date().toISOString()
        };

        actuals.push(newActual);

        pushAction({
            type: 'actual_add',
            description: `実績追加: ${task} (${process}) ${hours}h`,
            data: { added: { ...newActual } }
        });

        if (remainingHours !== null && !isNaN(remainingHours)) {
            saveRemainingEstimate(version, task, process, member, remainingHours);
        }

        if (typeof window.saveData === 'function') window.saveData();
        closeEditActualModal();

        if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
        if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
        if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
        if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();
        renderTodayActuals();
        renderActualList();
        if (typeof window.updateReport === 'function') window.updateReport();

        showAlert('実績を登録しました', true);
    }
}

// ============================================
// ヘルパー関数
// ============================================

/**
 * 指定した担当者・日付より前の最新実績を取得
 */
export function getPreviousActual(member, beforeDate) {
    const previousActuals = actuals.filter(a =>
        a.member === member &&
        a.date < beforeDate &&
        a.version && a.task && a.process
    );

    if (previousActuals.length > 0) {
        previousActuals.sort((a, b) => {
            const dateDiff = b.date.localeCompare(a.date);
            if (dateDiff !== 0) return dateDiff;
            // 日付が同じ場合は登録日時で降順ソート（createdAtがなければidで近似）
            const createdA = a.createdAt || new Date(Math.floor(a.id)).toISOString();
            const createdB = b.createdAt || new Date(Math.floor(b.id)).toISOString();
            return createdB.localeCompare(createdA);
        });
        return previousActuals[0];
    }

    return null;
}

/**
 * 全担当者の中から指定日付より前の最新実績を取得
 */
export function getLatestActualBeforeDate(beforeDate) {
    const previousActuals = actuals.filter(a =>
        a.date < beforeDate &&
        a.version && a.task && a.process
    );

    if (previousActuals.length > 0) {
        previousActuals.sort((a, b) => b.date.localeCompare(a.date));
        return previousActuals[0];
    }

    return null;
}

/**
 * 実績編集モーダルの対応名リストを更新
 */
export function updateEditActualTaskList(member, isEditMode = false, selectedVersion = null, selectedProcess = null) {
    const select = document.getElementById('editActualTaskSelect');

    if (!selectedVersion) {
        const versionSelect = document.getElementById('editActualVersion');
        selectedVersion = versionSelect ? versionSelect.value : null;
    }

    let allEstimates = [...estimates];

    if (selectedVersion && selectedVersion !== '') {
        allEstimates = allEstimates.filter(e => e.version === selectedVersion);
    }

    if (selectedProcess && selectedProcess !== '') {
        allEstimates = allEstimates.filter(e => e.process === selectedProcess);
    }

    // 編集中の日付から月を取得（月ごとの見積計算用）
    const editDateEl = document.getElementById('editActualDate');
    const editDate = editDateEl ? editDateEl.value : '';
    const editMonth = editDate ? editDate.substring(0, 7) : '';

    const actualTotals = {};
    actuals.forEach(a => {
        // その他工数の場合は担当者ごと・月ごとに集計
        const isOther = isOtherWork(a);
        let key;
        if (isOther) {
            const aMonth = a.date ? a.date.substring(0, 7) : '';
            key = `${a.version}_${a.task}_${a.process}_${a.member}_${aMonth}`;
        } else {
            key = `${a.version}_${a.task}_${a.process}`;
        }
        actualTotals[key] = (actualTotals[key] || 0) + a.hours;
    });

    const tasksByMember = {};
    allEstimates.forEach(est => {
        const isOther = isOtherWork(est);
        let actualHours, estHours;

        if (isOther) {
            // その他工数：担当者ごと・月ごとに残/超過を計算
            const key = `${est.version}_${est.task}_${est.process}_${est.member}_${editMonth}`;
            actualHours = actualTotals[key] || 0;
            // 月ごとの見積工数を使用
            const normalized = normalizeEstimate(est);
            estHours = (normalized.monthlyHours && normalized.monthlyHours[editMonth]) || 0;
        } else {
            const key = `${est.version}_${est.task}_${est.process}`;
            actualHours = actualTotals[key] || 0;
            estHours = est.hours;
        }

        const remaining = estHours - actualHours;

        let displayText;
        if (isOther) {
            if (remaining > 0) {
                displayText = `${est.task} (残: ${formatHours(remaining)}h)`;
            } else if (remaining < 0) {
                displayText = `${est.task} (超過: ${formatHours(Math.abs(remaining))}h)`;
            } else {
                displayText = `${est.task} (完了)`;
            }
        } else {
            if (remaining > 0) {
                displayText = `${est.task} [${est.process}] (残: ${formatHours(remaining)}h)`;
            } else if (remaining < 0) {
                displayText = `${est.task} [${est.process}] (超過: ${formatHours(Math.abs(remaining))}h)`;
            } else {
                displayText = `${est.task} [${est.process}] (完了)`;
            }
        }

        if (!tasksByMember[est.member]) {
            tasksByMember[est.member] = [];
        }

        // その他工数の場合、同じタスクが複数月にまたがる見積は
        // 編集中の月に該当する場合のみ表示
        if (isOther && estHours === 0 && editMonth) {
            return; // この月に見積がなければスキップ
        }

        tasksByMember[est.member].push({
            version: est.version,
            task: est.task,
            process: est.process,
            remaining: remaining,
            display: displayText
        });
    });

    select.innerHTML = '<option value="">-- 対応を選択 --</option>';

    if (tasksByMember[member] && tasksByMember[member].length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = `担当：${member}`;
        tasksByMember[member].forEach(task => {
            const option = document.createElement('option');
            option.value = task.task;
            option.setAttribute('data-version', task.version);
            option.setAttribute('data-process', task.process);
            option.textContent = task.display;
            optgroup.appendChild(option);
        });
        select.appendChild(optgroup);
    }

    const memberOrderEl = document.getElementById('memberOrder');
    const memberOrderInput = memberOrderEl ? memberOrderEl.value.trim() : '';

    const otherMembers = Object.keys(tasksByMember).filter(m => m !== member);
    const sortedOtherMembers = sortMembers(otherMembers, memberOrderInput);

    sortedOtherMembers.forEach(otherMember => {
        if (tasksByMember[otherMember].length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = `担当：${otherMember}`;
            tasksByMember[otherMember].forEach(task => {
                const option = document.createElement('option');
                option.value = task.task;
                option.setAttribute('data-version', task.version);
                option.setAttribute('data-process', task.process);
                option.textContent = task.display;
                optgroup.appendChild(option);
            });
            select.appendChild(optgroup);
        }
    });

    const newOption = document.createElement('option');
    newOption.value = '__NEW__';
    newOption.textContent = '新規入力...';
    select.appendChild(newOption);
}

// ============================================
// カレンダー実績入力 検索式タスク選択（Bug 1 & Bug 2）
// ============================================

/**
 * カレンダー実績入力用のタスク一覧を構築
 * Bug 1: 検索式に変更
 * Bug 2: 担当者のタスクを優先し、残作業なしを後方に配置
 */
function buildCalendarTaskList(member, selectedVersion, selectedProcess) {
    calendarTaskList = [];

    let allEstimates = [...estimates];

    if (selectedVersion && selectedVersion !== '') {
        allEstimates = allEstimates.filter(e => e.version === selectedVersion);
    }

    if (selectedProcess && selectedProcess !== '') {
        allEstimates = allEstimates.filter(e => e.process === selectedProcess);
    }

    // 編集中の日付から月を取得
    const editDateEl = document.getElementById('editActualDate');
    const editDate = editDateEl ? editDateEl.value : '';
    const editMonth = editDate ? editDate.substring(0, 7) : '';

    // 実績合計を計算
    const actualTotals = {};
    actuals.forEach(a => {
        const isOther = isOtherWork(a);
        let key;
        if (isOther) {
            const aMonth = a.date ? a.date.substring(0, 7) : '';
            key = `${a.version}_${a.task}_${a.process}_${a.member}_${aMonth}`;
        } else {
            key = `${a.version}_${a.task}_${a.process}`;
        }
        actualTotals[key] = (actualTotals[key] || 0) + a.hours;
    });

    allEstimates.forEach(est => {
        const isOther = isOtherWork(est);
        let actualHours, estHours;

        if (isOther) {
            const key = `${est.version}_${est.task}_${est.process}_${est.member}_${editMonth}`;
            actualHours = actualTotals[key] || 0;
            const normalized = normalizeEstimate(est);
            estHours = (normalized.monthlyHours && normalized.monthlyHours[editMonth]) || 0;
        } else {
            const key = `${est.version}_${est.task}_${est.process}`;
            actualHours = actualTotals[key] || 0;
            estHours = est.hours;
        }

        const remaining = estHours - actualHours;

        // その他工数で今月に見積がなければスキップ
        if (isOther && estHours === 0 && editMonth) {
            return;
        }

        let statusText;
        if (remaining > 0) {
            statusText = `残: ${formatHours(remaining)}h`;
        } else if (remaining < 0) {
            statusText = `超過: ${formatHours(Math.abs(remaining))}h`;
        } else {
            statusText = '完了';
        }

        const processLabel = isOther ? '' : ` [${est.process}]`;
        const displayText = `${est.task}${processLabel} (${statusText})`;

        calendarTaskList.push({
            version: est.version,
            task: est.task,
            process: est.process,
            member: est.member,
            remaining: remaining,
            display: displayText,
            isOwn: est.member === member,
            isCompleted: remaining <= 0
        });
    });

    // Bug 2: ソート - 自分のタスク優先、残作業ありを優先
    calendarTaskList.sort((a, b) => {
        // 自分のタスクを優先
        if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
        // 残作業ありを優先
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        // 残りが多い順
        return b.remaining - a.remaining;
    });
}

/**
 * カレンダー実績入力の検索フィルタ
 */
export function filterCalendarTaskList() {
    const searchInput = document.getElementById('editActualTaskSearchInput');
    const dropdown = document.getElementById('editActualTaskDropdown');
    if (!searchInput || !dropdown) return;

    const searchText = searchInput.value.toLowerCase();
    const calendarMember = document.getElementById('editActualModal').dataset.calendarMember || '';

    // 検索テキストで絞り込み
    let filtered = calendarTaskList;
    if (searchText) {
        filtered = filtered.filter(taskInfo =>
            taskInfo.display.toLowerCase().includes(searchText) ||
            taskInfo.version.toLowerCase().includes(searchText) ||
            taskInfo.member.toLowerCase().includes(searchText)
        );
    }

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="custom-dropdown-empty">該当する対応が見つかりません</div>' +
            '<div class="custom-dropdown-item" onmousedown="selectCalendarTaskFreeInput()" style="color: var(--accent); font-weight: 500;">自由入力で登録...</div>';
    } else {
        let html = '';
        let lastSection = '';

        filtered.forEach(taskInfo => {
            const section = taskInfo.isOwn ? 'own' : 'other';
            if (section !== lastSection) {
                if (section === 'own') {
                    html += `<div style="padding: 6px 16px; font-size: 11px; color: var(--accent); font-weight: 600; background: var(--accent-light); border-bottom: 1px solid var(--border-light);">担当：${escapeHtml(calendarMember)}</div>`;
                } else {
                    html += `<div style="padding: 6px 16px; font-size: 11px; color: var(--text-muted); font-weight: 600; background: var(--surface-elevated); border-bottom: 1px solid var(--border-light);">他の担当者</div>`;
                }
                lastSection = section;
            }

            const value = `${taskInfo.version}|${taskInfo.task}|${taskInfo.process}|${taskInfo.member}`;
            const completedStyle = taskInfo.isCompleted ? 'color: var(--text-muted); opacity: 0.7;' : '';
            const memberLabel = taskInfo.isOwn ? '' : ` <span style="color: var(--text-muted); font-size: 11px;">(${escapeHtml(taskInfo.member)})</span>`;

            html += `<div class="custom-dropdown-item" onmousedown="selectCalendarTask('${escapeForHandler(value)}', '${escapeForHandler(taskInfo.display)}')" style="${completedStyle}">${escapeHtml(taskInfo.display)}${memberLabel}</div>`;
        });

        html += '<div class="custom-dropdown-item" onmousedown="selectCalendarTaskFreeInput()" style="color: var(--accent); font-weight: 500; border-top: 2px solid var(--border-light);">自由入力で登録...</div>';
        dropdown.innerHTML = html;
    }

    dropdown.style.display = 'block';
}

/**
 * カレンダー実績入力でタスクを選択
 */
export function selectCalendarTask(value, display) {
    const [version, task, process, member] = value.split('|');

    selectedCalendarTask = { version, task, process, member };

    const searchInput = document.getElementById('editActualTaskSearchInput');
    const clearBtn = document.getElementById('editActualTaskClearBtn');
    const dropdown = document.getElementById('editActualTaskDropdown');
    const versionSelect = document.getElementById('editActualVersion');
    const processSelect = document.getElementById('editActualProcess');

    if (searchInput) searchInput.value = display;
    if (clearBtn) clearBtn.style.display = 'block';
    if (dropdown) dropdown.style.display = 'none';

    // 版数と工程を自動追従
    if (version && versionSelect) versionSelect.value = version;
    if (process && processSelect) processSelect.value = process;

    // 残存時間の初期値を表示
    if (version && task && process) {
        const existingRemaining = getRemainingEstimate(version, task, process, member);
        const remainingInput = document.getElementById('editActualRemainingHours');
        if (remainingInput) {
            remainingInput.value = existingRemaining ? existingRemaining.remainingHours : '';
        }
    }
}

/**
 * カレンダー実績入力で自由入力モードに切替
 */
export function selectCalendarTaskFreeInput() {
    const searchContainer = document.getElementById('editActualTaskSearchContainer');
    const taskInput = document.getElementById('editActualTaskSearch');
    const dropdown = document.getElementById('editActualTaskDropdown');

    if (searchContainer) searchContainer.style.display = 'none';
    if (taskInput) {
        taskInput.style.display = 'block';
        taskInput.value = '';
        taskInput.focus();
    }
    if (dropdown) dropdown.style.display = 'none';
    selectedCalendarTask = null;
}

/**
 * カレンダー実績入力の検索選択をクリア
 */
export function clearCalendarTaskSelection() {
    const searchInput = document.getElementById('editActualTaskSearchInput');
    const clearBtn = document.getElementById('editActualTaskClearBtn');
    const dropdown = document.getElementById('editActualTaskDropdown');

    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (dropdown) dropdown.style.display = 'none';
    selectedCalendarTask = null;
}

/**
 * カレンダーからその他作業モーダルを開く
 */
export function openOtherWorkFromCalendar() {
    const modal = document.getElementById('editActualModal');
    const member = modal.dataset.calendarMember;
    const date = modal.dataset.calendarDate;

    closeEditActualModal();
    openOtherWorkModalWithContext(member, date);
}

/**
 * カレンダーから休暇登録モーダルを開く
 */
export function openVacationFromCalendar() {
    const modal = document.getElementById('editActualModal');
    const member = modal.dataset.calendarMember;
    const date = modal.dataset.calendarDate;

    closeEditActualModal();
    if (typeof window.addVacationFromCalendar === 'function') {
        window.addVacationFromCalendar(member, date);
    }
}

/**
 * コンテキスト付きでその他作業モーダルを開く
 */
export function openOtherWorkModalWithContext(member, date) {
    const otherWorkMemberSelect = document.getElementById('otherWorkMember');
    if (otherWorkMemberSelect) {
        const allMembers = new Set();
        estimates.forEach(e => allMembers.add(e.member));
        actuals.forEach(a => allMembers.add(a.member));

        let sortedMembers;
        const memberOrderInput = document.getElementById('memberOrder').value.trim();
        if (memberOrderInput) {
            const orderList = memberOrderInput.split(',').map(m => m.trim()).filter(m => m);
            const orderedMembers = orderList.filter(name => allMembers.has(name));
            const unorderedMembers = Array.from(allMembers).filter(m => !orderedMembers.includes(m)).sort();
            sortedMembers = [...orderedMembers, ...unorderedMembers];
        } else {
            sortedMembers = Array.from(allMembers).sort();
        }

        otherWorkMemberSelect.innerHTML = '<option value="">選択...</option>';
        sortedMembers.forEach(m => {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m;
            otherWorkMemberSelect.appendChild(option);
        });

        otherWorkMemberSelect.value = member;
    }

    document.getElementById('otherWorkModal').dataset.calendarDate = date;

    const [year, month, day] = date.split('-');
    document.querySelector('#otherWorkModal .modal-header h3').textContent =
        `その他作業を登録 - ${member} (${year}/${parseInt(month)}/${parseInt(day)})`;

    document.getElementById('otherWorkModal').style.display = 'flex';
}

/**
 * 実績編集モーダルの対応選択変更時の処理
 */
export function handleActualTaskSelect() {
    const select = document.getElementById('editActualTaskSelect');
    const searchInput = document.getElementById('editActualTaskSearch');
    const versionSelect = document.getElementById('editActualVersion');
    const processSelect = document.getElementById('editActualProcess');

    if (!select || !searchInput) return;

    if (select.value === '__NEW__') {
        select.style.display = 'none';
        searchInput.style.display = 'block';
        searchInput.value = '';
        searchInput.focus();
    } else {
        // 選択されたオプションから情報を取得
        const selectedOption = select.options[select.selectedIndex];
        const version = selectedOption.getAttribute('data-version');
        const process = selectedOption.getAttribute('data-process');

        // イベントループを防ぐため、一時的にイベントリスナーを無効化するか、
        // 値変更時の処理を調整する必要がありますが、ここでは単純に値をセットします。
        // ただし、プロセス変更イベントが発火して再描画されると無限ループになる可能性があるため注意。
        // 今回の要件では「対応名選択 -> 工程追従」なので、ここで工程を変えます。

        if (version && versionSelect && versionSelect.value !== version) {
            versionSelect.value = version;
        }

        if (process && processSelect && processSelect.value !== process) {
            processSelect.value = process;
            // プロセスが変わったのでリストを再生成したいところですが、
            // 既に選択済みのタスクが消えてしまうと困るので、
            // ここではリスト再生成はせず、値の追従のみ行います。
        }

        // 残存時間の初期値を表示
        if (version && select.value && process) {
            const memberSelect = document.getElementById('editActualMember');
            const member = memberSelect ? memberSelect.value : '';
            const existingRemaining = getRemainingEstimate(version, select.value, process, member);
            const remainingInput = document.getElementById('editActualRemainingHours');
            if (remainingInput) {
                remainingInput.value = existingRemaining ? existingRemaining.remainingHours : '';
            }
        }
    }
}

/**
 * 実績編集モーダルの工程変更時の処理
 */
export function handleActualProcessChange() {
    const memberSelect = document.getElementById('editActualMember');
    const versionSelect = document.getElementById('editActualVersion');
    const processSelect = document.getElementById('editActualProcess');

    if (!memberSelect || !processSelect) return;

    const member = memberSelect.value;
    const version = versionSelect ? versionSelect.value : null;
    const process = processSelect.value;

    // プロセス変更時に現在の選択済みタスクを保持する試み
    let currentTask = null;
    const taskSelect = document.getElementById('editActualTaskSelect');
    const taskInput = document.getElementById('editActualTaskSearch');

    if (taskSelect.style.display !== 'none' && taskSelect.value && taskSelect.value !== '__NEW__') {
        currentTask = taskSelect.value;
    } else if (taskInput.style.display !== 'none' && taskInput.value) {
        // テキスト入力モードの場合は名前だけで保持（完全一致するかは不明だが試行）
        // ただし updateEditActualTaskList は select を再構築するので、
        // テキスト入力モードから戻ることは想定しにくいが、念のため。
    }

    // カレンダー検索式が表示されている場合はそちらも更新
    const searchContainer = document.getElementById('editActualTaskSearchContainer');
    if (searchContainer && searchContainer.style.display !== 'none') {
        buildCalendarTaskList(member, version, process);
        // 選択状態をクリア（プロセスが変わったため）
        selectedCalendarTask = null;
        const searchInput = document.getElementById('editActualTaskSearchInput');
        const clearBtn = document.getElementById('editActualTaskClearBtn');
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }

    // 現在選択されている対応名を保持したいが、プロセスが変わるとリスト内容が変わるため、
    // 基本的にはリセットされるか、同じ名前があればそれが選ばれる挙動になる。
    updateEditActualTaskList(member, true, version, process);

    // 同じタスク名が新しいプロセスのリストにも存在すれば、それを選択し直す
    if (currentTask) {
        // オプションが存在するか確認
        const options = Array.from(taskSelect.options);
        const exists = options.some(opt => opt.value === currentTask);
        if (exists) {
            taskSelect.value = currentTask;
            // 再選択したことによる残存時間の更新などは handleActualTaskSelect で行われるため、
            // 必要に応じて呼び出すか、ここでも更新する。
            // ループしないように注意。ここでは値セットだけにして、残時間は再度計算。

            const existingRemaining = getRemainingEstimate(version, currentTask, process, member);
            const remainingInput = document.getElementById('editActualRemainingHours');
            if (remainingInput) {
                remainingInput.value = existingRemaining ? existingRemaining.remainingHours : '';
            }
        }
    }
}

// ============================================
// カレンダーグリッド表示
// ============================================

/**
 * 7列カレンダーグリッドを描画
 */
export function renderCalendarGrid() {
    const container = document.getElementById('actualList');
    const selectedMonth = document.getElementById('actualMonthFilter').value;

    // 表示する月を決定
    let year, month;
    if (selectedMonth && selectedMonth !== 'all') {
        // "2026-02" format
        const parts = selectedMonth.split('-');
        year = parseInt(parts[0]);
        month = parseInt(parts[1]);
    } else {
        // デフォルトは当月
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
    }

    // グリッドは常に全担当者表示
    let filteredActuals = actuals.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    // 日付別に集計
    const dailyData = {};
    filteredActuals.forEach(a => {
        if (!dailyData[a.date]) {
            dailyData[a.date] = { hours: 0, entries: [] };
        }
        dailyData[a.date].hours += a.hours;
        dailyData[a.date].entries.push(a);
    });

    // 月の合計時間
    const totalHours = filteredActuals.reduce((sum, a) => sum + a.hours, 0);

    // カレンダーグリッド生成
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDow = firstDay.getDay(); // 0=日
    const daysInMonth = lastDay.getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let html = '';
    html += `<div class="actual-calendar-nav">`;
    html += `<div class="month-label">${year}年${month}月</div>`;
    html += `<div class="month-total">合計: <strong>${formatHours(totalHours)}h</strong></div>`;
    html += `</div>`;

    html += '<div class="calendar-grid">';

    // ヘッダー行
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    dayNames.forEach((name, i) => {
        let cls = 'calendar-header-cell';
        if (i === 0) cls += ' sun';
        if (i === 6) cls += ' sat';
        html += `<div class="${cls}">${name}</div>`;
    });

    // 前月の空白セル
    for (let i = 0; i < startDow; i++) {
        html += '<div class="calendar-cell other-month"></div>';
    }

    // 各日のセル
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dow = new Date(year, month - 1, day).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isToday = dateStr === todayStr;
        const holiday = getHoliday(dateStr);
        const companyHolidayName = typeof window.getCompanyHolidayName === 'function' ? window.getCompanyHolidayName(dateStr) : null;

        let cellClass = 'calendar-cell';
        if (isWeekend) cellClass += ' weekend';
        if (isToday) cellClass += ' today';
        if (dow === 0) cellClass += ' sun';
        if (dow === 6) cellClass += ' sat';
        if (holiday) cellClass += ' holiday';
        if (companyHolidayName) cellClass += ' company-holiday';

        const data = dailyData[dateStr];

        // クリックハンドラ: データがある場合は詳細表示（常に全担当者モード）
        let cellOnclick = '';
        if (data) {
            cellOnclick = ` onclick="showGridDayDetail('${escapeForHandler(dateStr)}')"`;
        }

        html += `<div class="${cellClass}"${cellOnclick}>`;
        html += `<div class="calendar-date">${day}</div>`;

        if (holiday) {
            html += `<div class="calendar-entry" style="color:var(--danger);font-size:10px;">${holiday}</div>`;
        }
        if (companyHolidayName && !holiday) {
            html += `<div class="calendar-entry" style="color:var(--warning);font-size:10px;">${companyHolidayName}</div>`;
        }

        if (data) {
            html += `<div class="calendar-hours">${formatHours(data.hours)}h</div>`;
            // 最大3件まで表示
            const maxEntries = 3;
            data.entries.slice(0, maxEntries).forEach(entry => {
                // 常に全担当者表示なのでメンバー名を含める
                const label = `${entry.task}-${entry.process} (${entry.member})`;
                html += `<div class="calendar-entry">${label}</div>`;
            });
            if (data.entries.length > maxEntries) {
                html += `<div class="calendar-entry" style="color:var(--accent);">+${data.entries.length - maxEntries}件</div>`;
            }
        }

        html += '</div>';
    }

    // 末尾の空白セル（7の倍数になるよう）
    const totalCells = startDow + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remaining; i++) {
        html += '<div class="calendar-cell other-month"></div>';
    }

    html += '</div>';

    container.innerHTML = html;
}

// ============================================
// クイック入力モーダル（実績一覧タブ内）
// ============================================

/** モーダル内タスク検索用の状態 */
let qmAllTasks = [];
let qmSelectedTask = null;
let qmBatchRowId = 0;

/**
 * クイック入力モーダルを開く
 */
export function openQuickInputModal() {
    // タスク一覧を構築
    qmBuildTaskList();

    // 担当者セレクトを構築
    qmBuildMemberSelect('qmMemberSelect');

    // 日付を今日に設定
    const dateInput = document.getElementById('qmWorkDate');
    if (dateInput) dateInput.value = new Date().toLocaleDateString('sv-SE');

    // 単一入力フォームをリセット
    const searchInput = document.getElementById('qmTaskSearch');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('qmTaskClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    const hoursInput = document.getElementById('qmHours');
    if (hoursInput) hoursInput.value = '8';
    const memberSelect = document.getElementById('qmMemberSelect');
    if (memberSelect) memberSelect.value = '';
    qmSelectedTask = null;

    // 一括入力を初期化（3行）
    const tbody = document.getElementById('qmBatchBody');
    if (tbody) tbody.innerHTML = '';
    qmBatchRowId = 0;
    qmAddBatchRow();
    qmAddBatchRow();
    qmAddBatchRow();

    // ドロップダウンを閉じるイベントを設定
    qmInitDropdownHandler();

    // 単一入力の検索入力イベントを設定
    const qmSearch = document.getElementById('qmTaskSearch');
    if (qmSearch) {
        qmSearch.onfocus = function() { qmFilterTaskList(); };
        qmSearch.oninput = function() { qmFilterTaskList(); };
    }

    document.getElementById('quickInputModal').style.display = 'flex';
}

/**
 * クイック入力モーダルを閉じる
 */
export function closeQuickInputModal() {
    document.getElementById('quickInputModal').style.display = 'none';
}

/**
 * タスク一覧を見積データから構築
 */
function qmBuildTaskList() {
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
    qmAllTasks = Array.from(taskMap.values());
}

/**
 * 担当者セレクトを構築
 */
function qmBuildMemberSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const members = new Set();
    estimates.forEach(e => members.add(e.member));

    const memberOrderInput = document.getElementById('memberOrder');
    const memberOrderValue = memberOrderInput ? memberOrderInput.value.trim() : '';
    const sortedMembers = sortMembers(members, memberOrderValue);

    const currentValue = select.value;
    select.innerHTML = '<option value="">（自動）</option>';
    sortedMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        select.appendChild(option);
    });

    if (currentValue && sortedMembers.includes(currentValue)) {
        select.value = currentValue;
    }
}

// ============================================
// 単一入力フォーム（モーダル内）
// ============================================

/**
 * 単一入力フォームのタスクドロップダウンを表示/フィルタ
 */
export function qmFilterTaskList() {
    const searchInput = document.getElementById('qmTaskSearch');
    const dropdown = document.getElementById('qmTaskDropdown');
    if (!searchInput || !dropdown) return;

    const searchText = searchInput.value.toLowerCase();
    const memberSelect = document.getElementById('qmMemberSelect');
    const selectedMember = memberSelect ? memberSelect.value : '';

    let filtered = qmAllTasks;
    if (selectedMember) {
        filtered = filtered.filter(t => t.member === selectedMember);
    }
    if (searchText) {
        filtered = filtered.filter(t => t.display.toLowerCase().includes(searchText));
    }

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="custom-dropdown-empty">該当する対応が見つかりません</div>';
    } else {
        dropdown.innerHTML = filtered.map(t => {
            const value = `${t.version}|${t.task}|${t.process}|${t.member}`;
            return `<div class="custom-dropdown-item" onmousedown="qmSelectTask('${escapeForHandler(value)}', '${escapeForHandler(t.display)}')">${escapeHtml(t.display)}</div>`;
        }).join('');
    }

    dropdown.style.display = 'block';
}

/**
 * 単一入力フォームのタスクを選択
 */
export function qmSelectTask(value, display) {
    qmSelectedTask = value;
    const [version, task, process, member] = value.split('|');

    const searchInput = document.getElementById('qmTaskSearch');
    const clearBtn = document.getElementById('qmTaskClearBtn');
    const memberSelect = document.getElementById('qmMemberSelect');
    const dropdown = document.getElementById('qmTaskDropdown');

    if (searchInput) searchInput.value = `${version} - ${task} [${process}]`;
    if (clearBtn) clearBtn.style.display = 'block';
    if (memberSelect && !memberSelect.value) memberSelect.value = member;
    if (dropdown) dropdown.style.display = 'none';
}

/**
 * 単一入力フォームのタスク選択をクリア
 */
export function qmClearTaskSelection() {
    const searchInput = document.getElementById('qmTaskSearch');
    const clearBtn = document.getElementById('qmTaskClearBtn');
    const memberSelect = document.getElementById('qmMemberSelect');

    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    qmSelectedTask = null;
    if (memberSelect) memberSelect.value = '';
    qmHideDropdown('qmTaskDropdown');
}

function qmHideDropdown(id) {
    const dropdown = document.getElementById(id);
    if (dropdown) dropdown.style.display = 'none';
}

/**
 * 単一入力フォームから実績を追加
 */
export function qmAddActual() {
    const hoursInput = document.getElementById('qmHours');
    const memberSelect = document.getElementById('qmMemberSelect');
    const workDateInput = document.getElementById('qmWorkDate');

    const hours = hoursInput ? parseFloat(hoursInput.value) : 0;
    const memberOverride = memberSelect ? memberSelect.value : '';
    const workDate = workDateInput ? workDateInput.value : '';

    if (!qmSelectedTask || !hours) {
        showAlert('対応と実績工数を入力してください');
        return;
    }

    const [version, task, process, originalMember] = qmSelectedTask.split('|');
    const finalMember = memberOverride || originalMember;
    const finalDate = workDate || new Date().toISOString().split('T')[0];

    const newActual = {
        id: Date.now(),
        date: finalDate,
        version: version,
        task: task,
        process: process,
        member: finalMember,
        hours: hours,
        createdAt: new Date().toISOString()
    };
    actuals.push(newActual);

    pushAction({
        type: 'actual_add',
        description: `実績追加: ${task} (${process}) ${hours}h`,
        data: { added: { ...newActual } }
    });

    if (typeof window.saveData === 'function') window.saveData();

    // 工数をリセット
    if (hoursInput) hoursInput.value = '8';

    // UI更新
    qmRefreshUI();
    showAlert('実績を追加しました', true);
}

/**
 * UI更新ヘルパー
 */
function qmRefreshUI() {
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.updateReport === 'function') window.updateReport();
}

// ============================================
// 一括入力（バッチ入力）
// ============================================

/**
 * 一括入力テーブルに行を追加
 */
export function qmAddBatchRow() {
    const tbody = document.getElementById('qmBatchBody');
    if (!tbody) return;

    const rowId = qmBatchRowId++;
    const today = new Date().toLocaleDateString('sv-SE');

    // 担当者リストを構築
    const members = new Set();
    estimates.forEach(e => members.add(e.member));
    const memberOrderInput = document.getElementById('memberOrder');
    const memberOrderValue = memberOrderInput ? memberOrderInput.value.trim() : '';
    const sortedMembers = sortMembers(members, memberOrderValue);
    const memberOptions = '<option value="">（自動）</option>' + sortedMembers.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

    const tr = document.createElement('tr');
    tr.id = `qmBatchRow_${rowId}`;
    tr.innerHTML = `
        <td><input type="date" value="${today}" style="font-size: 12px; padding: 4px; width: 100%;"></td>
        <td style="position: relative;">
            <input type="text" placeholder="検索..." autocomplete="off" style="font-size: 12px; padding: 4px; width: 100%; padding-right: 24px;"
                onfocus="qmBatchFilterTask(${rowId})" oninput="qmBatchFilterTask(${rowId})">
            <button style="display: none; position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 0 4px; line-height: 1;"
                onclick="qmBatchClearTask(${rowId})" title="クリア">&times;</button>
            <div class="custom-dropdown" style="display: none; max-height: 200px;"></div>
            <input type="hidden" class="qm-batch-task-data" value="">
        </td>
        <td><select style="font-size: 12px; padding: 4px; width: 100%;">${memberOptions}</select></td>
        <td><input type="number" step="0.25" min="0" value="8" style="font-size: 12px; padding: 4px; width: 100%; text-align: right;"></td>
        <td style="text-align: center;">
            <button onclick="qmRemoveBatchRow(${rowId})" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 2px 6px;" title="行を削除">&times;</button>
        </td>
    `;
    tbody.appendChild(tr);
    qmUpdateBatchCount();
}

/**
 * 一括入力テーブルの行を削除
 */
export function qmRemoveBatchRow(rowId) {
    const row = document.getElementById(`qmBatchRow_${rowId}`);
    if (row) row.remove();
    qmUpdateBatchCount();
}

/**
 * 一括入力テーブルの行数を更新
 */
function qmUpdateBatchCount() {
    const tbody = document.getElementById('qmBatchBody');
    const countEl = document.getElementById('qmBatchRowCount');
    if (tbody && countEl) {
        countEl.textContent = tbody.children.length;
    }
}

/**
 * 一括入力行のタスク検索ドロップダウンを表示/フィルタ
 */
export function qmBatchFilterTask(rowId) {
    const row = document.getElementById(`qmBatchRow_${rowId}`);
    if (!row) return;

    const searchInput = row.querySelector('td:nth-child(2) input[type="text"]');
    const dropdown = row.querySelector('td:nth-child(2) .custom-dropdown');
    const memberSelect = row.querySelector('td:nth-child(3) select');
    if (!searchInput || !dropdown) return;

    const searchText = searchInput.value.toLowerCase();
    const selectedMember = memberSelect ? memberSelect.value : '';

    let filtered = qmAllTasks;
    if (selectedMember) {
        filtered = filtered.filter(t => t.member === selectedMember);
    }
    if (searchText) {
        filtered = filtered.filter(t => t.display.toLowerCase().includes(searchText));
    }

    if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="custom-dropdown-empty">該当なし</div>';
    } else {
        dropdown.innerHTML = filtered.map(t => {
            const value = `${t.version}|${t.task}|${t.process}|${t.member}`;
            return `<div class="custom-dropdown-item" onmousedown="qmBatchSelectTask(${rowId}, '${escapeForHandler(value)}', '${escapeForHandler(t.display)}')">${escapeHtml(t.display)}</div>`;
        }).join('');
    }

    dropdown.style.display = 'block';
}

/**
 * 一括入力行のタスクを選択
 */
export function qmBatchSelectTask(rowId, value, display) {
    const row = document.getElementById(`qmBatchRow_${rowId}`);
    if (!row) return;

    const [version, task, process, member] = value.split('|');
    const searchInput = row.querySelector('td:nth-child(2) input[type="text"]');
    const clearBtn = row.querySelector('td:nth-child(2) button');
    const hiddenInput = row.querySelector('td:nth-child(2) .qm-batch-task-data');
    const dropdown = row.querySelector('td:nth-child(2) .custom-dropdown');
    const memberSelect = row.querySelector('td:nth-child(3) select');

    if (searchInput) searchInput.value = `${version} - ${task} [${process}]`;
    if (clearBtn) clearBtn.style.display = 'block';
    if (hiddenInput) hiddenInput.value = value;
    if (dropdown) dropdown.style.display = 'none';
    if (memberSelect && !memberSelect.value) memberSelect.value = member;
}

/**
 * 一括入力行のタスク選択をクリア
 */
export function qmBatchClearTask(rowId) {
    const row = document.getElementById(`qmBatchRow_${rowId}`);
    if (!row) return;

    const searchInput = row.querySelector('td:nth-child(2) input[type="text"]');
    const clearBtn = row.querySelector('td:nth-child(2) button');
    const hiddenInput = row.querySelector('td:nth-child(2) .qm-batch-task-data');
    const dropdown = row.querySelector('td:nth-child(2) .custom-dropdown');

    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (hiddenInput) hiddenInput.value = '';
    if (dropdown) dropdown.style.display = 'none';
}

/**
 * 一括登録を実行
 */
export function qmBatchSave() {
    const tbody = document.getElementById('qmBatchBody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    const newActuals = [];
    const errors = [];

    rows.forEach((row, index) => {
        const dateInput = row.querySelector('td:nth-child(1) input[type="date"]');
        const hiddenInput = row.querySelector('td:nth-child(2) .qm-batch-task-data');
        const memberSelect = row.querySelector('td:nth-child(3) select');
        const hoursInput = row.querySelector('td:nth-child(4) input[type="number"]');

        const searchTextInput = row.querySelector('td:nth-child(2) input[type="text"]');
        const date = dateInput ? dateInput.value : '';
        const taskData = hiddenInput ? hiddenInput.value : '';
        const searchText = searchTextInput ? searchTextInput.value.trim() : '';
        const memberOverride = memberSelect ? memberSelect.value : '';
        const hours = hoursInput ? parseFloat(hoursInput.value) : 0;

        // 対応が未入力の行はスキップ（ユーザーが触っていない行）
        if (!taskData && !searchText) return;

        if (!taskData) {
            errors.push(`行 ${index + 1}: 対応が選択されていません（候補から選択してください）`);
            return;
        }
        if (!hours || hours <= 0) {
            errors.push(`行 ${index + 1}: 工数が入力されていません`);
            return;
        }
        if (!date) {
            errors.push(`行 ${index + 1}: 作業日が入力されていません`);
            return;
        }

        const [version, task, process, originalMember] = taskData.split('|');
        const finalMember = memberOverride || originalMember;

        newActuals.push({
            id: Date.now() + Math.random(),
            date: date,
            version: version,
            task: task,
            process: process,
            member: finalMember,
            hours: hours,
            createdAt: new Date().toISOString()
        });
    });

    if (errors.length > 0) {
        showAlert(errors.join('\n'));
        return;
    }

    if (newActuals.length === 0) {
        showAlert('登録する実績がありません');
        return;
    }

    // 全て追加
    newActuals.forEach(a => actuals.push(a));

    pushAction({
        type: 'actual_add',
        description: `一括実績追加: ${newActuals.length}件`,
        data: { added: newActuals.map(a => ({ ...a })) }
    });

    if (typeof window.saveData === 'function') window.saveData();

    // 一括入力エリアをリセット
    const batchBody = document.getElementById('qmBatchBody');
    if (batchBody) batchBody.innerHTML = '';
    qmBatchRowId = 0;
    qmAddBatchRow();
    qmAddBatchRow();
    qmAddBatchRow();

    // UI更新
    qmRefreshUI();
    showAlert(`${newActuals.length}件の実績を一括登録しました`, true);
}

/**
 * ドロップダウンの外部クリックハンドラを初期化
 */
function qmInitDropdownHandler() {
    // 重複登録防止
    if (qmInitDropdownHandler._initialized) return;
    qmInitDropdownHandler._initialized = true;

    document.addEventListener('click', function(event) {
        // 単一入力のドロップダウン
        const dropdown = document.getElementById('qmTaskDropdown');
        const searchInput = document.getElementById('qmTaskSearch');
        if (dropdown && searchInput) {
            if (!dropdown.contains(event.target) && event.target !== searchInput) {
                dropdown.style.display = 'none';
            }
        }

        // 一括入力のドロップダウン
        const batchBody = document.getElementById('qmBatchBody');
        if (batchBody) {
            batchBody.querySelectorAll('.custom-dropdown').forEach(dd => {
                const row = dd.closest('tr');
                if (row) {
                    const input = row.querySelector('td:nth-child(2) input[type="text"]');
                    if (!dd.contains(event.target) && event.target !== input) {
                        dd.style.display = 'none';
                    }
                }
            });
        }
    });
}

console.log('✅ モジュール actual.js loaded');

