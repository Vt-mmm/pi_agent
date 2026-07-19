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

1. Call `company_context` with `detail=full` and inspect runtime policy.
2. Call `company_memory_status`; search memory for prior migration decisions if relevant, record citations with `company_memory_citation_record`, then verify against current source/docs.
3. Read `.pi/project-context.md`. If pending, stop and ask for `/onboard-project`.
4. Read required context from the active profile and call `company_context_budget` before injecting large reference files.
5. Identify source evidence:
   - official docs URL + date/version;
   - reference repo URL + commit/tag;
   - files inspected;
   - exact behavior/concept being migrated.
6. Decide whether subagents are useful. If the bundled `pi-subagents` parent skill is available, use it for delegation patterns and safety boundaries. If `pi-subagents`/`subagent(...)` is available, use automatic read-only delegation for independent research:
   - `company-scout` inspects current platform docs/scripts;
   - builtin `researcher` inspects official/web evidence when `pi-web-access` or equivalent web tools are installed;
   - builtin `context-builder` creates handoff context/meta-prompt for broad migrations;
   - `company-scout` inspects official docs/reference repo evidence;
   - `company-planner` builds the migration matrix and target plan;
   - `company-reviewer` checks parity/docs/runtime behavior after changes.
   Continue single-agent if subagents are unavailable or the migration is tiny.
7. Use `company_reference_checkout` for repo references when available.
8. Do targeted inspection only. Do not copy large source blocks or vendor code.
9. Before shell commands that fetch, clone, build, publish, or mutate package state, call `company_exec_policy_check`.
10. Before non-company MCP/app tools, call `company_tool_policy_check`.
11. Produce a migration matrix:

   | Source concept | Evidence | Apply? | Target file/config | Reason |
   |---|---|---:|---|---|

12. Implement only the bounded target behavior.
13. If policy/runtime behavior changes, update docs and add/adjust a decision note when appropriate.
14. For source-changing platform tasks, record verify evidence and trace, then call `company_task_gate_check` before final.
15. Run platform verification before final.

Default verification:

```bash
bash scripts/verify-local.sh
bash scripts/team-doctor.sh /path/to/pi_agent --strict-share
pi list --approve
```

If setup/init behavior changed, also verify with a temporary project:

```bash
bash scripts/setup.sh /tmp/pi-fixture --project-only --profile auto --package-source git:github.com/Vt-mmm/pi_agent@v0.3.0
```

Final output:

- Sources inspected with URL/commit/date.
- What was migrated.
- What was intentionally not migrated.
- Changed files.
- Verify command/result.
- Subagents used/not used and why.
- Memory cited, if any.
- Task gate result.
- Residual parity gaps vs the source tool.
