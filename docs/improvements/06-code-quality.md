# F. コード品質・保守性 設計書

> **カテゴリ**: コード品質の改善
> **改善数**: 12件
> **優先度**: 中
> **関連ファイル**: 全JSファイル、style.css

---

## 17. アーキテクチャ改善

### 17-1. ui.js の分割（4,269行）

#### 現状の課題
- ui.jsが4,269行の巨大ファイルで、60以上の関数を含む
- フォーム管理、フィルター操作、表示制御、ドロップダウン管理が混在
- 1つの変更が予期しない副作用を生むリスク
- コードレビューが困難

#### 提案内容
4つのモジュールに分割:

```
js/ui.js (4,269行)
  ├── js/ui/form-manager.js      (~1,000行) フォーム入力・バリデーション
  ├── js/ui/filter-manager.js    (~800行)   フィルター操作・状態管理
  ├── js/ui/display-renderer.js  (~1,500行) 表示レンダリング・DOM構築
  └── js/ui/dropdown-manager.js  (~600行)   ドロップダウン・セレクトボックス
  → js/ui.js                     (~400行)   統合エントリポイント（re-export）
```

#### 実装方針

##### 分割の基準
```javascript
// js/ui/form-manager.js
// フォームの初期化、入力バリデーション、送信処理
export function initQuickInputForm() { /* ... */ }
export function validateEstimateForm() { /* ... */ }
export function submitActualForm() { /* ... */ }
export function resetForm() { /* ... */ }

// js/ui/filter-manager.js
// フィルター状態の管理、フィルターUIの更新
export function initFilters() { /* ... */ }
export function applyFilters() { /* ... */ }
export function updateFilterOptions() { /* ... */ }
export function getActiveFilters() { /* ... */ }

// js/ui/display-renderer.js
// データの表示・DOM構築
export function renderEstimateTable() { /* ... */ }
export function renderActualList() { /* ... */ }
export function renderReportCards() { /* ... */ }
export function updateSummaryBar() { /* ... */ }

// js/ui/dropdown-manager.js
// カスタムドロップダウンの制御
export function initDropdowns() { /* ... */ }
export function openDropdown() { /* ... */ }
export function closeAllDropdowns() { /* ... */ }
export function filterDropdownOptions() { /* ... */ }
```

##### 移行戦略（後方互換を維持）
```javascript
// js/ui.js（エントリポイント - 移行期間中）
export * from './ui/form-manager.js';
export * from './ui/filter-manager.js';
export * from './ui/display-renderer.js';
export * from './ui/dropdown-manager.js';

// window.*のグローバルエクスポートも維持（段階的に廃止）
```

##### 実装ステップ
1. 関数の依存関係マップを作成
2. 4モジュールへの関数の分類
3. 共有状態の抽出（モジュール間で参照する変数）
4. モジュール間のインポート/エクスポート整理
5. エントリポイント（ui.js）でのre-export
6. window.*グローバルの段階的置換
7. 動作確認（全画面のリグレッションテスト）

#### 工数見積
- 大（3-4日）

---

### 17-2. estimate.js の分割（2,313行）

#### 提案内容
```
js/estimate.js (2,313行)
  ├── js/estimate/estimate-calc.js    (~500行) 計算ロジック
  ├── js/estimate/estimate-render.js  (~800行) 表示レンダリング
  ├── js/estimate/estimate-filter.js  (~400行) フィルタリング
  └── js/estimate/estimate-matrix.js  (~600行) マトリクスビュー固有
```

#### 工数見積
- 中（2-3日）

---

### 17-3. schedule関連の分割（6,357行）

#### 提案内容
```
js/schedule.js + js/schedule-render.js (計6,357行)
  ├── js/schedule/schedule-data.js     (~800行)  データ操作・CRUD
  ├── js/schedule/schedule-canvas.js   (~1,500行) Canvas描画エンジン
  ├── js/schedule/schedule-events.js   (~1,000行) マウス/タッチイベント
  ├── js/schedule/schedule-layout.js   (~800行)  レイアウト計算
  ├── js/schedule/schedule-drag.js     (~700行)  ドラッグ&ドロップ
  └── js/schedule/schedule-ui.js       (~500行)  UIコントロール
```

