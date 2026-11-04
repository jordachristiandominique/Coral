(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports
        ? require('./representative_points.js') : root.RepresentativePoints);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.UploadBatchAnalysis = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Representative) {
    'use strict';
    const classes = ['Hard Coral', 'Soft Coral', 'Other Substrate'];
    const validRect = r => Boolean(r && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(r[k])) &&
        r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= 1.000001 && r.y + r.h <= 1.000001);
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
        regenerate(result);
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

    function regenerate(result) {
        result.points = result.quadrat_bbox ? Representative.calculate(result.quadrat_bbox,
            result.detections.filter(d => d.class_name !== 'quadrat_area')) : [];
        result.reviewed = false;
    }
    function moveMarker(result, index, point) {
        const current = result.points[index], quadrat = result.quadrat_bbox;
        if (!current || !quadrat) return;
        const next = { x: Math.max(.00000001, Math.min(.99999999, point.x)),
            y: Math.max(.00000001, Math.min(.99999999, point.y)), class: current.class };
        const imagePoint = { x: quadrat.x + next.x * quadrat.w, y: quadrat.y + next.y * quadrat.h };
        if (Representative.classAt(result.detections.filter(d => d.class_name !== 'quadrat_area'), imagePoint) !== current.class) return;
        result.points[index] = next;
        result.reviewed = false;
    }

    function payload(result) {
        if (!reviewed(result)) throw new Error('Verify the quadrat and representative markers, then confirm image review.');
        const submitted = { rect: { ...result.quadrat_bbox }, points: result.points.map(p => ({ x: p.x, y: p.y })),
            point_classes: result.points.map(p => p.class), review: { version: 2, confirmed: true } };
        submitted.analysis = {
            method: 'box_representative_v1',
            version: 1, model: { ...result.model }, square_lock: Boolean(result.editor?.square),
            boxes: result.detections.filter(d => d.class_name !== 'quadrat_area').map(d => ({
                id: d.id, class_name: d.class_name, box: { ...d.box }, source: d.source === 'manual' ? 'manual' : 'ai'
            }))
        };
        return submitted;
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

    return { classes, validRect, complete, reviewed, coverage, transect, setQuadrat, fromResponse, regenerate, moveMarker, payload, request };
}));
