# CoralSense Project Guidance

Read [AGENTS.md](AGENTS.md) for project rules and [knowledge.md](knowledge.md) for architecture, routing, models, and the upload trace. Use these shared references instead of maintaining a conflicting copy here.

## Working in this repository

- Django monolith with one local app, `accounts`, server-rendered templates, and vanilla JavaScript.
- Preserve canonical HCC functions and benthic names in `accounts/models.py`.
- Trace upload changes through both `static/js/upload_batch.js` and `accounts/views.py::upload_batch`.
- Follow existing authentication and ownership rules; see the documented missing guard on `batch_detail`.
- Development settings and mock analysis are current implementation facts, not permission to change them without a relevant request.
- After changes, run and report the verification commands in `AGENTS.md`, including the actual test count.

## Project skills

Read the matching `.agents/skills/<name>/SKILL.md` when the task needs its workflow:

| Skill | Purpose | Origin |
|---|---|---|
| `coralsense-survey-hcc` | Survey uploads, transects, HCC, and exports | Custom |
| `coralsense-template-debugging` | Django template, CSS, and JavaScript diagnosis | Custom |
| `coralsense-frontend-design` | Responsive page design; sample at `examples/frontend-design/dashboard.html` | Custom |
| `jupyter-notebook` | Training and comparison notebook authoring/editing | OpenAI `openai/skills`, `skills/.curated/jupyter-notebook` |
| `playwright` | Browser automation and UI verification | OpenAI `openai/skills`, `skills/.curated/playwright` |

Claude can read these files as task instructions; this document does not register native Claude slash commands. Downloaded skills may require tools outside the Django environment. Resolve bundled resource paths from the actual repository-local skill directory rather than upstream examples' global installation directory. On Windows, Playwright's shell wrapper also requires a compatible Bash environment. Install or run extra tools only within the user's authorized task.
