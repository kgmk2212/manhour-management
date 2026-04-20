# ローカルLLM分析機能 - 実装構成案

> **ステータス**: ブラウザ直叩き方式で再設計中（2026-04-20）
> **関連ドキュメント**: [構想メモ](./LLM_ANALYSIS_CONCEPT.md) / [実装計画](./LLM_IMPLEMENTATION_PLAN.md)

---

## 更新履歴

| 日付 | 更新内容 |
|------|---------|
| 2026-02-24 | 初版（社内 LAN + 別 GPU サーバー + cron による配信構成） |
| **2026-04-20** | **新方針に差し替え（ブラウザ直叩き構成）。旧構成は §A 付録に退避** |

---

## 1. システム全体構成（新方針）

```
┌───────────────────────────────────────────────────────────────┐
│                     開発者マシン (ローカル)                      │
│                                                               │
│  ┌─────────────────────────────────────────┐                 │
│  │ ブラウザ (Chrome / Edge / Firefox)         │                 │
│  │  URL: https://kgmk2212.github.io/...     │                 │
│  │                                         │                 │
│  │  ┌───────────────────────────────────┐  │                 │
│  │  │  localStorage                     │  │                 │
│  │  │   estimates, actuals,             │  │                 │
│  │  │   remainingEstimates, settings    │  │                 │
│  │  └────────────┬──────────────────────┘  │                 │
│  │               │                         │                 │
│  │               ▼                         │                 │
│  │  ┌───────────────────────────────────┐  │                 │
│  │  │ js/llm-summarize.js (新規)         │  │                 │
│  │  │   summarize.py の JS 版            │  │                 │
│  │  │   → 要約 JSON (in-memory)          │  │                 │
│  │  └────────────┬──────────────────────┘  │                 │
│  │               │                         │                 │
│  │               ▼                         │                 │
│  │  ┌───────────────────────────────────┐  │                 │
│  │  │ js/llm-analyze.js (新規)           │  │                 │
│  │  │   analyze.py の JS 版              │  │                 │
│  │  │   fetch ──▶ http://localhost:11434│  │                 │
│  │  └────────────┬──────────────────────┘  │                 │
│  │               │                         │                 │
│  │               ▼                         │                 │
│  │  ┌───────────────────────────────────┐  │                 │
│  │  │ js/ai-analysis.js (既存、拡張)     │  │                 │
│  │  │   結果 JSON を描画                  │  │                 │
│  │  │   localStorage にキャッシュ         │  │                 │
│  │  └───────────────────────────────────┘  │                 │
│  └──────────────┬──────────────────────────┘                 │
│                 │ HTTP POST                                   │
│                 │ (Mixed Content 例外: localhost)             │
│                 ▼                                             │
│  ┌──────────────────────────────────────────┐                 │
│  │ Ollama (localhost:11434)                 │                 │
│  │   OLLAMA_ORIGINS=https://kgmk2212.github.io│               │
│  │   モデル: qwen3.5:9b / gemma4            │                 │
│  └──────────────────────────────────────────┘                 │
└───────────────────────────────────────────────────────────────┘

外部配信:
  GitHub Pages ─ HTTPS ─▶ ブラウザ (静的ファイルのみ、分析処理には関与せず)
```

**ポイント**:
- サーバーサイド処理は**無し**。推論は全てローカル。
- GitHub Pages はあくまでアプリのホスティング。分析処理の入出力はブラウザ内で完結。
- `analysis/latest.json` はフォールバック用（Ollama 未起動時に直近の結果を表示）。

---

## 2. データフロー詳細

### 2.1 全体の流れ

```
[Step 1]                [Step 2]                 [Step 3]             [Step 4]
ユーザー操作              ブラウザ内処理            Ollama 呼び出し         結果描画
「分析を実行」をクリック  →  localStorage から    →  fetch POST        →  AI 分析セクションを
                          要約 JSON を生成          結果 JSON 取得        更新、キャッシュ保存
```

