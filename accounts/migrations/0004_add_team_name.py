from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_image_batches'),
    ]

    operations = [
        migrations.AddField(
            model_name='imagebatch',
            name='team_name',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]
