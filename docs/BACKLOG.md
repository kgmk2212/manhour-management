# 改善バックログ

> 細かい改善・バグ・大物案件を一元管理する台帳。
> 運用: セッション冒頭で P1 から拾う。完了した項目は削除する（履歴は Git に残る）。
> 大物は着手時に brainstorming → 設計書（`docs/superpowers/specs/` または `docs/` 直下）に昇格させる。
> **注**: `docs/superpowers/` は公開リポジトリから外してある（`.gitignore` 済み・ローカルのみ）。
> 以降このファイル中の `docs/superpowers/...` への参照はすべてローカル専用パスを指す。
> 出典: 2026-08-19 のコード監査（Explore 3系統: 入力系UI／日付・数値処理／タイムライン）。
> [確認済] = 該当コードを直接読んで裏取り済み。[報告] = 探索エージェント報告で高確度だが実機未確認。
>
> **登録規律（2026-08-20〜）**: ①項目を追加する前に、既存項目（解決済みの括弧書き記録を含む）から
> 同根のものを検索し、あれば新規追加せず既存項目へ統合する ②原因は可能な限り file:line で特定して書く
> ③何かを修正したら、同じ修正で解消される他項目が無いか台帳を見て一緒に閉じる
> ④各項目には通し番号 `[B-nnn]` を付け、番号は再利用しない（**次番号: B-048**）。
> claims 層（/start-work の着手宣言）はこの ID を参照する。

## P1（バグ・実害あり）

- （2026-08-19 監査の P1 6件はすべて修正済み: 予定バークリック死／見積編集の0h行黙殺削除／
  「今日」UTCズレ19箇所／ガント複数日ドラッグの工数集中／休暇時間入力の刻み・検証・リセット／月別按分の未丸め保存。
  詳細は該当コミットのメッセージ参照）

- （2026-08-19 別監査（4観点）由来の Undo/Redo 系 P1 5件も修正済み: ESM名前空間代入の TypeError／
  タイムライン編集の 'editActual' タイプ不一致／'estimate_add_batch' 分岐欠落＋未知タイプの適用不可扱い／
  宛先不在 renderVacationList／report-analytics の弱い escapeHtml 重複。feature/undo-redo-fixes で対応。
  あわせて undo/redo/revertToAction を「適用成功時のみスタック移動」に変更し、失敗時の履歴ズレを構造的に防止）

- （2026-08-28 コード監査: 5系統（実績／見積／レポート・スケジュール／UI基盤／状態・保存）のサブエージェントで全 js 約37,000行を
  全文精読し、各候補を引用箇所の再読で裏取りした。[確認済] は本セッションで該当コードを直接読んで到達経路を確認済み。
  同監査の起点バグ（実績登録で版数変更時に対応名がテキスト入力化）は `bc03b3f` で修正・デプロイ済み）

- [B-016] [確認済] **「前回のクイック入力モードを記憶」ON でリロードすると初期化が TypeError で停止し全ボタン無反応**:
  `js/quick.js:414` `quickInputMode = savedMode;` が ESM import バインディング（const）への代入。呼び出し元 `js/init.js:542` は
  DOMContentLoaded 内で try/catch 無しのため、以降の `initEventHandlers`/`showTab`/timeline 初期化が全部スキップされる。
  直後の `switchQuickInputMode(savedMode)` が setter を呼ぶので 414 行は削除でよい
- [B-017] [確認済] 実績編集モーダルの残存値・非表示値の保存混入: ①`saveActualEdit`（`js/actual.js:1329-1331`）が候補 select 表示中でも
  未選択なら隠れた自由入力欄の残存テキストを対応名として保存（`editActual` :1096-1102 は `taskInput.value` を消さない）→ 同ファイルの
  `getEditActualCurrentTask()` に置換 ②版数を空にして保存すると非表示のレビューチェックが `isReview:true` で保存（:1336, :1769 は隠すだけ）
  ③担当変更（`js/ui.js:3932-3943`）でリスト再構築後に対応名を再選択しない（工程変更 :1793-1827 は復元する）
  ④版数「+ 新しい版数を追加...」の prompt キャンセルで `select.value=''`（`js/ui.js:3818-3820`）→ 実績モーダルではその他工数モードへ切替わる。直前値へ戻すべき
