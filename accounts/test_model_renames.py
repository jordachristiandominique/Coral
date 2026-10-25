import importlib
import json
import tempfile
from datetime import date
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace

from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from PIL import Image

from .models import DataRepository, SurveyImage, Transect, User, compute_site_hcc


class RepositoryWorkflowTests(TestCase):
    def test_upload_append_pages_and_exports_use_renamed_models(self):
        user = User.objects.create_user(username='category-researcher', role='researcher')
        self.client.force_login(user)
        payload = {'rect': {'x': .1, 'y': .1, 'w': .8, 'h': .8},
                   'points': [{'x': .25, 'y': .25}, {'x': .75, 'y': .75}],
                   'point_classes': ['Hard Coral', 'Soft Coral']}

        def photo():
            buffer = BytesIO()
            Image.new('RGB', (40, 40)).save(buffer, format='PNG')
            return SimpleUploadedFile('coral.png', buffer.getvalue(), content_type='image/png')

        with tempfile.TemporaryDirectory() as directory, override_settings(MEDIA_ROOT=directory):
            response = self.client.post(reverse('upload_batch'), {
                'batch_name': 'Rename workflow', 'survey_date': '2026-10-25',
                'surveyor_names': 'Test surveyor', 'area_name': 'Test site',
                'latitude': '7.123456', 'longitude': '125.123456',
                'images': photo(), 'image_quadrat_1': json.dumps(payload),
            })
            self.assertEqual(response.status_code, 302)
            repository = DataRepository.objects.get(user=user)
            image = SurveyImage.objects.get(batch=repository)
            self.assertEqual(image.coverage_category, 'A')
            self.assertEqual(image.coverage_percent, Decimal('50'))
            self.assertEqual(image.transect.coverage_category, 'A')
            self.assertEqual(image.point_classes, payload['point_classes'])
            self.assertEqual(repository.get_class_distribution(), {'A': 1, 'B': 0, 'C': 0, 'D': 0})
            self.client.post(reverse('upload_batch'), {
                'existing_batch_id': repository.pk, 'images': photo(),
                'image_quadrat_1': json.dumps(payload),
            })
            self.assertEqual(list(repository.transects.values_list('number', flat=True)), [1, 2])
            self.assertEqual(compute_site_hcc(repository)['site_percent'], 50)
            for name in ('researcher_dashboard', 'batches', 'map_view',
                         'analysis_results', 'reports', 'public_dashboard',
                         'analysis_results_export_csv', 'analysis_results_export_pdf'):
                with self.subTest(page=name):
                    self.assertEqual(self.client.get(reverse(name)).status_code, 200)
            self.assertEqual(self.client.get(reverse('all_batches')).status_code, 302)
            for name, kwargs in (
                ('batch_detail', {'batch_id': repository.pk}),
                ('batch_export_excel', {'batch_id': repository.pk}),
                ('batch_image_annotated', {'image_id': image.pk}),
            ):
                response = self.client.get(reverse(name, kwargs=kwargs))
                self.assertEqual(response.status_code, 200, name)
                if response.streaming:
                    self.assertTrue(b''.join(response.streaming_content))
            user.role = 'admin'
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=['role', 'is_staff', 'is_superuser'])
            self.client.force_login(user)
            self.assertEqual(self.client.get(reverse('all_batches')).status_code, 200)
            for name in ('admin:accounts_datarepository_changelist', 'admin:accounts_surveyimage_changelist'):
                self.assertEqual(self.client.get(reverse(name)).status_code, 200)

    def test_permission_rename_preserves_grants_and_is_reversible(self):
        module = importlib.import_module('accounts.migrations.0016_repository_image_category_names')
        content_type = ContentType.objects.get_for_model(DataRepository)
        Permission.objects.filter(content_type=content_type, codename='view_datarepository').delete()
        permission = Permission.objects.create(content_type=content_type, codename='view_imagebatch', name='Can view image batch')
        user = User.objects.create_user(username='permission-researcher', role='researcher')
        user.user_permissions.add(permission)
        from django.apps import apps
        editor = SimpleNamespace(connection=connection)
        module.rename_permissions(apps, editor)
        permission.refresh_from_db()
        self.assertEqual(permission.codename, 'view_datarepository')
        self.assertTrue(user.has_perm('accounts.view_datarepository'))
        self.assertEqual(user.user_permissions.get().pk, permission.pk)
        module.reverse_permissions(apps, editor)
        permission.refresh_from_db()
        self.assertEqual(permission.codename, 'view_imagebatch')


class RepositoryRenameMigrationTests(TransactionTestCase):
    def test_forward_and_reverse_preserve_rows_relationships_and_categories(self):
        old_target = [('accounts', '0015_notification')]
        new_target = [('accounts', '0016_repository_image_category_names')]
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(old_target)
            old = executor.loader.project_state(old_target).apps
            user = old.get_model('accounts', 'User').objects.create(username='migration-user', role='researcher')
            batch = old.get_model('accounts', 'ImageBatch').objects.create(
                user_id=user.pk, name='Preserved survey', survey_date=date(2026, 10, 25),
                area_name='Test site', latitude='7.123456', longitude='125.123456')
            transect = old.get_model('accounts', 'Transect').objects.create(
                batch_id=batch.pk, number=1, coverage_percent='40.00', coverage_class='B')
            original = {'batch_id': batch.pk, 'transect_id': transect.pk,
                        'image': 'batch_images/preserved.png', 'description': 'Keep this description',
                        'quadrat_rect': {'x': .1, 'y': .1, 'w': .8, 'h': .8},
                        'quadrat_points': [{'x': .5, 'y': .5}],
                        'point_classes': ['Hard Coral'], 'coverage_percent': Decimal('40.00')}
            image = old.get_model('accounts', 'BatchImage').objects.create(**original, coverage_class='B')
            executor = MigrationExecutor(connection)
            executor.migrate(new_target)
            new = executor.loader.project_state(new_target).apps
            saved = new.get_model('accounts', 'SurveyImage').objects.get(pk=image.pk)
            for name, value in original.items():
                self.assertEqual(getattr(saved, name), value)
            self.assertEqual(saved.coverage_category, 'B')
            self.assertEqual(new.get_model('accounts', 'Transect').objects.get(pk=transect.pk).coverage_category, 'B')
            self.assertEqual(new.get_model('accounts', 'DataRepository').objects.get(pk=batch.pk).name, batch.name)
            self.assertIn('accounts_surveyimage', connection.introspection.table_names())
            self.assertNotIn('accounts_batchimage', connection.introspection.table_names())
            MigrationExecutor(connection).migrate(old_target)
            restored = old.get_model('accounts', 'BatchImage').objects.get(pk=image.pk)
            self.assertEqual(restored.coverage_class, 'B')
            self.assertEqual(restored.point_classes, original['point_classes'])
        finally:
            MigrationExecutor(connection).migrate(new_target)
