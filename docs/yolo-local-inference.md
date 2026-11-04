# Local YOLO inference preparation

The current artifact is `yolov8s-v4-3x`, trained on Roboflow version 4 with
Hard Coral, Soft Coral, and quadrat_area. It is prepared for local CPU inference;
this step does not connect the upload page or change survey records.

## Private files

Keep these together in `model_artifacts/yolov8s-v4-3x/`:

- `yolov8s_v4_3x_best.pt`: trusted trained weights, ignored by Git.
- `yolov8s_v4_3x_best.metadata.json`: original training metadata, unchanged.
- `artifact.json`: checkpoint SHA-256, multiplier, and provenance from Colab logs.

The directory is outside static and uploaded media and has no public URL. Do not
publish its weights via Django static/media routes. Transfer weights separately
when deploying; Git alone does not supply them. The root-level checkpoint files
were moved into this directory, and their original staged additions were removed
from the Git index to avoid committing the binary. No commit is created here.

Keep the original Drive run ZIP as backup. Its original `package_versions.json`
has not been supplied; if available, place it here as
`package_versions.training.json`. A local package snapshot is not a replacement
for the training snapshot. Actual original training used CUDA; this local setup
uses the same Torch release with CPU binaries.

## Install in the existing Python 3.13 project environment

From the project root in PowerShell:

```powershell
.venv/Scripts/python.exe -m pip install -r requirements-inference.txt
.venv/Scripts/python.exe -m pip check
```

The optional requirements file includes the existing web requirements and pins
Ultralytics 8.4.199, Torch 2.11.0+cpu, and Torchvision 0.26.0+cpu. Existing pinned
web dependencies remain in `requirements.txt`. Do not use the global Python 3.14
interpreter for this environment. CPU performance must be measured locally; the
Colab T4 speed does not describe this computer.

## One-image check

```powershell
.venv/Scripts/python.exe scripts/check_yolo_inference.py --image "path/to/photo.jpg"
```

The script checks the weights hash, metadata, checkpoint class order, image
decoding, and one CPU prediction at size 640, confidence 0.25, maximum 100 boxes.
It writes JSON detections in original-image coordinates (after EXIF orientation),
a box-only preview, and local dependency versions to ignored
`backups/inference-smoke/`. Its first-call timing includes prediction setup and
is not a steady-state benchmark. Zero detections are possible and are not an
inference error. No source image or database record is modified.

This does not measure accuracy, classify sampling points, or compute HCC. The upload page now uses this endpoint for detection and requires researcher
review before persisting canonical point-based HCC results.

For a new model, add a separate artifact directory and provenance, validate its
classes and runtime output, then explicitly select it during endpoint integration.
Do not overwrite this baseline or silently reanalyse historical surveys.

## Django inference endpoint

`POST /accounts/researcher/analyze-image/` (URL name `analyze_survey_image`)
accepts exactly one multipart file named `image`. It requires a logged-in active
researcher or administrator and a valid CSRF token. Pending users redirect to
approval, superadmins to the Django admin, and anonymous users to login, following
the project's role conventions. It does not accept a client-supplied model path.

The image bytes are decoded with Pillow; filenames and MIME types are not trusted
as validation. Supported formats are non-animated JPEG, PNG, and WebP. Limits in
`coral_app/settings.py` default to 20 MiB and 25 million pixels. EXIF orientation
is applied before prediction, and the response dimensions describe the upright
image. Multipart temporary uploads follow Django's normal cleanup; inference
does not save an image, create a survey, or persist detections.

The `accounts/yolo_inference.py` module lazily verifies the manifest checksum,
metadata class order, and actual checkpoint class order. It caches the loaded
model per server process and serializes prediction within that process. An
overlapping request receives HTTP 503 with code `inference_busy` and
`Retry-After: 1`; batch callers should process sequentially and retry briefly.
Multiple server workers each have their own model and lock, so deployment must
budget memory/concurrency accordingly. Torch is not loaded during Django startup.

Successful JSON contains:

- `success: true`, `schema_version: 1`, `review_required: true`.
- `model`: artifact ID, architecture, SHA-256, dataset version, augmentation
  multiplier, and class names; no local filesystem paths.