- [B-018] [確認済] その他作業の登録日付が汚染される: `enterEditActualTabMode`（`js/actual.js:1219`）が `otherWorkModal.dataset.calendarDate` を
  セットするが `exitEditActualTabMode` は消さず、削除は `js/other-work.js:206`（closeOtherWorkModal）のみ。カレンダーから実績モーダルを開いた後、
  クイック入力の「その他作業」（`other-work.js:23-24, 336-339`）がその日付で登録される
- [B-019] [確認済] タイムライン横スクロール時にドロップ／範囲選択／タップ配置の日付が scrollLeft/36 日ぶん右へズレる:
  `js/actual-timeline.js:956, 1210, 1308, 1423, 1535, 2348` の `e.clientX - rect.left + dom.section.scrollLeft` は、行が
  スクローラ `.actual-tl-section`（`style.css:6175 overflow:auto`）の内側にあるため rect.left が既にスクロール分を含み二重計上。`+ scrollLeft` を削除
- [B-020] [確認済] 作業詳細モーダルで最後の休暇を削除すると削除済み行が残りモーダルが閉じない: `js/vacation.js:197` が無条件に
  `showWorkDetail` を呼ぶが、`js/actual.js:776` は実績も休暇も 0 件なら早期 return して再描画しない。`deleteActualFromModal`（:981-986）同様に残件 0 なら `closeWorkModal()`
- [B-021] [確認済] 作業月一括割り当てが作業月設定済みの見積に効かない: `js/estimate-selection.js:127-131` は `e.workMonth` のみ更新、
  `normalizeEstimate`（`js/utils.js:93-97`）は `workMonths`/`monthlyHours` 非空なら旧値を返すため一覧・フィルタ・レポートは旧月のまま
  （workMonth と workMonths が不整合のまま保存される）。`workMonths=[m]; monthlyHours={[m]:hours}` も設定する（Undo の pushAction も無い）
- [B-022] [確認済] 全工程編集（`js/estimate-add.js` openEditAllProcesses/saveEditAllProcesses）の不具合群:
  ①単一月分岐（:250-253）が `addEstMonthType` ラジオを single に戻さず、登録モーダルで「複数月」を選んで閉じた後に開くと保存側（:353-361）が
  multi 経路で全工程の作業月を当月に置換 ②版数/対応名リネーム（:492-515）が estimates/actuals/schedules のみで `remainingEstimates`
  （`js/estimate.js:225-231` キー）と `taskSortOrder` を追随させず、次回起動の `cleanupOrphanedRemainingEstimates` で見込残存が消える
  ③`pushAction('estimate_bulk_edit')`（:521-524）に `addedEstimateIds` を渡さず、Undo で新規追加工程が残る（`js/history.js:412-429` は対応済み）
  ④既存行の担当「-」で `member:''` のまま保存（:404-425。新規登録側 :1529-1544 はブロック）⑤追加担当者行を × で消しても該当見積が削除されない
  （:389-397, :487-488。`js/estimate-edit.js:473-482` は削除する）⑥登録モーダルの「その他工数」モード／単一工程モードが持ち越される
  （`switchEstimateMode('normal')` 未呼出、`addOtherWorkEstimate` が `exitSingleProcessMode` を呼ばない）
- [B-023] [確認済] 単一工程追加モーダル（`js/estimate-add.js:46-129`）で非表示にした他工程行の残存入力がそのまま登録される:
  `initAddEstimateForm`（:844-892）はフィールド・追加担当者行をクリアせず、行非表示は `tbody tr` の index を `PROCESS.TYPES[i]` に対応させる
  （:107-111）ため追加行があるとズレ、`collectAllEstimateEntries` は非表示行も拾う。冒頭で `resetAddEstimateForm()` 相当を呼ぶ
- [B-024] [確認済] 見積編集の保存で兄弟（同工程の他担当）レコードの月別配分が無条件に 0.1 丸め均等再配分され手動配分が消える・合計不一致
  （`js/estimate-edit.js:402-431`。`per = Math.round(hours/n*10)/10`、変更有無の判定なし）。不変なら維持、再配分は `splitHoursEvenly` に統一
