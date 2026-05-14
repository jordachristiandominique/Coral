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

    const clearButton = document.getElementById('batch-clear-btn');
    const batchSearch = document.getElementById('batch-search');
    const batchDateFilter = document.getElementById('batch-date-filter');
    const batchClassFilter = document.getElementById('batch-class-filter');
    const batchCards = document.querySelectorAll('.batch-card');

    // Filter functionality
    const applyFilters = function () {
        const searchTerm = batchSearch.value.toLowerCase();
        const dateFilter = batchDateFilter.value;
        const classFilter = batchClassFilter.value;

        let visibleCards = [];

        batchCards.forEach(card => {
            let show = true;

            // Search filter
            if (searchTerm) {
                const batchName = card.querySelector('.batch-card-head h2')?.textContent.toLowerCase();
                show = show && batchName?.includes(searchTerm);
            }

            // Class filter
            if (classFilter && show) {
                const classMatch = card.querySelector(`.batch-class-badge.class-${classFilter.toLowerCase()}`);
                show = show && !!classMatch;
            }

            card.style.display = show ? 'grid' : 'none';
            if (show) visibleCards.push(card);
        });

        // Date sorting
        if (dateFilter && visibleCards.length > 0) {
            const cardsArray = Array.from(visibleCards);
            cardsArray.sort((a, b) => {
                const dateA = new Date(a.querySelector('.batch-meta span i')?.nextSibling?.textContent || 0);
                const dateB = new Date(b.querySelector('.batch-meta span i')?.nextSibling?.textContent || 0);

                return dateFilter === 'latest' ? dateB - dateA : dateA - dateB;
            });

            const grid = document.querySelector('.batches-grid');
            cardsArray.forEach(card => {
                grid.appendChild(card);
            });
        }
    };

    // Event listeners for filters
    if (batchSearch) {
        batchSearch.addEventListener('input', applyFilters);
    }

    if (batchDateFilter) {
        batchDateFilter.addEventListener('change', applyFilters);
    }

    if (batchClassFilter) {
        batchClassFilter.addEventListener('change', applyFilters);
    }

    if (clearButton && batchSearch && batchDateFilter && batchClassFilter) {
        clearButton.addEventListener('click', function () {
            batchSearch.value = '';
            batchDateFilter.value = '';
            batchClassFilter.value = '';
            applyFilters();
        });
    }
});
