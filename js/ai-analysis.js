/**
 * AI 分析セクション
 * - localStorage キャッシュ → analysis/latest.json → 空状態 の優先順で表示
 * - 「分析を実行」でブラウザから Ollama に直接 fetch
 * - エンドポイント / モデル名を設定可能（設定は localStorage 永続化）
 */

import { summarizeFromAppState } from './llm-summarize.js';
import { analyze as runAnalyze, probeOllama } from './llm-analyze.js';
import { parsePartialJson } from './partial-json.js';
import { showAlert } from './utils.js';

const ANALYSIS_PATH = 'analysis/latest.json';
const HISTORY_STORAGE_KEY = 'llmAnalysisHistory_v1';
const LEGACY_RESULT_KEY = 'llmAnalysisResult_v1';
const SETTINGS_STORAGE_KEY = 'llmAnalysisSettings_v1';
const DEFAULT_HISTORY_MAX = 50;
const HISTORY_MAX_HARD_LIMIT = 500; // 暴走防止の上限
const DEFAULT_SETTINGS = Object.freeze({
    endpoint: 'http://localhost:11434',
    model: 'qwen3.5:9b',
    backupIncludeHistory: true,
    historyMax: DEFAULT_HISTORY_MAX,
});

const state = {
    phase: 'idle',           // idle | summarizing | analyzing | done | error
    result: null,            // 現在表示中の結果 JSON
    partial: null,           // 推論中の部分 JSON（逐次描画用）
    partialTokens: 0,
    partialThinking: false,
    history: [],             // 結果履歴（新しい順）
    selectedIndex: 0,        // history 上の選択位置（0 = 最新）
    historyPanelOpen: false, // 履歴パネルの開閉状態（再描画をまたいで保持）
    error: null,             // { message, code, hint }
    controller: null,        // AbortController
    elapsedMs: 0,
    elapsedTimer: null,
    lastSource: null,        // 'cache' | 'file' | 'fresh'
};

/* -------------------- DOM ヘルパ -------------------- */

function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
}

/* -------------------- 設定の読み書き -------------------- */

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        /* ignore quota errors */
    }
}

/**
 * 履歴を読み込む。旧 RESULT_STORAGE_KEY があれば自動マイグレーション
 * @returns {Array<object>} 新しい順の配列（先頭が最新）
 */
export function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(r => r && r.team_evaluation);
        }
        // 旧フォーマット (単一結果) から移行
        const legacy = localStorage.getItem(LEGACY_RESULT_KEY);
        if (legacy) {
            const parsed = JSON.parse(legacy);
            if (parsed && parsed.team_evaluation) {
                const migrated = [parsed];
                localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(migrated));
                localStorage.removeItem(LEGACY_RESULT_KEY);
                return migrated;
            }
        }
    } catch {
        /* ignore */
    }
    return [];
}

function saveHistory(arr) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(arr));
    } catch {
        /* ignore */
    }
}

/**
 * 新しい結果を履歴先頭に追加。設定の historyMax を超えたら古い順に破棄
 */
export function appendHistory(result) {
    const history = loadHistory();
    history.unshift(result);
    const max = getHistoryMax();
    while (history.length > max) history.pop();
    saveHistory(history);
    return history;
}

/** 設定から履歴保持上限を取得（安全範囲にクランプ） */
function getHistoryMax() {
    const n = parseInt(loadSettings().historyMax, 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_HISTORY_MAX;
    return Math.min(n, HISTORY_MAX_HARD_LIMIT);
}

function clearHistory() {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_RESULT_KEY);
}

/* -------------------- 初期化 -------------------- */

export async function initAiAnalysis() {
    const section = document.getElementById('ai-analysis-section');
    const content = document.getElementById('ai-analysis-content');
    if (!section || !content) return;

    // セクションは常に表示する（空状態でも実行ボタンを出すため）
    section.style.display = '';

    // 1. 履歴（旧キーからの自動マイグレーション含む）を最優先
    state.history = loadHistory();
    if (state.history.length > 0) {
        state.phase = 'done';
        state.selectedIndex = 0;
        state.result = state.history[0];
        state.lastSource = 'cache';
        render(content);
        return;
    }

    // 2. analysis/latest.json フォールバック
    try {
        const resp = await fetch(ANALYSIS_PATH);
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.team_evaluation) {
                state.phase = 'done';
                state.result = data;
                state.lastSource = 'file';
                render(content);
                return;
            }
        }
    } catch {
        /* no fallback file; show idle */
    }

    // 3. 空状態
    state.phase = 'idle';
    state.result = null;
    render(content);
}

