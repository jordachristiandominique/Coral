const PRIMARY_CLASSES = ['Hard Coral', 'Soft Coral', 'Other Substrate'];
const CLASS_COLORS = {
    'Hard Coral': '#a44cff', 'Soft Coral': '#2a8793', 'Other Substrate': '#d9a321',
    'Macroalgae': '#e87ba4', 'Halimeda': '#eda100', 'Algae Assemblage': '#1baf7a',
    'Abiotic': '#eb6834', 'Other Biota': '#4a3aa7'
};
// HCC category colors match the researcher map and always accompany a label.
const STATUS_COLORS = { A: '#1e8e5a', B: '#f2c11f', C: '#e8820c', D: '#d64545' };
function publicSurveyLocations(rows) {
    const locations = new Map();
    [...rows].filter(row => row.mapVisible !== false && Number.isFinite(row.lat) && Number.isFinite(row.lng))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '')
            || (b.createdAt || '').localeCompare(a.createdAt || '') || (b.id || 0) - (a.id || 0))
        .forEach(row => {
            const key = `${row.lat},${row.lng}`;
            if (!locations.has(key)) locations.set(key, row);
        });
    return [...locations.values()];
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
    const detailsDialog = document.getElementById('public-survey-details');
    const locationButton = document.getElementById('survey-details-map');
    const publicMarkers = new Map();
    let detailSurvey = null;

    const map = window.L ? L.map('public-survey-map', {
        zoomControl: true, scrollWheelZoom: false
    }).setView([6.85, 125.65], 10) : null;
    const markerLayer = map ? L.layerGroup().addTo(map) : null;
    if (map) {
        const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19, attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        }).addTo(map);
        const ocean = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 13, attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, and other contributors'
        });
        const street = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19, attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
        });
        const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19, opacity: 0.9
        }).addTo(map);
        L.control.layers({Satellite: satellite, 'Ocean (depth)': ocean, Street: street},
            {'Survey Sites': markerLayer, 'Place Labels': labels}, {position: 'topright'}).addTo(map);
    }

    function colorForClass(classCode) {
        if (classCode === 'A') return STATUS_COLORS.A;
        if (classCode === 'B') return STATUS_COLORS.B;
        if (classCode === 'C') return STATUS_COLORS.C;
        if (classCode === 'D') return STATUS_COLORS.D;
        return '#2a8793';
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
        return Number(value).toFixed(1);
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

        let html = '<div class="public-composition"><strong>Benthic Substrate Composition</strong>';

        const classOrder = CLASS_ORDER;
        const classColors = CLASS_COLORS;

        const recorded = classOrder.filter(className => Number(classDistribution[className]?.percentage) > 0);
        html += '<div class="public-composition-bar" aria-hidden="true">' + recorded.map(className =>
            '<span style="flex:' + Number(classDistribution[className].percentage) + ';background:' + (classColors[className] || '#7a8d96') + '"></span>'
        ).join('') + '</div>';
        recorded.forEach(function (className) {
            const data = classDistribution[className];
            if (data && data.percentage > 0) {
                const color = classColors[className] || '#ccc';
                html += '<div class="public-composition-row"><span class="public-composition-dot" style="background:' + color + '"></span>' +
                    '<span>' + escapeHtml(className) + '</span><strong>' + Number(data.percentage).toFixed(1) + '%</strong></div>';
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
        publicMarkers.clear();

        const mapped = publicSurveyLocations(filtered);
        mapped.forEach(function (row) {
            const coverageLabel = formatCoverage(row.coverage);
            const marker = L.circleMarker([row.lat, row.lng], {
                radius: row.coverage == null ? 7 : 8 + Math.max(0, Math.min(100, row.coverage)) / 100 * 16,
                color: '#ffffff',
                weight: 2,
                fillColor: colorForClass(row.classCode),
                fillOpacity: 0.8
            });

            const popupHtml = 
                '<div class="public-map-popup"><h3>' + escapeHtml(row.name || row.area) + '</h3>' +
                '<dl><div><dt>Area</dt><dd>' + escapeHtml(row.area) + '</dd></div>' +
                '<div><dt>Survey by</dt><dd>' + escapeHtml(formatSurveyorText(row.surveyors)) + '</dd></div>' +
                '<div><dt>Date</dt><dd>' + escapeHtml(row.date) + '</dd></div>' +
                '<div><dt>Transects</dt><dd>' + (Number(row.transectCount) || 0) + '</dd></div>' +
                '<div><dt>HCC</dt><dd>' + (coverageLabel === '--' ? 'No analysis available' : coverageLabel + '% · Category ' + escapeHtml(row.classCode)) +
                '</dd></div></dl>' + buildClassDistributionHtml(row.classDistribution) + '</div>';

            marker.bindPopup(popupHtml, {maxWidth: 280, maxHeight: Math.max(160, map.getSize().y - 80)});

            markerLayer.addLayer(marker);
            publicMarkers.set(row.id, marker);
        });
        const count = document.getElementById('public-map-count');
        if (count) count.textContent = mapped.length + (mapped.length === 1 ? ' location shown.' : ' locations shown.');

        if (mapped.length) {
            const bounds = L.latLngBounds(mapped.map(function (item) {
                return [item.lat, item.lng];
            }));
            map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
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

        statSurveys.textContent = String(filtered.length);
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
        legendA.textContent = aCount + (aCount === 1 ? ' survey' : ' surveys');
        legendB.textContent = bCount + (bCount === 1 ? ' survey' : ' surveys');
        legendC.textContent = cCount + (cCount === 1 ? ' survey' : ' surveys');
        if (legendD) legendD.textContent = dCount + (dCount === 1 ? ' survey' : ' surveys');
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
                '<td><button class="public-details-button" type="button" aria-haspopup="dialog">View details <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button></td>';

            tr.querySelector('button').addEventListener('click', function () {
                detailSurvey = row;
                document.getElementById('survey-details-title').textContent = row.name || row.area;
                document.getElementById('survey-details-area').textContent = row.area;
                document.getElementById('survey-details-date').textContent = row.date;
                document.getElementById('survey-details-surveyors').textContent = formatSurveyorText(row.surveyors);
                document.getElementById('survey-details-transects').textContent = row.transectCount ?? 0;
                document.getElementById('survey-details-hcc').textContent = coverageLabel + '%';
                const badge = document.getElementById('survey-details-category');
                badge.textContent = 'Category ' + row.classCode;
                badge.className = 'class-badge class-' + row.classCode.toLowerCase();
                document.getElementById('survey-details-composition').innerHTML = buildClassDistributionHtml(row.classDistribution);
                locationButton.hidden = !map || !publicSurveyLocations([row]).length;
                detailsDialog.showModal();
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
        renderFindings(filtered);
    }

    [classFilter, startDateInput, endDateInput].forEach(function (el) {
        el.addEventListener('change', renderAll);
    });

    document.getElementById('clear-filters').addEventListener('click', function () {
        classFilter.value = 'ALL';
        startDateInput.value = '';
        endDateInput.value = '';
        renderAll();
    });
    document.getElementById('close-survey-details').addEventListener('click', () => detailsDialog.close());
    detailsDialog.addEventListener('click', event => {
        const rect = detailsDialog.getBoundingClientRect();
        if (event.target === detailsDialog && (event.clientX < rect.left || event.clientX > rect.right
            || event.clientY < rect.top || event.clientY > rect.bottom)) detailsDialog.close();
    });
    locationButton.addEventListener('click', function () {
        const current = publicSurveyLocations(applyFilters()).find(row => row.lat === detailSurvey.lat && row.lng === detailSurvey.lng);
        if (!current || !map) return;
        detailsDialog.close();
        document.getElementById('public-survey-map').scrollIntoView({block: 'center'});
        if (!map.hasLayer(markerLayer)) map.addLayer(markerLayer);
        map.setView([current.lat, current.lng], 15);
        publicMarkers.get(current.id)?.openPopup();
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
