# ADR 260718 — Tách Pi platform thành project global

## Status

Accepted

## Context

Mục tiêu là agent flow hằng ngày `cd project && pi`, còn OAuth, harness, MCP, context window, tool call policy, và migration từ Codex CLI được setup sẵn.

Project nghiệp vụ cụ thể không nên là root cho platform dùng chung.

## Decision

Tạo repo độc lập:

```text
<platform-repo>
```

Repo này chứa:

- Pi package core dùng chung.
- Adapter mẫu cho generic/frontend/backend/fullstack; project-specific profiles nằm trong chính repo project.
- Tài liệu tiếng Việt.
- Script bootstrap/link/verify.
- Codex migration reference.

## Consequences

- Core có thể push cho team khác dùng.
- Project đặc thù chỉ là example/adapter, không nằm trong core.
- OAuth/token vẫn local từng user.
- Project khác chỉ cần profile riêng.

## Alternatives considered

1. Đặt `.pi` trực tiếp trong project nghiệp vụ: loại vì khóa platform vào project đặc thù.
2. Custom Pi global thủ công trên máy maintainer: loại vì khó review/push/team reuse.
3. Copy Codex CLI code nguyên khối: loại phase đầu; chỉ migrate concept/interface.
