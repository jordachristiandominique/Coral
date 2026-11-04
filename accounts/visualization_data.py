"""Composition series shared by the researcher, analysis, and public dashboards."""

from collections import Counter

from .models import POINT_CLASS_CODES


COMPOSITION_COLORS = {
    'Hard Coral': '#a44cff', 'Soft Coral': '#2a8793', 'Non-Coral': '#d9a321',
    'Macroalgae': '#e87ba4', 'Halimeda': '#eda100', 'Algae Assemblage': '#1baf7a',
    'Abiotic': '#eb6834', 'Other Biota': '#4a3aa7',
}


def composition_summary(point_classes):
    counts = Counter(point_classes)
    counts['Unclassified'] += counts.pop('', 0) + counts.pop(None, 0)
    primary = ['Hard Coral', 'Soft Coral', 'Non-Coral']
    labels = primary + sorted(name for name, count in counts.items() if name not in primary and count)
    total = sum(counts.values())
    return [{'label': name, 'code': POINT_CLASS_CODES.get(name, ''),
             'count': counts[name], 'value': round(counts[name] / total * 100, 1) if total else 0,
             'color': COMPOSITION_COLORS.get(name, '#7a8d96')} for name in labels]
