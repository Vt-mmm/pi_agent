---
name: company-ops
description: Company operating policy for Pi tasks across projects.
---

# Company Ops Skill

Use this skill for every implementation, review, planning, MCP, or tooling task in a project using Pi Company Platform.

## Mandatory steps

1. Load active project profile with `company_context`.
2. Read required context before planning or editing.
3. Respect `protectedPaths`.
4. Use MCP only when capability is declared.
5. Prefer small diffs with explicit verification.
6. Before DONE, run the profile verify command for the changed file class.

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
- what remains manual

