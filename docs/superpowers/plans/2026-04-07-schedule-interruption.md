# スケジュール中断・差し込み機能 実装計画（Phase 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ガントチャートのバー分割・差し込み作業の自動配置・依存チェーンの連鎖ずらし機能を実装する（Phase 1: モーダル＋コンテキストメニュー）

**Architecture:** 新モジュール `js/schedule-interruption.js` にコアロジック（分割計算・中断CRUD・連鎖ずらし・影響分析）を集約。既存の `schedule.js`（モーダル拡張）、`schedule-render.js`（分割バー描画・コンテキストメニュー）、`index.html`（モーダルHTML）、`style.css` を修正する。

**Tech Stack:** 純粋なHTML/CSS/JavaScript（ES Modules）、Canvas 2D API

**Spec:** `docs/superpowers/specs/2026-04-07-schedule-interruption-design.md`

**Note on innerHTML:** この既存コードベースでは innerHTML による DOM 構築が標準パターンとして使用されている。ユーザー入力は既存の `escapeHtml()` ユーティリティでサニタイズする。

---

## ファイル構成

| ファイル | 操作 | 責務 |
|---------|------|------|
| `js/schedule-interruption.js` | 新規作成 | コアロジック: calculateSegments, getNextBusinessDay, calculateConsumedHoursAtDate, addInterruption, removeInterruption, cascadeShift, analyzeImpact, recalculateEndDateWithInterruptions |
| `js/schedule.js` | 修正 | formatDateForCheck のexport化、詳細モーダルに中断履歴セクション追加、中断モーダルの開閉・保存処理 |
| `js/schedule-render.js` | 修正 | drawScheduleBar の分割描画対応、コンテキストメニュー追加、セグメント別 scheduleRects 登録 |
| `js/init.js` | 修正 | schedule-interruption.js のimportとwindowへのバインド |
| `index.html` | 修正 | 中断モーダル、影響プレビューダイアログのHTML追加 |
| `style.css` | 修正 | 中断モーダル、コンテキストメニューのスタイル |

---

## Task 1: ユーティリティ関数（schedule-interruption.js の土台）

**Files:**
- Create: `js/schedule-interruption.js`
- Modify: `js/schedule.js:705` — `formatDateForCheck` を export 化

- [ ] **Step 1: `formatDateForCheck` を export 化**

`js/schedule.js:705` の `function formatDateForCheck(date)` を `export function` に変更:

```javascript
// js/schedule.js:705 変更前
function formatDateForCheck(date) {

// js/schedule.js:705 変更後
export function formatDateForCheck(date) {
```

- [ ] **Step 2: `js/schedule-interruption.js` を作成 — ユーティリティ関数**

