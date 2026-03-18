/**
 * Report Analytics — Real-data driven dashboard
 * Reads from app state (estimates, actuals, remainingEstimates)
 */

import { estimates, actuals, remainingEstimates } from './state.js';
import { calculateProgress, calculateVersionProgress } from './report.js';
import { PROCESS } from './constants.js';
import { formatHours, hoursToManDays, hoursToManMonths } from './utils.js';

const DPR = window.devicePixelRatio || 1;
const COLORS = {
    est: '#5B8FB9', act: '#2D5A27', grid: '#E7E5E0',
    text: '#6B6560', textDark: '#1A1814',
    danger: '#B91C1C', warning: '#C4841D', success: '#2D5A27', info: '#1D6FA5',
    processes: ['#2D5A27', '#C4841D', '#1D6FA5', '#7C3AED', '#B91C1C', '#0F766E'],
};
const PROC_TYPES = PROCESS.TYPES; // ['UI','PG','PT','IT','ST']

// ============================================
// Data Computation Layer
// ============================================

/** Get all unique non-empty versions */
function getAllVersions() {
    const set = new Set();
    estimates.forEach(e => { if (e.version) set.add(e.version); });
    actuals.forEach(a => { if (a.version) set.add(a.version); });
    return [...set].sort();
}

/** Get all unique non-empty members */
function getAllMembers() {
    const set = new Set();
    estimates.forEach(e => { if (e.member) set.add(e.member); });
    actuals.forEach(a => { if (a.member) set.add(a.member); });
    return [...set].sort();
}

/** Get all unique version+task combos */
function getAllTasks() {
    const set = new Set();
    estimates.forEach(e => { if (e.version && e.task) set.add(`${e.version}\t${e.task}`); });
    actuals.forEach(a => { if (a.version && a.task) set.add(`${a.version}\t${a.task}`); });
    return [...set].map(k => { const [v, t] = k.split('\t'); return { version: v, task: t }; });
}

/** Get all unique months from actuals (YYYY-MM) and estimate workMonths */
function getAllMonths() {
    const set = new Set();
    actuals.forEach(a => { if (a.date) set.add(a.date.substring(0, 7)); });
    estimates.forEach(e => {
        if (e.workMonths && e.workMonths.length) {
            e.workMonths.forEach(m => set.add(m));
        } else if (e.workMonth) {
            set.add(e.workMonth);
        }
    });
    return [...set].sort();
}

/** Get estimate hours for a given month (handling monthlyHours distribution) */
function getEstimateHoursForMonth(est, month) {
    if (est.monthlyHours && est.monthlyHours[month] !== undefined) {
        return Number(est.monthlyHours[month]) || 0;
    }
    if (est.workMonths && est.workMonths.length > 0) {
        if (est.workMonths.includes(month)) {
            return est.hours / est.workMonths.length;
        }
        return 0;
    }
    if (est.workMonth === month) return est.hours;
    return 0;
}

/**
 * Compute all analytics data from app state.
 * @param {string|null} monthFilter - null for all, or 'YYYY-MM'
 */
