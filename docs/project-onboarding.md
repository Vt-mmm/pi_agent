# Project onboarding snapshot

## Mục tiêu

Lần đầu gắn một project vào Pi Company Platform, không nên nhảy thẳng vào `/task`.

Luồng chuẩn là:

```bash
cd /path/to/project
pi
/login
<select provider/model>
/onboard-project
```

Sau khi `/onboard-project` chạy xong, project có file:

```text
.pi/company-profile.json
.pi/project-context.md
.pi/memory/memory_summary.md
.pi/memory/MEMORY.md
```

`/onboard-project` là nơi profile được chọn. Nếu project chưa có `.pi/company-profile.json`, model phải gợi ý profile, show option, giải thích tradeoff, rồi chỉ apply khi user approve.

`.pi/project-context.md` là context snapshot để task sau không phải scout lại toàn bộ repo từ đầu.

`.pi/memory/` là durable memory thủ công để giữ preference/decision/lesson ổn định giữa các session. Nó không thay thế snapshot hoặc source hiện tại.

## Vì sao không để bash làm bước này

Bash setup chỉ biết copy template và detect marker. Nó không có model reasoning, không biết project purpose, module ownership, domain rule, hay risk boundary.

`/onboard-project` phải chạy sau login/model selection để chính model sẽ dùng cho task đọc qua project, chọn/gợi ý profile, và tạo snapshot.

## Profile selection

Xem hoặc đổi profile trong Pi:

```text
/profiles
/profiles apply fullstack
/profiles apply be-readonly-fe
```

Khác biệt quan trọng:

- `fullstack`: FE và BE đều có thể được sửa nếu task cho phép.
- `be-readonly-fe`: BE chỉ scout/read-only; FE là write target.
- `web-frontend`: chỉ FE.
- `backend-api`: chỉ BE.
- `generic`: baseline an toàn khi chưa rõ repo.

## Phạm vi model cần đọc

Không đọc toàn bộ source. Đọc theo lớp:

1. `.pi/company-profile.json`
2. `AGENTS.md`
3. `.pi/project-context.md` hiện tại
4. `.pi/memory/memory_summary.md` nếu đã có và liên quan
5. `README.md`
6. package/build/runtime config
7. docs/architecture/spec nếu có
8. source directory map
9. test/verify command definitions
10. API/schema/migration markers nếu có

Mục tiêu là hiểu cấu trúc và policy, không nhồi full repo vào context.

## Artifact bắt buộc

`.pi/project-context.md` nên có:

- project purpose;
- stack/runtime/package manager;
- repository map;
- source-of-truth docs;
- domain/architecture notes;
- verification matrix;
- protected/high-risk areas;
- MCP/tool policy;
- memory policy;
- update triggers.

## Khi nào regenerate

Chạy lại:

```text
/onboard-project
```

khi có thay đổi lớn:

- source layout đổi;
- framework/runtime đổi;
- verify command đổi;
- API/schema/migration/auth/provider policy đổi;
- project ownership hoặc domain rule đổi.

## Relationship với `/task`

`/task` sẽ yêu cầu đọc `.pi/project-context.md`. Nếu file còn trạng thái `Generated: not yet`, agent phải dừng và yêu cầu chạy `/onboard-project` trước.

Đây là điểm khác với CLI thuần: context bootstrap trở thành một bước có artifact, có thể review, commit, và tái dùng cho nhiều session/team member.