- `image`: upright width/height and `orientation: "exif_transposed"`.
- `parameters`: fixed CPU, image size 640, confidence 0.25, maximum 100 boxes.
- `detections`: stable-within-response IDs, class IDs/names, confidence, and
  `box: {x, y, w, h}` normalized to the complete upright image. Detections outside
  the quadrat are retained; no box is silently clipped into the sampling area.
- `quadrat`: highest-confidence quadrat detection, or `null`. All candidates
  remain in `detections`; this suggestion must be confirmed by the researcher.
- `warnings`: `missing_quadrat` or `multiple_quadrats` where appropriate. A
  missing quadrat is a successful inference requiring manual boundary selection,
  not permission to invent a centered boundary or classify the remainder.

Error JSON uses `success: false`, `code`, and `error`: HTTP 400 for missing,
multiple, unsupported, or corrupt images; 413 for image size limits; 503 for a
busy process or unavailable model; and 500 for unexpected prediction failures.
Authentication redirects, CSRF rejection (403), and method rejection (405) use
normal Django responses, so future frontend code must handle those too. Internal
exceptions are logged server-side without returning private paths to clients.

There is no point classification, HCC calculation, confidence tuning UI, automatic
non-coral assignment, or database migration in this endpoint step. The upload page is connected as described below.

## Verified on 2026-11-03

- Installed successfully in `.venv` (Python 3.13.7); `pip check` reported no broken
  requirements. The complete installation report is in ignored
  `backups/inference-installed.json`.
- The registered checkpoint SHA-256 matched after moving the files. Its loaded
  class order matched the original metadata.
- The smoke command completed on `media/batch_images/P3120661.JPG` (4000 x 3000),
  returning one quadrat and 17 Hard Coral predictions at confidence 0.25. No Soft
  Coral prediction passed that threshold. These are model outputs, not confirmed
  biological labels or an accuracy estimate.
- The first prediction call took about 13.7 seconds including setup; the library
  reported about 296 ms for its inference stage. These single-call figures are
  not a steady-state throughput benchmark.
- Output JSON, box preview, and local versions are in `backups/inference-smoke/`.
  Source photos and survey records were not changed.
- Django system and migration checks passed; 26 PostgreSQL regression tests
  passed, including 16 image-validation/runtime/endpoint tests. The lightweight
  tests mock the predictor and do not require optional ML packages or weights.
- An authenticated, CSRF-enforced Django client request with the real checkpoint
  and `P3120661.JPG` returned HTTP 200 and 18 detections (one quadrat and 17 Hard
  Coral). The temporary test user/session was created inside a rolled-back
  transaction; persistent user/site/transect/image counts were unchanged. The
  response is saved in ignored `backups/inference-endpoint-smoke/response.json`.
- Django URL initialization was checked separately and did not import Torch.
  The existing Requests compatibility warning remains; it did not fail checks.


## Connected upload page

1. Select images for one transect and click **Analyze All Images**.
2. Review the real model boxes using the compact editor. Labels show only HC/SC
   identifiers, with no confidence percentages, estimated areas, or overlap-area
   indicators. The HCC percentage remains a separate reviewed-point result.
3. Use **Select** for explicit click selection or the selected-box dropdown;
   **Hand tool** directly selects/moves/resizes the smallest overlapping coral
   box before considering the quadrat. **Edit quadrat** moves/resizes the boundary
   or draws one by dragging empty space. **HC box** and **SC box**, after Hand,
   draw missing coral regions. Only the selected box has handles and inspector
   controls. There is no layer panel. Change a selected coral's class in its
   inspector. Right-click a selected box for deletion, or use its Delete button.
   Optional square locking uses image pixels and is not imposed on detections;
   perspective can legitimately make a physical quadrat appear rectangular.
4. Verify the ten representative markers generated from the accepted boxes.
   Boxes are clipped to the quadrat and overlapping area is counted once. Hard
   Coral receives nearest-ten-percent allocation (53/54% gives five markers,
   55% gives six). Soft Coral receives its rounded allocation from the remaining
   slots. Mixed Hard/Soft overlaps use Hard Coral priority. Remainder markers
   are labeled Unclassified. The active-image HCC/category preview uses the Hard
   Coral marker count out of ten. Counts appear in a compact summary.
