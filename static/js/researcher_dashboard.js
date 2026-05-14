document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('page-researcher-dashboard');

    if (window.lucide) {
        window.lucide.createIcons();
    }

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

    const lineEl = document.getElementById('coverageTrendChart');
    const chartScript = document.getElementById('dashboard-chart-data');
    let chartLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
    let chartValues = [42, 48, 41, 52, 58, 54, 56];

    if (chartScript) {
        try {
            const payload = JSON.parse(chartScript.textContent || '{}');
            if (payload.labels && payload.labels.length) {
                chartLabels = payload.labels;
                chartValues = payload.values || [];
            }
        } catch (error) {
            // Keep fallback values.
        }
    }

    if (lineEl && window.Chart) {
        new Chart(lineEl, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Coverage',
                        data: chartValues,
                        backgroundColor: 'rgba(42, 135, 147, 0.85)',
                        borderRadius: 8,
                        barThickness: 14
                    },
                    {
                        type: 'line',
                        label: 'Trend',
                        data: chartValues,
                        borderColor: '#1c5f6d',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#1c5f6d',
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 10,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(28, 95, 109, 0.08)' }
                    },
                    y: {
                        beginAtZero: false,
                        grid: { color: 'rgba(28, 95, 109, 0.08)' }
                    }
                }
            }
        });
    }
});
