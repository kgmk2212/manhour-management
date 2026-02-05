// ============================================
// UI操作・DOM操作
// ============================================

import {
    estimates, actuals,
    showMonthColorsSetting, reportMatrixBgColorMode,
    showProgressBarsSetting, showProgressPercentageSetting,
    progressBarStyle, matrixEstActFormat,
    memberOrder, setMemberOrder, debugModeEnabled,
    estimateFilterState, reportFilterState,
    setEstimateFilterState, setReportFilterState
} from './state.js';
import { normalizeEstimate, sortMembers, enableDragScroll } from './utils.js';

// タブの順序を定義
const TAB_ORDER = ['quick', 'report', 'estimate', 'actual', 'settings'];

// ============================================
// スクロール比率ユーティリティ（表内相対位置）
// ============================================

/**
 * 表の中での現在のスクロール位置の比率を計算
 * 表の先頭が画面上部にある時を0%、表の末尾が画面下部にある時を100%とする
 * @param {HTMLElement} tableElement - 対象の表要素（estimateList, reportDetailViewなど）
 * @returns {number|null} - スクロール比率（0〜1）、または null
 */
function getTableScrollRatio(tableElement) {
    if (!tableElement) return null;

    // ドキュメント座標系で表の絶対位置を取得（offsetTopはoffsetParent相対なので不適切）
    const tableRect = tableElement.getBoundingClientRect();
    const tableTop = tableRect.top + window.scrollY;
    const tableHeight = tableElement.offsetHeight;
    const viewportHeight = window.innerHeight;

    // 表が画面より小さい場合は比率計算不要
    if (tableHeight <= viewportHeight) return 0;

    // 表の先頭から現在のビューポート位置までの距離
    const scrolledIntoTable = window.scrollY - tableTop;

    // 表内でスクロール可能な最大距離（表の高さ - ビューポートの高さ）
    const maxScrollInTable = tableHeight - viewportHeight;

    // 比率を計算（0〜1の範囲にクランプ）
    const ratio = Math.max(0, Math.min(1, scrolledIntoTable / maxScrollInTable));

    return ratio;
}

/**
 * 表の中での相対位置を復元
 * フィルタ変更などで表のサイズが変わっても、相対的な位置を維持する
 * @param {HTMLElement} tableElement - 対象の表要素
 * @param {number|null} ratio - 復元する比率（0〜1）
 */
function restoreTableScrollRatio(tableElement, ratio) {
    if (!tableElement || ratio === null || ratio === undefined) return;

    // レンダリング完了を待ってから復元
    requestAnimationFrame(() => {
        // ドキュメント座標系で表の絶対位置を取得
        const tableRect = tableElement.getBoundingClientRect();
        const tableTop = tableRect.top + window.scrollY;
        const tableHeight = tableElement.offsetHeight;
        const viewportHeight = window.innerHeight;

        // 表が画面より小さい場合は表の先頭に移動
        if (tableHeight <= viewportHeight) {
            window.scrollTo(0, tableTop);
            return;
        }

        // 新しい表のサイズでスクロール可能な最大距離
        const maxScrollInTable = tableHeight - viewportHeight;

        // 比率を適用して新しいスクロール位置を計算
        const newScrollY = tableTop + (ratio * maxScrollInTable);

        // 表の範囲内に収まるようにクランプ
        const clampedScrollY = Math.max(tableTop, Math.min(newScrollY, tableTop + maxScrollInTable));

        window.scrollTo(0, clampedScrollY);
    });
}

// ============================================
// タブ操作
// ============================================

// タブ切り替え中かどうかのフラグ
let isTabSwitching = false;
// タブエリア操作中かどうかのフラグ（フィルタボタンクリック時など）
// window オブジェクトで共有（tab-filter.js からも設定される）
window.isTabInteracting = false;

export function showTab(tabName, options = {}) {
    const { skipAnimation = false } = options;
    isTabSwitching = true;

    // 現在アクティブなタブのスクロール位置を保存
    if (typeof window.tabScrollPositions === 'undefined') {
        window.tabScrollPositions = {};
    }
    const currentActiveTab = document.querySelector('.tab-content.active');
    let currentTabId = null;
    if (currentActiveTab && currentActiveTab.id) {
        currentTabId = currentActiveTab.id;
        window.tabScrollPositions[currentActiveTab.id] = window.scrollY;
    }

    // アニメーション方向の決定（skipAnimation時はスキップ）
    let animationClassOut = '';
    let animationClassIn = '';

    if (!skipAnimation && currentTabId && currentTabId !== tabName) {
        const currentIndex = TAB_ORDER.indexOf(currentTabId);
        const nextIndex = TAB_ORDER.indexOf(tabName);

        if (currentIndex !== -1 && nextIndex !== -1 && window.innerWidth <= 768) {
            if (nextIndex > currentIndex) {
                // 次へ（右へ進む）：現在は左へ消え、次は右から来る
                animationClassOut = 'anim-slide-out-left';
                animationClassIn = 'anim-slide-in-right';
            } else {
                // 前へ（左へ戻る）：現在は右へ消え、次は左から来る
                animationClassOut = 'anim-slide-out-right';
                animationClassIn = 'anim-slide-in-left';
            }
        }
    }



    // アニメーションクラスの適用（退出側）
    if (animationClassOut && currentActiveTab) {
        currentActiveTab.classList.add('anim-leaving', animationClassOut);
    }

    // 早期適用の属性を削除（一度動作したら不要）
    document.documentElement.removeAttribute('data-early-tab');
    document.documentElement.removeAttribute('data-early-theme');

    // 全タブからactiveクラスとテーマクラスを削除
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        // テーマクラスを削除
        const classes = Array.from(t.classList);
        classes.forEach(cls => {
            if (cls.startsWith('theme-') || cls.startsWith('pattern-') || cls.startsWith('tab-theme-')) {
                t.classList.remove(cls);
            }
        });
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    // 対象のタブボタンを見つけてactiveクラスを追加
    const targetTabBtn = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (targetTabBtn) {
        targetTabBtn.classList.add('active');
    }

    // タブインジケーターを更新（スワイプ完了時はアニメーションなし）
    updateTabIndicator(tabName, !skipAnimation);

    // タブボタンを画面内にスクロール（モバイルのみ、スタイル適用後に実行）
    if (targetTabBtn && window.innerWidth <= 768) {
        requestAnimationFrame(() => {
            scrollTabButtonIntoView(targetTabBtn);
        });
    }

    // タブコンテンツを表示
    const tabContent = document.getElementById(tabName);
    if (tabContent) {
        tabContent.classList.add('active');

        // アニメーションクラスの適用（進入側）
        if (animationClassIn) {
            tabContent.classList.add('anim-entering', animationClassIn);

            // アニメーション終了後のクリーンアップ
            setTimeout(() => {
                // 退出側のクラス削除
                if (currentActiveTab) {
                    currentActiveTab.classList.remove('anim-leaving', animationClassOut);
                }
                // 進入側のクラス削除
                tabContent.classList.remove('anim-entering', animationClassIn);
            }, 300); // CSSのアニメーション時間(0.3s)に合わせる
        }
    }

    // アクティブタブにテーマを適用（window経由）
    if (typeof window.updateThemeElements === 'function') {
        window.updateThemeElements();
    }

    // 見積一覧タブまたはレポートタブの場合、デフォルト表示形式を適用
    if (tabName === 'estimate') {
        if (typeof window.applyDefaultEstimateViewType === 'function') {
            window.applyDefaultEstimateViewType();
        }
        // フローティングフィルタボタンを表示
        if (typeof window.showFloatingFilterButton === 'function') {
            window.showFloatingFilterButton();
        }
        // フローティングパネルの状態を同期
        if (typeof window.syncFloatingEstimateFilters === 'function') {
            window.syncFloatingEstimateFilters();
        }
    } else if (tabName === 'report') {
        if (typeof window.applyDefaultReportViewType === 'function') {
            window.applyDefaultReportViewType();
        }
        // レポートタブを開いた時は常にupdateReport()を呼び出してグラフを更新
        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
        // フローティングフィルタボタンを表示
        if (typeof window.showFloatingFilterButton === 'function') {
            window.showFloatingFilterButton();
        }
        // フローティングパネルの状態を同期
        if (typeof window.syncFloatingFilters === 'function') {
            window.syncFloatingFilters();
        }
    } else if (tabName === 'actual') {
        // フローティングフィルタボタンを表示
        if (typeof window.showFloatingFilterButton === 'function') {
            window.showFloatingFilterButton();
        }
        // フローティングパネルの状態を同期
        if (typeof window.syncFloatingActualFilters === 'function') {
            window.syncFloatingActualFilters();
        }
    } else {
        // 見積・レポート・実績タブ以外ではフローティングフィルタボタンを非表示
        if (typeof window.hideFloatingFilterButton === 'function') {
            window.hideFloatingFilterButton();
        }
    }

    // 現在のタブをlocalStorageに保存（リロード時に復元用）
    try {
        localStorage.setItem('manhour_currentTab', tabName);
    } catch (e) {
        // localStorageエラーは無視
    }

    // スクロール位置の復元（保存されていれば）
    if (typeof window.tabScrollPositions === 'undefined') {
        window.tabScrollPositions = {};
    }

    // スクロール位置を復元
    const savedScrollY = window.tabScrollPositions[tabName] || 0;
    window.scrollTo(0, savedScrollY);

    // タブバーを表示状態に戻す（隠れていたら）
    const tabs = document.querySelector('.tabs');
    if (tabs) tabs.classList.remove('is-hidden');

    // タブ内フィルタドロワーを更新
    if (typeof window.onTabFilterChange === 'function') {
        window.onTabFilterChange(tabName);
    }

    // 少し待ってからフラグを解除（スクロールイベントの発生を待つ）
    setTimeout(() => {
        isTabSwitching = false;
        // スクロール追跡用の変数もリセット（SmartSticky側で参照できないため、ここで何かする必要があるか？
        // initSmartSticky内のlastScrollYはずれている可能性がある。
        // しかし、initSmartStickyはクロージャなので外からアクセスできない。
        // なので、initSmartSticky内で isTabSwitching を監視させる。
    }, 300);
}

export function nextTab() {
    const currentIndex = TAB_ORDER.findIndex(tab =>
        document.getElementById(tab).classList.contains('active')
    );
    if (currentIndex !== -1 && currentIndex < TAB_ORDER.length - 1) {
        showTab(TAB_ORDER[currentIndex + 1]);
    }
}

export function prevTab() {
    const currentIndex = TAB_ORDER.findIndex(tab =>
        document.getElementById(tab).classList.contains('active')
    );
    if (currentIndex > 0) {
        showTab(TAB_ORDER[currentIndex - 1]);
    }
}

// ============================================
// タブインジケーター（スライドアニメーション）
// ============================================

let tabIndicator = null;
let tabResizeObserver = null;
let lastIndicatorPosition = { width: 0, left: 0 };

/**
 * タブインジケーターを初期化
 */
export function initTabIndicator() {
    if (window.innerWidth > 768) return;  // モバイルのみ

    const tabButtonsArea = document.querySelector('.tabs .tab-buttons-area');
    if (!tabButtonsArea) return;

    // 既存のResizeObserverを解除
    if (tabResizeObserver) {
        tabResizeObserver.disconnect();
        tabResizeObserver = null;
    }

    // 位置キャッシュをリセット（新しい初期化で確実に更新されるように）
    lastIndicatorPosition = { width: 0, left: 0 };

    // 保存されたタブを取得（初期位置を正確に設定するため）
    let savedTab = 'quick';
    try {
        const stored = localStorage.getItem('manhour_currentTab');
        if (stored && ['quick', 'estimate', 'actual', 'report', 'settings'].includes(stored)) {
            savedTab = stored;
        }
    } catch (e) {
        // localStorageエラーは無視
    }

    // 既存のインジケーターがあれば再利用、なければ作成
    const existing = tabButtonsArea.querySelector('.tab-indicator');
    if (existing) {
        tabIndicator = existing;
    } else {
        tabIndicator = document.createElement('div');
        tabIndicator.className = 'tab-indicator';
        tabButtonsArea.appendChild(tabIndicator);
    }

    // ResizeObserverでタブボタンのサイズ変更を監視
    tabResizeObserver = new ResizeObserver(() => {
        // readyクラスが付いている場合のみ更新（フォントロード完了後）
        if (tabIndicator.classList.contains('ready')) {
            updateTabIndicatorImmediate();
        }
    });

    // 全てのタブボタンを監視
    const tabButtons = tabButtonsArea.querySelectorAll('.tab');
    tabButtons.forEach(tab => tabResizeObserver.observe(tab));

    // リサイズ時に再計算
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 768) {
            updateTabIndicator();
        }
    });

    // 注意: 初期位置はshowTab()内のupdateTabIndicator()で設定される
    // フォントロードの待機もupdateTabIndicator()内で行う
}

/**
 * タブインジケーターの位置を即座に更新（ResizeObserverから呼ばれる）
 * @param {boolean} [animate=false] - アニメーションするか
 */
function updateTabIndicatorImmediate(animate = false) {
    if (!tabIndicator || window.innerWidth > 768) return;

    // タブ切り替え中はResizeObserverからの更新をスキップ
    // （showTab内のupdateTabIndicatorで正しくアニメーションさせるため）
    if (isTabSwitching) return;

    const tabButtonsArea = document.querySelector('.tabs .tab-buttons-area');
    if (!tabButtonsArea) return;

    // 早期タブ適用中は、data-early-tab属性のタブを優先
    const earlyTab = document.documentElement.dataset.earlyTab;
    let targetTab;
    if (earlyTab) {
        targetTab = tabButtonsArea.querySelector(`.tab[data-tab="${earlyTab}"]`);
    }
    if (!targetTab) {
        targetTab = tabButtonsArea.querySelector('.tab.active');
    }
    if (!targetTab) return;

    // サブピクセル対応でwidthを取得
    const width = Math.ceil(targetTab.getBoundingClientRect().width);
    const height = targetTab.offsetHeight;
    const left = targetTab.offsetLeft;
    const top = targetTab.offsetTop;

    // サイズや位置が変わっていない場合はスキップ（無限ループ防止）
    if (lastIndicatorPosition.width === width && lastIndicatorPosition.left === left) {
        return;
    }
    lastIndicatorPosition = { width, left };

    // アニメーション制御
    if (!animate) {
        tabIndicator.classList.add('swiping');
    } else {
        tabIndicator.classList.remove('swiping');
    }

    // スタイルを適用
    tabIndicator.style.width = `${width}px`;
    tabIndicator.style.height = `${height}px`;
    tabIndicator.style.top = `${top}px`;
    tabIndicator.style.transform = `translateX(${left}px)`;

    // 次フレームでswipingクラスを外す（トランジションを有効に戻す）
    if (!animate) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                tabIndicator.classList.remove('swiping');
            });
        });
    }
}

/**
 * タブインジケーターの位置を更新
 * @param {string} [targetTabName] - 対象のタブ名（省略時はアクティブなタブ）
 * @param {boolean} [animate=true] - アニメーションするか
 */
