from datetime import date
from io import BytesIO
import json
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image

from .forms import SurveyorTagsForm
from .models import DataRepository, SurveyImage, Transect, User


class RepositorySharingTests(TestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.enterContext(override_settings(MEDIA_ROOT=directory))
        self.owner = User.objects.create_user(username='sharing-owner', first_name='Survey', last_name='Owner', role='researcher')
        self.member = User.objects.create_user(username='sharing-member', first_name='Tagged', last_name='Surveyor', email='tagged@example.com', role='researcher')
        self.outsider = User.objects.create_user(username='sharing-outsider', first_name='Other', last_name='Researcher', role='researcher')
        self.pending = User.objects.create_user(username='sharing-pending', role='pending')
        self.inactive = User.objects.create_user(username='sharing-inactive', role='researcher', is_active=False)
        self.repository = DataRepository.objects.create(
            user=self.owner, name='Shared Reef', survey_date=date(2026, 11, 12),
            surveyor_names='Historical Surveyor', area_name='Catagman', latitude=7, longitude=125,
        )
        self.transect = Transect.objects.create(batch=self.repository, number=1)
        self.payload = {'rect': {'x': .1, 'y': .1, 'w': .8, 'h': .8},
                        'points': [{'x': .25, 'y': .25}, {'x': .75, 'y': .75}],
                        'point_classes': ['Hard Coral', 'Soft Coral']}
        self.image = SurveyImage.objects.create(
            batch=self.repository, transect=self.transect, image=self.photo(),
            quadrat_rect=self.payload['rect'], quadrat_points=self.payload['points'],
            point_classes=self.payload['point_classes'],
        )
        self.repository.surveyors.add(self.member)
        self.detail_url = reverse('batch_detail', args=[self.repository.pk])
        self.client.force_login(self.owner)

    def photo(self):
        buffer = BytesIO()
        Image.new('RGB', (40, 40), '#1c5f6d').save(buffer, format='PNG')
        return SimpleUploadedFile('sharing.png', buffer.getvalue(), content_type='image/png')

    def upload_data(self, **extra):
        return {'batch_name': 'New Shared Reef', 'survey_date': '2026-11-12',
                'surveyor_names': 'Survey Owner', 'area_name': 'Catagman',
                'latitude': '7', 'longitude': '125', 'images': self.photo(),
                'image_quadrat_1': json.dumps(self.payload), **extra}

    def edit_data(self, **extra):
        return {'name': self.repository.name, 'survey_date': '2026-11-12',
                'surveyor_names': self.repository.surveyor_names, 'area_name': 'Catagman',
                'latitude': '7', 'longitude': '125', **extra}

    def test_upload_saves_account_tags_and_surveyor_names(self):
        response = self.client.post(reverse('upload_batch'), self.upload_data(
            surveyor_tags_present='True', surveyor_ids=[self.owner.pk, self.member.pk],
        ))
        repository = DataRepository.objects.get(name='New Shared Reef')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(set(repository.surveyors.values_list('pk', flat=True)), {self.owner.pk, self.member.pk})
        self.assertEqual(repository.surveyor_names, 'Survey Owner, Tagged Surveyor')
        self.assertEqual(repository.images.count(), 1)

    def test_only_approved_active_accounts_can_be_selected(self):
        for ids in ([self.pending.pk], [self.inactive.pk], [999999], ['invalid'], [self.member.pk, self.pending.pk]):
            with self.subTest(ids=ids):
                response = self.client.post(reverse('upload_batch'), self.upload_data(
                    surveyor_tags_present='True', surveyor_ids=ids,
                ))
                self.assertRedirects(response, reverse('upload_batch'))
                self.assertFalse(DataRepository.objects.filter(name='New Shared Reef').exists())
        form = SurveyorTagsForm()
        self.assertNotIn(self.pending.pk, form.fields['surveyor_ids'].queryset.values_list('pk', flat=True))
        self.assertNotIn(self.inactive.pk, form.fields['surveyor_ids'].queryset.values_list('pk', flat=True))

    def test_tagged_user_can_view_details_images_and_excel_with_no_management_controls(self):
        self.client.force_login(self.member)
        listing = self.client.get(reverse('batches'))
        self.assertContains(listing, 'Shared Reef')
        self.assertNotContains(listing, reverse('batch_delete', args=[self.repository.pk]))
        self.assertNotContains(listing, f'?site={self.repository.pk}" class="action-outline"><i data-lucide="plus"')
        page = self.client.get(self.detail_url)
        self.assertEqual(page.status_code, 200)
        self.assertFalse(page.context['can_manage_repository'])
        self.assertNotContains(page, 'Save Changes')
        self.assertNotContains(page, '>Add transect</a>')
        for route, kwargs in (
            ('batch_export_excel', {'batch_id': self.repository.pk}),
            ('batch_image_annotated', {'image_id': self.image.pk}),
            ('uploaded_media', {'path': self.image.image.name}),
        ):
            with self.subTest(route=route):
                response = self.client.get(reverse(route, kwargs=kwargs))
                self.assertEqual(response.status_code, 200)
                response.close()

    def test_tagged_user_cannot_edit_append_change_visibility_or_trash(self):
        self.client.force_login(self.member)
        self.assertEqual(self.client.post(self.detail_url, self.edit_data(name='Unauthorized edit')).status_code, 403)
        self.assertRedirects(self.client.post(reverse('upload_batch'), self.upload_data(
            existing_batch_id=self.repository.pk,
        )), reverse('upload_batch'))
        for route, data in (
            ('batch_delete', {}), ('batch_map_visibility', {'is_map_visible': 'false'}),
        ):
            self.assertEqual(self.client.post(reverse(route, args=[self.repository.pk]), data).status_code, 404)
        self.repository.refresh_from_db()
        self.assertEqual(self.repository.name, 'Shared Reef')
        self.assertEqual(self.repository.transects.count(), 1)
        self.assertIsNone(self.repository.trashed_at)
        self.assertTrue(self.repository.is_map_visible)

    def test_removing_tag_revokes_shared_access(self):
        response = self.client.post(self.detail_url, self.edit_data(surveyor_tags_present='True'))
        self.assertRedirects(response, self.detail_url)
        self.assertFalse(self.repository.surveyors.exists())
        self.client.force_login(self.member)
        self.assertNotContains(self.client.get(reverse('batches')), 'Shared Reef')
        for route, kwargs in (
            ('batch_detail', {'batch_id': self.repository.pk}),
            ('batch_export_excel', {'batch_id': self.repository.pk}),
            ('batch_image_annotated', {'image_id': self.image.pk}),
            ('uploaded_media', {'path': self.image.image.name}),
        ):
            self.assertEqual(self.client.get(reverse(route, kwargs=kwargs)).status_code, 404)

    def test_legacy_metadata_edits_preserve_membership_and_account_names_can_be_added(self):
        self.assertRedirects(self.client.post(self.detail_url, self.edit_data()), self.detail_url)
        self.assertTrue(self.repository.surveyors.filter(pk=self.member.pk).exists())
        response = self.client.post(self.detail_url, self.edit_data(
            surveyor_tags_present='True', surveyor_ids=[self.member.pk, self.outsider.pk],
        ))
        self.assertRedirects(response, self.detail_url)
        self.repository.refresh_from_db()
        self.assertIn('Historical Surveyor', self.repository.surveyor_names)
        self.assertIn('Other Researcher', self.repository.surveyor_names)

    def test_multiple_tags_do_not_duplicate_repositories_or_image_counts(self):
        self.repository.surveyors.add(self.owner, self.outsider)
        for user in (self.owner, self.member):
            self.client.force_login(user)
            rows = list(self.client.get(reverse('batches')).context['batches'])
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].image_count, 1)

    def test_text_names_alone_do_not_grant_access_and_pending_or_inactive_members_are_denied(self):
        self.repository.surveyor_names = self.outsider.get_full_name()
        self.repository.save(update_fields=['surveyor_names'])
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(self.detail_url).status_code, 404)
        self.repository.surveyors.add(self.pending, self.inactive)
        self.assertFalse(DataRepository.objects.viewable_by(self.pending).exists())
        self.assertFalse(DataRepository.objects.viewable_by(self.inactive).exists())

    def test_trash_revokes_member_access_until_restored(self):
        self.client.post(reverse('batch_delete', args=[self.repository.pk]))
        self.client.force_login(self.member)
        self.assertEqual(self.client.get(self.detail_url).status_code, 404)
        self.assertFalse(self.client.get(reverse('repository_trash')).context['batches'])
        self.client.force_login(self.owner)
        self.client.post(reverse('repository_trash_action', args=[self.repository.pk]), {'action': 'restore'})
        self.client.force_login(self.member)
        self.assertEqual(self.client.get(self.detail_url).status_code, 200)

    def test_administrator_can_manage_shared_membership(self):
        admin = User.objects.create_user(username='sharing-admin', role='admin')
        self.client.force_login(admin)
        self.assertTrue(self.client.get(self.detail_url).context['can_manage_repository'])
        self.assertRedirects(self.client.post(self.detail_url, self.edit_data(
            surveyor_tags_present='True', surveyor_ids=[self.outsider.pk],
        )), self.detail_url)
        self.assertEqual(list(self.repository.surveyors.values_list('pk', flat=True)), [self.outsider.pk])
