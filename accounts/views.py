import csv
import json
import logging
from collections import Counter
from decimal import Decimal, InvalidOperation
from datetime import date
from io import BytesIO

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.cache import never_cache
from django.contrib.auth.views import PasswordResetView, PasswordResetConfirmView
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Count, Max, Q
from django.db.models.functions import TruncMonth
from django.db.models import Count, Avg
from django.http import HttpResponse, JsonResponse
from .forms import CustomUserCreationForm, LoginForm, CustomPasswordResetForm, CustomSetPasswordForm
from .forms import SurveyorTagsForm, surveyor_names_with_tags
from .models import (
    User, DataRepository, SurveyImage, Transect, Notification, POINT_CLASS_CODES,
    NATIONAL_HCC_AVERAGE, compute_coverage, classify_hcc, compute_site_hcc,
)
from .image_annotator import render_annotated_bytes
from . import yolo_inference
from .survey_validation import validate_quadrat_payload
from .representative_points import normalize_marker_class
from .visualization_data import composition_summary, COMPOSITION_COLORS


logger = logging.getLogger(__name__)

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
except Exception:
    canvas = None
    letter = None


def is_google_oauth_enabled():
    """Return True when Google OAuth is configured via settings env vars or SocialApp."""
    google_app_settings = settings.SOCIALACCOUNT_PROVIDERS.get('google', {}).get('APP', {})
    has_env_config = bool(google_app_settings.get('client_id') and google_app_settings.get('secret'))
    if has_env_config:
        return True

    try:
        from allauth.socialaccount.models import SocialApp
        return SocialApp.objects.filter(provider='google').exists()
    except Exception:
        return False


@require_http_methods(["GET", "POST"])
@csrf_protect
@never_cache
def register(request):
    """Handle user registration"""
    if request.user.is_authenticated:
        return redirect('pending_approval')

    google_oauth_enabled = is_google_oauth_enabled()
    
    if request.method == 'POST':
        form = CustomUserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            messages.success(
                request,
                'Registration successful! Your account is pending approval. '
                'Please wait for the administrator to review your registration.'
            )
            return redirect('login')
        else:
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f"{field}: {error}")
    else:
        form = CustomUserCreationForm()
    
    return render(request, 'accounts/register.html', {
        'form': form,
        'google_oauth_enabled': google_oauth_enabled,
    })


@require_http_methods(["GET", "POST"])
@csrf_protect
@never_cache
def login_view(request):
    """Handle user login"""
    if request.user.is_authenticated:
        if request.user.is_pending():
            logout(request)
            messages.info(request, 'Please sign in again while your account is pending approval.')
        elif request.user.is_superadmin():
            return redirect('admin:index')
        else:
            return redirect('researcher_dashboard')
    
    google_oauth_enabled = is_google_oauth_enabled()

    if request.method == 'POST':
        form = LoginForm(request.POST)
        if form.is_valid():
            email = form.cleaned_data['email']
            password = form.cleaned_data['password']
            
            try:
                user = User.objects.get(email=email)
                user = authenticate(request, username=user.username, password=password)
                
                if user is not None:
                    login(request, user)
                    
                    if user.is_pending():
                        messages.info(request, 'Your account is pending approval.')
                        return redirect('pending_approval')
                    elif user.is_superadmin():
                        messages.success(request, f'Welcome back, {user.get_full_name()}!')
                        return redirect('admin:index')
                    else:
                        messages.success(request, f'Welcome, {user.get_full_name()}!')
                        return redirect('researcher_dashboard')
                else:
                    messages.error(request, 'Invalid email or password.')
            except User.DoesNotExist:
                messages.error(request, 'Invalid email or password.')
    else:
        form = LoginForm()
    
    return render(request, 'accounts/login.html', {
        'form': form,
        'google_oauth_enabled': google_oauth_enabled,
    })


@login_required(login_url='login')
def logout_view(request):
    """Handle user logout"""
    logout(request)
    return redirect('landing_page')


@login_required(login_url='login')
@never_cache
def pending_approval(request):
    """Show pending approval page for users waiting approval"""
    if not request.user.is_pending():
        if request.user.is_superadmin():
            return redirect('admin:index')
        else:
            return redirect('researcher_dashboard')
    
    context = {
        'user': request.user
    }
    return render(request, 'accounts/pending_approval.html', context)


class CustomPasswordResetView(PasswordResetView):
    """Handle password reset request"""
    form_class = CustomPasswordResetForm
    template_name = 'accounts/password_reset.html'
    email_template_name = 'accounts/password_reset_email.html'
    subject_template_name = 'accounts/password_reset_subject.txt'
    success_url = reverse_lazy('password_reset_done')


class CustomPasswordResetConfirmView(PasswordResetConfirmView):
    """Handle password reset confirmation"""
    form_class = CustomSetPasswordForm
    template_name = 'accounts/password_reset_confirm.html'
    success_url = reverse_lazy('login')


def password_reset_done(request):
    """Show password reset done page"""
    return render(request, 'accounts/password_reset_done.html')


