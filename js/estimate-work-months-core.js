// ============================================
// 見積の作業月 UI（4 方式切替）— 純関数
// DOM・State に依存しない（node --test 対象）。
// 設計: docs/superpowers/specs/2026-09-12-estimate-work-months-design.md
// ============================================

/** 方式キー一覧（設定値）。legacy = 現状の 開始〜終了 select */
export const MODES = ['chips', 'gantt', 'matrix', 'legacy'];

/** 既定の方式 */
export const DEFAULT_MODE = 'chips';

/**
 * 保存値と登録済みレンダラから有効な方式を決める
 * @param {string|null} stored - localStorage の値
 * @param {string[]} available - 登録済みレンダラの id
 * @returns {string} 有効な方式キー（不正値は chips、chips も無ければ legacy）
 */
export function resolveMode(stored, available) {
    if (stored === 'legacy') return 'legacy';
    if (stored && available.includes(stored)) return stored;
    return available.includes(DEFAULT_MODE) ? DEFAULT_MODE : 'legacy';
}

/**
 * 'YYYY-MM' の両端を含む昇順配列を返す
 * @param {string} start
 * @param {string} end
 * @returns {string[]} start > end なら []
 */
export function monthRange(start, end) {
    const out = [];
    if (!start || !end || start > end) return out;
    let [y, m] = start.split('-').map(Number);
    const [y2, m2] = end.split('-').map(Number);
    while (y < y2 || (y === y2 && m <= m2)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) { m = 1; y++; }
    }
    return out;
}

/**
 * 'YYYY-MM' を delta ヶ月ずらす
 * @param {string} ym
 * @param {number} delta
 * @returns {string}
 */
export function shiftMonth(ym, delta) {
    let [y, m] = ym.split('-').map(Number);
    m += delta;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * 期間外の月を捨て、全部外れたら近い端の 1 月に寄せる
 * @param {string[]} months
 * @param {string[]} range - 期間内の月（昇順）
 * @returns {{months: string[], changed: boolean}}
 */
export function clampMonths(months, range) {
    const sorted = [...(months || [])].sort();
    if (!range || !range.length) return { months: [], changed: sorted.length > 0 };
    const kept = sorted.filter(m => range.includes(m));
    if (kept.length === sorted.length) return { months: kept, changed: false };
    if (kept.length) return { months: kept, changed: true };
    return { months: [sorted[0] < range[0] ? range[0] : range[range.length - 1]], changed: true };
}

/**
 * 月配列を dataset 用の文字列（',' 区切り・昇順）にする
 * @param {string[]} arr
 * @returns {string}
 */
export function serializeMonths(arr) {
    return [...(arr || [])].sort().join(',');
}

/**
 * dataset の文字列を月配列に戻す
 * @param {string|undefined} str
 * @returns {string[]}
 */
export function parseMonths(str) {
    return str ? str.split(',').filter(Boolean).sort() : [];
}

/**
 * monthly が splitFn(hours, months) と 0.001 以内で一致するか（均等按分とみなせるか）
 * @param {Object<string, number>} monthly
 * @param {number} hours
 * @param {string[]} months
 * @param {(hours: number, months: string[]) => Object<string, number>} splitFn
 * @returns {boolean}
 */
export function isEvenSplit(monthly, hours, months, splitFn) {
    const even = splitFn(hours, months);
    const sameValues = months.every(m => Math.abs((Number(monthly?.[m]) || 0) - (even[m] || 0)) < 0.001);
    const noExtraKeys = Object.keys(monthly || {}).every(m => months.includes(m));
    return sameValues && noExtraKeys;
}

/**
 * 保存用ペイロードを作る。手動配分は「開いた時と月が同じ」ときだけ保持し、それ以外は均等按分。
 * @param {{months: string[], hours: number, manual: Object|null, opened: string[]|null,
 *          splitFn: (hours: number, months: string[]) => Object<string, number>}} p
 * @returns {{workMonth: string, workMonths: string[], monthlyHours: Object<string, number>}}
 */
export function buildPayload({ months, hours, manual, opened, splitFn }) {
    const ms = [...(months || [])].sort();
    if (!ms.length) return { workMonth: '', workMonths: [], monthlyHours: {} };
    const keepManual = !!manual && !!opened && opened.length > 0 && serializeMonths(ms) === serializeMonths(opened);
    const monthlyHours = keepManual ? { ...manual } : splitFn(Number(hours) || 0, ms);
    return { workMonth: ms[0], workMonths: ms, monthlyHours };
}
