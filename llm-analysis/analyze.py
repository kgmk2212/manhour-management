#!/usr/bin/env python3
"""
要約JSON → LLM推論 → 結果JSON生成スクリプト

要約JSONをOllama APIに渡し、工数分析結果を取得する。
"""

import json
import argparse
import sys
import time
import requests
import yaml
from datetime import datetime
from pathlib import Path


def load_config(config_path: str = "config.yaml") -> dict:
    """設定ファイルを読み込む"""
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_prompt(prompts_dir: str, model: str = "") -> tuple[str, str]:
    """プロンプトテンプレートを読み込む（モデル別プロンプト対応）"""
    # モデル別システムプロンプトを優先（例: system_prompt.gemma4.txt）
    model_base = model.split(":")[0]
    model_specific = Path(prompts_dir) / f"system_prompt.{model_base}.txt"
    if model_base and model_specific.exists():
        system_path = model_specific
        print(f"モデル別プロンプト使用: {model_specific.name}", file=sys.stderr)
    else:
        system_path = Path(prompts_dir) / "system_prompt.txt"

    format_path = Path(prompts_dir) / "output_format.txt"

    with open(system_path, "r", encoding="utf-8") as f:
        system_prompt = f.read().strip()
    with open(format_path, "r", encoding="utf-8") as f:
        output_format = f.read().strip()

    return system_prompt, output_format


def extract_key_findings(summary: dict) -> str:
    """要約JSONから要点をテキストで抽出（LLMがデータを見落とさないように）"""
    lines = []

    # 全体
    ov = summary.get("overall", {})
    lines.append(f"全体: 見積{ov.get('total_estimate_hours',0)}h / 実績{ov.get('total_actual_hours',0)}h / 精度{ov.get('accuracy_percent',0)}%")
    lines.append(f"  超過タスク{ov.get('overrun_tasks',0)}件 / 下回り{ov.get('underrun_tasks',0)}件")

    # バージョン別
    for v in summary.get("by_version", []):
        status = "完了" if v.get("status") == "completed" else "進行中"
        line = f"{v['version']}({status}): 見積{v.get('estimate_hours',0)}h / 実績{v.get('actual_hours',0)}h / 精度{v.get('accuracy_percent',0)}%"
        if v.get("remaining_hours"):
            line += f" / 残{v['remaining_hours']}h / 進捗{v.get('progress_rate',0)}%"
        if v.get("worst_overrun"):
            wo = v["worst_overrun"]
            line += f" / 最大超過: {wo['task']}-{wo['process']}({wo['overrun_percent']}%)"
        lines.append(line)

    # 工程別
    procs = []
    for p in summary.get("by_process", []):
        procs.append(f"{p['process']}精度{p['accuracy']}%")
    if procs:
        lines.append(f"工程別精度: {' / '.join(procs)}")

    # メンバー別
    for m in summary.get("by_member", []):
        line = f"{m['name']}: 見積{m.get('estimate',0)}h / 実績{m.get('actual',0)}h / 精度{m.get('accuracy',0)}%"
        if m.get("weak_process"):
            line += f" / 弱み:{m['weak_process']}"
        lines.append(line)

    # メンバー月別（負荷集中の検出）
    for mm in summary.get("member_monthly", []):
        high_months = [m for m in mm.get("months", []) if m.get("high_load")]
        if high_months:
            months_str = ", ".join(f"{m['month']}({m['estimate']}h)" for m in high_months)
            lines.append(f"{mm['name']}の高負荷月: {months_str}")

    # 大タスク
    large = [t for t in summary.get("task_sizes", []) if t.get("total_estimate", 0) >= 80]
    if large:
        lines.append("大タスク(80h以上): " + " / ".join(
            f"{t['task']}({t['version']}, {t['total_estimate']}h, {t['primary_member']})" for t in large
        ))

    # 異常値
    anomalies = summary.get("anomalies", [])
    if anomalies:
        lines.append("超過タスク: " + " / ".join(
            f"{a['task']}-{a['process']}({a['version']}, 見積{a['estimate']}h→実績{a['actual']}h, +{a['overrun_percent']}%)"
            for a in anomalies
        ))

    # キャパシティ
    cap = summary.get("capacity", {})
    high_util = [m for m in cap.get("monthly", []) if m.get("warning")]
    if high_util:
        lines.append("キャパシティ警告月: " + ", ".join(f"{m['month']}({m['utilization_percent']}%)" for m in high_util))

    return "\n".join(lines)


