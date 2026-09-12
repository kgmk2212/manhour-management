# 見積の「工程ごとの作業月」設定 UI 刷新（方式切替式）設計書

- 日付: 2026-09-12
- BACKLOG: **B-047**（関連: B-046 スマホで月ラベル不可視、B-041① 按分の未丸め保存、B-022 全工程編集の不具合群、B-021 一括割り当て）
- モックアップ: `mockups/estimate-work-months/`（比較ハブ `index.html`、README に計測と推奨）
- 方針決定: 2026-09-12 ユーザー承認 —「すべての案を比べたい」→ **現状 select＋案A・B・C の 4 方式を設定で切り替え可能に実装し、実使用で比較して負けた方式を削除する**（工数入力 5 方式トライアル `js/hours-input.js` と同じ運用）。既定は案A。

## 1. 背景と目的

見積登録／「全工程を編集」モーダル（`index.html` `#addEstimateModal`、`js/estimate-add.js`）では、全体期間を選んだうえで
工程ごとに 開始 select 〜 終了 select で作業月を決める。単一月にしたい工程でも 2 つ触る、月は開くまで見えない、
2ヶ月期間では単一 select になって跨げない、スマホ 390px では select が狭くて月が読めない（B-046）、均等按分が未丸めで保存される（B-041①）。

目的:

1. 単一月の移動を 1 操作に、複数月の指定を「見て分かる」形にする。
2. 1 工程に複数担当者（＋レビュー行）× 複数月の全組み合わせで成立させる。
3. 4 方式（現状 / 月チップ / ミニガント / 工程×月マトリクス）を設定で切り替え、実使用で比較できるようにする。負け方式は 1 ファイル削除で消せる構造にする。
4. 保存データ形式（`workMonth` / `workMonths` / `monthlyHours`）は変えない。B-041① は同時に解消する。

## 2. 要件

| # | 要件 | 受入条件 |
|---|------|----------|
| R1 | 単一月の移動が 1 操作 | 案A: 月チップ 1 タップ／案B: バー 1 ドラッグで `workMonths` が 1 月分だけ移る |
| R2 | 複数月の指定が視覚的 | 期間内の月が行の上に常時見える。連続月が 1 本のピル／バーに見える |
| R3 | 全組み合わせ | 主行・追加担当者行・レビュー行のそれぞれが独立した月を持てる。既定は工程行に連動 |
| R4 | スマホ 390px タッチ | 決定（登録／保存）ボタンまで指で到達でき、`elementFromPoint` でボタンが最前面。タッチ目標 44px 以上 |
| R5 | 方式切替 | 設定「見積の作業月 UI」で `legacy` / `chips` / `gantt` / `matrix` を切替。再読み込み不要でモーダルを次に開いた時から反映 |
| R6 | データ形式不変 | 保存される見積は `{ workMonth, workMonths: ['YYYY-MM', …], monthlyHours: { 'YYYY-MM': h } }`。`normalizeEstimate` が正規化できる |
| R7 | 按分の丸め | 均等按分は既存 `splitHoursEvenly` を使い、合計が `hours` と一致する（B-041① 解消） |
| R8 | 削除しやすさ | 方式固有コードは `js/estimate-work-months-<mode>.js` と `style.css` の 1 ブロックに閉じ、共通側に分岐を漏らさない |
| R9 | 2ヶ月期間でも跨げる | 期間が 2 ヶ月のとき、行を 2 ヶ月にできる（現状の単一 select 制約を撤廃） |
| R10 | 既存フローの温存 | `legacy` を選ぶと現状の select UI と保存経路がそのまま動く（B-041① の丸めだけ直す） |

## 3. 全体アーキテクチャ

