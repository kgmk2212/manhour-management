# parallel-mode（並列セッション統合機構）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 複数 Claude Code セッションの並列作業を「1セッション=1worktree=1短命 feature ブランチ + ff-only 直列統合」で安全にマージ可能にし、フラグ1つで現行運用に即復帰できる形で導入する。

**Architecture:** UserPromptSubmit hook（inject-dev-flow.py）をフラグファイル分岐にし、フラグ ON 時のみ ui-scaling 系 worktree に /start-work（隔離）→ /integrate（rebase→検証→ff-onlyマージ→deploy→掃除）のフロー文言を注入する。コマンド実体は `.shared/commands/` の指示 markdown（既存 verify-ui/deploy と同形式）。アプリコードには一切触れない。

**Tech Stack:** Python 3（hook）、git worktree / rebase / merge --ff-only、Claude Code コマンド markdown、PowerShell junction

**Spec:** `docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md`

## Global Constraints

- `.shared/` は **git 管理外**（確認済み）。変更前バックアップ `inject-dev-flow.py.orig-20260819` が唯一の復元手段。`.shared` 配下のファイルにはコミット手順が無い。
- 本番フラグ `.shared/hooks/parallel-mode.on` は**全タスクを通して作成しない**（OFF のまま納品。ON はユーザーの合図後）。hook のフラグ挙動テストは scratchpad 上のコピーで行う。
- `experiment-ui-scaling` worktree（以下 UIS = `D:/CCwork/.manhour-management-worktrees/experiment-ui-scaling`）には**他セッションの未コミット変更が実在する**。UIS で `reset` / `checkout --` / `clean` / `stash` を実行することを禁止。UIS のファイルは CLAUDE.md と docs/ 以外編集しない。
- リハーサルは本線 `experiment/ui-scaling` に一切コミットを載せない（代役ブランチ `rehearsal/mainline` 方式。設計書 §7.5 の「revert で痕跡を消す」より安全側に変更）。
- コミットは対象ファイルのみ `git add <file>` で明示ステージ（`-A` 禁止）。メッセージ末尾に `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`。
- フラグ OFF 時の hook 出力は改修前と **byte 同一**であること（diff で機械確認）。

## File Structure

| 操作 | パス | 責務 |
|------|------|------|
| Modify | `.shared/hooks/inject-dev-flow.py` | フラグ有無 + CWD で注入文言を選択（無ければ従来文言を逐語） |
| Create | `.shared/hooks/inject-dev-flow.py.orig-20260819` | 改修前原本のバックアップ（完全撤去用） |
| Create | `.shared/commands/parallel-mode.md` | フラグの on/off/status トグル（キルスイッチ） |
| Create | `.shared/commands/start-work.md` | 隔離 worktree + feature ブランチ作成手順 |
| Create | `.shared/commands/integrate.md` | rebase→検証→ff-onlyマージ→deploy→掃除の統合手順 |
| Modify | `CLAUDE.md` | parallel-mode 運用の説明（開発フロー節の直後） |
| Modify | `docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md` | ステータス更新とリハーサル方式の追記 |

ランタイム状態（成果物ではない）: `.shared/hooks/parallel-mode.on`（フラグ）、`feature-*` worktree・ブランチ。

---

### Task 1: hook のフラグ分岐化（byte 同一保証つき）

**Files:**
- Modify: `.shared/hooks/inject-dev-flow.py`
- Create: `.shared/hooks/inject-dev-flow.py.orig-20260819`
- Test: scratchpad `hooktest/` での実行比較（リポジトリ外・コミットなし）

**Interfaces:**
- Consumes: なし
- Produces: フラグファイルパス `.shared/hooks/parallel-mode.on`（Task 2 の /parallel-mode が操作）、PARALLEL_TEXT が参照するコマンド名 `/start-work` `/integrate`（Task 3/4 が実体を提供）

- [x] **Step 1: 改修前出力をキャプチャ（テストの期待値）**

