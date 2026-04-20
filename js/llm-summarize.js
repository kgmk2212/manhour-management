/**
 * バックアップ形式のデータ → LLM 入力用の要約 JSON に変換
 *
 * llm-analysis/summarize.py を JavaScript に移植したもの。
 * 出力スキーマは Python 版と同一。
 *
 * 入力: { estimates, actuals, remainingEstimates } のオブジェクト
 *  - バックアップ JSON の読み込み結果、または window.estimates/actuals/remainingEstimates
 * 出力: 要約 JSON オブジェクト
 */

const DEFAULT_WORKING_DAYS_PER_MONTH = 20;
const DEFAULT_HOURS_PER_DAY = 8;
const PROCESSES = ['UI', 'PG', 'PT', 'IT', 'ST'];

/**
 * 小数第1位に丸める（Python 版の round(x, 1) 相当）
 * Python の banker's rounding と完全一致はしないため、非整数混在時は
 * 0.1 程度の差異が発生しうる。検証時は許容誤差を設けること。
 */
function round1(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 10) / 10;
}

/** 精度（%）を計算 */
function calcAccuracy(estimate, actual) {
    if (estimate === 0) return 0.0;
    return round1(actual / estimate * 100);
}

function sumHours(items) {
    let total = 0;
    for (const it of items) total += it.hours || 0;
    return total;
}

/** 全体集計 */
function summarizeOverall(estimates, actuals) {
    const totalEstimate = sumHours(estimates);
    const totalActual = sumHours(actuals);

    const taskEst = new Map();
    const taskAct = new Map();

    for (const e of estimates) {
        const key = `${e.version || ''}\x00${e.task || ''}\x00${e.process || ''}`;
        taskEst.set(key, (taskEst.get(key) || 0) + (e.hours || 0));
    }
    for (const a of actuals) {
        const key = `${a.version || ''}\x00${a.task || ''}\x00${a.process || ''}`;
        taskAct.set(key, (taskAct.get(key) || 0) + (a.hours || 0));
    }

    let overrun = 0;
    let underrun = 0;
    for (const [key, est] of taskEst) {
        const act = taskAct.get(key) || 0;
        if (est > 0) {
            const ratio = act / est;
            if (ratio > 1.2) overrun++;
            else if (ratio < 0.8) underrun++;
        }
    }

    return {
        total_estimate_hours: round1(totalEstimate),
        total_actual_hours: round1(totalActual),
        accuracy_percent: calcAccuracy(totalEstimate, totalActual),
        total_tasks: taskEst.size,
        overrun_tasks: overrun,
        underrun_tasks: underrun,
    };
}

/** バージョン別集計 */
function summarizeByVersion(estimates, actuals, remaining) {
    const versions = [...new Set(estimates.map(e => e.version || ''))].sort();
    const result = [];

    for (const ver of versions) {
        const verEst = estimates.filter(e => e.version === ver);
        const verAct = actuals.filter(a => a.version === ver);
        const verRem = remaining.filter(r => r.version === ver);

        const estHours = sumHours(verEst);
        const actHours = sumHours(verAct);
        const remHours = verRem.reduce((s, r) => s + (r.remainingHours || 0), 0);

        // タスク（task × process のユニーク集合）
        const taskSet = new Set();
        for (const e of verEst) taskSet.add(`${e.task || ''}\x00${e.process || ''}`);
        const tasks = [...taskSet].map(k => k.split('\x00'));

        // 完了判定: 残見積が0 かつ 実績が存在
        const completed = new Set();
        for (const [task, process] of tasks) {
            const taskRem = verRem.filter(r => r.task === task && r.process === process);
            const allZeroOrNoRem = taskRem.length === 0
                || taskRem.every(r => (r.remainingHours || 0) === 0);
            if (allZeroOrNoRem) {
                const hasActual = verAct.some(a => a.task === task && a.process === process);
                if (hasActual) completed.add(`${task}\x00${process}`);
            }
        }

        // 超過タスク
        let overrunCount = 0;
        let worst = null;
        let worstPct = 0;

        for (const [task, process] of tasks) {
            let tEst = 0, tAct = 0;
            for (const e of verEst) {
                if (e.task === task && e.process === process) tEst += e.hours || 0;
            }
            for (const a of verAct) {
                if (a.task === task && a.process === process) tAct += a.hours || 0;
            }
            if (tEst > 0 && tAct / tEst > 1.2) {
                overrunCount++;
                const pct = round1((tAct / tEst - 1) * 100);
                if (pct > worstPct) {
                    worstPct = pct;
                    worst = { task, process, overrun_percent: pct };
                }
            }
        }

        const isCompleted = remHours === 0
            && completed.size === taskSet.size
            && taskSet.size > 0;
        const eac = actHours + remHours;

        const entry = {
            version: ver,
            status: isCompleted ? 'completed' : 'in_progress',
            estimate_hours: round1(estHours),
            actual_hours: round1(actHours),
            accuracy_percent: calcAccuracy(estHours, actHours),
            tasks: taskSet.size,
            completed_tasks: completed.size,
            overrun_tasks_count: overrunCount,
        };

        if (!isCompleted) {
            entry.remaining_hours = round1(remHours);
            entry.eac = round1(eac);
            const progress = eac > 0 ? actHours / eac * 100 : 0;
            entry.progress_rate = round1(progress);
        }

        if (worst) entry.worst_overrun = worst;

        result.push(entry);
    }

    return result;
}

