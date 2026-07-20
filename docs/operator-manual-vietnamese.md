# Pi Agent Platform - Operator manual tiếng Việt

## Mục tiêu

Tài liệu này là hướng dẫn vận hành end-to-end cho anh/team:

```bash
cd /path/to/project
pi
```

Từ đó Pi có thể login provider, chọn model, onboard project, chạy task, kiểm soát tool, theo dõi token, resume session, dùng MCP, và dùng subagent khi task đủ lớn.

Phiên bản runtime ổn định hiện tại: `v0.3.23`.

```bash
pi install git:github.com/Vt-mmm/pi_agent@v0.3.23
```

## Phạm vi đúng của guard

Platform này là:

```text
Accident brake + prompt-injection speed bump, not a security boundary.
```

Nghĩa thực tế:

- Guard chặn agent gọi tool sai qua `tool_call`.
- Guard giúp giảm rủi ro đọc `.env`, auth file, guard state, hoặc chạy shell phá hoại.
- Guard buộc task có context manifest, verify evidence quan sát thật, trace, và final gate.
- Guard không chặn code đã chạy bên trong process khác, ví dụ `npm test` chạy script độc, dependency bị nhiễm, binary mới build, hoặc repo lạ có script nguy hiểm.

Scope dùng phù hợp:

- solo/internal;
- repo tin được;
- human-in-the-loop;
- project có thể audit và rollback.

Nếu input/repo không tin được hoặc chạy tự động trên CI không có người giám sát, phải thêm isolation tầng OS như container/VM/seccomp/network/credential boundary.

## Mental model

Có 3 lớp:

| Lớp | Nằm ở đâu | Vai trò |
|---|---|---|
| Pi core | `pi` CLI | Model UI, session, built-in tools `read/bash/edit/write/grep/find/ls`, provider/OAuth, MCP hooks. |
| Platform package | repo `pi_agent` | Commands, prompts, guard extension, profiles, MCP/subagent setup, task evidence. |
| Project state | `<project>/.pi/*` | Profile, project context, task state, memory, MCP override, local benchmark. |

Luồng mong muốn:

```text
install package once
  -> cd project
  -> pi
  -> login/model
  -> onboard project
  -> run task
  -> verify/trace/gate
  -> handoff
```

## 1. Base setup lần đầu

