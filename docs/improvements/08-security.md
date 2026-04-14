# H. セキュリティ・信頼性 設計書

> **カテゴリ**: データ保護と整合性
> **改善数**: 6件
> **優先度**: 低〜中
> **関連ファイル**: js/storage.js, js/state.js, js/actual.js, js/estimate.js

---

## 23. データ保護

### 23-1. エクスポート時の暗号化オプション

#### 現状の課題
- バックアップJSONは平文で、メンバー名・工数データが丸見え
- メールやチャットで共有する際のセキュリティリスク
- 第三者がファイルを取得した場合、内容を自由に閲覧可能

#### 提案内容
- パスワード付きバックアップの作成
- Web Crypto APIによるAES-GCM暗号化
- インポート時のパスワード入力

#### 実装方針

```javascript
/**
 * Web Crypto APIを使用したバックアップ暗号化
 * AES-GCM (256bit) + PBKDF2によるパスワードベースの鍵導出
 */

/**
 * パスワードから暗号鍵を導出
 */
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * データの暗号化
 */
async function encryptData(data, password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  // salt + iv + 暗号文を結合
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);

  return result;
}

/**
 * データの復号
 */
async function decryptData(encryptedBuffer, password) {
  const data = new Uint8Array(encryptedBuffer);
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);

  const key = await deriveKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch (e) {
    throw new Error('パスワードが正しくないか、データが破損しています');
  }
}
```

##### UI変更
```
エクスポートダイアログ:
┌─ バックアップ作成 ───────────────────────┐
│                                          │
│ 形式: ○ 通常（JSON） ● 暗号化付き        │
│                                          │
│ パスワード: [••••••••]                    │
│ パスワード確認: [••••••••]                │
│                                          │
│ ⚠ パスワードを忘れると復元できません       │
│                                          │
│          [キャンセル] [エクスポート]       │
└──────────────────────────────────────────┘

インポートダイアログ（暗号化ファイル検出時）:
┌─ バックアップ復元 ───────────────────────┐
│                                          │
│ 🔒 暗号化されたバックアップです           │
│                                          │
│ パスワード: [________]                    │
│                                          │
│          [キャンセル] [復元]              │
└──────────────────────────────────────────┘
```

##### ファイル形式
```
通常: .json（既存互換）
暗号化: .manhour.enc（バイナリ、ヘッダーにバージョン情報）

ファイルヘッダー:
[マジックバイト: 4byte "MHE\x01"]
[ソルト: 16byte]
[IV: 12byte]
[暗号文: 可変長]
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/crypto-utils.js` | 新規: 暗号化/復号ユーティリティ |
| `js/storage.js` | エクスポート/インポート処理の拡張 |
| `js/ui.js` | パスワード入力UIの追加 |
| `style.css` | 暗号化関連のUIスタイル |

##### 実装ステップ
1. crypto-utils.jsの作成（暗号化/復号関数）
2. エクスポートUIにパスワードオプション追加
3. 暗号化エクスポートの実装
4. ファイル形式の判定（JSON or 暗号化）
5. パスワード入力UIの追加
6. 復号とインポートの実装
7. エラーハンドリング（不正パスワード、破損ファイル）

##### 技術的考慮事項
- Web Crypto APIはHTTPS環境でのみ利用可能（localhost除く）
- パスワードのメモリ上の扱い（使用後にクリア）
- ブラウザのオートフィルとの競合を避ける

##### 工数見積
- 中（2-3日）

---

### 23-2. 個人情報の匿名化オプション

#### 現状の課題
- スクリーンショットを共有する際、メンバー名が見える
- デモやプレゼンテーションで実データを見せにくい

#### 提案内容
- メンバー名を匿名表示するトグル（「森」→「メンバーA」）
- スクリーンショット用のプレゼンテーションモード

#### 実装方針

```javascript
// js/state.js に追加
let anonymizeMode = false;

const anonymizeMap = {};  // 実名 → 匿名名のマッピング

function getAnonymizedName(realName) {
  if (!anonymizeMode) return realName;

  if (!anonymizeMap[realName]) {
    const index = Object.keys(anonymizeMap).length;
    anonymizeMap[realName] = `メンバー${String.fromCharCode(65 + index)}`; // A, B, C...
  }
  return anonymizeMap[realName];
}

// 全UI表示でメンバー名をフィルタ
function displayMemberName(name) {
  return getAnonymizedName(name);
}
```

