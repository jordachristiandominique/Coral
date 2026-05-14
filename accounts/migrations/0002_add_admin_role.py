# Generated migration to add admin role

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('superadmin', 'Super Admin'),
                    ('admin', 'Admin'),
                    ('researcher', 'Researcher'),
                    ('pending', 'Pending Approval'),
                ],
                default='pending',
                help_text='User role in the system',
                max_length=20,
            ),
        ),
    ]
