// ============================================
// ガントの canvas をタイルに分けて、画面に見えている付近だけ描く（TiledSurface）
//
// なぜ: 大きな表を 1 枚の canvas に描くと、iOS の上限（1 枚あたり約 1,677 万画素、ページ全体の canvas メモリにも上限）を
// 超えて真っ白になる。解像度を下げて収めるとぼやける。そこで、元の解像度のまま小さなタイルに分け、見えている付近の
// タイルだけを作って描く。描いたタイルはブラウザのスクロールでそのまま動くので、スクロール中に描き直さず揺れない。
//
// 使い方: surface.resize(論理幅, 論理高さ, 表示倍率, 解像度倍率) → surface.setPainter((ctx, clip) => {...})
//        → surface.update() でスクロール位置に合わせてタイルを作って描く。表の内容が変わったら invalidate()
// painter には論理座標で描ける ctx（タイルの位置に合わせた変換済み）と、そのタイルの範囲（論理座標）が渡る。
// surface.ctx は「今あるタイル全部に同じ描画を送る」ctx（描き終えた後に重ねる描画・ピクセルの読み取り用）
// ============================================

/** タイル 1 枚の大きさ（CSS px）。devicePixelRatio 3 でも 1 枚 約 236 万画素に収まる */
const TILE_CSS = 512;
/** 見えている範囲の外側に、先に作っておく幅（CSS px） */
const MARGIN_CSS = 256;

export class TiledSurface {
    /**
     * @param {HTMLElement} host - タイルを並べる要素（position: relative にする）
     * @param {HTMLElement} viewport - この要素の見えている範囲にあるタイルを作る（スクロールする領域）
     */
    constructor(host, viewport) {
        this.host = host;
        this.viewport = viewport;
        this.host.style.position = 'relative';
        this.tiles = new Map();
        this.logicalW = 0;
        this.logicalH = 0;
        this.uiScale = 1;
        this.raster = 1;
        this.painter = null;
        this.scratch = document.createElement('canvas').getContext('2d');
        this.ctx = createMultiContext(this);
    }

    /**
     * 大きさと倍率を設定する（変わったらタイルを作り直す）
     * @param {number} logicalW
     * @param {number} logicalH
     * @param {number} uiScale - 論理 px → CSS px
     * @param {number} raster - 論理 px → canvas の画素
     */
    resize(logicalW, logicalH, uiScale, raster) {
        const changed = logicalW !== this.logicalW || logicalH !== this.logicalH ||
            uiScale !== this.uiScale || raster !== this.raster;
        this.logicalW = logicalW;
        this.logicalH = logicalH;
        this.uiScale = uiScale;
        this.raster = raster;
        this.host.style.width = `${logicalW * uiScale}px`;
        this.host.style.height = `${logicalH * uiScale}px`;
        if (changed) this.clear();
    }

    /** @param {(ctx: CanvasRenderingContext2D, clip: {x: number, y: number, w: number, h: number}) => void} fn */
    setPainter(fn) {
        this.painter = fn;
    }

    /** 全タイルを捨てる */
    clear() {
        this.tiles.forEach(t => t.canvas.remove());
        this.tiles.clear();
    }

    /** 表の内容が変わった: 今あるタイルを描き直す対象にする */
    invalidate() {
        this.tiles.forEach(t => { t.dirty = true; });
    }

    /** 見えている範囲（host 内の CSS px）。viewport と画面の両方で切り取る */
    visibleRect() {
        const h = this.host.getBoundingClientRect();
        const v = this.viewport ? this.viewport.getBoundingClientRect()
            : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const left = Math.max(h.left, v.left, 0);
        const top = Math.max(h.top, v.top, 0);
        const right = Math.min(h.right, v.right, window.innerWidth);
        const bottom = Math.min(h.bottom, v.bottom, window.innerHeight);
        // 画面外（タブ切り替え直後など）でも、左上の 1 画面ぶんは描いておく
        if (right <= left || bottom <= top) {
            return { x: 0, y: 0, w: Math.min(h.width, window.innerWidth), h: Math.min(h.height, window.innerHeight) };
        }
        return { x: left - h.left, y: top - h.top, w: right - left, h: bottom - top };
    }

