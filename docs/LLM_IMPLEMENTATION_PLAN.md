# ローカルLLM分析機能 - 実装計画

> **作成日**: 2026-03-15
> **関連ドキュメント**: [構想メモ](./LLM_ANALYSIS_CONCEPT.md) / [アーキテクチャ](./LLM_ANALYSIS_ARCHITECTURE.md)
> **作業分担**: [ワークフロー](./LLM_WORKFLOW.md)

---

## 全体像

```
Phase 1          Phase 2            Phase 3           Phase 4
品質検証    →    バックエンド構築  →  データ連携整備  →  フロントエンド統合
(1〜2週間)       (1〜2週間)          (1週間)            (1〜2週間)
```

---

## Phase 1: LLM出力の品質検証

### 目的
1人分の実データでプロンプトを試し、出力が実用に耐えるか判断する。

### 1-1. 要約スクリプト作成（summarize.py）

バックアップJSONを読み込み、LLM入力用の要約JSONに変換する。

**入力**: バックアップJSON（`工数管理_バックアップ_*.json`）
**出力**: 要約JSON（構想メモ §6.2 の形式）

**集計内容**:
| 項目 | データソース | 集計ロジック |
|------|------------|------------|
| 全体精度 | estimates + actuals | Σactual / Σestimate × 100 |
| バージョン別 | estimates + actuals + remainingEstimates | 進捗率、EAC、超過タスク数 |
| 工程別 | estimates + actuals | UI/PG/PT/IT/ST 各精度 |
| メンバー別 | estimates + actuals | 個人精度、得意/苦手工程 |
| 月次トレンド | actuals（date別） | 月別の見積・実績・精度推移 |
| キャパシティ | settings + estimates | 稼働日数 × 人数 vs 見積合計 |
| 異常値 | estimates + actuals | 超過率50%以上のタスク |

**既存コードからの移植元**:
- `calculateProgress()` → 進捗計算ロジック
- `renderInsights()` → 異常検知・警告ロジック
- `renderMemberPerformance()` → メンバー分析ロジック

### 1-2. 推論スクリプト作成（analyze.py）

要約JSONをLLMに渡し、分析結果JSONを取得する。

**処理フロー**:
```
要約JSON読み込み → プロンプト構築 → Ollama API呼び出し → JSON検証 → 結果出力
```

**Ollama API呼び出し**:
```python
POST http://localhost:11434/api/generate
{
    "model": "gemma2:9b",  # 検証時に決定
    "prompt": system_prompt + summary_json,
    "format": "json",
    "stream": false,
    "options": {
        "temperature": 0.3,  # 安定性重視
        "num_predict": 2048
    }
}
```

**出力検証**:
- JSON構文チェック
- 必須フィールドの存在確認
- スコア値の範囲チェック（A〜E）
- 推奨アクション数のチェック（3〜5件）

### 1-3. プロンプトテンプレート作成

構想メモ §6.3, §6.4 をベースに、テンプレートファイルとして分離。

```
prompts/
├── system_prompt.txt       # システムプロンプト
├── output_format.txt       # 出力フォーマット指定
└── few_shot_example.json   # Few-shot例（構想メモ §8 のサンプル出力）
```

### 1-4. 品質検証

**検証観点**:
| 観点 | 合格基準 |
|------|---------|
| JSON出力の安定性 | 10回中9回以上で有効なJSON出力 |
| 数値の正確性 | 入力データの数値を正しく引用している |
| 提案の具体性 | 「明日から実行できる」粒度の提案がある |
| ハルシネーション | データにない数値や事実を捏造していない |
| 日本語品質 | 自然な日本語で読みやすい |

**検証用モデル候補**:
| モデル | サイズ | 特徴 |
|--------|--------|------|
| gemma2:9b | 9B | Google製、日本語そこそこ |
| llama3.1:8b | 8B | Meta製、汎用性高い |
| qwen2.5:14b | 14B | 日本語が強い、要VRAM 12GB+ |
| qwen2.5:7b | 7B | 日本語強い + 軽量 |

---

## Phase 2: バックエンドパイプライン構築

### 2-1. パイプラインスクリプト（run_pipeline.sh）

```bash
#!/bin/bash
# 1. バックアップ取得
rsync -av shared_folder/backups/ /data/backups/

# 2. チームごとに推論（順次実行でGPU負荷分散）
for team in $(cat config.yaml | yq '.teams[]'); do
    python summarize.py --team "$team"
    python analyze.py --team "$team"
done

# 3. 結果を配信
rsync -av /data/results/ app_server:/var/www/manhour/analysis/

# 4. ログ・通知
echo "[$(date)] Pipeline completed" >> /var/log/manhour-analysis.log
```

