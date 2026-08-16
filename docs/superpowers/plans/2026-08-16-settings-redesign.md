# 設定タブ再構築（カテゴリナビ切替）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定タブを 5 カテゴリのナビ切替構造に再編し、行パターン・文言を統一して「見つからない・冗長・多すぎ・分類が怪しい」を解消する。

**Architecture:** `#settings` 内に `settings-layout`（左ナビ＋右コンテンツ）を新設し、既存 12 セクションを 5 つのカテゴリパネルに再配置。切替は `ui.js` の小関数（イベント委譲＋localStorage 復元）。設定入力要素の id/name/value は不変とし、ラジオはセグメントコントロール（visually-hidden radio 内包）、チェックボックスはスイッチ（native checkbox 内包）で包み直す。

**Tech Stack:** 純粋 HTML/CSS/JS（ES Modules）、localStorage、検証は /verify-ui（Playwright + playwright-core フォールバック）

## Global Constraints

- 設計書: `docs/superpowers/specs/2026-08-16-settings-redesign-design.md`
- 設定入力要素の `id` / `name` / `value` 属性は**全て不変**（15 JSファイルが参照）。唯一の削除は `btnUpdateAllDisplays`（適用ボタン）
- 隠し互換要素9個（`themeColor` `themePattern` `themeTabColor` `themeBackgroundColor` `tabBarAlwaysVisible` `tabFilterAlwaysExpanded` `tabFilterButtonStyle` `tabFilterLayout` `mobileTabDesign`）は `#settings` 直下（カテゴリパネル外）に維持
- インライン style 禁止（新規マークアップは全てクラスベース）
- マジックナンバー禁止: localStorage キーは `js/constants.js` の `STORAGE_KEYS` に追加
- コミットは自分が編集したファイルのみ明示ステージ（`git add <file>...`、`-A` 禁止）
- カテゴリパネルは `display:none` 切替（DOM には常在）→ 既存 JS の `querySelector` は全パネルに届く
- UI 実装時は frontend-design スキルの指針に従う（既存デザイン言語 = サイドバー `.nav-item.active`（`--accent-light` 背景 + `--accent` 文字）に調和させる）

## カテゴリ構成と項目マッピング（確定・承認済み）

| category 値 | ナビ表示名 | 含むセクション（既存 ID/name） |
|---|---|---|
| `appearance` | 外観 | テーマカラー(`themeSwatches`) / グラフカラーパターン(`chartColorScheme`+プレビュー) / スケジュールバーの色(`scheduleBarColorMode`) |
| `display` | 表示 | 見積一覧の表示形式(`defaultEstimateViewType`) / レポートの表示形式(`defaultReportViewType`) / 月標準工数(`estimateStandardDisplay`) / 月色分け(`showMonthColorsCheckbox`) / マトリクス背景色(`reportMatrixBgColorMode`) / 進捗バー(`showProgressBarsCheckbox`)＋サブ行（スタイル `progressBarStyle`・%表示 `showProgressPercentageCheckbox`）/ 見積実績形式(`matrixEstActFormat`) / 担当者表示順(`memberOrder`+`btnShowMemberOrderHelp`) |
| `analysis` | レポート分析 | 分析オン/オフ7項目（小見出しを Phase 1/2/3 →「基本指標/グラフ/高度な分析」に改名。`reportAccuracyEnabled` `reportAnomalyEnabled` `reportWarningTasksEnabled` / `reportChartEnabled` `reportTrendEnabled` / `reportMemberAnalysisEnabled` `reportInsightsEnabled`）/ 版数別構成比(`versionChartLayout`) |
| `data` | データ | 自動バックアップ(`autoBackupEnabled`) / 会社休日設定(`companyHolidayName` `companyHolidayStartDate` `companyHolidayEndDate` `btnAddCompanyHoliday` `companyHolidayList`) |
| `advanced` | 詳細 | フィルタバー(`filterBarMode` `showSegmentButtons`) / クイック入力前回モード記憶(`rememberQuickInputMode`) / デバッグモード(`debugModeEnabled`) / 開発中の機能(`devFeaturesEnabled`) |

## 新しい文言（全項目コピーテーブル）

