/* ============================================================
   見積「工程ごとの作業月」設定 UI 刷新 — 比較モックアップ共通スクリプト
   ・共通シナリオ（8 行の見積、作業期間 2026-08〜11）
   ・モーダル骨格（作業期間 / 工程表 / 合計 / 保存）
   ・操作回数のログと、共通課題 4 項目の自動判定
   ・「保存されるデータ」（workMonths / monthlyHours）のライブ表示
   各案は WM.init({ renderControl(row, api) }) で作業月セルの描き方だけを差し替える。
   案C のように表そのものを差し替える場合は renderTable(api) を渡す。
   ============================================================ */
window.WM = (function () {
    'use strict';

    // ---------- 月ユーティリティ ----------
    const pad = n => String(n).padStart(2, '0');
    const monthRange = (a, b) => {
        const out = [];
        let [y, m] = a.split('-').map(Number);
        const [y2, m2] = b.split('-').map(Number);
        while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } }
        return out;
    };
    const MONTH_OPTIONS = monthRange('2026-06', '2027-03');
    const fmtMonth = m => `${Number(m.slice(5))}月`;
    const fmtMonthLong = m => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
    const fmtRange = ms => !ms.length ? '（未設定）' : ms.length === 1 ? fmtMonth(ms[0]) : `${Number(ms[0].slice(5))}〜${fmtMonth(ms[ms.length - 1])}`;
    const fmtH = n => (Math.round(n * 100) / 100) + 'h';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

    /** 0.25h 刻みで合計が崩れないように均等按分（本番では既存 splitHoursEvenly を使う想定） */
    function evenSplit(hours, n) {
        if (!n) return [];
        const step = 0.25;
        const units = Math.round((Number(hours) || 0) / step);
        const base = Math.floor(units / n);
        const rem = units - base * n;
        return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) * step);
    }

    // ---------- 共通シナリオ ----------
    const MEMBERS = ['田中', '佐藤', '鈴木', '高橋'];
    const seed = () => ({
        start: '2026-08', end: '2026-11',
        rows: [
            { id: 'ui',    process: 'UI', member: '田中', hours: 16, months: ['2026-08'] },
            { id: 'pg',    process: 'PG', member: '田中', hours: 60, months: ['2026-09'] },
            { id: 'pg-m2', process: 'PG', member: '佐藤', hours: 40, months: ['2026-09'], extra: true, linked: true },
            { id: 'pg-r',  process: 'PG', member: '鈴木', hours: 8,  months: ['2026-09'], extra: true, linked: true, isReview: true },
            { id: 'pt',    process: 'PT', member: '田中', hours: 24, months: ['2026-10'] },
            { id: 'pt-r',  process: 'PT', member: '鈴木', hours: 4,  months: ['2026-10'], extra: true, linked: true, isReview: true },
            { id: 'it',    process: 'IT', member: '佐藤', hours: 16, months: ['2026-10'] },
            { id: 'st',    process: 'ST', member: '鈴木', hours: 16, months: ['2026-11'] },
        ],
    });
    const BASE_HOURS = { ui: 16, pg: 60, 'pg-m2': 40, 'pg-r': 8, pt: 24, 'pt-r': 4, it: 16, st: 16 };

    const NAV = [
        { key: 'current', href: 'current.html',       label: '現状',                 sub: '開始〜終了の select（比較基準）' },
        { key: 'a',       href: 'a-month-chips.html',  label: '案A 月チップ',          sub: 'タップで 1 月、なぞって範囲' },
        { key: 'b',       href: 'b-mini-gantt.html',   label: '案B ミニガント',        sub: 'バーを動かす・伸ばす' },
        { key: 'c',       href: 'c-hours-matrix.html', label: '案C 工程×月マトリクス', sub: '月ごとの工数を直接入力' },
    ];

    // ---------- 状態 ----------
    let cfg = null, state = seed(), steps = [], mobile = false, embed = false, pendingFocus = null, saved = false;
    let frameEl = null, logEl = null, stageEl = null;
    let uid = 0;

    const months = () => monthRange(state.start, state.end);
    const rowById = id => state.rows.find(r => r.id === id);
    const primaryOf = row => state.rows.find(r => r.process === row.process && !r.extra) || row;
    const isLinked = row => !cfg.noLink && !!row.extra && !!row.linked;
    const effectiveMonths = row => isLinked(row) ? primaryOf(row).months.slice() : row.months.slice();
    const rowLabel = row => `${row.process}${row.isReview ? ' レビュー' : ''} ${row.member || '（担当未設定）'}`;
    /** 行の月別工数。手動配分（案C）があればそれ、無ければ均等按分 */
    function monthly(row) {
        const ms = effectiveMonths(row);
        if (row.manual && !isLinked(row) && eq(Object.keys(row.manual).sort(), ms)) return { ...row.manual };
        const parts = evenSplit(row.hours, ms.length);
        return Object.fromEntries(ms.map((m, i) => [m, parts[i]]));
    }

    // ---------- 操作ログ ----------
    const stepCount = () => steps.filter(s => s.n).length;
    /** タップ換算: 1 タップ・1 ドラッグ = 1、select の変更（開く＋選ぶ）とセル入力（触る＋打つ）= 2 */
    const tapCount = () => steps.reduce((a, s) => a + (s.n ? s.w : 0), 0);
    function step(text, weight = 1) { steps.unshift({ n: stepCount() + 1, text, w: weight }); }
    function note(text) { steps.unshift({ n: null, text, w: 0 }); }

    // ---------- 状態変更（各案から呼ぶ API） ----------
    function setMonths(id, ms, verb, opts = {}) {
        const row = rowById(id); if (!row) return;
        const before = fmtRange(row.months);
        row.months = ms.slice().sort(); row.manual = null;
        step(`${verb}: ${rowLabel(row)} ${before} → ${fmtRange(row.months)}`, opts.weight || 1);
        pendingFocus = opts.focus ? { id, sel: opts.focus } : null;
        render();
    }
    function setManual(id, map, verb) {
        const row = rowById(id); if (!row) return;
        const ms = Object.keys(map).filter(m => Number(map[m]) > 0).sort();
        row.months = ms;
        row.manual = Object.fromEntries(ms.map(m => [m, Number(map[m])]));
        row.hours = Math.round(ms.reduce((a, m) => a + Number(map[m]), 0) * 100) / 100;
        step(verb, 2);
        render();
    }
    function toggleLink(id) {
        const row = rowById(id); if (!row || !row.extra) return;
        if (row.linked) {
            row.months = primaryOf(row).months.slice(); row.linked = false;
            step(`連動を外す: ${rowLabel(row)}（${fmtRange(row.months)} から個別に設定）`);
        } else {
            row.linked = true; row.manual = null;
            step(`連動に戻す: ${rowLabel(row)} → ${row.process} と同じ ${fmtRange(primaryOf(row).months)}`);
        }
        render();
    }
    function setHours(id, h, verb = '時間') {
        const row = rowById(id); if (!row) return;
        row.hours = h === '' ? '' : Number(h); row.manual = null;
        step(`${verb}: ${rowLabel(row)} = ${h === '' ? '（空）' : fmtH(Number(h))}`, verb === '均等に配分' ? 1 : 2);
        render();
    }
    function setMember(id, v) {
        const row = rowById(id); if (!row) return;
        row.member = v; step(`担当: ${row.process}${row.isReview ? ' レビュー' : ''} → ${v || '-'}`, 2); render();
    }
    function setPeriod(start, end) {
        if (start > end) { if (start !== state.start) end = start; else start = end; }
        state.start = start; state.end = end;
        const ms = months();
        state.rows.forEach(r => {
            if (!r.months.length) return;
            const kept = r.months.filter(m => ms.includes(m));
            if (kept.length === r.months.length) return;
            const fallback = kept.length ? kept : [r.months[0] < ms[0] ? ms[0] : ms[ms.length - 1]];
            note(`期間外になった月を寄せました: ${rowLabel(r)} ${fmtRange(r.months)} → ${fmtRange(fallback)}`);
            r.months = fallback; r.manual = null;
        });
        step(`作業期間: ${fmtMonthLong(state.start)} 〜 ${fmtMonthLong(state.end)}（${ms.length}ヶ月）`, 2);
        render();
    }
    function addRow(processName, isReview) {
        const primary = state.rows.find(r => r.process === processName && !r.extra);
        let idx = state.rows.length - 1;
        for (let i = state.rows.length - 1; i >= 0; i--) if (state.rows[i].process === processName) { idx = i; break; }
        state.rows.splice(idx + 1, 0, { id: `new-${++uid}`, process: processName, member: '', hours: '', months: primary.months.slice(), extra: true, linked: true, isReview });
        step(`${isReview ? 'レビュー行' : '担当者行'}を追加: ${processName}（${processName} の月に連動）`);
        render();
    }
    function removeRow(id) {
        const row = rowById(id); if (!row || !row.extra) return;
        state.rows = state.rows.filter(r => r.id !== id);
        step(`行を削除: ${rowLabel(row)}`); render();
    }
    function reset() { state = seed(); steps = []; saved = false; render(); }

    // ---------- 共通課題 ----------
    const eff = id => { const r = rowById(id); return r ? effectiveMonths(r) : []; };
    const TASKS = [
        { label: 'PG の田中・佐藤を 8〜10月（3ヶ月）にする',
          ok: () => eq(eff('pg'), ['2026-08', '2026-09', '2026-10']) && eq(eff('pg-m2'), ['2026-08', '2026-09', '2026-10']) },
        { label: 'PG のレビュー（鈴木）は 10月だけにする', ok: () => eq(eff('pg-r'), ['2026-10']) },
        { label: 'IT（佐藤）を 10月から 11月へ動かす', ok: () => eq(eff('it'), ['2026-11']) },
        { label: 'ほかの行の月と、各行の合計時間は変えない',
          ok: () => eq(eff('ui'), ['2026-08']) && eq(eff('pt'), ['2026-10']) && eq(eff('pt-r'), ['2026-10']) && eq(eff('st'), ['2026-11'])
                 && state.rows.length === 8
                 && Object.entries(BASE_HOURS).every(([id, h]) => Math.abs((Number(rowById(id)?.hours) || 0) - h) < 0.001) },
    ];

    // ---------- 描画 ----------
    function render() {
        /* 再描画でモーダル本文のスクロール位置が戻らないように保持（本実装でも部分更新か位置復元が必要） */
        const prevBody = frameEl.querySelector('.wm-modal-body');
        const scrollTop = prevBody ? prevBody.scrollTop : 0;
        renderFrame();
        const body = frameEl.querySelector('.wm-modal-body');
        if (body && scrollTop) body.scrollTop = scrollTop;
        renderLog();
        if (pendingFocus) {
            const target = frameEl.querySelector(`[data-id="${pendingFocus.id}"] ${pendingFocus.sel}`);
            if (target) target.focus({ preventScroll: true });
            pendingFocus = null;
        }
    }

    function renderFrame() {
        frameEl.className = 'mk-frame' + (mobile ? ' is-mobile' : '');
        if (stageEl) stageEl.classList.toggle('is-mobile', mobile);
        frameEl.innerHTML = `
            <div class="mk-app-header">工数管理 <span>見積</span></div>
            <div class="mk-app-ghost"><i></i><i></i><i></i><i></i></div>
            <div class="mk-dock" aria-hidden="true">
                <span class="is-active"><i></i>見積</span><span><i></i>実績</span><span><i></i>レポート</span><span><i></i>予定</span><span><i></i>設定</span>
            </div>`;
        frameEl.appendChild(buildModal());
    }

    function buildModal() {
        const modal = el(`
            <div class="wm-modal" role="dialog" aria-modal="true" aria-labelledby="wmTitle">
              <div class="wm-modal-content">
                <div class="wm-modal-header">
                  <div><h3 id="wmTitle">全工程を編集</h3><div class="wm-modal-sub">V2.4　帳票A出力改修</div></div>
                  <button type="button" class="modal-close" aria-label="閉じる">&times;</button>
                </div>
                <div class="wm-modal-body"></div>
                <div class="wm-modal-footer">
                  <button type="button" class="btn btn-primary" id="wmSave">保存</button>
                  <button type="button" class="btn wm-cancel">キャンセル</button>
                </div>
              </div>
            </div>`);
        const body = modal.querySelector('.wm-modal-body');
        body.appendChild(buildPeriod());
        body.appendChild(cfg.renderTable ? cfg.renderTable(api) : buildTable());
        body.appendChild(buildTotals());
        modal.querySelector('#wmSave').addEventListener('click', () => { saved = true; note('保存: 右の「保存されるデータ」を開きました（モックなので閉じません）'); renderLog(); });
        modal.querySelector('.wm-cancel').addEventListener('click', () => note('キャンセル（モックなので閉じません）') || renderLog());
        modal.querySelector('.modal-close').addEventListener('click', () => note('閉じる（モックなので閉じません）') || renderLog());
        return modal;
    }

    function buildPeriod() {
        const wrap = el(`
            <div>
              <div class="wm-period">
                <label for="wmStart">作業期間</label>
                <select id="wmStart" aria-label="開始月"></select><span aria-hidden="true">〜</span><select id="wmEnd" aria-label="終了月"></select>
                <span class="wm-period-len"></span>
              </div>
              <div class="wm-period-hint"></div>
            </div>`);
        const opts = v => MONTH_OPTIONS.map(m => `<option value="${m}"${m === v ? ' selected' : ''}>${fmtMonthLong(m)}</option>`).join('');
        const s = wrap.querySelector('#wmStart'), e = wrap.querySelector('#wmEnd');
        s.innerHTML = opts(state.start); e.innerHTML = opts(state.end);
        wrap.querySelector('.wm-period-len').textContent = `${months().length}ヶ月`;
        wrap.querySelector('.wm-period-hint').innerHTML = cfg.periodHint
            || '各工程の月はこの範囲から選びます。担当者行・レビュー行は工程の月に連動し、鎖のボタンで個別に設定できます。';
        s.addEventListener('change', () => setPeriod(s.value, state.end));
        e.addEventListener('change', () => setPeriod(state.start, e.value));
        return wrap;
    }

    function buildTable() {
        const t = el('<div class="wm-table" role="table" aria-label="各工程の見積"></div>');
        t.appendChild(el(`<div class="wm-head" role="row"><div>工程</div><div>担当</div><div>時間</div><div class="wm-c-rail${cfg.noLink ? ' no-link' : ''}">作業月</div><div></div></div>`));
        state.rows.forEach(row => t.appendChild(buildRow(row)));
        return t;
    }

    const ICON_LINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M9 17H7A5 5 0 0 1 7 7h2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    const ICON_UNLINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7h1a5 5 0 0 1 0 10h-1"/><path d="M8 17H7A5 5 0 0 1 7 7h1"/><line x1="12" y1="9" x2="12" y2="15" stroke-dasharray="2 2"/></svg>';

    function buildLinkBtn(row) {
        const linked = isLinked(row);
        const b = el(`<button type="button" class="wm-link${linked ? '' : ' is-off'}" aria-pressed="${linked}"></button>`);
        b.innerHTML = linked ? ICON_LINK : ICON_UNLINK;
        b.title = linked ? `${row.process} の月に連動中（押すと個別に設定）` : `個別に設定中（押すと ${row.process} の月に合わせる）`;
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', () => toggleLink(row.id));
        return b;
    }

    function buildRow(row) {
        const r = el(`<div class="wm-row${row.extra ? ' is-extra' : ''}${row.isReview ? ' is-review' : ''}" data-id="${row.id}" role="row"></div>`);
        const proc = el('<div class="wm-c-proc"></div>');
        proc.innerHTML = row.extra
            ? (row.isReview ? '<span class="wm-review-tag">レビュー</span>' : '<span class="wm-indent" aria-hidden="true">↳</span>')
            : `<span class="badge badge-${row.process.toLowerCase()}">${row.process}</span>`;

        const mem = el('<div class="wm-c-member"><select aria-label="担当"></select></div>');
        const sel = mem.querySelector('select');
        sel.innerHTML = '<option value="">-</option>' + MEMBERS.map(m => `<option${m === row.member ? ' selected' : ''}>${m}</option>`).join('');
        sel.addEventListener('change', () => setMember(row.id, sel.value));

        const hrs = el(`<div class="wm-c-hours"><input type="number" step="0.25" min="0" inputmode="decimal" placeholder="h" aria-label="時間" value="${row.hours === '' ? '' : row.hours}"></div>`);
        hrs.querySelector('input').addEventListener('change', ev => setHours(row.id, ev.target.value));

        const railWrap = el(`<div class="wm-c-rail${cfg.noLink ? ' no-link' : ''}"></div>`);
        if (!cfg.noLink) railWrap.appendChild(row.extra ? buildLinkBtn(row) : el('<span class="wm-link-slot" aria-hidden="true"></span>'));
        railWrap.appendChild(cfg.renderControl(row, api));
        railWrap.appendChild(buildMeta(row));

        const add = el('<div class="wm-c-add"></div>');
        if (!row.extra) {
            add.innerHTML = '<button type="button" class="est-add-member-btn" title="担当者を追加">+</button><button type="button" class="est-add-member-btn est-add-review-btn" title="レビュー行を追加">+R</button>';
            add.children[0].addEventListener('click', () => addRow(row.process, false));
            add.children[1].addEventListener('click', () => addRow(row.process, true));
        } else {
            add.innerHTML = '<button type="button" class="wm-remove" title="この行を削除" aria-label="この行を削除">×</button>';
            add.children[0].addEventListener('click', () => removeRow(row.id));
        }
        r.append(proc, mem, hrs, railWrap, add);
        return r;
    }

    function buildMeta(row) {
        const ms = effectiveMonths(row);
        const n = ms.length;
        const h = Number(row.hours) || 0;
        /* 均等按分は「約 13.3h/月」（0.25h 刻みの丸め差は保存データで確認）。手動配分（案C）は明示 */
        const avg = n ? h / n : 0;
        const perText = (Number.isInteger(avg * 4) ? '' : '約') + (Math.round(avg * 10) / 10) + 'h/月';
        let text = '';
        if (isLinked(row)) text = `${row.process} と同じ` + (n > 1 ? `・${perText}` : '');
        else if (n > 1) text = `${n}ヶ月・${row.manual ? '手動配分' : perText}`;
        return el(`<span class="wm-meta">${esc(text)}</span>`);
    }

    function buildTotals() {
        const total = state.rows.reduce((a, r) => a + (Number(r.hours) || 0), 0);
        return el(`<div class="wm-totals"><span>対応合計</span><b>${fmtH(total)}</b><span>${(total / 8).toFixed(1)}人日</span><span>${(total / 160).toFixed(2)}人月</span></div>`);
    }

    function dataDump() {
        return state.rows.map(r => {
            const mo = monthly(r);
            const ms = Object.keys(mo);
            return `${(r.process + (r.isReview ? '(R)' : '')).padEnd(5)} ${(r.member || '-').padEnd(3, '　')} ${String(r.hours || 0).padStart(4)}h  workMonths=[${ms.join(', ')}]  monthlyHours={${ms.map(m => `${m.slice(5)}: ${mo[m]}`).join(', ')}}`;
        }).join('\n');
    }

    function renderLog() {
        const done = TASKS.filter(t => t.ok()).length;
        const checks = `<ul class="mk-checks">${TASKS.map(t => { const ok = t.ok(); return `<li class="${ok ? 'is-ok' : ''}"><i>${ok ? '✓' : ''}</i><span>${esc(t.label)}</span></li>`; }).join('')}</ul>`;
        if (embed) {
            logEl.innerHTML = `
                <div class="mk-steps"><b>${stepCount()}</b><span>回の操作（タップ換算 ${tapCount()}）・課題 ${done}/${TASKS.length} 達成</span></div>
                ${checks}
                <ul class="mk-events">${steps.slice(0, 6).map(s => `<li class="${s.n ? '' : 'is-note'}"><b>${s.n ?? '·'}</b><span>${esc(s.text)}</span></li>`).join('')}</ul>
                <button type="button" class="btn btn-secondary btn-sm" id="mkReset">リセット</button>`;
            return;
        }
        logEl.innerHTML = `
            <div><h4>操作回数</h4><div class="mk-steps"><b>${stepCount()}</b><span>回の操作（タップ換算 <b class="mk-taps">${tapCount()}</b>）<br>タップ・ドラッグ = 1、select の変更・セル入力 = 2 で換算</span></div></div>
            <div><h4>課題の達成度 ${done}/${TASKS.length}</h4>${checks}</div>
            <div><h4>操作ログ</h4><ul class="mk-events">${steps.slice(0, 16).map(s => `<li class="${s.n ? '' : 'is-note'}"><b>${s.n ?? '·'}</b><span>${esc(s.text)}</span></li>`).join('') || '<li class="is-note"><b>·</b><span>まだ操作していません</span></li>'}</ul></div>
            <details class="mk-data"${saved ? ' open' : ''}><summary>保存されるデータ（workMonths / monthlyHours）</summary><pre>${esc(dataDump())}</pre></details>
            <button type="button" class="btn btn-secondary btn-sm" id="mkReset">リセット</button>`;
    }

    // ---------- 初期化 ----------
    function init(config) {
        cfg = config;
        const q = new URLSearchParams(location.search);
        mobile = q.get('w') === 'mobile';
        embed = q.get('embed') === '1';
        const root = document.getElementById('mk-root');
        if (embed) {
            document.body.classList.add('is-embed');
            root.innerHTML = '<div class="mk-embed"><div class="mk-frame"></div><aside class="mk-log mk-log-compact"></aside></div>';
        } else {
            root.innerHTML = `
                <div class="mk-wrap">
                  <div class="mk-top"><div>
                    <a class="mk-crumb" href="index.html">← 案の一覧・比較表へ</a>
                    <h1 class="mk-h1">${esc(cfg.title)}</h1>
                    <p class="mk-lead">${cfg.lead}</p>
                  </div></div>
                  <nav class="mk-nav">${NAV.map(n => `<a href="${n.href}" class="${n.key === cfg.key ? 'is-active' : ''}">${n.label}<small>${n.sub}</small></a>`).join('')}</nav>
                  <section class="mk-scenario">
                    <div class="mk-scenario-label">共通の課題（4 つとも満たすまでの操作回数を比べる）</div>
                    <div class="mk-scenario-text">V2.4 帳票A出力改修の見積。作業期間は <b>2026年8月〜11月</b>。PG には田中・佐藤の 2 人とレビュー（鈴木）が付いている。初期値はウォーターフォール式の既定（UI=8月, PG=9月, PT・IT=10月, ST=11月）。</div>
                    <ol class="mk-task-list">${TASKS.map(t => `<li>${esc(t.label)}</li>`).join('')}</ol>
                  </section>
                  <div class="mk-toolbar">
                    <div class="mk-hint">${cfg.hint}</div>
                    <div class="mk-width" role="group" aria-label="表示幅"><button type="button" data-w="pc">PC</button><button type="button" data-w="mobile">スマホ 390px</button></div>
                  </div>
                  <div class="mk-stage"><div class="mk-frame"></div><aside class="mk-log" aria-live="polite"></aside></div>
                </div>`;
            stageEl = root.querySelector('.mk-stage');
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
        logEl = root.querySelector('.mk-log');
        logEl.addEventListener('click', e => { if (e.target.id === 'mkReset') reset(); });
        render();
    }

    const api = {
        get state() { return state; },
        months, effectiveMonths, monthly, isLinked, primaryOf, rowById, rowLabel,
        setMonths, setManual, setHours, setMember, toggleLink, addRow, removeRow, step, note, render,
        isMobile: () => mobile,
        buildLinkBtn,
        fmtMonth, fmtMonthLong, fmtRange, fmtH, evenSplit, eq, el, esc, MONTH_OPTIONS, MEMBERS,
    };
    return { init, api };
})();
