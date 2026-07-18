# Workflow recipes

## Mục tiêu

Các recipe này biến những bài toán lặp lại thành workflow có tên rõ, dùng được cho project khác mà không phụ thuộc một project nội bộ cụ thể.

## Recipe 1 — Platform migration

Dùng khi muốn migrate hoặc học pattern từ Pi docs, Codex CLI GitHub, Claude/Codex harness, hoặc repo tham chiếu vào Pi Company Platform.

Lệnh trong Pi:

```text
/onboard-project
/platform-migration Migrate <source> into <target behavior>
```

Input tối thiểu:

- source docs URL hoặc repo URL;
- version/date/commit nếu có;
- target behavior cần áp dụng;
- non-goals: cái không migrate.

Output mong đợi:

- migration matrix;
- code/docs/config thay đổi;
- verify evidence;
- phần không migrate và lý do.

Verify chuẩn:

```bash
bash scripts/verify-local.sh
bash scripts/team-doctor.sh /path/to/pi_agent --strict-share
pi list --approve
```

## Recipe 2 — Backend spec to frontend

Dùng khi backend là source of truth nhưng frontend là nơi implement. Backend chỉ được scout/read-only.

Setup project generic:

```text
/profiles
/profiles apply be-readonly-fe
```

Lệnh trong Pi:

```text
/onboard-project
/be-to-fe Implement FE from BE spec: <endpoint/spec/change>
```

Input tối thiểu:

- BE endpoint/spec/diff/ticket;
- expected FE behavior;
- target route/page/component nếu biết;
- verify expectation.

Agent phải làm:

1. Scout BE read-only.
2. Ghi contract snapshot.
3. Map FE touchpoints.
4. Implement FE only.
5. Verify FE.
6. Report BE gaps thay vì sửa BE.

## Khi dùng profile nào

| Bài toán | Profile khuyến nghị |
|---|---|
| Platform/package/harness migration | `platform-development` hoặc profile platform riêng |
| Fullstack bình thường, FE/BE đều có thể sửa | `fullstack` |
| BE source of truth nhưng BE không được sửa | `be-readonly-fe` |
| Backend-only task | `backend-api` |
| Frontend-only task | `web-frontend` |
| Project đặc thù/private | profile explicit trong chính repo project |

Không dùng `auto` để suy ra `be-readonly-fe`, vì BE read-only là policy decision chứ không phải marker kỹ thuật.