- [B-025] [確認済] 見積 1 件削除（`js/estimate.js:1342`）が `deleteRemainingEstimate`（:241-256、member を見ず version/task/process で削除）を呼び、
  同工程に他担当が残っていても工程レベルの見込残存が消える。`pushAction` data に `deletedRemaining` が無く Undo で残存が戻らない（`js/history.js:213-217` は対応済み）
- [B-026] [確認済] レビュー予定の詳細モーダルで状態を保存すると本作業の見込残存を上書き／削除し、本作業予定の status まで変わる:
  `js/schedule.js:855-860, 872` が isReview を見ずに残存を入力欄へ載せ、保存（:1070-1079）が `saveRemainingEstimate`/`deleteRemainingEstimate` を
  無条件に呼ぶ（`calculateProgress` :458 はレビューを除外している）。さらに `js/estimate.js:205-209` の連動が `!s.isReview` を条件に含めない
- [B-027] [確認済] 未スケジュール判定・一括登録・自動生成プレビューが isReview を無視: `js/schedule.js:2162-2167`（getUnscheduledEstimates）、
  `:2418-2437`（registerCheckedSchedules、`addScheduleSilent` に `isReview` 未渡し）、`:1592-1599`（プレビュー）が 4 キー比較のみ。
  実行側 :1387-1395 は `!s.isReview === !est.isReview` で別扱いのため件数が食い違い、レビュー見積の予定が作れない
- [B-028] [確認済] 分析タブ「月別推移」で作業月未設定の見積が直近 6 ヶ月すべてに全額計上される（`js/report-analytics.js:109-111`）。
  `getEstimateHoursForMonth`（`js/utils.js:136-138`）は月フィルタ用に「未設定は全額」仕様のため、月を横断して足す推移では重複。
  レポートタブの `renderMonthlyTrend`（`js/report.js:1669-1683`）は未設定を載せない → 両タブ不一致（`1985e7a` の回帰）
- [B-029] [確認済] ガントの `scrollToToday`（`js/schedule-render.js:1466-1476`）と `getVisibleCenterMonth`（:1488-1497）が `--gantt-scale`
  （`this.uiScale`）を換算しない（`scrollToMonth` :1457 は換算済み）→ PC で「今日」が手前で止まり、ヘッダ月表示が先の月にズレる
- [B-030] [確認済] 見込残存モーダルの実績リスト（`js/modal.js:352-357`）がレポートの月×版数フィルタを `filterType` で片側しか適用しない。
  `filterReportData`（`js/report.js:1131-1190`）は両方適用するためセルの数値と合わない（工程内訳モーダルは `4753293` で修正済み、こちらは取り残し）
- [B-031] [確認済] バックアップ JSON 復元（`js/storage.js` handleFileImport）の欠陥群: ①配列差し替え後に `initializeRecordIdAndDedup()` を
  呼ばず（:501-552。loadData :226 は呼ぶ）新規登録 id が復元データと衝突 ②`s.id.match(...)`（:520）が数値 id で TypeError → 配列差し替え済み・
  設定未復元・未保存の半端な状態で中断（loadData :218-222 は `String()` 化済み）③autoBackup が書く `matrixEstActFormat`/`chartColorScheme`/
  `workDetailStyle`/`estimateStandardDisplay` を復元側が読まず、直後の `saveData(true)`（:685）で捨てられる（:555-683）
  ④`memberOrder` を DOM にしか書かず `setMemberOrder` 未呼出（:640-643）→ saveData は旧値を保存しリロードで戻る
- [B-032] [確認済] アクセントカラー Rose/Teal/Slate（`index.html:1493-1495`、`THEME_COLORS` :169-179 に定義あり）を選ぶとリロードで
  Forest/Forest/Ink に戻る: `js/theme.js:116-126` `THEME_MIGRATION` に 3 色の恒等エントリが無く `|| 'forest'`／`'teal':'forest'`／`'slate':'ink'`
  に落ち、`applyTheme` 末尾の `saveData(true)`（:230）が移行後の値を保存して選択が永久に失われる