```bash
SH=D:/CCwork/.manhour-management-worktrees/.shared/hooks
SP="<scratchpad>/hooktest"   # scratchpad はセッションの scratchpad ディレクトリ
mkdir -p "$SP"
echo '{}' | python "$SH/inject-dev-flow.py" > "$SP/before.json"
cat "$SP/before.json"   # FLOW_TEXT の JSON が出ること
```

- [x] **Step 2: 原本バックアップを作成**

```bash
cp "$SH/inject-dev-flow.py" "$SH/inject-dev-flow.py.orig-20260819"
diff "$SH/inject-dev-flow.py" "$SH/inject-dev-flow.py.orig-20260819" && echo BACKUP-OK
```

- [x] **Step 3: hook を以下の内容に書き換える**

FLOW_TEXT は現行と一字一句同一を維持すること（byte 同一性の要）。

```python
#!/usr/bin/env python3
"""UserPromptSubmit hook: manhour-management の開発フロー指示を毎ターン注入する。

parallel-mode フラグ（同ディレクトリの ``parallel-mode.on``）が存在する場合のみ、
ui-scaling 系 worktree（experiment-ui-scaling / feature-*）に並列セッション統合
フロー（/start-work → /integrate）の文言を注入する。フラグが無ければ従来文言を
逐語注入し、挙動は導入前と完全に同一（キルスイッチ。設計書:
docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md）。
出力作法はグローバルの inject-pre-task-check.py と同一
（``ensure_ascii=True`` で cp932 でも壊れない / 失敗時は常に無音 no-op で exit 0）。
"""

from __future__ import annotations

import json
import os
import sys

FLOW_TEXT = (
    "[開発フロー] コード修正タスクは、修正後に Playwright で実動作を検証するまで自動で回す"
    "（手順は /verify-ui 参照。検証が PASS するまで完了と報告しない）。"
    "検証が取れたら /deploy を実行しデプロイ完了まで進める。ここまでユーザーへの確認は不要。"
    "コミットは自分が編集したファイルのみ明示ステージする（他セッション並行作業の巻き込み防止）。"
)

PARALLEL_TEXT = (
    "[開発フロー/parallel-mode] コード修正を伴うタスクは、着手前に /start-work で専用 worktree"
    "（feature/<topic> ブランチ）に隔離してから作業する。すでに feature-* worktree で作業中なら"
    "そのまま続ける。experiment-ui-scaling worktree のファイルは直接編集しない（統合専用）。"
    "修正後は Playwright で実動作を検証（/verify-ui、PASS まで完了と報告しない）。"
    "タスク完了時は /integrate で統合（rebase→検証→ff-onlyマージ→/deploy→worktree掃除）まで"
    "自動で進める。ここまでユーザーへの確認は不要。質問・調査・ドキュメントのみのタスクは隔離不要。"
    "コミットは自分が編集したファイルのみ明示ステージする。"
)

_FLAG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parallel-mode.on")


def _select_text() -> str:
    """フラグと CWD から注入文言を選ぶ。判定に失敗したら常に従来文言に倒す。"""
    try:
        if not os.path.exists(_FLAG_PATH):
            return FLOW_TEXT
        cwd_name = os.path.basename(os.path.normpath(os.getcwd()))
        if cwd_name == "experiment-ui-scaling" or cwd_name.startswith("feature-"):
            return PARALLEL_TEXT
        return FLOW_TEXT
    except Exception:
        return FLOW_TEXT


def main() -> int:
    # stdin は使わないが、パイプを詰まらせないよう drain する。
    try:
        sys.stdin.buffer.read()
    except Exception:
        pass
    try:
        sys.stdout.write(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": _select_text(),
            }
        }, ensure_ascii=True))
        sys.stdout.flush()
    except OSError:
        pass
    return 0


if __name__ == "__main__":
    # 安全網: 想定外の例外もフックブロックにしない。
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
```

- [x] **Step 4: byte 同一テスト（フラグ無し）**

```bash
echo '{}' | python "$SH/inject-dev-flow.py" > "$SP/after-off.json"
diff "$SP/before.json" "$SP/after-off.json" && echo BYTE-IDENTICAL-OK
```
Expected: `BYTE-IDENTICAL-OK`（差分ゼロ）

