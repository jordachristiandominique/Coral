---
name: coralsense-template-debugging
description: Diagnose or fix CoralSense Django template, CSS, and vanilla JavaScript issues by tracing view context, rendered HTML, and browser behavior; distinguish editor diagnostics from runtime failures.
---

# CoralSense Template Debugging

Read AGENTS.md and consult knowledge.md for page responsibilities. Resolve project paths from the repository root.

## Identify the failing layer

Inspect the named line, enclosing template blocks, and diagnostic text. Separate VS Code HTML/CSS diagnostics from Django template exceptions, browser JavaScript errors, and visual layout defects.

Django expressions in inline CSS, such as style="background: {{ item.color }};", can trigger css-propertyvalueexpected even when rendered CSS is valid. Trace the view context first. An editor warning alone does not justify removing template expressions or disabling all CSS validation. Explain a confirmed false positive; change editor settings only when requested.

## Trace context and assets

- Routing: coral_app/urls.py and accounts/urls.py.
- Context: matching view in accounts/views.py or coral_app/views.py.
- Shared layout and messages: templates/base.html and static/js/custom.js.
- Authenticated pages: accounts/templates/accounts/; shared fragments in partials/.
- Page assets: static/js/ and static/css/, named after the page. Some pages also include researcher dashboard CSS.

Match IDs and data attributes to JavaScript selectors. Check inheritance, asset inclusion, event initialization, and CDN dependencies when relevant. Inspect rendered values rather than treating raw Django source as browser HTML.

Prefer json_script for structured template data where appropriate and preserve escaping. Do not introduce safe solely to suppress a diagnostic. Preserve CSRF tokens and fetch endpoint/method contracts. Use Django messages for server feedback.

## Correct and verify

Keep the server-rendered templates and vanilla JS approach. Do not add a framework or bundler. Keep page-specific changes with their existing assets. Preserve full benthic names and canonical HCC labels; statistical changes belong in the domain workflow.

Verify affected rendered pages and interactions when browser tools are available. Do not claim browser validation based on source inspection alone. A pure editor-warning explanation needs no application change.

After project changes, run the AGENTS.md checks: check, makemigrations --check, and test. Explain the cause, correction, performed verification, and remaining limitations.
