// ============================================
// 実績管理モジュール (actual.js)
// ============================================

import {
    estimates, actuals, remainingEstimates,
    setActuals
} from './state.js';

import { showAlert, sortMembers, formatHours, normalizeEstimate } from './utils.js';
import { saveRemainingEstimate, getRemainingEstimate, isOtherWork } from './estimate.js';

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
 */
export function getHoliday(dateStr) {
    // @holiday-jp/holiday_jp ライブラリを使用
    if (typeof holiday_jp !== 'undefined' && typeof holiday_jp.between === 'function') {
        try {
            const date = new Date(dateStr + 'T00:00:00');
            const holidays = holiday_jp.between(date, date);
            if (holidays && holidays.length > 0) {
                return holidays[0].name;
            }
        } catch (error) {
            console.error('Holiday check error:', error);
        }
    }

    // フォールバック: 主要な祝日のみ対応（2025-2030年）
    const holidays = {
        // 2025年
        '2025-01-01': '元日',
        '2025-01-13': '成人の日',
        '2025-02-11': '建国記念の日',
        '2025-02-23': '天皇誕生日',
        '2025-02-24': '振替休日',
        '2025-03-20': '春分の日',
        '2025-04-29': '昭和の日',
        '2025-05-03': '憲法記念日',
        '2025-05-04': 'みどりの日',
        '2025-05-05': 'こどもの日',
        '2025-05-06': '振替休日',
        '2025-07-21': '海の日',
        '2025-08-11': '山の日',
        '2025-09-15': '敬老の日',
        '2025-09-23': '秋分の日',
        '2025-10-13': 'スポーツの日',
        '2025-11-03': '文化の日',
        '2025-11-23': '勤労感謝の日',
        '2025-11-24': '振替休日',
        // 2026年
        '2026-01-01': '元日',
        '2026-01-12': '成人の日',
        '2026-02-11': '建国記念の日',
        '2026-02-23': '天皇誕生日',
        '2026-03-20': '春分の日',
        '2026-04-29': '昭和の日',
        '2026-05-03': '憲法記念日',
        '2026-05-04': 'みどりの日',
        '2026-05-05': 'こどもの日',
        '2026-05-06': '振替休日',
        '2026-07-20': '海の日',
        '2026-08-11': '山の日',
        '2026-09-21': '敬老の日',
        '2026-09-22': '秋分の日',
        '2026-10-12': 'スポーツの日',
        '2026-11-03': '文化の日',
        '2026-11-23': '勤労感謝の日',
        '2026-12-23': '天皇誕生日',
        // 2027年
        '2027-01-01': '元日',
        '2027-01-11': '成人の日',
        '2027-02-11': '建国記念の日',
        '2027-02-23': '天皇誕生日',
        '2027-03-21': '春分の日',
        '2027-03-22': '振替休日',
        '2027-04-29': '昭和の日',
        '2027-05-03': '憲法記念日',
        '2027-05-04': 'みどりの日',
        '2027-05-05': 'こどもの日',
        '2027-07-19': '海の日',
        '2027-08-11': '山の日',
        '2027-09-20': '敬老の日',
        '2027-09-23': '秋分の日',
        '2027-10-11': 'スポーツの日',
        '2027-11-03': '文化の日',
        '2027-11-23': '勤労感謝の日',
        '2027-12-23': '天皇誕生日',
        // 2028年
        '2028-01-01': '元日',
        '2028-01-10': '成人の日',
        '2028-02-11': '建国記念の日',
        '2028-02-23': '天皇誕生日',
        '2028-03-20': '春分の日',
        '2028-04-29': '昭和の日',
        '2028-05-03': '憲法記念日',
        '2028-05-04': 'みどりの日',
        '2028-05-05': 'こどもの日',
        '2028-07-17': '海の日',
        '2028-08-11': '山の日',
        '2028-09-18': '敬老の日',
        '2028-09-22': '秋分の日',
        '2028-10-09': 'スポーツの日',
        '2028-11-03': '文化の日',
        '2028-11-23': '勤労感謝の日',
        '2028-12-23': '天皇誕生日',
        // 2029年
        '2029-01-01': '元日',
        '2029-01-08': '成人の日',
        '2029-02-11': '建国記念の日',
        '2029-02-12': '振替休日',
        '2029-02-23': '天皇誕生日',
        '2029-03-20': '春分の日',
        '2029-04-29': '昭和の日',
        '2029-04-30': '振替休日',
        '2029-05-03': '憲法記念日',
        '2029-05-04': 'みどりの日',
        '2029-05-05': 'こどもの日',
        '2029-07-16': '海の日',
        '2029-08-11': '山の日',
        '2029-09-17': '敬老の日',
        '2029-09-23': '秋分の日',
        '2029-09-24': '振替休日',
        '2029-10-08': 'スポーツの日',
        '2029-11-03': '文化の日',
        '2029-11-23': '勤労感謝の日',
        '2029-12-23': '天皇誕生日',
        '2029-12-24': '振替休日',
        // 2030年
        '2030-01-01': '元日',
        '2030-01-14': '成人の日',
        '2030-02-11': '建国記念の日',
        '2030-02-23': '天皇誕生日',
        '2030-03-20': '春分の日',
        '2030-04-29': '昭和の日',
        '2030-05-03': '憲法記念日',
        '2030-05-04': 'みどりの日',
        '2030-05-05': 'こどもの日',
        '2030-05-06': '振替休日',
        '2030-07-15': '海の日',
        '2030-08-11': '山の日',
        '2030-08-12': '振替休日',
        '2030-09-16': '敬老の日',
        '2030-09-23': '秋分の日',
        '2030-10-14': 'スポーツの日',
        '2030-11-03': '文化の日',
        '2030-11-04': '振替休日',
        '2030-11-23': '勤労感謝の日',
        '2030-12-23': '天皇誕生日'
    };

    return holidays[dateStr] || null;
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

    let html = '<div class="table-wrapper"><table><tr><th>時刻</th><th>版数</th><th>対応名</th><th>工程</th><th>担当</th><th>工数</th><th>操作</th></tr>';

    todayData.forEach(a => {
        let time = '-';
        if (a.createdAt) {
            const date = new Date(a.createdAt);
            if (!isNaN(date.getTime())) {
                time = date.toLocaleTimeString('ja-JP');
            }
        }
        html += `
            <tr>
                <td>${time}</td>
                <td>${a.version}</td>
                <td>${a.task}</td>
                <td><span class="badge badge-${a.process.toLowerCase()}">${a.process}</span></td>
                <td>${a.member}</td>
                <td>${a.hours}h</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="editActual(${a.id})" style="margin-right: 5px;">編集</button>
                    <button class="btn btn-danger btn-small" onclick="deleteActual(${a.id})">削除</button>
                </td>
            </tr>
        `;
    });

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
    const viewMode = document.getElementById('actualViewMode').value;

    // 担当者別モード時は担当者選択を表示
    const memberSelectGroup = document.getElementById('memberSelectGroup');
    const memberSelectGroup2 = document.getElementById('memberSelectGroup2');
    if (viewMode === 'member') {
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

    if (viewType === 'matrix') {
        if (viewMode === 'member') {
            renderMemberCalendar();
        } else {
            renderActualMatrix();
        }
    } else {
        renderActualListView();
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

    let html = `<h3 style="margin-bottom: 10px;">${selectedMember}の実績カレンダー</h3>`;

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
            ? `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})<span class="holiday-inline"> ${holiday}</span><span class="holiday-break"><br><span style="font-size: 11px; font-weight: normal;">${holiday}</span></span>`
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
                const escapeHtml = (str) => {
                    const div = document.createElement('div');
                    div.textContent = str;
                    return div.innerHTML;
                };
                html += `<td style="font-size: 14px;">${escapeHtml(actual.version)} - ${escapeHtml(actual.task)} [${actual.process}]</td>`;
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
            html += `<th class="cm-th-member">${member}</th>`;
        });
        html += '<th class="cm-daily-total cm-th-daily-total">日別合計</th></tr>';
    } else {
        html += '<div id="calendarTableWrapper" class="table-wrapper"><table class="actual-matrix">';
        html += '<tr><th class="cm-th-date">日付</th>';

        members.forEach(member => {
            html += `<th class="cm-th-member">${member}</th>`;
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
            dateDisplay = `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})<span class="holiday-inline"> ${holiday}</span><span class="holiday-break"><br><span class="cm-holiday-sub">${holiday}</span></span>`;
        } else if (isCompanyHol) {
            dateClass = ' cm-date-company-holiday';
            dateDisplay = `${parseInt(m)}/${parseInt(day)} (${dayOfWeek})<span class="holiday-inline"> ${companyHolidayName}</span><span class="holiday-break"><br><span class="cm-holiday-sub">${companyHolidayName}</span></span>`;
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
            let onclick = `addActualFromCalendar('${member}', '${date}')`;
            let title = '実績を登録';

            if (memberDayTotal > 0) {
                cellClass = 'cm-cell cm-cell-work';
                onclick = `showWorkDetail('${member}', '${date}')`;
                cellContent = `<strong>${formatHours(memberDayTotal)}</strong>`;
                title = '';
            } else if (memberVacations.length > 0) {
                cellClass = 'cm-cell cm-cell-vacation';
                onclick = `showWorkDetail('${member}', '${date}')`;
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
    const viewMode = document.getElementById('actualViewMode').value;
    const selectedMonth = document.getElementById('actualMonthFilter').value;

    let filteredActuals = actuals;

    if (viewMode === 'member') {
        const selectedMember = document.getElementById('actualMemberSelect').value;
        if (selectedMember) {
            filteredActuals = filteredActuals.filter(a => a.member === selectedMember);
        }
    }

    if (selectedMonth !== 'all') {
        filteredActuals = filteredActuals.filter(a => a.date && a.date.startsWith(selectedMonth));
    }

    let html = '<div class="table-wrapper"><table><tr><th>日付</th><th>版数</th><th>対応名</th><th>工程</th><th>担当</th><th>実績工数</th><th>操作</th></tr>';

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

    sortedActuals.forEach(a => {
        html += `
            <tr>
                <td>${a.date}</td>
                <td>${a.version}</td>
                <td>${a.task}</td>
                <td><span class="badge badge-${a.process.toLowerCase()}">${a.process}</span></td>
                <td>${a.member}</td>
                <td>${a.hours}h</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="editActual(${a.id})" style="margin-right: 5px;">編集</button>
                    <button class="btn btn-danger btn-small" onclick="deleteActual(${a.id})">削除</button>
                </td>
            </tr>
        `;
    });

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
                                <strong>${vacation.vacationType}</strong>
                                <span style="color: #666; font-size: 14px; margin-left: 10px;">${vacation.hours}h</span>
                            </div>
                            <button onclick="deleteVacationFromModal(${vacation.id}, '${member}', '${date}')" style="background: none; border: none; color: #95a5a6; cursor: pointer; font-size: 12px; padding: 4px 8px; text-decoration: underline;">削除</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        dayActuals.forEach(actual => {
            html += `
                <div class="work-item">
                    <div class="work-item-header">
                        <div class="work-item-title">${actual.task}</div>
                        <div class="work-item-hours">${actual.hours}h</div>
                    </div>
                    <div class="work-item-details">
                        <span><strong>版数:</strong> ${actual.version || '(なし)'}</span>
                        <span><strong>工程:</strong> ${actual.process ? `<span class="badge badge-${actual.process.toLowerCase()}">${actual.process}</span>` : '(なし)'}</span>
                    </div>
                    <div style="margin-top: 8px; text-align: right;">
                        <button onclick="editActualFromModal(${actual.id})" style="background: none; border: none; color: #3498db; cursor: pointer; font-size: 12px; padding: 4px 8px; text-decoration: underline;">編集</button>
                        <button onclick="deleteActualFromModal(${actual.id}, '${member}', '${date}')" style="background: none; border: none; color: #95a5a6; cursor: pointer; font-size: 12px; padding: 4px 8px; text-decoration: underline;">削除</button>
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
                <button onclick="addActualFromCalendar('${member}', '${date}'); closeWorkModal();"
                        style="padding: 10px 20px; background: #4caf50; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600;">
                    + 新しい実績を追加
                </button>
                <button onclick="addVacationFromCalendar('${member}', '${date}'); closeWorkModal();"
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
                            <span class="wd-vacation-type">${vacation.vacationType}</span>
                            <span class="wd-vacation-hours">${vacation.hours}h</span>
                        </div>
                        <div class="wd-vacation-actions">
                            <a href="#" class="wd-delete-link" onclick="event.preventDefault(); deleteVacationFromModal(${vacation.id}, '${member}', '${date}')">削除</a>
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
                    <div class="wd-card">
                        <div class="wd-card-header">
                            <div class="wd-card-title">${actual.task}</div>
                            <div class="wd-card-hours">${actual.hours}h</div>
                        </div>
                        <div class="wd-card-meta">
                            <span>${actual.version || '版数なし'}</span>
                            <span style="color: #ccc;">·</span>
                            ${actual.process ? `<span class="badge badge-${actual.process.toLowerCase()}">${actual.process}</span>` : '<span>工程なし</span>'}
                        </div>
                        <div class="wd-card-actions">
                            <a href="#" class="wd-edit-link" onclick="event.preventDefault(); editActualFromModal(${actual.id})">編集</a>
                            <a href="#" class="wd-delete-link" onclick="event.preventDefault(); deleteActualFromModal(${actual.id}, '${member}', '${date}')">削除</a>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        html += `
            <div class="wd-add-actions">
                <button class="wd-add-btn wd-add-btn-actual" onclick="addActualFromCalendar('${member}', '${date}'); closeWorkModal();">
                    + 実績を追加
                </button>
                <button class="wd-add-btn wd-add-btn-vacation" onclick="addVacationFromCalendar('${member}', '${date}'); closeWorkModal();">
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

// ============================================
// 実績CRUD操作
// ============================================

/**
 * 実績を削除
 */
export function deleteActual(id) {
    if (!confirm('この実績を削除しますか?')) return;
    const newActuals = actuals.filter(a => a.id !== id);
    setActuals(newActuals);
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
        const newActuals = actuals.filter(a => a.id !== id);
        setActuals(newActuals);
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

    document.getElementById('editActualTaskSelect').style.display = 'block';
    document.getElementById('editActualTaskSelect').value = '';
    document.getElementById('editActualTaskSearch').style.display = 'none';
    document.getElementById('editActualTaskSearch').value = '';

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

    updateEditActualTaskList(member, false, versionSelect.value, document.getElementById('editActualProcess').value);

    if (previousActual) {
        const taskSelect = document.getElementById('editActualTaskSelect');
        taskSelect.value = previousActual.task;
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
        alert('データが見つかりません');
        return;
    }

    document.getElementById('editActualId').value = id;
    document.getElementById('editActualDate').value = actual.date;
    document.getElementById('editActualVersion').value = actual.version;

    updateEditActualTaskList(actual.member, true, actual.version, actual.process);

    const taskSelect = document.getElementById('editActualTaskSelect');
    taskSelect.style.display = 'block';
    document.getElementById('editActualTaskSearch').style.display = 'none';
    taskSelect.value = actual.task;

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
    const version = document.getElementById('editActualVersion').value;

    const taskSelect = document.getElementById('editActualTaskSelect');
    const taskInput = document.getElementById('editActualTaskSearch');
    const task = taskSelect.style.display !== 'none' && taskSelect.value && taskSelect.value !== '__NEW__'
        ? taskSelect.value
        : taskInput.value;

    const process = document.getElementById('editActualProcess').value;
    const member = document.getElementById('editActualMember').value;
    const hours = parseFloat(document.getElementById('editActualHours').value);
    const remainingHoursInput = document.getElementById('editActualRemainingHours');
    const remainingHours = remainingHoursInput.value !== '' ? parseFloat(remainingHoursInput.value) : null;

    if (!date || !version || !task || !process || !member || !hours) {
        alert('すべての項目を入力してください');
        return;
    }

    if (id && !isNaN(id)) {
        const actualIndex = actuals.findIndex(a => a.id === id);
        if (actualIndex !== -1) {
            actuals[actualIndex] = {
                ...actuals[actualIndex],
                date: date,
                version: version,
                task: task,
                process: process,
                member: member,
                hours: hours
            };

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
            hours: hours
        };

        actuals.push(newActual);

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
            // 日付が同じ場合は作成日時で降順ソート
            const createdA = a.createdAt || '';
            const createdB = b.createdAt || '';
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

console.log('✅ モジュール actual.js loaded');