### 2.2 Step 1: 分析実行トリガー

```
ユーザーのブラウザ（分析タブ）
    │
    │ AI 分析セクションの「分析を実行」ボタンを押下
    │
    ▼
js/ai-analysis.js
    状態: idle → summarizing
    UI: スピナー「データを要約しています…」
```

### 2.3 Step 2: 要約生成（ブラウザ内）

```
js/llm-summarize.js (新規)
    │
    │  入力: window.state が持つアプリの全データ
    │         (estimates / actuals / remainingEstimates /
    │          schedules / members / settings)
    │
    │  処理内容 (Python 版と同等):
    │    1. overall           — 総工数 / 精度
    │    2. by_version        — バージョン別進捗・超過タスク
    │    3. by_process        — UI/PG/PT/IT/ST の精度
    │    4. by_member         — メンバー別 + 強み弱み工程
    │    5. member_monthly    — メンバー × 月 の負荷
    │    6. monthly_trend     — 月次トレンド
    │    7. task_sizes        — 大タスク検出
    │    8. capacity          — キャパシティ警告月
    │    9. anomalies         — 超過率 50% 以上のタスク
    │
    ▼
要約 JSON（in-memory オブジェクト）
```

### 2.4 Step 3: LLM 推論（Ollama へ fetch）

```
js/llm-analyze.js (新規)
    │
    │  入力: 要約 JSON + プロンプト資産
    │
    │  処理内容:
    │    1. システムプロンプトをビルド
    │       (モデル別プロンプトを切替: qwen3.5 / gemma4)
    │    2. 要点テキストを抽出（extract_key_findings 相当）
    │    3. fetch POST http://localhost:11434/api/chat
    │       {
    │         "model": "qwen3.5:9b",
    │         "messages": [{ system }, { user }],
    │         "format": <OUTPUT_SCHEMA>,
    │         "stream": true,
    │         "options": { "temperature": 0.3, "num_predict": 4096 }
    │       }
    │    4. ストリーミング受信で進捗表示
    │    5. JSON パース + スキーマ検証 (最大 2 リトライ)
    │    6. メタデータ付与（生成日時、モデル名、期間）
    │
    ▼
結果 JSON
```

### 2.5 Step 4: 結果描画とキャッシュ

```
js/ai-analysis.js (既存拡張)
    │
    │  1. 結果 JSON を既存 render() に渡す
    │  2. localStorage に保存
    │     key: "llmAnalysisResult_v1"
    │     value: JSON.stringify(result)
    │  3. UI を更新（生成日時・モデル名・再実行ボタン）
    ▼
AI 分析セクション（Hero + Detail Grid + Review Focus）
```

### 2.6 エラー時の挙動

| エラー | 対応 |
|-------|------|
| Ollama に到達不能（接続拒否） | 「Ollama が起動していません。`ollama serve` を実行してください」を表示 + 手順リンク |
| CORS エラー | 「`OLLAMA_ORIGINS` の設定が必要です」を表示 + 手順リンク |
| JSON 解析エラー | 1 回リトライ → 失敗時は生レスポンスをトグル表示、前回キャッシュで描画 |
| モデル未ダウンロード（404） | 使用可能モデル一覧（`/api/tags`）を取得して選択肢を提示 |
| タイムアウト（5 分超） | 中断 → 「時間がかかりすぎています。モデルを軽量化するか、データ量を確認してください」 |

---

## 3. 必要な新規/変更ファイル

### 新規

```
js/llm-summarize.js     — summarize.py の JS 移植（~400 行想定）
js/llm-analyze.js       — analyze.py の fetch + 検証ロジック（~200 行想定）
js/llm-prompts.js       — プロンプト資産を JS 文字列として取り込み（ビルドステップ不要のため）
```

### 変更

```
js/ai-analysis.js       — 「分析を実行」ボタン、ローディング UI、キャッシュ読み書き
index.html              — AI 分析セクションに実行ボタンとステータス表示を追加
style.css               — ローディング/エラーステートのスタイル
```