```javascript
// ============================================
// [GANTT-CHART] スケジュール中断・差し込み管理
// ============================================

import {
    schedules, setSchedules, nextScheduleId, setNextScheduleId,
    scheduleSettings, estimates
} from './state.js';
import {
    isBusinessDay, calculateEndDate, countBusinessDays, formatDateForCheck
} from './schedule.js';
import { SCHEDULE } from './constants.js';

/**
 * 翌営業日を取得
 * @param {string} dateStr - 基準日（YYYY-MM-DD）
 * @param {string} member - 担当者名
 * @returns {string} 翌営業日（YYYY-MM-DD）
 */
export function getNextBusinessDay(dateStr, member) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    while (!isBusinessDay(date, member)) {
        date.setDate(date.getDate() + 1);
    }
    return formatDateForCheck(date);
}

/**
 * 指定日までの消化工数を自動計算
 * 既存の中断がある場合は、該当セグメント内の営業日から算出
 * @param {Object} schedule - スケジュールオブジェクト
 * @param {string} splitDate - 中断日（YYYY-MM-DD）
 * @returns {number} 消化工数（時間）
 */
export function calculateConsumedHoursAtDate(schedule, splitDate) {
    const hoursPerDay = scheduleSettings.hoursPerDay || 8;
    const interruptions = schedule.interruptions || [];

    if (interruptions.length === 0) {
        // 中断なし: startDate〜splitDateの営業日数 x hoursPerDay
        return countBusinessDays(schedule.startDate, splitDate, schedule.member) * hoursPerDay;
    }

    // 既存中断あり: セグメントを計算して、splitDateが属するセグメントまでの累計
    const segments = calculateSegments(schedule);
    let consumed = 0;

    for (const seg of segments) {
        if (splitDate < seg.startDate) break;
        if (splitDate <= seg.endDate) {
            // このセグメント内で中断
            consumed += countBusinessDays(seg.startDate, splitDate, schedule.member) * hoursPerDay;
            break;
        }
        consumed += seg.hours;
    }

    return Math.min(consumed, schedule.estimatedHours);
}

/**
 * スケジュールをセグメントに分割
 * @param {Object} schedule - スケジュールオブジェクト
 * @returns {Array<{startDate: string, endDate: string, hours: number, index: number}>}
 */
export function calculateSegments(schedule) {
    const interruptions = schedule.interruptions || [];

    if (interruptions.length === 0) {
        return [{
            startDate: schedule.startDate,
            endDate: schedule.endDate,
            hours: schedule.estimatedHours,
            index: 0
        }];
    }

    // consumedHoursの昇順でソート
    const sorted = [...interruptions].sort((a, b) => a.consumedHours - b.consumedHours);
    const segments = [];
    let segStartDate = schedule.startDate;
    let prevConsumed = 0;

    sorted.forEach((int, i) => {
        const segHours = int.consumedHours - prevConsumed;
        if (segHours <= 0) return;

        const segEndDate = calculateEndDate(segStartDate, segHours, schedule.member);
        segments.push({
            startDate: segStartDate,
            endDate: segEndDate,
            hours: segHours,
            index: i
        });

        // 次セグメントの開始日を決定
        if (int.insertedScheduleId) {
            const inserted = schedules.find(s => s.id === int.insertedScheduleId);
            if (inserted) {
                segStartDate = getNextBusinessDay(inserted.endDate, schedule.member);
            } else {
                segStartDate = getNextBusinessDay(segEndDate, schedule.member);
            }
        } else {
            segStartDate = getNextBusinessDay(segEndDate, schedule.member);
        }

        prevConsumed = int.consumedHours;
    });

    // 最終セグメント: 残り工数
    const remainingHours = schedule.estimatedHours - prevConsumed;
    if (remainingHours > 0) {
        const segEndDate = calculateEndDate(segStartDate, remainingHours, schedule.member);
        segments.push({
            startDate: segStartDate,
            endDate: segEndDate,
            hours: remainingHours,
            index: sorted.length
        });
    }

    return segments;
}

/**
 * 中断を考慮してendDateを再計算
 * @param {Object} schedule - スケジュールオブジェクト
 * @returns {string} 新しいendDate（YYYY-MM-DD）
 */
export function recalculateEndDateWithInterruptions(schedule) {
    const segments = calculateSegments(schedule);
    if (segments.length === 0) return schedule.startDate;
    return segments[segments.length - 1].endDate;
}
```

- [ ] **Step 3: コード構文のレビュー**

import/exportのパスや関数名に誤りがないか確認。ブラウザのコンソールでのimportエラーはTask 8で`init.js`を更新する際に確認する。

- [ ] **Step 4: コミット**

```bash
git add js/schedule-interruption.js js/schedule.js
git commit -m "feat: schedule-interruption.js の土台作成（calculateSegments, getNextBusinessDay等）"
```

---

## Task 2: 中断追加・削除ロジック

**Files:**
- Modify: `js/schedule-interruption.js` — addInterruption, removeInterruption を追加

- [ ] **Step 1: `addInterruption` を追加**

`js/schedule-interruption.js` の末尾に追加:

```javascript
/**
 * スケジュールに中断を追加
 * @param {string} scheduleId - 対象スケジュールID
 * @param {Object} params - 中断パラメータ
 * @param {string} params.splitDate - 中断日（YYYY-MM-DD）
 * @param {number} params.consumedHours - 中断時点の消化工数
 * @param {string} params.reason - 中断理由
 * @param {Object} [params.insertOptions] - 差し込み作業（任意）
 * @param {string} params.insertOptions.version - 版数
 * @param {string} params.insertOptions.task - 対応名
 * @param {string} params.insertOptions.process - 工程
 * @param {number} params.insertOptions.hours - 工数
 * @param {string} params.insertOptions.member - 担当者（省略時は元スケジュールの担当者）
 * @returns {{ schedule: Object, insertedSchedule: Object|null, cascadeResults: Array }}
 */
export function addInterruption(scheduleId, params) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const oldEndDate = schedule.endDate;

    // 中断レコード作成
    const interruption = {
        id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        splitDate: params.splitDate,
        consumedHours: params.consumedHours,
        reason: params.reason || '',
        insertedScheduleId: null
    };

    // 差し込みスケジュール作成（オプション）
    let insertedSchedule = null;
    if (params.insertOptions) {
        const opts = params.insertOptions;
        // 差し込みの開始日 = 中断セグメントの終了日の翌営業日
        const segEndDate = calculateEndDate(schedule.startDate, params.consumedHours, schedule.member);
        const insertMember = opts.member || schedule.member;
        const insertStartDate = getNextBusinessDay(segEndDate, insertMember);
        const insertEndDate = calculateEndDate(insertStartDate, opts.hours, insertMember);

        const insertId = `sch_${nextScheduleId}`;
        setNextScheduleId(nextScheduleId + 1);

        insertedSchedule = {
            id: insertId,
            version: opts.version,
            task: opts.task,
            process: opts.process,
            member: insertMember,
            startDate: insertStartDate,
            estimatedHours: opts.hours,
            endDate: insertEndDate,
            status: SCHEDULE.STATUS.PENDING,
            color: '',
            note: `${schedule.version}/${schedule.task}/${schedule.process} の差し込み作業`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        interruption.insertedScheduleId = insertId;
        setSchedules([...schedules, insertedSchedule]);
    }

    // 中断をスケジュールに追加
    const interruptions = [...(schedule.interruptions || []), interruption];
    const updatedSchedule = {
        ...schedule,
        interruptions,
        updatedAt: new Date().toISOString()
    };

    // endDate再計算
    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    // スケジュール配列を更新
    const newSchedules = schedules.map(s => s.id === scheduleId ? updatedSchedule : s);
    setSchedules(newSchedules);

    // 連鎖ずらし
    const cascadeResults = cascadeShift(updatedSchedule, oldEndDate);

    // 保存
    if (typeof window.saveData === 'function') window.saveData();

    return { schedule: updatedSchedule, insertedSchedule, cascadeResults };
}

/**
 * スケジュールから中断を取り消し
 * @param {string} scheduleId - 対象スケジュールID
 * @param {string} interruptionId - 中断ID
 * @param {boolean} deleteInserted - 差し込みスケジュールも削除するか
 * @returns {{ schedule: Object, cascadeResults: Array }}
 */
export function removeInterruption(scheduleId, interruptionId, deleteInserted = false) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const oldEndDate = schedule.endDate;
    const interruption = (schedule.interruptions || []).find(i => i.id === interruptionId);
    if (!interruption) return null;

    // 中断を削除
    const interruptions = (schedule.interruptions || []).filter(i => i.id !== interruptionId);
    const updatedSchedule = {
        ...schedule,
        interruptions,
        updatedAt: new Date().toISOString()
    };

    // endDate再計算
    updatedSchedule.endDate = recalculateEndDateWithInterruptions(updatedSchedule);

    // スケジュール配列を更新
    let newSchedules = schedules.map(s => s.id === scheduleId ? updatedSchedule : s);

    // 差し込みスケジュールの削除（オプション）
    if (deleteInserted && interruption.insertedScheduleId) {
        newSchedules = newSchedules.filter(s => s.id !== interruption.insertedScheduleId);
    }

    setSchedules(newSchedules);

    // 逆方向の連鎖ずらし（endDateが早まった場合）
    const cascadeResults = cascadeShift(updatedSchedule, oldEndDate);

    // 保存
    if (typeof window.saveData === 'function') window.saveData();

    return { schedule: updatedSchedule, cascadeResults };
}
```

- [ ] **Step 2: コミット**

