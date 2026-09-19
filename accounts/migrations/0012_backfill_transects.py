from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations


def _hcc(point_classes):
    """Hard Coral Cover % (Hard Coral points / total) for one image."""
    pcs = point_classes or []
    total = len(pcs)
    if not total:
        return None
    hard = sum(1 for p in pcs if p == 'Hard Coral')
    return (Decimal(hard) * Decimal('100') / Decimal(total)).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )


def _classify(percent):
    if percent is None:
        return ''
    if percent > 44:
        return 'A'
    if percent > 33:
        return 'B'
    if percent > 22:
        return 'C'
    return 'D'


def backfill_forward(apps, schema_editor):
    """Give every existing site a single 'Transect 1' holding all its images.

    Legacy repositories predate the transect structure, so they become
    one-transect sites (still valid everywhere the app reports HCC).
    """
    ImageBatch = apps.get_model('accounts', 'ImageBatch')
    Transect = apps.get_model('accounts', 'Transect')
    BatchImage = apps.get_model('accounts', 'BatchImage')

    for batch in ImageBatch.objects.all().iterator():
        images = list(BatchImage.objects.filter(batch=batch))
        transect = Transect.objects.create(
            batch=batch, number=1, label='Transect 1'
        )
        percents = []
        for image in images:
            image.transect = transect
            image.save(update_fields=['transect'])
            pct = _hcc(image.point_classes)
            if pct is not None:
                percents.append(pct)
        if percents:
            mean = (sum(percents) / len(percents)).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )
            transect.coverage_percent = mean
            transect.coverage_class = _classify(mean)
            transect.save(update_fields=['coverage_percent', 'coverage_class'])


def backfill_backward(apps, schema_editor):
    """Detach images from transects and drop all transect rows."""
    Transect = apps.get_model('accounts', 'Transect')
    BatchImage = apps.get_model('accounts', 'BatchImage')
    BatchImage.objects.update(transect=None)
    Transect.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_transect_batchimage_transect'),
    ]

    operations = [
        migrations.RunPython(backfill_forward, backfill_backward),
    ]
