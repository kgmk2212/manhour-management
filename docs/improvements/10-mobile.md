# J. モバイル体験 設計書

> **カテゴリ**: モバイル固有の改善
> **改善数**: 5件
> **優先度**: 中
> **関連ファイル**: style.css, js/ui.js, js/actual-timeline.js, js/schedule-render.js

---

## 28. モバイル固有の改善

### 28-1. スワイプ操作の拡充

#### 現状の課題
- スワイプ操作はタブ切替（左右100px以上）のみ対応
- カレンダーの月移動、日付の前後移動がボタンタップのみ
- ガントチャートの横スクロールがスムーズでない場面がある

#### 提案内容
- カレンダービュー: 左右スワイプで月移動
- 実績入力: 左右スワイプで日付移動
- リスト項目: 左スワイプで削除、右スワイプで編集
- タイムラインビュー: ピンチで拡大/縮小

#### 実装方針

```javascript
/**
 * スワイプジェスチャーマネージャー
 * 方向検出、距離閾値、コールバック管理
 */
class SwipeManager {
  constructor(element, options = {}) {
    this.element = element;
    this.threshold = options.threshold || 50;  // px
    this.maxVertical = options.maxVertical || 80;  // 垂直方向の許容範囲
    this.onSwipeLeft = options.onSwipeLeft || null;
    this.onSwipeRight = options.onSwipeRight || null;
    this.onSwipeUp = options.onSwipeUp || null;
    this.onSwipeDown = options.onSwipeDown || null;

    this.startX = 0;
    this.startY = 0;
    this.startTime = 0;

    this.element.addEventListener('touchstart', (e) => this.handleStart(e), { passive: true });
    this.element.addEventListener('touchend', (e) => this.handleEnd(e), { passive: true });
  }

  handleStart(e) {
    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTime = Date.now();
  }

  handleEnd(e) {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;
    const dt = Date.now() - this.startTime;

    // タイムアウト（500ms以上はスワイプとみなさない）
    if (dt > 500) return;

    // 水平スワイプ（垂直方向の移動が閾値以内）
    if (Math.abs(dx) > this.threshold && Math.abs(dy) < this.maxVertical) {
      if (dx > 0 && this.onSwipeRight) {
        this.onSwipeRight(dx);
      } else if (dx < 0 && this.onSwipeLeft) {
        this.onSwipeLeft(Math.abs(dx));
      }
    }

    // 垂直スワイプ
    if (Math.abs(dy) > this.threshold && Math.abs(dx) < this.maxVertical) {
      if (dy > 0 && this.onSwipeDown) {
        this.onSwipeDown(dy);
      } else if (dy < 0 && this.onSwipeUp) {
        this.onSwipeUp(Math.abs(dy));
      }
    }
  }

  destroy() {
    // イベントリスナーのクリーンアップ
    this.element.removeEventListener('touchstart', this.handleStart);
    this.element.removeEventListener('touchend', this.handleEnd);
  }
}
```

##### 適用例
```javascript
// カレンダービューの月移動
const calendarSwipe = new SwipeManager(
  document.getElementById('calendar-container'),
  {
    onSwipeLeft: () => navigateMonth(1),    // 次月
    onSwipeRight: () => navigateMonth(-1),  // 前月
    threshold: 80  // 誤操作防止で閾値を上げる
  }
);

// リスト項目のスワイプ操作
function initListItemSwipe(listItem) {
  let translateX = 0;

  listItem.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - startX;
    translateX = Math.max(-100, Math.min(100, dx));
    listItem.style.transform = `translateX(${translateX}px)`;

    // 背景アクションの表示
    if (translateX < -50) {
      listItem.querySelector('.action-delete').classList.add('visible');
    }
    if (translateX > 50) {
      listItem.querySelector('.action-edit').classList.add('visible');
    }
  }, { passive: true });
}
```

##### UI変更（スワイプ削除）
```
通常表示:
┌──────────────────────────────────────┐
│ 4/14 │ v2.0 │ ログイン │ PG │ 3.0h  │
└──────────────────────────────────────┘

← 左スワイプ時:
┌──────────────────────────────────────┐
│ 4/14 │ v2.0 │ ログイン │ PG │ 3.0h  │▓▓▓▓ 削除 ▓▓▓▓│
└──────────────────────────────────────┘
                                        ↑ 赤背景の削除ボタン

→ 右スワイプ時:
│▒▒▒ 編集 ▒▒▒│ 4/14 │ v2.0 │ ログイン │ PG │ 3.0h │
              ↑ 青背景の編集ボタン
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/swipe-manager.js` | 新規: スワイプジェスチャーマネージャー |
| `js/ui.js` | カレンダー・リストへのスワイプ適用 |
| `js/actual.js` | スワイプ削除/編集の処理 |
| `style.css` | スワイプアクション背景、アニメーション |

##### 実装ステップ
1. SwipeManagerクラスの作成
2. カレンダービューの月スワイプ
3. 実績入力の日付スワイプ
4. リスト項目のスワイプ操作（削除/編集）
5. スワイプアニメーション（スナップバック、アクション確定）
6. デスクトップでのスワイプ無効化（touchイベントのみ）

