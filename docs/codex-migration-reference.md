# Codex CLI migration reference

## Mục tiêu

Tham khảo OpenAI Codex CLI để thiết kế Pi platform, nhưng không khóa vào Codex CLI.

## Concept cần migrate

| Codex CLI concept | Pi platform equivalent |
|---|---|
| `AGENTS.md` instruction layering | project `AGENTS.md` + `.pi/company-profile.json` required context |
| config precedence | user Pi settings → installed package → project `.pi/settings.json` → CLI flags |
| sandbox/approval | Pi extension guard + optional container/VM |
| MCP config | `pi-mcp-adapter` + `.mcp.json` / `.pi/mcp.json` |
| subagents | Herdr panes/session profiles trước; Pi SDK/RPC sau |
| non-interactive exec | Pi `--mode rpc` hoặc JSON event stream |
| hooks | Pi extension lifecycle events |
| model routing | Pi provider/model settings + prompt policy |

## Không nên copy nguyên

Codex CLI repo đang theo Apache-2.0. Nếu copy code trực tiếp:

- giữ license/notice đúng
- ghi rõ file nào modified
- review legal nếu dùng trong công ty

Khuyến nghị phase đầu: clean-room implementation theo behavior cần dùng.

## Source references

- Codex CLI GitHub: https://github.com/openai/codex
- Codex license: https://github.com/openai/codex/blob/main/LICENSE
- Codex AGENTS.md docs: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Codex config docs: https://learn.chatgpt.com/docs/config-file/config-basic
- Codex subagents docs: https://learn.chatgpt.com/docs/agent-configuration/subagents
- Codex non-interactive mode: https://learn.chatgpt.com/docs/non-interactive-mode