/** 工程別集計 */
function summarizeByProcess(estimates, actuals) {
    const result = [];
    for (const proc of PROCESSES) {
        let est = 0, act = 0;
        for (const e of estimates) if (e.process === proc) est += e.hours || 0;
        for (const a of actuals) if (a.process === proc) act += a.hours || 0;
        if (est > 0 || act > 0) {
            result.push({
                process: proc,
                estimate: round1(est),
                actual: round1(act),
                accuracy: calcAccuracy(est, act),
            });
        }
    }
    return result;
}

/** メンバー別集計 */
function summarizeByMember(estimates, actuals) {
    const members = [...new Set(estimates.map(e => e.member).filter(Boolean))].sort();
    const result = [];

    for (const member of members) {
        const mEst = estimates.filter(e => e.member === member);
        const mAct = actuals.filter(a => a.member === member);

        const estHours = sumHours(mEst);
        const actHours = sumHours(mAct);

        const processAccuracy = {};
        for (const proc of PROCESSES) {
            let pEst = 0, pAct = 0;
            for (const e of mEst) if (e.process === proc) pEst += e.hours || 0;
            for (const a of mAct) if (a.process === proc) pAct += a.hours || 0;
            if (pEst > 0) processAccuracy[proc] = calcAccuracy(pEst, pAct);
        }

        const accKeys = Object.keys(processAccuracy);
        let strong = null, weak = null;
        if (accKeys.length > 0) {
            strong = accKeys.reduce((best, k) =>
                Math.abs(processAccuracy[k] - 100) < Math.abs(processAccuracy[best] - 100) ? k : best);
            weak = accKeys.reduce((worst, k) =>
                Math.abs(processAccuracy[k] - 100) > Math.abs(processAccuracy[worst] - 100) ? k : worst);
        }

        const taskSet = new Set();
        for (const e of mEst) taskSet.add(`${e.task || ''}\x00${e.process || ''}`);

        const entry = {
            name: member,
            estimate: round1(estHours),
            actual: round1(actHours),
            accuracy: calcAccuracy(estHours, actHours),
            task_count: taskSet.size,
        };
        if (strong) entry.strong_process = strong;
        if (weak && weak !== strong) entry.weak_process = weak;

        result.push(entry);
    }

    return result;
}

