# Publish cho team dùng

## Mục tiêu

Team khác có thể cài cùng một Pi platform mà không lấy secret của maintainer.

## Cách phát hành

### Git repo

Dùng cho team:

```bash
pi install git:github.com/Vt-mmm/pi_agent@v0.3.9
```

Nên pin tag hoặc commit.

### npm private package

Dùng khi muốn version/publish chuẩn:

```bash
pi install npm:@company/pi_agent@0.3.9
```

### Local path

Dùng khi dev platform trên một máy, không commit source này vào project team:

```bash
pi install /path/to/pi_agent
```

## Versioning

- `0.1.x`: local/internal pilot.
- `0.2.x`: có guard ổn định và docs team.
- `1.0.0`: đủ security review, MCP registry, adapter schema versioned.

## Không publish

- `auth.json`
- `.env`
- session files
- private token
- project data dump

## Team onboarding

1. Install Pi.
2. Install package.
3. Login OAuth provider.
4. Run `pi` in the target project.
5. Run `/onboard-project`.
6. Choose/apply a profile inside Pi.

Chi tiết: `docs/team-onboarding.md` và `docs/distribution-standard.md`.
