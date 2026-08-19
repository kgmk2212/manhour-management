# 改善バックログ

> 細かい改善・バグ・大物案件を一元管理する台帳。
> 運用: セッション冒頭で P1 から拾う。完了した項目は削除する（履歴は Git に残る）。
> 大物は着手時に brainstorming → 設計書（docs/superpowers/specs/ または docs/ 直下）に昇格させる。
> 出典: 2026-08-19 のコード監査（Explore 3系統: 入力系UI／日付・数値処理／タイムライン）。
> [確認済] = 該当コードを直接読んで裏取り済み。[報告] = 探索エージェント報告で高確度だが実機未確認。

## P1（バグ・実害あり）

1. **予定バーから実績登録が完全に動かない** [確認済]
   描画は `data-schedule-ids`（複数形、`js/actual-timeline.js:316,736,741`）、クリック側は `dataset.scheduleId`（単数形、`:1877`）を読むため必ず undefined → 即 return。属性名を揃え、併せて分割セグメントに全 ids が付く問題（`:2931,2941`）も整理する。
2. **見積編集で追加担当者行の工数を 0/空にすると既存レコードが黙って削除される** [確認済]
   `collectEditExtraMembers`（`js/estimate-edit.js:752`）が `hours > 0` の行しか収集せず、未収集の兄弟 id は削除扱い（`:462-469`）。Undo 履歴には残るが無警告。0h 行は「変更なし」扱いにするか削除確認を出す。
3. **「今日」の日付が UTC 基準（JST 朝9時前に前日になる）** [パターン確認済・箇所は報告]
   `new Date().toISOString().split('T')[0]` 系が19箇所。保存値に影響: `js/quick.js:215`（クイック実績の保存日）、`js/other-work.js:27,100,341`。表示・判定に影響: `js/actual.js:57`、`js/actual-timeline.js:112,202,554,680,1900,2602`、`js/schedule.js:243,510,797,1490,1923,2237`。
   対応: `js/utils.js` にローカル基準の `getTodayString()` を新設（既存 `getCurrentMonthString`/`getNextDateString` と同流儀）して一括置換。日付⇄Date 往復の UTC/ローカル混在（`js/actual-timeline.js:177,393,2647,2919,2984,3032`、`js/schedule-render.js:1362-1368`）も同時に統一。
4. **ガントの複数日ドラッグが「先頭日1件に 日数×8h」で登録される** [確認済]
   `js/actual-timeline.js:1361-1373`（タッチ側 `:1496` も同型）。5日ドラッグで1日に40h。日ごとに分割登録するか、1日単位に制限する。
5. **休暇の時間数入力が壊れている** [報告]
   時間休で 0.5h が入力不可（`index.html:407,2121` が `step="1" min="1"`）、検証は `0<h≤8` でメッセージ「1～8の範囲」と不一致（`js/vacation.js:132-140,248-256`）、登録後に種別を保持したまま時間だけ 8h に戻す（`:162`、時間休の既定1hと矛盾）。0.25 刻みに統一し、リセットを種別と整合させる。
6. **月別按分が未丸めで保存され、プレビュー表示と乖離する** [報告]
   `js/quick.js:690,705`・`js/estimate-edit.js:253-255`・`js/estimate-split.js:208-210`・`js/excel-import.js:269` が `hours/months.length` を未丸め保存（例 3.3333333333333335）。`js/estimate-edit.js:618`/`js/estimate-split.js:123` は未丸め値を input value に直挿し。丸めヘルパー（`utils.formatHours`/`merge-core.roundNum`）に統一する。

## P2（使いにくさ・不整合）

