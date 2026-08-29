# 実績のまとめ変更（一括編集）設計書

- 作成: 2026-08-29
- 状態: Phase 1 実装済み（feature/actual-bulk-edit、2026-08-29）
- モックアップ: `mockups/actual-bulk-edit/`（`index.html` / `README.md`）
- 対象ブランチ: `experiment/ui-scaling`（実装は `/start-work actual-bulk-edit` で feature worktree に隔離）

---

## 1. 背景と目的

実績レコード（`{id, date, version, task, process, member, hours, isReview?, createdAt}`）を変更する経路は、
現状 1 件ずつの編集モーダル（`js/actual.js` `editActual`/`saveActualEdit`）とタイムラインのバー移動しかない。
「誤った版数で 1 週間分登録した」「その他工数で入れた実績を後から版数・工程に紐付ける」「担当者名の表記ゆれを直す」
「週ズレを直す」といった作業が、件数分の繰り返し操作になっている。

本機能は **複数の実績を選び、変えたい項目だけをまとめて変更し、1 回の Undo で全件戻せる** 仕組みを追加する。

## 2. 決定事項

モックアップ 3 案（選択して一括編集／条件で置き換え／表で直接編集）を同じデータ・同じ課題で比較し、
**案1「選んで一括編集」を採用**。案2 は「対象の集め方」として案1 に吸収し、案3 は見送り。

構造は **対象の集め方 × 3、適用エンジン × 1**:

| 対象の集め方 | 入口 | 備考 |
|---|---|---|
| 手で ✓ | リストビューの選択モード | 表示中の全選択、Shift+クリック範囲選択 |
| 条件で選択 | 選択バーの「条件で選択…」 | 案2 の吸収。置き換える内容は持たない |
| タイムラインのバー | ガント表示のバー → 詳細パネルのメニュー／Ctrl・Shift+クリック／右クリック | 連続日は既に 1 本のバーに結合済み |

| 適用 | 内容 |
|---|---|
| 一括編集モーダル | 各項目「変更しない／変更する」、適用前プレビュー必須 |
| 別日に複製／一括削除 | 選択バーから直接 |
| Undo | `actual_bulk_edit` 1 件として記録し、1 回で全件復元 |

### 決定済みの判断（2026-08-29、ユーザー確認済み）

| 論点 | 決定 | 理由 |
|---|---|---|
| 「条件で選択」の UI | 選択バー上のポップオーバー＋「選択に追加」「この条件だけを選択」の 2 ボタン | 対象が常に ✓ として見え、手選択と混ぜられる。モックの案1 と同じ |
| 一括削除の確認 | 確認ダイアログあり（件数を明示）＋削除後もトーストで「元に戻す」 | 既存の 1 件削除が `confirm` なので流儀を揃える |
| 「同じ対応をすべて選択」の一致キー | 版数＋対応名（工程は含めない） | ガントのバー結合キー（`mergeAdjacentActuals`）と一致。版数付け替えの用途に合う |
| 「別日に複製」 | Phase 1 に含める | 日付 1 つのミニモーダルとエンジン関数 1 つで済む |

## 3. スコープ

### Phase 1（本設計書の実装範囲）
- リストビューの選択モードと選択バー
- 一括編集モーダル: 版数／対応名／工程／担当／レビュー／日付（指定日・日数シフト）
- 一括削除、別日に複製
- 条件で選択 ポップオーバー
- タイムライン（ガント）からの選択（詳細パネルのメニュー、Ctrl/Shift+クリック、右クリック）
- `actual_bulk_edit` の Undo/Redo
- ユニットテスト（純粋ロジック）と Playwright e2e

### Phase 2（別タスク）
- 工数の一括変更: 一律値／倍率／「合計を X h に按分」
- 日付シフトの「営業日でずらす」オプション（土日祝スキップ）
- カレンダー（matrix）ビューのセルからの選択

### 対象外
- 見積・予定・見込残存の一括変更（見積側には既に「全工程一括編集」がある）
- 個別修正向けの表直接編集（案3）

## 4. UI 設計

### 4.1 リストビューの選択モード

- 実績タブのツールバー右端に **「選択モード」トグルボタン**（`estimate-selection.js` の作業月選択モードと同型）。
- ON で一覧テーブルの先頭に ✓ 列、ヘッダーに「表示中を全選択」✓。行の「編集」「削除」ボタン列は非表示。
- 行のどこをクリックしても選択トグル（ボタン列が無いので誤操作なし）。Shift+クリックで直前クリック行との範囲選択。
- 選択行は `tr.is-selected`（背景 `--accent-light`）。
- モード OFF で選択をクリア。実績タブを離れた時もクリア（他タブへ持ち越さない）。

