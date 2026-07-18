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
pi-company-models
pi-company-models --provider openai-codex
pi-company-models --provider anthropic
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

## Current latest-family catalog

Đừng giới hạn vào vài ví dụ. Sau `pi update --models`, kiểm tra catalog local bằng `pi-company-models`. Tại thời điểm `v0.3.4`, các family/presets chính cần nhớ:

### OpenAI Codex

| Model | Role gợi ý | Khi dùng |
|---|---|---|
| `openai-codex/gpt-5.3-codex-spark` | fast scout | hỏi nhanh, thao tác nhỏ, chi phí thấp |
| `openai-codex/gpt-5.4-mini` | fast/cheap | scout nhẹ, docs, simple fix |
| `openai-codex/gpt-5.4` | balanced | task bình thường |
| `openai-codex/gpt-5.5` | balanced/hard default | default mạnh cho implement |
| `openai-codex/gpt-5.6-luna` | focused hard | debug/review/test khó, cần reasoning sâu nhưng scope hẹp |
| `openai-codex/gpt-5.6-sol` | strategic/deep | architecture, migration, planning lớn |
| `openai-codex/gpt-5.6-terra` | huge-context scout | đọc nhiều docs/source, tổng hợp repo lớn |

### Claude / Anthropic

| Model | Role gợi ý | Khi dùng |
|---|---|---|
| `anthropic/claude-haiku-4-5` | fast/cheap | hỏi nhanh, docs/scout nhẹ |
| `anthropic/claude-sonnet-4-5` | balanced | task source bình thường |
| `anthropic/claude-sonnet-4-6` | balanced/deep | source task lớn hơn, max-capable |
| `anthropic/claude-sonnet-5` | balanced/hard default | Claude default mạnh cho implement |
| `anthropic/claude-opus-4-5` | deep | review/migration lớn |
| `anthropic/claude-opus-4-6` | deep/max | architecture/reasoning nặng |
| `anthropic/claude-opus-4-7` | deep/xhigh/max | high-risk/debug/architecture |
| `anthropic/claude-opus-4-8` | deep/xhigh/max | deep default nếu có quyền dùng |
| `anthropic/claude-fable-5` | huge-context/deep | repo/docs rất lớn, synthesis dài |

Pi catalog có thể có thêm dated variants như `*-2025xxxx`. Dùng alias latest-family ở trên cho team flow, dùng dated version khi cần reproducibility.

## Recommended presets

| Preset | OpenAI Codex example | Claude/Anthropic example | Khi dùng |
|---|---|---|---|
| Fast scout | `openai-codex/gpt-5.4-mini:low` | `anthropic/claude-haiku-4-5:low` | đọc nhanh, hỏi đáp, grep/scout nhẹ |
| Balanced implement | `openai-codex/gpt-5.5:medium` | `anthropic/claude-sonnet-5:medium` | task source bình thường |
| Hard implement | `openai-codex/gpt-5.6-luna:xhigh` hoặc `openai-codex/gpt-5.5:xhigh` | `anthropic/claude-sonnet-5:xhigh` | task nhiều file, contract mapping, debug khó |
| Strategic/deep | `openai-codex/gpt-5.6-sol:xhigh` | `anthropic/claude-opus-4-7:max` hoặc `anthropic/claude-opus-4-8:max` | architecture, migration lớn, high-risk review |
| Huge-context scout | `openai-codex/gpt-5.6-terra:xhigh` | `anthropic/claude-fable-5:max` | đọc nhiều docs/context, tổng hợp repo lớn |

Tên model có thể đổi theo Pi model catalog. Khi không chắc, ưu tiên `/model` hoặc `pi --list-models`.

## Practical routing

Solo/internal default nên bắt đầu:

```bash
pi --model openai-codex/gpt-5.5:xhigh
pi --model openai-codex/gpt-5.6-sol:xhigh
```

Khi muốn so sánh Claude:

```bash
pi --model anthropic/claude-sonnet-5:xhigh
pi --model anthropic/claude-opus-4-7:max
pi --model anthropic/claude-fable-5:max
```

Khi muốn tiết kiệm token/cost:

```bash
pi --model openai-codex/gpt-5.4-mini:low
pi --model anthropic/claude-haiku-4-5:low
```

Khi task bị fail do reasoning/architecture:

```bash
pi --model openai-codex/gpt-5.6-luna:xhigh
pi --model openai-codex/gpt-5.6-sol:xhigh
pi --model anthropic/claude-opus-4-7:max
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
