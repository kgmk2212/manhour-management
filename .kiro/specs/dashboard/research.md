# Research & Design Decisions

## Summary
- **Feature**: dashboard
- **Discovery Scope**: Extension（既存システムへの新規タブ追加）
- **Key Findings**:
  - タブシステムは `data-tab` 属性 + `TAB_ORDER` 配列で管理。新タブ追加は HTML + 配列更新 + init.js 登録の3箇所
  - 独立性要件により `report.js` の関数を呼ばず、進捗計算ロジックを `dashboard.js` 内に自前実装する必要がある
  - 既存の `.stat-card` / `.stats-grid` CSS パターンはテーマ対応済みだが、名前空間分離のため `.dashboard-` プレフィックスで独自定義する

## Research Log

### タブシステムの拡張ポイント
- **Context**: 新規タブを追加する際の変更箇所を特定
- **Findings**:
  - `index.html:204-218` — タブボタン追加（`<button class="tab" data-tab="dashboard">`）
  - `index.html:221+` — タブコンテンツ div 追加（`<div id="dashboard" class="tab-content">`）
  - `js/ui.js:17` — `TAB_ORDER` 配列に `'dashboard'` を追加
  - `js/init.js` — `import * as Dashboard from './dashboard.js'` + `window` 公開
  - `index.html:28` — 初期タブ検証リストに `'dashboard'` を追加
- **Implications**: 変更箇所が明確で、追加・削除の影響範囲が限定的

### state.js のデータ構造
- **Context**: ダッシュボードが依存するデータの形状を確定
- **Findings**:
  - `estimates[]`: `{ id, version, task, process, member, hours, workMonths }`
  - `actuals[]`: `{ id, version, task, process, member, hours, date, workMonth }`
  - `remainingEstimates[]`: `{ id, version, task, process, member, remainingHours }`
- **Implications**: 全KPI計算に必要なデータは `state.js` から直接取得可能。`report.js` への依存は不要

### 進捗ステータス判定ロジック
- **Context**: `report.js` の `calculateProgress` を参考に、独自実装する判定ロジック
- **Findings**:
  - EAC = actualHours + remainingHours
  - completed: remainingHours === 0 && actualHours > 0
  - ontrack: EAC ≤ estimatedHours
  - warning: EAC ≤ estimatedHours × 1.2
  - exceeded: EAC > estimatedHours × 1.2
  - 定数は `constants.js` の `PROGRESS.WARNING_THRESHOLD (1.2)` を使用
- **Implications**: ロジック自体は単純。定数のみ `constants.js` から参照し、関数は dashboard.js 内に実装

### CSSテーマ互換性
- **Context**: ダッシュボード固有のCSSが既存テーマシステムと共存できるか
- **Findings**:
  - デザインテーマは `[data-design-theme="obsidian"]` セレクタでオーバーライド
  - テーマカラーは `.theme-bg.theme-{color}` クラスで適用
  - `.dashboard-` プレフィックスで名前空間を分離すれば、テーマセレクタと自然に共存可能
- **Implications**: `.dashboard-stat-card` に対して `[data-design-theme]` オーバーライドを追記すれば全テーマ対応可能

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| A: report.js 拡張 | 既存レポートモジュールにダッシュボード機能を追加 | 既存ロジック再利用 | 独立性要件(Req 8.2)に違反、着脱困難 | 却下 |
| B: 独立モジュール | dashboard.js 単一ファイルに全ロジックを集約 | 着脱容易、report.js非依存 | 進捗計算の重複 | **採用** |
| C: 共通ユーティリティ抽出 | 計算ロジックを utils-progress.js に抽出 | ロジック共有 | 新ファイル追加、着脱時の影響範囲拡大 | 過剰設計 |

## Design Decisions

### Decision: 独立モジュールパターン採用
- **Context**: 要件8「モジュール独立性」により、削除容易性を最優先
- **Alternatives Considered**:
  1. report.js の関数を import して再利用 — 依存が発生し着脱が複雑化
  2. 共通ユーティリティに計算ロジックを抽出 — 着脱時に影響するファイルが増加
- **Selected Approach**: dashboard.js 内に進捗計算ロジックを自前実装
- **Rationale**: 進捗計算は約30行程度の単純なロジック。重複のコストより着脱容易性の価値が高い
- **Trade-offs**: ロジック重複（report.js と dashboard.js）が発生するが、実験的機能の性質上許容
- **Follow-up**: 将来レポートタブ差し替え時にロジック統合を検討

### Decision: CSS名前空間分離
- **Context**: 要件8.4によりダッシュボード固有CSSを分離
- **Selected Approach**: `.dashboard-` プレフィックス付きクラスを `style.css` 末尾に追記
- **Rationale**: 既存 `.stat-card` を直接使うとスタイル変更時の影響が双方向に波及。プレフィックスで完全分離
- **Trade-offs**: CSS定義の重複が発生するが、削除時にプレフィックスでgrepして一括除去可能

## Risks & Mitigations
- 進捗計算ロジックの重複 → 単純な計算のため乖離リスクは低い。将来統合時に片方を削除
- TAB_ORDER 配列変更 → 既存タブのスライドアニメーションに影響する可能性 → ダッシュボードを先頭に配置して影響を最小化
- style.css の肥大化 → `.dashboard-` セクションをコメントブロックで明示し、削除時の範囲を明確化
