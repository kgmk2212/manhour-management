// ============================================
// 実績の一括変更 — UI（選択状態・選択バー・条件で選択・一括編集/複製モーダル）
//   純粋ロジックは js/actual-bulk-core.js
// ============================================

import {
    actuals, estimates, setActuals,
    actualSelectionMode, setActualSelectionMode, selectedActualIds,
    memberOrder, nextId,
} from './state.js';
import { formatHours, escapeHtml, showAlert, sortMembers } from './utils.js';
import { PROCESS, BULK_EDIT } from './constants.js';
import { pushAction, undo } from './history.js';
import { applyBulkPatch, summarizeField, displayValue, deleteActuals, duplicateActuals, isValidDateString, findByCondition, taskOptionsForVersions } from './actual-bulk-core.js';

const $ = (id) => document.getElementById(id);

// ============================================
// 選択状態
// ============================================

/** 表示中の一覧行を DOM 順で返す（Shift 範囲選択と全選択に使う） */
function visibleRowIds() {
    return [...document.querySelectorAll('#actualList tr[data-actual-id]')].map(tr => Number(tr.dataset.actualId));
}

let lastClickedId = null;

/** 選択モードのオン/オフ。オフにするときだけ選択もクリア（オンにする際はタイムライン等での選択を保つ） */
export function toggleActualSelectionMode() {
    setActualSelectionMode(!actualSelectionMode);
    if (!actualSelectionMode) {
        selectedActualIds.clear();
        lastClickedId = null;
    }
    closeActualConditionPopover();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    updateActualSelectionUI();
}

/**
 * 一覧の行クリック。Shift で直前クリック行との範囲選択
 * @param {number} id
 * @param {MouseEvent} [event]
 */
export function toggleActualSelection(id, event) {
    if (!actualSelectionMode) return;
    if (event) event.stopPropagation();
    const ids = visibleRowIds();
    if (event && event.shiftKey && lastClickedId !== null && ids.includes(lastClickedId) && ids.includes(id)) {
        const [a, b] = [ids.indexOf(lastClickedId), ids.indexOf(id)].sort((x, y) => x - y);
        ids.slice(a, b + 1).forEach(x => selectedActualIds.add(x));
    } else if (selectedActualIds.has(id)) {
        selectedActualIds.delete(id);
    } else {
        selectedActualIds.add(id);
    }
    lastClickedId = id;
    updateActualSelectionUI();
}

/** ヘッダーの ✓: 表示中を全選択／全解除 */
export function toggleAllVisibleActuals(event) {
    if (event) event.stopPropagation();
    const ids = visibleRowIds();
    const all = ids.length > 0 && ids.every(x => selectedActualIds.has(x));
    ids.forEach(x => all ? selectedActualIds.delete(x) : selectedActualIds.add(x));
    updateActualSelectionUI();
}

/** 選択を全解除（選択モード自体は維持） */
export function clearActualSelection() {
    selectedActualIds.clear();
    lastClickedId = null;
    updateActualSelectionUI();
}

/**
 * id 群を選択に加える（タイムライン・条件から使う）
 * @param {number[]} ids
 * @param {{ replace?: boolean }} [opt] true なら現在の選択を置き換える
 */
export function selectActualIds(ids, { replace = false } = {}) {
    if (replace) selectedActualIds.clear();
    ids.forEach(x => selectedActualIds.add(Number(x)));
    updateActualSelectionUI();
}

/**
 * id 群を選択から外す（タイムライン・条件から使う）
 * @param {number[]} ids
 */
export function deselectActualIds(ids) {
    ids.forEach(x => selectedActualIds.delete(Number(x)));
    updateActualSelectionUI();
}

/** 選択中の実績レコード（存在しない id は無視） */
export function getSelectedActuals() {
    return actuals.filter(a => selectedActualIds.has(a.id));
}