```
index.html  #addEstimateModal（既存の <table id="addEstimateTable"> を保つ）
   │  行 = <tr data-process data-primary> / <tr class="est-extra-member-row">
   │  列 = 工程 | 担当 | 時間 | [作業月スロット td] | +／×
   ▼
js/estimate-add.js（既存）──┬─ legacy: 現状の select 生成・読み取り（変更は splitHoursEvenly 化のみ）
                            └─ 新方式: WorkMonths.* を呼ぶ（生成／プリフィル／読み取り／行追加時）
   ▼
js/estimate-work-months.js（共通コントローラ・DOM あり）
   ・設定から方式を決める（getMode / isActive）
   ・行状態を tr の dataset に持つ（data-wm-months / data-wm-linked / data-wm-manual）
   ・連動（extra 行 → 工程主行の月）、期間変更時のクランプ、スマホ判定
   ・スロット td を用意し、登録済みレンダラに描かせる
   ・保存用ペイロード（workMonths / monthlyHours）を返す
   ▼
js/estimate-work-months-core.js（純関数・DOM なし・node --test 対象）
   ・monthRange / clampMonths / effectiveMonths / buildPayload(splitHoursEvenly 注入) / serialize・parse
   ▼
js/estimate-work-months-chips.js ／ -gantt.js ／ -matrix.js（各方式のレンダラ。同じインターフェース）
```

### 3.1 レンダラ インターフェース（3 方式で共通）

```js
/** @typedef {Object} WorkMonthView
 *  @property {string[]} months     期間内の月（'YYYY-MM' 昇順）
 *  @property {string[]} selected   この行の有効な月（連動中は主行の月）
 *  @property {boolean}  linked     連動中か（extra 行のみ true になり得る）
 *  @property {boolean}  extra      追加担当者行・レビュー行か
 *  @property {number}   hours      行の合計時間（時間 input の値。空なら 0）
 *  @property {Object}   monthly    月別工数 { 'YYYY-MM': h }（manual があればそれ、無ければ均等）
 *  @property {boolean}  manual     手動配分を持つか
 *  @property {boolean}  isMobile   幅 768px 以下か
 *  @property {string}   label      'PG 田中' のような読み上げ用ラベル
 */
/** @typedef {Object} WorkMonthActions
 *  @property {(months: string[]) => void} setMonths      月を確定（manual は破棄され均等按分に戻る）
 *  @property {(monthly: Object) => void}  setManual      月別工数を確定（値 > 0 の月が selected になる）
 *  @property {() => void}                 toggleLink     連動 ⇄ 個別（extra 行のみ）
 */
export const renderer = {
    id: 'chips',                       // 設定値と一致
    label: '月チップ',                 // 設定画面の表示名
    /** 行スロット td に描く。呼ばれるたびに中身を作り直してよい */
    render(slotEl, view, actions) {},
    /** 見出しスロット th に描く（省略可。省略時は「作業月」） */
    renderHeader(slotEl, view) {},
};
```

- レンダラは **DOM の差し替えを pointerup／touchend の中で行わない**（`setTimeout(fn, 0)` で遅らせる）。
  モックアップ検証で、pointerup の中で DOM を差し替えると Chromium のタッチ操作で次のタップの `click` が合成されないことを実測した。
- レンダラは自分のスロット内だけを触る。行の他セル・他行・保存経路には触らない。
- コントローラは `actions` の呼び出し後に「当該行と、その工程に連動する行」のスロットだけ再描画し、
  `.modal-content` の `scrollTop` を保持する。

### 3.2 行状態（tr の dataset）

| 属性 | 値 | 意味 |
|------|----|------|
| `data-wm-months` | `2026-08,2026-09` | この行自身の月（連動中の extra 行では無視され、主行の月が有効） |
| `data-wm-linked` | `1` / 無し | 連動中（extra 行のみ。`+`／`+R` で作られた行は `1` で始まる） |
| `data-wm-manual` | JSON `{"2026-08":20,"2026-09":40}` / 無し | 手動配分。月が変わると削除される |
| `data-wm-opened` | `2026-08,2026-09` | モーダルを開いた時点の月（手動配分を保持してよいか判定に使う） |

保存時に `readRow(tr, hours)` が返すもの:

