# CoralSense — Codebase Knowledge

> Architecture reference for the Django project in this repository. Initial audit: 2026-09-29. Source corrections and project skill setup: 2026-10-10. Runtime verification is reported separately; source inspection is not proof of successful execution.

## 1. Overview

| Aspect | Value | Source |
|---|---|---|
| Framework | Django **5.2.6** (pinned) | `requirements.txt` |
| App type | Monolithic, server-rendered Django + vanilla JS (no bundler, no node) | `static/` tree, `templates/base.html` |
| Database | Environment-selectable PostgreSQL or SQLite fallback at `db.sqlite3` | `coral_app/settings.py` (`DATABASES`) |
| Auth | django-allauth 65.9.0, Google OAuth provider, email login, custom `User` with roles | `coral_app/settings.py` (`INSTALLED_APPS`, `AUTHENTICATION_BACKENDS`, `SOCIALACCOUNT_PROVIDERS`), `accounts/models.py` |
| Domain | Coral reef monitoring ("CoralSense", DNSC capstone): image-batch surveys → point-intercept benthic classification → Hard Coral Cover (HCC) stats on the Licuanan (2020) A–D scale | `accounts/models.py` (`CPCE_CODES`, `classify_hcc` docstrings), `templates/base.html` footer |
| Local apps | One: `accounts` | `coral_app/settings.py` |

## 2. Project structure

| Area | Location | Notes | Source |
|---|---|---|---|
| Settings | `coral_app/settings.py` | Plain settings; `SECRET_KEY` and `DEBUG=True` **hardcoded**; `os.environ.get` used only for Google OAuth client id/secret. Reads only database variables from project `.env` or process environment; retains hardcoded development DEBUG/SECRET_KEY. | `coral_app/settings.py`, `.env.example` |
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

`coral_app/settings.py` selects PostgreSQL when `DB_ENGINE=postgresql`, reading `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_SSLMODE`. The default or explicit `DB_ENGINE=sqlite` preserves `BASE_DIR / 'db.sqlite3'` independently of `DB_NAME`. Only database variables are environment-driven; existing development settings remain unchanged. See `docs/postgresql-local-setup.md`.

### Models (`accounts/models.py`)

| Model | Lines | Purpose / key fields | Relations |
|---|---|---|---|
| `User(AbstractUser)` | :155 | `role` ∈ {superadmin, admin, researcher, pending} (default pending), `profile_photo` (ImageField), `created_at`/`updated_at`; helpers `is_pending/is_researcher/is_admin/is_superadmin` | referenced as `settings.AUTH_USER_MODEL`; `AUTH_USER_MODEL = 'accounts.User'` in settings |
| `DataRepository` | :198 | One site survey: `name`, `survey_date`, `surveyor_names`, `area_name`, `latitude`/`longitude` (Decimal 9,6), `user` FK | `user` → User (CASCADE, `related_name='image_batches'`); `Meta.ordering = ['-created_at']` |
| `Transect` | :223 | Sampling replicate within a batch: `number` (PositiveSmallInt), `label`, optional own lat/lng, **cached** `coverage_percent`/`coverage_category` | `batch` → DataRepository (CASCADE, `related_name='transects'`) |
| `SurveyImage` | :247 | One underwater photo: `image` (FileField → `batch_images/`), `description`, JSONFields `quadrat_rect`, `quadrat_points`, `point_classes` (list of benthic-class names), cached `coverage_percent`/`coverage_category` | `batch` → DataRepository (CASCADE, `related_name='images'`); `transect` → Transect (nullable, `related_name='images'`) |
| `Report` | :268 | Generated report: `report_type` (6 choices), `export_format` (pdf/docx/xlsx/csv/html), `file` (FileField → `reports/`), `config` (JSON — full form snapshot), `status` (pending/processing/completed/failed), `error_message` | `user` → User (CASCADE, `related_name='reports'`) |
| `Notification` | :331 | In-app bell message: `verb` ∈ {registration_pending, account_approved}, `message`, `url`, `is_read` | `recipient` → User (CASCADE, `related_name='notifications'`) |

**Domain math (module-level functions, not methods):**
- `classify_hcc(percent)` :54 — Licuanan (2020) categories: A >44%, B >33–44%, C >22–33%, D 0–22%.
- `compute_coverage(point_classes)` :70 — HCC = Hard Coral points / total × 100; soft coral and other classes excluded from the numerator; returns breakdown dict.
- `compute_site_hcc(batch)` :98 — per-image HCC → per-transect mean → site mean of transect means, with SE (SD/√n) across transects (≥2) and the site's A–D class.
- Constants: `CPCE_CODES` (HC/SC/MA/HA/AA/AB/OB), `NATIONAL_HCC_AVERAGE = 22.8`, `COVERAGE_CLASS_LABELS/RANGES/DESCRIPTIONS` (`accounts/models.py:13-52`).

