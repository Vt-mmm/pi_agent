# OAuth OpenAI Codex/ChatGPT và Claude/Anthropic trong Pi

## Mục tiêu

Dùng Codex/OpenAI hoặc Claude/Anthropic model trong Pi, không cần copy token từ Codex CLI hay Claude CLI.

## Setup

```bash
pi
/login
```

Chọn provider OpenAI/Codex/ChatGPT hoặc Anthropic/Claude theo danh sách Pi hiển thị. Sau đó kiểm tra:

```text
/model
/model-options
```

Hoặc:

```bash
pi --list-models
```

## Credential boundary

Không đưa những file này vào source:

- `~/.pi/agent/auth.json`
- custom agent dir `auth.json`
- `.env`
- API keys
- session dumps có token

## Team usage

Mỗi dev login OAuth bằng account được công ty cho phép. Repo platform chỉ chứa:

- hướng dẫn login
- package source
- profile/policy
- template config không có secret

## CI/automation

Không dùng OAuth local cho CI. Nếu sau này cần headless automation, dùng secret manager riêng và policy riêng.

## Nguồn

- Pi providers/OAuth: https://pi.dev/docs/latest/providers
- Pi settings/trust: https://pi.dev/docs/latest/settings
- Codex CLI auth overview: https://github.com/openai/codex
- Anthropic Claude docs: https://docs.anthropic.com/
