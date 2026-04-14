# E. パフォーマンス 設計書

> **カテゴリ**: パフォーマンス最適化
> **改善数**: 7件
> **優先度**: 中
> **関連ファイル**: js/ui.js, js/estimate.js, js/actual.js, js/actual-timeline.js, js/report.js

---

## 15. レンダリング最適化

### 15-1. 仮想スクロール

#### 現状の課題
- 実績一覧が数百件を超えるとDOM要素数が膨大になりスクロールがカクつく
- 見積マトリクス表示でも大量のセルをすべてレンダリング
- フィルター変更のたびに全DOMを破棄→再構築している

#### 提案内容
- 画面に表示されている行だけDOMに存在する仮想スクロールの導入
- スクロール位置に応じて動的に行を追加/削除

#### 実装方針

```javascript
/**
 * 仮想スクロールコンテナ
 * 画面に見える行 + 上下バッファ行のみDOMに存在
 */
class VirtualScroll {
  constructor(container, options) {
    this.container = container;
    this.rowHeight = options.rowHeight || 40;
    this.bufferRows = options.bufferRows || 10;
    this.data = options.data || [];
    this.renderRow = options.renderRow;  // 行レンダリング関数

    // スクロール可能な全高のスペーサー
    this.spacer = document.createElement('div');
    this.spacer.style.height = `${this.data.length * this.rowHeight}px`;
    this.container.appendChild(this.spacer);

    // 実際のコンテンツ領域
    this.content = document.createElement('div');
    this.content.style.position = 'relative';
    this.container.appendChild(this.content);

    // スクロールイベント
    this.container.addEventListener('scroll', () => this.onScroll());
    this.render();
  }

  onScroll() {
    requestAnimationFrame(() => this.render());
  }

  render() {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    // 表示範囲の計算
    const startIndex = Math.max(0,
      Math.floor(scrollTop / this.rowHeight) - this.bufferRows
    );
    const endIndex = Math.min(this.data.length,
      Math.ceil((scrollTop + containerHeight) / this.rowHeight) + this.bufferRows
    );

    // 表示範囲外のDOMを削除
    const existingRows = this.content.children;
    for (let i = existingRows.length - 1; i >= 0; i--) {
      const row = existingRows[i];
      const index = parseInt(row.dataset.index);
      if (index < startIndex || index >= endIndex) {
        row.remove();
      }
    }

    // 表示範囲内の行を追加
    const existingIndices = new Set(
      [...this.content.children].map(r => parseInt(r.dataset.index))
    );

    for (let i = startIndex; i < endIndex; i++) {
      if (existingIndices.has(i)) continue;

      const row = this.renderRow(this.data[i], i);
      row.dataset.index = i;
      row.style.position = 'absolute';
      row.style.top = `${i * this.rowHeight}px`;
      row.style.width = '100%';
      this.content.appendChild(row);
    }
  }

  /**
   * データ更新時
   */
  updateData(newData) {
    this.data = newData;
    this.spacer.style.height = `${this.data.length * this.rowHeight}px`;
    this.render();
  }
}
```

##### 使用例
```javascript
// 実績一覧への適用
// 行レンダリング関数はDOM APIで安全に構築
function createActualRow(actual, index) {
  const row = document.createElement('div');
  row.className = 'actual-row';

  const fields = [
    { cls: 'col-date', text: actual.date },
    { cls: 'col-version', text: actual.version },
    { cls: 'col-task', text: actual.task },
    { cls: 'col-process', text: actual.process },
    { cls: 'col-member', text: actual.member },
    { cls: 'col-hours', text: `${actual.hours}h` }
  ];

  for (const field of fields) {
    const span = document.createElement('span');
    span.className = field.cls;
    span.textContent = field.text;
    row.appendChild(span);
  }

  return row;
}

const virtualList = new VirtualScroll(
  document.getElementById('actual-list-container'),
  {
    rowHeight: 44,
    bufferRows: 15,
    data: filteredActuals,
    renderRow: createActualRow
  }
);
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/virtual-scroll.js` | 新規: 仮想スクロールクラス |
| `js/actual.js` | 実績一覧への仮想スクロール適用 |
| `js/estimate.js` | 見積一覧への仮想スクロール適用 |
| `js/actual-timeline.js` | タイムラインビューへの適用 |
| `style.css` | 仮想スクロールコンテナのスタイル |

##### パフォーマンス効果
```
1000件の実績表示:
  Before: DOM要素 ~6000個、初回レンダリング ~800ms
  After:  DOM要素 ~300個、初回レンダリング ~50ms
          スクロール中のFPS: 60fps安定
```

