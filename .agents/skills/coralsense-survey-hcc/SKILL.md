---
name: coralsense-survey-hcc
description: Debug or change CoralSense survey uploads, transects, benthic classifications, HCC calculations, and exports while preserving the project's sampling rules.
---

# CoralSense Survey and HCC

Read the repository's AGENTS.md and relevant sections of knowledge.md. Resolve project paths from the repository root.

## Trace the workflow

- Canonical model and calculations: accounts/models.py (CPCE_CODES, classify_hcc, compute_coverage, compute_site_hcc).
- Upload contract: accounts/templates/accounts/upload_batch.html, static/js/upload_batch.js, accounts/views.py::upload_batch.
- Consumers: dashboard, analysis, map, and batch views in accounts/views.py; coral_app/views.py; accounts/excel_export.py; accounts/report_generator.py.

Trace multipart file ordering and image_quadrat_1..n together. Each JSON payload contains rect, points, and point_classes. Rectangle coordinates are relative to the image; points are relative to the quadrat. Mirror contract changes on client and server. Keep multi-row writes in transaction.atomic().

## Preserve scientific meaning

HCC counts Hard Coral only, divided by all sampled points. Soft Coral remains in composition but not the numerator. Store full names from CPCE_CODES rather than display abbreviations.

The canonical implementation rounds image HCC to whole percentages, averages images equally within each transect, then averages transects equally for the site. SE is across transect means. Reuse model functions; do not substitute pooled-point coverage or a mean of all images for site HCC. If a request changes precision or weighting, establish the intended statistical rule before implementing it.

Use canonical boundaries and wording: A above 44; B above 33 through 44; C above 22 through 33; D through 22. Preserve None for missing data rather than silently treating it as zero.

One submit creates one transect with number Max(number) + 1. Site coordinates are shared by transects. Recompute affected image and transect caches when classifications change, and check coordinate synchronization during metadata edits.

## Current implementation limits

Analyze calls generateMockAIResults, not trained inference. Do not claim biological accuracy or silently add an inference service. Upload previews and report-builder coverage currently differ from canonical site weighting; inspect consumers rather than assuming consistency.

Aggregate dashboards intentionally include all surveys. Editing and per-batch downloads generally require ownership or admin access. Preserve endpoint role guards and data scope.

Repeated relation traversal is a known query hotspot. Use suitable prefetching when needed and report added query cost if unresolved. Do not rewrite historical data migrations to reuse current functions.

## Verification

Check changed behavior using relevant cases: category boundaries, hard-versus-soft numerator, unequal images per transect, missing classifications, and matching upload payloads. Run python manage.py check, python manage.py makemigrations --check, and python manage.py test as required by AGENTS.md. Report the actual test count; the current test module is an empty stub. Explain changes to scientific outputs and unresolved inconsistencies.
