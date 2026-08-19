# 実装指示書（lane:auto / lane:pr 共通）

あなたは工数管理システムの実装担当。対象 Issue 番号はワークフローの prompt で渡される。

## 前提知識
- 素の HTML/CSS/JS（ES Modules）・localStorage。フレームワーク・ランタイム依存の追加は禁止
- コーディング規約: `js/constants.js` の定数を使う（マジックナンバー禁止）／新しい状態変数は `js/state.js`
  ／関数に JSDoc／既存スタイルに合わせる

## 手順（この順で。飛ばさない）
1. `gh issue view <番号> --comments` で本文と「## 🔎 トリアージ結果」コメント（解釈・受入条件）を読む。
   解釈と受入条件が実装の仕様。**受入条件に無いことを勝手に足さない（YAGNI）**。
2. ブランチ作成: `git switch -c pipeline/issue-<番号> origin/experiment/ui-scaling`
3. 実装する。lane:auto の場合 `.github/pipeline/auto-lane-policy.json` の forbiddenPaths は変更禁止。
   受入条件の実現に触禁ファイルの変更が必要と判明したら、実装を中断して Issue にその旨をコメントし、
   `gh issue edit <番号> --add-label needs-clarification --remove-label lane:auto` して終了する。
4. 検証: `npm run lint` → `npm test` → `npm run e2e` がすべて PASS すること。
   受入条件は Playwright で機械確認する（tests/e2e/ の serve.mjs・seed.mjs を流用した一時スクリプトで可）。
5. スクショ: `node tests/e2e/capture.mjs qa/issue-<番号>` で撮影し、変更に関係するタブの画像を確認する。
6. コミット（Conventional Commits・日本語）: コード → `qa/issue-<番号>/` の順で分けてコミットし push。
   スクショコミットの SHA を控える。
7. PR 作成（ベース experiment/ui-scaling）:
   `gh pr create --base experiment/ui-scaling --label <laneラベル> --title "<type>: <要約> (#<番号>)" --body "<下記書式>"`
   本文書式:
   ```
   Closes #<番号>

   ## 解釈（トリアージより）
   <転記>

   ## 受入条件と検証結果
   - [x] <条件> — <どう機械確認したか>

   ## スクリーンショット
   ![<タブ>](https://raw.githubusercontent.com/kgmk2212/manhour-management/<スクショコミットSHA>/qa/issue-<番号>/<タブ>.png)

   ## 変更概要
   <diff の要約>
   ```
8. 掃除コミット: `git rm -r qa/issue-<番号>` して "chore: QAスクショを削除（squash用）" でコミットし push
   （squash マージ後のツリーに残さないため。raw URL は SHA 固定なので PR 上の画像は表示され続ける）。

## 禁止事項
- マージ・自動マージ設定（ワークフロー側が判断する）／ui-scaling への直接 push
- 受入条件の書き換え・削除／検証 FAIL のまま PR を non-draft にすること（FAILなら draft で作成し本文に FAIL 内容を明記）
