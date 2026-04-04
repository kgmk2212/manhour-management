#!/bin/bash
# Phase 1 検証用スクリプト
# サンプルデータで要約→推論を一気通貫でテスト
#
# 使い方:
#   ./run_test.sh                    # デフォルト（config.yamlのモデル）
#   ./run_test.sh qwen3.5:9b         # モデル指定
#   ./run_test.sh gemma4              # 別モデルで比較

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MODEL="${1:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "========================================="
echo "  工数分析LLM検証テスト"
echo "  $(date)"
echo "========================================="

# データディレクトリ作成
mkdir -p data/summaries data/results

# Step 1: 要約生成
echo ""
echo "[Step 1] バックアップJSON → 要約JSON"
echo "-----------------------------------------"
python3 summarize.py \
    --input tests/sample_backup.json \
    --output data/summaries/test_summary.json

echo ""
echo "要約JSON（先頭20行）:"
head -20 data/summaries/test_summary.json
echo "..."

# Step 2: LLM推論
echo ""
echo "[Step 2] 要約JSON → LLM推論"
echo "-----------------------------------------"

OUTPUT_FILE="data/results/test_result_${TIMESTAMP}.json"
if [ -n "$MODEL" ]; then
    echo "モデル指定: $MODEL"
    python3 analyze.py \
        --input data/summaries/test_summary.json \
        --output "$OUTPUT_FILE" \
        --model "$MODEL"
else
    python3 analyze.py \
        --input data/summaries/test_summary.json \
        --output "$OUTPUT_FILE"
fi

# Step 3: 結果表示
echo ""
echo "========================================="
echo "  分析結果"
echo "========================================="
python3 -m json.tool "$OUTPUT_FILE"

echo ""
echo "========================================="
echo "  結果ファイル: $OUTPUT_FILE"
echo "========================================="
