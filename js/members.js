// ============================================
// 担当者マスタ管理機能
// ============================================

import {
    members,
    nextMemberId, setNextMemberId,
    estimates, actuals, schedules, vacations
} from './state.js';
import { escapeHtml, showAlert } from './utils.js';
import { pushAction } from './history.js';

// ============================================
// 内部ヘルパー
// ============================================

/**
 * 入力名を正規化する（前後の空白を除去）
 * @param {string} raw
 * @returns {string}
 */
function normalizeName(raw) {
    return (raw || '').trim();
}

/**
 * 名前で担当者を探す（前後空白・大小文字を無視。アーカイブ済みも対象）。
 * name は呼び出し元で正規化・trim済みであることを前提とする。
 * @param {string} name
 * @param {number} [excludeId] 指定するとこのidの担当者は候補から除外する（改名時の自分自身除外用）
 * @returns {object|undefined}
 */
function findByNameCI(name, excludeId) {
    const key = name.toLowerCase();
    return members.find(m => m.id !== excludeId && m.name.trim().toLowerCase() === key);
}

/**
 * 見積・実績・スケジュール・休暇いずれかのレコード配列に対し、
 * memberフィールドが oldName のものを newName に一括置換する
 * @param {object[]} records
 * @param {string} oldName
 * @param {string} newName
 * @returns {(number|string)[]} 置換したレコードのid一覧
 */
function cascadeRename(records, oldName, newName) {
    const ids = [];
    for (const r of records) if (r.member === oldName) { r.member = newName; ids.push(r.id); }
    return ids;
}

/**
 * アクティブ（未アーカイブ）な担当者の、members配列上のインデックス一覧を
 * マスタ順で返す。並べ替えはこの一覧の上で行うため、配列上に挟まっている
 * アーカイブ済み担当者を飛び越して「見た目上の隣」と入れ替えられる。
 * @returns {number[]}
 */
function activeIndices() {
    const idxs = [];
    members.forEach((m, i) => { if (!m.archived) idxs.push(i); });
    return idxs;
}

// ============================================
// 追加・改名・アーカイブ・復元
// ============================================

/**
 * 担当者をマスタに追加する
 * @param {string} name
 * @returns {{ok: true, member: object} | {ok: false, reason: 'empty'|'duplicate'}}
 */
export function addMember(name) {
    const trimmed = normalizeName(name);
    if (!trimmed) return { ok: false, reason: 'empty' };
    if (findByNameCI(trimmed)) return { ok: false, reason: 'duplicate' };

    const member = { id: nextMemberId, name: trimmed, archived: false };
    members.push(member);
    setNextMemberId(nextMemberId + 1);
    return { ok: true, member: { ...member } };
}

/**
 * 指定担当者名を参照している見積・実績・スケジュール・休暇の件数を返す
 * @param {string} name
 * @returns {number}
 */
export function countMemberUsage(name) {
    let count = 0;
    for (const e of estimates) if (e.member === name) count++;
    for (const a of actuals) if (a.member === name) count++;
    for (const s of schedules) if (s.member === name) count++;
    for (const v of vacations) if (v.member === name) count++;
    return count;
}

/**
 * 担当者を改名し、既存の見積・実績・スケジュール・休暇のmemberフィールドも一括置換する
 * @param {number} id
 * @param {string} newName
 * @returns {{ok: true, oldName: string, newName: string, affected: {estimates: number[], actuals: number[], schedules: (number|string)[], vacations: number[]}} | {ok: false, reason: 'empty'|'duplicate'|'not_found'}}
 */
export function renameMember(id, newName) {
    const member = members.find(m => m.id === id);
    if (!member) return { ok: false, reason: 'not_found' };

    const trimmed = normalizeName(newName);
    if (!trimmed) return { ok: false, reason: 'empty' };

    const dup = findByNameCI(trimmed, id);
    if (dup) return { ok: false, reason: 'duplicate' };

    const oldName = member.name;
    const affected = { estimates: [], actuals: [], schedules: [], vacations: [] };

    if (oldName !== trimmed) {
        affected.estimates = cascadeRename(estimates, oldName, trimmed);
        affected.actuals = cascadeRename(actuals, oldName, trimmed);
        affected.schedules = cascadeRename(schedules, oldName, trimmed);
        affected.vacations = cascadeRename(vacations, oldName, trimmed);
        member.name = trimmed;
    }

    return { ok: true, oldName, newName: trimmed, affected };
}

