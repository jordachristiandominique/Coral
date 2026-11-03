from copy import deepcopy
from datetime import date
from io import BytesIO
import json
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from PIL import Image

from .models import DataRepository, SurveyImage, Transect, User
from .survey_validation import validate_quadrat_payload


def accepted_review():
    return {'version': 1, 'model': {'id': 'yolov8s-v4-3x', 'sha256': 'a' * 64, 'dataset_version': 4},
            'square_lock': False, 'boxes': [{'id': 'manual-1', 'class_name': 'Hard Coral',
                'box': {'x': .2, 'y': .2, 'w': .3, 'h': .3}, 'source': 'manual'}]}


def reviewed_payload():
    return {'rect': {'x': .1, 'y': .1, 'w': .8, 'h': .8},
            'points': [{'x': (i % 5 + .5) / 5, 'y': .3 if i < 5 else .7} for i in range(10)],
            'point_classes': ['Hard Coral'] * 5 + ['Soft Coral'] * 5,
            'review': {'version': 1, 'confirmed': True}}


class ReviewPayloadTests(SimpleTestCase):
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

    def test_unreviewed_upload_is_rejected_before_any_rows_or_files_are_saved(self):
        payload = reviewed_payload()
        payload['review']['confirmed'] = False
        self.assertEqual(self.submit(payload).status_code, 302)
        for model in (DataRepository, Transect, SurveyImage):
            self.assertFalse(model.objects.exists())

    def test_upload_page_exposes_endpoint_and_explicit_review_controls(self):
        response = self.client.get(reverse('upload_batch'))
        self.assertContains(response, 'data-analyze-url="' + reverse('analyze_survey_image') + '"')
        self.assertContains(response, 'id="confirm-image-review"')
        self.assertContains(response, 'id="retry-analysis-btn"')
        self.assertContains(response, 'js/upload_batch_analysis.js')