- [B-033] [確認済] 既定の「固定カラー」モード（`scheduleBarColorMode='original'`）でタスク色マップがリロード毎に破棄される:
  `js/storage.js:171-182`（loadData）、`:528-538`（復元）、`js/merge-json.js:163-167` の `allColors` が `THEME_TASK_COLORS` のみで、
  既定モードのパレット `TASK_COLORS`（`js/schedule.js:622` が返す）24 色のうち 17 色が含まれず `hasOldColors` が常に true → `setTaskColorMap({})`
- [B-034] [確認済] 変更履歴（`js/history.js`）: ①`redoToAction`（:170-173）だけ `pop→push→applyRedo` の順で戻り値・例外を見ず、失敗した操作が
  undo 側に積まれる（undo/redo/revertToAction は「成功時のみ移動」に修正済み）②アクション id が `State.nextId()`（:22-27）でレコード id と
  カウンタ共有。`initializeRecordIdAndDedup`（`js/storage.js:320-331`）は履歴の id を見ずに再初期化するため、レコードを作らない操作（編集・削除等）
  → リロード → 再操作で同 id が重複し、`revertToAction`/`redoToAction` の `top.id === targetId` 判定（:127-130, :170-175）が即 break して無反応
- [B-035] [確認済] フィルタ状態の保存順序: `handleEstimateVersionChange`（`js/ui.js:3286`）等が `saveEstimateFilterToStorage()` の**後**に
  `updateEstimateMonthOptions(value)` で月を連動変更するため差し替え後の月が保存されず、リロード時 `restoreEstimateFilterState`（:3714）が
  旧月で版数候補を再生成して版数が「全版数」に戻る（月 :3250、レポート :3340/:3395 も同様）
- [B-036] [確認済] タブ間同期の存在チェック欠落: `syncMonthToReport`（`js/ui.js:2948-2961`）、`syncMonthToEstimate`（:2963-2979）、
  `syncVersionToEstimate`（:3015-3031）は選択肢の有無を見ずに value を代入し、無い月・版数で `''` になる（`syncMonthToActual` :2981-2998 だけ
  `optionExists` ガードあり）→ レポートが「年NaN月」・実績全期間計上、見積一覧がその他工数のみ表示
- [B-037] [確認済] 見積の表示形式をグループ以外へ切替えると作業月割り当てモードの state が残る: `setEstimateViewType`（`js/ui.js:1663-1669`）が
  チェック OFF・パネル非表示だけで `setWorkMonthSelectionMode(false)`／`selectedEstimateIds.clear()` を呼ばず、グループ表示に戻ると
  工程セルの onclick が `toggleEstimateSelection` のままで詳細が開けない
- [B-045] [報告・原因未特定] iPhone（ホーム画面から起動）で **JSON バックアップ完了後に下部 Dock（`#mobileTabBar`）が大きく上にずれ、
  リロードするまで戻らない**（毎回ではない）。Chromium・WebKit のモバイル幅エミュレーション（390×664、6タブ×スクロール有無＋WebKit 側 3タブ、
  計15パターン）では Dock は `gap=0` のまま再現せず、`.mobile-tab-bar` は `position:fixed;bottom:0`（`style.css:435`）で祖先に
  containing block を作る transform も無い（実測）。iOS のレイアウト／視覚ビューポート不一致の疑いが濃いが未確定のため、
  実機で証拠を採る計測を `js/viewport-diag.js` として投入済み（設定→詳細→「表示診断ログ」／モバイルヘッダのタイトル長押しで開く。
  `logBackupEvent` を `js/storage.js` の exportBackup／importBackup から呼び、バックアップ直後 +400/1200/3000/8000ms の状態も記録）。
  パネルの「Dockを下端へ補正」で、ずれが getBoundingClientRect で観測できる種類（＝補正可能）か、描画のみのずれかを切り分けられる。
  **原因が判明したら修正と同時にこの計測コードを撤去する**（`js/viewport-diag.js`・`index.html` の `btnOpenViewportDiag`・
  `js/init.js` の初期化・`js/storage.js` の `logBackupEvent` 呼び出し）

## P2（使いにくさ・不整合）

