# D. アクセシビリティ 設計書

> **カテゴリ**: アクセシビリティの改善
> **改善数**: 12件
> **優先度**: 高
> **関連ファイル**: index.html, style.css, js/ui.js, js/schedule-render.js

---

## 12. ARIA対応の強化

### 現状の課題
- HTML全体でARIA属性が2箇所のみ（スクリーンリーダーでほぼ操作不能）
- カスタムコンポーネント（ドロップダウン、タブ、モーダル）がネイティブ要素のセマンティクスを持たない
- 動的に変化する情報（合計時間、進捗率、ステータス）が読み上げ対象外

### 提案内容
- WAI-ARIA 1.2準拠のセマンティクスを全カスタムコンポーネントに付与
- ライブリージョンによる動的情報の通知
- モーダルのフォーカストラップ実装

### 実装方針

#### 12-1. タブナビゲーション

##### 現状のHTML
```html
<!-- 現在: セマンティクスなし -->
<div class="sidebar-nav">
  <div class="nav-item active" onclick="switchTab('quick')">クイック入力</div>
  <div class="nav-item" onclick="switchTab('report')">レポート</div>
</div>
```

##### 改善後のHTML
```html
<!-- ARIA準拠 -->
<nav aria-label="メインナビゲーション">
  <div role="tablist" aria-orientation="vertical">
    <button role="tab"
            id="tab-quick"
            aria-selected="true"
            aria-controls="panel-quick"
            tabindex="0">
      クイック入力
    </button>
    <button role="tab"
            id="tab-report"
            aria-selected="false"
            aria-controls="panel-report"
            tabindex="-1">
      レポート
    </button>
  </div>
</nav>

<div role="tabpanel"
     id="panel-quick"
     aria-labelledby="tab-quick"
     tabindex="0">
  <!-- タブコンテンツ -->
</div>
```

##### キーボード操作
```
矢印キー上/下: タブ間を移動
Enter/Space:   タブを選択
Home:          最初のタブに移動
End:           最後のタブに移動
```

---

#### 12-2. モーダルダイアログ

##### 現状の問題
```html
<!-- 現在: フォーカストラップなし、aria属性なし -->
<div class="modal-overlay" onclick="closeModal()">
  <div class="modal-content">
    <span class="close-btn" onclick="closeModal()">×</span>
    <h3>見積編集</h3>
    <!-- ... -->
  </div>
</div>
```

##### 改善後のHTML
```html
<div class="modal-overlay"
     role="dialog"
     aria-modal="true"
     aria-labelledby="modal-title-edit-estimate"
     aria-describedby="modal-desc-edit-estimate">
  <div class="modal-content">
    <h3 id="modal-title-edit-estimate">見積編集</h3>
    <p id="modal-desc-edit-estimate" class="sr-only">
      選択した見積の内容を編集します
    </p>
    <button class="close-btn"
            aria-label="閉じる"
            type="button">
      <svg aria-hidden="true"><!-- × アイコン --></svg>
    </button>
    <!-- ... -->
    <div class="modal-actions">
      <button type="button">キャンセル</button>
      <button type="submit">保存</button>
    </div>
  </div>
</div>
```

##### フォーカストラップの実装
```javascript
/**
 * モーダル内にフォーカスを閉じ込める
 * Tab/Shift+Tabでモーダル内を循環
 */
function trapFocus(modalElement) {
  const focusableSelectors = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ];

  const focusableElements = modalElement.querySelectorAll(
    focusableSelectors.join(', ')
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // 開いた時に最初のフォーカス可能要素にフォーカス
  firstFocusable?.focus();

  // Tabキーのトラップ
  modalElement.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift+Tab: 最初の要素から前 → 最後の要素に
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab: 最後の要素から次 → 最初の要素に
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  });
}

/**
 * モーダルを開く
 */
function openModal(modalElement) {
  // 現在のフォーカス位置を記憶
  const previousFocus = document.activeElement;

  modalElement.removeAttribute('hidden');
  modalElement.setAttribute('aria-modal', 'true');

  // 背景のスクロールを禁止
  document.body.style.overflow = 'hidden';
  // 背景コンテンツをスクリーンリーダーから隠す
  document.querySelector('.app-layout').setAttribute('aria-hidden', 'true');

  trapFocus(modalElement);

  // モーダルを閉じた時にフォーカスを戻す
  modalElement._previousFocus = previousFocus;
}

/**
 * モーダルを閉じる
 */
function closeModal(modalElement) {
  modalElement.setAttribute('hidden', '');
  modalElement.removeAttribute('aria-modal');
  document.body.style.overflow = '';
  document.querySelector('.app-layout').removeAttribute('aria-hidden');

  // フォーカスを元の位置に戻す
  modalElement._previousFocus?.focus();
}
```

