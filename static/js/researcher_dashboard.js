const initializeResearcherDashboard = function () {
    document.body.classList.add('page-researcher-dashboard');

    if (window.lucide) {
        window.lucide.createIcons();
    }

    // ===== Dashboard Chart =====
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
};

// Initialize immediately if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeResearcherDashboard);
} else {
    // DOM is already loaded (script loaded late in page)
    initializeResearcherDashboard();
}
