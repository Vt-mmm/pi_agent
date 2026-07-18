---
description: Create an implementation plan using company Pi policy
argument-hint: "<goal>"
---

Create a concise implementation plan for:

```text
$ARGUMENTS
```

Rules:

1. Call `company_context`.
2. Call `company_memory_status`; search memory if it can reduce re-scouting, but treat it as advisory.
3. Read `.pi/project-context.md`; if it is missing or still pending, recommend `/onboard-project` before implementation.
4. Read required context.
5. Identify protected paths and external/high-risk actions.
6. Produce phases with exact files, commands, and verify gates.
7. Do not implement yet unless the user explicitly asks.

Include:

- Outcome.
- Scope and out-of-scope.
- Touchpoints.
- Risks.
- Verify commands.
- Memory cited, if any.
- Open questions.