---

#### 12-3. ドロップダウン/セレクト

##### 改善後
```html
<div role="combobox"
     aria-expanded="false"
     aria-haspopup="listbox"
     aria-label="バージョン選択">
  <input type="text"
         aria-autocomplete="list"
         aria-controls="version-listbox"
         placeholder="バージョンを選択...">
  <ul id="version-listbox"
      role="listbox"
      aria-label="バージョン一覧"
      hidden>
    <li role="option" aria-selected="true" id="opt-v2">v2.0</li>
    <li role="option" aria-selected="false" id="opt-v1">v1.5</li>
  </ul>
</div>
```

---

#### 12-4. ライブリージョン

##### 動的情報の読み上げ
```html
<!-- 画面内に常時存在する通知エリア -->
<div id="live-region"
     role="status"
     aria-live="polite"
     aria-atomic="true"
     class="sr-only">
</div>

<!-- 緊急通知用（エラーなど） -->
<div id="alert-region"
     role="alert"
     aria-live="assertive"
     class="sr-only">
</div>
```

```javascript
/**
 * スクリーンリーダーに通知を送る
 * @param {string} message - 読み上げテキスト
 * @param {boolean} urgent - 緊急（assertive）か通常（polite）か
 */
function announce(message, urgent = false) {
  const region = document.getElementById(
    urgent ? 'alert-region' : 'live-region'
  );
  // 同じ内容でも再読み上げさせるため一度空にする
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

// 使用例
announce('実績を保存しました');
announce('見積の90%を超過しています', true);
announce(`合計: ${totalHours}時間`);
```

---

#### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `index.html` | 全コンポーネントにARIA属性追加、ライブリージョン追加 |
| `js/ui.js` | aria-selected/aria-expanded等の動的更新 |
| `js/init.js` | フォーカストラップ、announce関数の登録 |
| `style.css` | `.sr-only`クラス追加（スクリーンリーダー専用テキスト） |

#### sr-onlyクラス
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

#### 実装ステップ
1. ライブリージョンとannounce関数の実装
2. sr-onlyクラスの追加
3. タブナビゲーションのARIA化
4. モーダルのフォーカストラップ実装
5. ドロップダウンのARIA化
6. フォームフィールドのラベル紐づけ確認
7. 動的更新箇所でのannounce呼び出し追加
8. SVGアイコンへのaria-hidden="true"追加

#### 工数見積
- 大（4-5日）

---

## 13. キーボード操作の完全対応

### 現状の課題
- ガントチャートはマウスドラッグ必須（キーボード操作不可）
- カスタムコンポーネントにtabindexが設定されていない
- Escapeキーでモーダルが閉じない箇所がある

### 提案内容
- すべてのインタラクティブ要素をキーボードで操作可能に
- WAI-ARIA Authoring Practicesに準拠したキーボードパターン

### 実装方針

#### 13-1. ガントチャートのキーボード操作

```javascript
/**
 * ガントチャートのキーボードナビゲーション
 */
function setupGanttKeyboard(ganttElement) {
  let selectedTask = null;
  let isMoving = false;

  ganttElement.addEventListener('keydown', (e) => {
    if (!selectedTask) return;

    switch (e.key) {
      case 'ArrowRight':
        if (isMoving) {
          // 移動モード: タスクを1日右に移動
          moveTask(selectedTask, 1);
          announce(`${selectedTask.name}を1日後に移動`);
        } else {
          // 通常モード: 次のタスクに移動
          selectNextTask();
        }
        e.preventDefault();
        break;

      case 'ArrowLeft':
        if (isMoving) {
          moveTask(selectedTask, -1);
          announce(`${selectedTask.name}を1日前に移動`);
        } else {
          selectPreviousTask();
        }
        e.preventDefault();
        break;

      case 'ArrowDown':
        selectTaskBelow();
        e.preventDefault();
        break;

      case 'ArrowUp':
        selectTaskAbove();
        e.preventDefault();
        break;

      case 'Enter':
      case ' ':
        // 選択/移動モードのトグル
        isMoving = !isMoving;
        announce(isMoving
          ? `${selectedTask.name}を移動中。矢印キーで移動、Enterで確定`
          : '移動を確定しました');
        e.preventDefault();
        break;

      case 'Escape':
        if (isMoving) {
          // 移動をキャンセル
          cancelMove(selectedTask);
          isMoving = false;
          announce('移動をキャンセルしました');
        }
        e.preventDefault();
        break;

      case 'Delete':
      case 'Backspace':
        // タスクの削除確認
        confirmDelete(selectedTask);
        e.preventDefault();
        break;
    }
  });
}
```