5. Click **Confirm image review** for every image, then **Upload**. Quadrat and
   coral-box edits regenerate the allocation and invalidate approval. Marker
   movement preserves its assigned class and stays in its matching region.
   The footer summarizes confirmed images using the canonical transect mean.

Requests are sequential with an overall per-image timeout and bounded busy retries.
**Retry failed images** retains other images' reviews. Re-analysis requires an
acknowledgement before replacing edits. Failures show errors instead of fabricated
boxes, classes, or coverage. Original-image orientation must match the endpoint's
upright dimensions before the overlay can be reviewed.

**Edit markers** repositions a representative marker within its assigned region.
Quadrat or coral-box changes regenerate all ten markers.
Undo/redo is per image, with up to 40 edit transactions; a drag is one transaction.
Ctrl+Z and Ctrl+Y act on the editor when focus is not in a text/select field, where
native editing is preserved. A new edit clears redo. Undo/redo requires image
review again. Escape cancels an in-progress gesture or dismisses its context menu.
Boxes, markers, and translucent color fill have independent visibility controls.

Migration `0017_surveyimage_analysis_review` adds an optional JSON review record.
It stores accepted corrected/manual coral boxes and the researcher-confirmed model
reference (ID, checkpoint SHA-256, dataset version), plus the square-lock flag.
Confidence and area estimates are not stored in that review record. Geometry and
point classifications still feed the existing canonical HCC fields. The model
reference is submitted with the researcher's review, not a signed independent
attestation of inference. Old records retain an empty review object. These saved
boxes are not yet drawn by historical-image export/detail views.

The local migration was applied with a before-image snapshot in ignored
`backups/before-review-editor-images.json`. All 51 existing images' previous fields
were compared before/after and were unchanged. When deploying another database,
run `manage.py migrate` before serving the new model field. Reversing this
migration removes the new review column, so preserve those records before rollback.
No historical point classifications or cached HCC were recalculated.

Regression commands:

```powershell
node --test tests/js/upload_batch_review.test.cjs tests/js/upload_batch_analysis.test.cjs tests/js/upload_area_demo.test.cjs
.venv/Scripts/python.exe manage.py check
.venv/Scripts/python.exe manage.py makemigrations --check
# Use the documented disposable-test PostgreSQL role for this command:
.venv/Scripts/python.exe manage.py test
```

Browser checks used a separate local test database/media directory. The real
model request and reviewed upload succeeded. Missing-quadrat, failed response,
and retry conditions were additionally simulated in the browser, separately
from the real-model test. Desktop, fullscreen, and 390px mobile review were
checked. Prediction quality is still subject to expert review.


Editor verification: 38 JavaScript tests and 34 Django PostgreSQL tests passed.
Browser testing with real detections and isolated survey data checked drawing,
direct selection, movement, corner resizing, class changes, right-click deletion,
Ctrl+Z/Ctrl+Y, square locking, marker movement, visibility controls, and saving.
The saved test review retained its manual Soft Coral box and moved marker while
HCC remained 50% from five Hard Coral points out of ten. Layout screenshots are
in ignored `output/playwright/`. These checks establish behavior, not model accuracy.


## Representative marker contract (2026-11-04)

Uploads now send `review.version = 2` and
`analysis.method = "box_representative_v1"`. The seven-class manual dropdown
workflow has been replaced on the upload page. `Unclassified` is a remainder
marker label supported only by this versioned contract. Existing CPCE class names
and legacy manual upload validation remain available to older data/callers.
`accounts/representative_points.py` recomputes expected counts from accepted
boxes and checks each marker's region before persistence. Canonical HCC helpers
consume the ten stored marker classes. The accepted-box method is retained in
`analysis_review` so the assessment method can be identified later.

The model still supplies detection boxes. Rectangular bounds determine the
representative allocation, including background enclosed by each box. The UI
shows HCC from the rounded marker count and retains compact box labels.

Verification for the representative update passed 37 Django tests on PostgreSQL
and 41 JavaScript tests. An additional 120 mixed-box frontend/backend parity cases
passed. Isolated browser verification used real detections, then edited boxes and
saved 6 Hard Coral / 2 Soft Coral / 2 Unclassified markers with HCC 60%, Category A.
Desktop, mobile, fullscreen, deletion, and undo behavior were checked. Captures
are under ignored `output/playwright/upload-representative-*.png`.
