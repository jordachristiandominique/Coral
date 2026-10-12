---
name: coralsense-frontend-design
description: Design or improve CoralSense frontend pages and produce responsive HTML/CSS/vanilla JavaScript mockups or Django template implementations that fit the existing marine visual identity.
---

# CoralSense Frontend Design

Read AGENTS.md and relevant knowledge.md sections before implementation. Use this skill for visual design, layout, hierarchy, responsive behavior, and interaction design. For an editor warning or runtime bug without a design request, use coralsense-template-debugging instead.

## Establish the page contract

Inspect the target template, matching view context, page CSS/JS, and shared base/profile partials. Identify the page's primary action and the information needed for that action. Retain existing URLs, field names, CSRF tokens, DOM hooks, role-based navigation, and server messages during a redesign.

Use the existing marine palette as the starting point: deep teal #1c5f6d, supporting teal #2a8793, light neutral surfaces, and restrained orange accents. Read actual page styles before choosing fonts, spacing, radii, or navigation changes. Scope CSS to the page to avoid leaking rules into other templates. Reuse existing Lucide, Leaflet, and Chart.js assets where appropriate; do not add a framework, bundler, font service, or library merely for appearance.

## Design useful layouts

Lead with a clear page title, context, and primary action. Group related metrics and provide a readable path from overview to survey detail. Prefer purposeful whitespace, consistent spacing, legible tables, and restrained decoration. Avoid visual claims that imply reef health beyond the project's canonical category descriptions.

Represent missing data explicitly. Keep the seven full benthic names, category wording, and HCC meaning intact. Display trusted values from view context; a frontend redesign must not redefine scientific calculations or permissions.

Make layouts work on narrow screens without clipping navigation or actions. Use semantic landmarks, real links for navigation, buttons for actions, visible keyboard focus, associated labels, meaningful status text, and text labels alongside color-coded categories. Respect reduced-motion preferences. Tables may scroll within their own container when necessary.

## Produce a sample or an integrated change

If asked for a sample, create a standalone artifact under examples/frontend-design/ with clearly labeled demonstration data. Keep it separate from Django routing. Make visible controls work within the sample or explain their destination; do not imply a demo saves real surveys, authenticates users, or calls inference.

The reference sample is examples/frontend-design/dashboard.html, relative to the repository root. It demonstrates a marine dashboard, responsive layout, labeled category badges, site filtering, and an accessible native dialog. Treat it as an example output, not a required layout for every page.

For an application change, use the existing templates and page-specific static files. Wire actions to existing endpoints and preserve their request contracts. Address loading, empty, validation-error, and successful states relevant to the requested workflow.

## Verify and deliver

When browser tooling is available, inspect desktop and narrow layouts, keyboard interaction, and visible controls. If only source checks were possible, say so; do not claim a visual pass. Verify chart labels, values, and category boundaries against the data actually supplied.

Run the three AGENTS.md checks after changes. Deliver the artifact path or changed page, a short design rationale, an example invocation, and honest verification results. Do not install additional tooling just to produce a static sample unless the user authorizes it.