function computeData(monthFilter) {
    const versions = getAllVersions();
    const members = getAllMembers();
    const allMonths = getAllMonths();
    const tasks = getAllTasks();

    // Filter actuals by month if needed
    const filteredActuals = monthFilter
        ? actuals.filter(a => a.date && a.date.startsWith(monthFilter))
        : actuals;

    // --- Totals ---
    const totalEst = monthFilter
        ? estimates.reduce((sum, e) => sum + getEstimateHoursForMonth(e, monthFilter), 0)
        : estimates.reduce((sum, e) => sum + e.hours, 0);
    const totalAct = filteredActuals.reduce((sum, a) => sum + a.hours, 0);
    const diff = totalAct - totalEst;
    const rate = totalEst > 0 ? (totalAct / totalEst) * 100 : 0;

    // --- Per-process ---
    const processData = PROC_TYPES.map(p => ({
        label: p,
        est: monthFilter
            ? estimates.filter(e => e.process === p).reduce((s, e) => s + getEstimateHoursForMonth(e, monthFilter), 0)
            : estimates.filter(e => e.process === p).reduce((s, e) => s + e.hours, 0),
        act: filteredActuals.filter(a => a.process === p).reduce((s, a) => s + a.hours, 0),
    }));

    // --- Bias per process ---
    const biasData = processData.map(d => ({
        label: d.label,
        bias: d.est > 0 ? ((d.act - d.est) / d.est) * 100 : 0,
    }));

    // --- Monthly trend ---
    const trendMonths = allMonths.slice(-6); // last 6 months
    const monthlyEst = trendMonths.map(m =>
        estimates.reduce((sum, e) => sum + getEstimateHoursForMonth(e, m), 0)
    );
    const monthlyAct = trendMonths.map(m =>
        actuals.filter(a => a.date && a.date.startsWith(m)).reduce((s, a) => s + a.hours, 0)
    );

    // --- Pareto (top tasks by actual hours) ---
    const taskActuals = {};
    filteredActuals.forEach(a => {
        const key = a.task || '(未設定)';
        taskActuals[key] = (taskActuals[key] || 0) + a.hours;
    });
    const paretoData = Object.entries(taskActuals)
        .map(([label, hours]) => ({ label, hours }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 10);

    // --- Member workload (actual hours by member × process) ---
    const memberData = members.map(name => {
        const row = { name };
        PROC_TYPES.forEach(p => {
            row[p] = filteredActuals
                .filter(a => a.member === name && a.process === p)
                .reduce((s, a) => s + a.hours, 0);
        });
        return row;
    }).filter(m => PROC_TYPES.some(p => m[p] > 0));

    // --- Risk heatmap (version × process overrun %) ---
    const heatmapData = versions.map(v => {
        return PROC_TYPES.map(p => {
            const est = estimates.filter(e => e.version === v && e.process === p)
                .reduce((s, e) => s + e.hours, 0);
            const act = filteredActuals.filter(a => a.version === v && a.process === p)
                .reduce((s, a) => s + a.hours, 0);
            if (est === 0 && act === 0) return null;
            if (est === 0) return act > 0 ? 100 : null;
            return Math.round(((act - est) / est) * 100);
        });
    });

    // --- Accuracy trend (per version: actual/estimate ratio × 100) ---
    const accuracyData = versions.map(v => {
        const vEst = estimates.filter(e => e.version === v).reduce((s, e) => s + e.hours, 0);
        const vAct = actuals.filter(a => a.version === v).reduce((s, a) => s + a.hours, 0);
        return vEst > 0 ? (vAct / vEst) * 100 : null;
    }).filter(v => v !== null);
    const accuracyVersions = versions.filter((v, i) => {
        const vEst = estimates.filter(e => e.version === v).reduce((s, e) => s + e.hours, 0);
        return vEst > 0;
    });

    // --- Status distribution ---
    const statusCounts = { completed: 0, ontrack: 0, warning: 0, exceeded: 0, unknown: 0 };
    const exceededTasks = [];
    const warningTasks = [];
    tasks.forEach(({ version, task }) => {
        const p = calculateProgress(version, task);
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
        if (p.status === 'exceeded') {
            exceededTasks.push({ version, task, variancePercent: p.variancePercent });
        } else if (p.status === 'warning') {
            warningTasks.push({ version, task, variancePercent: p.variancePercent });
        }
    });
    exceededTasks.sort((a, b) => b.variancePercent - a.variancePercent);
    warningTasks.sort((a, b) => b.variancePercent - a.variancePercent);

    // --- Member table data ---
    const memberTableData = members.map(name => {
        const est = monthFilter
            ? estimates.filter(e => e.member === name).reduce((s, e) => s + getEstimateHoursForMonth(e, monthFilter), 0)
            : estimates.filter(e => e.member === name).reduce((s, e) => s + e.hours, 0);
        const act = filteredActuals.filter(a => a.member === name).reduce((s, a) => s + a.hours, 0);
        return { name, est, act, diff: act - est, rate: est > 0 ? (act / est) * 100 : 0 };
    }).filter(m => m.est > 0 || m.act > 0);

    // --- Version table data ---
    const versionTableData = versions.map(v => {
        const vp = calculateVersionProgress(v);
        return {
            version: v,
            est: vp.estimatedHours,
            act: vp.actualHours,
            diff: vp.actualHours - vp.estimatedHours,
            rate: vp.estimatedHours > 0 ? (vp.actualHours / vp.estimatedHours) * 100 : 0,
            progress: vp.progressRate,
        };
    });

    // Capacity usage (total actual / total estimate)
    const capacityUsage = totalEst > 0 ? Math.round((totalAct / totalEst) * 100) : 0;

    // --- Version task distribution (small multiples) ---
    const versionTaskData = versions.map(v => {
        const taskMap = {};
        filteredActuals.filter(a => a.version === v).forEach(a => {
            const key = a.task || '(未設定)';
            taskMap[key] = (taskMap[key] || 0) + a.hours;
        });
        const sorted = Object.entries(taskMap)
            .map(([task, hours]) => ({ task, hours }))
            .sort((a, b) => b.hours - a.hours);
        const total = sorted.reduce((s, t) => s + t.hours, 0);
        // Top 5 + others
        const slices = [];
        let otherSum = 0;
        sorted.forEach((t, i) => {
            if (i < 5 || sorted.length <= 6) {
                slices.push(t);
            } else {
                otherSum += t.hours;
            }
        });
        if (otherSum > 0) slices.push({ task: 'その他', hours: otherSum });
        return { version: v, slices, total };
    }).filter(v => v.total > 0);

    return {
        totalEst, totalAct, diff, rate,
        processData, biasData,
        trendMonths, monthlyEst, monthlyAct,
        paretoData, memberData,
        versions, heatmapData,
        accuracyVersions, accuracyData,
        statusCounts, exceededTasks, warningTasks,
        memberTableData, versionTableData,
        allMonths, capacityUsage, versionTaskData,
    };
}

// ============================================
// DOM Update Functions
// ============================================

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateKPIs(data) {
    const el = (id) => document.getElementById(id);

    el('ra-kpi-est-value').textContent = Math.round(data.totalEst) + 'h';
    el('ra-kpi-est-sub').textContent = `${hoursToManDays(data.totalEst).toFixed(1)}人日 / ${hoursToManMonths(data.totalEst).toFixed(1)}人月`;

    el('ra-kpi-act-value').textContent = Math.round(data.totalAct) + 'h';
    el('ra-kpi-act-sub').textContent = `${hoursToManDays(data.totalAct).toFixed(1)}人日 / ${hoursToManMonths(data.totalAct).toFixed(1)}人月`;

    const diffEl = el('ra-kpi-diff-value');
    const diffVal = Math.round(data.diff);
    diffEl.textContent = (diffVal >= 0 ? '+' : '') + diffVal + 'h';
    diffEl.style.color = data.diff <= 0 ? 'var(--success)' : 'var(--danger)';

    const diffBadge = el('ra-kpi-diff-badge');
    if (data.diff <= 0) {
        diffBadge.className = 'ra-kpi-badge positive';
        diffBadge.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 2L8 6H2Z" fill="currentColor"/></svg> 予算内';
    } else {
        diffBadge.className = 'ra-kpi-badge negative';
        diffBadge.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 8L8 4H2Z" fill="currentColor"/></svg> 超過';
    }

    el('ra-kpi-rate-value').textContent = data.rate.toFixed(1) + '%';
    const rateBadge = el('ra-kpi-rate-badge');
    if (data.rate <= 100) {
        rateBadge.className = 'ra-kpi-badge positive';
        rateBadge.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 2L8 6H2Z" fill="currentColor"/></svg> 良好';
    } else if (data.rate <= 120) {
        rateBadge.className = 'ra-kpi-badge negative';
        rateBadge.innerHTML = '注意';
    } else {
        rateBadge.className = 'ra-kpi-badge negative';
        rateBadge.innerHTML = '超過';
    }
}

function updateAlerts(data) {
    const el = (id) => document.getElementById(id);
    el('ra-alert-exceeded').textContent = data.exceededTasks.length;
    el('ra-alert-warning').textContent = data.warningTasks.length;
    el('ra-alert-capacity').textContent = data.capacityUsage + '%';

    // Rebuild alert detail
    const detailGrid = el('ra-alert-detail-content');
    if (!detailGrid) return;
    const items = [
        ...data.exceededTasks.map(t => ({ ...t, type: 'exceeded' })),
        ...data.warningTasks.map(t => ({ ...t, type: 'warning' })),
    ];
    if (items.length === 0) {
        detailGrid.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">要対応タスクはありません</div>';
        return;
    }
    detailGrid.innerHTML = items.map(t => `
        <div class="ra-alert-task">
            <div class="ra-alert-task-status ${t.type === 'exceeded' ? 'exceeded' : 'warning'}"></div>
            <div class="ra-alert-task-name">${escapeHtml(t.version)} - ${escapeHtml(t.task)}</div>
            <div class="ra-alert-task-value" style="color:var(--${t.type === 'exceeded' ? 'danger' : 'warning'});">+${t.variancePercent.toFixed(0)}%</div>
        </div>
    `).join('');
}

function updateInsights(data) {
    const el = (id) => document.getElementById(id);

    // Process chart insight
    const processInsight = el('ra-insight-process');
    if (processInsight && data.processData.length > 0) {
        const maxBias = data.biasData.reduce((max, d) => Math.abs(d.bias) > Math.abs(max.bias) ? d : max, data.biasData[0]);
        const minBias = data.biasData.reduce((min, d) => Math.abs(d.bias) < Math.abs(min.bias) ? d : min, data.biasData[0]);
        processInsight.innerHTML = `<strong>${maxBias.label}工程</strong>が見積対比${maxBias.bias >= 0 ? '+' : ''}${maxBias.bias.toFixed(0)}%で最も乖離が大きい。<strong>${minBias.label}工程</strong>は精度が最も高い。`;
    }

    // Bias insight
    const biasInsight = el('ra-insight-bias');
    if (biasInsight) {
        const overEstProcs = data.biasData.filter(d => d.bias > 10);
        if (overEstProcs.length > 0) {
            biasInsight.innerHTML = `<strong>${overEstProcs.map(d => d.label).join('・')}</strong>は系統的に過小見積（実績超過）。次回見積時に補正を推奨。`;
        } else {
            biasInsight.innerHTML = '全工程で見積精度は良好です。';
        }
    }

    // Trend insight
    const trendInsight = el('ra-insight-trend');
    if (trendInsight && data.monthlyAct.length > 1) {
        const lastAct = data.monthlyAct[data.monthlyAct.length - 1];
        const lastEst = data.monthlyEst[data.monthlyEst.length - 1];
        if (lastAct > lastEst) {
            trendInsight.innerHTML = `直近月は実績が見積を上回る傾向。差異 <strong>+${Math.round(lastAct - lastEst)}h</strong>`;
        } else {
            trendInsight.innerHTML = `直近月は実績が見積を下回り良好。差異 <strong>${Math.round(lastAct - lastEst)}h</strong>`;
        }
    }

    // Pareto insight
    const paretoInsight = el('ra-insight-pareto');
    if (paretoInsight && data.paretoData.length >= 3) {
        const top3 = data.paretoData.slice(0, 3).reduce((s, t) => s + t.hours, 0);
        const total = data.paretoData.reduce((s, t) => s + t.hours, 0);
        const pct = total > 0 ? Math.round((top3 / total) * 100) : 0;
        paretoInsight.innerHTML = `上位<strong>3タスク</strong>が実績工数の<strong>${pct}%</strong>を占める。`;
    }

    // Member workload insight
    const memberInsight = el('ra-insight-member');
    if (memberInsight && data.memberData.length > 0) {
        const totals = data.memberData.map(m => ({
            name: m.name, total: PROC_TYPES.reduce((s, p) => s + m[p], 0)
        }));
        const max = totals.reduce((a, b) => b.total > a.total ? b : a);
        const min = totals.reduce((a, b) => b.total < a.total ? b : a);
        const overall = totals.reduce((s, t) => s + t.total, 0);
        const maxPct = overall > 0 ? Math.round((max.total / overall) * 100) : 0;
        memberInsight.innerHTML = `<strong>${max.name}</strong>に負荷が集中（総工数の${maxPct}%）。<strong>${min.name}</strong>に余裕あり。`;
    }

    // Heatmap insight
    const heatmapInsight = el('ra-insight-heatmap');
    if (heatmapInsight && data.versions.length > 0) {
        let maxVal = -Infinity, maxV = '', maxP = '';
        data.versions.forEach((v, vi) => {
            PROC_TYPES.forEach((p, pi) => {
                const val = data.heatmapData[vi][pi];
                if (val !== null && val > maxVal) { maxVal = val; maxV = v; maxP = p; }
            });
        });
        if (maxVal > 0) {
            heatmapInsight.innerHTML = `<strong>${maxV}の${maxP}</strong>が+${maxVal}%で最高リスク。`;
        } else {
            heatmapInsight.innerHTML = '全版数・工程で超過なし。';
        }
    }

    // Accuracy insight
    const accInsight = el('ra-insight-accuracy');
    if (accInsight && data.accuracyData.length > 1) {
        const last = data.accuracyData[data.accuracyData.length - 1];
        const err = Math.abs(last - 100);
        accInsight.innerHTML = `最新版は誤差<strong>${err.toFixed(1)}%</strong>${err <= 10 ? 'で高精度。' : '。改善余地あり。'}`;
    }

    // Donut insight
    const donutInsight = el('ra-insight-donut');
    if (donutInsight) {
        const sc = data.statusCounts;
        const total = sc.completed + sc.ontrack + sc.warning + sc.exceeded + sc.unknown;
        const good = sc.completed + sc.ontrack;
        const goodPct = total > 0 ? Math.round((good / total) * 100) : 0;
        donutInsight.innerHTML = `<strong>${goodPct}%</strong>のタスクが順調以上。超過${sc.exceeded}件${sc.exceeded > 0 ? 'は要対応。' : '。'}`;
    }
}

function updateMemberTable(data) {
    const tbody = document.getElementById('ra-member-tbody');
    if (!tbody) return;
    if (data.memberTableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">データなし</td></tr>';
        return;
    }
    tbody.innerHTML = data.memberTableData.map(m => {
        const diffClass = m.diff <= 0 ? 'text-success' : 'text-danger';
        const rateClass = m.rate > 120 ? 'text-danger' : m.rate > 100 ? 'text-warning' : '';
        const barColor = m.rate > 120 ? 'var(--danger)' : m.rate > 100 ? 'var(--warning)' : m.rate > 80 ? 'var(--success)' : 'var(--info)';
        const barWidth = Math.min(m.rate, 150);
        return `<tr>
            <td style="font-weight:600;">${escapeHtml(m.name)}</td>
            <td class="num">${formatHours(m.est)}</td>
            <td class="num">${formatHours(m.act)}</td>
            <td class="num ${diffClass}">${m.diff >= 0 ? '+' : ''}${formatHours(m.diff)}</td>
            <td class="num ${rateClass}">${m.rate.toFixed(1)}%</td>
            <td><div class="ra-mini-bar"><div class="ra-mini-bar-fill" style="width:${barWidth}%; background:${barColor};"></div></div></td>
        </tr>`;
    }).join('');
}

function updateVersionTable(data) {
    const tbody = document.getElementById('ra-version-tbody');
    if (!tbody) return;
    if (data.versionTableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">データなし</td></tr>';
        return;
    }
    tbody.innerHTML = data.versionTableData.map(v => {
        const diffClass = v.diff <= 0 ? 'text-success' : 'text-danger';
        const rateClass = v.rate > 120 ? 'text-danger' : v.rate > 100 ? 'text-warning' : '';
        const barColor = v.rate > 120 ? 'var(--danger)' : v.rate > 100 ? 'var(--warning)' : v.progress >= 100 ? 'var(--success)' : 'var(--info)';
        const barWidth = Math.min(v.progress, 100);
        return `<tr>
            <td style="font-weight:600;">${escapeHtml(v.version)}</td>
            <td class="num">${formatHours(v.est)}</td>
            <td class="num">${formatHours(v.act)}</td>
            <td class="num ${diffClass}">${v.diff >= 0 ? '+' : ''}${formatHours(v.diff)}</td>
            <td class="num ${rateClass}">${v.rate.toFixed(1)}%</td>
            <td><div class="ra-mini-bar"><div class="ra-mini-bar-fill" style="width:${barWidth}%; background:${barColor};"></div></div></td>
        </tr>`;
    }).join('');
}

function updateFilterOptions(allMonths) {
    const select = document.getElementById('ra-filter-month');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">全期間</option>';
    allMonths.slice().reverse().forEach(m => {
        const [y, mo] = m.split('-');
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `${y}年${parseInt(mo)}月`;
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

// ============================================
// Canvas Helpers
// ============================================

function setupCanvas(id, drawFn) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const w = canvas.parentElement.clientWidth;
    const h = parseInt(canvas.getAttribute('height')) || 200;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);
    drawFn(ctx, w, h);
}

function drawGridLines(ctx, x0, y0, w, h, steps, maxVal) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (let i = 0; i <= steps; i++) {
        const y = y0 + (h / steps) * i;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
        const val = maxVal - (maxVal / steps) * i;
        ctx.fillStyle = COLORS.text;
        ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(val) + '', x0 - 6, y + 4);
    }
    ctx.setLineDash([]);
}

