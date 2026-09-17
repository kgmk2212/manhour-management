// ============================================
// 特性テスト: js/theme.js
//   buildFaviconDataUri() / ICON_HIGHLIGHT_COLORS — アプリアイコンの配色ルールを固定する。
//   ルール:
//     背景   = テーマの accent（可変）
//     地色   = #EBF5EA 固定（時計の円周・棒グラフ1〜2本目）
//     差し色 = テーマごとに定義（時計の針・棒グラフ3本目）。背景に対し最低 3:1
//   theme.js は state.js の setter（window.xxx = value）に依存するため、
//   tests/state.test.js と同じくwindowポリフィルが必要。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

before(() => {
    globalThis.window = globalThis;
});

const { buildFaviconDataUri, ICON_HIGHLIGHT_COLORS } = await import('../js/theme.js');

const srcPath = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const themeSrc = readFileSync(srcPath('../js/theme.js'), 'utf8');
const generatorSrc = readFileSync(srcPath('../scripts/generate-app-icons.mjs'), 'utf8');

/** js/theme.js の THEME_COLORS（非export）から accent だけを取り出す */
function parseAccents() {
    const block = themeSrc.match(/const THEME_COLORS = \{([\s\S]*?)\n\};/)[1];
    const out = {};
    for (const m of block.matchAll(/'([\w-]+)':\s*\{\s*accent:\s*'(#[0-9A-Fa-f]{6})'/g)) {
        out[m[1]] = m[2];
    }
    return out;
}

/** scripts/generate-app-icons.mjs の THEME_ICON_COLORS（手動複製）を取り出す */
function parseGeneratorColors() {
    const block = generatorSrc.match(/const THEME_ICON_COLORS = \{([\s\S]*?)\n\};/)[1];
    const out = {};
    for (const m of block.matchAll(/"?([\w-]+)"?:\s*\["(#[0-9A-Fa-f]{6})",\s*"(#[0-9A-Fa-f]{6})"\]/g)) {
        out[m[1]] = { accent: m[2], highlight: m[3] };
    }
    return out;
}

const toLinear = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/** 相対輝度（WCAG 2.x） */
function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** コントラスト比（WCAG 2.x） */
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** data URI をデコードしてSVG文字列に戻す */
function toSvg(uri) {
    assert.match(uri, /^data:image\/svg\+xml,/);
    return decodeURIComponent(uri.replace('data:image/svg+xml,', ''));
}

describe('buildFaviconDataUri() — favicon SVG data URI の構造', () => {
    test('背景の角丸矩形に渡したaccentが使われ、図形には波及しない', () => {
        const svg = toSvg(buildFaviconDataUri('#2A6080', '#E6B12E'));
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/);
        assert.match(svg, /<rect width="100" height="100" rx="22" fill="#2A6080"\/>/);
        assert.equal((svg.match(/#2A6080/g) ?? []).length, 1);
    });

    test('地色 #EBF5EA は時計の円周・棒グラフ1〜2本目の計3箇所に固定される', () => {
        const svg = toSvg(buildFaviconDataUri('#2A6080', '#E6B12E'));
        assert.equal((svg.match(/#EBF5EA/g) ?? []).length, 3);
        assert.match(svg, /<circle [^>]*stroke="#EBF5EA"/);
        assert.match(svg, /<rect x="52" y="62"[^>]*fill="#EBF5EA"\/>/);
        assert.match(svg, /<rect x="65" y="50"[^>]*fill="#EBF5EA"\/>/);
    });

    test('差し色は時計の針・棒グラフ3本目の計2箇所に入る', () => {
        const svg = toSvg(buildFaviconDataUri('#2A6080', '#E6B12E'));
        assert.equal((svg.match(/#E6B12E/g) ?? []).length, 2);
        assert.match(svg, /<path d="M33 37 V25 M33 37 L41 43"[^>]*stroke="#E6B12E"/);
        assert.match(svg, /<rect x="78" y="36"[^>]*fill="#E6B12E"\/>/);
    });

    test('差し色を省略するとブランドのアンバー #C4841D になる', () => {
        assert.equal(buildFaviconDataUri('#2D5A27'), buildFaviconDataUri('#2D5A27', '#C4841D'));
    });

    test('背景と差し色以外は、テーマが変わっても完全に同一（地色・形状は不変）', () => {
        const normalize = (bg, hl) =>
            toSvg(buildFaviconDataUri(bg, hl)).replaceAll(bg, 'BG').replaceAll(hl, 'HL');
        assert.equal(normalize('#2D5A27', '#C4841D'), normalize('#0F766E', '#F2B845'));
    });

    test('forestテーマの出力は採用時（2026-09-13）のオリジナルデザインと一致する', () => {
        const svg = toSvg(buildFaviconDataUri('#2D5A27', ICON_HIGHLIGHT_COLORS['forest']));
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

describe('ICON_HIGHLIGHT_COLORS — テーマ別の差し色', () => {
    const accents = parseAccents();

    test('THEME_COLORS の全テーマに差し色が定義されている（過不足なし）', () => {
        assert.deepEqual(Object.keys(ICON_HIGHLIGHT_COLORS).sort(), Object.keys(accents).sort());
    });

    test('既定テーマ forest はブランドのアンバー #C4841D を据え置く', () => {
        assert.equal(ICON_HIGHLIGHT_COLORS['forest'], '#C4841D');
    });

    for (const [theme, accent] of Object.entries(accents)) {
        test(`${theme}: 差し色が背景に対し 3:1 以上（forest のみ据え置きで 2.5 以上）`, () => {
            const ratio = contrast(ICON_HIGHLIGHT_COLORS[theme], accent);
            const floor = theme === 'forest' ? 2.5 : 3.0;
            assert.ok(ratio >= floor, `${theme}: ${ratio.toFixed(2)} < ${floor}`);
        });

        test(`${theme}: 差し色が地色 #EBF5EA と十分に判別できる（1.5:1 以上）`, () => {
            const ratio = contrast(ICON_HIGHLIGHT_COLORS[theme], '#EBF5EA');
            assert.ok(ratio >= 1.5, `${theme}: ${ratio.toFixed(2)} < 1.5`);
        });
    }
});

describe('scripts/generate-app-icons.mjs の色定義の複製', () => {
    test('js/theme.js の accent・差し色と完全に一致している（ずれたらPNG再生成が必要）', () => {
        const expected = Object.fromEntries(
            Object.entries(parseAccents()).map(([t, accent]) => [
                t, { accent, highlight: ICON_HIGHLIGHT_COLORS[t] }
            ])
        );
        assert.deepEqual(parseGeneratorColors(), expected);
    });
});