/**
 * 担当者をアーカイブする（実データは変更しない）
 * @param {number} id
 * @returns {{ok: true, member: object} | {ok: false}}
 */
export function archiveMember(id) {
    const member = members.find(m => m.id === id);
    if (!member || member.archived) return { ok: false };
    member.archived = true;
    return { ok: true, member: { ...member } };
}

/**
 * 担当者を復元し、アクティブ一覧の末尾へ移動する
 * @param {number} id
 * @returns {{ok: true, member: object} | {ok: false}}
 */
export function restoreMember(id) {
    const idx = members.findIndex(m => m.id === id);
    if (idx < 0 || !members[idx].archived) return { ok: false };
    const [member] = members.splice(idx, 1);
    member.archived = false;
    members.push(member);
    return { ok: true, member: { ...member } };
}

// ============================================
// 並べ替え（アクティブな担当者のみを対象に、隣接するアクティブな担当者と入れ替える）
// ============================================

/**
 * 担当者を1つ上（アクティブ一覧上の直前のアクティブな担当者）と入れ替える
 * @param {number} id
 * @returns {boolean} 入れ替えたら true（先頭・不明IDなら false）
 */
export function moveMemberUp(id) {
    const idxs = activeIndices();
    const pos = idxs.findIndex(i => members[i].id === id);
    if (pos <= 0) return false;
    const a = idxs[pos], b = idxs[pos - 1];
    [members[a], members[b]] = [members[b], members[a]];
    return true;
}

/**
 * 担当者を1つ下（アクティブ一覧上の直後のアクティブな担当者）と入れ替える
 * @param {number} id
 * @returns {boolean} 入れ替えたら true（末尾・不明IDなら false）
 */
export function moveMemberDown(id) {
    const idxs = activeIndices();
    const pos = idxs.findIndex(i => members[i].id === id);
    if (pos < 0 || pos >= idxs.length - 1) return false;
    const a = idxs[pos], b = idxs[pos + 1];
    [members[a], members[b]] = [members[b], members[a]];
    return true;
}

// ============================================
// 選択肢生成ヘルパー
// ============================================

/**
 * 新規データ入力用: アクティブな担当者名をマスタ順で返す
 * @returns {string[]}
 */
export function getActiveMemberNames() {
    return members.filter(m => !m.archived).map(m => m.name);
}

/**
 * 編集・フィルタ・表示用: アーカイブ済みも含め、マスタに無い名前も
 * 既存データから安全網として拾って返す（マスタ順 + 安全網の名前をアルファベット順で末尾に追加）
 * @returns {string[]}
 */
export function getAllMemberNames() {
    const names = members.map(m => m.name);
    const known = new Set(names);
    const extra = new Set();
    const scan = (arr) => { for (const r of arr) { if (r && r.member && !known.has(r.member)) extra.add(r.member); } };
    scan(estimates); scan(actuals); scan(schedules); scan(vacations);
    return [...names, ...Array.from(extra).sort()];
}

/**
 * 旧 #memberOrder テキスト欄と同じ形式（カンマ区切り）の順序文字列を返す。
 * sortMembers(names, orderString) の第2引数としてそのまま使える。
 * @returns {string}
 */
export function getMemberOrderString() {
    return getActiveMemberNames().join(',');
}

// ============================================
// 新規データ取り込み時のマスタ自動追加・初回移行
// ============================================

/**
 * 指定した名前のうちマスタに存在しないものをアクティブとして追加する
 * @param {string[]} names
 * @returns {number} 追加した件数
 */
export function ensureMembersExist(names) {
    const existing = new Set(members.map(m => m.name.trim().toLowerCase()));
    let added = 0;
    for (const raw of (names || [])) {
        const trimmed = normalizeName(raw);
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        members.push({ id: nextMemberId, name: trimmed, archived: false });
        setNextMemberId(nextMemberId + 1);
        added++;
    }
    return added;
}

