# 常時 worktree 運用（1修正 = 1 worktree）設計書

- 日付: 2026-09-14
- ステータス: 調査完了・設計提案（**未適用**。CLAUDE.md 反映はユーザー承認待ち）
- 対象ライン: `experiment/ui-scaling`（現行の正系開発ライン）
- 契機: 2026-09-14、本セッションが `manhour-ui-scaling` を直接編集している最中に、
  別セッションが同一 worktree で `js/ui.js` / `js/utils.js` を編集・コミットした
  （reflog `HEAD@{0}`〜`HEAD@{4}` の5コミットはいずれもこの worktree でのローカルコミット）
- 関連: `2026-08-19-parallel-session-merge-design.md`（parallel-mode 本体）、
  `2026-08-20-claims-layer-design.md`（claims 層）
- 成果物: `scripts/worktree.sh`

---

## 1. 調査結果: 既存 parallel-mode は macOS 上に存在しない

| 確認項目 | 結果 |
|---|---|
| `.shared/` ディレクトリ | `/Users/kmori/Documents/work/` 配下に **存在しない**（`find` で0件） |
| `.shared/hooks/inject-dev-flow.py` | 存在しない |
| `parallel-mode.on` / `claims.on` フラグ | 存在しない |
| `/start-work` `/integrate` `/parallel-mode` `/verify-ui` | コマンド定義ファイルが**どこにも存在しない** |
| `manhour-ui-scaling/.claude/` | `scheduled_tasks.lock` のみ。`commands/` も `settings.json` も無い |
| `manhour-management/.claude/commands/` | `deploy.md` 1件のみ（実ディレクトリ。symlink ではない） |
| ユーザー全体設定 `~/.claude/commands/` | `cc-sm` / `export-chat` / `serve-local` / `sync-all-logs` の4件のみ |
| `~/.claude/settings.json` の hooks | `inject-dev-flow.py` の登録は無い（export-chat 等の汎用 hook のみ） |
| 実在する worktree | `manhour-management`(main) と `manhour-ui-scaling` の **2つだけ**。CLAUDE.md が挙げる redesign / sandbox / impl / analytics / fixes の worktree は**どれも無い**（ブランチは存在する） |

### 原因

実装計画 `docs/superpowers/plans/2026-08-19-parallel-mode.md` の全パスが
`D:/CCwork/.manhour-management-worktrees/...`（Windows）である。`.shared/` は
**git 管理外**（設計書 §4.3 に「`.shared` は git 管理外であることを確認済み」と明記）だったため、
リポジトリを macOS に移した際にコマンド・hook・フラグの実体が一切引き継がれなかった。

git 管理されたのは CLAUDE.md の記述と設計書だけで、それが現在「文書は仕組みを指すが、
仕組みの実体が無い」状態を生んでいる。**CLAUDE.md の parallel-mode 節と worktree 削除注意書きは
現在まるごと死んだ記述**である。

さらに `cmd /c rmdir` という junction 解除手順も Windows 専用で、macOS では意味を持たない。
そもそも macOS/APFS の symlink は `rm -rf` がリンクを辿らないため、
2026-08-19 の「junction 越しに実体が消える」インシデントは**この環境では再現しない**。

## 2. 判定: 既存 parallel-mode はそのまま転用できない

| 観点 | 判定 |
|---|---|
| 実体の有無 | ✗ 移植が必要（コマンド3件 + hook を macOS 向けに書き直す必要がある） |
| 「並行時のみ隔離」前提への依存 | 依存は**弱い**。フラグを常時 ON にすれば常時運用になる設計で、分岐自体は本質ではない |
| フラグ機構の要否 | ✗ **不要**。フラグは「元に戻せること」(R3) と「既存セッションとの切替」のための過渡的装置。
  常時運用が既定ならフラグは複雑さを足すだけで、`.shared/` が git 管理外である以上また消える |
| claims 層 | ✗ 現時点では不要。claims は「台帳項目の二重着手」対策であり、今回の「同一 worktree の同時編集」とは別問題 |
| ff-only による直列化 + rebase | ✓ **そのまま採用**。設計の核はここで、これは環境非依存に正しい |

結論: **設計思想（1セッション=1 worktree=1短命 feature ブランチ、rebase→検証→ff-only→掃除）は
そのまま採用し、実装は「git 管理下の1本のシェルスクリプト」に置き換える。**
フラグ・hook・`.shared/` は再構築しない。

理由: `.shared/` 方式が失われた根本原因は「運用の要が git 管理外にあったこと」なので、
同じ構造を作り直せば環境が変わるたびに再消失する。`scripts/worktree.sh` としてリポジトリに
コミットすれば、clone した全環境に自動で付いてくる。

## 3. 実装: `scripts/worktree.sh`

```
bash scripts/worktree.sh start <topic>    # 隔離 worktree を作成し、パスを stdout に出力
bash scripts/worktree.sh finish [--no-test] [--no-push]
bash scripts/worktree.sh list             # 残存 feature worktree の一覧（掃除漏れ検出）
bash scripts/worktree.sh drop <topic>     # 統合せず破棄
```

