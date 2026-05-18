const initializePublicDashboard = function () {
    const surveyScript = document.getElementById('public-surveys-data');
    let surveys = [];

    if (surveyScript) {
        try {
            surveys = JSON.parse(surveyScript.textContent || '[]');
        } catch (error) {
            surveys = [];
        }
    }

    if (!surveys.length) {
        // Sample captures are intentionally placed in open water areas of Davao Gulf.
        surveys = [
            { area: 'Samal Offshore North', surveyors: 'R. Team', lat: 6.900, lng: 125.650, date: '2026-04-14', coverage: 64, classCode: 'A' },
            { area: 'Central Gulf Transect', surveyors: 'Davao Marine Unit', lat: 6.850, lng: 125.770, date: '2026-04-10', coverage: 58, classCode: 'B' },
            { area: 'Talikud Offshore East', surveyors: 'Blue Sentinel', lat: 6.880, lng: 125.810, date: '2026-03-28', coverage: 42, classCode: 'B' },
            { area: 'Pujada Deep Water 1', surveyors: 'Davao Marine Unit', lat: 6.840, lng: 125.850, date: '2026-03-08', coverage: 37, classCode: 'C' },
            { area: 'Pujada Deep Water 2', surveyors: 'R. Team', lat: 6.800, lng: 125.790, date: '2026-02-19', coverage: 61, classCode: 'A' },
            { area: 'Southern Gulf Offshore', surveyors: 'Blue Sentinel', lat: 6.760, lng: 125.750, date: '2026-02-09', coverage: 46, classCode: 'B' },
            { area: 'Governor Generoso Offshore', surveyors: 'R. Team', lat: 6.720, lng: 125.830, date: '2026-01-26', coverage: 32, classCode: 'C' },
            { area: 'Cape San Agustin Channel', surveyors: 'R. Team', lat: 6.680, lng: 125.790, date: '2026-01-11', coverage: 67, classCode: 'A' },
            { area: 'Samal West Open Water', surveyors: 'Blue Sentinel', lat: 6.800, lng: 125.600, date: '2025-12-20', coverage: 54, classCode: 'B' },
            { area: 'Davao Gulf Midline', surveyors: 'Davao Marine Unit', lat: 6.860, lng: 125.710, date: '2025-11-29', coverage: 39, classCode: 'C' },
            { area: 'Mati Offshore Belt', surveyors: 'R. Team', lat: 6.780, lng: 125.870, date: '2025-11-08', coverage: 62, classCode: 'A' },
            { area: 'Sarangani Current Edge', surveyors: 'Blue Sentinel', lat: 6.700, lng: 125.910, date: '2025-10-17', coverage: 44, classCode: 'B' }
        ];
    }

    const classFilter = document.getElementById('class-filter');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const findingsBody = document.getElementById('findings-body');
    const statSurveys = document.getElementById('stat-surveys');
    const statCoverage = document.getElementById('stat-coverage');
    const statSites = document.getElementById('stat-sites');
    const statClassA = document.getElementById('stat-class-a');
    const legendA = document.getElementById('legend-a');
    const legendB = document.getElementById('legend-b');
    const legendC = document.getElementById('legend-c');
    const donut = document.getElementById('distribution-donut');
    const linePath = document.getElementById('line-path');
    const lineChart = document.getElementById('coverage-line-chart');
    const lineCaption = document.getElementById('line-caption');

    if (typeof L === 'undefined') {
        return;
    }

    const map = L.map('public-survey-map', {
        zoomControl: true,
        scrollWheelZoom: false
    }).setView([6.86, 125.86], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const markerLayer = L.layerGroup().addTo(map);

    function colorForClass(classCode) {
        if (classCode === 'A') return '#1f9d73';
        if (classCode === 'B') return '#f5a623';
        return '#e05a47';
    }

    function parseDate(value) {
        if (!value) {
            return null;
        }
        const parsed = new Date(value + 'T00:00:00');
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatCoverage(value) {
        if (value === null || value === undefined || Number.isNaN(Number(value))) {
            return '--';
        }
        return String(Math.round(Number(value)));
    }

    function formatSurveyorChips(value) {
        if (!value) {
            return '<span class="surveyors-empty">Not set</span>';
        }
        const names = String(value)
            .split(',')
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
        if (!names.length) {
            return '<span class="surveyors-empty">Not set</span>';
        }
        return names.map(function (name) {
            return '<span class="surveyor-chip">' + escapeHtml(name) + '</span>';
        }).join('');
    }

    function formatSurveyorText(value) {
        if (!value) {
            return 'Not set';
        }
        const names = String(value)
            .split(',')
            .map(function (item) { return item.trim(); })
            .filter(Boolean);
        return names.length ? names.join(', ') : 'Not set';
    }

    function applyFilters() {
        const classValue = classFilter.value;
        const startDate = parseDate(startDateInput.value);
        const endDate = parseDate(endDateInput.value);

        return surveys.filter(function (row) {
            if (classValue !== 'ALL' && row.classCode !== classValue) {
                return false;
            }
            const rowDate = parseDate(row.date);
            if (startDate && rowDate < startDate) {
                return false;
            }
            if (endDate && rowDate > endDate) {
                return false;
            }
            return true;
        });
    }

    function renderMarkers(filtered) {
        markerLayer.clearLayers();

        filtered.forEach(function (row) {
            if (row.lat === null || row.lng === null || row.coverage === null) {
                return;
            }
            const coverageLabel = formatCoverage(row.coverage);
            const marker = L.circleMarker([row.lat, row.lng], {
                radius: 8,
                color: '#0f3744',
                weight: 1,
                fillColor: colorForClass(row.classCode),
                fillOpacity: 0.92
            });

            marker.bindPopup(
                '<strong>' + row.area + '</strong><br>' +
                'Surveyors: ' + formatSurveyorText(row.surveyors) + '<br>' +
                'Date: ' + row.date + '<br>' +
                'Coverage: ' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '<br>' +
                'Class: ' + row.classCode
            );

            markerLayer.addLayer(marker);
        });

        if (filtered.length) {
            const bounds = L.latLngBounds(filtered.map(function (item) {
                return [item.lat, item.lng];
            }));
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
        }
    }

    function renderSummary(filtered) {
        const valid = filtered.filter(function (row) {
            return row.coverage !== null && row.classCode;
        });
        const total = valid.length;
        const avg = total ? Math.round(valid.reduce(function (acc, row) {
            return acc + row.coverage;
        }, 0) / total) : 0;

        const sites = new Set(valid.map(function (row) {
            return row.area;
        })).size;

        const classACount = valid.filter(function (row) {
            return row.classCode === 'A';
        }).length;

        statSurveys.textContent = String(total);
        statCoverage.textContent = String(avg) + '%';
        statSites.textContent = String(sites);
        statClassA.textContent = total ? Math.round((classACount / total) * 100) + '%' : '0%';
    }

    function renderDonut(filtered) {
        const valid = filtered.filter(function (row) {
            return row.coverage !== null && row.classCode;
        });
        const aCount = valid.filter(function (row) { return row.classCode === 'A'; }).length;
        const bCount = valid.filter(function (row) { return row.classCode === 'B'; }).length;
        const cCount = valid.filter(function (row) { return row.classCode === 'C'; }).length;
        const total = aCount + bCount + cCount;

        const aDeg = total ? (aCount / total) * 360 : 0;
        const bDeg = total ? (bCount / total) * 360 : 0;
        const cDeg = 360 - aDeg - bDeg;

        donut.style.background = 'conic-gradient(' +
            '#1f9d73 0deg ' + aDeg.toFixed(1) + 'deg, ' +
            '#f5a623 ' + aDeg.toFixed(1) + 'deg ' + (aDeg + bDeg).toFixed(1) + 'deg, ' +
            '#e05a47 ' + (aDeg + bDeg).toFixed(1) + 'deg ' + (aDeg + bDeg + cDeg).toFixed(1) + 'deg)';

        legendA.textContent = aCount + ' surveys';
        legendB.textContent = bCount + ' surveys';
        legendC.textContent = cCount + ' surveys';
    }

    function monthKey(d) {
        const dt = parseDate(d);
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    }

    function renderLineChart(filtered) {
        const sorted = filtered.filter(function (row) {
            return row.coverage !== null;
        }).slice().sort(function (a, b) {
            return parseDate(a.date) - parseDate(b.date);
        });

        const monthBuckets = {};
        sorted.forEach(function (row) {
            const key = monthKey(row.date);
            if (!monthBuckets[key]) {
                monthBuckets[key] = [];
            }
            monthBuckets[key].push(row.coverage);
        });

        const keys = Object.keys(monthBuckets).sort().slice(-6);
        if (!keys.length) {
            linePath.setAttribute('d', '');
            Array.from(lineChart.querySelectorAll('.line-point')).forEach(function (point) {
                point.remove();
            });
            lineCaption.textContent = 'No survey data for the selected filters.';
            return;
        }

        const values = keys.map(function (key) {
            const points = monthBuckets[key];
            return points.reduce(function (acc, n) { return acc + n; }, 0) / points.length;
        });

        const minY = Math.min.apply(null, values.concat([30]));
        const maxY = Math.max.apply(null, values.concat([70]));

        const xStart = 30;
        const xEnd = 580;
        const yTop = 20;
        const yBottom = 190;

        const points = values.map(function (value, idx) {
            const x = keys.length === 1 ? (xStart + xEnd) / 2 : xStart + (idx / (keys.length - 1)) * (xEnd - xStart);
            const normalized = (value - minY) / (maxY - minY || 1);
            const y = yBottom - normalized * (yBottom - yTop);
            return { x: x, y: y, value: value };
        });

        const d = points.map(function (p, idx) {
            return (idx === 0 ? 'M ' : 'L ') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
        linePath.setAttribute('d', d);

        Array.from(lineChart.querySelectorAll('.line-point')).forEach(function (point) {
            point.remove();
        });

        points.forEach(function (p) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', 'line-point');
            circle.setAttribute('cx', p.x.toFixed(1));
            circle.setAttribute('cy', p.y.toFixed(1));
            circle.setAttribute('r', '4');
            lineChart.appendChild(circle);
        });

        lineCaption.textContent = 'Showing monthly average coverage for the latest ' + keys.length + ' months.';
    }

    function renderFindings(filtered) {
        const latest = filtered.filter(function (row) {
            return row.coverage !== null;
        }).slice().sort(function (a, b) {
            return parseDate(b.date) - parseDate(a.date);
        }).slice(0, 6);

        findingsBody.innerHTML = '';

        if (!latest.length) {
            findingsBody.innerHTML = '<tr><td colspan="6">No findings available for the selected filters.</td></tr>';
            return;
        }

        latest.forEach(function (row) {
            const coverageLabel = formatCoverage(row.coverage);
            const tr = document.createElement('tr');
            tr.innerHTML = '<td>' + row.area + '</td>' +
                '<td class="surveyors-cell">' + formatSurveyorChips(row.surveyors) + '</td>' +
                '<td>' + row.date + '</td>' +
                '<td>' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '</td>' +
                '<td><span class="class-badge class-' + row.classCode.toLowerCase() + '">Class ' + row.classCode + '</span></td>' +
                '<td><button class="btn btn-outline" type="button">View Details</button></td>';

            tr.querySelector('button').addEventListener('click', function () {
                window.alert(
                    'Area: ' + row.area + '\n' +
                    'Surveyors: ' + formatSurveyorText(row.surveyors) + '\n' +
                    'Date: ' + row.date + '\n' +
                    'Coverage: ' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '\n' +
                    'Class: ' + row.classCode
                );
            });

            findingsBody.appendChild(tr);
        });
    }

    function renderAll() {
        const filtered = applyFilters();
        renderMarkers(filtered);
        renderSummary(filtered);
        renderDonut(filtered);
        renderLineChart(filtered);
        renderFindings(filtered);
    }

    [classFilter, startDateInput, endDateInput].forEach(function (el) {
        el.addEventListener('change', renderAll);
    });

    renderAll();
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePublicDashboard);
} else {
    // DOM is already loaded (script loaded late in page)
    initializePublicDashboard();
}
