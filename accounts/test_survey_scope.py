from datetime import date
from urllib.parse import parse_qs, urlsplit

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from .models import DataRepository, SurveyImage, Transect, User


class SurveyScopeTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='scope-owner', role='researcher')
        self.other = User.objects.create_user(username='scope-other', role='researcher')
        self.extra = User.objects.create_user(username='scope-extra', role='researcher')
        self.own = self.site('Own survey', self.user, 'Owned area', 10)
        # Owner may also be tagged; neither tags nor unrelated tagged accounts
        # may multiply the image count during queryset aggregation.
        self.own.surveyors.add(self.user, self.other, self.extra)
        self.tagged = self.site('Tagged survey', self.other, 'Tagged area', 0)
        self.tagged.surveyors.add(self.user)
        self.unrelated = self.site('Other survey', self.other, 'Other area', 6)
        self.unrelated.surveyor_names = self.user.username
        self.unrelated.save(update_fields=['surveyor_names'])
        self.trashed = self.site('Trashed survey', self.user, 'Trash area', 8)
        self.trashed.trashed_at = timezone.now()
        self.trashed.save(update_fields=['trashed_at'])
        self.client.force_login(self.user)

    def site(self, name, owner, area, hc):
        site = DataRepository.objects.create(
            user=owner, name=name, area_name=area, survey_date=date(2026, 11, 15),
            latitude=7, longitude=125,
        )
        transect = Transect.objects.create(batch=site, number=1)
        SurveyImage.objects.create(
            batch=site, transect=transect, image='batch_images/scope-test.jpg',
            quadrat_rect={}, quadrat_points=[],
            point_classes=['Hard Coral'] * hc + ['Other Substrate'] * (10 - hc),
        )
        return site

    def test_researcher_dashboard_scopes_every_summary_and_recent_submission(self):
        response = self.client.get(reverse('researcher_dashboard'), {'scope': 'mine'})
        self.assertEqual(response.context['survey_scope']['value'], 'mine')
        self.assertEqual(response.context['total_surveys'], 2)
        self.assertEqual(response.context['avg_coverage'], 50)
        self.assertEqual(response.context['locations'], 2)
        self.assertEqual(response.context['healthy_reefs'], 1)
        self.assertEqual(response.context['benthic_chart']['values'], [10, 0, 10])
        recent = response.context['recent_submissions']
        self.assertEqual({row['id'] for row in recent}, {self.own.pk, self.tagged.pk})
        self.assertTrue(all(row['image_count'] == 1 for row in recent))

    def test_analysis_scope_updates_rows_areas_charts_and_monthly_summary(self):
        response = self.client.get(reverse('analysis_results'), {'scope': 'mine'})
        self.assertEqual({row['id'] for row in response.context['rows']}, {self.own.pk, self.tagged.pk})
        self.assertEqual(response.context['total_images'], 2)
        self.assertEqual(response.context['total_batches'], 2)
        self.assertEqual(response.context['area_options'], ['Owned area', 'Tagged area'])
        self.assertEqual(response.context['chart_data']['classes'], [1, 0, 0, 1, 0])
        month = response.context['monthly_stats'][0]
        self.assertEqual((month['batch_count'], month['image_count'], month['avg_coverage']), (2, 2, 50))
        self.assertContains(response, 'name="scope" value="mine"')
        self.assertContains(response, reverse('analysis_results') + '?scope=mine')

    def test_analysis_scope_combines_with_filters_and_scope_links_preserve_them(self):
        filters = {'scope': 'mine', 'coverage_class': 'A', 'start_date': '2026-11-01', 'area': 'Owned area'}
        response = self.client.get(reverse('analysis_results'), filters)
        self.assertEqual([row['id'] for row in response.context['rows']], [self.own.pk])
        for link in response.context['survey_scope']['links']:
            query = parse_qs(urlsplit(link['url']).query)
            self.assertEqual(query['coverage_class'], ['A'])
            self.assertEqual(query['start_date'], ['2026-11-01'])
            self.assertEqual(query['area'], ['Owned area'])
        self.assertEqual(response.context['monthly_stats'][0]['avg_coverage'], 100)

    def test_default_and_invalid_scope_keep_overall_and_admin_mine_stays_personal(self):
        for role in ('researcher', 'admin'):
            self.user.role = role
            self.user.save(update_fields=['role'])
            for page in ('researcher_dashboard', 'analysis_results'):
                key = 'total_surveys' if page == 'researcher_dashboard' else 'total_batches'
                for query in ({}, {'scope': 'someone-else'}):
                    response = self.client.get(reverse(page), query)
                    self.assertEqual(response.context['survey_scope']['value'], 'overall')
                    self.assertEqual(response.context[key], 3)
                mine = self.client.get(reverse(page), {'scope': 'mine'})
                self.assertEqual(mine.context[key], 2)

    def test_empty_my_surveys_has_empty_results_and_historical_export_respects_scope(self):
        self.client.force_login(self.extra)
        self.own.surveyors.remove(self.extra)
        dashboard = self.client.get(reverse('researcher_dashboard'), {'scope': 'mine'})
        self.assertEqual(dashboard.context['total_surveys'], 0)
        self.assertIsNone(dashboard.context['avg_coverage'])
        analysis = self.client.get(reverse('analysis_results'), {'scope': 'mine'})
        self.assertEqual(analysis.context['rows'], [])
        self.assertEqual(analysis.context['monthly_stats'], [])
        self.client.force_login(self.user)
        csv = self.client.get(reverse('analysis_results_export_csv'), {'scope': 'mine'})
        self.assertContains(csv, self.own.name)
        self.assertContains(csv, self.tagged.name)
        self.assertNotContains(csv, self.unrelated.name)
        self.assertNotContains(csv, self.trashed.name)
