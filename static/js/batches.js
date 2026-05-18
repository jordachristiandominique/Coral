const initializeBatches = function () {
    document.body.classList.add('page-researcher-dashboard');

    if (window.lucide) {
        window.lucide.createIcons();
    }

    // ===== Batch Filtering =====
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
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBatches);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeBatches();
}
