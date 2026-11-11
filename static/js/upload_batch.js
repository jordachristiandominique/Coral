const initializeUploadBatch = function () {
    document.body.classList.add('page-researcher-dashboard');

    if (window.lucide) {
        window.lucide.createIcons();
    }

    const mapElement = document.getElementById('upload-batch-map');
    const latInput = document.getElementById('latitude');
    const lngInput = document.getElementById('longitude');
    const selectOnMapButton = document.getElementById('map-select-btn');
    const surveyPointsScript = document.getElementById('survey-points-data');
    let map;
    let pin;

    if (mapElement && typeof L !== 'undefined') {
        map = L.map(mapElement, {
            zoomControl: true,
            scrollWheelZoom: false
        }).setView([7.01, 125.78], 9);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'
        }).addTo(map);

        // updateInputs=false when the change came from the user typing, so we
        // don't overwrite/reformat the field mid-keystroke.
        const setPin = function (latlng, updateInputs) {
            if (!pin) {
                pin = L.marker(latlng).addTo(map);
            } else {
                pin.setLatLng(latlng);
            }

            if (updateInputs === false) {
                return;
            }

            if (latInput) {
                latInput.value = latlng.lat.toFixed(4);
            }
            if (lngInput) {
                lngInput.value = latlng.lng.toFixed(4);
            }
        };

        map.on('click', function (event) {
            setPin(event.latlng);
        });

        const parseCoord = function (raw) {
            const trimmed = String(raw == null ? '' : raw).trim();
            if (!trimmed) {
                return null;
            }
            const num = Number(trimmed);
            return Number.isFinite(num) ? num : null;
        };

        // Typing coordinates plots/moves the pin (the other half of the two-way
        // bind). `recenter` zooms in when the value is committed (blur/change);
        // while typing it just follows so the pin stays visible.
        const movePinToInputs = function (recenter) {
            if (!latInput || !lngInput) {
                return;
            }

            const lat = parseCoord(latInput.value);
            const lng = parseCoord(lngInput.value);
            // Ignore partial/invalid entries such as "", "-" or "7." while typing
            if (lat === null || lng === null) {
                return;
            }
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return;
            }

            const latlng = L.latLng(lat, lng);
            setPin(latlng, false);

            if (recenter) {
                map.setView(latlng, Math.max(map.getZoom(), 13));
            } else {
                map.panTo(latlng, { animate: true });
            }
        };

        [latInput, lngInput].forEach(function (input) {
            if (!input) {
                return;
            }
            input.addEventListener('input', function () { movePinToInputs(false); });
            input.addEventListener('change', function () { movePinToInputs(true); });
        });

        if (surveyPointsScript) {
            try {
                const surveyPoints = JSON.parse(surveyPointsScript.textContent || '[]');
                surveyPoints.forEach(function (point) {
                    if (point.latitude === null || point.longitude === null) {
                        return;
                    }

                    const marker = L.circleMarker([Number(point.latitude), Number(point.longitude)], {
                        radius: 5,
                        color: '#2a8793',
                        weight: 2,
                        fillColor: '#a6d6dc',
                        fillOpacity: 0.8
                    }).addTo(map);

                    const nameParts = [point.user__first_name, point.user__last_name].filter(Boolean);
                    const researcherName = nameParts.length ? nameParts.join(' ') : point.user__username;
                    const dateLabel = point.survey_date ? `Survey date: ${point.survey_date}` : null;
                    const surveyorLabel = point.surveyor_names ? `Survey by: ${point.surveyor_names}` : null;
                    const researcherLabel = researcherName ? `Uploaded by: ${researcherName}` : null;
                    const title = point.name || 'Survey location';
                    const lines = [title, dateLabel, surveyorLabel, researcherLabel].filter(Boolean).join('<br>');
                    marker.bindPopup(lines);
                });
            } catch (error) {
                // Ignore malformed survey data.
            }
        }

        if (selectOnMapButton) {
            selectOnMapButton.addEventListener('click', function () {
                mapElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }

        // Highlight the site's already-saved transects (append mode) so the
        // surveyor sees the area already covered while placing the new pin.
        const existingLatLngs = [];
        const activeTransectsScript = document.getElementById('active-transects-data');
        if (activeTransectsScript) {
            try {
                const transects = JSON.parse(activeTransectsScript.textContent || '[]');
                transects.forEach(function (t) {
                    if (t.latitude === null || t.longitude === null) {
                        return;
                    }
                    const latlng = L.latLng(Number(t.latitude), Number(t.longitude));
                    existingLatLngs.push(latlng);
                    L.circleMarker(latlng, {
                        radius: 8,
                        color: '#ffffff',
                        weight: 2,
                        fillColor: '#1c5f6d',
                        fillOpacity: 0.95
                    })
                        .addTo(map)
                        .bindTooltip('T' + t.number, {
                            permanent: true,
                            direction: 'top',
                            className: 'transect-map-label',
                            offset: [0, -6]
                        })
                        .bindPopup('<strong>' + (t.label || ('Transect ' + t.number)) + '</strong><br>'
                            + latlng.lat.toFixed(5) + ', ' + latlng.lng.toFixed(5));
                });
            } catch (error) {
                // Ignore malformed transect data.
            }
        }

        // Start the pin on the prefilled coordinates (e.g. the previous
        // transect when adding another), falling back to the Davao Gulf default.
        const initialLat = latInput ? parseCoord(latInput.value) : null;
        const initialLng = lngInput ? parseCoord(lngInput.value) : null;
        if (initialLat !== null && initialLng !== null) {
            const start = L.latLng(initialLat, initialLng);
            setPin(start, false);
            // Frame the new pin together with the existing transects when present.
            if (existingLatLngs.length) {
                map.fitBounds(L.latLngBounds(existingLatLngs.concat([start])), {
                    padding: [40, 40],
                    maxZoom: 14
                });
            } else {
                map.setView(start, 12);
            }
        } else {
            setPin({ lat: 7.0731, lng: 125.6128 });
        }

        // The map card can be laid out after init (inside cards/tabs); recompute
        // its size so tiles and the pin position render correctly.
        setTimeout(function () { map.invalidateSize(); }, 200);
    }

    const dropzone = document.getElementById('dropzone');
    const uploadInput = document.getElementById('upload-input');
    const chooseImagesButton = document.getElementById('choose-images-btn');
    const thumbGrid = document.getElementById('thumb-grid');
    const initialThumbMarkup = thumbGrid ? thumbGrid.innerHTML : '';
    const quadratWrap = document.getElementById('quadrat-canvas-wrap');
    const quadratImage = document.getElementById('quadrat-image');
    const quadratCanvas = document.getElementById('quadrat-canvas');
    const quadratEmpty = document.getElementById('quadrat-empty');
    const quadratImageLabel = document.getElementById('quadrat-image-label');
    const quadratPointsCount = document.getElementById('quadrat-points-count');
    const imagePrevBtn = document.getElementById('image-prev-btn');
    const imageNextBtn = document.getElementById('image-next-btn');
    const imageNavCounter = document.getElementById('image-nav-counter');
    const imageLoupe = document.getElementById('image-loupe');
    const fsBtn = document.getElementById('quadrat-fs-btn');
    const processOpenBtn = document.getElementById('process-open-btn');
    const analyzeAllBtn = document.getElementById('analyze-all-btn');
    const analyzeHint = document.getElementById('analyze-hint');
    const analyzeModal = document.getElementById('analyze-modal');
    const analyzeStatus = document.getElementById('analyze-status');
    const analyzeProgressFill = document.getElementById('analyze-progress-fill');
    const analyzeProgressText = document.getElementById('analyze-progress-text');
    const analyzeProgressList = document.getElementById('analyze-progress-list');
    const analyzeCloseBtn = document.getElementById('analyze-close-btn');
    const analyzeCancelBtn = document.getElementById('analyze-cancel-btn');
    const analyzeMinimizeBtn = document.getElementById('analyze-minimize-btn');
    const analyzeRestoreBtn = document.getElementById('analyze-restore-btn');
    const analyzeConfirmModal = document.getElementById('analyze-confirm-modal');
    const analyzeConfirmCancel = document.getElementById('analyze-confirm-cancel');
    const analyzeConfirmAccept = document.getElementById('analyze-confirm-accept');
    const submitHint = document.getElementById('submit-hint');
    const uploadForm = document.getElementById('upload-batch-form');
    const Analysis = window.UploadBatchAnalysis;
    const Editor = window.UploadBatchReview;
    let reviewTool = 'hand';
    let reviewDrag = null;
    const syncReviewCursor = function () {
        if (!quadratCanvas) return;
        quadratCanvas.style.cursor = ['hand', 'markers', 'quadrat'].includes(reviewTool)
            ? reviewDrag ? 'grabbing' : 'grab' : 'crosshair';
    };
    if (!Analysis || !Editor) throw new Error('Image review tools did not load. Reload the page.');
    const analysisErrors = {};
    const retryAnalysisBtn = document.getElementById('retry-analysis-btn');
    const detectionReview = document.getElementById('detection-review');
    const contextMenu = document.getElementById('review-context-menu');
    const contextClassButtons = contextMenu.querySelectorAll('[data-review-class]');
    const showMarkers = document.getElementById('show-review-markers');
    const showFill = document.getElementById('show-review-fill');
    const showEstimatedArea = document.getElementById('show-estimated-area');
    const squareLock = document.getElementById('review-square-lock');
    const showDetectionBoxes = document.getElementById('show-detection-boxes');
    const reviewFeedback = document.getElementById('review-feedback');
    const quadratInputs = document.getElementById('quadrat-inputs');
    const markerSummary = document.getElementById('representative-summary');
    const batchNameInput = document.getElementById('batch-name');
    const surveyDateInput = document.getElementById('survey-date');
    const areaNameInput = document.getElementById('area-name');
    const surveyorNamesInput = document.getElementById('surveyor-names');
    const summaryBatch = document.getElementById('summary-batch');
    const summarySurveyors = document.getElementById('summary-surveyors');
    const summaryLocation = document.getElementById('summary-location');
    const summaryImages = document.getElementById('summary-images');
    const summaryCoverage = document.getElementById('summary-coverage');
    const summaryClass = document.getElementById('summary-class');

    const setTodayIfEmpty = function () {
        if (!surveyDateInput || surveyDateInput.value) {
            return;
        }

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        surveyDateInput.value = `${yyyy}-${mm}-${dd}`;
    };

    const selectedFiles = [];
    const thumbUrlByKey = {};
    // True once the form is actually being saved, so the beforeunload guard
    // doesn't prompt on the normal post-save redirect.
    let isSubmitting = false;
    // This page builds ONE transect per submit; every selected image belongs to
    // it. The transect label (folder name) is sent via the hidden #transect-label-input.
    const transectLabelInput = document.getElementById('transect-label-input');
    const setTransectLabel = function (label) {
        if (transectLabelInput && label) { transectLabelInput.value = label; }
    };
    // Quadrat edit affordances: corner grab tolerance (px) and smallest box.
    const HANDLE_SIZE = 10;
    const MIN_RECT_SIZE = 24;
    // Category thresholds match accounts/models.py.
const COVERAGE_CLASS_LABELS = {
    A: 'HCC more than 44%',
    B: 'HCC more than 33% up to 44%',
    C: 'HCC more than 22% up to 33%',
    D: 'HCC 0-22%'
};
const describeCoverageClass = function (code) {
    return COVERAGE_CLASS_LABELS[code] || 'Awaiting analysis';
};
    let activeFileIndex = 0;
    let activeImageUrl = null;
    // Index of the point currently zoomed/highlighted in the fullscreen view
    // (-1 = none). Declared here so drawQuadratAndPoints can highlight it.
    let zoomedPointIndex = -1;
    let imageZoom = { scale: 1, x: 0, y: 0 };
    let aiResultsByFileKey = {};
    let isAnalyzing = false;
    let analysisController = null;
    // Quadrat editing (drag corners to resize / drag inside to move) after analysis.
    let isDraggingQuadrat = false;

    const formatFileSize = function (sizeInBytes) {
        const sizeInMb = sizeInBytes / (1024 * 1024);
        if (sizeInMb >= 1) {
            return `${sizeInMb.toFixed(1)} MB`;
        }
        const sizeInKb = sizeInBytes / 1024;
        return `${Math.max(sizeInKb, 0.1).toFixed(1)} KB`;
    };

    const updateSummary = function () {
        if (summaryBatch) {
            const nameValue = batchNameInput ? batchNameInput.value.trim() : '';
            const dateValue = surveyDateInput ? surveyDateInput.value.trim() : '';
            const parts = [nameValue, dateValue].filter(Boolean);
            summaryBatch.textContent = parts.length ? parts.join(' - ') : 'Not set';
        }

        if (summarySurveyors) {
            const surveyorsValue = surveyorNamesInput ? surveyorNamesInput.value.trim() : '';
            summarySurveyors.textContent = surveyorsValue || 'Not set';
        }

        if (summaryLocation) {
            const latValue = latInput ? latInput.value.trim() : '';
            const lngValue = lngInput ? lngInput.value.trim() : '';
            const location = latValue && lngValue ? `${latValue}, ${lngValue}` : 'Not set';
            summaryLocation.textContent = location;
        }

        if (summaryImages) {
            if (!selectedFiles.length) {
                summaryImages.textContent = 'No files selected';
            } else {
                const totalBytes = selectedFiles.reduce(function (sum, file) {
                    return sum + file.size;
                }, 0);
                summaryImages.textContent = `${selectedFiles.length} file(s) (${formatFileSize(totalBytes)} total)`;
            }
        }

        // Equal ten-point reviewed images yield the same mean image HCC as the server.
        if (summaryCoverage && summaryClass) {
            const t = computeTransectCoverage();
            const reviewCount = t.imgCount;
            const summaryReview = document.getElementById('summary-review');
            if (summaryReview) summaryReview.textContent = `${reviewCount}/${selectedFiles.length} images ready`;
            if (!t.total || reviewCount !== selectedFiles.length) {
                summaryCoverage.textContent = '--';
                summaryClass.textContent = 'Pending';
                summaryClass.className = 'summary-class-badge class-pending';
            } else {
                const coral = t.hc, total = t.total, pct = t.pct, code = t.code;
                summaryCoverage.textContent = `${pct}% (${coral} of ${total} hard coral points)`;
                summaryClass.textContent = `Category ${code}`;
                summaryClass.className = `summary-class-badge class-${code.toLowerCase()}`;
            }
        }
    };

    const escapeHtml = function (value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const getFileKey = function (file) {
        return `${file.name}-${file.size}-${file.lastModified}`;
    };

    const getThumbUrl = function (fileKey, file) {
        if (!thumbUrlByKey[fileKey]) {
            thumbUrlByKey[fileKey] = URL.createObjectURL(file);
        }
        return thumbUrlByKey[fileKey];
    };

    const pruneThumbUrls = function () {
        const activeKeys = new Set(selectedFiles.map(function (file) {
            return getFileKey(file);
        }));

        Object.keys(thumbUrlByKey).forEach(function (key) {
            if (!activeKeys.has(key)) {
                URL.revokeObjectURL(thumbUrlByKey[key]);
                delete thumbUrlByKey[key];
            }
        });
    };

    const getActiveFile = function () {
        return selectedFiles[activeFileIndex] || null;
    };

    const setActiveFileIndex = function (index) {
        // Any image change clears the point zoom (instantly, so the new image
        // never inherits a lingering transform) and refreshes the stepper label.
        resetPointZoom(true);
        closeContextMenu();
        if (!selectedFiles.length) {
            activeFileIndex = 0;
            updateQuadratPreview();
            return;
        }

        activeFileIndex = Math.max(0, Math.min(index, selectedFiles.length - 1));
        updateThumbActiveState();
        updateQuadratPreview();
        renderMarkerSummary();
        updatePointNavLabel();
    };

    const isReadyToAnalyze = function () {
        return !isAnalyzing && !reviewDrag && selectedFiles.length > 0 && selectedFiles.every(file =>
            Analysis.complete(aiResultsByFileKey[getFileKey(file)]) && !analysisErrors[getFileKey(file)]);
    };

    const isReadyForAutoAnalyze = function () {
        // AI analysis is ready when we have at least one image uploaded
        return selectedFiles.length > 0;
    };

    const updateAnalyzeState = function () {
        if (!analyzeAllBtn) {
            return;
        }

        const ready = isReadyForAutoAnalyze();
        const enabled = ready && !isAnalyzing;
        analyzeAllBtn.disabled = !enabled;
        analyzeAllBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');

        if (analyzeHint) {
            analyzeHint.textContent = ready
                ? 'Run detection, then verify the quadrat, coral boxes, and representative markers.'
                : 'Upload at least one image to enable AI analysis.';
        }
    };

    const updateSubmitState = function () {
        if (!processOpenBtn) {
            return;
        }

        const ready = isReadyToAnalyze();
        const reanalyze = document.getElementById('reanalyze-btn');
        if (reanalyze) reanalyze.disabled = isAnalyzing || !selectedFiles.length;
        if (retryAnalysisBtn) {
            retryAnalysisBtn.hidden = !selectedFiles.some(file => analysisErrors[getFileKey(file)]);
            retryAnalysisBtn.disabled = isAnalyzing;
        }
        if (uploadInput) uploadInput.disabled = isAnalyzing;
        if (chooseImagesButton) chooseImagesButton.disabled = isAnalyzing;
        if (detectionReview) detectionReview.inert = isAnalyzing;
        if (markerSummary) markerSummary.inert = isAnalyzing;
        processOpenBtn.disabled = !ready;
        processOpenBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');

        updateAnalyzeState();

        if (submitHint) {
            if (ready) {
                submitHint.textContent = 'All images ready. Upload to save this transect and its point-based HCC.';
                submitHint.style.color = '#2a8793';
            } else {
                submitHint.textContent = 'Run detection for all images and supply any missing quadrat boundaries.';
                submitHint.style.color = '';
            }
        }
    };

    const syncQuadratInputs = function () {
        if (!quadratInputs || !isReadyToAnalyze()) return false;
        quadratInputs.innerHTML = '';
        try {
            selectedFiles.forEach(function (file, index) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = `image_quadrat_${index + 1}`;
                input.value = JSON.stringify(Analysis.payload(aiResultsByFileKey[getFileKey(file)]));
                quadratInputs.appendChild(input);
            });
            return true;
        } catch (error) {
            quadratInputs.innerHTML = '';
            return false;
        }
    };

    const updateThumbActiveState = function () {
        if (!thumbGrid) {
            return;
        }

        const cards = thumbGrid.querySelectorAll('.thumb-card[data-file-index]');
        cards.forEach(function (card) {
            const index = Number(card.getAttribute('data-file-index'));
            if (index === activeFileIndex) {
                card.classList.add('is-active');
            } else {
                card.classList.remove('is-active');
            }
        });
    };

    const syncCanvasSize = function () {
        if (!quadratCanvas || !quadratImage) {
            return;
        }

        // Use clientWidth/Height (the layout box), NOT getBoundingClientRect,
        // which would include the point-zoom CSS transform and size the canvas
        // wrong while a zoom is applied or mid-transition.
        const w = quadratImage.clientWidth;
        const h = quadratImage.clientHeight;
        if (!w || !h) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        quadratCanvas.width = w * dpr;
        quadratCanvas.height = h * dpr;
        quadratCanvas.style.width = `${w}px`;
        quadratCanvas.style.height = `${h}px`;
    };

    /**
     * Draw a representative marker: a cross (+) marker with its number
     * beside it. Both are drawn with a dark halo so they stay readable over
     * any substrate (pale sand, dark coral, bright algae).
     */
    const drawCpcePoint = function (ctx, x, y, label, options) {
        const opts = options || {};
        const arm = opts.arm || 7;             // half-length of each cross arm
        const lineWidth = opts.lineWidth || 1.5;
        const color = opts.color || '#ffffff';
        const font = opts.font || 'bold 11px "Inter", "Segoe UI", Arial, sans-serif';

        const strokeCross = function () {
            ctx.beginPath();
            ctx.moveTo(x - arm, y);
            ctx.lineTo(x + arm, y);
            ctx.moveTo(x, y - arm);
            ctx.lineTo(x, y + arm);
            ctx.stroke();
        };

        ctx.save();
        ctx.lineCap = 'butt';

        // Dark halo underneath, then the bright cross on top
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = lineWidth + 2;
        strokeCross();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        strokeCross();

        // Number label sits at the upper-right of the cross
        ctx.font = font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeText(label, x + arm + 2, y - 2);
        ctx.fillStyle = color;
        ctx.fillText(label, x + arm + 2, y - 2);

        ctx.restore();
    };

    const drawQuadratAndPoints = function (quadratBbox, points) {
        if (!quadratCanvas || !quadratImage) {
            return;
        }

        const ctx = quadratCanvas.getContext('2d');
        if (!ctx) {
            return;
        }

        const size = getCanvasSize();
        if (!size.width || !size.height) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.width, size.height);

        // Account for letterboxing: calculate actual display area of image within canvas
        const naturalWidth = quadratImage.naturalWidth;
        const naturalHeight = quadratImage.naturalHeight;
        const containerAspect = size.width / size.height;
        const imageAspect = naturalWidth / naturalHeight;

        let displayWidth, displayHeight, offsetX, offsetY;

        if (imageAspect > containerAspect) {
            // Image is wider than container - constrained by width
            displayWidth = size.width;
            displayHeight = size.width / imageAspect;
            offsetX = 0;
            offsetY = (size.height - displayHeight) / 2;
        } else {
            // Container is wider than image - constrained by height
            displayHeight = size.height;
            displayWidth = size.height * imageAspect;
            offsetX = (size.width - displayWidth) / 2;
            offsetY = 0;
        }

        const file = getActiveFile();
        const result = file ? aiResultsByFileKey[getFileKey(file)] : null;
        if (result) Editor.ensure(result);
        const rectPx = quadratBbox ? {
            x: offsetX + quadratBbox.x * displayWidth,
            y: offsetY + quadratBbox.y * displayHeight,
            w: quadratBbox.w * displayWidth,
            h: quadratBbox.h * displayHeight
        } : null;
        const clipCoralOverlay = function () {
            if (!rectPx) return;
            ctx.beginPath();
            ctx.rect(rectPx.x, rectPx.y, rectPx.w, rectPx.h);
            ctx.clip();
        };
        if (result && showDetectionBoxes.checked) {
            ctx.save();
            clipCoralOverlay();
            result.detections.forEach(function (d) {
                if (d.class_name === 'quadrat_area') return;
                const x = offsetX + d.box.x * displayWidth, y = offsetY + d.box.y * displayHeight;
                const w = d.box.w * displayWidth, h = d.box.h * displayHeight;
                if (rectPx && (x + w <= rectPx.x || y + h <= rectPx.y
                    || x >= rectPx.x + rectPx.w || y >= rectPx.y + rectPx.h)) return;
                const color = d.class_name === 'Hard Coral' ? '#b56aff' : d.class_name === 'Soft Coral' ? '#32e0bf' : '#75baff';
                ctx.save();
                if (showFill.checked && d.class_name !== 'quadrat_area') {
                    ctx.fillStyle = d.class_name === 'Hard Coral' ? 'rgba(164, 76, 255, .2)' : 'rgba(50, 224, 191, .2)';
                    ctx.fillRect(x, y, w, h);
                }
                ctx.strokeStyle = color;
                ctx.lineWidth = d.id === result.editor.selected ? 3 : 1.5;
                if (d.class_name === 'quadrat_area') ctx.setLineDash([5, 4]);
                ctx.strokeRect(x, y, w, h);
                ctx.setLineDash([]);
                let label = Editor.label(result, d.id);
                if (rectPx && showEstimatedArea.checked) {
                    const insideWidth = Math.min(x + w, rectPx.x + rectPx.w) - Math.max(x, rectPx.x);
                    const insideHeight = Math.min(y + h, rectPx.y + rectPx.h) - Math.max(y, rectPx.y);
                    const percent = insideWidth * insideHeight / (rectPx.w * rectPx.h) * 100;
                    label += ` | ~${percent.toFixed(2)}%`;
                }
                ctx.font = 'bold 11px Inter, sans-serif';
                const labelWidth = ctx.measureText(label).width + 8;
                const labelBounds = rectPx || { x: offsetX, y: offsetY, w: displayWidth, h: displayHeight };
                const labelX = Math.max(labelBounds.x, Math.min(x, labelBounds.x + labelBounds.w - labelWidth));
                const labelY = Math.max(labelBounds.y + 14, Math.min(y, labelBounds.y + labelBounds.h - 2));
                ctx.fillStyle = '#12313c'; ctx.fillRect(labelX, labelY - 14, labelWidth, 16);
                ctx.fillStyle = color; ctx.fillText(label, labelX + 4, labelY - 2);
                ctx.restore();
            });
            ctx.restore();
        }
        const selectedRect = result ? Editor.selected(result) : null;
        if (selectedRect && (result.editor.selected === 'quadrat' || showDetectionBoxes.checked)) {
            const px = { x: offsetX + selectedRect.x * displayWidth, y: offsetY + selectedRect.y * displayHeight,
                w: selectedRect.w * displayWidth, h: selectedRect.h * displayHeight };
            ctx.save();
            if (result.editor.selected !== 'quadrat') clipCoralOverlay();
            ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1c5f6d'; ctx.lineWidth = 1.5;
            Object.values(getHandles(px)).forEach(h => {
                ctx.fillRect(h.x - 5, h.y - 5, 10, 10); ctx.strokeRect(h.x - 5, h.y - 5, 10, 10);
            });
            ctx.restore();
        }
        if (!quadratBbox) return;

        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 2;
        ctx.strokeRect(rectPx.x, rectPx.y, rectPx.w, rectPx.h);

        // Draw representative cross markers with point numbers
        if (showMarkers.checked && points && points.length) {
            points.forEach(function (point, index) {
                const x = rectPx.x + point.x * rectPx.w;
                const y = rectPx.y + point.y * rectPx.h;
                // Highlight the point currently selected/zoomed in fullscreen:
                // a crisp yellow ring only (no faded fill) so the point stays
                // clearly visible.
                if (index === zoomedPointIndex) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(x, y, 13, 0, Math.PI * 2);
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = '#ffd147';
                    ctx.stroke();
                    ctx.restore();
                }
                drawCpcePoint(ctx, x, y, point.class === 'Other Substrate' ? `OS ${index + 1}` : index + 1, {
                    arm: 7,
                    color: point.class === 'Hard Coral' ? '#d5a4ff' : point.class === 'Soft Coral' ? '#60f0d1' : '#ffd147',
                    lineWidth: 1.5,
                    font: 'bold 11px "Inter", "Segoe UI", Arial, sans-serif'
                });
            });
        }
    };

    const getCanvasSize = function () {
        if (!quadratCanvas) {
            return { width: 0, height: 0 };
        }

        return {
            width: quadratCanvas.clientWidth,
            height: quadratCanvas.clientHeight
        };
    };

    const getPointerPos = function (event) {
        const bounds = quadratCanvas.getBoundingClientRect();
        // Convert the zoomed screen position back to the canvas layout coordinates.
        return {
            x: (event.clientX - bounds.left) * quadratCanvas.clientWidth / bounds.width,
            y: (event.clientY - bounds.top) * quadratCanvas.clientHeight / bounds.height
        };
    };

    const clampRect = function (rectPx, bounds) {
        let x = rectPx.x;
        let y = rectPx.y;
        let w = rectPx.w;
        let h = rectPx.h;

        if (w < 0) {
            x += w;
            w = Math.abs(w);
        }
        if (h < 0) {
            y += h;
            h = Math.abs(h);
        }

        w = Math.min(bounds.w, Math.max(w, MIN_RECT_SIZE));
        h = Math.min(bounds.h, Math.max(h, MIN_RECT_SIZE));

        const minX = bounds.x;
        const minY = bounds.y;
        const maxX = bounds.x + bounds.w;
        const maxY = bounds.y + bounds.h;

        if (x < minX) {
            x = minX;
        }
        if (y < minY) {
            y = minY;
        }
        if (x + w > maxX) {
            x = Math.max(minX, maxX - w);
        }
        if (y + h > maxY) {
            y = Math.max(minY, maxY - h);
        }

        return { x: x, y: y, w: w, h: h };
    };

    const toNormalizedRect = function (rectPx, width, height) {
        return {
            x: rectPx.x / width,
            y: rectPx.y / height,
            w: rectPx.w / width,
            h: rectPx.h / height
        };
    };

    const toPixelRect = function (rect, width, height) {
        return {
            x: rect.x * width,
            y: rect.y * height,
            w: rect.w * width,
            h: rect.h * height
        };
    };

    const getHandles = function (rectPx) {
        return {
            nw: { x: rectPx.x, y: rectPx.y },
            ne: { x: rectPx.x + rectPx.w, y: rectPx.y },
            se: { x: rectPx.x + rectPx.w, y: rectPx.y + rectPx.h },
            sw: { x: rectPx.x, y: rectPx.y + rectPx.h }
        };
    };

    const getHandleHit = function (rectPx, pos) {
        const handles = getHandles(rectPx);
        const handleKeys = Object.keys(handles);
        for (let i = 0; i < handleKeys.length; i += 1) {
            const key = handleKeys[i];
            const handle = handles[key];
            if (Math.abs(pos.x - handle.x) <= HANDLE_SIZE && Math.abs(pos.y - handle.y) <= HANDLE_SIZE) {
                return key;
            }
        }
        return null;
    };

    const isInsideRect = function (rectPx, pos) {
        return pos.x >= rectPx.x && pos.x <= rectPx.x + rectPx.w && pos.y >= rectPx.y && pos.y <= rectPx.y + rectPx.h;
    };

    const startAnalyzeAll = async function (failedOnly = false) {
        if (!analyzeAllBtn || isAnalyzing || !selectedFiles.length) return;
        const files = selectedFiles.filter(file => !failedOnly || analysisErrors[getFileKey(file)]);
        if (!files.length) return;
        isAnalyzing = true;
        analysisController = new AbortController();
        files.forEach(file => {
            delete aiResultsByFileKey[getFileKey(file)];
            delete analysisErrors[getFileKey(file)];
        });
        resetPointZoom(true);
        analyzeAllBtn.textContent = 'Detecting...';
        updateSubmitState();
        resetAnalyzeProgress();
        initAnalyzeProgressList(files);
        openAnalyzeModal();
        let failed = 0;
        let cancelled = false;
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i], key = getFileKey(file);
                // A failed re-analysis must never leave old classifications saveable.
                delete aiResultsByFileKey[key];
                delete analysisErrors[key];
                setAnalyzeProgress(i, files.length, file.name, false);
                try {
                    const csrf = uploadForm.querySelector('[name=csrfmiddlewaretoken]').value;
                    aiResultsByFileKey[key] = await Analysis.request(file, uploadForm.dataset.analyzeUrl, csrf,
                        { signal: analysisController.signal });
                    markAnalyzeItemDone(key);
                } catch (error) {
                    if (error.name === 'AbortError') {
                        cancelled = true;
                        files.slice(i).forEach(pending => {
                            const pendingKey = getFileKey(pending);
                            analysisErrors[pendingKey] = error.message;
                            markAnalyzeItemDone(pendingKey, error.message, true);
                        });
                        break;
                    }
                    failed++;
                    analysisErrors[key] = error.message;
                    markAnalyzeItemDone(key, error.message);
                }
                setAnalyzeProgress(i, files.length, '', true);
            }
        } finally {
            isAnalyzing = false;
            analysisController = null;
            analyzeCancelBtn.hidden = true;
            analyzeAllBtn.textContent = 'Re-analyze all images';
            if (analyzeStatus) analyzeStatus.textContent = cancelled
                ? 'Analysis cancelled. Retry interrupted images to continue.'
                : failed
                ? `${failed} image(s) failed. Review successful results and retry failed images.`
                : 'Detection finished. Review the boxes and representative markers before saving.';
            if (analyzeModal) {
                analyzeModal.classList.toggle('is-complete', !cancelled && failed === 0);
                analyzeModal.classList.toggle('is-error', failed > 0);
                analyzeModal.classList.toggle('is-cancelled', cancelled);
            }
            document.getElementById('analyze-title').textContent = cancelled ? 'Analysis cancelled'
                : failed ? 'Detection needs attention' : 'Ready for review';
            analyzeCloseBtn.textContent = hasAnyClassifications()
                ? 'Review Results' : 'Close';
            syncAnalyzeDock();
            if (analyzeCloseBtn) { analyzeCloseBtn.disabled = false; analyzeCloseBtn.setAttribute('aria-disabled', 'false'); }
            setActiveFileIndex(0);
            updateThumbPointsStatus();
            updateSubmitState();
            updateSummary();
        }
    };

    const runAnalyzeAll = function () {
        if (!analyzeAllBtn || isAnalyzing) {
            return;
        }

        if (!isReadyForAutoAnalyze()) {
            updateAnalyzeState();
            return;
        }

        if (hasAnyClassifications()) {
            openAnalyzeConfirm();
            return;
        }

        startAnalyzeAll();
    };

    const updateThumbPointsStatus = function () {
        if (!thumbGrid) return;
        thumbGrid.querySelectorAll('.thumb-card[data-file-key]').forEach(function (card) {
            const key = card.getAttribute('data-file-key'), result = aiResultsByFileKey[key];
            const target = card.querySelector('[data-point-status]');
            if (target) target.textContent = analysisErrors[key] ? 'Retry analysis'
                : Analysis.complete(result) ? `Ready: ${Analysis.coverage(result)}% HCC`
                : result ? `Review: ${result.points.filter(p => p.class).length}/10 points` : 'Detection pending';
        });
    };

    const hasAnyClassifications = function () {
        return selectedFiles.some(file => Boolean(aiResultsByFileKey[getFileKey(file)]));
    };

    const openAnalyzeModal = function () {
        if (!analyzeModal) {
            return;
        }
        analyzeModal.classList.add('is-visible');
        analyzeRestoreBtn.hidden = true;
        analyzeRestoreBtn.setAttribute('aria-expanded', 'true');
        analyzeModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        document.body.classList.add('analysis-progress-open');
    };

    const closeAnalyzeModal = function (minimized = false) {
        if (!analyzeModal) {
            return;
        }
        analyzeModal.classList.remove('is-visible');
        analyzeModal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.process-modal.is-visible, .quadrat-fs.is-visible')) {
            document.body.classList.remove('modal-open');
        }
        document.body.classList.remove('analysis-progress-open');
        analyzeRestoreBtn.hidden = !minimized;
        analyzeRestoreBtn.setAttribute('aria-expanded', 'false');
    };

    const syncAnalyzeDock = function () {
        document.getElementById('analyze-dock-title').textContent = document.getElementById('analyze-title').textContent;
        document.getElementById('analyze-dock-progress').textContent = analyzeProgressText.textContent;
        analyzeRestoreBtn.classList.toggle('is-running', isAnalyzing);
    };
    analyzeMinimizeBtn.addEventListener('click', () => {
        closeAnalyzeModal(true);
        analyzeRestoreBtn.focus();
    });
    analyzeRestoreBtn.addEventListener('click', () => {
        openAnalyzeModal();
        analyzeMinimizeBtn.focus();
    });
    analyzeCancelBtn.addEventListener('click', () => {
        if (!isAnalyzing || !analysisController) return;
        analyzeCancelBtn.disabled = true;
        analyzeCancelBtn.textContent = 'Cancelling…';
        analysisController.abort();
    });

    const openAnalyzeConfirm = function () {
        if (!analyzeConfirmModal) {
            return;
        }
        analyzeConfirmModal.classList.add('is-visible');
        analyzeConfirmModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    };

    const closeAnalyzeConfirm = function () {
        if (!analyzeConfirmModal) {
            return;
        }
        analyzeConfirmModal.classList.remove('is-visible');
        analyzeConfirmModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    };

    const resetAnalyzeProgress = function () {
        if (analyzeProgressFill) {
            analyzeProgressFill.style.width = '0%';
        }
        if (analyzeProgressText) {
            analyzeProgressText.textContent = '0% (0/0)';
        }
        if (analyzeStatus) {
            analyzeStatus.textContent = 'Preparing analysis...';
        }
        if (analyzeModal) {
            analyzeModal.classList.remove('is-complete', 'is-error', 'is-cancelled');
        }
        var analyzeTitleReset = document.getElementById('analyze-title');
        if (analyzeTitleReset) {
            analyzeTitleReset.textContent = 'Analysis in Progress';
        }
        if (analyzeProgressList) {
            analyzeProgressList.innerHTML = '';
        }
        if (analyzeCloseBtn) {
            analyzeCloseBtn.textContent = 'Review Results';
            analyzeCloseBtn.disabled = true;
            analyzeCloseBtn.setAttribute('aria-disabled', 'true');
        }
        analyzeCancelBtn.hidden = false;
        analyzeCancelBtn.disabled = false;
        analyzeCancelBtn.textContent = 'Cancel analysis';
        syncAnalyzeDock();
    };

    const initAnalyzeProgressList = function (files) {
        if (!analyzeProgressList) {
            return;
        }
        analyzeProgressList.innerHTML = '';
        files.forEach(function (file) {
            const item = document.createElement('li');
            item.setAttribute('data-file-key', getFileKey(file));
            item.innerHTML =
                '<span class="process-file">' +
                    '<svg class="process-file-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
                    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
                    'aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"></rect>' +
                    '<circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>' +
                    '<span class="process-file-name">' + escapeHtml(file.name) + '</span>' +
                '</span>' +
                '<span class="process-badge process-badge-pending">Pending</span>';
            analyzeProgressList.appendChild(item);
        });
    };

    const setAnalyzeProgress = function (currentIndex, total, fileName, completed) {
        const progress = total ? Math.round(((currentIndex + (completed ? 1 : 0)) / total) * 100) : 0;
        if (analyzeProgressFill) {
            analyzeProgressFill.style.width = `${progress}%`;
        }
        if (analyzeProgressText) {
            analyzeProgressText.textContent = `${progress}% (${currentIndex + (completed ? 1 : 0)}/${total})`;
        }
        if (analyzeStatus) {
            analyzeStatus.textContent = fileName ? `Analyzing ${fileName}...` : 'Analyzing images...';
        }
        syncAnalyzeDock();
    };

    const markAnalyzeItemDone = function (fileKey, error, cancelled = false) {
        if (!analyzeProgressList) {
            return;
        }
        const items = analyzeProgressList.querySelectorAll('li[data-file-key]');
        items.forEach(function (item) {
            if (item.getAttribute('data-file-key') !== fileKey) {
                return;
            }
            const badge = item.querySelector('.process-badge');
            if (badge) {
                badge.textContent = cancelled ? 'Cancelled' : error ? 'Failed' : 'Done';
                if (error) { item.title = error; item.classList.add(cancelled ? 'is-cancelled' : 'is-failed'); }
                badge.classList.remove('process-badge-pending');
                badge.classList.add(cancelled ? 'process-badge-cancelled' : error ? 'process-badge-failed' : 'process-badge-done');
            }
            item.classList.add('is-done');
        });
    };

    const getConfidenceClass = function (confidence) {
        if (confidence >= 90) return 'confidence-high';
        if (confidence >= 70) return 'confidence-medium';
        return 'confidence-low';
    };

    const getCoralCoveragePercent = function (points) {
        // Hard Coral Cover (HCC): Hard Coral points only / total points
        if (!points || !points.length) {
            return 0;
        }
        const coralCount = points.filter(function (p) {
            return p.class === 'Hard Coral';
        }).length;
        return Math.round((coralCount / points.length) * 100);
    };

    const getCoverageClass = function (coveragePercent) {
        // HCC category: A>44, B>33-44, C>22-33, D 0-22
        if (coveragePercent > 44) return 'A';
        if (coveragePercent > 33) return 'B';
        if (coveragePercent > 22) return 'C';
        return 'D';
    };

    // Mean HCC across reviewed images in this transect (ten points per image).
    const computeTransectCoverage = function () {
        const result = Analysis.transect(selectedFiles.map(file => aiResultsByFileKey[getFileKey(file)]));
        return { ...result, code: getCoverageClass(result.pct) };
    };

    // Preview the active image while the footer summarizes confirmed images in this transect.
    const renderImageCoverageSummary = function () {
        const coverageClassEl = document.getElementById('coverage-class');
        const coveragePercentEl = document.getElementById('coral-coverage-percent');
        const substitutionEl = document.getElementById('coverage-substitution');
        const result = activeResult();
        if (!result || result.points.length !== 10) {
            coveragePercentEl.textContent = '--%';
            coverageClassEl.textContent = 'Pending';
            coverageClassEl.className = 'coverage-metric-badge class-pending';
            substitutionEl.textContent = 'Choose a quadrat to generate representative markers.';
            return;
        }
        const hard = result.points.filter(point => point.class === 'Hard Coral').length;
        const percent = getCoralCoveragePercent(result.points);
        const estimatedPercent = Analysis.estimatedCoverage(result);
        const category = getCoverageClass(percent);
        coveragePercentEl.textContent = `${estimatedPercent.toFixed(2)}% → ${percent}%`;
        coverageClassEl.textContent = `Category ${category}`;
        coverageClassEl.className = `coverage-metric-badge class-${category.toLowerCase()}`;
        substitutionEl.textContent = `${estimatedPercent.toFixed(2)}% estimated HC area → ${hard} Hard Coral markers ÷ 10 × 100 = ${percent}% HCC · Active image${Analysis.complete(result) ? ' ready' : ' incomplete'}`;
    };

    const refreshReviewState = function () {
        const file = getActiveFile();
        const result = file ? aiResultsByFileKey[getFileKey(file)] : null;
        if (result) {
            result.coverage_percent = Analysis.complete(result) ? Analysis.coverage(result) : null;
            result.coverage_class = result.coverage_percent === null ? null : getCoverageClass(result.coverage_percent);
        }
        if (result) syncEditorControls(result);
        if (markerSummary && result && result.quadrat_bbox) {
            markerSummary.textContent = Analysis.classes.map(name => `${name === 'Other Substrate' ? 'Other Substrate (OS)' : name} ${result.points.filter(point => point.class === name).length}`).join(' · ');
        }
        if (quadratPointsCount) quadratPointsCount.textContent = result
            ? Analysis.complete(result) ? 'Analysis ready' : `${result.points.length}/10 representative markers`
            : 'Detection pending';
        updateThumbPointsStatus();
        renderImageCoverageSummary();
        updateSubmitState();
        updateSummary();
    };

    const activeResult = function () {
        const file = getActiveFile();
        return file ? aiResultsByFileKey[getFileKey(file)] : null;
    };
    const closeContextMenu = function () {
        const restoreFocus = !contextMenu.hidden && contextMenu.contains(document.activeElement);
        contextMenu.hidden = true;
        if (restoreFocus) quadratCanvas.focus({ preventScroll: true });
    };
    const syncEditorControls = function (result) {
        if (!result) return;
        const e = Editor.ensure(result);
        document.getElementById('review-undo').disabled = isAnalyzing || !e.undo.length;
        document.getElementById('review-redo').disabled = isAnalyzing || !e.redo.length;
        squareLock.checked = e.square;
        squareLock.disabled = isAnalyzing || !result.quadrat_bbox || Boolean(result.boundary_draft);
    };
    const renderDetectionReview = function (result) {
        if (!detectionReview) return;
        detectionReview.hidden = !result;
        if (!result) { closeContextMenu(); return; }
        const e = Editor.ensure(result);
        document.getElementById('detection-model').textContent = `Model: ${result.model.id}`;
        const warnings = result.warnings.map(w => w.message || '').filter(Boolean);
        document.getElementById('detection-warning').textContent = warnings.join(' ');
        syncEditorControls(result);
        refreshReviewState();
    };

    const renderMarkerSummary = function () {
        if (!markerSummary) return;
        const file = getActiveFile(), key = file ? getFileKey(file) : null;
        const result = key ? aiResultsByFileKey[key] : null;
        renderDetectionReview(result);
        if (fsBtn) fsBtn.hidden = !result;
        if (!result) {
            markerSummary.innerHTML = `<p class="thumb-empty-state">${escapeHtml(key && analysisErrors[key]
                ? analysisErrors[key] : 'Run AI detection to begin image review.')}</p>`;
            refreshReviewState();
            return;
        }
        if (!result.quadrat_bbox) {
            markerSummary.innerHTML = '<p class="thumb-empty-state">Choose Edit quadrat and draw the boundary to generate ten representative markers.</p>';
            refreshReviewState();
            return;
        }
        const counts = Analysis.classes.map(name => `${name === 'Other Substrate' ? 'Other Substrate (OS)' : name} ${result.points.filter(point => point.class === name).length}`);
        markerSummary.textContent = counts.join(' · ');
        refreshReviewState();
    };

    const finishEditorAction = function () {
        closeContextMenu();
        syncReviewCursor();
        renderMarkerSummary();
        const result = activeResult();
        if (result) drawQuadratAndPoints(result.quadrat_bbox, result.points);
    };
    const deleteSelectedBox = function () {
        const result = activeResult(); if (!result || isAnalyzing) return;
        Editor.remove(result); finishEditorAction();
    };
    document.getElementById('review-context-delete').addEventListener('click', deleteSelectedBox);
    contextClassButtons.forEach(button => button.addEventListener('click', function () {
        const result = activeResult();
        if (!result || isAnalyzing || reviewDrag) return;
        Editor.rename(result, this.dataset.reviewClass);
        finishEditorAction();
    }));
    document.getElementById('review-context-cancel').addEventListener('click', closeContextMenu);
    document.addEventListener('pointerdown', event => { if (!contextMenu.contains(event.target)) closeContextMenu(); });
    const historyAction = function (redo) {
        const result = activeResult(); if (!result || isAnalyzing || reviewDrag) return;
        if (analyzeModal.classList.contains('is-visible') || analyzeConfirmModal.classList.contains('is-visible')) return;
        (redo ? Editor.redo : Editor.undo)(result); finishEditorAction();
    };
    document.getElementById('review-undo').addEventListener('click', () => historyAction(false));
    document.getElementById('review-redo').addEventListener('click', () => historyAction(true));
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && reviewDrag) {
            const drag = reviewDrag;
            reviewDrag = null; isDraggingQuadrat = false;
            Editor.restore(drag.result, drag.before, false);
            if (quadratCanvas.hasPointerCapture(drag.pointer)) quadratCanvas.releasePointerCapture(drag.pointer);
            finishEditorAction(); event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        if (event.key === 'Escape' && !contextMenu.hidden) { event.preventDefault(); event.stopImmediatePropagation(); closeContextMenu(); return; }
        if (event.target.closest('input,textarea,select,[contenteditable="true"]') || isAnalyzing || reviewDrag) return;
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
            event.preventDefault(); historyAction(key === 'y' || event.shiftKey);
        }
    });
    document.querySelectorAll('[data-review-tool]').forEach(button => button.addEventListener('click', function () {
        if (isAnalyzing || reviewDrag) return;
        reviewTool = this.dataset.reviewTool;
        closeContextMenu();
        document.querySelectorAll('[data-review-tool]').forEach(b => b.setAttribute('aria-pressed', String(b === this)));
        if (['hard', 'soft'].includes(reviewTool)) showDetectionBoxes.checked = true;
        if (reviewTool === 'markers') showMarkers.checked = true;
        const result = activeResult();
        if (result && reviewTool === 'quadrat') Editor.ensure(result).selected = 'quadrat';
        finishEditorAction();
    }));
    [showDetectionBoxes, showMarkers, showFill, showEstimatedArea].forEach(control => control.addEventListener('change', function () {
        const result = activeResult(); if (result) drawQuadratAndPoints(result.quadrat_bbox, result.points);
    }));
    document.getElementById('review-fit-image').addEventListener('click', function () {
        if (reviewDrag) return;
        resetPointZoom(true);
        hideLoupe();
    });
    squareLock.addEventListener('change', function () {
        const result = activeResult();
        if (!result || isAnalyzing || reviewDrag || !result.quadrat_bbox) return;
        try {
            const locked = this.checked;
            Editor.change(result, () => {
                if (locked) Analysis.setQuadrat(result, Editor.square(result.quadrat_bbox, result.image));
                Editor.ensure(result).square = locked;
                Editor.ensure(result).selected = 'quadrat';
            });
            reviewFeedback.textContent = '';
        } catch (error) {
            reviewFeedback.textContent = error.message;
        }
        finishEditorAction();
    });

    const updateImageNav = function () {
        const total = selectedFiles.length;
        const showNav = total > 1;

        if (imageNavCounter) {
            imageNavCounter.hidden = total === 0;
            imageNavCounter.textContent = `${total ? activeFileIndex + 1 : 0} / ${total}`;
        }
        if (imagePrevBtn) {
            imagePrevBtn.hidden = !showNav;
            imagePrevBtn.disabled = activeFileIndex <= 0;
        }
        if (imageNextBtn) {
            imageNextBtn.hidden = !showNav;
            imageNextBtn.disabled = activeFileIndex >= total - 1;
        }
    };

    // ---- Hover magnifier (loupe) ----
    // Shows a magnified crop of the image under the cursor, with the numbered
    // points drawn in, so the expert can inspect what each point sits on.
    const LOUPE_SIZE = 190;
    const LOUPE_ZOOM = 3;

    // Display geometry of the letterboxed image inside the canvas —
    // same math as drawQuadratAndPoints so overlays stay aligned.
    const getImageDisplayGeometry = function () {
        const size = getCanvasSize();
        const naturalWidth = quadratImage ? quadratImage.naturalWidth : 0;
        const naturalHeight = quadratImage ? quadratImage.naturalHeight : 0;
        if (!size.width || !size.height || !naturalWidth || !naturalHeight) {
            return null;
        }

        const containerAspect = size.width / size.height;
        const imageAspect = naturalWidth / naturalHeight;
        let displayWidth, displayHeight, offsetX, offsetY;

        if (imageAspect > containerAspect) {
            displayWidth = size.width;
            displayHeight = size.width / imageAspect;
            offsetX = 0;
            offsetY = (size.height - displayHeight) / 2;
        } else {
            displayHeight = size.height;
            displayWidth = size.height * imageAspect;
            offsetX = (size.width - displayWidth) / 2;
            offsetY = 0;
        }

        return {
            offsetX: offsetX,
            offsetY: offsetY,
            displayWidth: displayWidth,
            displayHeight: displayHeight,
            naturalWidth: naturalWidth,
            naturalHeight: naturalHeight
        };
    };

    // ---- Click-to-zoom on a point (fullscreen only) ----
    // In the fullscreen review, clicking a point row zooms the image in on that
    // point; clicking the image (or navigating) zooms back out. The zoom is a
    // CSS transform applied to the image AND its cross overlay together, using
    // the point's own position as the transform-origin, so the numbered markers
    // stay perfectly aligned while magnified.
    const POINT_ZOOM = 2.6;

    const isFullscreen = function () {
        return !!(quadratWrap && quadratWrap.closest('.quadrat-fs'));
    };

    // Inline (two-column) layout only: match the point panel's height to the
    // image so the columns line up and there's no tall white gap under a short
    // image. Fullscreen and the stacked (narrow) layout manage their own sizes.
    const syncInlinePanelHeight = function () {
        const panel = document.querySelector('.quadrat-body .analysis-results-panel');
        if (panel) { panel.style.height = ''; panel.style.maxHeight = ''; }
    };

    // Redraw the quadrat + crosses for the active image (picks up the current
    // highlight for zoomedPointIndex).
    const redrawPoints = function () {
        const activeFile = getActiveFile();
        if (!activeFile) { return; }
        const results = aiResultsByFileKey[getFileKey(activeFile)];
        if (results) {
            drawQuadratAndPoints(results.quadrat_bbox, results.points);
        }
    };

    // Keeps the "Point N / total" label in the on-image control in sync.
    const updatePointNavLabel = function () {
        const label = document.getElementById('point-zoom-label');
        if (!label) { return; }
        const activeFile = getActiveFile();
        const results = activeFile ? aiResultsByFileKey[getFileKey(activeFile)] : null;
        const total = results && results.points ? results.points.length : 0;
        if (zoomedPointIndex >= 0 && total) {
            label.textContent = 'Point ' + (zoomedPointIndex + 1) + ' / ' + total;
        } else if (total) {
            label.textContent = total + ' points';
        } else {
            label.textContent = 'Points';
        }
    };

    const resetPointZoom = function (instant) {
        const wasZoomed = zoomedPointIndex >= 0;
        zoomedPointIndex = -1;
        imageZoom = { scale: 1, x: 0, y: 0 };
        [quadratImage, quadratCanvas].forEach(function (el) {
            if (!el) { return; }
            // Instant reset (used when switching images) skips the zoom-out
            // animation so the next image never inherits a lingering transform.
            el.style.transition = instant ? 'none' : '';
            el.style.transformOrigin = '';
            el.style.transform = '';
        });
        if (instant && quadratWrap) {
            void quadratWrap.offsetWidth;   // force the reset to apply now
            [quadratImage, quadratCanvas].forEach(function (el) {
                if (el) { el.style.transition = ''; }
            });
        }
        syncReviewCursor();
        if (quadratWrap) { quadratWrap.classList.remove('is-point-zoomed'); }
        if (wasZoomed) { redrawPoints(); }   // clear the highlight
        updatePointNavLabel();
    };

    const applyImageZoom = function (instant = false) {
        [quadratImage, quadratCanvas].forEach(function (el) {
            if (!el) return;
            el.style.transition = instant ? 'none' : '';
            el.style.transformOrigin = '0 0';
            el.style.transform = `translate(${imageZoom.x}px, ${imageZoom.y}px) scale(${imageZoom.scale})`;
        });
        syncReviewCursor();
        quadratWrap.classList.add('is-point-zoomed');
    };

    const freezeImageZoom = function () {
        if (imageZoom.scale === 1) return;
        const matrix = new DOMMatrix(getComputedStyle(quadratCanvas).transform);
        imageZoom = { scale: matrix.a, x: matrix.e, y: matrix.f };
        applyImageZoom(true);
    };

    if (quadratWrap) quadratWrap.addEventListener('wheel', function (event) {
        // Chromium reports a touchpad pinch as a Ctrl+wheel event.
        if (!event.ctrlKey && imageZoom.scale === 1) return;
        event.preventDefault();
        if (!getActiveFile() || isAnalyzing || reviewDrag) return;
        freezeImageZoom();
        const size = getCanvasSize();
        if (!size.width || !size.height) return;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1;
        if (!event.ctrlKey) {
            imageZoom.x = Math.max((1 - imageZoom.scale) * size.width, Math.min(0, imageZoom.x - event.deltaX * unit));
            imageZoom.y = Math.max((1 - imageZoom.scale) * size.height, Math.min(0, imageZoom.y - event.deltaY * unit));
            hideLoupe();
            applyImageZoom(true);
            return;
        }
        if (!event.deltaY) return;
        const bounds = quadratWrap.getBoundingClientRect();
        const x = event.clientX - bounds.left - quadratWrap.clientLeft;
        const y = event.clientY - bounds.top - quadratWrap.clientTop;
        const delta = event.deltaY * unit;
        const scale = Math.max(1, Math.min(6, imageZoom.scale * Math.exp(-delta * .01)));
        if (scale === 1) { resetPointZoom(true); return; }
        const ratio = scale / imageZoom.scale;
        imageZoom = {
            scale,
            x: Math.max((1 - scale) * size.width, Math.min(0, x - (x - imageZoom.x) * ratio)),
            y: Math.max((1 - scale) * size.height, Math.min(0, y - (y - imageZoom.y) * ratio))
        };
        zoomedPointIndex = -1;
        hideLoupe();
        applyImageZoom(true);
        redrawPoints();
        updatePointNavLabel();
    }, { passive: false });

    // Step to the next/previous point (wraps around), zooming to it.
    const stepPoint = function (delta) {
        const activeFile = getActiveFile();
        if (!activeFile) { return; }
        const results = aiResultsByFileKey[getFileKey(activeFile)];
        if (!results || !results.points || !results.points.length) { return; }
        const total = results.points.length;
        let next;
        if (zoomedPointIndex < 0) {
            next = delta > 0 ? 0 : total - 1;
        } else {
            next = (zoomedPointIndex + delta + total) % total;
        }
        zoomToPoint(next);
    };

    const zoomToPoint = function (index) {
        const activeFile = getActiveFile();
        if (!activeFile) { return; }
        const results = aiResultsByFileKey[getFileKey(activeFile)];
        if (!results || !results.points || !results.points[index] || !results.quadrat_bbox) {
            return;
        }
        const size = getCanvasSize();
        const geo = getImageDisplayGeometry();
        if (!size.width || !size.height || !geo) { return; }

        // Same letterbox math as drawQuadratAndPoints: point pixel position
        // inside the canvas box, expressed as a 0-1 fraction of that box.
        const bbox = results.quadrat_bbox;
        const pt = results.points[index];
        const px = geo.offsetX + (bbox.x + pt.x * bbox.w) * geo.displayWidth;
        const py = geo.offsetY + (bbox.y + pt.y * bbox.h) * geo.displayHeight;
        imageZoom = { scale: POINT_ZOOM, x: (1 - POINT_ZOOM) * px, y: (1 - POINT_ZOOM) * py };
        applyImageZoom();
        zoomedPointIndex = index;
        redrawPoints();   // draw the highlight ring on the active point
        if (quadratWrap) { quadratWrap.classList.add('is-point-zoomed'); }
        updatePointNavLabel();
    };

    const hideLoupe = function () {
        if (imageLoupe) {
            imageLoupe.hidden = true;
        }
    };

    const updateLoupe = function (event) {
        if (!imageLoupe || !quadratImage || !quadratCanvas) {
            return;
        }
        // The hover magnifier shouldn't fight click-to-zoom or quadrat editing.
        if (imageZoom.scale > 1 || isDraggingQuadrat) {
            hideLoupe();
            return;
        }
        const activeFile = getActiveFile();
        if (!activeFile || !quadratImage.getAttribute('src')) {
            hideLoupe();
            return;
        }

        const geo = getImageDisplayGeometry();
        if (!geo) {
            hideLoupe();
            return;
        }

        const pos = getPointerPos(event);
        // Ignore the letterboxed margins — only magnify over the actual image
        const withinImage = pos.x >= geo.offsetX && pos.x <= geo.offsetX + geo.displayWidth &&
            pos.y >= geo.offsetY && pos.y <= geo.offsetY + geo.displayHeight;
        if (!withinImage) {
            hideLoupe();
            return;
        }

        // Cursor position in the image's natural pixel space
        const u = (pos.x - geo.offsetX) / geo.displayWidth;
        const v = (pos.y - geo.offsetY) / geo.displayHeight;
        const nx = u * geo.naturalWidth;
        const ny = v * geo.naturalHeight;

        // Source crop: LOUPE_SIZE / LOUPE_ZOOM natural px, but scaled so the
        // magnification is relative to what's currently displayed on screen.
        const displayToNatural = geo.naturalWidth / geo.displayWidth;
        const cropSize = (LOUPE_SIZE / LOUPE_ZOOM) * displayToNatural;
        const half = cropSize / 2;
        const sx = nx - half;
        const sy = ny - half;

        imageLoupe.width = LOUPE_SIZE;
        imageLoupe.height = LOUPE_SIZE;
        const ctx = imageLoupe.getContext('2d');
        if (!ctx) {
            return;
        }

        ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
        ctx.drawImage(quadratImage, sx, sy, cropSize, cropSize, 0, 0, LOUPE_SIZE, LOUPE_SIZE);

        // Overlay the quadrat box + numbered points inside the magnified crop
        const results = aiResultsByFileKey[getFileKey(activeFile)];
        if (results && results.quadrat_bbox) {
            const b = results.quadrat_bbox;
            const scale = LOUPE_SIZE / cropSize; // natural px -> loupe px
            const toLoupe = function (natX, natY) {
                return { x: (natX - sx) * scale, y: (natY - sy) * scale };
            };

            const rect = {
                x: b.x * geo.naturalWidth,
                y: b.y * geo.naturalHeight,
                w: b.w * geo.naturalWidth,
                h: b.h * geo.naturalHeight
            };
            const rTL = toLoupe(rect.x, rect.y);
            ctx.strokeStyle = '#ff8a3d';
            ctx.lineWidth = 2;
            ctx.strokeRect(rTL.x, rTL.y, rect.w * scale, rect.h * scale);

                (showMarkers.checked ? results.points || [] : []).forEach(function (point, index) {
                const p = toLoupe(rect.x + point.x * rect.w, rect.y + point.y * rect.h);
                if (p.x < -20 || p.y < -20 || p.x > LOUPE_SIZE + 20 || p.y > LOUPE_SIZE + 20) {
                    return; // outside the magnified view
                }
                drawCpcePoint(ctx, p.x, p.y, point.class === 'Other Substrate' ? `OS ${index + 1}` : index + 1, {
                    arm: 12,
                    lineWidth: 2,
                    font: 'bold 14px "Inter", "Segoe UI", Arial, sans-serif'
                });
            });
        }

        // Position the loupe near the cursor, kept inside the preview box
        const wrapW = quadratCanvas.clientWidth;
        const wrapH = quadratCanvas.clientHeight;
        let left = pos.x + 24;
        let top = pos.y - LOUPE_SIZE - 24;
        if (left + LOUPE_SIZE > wrapW) left = pos.x - LOUPE_SIZE - 24;
        if (left < 0) left = 0;
        if (top < 0) top = pos.y + 24;
        if (top + LOUPE_SIZE > wrapH) top = Math.max(0, wrapH - LOUPE_SIZE);

        imageLoupe.style.left = left + 'px';
        imageLoupe.style.top = top + 'px';
        imageLoupe.hidden = false;
    };

    const updateQuadratPreview = function () {
        if (!quadratImage || !quadratCanvas || !quadratEmpty) {
            return;
        }

        updateImageNav();
        const activeFile = getActiveFile();
        if (!activeFile) {
            quadratImage.removeAttribute('src');
            quadratCanvas.style.display = 'none';
            quadratEmpty.style.display = 'flex';
            if (quadratImageLabel) {
                quadratImageLabel.textContent = 'Select an image';
            }
            renderMarkerSummary();
            return;
        }

        if (quadratImageLabel) {
            quadratImageLabel.textContent = activeFile.name;
        }

        const results = aiResultsByFileKey[getFileKey(activeFile)];
        if (quadratPointsCount) {
            if (results) {
                quadratPointsCount.textContent = Analysis.complete(results) ? 'Analysis ready' : `${results.points.length}/10 representative markers`;
            } else {
                quadratPointsCount.textContent = 'Analysis pending';
            }
        }

        if (activeImageUrl) {
            URL.revokeObjectURL(activeImageUrl);
        }

        const previewKey = getFileKey(activeFile);
        activeImageUrl = URL.createObjectURL(activeFile);
        quadratCanvas.style.display = 'block';
        quadratEmpty.style.display = 'none';
        quadratImage.onload = function () {
            if (!getActiveFile() || getFileKey(getActiveFile()) !== previewKey) return;
            syncCanvasSize();
            const current = aiResultsByFileKey[previewKey];
            if (current && (current.image.width !== quadratImage.naturalWidth || current.image.height !== quadratImage.naturalHeight)) {
                analysisErrors[previewKey] = 'Image orientation could not be matched. Export an upright image and retry.';
                delete aiResultsByFileKey[previewKey];
                quadratCanvas.getContext('2d').clearRect(0, 0, quadratCanvas.width, quadratCanvas.height);
                renderMarkerSummary();
                return;
            }
            const ctx = quadratCanvas.getContext('2d');
            if (current) drawQuadratAndPoints(current.quadrat_bbox, current.points);
            else if (ctx) ctx.clearRect(0, 0, quadratCanvas.width, quadratCanvas.height);
            renderMarkerSummary();
            syncInlinePanelHeight();
        };
        quadratImage.src = activeImageUrl;
    };

    const renderSelectedFiles = function () {
        if (!thumbGrid) {
            return;
        }

        if (!selectedFiles.length) {
            thumbGrid.innerHTML = initialThumbMarkup || '<p class="thumb-empty-state" id="thumb-empty-state">No images selected yet.</p>';
            if (transectLabelInput) { transectLabelInput.value = ''; }
            renderImageCount();
            updateQuadratPreview();
            updateSubmitState();
            updateSummary();
            return;
        }

        if (activeFileIndex >= selectedFiles.length) {
            activeFileIndex = 0;
        }

        thumbGrid.innerHTML = '';
        selectedFiles.forEach(function (file, index) {
            const fileKey = getFileKey(file);
            const safeFileName = escapeHtml(file.name);
            const thumbUrl = getThumbUrl(fileKey, file);

            const card = document.createElement('article');
            card.className = 'thumb-card';
            card.setAttribute('data-file-index', index);
            card.setAttribute('data-file-key', fileKey);
            if (index === activeFileIndex) {
                card.classList.add('is-active');
            }

            const results = aiResultsByFileKey[fileKey];
            const statusText = Analysis.complete(results) ? `${Analysis.coverage(results)}% HCC` : 'Analysis incomplete';

            card.innerHTML = `
                <div class="thumb-card-head">
                    <div class="thumb-box">
                        <img class="thumb-image" src="${thumbUrl}" alt="${safeFileName}">
                    </div>
                    <button type="button" aria-label="Remove ${safeFileName}" data-remove-index="${index}">&times;</button>
                </div>
                <p>${formatFileSize(file.size)}</p>
                <p class="thumb-points-status" data-point-status>Analysis: ${statusText}</p>
            `;

            thumbGrid.appendChild(card);
        });

        renderImageCount();
        updateQuadratPreview();
        updateSubmitState();
        updateSummary();
        updateThumbPointsStatus();
    };

    // Show the number of selected images in this transect.
    function renderImageCount() {
        const el = document.getElementById('transect-legend');
        if (!el) { return; }
        const count = selectedFiles.length;
        if (!count) {
            el.hidden = true;
            el.innerHTML = '';
            return;
        }
        el.hidden = false;
        el.innerHTML = '<span class="transect-chip">'
            + `<strong>${count} image${count === 1 ? '' : 's'}</strong> in this transect`
            + '</span>';
    }

    // ---- Drag-and-drop folder support ----
    // Accepted image types (matches the file input's `accept`).
    const isAcceptedImage = function (file) {
        const name = (file && file.name ? file.name : '').toLowerCase();
        const byExt = /\.(jpe?g|png|webp)$/.test(name);
        const byType = /^image\/(jpe?g|png|webp)$/.test(file && file.type ? file.type : '');
        return byExt || byType;
    };

    // readEntries returns a directory's children in batches; keep reading until
    // it returns an empty batch.
    const readAllDirectoryEntries = function (reader) {
        return new Promise(function (resolve) {
            const all = [];
            const readBatch = function () {
                reader.readEntries(function (batch) {
                    if (!batch.length) {
                        resolve(all);
                        return;
                    }
                    all.push.apply(all, batch);
                    readBatch();
                }, function () { resolve(all); });
            };
            readBatch();
        });
    };

    // Recursively collect accepted image files from a FileSystem entry
    // (file or directory, including nested subfolders).
    const collectFilesFromEntry = function (entry, out) {
        return new Promise(function (resolve) {
            if (!entry) {
                resolve();
                return;
            }
            if (entry.isFile) {
                entry.file(function (file) {
                    if (isAcceptedImage(file)) {
                        out.push(file);
                    }
                    resolve();
                }, function () { resolve(); });
            } else if (entry.isDirectory) {
                readAllDirectoryEntries(entry.createReader()).then(function (entries) {
                    let i = 0;
                    const next = function () {
                        if (i >= entries.length) {
                            resolve();
                            return;
                        }
                        collectFilesFromEntry(entries[i++], out).then(next);
                    };
                    next();
                });
            } else {
                resolve();
            }
        });
    };

    // Gather dropped images, flattening any dropped folder into its image files,
    // and report the dropped folder's name (used as the transect label).
    const collectDroppedImages = function (dataTransfer) {
        return new Promise(function (resolve) {
            const items = dataTransfer && dataTransfer.items;
            const entries = [];
            if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
                for (let i = 0; i < items.length; i++) {
                    const entry = items[i].webkitGetAsEntry();
                    if (entry) { entries.push(entry); }
                }
            }
            if (!entries.length) {
                const files = dataTransfer && dataTransfer.files ? Array.from(dataTransfer.files) : [];
                resolve({ files: files.filter(isAcceptedImage), folderName: '' });
                return;
            }
            const out = [];
            let folderName = '';
            let i = 0;
            const next = function () {
                if (i >= entries.length) {
                    resolve({ files: out, folderName: folderName });
                    return;
                }
                const entry = entries[i++];
                if (entry.isDirectory && !folderName) { folderName = entry.name; }
                collectFilesFromEntry(entry, out).then(next);
            };
            next();
        });
    };

    // Rebuild the hidden <input type=file> from the current selectedFiles so a
    // normal form submit still carries every image.
    const syncUploadInputFromSelected = function () {
        if (!uploadInput) { return; }
        try {
            const transfer = new DataTransfer();
            selectedFiles.forEach(function (file) { transfer.items.add(file); });
            uploadInput.files = transfer.files;
        } catch (error) {
            // Some environments block assigning FileList directly; ignore.
        }
    };

    // Append image files to the current transect (dedup by file key).
    const appendImages = function (files) {
        if (isAnalyzing) return;
        files.slice().sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        }).forEach(function (file) {
            const key = getFileKey(file);
            if (selectedFiles.some(function (f) { return getFileKey(f) === key; })) {
                return;
            }
            selectedFiles.push(file);
        });
    };

    // Shared post-add refresh for every entry point (drag, folder pick, browse).
    const afterFilesAdded = function () {
        syncUploadInputFromSelected();
        if (activeFileIndex >= selectedFiles.length) { activeFileIndex = 0; }
        pruneThumbUrls();
        renderSelectedFiles();
        updateSummary();
    };

    if (dropzone) {
        ['dragenter', 'dragover'].forEach(function (eventName) {
            dropzone.addEventListener(eventName, function (event) {
                event.preventDefault();
                event.stopPropagation();
                dropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'drop'].forEach(function (eventName) {
            dropzone.addEventListener(eventName, function (event) {
                event.preventDefault();
                event.stopPropagation();
                dropzone.classList.remove('is-dragover');
            });
        });

        dropzone.addEventListener('drop', function (event) {
            if (isAnalyzing) return;
            if (!event.dataTransfer) {
                return;
            }
            // Everything dropped belongs to this one transect; a dropped folder's
            // name becomes the transect label.
            collectDroppedImages(event.dataTransfer).then(function (result) {
                if (!result.files.length) {
                    return;
                }
                appendImages(result.files);
                setTransectLabel(result.folderName);
                afterFilesAdded();
            });
        });
    }

    if (chooseImagesButton && uploadInput) {
        chooseImagesButton.addEventListener('click', function () {
            if (isAnalyzing) return;
            uploadInput.click();
        });
    }

    if (uploadInput) {
        uploadInput.addEventListener('change', function () {
            const picked = uploadInput.files ? Array.from(uploadInput.files).filter(isAcceptedImage) : [];
            if (!picked.length) {
                syncUploadInputFromSelected();
                return; // Cancelled dialog — keep the current selection.
            }
            appendImages(picked);
            afterFilesAdded();
        });
    }

    // ---- Folder picker (click the dropzone) ----
    // A plain file dialog can't select folders, so clicking the box opens a
    // webkitdirectory picker. All picked files are this transect's images; the
    // chosen folder's name (webkitRelativePath segment 0) becomes the label.
    const folderInput = document.getElementById('folder-input');
    if (dropzone && folderInput) {
        dropzone.addEventListener('click', function () {
            if (isAnalyzing) return;
            folderInput.click();
        });
        dropzone.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                folderInput.click();
            }
        });
        folderInput.addEventListener('change', function () {
            if (isAnalyzing) return;
            const picked = folderInput.files ? Array.from(folderInput.files).filter(isAcceptedImage) : [];
            if (!picked.length) {
                folderInput.value = '';
                return;
            }
            const rel = (picked[0].webkitRelativePath || '').split('/');
            setTransectLabel(rel.length > 1 ? rel[0] : '');
            appendImages(picked);
            afterFilesAdded();
            folderInput.value = ''; // allow re-picking the same folder
        });
    }

    if (thumbGrid) {
        thumbGrid.addEventListener('click', function (event) {
            if (isAnalyzing) return;
            const removeButton = event.target.closest('button[data-remove-index]');
            if (!removeButton) {
                const card = event.target.closest('.thumb-card[data-file-index]');
                if (card) {
                    const index = Number(card.getAttribute('data-file-index'));
                    if (!Number.isNaN(index)) {
                        setActiveFileIndex(index);
                    }
                }
                return;
            }

            const removeIndex = Number(removeButton.getAttribute('data-remove-index'));
            if (Number.isNaN(removeIndex) || removeIndex < 0 || removeIndex >= selectedFiles.length) {
                return;
            }

            const removed = selectedFiles.splice(removeIndex, 1)[0];
            const removedKey = getFileKey(removed);
            delete aiResultsByFileKey[removedKey];
            delete analysisErrors[removedKey];
            pruneThumbUrls();

            syncUploadInputFromSelected();

            renderSelectedFiles();
        });

    }

    if (analyzeAllBtn) {
        analyzeAllBtn.addEventListener('click', function () {
            runAnalyzeAll();
        });
    }

    if (imagePrevBtn) {
        imagePrevBtn.addEventListener('click', function () {
            setActiveFileIndex(activeFileIndex - 1);
        });
    }
    if (imageNextBtn) {
        imageNextBtn.addEventListener('click', function () {
            setActiveFileIndex(activeFileIndex + 1);
        });
    }

    // On-image point stepper (fullscreen): jump/zoom to previous/next point.
    const pointZoomPrev = document.getElementById('point-zoom-prev');
    const pointZoomNext = document.getElementById('point-zoom-next');
    if (pointZoomPrev) {
        pointZoomPrev.addEventListener('click', function () { stepPoint(-1); });
    }
    if (pointZoomNext) {
        pointZoomNext.addEventListener('click', function () { stepPoint(1); });
    }

    // Hover over the preview to magnify; the loupe never blocks quadrat editing
    if (quadratCanvas && imageLoupe) {
        quadratCanvas.addEventListener('mousemove', updateLoupe);
        quadratCanvas.addEventListener('mouseleave', hideLoupe);
    }

    // One pointer gesture is one undo transaction. Coordinates stay image-relative.
    if (quadratCanvas) {
        quadratCanvas.style.touchAction = 'none';
        const pointOnImage = function (event, clamp = false) {
            const geo = getImageDisplayGeometry(); if (!geo) return null;
            const p = getPointerPos(event);
            let x = (p.x - geo.offsetX) / geo.displayWidth, y = (p.y - geo.offsetY) / geo.displayHeight;
            if (!clamp && (x < 0 || y < 0 || x > 1 || y > 1)) return null;
            return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
        };
        const handleAt = function (result, event) {
            const rect = Editor.selected(result), geo = getImageDisplayGeometry();
            if (!rect || !geo || (result.editor.selected !== 'quadrat' && !showDetectionBoxes.checked)) return null;
            const point = pointOnImage(event);
            if (result.editor.selected !== 'quadrat' && result.quadrat_bbox
                && (!point || !Editor.contains(result.quadrat_bbox, point))) return null;
            return getHandleHit({ x: geo.offsetX + rect.x * geo.displayWidth, y: geo.offsetY + rect.y * geo.displayHeight,
                w: rect.w * geo.displayWidth, h: rect.h * geo.displayHeight }, getPointerPos(event));
        };
        quadratCanvas.addEventListener('pointerdown', function (event) {
            const result = activeResult();
            if (!result || isAnalyzing || event.button !== 0) return;
            freezeImageZoom();
            const point = pointOnImage(event);
            if (!point) return;
            closeContextMenu();
            const e = Editor.ensure(result), before = Editor.snapshot(result);
            let mode = null, handle = null, marker = null;
            if (['hard', 'soft'].includes(reviewTool)) mode = 'draw';
            else if (reviewTool === 'markers') {
                if (!result.quadrat_bbox || !showMarkers.checked) return;
                const geo = getImageDisplayGeometry(), b = result.quadrat_bbox;
                let distance = 18 / imageZoom.scale;
                result.points.forEach((p, i) => {
                    const d = Math.hypot((b.x + p.x * b.w - point.x) * geo.displayWidth,
                        (b.y + p.y * b.h - point.y) * geo.displayHeight);
                    if (d < distance) { distance = d; marker = i; }
                });
                if (marker === null) return;
                mode = 'marker';
            } else {
                if (reviewTool === 'quadrat') e.selected = result.quadrat_bbox ? 'quadrat' : null;
                handle = handleAt(result, event);
                if (handle) mode = 'resize';
                else if (reviewTool === 'quadrat') mode = Editor.contains(result.quadrat_bbox, point) ? 'move' : 'draw';
                else {
                    const id = showDetectionBoxes.checked ? Editor.hit(result, point) : Editor.contains(result.quadrat_bbox, point) ? 'quadrat' : null;
                    e.selected = id;
                    if (reviewTool === 'hand' && id) mode = 'move';
                }
            }
            if (!mode) { finishEditorAction(); return; }
            reviewDrag = { result, before, start: point, mode, handle, marker, pointer: event.pointerId,
                rect: Editor.selected(result) ? { ...Editor.selected(result) } : null, id: e.selected, moved: false };
            isDraggingQuadrat = true; hideLoupe();
            syncReviewCursor();
            quadratCanvas.setPointerCapture(event.pointerId);
            event.preventDefault();
            renderDetectionReview(result);
            drawQuadratAndPoints(result.quadrat_bbox, result.points);
        });
        quadratCanvas.addEventListener('pointermove', function (event) {
            const result = activeResult(), p = pointOnImage(event, true);
            if (!result || !p || !reviewDrag) {
                syncReviewCursor();
                return;
            }
            const drag = reviewDrag, geo = getImageDisplayGeometry();
            const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
            if (Math.hypot(dx * geo.displayWidth, dy * geo.displayHeight) < 2 && !drag.moved) return;
            drag.moved = true;
            if (drag.mode === 'draw') {
                drag.draft = { x: Math.min(drag.start.x, p.x), y: Math.min(drag.start.y, p.y), w: Math.abs(dx), h: Math.abs(dy) };
                drawQuadratAndPoints(result.quadrat_bbox, result.points);
                const ctx = quadratCanvas.getContext('2d'); ctx.save(); ctx.strokeStyle = reviewTool === 'quadrat' ? '#ff8a3d' : reviewTool === 'hard' ? '#b56aff' : '#32e0bf';
                if (reviewTool !== 'quadrat' && result.quadrat_bbox) {
                    const b = result.quadrat_bbox;
                    ctx.beginPath();
                    ctx.rect(geo.offsetX + b.x * geo.displayWidth, geo.offsetY + b.y * geo.displayHeight,
                        b.w * geo.displayWidth, b.h * geo.displayHeight);
                    ctx.clip();
                }
                ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
                ctx.strokeRect(geo.offsetX + drag.draft.x * geo.displayWidth, geo.offsetY + drag.draft.y * geo.displayHeight,
                    drag.draft.w * geo.displayWidth, drag.draft.h * geo.displayHeight); ctx.restore();
                return;
            }
            if (drag.mode === 'marker') {
                const b = result.quadrat_bbox;
                Editor.marker(result, drag.marker, { x: (p.x - b.x) / b.w, y: (p.y - b.y) / b.h });
            } else {
                const box = drag.mode === 'resize' ? Editor.resize(drag.rect, drag.handle, dx, dy, result.image,
                    drag.id === 'quadrat' && Editor.ensure(result).square) : Editor.move(drag.rect, dx, dy);
                Editor.setBox(result, drag.id, box);
            }
            refreshReviewState(); drawQuadratAndPoints(result.quadrat_bbox, result.points);
        });
        const finishPointer = function (event) {
            if (!reviewDrag) return;
            const drag = reviewDrag, result = drag.result, geo = getImageDisplayGeometry();
            reviewDrag = null; isDraggingQuadrat = false;
            if (event.type === 'pointercancel') Editor.restore(result, drag.before, false);
            else if (drag.moved && drag.mode === 'draw') {
                const b = drag.draft;
                if (b && geo && b.w * geo.displayWidth >= 4 && b.h * geo.displayHeight >= 4) {
                    if (reviewTool === 'quadrat') {
                        try {
                            const next = Editor.ensure(result).square ? Editor.square(b, result.image) : b;
                            Analysis.setQuadrat(result, next); Editor.ensure(result).selected = 'quadrat'; Editor.commit(result, drag.before);
                        } catch (error) { reviewFeedback.textContent = error.message; }
                    } else {
                        try { Editor.add(result, b, reviewTool === 'hard' ? 'Hard Coral' : 'Soft Coral'); }
                        catch (error) { reviewFeedback.textContent = error.message; }
                    }
                }
            } else if (drag.moved) Editor.commit(result, drag.before);
            if (quadratCanvas.hasPointerCapture(event.pointerId)) quadratCanvas.releasePointerCapture(event.pointerId);
            finishEditorAction();
        };
        quadratCanvas.addEventListener('pointerup', finishPointer);
        quadratCanvas.addEventListener('pointercancel', finishPointer);
        quadratCanvas.addEventListener('contextmenu', function (event) {
            const result = activeResult(), p = pointOnImage(event);
            if (!result || !p || isAnalyzing || reviewDrag) return;
            const id = showDetectionBoxes.checked ? Editor.hit(result, p, Editor.ensure(result).selected !== 'quadrat')
                : Editor.contains(result.quadrat_bbox, p) ? 'quadrat' : null;
            if (!id) return;
            event.preventDefault(); Editor.ensure(result).selected = id;
            finishEditorAction();
            (isFullscreen() ? document.getElementById('quadrat-fs') : document.body).appendChild(contextMenu);
            const coral = Editor.coral(result).find(box => box.id === id);
            contextClassButtons.forEach(button => {
                button.hidden = !coral;
                button.disabled = !coral || coral.class_name === button.dataset.reviewClass;
            });
            document.getElementById('review-context-divider').hidden = !coral;
            document.getElementById('review-context-delete-label').textContent = `Delete ${Editor.label(result, id)}`;
            contextMenu.hidden = false;
            const menuBounds = contextMenu.getBoundingClientRect();
            contextMenu.style.left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuBounds.width - 8)) + 'px';
            contextMenu.style.top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuBounds.height - 8)) + 'px';
            document.getElementById('review-context-delete').focus();
        });
    }

    const reanalyzeBtn = document.getElementById('reanalyze-btn');
    if (reanalyzeBtn) reanalyzeBtn.addEventListener('click', runAnalyzeAll);
    if (retryAnalysisBtn) retryAnalysisBtn.addEventListener('click', () => startAnalyzeAll(true));

    if (batchNameInput) {
        batchNameInput.addEventListener('input', updateSummary);
    }
    if (surveyDateInput) {
        surveyDateInput.addEventListener('input', updateSummary);
    }
    if (areaNameInput) {
        areaNameInput.addEventListener('input', updateSummary);
    }
    if (surveyorNamesInput) {
        surveyorNamesInput.addEventListener('input', updateSummary);
    }
    if (latInput) {
        latInput.addEventListener('input', updateSummary);
    }
    if (lngInput) {
        lngInput.addEventListener('input', updateSummary);
    }

    setTodayIfEmpty();

    // Detection overlays remain aligned with the editable sampling boundary.
    if (quadratCanvas) {
        // Prevent default interactions on canvas
        syncReviewCursor();
    }

    if (quadratImage) {
        window.addEventListener('resize', function () {
            if (!getActiveFile()) {
                return;
            }
            syncCanvasSize();
            const activeFile = getActiveFile();
            const results = aiResultsByFileKey[getFileKey(activeFile)];
            if (results) {
                drawQuadratAndPoints(results.quadrat_bbox, results.points);
            }
            syncInlinePanelHeight();
        });
    }

    // ---- Fullscreen image review ----
    // Relocates the existing image viewer and review panel into a
    // large blurred-backdrop modal, then moves them back on close. Reusing the
    // real DOM (not a copy) keeps the canvas overlay, prev/next arrows, loupe,
    // and representative markers fully working with zero duplicated state.
    const fsModal = document.getElementById('quadrat-fs');
    const fsClose = document.getElementById('quadrat-fs-close');
    const fsStage = document.getElementById('quadrat-fs-stage');
    const fsSide = document.getElementById('quadrat-fs-side');
    const analysisPanel = document.querySelector('.analysis-results-panel');
    const coverageSummary = document.querySelector('.coverage-summary');
    const coverageMetrics = document.querySelector('.coverage-summary-metrics');
    const quadratBody = quadratWrap ? quadratWrap.parentElement : null;

    if (fsModal && fsBtn && fsStage && fsSide && quadratWrap && analysisPanel && quadratBody) {
        // Re-run the same redraw the resize handler uses, so the overlay
        // matches the container's new (larger or restored) size.
        const redrawActiveOverlay = function () {
            if (!getActiveFile()) {
                return;
            }
            syncCanvasSize();
            const results = aiResultsByFileKey[getFileKey(getActiveFile())];
            if (results) {
                drawQuadratAndPoints(results.quadrat_bbox, results.points);
            }
        };

        let fsIsOpen = false;

        const openFullscreen = function () {
            if (fsIsOpen) {
                return;
            }
            resetPointZoom(true);
            fsStage.appendChild(quadratWrap);
            fsSide.appendChild(analysisPanel);
            if (coverageMetrics) analysisPanel.prepend(coverageMetrics);
            // Drop the inline height used to balance the two-column layout so the
            // panel can fill the fullscreen side column.
            analysisPanel.style.height = '';
            analysisPanel.style.maxHeight = '';
            fsModal.hidden = false;
            // Force layout before adding the visible class so the size the
            // canvas measures is the final modal size.
            fsModal.classList.add('is-visible');
            fsModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
            fsIsOpen = true;
            requestAnimationFrame(redrawActiveOverlay);
            updatePointNavLabel();
            if (fsClose) {
                fsClose.focus();
            }
        };

        const closeFullscreen = function () {
            if (!fsIsOpen) {
                return;
            }
            resetPointZoom();
            // Restore original order inside .quadrat-body: image wrap, then panel.
            quadratBody.appendChild(quadratWrap);
            quadratBody.appendChild(analysisPanel);
            if (coverageMetrics && coverageSummary) coverageSummary.prepend(coverageMetrics);
            fsModal.classList.remove('is-visible');
            fsModal.setAttribute('aria-hidden', 'true');
            fsModal.hidden = true;
            document.body.classList.remove('modal-open');
            fsIsOpen = false;
            requestAnimationFrame(function () {
                redrawActiveOverlay();
                syncInlinePanelHeight();   // rebalance the inline columns
            });
            if (fsBtn && !fsBtn.hidden) {
                fsBtn.focus();
            }
        };

        fsBtn.addEventListener('click', openFullscreen);
        if (fsClose) {
            fsClose.addEventListener('click', closeFullscreen);
        }
        // Click on the blurred backdrop (any element flagged data-fs-close) closes.
        fsModal.addEventListener('click', function (event) {
            if (event.target.hasAttribute('data-fs-close')) {
                closeFullscreen();
            }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && fsIsOpen) {
                closeFullscreen();
            }
        });
    }

    renderSelectedFiles();
    updateSummary();
    updateSubmitState();

    if (analyzeModal && analyzeCloseBtn) {
        analyzeCloseBtn.addEventListener('click', function () {
            closeAnalyzeModal();
        });

        analyzeModal.addEventListener('click', function (event) {
            if (event.target === analyzeModal && !isAnalyzing) {
                closeAnalyzeModal();
            }
        });
    }

    if (analyzeConfirmModal && analyzeConfirmCancel && analyzeConfirmAccept) {
        analyzeConfirmCancel.addEventListener('click', function () {
            closeAnalyzeConfirm();
        });

        analyzeConfirmAccept.addEventListener('click', function () {
            closeAnalyzeConfirm();
            startAnalyzeAll();
        });

        analyzeConfirmModal.addEventListener('click', function (event) {
            if (event.target === analyzeConfirmModal) {
                closeAnalyzeConfirm();
            }
        });
    }

    if (uploadForm) {
        uploadForm.addEventListener('submit', function (event) {
            // Double-check that all data is ready before submission
            if (!isReadyToAnalyze()) {
                event.preventDefault();
                console.warn('Form submission blocked: AI analysis not complete for all images');
                alert('Complete detection and supply a valid quadrat with ten representative markers for every image before uploading.');
                updateSubmitState();
                return;
            }

            // Serialize AI results to hidden inputs
            const syncSuccess = syncQuadratInputs();
            if (!syncSuccess) {
                event.preventDefault();
                console.error('Form submission blocked: Failed to serialize AI results');
                alert('Error: Could not serialize analysis data. Please try again or run AI analysis again.');
                return;
            }

            // Saving now — allow the post-save navigation without the leave prompt.
            isSubmitting = true;
        });
    }

    // Warn before losing an in-progress transect (images staged but not saved).
    window.addEventListener('beforeunload', function (event) {
        if (selectedFiles.length && !isSubmitting) {
            event.preventDefault();
            event.returnValue = '';
        }
    });

    updateSubmitState();
    updateSummary();
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUploadBatch);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeUploadBatch();
}
