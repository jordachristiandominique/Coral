"""Authenticated file delivery for the single-instance hosted deployment."""

import mimetypes
from pathlib import Path

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404
from django.shortcuts import redirect

from .models import DataRepository, Report, SurveyImage, User


@login_required(login_url='login')
def uploaded_media(request, path):
    if request.user.is_pending():
        return redirect('pending_approval')
    privileged = request.user.is_admin() or request.user.is_superadmin()
    if path.startswith('batch_images/'):
        records = SurveyImage.objects.filter(image=path, batch__trashed_at__isnull=True)
        if not privileged:
            records = records.filter(batch__in=DataRepository.objects.viewable_by(request.user))
    elif path.startswith('profile_photos/'):
        records = User.objects.filter(profile_photo=path)
    elif path.startswith('reports/'):
        records = Report.objects.filter(file=path)
        if not privileged:
            records = records.filter(user=request.user)
    else:
        raise Http404
    if not records.exists():
        raise Http404

    root = Path(settings.MEDIA_ROOT).resolve()
    file_path = (root / path).resolve()
    if not file_path.is_relative_to(root) or not file_path.is_file():
        raise Http404
    content_type = mimetypes.guess_type(file_path.name)[0]
    inline = content_type in {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
    try:
        file = file_path.open('rb')
    except OSError as exc:
        raise Http404 from exc
    response = FileResponse(file, content_type=content_type or 'application/octet-stream',
                            as_attachment=not inline, filename=file_path.name)
    response['Cache-Control'] = 'private, no-store'
    return response
