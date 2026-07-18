# Memory policy cho Pi Agent Platform

## Tóm tắt quyết định

Áp dụng memory theo hướng **explicit-only, project-scoped, markdown-first**.

Nghĩa là:

- project có `.pi/memory/memory_summary.md` và `.pi/memory/MEMORY.md`;
- agent chỉ ghi memory khi user yêu cầu rõ kiểu “remember this” hoặc workflow yêu cầu explicit;
- memory là hint để giảm scout lại, không phải source of truth;
- không bật background session extraction/consolidation mặc định trong public platform;
- nếu team muốn native/third-party Pi memory package thì install riêng sau khi review source.

## Vì sao không bật auto background memory ngay

Bài “How Pi remembers” mô tả hệ thống đầy đủ gồm:

- read path trước turn: nạp summary vào prompt;
- write path nền: đọc session cũ, trích raw memory, consolidate thành notebook;
- SQLite catalog để quản lý job/lease/usage;
- git snapshot để đọc bản memory sạch;
- `/memory` control panel.

Đó là kiến trúc tốt, nhưng với repo public dùng cho nhiều team, bật mặc định có 3 rủi ro:

1. **Token/cost khó đo:** background extraction có thể gọi model sau session.
2. **Ghi nhớ sai:** transcript cũ có thể chứa kết luận chưa verify nếu extractor không đủ chặt.
3. **Secret/privacy:** memory tự động phải có redaction + audit mạnh trước khi rollout.

Do đó bản platform hiện tại lấy phần chắc chắn nhất:

- memory file markdown dễ đọc/sửa/commit;
- write explicit-only;
- search/read bằng tool;
- profile knobs để sau này bật external package hoặc assisted mode.

## File layout

Trong project được init:

```text
.pi/memory/
├─ memory_summary.md   compact index, bắt đầu bằng v1
├─ MEMORY.md           durable project memory handbook
└─ local/              private local notes, ignored by git
```

Runtime/experimental files không commit:

```text
.pi/memory/state.sqlite
.pi/memory/raw_memories.md
.pi/memory/rollout_summaries/
.pi/memory/extensions/ad_hoc/
.pi/memory/local/
.pi/memory/.git/
```

## Profile config

Mỗi `.pi/company-profile.json` có block:

```json
{
  "memory": {
    "enabled": true,
    "mode": "manual",
    "scope": "project",
    "summaryFile": ".pi/memory/memory_summary.md",
    "handbookFile": ".pi/memory/MEMORY.md",
    "localDir": ".pi/memory/local",
    "readBeforeTask": true,
    "writePolicy": "explicit-only",
    "maxInjectedChars": 4000,
    "externalPackages": []
  }
}
```

Mode hiện tại:

| Mode | Ý nghĩa |
|---|---|
| `off` | Không dùng project memory. |
| `manual` | Mặc định. Tool đọc/search/write explicit-only. |
| `assisted` | Dành cho tương lai: agent có thể đề xuất memory note nhưng vẫn cần user approve. |
| `external-package` | Project/team dùng thêm package memory riêng như `pi-memory`. |

## Tools trong platform

| Tool | Mục đích |
|---|---|
| `company_memory_status` | Xem memory config/files/rules. |
| `company_memory_note` | Ghi durable note khi user explicit ask. Có redaction pattern cơ bản. |
| `company_memory_search` | Keyword-search memory markdown. |
| `company_memory_citation_record` | Ghi memory file đã ảnh hưởng task contract. |

## Workflow khuyến nghị

### First run

```text
/login
/onboard-project
/memory-policy
```

### Ghi nhớ explicit

```text
Remember: this repo uses pnpm, never npm.
```

Agent nên gọi `company_memory_note` với category `preference`.

### Trước implementation

1. `company_context`
2. `company_memory_status`
3. `company_memory_search` nếu task có keyword liên quan
4. đọc repo files hiện tại để verify
5. implement

Memory giúp giảm token scout lại, nhưng không thay thế việc đọc source hiện tại.

## Khi muốn dùng package memory ngoài

Pi package chạy code và ảnh hưởng hành vi agent, nên phải review source trước khi install.

Candidate phổ biến:

```bash
pi install npm:pi-memory
```

Package này lưu markdown ở local memory dir, có tools `memory_write`, `memory_read`, `scratchpad`, `memory_status`; search nâng cao cần qmd.

Nếu dùng external package, set profile:

```json
{
  "memory": {
    "mode": "external-package",
    "externalPackages": ["npm:pi-memory"]
  }
}
```

## Source tham khảo

- Pi memory explainer: https://tuyenhx.com/docs/memory-explainer.html
- Pi extensions docs: https://pi.dev/docs/latest/extensions
- Pi settings/project trust docs: https://pi.dev/docs/latest/settings
- Pi package `pi-memory`: https://pi.dev/packages/pi-memory
