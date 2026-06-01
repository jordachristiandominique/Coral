import csv
import json
from decimal import Decimal, InvalidOperation
from datetime import date
from io import BytesIO

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.cache import never_cache
from django.contrib.auth.views import PasswordResetView, PasswordResetConfirmView
from django.urls import reverse_lazy
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncMonth
from django.db.models import Count, Avg
from django.http import HttpResponse, JsonResponse
from .forms import CustomUserCreationForm, LoginForm, CustomPasswordResetForm, CustomSetPasswordForm
from .models import User, ImageBatch, BatchImage, Report
from .report_generator import ReportGenerator

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

    if request.user.is_admin():
        batches = ImageBatch.objects.all().annotate(image_count=Count('images')).order_by('-survey_date')
    else:
        batches = ImageBatch.objects.filter(user=request.user).annotate(image_count=Count('images')).order_by('-survey_date')

    # Recalculate coverage from point_classes for each batch (HC+SC only)
    batches_with_coverage = []
    for batch in batches:
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)
        
        # Calculate coral coverage (Hard Coral + Soft Coral only)
        coral_classes = ['Hard Coral', 'Soft Coral']
        coral_count = sum(1 for pc in all_point_classes if pc in coral_classes)
        batch.avg_coverage = round((coral_count / len(all_point_classes)) * 100) if all_point_classes else None
        batches_with_coverage.append(batch)

    # Get total images count
    if request.user.is_admin():
        total_images = BatchImage.objects.count()
    else:
        total_images = BatchImage.objects.filter(batch__user=request.user).count()

    # Calculate overall average coverage
    all_coverages = [b.avg_coverage for b in batches_with_coverage if b.avg_coverage is not None]
    avg_coverage = round(sum(all_coverages) / len(all_coverages), 1) if all_coverages else None

    # Calculate class distribution
    healthy_reefs = 0
    class_counts = {'A': 0, 'B': 0, 'C': 0}
    for batch in batches_with_coverage:
        if batch.avg_coverage is None:
            continue
        if batch.avg_coverage >= 60:
            class_counts['A'] += 1
            healthy_reefs += 1
        elif batch.avg_coverage >= 40:
            class_counts['B'] += 1
        else:
            class_counts['C'] += 1

    locations = batches.values('area_name').distinct().count()

    # Build chart data (monthly trend)
    chart_labels = []
    chart_values = []
    months_data = {}
    for batch in batches_with_coverage:
        if batch.avg_coverage is None:
            continue
        month_key = batch.survey_date.strftime('%b')
        if month_key not in months_data:
            months_data[month_key] = []
        months_data[month_key].append(batch.avg_coverage)
    
    for month_key in sorted(months_data.keys()):
        chart_labels.append(month_key)
        chart_values.append(round(sum(months_data[month_key]) / len(months_data[month_key]), 0))

    # Build recent submissions
    recent_submissions = []
    for batch in batches_with_coverage[:5]:
        coverage_value = batch.avg_coverage
        if coverage_value is None:
            coverage_class = None
        elif coverage_value >= 60:
            coverage_class = 'A'
        elif coverage_value >= 40:
            coverage_class = 'B'
        else:
            coverage_class = 'C'

        recent_submissions.append({
            'id': batch.id,
            'name': batch.name,
            'area': batch.area_name,
            'date': batch.survey_date,
            'image_count': batch.image_count,
            'avg_coverage': coverage_value,
            'coverage_class': coverage_class,
        })

    insight_total = class_counts['A'] + class_counts['B'] + class_counts['C']
    insight_items = [
        {'label': 'Class A', 'value': round((class_counts['A'] / insight_total) * 100, 0) if insight_total else 0},
        {'label': 'Class B', 'value': round((class_counts['B'] / insight_total) * 100, 0) if insight_total else 0},
        {'label': 'Class C', 'value': round((class_counts['C'] / insight_total) * 100, 0) if insight_total else 0},
    ]

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'total_images': total_images,
        'avg_coverage': avg_coverage,
        'healthy_reefs': healthy_reefs,
        'locations': locations,
        'recent_submissions': recent_submissions,
        'chart_data': {
            'labels': chart_labels,
            'values': chart_values,
        },
        'insight_total': round(avg_coverage, 1) if avg_coverage is not None else None,
        'insight_items': insight_items,
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
    if user.is_admin():
        return ImageBatch.objects.all()
    return ImageBatch.objects.filter(user=user)


