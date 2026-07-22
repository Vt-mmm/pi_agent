# Quickstart tiếng Việt

> Nếu cần hướng dẫn đầy đủ từ setup, command, token/session, MCP đến subagents, xem `docs/operator-manual-vietnamese.md`.

## Mục tiêu

Sau setup, flow hằng ngày là:

```bash
cd <project>
pi
```

Phần còn lại — OAuth, package, context, harness, MCP, tool-call guard — nằm trong repo/package `pi-company-platform`.

## Bước 1 — install global một lần

```bash
npm install -g @earendil-works/pi-coding-agent@0.80.10
pi install git:github.com/Vt-mmm/pi_agent
```

Lệnh trên là global latest cho máy cá nhân. Khi seed `.pi/settings.json` cho team/repo cần audit lặp lại, dùng pinned tag như `git:github.com/Vt-mmm/pi_agent@vX.Y.Z`.

Sau bước này, project mới không cần chạy bash init profile. Chỉ cần:

```bash
cd /path/to/project
pi
```

Với project đã tin cậy, có thể dùng wrapper để Pi tự approve project-local resources cho lần chạy đó:

```bash
pi-company-auto
```

Read-only auto-run:

```bash
pi-company-auto --read-only -p "Scout payment mapping. Do not edit source."
```

Trusted full-access style run cho repo đã kiểm soát:

```bash
pi-company-auto --full-access -p "Run the trusted local benchmark suite."
```

Wrapper này không bypass company guard; nó wrap `pi --approve` và set permission profile cho lần chạy. Dù dùng `--full-access`, protected paths, redaction, destructive shell checks, task gate, và verify evidence vẫn chạy.

Nếu đã ở trong Pi session, dùng slash command cho nhanh:

```text
/permission-status
/full-access Implement/refactor task trong repo trusted này.
```

`/full-access <task>` chỉ bật full-access cho session hiện tại, không tự ghi `.pi/company-profile.json`.

Nếu chat box/ảnh chụp trả về local path thay vì attachment ảnh, dán path đó trực tiếp vào prompt:

```text
/scout Check UI issue from screenshot /var/folders/.../screenshot.png
```

Platform sẽ tự attach ảnh và rewrite prompt thành `[image1]` trước khi model xử lý. Hỗ trợ `.png/.jpg/.jpeg/.gif/.webp/.bmp`, tối đa 4 ảnh, 8 MB mỗi ảnh.

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
/company-commands
/mcp            # kiểm tra MCP adapter/server
/subagents-doctor  # health check subagent setup
/onboard-project
/memory-policy
```

Global setup đã config sẵn `enabledModels` cho các provider model families. Anh đổi model bằng selector/hotkey:

```text
Ctrl+L       # model selector
Ctrl+P       # đổi model trong scope
Shift+Tab    # đổi thinking
```

Nếu muốn xem/re-apply model scope từ terminal: `pi-company-models` và `pi-company-model-scope --preset full`.

Nếu muốn xem/re-apply MCP baseline từ terminal:

```bash
pi-company-mcp --preset core --scope global --replace
pi-company-mcp --preset popular --scope global --replace
pi-company-mcp --list
```

Nếu clone repo GitHub và chưa link npm bin, dùng fallback:

```bash
bash /path/to/pi_agent/scripts/configure-mcp.sh --preset core --scope global --replace
```

Nếu muốn xem/re-apply subagents baseline từ terminal:

```bash
pi-company-subagents --preset safe
# fallback:
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

Nếu muốn dùng builtin `researcher` cho web/docs research trong Pi:

```bash
pi install npm:pi-web-access@0.13.0
# hoặc setup từ đầu:
bash /path/to/pi_agent/scripts/setup.sh . --with-web-access
```

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
  --package-source git:github.com/Vt-mmm/pi_agent@vX.Y.Z \
  --mcp-preset core \
  --subagents-preset safe