/** バー/ブロック要素が持つ実績 id（ガントの単一 data-actual-id か複数 data-actual-ids のカンマ区切り） */
function barElementIds(el) {
    return (el.dataset.actualIds || el.dataset.actualId || '').split(',').filter(Boolean).map(Number);
}

/**
 * モバイルの固定タブ Dock（#mobileTabBar）の高さを CSS 変数 --bulk-dock-offset に反映する。
 * 選択バー（sticky）と Undo トースト（fixed）はビューポート下端基準で位置するため、
 * Dock 表示中はその高さ分（safe-area 込み = offsetHeight）を bottom に足して重なりを避ける。
 */
function syncBulkDockOffset() {
    const dock = $('mobileTabBar');
    const shown = !!dock && getComputedStyle(dock).display !== 'none';
    document.documentElement.style.setProperty('--bulk-dock-offset', shown ? `${dock.offsetHeight}px` : '0px');
}
let dockOffsetResizeBound = false;

/** 選択バー・一覧の行・タイムラインのバーの見た目を状態に合わせる（再描画はしない） */
export function updateActualSelectionUI() {
    syncBulkDockOffset();
    if (!dockOffsetResizeBound) {
        dockOffsetResizeBound = true;
        window.addEventListener('resize', syncBulkDockOffset);
    }
    const viewType = $('actualViewType')?.value;
    const selected = getSelectedActuals();
    const n = selected.length;

    // 実在しない id を掃除
    const alive = new Set(actuals.map(a => a.id));
    [...selectedActualIds].forEach(x => { if (!alive.has(x)) selectedActualIds.delete(x); });

    // 選択モード OFF でもリストで n > 0 ならトレイを出す（バー選択→リスト切替時に選択を隠さない）
    const tray = $('actualSelectionTray');
    if (tray) tray.style.display = ((actualSelectionMode && viewType === 'list') || viewType === 'timeline' || (viewType === 'list' && n > 0)) ? 'flex' : 'none';

    const modeBtn = $('btnActualSelectionMode');
    if (modeBtn) {
        modeBtn.classList.toggle('is-on', actualSelectionMode);
        modeBtn.textContent = actualSelectionMode ? '✓ 選択モード' : '選択モード';
    }
    // ボタンではなくラッパーを隠す（ボタンだけ隠すと margin 分の空白が残る）
    const toolbar = $('actualSelectionToolbar');
    if (toolbar) toolbar.style.display = viewType === 'list' ? 'flex' : 'none';

    const count = $('actualSelectionCount');
    if (count) {
        count.innerHTML = n
            ? `${n} 件選択中<span class="bk-bar-sub"> · 合計 ${formatHours(selected.reduce((s, a) => s + a.hours, 0))}h</span>`
            : `0 件選択中<span class="bk-bar-sub"> · ${viewType === 'timeline' ? 'バーをクリックして選択' : '行をクリックして選択'}</span>`;
    }
    ['btnBulkActualEdit', 'btnBulkActualCopy', 'btnBulkActualDelete', 'btnBulkActualClear'].forEach(id => { const b = $(id); if (b) b.disabled = n === 0; });

    // 一覧の行
    document.querySelectorAll('#actualList tr[data-actual-id]').forEach(tr => {
        const on = selectedActualIds.has(Number(tr.dataset.actualId));
        tr.classList.toggle('is-selected', on);
        const cb = tr.querySelector('input.bk-cb'); if (cb) cb.checked = on;
    });
    const all = $('actualSelectAll');
    if (all) { const ids = visibleRowIds(); all.checked = ids.length > 0 && ids.every(x => selectedActualIds.has(x)); }

    // タイムラインのバー・日別ビューのブロック（全 id が選択済みなら selected）
    document.querySelectorAll('.actual-tl-bar.actual[data-actual-ids], .actual-tl-dv-block[data-actual-id]').forEach(bar => {
        const ids = barElementIds(bar);
        bar.classList.toggle('selected', ids.length > 0 && ids.every(x => selectedActualIds.has(x)));
    });

    if (condOpen) updateActualConditionHits();
}

