# リファクタリング提案書（manhour-ui-scaling）

2026-07-06 実施のコード品質調査（実コード読解・file:line 根拠付き）に基づく提案の全量。
**この文書は提案であり、未実施**。実施判断・順序の変更は自由。

## 前提と進め方

- 対象規模: ESM JS 33ファイル・約24,000行 ＋ index.html 3,437行 ＋ style.css 8,090行
- 特性テストは 48件（merge-core / partial-json / state / estimate の一部）のみ。**ui.js・report.js・schedule.js・actual-timeline.js・init.js はカバレッジ0**
- 原則: テストで守れない範囲の変更は「移動のみ・挙動不変」方式（分割後に旧パスから re-export するファサード）に限定するか、先にテストを増やしてから行う
- 関連文書: [known-behaviors.md](known-behaviors.md)（現状の怪しい挙動3件・テストで固定済み）

## 提案一覧（優先度順）

| # | 提案 | 効果 | リスク | 目安工数 |
|---|---|---|---|---|
| P1-1 | カンマ区切り数値が0になるバグ修正 | データ消失事故の予防 | 低（テスト有） | 小 |
| P1-2 | 重複ヘルパーの統合（el / escapeHtml） | 二重管理の解消 | 低 | 小 |
| P1-3 | 日付フォーマットの共通化（30箇所超） | 重複解消・テスト可能化 | 低 | 小〜中 |
| P1-4 | デッドコード16件の削除 | 見通し改善 | 低（要目視確認） | 小 |
| P1-5 | ESLint 強化（unused-vars / complexity） | 再発防止の仕組み化 | 低 | 小 |
| P2-1 | state 直接 mutate の経路統一 | 状態管理の一貫性 | 中 | 中 |
| P2-2 | localStorage 直呼び81箇所のヘルパー経由化 | 例外安全の一元化 | 低〜中 | 中 |
| P2-3 | 巨大ファイル分割（ui/report/schedule） | 保守性の抜本改善 | 中（手法で低減） | 大 |
| P2-4 | window グローバル結合の縮小 | ESM 完結への道筋 | 中 | 大（段階実施） |
| P2-5 | 紛らわしい命名の整理（renderReportAnalytics） | 事故予防 | 低 | 小 |
| P3-1 | saveData 全量書き込みのデバウンス | 性能（将来） | 中 | 中 |
| P3-2 | magic number の constants 寄せ | 一貫性 | 低 | 小 |
| P3-3 | エラーハンドリング方針の統一 | 障害の可視化 | 低 | 中 |
| P3-4 | style.css 未使用疑い99クラスの棚卸し | 削減 | 中（動的合成あり） | 中 |
| P3-5 | index.html インライン style 634箇所のクラス化 | 保守性 | 中 | 大 |
| P3-6 | innerHTML 全置換レンダリングの見直し | 性能（将来） | 高 | 大・保留推奨 |
| 横断 | テスト拡充ロードマップ | 上記すべての土台 | - | 継続 |

---

## P1: 安全・即効（すぐやって損がない）

### P1-1. カンマ区切り数値が 0 になるバグ修正
`js/merge-core.js` の `roundNum("5,000")` → `0`（詳細: known-behaviors.md #1）。`Number()` 前にカンマ除去、または NaN 時に警告を返す。**挙動変更なので `tests/merge-core.test.js` の期待値更新とセットで**。3件の怪しい挙動のうち唯一「直す価値あり」判定。

### P1-2. 重複ヘルパーの統合
- **`el()` の三重実装**: `js/merge-core.js:13`（export済）・`js/excel-import.js:13`（ローカル）・`js/ai-analysis.js:44`（シグネチャ違い）。merge-core.js のコメント自体が重複を認めている。export 済みの1つに統一し他は import に置換。ai-analysis 版はシグネチャが違うため、統一するか `elWithText()` として別名共存かを先に決める
- **`escapeHtml` の二重実装**: `js/utils.js:333`（共有想定）と `js/report-analytics.js:260`（ローカル再定義）。utils 版に一本化

### P1-3. 日付フォーマットの共通化
`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` パターンが actual-timeline.js（8箇所以上）・actual.js（8箇所）・storage.js・estimate-add.js・estimate-split.js・llm-summarize.js に30箇所超散在。`utils.js` に `formatYmd(y, m, d)`（または Date 受け）を1つ定義して機械的に置換。**純粋関数なので特性テストを添えやすく、置換の安全確認もしやすい**。

