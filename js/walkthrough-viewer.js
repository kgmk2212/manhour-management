/**
 * [PREVIEW ONLY] ウォークスルービューア
 *
 * このモジュールは experiment/redesign-impl ブランチ専用です。
 * main へのマージ時は削除してください。
 *
 * アプリ内から実装済み改善のウォークスルーを参照するためのフローティングUI。
 */

/**
 * 実装済みウォークスルーのメタデータ
 * 新しい改善を実装したらここに追記する
 */
const WALKTHROUGHS = [
    {
        id: 'G-20',
        title: '未入力日ハイライト',
        category: '運用',
        color: '#C2410C',
        date: '2026-04-14',
        summary: '営業日で実績未入力の日をカレンダー上で強調。入力忘れを早期発見',
        path: 'docs/improvements/walkthrough/G-20.html',
        tags: ['カレンダー', '実績', '警告']
    },
    {
        id: 'H-24',
        title: '入力バリデーション + 重複検出',
        category: 'データ品質',
        color: '#1E3A5F',
        date: '2026-04-14',
        summary: '時間超過・未来日・重複を保存前に検出してデータ汚染を防止',
        path: 'docs/improvements/walkthrough/H-24.html',
        tags: ['入力', '検証', 'ダイアログ']
    },
    {
        id: 'A-2',
        title: '前日の実績をまとめてコピー',
        category: 'UX',
        color: '#2D5A27',
        date: '2026-04-14',
        summary: '前営業日の実績を選択的にコピー。繰り返し作業の入力時間を大幅削減',
        path: 'docs/improvements/walkthrough/A-2.html',
        tags: ['クイック入力', '効率化']
    }
];

/**
 * モーダルを開く
 */
export function openWalkthroughViewer() {
    let modal = document.getElementById('walkthroughViewerModal');
    if (!modal) {
        modal = createModalElement();
        document.body.appendChild(modal);
    }
    renderModalContent(modal);
    modal.classList.add('active');
    // Escキーで閉じる
    document.addEventListener('keydown', handleEscClose);
}

/**
 * モーダルを閉じる
 */
export function closeWalkthroughViewer() {
    const modal = document.getElementById('walkthroughViewerModal');
    if (modal) modal.classList.remove('active');
    document.removeEventListener('keydown', handleEscClose);
}

function handleEscClose(e) {
    if (e.key === 'Escape') closeWalkthroughViewer();
}

/**
 * モーダル要素の作成（初回のみ）
 */
function createModalElement() {
    const modal = document.createElement('div');
    modal.id = 'walkthroughViewerModal';
    modal.className = 'wt-viewer-modal';
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeWalkthroughViewer();
    });
    return modal;
}

/**
 * モーダル内容の描画
 */
