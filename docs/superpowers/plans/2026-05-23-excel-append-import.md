# Excel 追加読み込み機能 — 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Excel ファイルから見積・実績を現在のデータに追加できる機能を実装する。競合する見積行はプレビュー画面で行単位に上書き/スキップを選択、実績は完全一致時のみスキップ。

**Architecture:** 新規モジュール `js/excel-import.js` にパース・競合検出・プレビューモーダル・確定処理・undo 対応を集約。`xlsx.mjs` は dynamic import で遅延ロード。動的コンテンツは XSS 安全のため `createElement` + `textContent` ベースで構築（DOM 構築ヘルパー `el()` を使用）。

**Tech Stack:** Vanilla ES Modules / xlsx.mjs (SheetJS, ローカルバンドル) / localStorage

**関連仕様書:** `docs/superpowers/specs/2026-05-23-excel-append-import-design.md`
**関連モックアップ:** `mockups/excel-append-import/mockup-d-summary-compare.html`

---

## 開発方針

- このプロジェクトには自動テスト基盤がない。各タスクの検証は **ブラウザでの手動確認** で行う
- ブラウザは `python3 -m http.server 8000` 等で起動し、`http://localhost:8000/` を開く
- 各タスク完了時にコミット
- 既存パターン（`js/modal.js`、`js/history.js`）に倣う

---

## ファイル構造

```
js/excel-import.js          ← 新規。本機能の本体（パース / 競合検出 / モーダル / 確定 / undo）
js/storage.js               ← 修正。handleFileImport の Excel 分岐を新導線案内に変更
js/events.js                ← 修正。新ボタンと専用 fileInput のイベント wire
js/history.js               ← 修正。'excel_import' タイプの undo/redo ハンドラ追加
index.html                  ← 修正。設定タブのセクションリネーム + 新ボタン + 専用 fileInput + プレビューモーダル DOM
style.css                   ← 修正。プレビューモーダル用スタイル
```

---

## Task 1: 入口 UI を追加（設定タブのリネーム + 新ボタン + 専用 fileInput）

**Files:**
- Modify: `index.html` 656-672 行（Excel 出力セクション）と 2009 行付近（fileInput 隣）
- Modify: `js/events.js` 606-611 行（ボタン wire）
- Modify: `js/storage.js` 660-669 行（Excel 分岐を新導線案内に）
- Create: `js/excel-import.js`（スケルトン）

- [ ] **Step 1: index.html の Excel 出力セクションをリネーム + 新ボタン追加**

`index.html` の 656-672 行を以下に置き換え：

```html
                <!-- Excel 入出力セクション -->
                <div style="background: var(--surface-elevated); padding: 20px; border-radius: 8px; margin: 30px 0;">
                    <h3>📊 Excel の入出力</h3>
                    <p style="color: var(--text-muted); margin-bottom: 15px;">実績データと見積データを Excel ファイルでやり取りします。</p>

                    <div style="margin-bottom: 15px;">
                        <h4 style="margin-bottom: 8px; font-size: 14px;">出力内容:</h4>
                        <ul style="color: var(--text-muted); font-size: 13px; margin-left: 20px;">
                            <li><strong>実績シート（担当者別）:</strong> 日付、曜日、備考、作業、時間</li>
                            <li><strong>見積シート:</strong> 版数、作業月、対応名、工程、担当、見積工数</li>
                        </ul>
                    </div>

                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="btn btn-success" id="btnExportExcel" style="font-weight: 600;">
                            📥 Excel ファイルをダウンロード
                        </button>
                        <button class="btn btn-primary" id="btnImportExcel" style="font-weight: 600;">
                            📂 Excel ファイルを読み込んで追加
                        </button>
                    </div>
                    <p style="color: var(--text-muted); font-size: 12px; margin-top: 10px;">
                        「読み込んで追加」は現在のデータを残したまま Excel の見積・実績を追加します。
                        既存データと競合する行は次の画面で個別に確認できます。
                    </p>
                </div>
```

- [ ] **Step 2: 専用 fileInput を index.html に追加**

`index.html` 2009 行の既存 fileInput の直後に以下を追加：

```html
    <input type="file" id="excelImportInput" accept=".xlsx,.xls" style="display: none;">
```

- [ ] **Step 3: js/events.js にボタン wire を追加**

`js/events.js` の `btnExportExcel` 配線の直後（608 行直後）に以下を追加：

```javascript
    const btnImportExcel = document.getElementById('btnImportExcel');
    if (btnImportExcel) {
        btnImportExcel.addEventListener('click', () => {
            const input = document.getElementById('excelImportInput');
            if (input) input.click();
        });
    }

    const excelImportInput = document.getElementById('excelImportInput');
    if (excelImportInput) {
        excelImportInput.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            try {
                const mod = await import('./excel-import.js');
                await mod.handleExcelImport(file);
            } catch (err) {
                console.error('Excel 読み込みモジュールの読み込みに失敗:', err);
                alert('Excel 読み込み機能の読み込みに失敗しました');
            }
            event.target.value = '';
        });
    }
```

- [ ] **Step 4: storage.js の Excel 分岐を整理**

`js/storage.js` の `handleFileImport` 内 660-669 行を以下に置き換え（バックアップ復元から Excel を切り離す）：

```javascript
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        alert('Excel ファイルは「設定」タブの「📂 Excel ファイルを読み込んで追加」から取り込んでください。\n（バックアップ復元は JSON ファイル専用です）');
    } else {
```

- [ ] **Step 5: 空の excel-import.js スケルトンを作成**

`js/excel-import.js` を新規作成：

```javascript
// Excel ファイルから見積・実績を追加読み込みする機能
// 仕様書: docs/superpowers/specs/2026-05-23-excel-append-import-design.md

/**
 * Excel ファイル取り込みのエントリポイント
 * @param {File} file - ユーザーが選択した xlsx/xls ファイル
 */
export async function handleExcelImport(file) {
    alert('Excel 読み込み機能は実装中です（' + file.name + '）');
}

console.log('✅ モジュール excel-import.js loaded');
```

- [ ] **Step 6: ブラウザで動作確認**

1. ローカルサーバー起動: `python3 -m http.server 8000`
2. ブラウザで `http://localhost:8000/` を開いて設定タブへ
3. 「📊 Excel の入出力」セクションが表示され、2 つのボタンが並ぶこと
4. ダウンロードボタン: クリックで xlsx がダウンロード
5. 読み込みボタン: クリックでファイルピッカー → xlsx 選択 → アラート「Excel 読み込み機能は実装中です（…）」

- [ ] **Step 7: Commit**

```bash
git add index.html js/events.js js/storage.js js/excel-import.js
git commit -m "feat(excel-import): 追加読み込みボタンと専用 fileInput を導入"
```

---

## Task 2: ワークブックパーサー + ヘッダ正規化

**Files:**
- Modify: `js/excel-import.js`

**目的:** Excel ファイルを読み込み、シート名とヘッダ列から `estimateRows` / `actualRows` / `invalidRows` / `errors` を返す純関数を実装する。

- [ ] **Step 1: 定数とヘッダ正規化マップを追加**

`js/excel-import.js` の `handleExcelImport` の前に以下を追加：