```bash
git add js/schedule-interruption.js
git commit -m "feat: addInterruption, removeInterruption を実装"
```

---

## Task 3: 連鎖ずらし・影響分析ロジック

**Files:**
- Modify: `js/schedule-interruption.js` — cascadeShift, analyzeImpact を追加

- [ ] **Step 1: `cascadeShift` と `analyzeImpact` を追加**

`js/schedule-interruption.js` の末尾に追加:

```javascript
const PROCESS_ORDER = ['UI', 'PG', 'PT', 'IT', 'ST'];

/**
 * 連鎖ずらしを実行
 * @param {Object} changedSchedule - endDateが変更されたスケジュール
 * @param {string} oldEndDate - 変更前のendDate
 * @returns {Array<{id, version, task, process, member, oldStart, newStart, oldEnd, newEnd}>}
 */
export function cascadeShift(changedSchedule, oldEndDate) {
    if (changedSchedule.endDate === oldEndDate) return [];

    const results = [];
    const processed = new Set();
    processed.add(changedSchedule.id);

    const queue = [{ schedule: changedSchedule, oldEndDate }];

    while (queue.length > 0) {
        const { schedule: src, oldEndDate: srcOldEnd } = queue.shift();

        const oldEnd = new Date(srcOldEnd);
        const newEnd = new Date(src.endDate);
        const diffDays = Math.round((newEnd - oldEnd) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) continue;

        // 影響対象を特定
        const targets = findDependentSchedules(src, srcOldEnd);

        targets.forEach(target => {
            if (processed.has(target.id)) return;
            processed.add(target.id);

            const targetOldStart = target.startDate;
            const targetOldEnd = target.endDate;

            // 新しい開始日を計算
            const date = new Date(target.startDate);
            if (diffDays > 0) {
                let shifted = 0;
                while (shifted < diffDays) { date.setDate(date.getDate() + 1); shifted++; }
            } else {
                let shifted = 0;
                while (shifted < Math.abs(diffDays)) { date.setDate(date.getDate() - 1); shifted++; }
            }
            // 営業日に着地させる
            while (!isBusinessDay(date, target.member)) {
                date.setDate(date.getDate() + 1);
            }
            const newStartDate = formatDateForCheck(date);
            const newEndDate = calculateEndDate(newStartDate, target.estimatedHours, target.member);

            // 更新
            const updated = {
                ...target,
                startDate: newStartDate,
                endDate: newEndDate,
                updatedAt: new Date().toISOString()
            };

            // 中断がある場合はendDateを再計算
            if (updated.interruptions && updated.interruptions.length > 0) {
                updated.endDate = recalculateEndDateWithInterruptions(updated);
            }

            const newSchedules = schedules.map(s => s.id === target.id ? updated : s);
            setSchedules(newSchedules);

            results.push({
                id: target.id,
                version: target.version,
                task: target.task,
                process: target.process,
                member: target.member,
                oldStart: targetOldStart,
                newStart: newStartDate,
                oldEnd: targetOldEnd,
                newEnd: updated.endDate
            });

            queue.push({ schedule: updated, oldEndDate: targetOldEnd });
        });
    }

    return results;
}

/**
 * 依存する後続スケジュールを検索
 */
function findDependentSchedules(src, srcOldEndDate) {
    const targets = [];

    schedules.forEach(s => {
        if (s.id === src.id) return;

        // a) 同じ version + task の後続工程
        if (s.version === src.version && s.task === src.task) {
            const srcIdx = PROCESS_ORDER.indexOf(src.process);
            const targetIdx = PROCESS_ORDER.indexOf(s.process);
            if (targetIdx > srcIdx && s.startDate >= srcOldEndDate) {
                targets.push(s);
                return;
            }
        }

        // b) 同じ担当者の後続スケジュール
        if (s.member === src.member && s.startDate >= srcOldEndDate) {
            targets.push(s);
        }
    });

    return targets;
}

/**
 * 影響分析（実際には変更しない）
 * @param {string} scheduleId - 対象スケジュールID
 * @param {string} splitDate - 中断日
 * @param {number} consumedHours - 消化工数
 * @param {number} [insertHours] - 差し込み工数（0なら差し込みなし）
 * @returns {Object} { segments, impacts, insertPeriod }
 */
export function analyzeImpact(scheduleId, splitDate, consumedHours, insertHours = 0) {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return null;

    const member = schedule.member;
    const remainingHours = schedule.estimatedHours - consumedHours;

    // 前半セグメント
    const firstSegEnd = calculateEndDate(schedule.startDate, consumedHours, member);

    // 差し込み期間
    let insertPeriod = null;
    let lastSegStart;
    if (insertHours > 0) {
        const insertStart = getNextBusinessDay(firstSegEnd, member);
        const insertEnd = calculateEndDate(insertStart, insertHours, member);
        insertPeriod = { startDate: insertStart, endDate: insertEnd, hours: insertHours };
        lastSegStart = getNextBusinessDay(insertEnd, member);
    } else {
        lastSegStart = getNextBusinessDay(firstSegEnd, member);
    }

    // 後半セグメント
    const lastSegEnd = calculateEndDate(lastSegStart, remainingHours, member);

    const segments = [
        { startDate: schedule.startDate, endDate: firstSegEnd, hours: consumedHours, label: '前半' },
        { startDate: lastSegStart, endDate: lastSegEnd, hours: remainingHours, label: '後半' }
    ];

    // 新しいendDateから影響を計算
    const newEndDate = lastSegEnd;
    const oldEndDate = schedule.endDate;
    const impacts = [];

    if (newEndDate !== oldEndDate) {
        const processed = new Set();
        processed.add(schedule.id);

        const queue = [{
            id: schedule.id, version: schedule.version, task: schedule.task,
            process: schedule.process, member: schedule.member,
            endDate: newEndDate, oldEndDate
        }];

        while (queue.length > 0) {
            const src = queue.shift();
            const diffDays = Math.round(
                (new Date(src.endDate) - new Date(src.oldEndDate)) / (1000 * 60 * 60 * 24)
            );
            if (diffDays === 0) continue;

            schedules.forEach(s => {
                if (processed.has(s.id)) return;

                let isDependent = false;
                // 同タスク後続工程
                if (s.version === src.version && s.task === src.task) {
                    const srcIdx = PROCESS_ORDER.indexOf(src.process);
                    const targetIdx = PROCESS_ORDER.indexOf(s.process);
                    if (targetIdx > srcIdx && s.startDate >= src.oldEndDate) isDependent = true;
                }
                // 同担当者の後続
                if (s.member === src.member && s.startDate >= src.oldEndDate) isDependent = true;

                if (!isDependent) return;
                processed.add(s.id);

                const date = new Date(s.startDate);
                if (diffDays > 0) {
                    let shifted = 0;
                    while (shifted < diffDays) { date.setDate(date.getDate() + 1); shifted++; }
                } else {
                    let shifted = 0;
                    while (shifted < Math.abs(diffDays)) { date.setDate(date.getDate() - 1); shifted++; }
                }
                while (!isBusinessDay(date, s.member)) { date.setDate(date.getDate() + 1); }

                const newTargetStart = formatDateForCheck(date);
                const newTargetEnd = calculateEndDate(newTargetStart, s.estimatedHours, s.member);

                impacts.push({
                    id: s.id, version: s.version, task: s.task,
                    process: s.process, member: s.member,
                    oldStart: s.startDate, newStart: newTargetStart,
                    oldEnd: s.endDate, newEnd: newTargetEnd
                });

                queue.push({
                    id: s.id, version: s.version, task: s.task,
                    process: s.process, member: s.member,
                    endDate: newTargetEnd, oldEndDate: s.endDate
                });
            });
        }
    }

    return { segments, impacts, insertPeriod };
}
```

