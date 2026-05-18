/**
 * CoralSense - Pure Vanilla JavaScript
 * No frameworks, no dependencies - just vanilla JS
 */

// ===== Form Validation =====
class FormValidator {
    constructor(formSelector) {
        this.form = document.querySelector(formSelector);
        this.hasSubmitted = false;
        if (this.form) {
            this.setupValidation();
        }
    }

    setupValidation() {
        const inputs = this.form.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', (e) => {
                const hasValue = e.target.value.trim() !== '';
                if (this.hasSubmitted || hasValue) {
                    this.validateField(e.target);
                }
            });
            input.addEventListener('input', (e) => this.validateField(e.target, true));
        });

        this.form.addEventListener('submit', (e) => this.validateForm(e));
    }

    validateField(field, removeError = false) {
        const fieldName = field.name;
        const fieldValue = field.value.trim();
        let isValid = true;
        let errorMessage = '';
        const errorHost = field.closest('.form-group') || field.parentElement;

        if (field.type === 'hidden') return true;

        const existingError = errorHost.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }

        if (removeError && fieldValue === '') {
            field.classList.remove('is-invalid');
            return true;
        }

        if (fieldValue === '' && field.hasAttribute('required')) {
            isValid = false;
            const readableFieldName = field.id
                .replace('id_', '')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (char) => char.toUpperCase());
            errorMessage = `${readableFieldName} is required`;
        }

        // Email validation
        if ((fieldName === 'email' || field.type === 'email') && fieldValue !== '') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(fieldValue)) {
                isValid = false;
                errorMessage = 'Please enter a valid email address';
            }
        }

        // Name validation
        if ((fieldName === 'first_name' || fieldName === 'last_name') && fieldValue !== '') {
            if (fieldValue.length < 2) {
                isValid = false;
                errorMessage = 'Name must be at least 2 characters';
            }
            if (!/^[a-zA-Z\s'-]+$/.test(fieldValue)) {
                isValid = false;
                errorMessage = 'Name can only contain letters, spaces, hyphens, and apostrophes';
            }
        }

        // Password validation
        if (fieldName === 'password1' && fieldValue !== '') {
            if (fieldValue.length < 8) {
                isValid = false;
                errorMessage = 'Password must be at least 8 characters';
            }
            if (!/[A-Z]/.test(fieldValue)) {
                isValid = false;
                errorMessage = 'Password must contain at least one uppercase letter';
            }
            if (!/[a-z]/.test(fieldValue)) {
                isValid = false;
                errorMessage = 'Password must contain at least one lowercase letter';
            }
            if (!/[0-9]/.test(fieldValue)) {
                isValid = false;
                errorMessage = 'Password must contain at least one number';
            }
            if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(fieldValue)) {
                isValid = false;
                errorMessage = 'Password must contain at least one special character';
            }
        }

        // Password confirmation match
        if (fieldName === 'password2') {
            const password1 = this.form.querySelector('[name="password1"]');
            if (password1 && fieldValue !== password1.value) {
                isValid = false;
                errorMessage = 'Passwords do not match';
            }
        }

        if (!isValid) {
            field.classList.add('is-invalid');
            field.classList.remove('is-valid');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'field-error';
            errorDiv.textContent = errorMessage;
            errorHost.appendChild(errorDiv);
        } else {
            field.classList.remove('is-invalid');
            if (fieldValue !== '') {
                field.classList.add('is-valid');
            }
        }

        return isValid;
    }

    validateForm(e) {
        this.hasSubmitted = true;
        let isFormValid = true;
        const inputs = this.form.querySelectorAll('input[required], textarea[required]');

        inputs.forEach(input => {
            if (!this.validateField(input)) {
                isFormValid = false;
            }
        });

        if (!isFormValid) {
            e.preventDefault();
            Toast.show('Please fix the errors above', 'danger');
        }
    }
}

// ===== Password Strength Indicator =====
class PasswordStrength {
    constructor(passwordFieldSelector) {
        this.passwordField = document.querySelector(passwordFieldSelector);
        if (this.passwordField) {
            this.setupStrengthIndicator();
        }
    }

    setupStrengthIndicator() {
        const strengthContainer = document.createElement('div');
        strengthContainer.className = 'password-strength-container';
        strengthContainer.innerHTML = `
            <div class="password-strength-meter">
                <div class="password-strength-bar" style="width: 0%;"></div>
            </div>
            <small class="password-strength-text">Password strength: <span>Very Weak</span></small>
        `;
        this.passwordField.parentElement.appendChild(strengthContainer);

        this.strengthBar = strengthContainer.querySelector('.password-strength-bar');
        this.strengthText = strengthContainer.querySelector('span');

        this.passwordField.addEventListener('input', () => this.checkPasswordStrength());
    }

