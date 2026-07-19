# Runtime policy design

## Mục tiêu

Runtime policy là lớp kiểm soát cách agent đọc context, gọi tool, sửa source, chạy verify, và kết thúc task. Tài liệu này mô tả thiết kế trung lập của Pi Agent Platform, không phụ thuộc vào một project cụ thể.

## Design principles

1. Profile first: mọi task phải biết project mode, protected paths, required context, verify commands, và MCP capabilities.
2. Bounded context: file lớn phải qua budget check; context manifest phải ghi lý do.
3. Guarded execution: shell/destructive actions đi qua exec policy.
4. Tool capability: tool ngoài phải map vào capability được profile cho phép.
5. Evidence before done: source-changing task phải có verify evidence và trace.
6. Human gate for high risk: auth, release, deploy, destructive command, provider config, database migration, hoặc production data cần explicit confirmation.

## Runtime modules

| Module | Tool/hook | Purpose |
|---|---|---|
| Project context | `company_context` | Load profile, settings, policy, and local state summary. |
| Exec policy | `company_exec_policy_check` | Evaluate shell command risk before execution. |
| Context budget | `company_context_budget` | Enforce size/count limits for context files. |
| Tool registry | `company_tool_policy_check` | Check external tool capability against profile. |
| Task contract | `company_task_start` | Persist scope, acceptance criteria, risk lane, and verify plan. |
| Context manifest | `company_context_record` | Record files read for a task. |
| Verify evidence | `company_verify_record` | Record commands, result, and relevant output. |
| Final gate | `company_task_gate_check` | Validate readiness before final handoff. |
| Trace | `company_trace_record` | Persist changed files, outcome, and handoff state. |
| Usage | `company_usage_snapshot` | Show session/context/token usage when available. |

## Policy precedence

Effective policy is derived from:

1. safe defaults in `packages/pi-company-core/policies/base-policy.json`;
2. installed package prompts/skills/extensions;
3. project `.pi/company-profile.json`;
4. explicit user instruction in the active session.

User instruction can narrow scope or raise safety requirements. It should not silently bypass protected paths, destructive command checks, or final task gates.

## Profiles

Profiles define:

- `mode`
- `rootMarkers`
- `protectedPaths`
- `requiredContext`
- `verifyCommands`
- `mcpCapabilities`
- `runtimePolicy`
- `hardGates`

The same platform can operate as `web-frontend`, `backend-api`, `fullstack`, `be-readonly-fe`, `data`, `devops`, `docs`, `python`, `node-typescript`, or `mobile` by switching profile.

## Task lifecycle

```text
intake
  -> profile/context
  -> task contract
  -> context manifest
  -> plan
  -> guarded implementation
  -> verify evidence
  -> trace
  -> final gate
  -> handoff
```

This lifecycle is intentionally explicit. It makes task quality auditable and avoids relying on a long prompt as the only control layer.

## Benchmark discipline

Quality/token/cost claims must be recorded through `scripts/quality-benchmark.sh` or equivalent project evidence. The benchmark unit is a real task scenario with the same acceptance criteria and verification command.
