#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OFFLINE=false

usage() {
  cat <<'USAGE'
Usage:
  scripts/verify-local.sh [--offline]

Options:
  --offline   Skip checks that require a local Pi login/model catalog.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --offline)
      OFFLINE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

required_files=(
  "$ROOT/README.md"
  "$ROOT/AGENTS.md"
  "$ROOT/package.json"
  "$ROOT/package-lock.json"
  "$ROOT/tsconfig.json"
  "$ROOT/.github/workflows/verify.yml"
  "$ROOT/types/pi-runtime-shims.d.ts"
  "$ROOT/.pi/settings.json"
  "$ROOT/.pi/company-profile.json"
  "$ROOT/.pi/project-context.md"
  "$ROOT/packages/pi-company-core/package.json"
  "$ROOT/packages/pi-company-core/extensions/company-guard.ts"
  "$ROOT/packages/pi-company-core/extensions/policy-core.js"
  "$ROOT/packages/pi-company-core/extensions/redaction-core.js"
  "$ROOT/packages/pi-company-core/extensions/runtime-evidence.js"
  "$ROOT/packages/pi-company-core/prompts/onboard-project.md"
  "$ROOT/packages/pi-company-core/prompts/company-commands.md"
  "$ROOT/packages/pi-company-core/prompts/profiles.md"
  "$ROOT/packages/pi-company-core/prompts/model-options.md"
  "$ROOT/packages/pi-company-core/prompts/memory-policy.md"
  "$ROOT/packages/pi-company-core/prompts/platform-improve.md"
  "$ROOT/packages/pi-company-core/prompts/be-to-fe.md"
  "$ROOT/packages/pi-company-core/prompts/scout.md"
  "$ROOT/packages/pi-company-core/prompts/task.md"
  "$ROOT/packages/pi-company-core/prompts/discuss.md"
  "$ROOT/packages/pi-company-core/prompts/plan.md"
  "$ROOT/packages/pi-company-core/prompts/review.md"
  "$ROOT/packages/pi-company-core/skills/company-ops/SKILL.md"
  "$ROOT/packages/pi-company-core/skills/company-source-cache/SKILL.md"
  "$ROOT/packages/pi-company-core/skills/company-source-cache/checkout-source-repo.sh"
  "$ROOT/packages/pi-company-core/subagents/company-scout.md"
  "$ROOT/packages/pi-company-core/subagents/company-planner.md"
  "$ROOT/packages/pi-company-core/subagents/company-worker.md"
  "$ROOT/packages/pi-company-core/subagents/company-reviewer.md"
  "$ROOT/packages/pi-company-core/subagents/company-oracle.md"
  "$ROOT/adapters/generic/profile.json"
  "$ROOT/adapters/backend-api/profile.json"
  "$ROOT/adapters/be-readonly-fe/profile.json"
  "$ROOT/adapters/data/profile.json"
  "$ROOT/adapters/devops/profile.json"
  "$ROOT/adapters/docs/profile.json"
  "$ROOT/adapters/fullstack/profile.json"
  "$ROOT/adapters/mobile/profile.json"
  "$ROOT/adapters/node-typescript/profile.json"
  "$ROOT/adapters/python/profile.json"
  "$ROOT/adapters/web-frontend/profile.json"
  "$ROOT/templates/project/.pi/settings.json"
  "$ROOT/templates/project/.pi/company-profile.json"
  "$ROOT/templates/project/.mcp.json"
  "$ROOT/templates/project/.pi/mcp.json"
  "$ROOT/templates/project/.pi/project-context.md"
  "$ROOT/templates/project/.pi/.npmignore"
  "$ROOT/templates/project/.pi/memory/memory_summary.md"
  "$ROOT/templates/project/.pi/memory/MEMORY.md"
  "$ROOT/templates/project/.pi/.gitignore"
  "$ROOT/templates/project/REVIEW_GUIDELINES.md"
  "$ROOT/docs/quickstart-vietnamese.md"
  "$ROOT/docs/command-reference-vietnamese.md"
  "$ROOT/docs/auto-delegation-policy.md"
  "$ROOT/docs/subagent-orchestration-capabilities.md"
  "$ROOT/docs/project-onboarding.md"
  "$ROOT/docs/workflow-recipes.md"
  "$ROOT/docs/memory-policy.md"
  "$ROOT/docs/model-options.md"
  "$ROOT/docs/oauth-providers.md"
  "$ROOT/docs/subagents-and-multiagent.md"
  "$ROOT/docs/distribution-standard.md"
  "$ROOT/docs/publishing-for-teams.md"
  "$ROOT/docs/herdr-workflow.md"
  "$ROOT/docs/runtime-harness-standard.md"
  "$ROOT/docs/task-implementation-contract.md"
  "$ROOT/docs/runtime-quality-baseline.md"
  "$ROOT/docs/quality-benchmark.md"
  "$ROOT/docs/readiness-assessment.md"
  "$ROOT/docs/package-architecture-notes.md"
  "$ROOT/docs/runtime-policy-design.md"
  "$ROOT/schemas/project-profile.schema.json"
  "$ROOT/schemas/task-contract.schema.json"
  "$ROOT/templates/project/.pi/task-contract.template.json"
  "$ROOT/scripts/install-global.sh"
  "$ROOT/scripts/init-project.sh"
  "$ROOT/scripts/setup.sh"
  "$ROOT/scripts/team-doctor.sh"
  "$ROOT/scripts/link-project.sh"
  "$ROOT/scripts/profile-doctor.sh"
  "$ROOT/scripts/quality-benchmark.sh"
  "$ROOT/scripts/runtime-policy-smoke.sh"
  "$ROOT/scripts/pi-session-stats.sh"
  "$ROOT/scripts/pi-model-catalog.sh"
  "$ROOT/scripts/configure-model-scope.sh"
  "$ROOT/scripts/configure-mcp.sh"
  "$ROOT/scripts/configure-subagents.sh"
  "$ROOT/tests/company-guard-integration.test.mjs"
  "$ROOT/tests/policy-core.test.mjs"
  "$ROOT/tests/redaction-core.test.mjs"
  "$ROOT/tests/runtime-evidence.test.mjs"
)

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "Missing required file: $file"
    exit 1
  fi
