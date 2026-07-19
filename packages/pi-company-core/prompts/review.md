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
7. Decide whether subagents are useful. If the bundled `pi-subagents` parent skill is available, use it for delegation patterns and safety boundaries. If `pi-subagents`/`subagent(...)` is available and the diff is non-trivial, use parallel `company-reviewer` agents for independent read-only review lanes:
   - correctness/edge cases;
   - tests/verification;
   - scope drift/protected paths;
   - security/high-risk only when relevant.
   If the user asks for a loop, use `/review-loop` semantics or equivalent parent-controlled max-round loop. Continue single-agent for tiny diffs or unavailable subagent tooling.
8. Report findings by severity.

Output:

| Severity | File/area | Finding | Required fix |
|---|---|---|---|

Also include:

- Subagents used/not used and why.
