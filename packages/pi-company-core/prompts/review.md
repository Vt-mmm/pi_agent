---
description: Review current project changes under company policy
argument-hint: "<target or git diff>"
---

Review:

```text
$ARGUMENTS
```

Rules:

1. Call `company_context`.
2. Read `.pi/project-context.md` if available.
3. Stay read-only unless explicitly asked to write a report.
4. Check protected path violations.
5. Check missing required context.
6. Check verify command coverage.
7. Report findings by severity.

Output:

| Severity | File/area | Finding | Required fix |
|---|---|---|---|
