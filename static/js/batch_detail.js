const initializeBatchDetail = function () {
    if (window.lucide) {
        window.lucide.createIcons();
    }

    const canvasBlocks = Array.from(document.querySelectorAll('.batch-image-canvas'));
    const overlayToggle = document.getElementById('overlay-toggle');
    const codeToggle = document.getElementById('code-toggle');
    const batchImagesCard = document.querySelector('.batch-images-card');

    // The quadrat box and point markers are rendered into the image server-side
    // (see accounts/image_annotator.py), so no canvas overlay is drawn here.
    // The toggles pick which rendered variant each photo shows:
    //   overlay off                 -> plain photo (no markers)
    //   overlay on + codes off      -> numbered points (1, 2, 3...)
    //   overlay on + codes on       -> benthic substrate codes (HC, MA...)
    if (overlayToggle) {
        const syncToggle = function () {
            const showOverlay = overlayToggle.checked;
            const showCodes = codeToggle ? codeToggle.checked : false;

            // Codes only make sense with the overlay on.
            if (codeToggle) {
                codeToggle.disabled = !showOverlay;
            }

            canvasBlocks.forEach(function (block) {
                const img = block.querySelector('img');
                if (!img) {
                    return;
                }
                let target;
                if (!showOverlay) {
                    target = img.getAttribute('data-plain-src');
                } else if (showCodes) {
                    target = img.getAttribute('data-code-src');
                } else {
                    target = img.getAttribute('data-annotated-src');
                }
                if (target && img.getAttribute('src') !== target) {
                    img.setAttribute('src', target);
                }
            });
            if (batchImagesCard) {
                batchImagesCard.classList.toggle('hide-overlays', !showOverlay);
            }
        };

        overlayToggle.addEventListener('change', syncToggle);
        if (codeToggle) {
            codeToggle.addEventListener('change', syncToggle);
        }
        syncToggle();
    }

    // ---- Transect-tabbed image viewer ----
    // Each transect is its own panel with an independent single-image viewer,
    // so a site with many images stays compact and organized by transect.
    const panels = Array.from(document.querySelectorAll('.transect-panel'));
    const tabs = Array.from(document.querySelectorAll('.transect-tab'));

    // Wire one panel's image viewer (thumbs + prev/next), scoped to that panel.
    const initPanel = function (panel) {
        const cards = Array.from(panel.querySelectorAll('.batch-image-card'));
        const thumbs = Array.from(panel.querySelectorAll('.batch-thumb'));
        const prevButtons = Array.from(panel.querySelectorAll('.image-nav-prev'));
        const nextButtons = Array.from(panel.querySelectorAll('.image-nav-next'));
        let idx = 0;

        const show = function (index) {
            if (!cards.length) {
                return;
            }
            idx = Math.max(0, Math.min(index, cards.length - 1));
            cards.forEach(function (card, i) { card.hidden = i !== idx; });
            thumbs.forEach(function (thumb, i) {
                const isActive = i === idx;
                thumb.classList.toggle('is-active', isActive);
                thumb.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        };

        thumbs.forEach(function (thumb) {
            thumb.addEventListener('click', function () {
                show(parseInt(thumb.getAttribute('data-image-index'), 10) || 0);
            });
        });
        prevButtons.forEach(function (btn) {
            btn.addEventListener('click', function () { show(idx - 1); });
        });
        nextButtons.forEach(function (btn) {
            btn.addEventListener('click', function () { show(idx + 1); });
        });

        panel._show = show;
        panel._getIdx = function () { return idx; };
        show(0);
    };

    panels.forEach(initPanel);

    let activePanel = 0;
    const showPanel = function (index) {
        if (!panels.length) {
            return;
        }
        activePanel = Math.max(0, Math.min(index, panels.length - 1));
        panels.forEach(function (panel, i) { panel.hidden = i !== activePanel; });
        tabs.forEach(function (tab, i) {
            const isActive = i === activePanel;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    };

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            showPanel(parseInt(tab.getAttribute('data-transect-index'), 10) || 0);
        });
    });

    if (panels.length) {
        showPanel(0);

        // Arrow keys move between images in the active transect (ignored while
        // typing in the edit form).
        document.addEventListener('keydown', function (event) {
            const tag = (event.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') {
                return;
            }
            const panel = panels[activePanel];
            if (!panel || !panel._show) {
                return;
            }
            if (event.key === 'ArrowLeft') {
                panel._show(panel._getIdx() - 1);
            } else if (event.key === 'ArrowRight') {
                panel._show(panel._getIdx() + 1);
            }
        });
    }

};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBatchDetail);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeBatchDetail();
}