```js
{ workMonth: months[0], workMonths: months, monthlyHours }
// monthlyHours = manual があり、かつ months が data-wm-opened と一致 → manual をそのまま
//                それ以外 → splitHoursEvenly(hours, months.length) を月順に割り当て
```

### 3.3 連動（担当者行・レビュー行）

- extra 行の既定は連動。連動中はスロットが「工程主行の月の写し」（淡い塗り・破線枠）で触れない。鎖ボタン（`.wm-link`）で個別化。
- 個別化した瞬間、主行の月を `data-wm-months` にコピーして起点にする。もう一度押すと連動に戻る（自分の月と manual を捨てる）。
- 主行の月が変わると、連動中の extra 行は自動で追従する（データは主行しか持たないので追加処理なし。描き直しのみ）。
- 既存見積をプリフィルするとき（全工程編集）: extra 行の月が主行と一致していれば連動、違えば個別化して開く。

### 3.4 期間（作業期間 select）

- 既存の `#addEstStartMonthMulti` 〜 `#addEstEndMonth` をそのまま月軸にする。新方式では「単一月／複数月」ラジオを隠し、値は常に `multi` に固定して期間 select を常に表示（開始 = 終了 なら月は 1 つ）。
  既存の保存経路（`saveEditAllProcesses` / `addNormalEstimate`）が multi 分岐を通るようにするための固定であり、`legacy` ではラジオを含め現状どおり。
- 期間が変わったら全行を再描画。期間外になった月は `clampMonths` で最寄りの端へ寄せ、月が全て外れた行は端の 1 月にする。寄せた行はスロット下に 1 行の注記を出す（例: 「12月 は期間外のため 11月 に寄せました」）。
- 期間 select の既定値・既存見積からの逆算は現状の `openEditAllProcesses` に従う（変更なし）。

### 3.5 モバイル（幅 768px 以下）

- 新方式が有効なモーダルでは、`#addEstimateTable` に `wm-active` を付け、幅 768px 以下で `<table>` の行を CSS グリッド化して 2 段にする（DOM は増やさない）:
  1 段目 = 工程・担当・時間・＋／×、2 段目 = 作業月スロット（全幅）。`thead` は隠す。
  既存の `table tr td:first-child { position: sticky }`（`style.css:1138-1150`）と `@media` の `.estimate-table` 列幅％指定（`style.css:4972-5012`）は
  `.estimate-table.wm-active` 側で `position: static` / `width: auto` に戻す。`constrainProcessTableOnMobile()` のピクセル直指定は新方式では実行しない（§8）。
- タッチ目標: チップ・バー・つまみ・鎖ボタンとも高さ 44px 以上。スロットは `touch-action: pan-y`（縦スクロールを残し、横なぞりは UI が取る）。
- 決定ボタン（登録／保存・キャンセル）の行は `.modal-content` 内で `position: sticky; bottom: 0` にし、本文だけがスクロールする。
  下部タブ Dock は `.modal` の背面（z-index 150 < 10000）なので重ならない。`100vh` は使わず、必要なら `100dvh`。
- e2e で iPhone 相当（390×664、hasTouch）を使い、決定ボタンの中心で `document.elementFromPoint` がボタン自身であることを機械判定する。

## 4. 各方式の仕様

### 4.0 `legacy`（現状）

- 現状の select 生成・読み取りをそのまま使う。変更は `computeRowWorkMonths` の `hours / months.length` を `splitHoursEvenly` に置き換える 1 点のみ（B-041①）。
- 設定画面の表示名は「現状（開始〜終了の select）」。比較の基準として一世代残し、決着後に削除候補。

### 4.1 `chips` 月チップのレール（案A・推奨・既定）

- スロットに期間内の月を `<button class="wm-chip" aria-pressed>` で並べる（`role="group"`、`aria-label="PG 田中 の作業月"`）。
- **タップ = その月だけ**。**なぞる（pointerdown → pointermove → pointerup）= 起点から現在の月までの範囲**。
  Shift+クリック／Shift+←→ = 既存範囲を伸ばす。Space／Enter = フォーカス中の月だけ。←→ = フォーカス移動。
