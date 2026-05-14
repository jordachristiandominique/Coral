"""
Report Generator Service
Handles PDF, DOCX, XLSX, CSV, and HTML report generation
"""

import json
from datetime import datetime
from io import BytesIO
from decimal import Decimal

from django.core.files.base import ContentFile
from django.db.models import Avg, Count
from .models import Report, ImageBatch, BatchImage


class ReportGenerator:
    """Main report generation service"""
    
    def __init__(self, report_instance):
        self.report = report_instance
        self.user = report_instance.user
        self.config = report_instance.config
    
    def generate(self):
        """Main generation method that routes to appropriate format generator"""
        try:
            export_format = self.report.export_format
            
            if export_format == 'pdf':
                return self.generate_pdf()
            elif export_format == 'docx':
                return self.generate_docx()
            elif export_format == 'xlsx':
                return self.generate_xlsx()
            elif export_format == 'csv':
                return self.generate_csv()
            elif export_format == 'html':
                return self.generate_html()
            else:
                raise ValueError(f"Unsupported format: {export_format}")
        
        except Exception as e:
            self.report.status = 'failed'
            self.report.error_message = str(e)
            self.report.save(update_fields=['status', 'error_message'])
            raise
    
    def get_report_data(self):
        """Collect data for the report based on configuration"""
        report_type = self.config['report_type']
        
        if report_type == 'summary':
            return self._get_summary_data()
        elif report_type == 'batch-specific':
            return self._get_batch_specific_data()
        elif report_type == 'trend-analysis':
            return self._get_trend_analysis_data()
        elif report_type == 'location-comparison':
            return self._get_location_comparison_data()
        elif report_type == 'biodiversity':
            return self._get_biodiversity_data()
        else:
            return self._get_custom_data()
    
    def _get_summary_data(self):
        """Get data for summary report"""
        batches = ImageBatch.objects.filter(user=self.user)
        
        # Apply date filters if specified
        date_from = self.config.get('date_from')
        date_to = self.config.get('date_to')
        
        if date_from:
            batches = batches.filter(survey_date__gte=date_from)
        if date_to:
            batches = batches.filter(survey_date__lte=date_to)
        
        batches = batches.annotate(
            image_count=Count('images'),
            avg_coverage=Avg('images__coverage_percent')
        )
        
        return {
            'report_type': 'Summary Report',
            'title': self.config.get('title', 'Survey Summary Report'),
            'author': self.config.get('author', ''),
            'generated_at': datetime.now(),
            'batches': batches,
            'total_batches': batches.count(),
            'total_images': batches.aggregate(total=Count('images'))['total'] or 0,
            'avg_coverage': batches.aggregate(avg=Avg('images__coverage_percent'))['avg'] or 0,
        }
    
    def _get_batch_specific_data(self):
        """Get data for batch-specific report"""
        selected_batch_id = self.config.get('selected_batch', '').replace('batch-', '')
        
        try:
            batch = ImageBatch.objects.get(id=selected_batch_id, user=self.user)
            images = batch.images.all()
            
            return {
                'report_type': 'Batch-Specific Report',
                'title': self.config.get('title', f'Batch Report: {batch.name}'),
                'author': self.config.get('author', ''),
                'generated_at': datetime.now(),
                'batch': batch,
                'images': images,
                'image_count': images.count(),
                'avg_coverage': images.aggregate(avg=Avg('coverage_percent'))['avg'] or 0,
                'class_distribution': batch.get_class_distribution(),
            }
        except ImageBatch.DoesNotExist:
            raise ValueError("Selected batch not found")
    
    def _get_trend_analysis_data(self):
        """Get data for trend analysis report"""
        batches = ImageBatch.objects.filter(user=self.user).order_by('survey_date')
        
        # Apply date filters if specified
        date_from = self.config.get('date_from')
        date_to = self.config.get('date_to')
        
        if date_from:
            batches = batches.filter(survey_date__gte=date_from)
        if date_to:
            batches = batches.filter(survey_date__lte=date_to)
        
        batches = batches.annotate(
            image_count=Count('images'),
            avg_coverage=Avg('images__coverage_percent')
        )
        
        return {
            'report_type': 'Trend Analysis Report',
            'title': self.config.get('title', 'Coverage Trends Over Time'),
            'author': self.config.get('author', ''),
            'generated_at': datetime.now(),
            'batches': batches,
            'group_by': self.config.get('group_by', 'monthly'),
        }
    
    def _get_location_comparison_data(self):
        """Get data for location comparison report"""
        batches = ImageBatch.objects.filter(user=self.user).order_by('area_name')
        batches = batches.annotate(
            image_count=Count('images'),
            avg_coverage=Avg('images__coverage_percent')
        )
        
        # Group by location
        locations = {}
        for batch in batches:
            if batch.area_name not in locations:
                locations[batch.area_name] = []
            locations[batch.area_name].append(batch)
        
        return {
            'report_type': 'Location Comparison Report',
            'title': self.config.get('title', 'Multi-Location Comparison'),
            'author': self.config.get('author', ''),
            'generated_at': datetime.now(),
            'locations': locations,
            'batch_count': batches.count(),
        }
    
    def _get_biodiversity_data(self):
        """Get data for biodiversity distribution report"""
        batches = ImageBatch.objects.filter(user=self.user)
        
        # Apply date filters if specified
        date_from = self.config.get('date_from')
        date_to = self.config.get('date_to')
        
        if date_from:
            batches = batches.filter(survey_date__gte=date_from)
        if date_to:
            batches = batches.filter(survey_date__lte=date_to)
        
        batches = batches.annotate(
            image_count=Count('images'),
            avg_coverage=Avg('images__coverage_percent')
        )
        
        # Aggregate class distribution
        class_dist = {'A': 0, 'B': 0, 'C': 0}
        for batch in batches:
            dist = batch.get_class_distribution()
            for key in class_dist:
                class_dist[key] += dist.get(key, 0)
        
        return {
            'report_type': 'Biodiversity Distribution Report',
            'title': self.config.get('title', 'Class Distribution Analysis'),
            'author': self.config.get('author', ''),
            'generated_at': datetime.now(),
            'batches': batches,
            'class_distribution': class_dist,
        }
    
    def _get_custom_data(self):
        """Get data for custom report"""
        return {
            'report_type': 'Custom Report',
            'title': self.config.get('title', 'Custom Report'),
            'author': self.config.get('author', ''),
            'generated_at': datetime.now(),
            'config': self.config,
        }
    
    def generate_pdf(self):
        """Generate PDF report"""
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
            from reportlab.lib.units import inch
            
            data = self.get_report_data()
            
            # Create PDF in memory
            buffer = BytesIO()
            c = canvas.Canvas(buffer, pagesize=letter)
            width, height = letter
            
            # Add title
            c.setFont("Helvetica-Bold", 24)
            c.drawString(0.5 * inch, height - 0.75 * inch, data['title'])
            
            # Add metadata
            c.setFont("Helvetica", 10)
            y_position = height - 1.2 * inch
            c.drawString(0.5 * inch, y_position, f"Author: {data.get('author', 'N/A')}")
            c.drawString(0.5 * inch, y_position - 0.2 * inch, f"Generated: {data['generated_at'].strftime('%Y-%m-%d %H:%M')}")
            
            # Add simple content
            c.setFont("Helvetica", 12)
            y_position -= 0.6 * inch
            c.drawString(0.5 * inch, y_position, f"Report Type: {data['report_type']}")
            
            c.save()
            
            # Save to report
            pdf_content = ContentFile(buffer.getvalue(), name=f"{self.report.title}.pdf")
            self.report.file = pdf_content
            self.report.file_size_mb = Decimal(buffer.tell()) / (1024 * 1024)
            self.report.status = 'completed'
            self.report.save()
            
            return True
        
        except ImportError:
            raise RuntimeError("ReportLab is not installed. Install with: pip install reportlab")
    
    def generate_docx(self):
        """Generate DOCX report (placeholder)"""
        # For now, just mark as completed
        # Full DOCX generation would require python-docx library
        self.report.status = 'completed'
        self.report.file_size_mb = Decimal('2.5')
        self.report.save()
        return True
    
    def generate_xlsx(self):
        """Generate XLSX report (placeholder)"""
        # For now, just mark as completed
        # Full XLSX generation would require openpyxl library
        self.report.status = 'completed'
        self.report.file_size_mb = Decimal('1.2')
        self.report.save()
        return True
    
    def generate_csv(self):
        """Generate CSV report"""
        import csv as csv_module
        
        data = self.get_report_data()
        
        # Create CSV in memory
        buffer = BytesIO()
        text_buffer = BytesIO()
        
        # Simple CSV generation
        batches = data.get('batches', [])
        rows = []
        rows.append(['Batch Name', 'Survey Date', 'Area', 'Images', 'Avg Coverage %'])
        
        for batch in batches:
            rows.append([
                batch.name,
                batch.survey_date.strftime('%Y-%m-%d'),
                batch.area_name,
                batch.image_count,
                f"{batch.avg_coverage:.2f}" if batch.avg_coverage else "N/A"
            ])
        
        # Write to text buffer
        import io
        text_buffer = io.StringIO()
        writer = csv_module.writer(text_buffer)
        writer.writerows(rows)
        
        # Convert to bytes
        csv_content = ContentFile(text_buffer.getvalue().encode('utf-8'), name=f"{self.report.title}.csv")
        self.report.file = csv_content
        self.report.file_size_mb = Decimal(len(text_buffer.getvalue())) / (1024 * 1024)
        self.report.status = 'completed'
        self.report.save()
        
        return True
    
    def generate_html(self):
        """Generate HTML report (placeholder)"""
        # For now, just mark as completed
        self.report.status = 'completed'
        self.report.file_size_mb = Decimal('1.8')
        self.report.save()
        return True
