/**
 * Reports Builder - Sections 1-4 Interaction Handler
 * Manages report type selection, data selection, customization, and format options
 */

document.addEventListener('DOMContentLoaded', function () {
    console.log('📋 Reports Builder initialized');

    const reportTypeRadios = document.querySelectorAll('[data-report-type]');
    const includeOptions = document.querySelectorAll('[data-include-option]');
    const previewContent = document.querySelector('.preview-content');

    console.log('✓ Elements found:', {
        reportTypeRadios: reportTypeRadios.length,
        includeOptions: includeOptions.length,
        previewContent: !!previewContent
    });

    // Initialize event listeners
    initializeReportTypeHandlers();
    initializeDataSelectionHandlers();
    initializeTrendAnalysisHandlers();
    initializeLocationComparisonHandlers();
    initializeCustomizationHandlers();
    initializeFormatHandlers();
    initializeBatchClassLabels();
    updatePreview();

    /**
     * Handle report type selection changes
     */
    function initializeReportTypeHandlers() {
        reportTypeRadios.forEach(radio => {
            radio.addEventListener('change', function (e) {
                const reportType = this.value;
                updateDataSelectionForReportType(reportType);
                updatePreview();
            });
        });
    }

    /**
     * Handle data selection changes
     */
    function initializeDataSelectionHandlers() {
        // Date range inputs
        const dateFromInput = document.getElementById('date-from');
        const dateToInput = document.getElementById('date-to');

        if (dateFromInput) {
            dateFromInput.addEventListener('change', updatePreview);
        }
        if (dateToInput) {
            dateToInput.addEventListener('change', updatePreview);
        }

        // Include options checkboxes
        includeOptions.forEach(checkbox => {
            checkbox.addEventListener('change', function () {
                if (this.value === 'all' && this.checked) {
                    // Uncheck other options when "All batches" is selected
                    includeOptions.forEach(opt => {
                        if (opt.value !== 'all') opt.checked = false;
                    });
                } else if (this.value !== 'all' && this.checked) {
                    // Uncheck "All batches" when specific options are selected
                    includeOptions.forEach(opt => {
                        if (opt.value === 'all') opt.checked = false;
                    });
                }
                updatePreview();
            });
        });
    }

    /**
     * Update data selection options based on report type
     */
    function updateDataSelectionForReportType(reportType) {
        const dataSummaryReport = document.getElementById('data-summary-report');
        const dataBatchSpecific = document.getElementById('data-batch-specific');
        const dataTrendAnalysis = document.getElementById('data-trend-analysis');
        const dataLocationComparison = document.getElementById('data-location-comparison');

        // Hide all data selection forms
        if (dataSummaryReport) dataSummaryReport.style.display = 'none';
        if (dataBatchSpecific) dataBatchSpecific.style.display = 'none';
        if (dataTrendAnalysis) dataTrendAnalysis.style.display = 'none';
        if (dataLocationComparison) dataLocationComparison.style.display = 'none';

        // Show the appropriate form based on report type
        switch (reportType) {
            case 'summary':
                if (dataSummaryReport) dataSummaryReport.style.display = 'block';
                break;
            case 'batch-specific':
                if (dataBatchSpecific) dataBatchSpecific.style.display = 'block';
                break;
            case 'trend-analysis':
                if (dataTrendAnalysis) dataTrendAnalysis.style.display = 'block';
                break;
            case 'location-comparison':
                if (dataLocationComparison) dataLocationComparison.style.display = 'block';
                break;
            case 'biodiversity':
                // Biodiversity uses same form as summary
                if (dataSummaryReport) dataSummaryReport.style.display = 'block';
                break;
            case 'custom':
                // Custom uses all available options
                if (dataSummaryReport) dataSummaryReport.style.display = 'block';
                break;
        }

        console.log('Updated data selection for report type:', reportType);
    }

    /**
     * Initialize Section 3 (Customization) handlers
     */
    function initializeCustomizationHandlers() {
        const sectionImages = document.querySelector('input[name="section_images"]');
        const sampleImagesCount = document.querySelector('input[name="sample_images_count"]');

        if (sampleImagesCount) {
            sampleImagesCount.addEventListener('change', updatePreview);
        }

        // All customization inputs trigger preview update
        const customizationInputs = document.querySelectorAll('.customization-form input');
        customizationInputs.forEach(input => {
            input.addEventListener('change', updatePreview);
        });
    }

    /**
     * Initialize format handlers
     */
    function initializeFormatHandlers() {
        const exportFormatRadios = document.querySelectorAll('input[name="export_format"]');
        exportFormatRadios.forEach(radio => {
            radio.addEventListener('change', updatePreview);
        });
    }

    /**
     * Initialize Trend Analysis handlers
     */
    function initializeTrendAnalysisHandlers() {
        const timePeriodInputs = document.querySelectorAll('input[name="time_period"]');
        const trendInputs = document.querySelectorAll('#data-trend-analysis input, #data-trend-analysis select');

        timePeriodInputs.forEach(input => {
            input.addEventListener('change', updatePreview);
        });

        trendInputs.forEach(input => {
            input.addEventListener('change', updatePreview);
        });
    }

    /**
     * Initialize Location Comparison handlers
     */
    function initializeLocationComparisonHandlers() {
        const locationCheckboxes = document.querySelectorAll('input[name="selected_locations"]');
        const compareOptions = document.querySelectorAll('#data-location-comparison input[type="checkbox"]');
        const locationSearchInput = document.getElementById('location-search');

        // Check first 2 locations by default
        locationCheckboxes.forEach(checkbox => {
            const index = parseInt(checkbox.getAttribute('data-location-index'));
            if (index < 2) {
                checkbox.checked = true;
            }
        });

        locationCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function () {
                updateLocationCount();
                updatePreview();
            });
        });

        compareOptions.forEach(option => {
            option.addEventListener('change', updatePreview);
        });

        // Location search filter
        if (locationSearchInput) {
            locationSearchInput.addEventListener('input', function () {
                const searchTerm = this.value.toLowerCase();
                const locationOptions = document.querySelectorAll('.location-option');

                locationOptions.forEach(option => {
                    const locationName = option.textContent.toLowerCase();
                    if (locationName.includes(searchTerm)) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                });
            });
        }

        // Update initial count
        updateLocationCount();
    }

    /**
     * Update location count display
     */
    function updateLocationCount() {
        const selectedLocations = document.querySelectorAll('input[name="selected_locations"]:checked').length;
        const locationCountSpan = document.getElementById('location-count');
        if (locationCountSpan) {
            locationCountSpan.textContent = selectedLocations;
        }
    }

    /**
     * Set batch class labels based on coverage values
     */
    function initializeBatchClassLabels() {
        const batchRadios = document.querySelectorAll('input[name="selected_batch"][data-batch-coverage]');
        batchRadios.forEach(radio => {
            const coverage = parseFloat(radio.getAttribute('data-batch-coverage'));
            const date = radio.getAttribute('data-batch-date');
            const images = radio.getAttribute('data-batch-images');
            let classLabel = 'Class C';

            if (coverage >= 60) {
                classLabel = 'Class A';
            } else if (coverage >= 40) {
                classLabel = 'Class B';
            }

            // Get the parent label and find the batch-meta-content span
            const label = radio.closest('.batch-option');
            const metaContent = label.querySelector('.batch-meta-content');
            if (metaContent) {
                const imageText = images == 1 ? 'image' : 'images';
                metaContent.textContent = `${date} • ${images} ${imageText} • ${coverage}% coverage • ${classLabel}`;
            }
        });
    }

    /**
     * Update the preview panel with current selections
     */
    function updatePreview() {
        const selectedType = document.querySelector('input[name="report_type"]:checked');
        const dateFrom = document.getElementById('date-from');
        const dateTo = document.getElementById('date-to');
        const summaryBatches = document.getElementById('summary-batches');
        const summaryImages = document.getElementById('summary-images');

        if (!selectedType) return;

        const reportType = selectedType.value;
        const dateFromValue = dateFrom ? dateFrom.value : '';
        const dateToValue = dateTo ? dateTo.value : '';

        // Build preview HTML based on report type
        let previewHTML = buildPreviewHTML(reportType, dateFromValue, dateToValue);

        if (previewContent) {
            previewContent.innerHTML = previewHTML;
        }

        // Update summary statistics
        updateSummaryStatistics();

        // Update review summary
        updateReviewSummary();
    }

    /**
     * Build preview HTML based on report configuration
     */
    function buildPreviewHTML(reportType, dateFrom, dateTo) {
        // Get actual data from page
        const totalBatches = document.getElementById('summary-batches')?.textContent || '0';
        const totalImages = document.getElementById('summary-images')?.textContent || '0';
        const reportTitle = document.getElementById('report-title')?.value || 'Your Report Title';
        const reportAuthor = document.getElementById('report-author')?.value || 'Author Name';
        const exportFormat = document.querySelector('input[name="export_format"]:checked')?.value || 'pdf';

        // Calculate estimated size based on format
        const formatSizeMap = { pdf: '3.2 MB', docx: '2.1 MB', xlsx: '845 KB', csv: '120 KB', html: '1.5 MB' };
        const estimatedSize = formatSizeMap[exportFormat] || '3.2 MB';
        const estimatedPages = Math.ceil(totalBatches / 5) + 8;

        const typeConfig = {
            'summary': {
                title: 'Summary Report',
                coverContent: `
                    <div class="report-mockup">
                        <div class="report-cover">
                            <div class="cover-top">
                                <div style="color: #1c5f6d; font-size: 28px; font-weight: bold; margin-bottom: 40px;">CORALSENSE</div>
                                <h1 style="margin: 20px 0; font-size: 24px; color: #1c5f6d;">${reportTitle}</h1>
                                <p style="margin: 20px 0; font-size: 14px; color: #666;">Comprehensive Survey Summary - Q1 2026</p>
                            </div>
                            <div class="cover-middle">
                                <div style="width: 60px; height: 60px; background: #2a8793; border-radius: 8px; margin: 40px auto;"></div>
                            </div>
                            <div class="cover-bottom">
                                <p style="margin: 15px 0; font-size: 13px;"><strong>${reportAuthor}</strong></p>
                                <p style="margin: 5px 0; font-size: 12px; color: #666;">DNSC Marine Laboratory</p>
                                <p style="margin: 20px 0; font-size: 12px; color: #888;">Generated: May 11, 2026</p>
                            </div>
                        </div>
                        <div class="report-summary">
                            <h3 style="margin-top: 0; color: #1c5f6d;">Report Summary</h3>
                            <ul style="font-size: 13px; line-height: 1.8; color: #555;">
                                <li><strong>${totalBatches} survey batches</strong> analyzed</li>
                                <li><strong>${totalImages} images</strong> processed</li>
                                <li>Coverage distribution with Class A/B/C breakdown</li>
                                <li>Temporal trends and geographic patterns</li>
                                <li>Key findings and recommendations</li>
                            </ul>
                            <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-left: 4px solid #1c5f6d; border-radius: 4px;">
                                <p style="margin: 0; font-size: 12px; color: #666;">
                                    <strong>Estimated:</strong> ${estimatedPages} pages, ${estimatedSize}
                                </p>
                            </div>
                        </div>
                    </div>
                `
            },
            'batch-specific': {
                title: 'Batch-Specific Report',
                coverContent: `
                    <div class="report-mockup">
                        <div class="report-cover">
                            <div class="cover-top">
                                <div style="color: #1c5f6d; font-size: 28px; font-weight: bold; margin-bottom: 40px;">CORALSENSE</div>
                                <h1 style="margin: 20px 0; font-size: 24px; color: #1c5f6d;">${reportTitle}</h1>
                                <p style="margin: 20px 0; font-size: 14px; color: #666;">Detailed Batch Analysis Report</p>
                            </div>
                            <div class="cover-middle">
                                <div style="width: 60px; height: 60px; background: #2a8793; border-radius: 8px; margin: 40px auto;"></div>
                            </div>
                            <div class="cover-bottom">
                                <p style="margin: 15px 0; font-size: 13px;"><strong>${reportAuthor}</strong></p>
                                <p style="margin: 5px 0; font-size: 12px; color: #666;">DNSC Marine Laboratory</p>
                                <p style="margin: 20px 0; font-size: 12px; color: #888;">Generated: May 11, 2026</p>
                            </div>
                        </div>
                        <div class="report-summary">
                            <h3 style="margin-top: 0; color: #1c5f6d;">Report Contents</h3>
                            <ul style="font-size: 13px; line-height: 1.8; color: #555;">
                                <li>Batch metadata and survey details</li>
                                <li>Individual image analysis results</li>
                                <li>Coverage percentage and biodiversity class</li>
                                <li>Location map with survey marker</li>
                                <li>Comparison with previous surveys</li>
                                <li>Researcher observations and notes</li>
                            </ul>
                            <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-left: 4px solid #1c5f6d; border-radius: 4px;">
                                <p style="margin: 0; font-size: 12px; color: #666;">
                                    <strong>Estimated:</strong> ${estimatedPages} pages, ${estimatedSize}
                                </p>
                            </div>
                        </div>
                    </div>
                `
            },
            'trend-analysis': {
                title: 'Trend Analysis Report',
                coverContent: `
                    <div class="report-mockup">
                        <div class="report-cover">
                            <div class="cover-top">
                                <div style="color: #1c5f6d; font-size: 28px; font-weight: bold; margin-bottom: 40px;">CORALSENSE</div>
                                <h1 style="margin: 20px 0; font-size: 24px; color: #1c5f6d;">${reportTitle}</h1>
                                <p style="margin: 20px 0; font-size: 14px; color: #666;">Temporal Trend Analysis Report</p>
                            </div>
                            <div class="cover-middle">
                                <div style="width: 60px; height: 60px; background: #2a8793; border-radius: 8px; margin: 40px auto;"></div>
                            </div>
                            <div class="cover-bottom">
                                <p style="margin: 15px 0; font-size: 13px;"><strong>${reportAuthor}</strong></p>
                                <p style="margin: 5px 0; font-size: 12px; color: #666;">DNSC Marine Laboratory</p>
                                <p style="margin: 20px 0; font-size: 12px; color: #888;">Generated: May 11, 2026</p>
                            </div>
                        </div>
                        <div class="report-summary">
                            <h3 style="margin-top: 0; color: #1c5f6d;">Report Contents</h3>
                            <ul style="font-size: 13px; line-height: 1.8; color: #555;">
                                <li>Coverage trend line charts over time</li>
                                <li>Biodiversity class distribution changes</li>
                                <li>Month-by-month or quarter-by-quarter breakdown</li>
                                <li>Statistical analysis (mean, median, std dev)</li>
                                <li>Trend interpretation and forecasts</li>
                                <li>Conservation recommendations</li>
                            </ul>
                            <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-left: 4px solid #1c5f6d; border-radius: 4px;">
                                <p style="margin: 0; font-size: 12px; color: #666;">
                                    <strong>Estimated:</strong> ${estimatedPages} pages, ${estimatedSize}
                                </p>
                            </div>
                        </div>
                    </div>
                `
            },
            'location-comparison': {
                title: 'Location Comparison Report',
                coverContent: `
                    <div class="report-mockup">
                        <div class="report-cover">
                            <div class="cover-top">
                                <div style="color: #1c5f6d; font-size: 28px; font-weight: bold; margin-bottom: 40px;">CORALSENSE</div>
                                <h1 style="margin: 20px 0; font-size: 24px; color: #1c5f6d;">${reportTitle}</h1>
                                <p style="margin: 20px 0; font-size: 14px; color: #666;">Multi-Site Comparison Report</p>
                            </div>
                            <div class="cover-middle">
                                <div style="width: 60px; height: 60px; background: #2a8793; border-radius: 8px; margin: 40px auto;"></div>
                            </div>
                            <div class="cover-bottom">
                                <p style="margin: 15px 0; font-size: 13px;"><strong>${reportAuthor}</strong></p>
                                <p style="margin: 5px 0; font-size: 12px; color: #666;">DNSC Marine Laboratory</p>
                                <p style="margin: 20px 0; font-size: 12px; color: #888;">Generated: May 11, 2026</p>
                            </div>
                        </div>
                        <div class="report-summary">
                            <h3 style="margin-top: 0; color: #1c5f6d;">Report Contents</h3>
                            <ul style="font-size: 13px; line-height: 1.8; color: #555;">
                                <li>Location profiles and metadata</li>
                                <li>Side-by-side comparison tables</li>
                                <li>Comparative charts (grouped bar charts)</li>
                                <li>Geographic map showing all locations</li>
                                <li>Statistical significance analysis</li>
                                <li>Site-specific recommendations</li>
                            </ul>
                            <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-left: 4px solid #1c5f6d; border-radius: 4px;">
                                <p style="margin: 0; font-size: 12px; color: #666;">
                                    <strong>Estimated:</strong> ${estimatedPages} pages, ${estimatedSize}
                                </p>
                            </div>
                        </div>
                    </div>
                `
            },
            'biodiversity': {
                title: 'Biodiversity Distribution Report',
                coverContent: `
                    <div class="report-mockup">
                        <div class="report-cover">
                            <div class="cover-top">
                                <div style="color: #1c5f6d; font-size: 28px; font-weight: bold; margin-bottom: 40px;">CORALSENSE</div>
                                <h1 style="margin: 20px 0; font-size: 24px; color: #1c5f6d;">${reportTitle}</h1>
                                <p style="margin: 20px 0; font-size: 14px; color: #666;">Biodiversity Classification Analysis</p>
                            </div>
                            <div class="cover-middle">
                                <div style="width: 60px; height: 60px; background: #2a8793; border-radius: 8px; margin: 40px auto;"></div>
                            </div>
                            <div class="cover-bottom">
                                <p style="margin: 15px 0; font-size: 13px;"><strong>${reportAuthor}</strong></p>
                                <p style="margin: 5px 0; font-size: 12px; color: #666;">DNSC Marine Laboratory</p>
                                <p style="margin: 20px 0; font-size: 12px; color: #888;">Generated: May 11, 2026</p>
                            </div>
                        </div>
                        <div class="report-summary">
                            <h3 style="margin-top: 0; color: #1c5f6d;">Report Contents</h3>
                            <ul style="font-size: 13px; line-height: 1.8; color: #555;">
                                <li>Class A/B/C distribution analysis (pie charts)</li>
                                <li>Geographic biodiversity hotspot maps</li>
                                <li>Temporal patterns and changes</li>
                                <li>Conservation priority ranking</li>
                                <li>Degradation zone identification</li>
                                <li>Actionable conservation recommendations</li>
                            </ul>
                            <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-left: 4px solid #1c5f6d; border-radius: 4px;">
                                <p style="margin: 0; font-size: 12px; color: #666;">
                                    <strong>Estimated:</strong> ${estimatedPages} pages, ${estimatedSize}
                                </p>
                            </div>
                        </div>
                    </div>
                `
            },
            'custom': {
                title: 'Custom Report',
                coverContent: `
                    <div class="report-mockup">
                        <div class="report-cover">
                            <div class="cover-top">
                                <div style="color: #1c5f6d; font-size: 28px; font-weight: bold; margin-bottom: 40px;">CORALSENSE</div>
                                <h1 style="margin: 20px 0; font-size: 24px; color: #1c5f6d;">${reportTitle}</h1>
                                <p style="margin: 20px 0; font-size: 14px; color: #666;">Customized Report - Your Configuration</p>
                            </div>
                            <div class="cover-middle">
                                <div style="width: 60px; height: 60px; background: #2a8793; border-radius: 8px; margin: 40px auto;"></div>
                            </div>
                            <div class="cover-bottom">
                                <p style="margin: 15px 0; font-size: 13px;"><strong>${reportAuthor}</strong></p>
                                <p style="margin: 5px 0; font-size: 12px; color: #666;">DNSC Marine Laboratory</p>
                                <p style="margin: 20px 0; font-size: 12px; color: #888;">Generated: May 11, 2026</p>
                            </div>
                        </div>
                        <div class="report-summary">
                            <h3 style="margin-top: 0; color: #1c5f6d;">Report Contents</h3>
                            <ul style="font-size: 13px; line-height: 1.8; color: #555;">
                                <li>Based on ${totalBatches} survey batches</li>
                                <li>Includes ${totalImages} processed images</li>
                                <li>Custom section selection from available modules</li>
                                <li>Personalized analysis based on your needs</li>
                                <li>Flexible formatting and export options</li>
                                <li>Complete data appendix available</li>
                            </ul>
                            <div style="margin-top: 20px; padding: 12px; background: #f5f5f5; border-left: 4px solid #1c5f6d; border-radius: 4px;">
                                <p style="margin: 0; font-size: 12px; color: #666;">
                                    <strong>Estimated:</strong> ${estimatedPages} pages, ${estimatedSize}
                                </p>
                            </div>
                        </div>
                    </div>
                `
            }
        };

        return typeConfig[reportType]?.coverContent || `
            <div class="preview-card">
                <h4>Report Preview</h4>
                <p>Select a report type to see preview</p>
            </div>
        `;
    }

    /**
     * Update summary statistics display
     */
    function updateSummaryStatistics() {
        const summaryBatches = document.getElementById('summary-batches');
        const summaryImages = document.getElementById('summary-images');

        // In a real scenario, this would fetch updated counts based on filters
        // For now, we'll keep the existing values
        console.log('Summary statistics updated');
    }

    /**
     * Update review summary with current selections
     */
    function updateReviewSummary() {
        const reportTypeRadio = document.querySelector('input[name="report_type"]:checked');
        const exportFormatRadio = document.querySelector('input[name="export_format"]:checked');
        const dateFromInput = document.getElementById('date-from');
        const dateToInput = document.getElementById('date-to');

        if (!reportTypeRadio || !exportFormatRadio) return;

        // Get report type label
        const reportTypeLabel = reportTypeRadio.closest('.report-type-option')?.querySelector('.option-title')?.textContent || reportTypeRadio.value;

        // Get date range
        const dateFrom = dateFromInput?.value || 'All dates';
        const dateTo = dateToInput?.value || 'Today';
        const dateRange = dateFrom === 'All dates' ? 'All dates' : `${dateFrom} to ${dateTo}`;

        // Get batch/image counts
        const batchCount = document.getElementById('summary-batches')?.textContent || '0';
        const imageCount = document.getElementById('summary-images')?.textContent || '0';
        const coverage = `${batchCount} batches, ${imageCount} images`;

        // Get export format label
        const formatLabel = exportFormatRadio.closest('.format-option')?.querySelector('.format-title')?.textContent || exportFormatRadio.value;

        // Get estimated size (this is simplified; in production, calculate dynamically)
        const estimatedSize = exportFormatRadio.value === 'pdf' ? '3.2 MB' :
            exportFormatRadio.value === 'docx' ? '2.1 MB' :
                exportFormatRadio.value === 'xlsx' ? '845 KB' :
                    exportFormatRadio.value === 'csv' ? '120 KB' : '1.5 MB';
        const estimate = `${Math.ceil(batchCount / 5) + 8} pages, ${estimatedSize}`;

        // Update review display
        const reviewType = document.getElementById('review-type');
        const reviewDates = document.getElementById('review-dates');
        const reviewCoverage = document.getElementById('review-coverage');
        const reviewFormat = document.getElementById('review-format');
        const reviewEstimate = document.getElementById('review-estimate');

        if (reviewType) reviewType.textContent = reportTypeLabel;
        if (reviewDates) reviewDates.textContent = dateRange;
        if (reviewCoverage) {
            document.getElementById('review-batches').textContent = batchCount;
            document.getElementById('review-images').textContent = imageCount;
        }
        if (reviewFormat) reviewFormat.textContent = formatLabel;
        if (reviewEstimate) reviewEstimate.textContent = estimate;

        // Reinitialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    /**
     * Initialize button handlers
     */
    function initializeButtonHandlers() {
        console.log('🔘 Initializing button handlers...');

        const btnCancel = document.getElementById('btn-cancel');
        const btnPreview = document.getElementById('btn-preview');
        const btnGenerate = document.getElementById('btn-generate');
        const reportForm = document.getElementById('report-form');

        console.log('Buttons found:', {
            cancel: !!btnCancel,
            preview: !!btnPreview,
            generate: !!btnGenerate,
            form: !!reportForm
        });

        if (btnCancel) {
            btnCancel.addEventListener('click', function (e) {
                e.preventDefault();
                console.log('Cancel clicked');
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
            });
        }

        if (btnPreview) {
            btnPreview.addEventListener('click', function (e) {
                e.preventDefault();
                console.log('Preview clicked');

                const reportType = document.querySelector('input[name="report_type"]:checked')?.value;
                if (reportType) {
                    // Scroll to preview section
                    const previewSection = document.querySelector('.report-preview');
                    if (previewSection) {
                        previewSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            });
        }

        if (btnGenerate) {
            btnGenerate.addEventListener('click', function (e) {
                e.preventDefault();
                console.log('Generate Report clicked');

                const reportType = document.querySelector('input[name="report_type"]:checked')?.value;
                const exportFormat = document.querySelector('input[name="export_format"]:checked')?.value;

                console.log('Form data check:', { reportType, exportFormat });

                if (!reportType || !exportFormat) {
                    alert('Please select both report type and export format');
                    return;
                }

                // Show loading state
                const originalText = btnGenerate.innerHTML;
                btnGenerate.disabled = true;
                btnGenerate.innerHTML = '<i data-lucide="loader-circle" aria-hidden="true" style="animation: spin 1s linear infinite;"></i><span>Generating...</span>';

                console.log('Submitting form to:', reportForm.action);

                // Submit form via AJAX
                const formData = new FormData(reportForm);

                fetch(reportForm.action, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                    }
                })
                    .then(response => {
                        console.log('Response status:', response.status);
                        return response.json();
                    })
                    .then(data => {
                        console.log('Response data:', data);

                        if (data.status === 'success') {
                            alert('✓ Report generated successfully! It will appear in your recent reports.');
                            setTimeout(() => window.location.reload(), 1500);
                        } else {
                            alert(`❌ Error: ${data.message}`);
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        alert('❌ An error occurred while generating the report. Check console for details.');
                    })
                    .finally(() => {
                        // Restore button state
                        btnGenerate.disabled = false;
                        btnGenerate.innerHTML = originalText;
                        window.lucide?.createIcons?.();
                    });
            });
        }

        console.log('✓ Button handlers initialized');
    }

    // Initialize all handlers
    initializeButtonHandlers();
    initializeRecentReportsHandlers();
    initializeScrollToBuilder();
});

