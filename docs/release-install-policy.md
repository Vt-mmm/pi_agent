# Release and install policy

## Purpose

Pi Company Platform uses explicit release sources for team rollout. Personal machines can follow a moving source when fast iteration matters, but committed project settings should use exact tags or reviewed commits so every developer receives the same platform package.

## Release channels

| Channel | Source shape | Mutability | Use when |
|---|---|---:|---|
| `stable` | `git:github.com/Vt-mmm/pi_agent@v0.4.7` | Fixed | Default for team and production rollout. |
| `exact` | `git:github.com/Vt-mmm/pi_agent@vX.Y.Z` or reviewed commit | Fixed | Roll forward, rollback, or reproduce a past install. |
| `dev` | `git:github.com/Vt-mmm/pi_agent` | Moving | Personal machine or sandbox only. Do not commit into `.pi/settings.json`. |
| `local` | `/path/to/pi_agent` | Local workspace | Platform development and dry-run validation. |
| `enterprise-npm` | `npm:@company/pi-agent-platform@x.y.z` | Fixed | Private registry distribution when available. |

`stable` currently resolves to the package version in `package.json`: `v0.4.7`.

## Install flow

First install the compatible Pi Coding Agent runtime:

```bash
node --version  # >= 20
npm install -g @earendil-works/pi-coding-agent@0.80.10
```

For team rollout, install the exact stable tag:

```bash
pi install git:github.com/Vt-mmm/pi_agent@v0.4.7
pi update --extensions
```

From a source checkout, the helper can preview and apply the same stable source:

```bash
bash scripts/install-global.sh --stable --dry-run
bash scripts/install-global.sh --stable
```

Install a specific version:

```bash
bash scripts/install-global.sh --version v0.4.7 --dry-run
bash scripts/install-global.sh --version v0.4.7
```

Personal or sandbox moving install:

```bash
bash scripts/install-global.sh --dev --dry-run
bash scripts/install-global.sh --dev
```

## Update flow

1. Read `CHANGELOG.md` for the target version.
2. Preview the target install:

   ```bash
   bash scripts/install-global.sh --version vX.Y.Z --dry-run
   ```

3. Apply the exact version:

   ```bash
   bash scripts/install-global.sh --version vX.Y.Z
   pi update --extensions
   ```

4. Verify the target project:

   ```bash
   pi-company-doctor /path/to/project --strict-share
   ```

5. If working from the platform source repo, also run:

   ```bash
   npm run smoke
   npm run verify
   npm test
   npm run typecheck
   ```

## Rollback flow

Rollback is code-only first: reinstall the previous known-good tag while keeping project state intact.

```bash
bash scripts/install-global.sh --version vX.Y.Z --dry-run
bash scripts/install-global.sh --version vX.Y.Z
pi update --extensions
pi-company-doctor /path/to/project --strict-share
```

Restore project state only if a newer profile, lock, or runtime state cannot be read by the older package. Preserve the current state separately before restoring any project snapshot.

## Release checklist

1. Update package versions, `CHANGELOG.md`, docs install examples, and public docs metadata.
2. Run:

   ```bash
   npm run verify
   npm test
   npm run typecheck
   bash scripts/install-global.sh --stable --dry-run --no-model-scope
   bash scripts/setup.sh --global-only --package-source git:github.com/Vt-mmm/pi_agent@vX.Y.Z --dry-run
   ```

3. Create a signed or reviewed tag where possible:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file /tmp/pi-agent-vX.Y.Z-release-notes.md
   ```

4. After release, verify that stable install examples point to the new exact tag.

## Security notes

- Do not use a moving source in committed project settings.
- Do not publish local trust files, OAuth tokens, `auth.json`, sessions, caches, or `.env` files.
- Run doctor after install/update so project profile, package source, protected paths, and share policy are checked together.