### 4.2 選択バー（下部トレイ）

- 選択モード中、またはタイムライン表示中に、実績タブ下部に **sticky の黒いトレイ**（`--text-primary` 背景・白文字）。
  Quiet Depth の淡い面の上で「一時的な作業レイヤー」と分かるよう、意図的に唯一の濃色面にする。
- 内容: 「N 件選択中 · 合計 X h」＋ `条件で選択…` `一括編集` `別日に複製` `削除` `選択解除`。
  N=0 のとき編集系ボタンは disabled、文言は「0 件選択中 · 行（バー）をクリックして選択」。
- 一括操作の適用後はトーストに「N 件を更新しました」＋「元に戻す」リンク（`history.undo()` を呼ぶ）。

### 4.3 条件で選択 ポップオーバー

- トレイの上に開く。項目: 期間（from/to）、担当、版数（「（なし）= その他工数」を含む）、対応名、工程。
- 条件を変えるたびに **該当件数・合計 h** を表示し、一覧の該当行（タイムラインでは該当バー）を `is-hit` でハイライト。
- 操作は 2 つ: **「選択に追加」**（現在の選択と和集合）／**「この条件だけを選択」**（置き換え）。
- 一覧の表示フィルタ（担当・月）で隠れている該当があれば「表示外 N 件を含む」と注記する。
  条件は表示フィルタと独立に全実績に対して評価する。
- 置き換える内容は持たない。適用は常に 4.4 のモーダル経由（案2 の「対象が条件式の裏に隠れる」弱点を解消し、
  結果は必ず ✓ として見える）。

### 4.4 一括編集モーダル

新規モーダル `#bulkActualEditModal`（既存 `#editActualModal` とは別）。タイトル「選択した N 件を一括編集」。

各項目は「**変更しない／変更する**」のセグメントを持ち、「変更する」で入力欄が現れる。
項目名の下に **現在値の内訳**（例「現在: V2.3 ×5」「PG ×2、PT ×2、IT ×1」、4 種以上は先頭 3 種＋「他 N 種」）を出す。

| 項目 | 入力 | 備考 |
|---|---|---|
| 版数 | select（見積の版数一覧 ＋「（なし）= その他工数」） | 変更すると対応名候補を連動更新 |
| 対応名 | select（版数に応じた候補）＋自由入力 | `updateEditActualTaskList` と同じ候補生成を流用 |
| 工程 | select（`PROCESS.TYPES` ＋「（なし）」） | 版数ありで工程なしは不許可（下記） |
| 担当 | select（既存担当者） | |
| レビュー | 変更しない／付ける／外す | `isReview` の付与・削除 |
| 日付 | 変更しない／指定日に／日数をずらす（±N 日） | Phase 1 は暦日。営業日は Phase 2 |

**プレビュー**（必須）: モーダル下部に「対象 N 件 · 変わる M 件」と、変わる先頭 3 件の
「項目 旧値 → 新値」、4 件目以降は「他 K 件も同じ規則で変わります」。M=0 のときは適用ボタンを disabled。

**バリデーション**（`saveActualEdit` と同じ規則を N 件に適用）:
- 版数が空でない実績は工程が必須 → 違反件数を「⚠ N 件で版数があるのに工程が空です」と表示し適用を disabled
- 日付は有効な `YYYY-MM-DD`
- 対応名は空不可

適用ボタン「N 件に適用」→ 6 章のエンジンで after を計算 → `pushAction('actual_bulk_edit')` → 保存 → 再描画 → モーダルを閉じ、選択をクリア（選択モードは維持）。

### 4.5 別日に複製／一括削除

- **別日に複製**: 日付入力 1 つのミニモーダル。選択 N 件を `id` 新規・`date` 指定日・`createdAt` 現在時刻で追加（元は残す）。
- **一括削除**: 既存の 1 件削除（`deleteActual` :934 / `deleteActualFromModal` :965 は `confirm`）と同じ流儀で
  **確認ダイアログあり**。件数を明示する（「5 件を削除しますか？」）。削除後もトーストの「元に戻す」で復元できる。

### 4.6 タイムライン（ガント）からの選択

2026-08-29 の `js/actual-timeline.js` 調査結果に基づく（詳細は `mockups/actual-bulk-edit/README.md`）。

