/**
 * 要約 JSON → Ollama 推論 → 結果 JSON
 *
 * llm-analysis/analyze.py の JavaScript 移植。
 * モデル別に chat / generate API を切り替える挙動を踏襲。
 *
 * fetch 先 URL は定数ではなく関数引数経由で受け取る構造にしてあり、
 * 将来のトンネル変種 (E1) への差替を容易にする。
 */

import { getSystemPrompt, OUTPUT_FORMAT, OUTPUT_SCHEMA } from './llm-prompts.js';

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3.5:9b';
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_NUM_PREDICT = 4096;
const MAX_RETRIES = 2;

/**
 * 要約 JSON から要点テキストを生成
 * LLM がデータを見落とさないよう、重要な数値を先出しする
 * (analyze.py の extract_key_findings と同じロジック)
 */
export function extractKeyFindings(summary) {
    const lines = [];

    const ov = summary.overall || {};
    lines.push(
        `全体: 見積${ov.total_estimate_hours || 0}h / 実績${ov.total_actual_hours || 0}h / 精度${ov.accuracy_percent || 0}%`
    );
    lines.push(
        `  超過タスク${ov.overrun_tasks || 0}件 / 下回り${ov.underrun_tasks || 0}件`
    );

    for (const v of summary.by_version || []) {
        const status = v.status === 'completed' ? '完了' : '進行中';
        let line = `${v.version}(${status}): 見積${v.estimate_hours || 0}h / 実績${v.actual_hours || 0}h / 精度${v.accuracy_percent || 0}%`;
        if (v.remaining_hours != null) {
            line += ` / 残${v.remaining_hours}h / 進捗${v.progress_rate || 0}%`;
        }
        if (v.worst_overrun) {
            const w = v.worst_overrun;
            line += ` / 最大超過: ${w.task}-${w.process}(${w.overrun_percent}%)`;
        }
        lines.push(line);
    }

    const procs = [];
    for (const p of summary.by_process || []) procs.push(`${p.process}精度${p.accuracy}%`);
    if (procs.length > 0) lines.push(`工程別精度: ${procs.join(' / ')}`);

    for (const m of summary.by_member || []) {
        let line = `${m.name}: 見積${m.estimate || 0}h / 実績${m.actual || 0}h / 精度${m.accuracy || 0}%`;
        if (m.weak_process) line += ` / 弱み:${m.weak_process}`;
        lines.push(line);
    }

    for (const mm of summary.member_monthly || []) {
        const high = (mm.months || []).filter(m => m.high_load);
        if (high.length > 0) {
            const mstr = high.map(m => `${m.month}(${m.estimate}h)`).join(', ');
            lines.push(`${mm.name}の高負荷月: ${mstr}`);
        }
    }

    const large = (summary.task_sizes || []).filter(t => (t.total_estimate || 0) >= 80);
    if (large.length > 0) {
        lines.push(
            '大タスク(80h以上): ' +
            large.map(t => `${t.task}(${t.version}, ${t.total_estimate}h, ${t.primary_member})`).join(' / ')
        );
    }

    const anomalies = summary.anomalies || [];
    if (anomalies.length > 0) {
        lines.push(
            '超過タスク: ' +
            anomalies.map(a =>
                `${a.task}-${a.process}(${a.version}, 見積${a.estimate}h→実績${a.actual}h, +${a.overrun_percent}%)`
            ).join(' / ')
        );
    }

    const cap = summary.capacity || {};
    const warn = (cap.monthly || []).filter(m => m.warning);
    if (warn.length > 0) {
        lines.push(
            'キャパシティ警告月: ' +
            warn.map(m => `${m.month}(${m.utilization_percent}%)`).join(', ')
        );
    }

    return lines.join('\n');
}

/**
 * 応答テキストから JSON 部分を抽出してパースする
 * - <think>...</think> を除去
 * - ```json ... ``` フェンスがあれば取り出す
 * - 先頭/末尾の非 JSON テキストを削る
 */