/** 月次トレンド */
function summarizeMonthlyTrend(estimates, actuals) {
    const monthlyActual = new Map();
    for (const a of actuals) {
        const d = a.date || '';
        if (d.length >= 7) {
            const month = d.slice(0, 7);
            monthlyActual.set(month, (monthlyActual.get(month) || 0) + (a.hours || 0));
        }
    }

    const monthlyEstimate = new Map();
    for (const e of estimates) {
        const mh = e.monthlyHours;
        if (mh && typeof mh === 'object' && Object.keys(mh).length > 0) {
            for (const [month, hours] of Object.entries(mh)) {
                monthlyEstimate.set(month, (monthlyEstimate.get(month) || 0) + (hours || 0));
            }
        } else {
            const month = e.workMonth || '';
            if (month) {
                monthlyEstimate.set(month, (monthlyEstimate.get(month) || 0) + (e.hours || 0));
            }
        }
    }

    const allMonths = [...new Set([...monthlyEstimate.keys(), ...monthlyActual.keys()])].sort();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return allMonths.map(month => {
        const est = monthlyEstimate.get(month) || 0;
        const act = monthlyActual.get(month) || 0;
        const entry = {
            month,
            estimate: round1(est),
            actual: round1(act),
            accuracy: calcAccuracy(est, act),
        };
        if (month === currentMonth) entry.in_progress = true;
        return entry;
    });
}

/** メンバー別月別工数 */
function summarizeMemberMonthly(estimates, actuals) {
    const members = [...new Set(estimates.map(e => e.member).filter(Boolean))].sort();
    const memberMonthlyEst = new Map(); // member -> Map(month -> hours)
    const memberMonthlyAct = new Map();

    const addToNestedMap = (map, member, month, hours) => {
        if (!map.has(member)) map.set(member, new Map());
        const inner = map.get(member);
        inner.set(month, (inner.get(month) || 0) + hours);
    };

    for (const e of estimates) {
        const member = e.member || '';
        const mh = e.monthlyHours;
        if (mh && typeof mh === 'object' && Object.keys(mh).length > 0) {
            for (const [month, hours] of Object.entries(mh)) {
                addToNestedMap(memberMonthlyEst, member, month, hours || 0);
            }
        } else {
            const month = e.workMonth || '';
            if (month) addToNestedMap(memberMonthlyEst, member, month, e.hours || 0);
        }
    }

    for (const a of actuals) {
        const member = a.member || '';
        const d = a.date || '';
        if (d.length >= 7) {
            const month = d.slice(0, 7);
            addToNestedMap(memberMonthlyAct, member, month, a.hours || 0);
        }
    }

    const allMonthsSet = new Set();
    for (const inner of memberMonthlyEst.values())
        for (const m of inner.keys()) allMonthsSet.add(m);
    for (const inner of memberMonthlyAct.values())
        for (const m of inner.keys()) allMonthsSet.add(m);
    const allMonths = [...allMonthsSet].sort();

    const standard = DEFAULT_HOURS_PER_DAY * DEFAULT_WORKING_DAYS_PER_MONTH;

    return members.map(member => {
        const months = [];
        const estInner = memberMonthlyEst.get(member) || new Map();
        const actInner = memberMonthlyAct.get(member) || new Map();

        for (const month of allMonths) {
            const est = estInner.get(month) || 0;
            const act = actInner.get(month) || 0;
            if (est > 0 || act > 0) {
                const entry = {
                    month,
                    estimate: round1(est),
                    actual: round1(act),
                };
                if (est > standard * 0.9) entry.high_load = true;
                months.push(entry);
            }
        }
        const totalEst = months.reduce((s, m) => s + m.estimate, 0);
        const totalAct = months.reduce((s, m) => s + m.actual, 0);
        return {
            name: member,
            total_estimate: round1(totalEst),
            total_actual: round1(totalAct),
            months,
        };
    });
}

/** タスクサイズ分布 */
function summarizeTaskSizes(estimates) {
    const taskHours = new Map();
    const taskMeta = new Map();

    for (const e of estimates) {
        const key = `${e.version || ''}\x00${e.task || ''}`;
        taskHours.set(key, (taskHours.get(key) || 0) + (e.hours || 0));
        if (!taskMeta.has(key)) taskMeta.set(key, e.member || '');
    }

    const tasks = [];
    for (const [key, hours] of taskHours) {
        const [version, task] = key.split('\x00');
        tasks.push({
            version,
            task,
            total_estimate: round1(hours),
            primary_member: taskMeta.get(key) || '',
        });
    }

    tasks.sort((a, b) => b.total_estimate - a.total_estimate);
    return tasks;
}