### Cài Pi và package platform

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.23
```

Nếu dùng Herdr:

```bash
herdr integration install pi
```

Kiểm tra package đã load:

```bash
pi list
pi list --approve
```

Nếu project đã tin cậy và muốn mở Pi không bị hỏi trust lại trong lần chạy hiện tại:

```bash
pi-company-auto
```

Read-only auto-run cho scout/audit:

```bash
pi-company-auto --read-only -p "Scout payment mapping. Do not edit source."
```

`pi-company-auto` chỉ wrap `pi --approve`. Nó không tắt company guard: protected paths, destructive shell checks, task gate, và verify evidence vẫn chạy.

### Mở project

```bash
cd /path/to/project
pi
```

Daily UX không cần set shell profile, không cần chạy bash init trước. Profile chọn trong Pi qua onboarding hoặc `/profiles`.

### Login provider

Trong Pi:

```text
/login
```

Chọn provider/account như OpenAI/Codex hoặc Anthropic/Claude. Credential nằm trong Pi user dir, không nằm trong repo và không được commit.

### Chọn model và thinking

Trong Pi:

```text
/model
```

Hotkey:

```text
Ctrl+L       # mở model selector
Ctrl+P       # cycle model trong scoped list
Shift+Ctrl+P # cycle ngược
Shift+Tab    # đổi thinking level nếu model hỗ trợ
```

Terminal options khi cần mở Pi với model cụ thể:

```bash
pi --model openai-codex/gpt-5.5 --thinking xhigh
pi --model anthropic/claude-sonnet-5:high
pi --models "openai-codex/*,anthropic/*sonnet*"
```

Gợi ý:

- Scout/plan đơn giản: dùng model nhanh/thấp hơn.
- Implement/debug/risk cao: dùng model mạnh/thinking cao.
- Deploy monitor/CI follow-up: tách session riêng, không giữ context implement quá dài.

## 2. Onboard project lần đầu

Sau `/login` và `/model`, chạy:

```text
/company-commands
/mcp
/subagents-doctor
/onboard-project
/memory-policy
```

`/onboard-project` sẽ:

1. đọc repo theo context budget;
2. detect profile phù hợp;
3. giải thích các profile option;
4. hỏi user trước khi apply;
5. ghi project profile/context.

File chính được tạo/cập nhật:

```text
.pi/company-profile.json
.pi/project-context.md
.pi/company-state/project-onboarding.json
.pi/memory/memory_summary.md
.pi/memory/MEMORY.md
```

Nếu `.pi/project-context.md` còn `Generated: not yet`, không nên chạy `/task` implementation. Chạy lại `/onboard-project` trước.

### Đổi profile sau này

Trong Pi:

```text
/profiles
/profiles apply fullstack
/profiles apply be-readonly-fe
/profiles apply web-frontend
/profiles apply backend-api
```

Profile thường dùng:

| Profile | Khi dùng |
|---|---|
| `generic` | Repo chưa rõ cấu trúc. |
| `web-frontend` | FE-only. |
| `backend-api` | BE/API work. |
| `be-readonly-fe` | BE là source-of-truth/read-only, FE là write target. |
| `fullstack` | FE và BE đều có thể sửa nếu task cho phép. |
| `node-typescript` | Node/TypeScript library/tooling. |
| `python` | Python app/library. |
| `data` | ETL/data pipeline/notebook. |
| `devops` | Docker/Terraform/Kubernetes/CI/CD. |
| `mobile` | React Native/Flutter. |
| `docs` | Docs/manual/portal. |

## 3. Optional preseed setup

Không phải daily default. Dùng khi muốn tạo sẵn `.pi` files cho project/team:

```bash
bash /path/to/pi_agent/scripts/setup.sh /path/to/project \
  --project-only \
  --profile auto \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.23 \
  --mcp-preset core \
  --subagents-preset safe
```

Nếu npm bins đã link:

```bash
pi-company-init /path/to/project --profile auto
pi-company-mcp --preset core --scope global
pi-company-subagents --preset safe
```

Khi command không có trên PATH, dùng script trực tiếp:

```bash
bash /path/to/pi_agent/scripts/init-project.sh /path/to/project --profile auto
bash /path/to/pi_agent/scripts/configure-mcp.sh --preset core --scope global
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

## 4. Daily task workflow

### Requirement chưa rõ

```text
/discuss Cải tiến workflow onboarding cho team mới. Chưa implement, chỉ hỏi phần thiếu và đề xuất plan.
```

### Cần plan trước

```text
/plan Implement header sale menu hover stabilization. Include scope, files, verify commands, and risks.
```

### Task rõ, cho implement

```text
/task Implement header sale menu hover stabilization. Add component tests and run relevant verify.
```

### Scout/audit read-only

```text
/scout Scout payment FE mapping vs BE contract. Backend read-only. Do not edit source.
```

Use `/scout` cho payment/auth/data/contract mapping khi mục tiêu là chốt evidence trước, chưa sửa code.

### Task mới khi session đã nặng

Nếu `/company-usage` cho thấy context cao, hoặc Pi báo context overflow, dùng fresh workflow:

```text
/fresh-scout Scout payment FE mapping vs BE contract. Backend read-only. Do not edit source.
/fresh-task Implement <bounded task>.
/fresh-be-to-fe Implement FE support for <BE contract>. Backend read-only.
```

Các command này tự mở session mới và replay prompt workflow ngắn. Anh không cần tự chạy `pi --name ...` rồi paste lại.

Input guard của platform cũng tự collapse prompt có full `Mandatory flow` boilerplate. Quy tắc vận hành: user chỉ mô tả task; checklist nằm trong platform prompt/company tools.

### Gửi ảnh/screenshot trong chat