@login_required(login_url='login')
def researcher_dashboard(request):
    """Render the researcher monitoring workspace."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_superadmin():
        return redirect('admin:index')

    # All users (admin and researchers) see all survey data
    batches = DataRepository.objects.active().annotate(image_count=Count('images')).order_by('-survey_date')

    # Reuse the image pass for the saved-marker composition chart.
    composition_points = Counter()

    batches_with_coverage = []
    for batch in batches:
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)

        composition_points.update(all_point_classes)

        # Site HCC = mean of the transect means (transect = replicate).
        batch.avg_coverage = compute_site_hcc(batch)['site_percent']
        batches_with_coverage.append(batch)

    total_surveys = len(batches_with_coverage)

    # Calculate overall average coverage
    all_coverages = [b.avg_coverage for b in batches_with_coverage if b.avg_coverage is not None]
    avg_coverage = round(sum(all_coverages) / len(all_coverages), 1) if all_coverages else None

    # Calculate HCC category distribution (Licuanan 2020: A>44, B>33-44,
    # C>22-33, D 0-22). "Category A sites" = the top HCC tier.
    healthy_reefs = 0
    class_counts = {'A': 0, 'B': 0, 'C': 0, 'D': 0}
    for batch in batches_with_coverage:
        if batch.avg_coverage is None:
            continue
        cls = classify_hcc(batch.avg_coverage)
        class_counts[cls] += 1
        if cls == 'A':
            healthy_reefs += 1

    locations = batches.values('area_name').distinct().count()

    # Build recent submissions
    recent_submissions = []
    for batch in batches_with_coverage[:5]:
        coverage_value = batch.avg_coverage
        coverage_class = classify_hcc(coverage_value)

        recent_submissions.append({
            'id': batch.id,
            'name': batch.name,
            'area': batch.area_name,
            'date': batch.survey_date,
            'image_count': batch.image_count,
            'avg_coverage': coverage_value,
            'coverage_class': coverage_class,
        })

    benthic_distribution = composition_summary(composition_points)

    insight_total = class_counts['A'] + class_counts['B'] + class_counts['C'] + class_counts['D']
    insight_items = [
        {'label': 'Category A (>44%)', 'value': round((class_counts['A'] / insight_total) * 100, 0) if insight_total else 0},
        {'label': 'Category B (>33-44%)', 'value': round((class_counts['B'] / insight_total) * 100, 0) if insight_total else 0},
        {'label': 'Category C (>22-33%)', 'value': round((class_counts['C'] / insight_total) * 100, 0) if insight_total else 0},
        {'label': 'Category D (0-22%)', 'value': round((class_counts['D'] / insight_total) * 100, 0) if insight_total else 0},
    ]

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'total_surveys': total_surveys,
        'avg_coverage': avg_coverage,
        'healthy_reefs': healthy_reefs,
        'locations': locations,
        'recent_submissions': recent_submissions,
        'insight_total': round(avg_coverage, 1) if avg_coverage is not None else None,
        'insight_items': insight_items,
        'benthic_distribution': benthic_distribution,
        'benthic_chart': {
            'labels': [b['label'] for b in benthic_distribution],
            'values': [b['count'] for b in benthic_distribution],
            'colors': [b['color'] for b in benthic_distribution],
        },
    }
    return render(request, 'accounts/researcher_dashboard.html', context)


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _parse_decimal(value):
    if value is None or value == '':
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def _get_analysis_queryset(user):
    # All users (admin and researchers) see all survey data
    return DataRepository.objects.active()


def _coverage_class(coverage_value):
    if coverage_value is None:
        return 'Pending'
    return classify_hcc(coverage_value)


def _apply_analysis_filters(request, queryset):
    start_date = _parse_date(request.GET.get('start_date', '').strip())
    end_date = _parse_date(request.GET.get('end_date', '').strip())
    area = request.GET.get('area', '').strip()
    surveyor = request.GET.get('surveyor', '').strip()
    # Coverage class and min/max filters will be applied AFTER recalculation in _build_analysis_rows
    class_filter = request.GET.get('coverage_class', '').strip()
    min_coverage = _parse_decimal(request.GET.get('min_coverage', '').strip())
    max_coverage = _parse_decimal(request.GET.get('max_coverage', '').strip())

    # Apply basic filters at database level
    if start_date:
        queryset = queryset.filter(survey_date__gte=start_date)
    if end_date:
        queryset = queryset.filter(survey_date__lte=end_date)
    if area:
        queryset = queryset.filter(area_name__icontains=area)
    if surveyor:
        queryset = queryset.filter(surveyor_names__icontains=surveyor)

    queryset = queryset.annotate(image_count=Count('images'))

    filter_state = {
        'start_date': start_date.isoformat() if start_date else '',
        'end_date': end_date.isoformat() if end_date else '',
        'area': area,
        'surveyor': surveyor,
        'coverage_class': class_filter,
        'min_coverage': str(min_coverage) if min_coverage is not None else '',
        'max_coverage': str(max_coverage) if max_coverage is not None else '',
    }

    # Store coverage filters in filter_state for post-processing in analysis_results view
    filter_state['_class_filter'] = class_filter
    filter_state['_min_coverage'] = min_coverage
    filter_state['_max_coverage'] = max_coverage

    return queryset.order_by('-survey_date'), filter_state


def _build_analysis_rows(queryset):
    rows = []
    for batch in queryset:
        # Recalculate coverage from point_classes (HC+SC only)
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)

        composition = composition_summary(all_point_classes)
        benthic = {item['label']: item['value'] for item in composition} if all_point_classes else {}

        # Site HCC = mean of the transect means (transect = replicate); `se` is
        # the standard error across those transect means.
        site = compute_site_hcc(batch)
        coverage_value = site['site_percent'] if site['site_percent'] is not None else 0
        coverage_class = _coverage_class(coverage_value) if site['site_percent'] is not None else 'Pending'
        surveyor_display = (batch.surveyor_names or '').replace(',', '\n')
        rows.append({
            'id': batch.id,
            'name': batch.name,
            'survey_date': batch.survey_date,
            'area_name': batch.area_name,
            'surveyor_names': batch.surveyor_names,
            'surveyor_display': surveyor_display,
            'image_count': batch.image_count,
            'avg_coverage': coverage_value,
            'coverage_class': coverage_class,
            'se': site['se'],
            'n_transects': site['n_transects'],
            'benthic': benthic,
            'latitude': float(batch.latitude),
            'longitude': float(batch.longitude),
        })
    return rows


@login_required(login_url='login')
@never_cache
def analysis_results(request):
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_superadmin():
        return redirect('admin:index')

    base_queryset = _get_analysis_queryset(request.user)
    area_options = list(
        base_queryset.order_by('area_name').values_list('area_name', flat=True).distinct()
    )

    batches_queryset, filter_state = _apply_analysis_filters(request, base_queryset)
    rows = _build_analysis_rows(batches_queryset)
    
    # Apply coverage filters post-calculation (based on recalculated HC+SC coverage)
    class_filter = filter_state.get('_class_filter', '')
    min_coverage = filter_state.get('_min_coverage')
    max_coverage = filter_state.get('_max_coverage')
    
    if min_coverage is not None:
        rows = [r for r in rows if r['avg_coverage'] >= min_coverage]
    if max_coverage is not None:
        rows = [r for r in rows if r['avg_coverage'] <= max_coverage]
    
    if class_filter in ('A', 'B', 'C', 'D'):
        rows = [r for r in rows if r['coverage_class'] == class_filter]

    total_batches = len(rows)
    total_images = sum(row['image_count'] or 0 for row in rows)

    distribution = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'Pending': 0}
    for row in rows:
        distribution[row['coverage_class']] += 1

    # Monthly HCC uses the same filtered site means and categories as the charts.
    monthly_rows = {}
    for row in rows:
        key = row['survey_date'].replace(day=1)
        monthly_rows.setdefault(key, []).append(row)
    monthly_stats = []
    for month, month_rows in sorted(monthly_rows.items()):
        valid = [row for row in month_rows if row['coverage_class'] != 'Pending']
        average = round(sum(row['avg_coverage'] for row in valid) / len(valid), 1) if valid else None
        monthly_stats.append({
            'month': month.strftime('%b %Y'), 'batch_count': len(month_rows),
            'image_count': sum(row['image_count'] or 0 for row in month_rows),
            'avg_coverage': average,
            **{f'class_{category.lower()}_count': sum(row['coverage_class'] == category for row in valid)
               for category in ('A', 'B', 'C', 'D')},
        })

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'rows': rows,
        'total_batches': total_batches,
        'total_images': total_images,
        'distribution': distribution,
        'monthly_stats': monthly_stats,
        'chart_data': {
            'classes': [distribution['A'], distribution['B'], distribution['C'], distribution['D'], distribution['Pending']],
            'national_hcc_average': NATIONAL_HCC_AVERAGE,
            'composition_colors': COMPOSITION_COLORS,
        },
        'filter_state': filter_state,
        'area_options': area_options,
        'filter_query': request.GET.urlencode(),
    }
    return render(request, 'accounts/analysis_results.html', context)


@login_required(login_url='login')
@never_cache
def analysis_results_export_csv(request):
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_superadmin():
        return redirect('admin:index')

    base_queryset = _get_analysis_queryset(request.user)
    batch_id = request.GET.get('batch_id')
    if batch_id:
        base_queryset = base_queryset.filter(id=batch_id)

    batches_queryset, _ = _apply_analysis_filters(request, base_queryset)
    rows = _build_analysis_rows(batches_queryset)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="analysis_results.csv"'
    writer = csv.writer(response)
    writer.writerow([
        'Data Repository Name', 'Survey Date', 'Area', 'Survey By', 'Images', 'Avg Coverage', 'Class'
    ])
    for row in rows:
        writer.writerow([
            row['name'],
            row['survey_date'].isoformat(),
            row['area_name'],
            row['surveyor_names'],
            row['image_count'],
            f"{row['avg_coverage']:.1f}" if row['avg_coverage'] is not None else '',
            row['coverage_class'],
        ])

    return response


@login_required(login_url='login')
@never_cache
def analysis_results_export_pdf(request):
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_superadmin():
        return redirect('admin:index')

    if canvas is None:
        messages.error(request, 'PDF export is not available. Install reportlab to enable this feature.')
        return redirect('analysis_results')

    base_queryset = _get_analysis_queryset(request.user)
    batch_id = request.GET.get('batch_id')
    if batch_id:
        base_queryset = base_queryset.filter(id=batch_id)

    batches_queryset, _ = _apply_analysis_filters(request, base_queryset)
    rows = _build_analysis_rows(batches_queryset)

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    pdf.setFont('Helvetica-Bold', 14)
    pdf.drawString(40, height - 40, 'CoralSense Analysis Results')
    pdf.setFont('Helvetica', 10)
    pdf.drawString(40, height - 58, f"Generated: {timezone.localtime().strftime('%b %d, %Y %I:%M %p')}")

    y = height - 90
    pdf.setFont('Helvetica-Bold', 9)
    pdf.drawString(40, y, 'Data Repository')
    pdf.drawString(200, y, 'Date')
    pdf.drawString(270, y, 'Area')
    pdf.drawString(380, y, 'Coverage')
    pdf.drawString(450, y, 'Class')
    y -= 14
    pdf.setFont('Helvetica', 9)

    for row in rows:
        if y < 60:
            pdf.showPage()
            y = height - 60
        pdf.drawString(40, y, row['name'][:28])
        pdf.drawString(200, y, row['survey_date'].strftime('%Y-%m-%d'))
        pdf.drawString(270, y, row['area_name'][:20])
        coverage_text = f"{row['avg_coverage']:.1f}%" if row['avg_coverage'] is not None else '--'
        pdf.drawString(380, y, coverage_text)
        pdf.drawString(450, y, row['coverage_class'])
        y -= 12

    pdf.showPage()
    pdf.save()
    buffer.seek(0)

    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = 'attachment; filename="analysis_results.pdf"'
    return response


@login_required(login_url='login')
@never_cache
def batch_export_excel(request, batch_id):
    """Download a single batch as a CPCE-style coral-coverage Excel workbook."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_superadmin():
        return redirect('admin:index')

    batch = get_object_or_404(DataRepository.objects.viewable_by(request.user), id=batch_id)

    from .excel_export import build_batch_coverage_workbook, _safe_filename

    buffer = build_batch_coverage_workbook(batch)
    response = HttpResponse(
        buffer.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{_safe_filename(batch)}"'
    return response


@login_required(login_url='login')
@never_cache
def account_settings(request):
    """Self-service settings: edit profile info and manage a profile photo."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    user = request.user

    if request.method == 'POST':
        action = request.POST.get('action', '')

        if action == 'profile':
            first_name = request.POST.get('first_name', '').strip()
            last_name = request.POST.get('last_name', '').strip()
            username = request.POST.get('username', '').strip()

            if not username:
                messages.error(request, 'Username is required.')
            elif User.objects.exclude(pk=user.pk).filter(username__iexact=username).exists():
                messages.error(request, 'That username is already taken.')
            else:
                user.first_name = first_name
                user.last_name = last_name
                user.username = username
                # Email is the login identifier (allauth) and is left unchanged.
                user.save(update_fields=['first_name', 'last_name', 'username', 'updated_at'])
                messages.success(request, 'Profile updated.')

        elif action == 'photo':
            photo = request.FILES.get('profile_photo')
            if not photo:
                messages.error(request, 'Please choose an image to upload.')
            elif not (photo.content_type or '').startswith('image/'):
                messages.error(request, 'That file is not an image.')
            elif photo.size > 5 * 1024 * 1024:
                messages.error(request, 'Image must be 5 MB or smaller.')
            else:
                # Drop the previous file so replaced photos don't pile up on disk.
                if user.profile_photo:
                    user.profile_photo.delete(save=False)
                user.profile_photo = photo
                user.save(update_fields=['profile_photo', 'updated_at'])
                messages.success(request, 'Profile photo updated.')

        elif action == 'remove_photo':
            if user.profile_photo:
                user.profile_photo.delete(save=False)
                user.profile_photo = None
                user.save(update_fields=['profile_photo', 'updated_at'])
                messages.success(request, 'Profile photo removed.')

        elif action == 'password':
            # Change the signed-in user's password. Google-only accounts have no
            # usable password and don't see the form, so guard against it.
            if not user.has_usable_password():
                messages.error(request, 'Your password is managed by your Google sign-in.')
            else:
                form = PasswordChangeForm(user, request.POST)
                if form.is_valid():
                    form.save()
                    # Keep the current session valid so the user stays logged in.
                    update_session_auth_hash(request, form.user)
                    messages.success(request, 'Password updated.')
                else:
                    # Surface each validation error (wrong current password,
                    # mismatch, too short/common) as a toast.
                    for errors in form.errors.values():
                        for error in errors:
                            messages.error(request, error)

        return redirect('account_settings')

    return render(request, 'accounts/settings.html', {'profile_user': user})


@login_required(login_url='login')
@require_http_methods(["GET", "POST"])
@csrf_protect
def accept_researcher(request):
    """Allow admin to approve pending researcher accounts from the app interface."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_superadmin():
        return redirect('admin:index')

    # Only admin users can access this view
    if not request.user.is_admin():
        messages.error(request, 'Only administrators can access researcher approvals.')
        return redirect('researcher_dashboard')

    if request.method == 'POST':
        action = request.POST.get('action')
        user_id = request.POST.get('user_id')
        if user_id:
            if action == 'delete':
                try:
                    pending_user = User.objects.get(id=user_id, role='pending')
                    deleted_name = pending_user.get_full_name() or pending_user.email
                    pending_user.delete()
                    messages.success(request, f'{deleted_name} pending registration has been deleted.')
                except User.DoesNotExist:
                    messages.error(request, 'Pending user not found or already processed.')
            else:
                try:
                    pending_user = User.objects.get(id=user_id, role='pending')
                    pending_user.role = 'researcher'
                    pending_user.save(update_fields=['role', 'updated_at'])
                    Notification.objects.create(
                        recipient=pending_user,
                        verb='account_approved',
                        message='Your account has been approved — welcome to CoralSense!',
                        url=reverse('researcher_dashboard'),
                    )
                    messages.success(request, f'{pending_user.get_full_name() or pending_user.email} has been approved.')
                except User.DoesNotExist:
                    messages.error(request, 'Pending user not found or already processed.')

        return redirect('accept_researcher')

    pending_researchers = User.objects.filter(role='pending').order_by('date_joined')
    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'pending_researchers': pending_researchers,
    }
    return render(request, 'accounts/accept_researcher.html', context)


