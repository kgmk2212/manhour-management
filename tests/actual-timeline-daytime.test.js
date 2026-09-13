// ============================================
// 回帰テスト: js/actual-timeline.js の日別ビュー時刻変換ユーティリティ
//   startTimeToY / yToStartTime / snapStartTime / clockEndTime / formatClockTime
//   はいずれも DOM に依存しない純粋関数だが、actual-timeline.js は storage.js /
//   actual.js 等を推移的に import するため、history.test.js と同じ最小ポリフィルを
//   import 前に用意する。
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: () => [],
};
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};
globalThis.alert = () => {};

const AT = await import('../js/actual-timeline.js');

describe('startTimeToY / yToStartTime（相互変換）', () => {
    test('始業直後(9:00)はY=0', () => {
        assert.equal(AT.startTimeToY(9), 0);
    });
    test('10:30はY=108（1.5h×72px）', () => {
        assert.equal(AT.startTimeToY(10.5), 108);
    });
    test('昼休みゾーン内(12:00)はY=216（午前枠の高さ）', () => {
        assert.equal(AT.startTimeToY(12), 216);
    });
    test('13:00（午後開始）はY=288（昼休みゾーンの直後）', () => {
        assert.equal(AT.startTimeToY(13), 288);
    });
    test('Y=0 は 9:00 に戻る', () => {
        assert.equal(AT.yToStartTime(0), 9);
    });
    test('昼休みゾーン内のYは13:00にスナップされる', () => {
        assert.equal(AT.yToStartTime(250), 13);
    });
    test('Y=360（午後72px分）は 14:00', () => {
        assert.equal(AT.yToStartTime(360), 14);
    });
});

describe('snapStartTime', () => {
    test('30分単位に丸める', () => {
        assert.equal(AT.snapStartTime(10.3), 10.5);
    });
    test('昼休み帯(12:00-13:00)は13:00にスナップされる', () => {
        assert.equal(AT.snapStartTime(12.2), 13);
    });
    test('始業時刻(9:00)より前は9:00に切り上げられる', () => {
        assert.equal(AT.snapStartTime(8.5), 9);
    });
});

describe('clockEndTime', () => {
    test('午前枠に収まる場合はそのまま加算', () => {
        assert.equal(AT.clockEndTime(9, 3), 12);
    });
    test('午前枠を超える場合は昼休みをスキップする', () => {
        assert.equal(AT.clockEndTime(9, 4), 14);
    });
    test('午後開始以降はそのまま加算', () => {
        assert.equal(AT.clockEndTime(14, 2), 16);
    });
});

describe('formatClockTime', () => {
    test('9.5 → "9:30"', () => {
        assert.equal(AT.formatClockTime(9.5), '9:30');
    });
    test('13 → "13:00"', () => {
        assert.equal(AT.formatClockTime(13), '13:00');
    });
});
