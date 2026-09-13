// ============================================
// 実績の一括変更 — 適用エンジン（DOM・state 非依存の純粋ロジック）
//   UI は js/actual-bulk.js。ここは node --test で検証する
// ============================================

/** 比較対象のフィールド（isReview は真偽で別途比較） */
export const ACTUAL_FIELDS = ['date', 'version', 'task', 'process', 'member', 'hours'];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * 暦日で日付をずらす（文字列分解 → ローカル Date。UTC 往復によるズレを避ける）
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} days 正で未来、負で過去
 * @returns {string}
 */
export function shiftDate(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const t = new Date(y, m - 1, d + days);
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
}

/**
 * 'YYYY-MM-DD' として実在する日付か
 * @param {string} s
 * @returns {boolean}
 */
export function isValidDateString(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return shiftDate(s, 0) === s; // 2026-02-30 のような日付は正規化で別日になる
}

/**
 * 2 レコード間で変わったフィールド名
 * @returns {string[]}
 */
export function changedFields(before, after) {
    const fields = ACTUAL_FIELDS.filter(f => before[f] !== after[f]);
    if (!!before.isReview !== !!after.isReview) fields.push('isReview');
    return fields;
}

/**
 * 1 レコードにパッチを適用した新オブジェクトを返す（入力は変更しない）
 * @param {object} actual
 * @param {object} patch BulkPatch
 * @returns {object}
 */
export function applyPatchToActual(actual, patch) {
    const o = { ...actual };
    if (patch.version) o.version = patch.version.set;
    if (patch.task) o.task = patch.task.set;
    if (patch.process) o.process = patch.process.set;
    if (patch.member) o.member = patch.member.set;
    if (patch.isReview === 'on') o.isReview = true;
    if (patch.isReview === 'off') delete o.isReview;
    if (patch.date) {
        if (patch.date.mode === 'set') o.date = patch.date.value;
        else if (patch.date.mode === 'shift') o.date = shiftDate(o.date, Number(patch.date.days) || 0);
    }
    return o;
}

/**
 * 実績 1 件の妥当性（saveActualEdit と同じ規則）
 * @returns {null | 'task-required' | 'process-required' | 'invalid-date' | 'member-required' | 'hours-required'}
 */
export function validateActual(a) {
    if (!a.task || !String(a.task).trim()) return 'task-required';
    if (a.version && !a.process) return 'process-required';
    if (!isValidDateString(a.date)) return 'invalid-date';
    if (!a.member || !String(a.member).trim()) return 'member-required';
    if (!(Number(a.hours) > 0)) return 'hours-required';
    return null;
}

/**
 * 選択 ids にパッチを適用する
 * @param {object[]} actuals 全実績
 * @param {number[]} ids 対象 id
 * @param {object} patch BulkPatch
 * @returns {{ after: object[], changed: {before:object, after:object, fields:string[]}[], invalid: {id:number, reason:string}[] }}
 */
export function applyBulkPatch(actuals, ids, patch) {
    const idSet = new Set(ids);
    const changed = [];
    const invalid = [];
    const after = actuals.map(a => {
        if (!idSet.has(a.id)) return a;
        const next = applyPatchToActual(a, patch);
        const fields = changedFields(a, next);
        if (fields.length === 0) return a;
        const reason = validateActual(next);
        if (reason) invalid.push({ id: a.id, reason });
        changed.push({ before: a, after: next, fields });
        return next;
    });
    return { after, changed, invalid };
}

/**
 * 選択 ids を別日に複製する（元は残す）
 * @param {object[]} actuals
 * @param {number[]} ids
 * @param {string} date 複製先 'YYYY-MM-DD'
 * @param {() => number} nextId id 発番関数（State.nextId）
 * @param {string} [now] createdAt に入れる ISO 文字列
 * @returns {{ after: object[], added: object[] }}
 */
export function duplicateActuals(actuals, ids, date, nextId, now = new Date().toISOString()) {
    const idSet = new Set(ids);
    const added = actuals.filter(a => idSet.has(a.id)).map(a => ({ ...a, id: nextId(), date, createdAt: now }));
    return { after: [...actuals, ...added], added };
}

/**
 * 選択 ids を削除する
 * @returns {{ after: object[], deleted: object[] }}
 */
export function deleteActuals(actuals, ids) {
    const idSet = new Set(ids);
    return {
        after: actuals.filter(a => !idSet.has(a.id)),
        deleted: actuals.filter(a => idSet.has(a.id)),
    };
}

/**
 * 表示用の値（空の版数・工程、レビュー、工数）
 * @param {string} field
 * @param {object} a
 * @returns {string}
 */
export function displayValue(field, a) {
    if (field === 'isReview') return a.isReview ? 'あり' : 'なし';
    if (field === 'version') return a.version || '（その他）';
    if (field === 'process') return a.process || '—';
    if (field === 'hours') return `${Math.round(a.hours * 100) / 100}h`;
    return String(a[field] ?? '');
}

/**
 * フィールドの内訳（件数降順、同数は出現順）
 * @returns {{ value: string, count: number }[]}
 */
export function summarizeField(actuals, field) {
    const map = new Map();
    actuals.forEach(a => { const v = displayValue(field, a); map.set(v, (map.get(v) || 0) + 1); });
    return [...map].map(([value, count]) => ({ value, count })).sort((x, y) => y.count - x.count);
}

/**
 * 条件で実績を抽出する。空文字の条件は「指定なし」。version '__none__' は「その他工数（version === ''）」
 * @param {object[]} actuals
 * @param {{from:string,to:string,member:string,version:string,task:string,process:string}} cond
 * @returns {object[]}
 */
export function findByCondition(actuals, cond) {
    return actuals.filter(a =>
        (!cond.from || a.date >= cond.from) &&
        (!cond.to || a.date <= cond.to) &&
        (!cond.member || a.member === cond.member) &&
        (!cond.version || (cond.version === '__none__' ? !(a.version ?? '').trim() : a.version === cond.version)) &&
        (!cond.task || a.task === cond.task) &&
        (!cond.process || a.process === cond.process)
    );
}

/**
 * seed と同じ対応（版数＋対応名。工程は含めない）の実績 id
 * @param {object[]} actuals
 * @param {object} seed
 * @param {{ sameMember?: boolean }} [opt] true なら同じ担当者に限定
 * @returns {number[]}
 */
export function sameTaskIds(actuals, seed, { sameMember = false } = {}) {
    return actuals
        .filter(a => a.version === seed.version && a.task === seed.task && (!sameMember || a.member === seed.member))
        .map(a => a.id);
}

/**
 * 指定した版数に属する対応名の候補（見積＋実績。空と重複は除く。出現順）
 * @param {object[]} estimates
 * @param {object[]} actuals
 * @param {string[]|null} versions 絞り込む版数。null なら版数で絞らない。'' はその他工数（版数なし）
 * @returns {string[]}
 */
export function taskOptionsForVersions(estimates, actuals, versions) {
    const inScope = versions === null ? () => true : (r) => versions.includes(r.version ?? '');
    const src = [...estimates, ...actuals].filter(inScope).map(r => r.task);
    return [...new Set(src.filter(Boolean))];
}
