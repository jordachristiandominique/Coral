"""Verify the trusted local checkpoint and predict on one image, without Django writes."""

import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from coral_app.settings import YOLO_ARTIFACT_DIR


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--artifact-dir', type=Path, default=YOLO_ARTIFACT_DIR)
    parser.add_argument('--output', type=Path, default=PROJECT_ROOT / 'backups' / 'inference-smoke')
    args = parser.parse_args()
    image = args.image.resolve(strict=True)
    artifact_dir = args.artifact_dir.resolve(strict=True)
    artifact = json.loads((artifact_dir / 'artifact.json').read_text(encoding='utf-8'))
    checkpoint = artifact_dir / artifact['checkpoint']
    metadata = json.loads((artifact_dir / artifact['metadata']).read_text(encoding='utf-8'))
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if digest != artifact['sha256']:
        raise ValueError('Checkpoint hash differs from the registered local artifact.')
    expected_names = ['Hard Coral', 'Soft Coral', 'quadrat_area']
    if (metadata['class_names'] != expected_names or metadata['model'] != 'yolov8s'
            or type(metadata.get('version')) is not int or metadata['version'] < 1
            or metadata['version'] != artifact.get('dataset_version', metadata['version'])):
        raise ValueError('Unexpected model metadata or class order.')

    # Keep library-created settings inside ignored workspace storage.
    os.environ.setdefault('YOLO_CONFIG_DIR', str(PROJECT_ROOT / 'backups' / 'ultralytics'))
    os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
    import cv2
    from PIL import Image, ImageOps
    import torch
    from ultralytics import YOLO

    with Image.open(image) as original:
        rgb = ImageOps.exif_transpose(original).convert('RGB')
    # Only load the user's own trusted checkpoint, after verifying its hash.
    model = YOLO(str(checkpoint))
    names = [model.names[i] for i in sorted(model.names)]
    if names != expected_names:
        raise ValueError(f'Checkpoint classes differ from metadata: {names}')
    started = time.perf_counter()
    result = model.predict(rgb, device='cpu', imgsz=640, conf=0.25, max_det=100,
                           save=False, verbose=False)[0]
    elapsed_ms = (time.perf_counter() - started) * 1000
    detections = []
    for box in result.boxes:
        class_id = int(box.cls.item())
        detections.append({
            'class_id': class_id,
            'class_name': model.names[class_id],
            'confidence': float(box.conf.item()),
            'xyxy_pixels': box.xyxy[0].tolist(),
            'xyxy_normalized': box.xyxyn[0].tolist(),
        })
    args.output.mkdir(parents=True, exist_ok=True)
    versions = {name: importlib.metadata.version(name)
                for name in ('torch', 'torchvision', 'ultralytics', 'numpy', 'Pillow', 'opencv-python')}
    report = {
        'artifact_id': artifact['id'], 'sha256': digest, 'source_image': str(image),
        'width': rgb.width, 'height': rgb.height, 'device': 'cpu',
        'torch_cuda_available': torch.cuda.is_available(),
        'parameters': {'imgsz': 640, 'conf': 0.25, 'max_det': 100},
        'first_prediction_wall_ms': elapsed_ms, 'library_speed_ms': result.speed,
        'class_names': names, 'detections': detections, 'local_package_versions': versions,
        'note': 'Runtime smoke check only, not accuracy evaluation or HCC measurement.',
    }
    (args.output / 'prediction.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (args.output / 'package_versions.local.json').write_text(json.dumps(versions, indent=2), encoding='utf-8')
    # Boxes without text avoid downloading fonts or modifying the source photo.
    if not cv2.imwrite(str(args.output / 'prediction.jpg'), result.plot(labels=False, conf=False)):
        raise OSError('Could not write the preview image.')
    print(json.dumps({'artifact': artifact['id'], 'device': 'cpu', 'classes': names,
                      'detections': dict(Counter(d['class_name'] for d in detections)),
                      'first_prediction_wall_ms': round(elapsed_ms, 1),
                      'output': str(args.output.resolve())}, indent=2))


if __name__ == '__main__':
    main()