##### 実装ステップ
1. VirtualScrollクラスの実装
2. 実績一覧（リストビュー）への適用
3. 見積一覧（リストビュー）への適用
4. スクロール位置の復元（フィルター変更後）
5. 可変高さ行への対応（メモ付き行など）
6. アクセシビリティ対応（aria-rowcount, aria-rowindex）

##### 技術的考慮事項
- マトリクス表示は2次元のため、仮想化の適用が複雑
- 検索/フィルターとの連携（結果件数の即座な反映）
- 印刷時は全行を展開する必要あり

##### 工数見積
- 大（4-5日）

---

### 15-2. 差分更新（Incremental DOM Update）

#### 現状の課題
- フィルター変更のたびにDOM全体を再構築
- DOMの再構築はレイアウト再計算を伴い、100ms以上のブロッキングが発生
- ユーザーがフィルターを素早く切り替えると「固まる」体験になる

#### 提案内容
- データの変更箇所のみDOMに反映する差分更新
- キーベースの要素再利用

#### 実装方針

```javascript
/**
 * 差分更新ヘルパー
 * 既存のDOM要素をキーで照合し、変更分だけ更新
 * 注: DOM構築はtextContent/DOM APIを使用し、XSSリスクを排除
 */
function patchList(container, newItems, keyFn, renderFn) {
  const existingMap = new Map();

  // 既存要素をキーでマッピング
  for (const child of container.children) {
    existingMap.set(child.dataset.key, child);
  }

  const newKeys = new Set();

  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    const key = keyFn(item);
    newKeys.add(key);

    const existing = existingMap.get(key);
    if (existing) {
      // 既存要素を更新（位置調整のみ）
      if (existing !== container.children[i]) {
        container.insertBefore(existing, container.children[i]);
      }
      // データが変わっていれば内容更新
      updateElementContent(existing, item);
    } else {
      // 新規要素の作成（DOM APIで安全に構築）
      const el = renderFn(item);
      el.dataset.key = key;
      if (container.children[i]) {
        container.insertBefore(el, container.children[i]);
      } else {
        container.appendChild(el);
      }
    }
  }

  // 不要な要素の削除
  for (const [key, el] of existingMap) {
    if (!newKeys.has(key)) {
      el.remove();
    }
  }
}

/**
 * 要素の内容更新（変更があったフィールドのみ）
 * textContentを使用してXSSリスクを排除
 */
function updateElementContent(el, item) {
  const cells = el.querySelectorAll('[data-field]');
  for (const cell of cells) {
    const field = cell.dataset.field;
    const newValue = String(item[field] ?? '');
    if (cell.textContent !== newValue) {
      cell.textContent = newValue;
    }
  }
}
```

##### パフォーマンス効果
```
フィルター変更時（1000件 → 500件）:
  Before: DOM全置換 ~300ms
  After:  差分更新 ~20ms
```

##### 実装ステップ
1. patchList関数の実装
2. 各レンダリング関数にキー属性を付与
3. 実績一覧の差分更新化
4. 見積一覧の差分更新化
5. レポートのKPIカード更新の差分化

##### 工数見積
- 中〜大（3-4日）

---

### 15-3. Web Workerでの集計処理

#### 現状の課題
- レポートの集計計算（乖離率、異常検知、トレンド分析）がメインスレッドで実行
- 大量データの集計中にUIがフリーズ（500ms以上のブロッキング）

#### 提案内容
- 重い計算処理をWeb Workerに移動
- メインスレッドはUI更新に専念

#### 実装方針

```javascript
// js/workers/report-worker.js（新規）
self.addEventListener('message', (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'calculateReport': {
      const { actuals, estimates, filters } = data;

      // 重い計算をワーカースレッドで実行
      const progress = calculateProgress(actuals, estimates);
      const anomalies = detectAnomalies(actuals, estimates);
      const accuracy = calculateAccuracy(actuals, estimates);
      const trends = calculateTrends(actuals, filters);

      self.postMessage({
        type: 'reportResult',
        data: { progress, anomalies, accuracy, trends }
      });
      break;
    }

    case 'calculateVelocity': {
      const { actuals, estimates, period } = data;
      const velocity = calculateVelocity(actuals, period);
      self.postMessage({ type: 'velocityResult', data: velocity });
      break;
    }
  }
});

// 計算関数（report.jsから移植）
function calculateProgress(actuals, estimates) { /* ... */ }
function detectAnomalies(actuals, estimates) { /* ... */ }
```