##### 工数見積
- 中（2-3日）

---

### 28-2. タイムトラッカー（ストップウォッチ）

#### 現状の課題
- 作業時間を手入力する必要がある
- 実際の作業時間と入力値にズレが生じやすい
- 複数タスクを行き来する場合の時間配分が曖昧

#### 提案内容
- 作業開始/停止のストップウォッチ機能
- タスクに紐づけて計時
- 計測結果を実績として自動入力

#### 実装方針

```javascript
/**
 * タイムトラッカー
 */
class TimeTracker {
  constructor() {
    this.sessions = [];     // 計測セッション
    this.activeSession = null;
  }

  /**
   * 計測開始
   */
  start(taskInfo) {
    if (this.activeSession) {
      this.pause();  // 既存セッションを一時停止
    }

    this.activeSession = {
      id: `track_${Date.now()}`,
      version: taskInfo.version,
      task: taskInfo.task,
      process: taskInfo.process,
      member: taskInfo.member,
      startTime: new Date(),
      pausedDuration: 0,     // 一時停止中の累計秒数
      intervals: [{ start: new Date(), end: null }],
      status: 'running'
    };

    this.sessions.push(this.activeSession);
    this.save();
  }

  /**
   * 一時停止
   */
  pause() {
    if (!this.activeSession || this.activeSession.status !== 'running') return;

    const currentInterval = this.activeSession.intervals[
      this.activeSession.intervals.length - 1
    ];
    currentInterval.end = new Date();
    this.activeSession.status = 'paused';
    this.save();
  }

  /**
   * 再開
   */
  resume() {
    if (!this.activeSession || this.activeSession.status !== 'paused') return;

    this.activeSession.intervals.push({ start: new Date(), end: null });
    this.activeSession.status = 'running';
    this.save();
  }

  /**
   * 停止 → 実績に変換
   */
  stop() {
    if (!this.activeSession) return null;

    if (this.activeSession.status === 'running') {
      this.pause();
    }

    const totalMs = this.activeSession.intervals.reduce((sum, interval) => {
      const end = interval.end || new Date();
      return sum + (end - interval.start);
    }, 0);

    const totalHours = Math.round(totalMs / 3600000 * 10) / 10;  // 0.1h単位

    const actual = {
      date: new Date().toISOString().slice(0, 10),
      version: this.activeSession.version,
      task: this.activeSession.task,
      process: this.activeSession.process,
      member: this.activeSession.member,
      hours: totalHours
    };

    this.activeSession.status = 'completed';
    this.activeSession = null;
    this.save();

    return actual;
  }

  /**
   * 経過時間の取得（表示用）
   */
  getElapsed() {
    if (!this.activeSession) return 0;

    return this.activeSession.intervals.reduce((sum, interval) => {
      const end = interval.end || new Date();
      return sum + (end - interval.start);
    }, 0);
  }

  /**
   * localStorage永続化
   */
  save() {
    localStorage.setItem('manhour_tracker', JSON.stringify({
      sessions: this.sessions,
      activeSessionId: this.activeSession?.id || null
    }));
  }

  /**
   * 復元（ブラウザ再起動後）
   */
  restore() {
    const saved = localStorage.getItem('manhour_tracker');
    if (!saved) return;

    const data = JSON.parse(saved);
    this.sessions = data.sessions.map(s => ({
      ...s,
      startTime: new Date(s.startTime),
      intervals: s.intervals.map(i => ({
        start: new Date(i.start),
        end: i.end ? new Date(i.end) : null
      }))
    }));

    if (data.activeSessionId) {
      this.activeSession = this.sessions.find(s => s.id === data.activeSessionId);
    }
  }
}
```

##### UI変更
```
モバイルヘッダーに常時表示（計測中）:
┌─────────────────────────────────────┐
│ 🔴 02:34:12  ログイン/PG            │
│           [⏸ 一時停止] [⏹ 停止]      │
└─────────────────────────────────────┘

クイック入力タブ:
┌─────────────────────────────────────┐
│ ⏱ タイムトラッカー                    │
│                                     │
│ タスク: [v2.0/ログイン画面 ▼]         │
│ 工程:   [PG ▼]                      │
│                                     │
│        ┌───────────┐               │
│        │  00:00:00  │               │
│        └───────────┘               │
│                                     │
│    [▶ 開始]  [⏸ 一時停止]  [⏹ 停止] │
│                                     │
│ ── 今日の計測履歴 ──                 │
│ ✓ ログイン/PG  2.5h (10:00-12:30)  │
│ ✓ API/UI      1.0h (13:00-14:00)   │
│ 🔴 テスト/PT   計測中 (14:30-)      │
└─────────────────────────────────────┘
```

##### 影響ファイル
| ファイル | 変更内容 |
|---------|---------|
| `js/time-tracker.js` | 新規: タイムトラッカークラス |
| `js/ui.js` | トラッカーUI、ヘッダーのタイマー表示 |
| `js/actual.js` | 計測結果→実績変換処理 |
| `index.html` | トラッカーUI要素 |
| `style.css` | タイマー表示、ボタンスタイル |

