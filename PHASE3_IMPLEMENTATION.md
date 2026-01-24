# Phase 3 実施計画詳細

> **作成日**: 2026-01-24
> **状態**: Phase 3-1〜3-4 完了、継続作業が可能

---

## Phase 3 実施状況

### ✅ Phase 3-1: エラーハンドリングの強化（完了）

**コミット**: c09d016

#### 実施内容
以下のファイルにエラーハンドリングを追加：

##### 高優先度（完了）
1. **storage.js**
   - L119-130: `JSON.parse()` をtry-catchで保護（データ読み込み）
   - L148-188: `JSON.parse()` をtry-catchで保護（設定読み込み）
   - エラー時はアラート表示 + デフォルト設定使用

2. **estimate-add.js**
   - L31-32: `getElementById('addEstTask')` のnullチェック
   - L34-35: `querySelector()` のnullチェック
   - L39-43: `PROCESS.TYPES.forEach()` 内でnullチェック
   - L157-158: `querySelector()` のnullチェック
   - L200: `headerRow` のnullチェック
   - L316-319: 月配列の空チェック

3. **theme.js**
   - L55-67: `loadChartColorScheme()` のtry-catch
   - L101-126: `loadThemeSettings()` のtry-catch
   - L509-515: `applyDefaultEstimateViewType()` のtry-catch
   - L534-540: `applyDefaultReportViewType()` のtry-catch

4. **report.js**
   - L49-66: `loadReportSettings()` のtry-catch

5. **utils.js**
   - L120-122: `workMonths[0]` の存在確認
   - L134-136: 配列先頭・末尾の存在確認

6. **modal.js**
   - L18-21: モーダル要素のnullチェック

##### 中優先度（未実施、今後の作業）
- **floating-filter.js** L46: `container` 要素のnullチェック
- **estimate-add.js** 残りのDOM操作箇所
- localStorage操作全体へのtry-catch統一

---

### ✅ Phase 3-2: コメント・ドキュメントの充実（完了）

**コミット**: aefe3a0

#### 実施内容
主要15関数にJSDocコメントを追加：

##### storage.js（4関数）
- `saveData(skipAutoBackup)` - L51
- `loadData()` - L123
- `autoBackup()` - L218
- `handleFileImport(event)` - L292

##### report.js（3関数）
- `clearProgressCache()` - L136
- `calculateProgress(version, task, process, member)` - L149
- `createProgressBar(progressRate, status, options)` - L296

##### utils.js（4関数）
- `normalizeEstimate(e)` - L38
- `getMonthColor(workMonths)` - L126
- `determineProgressStatus(estimatedHours, actualHours, remainingHours, warningThreshold)` - L405
- `filterByVersionAndTask(array, version, task, process, member)` - L491

##### estimate.js（2関数）
- `saveRemainingEstimate(version, task, process, member, remainingHours)` - L124
- `renderEstimateList()` - L175

##### actual.js（3関数）
- `renderActualList()` - L229
- `renderMemberCalendar()` - L354
- `saveActualEdit()` - L1131

#### 未実施の高優先度関数（継続作業用）

**estimate.js**（残り2関数）:
- `renderEstimateGrouped()` - L377（250行、複雑なUI生成）
- `renderEstimateMatrix()` - L627（130行、マトリクスレイアウト）

**actual.js**（残り3関数）:
- `getHoliday(dateStr)` - L29（145行、ライブラリフォールバック）
- `renderActualMatrix()` - L523（230行、日付×担当者マトリクス）
- `updateEditActualTaskList()` - L1244（94行、残存時間計算）

**modal.js**（残り1関数）:
- `drawBreakdownDonutChart()` - L140（200行、Canvas描画）

**ui.js**（残り1関数）:
- `showTab(tabName)` - L94（90行、タブアニメーション）

---

### ✅ Phase 3-3: constants.jsの適用拡大（第1段階完了）

**コミット**: a6c90e4

#### 実施内容

