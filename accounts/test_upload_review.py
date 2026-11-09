from copy import deepcopy
from datetime import date
from io import BytesIO
import json
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from PIL import Image
from openpyxl import load_workbook

from .models import DataRepository, SurveyImage, Transect, User
from .survey_validation import validate_quadrat_payload
from .representative_points import representative_counts
from .excel_export import build_batch_coverage_workbook


def accepted_review():
    return {'version': 1, 'model': {'id': 'yolov8s-v4-3x', 'sha256': 'a' * 64, 'dataset_version': 4},
            'square_lock': False, 'boxes': [{'id': 'manual-1', 'class_name': 'Hard Coral',
                'box': {'x': .2, 'y': .2, 'w': .3, 'h': .3}, 'source': 'manual'}]}


def reviewed_payload():
    return {'rect': {'x': .1, 'y': .1, 'w': .8, 'h': .8},
            'points': [{'x': (i % 5 + .5) / 5, 'y': .3 if i < 5 else .7} for i in range(10)],
            'point_classes': ['Hard Coral'] * 5 + ['Soft Coral'] * 5,
            'review': {'version': 1, 'confirmed': True}}


def representative_payload():
    analysis = accepted_review()
    analysis['method'] = 'box_representative_v1'
    analysis['boxes'] = [
        {'id': 'hc', 'class_name': 'Hard Coral', 'source': 'ai', 'box': {'x': 0, 'y': 0, 'w': .5, 'h': 1}},
        {'id': 'sc', 'class_name': 'Soft Coral', 'source': 'manual', 'box': {'x': .5, 'y': 0, 'w': .25, 'h': 1}},
    ]
    return {'rect': {'x': 0, 'y': 0, 'w': 1, 'h': 1},
            'points': ([{'x': .25, 'y': (i + 1) / 6} for i in range(5)]
                       + [{'x': .625, 'y': (i + 1) / 4} for i in range(3)]
                       + [{'x': .875, 'y': (i + 1) / 3} for i in range(2)]),
            'point_classes': ['Hard Coral'] * 5 + ['Soft Coral'] * 3 + ['Other Substrate'] * 2,
            'review': {'version': 2, 'confirmed': True}, 'analysis': analysis}