- ガントは `mergeAdjacentActuals`（:2981）で **同じ担当・版数・対応名の暦日連続を 1 本のバー**に結合し、
  `.actual-tl-bar.actual.merged` が `data-actual-ids`（カンマ区切り）を持つ。「一続きの複数作業」= このバー 1 本。
  結合キーに工程は含まれない（PG→PT→IT と変わっても 1 本）。土日を挟むと別バー。
- **バークリック**は既存どおり詳細パネル（複数 id は `showGroupDetailPanel` :2066）。ここに操作を追加する:
  - 「このバーの N 件を選択」（既に全選択なら「選択を外す」）
  - 「同じ対応をすべて選択（本人）」「同じ対応をすべて選択（全員）」— `version|task`（＋member）一致の全実績
  - 「この N 件を一括編集…」— 選択を置き換えて 4.4 を直接開く
- **Ctrl/Shift+クリック**でバーを即トグル（詳細パネルを開かない）。`onActualBarClick`（:1870）に修飾キー分岐を追加。
- **右クリック（contextmenu）** で詳細パネルと同じ操作をメニュー表示。`contextmenu`・`dblclick` は js/ 全体で未使用。
- 選択中のバーは `.actual-tl-bar.selected`（濃色アウトライン＋✓）。既存の `.selected` は右ペインのタスクカード専用なので衝突しない。
- **使わないジェスチャ**: 長押し（タッチのバー移動が 400ms で占有）、バー上の横ドラッグ（月送りスワイプ `setupTimelineSwipe` と衝突）、
  空エリアの矩形ドラッグ（作成に使用中）。
- 選択状態はリストと共有（`selectedActualIds`）。表示形式を切り替えても選択は維持。
- 既知の関連不具合: 複数 id バーのドラッグ移動が `ids[0]` 1 件しか動かない（:2163-2166）。本機能の適用エンジンで
  「日付シフト」を全 id に適用できるため、`finalizeBarDrop` をエンジン経由に置き換える改修候補として BACKLOG に記録する（本スコープ外）。

### 4.7 モバイル

- 行タップで選択、トレイは画面下部 sticky（ボタンは折り返し）。
- 条件ポップオーバー・一括編集モーダルは 1 カラムに落ちる（`bk-cols`/`bk-cond` は `minmax(0, 1fr)`）。
- タイムラインではバータップ → 詳細パネル → メニュー項目、で選択（修飾キー・右クリックは PC 向け）。

## 5. 状態管理（`js/state.js`）

```js
export let actualSelectionMode = false;              // リストの選択モード
export const selectedActualIds = new Set();          // 選択中の実績 id（リスト／タイムライン共有）
export function setActualSelectionMode(v) { actualSelectionMode = v; window.actualSelectionMode = v; }
```
`selectedEstimateIds`/`workMonthSelectionMode`（:251-252, :425）と同じ流儀。条件ポップオーバーの条件値は
モジュールローカル（永続化しない）。

## 6. 適用エンジン（新規 `js/actual-bulk-core.js`、DOM 非依存）

`merge-core.js`（純粋）＋ `merge-json.js`（UI）の分割に倣い、ロジックを DOM から切り離して `node --test` で検証する。

### 6.1 パッチ

```js
/** @typedef {{
 *   version?: { set: string },              // '' はその他工数
 *   task?:    { set: string },
 *   process?: { set: string },
 *   member?:  { set: string },
 *   isReview?: 'on' | 'off',
 *   date?: { mode: 'set', value: 'YYYY-MM-DD' } | { mode: 'shift', days: number },
 * }} BulkPatch */
```
キーが無い項目は「変更しない」。

### 6.2 API

```js
applyBulkPatch(actuals, ids, patch) → {
  after: Actual[],          // 全件（対象外は同一参照、対象は新オブジェクト）
  changed: { before: Actual, after: Actual, fields: string[] }[],
  invalid: { id: number, reason: 'process-required' | 'invalid-date' | 'task-required' }[],
}
duplicateActuals(actuals, ids, date, nextId, now) → { after, added: Actual[] }
deleteActuals(actuals, ids) → { after, deleted: Actual[] }
summarizeField(actuals, field) → [{ value: string, count: number }]   // 「現在:」内訳
findByCondition(actuals, cond) → Actual[]                             // 条件で選択
sameTaskIds(actuals, seed, { sameMember }) → number[]                 // 「同じ対応をすべて選択」
shiftDate(dateStr, days) → dateStr                                    // 暦日。Date 往復は UTC/ローカル混在を避け文字列分解で
```

- `changed` は実際に値が変わった件のみ（版数 V2.3 → V2.3 は変化なし扱い）。プレビューと `pushAction` の description に使う。
- `invalid` が 1 件でもあれば UI は適用を disabled にする（部分適用はしない）。
- 版数変更時に対応名を変更しない場合、旧対応名を保持する（本番の自由入力と同じ扱い。候補外でも可）。