@login_required(login_url='login')
@require_http_methods(["POST"])
def notifications_mark_read(request):
    """Mark all of the current user's notifications as read (navbar bell)."""
    updated = request.user.notifications.filter(is_read=False).update(is_read=True)
    return JsonResponse({'ok': True, 'updated': updated})


@login_required(login_url='login')
def manage_users(request):
    """Allow admin to view and manage active users."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_superadmin():
        return redirect('admin:index')

    # Only admin users can access this view
    if not request.user.is_admin():
        messages.error(request, 'Only administrators can access user management.')
        return redirect('researcher_dashboard')

    # Get all users (researcher and admin roles) ordered by most recent
    users = User.objects.filter(role__in=['researcher', 'admin']).order_by('-date_joined')
    
    users = users.annotate(batch_count=Count('image_batches', filter=Q(image_batches__trashed_at__isnull=True), distinct=True))

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'users': users,
    }
    return render(request, 'accounts/manage_users.html', context)


@login_required(login_url='login')
@require_http_methods(["POST"])
def deactivate_user(request, user_id):
    """Deactivate a researcher or admin user."""
    if request.user.is_pending():
        return JsonResponse({'success': False, 'error': 'Your account is still pending approval.'}, status=403)

    if not request.user.is_admin():
        return JsonResponse({'success': False, 'error': 'Only administrators can deactivate users.'}, status=403)

    if int(user_id) == request.user.id:
        return JsonResponse({'success': False, 'error': 'You cannot deactivate your own account.'}, status=403)

    try:
        target_user = User.objects.get(id=user_id, role__in=['researcher', 'admin'])
        target_user.is_active = False
        target_user.save(update_fields=['is_active', 'updated_at'])
        return JsonResponse({
            'success': True,
            'message': f'{target_user.get_full_name() or target_user.email} has been deactivated.'
        })
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'User not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='login')
@require_http_methods(["POST"])
def activate_user(request, user_id):
    """Activate an inactive researcher or admin user."""
    if request.user.is_pending():
        return JsonResponse({'success': False, 'error': 'Your account is still pending approval.'}, status=403)

    if not request.user.is_admin():
        return JsonResponse({'success': False, 'error': 'Only administrators can activate users.'}, status=403)

    if int(user_id) == request.user.id:
        return JsonResponse({'success': False, 'error': 'You cannot activate your own account.'}, status=403)

    try:
        target_user = User.objects.get(id=user_id, role__in=['researcher', 'admin'])
        target_user.is_active = True
        target_user.save(update_fields=['is_active', 'updated_at'])
        return JsonResponse({
            'success': True,
            'message': f'{target_user.get_full_name() or target_user.email} has been activated.'
        })
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'User not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='login')
@csrf_protect
@require_http_methods(['POST'])
def analyze_survey_image(request):
    """Predict one unsaved image; all detections require researcher review."""
    if request.user.is_pending():
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')
    if not (request.user.is_researcher() or request.user.is_admin()):
        return JsonResponse({'success': False, 'code': 'forbidden', 'error': 'Access denied.'}, status=403)
    uploads = request.FILES.getlist('image')
    if len(uploads) != 1 or sum(len(request.FILES.getlist(key)) for key in request.FILES) != 1:
        return JsonResponse({'success': False, 'code': 'invalid_upload',
                             'error': 'Send exactly one image in the image field.'}, status=400)
    try:
        image = yolo_inference.read_image(uploads[0])
        try:
            return JsonResponse(yolo_inference.analyze_image(image))
        finally:
            image.close()
    except yolo_inference.InvalidImage as exc:
        return JsonResponse({'success': False, 'code': 'invalid_image', 'error': str(exc)},
                            status=413 if exc.too_large else 400)
    except yolo_inference.InferenceBusy:
        response = JsonResponse({'success': False, 'code': 'inference_busy',
                                 'error': 'Another image is being analysed. Retry shortly.'}, status=503)
        response['Retry-After'] = '1'
        return response
    except yolo_inference.ModelUnavailable:
        logger.exception('Local detection artifact could not be loaded.')
        return JsonResponse({'success': False, 'code': 'model_unavailable',
                             'error': 'Image analysis is unavailable. Contact the administrator.'}, status=503)
    except Exception:
        logger.exception('Image detection failed.')
        return JsonResponse({'success': False, 'code': 'inference_failed',
                             'error': 'Image analysis failed. Please retry.'}, status=500)


@login_required(login_url='login')
def upload_batch(request):
    """Render upload new batch interface for researchers."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')

    if request.method == 'POST':
        images = request.FILES.getlist('images')

        # Append mode: add one transect to an existing site. Admins may append to
        # any site (parity with batch_detail); researchers only to their own.
        existing_batch_id = request.POST.get('existing_batch_id', '').strip()
        existing_batch = None
        if existing_batch_id:
            append_filter = {'id': existing_batch_id}
            if not request.user.is_admin():
                append_filter['user'] = request.user
            existing_batch = DataRepository.objects.active().filter(**append_filter).first()
            if existing_batch is None:
                messages.error(request, 'That site was not found. Please start a new site.')
                return redirect('upload_batch')

        errors = []
        if not images:
            errors.append('Please upload at least one image.')

        # A site has ONE location, shared by all its transects. Coordinates and
        # site metadata are entered/validated only when creating a NEW site;
        # when appending a transect they come from the existing site.
        if existing_batch is None:
            latitude_raw = request.POST.get('latitude', '').strip()
            longitude_raw = request.POST.get('longitude', '').strip()
            if not latitude_raw or not longitude_raw:
                errors.append('Latitude and longitude are required.')
            try:
                latitude = Decimal(latitude_raw)
                longitude = Decimal(longitude_raw)
            except (InvalidOperation, TypeError):
                latitude = None
                longitude = None
                errors.append('Latitude or longitude is invalid.')

            batch_name = request.POST.get('batch_name', '').strip()
            survey_date = request.POST.get('survey_date', '').strip()
            surveyor_names = request.POST.get('surveyor_names', '').strip()
            surveyor_form = SurveyorTagsForm(request.POST)
            if not surveyor_form.is_valid():
                for field_errors in surveyor_form.errors.values():
                    errors.extend(field_errors)
            else:
                surveyor_names = surveyor_names_with_tags(surveyor_names, surveyor_form.cleaned_data['surveyor_ids'])
            area_name = request.POST.get('area_name', '').strip()
            if not batch_name:
                errors.append('Data repository name is required.')
            if not survey_date:
                errors.append('Survey date is required.')
            if not surveyor_names:
                errors.append('Survey by is required.')
            if not area_name:
                errors.append('Area name is required.')
        else:
            # Appending: reuse the site's single location for the new transect.
            latitude = existing_batch.latitude
            longitude = existing_batch.longitude

        # Where to return on validation failure (keep the active site if appending).
        redirect_target = (
            f"{reverse('upload_batch')}?site={existing_batch.id}"
            if existing_batch is not None else 'upload_batch'
        )

        if errors:
            for error in errors:
                messages.error(request, error)
            return redirect(redirect_target)

        quadrat_payloads = []
        for index in range(1, len(images) + 1):
            raw_payload = request.POST.get(f'image_quadrat_{index}', '')
            if not raw_payload:
                messages.error(request, f'Quadrat data missing for image {index}.')
                return redirect(redirect_target)
            try:
                parsed = json.loads(raw_payload)
            except json.JSONDecodeError:
                messages.error(request, f'Quadrat data is invalid for image {index}.')
                return redirect(redirect_target)

            try:
                validate_quadrat_payload(parsed)
            except ValueError as exc:
                messages.error(request, f'Image {index}: {exc}')
                return redirect(redirect_target)

            quadrat_payloads.append(parsed)

        with transaction.atomic():
            if existing_batch is not None:
                batch = get_object_or_404(
                    DataRepository.objects.active().select_for_update(), **append_filter,
                )
            else:
                batch = DataRepository.objects.create(
                    user=request.user,
                    name=batch_name,
                    survey_date=survey_date,
                    surveyor_names=surveyor_names,
                    area_name=area_name,
                    latitude=latitude,
                    longitude=longitude,
                )
                batch.surveyors.set(surveyor_form.cleaned_data['surveyor_ids'])

            # One transect per submit, appended after any existing transects.
            # All transects in a site share the site's single location.
            number = (batch.transects.aggregate(m=Max('number'))['m'] or 0) + 1
            label = request.POST.get('transect_label', '').strip() or f'Transect {number}'
            transect = Transect.objects.create(
                batch=batch, number=number, label=label,
                latitude=batch.latitude, longitude=batch.longitude,
            )

            for index, image in enumerate(images, start=1):
                description = request.POST.get(f'image_description_{index}', '').strip()
                payload = quadrat_payloads[index - 1]
                point_classes = payload.get('point_classes') or []

                # Hard Coral Cover (HCC): Hard Coral points only / total points
                coverage = compute_coverage(point_classes)
                coverage_percent = Decimal(str(coverage['percent'])).quantize(Decimal('0.01'))
                coverage_class = coverage['coverage_class']

                SurveyImage.objects.create(
                    batch=batch,
                    transect=transect,
                    image=image,
                    description=description,
                    quadrat_rect=payload.get('rect'),
                    quadrat_points=payload.get('points'),
                    point_classes=point_classes,
                    analysis_review=payload.get('analysis') or {},
                    coverage_percent=coverage_percent,
                    coverage_category=coverage_class,
                )

            # Cache this transect's mean HCC (mean of its images) + category.
            site = compute_site_hcc(batch)
            data = next((t for t in site['transects'] if t['number'] == number), None)
            if data and data['percent'] is not None:
                transect.coverage_percent = Decimal(str(data['percent']))
                transect.coverage_category = data['coverage_class'] or ''
                transect.save(update_fields=['coverage_percent', 'coverage_category'])

        messages.success(
            request,
            f'Transect {number} saved. Add the next transect for this site, or click "Start new site".'
        )
        return redirect(f"{reverse('upload_batch')}?site={batch.id}")

    # GET: if returning to add another transect, load the active site to pre-fill.
    active_site = None
    site_id = request.GET.get('site')
    if site_id:
        active_filter = {'id': site_id}
        if not request.user.is_admin():
            active_filter['user'] = request.user
        site = DataRepository.objects.active().filter(**active_filter).first()
        if site:
            next_number = (site.transects.aggregate(m=Max('number'))['m'] or 0) + 1
            # All transects share the site's single location, so the coordinates
            # for the transect being added are just the site's (locked).
            active_site = {
                'id': site.id,
                'name': site.name,
                'area_name': site.area_name,
                'survey_date': site.survey_date.isoformat() if site.survey_date else '',
                'surveyor_names': site.surveyor_names,
                'latitude': site.latitude,
                'longitude': site.longitude,
                'transect_count': site.transects.count(),
                'next_number': next_number,
            }

    context = {
        'active_site': active_site,
        'surveyor_form': SurveyorTagsForm(initial={'surveyor_ids': [request.user.pk]}),
        'user': request.user,
        'generated_at': timezone.now(),
        'today': timezone.localdate(),
        'user_full_name': request.user.get_full_name() or request.user.username,
        'survey_points': list(
            DataRepository.objects.active().values(
                'name',
                'latitude',
                'longitude',
                'survey_date',
                'surveyor_names',
                'user__first_name',
                'user__last_name',
                'user__username',
            )
        ),
    }
    return render(request, 'accounts/upload_batch.html', context)


