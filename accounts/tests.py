import json
import os
import runpy
import tempfile
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase

from .management.commands.database_audit import FullPrecisionJSONEncoder
from .models import Notification, User
from .signals import notify_admins_of_new_registration


class RegistrationFixtureSignalTests(SimpleTestCase):
    def test_raw_fixture_load_does_not_query_or_create_notifications(self):
        user = User(username='pending-fixture', role='pending')
        with patch('accounts.signals.Notification.objects.bulk_create') as create:
            notify_admins_of_new_registration(User, user, created=True, raw=True)
        create.assert_not_called()


class RegistrationNotificationTests(TestCase):
    def test_regular_registration_still_notifies_administrator(self):
        admin = User.objects.create_user(username='administrator', role='admin')
        User.objects.create_user(username='new-researcher', role='pending')
        self.assertEqual(Notification.objects.filter(recipient=admin, verb='registration_pending').count(), 1)


class DatabaseConfigurationTests(SimpleTestCase):
    def load_settings(self, values):
        with patch.dict(os.environ, values):
            return runpy.run_path(str(Path(__file__).resolve().parent.parent / 'coral_app/settings.py'))

    def test_sqlite_override_ignores_postgresql_database_name(self):
        settings = self.load_settings({'DB_ENGINE': 'sqlite', 'DB_NAME': 'coralsense_local'})
        self.assertEqual(settings['DATABASES']['default']['NAME'].name, 'db.sqlite3')

    def test_postgresql_uses_explicit_environment_credentials(self):
        settings = self.load_settings({'DB_ENGINE': 'postgresql', 'DB_NAME': 'example_db',
                                       'DB_USER': 'example_user', 'DB_PASSWORD': 'test-only',
                                       'DB_HOST': '127.0.0.1', 'DB_PORT': '5432'})
        config = settings['DATABASES']['default']
        self.assertEqual(config['ENGINE'], 'django.db.backends.postgresql')
        self.assertEqual(config['NAME'], 'example_db')
        self.assertEqual(config['USER'], 'example_user')

    def test_invalid_backend_fails_instead_of_silently_using_sqlite(self):
        with self.assertRaises(ImproperlyConfigured):
            self.load_settings({'DB_ENGINE': 'invalid'})


class DatabaseAuditTests(TestCase):
    def test_export_encoder_preserves_submillisecond_timestamp(self):
        value = datetime(2026, 10, 24, microsecond=123, tzinfo=timezone.utc)
        encoded = json.dumps(value, cls=FullPrecisionJSONEncoder)
        self.assertEqual(json.loads(encoded), '2026-10-24T00:00:00.000123Z')

    def test_audit_accepts_unchanged_data_and_detects_changed_records(self):
        user = User.objects.create_user(username='audit-user', role='researcher')
        with tempfile.TemporaryDirectory() as directory:
            baseline = Path(directory) / 'baseline.json'
            fixture = Path(directory) / 'records.json'
            call_command('database_audit', output=baseline, stdout=StringIO(), **{'export': fixture})
            exported = next(row for row in json.loads(fixture.read_text(encoding='utf-8'))
                            if row['model'] == 'accounts.user' and row['pk'] == user.pk)
            self.assertEqual(exported['fields']['created_at'], user.created_at.isoformat().replace('+00:00', 'Z'))
            call_command('database_audit', compare=baseline, stdout=StringIO())
            user.first_name = 'Changed'
            user.save(update_fields=['first_name'])
            with self.assertRaises(CommandError):
                call_command('database_audit', compare=baseline, stdout=StringIO())
