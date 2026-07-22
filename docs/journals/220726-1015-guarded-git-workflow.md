# Guarded Git workflow

Date: 2026-07-22

## Summary

This update adds focused Git workflow commands for team usage without introducing a broad `/git` namespace.

## What changed

- Added `/commit` as a local-only commit workflow:
  - inspect status and diff first;
  - stage explicit reviewed files;
  - run verification before commit;
  - do not push.
- Added `/pr` as a pull request preparation workflow:
  - inspect branch, status, and remote;
  - require a clean committed branch before PR work;
  - ask before `git push` or GitHub write actions.
- Added an exec-policy prompt rule for broad staging:
  - `git add .`
  - `git add -A`
  - `git add --all`
  - `git add -- .`
  - `git add :/`
  - `git -C <repo> add .`
- Kept targeted staging such as `git add README.md` allowed.
- Updated package/docs version references so personal installs may follow latest while team/project examples use pinned release tags.

## Security note

Git remains a normal shell/tool capability guarded by the existing policy layer. The release does not create a privileged Git bypass. Protected paths, output redaction, integrity lock checks, and external-action confirmation gates stay active.
