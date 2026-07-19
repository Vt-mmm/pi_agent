# pi-subagents upstream review

Review date: 2026-07-19

Upstream inspected:

- GitHub: https://github.com/nicobailon/pi-subagents
- Version/tag observed locally: `v0.35.1`
- Commit observed locally: `d6e8005 chore: release v0.35.1`
- Package docs: https://pi.dev/packages/pi-subagents

## Kết luận

Đúng, `nicobailon/pi-subagents` là upstream extension chính mà platform mình dựa vào cho subagent runtime. Sau khi inspect lại, platform nên tận dụng thêm các phần sau:

1. natural-language delegation thay vì bắt user nhớ `/run`;
2. bundled parent skill `pi-subagents` để parent biết delegation patterns;
3. packaged prompt shortcuts cho review/research/context workflows;
4. native supervisor channel để child hỏi parent khi cần decision;
5. explicit safe runtime config cho wait/intercom/output/worktree/scheduled behavior;
6. optional `pi-web-access` để builtin `researcher` thật sự có web/search/fetch tools;
7. watchdog/profile/model-catalog commands là optional power tools, không bật mặc định.

## Điểm hay từ upstream

| Upstream feature | Ý nghĩa | Platform decision |
|---|---|---|
| Natural language delegation | User có thể nói “run parallel reviewers” thay vì nhớ slash command. | Đã đưa vào auto-delegation policy và workflow prompts. |
| Builtin agents | `scout`, `researcher`, `planner`, `worker`, `reviewer`, `context-builder`, `oracle`, `delegate`. | Company agents vẫn là default cho policy; builtin `researcher`/`context-builder` được dùng khi phù hợp. |
| Bundled `pi-subagents` skill | Parent orchestrator có hướng dẫn delegation/review-loop/intercom/safety. | Workflow prompts yêu cầu dùng skill này khi available. |
| Prompt shortcuts | `/parallel-review`, `/review-loop`, `/parallel-research`, `/parallel-context-build`, `/parallel-handoff-plan`, `/gather-context-and-clarify`, `/parallel-cleanup`. | Document rõ để team dùng khi muốn workflow cụ thể. |
| Native supervisor channel | Child dùng `contact_supervisor`; parent trả bằng `subagent_supervisor`. | Company worker/reviewer đã có `contact_supervisor`; docs bổ sung rule. |
| Watchdog | Opt-in adversarial review ở `agent_end`, model complementary. | Không bật mặc định; document lệnh bật/session/project. |
| Model profiles/catalog | Refresh/generate/check provider model profiles. | Document là advanced workflow cho team có nhiều provider/quota. |
| Output/read/schema controls | `output`, `outputMode=file-only`, `reads`, `outputSchema`, `acceptance`. | Document để giảm parent context và làm handoff chặt hơn. |
| Worktree isolation | Parallel writers có checkout riêng khi clean git repo. | Giữ non-default; chỉ dùng khi explicit approval/disjoint write sets. |
| Spawn budget/grant | Cap số child launches/session và grant thêm từ root. | `safe` preset giữ cap 32; docs bổ sung grant khi thật sự cần. |
| Scheduled runs | One-shot delayed subagent. | Explicit disabled trong config; chỉ dùng khi user yêu cầu monitor/wait. |

## Applied in platform

- `scripts/configure-subagents.sh`
  - explicit `waitTool.enabled: true`;
  - explicit `intercomBridge.mode: always`;
  - stable `defaultSessionDir`, `singleRunOutputBaseDir`, `worktreeBaseDir`;
  - `scheduledRuns.enabled: false`;
  - keep bounded `maxSubagentDepth`, spawn cap, and parallel concurrency.
- `scripts/setup.sh` / `scripts/install-global.sh`
  - optional `--with-web-access` installs `npm:pi-web-access` for builtin `researcher`.
- Workflow prompts:
  - `/task`, `/plan`, `/review`, `/be-to-fe`, `/platform-migration` now instruct parent to use the bundled `pi-subagents` skill if available.
  - Research/migration workflows can use `researcher` for external evidence and `context-builder` for stronger handoff context when available.
- Docs:
  - command reference now lists prompt shortcuts, watchdog/profile commands, supervisor control, output/fork/worktree options.

## Keep non-default

| Feature | Reason |
|---|---|
| Watchdog always-on | Extra model review can increase token/cost; should be session/project opt-in. |
| `asyncByDefault: true` | Convenient for background-heavy workflow but can surprise solo interactive work. |
| Scheduled subagents | Useful for monitoring, but unrelated to normal implementation and can surprise teams. |
| Parallel writers | Correct only with clean repo, worktree isolation, and disjoint write sets. |
| `researcher` without `pi-web-access` | Upstream researcher expects web tools; install optional package only when needed. |

## Recommended practical usage

Daily implementation:

```text
/task Implement <task>.
```

The parent should auto-delegate read-heavy scout/planner/reviewer work when useful.

Review until clean:

```text
/review-loop current diff max 3 rounds
```

Parallel review:

```text
/parallel-review current diff
/parallel-review current diff autofix
```

Research-heavy task:

```bash
pi install npm:pi-web-access
```

```text
/parallel-research Compare Pi subagents upstream patterns with our platform setup.
```

Context handoff before a large implementation:

```text
/parallel-context-build Build context for <large task>.
/parallel-handoff-plan Build implementation handoff plan for <large task>.
```

Watchdog for a high-risk session:

```text
/subagents-watchdog recommend-model
/subagents-watchdog session model recommended
/subagents-watchdog on
```

## Sources

- https://github.com/nicobailon/pi-subagents/blob/main/README.md
- https://github.com/nicobailon/pi-subagents/blob/main/CHANGELOG.md
- https://pi.dev/packages/pi-subagents
