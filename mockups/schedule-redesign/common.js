/* ============================================================
   スケジュール機能 刷新 — 比較モックアップ共通スクリプト
   - 3 案とも同じデータ（担当者 3 人・タスク 4 件・見積 18 行・予定 17 件・実績・休暇・会社休日）から始まる
   - 部品: ガント（レーン分割・計画/実績 2 層）／負荷格子（8 時間の器）／週の負荷カード／
           インスペクタ／作業月の導出テーブル／スマホ用アジェンダ／トースト
   - 本番の予定レコード {version, task, process, member, isReview, startDate, endDate, estimatedHours}
     に「日別配分 daily {YYYY-MM-DD: h}」を足した形をデータモデルとして仮定する。
     daily が無い既存レコードは営業日で均等配分すれば同じ形に変換できる（後方互換）。
   ============================================================ */
window.SR = (() => {
    'use strict';

    /* ---------------- 日付 ---------------- */
    const TODAY = '2026-09-16';                     // モックアップの「今日」は固定（再現性のため）
    const pad = n => String(n).padStart(2, '0');
    const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toStr(d); };
    const range = (a, b) => { const o = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };
    const dow = s => parse(s).getDay();
    const WD = ['日', '月', '火', '水', '木', '金', '土'];
    const HOLIDAYS = {
        '2026-09-21': '敬老の日', '2026-09-22': '休日', '2026-09-23': '秋分の日',
        '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
    };
    const fmtMD = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
    const fmtMDW = s => `${fmtMD(s)}(${WD[dow(s)]})`;
    const fmtMonth = ym => `${+ym.slice(5, 7)}月`;
    const fmtYM = ym => `${ym.slice(0, 4)}年${+ym.slice(5, 7)}月`;
    const monthOf = s => s.slice(0, 7);
    const monthDays = ym => { const [y, m] = ym.split('-').map(Number); return range(`${ym}-01`, `${ym}-${pad(new Date(y, m, 0).getDate())}`); };
    const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
    const weekStartOf = s => addDays(s, -((dow(s) + 6) % 7));   // 月曜始まり

    /* ---------------- マスタ ---------------- */
    const TASKS = {
        t1: { ver: 'V2.4', name: '帳票A出力改修', color: '#2D5A27' },
        t2: { ver: 'V2.4', name: '集計バッチ高速化', color: '#1D6FA5' },
        t3: { ver: 'V2.3', name: '権限管理の不具合修正', color: '#C4841D' },
        t4: { ver: 'V2.4', name: 'マスタ画面追加', color: '#6B4E8E' },
    };
    const MEMBERS = ['田中太郎', '佐藤花子', '鈴木一郎'];
    const PROCS = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const HOURS_PER_DAY = 8;
    const companyHolidays = [{ name: '創立記念日', startDate: '2026-09-28', endDate: '2026-09-28' }];
    const vacations = [
        { member: '佐藤花子', date: '2026-09-18', type: '全休', hours: 8 },
        { member: '鈴木一郎', date: '2026-09-25', type: '午後休', hours: 4 },
    ];

    /* ---------------- データ ---------------- */
    const E = (id, task, process, member, hours, workMonths, isReview = false) => ({ id, task, process, member, hours, workMonths, isReview });
    const S = (id, task, process, member, daily, done = false, isReview = false) => ({ id, task, process, member, isReview, daily, done });
    const A = (task, process, member, map, isReview = false) => Object.entries(map).map(([date, hours]) => ({ task, process, member, isReview, date, hours }));
    const D = (prefix, map) => Object.fromEntries(Object.entries(map).map(([d, h]) => [`2026-${prefix}-${pad(+d)}`, h]));

    const seed = () => ({
        estimates: [
            E('e1', 't1', 'UI', '田中太郎', 16, ['2026-09']),
            E('e2', 't1', 'PG', '田中太郎', 40, ['2026-09']),
            E('e3', 't1', 'PG', '佐藤花子', 24, ['2026-09']),
            E('e4', 't1', 'PG', '鈴木一郎', 4, ['2026-09'], true),
            E('e5', 't1', 'PT', '佐藤花子', 16, ['2026-09']),
            E('e6', 't1', 'IT', '佐藤花子', 16, ['2026-10']),          // 予定は 9/29〜30 → ずれ
            E('e7', 't1', 'ST', '鈴木一郎', 8, ['2026-10']),
            E('e8', 't2', 'PG', '鈴木一郎', 32, ['2026-09']),
            E('e9', 't2', 'PT', '鈴木一郎', 16, ['2026-09']),
            E('e10', 't2', 'IT', '鈴木一郎', 16, ['2026-09']),
            E('e16', 't2', 'ST', '鈴木一郎', 8, ['2026-09']),
            E('e11', 't3', 'PG', '田中太郎', 8, ['2026-09']),
            E('e12', 't3', 'PT', '田中太郎', 4, ['2026-09']),
            E('e17', 't3', 'IT', '田中太郎', 12, ['2026-09']),
            E('e13', 't4', 'UI', '佐藤花子', 8, ['2026-09']),
            E('e14', 't4', 'PG', '田中太郎', 24, ['2026-09', '2026-10']), // 予定は 9 月だけ → ずれ
            E('e18', 't4', 'PG', '佐藤花子', 16, ['2026-09']),
            E('e15', 't4', 'PT', '佐藤花子', 8, ['2026-10']),           // 未スケジュール
        ],
        schedules: [
            S('s1', 't1', 'UI', '田中太郎', D('09', { 1: 8, 2: 8 }), true),
            S('s2', 't1', 'PG', '田中太郎', D('09', { 3: 8, 4: 8, 7: 8, 8: 8, 9: 8 })),        // 終了日超過・未完了 = 遅延
            S('s3', 't3', 'PG', '田中太郎', D('09', { 9: 4, 10: 4 }), true),                    // 9/9 は s2 と重なり 12h
            S('s4', 't3', 'PT', '田中太郎', D('09', { 11: 4 }), true),
            S('s5', 't4', 'PG', '田中太郎', D('09', { 14: 8, 15: 8, 16: 8 })),
            S('s16', 't3', 'IT', '田中太郎', D('09', { 16: 4, 17: 8 })),                        // 9/16 は s5 と重なり 12h
            S('s6', 't4', 'UI', '佐藤花子', D('09', { 1: 8 }), true),
            S('s7', 't1', 'PG', '佐藤花子', D('09', { 2: 8, 3: 8, 4: 8 }), true),
            S('s8', 't1', 'PT', '佐藤花子', D('09', { 8: 8, 9: 8 }), true),
            S('s17', 't4', 'PG', '佐藤花子', D('09', { 16: 8, 17: 8 })),
            S('s9', 't1', 'IT', '佐藤花子', D('09', { 29: 8, 30: 8 })),
            S('s10', 't2', 'PG', '鈴木一郎', D('09', { 1: 8, 2: 8, 3: 8, 4: 8 }), true),
            S('s11', 't1', 'PG', '鈴木一郎', D('09', { 7: 4 }), true, true),
            S('s12', 't2', 'PT', '鈴木一郎', D('09', { 8: 8, 9: 8 }), true),
            S('s13', 't2', 'IT', '鈴木一郎', D('09', { 14: 8, 15: 8 }), true),
            S('s15', 't2', 'ST', '鈴木一郎', D('09', { 17: 8 })),
            S('s14', 't1', 'ST', '鈴木一郎', D('10', { 1: 8 })),
        ],
        actuals: [
            ...A('t1', 'UI', '田中太郎', D('09', { 1: 8, 2: 8, 3: 4 })),
            ...A('t1', 'PG', '田中太郎', D('09', { 3: 4, 4: 8, 7: 6, 8: 8, 9: 4, 10: 2, 14: 2 })),
            ...A('t3', 'PG', '田中太郎', D('09', { 10: 6, 11: 4 })),
            ...A('t3', 'PT', '田中太郎', D('09', { 11: 4 })),
            ...A('t4', 'PG', '田中太郎', D('09', { 14: 6, 15: 8 })),
            ...A('t4', 'UI', '佐藤花子', D('09', { 1: 8 })),
            ...A('t1', 'PG', '佐藤花子', D('09', { 2: 8, 3: 8, 4: 6, 7: 2 })),
            ...A('t1', 'PT', '佐藤花子', D('09', { 8: 8, 9: 8 })),
            ...A('t2', 'PG', '鈴木一郎', D('09', { 1: 8, 2: 8, 3: 8, 4: 8 })),
            ...A('t1', 'PG', '鈴木一郎', D('09', { 7: 4 }), true),
            ...A('t2', 'PT', '鈴木一郎', D('09', { 8: 8, 9: 5, 10: 3 })),
            ...A('t2', 'IT', '鈴木一郎', D('09', { 14: 8, 15: 8 })),
        ],
    });
    let data = seed();

    /* ---------------- 結合・集計 ---------------- */
    const keyOf = o => `${o.task}|${o.process}|${o.member}|${o.isReview ? 1 : 0}`;
    const dates = s => Object.keys(s.daily).sort();
    const start = s => dates(s)[0];
    const end = s => dates(s).slice(-1)[0];
    const planned = s => Object.values(s.daily).reduce((a, b) => a + b, 0);
    const actualsOf = key => data.actuals.filter(a => keyOf(a) === key);
    const actualMap = key => Object.fromEntries(actualsOf(key).map(a => [a.date, a.hours]));
    const actualTotal = key => actualsOf(key).reduce((a, b) => a + b.hours, 0);
    const estimateOf = key => data.estimates.find(e => keyOf(e) === key);
    const schedulesOf = key => data.schedules.filter(s => keyOf(s) === key);
    const statusOf = s => s.done ? 'completed' : (actualTotal(keyOf(s)) > 0 ? 'in_progress' : 'pending');
    const isDelayed = s => !s.done && end(s) < TODAY;
    const STATUS_LABEL = { completed: '完了', in_progress: '進行中', pending: '未着手' };
    const short = m => m.slice(0, 2);
    const taskOf = s => TASKS[s.task];
    const procLabel = s => s.process + (s.isReview ? 'ﾚﾋﾞｭｰ' : '');

    const isCompanyHoliday = d => companyHolidays.find(h => d >= h.startDate && d <= h.endDate);
    const dayInfo = d => {
        const w = dow(d);
        const hol = HOLIDAYS[d] || null;
        const comp = isCompanyHoliday(d);
        return { sat: w === 6, sun: w === 0, hol, comp: comp ? comp.name : null, off: w === 0 || w === 6 || !!hol || !!comp };
    };
    const vacationOf = (member, d) => vacations.find(v => v.member === member && v.date === d) || null;
    const capacity = (member, d) => {
        if (dayInfo(d).off) return 0;
        const v = vacationOf(member, d);
        return Math.max(0, HOURS_PER_DAY - (v ? v.hours : 0));
    };
    const plannedOn = (member, d) => data.schedules.filter(s => s.member === member && s.daily[d]).map(s => ({ s, h: s.daily[d] }));
    const actualOn = (member, d) => data.actuals.filter(a => a.member === member && a.date === d);
    const plannedTotalOn = (member, d) => plannedOn(member, d).reduce((a, b) => a + b.h, 0);
    const deriveMonths = est => {
        const out = {};
        schedulesOf(keyOf(est)).forEach(s => Object.entries(s.daily).forEach(([d, h]) => { const ym = monthOf(d); out[ym] = (out[ym] || 0) + h; }));
        return out;
    };
    const deriveState = est => {
        const derived = Object.keys(deriveMonths(est)).sort();
        if (!derived.length) return 'none';
        const cur = [...est.workMonths].sort();
        return derived.join() === cur.join() ? 'ok' : 'warn';
    };
    const nextBusinessDays = (member, from, n) => {
        const out = [];
        for (let d = addDays(from, 1); out.length < n; d = addDays(d, 1)) if (capacity(member, d) > 0) out.push(d);
        return out;
    };

    /* ---------------- 変更（Undo 付き） ---------------- */
    const moveHours = (schedId, from, to) => {
        const s = data.schedules.find(x => x.id === schedId);
        const h = s.daily[from];
        if (!h || from === to) return null;
        const before = { ...s.daily };
        delete s.daily[from];
        s.daily[to] = (s.daily[to] || 0) + h;
        return () => { s.daily = before; };
    };
    const applyDerived = estId => {
        const e = data.estimates.find(x => x.id === estId);
        const before = [...e.workMonths];
        e.workMonths = Object.keys(deriveMonths(e)).sort();
        return () => { e.workMonths = before; };
    };
    const reset = () => { data = seed(); };

    /* ---------------- DOM ヘルパ ---------------- */
    const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
    const colorVars = hex => `--c:${hex};--c-light:${rgba(hex, .14)};--c-line:${rgba(hex, .45)};--c-text:${hex};`;
    const dayClass = d => { const i = dayInfo(d); return (i.off ? ' is-off' : '') + (i.sat ? ' is-sat' : '') + (i.sun ? ' is-sun' : '') + (i.hol || i.comp ? ' is-hol' : '') + (d === TODAY ? ' is-today' : ''); };

    /* ============================================================
       部品 1: ガント（レーン分割 ＋ 計画バーの上に実績の刻み）
       ============================================================ */
    const SCALES = {
        week: { from: '2026-09-07', to: '2026-09-20', w: 56, mw: 40 },
        month: { from: '2026-09-01', to: '2026-10-11', w: 30, mw: 26 },
        quarter: { from: '2026-08-31', to: '2026-11-29', w: 12, mw: 9 },
    };
    function assignLanes(items) {
        // items: [{from, to}] を開始日順に、重ならない最初のレーンへ
        const lanes = [];
        return items.map(it => {
            let li = lanes.findIndex(lastEnd => lastEnd < it.from);
            if (li < 0) { li = lanes.length; lanes.push(it.to); } else lanes[li] = it.to;
            return li;
        });
    }
    function renderGantt(host, o) {
        const sc = SCALES[o.scale || 'month'];
        const days = range(sc.from, sc.to);
        const idx = Object.fromEntries(days.map((d, i) => [d, i]));
        const dayW = o.mobile ? sc.mw : sc.w;
        const laneH = o.mobile ? 30 : 34, gap = 6, padT = 6, tickMax = o.mobile ? 12 : 14;
        const strip = o.loadStrip && o.mode === 'member' ? 12 : 0;
        const tiny = dayW < 16;
        const passProc = s => !o.procs || o.procs.has(s.isReview ? 'REVIEW' : s.process);
        const inRange = s => { const am = actualMap(keyOf(s)); const ds = [...dates(s), ...Object.keys(am)]; return ds.some(d => d >= sc.from && d <= sc.to); };

        const rows = (o.mode === 'task' ? Object.keys(TASKS) : MEMBERS).map(rk => {
            const scheds = data.schedules.filter(s => (o.mode === 'task' ? s.task === rk : s.member === rk) && passProc(s) && inRange(s))
                .sort((a, b) => start(a).localeCompare(start(b)));
            const spans = scheds.map(s => { const am = Object.keys(actualMap(keyOf(s))); return { from: start(s), to: [end(s), ...am].sort().slice(-1)[0] }; });
            const lanes = assignLanes(spans);
            const n = Math.max(1, ...lanes.map(l => l + 1));
            return { rk, scheds, lanes, h: padT + n * (laneH + gap) + strip };
        });

        const root = el(`<div class="sr-gantt" style="--sr-day-w:${dayW}px;--sr-lane-h:${laneH}px"></div>`);
        const labels = el(`<div class="sr-g-labels"><div class="sr-g-corner">${o.mode === 'task' ? 'タスク' : '担当者'}</div></div>`);
        const scroll = el(`<div class="sr-g-scroll"><div class="sr-g-inner" style="width:${days.length * dayW}px"></div></div>`);
        const inner = scroll.firstElementChild;

        // ヘッダ（月ラベル＋日 or 週）
        const head = el('<div class="sr-g-head"></div>');
        days.forEach((d, i) => {
            if (i === 0 || d.endsWith('-01')) head.appendChild(el(`<div class="sr-g-monthlbl" style="left:${i * dayW}px">${fmtYM(monthOf(d))}</div>`));
            if (tiny) { if (dow(d) === 1) head.appendChild(el(`<div class="sr-g-week" style="left:${i * dayW}px">${fmtMD(d)}</div>`)); }
            else head.appendChild(el(`<div class="sr-g-day${dayClass(d)}" style="left:${i * dayW}px">${+d.slice(8)}<span>${WD[dow(d)]}</span></div>`));
        });
        inner.appendChild(head);

        rows.forEach(r => {
            const isTask = o.mode === 'task';
            const t = isTask ? TASKS[r.rk] : null;
            const planSum = r.scheds.reduce((a, s) => a + planned(s), 0);
            const actSum = r.scheds.reduce((a, s) => a + actualTotal(keyOf(s)), 0);
            const lbl = el(`<div class="sr-g-label" style="height:${r.h}px;${t ? colorVars(t.color) : ''}">
                <b>${t ? '<i></i>' : ''}${esc(isTask ? `${t.ver} ${t.name}` : r.rk)}</b>
                <small>${isTask ? `進捗 ${actSum}/${planSum}h` : `期間内 予定 ${planSum}h ・ 実績 ${actSum}h`}</small></div>`);
            labels.appendChild(lbl);

            const row = el(`<div class="sr-g-row" style="height:${r.h}px"></div>`);
            days.forEach((d, i) => {
                const di = dayInfo(d);
                let cls = di.off ? (di.hol || di.comp ? ' is-hol' : ' is-off') : '';
                if (!isTask && !di.off) { const v = vacationOf(r.rk, d); if (v) cls += v.hours >= 8 ? ' is-vac' : ' is-vac-half'; }
                if (cls) row.appendChild(el(`<div class="sr-g-col${cls}" style="left:${i * dayW}px" title="${esc(di.hol || di.comp || '')}"></div>`));
            });
            if (!r.scheds.length) row.appendChild(el('<div class="sr-g-empty">この期間の予定はありません</div>'));

            r.scheds.forEach((s, k) => {
                const key = keyOf(s);
                const top = padT + r.lanes[k] * (laneH + gap);
                const from = Math.max(0, idx[start(s)] ?? (start(s) < sc.from ? 0 : days.length));
                const toI = Math.min(days.length - 1, idx[end(s)] ?? (end(s) > sc.to ? days.length - 1 : -1));
                const act = actualTotal(key), pl = planned(s), st = statusOf(s), delayed = isDelayed(s);
                const barW = (toI - from + 1) * dayW - 2;
                const cls = ['sr-bar', s.isReview ? 'is-review' : '', delayed ? 'is-delayed' : '', st === 'completed' ? 'is-done' : '',
                    o.sel ? (o.sel === key ? 'is-sel' : 'is-dim') : '', tiny || barW < 34 ? 'is-tiny' : (barW < 100 ? 'is-narrow' : '')].filter(Boolean).join(' ');
                const title = isTask ? `${procLabel(s)} ${short(s.member)}` : `${taskOf(s).name} ${procLabel(s)}`;
                const num = st === 'completed' ? `✓ ${act}h` : `${act}/${pl}h`;
                if (toI >= from) {
                    const bar = el(`<div class="${cls}" style="${colorVars(taskOf(s).color)}left:${from * dayW + 1}px;width:${(toI - from + 1) * dayW - 2}px;top:${top}px"
                        title="${esc(`${taskOf(s).ver} ${taskOf(s).name} / ${procLabel(s)} / ${s.member}\n計画 ${fmtMD(start(s))}〜${fmtMD(end(s))} ${pl}h ・ 実績 ${act}h ・ ${STATUS_LABEL[st]}${delayed ? '（遅延）' : ''}`)}">
                        <span class="sr-bar-t">${esc(title)}</span><span class="sr-bar-n">${delayed ? '! ' : ''}${num}</span></div>`);
                    bar.addEventListener('click', () => o.onSelect && o.onSelect(key, s));
                    row.appendChild(bar);
                }
                // 実績の刻み: 計画バーの底に、日ごとの時間を高さで
                Object.entries(actualMap(key)).forEach(([d, h]) => {
                    if (idx[d] === undefined) return;
                    const th = Math.max(2, Math.round(h / HOURS_PER_DAY * tickMax));
                    const spill = d > end(s) || d < start(s);
                    row.appendChild(el(`<div class="sr-tick${spill ? ' is-spill' : ''}${o.sel && o.sel !== key ? ' is-dim' : ''}" style="${colorVars(taskOf(s).color)}left:${idx[d] * dayW + 3}px;top:${top + laneH - 2 - th}px;height:${th}px" title="${esc(`${fmtMDW(d)} 実績 ${h}h${spill ? '（計画外の日）' : ''}`)}"></div>`));
                });
            });

            if (strip) {
                const ld = el('<div class="sr-load"></div>');
                days.forEach((d, i) => {
                    const tot = plannedTotalOn(r.rk, d);
                    if (!tot) return;
                    const cap = capacity(r.rk, d);
                    ld.appendChild(el(`<i class="${tot > cap ? 'is-over' : ''}" style="left:${i * dayW + 2}px;opacity:${tot > cap ? 1 : (0.25 + 0.65 * Math.min(1, tot / HOURS_PER_DAY)).toFixed(2)}" title="${esc(`${fmtMDW(d)} 予定 ${tot}h / 稼働 ${cap}h`)}"></i>`));
                });
                row.appendChild(ld);
            }
            inner.appendChild(row);
        });
        if (idx[TODAY] !== undefined) inner.appendChild(el(`<div class="sr-today" style="left:${idx[TODAY] * dayW + dayW / 2 - 1}px"></div>`));
        root.append(labels, scroll);
        host.appendChild(root);
        // 今日が見える位置へ
        requestAnimationFrame(() => { if (idx[TODAY] !== undefined) scroll.scrollLeft = Math.max(0, idx[TODAY] * dayW - scroll.clientWidth * 0.45); });
        return root;
    }

    /* ============================================================
       部品 2: 週の負荷カード（サマリーの置換）
       ============================================================ */
    function renderWeekLoad(host, o) {
        const ws = o.weekStart || weekStartOf(TODAY);
        const days = range(ws, addDays(ws, 6));
        const wrap = el('<div class="sr-week"></div>');
        MEMBERS.forEach(m => {
            const cap = days.reduce((a, d) => a + capacity(m, d), 0);
            const pl = days.reduce((a, d) => a + plannedTotalOn(m, d), 0);
            const over = days.filter(d => plannedTotalOn(m, d) > capacity(m, d));
            const pct = cap ? Math.min(100, pl / cap * 100) : 0;
            wrap.appendChild(el(`<div class="sr-week-card">
                <div class="sr-week-h"><b>${esc(m)}</b><span class="${pl > cap ? 'is-over' : ''}">${pl} / ${cap}h</span></div>
                <div class="sr-week-bar"><i class="${pl > cap ? 'is-over' : ''}" style="width:${pct}%"></i></div>
                <small>${over.length ? `${over.map(fmtMD).join('・')} が稼働を超過` : (cap - pl > 0 ? `空き ${cap - pl}h` : '空きなし')}</small></div>`));
        });
        host.appendChild(el(`<div class="sr-legend" style="margin-bottom:6px">今週（${fmtMD(ws)}〜${fmtMD(days[6])}）の予定と稼働</div>`));
        host.appendChild(wrap);
    }

    /* ============================================================
       部品 3: 負荷格子（担当者 × 日、セル = 8 時間の器）
       ============================================================ */
    function renderGrid(host, o) {
        const days = monthDays(o.month);
        const bizW = 36, offW = 18, labelW = 108, wellH = 64;
        const grid = el(`<div class="sr-grid" style="grid-template-columns:${labelW}px ${days.map(d => (dayInfo(d).off ? offW : bizW) + 'px').join(' ')}"></div>`);
        grid.appendChild(el(`<div class="sr-gh is-corner">担当者<span>予定 ／ 稼働</span></div>`));
        days.forEach(d => {
            const di = dayInfo(d);
            grid.appendChild(el(`<div class="sr-gh${dayClass(d)}" title="${esc(di.hol || di.comp || '')}">${+d.slice(8)}${di.off ? '' : `<span>${WD[dow(d)]}</span>`}</div>`));
        });
        const selKey = o.sel ? o.sel.key : null;
        MEMBERS.forEach(m => {
            const capM = days.reduce((a, d) => a + capacity(m, d), 0);
            const plM = days.reduce((a, d) => a + plannedTotalOn(m, d), 0);
            grid.appendChild(el(`<div class="sr-gm"><b>${esc(m)}</b><small><em>${plM}h</em> ／ ${capM}h</small></div>`));
            days.forEach(d => {
                const di = dayInfo(d), cap = capacity(m, d), past = d < TODAY;
                // 移動先は同じ担当者の、今日以降の営業日だけ（過去の日へ予定を動かすのは実績の領分）
                const isTarget = o.moveFrom && o.moveFrom.member === m && !di.off && d !== o.moveFrom.date && d >= TODAY;
                const cell = el(`<div class="sr-cell${di.off ? ' is-off' : ''}${di.hol || di.comp ? ' is-hol' : ''}${past ? ' is-past' : ''}${isTarget ? ' is-target' : ''}${o.selDay && o.selDay.member === m && o.selDay.date === d ? ' is-selday' : ''}" data-member="${esc(m)}" data-date="${d}"></div>`);
                if (di.off) {
                    if (di.hol || di.comp) cell.appendChild(el(`<div class="sr-cap" style="top:4px;bottom:4px"><span>${esc((di.hol || di.comp).slice(0, 5))}</span></div>`));
                    grid.appendChild(cell);
                    return;
                }
                cell.appendChild(el('<div class="sr-rim"></div>'));
                const v = vacationOf(m, d);
                if (v) {
                    const capH = (HOURS_PER_DAY - cap) / HOURS_PER_DAY * wellH;
                    cell.appendChild(el(`<div class="sr-cap" style="bottom:${6 + cap / HOURS_PER_DAY * wellH}px;height:${capH}px"><span>${esc(v.type)}</span></div>`));
                }
                const plans = plannedOn(m, d);
                const acts = actualOn(m, d);
                const pw = el('<div class="sr-well is-plan"></div>');
                let acc = 0;
                plans.forEach(({ s, h }) => {
                    const key = keyOf(s);
                    acc += h;
                    const seg = el(`<div class="sr-seg${s.isReview ? ' is-review' : ''}${selKey ? (selKey === key ? ' is-sel' : ' is-dim') : ''}${acc > cap ? ' is-over' : ''}" style="${colorVars(taskOf(s).color)}height:${h / HOURS_PER_DAY * wellH}px" title="${esc(`${taskOf(s).name} ${procLabel(s)} ${h}h（予定）`)}"></div>`);
                    seg.addEventListener('click', ev => { ev.stopPropagation(); o.onSelectSeg && o.onSelectSeg(s, d); });
                    pw.appendChild(seg);
                });
                cell.appendChild(pw);
                let actTot = 0;
                if (past) {
                    const aw = el('<div class="sr-well is-actual"></div>');
                    acts.forEach(a => {
                        actTot += a.hours;
                        const t = TASKS[a.task];
                        aw.appendChild(el(`<div class="sr-seg${a.isReview ? ' is-review' : ''}${selKey ? (selKey === keyOf(a) ? ' is-sel' : ' is-dim') : ''}" style="${colorVars(t.color)}height:${a.hours / HOURS_PER_DAY * wellH}px" title="${esc(`${t.name} ${a.process}${a.isReview ? 'ﾚﾋﾞｭｰ' : ''} ${a.hours}h（実績）`)}"></div>`));
                    });
                    cell.appendChild(aw);
                }
                const tot = plans.reduce((a, b) => a + b.h, 0);
                if (tot || actTot) {
                    const hi = Math.max(tot, actTot) / HOURS_PER_DAY * wellH;
                    cell.appendChild(el(`<div class="sr-tot${tot > cap ? ' is-over' : ''}" style="bottom:${6 + hi + 3}px">${past && actTot !== tot ? `${tot}<span style="opacity:.6">|</span>${actTot}` : tot}${tot > cap ? '!' : ''}</div>`));
                }
                cell.addEventListener('click', () => {
                    if (o.moveFrom) { if (isTarget) o.onMoveTo && o.onMoveTo(m, d); return; }
                    o.onSelectDay && o.onSelectDay(m, d);
                });
                grid.appendChild(cell);
            });
        });
        const wrap = el('<div class="sr-grid-wrap"></div>');
        wrap.appendChild(grid);
        host.appendChild(wrap);
        return wrap;
    }

    /* ============================================================
       部品 4: インスペクタ（選んだ予定・選んだ日）
       ============================================================ */
    function renderInspector(host, o) {
        const box = el('<div class="sr-insp"></div>');
        if (o.seg) {
            const { s, date } = o.seg;
            const key = keyOf(s), t = taskOf(s), am = actualMap(key), act = actualTotal(key), pl = planned(s), est = estimateOf(key);
            const st = statusOf(s);
            box.appendChild(el(`<div class="sr-insp-title" style="${colorVars(t.color)}"><i></i>${esc(`${t.name} ${procLabel(s)}`)}</div>`));
            box.appendChild(el(`<div class="sr-insp-meta">${esc(s.member)} ・ ${esc(t.ver)} ・ <span class="sr-badge ${st === 'completed' ? 'is-ok' : isDelayed(s) ? 'is-none' : 'is-warn'}">${STATUS_LABEL[st]}${isDelayed(s) ? '・遅延' : ''}</span><br>
                この日 <b>${fmtMDW(date)}</b>: 予定 <b>${s.daily[date] || 0}h</b>${am[date] ? ` ・ 実績 <b>${am[date]}h</b>` : ''}<br>
                全体: 予定 <b>${pl}h</b>（見積 ${est ? est.hours : '-'}h）・ 実績 <b>${act}h</b> ・ 残り <b>${Math.max(0, (est ? est.hours : pl) - act)}h</b><br>
                期間 ${fmtMD(start(s))}〜${fmtMD(end(s))}</div>`));
            if (!o.moveMode) {
                const row = el('<div style="display:flex;gap:6px;flex-wrap:wrap"></div>');
                const mv = el('<button type="button" class="sr-btn is-primary is-small">この日の分を別の日へ移す</button>');
                mv.addEventListener('click', () => o.onMoveStart && o.onMoveStart());
                row.appendChild(mv);
                const cl = el('<button type="button" class="sr-btn is-small">選択を解除</button>');
                cl.addEventListener('click', () => o.onClear && o.onClear());
                row.appendChild(cl);
                box.appendChild(row);
            } else {
                box.appendChild(el(`<h5>移す先をタップ（格子の緑枠、または下の候補）</h5>`));
                const list = el('<div class="sr-daylist"></div>');
                nextBusinessDays(s.member, addDays(date > TODAY ? date : TODAY, -1), 6).forEach(d => {
                    if (d === date) return;
                    const tot = plannedTotalOn(s.member, d), cap = capacity(s.member, d), h = s.daily[date];
                    const after = tot + h;
                    const b = el(`<button type="button"><span>${fmtMDW(d)}</span><span class="sr-mini"><i class="${after > cap ? 'is-over' : ''}" style="width:${Math.min(100, after / HOURS_PER_DAY * 100)}%"></i></span><small>${tot}→${after}h${after > cap ? ' 超過' : ''}</small></button>`);
                    b.addEventListener('click', () => o.onMoveTo && o.onMoveTo(s.member, d));
                    list.appendChild(b);
                });
                box.appendChild(list);
                const cancel = el('<button type="button" class="sr-btn is-small">やめる</button>');
                cancel.addEventListener('click', () => o.onMoveCancel && o.onMoveCancel());
                box.appendChild(cancel);
            }
        } else if (o.day) {
            const { member, date } = o.day;
            const cap = capacity(member, date), plans = plannedOn(member, date), acts = actualOn(member, date);
            const tot = plans.reduce((a, b) => a + b.h, 0);
            box.appendChild(el(`<div class="sr-insp-title">${fmtMDW(date)} ・ ${esc(member)}</div>`));
            box.appendChild(el(`<div class="sr-insp-meta">稼働 <b>${cap}h</b> ・ 予定 <b class="${tot > cap ? 'is-over' : ''}" ${tot > cap ? 'style="color:var(--danger)"' : ''}>${tot}h</b> ・ ${tot > cap ? `<span style="color:var(--danger);font-weight:700">${tot - cap}h 超過</span>` : `空き <b>${cap - tot}h</b>`}${vacationOf(member, date) ? ` ・ ${esc(vacationOf(member, date).type)}` : ''}</div>`));
            if (plans.length) {
                box.appendChild(el('<h5>予定</h5>'));
                const items = el('<div class="sr-items"></div>');
                plans.forEach(({ s, h }) => {
                    const it = el(`<div class="sr-item" style="${colorVars(taskOf(s).color)}"><i class="${s.isReview ? 'is-review' : ''}"></i><span>${esc(`${taskOf(s).name} ${procLabel(s)}`)}</span><small>${h}h</small></div>`);
                    it.addEventListener('click', () => o.onSelectSeg && o.onSelectSeg(s, date));
                    items.appendChild(it);
                });
                box.appendChild(items);
            } else box.appendChild(el('<div class="sr-insp-empty">この日の予定はありません。空いている器です。</div>'));
            if (acts.length) {
                box.appendChild(el('<h5>実績</h5>'));
                const items = el('<div class="sr-items"></div>');
                acts.forEach(a => items.appendChild(el(`<div class="sr-item" style="${colorVars(TASKS[a.task].color)};cursor:default"><i class="${a.isReview ? 'is-review' : ''}"></i><span>${esc(`${TASKS[a.task].name} ${a.process}${a.isReview ? 'ﾚﾋﾞｭｰ' : ''}`)}</span><small>${a.hours}h</small></div>`)));
                box.appendChild(items);
            }
        } else {
            box.appendChild(el(`<div class="sr-insp-empty">${o.emptyText || '格子のセルをタップすると、その日の内訳が出ます。予定の色の部分をタップすると、その予定を別の日へ移せます。'}</div>`));
        }
        host.appendChild(box);
        return box;
    }

    /* ============================================================
       部品 5: 作業月の導出テーブル（見積の作業月 vs 予定から導出）
       ============================================================ */
    function renderDerive(host, o) {
        const all = data.estimates.filter(e => !o.filterTask || e.task === o.filterTask);
        const rows = o.onlyIssues ? all.filter(e => deriveState(e) !== 'ok') : all;
        const hidden = all.length - rows.length;
        const tbl = el(`<table class="sr-derive"><thead><tr><th>見積</th><th>時間</th><th>見積の作業月</th><th>予定から</th><th>状態</th>${o.readonly ? '' : '<th></th>'}</tr></thead><tbody></tbody></table>`);
        const tb = tbl.querySelector('tbody');
        if (!rows.length) tb.appendChild(el(`<tr><td colspan="6" style="color:var(--text-muted)">${o.onlyIssues ? 'ずれ・未スケジュールの見積はありません' : '見積がありません'}</td></tr>`));
        rows.forEach(e => {
            const key = keyOf(e), st = deriveState(e), dm = deriveMonths(e), derived = Object.keys(dm).sort();
            const tr = el(`<tr class="${o.sel ? (o.sel === key ? 'is-sel' : 'is-dim') : ''}${o.onSelect ? ' is-click' : ''}">
                <td><i class="sr-dot" style="${colorVars(TASKS[e.task].color)}"></i>${esc(`${TASKS[e.task].name} ${e.process}${e.isReview ? 'ﾚﾋﾞｭｰ' : ''} ${short(e.member)}`)}</td>
                <td class="sr-num">${e.hours}h</td>
                <td>${e.workMonths.map(m => `<span class="sr-monthchip${st === 'warn' && !derived.includes(m) ? ' is-gone' : ''}">${fmtMonth(m)}</span>`).join('')}</td>
                <td>${derived.length ? derived.map(m => `<span class="sr-monthchip is-derived" title="${dm[m]}h">${fmtMonth(m)} <small>${dm[m]}h</small></span>`).join('') : '<span style="color:var(--text-muted)">—</span>'}</td>
                <td><span class="sr-badge ${st === 'ok' ? 'is-ok' : st === 'warn' ? 'is-warn' : 'is-none'}">${st === 'ok' ? '一致' : st === 'warn' ? 'ずれ' : '未スケジュール'}</span></td>
                ${o.readonly ? '' : '<td></td>'}</tr>`);
            if (!o.readonly && st === 'warn') {
                const b = el('<button type="button" class="sr-btn is-small">見積に反映</button>');
                b.addEventListener('click', ev => { ev.stopPropagation(); o.onApply && o.onApply(e); });
                tr.lastElementChild.appendChild(b);
            }
            if (!o.readonly && st === 'none') {
                const b = el('<button type="button" class="sr-btn is-small" title="モックアップでは省略">予定を作る</button>');
                b.disabled = true;
                tr.lastElementChild.appendChild(b);
            }
            if (o.onSelect) tr.addEventListener('click', () => o.onSelect(key));
            tb.appendChild(tr);
        });
        if (hidden > 0) tb.appendChild(el(`<tr><td colspan="6" style="color:var(--text-muted);font-size:12px">一致している ${hidden} 行は省略</td></tr>`));
        host.appendChild(tbl);
        return tbl;
    }

    /* ============================================================
       部品 6: スマホ用アジェンダ（1 人の 2 週間）
       ============================================================ */
    function renderAgenda(host, o) {
        const member = o.member || MEMBERS[0];
        const chips = el('<div class="sr-ag-members"></div>');
        MEMBERS.forEach(m => {
            const c = el(`<button type="button" class="sr-chip${m === member ? ' is-on' : ''}">${esc(m)}</button>`);
            c.addEventListener('click', () => o.onSelectMember && o.onSelectMember(m));
            chips.appendChild(c);
        });
        host.appendChild(chips);
        const list = el('<div class="sr-panel" style="padding:4px 12px"></div>');
        range(o.from || '2026-09-14', o.to || '2026-09-30').forEach(d => {
            const di = dayInfo(d), cap = capacity(member, d);
            if (di.off) {
                list.appendChild(el(`<div class="sr-ag-day is-off"><div class="sr-ag-date"><b style="font-size:13px;color:var(--text-muted)">${fmtMD(d)}</b><small class="${di.sat ? 'is-sat' : 'is-sun'}${di.hol || di.comp ? ' is-hol' : ''}">${WD[dow(d)]}</small></div><div>${esc(di.hol || di.comp || '')}</div></div>`));
                return;
            }
            const plans = plannedOn(member, d), tot = plans.reduce((a, b) => a + b.h, 0), v = vacationOf(member, d);
            const row = el(`<div class="sr-ag-day${d === TODAY ? ' is-today' : ''}"><div class="sr-ag-date"><b>${fmtMD(d)}</b><small>${WD[dow(d)]}${d === TODAY ? ' 今日' : ''}</small></div><div class="sr-ag-body"></div></div>`);
            const body = row.querySelector('.sr-ag-body');
            const well = el('<div class="sr-ag-well"></div>');
            plans.forEach(({ s, h }) => well.appendChild(el(`<i class="${s.isReview ? 'is-review' : ''}" style="${colorVars(taskOf(s).color)}width:${Math.min(100, h / HOURS_PER_DAY * 100)}%"></i>`)));
            if (v) well.appendChild(el(`<span class="sr-ag-cap" style="width:${(HOURS_PER_DAY - cap) / HOURS_PER_DAY * 100}%"></span>`));
            if (tot > cap) well.appendChild(el('<span class="sr-ag-overflow"></span>'));
            body.appendChild(well);
            body.appendChild(el(`<div class="sr-ag-total${tot > cap ? ' is-over' : ''}"><span>${tot ? `予定 ${tot}h` : '予定なし'}${v ? ` ・ ${esc(v.type)}` : ''}</span><span>${tot > cap ? `${tot - cap}h 超過` : `空き ${cap - tot}h`}</span></div>`));
            if (plans.length) {
                const items = el('<div class="sr-items"></div>');
                plans.forEach(({ s, h }) => {
                    const it = el(`<div class="sr-item${o.sel && o.sel.s === s && o.sel.date === d ? ' is-sel' : ''}" style="${colorVars(taskOf(s).color)}"><i class="${s.isReview ? 'is-review' : ''}"></i><span>${esc(`${taskOf(s).name} ${procLabel(s)}`)}</span><small>${h}h</small></div>`);
                    it.addEventListener('click', () => o.onSelectItem && o.onSelectItem(s, d));
                    items.appendChild(it);
                });
                body.appendChild(items);
            }
            list.appendChild(row);
        });
        host.appendChild(list);
    }

    /* ============================================================
       トースト（Undo 付き）
       ============================================================ */
    function toast(frame, msg, onUndo) {
        frame.querySelectorAll('.sr-toast').forEach(t => t.remove());
        const t = el(`<div class="sr-toast" role="status"><span>${esc(msg)}</span>${onUndo ? '<button type="button">元に戻す</button>' : ''}</div>`);
        if (onUndo) t.querySelector('button').addEventListener('click', () => { onUndo(); t.remove(); });
        frame.appendChild(t);
        setTimeout(() => t.remove(), 6000);
    }

    /* ============================================================
       ページの外枠（PC / スマホ切替・埋め込み）
       ============================================================ */
    const NAV = [
        { href: 'index.html', label: '比較ハブ', sub: '3 案の一覧と比較表' },
        { href: 'a-gantt-refined.html', label: '案A', sub: '現行ガントの磨き込み' },
        { href: 'b-load-grid.html', label: '案B', sub: '担当者 × 日の負荷格子' },
        { href: 'c-board-and-gantt.html', label: '案C', sub: '計画ボード ＋ 進捗ガント' },
    ];
    function mount(cfg) {
        const q = new URLSearchParams(location.search);
        let mobile = q.get('w') === 'mobile';
        const embed = q.get('embed') === '1';
        const root = document.getElementById('mk-root');
        let frameEl, sideEl, stageEl;
        const log = [];

        if (embed) {
            root.innerHTML = '<div class="mk-embed"><div class="mk-frame"></div></div>';
        } else {
            root.innerHTML = `<div class="mk-wrap">
              <a class="mk-crumb" href="index.html">← 比較ハブ</a>
              <h1 class="mk-h1">${esc(cfg.title)}</h1>
              <p class="mk-lead">${cfg.lead}</p>
              <nav class="mk-nav">${NAV.map(n => `<a href="${n.href}${n.href === 'index.html' ? '' : location.search}" class="${n.href === cfg.key ? 'is-active' : ''}">${n.label}<small>${n.sub}</small></a>`).join('')}</nav>
              <section class="mk-scenario"><div class="mk-scenario-label">共通の状況（3 案とも同じデータ）</div>
                <div class="mk-scenario-text">今日は <b>2026年9月16日（水）</b>。田中・佐藤・鈴木の 3 人で V2.4 の 3 対応と V2.3 の不具合修正を進めている。田中の <b>帳票A PG は終了日を過ぎて未完了</b>（遅延）、<b>9/9 と 9/16 は予定が 12 時間</b>に膨らんでいる。佐藤の IT は見積では 10 月だが予定は 9/29〜30、田中のマスタ PG は見積 9〜10 月だが予定は 9 月だけ。佐藤のマスタ PT はまだ予定が無い。</div>
                <ol class="mk-task-list">
                  <li>田中の 9/16 が 8 時間を超えていることに、何回目の視線で気づけるか</li>
                  <li>超過している 4 時間を、空いている日へ移す</li>
                  <li>帳票A PG（田中）の遅延と、実際に働いた日を読み取る</li>
                  <li>見積の作業月と予定がずれている行を見つけ、直す</li>
                </ol></section>
              <div class="mk-toolbar"><div class="mk-hint">${cfg.hint || ''}</div>
                <div class="mk-width" role="group" aria-label="表示幅"><button type="button" data-w="pc">PC</button><button type="button" data-w="mobile">スマホ 390px</button></div></div>
              <div class="mk-stage"><div class="mk-frame"></div><aside class="mk-side"></aside></div>
            </div>`;
            root.querySelectorAll('.mk-width button').forEach(b => {
                b.classList.toggle('is-active', (b.dataset.w === 'mobile') === mobile);
                b.addEventListener('click', () => {
                    mobile = b.dataset.w === 'mobile';
                    root.querySelectorAll('.mk-width button').forEach(x => x.classList.toggle('is-active', x === b));
                    const url = new URL(location.href); url.searchParams.set('w', mobile ? 'mobile' : 'pc'); history.replaceState(null, '', url);
                    render();
                });
            });
        }
        frameEl = root.querySelector('.mk-frame');
        sideEl = root.querySelector('.mk-side');
        stageEl = root.querySelector('.mk-stage');

        const api = {
            isMobile: () => mobile,
            frame: () => frameEl,
            note: msg => { log.unshift(msg); if (log.length > 12) log.pop(); },
            log: () => log,
            toast: (msg, undo) => toast(frameEl, msg, undo),
            rerender: () => render(),
        };
        function render() {
            frameEl.className = 'mk-frame' + (mobile ? ' is-mobile' : '');
            if (stageEl) stageEl.classList.toggle('is-mobile', mobile);
            frameEl.innerHTML = `<div class="mk-app-header"><i></i>スケジュール</div><div class="sr-tab"></div>
              <div class="mk-dock"><span><i></i>入力</span><span><i></i>レポート</span><span><i></i>分析</span><span><i></i>見積</span><span><i></i>実績</span><span class="is-active"><i></i>予定</span></div>`;
            if (sideEl) sideEl.innerHTML = '';
            cfg.render(frameEl.querySelector('.sr-tab'), sideEl, api);
        }
        render();
        return api;
    }

    return {
        TODAY, TASKS, MEMBERS, PROCS, HOURS_PER_DAY, WD, HOLIDAYS,
        get data() { return data; }, reset,
        util: { pad, toStr, parse, addDays, range, dow, fmtMD, fmtMDW, fmtMonth, fmtYM, monthOf, monthDays, shiftMonth, weekStartOf, dayInfo, capacity, vacationOf, el, esc, colorVars },
        model: { keyOf, start, end, planned, actualMap, actualTotal, estimateOf, schedulesOf, statusOf, isDelayed, STATUS_LABEL, short, taskOf, procLabel, plannedOn, actualOn, plannedTotalOn, deriveMonths, deriveState, nextBusinessDays },
        ops: { moveHours, applyDerived },
        renderGantt, renderWeekLoad, renderGrid, renderInspector, renderDerive, renderAgenda, toast, mount,
    };
})();
