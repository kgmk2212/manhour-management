# G. 運用・業務フロー 設計書

> **カテゴリ**: 運用・業務フロー面の改善
> **改善数**: 10件
> **優先度**: 中
> **関連ファイル**: js/actual.js, js/report.js, js/ui.js, js/state.js

---

## 20. 入力率の向上施策

### 20-1. 未入力日のハイライト

#### 現状の課題
- メンバーが実績を入力し忘れた日を検出する仕組みがない
- カレンダービューで「入力済み」と「未入力」が視覚的に区別できない
- 月末になって「先週分が入ってない」と気づくのでは遅い

#### 提案内容
- カレンダー上の営業日で実績ゼロの日を赤くハイライト
- クイック入力画面に「未入力日」のサマリーを表示
- 連続未入力日数の警告

#### 実装方針

```javascript
/**
 * 未入力日の検出
 * @param {string} member - 対象メンバー
 * @param {string} month - YYYY-MM形式
 * @returns {Array<string>} 未入力の営業日リスト
 */
function detectMissingDays(member, month) {
  const workDays = getWorkDaysInMonth(month);
  const vacationDays = getVacationDays(member, month);
  const companyHolidays = getCompanyHolidays(month);

  // 営業日 - 休暇 - 祝日 = 入力が期待される日
  const expectedDays = workDays.filter(d =>
    !vacationDays.includes(d) &&
    !companyHolidays.includes(d)
  );

  // 実績がある日
  const actualDays = new Set(
    getActuals()
      .filter(a => a.member === member && a.date.startsWith(month))
      .map(a => a.date)
  );

  // 今日以前の未入力日のみ（未来は除外）
  const today = new Date().toISOString().slice(0, 10);
  return expectedDays.filter(d => d <= today && !actualDays.has(d));
}
```

##### UI変更

**カレンダービュー**:
```
┌──── 2026年4月 ────────────────────────┐
│ 月    │ 火    │ 水    │ 木    │ 金    │
├───────┼───────┼───────┼───────┼───────┤
│       │  1    │  2    │  3    │  4    │
│       │ 8.0h  │ 7.5h  │ 8.0h  │ 7.0h  │
├───────┼───────┼───────┼───────┼───────┤
│  7    │  8    │  9    │ 10    │ 11    │
│ 8.0h  │ 🔴    │ 🔴    │ 6.5h  │ 8.0h  │ ← 赤=未入力
├───────┼───────┼───────┼───────┼───────┤
│ 14    │ 15    │ 16    │ 17    │ 18    │
│ (今日) │       │       │       │       │
└───────┴───────┴───────┴───────┴───────┘
```

**クイック入力サマリー**:
```
┌─ ⚠ 未入力の営業日 ─────────────────┐
│                                    │
│ 4月8日(火), 4月9日(水)の実績が     │
│ まだ入力されていません              │
│                                    │
│ [4/8を入力] [4/9を入力] [まとめて入力]│
└────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/actual.js` | detectMissingDays()関数追加 |
| `js/ui.js` | カレンダーの未入力日ハイライト、サマリー表示 |
| `js/constants.js` | 未入力ステータスの定数 |
| `style.css` | 未入力日のスタイル（赤背景、パルスアニメーション） |

##### 実装ステップ
1. 営業日判定ロジック（祝日・休暇考慮）
2. 未入力日検出関数
3. カレンダービューのハイライト表示
4. クイック入力画面のサマリーウィジェット
5. 「この日を入力」ボタンからの日付プリセット
6. 設定画面でのON/OFF切替

##### 工数見積
- 小〜中（1-2日）

---

### 20-2. 入力締め切り設定

#### 提案内容
- 「毎日18時まで」「毎週金曜まで」の入力期限を設定画面で指定
- 期限を過ぎた未入力日にはロック（編集に追加確認を要求）

#### 実装方針

