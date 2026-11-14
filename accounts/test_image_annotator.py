import tempfile
from pathlib import Path
from types import SimpleNamespace

from django.test import SimpleTestCase
from PIL import Image

from .image_annotator import CORAL_COLORS, render_annotated_image


class SavedCoralBoxAnnotationTests(SimpleTestCase):
    def setUp(self):
        directory = self.enterContext(tempfile.TemporaryDirectory())
        self.path = Path(directory) / 'photo.png'
        Image.new('RGB', (200, 200), (10, 20, 30)).save(self.path)
        self.photo = SimpleNamespace(
            image=SimpleNamespace(open=lambda mode: self.path.open(mode)),
            quadrat_rect={'x': .1, 'y': .1, 'w': .8, 'h': .8},
            quadrat_points=[], point_classes=[],
            analysis_review={'boxes': [
                {'class_name': 'Hard Coral', 'box': {'x': 0, 'y': .2, 'w': .3, 'h': .4}},
                {'class_name': 'Soft Coral', 'box': {'x': .6, 'y': .6, 'w': .3, 'h': .3}},
            ]},
        )

    def test_saved_hard_and_soft_boxes_are_colored_and_clipped_to_quadrat(self):
        image = render_annotated_image(self.photo, show_coral_boxes=True)
        self.assertEqual(image.getpixel((20, 100)), CORAL_COLORS['Hard Coral'])
        self.assertEqual(image.getpixel((10, 100)), (10, 20, 30))
        self.assertEqual(image.getpixel((150, 180)), CORAL_COLORS['Soft Coral'])
        self.assertEqual(image.getpixel((150, 185)), (10, 20, 30))

    def test_plain_variant_omits_all_overlays_and_thumbnails_scale_boxes(self):
        plain = render_annotated_image(self.photo, annotate=False, show_coral_boxes=True)
        self.assertEqual(plain.getpixel((20, 100)), (10, 20, 30))
        thumbnail = render_annotated_image(self.photo, max_width=100, show_coral_boxes=True)
        self.assertEqual(thumbnail.size, (100, 100))
        self.assertEqual(thumbnail.getpixel((10, 50)), CORAL_COLORS['Hard Coral'])

    def test_legacy_and_malformed_review_data_render_without_coral_boxes(self):
        for review in ({}, None, {'boxes': None}, {'boxes': [None, {'class_name': 'Other Substrate'}]}):
            with self.subTest(review=review):
                self.photo.analysis_review = review
                image = render_annotated_image(self.photo, show_coral_boxes=True)
                self.assertEqual(image.getpixel((40, 100)), (10, 20, 30))
