const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function visualizationContext(filename, data) {
    const context = vm.createContext({
        window: {}, console,
        document: {
            readyState: 'loading', addEventListener() {},
            getElementById(id) {
                return id === 'batchPointClassesData' && data ? {textContent: JSON.stringify(data)} : null;
            }
        }
    });
    const source = fs.readFileSync(path.join(__dirname, '../../static/js', filename), 'utf8');
    vm.runInContext(source, context);
    return context;
}

test('repository graphs count OS in their full saved-marker denominator', () => {
    const context = visualizationContext('batch_visualization.js', {image1:['HC', 'SC', 'OS', 'Other Substrate']});
    const distribution = context.collectClassDistribution();
    assert.equal(distribution['Hard Coral'], 1);
    assert.equal(distribution['Soft Coral'], 1);
    assert.equal(distribution['Other Substrate'], 2);
    assert.equal(Object.values(distribution).reduce((sum, count) => sum + count, 0), 4);
});

test('repository graphs remain empty without stored classes', () => {
    const context = visualizationContext('batch_visualization.js');
    assert.equal(Object.values(context.collectClassDistribution()).reduce((sum, count) => sum + count, 0), 0);
});

test('a map popup with 100% OS renders a complete ring and its label', () => {
    const context = visualizationContext('map_view.js');
    const svg = vm.runInContext('CoralSenseMap.prototype.createDonutChart.call({}, {"Other Substrate":100})', context);
    assert.match(svg, /r="37.5"/);
    assert.match(svg, /#d9a321/);
    assert.match(svg, /Other Substrate/);
    assert.match(svg, /100.0%/);
});

test('repository map links focus the selected marker after startup, with safe overview fallback', () => {
    for (const search of ['?site=1', '?site=2', '', '?site=999', '?site=invalid']) {
        const context = visualizationContext('map_view.js');
        const timers = [], views = [], opened = [];
        context.window.location = { search };
        context.URLSearchParams = URLSearchParams;
        context.setTimeout = callback => timers.push(callback);
        const map = vm.runInContext('Object.create(CoralSenseMap.prototype)', context);
        map.allBatches = [];
        map.markers = new Map();
        map.markerLayer = { addLayer() {}, removeLayer() {} };
        map.map = { setView(coordinates, zoom) { views.push({ coordinates, zoom }); } };
        map.addMarker = batch => map.markers.set(batch.id, { openPopup() { opened.push(batch.id); } });
        map.updateStats = () => {};
        let overviewCalls = 0;
        map.resetMapView = () => { overviewCalls++; };
        // An older repository link opens the latest displayed survey at its location.
        map.loadBatches([1, 2].map(id => ({
            properties: { id, name: `Reef ${id}` },
            geometry: { coordinates: [125.7, 7.1] },
        })));
        assert.equal(timers.length, 1);
        timers[0]();
        if (search === '?site=1' || search === '?site=2') {
            assert.deepEqual(opened, [2]);
            assert.equal(views.length, 1);
            assert.deepEqual(Array.from(views[0].coordinates), [7.1, 125.7]);
            assert.equal(views[0].zoom, 15);
            assert.equal(overviewCalls, 0);
        } else {
            assert.deepEqual(opened, []);
            assert.equal(overviewCalls, 1);
        }
    }
});

test('surveyed-site map selects the newest survey date per location with deterministic same-day ties', () => {
    const context = visualizationContext('map_view.js');
    const map = vm.runInContext('Object.create(CoralSenseMap.prototype)', context);
    const batches = [
        { id: 1, latitude: 7.1, longitude: 125.7, surveyDate: '2026-10-01', createdAt: '2026-11-14T10:00:00Z' },
        { id: 2, latitude: 7.1, longitude: 125.7, surveyDate: '2026-11-01', createdAt: '2026-11-02T10:00:00Z' },
        { id: 3, latitude: 7.1, longitude: 125.7, surveyDate: '2026-11-01', createdAt: '2026-11-03T10:00:00Z' },
        { id: 4, latitude: 7.1, longitude: 125.7, surveyDate: '2026-11-01', createdAt: '2026-11-03T10:00:00Z' },
        { id: 5, latitude: 7.100001, longitude: 125.7, surveyDate: '2026-10-01' },
    ];
    for (const rows of [batches, [...batches].reverse()]) {
        assert.deepEqual(Array.from(map.latestSurveysByLocation(rows), batch => batch.id), [4, 5]);
    }
    assert.equal(batches.length, 5);
});

test('surveyed-site date filtering and clearing keep one displayed marker per location and update summaries', () => {
    const context = visualizationContext('map_view.js');
    const controls = {
        'filter-search': { value: '' }, 'filter-date-start': { value: '' },
        'filter-date-end': { value: '2026-10-31' }, 'filter-coverage': { value: '' },
        'visible-count': { textContent: '' },
    };
    context.document.getElementById = id => controls[id];
    const map = vm.runInContext('Object.create(CoralSenseMap.prototype)', context);
    map.allBatches = [
        { id: 1, name: 'Reef', area: 'Area', latitude: 7, longitude: 125, surveyDate: '2026-10-01' },
        { id: 2, name: 'Reef', area: 'Area', latitude: 7, longitude: 125, surveyDate: '2026-11-01' },
    ];
    const visible = new Set();
    map.markers = new Map([[1, 1], [2, 2]]);
    map.markerLayer = { addLayer(id) { visible.add(id); }, removeLayer(id) { visible.delete(id); } };
    let summary;
    map.renderSummary = rows => { summary = Array.from(rows, row => row.id); };
    map.applyFilters();
    assert.deepEqual([...visible], [1]);
    assert.deepEqual(summary, [1]);
    assert.equal(controls['visible-count'].textContent, 1);
    map.clearFilters();
    assert.deepEqual([...visible], [2]);
    assert.deepEqual(summary, [2]);
});

test('public map hides disabled surveys and fits bounds to visible markers, including older payloads', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../static/js/public_dashboard.js'), 'utf8');
    const start = source.indexOf('    function renderMarkers(filtered)');
    const end = source.indexOf('    function renderSummary', start);
    assert(start >= 0 && end > start);
    const markers = [], bounds = [];
    const render = vm.runInNewContext(`${source.slice(start, end)}\nrenderMarkers;`, {
        markerLayer: { clearLayers() { markers.length = 0; }, addLayer(marker) { markers.push(marker); } },
        map: { fitBounds(value) { bounds.push(value); } },
        L: {
            circleMarker(coordinates) { return { coordinates, bindPopup() {} }; },
            latLngBounds: coordinates => coordinates,
        },
        formatCoverage: String, colorForClass: () => '#1c5f6d', escapeHtml: String,
        formatSurveyorText: String, describeCoverageClass: String, buildClassDistributionHtml: () => '',
    });
    const row = { lat: 7, lng: 125, coverage: 50, classCode: 'A', area: 'Reef' };
    render([{ ...row, mapVisible: false }, { ...row, lat: 8 }, { ...row, lat: 9, mapVisible: true }]);
    assert.deepEqual(markers.map(marker => Array.from(marker.coordinates)), [[8, 125], [9, 125]]);
    assert.deepEqual(Array.from(bounds[0], coordinate => Array.from(coordinate)), [[8, 125], [9, 125]]);
    render([{ ...row, mapVisible: false }]);
    assert.equal(markers.length, 0);
    assert.equal(bounds.length, 1);
});
