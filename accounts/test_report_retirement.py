from datetime import date
from io import BytesIO

from django.test import TestCase
from django.urls import reverse
from openpyxl import load_workbook

from .models import DataRepository, Report, SurveyImage, Transect, User


class ReportRetirementTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='excel-researcher', role='researcher')
        self.client.force_login(self.user)
        self.repository = DataRepository.objects.create(
            user=self.user, name='Excel results', area_name='Test reef', survey_date=date(2026, 11, 4),
            latitude=7, longitude=125)
        transect = Transect.objects.create(batch=self.repository, number=1)
        SurveyImage.objects.create(batch=self.repository, transect=transect, image='batch_images/results.png',
                                   quadrat_rect={}, quadrat_points=[],
                                   point_classes=['Hard Coral'] * 6 + ['Other Substrate'] * 4)

    def test_old_reports_bookmark_redirects_to_repositories(self):
        self.assertRedirects(self.client.get(reverse('reports')), reverse('batches'))

    def test_retired_report_endpoints_cannot_generate_or_delete_saved_reports(self):
        archive = Report.objects.create(user=self.user, title='Historical report', report_type='summary',
                                        export_format='pdf', status='completed')
        paths = [('/accounts/researcher/reports/generate/', 'post'),
                 (f'/accounts/researcher/reports/{archive.pk}/download/', 'get'),
                 (f'/accounts/researcher/reports/{archive.pk}/view/', 'get'),
                 (f'/accounts/researcher/reports/{archive.pk}/delete/', 'delete')]
        for path, method in paths:
            with self.subTest(path=path):
                self.assertEqual(getattr(self.client, method)(path).status_code, 404)
        self.assertEqual(Report.objects.count(), 1)
        self.assertTrue(Report.objects.filter(pk=archive.pk).exists())

    def test_researcher_and_admin_pages_have_no_report_navigation(self):
        for name in ('researcher_dashboard', 'batches', 'analysis_results', 'map_view', 'upload_batch', 'account_settings'):
            with self.subTest(page=name):
                response = self.client.get(reverse(name))
                self.assertEqual(response.status_code, 200)
                self.assertNotContains(response, 'href="' + reverse('reports') + '"')
        admin = User.objects.create_user(username='excel-admin', role='admin')
        self.client.force_login(admin)
        for name in ('all_batches', 'manage_users', 'accept_researcher'):
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200)
            self.assertNotContains(response, 'href="' + reverse('reports') + '"')
        self.assertNotContains(self.client.get(reverse('manage_users')), 'data-label="Reports"')

    def test_excel_result_download_and_repository_links_work(self):
        url = reverse('batch_export_excel', args=[self.repository.pk])
        self.assertContains(self.client.get(reverse('batches')), url)
        self.assertContains(self.client.get(reverse('batch_detail', args=[self.repository.pk])), url)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        workbook = load_workbook(BytesIO(response.content), data_only=True)
        rows = {row[0].value: row for row in workbook.active.iter_rows()}
        self.assertEqual(rows['OTHER SUBSTRATE (OS)'][1].value, 40)
        self.assertEqual(rows['Sum (excluding tape+shadow+wand)'][1].value, 100)

    def test_retired_bookmark_follows_role_guards(self):
        for role, destination in (('pending', 'pending_approval'), ('superadmin', 'admin:index')):
            user = User.objects.create_user(username=f'retired-{role}', role=role)
            self.client.force_login(user)
            self.assertRedirects(self.client.get(reverse('reports')), reverse(destination), fetch_redirect_response=False)
        self.client.logout()
        self.assertEqual(self.client.get(reverse('reports')).status_code, 302)
