const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../static/js/representative_points.js');
const demo = require('../../examples/area-analysis/upload_area_demo.js');
const q = {x:.1,y:.1,w:.8,h:.8};
const region = (name, box) => ({class_name:name,box});

test('Hard Coral allocation matches the demo including 53, 54, 55 and triangle placement', () => {
    for (const percent of [0, 10, 30, 53, 54, 55, 100]) {
        const box = {x:q.x,y:q.y,w:q.w*percent/100,h:q.h};
        const boxes = percent ? [region('Hard Coral',box)] : [];
        const points = R.calculate(q,boxes);
        assert.equal(points.length,10);
        assert.equal(points.filter(p=>p.class==='Hard Coral').length,demo.calculate(q,boxes.map(b=>b.box)).hardCount);
        assert.deepEqual(points,R.calculate(q,boxes));
        points.forEach(p=>assert.equal(R.classAt(boxes,{x:q.x+p.x*q.w,y:q.y+p.y*q.h}),p.class));
        if (percent===30) {
            const hard=points.filter(p=>p.class==='Hard Coral');
            assert.equal(hard[1].y,hard[2].y);
            assert(hard[0].y<hard[1].y);
        }
    }
});

test('same-class overlaps count once, clipping excludes outside boxes, and mixed overlap has one owner', () => {
    const half = {x:.1,y:.1,w:.4,h:.8};
    let points = R.calculate(q,[region('Hard Coral',half),region('Hard Coral',half),
        region('Soft Coral',{x:0,y:0,w:.05,h:.05})]);
    assert.equal(points.filter(p=>p.class==='Hard Coral').length,5);
    assert.equal(points.filter(p=>p.class==='Unclassified').length,5);
    points = R.calculate(q,[region('Hard Coral',half),region('Soft Coral',q)]);
    assert.equal(points.filter(p=>p.class==='Hard Coral').length,5);
    assert.equal(points.filter(p=>p.class==='Soft Coral').length,5);
});

test('all mixtures total ten including full coverage, rounding ties, and small regions', () => {
    for(let hard=0;hard<=100;hard++) {
        for(let soft=0;soft<=100-hard;soft+=5) {
            const boxes=[];
            if(hard) boxes.push(region('Hard Coral',{x:0,y:0,w:hard/100,h:1}));
            if(soft) boxes.push(region('Soft Coral',{x:hard/100,y:0,w:soft/100,h:1}));
            const points=R.calculate({x:0,y:0,w:1,h:1},boxes);
            assert.equal(points.length,10,`HC ${hard} SC ${soft}`);
            assert.equal(points.filter(p=>p.class==='Hard Coral').length,Math.floor(hard/10+.5+1e-10));
            points.forEach(p=>assert.equal(R.classAt(boxes,p),p.class));
        }
    }
});
