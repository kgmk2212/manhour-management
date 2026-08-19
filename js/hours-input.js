// ============================================
// 工数入力ウィジェット（方式切替式・実地トライアル）
// ============================================
// 既存の工数 <select> を値キャリアとして残したまま、選択中の入力方式の
// UI を直後に描画する。保存側は従来どおり select.value を読むだけでよい。
// 方式は設定画面の「工数入力方式」で切り替え、localStorage に保持する。
// ※ 実地トライアル用: 本命方式が決まったら残りの方式は削除する予定。

import * as State from './state.js';
import { CALCULATIONS } from './constants.js';
import { populateQuarterHourOptions, setHoursSelectValue } from './utils.js';

const STORAGE_KEY = 'manhour_hoursInputMethod';
const MIN_HOURS = 0.25;
const MAX_HOURS = 16;

/** 入力方式の定義（設定画面の選択肢と描画の対応） */
export const HOURS_INPUT_METHODS = [
    { key: 'chips', label: 'チップ＋ステッパー' },
    { key: 'twostage', label: '「時間」＋「端数」の2段チップ' },
    { key: 'wheel', label: '中央ホイール' },
    { key: 'dropdown', label: 'ドロップダウン＋チップ（従来型）' },
    { key: 'slider', label: 'スライダー＋微調整' },
];

/** select要素 → ウィジェットインスタンス */
const instances = new Map();

/**
 * 現在の工数入力方式を取得する
 * @returns {string} 方式キー（未設定時は 'dropdown'）
 */
export function getHoursInputMethod() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return HOURS_INPUT_METHODS.some(m => m.key === saved) ? saved : 'dropdown';
}

/**
 * 工数入力方式を保存し、生成済みウィジェットを再構築する
 * @param {string} key - 方式キー
 */
export function setHoursInputMethod(key) {
    if (!HOURS_INPUT_METHODS.some(m => m.key === key)) return;
    localStorage.setItem(STORAGE_KEY, key);
    for (const selectEl of instances.keys()) refreshHoursInput(selectEl);
}

/**
 * 指定担当者・日付に登録済みの実績工数合計を返す
 * @param {string} member - 担当者名
 * @param {string} date - 'YYYY-MM-DD' 形式の日付
 * @param {number|string|null} [excludeId=null] - 集計から除外する実績ID（編集時に自身を除く用）
 * @returns {number} 登録済み工数の合計
 */
export function getRegisteredDayHours(member, date, excludeId = null) {
    return State.actuals
        .filter(a => a.member === member && a.date === date &&
            (excludeId === null || String(a.id) !== String(excludeId)))
        .reduce((sum, a) => sum + (a.hours || 0), 0);
}

// ============================================
// 共通ユーティリティ
// ============================================

/** 表示用フォーマット（8→"8", 8.5→"8.5", 8.25→"8.25"） */
function fmt(n) {
    return String(parseFloat((Math.round(n * 100) / 100).toFixed(2)));
}

/** 0.25刻みへスナップし範囲内に収める */
function snap(n) {
    if (!Number.isFinite(n)) return MIN_HOURS;
    return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(n / 0.25) * 0.25));
}

/** 押しっぱなしで連続実行（クリック1回＋400ms後リピート） */
function holdRepeat(btn, fn) {
    let timer = null;
    let interval = null;
    const stop = () => { clearTimeout(timer); clearInterval(interval); };
    btn.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        fn();
        timer = setTimeout(() => { interval = setInterval(fn, 80); }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    // キーボード（Enter/Space）は click(detail=0) で1回ずつ
    btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); });
}

/** インスタンスの現在値（select から読む） */
function getValue(inst) {
    return parseFloat(inst.selectEl.value) || 0;
}

/** 値を select に反映してウィジェットを同期する */
function setValue(inst, v) {
    setHoursSelectValue(inst.selectEl, snap(v));
    inst.renderer.sync();
}

/** 登録済み工数（コンテキストなしなら null） */
function getRegistered(inst) {
    const fn = inst.opts.getRegistered;
    const v = typeof fn === 'function' ? fn() : null;
    return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
}

// ============================================
// 共通パーツ（残りチップ・合計表示・クイックチップ）
// ============================================