// ============================================
// Chart Drawing Functions (data-driven)
// ============================================

function drawProcessBar(ctx, w, h, data) {
    if (!data || data.length === 0) return;
    const pad = { left: 36, right: 20, top: 8, bottom: 4 };
    const maxVal = Math.max(...data.flatMap(d => [d.est, d.act]), 1) * 1.1;
    const barH = 14, gap = 4, groupH = barH * 2 + gap, groupGap = 12;
    const chartW = w - pad.left - pad.right;

    data.forEach((d, i) => {
        const y = pad.top + i * (groupH + groupGap);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(d.label, pad.left - 8, y + groupH / 2 + 4);

        const estW = (d.est / maxVal) * chartW;
        ctx.fillStyle = COLORS.est;
        ctx.beginPath(); ctx.roundRect(pad.left, y, Math.max(estW, 0), barH, 3); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '600 10px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'right';
        if (estW > 40) ctx.fillText(Math.round(d.est) + 'h', pad.left + estW - 6, y + barH - 3);

        const actW = (d.act / maxVal) * chartW;
        ctx.fillStyle = d.act > d.est * 1.1 ? COLORS.danger : COLORS.act;
        ctx.beginPath(); ctx.roundRect(pad.left, y + barH + gap, Math.max(actW, 0), barH, 3); ctx.fill();
        ctx.fillStyle = '#fff';
        if (actW > 40) ctx.fillText(Math.round(d.act) + 'h', pad.left + actW - 6, y + barH + gap + barH - 3);
    });
}