## 7. Undo/Redo（`js/history.js`）

新しいアクション型 **`actual_bulk_edit`** を追加する。

```js
pushAction({
  type: 'actual_bulk_edit',
  description: `実績一括編集: ${fields} × ${n}件`,   // 削除は「実績一括削除: N件」、複製は「実績一括複製: N件 → 8/24」
  data: {
    beforeActuals: Actual[],    // 変更前スナップショット（変更対象のみ）
    afterActuals:  Actual[],    // 変更後
    deletedActuals: Actual[],   // 一括削除時
    addedActualIds: number[],   // 複製時
  }
});
```

- `applyUndo`/`applyRedo` の分岐に `actual_bulk_edit` を追加し、既存 `restoreBulkEdit(data, direction)`（:412）を拡張:
  - `deletedActuals`: undo で `State.actuals` に push back、redo で除外
  - `addedActualIds`: undo で除外、redo で `afterActuals` から復元
  - 既存の `estimate_bulk_edit` は新キーを持たないため後方互換
- `refreshUI` は `t.startsWith('actual')`（:578）で `updateAllDisplays` が走るため追加不要。
  履歴モーダルのアイコンは `type.includes('bulk_edit')`（:741）で編集アイコンになる。
- 一括系の `data` は最大 50 件の履歴に載るため、1 回の一括で数百件を扱っても localStorage を圧迫しないよう
  `MAX_HISTORY` はそのまま、`before/after` は対象件のみ持つ（全件スナップショットにしない）。

## 8. 他データとの関係

| データ | 扱い | 根拠 |
|---|---|---|
| `remainingEstimates` | **触らない**。一括編集モーダルに見込残存欄は置かない | キーは (version, task, process)。`cleanupOrphanedRemainingEstimates`（`js/estimate.js:268`）は **見積**の存在だけで孤立判定するため、実績の付け替えで残存が消えることはない |
| `schedules` | 触らない | 予定は見積側の全工程一括編集が連動対象 |
| `estimates` | 触らない。対応名候補の供給元としてのみ参照 | |
| 担当者一覧・月一覧 | 適用後に `updateMemberOptions`/`updateActualMonthOptions`/`updateMonthOptions` を呼ぶ | `saveActualEdit` と同じ後処理 |

## 9. データフロー（適用時）

```
選択（Set<id>）
  → BulkPatch を UI から組み立て
  → applyBulkPatch(State.actuals, ids, patch)          // 純粋
  → invalid.length > 0 なら中断（UI は事前に disabled）
  → State.setActuals(after)
  → pushAction({ type: 'actual_bulk_edit', ... })
  → window.saveData()
  → window.updateAllDisplays()（リスト・タイムライン・今日の実績・レポート）
  → 選択クリア、トースト「N 件を更新しました  元に戻す」
```

## 10. ファイル構成と変更箇所

| 区分 | ファイル | 変更 |
|---|---|---|
| 新規 | `js/actual-bulk-core.js` | 6 章の純粋ロジック |
| 新規 | `js/actual-bulk.js` | 選択モード・選択バー・条件ポップオーバー・一括編集モーダル・複製・削除の UI |
| 変更 | `js/state.js` | `actualSelectionMode` / `selectedActualIds` / setter |
| 変更 | `js/actual.js` | `renderActualListView`（:702）に ✓ 列・行クリック・`is-hit`；選択モード時はボタン列を出さない |
| 変更 | `js/actual-timeline.js` | `showGroupDetailPanel`（:2066）と `showBarDetailPanel`（:1992）に操作ボタン、`onActualBarClick`（:1870）に修飾キー分岐、`contextmenu` ハンドラ、バーの `.selected` 反映 |
| 変更 | `js/history.js` | `actual_bulk_edit` 分岐、`restoreBulkEdit` の削除・追加対応 |
| 変更 | `js/events.js` | ボタンのイベント登録（`initEventHandlers` :106 の流儀） |
| 変更 | `js/init.js` | `window.*` 公開（onclick 文字列から呼ぶ関数） |
| 変更 | `js/modal.js` | `setupModalHandlers`（:456）の一覧に `bulkActualEditModal`・`bulkActualCopyModal` |
| 変更 | `js/ui.js` | タブ切替時に選択クリア（`showTab` 付近） |
| 変更 | `index.html` | 選択モードボタン、選択バー、条件ポップオーバー、2 モーダル |
| 変更 | `style.css` | モックの `bk-*` / `tl-*`（`.actual-tl-bar.selected`）を移植 |
| 変更 | `docs/BACKLOG.md` | 複数 id バーの移動が 1 件しか動かない件を記録 |
| 変更 | `mockups/actual-bulk-edit/README.md` | 本設計書へのリンク（相互リンク） |

