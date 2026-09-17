// ============================================
// 特性テスト: js/theme.js
//   buildFaviconDataUri() — テーマカラーに応じたfavicon用SVG data URIの生成を固定する。
//   theme.js は state.js の setter（window.xxx = value）に依存するため、
//   tests/state.test.js と同じくwindowポリフィルが必要。
// ============================================
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const { buildFaviconDataUri } = await import('../js/theme.js');

describe('buildFaviconDataUri() — テーマカラーに応じたfavicon SVG data URI', () => {
    test('data:image/svg+xml, で始まり、渡した色がそのまま埋め込まれる', () => {
        const uri = buildFaviconDataUri('#2A6080', '#EDF3F8');
        assert.match(uri, /^data:image\/svg\+xml,/);
        const svg = decodeURIComponent(uri.replace('data:image/svg+xml,', ''));
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/);
        assert.match(svg, /fill="#2A6080"/);
        // accentLightは背景以外の5要素（clock ring・clock hands・bar×3）すべてに使われる
        const lightMatches = svg.match(/#EDF3F8/g) ?? [];
        assert.equal(lightMatches.length, 5);
    });

    test('異なるテーマカラーを渡すと出力も変わる（キャッシュ・固定値になっていない）', () => {
        const forest = buildFaviconDataUri('#2D5A27', '#EBF5EA');
        const ink = buildFaviconDataUri('#1A1814', '#F0EEEA');
        assert.notEqual(forest, ink);
    });
});
