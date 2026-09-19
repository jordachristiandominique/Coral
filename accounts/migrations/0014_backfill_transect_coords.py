from django.db import migrations


def backfill_forward(apps, schema_editor):
    """Give every existing transect its parent site's coordinates as a start."""
    Transect = apps.get_model('accounts', 'Transect')
    for transect in Transect.objects.select_related('batch').iterator():
        if transect.latitude is None or transect.longitude is None:
            transect.latitude = transect.batch.latitude
            transect.longitude = transect.batch.longitude
            transect.save(update_fields=['latitude', 'longitude'])


def backfill_backward(apps, schema_editor):
    """Reversible no-op: clear the copied coordinates."""
    Transect = apps.get_model('accounts', 'Transect')
    Transect.objects.update(latitude=None, longitude=None)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0013_transect_latitude_transect_longitude'),
    ]

    operations = [
        migrations.RunPython(backfill_forward, backfill_backward),
    ]
