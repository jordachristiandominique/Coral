/**
 * Map View - Interactive survey location mapping
 * Uses Leaflet.js for mapping and marker clustering
 */

class CoralSenseMap {
    constructor() {
        this.map = null;
        this.markerClusterGroup = null;
        this.heatmapLayer = null;
        this.markers = new Map(); // Store markers by batch ID
        this.allBatches = [];
        this.filteredBatches = [];
        this.currentHeatmapType = 'none'; // none, hard, soft, total
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
                coverageClass: props.coverageClass,
                classBreakdown: props.classBreakdown || {},
                dominantCoralType: props.dominantCoralType || 'mixed',
                hardCoralPct: props.hardCoralPct || 0,
                softCoralPct: props.softCoralPct || 0
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
            icon: this.createBatchIcon(batch),
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

    createBatchIcon(batch) {
        return L.icon({
            iconUrl: this.getMarkerIconUrl(batch),
            iconSize: [32, 40],
            iconAnchor: [16, 40],
            popupAnchor: [0, -40]
        });
    }

    getMarkerIconUrl(batch) {
        // Color by dominant coral type
        let fillColor = '#1c5f6d'; // default mixed
        if (batch.dominantCoralType === 'hard') {
            fillColor = '#d4a574'; // Hard coral - tan/brown
        } else if (batch.dominantCoralType === 'soft') {
            fillColor = '#e85d75'; // Soft coral - pink/red
        }

        return 'data:image/svg+xml;utf8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="24" height="32">
                <path d="M12 0C6.48 0 2 4.48 2 10c0 8 10 22 10 22s10-14 10-22c0-5.52-4.48-10-10-10z" 
                    fill="%23${fillColor.slice(1)}" stroke="%23ffffff" stroke-width="1"/>
                <circle cx="12" cy="10" r="3" fill="%23ffffff"/>
            </svg>
        `);
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

        // SVG donut chart
        const radius = 45;
        const centerX = 50;
        const centerY = 50;
        const innerRadius = 30;

        let svg = `<svg viewBox="0 0 100 100" width="140" height="140" style="margin: 8px auto; display: block;">`;
        
        let currentAngle = -90; // Start from top

        data.forEach(([cls, pct], idx) => {
            const sliceAngle = (pct / 100) * 360;
            const startAngle = currentAngle * Math.PI / 180;
            const endAngle = (currentAngle + sliceAngle) * Math.PI / 180;

            // Calculate points for donut slice
            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);
            const x3 = centerX + innerRadius * Math.cos(endAngle);
            const y3 = centerY + innerRadius * Math.sin(endAngle);
            const x4 = centerX + innerRadius * Math.cos(startAngle);
            const y4 = centerY + innerRadius * Math.sin(startAngle);

            const largeArc = sliceAngle > 180 ? 1 : 0;

            // Draw donut slice
            const pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`;
            
            svg += `<path d="${pathData}" fill="${colors[cls]}" stroke="white" stroke-width="0.5" style="opacity: 0.85;"/>`;

            currentAngle += sliceAngle;
        });

        // Add center circle for donut effect
        svg += `<circle cx="${centerX}" cy="${centerY}" r="${innerRadius - 2}" fill="white"/>`;
        svg += `</svg>`;

        // Legend with color dots
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

        // Build donut chart visualization
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
        const coralTypeSelect = document.getElementById('filter-coral-type');
        const heatmapSelect = document.getElementById('filter-heatmap');
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
        if (coralTypeSelect) coralTypeSelect.addEventListener('change', () => this.applyFilters());
        