- （2026-08-20 解決済み: **ui-scaling push でのPagesデプロイが環境保護ルールで常に失敗**。
  `github-pages` environment の deployment branches に `experiment/ui-scaling` を追加して解消した
  （branch policy id 57752821）。ジョブは発火ブランチによらず main をルート・実験ブランチを
  preview/ 配下に展開するため、公開内容は変わらない。検証: workflow_dispatch --ref
  experiment/ui-scaling で run 32278403788 が success、`/` と `/preview/ui-scaling/` ともに 200。
  **残課題も解消済み**: main 側 deploy.yml の乖離は `e161d0a` で ui-scaling の 2febec9 時点を
  そのまま取り込んで解消（run 32282832742 が success）。あわせて許可ブランチに
  ワイルドカード `experiment/*` を追加したので、`experiment/**` トリガ化で増えた
  実験ブランチからの発火も環境保護で落ちない）
- （2026-08-20 解決済み: **Pages デプロイの一過性競合**。直前のデプロイが Pages 側で確定する前に
  次が走ると「due to in progress deployment」(400) で落ちる（run 32278590563 で実測）。
  ワークフロー単位の concurrency では防げない（run が success でも Pages 側は進行中でありうる）
  ため、`2febec9` で deploy ステップを continue-on-error にし失敗時のみ 60 秒待って 1 回だけ
  再試行する構成にした。恒久的な失敗は再試行しても落ちるので取りこぼさない）
- （2026-08-20 feature/p2-fixes で以下を修正済み（数値ID・一括Undoは本線 576fccf と同時対応）:
  storage.js 数値ID初期化クラッシュ／actual_add の一括Undo対応／
  Date往復のUTC/ローカル混在統一（timeline 6箇所＝月またぎ予定のセグメント日付ズレの実バグ含む・schedule-render 日数差）／
  クイック入力の工数欄（ウィジェット適用・保存後は残り工数リセット・死に分岐削除）／
  見積登録の0件成功トースト＆担当者未選択行の無警告破棄（estimate-add / quick 両方）／見込残存の負値保存／
  工数系 step の 0.25 統一（見積・タイムライン編集含む。月別按分入力のみ 0.1 のまま＝保存は0.01丸め済み）／
  normalizeDate の一本化（未認識は空文字）／進捗率・残工数の丸め／エクスポートファイル名のローカル時刻化／
  parseInt/parseFloat ガード2件）

- [B-001] 月別按分入力の刻み（0.1 のまま）: 保存側は 0.01 丸め済みのため実害は小さいが、0.25 に寄せるかは方針判断
- [B-002] タイムライン（大物「完成」の内訳にする）:
  - その他作業（version空）が通常タスクと同じ見た目・色で区別不能（描画側に分岐なし）
  - タイムライン登録の実績に `isReview` が付かない（`createdAt` は対応済み）。バー結合キーが `date|version|task` で工程・レビュー区分を含まず合算される（`:2874`）
  - 結合バーのドラッグが先頭1件しか動かさない: `onBarMouseDown`（`js/actual-timeline.js:2282`）/`onBarTouchStart`（`:2319`）が
    `ids[0]`（`:2297,2333`）のみで対象を特定。一括変更エンジン（`js/actual-bulk-core.js` `applyBulkPatch` の日付シフト）で
    全 id を動かす形へ置き換える候補。設計書 `docs/superpowers/specs/2026-08-29-actual-bulk-edit-design.md` §4.6
  - smoke e2e（`tests/e2e/smoke.spec.js`）はタブ表示とコンソールエラー0のみを検査しており、バーのドラッグ／
    ドラッグ作成／右ペイン D&D は未カバー。将来の smoke 追加候補
  - 昼またぎブロックがリサイズ不可＋同一 `data-actual-id` の DOM 二重（`:753-782`）
  - ドラッグ系の Esc キャンセルが全経路で無い
  - モバイル: リサイズハンドルが hover 依存で不可視（`style.css:6692,6705`）、タップ配置が旧横軸レイアウトの `DAILY_HOUR_WIDTH` で工数算出（`:969`）、見積0件メンバーはカード経路が使えない（`:819`）
  - 完了版数キャッシュのキーが件数のみで編集に追随しない（`:3086`）
  - 0.25h ブロックが `min-height:28px` で下と重なる（`style.css:6670-6684`）
