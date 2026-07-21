# ADR: Capability pack contract and deterministic resolution

- **Status:** accepted
- **Date:** 2026-07-21
- **Deciders:** platform maintainers

## Context

The platform exposes prompts, skills, subagents, policies, adapters, recipes, and evaluation scenarios across multiple project profiles. These resources need a stable ownership model, explicit permission requirements, exact dependency identity, integrity evidence, and a deterministic project configuration.

Runtime policy remains the enforcement boundary. Capability metadata must not execute code or broaden a project profile's granted permissions.

## Decision

The platform defines five separate contracts:

1. The core package owns lifecycle enforcement, policy checks, catalog validation, profile resolution, lock verification, and evidence formats.
2. A capability pack is a declarative JSON manifest with an exact version, owner, lifecycle, artifact list, dependencies, permissions, activation rules, and evaluation identifiers.
3. A capability recipe is a declarative step graph. It contains capability identifiers and gates, not executable shell content.
4. A project profile selects exact pack versions and explicitly grants owners, lifecycle states, filesystem read/write scopes, network domains, and external action types.
5. A generated lock document records the resolved graph, base-policy and profile restrictions, artifact digests, profile digest, package source, package digest, and core API version.

Resolution uses these rules:

- dependencies use exact versions;
- dependency cycles fail validation;
- direct profile activation must match the active profile mode;
- pack capabilities must be a subset of `mcpCapabilities`;
- filesystem read/write requirements must exact-match profile grants and are enforced for path-like runtime tools;
- network domains and external actions must be explicitly allowed by the profile;
- artifact paths must remain inside the platform repository;
- symbolic links and oversized artifacts are rejected;
- catalog and lock output contain no timestamp and are byte-stable for identical input;
- generated files use atomic replacement and reject symbolic-link targets.

## Consequences

### Positive

- Capability ownership, lifecycle, dependency, permission, and integrity are machine-readable.
- A project can reproduce and audit its selected capability graph.
- Profile permission remains authoritative and cannot be expanded by a pack.
- CI can detect stale catalogs, stale locks, artifact changes, and invalid dependency graphs.
- The contract remains local-first and requires no registry service or runtime dependency.

### Negative

- Exact versions require an explicit version update when a pack changes contract.
- Artifact digests require catalog regeneration after governed resource changes.
- Initial packs are experimental until evaluation coverage and project evidence satisfy promotion criteria.

## Alternatives Considered

### Implicit directory discovery

- **Pros:** minimal metadata.
- **Cons:** no stable owner, permission, dependency, lifecycle, or integrity contract.
- **Decision:** rejected.

### Runtime merge without a lock document

- **Pros:** fewer generated files.
- **Cons:** effective configuration is difficult to reproduce and review.
- **Decision:** rejected.

### Remote catalog as the primary source

- **Pros:** centralized discovery.
- **Cons:** adds network availability and trust requirements before the local contract is stable.
- **Decision:** deferred.