- [x] **Step 5: フラグ挙動テスト（scratchpad のコピーで実施。本番フラグは作らない）**

```bash
cp "$SH/inject-dev-flow.py" "$SP/inject-copy.py"
touch "$SP/parallel-mode.on"          # コピーの隣に置く＝コピーだけ ON になる
# (a) ui-scaling 系 CWD → PARALLEL_TEXT
cd D:/CCwork/.manhour-management-worktrees/experiment-ui-scaling
echo '{}' | python "$SP/inject-copy.py" | grep -c "parallel-mode"   # 期待: 1
# (b) feature-* CWD → PARALLEL_TEXT
mkdir -p "$SP/feature-dummy" && cd "$SP/feature-dummy"
echo '{}' | python "$SP/inject-copy.py" | grep -c "parallel-mode"   # 期待: 1
# (c) その他 CWD（redesign 等）→ 従来文言
cd D:/CCwork/.manhour-management-worktrees/experiment-redesign
echo '{}' | python "$SP/inject-copy.py" | grep -c "parallel-mode"   # 期待: 0（grep exit 1）
# (d) フラグ削除で従来文言に復帰
rm "$SP/parallel-mode.on"
cd "$SP" && echo '{}' | python "$SP/inject-copy.py" > "$SP/copy-off.json"
diff "$SP/before.json" "$SP/copy-off.json" && echo KILLSWITCH-OK
```
Expected: (a)(b) は 1、(c) は 0、(d) は `KILLSWITCH-OK`

- [x] **Step 6: 本番側にフラグが無いことを最終確認**

```bash
ls "$SH/parallel-mode.on" 2>&1   # 期待: No such file or directory
```

（.shared は git 管理外のためコミットなし）

---

### Task 2: /parallel-mode トグルコマンド

**Files:**
- Create: `.shared/commands/parallel-mode.md`

**Interfaces:**
- Consumes: Task 1 のフラグパス `.shared/hooks/parallel-mode.on`
- Produces: ユーザー/セッションが呼ぶ `/parallel-mode on|off|status`

- [x] **Step 1: 以下の内容でファイルを作成**

```markdown
---
description: 並列セッション統合機構（parallel-mode）の有効化/無効化/状態確認
argument-hint: on | off | status（省略時 status）
---

parallel-mode のトグル。フラグファイル
`D:/CCwork/.manhour-management-worktrees/.shared/hooks/parallel-mode.on`
の有無だけで切り替わる（hook がフラグを見て注入文言を選ぶ）。
設計書: `docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md`

## 手順

`$ARGUMENTS` に応じて以下を実行する（FLAG は上記パス）。

- **on**: `date > FLAG` 相当でフラグを作成（内容は有効化日時1行）。
  報告:「parallel-mode ON。次のプロンプトから、ui-scaling 系 worktree のコード修正タスクは
  /start-work で隔離 → /integrate で統合のフローになります。稼働中の他セッションにも
  次のプロンプトから適用されます。」
- **off**: フラグを削除。報告:「parallel-mode OFF。従来運用（ui-scaling worktree での
  直接編集 + 明示ステージ）に即復帰しました。」（キルスイッチ）
- **status**（既定）: 以下を報告する。
  1. フラグの有無と、有る場合はその内容（有効化日時）
  2. `git worktree list` のうち `feature-` を含む行（残存する隔離 worktree の一覧）

## 注意

- ON への切替は、稼働中セッションが作業の区切りを迎えたタイミングで行うこと
  （切替前に開始したタスクは旧フローのまま完了してよい）。
- 完全撤去の手順は設計書 §6 を参照（hook 原本: `.shared/hooks/inject-dev-flow.py.orig-20260819`）。
```

- [x] **Step 2: 動作確認（status 相当を手で実行）**

```bash
ls D:/CCwork/.manhour-management-worktrees/.shared/hooks/parallel-mode.on 2>&1  # 期待: 無し
git worktree list | grep -i feature   # 現状の feature-* を確認（feature-backup-json-merge が出る想定）
```

---

### Task 3: /start-work 隔離コマンド

