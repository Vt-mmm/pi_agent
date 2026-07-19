# Runtime quality baseline

## Mục tiêu

`v0.3.13` định nghĩa bộ kiểm soát runtime để Pi Agent Platform có thể chạy task một cách có kỷ luật cho solo, internal team, và public package.

Các module chính:

1. Exec policy
2. Context budget
3. Tool registry
4. Final task gate
5. Local verification
6. Quality benchmark

Trạng thái hiện tại: platform đã có runtime modules đủ cho guarded implementation task. Các tuyên bố về chất lượng, token, cost, hoặc tốc độ phải dựa trên benchmark theo project/model thật.

## 1. Exec policy

Tool:

```text
company_exec_policy_check
```

Runtime behavior:

- phân tích shell command trước khi chạy lệnh rủi ro;
- block destructive patterns;
- đệ quy vào shell wrapper phổ biến như `sudo`, `env`, `bash -c`, subshell, command substitution, và backtick;
- check `shellProtectedPaths` cho bash, mặc định bảo vệ `.git`, `auth.json`, `.env`, `.env.*`;
- cảnh báo broad command prefix như `bash`, `python`, `node`, `git`, `sudo`;
- áp dụng policy rule `allow | prompt | forbid`;
- ghi lý do để agent/human đánh giá trước khi tiếp tục.

Config:

```text
packages/pi-company-core/policies/base-policy.json
```

Mục tiêu không phải cấm mọi command mạnh hoặc thay thế sandbox OS. Đây là lớp phanh chống tai nạn: giảm rủi ro agent tự ý chạy lệnh có tác động cao, đọc secret, hoặc đụng protected path mà thiếu policy/human gate.

## 2. Context budget

Tool:

```text
company_context_budget
```

Runtime behavior:

- giới hạn số file trong context manifest;
- giới hạn kích thước file context;
- cảnh báo fragment lớn;
- buộc context phải có lý do đọc rõ ràng.

Default:

```json
{
  "maxContextFileChars": 50000,
  "maxMemoryFileChars": 20000,
  "maxManifestFiles": 80,
  "warnFragmentChars": 4000
}
```

Context nên được chọn theo profile/task, không đọc tràn toàn repo.

## 3. Tool registry

Tool:

```text
company_tool_policy_check
```

Runtime behavior:

- map tools sang capability như `filesystem-readonly`, `filesystem-write`, `shell`, `github`, `browser`;
- `company_*` tools luôn allowed;
- default `advisory` để không phá Pi runtime khi tool names thay đổi;
- project ổn định có thể nâng `toolRegistry=enforce`.

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

Runtime behavior:

- kiểm tra task contract;
- kiểm tra context manifest;
- kiểm tra verify evidence;
- yêu cầu passing verify khi task có source changes;
- block `company_trace_record completed` nếu final gate đang enforce và proof chưa đủ.

Agent vẫn phải gọi `company_task_gate_check` trước final handoff.

## 5. Local verification

Platform verification:

```bash
npm run typecheck
npm test
bash scripts/verify-local.sh
bash scripts/team-doctor.sh . --strict-share
pi list --approve
```

`verify-local.sh` kiểm tra:

- package manifests;
- JSON parse;
- required docs/scripts/prompts;
- protected-path, shell protected path, and exec-policy regression tests;
- profile doctor;
- team doctor;
- TypeScript syntax for extension;
- smoke test for runtime policy;
- public documentation wording guard.

## 6. Quality benchmark

Script:

```bash
bash scripts/quality-benchmark.sh <project-path> --init
bash scripts/quality-benchmark.sh <project-path> --record \
  --scenario bounded-source-fix \
  --surface pi \
  --result pass \
  --tokens 12345 \
  --cost 0.12 \
  --verify "npm test" \
  --notes "verify passed; no manual correction"
```

Output:

```text
<project>/.pi/benchmarks/quality-scenarios.md
<project>/.pi/benchmarks/quality-runs.jsonl
```

Chỉ claim chất lượng/token/cost khi cùng scenario có:

- cùng task prompt/spec;
- cùng acceptance criteria;
- verify command rõ;
- token/cost/duration được ghi lại;
- quality notes và số vòng sửa lại.

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
| `enforce` | Runtime hook/tool block khi vi phạm policy. |

## Khuyến nghị vận hành

Setup solo/internal nên bắt đầu với:

1. `execPolicy=enforce`
2. `contextBudget=enforce`
3. `toolRegistry=advisory` trong giai đoạn đầu, sau đó nâng lên `enforce` khi tool registry ổn định
4. `finalGate=enforce`

## Roadmap

- Hard final assistant stop-hook nếu Pi extension API expose stable hook.
- Disposable integration test chạy Pi runtime end-to-end.
- Optional process/filesystem/network sandbox ngoài Pi khi môi trường yêu cầu isolation mạnh.
- Auto-discovery tool names từ Pi/MCP để giảm registry thủ công.
