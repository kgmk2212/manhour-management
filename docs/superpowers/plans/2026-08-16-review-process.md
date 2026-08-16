# レビュー工程サポート 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各工程（UI/PG/PT/IT/ST）に0〜1回入るレビューを、isReview フラグ付きレコード行として見積・実績・スケジュールへ統一拡張する（親工程の内訳方式）。

**Architecture:** 見積・実績・スケジュールの各レコードに省略可能な `isReview: true` を追加。既存の工程別集計は全行合算のため無変更で正しく、表示側に R バッジ／内訳セグメント／ガント縞バーを追加する。レコード同一性キー（マージ・自動生成の重複判定・スケジュール連動検索・進捗の実績マッチング）に isReview を組み込む。

**Tech Stack:** 純粋な HTML/CSS/JS（ES Modules）、localStorage、検証は /verify-ui（Playwright 実ブラウザ・DOM 機械判定）。

**Spec:** `docs/superpowers/specs/2026-08-16-review-process-design.md`

## Global Constraints

- マジックナンバー禁止（`js/constants.js` の定数を使用）、新しい状態変数は `js/state.js`、関数に JSDoc、既存コードスタイルに合わせる
- コミットは自分が編集したファイルのみ明示ステージ（`git add <file>...`、`-A` 禁止）
- 各 Phase 完了時に /verify-ui で PASS するまで完了扱いにしない。全 Phase 完了後に /deploy
- 旧データ（isReview なし）は一律 falsy 扱い。フラグは `isReview: true` のときのみ付与（false は書かない）
- isReview の一致判定は常に `!a.isReview === !b.isReview` 形式（undefined/false を同一視）

---

### Task 1: 基盤（バッジCSS・共通ヘルパー・マージキー）

**Files:**
- Modify: `style.css`（.badge-st 定義の後ろ、~857行付近）
- Modify: `js/utils.js`（末尾付近に関数追加）
- Modify: `js/merge-json.js:92,103,117`
- Modify: `js/excel-import.js:285,319`

**Interfaces:**
- Produces: `Utils.reviewBadgeHtml(isReview)` — isReview が truthy なら `<span class="badge badge-review" title="レビュー">R</span>` を、falsy なら `''` を返す。以降の全表示タスクが使用。

- [x] **Step 1: style.css に badge-review と est-review-row を追加**

```css
.badge-review {
    background: #7c3aed;
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: calc(14px * var(--ui-scale));
    font-weight: 700;
    margin-left: 4px;
    white-space: nowrap;
}

tr.est-review-row .est-review-mark {
    color: #7c3aed;
    font-weight: 700;
}
```

- [x] **Step 2: utils.js に reviewBadgeHtml を追加**

```js
/**
 * レビュー行を示す R バッジの HTML を返す
 * @param {boolean} isReview - レビュー行なら true
 * @returns {string} バッジ HTML（レビューでなければ空文字）
 */
export function reviewBadgeHtml(isReview) {
    return isReview ? '<span class="badge badge-review" title="レビュー">R</span>' : '';
}
```

- [x] **Step 3: merge-json.js の keyOf 3箇所に isReview を追加**

```js
// actuals (92): ...s(r.process), r.isReview ? 'R' : ''].join('|')
// estimates (103): ...s(r.member), r.isReview ? 'R' : ''].join('|')
// schedules (117): ...normalizeDate(r.startDate), r.isReview ? 'R' : ''].join('|')
```

- [x] **Step 4: excel-import.js の keyOf 2箇所（285, 319）にも同様に `r.isReview ? 'R' : ''` を追加**（Excel由来レコードは常に非レビュー扱い＝既存レビュー行を上書きしない）

- [x] **Step 5: コミット** `feat(review): レビュー行の基盤（バッジ・ヘルパー・マージキー）を追加`

---

### Task 2: 見積入力モーダル（＋レビュー行・収集・保存・編集）

**Files:**
- Modify: `index.html:2534-2560` 付近（addEstimateTable の各工程行の「＋」ボタンセル）
- Modify: `js/estimate-add.js`（addEstimateMemberRow / collectAllEstimateEntries / addEstimateFromModalNormal / openEditAllProcesses / saveEditAllProcesses）

**Interfaces:**
- Consumes: `Utils.reviewBadgeHtml`
- Produces: 見積レコードに `isReview: true`（レビュー行のみ）。`collectAllEstimateEntries()` の戻り値に `isReview: boolean` が加わる。

- [x] **Step 1: index.html の各工程行（UI/PG/PT/IT/ST の5行）の「＋」ボタン隣に「＋R」ボタンを追加**

