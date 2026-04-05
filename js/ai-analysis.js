/**
 * AI分析セクション — 結果JSONをfetchして表示
 * analysis/ ディレクトリに配置された結果JSONを読み込み、
 * 分析タブ内にレンダリングする。
 */

const ANALYSIS_PATH = 'analysis/latest.json';

/** DOM要素を生成するヘルパー */
function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
}

/**
 * AI分析セクションを初期化
 * 結果JSONが存在すればレンダリング、なければセクション非表示
 */
export async function initAiAnalysis() {
    const section = document.getElementById('ai-analysis-section');
    const content = document.getElementById('ai-analysis-content');
    if (!section || !content) return;

    try {
        const resp = await fetch(ANALYSIS_PATH);
        if (!resp.ok) {
            section.style.display = 'none';
            return;
        }
        const data = await resp.json();
        if (!data.team_evaluation) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';
        render(content, data);
    } catch {
        section.style.display = 'none';
    }
}

/**
 * 結果JSONをDOMにレンダリング
 */
function render(root, data) {
    const te = data.team_evaluation || {};
    const ol = data.outlook || {};
    const actions = data.recommended_actions || [];
    const meta = data.meta || {};
    const score = te.score || '?';
    const trend = te.trend || 'stable';
    const trendText = trend === 'improving' ? '\u25B2 改善傾向'
        : trend === 'declining' ? '\u25BC 悪化傾向' : '\u25CF 安定';

    root.textContent = '';

    // ---- Hero card ----
    const hero = el('div', 'ai-hero');

    // Top bar
    const heroTop = el('div', 'ai-hero-top');
    const titleWrap = el('div', 'ai-hero-title');
    titleWrap.appendChild(el('div', 'ai-hero-icon', '\u25C6'));
    titleWrap.appendChild(el('h2', null, 'AI分析'));
    heroTop.appendChild(titleWrap);
    const metaWrap = el('div', 'ai-hero-meta');
    metaWrap.appendChild(el('span', 'ai-model-tag', meta.model || ''));
    metaWrap.appendChild(el('span', null, (meta.generated_at || '').slice(0, 10)));
    metaWrap.appendChild(el('span', null, meta.analysis_period || ''));
    heroTop.appendChild(metaWrap);
    hero.appendChild(heroTop);

    // Score + Summary
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

    // Analysis detail
    if (te.analysis) {
        hero.appendChild(el('div', 'ai-analysis-text', te.analysis));
    }

    // Top action
    const topAction = actions[0];
    if (topAction) {
        hero.appendChild(renderTopAction(topAction));
    }
    root.appendChild(hero);

    // ---- Detail grid ----
    const grid = el('div', 'ai-detail-grid');
    grid.appendChild(renderForecastCard(ol));
    if (actions.length > 1) {
        grid.appendChild(renderOtherActionsCard(actions.slice(1)));
    }
    root.appendChild(grid);

    // ---- Review focus ----
    if (data.next_review_focus) {
        const review = el('div', 'ai-review-focus');
        review.appendChild(el('strong', null, '次回の注視ポイント: '));
        review.appendChild(document.createTextNode(data.next_review_focus));
        root.appendChild(review);
    }
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