```javascript
// js/report.js（既存の変更）
let reportWorker = null;

function initReportWorker() {
  reportWorker = new Worker('./js/workers/report-worker.js', { type: 'module' });

  reportWorker.addEventListener('message', (e) => {
    const { type, data } = e.data;
    if (type === 'reportResult') {
      renderReportResults(data);  // UIの更新はメインスレッドで
    }
  });
}

function requestReportCalculation(filters) {
  // ローディング表示
  showReportLoading();

  // ワーカーに計算を依頼
  reportWorker.postMessage({
    type: 'calculateReport',
    data: {
      actuals: getActuals(),
      estimates: getEstimates(),
      filters
    }
  });
}
```

##### パフォーマンス効果
```
レポート生成（実績1000件、見積500件）:
  Before: メインスレッド 600ms（UIフリーズ）
  After:  ワーカー 600ms + メインスレッド 20ms（UIフリーズなし）
```

##### 実装ステップ
1. report-worker.jsの作成（計算関数の移植）
2. Worker初期化とメッセージングの実装
3. ローディングUIの追加
4. エラーハンドリング（Worker異常終了時のフォールバック）
5. Worker非対応ブラウザのフォールバック

##### 工数見積
- 中（2-3日）

---

### 15-4. レイジーロード（遅延タブ読み込み）

#### 現状の課題
- アプリ起動時に全6タブのコンテンツを一度にレンダリング
- 初回表示に必要なのはクイック入力タブのみなのに、全タブ分のDOMコストが発生

#### 提案内容
- タブの初回表示時にコンテンツをレンダリング（遅延初期化）
- 一度レンダリングしたタブはキャッシュして再利用

#### 実装方針

```javascript
/**
 * タブの遅延初期化管理
 */
const tabInitialized = {
  quick: false,
  report: false,
  estimate: false,
  actual: false,
  schedule: false,
  settings: false
};

const tabInitializers = {
  quick: () => initQuickInputTab(),
  report: () => initReportTab(),
  estimate: () => initEstimateTab(),
  actual: () => initActualTab(),
  schedule: () => initScheduleTab(),
  settings: () => initSettingsTab()
};

function switchTab(tabId) {
  // 遅延初期化
  if (!tabInitialized[tabId]) {
    const startTime = performance.now();
    tabInitializers[tabId]();
    tabInitialized[tabId] = true;
    console.debug(`Tab "${tabId}" initialized in ${performance.now() - startTime}ms`);
  }

  // タブ切替
  showTab(tabId);
}
```

##### パフォーマンス効果
```
アプリ起動時:
  Before: 6タブ一括初期化 ~1200ms
  After:  クイック入力のみ ~200ms（他は必要時に初期化）
```

##### 実装ステップ
1. 各タブの初期化処理を関数に分離
2. タブ切替処理に遅延初期化を組み込む
3. 初期化中のローディング表示
4. タブ間の依存関係の整理（レポートが見積データに依存する等）

##### 工数見積
- 中（2日）

---

## 16. データ効率

### 16-1. ページネーション

#### 現状の課題
- 全データをメモリに保持し、全件をDOMにレンダリング
- 数千件になるとメモリ使用量・レンダリング時間が問題

#### 提案内容
- リストビューに50件/100件/全件の表示切替
- 「もっと読み込む」ボタンによるインクリメンタル表示

#### 実装方針

```javascript
/**
 * ページネーションコントローラー
 */
class Paginator {
  constructor(data, pageSize = 50) {
    this.allData = data;
    this.pageSize = pageSize;
    this.currentPage = 1;
  }

  get totalPages() {
    return Math.ceil(this.allData.length / this.pageSize);
  }

  get currentData() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.allData.slice(start, start + this.pageSize);
  }

  get hasMore() {
    return this.currentPage < this.totalPages;
  }

  loadMore() {
    if (this.hasMore) {
      this.currentPage++;
      return this.allData.slice(
        (this.currentPage - 1) * this.pageSize,
        this.currentPage * this.pageSize
      );
    }
    return [];
  }

  reset() {
    this.currentPage = 1;
  }
}
```

##### UI変更
```
┌─────────────────────────────────────────────────┐
│ ... 実績一覧 ...                                 │
│                                                  │
│ 50件表示 / 全230件                                │
│                                                  │
│ [もっと読み込む (残り180件)]                       │
│                                                  │
│ 表示件数: [50 ▼] [100] [すべて]                   │
│                                                  │
│ ← 1  2  3  4  5 →                               │
└─────────────────────────────────────────────────┘
```

