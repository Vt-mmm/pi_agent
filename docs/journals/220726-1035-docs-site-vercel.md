# 2026-07-22 10:35 — Docs site and Vercel deployment path

## Summary

Added a static HTML documentation site for Pi Company Platform and a Vercel deployment guide.

## Changes

- Added `docs-site/index.html` as a dark, sidebar-based team docs page.
- Added `docs-site/vercel.json` with static URL behavior and safe response headers.
- Added `docs/vercel-docs-site.md` with dashboard and CLI deployment steps.
- Documented Pi positioning, architecture, security boundaries, profile commands, permission modes, workflow commands, runtime scripts, and team usage.
- Deployed production docs at https://docs-site-three-pearl.vercel.app.

## Operator decision

Keep docs in the same repository under `docs-site/` and configure Vercel Root Directory to `docs-site`.

## Verification

- Static source lint through `git diff --check`.
- Package verification remains covered by `npm run verify`.
