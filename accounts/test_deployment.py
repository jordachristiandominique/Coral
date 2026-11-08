from datetime import date
import os
from pathlib import Path
import runpy
import tempfile
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.db import OperationalError
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from .models import DataRepository, SurveyImage, User


class HostedSettingsTests(SimpleTestCase):
    def load_settings(self, **overrides):
        values = {
            'DJANGO_DEPLOYMENT': 'railway',
            'DJANGO_SECRET_KEY': 'deployment-test-value-' * 4,
            'DB_ENGINE': 'postgresql', 'DB_NAME': 'example', 'DB_USER': 'example',
            'DB_PASSWORD': 'test-only', 'DB_HOST': 'postgres.railway.internal',
            'RAILWAY_PUBLIC_DOMAIN': 'example.up.railway.app',
            'DJANGO_ALLOWED_HOSTS': '', 'DJANGO_CSRF_TRUSTED_ORIGINS': '',
        }
        values.update(overrides)
        with patch.dict(os.environ, values):
            return runpy.run_path(str(Path(__file__).resolve().parent.parent / 'coral_app/settings.py'))

    def test_local_defaults_remain_available(self):
        config = self.load_settings(DJANGO_DEPLOYMENT='')
        self.assertTrue(config['DEBUG'])
        self.assertEqual(config['ALLOWED_HOSTS'], [])
        self.assertEqual(config['MEDIA_ROOT'].name, 'media')
        self.assertNotIn('whitenoise.middleware.WhiteNoiseMiddleware', config['MIDDLEWARE'])

    def test_hosted_profile_uses_explicit_hosts_https_and_persistent_paths(self):
        config = self.load_settings(MEDIA_ROOT='/data/media', YOLO_ARTIFACT_DIR='/data/model_artifacts/yolov8s-validator-v3')
        self.assertFalse(config['DEBUG'])
        self.assertIn('example.up.railway.app', config['ALLOWED_HOSTS'])
        self.assertEqual(config['CSRF_TRUSTED_ORIGINS'], ['https://example.up.railway.app'])
        self.assertTrue(config['SESSION_COOKIE_SECURE'])
        self.assertTrue(config['CSRF_COOKIE_SECURE'])
        self.assertEqual(config['SECURE_PROXY_SSL_HEADER'], ('HTTP_X_FORWARDED_PROTO', 'https'))
        self.assertEqual(config['MEDIA_ROOT'], Path('/data/media'))
        self.assertEqual(config['MEDIA_URL'], '/uploads/')
        self.assertIn('whitenoise.middleware.WhiteNoiseMiddleware', config['MIDDLEWARE'])

    def test_hosted_profile_rejects_development_secret_sqlite_and_wildcard_hosts(self):
        for values in ({'DJANGO_SECRET_KEY': ''}, {'DJANGO_SECRET_KEY': 'django-insecure-' + 'x' * 60},
                       {'DB_ENGINE': 'sqlite'}, {'DJANGO_ALLOWED_HOSTS': '*'}):
            with self.subTest(values=values), self.assertRaises(ImproperlyConfigured):
                self.load_settings(**values)


class HostedFileAndHealthTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.media_root = Path(self.temp.name) / 'media'
        (self.media_root / 'batch_images').mkdir(parents=True)
        (self.media_root / 'batch_images/photo.jpg').write_bytes(b'photo-bytes')
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.owner = User.objects.create_user(username='host-owner', role='researcher')
        self.other = User.objects.create_user(username='host-other', role='researcher')
        self.admin = User.objects.create_user(username='host-admin', role='admin')
        self.pending = User.objects.create_user(username='host-pending', role='pending')
        self.site = DataRepository.objects.create(user=self.owner, name='Hosted site',
                                                area_name='Test area', survey_date=date(2026, 11, 8),
                                                latitude=7, longitude=125)
        SurveyImage.objects.create(batch=self.site, image='batch_images/photo.jpg',
                                   quadrat_rect={}, quadrat_points=[])
        self.url = reverse('uploaded_media', kwargs={'path': 'batch_images/photo.jpg'})

    def test_media_requires_login_and_survey_ownership_or_admin_role(self):
        self.assertEqual(self.client.get(self.url).status_code, 302)
        for user, expected in ((self.owner, 200), (self.other, 404), (self.admin, 200)):
            self.client.force_login(user)
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, expected)
            if expected == 200:
                self.assertEqual(b''.join(response.streaming_content), b'photo-bytes')
                self.assertEqual(response['Cache-Control'], 'private, no-store')
                self.assertEqual(response['Content-Type'], 'image/jpeg')
        self.client.force_login(self.pending)
        self.assertRedirects(self.client.get(self.url), reverse('pending_approval'), fetch_redirect_response=False)

    def test_media_blocks_path_escape_even_if_a_database_record_contains_it(self):
        (Path(self.temp.name) / 'outside.txt').write_text('private', encoding='utf-8')
        malicious = 'batch_images/../../outside.txt'
        SurveyImage.objects.create(batch=self.site, image=malicious, quadrat_rect={}, quadrat_points=[])
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get(reverse('uploaded_media', kwargs={'path': malicious})).status_code, 404)

    def test_health_checks_database_and_returns_503_without_error_details(self):
        self.assertEqual(self.client.get(reverse('health')).json(), {'status': 'ok'})
        with patch('coral_app.views.connection.cursor', side_effect=OperationalError('private database details')):
            response = self.client.get(reverse('health'))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'status': 'unavailable'})
