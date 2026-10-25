# CoralSense Local PostgreSQL Setup

The initial transfer connected the existing Django application to PostgreSQL without changing HCC calculations. A subsequent naming migration now uses `DataRepository` and `SurveyImage`; see the naming section below.

## Configuration

The existing `coral_app/settings.py` reads only database variables from the project's `.env`; process environment variables take precedence. Without configuration, it uses SQLite. Existing hardcoded development `DEBUG`, `SECRET_KEY`, and host behavior are unchanged.

| Variable | Purpose |
|---|---|
| `DB_ENGINE` | `sqlite` or `postgresql` |
| `DB_NAME` | PostgreSQL database name |
| `DB_USER` / `DB_PASSWORD` | Application role credentials |
| `DB_HOST` / `DB_PORT` | Local server, normally `127.0.0.1:5432` |
| `DB_SSLMODE` | `prefer` locally; use the hosting provider's TLS requirements at deployment |

The local application role does not have superuser, role-creation, or database-creation privileges. A separate `coralsense_test` role has database-creation rights solely for Django's local test databases. Do not copy local passwords or test-role privileges into production.

## First-time setup and transfer

1. Install the official PostgreSQL 17 server and command-line tools. Use a generated administrator password and keep its recovery record outside Git. Bind the service to localhost.
2. Install pinned dependencies with the project's virtual environment. The PostgreSQL driver is `psycopg[binary]==3.3.6`.
3. Stop application writes during the transfer. Back up SQLite using its backup API and copy `media/`. Keep fixtures, snapshots, and credential recovery files in ignored `backups/`.
4. For this installation, `scripts/setup_local_postgresql.py` provisions a fresh database using the ignored administrator credential file. It refuses to overwrite existing roles, databases, or `.env`. It initially leaves `DB_ENGINE=sqlite`.
5. While SQLite is active, create a baseline and export data:

   ```powershell
   .venv/Scripts/python.exe manage.py database_audit --output backups/audit-before.json --export backups/records.json
   ```

   This command exports UTF-8 and preserves full timestamp precision; the standard Django JSON encoder trims timestamps to milliseconds. The registration signal skips raw fixture loads, avoiding additional notifications during import. Content types and permissions are created by migrations and referenced through natural keys. Sessions are intentionally not transferred; sign in again after switching.

6. Temporarily select PostgreSQL, review and apply migrations, import into the fresh database, then compare with the baseline:

   ```powershell
   $env:DB_ENGINE = 'postgresql'
   .venv/Scripts/python.exe manage.py migrate --plan
   .venv/Scripts/python.exe manage.py migrate
   .venv/Scripts/python.exe manage.py loaddata backups/records.json
   .venv/Scripts/python.exe manage.py database_audit --compare backups/audit-before.json
   Remove-Item Env:DB_ENGINE
   ```

   These sample paths can be replaced with the actual timestamped backup directory. Import only into the prepared fresh database, not a populated live database. The audit compares per-model row counts and serialized-content hashes, plus canonical site HCC results. It excludes regenerated permissions/content types and ephemeral sessions.

7. Verify new inserts, relationships, JSON fields, authentication, dashboards, maps, image rendering, and export workflows. Keep the existing media directory: fixtures transfer file paths, not file bytes.
8. After verification, set `DB_ENGINE=postgresql` in `.env` and restart the development server. Confirm the active backend before adding data.

## Verification and rollback

Run `manage.py check`, `makemigrations --check`, and `test` with `.venv/Scripts/python.exe`. PostgreSQL tests need a role that can create the disposable test database: set process-level `DB_USER` and `DB_PASSWORD` to the separate local test role for that command, then clear those overrides. Do not grant production application roles broad privileges to make tests pass.

For this installation, run the tests without displaying the stored password:

```powershell
$testCredential = Get-Content backups/postgresql-local-test.json -Raw | ConvertFrom-Json
try {
    $env:DB_USER = $testCredential.user
    $env:DB_PASSWORD = $testCredential.password
    .venv/Scripts/python.exe manage.py test
} finally {
    Remove-Item Env:DB_USER, Env:DB_PASSWORD -ErrorAction SilentlyContinue
}
```