```javascript
const SHEET_ALIASES = {
    estimate: ['見積', '見積シート', 'estimate', 'estimates'],
    actual: ['実績', '実績シート', 'actual', 'actuals']
};

// キー: 内部標準名、値: 同義語の配列（小文字化して比較）
const HEADER_ALIASES = {
    version: ['版数', 'バージョン', 'version', 'ver'],
    task: ['対応名', 'タスク', 'task', '案件名'],
    process: ['工程', 'プロセス', 'process'],
    member: ['担当', '担当者', '担当者名', 'メンバー', 'member', 'assignee'],
    hours_estimate: ['見積工数(h)', '見積工数', '工数(h)', '工数', 'hours', 'h'],
    hours_actual: ['工数(h)', '工数', 'hours', 'h', '実績工数(h)', '実績工数'],
    workMonth: ['作業月', '対象月', 'workmonth', 'workMonths'],
    date: ['日付', 'date', '実績日']
};

const ESTIMATE_REQUIRED = ['version', 'task', 'process', 'member', 'hours_estimate'];
const ESTIMATE_OPTIONAL = ['workMonth'];
const ACTUAL_REQUIRED = ['date', 'version', 'task', 'process', 'member', 'hours_actual'];

function normalizeHeader(raw) {
    if (raw == null) return '';
    return String(raw).trim().toLowerCase().replace(/\s+/g, '');
}

function findHeaderIndex(headers, targetKey) {
    const aliases = (HEADER_ALIASES[targetKey] || []).map(normalizeHeader);
    for (let i = 0; i < headers.length; i++) {
        const h = normalizeHeader(headers[i]);
        if (aliases.includes(h)) return i;
    }
    return -1;
}

function findSheetByAlias(workbook, key) {
    const aliases = SHEET_ALIASES[key].map(normalizeHeader);
    for (const sheetName of workbook.SheetNames) {
        if (aliases.includes(normalizeHeader(sheetName))) {
            return workbook.Sheets[sheetName];
        }
    }
    return null;
}

function parseWorkMonths(value) {
    if (value == null || value === '') return [];
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function normalizeDate(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const s = String(value).trim();
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (!m) return '';
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}
```

- [ ] **Step 2: 行抽出関数を追加**

```javascript
function extractEstimateRows(sheet, XLSX) {
    if (!sheet) return { rows: [], invalid: [], error: null };

    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (aoa.length === 0) return { rows: [], invalid: [], error: null };

    const headers = aoa[0];
    const colMap = {};
    for (const key of [...ESTIMATE_REQUIRED, ...ESTIMATE_OPTIONAL]) {
        colMap[key] = findHeaderIndex(headers, key);
    }

    const missing = ESTIMATE_REQUIRED.filter(k => colMap[k] === -1);
    if (missing.length > 0) {
        const jp = { version: '版数', task: '対応名', process: '工程', member: '担当', hours_estimate: '見積工数' };
        return {
            rows: [], invalid: [],
            error: `見積シートの必須列が不足しています: ${missing.map(k => `「${jp[k]}」`).join(', ')}`
        };
    }

    const rows = [];
    const invalid = [];
    for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || r.every(c => c === '' || c == null)) continue;

        const row = {
            version: String(r[colMap.version] ?? '').trim(),
            task: String(r[colMap.task] ?? '').trim(),
            process: String(r[colMap.process] ?? '').trim(),
            member: String(r[colMap.member] ?? '').trim(),
            hours: Number(r[colMap.hours_estimate]),
            workMonths: parseWorkMonths(colMap.workMonth >= 0 ? r[colMap.workMonth] : ''),
            _rowNum: i + 1
        };

        const problems = [];
        if (!row.version) problems.push('版数が空');
        if (!row.task) problems.push('対応名が空');
        if (!row.process) problems.push('工程が空');
        if (!row.member) problems.push('担当が空');
        if (!Number.isFinite(row.hours)) problems.push('見積工数が数値でない');

        if (problems.length > 0) {
            invalid.push({ rowNum: row._rowNum, reason: problems.join(' / ') });
        } else {
            rows.push(row);
        }
    }
    return { rows, invalid, error: null };
}

function extractActualRows(sheet, XLSX) {
    if (!sheet) return { rows: [], invalid: [], error: null };

    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    if (aoa.length === 0) return { rows: [], invalid: [], error: null };

    const headers = aoa[0];
    const colMap = {};
    for (const key of ACTUAL_REQUIRED) {
        colMap[key] = findHeaderIndex(headers, key);
    }

    const missing = ACTUAL_REQUIRED.filter(k => colMap[k] === -1);
    if (missing.length > 0) {
        const jp = { date: '日付', version: '版数', task: '対応名', process: '工程', member: '担当', hours_actual: '工数' };
        return {
            rows: [], invalid: [],
            error: `実績シートの必須列が不足しています: ${missing.map(k => `「${jp[k]}」`).join(', ')}`
        };
    }

    const rows = [];
    const invalid = [];
    for (let i = 1; i < aoa.length; i++) {
        const r = aoa[i];
        if (!r || r.every(c => c === '' || c == null)) continue;

        const row = {
            date: normalizeDate(r[colMap.date]),
            version: String(r[colMap.version] ?? '').trim(),
            task: String(r[colMap.task] ?? '').trim(),
            process: String(r[colMap.process] ?? '').trim(),
            member: String(r[colMap.member] ?? '').trim(),
            hours: Number(r[colMap.hours_actual]),
            _rowNum: i + 1
        };

        const problems = [];
        if (!row.date) problems.push('日付が不正');
        if (!row.member) problems.push('担当が空');
        if (!row.task) problems.push('対応名が空');
        if (!row.process) problems.push('工程が空');
        if (!Number.isFinite(row.hours)) problems.push('工数が数値でない');

        if (problems.length > 0) {
            invalid.push({ rowNum: row._rowNum, reason: problems.join(' / ') });
        } else {
            rows.push(row);
        }
    }
    return { rows, invalid, error: null };
}
```

- [ ] **Step 3: parseWorkbook を追加**

```javascript
async function parseWorkbook(file) {
    const XLSX = await import('../lib/xlsx.mjs');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

    const errors = [];
    const estimateSheet = findSheetByAlias(wb, 'estimate');
    const actualSheet = findSheetByAlias(wb, 'actual');

    if (!estimateSheet && !actualSheet) {
        errors.push('「見積」または「実績」という名前のシートが見つかりません');
        return { estimateRows: [], estimateInvalid: [], actualRows: [], actualInvalid: [], errors };
    }

    const est = extractEstimateRows(estimateSheet, XLSX);
    const act = extractActualRows(actualSheet, XLSX);
    if (est.error) errors.push(est.error);
    if (act.error) errors.push(act.error);

    return {
        estimateRows: est.rows,
        estimateInvalid: est.invalid,
        actualRows: act.rows,
        actualInvalid: act.invalid,
        errors
    };
}
```

- [ ] **Step 4: handleExcelImport を更新してパース結果をログ出力**

```javascript
export async function handleExcelImport(file) {
    try {
        const result = await parseWorkbook(file);
        console.log('parseWorkbook result:', result);
        const msg = [
            `見積行: ${result.estimateRows.length} 件（無効 ${result.estimateInvalid.length}）`,
            `実績行: ${result.actualRows.length} 件（無効 ${result.actualInvalid.length}）`,
            result.errors.length > 0 ? `エラー: ${result.errors.join(' / ')}` : ''
        ].filter(Boolean).join('\n');
        alert(msg);
    } catch (err) {
        console.error('Excel パースエラー:', err);
        alert('Excel ファイルの読み込みに失敗しました: ' + err.message);
    }
}
```

