---
session: runtime-permission-profiles
version: 0.4.3
date: 2026-07-21
---

# Runtime permission profiles

## Change

Added explicit runtime permission profiles for project sessions:

- `read-only`: allows `read`, `grep`, `find`, `ls`, and company state tools; blocks shell, write/edit, and unknown non-company tools before execution.
- `workspace-write`: default guarded implementation mode.
- `trusted-full-access`: trusted automation mode that can relax tool-registry blocks and capability filesystem scopes while preserving protected-path, redaction, capability-lock, and destructive/external confirmation gates.

`PI_COMPANY_PERMISSION_PROFILE` can override the active profile for one trusted run. Invalid override values fail closed to `read-only`. The base policy now defines an allowlist so installations can remove `trusted-full-access` without changing project profiles.

## Security notes

This is a runtime policy layer, not an operating-system sandbox. The full-access profile is explicit and auditable, but it does not authorize secret handling or external side effects. Protected paths and sensitive output redaction remain enforced in every profile.

## Verification

- `npm test`: 168/168 passing.
- `npm run typecheck`: passing.
- `npm run verify`: passing.
- Capability catalog and project lock regenerated after runtime guard and policy changes.
