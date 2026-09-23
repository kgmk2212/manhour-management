// ============================================
// スケジュールの重なりレーン割り当てと行レイアウト（純粋関数）
// 設計: docs/superpowers/specs/2026-09-24-schedule-lanes-and-insert-drop-design.md §①
// ============================================

/**
 * 予定が占める期間（分割予定はセグメントの最小開始〜最大終了）
 * @param {Object} schedule - startDate / endDate を持つ予定
 * @param {Array<{startDate: string, endDate: string}>|null} [segments] - calculateSegments の結果
 * @returns {{start: string, end: string}} YYYY-MM-DD
 */
export function scheduleSpan(schedule, segments = null) {
    if (!segments || segments.length === 0) {
        return { start: schedule.startDate, end: schedule.endDate };
    }
    let start = segments[0].startDate;
    let end = segments[0].endDate;
    segments.forEach(seg => {
        if (seg.startDate < start) start = seg.startDate;
        if (seg.endDate > end) end = seg.endDate;
    });
    return { start, end };
}

/**
 * 行内の予定を、期間が重ならない最上段のレーンへ詰める（開始日昇順・同日は入力順）
 * 終了日と開始日が同じ日は重なりとみなす（日単位の表示で同じマスを使うため）。
 * @param {Array<Object>} schedules - id を持つ予定
 * @param {Function} [spanOf] - (schedule) => {start, end}。既定は scheduleSpan
 * @returns {{laneOf: Map<string, number>, laneCount: number}}
 */
export function assignLanes(schedules, spanOf = scheduleSpan) {
    const items = schedules
        .map((schedule, order) => ({ schedule, order, span: spanOf(schedule) }))
        .sort((a, b) => (a.span.start < b.span.start ? -1 : a.span.start > b.span.start ? 1 : a.order - b.order));
    const laneEnds = []; // レーンごとの最後の終了日
    const laneOf = new Map();
    items.forEach(({ schedule, span }) => {
        let lane = laneEnds.findIndex(end => end < span.start);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(span.end);
        } else {
            laneEnds[lane] = span.end;
        }
        laneOf.set(schedule.id, lane);
    });
    return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

/**
 * 行ごとのレーン数から、各行の Y オフセットと高さを求める
 * @param {number[]} laneCounts - 行ごとのレーン数（1 以上）
 * @param {{headerHeight: number, rowHeight: number, laneHeight: number}} cfg
 * @returns {{offsets: number[], heights: number[], totalHeight: number}}
 */
export function buildRowLayout(laneCounts, { headerHeight, rowHeight, laneHeight }) {
    const offsets = [];
    const heights = [];
    let y = headerHeight;
    laneCounts.forEach(count => {
        const h = rowHeight + (Math.max(1, count) - 1) * laneHeight;
        offsets.push(y);
        heights.push(h);
        y += h;
    });
    return { offsets, heights, totalHeight: y };
}

/**
 * Y 座標がどの行に入るか（行の範囲外は -1）
 * @param {{offsets: number[], heights: number[]}} layout
 * @param {number} y
 * @returns {number}
 */
export function rowIndexAtY(layout, y) {
    for (let i = 0; i < layout.offsets.length; i++) {
        if (y >= layout.offsets[i] && y < layout.offsets[i] + layout.heights[i]) return i;
    }
    return -1;
}