function drawBias(ctx, w, h, data) {
    if (!data || data.length === 0) return;
    const pad = { left: 36, right: 20, top: 16, bottom: 24 };
    const centerX = pad.left + (w - pad.left - pad.right) / 2;
    const barH = 20, gap = 12;
    const maxBias = Math.max(...data.map(d => Math.abs(d.bias)), 10) * 1.2;
    const scale = (w - pad.left - pad.right) / 2 / maxBias;

    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(centerX, pad.top - 4);
    ctx.lineTo(centerX, pad.top + data.length * (barH + gap) - gap + 4); ctx.stroke(); ctx.setLineDash([]);

    ctx.fillStyle = COLORS.text; ctx.font = '500 10px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('過大見積 ←', centerX - (w - pad.left - pad.right) / 4, pad.top - 4);
    ctx.fillText('→ 過小見積', centerX + (w - pad.left - pad.right) / 4, pad.top - 4);
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('0%', centerX, pad.top + data.length * (barH + gap) + 4);

    data.forEach((d, i) => {
        const y = pad.top + i * (barH + gap);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(d.label, pad.left - 8, y + barH / 2 + 4);

        const barW = Math.abs(d.bias) * scale;
        const x = d.bias >= 0 ? centerX : centerX - barW;
        const color = d.bias > 10 ? COLORS.danger : d.bias > 0 ? COLORS.warning : COLORS.success;
        ctx.fillStyle = color; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.roundRect(x, y, barW, barH, 3); ctx.fill(); ctx.globalAlpha = 1;

        const labelX = d.bias >= 0 ? centerX + barW + 6 : centerX - barW - 6;
        ctx.fillStyle = color; ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = d.bias >= 0 ? 'left' : 'right';
        ctx.fillText((d.bias > 0 ? '+' : '') + d.bias.toFixed(1) + '%', labelX, y + barH / 2 + 4);

        ctx.beginPath(); ctx.arc(d.bias >= 0 ? centerX + barW : centerX - barW, y + barH / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
}

function drawTrend(ctx, w, h, months, estData, actData) {
    if (!months || months.length === 0) return;
    const pad = { left: 40, right: 20, top: 16, bottom: 28 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    const maxVal = Math.max(...estData, ...actData, 1) * 1.15;
    const stepX = months.length > 1 ? cw / (months.length - 1) : cw;

    drawGridLines(ctx, pad.left, pad.top, cw, ch, 4, maxVal);

    ctx.fillStyle = COLORS.text;
    ctx.font = '500 11px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    months.forEach((m, i) => {
        const [, mo] = m.split('-');
        ctx.fillText(parseInt(mo) + '月', pad.left + i * stepX, h - pad.bottom + 16);
    });

    function pointY(val) { return pad.top + ch * (1 - val / maxVal); }

    function drawArea(data, color) {
        ctx.beginPath(); ctx.moveTo(pad.left, pointY(data[0]));
        data.forEach((v, i) => ctx.lineTo(pad.left + i * stepX, pointY(v)));
        ctx.lineTo(pad.left + (data.length - 1) * stepX, pad.top + ch);
        ctx.lineTo(pad.left, pad.top + ch); ctx.closePath();
        ctx.fillStyle = color; ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = 1;
    }
    drawArea(estData, COLORS.est);
    drawArea(actData, COLORS.act);

    function drawLine(data, color, dashed) {
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        if (dashed) ctx.setLineDash([6, 4]);
        ctx.beginPath();
        data.forEach((v, i) => { const x = pad.left + i * stepX; i === 0 ? ctx.moveTo(x, pointY(v)) : ctx.lineTo(x, pointY(v)); });
        ctx.stroke(); ctx.setLineDash([]);
        data.forEach((v, i) => {
            const x = pad.left + i * stepX;
            ctx.beginPath(); ctx.arc(x, pointY(v), 4, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        });
    }
    drawLine(estData, COLORS.est, true);
    drawLine(actData, COLORS.act, false);

    months.forEach((_, i) => {
        if (actData[i] > estData[i]) {
            const x = pad.left + i * stepX;
            const yE = pointY(estData[i]), yA = pointY(actData[i]);
            ctx.fillStyle = COLORS.danger; ctx.globalAlpha = 0.12;
            ctx.fillRect(x - 8, yA, 16, yE - yA); ctx.globalAlpha = 1;
            ctx.fillStyle = COLORS.danger; ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center'; ctx.fillText('+' + Math.round(actData[i] - estData[i]), x, yA - 6);
        }
    });
}

function drawPareto(ctx, w, h, tasks) {
    if (!tasks || tasks.length === 0) return;
    const total = tasks.reduce((s, t) => s + t.hours, 0);
    const pad = { left: 34, right: 34, top: 16, bottom: 46 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    const barW = Math.min(cw / tasks.length - 4, 36);
    const maxVal = tasks[0].hours * 1.15;

    drawGridLines(ctx, pad.left, pad.top, cw, ch, 4, maxVal);

    ctx.fillStyle = COLORS.text; ctx.font = '500 10px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
        const pct = 25 * i;
        ctx.fillText(pct + '%', pad.left + cw + 6, pad.top + ch * (1 - pct / 100) + 4);
    }

    let cumulative = 0;
    const linePoints = [];
    tasks.forEach((t, i) => {
        const x = pad.left + (cw / tasks.length) * i + (cw / tasks.length - barW) / 2;
        const bh = (t.hours / maxVal) * ch;
        const y = pad.top + ch - bh;
        ctx.globalAlpha = 1 - i * 0.07; ctx.fillStyle = COLORS.act;
        ctx.beginPath(); ctx.roundRect(x, y, barW, bh, [3, 3, 0, 0]); ctx.fill(); ctx.globalAlpha = 1;

        ctx.fillStyle = COLORS.text; ctx.font = '500 9px "Plus Jakarta Sans", "Noto Sans JP", sans-serif'; ctx.textAlign = 'center';
        ctx.save(); ctx.translate(x + barW / 2, pad.top + ch + 8); ctx.rotate(-Math.PI / 6);
        ctx.fillText(t.label.substring(0, 5), 0, 0); ctx.restore();

        cumulative += t.hours;
        linePoints.push({ x: x + barW / 2, y: pad.top + ch * (1 - cumulative / total), pct: cumulative / total });
    });

    ctx.strokeStyle = COLORS.warning; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
    linePoints.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); }); ctx.stroke();

    linePoints.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = COLORS.warning; ctx.fill();
        if (i === 2 || i === linePoints.length - 1) {
            ctx.font = '700 10px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(Math.round(p.pct * 100) + '%', p.x, p.y - 8);
        }
    });
}

