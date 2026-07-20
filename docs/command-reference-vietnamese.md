# Command reference tiếng Việt

File này là bảng tra cứu command chính cho Pi Company Platform. Mục tiêu là khi anh/team mở Herdr, `cd` vào project, chạy `pi`, thì biết rõ lệnh nào dùng cho việc gì.

## Cách đọc command

Có 4 loại command khác nhau:

| Loại | Gõ ở đâu | Ví dụ | Ý nghĩa |
|---|---|---|---|
| Terminal command | Terminal/macOS shell | `pi-company-mcp --preset core` | Cài, kiểm tra, hoặc cấu hình máy/project từ bên ngoài Pi. |
| Pi slash command | Bên trong Pi TUI | `/onboard-project` | Gọi workflow/prompt/package command trong Pi session hiện tại. |
| Pi hotkey | Bên trong Pi TUI | `Ctrl+L` | Mở UI nhanh, thường dùng cho model/session. |
| Tool syntax | Bên trong Pi, khi cần chính xác | `subagent({ action: "status" })` | Gọi đúng tool/action, dùng khi slash command hoặc natural prompt chưa đủ rõ. |

Nếu không chắc một slash command có sẵn chưa, mở Pi và gõ `/` để xem danh sách command của session hiện tại. Command có thể khác nhau theo package đã install, provider đã login, và project trust.

## Flow hằng ngày ngắn nhất

Lần đầu trên một project:

```bash
cd /path/to/project
pi
```

Trong Pi:

```text
/login
/model
/company-commands
/onboard-project
/memory-policy
```

Các lần sau:

```bash
cd /path/to/project
pi
```

Trong Pi:

```text
/task Implement <task cụ thể>.
```

Nếu task còn mơ hồ:

```text
/discuss <ý tưởng hoặc yêu cầu thô>
/plan <goal cần bóc tách>
```

## Command của platform mình

Các command này đến từ package `pi-company-core`.

| Command | Dịch nghĩa | Dùng khi nào | Kết quả mong đợi |
|---|---|---|---|
| `/company-commands` | Bảng hướng dẫn command | Khi không nhớ command hoặc muốn giải thích cho team mới. | Agent tóm tắt command theo đúng ngữ cảnh project. |
| `/onboard-project` | Đọc project lần đầu | Lần đầu gắn repo vào Pi, sau `/login` và `/model`. | Tạo/cập nhật `.pi/company-profile.json`, `.pi/project-context.md`, `.pi/memory/*`. |
| `/profiles` | Xem/chọn profile | Khi muốn đổi role làm việc: FE, BE, fullstack, docs, data, DevOps. | Hiện profile có sẵn và tradeoff. |
| `/profiles apply <profile>` | Áp profile | Khi đã biết profile muốn dùng. | Ghi profile vào `.pi/company-profile.json`. |
| `/memory-policy` | Kiểm tra memory | Khi muốn biết Pi đang nhớ gì, hoặc muốn lưu memory explicit. | Hiện chính sách memory và file `.pi/memory/*`. |
| `/model-options` | Giải thích model | Khi chưa rõ chọn provider model nào, thinking nào. | Giải thích selector, scope, thinking, benchmark rule. |
| `/company-usage` | Snapshot token/context | Khi muốn biết session đang ăn context/token như nào. | Hiện session file, model, live context, lệnh lấy exact stats. |
| `/platform-improve` | Cải tiến platform/workflow | Khi cần cập nhật setup, prompt, MCP, model scope, memory, runtime policy, docs, hoặc subagent workflow. | Có implementation matrix, source changes, docs, và verify. |
| `/be-to-fe` | Map BE spec sang FE | Khi BE là source-of-truth/read-only, chỉ implement FE. | Scout BE read-only, map contract, implement FE, verify FE. |
| `/task` | Implement task chuẩn | Khi requirement đã rõ. | Có task contract, context manifest, verify, trace, gate. |
| `/plan` | Lập kế hoạch | Khi cần bóc task trước khi sửa. | Plan có scope, file target, verify, risk. |
| `/discuss` | Trao đổi/làm rõ | Khi chưa nên sửa code. | Giải thích option/tradeoff, không tự implement. |
| `/review` | Review current diff/source | Khi cần audit read-only trước final/merge. | Findings theo severity, file/area, required fix. |

