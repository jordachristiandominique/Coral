const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function repositories() {
    const controls = {};
    for (const id of ['batch-search', 'batch-date-filter', 'batch-class-filter', 'batch-clear-btn',
        'batch-date-from', 'batch-date-to', 'batch-filter-status']) {
        controls[id] = {
            value: '', hidden: true, listeners: {},
            addEventListener(event, callback) { this.listeners[event] = callback; },
            setCustomValidity(message) { this.validationMessage = message; },
            reportValidity() { this.reported = true; },
        };
    }
    const cards = [
        { dataset: { name: 'Reef Alpha', date: '2026-10-01', category: 'a' }, style: {} },
        { dataset: { name: 'Reef Beta', date: '2026-10-15', category: 'b' }, style: {} },
        { dataset: { name: 'Reef Gamma', date: '2026-10-31', category: 'a' }, style: {} },
    ];
    const sorted = [];
    const context = {
        window: {}, requestAnimationFrame(callback) { callback(); },
        document: {
            readyState: 'complete', body: { classList: { add() {} } },
            getElementById(id) { return controls[id]; },
            querySelectorAll(selector) { return selector === '.batch-card' ? cards : []; },
            querySelector() { return { appendChild(card) { sorted.push(card); } }; },
        },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../static/js/batches.js'), 'utf8'), context);
    function set(id, value, event = 'change') {
        controls[id].value = value;
        controls[id].listeners[event]();
    }
    return { controls, cards, sorted, set, visible: () => cards.filter(card => card.style.display !== 'none') };
}

test('repository survey date range includes both boundaries and supports either open bound', () => {
    const r = repositories();
    r.set('batch-date-from', '2026-10-15');
    assert.equal(r.visible().length, 2);
    r.set('batch-date-to', '2026-10-15');
    assert.deepEqual(r.visible().map(card => card.dataset.name), ['Reef Beta']);
    r.set('batch-date-from', '');
    assert.equal(r.visible().length, 2);
    r.set('batch-date-to', '');
    assert.equal(r.visible().length, 3);
});

test('date range combines with search, category and sorting and Clear resets all filters', () => {
    const r = repositories();
    r.set('batch-date-from', '2026-10-01');
    r.set('batch-date-to', '2026-10-31');
    r.set('batch-class-filter', 'A');
    r.set('batch-date-filter', 'latest');
    assert.equal(r.sorted.at(-2).dataset.name, 'Reef Gamma');
    assert.equal(r.sorted.at(-1).dataset.name, 'Reef Alpha');
    r.set('batch-search', 'gamma', 'input');
    assert.equal(r.visible().length, 1);
    r.set('batch-search', 'missing', 'input');
    assert.equal(r.controls['batch-filter-status'].hidden, false);
    r.controls['batch-clear-btn'].listeners.click();
    assert.equal(r.visible().length, 3);
    assert.equal(r.controls['batch-date-from'].value, '');
    assert.equal(r.controls['batch-date-to'].value, '');
    assert.equal(r.controls['batch-filter-status'].hidden, true);
});

test('reversed dates show validation feedback and recover when the range is corrected', () => {
    const r = repositories();
    r.set('batch-date-from', '2026-10-31');
    r.set('batch-date-to', '2026-10-01');
    assert.match(r.controls['batch-date-to'].validationMessage, /on or after/);
    assert.equal(r.controls['batch-date-to'].reported, true);
    r.set('batch-date-to', '2026-10-31');
    assert.equal(r.controls['batch-date-to'].validationMessage, '');
    assert.equal(r.visible().length, 1);
});
