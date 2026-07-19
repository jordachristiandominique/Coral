/**
 * Map View - Spatial visualization of coral survey sites
 * Uses Leaflet.js. Survey sites are drawn as proportional-symbol bubbles:
 *   - circle SIZE  = coral coverage %
 *   - circle COLOR = reef health class (A / B / C / Pending)
 * on a satellite basemap focused on the Davao Gulf.
 */

// Davao Gulf default view
const DAVAO_GULF_CENTER = [6.85, 125.65];
const DAVAO_GULF_ZOOM = 10;

// Reef-health class colors (match coverage badges in map_view.css)
const CLASS_COLORS = {
    A: '#2e8b57',       // healthy   (>= 60%)
    B: '#d9a441',       // moderate  (40-59%)
    C: '#c95a5a',       // poor      (< 40%)
    Pending: '#2a8793', // not analyzed
};

class CoralSenseMap {
    constructor() {
        this.map = null;
        this.markerLayer = null;      // L.featureGroup holding all site bubbles
        this.markers = new Map();     // batch ID -> circleMarker
        this.allBatches = [];
        this.filteredBatches = [];
        this.init();
    }

    init() {
        this.initMap();

        if (window.mapData && window.mapData.features) {
            this.loadBatches(window.mapData.features);
        }

        this.setupEventListeners();
        this.renderSummary(this.allBatches);
    }