Profile name nên biết:

| Profile | Dùng khi nào |
|---|---|
| `generic` | Repo chưa rõ cấu trúc. |
| `web-frontend` | Chỉ FE. |
| `backend-api` | Chỉ BE/API. |
| `be-readonly-fe` | BE đọc-only, FE là nơi sửa. |
| `fullstack` | FE và BE đều có thể sửa nếu task cho phép. |
| `node-typescript` | Tooling/lib Node TypeScript. |
| `python` | Python app/lib. |
| `data` | ETL, dbt, data pipeline, notebook. |
| `devops` | Docker, Terraform, K8s, CI/CD. |
| `mobile` | React Native/Flutter. |
| `docs` | Docs/manual/portal. |

## Command native của Pi

Các command này thuộc Pi core hoặc package Pi chính. Tên/availability có thể phụ thuộc version Pi.

| Command/hotkey | Dịch nghĩa | Dùng khi nào | Ghi chú |
|---|---|---|---|
| `/login` | Đăng nhập provider | Lần đầu dùng OpenAI/Codex hoặc Anthropic/Claude. | OAuth/session lưu local trong Pi, không commit repo. |
| `/model` | Chọn model | Muốn chọn OpenAI provider bằng native selector. | Đây là flow chính, không phải hỏi agent tự chọn thay. |
| `Ctrl+L` | Mở model selector | Đổi model nhanh. | Tương đương UI selector của Pi. |
| `/scoped-models` | Chỉnh danh sách model cycle | Muốn `Ctrl+P` chỉ xoay quanh vài model hay dùng. | Global setup seed sẵn provider model families. |
| `Ctrl+P` | Cycle model | Đổi model trong scope nhanh. | Dùng sau khi đã setup `enabledModels`. |
| `Shift+Ctrl+P` | Cycle model ngược | Quay lại model trước trong scope. | Tiện khi test provider. |
| `Shift+Tab` | Đổi thinking level | Chọn effort như `medium`, `high`, `xhigh`, `max` nếu model hỗ trợ. | Model không hỗ trợ level nào thì Pi có thể clamp. |
| `/session` | Xem session hiện tại | Cần session id/name/token/cost/context. | Dùng cùng `/company-usage`. |
| `/resume` | Resume session | Khi tắt nhầm Pi hoặc muốn nối lại work cũ. | Dựa vào session list/id/name của Pi. |
| `/compact` | Nén context | Khi context usage cao trước task dài. | Chỉ dùng khi cần; đọc lại context quan trọng sau compact. |
| `/mcp` | Xem MCP | Kiểm tra server/tool MCP trong Pi. | Cần `pi-mcp-adapter` hoặc MCP config tương ứng. |
| `/mcp setup` | Setup/refresh MCP | Khi MCP chưa nhận config. | Tùy adapter/version. |
| `/mcp tools` | List MCP tools | Muốn biết server expose tool nào. | Dùng trước khi bảo agent gọi tool ngoài. |
| `/mcp reconnect` | Kết nối lại MCP | Khi server lỗi, token mới, hoặc config đổi. | Không thay thế việc export secret env. |
| `/mcp-auth figma` | OAuth Figma MCP | Khi dùng Figma remote MCP. | Có thể khác theo Figma/Pi MCP package version. |

## Command subagent

Các command này đến từ package `pi-subagents`. Tên hơi “package terminology”, nên bảng dưới dịch ra nghĩa thực tế.