- [ ] **Step 5: ブラウザで動作確認**

1. 「ダウンロード」で xlsx 作成 → 「読み込んで追加」で同ファイル選択
2. アラート: `見積行: N 件（無効 0）` `実績行: M 件（無効 0）`
3. DevTools コンソールで `parseWorkbook result:` の構造を確認

- [ ] **Step 6: 異常系を手動確認**

1. Excel の見積シートで「担当」列ヘッダを「メンバー」にリネーム → 取り込み → 正常（揺れ吸収）
2. Excel で「担当」列を完全に削除 → 取り込み → アラート「見積シートの必須列が不足しています: 「担当」」
3. Excel で「実績」シートを削除 → 取り込み → 実績行 0 で正常

- [ ] **Step 7: Commit**

```bash
git add js/excel-import.js
git commit -m "feat(excel-import): xlsx パースとヘッダ正規化を実装"
```

---

## Task 3: 競合検出ロジック

**Files:**
- Modify: `js/excel-import.js`

- [ ] **Step 1: 競合検出関数を追加**

`parseWorkbook` の直後に追加：

```javascript
/**
 * 見積の競合を検出: (version, task, process, member) 一致
 * @returns {{ newRows, conflicts: [{ existing, incoming }] }}
 */
function detectEstimateConflicts(rows, existing) {
    const newRows = [];
    const conflicts = [];
    for (const incoming of rows) {
        const match = existing.find(e =>
            e.version === incoming.version &&
            e.task === incoming.task &&
            e.process === incoming.process &&
            e.member === incoming.member
        );
        if (match) conflicts.push({ existing: match, incoming });
        else newRows.push(incoming);
    }
    return { newRows, conflicts };
}

/**
 * 実績の重複検出: (date, member, version, task, process, hours) の完全一致のみ
 * @returns {{ newRows, duplicates: [{ existing, incoming }] }}
 */
function detectActualConflicts(rows, existing) {
    const newRows = [];
    const duplicates = [];
    for (const incoming of rows) {
        const exact = existing.find(a =>
            a.date === incoming.date &&
            a.member === incoming.member &&
            a.version === incoming.version &&
            a.task === incoming.task &&
            a.process === incoming.process &&
            Number(a.hours) === Number(incoming.hours)
        );
        if (exact) duplicates.push({ existing: exact, incoming });
        else newRows.push(incoming);
    }
    return { newRows, duplicates };
}
```

- [ ] **Step 2: state.js から estimates / actuals を import**

`js/excel-import.js` の冒頭（コメントの直後）に追加：

```javascript
import { estimates, actuals } from './state.js';
```

- [ ] **Step 3: handleExcelImport を更新**

```javascript
export async function handleExcelImport(file) {
    try {
        const result = await parseWorkbook(file);
        if (result.errors.length > 0 && result.estimateRows.length === 0 && result.actualRows.length === 0) {
            alert('Excel ファイルを確認してください\n\n' + result.errors.join('\n'));
            return;
        }
        const estConflict = detectEstimateConflicts(result.estimateRows, estimates);
        const actConflict = detectActualConflicts(result.actualRows, actuals);
        console.log('estimate conflicts:', estConflict);
        console.log('actual conflicts:', actConflict);
        alert([
            `見積: 追加 ${estConflict.newRows.length} / 競合 ${estConflict.conflicts.length} / 無効 ${result.estimateInvalid.length}`,
            `実績: 追加 ${actConflict.newRows.length} / 重複スキップ ${actConflict.duplicates.length} / 無効 ${result.actualInvalid.length}`
        ].join('\n'));
    } catch (err) {
        console.error('Excel パースエラー:', err);
        alert('Excel ファイルの読み込みに失敗しました: ' + err.message);
    }
}
```

- [ ] **Step 4: ブラウザで動作確認**

1. ダウンロード → 同 xlsx を取り込み → 「見積: 追加 0 / 競合 N / 無効 0」「実績: 追加 0 / 重複スキップ M / 無効 0」
2. Excel で見積 1 行の `見積工数` を変える → 取り込み → コンソールで `estimate conflicts.conflicts[0]` の existing.hours と incoming.hours が違うこと確認

- [ ] **Step 5: Commit**

```bash
git add js/excel-import.js
git commit -m "feat(excel-import): 見積・実績の競合検出を実装"
```

---

## Task 4: プレビューモーダルの静的 DOM + CSS

**Files:**
- Modify: `index.html`（既存モーダル群の末尾に追加）
- Modify: `style.css`（モーダル用スタイル追記）

**目的:** モックアップ案 D の静的シェルを HTML として持ち込む。動的部分（行カード等）は次タスクで JavaScript の DOM 構築で追加する。

- [ ] **Step 1: index.html にプレビューモーダル DOM を追加**

`index.html` の最後のモーダルの直後（おおむね 2700 行以降）に以下を追加：

```html
    <!-- Excel 追加読み込み プレビューモーダル -->
    <div id="excelImportPreviewModal" class="modal excel-import-modal">
        <div class="modal-content excel-import-modal-content">
            <div class="modal-header excel-import-header">
                <div class="excel-import-header-icon">📥</div>
                <div class="excel-import-header-body">
                    <h3 class="excel-import-title">取り込み内容の確認</h3>
                    <div class="excel-import-subtitle">
                        取り込み元
                        <span class="excel-import-filename" id="excelImportFileName"></span>
                    </div>
                </div>
                <button class="modal-close" id="btnCloseExcelImportPreview">&times;</button>
            </div>

            <div class="modal-body excel-import-body">
                <div class="excel-import-big-summary" id="excelImportSummary">
                    <div class="excel-import-stat" data-kind="total">
                        <div class="excel-import-stat-label">反映予定</div>
                        <div class="excel-import-stat-value" data-field="total">0</div>
                        <div class="excel-import-stat-detail" data-field="totalDetail">—</div>
                    </div>
                    <div class="excel-import-stat" data-kind="add">
                        <div class="excel-import-stat-label">追加</div>
                        <div class="excel-import-stat-value" data-field="add">0</div>
                        <div class="excel-import-stat-detail" data-field="addDetail">—</div>
                    </div>
                    <div class="excel-import-stat" data-kind="overwrite">
                        <div class="excel-import-stat-label">上書き</div>
                        <div class="excel-import-stat-value" data-field="overwrite">0</div>
                        <div class="excel-import-stat-detail">既存を更新</div>
                    </div>
                    <div class="excel-import-stat" data-kind="skip">
                        <div class="excel-import-stat-label">スキップ</div>
                        <div class="excel-import-stat-value" data-field="skip">0</div>
                        <div class="excel-import-stat-detail" data-field="skipDetail">—</div>
                    </div>
                </div>

                <div class="excel-import-sheets" id="excelImportSheets"></div>
                <div id="excelImportConflictSection"></div>
                <div id="excelImportWarnings" style="display: none;"></div>
            </div>

            <div class="modal-footer excel-import-footer">
                <div class="excel-import-footer-info">
                    この内容で <strong id="excelImportFooterCount">0</strong> 件を反映します
                </div>
                <div class="excel-import-footer-actions">
                    <button class="btn" id="btnCancelExcelImport">キャンセル</button>
                    <button class="btn btn-primary" id="btnConfirmExcelImport">取り込む</button>
                </div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: style.css にスタイルを追加**

`style.css` の末尾に以下を追加：

```css
/* ============================================
   Excel 追加読み込み プレビューモーダル
   ============================================ */