done

node --input-type=module - "$ROOT" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
const jsonFiles = [
  "package.json",
  ".mcp.json",
  ".pi/settings.json",
  ".pi/company-profile.json",
  "packages/pi-company-core/package.json",
  "packages/pi-company-core/policies/base-policy.json",
  "adapters/generic/profile.json",
  "adapters/backend-api/profile.json",
  "adapters/be-readonly-fe/profile.json",
  "adapters/data/profile.json",
  "adapters/devops/profile.json",
  "adapters/docs/profile.json",
  "adapters/fullstack/profile.json",
  "adapters/mobile/profile.json",
  "adapters/node-typescript/profile.json",
  "adapters/python/profile.json",
  "adapters/web-frontend/profile.json",
  "templates/project/.pi/settings.json",
  "templates/project/.pi/company-profile.json",
  "templates/project/.mcp.json",
  "templates/project/.pi/task-contract.template.json",
  "templates/project/.pi/mcp.json",
  "templates/global/settings.json",
  "templates/global/mcp.json",
  "schemas/project-profile.schema.json",
  "schemas/task-contract.schema.json"
];

for (const rel of jsonFiles) {
  const target = path.join(root, rel);
  JSON.parse(fs.readFileSync(target, "utf8"));
}

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!rootPkg.pi || !rootPkg.pi.extensions || !rootPkg.pi.prompts || !rootPkg.pi.skills) {
  throw new Error("root package.json missing pi manifest");
}
if (!rootPkg.pi.subagents?.agents?.length) {
  throw new Error("root package.json missing pi.subagents.agents");
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "packages/pi-company-core/package.json"), "utf8"));
if (!pkg.pi || !pkg.pi.extensions || !pkg.pi.prompts || !pkg.pi.skills) {
  throw new Error("packages/pi-company-core/package.json missing pi manifest");
}
if (!pkg.pi.subagents?.agents?.length) {
  throw new Error("packages/pi-company-core/package.json missing pi.subagents.agents");
}
NODE

