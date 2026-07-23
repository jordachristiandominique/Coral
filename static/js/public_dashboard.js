// Benthic classes in fixed order. Colours are assigned by slot and never
// cycled or reordered — the ordering is what keeps adjacent segments
// distinguishable for colour-vision deficiency, so don't shuffle it.
// Validated as a set: worst adjacent CVD dE 9.1, normal-vision dE 19.6.
const CLASS_ORDER = [
    'Hard Coral', 'Soft Coral', 'Macroalgae', 'Halimeda',
    'Algae Assemblage', 'Abiotic', 'Other Biota'
];
const CLASS_COLORS = {
    'Hard Coral': '#2a78d6',
    'Soft Coral': '#008300',
    'Macroalgae': '#e87ba4',
    'Halimeda': '#eda100',
    'Algae Assemblage': '#1baf7a',
    'Abiotic': '#eb6834',
    'Other Biota': '#4a3aa7'
};
// Reef health is a status scale, not a series — these are reserved colours
// and always ship alongside the "Class A/B/C" label, never colour alone.
const STATUS_COLORS = { A: '#0ca30c', B: '#fab219', C: '#d03b3b' };
const COVERAGE_CLASS_LABELS = {
    A: 'High coral coverage',
    B: 'Moderate coral coverage',
    C: 'Low coral coverage'
};
function describeCoverageClass(code) {
    return COVERAGE_CLASS_LABELS[code] || 'Awaiting analysis';
}

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
        const generateClassDistribution = function (hardCoral, softCoral) {
            const total = hardCoral + softCoral + 15 + 8 + 12 + 20 + 10;
            return {
                'Hard Coral': { count: hardCoral, percentage: Math.round((hardCoral / total) * 100) },
                'Soft Coral': { count: softCoral, percentage: Math.round((softCoral / total) * 100) },
                'Macroalgae': { count: 15, percentage: Math.round((15 / total) * 100) },
                'Halimeda': { count: 8, percentage: Math.round((8 / total) * 100) },
                'Algae Assemblage': { count: 12, percentage: Math.round((12 / total) * 100) },
                'Abiotic': { count: 20, percentage: Math.round((20 / total) * 100) },
                'Other Biota': { count: 10, percentage: Math.round((10 / total) * 100) }
            };
        };

        surveys = [
            { area: 'Samal Offshore North', surveyors: 'R. Team', lat: 6.900, lng: 125.650, date: '2026-04-14', coverage: 64, classCode: 'A', classDistribution: generateClassDistribution(50, 15) },
            { area: 'Central Gulf Transect', surveyors: 'Davao Marine Unit', lat: 6.850, lng: 125.770, date: '2026-04-10', coverage: 58, classCode: 'B', classDistribution: generateClassDistribution(40, 18) },
            { area: 'Talikud Offshore East', surveyors: 'Blue Sentinel', lat: 6.880, lng: 125.810, date: '2026-03-28', coverage: 42, classCode: 'B', classDistribution: generateClassDistribution(30, 12) },
            { area: 'Pujada Deep Water 1', surveyors: 'Davao Marine Unit', lat: 6.840, lng: 125.850, date: '2026-03-08', coverage: 37, classCode: 'C', classDistribution: generateClassDistribution(25, 12) },
            { area: 'Pujada Deep Water 2', surveyors: 'R. Team', lat: 6.800, lng: 125.790, date: '2026-02-19', coverage: 61, classCode: 'A', classDistribution: generateClassDistribution(48, 13) },
            { area: 'Southern Gulf Offshore', surveyors: 'Blue Sentinel', lat: 6.760, lng: 125.750, date: '2026-02-09', coverage: 46, classCode: 'B', classDistribution: generateClassDistribution(35, 11) },
            { area: 'Governor Generoso Offshore', surveyors: 'R. Team', lat: 6.720, lng: 125.830, date: '2026-01-26', coverage: 32, classCode: 'C', classDistribution: generateClassDistribution(22, 10) },
            { area: 'Cape San Agustin Channel', surveyors: 'R. Team', lat: 6.680, lng: 125.790, date: '2026-01-11', coverage: 67, classCode: 'A', classDistribution: generateClassDistribution(52, 15) },
            { area: 'Samal West Open Water', surveyors: 'Blue Sentinel', lat: 6.800, lng: 125.600, date: '2025-12-20', coverage: 54, classCode: 'B', classDistribution: generateClassDistribution(42, 12) },
            { area: 'Davao Gulf Midline', surveyors: 'Davao Marine Unit', lat: 6.860, lng: 125.710, date: '2025-11-29', coverage: 39, classCode: 'C', classDistribution: generateClassDistribution(28, 11) },
            { area: 'Mati Offshore Belt', surveyors: 'R. Team', lat: 6.780, lng: 125.870, date: '2025-11-08', coverage: 62, classCode: 'A', classDistribution: generateClassDistribution(49, 13) },
            { area: 'Sarangani Current Edge', surveyors: 'Blue Sentinel', lat: 6.700, lng: 125.910, date: '2025-10-17', coverage: 44, classCode: 'B', classDistribution: generateClassDistribution(33, 11) }
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
    const ecosystemDonut = document.getElementById('ecosystem-donut');
    const ecosystemLegend = document.getElementById('ecosystem-legend');
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
        if (classCode === 'A') return STATUS_COLORS.A;
        if (classCode === 'B') return STATUS_COLORS.B;
        return STATUS_COLORS.C;
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

    function buildClassDistributionHtml(classDistribution) {
        if (!classDistribution || Object.keys(classDistribution).length === 0) {
            return '<p style="font-size: 12px; margin: 8px 0; color: #666;">No class data</p>';
        }

        let html = '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 12px;">';
        html += '<strong style="display: block; margin-bottom: 8px;">Class Distribution:</strong>';

        const classOrder = CLASS_ORDER;
        const classColors = CLASS_COLORS;

        classOrder.forEach(function (className) {
            const data = classDistribution[className];
            if (data && data.percentage > 0) {
                const color = classColors[className] || '#ccc';
                const barWidth = data.percentage;
                html += '<div style="margin-bottom: 6px;">';
                html += '<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">';
                html += '<span>' + escapeHtml(className) + '</span>';
                html += '<span style="font-weight: bold;">' + data.percentage + '%</span>';
                html += '</div>';
                html += '<div style="background: #e0e0e0; height: 6px; border-radius: 3px; overflow: hidden;">';
                html += '<div style="background: ' + color + '; height: 100%; width: ' + barWidth + '%; border-radius: 3px;"></div>';
                html += '</div>';
                html += '</div>';
            }
        });

        html += '</div>';
        return html;
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

            const popupHtml = 
                '<strong>' + escapeHtml(row.area) + '</strong><br>' +
                'Surveyors: ' + formatSurveyorText(row.surveyors) + '<br>' +
                'Date: ' + row.date + '<br>' +
                'Coverage: ' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '<br>' +
                'Class: ' + row.classCode + ' - ' + describeCoverageClass(row.classCode) +
                buildClassDistributionHtml(row.classDistribution);

            marker.bindPopup(popupHtml);

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
            STATUS_COLORS.A + ' 0deg ' + aDeg.toFixed(1) + 'deg, ' +
            STATUS_COLORS.B + ' ' + aDeg.toFixed(1) + 'deg ' + (aDeg + bDeg).toFixed(1) + 'deg, ' +
            STATUS_COLORS.C + ' ' + (aDeg + bDeg).toFixed(1) + 'deg ' + (aDeg + bDeg + cDeg).toFixed(1) + 'deg)';

        legendA.textContent = aCount + ' surveys';
        legendB.textContent = bCount + ' surveys';
        legendC.textContent = cCount + ' surveys';
    }

    function renderEcosystemDonut(filtered) {
        const classOrder = CLASS_ORDER;
        const classColors = CLASS_COLORS;

        // Aggregate all class distribution data
        const totalCounts = {};
        let grandTotal = 0;

        classOrder.forEach(function (cls) {
            totalCounts[cls] = 0;
        });

        filtered.forEach(function (row) {
            if (row.classDistribution) {
                classOrder.forEach(function (cls) {
                    if (row.classDistribution[cls]) {
                        totalCounts[cls] += row.classDistribution[cls].count || 0;
                        grandTotal += row.classDistribution[cls].count || 0;
                    }
                });
            }
        });

        if (grandTotal === 0) {
            ecosystemDonut.style.background = '#f0f0f0';
            ecosystemLegend.innerHTML = '<div style="color: #999; font-size: 12px; grid-column: 1/-1;">No ecosystem data available</div>';
            return;
        }

        // Calculate percentages and degrees
        let conicGradientParts = [];
        let currentDeg = 0;

        classOrder.forEach(function (cls) {
            const count = totalCounts[cls];
            const percentage = Math.round((count / grandTotal) * 100);
            const degrees = (count / grandTotal) * 360;
            
            if (percentage > 0) {
                const color = classColors[cls];
                conicGradientParts.push(color + ' ' + currentDeg.toFixed(1) + 'deg ' + (currentDeg + degrees).toFixed(1) + 'deg');
                currentDeg += degrees;
            }
        });

        const conicGradient = 'conic-gradient(' + conicGradientParts.join(', ') + ')';
        ecosystemDonut.style.background = conicGradient;

        // Build legend
        let legendHtml = '';
        classOrder.forEach(function (cls) {
            const count = totalCounts[cls];
            const percentage = grandTotal ? Math.round((count / grandTotal) * 100) : 0;
            
            if (percentage > 0) {
                const color = classColors[cls];
                legendHtml += '<div class="eco-legend-item">' +
                    '<span class="eco-legend-swatch" style="background: ' + color + ';"></span>' +
                    '<span class="eco-legend-name">' + escapeHtml(cls) + '</span>' +
                    '<span class="eco-legend-value">' + percentage + '%</span>' +
                    '</div>';
            }
        });
        ecosystemLegend.innerHTML = legendHtml;
    }

    function monthKey(d) {
        const dt = parseDate(d);
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    }

    function renderStackedBarChart(filtered) {
        const stackedBarsGroup = document.getElementById('stacked-bars');
        const stackedLegend = document.getElementById('stacked-legend');
        const stackedCaption = document.getElementById('stacked-caption');
        const stacked = document.getElementById('stacked-bar-chart');

        const sorted = filtered.filter(function (row) {
            return row.classDistribution && Object.keys(row.classDistribution).length > 0;
        }).slice().sort(function (a, b) {
            return parseDate(a.date) - parseDate(b.date);
        });

        const monthBuckets = {};
        sorted.forEach(function (row) {
            const key = monthKey(row.date);
            if (!monthBuckets[key]) {
                monthBuckets[key] = [];
            }
            monthBuckets[key].push(row.classDistribution);
        });

        const keys = Object.keys(monthBuckets).sort().slice(-6);
        if (!keys.length) {
            stackedBarsGroup.innerHTML = '';
            stackedLegend.innerHTML = '';
            stackedCaption.textContent = 'No class distribution data for the selected filters.';
            return;
        }

        const classOrder = CLASS_ORDER;
        const classColors = CLASS_COLORS;

        // Calculate average percentages for each class per month
        const monthlyAverages = keys.map(function (key) {
            const distributions = monthBuckets[key];
            const averages = {};
            classOrder.forEach(function (className) {
                let total = 0;
                distributions.forEach(function (dist) {
                    if (dist[className]) {
                        total += dist[className].percentage;
                    }
                });
                averages[className] = Math.round(total / distributions.length);
            });
            return averages;
        });

        // Clear existing bars
        stackedBarsGroup.innerHTML = '';

        const xStart = 40;
        const xEnd = 570;
        const yBottom = 210;
        const barHeight = 150;

        const barWidth = Math.max(15, (xEnd - xStart) / keys.length * 0.7);
        const barSpacing = (xEnd - xStart) / keys.length;

        monthlyAverages.forEach(function (monthData, idx) {
            let yOffset = yBottom;
            let monthLabel = keys[idx].substring(5) + '/' + keys[idx].substring(0, 4);
            
            const xPos = xStart + idx * barSpacing + barSpacing / 2 - barWidth / 2;

            // Add month label
            const monthText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            monthText.setAttribute('x', xPos + barWidth / 2);
            monthText.setAttribute('y', yBottom + 20);
            monthText.setAttribute('text-anchor', 'middle');
            monthText.setAttribute('font-size', '11');
            monthText.setAttribute('fill', '#587483');
            monthText.textContent = monthLabel;
            stackedBarsGroup.appendChild(monthText);

            classOrder.forEach(function (className) {
                const percentage = monthData[className] || 0;
                if (percentage > 0) {
                    const segmentHeight = (barHeight * percentage) / 100;
                    const color = classColors[className];

                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', xPos);
                    rect.setAttribute('y', yOffset - segmentHeight);
                    rect.setAttribute('width', barWidth);
                    rect.setAttribute('height', segmentHeight);
                    rect.setAttribute('fill', color);
                    // 2px surface-coloured gap keeps adjacent segments readable
                    rect.setAttribute('stroke', '#ffffff');
                    rect.setAttribute('stroke-width', '2');
                    rect.setAttribute('class', 'stack-segment');

                    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                    title.textContent = className + ': ' + percentage + '%';
                    rect.appendChild(title);

                    stackedBarsGroup.appendChild(rect);
                    yOffset -= segmentHeight;
                }
            });
        });

        // Add y-axis percentage markers
        for (let i = 0; i <= 100; i += 25) {
            const y = yBottom - (barHeight * i) / 100;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', '20');
            text.setAttribute('y', y + 4);
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('font-size', '10');
            text.setAttribute('fill', '#587483');
            text.textContent = i + '%';
            stackedBarsGroup.appendChild(text);
        }

        // Render legend
        let legendHtml = '';
        classOrder.forEach(function (className) {
            const color = classColors[className];
            legendHtml += '<div class="stacked-legend-item">' +
                '<div class="stacked-legend-color" style="background: ' + color + ';"></div>' +
                '<span>' + escapeHtml(className) + '</span>' +
                '</div>';
        });
        stackedLegend.innerHTML = legendHtml;

        stackedCaption.textContent = 'Showing average class distribution for the latest ' + keys.length + ' months.';
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

        // Round the scale outward to tidy tick values
        const rawMin = Math.min.apply(null, values);
        const rawMax = Math.max.apply(null, values);
        const minY = Math.max(0, Math.floor((rawMin - 5) / 10) * 10);
        const maxY = Math.min(100, Math.ceil((rawMax + 5) / 10) * 10);

        const xStart = 44;
        const xEnd = 580;
        const yTop = 20;
        const yBottom = 190;

        const points = values.map(function (value, idx) {
            const x = keys.length === 1 ? (xStart + xEnd) / 2 : xStart + (idx / (keys.length - 1)) * (xEnd - xStart);
            const normalized = (value - minY) / (maxY - minY || 1);
            const y = yBottom - normalized * (yBottom - yTop);
            return { x: x, y: y, value: value, label: formatMonthLabel(keys[idx]) };
        });

        // Clear anything drawn by a previous render
        Array.from(lineChart.querySelectorAll(
            '.line-point, .line-tick, .line-tick-label, .line-x-label, .line-area, .line-hover'
        )).forEach(function (node) { node.remove(); });

        const svgNs = 'http://www.w3.org/2000/svg';
        const addEl = function (tag, attrs, text) {
            const el = document.createElementNS(svgNs, tag);
            Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
            if (text !== undefined) { el.textContent = text; }
            lineChart.appendChild(el);
            return el;
        };

        // Recessive horizontal gridlines + y tick labels
        const tickCount = 4;
        for (let i = 0; i <= tickCount; i += 1) {
            const value = minY + ((maxY - minY) * i) / tickCount;
            const y = yBottom - (i / tickCount) * (yBottom - yTop);
            addEl('line', { class: 'line-tick', x1: xStart, y1: y.toFixed(1), x2: xEnd, y2: y.toFixed(1) });
            addEl('text', {
                class: 'line-tick-label', x: xStart - 8, y: (y + 3.5).toFixed(1), 'text-anchor': 'end'
            }, Math.round(value) + '%');
        }

        // Area fill under the line gives the trend visual weight
        const areaD = points.map(function (p, idx) {
            return (idx === 0 ? 'M ' : 'L ') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ') + ' L ' + points[points.length - 1].x.toFixed(1) + ' ' + yBottom +
            ' L ' + points[0].x.toFixed(1) + ' ' + yBottom + ' Z';
        const area = document.createElementNS(svgNs, 'path');
        area.setAttribute('class', 'line-area');
        area.setAttribute('d', areaD);
        lineChart.insertBefore(area, linePath);

        const d = points.map(function (p, idx) {
            return (idx === 0 ? 'M ' : 'L ') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
        linePath.setAttribute('d', d);

        points.forEach(function (p) {
            addEl('text', {
                class: 'line-x-label', x: p.x.toFixed(1), y: yBottom + 18, 'text-anchor': 'middle'
            }, p.label);
        });

        points.forEach(function (p) {
            addEl('circle', {
                class: 'line-point', cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: '4.5'
            });
        });

        attachLineHover(points, yTop, yBottom);

        lineCaption.textContent = 'Showing monthly average coverage for the latest ' + keys.length + ' months.';
    }

    function formatMonthLabel(key) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIndex = parseInt(String(key).substring(5, 7), 10) - 1;
        const year = String(key).substring(2, 4);
        return (months[monthIndex] || '') + " '" + year;
    }

    /** Crosshair + tooltip so each month's exact value is readable on hover. */
    function attachLineHover(points, yTop, yBottom) {
        if (!lineChart || !points.length) {
            return;
        }
        const svgNs = 'http://www.w3.org/2000/svg';
        const crosshair = document.createElementNS(svgNs, 'line');
        crosshair.setAttribute('class', 'line-hover');
        crosshair.setAttribute('y1', yTop);
        crosshair.setAttribute('y2', yBottom);
        crosshair.style.opacity = '0';
        lineChart.appendChild(crosshair);

        let tooltip = document.getElementById('line-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'line-tooltip';
            tooltip.className = 'chart-tooltip';
            tooltip.setAttribute('role', 'status');
            lineChart.parentNode.appendChild(tooltip);
        }

        const hide = function () {
            crosshair.style.opacity = '0';
            tooltip.classList.remove('is-visible');
        };

        lineChart.onmousemove = function (event) {
            const box = lineChart.getBoundingClientRect();
            // Map cursor position into the SVG's 600-wide viewBox
            const svgX = ((event.clientX - box.left) / box.width) * 600;
            let nearest = points[0];
            points.forEach(function (p) {
                if (Math.abs(p.x - svgX) < Math.abs(nearest.x - svgX)) {
                    nearest = p;
                }
            });

            crosshair.setAttribute('x1', nearest.x);
            crosshair.setAttribute('x2', nearest.x);
            crosshair.style.opacity = '1';

            tooltip.innerHTML = '<span class="tt-label">' + escapeHtml(nearest.label) + '</span>' +
                '<span class="tt-value">' + Math.round(nearest.value) + '% coverage</span>';
            tooltip.classList.add('is-visible');
            const left = (nearest.x / 600) * box.width;
            const top = (nearest.y / 220) * box.height;
            tooltip.style.left = left + 'px';
            tooltip.style.top = Math.max(0, top - 12) + 'px';
        };
        lineChart.onmouseleave = hide;
    }

    function buildMiniBarsHtml(classDistribution) {
        if (!classDistribution || Object.keys(classDistribution).length === 0) {
            return '<div style="color: #999; font-size: 12px;">No data</div>';
        }

        const classOrder = CLASS_ORDER;
        const classColors = CLASS_COLORS;

        let html = '<div class="mini-bars-container">';
        classOrder.forEach(function (className) {
            const data = classDistribution[className];
            if (data && data.percentage > 0) {
                const color = classColors[className];
                const percentage = data.percentage;
                html += '<div class="mini-bar-segment" style="background: ' + color + '; flex: ' + percentage + ';" data-tooltip="' + escapeHtml(className) + ': ' + percentage + '%"></div>';
            }
        });
        html += '</div>';
        return html;
    }

    function renderFindings(filtered) {
        const latest = filtered.filter(function (row) {
            return row.coverage !== null;
        }).slice().sort(function (a, b) {
            return parseDate(b.date) - parseDate(a.date);
        }).slice(0, 6);

        findingsBody.innerHTML = '';

        if (!latest.length) {
            findingsBody.innerHTML = '<tr><td colspan="7">No findings available for the selected filters.</td></tr>';
            return;
        }

        latest.forEach(function (row) {
            const coverageLabel = formatCoverage(row.coverage);
            const tr = document.createElement('tr');
            
            const miniBarsHtml = buildMiniBarsHtml(row.classDistribution);
            
            tr.innerHTML = '<td>' + escapeHtml(row.area) + '</td>' +
                '<td class="surveyors-cell">' + formatSurveyorChips(row.surveyors) + '</td>' +
                '<td>' + row.date + '</td>' +
                '<td>' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '</td>' +
                '<td><span class="class-badge class-' + row.classCode.toLowerCase() + '">Class ' + row.classCode + '</span></td>' +
                '<td>' + miniBarsHtml + '</td>' +
                '<td><button class="btn btn-outline" type="button">View Details</button></td>';

            tr.querySelector('button').addEventListener('click', function () {
                window.alert(
                    'Area: ' + row.area + '\n' +
                    'Surveyors: ' + formatSurveyorText(row.surveyors) + '\n' +
                    'Date: ' + row.date + '\n' +
                    'Coverage: ' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '\n' +
                    'Class: ' + row.classCode + ' - ' + describeCoverageClass(row.classCode)
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
        renderEcosystemDonut(filtered);
        renderStackedBarChart(filtered);
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