---

#### 13-2. グローバルキーボードナビゲーション

```javascript
/**
 * スキップリンク（ページ先頭に配置）
 */
// index.html の <body> 直後に追加
// <a href="#main-content" class="skip-link">メインコンテンツへ</a>

/**
 * タブ順序の管理
 * - サイドバー: tabindex=0
 * - メインコンテンツ: tabindex=0
 * - 非アクティブタブの内容: tabindex=-1
 */
function updateTabOrder(activeTabId) {
  // 非アクティブなタブパネルのフォーカス可能要素をtabindex=-1に
  document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
    const isActive = panel.id === `panel-${activeTabId}`;
    panel.querySelectorAll('input, button, select, textarea, a').forEach(el => {
      el.tabIndex = isActive ? 0 : -1;
    });
  });
}
```

##### スキップリンクCSS
```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 0;
  padding: 8px 16px;
  background: var(--accent);
  color: white;
  z-index: 10000;
  transition: top 200ms;
}
.skip-link:focus {
  top: 0;
}
```

---

#### 13-3. Escapeキーの一貫した動作

```javascript
/**
 * Escapeキーのグローバルハンドラ
 * 優先順位: ツールチップ → ドロップダウン → モーダル → 検索 → サイドバー
 */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  // 1. 開いているツールチップを閉じる
  const tooltip = document.querySelector('.tooltip.visible');
  if (tooltip) { tooltip.classList.remove('visible'); return; }

  // 2. 開いているドロップダウンを閉じる
  const dropdown = document.querySelector('[aria-expanded="true"]');
  if (dropdown) { closeDropdown(dropdown); return; }

  // 3. 開いているモーダルを閉じる（最前面から）
  const modals = document.querySelectorAll('.modal-overlay:not([hidden])');
  if (modals.length > 0) {
    closeModal(modals[modals.length - 1]);
    return;
  }

  // 4. 検索パレットを閉じる
  const search = document.querySelector('.search-palette.visible');
  if (search) { closeSearch(); return; }
});
```

#### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/schedule-render.js` | ガントチャートのキーボードナビゲーション |
| `js/ui.js` | タブ順序管理、Escape統一ハンドラ |
| `js/init.js` | グローバルキーイベント登録 |
| `index.html` | スキップリンク、tabindex属性 |
| `style.css` | スキップリンク、フォーカスインジケーター |

#### 実装ステップ
1. スキップリンクの追加
2. グローバルEscapeハンドラの実装
3. タブナビゲーションのキーボード対応（矢印キー）
4. モーダル内のTabトラップ
5. ドロップダウンのキーボード操作（矢印、Enter、Escape）
6. ガントチャートのキーボードナビゲーション
7. フォーカスインジケーターの強化
8. tabindex管理（非アクティブ要素の除外）

#### 工数見積
- 大（5-6日）

---

## 14. 視覚的アクセシビリティ

### 14-1. 色に頼らない状態表示

#### 現状の課題
- 進捗状況が色のみで表現（緑=順調、黄=注意、赤=遅延）
- 色覚特性を持つユーザーには区別不能
- 印刷時（白黒）に情報が失われる

#### 提案内容
- 色に加えてアイコン・テキストラベル・パターンを併用
- 色覚シミュレーション（設定画面でプレビュー）

#### 実装方針

```css
/* 色 + アイコン + テキストの併用 */
.status-completed::before { content: "✓ "; }
.status-ontrack::before { content: "● "; }
.status-warning::before { content: "⚠ "; }
.status-exceeded::before { content: "✕ "; }

/* プログレスバーのパターン（色覚対応） */
.progress-bar.safe {
  background: var(--status-success);
  background-image: none;  /* 塗りつぶし */
}
.progress-bar.warning {
  background: var(--status-warning);
  background-image: repeating-linear-gradient(
    45deg, transparent, transparent 4px,
    rgba(255,255,255,0.3) 4px, rgba(255,255,255,0.3) 8px
  );  /* 斜線パターン */
}
.progress-bar.danger {
  background: var(--status-danger);
  background-image: repeating-linear-gradient(
    90deg, transparent, transparent 4px,
    rgba(255,255,255,0.3) 4px, rgba(255,255,255,0.3) 8px
  );  /* 縦線パターン */
}
```

