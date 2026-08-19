#!/usr/bin/env bash
# issues/issue_comment/schedule トリガーのワークフローは default branch (main) 上のみ発火する。
# ui-scaling を正本とし、該当ワークフローを main worktree へコピーして push する。
set -euo pipefail
MAIN_WT="../../manhour-management"   # D:/CCwork/manhour-management（main の worktree）
FILES="triage.yml implement.yml revert.yml pipeline-report.yml"
for f in $FILES; do
  if [ -f ".github/workflows/$f" ]; then
    cp ".github/workflows/$f" "$MAIN_WT/.github/workflows/$f"
  fi
done
cd "$MAIN_WT"
git add .github/workflows
git commit -m "ci(pipeline): イベント駆動ワークフローを ui-scaling からミラー" || { echo "変更なし"; exit 0; }
git push origin main
