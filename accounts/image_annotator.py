"""Render survey photos with the quadrat box and CPCE-style point markers
burned into the image itself.

Markers match the browser-side rendering used on the upload page: a cross (+)
at the exact sample location with its point number beside it, both drawn with a
dark halo so they stay readable over pale sand, dark coral or bright algae.

Rendering happens on demand so the output always reflects the current
``quadrat_points`` — including any corrections an expert makes later.
"""

import io

from PIL import Image, ImageDraw, ImageFont

QUADRAT_COLOR = (255, 138, 61)   # #ff8a3d, matches the on-screen overlay
MARKER_COLOR = (255, 255, 255)
HALO_COLOR = (0, 0, 0)

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
        return float(value)
    except (TypeError, ValueError):
        return default


def render_annotated_image(batch_image, max_width=None, annotate=True):
    """Return a PIL Image of ``batch_image`` with quadrat + points drawn on.

    ``max_width`` downscales the photo *before* the markers are drawn, so
    thumbnails stay cheap to produce and their markers stay crisp rather than
    being shrunk along with the pixels. If the image has no quadrat data (or
    ``annotate`` is False) the plain photo is returned.
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

        draw.text(
            (px + arm + 3, py - arm - 3),
            str(index),
            font=font,
            fill=MARKER_COLOR,
            stroke_width=text_stroke,
            stroke_fill=HALO_COLOR,
        )

    return image


def render_annotated_bytes(batch_image, max_width=None, annotate=True, quality=88):
    """Return annotated JPEG bytes ready to serve or embed in a report."""
    image = render_annotated_image(batch_image, max_width=max_width, annotate=annotate)
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG', quality=quality)
    return buffer.getvalue()