**Files:**
- Create: `.shared/commands/start-work.md`

**Interfaces:**
- Consumes: なし（ローカル `experiment/ui-scaling` HEAD をベースにする）
- Produces: `feature/<topic>` ブランチ + `D:/CCwork/.manhour-management-worktrees/feature-<topic>` worktree（Task 4 の /integrate が統合・掃除する対象）

- [x] **Step 1: 以下の内容でファイルを作成**

```markdown
---
description: コード修正タスク用の隔離 worktree（feature/<topic>）を作成して作業をそこへ移す
argument-hint: <topic>（英小文字・数字・ハイフン。省略時はタスク内容から命名）
---

parallel-mode の作業開始コマンド。専用 feature ブランチ + worktree を作り、
以後の編集をそこに隔離する。WTR = `D:/CCwork/.manhour-management-worktrees`。

## 前提チェック

- 現在の作業ディレクトリ名が `feature-` で始まる場合: すでに隔離済み。何も作らず
  「隔離済みのため続行」と報告して終了。
- topic は `$ARGUMENTS`。空ならタスク内容から英小文字・数字・ハイフンで命名する
  （例: `fix-report-label`）。

## 手順

1. **名前衝突の回避**: `git branch --list "feature/<topic>"` と `ls "$WTR"` を確認し、
   既存なら `<topic>-2`, `<topic>-3` … に繰り上げる。
2. **worktree 作成**（ベースはローカル `experiment/ui-scaling` の HEAD）:
   ```bash
   git worktree add -b "feature/<topic>" "$WTR/feature-<topic>" experiment/ui-scaling
   ```
3. **セッション設定の複製**（`.claude/` は gitignore のため checkout に含まれない）:
   ```powershell
   New-Item -ItemType Directory "$WTR/feature-<topic>/.claude" | Out-Null
   Copy-Item "$WTR/experiment-ui-scaling/.claude/settings.json" "$WTR/feature-<topic>/.claude/settings.json"
   New-Item -ItemType Junction -Path "$WTR/feature-<topic>/.claude/commands" -Target "$WTR/.shared/commands" | Out-Null
   ```
4. **作業場所の移動**: 以後、このタスクのファイル読み書き・コマンド実行・/verify-ui は
   すべて `$WTR/feature-<topic>` 内で行う（Bash/PowerShell は `cd`、Read/Edit/Write は
   worktree 内の絶対パスを使う）。`$WTR/experiment-ui-scaling` のファイルはこれ以降編集しない。
5. **報告**: 「`feature/<topic>` に隔離して作業します」と1行で報告して本作業に入る。

## 注意

- タスク完了時は必ず /integrate で統合する（統合しない限り本線には入らない）。
- スクショ等の一時ファイルは worktree 内に置いてよい（/integrate の掃除で worktree ごと消える）。
```

- [x] **Step 2: 記述の静的確認**

junction 作法が memory `worktree-commands-junction` と一致すること、パスが実在することを確認:

```bash
ls -d D:/CCwork/.manhour-management-worktrees/.shared/commands D:/CCwork/.manhour-management-worktrees/experiment-ui-scaling/.claude/settings.json
```

（実動作は Task 6 のリハーサルで検証する）

---

### Task 4: /integrate 統合コマンド

**Files:**
- Create: `.shared/commands/integrate.md`

**Interfaces:**
- Consumes: Task 3 が作る `feature/<topic>` + worktree、既存 `/verify-ui`・`/deploy` コマンド
- Produces: `experiment/ui-scaling` への ff-only 統合と掃除（本線更新は /deploy が push・デプロイ）

- [x] **Step 1: 以下の内容でファイルを作成**