function drawMemberWorkload(ctx, w, h, members) {
    if (!members || members.length === 0) return;
    const pad = { left: 44, right: 50, top: 8, bottom: 4 };
    const barH = 22, gap = 14;
    const maxTotal = Math.max(...members.map(m => PROC_TYPES.reduce((s, p) => s + m[p], 0)), 1) * 1.1;
    const cw = w - pad.left - pad.right;

    members.forEach((m, i) => {
        const y = pad.top + i * (barH + gap);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans JP", sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(m.name, pad.left - 8, y + barH / 2 + 4);

        let x = pad.left;
        PROC_TYPES.forEach((p, pi) => {
            const segW = (m[p] / maxTotal) * cw;
            ctx.fillStyle = COLORS.processes[pi]; ctx.globalAlpha = 0.85;
            const radius = pi === 0 ? [3, 0, 0, 3] : pi === PROC_TYPES.length - 1 ? [0, 3, 3, 0] : 0;
            ctx.beginPath(); ctx.roundRect(x, y, segW, barH, radius); ctx.fill(); ctx.globalAlpha = 1;
            x += segW;
        });

        const total = PROC_TYPES.reduce((s, p) => s + m[p], 0);
        ctx.fillStyle = COLORS.textDark; ctx.font = '600 11px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(total.toFixed(1) + 'h', x + 6, y + barH / 2 + 4);
    });
}