- 連続して選ばれた月は 1 本のピルに見える（角丸を範囲の両端だけに付ける）。連動中は淡い写し。
- 期間が 7 ヶ月を超えるとき: スロットを横スクロール可能にし、選択範囲が見えるよう自動スクロールする（段階 2。段階 1 では最小幅を保って横スクロールのみ）。

### 4.2 `gantt` ミニガントのバー（案B）

- スロットに月のマス目（`.wg-cell`、空きの月は薄い月ラベル）と 1 本のバー（`.wg-bar`、`tabindex=0`、両端に `.wg-handle`）。
- バー本体ドラッグ = 移動（長さ維持、端でクランプ）。つまみドラッグ = 開始／終了の伸縮。空きの月をタップ = そこまで広がる。
  ←→ = 移動、Shift+←→ = 右端の伸縮。単一月のバーはラベルを詰める（`.is-single`）。
- 連動中はバーが淡い写しでつまみ非表示。

### 4.3 `matrix` 工程×月マトリクス（案C）

- 見出しスロット `th` に月ラベル（`8月 / 2026`）を並べ、行スロット `td` に同じ列幅で `<input type="number" class="wx-cell">` を月数ぶん並べる（表の列は増やさず、スロット内グリッドで揃える）。
- 値 > 0 の月が作業月。セルを空にするとその月が外れる。全セル空は拒否して直前の値に戻し、注記を出す。
- 時間 input（合計）を変えると、選択中の月へ均等配分に戻す。セルを変えると手動配分（`data-wm-manual`）になり、合計 input を書き換える。
  配分が不均等な行には「均等にする」ボタン。
- 連動中は写しの数字（触れない）だけ表示し、合計だけ入力できる。
- スマホではスロットが横スクロールし、`inputmode="decimal"`。

## 5. 設定

- 設定画面の入力セクション（工数入力方式 `#hoursInputMethodSelect` の隣）に select「見積の作業月 UI」を追加。
  選択肢: `chips` 月チップ（推奨・既定）／`gantt` ミニガント／`matrix` 工程×月マトリクス／`legacy` 現状（開始〜終了の select）。
  説明文: 「実使用で比較中。決着後に残す方式だけにします。」
- 保存キーは `localStorage['manhour_estimateWorkMonthUi']`（工数入力方式 `manhour_hoursInputMethod` と同じ独立キー方式。§8）。未設定・不正値は `chips`。
- モーダルは開くたびに設定を読む（リロード不要）。開いている最中に設定を変えても、そのモーダルは閉じるまで元の方式のまま。

## 6. 保存経路とデータ整合

- 見積登録（`addEstimateFromModalNormal`）・全工程編集（`saveEditAllProcesses`）は、新方式が有効なら各行の月を `WorkMonths.readRow(tr, hours)` から取り、`legacy` なら現状どおり select から取る。
  それ以外のフィールド（担当・時間・isReview・版数・対応名）と Undo（`pushAction`）は現状のまま。
- 手動配分の保持規則: `matrix` で保存した `monthlyHours` は、他方式で開いて月を変えずに保存しても保持される（§3.2）。月を変えた行は均等按分に戻る。
  `chips` / `gantt` は手動配分を持つ行のメタ文言に「手動配分」と示す。
- `workMonth` は常に `workMonths[0]`（`normalizeEstimate` と B-021 の教訓に合わせ、3 フィールドを同時に更新する）。

## 7. エラー処理・境界

- 行の月が 0 個になる操作は拒否（案C の全セル空、期間クランプで全滅 → 端の 1 月）。
- 時間が空・0 の行は現状のバリデーションに従う（月 UI は関与しない）。
- 期間 select で 開始 > 終了 にされたら現状の相互クランプに従う。
- `pointercancel`（ブラウザがスクロールに取った）では途中の塗りを捨てて確定前の状態に戻す。
- 設定値が不正・レンダラ未登録なら `chips` にフォールバックし、console.warn を 1 回出す。