/** キャパシティ分析（月別） */
function summarizeCapacity(estimates, members) {
    const headcount = members && members.length > 0 ? members.length : 1;
    const standardHours = DEFAULT_WORKING_DAYS_PER_MONTH * DEFAULT_HOURS_PER_DAY * headcount;

    const monthlyEstimate = new Map();
    for (const e of estimates) {
        const mh = e.monthlyHours;
        if (mh && typeof mh === 'object' && Object.keys(mh).length > 0) {
            for (const [month, hours] of Object.entries(mh)) {
                monthlyEstimate.set(month, (monthlyEstimate.get(month) || 0) + (hours || 0));
            }
        } else {
            const month = e.workMonth || '';
            if (month) monthlyEstimate.set(month, (monthlyEstimate.get(month) || 0) + (e.hours || 0));
        }
    }

    const months = [...monthlyEstimate.keys()].sort().map(month => {
        const est = monthlyEstimate.get(month);
        const utilization = standardHours > 0 ? round1(est / standardHours * 100) : 0;
        const entry = {
            month,
            estimate: round1(est),
            utilization_percent: utilization,
        };
        if (utilization > 90) entry.warning = 'high';
        return entry;
    });

    return {
        working_days_per_month: DEFAULT_WORKING_DAYS_PER_MONTH,
        hours_per_day: DEFAULT_HOURS_PER_DAY,
        headcount,
        standard_hours_per_month: standardHours,
        monthly: months,
    };
}

/** 異常値検出（超過率 20% 以上） */
function detectAnomalies(estimates, actuals, threshold = 1.2) {
    const taskEst = new Map();
    const taskAct = new Map();
    const taskVersions = new Map();

    for (const e of estimates) {
        const key = `${e.task || ''}\x00${e.process || ''}`;
        taskEst.set(key, (taskEst.get(key) || 0) + (e.hours || 0));
        taskVersions.set(key, e.version || '');
    }

    for (const a of actuals) {
        const key = `${a.task || ''}\x00${a.process || ''}`;
        taskAct.set(key, (taskAct.get(key) || 0) + (a.hours || 0));
        if (!taskVersions.has(key)) taskVersions.set(key, a.version || '');
    }

    const anomalies = [];
    for (const [key, est] of taskEst) {
        const act = taskAct.get(key) || 0;
        if (est > 0 && act / est >= threshold) {
            const [task, process] = key.split('\x00');
            anomalies.push({
                version: taskVersions.get(key) || '',
                task,
                process,
                estimate: round1(est),
                actual: round1(act),
                overrun_percent: round1((act / est - 1) * 100),
            });
        }
    }

    anomalies.sort((a, b) => b.overrun_percent - a.overrun_percent);
    return anomalies;
}

/**
 * メインエントリ: バックアップ相当のデータを要約 JSON に変換
 * @param {object} data - { estimates, actuals, remainingEstimates, version? }
 * @param {object} [options] - { generatedAt?: string } 主にテスト用
 * @returns {object} 要約 JSON
 */
export function summarize(data, options = {}) {
    const estimates = data.estimates || [];
    const actuals = data.actuals || [];
    const remaining = data.remainingEstimates || [];

    const members = [...new Set(estimates.map(e => e.member).filter(Boolean))].sort();

    return {
        generated_at: options.generatedAt || new Date().toISOString(),
        source_version: data.version || 'unknown',
        overall: summarizeOverall(estimates, actuals),
        by_version: summarizeByVersion(estimates, actuals, remaining),
        by_process: summarizeByProcess(estimates, actuals),
        by_member: summarizeByMember(estimates, actuals),
        member_monthly: summarizeMemberMonthly(estimates, actuals),
        task_sizes: summarizeTaskSizes(estimates),
        monthly_trend: summarizeMonthlyTrend(estimates, actuals),
        capacity: summarizeCapacity(estimates, members),
        anomalies: detectAnomalies(estimates, actuals),
    };
}

/**
 * アプリの現在の state (window.estimates 等) から要約 JSON を生成
 */
export function summarizeFromAppState(options = {}) {
    return summarize({
        estimates: window.estimates || [],
        actuals: window.actuals || [],
        remainingEstimates: window.remainingEstimates || [],
        version: 'live',
    }, options);
}
