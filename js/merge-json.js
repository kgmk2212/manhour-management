// ============================================
// merge-json.js — バックアップJSON 差分マージのアダプタ
//   バックアップJSON を読み込み、現在データとの差分を merge-core のプレビューに渡す。
//   仕様書: docs/superpowers/specs/2026-06-15-backup-json-merge-design.md
// ============================================

import * as State from './state.js';
import { detectDiff, openMergePreview, s, normalizeDate, roundNum } from './merge-core.js';

function alertMsg(msg, ok) {
    if (typeof window.showAlert === 'function') window.showAlert(msg, !!ok);
    else alert(msg);
}

// --- ID 生成 ---
function genFloatId() { return Date.now() + Math.random(); }
function maxNumericId(arr) {
    let max = 0;
    for (const r of (arr || [])) { const n = Number(r.id); if (Number.isFinite(n) && n > max) max = n; }
    return max;
}
function maxSchedId(arr) {
    let max = 0;
    for (const r of (arr || [])) {
        const m = r.id && String(r.id).match(/sch_(\d+)/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
}

// 作業月の集合キー（順序非依存・旧 workMonth 単数も吸収）
function monthsKey(rec) {
    const arr = Array.isArray(rec.workMonths) ? rec.workMonths : (rec.workMonth ? [rec.workMonth] : []);
    return arr.slice().sort().join(',');
}

/**
 * field に対する add/overwrite/remove を生成（すべて State 配列を in-place 操作）。
 * @param {string} field State 配列名
 * @param {string[]} valueFields 上書き時に置換する値フィールド
 * @param {Function} idGen 新規 ID 生成
 */
function makeApplier(field, valueFields, idGen) {
    return {
        add(rec) {
            const r = { ...rec, id: idGen() };
            State[field].push(r);
            return r;
        },
        overwrite(existing, incoming) {
            const arr = State[field];
            const idx = arr.findIndex(e => e.id === existing.id);
            if (idx < 0) return null;
            const before = { ...arr[idx] };
            const after = { ...arr[idx] };
            for (const f of valueFields) after[f] = incoming[f];
            arr[idx] = after;
            return { before, after: { ...after } };
        },
        remove(rec) {
            const arr = State[field];
            const idx = arr.findIndex(e => e.id === rec.id);
            if (idx >= 0) arr.splice(idx, 1);
        }
    };
}

// レコード系エンティティ定義（仕様書 付録 B）
function buildRecordDefs(counters) {
    const idHoliday = () => ++counters.companyHolidays;
    const idVacation = () => ++counters.vacations;
    const idSchedule = () => `sch_${++counters.schedules}`;

    return [
        {
            id: 'actuals', field: 'actuals', label: '実績', icon: '⏱', kind: 'records', allowOverwrite: false,
            keyFields: ['date', 'member', 'version', 'task', 'process'],
            compareFields: [{ key: 'hours', label: '工数' }],
            spec: {
                keyOf: r => [normalizeDate(r.date), s(r.member), s(r.version), s(r.task), s(r.process), roundNum(r.hours)].join('|'),
                valueEq: () => true, emitChanged: false
            },
            apply: makeApplier('actuals', [], genFloatId)
        },
        {
            id: 'estimates', field: 'estimates', label: '見積', icon: '📋', kind: 'records', allowOverwrite: true,
            keyFields: ['version', 'task', 'process', 'member'],
            compareFields: [{ key: 'hours', label: '工数' }, { key: 'workMonths', label: '作業月' }],
            spec: {
                keyOf: r => [s(r.version), s(r.task), s(r.process), s(r.member)].join('|'),
                valueEq: (a, b) => roundNum(a.hours) === roundNum(b.hours) && monthsKey(a) === monthsKey(b),
                emitChanged: true
            },
            apply: makeApplier('estimates', ['hours', 'workMonth', 'workMonths', 'monthlyHours'], genFloatId)
        },
        {
            id: 'schedules', field: 'schedules', label: 'スケジュール', icon: '📅', kind: 'records', allowOverwrite: true,
            keyFields: ['version', 'task', 'process', 'member', 'startDate'],
            compareFields: [
                { key: 'estimatedHours', label: '工数' }, { key: 'endDate', label: '終了日' },
                { key: 'status', label: '状態' }, { key: 'note', label: 'メモ' }
            ],
            spec: {
                keyOf: r => [s(r.version), s(r.task), s(r.process), s(r.member), normalizeDate(r.startDate)].join('|'),
                valueEq: (a, b) => roundNum(a.estimatedHours) === roundNum(b.estimatedHours)
                    && normalizeDate(a.endDate) === normalizeDate(b.endDate)
                    && s(a.status) === s(b.status) && s(a.note) === s(b.note),
                emitChanged: true
            },
            apply: makeApplier('schedules', ['estimatedHours', 'endDate', 'status', 'note', 'updatedAt'], idSchedule)
        },
        {
            id: 'companyHolidays', field: 'companyHolidays', label: '会社休日', icon: '🏖', kind: 'records', allowOverwrite: true,
            keyFields: ['name', 'startDate', 'endDate'],
            compareFields: [{ key: 'name', label: '名称' }],
            spec: {
                keyOf: r => [normalizeDate(r.startDate), normalizeDate(r.endDate)].join('|'),
                valueEq: (a, b) => s(a.name) === s(b.name), emitChanged: true
            },
            apply: makeApplier('companyHolidays', ['name'], idHoliday)
        },
        {
            id: 'vacations', field: 'vacations', label: '休暇', icon: '🌴', kind: 'records', allowOverwrite: true,
            keyFields: ['member', 'date', 'vacationType'],
            compareFields: [{ key: 'hours', label: '時間' }],
            spec: {
                keyOf: r => [s(r.member), normalizeDate(r.date), s(r.vacationType)].join('|'),
                valueEq: (a, b) => roundNum(a.hours) === roundNum(b.hours), emitChanged: true
            },
            apply: makeApplier('vacations', ['hours'], idVacation)
        },
        {
            id: 'remainingEstimates', field: 'remainingEstimates', label: '残工数', icon: '📉', kind: 'records', allowOverwrite: true,
            keyFields: ['version', 'task', 'process'],
            compareFields: [
                { key: 'remainingHours', label: '残工数' }, { key: 'member', label: '担当' }, { key: 'note', label: 'メモ' }
            ],
            spec: {
                keyOf: r => [s(r.version), s(r.task), s(r.process)].join('|'),
                valueEq: (a, b) => roundNum(a.remainingHours) === roundNum(b.remainingHours)
                    && s(a.member) === s(b.member) && s(a.note) === s(b.note),
                emitChanged: true
            },
            apply: makeApplier('remainingEstimates', ['remainingHours', 'member', 'note', 'updatedAt'], genFloatId)
        }
    ];
}

/**
 * バックアップ JSON ファイルを読み込み、差分マージのプレビューを開く。
 * @param {File} file
 */
export async function handleBackupMerge(file) {
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch (e) {
        alertMsg('バックアップファイルとして読み込めません（JSON の解析に失敗しました）', false);
        return;
    }
    const looksLikeBackup = data && typeof data === 'object' &&
        (Array.isArray(data.estimates) || Array.isArray(data.actuals) ||
         Array.isArray(data.schedules) || Array.isArray(data.companyHolidays) ||
         Array.isArray(data.vacations) || Array.isArray(data.remainingEstimates));
    if (!looksLikeBackup) {
        alertMsg('バックアップ形式の JSON ではありません', false);
        return;
    }
    if (data.version && !String(data.version).startsWith('1.')) {
        console.warn('[merge-json] 未知のバックアップ version:', data.version);
    }

    const counters = {
        companyHolidays: maxNumericId(State.companyHolidays),
        vacations: maxNumericId(State.vacations),
        schedules: maxSchedId(State.schedules)
    };

    const defs = buildRecordDefs(counters);
    const sections = [];
    for (const def of defs) {
        const incoming = Array.isArray(data[def.field]) ? data[def.field] : [];
        const existing = State[def.field] || [];
        const diff = detectDiff(incoming, existing, def.spec);
        // 差分が無いセクションは表示しない（unchanged のみは省く）
        if (diff.added.length + diff.changed.length + diff.removed.length === 0) continue;
        sections.push({ ...def, diff });
    }

    if (sections.length === 0) {
        alertMsg('現在のデータとの差分はありませんでした（全データが一致）', true);
        return;
    }

    openMergePreview(sections, {
        fileName: file.name,
        sourceLabel: 'バックアップJSON',
        afterApply: () => {
            // ID 採番を現状に合わせて再計算
            State.setNextCompanyHolidayId(maxNumericId(State.companyHolidays) + 1);
            State.setNextVacationId(maxNumericId(State.vacations) + 1);
            State.setNextScheduleId(maxSchedId(State.schedules) + 1);
        }
    });
}

console.log('✅ モジュール merge-json.js loaded');