### P1-4. デッドコード16件の削除
どこからも参照されていない export 関数16件（正規表現検索による検出・**window 経由の動的参照があり得るため削除前に目視確認必須**）:
- `js/utils.js`: `safeGetLocalStorage`(597)・`safeSetLocalStorage`(614)・`safeQuerySelector`(630)・`formatMonthRangeJapanese`(668)・`getCurrentMonthString`(687)・`getNextDateString`(699)
  - ※ 前2つは削除ではなく **P2-2 で「使う」方向を推奨**
- `js/quick.js`: `getSelectedQuickTask`・`setSelectedQuickTask`・`getQuickInputMode`
- `js/ui.js`: `updateTabIndicatorProgress`(739)・`finalizeTabIndicator`(791)・`initSmartStickyFilters`(4149)
- `js/history.js`: `canUndo`・`canRedo`
- `js/state.js`: `setPhaseCollapsed`(362)
- `js/estimate-add.js`: `getCurrentEstimateMode`

### P1-5. ESLint 強化
現状は `no-undef` のみ（意図的な最小構成・警告0件）。デッドコード削除後に `no-unused-vars` を有効化し、`complexity` / `max-lines-per-function` を **warn** で導入して巨大化の再発を計測可能にする。CI（`.github/workflows/test.yml`）に `npm run lint` を追加。

---

## P2: 構造改善（テストと併走で段階的に）

### P2-1. state 直接 mutate の経路統一
配列丸ごと差し替えは setter 経由（`setEstimates` 等）だが、**push/splice の in-place 変更が setter を完全バイパス**している: `estimate-edit.js:356`・`estimate-add.js:434,1216,1358`・`history.js:182,187,210,276,301,304,375`・`quick.js:227,723`・`other-work.js:61,129`・`excel-import.js:301,331`・`actual.js:1246`・`actual-timeline.js:2515,2540`。
→ `state.js` に mutator API（`addEstimate()` / `removeEstimateById()` 等）を追加し、直接 mutate を段階置換。setter に変更通知や自動保存のフックを入れられる状態にする。ID採番バグ（12cb8ca）の再発防止にも効く（採番と挿入を1関数に閉じ込められる）。

### P2-2. localStorage 直呼びのヘルパー経由化
`safeGetLocalStorage`/`safeSetLocalStorage`（utils.js:597,614）が**存在するのに採用率0**で、生の `localStorage.getItem/setItem` が15ファイル81箇所（storage.js 35・ui.js 14・tab-filter.js 12・report.js 11・history.js 8 ほか）。プライベートブラウジング等での例外を一元処理するため、ヘルパー経由に順次置換。キーは `constants.js` の `STORAGE_KEYS` に寄せる（現状も一部直書きあり）。

### P2-3. 巨大ファイル分割
調査で特定した自然な分割線に沿って分割する。**必ず「移動のみ＋旧パス re-export ファサード」方式**（news プロジェクトの render.py 分割で実証済みの手法: 出力・挙動バイト同一を保ったまま分割）で行い、1ファイルずつコミット。

- **ui.js（4,275行）→ 5分割**: タブ操作(1-1510) / レイアウト・セグメント(1510-2084) / プルダウン生成(2084-2867) / タブ間同期・ハンドラ(2867-3944) / フィルタ永続化・サイドバー(3944-4275)
- **report.js（3,342行）→ 5分割**: 設定・進捗計算(1-403) / 進捗UI(403-957) / フィルタリング(957-1326) / フェーズ分析(1326-1945) / レポート描画＋チャート(1945-2957) / キャパシティ(2957-3342)。`renderReportMatrix`（2261-2546・単体285行）は関数自体の分解も検討
- **schedule.js（2,665行）→ 4分割**: CRUD / モーダルUI / 自動生成 / ドラッグ&ドロップ
- init.js（687行）は「配線専任」なので分割不要。window 代入の羅列は P2-4 で扱う

