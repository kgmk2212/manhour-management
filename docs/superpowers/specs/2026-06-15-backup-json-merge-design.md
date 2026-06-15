# バックアップ JSON 差分マージ機能 — 設計書

| 項目 | 内容 |
|------|------|
| 作成日 | 2026-06-15 |
| ステータス | v1 実装済み（feature/backup-json-merge） |
| ブランチ | `feature/backup-json-merge`（`experiment/ui-scaling` 起点） |
| 関連実装（参照） | `origin/experiment/llm-analysis:js/excel-import.js`（既存 Excel 追加インポート） |
| 関連設計書 | `docs/superpowers/specs/2026-05-23-excel-append-import-design.md`（Excel 版・参照元） |
| フィールド名の正 | `experiment/ui-scaling` の実コード（`git show`/`git grep` で確認済み） |

---

## 1. 背景と目的

### 現状

- `js/storage.js::handleFileImport()` の JSON 分岐は **「全データ上書き」のみ**。`confirm('現在のデータを復元したデータで上書きしますか？')` で聞くだけで、中身（差分）は見えない。
- `experiment/ui-scaling` / `main` には Excel 追加インポートの**実体が存在しない**（`window.handleExcelImport` を呼ぶだけで未定義 → 実質 no-op）。実体と「プレビュー＋競合解決 UI」は `origin/experiment/llm-analysis:js/excel-import.js`（825 行）にある。
- 差分プレビューやマージの経路は一切ない（差分/プレビュー/マージ専用の DOM・CSS・JS は未実装）。

### 目的

バックアップ JSON を読み込むとき、**現在ロード中のデータと突き合わせて差分を一覧表示**し、ユーザーが採用可否を選んで**マージ**できる機能を提供する。実装にあたり、休眠している Excel 追加インポートを**同時に復活**させ、両者で**共通のプレビュー UI・差分エンジン**を共有する。

### 非目標（v1）

- 設定系（`settings` / `scheduleSettings` / `taskColorMap` / `llmAnalysisSettings`）の**フィールド単位差分表示**は行わない（v1 は「取り込む/取り込まない」のトグル一括のみ。差分表示は v2）。
- 取り込み時の値編集（インライン補完）は行わない。
- 既存の「復元（全置換）」経路は**残す**（後方互換）。本機能は別導線。

---

## 2. 確定事項サマリ

| # | 論点 | 決定 |
|---|------|------|
| 1 | 実装ブランチ | `feature/backup-json-merge`（ui-scaling 起点）。main 昇格・レガシー整理は別タスク |
| 2 | Excel との関係 | `excel-import.js` を移植・復活させ、差分エンジン／プレビュー UI を JSON と**共有**（共通モジュール化） |
| 3 | マージ対象 | レコード系すべて（実績・見積・スケジュール・会社休日・休暇・残工数）。設定系・AI 履歴は一括トグル |
| 4 | 差分分類 | added（追加）/ changed（変更）/ unchanged（同一）/ removed（現在のみ） |
| 5 | 衝突（changed）既定 | **取込ファイル優先＝上書き**。行単位で「上書き/維持」を個別変更可 |
| 6 | removed 既定 | **保持**（安全側）。「バックアップに無い現在レコードを削除」一括トグルは既定 OFF |
| 7 | 選択粒度 | 行単位（changed/removed）。added/unchanged は件数＋一括トグル（任意で展開） |
| 8 | 事前バックアップ | 確認モーダルに「マージ前に現在のデータをバックアップ」チェック（既定 ON）→ 確定時 `autoBackup()` |
| 9 | undo | 汎用 `data_merge` アクション。**差分のみ保存方式**で localStorage を圧迫しない |
| 10 | 入口 | 設定タブ「自動バックアップ」セクション直後に新セクション。専用 `mergeFileInput`（accept=.json） |

---

## 3. データモデルと差分判定

### 3.1 差分の 4 分類

各レコード系エンティティについて、**自然キー**（`id` はエクスポート環境依存のため使わない）でインデックス化し、現在(current)と取込(incoming)を突き合わせる。