説明は 1 行。以下を実装時にそのまま使う。

| 項目 | ラベル | 説明（1行） | コントロール |
|---|---|---|---|
| themeSwatches | アクセントカラー | サイドバーやボタンの基調色 | スウォッチ（現状維持） |
| chartColorScheme | グラフカラーパターン | レポートの担当者分析グラフの配色 | セレクト＋プレビュー |
| scheduleBarColorMode | スケジュールバーの色 | ガントチャートのバー配色 | セグメント: 固定カラー/テーマカラー |
| defaultEstimateViewType | 見積一覧の表示形式 | 見積一覧の初期表示 | セグメント: グループ/マトリクス |
| defaultReportViewType | レポートの表示形式 | レポートの初期表示 | セグメント: グループ/マトリクス |
| estimateStandardDisplay | 月標準工数の表示 | 月フィルタ選択時に営業日数×8h×人数の標準工数を表示 | セグメント: サブテキスト/下部バー/非表示 |
| showMonthColorsCheckbox | 見積一覧の月色分け | 工程の割当月に応じてセルを色分け | スイッチ |
| reportMatrixBgColorMode | マトリクスの背景色 | レポートの月別・版数別・全期間表示に適用 | セグメント: なし/月ごと/乖離率 |
| showProgressBarsCheckbox | 進捗バー | レポートに見込残存時間ベースの進捗バーを表示 | スイッチ |
| progressBarStyle（サブ行） | 表示位置 | セル下部ではパーセンテージは表示されない | セグメント: セル内/セル下部 |
| showProgressPercentageCheckbox（サブ行） | パーセンテージ表示 | 進捗バーの下に % を表示 | スイッチ |
| matrixEstActFormat | 見積と実績の表示 | レポートマトリクスでの並べ方（例: 10.0 / 15.5） | セグメント: 2行/スラッシュ |
| memberOrder | 担当者表示順 | カンマ区切り。未指定の担当者は後ろに表示（自動保存） | テキスト＋ℹ️ |
| reportAccuracyEnabled | 見積精度の%表示 | 工程別・版数別の精度を表示 | スイッチ（小見出し: 基本指標） |
| reportAnomalyEnabled | 異常値ハイライト | 乖離 50% 超を強調表示 | スイッチ（基本指標） |
| reportWarningTasksEnabled | 要注意タスク | 要注意タスクをリスト表示 | スイッチ（基本指標） |
| reportChartEnabled | 棒グラフ | 版数別・工程別の棒グラフを表示 | スイッチ（小見出し: グラフ） |
| reportTrendEnabled | 月別推移 | 月別推移グラフを表示 | スイッチ（グラフ） |
| reportMemberAnalysisEnabled | 担当者別の詳細分析 | 担当者ごとの分析セクションを表示 | スイッチ（小見出し: 高度な分析） |
| reportInsightsEnabled | インサイト・推奨アクション | 自動生成のインサイトを表示 | スイッチ（高度な分析） |
| versionChartLayout | 版数別タスク構成比 | 分析タブでの表示形式 | セグメント: フォーカス/一覧比較 |
| autoBackupEnabled | 自動バックアップ | 登録・編集時に JSON を自動ダウンロード | スイッチ |
| 会社休日設定 | 会社休日 | 夏季休暇などを登録し実働日数の計算に反映 | フォーム（現状の入力+追加ボタン+リスト） |
| filterBarMode | フィルタバーの表示 | スクロール時の上部フィルタバーの出し方 | セグメント: スマート/ホバー/オフ |
| showSegmentButtons | ページ内フィルタ | オフでページ内フィルタを隠しフィルタバーを常時表示 | スイッチ |
| rememberQuickInputMode | クイック入力モードの記憶 | 前回の実績/見積モードで開始 | スイッチ |
| debugModeEnabled | デバッグモード | エラー時に詳細メッセージを表示 | スイッチ |
| devFeaturesEnabled | 開発中の機能 | スケジュール等の開発中機能を有効化 | スイッチ |

## File Structure

