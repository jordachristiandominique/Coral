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

This does not measure accuracy, classify sampling points, or compute HCC. The
upload page still uses its existing mock flow. Its connection to the endpoint
below must retain researcher review and canonical point-based HCC calculations.

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
non-coral assignment, or database migration in this endpoint step. The existing
upload page has not yet been connected.

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