def _coverage_class(coverage_value):
    if coverage_value is None:
        return 'Pending'
    if coverage_value >= 60:
        return 'A'
    if coverage_value >= 40:
        return 'B'
    return 'C'


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
        
        # Calculate coral coverage (Hard Coral + Soft Coral only)
        coral_classes = ['Hard Coral', 'Soft Coral']
        coral_count = sum(1 for pc in all_point_classes if pc in coral_classes)
        coverage_value = round((coral_count / len(all_point_classes)) * 100) if all_point_classes else 0
        
        coverage_class = _coverage_class(coverage_value)
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
    
    if class_filter == 'A':
        rows = [r for r in rows if r['avg_coverage'] >= 60]
    elif class_filter == 'B':
        rows = [r for r in rows if 40 <= r['avg_coverage'] < 60]
    elif class_filter == 'C':
        rows = [r for r in rows if r['avg_coverage'] < 40]

    total_batches = len(rows)
    total_images = sum(row['image_count'] or 0 for row in rows)

    distribution = {'A': 0, 'B': 0, 'C': 0, 'Pending': 0}
    for row in rows:
        distribution[row['coverage_class']] += 1

    batch_ids = [row['id'] for row in rows]
    chart_rows = (
        BatchImage.objects
        .filter(batch_id__in=batch_ids, coverage_percent__isnull=False)
        .annotate(month=TruncMonth('batch__survey_date'))
        .values('month')
        .annotate(avg=Avg('coverage_percent'))
        .order_by('month')
    )

    chart_labels = []
    chart_values = []
    for row in chart_rows:
        month = row.get('month')
        if not month:
            continue
        chart_labels.append(month.strftime('%b %Y'))
        chart_values.append(round(float(row.get('avg') or 0), 1))

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'rows': rows,
        'total_batches': total_batches,
        'total_images': total_images,
        'distribution': distribution,
        'chart_data': {
            'labels': chart_labels,
            'values': chart_values,
            'classes': [distribution['A'], distribution['B'], distribution['C'], distribution['Pending']],
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
        'Batch Name', 'Survey Date', 'Area', 'Surveyors', 'Images', 'Avg Coverage', 'Class'
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
    pdf.drawString(40, height - 58, f"Generated: {timezone.now().strftime('%b %d, %Y %I:%M %p')}")

    y = height - 90
    pdf.setFont('Helvetica-Bold', 9)
    pdf.drawString(40, y, 'Batch')
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
    
    # Annotate with batch and report counts
    users = users.annotate(
        batch_count=Count('image_batches', distinct=True),
        report_count=Count('reports', distinct=True)
    )

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
def upload_batch(request):
    """Render upload new batch interface for researchers."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.method == 'POST':
        batch_name = request.POST.get('batch_name', '').strip()
        survey_date = request.POST.get('survey_date', '').strip()
        surveyor_names = request.POST.get('surveyor_names', '').strip()
        area_name = request.POST.get('area_name', '').strip()
        latitude_raw = request.POST.get('latitude', '').strip()
        longitude_raw = request.POST.get('longitude', '').strip()
        images = request.FILES.getlist('images')

        errors = []
        if not batch_name:
            errors.append('Batch name is required.')
        if not survey_date:
            errors.append('Survey date is required.')
        if not surveyor_names:
            errors.append('Surveyor name(s) are required.')
        if not area_name:
            errors.append('Area name is required.')
        if not latitude_raw or not longitude_raw:
            errors.append('Latitude and longitude are required.')
        if not images:
            errors.append('Please upload at least one image.')

        try:
            latitude = Decimal(latitude_raw)
            longitude = Decimal(longitude_raw)
        except (InvalidOperation, TypeError):
            latitude = None
            longitude = None
            errors.append('Latitude or longitude is invalid.')

        if errors:
            for error in errors:
                messages.error(request, error)
            return redirect('upload_batch')

        quadrat_payloads = []
        for index in range(1, len(images) + 1):
            raw_payload = request.POST.get(f'image_quadrat_{index}', '')
            if not raw_payload:
                messages.error(request, f'Quadrat data missing for image {index}.')
                return redirect('upload_batch')
            try:
                parsed = json.loads(raw_payload)
            except json.JSONDecodeError:
                messages.error(request, f'Quadrat data is invalid for image {index}.')
                return redirect('upload_batch')

            rect = parsed.get('rect')
            points = parsed.get('points')
            point_classes = parsed.get('point_classes')
            if not rect or not points:
                messages.error(request, f'Quadrat data is incomplete for image {index}.')
                return redirect('upload_batch')
            if not isinstance(point_classes, list) or len(point_classes) != len(points):
                messages.error(request, f'Point classes are incomplete for image {index}.')
                return redirect('upload_batch')
            if any(not value for value in point_classes):
                messages.error(request, f'Please classify all points for image {index}.')
                return redirect('upload_batch')

            quadrat_payloads.append(parsed)

        with transaction.atomic():
            batch = ImageBatch.objects.create(
                user=request.user,
                name=batch_name,
                survey_date=survey_date,
                surveyor_names=surveyor_names,
                area_name=area_name,
                latitude=latitude,
                longitude=longitude,
            )

            for index, image in enumerate(images, start=1):
                description = request.POST.get(f'image_description_{index}', '').strip()
                payload = quadrat_payloads[index - 1]
                point_classes = payload.get('point_classes') or []
                
                # Count coral coverage: Only Hard Coral + Soft Coral
                coral_classes = ['Hard Coral', 'Soft Coral']
                coral_count = sum(1 for value in point_classes if value in coral_classes)
                total_points = len(point_classes) or 1
                coverage_percent = (Decimal(coral_count) * Decimal('100') / Decimal(total_points)).quantize(Decimal('0.01'))
                
                if coverage_percent >= Decimal('60'):
                    coverage_class = 'A'
                elif coverage_percent >= Decimal('40'):
                    coverage_class = 'B'
                else:
                    coverage_class = 'C'

                BatchImage.objects.create(
                    batch=batch,
                    image=image,
                    description=description,
                    quadrat_rect=payload.get('rect'),
                    quadrat_points=payload.get('points'),
                    point_classes=point_classes,
                    coverage_percent=coverage_percent,
                    coverage_class=coverage_class,
                )

        messages.success(request, 'Batch uploaded successfully.')
        return redirect('batches')

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'today': timezone.localdate(),
        'user_full_name': request.user.get_full_name() or request.user.username,
        'survey_points': list(
            ImageBatch.objects.values(
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
    """Render researcher's own batches list UI (My Batches)."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    # Always show only the logged-in user's batches
    batches_qs = ImageBatch.objects.filter(user=request.user)
    
    batches_qs = batches_qs.annotate(
        image_count=Count('images')
    )

    for batch in batches_qs:
        # Recalculate coral coverage (HC + SC only) from point_classes data
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)
        
        if all_point_classes:
            coral_classes = ['Hard Coral', 'Soft Coral']
            coral_count = sum(1 for pc in all_point_classes if pc in coral_classes)
            batch.avg_coverage = round((coral_count / len(all_point_classes)) * 100)
        else:
            batch.avg_coverage = None
        
        if batch.avg_coverage is None:
            batch.coverage_class = None
            continue
        if batch.avg_coverage >= 60:
            batch.coverage_class = 'A'
        elif batch.avg_coverage >= 40:
            batch.coverage_class = 'B'
        else:
            batch.coverage_class = 'C'

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
        messages.error(request, 'You do not have permission to view all batches.')
        return redirect('batches')
    
    batches_qs = ImageBatch.objects.all()
    
    batches_qs = batches_qs.annotate(
        image_count=Count('images')
    )

    for batch in batches_qs:
        # Recalculate coral coverage (HC + SC only) from point_classes data
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)
        
        if all_point_classes:
            coral_classes = ['Hard Coral', 'Soft Coral']
            coral_count = sum(1 for pc in all_point_classes if pc in coral_classes)
            batch.avg_coverage = round((coral_count / len(all_point_classes)) * 100)
        else:
            batch.avg_coverage = None
        
        if batch.avg_coverage is None:
            batch.coverage_class = None
            continue
        if batch.avg_coverage >= 60:
            batch.coverage_class = 'A'
        elif batch.avg_coverage >= 40:
            batch.coverage_class = 'B'
        else:
            batch.coverage_class = 'C'

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'batches': batches_qs,
        'batch_type': 'all_batches',
    }
    return render(request, 'accounts/all_batches.html', context)