.excel-import-modal-content {
    max-width: 920px; width: 95%; max-height: 92vh;
    display: flex; flex-direction: column;
}
.excel-import-header {
    display: flex; align-items: flex-start; gap: 16px;
    padding: 22px 28px 18px;
}
.excel-import-header-icon {
    width: 40px; height: 40px; border-radius: var(--radius-md);
    background: var(--accent-light); color: var(--accent);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; flex-shrink: 0;
}
.excel-import-header-body { flex: 1; min-width: 0; }
.excel-import-title { font-size: 18px; font-weight: 700; letter-spacing: -0.015em; margin: 0 0 4px; }
.excel-import-subtitle { font-size: 13px; color: var(--text-secondary); }
.excel-import-filename {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px; background: var(--surface-elevated);
    padding: 2px 8px; border-radius: var(--radius-xs); margin-left: 4px;
}
.excel-import-body { padding: 22px 28px; overflow-y: auto; flex: 1; }

.excel-import-big-summary {
    background: linear-gradient(135deg, var(--accent-light), rgba(235,245,234,0.4));
    border: 1px solid rgba(45,90,39,0.18); border-radius: var(--radius-lg);
    padding: 18px 22px; margin-bottom: 22px;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
}
.excel-import-stat { padding: 0 14px; border-right: 1px solid rgba(45,90,39,0.12); }
.excel-import-stat:last-child { border-right: none; }
.excel-import-stat:first-child { padding-left: 0; }
.excel-import-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); font-weight: 700; }
.excel-import-stat-value { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; margin: 4px 0 2px; font-variant-numeric: tabular-nums; }
.excel-import-stat-detail { font-size: 11.5px; color: var(--text-secondary); }
.excel-import-stat[data-kind="add"] .excel-import-stat-value { color: var(--accent); }
.excel-import-stat[data-kind="overwrite"] .excel-import-stat-value { color: #8A5A0F; }
.excel-import-stat[data-kind="skip"] .excel-import-stat-value { color: var(--text-secondary); }
.excel-import-stat[data-kind="total"] .excel-import-stat-value { color: var(--text-primary); }

.excel-import-sheets { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 22px; }
.excel-import-sheet-chip {
    flex: 1 1 220px; background: var(--surface-elevated);
    border: 1px solid var(--border); border-radius: var(--radius-md);
    padding: 12px 14px; display: flex; align-items: center; gap: 12px;
    cursor: pointer; transition: var(--transition);
}
.excel-import-sheet-chip:hover { background: var(--bg); }
.excel-import-sheet-chip.disabled { opacity: 0.45; }
.excel-import-sheet-chip input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
.excel-import-sheet-chip-icon {
    width: 28px; height: 28px; border-radius: var(--radius-sm);
    background: var(--surface);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.excel-import-sheet-chip-body { flex: 1; min-width: 0; }
.excel-import-sheet-chip-name { font-size: 12px; color: var(--text-muted); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.excel-import-sheet-chip-counts { font-size: 14px; font-weight: 600; margin-top: 2px; display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; }
.excel-import-tag-add { color: var(--accent); font-weight: 700; }
.excel-import-tag-conflict { color: #8A5A0F; font-weight: 700; }
.excel-import-tag-skip { color: var(--text-muted); font-weight: 600; }

.excel-import-section-title {
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text-secondary);
    margin: 4px 0 12px;
}
.excel-import-section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

.excel-import-bulk-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 12px 14px; background: #FFF8ED;
    border: 1px solid rgba(196,132,29,0.25); border-radius: var(--radius-md);
    margin-bottom: 14px;
}
.excel-import-bulk-label { font-size: 13px; color: #8A5A0F; font-weight: 600; }

.excel-import-choice-group {
    display: inline-flex; background: var(--surface-elevated);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    padding: 3px; gap: 2px;
}
.excel-import-choice-group input { position: absolute; opacity: 0; pointer-events: none; }
.excel-import-choice-group label {
    font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 4px;
    cursor: pointer; color: var(--text-secondary); transition: var(--transition);
    user-select: none; line-height: 1;
}
.excel-import-choice-group label:hover { color: var(--text-primary); }
.excel-import-choice-group input:checked + label { background: var(--surface); color: var(--text-primary); box-shadow: var(--shadow-sm); }
.excel-import-choice-group input:checked + label.is-overwrite { color: #8A5A0F; }
.excel-import-choice-group input:checked + label.is-skip { color: var(--text-muted); }

.excel-import-compare-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-md); overflow: hidden;
    margin-bottom: 12px; transition: var(--transition);
}
.excel-import-compare-card[data-state="skip"] { background: var(--surface-elevated); opacity: 0.72; }
.excel-import-compare-card[data-state="overwrite"] { border-color: rgba(196,132,29,0.4); }
.excel-import-compare-header {
    padding: 12px 16px; display: flex; align-items: center; gap: 12px;
    border-bottom: 1px solid var(--border-light); background: var(--surface-elevated);
}
.excel-import-compare-body { display: grid; grid-template-columns: 1fr 24px 1fr; }
.excel-import-compare-side { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.excel-import-compare-side.existing { background: var(--surface); }
.excel-import-compare-side.incoming { background: rgba(196,132,29,0.04); }
.excel-import-compare-side-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 4px; }
.excel-import-compare-side.existing .excel-import-compare-side-label { color: var(--text-muted); }
.excel-import-compare-side.incoming .excel-import-compare-side-label { color: #8A5A0F; }
.excel-import-compare-arrow {
    display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); font-size: 14px; background: var(--surface-elevated);
    border-left: 1px solid var(--border-light); border-right: 1px solid var(--border-light);
}

.excel-import-row-id { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; flex: 1; }
.excel-import-row-id .version {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px; font-weight: 600; background: var(--accent-light);
    color: var(--accent); padding: 2px 8px; border-radius: var(--radius-xs);
}
.excel-import-row-id .task { font-weight: 600; }
.excel-import-row-id .process { color: var(--text-secondary); font-size: 12px; padding: 1px 6px; border: 1px solid var(--border); border-radius: var(--radius-xs); }
.excel-import-row-id .member { color: var(--text-secondary); font-size: 12.5px; }
.excel-import-row-id .member::before { content: '@ '; color: var(--text-muted); }

.excel-import-field-row { display: flex; align-items: baseline; gap: 8px; }
.excel-import-field-row .name { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; min-width: 56px; }
.excel-import-field-row .val { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.excel-import-field-row.changed .val { color: #8A5A0F; font-weight: 600; }
.excel-import-field-row.changed .name { color: #8A5A0F; }

.excel-import-warning {
    display: flex; gap: 12px; padding: 14px 16px;
    background: #FFF4DC; border: 1px solid rgba(196,132,29,0.3);
    border-radius: var(--radius-md); margin: 14px 0; font-size: 13px;
}
.excel-import-warning-title { font-weight: 700; color: #8A5A0F; margin-bottom: 4px; }
.excel-import-warning-list { margin: 6px 0 0; padding-left: 18px; color: var(--text-primary); font-size: 12.5px; }

.excel-import-footer {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 16px 28px; border-top: 1px solid var(--border); background: var(--surface-elevated);
}
.excel-import-footer-info { font-size: 13px; color: var(--text-secondary); }
.excel-import-footer-info strong { color: var(--text-primary); font-weight: 700; }
.excel-import-footer-actions { display: flex; gap: 10px; }
```

- [ ] **Step 3: ブラウザで DOM 確認**

1. ブラウザ再読み込み
2. DevTools コンソールで `document.getElementById('excelImportPreviewModal').style.display = 'flex'`
3. モーダルが表示され、ヘッダ・空サマリ・フッターが正しく見えること
4. `... .style.display = 'none'` で閉じる

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat(excel-import): プレビューモーダルの静的 DOM とスタイルを追加"
```

---

## Task 5: プレビューモーダルのレンダリング（DOM 構築ヘルパー使用）

**Files:**
- Modify: `js/excel-import.js`

**目的:** パース＋競合検出結果からモーダル内容を組み立てる。すべての動的コンテンツは `createElement` + `textContent` で構築し、XSS リスクを排除する。

- [ ] **Step 1: DOM 構築ヘルパー `el()` を追加**

`js/excel-import.js` の `import` 文の直後に追加：

```javascript
// プレビュー中の状態（モーダルが閉じられたらクリア）
let previewState = null;

/**
 * 軽量 DOM 構築ヘルパー。
 * - `attrs.class` はクラス名、`data-*` は data 属性、それ以外はプロパティ
 * - text プロパティを指定すると textContent を設定（安全に文字列を入れる用）
 * - children は配列で子ノードを渡す（null は無視）
 */
function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('data-') || k.startsWith('aria-')) e.setAttribute(k, v);
        else e[k] = v;
    }
    for (const c of children) {
        if (c == null) continue;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
}

/** 子要素群を空にして新規ノードで置き換える（textContent でクリア） */
function replaceChildren(parent, ...nodes) {
    parent.textContent = '';
    for (const n of nodes) if (n != null) parent.appendChild(n);
}
```

- [ ] **Step 2: 行 ID ・ サイド ・ 比較カードのレンダラを追加**

`detectActualConflicts` の直後に追加：

```javascript
function buildRowIdentity(row) {
    return el('div', { class: 'excel-import-row-id' }, [
        el('span', { class: 'version', text: row.version }),
        el('span', { class: 'task', text: row.task }),
        el('span', { class: 'process', text: row.process }),
        el('span', { class: 'member', text: row.member })
    ]);
}

function buildCompareSide(label, hours, workMonths, sideClass, hoursChanged, monthsChanged) {
    const monthsStr = Array.isArray(workMonths) ? workMonths.join(', ') : (workMonths || '');
    return el('div', { class: `excel-import-compare-side ${sideClass}` }, [
        el('div', { class: 'excel-import-compare-side-label', text: label }),
        el('div', { class: `excel-import-field-row ${hoursChanged ? 'changed' : ''}` }, [
            el('span', { class: 'name', text: '工数' }),
            el('span', { class: 'val', text: `${hours} h` })
        ]),
        el('div', { class: `excel-import-field-row ${monthsChanged ? 'changed' : ''}` }, [
            el('span', { class: 'name', text: '作業月' }),
            el('span', { class: 'val', text: monthsStr || '—' })
        ])
    ]);
}

function buildConflictCard(conflict, index, defaultDecision) {
    const { existing, incoming } = conflict;
    const hoursChanged = Number(existing.hours) !== Number(incoming.hours);
    const existingMonths = (existing.workMonths || (existing.workMonth ? [existing.workMonth] : []));
    const incomingMonths = incoming.workMonths || [];
    const monthsChanged = existingMonths.join(',') !== incomingMonths.join(',');
    const decision = defaultDecision || 'overwrite';

    const card = el('div', {
        class: 'excel-import-compare-card',
        'data-state': decision,
        'data-index': String(index)
    }, [
        el('div', { class: 'excel-import-compare-header' }, [
            buildRowIdentity(incoming),
            buildChoiceGroup(`excelConflict_${index}`, decision, [
                { value: 'overwrite', label: '上書き', className: 'is-overwrite' },
                { value: 'skip', label: 'スキップ', className: 'is-skip' }
            ])
        ]),
        el('div', { class: 'excel-import-compare-body' }, [
            buildCompareSide('既存', existing.hours, existingMonths, 'existing', hoursChanged, monthsChanged),
            el('div', { class: 'excel-import-compare-arrow', text: '→' }),
            buildCompareSide('読み込み', incoming.hours, incomingMonths, 'incoming', hoursChanged, monthsChanged)
        ])
    ]);
    return card;
}

function buildChoiceGroup(name, currentValue, options) {
    const group = el('div', { class: 'excel-import-choice-group' });
    for (const opt of options) {
        const id = `${name}_${opt.value}`;
        const input = el('input', { type: 'radio', name, id, value: opt.value });
        if (currentValue === opt.value) input.checked = true;
        const label = el('label', { htmlFor: id, class: opt.className || '', text: opt.label });
        group.appendChild(input);
        group.appendChild(label);
    }
    return group;
}
```

- [ ] **Step 3: シートチップ・警告のレンダラを追加**

```javascript
function buildSheetChip(kind, name, icon, newCount, conflictOrDupCount, invalidCount, conflictLabel) {
    const checkbox = el('input', { type: 'checkbox', 'data-sheet-checkbox': kind });
    checkbox.checked = true;

    const counts = el('div', { class: 'excel-import-sheet-chip-counts' }, [
        el('span', { class: 'excel-import-tag-add', text: `+${newCount} 追加` })
    ]);
    if (conflictOrDupCount > 0) {
        const cls = kind === 'estimate' ? 'excel-import-tag-conflict' : 'excel-import-tag-skip';
        counts.appendChild(el('span', { class: cls, text: `${conflictLabel} ${conflictOrDupCount} 件` }));
    }
    if (invalidCount > 0) {
        counts.appendChild(el('span', { class: 'excel-import-tag-skip', text: `⚠ 無効 ${invalidCount} 件` }));
    }

    return el('label', { class: 'excel-import-sheet-chip', 'data-sheet': kind }, [
        checkbox,
        el('div', { class: 'excel-import-sheet-chip-icon', text: icon }),
        el('div', { class: 'excel-import-sheet-chip-body' }, [
            el('div', { class: 'excel-import-sheet-chip-name', text: name }),
            counts
        ])
    ]);
}

function buildWarnings() {
    if (!previewState) return null;
    const blocks = [];

    if (previewState.parseErrors.length > 0) {
        const ul = el('ul', { class: 'excel-import-warning-list' });
        for (const e of previewState.parseErrors) ul.appendChild(el('li', { text: e }));
        blocks.push(el('div', {}, [
            el('div', { class: 'excel-import-warning-title', text: 'パースに関する警告' }),
            ul
        ]));
    }

    const buildInvalidList = (label, invalids) => {
        if (invalids.length === 0) return null;
        const ul = el('ul', { class: 'excel-import-warning-list' });
        for (const inv of invalids.slice(0, 5)) {
            ul.appendChild(el('li', { text: `${inv.rowNum} 行目: ${inv.reason}` }));
        }
        if (invalids.length > 5) ul.appendChild(el('li', { text: `ほか ${invalids.length - 5} 件` }));
        return el('div', {}, [
            el('div', { class: 'excel-import-warning-title', text: `${label}: 取り込めない行が ${invalids.length} 件あります` }),
            ul
        ]);
    };
    const est = buildInvalidList('見積シート', previewState.estimateInvalid);
    const act = buildInvalidList('実績シート', previewState.actualInvalid);
    if (est) blocks.push(est);
    if (act) blocks.push(act);

    if (blocks.length === 0) return null;
    return el('div', { class: 'excel-import-warning' }, [
        el('div', { text: '⚠' }),
        el('div', { class: 'excel-import-warning-body' }, blocks)
    ]);
}

function buildConflictSection() {
    if (!previewState || previewState.estimateConflicts.length === 0 || !previewState.sheets.estimate) {
        return null;
    }
    const wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { class: 'excel-import-section-title', text: `見積シート: 競合 ${previewState.estimateConflicts.length} 件の処理を選択` }));

    const bulkBar = el('div', { class: 'excel-import-bulk-bar' }, [
        el('div', { class: 'excel-import-bulk-label', text: '⚡ 一括設定' }),
        buildChoiceGroup('excelBulk', previewState.bulkMode, [
            { value: 'overwrite', label: '全て上書き', className: 'is-overwrite' },
            { value: 'skip', label: '全てスキップ', className: 'is-skip' },
            { value: 'individual', label: '個別判断' }
        ])
    ]);
    wrap.appendChild(bulkBar);

    for (let i = 0; i < previewState.estimateConflicts.length; i++) {
        wrap.appendChild(buildConflictCard(previewState.estimateConflicts[i], i, previewState.decisions[i]));
    }
    return wrap;
}
```

- [ ] **Step 4: サマリ計算と表示更新**

```javascript
function computeSummary() {
    if (!previewState) return { total: 0, add: 0, overwrite: 0, skip: 0, addDetail: '', skipDetail: '', totalDetail: '' };
    const estOn = previewState.sheets.estimate;
    const actOn = previewState.sheets.actual;
    const estNew = estOn ? previewState.estimateNew.length : 0;
    const actNew = actOn ? previewState.actualNew.length : 0;
    let overwrite = 0, conflictSkip = 0;
    if (estOn) {
        for (const d of previewState.decisions) {
            if (d === 'overwrite') overwrite++; else conflictSkip++;
        }
    }
    const dupSkip = actOn ? previewState.actualDuplicates.length : 0;
    const add = estNew + actNew;
    const total = add + overwrite;
    const skip = conflictSkip + dupSkip;
    return {
        total, add, overwrite, skip,
        addDetail: `見積 +${estNew} ・ 実績 +${actNew}`,
        skipDetail: `競合 ${conflictSkip} ・ 完全重複 ${dupSkip}`,
        totalDetail: `見積 ${estOn ? estNew + overwrite : 0} ・ 実績 ${actNew}`
    };
}

function refreshSummaryUI() {
    const s = computeSummary();
    const summary = document.getElementById('excelImportSummary');
    if (!summary) return;
    summary.querySelector('[data-field="total"]').textContent = s.total;
    summary.querySelector('[data-field="add"]').textContent = s.add;
    summary.querySelector('[data-field="overwrite"]').textContent = s.overwrite;
    summary.querySelector('[data-field="skip"]').textContent = s.skip;
    summary.querySelector('[data-field="addDetail"]').textContent = s.addDetail;
    summary.querySelector('[data-field="skipDetail"]').textContent = s.skipDetail;
    summary.querySelector('[data-field="totalDetail"]').textContent = s.totalDetail;
    const footerCount = document.getElementById('excelImportFooterCount');
    if (footerCount) footerCount.textContent = s.total;
    const confirmBtn = document.getElementById('btnConfirmExcelImport');
    if (confirmBtn) {
        confirmBtn.textContent = `取り込む（${s.total}件）`;
        confirmBtn.disabled = s.total === 0;
    }
}
```

- [ ] **Step 5: モーダルを開く / 閉じる関数を追加**

```javascript
function openPreviewModal(fileName, parseResult) {
    const estConflict = detectEstimateConflicts(parseResult.estimateRows, estimates);
    const actConflict = detectActualConflicts(parseResult.actualRows, actuals);

    previewState = {
        fileName,
        estimateNew: estConflict.newRows,
        estimateConflicts: estConflict.conflicts,
        actualNew: actConflict.newRows,
        actualDuplicates: actConflict.duplicates,
        estimateInvalid: parseResult.estimateInvalid,
        actualInvalid: parseResult.actualInvalid,
        parseErrors: parseResult.errors,
        sheets: {
            estimate: parseResult.estimateRows.length > 0 || parseResult.estimateInvalid.length > 0,
            actual: parseResult.actualRows.length > 0 || parseResult.actualInvalid.length > 0
        },
        bulkMode: 'overwrite',
        decisions: estConflict.conflicts.map(() => 'overwrite')
    };

    document.getElementById('excelImportFileName').textContent = fileName;

    // シートチップを構築
    const sheetsEl = document.getElementById('excelImportSheets');
    sheetsEl.textContent = '';
    if (previewState.sheets.estimate) {
        sheetsEl.appendChild(buildSheetChip('estimate', '見積シート', '📋', estConflict.newRows.length, estConflict.conflicts.length, parseResult.estimateInvalid.length, '⚠ 競合'));
    }
    if (previewState.sheets.actual) {
        sheetsEl.appendChild(buildSheetChip('actual', '実績シート', '⏱', actConflict.newRows.length, actConflict.duplicates.length, parseResult.actualInvalid.length, '重複スキップ'));
    }

    // 競合プレビュー
    const conflictEl = document.getElementById('excelImportConflictSection');
    conflictEl.textContent = '';
    const conflictFrag = buildConflictSection();
    if (conflictFrag) conflictEl.appendChild(conflictFrag);

    // 警告
    const warnEl = document.getElementById('excelImportWarnings');
    warnEl.textContent = '';
    const warnNode = buildWarnings();
    if (warnNode) {
        warnEl.appendChild(warnNode);
        warnEl.style.display = '';
    } else {
        warnEl.style.display = 'none';
    }

    refreshSummaryUI();
    attachPreviewEventHandlers();
    document.getElementById('excelImportPreviewModal').style.display = 'flex';
}

function closePreviewModal() {
    document.getElementById('excelImportPreviewModal').style.display = 'none';
    previewState = null;
}

function attachPreviewEventHandlers() {
    // 次タスクで実装
}
```

- [ ] **Step 6: handleExcelImport を更新してモーダルを開く**

```javascript
export async function handleExcelImport(file) {
    try {
        const result = await parseWorkbook(file);
        const fatal = result.errors.length > 0 &&
                      result.estimateRows.length === 0 && result.actualRows.length === 0 &&
                      result.estimateInvalid.length === 0 && result.actualInvalid.length === 0;
        if (fatal) {
            alert('Excel ファイルを確認してください\n\n' + result.errors.join('\n'));
            return;
        }
        if (result.estimateRows.length === 0 && result.actualRows.length === 0 &&
            result.estimateInvalid.length === 0 && result.actualInvalid.length === 0) {
            alert('取り込めるデータがありません');
            return;
        }
        openPreviewModal(file.name, result);
    } catch (err) {
        console.error('Excel パースエラー:', err);
        alert('Excel ファイルの読み込みに失敗しました: ' + err.message);
    }
}
```

- [ ] **Step 7: ブラウザで動作確認**

1. xlsx をダウンロード → 「読み込んで追加」
2. プレビューモーダルが開き、サマリ・シートチップ 2 つ・競合カード群が表示される
3. ヘッダにファイル名が表示
4. `hours` が違う行で changed クラス（アンバー強調）が見えること
5. コンソールから `document.getElementById('excelImportPreviewModal').style.display = 'none'` で閉じる（次タスクで閉じるボタン対応）

- [ ] **Step 8: Commit**

```bash
git add js/excel-import.js
git commit -m "feat(excel-import): プレビューモーダルの DOM レンダリングを実装"
```

---

## Task 6: モーダルのインタラクション（一括/個別/シートトグル/Esc/閉じる）

**Files:**
- Modify: `js/excel-import.js`

- [ ] **Step 1: attachPreviewEventHandlers を実装**

`attachPreviewEventHandlers` の中身を以下に置き換え：

```javascript
function attachPreviewEventHandlers() {
    const modal = document.getElementById('excelImportPreviewModal');

    // 閉じるボタン
    const closeBtn = document.getElementById('btnCloseExcelImportPreview');
    if (closeBtn) closeBtn.onclick = closePreviewModal;
    const cancelBtn = document.getElementById('btnCancelExcelImport');
    if (cancelBtn) cancelBtn.onclick = closePreviewModal;

    // Esc で閉じる
    modal.onkeydown = (e) => { if (e.key === 'Escape') closePreviewModal(); };

    // 一括トグル
    modal.querySelectorAll('input[name="excelBulk"]').forEach(input => {
        input.onchange = (e) => {
            previewState.bulkMode = e.target.value;
            if (e.target.value !== 'individual') {
                for (let i = 0; i < previewState.decisions.length; i++) {
                    previewState.decisions[i] = e.target.value;
                }
                modal.querySelectorAll('.excel-import-compare-card').forEach(card => {
                    const idx = Number(card.dataset.index);
                    card.dataset.state = previewState.decisions[idx];
                    const rb = card.querySelector(`input[value="${previewState.decisions[idx]}"]`);
                    if (rb) rb.checked = true;
                });
            }
            refreshSummaryUI();
        };
    });

    // 個別トグル
    modal.querySelectorAll('.excel-import-compare-card').forEach(card => {
        const idx = Number(card.dataset.index);
        card.querySelectorAll(`input[name="excelConflict_${idx}"]`).forEach(input => {
            input.onchange = (e) => {
                previewState.decisions[idx] = e.target.value;
                card.dataset.state = e.target.value;
                if (previewState.bulkMode !== 'individual') {
                    previewState.bulkMode = 'individual';
                    const indRb = modal.querySelector('input[name="excelBulk"][value="individual"]');
                    if (indRb) indRb.checked = true;
                }
                refreshSummaryUI();
            };
        });
    });

    // シートチェックボックス
    modal.querySelectorAll('input[data-sheet-checkbox]').forEach(input => {
        input.onchange = (e) => {
            const sheet = e.target.dataset.sheetCheckbox;
            previewState.sheets[sheet] = e.target.checked;
            const chip = e.target.closest('.excel-import-sheet-chip');
            if (chip) chip.classList.toggle('disabled', !e.target.checked);
            const conflictSection = document.getElementById('excelImportConflictSection');
            if (sheet === 'estimate') {
                conflictSection.style.display = e.target.checked ? '' : 'none';
            }
            refreshSummaryUI();
        };
    });

    modal.tabIndex = -1;
    modal.focus();
}
```

- [ ] **Step 2: ブラウザで動作確認**

1. プレビューモーダルを開く
2. 「全てスキップ」 → 全カードがスキップ状態（薄く）に変わる、サマリ更新
3. 「全て上書き」に戻す
4. 1 行だけ「スキップ」に変更 → 一括トグルが自動的に「個別判断」に切替、サマリ更新
5. 見積シートのチェック OFF → 競合セクション非表示、サマリ更新
6. 実績シートのチェック OFF → 追加数が見積分のみに
7. Esc キー / × ボタン / キャンセルボタンで閉じる

- [ ] **Step 3: Commit**

```bash
git add js/excel-import.js
git commit -m "feat(excel-import): モーダルのインタラクションを実装"
```

---

## Task 7: 取り込み確定処理

**Files:**
- Modify: `js/excel-import.js`

- [ ] **Step 1: applyImport / refreshAllViews を追加**

`closePreviewModal` の直後に追加：

```javascript
function applyImport() {
    if (!previewState) return;

    const added = { estimates: [], actuals: [] };
    const overwritten = [];

    // 見積: チェック ON のみ
    if (previewState.sheets.estimate) {
        for (const row of previewState.estimateNew) {
            const newEst = {
                id: Date.now() + Math.random(),
                version: row.version,
                task: row.task,
                process: row.process,
                member: row.member,
                hours: row.hours,
                workMonths: row.workMonths
            };
            estimates.push(newEst);
            added.estimates.push(newEst);
        }
        for (let i = 0; i < previewState.estimateConflicts.length; i++) {
            if (previewState.decisions[i] !== 'overwrite') continue;
            const { existing, incoming } = previewState.estimateConflicts[i];
            const idx = estimates.findIndex(e => e.id === existing.id);
            if (idx === -1) continue;
            const before = { ...estimates[idx] };
            estimates[idx] = {
                ...existing,
                hours: incoming.hours,
                workMonths: incoming.workMonths
            };
            overwritten.push({ before, after: { ...estimates[idx] } });
        }
    }

    // 実績: チェック ON のみ、追加のみ
    if (previewState.sheets.actual) {
        for (const row of previewState.actualNew) {
            const newAct = {
                id: Date.now() + Math.random(),
                date: row.date,
                version: row.version,
                task: row.task,
                process: row.process,
                member: row.member,
                hours: row.hours
            };
            actuals.push(newAct);
            added.actuals.push(newAct);
        }
    }

    // 保存
    if (typeof window.saveData === 'function') window.saveData();

    // history 登録（次タスクで実装される pushExcelImportAction を呼ぶ）
    if (typeof window.pushExcelImportAction === 'function') {
        window.pushExcelImportAction({ added, overwritten });
    }

    const total = added.estimates.length + added.actuals.length + overwritten.length;

    closePreviewModal();
    refreshAllViews();

    if (typeof window.showAlert === 'function') {
        window.showAlert(`${total} 件を取り込みました`, true);
    } else {
        alert(`${total} 件を取り込みました`);
    }
}

function refreshAllViews() {
    const fns = [
        'updateMonthOptions', 'updateEstimateMonthOptions', 'updateEstimateVersionOptions',
        'updateActualMonthOptions', 'updateMemberOptions', 'updateQuickTaskList',
        'renderEstimateList', 'renderActualList', 'renderTodayActuals', 'updateReport',
        'renderScheduleView'
    ];
    for (const name of fns) {
        if (typeof window[name] === 'function') {
            try { window[name](); } catch (e) { /* ignore */ }
        }
    }
}
```

- [ ] **Step 2: 確定ボタンを attachPreviewEventHandlers に追加**

`attachPreviewEventHandlers` の末尾（`modal.focus()` の前）に追加：

```javascript
    const confirmBtn = document.getElementById('btnConfirmExcelImport');
    if (confirmBtn) confirmBtn.onclick = applyImport;
```

- [ ] **Step 3: 暫定の pushExcelImportAction プレースホルダ**

`js/excel-import.js` の末尾（`console.log(...)` の前）に追加：

```javascript
if (!window.pushExcelImportAction) {
    window.pushExcelImportAction = () => {};
}
```

- [ ] **Step 4: ブラウザで動作確認**

1. xlsx ダウンロード（A.xlsx）
2. 見積タブで適当な行を 1 つ削除
3. 「読み込んで追加」で A.xlsx → プレビューに「追加 1 / 上書き N / スキップ 0」
4. 「取り込む」確定 → モーダル閉じ、「N 件を取り込みました」表示
5. 見積タブで削除した行が復活していること
6. 別シナリオ: Excel で見積 1 行の `見積工数` を倍に → 取り込み → 上書き対象に該当行 → 確定 → 見積タブで工数が更新

- [ ] **Step 5: Commit**

```bash
git add js/excel-import.js
git commit -m "feat(excel-import): 取り込み確定処理と view 再描画を実装"
```

---

## Task 8: Undo / Redo 対応

**Files:**
- Modify: `js/history.js`
- Modify: `js/excel-import.js`

- [ ] **Step 1: history.js に excel_import の undo ケースを追加**

`js/history.js` の `applyUndo` 関数内、`// --- スケジュール ---` の直前（235 行付近）に挿入：

```javascript
    // --- Excel 追加読み込み ---
    } else if (t === 'excel_import') {
        const d = action.data;
        if (d.added.estimates && d.added.estimates.length > 0) {
            const ids = new Set(d.added.estimates.map(e => e.id));
            State.estimates = State.estimates.filter(e => !ids.has(e.id));
        }
        if (d.added.actuals && d.added.actuals.length > 0) {
            const ids = new Set(d.added.actuals.map(a => a.id));
            State.setActuals(State.actuals.filter(a => !ids.has(a.id)));
        }
        if (d.overwritten && d.overwritten.length > 0) {
            for (const ov of d.overwritten) {
                const idx = State.estimates.findIndex(e => e.id === ov.before.id);
                if (idx !== -1) State.estimates[idx] = { ...ov.before };
            }
        }
```

- [ ] **Step 2: history.js に excel_import の redo ケースを追加**

`applyRedo` 関数内、`// --- スケジュール ---` の直前（309 行付近）に挿入：

```javascript
    // --- Excel 追加読み込み ---
    } else if (t === 'excel_import') {
        const d = action.data;
        if (d.added.estimates && d.added.estimates.length > 0) {
            State.estimates.push(...d.added.estimates);
        }
        if (d.added.actuals && d.added.actuals.length > 0) {
            State.actuals.push(...d.added.actuals);
        }
        if (d.overwritten && d.overwritten.length > 0) {
            for (const ov of d.overwritten) {
                const idx = State.estimates.findIndex(e => e.id === ov.before.id);
                if (idx !== -1) State.estimates[idx] = { ...ov.after };
            }
        }
```

- [ ] **Step 3: pushExcelImportAction を本実装に置き換え**

`js/excel-import.js` の `import` 文に pushAction を追加：

```javascript
import { pushAction } from './history.js';
```

末尾の暫定プレースホルダブロックを以下に置き換え：

```javascript
window.pushExcelImportAction = function(data) {
    pushAction({
        type: 'excel_import',
        data: {
            added: {
                estimates: data.added.estimates.map(e => ({ ...e })),
                actuals: data.added.actuals.map(a => ({ ...a }))
            },
            overwritten: data.overwritten.map(o => ({
                before: { ...o.before },
                after: { ...o.after }
            }))
        }
    });
};
```

- [ ] **Step 4: ブラウザで動作確認**

1. ページ再読み込み
2. Excel から数件を取り込む（Task 7 と同じ手順）
3. Cmd+Z / Ctrl+Z で undo → 「N 件の変更を元に戻しました」、取り込み内容が全件消えること
4. Cmd+Shift+Z / Ctrl+Y で redo → 取り込み内容が復活
5. 履歴モーダルで `excel_import` タイプのエントリが見えること

- [ ] **Step 5: Commit**

```bash
git add js/history.js js/excel-import.js
git commit -m "feat(excel-import): undo / redo に excel_import タイプを追加"
```

---

## Task 9: エッジケース対応と総合手動テスト

**Files:**
- Manual verification only

問題があれば該当タスクに戻って修正。

- [ ] **Step 1: 自己ラウンドトリップテスト**

1. 現在データを Excel に出力
2. すぐにその Excel を取り込む
3. プレビュー: 見積は全件競合（上書きしても値同じ）、実績は全件重複スキップ
4. 「取り込む」確定 → データ件数が変わらないこと

- [ ] **Step 2: シート選択テスト**

1. Excel を取り込む
2. 実績シートのチェック OFF
3. 「取り込む」確定 → 見積のみ反映、実績は変更なし

- [ ] **Step 3: バリデーションエラーテスト**

1. Excel の見積シートで「担当」列を削除 → 保存
2. 「読み込んで追加」 → アラート「Excel ファイルを確認してください 見積シートの必須列が不足…」
3. モーダルは開かない

- [ ] **Step 4: 部分エラー（無効行）テスト**

1. Excel の実績シートで 1 行だけ工数を `未定` のような文字列に → 保存
2. 取り込み → プレビューモーダルが開き、警告に「実績シート: 取り込めない行が 1 件あります」+ 該当行表示
3. シートチップに「⚠ 無効 1 件」
4. 確定 → 無効行はスキップされて他は取り込まれる

- [ ] **Step 5: 空ファイルテスト**

1. Excel で「見積」「実績」シートをヘッダ行のみで保存
2. 取り込み → アラート「取り込めるデータがありません」

- [ ] **Step 6: シートが無いテスト**

1. Excel で「Sheet1」のみ、適当なデータ → 保存
2. 取り込み → アラート「『見積』または『実績』という名前のシートが見つかりません」

- [ ] **Step 7: undo / redo テスト**

1. 取り込み実行
2. Cmd+Z で undo → 全件元に戻る
3. Cmd+Shift+Z で redo → 全件復活
4. 履歴モーダルで該当エントリ確認

- [ ] **Step 8: 大量データのパフォーマンス確認（任意）**

1. Excel で見積 500 行 / 実績 2000 行程度に増やす
2. 取り込み → パース 〜 モーダル表示が体感 3 秒以内
3. 競合カード多数でも操作がもたつかない

- [ ] **Step 9: 仕上げコミット（あれば）**

```bash
git add -A
git status
git commit -m "feat(excel-import): 総合テストの結果に基づく微修正" || echo "no changes"
```

---

## 完了基準

- 設定タブで「📂 Excel ファイルを読み込んで追加」ボタンが動作する
- 自分自身でエクスポートした Excel を取り込むと、データ件数が変わらない
- 既存と競合する見積行はプレビューで個別に上書き/スキップを選択できる
- 実績の完全重複はスキップ件数として表示され、自動スキップされる
- シートチェックで取り込み対象を絞れる
- 必須列欠落・無効値の Excel を読み込んだ際、メッセージで Excel 確認を促す
- 取り込み確定後に Cmd+Z で全件 undo できる

---

## ロールバック手順

```bash
git log --oneline -10
git revert <commit-hash>   # 個別タスクを取り消す場合
```