def build_messages(system_prompt: str, output_format: str, summary_json: str, summary: dict = None, model: str = "") -> list[dict]:
    """chat API用のメッセージリストを構築"""
    system_content = f"""{system_prompt}

## 出力形式（厳守）
以下のJSON形式に正確に従って回答してください。このスキーマ以外の構造で回答しないでください。

{output_format}"""

    # データの要点をテキストで抽出
    findings = extract_key_findings(summary) if summary else ""
    findings_section = f"""
## データの要点（以下の数値を分析で必ず引用すること）
{findings}

""" if findings else ""

    user_content = f"""{findings_section}## 要約JSON（詳細データ）
```json
{summary_json}
```

重要: 上記データに存在するバージョン名・タスク名・メンバー名・数値のみを使って回答してください。データにない数値を作らないでください。"""

    messages = [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]

    # gemma4のみassistantプレフィルで出力構造を強制（qwenには不要）
    model_base = model.split(":")[0]
    if model_base == "gemma4":
        messages.append({"role": "assistant", "content": '{"team_evaluation":{"headline":"'})

    return messages


OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "team_evaluation": {
            "type": "object",
            "properties": {
                "headline": {"type": "string"},
                "summary": {"type": "string"},
                "score": {"type": "string", "enum": ["A", "B", "C", "D", "E"]},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "weaknesses": {"type": "array", "items": {"type": "string"}},
                "trend": {"type": "string", "enum": ["improving", "stable", "declining"]},
                "analysis": {"type": "string"},
            },
            "required": ["headline", "summary", "score", "strengths", "weaknesses", "trend", "analysis"],
        },
        "outlook": {
            "type": "object",
            "properties": {
                "version_forecasts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "version": {"type": "string"},
                            "optimistic": {"type": "string"},
                            "realistic": {"type": "string"},
                            "pessimistic": {"type": "string"},
                            "key_risk": {"type": "string"},
                        },
                        "required": ["version", "optimistic", "realistic", "pessimistic", "key_risk"],
                    },
                },
                "accuracy_forecast": {"type": "string"},
                "resource_risks": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["version_forecasts", "accuracy_forecast", "resource_risks"],
        },
        "recommended_actions": {
            "type": "array",
            "minItems": 3,
            "maxItems": 5,
            "items": {
                "type": "object",
                "properties": {
                    "priority": {"type": "integer"},
                    "category": {"type": "string"},
                    "title": {"type": "string"},
                    "rationale": {"type": "string"},
                    "action_summary": {"type": "string"},
                    "action_steps": {"type": "array", "minItems": 2, "items": {"type": "string"}},
                    "expected_effect": {"type": "string"},
                },
                "required": ["priority", "category", "title", "rationale", "action_summary", "action_steps", "expected_effect"],
            },
        },
        "next_review_focus": {"type": "string"},
    },
    "required": ["team_evaluation", "outlook", "recommended_actions", "next_review_focus"],
}


