# MCP và tool policy

## Mục tiêu

Pi core không hard-code tool. Project profile khai báo capability; MCP config khai báo server cụ thể.

## MCP config layers

Theo `pi-mcp-adapter`, các file nên dùng:

| File | Scope |
|---|---|
| `~/.config/mcp/mcp.json` | shared global MCP config |
| `~/.pi/agent/mcp.json` | Pi global override |
| `.mcp.json` | project shared MCP config |
| `.pi/mcp.json` | Pi project override |

## Tool policy

Runtime tool registry nằm trong `packages/pi-company-core/policies/base-policy.json`.

Tool:

```text
company_tool_policy_check
```

Default `toolRegistry=advisory`: agent nhận warning khi tool chưa map capability. Project ổn định có thể bật `toolRegistry=enforce` trong `.pi/company-profile.json`.

| Mode | Allowed intent |
|---|---|
| `readOnly` | đọc file, grep, find, list, MCP read-only |
| `memory` | đọc/search memory, ghi note explicit-only |
| `docsWrite` | sửa docs/plans/report |
| `sourceWrite` | sửa source theo protected path + verify |
| `ship` | release/commit/push/deploy, cần human gate |

## Rule

- Capability chưa đăng ký: clean skip, không tự đoán tool.
- Tool destructive: block hoặc hỏi xác nhận.
- Tool external-provider: hỏi xác nhận nếu có side effect/cost.
- MCP response phải ngắn, có mode concise/detailed khi tự build MCP server.
- Memory tool không được lưu secret/raw private data; memory là advisory, source hiện tại là authority.

## Built-in platform tools

| Tool | Intent |
|---|---|
| `company_context` | Active profile/context/verify/MCP/memory overview. |
| `company_exec_policy_check` | Evaluate shell command before running. |
| `company_context_budget` | Check candidate context files against hard caps. |
| `company_tool_policy_check` | Check tool capability registration. |
| `company_task_gate_check` | Check task readiness before final DONE. |
| `company_memory_status` | Project memory policy/files/rules. |
| `company_memory_search` | Keyword search `.pi/memory` markdown. |
| `company_memory_note` | Append explicit durable memory note. |
| `company_memory_citation_record` | Record memory evidence in task contract. |
| `company_task_start` | Create Task Implementation Contract. |
| `company_context_record` | Record context manifest for task. |
| `company_verify_record` | Record verify evidence. |
| `company_trace_record` | Record handoff/final trace. |

## Core capabilities

| Capability | Meaning |
|---|---|
| `filesystem-readonly` | Read/list/search repository files. |
| `filesystem-write` | Edit/write non-protected project files. |
| `shell` | Run shell commands through exec policy. |
| `github` | GitHub/MCP/CLI workflows when configured. |
| `browser` | Browser/UI/runtime inspection when configured. |
| `memory` | Project memory tools. |

## Gợi ý MCP server ban đầu

- GitHub: issue/PR/release.
- Browser/Chrome: kiểm tra runtime UI.
- Docs/search: đọc docs nội bộ.
- Filesystem read-only: inspect repo an toàn.

## Nguồn

- Pi MCP adapter: https://pi.dev/packages/pi-mcp-adapter
- MCP protocol: https://modelcontextprotocol.io/
- Pi extension tool events: https://pi.dev/docs/latest/extensions
