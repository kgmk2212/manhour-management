// ============================================
// ガント「担当者×タスク」表示の純粋ロジック（行の組み立て・日ごとの本数・見出しの折り返し）
// 設計: docs/superpowers/specs/2026-09-29-schedule-member-task-view-design.md
// DOM・state に依存しない（描画は schedule-render.js、吹き出しは schedule-gantt-tips.js）
// ============================================

/** (担当者, タスク) のキー */
const memberTaskKey = (s) => `${s.member}\u0000${s.version}\u0000${s.task}`;

/**
 * 表示範囲に 1 日でも掛かる予定を持つ (担当者, タスク) の予定だけを返す
 * （行にするタスクを表示範囲で絞る。行にしたタスクの予定は範囲外のものも含めて全部返す）
 * @param {Object[]} schedules - 予定
 * @param {{start: string, end: string}} period - 表示範囲（YYYY-MM-DD、両端含む）
 * @param {(s: Object) => string} [effEnd] - 予定が占める最終日（遅延中は今日まで、など）。既定は endDate
 * @returns {Object[]}
 */
export function selectMemberTaskSchedules(schedules, period, effEnd = (s) => s.endDate) {
    const keys = new Set(
        schedules
            .filter(s => s.startDate <= period.end && effEnd(s) >= period.start)
            .map(memberTaskKey)
    );
    return schedules.filter(s => keys.has(memberTaskKey(s)));
}

/**
 * 担当者の見出し行とタスク行の配列を作る
 * @param {Object[]} schedules - 行にする予定（selectMemberTaskSchedules の結果）
 * @param {Object} options
 * @param {string[]} options.memberOrder - 担当者の並び（この順に見出しを並べる。含まれない担当者は末尾に名前順）
 * @param {Object<string, number>} [options.taskSortOrder] - "版数/対応名" → 着手順
 * @param {Set<string>} [options.collapsed] - 畳んでいる担当者
 * @returns {Array<{type: 'memberGroup', label: string, member: string, schedules: Object[], taskCount: number,
 *                  collapsed: boolean} | {type: 'memberTask', label: string, version: string, member: string,
 *                  schedules: Object[]}>}
 */
export function buildMemberTaskRows(schedules, { memberOrder, taskSortOrder = {}, collapsed = new Set() }) {
    const byMember = new Map();
    schedules.forEach(s => {
        if (!byMember.has(s.member)) byMember.set(s.member, []);
        byMember.get(s.member).push(s);
    });
    const known = memberOrder.filter(m => byMember.has(m));
    const rest = [...byMember.keys()].filter(m => !memberOrder.includes(m)).sort((a, b) => a.localeCompare(b, 'ja'));

    const rows = [];
    [...known, ...rest].forEach(member => {
        const mine = byMember.get(member);
        const byTask = new Map();
        mine.forEach(s => {
            const k = `${s.version}/${s.task}`;
            if (!byTask.has(k)) byTask.set(k, { version: s.version, task: s.task, schedules: [] });
            byTask.get(k).schedules.push(s);
        });
        const firstStart = (t) => t.schedules.reduce((m, s) => (s.startDate < m ? s.startDate : m), '9999-12-31');
        const tasks = [...byTask.entries()].sort(([ka, a], [kb, b]) => {
            const oa = taskSortOrder[ka];
            const ob = taskSortOrder[kb];
            if (oa !== undefined && ob !== undefined && oa !== ob) return oa - ob;
            if (oa !== undefined && ob === undefined) return -1;
            if (oa === undefined && ob !== undefined) return 1;
            const fa = firstStart(a);
            const fb = firstStart(b);
            if (fa !== fb) return fa < fb ? -1 : 1;
            return ka.localeCompare(kb, 'ja');
        });

        const isCollapsed = collapsed.has(member);
        rows.push({ type: 'memberGroup', label: member, member, schedules: mine, taskCount: tasks.length, collapsed: isCollapsed });
        if (isCollapsed) return;
        tasks.forEach(([, t]) => {
            rows.push({ type: 'memberTask', label: t.task, version: t.version, member, schedules: t.schedules });
        });
    });
    return rows;
}

/**
 * 担当者の見出しの帯に出す、日ごとの未完了の予定の本数
 * @param {Object[]} schedules - その担当者の予定
 * @param {string[]} days - 対象日（YYYY-MM-DD）
 * @param {Object} options
 * @param {(d: string) => boolean} options.isOff - 休日（週末・祝日・休暇）なら true。本数を数えない
 * @param {(s: Object) => string} [options.effEnd] - 予定が占める最終日（遅延中は今日まで）
 * @param {(s: Object) => boolean} [options.isDone] - 完了済みなら true。数えない
 * @returns {Map<string, Object[]>} 日付 → その日の予定（本数 0 の日は含めない）
 */
export function countDailyLoad(schedules, days, { isOff, effEnd = (s) => s.endDate, isDone = () => false }) {
    const active = schedules.filter(s => !isDone(s));
    const result = new Map();
    days.forEach(d => {
        if (isOff(d)) return;
        const list = active.filter(s => s.startDate <= d && d <= effEnd(s));
        if (list.length > 0) result.set(d, list);
    });
    return result;
}

/**
 * 見出しの文字列を maxWidth に収まるよう最大 maxLines 行に折り返す
 * - 日本語などは文字単位で折り返す
 * - 英数字の続き（CSV・V2.4・Slack など）は途中で切らない。1 行に収まらない長さなら文字単位に落とす
 * - 最終行に入りきらない場合は、末尾を「…」にして収める
 * @param {string} text
 * @param {number} maxWidth
 * @param {number} maxLines - 1 以上
 * @param {(s: string) => number} measure - 文字列の描画幅
 * @returns {{lines: string[], clipped: boolean}}
 */
export function wrapLabel(text, maxWidth, maxLines, measure) {
    // 英数字の続き・その他の 1 文字ずつに分ける
    const tokens = text.match(/[A-Za-z0-9.\-_/]+|[\s\S]/gu) || [];
    const lines = [];
    let current = '';
    let clipped = false;

    const pushLine = () => { lines.push(current); current = ''; };

    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (current === '' && token === ' ') continue; // 行頭の空白は捨てる
        if (measure(current + token) <= maxWidth) {
            current += token;
            continue;
        }
        if (token.length > 1 && measure(token) > maxWidth) {
            // 1 行に収まらない英数字の続きは文字単位に分けて処理し直す
            tokens.splice(i, 1, ...token.split(''));
            i--;
            continue;
        }
        if (lines.length + 1 >= maxLines) { clipped = true; break; }
        pushLine();
        if (token === ' ') continue;
        current = token;
    }

    if (clipped) {
        let last = current;
        while (last.length > 0 && measure(last + '…') > maxWidth) last = last.slice(0, -1);
        lines.push(last + '…');
    } else if (current !== '' || lines.length === 0) {
        lines.push(current);
    }
    return { lines, clipped };
}