@login_required(login_url='login')
def batches(request):
    """List repositories owned by or shared with the current researcher."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')

    # Include repositories shared with the researcher through account tags.
    batches_qs = DataRepository.objects.viewable_by(request.user)
    if request.user.is_admin():
        batches_qs = batches_qs.filter(
            Q(user=request.user) | Q(pk__in=request.user.shared_repositories.values('pk')),
        )
    
    batches_qs = batches_qs.annotate(
        image_count=Count('images')
    )

    for batch in batches_qs:
        # Site HCC = mean of the transect means (transect = replicate).
        site = compute_site_hcc(batch)
        batch.avg_coverage = site['site_percent']
        batch.coverage_class = site['coverage_class']
        batch.transect_count = batch.transects.count()

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'batches': batches_qs,
        'batch_type': 'my_batches',
    }
    return render(request, 'accounts/batches.html', context)


@login_required(login_url='login')
def all_batches(request):
    """Render all batches list UI (Admin only - All Batches)."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')
    
    # Only admin users can view all batches
    if not request.user.is_admin():
        messages.error(request, 'You do not have permission to view all data repositories.')
        return redirect('batches')
    
    batches_qs = DataRepository.objects.active()
    
    batches_qs = batches_qs.annotate(
        image_count=Count('images')
    )

    for batch in batches_qs:
        # Site HCC = mean of the transect means (transect = replicate).
        site = compute_site_hcc(batch)
        batch.avg_coverage = site['site_percent']
        batch.coverage_class = site['coverage_class']
        batch.transect_count = batch.transects.count()

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'batches': batches_qs,
        'batch_type': 'all_batches',
    }
    return render(request, 'accounts/all_batches.html', context)