/**
 * 初回移行用: 既存のestimates/actualsに登場する担当者名を、
 * 旧#memberOrderの順序文字列があればそれを優先し、残りはアルファベット順で並べて返す。
 * マスタ配列そのものは作らず名前の配列のみを返す（呼び出し元でid付与する）。
 * @param {string} legacyOrderString
 * @returns {string[]}
 */
export function buildInitialMembersFromLegacyData(legacyOrderString) {
    const names = new Set();
    for (const e of estimates) { const n = normalizeName(e.member); if (n) names.add(n); }
    for (const a of actuals) { const n = normalizeName(a.member); if (n) names.add(n); }

    const orderList = (legacyOrderString || '').split(',').map(s => s.trim()).filter(Boolean);
    const ordered = [];
    const seen = new Set();
    for (const name of orderList) {
        if (names.has(name) && !seen.has(name)) { ordered.push(name); seen.add(name); }
    }
    const rest = [...names].filter(n => !seen.has(n)).sort();
    return [...ordered, ...rest];
}

// ============================================
// 設定画面: 描画
// ============================================

let editingMemberId = null;
// editingMemberId の行を再描画する際、既存の <input> があればその場の入力途中の値を
// 引き継ぐためのバッファ。renderMemberList() の先頭で捕捉し、直後の
// renderMemberRow() 呼び出しでのみ読まれる（呼び出しは同期的なので使い回して問題ない）。
let editingDraftValue = null;

export function renderMemberList() {
    const container = document.getElementById('memberList');
    if (container) {
        // 他の行の操作（アーカイブ等）によって呼ばれた場合でも、編集中の行の
        // 入力途中の値を m.name（保存済みの値）で上書きしないよう、再構築前に
        // 現在のDOM上の値を読み取っておく。
        editingDraftValue = null;
        let hadExistingInput = false;
        if (editingMemberId != null) {
            const existingInput = document.getElementById(`memberRenameInput_${editingMemberId}`);
            if (existingInput) {
                editingDraftValue = existingInput.value;
                hadExistingInput = true;
            }
        }
        const active = members.filter(m => !m.archived);
        if (active.length === 0) {
            container.innerHTML = '<p style="color: #999; text-align: center; padding: 16px;">担当者が登録されていません</p>';
        } else {
            container.innerHTML = active.map((m, i) => renderMemberRow(m, i === 0, i === active.length - 1)).join('');
        }
        if (editingMemberId != null) {
            const input = document.getElementById(`memberRenameInput_${editingMemberId}`);
            // 既存の入力を引き継いだ場合は select() で全選択し直さない
            // （入力途中に別操作で再描画されるたびに選択されるとタイピングの邪魔になる）。
            // 改名ボタンを押した直後の新規表示時のみ、従来どおり全選択する。
            if (input) { input.focus(); if (!hadExistingInput) input.select(); }
        }
    }

    const archived = members.filter(m => m.archived);
    const label = document.getElementById('archivedMemberCount');
    if (label) label.textContent = String(archived.length);
    const archivedContainer = document.getElementById('archivedMemberList');
    if (archivedContainer) {
        archivedContainer.innerHTML = archived.length === 0
            ? '<p style="color: #999; padding: 8px 0;">アーカイブ済みの担当者はいません</p>'
            : archived.map(renderArchivedMemberRow).join('');
    }
}

function renderMemberRow(m, isFirst, isLast) {
    if (editingMemberId === m.id) {
        // 入力途中の値（editingDraftValue）があればそれを優先し、無ければ
        // 保存済みの m.name を使う（改名ボタンを押した直後の初回表示など）。
        const value = editingDraftValue != null ? editingDraftValue : m.name;
        return `
            <div class="member-row" data-member-id="${m.id}">
                <input type="text" class="member-rename-input" id="memberRenameInput_${m.id}" value="${escapeHtml(value)}">
                <button type="button" class="btn btn-primary btn-small" onclick="confirmRenameMember(${m.id})">保存</button>
                <button type="button" class="btn btn-secondary btn-small" onclick="cancelRenameMember()">キャンセル</button>
            </div>
        `;
    }
    return `
        <div class="member-row" data-member-id="${m.id}">
            <button type="button" class="btn btn-ghost btn-small" ${isFirst ? 'disabled' : ''} onclick="handleMoveMemberUp(${m.id})" title="上へ">▲</button>
            <button type="button" class="btn btn-ghost btn-small" ${isLast ? 'disabled' : ''} onclick="handleMoveMemberDown(${m.id})" title="下へ">▼</button>
            <span class="member-name">${escapeHtml(m.name)}</span>
            <button type="button" class="btn btn-secondary btn-small" onclick="handleRenameMember(${m.id})">改名</button>
            <button type="button" class="btn btn-danger-outline btn-small" onclick="handleArchiveMember(${m.id})">アーカイブ</button>
        </div>
    `;
}

