# Package architecture notes

## Mục tiêu

Pi Agent Platform được đóng gói như một reusable Pi package để dùng cho nhiều project mà không kéo theo rule nghiệp vụ của một repo cụ thể.

## Package shape

```text
packages/pi-company-core/
├─ extensions/
│  └─ company-guard.ts
├─ prompts/
├─ skills/
├─ subagents/
├─ policies/
└─ package.json
```

Root `package.json` expose:

- `pi.extensions`
- `pi.skills`
- `pi.prompts`
- `pi.subagents.agents`

## Design decisions

### 1. Prompts stay short

Workflow prompts define phase, required tools, output contract, and verification. Project-specific detail lives in `.pi/company-profile.json`, `.pi/project-context.md`, memory, and required context files.

### 2. Profile is the project adapter

Profiles hold protected paths, required context, verify commands, MCP capabilities, and hard gates. This keeps the core package reusable across frontend, backend, fullstack, data, DevOps, mobile, and docs projects.

### 3. Runtime state is local and auditable

Task state is stored under `.pi/company-state/` and also mirrored into Pi session custom entries when possible. This gives a file-based audit trail without requiring a database.

### 4. Source cache is read-only shared state

`company-source-cache` stores user-provided external repositories in a stable local cache. Agents read targeted files from the cache and never edit it directly.

### 5. Review guidance is project-local

`templates/project/REVIEW_GUIDELINES.md` gives each project a place to define review rules without changing the package.

### 6. Tool policy belongs in runtime

Prompt instructions are not enough for safety. The extension layer provides exec policy, tool policy, protected path checks, context budget checks, and final gates.

### 7. Benchmarking is scenario-based

Token/cost/quality improvements must be measured on repeatable project scenarios, not assumed from setup shape.

## Adopted capabilities

| Capability | Implementation |
|---|---|
| Project onboarding | `/onboard-project` + `company_project_onboarding_record` |
| Profile switching | `/profiles` + `company_profile_options` / `company_profile_apply` |
| Explicit memory | `/memory-policy` + `company_memory_*` |
| Task lifecycle | `/task` + task/context/verify/trace tools |
| Platform workflow | `/platform-improve` |
| Backend-readonly to frontend | `/be-to-fe` |
| Source cache | `company-source-cache` + `company_source_checkout` |
| Subagent roles | `company-scout`, `company-planner`, `company-worker`, `company-reviewer`, `company-oracle` |
| Quality benchmark | `scripts/quality-benchmark.sh` |

## Deferred capabilities

- Hard final assistant hook if Pi exposes a stable extension hook.
- Project-specific worktree policy for parallel writer agents.
- Optional stronger sandbox layer for strict enterprise environments.
- Rich TUI dashboard for long-running usage and benchmark summaries.
