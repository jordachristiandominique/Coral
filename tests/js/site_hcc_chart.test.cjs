const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function chartContext() {
    const charts = [];
    const Chart = function (canvas, config) { charts.push(config); };
    const context = vm.createContext({
        window: {Chart}, Chart,
        document: {createElement() {return {}; }},
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../static/js/site_hcc_chart.js'), 'utf8'), context);
    return {render: context.renderSiteHccChart, charts};
}

test('site HCC chart supports one repository and multiple analysis sites with SE and category colors', () => {
    const {render, charts} = chartContext();
    const rows = [
        {name: 'Reviewed reef', avg_coverage: 50, se: 50, coverage_class: 'A', n_transects: 2},
        {name: 'Second reef', avg_coverage: 30, se: 10, coverage_class: 'C', n_transects: 3},
    ];
    render({}, rows.slice(0, 1), 22.8);
    render({}, rows, 22.8);
    assert.equal(charts.length, 2);
    assert.deepEqual(Array.from(charts[0].data.datasets[0].data), [50]);
    assert.deepEqual(Array.from(charts[1].data.labels), ['Reviewed reef', 'Second reef']);
    assert.deepEqual(Array.from(charts[1].data.datasets[0].backgroundColor), ['#1e8e5a', '#e8820c']);
    assert(charts[0].options.scales.y.suggestedMax >= 100);
    assert.match(charts[0].options.plugins.tooltip.callbacks.label({dataIndex: 0}), /50.0%.*50.0 SE.*Category A.*2 transect/);
    assert.equal(charts[0].plugins.length, 1);
});

test('zero HCC produces a reviewed bar and missing HCC produces an empty state', () => {
    const {render, charts} = chartContext();
    const zero = {name: 'Zero reef', avg_coverage: 0, se: 0, coverage_class: 'D', n_transects: 1};
    render({}, [zero], 22.8);
    assert.deepEqual(Array.from(charts[0].data.datasets[0].data), [0]);
    assert.equal(charts[0].data.datasets[0].backgroundColor[0], '#d64545');
    const messages = [];
    const canvas = {after(message) {messages.push(message);}};
    render(canvas, [{name: 'Awaiting review', avg_coverage: null, coverage_class: null}], 22.8);
    assert.equal(charts.length, 1);
    assert.equal(canvas.hidden, true);
    assert.match(messages[0].textContent, /No reviewed site HCC/);
});