| 分類 | 定義 | 既定の挙動 |
|------|------|-----------|
| **added** | incoming のみに存在（キー不一致） | 取り込む |
| **changed** | キー一致だが**値フィールド**が相違 | 上書き（取込優先） |
| **unchanged** | キー一致かつ値も一致 | 何もしない（件数のみ） |
| **removed** | current のみに存在（incoming にキー無し） | 保持 |

> **実績（actuals）の特例**: 自然キーに値フィールド（`hours`）まで含めるため、「キー一致＝完全一致＝unchanged」「キー不一致＝added」の 2 値になり **changed は発生しない**（既存 Excel 版の設計を踏襲）。removed は発生しうる。

### 3.2 エンティティ別の自然キーと値フィールド

フィールド名は `experiment/ui-scaling` 実コードで確認済み。

| エンティティ | 種別 | 自然キー | 差分対象の値フィールド | changed |
|---|---|---|---|---|
| **estimates** | 配列 | `(version, task, process, member)` | `hours`, `workMonths` | あり |
| **actuals** | 配列 | `(date, member, version, task, process, hours)` 完全一致 | —（キーに内包） | なし |
| **schedules** | 配列 | `(version, task, process, member, startDate)` | `estimatedHours, endDate, status, note` | あり |
| **companyHolidays** | 配列 | `(startDate, endDate)` | `name` | あり |
| **vacations** | 配列 | `(member, date, vacationType)` | `hours` | あり |
| **remainingEstimates** | 配列 | `(version, task, process)` | `remainingHours, member, note` | あり |
| **taskColorMap** | 単一オブジェクト | エントリキー `"version/task"` | color | 一括トグル |
| **scheduleSettings** | 単一オブジェクト | — | — | 一括トグル |
| **settings** | 単一オブジェクト | — | — | 一括トグル |
| **llmAnalysisSettings** | 単一オブジェクト | — | — | 一括トグル |
| **llmAnalysisHistory** | 配列 | `meta.generated_at` | —（全体が値） | append＋truncate |

各エンティティの全フィールド構成は付録 A 参照。

### 3.3 比較正規化（既知バグの根治）

既存 Excel 版の比較ヘルパー `s(v)`（null/'' 同一視＋trim）と `normalizeDate(v)` を**共有モジュールへ昇格**する。さらに、Excel 版で未解決だった「打ち合わせ実績の重複が再検出されない」バグ（参照設計書 §12.2、原因候補＝浮動小数 `hours`／日付の time 部混入／全角空白）に対し、キー生成内で以下を施す:

```js
const s  = v => v == null ? '' : String(v).normalize('NFKC').trim();   // 全角空白も吸収
const nd = v => normalizeDate(v);                                       // 'YYYY-MM-DD' に正規化（time 部除去）
const nh = v => Math.round(Number(v) * 100) / 100;                      // hours は小数2桁に丸めて比較
```

`keyOf` は必ずこれらを通す。これにより Excel 版の重複バグも同時に解消する。

---

## 4. UI 設計

参照: 既存 Excel 版モーダル（モックアップ案 D＝サマリ＋並列比較＋一括トグル＋行単位選択）。本機能はこれを**エンティティ非依存**に一般化し、Excel/JSON 双方で共有する。

### 4.1 入口（設定タブ）

`index.html` の「自動バックアップ」セクション（現 L1628-1646）直後に新セクションを追加:

```
🔀 バックアップの差分マージ
  バックアップ JSON を読み込み、現在のデータとの差分を確認してマージします。

  [📂 バックアップを読み込んでマージ]   ← mergeFileInput(accept=".json") を発火
```

- 既存サイドバーの「復元」ボタン（全置換）は**そのまま温存**。
- Excel 復活分（参照設計書 §4.1）の「📊 Excel の入出力」セクションも同時に追加し、`handleExcelImport` を共有モジュール経由で開く。

### 4.2 確認モーダル（共有 `#mergePreviewModal`）