export function updateTabIndicator(targetTabName, animate = true) {
    if (!tabIndicator || window.innerWidth > 768) return;

    // インジケーターの位置を更新する共通処理
    const applyPosition = (targetTab) => {
        // タブボタンの位置とサイズを取得（サブピクセル対応）
        const rect = targetTab.getBoundingClientRect();
        const width = Math.ceil(rect.width);
        const height = targetTab.offsetHeight;
        const left = targetTab.offsetLeft;
        const top = targetTab.offsetTop;

        // 位置を記録
        lastIndicatorPosition = { width, left };

        if (!animate) {
            // アニメーションなし: 即座に位置を設定
            tabIndicator.classList.add('swiping');
            tabIndicator.style.width = `${width}px`;
            tabIndicator.style.height = `${height}px`;
            tabIndicator.style.top = `${top}px`;
            tabIndicator.style.transform = `translateX(${left}px)`;
        } else {
            // アニメーションあり: 現在位置から確実にアニメーション
            // 1. 現在のtransformを読み取り（開始位置を確定）
            const currentTransform = getComputedStyle(tabIndicator).transform;
            // 2. トランジション無効のまま現在位置を明示的に設定
            tabIndicator.classList.add('swiping');
            tabIndicator.style.transition = '';
            tabIndicator.style.transform = currentTransform;
            // 3. 強制レイアウト（開始位置を確定）
            void tabIndicator.offsetWidth;
            // 4. トランジション有効化
            tabIndicator.classList.remove('swiping');
            // 5. 新しい位置を設定（アニメーション開始）
            tabIndicator.style.width = `${width}px`;
            tabIndicator.style.height = `${height}px`;
            tabIndicator.style.top = `${top}px`;
            tabIndicator.style.transform = `translateX(${left}px)`;
        }
    };

    // 対象タブを取得する共通処理
    const getTargetTab = () => {
        const tabButtonsArea = document.querySelector('.tabs .tab-buttons-area');
        if (!tabButtonsArea) return null;

        let targetTab;
        if (targetTabName) {
            targetTab = tabButtonsArea.querySelector(`.tab[data-tab="${targetTabName}"]`);
        } else {
            // 早期タブ適用中は、data-early-tab属性のタブを優先
            const earlyTab = document.documentElement.dataset.earlyTab;
            if (earlyTab) {
                targetTab = tabButtonsArea.querySelector(`.tab[data-tab="${earlyTab}"]`);
            }
            if (!targetTab) {
                targetTab = tabButtonsArea.querySelector('.tab.active');
            }
        }
        return targetTab;
    };

    // 既にreadyの場合（タブクリック時）は即座に更新
    if (tabIndicator.classList.contains('ready')) {
        const targetTab = getTargetTab();
        if (targetTab) {
            applyPosition(targetTab);
        }
        return;
    }

    // 初回表示用の遅延処理
    const doUpdate = () => {
        // 二重のrequestAnimationFrameでレイアウト確定を保証
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const targetTab = getTargetTab();
                if (!targetTab) return;

                applyPosition(targetTab);

                // 初回表示: readyクラスを追加して表示
                tabIndicator.classList.add('ready');
            });
        });
    };

    // readyクラスがない場合（初回）はレイアウトが安定するまで待つ
    if (!tabIndicator.classList.contains('ready')) {
        const MAX_WAIT_TIME = 300; // 最大待機時間(ms)
        const POLL_INTERVAL = 16;  // ポーリング間隔(ms) ≒ 1フレーム
        const STABLE_COUNT = 2;    // 安定と判断するための連続一致回数
        const startTime = Date.now();
        let stableCount = 0;
        let lastLeft = null;
        let lastWidth = null;

        const waitForStableLayout = () => {
            const elapsed = Date.now() - startTime;

            // 最大待機時間を超えたら強制的に位置を設定
            if (elapsed > MAX_WAIT_TIME) {
                doUpdate();
                return;
            }

            const tabButtonsArea = document.querySelector('.tabs .tab-buttons-area');
            if (!tabButtonsArea) {
                setTimeout(waitForStableLayout, POLL_INTERVAL);
                return;
            }

            let targetTab;
            if (targetTabName) {
                targetTab = tabButtonsArea.querySelector(`.tab[data-tab="${targetTabName}"]`);
            } else {
                const earlyTab = document.documentElement.dataset.earlyTab;
                if (earlyTab) {
                    targetTab = tabButtonsArea.querySelector(`.tab[data-tab="${earlyTab}"]`);
                }
                if (!targetTab) {
                    targetTab = tabButtonsArea.querySelector('.tab.active');
                }
            }

            if (!targetTab) {
                setTimeout(waitForStableLayout, POLL_INTERVAL);
                return;
            }

            // 現在のサイズを取得（サブピクセル対応）
            const currentLeft = targetTab.offsetLeft;
            const currentWidth = Math.ceil(targetTab.getBoundingClientRect().width);

            // 前回と同じ値なら安定カウントを増やす
            if (currentLeft === lastLeft && currentWidth === lastWidth) {
                stableCount++;
                if (stableCount >= STABLE_COUNT) {
                    // レイアウトが安定した
                    doUpdate();
                    return;
                }
            } else {
                // 値が変わったらカウントリセット
                stableCount = 0;
            }

            // 値を保存して再チェック
            lastLeft = currentLeft;
            lastWidth = currentWidth;
            setTimeout(waitForStableLayout, POLL_INTERVAL);
        };

        // フォントロード後、少し待ってからポーリング開始
        const startPolling = () => {
            // フォント適用後の追加待機（レイアウト再計算のため）
            setTimeout(() => {
                requestAnimationFrame(() => {
                    waitForStableLayout();
                });
            }, 30);
        };

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(startPolling);
        } else {
            setTimeout(startPolling, 100);
        }
    } else {
        doUpdate();
    }
}

/**
 * タブボタンを画面内にスクロール
 * @param {HTMLElement} tabButton - スクロール対象のタブボタン
 */
function scrollTabButtonIntoView(tabButton) {
    const tabButtonsArea = document.querySelector('.tabs .tab-buttons-area');
    if (!tabButtonsArea || !tabButton) return;

    const areaRect = tabButtonsArea.getBoundingClientRect();
    const buttonRect = tabButton.getBoundingClientRect();

    // 右側のフィルタトグルボタンを取得
    const filterToggle = document.querySelector('.tab-filter-toggle');

    // タブボタンが左側にはみ出している場合
    if (buttonRect.left < areaRect.left) {
        const scrollAmount = buttonRect.left - areaRect.left - 8; // 8px余裕
        tabButtonsArea.scrollBy({
            left: scrollAmount,
            behavior: 'smooth'
        });
    }
    // タブボタンが右側にはみ出している場合
    else if (filterToggle) {
        // フィルタトグルボタンがある場合：トグルボタン幅ぎりぎりまで
        const rightMargin = filterToggle.offsetWidth;
        if (buttonRect.right > areaRect.right - rightMargin) {
            const scrollAmount = buttonRect.right - (areaRect.right - rightMargin);
            tabButtonsArea.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
        }
    } else {
        // フィルタトグルボタンがない場合：8px余裕を持たせる
        if (buttonRect.right > areaRect.right) {
            const scrollAmount = buttonRect.right - areaRect.right + 8;
            tabButtonsArea.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
        }
    }
}

/**
 * スワイプ中のインジケーター位置を更新
 * @param {number} progress - スワイプ進行度（-1〜1、負が次、正が前）
 * @param {string} currentTabName - 現在のタブ名
 * @param {string|null} nextTabName - 次のタブ名
 * @param {string|null} prevTabName - 前のタブ名
 */
export function updateTabIndicatorProgress(progress, currentTabName, nextTabName, prevTabName) {
    if (!tabIndicator || window.innerWidth > 768) return;

    const tabButtonsArea = document.querySelector('.tabs .tab-buttons-area');
    if (!tabButtonsArea) return;

    const currentTab = tabButtonsArea.querySelector(`.tab[data-tab="${currentTabName}"]`);
    if (!currentTab) return;

    const areaRect = tabButtonsArea.getBoundingClientRect();
    const currentRect = currentTab.getBoundingClientRect();
    const currentLeft = currentRect.left - areaRect.left + tabButtonsArea.scrollLeft;
    const currentWidth = currentRect.width;

    let targetLeft = currentLeft;
    let targetWidth = currentWidth;

    // 進行度に応じて次/前のタブとの間を補間
    if (progress < 0 && nextTabName) {
        // 次のタブへ向かう
        const nextTab = tabButtonsArea.querySelector(`.tab[data-tab="${nextTabName}"]`);
        if (nextTab) {
            const nextRect = nextTab.getBoundingClientRect();
            const nextLeft = nextRect.left - areaRect.left + tabButtonsArea.scrollLeft;
            const nextWidth = nextRect.width;
            const t = Math.abs(progress);  // 0〜1
            targetLeft = currentLeft + (nextLeft - currentLeft) * t;
            targetWidth = currentWidth + (nextWidth - currentWidth) * t;
        }
    } else if (progress > 0 && prevTabName) {
        // 前のタブへ向かう
        const prevTab = tabButtonsArea.querySelector(`.tab[data-tab="${prevTabName}"]`);
        if (prevTab) {
            const prevRect = prevTab.getBoundingClientRect();
            const prevLeft = prevRect.left - areaRect.left + tabButtonsArea.scrollLeft;
            const prevWidth = prevRect.width;
            const t = Math.abs(progress);  // 0〜1
            targetLeft = currentLeft + (prevLeft - currentLeft) * t;
            targetWidth = currentWidth + (prevWidth - currentWidth) * t;
        }
    }

    // トランジションを無効化してすぐに反映
    tabIndicator.classList.add('swiping');
    tabIndicator.style.width = `${targetWidth}px`;
    tabIndicator.style.transform = `translateX(${targetLeft}px)`;
}

/**
 * スワイプ終了時のインジケーター処理
 * @param {boolean} animate - アニメーションを有効にするか
 */
export function finalizeTabIndicator(animate = true) {
    if (!tabIndicator) return;

    if (animate) {
        tabIndicator.classList.remove('swiping');
    }
}

