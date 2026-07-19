# Subagents và multi-agent workflow

## Kết luận

Pi core không có subagents built-in. Theo design của Pi, subagents là extension/package. Platform này dùng `pi-subagents` làm baseline vì nó hỗ trợ:

- child Pi sessions riêng context;
- foreground/background runs;
- `/run`, `/parallel`, `/chain`;
- builtin agents `scout`, `planner`, `worker`, `reviewer`, `oracle`, `researcher`, `context-builder`, `delegate`;
- custom package agents từ `packages/pi-company-core/subagents`;
- status/fleet/cost/doctor commands;
- bounded recursion/concurrency;
- optional worktree isolation cho parallel writers.

Từ `v0.3.7`, `scripts/setup.sh` mặc định cài `pi-subagents` và chạy config preset `safe`.

Từ `v0.3.9`, workflow prompts của platform có **auto-delegation policy**: khi anh chạy `/task`, `/be-to-fe`, `/platform-migration`, `/plan`, hoặc `/review`, parent agent phải tự cân nhắc spawn subagent cho phần việc độc lập. Anh không bắt buộc phải gọi `/run` nếu chỉ muốn task hoàn chỉnh.

Xem chi tiết: `docs/auto-delegation-policy.md`.

## Install/setup

Một lệnh setup đầy đủ:

```bash
bash /path/to/pi_agent/scripts/setup.sh . \
  --profile auto \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.9 \
  --mcp-preset core \
  --subagents-preset safe
```

Nếu chỉ cài global:

```bash
pi install git:github.com/Vt-mmm/pi_agent@v0.3.9
pi install npm:pi-subagents
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

Nếu package đã cài nhưng muốn re-apply config:

```bash
pi-company-subagents --preset safe
# hoặc nếu chưa link npm bin:
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe
```

## Safe preset

`safe` ghi vào:

```text
~/.pi/agent/extensions/subagent/config.json
```

Nội dung chính:

- `toolDescriptionMode: compact` để giảm prompt/token;
- `asyncByDefault: false` để không tự chạy background nếu không yêu cầu;
- `parallel.concurrency: 3`;
- `parallel.maxTasks: 6`;
- `maxSubagentDepth: 1`;
- `maxSubagentSpawnsPerSession: 32`;
- async completion batching bật.

Không ép `subagents.modelScope` mặc định. Anh chọn model parent bằng `/model`; builtin subagents sẽ inherit model nếu không override. Nếu muốn ép chỉ Codex/Claude:

```bash
bash /path/to/pi_agent/scripts/configure-subagents.sh --preset safe --model-scope company
```

## Kiểm tra trong Pi

Sau khi mở session mới hoặc `/reload`:

```text
/subagents-doctor
/subagents-models
/subagents
/subagents-fleet
/subagent-cost
```

`/subagents-doctor` là lệnh đầu tiên nên chạy nếu không thấy tool/agent.

Giải nghĩa nhanh:

| Command | Nghĩa đơn giản | Khi dùng |
|---|---|---|
| `/subagents-doctor` | Health check subagent | Kiểm package/config/agent files/runtime readiness. |
| `/subagents-models` | Bản đồ model/thinking của subagents | Xem agent nào inherit model parent, agent nào override. |
| `/subagents` | Catalog/admin agents | Xem builtin agents và `company-*` agents. |
| `/subagents-fleet` | Dashboard đội child sessions | Follow background/parallel runs, xem active/done/result. |
| `/subagent-cost` | Token/cost subagents | Xem usage của child runs nếu package/provider expose stats. |
| `/run` | Chạy một agent | Dùng cho scout/planner/worker/reviewer riêng context. |
| `/parallel` | Chạy nhiều agent độc lập | Tốt cho read-only scout/review/test-gap analysis. |
| `/chain` | Chạy tuần tự | Output agent trước làm input agent sau qua `{previous}`. |

Nếu cần bản tổng hợp cho team mới:

```text
/company-commands subagents
```

## Gọi subagent tự nhiên

Không bắt buộc nhớ exact tool call. Có thể prompt tự nhiên:

```text
Use scout to map the auth flow, then summarize likely change targets.
Ask oracle to challenge this plan before we edit code.
Use reviewer to review the current diff for correctness and tests.
Run parallel reviewers: correctness, tests, and unnecessary complexity.
Have worker implement this approved plan, then run reviewer.
```

Với workflow platform, còn có thể chỉ gọi:

```text
/task Implement <task lớn>.
```

Parent agent sẽ tự quyết định:

- không spawn nếu task nhỏ;
- spawn `company-scout` nếu cần map source/spec;
- spawn `company-planner` nếu cần plan medium/high-risk;
- spawn `company-reviewer` trước final nếu diff không nhỏ;
- ghi trong final `Subagents: used/not used and why`.

## Gọi bằng slash command

Single agent:

```text
/run scout "Map the auth flow and identify entry points."
/run company-scout "Map FE routes related to listing search. Read-only."
/run company-planner "Create implementation plan from context.md."
/run company-worker "Implement the approved plan. Do not touch backend."
/run company-reviewer "Review current diff against the task and verify evidence."
/run company-oracle "Challenge this architecture choice before implementation."
```

Parallel:

```text
/parallel company-reviewer "Review correctness" -> company-reviewer "Review tests" -> company-reviewer "Review scope drift"
```

Chain:

```text
/chain company-scout "Scout the target area" -> company-planner "Plan from {previous}" -> company-worker "Implement from {previous}" -> company-reviewer "Review the implementation"
```

Background:

```text
/run company-scout "Map this module" --bg
/subagents-fleet
```

## Gọi bằng tool syntax

Khi muốn chính xác:

```text
subagent({ agent: "company-scout", task: "Map the auth flow. Read-only.", context: "fresh" })
```

Background:

```text
subagent({ agent: "company-reviewer", task: "Review current diff", async: true })
subagent({ action: "status" })
```

Status/control:

```text
subagent({ action: "status" })
subagent({ action: "status", id: "<run-id>", view: "transcript" })
subagent({ action: "steer", id: "<run-id>", message: "Focus only on tests." })
subagent({ action: "stop", id: "<run-id>" })
subagent({ action: "resume", id: "<run-id>", message: "Continue after this clarification." })
```

## Company subagents

Platform package exposes these package-level agents:

| Agent | Role | Write? |
|---|---|---|
| `company-scout` | bounded repo mapping | no |
| `company-planner` | implementation plan + verify gates | no |
| `company-worker` | single-writer implementation | yes |
| `company-reviewer` | review diff/policy/tests/scope | review-first, edit only if asked |
| `company-oracle` | second opinion/risk challenge | no |

Default rule:

- Use `company-scout` before touching unfamiliar code.
- Use `company-planner` before medium/high-risk changes.
- Use `company-worker` only for approved, bounded write tasks.
- Use `company-reviewer` before final handoff.
- Use `company-oracle` when architecture/product/risk is uncertain.

## Worktree isolation

Parallel implementation writers can clobber each other in one checkout. Only use `worktree: true` when:

- current repo is a Git repo;
- working tree is clean;
- write sets do not overlap;
- parent will review/merge outputs.

Example:

```text
subagent({
  tasks: [
    { agent: "company-worker", task: "Implement feature A" },
    { agent: "company-worker", task: "Implement feature B" }
  ],
  worktree: true
})
```

For normal solo/internal workflow, prefer one `company-worker` plus parallel read-only reviewers.

## Cost/token controls

Use:

```text
/subagent-cost
/company-usage
/session
```

Recommended token policy:

- default `safe` preset;
- do not set `asyncByDefault` unless anh intentionally wants background-heavy workflow;
- one writer at a time;
- parallel reviewers/scouts are OK;
- use `company-scout`/`company-planner` to compress context before handing off to `company-worker`;
- run `/subagents-fleet` to inspect background runs instead of asking parent model to recall everything.

## Nguồn

- Pi usage docs: https://pi.dev/docs/latest/usage
- Pi SDK docs: https://pi.dev/docs/latest/sdk
- pi-subagents package: https://pi.dev/packages/pi-subagents
- pi-subagents GitHub: https://github.com/nicobailon/pi-subagents
