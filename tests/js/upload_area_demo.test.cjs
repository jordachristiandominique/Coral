// Run with: node --test tests/js/upload_area_demo.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculate, category, transformRect, quadratDimensions, squareRect, resizeSquare } = require('../../examples/area-analysis/upload_area_demo.js');
const q = { x: .1, y: .1, w: .8, h: .8 };
const box = percent => ({ x: q.x, y: q.y, w: q.w * percent / 100, h: q.h });
const inside = (b, p) => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h;

test('square snapping and all locked corner resizes respect pixel aspect and image bounds', () => {
    for (const [w,h] of [[1200,800],[800,1200],[900,600]]) {
        const square = squareRect(q,w,h);
        assert(Math.abs(square.w*w-square.h*h)<1e-8);
        assert(square.x>=q.x && square.y>=q.y);
        for (const handle of ['nw','ne','sw','se']) {
            for (const delta of [-10,-.1,.1,10]) {
                const r = resizeSquare(square,handle,delta,delta,w,h);
                assert(Math.abs(r.w*w-r.h*h)<1e-8);
                assert(r.w>0 && r.h>0 && r.x>=-1e-12 && r.y>=-1e-12);
                assert(r.x+r.w<=1+1e-12 && r.y+r.h<=1+1e-12);
            }
        }
    }
});

test('square indicator uses image pixels rather than equal normalized percentages', () => {
    assert.equal(quadratDimensions({w:.8,h:.8}, 1200, 800).square, false);
    const square = quadratDimensions({w:.4,h:.6}, 1200, 800);
    assert.equal(square.width, 480); assert.equal(square.height, 480);
    assert.equal(square.ratio, 1); assert.equal(square.square, true);
    assert.equal(quadratDimensions({w:.401,h:.6}, 1200, 800).square, false);
});

test('53% and 54% each get five coral markers and retain raw coverage', () => {
    for (const percent of [53, 54]) {
        const r = calculate(q, [box(percent)]);
        assert.equal(r.percent, percent);
        assert.equal(r.hardCount, 5);
        assert.equal(r.points.filter(p => p.hard).length, 5);
        assert.equal(r.points.filter(p => !p.hard).length, 5);
    }
});

test('55% stays raw 55 with six coral markers, not 60%', () => {
    const r = calculate(q, [box(55)]);
    assert.equal(r.percent, 55); assert.equal(r.category, 'A');
    assert.equal(r.hardCount, 6); assert.equal(r.points.length, 10);
    assert.equal(r.points.filter(p => p.hard).length, 6);
});
test('overlapping boxes count once; geometry is clipped to quadrat', () => {
    assert.equal(calculate(q, [box(55), box(55)]).percent, 55);
    assert.equal(calculate(q, [{x:0,y:0,w:1,h:1}]).percent, 100);
    assert.equal(calculate(q, [{x:0,y:0,w:.05,h:.05}]).percent, 0);
    const r = calculate({x:0,y:0,w:1,h:1}, [{x:0,y:0,w:.6,h:1},{x:.4,y:0,w:.4,h:1}]);
    assert.equal(r.percent, 80);
});
test('all allocations total ten, remain in their matching area, and are deterministic', () => {
    for (let percent = 0; percent <= 100; percent += .5) {
        const boxes = percent ? [box(percent)] : [];
        const r = calculate(q, boxes);
        assert.equal(r.points.length, 10);
        assert.deepEqual(r.points, calculate(q, boxes).points);
        for (const p of r.points) {
            assert(inside(q, p)); assert.equal(boxes.some(b => inside(b, p)), p.hard);
        }
        assert.equal(new Set(r.points.map(p => p.x + ',' + p.y)).size, 10);
    }
});
test('small regions may have zero markers without losing raw area', () => {
    assert.equal(calculate(q, [box(4)]).hardCount, 0);
    assert.equal(calculate(q, [box(4)]).percent, 4);
    assert.equal(calculate(q, [box(96)]).hardCount, 10);
});
test('markers proportionally cover disjoint boxes and avoid overlapping allocations', () => {
    const boxes = [{x:.1,y:.1,w:.4,h:.8},{x:.6,y:.1,w:.2,h:.8}];
    const r = calculate(q, boxes);
    assert.equal(r.percent, 75); assert.equal(r.hardCount, 8);
    assert.equal(r.points.filter(p => p.hard && inside(boxes[0],p)).length, 5);
    assert.equal(r.points.filter(p => p.hard && inside(boxes[1],p)).length, 3);
});
test('categories use raw thresholds, not rounded marker allocation', () => {
    for (const [percent, expected] of [[0,'D'],[22,'D'],[22.1,'C'],[33,'C'],[33.1,'B'],[44,'B'],[44.1,'A']]) {
        assert.equal(category(percent), expected);
        assert.equal(calculate(q, percent ? [box(percent)] : []).category, expected);
    }
});

test('box moves stay in the image and corner resizes preserve positive dimensions', () => {
    const b = {x:.2,y:.3,w:.4,h:.5};
    assert.deepEqual(transformRect(b,'move',10,-10), {x:.6,y:0,w:.4,h:.5});
    const se = transformRect(b,'se',.2,.1);
    assert(Math.abs(se.w-.6)<1e-12 && Math.abs(se.h-.6)<1e-12);
    for (const handle of ['nw','ne','sw','se']) {
        for (const delta of [-10, 10]) {
            const r = transformRect(b,handle,delta,delta);
            assert(r.x>=0 && r.y>=0 && r.w>=.001-1e-12 && r.h>=.001-1e-12);
            assert(r.x+r.w<=1+1e-12 && r.y+r.h<=1+1e-12);
        }
    }
});