##### UI変更
```
設定画面 or ヘッダーのクイックトグル:
┌─────────────────────────┐
│ 🕶 匿名モード [OFF/ON]  │
└─────────────────────────┘

ON時の表示:
│ 4/14 │ v2.0 │ ログイン │ PG │ メンバーA │ 3.0h │
│ 4/14 │ v2.0 │ API     │ UI │ メンバーB │ 2.0h │
```

##### 工数見積
- 小〜中（1-2日）

---

### 23-3. 操作ログ

#### 提案内容
- 全データ変更操作を記録（作成/更新/削除 + 日時 + 変更前後の値）
- 既存のundo/redo履歴を拡張して永続化
- ログ閲覧画面（設定 > デバッグ > 操作ログ）

#### 実装方針

```javascript
/**
 * 操作ログの記録
 */
const operationLog = [];
const MAX_LOG_SIZE = 500;

function logOperation(type, entity, action, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,           // 'estimate' | 'actual' | 'schedule' | 'settings'
    action,         // 'create' | 'update' | 'delete' | 'import'
    entity: {       // 変更対象の概要（IDと主要フィールド）
      id: entity.id,
      summary: `${entity.version}/${entity.task}/${entity.process}`
    },
    details         // { before: {...}, after: {...} } 変更前後
  };

  operationLog.push(entry);
  if (operationLog.length > MAX_LOG_SIZE) {
    operationLog.shift();
  }

  // 永続化（設定でON/OFF）
  localStorage.setItem('manhour_operation_log', JSON.stringify(operationLog));
}
```

##### 工数見積
- 中（2日）

---

## 24. データ整合性

### 24-1. 重複データ検出

#### 現状の課題
- 同じ日・同じタスクに二重入力しても警告がない
- インポート時に既存データと重複するレコードが追加される可能性
- 重複データがレポートの数値を狂わせる

#### 提案内容
- 実績入力時の重複チェック（同日・同タスク・同メンバー）
- インポート時の重複検出・除外オプション
- 定期的な重複スキャン（設定画面から手動実行）

#### 実装方針

```javascript
/**
 * 実績の重複検出
 * @param {Object} newActual - 新しい実績データ
 * @returns {Array} 重複候補のリスト
 */
function detectDuplicateActuals(newActual) {
  return getActuals().filter(existing =>
    existing.id !== newActual.id &&  // 自分自身を除外（編集時）
    existing.date === newActual.date &&
    existing.version === newActual.version &&
    existing.task === newActual.task &&
    existing.process === newActual.process &&
    existing.member === newActual.member
  );
}

/**
 * 入力時の重複チェック
 */
function checkBeforeSave(actual) {
  const duplicates = detectDuplicateActuals(actual);

  if (duplicates.length > 0) {
    const existingHours = duplicates.reduce((s, d) => s + d.hours, 0);
    return {
      hasDuplicate: true,
      message: `同じ日・タスク・工程に既に${existingHours}hが登録されています。追加しますか？`,
      duplicates
    };
  }

  return { hasDuplicate: false };
}

/**
 * 全データの重複スキャン
 */
function scanAllDuplicates() {
  const actuals = getActuals();
  const seen = new Map();  // キー → レコードリスト
  const duplicateGroups = [];

  for (const actual of actuals) {
    const key = `${actual.date}|${actual.version}|${actual.task}|${actual.process}|${actual.member}`;
    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key).push(actual);
  }

  for (const [key, records] of seen) {
    if (records.length > 1) {
      duplicateGroups.push({
        key,
        records,
        totalHours: records.reduce((s, r) => s + r.hours, 0)
      });
    }
  }

  return duplicateGroups;
}
```

##### UI変更
```
入力時の重複警告:
┌─ ⚠ 重複の可能性 ────────────────────────┐
│                                          │
│ 2026-04-14 / v2.0 / ログイン / PG / 森   │
│ に既に 3.0h が登録されています            │
│                                          │
│ ○ 追加する（合計 6.0h になります）        │
│ ○ 既存を上書きする                       │
│ ○ キャンセル                             │
│                                          │
│            [確定]                         │
└──────────────────────────────────────────┘

重複スキャン結果（設定画面）:
┌─ 🔍 重複データスキャン結果 ──────────────┐
│                                          │
│ 3件の重複グループが見つかりました         │
│                                          │
│ 1. 4/10 v2.0/ログイン/PG/森 × 2件 (6h)  │
│    [統合] [個別に確認]                    │
│                                          │
│ 2. 4/12 v2.0/API/UI/田中 × 2件 (4h)     │
│    [統合] [個別に確認]                    │
│                                          │
│ [すべて統合] [レポートを閉じる]           │
└──────────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/actual.js` | detectDuplicateActuals(), checkBeforeSave() |
| `js/storage.js` | scanAllDuplicates() |
| `js/ui.js` | 重複警告UI、スキャン結果表示 |
| `style.css` | 重複警告・スキャンUIのスタイル |

