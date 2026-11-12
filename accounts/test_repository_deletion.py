import json
import tempfile
from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from .models import DataRepository, SurveyImage, Transect, User


class RepositoryDeletionTests(TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(override_settings(MEDIA_ROOT=directory))
        self.owner = User.objects.create_user(username='repository-owner', role='researcher')
        self.repository = DataRepository.objects.create(
            user=self.owner, name='Catagman Reef', survey_date=date(2026, 10, 1),
            area_name='Catagman', latitude=7, longitude=125,
        )
        self.transect = Transect.objects.create(batch=self.repository, number=1)
        self.image = SurveyImage.objects.create(
            batch=self.repository, transect=self.transect,
            image=SimpleUploadedFile('coral.jpg', b'test image'),
            quadrat_rect={}, quadrat_points=[], point_classes=['Hard Coral'],
        )
        self.url = reverse('batch_delete', args=[self.repository.pk])
        self.client.force_login(self.owner)

    def test_move_to_trash_preserves_contents_and_restore_recovers_them(self):
        storage, filename = self.image.image.storage, self.image.image.name
        response = self.client.post(self.url)
        self.assertRedirects(response, reverse('batches'))
        self.repository.refresh_from_db()
        self.assertIsNotNone(self.repository.trashed_at)
        self.assertTrue(Transect.objects.filter(pk=self.transect.pk).exists())
        self.image.refresh_from_db()
        self.assertEqual(self.image.point_classes, ['Hard Coral'])
        self.assertTrue(storage.exists(filename))
        self.assertContains(self.client.get(reverse('repository_trash')), self.repository.name)
        response = self.client.post(
            reverse('repository_trash_action', args=[self.repository.pk]), {'action': 'restore'},
        )
        self.assertRedirects(response, reverse('repository_trash'))
        self.repository.refresh_from_db()
        self.assertIsNone(self.repository.trashed_at)
        self.assertContains(self.client.get(reverse('batches')), self.repository.name)

    def test_permanent_deletion_cascades_and_removes_file_after_commit(self):
        storage, filename = self.image.image.storage, self.image.image.name
        action_url = reverse('repository_trash_action', args=[self.repository.pk])
        self.assertEqual(self.client.post(action_url, {'action': 'delete'}).status_code, 404)
        self.client.post(self.url)
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            response = self.client.post(action_url, {'action': 'delete'})
            self.assertFalse(DataRepository.objects.filter(pk=self.repository.pk).exists())
            self.assertFalse(Transect.objects.filter(pk=self.transect.pk).exists())
            self.assertFalse(SurveyImage.objects.filter(pk=self.image.pk).exists())
            self.assertTrue(storage.exists(filename))
        self.assertEqual(len(callbacks), 1)
        self.assertFalse(storage.exists(filename))
        self.assertRedirects(response, reverse('repository_trash'))
        self.assertEqual(self.client.post(action_url, {'action': 'delete'}).status_code, 404)

    def test_other_researcher_pending_and_anonymous_cannot_delete(self):
        other = User.objects.create_user(username='other-researcher', role='researcher')
        self.client.force_login(other)
        self.assertEqual(self.client.post(self.url).status_code, 404)
        other.role = 'pending'
        other.save(update_fields=['role'])
        self.assertRedirects(self.client.post(self.url), reverse('pending_approval'))
        self.client.logout()
        self.assertEqual(self.client.post(self.url).status_code, 302)
        self.assertTrue(DataRepository.objects.filter(pk=self.repository.pk).exists())

    def test_admin_can_move_and_restore_other_researchers_repositories(self):
        admin = User.objects.create_user(username='repository-admin', role='admin')
        self.client.force_login(admin)
        self.assertContains(self.client.get(reverse('all_batches')), self.url)
        response = self.client.post(self.url, {'return_to': 'all_batches'})
        self.assertRedirects(response, reverse('all_batches'))
        self.assertContains(self.client.get(reverse('repository_trash')), self.repository.name)
        self.client.post(reverse('repository_trash_action', args=[self.repository.pk]), {'action': 'restore'})
        self.repository.refresh_from_db()
        self.assertIsNone(self.repository.trashed_at)

    def test_delete_requires_post_and_csrf(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.owner)
        self.assertEqual(csrf_client.post(self.url).status_code, 403)
        self.assertTrue(DataRepository.objects.filter(pk=self.repository.pk).exists())
        self.assertContains(self.client.get(reverse('batches')), self.url)
        action_url = reverse('repository_trash_action', args=[self.repository.pk])
        self.assertEqual(self.client.get(action_url).status_code, 405)
        self.assertEqual(csrf_client.post(action_url, {'action': 'restore'}).status_code, 403)

    def test_file_referenced_by_another_repository_is_preserved(self):
        other = DataRepository.objects.create(
            user=self.owner, name='Shared legacy file', survey_date=date(2026, 10, 2),
            area_name='Catagman', latitude=7, longitude=125,
        )
        SurveyImage.objects.create(
            batch=other, image=self.image.image.name, quadrat_rect={}, quadrat_points=[],
        )
        self.client.post(self.url)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(reverse('repository_trash_action', args=[self.repository.pk]), {'action': 'delete'})
        self.assertTrue(self.image.image.storage.exists(self.image.image.name))

    def test_trash_is_scoped_and_other_researchers_cannot_restore_or_purge(self):
        self.client.post(self.url)
        other = User.objects.create_user(username='trash-outsider', role='researcher')
        self.client.force_login(other)
        self.assertEqual(list(self.client.get(reverse('repository_trash')).context['batches']), [])
        action_url = reverse('repository_trash_action', args=[self.repository.pk])
        for action in ('restore', 'delete'):
            self.assertEqual(self.client.post(action_url, {'action': action}).status_code, 404)
        self.assertTrue(DataRepository.objects.trashed().filter(pk=self.repository.pk).exists())

    def test_trashed_repository_is_excluded_from_active_pages_and_downloads(self):
        self.client.post(self.url)
        self.assertEqual(list(self.client.get(reverse('batches')).context['batches']), [])
        self.assertEqual(self.client.get(reverse('researcher_dashboard')).context['total_images'], 0)
        self.assertEqual(self.client.get(reverse('analysis_results')).context['total_batches'], 0)
        self.assertEqual(self.client.get(reverse('map_view')).context['total_batches'], 0)
        self.assertEqual(self.client.get(reverse('public_dashboard')).context['dashboard_surveys'], [])
        self.assertEqual(list(self.client.get(reverse('upload_batch')).context['survey_points']), [])
        for route, kwargs in (
            ('batch_detail', {'batch_id': self.repository.pk}),
            ('batch_export_excel', {'batch_id': self.repository.pk}),
            ('batch_image_annotated', {'image_id': self.image.pk}),
            ('uploaded_media', {'path': self.image.image.name}),
        ):
            with self.subTest(route=route):
                self.assertEqual(self.client.get(reverse(route, kwargs=kwargs)).status_code, 404)
        self.assertRedirects(self.client.post(reverse('upload_batch'), {
            'existing_batch_id': self.repository.pk,
        }), reverse('upload_batch'))
        self.assertEqual(self.repository.transects.count(), 1)

    def test_profile_links_to_trash_after_settings(self):
        page = self.client.get(reverse('batches')).content.decode()
        self.assertLess(page.index(reverse('account_settings')), page.index(reverse('repository_trash')))
        self.assertIn('Move to trash', page)

    def test_map_visibility_persists_and_changes_map_data(self):
        url = reverse('batch_map_visibility', args=[self.repository.pk])
        self.assertTrue(self.repository.is_map_visible)
        self.assertContains(self.client.get(reverse('batches')), 'Hide from map')
        for _ in range(2):
            self.assertRedirects(self.client.post(url, {'is_map_visible': 'false'}), reverse('batches'))
        self.repository.refresh_from_db()
        self.assertFalse(self.repository.is_map_visible)
        map_page = self.client.get(reverse('map_view'))
        self.assertEqual(json.loads(map_page.context['geojson_data'])['features'], [])
        self.assertEqual(map_page.context['total_batches'], 0)
        self.assertContains(self.client.get(reverse('batches')), 'Show on map')
        public_rows = self.client.get(reverse('public_dashboard')).context['dashboard_surveys']
        self.assertEqual(len(public_rows), 1)
        self.assertFalse(public_rows[0]['mapVisible'])
        self.assertEqual(self.client.get(reverse('researcher_dashboard')).context['total_images'], 1)
        self.assertEqual(self.client.get(reverse('analysis_results')).context['total_batches'], 1)
        self.client.post(url, {'is_map_visible': 'true'})
        self.assertEqual(self.client.get(reverse('map_view')).context['total_batches'], 1)
        self.assertContains(self.client.get(reverse('batches')), 'Hide from map')

    def test_map_visibility_permissions_post_and_csrf(self):
        url = reverse('batch_map_visibility', args=[self.repository.pk])
        self.assertEqual(self.client.get(url).status_code, 405)
        self.assertEqual(self.client.post(url, {'is_map_visible': 'invalid'}).status_code, 400)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(self.owner)
        self.assertEqual(csrf_client.post(url, {'is_map_visible': 'false'}).status_code, 403)
        other = User.objects.create_user(username='map-outsider', role='researcher')
        self.client.force_login(other)
        self.assertEqual(self.client.post(url, {'is_map_visible': 'false'}).status_code, 404)
        other.role = 'pending'
        other.save(update_fields=['role'])
        self.assertRedirects(self.client.post(url, {'is_map_visible': 'false'}), reverse('pending_approval'))
        self.repository.refresh_from_db()
        self.assertTrue(self.repository.is_map_visible)

    def test_admin_can_control_visibility_and_trashed_repositories_are_excluded(self):
        url = reverse('batch_map_visibility', args=[self.repository.pk])
        admin = User.objects.create_user(username='map-admin', role='admin')
        self.client.force_login(admin)
        self.assertRedirects(self.client.post(url, {
            'is_map_visible': 'false', 'return_to': 'all_batches',
        }), reverse('all_batches'))
        self.assertContains(self.client.get(reverse('all_batches')), 'Show on map')
        self.client.post(self.url)
        self.assertEqual(self.client.post(url, {'is_map_visible': 'true'}).status_code, 404)
        self.client.post(reverse('repository_trash_action', args=[self.repository.pk]), {'action': 'restore'})
        self.repository.refresh_from_db()
        self.assertFalse(self.repository.is_map_visible)