## 8. 結合点（`js/estimate-add.js` ほか。行番号は 2026-09-12 `86ecda4` 時点）

方針: **月 UI の生成・プリフィル・読み取り・行追加の入口は既に 6 関数に閉じている**ので、それぞれの先頭に
`if (WorkMonths.isActive()) { …委譲…; return; }` を 1〜2 行足すだけにし、legacy の本体は触らない。

| 既存関数（`js/estimate-add.js`） | 現状の役割 | 新方式が有効なときの委譲先 |
|---|---|---|
| `updateAddEstimateTableHeader(show)` `:968-1061` | `th[data-work-month-col]` と主行の `td[data-work-month-col]` に select を生成。末尾で `refreshAllExtraRowMonthCells()` と `setTimeout(0)` の `updateDefaultAddProcessMonths` | `WorkMonths.setupTable(table, { start, end, show })` — 同じ位置に同じ `data-work-month-col` 付きの th/td を作りスロットにする。既定値は同期的に `applyDefaults(Estimate.calculateDefaultWorkMonths(start, end))` |
| `updateDefaultAddProcessMonths(start, end)` `:1064-1097` | 工程 select に既定値 | `WorkMonths.applyDefaults(defaults)`（`data-wm-months` 未設定の主行だけに入れる。プリフィル済みの行は上書きしない） |
| `ensureExtraRowMonthCell(row)` `:1151-1195` | extra 行の月セルを生成／再構築 | `WorkMonths.onRowAdded(row)`（連動 `1` で開始し、スロットを描く） |
| `prefillRowWorkMonths(rowEl, workMonths)` `:1267-1280` | select に既存見積の月を入れる | `WorkMonths.setRowMonths(rowEl, workMonths, monthlyHours)`（`data-wm-opened` も記録。extra 行は主行と一致なら連動、違えば個別） |
| `computeRowWorkMonths(rowEl, hours, isSingle, gStart, gEnd)` `:1290-1322` | select から `{workMonth, workMonths, monthlyHours}`（`hours / months.length` 未丸め `:1294`） | `WorkMonths.readRow(rowEl, hours)`。**legacy 側も `Utils.splitHoursEvenly(hours, months)` に置換**（B-041①） |
| `handleRowMonthChange(ev)` `:1231-1250` | select の追従 | 対象 select が無いので自然に無反応（変更不要） |
| `constrainProcessTableOnMobile()` `:617-652` | スマホで列幅をピクセル直指定 | 新方式が有効なら早期 return（CSS グリッドと競合させない） |

呼び出し側の事実:

- `computeRowWorkMonths` の呼び出しは `saveEditAllProcesses` の `:410` `:463` と `addEstimateFromModalNormal` の `:1617` の 3 箇所だけ。戻り値の形は同じなので保存経路の他の部分は無変更。
- `openEditAllProcesses` `:134-329` は月が 2 種類以上のときだけラジオを `multi` にし（`:218-249`）、1 種類なら `#addEstStartMonth` だけ設定する（`:250-254`）。プリフィルは `setTimeout(50)` 内（`:298-322`）。
  → 新方式では **ラジオを常に `multi` に固定**する。`openAddEstimateModal()` `:23-41` の末尾と `openEditAllProcesses` の月設定直後（`:254` の後）で `WorkMonths.ensureMultiMode()` を呼び、
  ラジオが single なら `#addEstStartMonthMulti = #addEstEndMonth = #addEstStartMonth` にしてから `switchAddEstMonthType()` を呼ぶ。これで `saveEditAllProcesses` `:353-361` と `addNormalEstimate` `:1534-1582` は既存の multi 分岐をそのまま通る。