grep -R "auth.json" "$ROOT/docs" "$ROOT/packages/pi-company-core" "$ROOT/templates" >/dev/null
grep -R "company_context" "$ROOT/packages/pi-company-core" >/dev/null
grep -R "company_exec_policy_check" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_context_budget" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_tool_policy_check" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_task_gate_check" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_usage_snapshot" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "/company-usage" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/README.md" >/dev/null
grep -R "/company-commands" "$ROOT/README.md" "$ROOT/docs" "$ROOT/packages/pi-company-core/prompts" >/dev/null
grep -R "auto-delegation" "$ROOT/README.md" "$ROOT/docs" "$ROOT/packages/pi-company-core/prompts" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "Subagents used/not used" "$ROOT/packages/pi-company-core/prompts" "$ROOT/docs/auto-delegation-policy.md" >/dev/null
grep -R "Subagent orchestration capabilities" "$ROOT/README.md" "$ROOT/docs/subagent-orchestration-capabilities.md" >/dev/null
grep -R "pi-web-access" "$ROOT/README.md" "$ROOT/docs" "$ROOT/scripts/install-global.sh" "$ROOT/scripts/setup.sh" >/dev/null
grep -R "parallel-review" "$ROOT/docs" "$ROOT/README.md" >/dev/null
grep -R "intercomBridge" "$ROOT/scripts/configure-subagents.sh" "$ROOT/docs/subagents-and-multiagent.md" >/dev/null
grep -R "waitTool" "$ROOT/scripts/configure-subagents.sh" "$ROOT/docs/subagents-and-multiagent.md" >/dev/null
grep -R "company_profile_options" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_profile_apply" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_project_onboarding_record" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_memory_status" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_memory_note" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_memory_search" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_memory_citation_record" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "/onboard-project" "$ROOT/README.md" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "/memory-policy" "$ROOT/README.md" "$ROOT/docs" "$ROOT/packages/pi-company-core/prompts" >/dev/null
grep -R "/model-options" "$ROOT/README.md" "$ROOT/docs" "$ROOT/packages/pi-company-core/prompts" >/dev/null
grep -R "anthropic/claude" "$ROOT/README.md" "$ROOT/docs/model-options.md" "$ROOT/packages/pi-company-core/prompts/model-options.md" >/dev/null
grep -R "gpt-5.6" "$ROOT/README.md" "$ROOT/docs/model-options.md" "$ROOT/packages/pi-company-core/prompts/model-options.md" >/dev/null
grep -R "claude-fable-5" "$ROOT/README.md" "$ROOT/docs/model-options.md" "$ROOT/packages/pi-company-core/prompts/model-options.md" >/dev/null
grep -R "pi-company-models" "$ROOT/README.md" "$ROOT/docs/model-options.md" >/dev/null
grep -R "enabledModels" "$ROOT/templates/global/settings.json" "$ROOT/docs/model-options.md" "$ROOT/scripts/configure-model-scope.sh" >/dev/null
grep -R "pi-company-mcp" "$ROOT/README.md" "$ROOT/docs/mcp-and-tools.md" "$ROOT/scripts/configure-mcp.sh" >/dev/null
grep -R "pi-mcp-adapter" "$ROOT/README.md" "$ROOT/docs/mcp-and-tools.md" "$ROOT/scripts/install-global.sh" >/dev/null
grep -R "pi-company-subagents" "$ROOT/README.md" "$ROOT/docs/subagents-and-multiagent.md" "$ROOT/scripts/configure-subagents.sh" >/dev/null
grep -R "subagents-fleet" "$ROOT/docs/command-reference-vietnamese.md" "$ROOT/docs/subagents-and-multiagent.md" "$ROOT/README.md" >/dev/null
grep -R "health check" "$ROOT/docs/command-reference-vietnamese.md" "$ROOT/docs/subagents-and-multiagent.md" "$ROOT/README.md" >/dev/null
grep -R "pi-subagents" "$ROOT/README.md" "$ROOT/docs/subagents-and-multiagent.md" "$ROOT/scripts/install-global.sh" "$ROOT/scripts/setup.sh" >/dev/null
grep -R "company-scout" "$ROOT/README.md" "$ROOT/docs/subagents-and-multiagent.md" "$ROOT/packages/pi-company-core/subagents" >/dev/null
grep -R "@upstash/context7-mcp" "$ROOT/scripts/configure-mcp.sh" "$ROOT/docs/mcp-and-tools.md" >/dev/null
grep -R "https://mcp.figma.com/mcp" "$ROOT/scripts/configure-mcp.sh" "$ROOT/docs/mcp-and-tools.md" >/dev/null
grep -R "ghcr.io/github/github-mcp-server" "$ROOT/scripts/configure-mcp.sh" "$ROOT/docs/mcp-and-tools.md" >/dev/null
grep -R "Ctrl+L" "$ROOT/README.md" "$ROOT/docs/model-options.md" "$ROOT/docs/team-onboarding.md" "$ROOT/docs/quickstart-vietnamese.md" >/dev/null
grep -R "/platform-improve" "$ROOT/packages/pi-company-core/prompts" "$ROOT/docs" >/dev/null
grep -R "/be-to-fe" "$ROOT/packages/pi-company-core/prompts" "$ROOT/docs" >/dev/null
grep -R "/scout" "$ROOT/packages/pi-company-core/prompts" "$ROOT/docs" "$ROOT/README.md" >/dev/null
grep -R "company_context_preflight" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R ".pi/task-inbox" "$ROOT/.gitignore" "$ROOT/templates/project/.pi/.gitignore" "$ROOT/docs" >/dev/null
grep -R "Task Implementation Contract" "$ROOT/docs" "$ROOT/packages/pi-company-core/prompts" >/dev/null
grep -R "company-task-trace" "$ROOT/packages/pi-company-core/extensions/company-guard.ts" "$ROOT/docs" >/dev/null
grep -R "company-source-cache" "$ROOT/packages/pi-company-core/skills" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_source_checkout" "$ROOT/packages/pi-company-core" >/dev/null
grep -R "scripts/setup.sh" "$ROOT/README.md" "$ROOT/docs" >/dev/null
grep -R "quality-benchmark.sh" "$ROOT/README.md" "$ROOT/docs" >/dev/null
grep -R ".pi-subagents/" "$ROOT/.gitignore" "$ROOT/docs/subagents-and-multiagent.md" "$ROOT/docs/distribution-standard.md" "$ROOT/scripts/init-project.sh" >/dev/null
test -s "$ROOT/tests/policy-core.test.mjs"