class ReviewPayloadTests(SimpleTestCase):
    def test_submit_mode_requires_complete_consistent_representatives(self):
        payload = representative_payload()
        payload['review'] = {'version': 3, 'mode': 'on_submit'}
        self.assertEqual(validate_quadrat_payload(deepcopy(payload)), payload)
        for mutate in (lambda p: p['review'].update(mode='unknown'),
                       lambda p: p['points'].pop(),
                       lambda p: p.pop('analysis'),
                       lambda p: p['point_classes'].__setitem__(0, 'Soft Coral')):
            invalid = deepcopy(payload)
            mutate(invalid)
            with self.assertRaises(ValueError):
                validate_quadrat_payload(invalid)

    def test_older_representative_remainder_labels_are_normalized_to_other_substrate(self):
        for alias in ('Non-Coral', 'NC', 'Unclassified'):
            payload = representative_payload()
            payload['point_classes'] = [alias if name == 'Other Substrate' else name
                                        for name in payload['point_classes']]
            saved = validate_quadrat_payload(payload)
            self.assertEqual(saved['point_classes'].count('Other Substrate'), 2)
            self.assertNotIn(alias, saved['point_classes'])

    def test_representative_counts_round_like_demo_and_deduplicate_overlapping_boxes(self):
        quadrat = {'x': .1, 'y': .1, 'w': .8, 'h': .8}
        for percent, expected in ((0, 0), (30, 3), (53, 5), (54, 5), (55, 6), (100, 10)):
            boxes = [{'class_name': 'Hard Coral', 'box': {**quadrat, 'w': quadrat['w'] * percent / 100}}] if percent else []
            counts = representative_counts(quadrat, boxes * 2)
            self.assertEqual(counts['Hard Coral'], expected)
            self.assertEqual(sum(counts.values()), 10)
        counts = representative_counts(quadrat, [
            {'class_name': 'Hard Coral', 'box': {**quadrat, 'w': .4}},
            {'class_name': 'Soft Coral', 'box': quadrat}])
        self.assertEqual(counts, {'Hard Coral': 5, 'Soft Coral': 5, 'Other Substrate': 0})

    def test_representative_payload_requires_matching_boxes_counts_positions_and_method(self):
        payload = representative_payload()
        self.assertEqual(validate_quadrat_payload(deepcopy(payload)), payload)
        for mutate in (lambda p: p['analysis'].pop('method'),
                       lambda p: p['point_classes'].__setitem__(0, 'Soft Coral'),
                       lambda p: p['points'][0].update(x=.9),
                       lambda p: p['analysis']['boxes'][0]['box'].update(w=.1),
                       lambda p: p.update(review={'version': 1, 'confirmed': True})):
            invalid = deepcopy(payload)
            mutate(invalid)
            with self.assertRaises(ValueError):
                validate_quadrat_payload(invalid)

    def test_accepted_boxes_and_model_reference_are_retained_without_extra_fields(self):
        payload = reviewed_payload()
        payload['analysis'] = accepted_review()
        payload['analysis']['boxes'][0]['confidence'] = .99
        payload['analysis']['model']['private_path'] = 'not persisted'
        saved = validate_quadrat_payload(payload)['analysis']
        self.assertEqual(saved['boxes'][0]['class_name'], 'Hard Coral')
        self.assertNotIn('confidence', saved['boxes'][0])
        self.assertNotIn('private_path', saved['model'])

    def test_invalid_model_reference_or_accepted_box_is_rejected(self):
        cases = []
        for mutate in [lambda a: a['model'].update(sha256='invalid'),
                       lambda a: a['boxes'][0]['box'].update(w=2),
                       lambda a: a['boxes'][0].update(class_name='quadrat_area'),
                       lambda a: a['boxes'].append(deepcopy(a['boxes'][0]))]:
            payload = reviewed_payload()
            payload['analysis'] = accepted_review()
            mutate(payload['analysis'])
            cases.append(payload)
        for payload in cases:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                validate_quadrat_payload(payload)

    def test_confirmed_ten_point_payload_and_legacy_manual_payload_are_accepted(self):
        payload = reviewed_payload()
        self.assertEqual(validate_quadrat_payload(payload), payload)
        legacy = deepcopy(payload)
        legacy.pop('review')
        legacy['points'] = legacy['points'][:2]
        legacy['point_classes'] = legacy['point_classes'][:2]
        self.assertEqual(validate_quadrat_payload(legacy), legacy)

    def test_invalid_shapes_geometry_classes_and_approval_are_rejected(self):
        cases = [None, [], 'bad', {'rect': None}]
        for key, value in [('rect', {'x': float('nan'), 'y': 0, 'w': 1, 'h': 1}),
                           ('rect', {'x': .9, 'y': 0, 'w': .5, 'h': 1}),
                           ('points', [{'x': 2, 'y': .5}] * 10),
                           ('points', [{'x': True, 'y': .5}] * 10),
                           ('point_classes', ['Unclassified'] * 10),
                           ('point_classes', ['Other Substrate'] * 10),
                           ('review', {'version': 1, 'confirmed': False})]:
            payload = reviewed_payload()
            payload[key] = value
            cases.append(payload)
        short = reviewed_payload()
        short['points'] = short['points'][:2]
        short['point_classes'] = short['point_classes'][:2]
        cases.append(short)
        for payload in cases:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                validate_quadrat_payload(payload)


class ReviewedUploadTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='review-uploader', role='researcher')
        self.client.force_login(self.user)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.directory.name)
        self.override.enable()
        self.addCleanup(self.override.disable)

    def submit(self, payload):
        content = BytesIO()
        Image.new('RGB', (32, 24)).save(content, format='PNG')
        return self.client.post(reverse('upload_batch'), {
            'batch_name': 'Reviewed AI survey', 'survey_date': date.today().isoformat(),
            'surveyor_names': 'Reviewer', 'area_name': 'Test reef', 'latitude': '7', 'longitude': '125',
            'images': SimpleUploadedFile('review.png', content.getvalue(), content_type='image/png'),
            'image_quadrat_1': json.dumps(payload),
        })

    def test_confirmed_upload_saves_points_and_canonical_hcc(self):
        payload = reviewed_payload()
        payload['analysis'] = accepted_review()
        self.assertEqual(self.submit(payload).status_code, 302)
        image = SurveyImage.objects.get()
        self.assertEqual(image.point_classes, payload['point_classes'])
        self.assertEqual(image.quadrat_points, payload['points'])
        self.assertEqual(image.coverage_percent, 50)
        self.assertEqual(image.coverage_category, 'A')
        self.assertEqual(image.analysis_review, payload['analysis'])
        self.assertEqual(Transect.objects.get().coverage_percent, 50)

    def test_representative_upload_saves_method_counts_and_canonical_hcc(self):
        payload = representative_payload()
        payload['review'] = {'version': 3, 'mode': 'on_submit'}
        self.assertEqual(self.submit(payload).status_code, 302)
        image = SurveyImage.objects.get()
        self.assertEqual(image.point_classes, payload['point_classes'])
        self.assertEqual(image.quadrat_points, payload['points'])
        self.assertEqual(image.analysis_review['method'], 'box_representative_v1')
        self.assertEqual(image.coverage_percent, 50)
        self.assertEqual(image.coverage_category, 'A')
        # Earlier saved labels must export into the current remainder row.
        legacy_classes = ['NC' if name == 'Other Substrate' else name for name in image.point_classes]
        SurveyImage.objects.filter(pk=image.pk).update(point_classes=legacy_classes)
        workbook = load_workbook(build_batch_coverage_workbook(image.batch), data_only=True)
        rows = {row[0].value: row for row in workbook.active.iter_rows()}
        self.assertEqual(rows['OTHER SUBSTRATE (OS)'][1].value, 20)
        self.assertEqual(rows['Sum (excluding tape+shadow+wand)'][1].value, 100)
        self.assertEqual(Transect.objects.get().coverage_percent, 50)

    def test_unreviewed_upload_is_rejected_before_any_rows_or_files_are_saved(self):
        payload = reviewed_payload()
        payload['review']['confirmed'] = False
        self.assertEqual(self.submit(payload).status_code, 302)
        for model in (DataRepository, Transect, SurveyImage):
            self.assertFalse(model.objects.exists())

    def test_upload_page_exposes_endpoint_and_direct_image_review(self):
        response = self.client.get(reverse('upload_batch'))
        self.assertContains(response, 'data-analyze-url="' + reverse('analyze_survey_image') + '"')
        self.assertNotContains(response, 'id="confirm-image-review"')
        self.assertNotContains(response, 'id="confirm-quadrat"')
        self.assertNotContains(response, 'id="review-box-selection"')
        self.assertNotContains(response, 'id="selected-box-editor"')
        self.assertContains(response, 'id="retry-analysis-btn"')
        self.assertContains(response, 'js/upload_batch_analysis.js')
        self.assertContains(response, 'data-review-class="Hard Coral"')
        self.assertContains(response, 'data-review-class="Soft Coral"')
        self.assertContains(response, 'review-class-dot--hard')
        self.assertContains(response, 'review-class-dot--soft')
        self.assertContains(response, 'id="review-context-delete-label"')
        self.assertNotContains(response, 'Change to Hard Coral')
        self.assertNotContains(response, 'Change to Soft Coral')
        self.assertNotContains(response, 'Point Classifications')
        self.assertNotContains(response, 'point-class-select')
        self.assertContains(response, 'js/representative_points.js')
