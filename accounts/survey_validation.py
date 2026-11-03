"""Validation of the existing per-image upload contract, including AI review."""

import math

from .models import CPCE_CODES


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
    if any(not isinstance(value, str) or value not in CPCE_CODES for value in classes):
        raise ValueError('Classify every point using a supported benthic class.')
    if 'review' in payload:
        review = payload['review']
        if (not isinstance(review, dict) or type(review.get('version')) is not int
                or review['version'] != 1 or review.get('confirmed') is not True or len(points) != 10):
            raise ValueError('AI-assisted uploads require confirmed review of ten sampling points.')
    return payload
