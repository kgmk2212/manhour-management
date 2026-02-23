# Project Structure

## Organization Philosophy

機能ドメイン別のフラットなモジュール構成。
`js/` ディレクトリ直下に機能単位のファイルを配置し、深いネストは避ける。
共通のパターン（状態管理、定数、ユーティリティ）は専用ファイルに集約。

## Directory Patterns

### Source Code (`js/`)
**Purpose**: すべてのアプリケーションロジック
**Pattern**: 機能ドメイン名でファイルを分割（`estimate.js`, `actual.js`, `report.js`）
**Example**: 見積機能は `estimate.js`（メイン）、`estimate-add.js`（追加）、`estimate-edit.js`（編集）、`estimate-split.js`（分割）、`estimate-selection.js`（選択）に分割

### Infrastructure Files (`js/`)
- `state.js` — 全グローバル状態の一元管理
- `constants.js` — アプリケーション定数
- `storage.js` — localStorage操作・バックアップ
- `utils.js` — 共通ユーティリティ
- `init.js` — モジュール統合・初期化・`window` 公開
- `events.js` — イベントハンドラ登録
- `ui.js` — 共通UI操作
- `modal.js` — モーダルダイアログ
- `theme.js` — テーマ・外観制御

### External Libraries (`lib/`)
**Purpose**: サードパーティライブラリのローカルコピー
**Pattern**: minified版を配置、CDN不使用

### Documentation (`docs/`)
**Purpose**: 設計ドキュメント・仕様書

## Naming Conventions

- **Files**: kebab-case (`estimate-add.js`, `tab-filter.js`)
- **Functions**: camelCase (`renderEstimateList`, `loadAutoBackupSetting`)
- **Constants**: UPPER_SNAKE_CASE (`STORAGE_KEYS`, `DEFAULT_WORKING_DAYS`)
- **State Setters**: `setXxx` パターン (`setEstimates`, `setCurrentThemeColor`)

## Import Organization

```javascript
// 1. state.js から状態変数とsetter
import { estimates, setEstimates, ... } from './state.js';
// 2. 定数
import { TASK_COLORS } from './constants.js';
// 3. ユーティリティ
import { showAlert } from './utils.js';
// 4. 他の機能モジュール
import { clearProgressCache } from './report.js';
```

すべて相対パス (`./`) で参照。パスエイリアスは未使用。

## Code Organization Principles

- **状態の一元管理**: すべての状態は `state.js` を通じてアクセス・変更
- **関心の分離**: 見積・実績・レポート・スケジュールはそれぞれ独立したモジュール
- **init.js がエントリポイント**: `index.html` の `<script type="module">` から読み込み
- **window公開はinit.jsのみ**: HTML inline handlerとの橋渡しは init.js に集約

---
_Document patterns, not file trees. New files following patterns shouldn't require updates_
