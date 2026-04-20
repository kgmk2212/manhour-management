# ローカルLLM分析機能 - 実装計画

> **作成日**: 2026-03-15
> **最終更新**: 2026-04-20（方針転換: ブラウザ直叩き方式に変更）
> **関連ドキュメント**: [構想メモ](./LLM_ANALYSIS_CONCEPT.md) / [アーキテクチャ](./LLM_ANALYSIS_ARCHITECTURE.md) / [ワークフロー](./LLM_WORKFLOW.md)

---

## 更新履歴

| 日付 | 更新内容 |
|------|---------|
| 2026-03-15 | 初版（4 フェーズ: Phase 1 品質検証 → Phase 2 バックエンドパイプライン → Phase 3 データ連携 → Phase 4 フロント統合） |
| 2026-04-05 | Phase 1 と Phase 4 を実装完了 |
| **2026-04-20** | **方針転換。旧 Phase 2/3 (サーバーパイプライン + cron + 共有フォルダ) を廃止し、ブラウザ直叩き方式の新 Phase 2/3 に差し替え** |

---

## 方針転換の要点

原計画は「社内 LAN + マルチチーム + 専用 GPU サーバー + cron」を前提としていたが、実運用は「**GitHub Pages + 1 人運用 + ローカル Ollama**」であり、前提が成立しない。

そのため:
- **旧 Phase 2**（`run_pipeline.sh` / cron / 共有フォルダ / マルチチーム対応）→ 廃止
- **旧 Phase 3**（`teamId` フィールド / 共有フォルダ配置運用 / 自動送信 API）→ 廃止
- **新 Phase 2**: `summarize.py` の JavaScript 移植
- **新 Phase 3**: ブラウザから Ollama を直接呼ぶ UI の実装（CORS 設定含む）

