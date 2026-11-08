# Initial Railway deployment

The repository is `jordachristiandominique/Coral`. The prepared branch is
`apply-demo-analysis`. Push the deployment changes before selecting this source
in Railway. Hosting resources and billing are configured in the user's account.

## 1. Create the services

Select the Coral GitHub repository and configure its source branch as
`apply-demo-analysis`. Railway detects the Dockerfile. Add a PostgreSQL service
in the same project and region. The examples below assume its name is `Postgres`.
An initial build can run while the service variables are being configured.

The container installs the pinned CPU inference environment, Gunicorn and
WhiteNoise. Its start script creates the storage directories, runs migrations,
collects static files and starts one Gunicorn worker with four threads. The
health endpoint checks database connectivity. The private model is loaded on
the first analysis request after it has been uploaded.

## 2. Configure the application variables

Set these on the application service, rather than on PostgreSQL.

| Variable | Value |
| --- | --- |
| `DJANGO_SECRET_KEY` | A newly generated secret of at least 50 characters |
| `DB_ENGINE` | `postgresql` |
| `DB_NAME` | `${{Postgres.PGDATABASE}}` |
| `DB_USER` | `${{Postgres.PGUSER}}` |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
| `DB_HOST` | `${{Postgres.PGHOST}}` |
| `DB_PORT` | `${{Postgres.PGPORT}}` |
| `DB_SSLMODE` | `prefer` |

Generate the secret locally and paste it directly into Railway's private variable
editor. Keep it out of Git and screenshots.

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(64))"
```

`DJANGO_DEPLOYMENT=railway` is set by the Dockerfile. This explicitly activates
the hosted settings in the existing settings module. The default local setup
continues to use its development configuration. Railway supplies `PORT`.

## 3. Attach persistent storage

Attach a volume to the application service and mount it at `/data`. PostgreSQL
uses its own database volume. The application stores its uploads in `/data/media`
and loads its model from `/data/model_artifacts/yolov8s-validator-v3`.

These are the default hosted paths. Optional `MEDIA_ROOT` and `YOLO_ARTIFACT_DIR`
variables can override them. Use one application replica with this local-volume
setup. Back up the PostgreSQL service and the application volume separately.

The container and Git repository exclude `.env`, local media, backups and `.pt`
weights. Hosted PostgreSQL starts with migrations and initial Django records.
Import existing survey records and media separately if they are required.

## 4. Deploy and generate the domain

Apply the service changes and deploy. Check the build and deployment logs. The
healthcheck is `/healthz/`. After the app is running, open application Settings,
Networking, Public Networking and Generate Domain.

The settings read `RAILWAY_PUBLIC_DOMAIN` for the allowed host and HTTPS CSRF
origin. For a custom domain, add comma-separated hostnames in
`DJANGO_ALLOWED_HOSTS` and full HTTPS origins in `DJANGO_CSRF_TRUSTED_ORIGINS`.
The hosted profile redirects HTTP to HTTPS and uses secure session/CSRF cookies.
The deployment check may report the optional HSTS preload advisory. Preloading
is intentionally disabled for this initial host.

Static assets are served by WhiteNoise. Uploaded files use `/uploads/` and are
served through authenticated Django file responses. Survey images and archived
reports require ownership or an administrator role. Approved users can retrieve
profile images used by the interface.

## 5. Upload the private model

Install/use the Railway CLI and link it to this project and application service.
Run these commands from the local repository in PowerShell. The interactive
`service` command selects the application service.

```powershell
npx --yes @railway/cli login
npx --yes @railway/cli link
npx --yes @railway/cli service
```

Upload all three files to the application volume. The remote paths below are
relative to the volume root, which is mounted at `/data` inside the container.
The application's first successful start creates the destination directories.

```powershell
npx --yes @railway/cli volume files upload "model_artifacts/yolov8s-validator-v3/artifact.json" "/model_artifacts/yolov8s-validator-v3/artifact.json"
npx --yes @railway/cli volume files upload "model_artifacts/yolov8s-validator-v3/yolov8s_HC-SC-Quadrat-Validator-v3_best.metadata.json" "/model_artifacts/yolov8s-validator-v3/yolov8s_HC-SC-Quadrat-Validator-v3_best.metadata.json"
npx --yes @railway/cli volume files upload "model_artifacts/yolov8s-validator-v3/yolov8s_HC-SC-Quadrat-Validator-v3_best.pt" "/model_artifacts/yolov8s-validator-v3/yolov8s_HC-SC-Quadrat-Validator-v3_best.pt"
```

If the CLI version or account does not offer volume file commands, use the
authenticated SSH/SFTP transfer described in Railway's documentation. Confirm
the destination is the mounted `/data` directory.

Open a shell inside the running application service.

```powershell
npx --yes @railway/cli ssh
```

Inside that remote shell, validate the checkpoint and create the administrator.

```bash
python manage.py shell -c "from django.conf import settings; from accounts.yolo_inference import _load_runtime; print(_load_runtime(settings.YOLO_ARTIFACT_DIR.resolve()).provenance['id'])"
python manage.py createsuperuser
```

The first command should print `yolov8s-validator-v3`. The existing User model
defaults new users to the pending role, including users created by Django's
standard superuser command. After creation, run the following in the remote
shell and enter the same username to set its application role.

```bash
python manage.py shell -c "from accounts.models import User; u=User.objects.get(username=input('Superuser username: '), is_superuser=True); u.role='superadmin'; u.save(update_fields=['role'])"
```

Use `/admin/` to manage accounts and approve a researcher for the upload workflow.

## 6. Check the hosted application

Verify the landing page, login, researcher dashboard, a real image analysis,
representative HCC review, saving, map and Excel download. Confirm the review
identifies `yolov8s-validator-v3`. After a service restart, open a saved image
again to verify the volume configuration.

Set a budget limit and inspect memory usage during inference. This initial
configuration uses CPU inference and one model cache. Host performance must be
measured on the selected resources.

Password-reset email needs an SMTP provider. Configure `EMAIL_BACKEND` as
`django.core.mail.backends.smtp.EmailBackend`, along with `EMAIL_HOST`,
`EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` and
`DEFAULT_FROM_EMAIL`. Until SMTP is configured, email is written to application
logs by the console backend. Google sign-in needs its OAuth credentials and the
hosted callback URL registered with Google.

Submit the working HTTPS domain as the Live Hosted Application URL.

## Sources

- [Railway Django deployment](https://railway.com/guides/django)
- [Railway volumes and file uploads](https://docs.railway.com/volumes)
- [Railway public networking](https://docs.railway.com/networking/public-networking)
- [Django deployment settings](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/)
