"""Lazy, serialized inference for a trusted local detection artifact.

No images, predictions, point classes, or HCC values are persisted here.
"""

from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import threading
import warnings

from django.conf import settings
from PIL import Image, ImageOps, UnidentifiedImageError


CLASS_NAMES = ['Hard Coral', 'Soft Coral', 'quadrat_area']
PARAMETERS = {'imgsz': 640, 'conf': 0.25, 'max_det': 100, 'device': 'cpu'}
_inference_lock = threading.Lock()
_cached_runtime = None


class InvalidImage(ValueError):
    def __init__(self, message, *, too_large=False):
        super().__init__(message)
        self.too_large = too_large


class InferenceBusy(Exception):
    pass


class ModelUnavailable(Exception):
    pass


@dataclass
class Runtime:
    directory: Path
    model: object
    provenance: dict


def read_image(upload):
    """Validate actual image content and return detached, upright RGB pixels."""
    if upload.size > settings.YOLO_MAX_UPLOAD_BYTES:
        raise InvalidImage('Image exceeds the upload size limit.', too_large=True)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            upload.seek(0)
            with Image.open(upload) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise InvalidImage('Use a JPEG, PNG, or WebP image.')
                if image.width * image.height > settings.YOLO_MAX_IMAGE_PIXELS:
                    raise InvalidImage('Image exceeds the pixel limit.', too_large=True)
                if getattr(image, 'n_frames', 1) != 1:
                    raise InvalidImage('Animated images are not supported.')
                image.verify()
            upload.seek(0)
            with Image.open(upload) as image:
                return ImageOps.exif_transpose(image).convert('RGB')
    except InvalidImage:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise InvalidImage('Image exceeds the pixel limit.', too_large=True) from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, EOFError) as exc:
        raise InvalidImage('The uploaded file is not a readable image.') from exc


def _artifact_file(directory, filename):
    path = (directory / filename).resolve()
    if path.parent != directory:
        raise ValueError('Artifact filenames must stay inside their directory.')
    return path


def _load_runtime(directory):
    """Validate provenance before loading the user's own trusted .pt file."""
    try:
        artifact = json.loads((directory / 'artifact.json').read_text(encoding='utf-8'))
        checkpoint = _artifact_file(directory, artifact['checkpoint'])
        metadata = json.loads(_artifact_file(directory, artifact['metadata']).read_text(encoding='utf-8'))
        digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
        if digest != artifact['sha256']:
            raise ValueError('Checkpoint checksum mismatch.')
        if metadata['class_names'] != CLASS_NAMES:
            raise ValueError('Unexpected metadata class order.')
        os.environ.setdefault('YOLO_CONFIG_DIR', str(settings.BASE_DIR / 'backups' / 'ultralytics'))
        os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
        from ultralytics import YOLO

        model = YOLO(str(checkpoint))
        if [model.names[i] for i in sorted(model.names)] != CLASS_NAMES:
            raise ValueError('Checkpoint class order differs from metadata.')
        provenance = {
            'id': artifact['id'], 'architecture': metadata['model'], 'sha256': digest,
            'dataset_version': metadata['version'],
            'augmentation_multiplier': artifact['augmentation_multiplier'],
            'class_names': CLASS_NAMES.copy(),
        }
        return Runtime(directory, model, provenance)
    except Exception as exc:
        raise ModelUnavailable('Local detection model is unavailable.') from exc


def analyze_image(image):
    """Return full-image boxes; quadrat membership and point classes need review."""
    global _cached_runtime
    if not _inference_lock.acquire(blocking=False):
        raise InferenceBusy('Another image is being analysed. Retry shortly.')
    try:
        directory = Path(settings.YOLO_ARTIFACT_DIR).resolve()
        if _cached_runtime is None or _cached_runtime.directory != directory:
            _cached_runtime = _load_runtime(directory)
        runtime = _cached_runtime
        result = runtime.model.predict(image, **PARAMETERS, save=False, verbose=False)[0]
        detections = []
        for box in result.boxes:
            cid = int(box.cls.item())
            confidence = float(box.conf.item())
            coordinates = box.xyxyn[0].tolist()
            if cid not in range(len(CLASS_NAMES)) or not all(math.isfinite(v) for v in [confidence, *coordinates]):
                raise ValueError('Detector returned invalid values.')
            x1, y1, x2, y2 = [min(1., max(0., float(v))) for v in coordinates]
            if x2 <= x1 or y2 <= y1:
                continue
            detections.append({
                'id': f'detection-{len(detections) + 1}', 'class_id': cid,
                'class_name': CLASS_NAMES[cid], 'confidence': confidence,
                'box': {'x': x1, 'y': y1, 'w': x2 - x1, 'h': y2 - y1},
            })
        quadrats = [d for d in detections if d['class_name'] == 'quadrat_area']
        review_warnings = []
        if not quadrats:
            review_warnings.append({'code': 'missing_quadrat', 'message': 'No quadrat detected. Draw or confirm the sampling boundary manually.'})
        elif len(quadrats) > 1:
            review_warnings.append({'code': 'multiple_quadrats', 'message': 'Multiple quadrats detected. Confirm the intended sampling boundary.'})
        return {
            'success': True, 'schema_version': 1, 'model': dict(runtime.provenance),
            'image': {'width': image.width, 'height': image.height, 'orientation': 'exif_transposed'},
            'parameters': dict(PARAMETERS), 'detections': detections,
            'quadrat': max(quadrats, key=lambda d: d['confidence']) if quadrats else None,
            'review_required': True, 'warnings': review_warnings,
        }
    finally:
        _inference_lock.release()
