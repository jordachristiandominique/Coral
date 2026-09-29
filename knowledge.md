# CoralSense — Codebase Knowledge

> Read-only architecture audit of the Django project in this repository. Every claim cites the file behind it. Last verified: 2026-09-29.

## 1. Overview

| Aspect | Value | Source |
|---|---|---|
| Framework | Django **5.2.6** (pinned) | `requirements.txt` |
| App type | Monolithic, server-rendered Django + vanilla JS (no bundler, no node) | `static/` tree, `templates/base.html` |
| Database | SQLite at `db.sqlite3` | `coral_app/settings.py` (`DATABASES`) |
| Auth | django-allauth 65.9.0, Google OAuth provider, email login, custom `User` with roles | `coral_app/settings.py` (`INSTALLED_APPS`, `AUTHENTICATION_BACKENDS`, `SOCIALACCOUNT_PROVIDERS`), `accounts/models.py` |
| Domain | Coral reef monitoring ("CoralSense", DNSC capstone): image-batch surveys → point-intercept benthic classification → Hard Coral Cover (HCC) stats on the Licuanan (2020) A–D scale | `accounts/models.py` (`CPCE_CODES`, `classify_hcc` docstrings), `templates/base.html` footer |
| Local apps | One: `accounts` | `coral_app/settings.py` |

## 2. Project structure

| Area | Location | Notes | Source |
|---|---|---|---|
| Settings | `coral_app/settings.py` | Plain settings; `SECRET_KEY` and `DEBUG=True` **hardcoded**; `os.environ.get` used only for Google OAuth client id/secret. Does **not** read `.env` despite `.env.example` existing. | `coral_app/settings.py`, `.env.example` |
| Root URLconf | `coral_app/urls.py` | `''` landing, `public-dashboard/`, `admin/`, `accounts/` include, `oauth/` (allauth); media served in DEBUG via `static()` | `coral_app/urls.py` |
| Project views | `coral_app/views.py` | `landing_page`, `public_dashboard` (public HCC dashboard) | `coral_app/views.py` |
| Single app | `accounts/` | models, views (1,803 lines), forms, signals, context processor, admin, plus helpers: `excel_export.py` (openpyxl), `report_generator.py` (reportlab), `image_annotator.py` (Pillow annotation rendering) | `accounts/` directory, `accounts/apps.py` (registers `signals` in `ready()`) |
| Templates — project | `templates/` (3 files) | `base.html` (nav/messages toasts/footer), `landing_page.html`, `public_dashboard.html` | `templates/` tree |
| Templates — app | `accounts/templates/accounts/` (22 files) | incl. `partials/coverage_class_key.html`, `partials/_profile_menu.html`, password-reset email templates | `accounts/templates/` tree |
| Static | `static/` | 15 CSS, 16 JS files, icons/images; page scripts named per page (`upload_batch.js`, `map_view.js`, …) | `static/` tree |
| Media | `media/` | Uploads to `batch_images/`, `profile_photos/`, `reports/` via `upload_to` on model FileFields | `accounts/models.py`, `coral_app/settings.py` (`MEDIA_ROOT`) |
| Entrypoints | `coral_app/wsgi.py`, `coral_app/asgi.py` | Stock, unmodified | both files |

**Signal:** `accounts/signals.py` — `notify_admins_of_new_registration` on `User` `post_save` (creation only): bulk-creates a `Notification` for every admin when a pending user registers. Registered via `AccountsConfig.ready()` (`accounts/apps.py`).

**Context processor:** `accounts.context_processors.notifications` — injects `nav_notifications` (latest 10) + `nav_unread_count` for the navbar bell; wired in `coral_app/settings.py` `TEMPLATES['OPTIONS']['context_processors']`.

## 3. HTTP layer

### URL patterns

Root (`coral_app/urls.py`):

| Pattern | Target | Name |
|---|---|---|
| `''` | `views.landing_page` | `landing_page` |
| `public-dashboard/` | `views.public_dashboard` | `public_dashboard` |
| `admin/` | `admin.site.urls` | — |
| `accounts/` | `include('accounts.urls')` | — |
| `oauth/` | `include('allauth.urls')` | — |

