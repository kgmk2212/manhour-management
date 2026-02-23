# Technology Stack

## Architecture

フレームワークレスのSPA（Single Page Application）。
単一の `index.html` にES Modulesで分割されたJavaScriptを読み込む構成。
サーバーサイドは存在せず、すべてのデータはブラウザのlocalStorageに保存。

## Core Technologies

- **Language**: JavaScript (ES2020+, Vanilla)
- **Framework**: なし（純粋なHTML/CSS/JavaScript）
- **Module System**: ES Modules (`import`/`export`)
- **Data Storage**: localStorage
- **Hosting**: GitHub Pages（静的配信）

## Key Libraries

- **SheetJS** (`lib/xlsx.mjs`) — Excel出力機能（ESMビルド、CSP unsafe-eval不要）
- **japanese-holidays** (`lib/japanese-holidays.js`) — 日本の祝日判定（アルゴリズム計算ベース）

ライブラリはCDNではなく `lib/` ディレクトリにローカル配置（セキュリティ・CSP対応）。

## Development Standards

### State Management

- グローバル状態は `js/state.js` に集約
- `export let` + `setXxx()` パターンで変更を管理
- `window` オブジェクトへの公開はHTML inline handler用（レガシー互換）

### Constants

- マジックナンバー禁止、`js/constants.js` に定数を定義
- カテゴリ別オブジェクト（`LAYOUT`, `PROGRESS`, `CALCULATIONS`, `UI`, `STORAGE_KEYS` 等）

### Code Quality

- JSDocコメントを関数に付与
- 日本語コメント（UI文言・ドメイン用語は日本語）

## Development Environment

### Hosting & Deploy

GitHub Pagesで静的配信。ビルドステップなし。

### Common Commands

```bash
# 開発: ローカルサーバーで確認
python3 -m http.server 8000
# デプロイ: mainブランチにpushで自動デプロイ
git push origin main
```

## Key Technical Decisions

- **フレームワーク不採用**: 依存関係を最小化し、長期メンテナンスの負荷を低減
- **localStorage採用**: サーバーレスで動作、プライバシー確保、オフライン対応
- **ES Modules**: ビルドツール不要ながらモジュール分割を実現
- **CSP（Content Security Policy）**: 外部スクリプト排除、ライブラリローカル配置

---
_Document standards and patterns, not every dependency_
