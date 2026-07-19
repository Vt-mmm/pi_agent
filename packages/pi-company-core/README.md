# @pi-agent/core

Shared Pi package for reusable project workflows.

## Contents

- `extensions/company-guard.ts`: runtime guard tools and policy hooks.
- `prompts/*.md`: slash-command workflows.
- `skills/company-ops/SKILL.md`: operating guidance for implementation tasks.
- `skills/company-source-cache/`: local cache for user-provided external source repositories.
- `subagents/*.md`: company roles for `pi-subagents`.
- `policies/base-policy.json`: default runtime policy.

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
- `company_verify_record`
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
pi install git:github.com/Vt-mmm/pi_agent@v0.3.11
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
- `.pi/memory/MEMORY.md` when the user explicitly asks Pi to remember durable information
- `.pi/company-state/traces.jsonl`
- Pi custom session entry `company-task-trace`

Project-local state belongs in `.pi/.gitignore`.
