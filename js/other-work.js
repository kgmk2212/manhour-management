// ============================================
// その他作業関連機能
// ============================================

import * as State from './state.js';
import { pushAction } from './history.js';
import { showAlert } from './utils.js';

// ============================================
// 打ち合わせ・その他作業
// ============================================

// 打ち合わせを全員分追加
export function addMeeting() {
    console.log('addMeeting called');
    const hours = parseFloat(document.getElementById('meetingHours').value);

    // カレンダーからの日付があればそれを使用、なければ今日の日付
    const modal = document.getElementById('otherWorkModal');
    let date;
    if (modal.dataset.calendarDate) {
        date = modal.dataset.calendarDate;
    } else {
        const today = new Date();
        date = today.toISOString().split('T')[0];
    }

    console.log('hours:', hours, 'date:', date);

    if (!hours || hours <= 0) {
        showAlert('工数を入力してください', false);
        return;
    }

    // 全担当者を取得
    const members = new Set();
    State.estimates.forEach(e => members.add(e.member));
    State.actuals.forEach(a => members.add(a.member));

    console.log('members:', Array.from(members));

    if (members.size === 0) {
        showAlert('担当者が登録されていません。先に見積または実績を登録してください。', false);
        return;
    }

    // 全担当者分の実績を追加
    let count = 0;
    const addedActuals = [];
    members.forEach(member => {
        const actual = {
            id: Date.now() + count,
            date: date,
            version: '',
            task: '打ち合わせ',
            process: '',
            member: member,
            hours: hours,
            createdAt: new Date().toISOString()
        };
        State.actuals.push(actual);
        addedActuals.push({ ...actual });
        count++;
    });

    pushAction({
        type: 'actual_add',
        description: `打ち合わせ追加: ${members.size}名分 ${hours}h`,
        data: { added: addedActuals[0], addedAll: addedActuals }
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();

    // 入力欄をクリアしてモーダルを閉じる
    document.getElementById('meetingHours').value = '';
    closeOtherWorkModal();

    showAlert(`打ち合わせを${members.size}名分登録しました（${date}）`, true);
}

// その他作業を追加
export function addOtherWork() {
    console.log('addOtherWork called');
    const workName = document.getElementById('otherWorkName').value.trim();
    const member = document.getElementById('otherWorkMember').value;
    const hours = parseFloat(document.getElementById('otherWorkHours').value);

    // カレンダーからの日付があればそれを使用、なければ今日の日付
    const modal = document.getElementById('otherWorkModal');
    let date;
    if (modal.dataset.calendarDate) {
        date = modal.dataset.calendarDate;
    } else {
        const today = new Date();
        date = today.toISOString().split('T')[0];
    }

    console.log('workName:', workName, 'member:', member, 'hours:', hours, 'date:', date);

    if (!workName) {
        showAlert('作業名を入力してください', false);
        return;
    }

    if (!member) {
        showAlert('担当者を選択してください', false);
        return;
    }

    if (!hours || hours <= 0) {
        showAlert('工数を入力してください', false);
        return;
    }

    // その他作業を追加
    const newActual = {
        id: Date.now(),
        date: date,
        version: '',
        task: workName,
        process: '',
        member: member,
        hours: hours,
        createdAt: new Date().toISOString()
    };
    State.actuals.push(newActual);

    pushAction({
        type: 'actual_add',
        description: `その他作業追加: ${workName} ${hours}h`,
        data: { added: { ...newActual } }
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();

    // 入力欄をクリアしてモーダルを閉じる
    document.getElementById('otherWorkName').value = '';
    document.getElementById('otherWorkMember').value = '';
    document.getElementById('otherWorkHours').value = '';
    closeOtherWorkModal();

    showAlert(`その他作業を登録しました（${date}）`, true);
}

// その他作業モーダルを開く
export function openOtherWorkModal() {
    // 担当者リストを更新
    const otherWorkMemberSelect = document.getElementById('otherWorkMember');
    if (otherWorkMemberSelect) {
        // 担当者を抽出
        const members = new Set();
        State.estimates.forEach(e => members.add(e.member));
        State.actuals.forEach(a => members.add(a.member));

        // 表示順でソート
        let sortedMembers;
        const memberOrderInput = document.getElementById('memberOrder').value.trim();
        if (memberOrderInput) {
            const orderList = memberOrderInput.split(',').map(m => m.trim()).filter(m => m);
            const orderedMembers = [];
            const unorderedMembers = [];

            orderList.forEach(name => {
                if (members.has(name)) {
                    orderedMembers.push(name);
                }
            });

            Array.from(members).forEach(m => {
                if (!orderedMembers.includes(m)) {
                    unorderedMembers.push(m);
                }
            });

            sortedMembers = [...orderedMembers, ...unorderedMembers.sort()];
        } else {
            sortedMembers = Array.from(members).sort();
        }

        otherWorkMemberSelect.innerHTML = '<option value="">選択...</option>';
        sortedMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member;
            option.textContent = member;
            otherWorkMemberSelect.appendChild(option);
        });
    }

    document.getElementById('otherWorkModal').style.display = 'flex';
    // 直近のその他作業を引き継いでデフォルト値を設定する(タブ選択も内部で行う)
    applyOtherWorkDefaults(null, null);
}

// その他作業モーダルを閉じる
export function closeOtherWorkModal() {
    const modal = document.getElementById('otherWorkModal');
    modal.style.display = 'none';

    // カレンダー日付データをクリア
    delete modal.dataset.calendarDate;

    // モーダルタイトルをリセット
    document.querySelector('#otherWorkModal .modal-header h3').textContent = 'その他作業を登録';
}

// その他作業モーダルのタブを切り替え
export function switchOtherWorkTab(tab) {
    const meetingTab = document.getElementById('meetingTab');
    const customTab = document.getElementById('customTab');
    const meetingForm = document.getElementById('meetingForm');
    const customForm = document.getElementById('customForm');

    if (tab === 'meeting') {
        meetingTab.classList.add('active');
        customTab.classList.remove('active');
        meetingForm.style.display = 'block';
        customForm.style.display = 'none';
    } else {
        meetingTab.classList.remove('active');
        customTab.classList.add('active');
        meetingForm.style.display = 'none';
        customForm.style.display = 'block';
    }
}

// ============================================
// その他作業のデフォルト値(前回コピー)
// ============================================

/**
 * その他作業(version/process が空の実績)の中から、直近の1件を返す。
 * 通常実績の getPreviousActual と同じソート思想(日付降順 → createdAt降順)。
 * @param {string|null} member - 担当者で絞る場合に指定。null なら全担当者対象。
 * @param {string|null} beforeDate - この日付(YYYY-MM-DD)より前に絞る場合に指定。null なら全期間。
 * @returns {object|null} 直近のその他作業レコード。なければ null。
 */
export function getPreviousOtherWork(member, beforeDate) {
    let list = State.actuals.filter(a => !a.version && !a.process && a.task);
    if (member) list = list.filter(a => a.member === member);
    if (beforeDate) list = list.filter(a => a.date < beforeDate);
    if (list.length === 0) return null;

    list.sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        const createdA = a.createdAt || '';
        const createdB = b.createdAt || '';
        return createdB.localeCompare(createdA);
    });
    return list[0];
}

