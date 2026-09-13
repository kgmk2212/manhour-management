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

// ============================================
// 回帰テスト: 担当者マスタ（manhour_members）の永続化配線
//   loadData() は manhour_members が「一度も保存されていない」場合のみ
//   見積・実績データから初回移行（buildInitialMembersFromLegacyData）を行う。
//   savedMembers の判定は「取得した生文字列が truthy か」であるべきで、
//   "[]"（=空配列を保存済み）は truthy のため再移行してはならない。
//   ここが `if (savedMembers) {...} else {...}` の条件を誤ると、
//   一度全員をアーカイブ/削除して空にしたはずのマスタが、再読み込みのたびに
//   見積・実績データから復活してしまう。
// ============================================
describe('loadData() — 担当者マスタ（manhour_members）の初回移行判定', () => {
    test('manhour_members キーが一度も無い場合、見積・実績データから移行される', () => {
        globalThis.localStorage._map.clear();
        globalThis.localStorage.setItem('manhour_estimates', JSON.stringify([
            { id: 1, version: 'v1', task: 'T1', process: 'P', member: '山田', hours: 1 },
        ]));
        globalThis.localStorage.setItem('manhour_actuals', JSON.stringify([
            { id: 2, date: '2026-09-01', version: 'v1', task: 'T1', process: 'P', member: '鈴木', hours: 1 },
        ]));
        // manhour_members キー自体を設定しない（一度も保存されていない状態を再現）

        Storage.loadData();

        const names = State.members.map(m => m.name).sort();
        assert.deepEqual(names, ['山田', '鈴木'].sort(), '見積・実績に登場する担当者名からマスタが生成されること');
        assert.ok(State.members.length > 0, '初回移行でマスタが空でないこと');
    });

    test('manhour_members が "[]" として保存済みの場合、見積・実績データがあっても再移行されない', () => {
        globalThis.localStorage._map.clear();
        // 移行対象になり得る見積・実績データをあえて残した状態で…
        globalThis.localStorage.setItem('manhour_estimates', JSON.stringify([
            { id: 1, version: 'v1', task: 'T1', process: 'P', member: '山田', hours: 1 },
        ]));
        globalThis.localStorage.setItem('manhour_actuals', JSON.stringify([
            { id: 2, date: '2026-09-01', version: 'v1', task: 'T1', process: 'P', member: '鈴木', hours: 1 },
        ]));
        // …manhour_members は「空配列として保存済み」（＝ユーザーが全員削除した後の状態）
        globalThis.localStorage.setItem('manhour_members', '[]');

        Storage.loadData();

        assert.deepEqual(State.members, [], '保存済みの空配列がそのまま尊重され、見積・実績から再移行されないこと');
    });
});

// ============================================
// 補足: handleFileImport() の data.members 有無パターン（present/absent/empty）については
// このファイルに直接のテストを追加していない。handleFileImport() は
// FileReader/DOM の change イベント経由で駆動される非同期フローで、
// このテストファイルの既存ポリフィル（window/document/localStorage の最小スタブのみ）には
// File/FileReader 相当の仕組みが用意されていない。それらを新規に用意するのは
// このファイルにまだ存在しないテスト基盤を発明することになるため、指示に従い見送った。
// ロジック自体（js/storage.js の handleFileImport 内、data.members の
// Array.isArray 判定と buildInitialMembersFromLegacyData への委譲）は
// loadData() 側の同等ロジック（上記2テスト）で間接的にカバーされている。
// ============================================
