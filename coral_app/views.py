from django.shortcuts import render
from django.db.models import Avg

from accounts.models import ImageBatch

def landing_page(request):
    """Render the landing page"""
    return render(request, 'landing_page.html')


def public_dashboard(request):
    """Render the public dashboard page."""
    batches = ImageBatch.objects.select_related('user').order_by('-survey_date')

    surveys = []
    for batch in batches:
        # Recalculate coverage from point_classes (HC+SC only)
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)
        
        # Calculate coral coverage (Hard Coral + Soft Coral only)
        coral_classes = ['Hard Coral', 'Soft Coral']
        coral_count = sum(1 for pc in all_point_classes if pc in coral_classes)
        coverage = round((coral_count / len(all_point_classes)) * 100) if all_point_classes else None
        
        if coverage is None:
            coverage_value = None
            coverage_class = None
        else:
            coverage_value = float(coverage)
            if coverage >= 60:
                coverage_class = 'A'
            elif coverage >= 40:
                coverage_class = 'B'
            else:
                coverage_class = 'C'

        surveys.append({
            'area': batch.area_name,
            'surveyors': batch.surveyor_names or 'Not set',
            'lat': float(batch.latitude) if batch.latitude is not None else None,
            'lng': float(batch.longitude) if batch.longitude is not None else None,
            'date': batch.survey_date.isoformat(),
            'coverage': coverage_value,
            'classCode': coverage_class,
        })

    last_updated = batches[0].survey_date if batches else None

    context = {
        'dashboard_surveys': surveys,
        'last_updated': last_updated,
    }

    return render(request, 'public_dashboard.html', context)
