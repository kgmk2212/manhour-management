// ============================================
// ビューポート診断（実機固有の固定要素ずれの証拠採取）
// ============================================
//
// 目的: iPhone（ホーム画面起動・Safari）で「JSON バックアップ後に下部 Dock
// (#mobileTabBar) が上にずれ、リロードするまで戻らない」現象の原因を実機で特定する。
// Chromium / WebKit のモバイル幅エミュレーション（390x664, 15 パターン）では
// 再現しないため、レイアウトビューポート・視覚ビューポート・Dock の実測値を
// 端末上で記録し、どの値がずれるのかを突き止めるための計測コードである。
//
// ⚠️ 原因特定後に撤去する一時的な計測コード（docs/BACKLOG.md 参照）。

const STORAGE_KEY = 'manhour_viewportDiag_v1';
/** 記録の保持件数（リングバッファ） */
const MAX_RECORDS = 60;
/** ずれと判定する閾値（px）。小数丸めの誤差を無視する */
const DESYNC_TOLERANCE_PX = 2;
/** ヘッダタイトル長押しで診断パネルを開くまでの時間（ms） */
const LONG_PRESS_MS = 600;
/** バックアップ後に追加スナップショットを撮る時刻（ms） */
const BACKUP_FOLLOWUP_MS = [400, 1200, 3000, 8000];
/** 診断パネルの要素 ID */
const PANEL_ID = 'viewportDiagPanel';

/** イベント連打時の記録間引き間隔（ms） */
const THROTTLE_MS = 150;
let lastLoggedAt = 0;

/**
 * env(safe-area-inset-bottom) の実効値を実測する
 * @returns {number} 下部セーフエリア（px）
 */
function measureSafeAreaBottom() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none;visibility:hidden;';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return Math.round(h);
}

/**
 * 100dvh / 100vh の実効値を実測する（レイアウトビューポート高との比較用）
 * @returns {{dvh: number, vh: number}} 実測値（px）
 */
function measureViewportUnits() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:0;left:0;width:0;height:100dvh;pointer-events:none;visibility:hidden;';
    document.body.appendChild(probe);
    const dvh = Math.round(probe.getBoundingClientRect().height);
    probe.style.height = '100vh';
    const vh = Math.round(probe.getBoundingClientRect().height);
    probe.remove();
    return { dvh, vh };
}

/**
 * 現在のビューポート・Dock の状態を採取する
 * @param {string} label - 採取契機のラベル
 * @returns {Object} スナップショット
 */
export function snapshotViewport(label) {
    const dock = document.getElementById('mobileTabBar');
    const rect = dock ? dock.getBoundingClientRect() : null;
    const dockStyle = dock ? getComputedStyle(dock) : null;
    const bodyStyle = getComputedStyle(document.body);
    const vv = window.visualViewport || null;
    const units = measureViewportUnits();
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');

    // Dock 下端とレイアウトビューポート下端の差。0 が正常（is-hidden 中は -barH 付近）
    const gap = rect ? Math.round(window.innerHeight - rect.bottom) : null;
    // 視覚ビューポートとレイアウトビューポートの食い違い。0 が正常
    const vvGap = vv ? Math.round(vv.height + vv.offsetTop - window.innerHeight) : null;

    return {
        t: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
        label,
        gap,
        vvGap,
        innerH: window.innerHeight,
        innerW: window.innerWidth,
        clientH: document.documentElement.clientHeight,
        dvh: units.dvh,
        vh: units.vh,
        vvH: vv ? Math.round(vv.height) : null,
        vvTop: vv ? Math.round(vv.offsetTop) : null,
        vvScale: vv ? Number(vv.scale.toFixed(2)) : null,
        scrollY: Math.round(window.scrollY),
        docH: document.documentElement.scrollHeight,
        dockTop: rect ? Math.round(rect.top) : null,
        dockBottom: rect ? Math.round(rect.bottom) : null,
        dockH: rect ? Math.round(rect.height) : null,
        dockPos: dockStyle ? dockStyle.position : null,
        dockBottomCss: dockStyle ? dockStyle.bottom : null,
        dockTf: dockStyle ? dockStyle.transform : null,
        dockPadB: dockStyle ? dockStyle.paddingBottom : null,
        isHidden: dock ? dock.classList.contains('is-hidden') : null,
        safeB: measureSafeAreaBottom(),
        bodyPos: bodyStyle.position,
        bodyTop: bodyStyle.top,
        bodyOverflow: bodyStyle.overflow,
        standalone: navigator.standalone === true,
        dpr: window.devicePixelRatio,
    };
}

