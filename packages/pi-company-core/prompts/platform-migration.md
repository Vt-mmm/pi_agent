---
description: Migrate external agent/framework patterns into Pi Company Platform
argument-hint: "<sources + target behavior>"
---

Migrate agent/framework documentation or repository patterns into Pi Company Platform.

Request:

```text
$ARGUMENTS
```

Use this for tasks like:

- Pi docs/package migration.
- Codex CLI GitHub behavior mapping.
- Claude/Codex harness concept migration.
- Applying patterns from reference repos such as `mitsuhiko/agent-stuff`.

Mandatory flow:

1. Call `company_context` with `detail=full`.
2. Call `company_memory_status`; search memory for prior migration decisions if relevant, record citations with `company_memory_citation_record`, then verify against current source/docs.
3. Read `.pi/project-context.md`. If pending, stop and ask for `/onboard-project`.
4. Read required context from the active profile.
5. Identify source evidence:
   - official docs URL + date/version;
   - reference repo URL + commit/tag;
   - files inspected;
   - exact behavior/concept being migrated.
6. Use `company_reference_checkout` for repo references when available.
7. Do targeted inspection only. Do not copy large source blocks or vendor code.
8. Produce a migration matrix:

   | Source concept | Evidence | Apply? | Target file/config | Reason |
   |---|---|---:|---|---|

9. Implement only the bounded target behavior.
10. If policy/runtime behavior changes, update docs and add/adjust a decision note when appropriate.
11. Run platform verification before final.

Default verification:

```bash
bash scripts/verify-local.sh
bash scripts/team-doctor.sh /path/to/pi_agent --strict-share
pi list --approve
```

If setup/init behavior changed, also verify with a temporary project:

```bash
bash scripts/setup.sh /tmp/pi-fixture --project-only --profile auto --package-source git:github.com/Vt-mmm/pi_agent@v0.2.0
```

Final output:

- Sources inspected with URL/commit/date.
- What was migrated.
- What was intentionally not migrated.
- Changed files.
- Verify command/result.
- Memory cited, if any.
- Residual parity gaps vs the source tool.