##### 実装ステップ
1. 重複検出関数の実装
2. 実績入力時の重複チェック→確認ダイアログ
3. 全データスキャン機能
4. 重複統合（マージ or 削除）処理
5. 設定画面での手動スキャンボタン
6. インポート時の重複チェック統合

##### 工数見積
- 中（2日）

---

### 24-2. 見積と実績の紐づけ検証

#### 現状の課題
- 実績に入力されたバージョン/タスク/工程の組み合わせが、見積に存在しない場合がある
- 見積が削除/変更されても、紐づく実績はそのまま残る
- レポートの予実対比で「見積なし」のデータが出現

#### 提案内容
- 実績入力時に対応する見積の存在チェック
- 「見積なし実績」の検出・通知
- 孤立データのクリーンアップ提案

#### 実装方針

```javascript
/**
 * 孤立データの検出
 * 見積に対応しない実績を検出
 */
function detectOrphanedActuals() {
  const estimateKeys = new Set(
    getEstimates().map(e => `${e.version}|${e.task}|${e.process}`)
  );

  return getActuals().filter(actual => {
    const key = `${actual.version}|${actual.task}|${actual.process}`;
    return !estimateKeys.has(key);
  });
}

/**
 * 実績入力時の見積存在チェック
 */
function validateActualAgainstEstimate(actual) {
  const matchingEstimate = getEstimates().find(e =>
    e.version === actual.version &&
    e.task === actual.task &&
    e.process === actual.process
  );

  if (!matchingEstimate) {
    return {
      valid: true,  // 入力自体は許可
      warning: `この組み合わせの見積が登録されていません。予実対比レポートに含まれません。`,
      action: 'suggest_create_estimate'
    };
  }

  return { valid: true, warning: null };
}
```

##### 工数見積
- 小〜中（1-2日）

---

### 24-3. 入力バリデーション強化

#### 現状の課題
- 数値チェックが緩い（0.1-999.9の範囲チェックのみ）
- 日付の妥当性チェックが不十分
- フィールド間の整合性チェックがない

#### 提案内容
- 日付: 未来日への入力時に確認（「まだ来ていない日付です」）
- 時間: 1日24h以上の入力を警告
- 整合性: 同日の合計が24hを超える場合に警告

#### 実装方針

```javascript
/**
 * 実績入力のバリデーション
 */
function validateActualInput(actual) {
  const warnings = [];
  const errors = [];

  // 日付チェック
  const today = new Date().toISOString().slice(0, 10);
  if (actual.date > today) {
    warnings.push('未来の日付です。入力を続けますか？');
  }

  // 時間チェック
  if (actual.hours <= 0) {
    errors.push('時間は0より大きい値を入力してください');
  }
  if (actual.hours > 24) {
    errors.push('1日24時間を超える入力はできません');
  }
  if (actual.hours > 12) {
    warnings.push('12時間を超えています。入力値に間違いはありませんか？');
  }

  // 同日合計チェック
  const sameDayTotal = getActuals()
    .filter(a => a.date === actual.date && a.member === actual.member)
    .reduce((s, a) => s + a.hours, 0);

  if (sameDayTotal + actual.hours > 24) {
    warnings.push(
      `この入力で${actual.date}の合計が${(sameDayTotal + actual.hours).toFixed(1)}hになります`
    );
  }

  if (sameDayTotal + actual.hours > 10) {
    warnings.push(
      `この日の合計が${(sameDayTotal + actual.hours).toFixed(1)}hになります`
    );
  }

  return { errors, warnings, isValid: errors.length === 0 };
}
```

##### 工数見積
- 小（1日）

---

## まとめ

| # | 改善 | 優先度 | 工数 | 効果 |
|---|------|--------|------|------|
| 23-1 | 暗号化エクスポート | 低 | 中 | データ保護 |
| 23-2 | 匿名化モード | 低 | 小〜中 | プライバシー |
| 23-3 | 操作ログ | 低 | 中 | 監査対応 |
| 24-1 | 重複データ検出 | 高 | 中 | データ品質 |
| 24-2 | 紐づけ検証 | 中 | 小〜中 | データ整合性 |
| 24-3 | バリデーション強化 | 高 | 小 | 入力品質 |
