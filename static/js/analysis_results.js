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

function latestAnalysisSurveys(rows) {
    const locations = new Map();
    const visibleRows = rows.filter(row => row.is_map_visible !== false
        && Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
    visibleRows.sort((a, b) => (b.survey_date || '').localeCompare(a.survey_date || '')
        || (b.created_at || '').localeCompare(a.created_at || '') || b.id - a.id);
    visibleRows.forEach(row => {
        const location = `${row.latitude},${row.longitude}`;
        if (!locations.has(location)) locations.set(location, row);
    });
    return [...locations.values()];
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

        // The server has already applied the selected survey scope and filters.
        const batchScript = document.getElementById('analysis-batch-data');
        if (batchScript) {
            try {
                const batches = latestAnalysisSurveys(JSON.parse(batchScript.textContent || '[]'));
                const colors = {A: '#1e8e5a', B: '#f2c11f', C: '#e8820c', D: '#d64545'};
                batches.forEach(batch => {
                    const reviewed = Object.hasOwn(colors, batch.coverage_class);
                    const popup = document.createElement('div');
                    const title = document.createElement('strong');
                    title.textContent = batch.name;
                    popup.appendChild(title);
                    const metadata = [
                        `Area: ${batch.area_name}`,
                        `Survey date: ${batch.survey_date}`,
                        reviewed ? `HCC: ${batch.avg_coverage.toFixed(1)}% · Category ${batch.coverage_class}` : 'No analysis available',
                    ];
                    metadata.forEach(text => {
                        const line = document.createElement('p');
                        line.textContent = text;
                        popup.appendChild(line);
                    });
                    L.circleMarker([batch.latitude, batch.longitude], {
                        radius: reviewed ? 8 + Math.max(0, Math.min(100, batch.avg_coverage)) / 100 * 16 : 7,
                        fillColor: colors[batch.coverage_class] || '#2a8793',
                        color: '#fff', weight: 2, opacity: 1, fillOpacity: 0.8,
                    }).bindPopup(popup).addTo(map);
                });
                if (batches.length) {
                    const bounds = L.latLngBounds(batches.map(batch => [batch.latitude, batch.longitude]));
                    map.fitBounds(bounds, {padding: [40, 40], maxZoom: 13});
                }
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
