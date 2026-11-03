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
    const r = A.fromResponse(response());
    r.quadrat_confirmed = true;
    r.points.forEach((_, i) => A.setPoint(r, i, i < hard ? 'Hard Coral' : 'Soft Coral'));
    r.reviewed = true;
    return r;
}
const file = () => new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
const http = (data, status = 200) => ({ ok: status === 200, status, redirected: false, json: async () => data });

test('real quadrat creates ten deterministic unclassified points, never invented classes', () => {
    const r = A.fromResponse(response());
    assert.equal(r.points.length, 10);
    assert(r.points.every(p => p.class === '' && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1));
    assert.deepEqual(r.points, A.points());
    assert.equal(A.coverage(r), null);
    assert.equal(A.reviewed(r), false);
});
test('missing quadrat and zero detections stay empty until a manual boundary is supplied', () => {
    const r = A.fromResponse(response([]));
    assert.equal(r.quadrat_bbox, null);
    assert.deepEqual(r.points, []);
    assert.throws(() => A.payload(r));
    A.setQuadrat(r, box);
    assert.equal(r.points.length, 10);
    assert.equal(r.quadrat_confirmed, false);
});
test('boundary, ten classifications and explicit review are all required for serialization', () => {
    const r = reviewed();
    r.reviewed = false;
    assert.equal(A.complete(r), true);
    assert.throws(() => A.payload(r));
    r.reviewed = true;
    const payload = A.payload(r);
    assert.deepEqual(payload.review, { version: 1, confirmed: true });
    assert.equal(payload.point_classes.length, 10);
    assert.equal(payload.point_classes.filter(c => c === 'Hard Coral').length, 5);
    assert.deepEqual(Object.keys(payload.points[0]).sort(), ['x', 'y']);
    assert.equal(A.coverage(r), 50);
    r.quadrat_confirmed = false;
    assert.throws(() => A.payload(r));
    r.quadrat_confirmed = true;
    r.boundary_draft = true;
    assert.throws(() => A.payload(r));
});
test('point edits invalidate approval and unsupported or missing classes cannot be saved', () => {
    const r = reviewed();
    A.setPoint(r, 0, 'Soft Coral');
    assert.equal(r.reviewed, false);
    assert.equal(A.coverage(r), 40);
    A.setPoint(r, 0, '');
    assert.equal(A.complete(r), false);
    assert.equal(A.coverage(r), null);
    assert.throws(() => A.setPoint(r, 0, 'Non-coral'));
});
test('boundary edits reset point classifications and quadrat confirmation', () => {
    const r = reviewed();
    A.setQuadrat(r, { x: .2, y: .2, w: .6, h: .6 });
    assert.equal(r.reviewed, false);
    assert.equal(r.quadrat_confirmed, false);
    assert(r.points.every(p => p.class === ''));
});
test('invalid detector boxes, classes, confidence, and responses fail without fallbacks', () => {
    for (const change of [{ box: { ...box, w: 2 } }, { class_name: 'Invented' }, { confidence: NaN }]) {
        assert.throws(() => A.fromResponse(response([{ id: 'bad', class_name: 'Hard Coral', confidence: .7, box, ...change }])));
    }
    assert.throws(() => A.fromResponse({ success: false }));
    assert.throws(() => A.setQuadrat(reviewed(), { x: 0, y: 0, w: 0, h: 1 }));
});
test('overlapping Hard and Soft boxes are suggestions only; outside boxes do not assign points', () => {
    const data = response();
    data.detections.push({ id: 'hc', class_name: 'Hard Coral', confidence: .8, box });
    data.detections.push({ id: 'sc', class_name: 'Soft Coral', confidence: .7, box });
    const r = A.fromResponse(data);
    assert.match(A.pointSuggestion(r, r.points[0]), /Hard Coral \/ Soft Coral/);
    assert.equal(r.points[0].class, '');
    r.detections = [{ id: 'outside', class_name: 'Hard Coral', confidence: .7, box: { x: 0, y: 0, w: .01, h: .01 } }];
    assert.match(A.pointSuggestion(r, r.points[0]), /No coral-box suggestion/);
});
test('transect HCC excludes Soft Coral and unreviewed images, with canonical mean rounding', () => {
    assert.equal(A.transect([reviewed(0), reviewed(10)]).pct, 50);
    assert.equal(A.transect([reviewed(5), A.fromResponse(response())]).imgCount, 1);
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
    assert(r.points.every(p => p.class === ''));
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
