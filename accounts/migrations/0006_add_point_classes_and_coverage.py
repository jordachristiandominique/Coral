from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_rename_team_name_to_surveyor_names'),
    ]

    operations = [
        migrations.AddField(
            model_name='batchimage',
            name='point_classes',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='batchimage',
            name='coverage_percent',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name='batchimage',
            name='coverage_class',
            field=models.CharField(blank=True, default='', max_length=1),
        ),
    ]
