# Research Report: `mitsuhiko/agent-stuff` áp dụng cho Pi Company Platform

Timestamp: 2026-07-18 16:00 Asia/Ho_Chi_Minh

## Executive summary

`mitsuhiko/agent-stuff` là một Pi package cá nhân của Armin Ronacher, publish dưới tên `mitsupi`. Repo này không phải “framework enterprise” để bê nguyên vào công ty. Giá trị chính nằm ở cách tổ chức Pi package: tách `extensions`, `skills`, `prompts`, `themes`, và các helper utility thành một bundle dùng lại qua nhiều project.

Kết luận áp dụng: Pi Agent Platform nên học pattern vận hành, không copy workflow cá nhân. Các phần đã áp dụng ngay: prompt `/discuss`, cache repo tham chiếu kiểu librarian, project profile, task trace ghi cả local file và Pi session custom entry, review guideline template. Các phần chưa nên bật ngay: session control đa Pi, unified edit replacement, review loop auto-fix, session cost TUI; những phần này cần test sâu vì có thể thay đổi behavior tool-call hoặc workflow tương tác.

## Research methodology

- Sources consulted: GitHub repo, README, package manifest, prompt command, extension source, skill source.
- Date checked: 2026-07-18.
- Scope: kiến trúc Pi package và pattern có thể migrate vào `pi-company-platform`.
- Boundary: không copy code từ `agent-stuff`; chỉ học design pattern và viết lại clean-room.

## Findings

### 1. Package manifest là mô hình đúng

Repo dùng `package.json` để khai báo Pi resources:

- `extensions`: TypeScript extension.
- `skills`: folder skill.
- `prompts`: slash prompt commands.
- `themes`: giao diện.

Pi Company Platform đã đi đúng hướng vì `@company/pi-company-core` cũng export `extensions`, `skills`, `prompts`. Thiếu trước đó không nằm ở structure, mà nằm ở operational patterns: task state, review loop, repo reference cache, usage benchmark.

### 2. `/discuss` là prompt rất đáng lấy

Pattern chính: trước khi implement, agent inspect project trước, chỉ hỏi câu hỏi thật sự còn thiếu, mỗi vòng ngắn, dừng khi đủ plan. Đây là cách giảm token tốt hơn việc nhồi prompt dài.

Áp dụng: thêm prompt `prompts/discuss.md` vào core package. Prompt này dùng cho task mơ hồ, requirement chưa rõ, hoặc trước khi viết plan high-risk.

### 3. State nên sống trong session log khi có thể

`goal.ts` cho thấy pattern tốt: state của objective không cần DB riêng; có thể append custom session entry, sau đó reconstruct theo branch/session. Đây là design phù hợp với Pi vì session tree/fork là native concept.

Áp dụng: `company-guard.ts` giờ vẫn ghi `.pi/company-state/` để dễ audit bằng file, nhưng đồng thời append `company-task-trace` vào Pi session log. Cách này tránh lệ thuộc hoàn toàn vào local DB và giúp resume/debug trong session.

### 4. Todo/task file-backed vẫn hữu ích

`todos.ts` dùng `.pi/todos` hoặc env override, mỗi todo là markdown file có metadata JSON. Đây là model đơn giản, dễ inspect, không cần SQLite.

Áp dụng: Pi Company Platform giữ task contract dạng JSON trong `.pi/company-state/tasks/`. Chưa cần todo TUI; khi team dùng rộng mới thêm lock/GC giống pattern todo.

### 5. Review nên có guideline local

`review.ts` hỗ trợ review nhiều mode và đọc guideline project-local nếu có. Đây là pattern đúng cho công ty: review không nên chỉ là “hãy review code”, mà phải có checklist domain.

Áp dụng: thêm `templates/project/REVIEW_GUIDELINES.md`. Project nào link platform sẽ có nơi ghi review rule riêng.

### 6. Tool wrapper là nơi tiết kiệm token và giảm lỗi

`uv.ts` thay bash tool bằng wrapper có policy cụ thể: inject PATH shim và block command sai workflow. Bài học không phải “phải dùng uv”, mà là: policy nên enforce ở tool layer, không chỉ prompt.

