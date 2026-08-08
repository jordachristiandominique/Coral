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

    // ---- Single-image viewer ----
    // Only one image card is visible at a time, so a batch with many images
    // never turns the page into a long scroll.
    const imageCards = Array.from(document.querySelectorAll('.batch-image-card'));
    const thumbs = Array.from(document.querySelectorAll('.batch-thumb'));
    // Prev/next arrows are overlaid on each image (one static set per card),
    // so the counter text and disabled state are rendered server-side per card.
    // JS only needs to switch which card is visible.
    const prevButtons = Array.from(document.querySelectorAll('.image-nav-prev'));
    const nextButtons = Array.from(document.querySelectorAll('.image-nav-next'));
    let activeIndex = 0;

    const showImage = function (index) {
        if (!imageCards.length) {
            return;
        }
        activeIndex = Math.max(0, Math.min(index, imageCards.length - 1));

        imageCards.forEach(function (card, i) {
            card.hidden = i !== activeIndex;
        });
        thumbs.forEach(function (thumb, i) {
            const isActive = i === activeIndex;
            thumb.classList.toggle('is-active', isActive);
            thumb.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    };

    if (imageCards.length) {
        thumbs.forEach(function (thumb) {
            thumb.addEventListener('click', function () {
                showImage(parseInt(thumb.getAttribute('data-image-index'), 10) || 0);
            });
        });
        prevButtons.forEach(function (btn) {
            btn.addEventListener('click', function () { showImage(activeIndex - 1); });
        });
        nextButtons.forEach(function (btn) {
            btn.addEventListener('click', function () { showImage(activeIndex + 1); });
        });

        // Arrow keys move between images (ignored while typing in the edit form)
        document.addEventListener('keydown', function (event) {
            const tag = (event.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                return;
            }
            if (event.key === 'ArrowLeft') {
                showImage(activeIndex - 1);
            } else if (event.key === 'ArrowRight') {
                showImage(activeIndex + 1);
            }
        });

        showImage(0);
    }

};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBatchDetail);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeBatchDetail();
}