/** 「残り Nh」チップ。コンテキストがない場合は非表示 */
function buildRemainChip(inst) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hi-chip hi-chip-remain';
    btn.addEventListener('click', () => {
        const reg = getRegistered(inst);
        if (reg === null) return;
        const r = CALCULATIONS.HOURS_PER_DAY - reg;
        if (r >= MIN_HOURS) setValue(inst, r);
    });
    return {
        el: btn,
        refresh(now, registered) {
            if (registered === null) { btn.style.display = 'none'; return; }
            btn.style.display = '';
            const r = CALCULATIONS.HOURS_PER_DAY - registered;
            if (r >= MIN_HOURS) {
                btn.textContent = '残り ' + fmt(r) + 'h';
                btn.disabled = false;
                btn.classList.toggle('is-selected', Math.abs(now - r) < 0.001);
            } else {
                btn.textContent = '残りなし';
                btn.disabled = true;
                btn.classList.remove('is-selected');
            }
        },
    };
}

/** 「登録済＋今回＝合計/8h」表示。コンテキストがない場合は非表示 */
function buildSummary() {
    const el = document.createElement('div');
    el.className = 'hi-summary';
    el.innerHTML = '<div class="hi-summary-breakdown"></div>' +
        '<span class="hi-summary-total"></span><span class="hi-summary-remain"></span>';
    return {
        el,
        update(now, registered) {
            if (registered === null) { el.style.display = 'none'; return; }
            el.style.display = '';
            const perDay = CALCULATIONS.HOURS_PER_DAY;
            const total = registered + now;
            const remain = perDay - total;
            el.querySelector('.hi-summary-breakdown').innerHTML =
                '本日の登録済 <b>' + fmt(registered) + 'h</b> ＋ 今回 <b>' + fmt(now) + 'h</b>';
            el.querySelector('.hi-summary-total').textContent =
                '合計 ' + fmt(total) + 'h / ' + perDay + 'h';
            el.classList.remove('is-exact', 'is-over');
            const remainEl = el.querySelector('.hi-summary-remain');
            if (Math.abs(remain) < 0.001) {
                el.classList.add('is-exact');
                remainEl.textContent = 'ちょうど';
            } else if (remain < 0) {
                el.classList.add('is-over');
                remainEl.textContent = '超過 ' + fmt(-remain) + 'h';
            } else {
                remainEl.textContent = '残り ' + fmt(remain) + 'h';
            }
        },
    };
}

/** クイック値チップ列（残りチップ付き） */
function buildQuickChips(inst, chipValues) {
    const row = document.createElement('div');
    row.className = 'hi-chips';
    const chips = chipValues.map((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hi-chip';
        b.textContent = fmt(v);
        b.addEventListener('click', () => setValue(inst, v));
        row.appendChild(b);
        return { el: b, v };
    });
    const remain = buildRemainChip(inst);
    row.appendChild(remain.el);
    return {
        el: row,
        refresh(now, registered) {
            chips.forEach(c => c.el.classList.toggle('is-selected', Math.abs(now - c.v) < 0.001));
            remain.refresh(now, registered);
        },
    };
}

// ============================================
// 方式別レンダラー
// ============================================

/** 案1: クイックチップ＋ステッパー */
function renderChips(inst) {
    const c = inst.container;
    const stepper = document.createElement('div');
    stepper.className = 'hi-stepper';
    stepper.innerHTML =
        '<button type="button" class="hi-step-btn" data-d="-1">−</button>' +
        '<input type="number" step="0.25" min="0.25" max="16" inputmode="decimal">' +
        '<span class="hi-unit">h</span>' +
        '<button type="button" class="hi-step-btn" data-d="1">＋</button>';
    c.appendChild(stepper);
    const input = stepper.querySelector('input');
    const quick = buildQuickChips(inst, [0.25, 0.5, 1, 2, 4]);
    c.appendChild(quick.el);
    const summary = buildSummary();
    c.appendChild(summary.el);

    stepper.querySelectorAll('.hi-step-btn').forEach((b) => {
        holdRepeat(b, () => setValue(inst, getValue(inst) + 0.25 * Number(b.dataset.d)));
    });
    input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (Number.isFinite(v)) {
            // 入力途中は select にだけ反映し、表示の巻き戻しはしない
            setHoursSelectValue(inst.selectEl, snap(v));
            quick.refresh(snap(v), getRegistered(inst));
            summary.update(snap(v), getRegistered(inst));
        }
    });
    input.addEventListener('blur', () => setValue(inst, parseFloat(input.value)));

    return {
        sync() {
            const now = getValue(inst);
            if (document.activeElement !== input) input.value = fmt(now);
            const reg = getRegistered(inst);
            quick.refresh(now, reg);
            summary.update(now, reg);
        },
    };
}

