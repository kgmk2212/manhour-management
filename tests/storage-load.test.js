// ============================================
// 回帰テスト: js/storage.js loadData() の初期化
//   2026-08-19 監査 P2: スケジュール id が文字列 `sch_N` 前提で
//   `s.id.match(...)` を呼ぶため、数値 id のレコードが混入すると
//   TypeError で初期化が中断し、以降のデータ読み込みが全て走らない。
//
//   storage.js は state.js 経由の import のみで、DOM / window は
//   関数実行時にガード付きで参照するため、最小ポリフィルで Node 実行できる。
// ============================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// --- ポリフィル（import より先に評価される必要があるため top-level） ---
globalThis.window = globalThis;
globalThis.document = {
    getElementById: () => null,
    addEventListener: () => {},
};
globalThis.localStorage = {
    _map: new Map(),
    getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
    setItem(k, v) { this._map.set(k, String(v)); },
    removeItem(k) { this._map.delete(k); },
};
globalThis.alert = () => {};

const State = await import('../js/state.js');
const Storage = await import('../js/storage.js');

describe('loadData() — スケジュール id の形式差に耐える初期化', () => {
    test('数値 id のスケジュールが混入していても TypeError にならず ID カウンタが設定される', () => {
        globalThis.localStorage._map.clear();
        // 数値 id（手動追加やマージ由来で混入しうる）と文字列 id の混在を再現
        globalThis.localStorage.setItem('manhour_schedules', JSON.stringify([
            { id: 123, version: 'v1', task: 'T', member: 'A', startDate: '2026-08-01', endDate: '2026-08-05' },
            { id: 'sch_7', version: 'v1', task: 'T2', member: 'B', startDate: '2026-08-02', endDate: '2026-08-03' },
        ]));

        assert.doesNotThrow(() => Storage.loadData());

        assert.equal(State.schedules.length, 2, 'スケジュール2件が読み込まれること');
        // sch_7 が最大 → 次番は 8（数値 id はカウンタ算出では 0 扱い）
        assert.equal(State.nextScheduleId, 8);
    });
});