### 配置

- 一時 worktree: `/Users/kmori/Documents/work/.manhour-worktrees/feature-<topic>`
  （既存 worktree 群と同階層の隠しディレクトリ。置き場は「主 worktree の親」から算出するため、
  隔離 worktree の中から実行しても入れ子にならない）
- ブランチ: `feature/<topic>`（origin へは push しない短命ブランチ。名前衝突時は `-2`, `-3` と繰り上げ）

### finish の手順（本線を壊さない設計）

1. feature worktree に未コミット変更が無いことを確認（**自動コミットはしない** = 巻き込み防止）
2. 本線を `origin/experiment/ui-scaling` へ ff（パイプラインが直接 push するため必須）
3. `git rebase --empty=drop experiment/ui-scaling`
4. 差分に `js/` `index.html` `style.css` `tests/` `scripts/` が含まれれば `npm test`
5. `git merge --ff-only feature/<topic>`（本線 worktree 側で実行 = 統合の直列化）
6. `git push origin experiment/ui-scaling`
7. 掃除: symlink 解除 → `worktree remove --force` → `branch -d`、続けて残存一覧を報告

**本線 worktree では `reset` / `checkout --` / `clean` / `stash` を一切実行しない。**
本線が dirty でも停止させず警告のみ出し（`.serena/project.yml` のようなツール由来の差分が
常時あるため）、実際にマージが弾かれたときだけ中止してユーザーに報告する。

### macOS 向けの安全な削除手順

```bash
# .claude/commands が symlink なら「リンクだけ」を外してから worktree を削除
[ -L "$wt/.claude/commands" ] && rm -f "$wt/.claude/commands"
git -C "$main" worktree remove --force "$wt"
```

`cmd /c rmdir` は使わない。現状 `.claude/commands` は本線 worktree に存在しないため
この分岐は no-op だが、将来 symlink を張った場合に備えて実装してある。
`unlink_claude_commands()` が symlink / 実ディレクトリ / 不在の3ケースを判定する。

### 検証記録（2026-09-14・全 PASS・本線ゼロフットプリント）

代役ブランチ `rehearsal/mainline` を立てて実施（`MANHOUR_MAINLINE` 環境変数で本線を差し替え可能）。

1. **単独往復**: start → コミット → finish で ff 統合・worktree/ブランチとも掃除される ✓
2. **並行統合（同一ファイル）**: A・B 2本が同じファイルを編集。A は ff で統合、
   B は rebase で **add/add CONFLICT を検出して停止**（本線は無変更のまま）✓
3. **コンフリクト解消後の再開**: 解消 → `rebase --continue` → finish 再実行で統合成功。
   最終ファイルに A・B **両方の変更が残存**していることを確認 ✓
4. **掃除**: 代役ブランチ・worktree・`.manhour-worktrees` を全削除。
   `experiment/ui-scaling` は `aaf08a3` のまま無変更 ✓

検証中に発見・修正したバグ2件:
- 一時 worktree の置き場を「本線 worktree の親」から算出していたため、隔離 worktree 内から
  実行すると `.manhour-worktrees/.manhour-worktrees/` に入れ子になっていた
- 掃除で自分の cwd を削除した後に `git` を実行し
  `fatal: Unable to read current working directory` で落ちていた（削除前に `cd "$main"` を追加）

## 4. CI / デプロイとの整合性

- `deploy.yml` は既に `push: branches: [main, 'experiment/**']` を持つ（本ブランチに取り込み済み）。
  したがって `git push origin experiment/ui-scaling` だけで Pages が再デプロイされ、
  **`main` への空コミットは不要**。`finish` はこれに従っている。
- `feature/*` は origin に push しないため、`deploy.yml` も CI も発火しない（余計なデプロイが増えない）。
- `docs/CODEMAP.md` は PostToolUse hook で自動再生成され、`.gitattributes` の `merge=codemap` で
  衝突時は本線側が採用される。rebase でも同ドライバが効くため、常時 worktree 運用でも追加対応は不要。
- アイデア自動実装パイプラインの PR（`pipeline/issue-*`）は GitHub 上でマージされ origin を進める。
  `finish` の手順2（origin へ ff）がこれを毎回取り込むため、既存パイプラインと共存できる。

## 5. CLAUDE.md への反映案（未適用）

### 5-1. 「Worktree構成」節（L23-41）の差し替え

実在するのは2つだけなので表を実態に合わせ、死んだ Windows 注意書きを削除する。

```markdown
### Worktree構成

| ディレクトリ | ブランチ | 用途 |
|-------------|---------|------|
| `manhour-management` | `main` | デプロイ起点（主 worktree。`.git` の実体を持つ） |
| `manhour-ui-scaling` | `experiment/ui-scaling` | **現行の正系開発ライン。統合専用** |
| `.manhour-worktrees/feature-<topic>` | `feature/<topic>` | 修正1件ごとの一時 worktree（`scripts/worktree.sh` が作成・削除） |

> 他の experiment/* ブランチ（redesign / sandbox / redesign-impl / analytics / fixes）は
> ブランチのみ存在し、worktree は現在存在しない。必要になったら `git worktree add` で作る。

> **⚠️ worktree 削除の注意**: `.claude/commands` が symlink の場合は
> `rm -f <worktree>/.claude/commands` でリンクだけ先に外してから削除する
> （`scripts/worktree.sh` は自動で判定する）。Windows 時代の `cmd /c rmdir` 手順は
> この環境では不要。
```