@login_required(login_url='login')
@require_http_methods(['POST'])
def batch_map_visibility(request, batch_id):
    """Set a repository's saved map visibility for its owner or an administrator."""
    if request.user.is_pending():
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')
    visibility = request.POST.get('is_map_visible')
    if visibility not in ('true', 'false'):
        return HttpResponse('Choose a valid map visibility.', status=400)
    repositories = DataRepository.objects.active()
    if not request.user.is_admin():
        repositories = repositories.filter(user=request.user)
    with transaction.atomic():
        repository = get_object_or_404(repositories.select_for_update(), pk=batch_id)
        repository.is_map_visible = visibility == 'true'
        repository.save(update_fields=['is_map_visible'])
    state = 'shown on maps' if repository.is_map_visible else 'hidden from maps'
    messages.success(request, f'Data repository "{repository.name}" is now {state}.')
    destination = 'all_batches' if request.user.is_admin() and request.POST.get('return_to') == 'all_batches' else 'batches'
    return redirect(destination)


@login_required(login_url='login')
@require_http_methods(['POST'])
def batch_delete(request, batch_id):
    """Move a repository to Trash while preserving its images and results."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')

    repositories = DataRepository.objects.active()
    if not request.user.is_admin():
        repositories = repositories.filter(user=request.user)
    with transaction.atomic():
        repository = get_object_or_404(repositories.select_for_update(), pk=batch_id)
        name = repository.name
        repository.trashed_at = timezone.now()
        repository.save(update_fields=['trashed_at'])

    messages.success(request, f'Data repository "{name}" moved to trash.')
    destination = 'all_batches' if request.user.is_admin() and request.POST.get('return_to') == 'all_batches' else 'batches'
    return redirect(destination)


@login_required(login_url='login')
def repository_trash(request):
    if request.user.is_pending():
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')
    repositories = DataRepository.objects.trashed()
    if not request.user.is_admin():
        repositories = repositories.filter(user=request.user)
    repositories = repositories.select_related('user').annotate(
        image_count=Count('images', distinct=True),
        transect_count=Count('transects', distinct=True),
    ).order_by('-trashed_at')
    return render(request, 'accounts/repository_trash.html', {'batches': repositories})


@login_required(login_url='login')
@require_http_methods(['POST'])
def repository_trash_action(request, batch_id):
    if request.user.is_pending():
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')
    action = request.POST.get('action')
    if action not in ('restore', 'delete'):
        return HttpResponse('Unknown trash action.', status=400)
    repositories = DataRepository.objects.trashed()
    if not request.user.is_admin():
        repositories = repositories.filter(user=request.user)
    with transaction.atomic():
        repository = get_object_or_404(repositories.select_for_update(), pk=batch_id)
        name = repository.name
        if action == 'restore':
            repository.trashed_at = None
            repository.save(update_fields=['trashed_at'])
            messages.success(request, f'Data repository "{name}" restored.')
            return redirect('repository_trash')

        filenames = list(repository.images.values_list('image', flat=True).distinct())
        storage = SurveyImage._meta.get_field('image').storage
        repository.delete()

        def delete_uploaded_files():
            for filename in filenames:
                if not filename or SurveyImage.objects.filter(image=filename).exists():
                    continue
                try:
                    storage.delete(filename)
                except OSError:
                    logger.exception('Could not remove deleted repository image %s', filename)
                    messages.warning(request, 'A deleted repository image could not be removed from storage.')

        transaction.on_commit(delete_uploaded_files)

    messages.success(request, f'Data repository "{name}" permanently deleted.')
    return redirect('repository_trash')


@login_required(login_url='login')
def map_view(request):
    """Render interactive map view with survey locations."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    # All users (admin and researchers) see all survey data
    batches_qs = DataRepository.objects.active().filter(is_map_visible=True)
    
    batches_qs = batches_qs.annotate(image_count=Count('images'))

    # Recalculate coverage from point_classes for each batch
    for batch in batches_qs:
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)
        
        class_breakdown_pct = {item['label']: item['value'] for item in composition_summary(all_point_classes)}

        batch.class_breakdown = class_breakdown_pct
        
        # Site HCC = mean of the transect means (transect = replicate).
        site = compute_site_hcc(batch)
        batch.avg_coverage = site['site_percent']

        # Determine dominant coral type
        hard_coral_pct = class_breakdown_pct.get('Hard Coral', 0)
        soft_coral_pct = class_breakdown_pct.get('Soft Coral', 0)
        batch.dominant_coral_type = 'mixed'
        if hard_coral_pct > soft_coral_pct:
            batch.dominant_coral_type = 'hard'
        elif soft_coral_pct > hard_coral_pct:
            batch.dominant_coral_type = 'soft'

        # Determine HCC category
        batch.coverage_class = site['coverage_class']

    # Convert batches to GeoJSON format for map
    features = []
    for batch in batches_qs:
        features.append({
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [float(batch.longitude), float(batch.latitude)],
            },
            'properties': {
                'id': batch.id,
                'name': batch.name,
                'area': batch.area_name,
                'surveyDate': batch.survey_date.isoformat(),
                'createdAt': batch.created_at.isoformat(),
                'uploadedBy': batch.user.get_full_name() or batch.user.username,
                'surveyors': batch.surveyor_names,
                'imageCount': batch.image_count,
                'coverage': float(batch.avg_coverage) if batch.avg_coverage is not None else None,
                'coverageClass': batch.coverage_class or 'Pending',
                'classBreakdown': batch.class_breakdown,
                'dominantCoralType': batch.dominant_coral_type,
                'hardCoralPct': batch.class_breakdown.get('Hard Coral', 0),
                'softCoralPct': batch.class_breakdown.get('Soft Coral', 0),
            }
        })

    geojson_data = {
        'type': 'FeatureCollection',
        'features': features
    }

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'batches': batches_qs,
        'geojson_data': json.dumps(geojson_data),
        'total_batches': batches_qs.count(),
    }
    return render(request, 'accounts/map_view.html', context)