### プロンプト資産の扱い

`llm-analysis/prompts/*.txt` を JS 文字列としてそのまま取り込む。運用中の差分編集に強くするため、当面はリテラル埋め込み方式（ビルドパイプラインを増やさない）。

---

## 4. CORS / ネットワーク設定

### 4.1 Ollama の設定

```bash
# macOS (launchd で常駐)
launchctl setenv OLLAMA_ORIGINS "https://kgmk2212.github.io"
launchctl stop ollama
launchctl start ollama

# 手動起動時
OLLAMA_ORIGINS="https://kgmk2212.github.io" ollama serve
```

開発時（`http://localhost` でアプリを開く場合）も含めるなら:

```bash
OLLAMA_ORIGINS="https://kgmk2212.github.io,http://localhost:*"
```

### 4.2 Mixed Content の扱い

HTTPS の GitHub Pages から `http://localhost:11434` を叩くことになるが、主要ブラウザは **localhost / 127.0.0.1 を Secure Context と同等に扱う**ため、Mixed Content ブロック対象外。Phase 3 の実装時に Chrome / Edge / Firefox で動作確認する。

### 4.3 通信経路

```
ブラウザ ──HTTPS──▶ GitHub Pages  (静的ファイル取得のみ)
ブラウザ ──HTTP ──▶ localhost:11434  (LLM 推論、外部に出ない)
```

外部ネットワークへの LLM 関連通信は**無し**（プロンプト・データ共に手元で完結）。

---

## 5. 未決定事項

| 項目 | 選択肢 | 決定時期 |
|------|--------|---------|
| 運用モデル | qwen3.5:9b / gemma4 / llama3.1:8b 等 | Phase 3 の初期運用で確定 |
| プロンプト資産の同梱方法 | JS リテラル / fetch ローディング / ビルド時埋め込み | Phase 2 実装時 |
| ストリーミング表示 | トークンごとに描画 / 完了後まとめて描画 | Phase 3 |
| 結果のエクスポート | JSON ダウンロードボタン | 必要に応じて |
| マルチユーザ運用に戻す日のアーキテクチャ | Cloudflare Workers AI / 社内 GPU サーバー復活 / Supabase 等 | 当面棚上げ |

---

## 付録 A. 旧構成（2026-02-24 時点、参考保持）

マルチチーム運用・社内 GPU サーバー前提の構成。現運用では**廃止**したが、将来マルチユーザ運用に戻す際の参考として節だけ残す。

<details>
<summary>旧構成の詳細（クリックで展開）</summary>

### 旧サーバー構成

```
社内ネットワーク
├── 各チームリーダー PC (ブラウザ + localStorage + バックアップ JSON)
├── 共有フォルダ / NAS (backups/team-a, team-b, team-c)
├── LLM サーバー (GPU 搭載)
│   ├── /opt/manhour-analysis/ (summarize.py / analyze.py / run_pipeline.sh)
│   └── Ollama
└── アプリサーバー (静的ファイル配信 + analysis/ に結果 JSON 配置)
```

### 旧データフロー

```
バックアップ JSON を共有フォルダに配置
  → cron (02:00) が LLM サーバーへ rsync
  → summarize + analyze をチームごとに実行
  → 結果 JSON を rsync でアプリサーバーへ配信
  → ブラウザが fetch('/analysis/team-a.json') で取得
```

### 旧 cron 設定例

```
0 2 * * * /opt/manhour-analysis/run_pipeline.sh
```

詳細な図版は git 履歴 (`git show experiment/sandbox:docs/LLM_ANALYSIS_ARCHITECTURE.md`) を参照。

</details>

---

## 付録 B. トンネル変種 (E1)

本編の (1) ブラウザ直叩き方式は「自宅 PC のブラウザからしか使えない」制約がある。外出先の別端末（スマホ・別 PC）からも使いたい場合、**Cloudflare Tunnel 等で自宅の Ollama を HTTPS エンドポイントとして公開**する構成を併用できる。