- Modify: `index.html`（`#settings` 内 1438-2034 行付近の再構築）
- Modify: `style.css`（section 22 Settings の拡張 3193-3238 付近、モバイル 4569 付近、redesign 帯 8390-8394 の置換）
- Modify: `js/constants.js`（`STORAGE_KEYS.SETTINGS_CATEGORY` 追加）
- Modify: `js/ui.js`（`initSettingsNav()` 追加）
- Modify: `js/init.js`（`initSettingsNav()` 呼び出し追加）
- Modify: `js/events.js`（587-588 の重複リスナーと 593-594 のボタンバインド削除）

テストフレームワークは無し。検証は /verify-ui の Playwright 機械判定（Task 6）で行い、各タスク末尾では構文レベルの確認（`node --check` 相当は ESM のため `node -e "import(...)"` は不可、ブラウザ読み込みは Task 6 で担保）とコミットのみ行う。

---

### Task 1: CSS コンポーネント追加（レイアウト/ナビ/スイッチ/セグメント/サブ行）

**Files:**
- Modify: `style.css`（`/* ---- 22. Settings ---- */` セクション 3193 付近に追記、モバイル用は 4569 付近の既存 `@media` 内、redesign 帯 8390-8394 を置換）

**Interfaces:**
- Produces: クラス `.settings-layout` `.settings-nav` `.settings-nav-item(.active)` `.settings-category(.active)` `.setting-info` `.setting-control` `.setting-subrow` `.setting-switch`（内部 `.switch-track`）`.setting-segment`（内部 `.segment-btn`）`.setting-group-heading`（Task 3-5 の HTML が使用）

- [ ] **Step 1: section 22 に新コンポーネント CSS を追記**

```css
/* 設定: カテゴリナビ切替レイアウト */
.settings-layout {
    display: flex;
    gap: 24px;
    align-items: flex-start;
}

.settings-nav {
    position: sticky;
    top: 20px;
    flex: 0 0 168px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.settings-nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    border: none;
    background: none;
    border-radius: var(--radius-sm);
    font-size: calc(15.5px * var(--ui-scale));
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    transition: background var(--transition), color var(--transition);
}

.settings-nav-item:hover {
    background: var(--border-light);
    color: var(--text-primary);
}

.settings-nav-item.active {
    background: var(--accent-light);
    color: var(--accent);
    font-weight: 600;
}

.settings-content {
    flex: 1;
    min-width: 0;
}

.settings-category {
    display: none;
}

.settings-category.active {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

/* 行レイアウト（既存 .setting-row を左右2カラムで使う） */
.setting-info {
    flex: 1;
    min-width: 0;
    padding-right: 16px;
}

.setting-control {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.setting-row.setting-subrow {
    margin-left: 12px;
    padding-left: 14px;
    border-left: 2px solid var(--border-light);
}

.setting-group-heading {
    font-size: calc(13px * var(--ui-scale));
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.04em;
    margin: 14px 0 2px;
}

.setting-group-heading:first-child {
    margin-top: 0;
}

/* スイッチ（native checkbox 内包） */
.setting-switch {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 22px;
    flex-shrink: 0;
}

.setting-switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
}

.setting-switch .switch-track {
    display: block;
    width: 100%;
    height: 100%;
    background: #D4D1CC;
    border-radius: 11px;
    transition: background var(--transition);
    pointer-events: none;
    position: relative;
}

.setting-switch .switch-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    background: #FFFFFF;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform var(--transition);
}

.setting-switch input:checked + .switch-track {
    background: var(--accent);
}

.setting-switch input:checked + .switch-track::after {
    transform: translateX(18px);
}

/* セグメントコントロール（native radio 内包） */
.setting-segment {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px;
    gap: 2px;
    background: var(--surface);
}

.setting-segment label {
    position: relative;
    cursor: pointer;
    margin: 0;
}

.setting-segment input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
}

.setting-segment .segment-btn {
    display: inline-block;
    padding: 5px 12px;
    border-radius: 4px;
    font-size: calc(14px * var(--ui-scale));
    color: var(--text-secondary);
    white-space: nowrap;
    transition: background var(--transition), color var(--transition);
}

.setting-segment input:checked + .segment-btn {
    background: var(--accent-light);
    color: var(--accent);
    font-weight: 600;
}

/* グラフプレビュー（インライン style 置換用） */
.chart-preview-block {
    background: var(--surface);
    border: 1px solid var(--border-light);
    padding: 12px 15px;
    border-radius: 8px;
    margin-top: 10px;
}

.chart-preview-title {
    font-size: calc(14px * var(--ui-scale));
    font-weight: 600;
    margin-bottom: 10px;
    color: var(--text-secondary);
}

.chart-preview-items {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.chart-preview-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: calc(14px * var(--ui-scale));
    color: var(--text-secondary);
}

.chart-preview-swatch {
    width: 20px;
    height: 20px;
    border-radius: 3px;
}

.chart-preview-swatch--bar {
    width: 40px;
}
```