/* -------------------- レンダラ -------------------- */

function render(content) {
    content.textContent = '';

    // アクションバー（常設）
    content.appendChild(renderActionBar());

    if (state.phase === 'summarizing') {
        content.appendChild(renderLoading());
        return;
    }

    if (state.phase === 'analyzing') {
        // ヘッダ（経過時間・トークン数）は常設、partial があれば結果カードを部分描画
        content.appendChild(renderStreamingStatus());
        if (state.partial) {
            content.appendChild(renderResult(state.partial, { partial: true }));
        }
        return;
    }

    if (state.phase === 'error') {
        content.appendChild(renderError());
        if (state.result) content.appendChild(renderResult(state.result, { dimmed: true }));
        return;
    }

    if (state.phase === 'done' && state.result) {
        content.appendChild(renderResult(state.result));
        return;
    }

    content.appendChild(renderEmpty());
}

function renderActionBar() {
    const bar = el('div', 'ai-action-bar');

    const runBtn = el('button', 'ai-run-btn');
    const isRunning = state.phase === 'summarizing' || state.phase === 'analyzing';
    runBtn.textContent = isRunning
        ? 'キャンセル'
        : state.result
            ? '再実行'
            : '分析を実行';
    runBtn.classList.toggle('ai-run-btn-cancel', isRunning);
    runBtn.addEventListener('click', isRunning ? cancelAnalysis : executeAnalysis);
    bar.appendChild(runBtn);

    const settingsBtn = el('button', 'ai-settings-btn', '\u2699 \u8a2d\u5b9a');
    settingsBtn.addEventListener('click', toggleSettingsPanel);
    bar.appendChild(settingsBtn);

    const settingsPanel = renderSettingsPanel();
    bar.appendChild(settingsPanel);

    return bar;
}

/* -------------------- \u5c65\u6b74\u30c9\u30ed\u30c3\u30d7\u30c0\u30a6\u30f3\uff08\u7d50\u679c\u30d8\u30c3\u30c0\u30fc\u306b\u914d\u7f6e\uff09 -------------------- */

/** \u5c65\u6b74\u30c8\u30ea\u30ac\u30fc\uff0b\u30ab\u30fc\u30c9\u578b\u30c9\u30ed\u30c3\u30d7\u30c0\u30a6\u30f3\u3092\u69cb\u7bc9\uff08hero meta \u306b\u5dee\u3057\u8fbc\u3080\uff09 */
function renderHistoryDropdown() {
    const wrap = el('div', 'ai-history-dd');

    const trigger = el('button', 'ai-history-dd-trigger' + (state.historyPanelOpen ? ' open' : ''));
    trigger.appendChild(el('span', null, `\u5c65\u6b74 ${state.selectedIndex + 1}/${state.history.length}`));
    trigger.appendChild(el('span', 'ai-history-dd-caret', '\u25be'));
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', String(state.historyPanelOpen));
    trigger.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleHistoryPanel();
    });
    wrap.appendChild(trigger);

    const menu = el('div', 'ai-history-dd-menu');
    menu.id = 'ai-history-panel';
    menu.style.display = state.historyPanelOpen ? 'block' : 'none';
    menu.addEventListener('click', (ev) => ev.stopPropagation());
    menu.appendChild(el('div', 'ai-history-panel-title', `\u5206\u6790\u5c65\u6b74\uff08${state.history.length}\u4ef6\uff09`));
    const list = el('div', 'ai-history-list');
    state.history.forEach((h, i) => list.appendChild(renderHistoryRow(h, i)));
    menu.appendChild(list);
    wrap.appendChild(menu);

    return wrap;
}

/** \u30c9\u30ed\u30c3\u30d7\u30c0\u30a6\u30f3\u306e\u958b\u9589\u3002\u958b\u3044\u3066\u3044\u308b\u9593\u306f\u5916\u5074\u30af\u30ea\u30c3\u30af\u3067\u9589\u3058\u308b */
function toggleHistoryPanel() {
    if (state.historyPanelOpen) { closeHistoryDropdown(false); return; }
    state.historyPanelOpen = true;
    syncDropdownDom(true);
    document.removeEventListener('click', onOutsideHistoryClick);
    setTimeout(() => document.addEventListener('click', onOutsideHistoryClick), 0);
}

