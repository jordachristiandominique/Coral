/** Render canonical site HCC means, transect SE, and the category benchmarks. */
function renderSiteHccChart(canvas, rows, nationalAvg) {
    if (!canvas || !window.Chart) return;
    const sites = rows.filter(row => ['A', 'B', 'C', 'D'].includes(row.coverage_class)
        && Number.isFinite(row.avg_coverage));
    if (!sites.length) {
        canvas.hidden = true;
        const message = document.createElement('p');
        message.className = 'site-hcc-empty';
        message.textContent = 'No reviewed site HCC data available.';
        canvas.after(message);
        return;
    }
    const CAT_COLORS = { A: '#1e8e5a', B: '#f2c11f', C: '#e8820c', D: '#d64545' };
    const hccLabels = sites.map(function (r) { return r.name; });
    const hccData = sites.map(function (r) { return r.avg_coverage; });
    const ses = sites.map(function (r) { return (typeof r.se === 'number') ? r.se : 0; });
    const barColors = sites.map(function (r) { return CAT_COLORS[r.coverage_class] || '#9bb1b8'; });
    const suggestedMax = Math.max(50, Math.max.apply(null, hccData.map(function (v, i) {
        return v + (ses[i] || 0);
    })) + 4);

    // Inline plugin: dashed threshold + benchmark lines and SE whiskers.
    const hccExtras = {
        id: 'hccExtras',
        afterDraw: function (chart) {
            const ctx = chart.ctx;
            const yScale = chart.scales.y;
            const area = chart.chartArea;

            const refLine = function (val, color, dash, label, align = 'right') {
                const y = yScale.getPixelForValue(val);
                if (y < area.top || y > area.bottom) { return; }
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash(dash);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.moveTo(area.left, y);
                ctx.lineTo(area.right, y);
                ctx.stroke();
                if (label) {
                    ctx.setLineDash([]);
                    ctx.fillStyle = color;
                    ctx.font = '600 10px Inter, sans-serif';
                    ctx.textAlign = align;
                    ctx.textBaseline = 'bottom';
                    const labelX = align === 'left' ? area.left + 4 : area.right - 4;
                    ctx.fillText(label, labelX, y - 2);
                }
                ctx.restore();
            };

            refLine(22, 'rgba(107,136,147,0.55)', [4, 4], '22% (C/D)', 'left');
            refLine(33, 'rgba(107,136,147,0.55)', [4, 4], '33% (B/C)');
            refLine(44, 'rgba(107,136,147,0.55)', [4, 4], '44% (A/B)');
            refLine(nationalAvg, '#1c5f6d', [6, 3], "Nat'l avg " + nationalAvg + '%');

            const meta = chart.getDatasetMeta(0);
            ctx.save();
            ctx.strokeStyle = 'rgba(20,40,50,0.78)';
            ctx.lineWidth = 1.5;
            meta.data.forEach(function (bar, i) {
                const se = ses[i];
                if (!se) { return; }
                const x = bar.x;
                const yTop = yScale.getPixelForValue(hccData[i] + se);
                const yBot = yScale.getPixelForValue(Math.max(0, hccData[i] - se));
                const cap = 4;
                ctx.beginPath();
                ctx.moveTo(x, yTop); ctx.lineTo(x, yBot);
                ctx.moveTo(x - cap, yTop); ctx.lineTo(x + cap, yTop);
                ctx.moveTo(x - cap, yBot); ctx.lineTo(x + cap, yBot);
                ctx.stroke();
            });
            ctx.restore();
        }
    };

    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: hccLabels,
            datasets: [{
                label: 'Hard Coral Cover (%)',
                data: hccData,
                backgroundColor: barColors,
                borderRadius: 4,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (c) {
                            const i = c.dataIndex;
                            const se = ses[i];
                            return 'HCC ' + hccData[i].toFixed(1) + '%'
                                + (se ? ' ± ' + se.toFixed(1) + ' SE' : '')
                                + ' · Category ' + sites[i].coverage_class
                                + ' · ' + sites[i].n_transects + ' transect(s)';
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 0 } },
                y: {
                    beginAtZero: true,
                    suggestedMax: suggestedMax,
                    title: { display: true, text: 'Hard Coral Cover (%)' },
                    grid: { color: 'rgba(28,95,109,0.08)' }
                }
            }
        },
        plugins: [hccExtras]
    });
}
