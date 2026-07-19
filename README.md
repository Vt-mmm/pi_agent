# Pi Agent Platform

A reusable Pi package for project onboarding, profile-based coding workflows, guarded tool usage, and task verification.

This repository is designed for teams that want a `cd project && pi` workflow without copying large prompt files or hand-maintaining agent rules in every project.

## What it provides

- Global Pi package with prompts, skills, and guard extensions.
- Runtime project onboarding via `/onboard-project`.
- Runtime profile selection via `/profiles`.
- Explicit project memory via `/memory-policy` and `company_memory_*` tools.
- MCP baseline via `pi-mcp-adapter`, `pi-company-mcp`, `.mcp.json`, and token-efficient proxy mode.
- Multi-agent baseline via `pi-subagents`, `pi-company-subagents`, and company subagent roles.
- Auto-delegation policy for `/task`, `/be-to-fe`, `/platform-migration`, `/plan`, and `/review` so normal tasks can spawn read-only scout/planner/reviewer agents without the user memorizing subagent commands.
- Upstream `pi-subagents` integration notes for bundled orchestration skill, review loops, parallel research, context-builder handoffs, watchdog opt-in, supervisor channel, and model profiles.
- Built-in profiles for frontend, backend, fullstack, BE-readonly/FE-write, data, DevOps, mobile, docs, Python, and Node TypeScript.
- Guardrails for protected paths, destructive shell commands, task contracts, context manifests, verification evidence, and trace records.
- Codex-inspired runtime policy modules:
  - `company_exec_policy_check`
  - `company_context_budget`
  - `company_tool_policy_check`
  - `company_task_gate_check`
  - `company_usage_snapshot`
- Parity benchmark recorder for Pi vs Codex vs Claude task comparisons.
- Reusable workflow prompts:
  - `/company-commands`
  - `/platform-migration`
  - `/be-to-fe`
  - `/model-options`
  - `/memory-policy`
  - `/task`
  - `/plan`
  - `/discuss`
  - `/review`

## Install once

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.10
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
/model          # or Ctrl+L: select OpenAI Codex / Claude from Pi's native selector
/scoped-models  # optional: edit Ctrl+P cycle list
/company-commands
/mcp            # inspect MCP servers
/subagents-doctor  # subagent health check
/onboard-project
/memory-policy
```

`/onboard-project` will:

- inspect the repository with bounded context;
- recommend a project profile;
- show profile options and tradeoffs;
- apply a profile only after user approval;
- write `.pi/company-profile.json`;
- write `.pi/project-context.md`;
- initialize/read `.pi/memory/` policy when needed.

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

### Project memory

Use when you want Pi to inspect memory policy or remember durable project facts explicitly.

```text
/memory-policy
Remember: this repo uses pnpm, never npm.
```

### Model options

Model selection is native Pi UI, not an agent recommendation flow.

```text
/model          # selector
Ctrl+L          # selector hotkey
/scoped-models  # edit cycle scope
Ctrl+P          # cycle scoped models
Shift+Tab       # cycle thinking level
```

Global setup configures `enabledModels` for Codex + Claude. To inspect or re-apply:

```bash
pi-company-models
pi-company-model-scope --preset full
```

### MCP and external tools

Global setup installs `pi-mcp-adapter` and seeds the `core` MCP preset unless you pass `--no-mcp`.

```bash
pi-company-mcp --preset core --scope global
pi-company-mcp --preset popular --scope global
pi-company-mcp --preset design --scope project --project /path/to/project
pi-company-mcp --list
```

If the repo is cloned from Git and npm bins are not linked yet, use:

```bash
bash /path/to/pi_agent/scripts/configure-mcp.sh --preset core --scope global
```

Preset summary:

| Preset | Includes |
|---|---|
| `core` | Context7, Chrome DevTools, GitHub |
| `popular` | core + Playwright + Figma remote |
| `all` | popular + Figma desktop/local |

In Pi:

```text
/mcp
/mcp setup
/mcp tools
/mcp reconnect
```

Keep secrets in environment variables, never in `.mcp.json`:

```bash
export CONTEXT7_API_KEY=ctx7sk_...
export GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
```

### Subagents and multi-agent workflows

Global setup installs `pi-subagents` and configures the `safe` preset unless you pass `--no-subagents`.

```bash
pi-company-subagents --preset safe
# fallback when cloned from Git without npm bins:
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