/** 案2: 「時間」＋「端数」の2段チップ */
function renderTwoStage(inst) {
    const c = inst.container;
    c.innerHTML =
        '<div class="hi-display"><span class="hi-num"></span><span class="hi-unit">h</span></div>' +
        '<div class="hi-two-rows">' +
        '<div><div class="hi-two-label">時間</div><div class="hi-two-row hi-two-hours"></div>' +
        '<div class="hi-two-row hi-two-hours-ext" style="display:none;"></div></div>' +
        '<div><div class="hi-two-label">端数</div><div class="hi-two-row hi-two-quarters"></div></div>' +
        '</div>';
    const numEl = c.querySelector('.hi-num');
    const hourRow = c.querySelector('.hi-two-hours');
    const hourExt = c.querySelector('.hi-two-hours-ext');
    const qRow = c.querySelector('.hi-two-quarters');

    const applyPair = (hour, quarter) => {
        if (hour === 0 && quarter === 0) quarter = 0.25;
        if (hour >= MAX_HOURS) { hour = MAX_HOURS; quarter = 0; }
        setValue(inst, hour + quarter);
    };
    const hourOf = (v) => Math.min(MAX_HOURS, Math.floor(v + 0.001));
    const quarterOf = (v) => Math.round((v - Math.floor(v + 0.001)) * 100) / 100;

    const hourChips = [];
    const makeHourChip = (h, parent) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hi-chip';
        b.textContent = String(h);
        b.addEventListener('click', () => applyPair(h, quarterOf(getValue(inst))));
        parent.appendChild(b);
        hourChips.push({ el: b, h });
    };
    for (let h = 0; h <= 8; h++) makeHourChip(h, hourRow);
    const extToggle = document.createElement('button');
    extToggle.type = 'button';
    extToggle.className = 'hi-chip';
    extToggle.textContent = '9h〜';
    extToggle.addEventListener('click', () => {
        hourExt.style.display = hourExt.style.display === 'none' ? 'flex' : 'none';
    });
    hourRow.appendChild(extToggle);
    for (let h = 9; h <= MAX_HOURS; h++) makeHourChip(h, hourExt);

    const qChips = [0, 0.25, 0.5, 0.75].map((q) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'hi-chip';
        b.textContent = q === 0 ? '+0' : '+' + fmt(q);
        b.addEventListener('click', () => applyPair(hourOf(getValue(inst)), q));
        qRow.appendChild(b);
        return { el: b, q };
    });

    const remain = buildRemainChip(inst);
    remain.el.classList.add('hi-remain-solo');
    c.appendChild(remain.el);
    const summary = buildSummary();
    c.appendChild(summary.el);

    return {
        sync() {
            const now = getValue(inst);
            const hour = hourOf(now);
            const quarter = quarterOf(now);
            numEl.textContent = fmt(now);
            hourChips.forEach(hc => hc.el.classList.toggle('is-selected', hc.h === hour));
            if (hour >= 9) hourExt.style.display = 'flex';
            qChips.forEach(qc => {
                qc.el.classList.toggle('is-selected', Math.abs(qc.q - quarter) < 0.001);
                qc.el.disabled = (hour === 0 && qc.q === 0) || (hour === MAX_HOURS && qc.q !== 0);
            });
            const reg = getRegistered(inst);
            remain.refresh(now, reg);
            summary.update(now, reg);
        },
    };
}

