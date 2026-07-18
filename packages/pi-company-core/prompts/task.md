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
6. Record context manifest with `company_context_record`: file + reason.
7. If the task requires shell commands beyond simple read/list/test, call `company_exec_policy_check` first.
8. If the task requires non-company MCP/app tools, call `company_tool_policy_check` first.
9. If the task requires source writes, make a short plan first.
10. Do not touch protected paths.
11. Use MCP/tools only when the profile capability allows it.
12. Before final answer, run the verify command mapped to the changed file class and record it with `company_verify_record`.
13. Record handoff with `company_trace_record`.
14. Call `company_task_gate_check`. If gate fails, final outcome is blocked/partial, not done.
15. If verify cannot run, stop and report the exact blocker. Do not call it done.

Output format:

- Changed files.
- Verify command/result.
- Context manifest.
- Memory cited, if any.
- Task gate result.
- Residual risks.
- Next step if human action is needed.