/**
 * Initialize recent reports section handlers
 */
function initializeRecentReportsHandlers() {
    const reportsSearch = document.getElementById('reports-search');
    const filterType = document.getElementById('filter-type');
    const sortBy = document.getElementById('sort-by');
    const reportItems = document.querySelectorAll('.report-item');
    const actionBtns = document.querySelectorAll('.action-btn');

    // Search functionality
    if (reportsSearch) {
        reportsSearch.addEventListener('input', function (e) {
            const searchTerm = e.target.value.toLowerCase();
            reportItems.forEach(item => {
                const title = item.querySelector('.report-item-title').textContent.toLowerCase();
                item.style.display = title.includes(searchTerm) ? 'flex' : 'none';
            });
        });
    }

    // Filter by type
    if (filterType) {
        filterType.addEventListener('change', function (e) {
            const selectedType = e.target.value;
            reportItems.forEach(item => {
                const itemType = item.getAttribute('data-report-type');
                item.style.display = !selectedType || itemType === selectedType ? 'flex' : 'none';
            });
        });
    }

    // Sort functionality
    if (sortBy) {
        sortBy.addEventListener('change', function (e) {
            const sortOption = e.target.value;
            console.log('Sorting by:', sortOption);
            // In production, this would sort the actual items
        });
    }

    // Action button handlers
    console.log('🔍 Found ' + actionBtns.length + ' action buttons');

    actionBtns.forEach((btn, index) => {
        console.log(`📌 Attaching handler to action button ${index}`, btn);

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Find the specific action (view, download, or menu) - exclude "action-btn" base class
            const action = Array.from(btn.classList).find(cls =>
                cls.startsWith('action-') && cls !== 'action-btn'
            );
            const reportItem = btn.closest('.report-item');
            const reportId = reportItem?.dataset?.reportId;
            const reportTitle = reportItem?.querySelector('.report-item-title')?.textContent || 'Unknown';

            console.log('🔘 Button clicked:', { action, reportId, reportTitle });

            if (action === 'action-view') {
                const url = `/accounts/researcher/reports/${reportId}/view/`;
                console.log('➡️ Navigating to:', url);
                window.location.href = url;
            } else if (action === 'action-download') {
                const url = `/accounts/researcher/reports/${reportId}/download/`;
                console.log('⬇️ Downloading from:', url);
                window.location.href = url;
            } else if (action === 'action-menu') {
                console.log('⚙️ Menu for:', reportTitle);
                const menuWrapper = btn.closest('.action-menu-wrapper');
                if (menuWrapper) {
                    menuWrapper.classList.toggle('active');
                    // Close other dropdowns
                    document.querySelectorAll('.action-menu-wrapper.active').forEach(wrapper => {
                        if (wrapper !== menuWrapper) {
                            wrapper.classList.remove('active');
                        }
                    });
                }
            }
        });
    });

    // Delete menu item handlers
    const deleteMenuItems = document.querySelectorAll('.action-delete');
    deleteMenuItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const reportId = item.getAttribute('data-report-id');
            const reportItem = item.closest('.report-item');
            const reportTitle = reportItem?.querySelector('.report-item-title')?.textContent || 'Unknown Report';

            console.log('🗑️ Delete requested for report:', { reportId, reportTitle });

            // Close the dropdown
            const menuWrapper = item.closest('.action-menu-wrapper');
            if (menuWrapper) {
                menuWrapper.classList.remove('active');
            }

            // Show delete confirmation modal
            showDeleteModal(reportId, reportTitle);
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.action-menu-wrapper')) {
            document.querySelectorAll('.action-menu-wrapper.active').forEach(wrapper => {
                wrapper.classList.remove('active');
            });
        }
    });
}

