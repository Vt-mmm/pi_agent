---
session: session-permission-commands
version: 0.4.4
date: 2026-07-21
---

# Session permission commands

## Change

Added session-local slash commands for runtime permission profiles:

- `/permission-status`: shows the active permission profile and enforced boundaries.
- `/read-only`: switches the current session to read-only mode.
- `/workspace-write`: switches the current session to governed implementation mode.
- `/full-access`: switches the current session to trusted full-access mode.
- `/full-access <task>`: switches the current session, then forwards `<task>` as the next user request.

The command override is runtime-only and does not write `.pi/company-profile.json`.

## Security notes

Permission resolution precedence is explicit: launch environment override, then session command, then project profile, then policy default. This keeps terminal-level locked runs authoritative while allowing a convenient in-session switch for trusted work.

`trusted-full-access` remains a guarded mode. It can relax tool-registry and capability filesystem-scope checks for workspace autonomy, but protected paths, shell protected paths, secret redaction, capability lock integrity, and destructive/external confirmations remain enforced.

## Verification

- Added an integration regression proving `/full-access <task>` lifts a read-only session into `trusted-full-access`, forwards the task text, allows safe workspace writes, and still blocks `.env`.
- Added local verify coverage for documented `/full-access` command availability.