@login_required(login_url='login')
def map_view(request):
    """Render interactive map view with survey locations."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_admin():
        batches_qs = ImageBatch.objects.all()
    else:
        batches_qs = ImageBatch.objects.filter(user=request.user)
    
    batches_qs = batches_qs.annotate(image_count=Count('images'))

    # Recalculate coverage from point_classes for each batch
    for batch in batches_qs:
        all_point_classes = []
        for image in batch.images.all():
            if image.point_classes:
                all_point_classes.extend(image.point_classes)
        
        # Calculate coral coverage (Hard Coral + Soft Coral only)
        coral_classes = ['Hard Coral', 'Soft Coral']
        coral_count = sum(1 for pc in all_point_classes if pc in coral_classes)
        batch.avg_coverage = round((coral_count / len(all_point_classes)) * 100) if all_point_classes else None
        
        # Determine coverage class
        if batch.avg_coverage is None:
            batch.coverage_class = None
        elif batch.avg_coverage >= 60:
            batch.coverage_class = 'A'
        elif batch.avg_coverage >= 40:
            batch.coverage_class = 'B'
        else:
            batch.coverage_class = 'C'

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
                'uploadedBy': batch.user.get_full_name() or batch.user.username,
                'surveyors': batch.surveyor_names,
                'imageCount': batch.image_count,
                'coverage': float(batch.avg_coverage) if batch.avg_coverage is not None else None,
                'coverageClass': batch.coverage_class or 'Pending',
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
def batch_detail(request, batch_id):
    """Show uploaded images and metadata for a single batch."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_admin():
        batch = get_object_or_404(ImageBatch, id=batch_id)
    else:
        batch = get_object_or_404(ImageBatch, id=batch_id, user=request.user)
    images = batch.images.all()
    avg_coverage = images.aggregate(avg=Avg('coverage_percent')).get('avg')
    if avg_coverage is None:
        coverage_class = None
    elif avg_coverage >= 60:
        coverage_class = 'A'
    elif avg_coverage >= 40:
        coverage_class = 'B'
    else:
        coverage_class = 'C'

    if request.method == 'POST':
        batch_name = request.POST.get('name', '').strip()
        survey_date = request.POST.get('survey_date', '').strip()
        area_name = request.POST.get('area_name', '').strip()
        surveyor_names = request.POST.get('surveyor_names', '').strip()
        latitude_raw = request.POST.get('latitude', '').strip()
        longitude_raw = request.POST.get('longitude', '').strip()

        errors = []

        if not batch_name:
            errors.append('Batch name is required.')
        if not survey_date:
            errors.append('Survey date is required.')
        if not area_name:
            errors.append('Area name is required.')
        if not surveyor_names:
            errors.append('Surveyor name(s) are required.')

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

                for image in images:
                    desc = request.POST.get(f'image_desc_{image.id}', '').strip()
                    if desc != image.description:
                        image.description = desc
                        image.save(update_fields=['description'])

            messages.success(request, 'Batch updated successfully.')
            return redirect('batch_detail', batch_id=batch.id)

    # Calculate Coral Coverage (Hard Coral + Soft Coral only)
    all_point_classes = []
    for image in images:
        if image.point_classes:
            all_point_classes.extend(image.point_classes)
    
    if all_point_classes:
        # Coral Coverage: Only Hard Coral + Soft Coral
        coral_classes = ['Hard Coral', 'Soft Coral']
        coral_count = sum(1 for pc in all_point_classes if pc in coral_classes)
        coral_coverage = round((coral_count / len(all_point_classes)) * 100)
    else:
        coral_coverage = 0

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'batch': batch,
        'images': images,
        'avg_coverage': avg_coverage,
        'coverage_class': coverage_class,
        'point_classes_json': json.dumps({f'image-{img.id}': img.point_classes for img in images}),
        'coral_coverage': coral_coverage,
    }
    return render(request, 'accounts/batch_detail.html', context)