```markdown
---
description: feature ブランチを本線（experiment/ui-scaling）へ rebase→検証→ff-onlyマージ→deploy→掃除で統合
argument-hint: [--no-deploy]（push/Pages 発火を省略。リハーサル・オフライン用）
---

parallel-mode の統合コマンド。verify を通らない変更は本線に入らない。
UIS = `D:/CCwork/.manhour-management-worktrees/experiment-ui-scaling`。

## 前提チェック

- 現在の作業 worktree のブランチが `feature/<topic>` であること
  （`git branch --show-current`）。違う場合は中止して報告。

## 手順

1. **仕上げコミット**: 未コミットの自編集ファイルを明示ステージしてコミット
   （Conventional Commits、`-A` 禁止）。
2. **rebase**（feature worktree 内で）:
   ```bash
   git rebase experiment/ui-scaling
   ```
   - コンフリクト時: 自タスクの意図と本線側の変更意図を両立する形で解消して
     `git rebase --continue`。両立の判断がつかない場合は `git rebase --abort` して
     状況をユーザーに報告し停止する（勝手にどちらかを捨てない）。
3. **検証**: 変更ファイルを確認し、コード（`index.html` / `style.css` / `js/`）に触れて
   いる場合は rebase 後の状態で /verify-ui を実行して PASS を確認する。docs 等のみなら省略可。
   ```bash
   git diff --name-only experiment/ui-scaling...HEAD
   ```
4. **ff-only マージ**（統合の直列化。UIS 側で実行）:
   ```bash
   git -C "$UIS" merge --ff-only "feature/<topic>"
   ```
   - 「Not possible to fast-forward」で失敗 = 他セッションが先に統合した → 手順2へ戻って
     再 rebase・再検証・再試行（最大3回。超えたら報告して停止）。
   - untracked/dirty 衝突で失敗 → **UIS で reset/clean を実行してはならない**。
     状況を報告して停止する。
5. **デプロイ**（`--no-deploy` 時はスキップ）: `cd "$UIS"` してから /deploy を実行する
   （現在ブランチ= experiment/ui-scaling の状態で push + main 空コミットで Pages 発火。
   UIS に他セッションの未コミット変更があってもステージしない）。
6. **掃除**:
   ```bash
   git worktree remove --force "D:/CCwork/.manhour-management-worktrees/feature-<topic>"
   git -C "$UIS" branch -d "feature/<topic>"
   ```
   - `--force` は worktree 内の未追跡ファイル（検証スクショ等）ごと捨てるため。
     マージ済み確認後にのみ実行する。`branch -d` は ff 済みなので通る（通らなければ
     マージされていない＝手順4に戻る）。
   - セッションの起点ディレクトリ自体がこの feature worktree の場合は remove せず、
     「統合済み。worktree は後続の /integrate の残存報告か手動で掃除」と報告する。
7. **残存 worktree の報告**: `git worktree list` の `feature-` 行を列挙し、各ブランチの
   最終コミット日時（`git log -1 --format=%ci <branch>`）とともに報告する（掃除漏れの可視化）。
8. **結果報告**: 統合したコミット範囲・検証結果・デプロイ URL（/deploy 実行時）・掃除状況。
```

- [x] **Step 2: 参照整合の静的確認**

/deploy の手順（現ブランチ push → main 空コミット）と手順5の記述が矛盾しないこと、
/verify-ui が存在することを確認:

```bash
ls D:/CCwork/.manhour-management-worktrees/.shared/commands/deploy.md D:/CCwork/.manhour-management-worktrees/.shared/commands/verify-ui.md
```

---

### Task 5: ドキュメント反映（CLAUDE.md + 設計書ステータス）とコミット

**Files:**
- Modify: `CLAUDE.md`（「開発フロー（自動検証・自動デプロイ）」節の末尾、`## コーディング規約` の直前）
- Modify: `docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md`（ステータス行とリハーサル方式）

**Interfaces:**
- Consumes: Task 1〜4 の成果物名（/parallel-mode, /start-work, /integrate, バックアップファイル名）
- Produces: なし（ドキュメントのみ）

- [x] **Step 1: CLAUDE.md の開発フロー節の直後に以下を挿入**

