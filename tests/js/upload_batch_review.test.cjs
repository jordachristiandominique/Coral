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

test('hidden coral portions outside the quadrat cannot be selected', () => {
    const r = sample();
    A.setQuadrat(r, { x: .3, y: .3, w: .5, h: .5 });
    E.ensure(r).selected = 'large';
    assert.equal(E.hit(r, { x: .15, y: .15 }), null);
    assert.equal(E.hit(r, { x: .15, y: .15 }, true), null);
    assert.equal(E.hit(r, { x: .4, y: .4 }), 'large');
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
test('box corrections regenerate representative counts and undo restores their prior allocation', () => {
    const r = sample(); A.setQuadrat(r, { x: 0, y: 0, w: 1, h: 1 });
    r.quadrat_confirmed = true; r.reviewed = true;
    E.ensure(r).selected = 'large'; E.change(r, () => E.setBox(r, 'large', { x: .2, y: .2, w: .4, h: .4 }));
    assert.equal(r.reviewed, false); assert.equal(A.coverage(r), 20);
    E.undo(r); assert.equal(r.reviewed, false); assert.equal(A.coverage(r), 30);
});

test('coral class changes update markers, HCC, saved labels and reversible manual provenance', () => {
    const r = sample();
    A.setQuadrat(r, { x: 0, y: 0, w: 1, h: 1 });
    E.ensure(r).selected = 'large';
    assert.equal(A.coverage(r), 30);
    E.rename(r, 'Soft Coral');
    assert.equal(A.coverage(r), 0);
    assert.equal(r.points.length, 10);
    assert(r.points.some(point => point.class === 'Soft Coral'));
    const changed = r.detections.find(box => box.id === 'large');
    assert.equal(changed.class_id, 1);
    assert.equal(changed.source, 'manual');
    assert.equal(A.payload(r).analysis.boxes[0].class_name, 'Soft Coral');
    E.undo(r);
    assert.equal(A.coverage(r), 30);
    assert.equal(r.detections[0].class_name, 'Hard Coral');
    assert.equal(r.detections[0].source, undefined);
    E.redo(r);
    assert.equal(A.coverage(r), 0);
    E.rename(r, 'Hard Coral');
    assert.equal(r.detections[0].class_id, 0);
    assert.equal(A.coverage(r), 30);
});

test('unchanged classes, invalid classes and quadrat selection do not create class edits', () => {
    const r = sample();
    A.setQuadrat(r, { x: 0, y: 0, w: 1, h: 1 });
    E.ensure(r).selected = 'large';
    E.rename(r, 'Hard Coral');
    E.rename(r, 'Other Substrate');
    r.editor.selected = 'quadrat';
    E.rename(r, 'Soft Coral');
    assert.equal(r.editor.undo.length, 0);
    assert.equal(r.detections[0].class_name, 'Hard Coral');
});
test('quadrat edits regenerate representatives; deleting and undo restore their geometry', () => {
    const r = sample(); A.setQuadrat(r, { x: .1, y: .1, w: .8, h: .8 }); E.ensure(r).selected = 'quadrat';
    E.change(r, () => E.setBox(r, 'quadrat', { x: .2, y: .2, w: .6, h: .6 }));
    assert.equal(r.points.length, 10); assert(r.points.some(p=>p.class==='Hard Coral'));
    E.remove(r); assert.equal(r.quadrat_bbox, null); assert.equal(r.points.length, 0);
    E.undo(r); assert.equal(r.quadrat_bbox.x, .2); assert.equal(r.points.length, 10);
});
test('marker movement preserves its allocation and stays inside its assigned region', () => {
    const r=sample(); A.setQuadrat(r,{x:0,y:0,w:1,h:1});
    const before=E.snapshot(r), original={...r.points[0]};
    E.marker(r,0,{x:.9,y:.9}); assert.deepEqual(r.points[0],original);
    E.marker(r,0,{x:.15,y:.15}); E.commit(r,before);
    assert.equal(r.points[0].class,'Hard Coral'); assert.equal(r.points[0].x,.15);
    E.undo(r); assert.deepEqual(r.points[0],original);
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

test('enabling square lock adjusts width while preserving height and vertical position', () => {
    const image = { width: 1200, height: 800 };
    for (const rect of [{x:.1,y:.2,w:.8,h:.6}, {x:.8,y:.2,w:.1,h:.6}]) {
        const locked = E.square(rect, image);
        assert.equal(locked.h, rect.h);
        assert.equal(locked.y, rect.y);
        assert.equal(locked.w, .4);
        assert(A.validRect(locked));
    }
    assert.throws(() => E.square({x:.1,y:.1,w:.5,h:.8}, {width:800,height:1600}), /Reduce the quadrat height/);
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
    r.quadrat_confirmed = true; r.reviewed = true;
    const p = A.payload(r);
    assert.equal(p.analysis.boxes.length, 3);
    assert.equal(p.analysis.boxes.at(-1).source, 'manual');
    assert.equal(p.analysis.model.id, 'yolov8s-v4-3x');
    assert.equal(A.coverage(r), 30);
    assert(!JSON.stringify(p.analysis).includes('area_percent'));
});