/**
 * その他作業モーダルを開いた際、直近のその他作業を引き継いでデフォルト値を設定する。
 * 通常実績の「前回をコピー + 8h」に倣い、工数は常に 8h をデフォルトとする。
 * 直近が「打ち合わせ」または履歴なしなら打ち合わせタブ、任意作業ならそのタブを初期表示する。
 * @param {string|null} member - コンテキストの担当者(カレンダー経由)。null ならコンテキストなし。
 * @param {string|null} beforeDate - コンテキストの日付。null なら全期間から直近を採用。
 */
export function applyOtherWorkDefaults(member, beforeDate) {
    const DEFAULT_HOURS = 8;
    const previous = getPreviousOtherWork(member, beforeDate);

    const meetingHoursEl = document.getElementById('meetingHours');
    const otherWorkNameEl = document.getElementById('otherWorkName');
    const otherWorkMemberEl = document.getElementById('otherWorkMember');
    const otherWorkHoursEl = document.getElementById('otherWorkHours');

    // 両タブとも工数は 8h をデフォルトに(タブ切替後も空にならないように)
    if (meetingHoursEl) meetingHoursEl.value = DEFAULT_HOURS;
    if (otherWorkHoursEl) otherWorkHoursEl.value = DEFAULT_HOURS;

    if (previous && previous.task !== '打ち合わせ') {
        // 直近が任意作業 → 任意作業タブを初期表示し、作業名・担当を復元
        if (otherWorkNameEl) otherWorkNameEl.value = previous.task;
        if (otherWorkMemberEl) otherWorkMemberEl.value = member || previous.member;
        switchOtherWorkTab('custom');
    } else {
        // 直近が打ち合わせ、または履歴なし → 打ち合わせタブを初期表示
        if (member && otherWorkMemberEl) otherWorkMemberEl.value = member;
        switchOtherWorkTab('meeting');
    }
}

console.log('✅ モジュール other-work.js loaded');
