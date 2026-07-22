# Distribution standard

## Nguyên tắc

Repo này phải chạy được cho nhiều project/domain khác nhau. Vì vậy:

- default adapter không chứa domain riêng;
- `.pi/settings.json` trong project phải dùng package source portable: `git:` hoặc `npm:`;
- local absolute path chỉ dùng khi dev platform;
- OAuth, trust, sessions, cache, company-state không commit;
- project-specific/private profiles không nằm trong default `adapters/`.

## Package source chuẩn

| Use case | Package source |
|---|---|
| Team pinned release | `git:github.com/Vt-mmm/pi_agent@v0.4.8` |
| Personal/sandbox dev | `git:github.com/Vt-mmm/pi_agent` |
| Enterprise npm | `npm:@company/pi-agent-platform@x.y.z` |
| Local platform dev | `/path/to/pi_agent` |

Latest tiện cho máy cá nhân muốn nhận cập nhật nhanh. Pin tag/commit cho `.pi/settings.json` trong project nghiêm túc để tránh workflow đổi bất ngờ giữa các developer.

## Release/install channels

| Channel | Command | Target | Policy |
|---|---|---|---|
| `stable` | `bash scripts/install-global.sh --stable` | Helper release tag resolved to commit SHA, currently `v0.4.8` | Install the Pi package matching the helper. |
| `exact` | `bash scripts/install-global.sh --version vX.Y.Z --resolve-tag` | Requested tag resolved to commit SHA | Pi-package-only rollout, rollback, and incident recovery. |
| `dev` | `bash scripts/install-global.sh --dev` | Moving Git source | Personal/sandbox only; do not commit into project settings. |
| `local` | `bash scripts/install-global.sh --local` | Current checkout path | Platform development only. |

Always preview non-local rollout first:

```bash
bash scripts/install-global.sh --stable --dry-run
bash scripts/install-global.sh --version vX.Y.Z --resolve-tag --dry-run
```

Stable and resolved exact installs fail closed when the release tag cannot be resolved from GitHub. The install output prints the tag, resolved commit, and final `git:` package source before running `pi install`.

`currentRelease` trong output là version của npm-global helper đang chạy. `--version` chỉ đổi Pi package; nó không tự thay binary `pi-company-*` trên `PATH`.

## Repo root là Pi package

Root `package.json` có `pi` manifest trỏ tới:

- `packages/pi-company-core/extensions/**/*.ts`
- `packages/pi-company-core/skills`
- `packages/pi-company-core/prompts`

Do đó team có thể:

```bash
pi install git:github.com/Vt-mmm/pi_agent@v0.4.8
```

Không cần biết internal folder `packages/pi-company-core`. Source không pin chỉ dành cho personal/sandbox như bảng channel ở trên.

## Default team setup

Team nên install global package một lần:

```bash
node --version  # >= 22.19.0
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.81.1
npm install -g --ignore-scripts github:Vt-mmm/pi_agent#v0.4.8
pi-company-install --stable --dry-run
pi-company-install --stable
```

`pi install git:github.com/Vt-mmm/pi_agent@v0.4.8` vẫn hợp lệ nếu chỉ cần cài Pi package. Lệnh đó không tự tạo các binary terminal `pi-company-*`; muốn có helper global thì dùng `npm install -g --ignore-scripts github:Vt-mmm/pi_agent#v0.4.8`.

Support matrix hiện tại: macOS/Linux với Bash đã được verify; native Windows và WSL chưa được verify cho release này. Chi tiết và version runtime nằm trong [release/install policy](release-install-policy.md).

Sau đó project nào cũng:

```bash
cd /path/to/project
pi
```

Project profile được chọn trong Pi bằng `/onboard-project` hoặc `/profile`, không bắt buộc chạy bash init.

Sau setup, bước first-run trong Pi là:

```text
/login
<select provider/model>
/mcp
/subagents-doctor
/onboard-project
```

`/onboard-project` ghi `.pi/project-context.md`; đây là snapshot context dùng chung cho các task sau.

