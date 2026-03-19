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
        showAlert('工数を入力してください');
        return;
    }

    // 全担当者を取得
    const members = new Set();
    State.estimates.forEach(e => members.add(e.member));
    State.actuals.forEach(a => members.add(a.member));

    console.log('members:', Array.from(members));

    if (members.size === 0) {
        showAlert('担当者が登録されていません。先に見積または実績を登録してください。');
        return;
    }

    // Bug 4: 8h有休のメンバーを除外する
    const skippedMembers = [];
    const eligibleMembers = [];
    members.forEach(member => {
        // その日の休暇データを確認
        const memberVacations = State.vacations.filter(v => v.member === member && v.date === date);
        const totalVacationHours = memberVacations.reduce((sum, v) => sum + v.hours, 0);
        if (totalVacationHours >= 8) {
            skippedMembers.push(member);
        } else {
            eligibleMembers.push(member);
        }
    });

    if (eligibleMembers.length === 0) {
        showAlert('全メンバーが終日休暇のため、打ち合わせを登録できません。');
        return;
    }

    // 対象メンバー分の実績を追加
    let count = 0;
    const addedActuals = [];
    eligibleMembers.forEach(member => {
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
        description: `打ち合わせ追加: ${eligibleMembers.length}名分 ${hours}h`,
        data: { added: addedActuals[0], addedAll: addedActuals }
    });

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();

    // 入力欄をクリアしてモーダルを閉じる
    document.getElementById('meetingHours').value = '';
    closeOtherWorkModal();

    // スキップされたメンバーがいる場合はメッセージに含める
    let message = `打ち合わせを${eligibleMembers.length}名分登録しました（${date}）`;
    if (skippedMembers.length > 0) {
        message += `\n※終日休暇のため除外: ${skippedMembers.join('、')}`;
    }
    showAlert(message);
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
        showAlert('作業名を入力してください');
        return;
    }

    if (!member) {
        showAlert('担当者を選択してください');
        return;
    }

    if (!hours || hours <= 0) {
        showAlert('工数を入力してください');
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

    showAlert(`その他作業を登録しました（${date}）`);
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
    const templateTab = document.getElementById('templateTab');
    const meetingForm = document.getElementById('meetingForm');
    const customForm = document.getElementById('customForm');
    const templateForm = document.getElementById('templateForm');

    // すべて非アクティブにする
    meetingTab.classList.remove('active');
    customTab.classList.remove('active');
    if (templateTab) templateTab.classList.remove('active');
    meetingForm.style.display = 'none';
    customForm.style.display = 'none';
    if (templateForm) templateForm.style.display = 'none';

    if (tab === 'meeting') {
        meetingTab.classList.add('active');
        meetingForm.style.display = 'block';
    } else if (tab === 'custom') {
        customTab.classList.add('active');
        customForm.style.display = 'block';
    } else if (tab === 'template') {
        if (templateTab) templateTab.classList.add('active');
        if (templateForm) templateForm.style.display = 'block';
        renderTemplateApplyList();
    }
}

// ============================================
// その他工数テンプレート管理
// ============================================

/**
 * テンプレートを追加
 */
export function addOtherWorkTemplate() {
    const nameInput = document.getElementById('templateWorkName');
    const hoursInput = document.getElementById('templateWorkHours');
    const applyToAllInput = document.getElementById('templateApplyToAll');

    const name = nameInput.value.trim();
    const hours = parseFloat(hoursInput.value);
    const applyToAll = applyToAllInput.checked;

    if (!name) {
        showAlert('作業名を入力してください');
        return;
    }
    if (!hours || hours <= 0) {
        showAlert('工数を入力してください');
        return;
    }

    const template = {
        id: Date.now(),
        name: name,
        hours: hours,
        applyToAll: applyToAll
    };

    State.otherWorkTemplates.push(template);

    // 保存
    if (typeof window.saveData === 'function') window.saveData();

    // フォームをクリア
    nameInput.value = '';
    hoursInput.value = '';
    applyToAllInput.checked = true;

    // リストを更新
    renderTemplateSettingsList();

    showAlert(`テンプレート「${name}」を追加しました`);
}

/**
 * テンプレートを削除
 */
export function deleteOtherWorkTemplate(id) {
    const idx = State.otherWorkTemplates.findIndex(t => t.id === id);
    if (idx === -1) return;

    const name = State.otherWorkTemplates[idx].name;
    State.otherWorkTemplates.splice(idx, 1);

    if (typeof window.saveData === 'function') window.saveData();

    renderTemplateSettingsList();
    showAlert(`テンプレート「${name}」を削除しました`);
}

/**
 * 設定画面のテンプレートリストを描画
 */
