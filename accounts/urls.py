from django.urls import path
from . import views

urlpatterns = [
    # Authentication URLs
    path('register/', views.register, name='register'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('pending-approval/', views.pending_approval, name='pending_approval'),
    path('researcher/dashboard/', views.researcher_dashboard, name='researcher_dashboard'),
    path('researcher/accept-researcher/', views.accept_researcher, name='accept_researcher'),
    path('researcher/manage-users/', views.manage_users, name='manage_users'),
    path('researcher/manage-users/<int:user_id>/deactivate/', views.deactivate_user, name='deactivate_user'),
    path('researcher/manage-users/<int:user_id>/activate/', views.activate_user, name='activate_user'),
    path('researcher/upload-batch/', views.upload_batch, name='upload_batch'),
    path('researcher/batches/', views.batches, name='batches'),
    path('researcher/batches/all/', views.all_batches, name='all_batches'),
    path('researcher/batches/<int:batch_id>/', views.batch_detail, name='batch_detail'),
    path('researcher/map-view/', views.map_view, name='map_view'),
    path('researcher/analysis-results/', views.analysis_results, name='analysis_results'),
    path('researcher/analysis-results/export/csv/', views.analysis_results_export_csv, name='analysis_results_export_csv'),
    path('researcher/analysis-results/export/pdf/', views.analysis_results_export_pdf, name='analysis_results_export_pdf'),
    path('researcher/reports/', views.reports, name='reports'),
    path('researcher/reports/generate/', views.generate_report, name='generate_report'),
    path('researcher/reports/<int:report_id>/download/', views.download_report, name='download_report'),
    path('researcher/reports/<int:report_id>/view/', views.view_report, name='view_report'),
    path('researcher/reports/<int:report_id>/delete/', views.delete_report, name='delete_report'),
    
    # Password reset URLs
    path('password-reset/', views.CustomPasswordResetView.as_view(), name='password_reset'),
    path('password-reset/done/', views.password_reset_done, name='password_reset_done'),
    path('password-reset/<uidb64>/<token>/', views.CustomPasswordResetConfirmView.as_view(), name='password_reset_confirm'),
]