### P2-4. window グローバル結合の縮小
`init.js` の `window.*` 代入 **380件**、`index.html` のインラインハンドラ **約88件**（onclick 55・onchange 26 ほか）。全面書き換えは高リスクなので段階方式:
1. **新規追加の禁止**をルール化（CLAUDE.md に明記）
2. インラインハンドラを `data-action` 属性＋イベントデリゲーション（1つの listener で dispatch）へ画面単位で移行
3. 移行済み画面から `window.*` 代入を削る
最終形は「window 露出ゼロ・ESM 内で完結」だが、途中で止まっても各段階で価値が残る。

### P2-5. 紛らわしい命名の整理
`report.js:1945` の `renderReportAnalytics` と別ファイル `js/report-analytics.js` の `initReportAnalytics` が並存（機能は別物）。どちらかをリネームして「ファイル名＝機能」の対応を回復する。

---

## P3: 品質・性能（必要になってから／余裕がある時に）

### P3-1. saveData() の全量書き込みデバウンス
`storage.js:69-109` の `saveData()` は毎回全配列を JSON.stringify → localStorage 書き込みで、呼び出しが42箇所。1件更新でも全量再シリアライズ。データ量が増えると1操作コストが線形増加する。→ まず実データ量で計測し、体感遅延が出るなら 300ms デバウンス（連続操作を1回の書き込みに集約）を導入。キー別分割保存は undo/redo（history.js）との整合が要検討なので後回し。

### P3-2. magic number の constants.js 寄せ
`hoursPerDay = 8` 相当の直書きが utils.js:549・report.js:3075 ほか（粗検索で48箇所・ノイズ含む）。`setTimeout` の待機値（300ms×4・100ms×2・150ms×1 ほか計8箇所）も未定数化。constants.js には既に14グループあるので追加は容易。

### P3-3. エラーハンドリング方針の統一
catch 約64〜68件のうち、コメントのみの握りつぶし7件（`ui.js:317,2331,2494,2594,2689` ほか）・console ログのみ28件。方針を決めて統一する: 「ユーザー操作の失敗はトースト通知」「バックグラウンド処理はログ＋次回リトライ」「握りつぶし許容は localStorage 系のみ（コメント必須）」など。

### P3-4. style.css 未使用疑いクラスの棚卸し
8,090行・クラスセレクタ678種のうちテキスト検索で出現ゼロが99件（`modal-theme-teal`・`gantt-today-line`・`badge-success` 等）。**ただし `theme-${color}` のような動的クラス合成があるため機械削除は禁止**。テーマ系・動的系を目視で除外した上で段階削除。

### P3-5. index.html インライン style のクラス化
`style="..."` が634箇所。画面単位でクラスへ移行（デザイン変更を伴う場合は frontend-design スキル必須）。P2-4 のインラインハンドラ移行と同じ画面を同時に触ると効率が良い。

### P3-6. innerHTML 全置換レンダリングの見直し【保留推奨】
`renderEstimateList`（estimate.js:658）等は全件文字列組み立て→ `innerHTML` 全置換。差分更新化は効果が大きい反面、**イベント・フォーカス・スクロール位置の維持など難所が多くリスクが高い**。個人利用のデータ規模では実害が出にくいので、体感の遅さが出るまで保留を推奨。

---

## 横断: テスト拡充ロードマップ（すべての土台）

現状48件では P2-3 以降を安全に進められない。優先順:
1. **storage.js**: `loadData()`/`saveData()` のスキーマ往復・ID再採番（過去バグ 12cb8ca の回帰防止）— localStorage は簡易モックで
2. **report.js の `calculateProgress`**（純粋計算・report.js:1-403 内）
3. **P1-3 で作る `formatYmd()`** と日付境界
4. **detectDiff の実運用形**（estimates セクションの spec も追加。現状は actuals 形のみ）
5. その後に P2-3（巨大ファイル分割）へ着手

## 検出の限界（正直な注記）

- デッドコード16件は静的検索による検出。`window[name]()` のような動的参照（history.js の `refreshAllViews` が実際に使うパターン）は追えないため、**削除前に個別の目視確認が必須**
- CSS 未使用99件も同様に動的クラス名合成の検出漏れがあり得る（「削除候補」でなく「確認候補」）
- 行数は 2026-07-06 時点の実測。CLAUDE.md 等の記載値と差異がある場合は本文書の値が新しい
