# Chuẩn migration harness vào Pi Company Platform

## Mục tiêu

Migration harness không phải bê nguyên một project nghiệp vụ sang Pi. Mục tiêu là tách phần “máy vận hành task” thành core dùng chung:

```text
User request
  -> project profile
  -> intake/risk lane
  -> required context manifest
  -> plan / task contract
  -> guarded tool calls
  -> implementation
  -> verify evidence
  -> trace / handoff
```

Project nghiệp vụ chỉ là adapter/profile đặc thù. Project khác chỉ đổi profile, context, verify command, MCP capability.

## Những phần nên migrate từ harness hiện có

| Legacy/project harness hiện có | Pi Agent Platform target | Lý do |
|---|---|---|
| Risk lane: tiny/normal/high-risk | generic `riskLane` + `hardGates` trong profile/policy | Chặn task mơ hồ, auth/migration/provider/destructive action cần confirm. |
| Feature intake | `company_task_start` hoặc task contract file | Mỗi task phải có scope, output, validation trước khi edit. |
| Context rules | `/onboard-project` + `.pi/project-context.md` + `requiredContext` + context manifest | Giảm token, tránh đọc toàn repo. |
| Test matrix/proof policy | `verifyCommands` + verify evidence | Done phải có command thực chạy. |
| Trace spec | `company_trace_record` / `.pi/company-state/traces.jsonl` / Pi session custom entry | Có audit trail cho task. |
| Protected path/backend freeze | `protectedPaths` trong profile + extension guard | Mỗi project có vùng cấm riêng. |
| Tool registry | `mcpCapabilities` + `.mcp.json` | Không tự đoán tool/MCP. |
| Experience/form contract | domain adapter rule | Chỉ project cần UX/form strict mới bật. |

## Những phần không nên migrate nguyên xi

| Không migrate nguyên | Lý do |
|---|---|
| `harness.db` SQLite của một project cụ thể | Nó là operational state local, không phải portable core. |
| `VN-*` story IDs | Project khác cần ID namespace riêng. |
| Project-specific FE/BE rules trong core | Sẽ làm platform bị khóa vào một project. |
| Toàn bộ `.agents/skills` vào mọi project | Gây collision/context bloat. |
| Full Codex/Claude workflow prompt | Nên compile thành task lifecycle + profile, không nhồi prompt dài. |

## Reusable workflow prompts

- `/platform-migration`: migrate selected agent/tooling concepts from external docs/repos into Pi Company Platform.
- `/be-to-fe`: scout backend source/spec read-only, create contract snapshot, implement frontend only.

## Harness core chuẩn

Pi Company Platform cần 7 module logic:

| Module | Vai trò | Trạng thái hiện tại |
|---|---|---|
| Profile loader | Đọc `.pi/company-profile.json` hoặc `PI_COMPANY_PROFILE` | Có P3-baseline, trust-aware |
| Exec policy guard | Block/prompt shell theo pattern + rules + segment parser | Có P3-baseline |
| Context budget | Hard cap context files/manifest | Có P3-baseline |
| Task contract | Bắt scope/output/acceptance/verify trước edit | Có P3-baseline |
| Context manifest | Ghi required context đã đọc | Có P3-baseline |
| Tool/MCP registry | Cho phép tool theo capability | Có P3-baseline, default advisory |
| Verify evidence | Ghi command/result/hash trước DONE | Có P3-baseline |
| Trace/final gate | Ghi task trace + gate check | Có P3-baseline, final hard hook phụ thuộc Pi API |

## Task lifecycle chuẩn

```text
1. Intake
   - classify risk lane
   - expected output
   - out of scope
   - protected paths

2. Context
   - load company_context
   - read `.pi/project-context.md`
   - read requiredContext
   - check large files with company_context_budget
   - read task-specific files only
   - record context manifest

3. Plan
   - exact touchpoints
   - verify command
   - rollback/handoff if high-risk

4. Implement
   - check complex shell with company_exec_policy_check
   - check non-company tools with company_tool_policy_check
   - guarded write/edit/bash
   - MCP only by declared capability
   - no protected paths

5. Verify
   - run mapped verify command
   - store evidence
   - if verify unavailable: not DONE

6. Trace
   - changed files
   - commands
   - result
   - friction
   - next step
   - company_task_gate_check before DONE
```

## Runtime enforcement roadmap

| Phase | Output | Đủ để implement task? |
|---|---|---|
| P0 | package core + profile + docs + protected path guard | Không. Chỉ đủ pilot/read-only. |
| P1 | schema + task contract + doctor + verify-local + lean prompts | Có thể dùng cho task nhỏ nếu human review sát. |
| P2 | extension tools: task_start/context_record/verify_record/trace + session custom entries | Có thể dùng cho FE/source task có guard rõ. |
| P3 | exec policy + context budget + tool registry + task gate + benchmark recorder | Đủ để thay một phần Codex/Claude CLI baseline sau project benchmark. |
| P4 | subagent/worktree isolation + team publish + security review | Đủ triển khai cho team. |

## Chuẩn “DONE”

Một Pi task chỉ DONE khi có đủ:

- profile loaded
- lane classified
- protected paths known
- context manifest exists
- plan exists for source write
- changed files listed
- verify command ran and passed, hoặc explicitly `N/A` với reason
- trace/handoff recorded
- no secrets touched
- no protected path writes

## Pattern học từ `mitsuhiko/agent-stuff`

Không copy nguyên repo cá nhân. Chỉ migrate design pattern:

- Package Pi nên gồm prompts/skills/extensions rõ ràng.
- Task/goal state nên append vào Pi session log khi có thể, không chỉ DB ngoài.
- Todo/task store file-backed là đủ cho P2; SQLite chỉ dùng khi cần query phức tạp.
- Repo tham chiếu nên cache ở path ổn định, refresh throttle, không edit cache.
- Review nên đọc guideline project-local.
- Tool policy nên enforce ở layer tool/extension, không chỉ prompt.

Chi tiết: `docs/agent-stuff-research.md`.
