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

        // Profile menu
        this.setupProfileMenu();
    }

    setupProfileMenu() {
        const profileMenu = document.querySelector('[data-profile-menu]');
        const profileTrigger = document.querySelector('[data-profile-trigger]');
        const profileDropdown = document.querySelector('[data-profile-dropdown]');

        if (profileMenu && profileTrigger && profileDropdown) {
            const closeMenu = () => {
                profileMenu.classList.remove('is-open');
                profileTrigger.setAttribute('aria-expanded', 'false');
                profileDropdown.setAttribute('aria-hidden', 'true');
            };

            const openMenu = () => {
                profileMenu.classList.add('is-open');
                profileTrigger.setAttribute('aria-expanded', 'true');
                profileDropdown.setAttribute('aria-hidden', 'false');
            };

            profileTrigger.addEventListener('click', (event) => {
                event.stopPropagation();
                if (profileMenu.classList.contains('is-open')) {
                    closeMenu();
                } else {
                    openMenu();
                }
            });

            document.addEventListener('click', (e) => {
                if (!profileMenu.contains(e.target)) {
                    closeMenu();
                }
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeMenu();
                }
            });

            profileDropdown.querySelectorAll('.profile-dropdown-item').forEach((item) => {
                item.addEventListener('click', closeMenu);
            });
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
document.addEventListener('DOMContentLoaded', () => {
    reportsManager = new ReportsManager();

    // Logout functionality
    const logoutLink = document.querySelector('[data-logout-link]');
    const logoutModal = document.querySelector('[data-logout-modal]');
    const logoutCancel = document.querySelector('[data-logout-cancel]');
    const logoutConfirm = document.querySelector('[data-logout-confirm]');

    if (logoutLink && logoutModal) {
        const openLogoutModal = () => {
            logoutModal.classList.add('is-visible');
            logoutModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
            logoutConfirm.focus();
        };

        const closeLogoutModal = () => {
            logoutModal.classList.remove('is-visible');
            logoutModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        };

        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            openLogoutModal();
        });

        logoutCancel.addEventListener('click', closeLogoutModal);

        logoutConfirm.addEventListener('click', () => {
            // Submit logout form or redirect
            window.location.href = logoutLink.href;
        });

        // Close modal on background click
        logoutModal.addEventListener('click', (e) => {
            if (e.target === logoutModal) {
                closeLogoutModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && logoutModal.classList.contains('is-visible')) {
                closeLogoutModal();
            }
        });
    }
});

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
