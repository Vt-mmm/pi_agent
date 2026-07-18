#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "$ROOT/README.md"
  "$ROOT/AGENTS.md"
  "$ROOT/package.json"
  "$ROOT/.pi/settings.json"
  "$ROOT/.pi/company-profile.json"
  "$ROOT/.pi/project-context.md"
  "$ROOT/.pi/memory/memory_summary.md"
  "$ROOT/.pi/memory/MEMORY.md"
  "$ROOT/packages/pi-company-core/package.json"
  "$ROOT/packages/pi-company-core/extensions/company-guard.ts"
  "$ROOT/packages/pi-company-core/prompts/onboard-project.md"
  "$ROOT/packages/pi-company-core/prompts/profiles.md"
  "$ROOT/packages/pi-company-core/prompts/memory-policy.md"
  "$ROOT/packages/pi-company-core/prompts/platform-migration.md"
  "$ROOT/packages/pi-company-core/prompts/be-to-fe.md"
  "$ROOT/packages/pi-company-core/prompts/task.md"
  "$ROOT/packages/pi-company-core/prompts/discuss.md"
  "$ROOT/packages/pi-company-core/prompts/plan.md"
  "$ROOT/packages/pi-company-core/prompts/review.md"
  "$ROOT/packages/pi-company-core/skills/company-ops/SKILL.md"
  "$ROOT/packages/pi-company-core/skills/company-reference-repo/SKILL.md"
  "$ROOT/packages/pi-company-core/skills/company-reference-repo/checkout-reference-repo.sh"
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
  "$ROOT/templates/project/.pi/project-context.md"
  "$ROOT/templates/project/.pi/memory/memory_summary.md"
  "$ROOT/templates/project/.pi/memory/MEMORY.md"
  "$ROOT/templates/project/.pi/.gitignore"
  "$ROOT/templates/project/REVIEW_GUIDELINES.md"
  "$ROOT/docs/quickstart-vietnamese.md"
  "$ROOT/docs/project-onboarding.md"
  "$ROOT/docs/workflow-recipes.md"
  "$ROOT/docs/memory-policy.md"
  "$ROOT/docs/harness-migration-standard.md"
  "$ROOT/docs/task-implementation-contract.md"
  "$ROOT/docs/readiness-assessment.md"
  "$ROOT/docs/agent-stuff-research.md"
  "$ROOT/docs/codex-migration-reference.md"
  "$ROOT/schemas/project-profile.schema.json"
  "$ROOT/schemas/task-contract.schema.json"
  "$ROOT/templates/project/.pi/task-contract.template.json"
  "$ROOT/scripts/install-global.sh"
  "$ROOT/scripts/init-project.sh"
  "$ROOT/scripts/setup.sh"
  "$ROOT/scripts/team-doctor.sh"
  "$ROOT/scripts/link-project.sh"
  "$ROOT/scripts/profile-doctor.sh"
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

const pkg = JSON.parse(fs.readFileSync(path.join(root, "packages/pi-company-core/package.json"), "utf8"));
if (!pkg.pi || !pkg.pi.extensions || !pkg.pi.prompts || !pkg.pi.skills) {
  throw new Error("packages/pi-company-core/package.json missing pi manifest");
}
NODE

grep -R "auth.json" "$ROOT/docs" "$ROOT/packages/pi-company-core" "$ROOT/templates" >/dev/null
grep -R "company_context" "$ROOT/packages/pi-company-core" >/dev/null
grep -R "company_profile_options" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_profile_apply" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_project_onboarding_record" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_memory_status" "$ROOT/packages/pi-company-core" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_memory_note" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_memory_search" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "company_memory_citation_record" "$ROOT/packages/pi-company-core" "$ROOT/docs" >/dev/null
grep -R "/onboard-project" "$ROOT/README.md" "$ROOT/docs" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "/memory-policy" "$ROOT/README.md" "$ROOT/docs" "$ROOT/packages/pi-company-core/prompts" >/dev/null
grep -R "/platform-migration" "$ROOT/packages/pi-company-core/prompts" "$ROOT/docs" >/dev/null
grep -R "/be-to-fe" "$ROOT/packages/pi-company-core/prompts" "$ROOT/docs" >/dev/null
grep -R "Codex CLI" "$ROOT/docs/codex-migration-reference.md" >/dev/null
grep -R "Task Implementation Contract" "$ROOT/docs" "$ROOT/packages/pi-company-core/prompts" >/dev/null
grep -R "company-task-trace" "$ROOT/packages/pi-company-core/extensions/company-guard.ts" "$ROOT/docs" >/dev/null
grep -R "mitsuhiko/agent-stuff" "$ROOT/docs/agent-stuff-research.md" "$ROOT/README.md" >/dev/null
grep -R "company-reference-repo" "$ROOT/packages/pi-company-core/skills" "$ROOT/templates/project/AGENTS.md" >/dev/null
grep -R "company_reference_checkout" "$ROOT/packages/pi-company-core" >/dev/null
grep -R "scripts/setup.sh" "$ROOT/README.md" "$ROOT/docs" >/dev/null

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
