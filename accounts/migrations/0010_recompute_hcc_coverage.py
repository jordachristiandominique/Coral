from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations


def recompute_forward(apps, schema_editor):
    """Recompute every stored image coverage as Hard Coral Cover (HCC).

    Previously coverage_percent/coverage_class were stored as
    (Hard Coral + Soft Coral) / total with the old A>=60/B>=40/C scale.
    HCC (Licuanan 2020) counts Hard Coral points ONLY, graded
    A>44 / B>33-44 / C>22-33 / D 0-22.
    """
    BatchImage = apps.get_model('accounts', 'BatchImage')
    for image in BatchImage.objects.all().iterator():
        pcs = image.point_classes or []
        total = len(pcs)
        if not total:
            image.coverage_percent = None
            image.coverage_class = ''
            image.save(update_fields=['coverage_percent', 'coverage_class'])
            continue
        hard = sum(1 for p in pcs if p == 'Hard Coral')
        pct = (Decimal(hard) * Decimal('100') / Decimal(total)).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        if pct > 44:
            cls = 'A'
        elif pct > 33:
            cls = 'B'
        elif pct > 22:
            cls = 'C'
        else:
            cls = 'D'
        image.coverage_percent = pct
        image.coverage_class = cls
        image.save(update_fields=['coverage_percent', 'coverage_class'])


def recompute_backward(apps, schema_editor):
    """Restore the old (Hard + Soft Coral) coverage and A/B/C scale."""
    BatchImage = apps.get_model('accounts', 'BatchImage')
    for image in BatchImage.objects.all().iterator():
        pcs = image.point_classes or []
        total = len(pcs)
        if not total:
            image.coverage_percent = None
            image.coverage_class = ''
            image.save(update_fields=['coverage_percent', 'coverage_class'])
            continue
        coral = sum(1 for p in pcs if p in ('Hard Coral', 'Soft Coral'))
        pct = (Decimal(coral) * Decimal('100') / Decimal(total)).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        if pct >= 60:
            cls = 'A'
        elif pct >= 40:
            cls = 'B'
        else:
            cls = 'C'
        image.coverage_percent = pct
        image.coverage_class = cls
        image.save(update_fields=['coverage_percent', 'coverage_class'])


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_user_profile_photo'),
    ]

    operations = [
        migrations.RunPython(recompute_forward, recompute_backward),
    ]