```
┌─ 取り込み内容の確認 ──────────────────────[×]┐
│ 取り込み元 <ファイル名>                          │
├───────────────────────────────────────────────┤
│ [全体サマリ]  反映予定 N / 追加 A / 上書き O /   │ ← data-field 駆動でリアルタイム更新
│               維持 K / 削除 D                     │
│                                                   │
│ [エンティティチップ]  実績✔ 見積✔ スケジュール✔ │ ← 各チップにチェックボックス。OFF で除外
│   休日✔ 休暇✔ 残工数✔  ＋設定☐ ＋AI履歴☐         │
│                                                   │
│ ▼ 見積 (＋8 追加 / ~3 変更 / =12 同一)            │ ← アコーディオン（セクション）
│   ⚡一括: [全て上書き|全て維持|個別判断]          │
│   ┌ 変更カード（既存 → 取込, 変更フィールドを強調)│ ← changed のみ行単位
│   │   キー: V1.0 / ログイン / 設計 / 山田         │
│   │   工数 8.0 → 12.0    [上書き|維持]            │
│   └ ...                                           │
│   ＋追加 8 件 [全て追加|全て除外] ▸展開            │ ← added は件数＋一括（任意展開）
│                                                   │
│ ▼ 実績 (＋20 追加 / =105 同一 / −3 現在のみ)      │
│   ＋追加 20 件 [全て追加|全て除外]                │
│   −現在のみ 3 件 [保持|削除] ▸展開                │ ← removed は既定保持
│                                                   │
│ ▼ スケジュール / 休日 / 休暇 / 残工数 …           │
│                                                   │
│ ⚠ 取り込めない/壊れた項目があれば警告表示          │
├───────────────────────────────────────────────┤
│ ☑ マージ前に現在のデータをバックアップ            │ ← 既定 ON
│ この内容で N 件を反映します   [キャンセル][マージ]│
└───────────────────────────────────────────────┘
```

#### 行単位選択の範囲（質問1の回答を具体化）

| 分類 | UI | 既定 |
|---|---|---|
| changed | **行単位**セグメント（上書き/維持）＋セクション一括トグル | 上書き |
| removed | **行単位**セグメント（保持/削除）＋一括トグル（既定展開せず件数表示） | 保持 |
| added | 件数＋一括トグル（全て追加/全て除外）、任意で行展開 | 追加 |
| unchanged | 件数のみ（折りたたみ） | — |

「エンティティ単位」は各セクションの一括トグルとして内包されるため、**行単位コンポーネントを一度作れば両粒度を満たす**（エンティティ単位先行→作り直しの無駄を回避）。一括トグル変更後に 1 行だけ個別変更すると一括トグルが自動で「個別判断」に切り替わる（Excel 版のロジックを流用）。

#### 用語ルール（参照設計書を踏襲）

| 用語 | 用途 |
|------|------|
| 読み込み | ファイルを開く（「インポート」は使わない） |
| 取り込み / 反映 | データをマージ確定する動作 |
| 追加 / 上書き / 維持 / 削除 | added / changed採用 / changed却下・removed保持 / removed削除 |
| 既存 / 取込 | 並列比較カードの左 / 右ラベル |

### 4.3 流用する既存 CSS

`style.css` の既存クラスを流用（新規は最小限）:
`.modal` / `.modal-content`（`max-width` を `min(calc(900px*var(--ui-scale)),92vw)` に上書き）/ `.modal-header`（テーマ追従）/ `.modal-body`（`max-height:82vh`）/ `.modal-footer` / `.modal-close`、ステータス表示に `.badge-success|warning|danger|info`、セクション枠に `.setting-section` / `.setting-section-title`、トグルに `.segment-control` + `.segment-item`、フィルタ行に `.filter-bar`。Excel 版モーダル CSS（`origin/experiment/llm-analysis:style.css:7857-8120`、接頭辞 `.excel-import-`）は**接頭辞を `.merge-` に改名して移植**し、Excel/JSON で共用する。

---

## 5. 内部設計

### 5.1 モジュール分割

```
js/merge-core.js   ← 新規。差分エンジン＋共有プレビュー UI＋確定＋undo の共通基盤（エンティティ非依存）
js/merge-json.js   ← 新規。バックアップ JSON アダプタ（JSON → sections 構築 → openMergePreview）
js/excel-import.js ← 移植＋リファクタ。Excel アダプタ（workbook → sections 構築 → openMergePreview）
```

