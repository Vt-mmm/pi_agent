# Context-window policy

## Mục tiêu

Không nhồi toàn bộ repo vào context. Agent phải load đúng lớp context theo task.

Lần đầu gắn project vào platform, chạy `/onboard-project` sau login/model selection để tạo `.pi/project-context.md`. Các task sau đọc snapshot này trước, rồi mới đọc files task-specific.

## Context order

1. `AGENTS.md` gần project nhất.
2. Project profile: `.pi/company-profile.json`.
3. Project context snapshot: `.pi/project-context.md`.
4. Required context từ profile.
5. Task-specific files.
6. Related tests/docs.
7. External docs only khi cần và ưu tiên official docs.

## Context manifest

Mỗi task nên có manifest ngắn:

```text
Context manifest
- profile: .pi/company-profile.json
- snapshot: .pi/project-context.md
- required: AGENTS.md
- required: docs/architecture.md
- task files: src/...
- verify: npm test
```

## Compaction default

Pi settings template dùng:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

## Rule

- Nếu task là read-only, không mở write-capable prompt.
- Nếu task là source-write, phải biết verify command trước khi sửa.
- Nếu context vượt budget, tạo summary theo module thay vì copy full files.

## Nguồn

- Pi compaction: https://pi.dev/docs/latest/compaction
- Pi settings: https://pi.dev/docs/latest/settings
