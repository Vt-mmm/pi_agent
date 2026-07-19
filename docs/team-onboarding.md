# Team onboarding

## Mục tiêu

Một thành viên mới không cần biết local path của maintainer. Luồng chuẩn rút gọn:

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.13
cd /path/to/project
pi
/login
<select provider/model>
/mcp
/subagents-doctor
/onboard-project
/memory-policy
```

## Prerequisites

- Node.js đủ để chạy Pi.
- `pi` có trên `PATH`.
- `herdr` optional nhưng nên có nếu team chạy nhiều agent pane.
- Git access tới repo platform nếu dùng `git:` package source.
- OAuth/API access riêng của từng người. Không share token.

## Bước 1 — install global package một lần

Khuyến nghị dùng tag cố định:

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.13
```

Nếu team publish npm private:

```bash
npm install -g @earendil-works/pi-coding-agent
pi install npm:@company/pi_agent@0.3.13
```

Không cần chạy bash để set profile cho từng project.

## Bước 2 — mở project và login OAuth

```bash
cd /path/to/project
pi
/login
```

Credential nằm trong user Pi dir, không commit.

## Bước 3 — chọn model và onboard project

Sau login, chọn provider/model intended cho project understanding bằng native Pi selector. OpenAI Codex và Claude/Anthropic đều là supported option.

```text
/model          # hoặc Ctrl+L
/scoped-models  # optional
```

Global setup seed sẵn `enabledModels`; đổi nhanh bằng:

```text
Ctrl+P       # cycle scoped models
Shift+Tab    # cycle thinking level
```

Rồi chạy:

```text
/mcp
/subagents-doctor
/onboard-project
```

Output chính:

- `.pi/project-context.md`
- `.pi/memory/memory_summary.md`
- `.pi/memory/MEMORY.md`
- `.pi/company-state/project-onboarding.json`

Đây là bước model đọc qua project lần đầu theo cách bounded: đọc profile, AGENTS, README, docs/config/source map/test command; không load toàn bộ source.

Nếu project chưa có `.pi/company-profile.json`, `/onboard-project` sẽ gọi profile options, gợi ý profile, giải thích option, rồi hỏi user chọn. Sau khi user approve, nó mới ghi profile.

Nếu `.pi/project-context.md` còn `Generated: not yet`, không nên chạy `/task` implementation.

Memory mặc định là project-scoped và explicit-only. Chạy `/memory-policy` để xem files/rules. Agent chỉ ghi durable memory khi user yêu cầu rõ ràng.

Đổi profile sau này:

```text
/profiles
/profiles apply fullstack
/profiles apply be-readonly-fe
```

## Setup nâng cao — tách global và project

Các script setup/init vẫn tồn tại cho case preseed config vào repo hoặc CI bootstrap, nhưng không phải default UX:

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project \
  --profile be-readonly-fe \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.13 \
  --mcp-preset core \
  --subagents-preset safe
```

Nếu cần override profile:

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project --project-only --profile backend-api --package-source git:github.com/Vt-mmm/pi_agent@v0.3.13 --mcp-preset core --subagents-preset safe
```

Profile built-in trong Pi:

- `auto`: tự detect.
- `generic`: repo chưa chuẩn.
- `web-frontend`: Next/React/Vite frontend.
- `backend-api`: Node/Java/Python API.
- `be-readonly-fe`: scout BE read-only, implement FE only.
- `fullstack`: repo có cả frontend và backend.
- `node-typescript`: Node/TS library/tooling.
- `python`: Python app/library.
- `data`: ETL/dbt/DVC/notebook/data pipeline.
- `devops`: Docker/Terraform/K8s/GitHub Actions.
- `mobile`: React Native/Flutter.
- `docs`: docs portal/manual.

Project init tạo:

- `.pi/settings.json`
- `.pi/company-profile.json`
- `.mcp.json`
- `.pi/mcp.json`
- `.pi/memory/memory_summary.md`
- `.pi/memory/MEMORY.md`
- `.pi/.gitignore`
- `AGENTS.md` nếu chưa có
- `REVIEW_GUIDELINES.md` nếu chưa có

## Bước 4 — run trong Herdr

```bash
herdr
cd /path/to/project
pi
```

Trong Pi, nếu project trust prompt hiện ra, chỉ approve khi đúng repo. Project trust cho phép Pi load `.pi/settings.json`, `.pi` resources và project extensions.

## Bước 5 — task workflow

Requirement chưa rõ:

```text
/discuss Tạo plan cho feature X. Chưa implement.
```

Task rõ:

```text
/task Implement feature X. Follow project profile, protected paths, required context, exec policy, context budget, tool policy, verify, trace, and task gate.
```

Runtime gate tools:

```text
company_exec_policy_check
company_context_budget
company_tool_policy_check
company_task_gate_check
```

Task cải tiến platform:

```text
/platform-improve Improve onboarding, model scope, MCP setup, and verification docs for team usage.
```

Task BE spec lên FE:

```text
/be-to-fe Implement FE from BE contract <endpoint/spec>. Backend is read-only.
```

Project memory:

```text
/memory-policy
Remember: this repo uses pnpm, never npm.
```

External source repo:

```text
Use company_source_checkout for github.com/org/repo, inspect only relevant files, then summarize applicable patterns.
```

## Doctor

Chạy trên platform:

```bash
bash scripts/verify-local.sh
```

Chạy trên project:

```bash
bash /path/to/pi_agent/scripts/profile-doctor.sh /path/to/project
bash /path/to/pi_agent/scripts/team-doctor.sh /path/to/project --strict-share
bash /path/to/pi_agent/scripts/quality-benchmark.sh /path/to/project --init
```

Nếu doctor cảnh báo `project onboarding snapshot is still pending`, mở Pi trong project và chạy `/onboard-project`.

## Không commit

- `.pi/company-state/`
- `.pi/benchmarks/`
- `.pi/memory/local/`
- `.pi/memory/state.sqlite`
- `.pi/memory/rollout_summaries/`
- `.pi/todos/`
- `.pi/sessions/`
- `.pi/auth.json`
- `.env`
- token/API key

## Official docs

- Pi packages: https://pi.dev/docs/latest/packages
- Pi project trust/settings: https://pi.dev/docs/latest/settings
- Pi prompt templates: https://pi.dev/docs/latest/prompt-templates
- Pi MCP adapter: https://pi.dev/packages/pi-mcp-adapter
- Herdr integrations: https://herdr.dev/docs/integrations/