Quan trọng: daily flow không bắt anh phải nhớ các lệnh này. Từ `v0.3.17`, các workflow `/task`, `/be-to-fe`, `/platform-improve`, `/plan`, `/review` có policy để parent agent tự cân nhắc spawn subagent khi task có phần việc độc lập. Slash command dưới đây dùng khi anh muốn ép orchestration cụ thể hoặc debug.

| Command | Dịch nghĩa dễ hiểu | Dùng khi nào | Kết quả mong đợi |
|---|---|---|---|
| `/subagents-doctor` | Health check subagent | Khi mới setup, sau update, hoặc subagent không chạy. | Kiểm tra package, config, agent files, runtime readiness. |
| `/subagents-models` | Bản đồ model của subagent | Khi muốn biết mỗi agent đang inherit model nào hoặc override gì. | Hiện model/thinking/routing đang áp dụng cho subagents. |
| `/subagents` | Catalog/admin agents | Khi muốn xem agent nào có sẵn. | List builtin + company agents, có thể inspect metadata. |
| `/subagents-fleet` | Dashboard đội agent đang chạy | Khi có background/parallel subagents. | Hiện active/done runs, id, status, transcript/result nếu hỗ trợ. |
| `/subagent-cost` | Chi phí/token subagents | Khi muốn biết parent + child agents tiêu hao ra sao. | Hiện usage/cost theo runs nếu package/provider expose stats. |
| `/subagents-watchdog` | Giám sát run bị treo | Khi background agents có nguy cơ stuck/timeout. | Theo dõi/nhắc trạng thái tùy package. |
| `/subagents-watchdog recommend-model` | Gợi ý model watchdog | Khi muốn watchdog dùng model mạnh bổ sung với model chính. | Trả gợi ý model/thinking hiện tại. |
| `/subagents-watchdog on` | Bật watchdog | Khi muốn adversarial review ở cuối turn cho session/project. | Watchdog review repo edits ở `agent_end`; có thể tốn thêm token. |
| `/subagents-profiles` | List profiles | Khi team có nhiều provider/quota profile. | Hiện profiles trong `~/.pi/agent/profiles/pi-subagents/`. |
| `/subagents-refresh-provider-models <provider>` | Refresh model catalog | Khi model registry/provider thay đổi. | Probe/cache catalog provider. |
| `/subagents-generate-profiles <provider>` | Sinh quota/quality profiles | Khi muốn profile model theo quota/chất lượng. | Tạo profile cho provider. |
| `/subagents-check-profile <name>` | Check profile | Khi profile/model có thể stale. | Re-check model availability/auth. |
| `/run <agent> "<task>"` | Chạy 1 subagent | Khi cần 1 scout/reviewer/planner riêng context. | Child session chạy task rồi trả summary về parent. |
| `/run <agent> "<task>" --bg` | Chạy background | Khi muốn agent chạy nền rồi mình xem sau. | Dùng `/subagents-fleet` để follow. |
| `/run <agent> "<task>" --fork` | Chạy từ forked session | Khi child cần inherited conversation/context branch. | Fork thật từ parent leaf; dùng fresh nếu không cần history. |
| `/parallel ...` | Chạy nhiều agent song song | Khi các việc độc lập, nhất là read-only review/scout/test analysis. | Parent đợi hoặc gom kết quả tùy flow. |
| `/chain ...` | Chạy tuần tự | Khi output agent trước là input agent sau. | Dùng `{previous}` để truyền summary trước đó. |
| `/run-chain <name>` | Chạy chain đã lưu | Khi có workflow lặp lại. | Package chạy recipe chain đã định nghĩa. |
| `/parallel-review` | Review song song | Khi cần nhiều reviewer theo góc nhìn độc lập. | Có thể thêm `autofix` nếu đã cho phép sửa. |
| `/review-loop` | Worker/reviewer/fix loop | Khi muốn review đến khi sạch hoặc hết vòng. | Nên set max rounds, thường dùng tối đa 3 vòng. |
| `/parallel-research` | Research song song | Khi cần external evidence + local scout. | Builtin `researcher` cần `pi-web-access`. |
| `/parallel-context-build` | Build context handoff | Khi task lớn cần `context.md`/meta-prompt trước planning. | Dùng `context-builder` agents. |
| `/parallel-handoff-plan` | Research + context + plan | Khi muốn handoff plan đầy đủ cho implementation. | Tốt cho architecture hoặc platform change lớn. |
| `/gather-context-and-clarify` | Scout rồi hỏi đúng câu | Khi requirement chưa rõ nhưng cần đọc trước. | Trả clarification questions có evidence. |
| `/parallel-cleanup` | Cleanup review sau implement | Khi muốn rà cleanup đáng làm. | Có thể thêm `autofix`. |

