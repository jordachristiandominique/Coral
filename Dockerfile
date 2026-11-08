FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEPLOYMENT=railway \
    YOLO_CONFIG_DIR=/tmp/ultralytics \
    YOLO_AUTOINSTALL=false \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-inference.txt requirements-deploy.txt ./
RUN python -m pip install --no-cache-dir -r requirements-deploy.txt

COPY manage.py ./
COPY coral_app ./coral_app
COPY accounts ./accounts
COPY templates ./templates
COPY static ./static
COPY model_artifacts ./model_artifacts
COPY scripts/start_railway.py ./scripts/start_railway.py

CMD ["python", "scripts/start_railway.py"]
