# Changelog

This file records release-facing changes for Pi Agent Platform. Copy the relevant version block into GitHub Releases when publishing a tag.

## v0.4.7 - 2026-07-22

### Added

- Added `/commit` as a guarded local commit workflow:
  - inspect status and diff before staging;
  - stage explicit reviewed files only;
  - run relevant verification before commit;
  - never push from `/commit`.
- Added `/pr` as a guarded pull request preparation workflow:
  - inspect branch, status, upstream, and remote;
  - require a clean committed branch before PR work;
  - require explicit operator confirmation before `git push` or GitHub write actions.
- Added an exec-policy confirmation rule for broad Git staging, including `git add .`, `git add -A`, `git add --all`, `git add -- .`, `git add :/`, and `git -C <repo> add .`.
- Added regression tests for the new Git workflow prompts and broad-staging policy.
- Added canonical public docs metadata for `https://piagent.io.vn`.

### Changed

- Install docs now default to latest:
  - `pi install git:github.com/Vt-mmm/pi_agent`
  - `pi update --extensions`
- Pinned install examples use placeholders such as `vX.Y.Z` and `x.y.z` instead of hardcoding an old release.
- Runtime smoke verification now reads the current package version from `package.json` instead of hardcoding a tag.
- Docs site, README, package metadata, and Vercel docs now point to `https://piagent.io.vn`.

### Security

- Git remains a normal guarded capability, not a privileged `/git` bypass.
- Broad staging requires confirmation so unrelated or private files are not committed silently.
- Protected paths, sensitive-output redaction, capability lock integrity, and destructive/external confirmation gates remain active in every permission profile.

### Verification

- `npm run verify`: pass.
- `bash scripts/runtime-policy-smoke.sh`: pass.
- `npm test`: 185/185 pass.
- `npm run typecheck`: pass.

## v0.4.6 - 2026-07-22

### Added

- Added the static HTML documentation site under `docs-site/`.
- Added Vercel static-site configuration and deployment documentation.
- Added project logo, favicon, GitHub link, and Facebook link to the docs site.

### Changed

- Streamlined command documentation for lower-token daily usage.
- Removed the `SHIP` sidebar section from the docs site.
- Centered the docs layout and tightened the visual structure for wide screens.
- Documented latest global install and pinned project setup separately.

### Verification

- `git diff --check`: pass.
- Package verification remains covered by `npm run verify`.

## v0.4.5 - 2026-07-22

### Added

- Added direct profile commands that apply immediately without model follow-up:
  - `/profile`
  - `/profiles`
  - `/profile list`
  - `/profile <profile>`
  - `/profile auto`
- Added short profile aliases such as `fe`, `be`, `full`, `be-fe`, and TypeScript-oriented aliases.

### Changed

- `/company-status` and `/company-memory` now return concise local summaries instead of prompting verbose model/tool follow-up.
- Profile status output is intentionally compact to reduce token burn in routine checks.

### Security

- Direct profile apply still regenerates the deterministic capability lock and does not relax protected paths, secret redaction, or capability integrity checks.

## v0.4.4 - 2026-07-21

### Added

- Added session-local permission slash commands:
  - `/permission-status`
  - `/read-only`
  - `/workspace-write`
  - `/full-access`
  - `/full-access <task>`

### Changed

- Permission resolution precedence is explicit: launch environment override, then session command, then project profile, then policy default.
- `/full-access <task>` switches the session and forwards the task text as the next request.

### Security

- `trusted-full-access` remains guarded. It relaxes selected autonomy checks for trusted workspace work but does not disable protected paths, secret redaction, capability lock integrity, or destructive/external confirmations.

## v0.4.3 - 2026-07-21

### Added

- Added runtime permission profiles:
  - `read-only`;
  - `workspace-write`;
  - `trusted-full-access`.
- Added `PI_COMPANY_PERMISSION_PROFILE` for trusted one-run permission override.

### Security

- Invalid permission override values fail closed.
- The profile system is a runtime policy layer, not an operating-system sandbox.

## v0.4.2 - 2026-07-21

### Added

- Added sensitive-data redaction benchmark coverage for contextual secrets, benign preservation, structured payloads, and large output.
- Added release gates for redaction recall and false-positive control.

### Changed

- Improved sensitive-data redaction for common credential shapes and nested structured data.
- Kept unlabeled high-entropy strings observational instead of redacting indiscriminately.

### Verification

- Frozen-tree redaction baseline: 52/52 contextual cases detected, 0/30 benign false positives, 8/8 structured sensitive values redacted, and 7/7 structured benign values preserved.

## v0.4.1 - 2026-07-21

### Fixed

- Hardened shell secret protection against glob expansion targeting protected files.
- Hardened shell protection for bare-word aliases and symlinks resolving to protected paths.
- Added sensitive bash output redaction before tool results reach the model.
- Covered attached redirections such as `cat<.env` and similar shell forms.

### Security

- Static shell protection is stronger, but the guard still does not claim to be an OS sandbox.
- Protected-path blocking and output redaction are separate defense layers.

## v0.4.0 - 2026-07-21

### Added

- Added governed capability packs with deterministic catalog generation.
- Added profile capability resolution and `.pi/company-profile.lock.json`.
- Added lock integrity checks for package source, artifact digests, capability scope, and runtime enforcement files.
- Added atomic profile/lock write behavior with rollback on failure.

### Security

- Lock tampering fails closed.
- Core protected paths include `.pi/settings.json` and `.pi/company-profile.lock.json`.
- Capability scope can only narrow access; protected paths remain denied before allow-scope checks.

