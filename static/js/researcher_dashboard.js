const initializeResearcherDashboard = function () {
    document.body.classList.add('page-researcher-dashboard');

    if (window.lucide) {
        window.lucide.createIcons();
    }

    // ===== Benthic Class Distribution (doughnut) =====
    const benthicEl = document.getElementById('benthicDistributionChart');
    const benthicScript = document.getElementById('benthic-distribution-data');

    let labels = [];
    let values = [];
    let colors = [];
    if (benthicScript) {
        try {
            const payload = JSON.parse(benthicScript.textContent || '{}');
            labels = payload.labels || [];
            values = payload.values || [];
            colors = payload.colors || [];
        } catch (error) {
            // no data
        }
    }

    const hasData = values.some(function (v) { return v > 0; });

    if (benthicEl && window.Chart && hasData) {
        new Chart(benthicEl, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '58%',
                plugins: {
                    legend: { display: false },  // custom legend rendered in the template
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                return ctx.label + ': ' + ctx.parsed + '%';
                            }
                        }
                    }
                }
            }
        });
    } else if (benthicEl) {
        // No classified points yet — show a friendly placeholder
        const ctx = benthicEl.getContext('2d');
        ctx.font = '13px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#688792';
        ctx.textAlign = 'center';
        ctx.fillText('No classified points yet', benthicEl.width / 2, benthicEl.height / 2);
    }
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeResearcherDashboard);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeResearcherDashboard();
}