```html
<td class="est-add-member-cell">
  <button type="button" class="est-add-member-btn" onclick="addEstimateMemberRow('UI')" title="担当者を追加">+</button>
  <button type="button" class="est-add-member-btn est-add-review-btn" onclick="addEstimateMemberRow('UI', true)" title="レビュー行を追加">+R</button>
</td>
```

- [x] **Step 2: addEstimateMemberRow(proc, isReview = false) に拡張**（js/estimate-add.js:1278）
  - `newRow.className = 'est-extra-member-row' + (isReview ? ' est-review-row' : '')`
  - `if (isReview) newRow.dataset.review = 'true'`
  - 先頭セル: isReview なら `<td class="est-review-mark" style="text-align: center; font-size: calc(15.5px * var(--ui-scale));">R</td>`、通常は従来の `┗`
  - window バインド（init.js）が引数を渡せることを確認（onclick 直書きなので追加作業なし）

- [x] **Step 3: collectAllEstimateEntries に isReview を追加**（プライマリ行は `isReview: false`、追加行は `isReview: row.dataset.review === 'true'`）

- [x] **Step 4: addEstimateFromModalNormal の est 生成に `...(entry.isReview ? { isReview: true } : {})` を追加**

- [x] **Step 5: openEditAllProcesses のプリフィルを main/review に分離**（js/estimate-add.js:258）

```js
const procAll = taskEstimates.filter(e => e.process === proc);
const procEstimates = procAll.filter(e => !e.isReview);   // 本作業（従来ロジックの対象）
const reviewEstimates = procAll.filter(e => e.isReview);  // レビュー行として展開
// 従来の primary/slice(1) 展開は procEstimates に対して行う
// reviewEstimates は addEstimateMemberRow(proc, true) で行を作り member/hours/estimateId をセット
```

  - 複数月モードの作業月プリフィル（296-312行）も同様に procAll ベースの ID 対応付けで review 行を含める（既存の `est-extra-member-row` セレクタは review 行も拾うため、estimateId 対応付けはそのまま動く）

- [x] **Step 6: saveEditAllProcesses の行収集・保存に isReview を反映**（js/estimate-add.js:367-476）
  - 追加行収集（380-387）: `isReview: row.dataset.review === 'true'` を rows に追加（プライマリは false）
  - 新規作成（447-473）: newEst に `...(isReview ? { isReview: true } : {})`
  - 更新パス: 既存レコードのスプレッド維持で isReview は保たれる（変更不要）
  - スケジュール連動検索（429-434）: `&& !s.isReview === !existingEst.isReview` を追加

- [x] **Step 7: 手動確認（ブラウザで +R 行追加→保存→localStorage に isReview 付きで入ること）は Task 5 の /verify-ui に含める。コミット** `feat(estimate): 見積入力モーダルにレビュー行（+R）を追加`

---

### Task 3: 見積表示（一覧・マトリクス・詳細）と単工程編集

**Files:**
- Modify: `js/estimate.js`（renderEstimateGrouped 865/952/958/961、renderEstimateMatrix 1186、showEstimateDetail 1510、showTaskDetail 1655-1755、renderEstimateDetailList 1280）
- Modify: `js/estimate-edit.js`（siblings 展開 107-117、行生成 addEditEstimateMemberRow、スケジュール連動 412-415）

**Interfaces:**
- Consumes: `reviewBadgeHtml`（estimate.js は `./utils.js` から import 追加）

- [x] **Step 1: renderEstimateGrouped**
  - 工程内ソート（865）: `processOrder.indexOf` が同値なら `(a.isReview ? 1 : 0) - (b.isReview ? 1 : 0)` で本作業→レビュー順
  - 工程バッジ表示（952, 958）: `${reviewBadgeHtml(proc.isReview)}` を badge の直後に追加

- [x] **Step 2: renderEstimateMatrix の memberLines（1186）**: `(${member} xh)` の前に `${reviewBadgeHtml(p.isReview)}`。エントリのソートも本作業→レビュー順にする

- [x] **Step 3: showEstimateDetail（1510）**: 担当者リストの各要素に `${reviewBadgeHtml(g.isReview)}`。グループのソートも本作業先頭

- [x] **Step 4: showTaskDetail（1671, 1745 付近の各見積行）**: 担当者名の後ろに `${reviewBadgeHtml(estimate.isReview)}`

- [x] **Step 5: renderEstimateDetailList（1280）**: 工程バッジ直後に `${reviewBadgeHtml(est.isReview)}`

- [x] **Step 6: estimate-edit.js**
  - siblings 展開（113）: `addEditEstimateMemberRow({ member, hours, estimateId, isReview: sib.isReview })` とし、行生成側で isReview のとき行頭に R マーク（`est-review-row` クラス）を表示。更新パスはスプレッド維持のため isReview は保存される（コード変更不要な事を確認）
  - この単工程モーダルの「＋担当者」新規行は常に本作業行（レビュー新規作成は全工程一括モーダルのみ）
  - スケジュール連動（412-415）: `&& !s.isReview === !before.isReview` を追加
  - プライマリがレビュー見積の場合: モーダルの工程表示部に R バッジ（openEditEstimate 内で `#editEstimateModal` のタイトル or 工程表示に追記）