```

Đổi profile sau này trong Pi:

```text
/profile list
/profile be-readonly-fe
```

Profile built-in: `generic`, `web-frontend`, `backend-api`, `be-readonly-fe`, `fullstack`, `node-typescript`, `python`, `data`, `devops`, `mobile`, `docs`.

## Bước 5 — setup split/preseed nếu cần

Script bash chỉ dùng khi muốn preseed config vào repo:

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project \
  --profile be-readonly-fe \
  --package-source git:github.com/Vt-mmm/pi_agent@vX.Y.Z \
  --mcp-preset core \
  --subagents-preset safe
```

## Bước 6 — chạy hằng ngày

```bash
herdr
cd <project>
pi
```

Prompt mẫu khi requirement chưa rõ:

```text
/discuss Cải tiến workflow onboarding cho team mới. Chưa implement, chỉ hỏi lại phần còn thiếu và đề xuất plan.
```

Prompt mẫu khi đã rõ task:

```text
/task Implement this request. Use company_context, company_task_start, company_context_budget, company_exec_policy_check when shell is needed, company_verify_record, company_trace_record, and company_task_gate_check before done.
```

Prompt mẫu khi chỉ cần scout/read-only:

```text
/scout Scout payment FE mapping vs BE contract. Backend read-only. Do not edit source.
```

Nếu session đang nặng hoặc gặp context overflow:

```text
/fresh-scout Scout payment FE mapping vs BE contract. Backend read-only. Do not edit source.
/fresh-task Implement <bounded task>.
/fresh-be-to-fe Implement FE support from <BE contract>. Backend read-only.
```

Không paste full mandatory flow hằng ngày. Từ `v0.3.21`, input guard tự collapse mandatory-flow boilerplate và fresh workflow tự mở session mới khi cần.

Từ `v0.3.21`, `/task` có auto-delegation policy. Với task đủ lớn, parent agent phải tự cân nhắc dùng `company-scout`, `company-planner`, hoặc `company-reviewer`; anh không cần tự gọi `/run` nếu không muốn ép orchestration.

Các workflow package đáng dùng khi muốn ép rõ shape:

```text
/parallel-review current diff
/review-loop current diff max 3 rounds
/parallel-research <question cần external evidence + local code context>
/parallel-context-build <task lớn cần context handoff>
```

Prompt mẫu cho 2 recipe hay gặp:

```text
/company-commands subagents
/platform-improve Improve model selection, MCP setup, and onboarding docs for a public team package.
/be-to-fe Implement FE from BE spec <endpoint/spec>. Backend read-only.
/memory-policy Show project memory policy and safe remember workflow.
/run company-scout "Map target area read-only before planning."
/run company-reviewer "Review current diff before final handoff."
```

Cache external source repo để đọc targeted trong Pi:

```text
Use company_source_checkout for github.com/org/repo, inspect only relevant files, then summarize applicable patterns.
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
bash "$PI_COMPANY_PLATFORM_HOME/packages/pi-company-core/skills/company-source-cache/checkout-source-repo.sh" \
  github.com/org/repo \
  --path-only
```

## Việc user vẫn phải làm thủ công

- Login OAuth lần đầu trong browser.
- Chọn provider/model intended cho project.
- Chạy `/onboard-project` lần đầu để tạo `.pi/project-context.md`.
- Chạy `/memory-policy` nếu muốn kiểm tra hoặc dùng project memory.
- Approve project trust nếu Pi hỏi. Sau khi hiểu rõ repo, có thể dùng `pi-company-auto` hoặc Pi native `--approve` cho từng lần chạy.
- Approve khi extension guard hỏi destructive/high-risk action.

Các việc này là credential/trust boundary, không nên automation mù.

## Tài liệu chính

- Command reference: `docs/command-reference-vietnamese.md`
- Pi packages: https://pi.dev/docs/latest/packages
- Pi extensions: https://pi.dev/docs/latest/extensions
- Pi providers/OAuth: https://pi.dev/docs/latest/providers
- Pi settings/trust: https://pi.dev/docs/latest/settings
- Pi MCP adapter: https://pi.dev/packages/pi-mcp-adapter
