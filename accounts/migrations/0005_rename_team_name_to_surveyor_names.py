from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_add_team_name'),
    ]

    operations = [
        migrations.RenameField(
            model_name='imagebatch',
            old_name='team_name',
            new_name='surveyor_names',
        ),
    ]