function renderModalContent(modal) {
    modal.textContent = '';

    const content = document.createElement('div');
    content.className = 'wt-viewer-content';

    // Header
    const header = document.createElement('div');
    header.className = 'wt-viewer-header';

    const titleGroup = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = 'wt-viewer-badge';
    badge.textContent = 'PREVIEW';
    const title = document.createElement('h2');
    title.className = 'wt-viewer-title';
    title.textContent = '改善提案 · 動作確認ガイド';
    const subtitle = document.createElement('p');
    subtitle.className = 'wt-viewer-subtitle';
    subtitle.textContent = 'このブランチ（experiment/redesign-impl）で実装した改善の操作手順を確認できます';
    titleGroup.appendChild(badge);
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'wt-viewer-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', '閉じる');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeWalkthroughViewer);

    header.appendChild(titleGroup);
    header.appendChild(closeBtn);
    content.appendChild(header);

    // Meta stats
    const meta = document.createElement('div');
    meta.className = 'wt-viewer-meta';
    const implCount = WALKTHROUGHS.length;
    const stats = [
        { label: '実装済み', value: implCount },
        { label: '改善提案総数', value: 146 },
        { label: '進捗', value: `${((implCount / 146) * 100).toFixed(1)}%` }
    ];
    stats.forEach(s => {
        const cell = document.createElement('div');
        cell.className = 'wt-viewer-stat';
        const val = document.createElement('div');
        val.className = 'wt-viewer-stat-value';
        val.textContent = s.value;
        const lbl = document.createElement('div');
        lbl.className = 'wt-viewer-stat-label';
        lbl.textContent = s.label;
        cell.appendChild(val);
        cell.appendChild(lbl);
        meta.appendChild(cell);
    });
    content.appendChild(meta);

    // Cards
    const grid = document.createElement('div');
    grid.className = 'wt-viewer-grid';

    WALKTHROUGHS.forEach(w => {
        const card = document.createElement('div');
        card.className = 'wt-viewer-card';
        card.style.setProperty('--card-accent', w.color);

        const cardHeader = document.createElement('div');
        cardHeader.className = 'wt-viewer-card-header';
        const idTag = document.createElement('span');
        idTag.className = 'wt-viewer-id-tag';
        idTag.textContent = w.id;
        const cat = document.createElement('span');
        cat.className = 'wt-viewer-category';
        cat.textContent = w.category;
        cardHeader.appendChild(idTag);
        cardHeader.appendChild(cat);

        const cardTitle = document.createElement('h3');
        cardTitle.className = 'wt-viewer-card-title';
        cardTitle.textContent = w.title;

        const cardSummary = document.createElement('p');
        cardSummary.className = 'wt-viewer-card-summary';
        cardSummary.textContent = w.summary;

        const tags = document.createElement('div');
        tags.className = 'wt-viewer-tags';
        w.tags.forEach(t => {
            const tag = document.createElement('span');
            tag.className = 'wt-viewer-tag';
            tag.textContent = t;
            tags.appendChild(tag);
        });

        const cardFooter = document.createElement('div');
        cardFooter.className = 'wt-viewer-card-footer';
        const dateText = document.createElement('span');
        dateText.className = 'wt-viewer-date';
        dateText.textContent = w.date;
        const openBtn = document.createElement('a');
        openBtn.className = 'wt-viewer-open-btn';
        openBtn.href = w.path;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener noreferrer';
        openBtn.textContent = 'ガイドを開く →';
        cardFooter.appendChild(dateText);
        cardFooter.appendChild(openBtn);

        card.appendChild(cardHeader);
        card.appendChild(cardTitle);
        card.appendChild(cardSummary);
        card.appendChild(tags);
        card.appendChild(cardFooter);
        grid.appendChild(card);
    });

    content.appendChild(grid);

    // Quick links
    const links = document.createElement('div');
    links.className = 'wt-viewer-links';

    const linkData = [
        { label: '📋 改善提案サマリー (146件)', href: 'docs/improvements/' },
        { label: '📝 進捗ログ', href: 'docs/improvements/progress.md' },
        { label: '📚 設計書一覧', href: 'docs/improvements/README.md' },
        { label: '🗂 ウォークスルー一覧ページ', href: 'docs/improvements/walkthrough/' }
    ];
    linkData.forEach(l => {
        const a = document.createElement('a');
        a.className = 'wt-viewer-quick-link';
        a.href = l.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = l.label;
        links.appendChild(a);
    });
    content.appendChild(links);

    modal.appendChild(content);
}

/**
 * フローティング起動ボタンの初期化
 */
export function initWalkthroughViewerButton() {
    // 既存のボタンがあれば何もしない
    if (document.getElementById('walkthroughViewerBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'walkthroughViewerBtn';
    btn.className = 'wt-viewer-float-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', '改善ガイドを開く');
    btn.title = '改善ガイドを開く (プレビュー環境専用)';

    const icon = document.createElement('span');
    icon.className = 'wt-viewer-float-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '?';

    const label = document.createElement('span');
    label.className = 'wt-viewer-float-label';
    label.textContent = '改善ガイド';

    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('click', openWalkthroughViewer);
    document.body.appendChild(btn);
}

console.log('✅ モジュール walkthrough-viewer.js loaded (preview only)');
