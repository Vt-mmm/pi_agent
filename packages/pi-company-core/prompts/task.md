---
description: Implement a bounded project task using company Pi policy
argument-hint: "<task>"
---

Implement this task:

```text
$ARGUMENTS
```

Mandatory flow:

1. Call `company_context` and read the project profile/runtime policy.
2. Call `company_memory_status`. If memory is enabled and relevant to the task, search/read memory as advisory context, record citations with `company_memory_citation_record`, then verify against current repo files.
3. Read `.pi/project-context.md`. If it is missing or still says `Generated: not yet`, stop and ask the user to run `/onboard-project` after login/model selection before implementation.
4. Build a Task Implementation Contract with `company_task_start` before editing:
   - task id or short slug
   - risk lane
   - expected output
   - acceptance criteria
   - scope / out of scope
   - protected paths
   - required context
   - verify command
5. Read all required context files from the profile before planning, then call `company_context_budget` for large or unfamiliar files.
6. Decide whether subagents are useful. If the bundled `pi-subagents` parent skill is available, use it for delegation patterns and safety boundaries. If `pi-subagents`/`subagent(...)` is available, use subagents automatically for independent read-heavy scout/planning/review work instead of requiring the user to type `/run`:
   - use `company-scout` for unfamiliar module/spec mapping;
   - use builtin `context-builder` when a large task needs a handoff context/meta-prompt before planning;
   - use `company-planner` for medium/high-risk implementation planning;
   - use `company-reviewer` for final diff/test/scope review;
   - keep implementation single-writer unless the user explicitly asks for parallel writers or worktree isolation is clearly safe;
   - if subagents are unavailable or not useful, continue single-agent and record why.
7. Record context manifest with `company_context_record`: file + reason.
8. If the task requires shell commands beyond simple read/list/test, call `company_exec_policy_check` first.
9. If the task requires non-company MCP/app tools, call `company_tool_policy_check` first.
10. If the task requires source writes, make a short plan first.
11. Do not touch protected paths.
12. Use MCP/tools only when the profile capability allows it.
13. Before final answer, run the exact verify command from `task.verifyCommands` through Pi bash, then record the observed result with `company_verify_record`. Do not use `true`, `echo ok`, or `|| true` as passing evidence unless that exact command is part of the task verify plan.
14. Record handoff with `company_trace_record`.
15. Call `company_task_gate_check`. If gate fails, final outcome is blocked/partial, not done.
16. If the user asks about token/context/cost usage, call `company_usage_snapshot`; for exact token/cost totals, tell the user to run `/session` or `pi-company-usage <project-path>`.
17. If verify cannot run, stop and report the exact blocker. Do not call it done.

Output format:

- Changed files.
- Verify command/result.
- Context manifest.
- Subagents used/not used and why.
- Memory cited, if any.
- Task gate result.
- Residual risks.
- Next step if human action is needed.
