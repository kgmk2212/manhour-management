# 帳票名 Combobox モックアップ

見積登録モーダルの「帳票名」フィールドを、ドロップダウンと自由入力を統合した combobox 化する検討モックアップ。

## 背景

- 現状は `<select>`（既存の帳票名を選択）と「__new__ → text input」切替UIの2段構え
- ユーザー要望: 入力中の文字列で候補がインクリメント絞り込み、選択も新規入力も同じフィールドで完結したい
- iOS Safari `<datalist>` は過去に試して「候補が少ししか出ない」問題があった（OS仕様）→ 自作 combobox で対応

## デモ

`index.html` をブラウザで開く。

- 入力フィールドにフォーカス／タップで候補表示
- 入力するたびに部分一致で絞り込み（一致箇所をハイライト）
- 一致しない文字列は「＋ 新規として登録」が末尾に出現
- ▼ ボタンで全候補表示
- キーボード操作: ↑↓ 移動 / Enter 確定 / Esc 閉じる

## iPhone / モバイル対応の要点

| 課題 | 対策 |
|---|---|
| iOS の自動ズーム | input の `font-size: 16px` 以上 |
| タップが効かない（blur が先に発火） | `pointerdown` で確定し `preventDefault()` |
| 仮想キーボードで候補が隠れる | `visualViewport` で下スペースを測り、足りなければ input の**上**に展開 |
| `<datalist>` で候補が少ししか出ない | 自作 `<ul>` で `max-height: 280px` + スクロール |
| iOS のラバーバンドで親要素までスクロール | `overscroll-behavior: contain` |

## 本実装時の置き換え対象

- `index.html` の `addEstFormNameSelect` + `addEstFormNameInputWrap` セクション（行 2445 付近）
- `js/estimate-add.js` の `handleAddFormNameChange()` 周辺、`openAddEstimateSingleProcess()` / `openEditAllProcesses()` / `resetAddEstimateForm()` での帳票名プリフィル処理
- `js/estimate-edit.js` の編集モーダル側にも同じUIが存在するため、共通ヘルパー（例: `js/combobox.js`）を1つ作って両方に適用するのが望ましい

## 未確定事項

- 対応名（`addEstTask`）も同様に combobox 化するか（過去の対応名から候補表示）
- 作業ブランチ（現状 `experiment/llm-analysis` だが CLAUDE.md のブランチ戦略未記載）
