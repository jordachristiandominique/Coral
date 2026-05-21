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

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        const setPin = function (latlng) {
            if (!pin) {
                pin = L.marker(latlng).addTo(map);
            } else {
                pin.setLatLng(latlng);
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
                    const surveyorLabel = point.surveyor_names ? `Surveyors: ${point.surveyor_names}` : null;
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

        setPin({ lat: 7.0731, lng: 125.6128 });
    }

    const dropzone = document.getElementById('dropzone');
    const uploadInput = document.getElementById('upload-input');
    const thumbGrid = document.getElementById('thumb-grid');
    const initialThumbMarkup = thumbGrid ? thumbGrid.innerHTML : '';
    const quadratWrap = document.getElementById('quadrat-canvas-wrap');
    const quadratImage = document.getElementById('quadrat-image');
    const quadratCanvas = document.getElementById('quadrat-canvas');
    const quadratEmpty = document.getElementById('quadrat-empty');
    const quadratImageLabel = document.getElementById('quadrat-image-label');
    const quadratPointsCount = document.getElementById('quadrat-points-count');
    const processOpenBtn = document.getElementById('process-open-btn');
    const analyzeAllBtn = document.getElementById('analyze-all-btn');
    const analyzeHint = document.getElementById('analyze-hint');
    const analyzeModal = document.getElementById('analyze-modal');
    const analyzeStatus = document.getElementById('analyze-status');
    const analyzeProgressFill = document.getElementById('analyze-progress-fill');
    const analyzeProgressText = document.getElementById('analyze-progress-text');
    const analyzeProgressList = document.getElementById('analyze-progress-list');
    const analyzeCloseBtn = document.getElementById('analyze-close-btn');
    const analyzeConfirmModal = document.getElementById('analyze-confirm-modal');
    const analyzeConfirmCancel = document.getElementById('analyze-confirm-cancel');
    const analyzeConfirmAccept = document.getElementById('analyze-confirm-accept');
    const submitHint = document.getElementById('submit-hint');
    const uploadForm = document.getElementById('upload-batch-form');
    const quadratInputs = document.getElementById('quadrat-inputs');
    const pointList = document.getElementById('point-list');
    const pointProgress = document.getElementById('point-progress');
    const batchNameInput = document.getElementById('batch-name');
    const surveyDateInput = document.getElementById('survey-date');
    const areaNameInput = document.getElementById('area-name');
    const surveyorNamesInput = document.getElementById('surveyor-names');
    const summaryBatch = document.getElementById('summary-batch');
    const summarySurveyors = document.getElementById('summary-surveyors');
    const summaryLocation = document.getElementById('summary-location');
    const summaryImages = document.getElementById('summary-images');

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
    const quadratStateByKey = {};
    const thumbUrlByKey = {};
    const MIN_POINTS = 10;
    const MIN_RECT_SIZE = 40;
    const HANDLE_SIZE = 8;
    const DEFAULT_RECT_SCALE = 0.5;
    const POINT_CLASSES = [
        'Live coral',
        'Non-coral',
        'Dead coral',
        'Algae',
        'Rock/Sand',
        'Other'
    ];
    const MAX_ANALYZE_SIZE = 1200;
    const ANALYZE_PATCH_RADIUS = 6;
    const ANALYZE_SAT_MIN = 0.22;
    const ANALYZE_VAL_MIN = 0.18;
    let activeFileIndex = 0;
    let activeImageUrl = null;
    let dragMode = null;
    let dragStart = null;
    let startRectPx = null;
    let activeHandle = null;
    let isAnalyzing = false;

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

    const ensureQuadratState = function (fileKey) {
        if (!quadratStateByKey[fileKey]) {
            quadratStateByKey[fileKey] = {
                rect: null,
                points: []
            };
        }
        return quadratStateByKey[fileKey];
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
        if (!selectedFiles.length) {
            activeFileIndex = 0;
            updateQuadratPreview();
            return;
        }

        activeFileIndex = Math.max(0, Math.min(index, selectedFiles.length - 1));
        updateThumbActiveState();
        updateQuadratPreview();
        renderPointList();
    };

    const isReadyToAnalyze = function () {
        if (!selectedFiles.length) {
            return false;
        }

        return selectedFiles.every(function (file) {
            const state = quadratStateByKey[getFileKey(file)];
            if (!state || !state.rect) {
                return false;
            }
            ensurePointClasses(state);
            return state.pointClasses.every(function (value) {
                return Boolean(value);
            });
        });
    };

    const isReadyForAutoAnalyze = function () {
        if (!selectedFiles.length) {
            return false;
        }

        return selectedFiles.every(function (file) {
            const state = quadratStateByKey[getFileKey(file)];
            return state && state.rect;
        });
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
                ? 'Analyze all images to prefill point classes.'
                : 'Draw a quadrat for each image to enable analysis.';
        }
    };

    const updateSubmitState = function () {
        if (!processOpenBtn) {
            return;
        }

        const ready = isReadyToAnalyze();
        processOpenBtn.disabled = !ready;
        processOpenBtn.setAttribute('aria-disabled', ready ? 'false' : 'true');

        updateAnalyzeState();

        if (submitHint) {
            if (ready) {
                submitHint.textContent = 'Ready to analyze. Review and upload the batch.';
                submitHint.style.color = '#2a8793';
            } else {
                submitHint.textContent = 'Draw a quadrat for each image and classify all 10 points.';
                submitHint.style.color = '';
            }
        }
    };

    const syncQuadratInputs = function () {
        if (!quadratInputs) {
            return;
        }

        quadratInputs.innerHTML = '';

        selectedFiles.forEach(function (file, index) {
            const state = quadratStateByKey[getFileKey(file)] || {};
            const classes = state.pointClasses || [];
            const payload = {
                rect: state.rect || null,
                points: state.points || [],
                point_classes: classes
            };

            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = `image_quadrat_${index + 1}`;
            input.value = JSON.stringify(payload);
            quadratInputs.appendChild(input);
        });
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

        const rect = quadratImage.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        quadratCanvas.width = rect.width * dpr;
        quadratCanvas.height = rect.height * dpr;
        quadratCanvas.style.width = `${rect.width}px`;
        quadratCanvas.style.height = `${rect.height}px`;
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
        return {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top
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

        w = Math.max(w, MIN_RECT_SIZE);
        h = Math.max(h, MIN_RECT_SIZE);

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

    const generateRandomPoints = function (count) {
        const points = [];
        for (let i = 0; i < count; i += 1) {
            points.push({ x: Math.random(), y: Math.random() });
        }
        return points;
    };

    const ensurePointClasses = function (state) {
        if (!state.pointClasses || state.pointClasses.length !== state.points.length) {
            const next = Array(state.points.length).fill('');
            if (state.pointClasses && state.pointClasses.length) {
                state.pointClasses.slice(0, next.length).forEach(function (value, index) {
                    next[index] = value;
                });
            }
            state.pointClasses = next;
        }
    };

    const getImageBoundsForSize = function (naturalWidth, naturalHeight, canvasWidth, canvasHeight) {
        if (!naturalWidth || !naturalHeight || !canvasWidth || !canvasHeight) {
            return { x: 0, y: 0, w: canvasWidth, h: canvasHeight };
        }

        const scale = Math.min(canvasWidth / naturalWidth, canvasHeight / naturalHeight);
        const displayWidth = naturalWidth * scale;
        const displayHeight = naturalHeight * scale;
        const offsetX = (canvasWidth - displayWidth) / 2;
        const offsetY = (canvasHeight - displayHeight) / 2;

        return { x: offsetX, y: offsetY, w: displayWidth, h: displayHeight };
    };

    const rgbToHsv = function (r, g, b) {
        const rr = r / 255;
        const gg = g / 255;
        const bb = b / 255;
        const max = Math.max(rr, gg, bb);
        const min = Math.min(rr, gg, bb);
        const delta = max - min;
        let h = 0;
        if (delta) {
            if (max === rr) {
                h = ((gg - bb) / delta) % 6;
            } else if (max === gg) {
                h = (bb - rr) / delta + 2;
            } else {
                h = (rr - gg) / delta + 4;
            }
            h *= 60;
            if (h < 0) {
                h += 360;
            }
        }
        const s = max === 0 ? 0 : delta / max;
        const v = max;
        return { h: h, s: s, v: v };
    };

    const samplePatchAverage = function (imageData, x, y, radius) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const startX = Math.max(0, Math.floor(x - radius));
        const endX = Math.min(width - 1, Math.floor(x + radius));
        const startY = Math.max(0, Math.floor(y - radius));
        const endY = Math.min(height - 1, Math.floor(y + radius));
        let totalH = 0;
        let totalS = 0;
        let totalV = 0;
        let count = 0;

        for (let yy = startY; yy <= endY; yy += 2) {
            for (let xx = startX; xx <= endX; xx += 2) {
                const idx = (yy * width + xx) * 4;
                const rgb = rgbToHsv(data[idx], data[idx + 1], data[idx + 2]);
                totalH += rgb.h;
                totalS += rgb.s;
                totalV += rgb.v;
                count += 1;
            }
        }

        if (!count) {
            return { h: 0, s: 0, v: 0 };
        }

        return {
            h: totalH / count,
            s: totalS / count,
            v: totalV / count
        };
    };

    const classifyLiveCoral = function (hsv) {
        const warmHue = (hsv.h >= 10 && hsv.h <= 70) || hsv.h >= 330 || hsv.h <= 10;
        if (hsv.s >= ANALYZE_SAT_MIN && hsv.v >= ANALYZE_VAL_MIN && warmHue) {
            return 'Live coral';
        }
        return 'Non-coral';
    };

    const loadImageFromFile = function (file) {
        return new Promise(function (resolve, reject) {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = function () {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image.'));
            };
            img.src = url;
        });
    };

    const drawImageToCanvas = function (image) {
        const maxSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
        const scale = maxSide > MAX_ANALYZE_SIZE ? MAX_ANALYZE_SIZE / maxSide : 1;
        const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
        const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        return { ctx: ctx, width: width, height: height, scale: scale };
    };

    const getAnalyzeCanvasSize = function () {
        const size = getCanvasSize();
        if (size.width && size.height) {
            return size;
        }
        if (quadratWrap) {
            const rect = quadratWrap.getBoundingClientRect();
            return { width: rect.width || 1, height: rect.height || 1 };
        }
        return { width: 1, height: 1 };
    };

    const analyzeFilePoints = async function (file) {
        const state = ensureQuadratState(getFileKey(file));
        if (!state.rect || !state.points.length) {
            return;
        }

        const image = await loadImageFromFile(file);
        const canvasSize = getAnalyzeCanvasSize();
        const bounds = getImageBoundsForSize(image.naturalWidth, image.naturalHeight, canvasSize.width, canvasSize.height);
        const rectPx = toPixelRect(state.rect, canvasSize.width, canvasSize.height);

        const renderInfo = drawImageToCanvas(image);
        const imageData = renderInfo.ctx.getImageData(0, 0, renderInfo.width, renderInfo.height);

        state.pointClasses = state.points.map(function (point) {
            const px = rectPx.x + point.x * rectPx.w;
            const py = rectPx.y + point.y * rectPx.h;
            const nx = bounds.w ? (px - bounds.x) / bounds.w : 0;
            const ny = bounds.h ? (py - bounds.y) / bounds.h : 0;
            if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
                return 'Non-coral';
            }

            const imgX = nx * renderInfo.width;
            const imgY = ny * renderInfo.height;
            const hsv = samplePatchAverage(imageData, imgX, imgY, ANALYZE_PATCH_RADIUS);
            return classifyLiveCoral(hsv);
        });
    };

    const startAnalyzeAll = async function () {
        if (!analyzeAllBtn || isAnalyzing) {
            return;
        }

        if (!isReadyForAutoAnalyze()) {
            updateAnalyzeState();
            return;
        }

        isAnalyzing = true;
        analyzeAllBtn.textContent = 'Analyzing...';
        updateAnalyzeState();

        resetAnalyzeProgress();
        initAnalyzeProgressList();
        openAnalyzeModal();

        for (let i = 0; i < selectedFiles.length; i += 1) {
            const file = selectedFiles[i];
            if (analyzeHint) {
                analyzeHint.textContent = `Analyzing ${i + 1}/${selectedFiles.length}: ${file.name}`;
            }
            setAnalyzeProgress(i, selectedFiles.length, file.name);
            try {
                await analyzeFilePoints(file);
                markAnalyzeItemDone(getFileKey(file));
            } catch (error) {
                // Ignore per-file errors so the rest can continue.
            }
        }

        isAnalyzing = false;
        if (analyzeAllBtn) {
            analyzeAllBtn.textContent = 'Analyze All Images';
        }

        if (analyzeStatus) {
            analyzeStatus.textContent = 'Analysis complete. Review the point classes below.';
        }
        if (analyzeCloseBtn) {
            analyzeCloseBtn.disabled = false;
            analyzeCloseBtn.setAttribute('aria-disabled', 'false');
        }

        renderPointList();
        updateThumbPointsStatus();
        updatePointProgress();
        updateSubmitState();
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

    const getPointStatus = function (state) {
        const total = state.points && state.points.length ? state.points.length : MIN_POINTS;
        const filled = (state.pointClasses || []).filter(Boolean).length;
        return { filled: filled, total: total };
    };

    const updatePointProgress = function () {
        if (!pointProgress) {
            return;
        }

        const activeFile = getActiveFile();
        if (!activeFile) {
            pointProgress.textContent = `0/${MIN_POINTS} classified`;
            return;
        }

        const state = ensureQuadratState(getFileKey(activeFile));
        ensurePointClasses(state);
        const status = getPointStatus(state);
        pointProgress.textContent = `${status.filled}/${status.total} classified`;
    };

    const updateThumbPointsStatus = function () {
        if (!thumbGrid) {
            return;
        }

        const cards = thumbGrid.querySelectorAll('.thumb-card[data-file-key]');
        cards.forEach(function (card) {
            const fileKey = card.getAttribute('data-file-key');
            if (!fileKey) {
                return;
            }
            const state = ensureQuadratState(fileKey);
            ensurePointClasses(state);
            const status = getPointStatus(state);
            const target = card.querySelector('[data-point-status]');
            if (target) {
                target.textContent = `Points: ${status.filled}/${status.total}`;
            }
        });
    };

    const hasAnyClassifications = function () {
        return selectedFiles.some(function (file) {
            const state = quadratStateByKey[getFileKey(file)];
            if (!state) {
                return false;
            }
            ensurePointClasses(state);
            return state.pointClasses.some(function (value) {
                return Boolean(value);
            });
        });
    };

    const openAnalyzeModal = function () {
        if (!analyzeModal) {
            return;
        }
        analyzeModal.classList.add('is-visible');
        analyzeModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
    };

    const closeAnalyzeModal = function () {
        if (!analyzeModal) {
            return;
        }
        analyzeModal.classList.remove('is-visible');
        analyzeModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
    };

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
        if (analyzeProgressList) {
            analyzeProgressList.innerHTML = '';
        }
        if (analyzeCloseBtn) {
            analyzeCloseBtn.disabled = true;
            analyzeCloseBtn.setAttribute('aria-disabled', 'true');
        }
    };

    const initAnalyzeProgressList = function () {
        if (!analyzeProgressList) {
            return;
        }
        analyzeProgressList.innerHTML = '';
        selectedFiles.forEach(function (file) {
            const item = document.createElement('li');
            item.setAttribute('data-file-key', getFileKey(file));
            item.innerHTML = `<span>${escapeHtml(file.name)} - Pending</span><em class="dot dot-pending"></em>`;
            analyzeProgressList.appendChild(item);
        });
    };

    const setAnalyzeProgress = function (currentIndex, total, fileName) {
        const progress = total ? Math.round(((currentIndex + 1) / total) * 100) : 0;
        if (analyzeProgressFill) {
            analyzeProgressFill.style.width = `${progress}%`;
        }
        if (analyzeProgressText) {
            analyzeProgressText.textContent = `${progress}% (${currentIndex + 1}/${total})`;
        }
        if (analyzeStatus) {
            analyzeStatus.textContent = fileName ? `Analyzing ${fileName}...` : 'Analyzing images...';
        }
    };

    const markAnalyzeItemDone = function (fileKey) {
        if (!analyzeProgressList) {
            return;
        }
        const items = analyzeProgressList.querySelectorAll('li[data-file-key]');
        items.forEach(function (item) {
            if (item.getAttribute('data-file-key') !== fileKey) {
                return;
            }
            const label = item.querySelector('span');
            if (label) {
                label.textContent = label.textContent.replace('Pending', 'Done');
            }
            item.querySelectorAll('em').forEach(function (node) {
                node.classList.remove('dot-pending');
                node.classList.add('dot-a');
            });
        });
    };

    const renderPointList = function () {
        if (!pointList) {
            return;
        }

        const activeFile = getActiveFile();
        if (!activeFile) {
            pointList.innerHTML = '<p class="thumb-empty-state">Select an image to classify points.</p>';
            return;
        }

        const state = ensureQuadratState(getFileKey(activeFile));
        ensurePointClasses(state);

        const rows = state.points.map(function (_point, index) {
            const options = ['<option value="">Select class</option>']
                .concat(POINT_CLASSES.map(function (label) {
                    const selected = state.pointClasses[index] === label ? ' selected' : '';
                    return `<option value="${label}"${selected}>${label}</option>`;
                }))
                .join('');

            return `
                <label class="point-row">
                    <span>Point ${index + 1}</span>
                    <select data-point-index="${index}">${options}</select>
                </label>
            `;
        }).join('');

        pointList.innerHTML = rows || '<p class="thumb-empty-state">No points yet.</p>';
        updatePointProgress();
    };

    const getImageBounds = function () {
        const size = getCanvasSize();
        if (!size.width || !size.height || !quadratImage) {
            return { x: 0, y: 0, w: size.width, h: size.height };
        }

        const naturalWidth = quadratImage.naturalWidth || 0;
        const naturalHeight = quadratImage.naturalHeight || 0;
        if (!naturalWidth || !naturalHeight) {
            return { x: 0, y: 0, w: size.width, h: size.height };
        }

        const scale = Math.min(size.width / naturalWidth, size.height / naturalHeight);
        const displayWidth = naturalWidth * scale;
        const displayHeight = naturalHeight * scale;
        const offsetX = (size.width - displayWidth) / 2;
        const offsetY = (size.height - displayHeight) / 2;

        return { x: offsetX, y: offsetY, w: displayWidth, h: displayHeight };
    };

    const ensureDefaultRect = function (state, bounds) {
        if (state.rect) {
            return false;
        }

        const size = DEFAULT_RECT_SCALE;
        const rectW = bounds.w * size;
        const rectH = bounds.h * size;
        const rectPx = {
            x: bounds.x + (bounds.w - rectW) / 2,
            y: bounds.y + (bounds.h - rectH) / 2,
            w: rectW,
            h: rectH
        };
        const canvasSize = getCanvasSize();
        state.rect = toNormalizedRect(rectPx, canvasSize.width, canvasSize.height);
        state.points = generateRandomPoints(MIN_POINTS);
        ensurePointClasses(state);
        return true;
    };

    const drawQuadrat = function () {
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

        const activeFile = getActiveFile();
        if (!activeFile) {
            return;
        }

        const state = ensureQuadratState(getFileKey(activeFile));
        if (!state.rect) {
            return;
        }

        ensurePointClasses(state);
        updatePointProgress();

        const rectPx = toPixelRect(state.rect, size.width, size.height);

        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 2;
        ctx.strokeRect(rectPx.x, rectPx.y, rectPx.w, rectPx.h);

        const handles = getHandles(rectPx);
        ctx.fillStyle = '#ff8a3d';
        Object.values(handles).forEach(function (handle) {
            ctx.fillRect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        });

        if (state.points.length) {
            ctx.fillStyle = '#e53b2c';
            ctx.font = '12px "Segoe UI", Arial, sans-serif';
            state.points.forEach(function (point, index) {
                const x = rectPx.x + point.x * rectPx.w;
                const y = rectPx.y + point.y * rectPx.h;
                const indexLabel = index + 1;
                ctx.fillText(`+${indexLabel}`, x + 6, y - 6);
            });
        }
    };

    const updateQuadratPreview = function () {
        if (!quadratImage || !quadratCanvas || !quadratEmpty) {
            return;
        }

        const activeFile = getActiveFile();
        if (!activeFile) {
            quadratImage.removeAttribute('src');
            quadratCanvas.style.display = 'none';
            quadratEmpty.style.display = 'flex';
            if (quadratImageLabel) {
                quadratImageLabel.textContent = 'Select an image';
            }
            renderPointList();
            return;
        }

        if (quadratImageLabel) {
            quadratImageLabel.textContent = activeFile.name;
        }

        if (quadratPointsCount) {
            quadratPointsCount.textContent = `${MIN_POINTS} points`;
        }

        if (activeImageUrl) {
            URL.revokeObjectURL(activeImageUrl);
        }

        activeImageUrl = URL.createObjectURL(activeFile);
        quadratImage.src = activeImageUrl;
        quadratCanvas.style.display = 'block';
        quadratEmpty.style.display = 'none';

        quadratImage.onload = function () {
            syncCanvasSize();
            const state = ensureQuadratState(getFileKey(activeFile));
            const bounds = getImageBounds();
            const didCreateDefault = ensureDefaultRect(state, bounds);
            ensurePointClasses(state);
            renderPointList();
            updateThumbPointsStatus();
            drawQuadrat();
            if (didCreateDefault) {
                updateSubmitState();
            }
        };
    };

    const renderSelectedFiles = function () {
        if (!thumbGrid) {
            return;
        }

        if (!selectedFiles.length) {
            thumbGrid.innerHTML = initialThumbMarkup || '<p class="thumb-empty-state" id="thumb-empty-state">No images selected yet.</p>';
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
            card.innerHTML = `
                <div class="thumb-card-head">
                    <div class="thumb-box">
                        <img class="thumb-image" src="${thumbUrl}" alt="${safeFileName}">
                    </div>
                    <button type="button" aria-label="Remove ${safeFileName}" data-remove-index="${index}">&times;</button>
                </div>
                <p>${formatFileSize(file.size)}</p>
                <p class="thumb-points-status" data-point-status>Points: 0/${MIN_POINTS}</p>
            `;

            thumbGrid.appendChild(card);
        });

        updateQuadratPreview();
        updateSubmitState();
        updateSummary();
        updateThumbPointsStatus();
    };

    const syncFiles = function (fileList) {
        selectedFiles.length = 0;
        Array.from(fileList).forEach(function (file) {
            selectedFiles.push(file);
        });

        if (activeFileIndex >= selectedFiles.length) {
            activeFileIndex = 0;
        }

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
            const droppedFiles = event.dataTransfer && event.dataTransfer.files;
            if (!droppedFiles || !droppedFiles.length) {
                return;
            }

            syncFiles(droppedFiles);

            if (uploadInput) {
                try {
                    const transfer = new DataTransfer();
                    Array.from(droppedFiles).forEach(function (file) {
                        transfer.items.add(file);
                    });
                    uploadInput.files = transfer.files;
                } catch (error) {
                    // Fallback for environments that prevent assigning FileList directly.
                }
            }
        });
    }

    if (uploadInput) {
        uploadInput.addEventListener('change', function () {
            if (uploadInput.files && uploadInput.files.length) {
                syncFiles(uploadInput.files);
                return;
            }
            selectedFiles.length = 0;
            renderSelectedFiles();
            updateSummary();
        });
    }

    if (thumbGrid) {
        thumbGrid.addEventListener('click', function (event) {
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

            selectedFiles.splice(removeIndex, 1);

            if (uploadInput) {
                try {
                    const transfer = new DataTransfer();
                    selectedFiles.forEach(function (file) {
                        transfer.items.add(file);
                    });
                    uploadInput.files = transfer.files;
                } catch (error) {
                    // Fallback for environments that prevent assigning FileList directly.
                }
            }

            renderSelectedFiles();
        });

    }

    if (pointList) {
        pointList.addEventListener('change', function (event) {
            const select = event.target.closest('select[data-point-index]');
            if (!select) {
                return;
            }

            const activeFile = getActiveFile();
            if (!activeFile) {
                return;
            }

            const index = Number(select.getAttribute('data-point-index'));
            if (Number.isNaN(index)) {
                return;
            }

            const state = ensureQuadratState(getFileKey(activeFile));
            ensurePointClasses(state);
            state.pointClasses[index] = select.value;
            updatePointProgress();
            updateThumbPointsStatus();
        });
    }

    if (analyzeAllBtn) {
        analyzeAllBtn.addEventListener('click', function () {
            runAnalyzeAll();
        });
    }

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

    if (quadratCanvas) {
        quadratCanvas.addEventListener('mousedown', function (event) {
            const activeFile = getActiveFile();
            if (!activeFile) {
                return;
            }

            const size = getCanvasSize();
            if (!size.width || !size.height) {
                return;
            }

            const state = ensureQuadratState(getFileKey(activeFile));
            const pos = getPointerPos(event);
            let rectPx = state.rect ? toPixelRect(state.rect, size.width, size.height) : null;

            if (rectPx) {
                const handleHit = getHandleHit(rectPx, pos);
                if (handleHit) {
                    dragMode = 'resize';
                    activeHandle = handleHit;
                } else if (isInsideRect(rectPx, pos)) {
                    dragMode = 'move';
                } else {
                    dragMode = 'draw';
                    rectPx = { x: pos.x, y: pos.y, w: 0, h: 0 };
                }
            } else {
                dragMode = 'draw';
                rectPx = { x: pos.x, y: pos.y, w: 0, h: 0 };
            }

            dragStart = pos;
            startRectPx = rectPx;
            if (dragMode === 'draw') {
                state.rect = toNormalizedRect(rectPx, size.width, size.height);
                state.points = [];
                drawQuadrat();
            }
        });

        quadratCanvas.addEventListener('mousemove', function (event) {
            const activeFile = getActiveFile();
            if (!activeFile) {
                return;
            }

            const size = getCanvasSize();
            if (!size.width || !size.height) {
                return;
            }

            const state = ensureQuadratState(getFileKey(activeFile));
            const pos = getPointerPos(event);
            const bounds = getImageBounds();

            if (!dragMode) {
                if (state.rect) {
                    const rectPx = toPixelRect(state.rect, size.width, size.height);
                    const handleHit = getHandleHit(rectPx, pos);
                    if (handleHit) {
                        quadratCanvas.style.cursor = handleHit === 'ne' || handleHit === 'sw' ? 'nesw-resize' : 'nwse-resize';
                    } else if (isInsideRect(rectPx, pos)) {
                        quadratCanvas.style.cursor = 'move';
                    } else {
                        quadratCanvas.style.cursor = 'crosshair';
                    }
                }
                return;
            }

            let nextRectPx = { ...startRectPx };
            if (dragMode === 'draw') {
                nextRectPx.w = pos.x - dragStart.x;
                nextRectPx.h = pos.y - dragStart.y;
            } else if (dragMode === 'move') {
                const dx = pos.x - dragStart.x;
                const dy = pos.y - dragStart.y;
                nextRectPx.x = startRectPx.x + dx;
                nextRectPx.y = startRectPx.y + dy;
            } else if (dragMode === 'resize') {
                const dx = pos.x - dragStart.x;
                const dy = pos.y - dragStart.y;
                if (activeHandle === 'nw') {
                    nextRectPx.x = startRectPx.x + dx;
                    nextRectPx.y = startRectPx.y + dy;
                    nextRectPx.w = startRectPx.w - dx;
                    nextRectPx.h = startRectPx.h - dy;
                } else if (activeHandle === 'ne') {
                    nextRectPx.y = startRectPx.y + dy;
                    nextRectPx.w = startRectPx.w + dx;
                    nextRectPx.h = startRectPx.h - dy;
                } else if (activeHandle === 'se') {
                    nextRectPx.w = startRectPx.w + dx;
                    nextRectPx.h = startRectPx.h + dy;
                } else if (activeHandle === 'sw') {
                    nextRectPx.x = startRectPx.x + dx;
                    nextRectPx.w = startRectPx.w - dx;
                    nextRectPx.h = startRectPx.h + dy;
                }
            }

            nextRectPx = clampRect(nextRectPx, bounds);
            state.rect = toNormalizedRect(nextRectPx, size.width, size.height);
            drawQuadrat();
        });

        const endDrag = function () {
            const activeFile = getActiveFile();
            if (!activeFile) {
                dragMode = null;
                activeHandle = null;
                return;
            }

            if (!dragMode) {
                return;
            }

            const state = ensureQuadratState(getFileKey(activeFile));
            if (state.rect) {
                state.points = generateRandomPoints(MIN_POINTS);
                ensurePointClasses(state);
            }

            dragMode = null;
            activeHandle = null;
            drawQuadrat();
            updateSubmitState();
            renderPointList();
            updateThumbPointsStatus();
        };

        quadratCanvas.addEventListener('mouseup', endDrag);
        quadratCanvas.addEventListener('mouseleave', endDrag);
        window.addEventListener('mouseup', endDrag);
    }

    if (quadratImage) {
        window.addEventListener('resize', function () {
            if (!getActiveFile()) {
                return;
            }
            syncCanvasSize();
            drawQuadrat();
        });
    }

    renderSelectedFiles();
    updateSummary();
    updatePointProgress();

    const modal = document.getElementById('process-modal');
    const openModalBtn = document.getElementById('process-open-btn');
    const closeModalBtn = document.getElementById('process-close-btn');

    if (modal && openModalBtn && closeModalBtn && openModalBtn.type === 'button') {
        const openModal = function () {
            modal.classList.add('is-visible');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
        };

        const closeModal = function () {
            modal.classList.remove('is-visible');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        };

        openModalBtn.addEventListener('click', openModal);
        closeModalBtn.addEventListener('click', closeModal);

        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    }

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
            if (!isReadyToAnalyze()) {
                event.preventDefault();
                updateSubmitState();
                return;
            }
            syncQuadratInputs();
        });
    }

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