#### 工数見積
- 大（4-5日）

---

### 17-4. style.css の分割（7,868行）

#### 提案内容
```
style.css (7,868行)
  ├── css/base.css          (~500行)  リセット、変数、タイポグラフィ
  ├── css/layout.css        (~400行)  アプリレイアウト、サイドバー
  ├── css/components.css    (~800行)  ボタン、カード、モーダル、フォーム
  ├── css/tables.css        (~600行)  テーブル、マトリクス
  ├── css/calendar.css      (~2,000行) カレンダー、タイムライン（最大）
  ├── css/schedule.css      (~1,500行) ガントチャート
  ├── css/report.css        (~500行)  レポート、チャート
  ├── css/theme.css         (~400行)  テーマ定義、ダークモード
  ├── css/mobile.css        (~800行)  レスポンシブ、モバイル固有
  └── css/animations.css    (~300行)  アニメーション、トランジション
```

##### index.htmlでのインポート
```html
<!-- 方法1: 個別インポート（開発時） -->
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<!-- ... -->

<!-- 方法2: CSSインポート（ビルド不要） -->
<style>
  @import url('css/base.css');
  @import url('css/layout.css');
  /* ... */
</style>

<!-- 方法3: 結合ファイル（本番） -->
<!-- cat css/*.css > style.css でビルド -->
<link rel="stylesheet" href="style.css">
```

#### 工数見積
- 中（2-3日）

---

## 18. テスタビリティ

### 18-1. テストフレームワーク導入

#### 現状の課題
- テストがゼロ（ユニットテスト、統合テスト共にゼロ）
- リファクタリングや機能追加のたびに手動確認が必要
- リグレッションバグの検出が遅い

#### 提案内容
- 軽量テストランナーの導入（ビルドツール不要のアプローチ）
- 計算ロジックのユニットテストから段階的に拡充
- ブラウザで直接実行可能なテスト

#### 実装方針

##### テストランナー（ビルドレス）
```javascript
// tests/test-runner.js
// ブラウザで直接実行可能な最小テストランナー

class TestRunner {
  constructor() {
    this.suites = [];
    this.results = { passed: 0, failed: 0, errors: [] };
  }

  describe(name, fn) {
    this.suites.push({ name, fn });
  }

  it(name, fn) {
    try {
      fn();
      this.results.passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      this.results.failed++;
      this.results.errors.push({ test: name, error: e.message });
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }

  assertEqual(actual, expected) {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  }

  assertDeepEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  run() {
    console.log('=== Test Results ===');
    for (const suite of this.suites) {
      console.log(`\n${suite.name}`);
      suite.fn();
    }
    console.log(`\n${this.results.passed} passed, ${this.results.failed} failed`);
    return this.results;
  }
}
```

##### テスト対象（優先度順）
```
1. 計算ロジック（純粋関数）
   - 工数集計（合計、平均、乖離率）
   - 進捗計算（消化率、ステータス判定）
   - 日付計算（営業日、祝日判定）
   - ベロシティ計算

2. データバリデーション
   - 見積入力のバリデーション
   - 実績入力のバリデーション
   - インポートデータのバリデーション

3. データ変換
   - normalizeEstimate()
   - ピボットテーブル生成
   - Excel出力用のデータ変換

4. ストレージ操作
   - 保存/読込の整合性
   - マイグレーション（バージョン間のデータ形式変換）
```

##### テスト例
```javascript
// tests/calc-tests.js
import { TestRunner } from './test-runner.js';
import { calculateProgress, calculateAccuracy } from '../js/report.js';

const t = new TestRunner();

t.describe('calculateProgress', () => {
  t.it('should return 0% for no actuals', () => {
    const result = calculateProgress([], [{ hours: 100 }]);
    t.assertEqual(result.percentage, 0);
  });

  t.it('should return 100% when actuals equal estimate', () => {
    const estimates = [{ version: 'v1', task: 'A', hours: 10 }];
    const actuals = [{ version: 'v1', task: 'A', hours: 10 }];
    const result = calculateProgress(actuals, estimates);
    t.assertEqual(result.percentage, 100);
  });

  t.it('should flag exceeded when actuals > estimate', () => {
    const estimates = [{ version: 'v1', task: 'A', hours: 10 }];
    const actuals = [{ version: 'v1', task: 'A', hours: 15 }];
    const result = calculateProgress(actuals, estimates);
    t.assertEqual(result.status, 'exceeded');
  });
});

t.run();
```