- **クイック入力の工数欄が文脈無視**: 保存後に常に 8h リセット（`js/quick.js:247`）、初期値も固定 8h（`index.html:245`）、工数入力ウィジェット（`js/hours-input.js`）未適用。残り工数デフォルト＋ウィジェット適用で実績モーダルと統一する
- 死に分岐: `window.setQuickInputPreviousActual` は参照のみで未定義（`js/quick.js:302-303`）[確認済]。実装するか削除
- 見積登録のフィードバック: 0件でも「登録しました」成功トースト（`js/estimate-add.js:1554-1599`、`js/quick.js:728-762` 同型）、担当者未選択で工数入りの行を無警告破棄（`js/estimate-add.js:1360,1369`）
- 負値・グリッド外を保存可能: 見積工数（`js/estimate-edit.js:198,207`）、見込残存時間（`js/actual.js:1345` 周辺）
- 工数系 step の4種混在（見積0.5／月別按分0.1／見込残存0.25／休暇1）。按分0.1刻みは合計0.5刻みと非互換で一致判定に引っかかりうる
- 休暇保存後の再描画漏れ: `renderActualList` のみで `renderTodayActuals`/`updateReport` を呼ばない（`js/vacation.js:157-158,273-276`）
- タイムライン（大物「完成」の内訳にする）:
  - その他作業（version空）が通常タスクと同じ見た目・色で区別不能（描画側に分岐なし）
  - タイムライン登録の実績に `isReview`/`createdAt` が付かない。バー結合キーが `date|version|task` で工程・レビュー区分を含まず合算される（`:2874`）
  - 結合バーのドラッグが先頭1件しか動かさない（`:2145,2181`）
  - 昼またぎブロックがリサイズ不可＋同一 `data-actual-id` の DOM 二重（`:753-782`）
  - ドラッグ系の Esc キャンセルが全経路で無い
  - モバイル: リサイズハンドルが hover 依存で不可視（`style.css:6692,6705`）、タップ配置が旧横軸レイアウトの `DAILY_HOUR_WIDTH` で工数算出（`:969`）、見積0件メンバーはカード経路が使えない（`:819`）
  - 完了版数キャッシュのキーが件数のみで編集に追随しない（`:3086`）
  - 0.25h ブロックが `min-height:28px` で下と重なる（`style.css:6670-6684`）
- `normalizeDate` の二重実装で挙動差（`js/merge-core.js:44-46` は未認識時に生文字列を通す / `js/excel-import.js:122-125`）
- 進捗率の浮動小数誤差で 100% にならない可能性（`js/schedule.js:473`、`js/schedule-render.js:1333`）
- エクスポートファイル名のタイムスタンプが UTC（`js/storage.js:781`、`js/ai-analysis.js:476`。`storage.js:440-445` はローカルで不統一）
- parseInt/parseFloat の局所ガード漏れ（`js/estimate-selection.js:167` NaN、`js/schedule.js:1647` isNaN ガードなし）
- 連続入力時のフォームリセット方針が画面ごとに逆（`js/estimate-add.js:698-741` 全消去 vs `js/quick.js:754-759` 文脈保持）。担当者だけ毎回消える非対称（`js/quick.js:254-255`）も含め方針を決める
- タイムラインピッカーからのその他作業登録に `createdAt` を付与（other-work.js と揃える）
- 1日満了時（残り0h）の新規実績デフォルト 0.25h の妥当性確認（0h 登録を防ぐ暫定仕様）
- タイムラインピッカーの見積タスク0件時の表示改善（現状は「見積タスクがありません」の空表示）

## 大物（設計が要るもの）

- **工数入力方式トライアルの収束**: 5方式を設定で切替可能な状態で実地使用中（2026-08-19〜）。
  実使用で本命を決定 → 負けた方式のレンダラーを削除し設定項目を畳む。
  判断記録: `mockups/hours-input-quick/`（比較モックアップ・README）
- **実績タイムラインの完成**: 上記 P1-1/P1-4 と P2 タイムライン群を含む総点検。バー編集・予定連携・モバイル操作
- **スケジュール機能のガント/WBS化**: ガントチャート/WBSとして完成させ、担当者ごとのスケジュール管理をしやすく改善する
- **プロジェクト外時間（non-project-time）の実装**: モックアップ採用済み（2026-06-15 案A、`mockups/non-project-time/`）。スキーマ（`nonProjectItems`）は state/storage に準備済み、UI 未実装

## アイデア（未評価）

- 工数入力: 直近使った工数値の学習（メンバー別のよく使う値をチップに反映）
- ID採番の一本化（`js/state.js:341` 連番整数 vs `js/excel-import.js:274` `Date.now()+Math.random()`。浮動小数IDの等値比較は脆い）
- 未使用CSSの掃除（`style.css:6905-6919` `.actual-tl-bar-resize` 系は生成箇所なし）
