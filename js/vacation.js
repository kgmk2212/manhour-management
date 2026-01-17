// ============================================
// 休暇・休日管理機能
// ============================================

import {
    companyHolidays, setCompanyHolidays,
    vacations, setVacations,
    nextCompanyHolidayId, setNextCompanyHolidayId,
    nextVacationId, setNextVacationId
} from './state.js';
import { showAlert } from './utils.js';

// ============================================
// 会社休日管理
// ============================================

export function addCompanyHoliday() {
    const name = document.getElementById('companyHolidayName').value.trim();
    const startDate = document.getElementById('companyHolidayStartDate').value;
    const endDate = document.getElementById('companyHolidayEndDate').value;

    if (!name || !startDate || !endDate) {
        alert('全ての項目を入力してください');
        return;
    }

    if (startDate > endDate) {
        alert('終了日は開始日以降の日付を指定してください');
        return;
    }

    const holiday = {
        id: nextCompanyHolidayId,
        name: name,
        startDate: startDate,
        endDate: endDate
    };

    companyHolidays.push(holiday);
    setNextCompanyHolidayId(nextCompanyHolidayId + 1);

    // saveDataとupdateAllDisplaysは後でimport
    window.saveData();
    renderCompanyHolidayList();

    // フォームをクリア
    document.getElementById('companyHolidayName').value = '';
    document.getElementById('companyHolidayStartDate').value = '';
    document.getElementById('companyHolidayEndDate').value = '';
}

export function deleteCompanyHoliday(id) {
    if (!confirm('この会社休日を削除しますか？')) return;
    setCompanyHolidays(companyHolidays.filter(h => h.id !== id));
    window.saveData();
    renderCompanyHolidayList();
    window.updateAllDisplays();
}

export function renderCompanyHolidayList() {
    const container = document.getElementById('companyHolidayList');
    if (companyHolidays.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">会社休日が登録されていません</p>';
        return;
    }

    let html = '<div class="table-wrapper"><table style="min-width: 0;">';
    html += '<tr><th>休日名</th><th>期間</th><th>操作</th></tr>';

    companyHolidays.forEach(h => {
        html += `
            <tr>
                <td>${h.name}</td>
                <td>${h.startDate} ～ ${h.endDate}</td>
                <td>
                    <button class="btn btn-danger btn-small" onclick="deleteCompanyHoliday(${h.id})">削除</button>
                </td>
            </tr>
        `;
    });

    html += '</table></div>';
    container.innerHTML = html;
}

export function isCompanyHoliday(dateStr) {
    return companyHolidays.some(h => dateStr >= h.startDate && dateStr <= h.endDate);
}

export function getCompanyHolidayName(dateStr) {
    const holiday = companyHolidays.find(h => dateStr >= h.startDate && dateStr <= h.endDate);
    return holiday ? holiday.name : null;
}

// ============================================
// 個人休暇管理
// ============================================

export function handleVacationTypeChange() {
    const vacationType = document.getElementById('quickVacationType').value;
    const hoursInput = document.getElementById('quickVacationHours');

    if (vacationType === '時間休') {
        hoursInput.value = 1;
        hoursInput.max = 8;
    } else {
        hoursInput.value = 8;
        hoursInput.removeAttribute('max');
    }
}

export function addQuickVacation() {
    const member = document.getElementById('quickVacationMember').value;
    const date = document.getElementById('quickVacationDate').value;
    const vacationType = document.getElementById('quickVacationType').value;
    const hours = parseFloat(document.getElementById('quickVacationHours').value);

    if (!member || !date || !vacationType || !hours) {
        alert('全ての項目を入力してください');
        return;
    }

    if (hours <= 0 || hours > 8) {
        alert('時間数は1～8の範囲で入力してください');
        return;
    }

    const vacation = {
        id: nextVacationId,
        member: member,
        date: date,
        vacationType: vacationType,
        hours: hours
    };

    vacations.push(vacation);
    setNextVacationId(nextVacationId + 1);
    window.saveData();
    window.renderActualList();
    showAlert('休暇を登録しました', true);

    // フォームをリセット
    document.getElementById('quickVacationHours').value = 8;
}

export function deleteVacation(id) {
    if (!confirm('この休暇を削除しますか？')) return;
    setVacations(vacations.filter(v => v.id !== id));
    window.saveData();
    window.renderActualList();
}

export function deleteVacationFromModal(id, member, date) {
    if (!confirm('この休暇を削除しますか？')) return;
    setVacations(vacations.filter(v => v.id !== id));
    window.saveData();
    window.renderActualList();
    // モーダルを再表示
    window.showWorkDetail(member, date);
}

export function addVacationFromCalendar(member, date) {
    document.getElementById('vacationModalMember').value = member;
    document.getElementById('vacationModalDate').value = date;
    document.getElementById('vacationModalMemberDisplay').textContent = member;

    const [year, month, day] = date.split('-');
    const dateObj = new Date(date);
    const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
    document.getElementById('vacationModalDateDisplay').textContent = `${year}年${parseInt(month)}月${parseInt(day)}日(${dayOfWeek})`;

    document.getElementById('vacationModalType').value = '有休';
    document.getElementById('vacationModalHours').value = 8;
    handleVacationModalTypeChange();

    document.getElementById('vacationModal').style.display = 'flex';
}

export function closeVacationModal() {
    document.getElementById('vacationModal').style.display = 'none';
}

export function handleVacationModalTypeChange() {
    const type = document.getElementById('vacationModalType').value;
    const hoursInput = document.getElementById('vacationModalHours');
    if (type === '時間休') {
        hoursInput.value = 1;
    } else {
        hoursInput.value = 8;
    }
}

export function saveVacationFromModal() {
    const member = document.getElementById('vacationModalMember').value;
    const date = document.getElementById('vacationModalDate').value;
    const vacationType = document.getElementById('vacationModalType').value;
    const hours = parseFloat(document.getElementById('vacationModalHours').value);

    if (!member || !date || !vacationType || !hours) {
        alert('全ての項目を入力してください');
        return;
    }

    if (hours <= 0 || hours > 8) {
        alert('時間数は1～8の範囲で入力してください');
        return;
    }

    const vacation = {
        id: nextVacationId,
        member: member,
        date: date,
        vacationType: vacationType,
        hours: hours
    };

    vacations.push(vacation);
    setNextVacationId(nextVacationId + 1);
    window.saveData();
    closeVacationModal();
    window.renderActualList();
    showAlert('休暇を登録しました', true);
}

export function getVacation(member, dateStr) {
    return vacations.filter(v => v.member === member && v.date === dateStr);
}