##### テスト実行環境
```html
<!-- tests/index.html -->
<!DOCTYPE html>
<html>
<head><title>テスト</title></head>
<body>
  <h1>工数管理システム テスト</h1>
  <div id="results"></div>
  <script type="module" src="./calc-tests.js"></script>
  <script type="module" src="./validation-tests.js"></script>
  <script type="module" src="./storage-tests.js"></script>
</body>
</html>
```

#### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `tests/` | 新規ディレクトリ |
| `tests/test-runner.js` | テストランナー |
| `tests/index.html` | テスト実行ページ |
| `tests/calc-tests.js` | 計算ロジックのテスト |
| `tests/validation-tests.js` | バリデーションのテスト |

#### 実装ステップ
1. テストランナーの作成
2. report.jsの計算関数のテスト（最優先）
3. estimate計算のテスト
4. 日付ユーティリティのテスト
5. バリデーション関数のテスト
6. ストレージ操作のテスト（モック使用）

#### 工数見積
- 中（2-3日：フレームワーク + 初期テスト群）

---

### 18-2. 依存性注入（DI）パターンの導入

#### 現状の課題
- localStorage に直接アクセスするコードが散在
- テスト時にlocalStorageをモックするのが困難
- 環境依存のコードが分離されていない

#### 提案内容
- ストレージ層を抽象化し、テスト時に差し替え可能に
- ファクトリパターンでのモジュール初期化

#### 実装方針

```javascript
// js/storage-adapter.js（新規）

/**
 * ストレージアダプタのインターフェース
 */
class StorageAdapter {
  getItem(key) { throw new Error('Not implemented'); }
  setItem(key, value) { throw new Error('Not implemented'); }
  removeItem(key) { throw new Error('Not implemented'); }
}

/**
 * localStorage実装
 */
class LocalStorageAdapter extends StorageAdapter {
  getItem(key) { return localStorage.getItem(key); }
  setItem(key, value) { localStorage.setItem(key, value); }
  removeItem(key) { localStorage.removeItem(key); }
}

/**
 * テスト用インメモリ実装
 */
class InMemoryStorageAdapter extends StorageAdapter {
  constructor() {
    super();
    this.store = new Map();
  }
  getItem(key) { return this.store.get(key) ?? null; }
  setItem(key, value) { this.store.set(key, value); }
  removeItem(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

// storage.jsでのアダプタ利用
let adapter = new LocalStorageAdapter();

export function setStorageAdapter(newAdapter) {
  adapter = newAdapter;
}

export function loadData(key) {
  const raw = adapter.getItem(key);
  return raw ? JSON.parse(raw) : null;
}

export function saveData(key, data) {
  adapter.setItem(key, JSON.stringify(data));
}
```

#### 工数見積
- 中（2日）

---

### 18-3. グローバル状態の削減

#### 現状の課題
- `window.*` でのグローバル関数エクスポートが多数
- HTMLのonclick属性からグローバル関数を呼び出し
- モジュール間の依存関係が不明瞭

#### 提案内容
- onclick属性 → addEventListener への段階的移行
- window.*エクスポートの一覧化と計画的削減
- イベントバスパターンによるモジュール間通信

#### 実装方針

```javascript
// js/event-bus.js（新規 or events.jsを活用）
/**
 * シンプルなイベントバス
 * モジュール間の疎結合な通信を実現
 */
class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback);  // unsubscribe関数を返す
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}

export const bus = new EventBus();

// 使用例
// js/actual.js
bus.emit('actual:created', { id: 'act_001', hours: 3 });

// js/report.js
bus.on('actual:created', (data) => {
  refreshReportIfVisible();
});

// js/ui.js
bus.on('actual:created', (data) => {
  showToast(`実績を登録しました: ${data.hours}h`);
});
```

