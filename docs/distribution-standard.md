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
| Team stable | `git:github.com/Vt-mmm/pi_agent@v0.3.10` |
| Team latest internal | `https://github.com/Vt-mmm/pi_agent` |
| Enterprise npm | `npm:@company/pi_agent@0.3.10` |
| Local platform dev | `/path/to/pi_agent` |

Pin tag/commit cho project nghiêm túc để tránh workflow đổi bất ngờ.

## Repo root là Pi package

Root `package.json` có `pi` manifest trỏ tới:

- `packages/pi-company-core/extensions/**/*.ts`
- `packages/pi-company-core/skills`
- `packages/pi-company-core/prompts`

Do đó team có thể:

```bash
pi install git:github.com/Vt-mmm/pi_agent@v0.3.10
```

Không cần biết internal folder `packages/pi-company-core`.

## Default team setup

Team nên install global package một lần:

```bash
npm install -g @earendil-works/pi-coding-agent
pi install git:github.com/Vt-mmm/pi_agent@v0.3.10
```

Sau đó project nào cũng:

```bash
cd /path/to/project
pi
```

Project profile được chọn trong Pi bằng `/onboard-project` hoặc `/profiles`, không bắt buộc chạy bash init.

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
  --package-source git:github.com/Vt-mmm/pi_agent@v0.3.10 \
  --mcp-preset core \
  --subagents-preset safe
```

Với project cần scout BE nhưng chỉ implement FE, có thể chọn trong Pi:

```text
/profiles apply be-readonly-fe
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
- `.pi/memory/memory_summary.md`
- `.pi/memory/MEMORY.md`
- `.pi/mcp.json`
- `.pi/.gitignore`

Files không commit:

- `.pi/company-state/`
- `.pi/benchmarks/`
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

## Release checklist

1. Update docs/changelog.
2. Run:

   ```bash
   bash scripts/verify-local.sh
   bash scripts/team-doctor.sh . --strict-share
   bash scripts/parity-benchmark.sh . --init
   bash scripts/setup.sh --global-only --package-source git:github.com/Vt-mmm/pi_agent@v0.3.10 --dry-run
   bash scripts/configure-mcp.sh --dry-run --preset popular --scope project --project .
   bash scripts/configure-subagents.sh --dry-run --preset safe
   pi list
   ```

3. Tag:

   ```bash
   git tag v0.3.10
   git push origin v0.3.10
   ```

4. Team updates:

   ```bash
   pi update --extensions
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

If team also uses Codex:

```bash
herdr integration install codex
```

Do not assume Herdr is running. Scripts must degrade cleanly.

## References

- Pi packages: https://pi.dev/docs/latest/packages
- Pi settings/project trust: https://pi.dev/docs/latest/settings
- Pi extensions/dependencies: https://pi.dev/docs/latest/extensions
- Pi MCP adapter: https://pi.dev/packages/pi-mcp-adapter
- Herdr integrations: https://herdr.dev/docs/integrations/