App (`accounts/urls.py`) — all under `accounts/`:

| Pattern | View | Name |
|---|---|---|
| `register/` | `register` | `register` |
| `login/` | `login_view` | `login` |
| `logout/` | `logout_view` | `logout` |
| `pending-approval/` | `pending_approval` | `pending_approval` |
| `researcher/dashboard/` | `researcher_dashboard` | `researcher_dashboard` |
| `researcher/settings/` | `account_settings` | `account_settings` |
| `researcher/accept-researcher/` | `accept_researcher` | `accept_researcher` |
| `notifications/mark-read/` | `notifications_mark_read` (POST) | `notifications_mark_read` |
| `researcher/manage-users/` | `manage_users` | `manage_users` |
| `researcher/manage-users/<int:user_id>/deactivate/` | `deactivate_user` (POST, JSON) | `deactivate_user` |
| `researcher/manage-users/<int:user_id>/activate/` | `activate_user` (POST, JSON) | `activate_user` |
| `researcher/upload-batch/` | `upload_batch` | `upload_batch` |
| `researcher/batches/` | `batches` | `batches` |
| `researcher/batches/all/` | `all_batches` | `all_batches` |
| `researcher/batches/<int:batch_id>/` | `batch_detail` | `batch_detail` |
| `researcher/batches/<int:batch_id>/export/excel/` | `batch_export_excel` | `batch_export_excel` |
| `researcher/batch-images/<int:image_id>/annotated/` | `batch_image_annotated` | `batch_image_annotated` |
| `researcher/map-view/` | `map_view` | `map_view` |
| `researcher/analysis-results/` | `analysis_results` | `analysis_results` |
| `researcher/analysis-results/export/csv/` | `analysis_results_export_csv` | `analysis_results_export_csv` |
| `researcher/analysis-results/export/pdf/` | `analysis_results_export_pdf` | `analysis_results_export_pdf` |
| `researcher/reports/` | `reports` | `reports` |
| `researcher/reports/generate/` | `generate_report` (POST, JSON) | `generate_report` |
| `researcher/reports/<int:report_id>/download/` | `download_report` | `download_report` |
| `researcher/reports/<int:report_id>/view/` | `view_report` | `view_report` |
| `researcher/reports/<int:report_id>/delete/` | `delete_report` (DELETE, JSON) | `delete_report` |
| `password-reset/` | `CustomPasswordResetView` (CBV) | `password_reset` |
| `password-reset/done/` | `password_reset_done` | `password_reset_done` |
| `password-reset/<uidb64>/<token>/` | `CustomPasswordResetConfirmView` (CBV) | `password_reset_confirm` |

### View style

- **All function-based views** except two CBVs: `CustomPasswordResetView` / `CustomPasswordResetConfirmView` (`accounts/views.py:161-175`). Full view inventory with line anchors: `register` :57, `login_view` :90, `logout_view` :139, `pending_approval` :147, `researcher_dashboard` :183, `analysis_results` :437, CSV/PDF exports :671/:709, `batch_export_excel` :771, `account_settings` :800, `accept_researcher` :878, `notifications_mark_read` :932, `manage_users` :939, `deactivate_user` :972, `activate_user` :999, `upload_batch` :1025, `batches` :1229, `all_batches` :1259, `map_view` :1293, `batch_image_annotated` :1394, `batch_detail` :1430, `reports` :1560, `generate_report` :1638, `download_report` :1725, `view_report` :1750, `delete_report` :1769.
- **No Django REST Framework** — not in `requirements.txt`; zero serializers/viewsets. JSON endpoints are hand-rolled `JsonResponse`: `notifications_mark_read`, `deactivate_user`, `activate_user`, `generate_report`, `delete_report` (`accounts/views.py:932, 972, 999, 1638, 1769`). The browser calls these with `fetch()` directly (`static/js/manage_users.js:176,201`, `static/js/reports_builder.js:670,860`, `static/js/custom.js:723`).
- **AuthZ pattern:** `@login_required(login_url='login')` + manual role guards at the top of each view (`is_pending()` → redirect `pending_approval`; `is_superadmin()` → redirect `admin:index`; `is_admin()` checks for admin-only pages). Role helpers live on `User` (`accounts/models.py:186-193`).
- Decorators in play: `@require_http_methods`, `@csrf_protect`, `@never_cache` (`accounts/views.py:56-60` etc.).
- Role landing logic: superadmin → Django admin, admin/researcher → `researcher_dashboard`, pending → `pending_approval` (`accounts/views.py` `login_view`, `LOGIN_REDIRECT_URL = 'pending_approval'` in settings).
- Middleware order (incl. allauth `AccountMiddleware`): `coral_app/settings.py` `MIDDLEWARE`.
- `LOGIN_URL='login'`, `LOGOUT_REDIRECT_URL='landing_page'`, `SITE_ID=1`, email login, `ACCOUNT_SIGNUP_FIELDS` with email+username — `coral_app/settings.py`.

