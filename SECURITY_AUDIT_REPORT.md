# セキュリティ監査レポート

**監査日**: 2026-02-18
**対象**: 工数管理システム（manhour-management）
**監査者**: Claude Code（自動監査）

---

## 監査対象の概要

| 項目 | 内容 |
|------|------|
| 技術スタック | 純粋なHTML/CSS/JavaScript（ES Modules） |
| フレームワーク | なし |
| データ保存 | localStorage |
| 外部通信 | なし（fetch/XHR/API呼び出し未使用） |
| 外部ライブラリ | ExcelJS (CDN), holiday_jp (CDN) |
| 認証・認可 | なし |
| デプロイ | GitHub Pages（静的ホスティング） |

**データフロー**: ユーザー入力（フォーム）→ JavaScript変数 → localStorage保存 → localStorage読み込み → innerHTML でDOM描画

---

## 脆弱性一覧

### 1. DOM-based XSS: ユーザー入力がサニタイズなしで innerHTML に挿入される

**概要**: ユーザーが入力した版数・対応名・工程・担当者名等の文字列が、HTMLエスケープされずに `innerHTML` でDOMに挿入されている。localStorageに保存されたデータが読み込み時にそのままHTMLとして解釈される。

**該当箇所**: 以下は代表的な箇所（同パターンは全ファイルに多数存在）

| ファイル | 行番号 | 挿入される変数 |
|----------|--------|---------------|
| `js/estimate.js` | 844-845 | `taskGroup.task` |
| `js/estimate.js` | 859, 865 | `proc.process` |
| `js/estimate.js` | 868 | `proc.member` |
| `js/estimate.js` | 1130-1133 | `est.version`, `est.task`, `est.process`, `est.member` |
| `js/estimate.js` | 1342-1354 | `est.version`, `est.task`, `est.process`, `est.member` |
| `js/estimate.js` | 1395-1404 | `est.version`, `est.task`, `est.process`, `est.member` |
| `js/report.js` | 760-763 | `data.version`, `data.task`, `data.process`, `data.member` |
| `js/report.js` | 1426 | `anomaly.version`, `anomaly.task`, `anomaly.process` |
| `js/report.js` | 1483 | `warning.version`, `warning.task` |
| `js/report.js` | 2012 | レポートHTML全体 |
| `js/actual.js` | 471 | `actual.process`（部分的にエスケープ漏れ） |
| `js/actual.js` | 214, 485, 801, 869, 1022 | 各種ユーザー入力変数 |
| `js/schedule-render.js` | 1107-1120 | `schedule.task`, `schedule.process`, `schedule.member` |
| `js/schedule.js` | 1879-1884 | `message`（トースト表示） |
| `js/modal.js` | 125, 277, 288 | 各種ユーザー入力 |
| `js/quick.js` | 148-152 | `taskInfo.display` |
| `js/estimate-split.js` | 33, 143, 170-177 | 見積情報 |

**確信度**: High
**深刻度**: **Medium**

> 注: このアプリはローカル専用（サーバー通信なし・認証なし）であり、攻撃者がlocalStorageにデータを注入するには物理的なアクセスまたは別の脆弱性が必要。ただし、JSONインポート機能（`js/storage.js`）経由で悪意のあるデータを読み込ませるシナリオは現実的。

**攻撃シナリオ**:
1. 攻撃者が悪意のあるJSONファイルを作成（対応名に `<img src=x onerror=alert(document.cookie)>` を含める）
2. 被害者に「このバックアップデータを復元して」と送る
3. 被害者がJSONインポート機能で読み込む
4. 画面描画時にスクリプトが実行される

**修正コード**:

```javascript
// 修正前: js/estimate.js:1130-1133
html += `
    <td>${est.version}</td>
    <td>${est.task}</td>
    <td><span class="badge badge-${est.process.toLowerCase()}">${est.process}</span></td>
    <td>${est.member}</td>
`;

// 修正後
html += `
    <td>${escapeHtml(est.version)}</td>
    <td>${escapeHtml(est.task)}</td>
    <td><span class="badge badge-${escapeHtml(est.process.toLowerCase())}">${escapeHtml(est.process)}</span></td>
    <td>${escapeHtml(est.member)}</td>
`;

// 修正の意図: ユーザー入力値をHTMLエンティティに変換し、HTMLタグとして解釈されることを防ぐ。
```

