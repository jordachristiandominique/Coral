from django.db import migrations


def rename_permissions(apps, schema_editor, reverse=False):
    """Keep existing permission grants attached to the renamed model permissions."""
    Permission = apps.get_model('auth', 'Permission')
    pairs = [('imagebatch', 'datarepository', 'data repository'),
             ('batchimage', 'surveyimage', 'survey image')]
    for old, new, label in pairs:
        if reverse:
            old, new = new, old
            label = 'image batch' if new == 'imagebatch' else 'batch image'
        for action in ('add', 'change', 'delete', 'view'):
            Permission.objects.using(schema_editor.connection.alias).filter(
                content_type__app_label='accounts',
                content_type__model__in=[old, new],
                codename=f'{action}_{old}',
            ).update(codename=f'{action}_{new}', name=f'Can {action} {label}')


def reverse_permissions(apps, schema_editor):
    rename_permissions(apps, schema_editor, reverse=True)


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0015_notification'),
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
    ]

    operations = [
        migrations.RenameModel(old_name='ImageBatch', new_name='DataRepository'),
        migrations.RenameModel(old_name='BatchImage', new_name='SurveyImage'),
        migrations.RenameField(model_name='surveyimage', old_name='coverage_class', new_name='coverage_category'),
        migrations.RenameField(model_name='transect', old_name='coverage_class', new_name='coverage_category'),
        migrations.AlterModelOptions(name='datarepository', options={
            'ordering': ['-created_at'],
            'verbose_name': 'Data repository',
            'verbose_name_plural': 'Data repositories',
        }),
        migrations.RunPython(rename_permissions, reverse_permissions),
    ]