- [B-003] 連続入力時のフォームリセット方針が画面ごとに逆（`js/estimate-add.js:698-741` 全消去 vs `js/quick.js` 文脈保持）。クイックの担当者クリア（（自動）＝選択タスクの担当に戻る仕様）も含め方針を決める
- [B-004] 1日満了時（残り0h）の新規実績デフォルト 0.25h の妥当性確認（0h 登録を防ぐ暫定仕様）
- [B-005] タイムラインピッカーの見積タスク0件時の表示改善（現状は「見積タスクがありません」の空表示）
- [B-006] 差分マージ（バックアップJSON / Excel追加読み込み）の v1 残件 [確認済]
  （設計書 `docs/superpowers/specs/2026-06-15-backup-json-merge-design.md` §13 の「v1未対応」より）:
  - 表示設定（`settings`: テーマ/レイアウト/各表示フラグ）の一括取込が未実装（差分一覧にも出さない）。
    適用に多数の `setX`＋`applyTheme`/`applyLayoutSettings` 再現が必要なため v1 で見送った
  - `removed`（現在のみレコード）は一括の保持/削除のみで、行単位の個別選択ができない
  - `scheduleSettings` の undo が固定スキーマ前提（取込側が未知の新規キーを持つ場合のみ完全復元されない端ケース）
  - **実ブラウザでの通しスモーク未実施**（差分マージボタン→JSON選択→プレビュー→マージ→Undo）。
    純粋ロジックは `tests/merge-core.test.js` 24件で担保、実績重複バグ（`76b2184`）等の個別修正は検証済み

- [B-038] [確認済] `loadData`（`js/storage.js:158-193`）が全キーを 1 つの try で囲むため、1 キーの JSON 破損で残りが未読込のまま
  `applyTheme→saveData(true)`（`js/theme.js:230`）が無傷のキーを `[]`/`{}` で上書き。キー毎 try/catch（`safeGetLocalStorage` あり）＋ロード失敗時は保存抑止
- [B-039] [確認済] レポート集計の粒度混在: ①（2026-09-13 解決済み: 見込残存が工程全体の値なので、基準を用途で分けた。**文字色**は月別表示では「その月に割り当てた見積 vs その月の実績」（残存は月に割り振れないので色に使わない）、全期間表示では従来どおり予測総工数 EAC＝実績+残存で判定。**進捗率**は常に工程全体（全期間実績 ÷ (全期間実績+全体残存)）。`buildFullRangeTotals`/`evaluateMatrixCellColor`/`calcMatrixProgressRate` を追加し、表示する工数は従来どおり月按分のまま。テスト `tests/report-matrix-basis.test.js`）
  ②（2026-08-29 解決済み: 見積の自動按分 `computeEstimateShares` 自体を撤去し、担当者分析の見積は登録担当者にそのまま計上する方式へ変更。見積一覧の担当者別合計と一致）
  ③分析タブの版数別テーブル・精度推移（`js/report-analytics.js:155-163, 191-201`）が月フィルタを無視（隣の担当者別は反映）
- [B-040] [確認済] スケジュール: ①遅延判定の二重実装で数え方が不一致（`js/schedule.js:508-513` 終了日超過のみ vs `js/schedule-render.js:1357-1385`
  80% 未満も遅延）②`expandRangeForSchedules`（`schedule-render.js:374-391`）が `new Date('YYYY-MM-DD')` UTC 解釈で最終日終了の予定を範囲外と誤判定し
  不要に拡張 ③タッチドラッグ（:2114-2117）が元位置に戻しても移動確定・Undo 履歴が積まれる（mouseup :1814 は判定あり）
  ④taskColorMap のキー二重（`schedule.js:350,386` は `task`、`schedule-render.js:1081` は `version/task`）でパレットが半分で枯渇
- [B-041] [確認済] 見積: ①複数月按分の未丸め保存（`js/estimate-add.js` `computeRowWorkMonths` は 2026-09-12 に `splitHoursEvenly` 化済み・B-047。
  `js/quick.js` 側の同型コピーは未対応）
  ②編集の開始月変更で月別工数が index 位置で引き継がれ別の月にズレる（`js/estimate-edit.js:598-606`）③「：」を含まない対応名（Excel 取込・旧形式）で
  詳細モーダルからの工程追加が「帳票名を入力してください」で不能・全工程編集で強制リネーム（`estimate-add.js:99-102, 163-200, 343-350`）
  ④Excel 取込で工数空欄が `Number('')=0` を通り 0h 見積/実績になる（`js/excel-import.js:150,158,202,210`）