#### `js/merge-core.js` の公開/内部 API

```js
// 正規化ユーティリティ（共有）
export function s(v)            // null/''同一視 + NFKC + trim
export function normalizeDate(v)
export function el(tag, attrs, children)

// 差分エンジン（汎用）
//   spec = { keyOf(record)->string, valueEq(a,b)->bool|null, emitChanged:bool }
export function detectDiff(incoming, existing, spec)
//   -> { added:[r], changed:[{existing, incoming}], unchanged:[{existing,incoming}], removed:[r] }
//   removed は existing のうち incoming のどのキーにも一致しなかったもの（consume 追跡で 1:1）

// プレビュー UI（汎用）
//   sections = [{ id,label,icon, keyFields:[], compareFields:[{key,label,format}],
//                 diff, allowOverwrite, allowDelete, kind:'records'|'toggle'|'historyAppend' }]
export function openMergePreview(sections, { fileName, sourceLabel })
function buildSectionView(section)        // changed=行カード / added,removed=件数+一括 / toggle=チェック1個
function buildConflictCard(...)           // compareFields[] 駆動（任意フィールド差分に対応）
function buildChoiceGroup(name, value, options)
function computeSummary(sections, decisions)
function refreshSummaryUI()               // data-field 駆動
function attachPreviewHandlers()          // data-section / data-row 属性ベース、Esc 対応
function closeMergePreview()

// 確定 + undo（汎用）
//   各 section に apply = { add(record), overwrite(existing, incoming)->after, remove(record) } を持たせる
function applyMerge(sections, decisions, { preBackup })
function pushMergeAction(changesByEntity)  // type:'data_merge'
function refreshAllViews()                 // storage.js 復元末尾と同じ再描画群
```

#### `js/merge-json.js`（JSON アダプタ）

```js
export async function handleBackupMerge(file) {
  const data = JSON.parse(await file.text());
  // version チェック（'1.x' 想定。未知は警告のみ）
  const sections = [];
  for (const def of ENTITY_DEFS) {            // 付録 B のキー定義表をコード化
    if (def.kind === 'records') {
      const diff = detectDiff(data[def.field] || [], State[def.field], def.spec);
      sections.push({ ...def, diff, apply: makeRecordApplier(def) });
    } else if (def.kind === 'toggle') {        // settings 系
      sections.push({ ...def, present: data[def.field] != null, apply: makeToggleApplier(def) });
    } else if (def.kind === 'historyAppend') { // llmAnalysisHistory
      sections.push({ ...def, incoming: data.llmAnalysisHistory || [], apply: makeHistoryApplier() });
    }
  }
  openMergePreview(sections, { fileName: file.name, sourceLabel: 'バックアップJSON' });
}
```

#### `js/excel-import.js`（Excel アダプタ・復活）

`parseWorkbook` で得た estimateRows/actualRows を `detectDiff` に通し、estimate（changed あり）/ actual（changed なし）の 2 section を構築して `openMergePreview` を呼ぶ薄いアダプタに縮小。列マッピング（`SHEET_ALIASES`/`HEADER_ALIASES` 等）と xlsx 動的 import は Excel 固有として残す。

### 5.2 既存コードへの影響

| ファイル | 変更 |
|---|---|
| `js/storage.js` | `handleFileImport` の Excel 分岐を `import('./excel-import.js').then(m=>m.handleExcelImport(file))` に。JSON 全置換経路は温存 |
| `index.html` | 設定タブに「差分マージ」「Excel の入出力」セクション追加、`mergeFileInput`(accept=.json) 追加、`#mergePreviewModal` の静的シェル追加 |
| `js/events.js` | `mergeFileInput` の change → `handleBackupMerge`、新ボタンの click 結線 |
| `js/modal.js` | `setupModalHandlers()` の `modals` 配列に `mergePreviewModal` を追加（背景クリック閉じ） |
| `js/history.js` | `applyUndo`/`applyRedo` に `data_merge` 分岐を追加（付録 C） |
| `style.css` | Excel 版モーダル CSS を `.merge-` 接頭辞で移植・共用 |