// ============================================
// 条件で選択（ポップオーバー）
// ============================================

let condOpen = false;

/** 条件で選択ポップオーバーが開いているか */
export const isActualConditionOpen = () => condOpen;

/** 現在の条件（DOM から読む） */
export function getActualCondition() {
    return {
        from: $('actualCondFrom')?.value || '', to: $('actualCondTo')?.value || '',
        member: $('actualCondMember')?.value || '', version: $('actualCondVersion')?.value || '',
        task: $('actualCondTask')?.value || '', process: $('actualCondProcess')?.value || '',
    };
}

function fillConditionOptions() {
    const keep = (sel) => sel.value;
    const m = $('actualCondMember'); const mv = keep(m);
    m.innerHTML = `<option value="">指定なし</option>${opt(memberOptions(), mv)}`;
    const v = $('actualCondVersion'); const vv = keep(v);
    v.innerHTML = `<option value="">指定なし</option><option value="__none__" ${vv === '__none__' ? 'selected' : ''}>（なし = その他工数）</option>${opt(versionOptions(), vv)}`;
    const t = $('actualCondTask'); const tv = keep(t);
    t.innerHTML = `<option value="">指定なし</option>${opt(taskOptions(null), tv)}`;
    const p = $('actualCondProcess'); const pv = keep(p);
    p.innerHTML = `<option value="">指定なし</option>${opt(PROCESS.TYPES, pv)}`;
}

/** 現在の表示形式で画面に出ている実績 id（リスト: 行、タイムライン: バー） */
function visibleActualIdsForView() {
    if ($('actualViewType')?.value === 'timeline') {
        return new Set([...document.querySelectorAll('.actual-tl-bar.actual[data-actual-ids]')]
            .flatMap(bar => bar.dataset.actualIds.split(',').filter(Boolean).map(Number)));
    }
    return new Set(visibleRowIds());
}

/** 該当件数・合計・表示外注記・一覧ハイライトを更新 */
export function updateActualConditionHits() {
    if (!condOpen) return;
    const hits = findByCondition(actuals, getActualCondition());
    const visible = visibleActualIdsForView();
    const hidden = hits.filter(a => !visible.has(a.id)).length;
    const box = $('actualCondHits');
    box.classList.toggle('is-zero', hits.length === 0);
    box.innerHTML = `該当<b>${hits.length}</b>件${hits.length ? ` · ${formatHours(hits.reduce((s, a) => s + a.hours, 0))}h` : ' — 条件を広げてください'}${hidden ? `<span class="bk-pop-note">表示外 ${hidden} 件を含む</span>` : ''}`;
    $('btnActualConditionAdd').disabled = hits.length === 0;
    $('btnActualConditionReplace').disabled = hits.length === 0;
    const hitIds = new Set(hits.map(a => a.id));
    document.querySelectorAll('#actualList tr[data-actual-id]').forEach(tr => tr.classList.toggle('is-hit', hitIds.has(Number(tr.dataset.actualId))));
    document.querySelectorAll('.actual-tl-bar.actual[data-actual-ids], .actual-tl-dv-block[data-actual-id]').forEach(bar => {
        const ids = barElementIds(bar);
        bar.classList.toggle('is-hit', ids.length > 0 && ids.every(x => hitIds.has(x)));
    });
}

/** 条件で選択ポップオーバーの開閉トグル */
export function toggleActualConditionPopover() {
    if (condOpen) { closeActualConditionPopover(); return; }
    condOpen = true;
    fillConditionOptions();
    $('actualConditionPopover').style.display = 'block';
    $('btnBulkActualCondition').classList.add('is-on');
    updateActualConditionHits();
}

