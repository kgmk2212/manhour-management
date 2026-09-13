# 一人当たりの月標準工数を表示する — 3案比較

見積一覧・レポートのどこに「一人当たりの月標準工数」を出すかを決めるために作った比較モックアップ。
`index.html` をローカル配信して閲覧する（`python -m http.server` などでリポジトリルートから配信し、
`/mockups/monthly-standard-hours/index.html` を開く）。

## 背景

「月標準工数」の表示は元から3か所にあったが、いずれも**チーム合計（営業日数 × 8h × 人数）**で、
一人分の基準値は画面に出ていなかった。

| 場所 | 実装 | 表示 |
|---|---|---|
| 見積一覧の合計カード | `js/estimate.js` `updateEstimateStandardDisplay()` | `月標準: 840h（21日×8h×5人）` |
| レポートのキャパシティ分析 | `js/report.js` `updateCapacityAnalysis()` | `標準: 176h (22日×8h×1人)` |
| レポートのインサイト | `js/report.js` `buildCapacityInsights()` | 閾値超過時のみテキストで `見積 xxh / 標準 xxh` |

3番目だけは「一人当たり標準 ＝ 営業日数 × 8h − 本人の休暇時間」を計算していたが、常時表示の UI は無かった。

## 3案

| 案 | 置き場所 | 内容 | 採否 |
|---|---|---|---|
| 案1 | 見積一覧の合計カード | `月標準: 840h（21日×8h×5人）` → `1人あたり月標準 168h（21日×8h）／ 5名で 816h（休暇 24h を控除）` | 不採用 |
| 案2 | 見積一覧の担当者別合計 | 見出しに `1人あたり月標準 168h（21日×8h）` を添え、各担当者カードに本人の標準工数と充足率バーを追加 | **見出しのサブテキストのみ採用** |
| 案3 | レポートのキャパシティ分析 | ヘッダに `1人あたり 168h` のピル、折りたたみで担当者別の充足率テーブル | 不採用 |

## 決定（2026-09-13）

**案2 のうち「担当者別合計の見出しに添えるサブテキスト」だけを実装した。**
担当者ごとの充足率バー（案2 の残り）、案1、案3 は入れていない。

決定にあたっての論点:

- **個人休暇は控除しない。** 見出しに出るのは全員共通の1つの数字なので、担当者ごとに変わる
  休暇時間は折り込めない。表示するのは素の基準値 `営業日数 × 8h`。
  休暇を差し引いた値が必要になるのは担当者ごとに出す場合（＝案2 の充足率バー、案3 の内訳表）。
- **複数月にまたがる場合は「平均」と明示する。** 月フィルタが「全期間」で作業月が複数あるときは
  平均営業日数を使うため、`1人あたり月標準 160h（平均20日×8h）` と書き分ける。
  作業月が1ヶ月だけなら平均ではないので「平均」は付けない。
- 案1 と案3 のヘッダは同じ1行（一人当たり＋チーム合計）になり情報が重複する。
  案2 の充足率バーと案3 の内訳表も中身が同一。まず最小の1行だけ入れて様子を見る判断。

## 実装

- `index.html` — 担当者別合計の見出しに `<span id="estimateMemberStandard">`
- `js/estimate.js` — `formatMemberStandardHours()`（純関数）、`calculateConversionBasis()` が
  `isAveragedDays` を返すよう拡張、`renderEstimateMemberSummary()` から反映
- `style.css` — 390px 時のサイズ・改行の上書き
- `tests/estimate.test.js` — `formatMemberStandardHours()` の単体テスト

## スクリーンショット

`shots/` に保存。

| ファイル | 内容 |
|---|---|
| `msh-plan1.png` | 案1（合計カード・サブテキスト／バーの両形式） |
| `msh-plan2.png` | 案2（担当者別カード・PC） |
| `msh-plan2-mobile.png` | 案2（390px） |
| `msh-plan3.png` | 案3（レポートのキャパシティ分析） |
| `verify-pc-member-summary.png` | 実装後の実画面（PC） |
| `verify-390-member-summary.png` | 実装後の実画面（390px） |

## 残っている論点

- `index.html` に `id="estimateMemberSummary"` が2つある（担当者別合計の本体と、空のまま
  使われていない div）。`getElementById` は先頭を返すため現状の動作に影響は無いが、
  Playwright の strict モードではセレクタが曖昧になる。今回のスコープ外として手を付けていない。

---

# 追記（2026-09-13）: 見やすさの5方式トライアル

上記で入れた「見出しの右にサブテキスト」が**見づらい**という指摘を受けての対応。
比較モックアップ: `readability.html`

## 何が問題だったか（実測）

| 問題 | 実測値 |
|---|---|
| コントラスト不足 | `--text-muted` #9C9690 / `--surface-elevated` #FAFAF9 = **2.8:1**。WCAG AA（4.5:1）を下回る。ラベルも値も同じ薄さで、一番読ませたい `168h` が一番読みにくい |
| 見出しと地続きに読める | 間隔が 12px しかなく「担当者別合計1人あたり月標準 …」と一文に見える |
| 幅 1225px の帯に左寄せで浮く | 右側が全部空で、下のカード群との関係も見えない |

## 対応: 5方式を設定で切り替えられるようにした

工数入力5方式・作業月UI 4方式と同じトライアル方式。実使用で比べて決着したら、
負けた方式と切替そのもの（設定 select 含む）を削除する。

設定 → 「1人あたり月標準の見せ方」（localStorage `manhour_estimateMemberStandardStyle`）

| id | 案 | 内容 |
|---|---|---|
| `value` | 案A | 位置はそのまま、ラベル→値→根拠の3段の強弱をつける（既定） |
| `badge` | 案B | アクセント薄色のバッジにして見出しから切り離す |
| `right` | 案C | 見出し行の右端へ寄せる |
| `card` | 案D | 担当者カードと同じ形の基準カードを先頭に並べる |
| `row` | 案E | 見出しの下に独立行（区切り線つき） |
| `none` | — | 非表示 |

コントラスト比: 案A の値 **14.9:1**（#1A1814 / #FAFAF9）・ラベル 5.0:1、案B/D **8.2:1**（#2D5A27 / #EBF5EA）。

## 実装

- `js/estimate.js` — `buildMemberStandardParts()`（ラベル/値/根拠に分解する純関数）、
  `MEMBER_STANDARD_STYLES` と getter/setter、`applyMemberStandardPlacement()`、
  `memberStandardCardHtml()`、`initMemberStandardStyleSetting()`
- `index.html` — 見出しに id、見出し下に `#estimateMemberStandardRow`、設定に select
- `style.css` — `18b` セクション（デスクトップ）とモバイル上書き
- `js/init.js` — 設定 select の初期化
- `tests/estimate.test.js` — `buildMemberStandardParts()` の単体テスト

スクリーンショット（実画面）: `shots/app-a.png` `app-b.png` `app-c.png` `app-d.png`
`app-e.png` `app-d-390.png`

## 決着したときの片付け

1. `MEMBER_STANDARD_STYLES` から負けた方式を削除
2. 対応する分岐（`applyMemberStandardPlacement` の styleId 分岐・`memberStandardCardHtml`）を削除
3. `style.css` の `18b` セクションから不要なクラスを削除
4. 1つに決まったら `index.html` の設定 select 行ごと削除し、`initMemberStandardStyleSetting()` も削除
