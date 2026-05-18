/**
 * Map View - Interactive survey location mapping
 * Uses Leaflet.js for mapping and marker clustering
 */

class CoralSenseMap {
    constructor() {
        this.map = null;
        this.markerClusterGroup = null;
        this.markers = new Map(); // Store markers by batch ID
        this.allBatches = [];
        this.filteredBatches = [];
        this.init();
    }

    init() {
        // Initialize map
        this.initMap();

        // Load GeoJSON data
        if (window.mapData && window.mapData.features) {
            this.loadBatches(window.mapData.features);
        }

        // Setup event listeners
        this.setupEventListeners();

        // Render initial survey list
        this.renderSurveyList(this.allBatches);
    }

    initMap() {
        // Create map centered on Philippines
        this.map = L.map('leaflet-map').setView([9.7604, 118.7437], 6);

        // Add tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            className: 'map-tiles'
        }).addTo(this.map);

        // Initialize marker cluster group
        this.markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 80,
            iconCreateFunction: this.createClusterIcon.bind(this),
            disableClusteringAtZoom: 17
        });
        this.map.addLayer(this.markerClusterGroup);

        // Map controls
        this.setupMapControls();
    }

    setupMapControls() {
        const zoomInBtn = document.getElementById('zoom-in-btn');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const resetBtn = document.getElementById('reset-map-btn');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => this.map.zoomIn());
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => this.map.zoomOut());
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetMapView());
        }
    }

    resetMapView() {
        if (this.allBatches.length === 0) {
            this.map.setView([9.7604, 118.7437], 6);
            return;
        }

        // Calculate bounds
        const bounds = L.latLngBounds();
        this.allBatches.forEach(batch => {
            bounds.extend([batch.latitude, batch.longitude]);
        });
        this.map.fitBounds(bounds, { padding: [100, 100] });
    }

    createClusterIcon(cluster) {
        const childCount = cluster.getChildCount();
        let className = 'marker-cluster';

        if (childCount < 10) className += ' marker-cluster-small';
        else if (childCount < 100) className += ' marker-cluster-medium';
        else className += ' marker-cluster-large';

        return new L.DivIcon({
            html: `<div><span>${childCount}</span></div>`,
            className: className,
            iconSize: new L.Point(40, 40)
        });
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
                coverageClass: props.coverageClass
            };

            this.allBatches.push(batch);
            this.addMarker(batch);
        });

        // Initial render of survey list
        this.filteredBatches = [...this.allBatches];
        this.updateStats();

        // Fit map bounds to all markers
        if (this.allBatches.length > 0) {
            setTimeout(() => this.resetMapView(), 100);
        }
    }

    addMarker(batch) {
        const marker = L.marker([batch.latitude, batch.longitude], {
            icon: this.createBatchIcon(),
            title: batch.name
        });

        const popupContent = this.createPopupContent(batch);
        marker.bindPopup(popupContent, {
            maxWidth: 280,
            className: 'batch-popup'
        });

        marker.on('click', () => {
            this.highlightSurvey(batch.id);
        });

        this.markerClusterGroup.addLayer(marker);
        this.markers.set(batch.id, marker);
    }

    createBatchIcon() {
        return L.icon({
            iconUrl: this.getMarkerIconUrl(),
            iconSize: [32, 40],
            iconAnchor: [16, 40],
            popupAnchor: [0, -40]
        });
    }

    getMarkerIconUrl() {
        // Create a simple colored marker using a data URL
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="24" height="32">
                <path d="M12 0C6.48 0 2 4.48 2 10c0 8 10 22 10 22s10-14 10-22c0-5.52-4.48-10-10-10z" 
                    fill="%231c5f6d" stroke="%23ffffff" stroke-width="1"/>
                <circle cx="12" cy="10" r="3" fill="%23ffffff"/>
            </svg>
        `);
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
                <div class="popup-item" style="margin-top: 10px;">
                    <a href="/accounts/researcher/batches/${batch.id}/" 
                        style="color: #2a8793; font-weight: 600; text-decoration: none;">
                        View Full Details →
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

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.applyFilters();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFilters());
        }

        // Allow filtering on input change
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
            // Search filter
            if (searchText && !batch.name.toLowerCase().includes(searchText) &&
                !batch.area.toLowerCase().includes(searchText)) {
                return false;
            }

            // Date range filter
            if (dateStart && batch.surveyDate < dateStart) return false;
            if (dateEnd && batch.surveyDate > dateEnd) return false;

            // Coverage class filter
            if (coverageClass && batch.coverageClass !== coverageClass) return false;

            return true;
        });

        this.updateMapVisibility();
        this.renderSurveyList(this.filteredBatches);
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
                this.markerClusterGroup.addLayer(marker);
            } else {
                this.markerClusterGroup.removeLayer(marker);
            }
        });
    }

    updateStats() {
        const visibleCount = document.getElementById('visible-count');
        if (visibleCount) {
            visibleCount.textContent = this.filteredBatches.length;
        }
    }

    renderSurveyList(batches) {
        const listContainer = document.getElementById('surveys-list');
        if (!listContainer) return;

        if (batches.length === 0) {
            listContainer.innerHTML = `
                <div class="surveys-empty">
                    <p>No surveys found matching your filters.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = batches.map(batch => `
            <div class="survey-item" data-batch-id="${batch.id}" onclick="mapInstance.highlightSurvey(${batch.id})">
                <span class="survey-name">${this.escapeHtml(batch.name)}</span>
                <div class="survey-meta">
                    <div class="survey-meta-item">
                        <img src="/static/icons/pin.png" alt="" class="survey-meta-icon" style="width: 20px; height: 20px;"> ${this.escapeHtml(batch.area)}
                    </div>
                    <div class="survey-meta-item">
                        <img src="/static/icons/camera-survey.png" alt="" class="survey-meta-icon" style="width: 18px; height: 18px;"> ${batch.imageCount} images
                    </div>
                    <div class="survey-meta-item">
                        <img src="/static/icons/calendar.png" alt="" class="survey-meta-icon" style="width: 18px; height: 18px;"> ${new Date(batch.surveyDate).toLocaleDateString()}
                    </div>
                </div>
                <div class="survey-coverage">
                    <span class="survey-coverage-text">
                        ${batch.coverage !== null
                ? `Coverage: <strong>${batch.coverage.toFixed(1)}%</strong>`
                : 'Coverage: Pending'
            }
                    </span>
                    <span class="survey-badge class-${batch.coverageClass.toLowerCase()}">
                        ${batch.coverageClass}
                    </span>
                </div>
            </div>
        `).join('');
    }

    highlightSurvey(batchId) {
        // Remove active state from all items
        document.querySelectorAll('.survey-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active state to selected item
        const selectedItem = document.querySelector(`[data-batch-id="${batchId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Pan and zoom to marker
        const marker = this.markers.get(batchId);
        if (marker) {
            const batch = this.allBatches.find(b => b.id === batchId);
            this.map.setView([batch.latitude, batch.longitude], 16, {
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

    // Initialize Lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMapView);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeMapView();
}