public_wording_pattern="$(
  node --input-type=module <<'NODE'
const terms = [
  ["platform-", "mig", "ration"].join(""),
  ["codex-", "mig", "ration"].join(""),
  ["codex-", "par", "ity"].join(""),
  ["benchmark-", "par", "ity"].join(""),
  ["harness-", "mig", "ration"].join(""),
  ["agent-", "stuff"].join(""),
  ["mit", "suhiko"].join(""),
  ["Cod", "ex CLI"].join(""),
  ["Claude", " CLI"].join(""),
  ["Cod", "ex-inspired"].join(""),
  ["Cod", "ex-grade"].join(""),
  ["Pi vs ", "Codex"].join(""),
  ["vs ", "Claude"].join(""),
  ["reference ", "repo"].join(""),
  ["repo ", "tham ", "khảo"].join(""),
  ["nguồn ", "tham ", "khảo"].join(""),
  ["tham ", "khảo"].join("")
];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
console.log(terms.map(escapeRegex).join("|"));
NODE
)"

if grep -R -E -i \
  "$public_wording_pattern" \
  "$ROOT/README.md" \
  "$ROOT/docs" \
  "$ROOT/packages/pi-company-core/README.md" \
  "$ROOT/packages/pi-company-core/prompts" \
  "$ROOT/templates/project/AGENTS.md" >/dev/null; then
  echo "Public docs contain non-neutral platform wording"
  exit 1
fi

node --check "$ROOT/packages/pi-company-core/extensions/company-guard.ts" >/dev/null
node --check "$ROOT/packages/pi-company-core/extensions/policy-core.js" >/dev/null
node --check "$ROOT/packages/pi-company-core/extensions/redaction-core.js" >/dev/null
node --check "$ROOT/packages/pi-company-core/extensions/runtime-evidence.js" >/dev/null
(cd "$ROOT" && npm test) >/dev/null
if [[ -x "$ROOT/node_modules/.bin/tsc" ]]; then
  (cd "$ROOT" && npm run typecheck) >/dev/null
fi
bash -n "$ROOT/scripts/quality-benchmark.sh"
bash -n "$ROOT/scripts/runtime-policy-smoke.sh"
bash -n "$ROOT/scripts/pi-session-stats.sh"
bash -n "$ROOT/scripts/pi-model-catalog.sh"
bash -n "$ROOT/scripts/configure-model-scope.sh"
bash -n "$ROOT/scripts/configure-mcp.sh"
bash -n "$ROOT/scripts/configure-subagents.sh"
if [[ "$OFFLINE" == true || "${PI_COMPANY_VERIFY_OFFLINE:-}" == "1" || "${CI:-}" == "true" ]]; then
  echo "WARN: skipping local Pi model catalog check in offline/CI mode" >&2
else
  bash "$ROOT/scripts/pi-model-catalog.sh" --json >/dev/null
fi
bash "$ROOT/scripts/configure-model-scope.sh" --dry-run --preset full --default-model openai-codex/gpt-5.5:xhigh >/dev/null
bash "$ROOT/scripts/configure-mcp.sh" --list >/dev/null
bash "$ROOT/scripts/configure-mcp.sh" --dry-run --preset popular --scope project --project "$ROOT" >/dev/null
bash "$ROOT/scripts/configure-subagents.sh" --list >/dev/null
bash "$ROOT/scripts/configure-subagents.sh" --dry-run --preset safe >/dev/null
bash "$ROOT/scripts/runtime-policy-smoke.sh" >/dev/null

bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/.pi/company-profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/generic/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/backend-api/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/be-readonly-fe/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/data/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/devops/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/docs/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/fullstack/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/mobile/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/node-typescript/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/python/profile.json" >/dev/null
bash "$ROOT/scripts/profile-doctor.sh" "$ROOT" "$ROOT/adapters/web-frontend/profile.json" >/dev/null
bash "$ROOT/scripts/team-doctor.sh" "$ROOT" --strict-share >/dev/null

echo "PASS: pi-company-platform scaffold is complete"
