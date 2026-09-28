// ============================================
// 回帰テスト: js/schedule-member-task.js
//   ガント「担当者×タスク」表示の行の組み立て・日ごとの本数・見出しの折り返し（純粋関数）
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectMemberTaskSchedules, buildMemberTaskRows, countDailyLoad, wrapLabel } from '../js/schedule-member-task.js';

const sc = (id, member, version, task, startDate, endDate, extra = {}) =>
    ({ id, member, version, task, process: 'PG', startDate, endDate, status: 'pending', ...extra });

describe('selectMemberTaskSchedules', () => {
    const all = [
        sc('a1', '田中', 'V1', 'A', '2026-07-01', '2026-07-10'),
        sc('a2', '田中', 'V1', 'A', '2026-09-01', '2026-09-05'), // A は 9 月にも掛かる
        sc('b1', '田中', 'V1', 'B', '2026-07-01', '2026-07-31'), // B は 7 月だけ
        sc('c1', '佐藤', 'V1', 'A', '2026-07-01', '2026-07-10'), // 佐藤の A は 7 月だけ
    ];
    test('表示範囲に掛かる (担当者, タスク) の予定を、範囲外のものも含めて返す', () => {
        const ids = selectMemberTaskSchedules(all, { start: '2026-09-01', end: '2026-09-30' }).map(s => s.id);
        assert.deepEqual(ids, ['a1', 'a2']);
    });
    test('effEnd で遅延中の予定を今日まで占有しているとみなせる', () => {
        const late = [sc('x', '田中', 'V1', 'X', '2026-08-20', '2026-08-28')];
        const r = selectMemberTaskSchedules(late, { start: '2026-09-01', end: '2026-09-30' }, () => '2026-09-24');
        assert.equal(r.length, 1);
    });
});

describe('buildMemberTaskRows', () => {
    const all = [
        sc('1', '佐藤', 'V1', 'Z', '2026-09-01', '2026-09-02'),
        sc('2', '田中', 'V2', 'B', '2026-09-10', '2026-09-11'),
        sc('3', '田中', 'V1', 'A', '2026-09-15', '2026-09-16'),
        sc('4', '田中', 'V1', 'A', '2026-09-01', '2026-09-02'),
        sc('5', '鈴木', 'V1', 'Q', '2026-09-01', '2026-09-02'),
    ];
    test('担当者の見出し行の下に、タスク行を着手順→最初の開始日の順に並べる', () => {
        const rows = buildMemberTaskRows(all, { memberOrder: ['田中', '佐藤'] });
        assert.deepEqual(rows.map(r => `${r.type}:${r.label}`), [
            'memberGroup:田中', 'memberTask:A', 'memberTask:B',
            'memberGroup:佐藤', 'memberTask:Z',
            'memberGroup:鈴木', 'memberTask:Q', // 並び順に無い担当者は末尾
        ]);
        const g = rows[0];
        assert.equal(g.taskCount, 2);
        assert.equal(g.schedules.length, 3);
        assert.equal(rows[1].schedules.length, 2);
        assert.equal(rows[1].member, '田中');
        assert.equal(rows[1].version, 'V1');
    });
    test('タスク着手順があればそれを優先する', () => {
        const rows = buildMemberTaskRows(all, { memberOrder: ['田中'], taskSortOrder: { 'V2/B': 0, 'V1/A': 1 } });
        assert.deepEqual(rows.filter(r => r.member === '田中').map(r => r.label), ['田中', 'B', 'A']);
    });
    test('畳んだ担当者は見出し行だけになる', () => {
        const rows = buildMemberTaskRows(all, { memberOrder: ['田中', '佐藤'], collapsed: new Set(['田中']) });
        assert.deepEqual(rows.slice(0, 2).map(r => `${r.type}:${r.label}`), ['memberGroup:田中', 'memberGroup:佐藤']);
        assert.equal(rows[0].collapsed, true);
        assert.equal(rows[0].taskCount, 2);
    });
});

describe('countDailyLoad', () => {
    test('営業日ごとに未完了の予定を数え、休日・完了済みは数えない。遅延は effEnd まで', () => {
        const list = [
            sc('a', '田中', 'V1', 'A', '2026-09-14', '2026-09-15'),
            sc('b', '田中', 'V1', 'B', '2026-09-15', '2026-09-16'),
            sc('c', '田中', 'V1', 'C', '2026-09-15', '2026-09-15', { status: 'completed' }),
            sc('late', '田中', 'V1', 'L', '2026-09-10', '2026-09-11'),
        ];
        const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-19'];
        const load = countDailyLoad(list, days, {
            isOff: (d) => d === '2026-09-19',
            effEnd: (s) => (s.id === 'late' ? '2026-09-16' : s.endDate),
            isDone: (s) => s.status === 'completed',
        });
        assert.deepEqual([...load.keys()], ['2026-09-14', '2026-09-15', '2026-09-16']);
        assert.deepEqual(load.get('2026-09-15').map(s => s.id).sort(), ['a', 'b', 'late']);
        assert.equal(load.get('2026-09-14').length, 2);
    });
});

describe('wrapLabel', () => {
    const measure = (s) => s.length * 10; // 1 文字 10px

    test('収まれば 1 行で clipped=false', () => {
        assert.deepEqual(wrapLabel('帳票A改修', 100, 2, measure), { lines: ['帳票A改修'], clipped: false });
    });
    test('日本語は文字単位で 2 行に折り返す', () => {
        assert.deepEqual(wrapLabel('一二三四五六七八', 50, 2, measure), { lines: ['一二三四五', '六七八'], clipped: false });
    });
    test('英数字の続きは途中で切らない', () => {
        const r = wrapLabel('請求書のCSV取込', 50, 3, measure);
        assert.deepEqual(r.lines, ['請求書の', 'CSV取込']);
    });
    test('入りきらない分は最終行の末尾を … にする', () => {
        const r = wrapLabel('一二三四五六七八九十十一十二', 50, 2, measure);
        assert.equal(r.clipped, true);
        assert.equal(r.lines.length, 2);
        assert.equal(r.lines[1], '六七八九…');
    });
    test('1 行に収まらない英数字の続きは文字単位に落とす', () => {
        const r = wrapLabel('ABCDEFGHIJ', 50, 3, measure);
        assert.deepEqual(r.lines, ['ABCDE', 'FGHIJ']);
    });
});
