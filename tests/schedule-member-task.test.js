// ============================================
// 回帰テスト: js/schedule-member-task.js
//   ガント「担当者×タスク」表示の行の組み立て・日ごとの本数・見出しの折り返し（純粋関数）
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { selectMemberTaskSchedules, buildMemberTaskRows, countDailyLoad, wrapLabel, splitTaskName, phraseTokens, applyTaskLabelStyle } from '../js/schedule-member-task.js';

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
    test('その日にバーが描かれている予定を数える（完了済み・週末も数え、分割の合間は数えない）', () => {
        const list = [
            sc('a', '田中', 'V1', 'A', '2026-09-18', '2026-09-21'), // 金〜月（週末をまたぐ）
            sc('b', '田中', 'V1', 'B', '2026-09-19', '2026-09-19', { status: 'completed' }),
            sc('split', '田中', 'V1', 'S', '2026-09-17', '2026-09-22'),
        ];
        const days = ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22'];
        const spansOf = (s) => (s.id === 'split'
            ? [{ start: '2026-09-17', end: '2026-09-17' }, { start: '2026-09-22', end: '2026-09-22' }]
            : [{ start: s.startDate, end: s.endDate }]);
        const load = countDailyLoad(list, days, spansOf);
        assert.deepEqual([...load.entries()].map(([d, l]) => `${d.slice(8)}:${l.map(s => s.id).join('')}`), [
            '17:split', '18:a', '19:ab', '20:a', '21:a', '22:split',
        ]);
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

describe('splitTaskName', () => {
    test('「：」で処理名と対応名に分ける（最初の区切りだけ）', () => {
        assert.deepEqual(splitTaskName('請求書出力：宛名：敬称'), { proc: '請求書出力', detail: '宛名：敬称' });
    });
    test('「：」が無ければ「_」で分ける（古いデータ）', () => {
        assert.deepEqual(splitTaskName('ログイン画面_パスワード強度'), { proc: 'ログイン画面', detail: 'パスワード強度' });
    });
    test('区切りが無ければ全体が対応名', () => {
        assert.deepEqual(splitTaskName('単独タスク'), { proc: '', detail: '単独タスク' });
    });
});

describe('phraseTokens / wrapLabel(phrase)', () => {
    test('助詞・括弧・英数字の前後で区切る', () => {
        assert.deepEqual(phraseTokens('宛名の敬称切替'), ['宛名の', '敬称切替']);
        assert.deepEqual(phraseTokens('PDFレイアウト（並列化）'), ['PDF', 'レイアウト', '（並列化）']);
    });
    test('文節の切れ目で折り返し、語の途中では折らない', () => {
        const measure = (s) => s.length * 10;
        const r = wrapLabel('ロール継承時に閲覧権限が外れる', 80, 3, measure, { phrase: true });
        assert.deepEqual(r.lines, ['ロール継承時に', '閲覧権限が外れる']);
        // 幅を狭めると、文節の切れ目（「閲覧権限が」の後）で折る
        assert.deepEqual(wrapLabel('ロール継承時に閲覧権限が外れる', 70, 3, measure, { phrase: true }).lines,
            ['ロール継承時に', '閲覧権限が', '外れる']);
    });
});

describe('applyTaskLabelStyle', () => {
    const H = { A: 68, detail: 38, procDetail: 46, head: 26 };
    const t = (label, version, member = '田中') => ({ type: 'memberTask', label, version, member, schedules: [{ id: label + version }] });
    const rows = [
        { type: 'memberGroup', label: '田中', member: '田中', schedules: [] },
        t('請求書出力：電帳法対応', '定期2026-10'),
        t('請求書出力：宛名の敬称', '定期2026-10'),
        t('取引先マスタ：区分追加', '定期2026-10'),
        t('権限管理：不具合修正', '臨時2026-09'),
        { type: 'memberGroup', label: '佐藤', member: '佐藤', schedules: [] },
        t('単独タスク', '定期2026-11', '佐藤'),
    ];
    const shape = (rs) => rs.map(r => `${r.type}${r.labelMode ? `/${r.labelMode}` : ''}:${r.label}@${r.baseHeight ?? '-'}`);

    test('A はタスク行を 3 段（基本の高さ 68）にし、処理名・対応名を持たせる', () => {
        const out = applyTaskLabelStyle(rows, 'A', H);
        assert.equal(out.length, rows.length);
        const r = out[1];
        assert.equal(r.labelMode, 'A');
        assert.equal(r.baseHeight, 68);
        assert.equal(r.proc, '請求書出力');
        assert.equal(r.detail, '電帳法対応');
    });

    test('C は版数 → 処理名の見出し行を挟み、タスク行は対応名だけ', () => {
        assert.deepEqual(shape(applyTaskLabelStyle(rows, 'C', H)), [
            'memberGroup:田中@-',
            'versionHead:定期2026-10@26',
            'procHead:請求書出力@26',
            'memberTask/detail:請求書出力：電帳法対応@38',
            'memberTask/detail:請求書出力：宛名の敬称@38',
            'procHead:取引先マスタ@26',
            'memberTask/detail:取引先マスタ：区分追加@38',
            'versionHead:臨時2026-09@26',
            'procHead:権限管理@26',
            'memberTask/detail:権限管理：不具合修正@38',
            'memberGroup:佐藤@-',
            'versionHead:定期2026-11@26',
            'memberTask/detail:単独タスク@38',
        ]);
        const v = applyTaskLabelStyle(rows, 'C', H)[1];
        assert.equal(v.taskCount, 3);
        assert.equal(v.member, '田中');
    });

    test('C2 は処理名の下の対応が 1 件なら見出し行を作らず、処理名＋対応名の行にする', () => {
        assert.deepEqual(shape(applyTaskLabelStyle(rows, 'C2', H)), [
            'memberGroup:田中@-',
            'versionHead:定期2026-10@26',
            'procHead:請求書出力@26',
            'memberTask/detail:請求書出力：電帳法対応@38',
            'memberTask/detail:請求書出力：宛名の敬称@38',
            'memberTask/procDetail:取引先マスタ：区分追加@46',
            'versionHead:臨時2026-09@26',
            'memberTask/procDetail:権限管理：不具合修正@46',
            'memberGroup:佐藤@-',
            'versionHead:定期2026-11@26',
            'memberTask/detail:単独タスク@38',
        ]);
    });
});