### 5.3 取り込み確定フロー（`applyMerge`）

```
1. 「マージ」クリック → 「マージ前バックアップ」が ON なら autoBackup()（現状を JSON ダウンロード）
2. decisions（section ごと・行ごとの採用結果）を集約
3. エンティティ別に State を更新し、changesByEntity を記録:
   - added 採用    → 新規 id 付与して push（id 生成は付録 D）       … added[]
   - changed 上書き → 既存を id で findIndex → 値フィールドを incoming で置換 … overwritten[{before,after}]
   - changed 維持  → 何もしない
   - removed 削除  → 既存を除去                                        … removed[]
   - removed 保持  → 何もしない
   - toggle 採用   → settings/taskColorMap/scheduleSettings/llmAnalysisSettings を置換（taskColorMap はパレット整合チェック）
   - historyAppend → llmAnalysisHistory に meta.generated_at で重複除外しつつ append → historyMax で truncate
4. setXxx セッターで State 反映 ＋ nextXxxId を再採番（付録 D）
5. pushMergeAction(changesByEntity)   // undo 登録（差分のみ）
6. saveData(true)                     // skipAutoBackup=true（手順1で取得済みのため）
7. closeMergePreview() → refreshAllViews()
8. showAlert(`N 件を取り込みました`, true)
```

### 5.4 undo / redo（汎用 `data_merge`）

**差分のみ保存方式**（全体スナップショットは localStorage 50 件上限を圧迫するため不採用）。ペイロードと逆再生は付録 C。Excel 版の `excel_import`（estimates/actuals 限定・ネスト形）を `data_merge`（全エンティティ・entity 名 dispatch）へ一般化し、Excel もこの経路に統合する。

---

## 6. エッジケース

| ケース | 挙動 |
|--------|------|
| JSON パース失敗 / 非バックアップ JSON | 「バックアップファイルとして読み込めません」エラーで中止 |
| `version` が未知（例 '2.0'） | 警告バナー表示の上、可能な範囲でマージ続行 |
| 全エンティティ差分 0 | サマリ「反映予定 0 件」、マージボタン無効化 |
| 同じバックアップを 2 回マージ | 全件 unchanged（actuals は完全一致 skip / estimates は値一致で unchanged）→ 何も起きない |
| 現在データが空 | 全件 added。実質「復元」と同じ結果になる（全置換ボタンの代替にもなる） |
| taskColorMap に現テーマ外の色 | 既存復元と同じくパレット整合チェック（`storage.js:465-470`）→ 不整合なら取り込まない/リセット |
| removed 全削除トグル ON ＋ 古いバックアップ | 警告:「現在のみのレコード D 件が削除されます」を明示してから確定 |
| 巨大データ（数千行） | `detectDiff` は O(n·m)。プレビューは changed/removed のみ行描画、added/unchanged は件数化で DOM 肥大を回避。仮想スクロールは v1 では入れない |
| 浮動小数 `hours` / 日付 time 部 / 全角空白 | §3.3 の正規化で吸収（Excel 版の既知バグも同時解消） |

---

## 7. アクセシビリティ・キーボード

- モーダルは Esc でキャンセル（`merge-core` 内に独自 keydown ハンドラを持つ。既存 `modal.js` に汎用 Esc は無いため）。
- 一括トグル・行セグメントはキーボード操作可（既存 `.segment-control` パターン）。
- 「マージ」確定後はスピナー＋ボタン無効化。

---

## 8. テスト観点

純粋関数（`detectDiff` / `keyOf` / `valueEq` / `s` / `normalizeDate`）を中心に手動テストケースを用意:

- estimates: added / changed（hours 差・workMonths 差）/ unchanged の仕分け
- actuals: 完全一致 skip、`hours` だけ違えば added、午前/午後 2 件の正常重複が消えないこと
- **打ち合わせ実績（version=''/process=''）の再マージで重複登録されないこと**（既知バグ回帰テスト）
- schedules/holidays/vacations/remaining の各キーで衝突・追加・削除が正しく出ること
- removed: 古いバックアップで「保持（既定）」時に現在データが消えないこと、「削除」時のみ消えること
- 統合（手動）: 出力→同ファイルをマージ→無変更 / `hours` 改変→マージで上書き / undo で完全復帰 / マージ前バックアップ ON でファイルが落ちること
- Excel 回帰: 復活後も従来どおり追加インポートが動くこと（共有モジュール化のリグレッション）

---

## 9. 実装スコープと段階

| Phase | 内容 | 完了判定 |
|---|---|---|
| **0** | `excel-import.js` ＋ CSS ＋モーダル HTML を feature ブランチへ移植し、Excel 追加インポートを**まず復活**（現状動作の確認） | Excel 取込が動く |
| **1** | `merge-core.js` 抽出（汎用 `detectDiff` / フィールド駆動モーダル / 汎用 undo）。`excel-import.js` をアダプタ化 | Excel 回帰 OK |
| **2** | `merge-json.js`（actuals＋estimates）。「差分マージ」入口・`mergeFileInput`・`#mergePreviewModal` 結線 | JSON で実績・見積がマージできる |
| **3** | schedules / companyHolidays / vacations / remainingEstimates を section 追加 | レコード系すべて |
| **4** | settings 系トグル ＋ llmAnalysisHistory append マージ | 設定・履歴対応 |
| **5** | removed 削除トグル＋警告、マージ前バックアップ、エッジケース・仕上げ | 仕様全達成 |

### v2 候補

- 設定系のフィールド単位差分表示、CSV 対応、changed の「フィールド単位」採用、マージプリセット保存、大規模データ向け仮想スクロール。

---

## 10. ファイル一覧

### 新規
- `js/merge-core.js` — 差分エンジン＋共有プレビュー UI＋確定＋undo
- `js/merge-json.js` — バックアップ JSON アダプタ
- `docs/superpowers/specs/2026-06-15-backup-json-merge-design.md` — 本ファイル
- （任意）`mockups/backup-json-merge/` — UI 確認用モックアップ

### 変更
- `js/excel-import.js`（移植＋アダプタ化）、`js/storage.js`、`js/events.js`、`js/modal.js`、`js/history.js`、`index.html`、`style.css`

---

## 11. 付録

### 付録 A: エンティティ別フィールド構成（実コード確認済み）

- **estimates** `{ id, version, task, process, member, hours, workMonth, workMonths }`
- **actuals** `{ id, date, version, task, process, member, hours }`
- **schedules** `{ id:'sch_N', version, task, process, member, startDate, estimatedHours, endDate, status, color, note, createdAt, updatedAt }`
- **companyHolidays** `{ id:number, name, startDate, endDate }`
- **vacations** `{ id:number, member, date, vacationType, hours }`
- **remainingEstimates** `{ id:number, version, task, process, member, remainingHours, updatedAt, note }`（検索キーは version/task/process の 3 つ）
- **taskColorMap** `{ "version/task": color }`
- **scheduleSettings** `{ viewMode, displayRange, hoursPerDay, currentMonth, displayMonths, filterVersion, filterMember, filterStatus }`
- **settings** テーマ・レイアウト・表示設定群（`storage.js` autoBackup 参照）
- **llmAnalysisHistory** `[{ meta:{ generated_at, model, ... }, team_evaluation, outlook, recommended_actions, ... }]`
- **llmAnalysisSettings** `{ endpoint, model, backupIncludeHistory, historyMax }`
- バックアップ top-level: 上記 ＋ `timestamp`, `version:'1.2'`

### 付録 B: `detectDiff` spec（エンティティ定義の核）

