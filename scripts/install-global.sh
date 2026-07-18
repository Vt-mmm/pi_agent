#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/install-global.sh [--package-source <source>] [--with-mcp] [--with-herdr] [--with-codex-herdr]

Purpose:
  Install the company Pi package into the current user's global Pi settings.

Package source examples:
  git:github.com/Vt-mmm/pi_agent@v0.3.1
  https://github.com/Vt-mmm/pi_agent
  npm:@company/pi_agent@0.3.1
  /absolute/path/to/pi_agent

Notes:
  - OAuth is intentionally not automated. Run `pi` then `/login`.
  - Herdr integration is optional and modifies user-level Herdr/Pi config.
USAGE
}

PLATFORM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_SOURCE="${PI_COMPANY_PACKAGE_SOURCE:-}"
WITH_MCP=false
WITH_HERDR=false
WITH_CODEX_HERDR=false

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
    --with-herdr)
      WITH_HERDR=true
      shift
      ;;
    --with-codex-herdr)
      WITH_HERDR=true
      WITH_CODEX_HERDR=true
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
fi

if [[ "$WITH_HERDR" == true ]]; then
  if ! command -v herdr >/dev/null 2>&1; then
    echo "WARN: herdr is not on PATH. Skipping Herdr integration." >&2
  else
    PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-"${HOME}/.pi/agent"}"
    mkdir -p "$PI_AGENT_DIR/extensions"
    herdr integration install pi
    if [[ "$WITH_CODEX_HERDR" == true ]] && command -v codex >/dev/null 2>&1; then
      herdr integration install codex
    fi
  fi
fi

echo
echo "Installed packages:"
pi list

echo
echo "Next:"
echo "  pi"
echo "  /login"
