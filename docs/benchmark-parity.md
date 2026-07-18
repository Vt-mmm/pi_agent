# Benchmark parity guide

## Vì sao cần benchmark

Không thể kết luận Pi tiết kiệm 50% token chỉ vì đổi CLI. Token giảm khi:

- project context đã được onboard;
- profile giới hạn đúng scope;
- memory explicit giảm scout lặp;
- reference repo cache tránh đọc tràn;
- task gate bắt verify/trace;
- tool policy chặn vòng lặp sai.

Benchmark là bằng chứng để quyết định dùng Pi/Codex/Claude cho từng loại task.

## Ba scenario mặc định

Khởi tạo:

```bash
bash scripts/parity-benchmark.sh /path/to/project --init
```

Script tạo:

```text
.pi/benchmarks/parity-scenarios.md
```

Scenario mặc định:

1. `read-only-scout`
2. `bounded-source-fix`
3. `be-readonly-to-fe`

## Ghi một lần chạy

```bash
bash scripts/parity-benchmark.sh /path/to/project --record \
  --scenario read-only-scout \
  --agent pi \
  --result pass \
  --tokens 8200 \
  --duration 540 \
  --notes "good plan, no edits"
```

Output:

```text
.pi/benchmarks/parity-runs.jsonl
```

## Tiêu chí so sánh

| Metric | Ý nghĩa |
|---|---|
| `result` | pass/fail/partial theo verify và acceptance criteria. |
| `tokens` | Tổng token agent/provider báo. |
| `cost` | Cost nếu provider/CLI báo được. |
| `durationSeconds` | Thời gian wall-clock. |
| quality notes | Số lần sửa lại, hallucination, missing context, wrong file, verify failure. |

## Quy tắc claim

Chỉ claim một setup tốt hơn CLI khác khi:

- cùng task/spec;
- cùng repo state;
- cùng verify command;
- ít nhất 3 lần chạy hoặc 3 scenario khác nhau;
- pass rate không thấp hơn baseline;
- token/cost giảm mà không tăng manual rework.