- [ ] **Step 2: モバイル対応（4569 付近の既存 `@media` 内の `.setting-row` ブロックの近くに追記）**

```css
    /* Settings: カテゴリナビを横スクロールチップに */
    .settings-layout {
        flex-direction: column;
        gap: 12px;
    }

    .settings-nav {
        position: static;
        flex: none;
        width: 100%;
        flex-direction: row;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 4px;
    }

    .settings-nav-item {
        flex-shrink: 0;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 7px 14px;
    }

    .settings-nav-item.active {
        border-color: var(--accent);
    }

    .setting-info {
        padding-right: 0;
    }
```

- [ ] **Step 3: redesign 帯のインライン style 依存ハックを置換（8390-8394）**

置換前:
```css
    /* --- 設定 --- */
    .setting-section > p { font-size: 12px !important; }
    #settings .setting-section div[style*="font-size: calc(15.5px"] { font-size: 13px !important; }
    #settings .setting-section span[style*="font-size: calc(15.5px"] { font-size: 12px !important; }
    #btnShowMemberOrderHelp { font-size: 18px !important; }
```

置換後:
```css
    /* --- 設定 --- */
    .setting-label { font-size: 13px !important; }
    .setting-desc { font-size: 12px !important; }
    .settings-nav-item { font-size: 13px !important; }
    .setting-segment .segment-btn { font-size: 12px !important; }
    .setting-group-heading { font-size: 11px !important; }
    #btnShowMemberOrderHelp { font-size: 18px !important; }
```

- [ ] **Step 4: コミット**

```bash
git add style.css
git commit -m "feat(settings): カテゴリナビ・スイッチ・セグメント等の設定UI用CSSを追加"
```

---

### Task 2: JS（カテゴリ切替＋適用ボタン廃止）

**Files:**
- Modify: `js/constants.js`（`STORAGE_KEYS` の「UI状態」グループに追加）
- Modify: `js/ui.js`（末尾付近に `initSettingsNav` を追加）
- Modify: `js/init.js`（DOMContentLoaded 内の init 呼び出し群に追加）
- Modify: `js/events.js`（587-588・593-594 削除）

**Interfaces:**
- Consumes: Task 3 の HTML（`#settingsNav`、`.settings-nav-item[data-category]`、`.settings-category[data-category]`）。HTML より先に JS を入れても `getElementById` ガードで無害
- Produces: `export function initSettingsNav(): void`（init.js が呼ぶ）、`STORAGE_KEYS.SETTINGS_CATEGORY = 'manhour_settingsCategory'`

- [ ] **Step 1: constants.js にキー追加（`CURRENT_TAB` の並びに）**

```js
    SETTINGS_CATEGORY: 'manhour_settingsCategory',
```

- [ ] **Step 2: ui.js に切替関数を追加（既存の init 系 export の近く、JSDoc 付き）**

```js
/**
 * 設定タブのカテゴリナビ（外観/表示/レポート分析/データ/詳細）を初期化する。
 * 最後に開いたカテゴリを localStorage から復元し、クリックで切り替える。
 */
export function initSettingsNav() {
    const nav = document.getElementById('settingsNav');
    if (!nav) return;

    const categories = Array.from(
        document.querySelectorAll('#settings .settings-category')
    ).map(el => el.dataset.category);

    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS_CATEGORY);
    switchSettingsCategory(categories.includes(saved) ? saved : categories[0]);

    nav.addEventListener('click', (e) => {
        const btn = e.target.closest('.settings-nav-item');
        if (!btn) return;
        switchSettingsCategory(btn.dataset.category);
    });
}

/**
 * 指定カテゴリの設定パネルだけを表示し、選択状態を保存する。
 * @param {string} category - data-category 値（appearance/display/analysis/data/advanced）
 */
function switchSettingsCategory(category) {
    document.querySelectorAll('#settingsNav .settings-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    document.querySelectorAll('#settings .settings-category').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.category === category);
    });
    localStorage.setItem(STORAGE_KEYS.SETTINGS_CATEGORY, category);
}
```

