---
description: Improve Pi Agent Platform workflows, policies, or package behavior
argument-hint: "<goal + affected area>"
---

Improve the Pi Agent Platform in a bounded, verifiable way.

Request:

```text
$ARGUMENTS
```

Use this workflow for platform-level work such as:

- updating package prompts, skills, extensions, or subagents;
- improving setup, onboarding, MCP, model, memory, or usage flows;
- tightening runtime policy, task gates, or verification behavior;
- adding project-agnostic workflow support for teams.

Mandatory flow:

1. Call `company_context` with `detail=full` and inspect the active project profile.
2. Call `company_memory_status`; if prior decisions are relevant, search memory and record citations with `company_memory_citation_record`.
3. Read `.pi/project-context.md`. If pending, stop and ask the user to run `/onboard-project`.
4. Read the required context declared by the active profile. Before loading large files, call `company_context_budget`.
5. Classify the task risk lane and create a task contract with `company_task_start` before source edits.
6. Decide whether subagents are useful:
   - use `company-scout` for read-only code/package mapping;
   - use `company-planner` for a plan when multiple modules are affected;
   - use `company-reviewer` for diff, docs, and verification review;
   - continue single-agent for small, localized edits.
7. If the task needs external repository context provided by the user, use `company_source_checkout` when available and read only targeted files.
8. Before shell commands that fetch, build, publish, or mutate package state, call `company_exec_policy_check`.
9. Before non-company MCP/app tools, call `company_tool_policy_check`.
10. Produce an implementation matrix:

    | Area | Current behavior | Target behavior | Files/config | Verification |
    |---|---|---|---|---|

11. Implement only the bounded target behavior.
12. If runtime behavior changes, update README/docs and add/adjust a decision note when appropriate.
13. For source-changing tasks, record context, verify evidence, trace, then call `company_task_gate_check` before final.

Default verification:

```bash
bash scripts/verify-local.sh
bash scripts/team-doctor.sh /path/to/pi_agent --strict-share
pi list --approve
```

If setup/init behavior changed, also verify with a disposable fixture:

```bash
bash scripts/setup.sh /tmp/pi-fixture --project-only --profile auto --package-source git:github.com/Vt-mmm/pi_agent@v0.3.12
```

Final output:

- Goal and scope handled.
- Changed files.
- Verification command/result.
- Subagents used/not used and why.
- Memory cited, if any.
- Task gate result.
- Remaining risks or follow-up.