/**
 * ずれが生じているか判定する
 * @param {Object} s - スナップショット
 * @returns {boolean} ずれていれば true
 */
function isDesynced(s) {
    if (s.vvGap !== null && Math.abs(s.vvGap) > DESYNC_TOLERANCE_PX) return true;
    if (s.gap === null) return false;
    const barH = s.dockH || 0;
    // 正常範囲は「下端に接している(gap=0)」〜「is-hidden で真下に隠れている(gap=-barH)」。
    // その間の値はスライドアニメーション途中なので異常としない（誤検知でログが埋まるのを防ぐ）
    if (s.gap > DESYNC_TOLERANCE_PX) return true;          // 下端より上に浮いている（報告された症状）
    if (s.gap < -barH - DESYNC_TOLERANCE_PX) return true;  // 隠れ幅より深く下にある
    return false;
}

/**
 * 記録済みログを読み出す
 * @returns {Object[]} スナップショット配列
 */
export function readViewportDiagLog() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

/**
 * ビューポート状態を記録する（ずれ検出時と節目のみ）
 * @param {string} label - 契機のラベル
 * @param {boolean} [force=false] - ずれが無くても記録するか
 * @returns {Object|null} 記録したスナップショット（記録しなかった場合 null）
 */
export function logViewportEvent(label, force = false) {
    try {
        const now = Date.now();
        if (!force && now - lastLoggedAt < THROTTLE_MS) return null;
        const snap = snapshotViewport(label);
        if (!force && !isDesynced(snap)) return null;
        lastLoggedAt = now;
        snap.desynced = isDesynced(snap);
        const log = readViewportDiagLog();
        log.push(snap);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(-MAX_RECORDS)));
        return snap;
    } catch (e) {
        return null;
    }
}

/**
 * バックアップ実行を記録し、直後の状態変化も追跡する
 * @param {string} kind - 'export' | 'import' | 'merge'
 * @returns {void}
 */
export function logBackupEvent(kind) {
    logViewportEvent(`backup:${kind}`, true);
    for (const ms of BACKUP_FOLLOWUP_MS) {
        setTimeout(() => logViewportEvent(`backup:${kind}+${ms}ms`, true), ms);
    }
}

/**
 * ログをテキスト化する（貼り付け用）
 * @returns {string} テキスト
 */
export function formatViewportDiagLog() {
    const log = readViewportDiagLog();
    const head = [
        `# ビューポート診断ログ (${log.length}件)`,
        `UA: ${navigator.userAgent}`,
        `standalone: ${navigator.standalone === true} / screen: ${window.screen.width}x${window.screen.height} / dpr: ${window.devicePixelRatio}`,
        '',
        '凡例: gap=innerHeight-Dock下端(正常0) vvGap=視覚VP-レイアウトVP(正常0)',
        '',
    ].join('\n');
    const body = log.map(s => {
        const flag = s.desynced ? '★' : ' ';
        return `${flag}${s.t} ${s.label}\n`
            + `   gap=${s.gap} vvGap=${s.vvGap} isHidden=${s.isHidden} tf=${s.dockTf}\n`
            + `   innerH=${s.innerH} clientH=${s.clientH} dvh=${s.dvh} vh=${s.vh} vvH=${s.vvH} vvTop=${s.vvTop} scale=${s.vvScale}\n`
            + `   dockTop=${s.dockTop} dockBottom=${s.dockBottom} dockH=${s.dockH} padB=${s.dockPadB} safeB=${s.safeB}\n`
            + `   scrollY=${s.scrollY} docH=${s.docH} body=${s.bodyPos}/${s.bodyTop}/${s.bodyOverflow}`;
    }).join('\n');
    return `${head}${body || '(記録なし)'}\n`;
}

