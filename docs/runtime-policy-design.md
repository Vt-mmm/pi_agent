# Runtime policy design

## Mục tiêu

Runtime policy là lớp kiểm soát cách agent đọc context, gọi tool, sửa source, chạy verify, và kết thúc task. Tài liệu này mô tả thiết kế trung lập của Pi Agent Platform, không phụ thuộc vào một project cụ thể.

## Design principles

1. Profile first: mọi task phải biết project mode, protected paths, required context, verify commands, và MCP capabilities.
2. Bounded context: file lớn phải qua budget check; context manifest phải ghi lý do.
3. Guarded execution: shell/destructive actions đi qua exec policy. Đây là accident brake, không phải OS sandbox.
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
| Verify evidence | `company_verify_record` | Record command result only after matching an observed Pi `bash` tool result after task start. |
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
- `shellProtectedPaths`
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
  -> observed verify evidence
  -> trace
  -> final gate
  -> handoff
```

This lifecycle is intentionally explicit. It makes task quality auditable and avoids relying on a long prompt as the only control layer.

## Verify evidence ledger

Pi `bash` results are observed through the runtime `tool_result` hook and appended to:

```text
.pi/company-state/observed-bash.jsonl
```

The ledger stores cwd, timestamp, status, a hash of the normalized command, and redacted command text for audit. It does not need the raw command text to validate a later `company_verify_record` call.

This file-based ledger is intentionally shared by parent and subagent processes that run in the same project cwd. If a worker subagent runs `npm test`, the parent can later record that exact verify command without depending on process-local memory.

The ledger and task/profile control files are self-protected:

- raw path-like tool access to `.pi/company-state/**` is blocked before execution;
- raw path-like tool access to `.pi/company-profile.json` is blocked before execution;
- the same protected-path gate covers Pi built-ins such as `read`, `write`, `edit`, `grep`, `find`, `ls`;
- custom/MCP tools are also blocked when a tool call exposes common path fields such as `path`, `filePath`, `targetPath`, `target`, `filename`, or `file` pointing at a protected path;
- `grep.glob` and `find.pattern` are checked because they can target protected files even when the direct `path` is `.` or another broad directory;
- broad `grep` results are filtered through the `tool_result` hook so protected match lines are redacted before the model sees them;
- company tools still write/read these files through internal extension code, so normal task evidence and profile workflows continue to work.

This gate is independent from the tool registry. The registry can stay `advisory` for compatibility with changing Pi/MCP tool names, while protected-path access remains fail-closed whenever the event exposes a path-like input.

Final-gate semantics are stricter than simple observation:

- `observed=true`: Pi actually saw a matching bash result after `task.createdAt`;
- `matchedProfileCommand=true`: the command exactly matches one entry in `task.verifyCommands`;
- passing final gate: requires `observed=true`, `matchedProfileCommand=true`, and `exitCode=0`.

Ad-hoc commands can still be recorded for traceability, but they do not satisfy the passing verify gate unless they are part of the task verify plan. Exact matching is deliberate; if the task says `npm test`, record `npm test`, not `npm test || true` or `npm  test`.

## Benchmark discipline

Quality/token/cost claims must be recorded through `scripts/quality-benchmark.sh` or equivalent project evidence. The benchmark unit is a real task scenario with the same acceptance criteria and verification command.