function renderHeatmap(versions, heatmapData) {
    const container = document.getElementById('ra-heatmapContainer');
    if (!container) return;
    if (versions.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">データなし</div>';
        return;
    }

    function getLevel(val) {
        if (val === null) return 'no-data';
        if (val <= 0) return 'level-1';
        if (val <= 5) return 'level-2';
        if (val <= 15) return 'level-3';
        if (val <= 30) return 'level-4';
        if (val <= 50) return 'level-5';
        return 'level-6';
    }

    let html = '<div class="ra-heatmap-grid">';
    html += `<div class="ra-heatmap-row" style="grid-template-columns: 60px repeat(${PROC_TYPES.length}, 1fr);">`;
    html += '<div></div>';
    PROC_TYPES.forEach(p => { html += `<div class="ra-heatmap-col-label">${p}</div>`; });
    html += '</div>';

    versions.forEach((v, vi) => {
        html += `<div class="ra-heatmap-row" style="grid-template-columns: 60px repeat(${PROC_TYPES.length}, 1fr);">`;
        html += `<div class="ra-heatmap-label">${escapeHtml(v)}</div>`;
        PROC_TYPES.forEach((_, pi) => {
            const val = heatmapData[vi][pi];
            const level = getLevel(val);
            const display = val === null ? '-' : (val > 0 ? '+' + val + '%' : val + '%');
            html += `<div class="ra-heatmap-cell ${level}" title="${escapeHtml(v)} ${PROC_TYPES[pi]}: ${display}">${val !== null ? display : '-'}</div>`;
        });
        html += '</div>';
    });
    html += '</div>';

    html += '<div class="ra-heatmap-scale"><span>安全</span>';
    ['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'].forEach(l => {
        html += `<div class="ra-heatmap-scale-cell ${l}"></div>`;
    });
    html += '<span>危険</span></div>';
    container.innerHTML = html;
}