##### 実装ステップ
1. TimeTrackerクラスの作成
2. クイック入力タブにトラッカーセクション追加
3. タイマー表示の1秒更新（requestAnimationFrame or setInterval）
4. 開始/一時停止/停止ボタンの処理
5. 停止時の実績自動入力（確認ダイアログ）
6. ヘッダーのミニタイマー表示（計測中のみ）
7. ブラウザ再起動後の復元
8. バックグラウンド計測の対応（Page Visibility API）

##### 技術的考慮事項
- ブラウザのバックグラウンドタブでのsetIntervalの制限
- ページリロード時のデータ復元
- バッテリー消費への配慮（表示更新頻度の調整）
- 深夜をまたぐ計測（日付切替の処理）

##### 工数見積
- 中〜大（3-4日）

---

### 28-3. プルトゥリフレッシュ

#### 提案内容
- 画面上部からの下スワイプでデータの再読み込み
- PWA化後のキャッシュ更新トリガー

#### 実装方針

```javascript
/**
 * プルトゥリフレッシュ
 */
function initPullToRefresh(container, onRefresh) {
  let startY = 0;
  let pulling = false;
  const threshold = 80;  // px

  const indicator = document.createElement('div');
  indicator.className = 'pull-indicator';
  indicator.textContent = '↓ 引っ張って更新';
  container.prepend(indicator);

  container.addEventListener('touchstart', (e) => {
    if (container.scrollTop === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;

    if (dy > 0 && dy < 150) {
      indicator.style.height = `${Math.min(dy, threshold)}px`;
      indicator.style.opacity = Math.min(dy / threshold, 1);

      if (dy > threshold) {
        indicator.textContent = '↑ 離して更新';
      } else {
        indicator.textContent = '↓ 引っ張って更新';
      }
    }
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;

    const height = parseInt(indicator.style.height);
    if (height >= threshold) {
      indicator.textContent = '更新中...';
      onRefresh().then(() => {
        indicator.style.height = '0px';
        indicator.style.opacity = '0';
      });
    } else {
      indicator.style.height = '0px';
      indicator.style.opacity = '0';
    }
  }, { passive: true });
}
```

##### 工数見積
- 小（1日）

---

### 28-4. オフラインキュー

#### 提案内容
- ネットワーク切断中の操作をキューに保存
- 復帰時に自動同期（将来のサーバーサイド連携用）
- 現時点ではPWA化のオフラインキャッシュとして機能

#### 実装方針

```javascript
/**
 * オフラインキュー
 * 操作をキューに蓄積し、オンライン復帰時に実行
 */
class OfflineQueue {
  constructor() {
    this.queue = this.load();
  }

  enqueue(operation) {
    this.queue.push({
      id: `op_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operation,
      status: 'pending'
    });
    this.save();
  }

  async processQueue() {
    for (const item of this.queue) {
      if (item.status === 'pending') {
        try {
          await this.execute(item.operation);
          item.status = 'completed';
        } catch (e) {
          item.status = 'failed';
          item.error = e.message;
        }
      }
    }

    // 完了した操作を削除
    this.queue = this.queue.filter(item => item.status === 'pending');
    this.save();
  }

  save() {
    localStorage.setItem('manhour_offline_queue', JSON.stringify(this.queue));
  }

  load() {
    const saved = localStorage.getItem('manhour_offline_queue');
    return saved ? JSON.parse(saved) : [];
  }
}

// オンライン復帰時に自動処理
window.addEventListener('online', () => {
  offlineQueue.processQueue();
  showToast('オンラインに復帰しました。データを同期中...');
});
```

##### 工数見積
- 中（2日、サーバー連携なしの場合）

---

### 28-5. モバイル版のホーム画面ウィジェット（将来構想）

#### 提案内容
- ホーム画面に配置できる小さなウィジェット
- 今日の工数合計、未入力ステータスの表示
- PWA + Web App Manifest拡張が必要

#### 前提
- Widget API（iOS/Android）はまだ標準化されていない
- PWAの範囲ではプッシュ通知が最大限
- ネイティブアプリ化時に実現可能

##### 工数見積
- 実現困難（ネイティブアプリが必要）

---

## まとめ

| # | 改善 | 優先度 | 工数 | 効果 |
|---|------|--------|------|------|
| 28-1 | スワイプ操作拡充 | 高 | 中 | モバイル操作性の大幅向上 |
| 28-2 | タイムトラッカー | 高 | 中〜大 | 正確な工数把握 |
| 28-3 | プルトゥリフレッシュ | 低 | 小 | モバイル慣習への対応 |
| 28-4 | オフラインキュー | 低 | 中 | 接続不安定環境への対応 |
| 28-5 | ホーム画面ウィジェット | 低 | 実現困難 | 将来構想として記録 |

### モバイル改善の推奨順序
```
1. スワイプ操作拡充（操作性の底上げ）
2. タイムトラッカー（データ品質の改善）
3. プルトゥリフレッシュ（PWA化後）
4. オフラインキュー（サーバー連携時）
```