## Optional preseed setup

Nếu muốn commit sẵn `.pi/company-profile.json` vào repo hoặc bootstrap bằng CI:

```bash
bash scripts/setup.sh /path/to/project \
  --profile be-readonly-fe \
  --package-source git:github.com/Vt-mmm/pi_agent@v0.4.8 \
  --mcp-preset core \
  --subagents-preset safe
```

Với project cần scout BE nhưng chỉ implement FE, có thể chọn trong Pi:

```text
/profile be-readonly-fe
```

## Project init output

`scripts/setup.sh` hoặc `scripts/init-project.sh` tạo scaffold project:

```text
project/
├─ AGENTS.md
├─ .gitignore
├─ REVIEW_GUIDELINES.md
├─ .mcp.json
└─ .pi/
   ├─ settings.json
   ├─ company-profile.json
   ├─ project-context.md
   ├─ memory/
   │  ├─ memory_summary.md
   │  └─ MEMORY.md
   ├─ mcp.json
   └─ .gitignore
```

Files nên commit:

- `AGENTS.md`
- `.gitignore`
- `REVIEW_GUIDELINES.md`
- `.mcp.json`
- `.pi/settings.json`
- `.pi/company-profile.json`
- `.pi/project-context.md`
- `.pi/mcp.json`
- `.pi/.gitignore`

Files không commit:

- `.pi/company-state/`
- `.pi/task-inbox/`
- `.pi/benchmarks/`
- `.pi/memory/memory_summary.md`
- `.pi/memory/MEMORY.md`
- `.pi/memory/local/`
- `.pi/memory/state.sqlite`
- `.pi/memory/raw_memories.md`
- `.pi/memory/rollout_summaries/`
- `.pi/memory/extensions/ad_hoc/`
- `.pi/sessions/`
- `.pi/todos/`
- `.pi/auth.json`
- `.env`
- `.pi-subagents/`
- `progress.md` nếu chỉ là scratch runtime

## Release, update và rollback

[Release/install policy](release-install-policy.md) là checklist canonical duy nhất. Production docs chỉ được promote sau khi tag đã tồn tại và stable dry-run resolve đúng commit SHA.

Full platform update phải đồng bộ Pi host, npm-global helper và Pi package:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.81.1
npm install -g --ignore-scripts github:Vt-mmm/pi_agent#vX.Y.Z
pi-company-install --stable --dry-run
pi-company-install --stable
pi-company-doctor /path/to/project --strict-share
```

Full rollback dùng cùng flow với target trước đó. Lấy exact host version từ release policy của target; không giả định host hiện tại tương thích với release cũ:

```bash
TARGET_PI_VERSION=x.y.z
npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@$TARGET_PI_VERSION"
npm install -g --ignore-scripts github:Vt-mmm/pi_agent#vPREVIOUS
pi-company-install --stable --dry-run
pi-company-install --stable
pi-company-doctor /path/to/project --strict-share
```

Nếu chủ ý chỉ đổi Pi package và giữ terminal helper hiện tại:

```bash
pi-company-install --version vX.Y.Z --resolve-tag --dry-run
pi-company-install --version vX.Y.Z --resolve-tag
```

## Security review

Pi packages run with full system access. Before team rollout:

- review every extension file;
- no network call during startup;
- network only inside explicit tools;
- no secret logging;
- destructive bash blocked;
- project local profile loaded only after Pi trust or explicit env override.

## Herdr standard

Herdr integration is user-local:

```bash
herdr integration install pi
```

Do not assume Herdr is running. Scripts must degrade cleanly.

## Official docs

- Pi packages: https://pi.dev/docs/latest/packages
- Pi settings/project trust: https://pi.dev/docs/latest/settings
- Pi extensions/dependencies: https://pi.dev/docs/latest/extensions
- Pi MCP adapter: https://pi.dev/packages/pi-mcp-adapter
- Herdr integrations: https://herdr.dev/docs/integrations/