test('standalone review/edit lifecycle, per-image retention, and photograph clearing', () => {
    const vm = require('node:vm'), fs = require('node:fs');
    class Element {
        constructor() { this.children = []; this.listeners = {}; this.checked = true; this.dataset = {}; this.classList = { toggle() {} }; }
        append(...children) { this.children.push(...children); }
        replaceChildren() { this.children = []; }
        addEventListener(type, callback) { this.listeners[type] = callback; }
        querySelectorAll(selector) {
            if (selector === '[data-area-preset]') return [];
            const result = [];
            const visit = node => { if (node.tag === selector) result.push(node); node.children.forEach(visit); };
            this.children.forEach(visit); return result;
        }
        checkValidity() { return true; }
        scrollIntoView() {}
    }
    const nodes = new Map();
    const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
    const canvas = node('area-demo-canvas'); canvas.width = 900; canvas.height = 600;
    node('area-demo-lock-square').checked = false;
    canvas.style = {};
    canvas.getBoundingClientRect = () => ({left:0,top:0,width:900,height:600});
    canvas.setPointerCapture = () => {};
    canvas.getContext = () => new Proxy({}, { get: () => () => {} });
    const document = { readyState: 'complete', getElementById: node,
        createElement(tag) { const e = new Element(); e.tag = tag; return e; }, dispatchEvent() {} };
    const sandbox = { document, Event: class {}, Image: class {}, URL: { createObjectURL: () => 'blob:demo', revokeObjectURL() {} } };
    vm.runInNewContext(fs.readFileSync('examples/area-analysis/upload_area_demo.js', 'utf8'), sandbox);
    const controller = sandbox.CoralAreaDemo;
    const a = {name:'a.jpg'}, b = {name:'b.jpg'};
    controller.setFile(a);
    assert.equal(node('area-demo-coverage').textContent, '55.00%');
    // The explicit square action enables the lock and updates the indicator.
    node('area-demo-make-square').listeners.click();
    assert.equal(node('area-demo-lock-square').checked, true);
    assert.match(node('area-demo-square').textContent, /^Square:/);
    const qWidth = node('area-demo-editor').children[0].children[3].children[0];
    qWidth.valueAsNumber = 40; qWidth.listeners.change();
    assert.match(node('area-demo-square').textContent, /^Square:/);
    node('area-demo-lock-square').checked = false;
    node('area-demo-clear').listeners.click();
    controller.setFile(a);
    node('area-demo-target').value = 'box:0'; node('area-demo-target').listeners.change();
    assert.equal(node('area-demo-hcc-result').textContent, '60%');
    assert.equal(node('area-demo-hcc-computation').textContent, '6 Hard Coral points / 10 total points × 100 = 60%');
    // Raw 44% is Category B, but its four representative HC points produce 40%, also B.
    // Raw 24% is Category C, while two points produce 20% and must display Category D.
    let widthInput = node('area-demo-editor').children[1].children[3].children[0];
    widthInput.valueAsNumber = 19.2; widthInput.listeners.change();
    assert.equal(node('area-demo-coverage').textContent, '24.00%');
    assert.equal(node('area-demo-hcc-result').textContent, '20%');
    assert.equal(node('area-demo-category').textContent, 'Category D');
    // Restore 55% for the remaining lifecycle checks.
    widthInput = node('area-demo-editor').children[1].children[3].children[0];
    widthInput.valueAsNumber = 44; widthInput.listeners.change();
    node('area-demo-approve').listeners.click();
    assert.match(node('area-demo-status').textContent, /Demo reviewed/);
    for (const id of ['area-demo-fill-quadrat', 'area-demo-fill-boxes']) {
        node(id).checked = false; node(id).listeners.change();
        assert.equal(node('area-demo-coverage').textContent, '55.00%');
        assert.equal(node('area-demo-hcc-result').textContent, '60%');
        assert.match(node('area-demo-status').textContent, /Demo reviewed/);
        node(id).checked = true; node(id).listeners.change();
    }
    const width = node('area-demo-editor').children[1].children[3].children[0];
    width.valueAsNumber = 24; width.listeners.change();
    assert.equal(node('area-demo-coverage').textContent, '30.00%');
    assert.match(node('area-demo-status').textContent, /Needs review/);
    controller.setFile(b); assert.equal(node('area-demo-coverage').textContent, '55.00%');
    controller.setFile(a); assert.equal(node('area-demo-coverage').textContent, '30.00%');
    // Resize HC box from 24% to 40% of image width, with the opposite corner fixed.
    node('area-demo-approve').listeners.click();
    const pointer = (x,y) => ({clientX:x*900,clientY:y*600,pointerId:1,button:0,preventDefault(){}});
    canvas.listeners.pointerdown(pointer(.34,.9));
    canvas.listeners.pointermove(pointer(.5,.9));
    canvas.listeners.pointerup();
    assert.equal(node('area-demo-coverage').textContent, '50.00%');
    assert.match(node('area-demo-status').textContent, /Needs review/);
    // Moving the same fully enclosed box keeps its area and coverage unchanged.
    canvas.listeners.pointerdown(pointer(.3,.5));
    canvas.listeners.pointermove(pointer(.4,.5));
    canvas.listeners.pointerup();
    assert.equal(node('area-demo-coverage').textContent, '50.00%');
    assert.equal(node('area-demo-editor').children[1].children[1].children[0].value, '20.0');
    const picker = node('area-demo-files');
    picker.files = [{name:'test.jpg',type:'image/jpeg'}];
    picker.listeners.change();
    assert.equal(node('area-demo-photo').textContent, 'test.jpg');
    node('area-demo-clear').listeners.click();
    assert.equal(picker.value, '');
    assert.match(node('area-demo-photo').textContent, /No image selected/);
    assert.equal(node('area-demo-coverage').textContent, '55.00%');
});
