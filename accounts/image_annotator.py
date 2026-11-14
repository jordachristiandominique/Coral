"""Render survey photos with the quadrat box and CPCE-style point markers
burned into the image itself.

Markers match the browser-side rendering used on the upload page: a cross (+)
at the exact sample location with its point number beside it, both drawn with a
dark halo so they stay readable over pale sand, dark coral or bright algae.

Rendering happens on demand so the output always reflects the current
``quadrat_points`` — including any corrections an expert makes later.
"""

import io
import math

from PIL import Image, ImageDraw, ImageFont

from .models import POINT_CLASS_CODES
from .representative_points import normalize_marker_class

QUADRAT_COLOR = (255, 138, 61)   # #ff8a3d, matches the on-screen overlay
MARKER_COLOR = (255, 255, 255)
HALO_COLOR = (0, 0, 0)
CORAL_COLORS = {'Hard Coral': (181, 106, 255), 'Soft Coral': (50, 224, 191)}

# Tried in order; falls back to Pillow's bundled bitmap font if none resolve.
_FONT_CANDIDATES = ('arialbd.ttf', 'arial.ttf', 'segoeuib.ttf',
                    'DejaVuSans-Bold.ttf', 'DejaVuSans.ttf')


def _load_font(size):
    for name in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _as_float(value, default=0.0):
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def render_annotated_image(batch_image, max_width=None, annotate=True,
                           label_mode='number', show_coral_boxes=False):
    """Return a PIL Image of ``batch_image`` with quadrat + points drawn on.

    ``max_width`` downscales the photo *before* the markers are drawn, so
    thumbnails stay cheap to produce and their markers stay crisp rather than
    being shrunk along with the pixels. If the image has no quadrat data (or
    ``annotate`` is False) the plain photo is returned.

    ``show_coral_boxes`` draws saved accepted HC/SC boxes, clipped to the quadrat.
    Historical images without box review data retain their quadrat and markers.

    ``label_mode`` chooses the text drawn beside each cross: ``'number'`` (the
    1-based point index, the default) or ``'code'`` (the benthic substrate code
    for that point, e.g. HC / MA / SC).
    """
    with batch_image.image.open('rb') as handle:
        raw = handle.read()
    image = Image.open(io.BytesIO(raw))

    if max_width:
        # JPEG fast path: decode straight to a reduced scale instead of
        # unpacking the full-resolution frame just to shrink it afterwards.
        try:
            image.draft('RGB', (max_width, max_width))
        except (AttributeError, ValueError):
            pass

    image = image.convert('RGB')

    if max_width and image.width > max_width:
        ratio = max_width / float(image.width)
        image = image.resize(
            (max_width, max(1, int(image.height * ratio))),
            Image.LANCZOS,
        )

    rect = batch_image.quadrat_rect or None
    points = batch_image.quadrat_points or []
    point_classes = batch_image.point_classes or []
    if not annotate or not rect:
        return image

    width, height = image.size
    draw = ImageDraw.Draw(image)

    # quadrat_rect is normalised against the whole image
    rx = _as_float(rect.get('x')) * width
    ry = _as_float(rect.get('y')) * height
    rw = _as_float(rect.get('w')) * width
    rh = _as_float(rect.get('h')) * height

    box_width = max(2, round(width / 400))
    draw.rectangle([rx, ry, rx + rw, ry + rh], outline=QUADRAT_COLOR, width=box_width)

    if show_coral_boxes:
        review = getattr(batch_image, 'analysis_review', None)
        boxes = review.get('boxes', []) if isinstance(review, dict) else []
        coral_draw = ImageDraw.Draw(image, 'RGBA')
        coral_font = _load_font(max(11, round(width / 90)))
        counts = dict.fromkeys(CORAL_COLORS, 0)
        for region in boxes if isinstance(boxes, list) else []:
            if not isinstance(region, dict) or region.get('class_name') not in CORAL_COLORS:
                continue
            class_name = region['class_name']
            counts[class_name] += 1
            box = region.get('box')
            if not isinstance(box, dict):
                continue
            left = max(rx, 0, _as_float(box.get('x')) * width)
            top = max(ry, 0, _as_float(box.get('y')) * height)
            right = min(rx + rw, width, (_as_float(box.get('x')) + _as_float(box.get('w'))) * width)
            bottom = min(ry + rh, height, (_as_float(box.get('y')) + _as_float(box.get('h'))) * height)
            if right <= left or bottom <= top:
                continue
            color = CORAL_COLORS[class_name]
            coral_draw.rectangle([round(left), round(top), round(right), round(bottom)], fill=(*color, 30),
                                 outline=(*color, 255), width=box_width)
            prefix = 'HC' if class_name == 'Hard Coral' else 'SC'
            label = f'{prefix} {counts[class_name]}'
            text_bounds = coral_draw.textbbox((0, 0), label, font=coral_font)
            label_width = text_bounds[2] - text_bounds[0] + 6
            label_height = text_bounds[3] - text_bounds[1] + 6
            if label_width <= rw and label_height <= rh:
                label_x = max(rx, min(left + 3, rx + rw - label_width))
                label_y = max(ry, min(top + 3, ry + rh - label_height))
                coral_draw.rectangle([label_x, label_y, label_x + label_width, label_y + label_height],
                                     fill=(13, 43, 51, 220))
                coral_draw.text((label_x + 3 - text_bounds[0], label_y + 3 - text_bounds[1]),
                                label, font=coral_font, fill=(*color, 255))

    # Marker geometry scales with the photo so it looks the same on any resolution
    arm = max(6, round(width / 90))
    line_width = max(2, round(width / 500))
    halo_width = line_width + max(2, round(width / 350))
    font = _load_font(max(14, round(width / 55)))
    text_stroke = max(1, round(width / 700))

    for index, point in enumerate(points, start=1):
        # point x/y are normalised *within* the quadrat rect
        px = rx + _as_float(point.get('x')) * rw
        py = ry + _as_float(point.get('y')) * rh

        horizontal = [(px - arm, py), (px + arm, py)]
        vertical = [(px, py - arm), (px, py + arm)]

        # Dark halo first, then the bright cross on top
        draw.line(horizontal, fill=HALO_COLOR, width=halo_width)
        draw.line(vertical, fill=HALO_COLOR, width=halo_width)
        draw.line(horizontal, fill=MARKER_COLOR, width=line_width)
        draw.line(vertical, fill=MARKER_COLOR, width=line_width)

        if label_mode == 'code':
            class_name = point_classes[index - 1] if index - 1 < len(point_classes) else None
            label = POINT_CLASS_CODES.get(normalize_marker_class(class_name), '--')
        else:
            label = str(index)

        draw.text(
            (px + arm + 3, py - arm - 3),
            label,
            font=font,
            fill=MARKER_COLOR,
            stroke_width=text_stroke,
            stroke_fill=HALO_COLOR,
        )

    return image


def render_annotated_bytes(batch_image, max_width=None, annotate=True, quality=88,
                           label_mode='number', show_coral_boxes=False):
    """Return annotated JPEG bytes ready to serve or embed in a report."""
    image = render_annotated_image(batch_image, max_width=max_width, annotate=annotate,
                                   label_mode=label_mode, show_coral_boxes=show_coral_boxes)
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=quality)
    return buffer.getvalue()
