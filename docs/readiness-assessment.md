# Readiness assessment

## Kết luận

`pi-company-platform` hiện đủ để:

- cài Pi global
- dùng provider OAuth trong Pi
- dùng global package core
- link project adapter
- chạy read-only/guarded pilot
- giảm noise bằng `--no-approve` + `PI_COMPANY_PROFILE`
- chạy source task nhỏ với runtime task/context/verify/trace record
- kiểm tra exec/context/tool/task gate bằng các runtime tools `company_*`
- ghi quality benchmark provider and model bằng script chuẩn hóa

Chưa đủ để áp dụng mặc định cho mọi high-risk task nếu chưa có benchmark project-specific và chưa xác nhận hard final hook/sandbox/network/env ở runtime Pi.

## Gap list

| Gap | Mức độ | Ảnh hưởng | Fix |
|---|---|---|---|
| Final assistant hard stop hook chưa được chứng minh | P3 | `company_trace_record` có gate, nhưng assistant vẫn có thể nói DONE nếu không follow prompt/API chưa có stop hook | Test Pi final hook hoặc giữ `company_task_gate_check` bắt buộc. |
| Chưa có lock/GC cho task state | P3 | Nhiều session cùng sửa task có thể ghi đè | File lock + cleanup giống todo pattern. |
| Tool registry mặc định còn advisory | P3 | Có thể warn nhưng chưa block mọi tool lạ | Bật `toolRegistry=enforce` sau khi map tool names ổn định. |
| Quality benchmark mới có recorder, chưa có số liệu | P3 | Chưa chứng minh tiết kiệm token/chất lượng | Chạy các approved surfaces/models trên scenario thật. |
| Chưa có package security review | P3 | Third-party package có full system access | Allowlist + source review. |
| Chưa có subagent/worktree isolation | P3 | Task lớn dễ overlap write set | Herdr/worktree/subagent policy. |
| Chưa có sandbox/env/network layer riêng nếu Pi không cung cấp | P3 | Guard chưa thay thế process/filesystem/network isolation ngoài runtime | Container/VM hoặc Pi sandbox validation. |

## Maturity gates

| Gate | Required proof |
|---|---|
| G0 install | `pi --version`, `pi list`, core package installed. |
| G1 profile | `profile-doctor.sh <project>` passes. |
| G2 lean read-only | `pi --no-approve --tools read,grep,find,ls` completes with files-read report. |
| G3 guarded write | protected path write is blocked in a sandbox test. |
| G4 verify | task prompt produces command output evidence before final. |
| G5 runtime policy | exec/context/tool/task gate checks pass. |
| G6 benchmark | same task compared across approved surfaces/models for quality/token/cost. |

## Decision

Trạng thái hiện tại: P3 after runtime policy exec/context/tool/final gate modules.

Quyền dùng khuyến nghị:

- Project mới: OK dùng Pi làm primary nếu task nhỏ/vừa và verify rõ.
- Project high-risk: dùng Pi guarded, bật `execPolicy=enforce`, cân nhắc `finalGate=enforce`, vẫn cần human gate.
- Team company: có thể pilot public/internal sau khi chạy `team-doctor --strict-share`; claim token/cost phải chờ benchmark G6.