    checkPasswordStrength() {
        const password = this.passwordField.value;
        let strength = 0;
        let strengthLabel = 'Very Weak';
        let strengthColor = '#dc3545';

        if (password.length >= 8) strength += 20;
        if (password.length >= 12) strength += 20;
        if (/[A-Z]/.test(password)) strength += 15;
        if (/[a-z]/.test(password)) strength += 15;
        if (/[0-9]/.test(password)) strength += 15;
        if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 15;

        if (strength < 20) {
            strengthLabel = 'Very Weak';
            strengthColor = '#dc3545';
        } else if (strength < 40) {
            strengthLabel = 'Weak';
            strengthColor = '#fd7e14';
        } else if (strength < 60) {
            strengthLabel = 'Fair';
            strengthColor = '#ffc107';
        } else if (strength < 80) {
            strengthLabel = 'Good';
            strengthColor = '#20c997';
        } else {
            strengthLabel = 'Strong';
            strengthColor = '#28a745';
        }

        this.strengthBar.style.width = strength + '%';
        this.strengthBar.style.backgroundColor = strengthColor;
        this.strengthText.textContent = strengthLabel;
    }
}

// ===== Password Visibility Toggle =====
class PasswordToggle {
    constructor() {
        this.showIconPath = '/static/icons/show.png';
        this.hideIconPath = '/static/icons/hide.png';
        this.setupToggle();
    }

    setupToggle() {
        const passwordFields = document.querySelectorAll('input[type="password"]');

        passwordFields.forEach((field) => {
            const container = document.createElement('div');
            container.className = 'password-input-container';

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'password-toggle-btn';
            toggleBtn.setAttribute('aria-label', 'Show password');
            toggleBtn.setAttribute('title', 'Show password');

            const icon = document.createElement('img');
            icon.src = this.showIconPath;
            icon.alt = '';
            icon.className = 'password-toggle-icon';
            toggleBtn.appendChild(icon);

            field.parentElement.style.position = 'relative';
            field.parentElement.insertBefore(container, field);
            container.appendChild(field);
            container.appendChild(toggleBtn);

            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.togglePasswordVisibility(field, toggleBtn);
            });
        });
    }

    togglePasswordVisibility(field, btn) {
        const icon = btn.querySelector('.password-toggle-icon');
        if (field.type === 'password') {
            field.type = 'text';
            if (icon) {
                icon.src = this.hideIconPath;
            }
            btn.setAttribute('aria-label', 'Hide password');
            btn.setAttribute('title', 'Hide password');
        } else {
            field.type = 'password';
            if (icon) {
                icon.src = this.showIconPath;
            }
            btn.setAttribute('aria-label', 'Show password');
            btn.setAttribute('title', 'Show password');
        }
    }
}

// ===== Loader =====
class Loader {
    static show() {
        let loader = document.getElementById('global-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.className = 'global-loader show';
            loader.innerHTML = '<div class="spinner"></div>';
            document.body.appendChild(loader);
        } else {
            loader.classList.add('show');
        }
    }

    static hide() {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.classList.remove('show');
        }
    }
}

