// Register page specific behavior

(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const registerPage = document.querySelector('.auth-shell-register');
        if (!registerPage) {
            return;
        }

        document.body.classList.add('page-register');

        const firstNameInput = document.getElementById('id_first_name');
        if (firstNameInput && !firstNameInput.value) {
            firstNameInput.focus();
        }
    });
})();
