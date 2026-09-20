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

    const trendEl = document.getElementById('analysisTrendChart');
    if (trendEl && window.Chart) {
        new Chart(trendEl, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Avg HCC',
                        data: values,
                        borderColor: '#1c5f6d',
                        backgroundColor: 'rgba(42, 135, 147, 0.15)',
                        tension: 0.35,
                        fill: true,
                        pointRadius: 3,
                        pointBackgroundColor: '#1c5f6d'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(28, 95, 109, 0.08)' }
                    },
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(28, 95, 109, 0.08)' }
                    }
                }
            }
        });
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
                    ctx.font = 'italic 600 15px "Space Grotesk", sans-serif';
                    ctx.fillText(String(labels[index] || ''), textX, lineEndY);

                    const valueX = arc.x + Math.cos(angle) * (inner + -7);
                    const valueY = arc.y + Math.sin(angle) * (inner + -7);
                    ctx.font = 'italic 600 14px "Space Grotesk", sans-serif';
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
                    legend: {
                        display: true,
                        position: 'right',
                        labels: {
                            font: { size: 11 },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                }
            }
        });
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
