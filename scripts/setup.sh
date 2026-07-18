#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup.sh [project-path] [options]

Default behavior:
  - install the platform package globally into Pi;
  - initialize the target project with .pi settings/profile;
  - run the team doctor.

If project-path is omitted:
  - from a normal project directory: initialize the current directory;
  - from the platform repo itself: global install only.

Options:
  --profile <name-or-json>       auto | generic | web-frontend | backend-api | be-readonly-fe | fullstack | node-typescript | python | data | devops | mobile | docs | path/to/profile.json
  --package-source <source>      Portable Pi package source committed into project .pi/settings.json
  --global-only                  Only install global Pi package
  --project-only, --no-global    Only initialize project, skip global install
  --no-project                   Skip project initialization
  --with-mcp / --no-mcp          Install/skip Pi MCP adapter during global install (default: install)
  --with-herdr / --no-herdr      Install/skip Herdr Pi integration if herdr exists (default: install)
  --with-codex-herdr             Also install Herdr Codex integration if codex exists
  --install-pi / --no-install-pi Install/skip Pi CLI with npm if `pi` is missing (default: install)
  --force-profile                Replace existing project .pi/company-profile.json
  --force-settings               Replace existing project .pi/settings.json
  --force                        Replace both profile and settings
  --skip-agents                  Do not create AGENTS.md
  --skip-review-guidelines       Do not create REVIEW_GUIDELINES.md
  --dry-run                      Print commands without executing
  -h, --help

Package source examples:
  git:github.com/Vt-mmm/pi_agent@v0.3.4
  https://github.com/Vt-mmm/pi_agent
  npm:@company/pi_agent@0.3.4
  /absolute/path/to/pi_agent

One-command team setup example:
  bash /path/to/pi_agent/scripts/setup.sh . --profile auto --package-source git:github.com/Vt-mmm/pi_agent@v0.3.4
USAGE
}

PLATFORM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH=""
PROFILE_INPUT="auto"
PACKAGE_SOURCE="${PI_COMPANY_PACKAGE_SOURCE:-}"
DO_GLOBAL=true
DO_PROJECT=true
WITH_MCP=true
WITH_HERDR=true
WITH_CODEX_HERDR=false
AUTO_INSTALL_PI=true
FORCE_PROFILE=false
FORCE_SETTINGS=false
SKIP_AGENTS=false
SKIP_REVIEW=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --profile" >&2
        exit 2
      fi
      PROFILE_INPUT="$2"
      shift 2
      ;;
    --package-source)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --package-source" >&2
        exit 2
      fi
      PACKAGE_SOURCE="$2"
      shift 2
      ;;
    --global-only)
      DO_PROJECT=false
      shift
      ;;
    --project-only|--no-global)
      DO_GLOBAL=false
      shift
      ;;
    --no-project)
      DO_PROJECT=false
      shift
      ;;
    --with-mcp)
      WITH_MCP=true
      shift
      ;;
    --no-mcp)
      WITH_MCP=false
      shift
      ;;
    --with-herdr)
      WITH_HERDR=true
      shift
      ;;
    --no-herdr)
      WITH_HERDR=false
      shift
      ;;
    --with-codex-herdr)
      WITH_HERDR=true
      WITH_CODEX_HERDR=true
      shift
      ;;
    --install-pi)
      AUTO_INSTALL_PI=true
      shift
      ;;
    --no-install-pi)
      AUTO_INSTALL_PI=false
      shift
      ;;
    --force-profile)
      FORCE_PROFILE=true
      shift
      ;;
    --force-settings)
      FORCE_SETTINGS=true
      shift
      ;;
    --force)
      FORCE_PROFILE=true
      FORCE_SETTINGS=true
      shift
      ;;
    --skip-agents)
      SKIP_AGENTS=true
      shift
      ;;
    --skip-review-guidelines)
      SKIP_REVIEW=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -z "$PROJECT_PATH" ]]; then
        PROJECT_PATH="$1"
        shift
      else
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
done

resolve_package_source() {
  if [[ -n "$PACKAGE_SOURCE" ]]; then
    printf '%s\n' "$PACKAGE_SOURCE"
    return
  fi

  if git -C "$PLATFORM_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local remote_url
    remote_url="$(git -C "$PLATFORM_ROOT" config --get remote.origin.url || true)"
    if [[ -n "$remote_url" ]]; then
      printf '%s\n' "$remote_url"
      return
    fi
  fi

  echo "WARN: No package source provided and no git remote detected." >&2
  echo "WARN: using local platform path; do not commit project .pi/settings.json with this value for team rollout." >&2
  printf '%s\n' "$PLATFORM_ROOT"
}