- [ ] **Step 2: コミット**

```bash
git add js/schedule-interruption.js
git commit -m "feat: cascadeShift, analyzeImpact を実装"
```

---

## Task 4: 中断モーダル・影響プレビューのHTML

**Files:**
- Modify: `index.html` — 中断モーダルと影響プレビューダイアログを追加（既存の `scheduleDetailModal` の後、約2493行目付近）

- [ ] **Step 1: 中断モーダルHTMLを追加**

`index.html` の `scheduleDetailModal` の閉じタグの直後に、中断モーダルと影響プレビューダイアログのHTMLを追加する。

中断モーダル:
- `id="interruptionModal"` — 中断日、消化工数、理由、差し込み作業（チェックボックスで展開）
- 差し込みセクション: 版数select、対応名input+datalist、工程select、工数input
- フッター: キャンセル、影響を確認ボタン

影響プレビュー:
- `id="impactPreviewModal"` — 分割情報、差し込み情報、影響リストを動的表示
- `id="impactPreviewContent"` — JSから内容を注入するコンテナ
- フッター: 戻る、キャンセル、適用するボタン

全HTMLの詳細は `docs/superpowers/specs/2026-04-07-schedule-interruption-design.md` セクション4.4, 4.5 を参照。

- [ ] **Step 2: コミット**

