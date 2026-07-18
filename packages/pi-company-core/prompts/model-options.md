---
description: Recommend provider/model/thinking options for the current task
argument-hint: "[task type, budget, or provider preference]"
---

Recommend Pi provider/model/thinking options for:

```text
$ARGUMENTS
```

Mandatory flow:

1. Call `company_context`.
2. Call `company_usage_snapshot` if the user asks about current model/context/cost.
3. If the user needs available model versions, recommend `/model` in TUI or `pi --list-models` from terminal.
4. Include both OpenAI Codex and Claude/Anthropic options unless the user explicitly restricts provider.
5. Explain thinking levels as task effort, not as quality guarantee.
6. Do not claim token/cost savings without benchmark evidence.

Recommended option matrix:

| Preset | OpenAI Codex | Claude/Anthropic | Use when |
|---|---|---|---|
| Fast scout | `openai-codex/gpt-5.4-mini:low` | `anthropic/claude-haiku-4-5:low` | quick reads, simple Q&A |
| Balanced implement | `openai-codex/gpt-5.5:medium` | `anthropic/claude-sonnet-5:medium` | normal source tasks |
| Hard implement | `openai-codex/gpt-5.5:xhigh` | `anthropic/claude-sonnet-5:xhigh` | multi-file/debug/contract mapping |
| Strategic/deep | `openai-codex/gpt-5.6-sol:xhigh` | `anthropic/claude-opus-4-8:max` | architecture, migration, high-risk review |
| Huge-context scout | `openai-codex/gpt-5.6-terra:xhigh` | `anthropic/claude-fable-5:max` | large repo/docs synthesis |

Output:

- Current model/context if available.
- Recommended primary option.
- Claude alternative.
- Codex alternative.
- Fast/cheap option.
- Deep/high-risk option.
- Exact command examples.
