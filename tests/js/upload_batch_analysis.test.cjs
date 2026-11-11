const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../static/js/upload_batch_analysis.js');

const box = { x: .1, y: .1, w: .8, h: .8 };
function response(detections) {
    const regions = detections || [{ id: 'q', class_name: 'quadrat_area', confidence: .9, box }];
    return { success: true, schema_version: 1, model: { id: 'yolov8s-v4-3x' },
        image: { width: 4000, height: 3000 }, detections: regions,
        quadrat: regions.find(d => d.class_name === 'quadrat_area') || null, warnings: [] };
}
function reviewed(hard = 5) {
    const data = response();
    if (hard) data.detections.push({id:'hc', class_name:'Hard Coral', confidence:.8,
        box:{x:box.x,y:box.y,w:box.w*hard/10,h:box.h}});
    const r = A.fromResponse(data);
    r.quadrat_confirmed = true;
    r.reviewed = true;
    return r;
}
const file = () => new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
const http = (data, status = 200) => ({ ok: status === 200, status, redirected: false, json: async () => data });

test('user cancellation aborts the active analysis request with a cancellation error', async () => {
    const controller = new AbortController();
    let activeSignal;
    const pending = A.request(file(), '/analyze/', 'token', {
        signal: controller.signal,
        fetch: (_, options) => new Promise((resolve, reject) => {
            activeSignal = options.signal;
            options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError' && /cancelled/.test(error.message));
    assert.equal(activeSignal.aborted, true);
});

test('an already-cancelled run sends no analysis request', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await assert.rejects(A.request(file(), '/analyze/', 'token', {
        signal: controller.signal,
        fetch: async () => { calls++; return http(response()); },
    }), /cancelled/);
    assert.equal(calls, 0);
});

test('cancellation during a busy retry prevents the next request', async () => {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(A.request(file(), '/analyze/', 'token', {
        signal: controller.signal,
        fetch: async () => { calls++; return http({ code: 'inference_busy' }, 503); },
        delay: async () => controller.abort(),
    }), /cancelled/);
    assert.equal(calls, 1);
});

test('a response arriving after cancellation is discarded', async () => {
    const controller = new AbortController();
    await assert.rejects(A.request(file(), '/analyze/', 'token', {
        signal: controller.signal,
        fetch: async () => { controller.abort(); return http(response()); },
    }), /cancelled/);
});

test('estimated HCC area precedes marker rounding and counts overlapping HC once', () => {
    const data = response();
    const hard = {id:'hc', class_name:'Hard Coral', confidence:.8,
        box:{...box, w:box.w * .5423}};
    data.detections.push(hard, {...hard, id:'overlap'},
        {id:'soft', class_name:'Soft Coral', confidence:.8, box});
    const r = A.fromResponse(data);
    assert.equal(A.estimatedCoverage(r), 54.23);
    assert.equal(A.coverage(r), 50);
    A.setQuadrat(r, {...box, w:box.w * .5423});
    assert.equal(A.estimatedCoverage(r), 100);
    assert.equal(A.estimatedCoverage(A.fromResponse(response([]))), null);
});

test('a quadrat without coral boxes generates ten unclassified representative markers', () => {
    const r = A.fromResponse(response());
    assert.equal(r.points.length, 10);
    assert(r.points.every(p => p.class === 'Other Substrate' && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1));
    assert.equal(A.coverage(r), 0);
    assert.equal(A.complete(r), true);
});
test('missing quadrat stays empty until a manual boundary is supplied', () => {
    const r = A.fromResponse(response([]));
    assert.equal(r.quadrat_bbox, null);
    assert.deepEqual(r.points, []);
    assert.throws(() => A.payload(r));
    A.setQuadrat(r, box);
    assert.equal(r.points.length, 10);
    assert.equal(r.quadrat_confirmed, false);
});
test('complete box representatives save without a separate confirmation', () => {
    const r = reviewed(); r.reviewed = false;
    assert.equal(A.complete(r), true);
    const payload = A.payload(r);
    assert.deepEqual(payload.review, {version:3, mode:'on_submit'});
    assert.equal(payload.analysis.method, 'box_representative_v1');
    assert.equal(payload.point_classes.length, 10);
    assert.equal(payload.point_classes.filter(c => c === 'Hard Coral').length, 5);
    assert.equal(A.coverage(r), 50);
    r.quadrat_confirmed = false; assert.doesNotThrow(() => A.payload(r));
    r.quadrat_confirmed = true; r.boundary_draft = true; assert.throws(() => A.payload(r));
});
test('box edits regenerate markers and invalidate approval, including a coral-free result', () => {
    const r = reviewed(); r.detections = r.detections.filter(d=>d.class_name==='quadrat_area');
    A.regenerate(r);
    assert.equal(r.reviewed, false);
    assert.equal(A.coverage(r), 0);
    assert(r.points.every(p=>p.class==='Other Substrate'));
});
test('quadrat edits regenerate box representatives and require boundary confirmation', () => {
    const r = reviewed(); A.setQuadrat(r, {x:.1,y:.1,w:.4,h:.8});
    assert.equal(r.reviewed, false); assert.equal(r.quadrat_confirmed, false);
    assert(r.points.every(p=>p.class==='Hard Coral'));
});
test('invalid detector boxes, classes, confidence, and responses fail without fallbacks', () => {
    for (const change of [{ box: { ...box, w: 2 } }, { class_name: 'Invented' }, { confidence: NaN }]) {
        assert.throws(() => A.fromResponse(response([{ id: 'bad', class_name: 'Hard Coral', confidence: .7, box, ...change }])));
    }
    assert.throws(() => A.fromResponse({ success: false }));
    assert.throws(() => A.setQuadrat(reviewed(), { x: 0, y: 0, w: 0, h: 1 }));
});
test('mixed overlaps use Hard Coral priority and outside boxes receive no markers', () => {
    const data = response();
    data.detections.push({id:'hc',class_name:'Hard Coral',confidence:.8,box});
    data.detections.push({id:'sc',class_name:'Soft Coral',confidence:.7,box});
    const r=A.fromResponse(data);
    assert(r.points.every(p=>p.class==='Hard Coral'));
    r.detections=[{id:'outside',class_name:'Hard Coral',box:{x:0,y:0,w:.01,h:.01}}];
    A.regenerate(r); assert(r.points.every(p=>p.class==='Other Substrate'));
});
test('transect HCC excludes Soft Coral and incomplete images, with canonical mean rounding', () => {
    assert.equal(A.transect([reviewed(0), reviewed(10)]).pct, 50);
    assert.equal(A.transect([reviewed(5), A.fromResponse(response([]))]).imgCount, 1);
    const sixteen = Array.from({ length: 16 }, () => reviewed(0));
    sixteen[0] = reviewed(1);
    assert.equal(A.transect(sixteen).pct, .62); // Python round(10/16, 2)
});
test('request sends multipart image, same-origin credentials, and CSRF token', async () => {
    let sent;
    await A.request(file(), '/analyze/', 'csrf-token', { fetch: async (url, options) => {
        sent = { url, options }; return http(response());
    } });
    assert.equal(sent.url, '/analyze/');
    assert.equal(sent.options.headers['X-CSRFToken'], 'csrf-token');
    assert.equal(sent.options.credentials, 'same-origin');
    assert.equal(sent.options.body.get('image').name, 'photo.jpg');
});
test('busy requests retry at most three times; model-unavailable is not retried', async () => {
    let calls = 0;
    const busy = async () => { calls++; return http({ code: 'inference_busy', error: 'Busy' }, 503); };
    await assert.rejects(A.request(file(), '/analyze/', 'token', { fetch: busy, delay: async () => {} }), /Busy/);
    assert.equal(calls, 3);
    calls = 0;
    await assert.rejects(A.request(file(), '/analyze/', 'token', { fetch: async () => {
        calls++; return http({ code: 'model_unavailable', error: 'Unavailable' }, 503);
    } }), /Unavailable/);
    assert.equal(calls, 1);
});
test('a transient busy response recovers without supplying fabricated labels', async () => {
    let calls = 0;
    const r = await A.request(file(), '/analyze/', 'token', { fetch: async () => ++calls === 1
        ? http({ code: 'inference_busy' }, 503) : http(response()), delay: async () => {} });
    assert.equal(calls, 2);
    assert(r.points.every(p => p.class === 'Other Substrate'));
});
test('redirects, CSRF failure, non-JSON, offline and timeout errors remain actionable', async () => {
    for (const result of [{ ...http({}), redirected: true }, http({}, 403)]) {
        await assert.rejects(A.request(file(), '/analyze/', 'token', { fetch: async () => result }), /session|access/);
    }
    await assert.rejects(A.request(file(), '/analyze/', 'token', { fetch: async () => ({ ...http({}), json: async () => { throw Error(); } }) }), /did not return/);
    await assert.rejects(A.request(file(), '/analyze/', 'token', { fetch: async () => { throw new TypeError('network'); } }), /connection/);
    await assert.rejects(A.request(file(), '/analyze/', 'token', { timeout: 5, fetch: (_, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })));
    }) }), /timed out/);
});
