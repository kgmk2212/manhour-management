#!/usr/bin/env bash
#
# deploy.sh — 実装ブランチのプッシュとGitHub Pagesデプロイ発火
#
# Usage:
#   ./scripts/deploy.sh "commit message"       # 変更をステージ→コミット→プッシュ→デプロイ
#   ./scripts/deploy.sh --commit-only "msg"    # コミットのみ（プッシュしない）
#   ./scripts/deploy.sh --push-only             # コミット済みの変更をプッシュ+デプロイ
#   ./scripts/deploy.sh --redeploy-only         # 空コミットでPages再デプロイだけ発火
#
# 前提:
#   - このスクリプトは manhour-impl worktree (experiment/redesign-impl) で実行すること
#   - ../manhour-management (main) が存在すること
#

set -e

# カラー
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $1"; }
ok()    { echo -e "${GREEN}✓${NC}  $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC}  $1" >&2; }

# === 前提チェック ===

# 実行場所の確認
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
EXPECTED_BRANCH="experiment/redesign-impl"

if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
  error "現在のブランチが期待と異なります"
  error "  現在: $CURRENT_BRANCH"
  error "  期待: $EXPECTED_BRANCH"
  exit 1
fi

MAIN_WORKTREE="/Users/kmori/Documents/work/manhour-management"
if [ ! -d "$MAIN_WORKTREE" ]; then
  error "mainのworktreeが見つかりません: $MAIN_WORKTREE"
  exit 1
fi

# === 引数解析 ===

MODE="full"
MESSAGE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --commit-only)
      MODE="commit-only"
      shift
      ;;
    --push-only)
      MODE="push-only"
      shift
      ;;
    --redeploy-only)
      MODE="redeploy-only"
      shift
      ;;
    -h|--help)
      sed -n '3,13p' "$0" | sed 's/^#//'
      exit 0
      ;;
    *)
      MESSAGE="$1"
      shift
      ;;
  esac
done

# === モード別処理 ===

deploy_to_pages() {
  info "GitHub Pagesデプロイを発火中 (main空コミット)..."
  cd "$MAIN_WORKTREE"

  # 未コミットの変更がある場合は一時退避
  local stashed=false
  if [ -n "$(git status --porcelain)" ]; then
    warn "main worktreeに未コミットの変更があります。一時退避します..."
    git stash push -u -m "deploy.sh auto-stash $(date +%s)"
    stashed=true
  fi

  # mainブランチの最新を取得（fast-forwardのみ）
  if ! git fetch origin main --quiet; then
    error "git fetch に失敗しました"
    [ "$stashed" = true ] && git stash pop
    cd "$REPO_DIR"
    exit 1
  fi

  git checkout main --quiet 2>/dev/null || true

  # ローカルのmainが進んでいるかチェック
  local local_head=$(git rev-parse HEAD)
  local remote_head=$(git rev-parse origin/main)

  if [ "$local_head" != "$remote_head" ]; then
    # fast-forwardでmerge（履歴書き換えなし）
    if ! git merge --ff-only origin/main --quiet 2>/dev/null; then
      warn "mainがリモートとdivergeしています。fetchだけ行い、ローカルmainはそのままにします"
    fi
  fi

  # 空コミット + プッシュ
  local deploy_msg="deploy: trigger Pages rebuild"
  if [ -n "$MESSAGE" ]; then
    deploy_msg="$deploy_msg ($MESSAGE)"
  fi

  git commit --allow-empty -m "$deploy_msg"

  if ! git push origin main; then
    error "git push に失敗しました"
    [ "$stashed" = true ] && git stash pop
    cd "$REPO_DIR"
    exit 1
  fi

  # 退避した変更を戻す
  if [ "$stashed" = true ]; then
    info "一時退避していた変更を復元中..."
    git stash pop
  fi

  cd "$REPO_DIR"
  ok "Pagesデプロイを発火しました"
  info "デプロイ状況: https://github.com/kgmk2212/manhour-management/actions"
  info "プレビューURL: https://kgmk2212.github.io/manhour-management/preview/redesign-impl/"
}

case $MODE in
  "full")
    if [ -z "$MESSAGE" ]; then
      error "コミットメッセージを指定してください"
      error "  例: ./scripts/deploy.sh \"feat(A-1): テンプレート機能の基本実装\""
      exit 1
    fi

    # 変更の有無チェック
    if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
      info "変更をステージング中..."
      git add -A
      info "変更内容:"
      git diff --cached --stat

      info "コミット作成中..."
      git commit -m "$MESSAGE

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
      ok "コミットしました"
    else
      warn "変更がありません。既存コミットのプッシュのみ行います"
    fi

    info "experiment/redesign-impl をプッシュ中..."
    git push origin experiment/redesign-impl
    ok "プッシュ完了"

    deploy_to_pages
    ;;

  "commit-only")
    if [ -z "$MESSAGE" ]; then
      error "コミットメッセージを指定してください"
      exit 1
    fi
    git add -A
    git commit -m "$MESSAGE

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
    ok "コミットしました（プッシュはしていません）"
    ;;

  "push-only")
    info "experiment/redesign-impl をプッシュ中..."
    git push origin experiment/redesign-impl
    ok "プッシュ完了"
    deploy_to_pages
    ;;

  "redeploy-only")
    deploy_to_pages
    ;;
esac

ok "すべての処理が完了しました"