#### 工数見積
- 中（2日）

---

### 14-2. prefers-reduced-motion対応

#### 現状の課題
- 18個のCSSアニメーションが常時有効
- 前庭障害を持つユーザーに眩暈を引き起こす可能性
- OS設定の「視差効果を減らす」が無視されている

#### 提案内容
- `prefers-reduced-motion: reduce` 時にアニメーションを無効化
- 必要最小限のトランジション（opacity）のみ維持

#### 実装方針

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* opacity変更のみ許可（方向感覚に影響しない） */
  .modal-overlay {
    transition: opacity 200ms ease;
  }
}
```

#### 工数見積
- 小（0.5日）

---

### 14-3. 高コントラストモード

#### 提案内容
- WCAG AAA準拠（7:1コントラスト比）のテーマオプション
- Windows高コントラストモードの検出・対応

#### 実装方針

```css
/* 高コントラストテーマ */
[data-contrast="high"] {
  --bg: #FFFFFF;
  --surface: #FFFFFF;
  --text-primary: #000000;
  --text-secondary: #333333;
  --border: #000000;
  --accent: #0000CC;          /* 明確な青 */
  --status-success: #006600;
  --status-warning: #CC6600;
  --status-danger: #CC0000;
}

/* Windows高コントラストモード検出 */
@media (forced-colors: active) {
  .btn-primary {
    border: 2px solid ButtonText;
  }
  .status-indicator {
    forced-color-adjust: none;  /* カスタム色を維持 */
  }
}
```

#### 工数見積
- 中（1-2日）

---

### 14-4. フォントサイズの柔軟な対応

#### 現状の課題
- `font-size: 13px` など固定px指定が多い
- ブラウザのフォントサイズ設定を拡大しても反映されない
- 視力が弱いユーザーに不便

#### 提案内容
- px → rem/emへの段階的移行
- 200%拡大でもレイアウトが崩れないフレックスベースのレイアウト

#### 実装方針

```css
/* Before */
.form-label { font-size: 12px; }
.form-input { font-size: 13px; padding: 8px 12px; }
.table-cell { font-size: 13px; }

/* After */
html { font-size: 14px; }  /* 基準サイズ */
.form-label { font-size: 0.857rem; }  /* 12/14 */
.form-input { font-size: 0.929rem; padding: 0.571rem 0.857rem; }
.table-cell { font-size: 0.929rem; }
```

##### 移行戦略
```
Phase 1: html基準サイズをCSS変数化
Phase 2: 新規CSSはrem/emで記述
Phase 3: 既存のpx値を段階的にrem/emに置換
Phase 4: 200%拡大テスト・レイアウト修正
```

#### 工数見積
- 大（3-4日）※段階的に実施

---

## まとめ

| # | 改善 | 優先度 | 工数 | WCAG準拠レベル |
|---|------|--------|------|---------------|
| 12-1 | タブのARIA化 | 最高 | 中 | A |
| 12-2 | モーダルフォーカストラップ | 最高 | 中 | A |
| 12-3 | ドロップダウンのARIA化 | 高 | 中 | A |
| 12-4 | ライブリージョン | 高 | 小 | A |
| 13-1 | ガントチャートキーボード | 中 | 大 | A |
| 13-2 | グローバルキーボードナビ | 高 | 中 | A |
| 13-3 | Escape統一 | 高 | 小 | AA |
| 14-1 | 色に頼らない表示 | 高 | 中 | A |
| 14-2 | reduced-motion | 高 | 小 | AAA |
| 14-3 | 高コントラスト | 低 | 中 | AAA |
| 14-4 | rem/em移行 | 中 | 大 | AA |

### WCAG準拠の段階的アプローチ
```
Step 1 (A準拠):  12-1, 12-2, 12-3, 12-4, 14-1
Step 2 (AA準拠): 13-2, 13-3, 14-4
Step 3 (AAA準拠): 13-1, 14-2, 14-3
```