/** state \u3068\u306f\u72ec\u7acb\u306b DOM \u306e\u8868\u793a\u72b6\u614b\u3060\u3051\u66f4\u65b0\uff08\u518d\u63cf\u753b\u3092\u907f\u3051\u305f\u3044\u30b1\u30fc\u30b9\u7528\uff09 */
function syncDropdownDom(open) {
    const menu = document.getElementById('ai-history-panel');
    if (menu) menu.style.display = open ? 'block' : 'none';
    const trigger = document.querySelector('#analytics .ai-history-dd-trigger');
    if (trigger) {
        trigger.classList.toggle('open', open);
        trigger.setAttribute('aria-expanded', String(open));
    }
}

function closeHistoryDropdown(rerender) {
    state.historyPanelOpen = false;
    document.removeEventListener('click', onOutsideHistoryClick);
    if (rerender) render(document.getElementById('ai-analysis-content'));
    else syncDropdownDom(false);
}

function onOutsideHistoryClick(ev) {
    const dd = document.querySelector('#analytics .ai-history-dd');
    if (!dd || !dd.contains(ev.target)) closeHistoryDropdown(false);
}

function renderHistoryRow(h, i) {
    const te = h.team_evaluation || {};
    const meta = h.meta || {};
    const score = te.score || '?';
    const isActive = i === state.selectedIndex && state.phase === 'done';

    const row = el('div', 'ai-history-row' + (isActive ? ' ai-history-row-active' : ''));

    const badge = el('div', `ai-history-score ai-hscore-${score}`, score);
    row.appendChild(badge);

    const body = el('div', 'ai-history-row-body');
    body.appendChild(el('div', 'ai-history-row-headline', te.headline || '\uff08\u7121\u984c\u306e\u5206\u6790\uff09'));
    const sub = el('div', 'ai-history-row-sub');
    if (meta.model) sub.appendChild(el('span', 'ai-history-row-model', meta.model));
    sub.appendChild(el('span', null, formatDate(meta.generated_at || '')));
    if (meta.analysis_period) sub.appendChild(el('span', 'ai-history-row-period', meta.analysis_period));
    body.appendChild(sub);
    row.appendChild(body);

    // \u884c\u672c\u4f53\u30af\u30ea\u30c3\u30af\u3067\u305d\u306e\u5c65\u6b74\u3092\u8868\u793a\uff08\u9078\u629e\u3067\u30c9\u30ed\u30c3\u30d7\u30c0\u30a6\u30f3\u306f\u9589\u3058\u308b\uff09
    const selectThis = () => {
        state.selectedIndex = i;
        state.result = state.history[i];
        state.lastSource = 'cache';
        state.phase = 'done';
        state.historyPanelOpen = false;
        document.removeEventListener('click', onOutsideHistoryClick);
        render(document.getElementById('ai-analysis-content'));
    };
    badge.addEventListener('click', selectThis);
    body.addEventListener('click', selectThis);

    // \u500b\u5225\u524a\u9664\u30dc\u30bf\u30f3
    const delBtn = el('button', 'ai-history-del', '\u00d7');
    delBtn.title = '\u3053\u306e\u5c65\u6b74\u3092\u524a\u9664';
    delBtn.setAttribute('aria-label', '\u3053\u306e\u5c65\u6b74\u3092\u524a\u9664');
    delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        deleteHistoryAt(i);
    });
    row.appendChild(delBtn);

    return row;
}

/** \u6307\u5b9a\u30a4\u30f3\u30c7\u30c3\u30af\u30b9\u306e\u5c65\u6b74\u30921\u4ef6\u3060\u3051\u524a\u9664\u3057\u3001\u9078\u629e\u4f4d\u7f6e\u3092\u6574\u3048\u308b */
function deleteHistoryAt(index) {
    const history = loadHistory();
    if (index < 0 || index >= history.length) return;

    const target = history[index];
    const when = formatDate(target?.meta?.generated_at || '');
    const headline = target?.team_evaluation?.headline || '';
    if (!confirm(`\u3053\u306e\u5206\u6790\u5c65\u6b74\u3092\u524a\u9664\u3057\u307e\u3059\u3002\n${headline}\uff08${when}\uff09\n\u3088\u308d\u3057\u3044\u3067\u3059\u304b\uff1f`)) return;

    history.splice(index, 1);
    saveHistory(history);
    state.history = history;

    const content = document.getElementById('ai-analysis-content');

    if (history.length === 0) {
        // \u5c65\u6b74\u304c\u7a7a\u306b\u306a\u3063\u305f \u2192 \u7a7a\u72b6\u614b\u306b\u623b\u3059
        state.result = null;
        state.selectedIndex = 0;
        state.phase = 'idle';
        state.lastSource = null;
        state.historyPanelOpen = false;
        document.removeEventListener('click', onOutsideHistoryClick);
        initAiAnalysis(); // analysis/latest.json \u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af\u3082\u518d\u8a55\u4fa1
        return;
    }

    // \u9078\u629e\u4e2d\u30a4\u30f3\u30c7\u30c3\u30af\u30b9\u3092\u524a\u9664\u5f8c\u306e\u914d\u5217\u306b\u5408\u308f\u305b\u3066\u88dc\u6b63
    if (index < state.selectedIndex) state.selectedIndex -= 1;
    else if (index === state.selectedIndex) state.selectedIndex = Math.min(state.selectedIndex, history.length - 1);

    state.result = history[state.selectedIndex];
    state.lastSource = 'cache';
    state.phase = 'done';
    render(content);
}

