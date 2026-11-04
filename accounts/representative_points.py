"""Validate ten representative markers derived from clipped accepted coral boxes."""

from collections import Counter
import math


MARKER_CLASSES = ('Hard Coral', 'Soft Coral', 'Other Substrate')
METHOD = 'box_representative_v1'


def normalize_marker_class(name):
    """Read earlier remainder labels using the current Other Substrate name."""
    aliases = ('Non-Coral', 'Non-Corals', 'NC', 'Unclassified', 'unclassified', 'OS')
    return 'Other Substrate' if isinstance(name, str) and name in aliases else name


def class_at(boxes, x, y):
    hits = {region['class_name'] for region in boxes
            if region['box']['x'] <= x <= region['box']['x'] + region['box']['w']
            and region['box']['y'] <= y <= region['box']['y'] + region['box']['h']}
    return next((name for name in MARKER_CLASSES if name in hits), 'Other Substrate')


def representative_counts(quadrat, boxes):
    """Sweep disjoint cells, counting overlaps once with Hard Coral priority."""
    clipped = []
    for region in boxes:
        box = region['box']
        x, y = max(quadrat['x'], box['x']), max(quadrat['y'], box['y'])
        right = min(quadrat['x'] + quadrat['w'], box['x'] + box['w'])
        bottom = min(quadrat['y'] + quadrat['h'], box['y'] + box['h'])
        if right > x and bottom > y:
            clipped.append({'class_name': region['class_name'],
                            'box': {'x': x, 'y': y, 'w': right - x, 'h': bottom - y}})
    xs = sorted({quadrat['x'], quadrat['x'] + quadrat['w'],
                 *(edge for region in clipped for edge in (region['box']['x'], region['box']['x'] + region['box']['w']))})
    areas = dict.fromkeys(MARKER_CLASSES, 0.0)
    for left, right in zip(xs, xs[1:]):
        middle_x = (left + right) / 2
        active = [region for region in clipped if region['box']['x'] < middle_x < region['box']['x'] + region['box']['w']]
        ys = sorted({quadrat['y'], quadrat['y'] + quadrat['h'],
                     *(edge for region in active for edge in (region['box']['y'], region['box']['y'] + region['box']['h']))})
        for top, bottom in zip(ys, ys[1:]):
            name = class_at(active, middle_x, (top + bottom) / 2)
            areas[name] += (right - left) * (bottom - top)
    area = quadrat['w'] * quadrat['h']

    def rounded_count(name):
        percent = round(areas[name] / area * 100, 12)
        return min(10, max(0, math.floor(percent / 10 + .5 + 1e-10)))

    hard = rounded_count('Hard Coral')
    soft = min(10 - hard, rounded_count('Soft Coral'))
    remainder = 10 - hard - soft
    if remainder and not areas['Other Substrate']:
        soft += remainder
        remainder = 0
    return {'Hard Coral': hard, 'Soft Coral': soft, 'Other Substrate': remainder}


def validate_representative_points(quadrat, boxes, points, classes):
    counts = representative_counts(quadrat, boxes)
    if any(Counter(classes)[name] != count for name, count in counts.items()):
        raise ValueError('Representative marker counts must match the accepted coral boxes. Review the image again.')
    for point, name in zip(points, classes):
        x = quadrat['x'] + point['x'] * quadrat['w']
        y = quadrat['y'] + point['y'] * quadrat['h']
        if class_at(boxes, x, y) != name:
            raise ValueError('Each representative marker must remain within its assigned region.')
