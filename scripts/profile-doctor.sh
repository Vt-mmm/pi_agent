#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <project-path> [profile-json]"
  exit 2
fi

PROJECT_PATH="$1"
PROFILE_PATH="${2:-"$PROJECT_PATH/.pi/company-profile.json"}"

if [[ ! -d "$PROJECT_PATH" ]]; then
  echo "FAIL: project path does not exist: $PROJECT_PATH"
  exit 1
fi

if [[ ! -f "$PROFILE_PATH" ]]; then
  echo "FAIL: profile not found: $PROFILE_PATH"
  exit 1
fi

node --input-type=module - "$PROJECT_PATH" "$PROFILE_PATH" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [projectPath, profilePath] = process.argv.slice(2);
const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));

const errors = [];
const warnings = [];

function requireArray(name) {
  if (!Array.isArray(profile[name])) {
    errors.push(`${name} must be an array`);
    return [];
  }
  return profile[name];
}

if (profile.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!profile.projectId) errors.push("projectId is required");
if (!profile.displayName) errors.push("displayName is required");
if (!profile.mode) errors.push("mode is required");

const rootMarkers = requireArray("rootMarkers");
const protectedPaths = requireArray("protectedPaths");
const requiredContext = requireArray("requiredContext");
const mcpCapabilities = requireArray("mcpCapabilities");

if (!profile.verifyCommands || typeof profile.verifyCommands !== "object") {
  errors.push("verifyCommands must be an object");
}

const existingRootMarkers = rootMarkers.filter((marker) => fs.existsSync(path.join(projectPath, marker)));
if (existingRootMarkers.length === 0) {
  warnings.push(`no rootMarkers found in project: ${rootMarkers.join(", ")}`);
}

for (const contextPath of requiredContext) {
  if (contextPath.includes("<")) {
    warnings.push(`requiredContext has placeholder: ${contextPath}`);
    continue;
  }
  if (!fs.existsSync(path.join(projectPath, contextPath))) {
    warnings.push(`requiredContext missing in project: ${contextPath}`);
  }
}

if (protectedPaths.length === 0) warnings.push("protectedPaths is empty");
if (mcpCapabilities.length === 0) warnings.push("mcpCapabilities is empty");

const verifyEntries = Object.entries(profile.verifyCommands ?? {});
if (verifyEntries.length === 0) {
  errors.push("verifyCommands has no entries");
}
for (const [key, commands] of verifyEntries) {
  if (!Array.isArray(commands) || commands.length === 0) {
    errors.push(`verifyCommands.${key} must be a non-empty array`);
  }
  for (const command of commands ?? []) {
    if (typeof command !== "string" || command.trim().length === 0) {
      errors.push(`verifyCommands.${key} contains an empty command`);
    }
  }
}

const report = {
  projectPath,
  profilePath,
  projectId: profile.projectId,
  mode: profile.mode,
  rootMarkersFound: existingRootMarkers,
  requiredContextCount: requiredContext.length,
  protectedPathCount: protectedPaths.length,
  verifyProfiles: verifyEntries.map(([key]) => key),
  mcpCapabilities,
  warnings,
  errors
};

console.log(JSON.stringify(report, null, 2));

if (errors.length > 0) process.exit(1);
NODE

