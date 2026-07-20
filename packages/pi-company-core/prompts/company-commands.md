---
description: Explain Pi Company Platform commands clearly in Vietnamese
argument-hint: "[command/topic/task]"
---

Explain the Pi Company Platform command surface for:

```text
$ARGUMENTS
```

Mandatory flow:

1. Call `company_context` if available.
2. If the current repository contains `docs/command-reference-vietnamese.md`, read it first and use it as the source of truth.
3. Distinguish clearly between:
   - terminal commands;
   - Pi slash commands;
   - Pi hotkeys;
   - exact tool syntax.
4. If the user asks about subagents, explain these terms in plain Vietnamese:
   - `/subagents-doctor` = health check;
   - `/subagents-models` = model/thinking routing map;
   - `/subagents-fleet` = dashboard of child agent runs;
   - `/run` = run one subagent;
   - `/parallel` = run independent agents concurrently;
   - `/chain` = run agents sequentially.
5. Explain when to use `company-scout`, `company-planner`, `company-worker`, `company-reviewer`, and `company-oracle`.
6. If a command might depend on package/provider availability, say so and tell the user to type `/` in Pi or run `pi list --approve`.
7. Explain context overflow prevention when relevant:
   - `/task-preflight` checks whether to proceed, compact, or fresh-session.
   - `/fresh-task`, `/fresh-scout`, and `/fresh-be-to-fe` open a new governed session and replay the compact workflow prompt.
   - `/scout` is the read-only audit/scout workflow.
8. If the user asks about screenshots/images, explain that local image paths pasted into chat are auto-attached as `[image1]` when supported and below size limits.
9. Do not claim token/cost savings unless benchmark evidence exists. Point to `/company-usage`, `/task-preflight`, `/subagent-cost`, and `pi-company-usage <project>`.

Output format:

- What to type.
- Where to type it.
- When to use it.
- What result to expect.
- Related command if the first one fails.