function parseModelResponse(text) {
    let cleaned = (text || '').trim();

    // <think>...</think> 除去
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // ```json フェンス内を優先抽出
    const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) cleaned = fence[1].trim();

    // 先頭が { でなければ最初の { から最後の } を抽出
    if (cleaned.length > 0 && cleaned[0] !== '{') {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
    }

    return JSON.parse(cleaned);
}

/** 出力 JSON の簡易構造検証 */
export function validateAnalysisOutput(output) {
    const errors = [];
    const required = ['team_evaluation', 'outlook', 'recommended_actions', 'next_review_focus'];
    for (const key of required) {
        if (!(key in output)) errors.push(`必須フィールド '${key}' がありません`);
    }

    const te = output.team_evaluation;
    if (te) {
        if (te.score && !['A', 'B', 'C', 'D', 'E'].includes(te.score)) {
            errors.push(`スコアが不正です: ${te.score}`);
        }
        if (te.trend && !['improving', 'stable', 'declining'].includes(te.trend)) {
            errors.push(`トレンドが不正です: ${te.trend}`);
        }
    }

    const actions = output.recommended_actions || [];
    if (actions.length < 3) errors.push(`推奨アクションが ${actions.length} 件（3件以上必要）`);
    else if (actions.length > 5) errors.push(`推奨アクションが多すぎます: ${actions.length}件（5件以下）`);

    // version_forecasts の計算式が記号のままなら警告
    const forecasts = (output.outlook && output.outlook.version_forecasts) || [];
    for (const vf of forecasts) {
        for (const key of ['optimistic', 'realistic', 'pessimistic']) {
            const val = vf[key] || '';
            // 「残工数×係数」「残工数x0.9」など記号が残っているパターン
            if (/残工数[×xX\*]/.test(val) || /×\s*係数/.test(val) || /予想工数$/.test(val)) {
                errors.push(`${vf.version || '?'} ${key}: 計算式に記号が残っています (${val})`);
            }
        }
    }

    return errors;
}

/** 分析期間を要約から推定 */
function detectPeriod(summary) {
    const trend = summary.monthly_trend || [];
    if (trend.length === 0) return '不明';
    return `${trend[0].month || '?'} ~ ${trend[trend.length - 1].month || '?'}`;
}

/** chat API 用 messages を構築 */
function buildChatMessages(summary, summaryJson, systemPrompt, modelBase) {
    const findings = extractKeyFindings(summary);
    const systemContent = `${systemPrompt}

## 出力形式（厳守）
以下のJSON形式に正確に従って回答してください。このスキーマ以外の構造で回答しないでください。

${OUTPUT_FORMAT}`;

    const userContent = `## データの要点（以下の数値を分析で必ず引用すること）
${findings}

## 要約JSON（詳細データ）
\`\`\`json
${summaryJson}
\`\`\`

重要: 上記データに存在するバージョン名・タスク名・メンバー名・数値のみを使って回答してください。データにない数値を作らないでください。`;

    const messages = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
    ];

    // gemma4 はプレフィルで構造を強制
    if (modelBase === 'gemma4') {
        messages.push({ role: 'assistant', content: '{"team_evaluation":{"headline":"' });
    }

    return messages;
}

/** generate API 用の単一プロンプトを構築 */
function buildGeneratePrompt(summaryJson, systemPrompt) {
    return `${systemPrompt}

## 入力データ
以下はチームの工数データの要約です：

\`\`\`json
${summaryJson}
\`\`\`

## 出力形式（厳守）
以下のJSON形式に正確に従って回答してください。このスキーマ以外の構造で回答しないでください。

${OUTPUT_FORMAT}`;
}

/**
 * Ollama を呼び出す
 * @returns {Promise<{text: string, elapsedMs: number, tokens: number|null}>}
 */