### Migrations

16 migrations, `accounts/migrations/0001_initial.py` → `0016_repository_image_category_names.py`:
- `0002_add_admin_role` — adds `admin` to role choices.
- `0003_image_batches` → `0007` — survey/image schema, `surveyor_names` rename.
- `0008_report` — Report model.
- `0009_user_profile_photo` — avatar field.
- `0010_recompute_hcc_coverage` — **data migration** recomputing cached coverage under the hard-coral-only HCC rule.
- `0011_transect_batchimage_transect` + `0012_backfill_transects` (**data migration** grouping existing images into transects) + `0013/0014` transect coords + backfill.
- `0015_notification` — Notification model.
- `0016_repository_image_category_names` — reversible model/table and stored category-field renames; preserves permission grants.

### ORM patterns in use

- Aggregation/annotation: `Count('images')`, `annotate(...)`, `values('area_name').distinct().count()`, `aggregate(Max('number'))` (`accounts/views.py`, `researcher_dashboard`, `upload_batch`).
- Filters: date range `survey_date__gte/lte`, `__icontains` on area/surveyor (`_apply_analysis_filters`, `accounts/views.py:351`).
- `select_related('user')` on the public dashboard (`coral_app/views.py`).
- `transaction.atomic()` around multi-row batch creation and batch edits (`accounts/views.py:1140`, `batch_detail` POST path).
- `bulk_create` for admin notifications (`accounts/signals.py:27`).
- `update_fields=[...]` targeted saves; `update_session_auth_hash` after password change (`account_settings`).
- **Recurring hot-spot:** coverage statistics are recomputed in Python from `point_classes` JSON on nearly every request (dashboards, lists, analysis, reports) instead of being aggregated in SQL — several N+1 loops (`batch.images.all()` per batch). Cached fields exist (`Transect.coverage_percent`, `SurveyImage.coverage_percent`) but views largely ignore them for site stats.

## 6. Commands

All standard `manage.py` (settings module `coral_app.settings` — `manage.py`; README cross-check):

