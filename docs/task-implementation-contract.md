# Task Implementation Contract

## Mục tiêu

Đây là contract tối thiểu để Pi implement task không khác gì một CLI agent nghiêm túc: có scope, context, guard, verify, trace.

## Contract fields

| Field | Required | Ý nghĩa |
|---|---:|---|
| `taskId` | yes | ID ổn định cho task. |
| `summary` | yes | Một câu mô tả outcome. |
| `riskLane` | yes | `tiny`, `normal`, hoặc `high-risk`. |
| `expectedOutput` | yes | Artifact/behavior cụ thể. |
| `acceptanceCriteria` | yes | Điều kiện pass/fail. |
| `scope` | yes | File/module được phép đụng. |
| `outOfScope` | yes | Cái không làm. |
| `protectedPaths` | yes | Vùng cấm từ profile/policy. |
| `requiredContext` | yes | Context bắt buộc đọc. |
| `contextManifest` | yes | Bằng chứng context đã dùng. |
| `memoryCitations` | no | Memory file dùng làm advisory context, nếu có. |
| `mcpCapabilities` | no | Tool/MCP được phép. |
| `verifyCommands` | yes | Command phải chạy trước DONE. |
| `verifyEvidence` | yes before done | Output/result command. |
| `changedFiles` | yes before done | File đã sửa. |
| `trace` | yes before done | Handoff/audit record. |

## JSON example

```json
{
  "taskId": "TASK-0001",
  "summary": "Fix listing filter reset behavior",
  "riskLane": "normal",
  "expectedOutput": "Filter reset returns listing page to default query and preserves route owner.",
  "acceptanceCriteria": [
    "Reset button clears selected filters",
    "URL query returns to canonical default",
    "No protected paths are modified"
  ],
  "scope": [
    "src/features/listings/**"
  ],
  "outOfScope": [
    "backend API changes",
    "database changes"
  ],
  "protectedPaths": [
    "backend/**"
  ],
  "requiredContext": [
    "AGENTS.md",
    ".pi/project-context.md",
    "docs/frontend/structure-guide.md"
  ],
  "contextManifest": [
    {
      "path": "AGENTS.md",
      "reason": "root rules"
    }
  ],
  "memoryCitations": [],
  "mcpCapabilities": [
    "filesystem-readonly",
    "browser"
  ],
  "verifyCommands": [
    "npm run test"
  ],
  "verifyEvidence": [],
  "changedFiles": [],
  "trace": {
    "outcome": "pending"
  }
}
```

## Prompt contract

Pi task prompt phải bắt buộc:

```text
Use company_context first.
Use company_memory_status and search memory when relevant; memory is advisory only.
Read .pi/project-context.md; if it is pending, stop and request /onboard-project.
Create/mentally hold a Task Implementation Contract.
Do not edit before scope + verify command are known.
Before final, provide verify evidence.
If verify cannot run, final outcome is blocked/partial, not done.
```

## Enforcement levels

| Level | Cách enforce | Độ tin cậy |
|---|---|---:|
| Prompt only | prompt nhắc model | Thấp |
| Profile + prompt | profile có rule, prompt đọc profile | Trung bình |
| Extension guard | tool_call block protected/destructive | Khá |
| Runtime task tools | task_start/context_record/verify_record/trace | Cao |
| Final gate | extension block DONE/handoff thiếu verify | Cao nhất |

Hiện platform đang ở mức “Runtime task tools” P2-alpha:

- `company_task_start`
- `company_context_record`
- `company_verify_record`
- `company_trace_record`
- local trace trong `.pi/company-state/`
- session trace qua Pi custom entry `company-task-trace`

Chưa có “Final gate” tự động chặn assistant trả DONE nếu thiếu verify. Vì vậy với task quan trọng vẫn cần checklist trong final và benchmark trước khi thay Codex/Claude CLI hoàn toàn.

## Named implementation recipes

- `/platform-migration`: dùng cho task migrate Pi docs/Codex CLI/repo pattern vào platform.
- `/be-to-fe`: dùng cho task scout BE contract read-only rồi implement FE.
- `/memory-policy`: dùng cho task kiểm tra/ghi nhớ explicit project memory.

Hai recipe này vẫn phải tạo/giữ Task Implementation Contract khi có source writes.