async function callOllama({ endpoint, model, useChat, payloadInput, options, signal, onProgress }) {
    const opts = { temperature: DEFAULT_TEMPERATURE, num_predict: DEFAULT_NUM_PREDICT, ...(options || {}) };

    // think は options ではなくリクエスト直下のパラメータ（Ollama 0.20+ の reasoning model 向け）
    // stream:true で NDJSON を受信してトークンごとに進捗通知する
    const payload = useChat
        ? { model, messages: payloadInput, format: OUTPUT_SCHEMA, stream: true, think: false, options: opts }
        : { model, prompt: payloadInput, format: 'json', stream: true, think: false, options: opts };

    const url = `${endpoint.replace(/\/$/, '')}/api/${useChat ? 'chat' : 'generate'}`;
    onProgress?.({ phase: 'request', model, useChat });

    const start = Date.now();
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        const hint = await classifyFetchError(err);
        const wrapped = new Error(`Ollama への接続に失敗しました (${endpoint}): ${hint}`);
        wrapped.cause = err;
        wrapped.code = 'OLLAMA_UNREACHABLE';
        throw wrapped;
    }

    if (!response.ok) {
        const body = await safeReadText(response);
        const err = new Error(`Ollama HTTP ${response.status}: ${body.slice(0, 200)}`);
        err.code = response.status === 404 ? 'MODEL_NOT_FOUND' : 'OLLAMA_ERROR';
        err.status = response.status;
        throw err;
    }

    // NDJSON をストリームで読み取り
    const { text, tokens } = await readNdjsonStream(response, {
        useChat,
        onProgress,
        startMs: start,
    });
    const elapsedMs = Date.now() - start;

    onProgress?.({ phase: 'complete', elapsedMs, tokens });

    return { text, elapsedMs, tokens };
}

/**
 * Ollama のストリーミング NDJSON を読み取り、チャンクを結合して返す
 */
async function readNdjsonStream(response, { useChat, onProgress, startMs }) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let tokens = 0;

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 改行区切りの NDJSON を1行ずつ処理
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            if (!line) continue;

            let chunk;
            try { chunk = JSON.parse(line); }
            catch { continue; /* 不完全な行はスキップ */ }

            // chat API と generate API で差分吸収
            // qwen3.5:9b 等は thinking フェーズで response が空になるため、
            // thinking デルタもプログレス表示のためにカウント。ただし text には加えない
            // （最終出力は response/content のみ）
            let outputDelta = '';
            let thinkingDelta = '';
            if (useChat) {
                const msg = chunk.message || {};
                outputDelta = msg.content || '';
                thinkingDelta = msg.thinking || '';
            } else {
                outputDelta = chunk.response || '';
                thinkingDelta = chunk.thinking || '';
            }

            if (outputDelta) text += outputDelta;
            if (outputDelta || thinkingDelta) {
                tokens++;
                onProgress?.({
                    phase: 'streaming',
                    tokens,
                    chars: text.length,
                    thinking: !!thinkingDelta && !outputDelta,
                    elapsedMs: Date.now() - startMs,
                    text, // 逐次描画用（partial-JSON パーサに渡す）
                });
            }

            if (chunk.done) {
                tokens = chunk.eval_count ?? tokens;
                // thinking しか無かった場合のフォールバック
                if (!text) {
                    text = useChat
                        ? (chunk.message?.thinking || '')
                        : (chunk.thinking || '');
                }
            }
        }
    }

    return { text, tokens };
}

/** ネットワーク系エラーを人間向けメッセージに変換 */
async function classifyFetchError(err) {
    // ブラウザ環境での fetch エラーの大半は `Failed to fetch` になる
    const msg = (err && err.message) || '';
    if (/Failed to fetch|NetworkError|TypeError/i.test(msg)) {
        return `接続拒否の可能性あり。Ollama が起動しているか、CORS 設定 (OLLAMA_ORIGINS) を確認してください`;
    }
    return msg;
}

