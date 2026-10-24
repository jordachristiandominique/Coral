/* Preview only: rectangle-area estimates are never serialized as CPCE points. */
(function (root) {
    'use strict';
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    function intersect(a, b) {
        const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
        const w = Math.min(a.x + a.w, b.x + b.w) - x;
        const h = Math.min(a.y + a.h, b.y + b.h) - y;
        return w > 0 && h > 0 ? { x, y, w, h } : null;
    }
    function boxAreaPercent(quadrat, box) {
        const clipped = intersect(quadrat, box);
        return clipped ? clipped.w * clipped.h / (quadrat.w * quadrat.h) * 100 : 0;
    }
    function placeLabels(items, obstacles, imageWidth, imageHeight, stacked, previous = {}) {
        const placed = [], preferences = {};
        const collides = (a, b) => a.x < b.x + b.w + 5 && a.x + a.w + 5 > b.x && a.y < b.y + b.h + 5 && a.y + a.h + 5 > b.y;
        let railY = stacked ? imageHeight + 12 : 0;
        for (const item of items) {
            const b = item.rect, w = item.w, h = item.h, gap = 16;
            const candidates = [
                {side:'above', x:b.x, y:b.y-h-gap, w,h},
                {side:'right', x:b.x+b.w+gap, y:b.y, w,h},
                {side:'below', x:b.x, y:b.y+b.h+gap, w,h},
                {side:'left', x:b.x-w-gap, y:b.y, w,h}
            ];
            candidates.sort((a,b) => Number(b.side === previous[item.id]) - Number(a.side === previous[item.id]));
            const fit = candidates.find(c => c.x >= 0 && c.y >= 0 && c.x+c.w <= imageWidth && c.y+c.h <= imageHeight &&
                !obstacles.some(o => collides(c,o)) && !placed.some(o => collides(c,o)));
            const position = fit || {side:'rail',x:stacked ? 0 : imageWidth+16,y:railY,w,h};
            if (!fit) railY += h + 10;
            preferences[item.id] = position.side;
            placed.push({...item,...position});
        }
        return {labels:placed, preferences, height:Math.max(imageHeight,railY)};
    }
    function category(p) {
        return p > 44 ? 'A' : p > 33 ? 'B' : p > 22 ? 'C' : 'D';
    }
    function quadratDimensions(rect, width, height) {
        const w = rect.w * width, h = rect.h * height;
        return { width: w, height: h, ratio: w / h, square: Math.abs(w - h) <= 1 };
    }
    function squareRect(rect, width, height) {
        const side = Math.min(rect.w * width, rect.h * height);
        return { x: rect.x + (rect.w - side / width) / 2, y: rect.y + (rect.h - side / height) / 2,
            w: side / width, h: side / height };
    }
    function resizeSquare(rect, handle, dx, dy, width, height) {
        if (handle === 'move') return transformRect(rect, handle, dx, dy);
        const west = handle.includes('w'), north = handle.includes('n');
        const ax = (west ? rect.x + rect.w : rect.x) * width;
        const ay = (north ? rect.y + rect.h : rect.y) * height;
        const requested = ((rect.w * width + (west ? -dx : dx) * width) +
            (rect.h * height + (north ? -dy : dy) * height)) / 2;
        const maxSide = Math.min(west ? ax : width - ax, north ? ay : height - ay);
        const side = clamp(requested, Math.min(Math.max(width, height) * .001, maxSide), maxSide);
        return { x: (west ? ax - side : ax) / width, y: (north ? ay - side : ay) / height,
            w: side / width, h: side / height };
    }
    function transformRect(rect, handle, dx, dy) {
        if (handle === 'move') return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.w), y: clamp(rect.y + dy, 0, 1 - rect.h) };
        let left = rect.x, top = rect.y, right = rect.x + rect.w, bottom = rect.y + rect.h;
        if (handle.includes('w')) left = clamp(rect.x + dx, 0, right - .001);
        if (handle.includes('e')) right = clamp(right + dx, left + .001, 1);
        if (handle.includes('n')) top = clamp(rect.y + dy, 0, bottom - .001);
        if (handle.includes('s')) bottom = clamp(bottom + dy, top + .001, 1);
        return { x: left, y: top, w: right - left, h: bottom - top };
    }
    function cellsFor(q, boxes) {
        const clipped = boxes.map((b, index) => { const rect = intersect(q, b); return rect ? {...rect, index} : null; }).filter(Boolean);
        const xs = [...new Set([q.x, q.x + q.w, ...clipped.flatMap(b => [b.x, b.x + b.w])])].sort((a, b) => a - b);
        const cells = [];
        for (let i = 0; i < xs.length - 1; i++) {
            const x = xs[i], w = xs[i + 1] - x;
            const active = clipped.filter(b => b.x < x + w / 2 && b.x + b.w > x + w / 2);
            const ys = [...new Set([q.y, q.y + q.h, ...active.flatMap(b => [b.y, b.y + b.h])])].sort((a, b) => a - b);
            for (let j = 0; j < ys.length - 1; j++) {
                const y = ys[j], h = ys[j + 1] - y;
                const owners = active.filter(b => y + h / 2 > b.y && y + h / 2 < b.y + b.h).map(b => b.index);
                if (w * h > 0) cells.push({ x, y, w, h, hard: owners.length > 0, owners });
            }
        }
        return cells;
    }
    function summarizeOverlaps(q, cells) {
        const regions = new Map();
        cells.filter(c => c.owners.length > 1).forEach(c => {
            const key = c.owners.join(',');
            if (!regions.has(key)) regions.set(key, {owners:c.owners, area:0, cells:[], anchor:c});
            const group = regions.get(key); group.area += c.w * c.h; group.cells.push(c);
            if (c.w * c.h > group.anchor.w * group.anchor.h) group.anchor = c;
        });
        const groups = [...regions.values()].map(g => ({...g, percent:g.area / (q.w * q.h) * 100}));
        return {groups, percent:groups.reduce((sum,g) => sum + g.percent,0)};
    }
    function outerEdges(cells) {
        const segments = [], epsilon = 1e-10;
        for (const c of cells) {
            const sides = [
                { horizontal:true, at:c.y, start:c.x, end:c.x+c.w, opposite:n=>n.y+n.h },
                { horizontal:true, at:c.y+c.h, start:c.x, end:c.x+c.w, opposite:n=>n.y },
                { horizontal:false, at:c.x, start:c.y, end:c.y+c.h, opposite:n=>n.x+n.w },
                { horizontal:false, at:c.x+c.w, start:c.y, end:c.y+c.h, opposite:n=>n.x }
            ];
            for (const side of sides) {
                let exposed = [[side.start, side.end]];
                for (const neighbor of cells) {
                    if (neighbor === c || Math.abs(side.at-side.opposite(neighbor))>epsilon) continue;
                    const start = side.horizontal ? neighbor.x : neighbor.y;
                    const end = start + (side.horizontal ? neighbor.w : neighbor.h);
                    exposed = exposed.flatMap(([a,b]) => {
                        if (end <= a+epsilon || start >= b-epsilon) return [[a,b]];
                        return [[a,Math.min(b,start)],[Math.max(a,end),b]].filter(([x,y])=>y-x>epsilon);
                    });
                }
                exposed.forEach(([a,b])=>segments.push(side.horizontal
                    ? {x1:a,y1:side.at,x2:b,y2:side.at}
                    : {x1:side.at,y1:a,x2:side.at,y2:b}));
            }
        }
        return segments;
    }
    function pattern(n) {
        if (n === 1) return [[0.5, 0.5]];
        if (n === 3) return [[0.5, 0.25], [0.25, 0.75], [0.75, 0.75]];
        const cols = n === 2 ? 2 : Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols), points = [];
        for (let row = 0, left = n; row < rows; row++) {
            const count = Math.min(cols, left);
            for (let col = 0; col < count; col++) points.push([(col + 1) / (count + 1), (row + 1) / (rows + 1)]);
            left -= count;
        }
        return points;
    }
    function allocate(cells, n) {
        if (!n) return [];
        const total = cells.reduce((a, c) => a + c.w * c.h, 0);
        if (!total) return [];
        const quotas = cells.map((c, i) => ({ c, i, exact: n * c.w * c.h / total }));
        quotas.forEach(a => { a.count = Math.floor(a.exact); });
        let left = n - quotas.reduce((a, b) => a + b.count, 0);
        [...quotas].sort((a, b) => (b.exact - b.count) - (a.exact - a.count) || a.i - b.i)
            .forEach(a => { if (left > 0) { a.count++; left--; } });
        return quotas.flatMap(({ c, count }) => pattern(count).map(([x, y]) => ({
            x: c.x + x * c.w, y: c.y + y * c.h, hard: c.hard
        })));
    }
    function calculate(q, boxes) {
        if (![q.x, q.y, q.w, q.h].every(Number.isFinite) || q.w <= 0 || q.h <= 0) throw new Error('Invalid quadrat');
        const cells = cellsFor(q, boxes);
        const hardArea = cells.filter(c => c.hard).reduce((a, c) => a + c.w * c.h, 0);
        const percent = Number(clamp(hardArea / (q.w * q.h) * 100, 0, 100).toFixed(12));
        // Small epsilon avoids a floating-point 5.499999999999999 at 55%.
        const hardCount = clamp(Math.floor(percent / 10 + 0.5 + 1e-10), 0, 10);
        const points = [...allocate(cells.filter(c => c.hard), hardCount),
            ...allocate(cells.filter(c => !c.hard), 10 - hardCount)];
        return { percent, category: category(percent), hardCount, points, hardArea, overlaps:summarizeOverlaps(q, cells) };
    }
    const api = { calculate, intersect, category, pattern, transformRect, quadratDimensions, squareRect, resizeSquare, boxAreaPercent, placeLabels, outerEdges };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.CoralAreaGeometry = api;
    if (typeof document === 'undefined') return;

    function init() {
        const panel = document.getElementById('area-demo');
        if (!panel) return;
        const canvas = document.getElementById('area-demo-canvas'), ctx = canvas.getContext('2d');
        const editor = document.getElementById('area-demo-editor');
        const status = document.getElementById('area-demo-status');
        const photoName = document.getElementById('area-demo-photo');
        const targetSelect = document.getElementById('area-demo-target');
        const squareLock = document.getElementById('area-demo-lock-square');
        const viewport = document.getElementById('area-demo-viewport');
        const labelLayer = document.getElementById('area-demo-labels');
        const leaders = document.getElementById('area-demo-leaders');
        const labelNodes = new Map();
        let labelPreferences = {}, selectedLabel = null;
        const imageSize = () => ({ width: image ? image.naturalWidth : canvas.width, height: image ? image.naturalHeight : canvas.height });
        let target = 'box:0', boxDrag = null;
        let q, boxes, result, image = null, file = null, loadToken = 0, moved = {}, dragIndex = -1;
        let reviewed = false;
        let selectedMarker = 0;
        const imageStates = new Map();
        const contains = (b, x, y) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
        const selectedRect = () => target === 'quadrat' ? q : target.startsWith('box:') ? boxes[Number(target.split(':')[1])] : null;
        const corners = b => ({ nw: {x:b.x,y:b.y}, ne: {x:b.x+b.w,y:b.y}, sw: {x:b.x,y:b.y+b.h}, se: {x:b.x+b.w,y:b.y+b.h} });
        function canEditBox() {
            return target === 'quadrat' || document.getElementById('area-demo-show-boxes').checked;
        }
        function boxHit(p) {
            const rect = selectedRect();
            if (!rect || !canEditBox()) return null;
            const bounds = canvas.getBoundingClientRect();
            const handle = Object.entries(corners(rect)).find(([, c]) =>
                Math.abs(c.x - p.x) * bounds.width <= 13 && Math.abs(c.y - p.y) * bounds.height <= 13);
            return handle ? handle[0] : contains(rect, p.x, p.y) ? 'move' : null;
        }
        function updateLabels() {
            const bounds = canvas.getBoundingClientRect(), width = bounds.width, height = bounds.height;
            if (!width || !height) return;
            const pixelRect = b => ({x:b.x*width,y:b.y*height,w:b.w*width,h:b.h*height});
            const showBoxes = document.getElementById('area-demo-show-boxes').checked;
            const showAreaLabels = document.getElementById('area-demo-show-area-labels').checked;
            const items = showBoxes && showAreaLabels ? boxes.map((b,i) => ({id:'box:'+i,rect:pixelRect(b),
                text:'HC '+(i+1)+' | '+boxAreaPercent(q,b).toFixed(2)+'%', kind:'box'})) : [];
            if (showBoxes && showAreaLabels && document.getElementById('area-demo-show-overlaps').checked) {
                result.overlaps.groups.forEach(g => items.push({id:'overlap:'+g.owners.join(','),rect:pixelRect(g.anchor),
                    text:g.owners.map(i=>'HC '+(i+1)).join(' + ')+' | '+g.percent.toFixed(2)+'%',kind:'overlap'}));
            }
            for (const [id, button] of labelNodes) {
                if (!items.some(i=>i.id===id)) {button.remove();labelNodes.delete(id);}
            }
            const obstacles = boxes.map(pixelRect);
            if (document.getElementById('area-demo-show-points').checked) result.points.forEach((p,i) => {
                const at = moved[i] || p;
                obstacles.push({x:at.x*width-20,y:at.y*height-28,w:52,h:48});
            });
            [q,...boxes].forEach(b => Object.values(corners(b)).forEach(c=>obstacles.push({x:c.x*width-14,y:c.y*height-14,w:28,h:28})));
            items.forEach(item => {
                let button = labelNodes.get(item.id);
                if (!button) {
                    button = document.createElement('button');button.type='button';
                    button.addEventListener('click', () => {
                        selectedLabel=item.id;
                        target=item.kind==='box' ? item.id : 'markers';fields();draw();
                        status.textContent='Selected '+button.textContent+'.';
                    });
                    labelNodes.set(item.id,button);labelLayer.append(button);
                }
                button.className='area-region-label '+item.kind;
                button.textContent=item.text;
                button.setAttribute('aria-pressed',String(selectedLabel===item.id));
                const size=button.getBoundingClientRect();item.w=size.width;item.h=size.height;
            });
            const stacked=viewport.getBoundingClientRect().width < width+100;
            const layout=placeLabels(items,obstacles,width,height,stacked,labelPreferences);
            labelPreferences=layout.preferences;
            viewport.style.minHeight=Math.ceil(layout.height)+'px';
            leaders.replaceChildren();
            leaders.setAttribute('viewBox','0 0 '+viewport.getBoundingClientRect().width+' '+layout.height);
            layout.labels.forEach(item => {
                const button=labelNodes.get(item.id);button.style.left=item.x+'px';button.style.top=item.y+'px';
                const b=item.rect, cx=b.x+b.w/2,cy=b.y+b.h/2;
                const endX=clamp(cx,item.x,item.x+item.w),endY=clamp(cy,item.y,item.y+item.h);
                const dx=endX-cx,dy=endY-cy;
                const factor=item.kind==='overlap' ? 0 : .5/Math.max(Math.abs(dx)/(b.w||1),Math.abs(dy)/(b.h||1),.001);
                const line=document.createElementNS('http://www.w3.org/2000/svg','line');
                line.setAttribute('x1',cx+dx*factor);line.setAttribute('y1',cy+dy*factor);
                line.setAttribute('x2',endX);line.setAttribute('y2',endY);
                line.setAttribute('stroke',item.kind==='box'?'#ba88ff':'#eebc56');
                line.setAttribute('stroke-width',selectedLabel===item.id?'2.5':'1.25');leaders.append(line);
            });
        }
        function draw() {
            const width = canvas.width, height = canvas.height;
            const dimensions = quadratDimensions(q, image ? image.naturalWidth : width, image ? image.naturalHeight : height);
            const indicator = document.getElementById('area-demo-square');
            indicator.textContent = (dimensions.square ? 'Square: width = height' : 'Rectangle: width and height differ') +
                ' | Width ' + dimensions.width.toFixed(1) + ' px | Height ' + dimensions.height.toFixed(1) +
                ' px | Ratio ' + dimensions.ratio.toFixed(3) + ':1';
            indicator.dataset.square = String(dimensions.square);
            const pointPercent = result.hardCount / result.points.length * 100;
            document.getElementById('area-demo-hcc-result').textContent = pointPercent.toFixed(0) + '%';
            document.getElementById('area-demo-category').textContent = 'Category ' + category(pointPercent);
            document.getElementById('area-demo-hcc-computation').textContent =
                result.hardCount + ' Hard Coral points / ' + result.points.length + ' total points × 100 = ' + pointPercent.toFixed(0) + '%';
            const overlapName = group => group.owners.map(i => 'HC ' + (i + 1)).join(' + ');
            document.getElementById('area-demo-overlap-summary').textContent = result.overlaps.groups.length
                ? 'Total shared area: ' + result.overlaps.percent.toFixed(2) + '% of quadrat (counted once). ' +
                    result.overlaps.groups.map(g => overlapName(g) + ': ' + g.percent.toFixed(2) + '%').join('; ')
                : 'No overlapping Hard Coral regions inside the quadrat.';
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = '#183a43'; ctx.fillRect(0, 0, width, height);
            if (image) ctx.drawImage(image, 0, 0, width, height);
            if (document.getElementById('area-demo-fill-quadrat').checked) {
                ctx.fillStyle = 'rgba(91,158,240,.26)'; ctx.fillRect(q.x * width, q.y * height, q.w * width, q.h * height);
            }
            ctx.save(); ctx.beginPath(); ctx.rect(q.x * width, q.y * height, q.w * width, q.h * height); ctx.clip();
            (document.getElementById('area-demo-show-boxes').checked ? boxes : []).forEach((b, i) => {
                ctx.fillStyle = 'rgba(139,34,255,.45)'; ctx.strokeStyle = '#a24bff'; ctx.lineWidth = 3;
                if (document.getElementById('area-demo-fill-boxes').checked) {
                    ctx.fillRect(b.x * width, b.y * height, b.w * width, b.h * height);
                }
                ctx.strokeRect(b.x * width, b.y * height, b.w * width, b.h * height);
            });
            ctx.restore(); ctx.strokeStyle = '#68b4ff'; ctx.lineWidth = 4;
            ctx.strokeRect(q.x * width, q.y * height, q.w * width, q.h * height);
            if (document.getElementById('area-demo-show-boxes').checked && document.getElementById('area-demo-show-overlaps').checked) {
                result.overlaps.groups.forEach(group => {
                    ctx.save(); ctx.strokeStyle = '#ffce66'; ctx.lineWidth = selectedLabel==='overlap:'+group.owners.join(',') ? 5 : 2;
                    group.cells.forEach(c => {
                        if (document.getElementById('area-demo-fill-boxes').checked) {
                            ctx.fillStyle = 'rgba(255,191,69,.28)'; ctx.fillRect(c.x * width,c.y * height,c.w * width,c.h * height);
                        }
                    });
                    ctx.beginPath();
                    outerEdges(group.cells).forEach(edge => {
                        ctx.moveTo(edge.x1*width,edge.y1*height);
                        ctx.lineTo(edge.x2*width,edge.y2*height);
                    });
                    ctx.stroke();
                    ctx.restore();
                });
            }
            (document.getElementById('area-demo-show-points').checked ? result.points : []).forEach((p, i) => {
                const position = moved[i] || p, x = position.x * width, y = position.y * height;
                ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9);
                ctx.strokeStyle = '#162c35'; ctx.lineWidth = 6; ctx.stroke();
                ctx.strokeStyle = p.hard ? '#fff' : '#ffe39c'; ctx.lineWidth = 2.5; ctx.stroke();
                ctx.font = 'bold 16px sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#162c35';
                ctx.strokeText(String(i + 1), x + 11, y - 7); ctx.fillStyle = p.hard ? '#fff' : '#ffe39c';
                ctx.fillText(String(i + 1), x + 11, y - 7);
                if (document.activeElement === canvas && i === selectedMarker) {
                    ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.strokeStyle = '#ffd56b'; ctx.lineWidth = 2; ctx.stroke();
                }
            });
            const selected = selectedRect();
            if (selected && canEditBox()) {
                const bounds = canvas.getBoundingClientRect();
                const hw = 12 * width / (bounds.width || width), hh = 12 * height / (bounds.height || height);
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
                ctx.strokeRect(selected.x * width, selected.y * height, selected.w * width, selected.h * height);
                Object.values(corners(selected)).forEach(c => {
                    ctx.fillStyle = target === 'quadrat' ? '#68b4ff' : '#a24bff';
                    ctx.fillRect(c.x * width - hw / 2, c.y * height - hh / 2, hw, hh);
                    ctx.strokeRect(c.x * width - hw / 2, c.y * height - hh / 2, hw, hh);
                });
            }
            updateLabels();
        }
        function refresh(geometryChanged = true) {
            if (geometryChanged) { result = calculate(q, boxes); moved = {}; }
            reviewed = false;
            status.textContent = 'Needs review - demonstration only; no real detection has run.';
            document.getElementById('area-demo-coverage').textContent = result.percent.toFixed(2) + '%';
            document.getElementById('area-demo-count').textContent = result.hardCount + ' Hard Coral + ' + (10 - result.hardCount) + ' unclassified remainder';
            document.getElementById('area-demo-formula').textContent =
                'Accepted box union / quadrat interior = ' + result.percent.toFixed(2) + '%. ' +
                'Representative allocation: ' + result.hardCount + '/10; marker counts do not change this raw area estimate.';
            document.getElementById('area-demo-marker-list').textContent = result.points.map((p, i) =>
                (i + 1) + ': ' + (p.hard ? 'Hard Coral region' : 'Unclassified remainder')).join(' | ');
            draw();
        }
        function fields() {
            if (target.startsWith('box:') && !selectedRect()) target = 'quadrat';
            targetSelect.replaceChildren();
            [['quadrat', 'Quadrat interior'], ...boxes.map((_, i) => ['box:' + i, 'Hard Coral box ' + (i + 1)]), ['markers', 'Representative + markers']]
                .forEach(([value, text]) => { const option = document.createElement('option'); option.value = value; option.textContent = text; targetSelect.append(option); });
            targetSelect.value = target;
            editor.replaceChildren();
            [{ title: 'Quadrat interior', box: q }, ...boxes.map((box, i) => ({ title: 'Hard Coral box ' + (i + 1), box, index: i }))]
                .forEach(({ title, box, index }) => {
                    const fieldset = document.createElement('fieldset'), legend = document.createElement('legend');
                    legend.textContent = title; fieldset.append(legend);
                    ['x', 'y', 'w', 'h'].forEach(key => {
                        const label = document.createElement('label');
                        label.textContent = ({ x: 'Left', y: 'Top', w: 'Width', h: 'Height' })[key] + ' (%)';
                        const input = document.createElement('input'); input.type = 'number'; input.min = key === 'w' || key === 'h' ? '0.1' : '0';
                        input.max = '100'; input.step = '0.1'; input.value = (box[key] * 100).toFixed(1);
                        input.addEventListener('change', () => {
                            const n = input.valueAsNumber;
                            if (!Number.isFinite(n) || !input.checkValidity()) { input.reportValidity(); return; }
                            box[key] = n / 100;
                            if (index === undefined && squareLock.checked) {
                                const size = imageSize();
                                if (key === 'w' || key === 'h') {
                                    const maximum = Math.min((1 - box.x) * size.width, (1 - box.y) * size.height);
                                    const side = clamp(key === 'w' ? box.w * size.width : box.h * size.height,
                                        Math.min(Math.max(size.width, size.height) * .001, maximum), maximum);
                                    box.w = side / size.width; box.h = side / size.height;
                                } else {
                                    box.x = clamp(box.x, 0, 1 - box.w); box.y = clamp(box.y, 0, 1 - box.h);
                                }
                            }
                            box.x = clamp(box.x, 0, .999); box.y = clamp(box.y, 0, .999);
                            box.w = clamp(box.w, .001, 1 - box.x); box.h = clamp(box.h, .001, 1 - box.y);
                            fields(); refresh();
                        });
                        label.append(input); fieldset.append(label);
                    });
                    if (index !== undefined) {
                        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove box';
                        remove.addEventListener('click', () => { boxes.splice(index, 1); fields(); refresh(); }); fieldset.append(remove);
                        const area = document.createElement('p');
                        area.textContent = 'Area inside quadrat: ' + boxAreaPercent(q, box).toFixed(2) + '%';
                        area.className = 'area-demo-box-area'; fieldset.append(area);
                    }
                    editor.append(fieldset);
                });
        }
        function preset(percent) {
            boxDrag = null; dragIndex = -1;
            q = { x: .1, y: .1, w: .8, h: .8 };
            if (squareLock.checked) { const size = imageSize(); q = squareRect(q, size.width, size.height); }
            boxes = percent === 0 ? [] : [{ x: q.x, y: q.y, w: q.w * percent / 100, h: q.h }];
            fields(); refresh();
        }
        function setFile(next) {
            if (file === next) return;
            boxDrag = null; dragIndex = -1;
            labelPreferences = {}; selectedLabel = null;
            imageStates.set(file, { q, boxes, moved, reviewed });
            file = next; image = null; const token = ++loadToken;
            photoName.textContent = next ? next.name : 'No image selected - geometry illustration';
            const previous = imageStates.get(next);
            if (previous) {
                q = previous.q; boxes = previous.boxes;
                fields(); refresh(); moved = previous.moved; reviewed = previous.reviewed;
                if (reviewed) status.textContent = 'Demo reviewed. Preview only - no result has been saved.';
                draw();
            } else preset(55);
            if (!next) {
                canvas.width = 900; canvas.height = 600;
                if (squareLock.checked) { q = squareRect(q, 900, 600); fields(); refresh(); } else draw();
                return;
            }
            const url = URL.createObjectURL(next), img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url); if (token !== loadToken) return;
                image = img; canvas.width = Math.min(1200, img.naturalWidth);
                canvas.height = Math.max(1, Math.round(canvas.width * img.naturalHeight / img.naturalWidth));
                if (squareLock.checked) { q = squareRect(q, img.naturalWidth, img.naturalHeight); fields(); refresh(); } else draw();
            };
            img.onerror = () => {
                URL.revokeObjectURL(url); if (token !== loadToken) return;
                status.textContent = 'Image could not be loaded. Choose another image; no detection was performed.';
            };
            img.src = url;
        }
        targetSelect.addEventListener('change', () => { target = targetSelect.value; selectedLabel = null; boxDrag = null; dragIndex = -1; draw(); });
        function makeSquare() {
            boxDrag = null; dragIndex = -1;
            const size = imageSize(); q = squareRect(q, size.width, size.height);
            target = 'quadrat'; fields(); refresh();
        }
        document.getElementById('area-demo-make-square').addEventListener('click', () => { squareLock.checked = true; makeSquare(); });
        squareLock.addEventListener('change', () => { if (squareLock.checked) makeSquare(); });
        panel.querySelectorAll('[data-area-preset]').forEach(button => button.addEventListener('click', () => preset(Number(button.dataset.areaPreset))));
        document.getElementById('area-demo-add').addEventListener('click', () => {
            if (boxes.length >= 20) { status.textContent = 'Demo limit: 20 boxes.'; return; }
            boxes.push({ x: q.x + q.w * .65, y: q.y + q.h * .2, w: q.w * .2, h: q.h * .2 }); fields(); refresh();
        });
        ['boxes', 'points', 'overlaps', 'area-labels'].forEach(name => document.getElementById('area-demo-show-' + name).addEventListener('change', () => draw()));
        ['quadrat', 'boxes'].forEach(name => document.getElementById('area-demo-fill-' + name).addEventListener('change', draw));
        // Hiding overlays does not alter geometry or approval.
        document.getElementById('area-demo-approve').addEventListener('click', () => {
            reviewed = true; status.textContent = 'Demo reviewed. Preview only - no result has been saved.';
        });
        function position(event) {
            const bounds = canvas.getBoundingClientRect();
            return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
        }
        canvas.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            if (boxDrag || dragIndex >= 0) return;
            const point = position(event);
            const handle = boxHit(point);
            if (handle) {
                event.preventDefault();
                boxDrag = { rect: selectedRect(), initial: {...selectedRect()}, start: point, handle, pointer: event.pointerId };
                canvas.setPointerCapture(event.pointerId); return;
            }
            if (target !== 'markers') return;
            if (!document.getElementById('area-demo-show-points').checked) return;
            const bounds = canvas.getBoundingClientRect();
            dragIndex = result.points.findIndex((p, i) => {
                const at = moved[i] || p;
                return Math.hypot((at.x - point.x) * bounds.width, (at.y - point.y) * bounds.height) < 18;
            });
            if (dragIndex >= 0) canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener('pointermove', event => {
            const p = position(event);
            if (boxDrag) {
                if (event.pointerId !== boxDrag.pointer) return;
                const size = imageSize();
                const next = boxDrag.rect === q && squareLock.checked
                    ? resizeSquare(boxDrag.initial, boxDrag.handle, p.x - boxDrag.start.x, p.y - boxDrag.start.y, size.width, size.height)
                    : transformRect(boxDrag.initial, boxDrag.handle, p.x - boxDrag.start.x, p.y - boxDrag.start.y);
                Object.assign(boxDrag.rect, next);
                fields(); refresh(); return;
            }
            if (dragIndex < 0) {
                const hit = boxHit(p);
                canvas.style.cursor = hit === 'move' ? 'move' : hit ? (hit === 'nw' || hit === 'se' ? 'nwse-resize' : 'nesw-resize') : target === 'markers' ? 'grab' : 'default';
                return;
            }
            const hard = boxes.some(b => contains(b, p.x, p.y));
            if (!contains(q, p.x, p.y) || hard !== result.points[dragIndex].hard) return;
            moved[dragIndex] = p; reviewed = false;
            status.textContent = 'Marker moved; raw coverage unchanged. Review the demonstration again.'; draw();
        });
        const endDrag = () => { dragIndex = -1; boxDrag = null; canvas.style.cursor = 'default'; };
        canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
        canvas.addEventListener('lostpointercapture', endDrag);
        canvas.addEventListener('focus', draw); canvas.addEventListener('blur', draw);
        canvas.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault();
            if (!event.shiftKey) {
                selectedMarker = (selectedMarker + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 9 : 1)) % 10;
                status.textContent = 'Selected marker ' + (selectedMarker + 1) + '. Shift+arrow moves it within its region.';
            } else {
                const old = moved[selectedMarker] || result.points[selectedMarker];
                const next = { x: old.x + (event.key === 'ArrowRight' ? .005 : event.key === 'ArrowLeft' ? -.005 : 0),
                    y: old.y + (event.key === 'ArrowDown' ? .005 : event.key === 'ArrowUp' ? -.005 : 0) };
                if (contains(q, next.x, next.y) && boxes.some(b => contains(b, next.x, next.y)) === result.points[selectedMarker].hard) {
                    // Moved coordinates keep the original point's region membership.
                    moved[selectedMarker] = { ...next, hard: result.points[selectedMarker].hard };
                    reviewed = false; status.textContent = 'Marker moved; raw coverage unchanged. Review the demonstration again.';
                }
            }
            draw();
        });
        const picker = document.getElementById('area-demo-files');
        const imageSelect = document.getElementById('area-demo-image');
        let selectedFiles = [];
        function rebuildImageSelect() {
            imageSelect.replaceChildren();
            const placeholder = document.createElement('option');
            placeholder.value = ''; placeholder.textContent = 'Geometry illustration (no photograph)'; imageSelect.append(placeholder);
            selectedFiles.forEach((photo, i) => {
                const option = document.createElement('option'); option.value = String(i); option.textContent = photo.name;
                imageSelect.append(option);
            });
            imageSelect.value = selectedFiles.length ? '0' : '';
            setFile(selectedFiles[0] || null);
        }
        picker.addEventListener('change', () => {
            selectedFiles = Array.from(picker.files || []).filter(photo => /^image\/(jpeg|png|webp)$/.test(photo.type));
            imageStates.clear(); rebuildImageSelect();
            if (picker.files.length && !selectedFiles.length) status.textContent = 'Choose JPEG, PNG, or WebP images.';
        });
        imageSelect.addEventListener('change', () => {
            setFile(imageSelect.value === '' ? null : selectedFiles[Number(imageSelect.value)] || null);
        });
        document.getElementById('area-demo-clear').addEventListener('click', () => {
            selectedFiles = []; picker.value = ''; imageStates.clear(); rebuildImageSelect();
            imageStates.clear(); preset(55);
        });
        root.CoralAreaDemo = { setFile };
        preset(55);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => draw()).observe(canvas);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : globalThis);