/** 案3: 中央ホイール（現在値を常に中央に表示） */
function renderWheel(inst) {
    const c = inst.container;
    c.innerHTML =
        '<div class="hi-wheel-area">' +
        '<div class="hi-wheel-wrap">' +
        '<div class="hi-wheel" tabindex="0" aria-label="工数を選択"></div>' +
        '<div class="hi-wheel-band"></div>' +
        '<div class="hi-wheel-fade-top"></div><div class="hi-wheel-fade-bottom"></div>' +
        '</div>' +
        '<div class="hi-wheel-side"></div>' +
        '</div>';
    const wheel = c.querySelector('.hi-wheel');
    const side = c.querySelector('.hi-wheel-side');
    const ITEM_H = 36;

    const values = [];
    for (let v = MIN_HOURS; v <= MAX_HOURS + 0.001; v += 0.25) {
        values.push(Math.round(v * 100) / 100);
    }
    const idxOf = (v) => Math.max(0, Math.min(values.length - 1, Math.round((snap(v) - MIN_HOURS) / 0.25)));

    wheel.appendChild(Object.assign(document.createElement('div'), { className: 'hi-wheel-pad' }));
    const itemEls = values.map((v, i) => {
        const d = document.createElement('div');
        d.className = 'hi-wheel-item';
        d.textContent = fmt(v) + 'h';
        d.addEventListener('click', () => scrollToIdx(i, true));
        wheel.appendChild(d);
        return d;
    });
    wheel.appendChild(Object.assign(document.createElement('div'), { className: 'hi-wheel-pad' }));

    const remain = buildRemainChip(inst);
    side.appendChild(remain.el);
    const summary = buildSummary();
    c.appendChild(summary.el);

    let centerEl = null;
    let suppressValueUpdate = false;

    function highlight(idx) {
        if (centerEl === itemEls[idx]) return;
        if (centerEl) centerEl.classList.remove('is-center');
        centerEl = itemEls[idx];
        centerEl.classList.add('is-center');
    }
    function scrollToIdx(idx, smooth) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        wheel.scrollTo({ top: idx * ITEM_H, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    }

    // スクロール中は素直に流し、停止後に最寄り行へ自前スナップ（軽量化済み方式）
    let raf = null;
    let snapTimer = null;
    wheel.addEventListener('scroll', () => {
        if (!raf) {
            raf = requestAnimationFrame(() => {
                raf = null;
                if (suppressValueUpdate) return;
                const idx = Math.max(0, Math.min(values.length - 1, Math.round(wheel.scrollTop / ITEM_H)));
                highlight(idx);
                const v = values[idx];
                if (Math.abs(v - getValue(inst)) > 0.001) {
                    setHoursSelectValue(inst.selectEl, v);
                    const reg = getRegistered(inst);
                    remain.refresh(v, reg);
                    summary.update(v, reg);
                }
            });
        }
        clearTimeout(snapTimer);
        snapTimer = setTimeout(() => {
            const idx = idxOf(getValue(inst));
            const target = idx * ITEM_H;
            if (Math.abs(wheel.scrollTop - target) > 1) {
                const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                wheel.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
            }
        }, 120);
    });
    wheel.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); setValue(inst, getValue(inst) - 0.25); }
        if (e.key === 'ArrowDown') { e.preventDefault(); setValue(inst, getValue(inst) + 0.25); }
    });

    // モーダル/タブが非表示のうちは scrollTop が効かないため、レイアウト確定までリトライする
    let layoutTries = 0;
    function ensurePosition() {
        const idx = idxOf(getValue(inst));
        if (wheel.clientHeight > 0) {
            suppressValueUpdate = true;
            scrollToIdx(idx, false);
            highlight(idx);
            requestAnimationFrame(() => { suppressValueUpdate = false; });
            return;
        }
        if (layoutTries < 30) {
            layoutTries += 1;
            requestAnimationFrame(ensurePosition);
        }
    }

    return {
        sync() {
            layoutTries = 0;
            ensurePosition();
            const now = getValue(inst);
            const reg = getRegistered(inst);
            remain.refresh(now, reg);
            summary.update(now, reg);
        },
    };
}

