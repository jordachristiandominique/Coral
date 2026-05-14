// Login page specific behavior

(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const loginPage = document.querySelector('.auth-shell-login');
        if (!loginPage) {
            return;
        }

        document.body.classList.add('page-login');

        const emailInput = document.getElementById('id_email');
        if (emailInput && !emailInput.value) {
            emailInput.focus();
        }
    });
})();