Áp dụng hiện tại: `company-guard.ts` đang hook `tool_call` để block destructive command/protected path. Roadmap tiếp theo là wrapper theo từng profile, ví dụ Python project bắt `uv`, FE project bắt package manager chuẩn, project có backend freeze thì chặn backend path ở profile.

### 7. Reference repo cache là pattern cần có

`librarian` cache remote repo dưới cache dir ổn định, refresh có throttle, và không edit trực tiếp cache. Đây là rất phù hợp với bài toán “tham khảo Codex CLI GitHub, agent-stuff, docs”.

Áp dụng: thêm skill `company-reference-repo` + script `checkout-reference-repo.sh`. Khi user đưa repo tham chiếu, Pi có thể cache rồi `rg` local, tránh clone lặp và giảm token vì agent chỉ đọc file cần thiết.

### 8. Session breakdown là benchmark layer, chưa phải P1

`session-breakdown.ts` phân tích token/model/cost theo session. Đây là phần cần có để trả lời câu hỏi “Pi tiết kiệm token hơn Codex/Claude thật không?”.

Chưa áp dụng runtime ngay. Cần bước riêng: benchmark cùng task trên Pi/Codex/Claude, log token, verify quality, so sánh diff/rework.

## Adopt / defer matrix

| Pattern từ `agent-stuff` | Áp dụng vào platform | Trạng thái |
|---|---|---|
| Pi package manifest exports | Core package layout | Đã có |
| `/discuss` planning interviewer | `prompts/discuss.md` | Đã thêm |
| Session custom entries | `company-task-trace` trong guard | Đã thêm |
| File-backed todos | `.pi/company-state/tasks/*.json` | Đã có, cần lock sau |
| Review guideline local | `templates/project/REVIEW_GUIDELINES.md` | Đã thêm |
| Librarian repo cache | `company-reference-repo` skill + script | Đã thêm |
| Bash/tool wrapper policy | Company guard, future profile wrapper | Một phần |
| Session usage breakdown | Token/cost benchmark recorder | P3-baseline script, TUI defer |
| Unified edit replacement | Safer edit tool | Defer |
| Session control sockets | Herdr/Pi orchestration | Defer |

## Token-saving reality check

Pi không tự động giảm 50% token chỉ vì đổi CLI. Token giảm khi:

- context được profile hóa, không auto ăn toàn bộ `.agents/skills`;
- prompt ngắn, đúng phase;
- repo tham chiếu được cache và đọc targeted;
- task contract ép scope/verify trước khi edit;
- tool policy chặn vòng lặp sai command;
- có benchmark để bắt hallucinated “done”.

Vì vậy, config “chuẩn” phải đo được bằng benchmark, không chỉ cảm giác. Pi Company Platform hiện đã có nền để benchmark nhưng chưa có số đo parity Pi vs Codex vs Claude.

## Implementation recommendations

1. Dùng `/discuss` cho task chưa rõ, không implement ngay.
2. Dùng `/task` cho task đã rõ scope và verify.
3. Khi tham khảo repo ngoài, dùng `company-reference-repo` để cache rồi đọc local.
4. Bắt buộc `company_task_start` → `company_context_record` → `company_verify_record` → `company_trace_record` cho source-changing task.
5. Dùng `scripts/parity-benchmark.sh` để ghi benchmark `Pi vs Codex vs Claude` trên 3 task mẫu:
   - read-only scout;
   - FE bugfix nhỏ;
   - FE task có e2e verify.

## References

- GitHub repo: https://github.com/mitsuhiko/agent-stuff
- Package manifest: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/package.json
- `/discuss`: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/commands/discuss.md
- Goal/session state extension: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/extensions/goal.ts
- Todo file-backed extension: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/extensions/todos.ts
- Review extension: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/extensions/review.ts
- Session usage breakdown: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/extensions/session-breakdown.ts
- Session control: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/extensions/control.ts
- Tool wrapper example: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/extensions/uv.ts
- Unified edit extension: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/extensions/unified-edit.ts
- Librarian skill: https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/skills/librarian/SKILL.md

## Unresolved questions

- Pi API surface for replacing built-in edit/bash should be tested in a disposable repo before company rollout.
- Need actual OAuth/runtime Pi session to verify extension behavior end-to-end.
- Need benchmark data before claiming token reduction vs Codex/Claude.