- extra 行は `addEstimateMemberRow(proc, isReview)` `:1353-1388` が作る: `tr.est-extra-member-row`（レビューは `.est-review-row` と `data-review="true"`）、`data-process`、
  `select.est-extra-member`（option は主行 `#addEst{proc}_member` の innerHTML コピー）、`input.est-extra-hours`、`td.est-add-member-cell > button.est-remove-member-btn`。末尾で `ensureExtraRowMonthCell(newRow)`。
  主行は `tr[data-process][data-primary="true"]`、担当 `#addEst{proc}_member`、時間 `#addEst{proc}`。
- 単一月／複数月ラジオは `index.html:2483-2509`（`input[name=addEstMonthType]` と `#addEstMonthInputs` 内の `#addEstSingleMonthInput` / `#addEstMultiMonthInput`）。新方式ではラジオの行を `hidden` にし、`#addEstMultiMonthInput` を表示。
- 決定ボタン行は `index.html:2594-2598` の素の `div`。`class="add-est-footer"` を付けてモバイルで sticky にする。
- **クイック入力の見積フォーム（`js/quick.js` `updateQuickEstimateTableHeader:551` ほか）は別実装のコピー**で、担当者行・レビュー行も無い。本件の範囲外（§11）。
- `isMobile` は各所で `window.innerWidth <= 768` を直接評価している。コントローラも同じ式を使う（共通ヘルパは作らない）。

設定（工数入力方式 `js/hours-input.js` と同じ独立キー方式）:

- `localStorage['manhour_estimateWorkMonthUi']`、値 `chips | gantt | matrix | legacy`、既定 `chips`。`getWorkMonthUiMode()` / `setWorkMonthUiMode(key)` / `initWorkMonthUiSetting()` を `js/estimate-work-months.js` に置く。
- 設定画面: `index.html:1924-1932` の `.setting-row`（`#hoursInputMethodSelect`）の直後に同形の行を追加、`<select id="estimateWorkMonthUiSelect">`。option はレンダラ登録から生成する（削除手順 §10 で登録を消せば option も消える）。
- `js/init.js`: `:16-31` に named import、`:614` の `initHoursInputSetting()` の隣で `initWorkMonthUiSetting()`。window 公開は不要（estimate-add.js から import で使う）。
- `manhour_settings` JSON（バックアップ）には載せない（工数入力方式と同じ扱い）。

ファイル構成:

| ファイル | 責務 |
|---|---|
| `js/estimate-work-months-core.js`（新規） | 純関数: `monthRange` は `Utils.generateMonthRange` を使わず自前（DOM・State 非依存で node --test 可）、`clampMonths`、`effectiveMonths`、`buildPayload`、`parseMonths` / `serializeMonths`、`MODES` |
| `js/estimate-work-months.js`（新規） | 設定の読み書き、レンダラ登録、`isActive` / `ensureMultiMode` / `setupTable` / `applyDefaults` / `onRowAdded` / `setRowMonths` / `readRow` / `refresh`、行状態（dataset）、連動、期間クランプ、モバイル判定と `wm-active` クラス付与 |
| `js/estimate-work-months-chips.js` / `-gantt.js` / `-matrix.js`（新規） | レンダラ（§3.1 インターフェース）。モックアップ `mockups/estimate-work-months/{a,b,c}-*.html` からの移植 |
| `js/estimate-add.js`（変更） | 上表の 7 箇所に委譲分岐、`splitHoursEvenly` 化、`ensureMultiMode` 呼び出し |
| `index.html`（変更） | 設定行の追加、決定ボタン行に `class="add-est-footer"` |
| `style.css`（変更） | `/* wm: common */`、`/* wm: chips */`、`/* wm: gantt */`、`/* wm: matrix */` の 4 ブロック（モックアップ `common.css` と各 HTML の `<style>` を移植。`mk-*` は移植しない） |
| `js/init.js`（変更） | import と `initWorkMonthUiSetting()` |
| `tests/estimate-work-months-core.test.js`（新規）、`tests/e2e/estimate-work-months.spec.js`（新規）、`tests/e2e/estimate-month-follow.spec.js`（変更: `manhour_estimateWorkMonthUi: 'legacy'` を seed に追加） | §9 |