```markdown
### 並列セッション統合機構（parallel-mode）

複数セッションの並列作業を安全に統合する仕組み。フラグファイル
`.shared/hooks/parallel-mode.on` が存在する間だけ有効（`/parallel-mode on|off|status` で切替）。

- **有効時**: コード修正タスクは `/start-work <topic>` で専用 worktree（`feature/<topic>`）に
  隔離してから作業し、完了時に `/integrate` で「rebase → /verify-ui → ff-only マージ →
  /deploy → worktree 掃除」まで自動実行する。**ui-scaling worktree は統合専用**（直接編集しない）。
- **無効時（フラグ無し）**: 従来どおり本節上部の開発フロー（直接編集 + 明示ステージ）。
- **元に戻す**: `/parallel-mode off` で即復帰。完全撤去の手順と設計は
  `docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md` §6 を参照
  （hook 原本バックアップ: `.shared/hooks/inject-dev-flow.py.orig-20260819`）。
```

- [x] **Step 2: 設計書のステータスとリハーサル方式を更新**

- `- ステータス: レビュー待ち` → `- ステータス: 承認済み・実装（2026-08-19）`
- §7 に1行追記: リハーサルは本線を使わず代役ブランチ `rehearsal/mainline` 上で同一の
  git 操作を実証する方式に変更（本線に一切コミットを載せない。§7.5 の revert 方式を置換）。

- [x] **Step 3: 2ファイルのみ明示ステージしてコミット**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-19-parallel-session-merge-design.md
git commit -m "docs(workflow): parallel-mode の運用手順を CLAUDE.md に追加し設計書を承認済みに更新

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: リハーサル（代役本線方式・ゼロフットプリント）

**Files:**
- Test: 一時ブランチ `rehearsal/mainline`, `rehearsal/feat-a`, `rehearsal/feat-b1`, `rehearsal/feat-b2` と対応 worktree（終了時に全削除）

**Interfaces:**
- Consumes: Task 3/4 の手順（本線を `rehearsal/mainline` に読み替えて実行）
- Produces: 設計書 §7 の検証結果（本 plan 実行報告に記載）

- [x] **Step 1: 開始状態を記録**

```bash
WTR=D:/CCwork/.manhour-management-worktrees
BASE=$(git rev-parse experiment/ui-scaling)
git -C "$WTR/experiment-ui-scaling" status --short > "$SP/uis-before.txt"
git worktree add -b rehearsal/mainline "$WTR/rehearsal-mainline" experiment/ui-scaling
RMS="$WTR/rehearsal-mainline"
```

- [x] **Step 2: シナリオA — 別ファイル・クリーン統合（start-work → integrate の通し）**

start-work 手順どおり worktree を作る（settings 複製と junction も実施して手順3を実証）:

```bash
git worktree add -b rehearsal/feat-a "$WTR/feature-rehearsal-a" rehearsal/mainline
# start-work 手順3の実証（PowerShell）:
#   New-Item -ItemType Directory "$WTR/feature-rehearsal-a/.claude"
#   Copy-Item settings.json / New-Item -ItemType Junction ... commands
cd "$WTR/feature-rehearsal-a"
echo "rehearsal A line1" > rehearsal-note.txt
git add rehearsal-note.txt && git commit -m "test(rehearsal): シナリオA 用ファイル追加"
touch fake-screenshot.png        # 未追跡ファイル（掃除の実証用）
# integrate 手順（--no-deploy、本線= rehearsal/mainline に読み替え）:
git rebase rehearsal/mainline                          # 期待: up to date
git -C "$RMS" merge --ff-only rehearsal/feat-a         # 期待: Fast-forward
cd "$RMS"
git worktree remove --force "$WTR/feature-rehearsal-a" # 未追跡ごと消えること
git -C "$RMS" branch -d rehearsal/feat-a               # 期待: 削除成功（マージ済み）
```
Expected: junction が張れている / ff 成功 / worktree・ブランチが消えている

- [x] **Step 3: シナリオB — 同一ファイル同一行の競合と直列化**