```bash
git add index.html
git commit -m "feat: 中断モーダル・影響プレビューダイアログのHTML追加"
```

---

## Task 5: コンテキストメニュー・影響プレビューのCSS

**Files:**
- Modify: `style.css` — コンテキストメニュー、影響プレビュー、中断履歴のスタイルを追加

- [ ] **Step 1: スタイルを追加**

`style.css` の末尾に以下のスタイルを追加:

1. `.schedule-context-menu` — fixedポジション、白背景、ボックスシャドウ、fadeInアニメーション
2. `.schedule-context-menu-item` — flexレイアウト、ホバーで背景色変更
3. `.schedule-context-menu-separator` — 区切り線
4. `.impact-section`, `.impact-item`, `.impact-item-new`, `.impact-item-shift` — 影響プレビューのカード形式表示
5. `.interruption-history`, `.interruption-history-item` — 詳細モーダル内の中断履歴

デザインの詳細はスペック文書セクション4を参照。テーマカラーとの調和に注意（`var(--theme-color)` を適切に使用）。

- [ ] **Step 2: コミット**

```bash
git add style.css
git commit -m "feat: コンテキストメニュー・影響プレビュー・中断履歴のスタイル追加"
```

---

## Task 6: Canvas描画 — 分割バーの描画

**Files:**
- Modify: `js/schedule-render.js:1019-1228` — `drawScheduleBar` を拡張して分割描画対応

- [ ] **Step 1: importに `calculateSegments` を追加**

`js/schedule-render.js` の先頭のimport文に追加:

```javascript
import { calculateSegments } from './schedule-interruption.js';
import { formatDateForCheck } from './schedule.js';
```

（`formatDateForCheck` はTask 7のコンテキストメニューでも使用）

- [ ] **Step 2: `drawScheduleBar` の先頭に分岐を追加**

`drawScheduleBar(schedule, rowY)` メソッド（1019行目）の `const ctx = this.timelineCtx;` の直後:

```javascript
        // 中断がある場合は分割描画
        if (schedule.interruptions && schedule.interruptions.length > 0) {
            this.drawSplitScheduleBar(schedule, rowY);
            return;
        }
```

- [ ] **Step 3: `drawSplitScheduleBar` メソッドを追加**

`drawScheduleBar` メソッドの直後（1228行目の `}` の後）に新メソッドを追加。
処理内容:

1. `calculateSegments(schedule)` でセグメント配列を取得
2. 各セグメントをバーとして描画（色・休日オーバーレイ・テキスト）
   - 最初のセグメント: `taskColor`（元の色）で描画
   - 2番目以降: `lightColor`（明るい色）で描画。テキストに `(続)` 付与
3. セグメント端に✂マーク描画（`ctx.fillText('✂', ...)`）
4. セグメント間に点線描画（`ctx.setLineDash([4, 4])`, バーと同色, opacity 0.4）
5. 各セグメントを `this.scheduleRects` に個別登録（クリック判定用）

既存の `clipRoundRect`, `drawHolidayOverlay`, `lightenColor`, `desaturateColor` を再利用する。

- [ ] **Step 4: ブラウザで分割バーが描画されるか確認**

