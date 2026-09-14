#!/usr/bin/env bash
# worktree.sh - 1修正 = 1 worktree 運用のヘルパー（macOS / Linux）
#
# 使い方:
#   bash scripts/worktree.sh start <topic>     隔離 worktree を作り、そのパスを出力する
#   bash scripts/worktree.sh finish [--no-test] [--no-push]
#                                              本線へ rebase → ff-only マージ → push → CI結果待ち → 掃除
#                                              （push 後は gh run list で CI 完了を待ち、失敗・タイムアウトなら
#                                              非ゼロ終了する。バイパスするオプションは無い＝常に検証される）
#   bash scripts/worktree.sh list              残存している feature worktree を一覧する
#   bash scripts/worktree.sh drop <topic>      統合せずに破棄する（作業は失われる）
#
# 設計: docs/superpowers/specs/2026-09-14-always-worktree-workflow-design.md
#
# 原則:
#   - 本線 worktree（main）では reset / checkout -- / clean / stash を
#     絶対に実行しない（他セッションの未コミット変更が実在しうるため）。
#   - 失敗したら自動で回復せず、状況を出力して非ゼロ終了する。

set -euo pipefail

# 本線ブランチ。リハーサル時のみ MANHOUR_MAINLINE で代役ブランチに差し替える。
MAINLINE_BRANCH="${MANHOUR_MAINLINE:-main}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*" >&2; }

# 本線ブランチが checkout されている worktree の絶対パスを返す
mainline_worktree() {
  git worktree list --porcelain \
    | awk -v b="refs/heads/$MAINLINE_BRANCH" '
        /^worktree /{p=substr($0,10)}
        /^branch /{if (substr($0,8)==b) {print p; exit}}'
}

# 一時 worktree の置き場。
# 基準は「本線 worktree」ではなく「リポジトリの主 worktree（.git 実体を持つ側）」の親。
# こうしないと、隔離 worktree の中から実行したときに置き場が入れ子になる。
worktree_root() {
  local primary
  primary="$(git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
  [ -n "$primary" ] || die "主 worktree を特定できません"
  printf '%s/.manhour-worktrees' "$(dirname "$primary")"
}

sanitize_topic() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9-]\{1,\}/-/g' -e 's/^-\{1,\}//' -e 's/-\{1,\}$//' \
    | cut -c1-48
}

# .claude/commands が symlink なら「リンクだけ」を外す。
# macOS の symlink は rm/rm -rf で実体を追わないが、Windows junction での実害
# （2026-08-19）に倣い、削除前に必ず明示的にリンク解除する。
unlink_claude_commands() {
  local wt="$1"
  local cmds="$wt/.claude/commands"
  if [ -L "$cmds" ]; then
    info "  .claude/commands は symlink → リンクのみ解除（実体: $(readlink "$cmds")）"
    rm -f "$cmds"
  elif [ -d "$cmds" ]; then
    info "  .claude/commands は実ディレクトリ → worktree ごと削除される（実体は共有されていない）"
  fi
}

# 隔離 worktree に .claude 設定を引き継ぐ（.claude は gitignore のため checkout に含まれない）
seed_claude_dir() {
  local main="$1" wt="$2"
  [ -d "$main/.claude" ] || return 0
  mkdir -p "$wt/.claude"
  for f in settings.json settings.local.json; do
    [ -f "$main/.claude/$f" ] && cp "$main/.claude/$f" "$wt/.claude/$f"
  done
  local src="$main/.claude/commands" target
  if [ -L "$src" ]; then
    target="$(cd "$(dirname "$src")" && cd "$(readlink "$src")" 2>/dev/null && pwd || true)"
  elif [ -d "$src" ]; then
    target="$src"
  fi
  if [ -n "${target:-}" ] && [ -d "$target" ]; then
    ln -s "$target" "$wt/.claude/commands"
    info "  .claude/commands -> $target (symlink)"
  fi
  return 0
}

cmd_start() {
  local topic; topic="$(sanitize_topic "${1:-}")"
  [ -n "$topic" ] || die "topic が空です。例: bash scripts/worktree.sh start fix-report-label"

  local main; main="$(mainline_worktree)"
  [ -n "$main" ] || die "$MAINLINE_BRANCH が checkout された worktree が見つかりません"
  local root; root="$(worktree_root)"
  mkdir -p "$root"

  # 名前衝突の回避（feature/<topic>, feature/<topic>-2, ...）
  local name="$topic" n=1
  while git show-ref --verify --quiet "refs/heads/feature/$name" || [ -e "$root/feature-$name" ]; do
    n=$((n + 1)); name="$topic-$n"
    [ "$n" -le 20 ] || die "命名衝突が解消できません: feature/$topic"
  done

  local wt="$root/feature-$name"
  info "本線 worktree : $main"
  info "隔離 worktree : $wt"
  git -C "$main" worktree add -b "feature/$name" "$wt" "$MAINLINE_BRANCH" >&2
  seed_claude_dir "$main" "$wt"
  info ""
  info "以後このタスクの編集・テスト・検証はすべて $wt 内で行ってください。"
  info "完了したら: bash \"$wt/scripts/worktree.sh\" finish"
  printf '%s\n' "$wt"   # stdout はパスのみ（呼び出し側が cd に使える）
}

