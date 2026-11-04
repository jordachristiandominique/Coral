"""Composition series shared by the researcher, analysis, and public dashboards."""

from collections import Counter

from .models import POINT_CLASS_CODES
from .representative_points import normalize_marker_class


COMPOSITION_COLORS = {
    'Hard Coral': '#a44cff', 'Soft Coral': '#2a8793', 'Other Substrate': '#d9a321',
    'Macroalgae': '#e87ba4', 'Halimeda': '#eda100', 'Algae Assemblage': '#1baf7a',
    'Abiotic': '#eb6834', 'Other Biota': '#4a3aa7',
}


def composition_summary(point_classes):
    counts = Counter()
    source = point_classes.items() if isinstance(point_classes, Counter) else Counter(point_classes).items()
    for name, count in source:
        counts[normalize_marker_class(name) or 'Other Substrate'] += count
    primary = ['Hard Coral', 'Soft Coral', 'Other Substrate']
    labels = primary + sorted(name for name, count in counts.items() if name not in primary and count)
    total = sum(counts.values())
    return [{'label': name, 'code': POINT_CLASS_CODES.get(name, ''),
             'count': counts[name], 'value': round(counts[name] / total * 100, 1) if total else 0,
             'color': COMPOSITION_COLORS.get(name, '#7a8d96')} for name in labels]
