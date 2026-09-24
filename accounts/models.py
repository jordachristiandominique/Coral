import statistics

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

# Hard Coral Cover (HCC) assessment scale for Philippine reefs, following
# Licuanan et al. (2019/2020). HCC counts scleractinian (stony) Hard Coral
# points ONLY, over the total number of points surveyed. The four categories
# are neutral letter grades (A-D) benchmarked against the national HCC average
# (22.8% +/- 1.2 SE) and the Tubbataha Reefs benchmark. Keep these strings
# identical everywhere they are shown to users.
NATIONAL_HCC_AVERAGE = 22.8  # Philippine national average hard coral cover (%)

COVERAGE_CLASS_LABELS = {
    'A': 'Category A',
    'B': 'Category B',
    'C': 'Category C',
    'D': 'Category D',
}
COVERAGE_CLASS_RANGES = {
    'A': 'more than 44%',
    'B': 'more than 33% up to 44%',
    'C': 'more than 22% up to 33%',
    'D': '0-22%',
}
# Comparative, non-judgmental descriptions (no poor/fair/good wording).
COVERAGE_CLASS_DESCRIPTIONS = {
    'A': ("Reef coral cover is more than double the Philippine national average "
          "— comparable to or exceeding Tubbataha Reefs, one of the "
          "country's healthiest reef systems."),
    'B': ("Reef coral cover exceeds both the national average and the Tubbataha "
          "benchmark."),
    'C': ("Reef coral cover is above the national average, though below the "
          "Tubbataha benchmark."),
    'D': ("Reef coral cover is at or below the national average. This reef may "
          "still provide meaningful ecosystem services and habitat."),
}


def classify_hcc(percent):
    """Map a Hard Coral Cover percentage to its Licuanan (2020) category.

    A: >44%   B: >33-44%   C: >22-33%   D: 0-22%
    """
    if percent is None:
        return None
    if percent > 44:
        return 'A'
    if percent > 33:
        return 'B'
    if percent > 22:
        return 'C'
    return 'D'


def compute_coverage(point_classes):
    """Hard Coral Cover (HCC) via the CPCE point-intercept method.

    HCC % = Hard Coral points / total points surveyed x 100

    Soft coral and every other benthic class are excluded from the numerator
    (they remain available in the breakdown for full benthic composition
    reporting). Returns a breakdown dict so the UI can *show its work*:
    {total, hard, soft, coral, percent, coverage_class}.
    """
    pcs = point_classes or []
    total = len(pcs)
    hard = sum(1 for p in pcs if p == 'Hard Coral')
    soft = sum(1 for p in pcs if p == 'Soft Coral')
    coral = hard  # HCC numerator is hard coral only
    percent = round((hard / total) * 100) if total else None
    coverage_class = classify_hcc(percent)

    return {
        'total': total,
        'hard': hard,
        'soft': soft,
        'coral': coral,
        'percent': percent,
        'coverage_class': coverage_class,
    }


def compute_site_hcc(batch):
    """Site-level Hard Coral Cover with the transect as the sampling replicate.

    Following the Licuanan / PhilReefs photo-transect method:
      * per image  -> HCC = compute_coverage(point_classes)['percent']
      * per transect -> mean of its images' HCC (each image weighted equally)
      * per site   -> mean of the transect means, with Standard Error across
                      the transects (SE = SD / sqrt(n)); the A-D category is
                      assigned from the site mean.

    Returns a dict the views/templates can render directly:
        {transects: [{number, label, percent, coverage_class, image_count}],
         site_percent, se, coverage_class, n_transects}
    """
    transects_data = []
    transect_means = []

    for transect in batch.transects.all():
        image_percents = []
        for image in transect.images.all():
            percent = compute_coverage(image.point_classes)['percent']
            if percent is not None:
                image_percents.append(percent)
        t_mean = round(sum(image_percents) / len(image_percents), 2) if image_percents else None
        transects_data.append({
            'number': transect.number,
            'label': transect.label or f'Transect {transect.number}',
            'percent': t_mean,
            'coverage_class': classify_hcc(t_mean),
            'image_count': len(image_percents),
            'latitude': transect.latitude,
            'longitude': transect.longitude,
        })
        if t_mean is not None:
            transect_means.append(t_mean)

    if transect_means:
        site_percent = round(sum(transect_means) / len(transect_means), 2)
        if len(transect_means) >= 2:
            se = round(statistics.stdev(transect_means) / (len(transect_means) ** 0.5), 2)
        else:
            se = 0.0
        coverage_class = classify_hcc(site_percent)
    else:
        site_percent = None
        se = None
        coverage_class = None

    return {
        'transects': transects_data,
        'site_percent': site_percent,
        'se': se,
        'coverage_class': coverage_class,
        'n_transects': len(transect_means),
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

    profile_photo = models.ImageField(
        upload_to='profile_photos/', null=True, blank=True,
        help_text='Optional avatar shown in the navbar and Settings page'
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
        """Return count of images in each coverage class (A, B, C, D)"""
        classes = {'A': 0, 'B': 0, 'C': 0, 'D': 0}
        for img in self.images.all():
            if img.coverage_class in classes:
                classes[img.coverage_class] += 1
        return classes


class Transect(models.Model):
    """One transect (sampling replicate) within a site/survey (ImageBatch).

    A site is surveyed with (typically 3) transects, each analyzed from ~50
    images. HCC statistics treat the transect as the replicate unit.
    """
    batch = models.ForeignKey(ImageBatch, on_delete=models.CASCADE, related_name='transects')
    number = models.PositiveSmallIntegerField(default=1)
    label = models.CharField(max_length=120, blank=True, default='')
    # Each transect can sit at its own GPS location (falls back to the site's).
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    # Cached transect-level HCC (mean of its images) for quick list displays.
    coverage_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    coverage_class = models.CharField(max_length=1, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['number']

    def __str__(self):
        return f"{self.batch.name} - {self.label or f'Transect {self.number}'}"


class BatchImage(models.Model):
    batch = models.ForeignKey(ImageBatch, on_delete=models.CASCADE, related_name='images')
    transect = models.ForeignKey(
        Transect, on_delete=models.CASCADE, related_name='images', null=True, blank=True
    )
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


class Notification(models.Model):
    """A short in-app message shown in the navbar bell dropdown.

    Created for workflow events: a new pending registration (recipients = admins)
    and an account approval (recipient = the approved user).
    """
    VERB_CHOICES = [
        ('registration_pending', 'New registration pending approval'),
        ('account_approved', 'Account approved'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications'
    )
    verb = models.CharField(max_length=40, choices=VERB_CHOICES)
    message = models.CharField(max_length=255)
    url = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'

    def __str__(self):
        return f"{self.get_verb_display()} → {self.recipient}"
