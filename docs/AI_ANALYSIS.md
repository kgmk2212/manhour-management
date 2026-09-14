# AI 分析機能（ローカル Ollama）

「分析」タブから、ローカルで動く Ollama をブラウザが直接呼び出し、工数データの総合評価・展望・
推奨アクションを生成します。推論はすべて利用者自身のマシン上で完結し、工数データが
インターネット経由で外部に送信されることはありません。

**この機能は任意です。** Ollama を用意しなければ AI 分析セクションが使えないだけで、
工数管理の各機能は通常どおり動作します。

## セットアップ（初回のみ）

### 1. Ollama をインストール

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh
```

### 2. モデルをダウンロード

```bash
ollama pull qwen3.5:9b   # 既定のモデル
# gemma4 にも対応（チャット形式で呼び分ける）
```

### 3. CORS 許可を設定

GitHub Pages などの HTTPS ページから localhost の Ollama を叩くため、許可 origin の指定が必要です。

```bash
# macOS（launchd で常駐させている場合）
launchctl setenv OLLAMA_ORIGINS "https://kgmk2212.github.io"
launchctl stop ollama && launchctl start ollama

# ローカルサーバーからも試す場合は併記
launchctl setenv OLLAMA_ORIGINS "https://kgmk2212.github.io,http://localhost:*"

# 手動起動の場合
OLLAMA_ORIGINS="https://kgmk2212.github.io" ollama serve
```

## 使い方

1. 「分析」タブ → AI 分析セクションの **「分析を実行」** を押す
2. 数十秒〜数分で推論が完了し、結果が表示される
3. 結果は `localStorage` にキャッシュされ、次回以降は即時表示
4. エンドポイント・モデル名は **「設定」** から変更可能。**「疎通確認」** で接続をテストできる

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| 「Ollama に接続できません」 | `ollama serve` が動いているか確認 |
| CORS エラー | `OLLAMA_ORIGINS` に現在のページの origin を追加して Ollama を再起動 |
| 「モデルが見つかりません」 | 設定画面のモデル名を確認、または `ollama pull <モデル名>` |
| JSON 解析エラー | 再実行で改善することが多い。継続する場合はモデルを変更 |

## セキュリティ上の注意

- **`OLLAMA_ORIGINS` は必要な origin だけを列挙する。** `*` や広すぎるワイルドカードは、
  任意のサイトが利用者の localhost の Ollama を叩ける状態を作ります。
- **分析結果は `localStorage` に残る。** メンバー名・工数を含むため、共有 PC では
  「設定 > キャッシュを削除」で消してから離席してください。
- **CSP の `connect-src` は `http://localhost:11434` と `http://127.0.0.1:11434` のみ許可。**
  XSS が混入した場合に利用者ローカルの他サービスへ到達するリスクを抑えるため、
  ワイルドカードポートは使っていません。非デフォルトポートで運用する場合は
  `index.html` の CSP メタタグを編集してください。

## 内部構成

| ファイル | 役割 |
|---|---|
| `js/llm-summarize.js` | localStorage のデータを要約 JSON に変換 |
| `js/llm-analyze.js` | Ollama API を直接呼び出し、結果 JSON を取得 |
| `js/llm-prompts.js` | モデル別システムプロンプト + 出力スキーマ |
| `js/ai-analysis.js` | 実行・キャッシュ・UI |
| `js/partial-json.js` | ストリーミング途中の不完全 JSON の復元 |
| `llm-analysis/` | Python 版の同等パイプライン（検証用 CLI） |

設計の背景は [LLM_ANALYSIS_CONCEPT.md](LLM_ANALYSIS_CONCEPT.md)、
[LLM_ANALYSIS_ARCHITECTURE.md](LLM_ANALYSIS_ARCHITECTURE.md) を参照してください。
