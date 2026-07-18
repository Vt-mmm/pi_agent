# Project Agent Instructions

## Operating model

This project uses Pi Company Platform.

Before implementation:

1. Load `.pi/company-profile.json`.
2. If `.pi/project-context.md` still says "Generated: not yet", run `/onboard-project` after login/model selection before the first implementation task.
3. Read `.pi/project-context.md` and required context files listed in the profile.
4. Check project memory with `company_memory_status` when relevant; memory is advisory, source files are authoritative.
5. Respect protected paths.
6. Use MCP/tools only when declared in profile.
7. Run verify commands before DONE.
8. For unclear tasks, use `/discuss` first; do not implement while requirements are unresolved.
9. For external reference repos, use `company-reference-repo` and read targeted files only.

## Review

Use `REVIEW_GUIDELINES.md` when reviewing code in this project.

## Secrets

Do not commit OAuth tokens, API keys, `.env`, `auth.json`, session files, or `.pi/memory/local/`.