function drawAccuracyTrend(ctx, w, h, versions, accuracy) {
    if (!versions || versions.length === 0) return;
    const pad = { left: 40, right: 20, top: 20, bottom: 28 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    const stepX = versions.length > 1 ? cw / (versions.length - 1) : cw;

    const allVals = accuracy.filter(v => v !== null);
    const yMin = Math.min(80, ...allVals) - 5;
    const yMax = Math.max(120, ...allVals) + 5;
    const range = yMax - yMin;
    function pointY(val) { return pad.top + ch * (1 - (val - yMin) / range); }

    ctx.fillStyle = COLORS.act; ctx.globalAlpha = 0.06;
    ctx.fillRect(pad.left, pointY(110), cw, pointY(90) - pointY(110)); ctx.globalAlpha = 1;

    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    [yMin, 90, 100, 110, yMax].forEach(val => {
        if (val < yMin || val > yMax) return;
        const y = pointY(val);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke();
        ctx.fillStyle = COLORS.text; ctx.font = '500 10px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(val) + '%', pad.left - 6, y + 4);
    });
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.act; ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(pad.left, pointY(100)); ctx.lineTo(pad.left + cw, pointY(100)); ctx.stroke(); ctx.globalAlpha = 1;

    ctx.fillStyle = COLORS.text; ctx.font = '500 11px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'center';
    versions.forEach((v, i) => ctx.fillText(v, pad.left + i * stepX, h - pad.bottom + 16));

    ctx.strokeStyle = COLORS.info; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
    accuracy.forEach((v, i) => { const x = pad.left + i * stepX; i === 0 ? ctx.moveTo(x, pointY(v)) : ctx.lineTo(x, pointY(v)); });
    ctx.stroke();

    accuracy.forEach((v, i) => {
        const x = pad.left + i * stepX, y = pointY(v);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = COLORS.info; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = COLORS.textDark; ctx.font = '700 11px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(1) + '%', x, y - 10);
    });

    ctx.fillStyle = COLORS.act; ctx.globalAlpha = 0.5; ctx.font = '500 9px "Plus Jakarta Sans", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('目標帯 (90-110%)', pad.left + 4, pointY(110) + 12); ctx.globalAlpha = 1;
}

function drawDonut(ctx, w, h, statusCounts) {
    const data = [
        { label: '完了', value: statusCounts.completed || 0, color: COLORS.success },
        { label: '順調', value: statusCounts.ontrack || 0, color: COLORS.info },
        { label: '注意', value: statusCounts.warning || 0, color: COLORS.warning },
        { label: '超過', value: statusCounts.exceeded || 0, color: COLORS.danger },
    ].filter(d => d.value > 0);
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return;

    const cx = w / 2, cy = h / 2 - 4;
    const outerR = Math.min(w, h) / 2 - 20, innerR = outerR * 0.58;

    let startAngle = -Math.PI / 2;
    data.forEach(d => {
        const sliceAngle = (d.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(startAngle) * innerR, cy + Math.sin(startAngle) * innerR);
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath(); ctx.fillStyle = d.color; ctx.fill();

        const midAngle = startAngle + sliceAngle / 2;
        const lx = cx + Math.cos(midAngle) * (outerR + 14);
        const ly = cy + Math.sin(midAngle) * (outerR + 14);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 11px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5 ? 'right' : 'left';
        if (Math.abs(midAngle + Math.PI / 2) < 0.3) ctx.textAlign = 'center';
        ctx.fillText(`${d.label} ${Math.round(d.value / total * 100)}%`, lx, ly + 4);
        startAngle += sliceAngle;
    });

    ctx.fillStyle = COLORS.textDark; ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(total, cx, cy - 4);
    ctx.font = '500 11px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
    ctx.fillStyle = COLORS.text; ctx.fillText('タスク', cx, cy + 16);
    ctx.textBaseline = 'alphabetic';
}

// ---- 9. Version Task Distribution (Small Multiples) ----
const TASK_PALETTE = [
    '#2D5A27', '#1D6FA5', '#C4841D', '#7C3AED',
    '#B91C1C', '#0F766E', '#BE185D', '#1E3A5F',
    '#9C9690',
];

function drawMiniDonut(canvas, slices, total) {
    const size = 90;
    canvas.width = size * DPR;
    canvas.height = size * DPR;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const cx = size / 2, cy = size / 2;
    const outerR = size / 2 - 4, innerR = outerR * 0.54;
    const gap = slices.length > 1 ? 0.03 : 0;

    let angle = -Math.PI / 2;
    slices.forEach((s, i) => {
        const sliceAngle = (s.hours / total) * Math.PI * 2 - gap;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
        ctx.arc(cx, cy, outerR, angle, angle + sliceAngle);
        ctx.arc(cx, cy, innerR, angle + sliceAngle, angle, true);
        ctx.closePath();
        ctx.fillStyle = TASK_PALETTE[i % TASK_PALETTE.length];
        ctx.fill();
        angle += sliceAngle + gap;
    });

    // Center total
    ctx.fillStyle = COLORS.textDark;
    ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(total) + 'h', cx, cy);
    ctx.textBaseline = 'alphabetic';
}