## 4. Real-time events

**None.** No Channels, no consumers, no routing module, no websocket usage anywhere (repo-wide search found zero matches outside README prose). `requirements.txt` has no `channels` package; `coral_app/asgi.py` is the stock `get_asgi_application()`. Notification delivery is request-time: the navbar bell reads `Notification` rows server-rendered, and "mark read" is a fetch POST to `notifications_mark_read`.

## 5. Database layer

### Backend

SQLite, `ENGINE: 'django.db.backends.sqlite3'`, `NAME: BASE_DIR / 'db.sqlite3'` (`coral_app/settings.py` `DATABASES`). `.env.example` shows a commented-out `DATABASE_URL` for PostgreSQL, but nothing in settings consumes env config.

### Models (`accounts/models.py`)

| Model | Lines | Purpose / key fields | Relations |
|---|---|---|---|
| `User(AbstractUser)` | :155 | `role` ∈ {superadmin, admin, researcher, pending} (default pending), `profile_photo` (ImageField), `created_at`/`updated_at`; helpers `is_pending/is_researcher/is_admin/is_superadmin` | referenced as `settings.AUTH_USER_MODEL`; `AUTH_USER_MODEL = 'accounts.User'` in settings |
| `ImageBatch` | :198 | One site survey: `name`, `survey_date`, `surveyor_names`, `area_name`, `latitude`/`longitude` (Decimal 9,6), `user` FK | `user` → User (CASCADE, `related_name='image_batches'`); `Meta.ordering = ['-created_at']` |
| `Transect` | :223 | Sampling replicate within a batch: `number` (PositiveSmallInt), `label`, optional own lat/lng, **cached** `coverage_percent`/`coverage_class` | `batch` → ImageBatch (CASCADE, `related_name='transects'`) |
| `BatchImage` | :247 | One underwater photo: `image` (FileField → `batch_images/`), `description`, JSONFields `quadrat_rect`, `quadrat_points`, `point_classes` (list of benthic-class names), cached `coverage_percent`/`coverage_class` | `batch` → ImageBatch (CASCADE, `related_name='images'`); `transect` → Transect (nullable, `related_name='images'`) |
| `Report` | :268 | Generated report: `report_type` (6 choices), `export_format` (pdf/docx/xlsx/csv/html), `file` (FileField → `reports/`), `config` (JSON — full form snapshot), `status` (pending/processing/completed/failed), `error_message` | `user` → User (CASCADE, `related_name='reports'`) |
| `Notification` | :331 | In-app bell message: `verb` ∈ {registration_pending, account_approved}, `message`, `url`, `is_read` | `recipient` → User (CASCADE, `related_name='notifications'`) |

