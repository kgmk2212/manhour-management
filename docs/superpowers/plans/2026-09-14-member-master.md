# 担当者マスタ機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 見積・実績データが0件の状態でも担当者を単独で登録でき、登録した瞬間から全ての入力画面の担当者selectに反映されるようにする。

**Architecture:** `js/members.js` を新設し、`members: [{id, name, archived}]`（配列順=表示順）を単一の真実源とする担当者マスタを導入する。既存の「見積・実績データから動的にSetを作る」ロジックと「`#memberOrder`テキスト欄をDOMから読む」ロジックを、全呼び出し箇所でマスタ参照ヘルパーに置き換える。永続化・Undo/Redo・マージ対応は、既存の「会社休日」機能（`js/vacation.js`）と同じパターンに揃える。

**Tech Stack:** 素のES Modules（ビルド無し）、localStorage、`node --test`（特性テスト）、Playwright（e2e）。

**設計書:** `docs/superpowers/specs/2026-09-14-member-master-design.md`

**実行前提:** このリポジトリは `experiment/ui-scaling` を直接編集しない運用（CLAUDE.md）。実装は `bash scripts/worktree.sh start member-master` で作成される隔離worktree内で行う。各タスクの「Files」に書かれたパスは、その隔離worktreeのルートからの相対パスである。

---

### Task 0: 隔離worktreeの作成

- [ ] **Step 1: worktreeを作成**

Run: `bash scripts/worktree.sh start member-master`
Expected: 新しいworktreeパスが出力される。以後の全タスクはそのパス配下で行う。

- [ ] **Step 2: 作業ディレクトリを確認**

Run: `git branch --show-current`
Expected: `feature/member-master`

---

### Task 1: state.js — 担当者マスタの状態を追加、memberOrderを削除

**Files:**
- Modify: `js/state.js:5-24`（配列・IDカウンタ宣言部）
- Modify: `js/state.js:248`（`memberOrder`宣言）
- Modify: `js/state.js:295-333`（setter群）
- Test: `tests/state.test.js`

- [ ] **Step 1: 失敗するテストを追加**

`tests/state.test.js` の末尾（既存の `nextId()` の `describe` ブロックの後）に追記する:

```js
describe('members / nextMemberId — 担当者マスタの状態', () => {
    test('初期値は空配列・1から始まる', async () => {
        const { members, nextMemberId } = await import('../js/state.js');
        assert.deepEqual(members, []);
        assert.equal(nextMemberId, 1);
    });

    test('setMembers()で配列を丸ごと置き換えられ、window.membersにも反映される', async () => {
        const { setMembers, members } = await import('../js/state.js');
        const next = [{ id: 1, name: '山田', archived: false }];
        setMembers(next);
        const { members: after } = await import('../js/state.js');
        assert.deepEqual(after, next);
        assert.deepEqual(globalThis.window.members, next);
    });

    test('setNextMemberId()でカウンタを更新でき、window.nextMemberIdにも反映される', async () => {
        const { setNextMemberId } = await import('../js/state.js');
        setNextMemberId(5);
        const { nextMemberId } = await import('../js/state.js');
        assert.equal(nextMemberId, 5);
        assert.equal(globalThis.window.nextMemberId, 5);
    });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `node --test tests/state.test.js`
Expected: FAIL（`members`/`nextMemberId`/`setMembers`/`setNextMemberId` が未定義）

- [ ] **Step 3: state.js に担当者マスタの状態を追加**

`js/state.js:5-24` を以下のように変更する（`memberOrder`関連は次のステップで別途消すため、ここでは追加のみ）:

```js
// データ配列
export let estimates = [];
export let filteredEstimates = []; // フィルタリングされた見積データ（renderEstimateList関数で設定）
export let actuals = [];

// 担当者マスタ（配列順=表示順）
export let members = []; // [{id, name, archived}]

// 休日・休暇データ
export let companyHolidays = []; // 会社休日データ
export let vacations = []; // 個人休暇データ
export let remainingEstimates = []; // 見込残存時間データ
export let nonProjectWork = []; // 非プロジェクト作業データ（storage で保存/読込、UI 本体は別途実装予定）

// ID管理
export let nextCompanyHolidayId = 1;
export let nextVacationId = 1;
export let nextMemberId = 1;
// 見積/実績/履歴アクション等の汎用一意IDカウンター。
// Date.now() + Math.random() は浮動小数の精度不足で同一ms内に複数発番すると
// 衝突しうるため、整数の単調増加カウンタに置き換える。
// 初期値はロード時に最大値+1へ書き換える（storage.js）。
export let nextRecordId = 1;
export let nextNonProjectId = 1;
```

- [ ] **Step 4: `memberOrder` 宣言を削除**

`js/state.js:248` 付近の以下の行を削除する:

```js
export let memberOrder = ''; // 担当者の表示順
```

- [ ] **Step 5: setter を追加・`setMemberOrder` を削除**

`js/state.js:310-318` 付近（`setCompanyHolidays`/`setVacations`の並び）に追記する:

```js
export function setMembers(value) {
    members = value;
    window.members = value;
}

export function setCompanyHolidays(value) {
    companyHolidays = value;
    window.companyHolidays = value;
}

export function setVacations(value) {
    vacations = value;
    window.vacations = value;
}
```

`js/state.js:325-328` 付近（`setNextCompanyHolidayId`の並び）に追記する:

```js
export function setNextCompanyHolidayId(value) {
    nextCompanyHolidayId = value;
    window.nextCompanyHolidayId = value;
}

