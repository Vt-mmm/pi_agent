---
description: Implement a bounded project task using company Pi policy
argument-hint: "<task>"
---

Implement this task:

```text
$ARGUMENTS
```

Mandatory flow:

1. Call `company_context` and read the project profile.
2. Call `company_memory_status`. If memory is enabled and relevant to the task, search/read memory as advisory context, record citations with `company_memory_citation_record`, then verify against current repo files.
3. Read `.pi/project-context.md`. If it is missing or still says `Generated: not yet`, stop and ask the user to run `/onboard-project` after login/model selection before implementation.
4. Build a Task Implementation Contract before editing:
   - task id or short slug
   - risk lane
   - expected output
   - acceptance criteria
   - scope / out of scope
   - protected paths
   - required context
   - verify command
5. Read all required context files from the profile before planning.
6. State a context manifest: file + reason.
7. If the task requires source writes, make a short plan first.
8. Do not touch protected paths.
9. Use MCP/tools only when the profile capability allows it.
10. Before final answer, run the verify command mapped to the changed file class.
11. If verify cannot run, stop and report the exact blocker. Do not call it done.

Output format:

- Changed files.
- Verify command/result.
- Context manifest.
- Memory cited, if any.
- Residual risks.
- Next step if human action is needed.
