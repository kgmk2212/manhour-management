// ============================================
// その他作業関連機能
// ============================================

import * as State from './state.js';

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
        alert('工数を入力してください');
        return;
    }

    // 全担当者を取得
    const members = new Set();
    State.estimates.forEach(e => members.add(e.member));
    State.actuals.forEach(a => members.add(a.member));

    console.log('members:', Array.from(members));

    if (members.size === 0) {
        alert('担当者が登録されていません。先に見積または実績を登録してください。');
        return;
    }

    // 全担当者分の実績を追加
    let count = 0;
    members.forEach(member => {
        State.actuals.push({
            id: Date.now() + count,
            date: date,
            version: '',  // 版数なし
            task: '打ち合わせ',
            process: '',
            member: member,
            hours: hours,
            createdAt: new Date().toISOString()
        });
        count++;
    });

    console.log('actuals added, count:', count);

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();

    // 入力欄をクリアしてモーダルを閉じる
    document.getElementById('meetingHours').value = '';
    closeOtherWorkModal();

    alert(`打ち合わせを${members.size}名分登録しました（${date}）`);
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
        alert('作業名を入力してください');
        return;
    }

    if (!member) {
        alert('担当者を選択してください');
        return;
    }

    if (!hours || hours <= 0) {
        alert('工数を入力してください');
        return;
    }

    // その他作業を追加
    State.actuals.push({
        id: Date.now(),
        date: date,
        version: '',  // 版数なし
        task: workName,
        process: '',
        member: member,
        hours: hours,
        createdAt: new Date().toISOString()
    });

    console.log('other work added');

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();

    // 入力欄をクリアしてモーダルを閉じる
    document.getElementById('otherWorkName').value = '';
    document.getElementById('otherWorkMember').value = '';
    document.getElementById('otherWorkHours').value = '';
    closeOtherWorkModal();

    alert(`その他作業を登録しました（${date}）`);
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
    // 打ち合わせタブをアクティブにする
    switchOtherWorkTab('meeting');
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

console.log('✅ モジュール other-work.js loaded');
