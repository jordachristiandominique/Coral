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

        // Typing coordinates moves the pin (the other half of the two-way bind)
        const syncPinFromInputs = function () {
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

            // Only recenter when the pin would otherwise be off-screen, so the
            // map doesn't jump around on every keystroke.
            if (!map.getBounds().contains(latlng)) {
                map.panTo(latlng);
            }
        };

        [latInput, lngInput].forEach(function (input) {
            if (!input) {
                return;
            }
            input.addEventListener('input', syncPinFromInputs);
            input.addEventListener('change', syncPinFromInputs);
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
    const imagePrevBtn = document.getElementById('image-prev-btn');
    const imageNextBtn = document.getElementById('image-next-btn');
    const imageNavCounter = document.getElementById('image-nav-counter');
    const imageLoupe = document.getElementById('image-loupe');
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
    const DEFAULT_RECT_SCALE = 0.5;
    const POINT_CLASSES = [
        'Hard Coral',
        'Soft Coral',
        'Macroalgae',
        'Halimeda',
        'Algae Assemblage',
        'Abiotic',
        'Other Biota'
    ];
    // CPCE code shown to the surveyor/expert for each class. The stored value
    // stays the full class name so backend coverage logic is unaffected.
    const CPCE_CODES = {
        'Hard Coral': 'HC',
        'Soft Coral': 'SC',
        'Macroalgae': 'MA',
        'Halimeda': 'HA',
        'Algae Assemblage': 'AA',
        'Abiotic': 'AB',
        'Other Biota': 'OB'
    };
    // Build <option> markup for a point-class dropdown, marking `selected` current.
    const buildClassOptions = function (selectedClass) {
        return POINT_CLASSES.map(function (cls) {
            const code = CPCE_CODES[cls] || '';
            const isSel = cls === selectedClass ? ' selected' : '';
            return `<option value="${cls}"${isSel}>${code} – ${cls}</option>`;
        }).join('');
    };
    const MAX_ANALYZE_SIZE = 1200;
    const ANALYZE_PATCH_RADIUS = 6;
    const ANALYZE_SAT_MIN = 0.22;
    const ANALYZE_VAL_MIN = 0.18;
    let activeFileIndex = 0;
    let activeImageUrl = null;
    let aiResultsByFileKey = {};
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

        // Ready when all files have completed AI analysis with valid data
        return selectedFiles.every(function (file) {
            const fileKey = getFileKey(file);
            const results = aiResultsByFileKey[fileKey];
            // Must have points, quadrat_bbox, and coverage data (all required for backend)
            return results && 
                   results.points && 
                   results.points.length > 0 && 
                   results.quadrat_bbox && 
                   results.coverage_class &&
                   results.coverage_percent !== undefined;
        });
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
                ? 'Ready to run AI analysis. Click below to automatically detect coral species.'
                : 'Upload at least one image to enable AI analysis.';
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
                submitHint.textContent = 'Image analysis complete! Review coverage data and click Upload to save the batch.';
                submitHint.style.color = '#2a8793';
            } else {
                submitHint.textContent = 'Upload images and run AI analysis to detect coral coverage.';
                submitHint.style.color = '';
            }
        }
    };

    const syncQuadratInputs = function () {
        if (!quadratInputs) {
            return true; // No quadrat inputs field, so skip
        }

        quadratInputs.innerHTML = '';
        let hasErrors = false;

        selectedFiles.forEach(function (file, index) {
            const fileKey = getFileKey(file);
            const results = aiResultsByFileKey[fileKey];

            // Validate that results exist and have all required fields
            if (!results || !results.quadrat_bbox || !results.points || !results.coverage_class) {
                hasErrors = true;
                console.error(`Missing AI results for image ${index + 1}: ${file.name}`);
                return;
            }

            // Backend expects: rect, points, point_classes (all 7 coral classes preserved)
            const payload = {
                rect: results.quadrat_bbox,  // quadrat_bbox -> rect
                points: results.points,
                point_classes: results.points.map(function (p) {
                    // Keep all 7 coral class names exactly as generated by AI
                    // Don't simplify to "Live coral"/"Non-coral" - preserve detail!
                    return p.class;
                })
            };

            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = `image_quadrat_${index + 1}`;  // Match backend: image_quadrat_1, image_quadrat_2, etc.
            input.value = JSON.stringify(payload);
            quadratInputs.appendChild(input);

            console.log(`✓ Serialized AI data for image ${index + 1}:`, payload);
        });

        if (hasErrors) {
            console.error('Cannot submit: AI analysis incomplete for one or more images');
            return false;
        }

        return true;
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

    /**
     * Draw a CPCE-style survey point: a cross (+) marker with its number
     * beside it. Both are drawn with a dark halo so they stay readable over
     * any substrate (pale sand, dark coral, bright algae).
     */
    const drawCpcePoint = function (ctx, x, y, label, options) {
        const opts = options || {};
        const arm = opts.arm || 7;             // half-length of each cross arm
        const lineWidth = opts.lineWidth || 1.5;
        const color = opts.color || '#ffffff';
        const font = opts.font || 'bold 11px "Segoe UI", Arial, sans-serif';

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

        // Scale quadrat from natural image coordinates to display coordinates
        const rectPx = {
            x: offsetX + quadratBbox.x * displayWidth,
            y: offsetY + quadratBbox.y * displayHeight,
            w: quadratBbox.w * displayWidth,
            h: quadratBbox.h * displayHeight
        };

        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 2;
        ctx.strokeRect(rectPx.x, rectPx.y, rectPx.w, rectPx.h);

        // Draw CPCE-style cross markers with point numbers
        if (points && points.length) {
            points.forEach(function (point, index) {
                const x = rectPx.x + point.x * rectPx.w;
                const y = rectPx.y + point.y * rectPx.h;
                drawCpcePoint(ctx, x, y, index + 1, {
                    arm: 7,
                    lineWidth: 1.5,
                    font: 'bold 11px "Segoe UI", Arial, sans-serif'
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
            const fileKey = getFileKey(file);
            
            setAnalyzeProgress(i, selectedFiles.length, file.name);
            
            try {
                // TODO: Replace with actual YOLO API call
                // For now, generate mock AI results
                const mockResults = await generateMockAIResults(file);
                aiResultsByFileKey[fileKey] = mockResults;
                markAnalyzeItemDone(fileKey);
            } catch (error) {
                console.error('Error analyzing file:', error);
                // Continue with next file
            }
        }

        isAnalyzing = false;
        if (analyzeAllBtn) {
            analyzeAllBtn.textContent = 'Re-analyze images';
        }

        if (analyzeStatus) {
            analyzeStatus.textContent = '✓ Analysis complete. Review the classified points below.';
        }
        if (analyzeCloseBtn) {
            analyzeCloseBtn.disabled = false;
            analyzeCloseBtn.setAttribute('aria-disabled', 'false');
        }

        setActiveFileIndex(0);
        renderPointList();
        updateThumbPointsStatus();
        updateSubmitState();
    };

    const generateMockAIResults = function (file) {
        return new Promise(function (resolve) {
            // Load image for color-based classification (for demo purposes)
            const img = new Image();
            const fileKey = getFileKey(file);
            const startTime = Date.now();
            const timeout = 3000; // 3 second timeout

            const processImage = function (image) {
                try {
                    // ALWAYS use centered quadrat (60% width, 70% height)
                    // This ensures quadrat_bbox is NEVER null
                    const quadratBbox = {
                        x: 0.05,      // 5% from left
                        y: 0.15,      // 15% from top
                        w: 0.9,       // 90% width
                        h: 0.7        // 70% height
                    };

                    // 7 coral classification classes
                    const allClasses = [
                        'Hard Coral',
                        'Soft Coral',
                        'Macroalgae',
                        'Halimeda',
                        'Algae Assemblage',
                        'Abiotic',
                        'Other Biota'
                    ];

                    // Simple classification: Ensure all 7 classes appear
                    // Use deterministic cycling to guarantee variety
                    const points = [];
                    for (let i = 0; i < 10; i++) {
                        // Deterministic: cycle through all 7 classes, repeating as needed
                        const classIdx = i % 7;

                        points.push({
                            x: Math.random(),
                            y: Math.random(),
                            class: allClasses[classIdx]
                        });
                    }

                    // Calculate coverage: coral classes = HC, SC, MA, HA, AA, OB (6 out of 7)
                    const coralClasses = ['Hard Coral', 'Soft Coral', 'Macroalgae', 'Halimeda', 'Algae Assemblage', 'Other Biota'];
                    const coralCount = points.filter(function (p) {
                        return coralClasses.indexOf(p.class) !== -1;
                    }).length;
                    const coveragePercent = Math.round((coralCount / points.length) * 100);

                    const results = {
                        quadrat_bbox: quadratBbox,  // GUARANTEED to be set
                        points: points,              // GUARANTEED to have 10 items
                        coverage_percent: coveragePercent,
                        coverage_class: getCoverageClass(coveragePercent)
                    };

                    console.log(`✓ AI Results for ${file.name}:`, results);
                    
                    // Simulate processing delay
                    setTimeout(function () {
                        resolve(results);
                    }, 200);

                } catch (error) {
                    console.error(`Error processing image ${file.name}:`, error);
                    // Fallback: guaranteed valid data
                    resolve(createFallbackResults());
                }
            };

            const createFallbackResults = function () {
                return {
                    quadrat_bbox: {
                        x: 0.05,
                        y: 0.15,
                        w: 0.9,
                        h: 0.7
                    },
                    points: [
                        { x: Math.random(), y: Math.random(), class: 'Hard Coral' },
                        { x: Math.random(), y: Math.random(), class: 'Soft Coral' },
                        { x: Math.random(), y: Math.random(), class: 'Macroalgae' },
                        { x: Math.random(), y: Math.random(), class: 'Halimeda' },
                        { x: Math.random(), y: Math.random(), class: 'Algae Assemblage' },
                        { x: Math.random(), y: Math.random(), class: 'Abiotic' },
                        { x: Math.random(), y: Math.random(), class: 'Other Biota' },
                        { x: Math.random(), y: Math.random(), class: 'Hard Coral' },
                        { x: Math.random(), y: Math.random(), class: 'Soft Coral' },
                        { x: Math.random(), y: Math.random(), class: 'Macroalgae' }
                    ],
                    coverage_percent: 60,
                    coverage_class: 'A'
                };
            };

            // Try to load image
            img.onload = function () {
                processImage(img);
            };

            img.onerror = function () {
                console.warn(`Image load failed for ${file.name}, using fallback data`);
                // Use fallback after delay
                setTimeout(function () {
                    resolve(createFallbackResults());
                }, 200);
            };

            // Timeout protection: if image takes too long, use fallback
            setTimeout(function () {
                if (Date.now() - startTime > timeout) {
                    console.warn(`Image load timeout for ${file.name}, using fallback data`);
                    resolve(createFallbackResults());
                }
            }, timeout);

            // Set image source to trigger load
            img.src = URL.createObjectURL(file);
        });
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
            const results = aiResultsByFileKey[fileKey];
            const target = card.querySelector('[data-point-status]');
            if (target) {
                if (results && results.points) {
                    const coverage = getCoralCoveragePercent(results.points);
                    target.textContent = `Analysis: ${coverage}% coverage`;
                } else {
                    target.textContent = 'Analysis: Pending';
                }
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

    const getConfidenceClass = function (confidence) {
        if (confidence >= 90) return 'confidence-high';
        if (confidence >= 70) return 'confidence-medium';
        return 'confidence-low';
    };

    const getCoralCoveragePercent = function (points) {
        // Coral Coverage: Only Hard Coral + Soft Coral
        if (!points || !points.length) {
            return 0;
        }
        const coralClasses = ['Hard Coral', 'Soft Coral'];
        const coralCount = points.filter(function (p) {
            return coralClasses.indexOf(p.class) !== -1;
        }).length;
        return Math.round((coralCount / points.length) * 100);
    };

    const getCoverageClass = function (coveragePercent) {
        if (coveragePercent >= 60) return 'A';
        if (coveragePercent >= 40) return 'B';
        return 'C';
    };

    const renderPointList = function () {
        const pointList = document.getElementById('point-list');
        const coverageClassEl = document.getElementById('coverage-class');
        const coveragePercentEl = document.getElementById('coral-coverage-percent');
        
        if (!pointList) {
            return;
        }

        const activeFile = getActiveFile();
        if (!activeFile) {
            pointList.innerHTML = '<p class="thumb-empty-state">Select an image to view analysis results.</p>';
            if (coverageClassEl) {
                coverageClassEl.textContent = 'Class: Pending';
            }
            if (coveragePercentEl) {
                coveragePercentEl.textContent = 'Coverage: 0%';
            }
            return;
        }

        const results = aiResultsByFileKey[getFileKey(activeFile)];
        if (!results || !results.points) {
            pointList.innerHTML = '<p class="thumb-empty-state">Run AI analysis to classify points.</p>';
            if (coverageClassEl) {
                coverageClassEl.textContent = 'Class: Pending';
            }
            if (coveragePercentEl) {
                coveragePercentEl.textContent = 'Coverage: 0%';
            }
            return;
        }

        const points = results.points || [];
        if (!points.length) {
            pointList.innerHTML = '<p class="thumb-empty-state">No points detected.</p>';
            if (coverageClassEl) {
                coverageClassEl.textContent = 'Class: Pending';
            }
            if (coveragePercentEl) {
                coveragePercentEl.textContent = 'Coral Coverage: 0%';
            }
            return;
        }

        const updateCoverageLabels = function () {
            const pct = getCoralCoveragePercent(results.points);
            if (coverageClassEl) {
                coverageClassEl.textContent = `Class: ${getCoverageClass(pct)}`;
            }
            if (coveragePercentEl) {
                coveragePercentEl.textContent = `Coral Coverage: ${pct}%`;
            }
        };

        const rows = points.map(function (point, index) {
            const current = point.class || '';
            return `
                <label class="point-row">
                    <span class="point-row-label">Point ${index + 1}</span>
                    <select class="point-class-select" data-index="${index}"
                        aria-label="Class for point ${index + 1}">
                        ${buildClassOptions(current)}
                    </select>
                </label>
            `;
        }).join('');

        pointList.innerHTML = rows;

        // Let the surveyor/expert correct any point's class. Updating the value
        // recomputes coverage/class live and keeps the submitted data in sync.
        pointList.querySelectorAll('.point-class-select').forEach(function (select) {
            select.addEventListener('change', function () {
                const idx = parseInt(this.getAttribute('data-index'), 10);
                if (!isNaN(idx) && results.points[idx]) {
                    results.points[idx].class = this.value;
                    updateCoverageLabels();
                    if (typeof updateSubmitState === 'function') {
                        updateSubmitState();
                    }
                }
            });
        });

        updateCoverageLabels();
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
            state.points.forEach(function (point, index) {
                const x = rectPx.x + point.x * rectPx.w;
                const y = rectPx.y + point.y * rectPx.h;
                drawCpcePoint(ctx, x, y, index + 1, {
                    arm: 7,
                    lineWidth: 1.5,
                    font: 'bold 11px "Segoe UI", Arial, sans-serif'
                });
            });
        }
    };

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

    const hideLoupe = function () {
        if (imageLoupe) {
            imageLoupe.hidden = true;
        }
    };

    const updateLoupe = function (event) {
        if (!imageLoupe || !quadratImage || !quadratCanvas) {
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

            (results.points || []).forEach(function (point, index) {
                const p = toLoupe(rect.x + point.x * rect.w, rect.y + point.y * rect.h);
                if (p.x < -20 || p.y < -20 || p.x > LOUPE_SIZE + 20 || p.y > LOUPE_SIZE + 20) {
                    return; // outside the magnified view
                }
                drawCpcePoint(ctx, p.x, p.y, index + 1, {
                    arm: 12,
                    lineWidth: 2,
                    font: 'bold 14px "Segoe UI", Arial, sans-serif'
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
            renderPointList();
            return;
        }

        if (quadratImageLabel) {
            quadratImageLabel.textContent = activeFile.name;
        }

        const results = aiResultsByFileKey[getFileKey(activeFile)];
        if (quadratPointsCount) {
            if (results && results.points) {
                quadratPointsCount.textContent = `${results.points.length} points classified`;
            } else {
                quadratPointsCount.textContent = 'Analysis pending';
            }
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
            if (results && results.quadrat_bbox && results.points) {
                drawQuadratAndPoints(results.quadrat_bbox, results.points);
            }
            renderPointList();
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

            const results = aiResultsByFileKey[fileKey];
            const statusText = results && results.points ? `${getCoralCoveragePercent(results.points)}% coverage` : 'Pending';

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
        pointList.addEventListener('click', function (event) {
            // Species list items can be clicked to select/deselect for manual review
            const speciesItem = event.target.closest('.species-item');
            if (speciesItem) {
                speciesItem.classList.toggle('selected');
            }
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

    // Hover over the preview to magnify; the loupe never blocks quadrat editing
    if (quadratCanvas && imageLoupe) {
        quadratCanvas.addEventListener('mousemove', updateLoupe);
        quadratCanvas.addEventListener('mouseleave', hideLoupe);
    }

    const reanalyzeBtn = document.getElementById('reanalyze-btn');
    if (reanalyzeBtn) {
        reanalyzeBtn.addEventListener('click', function () {
            // Clear AI results and re-run analysis
            aiResultsByFileKey = {};
            updateThumbPointsStatus();
            renderSpeciesList();
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

    // AI Results Display - Canvas is now read-only (used to display AI-detected quadrats)
    // Manual drawing has been replaced with AI automation
    if (quadratCanvas) {
        // Prevent default interactions on canvas
        quadratCanvas.style.cursor = 'default';
    }

    if (quadratImage) {
        window.addEventListener('resize', function () {
            if (!getActiveFile()) {
                return;
            }
            syncCanvasSize();
            const activeFile = getActiveFile();
            const results = aiResultsByFileKey[getFileKey(activeFile)];
            if (results && results.quadrat_bbox && results.points) {
                drawQuadratAndPoints(results.quadrat_bbox, results.points);
            }
        });
    }

    renderSelectedFiles();
    updateSummary();
    updateSubmitState();

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
            // Double-check that all data is ready before submission
            if (!isReadyToAnalyze()) {
                event.preventDefault();
                console.warn('Form submission blocked: AI analysis not complete for all images');
                alert('Please complete AI analysis for all images before uploading the batch.');
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

            // Form can now submit
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