```javascript
// js/state.js に追加
const inputDeadlineSettings = {
  enabled: false,
  type: 'daily',           // 'daily' | 'weekly'
  dailyDeadline: '18:00',  // HH:MM
  weeklyDeadline: 5,       // 曜日（1=月 ... 5=金）
  lockAfterDeadline: false, // true: 期限後は追加確認
  graceHours: 24            // 猶予時間（過ぎても入力可能な時間）
};
```

##### 工数見積
- 小（1日）

---

### 20-3. 入力率ダッシュボード

#### 提案内容
- チーム全体の入力率を管理者向けに表示
- メンバー別の入力状況一覧

#### 実装方針

```
┌─ 📋 入力率ダッシュボード（4月） ─────────────────┐
│                                                  │
│ チーム全体: ████████████░░ 85% (10営業日中)       │
│                                                  │
│ メンバー    │ 入力日数 │ 入力率 │ 最終入力日       │
│ ──────────┼─────────┼────────┼────────────────  │
│ 森         │ 10/10   │ 100%  │ 今日             │
│ 田中       │  8/10   │  80%  │ 昨日             │
│ 佐藤       │  7/10   │  70%  │ 3日前   ⚠       │
│ 鈴木       │  9/10   │  90%  │ 今日             │
│                                                  │
│ ⚠ 佐藤: 3日連続未入力                            │
└──────────────────────────────────────────────────┘
```

##### 工数見積
- 中（2日）

---

### 20-4. リマインダー通知（PWA前提）

#### 提案内容
- PWA化後にプッシュ通知で入力リマインダー
- 通知時刻のカスタマイズ

#### 実装方針

```javascript
// Service Worker内での通知スケジュール
// PWA化（B-8-3）が前提
function scheduleReminder(time) {
  if (!('Notification' in window)) return;

  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      // 指定時刻にリマインダーを表示
      const now = new Date();
      const target = new Date();
      target.setHours(parseInt(time.split(':')[0]));
      target.setMinutes(parseInt(time.split(':')[1]));

      const delay = target - now;
      if (delay > 0) {
        setTimeout(() => {
          new Notification('工数管理', {
            body: '今日の実績がまだ入力されていません',
            icon: '/icon-192.png',
            tag: 'reminder'
          });
        }, delay);
      }
    }
  });
}
```

##### 工数見積
- 小（1日、PWA化が前提）

---

## 21. 振り返り支援

### 21-1. 週次/月次サマリー自動生成

#### 現状の課題
- 振り返りミーティングで「先週何に時間を使ったか」を手作業で集計
- レポート画面はリアルタイムの数値で、期間のサマリーではない

#### 提案内容
- 指定期間の自動サマリーレポート
- 工程別・タスク別の時間配分円グラフ
- テキスト形式でのコピー（Slack投稿用）

#### 実装方針

