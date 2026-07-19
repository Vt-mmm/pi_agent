# Pi Agent Platform

Reusable Pi package for project onboarding, profile-based coding workflows, guarded tool usage, multi-agent orchestration, MCP setup, memory policy, and task verification.

The goal is a simple daily flow:

```bash
cd /path/to/project
pi
```

From there, Pi can onboard the project, select an operating profile, use the right tools, record task evidence, and hand off verified implementation work.

## What it provides

- Global Pi package with prompts, skills, guard extensions, and company subagents.
- Runtime onboarding via `/onboard-project`.
- Runtime profile selection via `/profiles`; no shell profile switch is required for daily use.
- Explicit project memory via `/memory-policy` and `company_memory_*` tools.
- MCP setup helpers for Context7, Chrome DevTools, GitHub, Playwright, and Figma.
- Subagent setup helpers for read-only scouting, planning, implementation, review, and risk challenge.
- Runtime policy tools:
  - `company_exec_policy_check`
  - `company_context_budget`
  - `company_tool_policy_check`
  - `company_task_gate_check`
  - `company_usage_snapshot`
- Accident-brake guardrails for protected paths, destructive shell commands, task contracts, context manifests, observed verification evidence, and trace records.
- Quality benchmark recorder for comparing approved agent surfaces, models, and workflow presets on the same task scenarios.
- Built-in profiles for frontend, backend, fullstack, BE-readonly/FE-write, data, DevOps, mobile, docs, Python, and Node TypeScript.

