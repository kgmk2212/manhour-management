/**
 * Report Analytics — Canvas chart rendering & interaction
 * Mockup: mockups/report-analytics-redesign/index.html
 */

const DPR = window.devicePixelRatio || 1;

const COLORS = {
    est: '#5B8FB9',
    act: '#2D5A27',
    grid: '#E7E5E0',
    text: '#6B6560',
    textDark: '#1A1814',
    danger: '#B91C1C',
    warning: '#C4841D',
    success: '#2D5A27',
    info: '#1D6FA5',
    processes: ['#2D5A27', '#C4841D', '#1D6FA5', '#7C3AED', '#B91C1C', '#0F766E'],
};

// ---- Canvas setup helper ----
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
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + w, y);
        ctx.stroke();
        const val = maxVal - (maxVal / steps) * i;
        ctx.fillStyle = COLORS.text;
        ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(val) + '', x0 - 6, y + 4);
    }
    ctx.setLineDash([]);
}

// ---- 1. Process Est vs Actual (grouped horizontal bar) ----
function drawProcessBar(ctx, w, h) {
    const data = [
        { label: 'UI', est: 128, act: 121 },
        { label: 'PG', est: 310, act: 366 },
        { label: 'PT', est: 148, act: 132 },
        { label: 'IT', est: 168, act: 125 },
        { label: 'ST', est: 88, act: 54 },
    ];
    const pad = { left: 36, right: 20, top: 8, bottom: 4 };
    const maxVal = Math.max(...data.flatMap(d => [d.est, d.act])) * 1.1;
    const barH = 14;
    const gap = 4;
    const groupH = barH * 2 + gap;
    const groupGap = 12;
    const chartW = w - pad.left - pad.right;

    data.forEach((d, i) => {
        const y = pad.top + i * (groupH + groupGap);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(d.label, pad.left - 8, y + groupH / 2 + 4);

        const estW = (d.est / maxVal) * chartW;
        ctx.fillStyle = COLORS.est;
        ctx.beginPath();
        ctx.roundRect(pad.left, y, estW, barH, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'right';
        if (estW > 40) ctx.fillText(d.est + 'h', pad.left + estW - 6, y + barH - 3);

        const actW = (d.act / maxVal) * chartW;
        const actColor = d.act > d.est * 1.1 ? COLORS.danger : COLORS.act;
        ctx.fillStyle = actColor;
        ctx.beginPath();
        ctx.roundRect(pad.left, y + barH + gap, actW, barH, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        if (actW > 40) ctx.fillText(d.act + 'h', pad.left + actW - 6, y + barH + gap + barH - 3);
    });
}

// ---- 2. Estimation Bias (diverging bar) ----
function drawBias(ctx, w, h) {
    const data = [
        { label: 'UI', bias: -5.5 },
        { label: 'PG', bias: +18.1 },
        { label: 'PT', bias: -10.8 },
        { label: 'IT', bias: +15.2 },
        { label: 'ST', bias: -38.6 },
    ];
    const pad = { left: 36, right: 20, top: 16, bottom: 24 };
    const centerX = pad.left + (w - pad.left - pad.right) / 2;
    const barH = 20;
    const gap = 12;
    const maxBias = 45;
    const scale = (w - pad.left - pad.right) / 2 / maxBias;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, pad.top - 4);
    ctx.lineTo(centerX, pad.top + data.length * (barH + gap) - gap + 4);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.text;
    ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('\u904E\u5927\u898B\u7A4D \u2190', centerX - (w - pad.left - pad.right) / 4, pad.top - 4);
    ctx.fillText('\u2192 \u904E\u5C0F\u898B\u7A4D', centerX + (w - pad.left - pad.right) / 4, pad.top - 4);

    ctx.fillStyle = COLORS.text;
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    const bottomY = pad.top + data.length * (barH + gap) + 4;
    ctx.fillText('0%', centerX, bottomY);

    data.forEach((d, i) => {
        const y = pad.top + i * (barH + gap);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(d.label, pad.left - 8, y + barH / 2 + 4);

        const barW = Math.abs(d.bias) * scale;
        const x = d.bias >= 0 ? centerX : centerX - barW;
        const color = d.bias > 10 ? COLORS.danger : d.bias > 0 ? COLORS.warning : COLORS.success;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 3);
        ctx.fill();
        ctx.globalAlpha = 1;

        const labelX = d.bias >= 0 ? centerX + barW + 6 : centerX - barW - 6;
        ctx.fillStyle = color;
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = d.bias >= 0 ? 'left' : 'right';
        ctx.fillText((d.bias > 0 ? '+' : '') + d.bias.toFixed(1) + '%', labelX, y + barH / 2 + 4);

        const dotX = d.bias >= 0 ? centerX + barW : centerX - barW;
        ctx.beginPath();
        ctx.arc(dotX, y + barH / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
}

// ---- 3. Monthly Trend (area + line) ----
function drawTrend(ctx, w, h) {
    const months = ['10\u6708', '11\u6708', '12\u6708', '1\u6708', '2\u6708', '3\u6708'];
    const estData = [120, 145, 168, 152, 138, 119];
    const actData = [115, 140, 172, 160, 148, 114];
    const pad = { left: 40, right: 20, top: 16, bottom: 28 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const maxVal = Math.max(...estData, ...actData) * 1.15;
    const stepX = cw / (months.length - 1);

    const gridSteps = 4;
    drawGridLines(ctx, pad.left, pad.top, cw, ch, gridSteps, maxVal);

    ctx.fillStyle = COLORS.text;
    ctx.font = '500 11px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    months.forEach((m, i) => {
        ctx.fillText(m, pad.left + i * stepX, h - pad.bottom + 16);
    });

    function pointY(val) { return pad.top + ch * (1 - val / maxVal); }

    function drawArea(data, color) {
        ctx.beginPath();
        ctx.moveTo(pad.left, pointY(data[0]));
        data.forEach((v, i) => ctx.lineTo(pad.left + i * stepX, pointY(v)));
        ctx.lineTo(pad.left + (data.length - 1) * stepX, pad.top + ch);
        ctx.lineTo(pad.left, pad.top + ch);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.08;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    drawArea(estData, COLORS.est);
    drawArea(actData, COLORS.act);

    function drawLine(data, color, dashed) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        if (dashed) ctx.setLineDash([6, 4]);
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = pad.left + i * stepX;
            const y = pointY(v);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        data.forEach((v, i) => {
            const x = pad.left + i * stepX;
            const y = pointY(v);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }
    drawLine(estData, COLORS.est, true);
    drawLine(actData, COLORS.act, false);

    months.forEach((m, i) => {
        if (actData[i] > estData[i]) {
            const x = pad.left + i * stepX;
            const yE = pointY(estData[i]);
            const yA = pointY(actData[i]);
            ctx.fillStyle = COLORS.danger;
            ctx.globalAlpha = 0.12;
            ctx.fillRect(x - 8, yA, 16, yE - yA);
            ctx.globalAlpha = 1;
            const diff = actData[i] - estData[i];
            ctx.fillStyle = COLORS.danger;
            ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('+' + diff, x, yA - 6);
        }
    });
}

// ---- 4. Pareto Analysis ----
function drawPareto(ctx, w, h) {
    const tasks = [
        { label: '\u30E6\u30FC\u30B6\u7BA1\u7406', hours: 186 },
        { label: 'API\u9023\u643A', hours: 142 },
        { label: '\u5E33\u7968\u51FA\u529B', hours: 128 },
        { label: '\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9', hours: 98 },
        { label: '\u691C\u7D22\u6A5F\u80FD', hours: 82 },
        { label: '\u30DE\u30B9\u30BF\u7BA1\u7406', hours: 64 },
        { label: '\u30ED\u30B0\u30A4\u30F3', hours: 42 },
        { label: '\u8A2D\u5B9A', hours: 32 },
        { label: '\u305D\u306E\u4ED6', hours: 24 },
    ];
    const total = tasks.reduce((s, t) => s + t.hours, 0);
    const pad = { left: 34, right: 34, top: 16, bottom: 46 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const barW = Math.min(cw / tasks.length - 4, 36);
    const maxVal = tasks[0].hours * 1.15;

    drawGridLines(ctx, pad.left, pad.top, cw, ch, 4, maxVal);

    ctx.fillStyle = COLORS.text;
    ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
        const pct = 25 * i;
        const y = pad.top + ch * (1 - pct / 100);
        ctx.fillText(pct + '%', pad.left + cw + 6, y + 4);
    }

    let cumulative = 0;
    const linePoints = [];

    tasks.forEach((t, i) => {
        const x = pad.left + (cw / tasks.length) * i + (cw / tasks.length - barW) / 2;
        const barH = (t.hours / maxVal) * ch;
        const y = pad.top + ch - barH;

        const alpha = 1 - i * 0.07;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = COLORS.act;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = COLORS.text;
        ctx.font = '500 9px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(x + barW / 2, pad.top + ch + 8);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(t.label.substring(0, 5), 0, 0);
        ctx.restore();

        cumulative += t.hours;
        const pct = cumulative / total;
        linePoints.push({ x: x + barW / 2, y: pad.top + ch * (1 - pct), pct });
    });

    ctx.strokeStyle = COLORS.warning;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    linePoints.forEach((p, i) => {
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    linePoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.warning;
        ctx.fill();
        if (i === 2 || i === linePoints.length - 1) {
            ctx.fillStyle = COLORS.warning;
            ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(p.pct * 100) + '%', p.x, p.y - 8);
        }
    });
}

// ---- 5. Member Workload (stacked horizontal bar) ----
function drawMemberWorkload(ctx, w, h) {
    const members = [
        { name: '\u7530\u4E2D', UI: 32, PG: 98, PT: 42, IT: 52, ST: 24.5 },
        { name: '\u4F50\u85E4', UI: 46, PG: 88, PT: 38, IT: 35, ST: 24 },
        { name: '\u9234\u6728', UI: 28, PG: 72, PT: 32, IT: 28, ST: 18.5 },
        { name: '\u9AD8\u6A4B', UI: 10, PG: 48, PT: 16, IT: 8, ST: 16 },
        { name: '\u6E21\u8FBA', UI: 5, PG: 20, PT: 4, IT: 2, ST: 11 },
    ];
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const pad = { left: 44, right: 50, top: 8, bottom: 4 };
    const barH = 22;
    const gap = 14;
    const maxTotal = Math.max(...members.map(m => processes.reduce((s, p) => s + m[p], 0))) * 1.1;
    const cw = w - pad.left - pad.right;

    members.forEach((m, i) => {
        const y = pad.top + i * (barH + gap);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 12px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(m.name, pad.left - 8, y + barH / 2 + 4);

        let x = pad.left;
        processes.forEach((p, pi) => {
            const segW = (m[p] / maxTotal) * cw;
            ctx.fillStyle = COLORS.processes[pi];
            ctx.globalAlpha = 0.85;
            const radius = pi === 0 ? [3, 0, 0, 3] : pi === processes.length - 1 ? [0, 3, 3, 0] : 0;
            ctx.beginPath();
            ctx.roundRect(x, y, segW, barH, radius);
            ctx.fill();
            ctx.globalAlpha = 1;
            x += segW;
        });

        const total = processes.reduce((s, p) => s + m[p], 0);
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(total.toFixed(1) + 'h', x + 6, y + barH / 2 + 4);
    });
}

// ---- 6. Risk Heatmap (HTML-based) ----
function renderHeatmap() {
    const versions = ['V1.0', 'V2.0', 'V3.0', 'V3.1'];
    const processes = ['UI', 'PG', 'PT', 'IT', 'ST'];
    const data = [
        [-2, 8, -5, 3, -10],
        [-1, 5, 12, -3, 2],
        [25, 62, 14, 55, -8],
        [-3, 8, null, null, null],
    ];

    function getLevel(val) {
        if (val === null) return 'no-data';
        if (val <= 0) return 'level-1';
        if (val <= 5) return 'level-2';
        if (val <= 15) return 'level-3';
        if (val <= 30) return 'level-4';
        if (val <= 50) return 'level-5';
        return 'level-6';
    }

    const container = document.getElementById('ra-heatmapContainer');
    if (!container) return;
    let html = '<div class="ra-heatmap-grid">';

    html += `<div class="ra-heatmap-row" style="grid-template-columns: 48px repeat(${processes.length}, 1fr);">`;
    html += '<div></div>';
    processes.forEach(p => { html += `<div class="ra-heatmap-col-label">${p}</div>`; });
    html += '</div>';

    versions.forEach((v, vi) => {
        html += `<div class="ra-heatmap-row" style="grid-template-columns: 48px repeat(${processes.length}, 1fr);">`;
        html += `<div class="ra-heatmap-label">${v}</div>`;
        processes.forEach((p, pi) => {
            const val = data[vi][pi];
            const level = getLevel(val);
            const display = val === null ? '-' : (val > 0 ? '+' + val + '%' : val + '%');
            html += `<div class="ra-heatmap-cell ${level}" title="${v} ${p}: ${display}">${val !== null ? display : '-'}</div>`;
        });
        html += '</div>';
    });

    html += '</div>';
    html += '<div class="ra-heatmap-scale">';
    html += '<span>\u5B89\u5168</span>';
    ['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'].forEach(l => {
        html += `<div class="ra-heatmap-scale-cell ${l}"></div>`;
    });
    html += '<span>\u5371\u967A</span>';
    html += '</div>';

    container.innerHTML = html;
}

// ---- 7. Accuracy Trend (line chart) ----
function drawAccuracyTrend(ctx, w, h) {
    const versions = ['V1.0', 'V2.0', 'V3.0', 'V3.1'];
    const accuracy = [104.4, 97.2, 104.2, 95.0];
    const pad = { left: 40, right: 20, top: 20, bottom: 28 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;
    const stepX = cw / (versions.length - 1);

    const yMin = 80, yMax = 120, range = yMax - yMin;
    function pointY(val) { return pad.top + ch * (1 - (val - yMin) / range); }

    ctx.fillStyle = COLORS.act;
    ctx.globalAlpha = 0.06;
    ctx.fillRect(pad.left, pointY(110), cw, pointY(90) - pointY(110));
    ctx.globalAlpha = 1;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    [80, 90, 100, 110, 120].forEach(val => {
        const y = pointY(val);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + cw, y);
        ctx.stroke();
        ctx.fillStyle = COLORS.text;
        ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(val + '%', pad.left - 6, y + 4);
    });
    ctx.setLineDash([]);

    ctx.strokeStyle = COLORS.act;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(pad.left, pointY(100));
    ctx.lineTo(pad.left + cw, pointY(100));
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = COLORS.text;
    ctx.font = '500 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    versions.forEach((v, i) => {
        ctx.fillText(v, pad.left + i * stepX, h - pad.bottom + 16);
    });

    ctx.strokeStyle = COLORS.info;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    accuracy.forEach((v, i) => {
        const x = pad.left + i * stepX;
        const y = pointY(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    accuracy.forEach((v, i) => {
        const x = pad.left + i * stepX;
        const y = pointY(v);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = COLORS.info;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = COLORS.textDark;
        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(1) + '%', x, y - 10);
    });

    ctx.fillStyle = COLORS.act;
    ctx.globalAlpha = 0.5;
    ctx.font = '500 9px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('\u76EE\u6A19\u5E2F (90-110%)', pad.left + 4, pointY(110) + 12);
    ctx.globalAlpha = 1;
}

// ---- 8. Status Distribution (donut) ----
function drawDonut(ctx, w, h) {
    const data = [
        { label: '\u5B8C\u4E86', value: 14, color: COLORS.success },
        { label: '\u9806\u8ABF', value: 8, color: COLORS.info },
        { label: '\u6CE8\u610F', value: 2, color: COLORS.warning },
        { label: '\u8D85\u904E', value: 3, color: COLORS.danger },
    ];
    const total = data.reduce((s, d) => s + d.value, 0);
    const cx = w / 2;
    const cy = h / 2 - 4;
    const outerR = Math.min(w, h) / 2 - 20;
    const innerR = outerR * 0.58;

    let startAngle = -Math.PI / 2;
    data.forEach(d => {
        const sliceAngle = (d.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(startAngle) * innerR, cy + Math.sin(startAngle) * innerR);
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = d.color;
        ctx.fill();

        const midAngle = startAngle + sliceAngle / 2;
        const labelR = outerR + 14;
        const lx = cx + Math.cos(midAngle) * labelR;
        const ly = cy + Math.sin(midAngle) * labelR;
        ctx.fillStyle = COLORS.textDark;
        ctx.font = '600 11px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
        ctx.textAlign = midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5 ? 'right' : 'left';
        if (Math.abs(midAngle + Math.PI / 2) < 0.3) ctx.textAlign = 'center';
        const pct = Math.round(d.value / total * 100);
        ctx.fillText(`${d.label} ${pct}%`, lx, ly + 4);

        startAngle += sliceAngle;
    });

    ctx.fillStyle = COLORS.textDark;
    ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 4);
    ctx.font = '500 11px "Plus Jakarta Sans", "Noto Sans JP", sans-serif';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('\u30BF\u30B9\u30AF', cx, cy + 16);
    ctx.textBaseline = 'alphabetic';
}

// ---- Sparklines for KPI cards ----
function drawSparkline(id, data, color) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    canvas.width = 80 * DPR;
    canvas.height = 40 * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);
    const w = 80, h = 40;
    const max = Math.max(...data) * 1.1;
    const min = Math.min(...data) * 0.9;
    const rangeVal = max - min || 1;
    const stepX = w / (data.length - 1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => ctx.lineTo(i * stepX, h - ((v - min) / rangeVal) * h));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

// ---- Interaction ----
function toggleAlertDetail() {
    const detail = document.getElementById('ra-alertDetail');
    const text = document.getElementById('ra-alertExpandText');
    if (!detail || !text) return;
    detail.classList.toggle('open');
    text.textContent = detail.classList.contains('open') ? '\u9589\u3058\u308B \u25B4' : '\u8A73\u7D30 \u25BE';
}

function toggleDetail(el, e) {
    if (e.target.closest('.ra-detail-section-body')) return;
    el.classList.toggle('open');
}

// ---- Render all charts ----
function renderAllCharts() {
    setupCanvas('ra-chartProcessBar', drawProcessBar);
    setupCanvas('ra-chartBias', drawBias);
    setupCanvas('ra-chartTrend', drawTrend);
    setupCanvas('ra-chartPareto', drawPareto);
    setupCanvas('ra-chartMemberWorkload', drawMemberWorkload);
    setupCanvas('ra-chartAccuracyTrend', drawAccuracyTrend);
    setupCanvas('ra-chartDonut', drawDonut);
    renderHeatmap();
    drawSparkline('ra-sparkline1', [120, 145, 168, 152, 138, 119], 'rgba(255,255,255,0.5)');
    drawSparkline('ra-sparkline2', [115, 140, 172, 160, 148, 114], 'rgba(255,255,255,0.5)');
}

let initialized = false;
let resizeTimer;

/**
 * Initialize or refresh the analytics tab.
 * Called when the analytics tab becomes visible.
 */
export function initReportAnalytics() {
    if (!initialized) {
        // Bind interactions
        const alertBar = document.getElementById('ra-alertBar');
        if (alertBar) alertBar.addEventListener('click', toggleAlertDetail);

        document.querySelectorAll('#analytics .ra-detail-section').forEach(el => {
            el.addEventListener('click', (e) => toggleDetail(el, e));
        });

        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const tab = document.getElementById('analytics');
                if (tab && tab.classList.contains('active')) {
                    renderAllCharts();
                }
            }, 200);
        });

        initialized = true;
    }

    // Render charts (needs to be called each time tab becomes visible for proper sizing)
    requestAnimationFrame(() => renderAllCharts());
}