@login_required(login_url='login')
@login_required
def batch_image_annotated(request, image_id):
    """Serve a survey photo with the quadrat and numbered CPCE points drawn in.

    Rendered on demand so it always reflects the current point data.
    """
    if request.user.is_pending():
        return HttpResponse('Account pending approval.', status=403)

    image = get_object_or_404(
        SurveyImage, id=image_id, batch__in=DataRepository.objects.viewable_by(request.user),
    )

    # ?w=<px> serves a downscaled render (thumbnails); ?plain=1 omits markers
    try:
        max_width = int(request.GET.get('w', 1600))
    except (TypeError, ValueError):
        max_width = 1600
    max_width = max(120, min(max_width, 2400))
    annotate = request.GET.get('plain') != '1'
    # ?labels=code draws the benthic substrate code (HC/MA/...) at each point
    # instead of the point number.
    label_mode = 'code' if request.GET.get('labels') == 'code' else 'number'

    try:
        payload = render_annotated_bytes(image, max_width=max_width, annotate=annotate,
                                         label_mode=label_mode)
    except (FileNotFoundError, OSError):
        # Original file missing/unreadable — fall back to the stored image
        return redirect(image.image.url)

    response = HttpResponse(payload, content_type='image/jpeg')
    response['Cache-Control'] = 'private, no-store'
    return response