`STORAGE_KEYS` が ui.js に import 済みか確認し、無ければ import に追加する。

- [ ] **Step 3: init.js の DOMContentLoaded 内で呼び出し**

既存の UI 系 init 呼び出し（`initTabIndicator()` など）の直後に `initSettingsNav();` を追加。import 文にも `initSettingsNav` を追加する。

- [ ] **Step 4: events.js の重複リスナーとボタンバインドを削除**

削除対象（`js/events.js` 586-594 付近）:
```js
    // 担当者順序
    const memberOrder = document.getElementById('memberOrder');
    if (memberOrder) memberOrder.addEventListener('change', updateAllDisplays);
```
```js
    const btnUpdateAllDisplays = document.getElementById('btnUpdateAllDisplays');
    if (btnUpdateAllDisplays) btnUpdateAllDisplays.addEventListener('click', updateAllDisplays);
```
※ `memberOrder` の自動保存＋反映は 192-203 行の既存リスナー（saveData + updateAllDisplays）が担っているため挙動は変わらない。`btnShowMemberOrderHelp` のバインド（590-591）は残す。削除で `updateAllDisplays` の import が未使用になる場合のみ import からも除去（他の使用箇所があれば残す）。

- [ ] **Step 5: コミット**

```bash
git add js/constants.js js/ui.js js/init.js js/events.js
git commit -m "feat(settings): カテゴリナビ切替JSを追加、設定適用ボタンの冗長バインドを削除"
```

---

### Task 3: index.html — カテゴリコンテナへの再編（構造のみ）

**Files:**
- Modify: `index.html:1460-2033`（`.settings-grid` を `settings-layout` に置換）

**Interfaces:**
- Consumes: Task 2 の `initSettingsNav`（`#settingsNav` を拾う）
- Produces: 5 つの `.settings-category[data-category]` パネル（Task 4-5 が中身を書き換える）

- [ ] **Step 1: `.settings-grid` 開始タグをナビ＋コンテンツ構造に置換**

```html
<div class="settings-layout">
    <nav class="settings-nav" id="settingsNav" aria-label="設定カテゴリ">
        <button type="button" class="settings-nav-item" data-category="appearance">外観</button>
        <button type="button" class="settings-nav-item" data-category="display">表示</button>
        <button type="button" class="settings-nav-item" data-category="analysis">レポート分析</button>
        <button type="button" class="settings-nav-item" data-category="data">データ</button>
        <button type="button" class="settings-nav-item" data-category="advanced">詳細</button>
    </nav>
    <div class="settings-content">
        <div class="settings-category" data-category="appearance"><!-- 外観セクション群 --></div>
        <div class="settings-category" data-category="display"><!-- 表示セクション群 --></div>
        <div class="settings-category" data-category="analysis"><!-- レポート分析セクション群 --></div>
        <div class="settings-category" data-category="data"><!-- データセクション群 --></div>
        <div class="settings-category" data-category="advanced"><!-- 詳細セクション群 --></div>
    </div>
</div><!-- /.settings-layout -->
```

- [ ] **Step 2: 既存 12 セクションを丸ごと（この時点では中身無変更で）マッピング表どおりのパネルへ移動**

- 外観へ: テーマカラー / グラフカラーパターン / スケジュールバーの色
- 表示へ: 表示形式 / マトリクス表示 / 担当者表示順
- レポート分析へ: レポート分析機能（分析タブ含む）
- データへ: 自動バックアップ / 会社休日設定
- 詳細へ: フィルタバー / クイック入力モード / 開発設定

隠し互換要素（`themeColor` 等 4 select と `tabBarAlwaysVisible` 等 5 要素）は `.settings-layout` の**外**（`#settings` 直下）に置いたまま残す。`.settings-grid` の div は削除。