/**
 * ログを消去する
 * @returns {void}
 */
export function clearViewportDiagLog() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
}

/**
 * Dock を実測値どおり下端へ引き戻す（切り分け用の手動補正）
 *
 * ずれが getBoundingClientRect で観測できる種類のものなら、この補正で表示が直る。
 * 直らなければ「レイアウト上は正しいが描画だけずれている」種類だと判別できる。
 * リロードで元に戻る一時的な当て物。
 * @returns {{applied: number, before: number|null, after: number|null}} 適用量と前後の gap
 */
export function repairDockPosition() {
    const dock = document.getElementById('mobileTabBar');
    if (!dock) return { applied: 0, before: null, after: null };
    logViewportEvent('repair:before', true);
    const before = Math.round(window.innerHeight - dock.getBoundingClientRect().bottom);
    // 現在の bottom 指定に、浮いている分を差し引いて足し込む
    const current = parseFloat(getComputedStyle(dock).bottom) || 0;
    const applied = Math.round(current - before);
    dock.style.bottom = `${applied}px`;
    const after = Math.round(window.innerHeight - dock.getBoundingClientRect().bottom);
    logViewportEvent(`repair:after(bottom=${applied}px)`, true);
    return { applied, before, after };
}

/**
 * 手動補正を取り消す
 * @returns {void}
 */
export function resetDockPosition() {
    const dock = document.getElementById('mobileTabBar');
    if (dock) dock.style.bottom = '';
    logViewportEvent('repair:reset', true);
}

/**
 * 診断パネルを閉じる
 * @returns {void}
 */
export function closeViewportDiagPanel() {
    const el = document.getElementById(PANEL_ID);
    if (el) el.remove();
}

/**
 * 診断パネルを開く
 * 固定要素がずれている状況でも読めるよう position:absolute で現在のスクロール位置に置く
 * @returns {void}
 */
