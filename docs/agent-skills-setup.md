# CoralSense Agent Skills Setup

## 1. Create a New Branch First

The setup was isolated from `main` on a new branch. Its original name was `chore/project-agent-skills`; it was renamed to `agent-skills` on October 12, 2026.

```powershell
git branch -m agent-skills
```

The branch contains project guidance, reusable skills, and a standalone design sample. It does not change Django application behavior.

## 2. Initialize Project Documentation: knowledge.md, AGENTS.md, and CLAUDE.md

- [knowledge.md](../knowledge.md) describes architecture, routes, models, the upload data flow, and confirmed implementation limitations. Existing content was updated against source inspection.
- [AGENTS.md](../AGENTS.md) preserves project boundaries, HCC invariants, conventions, verification commands, and the skill inventory.
- [CLAUDE.md](../CLAUDE.md) directs Claude users to the shared project rules and skill files rather than duplicating them.

Project verification uses the existing virtual environment:

```powershell
.venv/Scripts/python.exe manage.py check
.venv/Scripts/python.exe manage.py makemigrations --check
.venv/Scripts/python.exe manage.py test
```

The previous verification passed system and migration checks and found zero tests. The environment emitted a requests dependency compatibility warning. Skill structural checks passed; the official skill validator could not run because PyYAML was unavailable.

## 3. Create Two Custom Skills Based on the Project

The two original custom skills are:

| Skill | Purpose | File |
|---|---|---|
| coralsense-survey-hcc | Preserve survey uploads, transect relationships, benthic names, and canonical HCC calculations during changes | [SKILL.md](../.agents/skills/coralsense-survey-hcc/SKILL.md) |
| coralsense-template-debugging | Trace template context, CSS, JavaScript, and rendered output; distinguish editor warnings from runtime errors | [SKILL.md](../.agents/skills/coralsense-template-debugging/SKILL.md) |

A third custom skill was added afterward at the user's request: [coralsense-frontend-design](../.agents/skills/coralsense-frontend-design/SKILL.md). It guides responsive frontend design compatible with Django templates and vanilla JavaScript.

### Frontend Design Sample Output

Open [the sample dashboard](../examples/frontend-design/dashboard.html) in a browser. It demonstrates the marine palette, Inter typography, responsive metric/site layouts, category filtering, an empty state, and site-detail dialogs. Data is illustrative and the page does not connect to live survey records. Inter loads through Google Fonts and needs internet access.

Example invocation:

> Use $coralsense-frontend-design to improve the researcher dashboard.

The sample's JavaScript handlers and markup were checked. Browser rendering has not been visually verified.

## 4. Download and Install Skills from a Skills Provider

Two skills were downloaded from the official [OpenAI skills repository](https://github.com/openai/skills/tree/main/skills/.curated) using the skill-installer helper:

| Downloaded skill | Purpose | Local file |
|---|---|---|
| jupyter-notebook | Create or edit training and comparison notebooks | [SKILL.md](../.agents/skills/jupyter-notebook/SKILL.md) |
| playwright | Browser automation and UI verification | [SKILL.md](../.agents/skills/playwright/SKILL.md) |

The upstream instructions, resources, and licenses are retained. All five skills live in `.agents/skills/`. Their helper paths must resolve from these local folders. Installation did not add Django dependencies, browser binaries, or ML packages.

To publish the setup branch after committing its changes:

```powershell
git push -u origin agent-skills
```
