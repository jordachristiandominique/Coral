const initializeBatchDetail = function () {
    if (window.lucide) {
        window.lucide.createIcons();
    }

    const canvasBlocks = Array.from(document.querySelectorAll('.batch-image-canvas'));
    const overlayToggle = document.getElementById('overlay-toggle');
    const batchImagesCard = document.querySelector('.batch-images-card');

    // The quadrat box and numbered points are now rendered into the image
    // server-side (see accounts/image_annotator.py), so no canvas overlay is
    // drawn here. The toggle swaps between the annotated and original photo.
    if (overlayToggle) {
        const syncToggle = function () {
            const showOverlay = overlayToggle.checked;
            canvasBlocks.forEach(function (block) {
                const img = block.querySelector('img');
                if (!img) {
                    return;
                }
                const target = showOverlay
                    ? img.getAttribute('data-annotated-src')
                    : img.getAttribute('data-plain-src');
                if (target && img.getAttribute('src') !== target) {
                    img.setAttribute('src', target);
                }
            });
            if (batchImagesCard) {
                batchImagesCard.classList.toggle('hide-overlays', !showOverlay);
            }
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