**修正ステータス**: ✅ 修正済み（全ファイルの `innerHTML` にユーザー入力値の `escapeHtml()` 適用完了）

**修正済みファイル**: `estimate.js`, `actual.js`, `report.js`, `schedule.js`, `schedule-render.js`, `modal.js`, `quick.js`, `vacation.js`, `estimate-split.js`, `estimate-add.js`

> **追加修正（2026-02-19）**: `actual.js` の祝日名表示（`holiday_jp.between()` の返り値、会社休日名）にも `escapeHtml()` を適用。外部ライブラリの返り値が改ざんされた場合のXSS経路を遮断。

---

### 2. DOM-based XSS: onclick ハンドラ内のインジェクション

**概要**: インラインの `onclick` 属性にユーザー入力文字列が埋め込まれている。エスケープ処理はシングルクォートの置換（`replace(/'/g, "\\'")`）のみで、HTMLエンティティ（`&`, `<`, `>`, `"`）のエスケープが行われていない。

**該当箇所**:

| ファイル | 行番号 | 挿入される変数 |
|----------|--------|---------------|
| `js/estimate.js` | 730-732 | `taskGroup.task` → onclick内 |
| `js/estimate.js` | 844-845 | `taskGroup.task` → onclick内 |
| `js/estimate.js` | 1037-1042 | `version`, `group.task` → onclick内 |
| `js/estimate.js` | 1444-1498 | `version`, `task` → onclick内（複数箇所） |
| `js/estimate.js` | 1546-1580 | `escapedVersion`, `escapedTask` → onclick内 |
| `js/report.js` | 2704 | `version`, `task`, `process` → onclick内 |
| `js/report.js` | 2713-2717 | `version`, `task`, `process` → onclick内 |
| `js/quick.js` | 152 | `value`, `taskInfo.display` → onmousedown内 |
| `js/actual.js` | 908, 929, 941, 945 | `member`, `date` → onclick内 |

**確信度**: High
**深刻度**: **Medium**

**攻撃シナリオ**:
1. 対応名に `');alert('XSS` のような文字列を入力（シングルクォートはエスケープされるが他の攻撃ベクタあり）
2. 対応名に `</td><script>alert(1)</script>` を含めると、onclick属性のコンテキストを抜け出してHTMLインジェクションが可能
3. JSONインポートで `"task": "x' onclick='alert(1)' data-x='"` のようなデータを注入

**修正コード**:

```javascript
// 修正前: js/estimate.js:1037-1042
const escapedVer = version.replace(/'/g, "\\'");
const escapedTsk = group.task.replace(/'/g, "\\'");
html += `<tr onclick="showTaskDetail('${escapedVer}', '${escapedTsk}')">`;

// 修正後: data属性 + addEventListener パターン
html += `<tr data-version="${escapeHtmlAttr(version)}" data-task="${escapeHtmlAttr(group.task)}" class="clickable-task-row">`;

// イベント委譲で処理（描画後に1回だけ登録）
container.addEventListener('click', (e) => {
    const row = e.target.closest('.clickable-task-row');
    if (row) {
        showTaskDetail(row.dataset.version, row.dataset.task);
    }
});

// 修正の意図: インラインイベントハンドラを排除し、data属性経由で値を渡すことで
// JavaScript文字列リテラルのエスケープ問題を根本的に解消する。
```

**修正ステータス**: ✅ 修正済み（`escapeForHandler()` によるJS+HTML二重コンテキストエスケープを全ファイルに適用）

**修正済みファイル**: `estimate.js`, `actual.js`, `report.js`, `quick.js`

---

### 3. サプライチェーンリスク: 外部CDN依存にSRI（Subresource Integrity）なし

**概要**: 2つの外部CDNスクリプトが `integrity` 属性なしで読み込まれている。CDNが侵害された場合、任意のコードが実行される。

**該当箇所**:
- `index.html:37` - ExcelJS (`cdnjs.cloudflare.com`)
- `index.html:38` - holiday_jp (`cdn.jsdelivr.net`)

**確信度**: High
**深刻度**: **High**

**攻撃シナリオ**:
1. CDNのDNS乗っ取り、またはCDNプロバイダの侵害により、悪意のあるスクリプトが配信される
2. ユーザーがアプリを開くと、改ざんされたスクリプトが実行される
3. localStorage内の全データ（工数・個人名等）が外部に送信される可能性