Glossary:

| Từ | Nghĩa trong repo mình |
|---|---|
| `doctor` | Kiểm tra sức khỏe/setup, không sửa logic task. |
| `models` | Cho biết model/thinking từng subagent sẽ dùng. |
| `fleet` | “Đội” child sessions đang chạy hoặc vừa chạy xong. |
| `scout` | Agent đọc/map code read-only. |
| `planner` | Agent lập plan và verify gate, không sửa code. |
| `worker` | Agent sửa code theo plan. |
| `reviewer` | Agent review diff/test/scope. |
| `oracle` | Agent phản biện/risk challenge. |
| `researcher` | Builtin agent nghiên cứu web/docs có nguồn; cần `pi-web-access`. |
| `context-builder` | Builtin agent tạo context/meta-prompt handoff cho task lớn. |
| `chain` | Làm A rồi dùng kết quả A để làm B. |
| `parallel` | Làm nhiều nhánh độc lập cùng lúc. |
| `bg` | Background run, không block parent ngay. |
| `fork` | Child bắt đầu từ nhánh session hiện tại thay vì context fresh. |
| `watchdog` | Opt-in adversarial reviewer ở cuối turn; không phải `reviewer` subagent. |
| `worktree` | Checkout riêng cho parallel writers để tránh đè file nhau. |

Company subagents:

| Agent | Khi dùng | Write policy |
|---|---|---|
| `company-scout` | Map repo/module/spec trước khi sửa. | Read-only. |
| `company-planner` | Lập implementation plan. | Read-only. |
| `company-worker` | Implement task đã rõ/đã approve. | Có thể write trong scope. |
| `company-reviewer` | Review diff, verify coverage, scope drift. | Review-first. |
| `company-oracle` | Challenge architecture/risk. | Read-only. |

## Exact subagent control syntax

Dùng khi muốn chính xác hơn slash command:

```text
subagent({ agent: "company-scout", task: "Map the auth flow. Read-only.", context: "fresh" })
```

Status:

```text
subagent({ action: "status" })
subagent({ action: "status", id: "<run-id>", view: "transcript" })
```

Điều khiển run:

```text
subagent({ action: "steer", id: "<run-id>", message: "Focus only on tests." })
subagent({ action: "stop", id: "<run-id>" })
subagent({ action: "resume", id: "<run-id>", message: "Continue after this clarification." })
```

Rule thực tế: dùng slash/natural prompt cho hầu hết task; dùng tool syntax khi cần debug run id hoặc steer/stop chính xác.

Một số option hữu ích:

```text
/run reviewer[model=anthropic/claude-sonnet-5:high] "Review this diff"
/run scout[output=context.md,outputMode=file-only] "Map auth flow"
/chain scout[output=context.md,as=context] "Scan" -> planner[reads=context.md] "Plan from {outputs.context}"
subagent({ action: "status", view: "fleet" })
subagent({ action: "status", id: "<run-id>", view: "transcript", lines: 120 })
subagent({ action: "grant-spawn-budget", additional: 10 })
```

`outputMode=file-only` hữu ích khi child tạo report dài: parent chỉ nhận đường dẫn file, không bị nhồi full report vào context.

## Khi nào nên spawn subagent

Theo provider docs, subagent tốt nhất cho việc độc lập và bounded:

- codebase exploration;
- map contract/API/schema;
- đọc docs/spec dài rồi tóm tắt;
- review correctness/security/tests/scope drift theo nhiều góc nhìn;
- chạy/test analysis không cần sửa cùng file;
- compress context trước khi parent/worker implement.

Không nên spawn bừa khi:

- task nhỏ, một file, verify đơn giản;
- nhiều writer cùng sửa chung vùng source;
- requirement chưa rõ;
- cần quyết định product/architecture từ user;
- repo đang dirty mà chưa hiểu thay đổi của ai.

Default của platform là an toàn:

- `maxSubagentDepth: 1`: parent spawn child, child không fan-out tiếp.
- `parallel.concurrency: 3`: không mở quá nhiều child cùng lúc.
- `asyncByDefault: false`: không tự chạy background nếu anh không yêu cầu.
- Một `company-worker` tại một thời điểm; parallel chủ yếu dùng cho scout/reviewer.

Nếu anh không gọi gì thêm, `/task` vẫn có quyền tự dùng subagent theo `docs/auto-delegation-policy.md`.

## Prompt mẫu cho bài toán thật

### Platform/package improvement

```text
/platform-improve Improve onboarding, model scope, MCP setup, and verification docs for team usage. Keep workflows public, project-agnostic, and verifiable.
```

Khi muốn tách rõ agents:

```text
Use company-scout to map current platform docs/scripts read-only.
Use company-scout to inspect relevant external source context read-only when the user provides it.
Then use company-planner to produce an implementation plan.
Only after plan is clear, use company-worker for implementation.
Use company-reviewer before final.
```

### BE spec lên FE, không sửa BE

```text
/profiles apply be-readonly-fe
/be-to-fe Implement FE support for <endpoint/spec>. Scout backend read-only, map contract, then edit frontend only.
```

Nếu muốn parallel read-only:

```text
Run parallel company-scout agents: one maps backend contract read-only, one maps frontend route/state usage. Wait for both, then plan FE implementation.
```

### Review trước khi ship

```text
/review current diff
```

Hoặc chia reviewer:

```text
/parallel company-reviewer "Review correctness and edge cases" -> company-reviewer "Review tests and verification gaps" -> company-reviewer "Review scope drift and protected paths"
```

## Terminal commands

Các lệnh này chạy ngoài Pi.

| Command | Dùng khi nào |
|---|---|
| `npm install -g @earendil-works/pi-coding-agent` | Cài Pi CLI lần đầu. |
| `pi install git:github.com/Vt-mmm/pi_agent@v0.3.17` | Cài package platform từ GitHub. |
| `pi list --approve` | Xem package Pi đã install. |
| `pi --list-models` | Xem model Pi thấy được theo credentials hiện tại. |
| `pi-company-install --with-mcp --with-subagents` | Cài global package + MCP + subagent baseline từ package bin. |
| `pi-company-setup <project> --profile auto` | Setup đầy đủ cho một project khi muốn preseed bằng bin. |
| `pi-company-init <project> --profile generic` | Init project files tối thiểu. |
| `pi-company-models` | Xem catalog model seeded bởi platform. |
| `pi-company-model-scope --preset full` | Re-apply full provider model scope. |
| `pi-company-mcp --preset core --scope global` | Seed MCP core: Context7, Chrome DevTools, GitHub. |
| `pi-company-mcp --preset popular --scope global` | Seed MCP popular: core + Playwright + Figma remote. |
| `pi-company-mcp --list` | List MCP presets. |
| `pi-company-subagents --preset safe` | Re-apply subagent safe config. |
| `pi install npm:pi-web-access` | Optional: cấp web/search/fetch tools cho builtin `researcher`. |
| `pi-company-setup <project> --with-web-access` | Setup project + optional web access cho research subagents. |
| `pi-company-usage /path/to/project` | Lấy exact session usage từ terminal khác. |
| `pi-company-doctor /path/to/project --strict-share` | Kiểm tra project có share/open-source được không. |
| `pi-company-benchmark ...` | Ghi quality benchmark bằng package bin. |
| `bash scripts/verify-local.sh` | Verify repo platform trước khi commit/tag. |
| `bash scripts/verify-local.sh --offline` | Verify trong CI/máy sạch, bỏ qua local Pi model catalog. |
| `bash scripts/setup.sh <project> ...` | Preseed setup project; không bắt buộc cho daily flow. |
| `bash scripts/quality-benchmark.sh ...` | Ghi quality benchmark theo scenario thật. |