```javascript
/**
 * 期間サマリーの生成
 * @param {string} member - メンバー名
 * @param {string} startDate - 開始日 YYYY-MM-DD
 * @param {string} endDate - 終了日 YYYY-MM-DD
 */
function generatePeriodSummary(member, startDate, endDate) {
  const actuals = getActuals().filter(a =>
    a.member === member &&
    a.date >= startDate &&
    a.date <= endDate
  );

  const totalHours = actuals.reduce((sum, a) => sum + a.hours, 0);

  // 工程別集計
  const byProcess = {};
  for (const a of actuals) {
    byProcess[a.process] = (byProcess[a.process] || 0) + a.hours;
  }

  // タスク別集計
  const byTask = {};
  for (const a of actuals) {
    const key = `${a.version}/${a.task}`;
    byTask[key] = (byTask[key] || 0) + a.hours;
  }

  // 日別推移
  const byDate = {};
  for (const a of actuals) {
    byDate[a.date] = (byDate[a.date] || 0) + a.hours;
  }

  // 前期との比較
  const daysDiff = dateDiffInDays(startDate, endDate);
  const prevStart = addDays(startDate, -daysDiff - 1);
  const prevEnd = addDays(startDate, -1);
  const prevTotal = getActuals()
    .filter(a => a.member === member && a.date >= prevStart && a.date <= prevEnd)
    .reduce((sum, a) => sum + a.hours, 0);

  const changePercent = prevTotal > 0
    ? ((totalHours - prevTotal) / prevTotal * 100).toFixed(1)
    : null;

  return {
    totalHours,
    byProcess,
    byTask,
    byDate,
    workDays: Object.keys(byDate).length,
    avgHoursPerDay: totalHours / Math.max(Object.keys(byDate).length, 1),
    comparison: { prevTotal, changePercent }
  };
}

/**
 * テキスト形式でのサマリー出力（Slack投稿用）
 */
function formatSummaryAsText(summary, memberName, period) {
  let text = `## ${memberName}の${period}サマリー\n\n`;
  text += `合計: ${summary.totalHours}h (${summary.workDays}日, 平均${summary.avgHoursPerDay.toFixed(1)}h/日)\n\n`;

  if (summary.comparison.changePercent !== null) {
    const sign = summary.comparison.changePercent > 0 ? '+' : '';
    text += `前期比: ${sign}${summary.comparison.changePercent}%\n\n`;
  }

  text += `### 工程別\n`;
  const sortedProcesses = Object.entries(summary.byProcess)
    .sort((a, b) => b[1] - a[1]);
  for (const [process, hours] of sortedProcesses) {
    const pct = (hours / summary.totalHours * 100).toFixed(0);
    text += `- ${process}: ${hours}h (${pct}%)\n`;
  }

  text += `\n### タスク別（上位5件）\n`;
  const sortedTasks = Object.entries(summary.byTask)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [task, hours] of sortedTasks) {
    text += `- ${task}: ${hours}h\n`;
  }

  return text;
}
```

##### UI変更
```
レポートタブに新セクション追加:
┌─ 📋 期間サマリー ────────────────────────────────┐
│                                                   │
│ メンバー: [森 ▼]  期間: [今週 ▼] [カスタム...]      │
│                                                   │
│ ┌─────────────────────────────────────────────┐  │
│ │ 合計: 38.5h (5日, 平均7.7h/日)               │  │
│ │ 前週比: +3.5h (+10.0%)                       │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ 工程別:                     タスク別（上位）:       │
│ ┌───────────┐              1. ログイン画面 15h    │
│ │    PG     │              2. API設計    12h      │
│ │   45%     │              3. テスト      8h      │
│ │  UI 25%   │              4. 会議       3.5h    │
│ │  PT 20%   │                                     │
│ │  他 10%   │                                     │
│ └───────────┘                                     │
│                                                   │
│ [テキストでコピー] [PDF出力]                        │
└───────────────────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/report.js` | generatePeriodSummary(), formatSummaryAsText() |
| `js/ui.js` | サマリーセクションのレンダリング |
| `index.html` | サマリーコンテナのHTML |
| `style.css` | サマリーカード、円グラフのスタイル |

##### 実装ステップ
1. サマリー集計ロジック
2. 前期比較の計算
3. サマリーUIの構築（カード + 簡易円グラフ）
4. 期間プリセット（今週/先週/今月/先月/カスタム）
5. テキスト形式でのクリップボードコピー
6. 簡易円グラフの描画（SVGまたはCanvas）

##### 工数見積
- 中（2-3日）

---

### 21-2. 見積精度のトラッキング

#### 提案内容
- 個人/チームの見積精度を時系列で追跡
- 精度向上の可視化（「月を追うごとに改善している」）

#### 実装方針

```javascript
/**
 * 見積精度の計算
 * 精度 = 1 - |見積 - 実績| / 見積
 * 100%: 完全一致、0%: 大幅な乖離
 */
