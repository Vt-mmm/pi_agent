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
| `company_memory_status` | Project memory policy/files/rules. |
| `company_memory_search` | Keyword search `.pi/memory` markdown. |
| `company_memory_note` | Append explicit durable memory note. |
| `company_memory_citation_record` | Record memory evidence in task contract. |

## Gợi ý MCP server ban đầu

- GitHub: issue/PR/release.
- Browser/Chrome: kiểm tra runtime UI.
- Docs/search: đọc docs nội bộ.
- Filesystem read-only: inspect repo an toàn.

## Nguồn

- Pi MCP adapter: https://pi.dev/packages/pi-mcp-adapter
- MCP protocol: https://modelcontextprotocol.io/
- Pi extension tool events: https://pi.dev/docs/latest/extensions