Nếu Pi/chat box không tạo native image attachment mà chỉ hiện local path kiểu `/var/folders/.../Ảnh màn hình ...png`, cứ để nguyên path trong prompt:

```text
/scout Scout UI issue from screenshot /var/folders/.../screenshot.png
```

Company guard sẽ xử lý trước khi model nhận input:

1. đọc local image path;
2. attach ảnh vào Pi input;
3. thay path trong prompt bằng marker `[image1]`;
4. báo `Company image input: attached [image1]`.

Hỗ trợ `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`. Giới hạn mặc định: tối đa 4 ảnh/input, 8 MB/ảnh.

Nếu ảnh quá lớn, lưu ảnh nhỏ hơn hoặc yêu cầu agent dùng Pi `read` tool trên file ảnh để Pi resize. Không cần copy ảnh vào repo và không commit screenshot tạm.

### BE spec lên FE

```text
/profiles apply be-readonly-fe
/be-to-fe Implement frontend support from backend endpoint/spec <name>. Backend is read-only.
```

### Cải tiến platform

```text
/platform-improve Improve MCP setup docs and subagent command guidance for team usage.
```

### Review trước final

```text
/review current diff
```

## 5. Control flow của một task chuẩn

Một source-changing task nên đi qua:

```text
intake
  -> profile/context
  -> task contract
  -> context manifest
  -> implementation
  -> verify command
  -> observed verify evidence
  -> trace
  -> final gate
  -> handoff
```

Các company tools nền:

| Tool | Vai trò |
|---|---|
| `company_context` | Đọc active profile, required context, verify commands, MCP/memory settings. |
| `company_task_start` | Tạo task contract: scope, risk, acceptance criteria. |
| `company_context_record` | Ghi context manifest: file nào đã đọc và lý do. |
| `company_exec_policy_check` | Check shell command trước khi chạy lệnh rủi ro. |
| `company_context_budget` | Check file/context size để tránh nhồi context. |
| `company_tool_policy_check` | Check capability của tool/MCP. |
| `company_verify_record` | Chỉ ghi verify evidence nếu Pi đã quan sát bash result thật sau task start. |
| `company_trace_record` | Ghi outcome, changed files, notes. |
| `company_task_gate_check` | Check final gate trước khi báo DONE. |
| `company_usage_snapshot` | Snapshot session/model/context. |

Done đúng nghĩa:

- có task contract;
- có context manifest;
- verify command đã chạy thật;
- verify evidence khớp `task.verifyCommands`;
- trace outcome rõ;
- final gate pass hoặc ghi rõ blocked/partial.

## 6. Guardrails cần hiểu

Protected path mặc định:

```text
.git/**
**/auth.json
**/.env
**/.env.*
.pi/company-state/**
.pi/company-profile.json
```

Guard chặn:

- shell command chạm protected path;
- raw path-like access qua `read/write/edit/grep/find/ls`;
- custom/MCP tool có path-like string trỏ protected path;
- nested object/array/path URI;
- percent-encoded protected path;
- tool input quá sâu vượt inspection limit.

Broad `grep/find/ls` sweep được phép nếu không target trực tiếp protected path, nhưng output protected content/path metadata sẽ bị redact trước khi model thấy.

High-risk action phải human-gate:

- auth/OAuth/provider config;
- database migration;
- deploy/release/publish;
- destructive shell;
- external provider side effect/cost;
- production data;
- broad git operations.

## 7. Token, context, benchmark

### Trong Pi

```text
/task-preflight
/task-preflight compact
/company-usage
/session
```

`/task-preflight` cho biết task tiếp theo nên chạy trực tiếp, compact trước, hay mở fresh session. `compact` dùng khi muốn Pi nén session có hướng dẫn giữ lại decisions/open blockers/verify command.

`/company-usage` cho biết:

- session file;
- session id/name;
- model/thinking;
- live context usage;
- command lấy exact token/cost từ terminal khác.

Live context không phải billed tokens. Ví dụ `111k / 272k` là context đang giữ trong cửa sổ hiện tại, không phải tổng input/output/cost.

### Từ terminal khác

Nếu bin có trên PATH:

```bash
pi-company-usage /path/to/project
```

Fallback:

```bash
bash /path/to/pi_agent/scripts/pi-session-stats.sh /path/to/project
```

Nếu biết session file:

```bash
bash /path/to/pi_agent/scripts/pi-session-stats.sh \
  /path/to/project \
  /Users/<user>/.pi/agent/sessions/<project-key>/<session>.jsonl
```

### Cách đọc số

| Field | Ý nghĩa |
|---|---|
| `input` | Fresh input tokens gửi vào model. |
| `output` | Tokens model sinh ra. |
| `cacheRead` | Tokens đọc từ prompt cache. Có thể rất lớn, không tương đương fresh input cost. |
| `cacheWrite` | Tokens ghi cache. |
| `total` | Tổng theo Pi stats. |
| `cost` | Cost Pi tính theo provider/model pricing metadata. |
| `contextUsage.percent` | Phần trăm context window đang dùng. |

### Khi nào compact hoặc tách session

| Context | Khuyến nghị |
|---|---|
| `< 50%` | Bình thường. |
| `50-75%` | Tránh đọc file lớn không cần thiết. |
| `> 75%` | Cân nhắc `/compact` trước task dài tiếp theo. |
| Task chuyển từ implement sang deploy monitor | Nên tách session mới hoặc compact. |
| Task đã xong nhưng CI cần follow lâu | Tách session monitor riêng để không kéo context cũ. |

Trong Pi:

```text
/compact
```

Sau compact, agent phải đọc lại context quan trọng trước khi sửa tiếp.

### Ghi benchmark

Không claim tiết kiệm token/cost nếu chưa có số liệu cùng scenario.

```bash
bash /path/to/pi_agent/scripts/quality-benchmark.sh /path/to/project --init

bash /path/to/pi_agent/scripts/quality-benchmark.sh /path/to/project --record \
  --scenario "ui-fix-with-ci-gate" \
  --surface pi \
  --result partial \
  --tokens 26323474 \
  --cost 18.33 \
  --verify "npm test / E2E / CI gate" \
  --notes "Implementation + branch push + main/test merge + CI monitor; deploy gate failed at shard 2."
```

Benchmark nên đặt theo scenario thật, ví dụ:

- `bounded-source-fix`;
- `be-spec-to-fe`;
- `ui-fix-with-ci-gate`;
- `platform-docs-update`;
- `deploy-monitor`.

Không benchmark theo số file changed đơn thuần.

## 8. Resume session khi tắt nhầm

### Cách nhanh nhất

Trong project:

```bash
cd /path/to/project
pi --continue
```

Hoặc mở selector:

```bash
pi --resume
```

Nếu biết session id hoặc file:

```bash
pi --session 019f7ad3-0ce3-77f3-b34d-72d8c37c5fb6
pi --session /Users/<user>/.pi/agent/sessions/<project-key>/<session>.jsonl
```

Fork một session cũ sang session mới:

```bash
pi --fork 019f7ad3-0ce3-77f3-b34d-72d8c37c5fb6
```

Đặt tên session ngay từ đầu để dễ tìm:

```bash
pi --name "V-Nexus header menu fix"
```

Trong Pi:

```text
/session
/company-usage
```

`/company-usage` sẽ in session id và session file. Ghi lại khi task dài hoặc có nhiều pane Herdr.

### Khi nào nên resume, continue, fork

| Nhu cầu | Dùng |
|---|---|
| Tắt nhầm, muốn quay lại phiên gần nhất | `pi --continue` |
| Không nhớ phiên nào | `pi --resume` |
| Có session id/file từ `/company-usage` | `pi --session <id-or-file>` |
| Muốn thử hướng mới nhưng giữ history cũ | `pi --fork <id-or-file>` |
| Muốn session mới sạch sau task quá dài | `pi --name "<new task>"` |

## 9. MCP setup và cách dùng

### Preset