- [B-042] [確認済] 実績: ①実績 0 件・全期間でタイムラインが開けない（`js/actual.js:129-133` の早期 return がビュー分岐より前）②複数日予定バーの
  クリックがバー先頭日で「予定から登録」（`js/actual-timeline.js:1903`）③候補リストの残/超過（`js/actual.js:1524-1556`）が担当別見積から全員合算実績を引く
  （`feature/fix-multi-member-display` と重なる可能性）④モバイル長押し範囲選択と月送りスワイプが同時発火（`actual-timeline.js:2759-2816`）
  ⑤実績月切替のモバイルアニメ分岐（`js/ui.js:3161-3203`）が早期 return し他タブへの月同期が漏れる
- [B-043] [確認済] モバイル UI: ①`TAB_TITLES`（`js/ui.js:4054-4061`）に `analytics` が無くヘッダタイトルが前タブのまま
  ②`showTab` の同一タブ早期 return（:163-166）が `closeMobileSidebar()`（:329）より前でサイドバーが閉じない
- [B-044] [確認済] AI 分析の設定パネル（`js/ai-analysis.js:415-423`）が描画毎に `/api/tags` を叩き、推論中は 200ms 毎の再描画で疎通リクエストが多重発火
- [B-046] [確認済] 見積登録／全工程編集モーダルの「作業月」列がモバイル幅（390px）で月ラベルを表示できない: 3ヶ月以上の期間で
  列幅 100px（`js/estimate-add.js:992`）に 開始select＋〜＋終了select を `flex:1; min-width:0`（:1014, :1133）で押し込むため、各 select が
  文字幅より狭くなり空欄に見える（e2e `tests/e2e/estimate-month-follow.spec.js` mobile-390 のスクショで確認・値の機械判定は PASS）。
  2026-09-12 B-047 の新方式（chips / gantt / matrix）では行を 2 段にして解消。`legacy` を選んだときだけ残る（legacy 削除で閉じる）

## 大物（設計が要るもの）

- [B-007] **構造負債の段階解消（2026-08-19 4観点監査）**: 全量は `refactoring-proposals.md`（2026-07-06・17件未実施）＋本監査の追加分。
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

- [B-008] **工数入力方式トライアルの収束**: 5方式を設定で切替可能な状態で実地使用中（2026-08-19〜）。
  実使用で本命を決定 → 負けた方式のレンダラーを削除し設定項目を畳む。
  判断記録: `mockups/hours-input-quick/`（比較モックアップ・README）
- [B-009] **実績タイムラインの完成**: 上記 P1-1/P1-4 と P2 タイムライン群を含む総点検。バー編集・予定連携・モバイル操作
- [B-010] **スケジュール機能のガント/WBS化**: ガントチャート/WBSとして完成させ、担当者ごとのスケジュール管理をしやすく改善する。
  **2026-09-12 刷新案の比較モックアップ完成**（`mockups/schedule-redesign/index.html`・README に診断と比較表）: 現行の見づらさの根本は
  ①担当者行で並行予定が重ね描き（`schedule-render.js:956-962`）②1 日の負荷が見えない ③計画/実績 2 層が未実装 ④見積の作業月と予定の二重管理。
  案A 現行ガントの磨き込み（レーン分割・2 層バー・負荷帯・工程チップ・スケール切替）／案B 担当者×日の負荷格子（セル＝8 時間の器、
  タップ 3 回で時間を別の日へ、予定から作業月を導出）／案C 計画ボード＋進捗ガントの二画面（データは 1 つ、選択が画面をまたぐ）。
  **推奨は案C を ①A の核 → ②ボード追加 → ③作業月連携（B-047 と合流）の段階導入**。採用判断待ち。
  付随発見: `isBusinessDay`（`js/schedule.js:685`）が会社休日を `h.date` で照合するが会社休日レコードは `startDate/endDate` 型で、
  終了日計算・自動生成で会社休日が飛ばされていない疑い（コード読みのみ・実動作未検証）
