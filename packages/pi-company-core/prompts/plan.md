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
2. Read `.pi/project-context.md`; if it is missing or still pending, recommend `/onboard-project` before implementation.
3. Read required context.
4. Identify protected paths and external/high-risk actions.
5. Produce phases with exact files, commands, and verify gates.
6. Do not implement yet unless the user explicitly asks.

Include:

- Outcome.
- Scope and out-of-scope.
- Touchpoints.
- Risks.
- Verify commands.
- Open questions.
