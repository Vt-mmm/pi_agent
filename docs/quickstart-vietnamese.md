# Quickstart tiếng Việt

## Mục tiêu

Sau setup, flow hằng ngày là:

```bash
cd <project>
pi
```

Phần còn lại — OAuth, package, context, harness, MCP, tool-call guard — nằm trong repo/package `pi-company-platform`.

## Bước 1 — install global một lần

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.5
```

Sau bước này, project mới không cần chạy bash init profile. Chỉ cần:

```bash
cd /path/to/project
pi
```

## Bước 2 — login OAuth OpenAI Codex/ChatGPT hoặc Claude/Anthropic

```bash
pi
/login
```

Chọn provider OpenAI/Codex/ChatGPT hoặc Anthropic/Claude trong danh sách Pi. Token được lưu local trong Pi agent dir, không nằm trong repo.

## Bước 3 — chọn model và chạy project onboarding

Sau khi login và chọn model intended cho project understanding:

```text
/model          # hoặc Ctrl+L để chọn model bằng selector của Pi
/scoped-models  # optional, chỉnh danh sách Ctrl+P cycle
/onboard-project
/memory-policy
```

Global setup đã config sẵn `enabledModels` cho Codex + Claude. Anh đổi model bằng selector/hotkey:

```text
Ctrl+L       # model selector
Ctrl+P       # đổi model trong scope
Shift+Tab    # đổi thinking
```

Nếu muốn xem/re-apply model scope từ terminal: `pi-company-models` và `pi-company-model-scope --preset full`.

Lệnh này yêu cầu model đọc qua project theo phạm vi có kiểm soát, rồi ghi:

```text
.pi/company-profile.json
.pi/project-context.md
.pi/memory/memory_summary.md
.pi/memory/MEMORY.md
```

Nếu chưa có profile, model sẽ show profile option, gợi ý lựa chọn, giải thích khác nhau giữa `fullstack`, `be-readonly-fe`, `web-frontend`, `backend-api`, rồi mới apply sau khi user approve.

File này là snapshot context cho task sau. Nếu file còn `Generated: not yet`, agent phải dừng trước khi implement và yêu cầu chạy `/onboard-project`.

`/memory-policy` kiểm tra chính sách memory của project. Mặc định memory là explicit-only: chỉ ghi khi user yêu cầu rõ “remember this”, không tự học transcript nền.

## Bước 4 — init thêm project khác

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project \
  --project-only \
  --profile auto \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.5
```

Đổi profile sau này trong Pi:

```text
/profiles
/profiles apply be-readonly-fe
```

Profile built-in: `generic`, `web-frontend`, `backend-api`, `be-readonly-fe`, `fullstack`, `node-typescript`, `python`, `data`, `devops`, `mobile`, `docs`.

## Bước 5 — setup split/preseed nếu cần

Script bash chỉ dùng khi muốn preseed config vào repo:

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project \
  --profile be-readonly-fe \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.5
```

## Bước 6 — chạy hằng ngày

```bash
herdr
cd <project>
pi
```

Prompt mẫu khi requirement chưa rõ:

```text
/discuss Từ repo https://github.com/mitsuhiko/agent-stuff, nghiên cứu pattern nào nên đưa vào project này.
```

Prompt mẫu khi đã rõ task:

```text
/task Implement this request. Use company_context, company_task_start, company_context_budget, company_exec_policy_check when shell is needed, company_verify_record, company_trace_record, and company_task_gate_check before done.
```

Prompt mẫu cho 2 recipe hay gặp:

```text
/platform-migration Migrate selected Pi docs and Codex CLI GitHub concepts into this platform.
/be-to-fe Implement FE from BE spec <endpoint/spec>. Backend read-only.
/memory-policy Show project memory policy and safe remember workflow.
```

Cache repo tham chiếu để đọc targeted trong Pi:

```text
Use company_reference_checkout for mitsuhiko/agent-stuff, inspect only relevant files, then summarize applicable patterns.
```

Runtime gate tools có sẵn:

```text
company_exec_policy_check      # check shell command
company_context_budget         # check context size/hard cap
company_tool_policy_check      # check tool capability
company_task_gate_check        # check before final DONE
```

Fallback bằng shell nếu cần:

```bash
PI_COMPANY_PLATFORM_HOME=/path/to/pi_agent
bash "$PI_COMPANY_PLATFORM_HOME/packages/pi-company-core/skills/company-reference-repo/checkout-reference-repo.sh" \
  mitsuhiko/agent-stuff \
  --path-only
```

## Việc user vẫn phải làm thủ công

- Login OAuth lần đầu trong browser.
- Chọn provider/model intended cho project.
- Chạy `/onboard-project` lần đầu để tạo `.pi/project-context.md`.
- Chạy `/memory-policy` nếu muốn kiểm tra hoặc dùng project memory.
- Approve project trust nếu Pi hỏi.
- Approve khi extension guard hỏi destructive/high-risk action.

Các việc này là credential/trust boundary, không nên automation mù.

## Nguồn chính

- Pi packages: https://pi.dev/docs/latest/packages
- Pi extensions: https://pi.dev/docs/latest/extensions
- Pi providers/OAuth: https://pi.dev/docs/latest/providers
- Pi settings/trust: https://pi.dev/docs/latest/settings
- Pi MCP adapter: https://pi.dev/packages/pi-mcp-adapter
- Codex CLI GitHub: https://github.com/openai/codex
