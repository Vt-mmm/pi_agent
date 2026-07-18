# Codex parity baseline for Pi Agent Platform

## Mục tiêu

`v0.3.5` không cố copy OpenAI Codex. Mục tiêu là học các runtime invariant tốt của Codex và triển khai clean-room vào Pi package để dùng được cho solo/internal/team:

1. Exec policy
2. Context budget
3. Tool registry
4. Final task gate
5. Integration/local verification
6. Benchmark parity

Trạng thái sau `v0.3.5`: **P3-baseline**. Tức là platform đã có module runtime để kiểm soát task tốt hơn P2, nhưng số liệu Pi vs Codex vs Claude vẫn phải chạy theo project/model thật trước khi tuyên bố token/cost reduction.

## 1. Exec policy

Tool:

```text
company_exec_policy_check
```

Runtime hook:

- intercept `bash`;
- split command thành shell segments ở mức an toàn cơ bản;
- parse words để detect prefix;
- block legacy destructive patterns;
- apply policy rules `allow | prompt | forbid`;
- cảnh báo broad approval prefix kiểu `bash`, `python`, `node`, `git`, `sudo`.

Config nằm ở:

```text
packages/pi-company-core/policies/base-policy.json
```

Mục tiêu không phải cấm mọi command mạnh, mà là không cho agent tự ý chạy lệnh có rủi ro cao mà không qua policy/human gate.

## 2. Context budget

Tool:

```text
company_context_budget
```

Runtime hook:

- `company_context_record` fail nếu manifest vượt số lượng file;
- fail nếu context file vượt `maxContextFileChars` khi `contextBudget=enforce`;
- warn với fragment lớn hơn `warnFragmentChars`.

Default:

```json
{
  "maxContextFileChars": 50000,
  "maxMemoryFileChars": 20000,
  "maxManifestFiles": 80,
  "warnFragmentChars": 4000
}
```

Đây là phiên bản Pi của nguyên tắc Codex: mọi model-visible/context item phải bounded và có hard cap.

## 3. Tool registry

Tool:

```text
company_tool_policy_check
```

Runtime hook:

- mọi tool call đi qua `evaluateToolPolicy`;
- `company_*` tools luôn allowed;
- tools có thể map sang capability như `filesystem-readonly`, `filesystem-write`, `shell`, `github`, `browser`;
- default đang là `advisory` để không phá Pi runtime khi tool names khác giữa version/provider;
- project có thể bật `toolRegistry=enforce`.

Profile capability ví dụ:

```json
{
  "mcpCapabilities": [
    "filesystem-readonly",
    "filesystem-write",
    "shell",
    "github",
    "browser",
    "memory"
  ]
}
```

## 4. Final task gate

Tool:

```text
company_task_gate_check
```

Runtime hook:

- `company_trace_record` kiểm tra gate khi outcome là `completed`;
- nếu profile đặt `finalGate=enforce`, completion bị block khi thiếu context manifest, verify evidence, passing verify, hoặc trace.

Default project profile đang bật `finalGate=enforce` cho phần Pi có thể chặn ngay: `company_trace_record` sẽ không cho ghi `completed` nếu thiếu context/verify/pass trace. Agent vẫn phải gọi `company_task_gate_check` trước final. Phần chưa claim là hard assistant stop-hook ở đúng thời điểm phát câu trả lời cuối nếu Pi API chưa expose hook đó.

## 5. Integration/local verification

Local verification bắt buộc:

```bash
bash scripts/verify-local.sh
bash scripts/team-doctor.sh . --strict-share
pi list --approve
```

`verify-local.sh` kiểm tra:

- package manifest;
- JSON parse;
- required docs/scripts/prompts;
- profile doctor;
- team doctor;
- TypeScript syntax for extension;
- presence of v0.3 runtime tools.

Next step để mạnh hơn nữa: thêm disposable fixture project tests chạy Pi tool-call lifecycle thật khi Pi SDK hỗ trợ stable test harness.

## 6. Benchmark parity

Script:

```bash
bash scripts/parity-benchmark.sh <project-path> --init
bash scripts/parity-benchmark.sh <project-path> --record \
  --scenario bounded-source-fix \
  --agent pi \
  --result pass \
  --tokens 12345 \
  --cost 0.12 \
  --verify "npm test" \
  --notes "verify passed; one manual correction"
```

Output:

```text
<project>/.pi/benchmarks/parity-scenarios.md
<project>/.pi/benchmarks/parity-runs.jsonl
```

Chỉ claim “Pi tiết kiệm token/cost” khi cùng scenario được chạy qua Pi, Codex, Claude với:

- cùng task prompt/spec;
- cùng acceptance criteria;
- verify command rõ;
- ghi token/cost/duration;
- ghi số vòng sửa lại và quality notes.

## Runtime policy trong profile

Project có thể override:

```json
{
  "runtimePolicy": {
    "execPolicy": "enforce",
    "contextBudget": "enforce",
    "toolRegistry": "advisory",
    "finalGate": "enforce"
  }
}
```

Mode:

| Mode | Ý nghĩa |
|---|---|
| `off` | Không áp dụng module policy đó. |
| `advisory` | Tool trả warning/check result nhưng không block mọi thứ. |
| `enforce` | Runtime hook/tool sẽ block khi vi phạm. |

## Khuyến nghị dùng thật

Solo/internal ambitious setup nên dùng:

1. `execPolicy=enforce`
2. `contextBudget=enforce`
3. `toolRegistry=advisory` trong 1-2 tuần đầu, sau đó nâng profile ổn định lên `enforce`
4. `finalGate=enforce` để block `company_trace_record completed` khi thiếu proof; nếu Pi runtime sau này có final/stop hook, nối gate này vào hook đó

## Điểm còn cần nâng tiếp sau P3-baseline

- Real final assistant stop-hook hard block nếu Pi extension API expose.
- Disposable integration test chạy qua Pi runtime thật, không chỉ static/local checks.
- Network/env sandbox layer tương đương Codex nếu Pi không cung cấp đủ isolation.
- Tool name discovery tự động từ Pi/MCP để giảm manual registry.