- [ ] **Step 3: ブラウザで簡易確認（/verify-ui の serve.py 起動、`#settingsNav` クリックで切替すること・コンソールエラーが無いことを確認）**

- [ ] **Step 4: コミット**

```bash
git add index.html
git commit -m "feat(settings): 設定タブを5カテゴリのナビ切替構造に再編"
```

---

### Task 4: index.html — 外観・データ・詳細カテゴリの行パターン統一

**Files:**
- Modify: `index.html`（Task 3 で移動した各セクションの中身）

**Interfaces:**
- Consumes: Task 1 の CSS クラス群
- Produces: 統一マークアップ（Task 5 も同じパターンを使う）

**共通パターン（この 3 種のみ使用）:**

スイッチ行（checkbox。id は既存のまま）:
```html
<div class="setting-row">
    <div class="setting-info">
        <div class="setting-label">自動バックアップ</div>
        <div class="setting-desc">登録・編集時に JSON を自動ダウンロード</div>
    </div>
    <div class="setting-control">
        <label class="setting-switch">
            <input type="checkbox" id="autoBackupEnabled">
            <span class="switch-track"></span>
        </label>
    </div>
</div>
```

セグメント行（radio。name/value/checked は既存のまま）:
```html
<div class="setting-row">
    <div class="setting-info">
        <div class="setting-label">スケジュールバーの色</div>
        <div class="setting-desc">ガントチャートのバー配色</div>
    </div>
    <div class="setting-control">
        <div class="setting-segment">
            <label><input type="radio" name="scheduleBarColorMode" value="original" checked><span class="segment-btn">固定カラー</span></label>
            <label><input type="radio" name="scheduleBarColorMode" value="theme"><span class="segment-btn">テーマカラー</span></label>
        </div>
    </div>
</div>
```

セレクト行（select。id/option は既存のまま）:
```html
<div class="setting-row">
    <div class="setting-info">
        <div class="setting-label">グラフカラーパターン</div>
        <div class="setting-desc">レポートの担当者分析グラフの配色</div>
    </div>
    <div class="setting-control">
        <select id="chartColorScheme">…既存 option…</select>
    </div>
</div>
```

- [ ] **Step 1: 外観カテゴリを統一パターンに書き換え**

- テーマカラー: 既存 `.setting-row`＋`themeSwatches` は現状の形を維持（説明のみ「サイドバーやボタンの基調色」に）
- グラフカラーパターン: セレクト行＋プレビュー（プレビューは `chart-preview-*` クラスでインライン style を置換。`chartPreviewEstimateBar` `chartPreviewActualBar` は `chart-preview-swatch chart-preview-swatch--bar`、`chartPreviewUI/PG/PT/IT/ST` は `chart-preview-swatch`。id は全て維持）
- スケジュールバーの色: セグメント行（上記例そのもの）
- 各セクションの長文 `<p>` 説明は削除（説明は行の `setting-desc` へ）

- [ ] **Step 2: データカテゴリを統一パターンに書き換え**

- 自動バックアップ: スイッチ行（上記例そのもの）
- 会社休日: 見出し「会社休日」＋desc「夏季休暇などを登録し実働日数の計算に反映」。入力フォーム（`companyHolidayName`/`companyHolidayStartDate`/`companyHolidayEndDate`/`btnAddCompanyHoliday`/`companyHolidayList`）は既存 form-group 構造を維持しつつインライン style をクラス化（`.setting-inline-fields { display:flex; gap:10px; }` が必要なら Task 1 の CSS に追加してよい）

- [ ] **Step 3: 詳細カテゴリを統一パターンに書き換え**

- フィルタバーの表示: セグメント行（name=`filterBarMode`、スマート/ホバー/オフ）
- ページ内フィルタ: スイッチ行（`showSegmentButtons`）
- クイック入力モードの記憶: スイッチ行（`rememberQuickInputMode`）
- デバッグモード: スイッチ行（`debugModeEnabled`）
- 開発中の機能: スイッチ行（`devFeaturesEnabled`）
- 文言はコピーテーブルのとおり

