// js/actual-bulk-core.js の特性テスト（DOM 非依存の純粋ロジック）
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    shiftDate, isValidDateString, changedFields, applyBulkPatch,
    duplicateActuals, deleteActuals, summarizeField, findByCondition, sameTaskIds, displayValue,
    validateActual, taskOptionsForVersions,
} from '../js/actual-bulk-core.js';

const A = (over) => ({ id: 1, date: '2026-08-17', version: 'V2.3', task: '帳票A', process: 'PG', member: '田中', hours: 6, createdAt: 'x', ...over });
const DATA = [
    A({ id: 1 }),
    A({ id: 2, version: '', task: '打ち合わせ', process: '' }),
    A({ id: 3, date: '2026-08-18', process: 'PT' }),
    A({ id: 4, date: '2026-08-19', member: '佐藤', task: 'ログイン', isReview: true }),
    A({ id: 5, date: '2026-08-24', version: 'V2.4', task: '帳票A（追補）', process: 'IT' }),
];

describe('shiftDate / isValidDateString', () => {
    test('月末・年末を跨いでも暦日でずれる', () => {
        assert.equal(shiftDate('2026-08-31', 1), '2026-09-01');
        assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
        assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
        assert.equal(shiftDate('2026-08-17', 0), '2026-08-17');
    });
    test('日付文字列の検証', () => {
        assert.equal(isValidDateString('2026-08-17'), true);
        assert.equal(isValidDateString('2026-02-30'), false);
        assert.equal(isValidDateString('2026/08/17'), false);
        assert.equal(isValidDateString(''), false);
    });
});

describe('validateActual', () => {
    test('妥当な実績は null を返す', () => {
        assert.equal(validateActual(DATA[0]), null);
    });
    test('task が空なら task-required', () => {
        assert.equal(validateActual({ ...DATA[0], task: '' }), 'task-required');
    });
    test('version があるが process が無いなら process-required', () => {
        assert.equal(validateActual({ ...DATA[0], version: 'V2.3', process: '' }), 'process-required');
    });
    test('version と process が両方無いなら妥当', () => {
        assert.equal(validateActual({ ...DATA[0], version: '', process: '' }), null);
    });
    test('date が無効なら invalid-date', () => {
        assert.equal(validateActual({ ...DATA[0], date: '2026-02-30' }), 'invalid-date');
    });
    test('member が空なら member-required', () => {
        assert.equal(validateActual({ ...DATA[0], member: '' }), 'member-required');
    });
    test('hours が 0 以下なら hours-required', () => {
        assert.equal(validateActual({ ...DATA[0], hours: 0 }), 'hours-required');
    });
    test('applyBulkPatch で member を空にしたものは invalid に入る', () => {
        const r = applyBulkPatch(DATA, [1], { member: { set: '' } });
        assert.deepEqual(r.invalid, [{ id: 1, reason: 'member-required' }]);
    });
});

describe('applyBulkPatch', () => {
    test('指定した項目だけ変わり、変わった件だけ changed に入る', () => {
        const r = applyBulkPatch(DATA, [1, 3, 5], { version: { set: 'V2.4' }, task: { set: '帳票A（追補）' } });
        assert.equal(r.after.length, 5);
        assert.equal(r.changed.length, 2);                      // id5 は既に V2.4/追補 なので変化なし
        assert.deepEqual(r.changed.map(c => c.before.id), [1, 3]);
        assert.deepEqual(r.changed[0].fields, ['version', 'task']);
        assert.equal(r.after.find(a => a.id === 1).process, 'PG');   // 未指定項目は不変
        assert.equal(r.after.find(a => a.id === 2), DATA[1]);        // 対象外は同一参照
        assert.equal(r.invalid.length, 0);
        assert.equal(DATA[0].version, 'V2.3');                       // 入力は不変
    });
    test('その他工数に版数だけ付けると process-required', () => {
        const r = applyBulkPatch(DATA, [2], { version: { set: 'V2.3' } });
        assert.deepEqual(r.invalid, [{ id: 2, reason: 'process-required' }]);
        assert.equal(r.changed.length, 1);
    });
    test('版数を空にすると工程が空でも有効', () => {
        const r = applyBulkPatch(DATA, [1], { version: { set: '' }, process: { set: '' } });
        assert.equal(r.invalid.length, 0);
        assert.equal(r.after[0].version, '');
    });
    test('レビューの付与と除去、日付の指定・シフト', () => {
        const on = applyBulkPatch(DATA, [1], { isReview: 'on' });
        assert.equal(on.after[0].isReview, true);
        assert.deepEqual(on.changed[0].fields, ['isReview']);
        const off = applyBulkPatch(DATA, [4], { isReview: 'off' });
        assert.equal('isReview' in off.after[3], false);
        const set = applyBulkPatch(DATA, [1], { date: { mode: 'set', value: '2026-08-24' } });
        assert.equal(set.after[0].date, '2026-08-24');
        const shift = applyBulkPatch(DATA, [1, 3], { date: { mode: 'shift', days: 7 } });
        assert.equal(shift.after[0].date, '2026-08-24');
        assert.equal(shift.after[2].date, '2026-08-25');
    });
    test('空パッチは changed 0 件・invalid 0 件', () => {
        const r = applyBulkPatch(DATA, [1, 2], {});
        assert.equal(r.changed.length, 0);
        assert.equal(r.after.length, 5);
    });
    test('changedFields は複数フィールドの変更を検出', () => {
        assert.deepEqual(changedFields(DATA[0], { ...DATA[0], version: 'V2.4', hours: 7 }), ['version', 'hours']);
    });
});