ブラウザのDevToolsコンソールで仮のinterruptionsを追加して描画確認:
```javascript
const s = schedules[0];
s.interruptions = [{ id: 'test', splitDate: '...適切な日付...', consumedHours: 16, reason: 'test', insertedScheduleId: null }];
renderScheduleView();
```

- [ ] **Step 5: コミット**

```bash
git add js/schedule-render.js
git commit -m "feat: 分割バーの描画（✂マーク + 点線接続）を実装"
```

---

## Task 7: コンテキストメニュー

**Files:**
- Modify: `js/schedule-render.js` — contextmenuイベントハンドラ追加

- [ ] **Step 1: コンテキストメニュー関数を追加**

`setupCanvasClickHandler` 関数の前（約1575行目付近）に以下を追加:

1. `closeContextMenu()` — アクティブなコンテキストメニューをDOMから削除
2. `showScheduleContextMenu(event, schedule, clickDate)` — DOM要素を動的生成してbodyに追加
   - メニュー項目: 「詳細を表示」「✂ ここで中断 (日付)」「削除」
   - 位置: `event.clientX/Y` ベース、画面端を考慮
3. `document.addEventListener('click', closeContextMenu)` — グローバルクリックで閉じる

- [ ] **Step 2: `setupCanvasClickHandler` 内に contextmenu イベントを追加**

`canvas.addEventListener('click', ...)` の直後に `contextmenu` イベントリスナーを追加:
- `event.preventDefault()` でブラウザのデフォルトメニューを抑止
- `renderer.getScheduleAtPosition(x, y)` でバー判定
- `renderer.xToDate(x)` + `formatDateForCheck` で日付取得
- `showScheduleContextMenu(event, schedule, dateStr)` を呼び出し

- [ ] **Step 3: ブラウザでコンテキストメニューが動作するか確認**

ガントチャートのバーを右クリック → メニュー表示 → 日付が正しいことを確認。

- [ ] **Step 4: コミット**

```bash
git add js/schedule-render.js
git commit -m "feat: スケジュールバーの右クリックコンテキストメニュー追加"
```

---

## Task 8: 中断モーダルのイベントハンドラ

**Files:**
- Modify: `js/schedule.js` — 中断モーダルの開閉・操作・プレビュー・適用処理
- Modify: `js/init.js` — importとwindowバインド追加

- [ ] **Step 1: `schedule.js` に schedule-interruption.js のimportを追加**

`js/schedule.js` 先頭のimportブロックに追加:

```javascript
import {
    calculateConsumedHoursAtDate, addInterruption, removeInterruption,
    analyzeImpact, calculateSegments
} from './schedule-interruption.js';
```

- [ ] **Step 2: 中断モーダル関数群を `schedule.js` に追加**

`closeScheduleDetailModal` の後（約940行目付近）に以下の関数を追加:

1. `openInterruptionModal(scheduleId, presetDate)` — モーダルのフィールド初期化と表示
2. `closeInterruptionModal()` — モーダル非表示
3. `onInterruptionSplitDateChange()` — 中断日変更時の消化工数自動再計算
4. `toggleInsertSection()` — 差し込みセクションの表示切替
5. `updateInterruptionInsertTaskOptions()` — 版数選択に応じた対応名候補更新
6. `showImpactPreview()` — `analyzeImpact()` を呼んでプレビューHTMLを構築・表示
7. `closeImpactPreview()` / `backToInterruptionModal()` — プレビューの閉じ/戻る
8. `applyInterruption()` — `addInterruption()` を実行し、UI更新とトースト表示

すべてexport。詳細なコードはスペック文書セクション4.4, 4.5に対応。

- [ ] **Step 3: `init.js` にimportとwindowバインドを追加**

`js/init.js` に以下を追加:

```javascript
import * as ScheduleInterruption from './schedule-interruption.js';
```

windowバインド:

```javascript
window.openInterruptionModal = Schedule.openInterruptionModal;
window.closeInterruptionModal = Schedule.closeInterruptionModal;
window.onInterruptionSplitDateChange = Schedule.onInterruptionSplitDateChange;
window.toggleInsertSection = Schedule.toggleInsertSection;
window.updateInterruptionInsertTaskOptions = Schedule.updateInterruptionInsertTaskOptions;
window.showImpactPreview = Schedule.showImpactPreview;
window.closeImpactPreview = Schedule.closeImpactPreview;
window.backToInterruptionModal = Schedule.backToInterruptionModal;
window.applyInterruption = Schedule.applyInterruption;
```

