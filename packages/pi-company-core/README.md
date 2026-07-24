# @pi-agent/core

Shared Pi package for reusable project workflows.

## Contents

- `extensions/company-guard.ts`: runtime guard tools and policy hooks.
- `prompts/*.md`: slash-command workflows.
- `skills/company-ops/SKILL.md`: operating guidance for implementation tasks.
- `skills/company-source-cache/`: local cache for user-provided external source repositories.
- `subagents/*.md`: company roles for `pi-subagents`.
- `policies/base-policy.json`: default runtime policy, including protected path and shell protected path defaults.
- input hook support for local screenshot/image paths pasted into chat; supported images are attached as `[image1]`, `[image2]`, ...

## Trusted run wrapper

The root package exposes `pi-company-auto`:

```bash
pi-company-auto
pi-company-auto --read-only -p "Scout payment mapping. Do not edit source."
pi-company-auto --full-access -p "Run the trusted local benchmark suite."
```

This is a wrapper for `pi --approve` on the current run. It loads trusted project-local resources without turning off Company guardrails.

The wrapper can set `PI_COMPANY_PERMISSION_PROFILE` for one run:

- `read-only`: allow `read`, `grep`, `find`, `ls`, and company state tools; block shell/write/unknown tools.
- `workspace-write`: normal guarded implementation mode.
- `trusted-full-access`: trusted automation mode; protected paths, secret redaction, capability lock integrity, and destructive/external confirmations stay active.

Inside Pi, slash commands can switch the current session without writing the project profile:

```text
/permission-status
/read-only
/workspace-write
/full-access
/full-access Implement the requested trusted repo task.
```

## Runtime quality tools

- `company_permission_status`
- `company_exec_policy_check`
- `company_context_budget`
- `company_tool_policy_check`
- `company_task_gate_check`
- `company_usage_snapshot`
- `company_context_preflight`
- `company_memory_status`
- `company_memory_note`
- `company_memory_search`
- `company_memory_citation_record`
- `company_context_index_status`
- `company_context_index_record`
- `company_context_index_search`
- `company_profile_options`
- `company_profile_apply`
- `company_profile_tech_options`
- `company_profile_tech_apply`
- `company_profile_tech_context_record`
- `company_project_onboarding_record`
- `company_task_start`
- `company_source_checkout`
- `company_context_record`
- `company_verify_record` — records verify evidence only after matching an observed bash tool result after task start
- `company_trace_record`

## Prompt recipes

- `/company-commands`: explain terminal, Pi, MCP, model, memory, and subagent commands in Vietnamese.
- `/permission-status`, `/read-only`, `/workspace-write`, `/full-access`: inspect or switch the current session permission profile.
- `/onboard-project`: first-run project context snapshot after login/model selection.
- `/context-index`: inspect or search the compact project context index without a model follow-up.
- `/profile`: show a short profile status, list options, apply a profile directly, or run select-style profile/tech setup without a model follow-up. Short aliases include `fe`, `be`, `full`, and `be-fe`.
- `/profile tech`: show/select/apply the project tech stack for the active profile; fullstack setup selects frontend, backend, and database tech.
- `/memory-policy`: inspect project memory policy and explicit remember workflow.
- `/model-options`: explain model selector, scoped models, thinking levels, and benchmark discipline.
- `/platform-improve`: improve package setup, runtime policy, docs, MCP, model, memory, or subagent workflows.
- `/be-to-fe`: scout backend/spec read-only, then implement frontend only.
- `/scout`: governed read-only scout/audit workflow.
- `/task`: governed implementation lifecycle.
- `/task-preflight`: check whether the active session should run, compact, or start fresh before large work.
- `/fresh-task`, `/fresh-scout`, `/fresh-be-to-fe`: start a fresh governed session and replay the compact workflow prompt.
- `/commit`: create a guarded local commit from reviewed files only; no push.
- `/pr`: prepare a pull request; push/PR creation still requires explicit operator confirmation.
- `/plan`: bounded implementation plan.
- `/discuss`: clarify a rough request before planning or editing.
- `/review`: review source/diff with scope and verification checks.

## Subagents

When `pi-subagents` is installed, this package exposes:

- `company-scout`
- `company-planner`
- `company-worker`
- `company-reviewer`
- `company-oracle`

## Install

```bash
pi install git:github.com/Vt-mmm/pi_agent
```

Use `git:github.com/Vt-mmm/pi_agent@vX.Y.Z` when pinning a reproducible project package source.

Runtime support follows the root release matrix: Node.js `>=22.19.0`, Pi Coding Agent `0.81.1`, verified rollout on macOS Apple Silicon + Bash and Linux x64 + Bash, supported-target smoke verification for macOS Intel/Linux ARM64, no native Windows team rollout target yet, and WSL2 experimental.

## Project profile

The extension reads profile data in this order:

1. env `PI_COMPANY_PROFILE`
2. `<project>/.pi/company-profile.json` when project-local trust is active in Pi

If no trusted profile is available, the extension still applies baseline secret and destructive-command guards.

`permissionProfile` defaults to `workspace-write` when omitted. `PI_COMPANY_PERMISSION_PROFILE` can override it for a single trusted run; invalid values fail closed to `read-only`.

## Task state

Runtime task tools write local state to:

- `.pi/company-state/tasks/*.json`
- `.pi/project-context.md`
- `.pi/tech-stack.json`
- `.pi/tech-context/*.json`
- `.pi/company-state/project-onboarding.json`
- `.pi/memory/MEMORY.md` when the user explicitly asks Pi to remember durable information; generated projects ignore this file by default
- `.pi/company-state/observed-bash.jsonl`
- `.pi/company-state/traces.jsonl`
- `.pi/task-inbox/*.md` for oversized local task intake; generated projects ignore this directory by default
- Pi custom session entry `company-task-trace`

Project-local state belongs in `.pi/.gitignore`.

Passing final gates require an observed exit `0` command that exactly matches one entry in `task.verifyCommands`. Other observed commands are traceable but advisory.

Raw path-like tool access to protected paths is blocked before execution. This includes Pi built-ins (`read`, `write`, `edit`, `grep`, `find`, `ls`) and custom/MCP tools with nested path-like strings, arrays, or `file://` URIs. Path-like strings are percent-decoded once, and input nesting above `MAX_TOOL_INPUT_INSPECTION_DEPTH=32` fails closed. Known content fields such as `content`, `query`, `pattern`, `text`, and `command` are excluded from generic extraction. `grep.glob` and `find.pattern` are checked when they explicitly target protected paths, while broad `grep`, `find`, and `ls` results are filtered so protected content lines or path metadata are redacted before reaching the model.

Raw `bash` access to protected paths is blocked through shell path extraction. `.pi/company-state/**` and `.pi/company-profile.json` are self-protected; use `company_context` and company task tools for governed access.

The input hook also detects local image paths in chat prompts. Supported formats are `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, and `.bmp`, including macOS screenshot paths under `/var/folders/...`. Up to 4 images are attached per input, with an 8 MB per-image cap. Oversized images should be read through Pi's `read` tool so Pi can resize them.
