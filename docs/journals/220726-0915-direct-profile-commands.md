---
session: direct-profile-commands
version: 0.4.5
date: 2026-07-22
---

# Direct profile commands

## Change

Profile switching and lightweight status commands now avoid model follow-up by default:

- `/profile` and `/profiles` show concise profile status locally.
- `/profile list` shows a compact profile list.
- `/profile <profile>` applies the profile immediately and updates `.pi/company-profile.json` plus `.pi/company-profile.lock.json`.
- `/profile auto` applies the detected recommended profile.
- Short aliases map common intent to built-in profiles: `fe`, `be`, `full`, `be-fe`, and TypeScript aliases.
- `/company-status` and `/company-memory` emit concise local summaries instead of asking the model to call verbose tools.

The fallback `/profiles` prompt is also action-first and no longer calls `company_context detail=full` unless the user explicitly asks for full/debug output.

## Security notes

Direct profile apply preserves the existing project identity when available and continues to regenerate the deterministic capability lock. It does not relax protected paths, permission profiles, capability integrity checks, or secret redaction.

## Verification

- Added integration coverage proving direct profile commands apply immediately without model follow-up.
- Added integration coverage for concise status commands without model follow-up.
- Updated local verification coverage for documented `/profile auto`.