```bash
git worktree add -b rehearsal/feat-b1 "$WTR/feature-rehearsal-b1" rehearsal/mainline
git worktree add -b rehearsal/feat-b2 "$WTR/feature-rehearsal-b2" rehearsal/mainline  # 同一ベース
cd "$WTR/feature-rehearsal-b1"
sed -i 's/rehearsal A line1/rehearsal B1 line1/' rehearsal-note.txt
git add rehearsal-note.txt && git commit -m "test(rehearsal): B1 が1行目を変更"
cd "$WTR/feature-rehearsal-b2"
sed -i 's/rehearsal A line1/rehearsal B2 line1/' rehearsal-note.txt
git add rehearsal-note.txt && git commit -m "test(rehearsal): B2 が同じ行を変更"
# B1 を先に統合（クリーン）
cd "$WTR/feature-rehearsal-b1" && git rebase rehearsal/mainline
git -C "$RMS" merge --ff-only rehearsal/feat-b1        # 期待: Fast-forward
# B2: rebase せず ff を試す → 直列化の実証
git -C "$RMS" merge --ff-only rehearsal/feat-b2        # 期待: 失敗（Not possible to fast-forward）
# B2: integrate 手順どおり再 rebase → コンフリクト → 解消 → 統合
cd "$WTR/feature-rehearsal-b2" && git rebase rehearsal/mainline   # 期待: CONFLICT
echo "rehearsal B1+B2 line1" > rehearsal-note.txt
git add rehearsal-note.txt && GIT_EDITOR=true git rebase --continue
git -C "$RMS" merge --ff-only rehearsal/feat-b2        # 期待: Fast-forward
cd "$RMS"
git worktree remove --force "$WTR/feature-rehearsal-b1"
git worktree remove --force "$WTR/feature-rehearsal-b2"
git -C "$RMS" branch -d rehearsal/feat-b1 rehearsal/feat-b2
```
Expected: ff 拒否 → rebase コンフリクト検出 → 解消後 ff 成功、の順で全部観測できること

- [x] **Step 4: ゼロフットプリント確認と全撤去**

```bash
cd "$WTR/experiment-ui-scaling"
git worktree remove --force "$WTR/rehearsal-mainline"
git branch -D rehearsal/mainline                       # 本線未マージなので -D
git worktree list | grep -c rehearsal                  # 期待: 0
git branch --list 'rehearsal/*' | wc -l                # 期待: 0
[ "$(git rev-parse experiment/ui-scaling)" = "$BASE" ] && echo MAINLINE-UNTOUCHED
git -C "$WTR/experiment-ui-scaling" status --short > "$SP/uis-after.txt"
diff "$SP/uis-before.txt" "$SP/uis-after.txt" && echo UIS-UNTOUCHED
```
Expected: `MAINLINE-UNTOUCHED` と `UIS-UNTOUCHED`（他セッションが並行コミットした場合は
BASE 比較のみ不一致になりうる — その場合は log で理由を確認し、リハーサル起因でないことを報告）

---

### Task 7: 最終確認・push・完了報告

**Files:**
- なし（確認と報告のみ）

**Interfaces:**
- Consumes: 全タスクの成果物
- Produces: ユーザーへの完了報告（有効化は `/parallel-mode on` の合図待ち）

- [x] **Step 1: 納品状態の最終確認**

```bash
SH=D:/CCwork/.manhour-management-worktrees/.shared/hooks
ls "$SH/parallel-mode.on" 2>&1                          # 期待: 無し（OFF のまま納品）
echo '{}' | python "$SH/inject-dev-flow.py" > "$SP/final-off.json"
diff "$SP/before.json" "$SP/final-off.json" && echo FINAL-BYTE-OK
ls "$SH/inject-dev-flow.py.orig-20260819"               # バックアップ存在
ls D:/CCwork/.manhour-management-worktrees/.shared/commands/{parallel-mode,start-work,integrate}.md
```

- [x] **Step 2: docs コミットを push（コード変更なしのため Pages 発火は不要）**

```bash
git push origin experiment/ui-scaling
```

- [x] **Step 3: 完了報告**

以下を含めてユーザーへ報告する:
- 現在 OFF のまま（挙動変化ゼロ）であること、有効化は `/parallel-mode on` で行うこと
- ON にする推奨タイミング（稼働中セッションが区切りを迎えたとき）
- リハーサル結果（隔離・競合検出・直列化・掃除の各実証）
- 戻し方（`/parallel-mode off` 即時 / 完全撤去は設計書 §6）