def call_ollama(messages_or_prompt, config: dict, use_chat: bool = True) -> str:
    """Ollama APIを呼び出す（chat/generate自動切替）"""
    ollama_config = config.get("ollama", {})
    url = ollama_config.get("url", "http://localhost:11434")
    model = ollama_config.get("model", "qwen3.5:9b")
    options = ollama_config.get("options", {})

    # think はリクエスト直下パラメータ（Ollama 0.20+ の reasoning model 向け）。
    # options に入れても "invalid option" 警告が出て無視される
    options.pop("think", None)

    if use_chat:
        # chat API（gemma4向け: プレフィル対応）
        payload = {
            "model": model,
            "messages": messages_or_prompt,
            "format": OUTPUT_SCHEMA,
            "stream": False,
            "think": False,
            "options": options,
        }
        endpoint = f"{url}/api/chat"
    else:
        # generate API（qwen向け: 単一プロンプトで精度が高い）
        payload = {
            "model": model,
            "prompt": messages_or_prompt,
            "format": "json",
            "stream": False,
            "think": False,
            "options": options,
        }
        endpoint = f"{url}/api/generate"

    print(f"モデル: {model} ({'chat' if use_chat else 'generate'} API)", file=sys.stderr)
    print(f"推論開始...", file=sys.stderr)

    start = time.time()
    response = requests.post(endpoint, json=payload, timeout=300)
    elapsed = time.time() - start

    response.raise_for_status()
    result = response.json()

    print(f"推論完了: {elapsed:.1f}秒", file=sys.stderr)

    if "eval_count" in result:
        tokens = result["eval_count"]
        tps = tokens / elapsed if elapsed > 0 else 0
        print(f"トークン数: {tokens}, 速度: {tps:.1f} tokens/sec", file=sys.stderr)

    if use_chat:
        message = result.get("message", {})
        text = message.get("content", "")
        if not text:
            thinking = message.get("thinking", "")
            if thinking:
                print(f"注: thinkingフィールドから応答を取得", file=sys.stderr)
                text = thinking
    else:
        text = result.get("response", "")
        thinking = result.get("thinking", "")
        if not text and thinking:
            print(f"注: thinkingフィールドから応答を取得", file=sys.stderr)
            text = thinking

    print(f"  応答: ({len(text)}文字) {text[:100]}", file=sys.stderr)
    return text


def validate_output(output: dict) -> list[str]:
    """出力JSONの構造を検証"""
    errors = []

    required_keys = ["team_evaluation", "outlook", "recommended_actions", "next_review_focus"]
    for key in required_keys:
        if key not in output:
            errors.append(f"必須フィールド '{key}' がありません")

    eval_data = output.get("team_evaluation", {})
    if eval_data:
        if "score" in eval_data and eval_data["score"] not in ["A", "B", "C", "D", "E"]:
            errors.append(f"スコアが不正です: {eval_data['score']} (A〜Eのいずれか)")
        if "trend" in eval_data and eval_data["trend"] not in ["improving", "stable", "declining"]:
            errors.append(f"トレンドが不正です: {eval_data['trend']}")

    actions = output.get("recommended_actions", [])
    if len(actions) < 3:
        errors.append(f"推奨アクションが{len(actions)}件（3件以上必要）")
    elif len(actions) > 5:
        errors.append(f"推奨アクションが多すぎます: {len(actions)}件 (5件以下)")

    # version_forecasts の計算式が記号のままなら警告
    import re
    forecasts = (output.get("outlook") or {}).get("version_forecasts", [])
    for vf in forecasts:
        for key in ("optimistic", "realistic", "pessimistic"):
            val = vf.get(key, "") or ""
            if re.search(r"残工数[×xX*]", val) or "×係数" in val or val.endswith("予想工数"):
                errors.append(f"{vf.get('version','?')} {key}: 計算式に記号が残っています ({val})")

    return errors


