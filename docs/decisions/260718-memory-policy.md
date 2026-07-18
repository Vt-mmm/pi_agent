# Decision: explicit project memory before background memory

## Status

Accepted.

## Context

Pi memory architecture can support durable notebook files, search tools, background extraction, consolidation workers, SQLite catalogs, leases, and git snapshots.

For a reusable public platform, enabling background memory by default creates unresolved rollout questions:

- token/cost baseline;
- extractor accuracy;
- secret/privacy redaction;
- stale-memory pruning;
- team review workflow.

## Decision

Default memory is:

- project-scoped;
- markdown-first;
- explicit-only;
- advisory, not authoritative;
- committed only for safe summary/handbook files;
- local/cache/catalog files ignored.

The platform exposes `company_memory_status`, `company_memory_note`, `company_memory_search`, and `company_memory_citation_record`.

## Consequences

- Safe to use in public/team projects without opaque background mutation.
- Lower implementation risk than cloning a full memory worker now.
- External packages such as `pi-memory` remain optional after source review.
- Background extraction/consolidation can be added later behind benchmark evidence and profile opt-in.
