/**
 * 実績入力のバリデーションユーティリティ
 * [H-24-1 重複検出] [H-24-3 バリデーション強化]
 */

import { actuals } from './state.js';

// 閾値定数
export const VALIDATION_THRESHOLDS = {
    MAX_HOURS_PER_ENTRY: 24,
    WARN_HOURS_PER_ENTRY: 12,
    MAX_HOURS_PER_DAY: 24,
    WARN_HOURS_PER_DAY: 10,
    MIN_HOURS: 0.1
};

/**
 * 今日の日付文字列を取得（YYYY-MM-DD）
 */
function getTodayStr() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/**
 * 同日・同タスク・同工程・同メンバーの既存実績を検出
 * @param {Object} newActual - 新規または編集中の実績
 * @param {number|string} [excludeId] - 編集時、自身のIDを除外
 * @returns {Array} 重複候補の配列
 */
export function detectDuplicates(newActual, excludeId) {
    return actuals.filter(existing =>
        (excludeId == null || existing.id !== excludeId) &&
        existing.date === newActual.date &&
        (existing.version || '') === (newActual.version || '') &&
        existing.task === newActual.task &&
        (existing.process || '') === (newActual.process || '') &&
        existing.member === newActual.member
    );
}

/**
 * 同日の合計工数を取得（自身以外）
 * @param {string} date - YYYY-MM-DD
 * @param {string} member - メンバー名
 * @param {number|string} [excludeId] - 編集時、自身のIDを除外
 * @returns {number} 合計時間
 */
export function getDailyTotal(date, member, excludeId) {
    return actuals
        .filter(a =>
            (excludeId == null || a.id !== excludeId) &&
            a.date === date &&
            a.member === member
        )
        .reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
}

/**
 * 実績入力のバリデーション
 * @param {Object} actual - { date, version, task, process, member, hours, id? }
 * @param {Object} [options]
 * @param {number|string} [options.excludeId] - 編集時、自身のIDを除外
 * @returns {{
 *   errors: string[],    // 保存を阻止する重大な問題
 *   warnings: string[],  // 確認を求める警告
 *   duplicates: Array,   // 重複している既存レコード
 *   isValid: boolean     // errors が空なら true
 * }}
 */
export function validateActualInput(actual, options = {}) {
    const errors = [];
    const warnings = [];
    const excludeId = options.excludeId;

    const hours = Number(actual.hours);

    // === 時間の妥当性 ===
    if (!hours || isNaN(hours)) {
        errors.push('時間を入力してください');
    } else {
        if (hours < VALIDATION_THRESHOLDS.MIN_HOURS) {
            errors.push(`時間は ${VALIDATION_THRESHOLDS.MIN_HOURS}h 以上で入力してください`);
        }
        if (hours > VALIDATION_THRESHOLDS.MAX_HOURS_PER_ENTRY) {
            errors.push(`1件で${VALIDATION_THRESHOLDS.MAX_HOURS_PER_ENTRY}時間を超える入力はできません (${hours}h)`);
        } else if (hours > VALIDATION_THRESHOLDS.WARN_HOURS_PER_ENTRY) {
            warnings.push(`1件で${hours}時間は長めです。入力値に間違いはありませんか？`);
        }
    }

    // === 日付の妥当性 ===
    if (actual.date) {
        const todayStr = getTodayStr();
        if (actual.date > todayStr) {
            warnings.push(`未来の日付 (${actual.date}) です。入力を続けますか？`);
        }
    }

    // === 同日合計のチェック ===
    if (hours && actual.date && actual.member) {
        const dayTotal = getDailyTotal(actual.date, actual.member, excludeId);
        const afterTotal = dayTotal + hours;

        if (afterTotal > VALIDATION_THRESHOLDS.MAX_HOURS_PER_DAY) {
            errors.push(
                `この入力で${actual.date}の合計が${afterTotal.toFixed(1)}hになり、1日の上限(${VALIDATION_THRESHOLDS.MAX_HOURS_PER_DAY}h)を超えます`
            );
        } else if (afterTotal > VALIDATION_THRESHOLDS.WARN_HOURS_PER_DAY) {
            warnings.push(
                `この入力で${actual.date}の合計が${afterTotal.toFixed(1)}hになります (既存: ${dayTotal.toFixed(1)}h + 今回: ${hours}h)`
            );
        }
    }

    // === 重複の検出 ===
    const duplicates = detectDuplicates(actual, excludeId);
    if (duplicates.length > 0) {
        const existingHours = duplicates.reduce((s, d) => s + (Number(d.hours) || 0), 0);
        const label = actual.version
            ? `${actual.version} / ${actual.task} / ${actual.process}`
            : `${actual.task}`;
        warnings.push(
            `同日・同タスク・同メンバーに既に${duplicates.length}件 (計${existingHours}h) 登録されています: ${label}`
        );
    }

    return {
        errors,
        warnings,
        duplicates,
        isValid: errors.length === 0
    };
}

/**
 * バリデーション結果をユーザーに表示し、保存継続の可否を返す
 * errors → 表示して false を返す（保存中止）
 * warnings → confirm で確認を求めて結果を返す
 * なし → true を返す（そのまま保存）
 *
 * @param {Object} validationResult - validateActualInput の戻り値
 * @returns {boolean} 保存を続行してよいか
 */
export function confirmValidationResult(validationResult) {
    const { errors, warnings, isValid } = validationResult;

    if (!isValid) {
        const msg = '入力内容に問題があります:\n\n' + errors.map(e => '• ' + e).join('\n');
        alert(msg);
        return false;
    }

    if (warnings.length > 0) {
        const msg = '以下の点をご確認ください:\n\n' + warnings.map(w => '• ' + w).join('\n') + '\n\nこのまま登録しますか？';
        return confirm(msg);
    }

    return true;
}

console.log('✅ モジュール validation.js loaded');
