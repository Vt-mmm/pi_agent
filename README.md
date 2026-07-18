# Pi Agent Platform

A reusable Pi package for project onboarding, profile-based coding workflows, guarded tool usage, and task verification.

This repository is designed for teams that want a `cd project && pi` workflow without copying large prompt files or hand-maintaining agent rules in every project.

## What it provides

- Global Pi package with prompts, skills, and guard extensions.
- Runtime project onboarding via `/onboard-project`.
- Runtime profile selection via `/profiles`.
- Built-in profiles for frontend, backend, fullstack, BE-readonly/FE-write, data, DevOps, mobile, docs, Python, and Node TypeScript.
- Guardrails for protected paths, destructive shell commands, task contracts, context manifests, verification evidence, and trace records.
- Reusable workflow prompts:
  - `/platform-migration`
  - `/be-to-fe`
  - `/task`
  - `/plan`
  - `/discuss`
  - `/review`

## Install once

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.1.0
```

Optional Herdr integration:

```bash
herdr integration install pi
```

## Daily use

```bash
cd /path/to/project
pi
```

First run inside a project:

```text
/login
<select provider/model>
/onboard-project
```

`/onboard-project` will:

- inspect the repository with bounded context;
- recommend a project profile;
- show profile options and tradeoffs;
- apply a profile only after user approval;
- write `.pi/company-profile.json`;
- write `.pi/project-context.md`.

Switch profiles later:

```text
/profiles
/profiles apply fullstack
/profiles apply be-readonly-fe
/profiles apply web-frontend
/profiles apply backend-api
```

## Built-in profiles

| Profile | Use when |
|---|---|
| `generic` | Unknown or low-structure repository |
| `web-frontend` | Frontend-only work |
| `backend-api` | Backend/API work |
| `be-readonly-fe` | Backend is source-of-truth/read-only; frontend is write target |
| `fullstack` | Frontend and backend may both be changed when the task allows |
| `node-typescript` | Node/TypeScript library or tooling |
| `python` | Python app/library |
| `data` | ETL, dbt, DVC, notebook, or data pipeline |
| `devops` | Docker, Terraform, Kubernetes, Helm, GitHub Actions |
| `mobile` | React Native or Flutter |
| `docs` | Documentation portal/manual |

## Workflow prompts

### Platform migration

Use when migrating selected ideas from Pi docs, Codex CLI, Claude/Codex harnesses, or external reference repositories.

```text
/platform-migration Migrate selected Pi docs and Codex CLI GitHub concepts into this platform.
```

### Backend spec to frontend

Use when backend must be scouted read-only and the implementation target is frontend.

```text
/profiles apply be-readonly-fe
/be-to-fe Implement frontend support for <backend endpoint/spec>. Backend is read-only.
```

### General implementation

```text
/task Implement <bounded task>. Follow profile, required context, protected paths, verify commands, and trace.
```

### Planning and clarification

```text
/discuss <rough request>
/plan <goal>
```

## Optional preseed setup

Most projects do not need shell init. Use this only when you want to pre-create `.pi` files in a repo or bootstrap CI/team templates:

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project \
  --profile be-readonly-fe \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.1.0
```

## Repository layout

```text
pi_agent/
├─ adapters/                         reusable project profiles
├─ docs/                             Vietnamese and reference documentation
├─ packages/
│  └─ pi-company-core/               Pi package: extensions, prompts, skills
├─ schemas/                          JSON schemas
├─ scripts/                          setup, doctor, verification helpers
└─ templates/                        files copied into projects when preseeded
```

## Verification

```bash
bash scripts/verify-local.sh
bash scripts/team-doctor.sh . --strict-share
pi list --approve
```

## Public safety

This repository intentionally excludes:

- OAuth tokens and `auth.json`;
- `.env` files;
- Pi sessions, todos, caches, and local trust files;
- project-private data dumps;
- local machine paths.

## Documentation

- [Quickstart tiếng Việt](docs/quickstart-vietnamese.md)
- [Team onboarding](docs/team-onboarding.md)
- [Project onboarding](docs/project-onboarding.md)
- [Workflow recipes](docs/workflow-recipes.md)
- [Project adapters](docs/project-adapters.md)
- [Architecture](docs/architecture.md)
- [MCP and tools](docs/mcp-and-tools.md)
- [Context-window policy](docs/context-window-policy.md)
- [Task implementation contract](docs/task-implementation-contract.md)
- [Codex migration reference](docs/codex-migration-reference.md)
- [Agent-stuff research](docs/agent-stuff-research.md)

## Maturity

Current maturity: `P2-alpha`.

Good for:

- global Pi setup;
- project onboarding;
- profile-driven guarded pilot tasks;
- read-only scouting;
- small or normal source tasks with clear verification.

Not yet proven for:

- replacing Codex/Claude CLI on high-risk tasks without benchmark evidence;
- automated final-DONE enforcement;
- complex multi-agent worktree isolation.