**修正コード**:

```html
<!-- 修正前: index.html:37-38 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@holiday-jp/holiday_jp/holiday_jp.min.js"></script>

<!-- 修正後 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js"
        integrity="sha384-（実際のハッシュを生成して設定）"
        crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@holiday-jp/holiday_jp@0.1.6/holiday_jp.min.js"
        integrity="sha384-（実際のハッシュを生成して設定）"
        crossorigin="anonymous"></script>

<!-- 修正の意図: SRIハッシュにより、CDNから配信されるスクリプトが改ざんされていないことを検証する。
     バージョンも固定することで、意図しないアップデートによる挙動変化を防ぐ。 -->
```

**修正ステータス**: ✅ 修正済み → ✅ さらに改善済み（CDN依存を完全排除。ライブラリをリポジトリ内 `lib/` にvendoringし、自サイトから配信する方式に変更。SRI/crossoriginは不要となり、CSPからもCDNドメインを除去。サプライチェーンリスクをゼロに）

---

### 4. CSP（Content Security Policy）未設定

**概要**: Content Security Policyヘッダーもmetaタグも設定されていない。XSS脆弱性が存在した場合の被害軽減策（多層防御）が欠如している。

**該当箇所**: `index.html`（全体）

**確信度**: High
**深刻度**: **Medium**

**攻撃シナリオ**:
- XSS脆弱性が悪用された場合、CSPがないため任意の外部リソースの読み込み、インラインスクリプトの実行、データの外部送信が制限なく行える

**修正コード**:

```html
<!-- 修正前: CSP未設定 -->

<!-- 修正後: index.html の <head> 内に追加 -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net 'unsafe-inline';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data:;
               connect-src 'none';
               frame-src 'none';
               object-src 'none';">

<!-- 修正の意図: スクリプトの読み込み元を自サイトと使用中のCDNに限定し、
     外部への通信(connect-src)やフレーム埋め込み(frame-src)を禁止することで、
     XSS攻撃の影響範囲を限定する。
     注: 現在インラインスクリプトを使用しているため 'unsafe-inline' が必要。
     将来的にはインラインスクリプトを外部ファイル化し、'unsafe-inline' を除去すべき。 -->
```

**修正ステータス**: ✅ 修正済み（`<meta http-equiv="Content-Security-Policy">` を `index.html` に追加。`connect-src 'none'`, `frame-src 'none'`, `object-src 'none'` で外部通信・フレーム・オブジェクトを遮断）

---

### 5. HTMLサニタイズユーティリティの欠如

**概要**: `escapeHtml` 関数が `js/actual.js:466-469` にローカル定義として1箇所だけ存在するが、グローバルなユーティリティとしては提供されていない。結果として、100箇所以上の `innerHTML` 使用箇所でサニタイズが省略されている。

**該当箇所**: `js/utils.js`（ユーティリティファイルに `escapeHtml` 関数が存在しない）

**確信度**: High
**深刻度**: **Medium**（脆弱性 #1, #2 の根本原因）

**攻撃シナリオ**: 脆弱性 #1 と同じ

**修正コード**:

```javascript
// 修正前: js/actual.js:466-469（ローカル定義のみ）
const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// 修正後: js/utils.js にグローバルユーティリティとして追加
/**
 * HTML特殊文字をエスケープする
 * @param {string} str - エスケープ対象の文字列
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * HTML属性値用のエスケープ（data属性等に使用）
 * @param {string} str - エスケープ対象の文字列
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtmlAttr(str) {
    return escapeHtml(str);
}

// 修正の意図: 文字列ベースの置換により、DOM生成のオーバーヘッドなく安全にエスケープする。
// 全ファイルからimportして使用することで、サニタイズの一貫性を確保する。
```

**修正ステータス**: ✅ 修正済み（`js/utils.js` に `escapeHtml()` と `escapeForHandler()` を追加。`actual.js` のローカル定義を削除し、全ファイルで共通ユーティリティを使用）

---

### 6. localStorageデータの改ざんリスク（バリデーション不足）

**概要**: localStorageから読み込んだデータに対する型チェックやバリデーションが最小限。JSON.parseの結果をそのまま使用している箇所が多い。

**該当箇所**:
- `js/storage.js:141-157` - loadAllData関数
- `index.html:14-33` - 早期テーマ読み込み

