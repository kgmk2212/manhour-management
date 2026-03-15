# ローカルLLM分析機能 - 作業分担ワークフロー

> **作成日**: 2026-03-15
> **関連**: [実装計画](./LLM_IMPLEMENTATION_PLAN.md) / [構想メモ](./LLM_ANALYSIS_CONCEPT.md)

---

## 凡例

| マーク | 意味 |
|--------|------|
| **あなた** | ユーザーが行う作業（物理操作・サーバー管理・判断） |
| **Claude** | Claudeが行う作業（コード作成・ドキュメント作成） |
| **確認** | 両者で確認・レビュー |

---

## Phase 1: LLM出力の品質検証

### Step 1: 環境準備

```
あなた ─── LLMサーバーのセットアップ
  │
  ├── 1. GPU搭載サーバーを確保（社内の既存マシン or 新規）
  │      必要スペック: VRAM 8GB以上（7Bモデル）/ 12GB以上（14Bモデル）
  │
  ├── 2. Ollamaをインストール
  │      curl -fsSL https://ollama.com/install.sh | sh
  │
  ├── 3. モデルをダウンロード（まず1つ）
  │      ollama pull qwen2.5:7b
  │      # または
  │      ollama pull gemma2:9b
  │
  └── 4. 動作確認
         ollama run qwen2.5:7b "こんにちは、テストです"
         # 日本語で応答が返ればOK
```

```
あなた ─── テスト用データの準備
  │
  └── 工数管理アプリから1人分のバックアップJSONをエクスポート
      （実データ or ダミーデータどちらでも可）
      → ファイルをClaude Codeに共有
```

### Step 2: スクリプト作成

```
Claude ─── 以下のファイルを作成
  │
  ├── summarize.py        バックアップJSON → 要約JSON変換
  ├── analyze.py           要約JSON → Ollama API → 結果JSON
  ├── prompts/
  │   ├── system_prompt.txt
  │   ├── output_format.txt
  │   └── few_shot_example.json
  ├── config.yaml          設定テンプレート
  ├── requirements.txt     Python依存パッケージ
  └── tests/
      └── sample_backup.json   テスト用サンプルデータ
```

### Step 3: 検証実行

```
あなた ─── LLMサーバーでスクリプトを実行
  │
  ├── 1. スクリプト一式をLLMサーバーに配置
  │      scp -r manhour-analysis/ llm-server:/opt/
  │
  ├── 2. Python環境セットアップ
  │      cd /opt/manhour-analysis
  │      pip install -r requirements.txt
  │
  ├── 3. 要約スクリプト実行
  │      python summarize.py --input backup.json --output summary.json
  │      # → summary.json を確認
  │
  ├── 4. 推論スクリプト実行
  │      python analyze.py --input summary.json --output result.json
  │      # → result.json を確認
  │
  └── 5. 結果をClaude Codeに共有（コピペ or ファイル共有）
```

### Step 4: 品質レビュー

```
確認 ─── 出力結果を一緒にレビュー
  │
  ├── JSON構造は正しいか
  ├── 数値の引用は正確か
  ├── 提案は具体的で実用的か
  ├── 日本語は自然か
  └── ハルシネーションはないか
```

```
Claude ─── フィードバックに基づいてプロンプト調整
  │
  └── プロンプト修正 → 再検証（Step 3-4 を繰り返し）
```

### Step 5: モデル選定

```
あなた ─── 複数モデルで比較実行
  │
  ├── ollama pull qwen2.5:7b && python analyze.py --model qwen2.5:7b
  ├── ollama pull gemma2:9b   && python analyze.py --model gemma2:9b
  └── (VRAM余裕あれば) ollama pull qwen2.5:14b && python analyze.py --model qwen2.5:14b
```

```
確認 ─── 比較結果を見て採用モデルを決定
```

---

## Phase 2: バックエンドパイプライン構築

### Step 6: パイプライン作成

```
Claude ─── パイプラインスクリプト作成
  │
  ├── run_pipeline.sh      全体実行スクリプト
  ├── config.yaml          本番用設定（チーム一覧等）
  └── エラーハンドリング・ログ出力の実装
```

### Step 7: サーバー設定

```
あなた ─── ネットワーク・共有フォルダのセットアップ
  │
  ├── 1. 共有フォルダ（NAS等）の設定
  │      backups/
  │      ├── team-a/
  │      ├── team-b/
  │      └── team-c/
  │
  ├── 2. LLMサーバーからのアクセス確認
  │      # LLMサーバーから共有フォルダにアクセスできること
  │      ls /mnt/shared/backups/
  │
  ├── 3. アプリサーバーへの配信経路確認
  │      # LLMサーバーからアプリサーバーにrsync可能なこと
  │      rsync -n /data/results/ app-server:/var/www/manhour/analysis/
  │
  └── 4. config.yaml のパスを実環境に合わせて編集
```

