---
description: Implement frontend from backend spec/contract with backend read-only
argument-hint: "<BE spec/change + FE outcome>"
---

Implement a frontend change from a backend spec, backend diff, or backend source contract without modifying backend source.

Request:

```text
$ARGUMENTS
```

Use this for tasks like:

- BE endpoint/DTO changed and FE must consume it.
- BE feature spec must be surfaced in FE.
- FE needs to map validation/errors/state from backend contract.
- Backend source must be scouted but not edited.

Mandatory flow:

1. Call `company_context` with `detail=full` and confirm profile/protected backend paths.
2. Call `company_memory_status`; search memory for prior BE/FE mapping decisions if relevant, record citations with `company_memory_citation_record`, then verify against current BE/FE files.
3. Read `.pi/project-context.md`. If pending, stop and ask for `/onboard-project`.
4. Read required context from the active profile and call `company_context_budget` for BE/FE files that look large.
5. Classify the task:
   - BE scout: read-only.
   - FE implementation: source-write.
   - Auth/data migration/external provider: high-risk, ask before implementation.
6. Decide whether subagents are useful. If `pi-subagents`/`subagent(...)` is available, prefer automatic read-only delegation:
   - `company-scout` maps backend contract read-only;
   - `company-scout` maps frontend touchpoints read-only;
   - `company-planner` produces the FE implementation plan when the contract touches multiple layers;
   - `company-reviewer` reviews diff/verification after implementation.
   Continue single-agent if subagents are unavailable, the task is tiny, or requirements are unresolved.
7. Scout backend contract read-only:
   - controller/route/handler;
   - request/response DTO/schema;
   - validation/error model;
   - backend tests;
   - OpenAPI/spec/docs if available;
   - migration/schema only when it affects API shape or UI constraints.
8. Produce a contract snapshot before FE writes:

   | Contract area | Backend evidence | FE implication |
   |---|---|---|

9. If backend contract is missing/contradictory, do not guess and do not edit BE. Record the gap in the final response or a project report if requested.
10. Map FE touchpoints:
   - API client/query/mutation layer;
   - types/decoders;
   - state/cache invalidation;
   - route/page/component/form;
   - tests/e2e.
11. Before source writes, create a Task Implementation Contract with `company_task_start`.
12. Record BE/FE context files with `company_context_record`.
13. Before shell commands beyond simple read/list/test, call `company_exec_policy_check`.
14. Implement FE only.
15. Run FE verify commands from the profile and record evidence with `company_verify_record`.
16. Record handoff with `company_trace_record`.
17. Call `company_task_gate_check`; if it fails, report blocked/partial instead of done.

For generic projects, use profile `be-readonly-fe` when the repo policy is “BE scout only, FE write allowed”.

Final output:

- Backend files read and why.
- Contract snapshot summary.
- FE files changed.
- Verify command/result.
- Subagents used/not used and why.
- Task gate result.
- Memory cited, if any.
- Backend gaps, if any.
- Residual risk.
