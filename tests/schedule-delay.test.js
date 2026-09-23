// ============================================
// 回帰テスト: js/schedule-delay.js
//   予定の遅延（期限超過）情報 getDelayInfo を検証する。
//   schedule-interruption.js は schedule.js 経由で history.js / schedule-render.js /
//   estimate.js / report.js / utils.js を推移的に import するが、いずれもモジュール
//   評価時に DOM を触らないため、history.test.js と同じ最小ポリフィルで足りる。
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
// showToast（schedule.js）が document.createElement / document.body を使うため、
// handleScheduleDrag 等 schedule.js の関数呼び出しに耐えられる最小限のフェイク要素を用意する。
function createFakeElement() {
    return {
        className: '',
        innerHTML: '',
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        remove() {},
        setAttribute() {},
        getAttribute: () => null,
    };
}
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => [],
    createElement: () => createFakeElement(),
    body: createFakeElement(),
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
globalThis.alert = () => {};

const { getDelayInfo } = await import('../js/schedule-delay.js');

const sc = (endDate, status = 'pending') => ({ id: 's', member: '山田', startDate: '2026-09-01', endDate, status });

describe('getDelayInfo', () => {
    test('終了日が今日以降なら遅延なし', () => {
        assert.deepEqual(getDelayInfo(sc('2026-09-24'), '2026-09-24'), { delayed: false });
    });
    test('完了なら終了日が過去でも遅延なし', () => {
        assert.deepEqual(getDelayInfo(sc('2026-09-10', 'completed'), '2026-09-24'), { delayed: false });
    });
    test('終了日翌日〜今日を超過期間とし、営業日数を数える', () => {
        // 09-10(木) 終了、今日 09-16(水)。超過は 09-11〜09-16 で、土日を除く営業日は 11・14・15・16 の4日
        // （node テストでは祝日ライブラリが読み込まれないため、祝日を含まない期間で検証する）
        const info = getDelayInfo(sc('2026-09-10'), '2026-09-16');
        assert.equal(info.delayed, true);
        assert.equal(info.overrunStart, '2026-09-11');
        assert.equal(info.overrunEnd, '2026-09-16');
        assert.equal(info.businessDays, 4);
    });
});