##### constants.jsに追加した定数
```javascript
// LAYOUT.SPACING（パディング・マージン）
SPACING: { XS: 2, SM: 4, BASE: 6, MD: 8, LG: 10, XL: 12, XXL: 15, XXXL: 20 }

// UI.DEFAULT_MEMBER_LABEL
DEFAULT_MEMBER_LABEL: '未設定'

// UI.TABLE_COLORS（テーブル背景色7種類）
TABLE_COLORS: {
    HEADER_BG: '#1565c0',
    ROW_BG: '#f5f5f5',
    SUBTOTAL_BG: '#fff3cd',
    DAILY_TOTAL_BG: '#ffc107',
    EMPTY_CELL_BG: '#fafafa',
    VACATION_BG: '#fff3e0',
    HOLIDAY_BG: '#ffebee'
}

// UI.BADGE_COLORS
BADGE_COLORS: { UNSET: '#dc3545', SET: '#28a745' }

// UI.FONT_SIZES（8段階）
FONT_SIZES: { XS: 10, SM: 11, BASE: 12, MD: 13, LG: 14, XL: 15, XXL: 16, XXXL: 18 }

// UI.OPACITY（透明度5段階）
OPACITY: { LIGHT: 0.15, MEDIUM: 0.2, STRONG: 0.3, HEAVY: 0.35, OPAQUE: 0.4 }

// PROCESS（工程関連）
PROCESS: {
    TYPES: ['UI', 'PG', 'PT', 'IT', 'ST'],
    UI: 'UI', PG: 'PG', PT: 'PT', IT: 'IT', ST: 'ST',
    COLORS: { UI: '#4dabf7', PG: '#20c997', PT: '#ff922b', IT: '#51cf66', ST: '#f06595' }
}
```

##### 適用済みの箇所
- **estimate-add.js**: `PROCESS.TYPES` を4箇所で使用（L38, L215, L287, L419）

#### 未実施の適用箇所（継続作業用）

##### 優先度：高（複数ファイルで使用）

**PROCESS.TYPESの適用候補**（残り9箇所）:
- estimate.js: L91, L486, L691
- report.js: L1133, L1291, L1851, L2038
- estimate-split.js: L255
- 他のファイルでも `['UI', 'PG', 'PT', 'IT', 'ST']` がハードコードされている箇所

**UI.TABLE_COLORSの適用候補**（8箇所以上）:
- estimate.js: L497-552（`#1565c0`, `#f5f5f5`, `#fff3cd` など）
- actual.js: L427-664（テーブルセル背景、バッジ色）
- report.js: L461等（複数箇所）

**UI.BADGE_COLORSの適用候補**:
- estimate.js: L497等（`#dc3545` 未設定バッジ、`#28a745` 設定済みバッジ）

##### 優先度：中

**UI.FONT_SIZESの適用候補**（8箇所）:
- estimate.js: L464, L597-598
- actual.js: L411-412
- report.js: L529
- 10px〜18pxのフォントサイズがハードコードされている箇所

**LAYOUT.SPACINGの適用候補**（15+箇所）:
- estimate-add.js: L206-207, L321, L327-333
- actual.js: L363-368
- modal.js: L157-225
- パディング・マージンの数値がハードコードされている箇所

---

### ✅ Phase 3-4: ユーティリティ関数の活用拡大（完了）

**コミット**: c1e56c2

#### 実施内容
utils.jsに5つの関数を追加：

1. **parseMonthString(monthStr)**
   - YYYY-MM形式を `{year: number, month: number}` に分解

2. **formatMonthJapanese(year, month)**
   - 「YYYY年M月」形式で日本語フォーマット

3. **formatMonthRangeJapanese(startMonth, endMonth)**
   - 「YYYY年M月〜M月」または「YYYY年M月〜YYYY年M月」形式
   - 同年内は年を省略

4. **getCurrentMonthString()**
   - 現在の月をYYYY-MM形式で取得

5. **getNextDateString(dateStr)**
   - YYYY-MM-DD形式の次の日を計算

#### 未実施の適用箇所（継続作業用）

