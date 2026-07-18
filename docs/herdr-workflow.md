# Herdr workflow

## Mục tiêu

Herdr dùng để quản lý nhiều session/pane agent. Pi core không cần tự làm subagent ngay từ đầu.

## Setup integration

```bash
herdr integration install pi
herdr integration install codex
herdr integration status
```

Nếu dùng custom Pi agent dir:

```bash
PI_CODING_AGENT_DIR=/path/to/pi-agent herdr integration install pi
```

## Daily flow

```bash
cd <project>
herdr
```

Lần đầu trong project, mở pane Pi rồi chạy:

```text
/login
<select provider/model>
/onboard-project
```

Sau khi `.pi/project-context.md` đã được ghi, mới chạy `/task` cho implementation.

Pane đề xuất:

```text
project
├─ pi-task          implement current task
├─ pi-review        read-only review
├─ pi-qa            verify/test
└─ codex-reference  optional comparison / migration reference
```

## Rule

- Herdr là orchestrator terminal/session, không phải security boundary.
- Destructive/action gate vẫn nằm ở Pi extension/policy.
- OAuth vẫn login trong Pi.

## Nguồn

- Herdr install: https://herdr.dev/docs/install/
- Herdr integrations: https://herdr.dev/docs/integrations/
- Herdr workflow: https://herdr.dev/docs/how-to-work/
- Herdr CLI reference: https://herdr.dev/docs/cli-reference/
