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
        State.setSchedules([{ id: 'sch_1', member: '山田' }, { id: 'sch_2', member: '佐藤' }]);
        State.setVacations([{ id: 30, member: '山田' }, { id: 31, member: '佐藤' }]);

        const result = Members.renameMember(1, '山田太郎');

        assert.equal(result.ok, true);
        assert.equal(result.oldName, '山田');
        assert.equal(result.newName, '山田太郎');
        assert.deepEqual(result.affected.estimates, [10]);
        assert.deepEqual(result.affected.actuals, [20]);
        assert.deepEqual(result.affected.schedules, ['sch_1']);
        assert.deepEqual(result.affected.vacations, [30]);
        assert.equal(State.members[0].name, '山田太郎');
        assert.equal(State.estimates.find(e => e.id === 10).member, '山田太郎');
        assert.equal(State.estimates.find(e => e.id === 11).member, '佐藤'); // 無関係データは変わらない
        assert.equal(State.actuals.find(a => a.id === 20).member, '山田太郎');
        assert.equal(State.schedules.find(s => s.id === 'sch_1').member, '山田太郎');
        assert.equal(State.schedules.find(s => s.id === 'sch_2').member, '佐藤'); // 無関係データは変わらない
        assert.equal(State.vacations.find(v => v.id === 30).member, '山田太郎');
        assert.equal(State.vacations.find(v => v.id === 31).member, '佐藤'); // 無関係データは変わらない
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
