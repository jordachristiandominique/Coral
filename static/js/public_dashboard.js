const PRIMARY_CLASSES = ['Hard Coral', 'Soft Coral', 'Other Substrate'];
const CLASS_COLORS = {
    'Hard Coral': '#a44cff', 'Soft Coral': '#2a8793', 'Other Substrate': '#d9a321',
    'Macroalgae': '#e87ba4', 'Halimeda': '#eda100', 'Algae Assemblage': '#1baf7a',
    'Abiotic': '#eb6834', 'Other Biota': '#4a3aa7'
};
// Reef health is a status scale, not a series — these are reserved colours
// and always ship alongside the "Class A/B/C" label, never colour alone.
const STATUS_COLORS = { A: '#1e8e5a', B: '#f2c11f', C: '#e8820c', D: '#d64545' };
const COVERAGE_CLASS_LABELS = {
    A: 'HCC more than 44%',
    B: 'HCC more than 33% up to 44%',
    C: 'HCC more than 22% up to 33%',
    D: 'HCC 0-22%'
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

    const recordedClasses = [...new Set(surveys.flatMap(row => Object.keys(row.classDistribution || {})))];
    const CLASS_ORDER = PRIMARY_CLASSES.concat(recordedClasses.filter(name => !PRIMARY_CLASSES.includes(name)));

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
    const legendD = document.getElementById('legend-d');
    const donut = document.getElementById('distribution-donut');
    const ecosystemDonut = document.getElementById('ecosystem-donut');
    const ecosystemLegend = document.getElementById('ecosystem-legend');
    const linePath = document.getElementById('line-path');
    const lineChart = document.getElementById('coverage-line-chart');
    const lineCaption = document.getElementById('line-caption');

    const map = window.L ? L.map('public-survey-map', {
        zoomControl: true, scrollWheelZoom: false
    }).setView([6.86, 125.86], 8) : null;
    const markerLayer = map ? L.layerGroup().addTo(map) : null;
    if (map) {
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19, attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
        }).addTo(map);
    }

    function colorForClass(classCode) {
        if (classCode === 'A') return STATUS_COLORS.A;
        if (classCode === 'B') return STATUS_COLORS.B;
        if (classCode === 'C') return STATUS_COLORS.C;
        return STATUS_COLORS.D;
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
        html += '<strong style="display: block; margin-bottom: 8px;">Reviewed Marker Composition</strong>';

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
        if (!markerLayer) return;
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
                'Survey by: ' + formatSurveyorText(row.surveyors) + '<br>' +
                'Date: ' + row.date + '<br>' +
                'HCC: ' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '<br>' +
                'Category: ' + row.classCode + ' - ' + describeCoverageClass(row.classCode) +
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
        statCoverage.textContent = total ? String(avg) + '%' : '--';
        statSites.textContent = String(sites);
        statClassA.textContent = total ? Math.round((classACount / total) * 100) + '%' : '--';
    }

    function renderDonut(filtered) {
        const valid = filtered.filter(function (row) {
            return row.coverage !== null && row.classCode;
        });
        const aCount = valid.filter(function (row) { return row.classCode === 'A'; }).length;
        const bCount = valid.filter(function (row) { return row.classCode === 'B'; }).length;
        const cCount = valid.filter(function (row) { return row.classCode === 'C'; }).length;
        const dCount = valid.filter(function (row) { return row.classCode === 'D'; }).length;
        const total = aCount + bCount + cCount + dCount;

        const aDeg = total ? (aCount / total) * 360 : 0;
        const bDeg = total ? (bCount / total) * 360 : 0;
        const cDeg = total ? (cCount / total) * 360 : 0;
        const dDeg = total ? (dCount / total) * 360 : 0;

        donut.style.background = 'conic-gradient(' +
            STATUS_COLORS.A + ' 0deg ' + aDeg.toFixed(1) + 'deg, ' +
            STATUS_COLORS.B + ' ' + aDeg.toFixed(1) + 'deg ' + (aDeg + bDeg).toFixed(1) + 'deg, ' +
            STATUS_COLORS.C + ' ' + (aDeg + bDeg).toFixed(1) + 'deg ' + (aDeg + bDeg + cDeg).toFixed(1) + 'deg, ' +
            STATUS_COLORS.D + ' ' + (aDeg + bDeg + cDeg).toFixed(1) + 'deg ' + (aDeg + bDeg + cDeg + dDeg).toFixed(1) + 'deg)';

        if (!total) donut.style.background = '#e5ecee';
        legendA.textContent = aCount + (aCount === 1 ? ' site' : ' sites');
        legendB.textContent = bCount + (bCount === 1 ? ' site' : ' sites');
        legendC.textContent = cCount + (cCount === 1 ? ' site' : ' sites');
        if (legendD) legendD.textContent = dCount + (dCount === 1 ? ' site' : ' sites');
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
            ecosystemLegend.innerHTML = '<div style="color: #999; font-size: 12px; grid-column: 1/-1;">No reviewed marker data available</div>';
            return;
        }

        // Calculate percentages and degrees
        let conicGradientParts = [];
        let currentDeg = 0;

        classOrder.forEach(function (cls) {
            const count = totalCounts[cls];
            const percentage = Number((count / grandTotal * 100).toFixed(1));
            const degrees = (count / grandTotal) * 360;
            
            if (count > 0) {
                const color = classColors[cls] || '#7a8d96';
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
            const percentage = grandTotal ? Number((count / grandTotal * 100).toFixed(1)) : 0;
            
            if (count > 0) {
                const color = classColors[cls] || '#7a8d96';
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
            Array.from(lineChart.querySelectorAll('.line-point, .line-area, .line-tick, .line-tick-label, .line-x-label, .line-hover')).forEach(function (point) {
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
                const color = classColors[className] || '#7a8d96';
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
                '<td><span class="class-badge class-' + row.classCode.toLowerCase() + '">Category ' + row.classCode + '</span></td>' +
                '<td>' + miniBarsHtml + '</td>' +
                '<td><button class="btn btn-outline" type="button">View Details</button></td>';

            tr.querySelector('button').addEventListener('click', function () {
                window.alert(
                    'Area: ' + row.area + '\n' +
                    'Survey by: ' + formatSurveyorText(row.surveyors) + '\n' +
                    'Date: ' + row.date + '\n' +
                    'HCC: ' + coverageLabel + (coverageLabel === '--' ? '' : '%') + '\n' +
                    'Category: ' + row.classCode + ' - ' + describeCoverageClass(row.classCode)
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
