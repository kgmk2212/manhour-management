# ローカルLLM分析機能 - 作業分担ワークフロー

> **作成日**: 2026-03-15
> **最終更新**: 2026-04-20（ブラウザ直叩き方式に合わせて書き換え）
> **関連**: [実装計画](./LLM_IMPLEMENTATION_PLAN.md) / [構想メモ](./LLM_ANALYSIS_CONCEPT.md) / [アーキテクチャ](./LLM_ANALYSIS_ARCHITECTURE.md)

---

## 更新履歴

| 日付 | 更新内容 |
|------|---------|
| 2026-03-15 | 初版（社内 GPU サーバー運用前提のワークフロー） |
| **2026-04-20** | **方針転換に合わせて全面改訂。ブラウザ直叩き方式の新 Phase 2/3 に差し替え** |

---

## 凡例

| マーク | 意味 |
|--------|------|
| **あなた** | ユーザーが行う作業（操作・判断・実機確認） |
| **Claude** | Claude が行う作業（コード作成・ドキュメント作成） |
| **確認** | 両者で確認・レビュー |

---

## 全体の進行状況

| Phase | 状況 | 次のアクション |
|-------|------|--------------|
| Phase 1: LLM 出力の品質検証 | ✅ 完了 | — |
| Phase 2: 要約器の JS 移植 | 🔜 未着手 | Claude: `js/llm-summarize.js` の実装 |
| Phase 3: ブラウザから Ollama 直叩き | 🔜 未着手 | Claude: `js/llm-analyze.js` + UI 拡張 / あなた: CORS 設定 |
| Phase 4: フロントエンド統合 | ✅ 完了 | Phase 3 完了後に動線調整 |

---

## Phase 1: LLM 出力の品質検証 ✅ 完了

