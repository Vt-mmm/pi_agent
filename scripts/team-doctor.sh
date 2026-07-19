#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/team-doctor.sh [project-path] [--strict-share]

Checks:
  - Pi/Herdr availability
  - Root package Pi manifest
  - MCP adapter/baseline visibility
  - Project .pi/settings.json package source
  - Project company profile
  - No local-machine paths in share-critical files when --strict-share is used
USAGE
}

PROJECT_PATH=""
STRICT_SHARE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict-share)
      STRICT_SHARE=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
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

PLATFORM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="${PROJECT_PATH:-$PWD}"

node --input-type=module - "$PLATFORM_ROOT" "$PROJECT_PATH" "$STRICT_SHARE" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [platformRoot, projectPath, strictShareRaw] = process.argv.slice(2);
const strictShare = strictShareRaw === "true";
const errors = [];
const warnings = [];

function exists(rel) {
  return fs.existsSync(path.join(platformRoot, rel));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`], { stdio: "ignore" });
  return result.status === 0;
}

for (const rel of [
  "package.json",
  "packages/pi-company-core/extensions/company-guard.ts",
  "packages/pi-company-core/prompts/onboard-project.md",
  "packages/pi-company-core/prompts/profiles.md",
  "packages/pi-company-core/prompts/memory-policy.md",
  "packages/pi-company-core/prompts/platform-migration.md",
  "packages/pi-company-core/prompts/be-to-fe.md",
  "packages/pi-company-core/prompts/task.md",
  "packages/pi-company-core/prompts/discuss.md",
  "templates/project/.pi/settings.json",
  "templates/project/.pi/company-profile.json",
  "templates/project/.mcp.json",
  "templates/project/.pi/mcp.json",
  "templates/project/.pi/project-context.md",
  "templates/project/.pi/memory/memory_summary.md",
  "templates/project/.pi/memory/MEMORY.md",
  "scripts/setup.sh",
  "scripts/configure-mcp.sh"
]) {
  if (!exists(rel)) errors.push(`missing platform file: ${rel}`);
}

const rootPackage = readJson(path.join(platformRoot, "package.json"));
if (!rootPackage.pi?.extensions?.length) errors.push("root package.json missing pi.extensions");
if (!rootPackage.pi?.skills?.length) errors.push("root package.json missing pi.skills");
if (!rootPackage.pi?.prompts?.length) errors.push("root package.json missing pi.prompts");

if (!commandExists("pi")) warnings.push("pi is not on PATH");
if (!commandExists("herdr")) warnings.push("herdr is not on PATH; Herdr integration optional");

function readJsonIfPresent(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    warnings.push(`cannot parse JSON: ${file}`);
    return null;
  }
}

function mcpSummary(file) {
  const json = readJsonIfPresent(file);
  if (!json) return { file, exists: fs.existsSync(file), serverCount: 0, servers: [] };
  const mcpServers = json.mcpServers && typeof json.mcpServers === "object" && !Array.isArray(json.mcpServers)
    ? json.mcpServers
    : {};
  return { file, exists: true, serverCount: Object.keys(mcpServers).length, servers: Object.keys(mcpServers).sort() };
}

let piHasMcpAdapter = false;
if (commandExists("pi")) {
  const piList = spawnSync("pi", ["list"], { encoding: "utf8" });
  const combined = `${piList.stdout ?? ""}\n${piList.stderr ?? ""}`;
  piHasMcpAdapter = combined.includes("pi-mcp-adapter");
  if (!piHasMcpAdapter) warnings.push("Pi MCP adapter not found in `pi list`; run setup with --with-mcp or `pi install npm:pi-mcp-adapter`");
}

const mcpFiles = [
  path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "", ".config"), "mcp", "mcp.json"),
  path.join(process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME || "", ".pi", "agent"), "mcp.json"),
  path.join(projectPath, ".mcp.json"),
  path.join(projectPath, ".pi", "mcp.json")
];
const mcp = mcpFiles.map(mcpSummary);
const totalMcpServers = mcp.reduce((sum, item) => sum + item.serverCount, 0);
if (piHasMcpAdapter && totalMcpServers === 0) {
  warnings.push("Pi MCP adapter is installed but no MCP servers are configured; run `pi-company-mcp --preset core --scope global` or `/mcp setup`");
}

const projectSettingsPath = path.join(projectPath, ".pi", "settings.json");
if (fs.existsSync(projectSettingsPath)) {
  const settings = readJson(projectSettingsPath);
  const packages = Array.isArray(settings.packages) ? settings.packages : [];
  if (packages.length === 0) errors.push("project .pi/settings.json has no packages");
  for (const source of packages) {
    if (typeof source === "string" && source.includes("__PI_COMPANY_PACKAGE_SOURCE__")) {
      errors.push("project .pi/settings.json still has package source placeholder");
    }
    if (strictShare && typeof source === "string" && source.startsWith("/")) {
      warnings.push(`project package source is absolute path, not team-portable: ${source}`);
    }
  }
} else {
  warnings.push("project has no .pi/settings.json");
}

const projectProfilePath = path.join(projectPath, ".pi", "company-profile.json");
if (fs.existsSync(projectProfilePath)) {
  const profile = readJson(projectProfilePath);
  for (const field of ["schemaVersion", "projectId", "displayName", "mode"]) {
    if (profile[field] === undefined || profile[field] === "") errors.push(`project profile missing ${field}`);
  }
  for (const field of ["rootMarkers", "protectedPaths", "requiredContext", "mcpCapabilities"]) {
    if (!Array.isArray(profile[field])) errors.push(`project profile ${field} must be array`);
  }
  if (Array.isArray(profile.requiredContext) && !profile.requiredContext.includes(".pi/project-context.md")) {
    warnings.push("project profile does not require .pi/project-context.md");
  }
} else {
  warnings.push("project has no .pi/company-profile.json");
}

const projectContextPath = path.join(projectPath, ".pi", "project-context.md");
if (fs.existsSync(projectContextPath)) {
  const projectContext = fs.readFileSync(projectContextPath, "utf8");
  if (/Generated:\s*not yet/i.test(projectContext)) {
    warnings.push("project onboarding snapshot is still pending; run /onboard-project in Pi after login/model selection");
  }
} else {
  warnings.push("project has no .pi/project-context.md; run setup/init or /onboard-project");
}

const memorySummaryPath = path.join(projectPath, ".pi", "memory", "memory_summary.md");
const memoryHandbookPath = path.join(projectPath, ".pi", "memory", "MEMORY.md");
if (!fs.existsSync(memorySummaryPath) || !fs.existsSync(memoryHandbookPath)) {
  warnings.push("project has no .pi/memory scaffold; run setup/init or use /memory-policy before relying on project memory");
}

if (strictShare) {
  const shareCriticalFiles = [
    "README.md",
    "docs/quickstart-vietnamese.md",
    "docs/team-onboarding.md",
    "docs/project-onboarding.md",
    "docs/workflow-recipes.md",
    "docs/memory-policy.md",
    "docs/publishing-for-teams.md",
    "templates/project/.pi/settings.json",
    "templates/global/settings.json",
    "packages/pi-company-core/skills/company-reference-repo/SKILL.md"
  ];
  const forbidden = [
    /\/Users\/[^/\s]+\/Documents\/Working\b/,
    /Documents\/Working/
  ];
  for (const rel of shareCriticalFiles) {
    const file = path.join(platformRoot, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        errors.push(`share-critical file has local/default-forbidden reference ${pattern}: ${rel}`);
      }
    }
  }
}

const report = {
  platformRoot,
  projectPath,
  strictShare,
  piOnPath: commandExists("pi"),
  herdrOnPath: commandExists("herdr"),
  piHasMcpAdapter,
  mcp,
  rootPiManifest: rootPackage.pi,
  warnings,
  errors
};

console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exit(1);
NODE