- [ ] **Step 4: コミット**

```bash
git add js/schedule.js js/init.js
git commit -m "feat: 中断モーダルのイベントハンドラ・影響プレビュー・適用処理を実装"
```

---

## Task 9: スケジュール詳細モーダルに中断履歴を追加

**Files:**
- Modify: `index.html` — 詳細モーダル内に中断履歴コンテナを追加
- Modify: `js/schedule.js` — `openScheduleDetailModal` に中断履歴レンダリングを追加
- Modify: `js/init.js` — windowバインド追加

- [ ] **Step 1: `index.html` に中断履歴コンテナを追加**

`scheduleDetailModal` 内の `<div id="detailActualList">` の直後に追加:

```html
<div id="detailInterruptionHistory" class="interruption-history" style="display: none;">
    <div class="interruption-history-title">中断履歴</div>
    <div id="detailInterruptionList"></div>
</div>
```

`modal-footer` に「中断を追加」ボタンを追加（「見積を編集」ボタンの隣）。

- [ ] **Step 2: `schedule.js` に中断履歴レンダリング関数を追加**

1. `renderDetailInterruptionHistory(schedule)` — 中断リストをHTML描画
2. `openInterruptionFromDetail()` — 詳細モーダルを閉じて中断モーダルを開く
3. `editInterruptionFromDetail(interruptionId)` — 編集（取り消し+再作成）
4. `removeInterruptionFromDetail(interruptionId)` — 取り消し確認ダイアログ + 実行

`openScheduleDetailModal` 内の `renderDetailActualList(schedule);` の直後に `renderDetailInterruptionHistory(schedule);` を呼び出す。

- [ ] **Step 3: `init.js` にwindowバインドを追加**

```javascript
window.openInterruptionFromDetail = Schedule.openInterruptionFromDetail;
window.editInterruptionFromDetail = Schedule.editInterruptionFromDetail;
window.removeInterruptionFromDetail = Schedule.removeInterruptionFromDetail;
```

- [ ] **Step 4: コミット**

```bash
git add js/schedule.js js/init.js index.html
git commit -m "feat: スケジュール詳細モーダルに中断履歴セクション追加"
```

---

## Task 10: 統合テスト・最終調整

**Files:**
- 全ファイルの動作確認と微調整

- [ ] **Step 1: ブラウザでの統合テスト — 中断追加フロー**

1. スケジュールタブを開く
2. バーを右クリック → コンテキストメニュー表示
3. 「ここで中断」→ 中断モーダル（日付プリセット）
4. 消化工数の自動計算を確認
5. 差し込み作業を入力
6. 「影響を確認」→ プレビュー表示
7. 「適用する」→ バー分割 + 差し込みバー生成

- [ ] **Step 2: 分割バー描画の確認**

1. ✂マーク表示
2. 点線接続
3. セグメントごとのクリック判定
4. 差し込みバーの位置

- [ ] **Step 3: 中断取り消しの確認**

1. 詳細モーダル → 中断履歴表示
2. 「取り消し」→ 確認 → バー復元
3. 差し込みスケジュール削除確認

- [ ] **Step 4: 連鎖ずらしの確認**

1. 複数工程（PG→PT→IT）のスケジュール準備
2. PGに中断追加 → 後続が自動ずれ
3. 影響プレビューの事前表示確認

- [ ] **Step 5: データ永続化の確認**

1. 中断追加後にページリロード
2. 分割バーが保持されている
3. 差し込みスケジュールも保持

- [ ] **Step 6: 発見した問題の修正**

統合テストで発見した問題を修正。

- [ ] **Step 7: 最終コミット**

```bash
git add js/schedule-interruption.js js/schedule.js js/schedule-render.js js/init.js index.html style.css
git commit -m "feat: スケジュール中断・差し込み機能（Phase 1）完成"
```