        // Heatmap visualization
        if (heatmapSelect) {
            heatmapSelect.addEventListener('change', (e) => {
                this.updateHeatmap(e.target.value);
            });
        }
    }

    applyFilters() {
        const searchText = document.getElementById('filter-search').value.toLowerCase();
        const dateStart = document.getElementById('filter-date-start').value;
        const dateEnd = document.getElementById('filter-date-end').value;
        const coverageClass = document.getElementById('filter-coverage').value;
        const coralType = document.getElementById('filter-coral-type').value;

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

            // Coral type filter
            if (coralType && batch.dominantCoralType !== coralType) return false;

            return true;
        });

        this.updateMapVisibility();
        this.updateHeatmap(this.currentHeatmapType); // Update heatmap with filtered data
        this.renderSurveyList(this.filteredBatches);
        this.updateStats();
    }

    clearFilters() {
        document.getElementById('filter-search').value = '';
        document.getElementById('filter-date-start').value = '';
        document.getElementById('filter-date-end').value = '';
        document.getElementById('filter-coverage').value = '';
        document.getElementById('filter-coral-type').value = '';
        document.getElementById('filter-heatmap').value = 'none';

        this.filteredBatches = [...this.allBatches];
        this.updateMapVisibility();
        this.updateHeatmap('none');
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

    updateHeatmap(heatmapType) {
        // Remove existing heatmap layer
        if (this.heatmapLayer) {
            this.map.removeLayer(this.heatmapLayer);
            this.heatmapLayer = null;
        }

        this.currentHeatmapType = heatmapType;

        // Hide markers when heatmap is active, show them otherwise
        if (heatmapType === 'none') {
            this.markerClusterGroup.addTo(this.map);
            return; // No heatmap
        } else {
            this.map.removeLayer(this.markerClusterGroup);
        }

        // Generate heatmap data points
        const heatmapData = this.generateHeatmapData(heatmapType);

        if (heatmapData.length === 0) {
            return;
        }

        // Create canvas-based heatmap using Leaflet gradient circles
        this.heatmapLayer = L.layerGroup();

        const batches = this.filteredBatches.length > 0 ? this.filteredBatches : this.allBatches;
        batches.forEach(batch => {
            let intensity = 0;
            let color = '#999999';

            if (heatmapType === 'hard') {
                intensity = batch.hardCoralPct || 0;
                color = this.getColorForIntensity(intensity, 'hard');
            } else if (heatmapType === 'soft') {
                intensity = batch.softCoralPct || 0;
                color = this.getColorForIntensity(intensity, 'soft');
            } else if (heatmapType === 'total') {
                intensity = (batch.hardCoralPct || 0) + (batch.softCoralPct || 0);
                color = this.getColorForIntensity(intensity, 'total');
            }

            if (intensity > 0) {
                // Create a circle marker sized by intensity
                const circle = L.circleMarker([batch.latitude, batch.longitude], {
                    radius: Math.max(8, intensity / 3), // Larger circles for higher intensity
                    fillColor: color,
                    color: 'white',
                    weight: 1,
                    opacity: 0.7,
                    fillOpacity: 0.6
                });

                // Add tooltip
                circle.bindTooltip(`${batch.name}<br>${intensity.toFixed(1)}%`, {
                    permanent: false,
                    direction: 'top'
                });

                this.heatmapLayer.addLayer(circle);
            }
        });

        this.heatmapLayer.addTo(this.map);
    }

    generateHeatmapData(heatmapType) {
        /**
         * Generate heatmap data points based on type
         * Returns array of [lat, lng, intensity] tuples
         */
        const batches = this.filteredBatches.length > 0 ? this.filteredBatches : this.allBatches;
        const data = [];

        batches.forEach(batch => {
            let intensity = 0;

            if (heatmapType === 'hard') {
                intensity = batch.hardCoralPct || 0;
            } else if (heatmapType === 'soft') {
                intensity = batch.softCoralPct || 0;
            } else if (heatmapType === 'total') {
                intensity = (batch.hardCoralPct || 0) + (batch.softCoralPct || 0);
            }

            if (intensity > 0) {
                data.push([batch.latitude, batch.longitude, intensity / 100]); // Normalize 0-1
            }
        });

        return data;
    }

    getColorForIntensity(value, type) {
        /**
         * Get color for intensity value
         * Different color schemes for hard, soft, and total coral
         */
        if (type === 'hard') {
            // Hard Coral: Tan to Dark Brown
            if (value >= 60) return '#8B4513'; // Dark brown
            if (value >= 45) return '#A0522D'; // Sienna
            if (value >= 30) return '#CD853F'; // Peru
            if (value >= 15) return '#D2B48C'; // Tan
            return '#F5DEB3'; // Wheat (low)
        } else if (type === 'soft') {
            // Soft Coral: Light Pink to Deep Red
            if (value >= 60) return '#8B0000'; // Dark red
            if (value >= 45) return '#DC143C'; // Crimson
            if (value >= 30) return '#FF69B4'; // Hot pink
            if (value >= 15) return '#FFB6C1'; // Light pink
            return '#FFE4E1'; // Misty rose (low)
        } else if (type === 'total') {
            // Total Coral: Green (healthy) to Red (degraded)
            if (value >= 70) return '#228B22'; // Forest green
            if (value >= 55) return '#32CD32'; // Lime green
            if (value >= 40) return '#FFD700'; // Gold
            if (value >= 25) return '#FFA500'; // Orange
            return '#FF6347'; // Tomato (low/degraded)
        }
        return '#999999';
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