function renderVersionTaskMultiples(versionTaskData) {
    const container = document.getElementById('ra-multiples-grid');
    if (!container) return;
    if (versionTaskData.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:13px;">データなし</div>';
        return;
    }

    container.innerHTML = '';
    versionTaskData.forEach(({ version, slices, total }) => {
        const card = document.createElement('div');
        card.className = 'ra-mini-card';

        const legendHtml = slices.map((s, i) => {
            const pct = total > 0 ? Math.round((s.hours / total) * 100) : 0;
            return `<div class="ra-mini-legend-item">
                <div class="ra-mini-legend-dot" style="background:${TASK_PALETTE[i % TASK_PALETTE.length]}"></div>
                <div class="ra-mini-legend-name">${escapeHtml(s.task)}</div>
                <div class="ra-mini-legend-val">${pct}%</div>
            </div>`;
        }).join('');

        card.innerHTML = `
            <div class="ra-mini-card-header">
                <div class="ra-mini-card-title">${escapeHtml(version)}</div>
                <div class="ra-mini-card-total">${Math.round(total)}h</div>
            </div>
            <div class="ra-mini-card-body">
                <canvas></canvas>
                <div class="ra-mini-legend">${legendHtml}</div>
            </div>
        `;
        container.appendChild(card);

        const canvas = card.querySelector('canvas');
        drawMiniDonut(canvas, slices, total);
    });

    // Insight
    const insight = document.getElementById('ra-insight-multiples');
    if (insight && versionTaskData.length > 0) {
        const maxV = versionTaskData.reduce((a, b) => b.total > a.total ? b : a);
        const topTask = maxV.slices[0];
        const topPct = maxV.total > 0 ? Math.round((topTask.hours / maxV.total) * 100) : 0;
        insight.innerHTML = `<strong>${maxV.version}</strong>が最大工数（${Math.round(maxV.total)}h）。トップは<strong>${escapeHtml(topTask.task)}</strong>で${topPct}%を占める。`;
    }
}

function drawSparkline(id, data, color) {
    const canvas = document.getElementById(id);
    if (!canvas || !data || data.length < 2) return;
    canvas.width = 80 * DPR; canvas.height = 40 * DPR;
    const ctx = canvas.getContext('2d'); ctx.scale(DPR, DPR);
    const w = 80, h = 40;
    const max = Math.max(...data) * 1.1, min = Math.min(...data) * 0.9;
    const rangeVal = max - min || 1, stepX = w / (data.length - 1);
    ctx.beginPath(); ctx.moveTo(0, h);
    data.forEach((v, i) => ctx.lineTo(i * stepX, h - ((v - min) / rangeVal) * h));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}

// ============================================
// Interaction
// ============================================

function toggleAlertDetail() {
    const detail = document.getElementById('ra-alertDetail');
    const text = document.getElementById('ra-alertExpandText');
    if (!detail || !text) return;
    detail.classList.toggle('open');
    text.textContent = detail.classList.contains('open') ? '閉じる ▴' : '詳細 ▾';
}

function toggleDetail(el, e) {
    if (e.target.closest('.ra-detail-section-body')) return;
    el.classList.toggle('open');
}

// ============================================
// Main Render
// ============================================

let cachedData = null;

function renderAll(monthFilter) {
    cachedData = computeData(monthFilter || null);
    const d = cachedData;

    // Update DOM
    updateKPIs(d);
    updateAlerts(d);
    updateInsights(d);
    updateMemberTable(d);
    updateVersionTable(d);

    // Render charts
    setupCanvas('ra-chartProcessBar', (ctx, w, h) => drawProcessBar(ctx, w, h, d.processData));
    setupCanvas('ra-chartBias', (ctx, w, h) => drawBias(ctx, w, h, d.biasData));
    setupCanvas('ra-chartTrend', (ctx, w, h) => drawTrend(ctx, w, h, d.trendMonths, d.monthlyEst, d.monthlyAct));
    setupCanvas('ra-chartPareto', (ctx, w, h) => drawPareto(ctx, w, h, d.paretoData));
    setupCanvas('ra-chartMemberWorkload', (ctx, w, h) => drawMemberWorkload(ctx, w, h, d.memberData));
    renderHeatmap(d.versions, d.heatmapData);
    setupCanvas('ra-chartAccuracyTrend', (ctx, w, h) => drawAccuracyTrend(ctx, w, h, d.accuracyVersions, d.accuracyData));
    setupCanvas('ra-chartDonut', (ctx, w, h) => drawDonut(ctx, w, h, d.statusCounts));
    renderVersionTaskMultiples(d.versionTaskData);
    drawSparkline('ra-sparkline1', d.monthlyEst, 'rgba(255,255,255,0.5)');
    drawSparkline('ra-sparkline2', d.monthlyAct, 'rgba(255,255,255,0.5)');

    // Update filter options (only on first render or when months change)
    updateFilterOptions(d.allMonths);
}

let initialized = false;
let resizeTimer;

export function initReportAnalytics() {
    const monthSelect = document.getElementById('ra-filter-month');
    const getMonthFilter = () => monthSelect ? monthSelect.value || null : null;

    if (!initialized) {
        // Alert bar toggle
        const alertBar = document.getElementById('ra-alertBar');
        if (alertBar) alertBar.addEventListener('click', toggleAlertDetail);

        // Detail sections toggle
        document.querySelectorAll('#analytics .ra-detail-section').forEach(el => {
            el.addEventListener('click', (e) => toggleDetail(el, e));
        });

        // Filter change
        if (monthSelect) {
            monthSelect.addEventListener('change', () => {
                requestAnimationFrame(() => renderAll(getMonthFilter()));
            });
        }

        // Resize handler
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const tab = document.getElementById('analytics');
                if (tab && tab.classList.contains('active')) {
                    renderAll(getMonthFilter());
                }
            }, 200);
        });

        initialized = true;
    }

    requestAnimationFrame(() => renderAll(getMonthFilter()));
}