### Step 8: cron設定

```
あなた ─── 定期実行の設定
  │
  ├── 1. パイプラインの手動実行テスト
  │      /opt/manhour-analysis/run_pipeline.sh
  │
  ├── 2. cronに登録
  │      crontab -e
  │      # 毎週月曜 2:00 に実行
  │      0 2 * * 1 /opt/manhour-analysis/run_pipeline.sh >> /var/log/manhour-analysis.log 2>&1
  │
  └── 3. 翌日にログを確認
         cat /var/log/manhour-analysis.log
```

---

## Phase 3: データ連携整備

### Step 9: 運用フロー確立

```
あなた ─── チームリーダーへの周知・運用開始
  │
  ├── 1. バックアップの保存先を共有フォルダに案内
  │      「バックアップを以下のフォルダに保存してください」
  │      \\nas\backups\team-a\
  │
  └── 2. 初回の全チームデータを共有フォルダに配置
```

### Step 10:（オプション）データ送信の自動化

```
Claude ─── フロントエンドに「分析用データ送信」機能を追加
  │
  ├── 設定画面に「チーム名」入力欄を追加
  ├── 「分析用データを送信」ボタンを追加
  └── fetch POST でLLMサーバー（or 中継サーバー）に送信
      ※ サーバー側にAPIエンドポイントが必要 → Step 10b
```

```
あなた ─── APIエンドポイントの用意（Step 10 を実施する場合）
  │
  └── LLMサーバーまたは中継サーバーでPOST受付
      （簡易HTTPサーバー or nginx + CGI等）
```

---

## Phase 4: フロントエンド統合

### Step 11: フロントエンド実装

```
Claude ─── AI分析表示機能を実装
  │
  ├── js/llm-analysis.js   新規モジュール作成
  │   ├── fetch でanalysis JSONを取得
  │   ├── チーム評価カード描画
  │   ├── 展望・予測セクション描画
  │   ├── 推奨アクションカード描画
  │   └── graceful degradation（404時は非表示）
  │
  ├── index.html            AI分析セクションを追加
  │   └── #reportDetailView の後に配置
  │
  ├── style.css             スタイル追加
  │
  └── js/report.js          統合コード追加
      └── updateReport() にLLM分析の読み込みを追加
```

### Step 12: 表示確認

```
あなた ─── テスト用の結果JSONをアプリサーバーに配置
  │
  └── analysis/team-a.json を /var/www/manhour/analysis/ に配置
      （Phase 1 の検証で生成したJSONをそのまま使用可）
```

```
確認 ─── 表示内容のレビュー
  │
  ├── レポート画面にAI分析セクションが表示されるか
  ├── 表示がデザインに馴染んでいるか
  ├── JSONがない場合にセクションが非表示になるか
  └── モバイル表示は問題ないか
```

### Step 13: デプロイ

```
あなた ─── アプリサーバーにデプロイ
  │
  ├── 1. 更新されたフロントエンドファイルをアプリサーバーに配置
  └── 2. analysis/ ディレクトリが存在することを確認
```

---

## 全体タイムライン

```
週1     Phase 1: 品質検証
        ├─ あなた: サーバー準備 + Ollama + モデル        (1〜2日)
        ├─ Claude: スクリプト + プロンプト作成            (1日)
        ├─ あなた: スクリプト実行                         (30分)
        └─ 確認:   結果レビュー + プロンプト調整           (2〜3回)

週2     Phase 2: パイプライン
        ├─ Claude: パイプラインスクリプト作成              (1日)
        ├─ あなた: 共有フォルダ + ネットワーク設定         (1〜2日)
        └─ あなた: cron設定 + 動作確認                    (1日)

週3     Phase 3: データ連携
        ├─ あなた: チームリーダーへ周知                    (1日)
        └─ (任意) Claude + あなた: 自動送信機能           (2〜3日)

週4     Phase 4: フロントエンド
        ├─ Claude: AI分析表示モジュール実装               (1日)
        ├─ 確認:   表示レビュー + 調整                    (1〜2日)
        └─ あなた: デプロイ                               (1日)
```

---

## 今すぐ始められること

Phase 1 を並行して進められます:

| 並行作業 | 担当 |
|---------|------|
| LLMサーバーにOllamaをインストール + モデルダウンロード | あなた |
| summarize.py + analyze.py + プロンプト作成 | Claude |

**あなたの最初のアクション**:
1. GPU搭載サーバーを確保する
2. Ollamaをインストールする
3. `ollama pull qwen2.5:7b` でモデルをダウンロードする
4. テスト用のバックアップJSONを1つ用意する

**Claudeの最初のアクション**:
1. サンプルデータでsummarize.pyを作成
2. analyze.py + プロンプトテンプレートを作成
3. テスト用のモックデータを生成

あなたの準備ができたら、スクリプトをLLMサーバーに置いて実行 → 結果を一緒にレビュー、という流れです。
