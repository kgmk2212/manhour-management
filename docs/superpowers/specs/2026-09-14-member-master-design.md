# 担当者マスタ機能 設計書

- 日付: 2026-09-14
- 対象ブランチ: `experiment/ui-scaling`（統合先。実装は `feature/member-master` 隔離worktreeで行う）

## 背景・課題

現状のシステムには「担当者マスタ」という概念が存在しない。全ての担当者選択欄
（見積登録・クイック入力・実績編集・スケジュール・その他作業など）は `<select>` で、
選択肢は既存の見積(`estimates`)・実績(`actuals`)データに実際に登場した名前の
集合から動的に生成される（`js/ui.js` の `updateMemberOptions()`）。

設定画面の「担当者表示順」欄（カンマ区切りテキスト）も、既存メンバーとの一致分だけを
並べ替えるだけで、そこに書いた名前が自動的に選択肢になるわけではない
（`js/utils.js` `sortMembers()`）。

決定的な症状: `js/other-work.js:44` で、担当者が1人もいない状態で「その他工数」を
開くと「担当者が登録されていません。先に見積または実績を登録してください」と表示される。
新しく入った担当者を使い始めるには、まず何かしら見積か実績を1件でっち上げて登録する
という迂回策が必要で、**担当者だけを単独で「追加」する手段がどこにも存在しない**。

## ゴール

見積・実績データが0件の状態でも、担当者を単独で登録でき、登録した瞬間から
全ての入力画面の担当者selectに反映される。

## 非ゴール

- 各入力画面（見積登録・クイック入力等）のselect末尾への「+ 新規担当者を追加」の
  インライン導線は入れない（設定画面のマスタ管理に一元化する）
- 担当者ごとの色・標準工数・キャパシティ設定などの追加属性は今回のスコープ外
  （既存のパステルカラーはインデックスベースの割当のまま、標準工数は営業日数×8h
  の全体計算のまま変更しない）

## データモデル

`js/state.js` に追加:

```js
export let members = [];        // [{id, name, archived}] 配列順 = 表示順
export let nextMemberId = 1;
```

- 配列の並び順がそのまま表示順（ドラッグ&ドロップで並べ替え。既存の見積タスク一覧・
  スケジュール未割当リストで使われている `⠿` ドラッグハンドルと同じ操作感を流用する）
- `archived: true` で「削除」＝非表示化。実データ（見積・実績・スケジュール・休暇）は
  そのまま残る
- 既存の「担当者表示順」カンマ区切りテキスト欄（`index.html` の `#memberOrder`）は
  このマスタ管理UIに完全に置き換えて撤去する（二重の真実源を避けるため）。
  `js/utils.js` の `sortMembers(members, orderString)` は本機能導入後は
  マスタ配列の順序をそのまま使う形に置き換わり、呼び出し元から `orderString` を
  渡す必要がなくなる（`#memberOrder` 要素・関連読み込みコードごと削除）

## 永続化

- `js/constants.js` の `STORAGE_KEYS` に `MEMBERS: 'manhour_members'` を追加
- `js/storage.js` の保存/読込/エクスポート/インポート箇所（`companyHolidays` が
  出てくる各所: L77, L108, L153-162, L406, L498-508, L545-548, L716 に相当する
  全ロケーション）に `members` を追加

## Undo/Redo

`js/history.js` に以下のアクションタイプを追加（`holiday_add`/`holiday_delete` と
同じ構造で、`pushAction`/`undoAction`/`redoAction` の対応表に組み込む）:

- `member_add` — 追加の取り消し/やり直し
- `member_rename` — 改名の取り消し/やり直し（対象データへの遡及置換も一括で戻す）
- `member_archive` — アーカイブの取り消し/やり直し
- `member_restore` — 復元の取り消し/やり直し

## マージ対応

`js/merge-core.js` の再同期対象関数リストおよび `js/merge-json.js` に、
`companyHolidays` と同様の形で `members` を登録する（`idMember` カウンタ、
`kind: 'records'`、`allowOverwrite: true`、`apply: makeApplier('members', ['name'], idMember)`）。
パイプラインPRやworktree統合時のマージが壊れないようにするため。

## 改名の遡及

改名時は `estimates`・`actuals`・`schedules`・`vacations` の該当 `member` フィールドを
旧名→新名に一括置換する。実行前に対象件数を数え、0件でなければ
「◯件のデータの担当者名を"新名"に置き換えます」と確認ダイアログを出してから実行する
（0件なら確認なしで即改名）。