/** 案4: 現行ドロップダウン＋チップ（従来型・selectは表示のまま） */
function renderDropdown(inst) {
    const c = inst.container;
    const quick = buildQuickChips(inst, [0.5, 1, 2, 3, 4]);
    c.appendChild(quick.el);
    const summary = buildSummary();
    c.appendChild(summary.el);
    if (!inst.selectEl.dataset.hiChangeBound) {
        inst.selectEl.addEventListener('change', () => {
            const cur = instances.get(inst.selectEl);
            if (cur && cur.renderer) cur.renderer.sync();
        });
        inst.selectEl.dataset.hiChangeBound = 'true';
    }
    return {
        sync() {
            const now = getValue(inst);
            const reg = getRegistered(inst);
            quick.refresh(now, reg);
            summary.update(now, reg);
        },
    };
}

/** 案5: スライダー＋微調整 */
function renderSlider(inst) {
    const c = inst.container;
    c.innerHTML =
        '<div class="hi-slider-row"><input type="range" min="0.25" max="8" step="0.25"></div>' +
        '<div class="hi-slider-ticks"><span>0</span><span>1</span><span>2</span><span>3</span>' +
        '<span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>' +
        '<div class="hi-stepper">' +
        '<button type="button" class="hi-step-btn" data-d="-1">−</button>' +
        '<div class="hi-display"><span class="hi-num"></span><span class="hi-unit">h</span></div>' +
        '<button type="button" class="hi-step-btn" data-d="1">＋</button>' +
        '</div>';
    const slider = c.querySelector('input[type="range"]');
    const numEl = c.querySelector('.hi-num');
    const remain = buildRemainChip(inst);
    remain.el.classList.add('hi-remain-solo');
    c.appendChild(remain.el);
    const summary = buildSummary();
    c.appendChild(summary.el);

    slider.addEventListener('input', () => setValue(inst, parseFloat(slider.value)));
    c.querySelectorAll('.hi-step-btn').forEach((b) => {
        holdRepeat(b, () => setValue(inst, getValue(inst) + 0.25 * Number(b.dataset.d)));
    });

    return {
        sync() {
            const now = getValue(inst);
            slider.value = String(Math.min(8, now));
            numEl.textContent = fmt(now);
            const reg = getRegistered(inst);
            remain.refresh(now, reg);
            summary.update(now, reg);
        },
    };
}

const RENDERERS = {
    chips: renderChips,
    twostage: renderTwoStage,
    wheel: renderWheel,
    dropdown: renderDropdown,
    slider: renderSlider,
};

// ============================================
// 公開API
// ============================================

/**
 * 工数 select にウィジェットを取り付け、現在の方式・値・コンテキストで再描画する。
 * モーダルを開くたび（値やコンテキストを設定した後）に呼ぶ。
 * @param {HTMLSelectElement} selectEl - 値キャリアの select 要素
 * @param {{getRegistered?: () => (number|null)}} [opts] - 当日の登録済み工数を返す関数。
 *   null を返すと合計・残り表示を出さない（担当者コンテキストがない場合など）
 */
export function refreshHoursInput(selectEl, opts) {
    if (!selectEl) return;
    populateQuarterHourOptions(selectEl);
    let inst = instances.get(selectEl);
    if (!inst) {
        inst = { selectEl, opts: opts || {}, method: null, container: null, renderer: null };
        const container = document.createElement('div');
        container.className = 'hi-root';
        selectEl.insertAdjacentElement('afterend', container);
        inst.container = container;
        instances.set(selectEl, inst);
    }
    if (opts) inst.opts = { ...inst.opts, ...opts };
    const method = getHoursInputMethod();
    if (inst.method !== method) {
        inst.method = method;
        inst.container.innerHTML = '';
        selectEl.style.display = method === 'dropdown' ? '' : 'none';
        inst.renderer = RENDERERS[method](inst);
    }
    inst.renderer.sync();
}

/**
 * 設定画面の「工数入力方式」セレクトを初期化する（init.js から呼ぶ）
 */
export function initHoursInputSetting() {
    const select = document.getElementById('hoursInputMethodSelect');
    if (!select) return;
    select.innerHTML = '';
    HOURS_INPUT_METHODS.forEach((m) => {
        const o = document.createElement('option');
        o.value = m.key;
        o.textContent = m.label;
        select.appendChild(o);
    });
    select.value = getHoursInputMethod();
    select.addEventListener('change', () => setHoursInputMethod(select.value));
}

console.log('✅ モジュール hours-input.js loaded');
