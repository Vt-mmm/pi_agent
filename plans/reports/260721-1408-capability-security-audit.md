# Capability Platform Phase 0 — Security Audit

---
type: security-audit
date: 2026-07-21
status: complete
scope: capability-platform-phase-0
---

## Executive summary

Phase 0 is approved for its declared scope. The final independent review found no actionable P1/P2 issue and no open Critical/High security finding. The implementation establishes a fail-closed capability boundary through exact dependency resolution, explicit project grants, deterministic locks, protected-path controls, shared secret detection, and non-executing external-action proposals.

This approval does not classify Pi as an operating-system sandbox. A trusted Pi project remains code-execution trust. Workloads containing untrusted code, prompts, or credentials still require process, filesystem, network, and credential isolation outside the extension runtime.

## Scope

- Capability pack, recipe, evaluation-scenario, project-profile, and action-proposal schemas.
- Catalog generation, exact graph resolution, lock generation, and lock verification.
- Profile application, recovery behavior, package-source validation, and runtime guard enforcement.
- Filesystem, network, external-action, runtime-capability, protected-path, and sensitive-data controls.
- Automated regression tests, type checking, doctor commands, local verification, and dependency audit.

## Threat model assessment

| STRIDE area | Implemented control | Result |
|---|---|---|
| Spoofing | Exact package identifiers, exact version/tag/commit requirements, installed-content digest, owner allowlist | Controlled within Phase 0; signed provenance remains future work |
| Tampering | Canonical JSON, SHA-256 artifact and package digests, deterministic lock, per-tool-call lock verification, validation-before-write, rollback | Fail closed on stale, malformed, or inconsistent state |
| Repudiation | Resolved lock, observed verification evidence, task trace, explicit proposal document | Decisions and validation state are inspectable; executor receipts are future work |
| Information disclosure | Shared secret detector, protected-path deny rules, result redaction, case-insensitive matching, canonical-path inspection | Case variants, repository escape, encoded paths, and symbolic-link aliases are covered by regression tests |
| Denial of service | Limits for files, sizes, tags, dependencies, recipe inputs, graph depth, and tool-input inspection depth | Malformed or oversized inputs are rejected before activation |
| Elevation of privilege | Exact dependency graph, globally unique artifact IDs, profile grant subsets, no implicit network/action grants | A pack cannot expand its authority beyond the active profile |

## OWASP-aligned controls

- Prompt and data input do not replace policy authorization. Enforceable invariants live in schemas, the resolver, and runtime guards.
- Sensitive material is rejected from manifests, proposals, and governed storage through one shared detector.
- External-action validation creates a dry-run proposal only. It neither authorizes nor executes an external effect.
- Package sources reject mutable or structurally ambiguous npm, git, and HTTP forms.
- Runtime path controls apply protected-path denial before filesystem scope allowance and canonicalize existing repository paths.
- Human confirmation remains mandatory for destructive or external-provider actions.

## Verification evidence

| Gate | Result |
|---|---|
| Targeted adversarial suite | 34/34 passed |
| Full automated suite | 146/146 passed |
| TypeScript type check | Passed |
| Repository verification | Passed |
| Capability catalog | Current; 2 packs |
| Root profile lock | Current; digest `sha256:61dc85745789917c71bf84dbaee391ed6f9b20fb450dbd5e5280e5fbed5bf0c5` |
| Dependency audit | 0 known vulnerabilities |
| MCP baseline upgrade regression | Mutable managed entries replaced with exact pins; unrelated custom entry preserved |

## Residual risks

1. The declared Node.js 20 minimum was not exercised in this local audit; the final run used Node.js 25.2.1.
2. Profile and lock updates use atomic replacement per file. A short cross-file mismatch remains possible between the two replacements, but runtime verification rejects that state and the update path includes rollback.
3. An exact source identifier plus installed-content digest provides deterministic integrity evidence, not signed publisher provenance or transparency-log verification.
4. Action-proposal validation does not authorize execution and does not independently fetch or verify remote artifact bytes. A future executor must revalidate authorization, digest, size, expiry, and human approval.
5. Test execution has no enforced coverage threshold. The adversarial cases are explicit, but a percentage gate is not yet part of CI policy.
6. A live isolated registry installation with a deliberately incorrect integrity value was not exercised in this local run.
7. Verifying the complete runtime package digest before every tool call is intentionally conservative; performance should be monitored as the catalog grows.

## Recommended next controls

1. Run Node.js 20 and the current supported Node.js release in CI.
2. Add signed release provenance and automated package-attestation verification.
3. Build the external-action executor as a separate, narrow component with scoped credentials, approval tokens, quotas, and immutable receipts.
4. Add policy-bypass and prompt-injection evaluation scenarios to the CI gate.
5. Use container or VM isolation for high-risk workloads and default-deny network policy where credentials are present.