##### onclick属性の移行
```html
<!-- Before -->
<button onclick="window.saveEstimate()">保存</button>

<!-- After -->
<button id="btn-save-estimate">保存</button>
```
```javascript
// js/init.js
document.getElementById('btn-save-estimate')
  .addEventListener('click', () => saveEstimate());
```

#### 工数見積
- 大（4-5日：影響範囲が広い）

---

## 19. エラーハンドリング

### 19-1. 体系的なtry-catch導入

#### 現状の課題
- 31,000行中にtry-catchが102箇所のみ（3.2%のカバレッジ）
- データ読み書き、インポート/エクスポートでの例外が捕捉されない
- ユーザーにはブラウザのコンソールエラーが表示されるだけ

#### 提案内容
- クリティカルパス（データ保存、読込、インポート）のtry-catch強化
- 統一的なエラーハンドリングユーティリティ
- ユーザーフレンドリーなエラー表示

#### 実装方針

```javascript
// js/error-handler.js（新規）

/**
 * エラーレベル
 */
const ErrorLevel = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * 統一エラーハンドラー
 */
class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
  }

  /**
   * エラーを処理
   * @param {Error} error - エラーオブジェクト
   * @param {string} context - エラー発生箇所
   * @param {string} level - エラーレベル
   */
  handle(error, context, level = ErrorLevel.ERROR) {
    // ログに記録
    this.log(error, context, level);

    // ユーザーに通知
    switch (level) {
      case ErrorLevel.CRITICAL:
        this.showCriticalError(error, context);
        break;
      case ErrorLevel.ERROR:
        this.showErrorToast(error, context);
        break;
      case ErrorLevel.WARNING:
        this.showWarningToast(error, context);
        break;
      case ErrorLevel.INFO:
        console.info(`[${context}]`, error.message);
        break;
    }
  }

  log(error, context, level) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: error.message,
      stack: error.stack
    };

    this.errorLog.push(entry);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    console.error(`[${context}]`, error);
  }

  showCriticalError(error, context) {
    // データ破損等の深刻なエラー → モーダルで警告
    const messages = {
      'storage:save': 'データの保存に失敗しました。ストレージの空き容量を確認してください。',
      'storage:load': 'データの読み込みに失敗しました。バックアップから復元してください。',
      'import:parse': 'ファイルの形式が正しくありません。正しいバックアップファイルを選択してください。'
    };
    showErrorModal(messages[context] || `エラーが発生しました: ${error.message}`);
  }

  showErrorToast(error, context) {
    showToast(this.getUserMessage(error, context), 'error');
  }

  showWarningToast(error, context) {
    showToast(this.getUserMessage(error, context), 'warning');
  }

  getUserMessage(error, context) {
    // 技術的なエラーメッセージをユーザーフレンドリーに変換
    const messages = {
      'QuotaExceededError': 'ストレージの容量上限に達しました。不要なデータを削除してください。',
      'SyntaxError': 'データ形式が不正です。',
      'TypeError': '予期しないエラーが発生しました。画面を再読み込みしてください。'
    };
    return messages[error.name] || `処理中にエラーが発生しました`;
  }

  /**
   * エラーログの取得（デバッグ用）
   */
  getLog() {
    return [...this.errorLog];
  }
}

export const errorHandler = new ErrorHandler();

/**
 * ラッパー関数: 安全な非同期操作
 */
export function safeTry(fn, context, fallback = null) {
  try {
    return fn();
  } catch (error) {
    errorHandler.handle(error, context);
    return fallback;
  }
}
```

##### 適用例
```javascript
// js/storage.js
import { safeTry, errorHandler, ErrorLevel } from './error-handler.js';

export function saveAllData() {
  safeTry(() => {
    localStorage.setItem('manhour_estimates', JSON.stringify(getEstimates()));
    localStorage.setItem('manhour_actuals', JSON.stringify(getActuals()));
    localStorage.setItem('manhour_schedules', JSON.stringify(getSchedules()));
  }, 'storage:save');
}

export function loadAllData() {
  return safeTry(() => {
    const raw = localStorage.getItem('manhour_estimates');
    return raw ? JSON.parse(raw) : [];
  }, 'storage:load', []);  // フォールバック: 空配列
}

export function importBackup(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    validateBackupFormat(data);
    applyBackup(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      errorHandler.handle(error, 'import:parse', ErrorLevel.ERROR);
    } else {
      errorHandler.handle(error, 'import:apply', ErrorLevel.CRITICAL);
    }
    throw error;  // 呼び出し元でもハンドリング可能に
  }
}
```

#### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/error-handler.js` | 新規: エラーハンドリングユーティリティ |
| `js/storage.js` | 全保存/読込処理にtry-catch追加 |
| `js/actual.js` | CRUD操作のエラーハンドリング |
| `js/estimate.js` | CRUD操作のエラーハンドリング |
| `js/estimate-add.js` | 入力バリデーションのエラーハンドリング |
| `js/ui.js` | DOM操作のエラーハンドリング |

#### 実装ステップ
1. error-handler.jsの作成
2. storage.jsの全関数にsafeTry適用
3. インポート/エクスポート処理の強化
4. ユーザーフレンドリーなエラーメッセージマッピング
5. localStorage容量超過の専用ハンドリング
6. グローバルエラーハンドラ（window.onerror, unhandledrejection）
7. エラーログ表示UI（設定画面のデバッグセクション）

#### 工数見積
- 中（3日）

---

### 19-2. データ破損からの自動復旧

#### 提案内容
- localStorageのデータが不正なJSONの場合、直前の自動バックアップからフォールバック
- 起動時のデータ整合性チェック

#### 実装方針

```javascript
/**
 * 起動時のデータ整合性チェック
 */
function validateDataIntegrity() {
  const checks = [
    { key: 'manhour_estimates', validator: validateEstimates },
    { key: 'manhour_actuals', validator: validateActuals },
    { key: 'manhour_schedules', validator: validateSchedules }
  ];

  for (const { key, validator } of checks) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      const issues = validator(data);
      if (issues.length > 0) {
        console.warn(`Data integrity issues in ${key}:`, issues);
        // 軽微な問題は自動修正
        const fixed = autoFix(data, issues);
        localStorage.setItem(key, JSON.stringify(fixed));
      }
    } catch (e) {
      // JSONパースエラー → バックアップからの復旧を試みる
      console.error(`Corrupted data in ${key}:`, e);
      attemptRecovery(key);
    }
  }
}

function attemptRecovery(key) {
  // 自動バックアップの最新を探す
  const backupKey = `${key}_backup`;
  const backup = localStorage.getItem(backupKey);

  if (backup) {
    try {
      JSON.parse(backup);  // バリデーション
      localStorage.setItem(key, backup);
      showToast('データの自動復旧を行いました', 'warning');
    } catch {
      showErrorModal(
        'データが破損しており、自動復旧できませんでした。' +
        'バックアップファイルからの復元をお試しください。'
      );
    }
  }
}
```

#### 工数見積
- 中（2日）

---

## まとめ

| # | 改善 | 優先度 | 工数 | リスク |
|---|------|--------|------|--------|
| 17-1 | ui.js分割 | 高 | 大 | 中（リグレッション注意） |
| 17-2 | estimate.js分割 | 中 | 中 | 中 |
| 17-3 | schedule関連分割 | 中 | 大 | 高（Canvas描画が複雑） |
| 17-4 | style.css分割 | 中 | 中 | 低 |
| 18-1 | テストフレームワーク | 高 | 中 | 低 |
| 18-2 | 依存性注入 | 中 | 中 | 低 |
| 18-3 | グローバル状態削減 | 高 | 大 | 高（全体に影響） |
| 19-1 | エラーハンドリング | 高 | 中 | 低 |
| 19-2 | 自動復旧 | 中 | 中 | 低 |

### 推奨実装順序
```
1. テストフレームワーク導入（リファクタのセーフティネット）
2. エラーハンドリング（即座にユーザー体験改善）
3. 依存性注入（テスタビリティ向上）
4. ui.js分割（最大の負債解消）
5. style.css分割（低リスク、見通し改善）
6. estimate.js分割
7. schedule関連分割
8. グローバル状態削減（最後：影響範囲最大）
```