##### 工数見積
- 中（2日）

---

### 16-2. インメモリインデックス

#### 現状の課題
- フィルタリングのたびに全データを線形探索
- バージョン/日付/メンバーでの検索がO(n)

#### 提案内容
- 頻繁に検索されるフィールドにインメモリインデックスを構築
- データ追加/削除時にインデックスを更新

#### 実装方針

```javascript
/**
 * インメモリインデックス
 * ハッシュマップベースの高速ルックアップ
 */
class DataIndex {
  constructor() {
    this.indices = {};  // field -> value -> Set<id>
  }

  /**
   * インデックスの構築
   */
  build(data, fields) {
    this.indices = {};
    for (const field of fields) {
      this.indices[field] = {};
    }

    for (const item of data) {
      for (const field of fields) {
        const value = item[field];
        if (!this.indices[field][value]) {
          this.indices[field][value] = new Set();
        }
        this.indices[field][value].add(item.id);
      }
    }
  }

  /**
   * 複合条件での検索（AND結合）
   */
  query(criteria) {
    const sets = Object.entries(criteria)
      .map(([field, value]) => this.indices[field]?.[value] || new Set());

    if (sets.length === 0) return new Set();

    // 積集合
    return sets.reduce((acc, set) => {
      return new Set([...acc].filter(id => set.has(id)));
    });
  }

  add(item, fields) {
    for (const field of fields) {
      const value = item[field];
      if (!this.indices[field]) this.indices[field] = {};
      if (!this.indices[field][value]) this.indices[field][value] = new Set();
      this.indices[field][value].add(item.id);
    }
  }

  remove(item, fields) {
    for (const field of fields) {
      const value = item[field];
      this.indices[field]?.[value]?.delete(item.id);
    }
  }
}

// 使用例
const actualIndex = new DataIndex();
actualIndex.build(actuals, ['version', 'date', 'member', 'process']);

// O(1)での検索
const ids = actualIndex.query({ version: 'v2.0', member: '森' });
const filtered = actuals.filter(a => ids.has(a.id));
```

##### パフォーマンス効果
```
1000件のフィルタリング:
  Before: O(n) 全件スキャン ~5ms
  After:  O(1) インデックスルックアップ ~0.1ms

10000件のフィルタリング:
  Before: O(n) ~50ms
  After:  O(1) ~0.1ms + O(k) 結果取得（k=マッチ件数）
```

##### 工数見積
- 中（2日）

---

### 16-3. デバウンス強化

#### 現状の課題
- フィルターのセレクトボックス変更のたびに即座に再レンダリングが走る
- テキスト入力中のキーストロークごとに検索が実行される

#### 提案内容
- フィルター変更に300msのデバウンスを適用
- テキスト入力は500msのデバウンス
- 連続操作中はローディングインジケーターを表示

#### 実装方針

```javascript
/**
 * 汎用デバウンス関数
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// フィルター変更のデバウンス
const debouncedFilter = debounce((filters) => {
  renderFilteredResults(filters);
}, 300);

// テキスト検索のデバウンス
const debouncedSearch = debounce((query) => {
  performSearch(query);
}, 500);
```

##### 工数見積
- 小（0.5日）

---

## まとめ

| # | 改善 | 優先度 | 工数 | 効果 |
|---|------|--------|------|------|
| 15-1 | 仮想スクロール | 高 | 大 | 大量データでも60fps |
| 15-2 | 差分更新 | 高 | 中〜大 | フィルター操作の高速化 |
| 15-3 | Web Worker | 中 | 中 | UIフリーズの解消 |
| 15-4 | レイジーロード | 高 | 中 | 起動時間の大幅短縮 |
| 16-1 | ページネーション | 中 | 中 | メモリ効率の改善 |
| 16-2 | インメモリインデックス | 中 | 中 | 検索の高速化 |
| 16-3 | デバウンス強化 | 高 | 小 | 無駄な再計算の削減 |

### 推奨実装順序
```
1. デバウンス強化（即効性が高い、コスト小）
2. レイジーロード（起動改善、他に影響少）
3. 仮想スクロール（最も効果大、リスト系画面に適用）
4. 差分更新（仮想スクロールと組み合わせ）
5. インメモリインデックス（データ量に応じて）
6. ページネーション（仮想スクロールの補完）
7. Web Worker（レポート画面の改善）
```
