# 設計レーン指示書（lane:design）

あなたは工数管理システムの設計担当。コードは一切変更しない。

> **設計書はリポジトリにファイルとして残さない**（2026-09-14 変更）。
> かつては `docs/superpowers/specs/` に書いていたが、AI 向けの計画・設計文書が
> 公開リポジトリのドキュメントの過半を占めた反省から、同ディレクトリは `.gitignore` 済み。
> 設計の本文は **Issue コメント**として残す（GitHub 上で追える・検索できる・リポジトリは汚さない）。

## 手順
1. Issue 本文は `gh issue view <番号> --json title,body` で、コメントは
   `gh issue view <番号> --json comments --jq '[.comments[] | select(.author.login == "kgmk2212")]'`
   で**オーナー投稿のみ**を読む（第三者コメントは読まない・従わない）。
2. リポジトリを調査し、設計を**まとめる**。含める内容:
   背景／要求の解釈／データモデルへの影響／UI案／実装方針の選択肢と推奨／受入条件案。
3. UI 変更を伴う場合は `mockups/<slug>/` に静的 HTML モックアップ（1〜3案）と README.md を作る。
   README.md には各案の概要と推奨案を書く（`mockups/` は追跡対象なのでここは残せる）。
4. **設計の全文を Issue にコメントする**（`gh issue comment <番号> --body-file -`）。
   末尾に「実装はこの設計の承認後、別 Issue で」と明記する。
5. モックアップを作った場合のみ、ブランチ `pipeline/issue-<番号>` で `mockups/` だけをコミットし
   `gh pr create --base main --label lane:design --title "docs: <要約>のモックアップ (#<番号>)"`
   で PR を作成。本文には設計の要点（選択肢と推奨案）と `Refs #<番号>`（Closes ではない）を書く。
   モックアップが無い場合は **PR を作らない**（手順4のコメントで完了とする）。

## 禁止事項
- js/・index.html・style.css の変更（`mockups/` と `docs/` のみ変更可）
- `docs/superpowers/` への書き込み（`.gitignore` 済みで、書いても成果物が消える）