// スマートStickyタブの初期化
export function initSmartSticky() {
    const tabs = document.querySelector('.tabs');
    if (!tabs) return;

    // デフォルトで隠す状態にする
    tabs.classList.add('is-hidden');

    let lastScrollY = window.scrollY;
    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                // タブ切り替え中またはタブエリア操作中はスクロール検出をスキップ
                if (isTabSwitching || window.isTabInteracting) {
                    lastScrollY = window.scrollY;
                    ticking = false;
                    return;
                }

                const currentScrollY = window.scrollY;
                if (currentScrollY < 0) {
                    ticking = false;
                    return;
                }

                // 一定以上スクロールしたら強制的に隠す
                if (currentScrollY > lastScrollY && currentScrollY > 100) {
                    tabs.classList.add('is-hidden');
                }
                // 上にスクロールした時は表示
                else if (currentScrollY < lastScrollY) {
                    tabs.classList.remove('is-hidden');
                }

                lastScrollY = currentScrollY;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    // マウスオーバーでの表示
    const isMobileLayout = () => window.innerWidth <= 768;
    const triggerZone = 80;

    document.addEventListener('mousemove', (e) => {
        // 通常レイアウト（上部タブ）: 上端マウスオーバーで表示
        if (!isMobileLayout()) {
            if (e.clientY < triggerZone) {
                tabs.classList.remove('is-hidden');
            }
        }
        // モバイルレイアウト（下部タブ）: 下端マウスオーバーで表示
        else {
            if (e.clientY > window.innerHeight - triggerZone) {
                tabs.classList.remove('is-hidden');
            }
        }
    }, { passive: true });

    // タブエリアにマウスが乗っている間は隠さない
    tabs.addEventListener('mouseenter', () => {
        tabs.classList.remove('is-hidden');
    });

    // タブエリア内クリック時はスクロール検出を一時停止（フィルタボタンクリック時の誤検出防止）
    tabs.addEventListener('click', () => {
        window.isTabInteracting = true;
        setTimeout(() => {
            window.isTabInteracting = false;
        }, 300);
    });

    // タブエリアクリックでの表示復帰（Mobile:下部クリック）
    window.addEventListener('click', (e) => {
        if (!tabs.classList.contains('is-hidden')) return;
        if (!isMobileLayout()) return;

        if (e.clientY > window.innerHeight - triggerZone || window.scrollY < 20) {
            tabs.classList.remove('is-hidden');
            if (e.clientY > window.innerHeight - triggerZone) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, true);
}

export function initTabSwipe() {
    const content = document.querySelector('.content');
    if (!content) return;

    // スワイプ状態管理
    let isSwiping = false;
    let isSwipeActive = false;  // 横スワイプとして認識されたか
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchStartTarget = null;
    let currentTranslateX = 0;
    let currentTab = null;
    let nextTabEl = null;
    let prevTabEl = null;
    let swipeStartScrollY = 0;  // スワイプ開始時のスクロール位置

    // インジケーター用のタブ位置キャッシュ
    let indicatorCache = null;

    // 設定
    const SWIPE_THRESHOLD = 0.2;  // 画面幅の20%以上でタブ切り替え
    const VELOCITY_THRESHOLD = 0.5;  // px/msの速度閾値
    const MAX_VERTICAL_RATIO = 0.5;  // 縦/横比がこれ以下なら横スワイプと判定
    const PAGE_GAP = 16;  // ページ間のギャップ（px）

    /**
     * スワイプを無効にすべき要素かどうか
     */
    function shouldDisableSwipe(target) {
        if (!target) return false;

        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            return true;
        }

        const segmentButton = target.closest('[id$="Buttons2"]');
        if (segmentButton) return true;

        const element = target.closest('.table-wrapper, .estimate-table-wrapper, .matrix-container, .matrix-table, .modal.active, .custom-dropdown, #dragHandle, #workMonthAssignmentMode');
        return element !== null;
    }

    /**
     * 現在のタブと前後のタブを取得
     */
    function getTabElements() {
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return { current: null, next: null, prev: null };

        const currentIndex = TAB_ORDER.indexOf(activeTab.id);
        const nextId = currentIndex < TAB_ORDER.length - 1 ? TAB_ORDER[currentIndex + 1] : null;
        const prevId = currentIndex > 0 ? TAB_ORDER[currentIndex - 1] : null;

        return {
            current: activeTab,
            next: nextId ? document.getElementById(nextId) : null,
            prev: prevId ? document.getElementById(prevId) : null
        };
    }

    /**
     * スワイプ開始時の準備
     */
    function prepareSwipe() {
        const tabs = getTabElements();
        currentTab = tabs.current;
        nextTabEl = tabs.next;
        prevTabEl = tabs.prev;

        if (!currentTab) return false;

        // 現在のスクロール位置を保存
        swipeStartScrollY = window.scrollY;

        // .contentのpaddingを取得
        const contentStyle = getComputedStyle(content);
        const paddingLeft = contentStyle.paddingLeft;
        const paddingRight = contentStyle.paddingRight;
        const paddingTop = contentStyle.paddingTop;
        const paddingTopPx = parseFloat(paddingTop);

        // bodyをfixedにしてスクロールを完全にロック（縦スクロール位置を固定）
        document.body.style.position = 'fixed';
        document.body.style.top = `-${swipeStartScrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.overflow = 'hidden';

        // contentにswipingクラスを設定
        content.classList.add('swiping');
        content.style.overflow = 'hidden';

        // タブの幅をcontentの内側幅から計算（スクロールバー有無に関係なく一定）
        // contentのclientWidthからpaddingを引いた値がタブの幅になる
        const tabWidth = (content.clientWidth - parseFloat(paddingLeft) - parseFloat(paddingRight)) + 'px';

        // 各タブの保存されたスクロール位置を取得
        const currentScrollY = window.tabScrollPositions[currentTab.id] || 0;
        const nextScrollY = nextTabEl ? (window.tabScrollPositions[nextTabEl.id] || 0) : 0;
        const prevScrollY = prevTabEl ? (window.tabScrollPositions[prevTabEl.id] || 0) : 0;

        // 現在のタブをabsoluteにして、プレビュータブと同じ座標系で動かす
        currentTab.classList.add('swiping');
        currentTab.style.transition = 'none';
        currentTab.style.willChange = 'transform';
        currentTab.style.top = paddingTop;
        currentTab.style.left = paddingLeft;
        currentTab.style.width = tabWidth;

        // 次/前のタブを表示準備（paddingとギャップを考慮した位置に配置）
        // topを調整して、各タブの保存されたスクロール位置での表示にする
        if (nextTabEl) {
            // 調整量 = 現在のスクロール位置 - 次タブの保存されたスクロール位置
            const scrollAdjust = swipeStartScrollY - nextScrollY;
            nextTabEl.classList.add('swipe-preview');
            nextTabEl.style.transition = 'none';
            nextTabEl.style.willChange = 'transform';
            nextTabEl.style.top = `${paddingTopPx - scrollAdjust}px`;
            nextTabEl.style.left = paddingLeft;
            nextTabEl.style.width = tabWidth;
            nextTabEl.style.transform = `translateX(calc(100% + ${PAGE_GAP}px))`;
        }
        if (prevTabEl) {
            // 調整量 = 現在のスクロール位置 - 前タブの保存されたスクロール位置
            const scrollAdjust = swipeStartScrollY - prevScrollY;
            prevTabEl.classList.add('swipe-preview');
            prevTabEl.style.transition = 'none';
            prevTabEl.style.willChange = 'transform';
            prevTabEl.style.top = `${paddingTopPx - scrollAdjust}px`;
            prevTabEl.style.left = paddingLeft;
            prevTabEl.style.width = tabWidth;
            prevTabEl.style.transform = `translateX(calc(-100% - ${PAGE_GAP}px))`;
        }

        // swipe-preview追加後に高さを取得（display: blockになった後）
        const currentHeight = currentTab.offsetHeight;
        const nextHeight = nextTabEl ? nextTabEl.offsetHeight : 0;
        const prevHeight = prevTabEl ? prevTabEl.offsetHeight : 0;
        const maxHeight = Math.max(currentHeight, nextHeight, prevHeight);
        content.style.minHeight = (maxHeight + parseFloat(paddingTop)) + 'px';

        // インジケーター用のタブボタン位置をキャッシュ（パフォーマンス最適化）
        const tabButtonsArea = document.querySelector('.tabs .tab-buttons-area');
        if (tabButtonsArea && tabIndicator) {
            const areaRect = tabButtonsArea.getBoundingClientRect();
            const currentBtn = tabButtonsArea.querySelector(`.tab[data-tab="${currentTab.id}"]`);
            const nextBtn = nextTabEl ? tabButtonsArea.querySelector(`.tab[data-tab="${nextTabEl.id}"]`) : null;
            const prevBtn = prevTabEl ? tabButtonsArea.querySelector(`.tab[data-tab="${prevTabEl.id}"]`) : null;

            // offsetLeft/offsetWidth を使用してスケール前のサイズを取得
            const areaWidth = tabButtonsArea.clientWidth;
            const currentScroll = tabButtonsArea.scrollLeft;

            // タブボタンを画面内に表示するために必要なスクロール量を計算
            const calcTargetScroll = (btn) => {
                if (!btn) return currentScroll;
                const btnLeft = btn.offsetLeft;
                const btnRight = btnLeft + btn.offsetWidth;
                const visibleLeft = currentScroll;
                const visibleRight = currentScroll + areaWidth;

                // 左にはみ出している場合
                if (btnLeft < visibleLeft) {
                    return btnLeft - 8;  // 8px余裕
                }
                // 右にはみ出している場合
                if (btnRight > visibleRight) {
                    return btnRight - areaWidth + 8;  // 8px余裕
                }
                return currentScroll;  // 既に見えている場合は変更なし
            };

            indicatorCache = {
                current: currentBtn ? {
                    left: currentBtn.offsetLeft,
                    width: currentBtn.offsetWidth
                } : null,
                next: nextBtn ? {
                    left: nextBtn.offsetLeft,
                    width: nextBtn.offsetWidth
                } : null,
                prev: prevBtn ? {
                    left: prevBtn.offsetLeft,
                    width: prevBtn.offsetWidth
                } : null,
                // タブバーのスクロール用キャッシュ
                scrollArea: tabButtonsArea,
                scrollCurrent: currentScroll,
                scrollNext: calcTargetScroll(nextBtn),
                scrollPrev: calcTargetScroll(prevBtn)
            };

            // スワイプ中はインジケーターのトランジションを無効化
            tabIndicator.classList.add('swiping');
        }

        return true;
    }

    /**
     * スワイプ中の更新
     */
    function updateSwipe(deltaX) {
        // 抵抗を加える（端でのオーバースクロール防止）
        let adjustedDeltaX = deltaX;

        // 端に達した場合は抵抗を加える
        if ((deltaX > 0 && !prevTabEl) || (deltaX < 0 && !nextTabEl)) {
            adjustedDeltaX = deltaX * 0.3;  // 抵抗係数
        }

        currentTranslateX = adjustedDeltaX;

        if (currentTab) {
            currentTab.style.transform = `translateX(${adjustedDeltaX}px)`;
        }

        // 次/前のタブも連動して動かす（ギャップを維持）
        if (nextTabEl && deltaX < 0) {
            nextTabEl.style.transform = `translateX(calc(100% + ${PAGE_GAP}px + ${adjustedDeltaX}px))`;
        }
        if (prevTabEl && deltaX > 0) {
            prevTabEl.style.transform = `translateX(calc(-100% - ${PAGE_GAP}px + ${adjustedDeltaX}px))`;
        }

        // タブインジケーターを追従させる（キャッシュを使用して高速化）
        if (indicatorCache && tabIndicator) {
            const screenWidth = window.innerWidth;
            const progress = adjustedDeltaX / screenWidth;  // -1〜1

            let targetLeft = indicatorCache.current.left;
            let targetWidth = indicatorCache.current.width;
            let targetScroll = indicatorCache.scrollCurrent;

            if (progress < 0 && indicatorCache.next) {
                // 次のタブへ
                const t = Math.min(Math.abs(progress), 1);
                targetLeft = indicatorCache.current.left + (indicatorCache.next.left - indicatorCache.current.left) * t;
                targetWidth = indicatorCache.current.width + (indicatorCache.next.width - indicatorCache.current.width) * t;
                targetScroll = indicatorCache.scrollCurrent + (indicatorCache.scrollNext - indicatorCache.scrollCurrent) * t;
            } else if (progress > 0 && indicatorCache.prev) {
                // 前のタブへ
                const t = Math.min(Math.abs(progress), 1);
                targetLeft = indicatorCache.current.left + (indicatorCache.prev.left - indicatorCache.current.left) * t;
                targetWidth = indicatorCache.current.width + (indicatorCache.prev.width - indicatorCache.current.width) * t;
                targetScroll = indicatorCache.scrollCurrent + (indicatorCache.scrollPrev - indicatorCache.scrollCurrent) * t;
            }

            tabIndicator.style.width = `${targetWidth}px`;
            tabIndicator.style.transform = `translateX(${targetLeft}px)`;

            // タブバーもスワイプに追従してスクロール
            if (indicatorCache.scrollArea && targetScroll !== indicatorCache.scrollCurrent) {
                indicatorCache.scrollArea.scrollLeft = targetScroll;
            }
        }
    }

    /**
     * スワイプ終了時の処理
     */
    function endSwipe(deltaX, velocity) {
        const screenWidth = window.innerWidth;
        const threshold = screenWidth * SWIPE_THRESHOLD;

        // 判定：距離または速度でタブ切り替えを決定
        let shouldSwitchNext = false;
        let shouldSwitchPrev = false;

        if (deltaX < -threshold || (velocity < -VELOCITY_THRESHOLD && deltaX < -30)) {
            shouldSwitchNext = !!nextTabEl;
        } else if (deltaX > threshold || (velocity > VELOCITY_THRESHOLD && deltaX > 30)) {
            shouldSwitchPrev = !!prevTabEl;
        }

        // アニメーションで完了
        const duration = '0.25s';
        const easing = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

        if (currentTab) {
            currentTab.style.transition = `transform ${duration} ${easing}`;
        }
        if (nextTabEl) {
            nextTabEl.style.transition = `transform ${duration} ${easing}`;
        }
        if (prevTabEl) {
            prevTabEl.style.transition = `transform ${duration} ${easing}`;
        }

        // インジケーターのトランジションを有効化
        if (tabIndicator) {
            tabIndicator.classList.remove('swiping');
            tabIndicator.style.transition = `transform ${duration} ${easing}, width ${duration} ${easing}`;
        }

        if (shouldSwitchNext && nextTabEl) {
            // 次のタブへ切り替え
            const targetId = nextTabEl.id;
            const targetTab = nextTabEl;
            const unusedTab = prevTabEl;  // 使われていないタブ
            // 完全に画面外に出るようにギャップ分も含める
            currentTab.style.transform = `translateX(calc(-100% - ${PAGE_GAP}px))`;
            nextTabEl.style.transform = 'translateX(0)';

            // インジケーターを次のタブの位置へアニメーション
            if (indicatorCache && indicatorCache.next && tabIndicator) {
                tabIndicator.style.width = `${indicatorCache.next.width}px`;
                tabIndicator.style.transform = `translateX(${indicatorCache.next.left}px)`;
            }

            setTimeout(() => {
                // showTab()の前に、使われていないタブを非表示にする
                if (unusedTab) {
                    unusedTab.classList.remove('swipe-preview');
                }
                currentTab.classList.remove('swiping');
                // bodyのfixed解除（showTabでのscrollToが効くように）
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.left = '';
                document.body.style.right = '';
                showTab(targetId, { skipAnimation: true });
                cleanupSwipeWithTransition(targetTab);
            }, 250);
        } else if (shouldSwitchPrev && prevTabEl) {
            // 前のタブへ切り替え
            const targetId = prevTabEl.id;
            const targetTab = prevTabEl;
            const unusedTab = nextTabEl;  // 使われていないタブ
            // 完全に画面外に出るようにギャップ分も含める
            currentTab.style.transform = `translateX(calc(100% + ${PAGE_GAP}px))`;
            prevTabEl.style.transform = 'translateX(0)';

            // インジケーターを前のタブの位置へアニメーション
            if (indicatorCache && indicatorCache.prev && tabIndicator) {
                tabIndicator.style.width = `${indicatorCache.prev.width}px`;
                tabIndicator.style.transform = `translateX(${indicatorCache.prev.left}px)`;
            }

            setTimeout(() => {
                // showTab()の前に、使われていないタブを非表示にする
                if (unusedTab) {
                    unusedTab.classList.remove('swipe-preview');
                }
                currentTab.classList.remove('swiping');
                // bodyのfixed解除（showTabでのscrollToが効くように）
                document.body.style.position = '';
                document.body.style.top = '';
                document.body.style.left = '';
                document.body.style.right = '';
                showTab(targetId, { skipAnimation: true });
                cleanupSwipeWithTransition(targetTab);
            }, 250);
        } else {
            // 元の位置にバウンスバック（ギャップを維持）
            if (currentTab) {
                currentTab.style.transform = 'translateX(0)';
            }
            if (nextTabEl) {
                nextTabEl.style.transform = `translateX(calc(100% + ${PAGE_GAP}px))`;
            }
            if (prevTabEl) {
                prevTabEl.style.transform = `translateX(calc(-100% - ${PAGE_GAP}px))`;
            }

            // インジケーターも元の位置に戻す（キャッシュを使用してアニメーション）
            if (indicatorCache && indicatorCache.current && tabIndicator) {
                tabIndicator.style.width = `${indicatorCache.current.width}px`;
                tabIndicator.style.transform = `translateX(${indicatorCache.current.left}px)`;
            }

            setTimeout(() => {
                cleanupSwipe();
            }, 250);
        }
    }

    /**
     * スワイプ状態のクリーンアップ（タブ切り替え成功時）
     * @param {HTMLElement} newActiveTab - 新しくアクティブになるタブ
     */
    function cleanupSwipeWithTransition(newActiveTab) {
        content.classList.remove('swiping');
        content.style.minHeight = '';
        content.style.overflow = '';
        // bodyのfixedスタイルは既にshowTab前に解除済み
        document.body.style.overflow = '';

        // 参照を保持（後でクリアするため）
        const oldCurrentTab = currentTab;
        const oldNextTabEl = nextTabEl;
        const oldPrevTabEl = prevTabEl;

        // 状態をリセット
        isSwiping = false;
        isSwipeActive = false;
        currentTab = null;
        nextTabEl = null;
        prevTabEl = null;
        currentTranslateX = 0;
        indicatorCache = null;

        // インジケーターのスタイルをクリア
        if (tabIndicator) {
            tabIndicator.classList.remove('swiping');
            tabIndicator.style.transition = '';
        }

        // 次フレームで全てのスタイルをクリア（display: noneが適用された後）
        requestAnimationFrame(() => {
            // 元のタブのスタイルをクリア
            if (oldCurrentTab && oldCurrentTab !== newActiveTab) {
                oldCurrentTab.classList.remove('swiping');
                oldCurrentTab.style.transition = '';
                oldCurrentTab.style.transform = '';
                oldCurrentTab.style.willChange = '';
                oldCurrentTab.style.top = '';
                oldCurrentTab.style.left = '';
                oldCurrentTab.style.width = '';
            }

            // 新しいタブ以外のプレビューをクリア
            if (oldNextTabEl && oldNextTabEl !== newActiveTab) {
                oldNextTabEl.classList.remove('swipe-preview');
                oldNextTabEl.style.transition = '';
                oldNextTabEl.style.transform = '';
                oldNextTabEl.style.willChange = '';
                oldNextTabEl.style.top = '';
                oldNextTabEl.style.left = '';
                oldNextTabEl.style.width = '';
            }
            if (oldPrevTabEl && oldPrevTabEl !== newActiveTab) {
                oldPrevTabEl.classList.remove('swipe-preview');
                oldPrevTabEl.style.transition = '';
                oldPrevTabEl.style.transform = '';
                oldPrevTabEl.style.willChange = '';
                oldPrevTabEl.style.top = '';
                oldPrevTabEl.style.left = '';
                oldPrevTabEl.style.width = '';
            }

            // 新しいタブのスタイルをクリア
            if (newActiveTab) {
                newActiveTab.style.transition = '';
                newActiveTab.classList.remove('swipe-preview');
                newActiveTab.classList.remove('swiping');
                newActiveTab.style.transform = '';
                newActiveTab.style.willChange = '';
                newActiveTab.style.top = '';
                newActiveTab.style.left = '';
                newActiveTab.style.width = '';
            }
        });
    }

    /**
     * スワイプ状態のクリーンアップ（キャンセル/バウンスバック時）
     */
    function cleanupSwipe() {
        content.classList.remove('swiping');
        content.style.minHeight = '';
        content.style.overflow = '';
        // bodyのfixedを解除し、元のスクロール位置に戻す
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.overflow = '';
        window.scrollTo(0, swipeStartScrollY);

        if (currentTab) {
            currentTab.classList.remove('swiping');
            currentTab.style.transition = '';
            currentTab.style.transform = '';
            currentTab.style.willChange = '';
            currentTab.style.top = '';
            currentTab.style.left = '';
            currentTab.style.width = '';
        }
        if (nextTabEl) {
            nextTabEl.classList.remove('swipe-preview');
            nextTabEl.style.transition = '';
            nextTabEl.style.transform = '';
            nextTabEl.style.willChange = '';
            nextTabEl.style.top = '';
            nextTabEl.style.left = '';
            nextTabEl.style.width = '';
        }
        if (prevTabEl) {
            prevTabEl.classList.remove('swipe-preview');
            prevTabEl.style.transition = '';
            prevTabEl.style.transform = '';
            prevTabEl.style.willChange = '';
            prevTabEl.style.top = '';
            prevTabEl.style.left = '';
            prevTabEl.style.width = '';
        }

        isSwiping = false;
        isSwipeActive = false;
        currentTab = null;
        nextTabEl = null;
        prevTabEl = null;
        currentTranslateX = 0;
        indicatorCache = null;

        // インジケーターのスタイルをクリア
        if (tabIndicator) {
            tabIndicator.classList.remove('swiping');
            tabIndicator.style.transition = '';
        }
    }

    // タッチイベントリスナー
    content.addEventListener('touchstart', function(e) {
        if (window.innerWidth > 768) return;  // モバイルのみ
        if (shouldDisableSwipe(e.target)) return;

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        touchStartTarget = e.target;
        isSwiping = true;
        isSwipeActive = false;
    }, { passive: true });

    content.addEventListener('touchmove', function(e) {
        if (!isSwiping || window.innerWidth > 768) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const deltaX = touchX - touchStartX;
        const deltaY = touchY - touchStartY;

        // まだ横スワイプと確定していない場合
        if (!isSwipeActive) {
            // 一定距離移動したら方向を判定
            if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                // 縦方向が主なら無視
                if (Math.abs(deltaY) > Math.abs(deltaX) * MAX_VERTICAL_RATIO) {
                    isSwiping = false;
                    return;
                }
                // 横スワイプとして確定
                isSwipeActive = true;
                if (!prepareSwipe()) {
                    isSwiping = false;
                    return;
                }
            } else {
                return;  // まだ判定できない
            }
        }

        // スクロールを防止（cancelableな場合のみ）
        if (e.cancelable) {
            e.preventDefault();
        }

        // 指に追従してタブを移動
        updateSwipe(deltaX);
    }, { passive: false });

    content.addEventListener('touchend', function(e) {
        if (!isSwiping || window.innerWidth > 768) return;

        if (!isSwipeActive) {
            // 横スワイプとして認識されなかった場合はクリーンアップのみ
            isSwiping = false;
            return;
        }

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndTime = Date.now();
        const deltaX = touchEndX - touchStartX;
        const deltaTime = touchEndTime - touchStartTime;
        const velocity = deltaTime > 0 ? deltaX / deltaTime : 0;

        endSwipe(deltaX, velocity);
    }, { passive: true });

    content.addEventListener('touchcancel', function() {
        if (isSwiping) {
            cleanupSwipe();
        }
    }, { passive: true });
}

// ============================================
// セグメントボタン
// ============================================

export function createSegmentButtons(containerId, selectId, items, currentValue, maxItems, onClickHandler) {
    const container = document.getElementById(containerId);
    const select = document.getElementById(selectId);

    if (!container || !select) return;

    container.className = 'segment-buttons';
    container.style.display = 'inline-flex';
    container.style.overflowX = 'auto';
    select.style.display = 'none';
    container.innerHTML = '';

    // ドラッグスクロールの実装
    let isDown = false;
    let startX;
    let scrollLeft;
    let isDragging = false;

    container.addEventListener('mousedown', (e) => {
        isDown = true;
        isDragging = false;
        container.style.cursor = 'grabbing';
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
    });

    container.addEventListener('mouseleave', () => {
        isDown = false;
        container.style.cursor = 'grab';
    });

    container.addEventListener('mouseup', () => {
        isDown = false;
        container.style.cursor = 'grab';
        // クリックイベントの後にisDraggingをリセットするため、少し遅延させる
        setTimeout(() => { isDragging = false; }, 0);
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 2; // スクロール速度
        container.scrollLeft = scrollLeft - walk;

        // わずかな動きは除外（クリック誤爆防止）
        if (Math.abs(x - startX) > 5) {
            isDragging = true;
        }
    });

    items.forEach((item, index) => {
        const button = document.createElement('button');
        button.textContent = item.label;
        button.value = item.value;

        if (item.value === currentValue) {
            button.classList.add('active');
        }

        // クリックイベント：ドラッグ中は実行しない
        button.addEventListener('click', (e) => {
            if (isDragging) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            onClickHandler(item.value, containerId);
        });

        container.appendChild(button);
    });

    // 初期選択ボタンを表示エリア内にスクロール
    setTimeout(() => {
        const activeBtn = container.querySelector('button.active');
        if (activeBtn) {
            const containerRect = container.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (container.clientWidth / 2) + (btnRect.width / 2);
            container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'instant' });
        }
    }, 0);
}

export function updateSegmentButtonSelection(containerId, value) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.value === value) {
            btn.classList.add('active');
            // 選択されたボタンが画面外にある場合、中央にスクロール
            // setTimeoutでレンダリング待ちを入れるとより確実
            setTimeout(() => {
                const containerRect = container.getBoundingClientRect();
                const btnRect = btn.getBoundingClientRect();
                const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (container.clientWidth / 2) + (btnRect.width / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }, 10);
        } else {
            btn.classList.remove('active');
        }
    });
}

// ============================================
// 表示タイプ設定
// ============================================

export function setEstimateViewType(type) {
    const viewTypeElement = document.getElementById('defaultEstimateViewType');
    if (viewTypeElement) {
        viewTypeElement.value = type;
    }

    const btnGrouped = document.getElementById('btnEstimateGrouped');
    const btnMatrix = document.getElementById('btnEstimateMatrix');
    const btnList = document.getElementById('btnEstimateList');

    if (btnGrouped) btnGrouped.classList.remove('active');
    if (btnMatrix) btnMatrix.classList.remove('active');
    if (btnList) btnList.classList.remove('active');

    if (type === 'grouped' && btnGrouped) {
        btnGrouped.classList.add('active');
    } else if (type === 'matrix' && btnMatrix) {
        btnMatrix.classList.add('active');
    } else if (type === 'list' && btnList) {
        btnList.classList.add('active');
    }

    // 作業月割り当てチェックボックスの表示制御（グループ表示時のみ）
    const workMonthCheckbox1 = document.getElementById('workMonthSelectionMode');
    const workMonthCheckbox2 = document.getElementById('workMonthSelectionMode2');
    const isGrouped = type === 'grouped';

    if (workMonthCheckbox1 && workMonthCheckbox1.parentElement) {
        workMonthCheckbox1.parentElement.style.display = isGrouped ? '' : 'none';
    }
    if (workMonthCheckbox2 && workMonthCheckbox2.parentElement) {
        workMonthCheckbox2.parentElement.style.display = isGrouped ? '' : 'none';
    }

    // グループ表示以外に変更され、作業月割り当てモードがオンの場合は解除
    if (!isGrouped && workMonthCheckbox1 && workMonthCheckbox1.checked) {
        workMonthCheckbox1.checked = false;
        if (workMonthCheckbox2) workMonthCheckbox2.checked = false;
        const modePanel = document.getElementById('workMonthAssignmentMode');
        if (modePanel) modePanel.style.display = 'none';
    }

    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }
}

export function setActualViewType(type) {
    const viewTypeEl = document.getElementById('actualViewType');
    if (viewTypeEl) viewTypeEl.value = type;

    const btnMatrix = document.getElementById('btnActualMatrix');
    const btnList = document.getElementById('btnActualList');

    if (btnMatrix) btnMatrix.classList.remove('active');
    if (btnList) btnList.classList.remove('active');

    if (type === 'matrix' && btnMatrix) {
        btnMatrix.classList.add('active');
    } else if (type === 'list' && btnList) {
        btnList.classList.add('active');
    }

    if (typeof window.renderActualList === 'function') {
        window.renderActualList();
    }
}

export function setReportViewType(type) {
    const viewTypeEl = document.getElementById('defaultReportViewType');
    if (viewTypeEl) viewTypeEl.value = type;

    if (typeof window.updateReport === 'function') {
        window.updateReport();
    }
}

// ============================================
// テーマカラー取得
// ============================================

export function getThemeColor() {
    const themeColors = {
        'purple': '#667eea',
        'deep-blue': '#1e3c72',
        'teal': '#0f766e',
        'cyan': '#0891b2',
        'ocean': '#0c4a6e',
        'sky': '#0369a1',
        'indigo': '#4338ca',
        'navy': '#1e40af',
        'slate': '#334155',
        'green': '#047857',
        'emerald': '#059669'
    };
    return themeColors[window.currentThemeColor] || '#1e3c72';
}

// ============================================
// レイアウト設定
// ============================================

export function applyLayoutSettings() {
    // 見積一覧のレイアウトを適用
    const estimateCompact = document.getElementById('estimateFiltersCompact');
    const estimateSegmented = document.getElementById('estimateFiltersSegmented');
    if (window.estimateLayout === 'compact') {
        if (estimateCompact) estimateCompact.style.display = 'flex';
        if (estimateSegmented) estimateSegmented.style.display = 'none';
    } else {
        if (estimateCompact) estimateCompact.style.display = 'none';
        if (estimateSegmented) estimateSegmented.style.display = 'block';
    }

    // 実績一覧のレイアウトを適用
    const actualCompact = document.getElementById('actualFiltersCompact');
    const actualSegmented = document.getElementById('actualFiltersSegmented');
    if (window.actualLayout === 'compact') {
        if (actualCompact) actualCompact.style.display = 'flex';
        if (actualSegmented) actualSegmented.style.display = 'none';
    } else {
        if (actualCompact) actualCompact.style.display = 'none';
        if (actualSegmented) actualSegmented.style.display = 'block';
    }

    // レポートのレイアウトを適用
    const reportCompact = document.getElementById('reportFiltersCompact');
    const reportSegmented = document.getElementById('reportFiltersSegmented');
    if (window.reportLayout === 'compact') {
        if (reportCompact) reportCompact.style.display = 'flex';
        if (reportSegmented) reportSegmented.style.display = 'none';
    } else {
        if (reportCompact) reportCompact.style.display = 'none';
        if (reportSegmented) reportSegmented.style.display = 'block';
    }

    // 設定タブのボタンの状態を更新
    updateLayoutToggleButtons();
}

export function toggleFilterLayout(page, version) {
    const themeColor = getThemeColor();

    if (page === 'estimate') {
        const compact = document.getElementById('estimateFiltersCompact');
        const segmented = document.getElementById('estimateFiltersSegmented');

        const btnCompact = document.getElementById('btnSettingsEstimateCompact');
        const btnSegmented = document.getElementById('btnSettingsEstimateSegmented');

        if (version === 'compact') {
            if (compact) compact.style.display = 'flex';
            if (segmented) segmented.style.display = 'none';
            if (btnCompact) {
                btnCompact.style.background = themeColor;
                btnCompact.style.color = 'white';
            }
            if (btnSegmented) {
                btnSegmented.style.background = 'white';
                btnSegmented.style.color = '#333';
            }
            window.estimateLayout = 'compact';
            if (typeof window.renderEstimateList === 'function') {
                window.renderEstimateList();
            }
        } else {
            const viewType = document.getElementById('defaultEstimateViewType').value;
            setEstimateViewType(viewType);
            if (compact) compact.style.display = 'none';
            if (segmented) segmented.style.display = 'block';
            if (btnCompact) {
                btnCompact.style.background = 'white';
                btnCompact.style.color = '#333';
            }
            if (btnSegmented) {
                btnSegmented.style.background = themeColor;
                btnSegmented.style.color = 'white';
            }
            window.estimateLayout = 'segmented';
        }
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
    } else if (page === 'actual') {
        const compact = document.getElementById('actualFiltersCompact');
        const segmented = document.getElementById('actualFiltersSegmented');

        const btnCompact = document.getElementById('btnSettingsActualCompact');
        const btnSegmented = document.getElementById('btnSettingsActualSegmented');

        if (version === 'compact') {
            const viewMode = document.getElementById('actualViewMode2');
            const memberSelect = document.getElementById('actualMemberSelect2');
            const monthFilter = document.getElementById('actualMonthFilter2');
            if (viewMode) document.getElementById('actualViewMode').value = viewMode.value;
            if (memberSelect) document.getElementById('actualMemberSelect').value = memberSelect.value;
            if (monthFilter) document.getElementById('actualMonthFilter').value = monthFilter.value;

            if (compact) compact.style.display = 'flex';
            if (segmented) segmented.style.display = 'none';
            if (btnCompact) {
                btnCompact.style.background = themeColor;
                btnCompact.style.color = 'white';
            }
            if (btnSegmented) {
                btnSegmented.style.background = 'white';
                btnSegmented.style.color = '#333';
            }
            window.actualLayout = 'compact';
            if (typeof window.renderActualList === 'function') {
                window.renderActualList();
            }
        } else {
            const viewMode = document.getElementById('actualViewMode');
            const memberSelect = document.getElementById('actualMemberSelect');
            const monthFilter = document.getElementById('actualMonthFilter');
            if (viewMode) document.getElementById('actualViewMode2').value = viewMode.value;
            if (memberSelect) document.getElementById('actualMemberSelect2').value = memberSelect.value;
            if (monthFilter) document.getElementById('actualMonthFilter2').value = monthFilter.value;

            const viewType = document.getElementById('actualViewType').value;
            setActualViewType(viewType);
            if (compact) compact.style.display = 'none';
            if (segmented) segmented.style.display = 'block';
            if (btnCompact) {
                btnCompact.style.background = 'white';
                btnCompact.style.color = '#333';
            }
            if (btnSegmented) {
                btnSegmented.style.background = themeColor;
                btnSegmented.style.color = 'white';
            }
            window.actualLayout = 'segmented';
        }
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
    } else if (page === 'report') {
        const compact = document.getElementById('reportFiltersCompact');
        const segmented = document.getElementById('reportFiltersSegmented');

        const btnCompact = document.getElementById('btnSettingsReportCompact');
        const btnSegmented = document.getElementById('btnSettingsReportSegmented');

        if (version === 'compact') {
            const reportMonth2 = document.getElementById('reportMonth2');
            if (reportMonth2) document.getElementById('reportMonth').value = reportMonth2.value;

            if (compact) compact.style.display = 'flex';
            if (segmented) segmented.style.display = 'none';
            if (btnCompact) {
                btnCompact.style.background = themeColor;
                btnCompact.style.color = 'white';
            }
            if (btnSegmented) {
                btnSegmented.style.background = 'white';
                btnSegmented.style.color = '#333';
            }
            window.reportLayout = 'compact';
            if (typeof window.updateReport === 'function') {
                window.updateReport();
            }
        } else {
            const reportMonth = document.getElementById('reportMonth');
            if (reportMonth) document.getElementById('reportMonth2').value = reportMonth.value;

            const viewType = document.getElementById('defaultReportViewType').value;
            setReportViewType(viewType);
            if (compact) compact.style.display = 'none';
            if (segmented) segmented.style.display = 'block';
            if (btnCompact) {
                btnCompact.style.background = 'white';
                btnCompact.style.color = '#333';
            }
            if (btnSegmented) {
                btnSegmented.style.background = themeColor;
                btnSegmented.style.color = 'white';
            }
            window.reportLayout = 'segmented';
        }
        if (typeof window.saveData === 'function') {
            window.saveData(true);
        }
    }
}

export function updateLayoutToggleButtons() {
    const themeColor = getThemeColor();

    // 見積一覧のボタン
    const btnEstimateCompact = document.getElementById('btnSettingsEstimateCompact');
    const btnEstimateSegmented = document.getElementById('btnSettingsEstimateSegmented');

    if (btnEstimateCompact && btnEstimateSegmented) {
        const estimateCompact = document.getElementById('estimateFiltersCompact');
        const isCompactActive = estimateCompact && estimateCompact.style.display !== 'none';
        btnEstimateCompact.style.background = isCompactActive ? themeColor : 'white';
        btnEstimateCompact.style.color = isCompactActive ? 'white' : '#333';
        btnEstimateSegmented.style.background = !isCompactActive ? themeColor : 'white';
        btnEstimateSegmented.style.color = !isCompactActive ? 'white' : '#333';
    }

    // 実績一覧のボタン
    const btnActualCompact = document.getElementById('btnSettingsActualCompact');
    const btnActualSegmented = document.getElementById('btnSettingsActualSegmented');

    if (btnActualCompact && btnActualSegmented) {
        const actualCompact = document.getElementById('actualFiltersCompact');
        const isCompactActive = actualCompact && actualCompact.style.display !== 'none';
        btnActualCompact.style.background = isCompactActive ? themeColor : 'white';
        btnActualCompact.style.color = isCompactActive ? 'white' : '#333';
        btnActualSegmented.style.background = !isCompactActive ? themeColor : 'white';
        btnActualSegmented.style.color = !isCompactActive ? 'white' : '#333';
    }

    // レポートのボタン
    const btnReportCompact = document.getElementById('btnSettingsReportCompact');
    const btnReportSegmented = document.getElementById('btnSettingsReportSegmented');

    if (btnReportCompact && btnReportSegmented) {
        const reportCompact = document.getElementById('reportFiltersCompact');
        const isCompactActive = reportCompact && reportCompact.style.display !== 'none';
        btnReportCompact.style.background = isCompactActive ? themeColor : 'white';
        btnReportCompact.style.color = isCompactActive ? 'white' : '#333';
        btnReportSegmented.style.background = !isCompactActive ? themeColor : 'white';
        btnReportSegmented.style.color = !isCompactActive ? 'white' : '#333';
    }
}

export function updateSegmentedButtons() {
    // クイック入力のモードボタン
    const quickActualModeBtn = document.getElementById('quickActualModeBtn');
    const quickEstimateModeBtn = document.getElementById('quickEstimateModeBtn');
    const quickVacationModeBtn = document.getElementById('quickVacationModeBtn');
    if (quickActualModeBtn && quickEstimateModeBtn && quickVacationModeBtn) {
        if (typeof window.quickInputMode !== 'undefined') {
            const mode = window.quickInputMode;
            quickActualModeBtn.classList.toggle('active', mode === 'actual');
            quickEstimateModeBtn.classList.toggle('active', mode === 'estimate');
            quickVacationModeBtn.classList.toggle('active', mode === 'vacation');
        }
    }

    // 見積一覧のセグメントボタン（表示形式）- 設定で管理するため不要
    const btnEstimateGrouped = document.getElementById('btnEstimateGrouped');
    const btnEstimateMatrix = document.getElementById('btnEstimateMatrix');
    const btnEstimateList = document.getElementById('btnEstimateList');
    if (btnEstimateGrouped && btnEstimateMatrix && btnEstimateList) {
        const estimateViewTypeEl = document.getElementById('defaultEstimateViewType');
        const estimateViewType = estimateViewTypeEl ? estimateViewTypeEl.value : 'matrix';
        btnEstimateGrouped.classList.toggle('active', estimateViewType === 'grouped');
        btnEstimateMatrix.classList.toggle('active', estimateViewType === 'matrix');
        btnEstimateList.classList.toggle('active', estimateViewType === 'list');
    }

    // 見積一覧のセグメントボタン（フィルタタイプ）- 月別/版数別トグル削除のため不要

    // 見積一覧のセグメントボタン（表示月）
    const estimateMonthButtons = document.getElementById('estimateMonthButtons2');
    if (estimateMonthButtons) {
        const estimateMonthFilter = document.getElementById('estimateMonthFilter');
        if (estimateMonthFilter) {
            updateSegmentButtonSelection('estimateMonthButtons2', estimateMonthFilter.value);
        }
    }

    // 見積一覧のセグメントボタン（版数）
    const estimateVersionButtons = document.getElementById('estimateVersionButtons2');
    if (estimateVersionButtons) {
        const estimateVersionFilter = document.getElementById('estimateVersionFilter');
        if (estimateVersionFilter) {
            updateSegmentButtonSelection('estimateVersionButtons2', estimateVersionFilter.value);
        }
    }

    // 実績一覧のセグメントボタン（表示形式）
    const btnActualMatrix = document.getElementById('btnActualMatrix');
    const btnActualList = document.getElementById('btnActualList');
    if (btnActualMatrix && btnActualList) {
        const actualViewType = document.getElementById('actualViewType').value;
        btnActualMatrix.classList.toggle('active', actualViewType === 'matrix');
        btnActualList.classList.toggle('active', actualViewType === 'list');
    }

    // 実績一覧のセグメントボタン（担当者）
    const actualMemberButtons = document.getElementById('actualMemberButtons2');
    if (actualMemberButtons) {
        const actualMemberSelect = document.getElementById('actualMemberSelect');
        if (actualMemberSelect) {
            updateSegmentButtonSelection('actualMemberButtons2', actualMemberSelect.value);
        }
    }

    // 実績一覧のセグメントボタン（表示期間）
    const actualMonthButtons = document.getElementById('actualMonthButtons2');
    if (actualMonthButtons) {
        const actualMonthFilter = document.getElementById('actualMonthFilter');
        if (actualMonthFilter) {
            updateSegmentButtonSelection('actualMonthButtons2', actualMonthFilter.value);
        }
    }

    // レポートのセグメントボタン（表示形式）- 設定で管理するため不要
    const btnReportSummary = document.getElementById('btnReportSummary');
    const btnReportGrouped = document.getElementById('btnReportGrouped');
    const btnReportMatrix = document.getElementById('btnReportMatrix');
    const reportViewTypeEl = document.getElementById('defaultReportViewType');
    if (btnReportSummary && btnReportGrouped && btnReportMatrix && reportViewTypeEl) {
        const reportViewType = reportViewTypeEl.value;
        btnReportSummary.classList.toggle('active', reportViewType === 'summary');
        btnReportGrouped.classList.toggle('active', reportViewType === 'grouped');
        btnReportMatrix.classList.toggle('active', reportViewType === 'matrix');
    }

    const reportFilterType = document.getElementById('reportFilterType');

    // フローティングフィルタパネルのセグメントボタン - 月別/版数別トグル削除のため不要

    // レポートのセグメントボタン（表示月）
    const reportMonthButtons = document.getElementById('reportMonthButtons2');
    if (reportMonthButtons) {
        const reportMonth = document.getElementById('reportMonth');
        if (reportMonth) {
            updateSegmentButtonSelection('reportMonthButtons2', reportMonth.value);
        }
    }

    // レポートのフィルタタイプボタン - 月別/版数別トグル削除のため不要

    // レポートの版数ボタン
    const reportVersionButtons = document.getElementById('reportVersionButtons2');
    if (reportVersionButtons) {
        const reportVersion = document.getElementById('reportVersion');
        if (reportVersion) {
            updateSegmentButtonSelection('reportVersionButtons2', reportVersion.value);
        }
    }

    // 全てのセグメントボタンにテーマカラーを適用
    const gradients = {
        'purple': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'deep-blue': 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        'teal': 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
        'cyan': 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
        'ocean': 'linear-gradient(135deg, #0c4a6e 0%, #075985 100%)',
        'sky': 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
        'indigo': 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
        'navy': 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
        'slate': 'linear-gradient(135deg, #334155 0%, #475569 100%)',
        'green': 'linear-gradient(135deg, #047857 0%, #059669 100%)',
        'emerald': 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
    };
    const gradient = gradients[window.currentThemeColor] || gradients['deep-blue'];

    // 全てのセグメントボタンにテーマカラーを適用
    // 通常のセグメントボタンと、フローティングフィルタボタンの両方を対象にする
    const allSegmentButtons = document.querySelectorAll('.segment-buttons button, .floating-filter-buttons button, .floating-segment-buttons button');
    allSegmentButtons.forEach(btn => {
        if (btn.classList.contains('active')) {
            btn.style.background = gradient;
            btn.style.color = 'white';
            btn.style.borderColor = 'transparent';
        } else {
            btn.style.background = 'white';
            btn.style.color = '#333';
            btn.style.borderColor = '#ddd';
        }
    });
}

// ============================================
// オプション更新
// ============================================

export function updateMemberOptions() {
    const members = new Set();
    estimates.forEach(e => members.add(e.member));
    actuals.forEach(a => members.add(a.member));

    const memberOrderInput = document.getElementById('memberOrder');
    const memberOrderValue = memberOrderInput ? memberOrderInput.value.trim() : '';

    const sortedMembers = sortMembers(members, memberOrderValue);

    // 各工程の担当者選択肢を更新
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    processes.forEach(process => {
        // 見積管理タブ
        const select = document.getElementById(`est${process}_member`);
        if (select) {
            updateSelectOptions(select, sortedMembers, true);
        }

        // クイック入力の見積登録フォーム
        const quickEstSelect = document.getElementById(`quickEst${process}_member`);
        if (quickEstSelect) {
            updateSelectOptions(quickEstSelect, sortedMembers, true);
        }

        // 見積登録モーダル
        const addEstSelect = document.getElementById(`addEst${process}_member`);
        if (addEstSelect) {
            updateSelectOptions(addEstSelect, sortedMembers, true);
        }
    });

    // クイック入力の担当者選択肢
    const quickMemberSelect = document.getElementById('quickMember');
    if (quickMemberSelect) {
        updateSelectOptions(quickMemberSelect, sortedMembers, false, true);
    }

    // その他作業の担当者選択肢
    const otherWorkMemberSelect = document.getElementById('otherWorkMember');
    if (otherWorkMemberSelect) {
        const currentValue = otherWorkMemberSelect.value;
        otherWorkMemberSelect.innerHTML = '<option value="">選択...</option>';
        sortedMembers.forEach(member => {
            const option = document.createElement('option');
            option.value = member;
            option.textContent = member;
            otherWorkMemberSelect.appendChild(option);
        });
        if (currentValue && sortedMembers.includes(currentValue)) {
            otherWorkMemberSelect.value = currentValue;
        }
    }

    // 実績編集モーダルの担当者選択肢
    const editActualMemberSelect = document.getElementById('editActualMember');
    if (editActualMemberSelect) {
        updateSelectOptions(editActualMemberSelect, sortedMembers, false, true);
    }

    // 休暇登録フォームの担当者選択肢
    const quickVacationMemberSelect = document.getElementById('quickVacationMember');
    if (quickVacationMemberSelect) {
        updateSelectOptions(quickVacationMemberSelect, sortedMembers, false, true);
    }

    // 見積編集モーダルの担当者選択肢
    const editEstimateMemberSelect = document.getElementById('editEstimateMember');
    if (editEstimateMemberSelect) {
        updateSelectOptions(editEstimateMemberSelect, sortedMembers, false);
    }
}

// セレクトオプション更新ヘルパー
function updateSelectOptions(select, members, addEmpty = false, selectFirst = false) {
    const currentValue = select.value;
    select.innerHTML = addEmpty ? '<option value="">-</option>' : '';

    members.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        select.appendChild(option);
    });

    if (currentValue && members.includes(currentValue)) {
        select.value = currentValue;
    } else if (selectFirst && members.length > 0) {
        select.value = members[0];
    }
}

export function updateVersionOptions() {
    try {
        const versions = new Set();
        estimates.forEach(e => {
            if (e.version) versions.add(e.version);
        });
        actuals.forEach(a => {
            if (a.version) versions.add(a.version);
        });

        const sortedVersions = Array.from(versions).sort();

        const versionSelects = [
            'estVersion',
            'quickEstVersion',
            'editActualVersion',
            'editEstimateVersion',
            'addEstVersion'
        ];

        versionSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- 版数を選択 --</option>';

                const newOption = document.createElement('option');
                newOption.value = '__new__';
                newOption.textContent = '+ 新しい版数を追加...';
                select.appendChild(newOption);

                sortedVersions.forEach(version => {
                    const option = document.createElement('option');
                    option.value = version;
                    option.textContent = version;
                    select.appendChild(option);
                });

                if (currentValue && currentValue !== '__new__') {
                    select.value = currentValue;
                } else if (sortedVersions.length > 0 && selectId === 'addEstVersion') {
                    select.value = sortedVersions[sortedVersions.length - 1];
                }
            }
        });

        updateReportVersionOptions(sortedVersions);
    } catch (e) {
        console.error('updateVersionOptions error:', e);
    }
}

export function updateFormNameOptions() {
    try {
        const formNames = new Set();
        estimates.forEach(e => {
            if (e.task) {
                if (e.task.includes('_')) {
                    const formName = e.task.split('_')[0];
                    if (formName.trim()) {
                        formNames.add(formName.trim());
                    }
                } else if (e.task.includes('：')) {
                    const formName = e.task.split('：')[0];
                    if (formName.trim()) {
                        formNames.add(formName.trim());
                    }
                }
            }
        });

        const sortedFormNames = Array.from(formNames).sort();

        const selectIds = ['quickEstFormNameSelect', 'addEstFormNameSelect', 'editTaskFormNameSelect'];
        selectIds.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- 帳票名を選択 --</option>';

                sortedFormNames.forEach(formName => {
                    const option = document.createElement('option');
                    option.value = formName;
                    option.textContent = formName;
                    select.appendChild(option);
                });

                const newOption = document.createElement('option');
                newOption.value = '__new__';
                newOption.textContent = '新規入力';
                select.appendChild(newOption);

                if (currentValue && (currentValue === '__new__' || sortedFormNames.includes(currentValue))) {
                    select.value = currentValue;
                }
            }
        });
    } catch (e) {
        console.error('updateFormNameOptions error:', e);
    }
}

export function updateReportVersionOptions(sortedVersions, selectedMonth = 'all') {
    try {
        if (!sortedVersions) {
            const versions = new Set();
            estimates.forEach(e => {
                if (e.version && e.version.trim() !== '') {
                    // 月フィルタが適用されている場合、該当する見積のみを確認
                    if (selectedMonth !== 'all') {
                        const est = normalizeEstimate(e);
                        if (!est.workMonths || !est.workMonths.includes(selectedMonth)) return;
                    }
                    versions.add(e.version);
                }
            });
            actuals.forEach(a => {
                if (a.version && a.version.trim() !== '') {
                    // 月フィルタが適用されている場合、該当する実績のみを確認
                    if (selectedMonth !== 'all') {
                        if (!a.date || !a.date.startsWith(selectedMonth)) return;
                    }
                    versions.add(a.version);
                }
            });
            sortedVersions = Array.from(versions).sort();
        } else {
            sortedVersions = sortedVersions.slice().sort();
        }

        const select = document.getElementById('reportVersion');
        const select2 = document.getElementById('reportVersion2');

        if (!select) return;

        // フィルタ状態を確認: localStorage > state > デフォルト（全版数）
        let currentValue;
        
        // まずlocalStorageを直接確認（stateより優先）
        let savedVersion = null;
        try {
            const savedState = localStorage.getItem('manhour_reportFilterState');
            if (savedState) {
                const parsed = JSON.parse(savedState);
                savedVersion = parsed.version;
            }
        } catch (e) {
            // ignore
        }
        
        if (savedVersion !== null && (savedVersion === 'all' || sortedVersions.includes(savedVersion))) {
            // localStorageに有効な値がある
            currentValue = savedVersion;
        } else if (reportFilterState.version !== null) {
            // stateに値がある
            if (reportFilterState.version === 'all' || sortedVersions.includes(reportFilterState.version)) {
                currentValue = reportFilterState.version;
            } else {
                currentValue = 'all';
            }
        } else {
            // 初回表示時はデフォルト（全版数）を適用
            currentValue = 'all';
        }
        
        // stateも更新
        if (reportFilterState.version !== currentValue) {
            setReportFilterState({ version: currentValue });
        }

        select.innerHTML = '<option value="all">全版数</option>';
        if (select2) select2.innerHTML = '<option value="all">全版数</option>';

        sortedVersions.forEach(version => {
            const option = document.createElement('option');
            option.value = version;
            option.textContent = version;
            select.appendChild(option);

            if (select2) {
                const option2 = document.createElement('option');
                option2.value = version;
                option2.textContent = version;
                select2.appendChild(option2);
            }
        });

        select.value = currentValue;
        if (select2) select2.value = currentValue;

        // セグメントボタン版を生成
        const items = [
            { value: 'all', label: '全版数' },
            ...sortedVersions.map(version => ({
                value: version,
                label: version
            }))
        ];
        createSegmentButtons(
            'reportVersionButtons2',
            'reportVersion2',
            items,
            currentValue,
            8,
            handleReportVersionChange
        );
    } catch (e) {
        console.error('updateReportVersionOptions error:', e);
    }
}

export function updateMonthOptions(selectedVersion = 'all') {
    const select = document.getElementById('reportMonth');
    const select2 = document.getElementById('reportMonth2');
    const months = new Set();

    // 実績から月を収集
    actuals.forEach(a => {
        if (a.date) {
            // 版数フィルタが適用されている場合、該当する実績のみを確認
            if (selectedVersion !== 'all' && a.version !== selectedVersion) return;

            const month = a.date.substring(0, 7);
            months.add(month);
        }
    });

    // 見積から月を収集
    estimates.forEach(e => {
        const est = normalizeEstimate(e);

        // 版数フィルタが適用されている場合、該当する見積のみを確認
        if (selectedVersion !== 'all' && est.version !== selectedVersion) return;

        if (est.workMonths) {
            est.workMonths.forEach(m => {
                if (m && m !== 'unassigned') {
                    // 時間が0より大きい月のみを追加
                    if (est.monthlyHours && est.monthlyHours[m] > 0) {
                        months.add(m);
                    }
                }
            });
        }
    });

    const sortedMonths = Array.from(months).sort();

    select.innerHTML = '<option value="all">全期間</option>';
    if (select2) select2.innerHTML = '<option value="all">全期間</option>';

    sortedMonths.forEach(month => {
        const [year, monthNum] = month.split('-');
        const option = document.createElement('option');
        option.value = month;
        option.textContent = `${year}年${parseInt(monthNum)}月`;
        select.appendChild(option);

        if (select2) {
            const option2 = document.createElement('option');
            option2.value = month;
            option2.textContent = `${year}年${parseInt(monthNum)}月`;
            select2.appendChild(option2);
        }
    });

    // フィルタ状態を確認: localStorage > state > デフォルト（最新月）
    let currentValue;
    
    // まずlocalStorageを直接確認（stateより優先）
    let savedMonth = null;
    try {
        const savedState = localStorage.getItem('manhour_reportFilterState');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            savedMonth = parsed.month;
        }
    } catch (e) {
        // ignore
    }
    
    if (savedMonth !== null && (savedMonth === 'all' || sortedMonths.includes(savedMonth))) {
        // localStorageに有効な値がある
        currentValue = savedMonth;
    } else if (reportFilterState.month !== null) {
        // stateに値がある
        if (reportFilterState.month === 'all' || sortedMonths.includes(reportFilterState.month)) {
            currentValue = reportFilterState.month;
        } else {
            currentValue = getDefaultMonth(select);
        }
    } else {
        // 初回表示時はデフォルト（最新月）を適用
        currentValue = getDefaultMonth(select);
    }
    
    // stateも更新
    if (reportFilterState.month !== currentValue) {
        setReportFilterState({ month: currentValue });
    }

    select.value = currentValue;
    if (select2) select2.value = currentValue;

    const items = [
        { value: 'all', label: '全期間' },
        ...sortedMonths.slice().map(month => {
            const [year, monthNum] = month.split('-');
            return {
                value: month,
                label: `${year}/${parseInt(monthNum)}`
            };
        })
    ];

    createSegmentButtons(
        'reportMonthButtons2',
        'reportMonth2',
        items,
        currentValue,
        8,
        handleReportMonthChange
    );
}

export function updateEstimateMonthOptions() {
    const select = document.getElementById('estimateMonthFilter');
    const select2 = document.getElementById('estimateMonthFilter2');
    if (!select) return;

    const months = new Set();

    estimates.forEach(e => {
        const est = normalizeEstimate(e);
        est.workMonths.forEach(month => {
            if (month && month !== 'unassigned') {
                // 時間が0より大きい月のみを追加
                if (est.monthlyHours && est.monthlyHours[month] > 0) {
                    months.add(month);
                }
            }
        });
    });

    const sortedMonths = Array.from(months).sort();

    select.innerHTML = '<option value="all">全期間</option>';
    if (select2) select2.innerHTML = '<option value="all">全期間</option>';

    sortedMonths.forEach(month => {
        const [year, monthNum] = month.split('-');
        const option = document.createElement('option');
        option.value = month;
        option.textContent = `${year}年${parseInt(monthNum)}月`;
        select.appendChild(option);

        if (select2) {
            const option2 = document.createElement('option');
            option2.value = month;
            option2.textContent = `${year}年${parseInt(monthNum)}月`;
            select2.appendChild(option2);
        }
    });

    // フィルタ状態を確認: localStorage > state > デフォルト（最新月）
    let currentValue;
    
    // まずlocalStorageを直接確認（stateより優先）
    let savedMonth = null;
    try {
        const savedState = localStorage.getItem('manhour_estimateFilterState');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            savedMonth = parsed.month;
        }
    } catch (e) {
        // ignore
    }
    
    if (savedMonth !== null && (savedMonth === 'all' || sortedMonths.includes(savedMonth))) {
        // localStorageに有効な値がある
        currentValue = savedMonth;
    } else if (estimateFilterState.month !== null) {
        // stateに値がある
        if (estimateFilterState.month === 'all' || sortedMonths.includes(estimateFilterState.month)) {
            currentValue = estimateFilterState.month;
        } else {
            currentValue = getDefaultMonth(select);
        }
    } else {
        // 初回表示時はデフォルト（最新月）を適用
        currentValue = getDefaultMonth(select);
    }
    
    // stateも更新（localStorageへの保存はsetEstimateFilterStateで行われる）
    if (estimateFilterState.month !== currentValue) {
        setEstimateFilterState({ month: currentValue });
    }

    select.value = currentValue;
    if (select2) select2.value = currentValue;

    const items = [
        { value: 'all', label: '全期間' },
        ...sortedMonths.map(month => {
            const [year, monthNum] = month.split('-');
            return {
                value: month,
                label: `${year}/${parseInt(monthNum)}`
            };
        })
    ];
    createSegmentButtons(
        'estimateMonthButtons2',
        'estimateMonthFilter2',
        items,
        currentValue,
        8,
        handleEstimateMonthChange
    );
}

export function updateEstimateVersionOptions() {
    const select = document.getElementById('estimateVersionFilter');
    const select2 = document.getElementById('estimateVersionFilter2');
    if (!select) return;

    const versions = new Set();

    estimates.forEach(e => {
        if (e.version) {
            versions.add(e.version);
        }
    });

    const sortedVersions = Array.from(versions).sort().reverse();

    select.innerHTML = '<option value="all">全版数</option>';
    if (select2) select2.innerHTML = '<option value="all">全版数</option>';

    sortedVersions.forEach(version => {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        select.appendChild(option);

        if (select2) {
            const option2 = document.createElement('option');
            option2.value = version;
            option2.textContent = version;
            select2.appendChild(option2);
        }
    });

    // フィルタ状態を確認: localStorage > state > デフォルト（全版数）
    let currentValue;
    
    // まずlocalStorageを直接確認（stateより優先）
    let savedVersion = null;
    try {
        const savedState = localStorage.getItem('manhour_estimateFilterState');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            savedVersion = parsed.version;
        }
    } catch (e) {
        // ignore
    }
    
    if (savedVersion !== null && (savedVersion === 'all' || sortedVersions.includes(savedVersion))) {
        // localStorageに有効な値がある
        currentValue = savedVersion;
    } else if (estimateFilterState.version !== null) {
        // stateに値がある
        if (estimateFilterState.version === 'all' || sortedVersions.includes(estimateFilterState.version)) {
            currentValue = estimateFilterState.version;
        } else {
            currentValue = 'all';
        }
    } else {
        // 初回表示時はデフォルト（全版数）を適用
        currentValue = 'all';
    }
    
    // stateも更新
    if (estimateFilterState.version !== currentValue) {
        setEstimateFilterState({ version: currentValue });
    }

    select.value = currentValue;
    if (select2) select2.value = currentValue;

    const items = [
        { value: 'all', label: '全版数' },
        ...sortedVersions.slice().reverse().map(version => {
            return {
                value: version,
                label: version
            };
        })
    ];
    createSegmentButtons(
        'estimateVersionButtons2',
        'estimateVersionFilter2',
        items,
        currentValue,
        8,
        handleEstimateVersionChange
    );
}

export function updateActualMonthOptions() {
    const select = document.getElementById('actualMonthFilter');
    const select2 = document.getElementById('actualMonthFilter2');

    const currentValue = select ? select.value : 'all';

    const months = new Set();

    actuals.forEach(a => {
        if (a.date) {
            const month = a.date.substring(0, 7);
            months.add(month);
        }
    });

    const sortedMonths = Array.from(months).sort().reverse();

    if (select) {
        select.innerHTML = '<option value="all">全期間</option>';
        sortedMonths.forEach(month => {
            const [year, monthNum] = month.split('-');
            const option = document.createElement('option');
            option.value = month;
            option.textContent = `${year}年${parseInt(monthNum)}月`;
            select.appendChild(option);
        });
    }

    if (select2) {
        select2.innerHTML = '<option value="all">全期間</option>';
        sortedMonths.forEach(month => {
            const [year, monthNum] = month.split('-');
            const option2 = document.createElement('option');
            option2.value = month;
            option2.textContent = `${year}年${parseInt(monthNum)}月`;
            select2.appendChild(option2);
        });
    }

    const validValue = sortedMonths.includes(currentValue) || currentValue === 'all' ? currentValue : 'all';
    if (select) select.value = validValue;
    if (select2) select2.value = validValue;

    const items = [
        { value: 'all', label: '全期間' },
        ...sortedMonths.slice().reverse().map(month => {
            const [year, monthNum] = month.split('-');
            return {
                value: month,
                label: `${year}/${parseInt(monthNum)}`
            };
        })
    ];
    createSegmentButtons(
        'actualMonthButtons2',
        'actualMonthFilter2',
        items,
        validValue,
        8,
        handleActualMonthChange
    );
}

// ============================================
// デフォルト月設定
// ============================================

export function getDefaultMonth(selectElement) {
    const options = Array.from(selectElement.options);
    // 'all' と 'unassigned' を除外
    const monthOptions = options.filter(opt => opt.value !== 'all' && opt.value !== 'unassigned');

    if (monthOptions.length === 0) return 'all';

    // 現在の年月 (YYYY-MM)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 現在の年月が選択肢にあればそれを優先
    if (monthOptions.some(opt => opt.value === currentMonth)) {
        return currentMonth;
    }

    // なければ最新（最大値）の月を返す fallback
    const latestMonth = monthOptions.reduce((latest, opt) => {
        return opt.value > latest ? opt.value : latest;
    }, monthOptions[0].value);
    return latestMonth;
}

export function setDefaultActualMonth() {
    const select = document.getElementById('actualMonthFilter');
    if (!select) return;

    const select2 = document.getElementById('actualMonthFilter2');

    const defaultMonth = getDefaultMonth(select);
    select.value = defaultMonth;
    if (select2) select2.value = defaultMonth;

    updateSegmentButtonSelection('actualMonthButtons2', defaultMonth);
}

export function setDefaultReportMonth() {
    const select = document.getElementById('reportMonth');
    if (!select) return;

    const select2 = document.getElementById('reportMonth2');

    const defaultMonth = getDefaultMonth(select);
    select.value = defaultMonth;
    if (select2) select2.value = defaultMonth;

    updateSegmentButtonSelection('reportMonthButtons2', defaultMonth);

    // 版数フィルタの選択肢を連動して更新（初期ロード時用）
    updateReportVersionOptions(null, defaultMonth);

    // デフォルト選択後にレポートを更新
    if (typeof window.updateReport === 'function') {
        window.updateReport();
    }
}

export function setDefaultEstimateMonth() {
    const select = document.getElementById('estimateMonthFilter');
    if (!select) return 'all';

    const defaultMonth = getDefaultMonth(select);
    select.value = defaultMonth;

    // セグメントボタンと2番目のselectも更新
    const select2 = document.getElementById('estimateMonthFilter2');
    if (select2) select2.value = defaultMonth;
    updateSegmentButtonSelection('estimateMonthButtons2', defaultMonth);

    return defaultMonth;
}

// ============================================
// フィルタ同期ハンドラ
// ============================================

export function syncMonthToReport(value) {
    const reportMonth = document.getElementById('reportMonth');
    const reportMonth2 = document.getElementById('reportMonth2');
    if (reportMonth) reportMonth.value = value;
    if (reportMonth2) reportMonth2.value = value;

    const reportMonthButtons2 = document.getElementById('reportMonthButtons2');
    if (reportMonthButtons2) {
        updateSegmentButtonSelection('reportMonthButtons2', value);
    }
    
    // 同期後にlocalStorageも更新
    saveReportFilterToStorage();
}

export function syncMonthToEstimate(value) {
    const estimateMonthFilter = document.getElementById('estimateMonthFilter');
    const estimateMonthFilter2 = document.getElementById('estimateMonthFilter2');
    if (estimateMonthFilter) estimateMonthFilter.value = value;
    if (estimateMonthFilter2) estimateMonthFilter2.value = value;

    const estimateMonthButtons2 = document.getElementById('estimateMonthButtons2');
    if (estimateMonthButtons2) {
        updateSegmentButtonSelection('estimateMonthButtons2', value);
    }

    // 版数フィルタの選択肢を連動して更新（レポート用）
    updateReportVersionOptions(null, value);

    // 同期後にlocalStorageも更新
    saveEstimateFilterToStorage();
}

export function syncMonthToActual(value) {
    const actualMonthFilter = document.getElementById('actualMonthFilter');
    const actualMonthFilter2 = document.getElementById('actualMonthFilter2');

    // オプションが存在する場合のみ同期
    if (actualMonthFilter) {
        const optionExists = Array.from(actualMonthFilter.options).some(opt => opt.value === value);
        if (optionExists) {
            actualMonthFilter.value = value;
            if (actualMonthFilter2) actualMonthFilter2.value = value;

            const actualMonthButtons2 = document.getElementById('actualMonthButtons2');
            if (actualMonthButtons2) {
                updateSegmentButtonSelection('actualMonthButtons2', value);
            }
        }
    }
}

export function syncVersionToReport(value) {
    const reportVersion = document.getElementById('reportVersion');
    const reportVersion2 = document.getElementById('reportVersion2');
    if (reportVersion) reportVersion.value = value;
    if (reportVersion2) reportVersion2.value = value;

    const reportVersionButtons2 = document.getElementById('reportVersionButtons2');
    if (reportVersionButtons2) {
        updateSegmentButtonSelection('reportVersionButtons2', value);
    }
    
    // 同期後にlocalStorageも更新
    saveReportFilterToStorage();
}

export function syncVersionToEstimate(value) {
    const estimateVersionFilter = document.getElementById('estimateVersionFilter');
    const estimateVersionFilter2 = document.getElementById('estimateVersionFilter2');
    if (estimateVersionFilter) estimateVersionFilter.value = value;
    if (estimateVersionFilter2) estimateVersionFilter2.value = value;

    const estimateVersionButtons2 = document.getElementById('estimateVersionButtons2');
    if (estimateVersionButtons2) {
        updateSegmentButtonSelection('estimateVersionButtons2', value);
    }

    // 月フィルタの選択肢を連動して更新
    updateMonthOptions(value);
    
    // 同期後にlocalStorageも更新
    saveEstimateFilterToStorage();
}

export function syncFilterTypeToReport(type) {
    const reportFilterType = document.getElementById('reportFilterType');
    if (reportFilterType && reportFilterType.value !== type) {
        reportFilterType.value = type;

        const monthFilterCompact = document.getElementById('reportMonthFilterCompact');
        const versionFilterCompact = document.getElementById('reportVersionFilterCompact');
        const monthFilterSegmented = document.getElementById('reportMonthFilterSegmented');
        const versionFilterSegmented = document.getElementById('reportVersionFilterSegmented');

        if (type === 'month') {
            if (monthFilterCompact) monthFilterCompact.style.display = 'flex';
            if (versionFilterCompact) versionFilterCompact.style.display = 'none';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'none';
        } else {
            if (monthFilterCompact) monthFilterCompact.style.display = 'none';
            if (versionFilterCompact) versionFilterCompact.style.display = 'flex';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'none';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';
        }

        updateFilterTypeButtons(type);
    }
}

export function syncFilterTypeToEstimate(type) {
    const estimateFilterType = document.getElementById('estimateFilterType');
    if (estimateFilterType && estimateFilterType.value !== type) {
        estimateFilterType.value = type;

        const monthFilterCompact = document.getElementById('estimateMonthFilterCompact');
        const versionFilterCompact = document.getElementById('estimateVersionFilterCompact');
        const monthFilterSegmented = document.getElementById('estimateMonthFilterSegmented');
        const versionFilterSegmented = document.getElementById('estimateVersionFilterSegmented');

        if (type === 'month') {
            if (monthFilterCompact) monthFilterCompact.style.display = 'flex';
            if (versionFilterCompact) versionFilterCompact.style.display = 'none';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'none';
        } else {
            if (monthFilterCompact) monthFilterCompact.style.display = 'none';
            if (versionFilterCompact) versionFilterCompact.style.display = 'flex';
            if (monthFilterSegmented) monthFilterSegmented.style.display = 'none';
            if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';
        }

        const themeColor = getThemeColor();
        const btnMonth = document.getElementById('btnEstimateFilterMonth');
        const btnVersion = document.getElementById('btnEstimateFilterVersion');

        if (type === 'month') {
            if (btnMonth) btnMonth.classList.add('active');
            if (btnVersion) btnVersion.classList.remove('active');
        } else {
            if (btnMonth) btnMonth.classList.remove('active');
            if (btnVersion) btnVersion.classList.add('active');
        }
    }
}

export function updateFilterTypeButtons(type) {
    const btnMonth = document.getElementById('btnFilterMonth');
    const btnVersion = document.getElementById('btnFilterVersion');

    if (btnMonth) btnMonth.classList.toggle('active', type === 'month');
    if (btnVersion) btnVersion.classList.toggle('active', type === 'version');
}

// ============================================
// フィルタ変更ハンドラ
// ============================================

export function handleActualMemberChange(value, containerId) {
    const select = document.getElementById('actualMemberSelect');
    const select2 = document.getElementById('actualMemberSelect2');
    if (select) select.value = value;
    if (select2) select2.value = value;
    updateSegmentButtonSelection(containerId, value);
    if (typeof window.renderActualList === 'function') {
        window.renderActualList();
    }
}

// 実績月の追跡用
let lastActualMonth = null;

export function initAnimationState() {
    const select = document.getElementById('actualMonthFilter');
    if (select) {
        lastActualMonth = select.value;
    }
}

export function handleActualMonthChange(value, containerId) {
    const select = document.getElementById('actualMonthFilter');

    // 初回呼び出し時や変数が未設定の場合は現在の値（またはデフォルト）を設定
    if (lastActualMonth === null && select) {
        // 初期値として現在のDOMの値を設定して終わる（次回から比較可能にする）
        // ただし、この関数が呼ばれた時点で「変更後」なので、比較対象がない。
        // UI操作で変更された場合、前の値を知るすべがないため、初回はアニメーションなし。
        // しかし、画面ロード時に初期値が入っているはず。
        // ここに来るのは「変更時」。
        // 仕方ないので、初期化ロジックは別途必要か、あるいは「今回はアニメーションせず、値を保存」する。
        // でもそうすると最初の切り替えでアニメーションしない。
        // 対策: selectにフォーカスした時点の値を取得？ いや、難しい。
        // 妥協: 初回はアニメーションなし。次回からあり。
        // いや、ページ読み込み時に値は決まっている。
        // どこかで初期化したいが... 
        // 暫定対応: lastActualMonthがnullなら、valueと異なると仮定して...いや、方向がわからない。
        // 一旦値を保存してリターン。
        lastActualMonth = value;
    }

    const currentMonth = lastActualMonth;

    // アニメーション方向決定 (スマホのみ)
    let direction = 'none';
    if (window.innerWidth <= 768 && currentMonth && value && currentMonth !== 'all' && value !== 'all' && currentMonth !== value) {
        if (value > currentMonth) direction = 'next';
        else direction = 'prev';
    }

    // 次回のために現在の値を保存
    lastActualMonth = value;

    if (direction !== 'none') {
        const container = document.getElementById('actualList');
        if (container && container.parentNode) {
            // 親要素（タブコンテンツ）のスタイル調整
            container.parentNode.style.position = 'relative';
            container.parentNode.style.overflowX = 'hidden';

            // 現在のコンテンツを複製
            const clone = container.cloneNode(true);
            clone.id = 'actualList-clone';
            clone.style.position = 'absolute';
            clone.style.top = container.offsetTop + 'px'; // 元の位置に合わせる
            clone.style.left = container.offsetLeft + 'px';
            clone.style.width = container.offsetWidth + 'px'; // 幅を固定
            clone.style.zIndex = '10';

            const outClass = direction === 'next' ? 'anim-slide-out-left' : 'anim-slide-out-right';
            clone.classList.add('anim-leaving', outClass);

            container.parentNode.appendChild(clone);

            // 実際の更新処理
            const select2 = document.getElementById('actualMonthFilter2');
            if (select) select.value = value;
            if (select2) select2.value = value;
            updateSegmentButtonSelection(containerId, value);
            if (typeof window.renderActualList === 'function') {
                window.renderActualList();
            }

            // 新しいコンテンツのアニメーション
            const inClass = direction === 'next' ? 'anim-slide-in-right' : 'anim-slide-in-left';
            container.classList.add('anim-entering', inClass);

            // クリーンアップ
            setTimeout(() => {
                if (clone.parentNode) clone.parentNode.removeChild(clone);
                container.classList.remove('anim-entering', inClass);
                container.parentNode.style.overflowX = ''; // 戻す
                container.parentNode.style.position = '';
            }, 300);
            return;
        }
    }

    // 通常更新
    const select2 = document.getElementById('actualMonthFilter2');
    if (select) select.value = value;
    if (select2) select2.value = value;
    updateSegmentButtonSelection(containerId, value);

    // 他のタブと月フィルタを同期
    syncMonthToReport(value);
    syncMonthToEstimate(value);

    if (typeof window.renderActualList === 'function') {
        window.renderActualList();
    }
}

export function handleEstimateMonthChange(value, containerId) {
    const filterElement = document.getElementById('estimateMonthFilter');
    const currentMonth = filterElement ? filterElement.value : null;

    // 表のスクロール比率を保存（estimateListを使用）
    const tableElement = document.getElementById('estimateList');
    let scrollRatio = null;
    let shouldUseTableRatio = false;

    if (tableElement) {
        const tableRect = tableElement.getBoundingClientRect();
        // テーブルの上端が画面上部より上（または少し下）にある場合のみ比率計算を使用
        if (tableRect.top <= 100) {
            shouldUseTableRatio = true;
            scrollRatio = getTableScrollRatio(tableElement);
        }
    }

    const savedScrollY = window.scrollY;

    // 通常更新 (アニメーションなし - 実績一覧タブのみアニメーション有効)
    if (filterElement) {
        filterElement.value = value;
    }

    // フィルタ状態を保存
    setEstimateFilterState({ month: value });
    
    // localStorageに直接保存（リロード時の復元用）
    saveEstimateFilterToStorage();

    const filterTypeEl = document.getElementById('estimateFilterType');
    if (filterTypeEl) filterTypeEl.value = 'month';

    updateSegmentButtonSelection(containerId, value);
    syncMonthToReport(value);
    syncMonthToActual(value);
    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }

    // スクロール位置を復元
    if (shouldUseTableRatio) {
        restoreTableScrollRatio(tableElement, scrollRatio);
    } else {
        requestAnimationFrame(() => {
            window.scrollTo(0, savedScrollY);
        });
    }
}

export function handleEstimateVersionChange(value, containerId) {
    const filterElement = document.getElementById('estimateVersionFilter');
    if (filterElement) {
        filterElement.value = value;
    }

    // フィルタ状態を保存
    setEstimateFilterState({ version: value });
    
    // localStorageに直接保存（リロード時の復元用）
    saveEstimateFilterToStorage();

    const filterTypeEl = document.getElementById('estimateFilterType');
    if (filterTypeEl) filterTypeEl.value = 'version';

    // 表のスクロール比率を保存（estimateListを使用）
    const tableElement = document.getElementById('estimateList');
    let scrollRatio = null;
    let shouldUseTableRatio = false;

    if (tableElement) {
        const tableRect = tableElement.getBoundingClientRect();
        if (tableRect.top <= 100) {
            shouldUseTableRatio = true;
            scrollRatio = getTableScrollRatio(tableElement);
        }
    }

    const savedScrollY = window.scrollY;

    // UI toggling logic removed as per instruction.
    updateSegmentButtonSelection(containerId, value);
    syncVersionToReport(value);
    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }

    // スクロール位置を復元
    if (shouldUseTableRatio) {
        restoreTableScrollRatio(tableElement, scrollRatio);
    } else {
        requestAnimationFrame(() => {
            window.scrollTo(0, savedScrollY);
        });
    }
}

export function handleReportMonthChange(value, containerId) {
    const select = document.getElementById('reportMonth');
    const select2 = document.getElementById('reportMonth2');
    if (select) select.value = value;
    if (select2) select2.value = value;

    const filterTypeEl = document.getElementById('reportFilterType');
    if (filterTypeEl) filterTypeEl.value = 'month';

    // フィルタ状態を保存
    setReportFilterState({ month: value });
    
    // localStorageに直接保存（リロード時の復元用）
    saveReportFilterToStorage();

    // 表のスクロール比率を保存（reportDetailViewを使用）
    const tableElement = document.getElementById('reportDetailView');
    let scrollRatio = null;
    let shouldUseTableRatio = false;

    if (tableElement) {
        const tableRect = tableElement.getBoundingClientRect();
        // テーブルの上端が画面上部より上（または少し下）にある場合のみ比率計算を使用
        // つまり、マトリクス表を現在見ている（またはスクロールして通り過ぎた）場合
        // 100pxはヘッダーやマージン分のバッファ
        if (tableRect.top <= 100) {
            shouldUseTableRatio = true;
            scrollRatio = getTableScrollRatio(tableElement);
        }
    }

    const savedScrollY = window.scrollY;

    updateSegmentButtonSelection(containerId, value);
    syncMonthToEstimate(value);
    syncMonthToActual(value);

    // 版数フィルタの選択肢を連動して更新
    updateReportVersionOptions(null, value);

    if (typeof window.updateReport === 'function') {
        window.updateReport();
    }

    // スクロール位置を復元
    if (shouldUseTableRatio) {
        restoreTableScrollRatio(tableElement, scrollRatio);
    } else {
        // マトリクス表以外を見ている場合は、単純にページスクロール位置を維持
        requestAnimationFrame(() => {
            window.scrollTo(0, savedScrollY);
        });
    }
}

export function handleReportVersionChange(value, containerId) {
    const select = document.getElementById('reportVersion');
    const select2 = document.getElementById('reportVersion2');
    if (select) select.value = value;
    if (select2) select2.value = value;

    const filterTypeEl = document.getElementById('reportFilterType');
    if (filterTypeEl) filterTypeEl.value = 'version';

    // フィルタ状態を保存
    setReportFilterState({ version: value });
    
    // localStorageに直接保存（リロード時の復元用）
    saveReportFilterToStorage();

    // 表のスクロール比率を保存（reportDetailViewを使用）
    const tableElement = document.getElementById('reportDetailView');
    let scrollRatio = null;
    let shouldUseTableRatio = false;

    if (tableElement) {
        const tableRect = tableElement.getBoundingClientRect();
        if (tableRect.top <= 100) {
            shouldUseTableRatio = true;
            scrollRatio = getTableScrollRatio(tableElement);
        }
    }

    const savedScrollY = window.scrollY;

    updateSegmentButtonSelection(containerId, value);
    syncVersionToEstimate(value);

    // 月フィルタの選択肢を連動して更新
    updateMonthOptions(value);

    if (typeof window.updateReport === 'function') {
        window.updateReport();
    }

    // スクロール位置を復元
    if (shouldUseTableRatio) {
        restoreTableScrollRatio(tableElement, scrollRatio);
    } else {
        requestAnimationFrame(() => {
            window.scrollTo(0, savedScrollY);
        });
    }
}

export function handleEstimateFilterTypeChange() {
    const filterType = document.getElementById('estimateFilterType').value;
    const monthFilterSegmented = document.getElementById('estimateMonthFilterSegmented');
    const versionFilterSegmented = document.getElementById('estimateVersionFilterSegmented');

    // 全てのフィルタ要素を表示状態に保つ（フィルタタイプによる非表示を廃止）
    if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
    if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';

    if (filterType === 'month') {
        const estimateMonthEl = document.getElementById('estimateMonthFilter');
        if (estimateMonthEl) {
            // 月オプションが「全期間」のみの場合、確実に 'all' を設定
            const hasMonthOptions = estimateMonthEl.options.length > 1;
            if (!hasMonthOptions) {
                estimateMonthEl.value = 'all';
                const estimateMonthEl2 = document.getElementById('estimateMonthFilter2');
                if (estimateMonthEl2) estimateMonthEl2.value = 'all';
                updateSegmentButtonSelection('estimateMonthButtons2', 'all');
            } else {
                // 月オプションがある場合は最新の月を選択（セグメントボタンも更新される）
                setDefaultEstimateMonth();
            }
        }
    } else {
        // 版数別フィルタの場合: 保存された状態または現在の選択を維持
        // デフォルトは全版数（'all'）のまま上書きしない
    }

    syncFilterTypeToReport(filterType);

    if (filterType === 'month') {
        const estimateMonthEl = document.getElementById('estimateMonthFilter');
        if (estimateMonthEl && estimateMonthEl.value) {
            syncMonthToReport(estimateMonthEl.value);
        }
    } else {
        const estimateVersionEl = document.getElementById('estimateVersionFilter');
        if (estimateVersionEl && estimateVersionEl.value) {
            syncVersionToReport(estimateVersionEl.value);
        }
    }

    // セグメントボタンのスタイルを更新（テーマカラー適用）
    updateSegmentedButtons();

    if (typeof window.renderEstimateList === 'function') {
        window.renderEstimateList();
    }
}

export function setEstimateFilterType(type) {
    const filterTypeEl = document.getElementById('estimateFilterType');
    if (filterTypeEl) filterTypeEl.value = type;

    const btnMonth = document.getElementById('btnEstimateFilterMonth');
    const btnVersion = document.getElementById('btnEstimateFilterVersion');

    if (type === 'month') {
        if (btnMonth) btnMonth.classList.add('active');
        if (btnVersion) btnVersion.classList.remove('active');
    } else {
        if (btnMonth) btnMonth.classList.remove('active');
        if (btnVersion) btnVersion.classList.add('active');
    }

    handleEstimateFilterTypeChange();
}

export function handleReportFilterTypeChange() {
    try {
        const filterTypeEl = document.getElementById('reportFilterType');
        if (!filterTypeEl) return;

        const filterType = filterTypeEl.value;
        
        // フィルタタイプを保存
        setReportFilterState({ filterType: filterType });
        
        // localStorageに直接保存（リロード時の復元用）
        saveReportFilterToStorage();
        
        const monthFilterSegmented = document.getElementById('reportMonthFilterSegmented');
        const versionFilterSegmented = document.getElementById('reportVersionFilterSegmented');

        // 全てのフィルタ要素を表示状態に保つ
        if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
        if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';

        if (filterType === 'month') {
            const reportMonthEl = document.getElementById('reportMonth');
            if (reportMonthEl) {
                // 月オプションが「全期間」のみの場合、確実に 'all' を設定
                const hasMonthOptions = reportMonthEl.options.length > 1;
                if (!hasMonthOptions) {
                    reportMonthEl.value = 'all';
                    const reportMonth2El = document.getElementById('reportMonth2');
                    if (reportMonth2El) reportMonth2El.value = 'all';
                    updateSegmentButtonSelection('reportMonthButtons2', 'all');
                } else {
                    // 月オプションがある場合は最新の月を選択（セグメントボタンも更新される）
                    setDefaultReportMonth();
                }
            }
        } else {
            // 版数別フィルタの場合: 保存された状態または現在の選択を維持
            // デフォルトは全版数（'all'）のまま上書きしない
        }

        syncFilterTypeToEstimate(filterType);

        if (filterType === 'month') {
            const reportMonthEl = document.getElementById('reportMonth');
            if (reportMonthEl && reportMonthEl.value) {
                syncMonthToEstimate(reportMonthEl.value);
            }
        } else {
            const reportVersionEl = document.getElementById('reportVersion');
            if (reportVersionEl && reportVersionEl.value) {
                syncVersionToEstimate(reportVersionEl.value);
            }
        }

        if (typeof window.updateReport === 'function') {
            window.updateReport();
        }
    } catch (e) {
        console.error('handleReportFilterTypeChange error:', e);
    }
}

export function setReportFilterType(type) {
    try {
        const filterTypeEl = document.getElementById('reportFilterType');
        if (filterTypeEl) filterTypeEl.value = type;
        handleReportFilterTypeChange();
    } catch (e) {
        console.error('setReportFilterType error:', e);
    }
}

/**
 * 保存されたレポートフィルタ条件を復元する
 * リロード時に前回のフィルタ状態を維持するため
 */

/**
 * localStorageからフィルタ状態をstateモジュールに復元する（DOMは更新しない）
 * オプション更新より前に呼び出す必要がある
 */

/**
 * 見積フィルタの現在の値をlocalStorageに保存する
 */
function saveEstimateFilterToStorage() {
    try {
        const monthEl = document.getElementById('estimateMonthFilter');
        const versionEl = document.getElementById('estimateVersionFilter');
        const state = {
            month: monthEl ? monthEl.value : null,
            version: versionEl ? versionEl.value : null
        };
        localStorage.setItem('manhour_estimateFilterState', JSON.stringify(state));
        console.log('[Filter] Saved estimate filter to storage:', state);
    } catch (e) {
        console.warn('Failed to save estimate filter:', e);
    }
}

/**
 * レポートフィルタの現在の値をlocalStorageに保存する
 */
function saveReportFilterToStorage() {
    try {
        const filterTypeEl = document.getElementById('reportFilterType');
        const monthEl = document.getElementById('reportMonth');
        const versionEl = document.getElementById('reportVersion');
        const state = {
            filterType: filterTypeEl ? filterTypeEl.value : 'version',
            month: monthEl ? monthEl.value : null,
            version: versionEl ? versionEl.value : null
        };
        localStorage.setItem('manhour_reportFilterState', JSON.stringify(state));
        console.log('[Filter] Saved report filter to storage:', state);
    } catch (e) {
        console.warn('Failed to save report filter:', e);
    }
}

export function loadFilterStatesFromStorage() {
    // 見積フィルタ
    try {
        const savedEstimate = localStorage.getItem('manhour_estimateFilterState');
        if (savedEstimate) {
            const state = JSON.parse(savedEstimate);
            // stateモジュールを直接更新（localStorageには書き込まない）
            if (state.month !== undefined) {
                setEstimateFilterState({ month: state.month });
            }
            if (state.version !== undefined) {
                setEstimateFilterState({ version: state.version });
            }
            console.log('[Filter] Loaded estimate filter state to memory:', state);
        }
    } catch (e) {
        console.warn('Failed to load estimate filter state:', e);
    }
    
    // レポートフィルタ
    try {
        const savedReport = localStorage.getItem('manhour_reportFilterState');
        if (savedReport) {
            const state = JSON.parse(savedReport);
            // stateモジュールを直接更新（localStorageには書き込まない）
            if (state.filterType !== undefined) {
                setReportFilterState({ filterType: state.filterType });
            }
            if (state.month !== undefined) {
                setReportFilterState({ month: state.month });
            }
            if (state.version !== undefined) {
                setReportFilterState({ version: state.version });
            }
            console.log('[Filter] Loaded report filter state to memory:', state);
        }
    } catch (e) {
        console.warn('Failed to load report filter state:', e);
    }
}

export function restoreReportFilterState() {
    try {
        const savedState = localStorage.getItem('manhour_reportFilterState');
        console.log('[Filter] Restoring report filter state:', savedState);
        if (!savedState) return false;

        const state = JSON.parse(savedState);
        let restored = false;

        // フィルタタイプの復元（handleReportFilterTypeChangeは呼ばない - デフォルト設定が上書きされるため）
        if (state.filterType) {
            const reportFilterType = document.getElementById('reportFilterType');
            if (reportFilterType) {
                reportFilterType.value = state.filterType;
                // UIの表示/非表示を直接制御
                const monthFilterSegmented = document.getElementById('reportMonthFilterSegmented');
                const versionFilterSegmented = document.getElementById('reportVersionFilterSegmented');
                if (monthFilterSegmented) monthFilterSegmented.style.display = 'flex';
                if (versionFilterSegmented) versionFilterSegmented.style.display = 'flex';
                restored = true;
            }
        }

        // 版数フィルタの復元
        if (state.version) {
            const reportVersion = document.getElementById('reportVersion');
            const reportVersion2 = document.getElementById('reportVersion2');
            if (reportVersion) {
                // 選択肢に存在する場合のみ復元
                const optionExists = Array.from(reportVersion.options).some(opt => opt.value === state.version);
                if (optionExists) {
                    reportVersion.value = state.version;
                    if (reportVersion2) reportVersion2.value = state.version;
                    updateSegmentButtonSelection('reportVersionButtons2', state.version);
                    restored = true;
                }
            }
        }

        // 月フィルタの復元
        if (state.month) {
            const reportMonth = document.getElementById('reportMonth');
            const reportMonth2 = document.getElementById('reportMonth2');
            if (reportMonth) {
                // 選択肢に存在する場合のみ復元
                const optionExists = Array.from(reportMonth.options).some(opt => opt.value === state.month);
                if (optionExists) {
                    reportMonth.value = state.month;
                    if (reportMonth2) reportMonth2.value = state.month;
                    updateSegmentButtonSelection('reportMonthButtons2', state.month);
                    restored = true;
                }
            }
        }

        // 状態をstateモジュールにも反映
        if (restored) {
            setReportFilterState(state);
        }

        return restored;
    } catch (e) {
        console.warn('Failed to restore report filter state:', e);
        return false;
    }
}


/**
 * 保存された見積フィルタ条件を復元する
 * リロード時に前回のフィルタ状態を維持するため
 */
export function restoreEstimateFilterState() {
    try {
        const savedState = localStorage.getItem('manhour_estimateFilterState');
        console.log('[Filter] Restoring estimate filter state:', savedState);
        if (!savedState) return false;

        const state = JSON.parse(savedState);
        let restored = false;

        // 版数フィルタの復元
        if (state.version) {
            const estimateVersion = document.getElementById('estimateVersionFilter');
            if (estimateVersion) {
                // 選択肢に存在する場合のみ復元
                const optionExists = Array.from(estimateVersion.options).some(opt => opt.value === state.version);
                if (optionExists) {
                    estimateVersion.value = state.version;
                    updateSegmentButtonSelection('estimateVersionButtons', state.version);
                    restored = true;
                }
            }
        }

        // 月フィルタの復元
        if (state.month) {
            const estimateMonth = document.getElementById('estimateMonthFilter');
            if (estimateMonth) {
                // 選択肢に存在する場合のみ復元
                const optionExists = Array.from(estimateMonth.options).some(opt => opt.value === state.month);
                if (optionExists) {
                    estimateMonth.value = state.month;
                    updateSegmentButtonSelection('estimateMonthButtons', state.month);
                    restored = true;
                }
            }
        }

        // 状態をstateモジュールにも反映（localStorageへの再保存をスキップするため直接設定）
        if (restored) {
            setEstimateFilterState(state);
        }

        return restored;
    } catch (e) {
        console.warn('Failed to restore estimate filter state:', e);
        return false;
    }
}

// ============================================
// 版数・帳票名変更ハンドラ
// ============================================

export function handleVersionChange(selectId) {
    const select = document.getElementById(selectId);
    if (select.value === '__new__') {
        const newVersion = prompt('新しい版数を入力してください（例: 第2025.12版）');
        if (newVersion && newVersion.trim()) {
            const option = document.createElement('option');
            option.value = newVersion.trim();
            option.textContent = newVersion.trim();
            select.insertBefore(option, select.options[2]);
            select.value = newVersion.trim();
        } else {
            select.value = '';
        }
    }

    if (selectId === 'editActualVersion') {
        const modal = document.getElementById('editActualModal');
        const memberSelect = document.getElementById('editActualMember');
        let member = memberSelect ? memberSelect.value : null;

        if (!member && modal && modal.dataset.calendarMember) {
            member = modal.dataset.calendarMember;
        }

        if (member && typeof window.updateEditActualTaskList === 'function') {
            const editIdInput = document.getElementById('editActualId');
            const isEditMode = editIdInput && editIdInput.value !== '';
            window.updateEditActualTaskList(member, isEditMode, select.value);
        }
    }
}

export function handleQuickFormNameChange() {
    const select = document.getElementById('quickEstFormNameSelect');
    const input = document.getElementById('quickEstFormName');

    if (select.value === '__new__') {
        select.style.display = 'none';
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.value = select.value;
    }
}

export function handleAddFormNameChange() {
    const select = document.getElementById('addEstFormNameSelect');
    const input = document.getElementById('addEstFormName');

    if (select.value === '__new__') {
        select.style.display = 'none';
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.value = select.value;
    }
}

export function handleEditFormNameChange() {
    const select = document.getElementById('editTaskFormNameSelect');
    const input = document.getElementById('editTaskFormName');

    if (select.value === '__new__') {
        select.style.display = 'none';
        input.style.display = 'block';
        input.value = '';
        input.focus();
    } else {
        input.value = select.value;
    }
}

export function handleEditActualMemberChange() {
    const memberSelect = document.getElementById('editActualMember');
    const versionSelect = document.getElementById('editActualVersion');
    const member = memberSelect ? memberSelect.value : null;
    const version = versionSelect ? versionSelect.value : null;

    if (member && typeof window.updateEditActualTaskList === 'function') {
        const editIdInput = document.getElementById('editActualId');
        const isEditMode = editIdInput && editIdInput.value !== '';
        window.updateEditActualTaskList(member, isEditMode, version);
    }
}

// ============================================
// 設定値を読み込んでUIに反映
// ============================================

export function syncSettingsToUI() {
    // チェックボックス
    const checkboxMap = {
        'showMonthColorsCheckbox': showMonthColorsSetting,
        'showProgressBarsCheckbox': showProgressBarsSetting,
        'showProgressPercentageCheckbox': showProgressPercentageSetting,
        'autoBackupEnabled': window.autoBackupEnabled
    };

    Object.entries(checkboxMap).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    });

    // レポートマトリクスの背景色モード（ラジオボタン）
    if (reportMatrixBgColorMode) {
        const radioButton = document.querySelector(`input[name="reportMatrixBgColorMode"][value="${reportMatrixBgColorMode}"]`);
        if (radioButton) radioButton.checked = true;
    }

    // 進捗バースタイル（ラジオボタン）
    if (progressBarStyle) {
        const radioButton = document.querySelector(`input[name="progressBarStyle"][value="${progressBarStyle}"]`);
        if (radioButton) radioButton.checked = true;
    }

    // 見積/実績表示形式（ラジオボタン）
    if (matrixEstActFormat) {
        const radioButton = document.querySelector(`input[name="matrixEstActFormat"][value="${matrixEstActFormat}"]`);
        if (radioButton) radioButton.checked = true;
    }

    // 日付/月表示形式（ラジオボタン）


    // 担当者の表示順（window.memberOrderを使用して確実に最新値を取得）
    const memberOrderEl = document.getElementById('memberOrder');
    if (memberOrderEl && window.memberOrder) {
        memberOrderEl.value = window.memberOrder;
    }

    // テーマ設定の要素は Theme.loadThemeSettings で別途同期されるが、
    // ここでも念のため、State と window 変数を最終確認
}

/**
 * 全ての画面表示を更新
 */
export function updateAllDisplays() {
    if (debugModeEnabled) console.log('🔄 全画面更新実行');

    // 担当者表示順をDOMから取得して状態に反映
    const memberOrderEl = document.getElementById('memberOrder');
    if (memberOrderEl) {
        const newValue = memberOrderEl.value.trim();
        setMemberOrder(newValue);
    }

    // 各モジュールのレンダリング関数を呼び出し
    // window を介して呼び出す（循環参照を避けるためと、init.js で確実に公開されているため）
    if (typeof window.renderEstimateList === 'function') window.renderEstimateList();
    if (typeof window.renderActualList === 'function') window.renderActualList();
    if (typeof window.renderTodayActuals === 'function') window.renderTodayActuals();
    if (typeof window.updateReport === 'function') window.updateReport();
    if (typeof window.renderCompanyHolidayList === 'function') window.renderCompanyHolidayList();
    if (typeof window.updateQuickTaskList === 'function') window.updateQuickTaskList();

    if (debugModeEnabled) console.log('✅ 全画面更新完了');
}

/**
 * 担当者表示順のヘルプを表示
 */
export function showMemberOrderHelp() {
    const helpMsg = `
        <strong>担当者表示順の設定方法:</strong><br><br>
        1. 担当者の名前をカンマ(,)区切りで入力します<br>
        2. ここで指定した順番で、実績一覧やレポートに表示されます<br>
        3. 指定しなかった担当者は、指定された人の後ろに名前順で表示されます<br><br>
        例: <code>佐藤,田中,山田</code><br><br>
        ※入力後は「設定を適用」ボタンを押すか、欄外をクリックすると反映されます。
    `;
    if (typeof window.showAlert === 'function') {
        window.showAlert(helpMsg, true);
    } else {
        alert('担当者表示順の設定方法:\n\n1. 担当者の名前をカンマ(,)区切りで入力します\n2. 指定した順番で表示されます\n3. 指定しなかった人は後ろに名前順で表示されます');
    }
}

console.log('✅ モジュール ui.js loaded');

