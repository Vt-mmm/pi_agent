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

1. Call `company_context` with `detail=full`.
2. Read `.pi/project-context.md`. If pending, stop and ask for `/onboard-project`.
3. Read required context from the active profile.
4. Classify the task:
   - BE scout: read-only.
   - FE implementation: source-write.
   - Auth/data migration/external provider: high-risk, ask before implementation.
5. Scout backend contract read-only:
   - controller/route/handler;
   - request/response DTO/schema;
   - validation/error model;
   - backend tests;
   - OpenAPI/spec/docs if available;
   - migration/schema only when it affects API shape or UI constraints.
6. Produce a contract snapshot before FE writes:

   | Contract area | Backend evidence | FE implication |
   |---|---|---|

7. If backend contract is missing/contradictory, do not guess and do not edit BE. Record the gap in the final response or a project report if requested.
8. Map FE touchpoints:
   - API client/query/mutation layer;
   - types/decoders;
   - state/cache invalidation;
   - route/page/component/form;
   - tests/e2e.
9. Implement FE only.
10. Run FE verify commands from the profile.
11. Record task context/verify/trace when runtime tools are available.

For generic projects, use profile `be-readonly-fe` when the repo policy is “BE scout only, FE write allowed”.

Final output:

- Backend files read and why.
- Contract snapshot summary.
- FE files changed.
- Verify command/result.
- Backend gaps, if any.
- Residual risk.
