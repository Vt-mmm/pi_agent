# @pi-agent/core

Shared Pi package for reusable project workflows.

## Contents

- `extensions/company-guard.ts`: runtime guard tools and policy hooks.
- `prompts/*.md`: slash-command workflows.
- `skills/company-ops/SKILL.md`: operating guidance for implementation tasks.
- `skills/company-source-cache/`: local cache for user-provided external source repositories.
- `subagents/*.md`: company roles for `pi-subagents`.
- `policies/base-policy.json`: default runtime policy, including protected path and shell protected path defaults.

## Runtime quality tools

- `company_exec_policy_check`
- `company_context_budget`
- `company_tool_policy_check`
- `company_task_gate_check`
- `company_usage_snapshot`
- `company_memory_status`
- `company_memory_note`
- `company_memory_search`
- `company_memory_citation_record`
- `company_profile_options`
- `company_profile_apply`
- `company_project_onboarding_record`
- `company_task_start`
- `company_source_checkout`
- `company_context_record`
- `company_verify_record` — records verify evidence only after matching an observed bash tool result after task start
- `company_trace_record`

## Prompt recipes

- `/company-commands`: explain terminal, Pi, MCP, model, memory, and subagent commands in Vietnamese.
- `/onboard-project`: first-run project context snapshot after login/model selection.
- `/profiles`: show or switch the active project profile inside Pi.
- `/memory-policy`: inspect project memory policy and explicit remember workflow.
- `/model-options`: explain model selector, scoped models, thinking levels, and benchmark discipline.
- `/platform-improve`: improve package setup, runtime policy, docs, MCP, model, memory, or subagent workflows.
- `/be-to-fe`: scout backend/spec read-only, then implement frontend only.
- `/task`: governed implementation lifecycle.
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
pi install git:github.com/Vt-mmm/pi_agent@v0.3.20
```

## Project profile

The extension reads profile data in this order:

1. env `PI_COMPANY_PROFILE`
2. `<project>/.pi/company-profile.json` when project-local trust is active in Pi

If no trusted profile is available, the extension still applies baseline secret and destructive-command guards.

## Task state

Runtime task tools write local state to:

- `.pi/company-state/tasks/*.json`
- `.pi/project-context.md`
- `.pi/company-state/project-onboarding.json`
- `.pi/memory/MEMORY.md` when the user explicitly asks Pi to remember durable information; generated projects ignore this file by default
- `.pi/company-state/observed-bash.jsonl`
- `.pi/company-state/traces.jsonl`
- Pi custom session entry `company-task-trace`

Project-local state belongs in `.pi/.gitignore`.

Passing final gates require an observed exit `0` command that exactly matches one entry in `task.verifyCommands`. Other observed commands are traceable but advisory.

Raw path-like tool access to protected paths is blocked before execution. This includes Pi built-ins (`read`, `write`, `edit`, `grep`, `find`, `ls`) and custom/MCP tools with nested path-like strings, arrays, or `file://` URIs. Path-like strings are percent-decoded once, and input nesting above `MAX_TOOL_INPUT_INSPECTION_DEPTH=32` fails closed. Known content fields such as `content`, `query`, `pattern`, `text`, and `command` are excluded from generic extraction. `grep.glob` and `find.pattern` are checked when they explicitly target protected paths, while broad `grep`, `find`, and `ls` results are filtered so protected content lines or path metadata are redacted before reaching the model.

Raw `bash` access to protected paths is blocked through shell path extraction. `.pi/company-state/**` and `.pi/company-profile.json` are self-protected; use `company_context` and company task tools for governed access.