### 5-2. 「開発フロー」節（L147〜）の差し替え

`.shared/hooks/inject-dev-flow.py` は存在しないので、その言及ごと置き換える。
**手順0 を先頭に置く**のが要点（現状は「実動作検証」が1番目で、隔離の指示がどこにも無い）。

````markdown
## 開発フロー（隔離 → 検証 → 統合）

> **絶対ルール**: `manhour-ui-scaling` を直接編集しない。統合専用ディレクトリとする。
> コード修正（`js/` / `index.html` / `style.css` / `tests/`）を伴うタスクは、
> 1件ごとに必ず専用 worktree に隔離する。

0. **隔離（着手前に必ず実行）**:
   ```bash
   bash scripts/worktree.sh start <topic>   # 出力されたパスが作業ディレクトリ
   ```
   以後このタスクの Read/Edit/Write・テスト・検証は**すべてそのパス配下**で行う。
1. **実装**: 隔離 worktree 内で実装し、自分が編集したファイルのみ明示ステージしてコミット
   （`git add <file>...`、`-A` 禁止）。
2. **実動作検証**: Playwright による実ブラウザ検証で修正が効いていることを機械判定する。
   PASS するまで「完了」と報告しない。
3. **統合**:
   ```bash
   bash scripts/worktree.sh finish
   ```
   rebase → `npm test` → ff-only マージ → push（Pages 再デプロイ発火）→ worktree 削除まで自動。
   rebase コンフリクトで停止した場合は、自タスクと本線側の意図を両立する形で解消し
   `git rebase --continue` 後に `finish` を再実行する。両立の判断がつかなければ
   `git rebase --abort` してユーザーに報告し停止する（勝手にどちらかを捨てない）。

**隔離が不要なタスク**: 質問・調査のみ、`docs/` のみの更新。ただし判断に迷ったら隔離する
（隔離のコストはほぼゼロ、衝突のコストは大きい）。

**掃除漏れの確認**: `bash scripts/worktree.sh list`
````

### 5-3. 「作業前の確認事項」節（L43-48）の差し替え

````markdown
### 作業前の確認事項

```bash
git branch --show-current              # experiment/ui-scaling なら「まだ隔離していない」
bash scripts/worktree.sh list          # 前回の掃除漏れがないか
```

現在地が `manhour-ui-scaling` でコード修正を頼まれたら、**編集を始める前に**
`bash scripts/worktree.sh start <topic>` を実行する（開発フロー 手順0）。
````

### 5-4. 「並列セッション統合機構（parallel-mode）」節（L157-173）

**削除**（実体が存在せず、常時 worktree 運用に置き換わるため）。
経緯は本設計書と `2026-08-19-parallel-session-merge-design.md` に残る。

## 6. 想起させるための配置意図

Claude Code のセッションは CLAUDE.md を先頭から読むため、**隔離の指示が「開発フロー」の
手順0 かつ節冒頭の絶対ルールとして置かれていること**が要点になる。現状の CLAUDE.md は
parallel-mode 節が「フラグがある間だけ」という条件付き記述なので、
フラグを確認 →無い →在来フロー、と読んで直接編集に進んでしまう。条件分岐を消して
無条件の絶対ルールにするのが、想起率を上げる最大の要因。

hook による毎ターン注入（旧 `inject-dev-flow.py` 相当）は、必要なら
`~/.claude/settings.json` の UserPromptSubmit に追加できるが、
**git 管理外の設定に運用の要を置くと再び失われる**ため、本設計では採用しない。

## 7. 決定事項（2026-09-14 ユーザー承認）

1. **CLAUDE.md の書き換え**— 適用済み。§5-1〜5-3 の文案どおり反映し、§5-4（parallel-mode 節）は削除した。
2. **`scripts/worktree.sh` のコミット**— コミット済み。以後 feature worktree 内からも
   （checkout に含まれるため）呼び出せる。
3. **実在しない worktree の表記**— 実態（2つ）に合わせた。他の experiment/\* は
   「ブランチのみ存在、必要になったら `git worktree add`」と明記。
4. **`/verify-ui` の不在**— `npm run e2e`（Playwright、`tests/e2e/` の既存14 spec）で代替する方針を採用。
   `scripts/worktree.sh finish` は `js/`/`index.html`/`style.css` の変更時に
   `npm test`（単体）→ `npm run e2e`（実ブラウザ）の順で実行するよう更新済み。
5. **他セッション・パイプラインへの適用**— 本運用は「人が起動する Claude Code セッション」が
   CLAUDE.md を読んで初めて効く。既に起動済みのセッションには適用されないため、
   切替は区切りで行う（このセッションが完了報告した時点で以後の新規セッションから有効）。
```