/**
 * Show delete confirmation modal
 */
function showDeleteModal(reportId, reportTitle) {
    const deleteModal = document.querySelector('[data-delete-modal]');
    const reportNameSpan = document.getElementById('delete-report-name');
    const deleteConfirmBtn = document.querySelector('[data-delete-confirm]');
    const deleteCancelBtn = document.querySelector('[data-delete-cancel]');

    if (!deleteModal) {
        console.error('Delete modal not found');
        return;
    }

    // Set report title in modal
    reportNameSpan.textContent = reportTitle;

    // Show modal
    deleteModal.classList.add('is-visible');
    deleteModal.setAttribute('aria-hidden', 'false');

    // Delete confirmation handler
    const handleConfirm = async function () {
        console.log('🗑️ Confirming delete for report:', reportId);
        deleteModal.classList.remove('is-visible');
        deleteModal.setAttribute('aria-hidden', 'true');

        try {
            const response = await fetch(`/accounts/researcher/reports/${reportId}/delete/`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || ''
                }
            });

            if (response.ok) {
                console.log('✓ Report deleted successfully');
                // Remove the report item from the list
                const reportItem = document.querySelector(`[data-report-id="${reportId}"]`).closest('.report-item');
                if (reportItem) {
                    reportItem.style.animation = 'fadeOut 300ms ease forwards';
                    setTimeout(() => {
                        reportItem.remove();
                        // Show empty state if no reports left
                        const reportsList = document.querySelector('.reports-list');
                        if (reportsList && reportsList.children.length === 0) {
                            location.reload();
                        }
                    }, 300);
                }
            } else {
                console.error('Failed to delete report:', response.statusText);
                alert('Failed to delete report. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting report:', error);
            alert('Error deleting report: ' + error.message);
        } finally {
            // Clean up event listeners
            deleteConfirmBtn.removeEventListener('click', handleConfirm);
            deleteCancelBtn.removeEventListener('click', handleCancel);
        }
    };

    // Cancel handler
    const handleCancel = function () {
        console.log('Cancel delete');
        deleteModal.classList.remove('is-visible');
        deleteModal.setAttribute('aria-hidden', 'true');
        deleteConfirmBtn.removeEventListener('click', handleConfirm);
        deleteCancelBtn.removeEventListener('click', handleCancel);
    };

    // Attach event listeners
    deleteConfirmBtn.addEventListener('click', handleConfirm);
    deleteCancelBtn.addEventListener('click', handleCancel);

    // Allow ESC key to close modal
    const handleEsc = function (e) {
        if (e.key === 'Escape') {
            handleCancel();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

/**
 * Initialize scroll to builder button
 */
function initializeScrollToBuilder() {
    const scrollBtn = document.getElementById('scroll-to-builder');
    if (scrollBtn) {
        scrollBtn.addEventListener('click', function () {
            const section1 = document.getElementById('section-1');
            if (section1) {
                section1.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}



// Add some basic styling for preview cards via JavaScript
const style = document.createElement('style');
style.textContent = `
    .preview-card {
        padding: 1.5rem;
        background: white;
        border-radius: 8px;
        border-left: 4px solid #1c5f6d;
        box-shadow: 0 2px 8px rgba(28, 95, 109, 0.08);
    }

    .preview-card h4 {
        margin: 0 0 1rem;
        font-size: 1rem;
        color: #1c5f6d;
        font-weight: 700;
    }

    .preview-items {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .preview-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid #e8ecf1;
    }

    .preview-item:last-child {
        border-bottom: none;
    }

    .preview-item .label {
        font-weight: 600;
        color: #4a5568;
        font-size: 0.9rem;
    }

    .preview-item .value {
        color: #1c5f6d;
        font-size: 0.9rem;
        font-weight: 500;
    }
`;
document.head.appendChild(style);
