(function () {
    'use strict';
    function initializeSurveyorTags() {
        document.querySelectorAll('[data-surveyor-picker]').forEach(function (picker) {
            const select = picker.querySelector('select');
            const options = Array.from(select.options);
            const namesInput = document.getElementById(picker.dataset.namesInput);
            const tags = picker.querySelector('[data-surveyor-tags]');
            const search = picker.querySelector('input[type="search"]');
            const results = picker.querySelector('[data-surveyor-results]');
            const status = picker.querySelector('[data-surveyor-status]');
            picker.querySelector('.surveyor-tag-controls').hidden = false;
            picker.classList.add('is-enhanced');
            namesInput.closest('label').hidden = true;
            namesInput.required = false;

            function recordedNames() {
                return namesInput.value.split(/[,\n]/).map(value => value.trim()).filter(Boolean);
            }

            function updateNames(names) {
                namesInput.value = [...new Set(names)].join(', ');
                search.setCustomValidity(names.length ? '' : 'Add at least one surveyor.');
                namesInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            function addTypedName() {
                const names = search.value.split(/[,\n]/).map(value => value.trim()).filter(Boolean);
                if (!names.length) return;
                updateNames(recordedNames().concat(names));
                search.value = '';
                renderTags();
                renderResults();
            }

            function syncNames(option, selected) {
                if (!namesInput) return;
                const name = option.dataset.name;
                const names = recordedNames();
                if (selected && !names.includes(name)) names.push(name);
                if (!selected && !options.some(other => other.selected && other.dataset.name === name)) {
                    updateNames(names.filter(value => value !== name));
                } else {
                    updateNames(names);
                }
            }

            function renderResults() {
                results.replaceChildren();
                const query = search.value.trim().toLowerCase();
                if (!query) {
                    results.hidden = true;
                    status.textContent = '';
                    return;
                }
                const matches = options.filter(option => !option.selected
                    && `${option.dataset.name} ${option.dataset.email}`.toLowerCase().includes(query));
                matches.slice(0, 12).forEach(function (option) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'surveyor-result';
                    const name = document.createElement('strong');
                    name.textContent = option.dataset.name;
                    const email = document.createElement('span');
                    email.textContent = option.dataset.email;
                    button.append(name, email);
                    button.addEventListener('click', function () {
                        option.selected = true;
                        syncNames(option, true);
                        search.value = '';
                        renderTags();
                        renderResults();
                        search.focus();
                    });
                    results.appendChild(button);
                });
                if (!recordedNames().includes(search.value.trim())) {
                    const addName = document.createElement('button');
                    addName.type = 'button';
                    addName.className = 'surveyor-result';
                    addName.textContent = `Add “${search.value.trim()}” as name only`;
                    addName.addEventListener('click', function () {
                        addTypedName();
                        search.focus();
                    });
                    results.appendChild(addName);
                }
                results.hidden = !results.childElementCount;
                status.textContent = matches.length
                    ? `${matches.length} matching account${matches.length === 1 ? '' : 's'}${matches.length > 12 ? '. Refine your search to see more.' : ''}`
                    : 'No matching active accounts.';
            }

            function renderTags() {
                tags.replaceChildren();
                const selected = options.filter(option => option.selected);
                const entries = selected.map(option => ({ name: option.dataset.name, option }));
                recordedNames().filter(name => !selected.some(option => option.dataset.name === name))
                    .forEach(name => entries.push({ name }));
                entries.forEach(function (entry) {
                    const tag = document.createElement('span');
                    tag.className = `surveyor-tag${entry.option ? '' : ' surveyor-tag-name'}`;
                    const name = document.createElement('span');
                    name.textContent = entry.name;
                    tag.title = entry.option ? `${entry.option.dataset.email} · Shared access` : 'Name only';
                    const type = document.createElement('small');
                    type.textContent = entry.option ? 'Account' : 'Name only';
                    const remove = document.createElement('button');
                    remove.type = 'button';
                    remove.textContent = '×';
                    remove.setAttribute('aria-label', `Remove ${entry.name}`);
                    remove.addEventListener('click', function () {
                        if (entry.option) {
                            entry.option.selected = false;
                            syncNames(entry.option, false);
                        } else {
                            updateNames(recordedNames().filter(name => name !== entry.name));
                        }
                        renderTags();
                        renderResults();
                        search.focus();
                    });
                    tag.append(name, type, remove);
                    tags.appendChild(tag);
                });
            }
            search.addEventListener('input', function () {
                search.setCustomValidity(recordedNames().length || search.value.trim() ? '' : 'Add at least one surveyor.');
                renderResults();
            });
            search.addEventListener('focus', renderResults);
            picker.querySelector('.surveyor-combined-field').addEventListener('click', function (event) {
                if (!event.target.closest('button')) search.focus();
            });
            search.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') results.hidden = true;
                if (event.key === 'ArrowDown' && !results.hidden) {
                    event.preventDefault();
                    results.querySelector('button')?.focus();
                }
                if (event.key === 'Enter' && !event.isComposing) {
                    event.preventDefault();
                    addTypedName();
                }
            });
            picker.addEventListener('focusout', function (event) {
                if (!picker.contains(event.relatedTarget)) addTypedName();
            });
            namesInput.form.addEventListener('submit', addTypedName, true);
            document.addEventListener('click', function (event) {
                if (!picker.contains(event.target)) results.hidden = true;
            });
            updateNames(recordedNames().concat(options.filter(option => option.selected).map(option => option.dataset.name)));
            renderTags();
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeSurveyorTags);
    else initializeSurveyorTags();
}());
