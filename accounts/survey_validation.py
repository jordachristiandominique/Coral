"""Validation of the existing per-image upload contract, including AI review."""

import math
import re

from .models import CPCE_CODES
from .representative_points import MARKER_CLASSES, METHOD, normalize_marker_class, validate_representative_points


def validate_quadrat_payload(payload):
    def number(value):
        return ((isinstance(value, int) and not isinstance(value, bool))
                or (isinstance(value, float) and math.isfinite(value)))

    if not isinstance(payload, dict):
        raise ValueError('Quadrat data must be an object.')
    rect = payload.get('rect')
    if not isinstance(rect, dict) or not all(number(rect.get(k)) for k in ('x', 'y', 'w', 'h')):
        raise ValueError('Enter a valid quadrat boundary.')
    if not (rect['x'] >= 0 and rect['y'] >= 0 and rect['w'] > 0 and rect['h'] > 0
            and rect['x'] + rect['w'] <= 1.000001 and rect['y'] + rect['h'] <= 1.000001):
        raise ValueError('The quadrat boundary must stay inside the image.')
    points, classes = payload.get('points'), payload.get('point_classes')
    if not isinstance(points, list) or not points or not isinstance(classes, list) or len(classes) != len(points):
        raise ValueError('Point coordinates and classifications are incomplete.')
    for point in points:
        if (not isinstance(point, dict) or not all(number(point.get(k)) and 0 <= point[k] <= 1 for k in ('x', 'y'))):
            raise ValueError('Sampling points must stay inside the quadrat.')
    review = payload.get('review')
    representative = isinstance(review, dict) and type(review.get('version')) is int and review['version'] == 2
    if representative:
        # Normalize submissions from pages opened before the label update.
        classes = [normalize_marker_class(value) for value in classes]
        payload['point_classes'] = classes
    allowed_classes = MARKER_CLASSES if representative else CPCE_CODES
    if any(not isinstance(value, str) or value not in allowed_classes for value in classes):
        raise ValueError('Classify every point using a supported benthic class.')
    if 'review' in payload:
        review = payload['review']
        if (not isinstance(review, dict) or type(review.get('version')) is not int
                or review['version'] not in (1, 2) or review.get('confirmed') is not True or len(points) != 10):
            raise ValueError('AI-assisted uploads require confirmed review of ten sampling points.')
    if representative and ('analysis' not in payload or not isinstance(payload['analysis'], dict)
                           or payload['analysis'].get('method') != METHOD):
        raise ValueError('Representative markers require their accepted coral boxes and allocation method.')
    if 'analysis' in payload:
        analysis = payload['analysis']
        if ('review' not in payload or not isinstance(analysis, dict) or type(analysis.get('version')) is not int or analysis['version'] != 1
                or not isinstance(analysis.get('model'), dict) or not isinstance(analysis.get('boxes'), list)
                or len(analysis['boxes']) > 200 or type(analysis.get('square_lock')) is not bool):
            raise ValueError('The edited detection review is invalid.')
        model = analysis['model']
        if (not isinstance(model.get('id'), str) or not 1 <= len(model['id']) <= 100
                or not isinstance(model.get('sha256'), str) or not re.fullmatch(r'[0-9a-f]{64}', model['sha256'])
                or type(model.get('dataset_version')) is not int or model['dataset_version'] < 1):
            raise ValueError('The detection model reference is incomplete.')
        accepted, identifiers = [], set()
        for region in analysis['boxes']:
            if (not isinstance(region, dict) or not isinstance(region.get('id'), str)
                    or not 1 <= len(region['id']) <= 100 or region['id'] in identifiers
                    or region.get('class_name') not in ('Hard Coral', 'Soft Coral')
                    or region.get('source') not in ('ai', 'manual')):
                raise ValueError('An accepted coral box is invalid.')
            b = region.get('box')
            if (not isinstance(b, dict) or not all(number(b.get(k)) for k in ('x', 'y', 'w', 'h'))
                    or b['x'] < 0 or b['y'] < 0 or b['w'] <= 0 or b['h'] <= 0
                    or b['x'] + b['w'] > 1.000001 or b['y'] + b['h'] > 1.000001):
                raise ValueError('Accepted coral boxes must stay inside the image.')
            identifiers.add(region['id'])
            accepted.append({'id': region['id'], 'class_name': region['class_name'],
                             'box': {k: b[k] for k in ('x', 'y', 'w', 'h')}, 'source': region['source']})
        # A researcher-confirmed model reference, not an independent inference attestation.
        payload['analysis'] = {'version': 1, 'model': {k: model[k] for k in ('id', 'sha256', 'dataset_version')},
                               'square_lock': analysis['square_lock'], 'boxes': accepted}
        if representative:
            validate_representative_points(rect, accepted, points, classes)
            payload['analysis']['method'] = METHOD
    return payload
