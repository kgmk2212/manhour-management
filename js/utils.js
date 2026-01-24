// ============================================
// ユーティリティ関数
// ============================================

import { monthColors, showDeviationColorsSetting } from './state.js';

// カスタムアラート表示
export function showAlert(message, dismissible = false) {
    const modal = document.getElementById('customAlert');
    const messageEl = document.getElementById('customAlertMessage');
    messageEl.textContent = message;
    modal.style.display = 'flex';

    // dismissibleがtrueの場合、外クリックで閉じる
    if (dismissible) {
        modal.onclick = function (event) {
            if (event.target === modal) {
                closeCustomAlert();
            }
        };
    } else {
        modal.onclick = null;
    }
}

// カスタムアラートを閉じる
export function closeCustomAlert() {
    document.getElementById('customAlert').style.display = 'none';
}

// 見積データを正規化（旧形式から新形式への変換）
export function normalizeEstimate(e) {
    // 新形式がすでにある場合（workMonthsが空でない場合のみ）
    if (e.workMonths && e.workMonths.length > 0 && e.monthlyHours && Object.keys(e.monthlyHours).length > 0) {
        return e;
    }

    // 旧形式（workMonthのみ）を新形式に変換
    if (e.workMonth && (!e.workMonths || e.workMonths.length === 0)) {
        return {
            ...e,
            workMonths: [e.workMonth],
            monthlyHours: { [e.workMonth]: e.hours }
        };
    }

    // workMonthもworkMonthsも空の場合（未設定）
    if (!e.workMonth && (!e.workMonths || e.workMonths.length === 0)) {
        return {
            ...e,
            workMonths: [],
            monthlyHours: {}
        };
    }

    return e;
}

// 月の範囲を生成（YYYY-MM形式）
export function generateMonthRange(startMonth, endMonth) {
    const months = [];
    let current = startMonth;

    while (current <= endMonth) {
        months.push(current);
        const [y, m] = current.split('-').map(Number);
        const nextDate = new Date(y, m, 1); // 次の月の1日
        const nextYear = nextDate.getFullYear();
        const nextMonth = nextDate.getMonth() + 1;
        current = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    }

    return months;
}

