# アプリアイコン デザイン案

現状のfaviconは `📊` 絵文字の仮置きのみ（`index.html` の `<link rel="icon">`）。
Fable にブランドカラー（アクセントグリーン `#2D5A27` / アンバー `#C4841D`、`style.css` 定義）を基調にした
アプリアイコン案を作成させ、方向性の異なる6案を比較検討用にまとめたもの。

一覧プレビュー: `gallery.html`（ブラウザで開くと6案を並べて確認できる）

## 案一覧

| ファイル | 名前 | コンセプト |
|---------|------|-----------|
| `icon-1-clock-chart.svg` | 時計とグラフ | 「時間（工数）」の時計と「集計・分析」の棒グラフを対角に配置。時計の針と最も伸びた棒だけアンバーで視線を集める。 |
| `icon-2-gantt-bars.svg` | ガントバー | 段違いに並ぶ3本の横棒でガントチャート／スケジュールを象徴。最後の1本をアンバーにして「進行中のタスク」を示す。 |
| `icon-3-progress-ring.svg` | 進捗リング | 「見積に対する実績の消化率」を示す進捗リング＋中央のチェックで完了・承認のニュアンス。 |
| `icon-4-calendar-check.svg` | カレンダーチェック | 日々の実績記録・休暇登録という日付単位の入力を、カレンダー＋チェックマークで表現。 |
| `icon-5-frame-and-fill.svg` | 枠と実 | 「見積＝枠（アウトライン）」と「実績＝実（塗り）」の2つの角丸四角を重ね、両者のズレを見る工数管理の本質を抽象化。 |
| `icon-6-timesheet-grid.svg` | タイムシート | 3×3のマス目でタイムシート（工数入力表）を象徴。入力済み＝深緑、今日＝アンバー、未来＝枠線のみで描き分け。 |

## 状態

**採用済み（2026-09-13）**: 案1「時計とグラフ」を favicon として採用。
`index.html` の `<link rel="icon">` を `icon-1-clock-chart.svg` の内容に差し替え済み。
設計判断の詳細は `docs/superpowers/specs/2026-09-13-app-icon-design.md` を参照。

**iOS ホーム画面アイコン追加（2026-09-15）**: iPhoneで「ホーム画面に追加」した際にアプリアイコンが
表示されるよう、`apple-touch-icon.png`（180×180、リポジトリ直下）を追加し `index.html` に
`<link rel="apple-touch-icon">` を追加。iOS側で角丸マスクを自動適用するため、favicon版と異なり
角丸なしの正方形フルブリード版（`apple-touch-icon-source.svg`）を元にラスタライズしている。

**テーマカラー追従（2026-09-17）**: アプリ設定の「テーマカラー」（9色: forest/ocean/violet/amber/ink/
deep-blue/rose/teal/slate）を切り替えると、favicon・iOSホーム画面アイコンも**背景色だけ**が
そのテーマの `accent` に追従する。

**追従するのは背景色だけ**（アイコンのアイデンティティを保つための設計ルール）:

| 部位 | 色 |
|------|-----|
| 背景（角丸正方形 / フルブリード正方形） | テーマの `accent`（可変） |
| 時計の円周・棒グラフ1〜2本目 | `#EBF5EA`（**固定**） |
| 時計の針・棒グラフ3本目 | `#C4841D` アンバーの差し色（**固定**） |

時計・グラフの配色まで `accentLight` に差し替えると、採用時の「針と最も伸びた棒だけアンバーで
視線を集める」という案1の骨格が失われ、テーマごとに別のアイコンに見えてしまう。差し色はブランド側の
固定要素として扱い、テーマは背景のみで表現する。forest テーマの出力は採用時（2026-09-13）の
オリジナルと完全に一致する（favicon は `tests/theme.test.js` で固定、`apple-touch-icon.png` は
2026-09-15 版とバイト一致）。

- favicon: `js/theme.js` の `buildFaviconDataUri(accent)` が都度SVGを生成しdata URIとして差し込む
  （画面表示中に切替可能）。図形の色は同ファイルの `ICON_FIGURE_COLOR` / `ICON_HIGHLIGHT_COLOR` に固定。
  `index.html` の `<link rel="icon">` に書かれた静的data URIは forest 版と同一内容で、
  JS読み込み前の初期表示を担う
- apple-touch-icon: iOSの「ホーム画面に追加」はhref先を一度だけ取得して固定するため、data URIではなく
  `apple-touch-icon-<テーマ名>.png`（forestのみ従来通り`apple-touch-icon.png`）をテーマごとに事前生成し
  リポジトリ直下に配置。`scripts/generate-app-icons.mjs` で再生成できる（テーマの `accent` を変更した場合は
  `js/theme.js` の `THEME_COLORS` と同スクリプト内の `THEME_ACCENTS` を両方更新してから再実行すること）

## 採用時のメモ

- 各SVGは `viewBox="0 0 100 100"` の自己完結ベクターで、外部フォント・外部リソースは未使用。
  favicon（`index.html` の `<link rel="icon">`）や PWA アイコンにそのまま利用可能。
- 採用案が決まったらADRを作成し、このREADMEおよびADRから相互リンクすること（プロジェクトのモックアップ運用ルールに準拠）。
- 本フォルダの作成・統合作業は `js/` / `index.html` / `style.css` を伴わないため、
  `scripts/worktree.sh` による隔離worktreeは対象外（モックアップ追加のみ）。ただし採用に伴う
  `index.html` の favicon 差し替え自体はコード変更であり、別途 `docs/superpowers/specs/2026-09-13-app-icon-design.md` に記録している。
