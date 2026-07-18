---
name: company-reference-repo
description: Cache and inspect external Git repositories used as implementation reference.
---

# Company Reference Repo

Use this skill when the user provides a GitHub/GitLab/Bitbucket repository as a reference source.

## Goal

Keep remote reference repositories:

- stable: predictable cache path;
- fresh: throttled fetch;
- cheap: no repeated clone;
- safe: never edit the shared cache directly.

## Workflow

1. Prefer the runtime tool if available:

   ```text
   company_reference_checkout(repoRef="owner/repo")
   ```

2. If the runtime tool is unavailable, resolve the repo into a local checkout from a platform clone:

   ```bash
   PI_COMPANY_PLATFORM_HOME=/path/to/pi-company-platform
   bash "$PI_COMPANY_PLATFORM_HOME/packages/pi-company-core/skills/company-reference-repo/checkout-reference-repo.sh" <repo-ref> --path-only
   ```

3. Use the printed path for targeted `rg`, `sed`, and file reads.
4. Read only files relevant to the user request.
5. If edits are needed, create a separate project/worktree; do not edit the cache.
6. Cite the upstream URL in reports.

## Supported refs

- `owner/repo`
- `github.com/owner/repo`
- `https://github.com/owner/repo`
- `git@github.com:owner/repo.git`

## Cache location

Default:

```text
${XDG_CACHE_HOME:-$HOME/.cache}/pi-company-platform/checkouts/<host>/<owner>/<repo>
```

Override:

```bash
PI_COMPANY_PLATFORM_HOME=/path/to/pi-company-platform
PI_COMPANY_CHECKOUT_CACHE=/path/to/cache bash "$PI_COMPANY_PLATFORM_HOME/packages/pi-company-core/skills/company-reference-repo/checkout-reference-repo.sh" owner/repo --path-only
```
