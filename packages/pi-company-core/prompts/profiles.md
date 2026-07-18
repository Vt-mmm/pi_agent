---
description: Show or switch the active company project profile
argument-hint: "[show | apply <profile> | intent be-readonly-fe]"
---

Manage the current project's company profile.

Request:

```text
$ARGUMENTS
```

Rules:

1. Call `company_context` with `detail=full`.
2. Call `company_profile_options`.
3. Show:
   - current profile;
   - recommended profile;
   - available profiles;
   - what changes if switching.
4. If the user explicitly asked `apply <profile>`, call `company_profile_apply`.
5. If `.pi/company-profile.json` already exists, do not overwrite unless the user explicitly asked for overwrite/replace.
6. After applying, tell the user to run `/onboard-project` if `.pi/project-context.md` is missing or stale.

Common choices:

- `fullstack`: FE and BE can both be edited when task scope allows.
- `be-readonly-fe`: BE is source-of-truth/read-only; FE is write target.
- `web-frontend`: FE-only tasks.
- `backend-api`: BE-only tasks.
- `generic`: minimal baseline.
