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

test('a map popup with 100% OS renders a compact full-width bar and its label', () => {
    const context = visualizationContext('map_view.js');
    const svg = vm.runInContext('Object.create(CoralSenseMap.prototype).createCompositionChart({"Other Substrate":100})', context);
    assert.match(svg, /width:100%/);
    assert.doesNotMatch(svg, /<svg|<circle/);
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
        publicMarkers: new Map(),
        publicSurveyLocations: vm.runInContext('publicSurveyLocations', visualizationContext('public_dashboard.js')),
        document: {getElementById() { return null; }},
        map: { fitBounds(value) { bounds.push(value); }, getSize() { return {y: 500}; } },
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

test('analysis map selects the latest visible survey per coordinate with deterministic ties', () => {
    const context = visualizationContext('analysis_results.js');
    const select = vm.runInContext('latestAnalysisSurveys', context);
    const rows = [
        {id: 1, latitude: 7, longitude: 125, survey_date: '2026-10-01'},
        {id: 2, latitude: 7, longitude: 125, survey_date: '2026-11-01', created_at: '2026-11-02'},
        {id: 3, latitude: 7, longitude: 125, survey_date: '2026-11-01', created_at: '2026-11-03'},
        {id: 4, latitude: 7, longitude: 125, survey_date: '2026-11-01', created_at: '2026-11-03'},
        {id: 5, latitude: 7, longitude: 125, survey_date: '2026-12-01', is_map_visible: false},
        {id: 6, latitude: 0, longitude: 0, survey_date: '2026-10-02'},
        {id: 7, latitude: null, longitude: 125, survey_date: '2026-12-01'},
    ];
    assert.deepEqual(Array.from(select(rows), row => row.id), [4, 6]);
    assert.deepEqual(Array.from(select([...rows].reverse()), row => row.id), [4, 6]);
    assert.deepEqual(Array.from(select(rows.filter(row => row.survey_date <= '2026-10-31')), row => row.id), [6, 1]);
    assert.equal(rows.length, 7);
});

test('analysis bubbles encode HCC category and size and keep missing analysis neutral', () => {
    const context = visualizationContext('analysis_results.js');
    const rows = [
        {id: 1, latitude: 7, longitude: 125, survey_date: '2026-11-01', name: '<img onerror=bad>', area_name: 'Area', avg_coverage: 100, coverage_class: 'A'},
        {id: 2, latitude: 8, longitude: 125, survey_date: '2026-11-01', name: 'Zero', avg_coverage: 0, coverage_class: 'D'},
        {id: 3, latitude: 9, longitude: 125, survey_date: '2026-11-01', name: 'Awaiting review', avg_coverage: 0, coverage_class: 'Pending'},
    ];
    const markers = [], bounds = [];
    const map = {setView() {return this;}, fitBounds(value) {bounds.push(value);}};
    const L = {
        map() {return map;}, tileLayer() {return {addTo() {}};}, latLngBounds: points => points,
        circleMarker(coordinates, options) {
            const marker = {coordinates, options, bindPopup(popup) {this.popup = popup;return this;}, addTo() {markers.push(this);return this;}};
            return marker;
        },
    };
    context.L = L;
    context.window.L = L;
    context.document.getElementById = id => id === 'analysisMap' ? {}
        : id === 'analysis-batch-data' ? {textContent: JSON.stringify(rows)} : null;
    context.document.createElement = () => ({children: [], appendChild(node) {this.children.push(node);}});
    vm.runInContext('initializeAnalysisResults()', context);
    assert.deepEqual(markers.map(marker => marker.options.fillColor), ['#2a8793', '#d64545', '#1e8e5a']);
    assert.deepEqual(markers.map(marker => marker.options.radius), [7, 8, 24]);
    const hardCoral = markers.find(marker => marker.options.fillColor === '#1e8e5a');
    assert.equal(hardCoral.popup.children[0].textContent, '<img onerror=bad>');
    assert.equal(hardCoral.popup.innerHTML, undefined);
    assert.match(markers[0].popup.children[3].textContent, /No analysis available/);
    assert.equal(bounds[0].length, 3);
});

test('public and researcher maps select the same newest survey at overlapping coordinates', () => {
    const publicContext = visualizationContext('public_dashboard.js');
    const publicLocations = vm.runInContext('publicSurveyLocations', publicContext);
    const researcher = vm.runInContext('Object.create(CoralSenseMap.prototype)', visualizationContext('map_view.js'));
    const rows = [
        {id: 1, lat: 7, lng: 125, date: '2026-10-01', createdAt: '2026-11-04'},
        {id: 2, lat: 7, lng: 125, date: '2026-11-01', createdAt: '2026-11-02'},
        {id: 3, lat: 7, lng: 125, date: '2026-11-01', createdAt: '2026-11-03'},
        {id: 4, lat: 7, lng: 125, date: '2026-11-01', createdAt: '2026-11-03', coverage: null},
        {id: 5, lat: 7.1, lng: 125, date: '2026-10-01'},
        {id: 6, lat: 7, lng: 125, date: '2026-12-01', mapVisible: false},
        {id: 7, lat: null, lng: 125, date: '2026-12-01'},
    ];
    for (const end of ['', '2026-10-31']) {
        const filtered = rows.filter(row => !end || row.date <= end);
        const publicIds = Array.from(publicLocations(filtered), row => row.id);
        const researcherIds = Array.from(researcher.latestSurveysByLocation(filtered
            .filter(row => row.mapVisible !== false && Number.isFinite(row.lat) && Number.isFinite(row.lng))
            .map(row => ({...row, latitude: row.lat, longitude: row.lng, surveyDate: row.date}))), row => row.id);
        assert.deepEqual(publicIds, researcherIds);
        assert.deepEqual(publicIds, end ? [1, 5] : [4, 5]);
    }
});

test('public map popups escape survey text and preserve missing analysis as a neutral marker', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../static/js/public_dashboard.js'), 'utf8');
    const start = source.indexOf('    function renderMarkers(filtered)');
    const end = source.indexOf('    function renderSummary', start);
    const helperContext = visualizationContext('public_dashboard.js');
    const calls = [];
    const render = vm.runInNewContext(`${source.slice(start, end)}\nrenderMarkers;`, {
        markerLayer: {clearLayers() {}, addLayer() {}}, publicMarkers: new Map(),
        publicSurveyLocations: vm.runInContext('publicSurveyLocations', helperContext),
        document: {getElementById() {return null;}},
        map: {fitBounds() {}, getSize() {return {y: 500};}},
        L: {latLngBounds: rows => rows, circleMarker(coordinates, options) {
            return {bindPopup(html) {calls.push({options, html});}};
        }},
        formatCoverage: value => value == null ? '--' : String(value),
        escapeHtml: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
        formatSurveyorText: String, colorForClass: () => '#2a8793', buildClassDistributionHtml: () => '',
    });
    render([{id: 1, lat: 7, lng: 125, coverage: null, area: '<img>', surveyors: '<script>', date: '2026-11-01'}]);
    assert.equal(calls[0].options.radius, 7);
    assert.equal(calls[0].options.fillColor, '#2a8793');
    assert.match(calls[0].html, /No analysis available/);
    assert.doesNotMatch(calls[0].html, /<img>|<script>|Category D/);
    assert.match(calls[0].html, /&lt;script&gt;/);
});
