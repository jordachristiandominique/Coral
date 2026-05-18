const initializeBatchDetail = function () {
    if (window.lucide) {
        window.lucide.createIcons();
    }

    const canvasBlocks = Array.from(document.querySelectorAll('.batch-image-canvas'));
    const overlayToggle = document.getElementById('overlay-toggle');
    const batchImagesCard = document.querySelector('.batch-images-card');

    const parseJsonScript = function (id) {
        const script = document.getElementById(id);
        if (!script) {
            return null;
        }
        try {
            return JSON.parse(script.textContent);
        } catch (error) {
            return null;
        }
    };

    const drawOverlay = function (canvas, rect, points) {
        if (!canvas || !rect) {
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const rectPx = {
            x: rect.x * width,
            y: rect.y * height,
            w: rect.w * width,
            h: rect.h * height
        };

        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 2;
        ctx.strokeRect(rectPx.x, rectPx.y, rectPx.w, rectPx.h);

        if (Array.isArray(points)) {
            ctx.strokeStyle = '#e53b2c';
            ctx.lineWidth = 2;
            points.forEach(function (point) {
                const x = rectPx.x + point.x * rectPx.w;
                const y = rectPx.y + point.y * rectPx.h;
                ctx.beginPath();
                ctx.moveTo(x - 6, y);
                ctx.lineTo(x + 6, y);
                ctx.moveTo(x, y - 6);
                ctx.lineTo(x, y + 6);
                ctx.stroke();
            });
        }
    };

    const renderBlock = function (block) {
        const rectId = block.getAttribute('data-rect-id');
        const pointsId = block.getAttribute('data-points-id');
        const rect = rectId ? parseJsonScript(rectId) : null;
        const points = pointsId ? parseJsonScript(pointsId) : null;
        const canvas = block.querySelector('canvas');
        const img = block.querySelector('img');

        const render = function () {
            drawOverlay(canvas, rect, points);
        };

        if (img && !img.complete) {
            img.addEventListener('load', render);
        } else {
            render();
        }
    };

    const renderAll = function () {
        canvasBlocks.forEach(renderBlock);
    };

    renderAll();
    window.addEventListener('resize', renderAll);

    if (overlayToggle && batchImagesCard) {
        const syncToggle = function () {
            batchImagesCard.classList.toggle('hide-overlays', !overlayToggle.checked);
        };

        overlayToggle.addEventListener('change', syncToggle);
        syncToggle();
    }

};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBatchDetail);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeBatchDetail();
}