### B.1 構成図

```
外出先の端末 (スマホ / 別 PC)
  └── ブラウザ
         │ HTTPS
         ▼
  GitHub Pages (アプリ本体)
         │
         │ fetch POST https://ollama.example.com/api/chat
         ▼
  Cloudflare edge (Access 認証ゲート)
         │ Zero Trust トンネル
         ▼
  自宅 PC の cloudflared 常駐プロセス
         │
         ▼
  localhost:11434 (Ollama)
```

### B.2 (1) との併用パターン

`fetch` 先を**設定値**として外出しすることで、1 人の運用者が状況に応じて使い分けられる:

| シナリオ | 使用する経路 |
|---------|-----------|
| 自宅 PC で作業中 | (1) 直叩き (`http://localhost:11434`) — データは外に出ない |
| 外出先 / 別端末 | (E1) トンネル (`https://ollama.example.com`) |

自動フォールバック実装:

```
アプリ起動時:
  1. localhost:11434/api/tags を 1 秒タイムアウトで叩く
  2. 200 → ローカルモード（(1) として動作）
  3. 失敗 + トンネル URL が設定済み → トンネルモード（(E1) として動作）
  4. 両方失敗 → 「分析を実行」ボタンを無効化 + セットアップ案内
```

アプリ側の実装差分は `fetch(OLLAMA_URL, ...)` の 1 変数のみ。設定の永続化（localStorage）とバリデーション UI が別途必要。

### B.3 デメリット一覧

| # | デメリット | 深刻度 | 備考 |
|---|---|---|---|
| 1 | PC を起動させ続ける必要がある | 中 | スリープすると推論不可 |
| 2 | **認証を必ずかける必要がある** | **高** | Ollama に認証機構が無いため、URL 漏洩 = Ollama 公開。Cloudflare Access 等で必須 |
| 3 | セットアップ工程が増える | 中 | cloudflared インストール → tunnel 作成 → 常駐化 → Access ポリシー |
| 4 | データが一度外に出る | 中 | TLS 暗号化はされるが、経路に CDN edge が入る |
| 5 | レイテンシ増 | 低 | +数百ms〜数秒（ストリーミングなら体感影響小） |
| 6 | 自宅回線の上り帯域に依存 | 低 | 結果 JSON は数 KB 程度なので通常は問題なし |
| 7 | ngrok 無料版は URL が毎回変わる | 低 | Cloudflare Tunnel なら固定 URL を無料で取得可 |
| 8 | 自宅 PC の電力・熱を消費 | 低 | 外出先からも自宅の推論リソースを消費 |
| 9 | トラブル発生源の増加 | 中 | トンネル切断 / 証明書 / DNS / Access ポリシー |
| 10 | **設定ミスで Ollama を無認証公開する事故** | **高** | 初期セットアップ時の最大リスク |

### B.4 併用時の設定差分

| 項目 | (1) ローカル | (E1) トンネル |
|------|-----------|-------------|
| CORS | `OLLAMA_ORIGINS=https://kgmk2212.github.io` | Cloudflare Tunnel / Access 側で Origin 許可ポリシー |
| 認証 | 不要（localhost） | **必須**: Cloudflare Access で自分の identity だけ許可 |
| キャッシュキー | 共通（どの経路で叩いても同じ結果） | 共通 |
| エンドポイント設定 UI | - | アプリの設定画面で URL を保存（localStorage） |

### B.5 採用判断

- **当面は (1) のみで進める**。E1 の実装優先度は低い。
- 将来「外出先のスマホからも工数分析を見たい」要望が出たら E1 を追加実装する。
- E1 採用時は Phase 3 で `js/llm-analyze.js` の `fetch` 先を設定値化しておけば、後付けで追加可能（**Phase 3 実装時に URL を定数化せず設定から読むように**しておく）。