@login_required(login_url='login')
def reports(request):
    """Generate and display coral monitoring reports."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')

    if request.user.is_admin():
        batches_qs = ImageBatch.objects.all()
    else:
        batches_qs = ImageBatch.objects.filter(user=request.user)
    
    batches_qs = batches_qs.annotate(
        image_count=Count('images'),
        avg_coverage=Avg('images__coverage_percent')
    ).order_by('-survey_date')

    # Calculate statistics
    total_surveys = batches_qs.count()
    total_images = batches_qs.aggregate(total=Count('images'))['total'] or 0
    
    # Coverage statistics
    coverage_stats = batches_qs.aggregate(
        avg=Avg('images__coverage_percent'),
    )
    avg_coverage = coverage_stats['avg'] or 0
    
    # Coverage class breakdown
    class_a = batches_qs.filter(images__coverage_percent__gte=60).distinct().count()
    class_b = batches_qs.filter(images__coverage_percent__gte=40, images__coverage_percent__lt=60).distinct().count()
    class_c = batches_qs.filter(images__coverage_percent__lt=40).distinct().count()
    pending = total_surveys - (class_a + class_b + class_c)

    # Extract unique locations from batches
    locations = []
    seen_locations = set()
    for batch in batches_qs:
        if batch.area_name and batch.area_name not in seen_locations:
            locations.append({
                'name': batch.area_name,
                'latitude': float(batch.latitude),
                'longitude': float(batch.longitude),
                'batch_count': batches_qs.filter(area_name=batch.area_name).count()
            })
            seen_locations.add(batch.area_name)

    context = {
        'user': request.user,
        'generated_at': timezone.now(),
        'total_surveys': total_surveys,
        'total_images': total_images,
        'avg_coverage': avg_coverage,
        'class_a': class_a,
        'class_b': class_b,
        'class_c': class_c,
        'pending': pending,
        'recent_batches': batches_qs[:10],
        'locations': locations,
        'recent_reports': Report.objects.filter(user=request.user, status='completed')[:10],
    }
    return render(request, 'accounts/reports.html', context)


@login_required(login_url='login')
@require_http_methods(["POST"])
@csrf_protect
def generate_report(request):
    """Generate a new report from form data."""
    if request.user.is_pending():
        return HttpResponse(json.dumps({'status': 'error', 'message': 'Your account is pending approval'}), 
                          content_type='application/json', status=403)
    
    try:
        # Parse form data
        report_type = request.POST.get('report_type', 'summary')
        title = request.POST.get('report_title', f'Report - {timezone.now().strftime("%Y-%m-%d")}')
        author = request.POST.get('report_author', '')
        export_format = request.POST.get('export_format', 'pdf')
        
        # Collect configuration data
        config = {
            'report_type': report_type,
            'title': title,
            'author': author,
            'export_format': export_format,
            'date_from': request.POST.get('date_from', ''),
            'date_to': request.POST.get('date_to', ''),
            'selected_batch': request.POST.get('selected_batch', ''),
            'include_options': {
                'all_batches': request.POST.get('include_all') == 'on',
                'specific_locations': request.POST.get('specific_locations') == 'on',
                'specific_classes': request.POST.get('specific_classes') == 'on',
            },
            'customization': {
                'sections': {
                    'summary': request.POST.get('section_summary') == 'on',
                    'methodology': request.POST.get('section_methodology') == 'on',
                    'findings': request.POST.get('section_findings') == 'on',
                    'results': request.POST.get('section_results') == 'on',
                    'maps': request.POST.get('section_maps') == 'on',
                    'images': request.POST.get('section_images') == 'on',
                    'recommendations': request.POST.get('section_recommendations') == 'on',
                    'appendix': request.POST.get('section_appendix') == 'on',
                },
                'cover_page': {
                    'logo': request.POST.get('cover_logo') == 'on',
                    'institution_logo': request.POST.get('cover_institution_logo') == 'on',
                    'header_image': request.POST.get('cover_header_image') == 'on',
                },
                'color_theme': request.POST.get('color_theme', 'coralsense'),
                'sample_images_count': int(request.POST.get('sample_images_count', 3)),
            },
            'advanced_options': {
                'include_raw_images': request.POST.get('include_raw_images') == 'on',
                'multiple_formats': request.POST.get('multiple_formats') == 'on',
                'email_when_ready': request.POST.get('email_when_ready') == 'on',
            },
        }
        
        # Create Report entry
        report = Report.objects.create(
            user=request.user,
            title=title,
            report_type=report_type,
            author=author,
            export_format=export_format,
            config=config,
            status='pending'
        )
        
        # Generate report (for now, synchronously; can be moved to Celery task)
        try:
            generator = ReportGenerator(report)
            generator.generate()
        except Exception as e:
            report.status = 'failed'
            report.error_message = str(e)
            report.save()
        
        return JsonResponse({
            'status': 'success',
            'message': 'Report generated successfully' if report.status == 'completed' else 'Report generation started',
            'report_id': report.id
        })
    
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=400)


@login_required(login_url='login')
def download_report(request, report_id):
    """Download a generated report."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')
    
    if request.user.is_admin():
        report = get_object_or_404(Report, id=report_id)
    else:
        report = get_object_or_404(Report, id=report_id, user=request.user)
    
    if not report.file:
        messages.error(request, 'Report file not found.')
        return redirect('reports')
    
    try:
        response = HttpResponse(report.file.read(), content_type='application/octet-stream')
        response['Content-Disposition'] = f'attachment; filename="{report.title}.{report.export_format}"'
        return response
    except Exception as e:
        messages.error(request, f'Error downloading report: {str(e)}')
        return redirect('reports')