| Purpose | Command |
|---|---|
| Install deps | `pip install -r requirements.txt` |
| Run dev server | `python manage.py runserver` (http://localhost:8000) |
| System check | `python manage.py check` |
| Apply migrations | `python manage.py migrate` (`makemigrations` when models change) |
| Run tests | `python manage.py test` — ten targeted configuration, fixture-signal, timestamp, database-audit, schema-rename and workflow regression tests; PostgreSQL requires the separate local test role (see setup guide); not full workflow coverage |
| Collect static | `python manage.py collectstatic` → `STATIC_ROOT = BASE_DIR / 'staticfiles'` |
| Superuser | `python manage.py createsuperuser` |
| Shell | `python manage.py shell` |

No `pyproject.toml`, no pytest config, no lint/format tooling committed. Python 3.14+ claimed by `README.md`; the local `.venv/` uses Python 3.13.7. Database variables now read `.env`; the remaining development settings retain their existing behavior. Follow `docs/postgresql-local-setup.md` for the verified database workflow.

## 7. Request trace — image-batch upload POST

The core write path, end to end:

1. **Client form** — researcher opens `/accounts/researcher/upload-batch/`. Template `accounts/templates/accounts/upload_batch.html:101` defines `<form id="upload-batch-form" method="post" enctype="multipart/form-data">` with `{% csrf_token %}`; supports "append mode" (hidden `existing_batch_id` when adding a transect to an active site, rendered from `active_site` context).
2. **Client JS** — `static/js/upload_batch.js`: Leaflet map (ArcGIS tiles) two-way-binds clicks ↔ lat/lng inputs (:37-47); after client-side "AI analysis" of each image, per-image quadrat + classifications are serialized into hidden inputs `image_quadrat_1..n` (:536-555) as JSON `{rect, points, point_classes}`; a pre-submit guard blocks upload if any image lacks results.
3. **Routing** — `coral_app/urls.py` `path('accounts/', include('accounts.urls'))` → `accounts/urls.py:18` `path('researcher/upload-batch/', views.upload_batch, name='upload_batch')`.
4. **Middleware** — session → CSRF → auth → allauth `AccountMiddleware` chain (`coral_app/settings.py` `MIDDLEWARE`); `@login_required` redirects anonymous users to `login`.
5. **View guards** — `accounts/views.py:1025` `upload_batch`: pending users → `pending_approval`; append-mode lookup restricted to the user's own batch unless admin (`append_filter`).
6. **Validation** — requires ≥1 file; on new sites requires name/date/surveyor/area/valid lat+lng; per image requires `image_quadrat_<n>` JSON with `rect`, `points`, and `point_classes` as a list whose length equals the point count, with no empty class strings.
7. **Model/ORM** — inside `transaction.atomic()` (:1140): create `DataRepository` (or reuse `existing_batch_id`), create `Transect` with `number = Max('number') + 1` and the site's coordinates, then one `SurveyImage` per uploaded file — per-image `coverage_percent` = hard-coral points/total × 100 (Decimal, 2dp) and `coverage_category = classify_hcc(...)`; finally `compute_site_hcc(batch)` caches the transect's mean HCC onto the `Transect` row.
8. **Storage/DB** — image files land under `MEDIA_ROOT/batch_images/`; rows persist to the configured backend (local PostgreSQL after the October 24 transfer; SQLite remains an explicit fallback).
9. **Response** — redirect to `upload_batch?site=<batch.id>` with a success/diagnostic `messages` toast; the toast payload is rendered server-side into `templates/base.html:20-28` and animated by `static/js/custom.js`. GET of the same URL re-renders `accounts/upload_batch.html` with `active_site` pre-fill and a `survey_points` JSON blob for the map (`accounts/views.py` GET branch).
10. **Downstream consumers** — `point_classes` feeds the public/researcher dashboards, batch lists/detail, maps, analysis, and exports. Most headline site statistics use `compute_site_hcc`, but `ReportGenerator` averages cached image coverage, analysis monthly statistics pool points, and the upload preview pools points across images. These are confirmed differences in weighting, not equivalent uses of the canonical site function (`accounts/report_generator.py`, `accounts/views.py::analysis_results`, `static/js/upload_batch.js::computeTransectCoverage`).

## 8. Confirmed limitations and remaining uncertainties

Source findings checked on 2026-10-10; these do not imply runtime testing:

- **Mock analysis:** `static/js/upload_batch.js::startAnalyzeAll` calls `generateMockAIResults` and includes a TODO for a YOLO API. The mock cycles seven classes over ten randomly positioned points. Root training/comparison notebooks are separate experiments, not a deployed inference integration.
- **Authentication exception:** `accounts/views.py::batch_detail` lacks `login_required` and directly calls role methods on `request.user`. The duplicated login decorators immediately before `batch_image_annotated` protect that view only. Anonymous batch-detail access is not guarded by the documented pattern.
- **Report formats:** `accounts/report_generator.py::generate_docx`, `generate_xlsx`, and `generate_html` mark reports completed with fixed sizes without writing files. Its PDF renders metadata rather than survey results. The separate `accounts/excel_export.py` batch workbook is implemented.
- **Report errors:** `accounts/views.py::generate_report` records generation failures but returns a success response with "Report generation started"; processing is synchronous and no worker is launched.
- **Coverage precision:** `compute_coverage` rounds image HCC to an integer, while upload caches store two-decimal percentages. Report aggregation and batch Excel category percentages use different paths. Do not assume all displayed outputs are identical (`accounts/models.py`, `accounts/views.py::upload_batch`, `accounts/report_generator.py`, `accounts/excel_export.py`).
- **Export filtering:** CSV/PDF analysis exports discard the coverage filter state; category/min/max filters are applied separately only in the analysis page (`accounts/views.py`).
- **Coordinates:** editing batch coordinates does not synchronize existing transect coordinates (`accounts/views.py::batch_detail`). Shared site coordinates remain the intended invariant in `AGENTS.md`.
- **Dashboard years:** the researcher dashboard groups trends by month name/number without year, merging years (`accounts/views.py::researcher_dashboard`).
- **Validation:** upload checks basic payload completeness but not allowed class membership, complete JSON shape, geographic bounds, or uploaded image content/size (`accounts/views.py::upload_batch`).
- **Settings/env drift (updated October 24):** database variables now load from `.env`; other example variables do not automatically configure the application. Hardcoded development settings remain intentional; console email does not deliver password-reset mail externally (`coral_app/settings.py`).
- **Django version metadata:** the initial migration header names Django 6.0.3 while requirements pin 5.2.6. A header alone does not establish an incompatibility.
- **Environment unknowns:** installed versions, live OAuth configuration, applied database migrations, and notebook training results are not established by source inspection. No direct application imports of several pinned libraries were found in the initial audit; that does not prove they are unnecessary transitively.

## 9. Project agent setup

`AGENTS.md` contains shared implementation rules; `CLAUDE.md` directs Claude users to the same rules. Five skills are installed in `.agents/skills/`:

| Skill | Origin | Intended task |
|---|---|---|
| `coralsense-survey-hcc` | Custom | Survey/HCC changes and diagnosis |
| `coralsense-template-debugging` | Custom | Template/CSS/JS diagnosis |
| `coralsense-frontend-design` | Custom | Responsive design; standalone example at `examples/frontend-design/dashboard.html` |
| `jupyter-notebook` | OpenAI `openai/skills`, `skills/.curated/jupyter-notebook` | Notebook creation/editing |
| `playwright` | OpenAI `openai/skills`, `skills/.curated/playwright` | Browser automation |

Downloaded on 2026-10-10 from the upstream `main` branch using the official skill-installer helper. The upstream ref was not pinned to a commit. Bundled files are retained locally; use their actual repository paths instead of global-path examples. Skill installation alone does not install Node/npm, browser binaries, Jupyter, or ML packages.

Git inspection confirmed a clean `main` before setup and latest commit `5580208` (2026-09-29). Setup began on `chore/project-agent-skills`, renamed to `agent-skills` on 2026-10-12; this is task status, not a rule for future branches. No application fixes are included in this setup.

Setup verification on 2026-10-10 used `.venv/Scripts/python.exe`: Django 5.2.6, `manage.py check` passed, `makemigrations --check` reported no changes, and `manage.py test` found zero tests. All three emitted a `requests` dependency compatibility warning. The global Python lacked Pillow, so it was not the working project interpreter. The official skill validator could not run because PyYAML was absent; skill frontmatter, naming, encoding, and bundled resources were checked directly without installing packages.

## 10. Detection-area demonstration (2026-10-22)

The area demonstration is a standalone sample at `examples/area-analysis/index.html`, with its JavaScript and CSS in the same directory. Open it directly in a browser; no Django server or login is required. It uses editable illustrative Hard Coral rectangles, exact clipped rectangle-union area, raw Category A-D thresholds, and ten proportional representative markers. Presets demonstrate 0%, 30%, 53%, 54%, 55%, and 100%; 55% retains its raw value while allocating six Hard Coral markers. Remainder markers are explicitly unclassified. Boxes can be moved and resized with corner handles or numeric fields. No model inference runs. Boxes and points use normalized whole-image coordinates, not the application's quadrat-relative point payload.

Approval is demonstration-only and is invalidated by geometry/marker edits. Photographs are chosen locally and can be switched through the sample's image selector; edits are retained in browser memory during the session. The sample has no network upload or application integration. The upload page's original point-intercept workflow has been restored, and historical model calculations and database fields are unchanged. Saving raw area estimates requires a separate versioned backend implementation.

Run `node --test tests/js/upload_area_demo.test.cjs` for geometry and preview-lifecycle regression checks, in addition to the Django checks. These Node tests do not establish browser rendering or actual AI accuracy.

## 11. Verified local PostgreSQL transfer (2026-10-24)

Branch `chore/postgresql-local-setup` prepares local PostgreSQL with Psycopg 3.3.6, database-only environment settings, and SQLite fallback. `accounts/signals.py` skips raw fixture loads to prevent duplicate registration notifications. `manage.py database_audit` writes or compares row-count, serialized-content, and canonical HCC fingerprints without printing record contents. Fixture exports exclude generated content types/permissions and sessions. SQLite/media backups, exports, audit files, and credential recovery records live under ignored `backups/`. Model/table renaming is explicitly deferred. Check the local setup guide and active backend for the completed transfer status.

PostgreSQL 17.11 now runs as `postgresql-x64-17` on localhost:5432. The ignored local `.env` activates `coralsense_local` with a restricted application role. All 101 exported records match SQLite across 14 model types, including full timestamp precision and canonical HCC results. Seven regression tests passed on PostgreSQL, along with system/migration checks and transactional application smoke checks. A custom PostgreSQL backup was restored and audited in a disposable database successfully. See `docs/postgresql-local-setup.md` for exact counts, verified workflows, test-role usage, backup location, restart instructions, and rollback limits. This verifies local database preparation, not hosted deployment.


## 12. Repository and category naming (2026-10-25)

`DataRepository` replaces `ImageBatch` and `SurveyImage` replaces `BatchImage`. Migration `0016_repository_image_category_names` uses `RenameModel` / `RenameField`; default tables become `accounts_datarepository` and `accounts_surveyimage`. `SurveyImage.coverage_category` and `Transect.coverage_category` replace their stored `coverage_class` fields. Existing primary keys, file paths, foreign keys, JSON annotations, cached values, and HCC rules are preserved. Permission codenames are renamed in place with reversible data operations to preserve existing grants. Historical migrations remain unchanged.

The `batch` foreign-key name, `images` / `image_batches` reverse relations, URLs, upload keys, HCC helper dictionary keys (`coverage_class`), template context, filters, and frontend payloads retain their existing contracts. These display/calculation dictionary keys are not database column names. Repository distribution reads `SurveyImage.coverage_category`. Before a rename, export/backup existing data; old fixtures and audit snapshots use the old model/field names and require explicit normalization when comparing against the renamed schema. `accounts/test_model_renames.py` covers forward/reverse row preservation, permission identity/grants, upload/append category writes, pages, role guards, exports, and admin registrations.