Khi đang develop chính repo `pi_agent`, có thể dùng npm scripts tương ứng:

| Command | Tương đương |
|---|---|
| `npm run verify` | `bash scripts/verify-local.sh` |
| `npm run setup -- <project>` | `bash scripts/setup.sh <project>` |
| `npm run install-global` | `bash scripts/install-global.sh` |
| `npm run init-project -- <project>` | `bash scripts/init-project.sh <project>` |
| `npm run doctor -- <project> --strict-share` | `bash scripts/team-doctor.sh <project> --strict-share` |
| `npm run benchmark -- ...` | `bash scripts/quality-benchmark.sh ...` |
| `npm run usage -- <project>` | `bash scripts/pi-session-stats.sh <project>` |
| `npm run models` | `bash scripts/pi-model-catalog.sh` |
| `npm run model-scope -- --preset full` | `bash scripts/configure-model-scope.sh --preset full` |
| `npm run mcp -- --preset core --scope global` | `bash scripts/configure-mcp.sh --preset core --scope global` |
| `npm run subagents -- --preset safe` | `bash scripts/configure-subagents.sh --preset safe` |

## MCP command quick map

| Muốn làm gì | Gõ |
|---|---|
| Kiểm tra MCP trong Pi | `/mcp` |
| Xem tool MCP | `/mcp tools` |
| Reconnect sau khi đổi config/env | `/mcp reconnect` |
| Seed global Context7/Chrome/GitHub | `pi-company-mcp --preset core --scope global` |
| Thêm Figma/Playwright | `pi-company-mcp --preset popular --scope global` |
| Xem preset | `pi-company-mcp --list` |

Secret phải để trong env, không commit:

```bash
export CONTEXT7_API_KEY=ctx7sk_...
export GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_...
```

## Token/context command quick map

| Câu hỏi | Lệnh |
|---|---|
| Session này đang dùng model gì? | `/session` hoặc `/company-usage` |
| Context window đang còn bao nhiêu? | `/company-usage` |
| Exact token/cost từ terminal khác? | `pi-company-usage /path/to/project` |
| Subagents tốn bao nhiêu? | `/subagent-cost` |
| Có nên compact chưa? | Xem `contextUsage.percent`; trên 75% mới cân nhắc `/compact`. |

Không claim tiết kiệm token/cost nếu chưa có số liệu cùng scenario. Dùng benchmark script để ghi lại.

## Source rule cho subagent/custom agent

Mental model chuẩn:

1. Parent Pi là coordinator: giữ requirement, quyết định, final output.
2. Subagent là child session: có context riêng, có thể dùng model/tool riêng hoặc inherit parent.
3. Child trả summary/result về parent; parent không nên bị nhồi toàn bộ log trung gian.
4. Dùng read-only subagents trước: scout, docs research, review, test-gap analysis.
5. Writer song song chỉ dùng khi có worktree isolation và write set không overlap.
6. Agent custom tốt phải có role hẹp, tool surface rõ, output contract rõ.

Đây là lý do platform mình có `company-scout`, `company-planner`, `company-worker`, `company-reviewer`, `company-oracle` thay vì một agent tổng quát làm tất cả.

## Tài liệu chính

- Pi usage docs: https://pi.dev/docs/latest/usage
- Pi packages: https://pi.dev/packages
- pi-subagents package: https://pi.dev/packages/pi-subagents