@login_required(login_url='login')
def view_report(request, report_id):
    """View report details."""
    if request.user.is_pending():
        messages.info(request, 'Your account is still pending approval.')
        return redirect('pending_approval')
    
    if request.user.is_admin():
        report = get_object_or_404(Report, id=report_id)
    else:
        report = get_object_or_404(Report, id=report_id, user=request.user)
    
    context = {
        'report': report,
        'generated_at': timezone.now(),
    }
    return render(request, 'accounts/report_view.html', context)


@login_required(login_url='login')
def delete_report(request, report_id):
    """Delete a report."""
    if request.user.is_pending():
        return JsonResponse({'error': 'Your account is still pending approval.'}, status=403)
    
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)
    
    try:
        if request.user.is_admin():
            report = get_object_or_404(Report, id=report_id)
        else:
            report = get_object_or_404(Report, id=report_id, user=request.user)
        
        # Delete the file from storage
        if report.file:
            try:
                storage = report.file.storage
                storage.delete(report.file.name)
            except Exception as e:
                print(f'Error deleting file: {str(e)}')
        
        # Delete the report record
        report_title = report.title
        report.delete()
        
        return JsonResponse({
            'success': True,
            'message': f'Report "{report_title}" has been deleted successfully.'
        }, status=200)
    
    except Report.DoesNotExist:
        return JsonResponse({'error': 'Report not found.'}, status=404)
    except Exception as e:
        return JsonResponse({'error': f'Error deleting report: {str(e)}'}, status=500)
