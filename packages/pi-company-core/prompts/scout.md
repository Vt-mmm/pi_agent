---
description: Scout a project area read-only under company policy
argument-hint: "<area/spec/risk to map>"
---

Scout read-only:

```text
$ARGUMENTS
```

Use this when the user needs evidence before deciding whether to implement. Do not edit source.

Preflight first:

1. Call `company_context_preflight` with `workflow=scout`.
2. If it recommends `fresh-session`, stop loading context in this session and tell the user to use `/fresh-scout <request>` unless this command already runs in a fresh session.
3. Call `company_context` with `detail=full`.
4. Call `company_memory_status`; cite relevant memory only with `company_memory_citation_record`, then verify against current repo files.
5. Read `.pi/project-context.md`; if pending, stop and ask for `/onboard-project`.
6. Create a read-only task contract with `company_task_start` before broad scouting:
   - risk lane;
   - expected output;
   - scope / out of scope;
   - protected paths;
   - required context;
   - read-only verify command.
7. Read required context and targeted task files. Use `company_context_budget` before large files.
8. Use read-only subagents for independent mapping when useful: `company-scout`, builtin `context-builder`, and `company-reviewer` for final evidence review. Continue single-agent if unavailable or too small.
9. Record context with `company_context_record`.
10. If shell is needed beyond simple read/list/test, call `company_exec_policy_check`.
11. Run the exact verify command from the task contract and record with `company_verify_record`.
12. Record handoff with `company_trace_record`.
13. Call `company_task_gate_check`. If the gate fails, report partial/blocked.

Output:

- Changed files: none.
- Verify command/result.
- Context manifest.
- Subagents used/not used and why.
- Memory cited, if any.
- Evidence matrix.
- Gaps/mismatches/unknowns.
- Transaction/security/data risks if relevant.
- Task gate result.
- Recommended next step.
