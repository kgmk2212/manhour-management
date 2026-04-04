#!/usr/bin/env python3
"""結果JSONをまとめて比較HTMLを生成"""
import json
from pathlib import Path

# 比較対象（時系列順）
RESULTS = [
    # (ラベル, ファイル名, 備考)
    ("v1 qwen3.5", "qwen3.5_20260404_221200.json", "初版プロンプト / 旧テストデータ"),
    ("v1 gemma4", "gemma4_20260404_221201.json", "初版プロンプト / 旧テストデータ"),
    ("v2 qwen3.5", "qwen3.5_v2_20260404_223540.json", "summary+detail分離 / 旧テストデータ"),
    ("v2 gemma4", "gemma4_v2_20260404_223542.json", "summary+detail分離 / 旧テストデータ"),
    ("v3 qwen3.5", "qwen3.5_v3_20260404_224923.json", "多角的観点プロンプト / 旧テストデータ"),
    ("v3 gemma4", "gemma4_v3_20260404_224924.json", "多角的観点プロンプト / 旧テストデータ"),
    ("v3+新データ qwen3.5", "qwen3.5_v3_newdata_20260404_232147.json", "多角的観点 / 新テストデータ(summarize未強化)"),
    ("v3+新データ gemma4", "gemma4_v3_newdata_20260404_232149.json", "多角的観点 / 新テストデータ(summarize未強化)"),
    ("v4 qwen3.5", "qwen3.5_v4_20260405_002832.json", "summarize強化 / 新テストデータ"),
    ("v4 gemma4", "gemma4_v4_20260405_002833.json", "summarize強化→フォーマット崩壊"),
    ("v4f gemma4", "gemma4_v4f_20260405_012542.json", "assistant prefill→フォーマット復活、数値捏造"),
    ("v5 gemma4", "gemma4_v5_20260405_015817.json", "データ引用強化プロンプト"),
    ("v5 qwen3.5", "qwen3.5_v5_20260405_023342.json", "chat API+key findings（退化）"),
    ("v6 gemma4", "gemma4_v6_20260405_023343.json", "key findings抽出+chat API"),
    ("v5b qwen3.5", "qwen3.5_v5b_20260405_023826.json", "chat API, prefillなし（退化）"),
    ("v6b gemma4", "gemma4_v6b_20260405_023828.json", "key findings抽出（再確認）"),
    ("v6 qwen3.5", "qwen3.5_v6_20260405_024210.json", "generate API+key findings（退化）"),
    ("v7 gemma4", "gemma4_v7_20260405_024211.json", "key findings+generate/chat分離"),
    ("v6b qwen3.5", "qwen3.5_v6b_20260405_024705.json", "generate API, v4方式に復帰"),
]

results_dir = Path(__file__).parent


def load(fname):
    p = results_dir / fname
    if not p.exists():
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def esc(s):
    if s is None:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_list(items):
    if not items:
        return "-"
    return "<br>".join(f"・{esc(i)}" for i in items)


def render_actions(actions):
    if not actions:
        return "<em>なし</em>"
    parts = []
    for a in actions:
        p = a.get("priority", "?")
        cat = a.get("category", "")
        title = a.get("title", "")
        rationale = a.get("rationale", "")
        summary = a.get("action_summary", a.get("action", ""))
        steps = a.get("action_steps", [])
        effect = a.get("expected_effect", "")
        parts.append(f"""<div class="action">
<div class="action-header">#{p} [{esc(cat)}] {esc(title)}</div>
<div class="action-rationale">{esc(rationale)}</div>
<div class="action-body">{esc(summary)}</div>
{"".join(f'<div class="action-step">→ {esc(s)}</div>' for s in steps)}
<div class="action-effect">効果: {esc(effect)}</div>
</div>""")
    return "\n".join(parts)


