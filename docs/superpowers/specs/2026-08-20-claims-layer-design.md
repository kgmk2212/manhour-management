# parallel-mode claims 層（着手宣言による二重着手の可視化）設計書

- 日付: 2026-08-20
- ステータス: 承認済み・実装（2026-08-20）
- 親設計: `2026-08-19-parallel-session-merge-design.md`（parallel-mode 本体）
- 契機: 2026-08-20 に2セッションが同一の Undo/Redo P1 へ二重着手する実害
  （worktree の隔離は「作業空間の衝突」を防ぐが「タスク選択の重複」を防がない）

---

## 1. 設計原則（議論で確定した5点）

1. **並列性を最優先** — いかなる仕組みも他セッションの作業をブロックしない。
   すべて「情報提供」であり「ロック」ではない（default-allow）。
2. **類似度判断をゲートに置かない** — 「似ているか」を着手可否の判定に使うと
   誤検知が並列開発を殺す（ホットスポット構造ゆえ UI タスクはほぼ全部ファイルが重なる）。
3. **LLM の判断は、誤っても誰も止まらない場所でだけ使う** — 台帳登録時の重複統合には
   使う（誤統合しても台帳の文言が変わるだけ）。着手ゲートには使わない。
4. **fail-open** — claim の読み書き失敗は無音で素通りし、作業を止める新たな障害にしない。
5. **最終防衛線は git（rebase + ff-only）** — 上の層を何がすり抜けても、
   安全性と並列性の下限は claims 層導入前と同一。

## 2. 実装内容

| # | 変更 | 内容 |
|---|------|------|
| 1 | `.shared/claims/`（新規） | 着手宣言の置き場。1タスク=1ファイル、4行（topic/branch/backlog/started） |
| 2 | `.shared/hooks/claims.on`（新規フラグ） | claims 層のキルスイッチ。無ければ全構成要素が自己無効化 |
| 3 | `.shared/commands/start-work.md` | 手順0を追加: 既存 claim 一覧確認 → BACKLOG ID の対応付け（確信できる場合のみ。迷ったら「なし」）→ 同一 ID があっても停止せず「切替 or 分担宣言」を自分で選んで続行 → claim 作成 |
| 4 | `.shared/commands/integrate.md` | rebase を `--empty=drop` に（本線で統合済みの同一内容コミットを機械的に除去。LLM 判断での手動 drop は禁止）。掃除手順に claim 削除、残存報告に「worktree なき claim」列挙を追加 |
| 5 | `.shared/hooks/inject-dev-flow.py` | parallel-mode 文言の末尾に着手中 claim 一覧を1行付加（claims.on と claim ファイルが両方あるときのみ。「参考情報。分担判断以外で行動を変えない」と明記） |
| 6 | `.shared/commands/parallel-mode.md` | `claims-on` / `claims-off` サブコマンドと status への claim 一覧追加 |
| 7 | `docs/BACKLOG.md` | 全項目に通し番号 `[B-nnn]`（再利用禁止・次番号を冒頭に明記）。登録規律4項を冒頭に追記（同根検索・file:line アンカー・修正時の同根クローズ・ID 付与） |

## 3. 意図的にやらないこと

- **同一 ID での自動停止・確認質問**（Level 2）— 実事例が示したのは「早く気づけば
  セッションは衝突を自力で分担に転換できる」。必要なのは停止ではなく情報。
  可視化で重複が再発することが観測されてから再検討する。
- **類似度・ファイル重複での停止** — 恒久不採用（原則2）。
- **BACKLOG への担当ブランチ書き込み方式**（当初案）— feature ブランチ内の編集は
  /integrate まで他セッションから見えず、予約として機能しないため不採用。
  claim は git 管理外の `.shared/` に置くことで全 worktree から即時可視になる。
- マージキュー自動化・セッション間直接通信・ファイルロック（親設計 §9 を維持）。

## 4. 防御の全体像

| 重複の型 | 防ぐ層 | すり抜けたときの受け皿 |
|---|---|---|
| 同じ台帳項目の二重着手 | claim 可視化で着手前に自律回避 | rebase（--empty=drop）で顕在化 |
| 別 ID・同内容の双子エントリ | 登録規律（同根検索 + file:line） | rebase で顕在化 |
| 台帳外タスク同士の偶然の重複 | 防がない（意図的な見逃し） | rebase で顕在化 |

## 5. 元に戻す手順

| レベル | 操作 | 効果 |
|--------|------|------|
| 即時キルスイッチ | `/parallel-mode claims-off`（= `claims.on` 削除1つ） | 次のプロンプトから hook 注入が claims 層導入前と byte 同一に戻り、start-work 手順0 も自己無効化。claim 残骸は無害 |
| 完全撤去 | claims.on 削除 + `.shared/claims/` 削除 + `start-work.md` / `integrate.md` / `parallel-mode.md` / `inject-dev-flow.py` を各 `.orig-20260820` から復元 + BACKLOG/CLAUDE.md/本設計書のコミットを revert | 2026-08-19 導入時の parallel-mode に完全復帰 |

## 6. 検証記録（2026-08-20 実施・全 PASS）

1. **byte 同一性**: `claims.on` 無し／フラグ有り claim ゼロ件／claims ディレクトリ消失時、
   のいずれも hook 出力が `.orig-20260820` と byte 同一（cmp で機械確認）
2. **claim 行の付加**: フラグ + claim ファイル存在時のみ
   `[着手中claim] <topic>（backlog: B-nnn, <日時>〜）…` が付加される
3. **実地リハーサル**: 本設計書を含む docs 変更自体を新フロー
   （手順0 で claim 作成 → feature/claims-layer 隔離 → /integrate で claim 削除）で統合
