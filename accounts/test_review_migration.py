from datetime import date

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class ReviewMigrationTests(TransactionTestCase):
    def test_existing_image_geometry_classes_and_hcc_survive_new_review_field(self):
        old_target = [('accounts', '0016_repository_image_category_names')]
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(old_target)
            apps = executor.loader.project_state(old_target).apps
            user = apps.get_model('accounts', 'User').objects.create(username='review-migration-user')
            batch = apps.get_model('accounts', 'DataRepository').objects.create(
                user_id=user.pk, name='Preserved', survey_date=date(2026, 11, 3),
                area_name='Reef', latitude='7', longitude='125')
            image = apps.get_model('accounts', 'SurveyImage').objects.create(
                batch_id=batch.pk, image='batch_images/preserved.png',
                quadrat_rect={'x': .1, 'y': .1, 'w': .8, 'h': .8},
                quadrat_points=[{'x': .5, 'y': .5}], point_classes=['Hard Coral'],
                coverage_percent=100, coverage_category='A')
            executor = MigrationExecutor(connection)
            target = executor.loader.graph.leaf_nodes()
            executor.migrate(target)
            saved = executor.loader.project_state(target).apps.get_model('accounts', 'SurveyImage').objects.get(pk=image.pk)
            self.assertEqual(saved.analysis_review, {})
            self.assertEqual(saved.point_classes, ['Hard Coral'])
            self.assertEqual(saved.quadrat_points, [{'x': .5, 'y': .5}])
            self.assertEqual(saved.coverage_percent, 100)
            self.assertEqual(saved.coverage_category, 'A')
        finally:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
