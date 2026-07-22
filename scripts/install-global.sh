#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/install-global.sh [--stable|--dev|--local|--channel <stable|dev|local>] [--version <tag>] [--package-source <source>] [--dry-run] [--with-mcp] [--mcp-preset <preset>] [--with-subagents] [--subagents-preset <preset>] [--with-web-access] [--with-herdr] [--model-scope <preset>]

Purpose:
  Install the company Pi package into the current user's global Pi settings.

Package source examples:
  # Recommended stable install: exact current release tag
  scripts/install-global.sh --stable

  # Pin a specific release:
  scripts/install-global.sh --version v0.4.7

  # Preview the planned install/update without changing user config:
  scripts/install-global.sh --stable --dry-run

  # Exact sources for reviewed/team rollout:
  git:github.com/Vt-mmm/pi_agent@vX.Y.Z
  https://github.com/Vt-mmm/pi_agent/archive/refs/tags/vX.Y.Z.tar.gz
  npm:@company/pi-agent-platform@x.y.z
  /absolute/path/to/pi_agent

  # Personal/sandbox moving source:
  scripts/install-global.sh --dev

Notes:
  - OAuth is intentionally not automated. Run `pi` then `/login`.
  - Model scope is configured with Pi's native `enabledModels` so users choose via `/model`, Ctrl+L, `/scoped-models`, and Ctrl+P.
  - Herdr integration is optional and modifies user-level Herdr/Pi config.
  - MCP preset defaults to core: Context7 docs, Chrome DevTools, GitHub.
  - Subagents preset defaults to safe: compact tool description, bounded concurrency/depth.
  - Web access is optional. Install it only when you want the builtin `researcher` subagent to browse/fetch web sources inside Pi.
USAGE
}

PLATFORM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_RELEASE_TAG="${PI_COMPANY_CURRENT_RELEASE_TAG:-}"
if [[ -z "$CURRENT_RELEASE_TAG" ]]; then
  if command -v node >/dev/null 2>&1; then
    CURRENT_RELEASE_TAG="$(node -e 'const fs = require("node:fs"); const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(`v${p.version}`);' "$PLATFORM_ROOT/package.json")"
  else
    CURRENT_RELEASE_TAG="v0.4.7"
  fi
fi
DEFAULT_REPO_SOURCE="git:github.com/Vt-mmm/pi_agent"
PACKAGE_SOURCE="${PI_COMPANY_PACKAGE_SOURCE:-}"
PACKAGE_VERSION="${PI_COMPANY_PACKAGE_VERSION:-}"
RELEASE_CHANNEL="${PI_COMPANY_RELEASE_CHANNEL:-}"
WITH_MCP=false
MCP_PRESET="core"
WITH_SUBAGENTS=false
SUBAGENTS_PRESET="safe"
SUBAGENTS_MODEL_SCOPE="none"
WITH_WEB_ACCESS=false
WITH_HERDR=false
CONFIGURE_MODEL_SCOPE=true
MODEL_SCOPE_PRESET="full"
DEFAULT_MODEL="openai-codex/gpt-5.5:xhigh"
DRY_RUN=false
FLOATING_PACKAGE_SOURCE=false
RESOLVED_CHANNEL_LABEL="custom"
PI_MCP_ADAPTER_SOURCE="npm:pi-mcp-adapter@2.11.0"
PI_SUBAGENTS_SOURCE="npm:pi-subagents@0.35.1"
PI_WEB_ACCESS_SOURCE="npm:pi-web-access@0.13.0"
PI_MCP_ADAPTER_INTEGRITY="sha512-4Y/eLbhbxnRih519dJUxMyQ5QASvPcdWyBlS8+dDXteAzaMuLnd4nMTWgoZw3JRIW+0r93KAQcz1Rbli4xCwEQ=="
PI_SUBAGENTS_INTEGRITY="sha512-nIH6liO541FZ1RoeEu58Ligd59tiNw0/ODPgHh7uvx9Dk4UpWH08F84/l1+hXCzUgC85OCmyVtngWkZjcK94Cg=="
PI_WEB_ACCESS_INTEGRITY="sha512-ny0bHisMWdobmu1hcMp/jqjaRh6pYrH7dctBK2CVyRF4ia7bP47RnOPYdG1yiks9ohtcanWir5Hl9EFap8h0zQ=="

