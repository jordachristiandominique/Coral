"""Initialize mounted storage and the database, then serve the hosted application."""

import os
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent.parent
    os.chdir(root)
    sys.path.insert(0, str(root))
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coral_app.settings')

    import django
    django.setup()
    from django.conf import settings

    if not settings.RAILWAY_DEPLOYMENT:
        raise RuntimeError('Set DJANGO_DEPLOYMENT=railway before starting the hosted server.')
    settings.MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    settings.YOLO_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    for command in ('migrate', 'collectstatic'):
        subprocess.run([sys.executable, 'manage.py', command, '--noinput'], check=True)

    # One model cache and inference lock, with threads for ordinary web requests.
    os.execv(sys.executable, [
        sys.executable, '-m', 'gunicorn', 'coral_app.wsgi:application',
        '--bind', f"0.0.0.0:{os.environ.get('PORT', '8000')}",
        '--workers', '1', '--threads', '4', '--timeout', '180',
        '--access-logfile', '-', '--error-logfile', '-',
    ])


if __name__ == '__main__':
    main()
