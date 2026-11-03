(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.UploadBatchAnalysis = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const classes = ['Hard Coral', 'Soft Coral', 'Macroalgae', 'Halimeda', 'Algae Assemblage', 'Abiotic', 'Other Biota'];
    const validRect = r => Boolean(r && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(r[k])) &&
        r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= 1.000001 && r.y + r.h <= 1.000001);
    const points = () => [1 / 3, 2 / 3].flatMap(y => [.1, .3, .5, .7, .9].map(x => ({ x, y, class: '' })));
    const complete = r => Boolean(r && !r.boundary_draft && validRect(r.quadrat_bbox) && r.quadrat_confirmed &&
        r.points.length === 10 && r.points.every(p => classes.includes(p.class)));
    const reviewed = r => Boolean(complete(r) && r.reviewed === true);
    const coverage = r => complete(r) ? Math.round(r.points.filter(p => p.class === 'Hard Coral').length / 10 * 100) : null;

    function transect(results) {
        const accepted = results.filter(reviewed);
        const hc = accepted.reduce((n, r) => n + r.points.filter(p => p.class === 'Hard Coral').length, 0);
        // Exact rational ties-to-even rounding, matching Python's two-place mean.
        const scaled = hc * 1000, n = accepted.length;
        const q = n ? Math.floor(scaled / n) : 0, remainder = n ? scaled % n : 0;
        const rounded = q + (n && (remainder * 2 > n || (remainder * 2 === n && q % 2)) ? 1 : 0);
        return { hc, total: n * 10, imgCount: n, pct: rounded / 100 };
    }

    function setQuadrat(result, box) {
        if (!validRect(box)) throw new Error('Enter a quadrat inside the image with positive width and height.');
        result.quadrat_bbox = { ...box };
        result.points = points();
        result.quadrat_confirmed = false;
        result.reviewed = false;
        result.boundary_draft = false;
    }

    function fromResponse(data) {
        if (!data || data.success !== true || data.schema_version !== 1 || !data.model ||
            typeof data.model.id !== 'string' || !data.image || !Number.isInteger(data.image.width) ||
            !Number.isInteger(data.image.height) || data.image.width <= 0 || data.image.height <= 0 ||
            !Array.isArray(data.detections)) throw new Error('The analysis response is incomplete. Please retry.');
        const detections = data.detections.map(d => {
            if (!d || typeof d.id !== 'string' || !['Hard Coral', 'Soft Coral', 'quadrat_area'].includes(d.class_name) ||
                !validRect(d.box) || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1) {
                throw new Error('The detector returned invalid boxes. Please retry.');
            }
            return { ...d, box: { ...d.box } };
        });
        const selected = data.quadrat === null ? null : detections.find(d => d.id === data.quadrat?.id && d.class_name === 'quadrat_area');
        if (data.quadrat !== null && !selected) throw new Error('The quadrat suggestion is invalid. Please retry.');
        const result = { model: { ...data.model }, image: { ...data.image }, detections,
            quadrat_bbox: null, points: [], quadrat_confirmed: false, reviewed: false,
            warnings: Array.isArray(data.warnings) ? data.warnings : [], selected_detection: null };
        if (selected) setQuadrat(result, selected.box);
        return result;
    }

    function setPoint(result, index, value) {
        if (!result.points[index] || (value !== '' && !classes.includes(value))) throw new Error('Invalid point classification.');
        result.points[index].class = value;
        result.reviewed = false;
    }

    function pointSuggestion(result, point) {
        if (!validRect(result.quadrat_bbox)) return '';
        const b = result.quadrat_bbox;
        const x = b.x + point.x * b.w, y = b.y + point.y * b.h;
        const hits = [...new Set(result.detections.filter(d => d.class_name !== 'quadrat_area' &&
            x >= d.box.x && y >= d.box.y && x <= d.box.x + d.box.w && y <= d.box.y + d.box.h).map(d => d.class_name))];
        return hits.length ? `Box suggestion: ${hits.join(' / ')}. Verify the image beneath this point.` : 'No coral-box suggestion. Inspect and classify this point manually.';
    }

    function payload(result) {
        if (!reviewed(result)) throw new Error('Confirm the quadrat, classify all ten points, and confirm image review.');
        return { rect: { ...result.quadrat_bbox }, points: result.points.map(p => ({ x: p.x, y: p.y })),
            point_classes: result.points.map(p => p.class), review: { version: 1, confirmed: true } };
    }

    async function request(file, url, csrf, options = {}) {
        if (!url || !csrf) throw new Error('Your session is incomplete. Reload the page and sign in again.');
        const fetcher = options.fetch || globalThis.fetch;
        const delay = options.delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeout || 120000);
        try {
            for (let attempt = 0; attempt < 3; attempt++) {
                const body = new FormData();
                body.append('image', file, file.name);
                const response = await fetcher(url, { method: 'POST', body, credentials: 'same-origin',
                    headers: { 'X-CSRFToken': csrf, Accept: 'application/json' }, signal: controller.signal });
                if (response.redirected || response.status === 401 || response.status === 403) {
                    throw new Error('Your session expired or access was denied. Reload the page and sign in again.');
                }
                let data;
                try { data = await response.json(); } catch (_) { throw new Error('The server did not return analysis data. Please retry.'); }
                if (response.status === 503 && data.code === 'inference_busy' && attempt < 2) {
                    await delay(1000);
                    continue;
                }
                if (!response.ok || data.success !== true) throw new Error(data.error || 'Image analysis failed. Please retry.');
                return fromResponse(data);
            }
        } catch (error) {
            if (error.name === 'AbortError') throw new Error('Analysis timed out. Wait briefly, then retry this image.');
            if (error instanceof TypeError) throw new Error('Cannot reach image analysis. Check your connection and retry.');
            throw error;
        } finally { clearTimeout(timer); }
    }

    return { classes, validRect, points, complete, reviewed, coverage, transect, setQuadrat, fromResponse, setPoint, pointSuggestion, payload, request };
}));
