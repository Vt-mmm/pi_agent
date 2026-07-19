#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/install-global.sh [--package-source <source>] [--with-mcp] [--mcp-preset <preset>] [--with-subagents] [--subagents-preset <preset>] [--with-web-access] [--with-herdr] [--model-scope <preset>]

Purpose:
  Install the company Pi package into the current user's global Pi settings.

Package source examples:
  git:github.com/Vt-mmm/pi_agent@v0.3.12
  https://github.com/Vt-mmm/pi_agent
  npm:@company/pi_agent@0.3.12
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
  if git -C "$PLATFORM_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    REMOTE_URL="$(git -C "$PLATFORM_ROOT" config --get remote.origin.url || true)"
    if [[ -n "$REMOTE_URL" ]]; then
      PACKAGE_SOURCE="$REMOTE_URL"
    fi
  fi
fi

if [[ -z "$PACKAGE_SOURCE" ]]; then
  PACKAGE_SOURCE="$PLATFORM_ROOT"
  echo "WARN: No git remote detected. Installing from local path." >&2
  echo "WARN: For team rollout, pass --package-source git:github.com/Vt-mmm/pi_agent@TAG" >&2
fi

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
  pi install npm:pi-mcp-adapter
  if command -v pi-mcp-adapter >/dev/null 2>&1; then
    pi-mcp-adapter init || true
  fi
  echo "Configuring shared global MCP baseline:"
  bash "$PLATFORM_ROOT/scripts/configure-mcp.sh" --scope global --preset "$MCP_PRESET"
fi

if [[ "$WITH_SUBAGENTS" == true ]]; then
  echo "Installing Pi subagents:"
  pi install npm:pi-subagents
  echo "Configuring Pi subagents baseline:"
  bash "$PLATFORM_ROOT/scripts/configure-subagents.sh" --preset "$SUBAGENTS_PRESET" --model-scope "$SUBAGENTS_MODEL_SCOPE"
fi

if [[ "$WITH_WEB_ACCESS" == true ]]; then
  echo "Installing Pi web access for researcher subagent:"
  pi install npm:pi-web-access
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
