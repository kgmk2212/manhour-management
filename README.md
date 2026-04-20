# 工数管理システム

シンプルで使いやすい工数管理・見積管理Webアプリケーション。

## 特徴

- 📊 **見積管理** - プロジェクトの見積を工程別・担当者別に管理
- ⏱️ **実績記録** - 日々の作業実績をカレンダー形式で簡単入力
- 📅 **スケジュール管理** - ガントチャート形式でプロジェクトの予定を管理
- 📈 **レポート・分析** - 見積と実績の比較、進捗状況の可視化
- 🎨 **カスタマイズ** - テーマカラー、表示形式を自由に設定
- 📱 **レスポンシブ** - PC・タブレット・スマートフォン対応
- 💾 **ローカルストレージ** - データは全てブラウザ内に保存（サーバー不要）

## 技術スタック

- 純粋なHTML/CSS/JavaScript（フレームワークなし）
- ES Modules による23個のモジュール構成
- ExcelJS（Excelファイル出力）
- ローカルストレージによるデータ保存（JSONエクスポート/インポート対応）

## ファイル構成

詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

```
/
├── index.html              (HTML構造)
├── style.css               (スタイル定義)
├── js/                     (23個のJavaScriptモジュール)
│   ├── state.js           (状態管理)
│   ├── storage.js         (データ保存)
│   ├── estimate.js        (見積管理)
│   ├── actual.js          (実績管理)
│   ├── schedule.js        (スケジュール管理)
│   ├── report.js          (レポート・分析)
│   └── ...                (その他17モジュール)
├── ARCHITECTURE.md         (アーキテクチャ構成)
└── CLAUDE.md              (開発ガイド)
```

## 開発

このプロジェクトはビルド工程を必要としません。`index.html` をブラウザで直接開くか、ローカルサーバーで起動してください。

```bash
# 例: Python の http.server を使用
python -m http.server 8000
```

## AI 分析機能（ローカル Ollama）

「分析」タブにブラウザから直接ローカル Ollama を呼び出す AI 分析セクションがあります。工数データから総合評価・展望・推奨アクションを生成します。データはローカルマシンから一歩も外に出ません。

### セットアップ（初回のみ）

1. **Ollama をインストール**

   ```bash
   # macOS / Linux
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **モデルをダウンロード**

   ```bash
   ollama pull qwen3.5:9b
   # もしくは gemma4 でも可
   ```

3. **CORS 許可を設定**（GitHub Pages 等の HTTPS ページから叩く場合）

   ```bash
   # macOS (launchd で常駐させている場合)
   launchctl setenv OLLAMA_ORIGINS "https://kgmk2212.github.io"
   launchctl stop ollama && launchctl start ollama

   # 開発時にローカルサーバーから試すなら複数許可
   launchctl setenv OLLAMA_ORIGINS "https://kgmk2212.github.io,http://localhost:*"

   # 手動起動の場合
   OLLAMA_ORIGINS="https://kgmk2212.github.io" ollama serve
   ```

### 使い方

1. 分析タブ → AI 分析セクションの **「分析を実行」** ボタンを押す
2. 数十秒〜数分で推論完了、結果が画面に表示される
3. 結果は `localStorage` にキャッシュされ、次回以降は即時表示
4. エンドポイントやモデル名は **「設定」** ボタンから変更可能。設定内の **「疎通確認」** で Ollama との接続を確認できます

### トラブルシューティング

| 症状 | 対処 |
|------|------|
| 「Ollama に接続できません」 | `ollama serve` が動いているか確認 |
| CORS エラー | `OLLAMA_ORIGINS` に現在のページの origin を追加して Ollama 再起動 |
| 「モデルが見つかりません」 | 設定画面のモデル名を確認、または `ollama pull <モデル名>` |
| JSON 解析エラー | 再実行で改善することが多い。継続する場合はモデルを変更 |

### 内部構成（抜粋）

- `js/llm-summarize.js` — localStorage のデータを要約 JSON に変換
- `js/llm-analyze.js` — Ollama API を直接叩き、結果 JSON を取得
- `js/llm-prompts.js` — モデル別システムプロンプト + 出力スキーマ
- `js/ai-analysis.js` — 実行・キャッシュ・UI
- `llm-analysis/` — Python 版の同等パイプライン（検証用 CLI）

詳細は [docs/LLM_ANALYSIS_CONCEPT.md](docs/LLM_ANALYSIS_CONCEPT.md) 以下を参照。

## ライセンス

MIT License
