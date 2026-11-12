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
    for (const search of ['?site=2', '', '?site=999', '?site=invalid']) {
        const context = visualizationContext('map_view.js');
        const timers = [], views = [], opened = [];
        context.window.location = { search };
        context.URLSearchParams = URLSearchParams;
        context.setTimeout = callback => timers.push(callback);
        const map = vm.runInContext('Object.create(CoralSenseMap.prototype)', context);
        map.allBatches = [];
        map.markers = new Map();
        map.map = { setView(coordinates, zoom) { views.push({ coordinates, zoom }); } };
        map.addMarker = batch => map.markers.set(batch.id, { openPopup() { opened.push(batch.id); } });
        map.updateStats = () => {};
        let overviewCalls = 0;
        map.resetMapView = () => { overviewCalls++; };
        // Co-located surveys must open the popup for the requested repository.
        map.loadBatches([1, 2].map(id => ({
            properties: { id, name: `Reef ${id}` },
            geometry: { coordinates: [125.7, 7.1] },
        })));
        assert.equal(timers.length, 1);
        timers[0]();
        if (search === '?site=2') {
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
