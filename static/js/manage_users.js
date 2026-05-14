/**
 * Manage Users Page JavaScript
 * Handles deactivate/activate user actions with confirmation modals
 */

document.addEventListener('DOMContentLoaded', function () {
    if (window.lucide) {
        window.lucide.createIcons();
    }

    let pendingUserId = null;
    let pendingUserName = null;

    // ===== Deactivate User Handlers =====
    const deactivateButtons = document.querySelectorAll('.deactivate-btn');
    const deactivateModal = document.querySelector('[data-deactivate-modal]');
    const deactivateUserNameEl = document.getElementById('deactivate-user-name');
    const deactivateCancelBtn = document.querySelector('[data-deactivate-cancel]');
    const deactivateConfirmBtn = document.querySelector('[data-deactivate-confirm]');

    deactivateButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            pendingUserId = this.getAttribute('data-user-id');
            pendingUserName = this.getAttribute('data-user-name');
            deactivateUserNameEl.textContent = `Are you sure you want to deactivate ${pendingUserName}?`;
            deactivateModal.classList.add('is-visible');
            deactivateModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
        });
    });

    deactivateCancelBtn?.addEventListener('click', function () {
        deactivateModal.classList.remove('is-visible');
        deactivateModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        pendingUserId = null;
        pendingUserName = null;
    });

    deactivateConfirmBtn?.addEventListener('click', function () {
        if (pendingUserId) {
            deactivateUser(pendingUserId);
            deactivateModal.classList.remove('is-visible');
            deactivateModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            pendingUserId = null;
            pendingUserName = null;
        }
    });

    deactivateModal?.addEventListener('click', function (e) {
        if (e.target === deactivateModal) {
            deactivateModal.classList.remove('is-visible');
            deactivateModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            pendingUserId = null;
            pendingUserName = null;
        }
    });

    // ===== Activate User Handlers =====
    const activateButtons = document.querySelectorAll('.activate-btn');
    const activateModal = document.querySelector('[data-activate-modal]');
    const activateUserNameEl = document.getElementById('activate-user-name');
    const activateCancelBtn = document.querySelector('[data-activate-cancel]');
    const activateConfirmBtn = document.querySelector('[data-activate-confirm]');

    activateButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            pendingUserId = this.getAttribute('data-user-id');
            pendingUserName = this.getAttribute('data-user-name');
            activateUserNameEl.textContent = `Are you sure you want to activate ${pendingUserName}?`;
            activateModal.classList.add('is-visible');
            activateModal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('modal-open');
        });
    });

    activateCancelBtn?.addEventListener('click', function () {
        activateModal.classList.remove('is-visible');
        activateModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        pendingUserId = null;
        pendingUserName = null;
    });

    activateConfirmBtn?.addEventListener('click', function () {
        if (pendingUserId) {
            activateUser(pendingUserId);
            activateModal.classList.remove('is-visible');
            activateModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            pendingUserId = null;
            pendingUserName = null;
        }
    });

    activateModal?.addEventListener('click', function (e) {
        if (e.target === activateModal) {
            activateModal.classList.remove('is-visible');
            activateModal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('modal-open');
            pendingUserId = null;
            pendingUserName = null;
        }
    });

    // ===== Real-time Filtering =====
    const searchInput = document.getElementById('users-search');
    const roleFilter = document.getElementById('role-filter');
    const statusFilter = document.getElementById('status-filter');
    const userRows = document.querySelectorAll('.user-row');

    const applyFilters = function () {
        const searchTerm = searchInput?.value.toLowerCase() || '';
        const selectedRole = roleFilter?.value || '';
        const selectedStatus = statusFilter?.value || '';

        userRows.forEach(row => {
            let show = true;

            // Search filter - check name and email
            if (searchTerm) {
                const name = row.querySelector('.user-name')?.textContent.toLowerCase() || '';
                const email = row.querySelector('.user-email')?.textContent.toLowerCase() || '';
                show = show && (name.includes(searchTerm) || email.includes(searchTerm));
            }

            // Role filter
            if (selectedRole && show) {
                const roleBadge = row.querySelector('.role-badge');
                const roleText = roleBadge?.textContent.toLowerCase() || '';
                show = show && roleText.includes(selectedRole.toLowerCase());
            }

            // Status filter
            if (selectedStatus && show) {
                const statusBadge = row.querySelector('.status-badge');
                const statusText = statusBadge?.textContent.toLowerCase() || '';
                show = show && statusText.includes(selectedStatus.toLowerCase());
            }

            row.style.display = show ? 'table-row' : 'none';
        });
    };

    // Event listeners for real-time filtering
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    if (roleFilter) {
        roleFilter.addEventListener('change', applyFilters);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }

    // ===== Escape Key Handler =====
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (deactivateModal && deactivateModal.classList.contains('is-visible')) {
                deactivateModal.classList.remove('is-visible');
                deactivateModal.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('modal-open');
            }
            if (activateModal && activateModal.classList.contains('is-visible')) {
                activateModal.classList.remove('is-visible');
                activateModal.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('modal-open');
            }
        }
    });

    // ===== API Functions =====
    function deactivateUser(userId) {
        fetch(`/accounts/researcher/manage-users/${userId}/deactivate/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                } else {
                    showToast(data.error || 'Failed to deactivate user', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('An error occurred while deactivating the user', 'error');
            });
    }

    function activateUser(userId) {
        fetch(`/accounts/researcher/manage-users/${userId}/activate/`, {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCSRFToken(),
                'Content-Type': 'application/json'
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showToast(data.message, 'success');
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                } else {
                    showToast(data.error || 'Failed to activate user', 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showToast('An error occurred while activating the user', 'error');
            });
    }

    // ===== Toast Notification =====
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        const icon = type === 'success' ? 'check-circle' : 'alert-circle';
        toast.innerHTML = `
            <div class="toast-icon">
                <i data-lucide="${icon}" aria-hidden="true"></i>
            </div>
            <div class="toast-message">${message}</div>
            <button type="button" class="toast-close" aria-label="Close">
                <i data-lucide="x" aria-hidden="true"></i>
            </button>
        `;

        container.appendChild(toast);

        if (window.lucide) {
            window.lucide.createIcons();
        }

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.style.animation = 'slideIn 300ms ease reverse';
            setTimeout(() => toast.remove(), 300);
        });

        setTimeout(() => {
            toast.style.animation = 'slideIn 300ms ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ===== CSRF Token Utility =====
    function getCSRFToken() {
        return document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
            document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
            '';
    }
});