```js
const norm = { s, nd: normalizeDate, nh: v => Math.round(Number(v)*100)/100 };
const ENTITY_DEFS = [
  { field:'actuals', label:'実績', icon:'⏱', kind:'records', emitChanged:false,
    keyFields:['date','member','version','task','process'],
    spec:{ keyOf:r=>[norm.nd(r.date),s(r.member),s(r.version),s(r.task),s(r.process),norm.nh(r.hours)].join('|'),
           valueEq:()=>true, emitChanged:false } },
  { field:'estimates', label:'見積', icon:'📋', kind:'records', emitChanged:true,
    keyFields:['version','task','process','member'],
    compareFields:[{key:'hours',label:'工数'},{key:'workMonths',label:'作業月'}],
    spec:{ keyOf:r=>[s(r.version),s(r.task),s(r.process),s(r.member)].join('|'),
           valueEq:(a,b)=> norm.nh(a.hours)===norm.nh(b.hours)
                           && [...(a.workMonths||[a.workMonth].filter(Boolean))].sort().join(',')
                              === [...(b.workMonths||[])].sort().join(','),
           emitChanged:true } },
  { field:'schedules', label:'スケジュール', icon:'📅', kind:'records', emitChanged:true,
    keyFields:['version','task','process','member','startDate'],
    compareFields:[{key:'estimatedHours',label:'工数'},{key:'endDate',label:'終了日'},
                   {key:'status',label:'状態'},{key:'note',label:'メモ'}],
    spec:{ keyOf:r=>[s(r.version),s(r.task),s(r.process),s(r.member),norm.nd(r.startDate)].join('|'),
           valueEq:(a,b)=> norm.nh(a.estimatedHours)===norm.nh(b.estimatedHours)
                           && norm.nd(a.endDate)===norm.nd(b.endDate)
                           && s(a.status)===s(b.status) && s(a.note)===s(b.note),
           emitChanged:true } },
  { field:'companyHolidays', label:'会社休日', icon:'🏖', kind:'records', emitChanged:true,
    keyFields:['startDate','endDate'], compareFields:[{key:'name',label:'名称'}],
    spec:{ keyOf:r=>[norm.nd(r.startDate),norm.nd(r.endDate)].join('|'),
           valueEq:(a,b)=> s(a.name)===s(b.name), emitChanged:true } },
  { field:'vacations', label:'休暇', icon:'🌴', kind:'records', emitChanged:true,
    keyFields:['member','date','vacationType'], compareFields:[{key:'hours',label:'時間'}],
    spec:{ keyOf:r=>[s(r.member),norm.nd(r.date),s(r.vacationType)].join('|'),
           valueEq:(a,b)=> norm.nh(a.hours)===norm.nh(b.hours), emitChanged:true } },
  { field:'remainingEstimates', label:'残工数', icon:'📉', kind:'records', emitChanged:true,
    keyFields:['version','task','process'],
    compareFields:[{key:'remainingHours',label:'残工数'},{key:'member',label:'担当'},{key:'note',label:'メモ'}],
    spec:{ keyOf:r=>[s(r.version),s(r.task),s(r.process)].join('|'),
           valueEq:(a,b)=> norm.nh(a.remainingHours)===norm.nh(b.remainingHours)
                           && s(a.member)===s(b.member) && s(a.note)===s(b.note),
           emitChanged:true } },
  // 単一オブジェクト系（トグル一括）
  { field:'settings', label:'表示設定', icon:'⚙', kind:'toggle' },
  { field:'scheduleSettings', label:'スケジュール設定', icon:'⚙', kind:'toggle' },
  { field:'taskColorMap', label:'タスク色', icon:'🎨', kind:'toggle', paletteCheck:true },
  { field:'llmAnalysisSettings', label:'AI 設定', icon:'🤖', kind:'toggle' },
  { field:'llmAnalysisHistory', label:'AI 分析履歴', icon:'🗂', kind:'historyAppend', dedupKey:'meta.generated_at' },
];
```

### 付録 C: `data_merge` undo ペイロードと逆再生