- [ ] **Step 4: ブラウザ簡易確認（切替・スイッチ/セグメント操作で値が変わり localStorage に保存されること）**

- [ ] **Step 5: コミット**

```bash
git add index.html
git commit -m "feat(settings): 外観・データ・詳細カテゴリを統一行パターンに刷新"
```

---

### Task 5: index.html — 表示・レポート分析カテゴリの統一（最大の書き換え）

**Files:**
- Modify: `index.html`（表示カテゴリ: 旧「表示形式」「マトリクス表示」「担当者表示順」／レポート分析カテゴリ: 旧「レポート分析機能」）

**Interfaces:**
- Consumes: Task 4 の共通パターン
- Produces: 完成した設定 UI（Task 6 が検証）

- [ ] **Step 1: 表示カテゴリを書き換え**

コピーテーブル順に、以下を 1 セクション（`.setting-section` 見出し「表示」）または論理的な 2 セクション（「一覧とレポート」「マトリクス表示」）へ再構成:

1. 見積一覧の表示形式 → セグメント（`defaultEstimateViewType` は select のため、**select のまま**セレクト行にする。※ select→radio 化は id/型変更になるため禁止。2択でも select 維持）
2. レポートの表示形式 → 同上セレクト行
3. 月標準工数の表示 → セレクト行（`estimateStandardDisplay`）
4. 見積一覧の月色分け → スイッチ行（`showMonthColorsCheckbox`）
5. マトリクスの背景色 → セグメント行（`reportMatrixBgColorMode`: なし/月ごと/乖離率）
6. 進捗バー → スイッチ行（`showProgressBarsCheckbox`）
7. 　└ 表示位置 → **サブ行**（`.setting-row.setting-subrow`）セグメント（`progressBarStyle`: セル内/セル下部）
8. 　└ パーセンテージ表示 → **サブ行**スイッチ（`showProgressPercentageCheckbox`）
9. 見積と実績の表示 → セグメント行（`matrixEstActFormat`: 2行/スラッシュ）
10. 担当者表示順 → テキスト行:

```html
<div class="setting-row">
    <div class="setting-info">
        <div class="setting-label">担当者表示順
            <button type="button" id="btnShowMemberOrderHelp" class="setting-help-btn" title="入力方法">ℹ️</button>
        </div>
        <div class="setting-desc">カンマ区切り。未指定の担当者は後ろに表示（自動保存）</div>
    </div>
    <div class="setting-control setting-control--wide">
        <input type="text" id="memberOrder" placeholder="例: 山田,佐藤,田中">
    </div>
</div>
```

`.setting-help-btn { border:none; background:none; cursor:pointer; color:var(--accent); font-size: calc(16px * var(--ui-scale)); padding: 0 2px; }` と `.setting-control--wide { flex: 0 1 320px; } .setting-control--wide input { width: 100%; }` を Task 1 の CSS 群に追加（Task 1 実施時にまとめて入れてよい）。

**`btnUpdateAllDisplays` ボタンはここで削除する（マークアップから除去）。**

- [ ] **Step 2: レポート分析カテゴリを書き換え**

`.setting-group-heading` で 3 グループに分け、全てスイッチ行（Phase 文言は完全撤去）:

```html
<div class="setting-group-heading">基本指標</div>
<!-- reportAccuracyEnabled / reportAnomalyEnabled / reportWarningTasksEnabled のスイッチ行 -->
<div class="setting-group-heading">グラフ</div>
<!-- reportChartEnabled / reportTrendEnabled のスイッチ行 -->
<div class="setting-group-heading">高度な分析</div>
<!-- reportMemberAnalysisEnabled / reportInsightsEnabled のスイッチ行 -->
<div class="setting-group-heading">分析タブ</div>
<!-- versionChartLayout のセグメント行（フォーカス/一覧比較） -->
```

ラベル・説明はコピーテーブルのとおり。旧「・設定は自動的に保存されます」等の注意書きは全て削除。

- [ ] **Step 3: 残存インライン style の掃除**

`#settings` 内（隠し互換要素を除く）に `style=` 属性が残っていないことを確認:
```bash
# 対象範囲を目視 + grep で確認
grep -n 'style=' index.html | sed -n '/settings/,$p'
```
残っていれば該当をクラス化（隠し互換要素の `display:none` は許容）。

