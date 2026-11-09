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

    @property
    def parameters(self):
        if self.provenance.get('architecture') == 'faster_rcnn':
            return {'conf': 0.25, 'max_det': 100, 'device': 'cpu',
                    'min_size': 800, 'max_size': 1333}
        return dict(PARAMETERS)

    def predict_boxes(self, image):
        """Yield zero-based class IDs and full-image normalized coordinates."""
        if self.provenance.get('architecture') == 'faster_rcnn':
            import torch
            from torchvision.transforms.functional import to_tensor

            with torch.inference_mode():
                result = self.model([to_tensor(image)])[0]
            for box, score, label in zip(result['boxes'], result['scores'], result['labels']):
                if int(label.item()) == 0:
                    continue
                x1, y1, x2, y2 = box.tolist()
                yield (int(label.item()) - 1, float(score.item()),
                       [x1 / image.width, y1 / image.height,
                        x2 / image.width, y2 / image.height])
            return
        result = self.model.predict(image, **PARAMETERS, save=False, verbose=False)[0]
        for box in result.boxes:
            yield int(box.cls.item()), float(box.conf.item()), box.xyxyn[0].tolist()


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


def _load_faster_rcnn(checkpoint, metadata):
    import torch
    from torchvision.models.detection import fasterrcnn_resnet50_fpn
    from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

    # The manifest hash is checked before unpickling the user's trusted export.
    saved = torch.load(checkpoint, map_location='cpu', weights_only=False)
    if any(metadata.get(key) != value for key, value in saved['metadata'].items()):
        raise ValueError('Checkpoint metadata differs from its sidecar.')
    if (saved['class_names'] != CLASS_NAMES or saved['num_classes'] != len(CLASS_NAMES) + 1
            or metadata['num_classes'] != saved['num_classes']
            or metadata['checkpoint_epoch'] != saved['epoch']
            or metadata['architecture'] != 'fasterrcnn_resnet50_fpn'
            or metadata['background_label'] != 0 or metadata['label_offset'] != 1):
        raise ValueError('Unexpected Faster R-CNN architecture or class mapping.')
    model = fasterrcnn_resnet50_fpn(
        weights=None, weights_backbone=None, min_size=800, max_size=1333,
        box_score_thresh=0.25, box_detections_per_img=100,
    )
    model.roi_heads.box_predictor = FastRCNNPredictor(
        model.roi_heads.box_predictor.cls_score.in_features, saved['num_classes'],
    )
    model.load_state_dict(saved['model_state_dict'], strict=True)
    return model.eval()


def _load_runtime(directory):
    """Validate provenance before loading the user's own trusted .pt file."""
    try:
        artifact = json.loads((directory / 'artifact.json').read_text(encoding='utf-8'))
        checkpoint = _artifact_file(directory, artifact['checkpoint'])
        metadata = json.loads(_artifact_file(directory, artifact['metadata']).read_text(encoding='utf-8'))
        with checkpoint.open('rb') as handle:
            digest = hashlib.file_digest(handle, 'sha256').hexdigest()
        if digest != artifact['sha256']:
            raise ValueError('Checkpoint checksum mismatch.')
        if metadata['class_names'] != CLASS_NAMES:
            raise ValueError('Unexpected metadata class order.')
        if metadata['version'] != artifact.get('dataset_version', metadata['version']):
            raise ValueError('Dataset version differs from manifest.')
        if metadata['model'] == 'faster_rcnn':
            if metadata['checkpoint_sha256'] != digest:
                raise ValueError('Checkpoint checksum differs from metadata.')
            model = _load_faster_rcnn(checkpoint, metadata)
        else:
            if metadata['model'] not in {'yolov8n', 'yolov8s'}:
                raise ValueError('Unsupported detection architecture.')
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
        detections = []
        for cid, confidence, coordinates in runtime.predict_boxes(image):
            if cid not in range(len(CLASS_NAMES)) or not all(math.isfinite(v) for v in [confidence, *coordinates]):
                raise ValueError('Detector returned invalid values.')
            if not 0 <= confidence <= 1:
                raise ValueError('Detector returned invalid confidence.')
            if confidence < runtime.parameters['conf']:
                continue
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
            'parameters': runtime.parameters, 'detections': detections,
            'quadrat': max(quadrats, key=lambda d: d['confidence']) if quadrats else None,
            'review_required': True, 'warnings': review_warnings,
        }
    finally:
        _inference_lock.release()
