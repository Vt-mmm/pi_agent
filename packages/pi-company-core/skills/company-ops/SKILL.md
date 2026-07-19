---
name: company-ops
description: Company operating policy for Pi tasks across projects.
---

# Company Ops Skill

Use this skill for every implementation, review, planning, MCP, or tooling task in a project using Pi Company Platform.

## Mandatory steps

1. Load active project profile with `company_context`.
2. Read required context before planning or editing; use `company_context_budget` for large files.
3. Start source-changing work with `company_task_start`.
4. Respect `protectedPaths`.
5. Check complex/high-impact shell with `company_exec_policy_check`.
6. Check non-company MCP/app tools with `company_tool_policy_check`.
7. Use MCP only when capability is declared.
8. Prefer small diffs with explicit verification.
9. Run the exact command from `task.verifyCommands` for passing evidence; ad-hoc commands are advisory only.
10. Record context, verify, and trace with `company_context_record`, `company_verify_record`, and `company_trace_record`.
11. Before DONE, call `company_task_gate_check`.

## Risk gates

Stop for human confirmation when task touches:

- auth
- payments
- data migration
- external provider setup
- deploy/release
- destructive filesystem operation
- broad refactor across unrelated modules

## Final response

Always include:

- what changed
- where
- exact verification result
- task gate result
- what remains manual