export function openViewportDiagPanel() {
    closeViewportDiagPanel();
    const snap = snapshotViewport('panel:open');
    const text = `${formatViewportDiagLog()}\n# パネル表示時点\n${JSON.stringify(snap, null, 1)}\n`;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
        'position:absolute', `top:${Math.round(window.scrollY) + 12}px`, 'left:8px', 'right:8px',
        'z-index:100000', 'background:#12100e', 'color:#e8e4dc', 'border:1px solid #55504a',
        'border-radius:10px', 'padding:10px', 'box-shadow:0 10px 30px rgba(0,0,0,.5)',
        'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    ].join(';');

    const status = isDesynced(snap);
    panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <strong style="font-size:13px;">表示診断</strong>
            <span style="padding:2px 6px;border-radius:6px;background:${status ? '#7a2020' : '#20502a'};">
                ${status ? '★ずれ検出中' : '正常'}
            </span>
            <button type="button" data-diag="close" style="margin-left:auto;background:#2b2723;color:#e8e4dc;border:1px solid #55504a;border-radius:6px;padding:4px 10px;font:inherit;">閉じる</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
            <button type="button" data-diag="copy" style="background:#2b2723;color:#e8e4dc;border:1px solid #55504a;border-radius:6px;padding:5px 10px;font:inherit;">全文コピー</button>
            <button type="button" data-diag="repair" style="background:#2b2723;color:#e8e4dc;border:1px solid #55504a;border-radius:6px;padding:5px 10px;font:inherit;">Dockを下端へ補正</button>
            <button type="button" data-diag="reset" style="background:#2b2723;color:#e8e4dc;border:1px solid #55504a;border-radius:6px;padding:5px 10px;font:inherit;">補正解除</button>
            <button type="button" data-diag="clear" style="background:#2b2723;color:#e8e4dc;border:1px solid #55504a;border-radius:6px;padding:5px 10px;font:inherit;">ログ消去</button>
            <span data-diag="msg" style="align-self:center;color:#9c958a;"></span>
        </div>
        <textarea data-diag="text" readonly wrap="off"
            style="width:100%;height:46vh;box-sizing:border-box;background:#1c1916;color:#e8e4dc;border:1px solid #3a352f;border-radius:6px;padding:8px;font:inherit;white-space:pre;overflow:auto;-webkit-user-select:text;user-select:text;"></textarea>
    `;
    document.body.appendChild(panel);

    const ta = panel.querySelector('[data-diag="text"]');
    ta.value = text;
    const msg = panel.querySelector('[data-diag="msg"]');

    panel.addEventListener('click', async (e) => {
        const action = e.target.getAttribute && e.target.getAttribute('data-diag');
        if (action === 'close') {
            closeViewportDiagPanel();
        } else if (action === 'clear') {
            clearViewportDiagLog();
            ta.value = formatViewportDiagLog();
            msg.textContent = '消去しました';
        } else if (action === 'repair') {
            const r = repairDockPosition();
            ta.value = formatViewportDiagLog();
            msg.textContent = `補正 ${r.applied}px 適用（gap ${r.before}→${r.after}）`;
        } else if (action === 'reset') {
            resetDockPosition();
            ta.value = formatViewportDiagLog();
            msg.textContent = '補正を解除しました';
        } else if (action === 'copy') {
            let ok = false;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(ta.value);
                    ok = true;
                }
            } catch (err) { ok = false; }
            if (!ok) {
                ta.focus();
                ta.setSelectionRange(0, ta.value.length);
                try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
            }
            msg.textContent = ok ? 'コピーしました' : '長押しで全選択してコピーしてください';
        }
    });
}

/**
 * ビューポート診断を初期化する
 * - ずれ検出時にイベントを記録
 * - モバイルヘッダのタイトル長押しでパネルを開く
 * @returns {void}
 */
export function initViewportDiag() {
    logViewportEvent('init', true);

    const track = (target, event, label) => {
        if (!target) return;
        target.addEventListener(event, () => logViewportEvent(label), { passive: true });
    };
    track(window, 'resize', 'resize');
    track(window, 'orientationchange', 'orientationchange');
    track(window, 'scroll', 'scroll');
    if (window.visualViewport) {
        track(window.visualViewport, 'resize', 'vv:resize');
        track(window.visualViewport, 'scroll', 'vv:scroll');
    }
    window.addEventListener('pageshow', e => logViewportEvent(`pageshow(persisted=${e.persisted})`, true));
    window.addEventListener('focus', () => logViewportEvent('focus', true));
    document.addEventListener('visibilitychange', () => logViewportEvent(`visibility:${document.visibilityState}`, true));

    // モバイルヘッダのタイトル長押しでパネルを開く（ずれている最中でも到達できる導線）
    const title = document.getElementById('mobileHeaderTitle');
    if (title) {
        let timer = null;
        const start = () => {
            clearTimeout(timer);
            timer = setTimeout(() => openViewportDiagPanel(), LONG_PRESS_MS);
        };
        const cancel = () => clearTimeout(timer);
        title.addEventListener('touchstart', start, { passive: true });
        title.addEventListener('touchend', cancel);
        title.addEventListener('touchmove', cancel, { passive: true });
        title.addEventListener('touchcancel', cancel);
        title.addEventListener('mousedown', start);
        title.addEventListener('mouseup', cancel);
        title.addEventListener('mouseleave', cancel);
    }
}
