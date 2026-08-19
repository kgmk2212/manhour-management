#!/usr/bin/env bash
# パイプライン用ラベルを作成する（冪等: 既存なら上書き更新）
set -euo pipefail
REPO="kgmk2212/manhour-management"

create() { # name color description
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force
}

create "idea"                 "0e8a16" "アイデア入口（トリアージ対象）"
create "lane:auto"            "1d76db" "自動走行枠（検証PASSで自動マージ候補）"
create "lane:pr"              "5319e7" "実装・PR作成まで自動、マージは人間"
create "lane:design"          "b60205" "設計書生成で停止（コードは書かない）"
create "needs-clarification"  "fbca04" "解釈に幅あり。回答コメントで再トリアージ"
create "verification-failed"  "e11d21" "検証FAILまたは実装中断"
create "pipeline-report"      "c5def5" "パイプライン週次レポート"
echo "done"