case "${PI_COMPANY_DRY_RUN:-}" in
  1|true|TRUE|yes|YES)
    DRY_RUN=true
    ;;
esac

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

verify_npm_integrity() {
  local source="$1"
  local expected="$2"
  local package_spec="${source#npm:}"
  if ! command -v npm >/dev/null 2>&1; then
    echo "FAIL: npm is required to verify package integrity for $package_spec." >&2
    exit 1
  fi
  local actual
  actual="$(npm view "$package_spec" dist.integrity 2>/dev/null | tr -d '\r\n')"
  if [[ -z "$actual" || "$actual" != "$expected" ]]; then
    echo "FAIL: registry integrity does not match the approved digest for $package_spec." >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package-source)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --package-source" >&2
        exit 2
      fi
      PACKAGE_SOURCE="$2"
      shift 2
      ;;
    --channel)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --channel" >&2
        exit 2
      fi
      RELEASE_CHANNEL="$2"
      shift 2
      ;;
    --stable)
      RELEASE_CHANNEL="stable"
      shift
      ;;
    --dev)
      RELEASE_CHANNEL="dev"
      shift
      ;;
    --local)
      RELEASE_CHANNEL="local"
      shift
      ;;
    --version|--tag)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 2
      fi
      PACKAGE_VERSION="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --with-mcp)
      WITH_MCP=true
      shift
      ;;
    --mcp-preset)
      MCP_PRESET="${2:-}"
      shift 2
      ;;
    --with-subagents)
      WITH_SUBAGENTS=true
      shift
      ;;
    --subagents-preset)
      SUBAGENTS_PRESET="${2:-}"
      shift 2
      ;;
    --subagents-model-scope)
      SUBAGENTS_MODEL_SCOPE="${2:-}"
      shift 2
      ;;
    --with-web-access)
      WITH_WEB_ACCESS=true
      shift
      ;;
    --with-herdr)
      WITH_HERDR=true
      shift
      ;;
    --model-scope)
      MODEL_SCOPE_PRESET="${2:-}"
      shift 2
      ;;
    --default-model)
      DEFAULT_MODEL="${2:-}"
      shift 2
      ;;
    --no-model-scope)
      CONFIGURE_MODEL_SCOPE=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

resolve_package_source() {
  if [[ -n "$PACKAGE_SOURCE" ]]; then
    if [[ -n "$RELEASE_CHANNEL" || -n "$PACKAGE_VERSION" ]]; then
      echo "FAIL: use either --package-source or --channel/--version, not both." >&2
      exit 2
    fi
    RESOLVED_CHANNEL_LABEL="custom"
    return
  fi

  if [[ -n "$RELEASE_CHANNEL" && -n "$PACKAGE_VERSION" ]]; then
    echo "FAIL: use either --channel or --version, not both." >&2
    exit 2
  fi

  if [[ -n "$PACKAGE_VERSION" ]]; then
    PACKAGE_SOURCE="${DEFAULT_REPO_SOURCE}@${PACKAGE_VERSION}"
    RESOLVED_CHANNEL_LABEL="exact"
    return
  fi

  case "$RELEASE_CHANNEL" in
    stable)
      PACKAGE_SOURCE="${DEFAULT_REPO_SOURCE}@${CURRENT_RELEASE_TAG}"
      RESOLVED_CHANNEL_LABEL="stable"
      ;;
    dev|latest)
      PACKAGE_SOURCE="$DEFAULT_REPO_SOURCE"
      FLOATING_PACKAGE_SOURCE=true
      RESOLVED_CHANNEL_LABEL="dev"
      ;;
    local)
      PACKAGE_SOURCE="$PLATFORM_ROOT"
      RESOLVED_CHANNEL_LABEL="local"
      ;;
    "")
      PACKAGE_SOURCE="$PLATFORM_ROOT"
      RESOLVED_CHANNEL_LABEL="local"
      echo "WARN: No exact package source provided. Installing from local path." >&2
      echo "WARN: For team rollout, pass --stable, --version vX.Y.Z, or --package-source git:github.com/Vt-mmm/pi_agent@TAG." >&2
      ;;
    *)
      echo "FAIL: unsupported release channel: $RELEASE_CHANNEL" >&2
      echo "Expected: stable, dev, or local." >&2
      exit 2
      ;;
  esac
}