- [x] **Step 7: コミット** `feat(estimate): 見積の一覧・マトリクス・詳細にレビュー行のRバッジを表示`

---

### Task 4: レポート内訳（工程別見積vs実績バーチャート）

**Files:**
- Modify: `js/report.js:1582-1635`（renderProcessBarChart）

- [x] **Step 1: 集計に estimateReview / actualReview を追加**

```js
if (!processSummary[processKey]) {
    processSummary[processKey] = { estimate: 0, actual: 0, estimateReview: 0, actualReview: 0 };
}
processSummary[processKey].estimate += e.hours;
if (e.isReview) processSummary[processKey].estimateReview += e.hours;
// actuals 側も同様に actualReview を加算
```

- [x] **Step 2: バーを本作業＋レビューの2セグメント表示に変更**
  - バー内を flex の2つの div に分割：本作業部分（従来色）＋レビュー部分（同色ベースに `repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)` の縞オーバーレイ）
  - 幅: 本作業 `= (hours - reviewHours) / maxHours`、レビュー `= reviewHours / maxHours`、合計幅は従来と同一
  - reviewHours > 0 のときのみ工程ラベル行に `<span style="font-weight:400; color:#6c757d; font-size: calc(14px * var(--ui-scale));">（うちR: xh）</span>` を見積/実績それぞれ付記

- [x] **Step 3: コミット** `feat(report): 工程別バーチャートにレビュー内訳セグメントを表示`

---

### Task 5: Phase 1 検証（/verify-ui）

- [x] **Step 1: /verify-ui の手順でローカル配信＋seed 投入**（seed にレビュー見積行を含める: 例 PG 10h（森）＋ PG レビュー 2h（佐藤・isReview:true））
- [x] **Step 2: DOM 機械判定**
  - 見積モーダル: `+R` クリック→ `tr.est-review-row` が生成される
  - 保存後: `JSON.parse(localStorage)` 相当の State で isReview: true の見積が存在
  - 一覧・マトリクス: `.badge-review` が期待数表示される
  - レポート: 工程別チャートに「うちR」ラベルが出る
  - 既存集計非破壊: 工程合計（PG 12.0h）が本作業＋レビューの合算になっている
- [x] **Step 3: FAIL があれば修正して再検証（PASS まで）。スクショ取得**

---

### Task 6: Phase 2 実績入力

**Files:**
- Modify: `index.html:1971-1993` 付近（editActual モーダルの工程 form-group）
- Modify: `js/actual.js`（saveActualEdit 1301-1401、モーダル open 時のプリフィル、表示 81/748/816/889）
- Modify: `js/actual-timeline.js`（実績ブロック表示に R 区別）
- Modify: `js/schedule.js:443-448`（calculateProgress の実績マッチング）
- Modify: `js/schedule-render.js:1289-1297`（getScheduleActualHours）

**Interfaces:**
- Produces: 実績レコードに `isReview: true`（レビュー実績のみ）

- [x] **Step 1: index.html の工程 form-group 直後にチェックボックスを追加**

```html
<div class="form-group">
    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
        <input type="checkbox" id="editActualIsReview" style="width: auto; margin: 0;">
        レビュー（工程内レビューの実績として記録）
    </label>
</div>
```

- [x] **Step 2: actual.js saveActualEdit**
  - `const isReview = document.getElementById('editActualIsReview')?.checked || false;`
  - 更新: `isReview: isReview || undefined` ではなく、更新オブジェクトに `isReview` を明示セット（false なら `delete actuals[actualIndex].isReview` 相当のため、スプレッド後に `if (!isReview) delete ...; else ... = true`）
  - 新規: `...(isReview ? { isReview: true } : {})`
- [x] **Step 3: モーダル open（新規/編集）時に checkbox をプリフィル**（編集: `!!actual.isReview`、新規: false にリセット）。actual.js 内の editActual モーダルを開く関数（openEditActualModal / openAddActualModal 相当）を特定して両方に設定
- [x] **Step 4: 実績表示に R バッジ**（actual.js 81, 748, 816, 889 の badge 直後に `${reviewBadgeHtml(a.isReview)}`。import 追加）
- [x] **Step 5: actual-timeline.js の実績ブロックに R 区別**（ブロックのラベル文字列に ` R` を付加＋ CSS クラス。タイムラインからの新規作成は本作業固定）
- [x] **Step 6: 進捗計算の実績マッチングに isReview 一致を追加**
  - schedule.js:443: `&& !a.isReview === !schedule.isReview`
  - schedule-render.js:1290: 同上
  - schedule.js calculateProgress 内の remainingEstimate 参照はレビュー予定では使わない: `const remainingEstimate = schedule.isReview ? null : getRemainingEstimate(...)`（schedule-render.js:1304 も同様）
