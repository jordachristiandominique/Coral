from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, ImageBatch, BatchImage, Report


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """Custom admin for User model"""
    fieldsets = UserAdmin.fieldsets + (
        ('User Role', {'fields': ('role',)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('User Role', {'fields': ('role',)}),
    )
    list_display = ('username', 'email', 'get_full_name', 'role', 'is_staff')
    list_filter = UserAdmin.list_filter + ('role',)
    search_fields = ('username', 'email', 'first_name', 'last_name')


@admin.register(ImageBatch)
class ImageBatchAdmin(admin.ModelAdmin):
    """Admin for ImageBatch model"""
    list_display = ('name', 'user', 'survey_date', 'area_name', 'created_at')
    list_filter = ('survey_date', 'created_at', 'area_name')
    search_fields = ('name', 'area_name', 'user__username')
    readonly_fields = ('created_at',)
    fieldsets = (
        ('Batch Information', {
            'fields': ('user', 'name', 'survey_date', 'area_name', 'surveyor_names')
        }),
        ('Location', {
            'fields': ('latitude', 'longitude')
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )


@admin.register(BatchImage)
class BatchImageAdmin(admin.ModelAdmin):
    """Admin for BatchImage model"""
    list_display = ('batch', 'coverage_percent', 'coverage_class', 'created_at')
    list_filter = ('coverage_class', 'created_at', 'batch')
    search_fields = ('batch__name', 'description')
    readonly_fields = ('created_at',)


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """Admin for Report model"""
    list_display = ('title', 'user', 'report_type', 'export_format', 'status', 'created_at')
    list_filter = ('report_type', 'export_format', 'status', 'created_at')
    search_fields = ('title', 'user__username', 'author')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Report Information', {
            'fields': ('user', 'title', 'report_type', 'author', 'export_format')
        }),
        ('File', {
            'fields': ('file', 'file_size_mb')
        }),
        ('Configuration', {
            'fields': ('config',),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('status', 'error_message')
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