function calculateAccuracyTrend(member, months = 6) {
  const results = [];

  for (let i = 0; i < months; i++) {
    const month = subtractMonths(getCurrentMonth(), i);
    const monthEstimates = getEstimates().filter(e =>
      e.member === member &&
      e.workMonths?.includes(month)
    );

    const monthActuals = getActuals().filter(a =>
      a.member === member &&
      a.date.startsWith(month)
    );

    if (monthEstimates.length === 0) continue;

    const totalEstimate = monthEstimates.reduce((s, e) => s + e.hours, 0);
    const totalActual = monthActuals.reduce((s, a) => s + a.hours, 0);
    const accuracy = Math.max(0, 1 - Math.abs(totalEstimate - totalActual) / totalEstimate);

    results.push({ month, accuracy: accuracy * 100, estimate: totalEstimate, actual: totalActual });
  }

  return results.reverse();  // 古い順
}
```

##### 工数見積
- 中（2日）

---

### 21-3. 異常検知のインサイト

#### 提案内容
- 「先月より会議時間が30%増加」のような自動的な気づき
- 工数配分の急変を検出してハイライト

#### 実装方針

```javascript
/**
 * インサイトの自動生成
 */
function generateInsights(member, currentMonth) {
  const insights = [];
  const prevMonth = subtractMonths(currentMonth, 1);

  const current = getMonthSummary(member, currentMonth);
  const previous = getMonthSummary(member, prevMonth);

  // 工程別の変化を検出
  for (const process of Object.keys(current.byProcess)) {
    const cur = current.byProcess[process] || 0;
    const prev = previous.byProcess[process] || 0;

    if (prev > 0) {
      const change = (cur - prev) / prev * 100;
      if (Math.abs(change) > 30) {
        insights.push({
          type: change > 0 ? 'increase' : 'decrease',
          message: `${process}の工数が前月比${change > 0 ? '+' : ''}${change.toFixed(0)}%`,
          severity: Math.abs(change) > 50 ? 'warning' : 'info'
        });
      }
    }
  }

  // 残業検出（8h超の日が多い）
  const longDays = Object.values(current.byDate).filter(h => h > 8).length;
  if (longDays >= 5) {
    insights.push({
      type: 'overtime',
      message: `今月${longDays}日で8時間を超えています`,
      severity: 'warning'
    });
  }

  return insights;
}
```

##### 工数見積
- 中（2日）

---

## 22. 多プロジェクト対応

### 22-1. プロジェクト切替

#### 現状の課題
- アプリケーション全体が単一プロジェクト前提
- 複数プロジェクトに参加しているメンバーは、プロジェクトごとに別のブラウザ/プロファイルを使う必要がある
- プロジェクト横断での工数分析ができない

#### 提案内容
- localStorageのネームスペース化によるプロジェクト分離
- プロジェクト切替UI
- 横断レポート

#### 実装方針

```javascript
// js/project-manager.js（新規）

/**
 * プロジェクトのデータモデル
 */
const projectMeta = {
  projects: [
    {
      id: 'proj_001',
      name: 'Webリニューアル',
      prefix: 'web_',           // localStorageキーのプレフィックス
      color: '#2D5A27',
      createdAt: '2026-01-01',
      isActive: true
    },
    {
      id: 'proj_002',
      name: '社内ツール開発',
      prefix: 'tool_',
      color: '#1D6FA5',
      createdAt: '2026-03-01',
      isActive: true
    }
  ],
  activeProjectId: 'proj_001'
};

/**
 * プロジェクト切替
 * localStorageのキープレフィックスを変更
 */
function switchProject(projectId) {
  const project = projectMeta.projects.find(p => p.id === projectId);
  if (!project) return;

  // 現在のプロジェクトのデータを保存
  saveCurrentProjectData();

  // プレフィックスを切替
  projectMeta.activeProjectId = projectId;
  localStorage.setItem('manhour_project_meta', JSON.stringify(projectMeta));

  // 新プロジェクトのデータを読込
  loadProjectData(project.prefix);

  // UIを再描画
  refreshAllViews();
}

/**
 * ストレージキーのプレフィックス付与
 */