詳細は [構想メモ §2.5](./LLM_ANALYSIS_CONCEPT.md#25-検討した他の方式と再評価) を参照。

---

## 全体像（新）

```
Phase 1 ✅           Phase 2 🔜            Phase 3 🔜           Phase 4 ✅
品質検証       →    要約器の JS 移植   →   ブラウザから      →   AI 分析セクション表示
(Python完了)        (新規)               Ollama 直叩き        (結果 JSON 経由で稼働中)
```

| Phase | 状況 | 成果物 |
|-------|------|-------|
| Phase 1 | ✅ 完了（2026-04-05） | `llm-analysis/summarize.py` `analyze.py` `prompts/*` + 多数の試行結果 |
| Phase 2 | 🔜 未着手 | `js/llm-summarize.js` + 単体検証 |
| Phase 3 | 🔜 未着手 | `js/llm-analyze.js` + 「分析を実行」ボタン UI + CORS 手順ドキュメント |
| Phase 4 | ✅ 完了（2026-04-05） | `js/ai-analysis.js` + `analysis/latest.json` |

---

## Phase 1: LLM 出力の品質検証 ✅ 完了

### 完了した成果物

- `llm-analysis/summarize.py` — バックアップ JSON → 要約 JSON
- `llm-analysis/analyze.py` — 要約 JSON → Ollama 推論 → 結果 JSON（chat/generate API 自動切替）
- `llm-analysis/prompts/`
  - `system_prompt.txt` — 共通システムプロンプト
  - `system_prompt.qwen3.5.txt` — qwen3.5 用（generate API）
  - `system_prompt.gemma4.txt` — gemma4 用（chat + prefill）
  - `output_format.txt` — JSON 出力スキーマ仕様
- `llm-analysis/tests/sample_backup.json` `sample_backup_v2.json` — テストデータ
- `llm-analysis/data/results/*.json` — qwen3.5 / gemma4 で計 20 回以上の試行結果
- `llm-analysis/data/results/comparison.html` — モデル比較ビューア
- `llm-analysis/run_test.sh` — ワンショット検証スクリプト

### 検証済み観点

- ✅ JSON 出力の安定性
- ✅ 数値引用の正確性
- ✅ 提案の具体性
- ✅ ハルシネーション抑制（要点テキスト事前提示 + プレフィル + スキーマ強制）
- ✅ 日本語品質
- ⏸ 運用モデルの最終確定 — Phase 3 で実データ運用しながら決定

---

## Phase 2: 要約器の JS 移植 🔜

### 目的

ブラウザ内で localStorage データから要約 JSON を生成できるようにする。`summarize.py` のロジックを JavaScript に忠実に移植する。

### 2-1. 新規モジュール作成: `js/llm-summarize.js`

**入力**: `window.state` が持つ以下のデータ
- `estimates` — 見積
- `actuals` — 実績
- `remainingEstimates` — 残見積
- `schedules` — スケジュール
- `members` — メンバー
- `settings` — 稼働日数等

**出力**: 要約 JSON（`summarize.py` と同じスキーマ）

**移植対象の関数/集計**（`summarize.py` 参照）:

| 出力フィールド | 移植元の集計 |
|--------------|-------------|
| `overall` | `calculate_overall` |
| `by_version` | `calculate_by_version` |
| `by_process` | `calculate_by_process` |
| `by_member` | `calculate_by_member` |
| `member_monthly` | `calculate_member_monthly` |
| `monthly_trend` | `calculate_monthly_trend` |
| `task_sizes` | `calculate_task_sizes` |
| `capacity` | `calculate_capacity` |
| `anomalies` | `calculate_anomalies` |

既存の `js/report.js` に近い計算が多いので、ユーティリティ関数を流用できる部分は流用する（`calculateProgress` など）。

### 2-2. 検証方法

`tests/sample_backup.json` をブラウザで読み込ませ、`js/llm-summarize.js` の出力が `summarize.py` の出力と**完全一致**することを確認する。

### 2-3. 受け入れ基準

- [ ] `sample_backup.json` に対する JS 版と Python 版の要約 JSON が一致（キーと値の両方）
- [ ] `sample_backup_v2.json` でも一致
- [ ] 実データ（開発者の実 localStorage）でもランタイムエラーなく要約 JSON を生成

### 2-4. 想定工数

- 実装: 0.5〜1 日
- 検証: 0.5 日

---

## Phase 3: ブラウザから Ollama 直叩き 🔜

### 目的

要約 JSON を Ollama に送信し、結果を AI 分析セクションに描画する。UI は「分析を実行」1 クリックで完結させる。

### 3-1. 新規モジュール作成: `js/llm-analyze.js`

`analyze.py` の相当機能を JS に移植する。主要処理:

```javascript
async function runLlmAnalysis(summary, options) {
    // 1. モデル別のシステムプロンプトをビルド
    // 2. extract_key_findings 相当の要点抽出
    // 3. fetch POST ${OLLAMA_URL}/api/chat       ← URL は定数化せず設定から取得
    //    body: { model, messages, format: OUTPUT_SCHEMA, options }
    // 4. ストリーミング受信 → 進捗コールバック
    // 5. JSON パース、<think> タグ除去、```json フェンス除去
    // 6. スキーマ検証 (最大 2 リトライ)
    // 7. meta 付与して返却
}
```

**重要**: `fetch` 先の URL は定数ではなく**設定値として取得する**設計にする。これにより、後で [E1 トンネル変種](./LLM_ANALYSIS_ARCHITECTURE.md#付録-b-トンネル変種-e1) を追加する際にコアロジックを触らずに済む。デフォルトは `http://localhost:11434`、将来トンネル URL を設定画面で切替可能にする。

### 3-2. プロンプト資産の取り込み

方針: `llm-analysis/prompts/*.txt` を JS 側にも複製する（ビルドステップを増やしたくないため）。`js/llm-prompts.js` に template literal として埋め込む。

プロンプト更新時は Python / JS 両方を書き換える必要がある。これは当面のトレードオフとして許容。

### 3-3. UI 拡張（`js/ai-analysis.js` + `index.html`）