    /**
     * 見えている付近のタイルを作って描き、遠いタイルを捨てる
     * @param {{x: number, y: number, w: number, h: number}} [rect] - host 内の CSS px（既定は visibleRect()）
     */
    update(rect = this.visibleRect()) {
        if (!this.painter || this.logicalW <= 0 || this.logicalH <= 0) return;
        const cssW = this.logicalW * this.uiScale;
        const cssH = this.logicalH * this.uiScale;
        const c0 = Math.max(0, Math.floor((rect.x - MARGIN_CSS) / TILE_CSS));
        const c1 = Math.min(Math.ceil(cssW / TILE_CSS) - 1, Math.floor((rect.x + rect.w + MARGIN_CSS) / TILE_CSS));
        const r0 = Math.max(0, Math.floor((rect.y - MARGIN_CSS) / TILE_CSS));
        const r1 = Math.min(Math.ceil(cssH / TILE_CSS) - 1, Math.floor((rect.y + rect.h + MARGIN_CSS) / TILE_CSS));

        // 範囲から 1 枚より離れたタイルは捨てる（メモリを抑える）
        this.tiles.forEach((t, key) => {
            if (t.col < c0 - 1 || t.col > c1 + 1 || t.row < r0 - 1 || t.row > r1 + 1) {
                t.canvas.remove();
                this.tiles.delete(key);
            }
        });

        for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
                const key = `${c},${r}`;
                let t = this.tiles.get(key);
                if (!t) {
                    t = this.createTile(c, r, cssW, cssH);
                    this.tiles.set(key, t);
                }
                if (t.dirty) this.paintTile(t);
            }
        }
    }

    createTile(col, row, cssW, cssH) {
        const x = col * TILE_CSS;
        const y = row * TILE_CSS;
        const w = Math.min(TILE_CSS, cssW - x);
        const h = Math.min(TILE_CSS, cssH - y);
        const dpr = this.raster / this.uiScale; // CSS px → 画素
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        canvas.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:block;`;
        this.host.appendChild(canvas);
        return { col, row, x, y, w, h, dpr, canvas, ctx: canvas.getContext('2d'), dirty: true };
    }

    /** タイルの ctx を「論理座標で描ける」状態にする */
    applyBase(t) {
        t.ctx.setTransform(this.raster, 0, 0, this.raster, -t.x * t.dpr, -t.y * t.dpr);
    }

    paintTile(t) {
        const ctx = t.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, t.canvas.width, t.canvas.height);
        this.applyBase(t);
        ctx.save();
        const clip = { x: t.x / this.uiScale, y: t.y / this.uiScale, w: t.w / this.uiScale, h: t.h / this.uiScale };
        ctx.beginPath();
        ctx.rect(clip.x, clip.y, clip.w, clip.h);
        ctx.clip();
        this.painter(ctx, clip);
        ctx.restore();
        t.dirty = false;
    }

    /**
     * 論理座標の点を含むタイル（無ければ null）
     * @returns {Object|null}
     */
    tileAtCss(cx, cy) {
        return this.tiles.get(`${Math.floor(cx / TILE_CSS)},${Math.floor(cy / TILE_CSS)}`) || null;
    }
}

/**
 * 今あるタイル全部に同じ描画を送る ctx を作る（描き終えた後に重ねる描画用）
 * - プロパティの設定（fillStyle など）と描画メソッドは全タイルへ。各タイルは論理座標で描ける変換済み
 * - measureText は作業用 canvas で測る
 * - getImageData(sx, sy, w, h) は「表全体を raster 倍した座標」で受け、該当するタイルから読む（テスト・確認用）
 * - setTransform / resetTransform は各タイルの基準の変換に重ねる
 * @param {TiledSurface} surface
 */
function createMultiContext(surface) {
    const state = {};
    const each = (fn) => surface.tiles.forEach(t => fn(t));
    return new Proxy({}, {
        get(_, prop) {
            if (prop === 'canvas') return surface.host;
            if (prop === 'measureText') {
                return (text) => {
                    if (state.font) surface.scratch.font = state.font;
                    return surface.scratch.measureText(text);
                };
            }
            if (prop === 'getImageData') {
                return (sx, sy, w, h) => {
                    const dpr = surface.raster / surface.uiScale;
                    const t = surface.tileAtCss(sx / dpr, sy / dpr);
                    if (!t) return new ImageData(Math.max(1, w), Math.max(1, h));
                    return t.ctx.getImageData(sx - t.x * dpr, sy - t.y * dpr, w, h);
                };
            }
            if (prop === 'setTransform') {
                return (...args) => each(t => { surface.applyBase(t); if (args.length >= 6) t.ctx.transform(...args); });
            }
            if (prop === 'resetTransform') return () => each(t => surface.applyBase(t));
            const proto = CanvasRenderingContext2D.prototype;
            const desc = Object.getOwnPropertyDescriptor(proto, prop);
            if (desc && typeof desc.value === 'function') {
                return (...args) => {
                    let ret;
                    each(t => { ret = t.ctx[prop](...args); });
                    return ret;
                };
            }
            return state[prop];
        },
        set(_, prop, value) {
            state[prop] = value;
            each(t => { t.ctx[prop] = value; });
            return true;
        }
    });
}