完了済み。成果物は [実装計画 Phase 1](./LLM_IMPLEMENTATION_PLAN.md#phase-1-llm-出力の品質検証--完了) 参照。

---

## Phase 2: 要約器の JS 移植

### Step 1: 実装

```
Claude ─── js/llm-summarize.js を新規作成
  │
  ├── summarize.py のロジックを JavaScript に移植
  │   (overall / by_version / by_process / by_member /
  │    member_monthly / monthly_trend / task_sizes /
  │    capacity / anomalies)
  │
  ├── 既存の js/report.js / js/utils.js の集計関数を流用できる部分は流用
  │
  └── ES Module として export（他モジュールから import 可能に）
```

### Step 2: 単体検証（Python 版との一致確認）

```
Claude ─── 検証ユーティリティを作成
  │
  ├── tests/sample_backup.json を JS で読み込み
  ├── Python 版 summarize.py の出力と diff
  └── 一致しなければ実装を修正
```

```
あなた ─── ブラウザで検証ページを開いて確認
  │
  └── コンソールに出力される「JS 版 == Python 版」を確認
```

### Step 3: 実データ検証

```
あなた ─── 自分の実 localStorage 状態を JS 版に流して動作確認
  │
  └── ランタイムエラーや未定義値が無いこと
      要約 JSON の内容が妥当であること
```

### 完了条件
- `sample_backup.json` と `sample_backup_v2.json` の両方で JS 版と Python 版の出力が一致
- 実データでもランタイムエラーなく動作

---

## Phase 3: ブラウザから Ollama 直叩き

### Step 4: Ollama 側のセットアップ（あなた）

```
あなた ─── ローカル Ollama の CORS 設定
  │
  ├── 1. OLLAMA_ORIGINS を設定
  │      # macOS
  │      launchctl setenv OLLAMA_ORIGINS "https://kgmk2212.github.io"
  │      launchctl stop ollama && launchctl start ollama
  │
  │      # 手動起動で試すなら
  │      OLLAMA_ORIGINS="https://kgmk2212.github.io" ollama serve
  │
  ├── 2. 使用モデルが入っていることを確認
  │      ollama list
  │      # qwen3.5:9b もしくは gemma4 があること
  │
  └── 3. 疎通確認
         curl -H "Origin: https://kgmk2212.github.io" \
              http://localhost:11434/api/tags
         # Access-Control-Allow-Origin が返っていればOK
```

### Step 5: 実装（Claude）

```
Claude ─── 以下を作成・変更
  │
  ├── 新規: js/llm-prompts.js
  │       llm-analysis/prompts/*.txt の内容を template literal で埋め込み
  │
  ├── 新規: js/llm-analyze.js
  │       analyze.py 相当の fetch + JSON 検証 + リトライロジック
  │       ストリーミング対応で進捗コールバック
  │
  ├── 変更: js/ai-analysis.js
  │       「分析を実行」ボタン、ローディング/エラー UI、
  │       localStorage キャッシュの読み書き
  │
  ├── 変更: index.html
  │       AI 分析セクションに実行ボタンとステータス表示を追加
  │
  ├── 変更: style.css
  │       ローディング/エラー/再実行ボタンのスタイル
  │
  └── 変更: README.md
         AI 分析機能の使い方と OLLAMA_ORIGINS 設定手順を追記
```

### Step 6: 動作確認（両者）

```
あなた ─── ブラウザで実機確認
  │
  ├── 1. GitHub Pages 上のアプリを開く
  │      https://kgmk2212.github.io/manhour-management/
  │      （または実験ブランチのプレビュー URL）
  │
  ├── 2. 分析タブ → 「分析を実行」をクリック
  │      ローディングが表示されること
  │
  ├── 3. 結果が描画されること
  │      生成日時・モデル名が表示されること
  │
  ├── 4. リロード後にキャッシュから即時描画されること
  │
  ├── 5. エラーケースの確認
  │      a. Ollama を停止して「分析を実行」→ 適切なエラー表示
  │      b. OLLAMA_ORIGINS を外して「分析を実行」→ CORS エラー表示
  │
  └── 6. Chrome / Edge / Firefox の 3 ブラウザで同様に確認
```

```
確認 ─── 結果のレビュー
  │
  ├── 分析内容が実データに即しているか
  ├── Python 版と同等以上の品質か
  ├── UI のレスポンスが許容範囲か（ローディング時間、キャンセル可能性）
  └── エラー時の案内がわかりやすいか
```

```
Claude ─── フィードバックに基づいて調整
  │
  └── プロンプト / UI / エラーメッセージを修正
```

### 完了条件
- 3 ブラウザで正常実行を確認済み
- 主要エラーパターン（Ollama 停止、CORS、モデル未ダウンロード、タイムアウト）のハンドリング動作確認済み
- キャッシュ復元が動作
- README に利用手順を追記済み

---

## Phase 4: フロントエンド統合 ✅ 完了

Phase 4 は既に完了済み。Phase 3 完了後に「初回は `analysis/latest.json` を fetch、以降はキャッシュ優先」の動線調整のみを追加する。

```
Claude ─── 動線調整
  └── js/ai-analysis.js の初期化処理を調整
     1. localStorage キャッシュがあればそれを表示
     2. なければ analysis/latest.json を fetch
     3. それも無ければ「分析を実行」ボタンのみ表示
```

---

## 全体タイムライン（新）

```
Day 1       Phase 2: 要約器の JS 移植
            ├─ Claude: js/llm-summarize.js 実装                 (0.5〜1日)
            └─ 確認:   Python 版との一致確認 + 実データ検証       (0.5日)

Day 2-3     Phase 3: ブラウザ直叩き実装
            ├─ あなた: Ollama の CORS 設定                       (0.5時間)
            ├─ Claude: js/llm-analyze.js + UI 拡張              (1〜1.5日)
            ├─ 確認:   3 ブラウザでの動作確認                     (0.5日)
            └─ Claude: フィードバックに基づく調整                  (適宜)

Day 3-4     Phase 4: 動線調整（小）
            └─ Claude: ai-analysis.js の初期化動線を調整          (0.5日)
```

合計: **約 3〜4 日**（旧計画は約 4 週間だったので、1 桁短縮）。

---

## 今すぐ始められること

**あなたの最初のアクション**:
1. Ollama が手元で動いていることを確認（`ollama list` で qwen3.5:9b / gemma4 が見えること）
2. Phase 3 着手前に `OLLAMA_ORIGINS` の設定方法を試しておく（疎通確認）

**Claude の最初のアクション**:
1. Phase 2 の `js/llm-summarize.js` を実装
2. 単体検証スクリプトを作成（ブラウザで読み込むと Python 版と diff を出す）

GO が出たら Phase 2 から着手します。