async function safeReadText(response) {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

/**
 * Ollama エンドポイントの疎通確認
 * @param {string} endpoint
 * @returns {Promise<{ok: boolean, models?: string[], error?: string}>}
 */
export async function probeOllama(endpoint = DEFAULT_ENDPOINT, { signal, timeoutMs = 2000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const combined = signal ? composeSignals(signal, controller.signal) : controller.signal;

    try {
        const resp = await fetch(`${endpoint.replace(/\/$/, '')}/api/tags`, { signal: combined });
        clearTimeout(timer);
        if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
        const data = await resp.json();
        const models = (data.models || []).map(m => m.name || m.model).filter(Boolean);
        return { ok: true, models };
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') return { ok: false, error: 'タイムアウト (Ollama 未起動の可能性)' };
        return { ok: false, error: await classifyFetchError(err) };
    }
}

function composeSignals(a, b) {
    // AbortSignal.any が使えない環境向けフォールバック
    if (typeof AbortSignal !== 'undefined' && AbortSignal.any) return AbortSignal.any([a, b]);
    const controller = new AbortController();
    const relay = () => controller.abort();
    a.addEventListener('abort', relay, { once: true });
    b.addEventListener('abort', relay, { once: true });
    return controller.signal;
}

/**
 * メインエントリ: 要約 JSON を分析する
 *
 * @param {object} summary - summarize() の返り値
 * @param {object} [options]
 * @param {string} [options.endpoint] - Ollama エンドポイント (default: http://localhost:11434)
 * @param {string} [options.model] - モデル名 (default: qwen3.5:9b)
 * @param {object} [options.ollamaOptions] - temperature 等を上書き
 * @param {number} [options.maxRetries] - 最大リトライ数 (default: 2)
 * @param {AbortSignal} [options.signal] - キャンセル用
 * @param {(ev: object) => void} [options.onProgress] - 進捗コールバック
 * @returns {Promise<object>} 結果 JSON（meta 付与済み）
 */
export async function analyze(summary, options = {}) {
    const endpoint = options.endpoint || DEFAULT_ENDPOINT;
    const model = options.model || DEFAULT_MODEL;
    const maxRetries = options.maxRetries ?? MAX_RETRIES;
    const modelBase = model.split(':')[0].toLowerCase();
    const useChat = modelBase === 'gemma4';

    const summaryJson = JSON.stringify(summary, null, 2);
    const systemPrompt = getSystemPrompt(model);

    const payloadInput = useChat
        ? buildChatMessages(summary, summaryJson, systemPrompt, modelBase)
        : buildGeneratePrompt(summaryJson, systemPrompt);

    // プレフィルを結果に戻すため保持
    const prefill = (useChat && Array.isArray(payloadInput) && payloadInput.at(-1)?.role === 'assistant')
        ? payloadInput.at(-1).content
        : '';

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) options.onProgress?.({ phase: 'retry', attempt, maxRetries });

        let raw;
        try {
            const { text } = await callOllama({
                endpoint,
                model,
                useChat,
                payloadInput,
                options: options.ollamaOptions,
                signal: options.signal,
                onProgress: options.onProgress,
            });
            raw = text;
        } catch (err) {
            // 接続系・サーバー系エラーはリトライせず即上げる
            if (['OLLAMA_UNREACHABLE', 'MODEL_NOT_FOUND', 'OLLAMA_ERROR'].includes(err.code) || err.name === 'AbortError') {
                throw err;
            }
            lastError = err;
            continue;
        }

        // プレフィルの復元
        if (prefill && !raw.trimStart().startsWith('{')) raw = prefill + raw;

        let parsed;
        try {
            parsed = parseModelResponse(raw);
        } catch (err) {
            lastError = Object.assign(new Error(`JSON解析エラー: ${err.message}`), { code: 'PARSE_ERROR', raw });
            continue;
        }

        const errs = validateAnalysisOutput(parsed);
        if (errs.length > 0 && attempt < maxRetries) {
            lastError = Object.assign(new Error(`検証エラー: ${errs.join(' / ')}`), { code: 'VALIDATION_ERROR' });
            continue;
        }

        return {
            meta: {
                generated_at: new Date().toISOString(),
                model,
                source_summary: 'browser',
                analysis_period: detectPeriod(summary),
                endpoint,
                validation_warnings: errs.length > 0 ? errs : undefined,
            },
            ...parsed,
        };
    }

    throw lastError || new Error('分析に失敗しました');
}
