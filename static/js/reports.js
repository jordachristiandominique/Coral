/**
 * Reports page functionality
 * Handles report generation, export, and interactions
 */

class ReportsManager {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initIcons();
    }

    setupEventListeners() {
        const pdfBtn = document.getElementById('generate-pdf-btn');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', () => this.generatePDF());
        }
    }

    initIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    generatePDF() {
        // For now, we'll use the browser's print to PDF feature
        window.print();
    }

    /**
     * Format a number as currency
     */
    formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(value);
    }

    /**
     * Format a number with commas
     */
    formatNumber(value) {
        return new Intl.NumberFormat('en-US').format(value);
    }

    /**
     * Format date to readable format
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Initialize when DOM is ready
let reportsManager;

const initializeReports = () => {
    reportsManager = new ReportsManager();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeReports);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeReports();
}

// Print styles for PDF export
const printStyles = `
    @media print {
        * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body {
            background: white;
            color: #1c5f6d;
            font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .researcher-navbar,
        .researcher-sidebar,
        .report-actions,
        .logout-modal {
            display: none !important;
        }

        .researcher-shell {
            padding: 0 !important;
        }

        .researcher-main {
            padding: 0 !important;
        }

        .reports-main {
            gap: 12px;
        }

        .surface-card {
            page-break-inside: avoid;
            break-inside: avoid;
            box-shadow: none !important;
            border: 1px solid rgba(28, 95, 109, 0.15);
            margin-bottom: 12px;
        }

        .stat-card {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        .classification-grid {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        table {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        thead {
            display: table-header-group;
        }

        tfoot {
            display: table-footer-group;
        }

        tr {
            page-break-inside: avoid;
            break-inside: avoid;
        }

        a {
            text-decoration: underline;
            color: #1c5f6d;
        }

        h1, h2, h3 {
            page-break-after: avoid;
        }
    }
`;

// Add print styles to document
const styleElement = document.createElement('style');
styleElement.textContent = printStyles;
document.head.appendChild(styleElement);