## 初回移行

`manhour_members` のlocalStorageキーが**一度も存在しない**場合のみ、
`estimates`・`actuals` に登場する担当者名を、旧 `#memberOrder` テキストが
残っていればその順を優先し、残りはアルファベット順で、自動的にマスタへ
取り込む（`archived: false` で作成）。一度でも `manhour_members` が保存されていれば
（空配列であっても）再移行はしない — ユーザーが意図的に全員アーカイブ/削除した
状態と区別できないため。

## 新規データ取り込み時のマスタ自動追加

Excelインポート（`js/excel-import.js`）や外部JSON取り込み（`js/merge-json.js`）で、
マスタに存在しない担当者名を持つ見積・実績行が確定登録された場合、その名前を
自動的に `archived: false` としてマスタ末尾へ追加する（`getActiveMemberNames()` に
反映され、以降のクイック入力等で選択可能になる）。これを行わないと「マスタ経由でしか
新規担当者を使い始められない」という本機能の前提が、インポート経路では
再び崩れてしまうため必須の挙動とする。

両インポート経路は最終的に共通の `js/merge-core.js` の `applyMerge()` を通って
State に反映されるため、追加共通処理 `js/members.js` の
`ensureMembersExist(names: string[])` は `applyMerge()` 側の1箇所（確定後、
`entities.estimates`/`entities.actuals` の `added`/`overwritten後` から
担当者名を集めて呼び出す）に実装すれば両経路をまとめてカバーできる。
初回移行処理からも同じ関数を呼び出す。

## UI（設定画面）

`index.html` の「担当者表示順」欄があるセクション（設定 > 一覧とレポート）を、
以下のマスタ管理UIに置き換える。「会社休日」欄（設定 > バックアップ セクション内）と
同じ構造・トーンで揃える。実装時は `frontend-design` スキルで既存設定画面のトーンに
合わせて仕上げる。

```
担当者
─────────────────────────
[名前を入力____________] [追加]

⠿  山田            [改名] [アーカイブ]
⠿  佐藤            [改名] [アーカイブ]
⠿  田中            [改名] [アーカイブ]
─────────────────────────
▸ アーカイブ済み (2)          [折りたたみ、デフォルト閉]
    鈴木（旧担当者）  [復元]
    高橋（旧担当者）  [復元]
```

- **追加**: 名前入力 + 「追加」ボタン。空文字・重複名（アクティブ・アーカイブ問わず
  大小区別なくトリム後で比較）はその場でエラー表示し追加しない
- **並べ替え**: 行の `⠿` をドラッグして並び替え。ドロップ時に `members` 配列を
  並べ替えて即保存
- **改名**: ボタン押下でその行がインライン入力に切り替わる。確定時、対象データ件数が
  0件でなければ確認ダイアログ（上記）を出す
- **アーカイブ**: 確認なしで即実行（Undo/Redoおよび「復元」ボタンで戻せるため、
  会社休日の `confirm()` より軽くする）
- アーカイブ済み一覧はデフォルト折りたたみ。「復元」で元の並び位置ではなく
  アクティブ一覧の末尾に追加する

## 選択肢生成ヘルパー（`js/members.js` 新設）

```js
export function getActiveMemberNames()
// マスタのうちarchived=falseのみ、マスタ配列順。新規データ入力用select向け

export function getAllMemberNames()
// マスタの全員（archived含む）に加え、万一マスタに存在しないのに
// estimates/actuals/schedules/vacationsに登場する名前があれば安全網として合流する
// （直接JSON編集やマージ由来のズレ対策）。フィルタ・レポート・集計表示用
```

## 書き換え対象（既存の「見積・実績からSetを作る」ロジックを置換）

計画時の精査で、当初案に含めていた `js/schedule.js`（`updateScheduleMemberOptions()`は
特定タスク・工程に紐づく既存見積の担当者だけを出す設計、`scheduleFilterMember`は
`schedules`配列から直接導出され既にマスタと無関係に履歴を保持できる）と
`js/modal.js`（内訳モーダル・残存時間モーダルはいずれも特定タスク・工程の
既存見積/実績から導出する表示専用で、新規担当者の入り口ではない）は、
マスタ導入の目的（担当者を単独で新規登録できるようにする）と無関係であり
**変更不要**と判断した。同様に `js/report-analytics.js` の `getAllMembers()` は
既存データを集計するだけの内部関数で、マスタの有無に関わらず正しく動作するため
**変更不要**。

