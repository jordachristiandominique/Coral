const initializeBatches = function () {
    document.body.classList.add('page-researcher-dashboard');

    if (window.lucide) {
        window.lucide.createIcons();
    }

    const actionMenus = document.querySelectorAll('.repository-actions-menu');
    actionMenus.forEach(menu => {
        menu.addEventListener('toggle', function () {
            if (menu.open) actionMenus.forEach(other => {
                if (other !== menu) other.open = false;
            });
        });
    });
    if (actionMenus.length) {
        document.addEventListener('click', function (event) {
            actionMenus.forEach(menu => {
                if (!menu.contains(event.target)) menu.open = false;
            });
        });
        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;
            actionMenus.forEach(menu => {
                if (menu.open) {
                    menu.open = false;
                    menu.querySelector('summary').focus();
                }
            });
        });
    }
    const trashModal = document.getElementById('repository-trash-modal');
    const trashConfirmName = document.getElementById('repository-trash-confirm-name');
    const trashConfirm = document.getElementById('repository-trash-confirm');
    let pendingTrashForm = null;
    if (trashModal) {
        trashConfirmName.addEventListener('input', function () {
            trashConfirm.disabled = !pendingTrashForm
                || trashConfirmName.value !== pendingTrashForm.dataset.repositoryName;
        });
        trashModal.querySelectorAll('[data-trash-modal-cancel]').forEach(button => {
            button.addEventListener('click', () => trashModal.close());
        });
        trashModal.addEventListener('click', function (event) {
            if (event.target === trashModal) trashModal.close();
        });
        trashModal.addEventListener('close', function () {
            if (pendingTrashForm) {
                const trigger = pendingTrashForm.closest('details')?.querySelector('summary')
                    || pendingTrashForm.querySelector('button');
                trigger.focus();
            }
            pendingTrashForm = null;
            trashConfirmName.value = '';
            trashConfirm.disabled = true;
        });
        trashConfirm.addEventListener('click', function () {
            if (!pendingTrashForm || trashConfirm.disabled) return;
            const form = pendingTrashForm;
            trashConfirm.disabled = true;
            form.querySelector('button').disabled = true;
            trashModal.close();
            form.submit();
        });
    }
    document.querySelectorAll('form[data-trash-action]').forEach(form => {
        form.addEventListener('submit', function (event) {
            event.preventDefault();
            const name = form.dataset.repositoryName;
            const permanent = form.dataset.trashAction === 'delete';
            const label = permanent ? 'Delete permanently' : 'Move to trash';
            pendingTrashForm = form;
            trashModal.classList.toggle('is-permanent', permanent);
            document.getElementById('repository-trash-title').textContent = label;
            trashConfirm.textContent = label;
            trashModal.querySelector('[data-trash-description-prefix]').textContent = permanent
                ? 'Permanently delete ' : 'Move ';
            trashModal.querySelector('[data-trash-description-suffix]').textContent = permanent
                ? '? All its transects, uploaded images and analysis results will be permanently deleted.'
                : ' to Trash? You can restore it from the Trash page.';
            document.getElementById('repository-trash-warning').hidden = !permanent;
            trashModal.setAttribute('aria-describedby', permanent
                ? 'repository-trash-description repository-trash-warning' : 'repository-trash-description');
            trashModal.querySelectorAll('[data-trash-repository-name]').forEach(node => {
                node.textContent = name;
            });
            trashConfirmName.value = '';
            trashConfirmName.placeholder = name;
            trashConfirm.disabled = true;
            const menu = form.closest('details');
            if (menu) menu.open = false;
            trashModal.showModal();
            trashConfirmName.focus();
        });
    });

    // Fill each card's HCC bar from its data-width (kept off the inline style so
    // the template stays clean); a tick later so the width transition animates.
    const hccFills = document.querySelectorAll('.batch-hcc-bar > span[data-width]');
    requestAnimationFrame(function () {
        hccFills.forEach(function (fill) {
            const w = parseFloat(fill.getAttribute('data-width'));
            fill.style.width = (Number.isFinite(w) ? Math.max(0, Math.min(100, w)) : 0) + '%';
        });
    });

    // ===== Batch Filtering =====
    const clearButton = document.getElementById('batch-clear-btn');
    const batchSearch = document.getElementById('batch-search');
    const batchDateFilter = document.getElementById('batch-date-filter');
    const batchClassFilter = document.getElementById('batch-class-filter');
    const dateFrom = document.getElementById('batch-date-from');
    const dateTo = document.getElementById('batch-date-to');
    const filterStatus = document.getElementById('batch-filter-status');
    const batchCards = document.querySelectorAll('.batch-card');
    if (!dateFrom || !dateTo) return;

    // Filter functionality
    const applyFilters = function () {
        const searchTerm = batchSearch.value.toLowerCase();
        const dateFilter = batchDateFilter.value;
        const classFilter = batchClassFilter.value;
        const startDate = dateFrom.value;
        const endDate = dateTo.value;
        dateFrom.max = endDate;
        dateTo.min = startDate;
        dateTo.setCustomValidity(startDate && endDate && startDate > endDate
            ? 'Choose an end date on or after the start date.' : '');
        if (startDate && endDate && startDate > endDate) {
            dateTo.reportValidity();
            return;
        }

        let visibleCards = [];

        batchCards.forEach(card => {
            let show = true;

            // Search filter (by site name)
            if (searchTerm) {
                const batchName = (card.dataset.name || '').toLowerCase();
                show = show && batchName.includes(searchTerm);
            }

            // Category filter
            if (classFilter && show) {
                show = show && (card.dataset.category === classFilter.toLowerCase());
            }

            // ISO date-only strings give inclusive bounds without timezone conversion.
            const surveyDate = card.dataset.date || '';
            if (startDate) show = show && surveyDate >= startDate;
            if (endDate) show = show && Boolean(surveyDate) && surveyDate <= endDate;

            card.style.display = show ? '' : 'none';
            if (show) visibleCards.push(card);
        });

        filterStatus.hidden = batchCards.length === 0 || visibleCards.length > 0;

        // Date sorting
        if (dateFilter && visibleCards.length > 0) {
            const cardsArray = Array.from(visibleCards);
            cardsArray.sort((a, b) => {
                const dateA = new Date(a.dataset.date || 0);
                const dateB = new Date(b.dataset.date || 0);

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

    dateFrom.addEventListener('change', applyFilters);
    dateTo.addEventListener('change', applyFilters);

    if (clearButton && batchSearch && batchDateFilter && batchClassFilter) {
        clearButton.addEventListener('click', function () {
            batchSearch.value = '';
            batchDateFilter.value = '';
            batchClassFilter.value = '';
            dateFrom.value = '';
            dateTo.value = '';
            applyFilters();
        });
    }
    applyFilters();
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBatches);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeBatches();
}
