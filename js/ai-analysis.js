/**
 * AI 分析セクション
 * - localStorage キャッシュ → analysis/latest.json → 空状態 の優先順で表示
 * - 「分析を実行」でブラウザから Ollama に直接 fetch
 * - エンドポイント / モデル名を設定可能（設定は localStorage 永続化）
 */

import { summarizeFromAppState } from './llm-summarize.js';
import { analyze as runAnalyze, probeOllama } from './llm-analyze.js';

const ANALYSIS_PATH = 'analysis/latest.json';
const RESULT_STORAGE_KEY = 'llmAnalysisResult_v1';
const SETTINGS_STORAGE_KEY = 'llmAnalysisSettings_v1';
const DEFAULT_SETTINGS = Object.freeze({
    endpoint: 'http://localhost:11434',
    model: 'qwen3.5:9b',
});

const state = {
    phase: 'idle',           // idle | summarizing | analyzing | done | error
    result: null,            // 結果 JSON
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

function loadCachedResult() {
    try {
        const raw = localStorage.getItem(RESULT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.team_evaluation) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveCachedResult(result) {
    try {
        localStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(result));
    } catch {
        /* ignore */
    }
}

/* -------------------- 初期化 -------------------- */

export async function initAiAnalysis() {
    const section = document.getElementById('ai-analysis-section');
    const content = document.getElementById('ai-analysis-content');
    if (!section || !content) return;

    // セクションは常に表示する（空状態でも実行ボタンを出すため）
    section.style.display = '';

    // 1. ローカルキャッシュを最優先
    const cached = loadCachedResult();
    if (cached) {
        state.phase = 'done';
        state.result = cached;
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

    if (state.phase === 'summarizing' || state.phase === 'analyzing') {
        content.appendChild(renderLoading());
        return;
    }

    if (state.phase === 'error') {
        content.appendChild(renderError());
        // 直近の結果があれば参考表示
        if (state.result) content.appendChild(renderResult(state.result, { dimmed: true }));
        return;
    }

    if (state.phase === 'done' && state.result) {
        content.appendChild(renderResult(state.result));
        return;
    }

    // idle
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

function renderSettingsPanel() {
    const panel = el('div', 'ai-settings-panel');
    panel.id = 'ai-settings-panel';
    panel.style.display = 'none';

    const settings = loadSettings();

    const makeField = (label, key, placeholder) => {
        const row = el('div', 'ai-settings-row');
        row.appendChild(el('label', null, label));
        const input = el('input');
        input.type = 'text';
        input.value = settings[key];
        input.placeholder = placeholder;
        input.addEventListener('change', () => {
            const current = loadSettings();
            current[key] = input.value.trim() || DEFAULT_SETTINGS[key];
            saveSettings(current);
        });
        row.appendChild(input);
        return row;
    };

    panel.appendChild(makeField('Ollama エンドポイント', 'endpoint', DEFAULT_SETTINGS.endpoint));
    panel.appendChild(makeField('モデル名', 'model', DEFAULT_SETTINGS.model));

    const probeRow = el('div', 'ai-settings-row ai-settings-probe');
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
    probeRow.appendChild(probeBtn);
    probeRow.appendChild(probeStatus);
    panel.appendChild(probeRow);

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
    const label = state.phase === 'summarizing' ? 'データを要約しています…' : 'Ollama で推論しています…';
    box.appendChild(el('div', 'ai-loading-label', label));
    const timer = el('div', 'ai-loading-timer', `${(state.elapsedMs / 1000).toFixed(1)} 秒経過`);
    timer.id = 'ai-loading-timer';
    box.appendChild(timer);
    const hint = el('div', 'ai-loading-hint',
        '数十秒〜数分かかることがあります。「キャンセル」で中止できます。');
    box.appendChild(hint);
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

function renderResult(data, { dimmed = false } = {}) {
    const root = el('div', dimmed ? 'ai-result-dimmed' : null);

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
    titleWrap.appendChild(el('h2', null, te.headline ? te.headline : 'AI分析'));
    heroTop.appendChild(titleWrap);
    const metaWrap = el('div', 'ai-hero-meta');
    if (meta.model) metaWrap.appendChild(el('span', 'ai-model-tag', meta.model));
    if (meta.generated_at) metaWrap.appendChild(el('span', null, formatDate(meta.generated_at)));
    if (meta.analysis_period) metaWrap.appendChild(el('span', null, meta.analysis_period));
    if (state.lastSource === 'cache') metaWrap.appendChild(el('span', 'ai-source-tag', 'キャッシュ'));
    if (state.lastSource === 'file') metaWrap.appendChild(el('span', 'ai-source-tag', 'ファイル'));
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
    render(content);

    try {
        const result = await runAnalyze(summary, {
            endpoint: settings.endpoint,
            model: settings.model,
            signal: controller.signal,
            onProgress: () => {/* 現状はタイマ更新のみなのでノーオペ */},
        });
        stopTimer();
        state.phase = 'done';
        state.result = result;
        state.lastSource = 'fresh';
        state.error = null;
        saveCachedResult(result);
        render(content);
    } catch (err) {
        stopTimer();
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
        const el = document.getElementById('ai-loading-timer');
        if (el) el.textContent = `${(state.elapsedMs / 1000).toFixed(1)} 秒経過`;
    }, 200);
}

function stopTimer() {
    if (state.elapsedTimer) {
        clearInterval(state.elapsedTimer);
        state.elapsedTimer = null;
    }
}