/** 条件で選択ポップオーバーを閉じ、一覧・タイムラインの is-hit ハイライトを消す */
export function closeActualConditionPopover() {
    condOpen = false;
    const pop = $('actualConditionPopover'); if (pop) pop.style.display = 'none';
    const b = $('btnBulkActualCondition'); if (b) b.classList.remove('is-on');
    document.querySelectorAll('#actualList tr.is-hit, .actual-tl-bar.is-hit, .actual-tl-dv-block.is-hit').forEach(el => el.classList.remove('is-hit'));
}

/**
 * 条件に合う実績を選択へ
 * @param {'add'|'replace'} mode add=和集合、replace=置き換え
 */
export function applyActualCondition(mode) {
    const hits = findByCondition(actuals, getActualCondition());
    if (!hits.length) return;
    selectActualIds(hits.map(a => a.id), { replace: mode === 'replace' });
    closeActualConditionPopover();
}

/** 条件入力のイベント登録（initEventHandlers から呼ぶ） */
export function initActualConditionEvents() {
    ['actualCondMember', 'actualCondVersion', 'actualCondTask', 'actualCondProcess'].forEach(id => {
        const el = $(id); if (el) el.addEventListener('change', updateActualConditionHits);
    });
    ['actualCondFrom', 'actualCondTo'].forEach(id => {
        const el = $(id); if (el) el.addEventListener('input', updateActualConditionHits);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && condOpen) closeActualConditionPopover(); });
    // 外クリックで閉じる（テキスト選択ドラッグで誤爆しないよう mousedown 時点の位置で判定）
    document.addEventListener('mousedown', (e) => {
        if (!condOpen) return;
        const pop = $('actualConditionPopover');
        if (pop && pop.contains(e.target)) return;
        // トグルボタン自身は自前の click で開閉するため、ここでは閉じない
        const btn = $('btnBulkActualCondition');
        if (btn && btn.contains(e.target)) return;
        closeActualConditionPopover();
    });
}

// ============================================
// 一括編集モーダル
// ============================================

const FIELD_LABEL = { date: '日付', version: '版数', task: '対応名', process: '工程', member: '担当', isReview: 'レビュー', hours: '工数' };

/** モーダル内で編集中のパッチ（UI 状態）。適用時に BulkPatch へ変換する */
let ui = null;

function newPatchUI() {
    return {
        version: { on: false, val: '' }, task: { on: false, val: '', free: '' }, process: { on: false, val: '' },
        member: { on: false, val: '' }, isReview: 'keep', date: { mode: 'keep', value: '', days: BULK_EDIT.DEFAULT_SHIFT_DAYS },
    };
}

/** 版数一覧（見積＋実績）。空版数は含めない */
function versionOptions() {
    return [...new Set([...estimates.map(e => e.version), ...actuals.map(a => a.version)].filter(Boolean))].sort();
}
/** 対応名候補。versions が null なら全体、'' はその他工数（版数なし）由来 */
function taskOptions(versions) {
    return taskOptionsForVersions(estimates, actuals, versions);
}
/**
 * 対応名の候補を絞る版数。版数を「変更する」ならその版数、変更しないなら対象実績が持つ版数
 * （版数をまたぐ対応名が候補に混ざらないようにする）
 * @param {object[]} targets 一括編集の対象実績
 * @returns {string[]}
 */
