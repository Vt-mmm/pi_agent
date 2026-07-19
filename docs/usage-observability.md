# Usage observability

Mục tiêu: biết Pi session đang tiêu hao token/context/cost như nào mà không phải hỏi model bằng ngôn ngữ tự nhiên.

## Trong Pi TUI

Pi có sẵn footer hiển thị token/cache usage, cost, context usage, model hiện tại. Khi cần chi tiết hơn, chạy:

```text
/session
```

Company package thêm command:

```text
/company-usage
```

Agent cũng có thể gọi tool:

```text
company_usage_snapshot
```

`/company-usage` hiển thị:

- session file;
- session id/name;
- cwd;
- model;
- live context usage hiện tại;
- active branch entries / total entries;
- lệnh để lấy exact token/cost totals từ terminal khác.

Giới hạn kỹ thuật: extension command context expose `ctx.getContextUsage()`, phù hợp để biết context window đang dùng bao nhiêu. Exact billed totals như `input`, `output`, `cacheRead`, `cacheWrite`, `cost` là API của Pi `/session` và RPC `get_session_stats`.

## Từ terminal khác

Nếu đang có một Pi session chạy ở project khác, mở terminal mới:

```bash
pi-company-usage /path/to/project
```

Hoặc dùng script trực tiếp:

```bash
bash scripts/pi-session-stats.sh /path/to/project
```

Script sẽ:

1. tìm session `.jsonl` mới nhất có header `cwd` khớp project path;
2. gọi Pi RPC `get_session_stats`;
3. in JSON gồm messages, token totals, cost và context usage.

Ví dụ output:

```json
{
  "tokens": {
    "input": 121095,
    "output": 8088,
    "cacheRead": 2023936,
    "cacheWrite": 0,
    "total": 2153119
  },
  "cost": 1.860083,
  "contextUsage": {
    "tokens": 102996,
    "contextWindow": 272000,
    "percent": 37.866176470588236
  }
}
```

## Cách đọc số

| Field | Ý nghĩa |
|---|---|
| `input` | Token input thật gửi vào model. |
| `output` | Token model sinh ra. |
| `cacheRead` | Token đọc từ provider prompt cache. Số này có thể rất lớn nhưng không tương đương fresh input cost. |
| `cacheWrite` | Token ghi vào cache. |
| `total` | Tổng theo Pi stats. |
| `cost` | Cost Pi tính theo pricing metadata của model/provider. |
| `contextUsage.tokens` | Context window hiện đang bị chiếm bao nhiêu token. |
| `contextUsage.percent` | Phần trăm context window hiện tại. |

## Khi nào cần compact

Xem `contextUsage.percent`:

- `< 50%`: bình thường.
- `50–75%`: bắt đầu tránh đọc file lớn không cần thiết.
- `> 75%`: cân nhắc `/compact` trước task dài tiếp theo.
- Sau compaction, `contextUsage.tokens` có thể là `null` cho đến khi có assistant response mới.

## Khi nào ghi benchmark

Sau một task cần so sánh workflow/model bằng số liệu:

```bash
bash scripts/quality-benchmark.sh /path/to/project --record \
  --scenario bounded-source-fix \
  --surface pi \
  --result pass \
  --tokens <total-from-pi-company-usage> \
  --cost <cost-from-pi-company-usage> \
  --verify "<verify-command>"
```

Không dùng ước lượng ký tự để claim tiết kiệm token. Dùng `/session`, RPC `get_session_stats`, hoặc `pi-company-usage`.