`docs/CODEMAP.md` は hook が再生成する（手で編集しない）。

## 11. エラー処理

- バリデーション違反は適用前に UI で防ぐ（disabled ＋理由表示）。エンジン側も `invalid` を返し、UI が無視しても部分適用しない。
- 適用中の例外は `try/catch` で捕捉し `showAlert('一括編集に失敗しました', false)`。`State.actuals` は `after` を代入する前に例外が出る構成にする（純粋関数で after を確定 → 代入 → pushAction → save の順）。
- Undo 失敗時は既存の `undo()` が「元に戻せませんでした」を出す（:67-70）。
- 選択に存在しない id（他セッションの差分マージで消えた等）はエンジンが無視し、件数表示は実在件数で出す。

## 12. テスト

### ユニット（`tests/actual-bulk-core.test.js`、`node --test`）
- パッチ適用: 各項目の単独変更、複合変更、「変更しない」で不変、`changed` が実変化件のみ
- 版数 '' → 工程 '' を許容、版数あり＋工程 '' は `invalid`
- 日付: 指定日、±N 日（月末・年末跨ぎ、負数）、UTC/ローカルの差でズレない
- 複製: 新 id・新 createdAt・元は不変。削除: `deleted` と `after` が排反
- `findByCondition`: 各条件の単独・組合せ、版数「（なし）」、期間境界
- `sameTaskIds`: 本人／全員
- `summarizeField`: 件数と順序（多い順）

### ユニット（`tests/history.test.js` に追加）
- `actual_bulk_edit` の undo/redo 往復（編集・削除・複製の 3 パターン）。既存のポリフィル方式（:18-31）に従う

### e2e（`tests/e2e/actual-bulk-edit.spec.js`、Playwright、`seed.mjs` 方式）
- リスト: 選択モード ON → 5 行 ✓ → 一括編集 → 版数・対応名変更 → 保存 → `manhour_actuals` の 5 件だけが変わり他は不変 → Undo で復元
- 条件で選択: 担当・版数・対応名の 3 条件で該当 5 件 → 選択に追加 → トレイの件数
- タイムライン: ガントのバー（`data-actual-ids` 5 件）→ 詳細パネル「この 5 件を一括編集…」→ 適用 → バーが変更後の対応名になる
- Ctrl+クリックでトグル、右クリックでメニュー、Escape で閉じる
- モバイル viewport（390px）で行タップ選択とトレイ表示
- バリデーション: その他工数に版数だけ付けようとすると適用が disabled

### 実動作検証
- `/verify-ui` で上記 e2e を PASS させてから完了報告（CLAUDE.md 開発フロー）。

## 13. 段階と受け入れ基準

**Phase 1 完了の定義**
1. モックアップの「共通の課題」（田中の V2.3『帳票A出力改修』5 件 → V2.4『帳票A出力改修（追補）』、打ち合わせ 1 件は不変）を、
   リスト／条件／タイムラインの 3 経路それぞれで **10 操作以内**に達成できる
2. いずれの経路でも Undo 1 回で 16 件が完全に元に戻る（`manhour_actuals` の深い等価）
3. 12 章のユニット・e2e がすべて PASS、`node scripts/codemap.mjs --check` が緑
4. 既存の実績編集モーダル・タイムラインのバー移動・作成・右ペイン D&D の挙動が変わらない（smoke e2e）

## 14. 未決事項

- Phase 2 の工数按分の丸め規則（0.25h 単位か）— Phase 2 着手時に決める

（2026-08-29 に確定した判断は 2 章「決定済みの判断」を参照）

## 15. 参照

- モックアップと比較記録: `mockups/actual-bulk-edit/README.md`
- 既存の前見本: `js/estimate-selection.js`（選択モード）、`js/report.js:761-`（見込残存の一括編集）、
  `js/estimate-add.js:492-524`（版数・対応名リネームの実績連動と `estimate_bulk_edit`）、`js/merge-core.js`（純粋ロジック分離）
- タイムライン調査（2026-08-29）: `mergeAdjacentActuals` :2981、`showGroupDetailPanel` :2066、`onActualBarClick` :1870、
  `onBarMouseDown` :2150、`onBarTouchStart` :2187（長押し 400ms）、`setupTimelineSwipe` :2732