// 月選択肢を生成
export function generateMonthOptions(selectId, selectedValue = '', minValue = null) {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '';

    // 過去1年から未来2年まで
    const now = new Date();
    const startDate = new Date(now.getFullYear() - 1, 0, 1);
    const endDate = new Date(now.getFullYear() + 2, 11, 31);

    const months = [];
    let current = new Date(startDate);

    while (current <= endDate) {
        const year = current.getFullYear();
        const month = current.getMonth() + 1;
        const value = `${year}-${String(month).padStart(2, '0')}`;
        // minValueが指定されている場合、それより後の月のみを含める
        if (!minValue || value > minValue) {
            months.push({ value, label: `${year}年${month}月` });
        }
        current.setMonth(current.getMonth() + 1);
    }

    months.forEach(m => {
        const option = document.createElement('option');
        option.value = m.value;
        option.textContent = m.label;
        if (m.value === selectedValue) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// 月から背景色を取得
export function getMonthColor(workMonths) {
    if (!workMonths || workMonths.length === 0) {
        return { bg: 'rgba(150, 150, 150, 0.15)', tooltip: '未設定', isMultiple: false };
    }

    if (workMonths.length === 1) {
        const month = workMonths[0].split('-')[1];
        const [year, m] = workMonths[0].split('-');
        const color = monthColors[month] || { bg: 'rgba(200, 200, 200, 0.3)', name: month + '月' };
        return {
            bg: color.bg,
            tooltip: `${year}年${parseInt(m)}月`,
            isMultiple: false
        };
    }

    // 複数月の場合 - 逆斜線ストライプで開始月と終了月の色を使用
    const firstMonth = workMonths[0].split('-')[1];
    const lastMonth = workMonths[workMonths.length - 1].split('-')[1];
    const [y1, m1] = workMonths[0].split('-');
    const [y2, m2] = workMonths[workMonths.length - 1].split('-');

    const color1 = monthColors[firstMonth]?.rgb || '150, 150, 150';
    const color2 = monthColors[lastMonth]?.rgb || '150, 150, 150';

    return {
        bg: `repeating-linear-gradient(-45deg, rgba(${color1}, 0.20) 0px, rgba(${color1}, 0.20) 6px, rgba(${color2}, 0.20) 6px, rgba(${color2}, 0.20) 12px)`,
        tooltip: `${y1}年${parseInt(m1)}月〜${y2}年${parseInt(m2)}月`,
        isMultiple: true
    };
}

// 月カラー凡例を生成
export function generateMonthColorLegend(usedMonths, hasMultipleMonths = false, hasUnassigned = false) {
    if (!usedMonths || usedMonths.size === 0) return '';

    let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 12px;">';
    html += '<span style="font-weight: 600; color: #666; margin-right: 5px;">月別:</span>';

    // 使用されている月のみ表示（ソートして）
    const sortedMonths = Array.from(usedMonths).sort();
    sortedMonths.forEach(monthKey => {
        const [year, month] = monthKey.split('-');
        const color = monthColors[month];
        if (color) {
            html += `<span style="display: inline-flex; align-items: center; gap: 4px;">
                <span style="width: 16px; height: 16px; background: ${color.bg}; border: 1px solid rgba(0,0,0,0.1); border-radius: 3px;"></span>
                <span style="color: #555;">${year}/${parseInt(month)}</span>
            </span>`;
        }
    });

    // 複数月の凡例（表示中のデータに存在する場合のみ）
    if (hasMultipleMonths) {
        html += `<span style="display: inline-flex; align-items: center; gap: 4px; margin-left: 10px;">
            <span style="width: 16px; height: 16px; background: repeating-linear-gradient(-45deg, rgba(70, 130, 200, 0.35) 0px, rgba(70, 130, 200, 0.35) 3px, rgba(50, 180, 140, 0.35) 3px, rgba(50, 180, 140, 0.35) 6px); border: 1px solid rgba(0,0,0,0.1); border-radius: 3px;"></span>
            <span style="color: #666;">複数月</span>
        </span>`;
    }

    // 未設定の凡例（表示中のデータに存在する場合のみ）
    if (hasUnassigned) {
        html += `<span style="display: inline-flex; align-items: center; gap: 4px; margin-left: 5px;">
            <span style="width: 16px; height: 16px; background: rgba(150, 150, 150, 0.15); border: 1px solid rgba(0,0,0,0.1); border-radius: 3px;"></span>
            <span style="color: #999;">未設定</span>
        </span>`;
    }

    html += '</div>';
    return html;
}

// 乖離率から背景色を取得
export function getDeviationColor(estimate, actual) {
    // 設定がオフの場合は白を返す
    if (!showDeviationColorsSetting) {
        return '#ffffff';
    }

    if (estimate === 0 && actual === 0) {
        return '#ffffff'; // 両方0は白
    }
    if (estimate === 0 && actual > 0) {
        return '#fffef0'; // 見積なし実績あり：薄い黄
    }
    if (estimate > 0 && actual === 0) {
        return '#f0f8ff'; // 見積のみ：薄い青
    }

    const deviation = ((actual - estimate) / estimate) * 100;

    if (Math.abs(deviation) < 3) {
        return '#ffffff'; // ±3%以内は白
    }

    if (deviation > 0) {
        // 実績 > 見積：赤系（10段階）
        if (deviation < 5) return '#fff8f8';
        if (deviation < 8) return '#fff0f0';
        if (deviation < 12) return '#ffe8e8';
        if (deviation < 18) return '#ffe0e0';
        if (deviation < 25) return '#ffd0d0';
        if (deviation < 35) return '#ffc0c0';
        if (deviation < 50) return '#ffb0b0';
        if (deviation < 70) return '#ffa0a0';
        if (deviation < 100) return '#ff9090';
        return '#ff8080';
    } else {
        // 実績 < 見積：緑系（10段階）
        const absDeviation = Math.abs(deviation);
        if (absDeviation < 5) return '#f8fff8';
        if (absDeviation < 8) return '#f0fff0';
        if (absDeviation < 12) return '#e8ffe8';
        if (absDeviation < 18) return '#e0ffe0';
        if (absDeviation < 25) return '#d0ffd0';
        if (absDeviation < 35) return '#c0ffc0';
        if (absDeviation < 50) return '#b0ffb0';
        if (absDeviation < 70) return '#a0ffa0';
        if (absDeviation < 100) return '#90ff90';
        return '#80ff80';
    }
}

// メンバーリストを指定された順序でソートする
export function sortMembers(members, orderString) {
    // SetやMapの場合は配列に変換
    const memberArray = Array.isArray(members) ? members : Array.from(members);

    // 順序指定がない場合は単純ソート
    if (!orderString || !orderString.trim()) {
        return memberArray.sort();
    }

    const orderList = orderString.split(',').map(m => m.trim()).filter(m => m);
    const orderedMembers = [];
    const unorderedMembers = [];

    // 指定順のメンバーを抽出
    orderList.forEach(name => {
        if (memberArray.includes(name)) {
            orderedMembers.push(name);
        }
    });

    // 指定外のメンバーを抽出
    memberArray.forEach(m => {
        if (!orderedMembers.includes(m)) {
            unorderedMembers.push(m);
        }
    });

    // 指定順のメンバー + 指定外のメンバー（アルファベット順）
    return [...orderedMembers, ...unorderedMembers.sort()];
}

// ============================================
// UIユーティリティ
// ============================================

/**
 * コンテナにドラッグスクロール機能を追加
 * @param {HTMLElement} container 
 */
export function enableDragScroll(container) {
    if (!container || container.dataset.dragScrollEnabled) return;

    let isDown = false;
    let startX;
    let scrollLeft;

    const onMouseDown = (e) => {
        isDown = true;
        container.dataset.isDragging = 'false';
        container.style.cursor = 'grabbing';
        startX = e.pageX;
        scrollLeft = container.scrollLeft;

        // ドラッグ中はdocument全体でイベントを監視（コンテナ外に出てもドラッグ継続）
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        // テキスト選択などを防止
        e.preventDefault();
    };

    const onMouseMove = (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX;
        const walk = (x - startX) * 2; // スクロール速度
        container.scrollLeft = scrollLeft - walk;

        // わずかな動きはクリックとみなす
        if (Math.abs(x - startX) > 5) {
            container.dataset.isDragging = 'true';
        }
    };

    const onMouseUp = () => {
        isDown = false;
        container.style.cursor = 'grab';

        // イベントリスナー解除
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // クリックイベントハンドラが動作する時間を確保してからフラグをリセット
        setTimeout(() => {
            container.dataset.isDragging = 'false';
        }, 10);
    };

    container.addEventListener('mousedown', onMouseDown);

    // キャプチャフェーズでクリックイベントを捕捉し、ドラッグ中なら停止
    container.addEventListener('click', (e) => {
        if (container.dataset.isDragging === 'true') {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // 初期スタイル
    container.style.cursor = 'grab';
    container.style.userSelect = 'none';
    container.dataset.dragScrollEnabled = 'true';
}

// ============================================
// 重複コード統合ユーティリティ
// ============================================

/**
 * 対象版数のリストを取得
 * report.jsの3箇所で重複していたロジックを統合
 * @param {Array} estimates - 見積配列
 * @param {Array} actuals - 実績配列
 * @param {string} versionFilter - フィルタ値（'all'または特定版数）
 * @returns {Array} - 対象版数の配列
 */
export function getTargetVersions(estimates, actuals, versionFilter) {
    if (versionFilter !== 'all') {
        return [versionFilter];
    }

    // 全版数を取得
    const versions = [...new Set([
        ...estimates.map(e => e.version),
        ...actuals.map(a => a.version)
    ])]
        .filter(v => v && v.trim() !== '')
        .sort();

    return versions;
}

/**
 * 進捗ステータスを判定
 * calculateProgress、updateBulkRowStatus、renderBulkRemainingTableで重複していたロジックを統合
 * @param {number} estimatedHours - 見積工数
 * @param {number} actualHours - 実績工数
 * @param {number} remainingHours - 見込残存時間
 * @param {number} warningThreshold - 警告閾値（デフォルト1.2）
 * @returns {Object} - { status, statusLabel, statusColor, eac }
 */
export function determineProgressStatus(estimatedHours, actualHours, remainingHours, warningThreshold = 1.2) {
    const eac = actualHours + remainingHours; // 予測総工数

    let status = 'unknown';
    let statusLabel = '未設定';
    let statusColor = '#999';

    if (remainingHours === 0 && actualHours > 0) {
        status = 'completed';
        statusLabel = '完了';
        statusColor = '#27ae60';
    } else if (estimatedHours > 0) {
        if (eac <= estimatedHours) {
            status = 'ontrack';
            statusLabel = '順調';
            statusColor = '#3498db';
        } else if (eac <= estimatedHours * warningThreshold) {
            status = 'warning';
            statusLabel = '注意';
            statusColor = '#f39c12';
        } else {
            status = 'exceeded';
            statusLabel = '超過';
            statusColor = '#e74c3c';
        }
    }

    return {
        status,
        statusLabel,
        statusColor,
        eac
    };
}

/**
 * 工数を見やすくフォーマット
 * @param {number} hours - 工数
 * @param {number} decimalPlaces - 小数点以下の桁数（デフォルト1）
 * @returns {string} - フォーマットされた工数
 */
export function formatHours(hours, decimalPlaces = 1) {
    if (hours === 0) return '0';
    if (!hours || isNaN(hours)) return '-';
    return hours.toFixed(decimalPlaces);
}

/**
 * 人日に変換
 * @param {number} hours - 工数
 * @param {number} hoursPerDay - 1日の稼働時間（デフォルト8）
 * @returns {number} - 人日
 */
export function hoursToManDays(hours, hoursPerDay = 8) {
    return hours / hoursPerDay;
}

/**
 * 人月に変換
 * @param {number} hours - 工数
 * @param {number} hoursPerMonth - 1ヶ月の稼働時間（デフォルト160）
 * @returns {number} - 人月
 */
export function hoursToManMonths(hours, hoursPerMonth = 160) {
    return hours / hoursPerMonth;
}

/**
 * 配列を版数とタスクでフィルタリング
 * @param {Array} array - フィルタ対象の配列
 * @param {string} version - 版数
 * @param {string} task - タスク名
 * @param {string|null} process - 工程（オプション）
 * @param {string|null} member - 担当者（オプション）
 * @returns {Array} - フィルタされた配列
 */
export function filterByVersionAndTask(array, version, task, process = null, member = null) {
    return array.filter(item =>
        item.version === version &&
        item.task === task &&
        (process === null || item.process === process) &&
        (member === null || item.member === member)
    );
}

/**
 * 安全にlocalStorageから読み込む
 * @param {string} key - ストレージキー
 * @param {*} defaultValue - デフォルト値
 * @returns {*} - 読み込んだ値またはデフォルト値
 */
export function safeGetLocalStorage(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        return JSON.parse(value);
    } catch (error) {
        console.error(`Error reading from localStorage (key: ${key}):`, error);
        return defaultValue;
    }
}

/**
 * 安全にlocalStorageに保存
 * @param {string} key - ストレージキー
 * @param {*} value - 保存する値
 * @returns {boolean} - 成功したかどうか
 */
export function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`Error writing to localStorage (key: ${key}):`, error);
        return false;
    }
}

/**
 * DOM要素を安全に取得
 * @param {string} selector - セレクタ
 * @param {HTMLElement} parent - 親要素（デフォルトはdocument）
 * @returns {HTMLElement|null} - 要素またはnull
 */
export function safeQuerySelector(selector, parent = document) {
    try {
        return parent.querySelector(selector);
    } catch (error) {
        console.error(`Error in querySelector (selector: ${selector}):`, error);
        return null;
    }
}