##### formatMonthJapanese()の適用候補（50+箇所）
以下のパターンを置き換え：
```javascript
// 現在（置き換え前）
const [year, month] = monthFilter.split('-');
const label = `${year}年${parseInt(month)}月`;

// 置き換え後
import * as Utils from './utils.js';
const {year, month} = Utils.parseMonthString(monthFilter);
const label = Utils.formatMonthJapanese(year, month);
```

**ファイル別の適用候補**:
- estimate.js: L279, L501-502, L542-543, L804, L814, L934
- actual.js: L378-379, L409-411, L430, L559, L590, L668, L847
- report.js: L1055-1056, L1074, L1380, L1770
- estimate-split.js: L105-107, L116-120, L317-329
- ui.js: L1274-1291, L1334-1351, L1444-1470
- estimate-edit.js: L305-320
- vacation.js: L167-170
- estimate-selection.js: L120-122

##### formatMonthRangeJapanese()の適用候補（15+箇所）
```javascript
// 現在（置き換え前）
const [y1, m1] = workMonths[0].split('-');
const [y2, m2] = workMonths[workMonths.length - 1].split('-');
const range = `${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月`;

// 置き換え後
const range = Utils.formatMonthRangeJapanese(workMonths[0], workMonths[workMonths.length - 1]);
```

##### getCurrentMonthString()の適用候補（4箇所）
```javascript
// 現在（置き換え前）
const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// 置き換え後
const currentMonth = Utils.getCurrentMonthString();
```

**ファイル**:
- estimate-add.js: L85
- estimate-split.js: L46, L279
- estimate-edit.js: L261
- quick.js: L331

##### getNextDateString()の適用候補（2箇所）
```javascript
// 現在（置き換え前）
const [y, m, d] = currentDateStr.split('-').map(Number);
const nextDate = new Date(y, m - 1, d + 1);
currentDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

// 置き換え後
currentDateStr = Utils.getNextDateString(currentDateStr);
```

**ファイル**:
- actual.js: L398-400, L582-584

---

## 今後の追加推奨ユーティリティ関数

### 優先度：中

#### 1. formatDateFullJapanese(dateStr)
YYYY-MM-DD → 「YYYY年M月D日(曜日)」

**使用箇所**（10+箇所）:
- actual.js: L411, L430-433, L594
- vacation.js: L167-170
- estimate-selection.js: L120-122

#### 2. getLastDayOfMonth(year, month)
指定月の月末日を取得

**使用箇所**（5+箇所）:
- estimate.js: L258-259
- actual.js: L383-384, L390-391

#### 3. getWorkingDaysForMonth(monthStr)
YYYY-MM形式の月の営業日数を取得（estimate.jsのgetWorkingDaysをラップ）

**使用箇所**（5+箇所）:
- estimate.js: L258-259, L275-276
- report.js: 複数箇所

---

## 次のステップ（優先順）

### 即座に実施可能
1. **constants.jsの適用を拡大**
   - PROCESS.TYPESを残り9箇所に適用
   - UI.TABLE_COLORSを8箇所に適用
   - 推定作業時間: 1-2時間

2. **ユーティリティ関数の適用を拡大**
   - formatMonthJapanese()を50+箇所に適用
   - getCurrentMonthString()を4箇所に適用
   - getNextDateString()を2箇所に適用
   - 推定作業時間: 2-3時間

3. **追加のユーティリティ関数を実装**
   - formatDateFullJapanese(), getLastDayOfMonth(), getWorkingDaysForMonth()
   - 推定作業時間: 1時間

### 段階的に実施
4. **JSDocコメントを追加** - 残り8関数（高優先度）
5. **UI.FONT_SIZESとLAYOUT.SPACINGの適用** - 20+箇所

---

## 検証方法

1. **test-modules.html でモジュールロードを確認**
   ```bash
   python -m http.server 8000
   open http://localhost:8000/test-modules.html
   ```

2. **実際のアプリケーションで動作確認**
   - 見積追加・編集
   - 実績登録・カレンダー表示
   - レポート・分析機能
   - すべてのタブで表示確認

---

**最終更新**: 2026-01-24
**次回作業**: constants.js適用拡大またはユーティリティ関数適用拡大から開始
