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
    let classValues = [0, 0, 0, 0, 0];

    if (chartScript) {
        try {
            const payload = JSON.parse(chartScript.textContent || '{}');
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

    const showEmptyChart = function (canvas, text) {
        canvas.hidden = true;
        const message = document.createElement('p');
        message.className = 'chart-sub';
        message.textContent = text;
        canvas.after(message);
    };

    // ---- Site Hard Coral Cover (± SE) with category thresholds + benchmark ----
    // Each site's mean HCC with an error bar (± standard error across its
    // transects), plus reference lines at the Licuanan A/B/C/D thresholds and
    // the Philippine national average. Pending sites (no HCC) are omitted.
    const siteHccEl = document.getElementById('analysisSiteHccChart');
    const siteHccData = document.getElementById('analysis-batch-data');
    if (siteHccEl && siteHccData) {
        const rows = JSON.parse(siteHccData.textContent || '[]');
        const chartData = chartScript ? JSON.parse(chartScript.textContent || '{}') : {};
        renderSiteHccChart(siteHccEl, rows, chartData.national_hcc_average ?? 22.8);
    }

    const classEl = document.getElementById('analysisClassChart');
    if (classEl && window.Chart && classValues.some(value => value > 0)) {
        new Chart(classEl, {
            type: 'bar',
            data: {
                labels: ['Category A', 'Category B', 'Category C', 'Category D', 'Pending'],
                datasets: [{ label: 'Sites', data: classValues,
                    backgroundColor: ['#1e8e5a', '#f2c11f', '#e8820c', '#d64545', '#9bb1b8'],
                    borderRadius: 5 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: {
                    label: function (context) { return context.parsed.x + ' sites'; }
                } } },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Number of sites' } },
                    y: { grid: { display: false } }
                }
            }
        });
    } else if (classEl && !classValues.some(value => value > 0)) {
        showEmptyChart(classEl, 'No survey categories for these filters.');
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
            const primaryLabels = ['Hard Coral', 'Soft Coral', 'Other Substrate'];
            const recordedLabels = [...new Set(benthicSites.flatMap(row => Object.keys(row.benthic)))];
            const classLabels = primaryLabels.concat(recordedLabels.filter(label => !primaryLabels.includes(label)));
            const payload = JSON.parse(chartScript.textContent || '{}');
            const colors = payload.composition_colors || {};
            const classColors = classLabels.map(label => colors[label] || '#7a8d96');
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
                        x: { stacked: true, max: 100, title: { display: true, text: '% of reviewed markers' }, grid: { color: 'rgba(28,95,109,0.08)' } },
                        y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } }
                    }
                }
            });
        } else {
            showEmptyChart(siteBenthicEl, 'No saved marker composition for these filters.');
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