### 2-2. 設定ファイル（config.yaml）

```yaml
ollama:
  url: http://localhost:11434
  model: gemma2:9b          # Phase 1の検証結果で確定

teams:
  - name: team-a
    backup_dir: /data/backups/team-a
    display_name: チームA

paths:
  backups: /data/backups
  summaries: /data/summaries
  results: /data/results
  prompts: /opt/manhour-analysis/prompts

schedule:
  frequency: weekly          # daily / weekly
  cron: "0 2 * * 1"         # 毎週月曜 2:00
```

### 2-3. エラーハンドリング

| エラー | 対処 |
|--------|------|
| Ollamaが起動していない | リトライ3回 → 失敗ログ → メール通知 |
| バックアップが古い（7日以上前） | 警告ログ、前回結果を維持 |
| JSON出力が不正 | リトライ2回 → 前回結果を維持 |
| ディスク容量不足 | 古い中間ファイルを自動削除 |

---

## Phase 3: データ連携整備

### 3-1. バックアップフロー改善

**案A: 手動（初期）**
- 既存のバックアップ機能でJSONエクスポート
- 共有フォルダに手動配置

**案B: 半自動（推奨）**
- バックアップ保存先に共有フォルダを指定可能にする
- フロントエンドに「分析用データ送信」ボタンを追加
- fetch POST でLLMサーバーに直接送信

### 3-2. チーム識別

- 設定画面に「チーム名」入力欄を追加
- バックアップJSONに `teamId` フィールドを追加
- LLMサーバー側で `teamId` でフォルダ振り分け

---

## Phase 4: フロントエンド統合

### 4-1. 新モジュール作成（js/llm-analysis.js）

```javascript
// 主要関数
export async function loadLLMAnalysis(teamId) { ... }
export function renderLLMAnalysis(analysisData) { ... }
export function renderTeamEvaluation(evaluation) { ... }
export function renderOutlook(outlook) { ... }
export function renderRecommendedActions(actions) { ... }
```

**処理フロー**:
```
レポートタブ表示
  → fetch('/analysis/team-a.json')
    → 200: AI分析セクション描画
    → 404: セクション非表示（graceful degradation）
```

### 4-2. HTML追加箇所

`index.html` のレポートセクション内、`#reportDetailView` の後に配置:

```html
<!-- AI分析セクション（LLM結果がある場合のみ表示） -->
<div id="llmAnalysisSection" style="display: none;">
  <div class="section-header">
    <h3>AI分析</h3>
    <span id="llmAnalysisDate" class="analysis-date"></span>
  </div>
  <div id="llmTeamEvaluation"></div>
  <div id="llmOutlook"></div>
  <div id="llmRecommendedActions"></div>
</div>
```

### 4-3. 表示コンポーネント

| コンポーネント | 表示内容 |
|--------------|---------|
| チーム評価カード | 総合評価（A〜E）、強み・弱み、トレンド矢印 |
| 展望セクション | バージョン完了予測（楽観/現実/悲観）、リスク一覧 |
| 推奨アクション | 優先度順カード、カテゴリバッジ、根拠・効果の折りたたみ |
| メタ情報 | 分析日時、使用モデル、対象期間 |

### 4-4. レポート設定への統合

`reportSettings` に以下を追加:

```javascript
llmAnalysisEnabled: true  // AI分析セクションの表示/非表示
```

---

## ディレクトリ構成（最終形）

```
LLMサーバー側:
/opt/manhour-analysis/
├── summarize.py          # バックアップ → 要約JSON
├── analyze.py            # 要約 → LLM推論 → 結果JSON
├── run_pipeline.sh       # パイプライン実行
├── config.yaml           # 設定
├── requirements.txt      # Python依存パッケージ
├── prompts/
│   ├── system_prompt.txt
│   ├── output_format.txt
│   └── few_shot_example.json
└── tests/
    ├── test_summarize.py
    └── sample_backup.json  # テスト用データ

フロントエンド側（このリポジトリ）:
js/
├── llm-analysis.js       # AI分析の取得・表示（新規）
└── report.js             # 既存（統合コード追加）
```

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| 小モデルで日本語品質が低い | 提案が抽象的・不自然 | qwen2.5系を優先検証、Few-shot例を充実 |
| JSON出力が不安定 | フロントで表示エラー | リトライ + 出力検証 + フォールバック |
| データ連携が手動で定着しない | 分析結果が古いまま | Phase 3で半自動化を早めに実施 |
| GPU性能不足 | 推論時間が長すぎる | 7Bモデルに絞る、推論分割 |