```js
pushAction({
  type: 'data_merge',
  description: 'バックアップJSONをマージ',   // Excel 経由時は 'Excelを取り込み'
  data: {
    source: 'json',                          // 'json' | 'excel'
    changes: {                               // エンティティ名 → 差分
      estimates: { added:[...], overwritten:[{before,after},...], removed:[...] },
      actuals:   { added:[...], overwritten:[], removed:[...] },
      // …他エンティティ同形
    },
    toggles: { settings:{before,after}, taskColorMap:{before,after}, /* 採用したものだけ */ },
    history: { appendedKeys:[...], truncated:[...] },   // llmAnalysisHistory 復元用
    nextIds: { before:{companyHolidayId,vacationId,scheduleId}, after:{...} }
  }
});

// applyUndo:
//   各 entity: added の id を除去 → overwritten を before に戻す → removed を push し直す
//   toggles: before を localStorage/State に戻す
//   history: appendedKeys を除去 ＋ truncated を復元
//   nextIds: before に戻す → saveData()
// applyRedo: added を push / overwritten を after / removed を除去 / toggles after / history 再append → saveData()
```

### 付録 D: ID 再採番

- `companyHolidays` / `vacations`: `Math.max(...ids)+1` を `setNextCompanyHolidayId` / `setNextVacationId`
- `schedules`: `'sch_N'` の N を抽出して `max+1` を `setNextScheduleId`
- `estimates` / `actuals` / `remainingEstimates`: 専用 nextId は無く `Date.now()+Math.random()` 方式（既存踏襲）。取り込みレコードには**新規 id を必ず付与**し、元バックアップの id は持ち込まない（衝突回避）。

### 付録 E: 既知の注意（参照元から継承）

- 参照設計書 `2026-05-23-excel-append-import-design.md` の **§5.4 undo 形（`importExcel`/フラット）は実装と不一致**。本機能では実装側（ネスト→汎用 `data_merge`）を正とする。
- Excel 版 `detectActualConflicts` の greedy 1-to-1 重複バグ（§12.2）は、本設計 §3.3 の正規化（NFKC・日付正規化・hours 丸め）で根治する方針。

---

## 13. 実装メモ（2026-06-15 v1）

実装ブランチ `feature/backup-json-merge`。コミット: 設計書 → Excel復活 → merge-core → merge-json(レコード) → 設定系トグル → Excel統合 → レビュー修正。

### 実装済み
- レコード系6種（実績・見積・スケジュール・会社休日・休暇・残工数）の差分プレビュー＋マージ（changed は行単位、added は一括、removed は保持/削除の一括）。
- 設定系トグル一括取込: `taskColorMap`（パレット整合ガード付き）/ `scheduleSettings` / `llmAnalysisSettings`。
- `llmAnalysisHistory` は `meta.generated_at` で重複除外して追加マージ→`historyMax` で切詰。
- マージ前 `autoBackup()` チェック（既定ON）、`data_merge` の undo/redo。
- Excel 追加インポートを復活し、同一の `merge-core` プレビュー・差分エンジン・undo を共有（`excel-import.js` はパース＋アダプタに縮小）。

### v1 未対応 / 既知の制限
- **表示設定（`settings`: テーマ/レイアウト/各表示フラグ）の一括適用は未実装**。適用に多数の `setX`＋`applyTheme/applyLayoutSettings` 再現が必要で重いため v2 へ。差分一覧にも出さない。
- `removed`（現在のみレコード）は**一括の保持/削除**のみ。行単位の個別選択は v2。
- `scheduleSettings` の undo は固定スキーマ前提（取込側が未知の新規キーを導入した場合のみ完全復元されない端ケース）。
- Excel パースの「無効行」警告 UI は merge-core 共有化に伴い簡略化（致命的エラーのみ通知）。

### 検証
- 差分エンジン純粋ロジック（`detectDiff`/`s`/`normalizeDate`/`roundNum`）の Node テスト 19 ケース全通過（greedy 1:1、打ち合わせの全角空白/null/日付time部の重複検出＝旧 Excel バグの根治、丸め誤差、日付正規化を含む）。
- 全 JS モジュール `node --check` 構文検証。
- 全 diff の独立レビュー（致命的バグなし。指摘の medium=undo後の再描画、low=デッドコードは修正済み）。
- **未実施**: 実ブラウザでの手動スモーク（差分マージボタン→JSON選択→プレビュー→マージ→Undo の通し操作）は最終確認として推奨。
