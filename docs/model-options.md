# Model options: Codex + Claude

Pi Company Platform không khóa vào một provider. OpenAI Codex và Claude/Anthropic đều là first-class option; chọn model theo loại task, budget và yêu cầu reasoning.

## Kiểm tra model hiện có

Trong Pi:

```text
/login
/model
/settings
/scoped-models
```

Từ terminal:

```bash
pi --list-models
pi --list-models openai-codex
pi --list-models claude
pi --list-models anthropic
```

Lưu ý: `--list-models` chỉ hiện model mà Pi xem là available với credential/provider hiện tại. Nếu chưa login Anthropic, Claude có thể chưa hiện dù model catalog local có metadata.

## Thinking levels

Pi hỗ trợ:

```text
off, minimal, low, medium, high, xhigh, max
```

Không phải model nào cũng hỗ trợ mọi level. Pi sẽ clamp theo capability của model. Cách chọn:

```bash
pi --model openai-codex/gpt-5.5:high
pi --model anthropic/claude-sonnet-5:xhigh
pi --thinking medium
```

Trong TUI:

```text
Shift+Tab   # cycle thinking level
Ctrl+L      # model selector
Ctrl+P      # cycle scoped models
```

## Recommended presets

| Preset | OpenAI Codex example | Claude/Anthropic example | Khi dùng |
|---|---|---|---|
| Fast scout | `openai-codex/gpt-5.4-mini:low` | `anthropic/claude-haiku-4-5:low` | đọc nhanh, hỏi đáp, grep/scout nhẹ |
| Balanced implement | `openai-codex/gpt-5.5:medium` | `anthropic/claude-sonnet-5:medium` | task source bình thường |
| Hard implement | `openai-codex/gpt-5.5:xhigh` | `anthropic/claude-sonnet-5:xhigh` | task nhiều file, contract mapping, debug khó |
| Strategic/deep | `openai-codex/gpt-5.6-sol:xhigh` | `anthropic/claude-opus-4-8:max` | architecture, migration lớn, high-risk review |
| Huge-context scout | `openai-codex/gpt-5.6-terra:xhigh` | `anthropic/claude-fable-5:max` | đọc nhiều docs/context, tổng hợp repo lớn |

Tên model có thể đổi theo Pi model catalog. Khi không chắc, ưu tiên `/model` hoặc `pi --list-models`.

## Practical routing

Solo/internal default nên bắt đầu:

```bash
pi --model openai-codex/gpt-5.5:xhigh
```

Khi muốn so sánh Claude:

```bash
pi --model anthropic/claude-sonnet-5:xhigh
```

Khi muốn tiết kiệm token/cost:

```bash
pi --model openai-codex/gpt-5.4-mini:low
pi --model anthropic/claude-haiku-4-5:low
```

Khi task bị fail do reasoning/architecture:

```bash
pi --model openai-codex/gpt-5.6-sol:xhigh
pi --model anthropic/claude-opus-4-8:max
```

## Benchmark rule

Không claim “Pi + provider X tiết kiệm hơn provider Y” bằng cảm giác. Chạy cùng scenario rồi ghi bằng:

```bash
pi-company-usage /path/to/project
bash scripts/parity-benchmark.sh /path/to/project --record \
  --scenario bounded-source-fix \
  --agent pi \
  --result pass \
  --tokens <total> \
  --cost <cost> \
  --verify "<verify-command>" \
  --notes "provider/model/thinking=<provider/model:thinking>"
```

So sánh tối thiểu:

- Pi + Codex fast/balanced/deep;
- Pi + Claude fast/balanced/deep;
- Codex CLI/Claude CLI nếu team vẫn dùng baseline đó.
