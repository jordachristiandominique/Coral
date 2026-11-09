import hashlib
from contextlib import nullcontext
from io import BytesIO
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from PIL import Image

from . import yolo_inference as inference
from .models import DataRepository, SurveyImage, Transect, User


def photo(*, size=(24, 16), image_format='PNG', exif=None):
    content = BytesIO()
    Image.new('RGB', size, 'blue').save(content, format=image_format, **({'exif': exif} if exif else {}))
    return SimpleUploadedFile('photo.dat', content.getvalue(), content_type='application/octet-stream')


def detection(cid=0, confidence=.7, coordinates=(.1, .2, .6, .8)):
    return SimpleNamespace(
        cls=SimpleNamespace(item=lambda: cid), conf=SimpleNamespace(item=lambda: confidence),
        xyxyn=[SimpleNamespace(tolist=lambda: list(coordinates))],
    )


class ImageValidationTests(SimpleTestCase):
    def test_content_is_decoded_instead_of_trusting_filename_or_mime(self):
        with inference.read_image(photo()) as image:
            self.assertEqual(image.size, (24, 16))
            self.assertEqual(image.mode, 'RGB')

    def test_exif_orientation_is_applied_before_coordinates_are_defined(self):
        exif = Image.Exif()
        exif[274] = 6
        with inference.read_image(photo(image_format='JPEG', exif=exif)) as image:
            self.assertEqual(image.size, (16, 24))

    def test_corrupt_unsupported_and_animated_images_are_rejected(self):
        invalid_files = [SimpleUploadedFile('fake.jpg', b'not an image'),
                         photo(image_format='BMP')]
        animated = BytesIO()
        Image.new('RGB', (8, 8), 'red').save(
            animated, format='PNG', save_all=True, append_images=[Image.new('RGB', (8, 8), 'blue')])
        invalid_files.append(SimpleUploadedFile('animated.png', animated.getvalue()))
        valid = photo().read()
        invalid_files.append(SimpleUploadedFile('truncated.png', valid[:len(valid)//2]))
        for upload in invalid_files:
            with self.subTest(name=upload.name), self.assertRaises(inference.InvalidImage):
                inference.read_image(upload)

    def test_byte_and_pixel_limits_are_enforced(self):
        for limits in [{'YOLO_MAX_UPLOAD_BYTES': 1}, {'YOLO_MAX_IMAGE_PIXELS': 10}]:
            with self.subTest(limits=limits), override_settings(**limits):
                with self.assertRaises(inference.InvalidImage) as raised:
                    inference.read_image(photo())
                self.assertTrue(raised.exception.too_large)


class InferenceRuntimeTests(SimpleTestCase):
    def setUp(self):
        self.image = Image.new('RGB', (24, 16))
        self.addCleanup(self.image.close)
        self.cache_patch = patch.object(inference, '_cached_runtime', None)
        self.cache_patch.start()
        self.addCleanup(self.cache_patch.stop)

    def runtime(self, boxes):
        model = Mock()
        model.predict.return_value = [SimpleNamespace(boxes=boxes)]
        return inference.Runtime(Path(settings.YOLO_ARTIFACT_DIR).resolve(), model,
                                 {'id': 'test-artifact', 'class_names': inference.CLASS_NAMES})

    def test_model_is_loaded_once_and_boxes_keep_full_image_coordinates(self):
        runtime = self.runtime([detection(), detection(2, .9)])
        with patch.object(inference, '_load_runtime', return_value=runtime) as load:
            result = inference.analyze_image(self.image)
            inference.analyze_image(self.image)
        load.assert_called_once()
        self.assertEqual(runtime.model.predict.call_count, 2)
        self.assertEqual(result['quadrat']['class_name'], 'quadrat_area')
        self.assertEqual(result['detections'][0]['box']['x'], .1)
        self.assertAlmostEqual(result['detections'][0]['box']['h'], .6)
        self.assertTrue(result['review_required'])
        self.assertNotIn('point_classes', result)
        self.assertNotIn('coverage_percent', result)

    def test_zero_detections_and_multiple_quadrats_require_manual_review(self):
        for boxes, warning in [([], 'missing_quadrat'),
                               ([detection(2, .6), detection(2, .9)], 'multiple_quadrats')]:
            with self.subTest(warning=warning), patch.object(inference, '_cached_runtime', self.runtime(boxes)):
                result = inference.analyze_image(self.image)
                self.assertEqual(result['warnings'][0]['code'], warning)
                if not boxes:
                    self.assertIsNone(result['quadrat'])
                else:
                    self.assertEqual(result['quadrat']['confidence'], .9)

    def test_busy_process_rejects_overlapping_inference(self):
        self.assertTrue(inference._inference_lock.acquire(blocking=False))
        try:
            with self.assertRaises(inference.InferenceBusy):
                inference.analyze_image(self.image)
        finally:
            inference._inference_lock.release()

    def test_prediction_failure_releases_lock_for_retry(self):
        runtime = self.runtime([])
        runtime.model.predict.side_effect = [RuntimeError('prediction failed'), SimpleNamespace()]
        with patch.object(inference, '_cached_runtime', runtime):
            with self.assertRaises(RuntimeError):
                inference.analyze_image(self.image)
            runtime.model.predict.side_effect = None
            runtime.model.predict.return_value = [SimpleNamespace(boxes=[])]
            self.assertTrue(inference.analyze_image(self.image)['success'])

    def test_changed_artifact_directory_loads_a_new_runtime(self):
        old = self.runtime([])
        new_directory = old.directory / 'replacement'
        replacement = inference.Runtime(new_directory, old.model, {'id': 'replacement'})
        with patch.object(inference, '_cached_runtime', old), override_settings(YOLO_ARTIFACT_DIR=new_directory):
            with patch.object(inference, '_load_runtime', return_value=replacement) as load:
                self.assertEqual(inference.analyze_image(self.image)['model']['id'], 'replacement')
                load.assert_called_once_with(new_directory)

    def test_artifact_checksum_and_class_mismatch_fail_before_use(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary).resolve()
            (directory / 'weights.pt').write_bytes(b'test weights only')
            metadata = {'class_names': inference.CLASS_NAMES, 'model': 'yolov8s', 'version': 4}
            (directory / 'metadata.json').write_text(json.dumps(metadata))
            artifact = {'id': 'test', 'checkpoint': 'weights.pt', 'metadata': 'metadata.json',
                        'sha256': 'incorrect', 'augmentation_multiplier': 3}
            (directory / 'artifact.json').write_text(json.dumps(artifact))
            with self.assertRaises(inference.ModelUnavailable):
                inference._load_runtime(directory)
            artifact['sha256'] = hashlib.sha256(b'test weights only').hexdigest()
            (directory / 'artifact.json').write_text(json.dumps(artifact))
            fake_yolo = Mock(return_value=SimpleNamespace(names={0: 'Wrong class'}))
            with patch.dict('sys.modules', {'ultralytics': SimpleNamespace(YOLO=fake_yolo)}):
                with self.assertRaises(inference.ModelUnavailable):
                    inference._load_runtime(directory)

    def test_faster_rcnn_normalizes_classes_coordinates_and_filters_background(self):
        def tensor(value):
            return SimpleNamespace(item=lambda: value)

        model = Mock(return_value=[{
            'boxes': [SimpleNamespace(tolist=lambda: [-2., 4., 12., 12.])] * 5,
            'scores': [tensor(value) for value in [.8, .7, .9, .99, .1]],
            'labels': [tensor(value) for value in [1, 2, 3, 0, 1]],
        }])
        runtime = inference.Runtime(Path(settings.YOLO_ARTIFACT_DIR).resolve(), model,
                                    {'id': 'faster-test', 'architecture': 'faster_rcnn'})
        modules = {'torch': SimpleNamespace(inference_mode=nullcontext),
                   'torchvision.transforms.functional': SimpleNamespace(to_tensor=lambda image: image)}
        with patch.dict('sys.modules', modules), patch.object(inference, '_cached_runtime', runtime):
            result = inference.analyze_image(self.image)
        self.assertEqual([box['class_id'] for box in result['detections']], [0, 1, 2])
        self.assertEqual(result['quadrat']['class_name'], 'quadrat_area')
        self.assertEqual(result['detections'][0]['box'], {'x': 0., 'y': .25, 'w': .5, 'h': .5})
        self.assertEqual(result['parameters']['min_size'], 800)
        self.assertNotIn('imgsz', result['parameters'])

    def test_faster_rcnn_loader_validates_sidecar_hash_before_deserialization(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary).resolve()
            (directory / 'weights.pt').write_bytes(b'trusted fixture')
            digest = hashlib.sha256(b'trusted fixture').hexdigest()
            metadata = {'class_names': inference.CLASS_NAMES, 'model': 'faster_rcnn',
                        'version': 3, 'checkpoint_sha256': digest}
            artifact = {'id': 'faster-test', 'checkpoint': 'weights.pt', 'metadata': 'metadata.json',
                        'sha256': digest, 'dataset_version': 3, 'augmentation_multiplier': None}
            (directory / 'artifact.json').write_text(json.dumps(artifact))
            (directory / 'metadata.json').write_text(json.dumps(metadata))
            with patch.object(inference, '_load_faster_rcnn') as load:
                runtime = inference._load_runtime(directory)
                self.assertEqual(runtime.provenance['architecture'], 'faster_rcnn')
                load.assert_called_once_with(directory / 'weights.pt', metadata)
                load.reset_mock()
                metadata['checkpoint_sha256'] = 'wrong hash'
                (directory / 'metadata.json').write_text(json.dumps(metadata))
                with self.assertRaises(inference.ModelUnavailable):
                    inference._load_runtime(directory)
                load.assert_not_called()

    def test_faster_rcnn_reconstructs_saved_head_and_rejects_metadata_mismatch(self):
        metadata = {'model': 'faster_rcnn', 'architecture': 'fasterrcnn_resnet50_fpn',
                    'class_names': inference.CLASS_NAMES, 'num_classes': 4,
                    'checkpoint_epoch': 10, 'background_label': 0, 'label_offset': 1}
        saved = {'metadata': {'model': 'faster_rcnn', 'class_names': inference.CLASS_NAMES},
                 'class_names': inference.CLASS_NAMES, 'num_classes': 4,
                 'epoch': 10, 'model_state_dict': {'trusted': 'weights'}}
        model = Mock()
        model.roi_heads.box_predictor.cls_score.in_features = 1024
        constructor = Mock(return_value=model)
        predictor = Mock()
        load = Mock(return_value=saved)
        modules = {
            'torch': SimpleNamespace(load=load),
            'torchvision.models.detection': SimpleNamespace(fasterrcnn_resnet50_fpn=constructor),
            'torchvision.models.detection.faster_rcnn': SimpleNamespace(FastRCNNPredictor=predictor),
        }
        with patch.dict('sys.modules', modules):
            inference._load_faster_rcnn(Path('trusted.pt'), metadata)
            load.assert_called_once_with(Path('trusted.pt'), map_location='cpu', weights_only=False)
            constructor.assert_called_once_with(weights=None, weights_backbone=None, min_size=800,
                                                max_size=1333, box_score_thresh=.25,
                                                box_detections_per_img=100)
            predictor.assert_called_once_with(1024, 4)
            model.load_state_dict.assert_called_once_with(saved['model_state_dict'], strict=True)
            model.eval.assert_called_once()
            constructor.reset_mock()
            for field, value in [('class_names', []), ('checkpoint_epoch', 11), ('label_offset', 0)]:
                with self.subTest(field=field), self.assertRaises(ValueError):
                    inference._load_faster_rcnn(Path('trusted.pt'), {**metadata, field: value})
            constructor.assert_not_called()


class InferenceEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.researcher = User.objects.create_user(username='ai-researcher', role='researcher')
        cls.admin = User.objects.create_user(username='ai-admin', role='admin')
        cls.pending = User.objects.create_user(username='ai-pending', role='pending')
        cls.superadmin = User.objects.create_user(username='ai-superadmin', role='superadmin')

    def setUp(self):
        self.url = reverse('analyze_survey_image')
        self.client.force_login(self.researcher)

    def test_authentication_roles_and_post_only_are_enforced(self):
        self.client.logout()
        self.assertRedirects(self.client.post(self.url), reverse('login') + '?next=' + self.url,
                             fetch_redirect_response=False)
        for user, target in [(self.pending, 'pending_approval'), (self.superadmin, 'admin:index')]:
            self.client.force_login(user)
            self.assertRedirects(self.client.post(self.url), reverse(target), fetch_redirect_response=False)
        self.client.force_login(self.researcher)
        self.assertEqual(self.client.get(self.url).status_code, 405)

    def test_post_requires_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.researcher)
        self.assertEqual(client.post(self.url, {'image': photo()}).status_code, 403)
        client.get(reverse('upload_batch'))
        token = client.cookies['csrftoken'].value
        with patch.object(inference, 'analyze_image', return_value={'success': True}):
            response = client.post(self.url, {'image': photo()}, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)

    def test_researcher_and_admin_can_analyze_without_saving_surveys(self):
        for user in [self.researcher, self.admin]:
            self.client.force_login(user)
            with patch.object(inference, 'analyze_image', return_value={'success': True, 'quadrat': None}) as predict:
                response = self.client.post(self.url, {'image': photo()})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()['success'])
            predict.assert_called_once()
        for model in [DataRepository, Transect, SurveyImage]:
            self.assertEqual(model.objects.count(), 0)

    def test_missing_multiple_and_wrong_file_fields_are_rejected(self):
        for payload in [{}, {'images': photo()}, {'image': [photo(), photo()]},
                        {'image': photo(), 'other': photo()}]:
            with self.subTest(keys=list(payload)), patch.object(inference, 'analyze_image') as predict:
                self.assertEqual(self.client.post(self.url, payload).status_code, 400)
                predict.assert_not_called()

    def test_invalid_content_and_oversize_files_never_reach_model(self):
        with patch.object(inference, 'analyze_image') as predict:
            response = self.client.post(self.url, {'image': SimpleUploadedFile('fake.jpg', b'fake')})
            self.assertEqual(response.status_code, 400)
            with override_settings(YOLO_MAX_UPLOAD_BYTES=1):
                self.assertEqual(self.client.post(self.url, {'image': photo()}).status_code, 413)
            predict.assert_not_called()

    def test_busy_missing_model_and_prediction_errors_are_actionable(self):
        cases = [(inference.InferenceBusy(), 503, 'inference_busy'),
                 (inference.ModelUnavailable('private/checkpoint/path'), 503, 'model_unavailable'),
                 (RuntimeError('private/checkpoint/path'), 500, 'inference_failed')]
        for error, status, code in cases:
            with self.subTest(code=code), patch.object(inference, 'analyze_image', side_effect=error):
                with patch('accounts.views.logger'):
                    response = self.client.post(self.url, {'image': photo()})
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json()['code'], code)
                self.assertNotIn('private/checkpoint/path', response.content.decode())
                if code == 'inference_busy':
                    self.assertEqual(response['Retry-After'], '1')