def analyze(summary_path: str, config: dict, max_retries: int = 2) -> dict:
    """要約JSONを分析して結果を返す"""
    with open(summary_path, "r", encoding="utf-8") as f:
        summary = json.load(f)

    summary_json = json.dumps(summary, ensure_ascii=False, indent=2)

    prompts_dir = config.get("paths", {}).get("prompts", "./prompts")
    model = config.get("ollama", {}).get("model", "")
    model_base = model.split(":")[0]
    system_prompt, output_format = load_prompt(prompts_dir, model)

    # モデルごとにAPI方式を切り替え
    use_chat = (model_base == "gemma4")

    if use_chat:
        # gemma4: chat API + プレフィル
        messages = build_messages(system_prompt, output_format, summary_json, summary, model)
        api_input = messages
        prefix = ""
        if messages and messages[-1]["role"] == "assistant":
            prefix = messages[-1]["content"]
    else:
        # qwen等: generate API（単一プロンプト、生JSONで精度が高い）
        api_input = f"""{system_prompt}

## 入力データ
以下はチームの工数データの要約です：

```json
{summary_json}
```

## 出力形式（厳守）
以下のJSON形式に正確に従って回答してください。このスキーマ以外の構造で回答しないでください。

{output_format}"""
        prefix = ""

    for attempt in range(max_retries + 1):
        if attempt > 0:
            print(f"リトライ {attempt}/{max_retries}...", file=sys.stderr)

        raw_response = call_ollama(api_input, config, use_chat=use_chat)

        # プレフィルの処理（chat API使用時のみ）
        if prefix and not raw_response.lstrip().startswith('{'):
            raw_response = prefix + raw_response

        # JSON解析
        try:
            # thinking tagを含む場合の対応
            cleaned = raw_response.strip()
            # デバッグ: 生の応答を表示
            print(f"--- 生の応答（先頭500文字） ---", file=sys.stderr)
            print(cleaned[:500], file=sys.stderr)
            print(f"--- 応答終了（全{len(cleaned)}文字） ---", file=sys.stderr)
            # <think>...</think> タグを除去
            import re
            cleaned = re.sub(r'<think>.*?</think>', '', cleaned, flags=re.DOTALL).strip()
            # JSONブロックを抽出（```json ... ``` で囲まれている場合）
            json_match = re.search(r'```json\s*(.*?)\s*```', cleaned, flags=re.DOTALL)
            if json_match:
                cleaned = json_match.group(1).strip()
            # それでもJSONでない場合、最初の { から最後の } までを抽出
            if cleaned and cleaned[0] != '{':
                brace_start = cleaned.find('{')
                brace_end = cleaned.rfind('}')
                if brace_start >= 0 and brace_end > brace_start:
                    cleaned = cleaned[brace_start:brace_end + 1]
            analysis = json.loads(cleaned)
        except json.JSONDecodeError as e:
            print(f"JSON解析エラー: {e}", file=sys.stderr)
            print(f"クリーニング後の先頭200文字: {cleaned[:200]}", file=sys.stderr)
            if attempt < max_retries:
                continue
            raise ValueError(f"JSONの解析に失敗しました（{max_retries + 1}回試行）: {e}")

        # 検証
        errors = validate_output(analysis)
        if errors:
            print(f"検証エラー: {errors}", file=sys.stderr)
            if attempt < max_retries:
                continue
            print(f"警告: 検証エラーがありますが結果を出力します", file=sys.stderr)

        # メタデータ付与
        result = {
            "meta": {
                "generated_at": datetime.now().isoformat(),
                "model": config.get("ollama", {}).get("model", "unknown"),
                "source_summary": summary_path,
                "analysis_period": _detect_period(summary),
            },
            **analysis,
        }

        return result

    raise RuntimeError("分析に失敗しました")


def _detect_period(summary: dict) -> str:
    """要約データから分析期間を推定"""
    trend = summary.get("monthly_trend", [])
    if trend:
        first = trend[0].get("month", "?")
        last = trend[-1].get("month", "?")
        return f"{first} ~ {last}"
    return "不明"


def main():
    parser = argparse.ArgumentParser(description="要約JSON → LLM推論 → 結果JSON")
    parser.add_argument("--input", "-i", required=True, help="要約JSONファイルのパス")
    parser.add_argument("--output", "-o", default=None, help="出力先（省略時は標準出力）")
    parser.add_argument("--config", "-c", default="config.yaml", help="設定ファイル")
    parser.add_argument("--model", "-m", default=None, help="モデル名（config.yamlを上書き）")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.model:
        config.setdefault("ollama", {})["model"] = args.model

    result = analyze(args.input, config)

    output_json = json.dumps(result, ensure_ascii=False, indent=2)

    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"結果JSONを出力しました: {args.output}", file=sys.stderr)
    else:
        print(output_json)


if __name__ == "__main__":
    main()