**確信度**: Medium
**深刻度**: **Low**

**攻撃シナリオ**:
1. ブラウザのDevToolsやブラウザ拡張からlocalStorageの値を改ざん
2. 不正な型のデータ（文字列の代わりにオブジェクト等）を挿入
3. アプリが予期しない動作をする（クラッシュ、表示崩れ等）

> 注: localStorageの直接改ざんにはブラウザへの物理/論理アクセスが必要。
> ただし、JSONインポート機能を通じて不正なデータ構造を読み込ませることは可能。

**修正コード**:

```javascript
// 修正前: js/storage.js（JSON.parseの結果をそのまま使用）
const savedEstimates = localStorage.getItem('manhour_estimates');
if (savedEstimates) estimates = JSON.parse(savedEstimates);

// 修正後: 最低限の型バリデーションを追加
const savedEstimates = localStorage.getItem('manhour_estimates');
if (savedEstimates) {
    try {
        const parsed = JSON.parse(savedEstimates);
        if (Array.isArray(parsed)) {
            estimates = parsed.filter(e =>
                typeof e === 'object' && e !== null &&
                typeof e.id === 'number'
            );
        }
    } catch (e) {
        console.error('見積データの読み込みに失敗:', e);
    }
}

// 修正の意図: 配列であることと各要素がオブジェクトであることを確認し、
// 予期しないデータ型によるクラッシュを防ぐ。
```

**修正ステータス**: ⏭️ 見送り（深刻度Low。ローカル専用アプリでありリスクが限定的。XSSエスケープにより改ざんデータの影響は軽減済み）

---

### 7. holiday_jp CDNバージョン未固定

**概要**: holiday_jpのCDN URLでバージョンが固定されておらず、常に最新版が読み込まれる。意図しないバージョン変更による動作の変化やサプライチェーン攻撃のリスクがある。

**該当箇所**: `index.html:38`

**確信度**: High
**深刻度**: **Medium**

**修正コード**:

```html
<!-- 修正前 -->
<script src="https://cdn.jsdelivr.net/npm/@holiday-jp/holiday_jp/holiday_jp.min.js"></script>

<!-- 修正後 -->
<script src="https://cdn.jsdelivr.net/npm/@holiday-jp/holiday_jp@0.1.6/holiday_jp.min.js"
        integrity="sha384-（実際のハッシュ値）"
        crossorigin="anonymous"></script>

<!-- 修正の意図: バージョンを固定することで、依存ライブラリの意図しない変更を防ぐ。 -->
```

**修正ステータス**: ✅ 修正済み → ✅ さらに改善済み（#3 と同様、ローカル配置により解消）

---

## 該当なしのカテゴリ

| カテゴリ | 結果 |
|----------|------|
| CSRF | 該当なし（サーバー通信なし） |
| 認証・認可ロジックの誤り | 該当なし（認証機能なし） |
| セッション管理 | 該当なし（セッション概念なし） |
| 脆弱なAPI設計 | 該当なし（バックエンドAPI未使用） |
| 危険なJavaScript API使用 | 該当なし（`eval`, `new Function`, `setTimeout`文字列引数の使用なし） |
| URL/location経由のインジェクション | 該当なし（`location.hash/search` の読み取り・DOM挿入なし） |

---

## サマリー

| 深刻度 | 検出数 | 修正済み | 見送り |
|--------|--------|---------|--------|
| **Critical** | 0 | - | - |
| **High** | 1 | 1 | 0 |
| **Medium** | 5 | 4 | 0 |
| **Low** | 1 | 0 | 1 |
| **合計** | **7** | **6件修正済み** | **1件見送り** |

### 修正結果

| # | 脆弱性 | 深刻度 | ステータス |
|---|--------|--------|-----------|
| 1 | innerHTML XSS | Medium | ✅ 修正済み |
| 2 | onclick ハンドラ XSS | Medium | ✅ 修正済み |
| 3 | CDN SRI なし | High | ✅ 修正済み |
| 4 | CSP 未設定 | Medium | ✅ 修正済み |
| 5 | escapeHtml ユーティリティ欠如 | Medium | ✅ 修正済み |
| 6 | localStorage バリデーション不足 | Low | ⏭️ 見送り |
| 7 | holiday_jp バージョン未固定 | Medium | ✅ 修正済み |
