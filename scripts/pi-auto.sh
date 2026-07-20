#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  pi-company-auto [--read-only] [--no-approve] [--] [pi args...]

Purpose:
  Launch Pi with project-local trust approved for this run.

Examples:
  pi-company-auto
  pi-company-auto --name "payment scout"
  pi-company-auto --read-only -p "Scout payment mapping. Do not edit source."
  pi-company-auto -- --model openai-codex/gpt-5.5:xhigh

Notes:
  - This wraps `pi --approve`; it does not disable Company guardrails.
  - Protected paths, destructive shell checks, task gates, and verify evidence still run.
  - Use `--read-only` when you want only read/grep/find/ls tools enabled.
  - Use `--no-approve` to force Pi to ignore project-local resources for this run.
USAGE
}

READ_ONLY=false
APPROVE_FLAG="--approve"
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --read-only)
      READ_ONLY=true
      shift
      ;;
    --no-approve|-na)
      APPROVE_FLAG="--no-approve"
      shift
      ;;
    --approve|-a)
      APPROVE_FLAG="--approve"
      shift
      ;;
    --)
      shift
      ARGS+=("$@")
      break
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

if ! command -v pi >/dev/null 2>&1; then
  echo "FAIL: pi is not on PATH. Install with: npm install -g @earendil-works/pi-coding-agent" >&2
  exit 1
fi

if [[ "$READ_ONLY" == "true" ]]; then
  exec pi "$APPROVE_FLAG" --tools read,grep,find,ls "${ARGS[@]}"
fi

exec pi "$APPROVE_FLAG" "${ARGS[@]}"