function renderArchivedMemberRow(m) {
    return `
        <div class="member-row member-row--archived" data-member-id="${m.id}">
            <span class="member-name">${escapeHtml(m.name)}</span>
            <button type="button" class="btn btn-secondary btn-small" onclick="handleRestoreMember(${m.id})">復元</button>
        </div>
    `;
}

export function toggleArchivedMemberSection() {
    const section = document.getElementById('archivedMemberSection');
    if (section) section.classList.toggle('collapsed');
}

// ============================================
// 設定画面: 操作ハンドラ
// ============================================

function afterMemberChange() {
    if (typeof window.saveData === 'function') window.saveData();
    renderMemberList();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
}

export function handleAddMemberClick() {
    const input = document.getElementById('memberNameInput');
    if (!input) return;
    const result = addMember(input.value);
    if (!result.ok) {
        showAlert(result.reason === 'duplicate' ? 'その担当者名は既に登録されています' : '担当者名を入力してください', false);
        return;
    }
    pushAction({
        type: 'member_add',
        description: `担当者追加: ${result.member.name}`,
        data: { added: { ...result.member } }
    });
    input.value = '';
    afterMemberChange();
}

export function handleRenameMember(id) {
    editingMemberId = id;
    renderMemberList();
}

export function cancelRenameMember() {
    editingMemberId = null;
    renderMemberList();
}

export function confirmRenameMember(id) {
    const input = document.getElementById(`memberRenameInput_${id}`);
    if (!input) return;
    const member = members.find(m => m.id === id);
    if (!member) return;

    const newNameTrimmed = (input.value || '').trim();
    if (newNameTrimmed !== member.name) {
        const usage = countMemberUsage(member.name);
        if (usage > 0 && !confirm(`${usage}件のデータの担当者名を「${newNameTrimmed}」に置き換えます。よろしいですか？`)) {
            return;
        }
    }

    const before = member.name;
    const result = renameMember(id, input.value);
    if (!result.ok) {
        showAlert(result.reason === 'duplicate' ? 'その担当者名は既に登録されています' : '担当者名を入力してください', false);
        return;
    }

    editingMemberId = null;

    if (result.oldName !== result.newName) {
        pushAction({
            type: 'member_rename',
            description: `担当者改名: ${result.oldName} → ${result.newName}`,
            data: { memberId: id, before, after: result.newName, affected: result.affected }
        });
    }
    afterMemberChange();
}

export function handleArchiveMember(id) {
    const result = archiveMember(id);
    if (!result.ok) return;
    pushAction({
        type: 'member_archive',
        description: `担当者アーカイブ: ${result.member.name}`,
        data: { memberId: id, name: result.member.name }
    });
    afterMemberChange();
}

export function handleRestoreMember(id) {
    const result = restoreMember(id);
    if (!result.ok) return;
    pushAction({
        type: 'member_restore',
        description: `担当者復元: ${result.member.name}`,
        data: { memberId: id, name: result.member.name }
    });
    afterMemberChange();
}

export function handleMoveMemberUp(id) {
    if (!moveMemberUp(id)) return;
    if (typeof window.saveData === 'function') window.saveData();
    renderMemberList();
}

export function handleMoveMemberDown(id) {
    if (!moveMemberDown(id)) return;
    if (typeof window.saveData === 'function') window.saveData();
    renderMemberList();
}

console.log('✅ モジュール members.js loaded');