describe('duplicateActuals / deleteActuals', () => {
    test('複製は新 id・指定日・新 createdAt で追加し元は残す', () => {
        let next = 100;
        const r = duplicateActuals(DATA, [1, 3], '2026-08-24', () => next++, '2026-08-29T00:00:00.000Z');
        assert.equal(r.after.length, 7);
        assert.deepEqual(r.added.map(a => a.id), [100, 101]);
        assert.ok(r.added.every(a => a.date === '2026-08-24' && a.createdAt === '2026-08-29T00:00:00.000Z'));
        assert.equal(r.added[0].task, '帳票A');
        assert.equal(DATA.length, 5);
    });
    test('削除は deleted と after が排反', () => {
        const r = deleteActuals(DATA, [2, 4]);
        assert.deepEqual(r.deleted.map(a => a.id), [2, 4]);
        assert.deepEqual(r.after.map(a => a.id), [1, 3, 5]);
    });
});

describe('summarizeField / displayValue', () => {
    test('件数の多い順に集計し、空の版数・工程は表示名に置き換える', () => {
        assert.deepEqual(summarizeField(DATA, 'version'), [
            { value: 'V2.3', count: 3 }, { value: '（その他）', count: 1 }, { value: 'V2.4', count: 1 },
        ]);
        assert.equal(displayValue('process', DATA[1]), '—');
        assert.equal(displayValue('isReview', DATA[3]), 'あり');
        assert.equal(displayValue('isReview', DATA[0]), 'なし');
        assert.equal(displayValue('hours', DATA[0]), '6h');
    });
});

describe('findByCondition / sameTaskIds', () => {
    test('条件の組合せと「（なし）= その他工数」', () => {
        const c = { from: '2026-08-17', to: '2026-08-21', member: '田中', version: 'V2.3', task: '', process: '' };
        assert.deepEqual(findByCondition(DATA, c).map(a => a.id), [1, 3]);
        assert.deepEqual(findByCondition(DATA, { ...c, version: '__none__' }).map(a => a.id), [2]);
        assert.deepEqual(findByCondition(DATA, { from: '', to: '', member: '', version: '', task: '', process: 'PT' }).map(a => a.id), [3]);
        assert.equal(findByCondition(DATA, { from: '2026-08-25', to: '', member: '', version: '', task: '', process: '' }).length, 0);
    });
    test('version: undefined（version キー自体が無い実績）も __none__ で一致する', () => {
        const noVersionKey = { id: 7, date: '2026-08-17', task: 'その他', process: '', member: '田中', hours: 1, createdAt: 'x' };
        assert.equal(noVersionKey.version, undefined);
        const cond = { from: '', to: '', member: '', version: '__none__', task: '', process: '' };
        assert.deepEqual(findByCondition([...DATA, noVersionKey], cond).map(a => a.id), [2, 7]);
    });
    test('同じ対応（版数＋対応名）を本人／全員で', () => {
        const all = [...DATA, A({ id: 6, member: '鈴木', date: '2026-08-20' })];
        assert.deepEqual(sameTaskIds(all, all[0], { sameMember: true }), [1, 3]);
        assert.deepEqual(sameTaskIds(all, all[0], { sameMember: false }), [1, 3, 6]);
    });
});

describe('taskOptionsForVersions', () => {
    const EST = [
        { version: 'V2.3', task: '帳票A', process: 'UI', member: '田中', hours: 10 },
        { version: 'V2.3', task: '検索画面', process: 'PG', member: '田中', hours: 8 },
        { version: 'V2.4', task: '帳票A（追補）', process: 'PG', member: '佐藤', hours: 4 },
        { version: '', task: '定例会', process: '', member: '田中', hours: 1 },
    ];
    test('null なら版数で絞らず全対応を返す', () => {
        assert.deepEqual(taskOptionsForVersions(EST, DATA, null),
            ['帳票A', '検索画面', '帳票A（追補）', '定例会', '打ち合わせ', 'ログイン']);
    });
    test('単一版数ならその版数の見積＋実績の対応だけ', () => {
        assert.deepEqual(taskOptionsForVersions(EST, DATA, ['V2.3']), ['帳票A', '検索画面', 'ログイン']);
        assert.deepEqual(taskOptionsForVersions(EST, DATA, ['V2.4']), ['帳票A（追補）']);
    });
    test('複数版数なら和集合（重複は1つ）', () => {
        assert.deepEqual(taskOptionsForVersions(EST, DATA, ['V2.3', 'V2.4']),
            ['帳票A', '検索画面', '帳票A（追補）', 'ログイン']);
    });
    test("'' はその他工数（版数なし）。version キーが無い実績も含む", () => {
        const noVersionKey = { id: 7, date: '2026-08-17', task: 'その他', process: '', member: '田中', hours: 1 };
        assert.deepEqual(taskOptionsForVersions(EST, [...DATA, noVersionKey], ['']),
            ['定例会', '打ち合わせ', 'その他']);
    });
    test('該当する対応が無い版数なら空配列', () => {
        assert.deepEqual(taskOptionsForVersions(EST, DATA, ['V9.9']), []);
    });
});
