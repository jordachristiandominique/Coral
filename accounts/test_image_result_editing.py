from copy import deepcopy
from datetime import date
from io import BytesIO
import json
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image

from .models import DataRepository, SurveyImage, Transect, User, compute_site_hcc
from .test_upload_review import representative_payload


class ImageResultEditingTests(TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(override_settings(MEDIA_ROOT=directory))
        self.owner = User.objects.create_user(username='image-editor', role='researcher')
        self.batch = DataRepository.objects.create(user=self.owner, name='Edit Reef',
            survey_date=date(2026, 11, 14), area_name='Catagman', latitude=7, longitude=125)
        self.transect = Transect.objects.create(batch=self.batch, number=1)
        self.payload = representative_payload()
        data = BytesIO()
        Image.new('RGB', (640, 480), '#1c5f6d').save(data, format='PNG')
        self.photo = SurveyImage.objects.create(batch=self.batch, transect=self.transect,
            image=SimpleUploadedFile('edit.png', data.getvalue(), content_type='image/png'),
            quadrat_rect=self.payload['rect'], quadrat_points=self.payload['points'],
            point_classes=self.payload['point_classes'], analysis_review=self.payload['analysis'])
        self.url = reverse('edit_image_result', args=[self.photo.pk])
        self.client.force_login(self.owner)

    def post_data(self, payload=None):
        page = self.client.get(self.url)
        return {'revision': page.context['image_revision'],
                'image_quadrat_1': json.dumps(payload or self.payload)}

    def test_edit_loads_saved_results_and_saves_without_replacing_the_image(self):
        page = self.client.get(self.url)
        self.assertContains(page, 'Save changes')
        self.assertContains(self.client.get(reverse('batch_detail', args=[self.batch.pk])),
                            f'href="{self.url}"')
        self.assertEqual(page.context['saved_image_review']['result']['model'], self.payload['analysis']['model'])
        changed = deepcopy(self.payload)
        changed['analysis']['boxes'][0]['class_name'] = 'Soft Coral'
        changed['point_classes'] = ['Soft Coral'] * 8 + ['Other Substrate'] * 2
        filename = self.photo.image.name
        response = self.client.post(self.url, self.post_data(changed))
        self.assertEqual(response.status_code, 200)
        self.photo.refresh_from_db()
        self.transect.refresh_from_db()
        self.assertEqual(self.photo.coverage_percent, 0)
        self.assertEqual(self.photo.coverage_category, 'D')
        self.assertEqual(self.transect.coverage_percent, 0)
        self.assertEqual(compute_site_hcc(self.batch)['site_percent'], 0)
        self.assertEqual(self.photo.image.name, filename)
        self.assertEqual(self.batch.images.count(), 1)
        self.assertEqual(self.batch.transects.count(), 1)

    def test_stale_save_and_invalid_points_leave_existing_results_intact(self):
        data = self.post_data()
        original = deepcopy(self.photo.point_classes)
        self.photo.analysis_review = {**self.photo.analysis_review, 'square_lock': True}
        self.photo.save(update_fields=['analysis_review'])
        self.assertEqual(self.client.post(self.url, data).status_code, 409)
        bad = deepcopy(self.payload)
        bad['point_classes'][0] = 'Soft Coral'
        self.assertEqual(self.client.post(self.url, self.post_data(bad)).status_code, 400)
        self.photo.refresh_from_db()
        self.assertEqual(self.photo.point_classes, original)

    def test_shared_users_cannot_edit_but_administrators_can(self):
        data = self.post_data()
        member = User.objects.create_user(username='image-member', role='researcher')
        self.batch.surveyors.add(member)
        self.client.force_login(member)
        self.assertNotContains(self.client.get(reverse('batch_detail', args=[self.batch.pk])), 'Edit result')
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url, data).status_code, 403)
        admin = User.objects.create_user(username='image-admin', role='admin')
        self.client.force_login(admin)
        self.assertEqual(self.client.post(self.url, self.post_data()).status_code, 200)

    def test_legacy_images_open_for_reanalysis_and_trashed_images_are_unavailable(self):
        self.photo.analysis_review = {}
        self.photo.save(update_fields=['analysis_review'])
        self.assertIsNone(self.client.get(self.url).context['saved_image_review']['result'])
        self.batch.trashed_at = timezone.now()
        self.batch.save(update_fields=['trashed_at'])
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.post(self.url, {}).status_code, 404)

    def test_edit_requires_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.owner)
        self.assertEqual(client.post(self.url, self.post_data()).status_code, 403)