行の使い分けは「新規にデータを作る入力」か「既存データの編集・絞り込み・表示」かで判断する。
前者はアクティブなマスタのみ（`getActiveMemberNames()`）、後者はアーカイブ済みも含めて
履歴を失わない（`getAllMemberNames()`）。

| ファイル | 箇所 | 用途 | 使うヘルパー |
|---|---|---|---|
| `js/ui.js` | `updateMemberOptions()` 内、`est{P}_member`/`quickEst{P}_member`/`addEst{P}_member`（見積新規登録行）、`quickMember`（クイック入力の担当者選択）、`otherWorkMember`（その他作業新規登録）、`quickVacationMember`（休暇新規登録） | 新規データ入力 | `getActiveMemberNames()` |
| `js/ui.js` | `updateMemberOptions()` 内、`editActualMember`（実績編集select）、`editEstimateMember`（見積編集select） | 既存データの編集 | `getAllMemberNames()` |
| `js/quick.js` | `updateQuickMemberSelect()` | クイック入力の担当者選択（フィルタ兼・新規実績の担当者上書け） | `getActiveMemberNames()` |
| `js/estimate-add.js` | `getAllMembers()`（`__all__`一括登録時）／`initOtherWorkMemberSelect()` | その他工数の新規登録・一括登録対象 | `getActiveMemberNames()` |
| `js/estimate-edit.js` | 編集モーダルの担当者select・追加担当者行（`allMembers`集計） | 既存タスクの担当者変更・追加割当 | `getAllMemberNames()`（既存タスク編集コンテキストのため） |
| `js/actual.js` | `updateMemberSelectOptions()`（`actualMemberSelect`/`actualMemberSelect2`：実績一覧の担当者フィルタ） | フィルタ | `getAllMemberNames()` |
| `js/actual.js` | カレンダー表示の担当者行構築（L469付近） | 表示 | `getAllMemberNames()` |
| `js/actual.js` | 実績編集モーダルの`editActualMember`再構築（L1142付近） | 既存データの編集 | `getAllMemberNames()` |
| `js/actual.js` | `populateOtherWorkMembers()`（L1306付近） | 既存その他作業の編集 | `getAllMemberNames()` |
| `js/other-work.js` | 全担当者取得・0人時エラーメッセージ | その他作業一括登録 | `getActiveMemberNames()`。メッセージを「担当者管理から先に登録してください」に更新（設定画面への導線を明示） |
| `js/merge-core.js` | `applyMerge()` の確定処理（`entities.estimates`/`entities.actuals` 確定後） | Excelインポート・バックアップJSONマージ両方で取り込んだ担当者名をマスタに反映 | `ensureMembersExist(names)`。両方の取り込み経路（`excel-import.js`・`merge-json.js`）が共通で通る唯一の確定処理箇所のため、ここ1箇所に実装を集約する（各アダプタ側の変更は不要） |

## テスト方針

- 特性テスト（`node --test`、`tests/`）: `js/members.js` の追加/改名（遡及含む）/
  アーカイブ/復元/初回移行ロジックを単体でカバー
- Playwright e2e（`tests/e2e/`）:
  - 見積・実績が0件の状態で設定画面から担当者を新規追加 → クイック入力の担当者
    selectに即座に出現することを検証（本機能のゴールを直接検証するシナリオ）
  - 改名するとクイック入力等のselect表示が新名になり、既存の見積・実績データの
    担当者名も遡及して置き換わることを検証
  - アーカイブすると新規入力用selectからは消えるが、実績フィルタ・レポートには
    引き続き表示されることを検証
  - 初回移行: 既存データ（見積・実績のみ、マスタ未保存）を持つ状態で読み込むと、
    自動的にマスタが生成されることを検証

## 影響範囲外（変更しないもの）

- 担当者の色分け（`js/modal.js` のインデックスベースのパステルカラー）
- 標準工数・キャパシティ判定ロジック（`js/constants.js` の `INSIGHT.CAPACITY_*`
  は全体の営業日数ベース計算のままで、担当者ごとの個別設定は導入しない）
- Excelインポート（`js/excel-import.js`）の担当者列マッピング自体は変更しない