print_cmd() {
  printf '+'
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
  printf '\n'
}

run_cmd() {
  print_cmd "$@"
  if [[ "$DRY_RUN" == false ]]; then
    "$@"
  fi
}

ensure_pi_cli() {
  if command -v pi >/dev/null 2>&1; then
    return
  fi

  if [[ "$AUTO_INSTALL_PI" == false ]]; then
    echo "FAIL: pi is not on PATH. Rerun without --no-install-pi or install Pi manually." >&2
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "FAIL: pi is not on PATH and npm is unavailable." >&2
    echo "Install Node.js/npm first, then rerun setup." >&2
    exit 1
  fi

  echo "Pi CLI not found; installing with npm:"
  run_cmd npm install -g @earendil-works/pi-coding-agent
}

if [[ -z "$PROJECT_PATH" && "$DO_PROJECT" == true ]]; then
  if [[ "$(pwd)" == "$PLATFORM_ROOT" ]]; then
    DO_PROJECT=false
  else
    PROJECT_PATH="$(pwd)"
  fi
fi

if [[ "$DO_PROJECT" == true ]]; then
  if [[ -z "$PROJECT_PATH" ]]; then
    echo "FAIL: project path is required when project initialization is enabled." >&2
    exit 2
  fi
  if [[ ! -d "$PROJECT_PATH" ]]; then
    echo "FAIL: project path does not exist: $PROJECT_PATH" >&2
    exit 1
  fi
  PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"
fi

PACKAGE_SOURCE="$(resolve_package_source)"

echo "Pi Company Platform setup"
echo "  platform: $PLATFORM_ROOT"
echo "  packageSource: $PACKAGE_SOURCE"
echo "  globalInstall: $DO_GLOBAL"
echo "  projectInit: $DO_PROJECT"
if [[ "$DO_PROJECT" == true ]]; then
  echo "  project: $PROJECT_PATH"
  echo "  profile: $PROFILE_INPUT"
fi
echo

if [[ "$DO_GLOBAL" == true ]]; then
  ensure_pi_cli
  install_args=("$PLATFORM_ROOT/scripts/install-global.sh" "--package-source" "$PACKAGE_SOURCE")
  if [[ "$WITH_MCP" == true ]]; then
    install_args+=("--with-mcp")
  fi
  if [[ "$WITH_CODEX_HERDR" == true ]]; then
    install_args+=("--with-codex-herdr")
  elif [[ "$WITH_HERDR" == true ]]; then
    install_args+=("--with-herdr")
  fi
  run_cmd bash "${install_args[@]}"
fi

if [[ "$DO_PROJECT" == true ]]; then
  init_args=("$PLATFORM_ROOT/scripts/init-project.sh" "$PROJECT_PATH" "--profile" "$PROFILE_INPUT" "--package-source" "$PACKAGE_SOURCE")
  if [[ "$FORCE_PROFILE" == true ]]; then
    init_args+=("--force-profile")
  fi
  if [[ "$FORCE_SETTINGS" == true ]]; then
    init_args+=("--force-settings")
  fi
  if [[ "$SKIP_AGENTS" == true ]]; then
    init_args+=("--skip-agents")
  fi
  if [[ "$SKIP_REVIEW" == true ]]; then
    init_args+=("--skip-review-guidelines")
  fi
  run_cmd bash "${init_args[@]}"
  run_cmd bash "$PLATFORM_ROOT/scripts/team-doctor.sh" "$PROJECT_PATH" --strict-share
fi

echo
echo "Next:"
if [[ "$DO_PROJECT" == true ]]; then
  echo "  cd \"$PROJECT_PATH\""
fi
echo "  pi"
echo "  /login             # first time only"
if [[ "$DO_PROJECT" == true ]]; then
  echo "  <select provider/model for project understanding>"
  echo "  /onboard-project   # first project-read snapshot before implementation"
  echo "  /memory-policy     # inspect project memory policy when needed"
fi
echo
echo "Daily flow after setup:"
echo "  herdr    # optional"
echo "  cd <project>"
echo "  pi"