function renderSettingsPanel() {
    const panel = el('div', 'ai-settings-panel');
    panel.id = 'ai-settings-panel';
    panel.style.display = 'none';

    const settings = loadSettings();

    const makeField = (label, key, placeholder, { listId } = {}) => {
        const row = el('div', 'ai-settings-row');
        row.appendChild(el('label', null, label));
        const input = el('input');
        input.type = 'text';
        input.value = settings[key];
        input.placeholder = placeholder;
        if (listId) input.setAttribute('list', listId);
        input.addEventListener('change', () => {
            const current = loadSettings();
            current[key] = input.value.trim() || DEFAULT_SETTINGS[key];
            saveSettings(current);
        });
        row.appendChild(input);
        return row;
    };

    panel.appendChild(makeField('Ollama エンドポイント', 'endpoint', DEFAULT_SETTINGS.endpoint));
    const endpointHint = el('div', 'ai-settings-hint', 'CSP により localhost:11434 / 127.0.0.1:11434 のみ接続可能です。別ポートを使う場合は index.html の CSP メタタグを編集してください。');
    panel.appendChild(endpointHint);

    // モデル一覧の datalist（開封時に probeOllama で取得して埋める）
    const modelList = el('datalist');
    modelList.id = 'ai-model-list';
    panel.appendChild(modelList);
    panel.appendChild(makeField('モデル名', 'model', DEFAULT_SETTINGS.model, { listId: 'ai-model-list' }));

    // パネルを開いた瞬間にモデル一覧を非同期で取得（失敗しても UX は壊れない）
    probeOllama(settings.endpoint, { timeoutMs: 1500 }).then(result => {
        if (!result.ok || !result.models) return;
        for (const name of result.models) {
            const opt = el('option');
            opt.value = name;
            modelList.appendChild(opt);
        }
    }).catch(() => {/* ignore */});

    const actionsRow = el('div', 'ai-settings-row ai-settings-actions');
    const probeBtn = el('button', 'ai-probe-btn', '疎通確認');
    const probeStatus = el('span', 'ai-probe-status');
    probeBtn.addEventListener('click', async () => {
        probeStatus.textContent = '確認中...';
        probeStatus.className = 'ai-probe-status';
        const result = await probeOllama(loadSettings().endpoint);
        if (result.ok) {
            const models = (result.models || []).slice(0, 5).join(', ');
            probeStatus.textContent = `✓ 接続 OK（モデル: ${models || 'なし'}）`;
            probeStatus.classList.add('ai-probe-ok');
        } else {
            probeStatus.textContent = `✗ ${result.error}`;
            probeStatus.classList.add('ai-probe-error');
        }
    });

    const clearBtn = el('button', 'ai-clear-btn', '履歴をすべて削除');
    const clearStatus = el('span', 'ai-clear-status');
    clearBtn.addEventListener('click', async () => {
        const n = loadHistory().length;
        if (!confirm(`保存されている AI 分析履歴 ${n} 件をすべて削除します。よろしいですか？`)) return;
        clearHistory();
        clearStatus.textContent = '✓ 削除しました';
        clearStatus.className = 'ai-clear-status ai-clear-ok';
        state.result = null;
        state.history = [];
        state.selectedIndex = 0;
        state.phase = 'idle';
        state.lastSource = null;
        await initAiAnalysis();
    });

    const exportBtn = el('button', 'ai-export-btn', '履歴をエクスポート');
    exportBtn.addEventListener('click', () => {
        const history = loadHistory();
        if (history.length === 0) {
            showAlert('エクスポートする履歴がありません', false);
            return;
        }
        // 差分マージ(バックアップJSON)互換のキーで出力する。
        // ローカル LLM の無い環境では、このファイルを「バックアップ差分マージ」で取り込むと
        // 見積・実績を上書きせずに分析履歴(と設定)だけを追加できる。
        const blob = new Blob([JSON.stringify({
            exportedAt: new Date().toISOString(),
            count: history.length,
            llmAnalysisHistory: history,
            llmAnalysisSettings: loadSettings(),
        }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `ai-analysis-history_${timestamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    actionsRow.appendChild(probeBtn);
    actionsRow.appendChild(clearBtn);
    actionsRow.appendChild(exportBtn);
    actionsRow.appendChild(probeStatus);
    actionsRow.appendChild(clearStatus);
    panel.appendChild(actionsRow);

    // 履歴保持件数
    const historyMaxRow = el('div', 'ai-settings-row');
    historyMaxRow.appendChild(el('label', null, '履歴の保持件数'));
    const maxInput = el('input', 'ai-history-max-input');
    maxInput.type = 'number';
    maxInput.min = '1';
    maxInput.max = String(HISTORY_MAX_HARD_LIMIT);
    maxInput.step = '1';
    maxInput.value = String(settings.historyMax ?? DEFAULT_HISTORY_MAX);
    maxInput.addEventListener('change', () => {
        const current = loadSettings();
        let n = parseInt(maxInput.value, 10);
        if (!Number.isFinite(n) || n < 1) n = DEFAULT_HISTORY_MAX;
        n = Math.min(n, HISTORY_MAX_HARD_LIMIT);
        maxInput.value = String(n);
        current.historyMax = n;
        saveSettings(current);
    });
    historyMaxRow.appendChild(maxInput);
    historyMaxRow.appendChild(el('span', 'ai-settings-hint', `（1〜${HISTORY_MAX_HARD_LIMIT}件、デフォルト${DEFAULT_HISTORY_MAX}）`));
    panel.appendChild(historyMaxRow);

    // バックアップ含有トグル
    const toggleRow = el('div', 'ai-settings-row');
    toggleRow.appendChild(el('label', null, 'バックアップに履歴を含める'));
    const toggle = el('input');
    toggle.type = 'checkbox';
    toggle.checked = settings.backupIncludeHistory !== false;
    toggle.addEventListener('change', () => {
        const current = loadSettings();
        current.backupIncludeHistory = toggle.checked;
        saveSettings(current);
    });
    toggleRow.appendChild(toggle);
    panel.appendChild(toggleRow);

    return panel;
}

function toggleSettingsPanel() {
    const p = document.getElementById('ai-settings-panel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function renderEmpty() {
    const box = el('div', 'ai-empty');
    box.appendChild(el('div', 'ai-empty-title', 'AI 分析はまだ実行されていません'));
    box.appendChild(el('div', 'ai-empty-desc',
        'ローカルの Ollama を使って、現在の工数データから総合評価・展望・推奨アクションを生成します。'));
    const hint = el('div', 'ai-empty-hint',
        'Ollama 未起動の場合は「設定」から疎通確認をお試しください。');
    box.appendChild(hint);
    return box;
}

function renderLoading() {
    const box = el('div', 'ai-loading');
    box.appendChild(el('div', 'ai-loading-spinner'));
    box.appendChild(el('div', 'ai-loading-label', 'データを要約しています…'));
    const timer = el('div', 'ai-loading-timer', `${(state.elapsedMs / 1000).toFixed(1)} 秒経過`);
    timer.id = 'ai-loading-timer';
    box.appendChild(timer);
    return box;
}

/** 推論中の進捗を上部にコンパクト表示（partial 結果は別に描画） */
function renderStreamingStatus() {
    const box = el('div', 'ai-streaming-status');
    const spinner = el('div', 'ai-streaming-spinner');
    box.appendChild(spinner);
    const label = state.partialThinking ? '思考中' : '生成中';
    const left = el('div', 'ai-streaming-label', label);
    box.appendChild(left);
    const timer = el('div', 'ai-streaming-timer',
        `${(state.elapsedMs / 1000).toFixed(1)}秒 / ${state.partialTokens} トークン`);
    timer.id = 'ai-loading-timer';
    box.appendChild(timer);
    return box;
}

function renderError() {
    const err = state.error || {};
    const box = el('div', 'ai-error');
    box.appendChild(el('div', 'ai-error-title', '分析に失敗しました'));
    box.appendChild(el('div', 'ai-error-message', err.message || '原因不明のエラーが発生しました'));
    if (err.hint) box.appendChild(el('div', 'ai-error-hint', err.hint));
    if (err.code === 'CORS_LIKELY' || err.code === 'OLLAMA_UNREACHABLE') {
        const setup = el('div', 'ai-error-setup');
        setup.appendChild(el('div', 'ai-detail-label', 'セットアップ手順'));
        const code = el('pre', 'ai-code-block');
        code.textContent =
`# 1. Ollama が起動していることを確認
ollama list

# 2. CORS 許可（GitHub Pages からの呼び出しを許可）
launchctl setenv OLLAMA_ORIGINS "${location.origin}"
launchctl stop ollama && launchctl start ollama
# または: OLLAMA_ORIGINS="${location.origin}" ollama serve`;
        setup.appendChild(code);
        box.appendChild(setup);
    }
    return box;
}

function renderResult(data, { dimmed = false, partial = false } = {}) {
    const cls = [];
    if (dimmed) cls.push('ai-result-dimmed');
    if (partial) cls.push('ai-result-partial');
    const root = el('div', cls.join(' ') || null);

    const te = data.team_evaluation || {};
    const ol = data.outlook || {};
    const actions = data.recommended_actions || [];
    const meta = data.meta || {};
    const score = te.score || '?';
    const trend = te.trend || 'stable';
    const trendText = trend === 'improving' ? '\u25B2 改善傾向'
        : trend === 'declining' ? '\u25BC 悪化傾向'
        : '\u25CF 安定';

    // Hero
    const hero = el('div', 'ai-hero');

    const heroTop = el('div', 'ai-hero-top');
    const titleWrap = el('div', 'ai-hero-title');
    titleWrap.appendChild(el('div', 'ai-hero-icon', '\u25C6'));
    titleWrap.appendChild(el('h2', null, te.headline || (partial ? '生成中…' : 'AI分析')));
    heroTop.appendChild(titleWrap);
    const metaWrap = el('div', 'ai-hero-meta');
    if (meta.model) metaWrap.appendChild(el('span', 'ai-model-tag', meta.model));
    if (meta.generated_at) metaWrap.appendChild(el('span', null, formatDate(meta.generated_at)));
    if (meta.analysis_period) metaWrap.appendChild(el('span', null, meta.analysis_period));
    if (state.lastSource === 'file') metaWrap.appendChild(el('span', 'ai-source-tag', 'ファイル'));
    // 履歴ドロップダウン（履歴が1件以上 & 結果表示中のみ）。クリックでカード一覧が開き、選択/個別削除ができる
    if (state.history.length >= 1 && state.phase === 'done' && !partial) {
        metaWrap.appendChild(renderHistoryDropdown());
    }
    heroTop.appendChild(metaWrap);
    hero.appendChild(heroTop);

    const heroMain = el('div', 'ai-hero-main');
    const scoreBlock = el('div', 'ai-score-block');
    scoreBlock.appendChild(el('div', `ai-score-circle ai-score-${score}`, score));
    scoreBlock.appendChild(el('div', `ai-score-trend ai-trend-${trend}`, trendText));
    heroMain.appendChild(scoreBlock);

    const summaryWrap = el('div', 'ai-hero-summary');
    summaryWrap.appendChild(el('div', 'ai-hero-summary-text', te.summary || ''));
    const tags = el('div', 'ai-hero-tags');
    (te.strengths || []).forEach(s => tags.appendChild(el('span', 'ai-tag ai-tag-good', s)));
    (te.weaknesses || []).forEach(w => tags.appendChild(el('span', 'ai-tag ai-tag-bad', w)));
    summaryWrap.appendChild(tags);
    heroMain.appendChild(summaryWrap);
    hero.appendChild(heroMain);

    if (te.analysis) hero.appendChild(el('div', 'ai-analysis-text', te.analysis));

    if (actions[0]) hero.appendChild(renderTopAction(actions[0]));
    root.appendChild(hero);

    const grid = el('div', 'ai-detail-grid');
    grid.appendChild(renderForecastCard(ol));
    if (actions.length > 1) grid.appendChild(renderOtherActionsCard(actions.slice(1)));
    root.appendChild(grid);

    if (data.next_review_focus) {
        const review = el('div', 'ai-review-focus');
        review.appendChild(el('strong', null, '次回の注視ポイント: '));
        review.appendChild(document.createTextNode(data.next_review_focus));
        root.appendChild(review);
    }

    return root;
}

function renderTopAction(a) {
    const box = el('div', 'ai-top-action');
    const top = el('div', 'ai-top-action-top');
    top.appendChild(el('div', 'ai-action-badge', '1'));
    const body = el('div', 'ai-top-action-body');
    body.appendChild(el('div', 'ai-top-action-title', a.title || ''));
    body.appendChild(el('div', 'ai-top-action-rationale', a.rationale || ''));

    const detail = el('div', 'ai-collapsible');
    const toggle = el('div', 'ai-toggle', '具体的なアクションと効果 \u25BE');
    toggle.addEventListener('click', () => detail.classList.toggle('open'));
    body.appendChild(toggle);
    appendActionDetail(detail, a);
    body.appendChild(detail);
    top.appendChild(body);
    box.appendChild(top);
    return box;
}

function renderForecastCard(ol) {
    const card = el('div', 'ai-detail-card');
    card.appendChild(el('div', 'ai-detail-card-title', '完了見込み'));

    (ol.version_forecasts || []).forEach(vf => {
        card.appendChild(el('div', 'ai-forecast-version', vf.version || ''));
        [['opt', '楽観', vf.optimistic], [null, '現実', vf.realistic], ['pes', '悲観', vf.pessimistic]]
            .forEach(([cls, label, val]) => {
                const row = el('div', 'ai-forecast-row');
                row.appendChild(el('div', 'ai-forecast-label' + (cls ? ' ' + cls : ''), label));
                row.appendChild(el('div', 'ai-forecast-value', val || ''));
                card.appendChild(row);
            });
        if (vf.key_risk) {
            const risk = el('div', 'ai-risk');
            risk.appendChild(el('span', 'ai-risk-icon', '\u26A0'));
            risk.appendChild(el('span', null, vf.key_risk));
            card.appendChild(risk);
        }
    });

    if (ol.accuracy_forecast) {
        const sep = el('div', 'ai-separator');
        const txt = el('div', 'ai-detail-text');
        txt.appendChild(el('strong', null, '精度予測: '));
        txt.appendChild(document.createTextNode(ol.accuracy_forecast));
        sep.appendChild(txt);
        card.appendChild(sep);
    }

    if (ol.resource_risks && ol.resource_risks.length) {
        const sep = el('div', 'ai-separator');
        ol.resource_risks.forEach(r => {
            const risk = el('div', 'ai-risk');
            risk.appendChild(el('span', 'ai-risk-icon', '\u26A0'));
            risk.appendChild(el('span', null, r));
            sep.appendChild(risk);
        });
        card.appendChild(sep);
    }

    return card;
}

function renderOtherActionsCard(otherActions) {
    const card = el('div', 'ai-detail-card');
    card.appendChild(el('div', 'ai-detail-card-title', 'その他の推奨アクション'));

    otherActions.forEach((a, i) => {
        const n = i + 2;
        const item = el('div', 'ai-action-item');
        item.appendChild(el('div', `ai-action-num ai-action-n${Math.min(n, 5)}`, String(n)));
        const body = el('div', 'ai-action-body');
        body.appendChild(el('div', 'ai-action-title', a.title || ''));
        body.appendChild(el('div', 'ai-action-cat', a.category || ''));
        body.appendChild(el('div', 'ai-action-rationale', a.rationale || ''));
        item.appendChild(body);
        item.appendChild(el('div', 'ai-action-chevron', '\u25B6'));
        item.addEventListener('click', () => item.classList.toggle('open'));
        card.appendChild(item);

        const extra = el('div', 'ai-action-extra');
        appendActionDetail(extra, a);
        card.appendChild(extra);
    });

    return card;
}

function appendActionDetail(container, a) {
    container.appendChild(el('div', 'ai-detail-label', 'やること'));
    container.appendChild(el('div', 'ai-detail-text', a.action_summary || ''));
    if (a.action_steps && a.action_steps.length) {
        container.appendChild(el('div', 'ai-detail-label', '具体的ステップ'));
        a.action_steps.forEach(s => container.appendChild(el('div', 'ai-detail-text', '\u2192 ' + s)));
    }
    container.appendChild(el('div', 'ai-detail-label', '期待効果'));
    container.appendChild(el('div', 'ai-detail-text', a.expected_effect || ''));
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
}

/* -------------------- 実行フロー -------------------- */

async function executeAnalysis() {
    const section = document.getElementById('ai-analysis-section');
    const content = document.getElementById('ai-analysis-content');
    if (!section || !content) return;

    // データチェック
    const estimates = window.estimates || [];
    if (estimates.length === 0) {
        state.phase = 'error';
        state.error = {
            message: 'データがありません',
            hint: '見積を1件以上入力してから実行してください',
        };
        render(content);
        return;
    }

    const settings = loadSettings();
    const controller = new AbortController();
    state.controller = controller;

    // 要約フェーズ
    state.phase = 'summarizing';
    state.error = null;
    state.elapsedMs = 0;
    startTimer();
    render(content);

    let summary;
    try {
        summary = summarizeFromAppState();
    } catch (err) {
        stopTimer();
        state.phase = 'error';
        state.error = {
            message: `要約生成に失敗しました: ${err.message}`,
            code: 'SUMMARIZE_ERROR',
        };
        render(content);
        return;
    }

    // 推論フェーズ
    state.phase = 'analyzing';
    state.partial = null;
    state.partialTokens = 0;
    state.partialThinking = false;
    render(content);

    try {
        let lastRenderAt = 0;
        const result = await runAnalyze(summary, {
            endpoint: settings.endpoint,
            model: settings.model,
            signal: controller.signal,
            onProgress: (ev) => {
                if (ev.phase !== 'streaming') return;
                state.partialTokens = ev.tokens;
                state.partialThinking = !!ev.thinking;
                if (ev.text) {
                    const parsed = parsePartialJson(ev.text);
                    if (parsed) state.partial = parsed;
                }
                // 200ms ごとに再描画（頻繁すぎる再描画を抑制）
                const now = Date.now();
                if (now - lastRenderAt > 200) {
                    lastRenderAt = now;
                    render(content);
                }
            },
        });
        stopTimer();
        state.phase = 'done';
        state.result = result;
        state.history = appendHistory(result);
        state.selectedIndex = 0;
        state.lastSource = 'fresh';
        state.error = null;
        state.partial = null;
        render(content);
    } catch (err) {
        stopTimer();
        state.partial = null;
        if (err.name === 'AbortError') {
            state.phase = state.result ? 'done' : 'idle';
            render(content);
            return;
        }
        state.phase = 'error';
        state.error = buildErrorDetail(err);
        render(content);
    } finally {
        state.controller = null;
    }
}

function cancelAnalysis() {
    if (state.controller) state.controller.abort();
}

function buildErrorDetail(err) {
    const code = err.code;
    const base = { message: err.message || String(err), code };

    if (code === 'OLLAMA_UNREACHABLE') {
        return {
            ...base,
            message: 'Ollama に接続できません',
            hint: 'ローカルで `ollama serve` が動いていることと、OLLAMA_ORIGINS が設定されていることを確認してください。',
        };
    }
    if (code === 'MODEL_NOT_FOUND') {
        return {
            ...base,
            message: 'モデルが見つかりません',
            hint: '`ollama pull <モデル名>` でダウンロードするか、設定からモデル名を変更してください。',
        };
    }
    if (code === 'OLLAMA_ERROR') {
        return { ...base, hint: 'Ollama サーバーのログを確認してください。' };
    }
    if (code === 'PARSE_ERROR') {
        return {
            ...base,
            message: 'LLM の応答を JSON として解釈できませんでした',
            hint: 'モデルを変えるか、再実行してみてください（LLM 出力の不安定性による一時的な問題の可能性があります）。',
        };
    }
    if (code === 'VALIDATION_ERROR') {
        return {
            ...base,
            hint: 'スキーマ検証に失敗しました。再実行で改善する場合があります。',
        };
    }
    return base;
}

/* -------------------- タイマ -------------------- */

function startTimer() {
    stopTimer();
    const start = Date.now();
    state.elapsedTimer = setInterval(() => {
        state.elapsedMs = Date.now() - start;
        const timerEl = document.getElementById('ai-loading-timer');
        if (!timerEl) return;
        if (state.phase === 'analyzing') {
            timerEl.textContent =
                `${(state.elapsedMs / 1000).toFixed(1)}秒 / ${state.partialTokens} トークン`;
        } else {
            timerEl.textContent = `${(state.elapsedMs / 1000).toFixed(1)} 秒経過`;
        }
    }, 200);
}

function stopTimer() {
    if (state.elapsedTimer) {
        clearInterval(state.elapsedTimer);
        state.elapsedTimer = null;
    }
}
