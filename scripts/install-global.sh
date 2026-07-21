#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/install-global.sh [--package-source <source>] [--with-mcp] [--mcp-preset <preset>] [--with-subagents] [--subagents-preset <preset>] [--with-web-access] [--with-herdr] [--model-scope <preset>]

Purpose:
  Install the company Pi package into the current user's global Pi settings.

Package source examples:
  git:github.com/Vt-mmm/pi_agent@v0.4.1
  https://github.com/Vt-mmm/pi_agent/archive/refs/tags/v0.4.1.tar.gz
  npm:@company/pi-agent-platform@0.4.1
  /absolute/path/to/pi_agent

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
PACKAGE_SOURCE="${PI_COMPANY_PACKAGE_SOURCE:-}"
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
PI_MCP_ADAPTER_SOURCE="npm:pi-mcp-adapter@2.11.0"
PI_SUBAGENTS_SOURCE="npm:pi-subagents@0.35.1"
PI_WEB_ACCESS_SOURCE="npm:pi-web-access@0.13.0"
PI_MCP_ADAPTER_INTEGRITY="sha512-4Y/eLbhbxnRih519dJUxMyQ5QASvPcdWyBlS8+dDXteAzaMuLnd4nMTWgoZw3JRIW+0r93KAQcz1Rbli4xCwEQ=="
PI_SUBAGENTS_INTEGRITY="sha512-nIH6liO541FZ1RoeEu58Ligd59tiNw0/ODPgHh7uvx9Dk4UpWH08F84/l1+hXCzUgC85OCmyVtngWkZjcK94Cg=="
PI_WEB_ACCESS_INTEGRITY="sha512-ny0bHisMWdobmu1hcMp/jqjaRh6pYrH7dctBK2CVyRF4ia7bP47RnOPYdG1yiks9ohtcanWir5Hl9EFap8h0zQ=="

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

if [[ -z "$PACKAGE_SOURCE" ]]; then
  PACKAGE_SOURCE="$PLATFORM_ROOT"
  echo "WARN: No exact package source provided. Installing from local path." >&2
  echo "WARN: For team rollout, pass --package-source git:github.com/Vt-mmm/pi_agent@TAG" >&2
fi

node "$PLATFORM_ROOT/scripts/capability-catalog.mjs" validate-source --package-source "$PACKAGE_SOURCE" >/dev/null

if ! command -v pi >/dev/null 2>&1; then
  echo "FAIL: pi is not on PATH." >&2
  echo "Install Pi first, then rerun this script." >&2
  echo "Expected command on npm-based installs: npm install -g @earendil-works/pi-coding-agent" >&2
  exit 1
fi

echo "Installing Pi Company Platform package:"
echo "  source: $PACKAGE_SOURCE"
pi install "$PACKAGE_SOURCE"

if [[ "$WITH_MCP" == true ]]; then
  echo "Installing Pi MCP adapter:"
  verify_npm_integrity "$PI_MCP_ADAPTER_SOURCE" "$PI_MCP_ADAPTER_INTEGRITY"
  pi install "$PI_MCP_ADAPTER_SOURCE"
  if command -v pi-mcp-adapter >/dev/null 2>&1; then
    pi-mcp-adapter init || true
  fi
  echo "Configuring shared global MCP baseline:"
  bash "$PLATFORM_ROOT/scripts/configure-mcp.sh" --scope global --preset "$MCP_PRESET" --replace
fi

if [[ "$WITH_SUBAGENTS" == true ]]; then
  echo "Installing Pi subagents:"
  verify_npm_integrity "$PI_SUBAGENTS_SOURCE" "$PI_SUBAGENTS_INTEGRITY"
  pi install "$PI_SUBAGENTS_SOURCE"
  echo "Configuring Pi subagents baseline:"
  bash "$PLATFORM_ROOT/scripts/configure-subagents.sh" --preset "$SUBAGENTS_PRESET" --model-scope "$SUBAGENTS_MODEL_SCOPE"
fi

if [[ "$WITH_WEB_ACCESS" == true ]]; then
  echo "Installing Pi web access for researcher subagent:"
  verify_npm_integrity "$PI_WEB_ACCESS_SOURCE" "$PI_WEB_ACCESS_INTEGRITY"
  pi install "$PI_WEB_ACCESS_SOURCE"
fi

if [[ "$CONFIGURE_MODEL_SCOPE" == true ]]; then
  echo "Configuring Pi model selector scope:"
  bash "$PLATFORM_ROOT/scripts/configure-model-scope.sh" --preset "$MODEL_SCOPE_PRESET" --default-model "$DEFAULT_MODEL"
fi

if [[ "$WITH_HERDR" == true ]]; then
  if ! command -v herdr >/dev/null 2>&1; then
    echo "WARN: herdr is not on PATH. Skipping Herdr integration." >&2
  else
    PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-"${HOME}/.pi/agent"}"
    mkdir -p "$PI_AGENT_DIR/extensions"
    herdr integration install pi
  fi
fi

echo
echo "Installed packages:"
pi list

echo
echo "Next:"
echo "  pi"
echo "  /login"
echo "  /model          # or Ctrl+L: select provider/model from Pi selector"
echo "  /scoped-models  # optional: edit Ctrl+P model cycle scope"
echo "  /mcp            # inspect MCP servers; authenticate Figma/GitHub only when needed"
echo "  /subagents-doctor"
echo "  /task Implement <task>  # parent may auto-delegate scout/planner/reviewer"
