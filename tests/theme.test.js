// ============================================
// 特性テスト: js/theme.js
//   buildFaviconDataUri() — favicon用SVG data URIの生成を固定する。
//   テーマに追従するのは「背景色だけ」で、時計・棒グラフの図形の配色
//   （地色 #EBF5EA / 差し色 #C4841D）は採用時の値で固定という仕様を守る。
//   theme.js は state.js の setter（window.xxx = value）に依存するため、
//   tests/state.test.js と同じくwindowポリフィルが必要。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { buildFaviconDataUri } = await import('../js/theme.js');

/** data URI をデコードしてSVG文字列に戻す */
function toSvg(uri) {
    assert.match(uri, /^data:image\/svg\+xml,/);
    return decodeURIComponent(uri.replace('data:image/svg+xml,', ''));
}

describe('buildFaviconDataUri() — 背景だけがテーマに追従するfavicon SVG data URI', () => {
    test('背景の角丸矩形に渡したaccentが使われる', () => {
        const svg = toSvg(buildFaviconDataUri('#2A6080'));
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/);
        assert.match(svg, /<rect width="100" height="100" rx="22" fill="#2A6080"\/>/);
        // accentが使われるのは背景の1箇所だけ（図形には波及しない）
        assert.equal((svg.match(/#2A6080/g) ?? []).length, 1);
    });

    test('図形の地色 #EBF5EA は時計の円周・棒グラフ1〜2本目の計3箇所に固定される', () => {
        const svg = toSvg(buildFaviconDataUri('#2A6080'));
        assert.equal((svg.match(/#EBF5EA/g) ?? []).length, 3);
        assert.match(svg, /<circle [^>]*stroke="#EBF5EA"/);
        assert.match(svg, /<rect x="52" y="62"[^>]*fill="#EBF5EA"\/>/);
        assert.match(svg, /<rect x="65" y="50"[^>]*fill="#EBF5EA"\/>/);
    });

    test('差し色 #C4841D は時計の針・棒グラフ3本目の計2箇所に固定される', () => {
        const svg = toSvg(buildFaviconDataUri('#2A6080'));
        assert.equal((svg.match(/#C4841D/g) ?? []).length, 2);
        assert.match(svg, /<path d="M33 37 V25 M33 37 L41 43"[^>]*stroke="#C4841D"/);
        assert.match(svg, /<rect x="78" y="36"[^>]*fill="#C4841D"\/>/);
    });

    test('テーマを変えても図形部分の配色は一切変わらない（背景の差分のみ）', () => {
        const forest = toSvg(buildFaviconDataUri('#2D5A27'));
        const ink = toSvg(buildFaviconDataUri('#1A1814'));
        assert.notEqual(forest, ink);
        // 背景色のトークンを揃えると完全一致する ＝ 差分は背景だけ
        assert.equal(forest.replace('#2D5A27', 'BG'), ink.replace('#1A1814', 'BG'));
    });

    test('forestテーマの出力は採用時（2026-09-13）のオリジナルデザインと一致する', () => {
        const svg = toSvg(buildFaviconDataUri('#2D5A27'));
        assert.equal(
            svg,
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
            '<rect width="100" height="100" rx="22" fill="#2D5A27"/>' +
            '<circle cx="33" cy="37" r="18" fill="none" stroke="#EBF5EA" stroke-width="6"/>' +
            '<path d="M33 37 V25 M33 37 L41 43" fill="none" stroke="#C4841D" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<rect x="52" y="62" width="9" height="20" rx="3" fill="#EBF5EA"/>' +
            '<rect x="65" y="50" width="9" height="32" rx="3" fill="#EBF5EA"/>' +
            '<rect x="78" y="36" width="9" height="46" rx="3" fill="#C4841D"/>' +
            '</svg>'
        );
    });
});