export function renderTemplateSettingsList() {
    const container = document.getElementById('otherWorkTemplateList');
    if (!container) return;

    if (State.otherWorkTemplates.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 12px; margin: 0;">登録されたテンプレートはありません</p>';
        return;
    }

    let html = '';
    State.otherWorkTemplates.forEach(t => {
        const scope = t.applyToAll ? '全員' : '個別';
        html += `<div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px;">`;
        html += `<div>`;
        html += `<span style="font-weight: 600;">${escapeHtml(t.name)}</span>`;
        html += `<span style="color: var(--text-muted); margin-left: 8px; font-size: 13px;">${t.hours}h</span>`;
        html += `<span style="color: var(--text-muted); margin-left: 8px; font-size: 11px; background: var(--surface-alt, #f0f0f0); padding: 1px 6px; border-radius: 3px;">${scope}</span>`;
        html += `</div>`;
        html += `<button onclick="deleteOtherWorkTemplate(${t.id})" style="background: none; border: none; color: var(--danger, #dc3545); cursor: pointer; font-size: 16px; padding: 2px 6px;" title="削除">&times;</button>`;
        html += `</div>`;
    });

    container.innerHTML = html;
}

/**
 * テンプレート適用タブのリストを描画
 */
function renderTemplateApplyList() {
    const container = document.getElementById('templateApplyList');
    if (!container) return;

    if (State.otherWorkTemplates.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">テンプレートが登録されていません。設定画面から追加してください。</p>';
        return;
    }

    let html = '<div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px;">以下の作業が登録されます:</div>';
    State.otherWorkTemplates.forEach(t => {
        const scope = t.applyToAll ? '全員分' : '個別';
        html += `<div style="display: flex; align-items: center; padding: 8px 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px;">`;
        html += `<span style="font-weight: 500;">${escapeHtml(t.name)}</span>`;
        html += `<span style="color: var(--text-muted); margin-left: auto; font-size: 13px;">${t.hours}h (${scope})</span>`;
        html += `</div>`;
    });

    container.innerHTML = html;
}

/**
 * テンプレートを一括適用
 */
export function applyOtherWorkTemplates() {
    if (State.otherWorkTemplates.length === 0) {
        showAlert('テンプレートが登録されていません。設定画面から追加してください。');
        return;
    }

    // カレンダーからの日付があればそれを使用、なければ今日の日付
    const modal = document.getElementById('otherWorkModal');
    let date;
    if (modal.dataset.calendarDate) {
        date = modal.dataset.calendarDate;
    } else {
        const today = new Date();
        date = today.toISOString().split('T')[0];
    }

    // 全担当者を取得
    const members = new Set();
    State.estimates.forEach(e => members.add(e.member));
    State.actuals.forEach(a => members.add(a.member));

    if (members.size === 0) {
        showAlert('担当者が登録されていません。先に見積または実績を登録してください。');
        return;
    }

    // 8h有休のメンバーを除外
    const eligibleMembers = [];
    members.forEach(member => {
        const memberVacations = State.vacations.filter(v => v.member === member && v.date === date);
        const totalVacationHours = memberVacations.reduce((sum, v) => sum + v.hours, 0);
        if (totalVacationHours < 8) {
            eligibleMembers.push(member);
        }
    });

    if (eligibleMembers.length === 0) {
        showAlert('全メンバーが終日休暇のため、テンプレートを適用できません。');
        return;
    }

    let totalCount = 0;
    const allAddedActuals = [];

    State.otherWorkTemplates.forEach(template => {
        if (template.applyToAll) {
            // 全メンバー分追加
            eligibleMembers.forEach(member => {
                const actual = {
                    id: Date.now() + totalCount,
                    date: date,
                    version: '',
                    task: template.name,
                    process: '',
                    member: member,
                    hours: template.hours,
                    createdAt: new Date().toISOString()
                };
                State.actuals.push(actual);
                allAddedActuals.push({ ...actual });
                totalCount++;
            });
        } else {
            // 個別の場合は最初のメンバー1人だけ（ユーザーが後で変更）
            const actual = {
                id: Date.now() + totalCount,
                date: date,
                version: '',
                task: template.name,
                process: '',
                member: eligibleMembers[0],
                hours: template.hours,
                createdAt: new Date().toISOString()
            };
            State.actuals.push(actual);
            allAddedActuals.push({ ...actual });
            totalCount++;
        }
    });

    if (allAddedActuals.length > 0) {
        pushAction({
            type: 'actual_add',
            description: `テンプレート一括適用: ${State.otherWorkTemplates.length}件 ${totalCount}レコード`,
            data: { added: allAddedActuals[0], addedAll: allAddedActuals }
        });
    }

    if (typeof window.saveData === 'function') window.saveData();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();

    closeOtherWorkModal();

    showAlert(`テンプレートを適用しました: ${totalCount}件の作業を登録（${date}）`);
}

/**
 * HTML文字列をエスケープ
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

console.log('✅ モジュール other-work.js loaded');