- [B-011] **プロジェクト外時間（non-project-time）の実装**: モックアップ採用済み（2026-06-15 案A、`mockups/non-project-time/`）。スキーマ（`nonProjectItems`）は state/storage に準備済み、UI 未実装
- [B-047] **見積の工程別「作業月」設定 UI の刷新**（2026-09-12 起票・別セッションで brainstorming 中）: 現状は全体期間の
  開始〜終了を選んだうえで行ごとに 開始select〜終了select（2ヶ月期間は単一 select で範囲指定不可）。複数担当者・レビュー行・複数月の
  全組み合わせに効く視覚的な設定方法（月チップ格子／ミニガント／工程×月マトリクス等）を `mockups/estimate-work-months/` で比較し、
  採用案を `docs/superpowers/specs/` に設計書化する。暫定対応として単一月行の終了月追従（a62f797・`tests/e2e/estimate-month-follow.spec.js`）
  を先行導入済み。関連: B-046（モバイル幅で月ラベル不可視）、B-041①（按分の未丸め）、B-022（全工程編集の不具合群）
  **2026-09-12 モックアップ完成**（`mockups/estimate-work-months/index.html`・README に比較表と計測）: 現状 6 操作 / 案A 月チップ 4 / 案B ミニガント 5 /
  案C マトリクス 9。**推奨は案A**（タップ＝その月だけ・なぞる＝範囲・担当者行とレビュー行は工程に連動）
  **2026-09-12 実装済み（4 方式切替・実使用比較中）**: 設定「見積の作業月 UI」で `chips`（既定）/ `gantt` / `matrix` / `legacy` を切替。
  設計書 `docs/superpowers/specs/2026-09-12-estimate-work-months-design.md`、計画 `docs/superpowers/plans/2026-09-12-estimate-work-months.md`。
  共通 `js/estimate-work-months{,-core}.js` ＋ 方式別 `js/estimate-work-months-{chips,gantt,matrix}.js`、e2e `tests/e2e/estimate-work-months.spec.js`。
  残件: 決着後に負け方式を削除（手順は設計書 §10）、期間 7 ヶ月超のレール、「配分…」の後付け、クイック入力側（`js/quick.js`）への展開判断
  **2026-09-13 修正**: 全工程編集で「全工程が同じ単月」で登録されたタスクを開くと、登録月が行に載らず既定月（ウォーターフォール）が
  保存されていた（過去月だと期間ごと当月にすり替わる）。原因は ①行プリフィルが `isMultiMonth`（2 ヶ月以上）限定 ②工数プリフィル前に
  スロットを描いて描き直さない（マトリクスのセルが空に見える）③`switchAddEstMonthType` の終了月選択肢が legacy 規則（開始月より後）の
  ままで単月の終了月が翌月へ繰り上がる。`usePeriod` 判定・`WorkMonths.refresh()`・`refillEndMonthOptions()` で解消。
  回帰テスト `tests/e2e/estimate-work-months-prefill.spec.js`（chips / gantt / matrix × 今月+2 の単月・過去単月）

## アイデア（未評価）

- （2026-08-20 実装済み: parallel-mode の着手予約 → **claims 層**として実装。BACKLOG への書き込み方式は
  「feature ブランチ内の編集は統合まで他セッションから見えない」ため不採用とし、git 管理外の
  `.shared/claims/` に着手宣言を置く方式に変更。設計書: `docs/superpowers/specs/2026-08-20-claims-layer-design.md`）
- [B-012] 工数入力: 直近使った工数値の学習（メンバー別のよく使う値をチップに反映）
- [B-013] ID採番の一本化（`js/state.js:341` 連番整数 vs `js/excel-import.js:274` `Date.now()+Math.random()`。浮動小数IDの等値比較は脆い）
- [B-014] 未使用CSSの掃除（`style.css:6905-6919` `.actual-tl-bar-resize` 系は生成箇所なし）
- [B-015] 差分マージ プレビューUIのリデザイン案（未採用・2026-06-17 作成）: 数値タイル5枚→1行サマリ＋件数バッジ、
  変更行を inline diff 化、設定系を末尾に集約、分類を面の色で示す。判断材料: `mockups/backup-json-merge/`
