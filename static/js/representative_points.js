/* Ten box-area representative markers. Coordinates returned relative to the quadrat. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.RepresentativePoints = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const names = ['Hard Coral', 'Soft Coral', 'Unclassified'];

    function classAt(boxes, point) {
        const hits = boxes.filter(region => point.x >= region.box.x && point.x <= region.box.x + region.box.w &&
            point.y >= region.box.y && point.y <= region.box.y + region.box.h);
        return names.find(name => hits.some(region => region.class_name === name)) || 'Unclassified';
    }

    function cellsFor(quadrat, boxes) {
        const clipped = boxes.map(region => {
            const x = Math.max(quadrat.x, region.box.x), y = Math.max(quadrat.y, region.box.y);
            const right = Math.min(quadrat.x + quadrat.w, region.box.x + region.box.w);
            const bottom = Math.min(quadrat.y + quadrat.h, region.box.y + region.box.h);
            return { class_name: region.class_name, box: { x, y, w: right - x, h: bottom - y } };
        }).filter(region => region.box.w > 0 && region.box.h > 0);
        const xs = [...new Set([quadrat.x, quadrat.x + quadrat.w,
            ...clipped.flatMap(region => [region.box.x, region.box.x + region.box.w])])].sort((a, b) => a - b);
        const cells = [];
        for (let i = 0; i < xs.length - 1; i++) {
            const x = xs[i], w = xs[i + 1] - x;
            const active = clipped.filter(region => region.box.x < x + w / 2 && region.box.x + region.box.w > x + w / 2);
            const ys = [...new Set([quadrat.y, quadrat.y + quadrat.h,
                ...active.flatMap(region => [region.box.y, region.box.y + region.box.h])])].sort((a, b) => a - b);
            for (let j = 0; j < ys.length - 1; j++) {
                const y = ys[j], h = ys[j + 1] - y;
                cells.push({ x, y, w, h, class: classAt(active, { x: x + w / 2, y: y + h / 2 }) });
            }
        }
        return cells;
    }

    function pattern(count) {
        if (count === 1) return [[.5, .5]];
        if (count === 3) return [[.5, .25], [.25, .75], [.75, .75]];
        const columns = count === 2 ? 2 : Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / columns), points = [];
        for (let row = 0, remaining = count; row < rows; row++) {
            const length = Math.min(columns, remaining);
            for (let column = 0; column < length; column++) points.push([(column + 1) / (length + 1), (row + 1) / (rows + 1)]);
            remaining -= length;
        }
        return points;
    }

    function allocate(cells, count) {
        const area = cells.reduce((sum, cell) => sum + cell.w * cell.h, 0);
        if (!count || !area) return [];
        const quotas = cells.map((cell, index) => {
            const exact = count * cell.w * cell.h / area;
            return { cell, index, exact, count: Math.floor(exact) };
        });
        let remaining = count - quotas.reduce((sum, quota) => sum + quota.count, 0);
        [...quotas].sort((a, b) => (b.exact - b.count) - (a.exact - a.count) || a.index - b.index).forEach(quota => {
            if (remaining > 0) { quota.count++; remaining--; }
        });
        return quotas.flatMap(({ cell, count: allocated }) => pattern(allocated).map(([x, y]) => ({
            x: cell.x + x * cell.w, y: cell.y + y * cell.h, class: cell.class
        })));
    }

    function calculate(quadrat, boxes) {
        const cells = cellsFor(quadrat, boxes);
        const countFor = name => {
            const area = cells.filter(cell => cell.class === name).reduce((sum, cell) => sum + cell.w * cell.h, 0);
            const percent = Number((area / (quadrat.w * quadrat.h) * 100).toFixed(12));
            return Math.min(10, Math.max(0, Math.floor(percent / 10 + .5 + 1e-10)));
        };
        const hard = countFor('Hard Coral');
        const soft = Math.min(10 - hard, countFor('Soft Coral'));
        const counts = [hard, soft, 10 - hard - soft];
        // When rounded coral quotas occupy nine slots but cover the whole quadrat,
        // the remaining slot belongs to Soft Coral rather than an empty remainder.
        if (counts[2] && !cells.some(cell => cell.class === 'Unclassified')) {
            counts[1] += counts[2]; counts[2] = 0;
        }
        return names.flatMap((name, index) => allocate(cells.filter(cell => cell.class === name), counts[index]))
            .map(point => ({ x: (point.x - quadrat.x) / quadrat.w,
                y: (point.y - quadrat.y) / quadrat.h, class: point.class }));
    }
    return { calculate, classAt };
}));