- AI 分析セクションのヘッダーに「分析を実行」ボタンを追加
- 実行中はローディング表示（経過秒数、キャンセルボタン）
- 完了後は生成日時・使用モデル名を表示 + 「再実行」ボタン
- 結果は `localStorage["llmAnalysisResult_v1"]` にキャッシュ
- キャッシュがあればページロード時に即時描画
- エラー時のハンドリング（[アーキテクチャ §2.6](./LLM_ANALYSIS_ARCHITECTURE.md#26-エラー時の挙動) 参照）

### 3-4. CORS 設定手順のドキュメント化

初回利用時に、ユーザーに以下の設定を案内する（UI に「セットアップ手順」リンクを置く）:

```bash
# macOS
launchctl setenv OLLAMA_ORIGINS "https://kgmk2212.github.io"
launchctl stop ollama && launchctl start ollama

# Windows
setx OLLAMA_ORIGINS "https://kgmk2212.github.io"
# タスクマネージャから ollama を再起動
```

`README.md` に AI 分析機能の利用手順として追記する。

### 3-5. 受け入れ基準

- [ ] Ollama 起動 + `OLLAMA_ORIGINS` 設定済みの状態で、「分析を実行」を押すと結果が描画される
- [ ] Ollama 未起動時に適切なエラーメッセージが表示される
- [ ] CORS エラー時に対処法が表示される
- [ ] 結果がリロード後もキャッシュから復元される
- [ ] Chrome / Edge / Firefox の主要 3 ブラウザで動作確認済み
- [ ] 既存の `analysis/latest.json` フォールバックが破綻していない

### 3-6. 想定工数

- 実装: 1〜1.5 日
- 動作確認 + CORS まわりのトラブルシュート: 0.5 日

---

## Phase 4: フロントエンド統合 ✅ 完了

### 完了した成果物

- `js/ai-analysis.js` — `analysis/latest.json` を fetch、Hero + Detail Grid + Review Focus を描画
- `index.html` — 分析タブに AI 分析セクションを配置
- `style.css` — `ai-hero`, `ai-score-*`, `ai-detail-card`, `ai-action-item` 等のスタイル
- `analysis/latest.json` — gemma4 で生成した実結果（2026-04-05 時点）

### Phase 3 完了後に発生する追加作業

Phase 3 で実装する「分析を実行」ボタンの動線に合わせ、既存の fetch 挙動を「初回は JSON ファイルを fetch、以降はキャッシュ優先」に調整する。

---

## リソース・依存関係

### 既存資産（流用）
- `llm-analysis/summarize.py` — 移植元のソース
- `llm-analysis/analyze.py` — 移植元のソース
- `llm-analysis/prompts/*.txt` — プロンプト資産
- `js/ai-analysis.js` — レンダリングロジック（拡張して再利用）
- `js/state.js` / `js/storage.js` — データ取得口

### 新規依存
- ユーザー側: `OLLAMA_ORIGINS` 環境変数の設定が必要（初回セットアップのみ）

### 廃止される成果物
- なし。Python パイプライン（`llm-analysis/`）は CLI 検証用途として残す。

---

## リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| JS と Python で要約ロジックが乖離する | 結果の信頼性低下 | Phase 2 の受け入れ基準で完全一致を検証 |
| プロンプトを Python / JS 両方に複製する運用負荷 | 改修時の同期漏れ | 当面は手動同期。頻度が高くなればビルドステップ導入を検討 |
| Ollama セットアップが利用障壁になる | 機能が使われない | README に手順を明示、エラー時に具体的な対処法を表示 |
| Mixed Content ブロック | 推論が動かない | localhost は Secure Context 例外扱いだが Phase 3 の 3 ブラウザ実機検証で確認 |
| 小モデルでの JSON 出力不安定 | 描画失敗 | Phase 1 で実装済みのリトライ + スキーマ強制を JS に移植 |
| マルチユーザ運用に戻す必要が生じた場合 | アーキテクチャ再設計 | [構想メモ §4 将来の拡張](./LLM_ANALYSIS_CONCEPT.md#将来マルチユーザ運用に戻す場合) に候補を記載済み |