resolve_package_source

if [[ "$FLOATING_PACKAGE_SOURCE" == true ]]; then
  echo "WARN: Installing a floating dev/latest source. Use only for personal machines or sandbox testing." >&2
else
  node "$PLATFORM_ROOT/scripts/capability-catalog.mjs" validate-source --package-source "$PACKAGE_SOURCE" >/dev/null
fi

if ! command -v pi >/dev/null 2>&1; then
  if [[ "$DRY_RUN" == true ]]; then
    echo "DRY RUN: pi is not on PATH; install would require Pi CLI first." >&2
  else
  echo "FAIL: pi is not on PATH." >&2
  echo "Install Pi first, then rerun this script." >&2
    echo "Expected command on npm-based installs: npm install -g @earendil-works/pi-coding-agent@0.80.10" >&2
  exit 1
  fi
fi

echo "Installing Pi Company Platform package:"
echo "  channel: $RESOLVED_CHANNEL_LABEL"
echo "  currentRelease: $CURRENT_RELEASE_TAG"
echo "  source: $PACKAGE_SOURCE"
run_cmd pi install "$PACKAGE_SOURCE"

if [[ "$WITH_MCP" == true ]]; then
  echo "Installing Pi MCP adapter:"
  if [[ "$DRY_RUN" == false ]]; then
    verify_npm_integrity "$PI_MCP_ADAPTER_SOURCE" "$PI_MCP_ADAPTER_INTEGRITY"
  fi
  run_cmd pi install "$PI_MCP_ADAPTER_SOURCE"
  if [[ "$DRY_RUN" == false ]] && command -v pi-mcp-adapter >/dev/null 2>&1; then
    pi-mcp-adapter init || true
  fi
  echo "Configuring shared global MCP baseline:"
  run_cmd bash "$PLATFORM_ROOT/scripts/configure-mcp.sh" --scope global --preset "$MCP_PRESET" --replace
fi

if [[ "$WITH_SUBAGENTS" == true ]]; then
  echo "Installing Pi subagents:"
  if [[ "$DRY_RUN" == false ]]; then
    verify_npm_integrity "$PI_SUBAGENTS_SOURCE" "$PI_SUBAGENTS_INTEGRITY"
  fi
  run_cmd pi install "$PI_SUBAGENTS_SOURCE"
  echo "Configuring Pi subagents baseline:"
  run_cmd bash "$PLATFORM_ROOT/scripts/configure-subagents.sh" --preset "$SUBAGENTS_PRESET" --model-scope "$SUBAGENTS_MODEL_SCOPE"
fi

if [[ "$WITH_WEB_ACCESS" == true ]]; then
  echo "Installing Pi web access for researcher subagent:"
  if [[ "$DRY_RUN" == false ]]; then
    verify_npm_integrity "$PI_WEB_ACCESS_SOURCE" "$PI_WEB_ACCESS_INTEGRITY"
  fi
  run_cmd pi install "$PI_WEB_ACCESS_SOURCE"
fi

if [[ "$CONFIGURE_MODEL_SCOPE" == true ]]; then
  echo "Configuring Pi model selector scope:"
  run_cmd bash "$PLATFORM_ROOT/scripts/configure-model-scope.sh" --preset "$MODEL_SCOPE_PRESET" --default-model "$DEFAULT_MODEL"
fi

if [[ "$WITH_HERDR" == true ]]; then
  if ! command -v herdr >/dev/null 2>&1; then
    echo "WARN: herdr is not on PATH. Skipping Herdr integration." >&2
  else
    PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-"${HOME}/.pi/agent"}"
    run_cmd mkdir -p "$PI_AGENT_DIR/extensions"
    run_cmd herdr integration install pi
  fi
fi

echo
echo "Installed packages:"
if [[ "$DRY_RUN" == true ]]; then
  print_cmd pi list
else
  pi list
fi

echo
echo "Next:"
echo "  pi"
echo "  /login"
echo "  /model          # or Ctrl+L: select provider/model from Pi selector"
echo "  /scoped-models  # optional: edit Ctrl+P model cycle scope"
echo "  /mcp            # inspect MCP servers; authenticate Figma/GitHub only when needed"
echo "  /subagents-doctor"
echo "  /task Implement <task>  # parent may auto-delegate scout/planner/reviewer"