## 9. テスト

- 単体（`node --test`、`tests/estimate-work-months-core.test.js`。`tests/utils-month-hours.test.js` と同じく `globalThis.window = globalThis` のガード後に動的 import）:
  `clampMonths`、`effectiveMonths`、`buildPayload`（均等＝`splitHoursEvenly` 注入・手動保持・月変更で手動破棄・`workMonth === workMonths[0]`）、`serializeMonths/parseMonths`、`resolveMode`（不正値 → `chips`）。
- e2e（`tests/e2e/estimate-work-months.spec.js`。既存 `estimate-month-follow.spec.js` と同じ `VARIANTS = [PC, mobile-390(hasTouch)]` × `test.describe` 方式、seed は `page.addInitScript` で
  `manhour_estimates` と `manhour_estimateWorkMonthUi` を投入）: `chips` / `gantt` / `matrix` それぞれで
  「PG を 8〜10月／PG レビューは 10月だけ／IT を 11月へ／他は不変」を `window.openEditAllProcesses` から実行して保存し、`localStorage['manhour_estimates']` の `workMonths` / `monthlyHours` を検証。
  タッチ操作は CDP `Input.dispatchTouchEvent` のなぞり／`page.touchscreen.tap`。モバイルでは `#addEstSubmitBtn` 中心の `elementFromPoint` がボタン自身であることと、チップ・バーの高さ 44px 以上を判定。
  見積登録（新規）の経路も `chips` で 1 本（`openAddEstimateModal` → 入力 → 登録 → `estimate_add` の保存内容）。
- 既存 `tests/e2e/estimate-month-follow.spec.js` は legacy の回帰テストとして残し、seed に `manhour_estimateWorkMonthUi: 'legacy'` を足す（既定が `chips` に変わるため）。
- 手動確認（/verify-ui）: 設定で 4 方式を切り替え、登録／全工程編集の両モーダルで見え方を撮影。

## 10. 段階分けと削除手順

段階:

1. `core` ＋ 共通コントローラ ＋ `chips` ＋ 設定切替（`legacy` は現状のまま） ＋ モバイル 2 段・固定フッター ＋ `splitHoursEvenly` 化 ＋ e2e（legacy / chips）
2. `gantt` ＋ e2e
3. `matrix` ＋ 手動配分の保持規則 ＋ e2e
4. 実使用比較 → 負け方式の削除

負け方式 `<mode>` の削除手順（各 1 箇所）:

1. `js/estimate-work-months-<mode>.js` を削除
2. `js/init.js` の import／登録 1 行を削除
3. `style.css` の `/* wm: <mode> */` ブロックを削除
4. 設定 select の `<option value="<mode>">` を削除（保存済みの値は §7 のフォールバックで `chips` になる）
5. `tests/e2e/estimate-work-months.spec.js` の該当 `describe` を削除
6. `legacy` を削除するときはさらに `estimate-add.js` の select 生成・読み取り関数を削除し、コントローラの `isActive()` 分岐を外す

## 11. 範囲外

- B-022 の不具合群（①ラジオ復帰、②リネーム追随、③Undo の追加 ID、④担当 '-'、⑤×で見積が消えない、⑥モード持ち越し）は本件で直さない（①は新方式でラジオを隠すため影響が減るが、legacy では残る）。
- 作業月一括割り当てモード（`js/estimate-selection.js`、B-021）。
- クイック入力タブの見積フォーム（`js/quick.js` の `updateQuickEstimateTableHeader` ほか。`estimate-add.js` のコピー実装で担当者行・レビュー行が無い）。決着後に採用方式を載せるかを別途判断する。
- 単一見積編集モーダル（`js/estimate-edit.js`）の月 UI。将来、同じレンダラを載せる余地はある。
- 非連続月（8月と10月だけ）の表現。データ形式上は可能だが 3 方式とも連続範囲のみ（`matrix` は結果的に非連続になり得るが、それを推奨しない）。