| Preset | Includes | Khi dùng |
|---|---|---|
| `minimal` | none | Muốn giữ surface nhỏ. |
| `docs` | Context7 | Cần docs framework/library mới. |
| `browser` | Chrome DevTools, Playwright | FE/browser/runtime inspection. |
| `github` | GitHub MCP | Issue/PR/repo/release workflow. |
| `design` | Figma remote | Design-to-code qua Figma OAuth. |
| `design-local` | Figma desktop | Figma Dev Mode local selection. |
| `web` | Context7 + browser tools | Web/FE default. |
| `core` | Context7, Chrome DevTools, GitHub | Team baseline. |
| `popular` | core + Playwright + Figma remote | Full dev baseline. |
| `all` | popular + Figma desktop | Cần cả remote + local design. |

### Cấu hình global

```bash
pi-company-mcp --preset core --scope global
pi-company-mcp --preset popular --scope global
pi-company-mcp --list
```

Fallback:

```bash
bash /path/to/pi_agent/scripts/configure-mcp.sh --preset core --scope global
```

### Cấu hình project

```bash
pi-company-mcp --preset design --scope project --project /path/to/project
```

Fallback:

```bash
bash /path/to/pi_agent/scripts/configure-mcp.sh \
  --preset design \
  --scope project \
  --project /path/to/project
```

### Trong Pi

```text
/mcp
/mcp setup
/mcp tools
/mcp reconnect
/mcp-auth figma
```

### Config layers

| File | Scope | Ghi chú |
|---|---|---|
| `~/.config/mcp/mcp.json` | Shared global | Baseline cho nhiều agent/client. |
| `~/.pi/agent/mcp.json` | Pi global override | Chỉ khi Pi cần override riêng. |
| `.mcp.json` | Project shared | Có thể commit nếu không chứa secret. |
| `.pi/mcp.json` | Pi project override | Pi-specific; không nhét secret. |

Quy ước:

- `directTools: false` mặc định để giảm tool explosion/token.
- Dùng proxy `mcp(...)` qua `pi-mcp-adapter`.
- Secret để trong environment variable, không commit.

Ví dụ:

```bash
export CONTEXT7_API_KEY=ctx7sk_...
export GITHUB_PERSONAL_ACCESS_TOKEN=<github-token>
```

## 10. Subagents và multi-agent

### Setup

```bash
pi-company-subagents --preset safe
```

Fallback:

```bash
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

Check trong Pi:

```text
/subagents-doctor
/subagents-models
/subagents
/subagents-fleet
/subagent-cost
```

### Safe preset

Default safe config:

- `toolDescriptionMode: compact`;
- `asyncByDefault: false`;
- `parallel.concurrency: 3`;
- `parallel.maxTasks: 6`;
- `maxSubagentDepth: 1`;
- `maxSubagentSpawnsPerSession: 32`;
- scheduled runs off;
- worktree base stable;
- intercom bridge on.

### Company agents

| Agent | Role | Write policy |
|---|---|---|
| `company-scout` | Map source/spec read-only. | No write. |
| `company-planner` | Plan implementation + verify gates. | No write. |
| `company-worker` | Implement approved bounded task. | Write in scope. |
| `company-reviewer` | Review diff/tests/scope. | Review-first. |
| `company-oracle` | Risk/architecture challenge. | No write. |

### Auto-delegation

Với `/task`, `/be-to-fe`, `/platform-improve`, `/plan`, `/review`, parent agent phải tự cân nhắc spawn subagent khi có phần việc độc lập.

Không cần tự gọi `/run` cho task bình thường. Chỉ dùng `/run` khi muốn ép rõ role hoặc debug.

Parent nên spawn khi:

- cần scout codebase rộng;
- cần map BE/spec read-only trước khi FE implement;
- cần reviewer độc lập;
- cần context builder cho task lớn;
- cần oracle/risk challenge.

Không nên spawn khi:

- task nhỏ, một file;
- requirement chưa rõ;
- nhiều writer cùng sửa chung vùng;
- repo dirty chưa rõ của ai;
- đang cần quyết định user/product.

### Slash examples

```text
/run company-scout "Map listing page state flow. Read-only."
/run company-planner "Plan FE implementation from this backend contract."
/run company-worker "Implement the approved plan. Do not touch backend."
/run company-reviewer "Review current diff for correctness, tests, and scope drift."
/run company-oracle "Challenge this architecture decision before implementation."
```

Parallel read-only review:

```text
/parallel company-reviewer "Review correctness" -> company-reviewer "Review tests" -> company-reviewer "Review scope drift"
```

Chain:

```text
/chain company-scout "Scout target area" -> company-planner "Plan from {previous}" -> company-worker "Implement from {previous}" -> company-reviewer "Review implementation"
```

Background:

```text
/run company-scout "Map this module" --bg
/subagents-fleet
```

### Tool syntax khi cần chính xác

```text
subagent({ agent: "company-scout", task: "Map auth flow. Read-only.", context: "fresh" })
subagent({ action: "status", view: "fleet" })
subagent({ action: "status", id: "<run-id>", view: "transcript" })
subagent({ action: "steer", id: "<run-id>", message: "Focus only on tests." })
subagent({ action: "stop", id: "<run-id>" })
subagent({ action: "resume", id: "<run-id>", message: "Continue after this clarification." })
```

Output file mode để giảm parent context:

```text
/run scout[output=context.md,outputMode=file-only] "Map target area"
/chain scout[output=context.md,as=context] "Scan" -> planner[reads=context.md] "Plan from {outputs.context}"
```

### Worktree isolation

Chỉ bật writer parallel/worktree khi:

- repo là Git repo;
- worktree clean;
- write sets không overlap;
- parent review/merge outputs.

Default solo/internal: một `company-worker`, parallel read-only reviewers/scouts.

### Watchdog

Watchdog là optional adversarial reviewer ở cuối turn, không bật mặc định vì tốn thêm model pass.

```text
/subagents-watchdog recommend-model
/subagents-watchdog session model recommended
/subagents-watchdog on
```

## 11. Command cheat sheet

### Terminal

| Command | Dùng để |
|---|---|
| `pi install git:github.com/Vt-mmm/pi_agent@v0.3.23` | Install platform package. |
| `pi list --approve` | Kiểm package/resources đã load. |
| `pi-company-auto` | Mở Pi với project trust `--approve` cho lần chạy hiện tại; guard vẫn bật. |
| `pi-company-auto --read-only -p "<task>"` | Auto-run read-only scout với tool set `read,grep,find,ls`. |
| `pi --continue` | Continue session gần nhất. |
| `pi --resume` | Chọn session để resume. |
| `pi --session <id-or-file>` | Resume session cụ thể. |
| `pi --fork <id-or-file>` | Fork session cũ sang session mới. |
| `pi --name "<name>"` | Đặt tên session. |
| `pi --tools read,grep,find,ls -p "Review src"` | Read-only one-shot. |
| `pi-company-usage /path/to/project` | Exact token/cost stats. |
| `pi-company-mcp --preset core --scope global` | Setup MCP baseline. |
| `pi-company-subagents --preset safe` | Setup subagents baseline. |
| `bash scripts/verify-local.sh` | Verify platform repo. |
| `bash scripts/team-doctor.sh /path/to/project --strict-share` | Doctor project/team setup. |
| `bash scripts/quality-benchmark.sh /path/to/project --record ...` | Ghi benchmark. |

### Trong Pi

| Command | Dùng để |
|---|---|
| `/login` | Login provider. |
| `/model` / `Ctrl+L` | Chọn model. |
| `Ctrl+P` | Cycle scoped models. |
| `Shift+Tab` | Cycle thinking level. |
| `/company-commands` | Xem command help theo ngữ cảnh. |
| `/onboard-project` | Onboard/read project lần đầu. |
| `/profiles` | Xem/chọn profile. |
| `/memory-policy` | Xem memory policy. |
| `/task-preflight` | Check context trước task lớn/risk cao. |
| `/task-preflight compact` | Compact session có hướng dẫn. |
| `/company-usage` | Snapshot context/session. |
| `/session` | Pi native session stats/info. |
| `/compact` | Nén context. |
| `/mcp` / `/mcp tools` | Check MCP. |
| `/subagents-doctor` | Check subagent setup. |
| `/subagents-fleet` | Follow child sessions. |
| `/subagent-cost` | Check subagent token/cost. |
| `/discuss` | Làm rõ, không sửa. |
| `/plan` | Lập plan. |
| `/scout` | Scout/audit read-only. |
| `/fresh-scout` | Tự mở session mới rồi chạy `/scout`. |
| `/fresh-task` | Tự mở session mới rồi chạy `/task`. |
| `/fresh-be-to-fe` | Tự mở session mới rồi chạy `/be-to-fe`. |
| `/task` | Implement task. |
| `/be-to-fe` | BE read-only, FE implementation. |
| `/platform-improve` | Cải tiến platform. |
| `/review` | Review diff/source. |

## 12. Troubleshooting

### Không thấy command platform

```bash
pi list --approve
pi install git:github.com/Vt-mmm/pi_agent@v0.3.23
```

Mở lại Pi session sau khi install.

### `pi-company-*` không có trên PATH

Dùng script trực tiếp:

```bash
bash /path/to/pi_agent/scripts/pi-session-stats.sh /path/to/project
bash /path/to/pi_agent/scripts/configure-mcp.sh --preset core --scope global
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