To use the preserved SQLite database with the current code, set `DB_ENGINE=sqlite` in `.env`, run `manage.py migrate` to apply the naming migration to that database, and restart the server. PostgreSQL writes made after cutover will not automatically exist in SQLite; do not switch back after collecting new data without a reconciliation plan. The original SQLite file has not been migrated by the PostgreSQL naming change.

Use PostgreSQL's `pg_dump --format=custom` for database backups after migration and verify a restore into a separate scratch database. Back up media separately. Local setup does not configure hosted deployment, production TLS, or production application settings.

## Naming cleanup: completed October 25, 2026

Migration `0016_repository_image_category_names` applies `ImageBatch` → `DataRepository` and `BatchImage` → `SurveyImage`, retaining `Transect`. PostgreSQL tables are now `accounts_datarepository` and `accounts_surveyimage`. The stored image and transect `coverage_class` columns are now `coverage_category`. Refresh **Tables** in pgAdmin to see the new names.

The migration preserves IDs, relationships, JSON annotations, image paths, cached category values, and HCC calculations. Permission codenames are renamed in place so existing grants retain their IDs and assignments. Old migrations remain unchanged. Existing `batch` foreign keys, URLs, upload payloads, helper result dictionaries (`coverage_class`), and frontend filters retain their contracts.

Before applying it, a fresh backup was saved as `backups/before-repository-category-rename.dump`; records and permissions were also snapshotted in ignored `backups/rename-*` files. Verification compared all record contents with an explicit mapping of the renamed models, fields, permission natural keys, and content types. Seven repositories, ten transects, and 51 survey images were preserved, including uploads made after the initial PostgreSQL transfer. Canonical site HCC fingerprints matched exactly; permission IDs and grants also matched.

Ten regression tests passed on PostgreSQL and on an in-memory SQLite test database, including forward/reverse migration preservation and upload/append, category, page, role-guard, export, and admin workflows. The system check passed and `makemigrations --check` reported no changes. Browser interaction was not verified in this naming change.

To reverse only this naming migration, first stop the Django server, run `manage.py migrate accounts 0015`, then restore the matching pre-rename application code before restarting. Reversing the database without reverting the code leaves the two incompatible. Old fixture/audit files contain historical model and field names; do not import them directly into the renamed schema. Do not delete migrations or recreate populated tables to rename them.

## Completed local verification — October 24, 2026

- Installed PostgreSQL 17.11 as Windows service `postgresql-x64-17`, listening on localhost, port 5432. Command-line tools are in `C:/Program Files/PostgreSQL/17/bin/`; pgAdmin was not installed.
- Activated `coralsense_local` through ignored `.env`, using the restricted application role. Administrator and test-role recovery credentials are in ignored `backups/` files; do not commit or share them.
- Transferred 101 records: 7 users, 6 surveys, 9 transects, 48 images, 2 reports, 2 notifications, 26 admin log entries, and 1 Django site. Counts, serialized content including full timestamp precision, and canonical HCC results match SQLite across 14 model types.
- Seven targeted regression tests passed on PostgreSQL. System checks and migration consistency checks passed.
- Transactional smoke checks passed for password login, new inserts, JSON fields, relationships, dashboard/list/map/analysis/report/settings/upload pages, CSV/PDF/Excel exports, and annotated-image rendering. Smoke records were rolled back. All 48 original image files remain available.
- Created a PostgreSQL custom-format backup and successfully restored it into a scratch database, comparing the restored data against the SQLite baseline. The scratch database was removed afterward.
- SQLite snapshot, media copy, fixture, audit baseline, and `postgresql.dump` are under `backups/postgresql-migration-20261024-232741/`. Original `db.sqlite3` and `media/` remain available.

Restart any running Django development server to load the new database configuration, and sign in again. Hosted deployment remains separate work; the naming migration was subsequently completed as described above. Commands still emit the existing `requests` dependency compatibility warning; it did not prevent these checks.