html_parts = []
html_parts.append("""<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<title>LLM分析結果 比較</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Noto Sans JP', sans-serif; background:#f5f5f0; padding:20px; color:#1a1a1a; }
h1 { font-size:18px; margin-bottom:16px; }
.card { background:#fff; border:1px solid #ddd; border-radius:8px; padding:20px; margin-bottom:16px; }
.card-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:8px; }
.label { font-size:16px; font-weight:700; }
.note { font-size:11px; color:#888; }
.section { margin-bottom:12px; }
.section-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#888; margin-bottom:4px; }
.hero { display:flex; gap:16px; align-items:flex-start; margin-bottom:12px; }
.score { width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; flex-shrink:0; }
.score-A,.score-B { background:#ebf5ea; color:#2d5a27; border:2px solid #2d5a27; }
.score-C { background:#fff8e1; color:#b8860b; border:2px solid #b8860b; }
.score-D,.score-E { background:#fde8e8; color:#b91c1c; border:2px solid #b91c1c; }
.hero-body { flex:1; }
.headline { font-size:14px; font-weight:700; margin-bottom:4px; }
.summary { font-size:13px; line-height:1.6; color:#333; }
.trend { font-size:11px; font-weight:600; padding:2px 8px; border-radius:12px; display:inline-block; margin-top:4px; }
.trend-improving { background:#ebf5ea; color:#2d5a27; }
.trend-stable { background:#f0f0ea; color:#666; }
.trend-declining { background:#fde8e8; color:#b91c1c; }
.tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.tag { font-size:11px; padding:2px 8px; border-radius:12px; }
.tag-good { background:#ebf5ea; color:#2d5a27; }
.tag-bad { background:#fde8e8; color:#9b2c2c; }
.analysis { font-size:12px; line-height:1.7; color:#444; padding:8px 12px; background:#fafaf8; border-radius:6px; border-left:3px solid #ddd; }
.forecast { font-size:12px; line-height:1.6; color:#444; }
.forecast-row { display:flex; gap:8px; margin-bottom:2px; }
.forecast-label { width:30px; font-weight:600; font-size:10px; flex-shrink:0; }
.forecast-label.opt { color:#2d5a27; }
.forecast-label.pes { color:#b91c1c; }
.action { padding:8px 10px; background:#fafaf8; border-radius:6px; margin-bottom:6px; border-left:3px solid #1d6fa5; }
.action-header { font-size:12px; font-weight:600; color:#1a1a1a; }
.action-rationale { font-size:11px; color:#666; margin:2px 0; }
.action-body { font-size:12px; color:#333; }
.action-step { font-size:11px; color:#555; padding-left:12px; }
.action-effect { font-size:11px; color:#1d6fa5; font-weight:500; margin-top:2px; }
.broken { padding:12px; background:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:12px; color:#856404; }
.review { font-size:11px; color:#666; padding:8px 12px; background:#fafaf8; border-radius:6px; border-left:3px solid #aaa; }
</style></head><body>
<h1>LLM工数分析 — 出力比較</h1>
""")

for label, fname, note in RESULTS:
    data = load(fname)
    if data is None:
        html_parts.append(f'<div class="card"><div class="card-header"><span class="label">{esc(label)}</span><span class="note">{esc(note)}</span></div><div class="broken">ファイルなし</div></div>')
        continue

    te = data.get("team_evaluation", {})
    ol = data.get("outlook", {})
    actions = data.get("recommended_actions", [])
    nrf = data.get("next_review_focus", "")

    # フォーマット崩壊チェック
    if not te.get("headline") and not te.get("score"):
        raw = json.dumps(data, ensure_ascii=False, indent=2)
        html_parts.append(f'<div class="card"><div class="card-header"><span class="label">{esc(label)}</span><span class="note">{esc(note)}</span></div><div class="broken">フォーマット崩壊 — 独自構造で出力<pre style="font-size:10px;max-height:200px;overflow:auto;margin-top:8px">{esc(raw[:1500])}</pre></div></div>')
        continue

    score = te.get("score", "?")
    trend = te.get("trend", "")

    forecasts_html = ""
    for vf in ol.get("version_forecasts", []):
        forecasts_html += f"""<div style="margin-bottom:6px"><strong>{esc(vf.get('version',''))}</strong>
<div class="forecast-row"><div class="forecast-label opt">楽観</div><div>{esc(vf.get('optimistic',''))}</div></div>
<div class="forecast-row"><div class="forecast-label">現実</div><div>{esc(vf.get('realistic',''))}</div></div>
<div class="forecast-row"><div class="forecast-label pes">悲観</div><div>{esc(vf.get('pessimistic',''))}</div></div>
<div style="font-size:11px;color:#b91c1c">⚠ {esc(vf.get('key_risk',''))}</div></div>"""

    html_parts.append(f"""<div class="card">
<div class="card-header"><span class="label">{esc(label)}</span><span class="note">{esc(note)}</span></div>

<div class="hero">
  <div class="score score-{score}">{score}</div>
  <div class="hero-body">
    <div class="headline">{esc(te.get('headline',''))}</div>
    <div class="summary">{esc(te.get('summary',''))}</div>
    <span class="trend trend-{trend}">{'▲ 改善' if trend=='improving' else '● 安定' if trend=='stable' else '▼ 悪化'}</span>
  </div>
</div>

<div class="tags">
  {"".join(f'<span class="tag tag-good">{esc(s)}</span>' for s in te.get('strengths',[]))}
  {"".join(f'<span class="tag tag-bad">{esc(w)}</span>' for w in te.get('weaknesses',[]))}
</div>

{"<div class='section'><div class='section-title'>詳細分析</div><div class='analysis'>" + esc(te.get('analysis','')) + "</div></div>" if te.get('analysis') else ""}

<div class="section"><div class="section-title">展望</div>
<div class="forecast">{forecasts_html}</div>
<div style="font-size:12px;color:#444;margin-top:6px">{esc(ol.get('accuracy_forecast',''))}</div>
<div style="font-size:11px;color:#666;margin-top:4px">{render_list(ol.get('resource_risks',[]))}</div>
</div>

<div class="section"><div class="section-title">推奨アクション</div>
{render_actions(actions)}
</div>

<div class="review"><strong>次回注視:</strong> {esc(nrf)}</div>
</div>""")

html_parts.append("</body></html>")

out = results_dir / "comparison.html"
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(html_parts))
print(f"出力: {out}")
