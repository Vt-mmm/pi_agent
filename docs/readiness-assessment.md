# Readiness assessment

## Kết luận

`pi-company-platform` hiện đủ để:

- cài Pi global
- dùng OAuth Codex trong Pi
- dùng global package core
- link project adapter
- chạy read-only/guarded pilot
- giảm noise bằng `--no-approve` + `PI_COMPANY_PROFILE`
- chạy source task nhỏ với runtime task/context/verify/trace record

Chưa đủ để tuyên bố thay thế Codex/Claude CLI cho implementation task phức tạp hoặc high-risk.

## Gap list

| Gap | Mức độ | Ảnh hưởng | Fix |
|---|---|---|---|
| Final DONE gate chưa hard enforce | P2 | Agent vẫn có thể trả DONE nếu không tự gọi verify/trace tool | Thêm turn_end/before final checker nếu Pi API cho phép. |
| Chưa có lock/GC cho task state | P2 | Nhiều session cùng sửa task có thể ghi đè | File lock + cleanup giống todo pattern. |
| Chưa enforce MCP capability | P2 | Agent có thể dùng tool không đăng ký | Tool registry gate. |
| Chưa có benchmark parity | P2 | Không chứng minh tiết kiệm token/quality parity | Pi vs Codex vs Claude benchmark. |
| Chưa có package security review | P3 | Third-party package có full system access | Allowlist + source review. |
| Chưa có subagent/worktree isolation | P3 | Task lớn dễ overlap write set | Herdr/worktree/subagent policy. |

## Maturity gates

| Gate | Required proof |
|---|---|
| G0 install | `pi --version`, `pi list`, core package installed. |
| G1 profile | `profile-doctor.sh <project>` passes. |
| G2 lean read-only | `pi --no-approve --tools read,grep,find,ls` completes with files-read report. |
| G3 guarded write | protected path write is blocked in a sandbox test. |
| G4 verify | task prompt produces command output evidence before final. |
| G5 parity | same task compared against Codex/Claude baseline for quality/token/cost. |

## Decision

Trạng thái hiện tại: P2-alpha after runtime task tools + agent-stuff pattern adoption.

Quyền dùng khuyến nghị:

- Project mới: OK dùng Pi làm primary nếu task nhỏ/vừa và verify rõ.
- Project high-risk: dùng Pi lean/read-only hoặc guarded small task; baseline ship vẫn nên giữ ở CLI/workflow đã chứng minh cho đến khi G4/G5 pass.
- Team company: chưa publish rộng cho đến khi package security + parity benchmark pass.
