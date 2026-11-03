(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports
        ? require('./upload_batch_analysis.js') : root.UploadBatchAnalysis);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.UploadBatchReview = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Analysis) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const coral = result => result.detections.filter(d => d.class_name !== 'quadrat_area');
    function ensure(r) {
        if (!r.editor) r.editor = { selected: r.quadrat_bbox ? 'quadrat' : null, square: false, next: 1, undo: [], redo: [] };
        return r.editor;
    }
    function snapshot(r) {
        const e = ensure(r);
        return copy({ detections: r.detections, quadrat_bbox: r.quadrat_bbox, points: r.points,
            quadrat_confirmed: r.quadrat_confirmed, reviewed: r.reviewed,
            selected: e.selected, square: e.square });
    }
    function restore(r, state, invalidate = true) {
        const s = copy(state), e = ensure(r);
        Object.assign(r, { detections: s.detections, quadrat_bbox: s.quadrat_bbox, points: s.points,
            quadrat_confirmed: s.quadrat_confirmed, reviewed: invalidate ? false : s.reviewed, boundary_draft: false });
        e.selected = s.selected; e.square = s.square;
    }
    function commit(r, before) {
        const e = ensure(r);
        if (JSON.stringify(before) === JSON.stringify(snapshot(r))) return false;
        e.undo.push(before);
        if (e.undo.length > 40) e.undo.shift();
        e.redo = []; r.reviewed = false;
        return true;
    }
    function change(r, action) { const before = snapshot(r); action(); commit(r, before); }
    function undo(r) {
        const e = ensure(r);
        if (!e.undo.length) return false;
        e.redo.push(snapshot(r)); restore(r, e.undo.pop()); return true;
    }
    function redo(r) {
        const e = ensure(r);
        if (!e.redo.length) return false;
        e.undo.push(snapshot(r)); restore(r, e.redo.pop()); return true;
    }
    function selected(r) {
        const id = ensure(r).selected;
        return id === 'quadrat' ? r.quadrat_bbox : coral(r).find(d => d.id === id)?.box || null;
    }
    function label(r, id) {
        if (id === 'quadrat') return 'Quadrat';
        const d = coral(r).find(d => d.id === id);
        if (!d) return 'No box selected';
        const same = coral(r).filter(c => c.class_name === d.class_name);
        return `${d.class_name === 'Hard Coral' ? 'HC' : 'SC'} ${same.indexOf(d) + 1}`;
    }
    const contains = (b, p) => b && p.x >= b.x && p.y >= b.y && p.x <= b.x + b.w && p.y <= b.y + b.h;
    function hit(r, p, preferSelected = false) {
        const e = ensure(r);
        if (preferSelected && contains(selected(r), p)) return e.selected;
        const hits = coral(r).filter(d => contains(d.box, p)).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h);
        return hits[0]?.id || (contains(r.quadrat_bbox, p) ? 'quadrat' : null);
    }
    function clamp(b) {
        const w = Math.min(1, Math.max(.0001, b.w)), h = Math.min(1, Math.max(.0001, b.h));
        return { x: Math.max(0, Math.min(1 - w, b.x)), y: Math.max(0, Math.min(1 - h, b.y)), w, h };
    }
    function move(b, dx, dy) { return clamp({ ...b, x: b.x + dx, y: b.y + dy }); }
    function resize(b, handle, dx, dy, image, square = false) {
        const west = handle.includes('w'), north = handle.includes('n');
        const anchorX = west ? b.x + b.w : b.x, anchorY = north ? b.y + b.h : b.y;
        let w = Math.max(.0001, b.w + (west ? -dx : dx));
        let h = Math.max(.0001, b.h + (north ? -dy : dy));
        const maxW = west ? anchorX : 1 - anchorX, maxH = north ? anchorY : 1 - anchorY;
        if (square) {
            const desired = Math.abs(dx * image.width) >= Math.abs(dy * image.height) ? w * image.width : h * image.height;
            const side = Math.max(.0001, Math.min(desired, maxW * image.width, maxH * image.height));
            w = side / image.width; h = side / image.height;
        } else { w = Math.min(w, maxW); h = Math.min(h, maxH); }
        return { x: west ? anchorX - w : anchorX, y: north ? anchorY - h : anchorY, w, h };
    }
    function square(b, image) {
        const side = Math.min(Math.max(b.w * image.width, b.h * image.height), image.width, image.height);
        return clamp({ x: b.x + b.w / 2 - side / image.width / 2, y: b.y + b.h / 2 - side / image.height / 2,
            w: side / image.width, h: side / image.height });
    }
    function isSquare(r) {
        if (!r.quadrat_bbox) return false;
        const w = r.quadrat_bbox.w * r.image.width, h = r.quadrat_bbox.h * r.image.height;
        return Math.abs(w - h) <= Math.max(1, Math.max(w, h) * .01);
    }
    function setBox(r, id, box) {
        if (!Analysis.validRect(box)) throw new Error('The box must stay inside the image.');
        if (id === 'quadrat') Analysis.setQuadrat(r, box);
        else {
            const d = coral(r).find(d => d.id === id);
            if (!d) return;
            d.box = { ...box }; r.reviewed = false;
        }
    }
    function add(r, box, name) {
        if (!Analysis.validRect(box) || !['Hard Coral', 'Soft Coral'].includes(name)) throw new Error('Invalid coral box.');
        if (coral(r).length >= 200) throw new Error('This image already has the maximum number of coral boxes.');
        change(r, () => {
            const e = ensure(r); let id;
            do { id = `manual-${e.next++}`; } while (r.detections.some(d => d.id === id));
            r.detections.push({ id, class_name: name, box: { ...box }, source: 'manual' });
            e.selected = id;
        });
    }
    function remove(r) {
        const e = ensure(r);
        if (!selected(r)) return false;
        change(r, () => {
            if (e.selected === 'quadrat') { r.quadrat_bbox = null; r.points = []; r.quadrat_confirmed = false; }
            else r.detections = r.detections.filter(d => d.id !== e.selected);
            e.selected = null;
        });
        return true;
    }
    function rename(r, name) {
        const d = coral(r).find(d => d.id === ensure(r).selected);
        if (!d || !['Hard Coral', 'Soft Coral'].includes(name)) return;
        change(r, () => { d.class_name = name; });
    }
    function marker(r, index, point) {
        if (!r.points[index] || !r.quadrat_bbox) return;
        r.points[index] = { x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y)), class: '' };
        r.reviewed = false;
    }
    return { ensure, snapshot, restore, commit, change, undo, redo, coral, selected, label, hit, contains,
        clamp, move, resize, square, isSquare, setBox, add, remove, rename, marker };
}));
