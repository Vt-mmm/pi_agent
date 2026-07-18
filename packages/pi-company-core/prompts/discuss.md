---
description: Clarify an unclear task before planning or implementation
argument-hint: "<rough idea>"
---

Clarify this request before implementation:

```text
$ARGUMENTS
```

Operating rules:

1. Call `company_context` first when available.
2. Read `.pi/project-context.md` if available; if it is still pending, recommend `/onboard-project` before implementation.
3. Inspect relevant files/docs before asking; do not ask what can be answered from the project.
4. Identify the next unresolved decision, dependency, constraint, or risk.
5. Ask at most 3 focused questions per round.
6. For each question, include:
   - recommended/default answer
   - short reason
   - impact if the user chooses differently
7. Resolve prerequisite decisions before dependent decisions.
8. Stop when the task is clear enough to produce a bounded plan.
9. Do not edit files and do not implement.

Final output when clear:

- agreed decisions
- remaining open questions, if any
- implementation approach
- required context
- verify commands
- recommended next command: `/plan` or `/task`