// ===== Toast Notifications =====
class Toast {
    static show(message, type = 'info', duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            ${message}
            <button class="toast-close" type="button">✕</button>
        `;

        document.body.appendChild(toast);

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        });

        if (duration > 0) {
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    toast.style.animation = 'slideOutRight 0.3s ease';
                    setTimeout(() => toast.remove(), 300);
                }
            }, duration);
        }
    }
}

// ===== Modal =====
class Modal {
    static show(title, message, onConfirm, onCancel = null) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay show';
        overlay.id = 'confirmModal';

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
                <button type="button" class="modal-close">✕</button>
            </div>
            <div class="modal-body">
                ${message}
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                <button type="button" class="btn btn-primary confirm-btn">Confirm</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeBtn = modal.querySelector('.modal-close');
        const confirmBtn = modal.querySelector('.confirm-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');

        const closeModal = () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        confirmBtn.addEventListener('click', () => {
            closeModal();
            if (onConfirm) onConfirm();
        });

        if (onCancel) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal();
                    onCancel();
                }
            });
        }
    }
}

// ===== Smooth Scrolling =====
class SmoothScroll {
    constructor() {
        this.setupSmoothScrolling();
    }

    setupSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const href = anchor.getAttribute('href');
                if (href !== '#') {
                    const target = document.querySelector(href);
                    if (target) {
                        e.preventDefault();
                        target.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                }
            });
        });
    }
}

// ===== Navigation Toggle =====
class NavToggle {
    constructor() {
        this.setupToggle();
    }

    setupToggle() {
        const toggle = document.querySelector('.nav-toggle');
        const menu = document.querySelector('.nav-menu');

        if (toggle && menu) {
            toggle.addEventListener('click', () => {
                menu.classList.toggle('show');
            });

            // Close menu when link clicked
            menu.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    menu.classList.remove('show');
                });
            });
        }
    }
}

// ===== Initialize All Features =====
const initializeCoralSense = () => {
    // Render Django messages as toast popups.
    const djangoMessages = document.querySelectorAll('#django-messages [data-message]');
    const shownMessages = new Set();
    const inlineAlertTexts = new Set(
        Array.from(document.querySelectorAll('.alert')).map((alert) =>
            alert.textContent.replace('✕', '').trim()
        )
    );

    djangoMessages.forEach((item) => {
        const rawTags = (item.getAttribute('data-tags') || 'info').toLowerCase();
        const message = item.getAttribute('data-message') || '';
        const type = rawTags.includes('error') ? 'danger' :
            rawTags.includes('success') ? 'success' :
                rawTags.includes('warning') ? 'warning' : 'info';

        if (message && !shownMessages.has(message) && !inlineAlertTexts.has(message.trim())) {
            Toast.show(message, type, 6000);
            shownMessages.add(message);
        }
    });

    // Close any remaining inline alerts when their close button is clicked.
    document.querySelectorAll('.alert-close-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const alert = btn.closest('.alert');
            if (alert) {
                alert.remove();
            }
        });
    });

    // Initialize validators
    const form = document.querySelector('form');
    if (form) {
        new FormValidator('form');
    }

    // Initialize password features
    const passwordField = document.querySelector('input[name="password1"]');
    if (passwordField) {
        new PasswordStrength('input[name="password1"]');
    }

    new PasswordToggle();

    // Initialize navigation
    new NavToggle();

    // Initialize smooth scrolling
    new SmoothScroll();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn && !submitBtn.disabled) {
                submitBtn.click();
            }
        }
    });

    // Prevent double submissions
    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form.classList.contains('prevent-double-submit')) {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                if (!submitBtn.dataset.originalHtml) {
                    submitBtn.dataset.originalHtml = submitBtn.innerHTML;
                }

                setTimeout(() => {
                    submitBtn.disabled = false;
                    if (submitBtn.dataset.originalHtml) {
                        submitBtn.innerHTML = submitBtn.dataset.originalHtml;
                    }
                }, 1000);
            }
        }
    });

    // ===== Sidebar Dropdown Navigation =====
    const sidebarDropdowns = document.querySelectorAll('.sidebar-nav-toggle');

    sidebarDropdowns.forEach(function (toggle) {
        toggle.addEventListener('click', function (event) {
            event.preventDefault();
            const dropdown = toggle.closest('.sidebar-nav-dropdown');
            const isOpen = dropdown.classList.contains('is-open');

            if (isOpen) {
                dropdown.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
                const items = dropdown.querySelector('.sidebar-nav-items');
                if (items) items.setAttribute('hidden', '');
            } else {
                dropdown.classList.add('is-open');
                toggle.setAttribute('aria-expanded', 'true');
                const items = dropdown.querySelector('.sidebar-nav-items');
                if (items) items.removeAttribute('hidden');
            }
        });
    });

    // ===== Profile Menu Dropdown =====
    const profileMenu = document.querySelector('[data-profile-menu]');
    const profileTrigger = document.querySelector('[data-profile-trigger]');
    const profileDropdown = document.querySelector('[data-profile-dropdown]');

    if (profileMenu && profileTrigger && profileDropdown) {
        const closeMenu = function () {
            profileMenu.classList.remove('is-open');
            profileTrigger.setAttribute('aria-expanded', 'false');
            profileDropdown.setAttribute('aria-hidden', 'true');
        };

        const openMenu = function () {
            profileMenu.classList.add('is-open');
            profileTrigger.setAttribute('aria-expanded', 'true');
            profileDropdown.setAttribute('aria-hidden', 'false');
        };

        profileTrigger.addEventListener('click', function (event) {
            event.stopPropagation();

            if (profileMenu.classList.contains('is-open')) {
                closeMenu();
                return;
            }

            openMenu();
        });

        document.addEventListener('click', function (event) {
            if (!profileMenu.contains(event.target)) {
                closeMenu();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeMenu();
            }
        });

        profileDropdown.querySelectorAll('.profile-dropdown-item').forEach(function (item) {
            item.addEventListener('click', function () {
                closeMenu();
            });
        });
    }

    // ===== Logout Modal =====
    const logoutLink = document.querySelector('[data-logout-link]');
    const logoutModal = document.querySelector('[data-logout-modal]');
    const logoutCancel = document.querySelector('[data-logout-cancel]');
    const logoutConfirm = document.querySelector('[data-logout-confirm]');

    if (logoutLink && logoutModal && logoutCancel && logoutConfirm) {
        const openLogoutModal = function () {
            logoutModal.classList.add('is-visible');
            logoutModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
            logoutConfirm.focus();
        };

        const closeLogoutModal = function () {
            logoutModal.classList.remove('is-visible');
            logoutModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
        };

        logoutLink.addEventListener('click', function (event) {
            event.preventDefault();
            openLogoutModal();
        });

        logoutCancel.addEventListener('click', closeLogoutModal);

        logoutConfirm.addEventListener('click', function () {
            window.location.href = logoutLink.getAttribute('href');
        });

        logoutModal.addEventListener('click', function (event) {
            if (event.target === logoutModal) {
                closeLogoutModal();
            }
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && logoutModal.classList.contains('is-visible')) {
                closeLogoutModal();
            }
        });
    }

    console.log('✨ CoralSense JavaScript initialized successfully');
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCoralSense);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeCoralSense();
}
