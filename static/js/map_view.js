/**
 * Map View - Spatial visualization of coral survey sites
 * Uses Leaflet.js. Survey sites are drawn as proportional-symbol bubbles:
 *   - circle SIZE  = coral coverage %
 *   - circle COLOR = HCC category (A / B / C / D)
 * on a satellite basemap focused on the Davao Gulf.
 */

// Davao Gulf default view
const DAVAO_GULF_CENTER = [6.85, 125.65];
const DAVAO_GULF_ZOOM = 10;

// HCC category colors (match coverage badges in map_view.css)
const CLASS_COLORS = {
    A: '#1e8e5a',       // HCC more than 44%
    B: '#f2c11f',       // HCC more than 33% up to 44%
    C: '#e8820c',       // HCC more than 22% up to 33%
    D: '#d64545',       // HCC 0-22%
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
        this.renderSummary(this.filteredBatches);
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
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
            { attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>', maxZoom: 19 }
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
                <div class="map-legend-title">HCC Category</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.A}"></span> Category A &mdash; HCC &gt;44%</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.B}"></span> Category B &mdash; HCC &gt;33&ndash;44%</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.C}"></span> Category C &mdash; HCC &gt;22&ndash;33%</div>
                <div class="map-legend-row"><span class="map-legend-dot" style="background:${CLASS_COLORS.D}"></span> Category D &mdash; HCC 0&ndash;22%</div>
                <div class="map-legend-title" style="margin-top:8px;">Circle size = HCC %</div>
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

    latestSurveysByLocation(batches) {
        const newestFirst = [...batches].sort((a, b) =>
            (b.surveyDate || '').localeCompare(a.surveyDate || '')
            || (b.createdAt || '').localeCompare(a.createdAt || '')
            || b.id - a.id);
        const locations = new Map();
        newestFirst.forEach(batch => {
            const key = `${batch.latitude},${batch.longitude}`;
            if (!locations.has(key)) locations.set(key, batch);
        });
        return [...locations.values()];
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
                createdAt: props.createdAt,
                uploadedBy: props.uploadedBy,
                surveyors: props.surveyors,
                transectCount: props.transectCount,
                coverage: props.coverage,
                coverageClass: props.coverageClass,
                classBreakdown: props.classBreakdown || {}
            };

            this.allBatches.push(batch);
            this.addMarker(batch);
        });

        this.filteredBatches = this.latestSurveysByLocation(this.allBatches);
        this.updateMapVisibility();
        this.updateStats();

        if (this.allBatches.length > 0) {
            const selectedSiteId = Number(new URLSearchParams(window.location.search).get('site'));
            setTimeout(() => {
                if (this.markers.has(selectedSiteId)) {
                    this.highlightSurvey(selectedSiteId);
                } else {
                    this.resetMapView();
                }
            }, 100);
        }
    }

    /** Radius (px) proportional to coverage %, with a small dot for missing results. */
    getRadius(batch) {
        if (batch.coverage === null || batch.coverage === undefined) return 7;
        return 8 + (Math.max(0, Math.min(100, batch.coverage)) / 100) * 16; // 8 - 24 px
    }

    getClassColor(coverageClass) {
        return CLASS_COLORS[coverageClass] || '#2a8793';
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
            maxHeight: Math.max(160, this.map.getSize().y - 80),
            className: 'batch-popup'
        });

        marker.on('click', () => this.highlightSurvey(batch.id));

        this.markerLayer.addLayer(marker);
        this.markers.set(batch.id, marker);
    }

    createCompositionChart(breakdown) {
        /**
         * Creates a compact stacked bar with class percentages
         * Shows saved HC/SC/OS composition and recorded historical classes
         */
        const colors = {
            'Hard Coral': '#a44cff',
            'Soft Coral': '#2a8793',
            'Macroalgae': '#f5d76e',
            'Halimeda': '#7ec8c8',
            'Algae Assemblage': '#a8d5a8',
            'Abiotic': '#b0b0b0',
            'Other Biota': '#4a3aa7',
            'Other Substrate': '#d9a321'
        };

        // Show every recorded substrate with a positive percentage.
        const data = Object.entries(breakdown)
            .filter(([cls, pct]) => pct > 0)
            .sort((a, b) => b[1] - a[1]);

        if (data.length === 0) {
            return '<div style="text-align: center; color: #999; font-size: 11px;">No data available</div>';
        }

        const segments = data.map(([cls, pct]) =>
            `<span style="width:${pct}%;background:${colors[cls] || '#7a8d96'}"></span>`
        ).join('');
        const legend = data.map(([cls, pct]) => `
            <div class="popup-composition-row">
                <span class="popup-composition-dot" style="background:${colors[cls] || '#7a8d96'}"></span>
                <span>${this.escapeHtml(cls)}</span><strong>${pct.toFixed(1)}%</strong>
            </div>
        `).join('');
        return `<div class="popup-composition-bar" role="img" aria-label="Benthic substrate composition">${segments}</div>
            <div class="popup-composition-legend">${legend}</div>`;
    }

    createPopupContent(batch) {
        const coverageHtml = batch.coverage !== null
            ? `<div class="popup-item">
                <span class="popup-label">HCC:</span>
                <span class="popup-value">${batch.coverage.toFixed(1)}%
                    <span class="coverage-badge class-${batch.coverageClass.toLowerCase()}">
                        Category ${batch.coverageClass}
                    </span>
                </span>
            </div>`
            : `<div class="popup-item">
                <span class="popup-label">HCC:</span>
                <span class="popup-value">No analysis available</span>
            </div>`;

        const breakdown = batch.classBreakdown || {};
        const compositionHtml = Object.entries(breakdown).length > 0
            ? `<div class="popup-breakdown">
                <div class="popup-composition-title">Benthic Substrate Composition</div>
                ${this.createCompositionChart(breakdown)}
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
                    <span class="popup-label">Transects:</span>
                    <span class="popup-value">${batch.transectCount ?? 0}</span>
                </div>
                <div class="popup-item">
                    <span class="popup-label">Uploaded by:</span>
                    <span class="popup-value">${this.escapeHtml(batch.uploadedBy || 'N/A')}</span>
                </div>
                <div class="popup-item">
                    <span class="popup-label">Survey by:</span>
                    <span class="popup-value">${this.escapeHtml(batch.surveyors || 'N/A')}</span>
                </div>
                ${coverageHtml}
                ${compositionHtml}
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

        this.filteredBatches = this.latestSurveysByLocation(this.allBatches.filter(batch => {
            if (searchText && !batch.name.toLowerCase().includes(searchText) &&
                !batch.area.toLowerCase().includes(searchText)) {
                return false;
            }
            if (dateStart && batch.surveyDate < dateStart) return false;
            if (dateEnd && batch.surveyDate > dateEnd) return false;
            if (coverageClass && batch.coverageClass !== coverageClass) return false;
            return true;
        }));

        this.updateMapVisibility();
        this.renderSummary(this.filteredBatches);
        this.updateStats();
    }

    clearFilters() {
        document.getElementById('filter-search').value = '';
        document.getElementById('filter-date-start').value = '';
        document.getElementById('filter-date-end').value = '';
        document.getElementById('filter-coverage').value = '';

        this.filteredBatches = this.latestSurveysByLocation(this.allBatches);
        this.updateMapVisibility();
        this.renderSummary(this.filteredBatches);
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
        const counts = { A: 0, B: 0, C: 0, D: 0 };
        let coverageSum = 0, coverageN = 0;

        batches.forEach(b => {
            if (Object.hasOwn(counts, b.coverageClass)) counts[b.coverageClass]++;
            if (b.coverage !== null && b.coverage !== undefined) {
                coverageSum += b.coverage;
                coverageN++;
            }
        });

        const avg = coverageN > 0 ? coverageSum / coverageN : null;
        setText('summary-sites', total);
        setText('summary-avg', avg !== null ? avg.toFixed(1) + '%' : '—');

        const classifiedTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);

        // Stacked distribution bar
        const bar = document.getElementById('summary-bar');
        if (bar) {
            if (classifiedTotal === 0) {
                bar.innerHTML = '<div class="summary-bar-empty">No classified sites match the current filters.</div>';
            } else {
                bar.innerHTML = ['A', 'B', 'C', 'D'].map(cls => {
                    if (counts[cls] === 0) return '';
                    const pct = (counts[cls] / classifiedTotal) * 100;
                    return `<div class="summary-bar-seg" style="width:${pct}%;background:${CLASS_COLORS[cls]}"
                                title="Category ${cls}: ${counts[cls]} site(s)"></div>`;
                }).join('');
            }
        }

        // Per-class counts legend
        const legend = document.getElementById('summary-legend');
        if (legend) {
            const labels = { A: 'Category A (>44%)', B: 'Category B (>33-44%)', C: 'Category C (>22-33%)', D: 'Category D (0-22%)' };
            legend.innerHTML = ['A', 'B', 'C', 'D'].map(cls => `
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
        const requested = this.allBatches.find(batch => batch.id === batchId);
        const batch = requested && this.filteredBatches.find(candidate =>
            candidate.latitude === requested.latitude && candidate.longitude === requested.longitude);
        const marker = batch && this.markers.get(batch.id);
        if (marker) {
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