- [x] **Step 7: /verify-ui で Phase 2 検証**（レビュー実績の登録→R バッジ表示→レポート実績側「うちR」→本作業スケジュール進捗がレビュー実績を含まないこと）
- [x] **Step 8: コミット** `feat(actual): 実績入力にレビューフラグを追加し表示・進捗計算を対応`

---

### Task 7: Phase 3 スケジュール

**Files:**
- Modify: `js/schedule.js`（addSchedule 336-364 / addScheduleSilent 371-393 / generateSchedulesFromEstimates 1324-1450 / 手動フォーム収集）
- Modify: `index.html`（スケジュール追加/編集モーダルにレビューチェック）
- Modify: `js/schedule-render.js`（バー描画 1119-1260、ツールチップ 1517 付近）

**Interfaces:**
- Produces: スケジュールレコードに `isReview: true`

- [x] **Step 1: addSchedule / addScheduleSilent に `...(data.isReview ? { isReview: true } : {})` を追加**
- [x] **Step 2: generateSchedulesFromEstimates**
  - ソート（1344-1361）: 同一タスク・同一工程内で `(a.isReview ? 1 : 0) - (b.isReview ? 1 : 0)` を member 比較の前に挿入（本作業→レビュー順）
  - 既存スケジュール判定（1374-1379）: `&& !s.isReview === !est.isReview` を追加
  - 前工程終了日の決定（1395-1404）: est.isReview の場合はまず**同一工程**の終了日 `taskProcessEndDate.get(\`${est.task}::${est.process}\`)` を prevProcessEnd として使う（本作業が同キーを先に更新済み）。本作業行は従来通り前工程を遡る
  - addScheduleSilent 呼び出し（1421-1430）: `isReview: est.isReview || false` を渡し、note は `見積ID: ${est.id} から自動生成${est.isReview ? '（レビュー）' : ''}`
  - タスク×工程終了日の更新（1442-1445）: レビューも同じ `task::process` キーを更新（レビュー終了が最遅なら次工程がレビュー完了を待つ）
- [x] **Step 3: 手動スケジュールフォーム**: index.html のスケジュール追加/編集モーダルに `scheduleIsReview` チェックボックスを追加し、schedule.js のフォーム収集（778 付近の fields）と保存・編集プリフィルに組み込む
- [x] **Step 4: schedule-render.js のバー描画**
  - ベースバー塗り（1123-1125）の直後: `if (schedule.isReview)` なら clip 内に 45° 縞（`ctx.strokeStyle = 'rgba(255,255,255,0.45)'; lineWidth 3; 8px 間隔の斜線ループ`）を描画
  - バー内テキスト（1200）: `const processText = schedule.isReview ? \`${schedule.process || ''} R\` : (schedule.process || '');`
  - ツールチップ（1517 付近）: 工程表示に `（レビュー）` を付加
- [x] **Step 5: /verify-ui で Phase 3 検証**
  - seed: PG 本作業（森）＋PG レビュー（佐藤）＋PT 本作業（森）を投入し自動生成実行
  - 判定: レビュー予定の startDate > 本作業の endDate、PT の startDate > レビューの endDate、ガント上のレビューバーのラベルに R、既存判定（再生成でレビューが重複生成されない）
- [x] **Step 6: コミット** `feat(schedule): 自動生成・手動追加・ガント表示にレビュー予定を対応`

---

### Task 8: 仕上げ（/deploy・ドキュメント）

- [x] **Step 1: 全 Phase の /verify-ui PASS を確認**
- [x] **Step 2: /deploy を実行し、GitHub Pages デプロイ完了まで確認**
- [x] **Step 3: 設計書のステータス更新（実装済み Phase を追記）＋計画書のチェックボックス更新をコミット**

## Self-Review 済み事項

- スペック全要件との対応: データモデル（Task 1,2）、マージキー（Task 1）、見積入力（Task 2）、一覧表示（Task 3）、レポート内訳（Task 4）、実績（Task 6）、スケジュール（Task 7）、検証・デプロイ（Task 5,6,7,8）
- 型・名前の整合: `isReview`（全レコード共通）、`reviewBadgeHtml`（utils.js）、`est-review-row` / `badge-review`（CSS）、`addEstimateMemberRow(proc, isReview)` — 全タスクで同名を使用
- スケジュール連動検索の isReview ガードは estimate-add.js（Task 2）と estimate-edit.js（Task 3）の2箇所