**Domain math (module-level functions, not methods):**
- `classify_hcc(percent)` :54 — Licuanan (2020) categories: A >44%, B >33–44%, C >22–33%, D 0–22%.
- `compute_coverage(point_classes)` :70 — HCC = Hard Coral points / total × 100; soft coral and other classes excluded from the numerator; returns breakdown dict.
- `compute_site_hcc(batch)` :98 — per-image HCC → per-transect mean → site mean of transect means, with SE (SD/√n) across transects (≥2) and the site's A–D class.
- Constants: `CPCE_CODES` (HC/SC/MA/HA/AA/AB/OB), `NATIONAL_HCC_AVERAGE = 22.8`, `COVERAGE_CLASS_LABELS/RANGES/DESCRIPTIONS` (`accounts/models.py:13-52`).

### Migrations

15 migrations, `accounts/migrations/0001_initial.py` → `0015_notification.py`:
- `0002_add_admin_role` — adds `admin` to role choices.
- `0003_image_batches` → `0007` — survey/image schema, `surveyor_names` rename.
- `0008_report` — Report model.
- `0009_user_profile_photo` — avatar field.
- `0010_recompute_hcc_coverage` — **data migration** recomputing cached coverage under the hard-coral-only HCC rule.
- `0011_transect_batchimage_transect` + `0012_backfill_transects` (**data migration** grouping existing images into transects) + `0013/0014` transect coords + backfill.
- `0015_notification` — Notification model.

### ORM patterns in use

- Aggregation/annotation: `Count('images')`, `annotate(...)`, `values('area_name').distinct().count()`, `aggregate(Max('number'))` (`accounts/views.py`, `researcher_dashboard`, `upload_batch`).
- Filters: date range `survey_date__gte/lte`, `__icontains` on area/surveyor (`_apply_analysis_filters`, `accounts/views.py:351`).
- `select_related('user')` on the public dashboard (`coral_app/views.py`).
- `transaction.atomic()` around multi-row batch creation and batch edits (`accounts/views.py:1140`, `batch_detail` POST path).
- `bulk_create` for admin notifications (`accounts/signals.py:27`).
- `update_fields=[...]` targeted saves; `update_session_auth_hash` after password change (`account_settings`).
- **Recurring hot-spot:** coverage statistics are recomputed in Python from `point_classes` JSON on nearly every request (dashboards, lists, analysis, reports) instead of being aggregated in SQL — several N+1 loops (`batch.images.all()` per batch). Cached fields exist (`Transect.coverage_percent`, `BatchImage.coverage_percent`) but views largely ignore them for site stats.

## 6. Commands

All standard `manage.py` (settings module `coral_app.settings` — `manage.py`; README cross-check):