function getStorageKey(baseKey) {
  const project = projectMeta.projects.find(
    p => p.id === projectMeta.activeProjectId
  );
  return `manhour_${project.prefix}${baseKey}`;
}
```

##### UI変更
```
ヘッダー左:
┌──────────────────────────────────────────────┐
│ [🟢 Webリニューアル ▼]  工数管理               │
│ ┌────────────────────────┐                    │
│ │ 🟢 Webリニューアル     │ ← アクティブ        │
│ │ 🔵 社内ツール開発      │                     │
│ │ ─────────────────────  │                     │
│ │ ⊕ プロジェクトを追加   │                     │
│ │ ⚙ プロジェクト管理     │                     │
│ └────────────────────────┘                    │
└──────────────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/project-manager.js` | 新規: プロジェクト管理 |
| `js/storage.js` | キープレフィックスの動的切替 |
| `js/ui.js` | プロジェクト切替UI |
| `js/state.js` | アクティブプロジェクト状態 |
| `index.html` | プロジェクトセレクター |
| `style.css` | プロジェクトセレクタースタイル |

##### 実装ステップ
1. プロジェクトメタデータの管理
2. ストレージキーのプレフィックス化
3. プロジェクト切替処理
4. プロジェクト選択UIの構築
5. プロジェクト追加/削除/編集モーダル
6. バックアップ/リストアのプロジェクト対応

##### 工数見積
- 大〜特大（5-7日）

---

### 22-2. 横断レポート

#### 提案内容
- 全プロジェクトの工数合計を一覧表示
- プロジェクト間のリソース配分を可視化

#### 実装方針

```javascript
/**
 * 横断レポートの生成
 * 全プロジェクトのデータを統合して集計
 */
function generateCrossProjectReport(month) {
  const report = [];

  for (const project of projectMeta.projects) {
    const actuals = loadProjectActuals(project.prefix);
    const monthActuals = actuals.filter(a => a.date.startsWith(month));
    const totalHours = monthActuals.reduce((s, a) => s + a.hours, 0);

    report.push({
      projectName: project.name,
      projectColor: project.color,
      totalHours,
      memberBreakdown: groupByMember(monthActuals)
    });
  }

  return report;
}
```

##### 工数見積
- 中（2-3日、プロジェクト切替が前提）

---

### 22-3. 工数按分

#### 提案内容
- 1日の中で複数プロジェクトに時間配分した場合の入力支援
- 「今日は8時間のうち、5時間をWeb、3時間をツール」のような入力

#### 実装方針

```
クイック入力:
┌─────────────────────────────────────────┐
│ 📅 2026-04-14 (月) 合計: 8.0h           │
│                                         │
│ 🟢 Webリニューアル:  5.0h  ████████░░   │
│ 🔵 社内ツール開発:   3.0h  ██████░░░░   │
│                                         │
│ [プロジェクトごとに詳細入力 →]             │
└─────────────────────────────────────────┘
```

##### 工数見積
- 中（2日、プロジェクト切替が前提）

---

## まとめ

| # | 改善 | 優先度 | 工数 | 依存関係 |
|---|------|--------|------|----------|
| 20-1 | 未入力日ハイライト | 最高 | 小〜中 | なし |
| 20-2 | 入力締め切り | 中 | 小 | なし |
| 20-3 | 入力率ダッシュボード | 中 | 中 | なし |
| 20-4 | リマインダー通知 | 低 | 小 | PWA化が前提 |
| 21-1 | 週次/月次サマリー | 高 | 中 | なし |
| 21-2 | 見積精度トラッキング | 中 | 中 | なし |
| 21-3 | 異常検知インサイト | 中 | 中 | なし |
| 22-1 | プロジェクト切替 | 低 | 大〜特大 | ストレージ改修 |
| 22-2 | 横断レポート | 低 | 中 | 22-1が前提 |
| 22-3 | 工数按分 | 低 | 中 | 22-1が前提 |
