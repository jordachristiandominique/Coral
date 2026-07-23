from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models

# CPCE (Coral Point Count with Excel extensions) short codes for each
# benthic class. Stored point_classes always use the full name; the code is
# purely for display so existing coverage logic is unaffected.
CPCE_CODES = {
    'Hard Coral': 'HC',
    'Soft Coral': 'SC',
    'Macroalgae': 'MA',
    'Halimeda': 'HA',
    'Algae Assemblage': 'AA',
    'Abiotic': 'AB',
    'Other Biota': 'OB',
}

# Reef health classes. Coverage = (Hard Coral + Soft Coral) / total points.
# Keep these descriptions identical everywhere they are shown to users.
COVERAGE_CLASS_LABELS = {
    'A': 'High coral coverage',
    'B': 'Moderate coral coverage',
    'C': 'Low coral coverage',
}
COVERAGE_CLASS_RANGES = {
    'A': '60% and above',
    'B': '40-59%',
    'C': 'below 40%',
}


class User(AbstractUser):
    ROLE_CHOICES = [
        ('superadmin', 'Super Admin'),
        ('admin', 'Admin'),
        ('researcher', 'Researcher'),
        ('pending', 'Pending Approval'),
    ]
    
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='pending',
        help_text='User role in the system'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'User'
        verbose_name_plural = 'Users'
    
    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
    
    def is_pending(self):
        return self.role == 'pending'
    
    def is_researcher(self):
        return self.role == 'researcher'
    
    def is_admin(self):
        return self.role == 'admin'
    
    def is_superadmin(self):
        return self.role == 'superadmin'


class ImageBatch(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='image_batches')
    name = models.CharField(max_length=160)
    survey_date = models.DateField()
    surveyor_names = models.CharField(max_length=200, blank=True, default='')
    area_name = models.CharField(max_length=160)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.survey_date})"

    def get_class_distribution(self):
        """Return count of images in each coverage class (A, B, C)"""
        classes = {'A': 0, 'B': 0, 'C': 0}
        for img in self.images.all():
            if img.coverage_class in classes:
                classes[img.coverage_class] += 1
        return classes


class BatchImage(models.Model):
    batch = models.ForeignKey(ImageBatch, on_delete=models.CASCADE, related_name='images')
    image = models.FileField(upload_to='batch_images/')
    description = models.TextField(blank=True)
    quadrat_rect = models.JSONField()
    quadrat_points = models.JSONField()
    point_classes = models.JSONField(default=list, blank=True)
    coverage_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    coverage_class = models.CharField(max_length=1, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.batch.name} - {self.image.name}"


class Report(models.Model):
    """Model for storing generated reports"""
    REPORT_TYPE_CHOICES = [
        ('summary', 'Summary Report'),
        ('batch-specific', 'Batch-Specific Report'),
        ('trend-analysis', 'Trend Analysis Report'),
        ('location-comparison', 'Location Comparison Report'),
        ('biodiversity', 'Biodiversity Distribution Report'),
        ('custom', 'Custom Report'),
    ]
    
    FORMAT_CHOICES = [
        ('pdf', 'PDF'),
        ('docx', 'Word Document'),
        ('xlsx', 'Excel Spreadsheet'),
        ('csv', 'CSV Data'),
        ('html', 'HTML Page'),
    ]
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reports')
    title = models.CharField(max_length=255)
    report_type = models.CharField(max_length=30, choices=REPORT_TYPE_CHOICES)
    author = models.CharField(max_length=255, blank=True)
    export_format = models.CharField(max_length=10, choices=FORMAT_CHOICES)
    
    # Report file storage
    file = models.FileField(upload_to='reports/', null=True, blank=True)
    file_size_mb = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    
    # Configuration (stores all form selections as JSON)
    config = models.JSONField(default=dict)
    
    # Status tracking
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Report'
        verbose_name_plural = 'Reports'
    
    def __str__(self):
        return f"{self.title} ({self.get_report_type_display()})"
    
    @property
    def is_completed(self):
        return self.status == 'completed'
    
    @property
    def is_failed(self):
        return self.status == 'failed'
