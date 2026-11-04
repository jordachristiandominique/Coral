from django.shortcuts import render

from accounts.models import DataRepository, compute_site_hcc
from accounts.visualization_data import composition_summary

def landing_page(request):
    """Render the landing page"""
    return render(request, 'landing_page.html')


def public_dashboard(request):
    """Render the public dashboard page."""
    batches = DataRepository.objects.select_related('user').order_by('-survey_date')

    surveys = []
    for batch in batches:
        # Recalculate coverage from point_classes (HC+SC only)
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)
        
        # Site HCC = mean of the transect means (transect = replicate).
        site = compute_site_hcc(batch)
        coverage = site['site_percent']
        if coverage is None:
            coverage_value = None
            coverage_class = None
        else:
            coverage_value = float(coverage)
            coverage_class = site['coverage_class']

        class_distribution = {item['label']: {'count': item['count'], 'percentage': item['value'], 'color': item['color']}
                              for item in composition_summary(all_point_classes)}

        surveys.append({
            'area': batch.area_name,
            'surveyors': batch.surveyor_names or 'Not set',
            'lat': float(batch.latitude) if batch.latitude is not None else None,
            'lng': float(batch.longitude) if batch.longitude is not None else None,
            'date': batch.survey_date.isoformat(),
            'coverage': coverage_value,
            'classCode': coverage_class,
            'classDistribution': class_distribution,
        })

    last_updated = batches[0].survey_date if batches else None

    context = {
        'dashboard_surveys': surveys,
        'last_updated': last_updated,
    }

    return render(request, 'public_dashboard.html', context)
