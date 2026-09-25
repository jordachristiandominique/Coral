// Keep in sync with COVERAGE_CLASS_LABELS in accounts/models.py.
const COVERAGE_CLASS_LABELS = {
    A: 'HCC more than 44%',
    B: 'HCC more than 33% up to 44%',
    C: 'HCC more than 22% up to 33%',
    D: 'HCC 0-22%'
};
function describeCoverageClass(code) {
    return COVERAGE_CLASS_LABELS[code] || 'Awaiting analysis';
}

const initializeAnalysisResults = function () {
    const chartScript = document.getElementById('analysis-chart-data');
    let labels = [];
    let values = [];
    let classValues = [0, 0, 0, 0, 0];

    if (chartScript) {
        try {
            const payload = JSON.parse(chartScript.textContent || '{}');
            labels = payload.labels || [];
            values = payload.values || [];
            classValues = payload.classes || classValues;
        } catch (error) {
            // Keep fallback values.
        }
    }

    // Shared, high-contrast tooltip + font styling for every chart on the page
    // (fixes the low-contrast hover readout).
    if (window.Chart) {
        Chart.defaults.font.family = "'Inter', 'Segoe UI', Arial, sans-serif";
        Chart.defaults.color = '#4a6b74';
        const tt = Chart.defaults.plugins.tooltip;
        tt.backgroundColor = 'rgba(15, 45, 55, 0.96)';
        tt.titleColor = '#ffffff';
        tt.bodyColor = '#ffffff';
        tt.borderColor = 'rgba(255, 255, 255, 0.14)';
        tt.borderWidth = 1;
        tt.padding = 10;
        tt.cornerRadius = 8;
        tt.titleFont = { size: 12, weight: '700' };
        tt.bodyFont = { size: 12, weight: '600' };
        tt.displayColors = true;
        tt.boxPadding = 5;
        tt.usePointStyle = true;
    }

    // ---- Site Hard Coral Cover (± SE) with category thresholds + benchmark ----
    // Each site's mean HCC with an error bar (± standard error across its
    // transects), plus reference lines at the Licuanan A/B/C/D thresholds and
    // the Philippine national average. Pending sites (no HCC) are omitted.
    const siteHccEl = document.getElementById('analysisSiteHccChart');
    if (siteHccEl && window.Chart) {
        let hccRows = [];
        let nationalAvg = 22.8;
        const batchScript = document.getElementById('analysis-batch-data');
        if (batchScript) {
            try { hccRows = JSON.parse(batchScript.textContent || '[]'); } catch (e) { hccRows = []; }
        }
        if (chartScript) {
            try {
                const p = JSON.parse(chartScript.textContent || '{}');
                if (typeof p.national_hcc_average === 'number') { nationalAvg = p.national_hcc_average; }
            } catch (e) { /* keep default */ }
        }

        const sites = hccRows.filter(function (r) {
            return ['A', 'B', 'C', 'D'].indexOf(r.coverage_class) !== -1;
        });

        if (sites.length) {
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

                    const refLine = function (val, color, dash, label) {
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
                            ctx.textAlign = 'right';
                            ctx.textBaseline = 'bottom';
                            ctx.fillText(label, area.right - 4, y - 2);
                        }
                        ctx.restore();
                    };

                    refLine(22, 'rgba(107,136,147,0.55)', [4, 4], '22% (C/D)');
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

            new Chart(siteHccEl, {
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
    }

    const classEl = document.getElementById('analysisClassChart');
    if (classEl && window.Chart) {
        const doughnutLabelPlugin = {
            id: 'doughnutLabelPlugin',
            afterDatasetDraw: function (chart, args) {
                if (args.index !== 0) {
                    return;
                }

                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                const dataset = chart.data.datasets[0];
                const labels = chart.data.labels || [];

                // Calculate total for percentage
                const total = dataset.data.reduce((a, b) => a + b, 0);

                meta.data.forEach(function (arc, index) {
                    const value = dataset.data[index];
                    if (!value) {
                        return;
                    }

                    const percentage = total > 0 ? ((value / total) * 100).toFixed(0) : 0;

                    const angle = (arc.startAngle + arc.endAngle) / 2;
                    const outer = arc.outerRadius;
                    const inner = arc.innerRadius;
                    const color = Array.isArray(dataset.backgroundColor)
                        ? dataset.backgroundColor[index]
                        : dataset.backgroundColor;

                    const lineStartX = arc.x + Math.cos(angle) * (outer + 4);
                    const lineStartY = arc.y + Math.sin(angle) * (outer + 4);
                    const lineMidX = arc.x + Math.cos(angle) * (outer + 16);
                    const lineMidY = arc.y + Math.sin(angle) * (outer + 16);
                    const lineEndX = arc.x + Math.cos(angle) * (outer + 30);
                    const lineEndY = arc.y + Math.sin(angle) * (outer + 30);

                    const align = Math.cos(angle) >= 0 ? 'left' : 'right';
                    const textX = lineEndX + (align === 'left' ? 12 : -12);

                    ctx.save();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    ctx.moveTo(lineStartX, lineStartY);
                    ctx.quadraticCurveTo(lineMidX, lineMidY, lineEndX, lineEndY);
                    ctx.stroke();

                    ctx.fillStyle = color;
                    ctx.textAlign = align;
                    ctx.textBaseline = 'middle';
                    ctx.font = 'italic 600 15px "Inter", sans-serif';
                    ctx.fillText(String(labels[index] || ''), textX, lineEndY);

                    const valueX = arc.x + Math.cos(angle) * (inner + -7);
                    const valueY = arc.y + Math.sin(angle) * (inner + -7);
                    ctx.font = 'italic 600 14px "Inter", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(String(percentage) + '%', valueX, valueY);
                    ctx.restore();
                });
            }
        };

        new Chart(classEl, {
            type: 'doughnut',
            data: {
                labels: ['Category A', 'Category B', 'Category C', 'Category D', 'Pending'],
                datasets: [
                    {
                        data: classValues,
                        backgroundColor: ['#1e8e5a', '#f2c11f', '#e8820c', '#d64545', '#9bb1b8'],
                        borderRadius: 999,
                        spacing: 12,
                        borderWidth: 10,
                        borderColor: '#ffffff',
                        hoverOffset: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                rotation: 0,
                circumference: 360,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (c) {
                                const total = c.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                                const pct = total ? Math.round((c.parsed / total) * 100) : 0;
                                return ' ' + c.parsed + ' site' + (c.parsed === 1 ? '' : 's') + ' · ' + pct + '%';
                            }
                        }
                    }
                }
            },
            plugins: [doughnutLabelPlugin]
        });
    }

    // 7-Class Distribution Chart
    const coralClassEl = document.getElementById('analysisCoralClassChart');
    if (coralClassEl && window.Chart) {
        let classPercentages = {};
        if (chartScript) {
            try {
                const payload = JSON.parse(chartScript.textContent || '{}');
                classPercentages = payload.class_percentages || {};
            } catch (error) {
                console.error('Error parsing chart data for class percentages:', error);
            }
        }

        const classLabels = [
            'Hard Coral', 'Soft Coral', 'Macroalgae', 'Halimeda',
            'Algae Assemblage', 'Abiotic', 'Other Biota'
        ];
        const classColors = [
            '#d4a574', '#e85d75', '#f5d76e', '#7ec8c8',
            '#a8d5a8', '#b0b0b0', '#d8a5d5'
        ];
        const classData = classLabels.map(label => classPercentages[label] || 0);

        new Chart(coralClassEl, {
            type: 'doughnut',
            data: {
                labels: classLabels,
                datasets: [{
                    data: classData,
                    backgroundColor: classColors,
                    borderRadius: 999,
                    spacing: 8,
                    borderWidth: 10,
                    borderColor: '#ffffff',
                    hoverOffset: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (c) { return ' ' + c.label + ': ' + c.parsed.toFixed(1) + '%'; }
                        }
                    },
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            font: { size: 11 },
                            padding: 10,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            boxWidth: 8
                        }
                    }
                }
            }
        });
    }

    // ---- Per-site benthic composition (100% stacked, horizontal) ----
    const siteBenthicEl = document.getElementById('analysisSiteBenthicChart');
    if (siteBenthicEl && window.Chart) {
        let benthicRows = [];
        const bScript = document.getElementById('analysis-batch-data');
        if (bScript) {
            try { benthicRows = JSON.parse(bScript.textContent || '[]'); } catch (e) { benthicRows = []; }
        }
        const benthicSites = benthicRows.filter(function (r) {
            return r.benthic && Object.keys(r.benthic).length;
        });

        if (benthicSites.length) {
            const classLabels = [
                'Hard Coral', 'Soft Coral', 'Macroalgae', 'Halimeda',
                'Algae Assemblage', 'Abiotic', 'Other Biota'
            ];
            const classColors = [
                '#d4a574', '#e85d75', '#f5d76e', '#7ec8c8',
                '#a8d5a8', '#b0b0b0', '#d8a5d5'
            ];
            const siteLabels = benthicSites.map(function (r) { return r.name; });
            const datasets = classLabels.map(function (cls, idx) {
                return {
                    label: cls,
                    data: benthicSites.map(function (r) { return r.benthic[cls] || 0; }),
                    backgroundColor: classColors[idx],
                    stack: 'benthic',
                    borderWidth: 0
                };
            });

            new Chart(siteBenthicEl, {
                type: 'bar',
                data: { labels: siteLabels, datasets: datasets },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 12 }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (c) { return c.dataset.label + ': ' + c.parsed.x.toFixed(1) + '%'; }
                            }
                        }
                    },
                    scales: {
                        x: { stacked: true, max: 100, title: { display: true, text: '% of points' }, grid: { color: 'rgba(28,95,109,0.08)' } },
                        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }
                    }
                }
            });
        }
    }

    // Initialize map
    const mapEl = document.getElementById('analysisMap');
    if (mapEl && window.L) {
        const map = L.map('analysisMap', {
            zoomControl: true,
            scrollWheelZoom: false
        }).setView([6.92, 125.80], 10);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
        }).addTo(map);

        // Add markers for each batch
        const batchScript = document.getElementById('analysis-batch-data');
        if (batchScript) {
            try {
                const batches = JSON.parse(batchScript.textContent || '[]');
                batches.forEach(batch => {
                    if (batch.latitude && batch.longitude) {
                        L.circleMarker([batch.latitude, batch.longitude], {
                            radius: 8,
                            fillColor:
                                batch.coverage_class === 'A' ? '#1e8e5a' :
                                    batch.coverage_class === 'B' ? '#f2c11f' :
                                        batch.coverage_class === 'C' ? '#e8820c' :
                                            batch.coverage_class === 'D' ? '#d64545' : '#6a8893',
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).bindPopup(`<strong>${batch.name}</strong><br>Area: ${batch.area_name}<br>Category: ${batch.coverage_class} &mdash; ${describeCoverageClass(batch.coverage_class)}`).addTo(map);
                    }
                });
            } catch (error) {
                console.error('Error initializing map markers:', error);
            }
        }
    }
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAnalysisResults);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeAnalysisResults();
}
