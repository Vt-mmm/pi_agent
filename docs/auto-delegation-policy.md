# Auto-delegation policy

Mục tiêu: user không phải nhớ `/run`, `/parallel`, `/chain` cho workflow hằng ngày. Khi anh gõ `/task`, `/be-to-fe`, `/platform-migration`, `/plan`, hoặc `/review`, parent agent phải tự cân nhắc spawn subagents nếu việc đó giúp giảm nhiễu context, tăng tốc read-heavy work, hoặc tăng chất lượng review.

## Kết luận thực tế

Subagent không nên hiểu là “luôn tự sinh khi task lớn”. Hành vi đúng là:

1. Parent agent đánh giá task có phần việc độc lập không.
2. Nếu có và `pi-subagents`/subagent tool khả dụng, parent có thể tự spawn subagent.
3. Nếu không có tool/package, parent tiếp tục single-agent và ghi rõ `Subagents: unavailable/not used`.
4. User vẫn có thể gọi command trực tiếp khi muốn ép orchestration cụ thể.

Nếu bundled skill `pi-subagents` có trong skill list của parent, parent nên dùng skill đó cho orchestration patterns thay vì tự đoán syntax. Skill này là parent-only; child subagents không nhận nó.

## Khi nào parent nên tự spawn

Parent nên tự spawn subagents khi có ít nhất một điều kiện:

- cần scout nhiều vùng source độc lập;
- cần map BE contract read-only trong khi FE implementation là write target;
- cần đọc docs/reference repo và repo hiện tại song song;
- cần external research có nguồn dẫn, và `pi-web-access`/web tools đang available;
- cần tạo context handoff trước task lớn (`context-builder`);
- cần review nhiều góc độc lập: correctness, tests, security, scope drift;
- task có từ 3 touchpoint trở lên;
- task medium/high-risk nhưng có phần audit read-only trước khi edit;
- context có nguy cơ phình to nếu parent tự đọc toàn bộ log/spec/source.

## Khi nào không nên tự spawn

Không spawn nếu:

- task nhỏ, một file, verify đơn giản;
- requirement chưa rõ và cần hỏi user trước;
- chỉ có một write target nhỏ;
- subagent tool/package chưa available;
- repo dirty hoặc write set có nguy cơ overlap mà chưa phân tách được;
- task high-risk cần human gate trước khi edit;
- muốn spawn nhiều writer song song nhưng không có worktree isolation/approval.

## Default agent mapping

| Need | Agent | Mode |
|---|---|---|
| Map unfamiliar repo/module/spec | `company-scout` | read-only |
| Build implementation plan | `company-planner` | read-only |
| Implement approved bounded change | `company-worker` | single writer |
| Review current diff | `company-reviewer` | review-first |
| Challenge architecture/risk | `company-oracle` | read-only |
| External docs/web research | builtin `researcher` | read-only; requires web tools |
| Large context handoff | builtin `context-builder` or `company-scout` | writes handoff artifact only |

Default rule: parallel read-only is OK; parallel writers are not default.

## Workflow policy

### `/task`

Parent should:

1. load company context/profile/memory/project context;
2. decide whether subagents are useful;
3. if useful, spawn read-only scout/planner/reviewer before or after implementation;
4. keep implementation single-writer unless user explicitly approves otherwise;
5. summarize subagent outputs into task contract/context manifest/final response.

### `/be-to-fe`

Recommended auto-delegation:

- `company-scout`: map backend contract read-only;
- `company-scout`: map frontend touchpoints read-only;
- `company-planner`: produce FE implementation plan;
- parent or `company-worker`: implement FE only;
- `company-reviewer`: review diff and verify coverage.

### `/platform-migration`

Recommended auto-delegation:

- `company-scout`: inspect current platform source/docs;
- builtin `researcher`: inspect official docs/web evidence when `pi-web-access` is installed;
- builtin `context-builder`: create handoff context/meta-prompt for large migrations;
- `company-scout`: inspect official docs/reference repo targeted evidence;
- `company-planner`: produce migration matrix;
- parent or `company-worker`: implement bounded changes;
- `company-reviewer`: review docs/runtime parity.

### `/review`

Recommended auto-delegation:

- parallel `company-reviewer` for correctness;
- parallel `company-reviewer` for tests/verification;
- parallel `company-reviewer` for scope/protected-path drift;
- optional `company-oracle` for architecture/high-risk concerns.

If the user explicitly asks for a review loop, use upstream `/review-loop` or equivalent parent-controlled loop with max rounds. Do not blindly apply all reviewer suggestions.

## Prompt examples parent may use internally

Single scout:

```text
Use company-scout to map the target module read-only. Return files, ownership, invariants, and likely change points only.
```

Parallel scout:

```text
Run parallel company-scout agents: one maps backend contract read-only, one maps frontend touchpoints read-only. Wait for both and summarize the contract-to-FE map.
```

Parallel review:

```text
Run parallel company-reviewer agents for correctness, tests/verification, and scope/protected-path drift. Wait for all and summarize findings by severity.
```

Tool syntax fallback:

```text
subagent({ agent: "company-scout", task: "Map target area read-only. Return concise findings.", context: "fresh" })
```

## Reporting requirement

Final response should include one line:

```text
Subagents: <not used / unavailable / used: company-scout, company-reviewer>
```

If not used, give the reason briefly:

- `task was tiny`;
- `requirements unresolved`;
- `subagent tool unavailable`;
- `write set overlap risk`;
- `human gate required first`.

## Token rule

Subagents can reduce parent context pollution, but total token usage can increase because each child does its own model/tool work. Use them for parallelizable read-heavy work and review quality, not as a blanket token-saving switch.

## Upstream shortcuts worth using

| Shortcut | Use when |
|---|---|
| `/parallel-review` | Need distinct review angles; add `autofix` only when user permits fixes. |
| `/review-loop` | Need worker/reviewer/fix loop until clean or capped. |
| `/parallel-research` | Need external evidence + local code context. |
| `/parallel-context-build` | Need context/meta-prompt handoff before a large plan. |
| `/parallel-handoff-plan` | Need research + context-builder + implementation handoff. |
| `/gather-context-and-clarify` | Need scout/research first, then ask only meaningful questions. |
| `/parallel-cleanup` | Need post-implementation cleanup review. |

See `docs/pi-subagents-upstream-review.md`.

## Sources

- Pi pi-subagents package: https://pi.dev/packages/pi-subagents
- Codex subagents docs: https://learn.chatgpt.com/docs/agent-configuration/subagents
- Claude Code sub-agents docs: https://code.claude.com/docs/en/sub-agents
- Claude Agent SDK subagents docs: https://code.claude.com/docs/en/agent-sdk/subagents