    initMap() {
        // Center on the Davao Gulf
        this.map = L.map('leaflet-map', { zoomControl: false })
            .setView(DAVAO_GULF_CENTER, DAVAO_GULF_ZOOM);

        // ---- Base layers (choose one) ----
        const satellite = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
                maxZoom: 19,
                className: 'map-tiles'
            }
        );
        // Ocean basemap shows bathymetry (water depth) — useful marine context
        const ocean = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
            { attribution: 'Tiles &copy; Esri &mdash; Sources: GEBCO, NOAA, and other contributors', maxZoom: 13 }
        );
        const street = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }
        );

        satellite.addTo(this.map); // default base

        // ---- Overlay layers (toggle on/off) ----
        // Place-name reference labels that sit on top of any base map
        const placeLabels = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            { maxZoom: 19, opacity: 0.9 }
        ).addTo(this.map);

        // Layer that holds the survey-site bubbles
        this.markerLayer = L.featureGroup().addTo(this.map);

        // ---- Layer control (the "layers" panel) ----
        L.control.layers(
            { 'Satellite': satellite, 'Ocean (depth)': ocean, 'Street': street },
            { 'Survey Sites': this.markerLayer, 'Place Labels': placeLabels },
            { position: 'topleft', collapsed: true }
        ).addTo(this.map);

        this.setupMapControls();
        this.addLegend();
    }

    setupMapControls() {
        const zoomInBtn = document.getElementById('zoom-in-btn');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const resetBtn = document.getElementById('reset-map-btn');

        if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.map.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.map.zoomOut());
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetMapView());
    }

    resetMapView() {
        if (this.allBatches.length === 0) {
            this.map.setView(DAVAO_GULF_CENTER, DAVAO_GULF_ZOOM);
            return;
        }
        const bounds = L.latLngBounds();
        this.allBatches.forEach(batch => bounds.extend([batch.latitude, batch.longitude]));
        this.map.fitBounds(bounds, { padding: [80, 80], maxZoom: 13 });
    }

    /** Legend explaining the color (health class) and size (coverage) encodings. */
    addLegend() {
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'map-legend');
            div.innerHTML = `
                <div class="map-legend-title">Reef Health Class</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.A}"></span> Class A &mdash; Healthy (&ge;60%)</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.B}"></span> Class B &mdash; Moderate (40&ndash;59%)</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.C}"></span> Class C &mdash; Poor (&lt;40%)</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.Pending}"></span> Pending analysis</div>
                <div class="map-legend-title" style="margin-top:8px;">Circle size = coverage %</div>
                <div class="map-legend-sizes">
                    <span class="map-legend-size"><span class="map-legend-bubble" style="width:14px;height:14px;"></span>low</span>
                    <span class="map-legend-size"><span class="map-legend-bubble" style="width:26px;height:26px;"></span>high</span>
                </div>
            `;
            // Keep map interactions (drag/zoom) from firing while using the legend
            L.DomEvent.disableClickPropagation(div);
            return div;
        };
        legend.addTo(this.map);
    }

    loadBatches(features) {
        features.forEach(feature => {
            const props = feature.properties;
            const coords = feature.geometry.coordinates;

            const batch = {
                id: props.id,
                name: props.name,
                area: props.area,
                latitude: coords[1],
                longitude: coords[0],
                surveyDate: props.surveyDate,
                uploadedBy: props.uploadedBy,
                surveyors: props.surveyors,
                imageCount: props.imageCount,
                coverage: props.coverage,
                coverageClass: props.coverageClass,
                classBreakdown: props.classBreakdown || {}
            };

            this.allBatches.push(batch);
            this.addMarker(batch);
        });

        this.filteredBatches = [...this.allBatches];
        this.updateStats();

        if (this.allBatches.length > 0) {
            setTimeout(() => this.resetMapView(), 100);
        }
    }

    /** Radius (px) proportional to coverage %. Pending sites get a small fixed dot. */
    getRadius(batch) {
        if (batch.coverage === null || batch.coverage === undefined) return 7;
        return 8 + (Math.max(0, Math.min(100, batch.coverage)) / 100) * 16; // 8 - 24 px
    }

    getClassColor(coverageClass) {
        return CLASS_COLORS[coverageClass] || CLASS_COLORS.Pending;
    }

    addMarker(batch) {
        const marker = L.circleMarker([batch.latitude, batch.longitude], {
            radius: this.getRadius(batch),
            fillColor: this.getClassColor(batch.coverageClass),
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        });

        marker.bindPopup(this.createPopupContent(batch), {
            maxWidth: 280,
            className: 'batch-popup'
        });

        marker.on('click', () => this.highlightSurvey(batch.id));

        this.markerLayer.addLayer(marker);
        this.markers.set(batch.id, marker);
    }

    createDonutChart(breakdown) {
        /**
         * Creates an SVG donut chart from class breakdown percentages
         * Shows the distribution of all 7 classes with colors and labels
         */
        const colors = {
            'Hard Coral': '#d4a574',
            'Soft Coral': '#e85d75',
            'Macroalgae': '#f5d76e',
            'Halimeda': '#7ec8c8',
            'Algae Assemblage': '#a8d5a8',
            'Abiotic': '#b0b0b0',
            'Other Biota': '#d8a5d5'
        };

        // Prepare data - only show classes with > 0.5%
        const data = Object.entries(breakdown)
            .filter(([cls, pct]) => pct > 0.5)
            .sort((a, b) => b[1] - a[1]);

        if (data.length === 0) {
            return '<div style="text-align: center; color: #999; font-size: 11px;">No data available</div>';
        }

        const radius = 45;
        const centerX = 50;
        const centerY = 50;
        const innerRadius = 30;

        let svg = `<svg viewBox="0 0 100 100" width="140" height="140" style="margin: 8px auto; display: block;">`;
        let currentAngle = -90; // Start from top

        data.forEach(([cls, pct]) => {
            const sliceAngle = (pct / 100) * 360;
            const startAngle = currentAngle * Math.PI / 180;
            const endAngle = (currentAngle + sliceAngle) * Math.PI / 180;

            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);
            const x3 = centerX + innerRadius * Math.cos(endAngle);
            const y3 = centerY + innerRadius * Math.sin(endAngle);
            const x4 = centerX + innerRadius * Math.cos(startAngle);
            const y4 = centerY + innerRadius * Math.sin(startAngle);

            const largeArc = sliceAngle > 180 ? 1 : 0;

            const pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
            svg += `<path d="${pathData}" fill="${colors[cls]}" stroke="white" stroke-width="0.5" style="opacity: 0.85;"/>`;

            currentAngle += sliceAngle;
        });

        svg += `<circle cx="${centerX}" cy="${centerY}" r="${innerRadius - 2}" fill="white"/>`;
        svg += `</svg>`;

        let legend = '<div style="margin-top: 8px; font-size: 10px; line-height: 1.4;">';
        data.forEach(([cls, pct]) => {
            const colorDot = `<span style="display: inline-block; width: 8px; height: 8px; background: ${colors[cls]}; border-radius: 2px; margin-right: 4px; vertical-align: middle;"></span>`;
            legend += `<div style="margin: 2px 0;">${colorDot} ${cls}: <strong>${pct.toFixed(1)}%</strong></div>`;
        });
        legend += '</div>';

        return svg + legend;
    }

    createPopupContent(batch) {
        const coverageHtml = batch.coverage !== null
            ? `<div class="popup-item">
                <span class="popup-label">Coverage:</span>
                <span class="popup-value">${batch.coverage.toFixed(1)}%
                    <span class="coverage-badge class-${batch.coverageClass.toLowerCase()}">
                        Class ${batch.coverageClass}
                    </span>
                </span>
            </div>`
            : `<div class="popup-item">
                <span class="popup-label">Coverage:</span>
                <span class="coverage-badge pending">Pending Analysis</span>
            </div>`;

        const breakdown = batch.classBreakdown || {};
        const donutChartHtml = Object.entries(breakdown).length > 0
            ? `<div class="popup-breakdown" style="margin-top: 8px; border-top: 1px solid #e0e0e0; padding-top: 8px;">
                <div style="font-weight: 600; font-size: 12px; color: #333; margin-bottom: 4px; text-align: center;">Class Distribution</div>
                ${this.createDonutChart(breakdown)}
            </div>`
            : '';

        return `
            <div class="popup-content">
                <div class="popup-header">
                    <span>${this.escapeHtml(batch.name)}</span>
                </div>
                <div class="popup-item">
                    <span class="popup-label">Area:</span>
                    <span class="popup-value">${this.escapeHtml(batch.area)}</span>
                </div>
                <div class="popup-item">
                    <span class="popup-label">Date:</span>
                    <span class="popup-value">${new Date(batch.surveyDate).toLocaleDateString()}</span>
                </div>
                <div class="popup-item">
                    <span class="popup-label">Images:</span>
                    <span class="popup-value">${batch.imageCount}</span>
                </div>
                <div class="popup-item">
                    <span class="popup-label">Uploaded by:</span>
                    <span class="popup-value">${this.escapeHtml(batch.uploadedBy || 'N/A')}</span>
                </div>
                <div class="popup-item">
                    <span class="popup-label">Surveyors:</span>
                    <span class="popup-value">${this.escapeHtml(batch.surveyors || 'N/A')}</span>
                </div>
                ${coverageHtml}
                ${donutChartHtml}
                <div class="popup-item" style="margin-top: 10px;">
                    <a href="/accounts/researcher/batches/${batch.id}/"
                        style="color: #2a8793; font-weight: 600; text-decoration: none;">
                        View Full Details &rarr;
                    </a>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        const searchInput = document.getElementById('filter-search');
        const dateStartInput = document.getElementById('filter-date-start');
        const dateEndInput = document.getElementById('filter-date-end');
        const coverageSelect = document.getElementById('filter-coverage');
        const clearBtn = document.getElementById('filter-clear-btn');

        if (searchInput) searchInput.addEventListener('input', () => this.applyFilters());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearFilters());
        if (dateStartInput) dateStartInput.addEventListener('change', () => this.applyFilters());
        if (dateEndInput) dateEndInput.addEventListener('change', () => this.applyFilters());
        if (coverageSelect) coverageSelect.addEventListener('change', () => this.applyFilters());
    }

    applyFilters() {
        const searchText = document.getElementById('filter-search').value.toLowerCase();
        const dateStart = document.getElementById('filter-date-start').value;
        const dateEnd = document.getElementById('filter-date-end').value;
        const coverageClass = document.getElementById('filter-coverage').value;

        this.filteredBatches = this.allBatches.filter(batch => {
            if (searchText && !batch.name.toLowerCase().includes(searchText) &&
                !batch.area.toLowerCase().includes(searchText)) {
                return false;
            }
            if (dateStart && batch.surveyDate < dateStart) return false;
            if (dateEnd && batch.surveyDate > dateEnd) return false;
            if (coverageClass && batch.coverageClass !== coverageClass) return false;
            return true;
        });

        this.updateMapVisibility();
        this.renderSummary(this.filteredBatches);
        this.updateStats();
    }

    clearFilters() {
        document.getElementById('filter-search').value = '';
        document.getElementById('filter-date-start').value = '';
        document.getElementById('filter-date-end').value = '';
        document.getElementById('filter-coverage').value = '';

        this.filteredBatches = [...this.allBatches];
        this.updateMapVisibility();
        this.renderSurveyList(this.filteredBatches);
        this.updateStats();
    }

    updateMapVisibility() {
        const visibleIds = new Set(this.filteredBatches.map(b => b.id));
        this.markers.forEach((marker, batchId) => {
            if (visibleIds.has(batchId)) {
                this.markerLayer.addLayer(marker);
            } else {
                this.markerLayer.removeLayer(marker);
            }
        });
    }

    updateStats() {
        const visibleCount = document.getElementById('visible-count');
        if (visibleCount) visibleCount.textContent = this.filteredBatches.length;
    }

    /** Populate the Spatial Summary panel from the (filtered) set of sites. */
    renderSummary(batches) {
        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        const total = batches.length;
        const counts = { A: 0, B: 0, C: 0, Pending: 0 };
        let coverageSum = 0, coverageN = 0;

        batches.forEach(b => {
            const cls = ['A', 'B', 'C'].includes(b.coverageClass) ? b.coverageClass : 'Pending';
            counts[cls]++;
            if (b.coverage !== null && b.coverage !== undefined) {
                coverageSum += b.coverage;
                coverageN++;
            }
        });

        const avg = coverageN > 0 ? coverageSum / coverageN : null;
        setText('summary-sites', total);
        setText('summary-avg', avg !== null ? avg.toFixed(1) + '%' : '—');

        // Stacked distribution bar
        const bar = document.getElementById('summary-bar');
        if (bar) {
            if (total === 0) {
                bar.innerHTML = '<div class="summary-bar-empty">No sites match the current filters.</div>';
            } else {
                bar.innerHTML = ['A', 'B', 'C', 'Pending'].map(cls => {
                    if (counts[cls] === 0) return '';
                    const pct = (counts[cls] / total) * 100;
                    return `<div class="summary-bar-seg" style="width:${pct}%;background:${CLASS_COLORS[cls]}"
                                title="Class ${cls}: ${counts[cls]} site(s)"></div>`;
                }).join('');
            }
        }

        // Per-class counts legend
        const legend = document.getElementById('summary-legend');
        if (legend) {
            const labels = { A: 'Class A · Healthy', B: 'Class B · Moderate', C: 'Class C · Poor', Pending: 'Pending' };
            legend.innerHTML = ['A', 'B', 'C', 'Pending'].map(cls => `
                <div class="summary-legend-row">
                    <span class="summary-legend-dot" style="background:${CLASS_COLORS[cls]}"></span>
                    <span class="summary-legend-label">${labels[cls]}</span>
                    <span class="summary-legend-count">${counts[cls]}</span>
                </div>
            `).join('');
        }

        // Healthiest / needs-attention highlights (analyzed sites only)
        const extremes = document.getElementById('summary-extremes');
        if (extremes) {
            const analyzed = batches.filter(b => b.coverage !== null && b.coverage !== undefined);
            if (analyzed.length === 0) {
                extremes.innerHTML = '';
            } else {
                const best = analyzed.reduce((a, b) => (b.coverage > a.coverage ? b : a));
                const worst = analyzed.reduce((a, b) => (b.coverage < a.coverage ? b : a));
                extremes.innerHTML = `
                    <div class="summary-extreme" onclick="mapInstance.highlightSurvey(${best.id})">
                        <span class="summary-extreme-tag good">Healthiest</span>
                        <span class="summary-extreme-name">${this.escapeHtml(best.name)}</span>
                        <span class="summary-extreme-val">${best.coverage.toFixed(1)}%</span>
                    </div>
                    <div class="summary-extreme" onclick="mapInstance.highlightSurvey(${worst.id})">
                        <span class="summary-extreme-tag bad">Needs attention</span>
                        <span class="summary-extreme-name">${this.escapeHtml(worst.name)}</span>
                        <span class="summary-extreme-val">${worst.coverage.toFixed(1)}%</span>
                    </div>
                `;
            }
        }
    }

    highlightSurvey(batchId) {
        const marker = this.markers.get(batchId);
        if (marker) {
            const batch = this.allBatches.find(b => b.id === batchId);
            this.map.setView([batch.latitude, batch.longitude], 15, {
                animate: true,
                duration: 0.5
            });
            marker.openPopup();
        }
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

// Initialize map when DOM is ready
let mapInstance;

const initializeMapView = () => {
    mapInstance = new CoralSenseMap();
    if (window.lucide) {
        window.lucide.createIcons();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMapView);
} else {
    initializeMapView();
}
