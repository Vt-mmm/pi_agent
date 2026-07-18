---
description: First-run project onboarding after login/model selection
argument-hint: "[optional focus, e.g. backend API, fullstack, data pipeline]"
---

Run the first-read project onboarding workflow for this repository.

Optional focus:

```text
$ARGUMENTS
```

Preconditions:

1. The user has already run `/login`.
2. The user has selected the intended provider/model for project understanding.
3. This is read-only except writing `.pi/project-context.md` and `.pi/company-state/project-onboarding.json`.

Mandatory flow:

1. Call `company_context` with `detail=full`.
2. If `.pi/company-profile.json` is missing or the profile mode is `unprofiled`/`unprofiled-global-package`:
   - call `company_profile_options`;
   - do a lightweight root scout;
   - show the recommended profile and alternatives with explanations;
   - ask the user to choose a profile, unless the user explicitly provided a profile in the arguments.
3. If the user explicitly provided a profile in the arguments or approved the recommendation, call `company_profile_apply`.
4. Re-call `company_context` after applying a profile.
5. Read `.pi/company-profile.json` if present, `AGENTS.md`, `README.md`, and every existing required context file from the profile.
6. Do a bounded repository scout. Do not ingest the whole repo. Prefer:
   - root files and package/build config;
   - docs and architecture files;
   - source directory map;
   - test/verify command definitions;
   - API/schema/migration/config markers;
   - project-specific agent instructions.
7. Build a context manifest: file/path + reason.
8. Identify:
   - project purpose;
   - stack/runtime/package manager;
   - source layout and ownership boundaries;
   - main modules/domains;
   - high-risk areas;
   - protected paths/secrets;
   - verify commands and when to use them;
   - MCP/tool capabilities;
   - conventions the agent must follow.
9. Write a concise reusable snapshot to `.pi/project-context.md`.
10. Record it with `company_project_onboarding_record` when the tool exists. If unavailable, write `.pi/project-context.md` directly and clearly say the runtime record was skipped.

Profile selection rule:

- Do not force profile selection from shell.
- In a new project, profile selection belongs here during `/onboard-project`.
- `fullstack` means FE and BE may both be edited if the task allows.
- `be-readonly-fe` means backend is source-of-truth/read-only and frontend is the write target.
- The user may later switch profile with `/profiles apply <profile>`.

Snapshot format:

```markdown
# Project Context

## Status

- Generated: <ISO date>
- Profile: <mode/projectId>
- Model/pass: <provider/model if known, otherwise "selected in Pi">
- Scope: <whole repo or focus>

## Project purpose

<3-8 bullets>

## Stack and runtime

| Layer | Evidence | Notes |
|---|---|---|

## Repository map

| Path | Purpose | Owner/risk |
|---|---|---|

## Required context for future tasks

| File | Why it matters |
|---|---|

## Domain and architecture notes

<concise bullets>

## Verification matrix

| Change type | Command | Notes |
|---|---|---|

## Protected/high-risk areas

<bullets>

## Tool and MCP policy

<bullets>

## Update triggers

Regenerate this file when:

- source layout changes;
- architecture or domain ownership changes;
- test/build commands change;
- auth/data/migration/provider policy changes.
```

Final output:

- Context snapshot path.
- Files read.
- Detected stack/profile.
- Verification commands discovered.
- Any gaps requiring human confirmation.
