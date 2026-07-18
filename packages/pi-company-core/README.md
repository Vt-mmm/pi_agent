# @pi-agent/core

Pi package dùng chung cho nhiều project.

## Chứa gì

- `extensions/company-guard.ts`: guard tool call theo project profile.
- `prompts/*.md`: prompt template dùng chung.
- `skills/company-ops/SKILL.md`: operating skill cho agent.
- `skills/company-reference-repo/`: cache repo tham chiếu để nghiên cứu Codex/Pi/package ngoài.
- `policies/base-policy.json`: policy mặc định.

## Prompt recipes

- `/onboard-project`: first-run project context snapshot sau login/model selection.
- `/profiles`: show/switch profile trong Pi, không cần shell init.
- `/platform-migration`: migrate selected Pi/Codex/agent-framework concepts vào platform.
- `/be-to-fe`: scout backend contract read-only rồi implement frontend only.
- `/task`, `/plan`, `/discuss`, `/review`: task lifecycle chuẩn.

## Cài local

```bash
pi install git:github.com/Vt-mmm/pi_agent@v0.1.1
```

## Project profile

Extension đọc profile theo thứ tự:

1. env `PI_COMPANY_PROFILE`
2. `<project>/.pi/company-profile.json` chỉ khi project-local trust đang active trong Pi

Nếu không có profile hoặc project chưa trusted, extension chỉ bật guard secrets/destructive command cơ bản.

## Task state

Runtime task tools ghi state vào:

- `.pi/company-state/tasks/*.json`
- `.pi/project-context.md` và `.pi/company-state/project-onboarding.json`
- `.pi/company-state/traces.jsonl`
- Pi custom session entry `company-task-trace`

File state local phải nằm trong `.pi/.gitignore` của project.
