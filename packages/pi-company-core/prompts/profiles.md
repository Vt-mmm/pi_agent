---
description: Apply or show the active company project profile with minimal output
argument-hint: "[<profile> | apply <profile> | auto | list]"
---

Manage the current project's company profile with minimal token use.

Request:

```text
$ARGUMENTS
```

Rules:

1. If this package registered the direct `/profile` or `/profiles` extension command, prefer that command behavior and do not expand this prompt.
2. If the request names a profile directly, or says `apply`, `use`, `switch`, or `set`, call `company_profile_apply` immediately with `overwrite=true`.
3. Preserve the current `projectId` and `displayName` when known; do not print the full profile JSON.
4. If the request is `auto`, `recommended`, or `intent <value>`, call `company_profile_options`, take the recommended profile, then call `company_profile_apply` with `overwrite=true`.
5. If the request is empty, `show`, `status`, `current`, `list`, `options`, or `help`, call `company_context` with `detail=concise` and, only for list/options/help/auto, call `company_profile_options`.
6. Never call `company_context` with `detail=full` unless the user explicitly asks for `full` or `debug`.
7. Output at most 6 short lines:
   - applied/current profile;
   - updated files or current file status;
   - recommended profile if relevant;
   - next command only if needed.
8. After applying, mention `/onboard-project` only if `.pi/project-context.md` is missing or stale.

Common choices:

- `fullstack`: FE and BE can both be edited when task scope allows.
- `be-readonly-fe`: BE is source-of-truth/read-only; FE is write target.
- `web-frontend`: FE-only tasks.
- `backend-api`: BE-only tasks.
- `generic`: minimal baseline.