- [ ] **Step 4: コミット**

```bash
git add index.html style.css
git commit -m "feat(settings): 表示・レポート分析カテゴリを統一、Phase表記と適用ボタンを廃止"
```

---

### Task 6: /verify-ui による機械判定（PASS まで）

**Files:**
- Create: scratchpad 配下に serve.py / verify-settings.js（Node + playwright-core）

**Interfaces:**
- Consumes: 完成した設定 UI、`git archive HEAD`（Task 1 開始前のコミット）による修正前スナップショット

- [ ] **Step 1: /verify-ui の手順どおりサーバー2本を起動**（8801=修正前スナップショット、8803=worktree）

- [ ] **Step 2: ID センサス（互換性の網羅チェック）**

両ポートで以下を evaluate し、集合比較:
```js
const els = Array.from(document.querySelectorAll('#settings input, #settings select, #settings textarea, #settings button'));
const ids = els.map(e => e.id).filter(Boolean).sort();
const names = [...new Set(els.map(e => e.name).filter(Boolean))].sort();
const radioValues = {};
document.querySelectorAll('#settings input[type=radio]').forEach(r => {
    (radioValues[r.name] = radioValues[r.name] || []).push(r.value);
});
return { ids, names, radioValues };
```
判定: 旧 ids ⊆ 新 ids ∪ {`btnUpdateAllDisplays`}（唯一の意図的削除）、旧 names = 新 names、radio の value 集合が名前ごとに一致。

- [ ] **Step 3: カテゴリ切替の判定**

設定タブを開き、5 つの `.settings-nav-item` を順にクリック。各クリック後に
`document.querySelectorAll('#settings .settings-category.active').length === 1` かつ
active パネルの `data-category` がクリック値と一致、非 active パネルは `offsetParent === null`。

- [ ] **Step 4: 保存と復元の判定**

1. `reportMatrixBgColorMode` の「乖離率」セグメントをクリック → radio checked 反映と localStorage 変化
2. `autoBackupEnabled` スイッチをクリック → checked 反映
3. `memberOrder` に `B,A` を入力して change 発火（seed に山田/佐藤等 2 名の実績を投入しておき、実績タブの表示順が入れ替わることをボタン無しで確認）
4. reload → 上記 3 つが復元されていること、最後に開いたカテゴリが復元されること

- [ ] **Step 5: モバイル判定**

viewport 390×844 で設定タブを開き、`.settings-nav` の `getComputedStyle(...).flexDirection === 'row'`、チップクリックで切替が機能すること。

- [ ] **Step 6: 対照ケース（デグレ無し）**

seed 投入済みデータで見積タブのマトリクスが従来どおり描画されること（`#estimateList` 内の `table` 存在とセル数 > 0）、テーマスウォッチのクリックでテーマが変わること（`documentElement` の class/属性変化）。

- [ ] **Step 7: スクショ証跡（PC×5 カテゴリ + モバイル×1）を保存し Read で視覚確認**

- [ ] **Step 8: FAIL があれば修正して再検証。全 PASS 後にサーバー停止・修正コミット**

```bash
git add <修正したファイルのみ>
git commit -m "fix(settings): Playwright検証で発見した不具合を修正"
```

---

### Task 7: デプロイ

- [ ] **Step 1: /deploy スキルを実行**（ui-scaling のコミット＆プッシュ → main 空コミットで Pages リビルド発火）
- [ ] **Step 2: 完了報告**（変更概要・検証結果・スクショ）

## Self-Review 結果

- スペック網羅: 分類/ナビ/行統一/文言/適用ボタン廃止/インラインstyle廃止/検証/デプロイ → Task 1-7 で全てカバー。「見積一覧・レポートの表示形式は 2 択だが select 維持」は id/型不変制約の帰結として Task 5 に明記
- プレースホルダ: 無し（全コピー・全コードを本文に記載）
- 型/命名整合: `initSettingsNav`/`switchSettingsCategory`/`STORAGE_KEYS.SETTINGS_CATEGORY`/`data-category` 値 5 種は全タスクで一致
