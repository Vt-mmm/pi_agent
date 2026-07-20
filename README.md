# Pi Agent Platform

Reusable Pi package for project onboarding, profile-based coding workflows, guarded tool usage, multi-agent orchestration, MCP setup, memory policy, and task verification.

The goal is a simple daily flow:

```bash
cd /path/to/project
pi
```

From there, Pi can onboard the project, select an operating profile, use the right tools, record task evidence, and hand off verified implementation work.

For a trusted project where you want Pi to load project-local `.pi` resources without another trust prompt on that run:

```bash
cd /path/to/project
pi-company-auto
```

Read-only scout mode:

```bash
pi-company-auto --read-only -p "Scout payment mapping. Do not edit source."
```

`pi-company-auto` is a convenience wrapper for Pi project trust (`pi --approve`). It does not bypass protected-path checks, destructive shell checks, task gates, or verification evidence.

## What it provides

- Global Pi package with prompts, skills, guard extensions, and company subagents.
- Runtime onboarding via `/onboard-project`.
- Runtime profile selection via `/profiles`; no shell profile switch is required for daily use.
- Explicit project memory via `/memory-policy` and `company_memory_*` tools.
- MCP setup helpers for Context7, Chrome DevTools, GitHub, Playwright, and Figma.
- Subagent setup helpers for read-only scouting, planning, implementation, review, and risk challenge.
- Chat image-path intake: paste a local screenshot path into the Pi chat box and the guard attaches it as `[image1]` before the model sees the prompt.
- Trusted-run wrapper: `pi-company-auto` launches Pi with `--approve` for the current run while keeping company guardrails active.
- Runtime policy tools:
  - `company_exec_policy_check`
  - `company_context_budget`
  - `company_tool_policy_check`
  - `company_task_gate_check`
  - `company_usage_snapshot`
  - `company_context_preflight`
- Accident-brake guardrails for protected paths, destructive shell commands, task contracts, context manifests, observed verification evidence, and trace records.
- Quality benchmark recorder for comparing approved agent surfaces, models, and workflow presets on the same task scenarios.
- Built-in profiles for frontend, backend, fullstack, BE-readonly/FE-write, data, DevOps, mobile, docs, Python, and Node TypeScript.

## Install once

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.23
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

For read-only investigation:

```text
/scout Scout <module/spec/contract/risk>. Do not edit source.
```

Use `/scout` for payment/auth/data/BE-contract mapping before deciding whether to implement.

When the current session is already heavy, use the fresh workflow commands. They open a new governed Pi session and replay the compact workflow prompt automatically:

```text
/fresh-task <request>
/fresh-scout <read-only request>
/fresh-be-to-fe <backend-readonly/frontend request>
```

The input guard also collapses pasted mandatory-flow boilerplate automatically. Users should not paste the full company checklist into every task.

### Screenshots and local images

If a chat box paste or screen capture produces a local image path instead of a native Pi image attachment, paste the path directly in the task:

```text
/scout Check this UI state from screenshot /var/folders/.../screenshot.png
```

The input guard converts supported local image paths (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`) into Pi image attachments and rewrites the prompt to:

```text
/scout Check this UI state from screenshot [image1]
```

Limits: up to 4 chat images, 8 MB each. For oversized images, use Pi's `read` tool on the file so Pi can resize it.

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
export GITHUB_PERSONAL_ACCESS_TOKEN=<github-token>
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
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.23 \
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
/task-preflight
/task-preflight compact
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

- [Operator manual tiếng Việt](docs/operator-manual-vietnamese.md)
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

Current release: `v0.3.23`.

Ready for:

- global Pi setup;
- project onboarding;
- profile-driven guarded implementation tasks;
- read-only scouting and planning;
- backend-readonly/frontend-write workflows;
- bounded subagent scouting, planning, implementation, and review;
- runtime checks for exec policy, context budget, context preflight, tool policy, task gate, and usage snapshot;
- project-level quality/token/cost benchmarking.

Security boundary:

- The guard extension is an accident-prevention layer for agent mistakes and common prompt-injection patterns.
- Raw path-like tool access to protected paths is blocked before execution. This covers Pi built-ins such as `read`, `write`, `edit`, `grep`, `find`, `ls`, and custom/MCP tools when their input contains path-like strings, including nested objects, arrays, and `file://` URIs.
- Path-like strings are percent-decoded once before matching. Excessively nested tool input fails closed instead of being silently skipped.
- Known content fields such as `content`, `query`, `pattern`, `text`, and `command` are excluded from generic path extraction to preserve normal search/edit behavior. Tool-specific checks still validate `grep.glob` and `find.pattern` when they explicitly target protected paths.
- Broad `grep`, `find`, and `ls` sweeps get result-filter backstops: protected file content lines or protected path metadata are redacted before the model sees output.
- Raw `bash` access to protected paths is blocked through shell path extraction. `.pi/company-state/**` and `.pi/company-profile.json` are self-protected; use `company_context` and company task tools instead.
- Verify evidence is accepted only when it matches an observed Pi bash tool result after task start. The observed ledger is persisted under `.pi/company-state/observed-bash.jsonl`, so parent agents can validate bash results produced by guarded subagent processes.
- Passing final gates require an observed exit `0` command that exactly matches one of the task/profile `verifyCommands`; ad-hoc commands such as `true`, `echo ok`, or `npm test || true` are advisory only.
- Project memory files are private-by-default in generated projects; opt in to shared memory only after review/redaction.
- It is not an OS sandbox. For untrusted code, untrusted prompts, or adversarial workloads, run Pi inside an isolated container/VM with filesystem, process, network, and credential boundaries.

Still requires project-specific validation for:

- high-risk production changes;
- provider/model changes with materially different behavior;
- complex parallel writer workflows;
- environments requiring hard filesystem, network, or process sandboxing outside Pi.

## License

MIT License. See [LICENSE](LICENSE).