cmd_finish() {
  local run_test=1 do_push=1
  for a in "$@"; do
    case "$a" in
      --no-test) run_test=0 ;;
      --no-push) do_push=0 ;;
      *) die "不明な引数: $a" ;;
    esac
  done

  local wt; wt="$(git rev-parse --show-toplevel)"
  local branch; branch="$(git -C "$wt" branch --show-current)"
  case "$branch" in
    feature/*) ;;
    *) die "現在のブランチが feature/* ではありません（$branch）。隔離 worktree 内で実行してください。" ;;
  esac

  local main; main="$(mainline_worktree)"
  [ -n "$main" ] || die "$MAINLINE_BRANCH の worktree が見つかりません"
  [ "$main" != "$wt" ] || die "本線 worktree 上では finish できません"

  # 1) 未コミット変更が残っていないこと（自動コミットはしない = 巻き込み防止）
  if [ -n "$(git -C "$wt" status --porcelain --untracked-files=no)" ]; then
    git -C "$wt" status --short >&2
    die "未コミットの変更があります。自分が編集したファイルのみ明示ステージしてコミットしてください（git add -A 禁止）。"
  fi

  # 2) 本線を origin に追随させる（ff-only。ローカル独自コミットがあれば止まる）
  info "== 本線を origin に追随 =="
  local has_remote=0
  if git -C "$main" ls-remote --exit-code --heads origin "$MAINLINE_BRANCH" >/dev/null 2>&1; then
    has_remote=1
    git -C "$main" fetch origin "$MAINLINE_BRANCH" >&2
  else
    info "origin に $MAINLINE_BRANCH がありません（ローカル完結として続行）"
  fi
  if [ -n "$(git -C "$main" status --porcelain --untracked-files=no)" ]; then
    info "注意: 本線 worktree に未コミット変更があります（他セッション・ツール由来の可能性）:"
    git -C "$main" status --short --untracked-files=no >&2
    info "→ reset / checkout -- / clean / stash は実行しません。マージが弾かれた場合はユーザーに報告して停止します。"
  fi
  if [ "$has_remote" -eq 1 ]; then
    git -C "$main" merge --ff-only "origin/$MAINLINE_BRANCH" >&2 \
      || die "本線を origin へ ff できません（未 push のローカルコミット、または作業ツリーの衝突）。本線では reset/clean せず、状況をユーザーに報告してください。"
  fi

  # 3) feature を本線最新へ rebase（同一内容の空コミットは機械的に drop）
  info "== rebase onto $MAINLINE_BRANCH =="
  if ! git -C "$wt" rebase --empty=drop "$MAINLINE_BRANCH" >&2; then
    info "rebase がコンフリクトで停止しました。解消して 'git rebase --continue' 後に finish を再実行するか、"
    info "両立の判断がつかなければ 'git rebase --abort' して状況を報告してください。"
    exit 1
  fi

  # 4) 検証（コード差分があるときのみ。docs のみなら省略）
  local changed; changed="$(git -C "$wt" diff --name-only "$MAINLINE_BRANCH...HEAD")"
  if [ -z "$changed" ]; then
    info "本線との差分がありません（rebase で drop 済み）。掃除のみ行います。"
  elif [ "$run_test" -eq 1 ] && printf '%s\n' "$changed" | grep -qE '^(js/|index\.html|style\.css|tests/|scripts/)'; then
    info "== npm test（単体テスト） =="
    (cd "$wt" && npm test >&2) || die "単体テストが失敗しました。統合を中止します（本線は無変更）。"
    if printf '%s\n' "$changed" | grep -qE '^(js/|index\.html|style\.css)'; then
      info "== npm run e2e（Playwright 実ブラウザ検証） =="
      (cd "$wt" && npm run e2e >&2) || die "E2E検証が失敗しました。統合を中止します（本線は無変更）。"
    fi
  fi

  # 5) ff-only マージ（統合の直列化）
  info "== ff-only merge =="
  if ! git -C "$main" merge --ff-only "$branch" >&2; then
    die "ff-only マージに失敗しました（他セッションが先に統合した可能性）。手順2から再実行してください。"
  fi

  # 6) push（deploy.yml の main トリガで Pages が再デプロイされる・ルート配信）
  if [ "$do_push" -eq 1 ] && [ "$has_remote" -eq 1 ]; then
    info "== push =="
    git -C "$main" push origin "$MAINLINE_BRANCH" >&2 \
      || die "push に失敗しました。origin が進んでいる可能性があります（本線への統合自体は完了済み）。"
  fi

  # 6.5) push 後の CI 結果を待って報告する（放置防止: 統合完了を名乗る前にセッション内で検知する）
  # バイパス用オプションは意図的に用意しない（あると将来のセッションが付けて無効化しうるため）。
  local ci_failed=0
  if [ "$do_push" -eq 1 ] && [ "$has_remote" -eq 1 ]; then
    if ! command -v gh >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
      ci_failed=1
      info "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      info "!! gh / jq が無いため CI 結果を検証できません（要対応・見落とし厳禁） !!"
      info "!! 手動で 'gh run list --branch $MAINLINE_BRANCH' を確認してください        !!"
      info "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    else
      info "== CI 結果待ち =="
      local sha; sha="$(git -C "$main" rev-parse HEAD)"
      local waited=0 max_wait=300 interval=10
      local for_sha="[]" timed_out=0
      while :; do
        local runs_json
        runs_json="$(gh run list --branch "$MAINLINE_BRANCH" --json databaseId,headSha,status,conclusion,workflowName --limit 30 2>/dev/null || echo '[]')"
        for_sha="$(printf '%s' "$runs_json" | jq -c --arg sha "$sha" '[.[] | select(.headSha == $sha)]')"
        local total pending
        total="$(printf '%s' "$for_sha" | jq 'length')"
        pending="$(printf '%s' "$for_sha" | jq '[.[] | select(.status != "completed")] | length')"
        if [ "$total" -gt 0 ] && [ "$pending" -eq 0 ]; then
          break
        fi
        if [ "$waited" -ge "$max_wait" ]; then
          timed_out=1
          break
        fi
        sleep "$interval"
        waited=$((waited + interval))
      done
      if [ "$timed_out" -eq 1 ]; then
        # タイムアウト＝未確認は「成功扱い」にしない。失敗と同様に扱い、見落としを防ぐ。
        ci_failed=1
        info "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
        info "!! CI 結果の待機がタイムアウトしました（${max_wait}秒・未確認） !!"
        info "!! 'gh run list --branch $MAINLINE_BRANCH' で手動確認してください        !!"
        info "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      elif [ "$(printf '%s' "$for_sha" | jq 'length')" -gt 0 ]; then
        local failed failed_count
        failed="$(printf '%s' "$for_sha" | jq -c '[.[] | select(.conclusion != "success")]')"
        failed_count="$(printf '%s' "$failed" | jq 'length')"
        if [ "$failed_count" -gt 0 ]; then
          ci_failed=1
          info "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
          info "!! CI 失敗を検知しました（push・マージ自体は完了済み・要対応） !!"
          printf '%s' "$failed" | jq -r '.[] | "  - \(.workflowName): \(.conclusion) (run \(.databaseId))"' >&2
          info "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
        else
          info "CI 結果: すべて成功"
        fi
      fi
    fi
  fi

  # 7) 掃除（symlink を先に解除してから worktree を削除）
  info "== 掃除 =="
  # 自分の cwd が削除対象だと、削除後の git 実行が
  # 「Unable to read current working directory」で落ちるため先に脱出する
  cd "$main"
  unlink_claude_commands "$wt"
  git -C "$main" worktree remove --force "$wt" >&2
  git -C "$main" branch -d "$branch" >&2

  info ""
  info "統合完了: $branch -> $MAINLINE_BRANCH"
  cmd_list || true

  if [ "$ci_failed" -eq 1 ]; then
    die "CI が失敗、または結果を確認できていません（詳細は上記の CI 結果待ちログ）。統合自体は完了済みなので、状況を確認のうえ、必要なら別 worktree で修正して finish し直してください。"
  fi
}

cmd_list() {
  local main; main="$(mainline_worktree)"
  [ -n "$main" ] || die "$MAINLINE_BRANCH の worktree が見つかりません"
  local found=0
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) p="${line#worktree }" ;;
      branch\ refs/heads/feature/*)
        b="${line#branch refs/heads/}"
        found=1
        printf '%-60s %-28s last: %s\n' "$p" "$b" "$(git -C "$main" log -1 --format=%ci "$b" 2>/dev/null || echo '?')"
        ;;
    esac
  done < <(git -C "$main" worktree list --porcelain)
  [ "$found" -eq 1 ] || info "残存している feature worktree はありません。"
}

cmd_drop() {
  local topic="${1:-}"; [ -n "$topic" ] || die "topic を指定してください"
  local main; main="$(mainline_worktree)"
  local root; root="$(worktree_root)"
  local wt="$root/feature-$topic"
  [ -d "$wt" ] || die "見つかりません: $wt"
  info "破棄します（作業内容は失われます）: $wt / feature/$topic"
  unlink_claude_commands "$wt"
  git -C "$main" worktree remove --force "$wt" >&2
  git -C "$main" branch -D "feature/$topic" >&2
}

case "${1:-}" in
  start)  shift; cmd_start "$@" ;;
  finish) shift; cmd_finish "$@" ;;
  list)   shift; cmd_list "$@" ;;
  drop)   shift; cmd_drop "$@" ;;
  *) sed -n '2,16p' "$0" >&2; exit 1 ;;
esac
