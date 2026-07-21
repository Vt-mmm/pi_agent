# Journal: 2026-07-21 — Capability platform foundation

---
date: 2026-07-21
session: capability-platform-foundation
status: completed
---

## Context

The platform needed one governed unit for composing reusable agent behavior across projects without placing project-specific logic in the core package. The foundation therefore had to make capability selection deterministic, auditable, and secure by default.

## What happened

- Added a declarative capability-pack contract, generated catalog, deterministic resolver, and project lock document. The lock records the resolved graph, exact versions, source binding, artifact digests, permission surface, and protected paths.
- Made profile updates fail closed: a candidate profile is validated and resolved first, then the lock is written before the profile using per-file atomic rename and rollback on write failure. Unsafe paths, symbolic-link targets, malformed policies, stale locks, and unresolved graphs stop the update.
- Required explicit profile grants for pack owners, lifecycle stages, filesystem scopes, network domains, external actions, and runtime capabilities. Resolution rejects any requested authority outside those grants.
- Required exact version, tag, or commit references for remote package sources and SHA-256 integrity evidence for resolved content. Exact dependency versions and globally unique artifact identifiers remove ambiguous graph bindings.
- Defined the external-action proposal as a dry-run boundary. Validation rejects immediate execution, expired or non-canonical timestamps, oversized payloads, unknown fields, and secret-like material; it does not perform an external action.
- Added adversarial coverage for traversal, case-variant protected paths, symbolic-link aliases, dependency and recipe cycles, duplicate identifiers, stale integrity state, permission escalation, unsafe write targets, action-token formats, and timestamp abuse.
- Verified the result with 146 passing tests and zero failures. Type checking, catalog freshness, capability doctor, local scaffold verification, and dependency audit also passed; the audit reported zero known vulnerabilities.

## Reflection

The strongest result is that capability composition is now a data and policy problem with observable evidence, rather than implicit runtime behavior. Deterministic locks and explicit grants make review practical, while fail-closed updates prevent a partially valid profile from becoming active. The remaining security boundary is intentional: proposals are validated but external execution is still outside this phase and must retain direct human confirmation.

## Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Use declarative manifests, recipes, and evaluation scenarios | Keep behavior small, inspectable, and schema-governed | New capability families can be assessed consistently |
| Resolve exact dependency graphs into a lock | Eliminate version ambiguity and bind activation to verified content | Project state is reproducible and stale state is detectable |
| Deny undeclared authority | Security policy must be explicit at the project boundary | Packs cannot expand filesystem, network, action, or runtime capability access |
| Validate before a lock-first, fail-closed profile update | Partial updates create unsafe and difficult-to-audit states | Invalid changes leave the active profile unchanged; transient mismatch is rejected |
| Keep action proposals non-executing | Validation and authorization are separate security boundaries | External effects remain subject to explicit human confirmation |

## Next

- Run the same quality gates in CI and retain catalog and lock diffs as review evidence.
- Add an evaluation runner with policy-bypass and prompt-injection regression scenarios.
- Extend runtime enforcement only with explicit approval gates, bounded network policy, and auditable action receipts.
- Promote capability lifecycle stages only after ownership, security review, evaluation thresholds, and compatibility evidence are satisfied.
