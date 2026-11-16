from datetime import date
import json

from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from .models import DataRepository, SurveyImage, Transect, User, COVERAGE_CLASS_DESCRIPTIONS
from .visualization_data import composition_summary


class CompositionTests(SimpleTestCase):
    def test_other_substrate_is_included_in_denominator_and_unused_legacy_classes_are_absent(self):
        summary = composition_summary(['Hard Coral'] * 2 + ['Soft Coral'] + ['Other Substrate'] * 7)
        self.assertEqual([item['label'] for item in summary], ['Hard Coral', 'Soft Coral', 'Other Substrate'])
        self.assertEqual([item['value'] for item in summary], [20, 10, 70])
        self.assertEqual(sum(item['count'] for item in summary), 10)

    def test_historical_labels_are_preserved_and_empty_composition_has_no_values(self):
        summary = composition_summary(['Hard Coral', 'Abiotic', 'Unclassified'])
        self.assertEqual({item['label']: item['count'] for item in summary if item['count']},
                         {'Hard Coral': 1, 'Abiotic': 1, 'Other Substrate': 1})
        self.assertTrue(all(item['count'] == item['value'] == 0 for item in composition_summary([])))


class DashboardVisualizationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='chart-reviewer', role='researcher')
        self.client.force_login(self.user)

    def site(self, name, classes_by_transect):
        site = DataRepository.objects.create(user=self.user, name=name, area_name=name,
                                             survey_date=date(2026, 11, 4), latitude=7, longitude=125)
        for number, images in enumerate(classes_by_transect, 1):
            transect = Transect.objects.create(batch=site, number=number)
            for classes in images:
                SurveyImage.objects.create(batch=site, transect=transect, image='batch_images/chart.png',
                                           quadrat_rect={}, quadrat_points=[], point_classes=classes)
        return site

    def test_all_dashboards_include_other_substrate_and_site_hcc_keeps_transect_weighting(self):
        site = self.site('Unequal transects', [[['Hard Coral'] * 10, ['Hard Coral'] * 10], [['Other Substrate'] * 10]])
        response = self.client.get(reverse('researcher_dashboard'))
        self.assertEqual(response.context['avg_coverage'], 50)
        chart = response.context['benthic_chart']
        self.assertEqual(chart['labels'], ['Hard Coral', 'Soft Coral', 'Other Substrate'])
        self.assertEqual(chart['values'], [20, 0, 10])
        response = self.client.get(reverse('public_dashboard'))
        survey = response.context['dashboard_surveys'][0]
        self.assertEqual(survey['coverage'], 50)
        self.assertEqual(survey['classDistribution']['Other Substrate']['count'], 10)
        response = self.client.get(reverse('analysis_results'))
        self.assertEqual(response.context['rows'][0]['benthic']['Other Substrate'], 33.3)
        self.assertTrue(response.context['rows'][0]['is_map_visible'])
        self.assertEqual(response.context['rows'][0]['created_at'], site.created_at.isoformat())
        self.assertEqual(response.context['monthly_stats'][0]['avg_coverage'], 50)
        self.assertNotContains(response, 'analysisCoralClassChart')
        response = self.client.get(reverse('map_view'))
        feature = json.loads(response.context['geojson_data'])['features'][0]
        self.assertEqual(feature['properties']['classBreakdown']['Other Substrate'], 33.3)
        self.assertEqual(feature['properties']['coverage'], 50)
        response = self.client.get(reverse('batch_detail', args=[site.pk]))
        self.assertEqual(response.context['avg_coverage'], 50)
        chart = response.context['site_hcc_chart']
        self.assertEqual(chart['sites'][0]['avg_coverage'], 50)
        self.assertEqual(chart['sites'][0]['se'], 50)
        self.assertEqual(chart['sites'][0]['n_transects'], 2)
        self.assertEqual(chart['national_hcc_average'], 22.8)
        self.assertContains(response, 'id="batchSiteHccChart"')
        self.assertNotContains(response, 'id="coralCoveragePercentValue"')

    def test_category_filters_apply_to_composition_categories_and_monthly_summary(self):
        self.site('Category A', [[['Hard Coral'] * 6 + ['Other Substrate'] * 4]])
        self.site('Category C', [[['Hard Coral'] * 3 + ['Soft Coral'] * 2 + ['Other Substrate'] * 5]])
        response = self.client.get(reverse('analysis_results'), {'coverage_class': 'A'})
        self.assertEqual([row['name'] for row in response.context['rows']], ['Category A'])
        self.assertEqual(response.context['distribution']['C'], 0)
        month = response.context['monthly_stats'][0]
        self.assertEqual((month['batch_count'], month['avg_coverage'], month['class_a_count']), (1, 60, 1))

    def test_empty_dashboards_offer_empty_series_and_no_legacy_chart_markup(self):
        response = self.client.get(reverse('public_dashboard'))
        self.assertEqual(response.context['dashboard_surveys'], [])
        self.assertNotContains(response, 'stacked-bar-chart')
        self.assertNotContains(response, 'All 7 benthic')
        response = self.client.get(reverse('analysis_results'))
        self.assertEqual(response.context['rows'], [])
        self.assertEqual(response.context['monthly_stats'], [])

    def test_public_map_payload_matches_researcher_hcc_and_exposes_only_public_summary(self):
        site = self.site('Reviewed reef', [[['Hard Coral'] * 10], [['Other Substrate'] * 10]])
        hidden = self.site('Map hidden', [])
        hidden.is_map_visible = False
        hidden.save(update_fields=['is_map_visible'])
        researcher = self.client.get(reverse('map_view'))
        feature = next(item for item in json.loads(researcher.context['geojson_data'])['features']
                       if item['properties']['id'] == site.pk)
        self.client.logout()
        public = self.client.get(reverse('public_dashboard'))
        self.assertEqual(public.status_code, 200)
        record = next(row for row in public.context['dashboard_surveys'] if row['id'] == site.pk)
        self.assertEqual(record['coverage'], feature['properties']['coverage'])
        self.assertEqual(record['classCode'], feature['properties']['coverageClass'])
        self.assertEqual(record['transectCount'], 2)
        self.assertEqual(record['createdAt'], feature['properties']['createdAt'])
        self.assertEqual(record['name'], site.name)
        self.assertFalse(next(row for row in public.context['dashboard_surveys'] if row['id'] == hidden.pk)['mapVisible'])
        self.assertNotContains(public, 'batch_images/chart.png')
        self.assertNotContains(public, 'window.alert')
        self.assertEqual([row['description'] for row in public.context['coverage_guide']],
                         list(COVERAGE_CLASS_DESCRIPTIONS.values()))
