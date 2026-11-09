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
    if (metadata['class_names'] != expected_names or metadata['model'] not in {'yolov8n', 'yolov8s', 'faster_rcnn'}
            or type(metadata.get('version')) is not int or metadata['version'] < 1
            or metadata['version'] != artifact.get('dataset_version', metadata['version'])):
        raise ValueError('Unexpected model metadata or class order.')

    # Keep library-created settings inside ignored workspace storage.
    os.environ.setdefault('YOLO_CONFIG_DIR', str(PROJECT_ROOT / 'backups' / 'ultralytics'))
    os.environ.setdefault('YOLO_AUTOINSTALL', 'false')
    from PIL import Image, ImageDraw, ImageOps
    import torch
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coral_app.settings')
    import django
    django.setup()
    from django.test import override_settings
    from accounts.yolo_inference import analyze_image

    with Image.open(image) as original:
        rgb = ImageOps.exif_transpose(original).convert('RGB')
    # Exercise the same loader, transforms and normalization as the upload endpoint.
    torch.set_num_threads(2)
    started = time.perf_counter()
    with override_settings(YOLO_ARTIFACT_DIR=artifact_dir):
        result = analyze_image(rgb)
    elapsed_ms = (time.perf_counter() - started) * 1000
    detections = []
    for detection in result['detections']:
        box = detection['box']
        xyxy = [box['x'], box['y'], box['x'] + box['w'], box['y'] + box['h']]
        detections.append({
            'class_id': detection['class_id'],
            'class_name': detection['class_name'],
            'confidence': detection['confidence'],
            'xyxy_pixels': [xyxy[0] * rgb.width, xyxy[1] * rgb.height,
                            xyxy[2] * rgb.width, xyxy[3] * rgb.height],
            'xyxy_normalized': xyxy,
        })
    args.output.mkdir(parents=True, exist_ok=True)
    versions = {name: importlib.metadata.version(name)
                for name in ('torch', 'torchvision', 'ultralytics', 'numpy', 'Pillow', 'opencv-python')}
    report = {
        'artifact_id': artifact['id'], 'sha256': digest, 'source_image': str(image),
        'width': rgb.width, 'height': rgb.height, 'device': 'cpu',
        'torch_cuda_available': torch.cuda.is_available(),
        'parameters': result['parameters'],
        'first_prediction_wall_ms': elapsed_ms, 'library_speed_ms': None,
        'class_names': expected_names, 'detections': detections, 'local_package_versions': versions,
        'note': 'Runtime smoke check only, not accuracy evaluation or HCC measurement.',
    }
    (args.output / 'prediction.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (args.output / 'package_versions.local.json').write_text(json.dumps(versions, indent=2), encoding='utf-8')
    preview = rgb.copy()
    draw = ImageDraw.Draw(preview)
    for detection in detections:
        draw.rectangle(detection['xyxy_pixels'], outline='lime', width=3)
    preview.save(args.output / 'prediction.jpg')
    print(json.dumps({'artifact': artifact['id'], 'device': 'cpu', 'classes': expected_names,
                      'detections': dict(Counter(d['class_name'] for d in detections)),
                      'first_prediction_wall_ms': round(elapsed_ms, 1),
                      'output': str(args.output.resolve())}, indent=2))


if __name__ == '__main__':
    main()
