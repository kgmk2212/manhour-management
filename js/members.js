// ============================================
// 担当者マスタ管理機能
// ============================================

import {
    members, setMembers,
    nextMemberId, setNextMemberId,
    estimates, actuals, schedules, vacations
} from './state.js';

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
 * 名前で担当者を探す（前後空白・大小文字を無視。アーカイブ済みも対象）
 * @param {string} name
 * @returns {object|undefined}
 */
function findByNameCI(name) {
    const key = normalizeName(name).toLowerCase();
    return members.find(m => m.name.trim().toLowerCase() === key);
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

    const dup = members.find(m => m.id !== id && m.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (dup) return { ok: false, reason: 'duplicate' };

    const oldName = member.name;
    const affected = { estimates: [], actuals: [], schedules: [], vacations: [] };

    if (oldName !== trimmed) {
        for (const e of estimates) if (e.member === oldName) { e.member = trimmed; affected.estimates.push(e.id); }
        for (const a of actuals) if (a.member === oldName) { a.member = trimmed; affected.actuals.push(a.id); }
        for (const s of schedules) if (s.member === oldName) { s.member = trimmed; affected.schedules.push(s.id); }
        for (const v of vacations) if (v.member === oldName) { v.member = trimmed; affected.vacations.push(v.id); }
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
    for (const e of estimates) if (e.member) names.add(e.member);
    for (const a of actuals) if (a.member) names.add(a.member);

    const orderList = (legacyOrderString || '').split(',').map(s => s.trim()).filter(Boolean);
    const ordered = [];
    const seen = new Set();
    for (const name of orderList) {
        if (names.has(name) && !seen.has(name)) { ordered.push(name); seen.add(name); }
    }
    const rest = [...names].filter(n => !seen.has(n)).sort();
    return [...ordered, ...rest];
}

console.log('✅ モジュール members.js loaded');