function taskScopeVersions(targets) {
    if (ui.version.on) return [ui.version.val];
    return [...new Set(targets.map(a => a.version ?? ''))];
}
function memberOptions() {
    return sortMembers([...new Set([...estimates.map(e => e.member), ...actuals.map(a => a.member)].filter(Boolean))], memberOrder || '');
}
const opt = (arr, cur, labelFn) => arr.map(v => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(labelFn ? labelFn(v) : v)}</option>`).join('');

/** UI 状態 → BulkPatch（core の入力形） */
function toBulkPatch(u) {
    const p = {};
    if (u.version.on) p.version = { set: u.version.val };
    if (u.task.on) p.task = { set: u.task.val === '__free__' ? u.task.free.trim() : u.task.val };
    if (u.process.on) p.process = { set: u.process.val };
    if (u.member.on) p.member = { set: u.member.val };
    if (u.isReview !== 'keep') p.isReview = u.isReview;
    if (u.date.mode === 'set') p.date = { mode: 'set', value: u.date.value };
    if (u.date.mode === 'shift') p.date = { mode: 'shift', days: Number(u.date.days) || 0 };
    return p;
}

function summaryText(targets, field) {
    const parts = summarizeField(targets, field).map(s => `${escapeHtml(s.value)} ×${s.count}`);
    return parts.length > BULK_EDIT.PREVIEW_ROWS ? `${parts.slice(0, BULK_EDIT.PREVIEW_ROWS).join('、')}、他 ${parts.length - BULK_EDIT.PREVIEW_ROWS} 種` : (parts.join('、') || '—');
}
const segBtn = (field, v, cur, label) => `<button type="button" data-seg data-field="${field}" data-v="${v}" class="${cur === v ? 'is-on' : ''}">${label}</button>`;

function renderPatchFields(targets) {
    const u = ui;
    const fld = (field, isKeep, seg, body) => `
        <div class="bk-field ${isKeep ? 'is-keep' : ''}" data-field="${field}">
            <div class="bk-field-head">
                <div><div class="bk-field-name">${FIELD_LABEL[field]}</div><div class="bk-field-current">現在: ${summaryText(targets, field)}</div></div>
                <div class="bk-seg">${seg}</div>
            </div>
            <div class="bk-field-body">${body}</div>
        </div>`;
    const two = (field, on) => segBtn(field, 'keep', on ? 'set' : 'keep', '変更しない') + segBtn(field, 'set', on ? 'set' : 'keep', '変更する');
    const tOpts = taskOptions(taskScopeVersions(targets));
    const dm = u.date.mode;
    $('bulkActualFields').innerHTML = [
        fld('version', !u.version.on, two('version', u.version.on),
            `<select data-val>${opt(['', ...versionOptions()], u.version.val, v => v || '（なし = その他工数）')}</select>`),
        fld('task', !u.task.on, two('task', u.task.on),
            `<select data-val>${opt([...tOpts, '__free__'], u.task.val, v => v === '__free__' ? '（直接入力）' : v)}</select>`
            + `<input type="text" data-free placeholder="対応名を入力" value="${escapeHtml(u.task.free)}" style="${u.task.val === '__free__' ? '' : 'display:none'}">`),
        fld('process', !u.process.on, two('process', u.process.on),
            `<select data-val>${opt(['', ...PROCESS.TYPES], u.process.val, v => v || '（なし）')}</select>`),
        fld('member', !u.member.on, two('member', u.member.on),
            `<select data-val>${opt(memberOptions(), u.member.val)}</select>`),
        fld('isReview', true, segBtn('isReview', 'keep', u.isReview, '変更しない') + segBtn('isReview', 'on', u.isReview, '付ける') + segBtn('isReview', 'off', u.isReview, '外す'), ''),
        fld('date', dm === 'keep', segBtn('date', 'keep', dm, '変更しない') + segBtn('date', 'set', dm, '指定日に') + segBtn('date', 'shift', dm, '日数をずらす'),
            dm === 'set'
                ? `<input type="date" data-val value="${escapeHtml(u.date.value)}">`
                : `<input type="number" data-val value="${escapeHtml(String(u.date.days))}" step="1" style="width:90px;min-width:0"> <span class="bk-muted">日（マイナスで前へ）</span>`),
    ].join('');
}

function renderPreview(targets) {
    const { changed, invalid } = applyBulkPatch(actuals, targets.map(a => a.id), toBulkPatch(ui));
    const box = $('bulkActualPreview');
    let html = `<div class="bk-preview"><div class="bk-preview-title">変更後プレビュー<span class="bk-muted">対象 ${targets.length} 件 · 変わる ${changed.length} 件</span></div>`;
    if (!changed.length) {
        html += '<p class="bk-muted">「変更する」に切り替えて値を選ぶと、ここに変更前 → 変更後が出ます。</p>';
    } else {
        html += '<div class="bk-diff">';
        changed.slice(0, BULK_EDIT.PREVIEW_ROWS).forEach(c => {
            const diff = c.fields.map(f => `<span class="bk-diff-f">${FIELD_LABEL[f]}</span><span class="old">${escapeHtml(displayValue(f, c.before))}</span> → <span class="new">${escapeHtml(displayValue(f, c.after))}</span>`).join('<span class="bk-sep">·</span>');
            html += `<span class="bk-diff-date">${escapeHtml(c.before.date)} ${escapeHtml(c.before.member)}</span><span>${diff}</span>`;
        });
        html += '</div>';
        if (changed.length > BULK_EDIT.PREVIEW_ROWS) html += `<p class="bk-muted">他 ${changed.length - BULK_EDIT.PREVIEW_ROWS} 件も同じ規則で変わります。</p>`;
    }
    const proc = invalid.filter(i => i.reason === 'process-required').length;
    const date = invalid.filter(i => i.reason === 'invalid-date').length;
    const task = invalid.filter(i => i.reason === 'task-required').length;
    const member = invalid.filter(i => i.reason === 'member-required').length;
    const hours = invalid.filter(i => i.reason === 'hours-required').length;
    if (proc) html += `<p class="bk-warn">⚠ ${proc} 件で版数があるのに工程が空です。工程も「変更する」で指定してください。</p>`;
    if (date) html += `<p class="bk-warn">⚠ ${date} 件で日付が不正です。</p>`;
    if (task) html += `<p class="bk-warn">⚠ ${task} 件で対応名が空です。</p>`;
    if (member) html += `<p class="bk-warn">⚠ ${member} 件で担当が空です。担当を「変更する」で指定してください。</p>`;
    if (hours) html += `<p class="bk-warn">⚠ ${hours} 件で工数が 0 以下です。個別の編集で工数を直してください。</p>`;
    box.innerHTML = html + '</div>';
    $('btnBulkActualApply').disabled = changed.length === 0 || invalid.length > 0;
    $('btnBulkActualApply').textContent = `${targets.length} 件に適用`;
}

function rerenderModal() {
    const targets = getSelectedActuals();
    renderPatchFields(targets);
    renderPreview(targets);
}

/** 選択中の実績を対象に一括編集モーダルを開く */
export function openBulkActualEditModal() {
    const targets = getSelectedActuals();
    if (!targets.length) { showAlert('実績を選択してください', false); return; }
    ui = newPatchUI();
    ui.version.val = versionOptions()[0] || '';
    ui.task.val = taskOptions(taskScopeVersions(targets))[0] || '__free__';
    ui.process.val = PROCESS.TYPES[0];
    ui.member.val = memberOptions()[0] || '';
    ui.date.value = targets[0].date;
    $('bulkActualEditTitle').textContent = `選択した ${targets.length} 件を一括編集`;
    rerenderModal();
    $('bulkActualEditModal').style.display = 'flex';
}

/** 一括編集モーダルを閉じ、編集中パッチを破棄する */
export function closeBulkActualEditModal() {
    $('bulkActualEditModal').style.display = 'none';
    ui = null;
}

/** 版数の指定/選択が変わった直後、対応名が新しい候補に無ければ候補の先頭（無ければ自由入力）へ差し替える */
function resyncTaskForVersion() {
    const to = taskOptions(taskScopeVersions(getSelectedActuals()));
    if (!to.includes(ui.task.val) && ui.task.val !== '__free__') ui.task.val = to[0] || '__free__';
}

/** モーダル内のセグメント／値変更（イベント委譲。Task 4 Step 5 で登録） */
function onBulkFieldClick(e) {
    const btn = e.target.closest('button[data-seg]'); if (!btn || !ui) return;
    const f = btn.dataset.field, v = btn.dataset.v;
    if (f === 'isReview') ui.isReview = v;
    else if (f === 'date') ui.date.mode = v;
    else {
        ui[f].on = v === 'set';
        if (f === 'version') resyncTaskForVersion();
    }
    rerenderModal();
}
function onBulkFieldChange(e) {
    const row = e.target.closest('.bk-field'); if (!row || !ui) return;
    const f = row.dataset.field, v = e.target.value;
    if (e.target.matches('[data-free]')) { ui.task.free = v; renderPreview(getSelectedActuals()); return; }
    if (f === 'date') { if (ui.date.mode === 'set') ui.date.value = v; else ui.date.days = v; }
    else if (f === 'version') { ui.version.val = v; resyncTaskForVersion(); }
    else ui[f].val = v;
    rerenderModal();
}

/**
 * setActuals → pushAction → 保存・再描画（afterBulkChange）を例外から保護する共通ヘルパー（§11）。
 * 純粋関数で after を確定させた後、この中で State を更新するので、例外が出ても State.actuals は
 * 代入前のまま（破壊的変更が半端に残らない）
 * @param {() => void} fn
 */
function runBulkChange(fn) {
    try {
        fn();
    } catch (e) {
        console.error('[actual-bulk] 適用に失敗:', e);
        showAlert('一括編集に失敗しました', false);
    }
}

/** 適用: エンジン → State → pushAction → 保存 → 再描画 */
export function applyBulkActualEdit() {
    if (!ui) return;
    const targets = getSelectedActuals();
    const patch = toBulkPatch(ui);
    const { after, changed, invalid } = applyBulkPatch(actuals, targets.map(a => a.id), patch);
    if (!changed.length || invalid.length) return;
    runBulkChange(() => {
        setActuals(after);
        const fields = [...new Set(changed.flatMap(c => c.fields))].map(f => FIELD_LABEL[f]).join('・');
        pushAction({
            type: 'actual_bulk_edit',
            description: `実績一括編集: ${fields} × ${changed.length}件`,
            data: { beforeActuals: changed.map(c => ({ ...c.before })), afterActuals: changed.map(c => ({ ...c.after })) },
        });
        afterBulkChange(`${changed.length} 件の実績を更新しました`);
        closeBulkActualEditModal();
    });
}

/** 一括操作後の共通後処理: 保存・選択クリア・全画面更新・Undo トースト */
function afterBulkChange(message) {
    if (typeof window.saveData === 'function') window.saveData();
    selectedActualIds.clear();
    lastClickedId = null;
    if (typeof window.updateMonthOptions === 'function') window.updateMonthOptions();
    if (typeof window.updateActualMonthOptions === 'function') window.updateActualMonthOptions();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
    updateActualSelectionUI();
    showUndoToast(message);
}

// ============================================
// 一括削除・別日に複製
// ============================================

/** 選択中の実績を確認のうえ削除（Undo 可） */
export function deleteSelectedActuals() {
    const targets = getSelectedActuals();
    if (!targets.length) return;
    if (!confirm(`${targets.length} 件の実績を削除しますか？`)) return;
    const { after, deleted } = deleteActuals(actuals, targets.map(a => a.id));
    runBulkChange(() => {
        setActuals(after);
        pushAction({ type: 'actual_bulk_edit', description: `実績一括削除: ${deleted.length}件`, data: { deletedActuals: deleted.map(a => ({ ...a })) } });
        afterBulkChange(`${deleted.length} 件の実績を削除しました`);
    });
}

function renderCopyPreview() {
    const targets = getSelectedActuals();
    const date = $('bulkActualCopyDate').value;
    const ok = isValidDateString(date);
    const list = targets.slice(0, BULK_EDIT.COPY_PREVIEW_ROWS).map(a => `<span class="bk-diff-date">${escapeHtml(a.date)} → <b>${escapeHtml(date || '?')}</b></span><span>${escapeHtml(a.member)} ${escapeHtml(a.task)} ${escapeHtml(a.process || '—')} ${formatHours(a.hours)}h</span>`).join('');
    $('bulkActualCopyPreview').innerHTML = `<div class="bk-preview"><div class="bk-preview-title">複製プレビュー<span class="bk-muted">${targets.length} 件を新規追加（元は残す）</span></div><div class="bk-diff">${list}</div>${targets.length > BULK_EDIT.COPY_PREVIEW_ROWS ? `<p class="bk-muted">他 ${targets.length - BULK_EDIT.COPY_PREVIEW_ROWS} 件</p>` : ''}${ok ? '' : '<p class="bk-warn">⚠ 複製先の日付を入力してください。</p>'}</div>`;
    $('btnBulkActualCopyApply').disabled = !ok;
    $('btnBulkActualCopyApply').textContent = `${targets.length} 件を複製`;
}

/** 選択中の実績を対象に「別日に複製」モーダルを開く */
export function openBulkActualCopyModal() {
    const targets = getSelectedActuals();
    if (!targets.length) { showAlert('実績を選択してください', false); return; }
    $('bulkActualCopyTitle').textContent = `選択した ${targets.length} 件を別日に複製`;
    $('bulkActualCopyDate').value = targets[0].date;
    renderCopyPreview();
    $('bulkActualCopyModal').style.display = 'flex';
}

/** 複製モーダルを閉じる */
export function closeBulkActualCopyModal() {
    $('bulkActualCopyModal').style.display = 'none';
}

/** 適用: エンジン → State → pushAction → 保存 → 再描画（別日に複製） */
export function applyBulkActualCopy() {
    const targets = getSelectedActuals();
    const date = $('bulkActualCopyDate').value;
    if (!targets.length || !isValidDateString(date)) return;
    const { after, added } = duplicateActuals(actuals, targets.map(a => a.id), date, nextId);
    runBulkChange(() => {
        setActuals(after);
        pushAction({ type: 'actual_bulk_edit', description: `実績一括複製: ${added.length}件 → ${date}`, data: { afterActuals: added.map(a => ({ ...a })), addedActualIds: added.map(a => a.id) } });
        afterBulkChange(`${added.length} 件の実績を ${date} に複製しました`);
        closeBulkActualCopyModal();
    });
}

/** 複製モーダルの日付変更でプレビュー更新（initEventHandlers から呼ぶ） */
export function initBulkActualCopyEvents() {
    const input = $('bulkActualCopyDate'); if (!input) return;
    input.addEventListener('change', renderCopyPreview);
    input.addEventListener('input', renderCopyPreview);
}

/** 「元に戻す」付きトースト（8 秒で消える） */
export function showUndoToast(message) {
    document.querySelectorAll('.bk-undo-toast').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'bk-undo-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" class="bk-undo">元に戻す</button><button type="button" class="bk-x" aria-label="閉じる">&times;</button>`;
    el.querySelector('.bk-undo').addEventListener('click', () => { el.remove(); undo(); });
    el.querySelector('.bk-x').addEventListener('click', () => el.remove());
    document.body.appendChild(el);
    setTimeout(() => el.remove(), BULK_EDIT.UNDO_TOAST_MS);
}

/** モーダルのイベント委譲を登録（initEventHandlers から 1 回呼ぶ） */
export function initBulkActualModalEvents() {
    const modal = $('bulkActualEditModal'); if (!modal) return;
    modal.addEventListener('click', onBulkFieldClick);
    modal.addEventListener('change', onBulkFieldChange);
    modal.addEventListener('input', (e) => { if (e.target.matches('[data-free]') && ui) { ui.task.free = e.target.value; renderPreview(getSelectedActuals()); } });
}

console.log('✅ モジュール actual-bulk.js loaded');
