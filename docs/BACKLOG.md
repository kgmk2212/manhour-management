# 改善バックログ

> 細かい改善・バグ・大物案件を一元管理する台帳。
> 運用: セッション冒頭で P1 から拾う。完了した項目は削除する（履歴は Git に残る）。
> 大物は着手時に brainstorming → 設計書（docs/superpowers/specs/ または docs/ 直下）に昇格させる。
> 出典: 2026-08-19 のコード監査（Explore 3系統: 入力系UI／日付・数値処理／タイムライン）。
> [確認済] = 該当コードを直接読んで裏取り済み。[報告] = 探索エージェント報告で高確度だが実機未確認。

## P1（バグ・実害あり）

- （2026-08-19 監査の P1 6件はすべて修正済み: 予定バークリック死／見積編集の0h行黙殺削除／
  「今日」UTCズレ19箇所／ガント複数日ドラッグの工数集中／休暇時間入力の刻み・検証・リセット／月別按分の未丸め保存。
  詳細は該当コミットのメッセージ参照）

以下は 2026-08-19 の別監査（4観点: 重複コード／データ層／イベント配線／CSS・巨大ファイル）由来。Undo/Redo 系はまとめて1コミットで直すのが効率的:

- **Undo が実行時 TypeError で破綻** [確認済]: `js/history.js:177,282,285,289,292,381` が
  `State.estimates = ...` と ESM 名前空間へ代入（`import * as State` は read-only）。
  見積追加の Undo／見積・タスク削除の Redo が該当行到達で例外。しかも `undo()` は適用前に
  スタック移動を済ませるため、例外後は履歴と実データが恒久的にずれる。
  修正: `State.setEstimates(...)` / `State.setRemainingEstimates(...)` へ置換（6行）
- **タイムライン実績「編集」の Undo が無反応** [確認済]: `js/actual-timeline.js:2397,2527` が
  `'editActual'` type を push するが `history.js` の分岐は `'actual_edit'` のみ
  （1010700 で add/delete は修正済み、edit のみ残存）。ペイロード形も `history.js` 側の期待に合わせること
- **`'estimate_add_batch'` に Undo 分岐が無い** [確認済]: `js/estimate-edit.js:504` が push、
  `history.js` に処理なし → エントリだけ消費して何も戻らない。
  あわせて `applyUndo/applyRedo` に未知 type の警告分岐（default で console.warn ＋ 適用不可扱い）を入れ、type 追加漏れの再発を可視化する
- **宛先不在の window 呼び出し** [確認済]: `js/history.js:562` の `window.renderVacationList()` は
  全プロジェクトで未定義（Undo 後に休暇一覧が未更新）。実在の再描画関数へ差し替えるか削除
- **escapeHtml の弱い重複実装（属性エスケープ破り）** [確認済]: `js/report-analytics.js:260` は
  `& < >` のみで `"` 非対応。`title="${escapeHtml(v)}"`（:769）等の属性文脈で使用されており
  `"` 入り版数名で属性脱出可。ローカル版を削除し `utils.js:342` の5文字版を import。
  ついでに同ファイル :380 / :956 の素の `${...}` 挿入（メンバー名・版数）もエスケープ [報告]

## P2（使いにくさ・不整合）

- **storage.js:218 の初期化クラッシュ**: スケジュール id が文字列 `sch_N` 前提で `s.id.match(...)` を呼ぶため、
  数値 id のレコードが混入すると TypeError で初期化が中断する（検証シードで実証）。`String(s.id).match` に
- **Undo の一括対応漏れ**: `history.js` の `actual_add` は `data.added` 1件しか戻せない。
  `addMeeting`（全員分登録、`data.addedAll` を渡している）を Undo しても1件しか消えない
- **日付⇄Date 往復の UTC/ローカル混在の統一**（JST では自己整合と確認済み・負オフセットTZで破綻する脆さのみ）:
  `js/actual-timeline.js` の `new Date('YYYY-MM-DD')`→`toISOString()` 往復（該当6箇所）と
  `js/schedule-render.js:1362-1368` の日数差計算。`utils.addDaysToDateString`（新設済み）への置換で統一

- **クイック入力の工数欄が文脈無視**: 保存後に常に 8h リセット（`js/quick.js:247`）、初期値も固定 8h（`index.html:245`）、工数入力ウィジェット（`js/hours-input.js`）未適用。残り工数デフォルト＋ウィジェット適用で実績モーダルと統一する
- 死に分岐: `window.setQuickInputPreviousActual` は参照のみで未定義（`js/quick.js:302-303`）[確認済]。実装するか削除
- 見積登録のフィードバック: 0件でも「登録しました」成功トースト（`js/estimate-add.js:1554-1599`、`js/quick.js:728-762` 同型）、担当者未選択で工数入りの行を無警告破棄（`js/estimate-add.js:1360,1369`）
- 負値・グリッド外を保存可能: 見積工数（`js/estimate-edit.js:198,207`）、見込残存時間（`js/actual.js:1345` 周辺）
- 工数系 step の4種混在（見積0.5／月別按分0.1／見込残存0.25／休暇1）。按分0.1刻みは合計0.5刻みと非互換で一致判定に引っかかりうる
- タイムライン（大物「完成」の内訳にする）:
  - その他作業（version空）が通常タスクと同じ見た目・色で区別不能（描画側に分岐なし）
  - タイムライン登録の実績に `isReview` が付かない（`createdAt` は対応済み）。バー結合キーが `date|version|task` で工程・レビュー区分を含まず合算される（`:2874`）
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
- 1日満了時（残り0h）の新規実績デフォルト 0.25h の妥当性確認（0h 登録を防ぐ暫定仕様）
- タイムラインピッカーの見積タスク0件時の表示改善（現状は「見積タスクがありません」の空表示）

## 大物（設計が要るもの）

- **構造負債の段階解消（2026-08-19 4観点監査）**: 全量は `refactoring-proposals.md`（2026-07-06・17件未実施）＋本監査の追加分。
  新規の主な発見: ①スティッキーフィルタバー3実装並立（本番は `index.html:2852-3445` の594行インライン script、
  `js/ui.js:4150` に130行の完全デッド旧実装）→ `js/` へ抽出＋デッド削除で724行が正常化 [報告]
  ②業務ロジックの多重実装で数値が分岐（営業日判定4系統／人日換算基準3実装で平均と合計が混在／進捗率2式／
  メンバー×日付集計7箇所で NaN ガード不統一）[報告] ③`saveData()` try/catch 無しの全量書き込みで
  クォータ超過時に torn write、undo履歴も同一クォータに同居 [報告] ④`autoBackup()` に
  `taskSortOrder`・`reportSettings` 等が含まれずバックアップ→復元で黙って消える [報告]
  ⑤`quick.js` は `estimate-add.js` のプレフィックス置換コピー（`quick.js:766` に自白コメント、
  `autoFillMember` は完全冗長）[報告] ⑥window 公開368名の約48%が不使用の死荷重、
  `init.js:166` は存在しない export を代入 [報告]。
  まず「window 公開・inline ハンドラの新規追加禁止」を CLAUDE.md に明文化して悪化を止めるのが先決

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