## Install once

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.14
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
/model
/scoped-models      # optional: customize Ctrl+P model cycle
/company-commands
/mcp                # inspect MCP servers
/subagents-doctor   # health check
/onboard-project
/memory-policy
```

`/onboard-project` will inspect the repository with bounded context, recommend a profile, explain tradeoffs, ask before applying, then write:

- `.pi/company-profile.json`
- `.pi/project-context.md`
- `.pi/memory/*`

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

## Main workflows

### General implementation

```text
/task Implement <bounded task>. Follow profile, required context, protected paths, verify commands, and trace.
```

Use `/task` when the requirement is clear enough to implement.

### Project improvement

```text
/platform-improve Improve <platform/setup/workflow behavior>. Update docs and verification.
```

Use `/platform-improve` for package-level work such as setup, MCP, model scope, memory, runtime policy, prompts, skills, or subagent workflows.

### Backend spec to frontend

```text
/profiles apply be-readonly-fe
/be-to-fe Implement frontend support for <backend endpoint/spec>. Backend is read-only.
```

Use `/be-to-fe` when the backend/spec must be inspected read-only and the implementation target is frontend.

### Planning and clarification

```text
/discuss <rough request>
/plan <goal>
/review current diff
```

## Model selection

Model selection is handled by Pi’s native UI.

```text
/model          # selector
Ctrl+L          # selector hotkey
/scoped-models  # edit model cycle scope
Ctrl+P          # cycle scoped models
Shift+Tab       # cycle thinking level when supported by the selected model
```

Global setup can seed `enabledModels`. To inspect or re-apply:

```bash
pi-company-models
pi-company-model-scope --preset full
```

## MCP setup

Global setup installs `pi-mcp-adapter` and seeds the `core` MCP preset unless disabled.

```bash
pi-company-mcp --preset core --scope global
pi-company-mcp --preset popular --scope global
pi-company-mcp --preset design --scope project --project /path/to/project
pi-company-mcp --list
```

If the repo is cloned from Git and npm bins are not linked yet:

```bash
bash /path/to/pi_agent/scripts/configure-mcp.sh --preset core --scope global
```

Preset summary:

| Preset | Includes |
|---|---|
| `core` | Context7, Chrome DevTools, GitHub |
| `popular` | core + Playwright + Figma remote |
| `all` | popular + Figma desktop/local |

Keep secrets in environment variables, never in committed config:

```bash
export CONTEXT7_API_KEY=ctx7sk_...
export GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
```

## Subagents

Global setup installs `pi-subagents` and applies the `safe` preset unless disabled.

```bash
pi-company-subagents --preset safe
```

Fallback when cloned from Git without npm bins:

```bash
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

Common Pi commands:

```text
/subagents-doctor
/subagents-models
/subagents-fleet
/subagent-cost
/run company-scout "Map the auth flow. Read-only."
/run company-planner "Plan implementation from context.md."
/run company-worker "Implement the approved plan."
/run company-reviewer "Review current diff."
```

Daily task prompts can auto-delegate when useful. The final handoff should state whether subagents were used and why.

Optional web/docs research support:

```bash
pi install npm:pi-web-access
```

## Optional preseed setup

Most projects do not need shell init. Use this only when you want to pre-create `.pi` files in a repo or bootstrap team templates:

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project \
  --profile be-readonly-fe \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.14 \
  --mcp-preset core \
  --subagents-preset safe
```

## Repository layout

```text
pi_agent/
├─ adapters/                         reusable project profiles
├─ docs/                             Vietnamese documentation and operating notes
├─ packages/
│  └─ pi-company-core/               Pi package: extensions, prompts, skills
├─ schemas/                          JSON schemas
├─ scripts/                          setup, doctor, verification helpers
└─ templates/                        project/global templates
```

## Verification

```bash
npm ci --ignore-scripts --legacy-peer-deps
npm run typecheck
npm test
bash scripts/verify-local.sh
bash scripts/team-doctor.sh . --strict-share
pi list --approve
```

Quality benchmark:

```bash
bash scripts/quality-benchmark.sh /path/to/project --init
bash scripts/quality-benchmark.sh /path/to/project --record \
  --scenario bounded-source-fix \
  --surface pi \
  --result pass \
  --tokens 12345 \
  --verify "npm test"
```

Usage / token follow-up:

```text
/company-usage
/session
```

From another terminal:

```bash
pi-company-usage /path/to/project
bash scripts/pi-session-stats.sh /path/to/project
```

## Public safety

This repository intentionally excludes:

- OAuth tokens and `auth.json`;
- `.env` files;
- MCP API keys and provider tokens;
- Pi sessions, todos, caches, and local trust files;
- project-private data dumps;
- local machine paths.

## Documentation

- [Quickstart tiếng Việt](docs/quickstart-vietnamese.md)
- [Command reference tiếng Việt](docs/command-reference-vietnamese.md)
- [Team onboarding](docs/team-onboarding.md)
- [Project onboarding](docs/project-onboarding.md)
- [Workflow recipes](docs/workflow-recipes.md)
- [Project adapters](docs/project-adapters.md)
- [Architecture](docs/architecture.md)
- [Distribution standard](docs/distribution-standard.md)
- [Publishing for teams](docs/publishing-for-teams.md)
- [OAuth providers](docs/oauth-providers.md)
- [Herdr workflow](docs/herdr-workflow.md)
- [MCP and tools](docs/mcp-and-tools.md)
- [Subagents and multi-agent](docs/subagents-and-multiagent.md)
- [Auto-delegation policy](docs/auto-delegation-policy.md)
- [Subagent orchestration capabilities](docs/subagent-orchestration-capabilities.md)
- [Context-window policy](docs/context-window-policy.md)
- [Memory policy](docs/memory-policy.md)
- [Task implementation contract](docs/task-implementation-contract.md)
- [Runtime quality baseline](docs/runtime-quality-baseline.md)
- [Usage observability](docs/usage-observability.md)
- [Model options](docs/model-options.md)
- [Quality benchmark guide](docs/quality-benchmark.md)
- [Runtime policy design](docs/runtime-policy-design.md)
- [Package architecture notes](docs/package-architecture-notes.md)

## Maturity

Current release: `v0.3.14`.

Ready for:

- global Pi setup;
- project onboarding;
- profile-driven guarded implementation tasks;
- read-only scouting and planning;
- backend-readonly/frontend-write workflows;
- bounded subagent scouting, planning, implementation, and review;
- runtime checks for exec policy, context budget, tool policy, task gate, and usage snapshot;
- project-level quality/token/cost benchmarking.

Security boundary:

- The guard extension is an accident-prevention layer for agent mistakes and common prompt-injection patterns.
- Verify evidence is accepted only when it matches an observed Pi bash tool result in the active session after task start.
- Project memory files are private-by-default in generated projects; opt in to shared memory only after review/redaction.
- It is not an OS sandbox. For untrusted code, untrusted prompts, or adversarial workloads, run Pi inside an isolated container/VM with filesystem, process, network, and credential boundaries.

Still requires project-specific validation for:

- high-risk production changes;
- provider/model changes with materially different behavior;
- complex parallel writer workflows;
- environments requiring hard filesystem, network, or process sandboxing outside Pi.

## License

MIT License. See [LICENSE](LICENSE).
