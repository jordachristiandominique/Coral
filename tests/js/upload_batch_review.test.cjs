const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../static/js/upload_batch_analysis.js');
const E = require('../../static/js/upload_batch_review.js');
function sample() {
    return A.fromResponse({ success: true, schema_version: 1,
        model: { id: 'yolov8s-v4-3x', sha256: 'a'.repeat(64), dataset_version: 4 },
        image: { width: 4000, height: 3000 }, warnings: [],
        detections: [{ id: 'large', class_name: 'Hard Coral', confidence: .8, box: { x: .1, y: .1, w: .5, h: .5 } },
            { id: 'small', class_name: 'Soft Coral', confidence: .7, box: { x: .2, y: .2, w: .1, h: .1 } }],
        quadrat: null });
}
test('hand selection prioritizes smaller coral boxes before the quadrat, with selected-box context priority', () => {
    const r = sample(); A.setQuadrat(r, { x: 0, y: 0, w: 1, h: 1 });
    assert.equal(E.hit(r, { x: .25, y: .25 }), 'small');
    E.ensure(r).selected = 'large';
    assert.equal(E.hit(r, { x: .25, y: .25 }, true), 'large');
    assert.equal(E.hit(r, { x: .9, y: .9 }), 'quadrat');
});
test('drawing, selecting, changing class and deleting boxes supports undo and redo', () => {
    const r = sample();
    E.add(r, { x: .6, y: .6, w: .1, h: .1 }, 'Hard Coral');
    const id = E.ensure(r).selected;
    assert.equal(E.label(r, id), 'HC 2');
    E.rename(r, 'Soft Coral'); assert.equal(E.label(r, id), 'SC 2');
    E.remove(r); assert(!r.detections.some(d => d.id === id));
    E.undo(r); assert(r.detections.some(d => d.id === id));
    E.undo(r); assert.equal(E.label(r, id), 'HC 2');
    E.redo(r); assert.equal(E.label(r, id), 'SC 2');
});
test('one pointer gesture records one history entry, new edits clear redo, histories are per image', () => {
    const r = sample(), other = sample(); E.ensure(r).selected = 'large';
    const before = E.snapshot(r);
    for (let i = 1; i < 5; i++) E.setBox(r, 'large', { x: i / 10, y: .1, w: .5, h: .5 });
    E.commit(r, before); assert.equal(r.editor.undo.length, 1);
    E.undo(r); assert.equal(E.selected(r).x, .1);
    E.add(r, { x: .8, y: .8, w: .1, h: .1 }, 'Soft Coral');
    assert.equal(r.editor.redo.length, 0);
    assert.equal(E.ensure(other).undo.length, 0);
});
test('box corrections invalidate approval without changing sampling point classes or HCC math', () => {
    const r = sample(); A.setQuadrat(r, { x: 0, y: 0, w: 1, h: 1 });
    r.quadrat_confirmed = true; r.points.forEach((p, i) => p.class = i < 5 ? 'Hard Coral' : 'Soft Coral'); r.reviewed = true;
    E.ensure(r).selected = 'large'; E.change(r, () => E.setBox(r, 'large', { x: .2, y: .2, w: .4, h: .4 }));
    assert.equal(r.reviewed, false); assert.equal(A.coverage(r), 50);
    E.undo(r); assert.equal(r.reviewed, false); assert.equal(A.coverage(r), 50);
});
test('quadrat edits clear point classes; deleting it requires redrawing, and undo restores geometry', () => {
    const r = sample(); A.setQuadrat(r, { x: .1, y: .1, w: .8, h: .8 }); E.ensure(r).selected = 'quadrat';
    r.points[0].class = 'Hard Coral';
    E.change(r, () => E.setBox(r, 'quadrat', { x: .2, y: .2, w: .6, h: .6 }));
    assert(r.points.every(p => p.class === ''));
    E.remove(r); assert.equal(r.quadrat_bbox, null); assert.equal(r.points.length, 0);
    E.undo(r); assert.equal(r.quadrat_bbox.x, .2); assert.equal(r.points.length, 10);
});
test('marker movement clamps to quadrat and clears only its classification; undo restores prior coordinates', () => {
    const r = sample(); A.setQuadrat(r, { x: .1, y: .1, w: .8, h: .8 });
    r.points[0].class = 'Hard Coral'; r.points[1].class = 'Soft Coral';
    E.change(r, () => E.marker(r, 0, { x: 2, y: -1 }));
    assert.deepEqual(r.points[0], { x: 1, y: 0, class: '' });
    assert.equal(r.points[1].class, 'Soft Coral');
    E.undo(r); assert.equal(r.points[0].class, 'Hard Coral'); assert.equal(r.points[0].x, .1);
});
test('square locking and corner resizing use image pixels and stay inside non-square images', () => {
    const image = { width: 4000, height: 3000 };
    const b = E.square({ x: .8, y: .8, w: .2, h: .2 }, image);
    assert(A.validRect(b)); assert(Math.abs(b.w * image.width - b.h * image.height) < 1e-8);
    for (const h of ['nw', 'ne', 'sw', 'se']) {
        const resized = E.resize(b, h, -.8, .8, image, true);
        assert(A.validRect(resized)); assert(Math.abs(resized.w * image.width - resized.h * image.height) < 1e-8);
    }
    const r = sample(); r.quadrat_bbox = { x: 0, y: 0, w: .5, h: .5 };
    assert.equal(E.isSquare(r), false); r.quadrat_bbox = b; assert.equal(E.isSquare(r), true);
});
test('image-edge moves and resizes retain positive boxes; canceled gestures restore original approval', () => {
    const r = sample(); E.ensure(r).selected = 'large'; r.reviewed = true;
    const before = E.snapshot(r);
    E.setBox(r, 'large', E.move(E.selected(r), 2, -2));
    assert(A.validRect(E.selected(r))); assert.equal(E.selected(r).x, .5);
    E.restore(r, before, false); assert.equal(r.reviewed, true); assert.equal(E.selected(r).x, .1);
});
test('saved review contains accepted edited boxes and model reference, with no box-area calculations', () => {
    const r = sample(); A.setQuadrat(r, { x: 0, y: 0, w: 1, h: 1 });
    E.add(r, { x: .7, y: .7, w: .1, h: .1 }, 'Hard Coral');
    r.quadrat_confirmed = true; r.points.forEach(p => p.class = 'Soft Coral'); r.reviewed = true;
    const p = A.payload(r);
    assert.equal(p.analysis.boxes.length, 3);
    assert.equal(p.analysis.boxes.at(-1).source, 'manual');
    assert.equal(p.analysis.model.id, 'yolov8s-v4-3x');
    assert.equal(A.coverage(r), 0);
    assert(!JSON.stringify(p.analysis).includes('area_percent'));
});
