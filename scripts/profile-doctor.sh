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

function optionalArray(name) {
  if (profile[name] === undefined) return [];
  if (!Array.isArray(profile[name])) {
    errors.push(`${name} must be an array when provided`);
    return [];
  }
  return profile[name];
}

function warnShellOnlyProtectedPaths(shellProtectedPaths, protectedPaths, readOnlyPaths) {
  const writeGuardedPaths = new Set([...protectedPaths, ...readOnlyPaths]);
  for (const candidate of shellProtectedPaths) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) continue;
    if (writeGuardedPaths.has(candidate)) continue;
    warnings.push(`shellProtectedPaths-only path ${candidate} blocks shell access only; add it to protectedPaths to block read/write, or readOnlyPaths to allow read but block write/shell`);
  }
}

if (profile.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!profile.projectId) errors.push("projectId is required");
if (!profile.displayName) errors.push("displayName is required");
if (!profile.mode) errors.push("mode is required");

const rootMarkers = requireArray("rootMarkers");
const protectedPaths = requireArray("protectedPaths");
const shellProtectedPaths = optionalArray("shellProtectedPaths");
const readOnlyPaths = optionalArray("readOnlyPaths");
const requiredContext = requireArray("requiredContext");
const mcpCapabilities = requireArray("mcpCapabilities");

warnShellOnlyProtectedPaths(shellProtectedPaths, protectedPaths, readOnlyPaths);

const capabilityPacks = profile.capabilityPacks ?? [];
if (!Array.isArray(capabilityPacks)) {
  errors.push("capabilityPacks must be an array");
} else {
  const seenPacks = new Set();
  for (const [index, pack] of capabilityPacks.entries()) {
    if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
      errors.push(`capabilityPacks[${index}] must be an object`);
      continue;
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(pack.name ?? "")) {
      errors.push(`capabilityPacks[${index}].name is invalid`);
    }
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(pack.version ?? "")) {
      errors.push(`capabilityPacks[${index}].version is invalid`);
    }
    const key = `${pack.name}@${pack.version}`;
    if (seenPacks.has(key)) errors.push(`capabilityPacks contains duplicate ${key}`);
    seenPacks.add(key);
  }
}

const defaultCapabilityPolicy = {
  allowedOwners: [],
  allowedLifecycles: [],
  allowedFilesystemRead: [],
  allowedFilesystemWrite: [],
  allowedNetworkDomains: [],
  allowedExternalActions: []
};
const capabilityPolicy = profile.capabilityPolicy && typeof profile.capabilityPolicy === "object" && !Array.isArray(profile.capabilityPolicy)
  ? profile.capabilityPolicy
  : defaultCapabilityPolicy;
if (profile.capabilityPolicy !== undefined && capabilityPolicy === defaultCapabilityPolicy) errors.push("capabilityPolicy must be an object");
for (const key of ["allowedOwners", "allowedLifecycles", "allowedFilesystemRead", "allowedFilesystemWrite", "allowedNetworkDomains", "allowedExternalActions"]) {
  if (!Array.isArray(capabilityPolicy[key])) errors.push(`capabilityPolicy.${key} must be an array`);
}
for (const lifecycle of Array.isArray(capabilityPolicy.allowedLifecycles) ? capabilityPolicy.allowedLifecycles : []) {
  if (!["experimental", "stable", "deprecated"].includes(lifecycle)) {
    errors.push(`capabilityPolicy.allowedLifecycles contains invalid value ${lifecycle}`);
  }
}

if (!profile.verifyCommands || typeof profile.verifyCommands !== "object" || Array.isArray(profile.verifyCommands)) {
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

const defaultRuntimePolicy = {
  execPolicy: "enforce",
  contextBudget: "enforce",
  toolRegistry: "advisory",
  finalGate: "advisory"
};
const runtimePolicyOverrides = profile.runtimePolicy === undefined
  ? {}
  : profile.runtimePolicy && typeof profile.runtimePolicy === "object" && !Array.isArray(profile.runtimePolicy)
    ? profile.runtimePolicy
    : {};
if (profile.runtimePolicy !== undefined && runtimePolicyOverrides !== profile.runtimePolicy) errors.push("runtimePolicy must be an object");
const runtimePolicy = { ...defaultRuntimePolicy, ...runtimePolicyOverrides };
for (const [key, value] of Object.entries(runtimePolicy)) {
  if (!["off", "advisory", "enforce"].includes(value)) {
    errors.push(`runtimePolicy.${key} must be off, advisory, or enforce`);
  }
}

const verifyEntries = Object.entries(profile.verifyCommands ?? {});
if (verifyEntries.length === 0) {
  errors.push("verifyCommands has no entries");
}
for (const [key, commands] of verifyEntries) {
  if (!Array.isArray(commands) || commands.length === 0) {
    errors.push(`verifyCommands.${key} must be a non-empty array`);
    continue;
  }
  for (const command of commands) {
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
  shellProtectedPathCount: shellProtectedPaths.length,
  readOnlyPathCount: readOnlyPaths.length,
  verifyProfiles: verifyEntries.map(([key]) => key),
  mcpCapabilities,
  capabilityPacks: Array.isArray(capabilityPacks)
    ? capabilityPacks
      .filter((pack) => pack && typeof pack === "object" && !Array.isArray(pack))
      .map((pack) => `${String(pack.name ?? "<invalid>")}@${String(pack.version ?? "<invalid>")}`)
    : [],
  capabilityPolicy,
  runtimePolicy,
  warnings,
  errors
};

console.log(JSON.stringify(report, null, 2));

if (errors.length > 0) process.exit(1);
NODE
