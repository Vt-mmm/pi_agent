# Journal: 2026-07-21 — Shell secret-protection remediation

---
date: 2026-07-21
session: v0.4.1-shell-secret-protection-remediation
status: completed
version: 0.4.1
---

## Context

The runtime guard needed stronger protection against shell forms that could reach secret-bearing paths indirectly or expose sensitive values through tool results and verification evidence. The remediation focused on predictable fail-closed behavior while preserving legitimate shell use.

## What happened

- Extended shell analysis across quoted operands, variable propagation, attached redirections, file-consuming flags, pipeline-fed arguments, partial globs, brace alternatives, and canonical symbolic-link aliases.
- Blocked shell globs that can resolve to protected paths. Bounded expansion now fails closed when the guard cannot complete its analysis safely.
- Applied shared sensitive-data redaction to textual tool-result blocks and structured result details before they reach the model. Non-text media payloads remain unchanged.
- Kept exact verification identity through SHA-256 command hashes while storing only redacted command text in memory and persisted evidence.
- Updated the governed runtime package and integrity lock to v0.4.1.

## Defensive decisions

| Decision | Rationale | Effect |
|----------|-----------|--------|
| Analyze shell structure with quote-aware boundaries | Plain substring checks cannot distinguish data from executable operands reliably | Protected-path decisions cover more shell forms with fewer benign-command blocks |
| Fail closed on incomplete bounded expansion | Partial analysis must not become implicit authorization | Oversized or ambiguous glob alternatives are denied before execution |
| Enforce both pre-execution blocking and post-result redaction | Path prevention and output containment address different exposure routes | A broad tool result cannot return protected content or detected credentials unfiltered |
| Retain hashes, not raw sensitive command text | Verification needs stable identity without preserving secrets | Audit evidence remains matchable with reduced disclosure risk |
| Preserve explicit policy boundaries | Guard behavior must remain inspectable and project-governed | Custom protected paths continue to participate in the same checks |

## Verification

- Automated test suite: 161 passed, 0 failed.
- Type checking: passed.
- Current lock digest: `sha256:d8a46b50ea37b68544add1e73ccb382b9ba06f6fe673dd82c50b294fdf412ec6`.
- Offline local verification: passed.
- Dependency audit: 0 known vulnerabilities.

## Residual boundary

This protection is a policy guard, not an operating-system sandbox. It reduces accidental and recognizable policy violations inside supported tool hooks, but it does not replace process isolation, filesystem permissions, credential scoping, network egress controls, or human confirmation for destructive and external actions.

## Next considerations

- Keep adversarial shell cases in regression tests as new command forms are supported.
- Measure false-positive and denied-command patterns without retaining raw sensitive input.
- Pair the guard with least-privilege credentials and OS-level isolation for higher-risk workloads.
- Recompute and verify the runtime lock whenever governed security files change.
