# Journal: 2026-07-21 — Redaction recall benchmark hardening

---
date: 2026-07-21
session: v0.4.2-redaction-recall-benchmark-hardening
status: completed
version: 0.4.2
---

## Context

The shared redaction layer needed measurable recall across contextual secrets without broadening detection enough to damage ordinary identifiers and prose. The initial benchmark detected 26 of 33 contextual cases (78.8%) and produced a false positive on a structured identifier.

## What happened

- Added a deterministic benchmark covering contextual secret labels, benign controls, structured payloads, unlabeled entropy observations, and large tool output.
- Hardened key recognition with context-aware exact and suffix matching while retaining an exact allowlist for safe plural identifiers.
- Added quote-aware, bounded value extraction so labeled credentials are contained without consuming unrelated text.
- Preserved the existing shell parser boundary; this change remained isolated to shared sensitive-data detection and redaction behavior.
- Kept unlabeled high-entropy values observational because entropy alone does not establish secret context reliably.

## Reflection

The benchmark converted an imprecise security concern into explicit recall and false-positive evidence. The final result closes the observed contextual gaps while preserving benign structured data. Keeping entropy observational avoids a high-noise global rule and leaves room for future evaluation with representative workloads.

## Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Make no shell parser changes | Shell protection and content redaction are separate control surfaces | v0.4.2 remains narrowly scoped and easier to audit |
| Match exact sensitive keys and approved suffix forms with context | Real payloads use nested and namespaced labels | Contextual recall improves without unrestricted substring matching |
| Maintain an exact plural allowlist | Common collection fields can contain identifiers rather than credentials | Known structured-ID false positives remain preserved |
| Bound values with quote-aware extraction | Labeled values require precise termination rules | Secrets are removed without absorbing neighboring content |
| Do not globally redact unlabeled entropy | Random-looking values are not sufficient evidence of sensitivity | Benign hashes and identifiers remain usable |

## Verification

- Automated suite: 165 passed, 0 failed across 10 suites.
- Contextual benchmark: 52 of 52 detected.
- Benign controls: 0 false positives across 30 cases.
- Structured payloads: 8 of 8 sensitive values redacted; 7 of 7 benign values preserved.
- Unlabeled entropy: 0 of 6 detected, recorded as observational and non-gated.
- Large output: sensitive content redacted from a 180,265-byte payload.
- Current lock digest: `sha256:2490ee2edfd6d11c88f3ab2720456b24aa3b3a70ec9b16ba17947aeeb6781f84`.
- Dependency audit: 0 findings across 94 packages.
- Independent review, quality assurance, and documentation checks: passed.

## Residual boundary

Redaction remains a policy guard, not an operating-system sandbox. It reduces disclosure through supported tool and evidence paths, but it does not replace credential scoping, process isolation, filesystem permissions, network controls, or human authorization. Unlabeled entropy remains intentionally outside the blocking gate.

## Next

- Track benchmark recall and benign preservation as release gates for future detector changes.
- Expand corpus coverage using sanitized, representative payload shapes.
- Review observational entropy outcomes before introducing any contextual entropy rule.
- Recompute and verify the runtime lock whenever governed redaction files change.
