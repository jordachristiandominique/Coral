# AGENTS.md — Guidance for AI Agents (CoralSense)

Django 5.2.6 monolith + vanilla JS. One local app: `accounts`. Full architecture map with file citations lives in `knowledge.md` — read it before larger changes; it is the source of truth for structure, URL patterns, models, and the upload request trace.

## Commands

```bash
python manage.py runserver            # dev server at http://localhost:8000
python manage.py check                # system check
python manage.py makemigrations --check   # fail if model changes lack migrations
python manage.py migrate              # apply migrations (SQLite: db.sqlite3)
python manage.py test                 # test suite (currently an empty stub in accounts/tests.py)
```

Dependencies: `pip install -r requirements.txt`. No pytest, lint, or bundler config exists.

## Project boundaries

- **Single app:** `accounts` (models, views, forms, signals, exports). Project config lives in `coral_app/`. Do not add new Django apps or a second settings module without an explicit request.
- **Templates:** project-level `templates/` for public pages (`base.html`, landing, public dashboard); app pages in `accounts/templates/accounts/`. Page-specific JS/CSS goes in `static/js/` / `static/css/`, named after the page.
- **No DRF, no Channels:** JSON endpoints are hand-rolled `JsonResponse` views called with `fetch()` from `static/js/`. Do not introduce DRF, serializers, websockets, or a JS framework unless asked.
- **Auth pattern:** every view uses `@login_required(login_url='login')` plus manual role guards (`is_pending()` / `is_admin()` / `is_superadmin()`). Follow the same pattern; role redirects are pending → `pending_approval`, superadmin → `admin:index`, others → `researcher_dashboard`.
- **Settings:** `coral_app/settings.py` is committed with `DEBUG=True` and a dev `SECRET_KEY` and does not read `.env`. Don't "fix" this silently; it's a known, deliberate-for-dev state (see `knowledge.md` §8).

## Domain invariants (do not break)

- **HCC math** in `accounts/models.py` is the single source of truth: `classify_hcc` (Licuanan 2020 categories A >44, B >33–44, C >22–33, D 0–22), `compute_coverage` (hard coral points / total × 100; soft coral excluded from the numerator), `compute_site_hcc` (site = mean of transect means, SE across transects). Views must reuse these functions — never inline divergent formulas. Category strings and `COVERAGE_CLASS_LABELS/RANGES/DESCRIPTIONS` wording must stay identical everywhere they are shown.
- **Benthic class names** must match `CPCE_CODES` exactly (`Hard Coral`, `Soft Coral`, `Macroalgae`, `Halimeda`, `Algae Assemblage`, `Abiotic`, `Other Biota`); templates and JS rely on the full names.
- **Data model:** `ImageBatch` (site) → `Transect` (replicate) → `BatchImage` (photo, JSON `point_classes`). Transects are created one per upload submit with `number = Max('number') + 1`; all transects share the site's single lat/lng. `BatchImage.coverage_percent/coverage_class` and `Transect.coverage_percent/coverage_class` are cached denormalizations — recompute them whenever `point_classes` changes.
- **Upload flow:** the multipart form serializes per-image quadrat JSON into hidden inputs `image_quadrat_1..n` (`static/js/upload_batch.js`); `accounts/views.py::upload_batch` validates and writes rows inside `transaction.atomic()`. Changes on one side must be mirrored on the other.

## Conventions & gotchas

- Server-rendered messages (`django.contrib.messages`) are displayed as toasts by `static/js/custom.js` via the payload in `templates/base.html` — prefer `messages.*` over new client-side toast mechanisms.
- Notifications are created server-side (signal on pending registration, on approval); the navbar bell reads them via the `notifications` context processor; mark-read is the POST endpoint `notifications_mark_read`.
- Coverage stats are recomputed in Python from `point_classes` per request (known N+1 hot-spot — `knowledge.md` §5). Don't add new per-image Python loops for aggregates without noting the cost.
- Migrations include data migrations (`0010`, `0012`); new model changes need `makemigrations` and must keep `makemigrations --check` clean.
- Python: standard library + pinned deps only; `reportlab`, `openpyxl`, `Pillow` are already in use for exports/annotation — reuse them.

## Verification checklist

Before finishing a change, run and report:

1. `python manage.py check`
2. `python manage.py makemigrations --check`
3. `python manage.py test` (note: currently no real tests exist; report that honestly rather than treating an empty pass as coverage)