### MCP không connect

```text
/mcp
/mcp setup
/mcp reconnect
/mcp tools
```

Kiểm config:

```bash
pi-company-mcp --list
```

Kiểm env token mà không in giá trị secret:

```bash
for name in CONTEXT7_API_KEY GITHUB_PERSONAL_ACCESS_TOKEN FIGMA_ACCESS_TOKEN; do
  test -n "${!name:-}" && echo "$name=set" || echo "$name=missing"
done
```

Không paste token vào chat hoặc commit config.

### Subagent không chạy

```text
/subagents-doctor
/subagents-models
/subagents-fleet
```

Re-apply config:

```bash
pi-company-subagents --preset safe
```

Fallback:

```bash
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

### Context quá cao

```text
/company-usage
/session
```

Nếu `contextUsage.percent > 75%`:

```text
/compact
```

Hoặc mở session mới:

```bash
pi --name "Deploy monitor"
```

### Resume không đúng session

Lấy session id/file từ `/company-usage`, rồi:

```bash
pi --session <session-id>
pi --session /absolute/path/to/session.jsonl
```

### Verify evidence không được nhận

Nguyên nhân thường gặp:

- agent ghi `company_verify_record` nhưng chưa chạy bash verify thật;
- command string không exact-match `task.verifyCommands`;
- verify chạy trước `task.createdAt`;
- verify chạy ở cwd khác;
- subagent chạy nhưng parent chưa thấy persisted ledger đúng cwd.

Fix:

```text
Run the exact verify command from task.verifyCommands in the project cwd, then record verify evidence again.
```

## 13. Không commit

Không commit:

```text
.env
**/auth.json
.pi/company-state/
.pi/benchmarks/
.pi/memory/local/
.pi/memory/state.sqlite
.pi/sessions/
.pi/todos/
.pi/auth.json
token/API key/OAuth files
```

Commit được nếu không chứa secret và team muốn share:

```text
AGENTS.md
.mcp.json
.pi/company-profile.json
.pi/project-context.md
```

Memory shared (`.pi/memory/MEMORY.md`) chỉ commit nếu team explicit opt-in sau review/redaction.

## 14. Tài liệu chi tiết

- Quickstart: `docs/quickstart-vietnamese.md`
- Command reference: `docs/command-reference-vietnamese.md`
- Team onboarding: `docs/team-onboarding.md`
- MCP and tools: `docs/mcp-and-tools.md`
- Subagents: `docs/subagents-and-multiagent.md`
- Usage observability: `docs/usage-observability.md`
- Model options: `docs/model-options.md`
- Memory policy: `docs/memory-policy.md`
- Task contract: `docs/task-implementation-contract.md`
- Runtime policy: `docs/runtime-policy-design.md`
- Quality benchmark: `docs/quality-benchmark.md`
