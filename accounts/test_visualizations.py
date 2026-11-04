from datetime import date
import json

from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from .models import DataRepository, SurveyImage, Transect, User
from .visualization_data import composition_summary


class CompositionTests(SimpleTestCase):
    def test_nc_is_included_in_denominator_and_unused_legacy_classes_are_absent(self):
        summary = composition_summary(['Hard Coral'] * 2 + ['Soft Coral'] + ['Non-Coral'] * 7)
        self.assertEqual([item['label'] for item in summary], ['Hard Coral', 'Soft Coral', 'Non-Coral'])
        self.assertEqual([item['value'] for item in summary], [20, 10, 70])
        self.assertEqual(sum(item['count'] for item in summary), 10)

    def test_historical_labels_are_preserved_and_empty_composition_has_no_values(self):
        summary = composition_summary(['Hard Coral', 'Abiotic', 'Unclassified'])
        self.assertEqual({item['label']: item['count'] for item in summary if item['count']},
                         {'Hard Coral': 1, 'Abiotic': 1, 'Unclassified': 1})
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

    def test_all_dashboards_include_nc_and_site_hcc_keeps_transect_weighting(self):
        site = self.site('Unequal transects', [[['Hard Coral'] * 10, ['Hard Coral'] * 10], [['Non-Coral'] * 10]])
        response = self.client.get(reverse('researcher_dashboard'))
        self.assertEqual(response.context['avg_coverage'], 50)
        chart = response.context['benthic_chart']
        self.assertEqual(chart['labels'], ['Hard Coral', 'Soft Coral', 'Non-Coral'])
        self.assertEqual(chart['values'], [20, 0, 10])
        response = self.client.get(reverse('public_dashboard'))
        survey = response.context['dashboard_surveys'][0]
        self.assertEqual(survey['coverage'], 50)
        self.assertEqual(survey['classDistribution']['Non-Coral']['count'], 10)
        response = self.client.get(reverse('analysis_results'))
        self.assertEqual(response.context['rows'][0]['benthic']['Non-Coral'], 33.3)
        self.assertEqual(response.context['monthly_stats'][0]['avg_coverage'], 50)
        self.assertNotContains(response, 'analysisCoralClassChart')
        response = self.client.get(reverse('map_view'))
        feature = json.loads(response.context['geojson_data'])['features'][0]
        self.assertEqual(feature['properties']['classBreakdown']['Non-Coral'], 33.3)
        self.assertEqual(feature['properties']['coverage'], 50)
        response = self.client.get(reverse('batch_detail', args=[site.pk]))
        self.assertEqual(response.context['avg_coverage'], 50)
        self.assertNotContains(response, 'id="coralCoveragePercentValue"')

    def test_category_filters_apply_to_composition_categories_and_monthly_summary(self):
        self.site('Category A', [[['Hard Coral'] * 6 + ['Non-Coral'] * 4]])
        self.site('Category C', [[['Hard Coral'] * 3 + ['Soft Coral'] * 2 + ['Non-Coral'] * 5]])
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