Optional for builtin `researcher` web/docs research:

```bash
pi install npm:pi-web-access
# or during setup:
bash /path/to/pi_agent/scripts/setup.sh . --with-web-access
```

In Pi:

```text
/subagents-doctor   # health check package/config/agents
/subagents-models   # model/thinking routing map for subagents
/subagents-fleet    # dashboard of active/done child runs
/subagent-cost      # token/cost usage for subagent runs
/run company-scout "Map the auth flow. Read-only."
/run company-planner "Plan implementation from context.md."
/run company-worker "Implement the approved plan."
/run company-reviewer "Review current diff."
```

Plain Vietnamese command guide:

```text
/company-commands subagents
```

Daily task prompts can auto-delegate when useful:

```text
/task Implement <large task>
```

The agent should report `Subagents: used/not used and why` in the final handoff.

Useful upstream workflow shortcuts:

```text
/parallel-review current diff
/review-loop current diff max 3 rounds
/parallel-research <question>
/parallel-context-build <large task>
```

Natural language also works:

```text
Use company-scout to map this module, then have company-planner produce an implementation plan.
Run parallel company-reviewers for correctness, tests, and scope drift.
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
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.10 \
  --mcp-preset core \
  --subagents-preset safe
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

Benchmark parity:

```bash
bash scripts/parity-benchmark.sh /path/to/project --init
bash scripts/parity-benchmark.sh /path/to/project --record \
  --scenario bounded-source-fix \
  --agent pi \
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
# or
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

## License

MIT License. See [LICENSE](LICENSE).

## Documentation

- [Quickstart tiếng Việt](docs/quickstart-vietnamese.md)
- [Command reference tiếng Việt](docs/command-reference-vietnamese.md)
- [Team onboarding](docs/team-onboarding.md)
- [Project onboarding](docs/project-onboarding.md)
- [Workflow recipes](docs/workflow-recipes.md)
- [Project adapters](docs/project-adapters.md)
- [Architecture](docs/architecture.md)
- [MCP and tools](docs/mcp-and-tools.md)
- [Subagents and multi-agent](docs/subagents-and-multiagent.md)
- [Auto-delegation policy](docs/auto-delegation-policy.md)
- [pi-subagents upstream review](docs/pi-subagents-upstream-review.md)
- [Context-window policy](docs/context-window-policy.md)
- [Memory policy](docs/memory-policy.md)
- [Task implementation contract](docs/task-implementation-contract.md)
- [Codex parity baseline](docs/codex-parity-baseline.md)
- [Usage observability](docs/usage-observability.md)
- [Model options](docs/model-options.md)
- [Benchmark parity guide](docs/benchmark-parity.md)
- [Codex migration reference](docs/codex-migration-reference.md)
- [Agent-stuff research](docs/agent-stuff-research.md)

## Maturity

Current maturity: `P3-baseline`.

Good for:

- global Pi setup;
- project onboarding;
- profile-driven guarded pilot tasks;
- read-only scouting;
- small or normal source tasks with clear verification;
- Codex-inspired exec/context/tool/task gate checks;
- bounded subagent scouting/planning/review workflows;
- collecting Pi vs Codex vs Claude benchmark evidence.

Not yet proven for:

- replacing Codex/Claude CLI on high-risk tasks without project-specific benchmark evidence;
- true final assistant stop-hook enforcement when Pi does not expose a hard final hook;
- Codex-grade filesystem/network/env sandbox if Pi/host runtime does not provide it;
- complex multi-agent worktree isolation without project-specific dry runs.