| Purpose | Command |
|---|---|
| Install deps | `pip install -r requirements.txt` |
| Run dev server | `python manage.py runserver` (http://localhost:8000) |
| System check | `python manage.py check` |
| Apply migrations | `python manage.py migrate` (`makemigrations` when models change) |
| Run tests | `python manage.py test` — **caveat:** `accounts/tests.py` is the untouched stub, so the suite is effectively empty |
| Collect static | `python manage.py collectstatic` → `STATIC_ROOT = BASE_DIR / 'staticfiles'` |
| Superuser | `python manage.py createsuperuser` |
| Shell | `python manage.py shell` |

No `pyproject.toml`, no pytest config, no lint/format tooling committed. Python 3.14+ claimed by `README.md`; `.venv/` exists locally. Setup flow: copy `.env.example` → `.env`, migrate, create superuser (README) — but note settings ignores `.env` (see §8).

## 7. Request trace — image-batch upload POST

The core write path, end to end:

1. **Client form** — researcher opens `/accounts/researcher/upload-batch/`. Template `accounts/templates/accounts/upload_batch.html:101` defines `<form id="upload-batch-form" method="post" enctype="multipart/form-data">` with `{% csrf_token %}`; supports "append mode" (hidden `existing_batch_id` when adding a transect to an active site, rendered from `active_site` context).
2. **Client JS** — `static/js/upload_batch.js`: Leaflet map (ArcGIS tiles) two-way-binds clicks ↔ lat/lng inputs (:37-47); after client-side "AI analysis" of each image, per-image quadrat + classifications are serialized into hidden inputs `image_quadrat_1..n` (:536-555) as JSON `{rect, points, point_classes}`; a pre-submit guard blocks upload if any image lacks results.
3. **Routing** — `coral_app/urls.py` `path('accounts/', include('accounts.urls'))` → `accounts/urls.py:18` `path('researcher/upload-batch/', views.upload_batch, name='upload_batch')`.
4. **Middleware** — session → CSRF → auth → allauth `AccountMiddleware` chain (`coral_app/settings.py` `MIDDLEWARE`); `@login_required` redirects anonymous users to `login`.
5. **View guards** — `accounts/views.py:1025` `upload_batch`: pending users → `pending_approval`; append-mode lookup restricted to the user's own batch unless admin (`append_filter`).
6. **Validation** — requires ≥1 file; on new sites requires name/date/surveyor/area/valid lat+lng; per image requires `image_quadrat_<n>` JSON with `rect`, `points`, and `point_classes` as a list whose length equals the point count, with no empty class strings.
7. **Model/ORM** — inside `transaction.atomic()` (:1140): create `ImageBatch` (or reuse `existing_batch_id`), create `Transect` with `number = Max('number') + 1` and the site's coordinates, then one `BatchImage` per uploaded file — per-image `coverage_percent` = hard-coral points/total × 100 (Decimal, 2dp) and `coverage_class = classify_hcc(...)`; finally `compute_site_hcc(batch)` caches the transect's mean HCC onto the `Transect` row.
8. **Storage/DB** — image files land under `MEDIA_ROOT/batch_images/`; rows persist to SQLite `db.sqlite3`.
9. **Response** — redirect to `upload_batch?site=<batch.id>` with a success/diagnostic `messages` toast; the toast payload is rendered server-side into `templates/base.html:20-28` and animated by `static/js/custom.js`. GET of the same URL re-renders `accounts/upload_batch.html` with `active_site` pre-fill and a `survey_points` JSON blob for the map (`accounts/views.py` GET branch).
10. **Downstream consumers** — the same `point_classes` data later feeds `public_dashboard` (`coral_app/views.py`), `researcher_dashboard`, `batches`/`all_batches`, `batch_detail`, `map_view`, `analysis_results`, exports (CSV/PDF/Excel) and `ReportGenerator` — all recomputing HCC via the model functions in §5.

## 8. Uncertainties

Things I could not confirm and did not guess:

- **Branch:** session metadata said `main`, but read-only `git` commands were blocked by the inspection tooling, so the checked-out branch was not independently verified.
- **Django version drift:** `accounts/migrations/0001_initial.py` header says "Generated by Django 6.0.3" while `requirements.txt` pins 5.2.6. History was likely produced under a different environment; run `python manage.py makemigrations --check` to confirm no drift remains.
- **Unused pinned dependencies:** `opencv-python`, `PyJWT`, `cryptography`, `requests`, `python-decouple`, `pytz` are in `requirements.txt` but I found no project code importing them (content search; `.venv` not audited).
- **Settings/env drift:** `.env.example` implies env-driven config (decouple-style), but `coral_app/settings.py` hardcodes `SECRET_KEY`/`DEBUG=True` and never loads `.env`. `python-decouple` is pinned but unused in settings.
- **AI pipeline location:** `upload_batch.js` performs client-side "AI analysis" producing quadrat boxes and per-point classes; the inference code/model is **not** in this repo (only training notebooks at the root: `YOLOv8/FasterRCNN/EfficientDet_Coral_Training.ipynb`). How the browser obtains model outputs is outside this codebase.
- **`JSON_SCHEMA_DIAGRAM.txt`:** appeared as a changed file in session metadata but does not exist on disk — likely deleted or uncommitted; `git status` could not be run to confirm.
- **`batch_image_annotated` view** (`accounts/views.py:1394`) was not read line-by-line; it delegates to `render_annotated_bytes` in `accounts/image_annotator.py` per its import, but exact behavior (caching, sizing params) is unverified.
- **Tooling gap:** one code-search call failed on a missing vendored ripgrep binary during the audit; all others succeeded, but a pattern could theoretically have been missed in that window.
