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
