# スケジュール機能 UI スケーリング対応 設計書

- 日付: 2026-05-24
- ブランチ: experiment/ui-scaling
- 関連ファイル: `js/schedule-render.js`, `style.css`（`.gantt-*` / `.schedule-*` 群）

## 背景・目的

スケジュール画面のガントチャートが解像度（WQHD/4K）で「全てが小さく見える」問題を解消する。
原因はガント本体が HTML canvas で描画されており、フォントサイズ・行高・バー高など全ての寸法が JS 内に hardcoded px で書かれており、CSS 変数 `--ui-scale` を一切参照していないため。

## 設計方針（案A: ユニフォーム拡縮）

スケジュール画面の全ての可変寸法を `--ui-scale` で連動させ、解像度問わず**見た目の比率が完全に一致**するように再設計する。表示日数は据え置きで構わず、「拡大した分そのまま大きく見える」状態を目指す。

## 実装範囲

### 1) `js/schedule-render.js` — canvas 描画側

- レンダリング前に `getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')` を取得し `parseFloat`
- スケール値をクラスのインスタンス変数 `this.uiScale` として保持
- 全 hardcoded px に `this.uiScale` を乗算
  - フォントサイズ: `10〜13px` 系すべて
  - 行高 / バー高
  - パディング / マージン / オフセット
  - canvas の論理サイズ計算: 既存 `* this.dpr` に加えて `* this.uiScale` も適用
- リサイズ時にも再取得（ウィンドウ移動で別ディスプレイへ移行する場合に追随）

### 2) `style.css` — `.gantt-*` / `.schedule-*` 群

- 以下を `calc(Npx * var(--ui-scale))` 化
  - `.gantt-day-header { min-width: 36px; padding: 6px 0 }`
  - `.gantt-day-cell { min-width: 36px }`
  - `.gantt-row { min-height: 44px }`
  - `.gantt-row-label { width: 180px; padding: 10px 14px }`
  - `.gantt-bar { height: 26px }`
  - 関連する `padding` / `gap`
- font-size はすでに `--ui-scale` 対応済みのものはそのまま

### 3) 例外（スケールしない）

- **1px borders** (`border: 1px solid`) — 整数 px のまま。スケールすると亜画素ぼやけが発生する
- `border-radius` の小さい値（≤ 6px）— 視覚的影響が小さく据え置きで OK
- `box-shadow` のオフセット — 大画面でも影が極端に大きくなるのは不自然なので据え置き

## 検証

- `--ui-scale` を 0.85 / 1.00 / 1.20 / 1.30 の 4 段で切り替えてブラウザで確認
- 各スケールで以下が崩れないこと
  - 行内のテキスト位置（バー上のラベルが中央寄せのまま）
  - 日付ヘッダと日付セルの幅一致
  - スクロール位置の保持
- WQHD 実機でスケジュール画面が「全体として大きく」見え、ガント本体だけ小さい違和感が消えていること

## YAGNI（今回やらないこと）

- 密度切替トグル（コンパクト/標準/拡大）→ 必要になったら後追加
- ユーザーごとの倍率設定保存
- ガントの仮想スクロール最適化