export function setNextMemberId(value) {
    nextMemberId = value;
    window.nextMemberId = value;
}
```

`js/state.js:439-441` 付近にある以下の `setMemberOrder` 関数を削除する:

```js
export function setMemberOrder(value) {
    memberOrder = value;
    window.memberOrder = value;
}
```

- [ ] **Step 6: テストを再実行し成功を確認**

Run: `node --test tests/state.test.js`
Expected: PASS（全件）

- [ ] **Step 7: コミット**

```bash
git add js/state.js tests/state.test.js
git commit -m "feat(state): 担当者マスタの状態を追加しmemberOrderを削除"
```

---

### Task 2: constants.js — ストレージキーの整理

**Files:**
- Modify: `js/constants.js:204-221`（`STORAGE_KEYS`）

- [ ] **Step 1: `STORAGE_KEYS` を編集**

`js/constants.js:204-221` を以下に置き換える（`MEMBER_ORDER`を削除し`MEMBERS`を追加。`MEMBER_ORDER`は`manhour_memberOrder`という独立キーとしては使われておらず[実体は`manhour_settings`内の`memberOrder`フィールド]、コード中の他の場所からも参照されていないため削除して安全）:

```js
export const STORAGE_KEYS = {
    // データ
    ESTIMATES: 'manhour_estimates',
    ACTUALS: 'manhour_actuals',
    REMAINING_ESTIMATES: 'manhour_remainingEstimates',
    COMPANY_HOLIDAYS: 'manhour_companyHolidays',
    VACATIONS: 'manhour_vacations',
    MEMBERS: 'manhour_members',

    // 設定
    THEME_COLOR: 'manhour_themeColor',
    THEME_PATTERN: 'manhour_themePattern',
    TAB_COLOR: 'manhour_tabColor',
    BACKGROUND_COLOR: 'manhour_backgroundColor',

    // UI状態
    CURRENT_TAB: 'manhour_currentTab',
    SETTINGS_CATEGORY: 'manhour_settingsCategory',

    // 表示設定
    SHOW_MONTH_COLORS: 'manhour_showMonthColors',
```

（`SHOW_MONTH_COLORS`以降は既存のまま変更しない。表示のため冒頭のみ抜粋）

- [ ] **Step 2: 既存テストがあれば実行**

Run: `node --test`
Expected: PASS（`STORAGE_KEYS.MEMBER_ORDER`を参照しているコードが無いことは事前のgrepで確認済み。念のため全体テストを流す）

- [ ] **Step 3: コミット**

```bash
git add js/constants.js
git commit -m "feat(constants): 担当者マスタのストレージキーを追加"
```

---

### Task 3: members.js — 担当者マスタの純粋ロジック（TDD）

**Files:**
- Create: `js/members.js`
- Test: `tests/members.test.js`

このタスクでは、DOM操作を一切含まない純粋な状態操作関数のみを実装する（`renderMemberList`等のDOM層はTask 4）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/members.test.js` を新規作成する:

```js
// ============================================
// 特性テスト: js/members.js（純粋ロジック部分）
//   state.js のsetter群は window.xxx = value を副作用として実行するため、
//   Node実行時には window がグローバルに存在する必要がある（state.test.jsと同じ理由）。
// ============================================
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

before(() => {
    globalThis.window = globalThis;
});

const State = await import('../js/state.js');
const Members = await import('../js/members.js');

beforeEach(() => {
    State.setMembers([]);
    State.setNextMemberId(1);
    State.setEstimates([]);
    State.setActuals([]);
    State.setSchedules([]);
    State.setVacations([]);
});

describe('addMember() — 担当者の新規追加', () => {
    test('名前を渡すとID採番済みのアクティブな担当者が末尾に追加される', () => {
        const result = Members.addMember('山田');
        assert.equal(result.ok, true);
        assert.deepEqual(State.members, [{ id: 1, name: '山田', archived: false }]);
    });

    test('前後の空白はトリムされる', () => {
        Members.addMember('  佐藤  ');
        assert.equal(State.members[0].name, '佐藤');
    });

    test('空文字はエラーになり追加されない', () => {
        const result = Members.addMember('   ');
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'empty');
        assert.equal(State.members.length, 0);
    });

    test('大小文字・前後空白を無視した重複名はエラーになる', () => {
        Members.addMember('山田');
        const result = Members.addMember(' 山田 ');
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'duplicate');
        assert.equal(State.members.length, 1);
    });

    test('アーカイブ済みの同名も重複としてエラーになる', () => {
        Members.addMember('山田');
        Members.archiveMember(1);
        const result = Members.addMember('山田');
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'duplicate');
    });
});

describe('archiveMember() / restoreMember()', () => {
    test('アーカイブすると archived が true になる', () => {
        Members.addMember('山田');
        const result = Members.archiveMember(1);
        assert.equal(result.ok, true);
        assert.equal(State.members[0].archived, true);
    });

    test('復元すると末尾（アクティブ一覧の末尾）に移動しarchivedがfalseになる', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        Members.archiveMember(1); // 山田をアーカイブ
        Members.restoreMember(1); // 復元
        assert.deepEqual(State.members.map(m => m.name), ['佐藤', '山田']);
        assert.equal(State.members.find(m => m.id === 1).archived, false);
    });

    test('存在しないIDは何もせず ok:false を返す', () => {
        assert.equal(Members.archiveMember(999).ok, false);
        assert.equal(Members.restoreMember(999).ok, false);
    });
});

describe('moveMemberUp() / moveMemberDown() — アクティブな担当者のみを対象に並べ替える', () => {
    test('先頭は上へ移動できない', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        assert.equal(Members.moveMemberUp(1), false);
    });

    test('末尾は下へ移動できない', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        assert.equal(Members.moveMemberDown(2), false);
    });

    test('中間の担当者は隣接するアクティブな担当者と入れ替わる', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        Members.addMember('田中');
        Members.moveMemberUp(2); // 佐藤を上へ
        assert.deepEqual(State.members.map(m => m.name), ['佐藤', '山田', '田中']);
    });

    test('間にアーカイブ済みの担当者が挟まっていても、見た目上の隣（アクティブなメンバー）と入れ替わる', () => {
        Members.addMember('山田');   // id1
        Members.addMember('佐藤');   // id2
        Members.addMember('田中');   // id3
        Members.archiveMember(2);    // 佐藤をアーカイブ（配列上は山田と田中の間に残る）
        // アクティブな並びは [山田, 田中]。田中を上へ移動すると山田と入れ替わるべき。
        Members.moveMemberUp(3);
        const activeNames = State.members.filter(m => !m.archived).map(m => m.name);
        assert.deepEqual(activeNames, ['田中', '山田']);
        // 佐藤（アーカイブ済み）は配列に残っている
        assert.ok(State.members.some(m => m.name === '佐藤' && m.archived));
    });
});

describe('countMemberUsage() — 担当者名を参照しているレコード数', () => {
    test('estimates/actuals/schedules/vacationsを横断して数える', () => {
        State.setEstimates([{ id: 1, member: '山田' }, { id: 2, member: '佐藤' }]);
        State.setActuals([{ id: 1, member: '山田' }]);
        State.setSchedules([{ id: 'sch_1', member: '山田' }]);
        State.setVacations([{ id: 1, member: '山田' }]);
        assert.equal(Members.countMemberUsage('山田'), 4);
        assert.equal(Members.countMemberUsage('佐藤'), 1);
        assert.equal(Members.countMemberUsage('田中'), 0);
    });
});

describe('renameMember() — マスタの改名と既存データへの遡及', () => {
    test('マスタの名前が変わり、対象データのmemberフィールドも一括で置き換わる', () => {
        Members.addMember('山田');
        State.setEstimates([{ id: 10, member: '山田' }, { id: 11, member: '佐藤' }]);
        State.setActuals([{ id: 20, member: '山田' }]);

        const result = Members.renameMember(1, '山田太郎');

        assert.equal(result.ok, true);
        assert.equal(result.oldName, '山田');
        assert.equal(result.newName, '山田太郎');
        assert.deepEqual(result.affected.estimates, [10]);
        assert.deepEqual(result.affected.actuals, [20]);
        assert.equal(State.members[0].name, '山田太郎');
        assert.equal(State.estimates.find(e => e.id === 10).member, '山田太郎');
        assert.equal(State.estimates.find(e => e.id === 11).member, '佐藤'); // 無関係データは変わらない
        assert.equal(State.actuals.find(a => a.id === 20).member, '山田太郎');
    });

    test('重複名への改名はエラーになりデータも変更されない', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        State.setEstimates([{ id: 10, member: '山田' }]);
        const result = Members.renameMember(1, '佐藤');
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'duplicate');
        assert.equal(State.estimates[0].member, '山田');
    });

    test('空文字への改名はエラーになる', () => {
        Members.addMember('山田');
        const result = Members.renameMember(1, '   ');
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'empty');
    });

    test('同名への改名（変更なし）はokだがaffectedは全て空', () => {
        Members.addMember('山田');
        State.setEstimates([{ id: 10, member: '山田' }]);
        const result = Members.renameMember(1, '山田');
        assert.equal(result.ok, true);
        assert.deepEqual(result.affected.estimates, []);
    });
});

describe('getActiveMemberNames() / getAllMemberNames()', () => {
    test('getActiveMemberNamesはマスタ順・アクティブのみを返す', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        Members.archiveMember(2);
        assert.deepEqual(Members.getActiveMemberNames(), ['山田']);
    });

    test('getAllMemberNamesはアーカイブ済みも含めマスタ順で返す', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        Members.archiveMember(2);
        assert.deepEqual(Members.getAllMemberNames(), ['山田', '佐藤']);
    });

    test('getAllMemberNamesはマスタに無い名前もestimates/actuals/schedules/vacationsから安全網として拾う（アルファベット順でマスタの後ろに追加）', () => {
        Members.addMember('山田');
        State.setEstimates([{ id: 1, member: '鈴木' }]);
        State.setActuals([{ id: 1, member: '田中' }]);
        assert.deepEqual(Members.getAllMemberNames(), ['山田', '田中', '鈴木']);
    });
});

describe('getMemberOrderString() — sortMembers()互換の順序文字列', () => {
    test('アクティブな担当者をマスタ順にカンマ結合する', () => {
        Members.addMember('山田');
        Members.addMember('佐藤');
        Members.addMember('田中');
        Members.archiveMember(2);
        assert.equal(Members.getMemberOrderString(), '山田,田中');
    });

    test('担当者が0人なら空文字を返す', () => {
        assert.equal(Members.getMemberOrderString(), '');
    });
});

describe('ensureMembersExist() — 未登録の名前をマスタへ自動追加', () => {
    test('マスタに無い名前だけが追加され、既存の名前は無視される', () => {
        Members.addMember('山田');
        const added = Members.ensureMembersExist(['山田', '佐藤', '田中', '佐藤']);
        assert.equal(added, 2);
        assert.deepEqual(State.members.map(m => m.name), ['山田', '佐藤', '田中']);
    });

    test('アーカイブ済みの名前は再追加されない', () => {
        Members.addMember('山田');
        Members.archiveMember(1);
        const added = Members.ensureMembersExist(['山田']);
        assert.equal(added, 0);
        assert.equal(State.members.length, 1);
    });

    test('空文字・空白のみの名前は無視される', () => {
        const added = Members.ensureMembersExist(['', '   ', undefined, null]);
        assert.equal(added, 0);
        assert.equal(State.members.length, 0);
    });
});

describe('buildInitialMembersFromLegacyData() — 初回移行用の名前リスト生成', () => {
    test('estimates/actualsに登場する名前を集める', () => {
        State.setEstimates([{ member: '山田' }, { member: '佐藤' }]);
        State.setActuals([{ member: '田中' }]);
        const names = Members.buildInitialMembersFromLegacyData('');
        assert.deepEqual([...names].sort(), ['佐藤', '山田', '田中'].sort());
    });

    test('旧#memberOrderの順序文字列を優先し、残りはアルファベット順で続く', () => {
        State.setEstimates([{ member: '山田' }, { member: '佐藤' }, { member: '田中' }]);
        const names = Members.buildInitialMembersFromLegacyData('田中,山田');
        assert.deepEqual(names, ['田中', '山田', '佐藤']);
    });

    test('見積・実績が空なら空配列を返す', () => {
        assert.deepEqual(Members.buildInitialMembersFromLegacyData(''), []);
    });
});
```

- [ ] **Step 2: テストを実行し失敗を確認**

Run: `node --test tests/members.test.js`
Expected: FAIL（`../js/members.js` が存在しない）

- [ ] **Step 3: `js/members.js` を実装する**

```js
// ============================================
// 担当者マスタ管理機能
// ============================================

import {
    members, setMembers,
    nextMemberId, setNextMemberId,
    estimates, actuals, schedules, vacations
} from './state.js';

// ============================================
// 内部ヘルパー
// ============================================

function normalizeName(raw) {
    return (raw || '').trim();
}

function findByNameCI(name) {
    const key = name.toLowerCase();
    return members.find(m => m.name.trim().toLowerCase() === key);
}

function activeIndices() {
    const idxs = [];
    members.forEach((m, i) => { if (!m.archived) idxs.push(i); });
    return idxs;
}

// ============================================
// 追加・改名・アーカイブ・復元
// ============================================

/**
 * 担当者をマスタに追加する
 * @param {string} name
 * @returns {{ok: true, member: object} | {ok: false, reason: 'empty'|'duplicate'}}
 */
export function addMember(name) {
    const trimmed = normalizeName(name);
    if (!trimmed) return { ok: false, reason: 'empty' };
    if (findByNameCI(trimmed)) return { ok: false, reason: 'duplicate' };

    const member = { id: nextMemberId, name: trimmed, archived: false };
    members.push(member);
    setNextMemberId(nextMemberId + 1);
    return { ok: true, member: { ...member } };
}

/**
 * 指定担当者名を参照している見積・実績・スケジュール・休暇の件数を返す
 * @param {string} name
 * @returns {number}
 */
export function countMemberUsage(name) {
    let count = 0;
    for (const e of estimates) if (e.member === name) count++;
    for (const a of actuals) if (a.member === name) count++;
    for (const s of schedules) if (s.member === name) count++;
    for (const v of vacations) if (v.member === name) count++;
    return count;
}

/**
 * 担当者を改名し、既存の見積・実績・スケジュール・休暇のmemberフィールドも一括置換する
 * @param {number} id
 * @param {string} newName
 * @returns {{ok: true, oldName: string, newName: string, affected: {estimates: number[], actuals: number[], schedules: (number|string)[], vacations: number[]}} | {ok: false, reason: 'empty'|'duplicate'|'not_found'}}
 */
export function renameMember(id, newName) {
    const member = members.find(m => m.id === id);
    if (!member) return { ok: false, reason: 'not_found' };

    const trimmed = normalizeName(newName);
    if (!trimmed) return { ok: false, reason: 'empty' };

    const dup = members.find(m => m.id !== id && m.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (dup) return { ok: false, reason: 'duplicate' };

    const oldName = member.name;
    const affected = { estimates: [], actuals: [], schedules: [], vacations: [] };

    if (oldName !== trimmed) {
        for (const e of estimates) if (e.member === oldName) { e.member = trimmed; affected.estimates.push(e.id); }
        for (const a of actuals) if (a.member === oldName) { a.member = trimmed; affected.actuals.push(a.id); }
        for (const s of schedules) if (s.member === oldName) { s.member = trimmed; affected.schedules.push(s.id); }
        for (const v of vacations) if (v.member === oldName) { v.member = trimmed; affected.vacations.push(v.id); }
        member.name = trimmed;
    }

    return { ok: true, oldName, newName: trimmed, affected };
}

/**
 * 担当者をアーカイブする（実データは変更しない）
 * @param {number} id
 */
export function archiveMember(id) {
    const member = members.find(m => m.id === id);
    if (!member || member.archived) return { ok: false };
    member.archived = true;
    return { ok: true, member: { ...member } };
}

/**
 * 担当者を復元し、アクティブ一覧の末尾へ移動する
 * @param {number} id
 */
export function restoreMember(id) {
    const idx = members.findIndex(m => m.id === id);
    if (idx < 0 || !members[idx].archived) return { ok: false };
    const [member] = members.splice(idx, 1);
    member.archived = false;
    members.push(member);
    return { ok: true, member: { ...member } };
}

// ============================================
// 並べ替え（アクティブな担当者のみを対象に、隣接するアクティブな担当者と入れ替える）
// ============================================

export function moveMemberUp(id) {
    const idxs = activeIndices();
    const pos = idxs.findIndex(i => members[i].id === id);
    if (pos <= 0) return false;
    const a = idxs[pos], b = idxs[pos - 1];
    [members[a], members[b]] = [members[b], members[a]];
    return true;
}

export function moveMemberDown(id) {
    const idxs = activeIndices();
    const pos = idxs.findIndex(i => members[i].id === id);
    if (pos < 0 || pos >= idxs.length - 1) return false;
    const a = idxs[pos], b = idxs[pos + 1];
    [members[a], members[b]] = [members[b], members[a]];
    return true;
}

// ============================================
// 選択肢生成ヘルパー
// ============================================

/**
 * 新規データ入力用: アクティブな担当者名をマスタ順で返す
 * @returns {string[]}
 */
export function getActiveMemberNames() {
    return members.filter(m => !m.archived).map(m => m.name);
}

/**
 * 編集・フィルタ・表示用: アーカイブ済みも含め、マスタに無い名前も
 * 既存データから安全網として拾って返す（マスタ順 + 安全網の名前をアルファベット順で末尾に追加）
 * @returns {string[]}
 */
export function getAllMemberNames() {
    const names = members.map(m => m.name);
    const known = new Set(names);
    const extra = new Set();
    const scan = (arr) => { for (const r of arr) { if (r && r.member && !known.has(r.member)) extra.add(r.member); } };
    scan(estimates); scan(actuals); scan(schedules); scan(vacations);
    return [...names, ...Array.from(extra).sort()];
}

/**
 * 旧 #memberOrder テキスト欄と同じ形式（カンマ区切り）の順序文字列を返す。
 * sortMembers(names, orderString) の第2引数としてそのまま使える。
 * @returns {string}
 */
export function getMemberOrderString() {
    return getActiveMemberNames().join(',');
}

// ============================================
// 新規データ取り込み時のマスタ自動追加・初回移行
// ============================================

/**
 * 指定した名前のうちマスタに存在しないものをアクティブとして追加する
 * @param {string[]} names
 * @returns {number} 追加した件数
 */
export function ensureMembersExist(names) {
    const existing = new Set(members.map(m => m.name.trim().toLowerCase()));
    let added = 0;
    for (const raw of (names || [])) {
        const trimmed = normalizeName(raw);
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        members.push({ id: nextMemberId, name: trimmed, archived: false });
        setNextMemberId(nextMemberId + 1);
        added++;
    }
    return added;
}

/**
 * 初回移行用: 既存のestimates/actualsに登場する担当者名を、
 * 旧#memberOrderの順序文字列があればそれを優先し、残りはアルファベット順で並べて返す。
 * マスタ配列そのものは作らず名前の配列のみを返す（呼び出し元でid付与する）。
 * @param {string} legacyOrderString
 * @returns {string[]}
 */
export function buildInitialMembersFromLegacyData(legacyOrderString) {
    const names = new Set();
    for (const e of estimates) if (e.member) names.add(e.member);
    for (const a of actuals) if (a.member) names.add(a.member);

    const orderList = (legacyOrderString || '').split(',').map(s => s.trim()).filter(Boolean);
    const ordered = [];
    const seen = new Set();
    for (const name of orderList) {
        if (names.has(name) && !seen.has(name)) { ordered.push(name); seen.add(name); }
    }
    const rest = [...names].filter(n => !seen.has(n)).sort();
    return [...ordered, ...rest];
}

console.log('✅ モジュール members.js loaded');
```

- [ ] **Step 4: テストを再実行し成功を確認**

Run: `node --test tests/members.test.js`
Expected: PASS（全件）

- [ ] **Step 5: コミット**

```bash
git add js/members.js tests/members.test.js
git commit -m "feat(members): 担当者マスタの純粋ロジックをTDDで実装"
```

---

### Task 4: members.js — DOM層（設定画面の描画・操作ハンドラ）

**Files:**
- Modify: `js/members.js`（末尾に追記）

このタスクはDOM操作を含むため単体テストは書かない。動作確認はTask 12（e2e）で行う。

- [ ] **Step 1: 描画・ハンドラ関数を追記**

`js/members.js` の末尾（`console.log('✅ モジュール members.js loaded');` の直前）に追記する。まず先頭の import 文を以下に差し替える（`escapeHtml`・`showAlert`・`pushAction` を追加）:

```js
import {
    members, setMembers,
    nextMemberId, setNextMemberId,
    estimates, actuals, schedules, vacations
} from './state.js';
import { escapeHtml, showAlert } from './utils.js';
import { pushAction } from './history.js';
```

続けて末尾に以下を追記する:

```js
// ============================================
// 設定画面: 描画
// ============================================

let editingMemberId = null;

export function renderMemberList() {
    const container = document.getElementById('memberList');
    if (container) {
        const active = members.filter(m => !m.archived);
        if (active.length === 0) {
            container.innerHTML = '<p style="color: #999; text-align: center; padding: 16px;">担当者が登録されていません</p>';
        } else {
            container.innerHTML = active.map((m, i) => renderMemberRow(m, i === 0, i === active.length - 1)).join('');
        }
        if (editingMemberId != null) {
            const input = document.getElementById(`memberRenameInput_${editingMemberId}`);
            if (input) { input.focus(); input.select(); }
        }
    }

    const archived = members.filter(m => m.archived);
    const label = document.getElementById('archivedMemberCount');
    if (label) label.textContent = String(archived.length);
    const archivedContainer = document.getElementById('archivedMemberList');
    if (archivedContainer) {
        archivedContainer.innerHTML = archived.length === 0
            ? '<p style="color: #999; padding: 8px 0;">アーカイブ済みの担当者はいません</p>'
            : archived.map(renderArchivedMemberRow).join('');
    }
}

function renderMemberRow(m, isFirst, isLast) {
    if (editingMemberId === m.id) {
        return `
            <div class="member-row" data-member-id="${m.id}">
                <input type="text" class="member-rename-input" id="memberRenameInput_${m.id}" value="${escapeHtml(m.name)}">
                <button type="button" class="btn btn-primary btn-small" onclick="confirmRenameMember(${m.id})">保存</button>
                <button type="button" class="btn btn-secondary btn-small" onclick="cancelRenameMember()">キャンセル</button>
            </div>
        `;
    }
    return `
        <div class="member-row" data-member-id="${m.id}">
            <button type="button" class="btn btn-ghost btn-small" ${isFirst ? 'disabled' : ''} onclick="handleMoveMemberUp(${m.id})" title="上へ">▲</button>
            <button type="button" class="btn btn-ghost btn-small" ${isLast ? 'disabled' : ''} onclick="handleMoveMemberDown(${m.id})" title="下へ">▼</button>
            <span class="member-name">${escapeHtml(m.name)}</span>
            <button type="button" class="btn btn-secondary btn-small" onclick="handleRenameMember(${m.id})">改名</button>
            <button type="button" class="btn btn-danger-outline btn-small" onclick="handleArchiveMember(${m.id})">アーカイブ</button>
        </div>
    `;
}

function renderArchivedMemberRow(m) {
    return `
        <div class="member-row member-row--archived" data-member-id="${m.id}">
            <span class="member-name">${escapeHtml(m.name)}</span>
            <button type="button" class="btn btn-secondary btn-small" onclick="handleRestoreMember(${m.id})">復元</button>
        </div>
    `;
}

export function toggleArchivedMemberSection() {
    const section = document.getElementById('archivedMemberSection');
    if (section) section.classList.toggle('collapsed');
}

// ============================================
// 設定画面: 操作ハンドラ
// ============================================

function afterMemberChange() {
    if (typeof window.saveData === 'function') window.saveData();
    renderMemberList();
    if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
    if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
}

export function handleAddMemberClick() {
    const input = document.getElementById('memberNameInput');
    if (!input) return;
    const result = addMember(input.value);
    if (!result.ok) {
        showAlert(result.reason === 'duplicate' ? 'その担当者名は既に登録されています' : '担当者名を入力してください', false);
        return;
    }
    pushAction({
        type: 'member_add',
        description: `担当者追加: ${result.member.name}`,
        data: { added: { ...result.member } }
    });
    input.value = '';
    afterMemberChange();
}

export function handleRenameMember(id) {
    editingMemberId = id;
    renderMemberList();
}

export function cancelRenameMember() {
    editingMemberId = null;
    renderMemberList();
}

export function confirmRenameMember(id) {
    const input = document.getElementById(`memberRenameInput_${id}`);
    if (!input) return;
    const member = members.find(m => m.id === id);
    if (!member) return;

    const newNameTrimmed = (input.value || '').trim();
    if (newNameTrimmed !== member.name) {
        const usage = countMemberUsage(member.name);
        if (usage > 0 && !confirm(`${usage}件のデータの担当者名を「${newNameTrimmed}」に置き換えます。よろしいですか？`)) {
            return;
        }
    }

    const before = member.name;
    const result = renameMember(id, input.value);
    if (!result.ok) {
        showAlert(result.reason === 'duplicate' ? 'その担当者名は既に登録されています' : '担当者名を入力してください', false);
        return;
    }

    editingMemberId = null;

    if (result.oldName !== result.newName) {
        pushAction({
            type: 'member_rename',
            description: `担当者改名: ${result.oldName} → ${result.newName}`,
            data: { memberId: id, before, after: result.newName, affected: result.affected }
        });
    }
    afterMemberChange();
}

export function handleArchiveMember(id) {
    const result = archiveMember(id);
    if (!result.ok) return;
    pushAction({
        type: 'member_archive',
        description: `担当者アーカイブ: ${result.member.name}`,
        data: { memberId: id, name: result.member.name }
    });
    afterMemberChange();
}

export function handleRestoreMember(id) {
    const result = restoreMember(id);
    if (!result.ok) return;
    pushAction({
        type: 'member_restore',
        description: `担当者復元: ${result.member.name}`,
        data: { memberId: id, name: result.member.name }
    });
    afterMemberChange();
}

export function handleMoveMemberUp(id) {
    if (!moveMemberUp(id)) return;
    if (typeof window.saveData === 'function') window.saveData();
    renderMemberList();
}

export function handleMoveMemberDown(id) {
    if (!moveMemberDown(id)) return;
    if (typeof window.saveData === 'function') window.saveData();
    renderMemberList();
}
```

- [ ] **Step 2: 構文チェック**

Run: `node --check js/members.js`
Expected: 出力なし（構文エラー無し）

- [ ] **Step 3: コミット**

```bash
git add js/members.js
git commit -m "feat(members): 設定画面向けの描画・操作ハンドラを追加"
```

---

### Task 5: history.js — Undo/Redo対応

**Files:**
- Modify: `js/history.js:255-259`（`applyUndo`内、休暇/会社休日の並び）
- Modify: `js/history.js:364-368`（`applyRedo`内、同上）
- Modify: `js/history.js:599-628`（`refreshUI`）
- Modify: `js/history.js:630-640`（`fullRefreshUI`）
- Test: `tests/history.test.js`

- [ ] **Step 1: 既存テストの構成を確認**

Run: `grep -n "describe(\|holiday_add\|holiday_delete" tests/history.test.js | head -20`
Expected: `holiday_add`/`holiday_delete` を検証している既存の `describe` ブロックが見つかる（このタスクではそれと同じ形式で `member_*` 用のブロックを追記する）。

- [ ] **Step 2: 失敗するテストを追加**

`tests/history.test.js` の末尾に追記する（`applyUndo`/`applyRedo`が`export`されていない場合は`undo()`/`redo()`とスタック操作を経由して検証している既存テストの書き方に倣うこと。以下は`pushAction`→`undo`→`redo`を通して検証する形）:

```js
describe('member_add / member_archive / member_restore — Undo/Redo', () => {
    beforeEach(() => {
        State.setMembers([]);
        State.setNextMemberId(1);
    });

    test('member_add を undo すると追加した担当者が消え、redo すると戻る', () => {
        Members.addMember('山田');
        History.pushAction({ type: 'member_add', description: '担当者追加: 山田', data: { added: { ...State.members[0] } } });

        History.undo();
        assert.equal(State.members.length, 0);

        History.redo();
        assert.equal(State.members.length, 1);
        assert.equal(State.members[0].name, '山田');
    });

    test('member_archive を undo するとアーカイブが解除され、redo すると再度アーカイブされる', () => {
        Members.addMember('山田');
        Members.archiveMember(1);
        History.pushAction({ type: 'member_archive', description: '担当者アーカイブ: 山田', data: { memberId: 1, name: '山田' } });

        History.undo();
        assert.equal(State.members[0].archived, false);

        History.redo();
        assert.equal(State.members[0].archived, true);
    });

    test('member_restore を undo すると再度アーカイブされ、redo すると復元される', () => {
        Members.addMember('山田');
        Members.archiveMember(1);
        Members.restoreMember(1);
        History.pushAction({ type: 'member_restore', description: '担当者復元: 山田', data: { memberId: 1, name: '山田' } });

        History.undo();
        assert.equal(State.members.find(m => m.id === 1).archived, true);

        History.redo();
        assert.equal(State.members.find(m => m.id === 1).archived, false);
    });
});

describe('member_rename — Undo/Redo（既存データへの遡及も含む）', () => {
    beforeEach(() => {
        State.setMembers([]);
        State.setNextMemberId(1);
        State.setEstimates([]);
        State.setActuals([]);
    });

    test('undo で改名前の名前とデータのmemberフィールドが両方戻り、redo で再度改名される', () => {
        Members.addMember('山田');
        State.setEstimates([{ id: 10, member: '山田' }]);
        const result = Members.renameMember(1, '山田太郎');
        History.pushAction({
            type: 'member_rename',
            description: '担当者改名: 山田 → 山田太郎',
            data: { memberId: 1, before: '山田', after: '山田太郎', affected: result.affected }
        });

        History.undo();
        assert.equal(State.members[0].name, '山田');
        assert.equal(State.estimates[0].member, '山田');

        History.redo();
        assert.equal(State.members[0].name, '山田太郎');
        assert.equal(State.estimates[0].member, '山田太郎');
    });
});
```

上記テストが必要とする `import` 文（`Members`, `beforeEach` 等）がファイル冒頭に無ければ追加する。既存の `tests/history.test.js` の冒頭import群を確認し、`import * as Members from '../js/members.js';` を追加すること。

- [ ] **Step 3: テストを実行し失敗を確認**

Run: `node --test tests/history.test.js`
Expected: FAIL（`member_add`等のtypeが`applyUndo`/`applyRedo`で未対応の警告が出て状態が変化しない）

- [ ] **Step 4: `applyUndo` に分岐を追加**

`js/history.js:255-259` の直後（`// --- 見込残存 ---` の直前）に追記する:

```js
    // --- 会社休日 ---
    } else if (t === 'holiday_add') {
        State.setCompanyHolidays(State.companyHolidays.filter(h => h.id !== action.data.added.id));
    } else if (t === 'holiday_delete') {
        State.companyHolidays.push(action.data.deleted);

    // --- 担当者マスタ ---
    } else if (t === 'member_add') {
        State.setMembers(State.members.filter(m => m.id !== action.data.added.id));
    } else if (t === 'member_archive') {
        const m = State.members.find(x => x.id === action.data.memberId);
        if (m) m.archived = false;
    } else if (t === 'member_restore') {
        const m = State.members.find(x => x.id === action.data.memberId);
        if (m) m.archived = true;
    } else if (t === 'member_rename') {
        const d = action.data;
        const m = State.members.find(x => x.id === d.memberId);
        if (m) m.name = d.before;
        d.affected.estimates.forEach(id => { const r = State.estimates.find(e => e.id === id); if (r) r.member = d.before; });
        d.affected.actuals.forEach(id => { const r = State.actuals.find(a => a.id === id); if (r) r.member = d.before; });
        d.affected.schedules.forEach(id => { const r = State.schedules.find(s => s.id === id); if (r) r.member = d.before; });
        d.affected.vacations.forEach(id => { const r = State.vacations.find(v => v.id === id); if (r) v.member = d.before; });

    // --- 見込残存 ---
```

- [ ] **Step 5: `applyRedo` に分岐を追加**

`js/history.js:364-368` の直後（`// --- 見込残存 ---` の直前）に追記する:

```js
    // --- 会社休日 ---
    } else if (t === 'holiday_add') {
        State.companyHolidays.push(action.data.added);
    } else if (t === 'holiday_delete') {
        State.setCompanyHolidays(State.companyHolidays.filter(h => h.id !== action.data.deleted.id));

    // --- 担当者マスタ ---
    } else if (t === 'member_add') {
        State.members.push(action.data.added);
    } else if (t === 'member_archive') {
        const m = State.members.find(x => x.id === action.data.memberId);
        if (m) m.archived = true;
    } else if (t === 'member_restore') {
        const m = State.members.find(x => x.id === action.data.memberId);
        if (m) m.archived = false;
    } else if (t === 'member_rename') {
        const d = action.data;
        const m = State.members.find(x => x.id === d.memberId);
        if (m) m.name = d.after;
        d.affected.estimates.forEach(id => { const r = State.estimates.find(e => e.id === id); if (r) r.member = d.after; });
        d.affected.actuals.forEach(id => { const r = State.actuals.find(a => a.id === id); if (r) r.member = d.after; });
        d.affected.schedules.forEach(id => { const r = State.schedules.find(s => s.id === id); if (r) r.member = d.after; });
        d.affected.vacations.forEach(id => { const r = State.vacations.find(v => v.id === id); if (r) v.member = d.after; });

    // --- 見込残存 ---
```

- [ ] **Step 6: `refreshUI` / `fullRefreshUI` に担当者マスタの再描画を追加**

`js/history.js:616-619`（`if (t === 'holiday_add' || t === 'holiday_delete') { ... }`）の直後に追記する:

```js
    if (t.startsWith('member_')) {
        if (typeof window.renderMemberList === 'function') window.renderMemberList();
        if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();
        if (typeof window.updateAllDisplays === 'function') window.updateAllDisplays();
    }
```

`fullRefreshUI()`（`js/history.js:630-640`）の末尾（`renderCompanyHolidayList()`呼び出しの直後）に追記する:

```js
    if (typeof window.renderMemberList === 'function') window.renderMemberList();
```

- [ ] **Step 7: テストを再実行し成功を確認**

Run: `node --test tests/history.test.js`
Expected: PASS（全件）

- [ ] **Step 8: 全体テストを実行し既存テストが壊れていないことを確認**

Run: `node --test`
Expected: PASS（全件。既存のholiday系・estimate系テストが引き続き通ること）

- [ ] **Step 9: コミット**

```bash
git add js/history.js tests/history.test.js
git commit -m "feat(history): 担当者マスタの追加・改名・アーカイブ・復元をUndo/Redo対応させる"
```

---

### Task 6: merge-core.js — マージ確定時のマスタ自動追加・再描画対応

**Files:**
- Modify: `js/merge-core.js:1-10`（import）
- Modify: `js/merge-core.js:533-544`（`refreshAllViews`）
- Modify: `js/merge-core.js:549-610`（`applyMerge`）

- [ ] **Step 1: importを追加**

`js/merge-core.js:8-10` を以下に変更する:

```js
import { pushAction } from './history.js';
import { saveData, autoBackup } from './storage.js';
import { showAlert } from './utils.js';
import { ensureMembersExist } from './members.js';
```

- [ ] **Step 2: `refreshAllViews` に `renderMemberList` を追加**

`js/merge-core.js:534-540` の関数配列に追記する:

```js
function refreshAllViews() {
    const fns = [
        'applyTheme', 'applyLayoutSettings', 'updateMonthOptions', 'setDefaultReportMonth',
        'updateEstimateMonthOptions', 'updateEstimateVersionOptions', 'setDefaultEstimateMonth',
        'updateActualMonthOptions', 'updateMemberOptions', 'updateQuickTaskList',
        'renderEstimateList', 'renderActualList', 'renderTodayActuals', 'updateReport',
        'renderCompanyHolidayList', 'renderScheduleView', 'renderMemberList'
    ];
    for (const name of fns) {
        if (typeof window[name] === 'function') { try { window[name](); } catch { /* ignore */ } }
    }
}
```

- [ ] **Step 3: `applyMerge()` に担当者マスタ自動追加を追加**

`js/merge-core.js:592-594` 付近（`entities`構築完了直後、`afterApply`呼び出しの直前）に追記する:

```js
    // 見積・実績に新しい担当者名が含まれていれば、マスタに反映する
    const newMemberNames = [];
    for (const field of ['estimates', 'actuals']) {
        const ch = entities[field];
        if (!ch) continue;
        ch.added.forEach(r => { if (r.member) newMemberNames.push(r.member); });
        ch.overwritten.forEach(o => { if (o.after && o.after.member) newMemberNames.push(o.after.member); });
    }
    if (newMemberNames.length) ensureMembersExist(newMemberNames);

    // ID 再採番など（merge-json が渡すコールバック）
    if (previewState.afterApply) { try { previewState.afterApply(entities, toggles); } catch { /* ignore */ } }
```

- [ ] **Step 4: 既存テストを実行**

Run: `node --test tests/merge-core.test.js`
Expected: PASS（`ensureMembersExist`の呼び出しはエンティティが空なら何もしないため、既存の挙動に影響しない）

- [ ] **Step 5: コミット**

```bash
git add js/merge-core.js
git commit -m "feat(merge-core): マージ確定時に新規担当者名をマスタへ自動追加する"
```

---

### Task 7: merge-json.js — バックアップJSON差分マージへの担当者マスタ登録

**Files:**
- Modify: `js/merge-json.js:24-38`（ID生成ヘルパー）
- Modify: `js/merge-json.js:77-151`（`buildRecordDefs`）
- Modify: `js/merge-json.js:267-271`（`handleBackupMerge`内カウンタ初期化）
- Modify: `js/merge-json.js:296-300`（`afterApply`内ID再採番）

- [ ] **Step 1: `maxNumericId` は既存のまま利用できることを確認**

`members`は数値IDを使うため、既存の`maxNumericId(arr)`関数（`js/merge-json.js:26-30`）がそのまま使える。新規ヘルパーは不要。

- [ ] **Step 2: `buildRecordDefs` に `members` エンティティを追加**

`js/merge-json.js:77-84` を以下に変更する:

```js
// レコード系エンティティ定義（仕様書 付録 B）
function buildRecordDefs(counters) {
    const idHoliday = () => ++counters.companyHolidays;
    const idVacation = () => ++counters.vacations;
    const idSchedule = () => `sch_${++counters.schedules}`;
    const idMember = () => ++counters.members;

    return [
```

`js/merge-json.js:133`（`companyHolidays`定義の直後）に追記する:

```js
        {
            id: 'companyHolidays', field: 'companyHolidays', label: '会社休日', kind: 'records', allowOverwrite: true,
            keyFields: ['name', 'startDate', 'endDate'],
            compareFields: [{ key: 'name', label: '名称' }],
            spec: {
                keyOf: r => [normalizeDate(r.startDate), normalizeDate(r.endDate)].join('|'),
                valueEq: (a, b) => s(a.name) === s(b.name), emitChanged: true
            },
            apply: makeApplier('companyHolidays', ['name'], idHoliday)
        },
        {
            // アーカイブ状態も同一性キーに含めない（同名なら1件として扱い、archivedのみ上書き対象にする）
            id: 'members', field: 'members', label: '担当者', kind: 'records', allowOverwrite: true,
            keyFields: ['name'],
            compareFields: [{ key: 'archived', label: 'アーカイブ状態' }],
            spec: {
                keyOf: r => s(r.name),
                valueEq: (a, b) => !!a.archived === !!b.archived, emitChanged: true
            },
            apply: makeApplier('members', ['archived'], idMember)
        },
```

- [ ] **Step 3: カウンタ初期化に `members` を追加**

`js/merge-json.js:267-271` を以下に変更する:

```js
    const counters = {
        companyHolidays: maxNumericId(State.companyHolidays),
        vacations: maxNumericId(State.vacations),
        schedules: maxSchedId(State.schedules),
        members: maxNumericId(State.members)
    };
```

- [ ] **Step 4: `afterApply` のID再採番に `members` を追加**

`js/merge-json.js:296-299` を以下に変更する:

```js
        afterApply: () => {
            // ID 採番を現状に合わせて再計算
            State.setNextCompanyHolidayId(maxNumericId(State.companyHolidays) + 1);
            State.setNextVacationId(maxNumericId(State.vacations) + 1);
            State.setNextScheduleId(maxSchedId(State.schedules) + 1);
            State.setNextMemberId(maxNumericId(State.members) + 1);
        }
```

- [ ] **Step 5: `looksLikeBackup` 判定に `members` を追加**

`js/merge-json.js:252-258` を以下に変更する（`members`のみのバックアップも受理できるようにする）:

```js
    const looksLikeBackup = data && typeof data === 'object' &&
        (Array.isArray(data.estimates) || Array.isArray(data.actuals) ||
         Array.isArray(data.schedules) || Array.isArray(data.companyHolidays) ||
         Array.isArray(data.vacations) || Array.isArray(data.remainingEstimates) ||
         Array.isArray(data.members) ||
         // AI 分析の履歴/設定のみを含むエクスポート（ローカル LLM の無い環境への持ち込み用）も受理する
         Array.isArray(data.llmAnalysisHistory) ||
         (data.llmAnalysisSettings && typeof data.llmAnalysisSettings === 'object'));
```

- [ ] **Step 6: 既存テストを実行**

Run: `node --test tests/merge-core.test.js`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add js/merge-json.js
git commit -m "feat(merge-json): バックアップJSON差分マージに担当者マスタを追加"
```

---

### Task 8: storage.js — 永続化（保存・読込・バックアップ・復元）、`memberOrder`の撤去

**Files:**
- Modify: `js/storage.js:5-33`（import）
- Modify: `js/storage.js:70-118`（`saveData`）
- Modify: `js/storage.js:150-234`（`loadData`前半・設定読込）
- Modify: `js/storage.js:372-415`（`autoBackup`）
- Modify: `js/storage.js:492-556`（`handleFileImport`のデータ復元部）
- Modify: `js/storage.js:643-687`（`handleFileImport`の旧形式復元・memberOrder箇所）
- Modify: `js/storage.js:704-717`（復元後のUI更新一覧）

- [ ] **Step 1: importを更新**

`js/storage.js:5-33` の import 文から `setMemberOrder` を削除し、`members, setMembers, nextMemberId, setNextMemberId` を追加する:

```js
import {
    estimates, setEstimates,
    actuals, setActuals,
    companyHolidays, setCompanyHolidays,
    vacations, setVacations,
    members, setMembers,
    nextMemberId, setNextMemberId,
    nonProjectWork, setNonProjectWork, setNextNonProjectId,
    remainingEstimates, setRemainingEstimates,
    setNextCompanyHolidayId, setNextVacationId, setNextRecordId,
    showMonthColorsSetting, setShowMonthColorsSetting,
    reportMatrixBgColorMode, setReportMatrixBgColorMode,
    showProgressBarsSetting, setShowProgressBarsSetting,
    showProgressPercentageSetting, setShowProgressPercentageSetting,
    progressBarStyle, setProgressBarStyle,
    matrixEstActFormat, setMatrixEstActFormat,
    filterBarMode, setFilterBarMode,
    scheduleBarColorMode, setScheduleBarColorMode,

    debugModeEnabled, setDebugModeEnabled,
    devFeaturesEnabled, setDevFeaturesEnabled,
    selectedChartColorScheme,
    setCurrentThemeColor, setCurrentThemePattern, setCurrentTabColor, setCurrentBackgroundColor,
    setEstimateLayout, setActualLayout, setReportLayout,
    // [GANTT-CHART] スケジュール関連
    schedules, setSchedules, setNextScheduleId,
    scheduleSettings, setScheduleSettings,
    taskColorMap, setTaskColorMap,
    taskSortOrder, setTaskSortOrder,
    setWorkDetailStyle, setModalDesignStyle
} from './state.js';

import { showAlert } from './utils.js';
import { clearProgressCache } from './report.js';
import { TASK_COLORS, THEME_TASK_COLORS } from './constants.js';
import { loadHistory } from './history.js';
import { logBackupEvent } from './viewport-diag.js';
import { buildInitialMembersFromLegacyData } from './members.js';
```

- [ ] **Step 2: `saveData()` から`memberOrder`を撤去し`members`を保存**

`js/storage.js:70-104` を以下に変更する:

```js
export function saveData(skipAutoBackup = false) {
    const data = {
        estimates: estimates,
        actuals: actuals,
        companyHolidays: companyHolidays,
        vacations: vacations,
        members: members,
        settings: {
            themeColor: window.currentThemeColor,
            themePattern: window.currentThemePattern,
            themeTabColor: window.currentTabColor,
            autoBackup: window.autoBackupEnabled,
            estimateLayout: window.estimateLayout,
            actualLayout: window.actualLayout,
            reportLayout: window.reportLayout,
            showMonthColors: showMonthColorsSetting,
            reportMatrixBgColorMode: reportMatrixBgColorMode,
            showProgressBars: showProgressBarsSetting,
            showProgressPercentage: showProgressPercentageSetting,
            progressBarStyle: progressBarStyle,
            matrixEstActFormat: matrixEstActFormat,
            filterBarMode: filterBarMode,
            scheduleBarColorMode: scheduleBarColorMode,

            defaultEstimateViewType: document.getElementById('defaultEstimateViewType') ? document.getElementById('defaultEstimateViewType').value : 'matrix',
            defaultReportViewType: document.getElementById('defaultReportViewType') ? document.getElementById('defaultReportViewType').value : 'matrix',
            chartColorScheme: selectedChartColorScheme,
            workDetailStyle: window.workDetailStyle,
            modalDesignStyle: window.modalDesignStyle,
            estimateStandardDisplay: document.getElementById('estimateStandardDisplay') ? document.getElementById('estimateStandardDisplay').value : 'subtext'
        }
    };

    localStorage.setItem('manhour_estimates', JSON.stringify(estimates));
    localStorage.setItem('manhour_actuals', JSON.stringify(actuals));
    localStorage.setItem('manhour_companyHolidays', JSON.stringify(companyHolidays));
    localStorage.setItem('manhour_vacations', JSON.stringify(vacations));
    localStorage.setItem('manhour_members', JSON.stringify(members));
    localStorage.setItem('manhour_nonProjectWork', JSON.stringify(nonProjectWork));
```

（以降 `localStorage.setItem('manhour_remainingEstimates', ...)` 以下は変更しない）

- [ ] **Step 3: `loadData()` — 担当者マスタの読み込み・初回移行を追加**

`js/storage.js:150-158` を以下に変更する（`savedMembers`を追加）:

```js
export function loadData() {
    const savedEstimates = localStorage.getItem('manhour_estimates');
    const savedActuals = localStorage.getItem('manhour_actuals');
    const savedCompanyHolidays = localStorage.getItem('manhour_companyHolidays');
    const savedVacations = localStorage.getItem('manhour_vacations');
    const savedMembers = localStorage.getItem('manhour_members');
    const savedNonProjectWork = localStorage.getItem('manhour_nonProjectWork');
    const savedRemainingEstimates = localStorage.getItem('manhour_remainingEstimates');
    const savedSettings = localStorage.getItem('manhour_settings');
```

`js/storage.js:159-165` の`try`ブロック内、`if (savedVacations) setVacations(...)` の直後に追記する:

```js
        if (savedEstimates) setEstimates(JSON.parse(savedEstimates));
        if (savedActuals) setActuals(JSON.parse(savedActuals));
        if (savedCompanyHolidays) setCompanyHolidays(JSON.parse(savedCompanyHolidays));
        if (savedVacations) setVacations(JSON.parse(savedVacations));
        if (savedMembers) {
            setMembers(JSON.parse(savedMembers));
        } else {
            // 初回移行: manhour_membersが一度も保存されていない場合のみ、
            // 既存の見積・実績データと旧settings.memberOrderからマスタを自動生成する
            let legacyOrder = '';
            try {
                const parsedSettings = savedSettings ? JSON.parse(savedSettings) : null;
                if (parsedSettings && parsedSettings.memberOrder) legacyOrder = parsedSettings.memberOrder;
            } catch { /* ignore */ }
            const names = buildInitialMembersFromLegacyData(legacyOrder);
            setMembers(names.map((name, i) => ({ id: i + 1, name, archived: false })));
        }
        if (savedNonProjectWork) setNonProjectWork(JSON.parse(savedNonProjectWork));
        if (savedRemainingEstimates) setRemainingEstimates(JSON.parse(savedRemainingEstimates));
```

（`buildInitialMembersFromLegacyData`は`estimates`/`actuals`グローバルの現在値を読むため、直前で`setEstimates`/`setActuals`が完了している必要がある。上記の追記位置はその条件を満たす）

`js/storage.js:196-214`（「次のIDを設定」ブロック、`nonProjectWork`の直後）に追記する:

```js
    if (members.length > 0) {
        const ids = members.map(m => m.id).filter(id => typeof id === 'number' && !isNaN(id));
        if (ids.length > 0) {
            setNextMemberId(Math.max(...ids) + 1);
        }
    }
```

- [ ] **Step 4: 設定読み込みから`memberOrder`分岐を削除**

`js/storage.js:230-234` の以下の行を削除する:

```js
            if (settings.memberOrder) setMemberOrder(settings.memberOrder);
```

- [ ] **Step 5: `autoBackup()` から`memberOrder`を撤去し`members`を含める**

`js/storage.js:372-415` を以下に変更する:

```js
export function autoBackup() {
    const settings = {
        themeColor: window.currentThemeColor,
        themePattern: window.currentThemePattern,
        themeTabColor: window.currentTabColor,
        themeBackgroundColor: window.currentBackgroundColor,
        estimateLayout: window.estimateLayout,
        actualLayout: window.actualLayout,
        reportLayout: window.reportLayout,
        showMonthColors: showMonthColorsSetting,
        reportMatrixBgColorMode: reportMatrixBgColorMode,
        showProgressBars: showProgressBarsSetting,
        showProgressPercentage: showProgressPercentageSetting,
        progressBarStyle: progressBarStyle,
        matrixEstActFormat: matrixEstActFormat,
        filterBarMode: filterBarMode,
        scheduleBarColorMode: scheduleBarColorMode,

        defaultEstimateViewType: document.getElementById('defaultEstimateViewType') ? document.getElementById('defaultEstimateViewType').value : 'grouped',
        defaultReportViewType: document.getElementById('defaultReportViewType') ? document.getElementById('defaultReportViewType').value : 'grouped',
        chartColorScheme: selectedChartColorScheme,
        debugModeEnabled: debugModeEnabled,
        devFeaturesEnabled: devFeaturesEnabled,
        workDetailStyle: window.workDetailStyle,
        estimateStandardDisplay: document.getElementById('estimateStandardDisplay') ? document.getElementById('estimateStandardDisplay').value : 'subtext'
    };

    const data = {
        estimates: estimates,
        actuals: actuals,
        companyHolidays: companyHolidays,
        vacations: vacations,
        members: members,
        remainingEstimates: remainingEstimates,
        schedules: schedules,
        scheduleSettings: { ...scheduleSettings },
        taskColorMap: { ...taskColorMap },
        settings: settings,
        timestamp: new Date().toISOString(),
        version: '1.2'
    };
```

（以降のAI分析履歴を含める処理は変更しない）

- [ ] **Step 6: `handleFileImport()` の全データ復元部に`members`を追加**

`js/storage.js:505-509` を以下に変更する:

```js
                    setEstimates(data.estimates || []);
                    setActuals(data.actuals || []);
                    setCompanyHolidays(data.companyHolidays || []);
                    setVacations(data.vacations || []);
                    setRemainingEstimates(data.remainingEstimates || []);
                    if (Array.isArray(data.members)) {
                        setMembers(data.members);
                    } else {
                        // 旧バックアップ（membersを含まない）からの復元: 見積・実績とmemberOrderから再構築する
                        const legacyOrder = (data.settings && data.settings.memberOrder) || '';
                        const names = buildInitialMembersFromLegacyData(legacyOrder);
                        setMembers(names.map((name, i) => ({ id: i + 1, name, archived: false })));
                    }
```

`js/storage.js:544-550`（「次のIDを設定」ブロック、`companyHolidays`の直後）に追記する:

```js
                    if (members.length > 0) {
                        const ids = members.map(m => m.id).filter(id => typeof id === 'number' && !isNaN(id));
                        if (ids.length > 0) {
                            setNextMemberId(Math.max(...ids) + 1);
                        }
                    }
```

- [ ] **Step 7: 旧`#memberOrder`のDOM復元コードを削除**

`js/storage.js:643-647`（「担当者表示順を復元」ブロック）を削除する:

```js
                        // 担当者表示順を復元
                        if (data.settings.memberOrder) {
                            const memberOrderEl = document.getElementById('memberOrder');
                            if (memberOrderEl) memberOrderEl.value = data.settings.memberOrder;
                        }
```

`js/storage.js:683-687`（`} else if (data.memberOrder) { ... }` ブロック）を削除する。削除後、直前の`if (data.settings) { ... }`ブロックの閉じ括弧がそのまま`saveData(true);`へ続く形になることを確認する。

- [ ] **Step 8: 復元後のUI更新一覧に`renderMemberList`を追加**

`js/storage.js:710`（`if (typeof window.updateMemberOptions === 'function') window.updateMemberOptions();`）の直後に追記する:

```js
                    if (typeof window.renderMemberList === 'function') window.renderMemberList();
```

- [ ] **Step 9: 既存テストを実行**

Run: `node --test tests/storage-load.test.js`
Expected: PASS。もし`memberOrder`関連のアサーションが既存テストに残っていれば、それを削除または`members`ベースのアサーションに置き換える（`grep -n "memberOrder" tests/storage-load.test.js`で確認すること）。

- [ ] **Step 10: 循環import確認**

`js/members.js`は`state.js`/`utils.js`/`history.js`のみをimportし、`storage.js`をimportしない設計になっているため、`storage.js → members.js`の一方向importで循環は発生しない。

Run: `node --check js/storage.js`
Expected: 出力なし

- [ ] **Step 11: コミット**

```bash
git add js/storage.js tests/storage-load.test.js
git commit -m "feat(storage): 担当者マスタの永続化とmemberOrderの撤去"
```

---

### Task 9: index.html — 設定画面のUIを置き換え（frontend-designスキル使用）

**重要:** このタスクはHTML/CSSの見た目に関わる変更のため、着手前に必ず `frontend-design` スキルをSkillツールで呼び出すこと（グローバルCLAUDE.mdの絶対ルールG1）。以下のマークアップ・クラス名は骨組みであり、frontend-designスキルの指示に従って既存設定画面のトーンに仕上げる。

**Files:**
- Modify: `index.html:1660-1670`（「担当者表示順」設定行）
- Modify: `style.css`（`.member-row`等の追加スタイル）

- [ ] **Step 1: frontend-designスキルを起動**

Skillツールで`frontend-design`を呼び出し、「設定画面の担当者マスタ管理UI（追加フォーム・アクティブ一覧・アーカイブ済み折りたたみ）を、既存の会社休日セクション（`index.html`の`companyHolidayList`まわり）と統一感のあるトーンで実装したい」と伝えて、配色・余白・アイコンの方向性を確認する。

- [ ] **Step 2: `index.html` の該当ブロックを置き換え**

`index.html:1660-1670` の以下のブロック:

```html
                                <div class="setting-row">
                                    <div class="setting-info">
                                        <div class="setting-label">担当者表示順
                                            <button type="button" id="btnShowMemberOrderHelp" class="setting-help-btn" title="入力方法">ℹ️</button>
                                        </div>
                                        <div class="setting-desc">カンマ区切り。未指定の担当者は後ろに表示（自動保存）</div>
                                    </div>
                                    <div class="setting-control setting-control--wide">
                                        <input type="text" id="memberOrder" placeholder="例: 山田,佐藤,田中">
                                    </div>
                                </div>
```

を、以下に置き換える（frontend-designスキルの指示に従いクラス名・装飾は調整してよいが、以下のID・構造は維持する。他のJSがこれらのIDに依存するため）:

```html
                                <div class="setting-group-heading">担当者</div>
                                <div class="setting-desc">ここで登録した担当者が、見積・実績・スケジュール等の担当者選択肢になります</div>
                                <div class="form-group member-add-form">
                                    <input type="text" id="memberNameInput" placeholder="担当者名を入力">
                                    <button type="button" class="btn btn-primary" id="btnAddMember">追加</button>
                                </div>
                                <div id="memberList" class="member-list"></div>
                                <div id="archivedMemberSection" class="member-archived-section collapsed">
                                    <button type="button" class="member-archived-toggle" onclick="toggleArchivedMemberSection()">
                                        ▸ アーカイブ済み (<span id="archivedMemberCount">0</span>)
                                    </button>
                                    <div id="archivedMemberList" class="member-archived-list"></div>
                                </div>
```

- [ ] **Step 3: スタイルを追加**

`style.css`（`.drag-handle`定義付近など、行末に追記する形で問題ない）に追記する。以下は骨組みで、frontend-designスキルの回答に沿って配色・余白を調整する:

```css
.member-add-form {
    display: flex;
    gap: 8px;
    align-items: center;
}

.member-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 12px;
}

.member-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.02);
}

.member-row .member-name {
    flex: 1;
}

.member-rename-input {
    flex: 1;
}

.member-archived-section {
    margin-top: 16px;
}

.member-archived-section.collapsed .member-archived-list {
    display: none;
}

.member-archived-toggle {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-secondary, #666);
    padding: 4px 0;
}

.member-archived-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
}

.member-row--archived {
    opacity: 0.7;
}
```

- [ ] **Step 4: 構文チェック**

Run: `node -e "require('fs').readFileSync('index.html','utf8')" && echo OK`
Expected: `OK`（読み込みエラーが無いことのみの簡易確認。詳細はブラウザ確認・e2eで行う）

- [ ] **Step 5: コミット**

```bash
git add index.html style.css
git commit -m "feat(settings): 担当者マスタ管理UIを追加し担当者表示順欄を置き換える"
```

---

### Task 10: events.js — イベント配線、旧`memberOrder`配線の削除

**Files:**
- Modify: `js/events.js:1-50`（import）
- Modify: `js/events.js:214-221`（`memberOrder`のchangeリスナー）
- Modify: `js/events.js:605-606`（`btnShowMemberOrderHelp`配線）

- [ ] **Step 1: importを更新**

`js/events.js`冒頭のimport一覧から`showMemberOrderHelp`（`js/events.js:22`）を削除し、`handleAddMemberClick`を追加する:

Run: `grep -n "^import\|    showMemberOrderHelp," js/events.js | head -20`

見つかったimport元（`./ui.js`）の行を確認したうえで、`showMemberOrderHelp,`の行を削除し、`js/members.js`からのimportを別途追加する:

```js
import { handleAddMemberClick } from './members.js';
```

- [ ] **Step 2: `#memberOrder`のchangeリスナーを削除**

`js/events.js:214-221`の以下のブロックを削除する:

```js
    // 担当者表示順 (自動保存 & 即時反映)
    const memberOrderEl = document.getElementById('memberOrder');
    if (memberOrderEl) {
        memberOrderEl.addEventListener('change', () => {
            import('./storage.js').then(m => m.saveData(true));
            import('./ui.js').then(m => m.updateAllDisplays());
        });
    }
```

- [ ] **Step 3: `btnShowMemberOrderHelp`配線を`btnAddMember`配線に置き換え**

`js/events.js:605-606`の以下のブロック:

```js
    const btnShowMemberOrderHelp = document.getElementById('btnShowMemberOrderHelp');
    if (btnShowMemberOrderHelp) btnShowMemberOrderHelp.addEventListener('click', showMemberOrderHelp);
```

を以下に置き換える:

```js
    const btnAddMember = document.getElementById('btnAddMember');
    if (btnAddMember) btnAddMember.addEventListener('click', handleAddMemberClick);
```

- [ ] **Step 4: 構文チェック**

Run: `node --check js/events.js`
Expected: 出力なし

- [ ] **Step 5: コミット**

```bash
git add js/events.js
git commit -m "feat(events): 担当者追加ボタンを配線し旧memberOrder配線を削除"
```

---

### Task 11: ui.js — `updateMemberOptions()`書き換え、旧コード削除

**Files:**
- Modify: `js/ui.js:1-30`（import、`getActiveMemberNames`/`getAllMemberNames`/`getMemberOrderString`追加）
- Modify: `js/ui.js:2220-2295`（`updateMemberOptions()`）
- Modify: `js/ui.js:4200-4204`（設定読み込み内のDOM同期）
- Modify: `js/ui.js:4213-4221`（`updateAllDisplays()`内のDOM同期）
- Modify: `js/ui.js:4235-4252`（`showMemberOrderHelp()`）

- [ ] **Step 1: importを追加**

`js/ui.js`冒頭のimportに以下を追加する:

```js
import { getActiveMemberNames, getAllMemberNames } from './members.js';
```

- [ ] **Step 2: `updateMemberOptions()`を書き換え**

`js/ui.js:2220-2295`付近の`updateMemberOptions()`全体を以下に置き換える（`memberOrderInput`のDOM読み取りと`sortMembers`呼び出しを廃止し、ヘルパーが返す配列をそのまま使う。新規入力用selectには`getActiveMemberNames()`、既存データ編集用selectには`getAllMemberNames()`を使う）:

```js
export function updateMemberOptions() {
    const activeMembers = getActiveMemberNames();
    const allMembers = getAllMemberNames();

    // 各工程の担当者選択肢を更新（新規登録用）
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    processes.forEach(process => {
        // 見積管理タブ
        const select = document.getElementById(`est${process}_member`);
        if (select) {
            updateSelectOptions(select, activeMembers, true);
        }

        // クイック入力の見積登録フォーム
        const quickEstSelect = document.getElementById(`quickEst${process}_member`);
        if (quickEstSelect) {
            updateSelectOptions(quickEstSelect, activeMembers, true);
        }

        // 見積登録モーダル
        const addEstSelect = document.getElementById(`addEst${process}_member`);
        if (addEstSelect) {
            updateSelectOptions(addEstSelect, activeMembers, true);
        }
    });

    // クイック入力の担当者選択肢（新規登録用）
    const quickMemberSelect = document.getElementById('quickMember');
    if (quickMemberSelect) {
        updateSelectOptions(quickMemberSelect, activeMembers, false, true);
    }

    // その他作業の担当者選択肢（新規登録用）
    const otherWorkMemberSelect = document.getElementById('otherWorkMember');
    if (otherWorkMemberSelect) {
        const currentValue = otherWorkMemberSelect.value;
        otherWorkMemberSelect.innerHTML = '<option value="">選択...</option>';
        activeMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member;
            option.textContent = member;
            otherWorkMemberSelect.appendChild(option);
        });
        if (currentValue && activeMembers.includes(currentValue)) {
            otherWorkMemberSelect.value = currentValue;
        }
    }

    // 実績編集モーダルの担当者選択肢（既存データの編集用）
    const editActualMemberSelect = document.getElementById('editActualMember');
    if (editActualMemberSelect) {
        updateSelectOptions(editActualMemberSelect, allMembers, false, true);
    }

    // 休暇登録フォームの担当者選択肢（新規登録用）
    const quickVacationMemberSelect = document.getElementById('quickVacationMember');
    if (quickVacationMemberSelect) {
        updateSelectOptions(quickVacationMemberSelect, activeMembers, false, true);
    }

    // 見積編集モーダルの担当者選択肢（既存データの編集用）
    const editEstimateMemberSelect = document.getElementById('editEstimateMember');
    if (editEstimateMemberSelect) {
        updateSelectOptions(editEstimateMemberSelect, allMembers, false);
```

（この関数の続き部分（`editEstimateMemberSelect`以降に既存で他の処理が続いていた場合）はそのまま残す。`Read js/ui.js`で実際の関数末尾を確認し、閉じ括弧の対応を崩さないよう注意すること）

- [ ] **Step 3: `showMemberOrderHelp()`を削除**

`js/ui.js:4235-4252`の以下の関数を削除する:

```js
/**
 * 担当者表示順のヘルプを表示
 */
export function showMemberOrderHelp() {
    const helpMsg = `
        <strong>担当者表示順の設定方法:</strong><br><br>
        1. 担当者の名前をカンマ(,)区切りで入力します<br>
        2. ここで指定した順番で、実績一覧やレポートに表示されます<br>
        3. 指定しなかった担当者は、指定された人の後ろに名前順で表示されます<br><br>
        例: <code>佐藤,田中,山田</code><br><br>
        ※入力後は「設定を適用」ボタンを押すか、欄外をクリックすると反映されます。
    `;
    if (typeof window.showAlert === 'function') {
        window.showAlert(helpMsg, true);
    } else {
        alert('担当者表示順の設定方法:\n\n1. 担当者の名前をカンマ(,)区切りで入力します\n2. 指定した順番で表示されます\n3. 指定しなかった人は後ろに名前順で表示されます');
    }
}
```

- [ ] **Step 4: 設定読み込み内のDOM同期コードを削除**

`js/ui.js:4200-4204`の以下のブロックを削除する:

```js
    // 担当者の表示順（window.memberOrderを使用して確実に最新値を取得）
    const memberOrderEl = document.getElementById('memberOrder');
    if (memberOrderEl && window.memberOrder) {
        memberOrderEl.value = window.memberOrder;
    }
```

- [ ] **Step 5: `updateAllDisplays()`内のDOM同期コードを削除**

`js/ui.js:4213-4221`を以下に変更する（`memberOrder`読み取り部分のみ削除し、他は維持）:

```js
export function updateAllDisplays() {
    if (debugModeEnabled) console.log('🔄 全画面更新実行');

    // 各モジュールのレンダリング関数を呼び出し
    // window を介して呼び出す（循環参照を避けるためと、init.js で確実に公開されているため）
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();

    if (debugModeEnabled) console.log('✅ 全画面更新完了');
}
```

- [ ] **Step 6: 構文チェック**

Run: `node --check js/ui.js`
Expected: 出力なし

- [ ] **Step 7: コミット**

```bash
git add js/ui.js
git commit -m "refactor(ui): updateMemberOptionsを担当者マスタ参照に書き換え、旧memberOrderコードを削除"
```

---

### Task 12: init.js — window公開の更新

**Files:**
- Modify: `js/init.js:5-36`（import）
- Modify: `js/init.js:72`（`window.memberOrder`）
- Modify: `js/init.js:87`付近（vacation.js関数群の並び。members.js関数を追加）
- Modify: `js/init.js:490-560`付近（起動シーケンス）

- [ ] **Step 1: importを追加**

`js/init.js:26`（`import * as History from './history.js';`）の付近に追記する:

```js
import * as Members from './members.js';
```

- [ ] **Step 2: `window.memberOrder`公開を削除**

`js/init.js:72`の以下の行を削除する:

```js
window.memberOrder = State.memberOrder;
```

`js/init.js:498`付近にも同じ行があるため、`grep -n "window.memberOrder" js/init.js`で両方を確認し削除する。

- [ ] **Step 3: `js/members.js`の関数をwindowに公開**

`js/init.js:87`（`window.renderCompanyHolidayList = Vacation.renderCompanyHolidayList;`）の付近に追記する:

```js
// members.js の関数
window.addMember = Members.addMember;
window.renameMember = Members.renameMember;
window.archiveMember = Members.archiveMember;
window.restoreMember = Members.restoreMember;
window.moveMemberUp = Members.moveMemberUp;
window.moveMemberDown = Members.moveMemberDown;
window.getActiveMemberNames = Members.getActiveMemberNames;
window.getAllMemberNames = Members.getAllMemberNames;
window.getMemberOrderString = Members.getMemberOrderString;
window.ensureMembersExist = Members.ensureMembersExist;
window.renderMemberList = Members.renderMemberList;
window.toggleArchivedMemberSection = Members.toggleArchivedMemberSection;
window.handleAddMemberClick = Members.handleAddMemberClick;
window.handleRenameMember = Members.handleRenameMember;
window.cancelRenameMember = Members.cancelRenameMember;
window.confirmRenameMember = Members.confirmRenameMember;
window.handleArchiveMember = Members.handleArchiveMember;
window.handleRestoreMember = Members.handleRestoreMember;
window.handleMoveMemberUp = Members.handleMoveMemberUp;
window.handleMoveMemberDown = Members.handleMoveMemberDown;
```

- [ ] **Step 4: 起動時に担当者一覧を描画**

`js/init.js:554`付近（`UI.updateMemberOptions();`が呼ばれている起動シーケンス）に追記する:

```js
UI.updateMemberOptions();
Members.renderMemberList();
```

- [ ] **Step 5: 構文チェック**

Run: `node --check js/init.js`
Expected: 出力なし

- [ ] **Step 6: コミット**

```bash
git add js/init.js
git commit -m "feat(init): members.jsの関数を公開し起動時に担当者一覧を描画する"
```

---

### Task 13: quick.js — クイック入力の担当者選択

**Files:**
- Modify: `js/quick.js:1-16`（import）
- Modify: `js/quick.js:48-76`（`updateQuickMemberSelect()`）

- [ ] **Step 1: importを追加**

`js/quick.js:10`（`sortMembers`を含むutilsのimport）はそのまま残し、`js/quick.js:16`付近に追記する:

```js
import { getActiveMemberNames, getMemberOrderString } from './members.js';
```

- [ ] **Step 2: `updateQuickMemberSelect()`を書き換え**

`js/quick.js:48-60`を以下に変更する:

```js
export function updateQuickMemberSelect() {
    const select = document.getElementById('quickMemberSelect');
    if (!select) return;

    // 表示順が設定されている場合はそれを使用
    const sortedMembers = sortMembers(getActiveMemberNames(), getMemberOrderString());
```

（`getActiveMemberNames()`は既にマスタ順で返るため、実質`sortMembers`は担当者表示順の指定が既存アクティブ順と一致し冪等に働く。以降の`select.innerHTML = ...`以降の処理は変更しない）

- [ ] **Step 3: 構文チェック**

Run: `node --check js/quick.js`
Expected: 出力なし

- [ ] **Step 4: コミット**

```bash
git add js/quick.js
git commit -m "refactor(quick): 担当者選択肢の生成元をマスタに切り替える"
```

---

### Task 14: estimate-add.js — その他工数フォームの担当者選択

**Files:**
- Modify: `js/estimate-add.js:1-20`（import）
- Modify: `js/estimate-add.js:834-858`（`initOtherWorkMemberSelect()`/`getAllMembers()`）

- [ ] **Step 1: importを追加**

`js/estimate-add.js`冒頭のimportに追記する:

```js
import { getActiveMemberNames } from './members.js';
```

- [ ] **Step 2: `initOtherWorkMemberSelect()`と`getAllMembers()`を書き換え**

`js/estimate-add.js:834-858`を以下に置き換える:

```js
/**
 * その他工数フォームの担当者セレクト初期化
 */
export function initOtherWorkMemberSelect() {
    const select = document.getElementById('addEstOtherMember');
    if (!select) return;

    const members = getActiveMemberNames();

    select.innerHTML = '<option value="">-- 担当者を選択 --</option>';
    select.innerHTML += '<option value="__all__">全員</option>';
    members.forEach(member => {
        select.innerHTML += `<option value="${Utils.escapeHtml(member)}">${Utils.escapeHtml(member)}</option>`;
    });
}

/**
 * 全担当者のリストを取得
 */
function getAllMembers() {
    return getActiveMemberNames();
}
```

- [ ] **Step 3: 構文チェック**

Run: `node --check js/estimate-add.js`
Expected: 出力なし

- [ ] **Step 4: コミット**

```bash
git add js/estimate-add.js
git commit -m "refactor(estimate-add): その他工数の担当者選択肢をマスタから取得する"
```

---

### Task 15: estimate-edit.js — 見積編集モーダルの担当者選択

**Files:**
- Modify: `js/estimate-edit.js:1-20`（import）
- Modify: `js/estimate-edit.js:66-93`（`allMembers`集計・並べ替え）

- [ ] **Step 1: importを追加**

`js/estimate-edit.js`冒頭のimportに追記する:

```js
import { getAllMemberNames, getMemberOrderString } from './members.js';
```

- [ ] **Step 2: `allMembers`集計を書き換え**

`js/estimate-edit.js:66-93`を以下に置き換える:

```js
    const memberSelect = document.getElementById('editEstimateMember');
    const sortedMembers = sortMembers(getAllMemberNames(), getMemberOrderString());

    memberSelect.innerHTML = '';
    sortedMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        memberSelect.appendChild(option);
    });
```

（`sortMembers`が未importの場合は、`js/estimate-edit.js`冒頭のutilsからのimportに`sortMembers`を追加すること。`grep -n "from './utils.js'" js/estimate-edit.js`で確認する）

- [ ] **Step 3: 構文チェック**

Run: `node --check js/estimate-edit.js`
Expected: 出力なし

- [ ] **Step 4: コミット**

```bash
git add js/estimate-edit.js
git commit -m "refactor(estimate-edit): 見積編集モーダルの担当者選択肢をマスタから取得する"
```

---

### Task 16: actual.js — 実績関連の担当者select・フィルタ・カレンダー表示

**Files:**
- Modify: `js/actual.js:1-20`（import）
- Modify: `js/actual.js:179-227`（`updateMemberSelectOptions()`）
- Modify: `js/actual.js:450-475`（カレンダー担当者行）
- Modify: `js/actual.js:1141-1170`（実績編集モーダルの`editActualMember`再構築）
- Modify: `js/actual.js:1306-1315`（`populateOtherWorkMembers()`）

- [ ] **Step 1: importを追加**

`js/actual.js`冒頭のimportに追記する:

```js
import { getAllMemberNames, getMemberOrderString } from './members.js';
```

- [ ] **Step 2: `updateMemberSelectOptions()`を書き換え**

`js/actual.js:179-210`を以下に置き換える:

```js
export function updateMemberSelectOptions() {
    const select = document.getElementById('actualMemberSelect');
    const select2 = document.getElementById('actualMemberSelect2');
    const currentValue = select.value;

    const sortedMembers = sortMembers(getAllMemberNames(), getMemberOrderString());
```

（以降の`select.innerHTML = '';`以降は変更しない）

- [ ] **Step 3: カレンダー担当者行を書き換え**

`js/actual.js:468-474`を以下に置き換える:

```js
    // メンバーリストは全実績・見積から取得（選択月にデータがなくても表示できるように）
    let members = getAllMemberNames();

    members = sortMembers(members, getMemberOrderString());
```

- [ ] **Step 4: 実績編集モーダルの`editActualMember`再構築を書き換え**

`js/actual.js:1141-1167`を以下に置き換える:

```js
    const memberSelect = document.getElementById('editActualMember');
    const sortedMembers = sortMembers(getAllMemberNames(), getMemberOrderString());

    memberSelect.innerHTML = '';
```

（この直後の`sortedMembers.forEach(member => { ... memberSelect.appendChild(option); });`は変更しない）

- [ ] **Step 5: `populateOtherWorkMembers()`を書き換え**

`js/actual.js:1306-1315`を以下に置き換える:

```js
function populateOtherWorkMembers(selectedMember) {
    const otherWorkMemberSelect = document.getElementById('otherWorkMember');
    if (!otherWorkMemberSelect) return;

    const sortedMembers = sortMembers(getAllMemberNames(), getMemberOrderString());

    otherWorkMemberSelect.innerHTML = '<option value="">選択...</option>';
    sortedMembers.forEach(m => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = m;
        otherWorkMemberSelect.appendChild(option);
    });
```

- [ ] **Step 6: 構文チェック**

Run: `node --check js/actual.js`
Expected: 出力なし

- [ ] **Step 7: コミット**

```bash
git add js/actual.js
git commit -m "refactor(actual): 実績関連の担当者select・フィルタ・カレンダー表示をマスタ参照に切り替える"
```

---

### Task 17: other-work.js — その他工数・打ち合わせ登録の担当者取得

**Files:**
- Modify: `js/other-work.js:1-10`（import）
- Modify: `js/other-work.js:36-46`（`addMeeting()`の全担当者取得）
- Modify: `js/other-work.js:152-176`付近（`openOtherWorkModal()`の担当者リスト）

- [ ] **Step 1: importを追加**

`js/other-work.js`冒頭のimportに追記する:

```js
import { getActiveMemberNames, getMemberOrderString } from './members.js';
```

- [ ] **Step 2: `addMeeting()`の全担当者取得と0人時メッセージを書き換え**

`js/other-work.js:36-46`を以下に置き換える:

```js
    // 全担当者を取得（アクティブのみ。新規に実績を作る操作のため）
    const members = getActiveMemberNames();

    console.log('members:', members);

    if (members.length === 0) {
        showAlert('担当者が登録されていません。設定 > 担当者から先に登録してください。', false);
        return;
    }
```

（この後の`members.forEach(member => { ... });`は`Set`ではなく配列になるため、`forEach`はそのまま動作する。`members.size`を参照している箇所があれば`members.length`に置き換える。`grep -n "members.size" js/other-work.js`で確認すること）

- [ ] **Step 3: `openOtherWorkModal()`の担当者リストを書き換え**

`js/other-work.js:152-176`付近の以下のブロック（表示順ソート込みの担当者リスト取得部分）を、`Read js/other-work.js`で実際の範囲を確認したうえで、以下に置き換える:

```js
    const otherWorkMemberSelect = document.getElementById('otherWorkMember');
    if (otherWorkMemberSelect) {
        const sortedMembers = sortMembers(getActiveMemberNames(), getMemberOrderString());
```

（`sortMembers`が未importなら`utils.js`からのimportに追加する）

- [ ] **Step 4: 構文チェック**

Run: `node --check js/other-work.js`
Expected: 出力なし

- [ ] **Step 5: コミット**

```bash
git add js/other-work.js
git commit -m "refactor(other-work): 担当者取得元をマスタに切り替え0人時メッセージを更新する"
```

---

### Task 18: 表示順のみを使う箇所の`#memberOrder`撤去（estimate.js / schedule-render.js / actual-timeline.js / actual-bulk.js）

これらのファイルは担当者の集合そのものは見積・実績・スケジュールから直接導出しており変更不要。`#memberOrder`のDOM読み取りを`getMemberOrderString()`に置き換えるだけでよい。

**Files:**
- Modify: `js/estimate.js:1-15`（import）、`js/estimate.js:762-764`
- Modify: `js/schedule-render.js:1-15`（import）、`js/schedule-render.js:588-599`
- Modify: `js/actual-timeline.js:1-15`（import）、`js/actual-timeline.js:3082-3084`
- Modify: `js/actual-bulk.js:1-15`（import）、`js/actual-bulk.js:9`、`js/actual-bulk.js:317`

- [ ] **Step 1: `estimate.js`を修正**

`js/estimate.js`冒頭のimportに追記する:

```js
import { getMemberOrderString } from './members.js';
```

`js/estimate.js:762-764`を確認し、`document.getElementById('memberOrder')`経由で`orderString`を得ている行を以下に置き換える:

```js
        const memberOrderInput = getMemberOrderString();
        const sortedMembers = sortMembers(Object.keys(memberSummary), memberOrderInput);
```

- [ ] **Step 2: `schedule-render.js`を修正**

`js/schedule-render.js`冒頭のimportに追記する:

```js
import { getMemberOrderString } from './members.js';
```

`js/schedule-render.js:588-599`を確認し、`document.getElementById('memberOrder')`経由で`orderString`を得ている行を以下に置き換える:

```js
            const orderString = getMemberOrderString();
            const sortedMembers = sortMembers([...memberMap.keys()], orderString);
```

- [ ] **Step 3: `actual-timeline.js`を修正**

`js/actual-timeline.js`冒頭のimportに追記する:

```js
import { getMemberOrderString } from './members.js';
```

`js/actual-timeline.js:3082-3084`を以下に置き換える:

```js
    const memberOrderInput = getMemberOrderString();
    return sortMembers(Array.from(memberSet), memberOrderInput);
```

- [ ] **Step 4: `actual-bulk.js`を修正**

`js/actual-bulk.js:9`の`memberOrder`（`state.js`からの直接import）を削除し、冒頭に以下を追加する:

```js
import { getMemberOrderString } from './members.js';
```

`js/actual-bulk.js:317`を以下に置き換える:

```js
    return sortMembers([...new Set([...estimates.map(e => e.member), ...actuals.map(a => a.member)].filter(Boolean))], getMemberOrderString());
```

- [ ] **Step 5: 構文チェック**

Run: `node --check js/estimate.js && node --check js/schedule-render.js && node --check js/actual-timeline.js && node --check js/actual-bulk.js`
Expected: 出力なし（4回とも）

- [ ] **Step 6: 全体テストを実行**

Run: `node --test`
Expected: PASS（全件）

- [ ] **Step 7: コミット**

```bash
git add js/estimate.js js/schedule-render.js js/actual-timeline.js js/actual-bulk.js
git commit -m "refactor: 表示順の取得元を#memberOrderからマスタに切り替える"
```

---

### Task 19: 残存する`#memberOrder`参照の最終確認

**Files:** なし（確認のみ）

- [ ] **Step 1: 参照が残っていないことを確認**

Run: `grep -rn "memberOrder" js/*.js index.html`
Expected: 出力なし、または`getMemberOrderString`/`setNextMemberId`等の意図した命名のみがヒットする（`memberOrder`という変数名・ID自体は完全に無くなっている想定）。もし見落としがあれば当該ファイルを修正しコミットする。

- [ ] **Step 2: CODEMAPが自動再生成されていることを確認**

Run: `node scripts/codemap.mjs --check`
Expected: 差分なし（PostToolUse hookで自動更新されているはずだが、手動編集した場合は`node scripts/codemap.mjs`を実行してから再度コミットする）

---

### Task 20: Playwright e2e — 本機能のゴールを直接検証

**Files:**
- Create: `tests/e2e/member-master.spec.js`

- [ ] **Step 1: 既存e2eの共通ヘルパーを確認**

Run: `grep -n "require\|import" tests/e2e/smoke.spec.js | head -10`
Expected: `tests/e2e/serve.mjs`・`tests/e2e/seed.mjs`等の共通ヘルパーの使い方が分かる。以下のテストではそれに倣う。

- [ ] **Step 2: e2eテストを作成**

`tests/e2e/member-master.spec.js`を新規作成する（実際のセレクタ・ヘルパー呼び出しは`smoke.spec.js`等の既存e2eの書き方に合わせて調整すること。以下は検証すべきシナリオの骨子）:

```js
// ============================================
// e2e: 担当者マスタ — 見積・実績が0件でも担当者を単独登録できることを検証
// ============================================
const { test, expect } = require('@playwright/test');
const { startServer } = require('./serve.mjs');

test.describe('担当者マスタ', () => {
    let baseURL;
    let stopServer;

    test.beforeAll(async () => {
        ({ baseURL, stop: stopServer } = await startServer());
    });

    test.afterAll(async () => {
        await stopServer();
    });

    test('見積・実績が0件でも担当者を新規追加でき、クイック入力の選択肢に即座に出現する', async ({ page }) => {
        await page.goto(baseURL);
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        // 設定画面 > 担当者管理を開く
        await page.click('text=設定');
        await page.fill('#memberNameInput', '山田');
        await page.click('#btnAddMember');

        await expect(page.locator('.member-list .member-row .member-name')).toHaveText('山田');

        // クイック入力タブへ移動し、担当者selectに反映されていることを確認
        await page.click('text=クイック入力');
        const options = await page.locator('#quickMemberSelect option').allTextContents();
        expect(options).toContain('山田');
    });

    test('改名すると既存の見積・実績データの担当者名も遡及して置き換わる', async ({ page }) => {
        await page.goto(baseURL);
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.click('text=設定');
        await page.fill('#memberNameInput', '山田');
        await page.click('#btnAddMember');

        // TODO: 見積を1件登録してから改名し、見積一覧の担当者表示が追随することを確認する
        // （見積登録フォームのセレクタは estimate-add.spec.js 等の既存e2eを参照）

        await page.click('.member-list .member-row button:has-text("改名")');
        await page.fill('.member-rename-input', '山田太郎');
        await page.click('button:has-text("保存")');

        await expect(page.locator('.member-list .member-row .member-name')).toHaveText('山田太郎');
    });

    test('アーカイブすると新規入力用selectから消えるがアーカイブ済み一覧には残る', async ({ page }) => {
        await page.goto(baseURL);
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.click('text=設定');
        await page.fill('#memberNameInput', '山田');
        await page.click('#btnAddMember');
        await page.click('.member-list .member-row button:has-text("アーカイブ")');

        await expect(page.locator('#memberList .member-row')).toHaveCount(0);

        await page.click('.member-archived-toggle');
        await expect(page.locator('#archivedMemberList .member-row .member-name')).toHaveText('山田');

        await page.click('text=クイック入力');
        const options = await page.locator('#quickMemberSelect option').allTextContents();
        expect(options).not.toContain('山田');
    });
});
```

- [ ] **Step 3: e2eを実行**

Run: `npm run e2e -- tests/e2e/member-master.spec.js`
Expected: PASS（3件）。セレクタが実際のDOM構造と一致しない場合は、`page.pause()`やヘッド付き実行（`npx playwright test --headed`）で実DOMを確認し、テスト側のセレクタを実装に合わせて修正する（実装側は変更しない。既に承認済みのUI構造を優先する）。

- [ ] **Step 4: コミット**

```bash
git add tests/e2e/member-master.spec.js
git commit -m "test(e2e): 担当者マスタの主要シナリオをe2eで検証する"
```

---

### Task 21: 最終検証・統合

**Files:** なし

- [ ] **Step 1: 全特性テストを実行**

Run: `node --test`
Expected: PASS（全件）

- [ ] **Step 2: 全e2eテストを実行**

Run: `npm run e2e`
Expected: PASS（全件。既存のe2eが本変更で壊れていないことを含めて確認する）

- [ ] **Step 3: CODEMAPの整合性を確認**

Run: `node scripts/codemap.mjs --check`
Expected: 差分なし

- [ ] **Step 4: 統合**

```bash
bash scripts/worktree.sh finish
```

Expected: rebase → `npm run e2e` → ff-only マージ → push まで自動実行される。コンフリクトで停止した場合はCLAUDE.mdの手順（両立する形で解消 → `git rebase --continue` → `finish`再実行）に従う。

---

## 自己レビューメモ（このプラン作成時に実施）

- **仕様網羅性:** 設計書の「データモデル」「永続化」「Undo/Redo」「マージ対応」「改名の遡及」「初回移行」「新規データ取り込み時のマスタ自動追加」「UI」「`#memberOrder`撤去に伴う波及範囲」「書き換え対象」の全節に対応するタスクが存在する（Task 1-2→データモデル、Task 8→永続化・初回移行、Task 5→Undo/Redo、Task 6-7→マージ対応、Task 4→改名の遡及UI、Task 6→新規データ取り込み時の自動追加、Task 9-10→UI、Task 13-18→書き換え対象、Task 18→`#memberOrder`波及範囲）。
- **プレースホルダ:** 「TODO」を含む箇所はTask 20 Step 2の1箇所のみで、これは「既存の見積登録e2eのセレクタを参照して肉付けする」という具体的な参照先を示した実装時メモであり、値や動作を曖昧にしたものではない。
- **型・シグネチャの一貫性:** `renameMember()`が返す`affected`のキー名（`estimates`/`actuals`/`schedules`/`vacations`、複数形・配列）は、Task 3のテスト・Task 5の`history.js`アクションデータ・Task 4のUIハンドラの3箇所で統一されている。`getActiveMemberNames()`/`getAllMemberNames()`/`getMemberOrderString()`の関数名・戻り値の型（配列/配列/文字列）もTask 3で定義した通りに全呼び出し箇所（Task 11, 13-18）で一致させている。