@login_required(login_url='login')
def batch_detail(request, batch_id):
    """Show uploaded images and metadata for a single batch."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')

    batch = get_object_or_404(DataRepository.objects.viewable_by(request.user), id=batch_id)
    can_manage = request.user.is_admin() or batch.user_id == request.user.pk
    surveyor_form = SurveyorTagsForm(
        request.POST if request.method == 'POST' else None,
        initial={'surveyor_ids': list(batch.surveyors.values_list('pk', flat=True))},
    )
    images = batch.images.all()

    if request.method == 'POST':
        if not can_manage:
            return HttpResponse('You have viewing access to this repository.', status=403)
        batch_name = request.POST.get('name', '').strip()
        survey_date = request.POST.get('survey_date', '').strip()
        area_name = request.POST.get('area_name', '').strip()
        surveyor_names = request.POST.get('surveyor_names', '').strip()
        latitude_raw = request.POST.get('latitude', '').strip()
        longitude_raw = request.POST.get('longitude', '').strip()

        errors = []

        tags_submitted = 'surveyor_tags_present' in request.POST or 'surveyor_ids' in request.POST
        if tags_submitted:
            if surveyor_form.is_valid():
                surveyor_names = surveyor_names_with_tags(surveyor_names, surveyor_form.cleaned_data['surveyor_ids'])
            else:
                for field_errors in surveyor_form.errors.values():
                    errors.extend(field_errors)

        if not batch_name:
            errors.append('Data repository name is required.')
        if not survey_date:
            errors.append('Survey date is required.')
        if not area_name:
            errors.append('Area name is required.')
        if not surveyor_names:
            errors.append('Survey by is required.')

        try:
            latitude = Decimal(latitude_raw)
            longitude = Decimal(longitude_raw)
        except (InvalidOperation, TypeError):
            latitude = None
            longitude = None

        if latitude is None or longitude is None:
            errors.append('Latitude and longitude must be valid numbers.')

        if errors:
            for error in errors:
                messages.error(request, error)
        else:
            with transaction.atomic():
                editable = DataRepository.objects.active().filter(pk=batch.pk)
                if not request.user.is_admin():
                    editable = editable.filter(user=request.user)
                batch = get_object_or_404(editable.select_for_update())
                batch.name = batch_name
                batch.survey_date = survey_date
                batch.area_name = area_name
                batch.surveyor_names = surveyor_names
                batch.latitude = latitude
                batch.longitude = longitude
                batch.save(update_fields=[
                    'name',
                    'survey_date',
                    'area_name',
                    'surveyor_names',
                    'latitude',
                    'longitude',
                ])
                if tags_submitted:
                    batch.surveyors.set(surveyor_form.cleaned_data['surveyor_ids'])

                for image in images:
                    desc = request.POST.get(f'image_desc_{image.id}', '').strip()
                    if desc != image.description:
                        image.description = desc
                        image.save(update_fields=['description'])

            messages.success(request, 'Data repository updated successfully.')
            return redirect('batch_detail', batch_id=batch.id)

    # Site-level HCC: mean of the transect means, with SE across transects.
    # This is the headline number and the source of the A-D category.
    site = compute_site_hcc(batch)
    transect_labels = {t.id: (t.label or f'Transect {t.number}') for t in batch.transects.all()}

    # Batch-level pooled breakdown kept for the "show the CPCE math" formula.
    all_point_classes = []
    for image in images:
        if image.point_classes:
            all_point_classes.extend(image.point_classes)
    batch_coverage = compute_coverage(all_point_classes)
    coral_coverage = batch_coverage['percent'] or 0

    # Attach a display-ready per-point legend (number + CPCE code + class name),
    # a per-image coverage breakdown, and the image's transect label.
    images = list(images)
    for image in images:
        image.point_rows = [
            {
                'number': index,
                'code': POINT_CLASS_CODES.get(normalize_marker_class(class_name), '--'),
                'name': normalize_marker_class(class_name) or 'Other Substrate',
            }
            for index, class_name in enumerate(image.point_classes or [], start=1)
        ]
        image.coverage_breakdown = compute_coverage(image.point_classes)
        image.transect_label = transect_labels.get(image.transect_id, '')
        image.filename = image.image.name.split('/')[-1] if image.image else 'Image'

    # Group images by transect for the tabbed Uploaded Images viewer.
    transect_groups = []
    group_by_id = {}
    for t in batch.transects.all():
        group = {'number': t.number, 'label': t.label or f'Transect {t.number}', 'images': []}
        group_by_id[t.id] = group
        transect_groups.append(group)
    unassigned = {'number': None, 'label': 'Unassigned', 'images': []}
    for image in images:
        group_by_id.get(image.transect_id, unassigned)['images'].append(image)
    if unassigned['images']:
        transect_groups.append(unassigned)
    transect_groups = [g for g in transect_groups if g['images']]

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'batch': batch,
        'can_manage_repository': can_manage,
        'surveyor_form': surveyor_form,
        'images': images,
        'transect_groups': transect_groups,
        'avg_coverage': site['site_percent'],
        'coverage_class': site['coverage_class'],
        'site_hcc': site,
        'point_classes_json': json.dumps({f'image-{img.id}': [normalize_marker_class(name) for name in img.point_classes or []] for img in images}),
        'coral_coverage': coral_coverage,
        'batch_coverage': batch_coverage,
    }
    return render(request, 'accounts/batch_detail.html', context)


@login_required(login_url='login')
def reports(request):
    """Send existing report-page bookmarks to repository Excel downloads."""
    if request.user.is_pending():
        return redirect('pending_approval')
    if request.user.is_superadmin():
        return redirect('admin:index')
    messages.info(request, 'Download Excel results from a data repository.')
    return redirect('batches')
