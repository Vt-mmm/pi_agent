import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  evaluateExecPolicyCore,
  extractShellGlobCandidates,
  extractShellPathCandidates,
  findProtectedPathInCommand,
  globMatchesPath,
  matchesProtectedPath,
  normalizePathCandidate,
  matchesAnyPath
} from "./policy-core.js";
import {
  appendObservedBashResult,
  commandMatchesVerifyPlan,
  createBashResultLedger,
  findMatchingObservedBashResult,
  readObservedBashResults,
  observedBashResultFromToolResultEvent
} from "./runtime-evidence.js";
import {
  redactForStorage,
  redactSensitiveText
} from "./redaction-core.js";
import {
  resolveCapabilityProfileDocument,
  verifyCapabilityLock,
  writeProfileLockAtomic
} from "../capabilities/capability-core.js";

type ProjectProfile = {
  schemaVersion?: number;
  projectId?: string;
  displayName?: string;
  mode?: string;
  permissionProfile?: PermissionProfileMode;
  protectedPaths?: string[];
  shellProtectedPaths?: string[];
  readOnlyPaths?: string[];
  requiredContext?: string[];
  verifyCommands?: Record<string, string[]>;
  mcpCapabilities?: string[];
  capabilityPacks?: Array<{ name: string; version: string }>;
  capabilityPolicy?: {
    allowedOwners?: string[];
    allowedLifecycles?: Array<"experimental" | "stable" | "deprecated">;
    allowedFilesystemRead?: string[];
    allowedFilesystemWrite?: string[];
    allowedNetworkDomains?: string[];
    allowedExternalActions?: string[];
  };
  memory?: MemorySettings;
  runtimePolicy?: RuntimePolicySettings;
};

type MemorySettings = {
  enabled?: boolean;
  mode?: "off" | "manual" | "assisted" | "external-package";
  scope?: "project" | "global" | "hybrid";
  summaryFile?: string;
  handbookFile?: string;
  localDir?: string;
  readBeforeTask?: boolean;
  writePolicy?: "explicit-only" | "task-trace" | "session-summary";
  maxInjectedChars?: number;
  externalPackages?: string[];
};

type RuntimePolicySettings = {
  execPolicy?: "off" | "advisory" | "enforce";
  contextBudget?: "off" | "advisory" | "enforce";
  toolRegistry?: "off" | "advisory" | "enforce";
  finalGate?: "off" | "advisory" | "enforce";
};

type PermissionProfileMode = "read-only" | "workspace-write" | "trusted-full-access";

type PermissionProfilesConfig = {
  defaultMode?: PermissionProfileMode;
  allowedModes?: PermissionProfileMode[];
};

type ResolvedPermissionProfile = {
  mode: PermissionProfileMode;
  source: "env" | "command" | "profile" | "default" | "invalid-env" | "invalid-profile" | "policy-fallback";
  requested?: string;
  warning?: string;
  runtimeEquivalent: string;
};

type ProfileOption = {
  name: string;
  displayName?: string;
  mode?: string;
  description: string;
  recommended: boolean;
  reason: string;
};

type ProjectOnboardingSnapshot = {
  schemaVersion: 1;
  projectId?: string;
  profileMode?: string;
  contextFile: string;
  summary: string;
  model?: string;
  sourceFiles: Array<{ path: string; reason: string }>;
  updateTriggers: string[];
  notes?: string;
  recordedAt: string;
};

type TaskContract = {
  taskId: string;
  summary: string;
  riskLane: "tiny" | "normal" | "high-risk";
  expectedOutput: string;
  acceptanceCriteria: string[];
  scope: string[];
  outOfScope: string[];
  protectedPaths: string[];
  requiredContext: string[];
  contextManifest: Array<{ path: string; reason: string }>;
  memoryCitations: Array<{ path: string; reason: string }>;
  mcpCapabilities: string[];
  verifyCommands: string[];
  changedFiles: string[];
  verifyEvidence: Array<{
    command: string;
    exitCode: number;
    summary: string;
    recordedAt: string;
    observed?: boolean;
    observedAt?: string;
    isError?: boolean;
    matchedProfileCommand?: boolean;
  }>;
  trace: {
    outcome: "pending" | "completed" | "blocked" | "partial" | "failed";
    friction?: string;
    notes?: string;
    recordedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
};

type BasePolicy = {
  protectedPaths: string[];
  shellProtectedPaths?: string[];
  blockedCommandPatterns: string[];
  requireConfirmationPatterns: string[];
  defaultRequiredContext: string[];
  permissionProfiles?: PermissionProfilesConfig;
  execPolicy?: ExecPolicyConfig;
  contextBudget?: ContextBudgetConfig;
  toolRegistry?: ToolRegistryConfig;
  finalGate?: FinalGateConfig;
  externalActionPolicy?: ExternalActionPolicyConfig;
};

type CommandRule = {
  id: string;
  action: "allow" | "prompt" | "forbid";
  match: "prefix" | "contains" | "regex";
  value: string | string[];
  reason: string;
};

type ExecPolicyConfig = {
  defaultMode?: "advisory" | "enforce";
  bannedPrefixSuggestions?: string[][];
  rules?: CommandRule[];
};

type ContextBudgetConfig = {
  defaultMode?: "advisory" | "enforce";
  maxContextFileChars?: number;
  maxMemoryFileChars?: number;
  maxManifestFiles?: number;
  warnFragmentChars?: number;
};

type ToolRegistryConfig = {
  defaultMode?: "advisory" | "enforce";
  alwaysAllowedTools?: string[];
  toolCapabilities?: Record<string, string[]>;
};

type ExternalActionPolicyConfig = {
  defaultMode?: "advisory" | "enforce";
  providerKeywords?: string[];
  writeVerbs?: string[];
  safeVerbs?: string[];
};

type FinalGateConfig = {
  defaultMode?: "advisory" | "enforce";
  requireTaskContract?: boolean;
  requireContextManifest?: boolean;
  requireVerifyEvidence?: boolean;
  requireTrace?: boolean;
  requirePassingVerify?: boolean;
};

type EffectiveProtectedPaths = {
  readProtectedPaths: string[];
  writeProtectedPaths: string[];
  shellProtectedPaths: string[];
  readOnlyPaths: string[];
};

type UsageSnapshot = {
  sessionFile?: string;
  sessionId?: string;
  sessionName?: string;
  cwd: string;
  mode: string;
  model: string;
  thinkingLevel: string;
  entries: {
    total: number;
    branch: number;
  };
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
  exactTotals: {
    availableInCommand: false;
    howToRead: string[];
  };
};

type ContextPreflight = {
  workflow: string;
  inputChars: number;
  inputTokenEstimate: number;
  liveContext?: UsageSnapshot["contextUsage"];
  projectedContext?: {
    tokens: number;
    percent: number;
  };
  recommendation: "ok" | "watch" | "compact" | "fresh-session" | "unknown";
  reason: string;
  commands: string[];
};

type ReferenceRepo = {
  host: string;
  owner: string;
  repo: string;
  cloneUrl: string;
  checkoutPath: string;
  commit?: string;
  fetched: boolean;
};

const COMPANY_TRACE_STATE_TYPE = "company-task-trace";
const CONTEXT_WATCH_PERCENT = 50;
const CONTEXT_COMPACT_PERCENT = 70;
const CONTEXT_FRESH_PERCENT = 82;
const LONG_INPUT_CHARS = 8000;
const BOILERPLATE_COLLAPSE_CHARS = 300;
const MAX_INLINE_COLLAPSED_TASK_CHARS = 2200;
const MAX_CHAT_IMAGE_ATTACHMENTS = 4;
const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"] as const;

type ChatImageAttachmentResult = {
  text: string;
  images: Array<{ type: "image"; data: string; mimeType: string }>;
  attached: Array<{ marker: string; path: string; mimeType: string; bytes: number }>;
  skipped: Array<{ path: string; reason: string }>;
};

const DEFAULT_MEMORY_SETTINGS: Required<MemorySettings> = {
  enabled: true,
  mode: "manual",
  scope: "project",
  summaryFile: ".pi/memory/memory_summary.md",
  handbookFile: ".pi/memory/MEMORY.md",
  localDir: ".pi/memory/local",
  readBeforeTask: true,
  writePolicy: "explicit-only",
  maxInjectedChars: 4000,
  externalPackages: []
};

const DEFAULT_RUNTIME_POLICY: Required<RuntimePolicySettings> = {
  execPolicy: "enforce",
  contextBudget: "enforce",
  toolRegistry: "advisory",
  finalGate: "enforce"
};

const PERMISSION_PROFILE_MODES = ["read-only", "workspace-write", "trusted-full-access"] as const;
const PERMISSION_PROFILE_ALIASES: Record<string, PermissionProfileMode> = {
  readonly: "read-only",
  "read_only": "read-only",
  "read-only": "read-only",
  workspace: "workspace-write",
  "workspace_write": "workspace-write",
  "workspace-write": "workspace-write",
  "full-access": "trusted-full-access",
  "full_access": "trusted-full-access",
  "trusted-full-access": "trusted-full-access",
  "trusted_full_access": "trusted-full-access",
  "danger-full-access": "trusted-full-access",
  "danger_full_access": "trusted-full-access"
};
const READ_ONLY_TOOL_NAMES = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOL_NAMES = new Set(["write", "edit"]);
const SHELL_TOOL_NAMES = new Set(["bash", "shell", "exec"]);
const MAX_SHELL_ARG_COUNT = 256;
const MAX_SHELL_ARG_CHARS = 16_384;
const MAX_SHELL_COMMAND_CHARS = 131_072;
const MAX_MCP_PROXY_ARGS_CHARS = 131_072;
const SESSION_PERMISSION_OVERRIDES = new Map<string, PermissionProfileMode>();

const DEFAULT_POLICY: BasePolicy = {
  protectedPaths: [".git/**", "**/auth.json", "**/.env", "**/.env.*", ".pi/settings.json", ".pi/company-profile.json", ".pi/company-profile.lock.json"],
  shellProtectedPaths: [".git/**", "**/auth.json", "**/.env", "**/.env.*", ".pi/settings.json", ".pi/company-profile.json", ".pi/company-profile.lock.json"],
  blockedCommandPatterns: ["rm -rf /", "rm -rf ~", "rm -rf $HOME", "git reset --hard", "git clean -fd"],
  requireConfirmationPatterns: ["deploy", "release", "publish", "migration", "gh pr merge", "git push"],
  defaultRequiredContext: ["AGENTS.md", "README.md"],
  permissionProfiles: {
    defaultMode: "workspace-write",
    allowedModes: ["read-only", "workspace-write", "trusted-full-access"]
  },
  execPolicy: {
    defaultMode: "enforce",
    bannedPrefixSuggestions: [
      ["python"],
      ["python3"],
      ["node"],
      ["node", "-e"],
      ["bash"],
      ["bash", "-lc"],
      ["sh"],
      ["sh", "-c"],
      ["zsh"],
      ["zsh", "-lc"],
      ["git"],
      ["sudo"],
      ["env"]
    ],
    rules: [
      {
        id: "prompt-git-add-broad",
        action: "prompt",
        match: "regex",
        value: "(?:^|\\s)git\\s+(?:-C\\s+\\S+\\s+)?add\\s+(?:(?:--all|-A)(?:\\s+(?:\\.|:/))?|--\\s+(?:\\.|:/)|(?:\\.|:/))(?:\\s|$)",
        reason: "Broad git staging can include unrelated or sensitive changes; inspect git status/diff and confirm the exact scope first."
      }
    ]
  },
  contextBudget: {
    defaultMode: "enforce",
    maxContextFileChars: 50000,
    maxMemoryFileChars: 20000,
    maxManifestFiles: 80,
    warnFragmentChars: 4000
  },
  toolRegistry: {
    defaultMode: "advisory",
    alwaysAllowedTools: [
      "company_context",
      "company_permission_status",
      "company_exec_policy_check",
      "company_context_budget",
      "company_tool_policy_check",
      "company_task_gate_check",
      "company_usage_snapshot",
      "company_memory_status",
      "company_memory_note",
      "company_memory_search",
      "company_memory_citation_record",
      "company_profile_options",
      "company_profile_apply",
      "company_project_onboarding_record",
      "company_task_start",
      "company_source_checkout",
      "company_context_record",
      "company_verify_record",
      "company_trace_record"
    ],
    toolCapabilities: {
      bash: ["shell"],
      shell: ["shell"],
      exec: ["shell"],
      read: ["filesystem-readonly"],
      grep: ["filesystem-readonly"],
      find: ["filesystem-readonly"],
      ls: ["filesystem-readonly"],
      write: ["filesystem-write"],
      edit: ["filesystem-write"],
      browser: ["browser"],
      github: ["github"]
    }
  },
  externalActionPolicy: {
    defaultMode: "enforce",
    providerKeywords: [
      "github",
      "gitlab",
      "bitbucket",
      "vercel",
      "netlify",
      "cloudflare",
      "aws",
      "gcp",
      "azure",
      "slack",
      "teams",
      "jira",
      "linear",
      "notion",
      "figma",
      "stripe",
      "supabase",
      "firebase"
    ],
    writeVerbs: [
      "add",
      "approve",
      "archive",
      "assign",
      "close",
      "comment",
      "create",
      "delete",
      "deploy",
      "dispatch",
      "merge",
      "open",
      "post",
      "publish",
      "push",
      "release",
      "remove",
      "reopen",
      "run",
      "send",
      "submit",
      "trigger",
      "update",
      "upload",
      "write"
    ],
    safeVerbs: [
      "fetch",
      "find",
      "get",
      "inspect",
      "list",
      "read",
      "search",
      "show",
      "view"
    ]
  },
  finalGate: {
    defaultMode: "enforce",
    requireTaskContract: true,
    requireContextManifest: true,
    requireVerifyEvidence: true,
    requireTrace: true,
    requirePassingVerify: true
  }
};

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function findPackageRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "policies"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

function findPlatformRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, "package.json")) && fs.existsSync(path.join(current, "adapters"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return startDir;
    current = parent;
  }
}

function loadPolicy(extensionDir: string): BasePolicy {
  const root = findPackageRoot(extensionDir);
  return readJsonFile<BasePolicy>(path.join(root, "policies", "base-policy.json")) ?? DEFAULT_POLICY;
}

function fallbackProfile(cwd: string, mode = "unprofiled"): ProjectProfile {
  return {
    schemaVersion: 1,
    projectId: path.basename(cwd),
    displayName: path.basename(cwd),
    mode,
    protectedPaths: [],
    requiredContext: []
  };
}

function loadProfile(cwd: string, projectTrusted = false): ProjectProfile {
  const explicit = process.env.PI_COMPANY_PROFILE;
  if (explicit && explicit.trim().length > 0) {
    return readJsonFile<ProjectProfile>(explicit) ?? fallbackProfile(cwd, "explicit-profile-unreadable");
  }

  if (!projectTrusted) {
    return fallbackProfile(cwd, "unprofiled-global-package");
  }

  return readJsonFile<ProjectProfile>(path.join(cwd, ".pi", "company-profile.json")) ?? fallbackProfile(cwd, projectTrusted ? "unprofiled" : "unprofiled-global-package");
}

function loadProfileFromContext(ctx: ExtensionContext): ProjectProfile {
  return loadProfile(ctx.cwd, ctx.isProjectTrusted());
}

function normalizeRelative(cwd: string, candidate: unknown): string | undefined {
  if (typeof candidate !== "string" || candidate.trim().length === 0) return undefined;
  let raw = candidate.trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)) {
    if (!raw.toLowerCase().startsWith("file://")) return undefined;
    try {
      raw = fileURLToPath(raw);
    } catch {
      return undefined;
    }
  }
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  return path.relative(cwd, absolute).split(path.sep).join("/");
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "project";
}

function titleize(input: string): string {
  const cleaned = input.replace(/[-_]+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (char) => char.toUpperCase()) : "Project";
}

function projectProfilePath(cwd: string): string {
  return path.join(cwd, ".pi", "company-profile.json");
}

function projectPackageSource(cwd: string): string {
  const settings = readJsonFile<{ packages?: unknown[] }>(path.join(cwd, ".pi", "settings.json"));
  const source = settings?.packages?.find((item): item is string => typeof item === "string" && item.length > 0);
  return source ?? "workspace";
}

type ProjectCapabilityState = {
  ok: boolean;
  reason?: string;
  filesystemRead?: string[];
  filesystemWrite?: string[];
};

function verifyProjectCapabilityState(extensionDir: string, cwd: string, projectTrusted: boolean): ProjectCapabilityState {
  if (process.env.PI_COMPANY_PROFILE?.trim()) return { ok: true };
  if (!projectTrusted) return { ok: true };
  const profilePath = projectProfilePath(cwd);
  if (!fs.existsSync(profilePath)) return { ok: true };
  const profile = readJsonFile<ProjectProfile>(profilePath);
  if (!profile || !Array.isArray(profile.capabilityPacks)) return { ok: true };
  const lockPath = path.join(cwd, ".pi", "company-profile.lock.json");
  if (!fs.existsSync(lockPath)) return { ok: false, reason: "Capability lock is missing. Reapply the project profile." };
  const lock = readJsonFile<Record<string, unknown>>(lockPath);
  if (!lock) return { ok: false, reason: "Capability lock is unreadable. Reapply the project profile." };
  try {
    const verification = verifyCapabilityLock(findPlatformRoot(extensionDir), profilePath, lock, {
      packageSource: projectPackageSource(cwd)
    });
    return verification.ok
      ? {
          ok: true,
          filesystemRead: verification.expected.permissions.filesystemRead,
          filesystemWrite: verification.expected.permissions.filesystemWrite
        }
      : { ok: false, reason: "Capability lock does not match the active profile, package source, or installed platform." };
  } catch (error) {
    return { ok: false, reason: `Capability validation failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function evaluateExecPolicy(command: string, profile: ProjectProfile, policy: BasePolicy): {
  mode: RuntimePolicySettings["execPolicy"];
  decision: "allow" | "prompt" | "forbid";
  reasons: string[];
  segments: Array<{ command: string; words: string[]; matches: string[]; warnings: string[] }>;
} {
  const runtime = resolveRuntimePolicy(profile);
  const execPolicy = execPolicyConfig(policy);
  const mode = runtime.execPolicy === "off" ? "off" : runtime.execPolicy ?? execPolicy.defaultMode;
  return evaluateExecPolicyCore(command, { policy: { ...policy, execPolicy }, mode }) as {
    mode: RuntimePolicySettings["execPolicy"];
    decision: "allow" | "prompt" | "forbid";
    reasons: string[];
    segments: Array<{ command: string; words: string[]; matches: string[]; warnings: string[] }>;
  };
}

function evaluateToolPolicy(toolName: string, profile: ProjectProfile, policy: BasePolicy): {
  mode: RuntimePolicySettings["toolRegistry"];
  decision: "allow" | "warn" | "block";
  requiredCapabilities: string[];
  availableCapabilities: string[];
  reason: string;
} {
  const runtime = resolveRuntimePolicy(profile);
  const registry = toolRegistryConfig(policy);
  const mode = runtime.toolRegistry === "off" ? "off" : runtime.toolRegistry ?? registry.defaultMode;
  if (mode === "off") {
    return { mode, decision: "allow", requiredCapabilities: [], availableCapabilities: profile.mcpCapabilities ?? [], reason: "Tool registry is disabled for this profile." };
  }
  if (registry.alwaysAllowedTools.includes(toolName) || toolName.startsWith("company_")) {
    return { mode, decision: "allow", requiredCapabilities: [], availableCapabilities: profile.mcpCapabilities ?? [], reason: "Company platform tool is always allowed." };
  }
  const requiredCapabilities = registry.toolCapabilities[toolName] ?? [];
  if (requiredCapabilities.length === 0) {
    return { mode, decision: mode === "enforce" ? "block" : "warn", requiredCapabilities, availableCapabilities: profile.mcpCapabilities ?? [], reason: "Tool is not registered in company tool registry." };
  }
  const available = new Set(profile.mcpCapabilities ?? []);
  const missing = requiredCapabilities.filter((capability) => !available.has(capability));
  if (missing.length === 0) {
    return { mode, decision: "allow", requiredCapabilities, availableCapabilities: profile.mcpCapabilities ?? [], reason: "Required capability is present." };
  }
  return {
    mode,
    decision: mode === "enforce" ? "block" : "warn",
    requiredCapabilities,
    availableCapabilities: profile.mcpCapabilities ?? [],
    reason: `Missing capability: ${missing.join(", ")}`
  };
}

const CONTENT_INPUT_FIELDS = new Set([
  "body",
  "command",
  "content",
  "description",
  "message",
  "new",
  "newtext",
  "old",
  "oldtext",
  "pattern",
  "prompt",
  "query",
  "reason",
  "regex",
  "replacement",
  "source",
  "summary",
  "text"
]);

const FILESYSTEM_SCOPE_FIELDS = new Set([
  "absolutepath",
  "basepath",
  "cwd",
  "dest",
  "destination",
  "destinationdirectory",
  "destinationpath",
  "dir",
  "directory",
  "directorypath",
  "file",
  "filepath",
  "filename",
  "filenames",
  "files",
  "from",
  "inputpath",
  "location",
  "local",
  "localpath",
  "newpath",
  "notebookpath",
  "oldpath",
  "output",
  "outputfile",
  "outputpath",
  "path",
  "paths",
  "rootpath",
  "root",
  "source",
  "sourcedirectory",
  "sourcepath",
  "src",
  "target",
  "targetdirectory",
  "targetpath",
  "to",
  "workingdirectory",
  "uri"
]);

const COPY_SOURCE_FIELDS = new Set([
  "from",
  "inputpath",
  "oldpath",
  "source",
  "sourcedirectory",
  "sourcepath",
  "src"
]);
const FILESYSTEM_SCOPE_FIELD_SUFFIXES = new Set([
  "cwd", "dir", "directory", "file", "filename", "folder", "path", "workdir"
]);

function isContentInputField(field: string | undefined): boolean {
  return field !== undefined && CONTENT_INPUT_FIELDS.has(field.toLowerCase().replace(/[-_]/g, ""));
}

function isFilesystemScopeField(fieldPath: string): boolean {
  const field = fieldPath.split(".").at(-1)?.replace(/\[\d+\]$/, "");
  if (field === undefined) return false;
  const normalized = field.toLowerCase().replace(/[-_]/g, "");
  if (FILESYSTEM_SCOPE_FIELDS.has(normalized)) return true;
  const finalToken = field
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[-_]/)
    .filter(Boolean)
    .at(-1);
  return finalToken !== undefined && FILESYSTEM_SCOPE_FIELD_SUFFIXES.has(finalToken);
}

function filesystemFieldAccessMode(
  toolName: string,
  fieldPath: string,
  writesFilesystem: boolean
): "read" | "write" {
  if (!writesFilesystem) return "read";
  const toolTokens = new Set(actionTokens(toolName));
  const rawField = fieldPath.split(".").at(-1)?.replace(/\[\d+\]$/, "") ?? "";
  const field = rawField.toLowerCase().replace(/[-_]/g, "");
  const firstFieldToken = rawField
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[-_]/)
    .filter(Boolean)[0];
  // Copy/upload read their local source and write only their destination.
  // Move/rename are intentionally excluded because they also mutate source.
  if (
    (toolTokens.has("copy") || toolTokens.has("upload"))
    && (COPY_SOURCE_FIELDS.has(field) || ["from", "input", "local", "old", "source", "src"].includes(firstFieldToken ?? ""))
  ) return "read";
  return "write";
}

function usesFilesystemContentFields(toolName: string, allowAmbiguousSource = true): boolean {
  if (["read", "write", "edit", "grep", "find", "ls"].includes(toolName)) return true;
  const tokens = new Set(actionTokens(toolName));
  const strongFilesystemSemantics = [
    "copy", "directory", "download", "file", "files", "filesystem", "folder", "fs",
    "move", "path", "rename", "upload"
  ].some((token) => tokens.has(token));
  if (strongFilesystemSemantics) return true;
  // `source` is ambiguous. Inspect it by default for protected paths, but let
  // configured external providers use it as ordinary metadata unless the tool
  // itself has strong filesystem semantics (for example upload_file).
  return allowAmbiguousSource;
}

function inspectRepositoryPathBoundary(cwd: string, candidate: string): { reason?: string } {
  const normalized = normalizePathCandidate(candidate);
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    return { reason: `path resolves outside the project: ${candidate}` };
  }
  let current = cwd;
  for (const segment of normalized.split("/").filter((item) => item && item !== ".")) {
    current = path.join(current, segment);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return { reason: `path traverses symbolic link: ${path.relative(cwd, current)}` };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code === "ENOENT") break;
      return { reason: `path component cannot be inspected: ${path.relative(cwd, current)}` };
    }
  }
  return {};
}

function resolveRepositoryPathCandidate(cwd: string, candidate: string): string | undefined {
  const normalized = normalizePathCandidate(candidate);
  if (normalized === ".." || normalized.startsWith("../")) return undefined;

  const relative = path.posix.isAbsolute(normalized)
    ? path.relative(cwd, normalized).split(path.sep).join("/")
    : normalized;
  if (relative === ".." || relative.startsWith("../")) return undefined;

  const pending = relative.split("/").filter((item) => item && item !== ".");
  let current = cwd;
  let resolvedDepth = 0;
  for (let index = 0; index < pending.length; index += 1) {
    const next = path.join(current, pending[index]);
    try {
      fs.lstatSync(next);
      current = next;
      resolvedDepth = index + 1;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
      if (code !== "ENOENT") return undefined;
      break;
    }
  }

  let canonicalBase: string;
  try {
    canonicalBase = fs.realpathSync.native(current);
  } catch {
    return undefined;
  }
  const canonical = path.resolve(canonicalBase, ...pending.slice(resolvedDepth));
  const canonicalRoot = fs.realpathSync.native(cwd);
  const canonicalRelative = path.relative(canonicalRoot, canonical).split(path.sep).join("/");
  if (canonicalRelative === ".." || canonicalRelative.startsWith("../") || path.isAbsolute(canonicalRelative)) return undefined;
  return canonicalRelative || ".";
}

function findResolvedProtectedPathInCommand(
  cwd: string,
  command: string,
  protectedPatterns: string[]
): { candidate: string; resolved: string; pattern: string } | undefined {
  for (const candidate of extractShellPathCandidates(command)) {
    const relative = normalizeRelative(cwd, candidate);
    if (!relative) continue;
    const resolved = resolveRepositoryPathCandidate(cwd, relative);
    if (!resolved || resolved === relative) continue;
    const pattern = matchesProtectedPath(resolved, protectedPatterns);
    if (pattern) return { candidate, resolved, pattern };
  }
  return undefined;
}

const MAX_TOOL_INPUT_INSPECTION_DEPTH = 32;

type StringInputWalkResult = {
  items: Array<{ field: string; value: string }>;
  maxDepthExceeded?: string;
};

function walkStringInputs(
  value: unknown,
  keyPath: string[] = [],
  depth = 0,
  includeFilesystemContentFields = false
): StringInputWalkResult {
  if (depth > MAX_TOOL_INPUT_INSPECTION_DEPTH) {
    return { items: [], maxDepthExceeded: keyPath.join(".") || "(input)" };
  }

  if (typeof value === "string") {
    const field = keyPath.at(-1);
    const fieldPath = keyPath.join(".") || "(input)";
    if (isContentInputField(field) && !(includeFilesystemContentFields && isFilesystemScopeField(fieldPath))) {
      return { items: [] };
    }
    return { items: [{ field: fieldPath, value }] };
  }

  if (Array.isArray(value)) {
    const result: StringInputWalkResult = { items: [] };
    for (const item of value) {
      const child = walkStringInputs(item, keyPath, depth + 1, includeFilesystemContentFields);
      result.items.push(...child.items);
      if (child.maxDepthExceeded) result.maxDepthExceeded ??= child.maxDepthExceeded;
    }
    return result;
  }

  if (!value || typeof value !== "object") return { items: [] };

  const result: StringInputWalkResult = { items: [] };
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childResult = walkStringInputs(child, [...keyPath, key], depth + 1, includeFilesystemContentFields);
    result.items.push(...childResult.items);
    if (childResult.maxDepthExceeded) result.maxDepthExceeded ??= childResult.maxDepthExceeded;
  }
  return result;
}

function inspectPathInputsFromInput(
  cwd: string,
  input: Record<string, unknown>,
  includeFilesystemContentFields = false
): {
  paths: Array<{ field: string; path: string }>;
  maxDepthExceeded?: string;
} {
  const paths: Array<{ field: string; path: string }> = [];
  const seen = new Set<string>();
  const walked = walkStringInputs(input, [], 0, includeFilesystemContentFields);
  for (const item of walked.items) {
    const normalized = normalizeRelative(cwd, item.value);
    if (normalized === undefined) continue;
    const key = `${item.field}\0${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push({ field: item.field, path: normalized });
  }
  return { paths, maxDepthExceeded: walked.maxDepthExceeded };
}

function extractPathInputsFromInput(cwd: string, input: Record<string, unknown>): Array<{ field: string; path: string }> {
  return inspectPathInputsFromInput(cwd, input).paths;
}

function extractLikelyPathFromInput(cwd: string, input: Record<string, unknown>): string | undefined {
  return extractPathInputsFromInput(cwd, input)[0]?.path;
}

function expandSimpleGlobAlternatives(pattern: string, max = 24): { values: string[]; complete: boolean } {
  let results = [pattern];
  let changed = true;
  let complete = true;

  while (changed) {
    changed = false;
    const expanded: string[] = [];
    for (const item of results) {
      const match = item.match(/\{([^{}]+)\}/);
      if (!match) {
        expanded.push(item);
        continue;
      }
      changed = true;
      const options = match[1].split(",").map((option) => option.trim());
      for (const option of options) {
        expanded.push(`${item.slice(0, match.index)}${option}${item.slice((match.index ?? 0) + match[0].length)}`);
        if (expanded.length >= max) {
          complete = false;
          break;
        }
      }
      if (expanded.length >= max) break;
    }
    results = expanded.slice(0, max);
  }

  return { values: results, complete };
}

function shellGlobSegmentMatches(patternSegment: string, candidateSegment: string): boolean {
  if (candidateSegment.startsWith(".") && !patternSegment.startsWith(".")) return false;
  let source = "";
  for (let index = 0; index < patternSegment.length; index += 1) {
    const char = patternSegment[index];
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    if (char === "[") {
      const end = patternSegment.indexOf("]", index + 1);
      const body = end > index + 1 ? patternSegment.slice(index + 1, end) : "";
      if (body && /^[!^A-Za-z0-9_-]+$/.test(body)) {
        const negated = body.startsWith("!") ? `^${body.slice(1)}` : body;
        source += `[${negated}]`;
        index = end;
        continue;
      }
    }
    source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, "i").test(candidateSegment);
}

function shellGlobMatchesPath(pattern: string, candidate: string): boolean {
  const patternSegments = normalizePathCandidate(pattern).split("/").filter(Boolean);
  const candidateSegments = normalizePathCandidate(candidate).split("/").filter(Boolean);

  function match(patternIndex: number, candidateIndex: number): boolean {
    if (patternIndex === patternSegments.length) return candidateIndex === candidateSegments.length;
    const patternSegment = patternSegments[patternIndex];
    if (patternSegment === "**") {
      if (match(patternIndex + 1, candidateIndex)) return true;
      for (let next = candidateIndex; next < candidateSegments.length; next += 1) {
        if (match(patternIndex + 1, next + 1)) return true;
      }
      return false;
    }
    if (candidateIndex >= candidateSegments.length) return false;
    return shellGlobSegmentMatches(patternSegment, candidateSegments[candidateIndex])
      && match(patternIndex + 1, candidateIndex + 1);
  }

  return patternSegments.length > 0 && candidateSegments.length > 0 && match(0, 0);
}

function protectedPatternExamples(pattern: string): string[] {
  const normalized = normalizePathCandidate(pattern);
  if (!normalized) return [];

  const examples = new Set<string>();
  const add = (value: string | undefined) => {
    const normalizedValue = normalizePathCandidate(value ?? "");
    if (normalizedValue) examples.add(normalizedValue);
  };

  add(normalized);

  if (normalized.endsWith("/**")) {
    const base = normalized.slice(0, -3);
    add(base);
    add(`${base}/probe`);
  }

  if (normalized.startsWith("**/")) {
    const tail = normalized.slice(3);
    const concreteTail = tail
      .replace(/\*\*/g, "nested")
      .replace(/\*/g, tail.includes(".env.") ? "local" : "probe");
    add(tail);
    add(concreteTail);
    add(`nested/${concreteTail}`);
  }

  const concrete = normalized
    .replace(/^\*\*\//, "")
    .replace(/\/\*\*$/, "/probe")
    .replace(/\*\*/g, "nested")
    .replace(/\*/g, normalized.includes(".env.") ? "local" : "probe");
  add(concrete);

  for (const example of [...examples]) {
    const base = path.posix.basename(example);
    if (base && base !== "probe") examples.add(base);
  }

  return [...examples];
}

function protectedLiteralHints(pattern: string): string[] {
  const normalized = normalizePathCandidate(pattern).toLowerCase();
  if (!normalized) return [];

  const hints = new Set<string>();
  const add = (value: string | undefined) => {
    const cleaned = normalizePathCandidate(value ?? "").toLowerCase().replace(/\/$/, "");
    if (cleaned && cleaned !== "**" && cleaned !== "." && cleaned.length >= 3) hints.add(cleaned);
  };

  const withoutLeadingGlob = normalized.replace(/^\*\*\//, "");
  const wildcardIndex = withoutLeadingGlob.search(/[*?{\[]/);
  if (wildcardIndex > 0) add(withoutLeadingGlob.slice(0, wildcardIndex));
  if (wildcardIndex < 0) add(withoutLeadingGlob);

  for (const example of protectedPatternExamples(pattern)) {
    if (/[*?{\[\]]/.test(example)) continue;
    add(example);
    add(path.posix.basename(example));
  }

  if (normalized.includes(".env")) add(".env");

  return [...hints].sort((left, right) => right.length - left.length);
}

function globMentionsProtectedHint(candidateGlob: string, pattern: string): boolean {
  const normalizedGlob = normalizePathCandidate(candidateGlob).toLowerCase();
  if (!normalizedGlob) return false;
  return protectedLiteralHints(pattern).some((hint) => normalizedGlob.includes(hint));
}

function globTargetsProtectedPath(glob: unknown, protectedPatterns: string[]): { glob: string; pattern: string; example: string } | undefined {
  const values = Array.isArray(glob) ? glob : [glob];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("!")) continue;

    const expanded = expandSimpleGlobAlternatives(trimmed);
    if (!expanded.complete) return { glob: trimmed, pattern: "bounded glob expansion", example: "a protected path" };
    for (const candidateGlob of expanded.values) {
      for (const pattern of protectedPatterns) {
        if (!globMentionsProtectedHint(candidateGlob, pattern)) continue;
        for (const example of protectedPatternExamples(pattern)) {
          if (
            globMatchesPath(candidateGlob, example)
            || globMatchesPath(`**/${candidateGlob}`, example)
            || globMatchesPath(candidateGlob, path.posix.basename(example))
          ) {
            return { glob: trimmed, pattern, example };
          }
        }
      }
    }
  }
  return undefined;
}

function shellGlobTargetsProtectedPath(
  command: string,
  protectedPatterns: string[]
): { glob: string; pattern: string; example: string } | undefined {
  for (const candidate of extractShellGlobCandidates(command)) {
    if (!/[*?{\[]/.test(candidate)) continue;
    const expanded = expandSimpleGlobAlternatives(candidate);
    if (!expanded.complete) return { glob: candidate, pattern: "bounded glob expansion", example: "a protected path" };
    for (const candidateGlob of expanded.values) {
      for (const pattern of protectedPatterns) {
        for (const example of protectedPatternExamples(pattern)) {
          if (/[*?{\[\]]/.test(example)) continue;
          if (
            shellGlobMatchesPath(candidateGlob, example)
            || shellGlobMatchesPath(`**/${candidateGlob}`, example)
            || shellGlobMatchesPath(candidateGlob, path.posix.basename(example))
          ) {
            return { glob: candidate, pattern, example };
          }
        }
      }
    }
  }
  return undefined;
}

function countChangedStringLeaves(before: unknown, after: unknown): number {
  if (typeof before === "string" && typeof after === "string") return before === after ? 0 : 1;
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.reduce((total, item, index) => total + countChangedStringLeaves(item, after[index]), 0);
  }
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return 0;
  return Object.entries(before as Record<string, unknown>).reduce(
    (total, [key, value]) => total + countChangedStringLeaves(value, (after as Record<string, unknown>)[key]),
    0
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactToolResultTextContent(content: unknown): { content: unknown; redacted: number } {
  if (!Array.isArray(content)) return { content, redacted: 0 };
  let redacted = 0;
  const safeContent = content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const typed = block as { type?: unknown; text?: unknown };
    if (typed.type !== "text" || typeof typed.text !== "string") return block;
    const safeText = redactSensitiveText(typed.text);
    if (!safeText.redacted) return block;
    redacted += 1;
    return { ...block, text: safeText.text };
  });
  return { content: safeContent, redacted };
}

function evaluatePathLikeToolAccess(
  cwd: string,
  toolName: string,
  input: Record<string, unknown>,
  writeProtectedPaths: string[],
  readProtectedPaths: string[],
  readOnlyPaths: string[],
  filesystemRead?: string[],
  filesystemWrite?: string[],
  options: {
    forceScopeAware?: boolean;
    forceWrite?: boolean;
    allowAmbiguousFilesystemContentFields?: boolean;
  } = {}
): { block: boolean; reason?: string } {
  const scopeAwareTool = options.forceScopeAware === true || ["read", "write", "edit", "grep", "find", "ls"].includes(toolName)
    || /(?:^|[_-])(?:fs|filesystem)(?:[_-]|$)/i.test(toolName);
  const inspection = inspectPathInputsFromInput(
    cwd,
    input,
    usesFilesystemContentFields(toolName, options.allowAmbiguousFilesystemContentFields !== false)
  );
  if (inspection.maxDepthExceeded) {
    return {
      block: true,
      reason: `Blocked ${toolName}: tool input nesting exceeds inspection depth at ${inspection.maxDepthExceeded}`
    };
  }

  const writesFilesystem = options.forceWrite === true || ["write", "edit"].includes(toolName)
    || (scopeAwareTool && /(?:write|edit|create|delete|move|rename|upload|update|patch|set|replace|append|copy)/i.test(toolName));
  const scopeGlobs = toolName === "grep"
    ? (Array.isArray(input.glob) ? input.glob : [input.glob])
    : toolName === "find"
      ? (Array.isArray(input.pattern) ? input.pattern : [input.pattern])
      : [];
  for (const value of scopeGlobs) {
    if (typeof value !== "string") continue;
    const candidate = value.startsWith("!") ? value.slice(1) : value;
    const unsafe = candidate.length === 0
      || candidate.length > 512
      || candidate.includes("\\")
      || candidate.includes("\0")
      || path.posix.isAbsolute(candidate)
      || /^[A-Za-z]:/.test(candidate)
      || candidate.split("/").some((segment) => segment === "..");
    if (unsafe) return { block: true, reason: `Blocked ${toolName} unsafe scope pattern: ${value}` };
  }
  const inspectedPaths = [...inspection.paths];
  if (["grep", "find", "ls"].includes(toolName) && !inspectedPaths.some((item) => isFilesystemScopeField(item.field))) {
    inspectedPaths.push({ field: "path", path: "." });
  }

  for (const item of inspectedPaths) {
    if (scopeAwareTool && isFilesystemScopeField(item.field)) {
      const boundary = inspectRepositoryPathBoundary(cwd, item.path);
      if (boundary.reason) return { block: true, reason: `Blocked ${toolName}: ${boundary.reason}` };
    }
    const resolvedPath = resolveRepositoryPathCandidate(cwd, item.path);
    const readMatched = matchesProtectedPath(item.path, readProtectedPaths)
      ?? (resolvedPath ? matchesProtectedPath(resolvedPath, readProtectedPaths) : undefined);
    if (readMatched) {
      return {
        block: true,
        reason: `Blocked ${toolName} access to protected path from ${item.field}: ${item.path} matches ${readMatched}`
      };
    }

    const fieldAccessMode = filesystemFieldAccessMode(toolName, item.field, writesFilesystem);
    if (fieldAccessMode === "write") {
      const readOnlyMatched = matchesProtectedPath(item.path, readOnlyPaths)
        ?? (resolvedPath ? matchesProtectedPath(resolvedPath, readOnlyPaths) : undefined);
      if (readOnlyMatched) {
        return {
          block: true,
          reason: `Blocked ${toolName} write to read-only path from ${item.field}: ${item.path} matches ${readOnlyMatched}`
        };
      }
      const writeMatched = matchesProtectedPath(item.path, writeProtectedPaths)
        ?? (resolvedPath ? matchesProtectedPath(resolvedPath, writeProtectedPaths) : undefined);
      if (writeMatched) {
        return {
          block: true,
          reason: `Blocked ${toolName} write to protected path from ${item.field}: ${item.path} matches ${writeMatched}`
        };
      }
      if (scopeAwareTool && filesystemWrite && isFilesystemScopeField(item.field) && !matchesAnyPath(item.path, filesystemWrite)) {
        return {
          block: true,
          reason: `Blocked ${toolName} write outside resolved filesystem scope from ${item.field}: ${item.path}`
        };
      }
    } else if (scopeAwareTool && filesystemRead && isFilesystemScopeField(item.field) && !matchesAnyPath(item.path, filesystemRead)) {
      return {
        block: true,
        reason: `Blocked ${toolName} read outside resolved filesystem scope from ${item.field}: ${item.path}`
      };
    }
  }

  if (toolName === "grep") {
    const hit = globTargetsProtectedPath(input.glob, readProtectedPaths);
    if (hit) {
      return {
        block: true,
        reason: `Blocked grep glob targeting protected path: ${hit.glob} can match ${hit.example} via ${hit.pattern}`
      };
    }
  }

  if (toolName === "find") {
    const hit = globTargetsProtectedPath(input.pattern, readProtectedPaths);
    if (hit) {
      return {
        block: true,
        reason: `Blocked find pattern targeting protected path: ${hit.glob} can match ${hit.example} via ${hit.pattern}`
      };
    }
  }

  return { block: false };
}

function grepOutputLinePath(line: string): string | undefined {
  const match = line.match(/^(.+?)(?::\d+:|-\d+-)/);
  return match?.[1];
}

function filterGrepProtectedContent(content: unknown, protectedPatterns: string[]): {
  changed: boolean;
  content?: unknown;
  redactedLines: number;
} {
  if (!Array.isArray(content)) return { changed: false, redactedLines: 0 };

  let changed = false;
  let redactedLines = 0;
  const filtered = content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const text = (block as { type?: unknown; text?: unknown }).text;
    if ((block as { type?: unknown }).type !== "text" || typeof text !== "string") return block;

    const kept: string[] = [];
    let blockRedactedLines = 0;
    for (const line of text.split(/\r?\n/)) {
      const linePath = grepOutputLinePath(line);
      if (linePath && matchesProtectedPath(linePath, protectedPatterns)) {
        changed = true;
        redactedLines += 1;
        blockRedactedLines += 1;
        continue;
      }
      kept.push(line);
    }

    if (blockRedactedLines === 0) return block;
    const notice = `[Company Pi guard redacted ${blockRedactedLines} protected grep line${blockRedactedLines === 1 ? "" : "s"}.]`;
    const nextText = kept.join("\n").trim().length > 0
      ? `${kept.join("\n")}\n${notice}`
      : `No matches found in non-protected paths.\n${notice}`;
    return { ...block, text: nextText };
  });

  return { changed, content: filtered, redactedLines };
}

function resultLineProtectedPathCandidates(cwd: string, basePath: string, line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith("No ") || trimmed === "(empty directory)") return [];
  const entry = trimmed.replace(/[\\/]+$/, "");
  const candidates = new Set<string>();
  const add = (value: string | undefined) => {
    if (value !== undefined) candidates.add(value);
  };

  add(normalizeRelative(cwd, entry));
  add(normalizeRelative(cwd, path.posix.join(basePath || ".", entry)));
  return [...candidates];
}

function filterProtectedPathListContent(
  cwd: string,
  content: unknown,
  protectedPatterns: string[],
  basePath: string,
  toolName: string
): {
  changed: boolean;
  content?: unknown;
  redactedLines: number;
} {
  if (!Array.isArray(content)) return { changed: false, redactedLines: 0 };

  let changed = false;
  let redactedLines = 0;
  const filtered = content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const text = (block as { type?: unknown; text?: unknown }).text;
    if ((block as { type?: unknown }).type !== "text" || typeof text !== "string") return block;

    const kept: string[] = [];
    let blockRedactedLines = 0;
    for (const line of text.split(/\r?\n/)) {
      const candidates = resultLineProtectedPathCandidates(cwd, basePath, line);
      if (candidates.some((candidate) => matchesProtectedPath(candidate, protectedPatterns))) {
        changed = true;
        redactedLines += 1;
        blockRedactedLines += 1;
        continue;
      }
      kept.push(line);
    }

    if (blockRedactedLines === 0) return block;
    const notice = `[Company Pi guard redacted ${blockRedactedLines} protected ${toolName} line${blockRedactedLines === 1 ? "" : "s"}.]`;
    const nextText = kept.join("\n").trim().length > 0
      ? `${kept.join("\n")}\n${notice}`
      : `No entries found in non-protected paths.\n${notice}`;
    return { ...block, text: nextText };
  });

  return { changed, content: filtered, redactedLines };
}

function stateRoot(cwd: string): string {
  return path.join(cwd, ".pi", "company-state");
}

function taskFilePath(cwd: string, taskId: string): string {
  return path.join(stateRoot(cwd), "tasks", `${safeTaskId(taskId)}.json`);
}

function projectContextFilePath(cwd: string): string {
  return path.join(cwd, ".pi", "project-context.md");
}

function onboardingStateFilePath(cwd: string): string {
  return path.join(stateRoot(cwd), "project-onboarding.json");
}

function traceFilePath(cwd: string): string {
  return path.join(stateRoot(cwd), "traces.jsonl");
}

function observedBashLedgerPath(cwd: string): string {
  return path.join(stateRoot(cwd), "observed-bash.jsonl");
}

function safeTaskId(taskId: string): string {
  return taskId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "task";
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureStateDirs(cwd: string): void {
  fs.mkdirSync(path.join(stateRoot(cwd), "tasks"), { recursive: true });
}

function ensureProjectContextPlaceholder(cwd: string): void {
  fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
  const target = projectContextFilePath(cwd);
  if (fs.existsSync(target)) return;
  fs.writeFileSync(target, [
    "# Project Context",
    "",
    "## Status",
    "",
    "- Generated: not yet",
    "- Profile: see `.pi/company-profile.json`",
    "- Model/pass: run `/onboard-project` after Pi login and model selection",
    "- Scope: pending",
    "",
    "Run `/onboard-project` to replace this placeholder with a concise project context snapshot.",
    ""
  ].join("\n"));
}

function resolveMemorySettings(profile: ProjectProfile): Required<MemorySettings> {
  return {
    ...DEFAULT_MEMORY_SETTINGS,
    ...(profile.memory ?? {}),
    externalPackages: profile.memory?.externalPackages ?? DEFAULT_MEMORY_SETTINGS.externalPackages
  };
}

function resolveRuntimePolicy(profile: ProjectProfile): Required<RuntimePolicySettings> {
  return {
    ...DEFAULT_RUNTIME_POLICY,
    ...(profile.runtimePolicy ?? {})
  };
}

function normalizePermissionProfileMode(value: unknown): PermissionProfileMode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return PERMISSION_PROFILE_ALIASES[normalized];
}

function runtimeEquivalentForPermissionProfile(mode: PermissionProfileMode): string {
  if (mode === "read-only") return "sandbox_mode=read-only";
  if (mode === "trusted-full-access") return "sandbox_mode=danger-full-access + approval_policy=never, with Company protected-path and human-action gates still enforced";
  return "sandbox_mode=workspace-write + approval_policy=on-request";
}

function sessionPermissionOverrideKey(ctx: ExtensionContext): string {
  return `${ctx.cwd}\u0000${ctx.sessionManager.getSessionId()}`;
}

function permissionOverrideFromContext(ctx: ExtensionContext): PermissionProfileMode | undefined {
  return SESSION_PERMISSION_OVERRIDES.get(sessionPermissionOverrideKey(ctx));
}

function setPermissionOverrideForContext(ctx: ExtensionContext, mode: PermissionProfileMode): void {
  SESSION_PERMISSION_OVERRIDES.set(sessionPermissionOverrideKey(ctx), mode);
}

function permissionProfilesConfig(policy: BasePolicy): Required<PermissionProfilesConfig> {
  const configuredDefault = normalizePermissionProfileMode(policy.permissionProfiles?.defaultMode)
    ?? normalizePermissionProfileMode(DEFAULT_POLICY.permissionProfiles?.defaultMode)
    ?? "workspace-write";
  const configuredAllowed = policy.permissionProfiles?.allowedModes
    ?.map((item) => normalizePermissionProfileMode(item))
    .filter((item): item is PermissionProfileMode => item !== undefined)
    ?? DEFAULT_POLICY.permissionProfiles?.allowedModes
    ?? ["read-only", "workspace-write"];
  const allowedModes = Array.from(new Set(configuredAllowed));
  if (!allowedModes.length) return { defaultMode: "read-only", allowedModes: ["read-only"] };
  return {
    defaultMode: allowedModes.includes(configuredDefault) ? configuredDefault : "read-only",
    allowedModes
  };
}

function resolvePermissionProfile(
  profile: ProjectProfile,
  policy: BasePolicy,
  commandOverride?: PermissionProfileMode
): ResolvedPermissionProfile {
  const config = permissionProfilesConfig(policy);
  const envOverride = process.env.PI_COMPANY_PERMISSION_PROFILE?.trim();
  const requested = envOverride || commandOverride || profile.permissionProfile;
  const source = envOverride ? "env" : commandOverride ? "command" : profile.permissionProfile ? "profile" : "default";
  const resolved = requested ? normalizePermissionProfileMode(requested) : config.defaultMode;

  if (!resolved) {
    const mode: PermissionProfileMode = "read-only";
    return {
      mode,
      source: envOverride ? "invalid-env" : "invalid-profile",
      requested: String(requested),
      warning: `Invalid permission profile ${String(requested)}; failed closed to read-only.`,
      runtimeEquivalent: runtimeEquivalentForPermissionProfile(mode)
    };
  }

  if (!config.allowedModes.includes(resolved)) {
    const mode: PermissionProfileMode = config.allowedModes.includes("read-only") ? "read-only" : config.allowedModes[0];
    return {
      mode,
      source: "policy-fallback",
      requested: String(requested ?? resolved),
      warning: `Permission profile ${resolved} is not allowed by policy; using ${mode}.`,
      runtimeEquivalent: runtimeEquivalentForPermissionProfile(mode)
    };
  }

  return {
    mode: resolved,
    source,
    requested: requested ? String(requested) : undefined,
    runtimeEquivalent: runtimeEquivalentForPermissionProfile(resolved)
  };
}

function isCompanyTool(toolName: string): boolean {
  return toolName.startsWith("company_");
}

function evaluatePermissionProfileToolAccess(
  toolName: string,
  permissionProfile: ResolvedPermissionProfile
): { block: boolean; reason?: string } {
  if (permissionProfile.mode !== "read-only") return { block: false };
  if (isCompanyTool(toolName) || READ_ONLY_TOOL_NAMES.has(toolName)) return { block: false };
  if (WRITE_TOOL_NAMES.has(toolName)) {
    return { block: true, reason: `Permission profile read-only blocked ${toolName}: filesystem writes are disabled.` };
  }
  if (SHELL_TOOL_NAMES.has(toolName)) {
    return { block: true, reason: `Permission profile read-only blocked ${toolName}: shell execution is disabled.` };
  }
  return { block: true, reason: `Permission profile read-only blocked ${toolName}: only read, grep, find, ls, and company tools are allowed.` };
}

function contextBudgetConfig(policy: BasePolicy): Required<ContextBudgetConfig> {
  return {
    defaultMode: policy.contextBudget?.defaultMode ?? DEFAULT_POLICY.contextBudget?.defaultMode ?? "enforce",
    maxContextFileChars: policy.contextBudget?.maxContextFileChars ?? DEFAULT_POLICY.contextBudget?.maxContextFileChars ?? 50000,
    maxMemoryFileChars: policy.contextBudget?.maxMemoryFileChars ?? DEFAULT_POLICY.contextBudget?.maxMemoryFileChars ?? 20000,
    maxManifestFiles: policy.contextBudget?.maxManifestFiles ?? DEFAULT_POLICY.contextBudget?.maxManifestFiles ?? 80,
    warnFragmentChars: policy.contextBudget?.warnFragmentChars ?? DEFAULT_POLICY.contextBudget?.warnFragmentChars ?? 4000
  };
}

function execPolicyConfig(policy: BasePolicy): Required<ExecPolicyConfig> {
  return {
    defaultMode: policy.execPolicy?.defaultMode ?? DEFAULT_POLICY.execPolicy?.defaultMode ?? "enforce",
    bannedPrefixSuggestions: policy.execPolicy?.bannedPrefixSuggestions ?? DEFAULT_POLICY.execPolicy?.bannedPrefixSuggestions ?? [],
    rules: policy.execPolicy?.rules ?? []
  };
}

function toolRegistryConfig(policy: BasePolicy): Required<ToolRegistryConfig> {
  return {
    defaultMode: policy.toolRegistry?.defaultMode ?? DEFAULT_POLICY.toolRegistry?.defaultMode ?? "advisory",
    alwaysAllowedTools: policy.toolRegistry?.alwaysAllowedTools ?? DEFAULT_POLICY.toolRegistry?.alwaysAllowedTools ?? [],
    toolCapabilities: policy.toolRegistry?.toolCapabilities ?? DEFAULT_POLICY.toolRegistry?.toolCapabilities ?? {}
  };
}

function externalActionPolicyConfig(policy: BasePolicy): Required<ExternalActionPolicyConfig> {
  return {
    defaultMode: policy.externalActionPolicy?.defaultMode ?? DEFAULT_POLICY.externalActionPolicy?.defaultMode ?? "enforce",
    providerKeywords: policy.externalActionPolicy?.providerKeywords ?? DEFAULT_POLICY.externalActionPolicy?.providerKeywords ?? [],
    writeVerbs: policy.externalActionPolicy?.writeVerbs ?? DEFAULT_POLICY.externalActionPolicy?.writeVerbs ?? [],
    safeVerbs: policy.externalActionPolicy?.safeVerbs ?? DEFAULT_POLICY.externalActionPolicy?.safeVerbs ?? []
  };
}

function finalGateConfig(policy: BasePolicy): Required<FinalGateConfig> {
  return {
    defaultMode: policy.finalGate?.defaultMode ?? DEFAULT_POLICY.finalGate?.defaultMode ?? "enforce",
    requireTaskContract: policy.finalGate?.requireTaskContract ?? true,
    requireContextManifest: policy.finalGate?.requireContextManifest ?? true,
    requireVerifyEvidence: policy.finalGate?.requireVerifyEvidence ?? true,
    requireTrace: policy.finalGate?.requireTrace ?? true,
    requirePassingVerify: policy.finalGate?.requirePassingVerify ?? true
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function effectiveProtectedPaths(policy: BasePolicy, profile: ProjectProfile): EffectiveProtectedPaths {
  const baseReadProtectedPaths = policy.shellProtectedPaths ?? policy.protectedPaths;
  const profileProtectedPaths = profile.protectedPaths ?? [];
  const profileShellProtectedPaths = profile.shellProtectedPaths ?? profile.protectedPaths ?? [];
  const readOnlyPaths = profile.readOnlyPaths ?? [];
  return {
    readProtectedPaths: uniqueStrings([
      ...baseReadProtectedPaths,
      ...profileProtectedPaths
    ]),
    writeProtectedPaths: uniqueStrings([
      ...policy.protectedPaths,
      ...profileProtectedPaths,
      ...readOnlyPaths
    ]),
    shellProtectedPaths: uniqueStrings([
      ...baseReadProtectedPaths,
      ...profileShellProtectedPaths,
      ...readOnlyPaths
    ]),
    readOnlyPaths: uniqueStrings(readOnlyPaths)
  };
}

function normalizeActionToken(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function actionTextMatchesAny(text: string, tokens: string[]): boolean {
  const normalized = normalizeActionToken(text);
  if (!normalized) return false;
  return tokens.some((token) => {
    const normalizedToken = normalizeActionToken(token);
    return normalizedToken.length > 0
      && new RegExp(`(?:^|-)${normalizedToken}(?:-|$)`).test(normalized);
  });
}

type ActionClassification = {
  decision: "safe-read" | "confirm";
  kind: "safe" | "write" | "ambiguous";
  action: string;
};

function actionTokens(value: string): string[] {
  return normalizeActionToken(value).split("-").filter(Boolean);
}

function classifyActionTokenSequence(tokens: string[], config: Required<ExternalActionPolicyConfig>): ActionClassification {
  const writeTokens = new Set(config.writeVerbs.map(normalizeActionToken));
  const safeTokens = new Set(config.safeVerbs.map(normalizeActionToken));
  const matches = tokens
    .map((token, index) => ({ token, index, write: writeTokens.has(token), safe: safeTokens.has(token) }))
    .filter((item) => item.write || item.safe);
  const first = matches[0];
  if (!first) return { decision: "confirm", kind: "ambiguous", action: "unknown" };
  if (first.write) return { decision: "confirm", kind: "write", action: first.token };

  // A safe prefix is not enough for compound/ambiguous names such as
  // get_update_file. Keep the small set of established read resources whose
  // noun also happens to be a configured write verb (for example get_release).
  const safeReadResourceCollisions = new Set(["release", "run"]);
  const laterWrite = matches.find((item) => item.index > first.index
    && item.write
    && !safeReadResourceCollisions.has(item.token));
  if (laterWrite) return { decision: "confirm", kind: "write", action: laterWrite.token };
  return { decision: "safe-read", kind: "safe", action: first.token };
}

function classifyExplicitActionValues(values: string[], config: Required<ExternalActionPolicyConfig>): ActionClassification | undefined {
  if (values.length === 0) return undefined;
  const classifications = values.map((value) => classifyActionTokenSequence(actionTokens(value), config));
  return classifications.find((item) => item.kind === "write")
    ?? classifications.find((item) => item.kind === "ambiguous")
    ?? classifications[0];
}

function classifyToolNameAction(toolName: string, provider: string, config: Required<ExternalActionPolicyConfig>): ActionClassification {
  let tokens = actionTokens(toolName);
  if (tokens[0] === "mcp") tokens = tokens.slice(1);
  const providerTokens = actionTokens(provider);
  const providerIndex = tokens.findIndex((token, index) => providerTokens.every((providerToken, offset) => tokens[index + offset] === providerToken));
  if (providerIndex >= 0) tokens = tokens.slice(providerIndex + providerTokens.length);

  return classifyActionTokenSequence(tokens, config);
}

function classifyExternalAction(toolName: string, input: Record<string, unknown>, policy: BasePolicy): {
  decision: "not-external" | "safe-read" | "confirm";
  provider?: string;
  action?: string;
  evidence: string[];
} {
  const config = externalActionPolicyConfig(policy);
  if (config.defaultMode === "advisory") return { decision: "not-external", evidence: [] };

  const walked = walkStringInputs(input).items;
  const providerValues = walked.filter((item) => /(?:^|\.)(?:provider|server)$/i.test(item.field));
  const actionValues = walked.filter((item) => /(?:^|\.)(?:action|operation|method|type|tool)$/i.test(item.field));
  const proxyToolValues = walked.filter((item) => item.field === "tool");
  const isMcpProxy = normalizeActionToken(toolName) === "mcp";
  const proxyTool = isMcpProxy ? proxyToolValues.map((item) => item.value.trim()).find(Boolean) : undefined;
  const proxyAction = isMcpProxy && typeof input.action === "string" ? input.action.trim() : "";
  if (isMcpProxy && !proxyTool && !proxyAction) return { decision: "not-external", evidence: [toolName] };
  if (isMcpProxy && !proxyTool && normalizeActionToken(proxyAction) === "ui-messages") {
    return { decision: "safe-read", provider: "mcp-proxy", action: "ui-messages", evidence: [toolName, proxyAction] };
  }

  const providerEvidence = [toolName, ...providerValues.map((item) => item.value), ...proxyToolValues.map((item) => item.value)];
  const configuredProvider = config.providerKeywords.find((candidate) => actionTextMatchesAny(providerEvidence.join(" "), [candidate]));
  const mcpMatch = toolName.match(/^mcp(?:__|[-_:]+)([^_:.-]+)/i);
  const explicitProvider = providerValues.map((item) => item.value.trim()).find(Boolean);
  const provider = explicitProvider ?? configuredProvider ?? mcpMatch?.[1] ?? (isMcpProxy ? "mcp-proxy" : undefined);
  const evidence = [toolName, ...providerValues.map((item) => item.value), ...actionValues.map((item) => item.value)].slice(0, 8);
  if (!provider) return { decision: "not-external", evidence };

  const explicitAction = classifyExplicitActionValues(actionValues.map((item) => item.value), config);
  const toolAction = classifyToolNameAction(toolName, provider, config);
  const classification = explicitAction?.kind === "write"
    ? explicitAction
    : toolAction.kind === "write"
      ? toolAction
      : explicitAction ?? toolAction;
  return { decision: classification.decision, provider, action: classification.action, evidence };
}

type PreparedToolInput = {
  input: Record<string, unknown>;
  proxyArgs?: Record<string, unknown>;
  proxyTool?: string;
  proxyToolName?: string;
  proxyAction?: ActionClassification;
  proxyShellCarrier?: boolean;
  confirmationSummary?: string;
  reason?: string;
};

function isMcpProxyShellCarrier(proxyTool: string, proxyArgs: Record<string, unknown>, provider: string): boolean {
  if (Object.hasOwn(proxyArgs, "command") || Object.hasOwn(proxyArgs, "cmd")) return true;
  if (!Array.isArray(proxyArgs.args)) return false;
  const tokens = new Set(actionTokens(proxyTool));
  const providerTokens = new Set(actionTokens(provider));
  return providerTokens.has("shell")
    || providerTokens.has("terminal")
    || tokens.has("bash")
    || tokens.has("shell")
    || tokens.has("terminal")
    || tokens.has("run")
    || (tokens.has("execute") && (tokens.has("command") || tokens.has("process")));
}

function collectPatchTargetPaths(value: unknown, key = "", depth = 0): string[] {
  if (depth > MAX_TOOL_INPUT_INSPECTION_DEPTH || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectPatchTargetPaths(item, key, depth + 1));
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([childKey, child]) => collectPatchTargetPaths(child, childKey, depth + 1));
  }
  if (typeof value !== "string" || !/(?:patch|diff|content|text)/i.test(key)) return [];

  const paths: string[] = [];
  for (const line of value.split(/\r?\n/)) {
    const marker = line.match(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$/)
      ?? line.match(/^\*\*\* Move to:\s*(.+?)\s*$/);
    if (marker?.[1]) paths.push(marker[1]);
    const unified = line.match(/^(?:---|\+\+\+)\s+([^\t ]+)/);
    if (unified?.[1] && unified[1] !== "/dev/null") paths.push(unified[1].replace(/^[ab]\//, ""));
  }
  return paths;
}

function prepareToolInputForPolicy(
  toolName: string,
  input: Record<string, unknown>,
  policy: BasePolicy
): PreparedToolInput {
  if (normalizeActionToken(toolName) !== "mcp") return { input };

  const proxyTool = typeof input.tool === "string" ? input.tool.trim() : "";
  if (Object.hasOwn(input, "tool") && input.tool !== undefined && typeof input.tool !== "string") {
    return { input, reason: "MCP proxy tool must be a string" };
  }

  let policyInput = input;
  if (Object.hasOwn(input, "args") && input.args !== undefined && input.args !== "") {
    if (typeof input.args !== "string") return { input, reason: "MCP proxy args must be a JSON object string" };
    if (input.args.length > MAX_MCP_PROXY_ARGS_CHARS) {
      return { input, reason: `MCP proxy args exceed ${MAX_MCP_PROXY_ARGS_CHARS} characters` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.args);
    } catch {
      return { input, reason: "MCP proxy args must be valid JSON" };
    }
    if (!isPlainRecord(parsed)) return { input, reason: "MCP proxy args must decode to a JSON object" };
    const patchTargets = actionTokens(proxyTool).includes("patch")
      ? collectPatchTargetPaths(parsed)
      : [];
    policyInput = patchTargets.length > 0
      ? { ...input, proxyArgs: parsed, proxyPatchTargets: { paths: patchTargets } }
      : { ...input, proxyArgs: parsed };
    const summary = redactText(JSON.stringify(parsed)).replace(/\s+/g, " ");
    const confirmationSummary = summary.length > 600 ? `${summary.slice(0, 600)}…` : summary;
    if (!proxyTool) return { input: policyInput, proxyArgs: parsed, confirmationSummary };

    const provider = typeof input.server === "string" && input.server.trim() ? input.server.trim() : "mcp-proxy";
    const proxyShellCarrier = isMcpProxyShellCarrier(proxyTool, parsed, provider);
    const classifiedAction = classifyActionTokenSequence(actionTokens(proxyTool), externalActionPolicyConfig(policy));
    return {
      input: policyInput,
      proxyArgs: parsed,
      proxyTool,
      proxyToolName: `${provider}_${proxyTool}`,
      proxyAction: proxyShellCarrier
        ? { decision: "confirm", kind: "ambiguous", action: "shell-command" }
        : classifiedAction,
      proxyShellCarrier,
      confirmationSummary
    };
  }

  if (!proxyTool) return { input: policyInput };
  const provider = typeof input.server === "string" && input.server.trim() ? input.server.trim() : "mcp-proxy";
  return {
    input: policyInput,
    proxyTool,
    proxyToolName: `${provider}_${proxyTool}`,
    proxyAction: classifyActionTokenSequence(actionTokens(proxyTool), externalActionPolicyConfig(policy))
  };
}

const GH_COMMAND_GROUPS = new Set([
  "alias", "api", "auth", "cache", "codespace", "config", "extension", "gist", "gpg-key",
  "issue", "label", "org", "pr", "project", "release", "repo", "ruleset", "run", "secret",
  "ssh-key", "variable", "workflow"
]);
const GH_SAFE_ACTIONS = new Set([
  "browse", "checks", "completion", "diff", "fetch", "find", "get", "help", "inspect", "list",
  "read", "search", "show", "status", "version", "view"
]);

function executableBasename(value: string): string {
  return path.posix.basename(value.replace(/\\/g, "/")).toLowerCase();
}

function externalCommandName(value: string, names: Set<string>, aliases: Map<string, string>): string | undefined {
  const direct = executableBasename(value);
  if (names.has(direct)) return direct;
  const variable = value.match(/^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/);
  const alias = variable ? aliases.get(variable[1] ?? variable[2]) : undefined;
  return alias && names.has(alias) ? alias : undefined;
}

function externalExecutableIndex(
  words: string[],
  names: Set<string>,
  aliases: Map<string, string>
): number | undefined {
  let index = 0;
  while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) index += 1;

  const controlPrefixes = new Set(["!", "{", "(", "then", "do", "elif", "else"]);
  const nonExecutingCommands = new Set([
    "cat", "echo", "egrep", "fgrep", "grep", "printf", "rg", "ripgrep", "test", "[", "true", "false"
  ]);
  while (index < words.length) {
    const command = executableBasename(words[index]);
    if (externalCommandName(words[index], names, aliases)) return index;
    if (controlPrefixes.has(command)) {
      index += 1;
      continue;
    }
    const ripgrepPreprocessor = ["rg", "ripgrep"].includes(command) && hasOption(words.slice(index + 1), ["--pre"]);
    if (nonExecutingCommands.has(command) && !ripgrepPreprocessor) return undefined;
    if (["command", "exec", "nohup", "time"].includes(command)) {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) {
        const option = words[index];
        index += ["-a", "-f", "-o", "--format", "--output"].includes(option) ? 2 : 1;
      }
      continue;
    }
    if (command === "env") {
      index += 1;
      while (index < words.length) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) {
          index += 1;
          continue;
        }
        if (["-u", "--unset", "-C", "--chdir"].includes(words[index])) {
          index += 2;
          continue;
        }
        if (words[index].startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (command === "sudo") {
      index += 1;
      while (index < words.length) {
        const option = words[index];
        if (["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from", "-D", "--chdir"].includes(option)) {
          index += 2;
          continue;
        }
        if (option.startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (command === "nice") {
      index += 1;
      if (["-n", "--adjustment"].includes(words[index])) index += 2;
      else if (words[index]?.startsWith("--adjustment=") || /^-\d+$/.test(words[index] ?? "")) index += 1;
      continue;
    }
    if (command === "find") {
      const execIndex = words.findIndex((word, nestedIndex) => nestedIndex > index && ["-exec", "-execdir"].includes(word));
      if (execIndex < 0) return undefined;
      const nested = words.findIndex((word, nestedIndex) => nestedIndex > execIndex && externalCommandName(word, names, aliases));
      return nested >= 0 ? nested : undefined;
    }
    if (["xargs", "npx", "bunx"].includes(command) || (command === "pnpm" && words[index + 1] === "dlx")) {
      const nested = words.findIndex((word, nestedIndex) => nestedIndex > index && externalCommandName(word, names, aliases));
      return nested >= 0 ? nested : undefined;
    }
    // Unknown wrappers and shell constructs fail closed when they carry a
    // literal external executable later in the same semantic segment.
    const nested = words.findIndex((word, nestedIndex) => nestedIndex > index && externalCommandName(word, names, aliases));
    return nested >= 0 ? nested : undefined;
  }
  return undefined;
}

function containsDynamicShellExpansion(value: string): boolean {
  return /(?:\$\(|`|\$\{|\$[A-Za-z0-9_@*#?$!-])/.test(value);
}

function assignmentEndIndex(words: string[], startIndex: number): number {
  let commandSubstitutionDepth = 0;
  let parameterExpansionDepth = 0;
  let insideBackticks = false;
  for (let index = startIndex; index < words.length; index += 1) {
    const equalsIndex = index === startIndex ? words[index].indexOf("=") : -1;
    const value = equalsIndex >= 0 ? words[index].slice(equalsIndex + 1) : words[index];
    for (let charIndex = 0; charIndex < value.length; charIndex += 1) {
      const char = value[charIndex];
      const next = value[charIndex + 1];
      if (char === "`") {
        insideBackticks = !insideBackticks;
        continue;
      }
      if (insideBackticks) continue;
      if (char === "$" && next === "(") {
        commandSubstitutionDepth += 1;
        charIndex += 1;
        continue;
      }
      if (commandSubstitutionDepth > 0 && char === "(") commandSubstitutionDepth += 1;
      else if (commandSubstitutionDepth > 0 && char === ")") commandSubstitutionDepth -= 1;
      if (char === "$" && next === "{") {
        parameterExpansionDepth += 1;
        charIndex += 1;
        continue;
      }
      if (parameterExpansionDepth > 0 && char === "{") parameterExpansionDepth += 1;
      else if (parameterExpansionDepth > 0 && char === "}") parameterExpansionDepth -= 1;
    }
    if (commandSubstitutionDepth === 0 && parameterExpansionDepth === 0 && !insideBackticks) return index + 1;
  }
  return words.length;
}

function dynamicExecutableIndex(
  words: string[],
  names: Set<string>,
  aliases: Map<string, string>
): number | undefined {
  let index = 0;
  while (index < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) {
    // shellWords intentionally exposes nested command text as separate words;
    // consume the balanced assignment value before looking for an executable.
    index = assignmentEndIndex(words, index);
  }

  const controlPrefixes = new Set(["!", "{", "(", "then", "do", "elif", "else"]);
  const nonExecutingCommands = new Set([
    "cat", "echo", "egrep", "fgrep", "grep", "printf", "rg", "ripgrep", "test", "[", "true", "false"
  ]);
  while (index < words.length) {
    const word = words[index];
    const command = executableBasename(word);
    if (externalCommandName(word, names, aliases)) return undefined;
    if (containsDynamicShellExpansion(word)) return index;
    if (controlPrefixes.has(command)) {
      index += 1;
      continue;
    }
    const ripgrepPreprocessor = ["rg", "ripgrep"].includes(command) && hasOption(words.slice(index + 1), ["--pre"]);
    if (nonExecutingCommands.has(command) && !ripgrepPreprocessor) return undefined;
    if (["command", "exec", "nohup", "time"].includes(command)) {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) {
        const option = words[index];
        index += ["-a", "-f", "-o", "--format", "--output"].includes(option) ? 2 : 1;
      }
      continue;
    }
    if (command === "env") {
      index += 1;
      while (index < words.length) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) {
          index += 1;
          continue;
        }
        if (["-u", "--unset", "-C", "--chdir"].includes(words[index])) {
          index += 2;
          continue;
        }
        if (words[index].startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (command === "sudo") {
      index += 1;
      while (index < words.length) {
        const option = words[index];
        if (["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--close-from", "-D", "--chdir"].includes(option)) {
          index += 2;
          continue;
        }
        if (option.startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (command === "nice") {
      index += 1;
      if (["-n", "--adjustment"].includes(words[index])) index += 2;
      else if (words[index]?.startsWith("--adjustment=") || /^-\d+$/.test(words[index] ?? "")) index += 1;
      continue;
    }
    if (command === "find") {
      const execIndex = words.findIndex((candidate, nestedIndex) => nestedIndex > index && ["-exec", "-execdir"].includes(candidate));
      if (execIndex < 0) return undefined;
      const nested = dynamicExecutableIndex(words.slice(execIndex + 1), names, aliases);
      return nested === undefined ? undefined : execIndex + 1 + nested;
    }
    if (["xargs", "npx", "bunx"].includes(command) || (command === "pnpm" && words[index + 1] === "dlx")) {
      let nestedIndex = index + (command === "pnpm" ? 2 : 1);
      const optionsWithValues = new Set([
        "-a", "--arg-file", "-d", "--delimiter", "-E", "--eof", "-I", "--replace", "-L", "--max-lines",
        "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars", "-p", "--package"
      ]);
      while (nestedIndex < words.length) {
        const option = words[nestedIndex];
        if (option === "--") {
          nestedIndex += 1;
          break;
        }
        if (optionsWithValues.has(option)) {
          nestedIndex += 2;
          continue;
        }
        if (option.startsWith("-")) {
          nestedIndex += 1;
          continue;
        }
        break;
      }
      const nested = dynamicExecutableIndex(words.slice(nestedIndex), names, aliases);
      return nested === undefined ? undefined : nestedIndex + nested;
    }
    return undefined;
  }
  return undefined;
}

function inspectOptionValues(words: string[], shortName: string, longName: string): {
  found: boolean;
  missing: boolean;
  values: string[];
} {
  const result = { found: false, missing: false, values: [] as string[] };
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if ((shortName && word === shortName) || word === longName) {
      result.found = true;
      const value = words[index + 1];
      if (!value || value.startsWith("-")) result.missing = true;
      else {
        result.values.push(value);
        index += 1;
      }
      continue;
    }
    if (word.startsWith(`${longName}=`)) {
      result.found = true;
      const value = word.slice(longName.length + 1);
      if (value) result.values.push(value);
      else result.missing = true;
      continue;
    }
    if (shortName.length === 2 && word.startsWith(shortName) && word.length > shortName.length) {
      result.found = true;
      result.values.push(word.slice(shortName.length));
    }
  }
  return result;
}

function hasOption(words: string[], names: string[]): boolean {
  return words.some((word) => names.some((name) => word === name || word.startsWith(`${name}=`)
    || (name.length === 2 && word.startsWith(name) && word.length > name.length)));
}

function ghApiRequiresConfirmation(words: string[]): boolean {
  const methods = inspectOptionValues(words, "-X", "--method");
  if (methods.missing || methods.values.some((method) => !["GET", "HEAD"].includes(method.toUpperCase()))) return true;
  const carriesFields = hasOption(words, ["-f", "-F", "--field", "--raw-field", "--input"]);
  return carriesFields && !(methods.values.length > 0 && methods.values.every((method) => method.toUpperCase() === "GET"));
}

function ghRequiresConfirmation(words: string[]): boolean {
  const args = words.slice(1);
  if (hasOption(args, ["-h", "--help", "--version"])) return false;
  const positionals: string[] = [];
  const optionsWithValues = new Set(["-R", "--repo", "--hostname"]);
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (optionsWithValues.has(word)) {
      index += 1;
      continue;
    }
    if (word.startsWith("-")) continue;
    positionals.push(normalizeActionToken(word));
    if (positionals.length >= 2) break;
  }
  const group = positionals[0] ?? "";
  if (group === "api") return ghApiRequiresConfirmation(args.slice(1));
  if (["search", "status", "browse", "completion", "help", "version"].includes(group)) return false;
  const action = GH_COMMAND_GROUPS.has(group) ? positionals[1] : group;
  return !action || !GH_SAFE_ACTIONS.has(action);
}

function curlRequiresConfirmation(words: string[]): boolean {
  const args = words.slice(1);
  const methods = inspectOptionValues(args, "-X", "--request");
  if (methods.missing || methods.values.some((method) => !["GET", "HEAD"].includes(method.toUpperCase()))) return true;
  if (hasOption(args, ["-K", "--config", "-T", "--upload-file", "-F", "--form", "--form-string", "--json"])) return true;
  const quoteCommands = inspectOptionValues(args, "-Q", "--quote");
  if (quoteCommands.missing) return true;
  const safeQuoteCommands = /^(?:[+-])?(?:CWD|FEAT|HELP|NOOP|PWD|STAT|SYST)\b/i;
  if (quoteCommands.values.some((command) => !safeQuoteCommands.test(command.trim()))) return true;
  const carriesData = hasOption(args, ["-d", "--data", "--data-ascii", "--data-binary", "--data-raw", "--data-urlencode"]);
  const forceGet = hasOption(args, ["-G", "--get"]);
  return carriesData && !forceGet;
}

function wgetRequiresConfirmation(words: string[]): boolean {
  const args = words.slice(1);
  const methods = inspectOptionValues(args, "", "--method");
  if (methods.missing || methods.values.some((method) => !["GET", "HEAD"].includes(method.toUpperCase()))) return true;
  return hasOption(args, ["-e", "--execute", "--config", "--post-data", "--post-file", "--body-data", "--body-file", "--upload-file"]);
}

function findShellExternalConfirmationReason(
  segments: Array<{ command: string; words: string[] }>,
  policy: BasePolicy
): string | undefined {
  if (externalActionPolicyConfig(policy).defaultMode !== "enforce") return undefined;
  const names = new Set(["gh", "curl", "wget"]);
  const aliases = new Map<string, string>();
  for (const segment of segments) {
    for (const word of segment.words) {
      const assignment = word.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
      if (!assignment) continue;
      const executable = executableBasename(assignment[2]);
      if (names.has(executable)) aliases.set(assignment[1], executable);
    }
  }
  for (const segment of segments) {
    const dynamicIndex = dynamicExecutableIndex(segment.words, names, aliases);
    if (dynamicIndex !== undefined) {
      return `External command requires confirmation: dynamic executable in ${segment.command}`;
    }
    const index = externalExecutableIndex(segment.words, names, aliases);
    if (index === undefined) continue;
    const invocation = segment.words.slice(index);
    const command = externalCommandName(invocation[0], names, aliases);
    if (!command) continue;
    const requiresConfirmation = command === "gh"
      ? ghRequiresConfirmation(invocation)
      : command === "curl"
        ? curlRequiresConfirmation(invocation)
        : wgetRequiresConfirmation(invocation);
    if (requiresConfirmation) return `External command requires confirmation: ${command} in ${segment.command}`;
  }
  return undefined;
}

function quoteShellArgument(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function normalizeShellCommandForPolicy(command: string): string {
  const collapsed = command.replace(/\\(?:\r\n|\n)/g, "");
  let normalized = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (let index = 0; index < collapsed.length; index += 1) {
    const char = collapsed[index];
    if (escaped) {
      normalized += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      normalized += char;
      escaped = true;
      continue;
    }
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      normalized += char;
      continue;
    }
    if (quote === char) {
      quote = undefined;
      normalized += char;
      continue;
    }
    const previous = collapsed[index - 1];
    const beginsShellWord = index === 0 || /\s/.test(previous) || /[;&|(){}]/.test(previous);
    if (!quote && char === "#" && beginsShellWord) {
      while (index < collapsed.length && collapsed[index] !== "\n") index += 1;
      if (collapsed[index] === "\n") normalized += "\n";
      continue;
    }
    normalized += char;
  }
  return normalized;
}

function extractShellCommandInput(input: Record<string, unknown>): { command?: string; reason?: string } {
  const hasCommand = Object.hasOwn(input, "command");
  const hasCmd = Object.hasOwn(input, "cmd");
  const hasArgs = Object.hasOwn(input, "args");
  if (hasCommand && typeof input.command !== "string") {
    return { reason: "command must be a string" };
  }
  if (hasCmd && typeof input.cmd !== "string") {
    return { reason: "cmd must be a string" };
  }

  const command = hasCommand ? input.command as string : undefined;
  const cmd = hasCmd ? input.cmd as string : undefined;
  if (command !== undefined && cmd !== undefined && command !== cmd) {
    return { reason: "conflicting command and cmd values" };
  }

  let args: string[] = [];
  if (hasArgs) {
    if (!Array.isArray(input.args) || !input.args.every((arg) => typeof arg === "string")) {
      return { reason: "args must be an array of strings" };
    }
    if (input.args.length > MAX_SHELL_ARG_COUNT) {
      return { reason: `too many args: ${input.args.length} > ${MAX_SHELL_ARG_COUNT}` };
    }
    if (input.args.some((arg) => arg.length > MAX_SHELL_ARG_CHARS)) {
      return { reason: `shell arg exceeds ${MAX_SHELL_ARG_CHARS} characters` };
    }
    args = input.args;
  }

  const baseCommand = command ?? cmd;
  if (baseCommand !== undefined && (!baseCommand.trim() || baseCommand.length > MAX_SHELL_COMMAND_CHARS)) {
    return { reason: `shell command must contain 1-${MAX_SHELL_COMMAND_CHARS} characters` };
  }
  if (baseCommand === undefined && args.length === 0) {
    return { reason: "shell command input is missing or unsupported" };
  }

  const combined = [baseCommand?.trim(), ...args.map(quoteShellArgument)].filter((item): item is string => Boolean(item)).join(" ");
  if (combined.length > MAX_SHELL_COMMAND_CHARS) {
    return { reason: `combined shell command exceeds ${MAX_SHELL_COMMAND_CHARS} characters` };
  }
  return { command: combined };
}

function evaluateMcpProxyShellProtectedAccess(
  cwd: string,
  prepared: PreparedToolInput,
  protectedPaths: string[]
): { block: boolean; reason?: string } {
  if (!prepared.proxyArgs || !prepared.proxyTool) return { block: false };
  if (!prepared.proxyShellCarrier) return { block: false };

  const shellInput = extractShellCommandInput(prepared.proxyArgs);
  if (!shellInput.command) {
    return { block: true, reason: `Blocked MCP shell carrier: ${shellInput.reason ?? "command is missing"}` };
  }
  const baseCommand = typeof prepared.proxyArgs.command === "string"
    ? prepared.proxyArgs.command
    : typeof prepared.proxyArgs.cmd === "string"
      ? prepared.proxyArgs.cmd
      : "";
  const rawArgs = Array.isArray(prepared.proxyArgs.args)
    ? prepared.proxyArgs.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  const conservativeCommand = [baseCommand.trim(), ...rawArgs].filter(Boolean).join(" ") || shellInput.command;
  const command = normalizeShellCommandForPolicy(conservativeCommand);
  const protectedHit = findProtectedPathInCommand(command, protectedPaths);
  if (protectedHit) {
    return {
      block: true,
      reason: `MCP command touches protected path: ${protectedHit.candidate} matches ${protectedHit.pattern}`
    };
  }
  const protectedGlobHit = shellGlobTargetsProtectedPath(command, protectedPaths);
  if (protectedGlobHit) {
    return {
      block: true,
      reason: `MCP command glob can target protected path: ${protectedGlobHit.glob} can match ${protectedGlobHit.example} via ${protectedGlobHit.pattern}`
    };
  }
  const resolvedProtectedHit = findResolvedProtectedPathInCommand(cwd, command, protectedPaths);
  if (resolvedProtectedHit) {
    return {
      block: true,
      reason: `MCP command resolves to protected path: ${resolvedProtectedHit.candidate} resolves to ${resolvedProtectedHit.resolved} matching ${resolvedProtectedHit.pattern}`
    };
  }
  return { block: false };
}

function projectFilePath(cwd: string, relativePath: string): string {
  const absolute = path.resolve(cwd, relativePath);
  const relative = path.relative(cwd, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return absolute;
}

function candidateFileBudget(cwd: string, rel: string, budget: Required<ContextBudgetConfig>): {
  path: string;
  exists: boolean;
  chars: number;
  overLimit: boolean;
  warn: boolean;
} {
  const absolute = projectFilePath(cwd, rel);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return { path: rel, exists: false, chars: 0, overLimit: false, warn: false };
  }
  const text = fs.readFileSync(absolute, "utf8");
  return {
    path: rel,
    exists: true,
    chars: text.length,
    overLimit: text.length > budget.maxContextFileChars,
    warn: text.length > budget.warnFragmentChars
  };
}

function memorySummaryPath(cwd: string, settings: Required<MemorySettings>): string {
  return projectFilePath(cwd, settings.summaryFile);
}

function memoryHandbookPath(cwd: string, settings: Required<MemorySettings>): string {
  return projectFilePath(cwd, settings.handbookFile);
}

function memoryLocalDir(cwd: string, settings: Required<MemorySettings>): string {
  return projectFilePath(cwd, settings.localDir);
}

function ensurePiGitignore(cwd: string): void {
  const target = path.join(cwd, ".pi", ".gitignore");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const required = [
    "memory/MEMORY.md",
    "memory/memory_summary.md",
    "memory/state.sqlite",
    "memory/raw_memories.md",
    "memory/rollout_summaries/",
    "memory/extensions/ad_hoc/",
    "memory/local/",
    "memory/.git/"
  ];
  const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const additions = required.filter((line) => !existing.split(/\r?\n/).includes(line));
  if (additions.length === 0) return;
  const prefix = existing.trimEnd();
  fs.writeFileSync(target, `${prefix ? `${prefix}\n` : ""}${additions.join("\n")}\n`);
}

function redactMemoryText(input: string): { text: string; redacted: boolean } {
  return redactSensitiveText(input);
}

function redactText(input: string): string {
  return redactSensitiveText(input).text;
}

function redactTextArray(input: string[] | undefined): string[] {
  return (input ?? []).map((item) => redactText(item));
}

function ensureProjectMemoryFiles(cwd: string, settings: Required<MemorySettings>): void {
  ensurePiGitignore(cwd);
  const summaryPath = memorySummaryPath(cwd, settings);
  const handbookPath = memoryHandbookPath(cwd, settings);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.mkdirSync(path.dirname(handbookPath), { recursive: true });
  fs.mkdirSync(memoryLocalDir(cwd, settings), { recursive: true });

  if (!fs.existsSync(summaryPath)) {
    fs.writeFileSync(summaryPath, [
      "v1",
      "",
      "# Memory Summary",
      "",
      "- Status: initialized",
      "- Scope: project",
      "- Policy: explicit durable notes only; repository files remain source of truth.",
      "",
      "Use this file as a compact memory index. Keep it short and update only with durable, verified context.",
      ""
    ].join("\n"));
  }

  if (!fs.existsSync(handbookPath)) {
    fs.writeFileSync(handbookPath, [
      "# Project Memory",
      "",
      "Durable project memory for Pi Agent Platform.",
      "",
      "Rules:",
      "",
      "- Store only stable preferences, decisions, project conventions, lessons, and open loops.",
      "- Do not store secrets, credentials, raw customer data, or large source excerpts.",
      "- Treat memory as hints; verify against the repository before editing.",
      "",
      "## Entries",
      ""
    ].join("\n"));
  }
}

function appendMemoryNote(cwd: string, profile: ProjectProfile, note: {
  category: string;
  title: string;
  content: string;
  source?: string;
}): { path: string; redacted: boolean } {
  const settings = resolveMemorySettings(profile);
  if (!settings.enabled || settings.mode === "off") {
    throw new Error("Project memory is disabled by profile.");
  }
  ensureProjectMemoryFiles(cwd, settings);
  const target = memoryHandbookPath(cwd, settings);
  const redacted = redactMemoryText(note.content);
  const title = redactText(note.title).trim().replace(/\s+/g, " ").slice(0, 120);
  const category = note.category.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40) || "note";
  const source = note.source ? redactText(note.source).trim() : "";
  const entry = [
    "",
    `### ${title}`,
    "",
    `- Recorded: ${nowIso()}`,
    `- Category: ${category}`,
    `- Source: ${source || "explicit-user-request"}`,
    "",
    redacted.text.trim(),
    ""
  ].join("\n");
  fs.appendFileSync(target, entry);
  return { path: settings.handbookFile, redacted: redacted.redacted };
}

function readMemoryFiles(cwd: string, settings: Required<MemorySettings>): Array<{ rel: string; text: string }> {
  const files: Array<{ rel: string; text: string }> = [];
  for (const rel of [settings.summaryFile, settings.handbookFile]) {
    const absolute = projectFilePath(cwd, rel);
    if (fs.existsSync(absolute)) files.push({ rel, text: fs.readFileSync(absolute, "utf8") });
  }
  const localDir = memoryLocalDir(cwd, settings);
  if (fs.existsSync(localDir)) {
    for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const absolute = path.join(localDir, entry.name);
      files.push({
        rel: path.relative(cwd, absolute).split(path.sep).join("/"),
        text: fs.readFileSync(absolute, "utf8")
      });
    }
  }
  return files;
}

function searchMemoryFiles(cwd: string, profile: ProjectProfile, query: string, limit: number): Array<{ path: string; line: number; text: string }> {
  const settings = resolveMemorySettings(profile);
  if (!settings.enabled || settings.mode === "off") return [];
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const matches: Array<{ path: string; line: number; text: string }> = [];
  for (const file of readMemoryFiles(cwd, settings)) {
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].toLowerCase().includes(needle)) continue;
      matches.push({ path: file.rel, line: index + 1, text: lines[index].slice(0, 240) });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

function writeProjectOnboarding(cwd: string, snapshot: ProjectOnboardingSnapshot, markdown: string): ProjectOnboardingSnapshot {
  fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
  ensureStateDirs(cwd);
  const safeSnapshot = redactForStorage(snapshot) as ProjectOnboardingSnapshot;
  fs.writeFileSync(projectContextFilePath(cwd), `${redactText(markdown).trimEnd()}\n`);
  fs.writeFileSync(onboardingStateFilePath(cwd), `${JSON.stringify(safeSnapshot, null, 2)}\n`);
  return safeSnapshot;
}

function adapterProfilePath(extensionDir: string, profileName: string): string | undefined {
  const platformRoot = findPlatformRoot(extensionDir);
  const safeName = profileName.trim();
  if (!/^[a-z0-9-]+$/.test(safeName)) return undefined;
  const candidate = path.join(platformRoot, "adapters", safeName, "profile.json");
  return fs.existsSync(candidate) ? candidate : undefined;
}

function readAdapterProfiles(extensionDir: string): Array<{ name: string; profile: ProjectProfile }> {
  const platformRoot = findPlatformRoot(extensionDir);
  const adaptersDir = path.join(platformRoot, "adapters");
  if (!fs.existsSync(adaptersDir)) return [];
  return fs.readdirSync(adaptersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const profile = readJsonFile<ProjectProfile>(path.join(adaptersDir, entry.name, "profile.json"));
      return profile ? { name: entry.name, profile } : undefined;
    })
    .filter((entry): entry is { name: string; profile: ProjectProfile } => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function packageHasAny(cwd: string, pattern: RegExp): boolean {
  try {
    return pattern.test(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  } catch {
    return false;
  }
}

function detectProfileName(cwd: string, intent?: string): { name: string; reason: string } {
  const normalizedIntent = intent?.trim().toLowerCase();
  if (normalizedIntent === "be-readonly-fe") return { name: "be-readonly-fe", reason: "User intent says backend should be read-only while frontend is the write target." };
  if (normalizedIntent === "frontend-only") return { name: "web-frontend", reason: "User intent says frontend-only." };
  if (normalizedIntent === "backend-only") return { name: "backend-api", reason: "User intent says backend-only." };
  if (normalizedIntent === "docs") return { name: "docs", reason: "User intent says docs/docs-only." };

  const hasPackage = fs.existsSync(path.join(cwd, "package.json"));
  let frontend = false;
  let backend = false;
  let data = false;
  let mobile = false;
  let infra = false;
  let docs = false;

  if (fs.existsSync(path.join(cwd, "pubspec.yaml")) || (fs.existsSync(path.join(cwd, "android")) && fs.existsSync(path.join(cwd, "ios")))) mobile = true;
  if (fs.existsSync(path.join(cwd, "dbt_project.yml")) || fs.existsSync(path.join(cwd, "dvc.yaml")) || fs.existsSync(path.join(cwd, "notebooks")) || fs.existsSync(path.join(cwd, "data"))) data = true;
  if (fs.existsSync(path.join(cwd, "Dockerfile")) || fs.existsSync(path.join(cwd, "docker-compose.yml")) || fs.existsSync(path.join(cwd, "compose.yml")) || fs.existsSync(path.join(cwd, "compose.yaml")) || fs.existsSync(path.join(cwd, "terraform")) || fs.existsSync(path.join(cwd, "infra")) || fs.existsSync(path.join(cwd, "k8s")) || fs.existsSync(path.join(cwd, "helm"))) infra = true;
  if (fs.existsSync(path.join(cwd, "docs")) || fs.existsSync(path.join(cwd, "mkdocs.yml")) || fs.existsSync(path.join(cwd, "mint.json")) || fs.existsSync(path.join(cwd, "docusaurus.config.js"))) docs = true;

  if (hasPackage) {
    if (fs.existsSync(path.join(cwd, "frontend")) || fs.existsSync(path.join(cwd, "apps/web")) || fs.existsSync(path.join(cwd, "apps/frontend"))) frontend = true;
    if (fs.existsSync(path.join(cwd, "backend")) || fs.existsSync(path.join(cwd, "apps/api")) || fs.existsSync(path.join(cwd, "apps/server"))) backend = true;
    if (packageHasAny(cwd, /"(next|react|vite|vue|svelte|astro|@angular\/core|remix)"/i)
      || fs.existsSync(path.join(cwd, "next.config.js"))
      || fs.existsSync(path.join(cwd, "next.config.mjs"))
      || fs.existsSync(path.join(cwd, "next.config.ts"))
      || fs.existsSync(path.join(cwd, "vite.config.js"))
      || fs.existsSync(path.join(cwd, "vite.config.ts"))
      || fs.existsSync(path.join(cwd, "src/app"))
      || fs.existsSync(path.join(cwd, "pages"))
      || fs.existsSync(path.join(cwd, "public"))) frontend = true;
    if (packageHasAny(cwd, /"(@nestjs|express|fastify|hono|koa|apollo-server|graphql-yoga|prisma|typeorm|sequelize|drizzle-orm)"/i)
      || fs.existsSync(path.join(cwd, "nest-cli.json"))
      || fs.existsSync(path.join(cwd, "prisma"))
      || fs.existsSync(path.join(cwd, "src/server"))
      || fs.existsSync(path.join(cwd, "src/api"))) backend = true;
  }

  if (fs.existsSync(path.join(cwd, "pom.xml")) || fs.existsSync(path.join(cwd, "build.gradle")) || fs.existsSync(path.join(cwd, "build.gradle.kts")) || fs.existsSync(path.join(cwd, "src/main/java")) || fs.existsSync(path.join(cwd, "src/main/kotlin"))) backend = true;

  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) {
    try {
      if (/(fastapi|flask|django|litestar|starlite)/i.test(fs.readFileSync(path.join(cwd, "pyproject.toml"), "utf8"))) backend = true;
    } catch {
      // ignore unreadable pyproject for recommendation
    }
  }

  if (mobile) return { name: "mobile", reason: "Mobile markers found." };
  if (frontend && backend) return { name: "fullstack", reason: "Frontend and backend markers both found. Pick be-readonly-fe instead if backend must be read-only." };
  if (frontend) return { name: "web-frontend", reason: "Frontend framework markers found." };
  if (backend) return { name: "backend-api", reason: "Backend/API markers found." };
  if (data) return { name: "data", reason: "Data/ETL markers found." };
  if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return { name: "python", reason: "Python pyproject.toml found." };
  if (hasPackage && fs.existsSync(path.join(cwd, "tsconfig.json"))) return { name: "node-typescript", reason: "Node TypeScript markers found." };
  if (infra) return { name: "devops", reason: "Infrastructure markers found." };
  if (docs) return { name: "docs", reason: "Documentation markers found." };
  return { name: "generic", reason: "No stronger project markers found." };
}

function profileDescription(name: string): string {
  const descriptions: Record<string, string> = {
    generic: "Safe baseline for unknown repos.",
    "web-frontend": "Frontend-only React/Next/Vite-style work.",
    "backend-api": "Backend/API implementation work.",
    "be-readonly-fe": "Scout backend contract read-only, implement frontend only.",
    fullstack: "Frontend and backend can both be edited when task scope allows.",
    "node-typescript": "Node/TypeScript library or tooling repo.",
    python: "Python app/library repo.",
    data: "ETL/dbt/DVC/notebook/data pipeline repo.",
    devops: "Docker/Terraform/K8s/GitHub Actions/infrastructure repo.",
    mobile: "React Native/Flutter/mobile repo.",
    docs: "Documentation portal/manual repo."
  };
  return descriptions[name] ?? "Custom project profile.";
}

function normalizeProjectProfileName(value: string): string {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    fe: "web-frontend",
    frontend: "web-frontend",
    web: "web-frontend",
    be: "backend-api",
    backend: "backend-api",
    api: "backend-api",
    full: "fullstack",
    befe: "be-readonly-fe",
    "be-fe": "be-readonly-fe",
    "be-readonly": "be-readonly-fe",
    "readonly-fe": "be-readonly-fe",
    typescript: "node-typescript",
    ts: "node-typescript"
  };
  return aliases[normalized] ?? normalized;
}

function buildProfileOptions(extensionDir: string, cwd: string, intent?: string): { recommended: string; reason: string; options: ProfileOption[] } {
  const recommendation = detectProfileName(cwd, intent);
  const options = readAdapterProfiles(extensionDir).map(({ name, profile }) => ({
    name,
    displayName: profile.displayName,
    mode: profile.mode,
    description: profileDescription(name),
    recommended: name === recommendation.name,
    reason: name === recommendation.name ? recommendation.reason : profileDescription(name)
  }));
  return { recommended: recommendation.name, reason: recommendation.reason, options };
}

function writeProfileFromAdapter(extensionDir: string, cwd: string, profileName: string, overwrite = false, projectId?: string, displayName?: string): ProjectProfile {
  const source = adapterProfilePath(extensionDir, profileName);
  if (!source) throw new Error(`Unknown profile: ${profileName}`);
  const target = projectProfilePath(cwd);
  if (fs.existsSync(target) && !overwrite) throw new Error(".pi/company-profile.json already exists. Pass overwrite=true to replace it.");
  const profile = readJsonFile<ProjectProfile>(source);
  if (!profile) throw new Error(`Profile unreadable: ${profileName}`);
  const projectName = path.basename(cwd);
  const personalized: ProjectProfile = {
    ...profile,
    projectId: projectId ? slugify(projectId) : slugify(projectName),
    displayName: displayName?.trim() || titleize(projectName)
  };
  const capabilityLock = resolveCapabilityProfileDocument(findPlatformRoot(extensionDir), personalized, {
    profileFile: "company-profile.json",
    packageSource: projectPackageSource(cwd)
  });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeProfileLockAtomic(target, personalized, path.join(cwd, ".pi", "company-profile.lock.json"), capabilityLock);
  ensureProjectContextPlaceholder(cwd);
  return personalized;
}

function readTask(cwd: string, taskId: string): TaskContract | undefined {
  return readJsonFile<TaskContract>(taskFilePath(cwd, taskId));
}

function writeTask(cwd: string, task: TaskContract): TaskContract {
  ensureStateDirs(cwd);
  task.updatedAt = nowIso();
  fs.writeFileSync(taskFilePath(cwd, task.taskId), `${JSON.stringify(task, null, 2)}\n`);
  return task;
}

function evaluateTaskGate(task: TaskContract | undefined, policy: BasePolicy): {
  decision: "pass" | "fail";
  missing: string[];
  warnings: string[];
} {
  const finalGate = finalGateConfig(policy);
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!task) {
    return { decision: "fail", missing: ["task contract"], warnings };
  }
  if (finalGate.requireContextManifest && task.contextManifest.length === 0) missing.push("context manifest");
  if (finalGate.requireVerifyEvidence && task.verifyEvidence.length === 0) missing.push("verify evidence");
  if (task.verifyEvidence.some((evidence) => evidence.observed !== true)) {
    warnings.push("Unobserved verify evidence is ignored by the passing verify gate.");
  }
  if (task.verifyEvidence.some((evidence) => evidence.observed === true && evidence.matchedProfileCommand !== true)) {
    warnings.push("Observed verify evidence that does not exactly match task verifyCommands is advisory only.");
  }
  if (finalGate.requirePassingVerify && task.verifyEvidence.length > 0 && !task.verifyEvidence.some((evidence) => evidence.exitCode === 0 && evidence.observed === true && evidence.matchedProfileCommand === true)) {
    missing.push("observed passing profile verify evidence");
  }
  if (finalGate.requireTrace && task.trace.outcome === "pending") missing.push("final trace");
  if (task.changedFiles.length === 0 && task.trace.outcome === "completed") warnings.push("Trace is completed but changedFiles is empty.");
  return { decision: missing.length === 0 ? "pass" : "fail", missing, warnings };
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  return `${value.toFixed(1)}%`;
}

function modelLabel(ctx: ExtensionContext): string {
  const model = ctx.model as { provider?: string; id?: string; name?: string } | undefined;
  if (!model) return "none";
  if (model.provider && model.id) return `${model.provider}/${model.id}`;
  return model.name ?? model.id ?? "unknown";
}

function buildUsageSnapshot(ctx: ExtensionContext, thinkingLevel?: string): UsageSnapshot {
  const contextUsage = ctx.getContextUsage();
  const contextWithThinking = ctx as ExtensionContext & { getThinkingLevel?: () => string };
  return {
    sessionFile: ctx.sessionManager.getSessionFile(),
    sessionId: ctx.sessionManager.getSessionId(),
    sessionName: ctx.sessionManager.getSessionName(),
    cwd: ctx.cwd,
    mode: ctx.mode,
    model: modelLabel(ctx),
    thinkingLevel: thinkingLevel ?? contextWithThinking.getThinkingLevel?.() ?? "unknown",
    entries: {
      total: ctx.sessionManager.getEntries().length,
      branch: ctx.sessionManager.getBranch().length
    },
    contextUsage: contextUsage
      ? {
          tokens: contextUsage.tokens,
          contextWindow: contextUsage.contextWindow,
          percent: contextUsage.percent
        }
      : undefined,
    exactTotals: {
      availableInCommand: false,
      howToRead: [
        "Inside Pi TUI: run /session for exact tokens and cost.",
        "Outside Pi: run pi-company-usage /path/to/project or scripts/pi-session-stats.sh /path/to/project."
      ]
    }
  };
}

function formatUsageSnapshot(snapshot: UsageSnapshot): string {
  const context = snapshot.contextUsage
    ? `${formatCount(snapshot.contextUsage.tokens)} / ${formatCount(snapshot.contextUsage.contextWindow)} tokens (${formatPercent(snapshot.contextUsage.percent)})`
    : "unavailable";
  return [
    "# Company usage snapshot",
    "",
    `- Session: ${snapshot.sessionName ?? "unnamed"} (${snapshot.sessionId ?? "unknown"})`,
    `- Session file: ${snapshot.sessionFile ?? "not persisted"}`,
    `- CWD: ${snapshot.cwd}`,
    `- Mode: ${snapshot.mode}`,
    `- Model: ${snapshot.model}`,
    `- Thinking: ${snapshot.thinkingLevel}`,
    `- Entries: ${formatCount(snapshot.entries.branch)} on active branch / ${formatCount(snapshot.entries.total)} total`,
    `- Live context: ${context}`,
    "",
    "Exact billed input/output/cache/cost totals are exposed by Pi via `/session` or RPC `get_session_stats`, not directly inside this command context.",
    "",
    "From another terminal:",
    "",
    "```bash",
    "pi-company-usage /path/to/project",
    "```"
  ].join("\n");
}

function estimateTokensFromChars(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}

function buildContextPreflight(snapshot: UsageSnapshot, workflow = "task", inputChars = 0): ContextPreflight {
  const inputTokenEstimate = estimateTokensFromChars(inputChars);
  const live = snapshot.contextUsage;
  let projectedContext: ContextPreflight["projectedContext"];
  let recommendation: ContextPreflight["recommendation"] = "unknown";
  let reason = "Context usage is unavailable; use /session or /company-usage if the task is large.";

  if (live && live.tokens !== null && live.percent !== null) {
    const projectedTokens = live.tokens + inputTokenEstimate;
    const projectedPercent = live.contextWindow > 0 ? (projectedTokens / live.contextWindow) * 100 : live.percent;
    projectedContext = {
      tokens: projectedTokens,
      percent: projectedPercent
    };

    if (live.percent >= CONTEXT_FRESH_PERCENT || projectedPercent >= CONTEXT_FRESH_PERCENT || inputChars >= LONG_INPUT_CHARS) {
      recommendation = "fresh-session";
      reason = "Use a fresh governed session before this task to avoid provider context overflow and stale task state.";
    } else if (live.percent >= CONTEXT_COMPACT_PERCENT || projectedPercent >= CONTEXT_COMPACT_PERCENT) {
      recommendation = "compact";
      reason = "Compact before continuing; the current session is close to the high-context zone.";
    } else if (live.percent >= CONTEXT_WATCH_PERCENT || projectedPercent >= CONTEXT_WATCH_PERCENT) {
      recommendation = "watch";
      reason = "Proceed, but keep context targeted and avoid broad file injection.";
    } else {
      recommendation = "ok";
      reason = "Context is within the normal range for a bounded task.";
    }
  } else if (inputChars >= LONG_INPUT_CHARS) {
    recommendation = "fresh-session";
    reason = "The incoming request is large; start a fresh governed session and keep the full intake in a file.";
  }

  return {
    workflow,
    inputChars,
    inputTokenEstimate,
    liveContext: live,
    projectedContext,
    recommendation,
    reason,
    commands: [
      "/task-preflight",
      "/task-preflight compact",
      `/fresh-${workflow === "be-to-fe" ? "be-to-fe" : workflow === "scout" ? "scout" : "task"} <request>`,
      "/company-usage",
      "/session"
    ]
  };
}

function formatContextPreflight(preflight: ContextPreflight, snapshot: UsageSnapshot): string {
  const live = preflight.liveContext
    ? `${formatCount(preflight.liveContext.tokens)} / ${formatCount(preflight.liveContext.contextWindow)} (${formatPercent(preflight.liveContext.percent)})`
    : "unavailable";
  const projected = preflight.projectedContext
    ? `${formatCount(preflight.projectedContext.tokens)} (${formatPercent(preflight.projectedContext.percent)})`
    : "unavailable";
  return [
    "# Company task preflight",
    "",
    `- Workflow: ${preflight.workflow}`,
    `- Session: ${snapshot.sessionName ?? "unnamed"} (${snapshot.sessionId ?? "unknown"})`,
    `- Model: ${snapshot.model}`,
    `- Thinking: ${snapshot.thinkingLevel}`,
    `- Entries: ${formatCount(snapshot.entries.branch)} active / ${formatCount(snapshot.entries.total)} total`,
    `- Live context: ${live}`,
    `- Incoming input estimate: ${formatCount(preflight.inputTokenEstimate)} tokens from ${formatCount(preflight.inputChars)} chars`,
    `- Projected context: ${projected}`,
    `- Recommendation: ${preflight.recommendation}`,
    `- Reason: ${preflight.reason}`,
    "",
    "Commands:",
    "",
    "```text",
    ...preflight.commands,
    "```",
    "",
    "Notes:",
    "",
    "- Do not paste the full mandatory flow into every task. Platform prompts and company tools already carry it.",
    "- Use `/scout` for read-only risk mapping. Use `/fresh-scout` when the current session is already heavy.",
    "- If exact billed token/cost totals are needed, run `/session` in Pi or `pi-company-usage <project-path>` from another terminal."
  ].join("\n");
}

function looksLikeGovernedBoilerplate(text: string): boolean {
  const lower = text.toLowerCase();
  const markers = [
    "mandatory flow",
    "company_context",
    "company_task_start",
    "company_context_record",
    "company_verify_record",
    "company_task_gate_check",
    "output format"
  ];
  return markers.filter((marker) => lower.includes(marker)).length >= 3;
}

function extractFencedBlockAfter(label: RegExp, text: string): string | undefined {
  const labelMatch = label.exec(text);
  if (!labelMatch || labelMatch.index === undefined) return undefined;
  const rest = text.slice(labelMatch.index + labelMatch[0].length);
  const fenced = /```(?:text|md|markdown)?\s*([\s\S]*?)```/i.exec(rest);
  return fenced?.[1]?.trim();
}

function extractTaskRequest(text: string): string {
  const labeled =
    extractFencedBlockAfter(/(?:implement|scout|review|plan)\s+(?:this\s+)?task\s*:?\s*/i, text) ??
    extractFencedBlockAfter(/request\s*:?\s*/i, text);
  if (labeled) return stripLeadingWorkflowCommand(labeled);

  const firstFence = /```(?:text|md|markdown)?\s*([\s\S]*?)```/i.exec(text);
  if (firstFence?.[1]?.trim()) return stripLeadingWorkflowCommand(firstFence[1].trim());

  return stripLeadingWorkflowCommand(text.trim());
}

function stripLeadingWorkflowCommand(input: string): string {
  return input.replace(/^\/(?:task|scout|be-to-fe|review|plan|platform-improve)\b\s*/i, "").trim();
}

function trimTaskForInline(input: string): string {
  const normalized = stripLeadingWorkflowCommand(input).trim().replace(/\n{3,}/g, "\n\n");
  if (normalized.length <= MAX_INLINE_COLLAPSED_TASK_CHARS) return normalized;
  return `${normalized.slice(0, MAX_INLINE_COLLAPSED_TASK_CHARS).trim()}\n\n[Input truncated by company preflight. Put the full spec in a project file and reference that file.]`;
}

function chooseFreshWorkflow(original: string, task: string): "task" | "scout" | "be-to-fe" {
  const semantic = stripLeadingWorkflowCommand(task || original).toLowerCase();
  const starts = original.trim().toLowerCase();
  if (starts.startsWith("/be-to-fe")) return "be-to-fe";
  if (starts.startsWith("/scout")) return "scout";
  const asksForWrite = /\b(implement|support|surface|consume|write|change|fix)\b/.test(semantic);
  if (/\b(scout|read-only|read only|audit|mapping|mapping matrix|map contract)\b/.test(semantic) && !asksForWrite) {
    return "scout";
  }
  if (/\b(be|backend)\b/.test(semantic) && /\b(fe|frontend)\b/.test(semantic) && asksForWrite) {
    return "be-to-fe";
  }
  return "task";
}

function isCompanyWorkflowInput(text: string): boolean {
  return /^\/(?:task|be-to-fe|scout|review|plan|platform-improve)\b/i.test(text.trim());
}

function isFreshOrUtilityInput(text: string): boolean {
  return /^\/(?:fresh-task|fresh-scout|fresh-be-to-fe|task-preflight|company-usage|session|compact)\b/i.test(text.trim());
}

function taskInboxDir(cwd: string): string {
  return path.join(cwd, ".pi", "task-inbox");
}

function writeTaskInbox(cwd: string, workflow: string, text: string): string {
  fs.mkdirSync(taskInboxDir(cwd), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeWorkflow = workflow.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "task";
  const fileName = `${stamp}-${safeWorkflow}.md`;
  const absolute = path.join(taskInboxDir(cwd), fileName);
  fs.writeFileSync(absolute, `${redactText(text)}\n`);
  return path.relative(cwd, absolute).split(path.sep).join("/");
}

function buildFreshCommand(cwd: string, workflow: "task" | "scout" | "be-to-fe", originalText: string, reason: string): string {
  const task = extractTaskRequest(originalText);
  if (originalText.length >= LONG_INPUT_CHARS) {
    const intakePath = writeTaskInbox(cwd, workflow, originalText);
    return `/fresh-${workflow} Read task intake from ${intakePath}. ${reason}`;
  }
  return `/fresh-${workflow} ${trimTaskForInline(task)}`;
}

function shortTaskLabel(text: string): string {
  const compact = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[^A-Za-z0-9\u00C0-\u1EF9_-]+/g, " ")
    .trim()
    .slice(0, 64);
  return compact || "company task";
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function supportedImageMimeType(filePath: string, bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "bmp") return "image/bmp";
  return undefined;
}

function normalizeImagePathCandidate(candidate: string, cwd: string, options: { allowBareRelative?: boolean } = {}): string | undefined {
  let raw = candidate.trim().replace(/^['"`<]+|['"`>,.;:!?]+$/g, "");
  if (!raw) return undefined;
  const allowBareRelative = options.allowBareRelative !== false;
  const hasExplicitPathPrefix = raw.startsWith("file://") || raw.startsWith("~/") || path.isAbsolute(raw) || raw.startsWith("./") || raw.startsWith("../");
  if (!allowBareRelative && !hasExplicitPathPrefix) return undefined;
  try {
    if (raw.startsWith("file://")) raw = fileURLToPath(raw);
  } catch {
    return undefined;
  }
  if (raw.startsWith("~/")) {
    const home = process.env.HOME;
    if (!home) return undefined;
    raw = path.join(home, raw.slice(2));
  }
  const ext = path.extname(raw).toLowerCase().replace(/^\./, "");
  if (!IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number])) return undefined;
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
  return absolute;
}

function extractLocalImagePathCandidates(text: string, cwd: string): string[] {
  const candidates = new Set<string>();
  const imageExt = "(?:png|jpe?g|gif|webp|bmp)";
  const wholeTextPath = normalizeImagePathCandidate(text, cwd, { allowBareRelative: false });
  if (wholeTextPath) candidates.add(wholeTextPath);

  const quoted = new RegExp(`(?:path=)?["']([^"']+\\.${imageExt})["']`, "gi");
  for (const match of text.matchAll(quoted)) {
    const normalized = normalizeImagePathCandidate(match[1], cwd);
    if (normalized) candidates.add(normalized);
  }

  const fileUrl = new RegExp(`file://[^\\s"'<>]+\\.${imageExt}`, "gi");
  for (const match of text.matchAll(fileUrl)) {
    const normalized = normalizeImagePathCandidate(match[0], cwd);
    if (normalized) candidates.add(normalized);
  }

  const linePathPattern = '\\s((?:/|~\\/|\\.\\.?/)[^\\n\\r"\\\'<>]*?\\.' + imageExt + ')(?=$|\\s|["\\\'`)>])';
  const linePath = new RegExp(linePathPattern, "gi");
  for (const match of text.matchAll(linePath)) {
    const normalized = normalizeImagePathCandidate(match[1], cwd);
    if (normalized) candidates.add(normalized);
  }

  return [...candidates];
}

function attachLocalImagesFromText(text: string, existingImages: unknown[] | undefined, cwd: string): ChatImageAttachmentResult | undefined {
  const imagePaths = extractLocalImagePathCandidates(text, cwd);
  if (imagePaths.length === 0) return undefined;

  const existing = Array.isArray(existingImages) ? existingImages : [];
  const images: ChatImageAttachmentResult["images"] = [];
  const attached: ChatImageAttachmentResult["attached"] = [];
  const skipped: ChatImageAttachmentResult["skipped"] = [];
  let nextText = text;

  for (const imagePath of imagePaths) {
    if (images.length + existing.length >= MAX_CHAT_IMAGE_ATTACHMENTS) {
      skipped.push({ path: imagePath, reason: `attachment limit ${MAX_CHAT_IMAGE_ATTACHMENTS} reached` });
      continue;
    }
    try {
      const stat = fs.statSync(imagePath);
      if (!stat.isFile()) {
        skipped.push({ path: imagePath, reason: "not a file" });
        continue;
      }
      if (stat.size <= 0) {
        skipped.push({ path: imagePath, reason: "empty file" });
        continue;
      }
      if (stat.size > MAX_CHAT_IMAGE_BYTES) {
        skipped.push({ path: imagePath, reason: `image is ${formatCount(stat.size)} bytes > ${formatCount(MAX_CHAT_IMAGE_BYTES)} byte limit; use read on the file so Pi can resize it` });
        continue;
      }
      const bytes = fs.readFileSync(imagePath);
      const mimeType = supportedImageMimeType(imagePath, bytes);
      if (!mimeType) {
        skipped.push({ path: imagePath, reason: "unsupported image type" });
        continue;
      }
      const marker = `[image${existing.length + images.length + 1}]`;
      images.push({ type: "image", mimeType, data: bytes.toString("base64") });
      attached.push({ marker, path: imagePath, mimeType, bytes: stat.size });
      nextText = nextText.replace(new RegExp(escapeRegExp(imagePath), "g"), marker);
      nextText = nextText.replace(new RegExp(escapeRegExp(`file://${imagePath}`), "g"), marker);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push({ path: imagePath, reason: message });
    }
  }

  if (attached.length === 0) {
    return skipped.length > 0 ? { text, images: [], attached, skipped } : undefined;
  }

  const attachmentLines = attached.map((item) => `- ${item.marker}: ${path.basename(item.path)} (${item.mimeType}, ${formatCount(item.bytes)} bytes)`);
  const skippedLines = skipped.map((item) => `- skipped ${path.basename(item.path)}: ${item.reason}`);
  nextText = [
    nextText.trim(),
    "",
    "Attached local image(s):",
    ...attachmentLines,
    ...(skippedLines.length > 0 ? ["", "Skipped local image path(s):", ...skippedLines] : [])
  ].join("\n").trim();

  return { text: nextText, images, attached, skipped };
}

function appendTrace(cwd: string, payload: Record<string, unknown>): void {
  ensureStateDirs(cwd);
  const safePayload = redactForStorage(payload) as Record<string, unknown>;
  fs.appendFileSync(traceFilePath(cwd), `${JSON.stringify({ recordedAt: nowIso(), ...safePayload })}\n`);
}

function appendSessionTrace(pi: ExtensionAPI, payload: Record<string, unknown>): void {
  const safePayload = redactForStorage(payload) as Record<string, unknown>;
  pi.appendEntry(COMPANY_TRACE_STATE_TYPE, {
    version: 1,
    recordedAt: nowIso(),
    ...safePayload
  });
}

function flattenVerifyCommands(profile: ProjectProfile): string[] {
  return Object.values(profile.verifyCommands ?? {}).flat();
}

function parseReferenceRepoRef(input: string): { host: string; owner: string; repo: string } {
  const ref = input.trim().replace(/\/+$/, "");
  if (!ref) throw new Error("repoRef is required");

  let host = "";
  let rest = "";
  if (/^https?:\/\//.test(ref)) {
    const parsed = new URL(ref);
    host = parsed.hostname;
    rest = parsed.pathname.replace(/^\/+/, "");
  } else if (ref.startsWith("git@") && ref.includes(":")) {
    const withoutUser = ref.slice("git@".length);
    const [rawHost, rawRest] = withoutUser.split(":", 2);
    host = rawHost;
    rest = rawRest;
  } else {
    const parts = ref.split("/");
    if (parts.length >= 3 && parts[0].includes(".")) {
      host = parts[0];
      rest = parts.slice(1).join("/");
    } else if (parts.length >= 2) {
      host = "github.com";
      rest = ref;
    }
  }

  rest = rest.replace(/\.git$/, "");
  const [owner, repo, extra] = rest.split("/");
  const valid = /^[A-Za-z0-9._-]+$/;
  if (!host || !owner || !repo || extra || !valid.test(host) || !valid.test(owner) || !valid.test(repo)) {
    throw new Error(`Unsupported repository reference: ${input}`);
  }
  return { host, owner, repo };
}

function referenceCacheRoot(): string {
  const explicit = process.env.PI_COMPANY_CHECKOUT_CACHE;
  if (explicit && explicit.trim()) return explicit;
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg && xdg.trim()) return path.join(xdg, "pi-company-platform", "checkouts");
  const home = process.env.HOME;
  if (home && home.trim()) return path.join(home, ".cache", "pi-company-platform", "checkouts");
  throw new Error("HOME, XDG_CACHE_HOME, or PI_COMPANY_CHECKOUT_CACHE is required");
}

function runGit(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function isCleanGitWorktree(checkoutPath: string): boolean {
  try {
    runGit(["diff", "--quiet", "--ignore-submodules", "--"], checkoutPath);
    runGit(["diff", "--cached", "--quiet", "--ignore-submodules", "--"], checkoutPath);
    return true;
  } catch {
    return false;
  }
}

function shouldFetch(stampPath: string, forceUpdate: boolean, intervalSeconds: number): boolean {
  if (forceUpdate) return true;
  try {
    const lastFetch = Number.parseInt(fs.readFileSync(stampPath, "utf8").replace(/\D/g, ""), 10);
    if (!Number.isFinite(lastFetch)) return true;
    return Math.floor(Date.now() / 1000) - lastFetch >= intervalSeconds;
  } catch {
    return true;
  }
}

function checkoutReferenceRepo(repoRef: string, forceUpdate = false): ReferenceRepo {
  const { host, owner, repo } = parseReferenceRepoRef(repoRef);
  const cloneUrl = `https://${host}/${owner}/${repo}.git`;
  const checkoutPath = path.join(referenceCacheRoot(), host, owner, repo);
  const stampPath = path.join(checkoutPath, ".pi-company-last-fetch");
  const intervalSeconds = Number.parseInt(process.env.PI_COMPANY_CHECKOUT_FETCH_INTERVAL_SECONDS ?? "300", 10);
  let fetched = false;

  if (!fs.existsSync(path.join(checkoutPath, ".git"))) {
    fs.mkdirSync(path.dirname(checkoutPath), { recursive: true });
    runGit(["clone", "--filter=blob:none", "--", cloneUrl, checkoutPath]);
    fs.writeFileSync(stampPath, `${Math.floor(Date.now() / 1000)}\n`);
    fetched = true;
  } else if (shouldFetch(stampPath, forceUpdate, Number.isFinite(intervalSeconds) ? intervalSeconds : 300)) {
    const clean = isCleanGitWorktree(checkoutPath);
    runGit(["fetch", "--filter=blob:none", "--prune", "origin"], checkoutPath);
    if (clean) {
      try {
        runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], checkoutPath);
        try {
          runGit(["merge", "--ff-only", "@{u}"], checkoutPath);
        } catch {
          // Keep stale checkout rather than mutating a divergent cache.
        }
      } catch {
        // No upstream branch; fetch is enough.
      }
    }
    fs.writeFileSync(stampPath, `${Math.floor(Date.now() / 1000)}\n`);
    fetched = true;
  }

  let commit: string | undefined;
  try {
    commit = runGit(["rev-parse", "--short", "HEAD"], checkoutPath);
  } catch {
    commit = undefined;
  }

  return { host, owner, repo, cloneUrl, checkoutPath, commit, fetched };
}

export default function companyGuard(pi: ExtensionAPI) {
  const extensionDir = path.dirname(fileURLToPath(import.meta.url));
  const policy = loadPolicy(extensionDir);
  const bashResults = createBashResultLedger({ maxEntries: 300 });

  pi.on("session_start", async (_event, ctx) => {
    const projectTrusted = ctx.isProjectTrusted();
    const explicitProfile = Boolean(process.env.PI_COMPANY_PROFILE?.trim());
    const profile = loadProfile(ctx.cwd, projectTrusted);
    const name = profile.displayName || profile.projectId || path.basename(ctx.cwd);
    pi.setSessionName(`pi:${name}`);
    const profileHint = explicitProfile || (projectTrusted && fs.existsSync(projectProfilePath(ctx.cwd)))
      ? ""
      : " (run /onboard-project to select a profile)";
    const snapshot = buildUsageSnapshot(ctx, String(pi.getThinkingLevel()));
    const preflight = buildContextPreflight(snapshot, "task", 0);
    const capabilityState = verifyProjectCapabilityState(extensionDir, ctx.cwd, projectTrusted);
    const permissionProfile = resolvePermissionProfile(profile, policy, permissionOverrideFromContext(ctx));
    const contextHint = preflight.recommendation === "fresh-session"
      ? " Context is high; use /fresh-task or /fresh-scout for new work."
      : preflight.recommendation === "compact"
        ? " Context is warm; run /task-preflight before large work."
        : "";
    const permissionHint = ` permission=${permissionProfile.mode}`;
    ctx.ui.notify(`Company Pi guard loaded: ${name}${profileHint}${permissionHint}${contextHint}`, preflight.recommendation === "fresh-session" ? "warning" : "info");
    if (!capabilityState.ok) ctx.ui.notify(capabilityState.reason ?? "Capability validation failed.", "warning");
    if (permissionProfile.warning) ctx.ui.notify(permissionProfile.warning, "warning");
    if (permissionProfile.mode === "trusted-full-access") {
      ctx.ui.notify("Company permission profile trusted-full-access is active; protected paths, secret redaction, and destructive/external confirmations remain enforced.", "warning");
    }
  });

  pi.on("input", async (event, ctx) => {
    const text = event.text.trim();
    if (!text || isFreshOrUtilityInput(text)) return { action: "continue" };

    const imageAttachment = attachLocalImagesFromText(text, event.images, ctx.cwd);
    if (imageAttachment?.attached.length) {
      ctx.ui.notify(`Company image input: attached ${imageAttachment.attached.map((item) => item.marker).join(", ")}`, "info");
    } else if (imageAttachment?.skipped.length) {
      ctx.ui.notify(`Company image input: skipped ${imageAttachment.skipped.length} local image path(s)`, "warning");
    }

    const inputText = imageAttachment?.text ?? text;
    const canRewriteWorkflow = event.source !== "extension";
    const snapshot = buildUsageSnapshot(ctx, String(pi.getThinkingLevel()));
    const preflight = buildContextPreflight(snapshot, chooseFreshWorkflow(inputText, inputText), inputText.length);
    const hasBoilerplate = looksLikeGovernedBoilerplate(inputText);
    const shouldFreshen =
      canRewriteWorkflow &&
      preflight.recommendation === "fresh-session" &&
      (hasBoilerplate || isCompanyWorkflowInput(inputText) || inputText.length >= LONG_INPUT_CHARS);
    const shouldCollapseBoilerplate = canRewriteWorkflow && hasBoilerplate && inputText.length >= BOILERPLATE_COLLAPSE_CHARS;

    const outgoingImages = [
      ...(Array.isArray(event.images) ? event.images : []),
      ...(imageAttachment?.images ?? [])
    ];

    if (!shouldFreshen && !shouldCollapseBoilerplate) {
      if (imageAttachment?.attached.length) return { action: "transform", text: inputText, images: outgoingImages };
      return { action: "continue" };
    }

    const task = extractTaskRequest(inputText);
    const workflow = chooseFreshWorkflow(inputText, task);
    const reason = shouldFreshen
      ? "Current session is near context limits; use a fresh governed session."
      : "Mandatory flow boilerplate is already part of the platform; collapse it to the task request.";
    const command = shouldFreshen
      ? buildFreshCommand(ctx.cwd, workflow, inputText, reason)
      : `/${workflow} ${trimTaskForInline(task)}`;

    ctx.ui.notify(`Company preflight: ${reason}`, "warning");
    return outgoingImages.length > 0
      ? { action: "transform", text: command, images: outgoingImages }
      : { action: "transform", text: command };
  });

  pi.on("tool_result", async (event, ctx) => {
    const profile = loadProfileFromContext(ctx);
    const pathPolicy = effectiveProtectedPaths(policy, profile);

    const observed = observedBashResultFromToolResultEvent(event, ctx.cwd);
    if (observed) {
      bashResults.record(observed);
      try {
        appendObservedBashResult(observedBashLedgerPath(ctx.cwd), {
          ...observed,
          redactedCommand: redactText(observed.command)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Company Pi guard could not persist bash evidence ledger: ${message}`, "warn");
      }
    }

    let resultContent: unknown = event.content;
    let resultDetails: unknown = event.details;
    let resultChanged = false;

    if (event.toolName === "grep") {
      const filtered = filterGrepProtectedContent(resultContent, pathPolicy.readProtectedPaths);
      if (filtered.changed) {
        resultContent = filtered.content;
        resultDetails = resultDetails && typeof resultDetails === "object"
          ? { ...resultDetails, protectedMatchesRedacted: filtered.redactedLines }
          : { protectedMatchesRedacted: filtered.redactedLines };
        resultChanged = true;
      }
    }

    if (event.toolName === "find" || event.toolName === "ls") {
      const input = event.input && typeof event.input === "object"
        ? event.input as Record<string, unknown>
        : {};
      const basePath = extractLikelyPathFromInput(ctx.cwd, input) || ".";
      const filtered = filterProtectedPathListContent(ctx.cwd, resultContent, pathPolicy.readProtectedPaths, basePath, event.toolName);
      if (filtered.changed) {
        resultContent = filtered.content;
        resultDetails = resultDetails && typeof resultDetails === "object"
          ? { ...resultDetails, protectedPathsRedacted: filtered.redactedLines }
          : { protectedPathsRedacted: filtered.redactedLines };
        resultChanged = true;
      }
    }

    const safeContent = redactToolResultTextContent(resultContent);
    const safeDetails = redactForStorage(resultDetails);
    const detailRedactions = countChangedStringLeaves(resultDetails, safeDetails);
    const sensitiveValuesRedacted = safeContent.redacted + detailRedactions;
    if (sensitiveValuesRedacted > 0) {
      resultContent = safeContent.content;
      resultDetails = isPlainRecord(safeDetails)
        ? { ...safeDetails, sensitiveValuesRedacted }
        : safeDetails;
      resultChanged = true;
    }

    if (resultChanged) {
      return resultDetails === undefined
        ? { content: resultContent }
        : { content: resultContent, details: resultDetails };
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    const projectTrusted = ctx.isProjectTrusted();
    const capabilityState = verifyProjectCapabilityState(extensionDir, ctx.cwd, projectTrusted);
    const recoveryTools = new Set(["company_profile_options", "company_profile_apply", "company_context", "read", "grep", "find", "ls"]);
    if (!capabilityState.ok && !recoveryTools.has(event.toolName)) {
      return { block: true, reason: capabilityState.reason ?? "Capability lock validation failed." };
    }
    const profile = loadProfile(ctx.cwd, projectTrusted);
    const runtime = resolveRuntimePolicy(profile);
    const permissionProfile = resolvePermissionProfile(profile, policy, permissionOverrideFromContext(ctx));
    const pathPolicy = effectiveProtectedPaths(policy, profile);
    const permissionDecision = evaluatePermissionProfileToolAccess(event.toolName, permissionProfile);
    if (permissionDecision.block) {
      return { block: true, reason: permissionDecision.reason };
    }
    const toolDecision = evaluateToolPolicy(event.toolName, profile, policy);
    if (toolDecision.decision === "block" && permissionProfile.mode !== "trusted-full-access") {
      return { block: true, reason: `Tool registry blocked ${event.toolName}: ${toolDecision.reason}` };
    }
    const toolInput = event.input && typeof event.input === "object"
      ? event.input as Record<string, unknown>
      : {};
    const preparedInput = prepareToolInputForPolicy(event.toolName, toolInput, policy);
    if (preparedInput.reason) {
      return { block: true, reason: `Blocked ${event.toolName}: ${preparedInput.reason}.` };
    }

    if (SHELL_TOOL_NAMES.has(event.toolName)) {
      const shellInput = extractShellCommandInput(toolInput);
      if (!shellInput.command) {
        return { block: true, reason: `Blocked ${event.toolName}: ${shellInput.reason ?? "shell command input is missing or unsupported"}.` };
      }
      const command = normalizeShellCommandForPolicy(shellInput.command);
      const execDecision = evaluateExecPolicy(command, profile, policy);
      if (execDecision.mode !== "off" && execDecision.decision === "forbid") {
        return { block: true, reason: execDecision.reasons.join("; ") };
      }

      const protectedHit = findProtectedPathInCommand(command, pathPolicy.shellProtectedPaths);
      if (protectedHit) {
        return { block: true, reason: `Command touches protected path: ${protectedHit.candidate} matches ${protectedHit.pattern}` };
      }
      const protectedGlobHit = shellGlobTargetsProtectedPath(command, pathPolicy.shellProtectedPaths);
      if (protectedGlobHit) {
        return {
          block: true,
          reason: `Command glob can target protected path: ${protectedGlobHit.glob} can match ${protectedGlobHit.example} via ${protectedGlobHit.pattern}`
        };
      }
      const resolvedProtectedHit = findResolvedProtectedPathInCommand(ctx.cwd, command, pathPolicy.shellProtectedPaths);
      if (resolvedProtectedHit) {
        return {
          block: true,
          reason: `Command resolves to protected path: ${resolvedProtectedHit.candidate} resolves to ${resolvedProtectedHit.resolved} matching ${resolvedProtectedHit.pattern}`
        };
      }

      const confirmationReasons = execDecision.mode !== "off" && execDecision.decision === "prompt"
        ? [...execDecision.reasons]
        : [];
      const externalReason = findShellExternalConfirmationReason(execDecision.segments, policy);
      if (externalReason) confirmationReasons.push(externalReason);
      if (confirmationReasons.length > 0) {
        const ok = await ctx.ui.confirm(
          `Command requires confirmation.\n\n${confirmationReasons.join("\n")}\n\nAllow?`,
          "Company exec policy confirmation"
        );
        if (!ok) return { block: true, reason: `User denied command: ${confirmationReasons.join("; ")}` };
      }
    }

    const proxyShellDecision = evaluateMcpProxyShellProtectedAccess(
      ctx.cwd,
      preparedInput,
      pathPolicy.shellProtectedPaths
    );
    if (proxyShellDecision.block) {
      return { block: true, reason: proxyShellDecision.reason };
    }

    const policyToolIdentity = preparedInput.proxyToolName ?? event.toolName;
    const usesKnownExternalProvider = externalActionPolicyConfig(policy).providerKeywords
      .some((provider) => actionTextMatchesAny(policyToolIdentity, [provider]));
    const pathDecision = evaluatePathLikeToolAccess(
      ctx.cwd,
      preparedInput.proxyToolName ?? event.toolName,
      preparedInput.input,
      pathPolicy.writeProtectedPaths,
      pathPolicy.readProtectedPaths,
      pathPolicy.readOnlyPaths,
      permissionProfile.mode === "trusted-full-access" ? undefined : capabilityState.filesystemRead,
      permissionProfile.mode === "trusted-full-access" ? undefined : capabilityState.filesystemWrite,
      {
        forceScopeAware: Boolean(preparedInput.proxyToolName),
        forceWrite: preparedInput.proxyAction?.decision === "confirm",
        allowAmbiguousFilesystemContentFields: !usesKnownExternalProvider && !isCompanyTool(event.toolName)
      }
    );
    if (pathDecision.block) {
      return { block: true, reason: pathDecision.reason };
    }

    if (!SHELL_TOOL_NAMES.has(event.toolName)) {
      const classifiedExternalAction = classifyExternalAction(event.toolName, preparedInput.input, policy);
      const externalAction = preparedInput.proxyShellCarrier && classifiedExternalAction.decision !== "confirm"
        ? {
            decision: "confirm" as const,
            provider: typeof toolInput.server === "string" && toolInput.server.trim() ? toolInput.server.trim() : "mcp-proxy",
            action: "shell-command",
            evidence: classifiedExternalAction.evidence
          }
        : classifiedExternalAction;
      if (externalAction.decision === "confirm") {
        const inputSummary = preparedInput.confirmationSummary
          ? `\ninput: ${preparedInput.confirmationSummary}`
          : "";
        const ok = await ctx.ui.confirm(
          `External provider action requires confirmation.\n\nprovider: ${externalAction.provider}\naction: ${externalAction.action}\ntool: ${event.toolName}${inputSummary}\n\nAllow?`,
          "Company external action confirmation"
        );
        if (!ok) {
          return { block: true, reason: `User denied external provider action: ${event.toolName}` };
        }
      }
    }

    if (runtime.contextBudget !== "off" && ["write", "edit"].includes(event.toolName)) {
      const relativePath = extractLikelyPathFromInput(ctx.cwd, event.input as Record<string, unknown>);
      if (relativePath) {
        const budget = contextBudgetConfig(policy);
        const stats = candidateFileBudget(ctx.cwd, relativePath, budget);
        if (runtime.contextBudget === "enforce" && stats.exists && stats.overLimit) {
          return { block: true, reason: `Context budget blocked editing large file ${relativePath}: ${stats.chars} chars > ${budget.maxContextFileChars}` };
        }
      }
    }
  });

  pi.registerTool({
    name: "company_context",
    label: "Company Context",
    description: "Return the current company project profile, required context files, verify commands, and MCP capabilities.",
    promptSnippet: "Inspect the active company project profile and guard policy.",
    promptGuidelines: [
      "Use company_context before planning or editing in projects managed by Pi Company Platform."
    ],
    parameters: Type.Object({
      detail: Type.Optional(StringEnum(["concise", "full"] as const))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const detail = params.detail ?? "concise";
      const profile = loadProfileFromContext(ctx);
      const permissionProfile = resolvePermissionProfile(profile, policy, permissionOverrideFromContext(ctx));
      const pathPolicy = effectiveProtectedPaths(policy, profile);
      const requiredContext = [
        ...policy.defaultRequiredContext,
        ...(profile.requiredContext ?? [])
      ];
      const payload = {
        projectId: profile.projectId,
        displayName: profile.displayName,
        mode: profile.mode,
        projectTrusted: ctx.isProjectTrusted(),
        profile: {
          path: ".pi/company-profile.json",
          exists: fs.existsSync(projectProfilePath(ctx.cwd)),
          source: process.env.PI_COMPANY_PROFILE?.trim()
            ? "env"
            : ctx.isProjectTrusted() && fs.existsSync(projectProfilePath(ctx.cwd))
              ? "project"
              : "fallback"
        },
        projectContext: {
          path: ".pi/project-context.md",
          exists: fs.existsSync(projectContextFilePath(ctx.cwd))
        },
        protectedPaths: profile.protectedPaths ?? [],
        shellProtectedPaths: profile.shellProtectedPaths ?? profile.protectedPaths ?? [],
        readOnlyPaths: profile.readOnlyPaths ?? [],
        effectivePaths: pathPolicy,
        requiredContext: Array.from(new Set(requiredContext)),
        verifyCommands: profile.verifyCommands ?? {},
        mcpCapabilities: profile.mcpCapabilities ?? [],
        permissionProfile,
        memory: resolveMemorySettings(profile),
        runtimePolicy: resolveRuntimePolicy(profile),
        policy: {
          permissionProfiles: permissionProfilesConfig(policy),
          execPolicy: execPolicyConfig(policy),
          contextBudget: contextBudgetConfig(policy),
          toolRegistry: toolRegistryConfig(policy),
          externalActionPolicy: externalActionPolicyConfig(policy),
          finalGate: finalGateConfig(policy)
        }
      };

      const text = detail === "full"
        ? JSON.stringify(payload, null, 2)
        : [
        `project: ${payload.displayName ?? payload.projectId ?? "unknown"}`,
        `mode: ${payload.mode ?? "unknown"}`,
        `profile: ${payload.profile.path} (${payload.profile.exists ? "exists" : "missing"})`,
        `projectContext: ${payload.projectContext.path} (${payload.projectContext.exists ? "exists" : "missing"})`,
        `requiredContext: ${payload.requiredContext.join(", ") || "none"}`,
        `verifyCommands: ${Object.keys(payload.verifyCommands).join(", ") || "none"}`,
        `mcpCapabilities: ${payload.mcpCapabilities.join(", ") || "none"}`,
        `permissionProfile: ${payload.permissionProfile.mode} (${payload.permissionProfile.runtimeEquivalent})`,
        `memory: ${payload.memory.enabled ? payload.memory.mode : "off"} (${payload.memory.summaryFile})`,
        `runtimePolicy: exec=${payload.runtimePolicy.execPolicy}, context=${payload.runtimePolicy.contextBudget}, tools=${payload.runtimePolicy.toolRegistry}, final=${payload.runtimePolicy.finalGate}`
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: payload
      };
    }
  });

  pi.registerTool({
    name: "company_permission_status",
    label: "Company Permission Status",
    description: "Return the active runtime permission profile and the Company guard boundaries that still apply.",
    promptSnippet: "Use this when deciding whether the current session is read-only, workspace-write, or trusted-full-access.",
    parameters: Type.Object({
      detail: Type.Optional(StringEnum(["concise", "full"] as const))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const permissionProfile = resolvePermissionProfile(profile, policy, permissionOverrideFromContext(ctx));
      const config = permissionProfilesConfig(policy);
      const payload = {
        permissionProfile,
        allowedModes: config.allowedModes,
        profileValue: profile.permissionProfile,
        envOverrideActive: Boolean(process.env.PI_COMPANY_PERMISSION_PROFILE?.trim()),
        commandOverrideActive: Boolean(permissionOverrideFromContext(ctx)),
        boundaries: {
          protectedPaths: "enforced",
          shellProtectedPaths: "enforced",
          secretRedaction: "enforced",
          capabilityLock: "enforced when profile declares capabilityPacks",
          destructiveExternalConfirmation: "enforced"
        },
        readOnlyAllowedTools: [...READ_ONLY_TOOL_NAMES].sort()
      };
      const text = params.detail === "full"
        ? JSON.stringify(payload, null, 2)
        : [
            `permissionProfile: ${permissionProfile.mode}`,
            `source: ${permissionProfile.source}${permissionProfile.requested ? ` (${permissionProfile.requested})` : ""}`,
            `runtimeEquivalent: ${permissionProfile.runtimeEquivalent}`,
            `allowedModes: ${config.allowedModes.join(", ")}`,
            `warning: ${permissionProfile.warning ?? "none"}`,
            "boundaries: protected-paths, secret redaction, capability lock, and destructive/external confirmations remain enforced"
          ].join("\n");
      return { content: [{ type: "text", text }], details: payload };
    }
  });

	  pi.registerTool({
	    name: "company_exec_policy_check",
    label: "Company Exec Policy Check",
    description: "Evaluate a shell command against company exec policy before running it.",
    promptSnippet: "Use this before high-impact, complex, generated, or unfamiliar shell commands.",
    parameters: Type.Object({
      command: Type.String({ minLength: 1 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const result = evaluateExecPolicy(params.command, profile, policy);
      const text = [
        `decision: ${result.decision}`,
        `mode: ${result.mode}`,
        `reasons: ${result.reasons.join("; ") || "none"}`,
        "",
        "segments:",
        ...result.segments.map((segment) => `- ${segment.command}\n  words: ${segment.words.join(" ")}\n  matches: ${segment.matches.join(", ") || "none"}\n  warnings: ${segment.warnings.join(", ") || "none"}`)
      ].join("\n");
      return { content: [{ type: "text", text }], details: result };
    }
  });

  pi.registerTool({
    name: "company_context_budget",
    label: "Company Context Budget",
    description: "Check candidate context files against hard context budget limits.",
    promptSnippet: "Use this before injecting or relying on large files as context.",
    parameters: Type.Object({
      files: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const budget = contextBudgetConfig(policy);
      const results = params.files.map((file) => candidateFileBudget(ctx.cwd, file, budget));
      const overLimit = results.filter((item) => item.overLimit);
      const warnings = results.filter((item) => item.warn && !item.overLimit);
      const text = [
        `decision: ${overLimit.length ? "fail" : "pass"}`,
        `limits: maxContextFileChars=${budget.maxContextFileChars}, warnFragmentChars=${budget.warnFragmentChars}`,
        `overLimit: ${overLimit.map((item) => item.path).join(", ") || "none"}`,
        `warnings: ${warnings.map((item) => `${item.path} (${item.chars} chars)`).join(", ") || "none"}`,
        "",
        ...results.map((item) => `- ${item.path}: ${item.exists ? `${item.chars} chars` : "missing"}${item.overLimit ? " OVER_LIMIT" : item.warn ? " WARN" : ""}`)
      ].join("\n");
      return { content: [{ type: "text", text }], details: { budget, results } };
    }
  });

  pi.registerTool({
    name: "company_tool_policy_check",
    label: "Company Tool Policy Check",
    description: "Evaluate whether a tool is registered and allowed by the active project profile capabilities.",
    promptSnippet: "Use this before relying on MCP/app/tools that are not obviously in the profile.",
    parameters: Type.Object({
      toolName: Type.String({ minLength: 1 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const result = evaluateToolPolicy(params.toolName, profile, policy);
      const text = [
        `decision: ${result.decision}`,
        `mode: ${result.mode}`,
        `tool: ${params.toolName}`,
        `requiredCapabilities: ${result.requiredCapabilities.join(", ") || "none"}`,
        `availableCapabilities: ${result.availableCapabilities.join(", ") || "none"}`,
        `reason: ${result.reason}`
      ].join("\n");
      return { content: [{ type: "text", text }], details: result };
    }
  });

  pi.registerTool({
    name: "company_task_gate_check",
    label: "Company Task Gate Check",
    description: "Check whether a governed task has enough context, verify evidence, and trace before claiming done.",
    promptSnippet: "Use this before final on source-changing tasks.",
    parameters: Type.Object({
      taskId: Type.String({ minLength: 1 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = readTask(ctx.cwd, params.taskId);
      const result = evaluateTaskGate(task, policy);
      const runtime = resolveRuntimePolicy(loadProfileFromContext(ctx));
      const text = [
        `decision: ${result.decision}`,
        `mode: ${runtime.finalGate}`,
        `missing: ${result.missing.join(", ") || "none"}`,
        `warnings: ${result.warnings.join("; ") || "none"}`
      ].join("\n");
      return { content: [{ type: "text", text }], details: { ...result, task } };
    }
  });

  pi.registerTool({
    name: "company_usage_snapshot",
    label: "Company Usage Snapshot",
    description: "Return live Pi context usage, session file, model, and instructions for exact token/cost totals.",
    promptSnippet: "Use this when the user asks about token/context usage or wants to follow the current session.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const snapshot = buildUsageSnapshot(ctx, String(pi.getThinkingLevel()));
      return {
        content: [{ type: "text", text: formatUsageSnapshot(snapshot) }],
        details: snapshot
      };
    }
  });

  pi.registerTool({
    name: "company_context_preflight",
    label: "Company Context Preflight",
    description: "Check whether the current session should run a task directly, compact first, or start a fresh governed session.",
    promptSnippet: "Use this before large, high-risk, or cross-module tasks to avoid context overflow.",
    promptGuidelines: [
      "Call this before large payment/auth/data/deploy tasks, BE-to-FE mapping, or any task where the user pasted a long intake.",
      "If recommendation is fresh-session, do not continue loading context in the current session; ask for or use a fresh workflow command.",
      "Do not paste mandatory-flow boilerplate into the task request; use platform workflow commands instead."
    ],
    parameters: Type.Object({
      workflow: Type.Optional(StringEnum(["task", "scout", "be-to-fe", "review", "plan", "platform-improve"] as const)),
      inputChars: Type.Optional(Type.Number({ minimum: 0 }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const workflow = params.workflow ?? "task";
      const snapshot = buildUsageSnapshot(ctx, String(pi.getThinkingLevel()));
      const preflight = buildContextPreflight(snapshot, workflow, params.inputChars ?? 0);
      return {
        content: [{ type: "text", text: formatContextPreflight(preflight, snapshot) }],
        details: preflight
      };
    }
  });

  pi.registerTool({
    name: "company_memory_status",
    label: "Company Memory Status",
    description: "Return the project memory policy, files, and safe usage rules.",
    promptSnippet: "Inspect project memory policy before relying on remembered facts.",
    promptGuidelines: [
      "Use memory as hints, not source of truth.",
      "Verify memory against repository files before making source changes.",
      "Never store secrets or raw private data in memory."
    ],
    parameters: Type.Object({
      detail: Type.Optional(StringEnum(["concise", "full"] as const))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const settings = resolveMemorySettings(profile);
      const summaryPath = memorySummaryPath(ctx.cwd, settings);
      const handbookPath = memoryHandbookPath(ctx.cwd, settings);
      const payload = {
        enabled: settings.enabled,
        mode: settings.mode,
        scope: settings.scope,
        readBeforeTask: settings.readBeforeTask,
        writePolicy: settings.writePolicy,
        maxInjectedChars: settings.maxInjectedChars,
        files: {
          summary: { path: settings.summaryFile, exists: fs.existsSync(summaryPath) },
          handbook: { path: settings.handbookFile, exists: fs.existsSync(handbookPath) },
          localDir: { path: settings.localDir, exists: fs.existsSync(memoryLocalDir(ctx.cwd, settings)) }
        },
        externalPackages: settings.externalPackages,
        rules: [
          "Memory is advisory; repository files and current task contract are authoritative.",
          "Only write durable memory after an explicit user remember request or an approved workflow step.",
          "Do not save secrets, credentials, raw private data, or large source excerpts.",
          "Prefer compact summaries, tags, and links over long transcripts."
        ]
      };
      const text = params.detail === "full"
        ? JSON.stringify(payload, null, 2)
        : [
          `memory: ${payload.enabled ? payload.mode : "off"}`,
          `scope: ${payload.scope}`,
          `summary: ${payload.files.summary.path} (${payload.files.summary.exists ? "exists" : "missing"})`,
          `handbook: ${payload.files.handbook.path} (${payload.files.handbook.exists ? "exists" : "missing"})`,
          `writePolicy: ${payload.writePolicy}`,
          `externalPackages: ${payload.externalPackages.join(", ") || "none"}`
        ].join("\n");
      return { content: [{ type: "text", text }], details: payload };
    }
  });

  pi.registerTool({
    name: "company_memory_note",
    label: "Company Memory Note",
    description: "Append an explicit durable project memory note to .pi/memory/MEMORY.md.",
    promptSnippet: "Use only when the user explicitly asks to remember a stable fact, decision, preference, lesson, or open loop.",
    promptGuidelines: [
      "Do not call this for incidental transcript content.",
      "Keep notes compact and evidence-based.",
      "Secrets are redacted before writing, but avoid sending secrets to the tool."
    ],
    parameters: Type.Object({
      category: StringEnum(["preference", "decision", "project", "lesson", "open-loop", "reference"] as const),
      title: Type.String({ minLength: 3 }),
      content: Type.String({ minLength: 3 }),
      source: Type.Optional(Type.String())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      try {
        const result = appendMemoryNote(ctx.cwd, profile, params);
        appendTrace(ctx.cwd, { event: "memory_note", category: params.category, title: params.title, path: result.path, redacted: result.redacted });
        appendSessionTrace(pi, { event: "memory_note", category: params.category, title: params.title, path: result.path, redacted: result.redacted });
        return {
          content: [{ type: "text", text: `Memory note saved: ${result.path}${result.redacted ? " (secrets redacted)" : ""}` }],
          details: result
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Memory note failed: ${message}` }], isError: true };
      }
    }
  });

  pi.registerTool({
    name: "company_memory_search",
    label: "Company Memory Search",
    description: "Keyword-search project memory markdown files.",
    promptSnippet: "Search project memory for relevant durable facts before re-scouting the whole repo.",
    parameters: Type.Object({
      query: Type.String({ minLength: 1 }),
      limit: Type.Optional(Type.Number())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const limit = Math.max(1, Math.min(20, Math.trunc(params.limit ?? 10)));
      const matches = searchMemoryFiles(ctx.cwd, profile, params.query, limit);
      const text = matches.length
        ? matches.map((match) => `${match.path}:${match.line}: ${match.text}`).join("\n")
        : "No memory matches.";
      return { content: [{ type: "text", text }], details: { query: params.query, matches } };
    }
  });

  pi.registerTool({
    name: "company_profile_options",
    label: "Company Profile Options",
    description: "List available company project profiles and recommend one for the current repository.",
    promptSnippet: "Use this during project onboarding or when switching project task mode.",
    parameters: Type.Object({
      intent: Type.Optional(StringEnum(["general", "frontend-only", "backend-only", "be-readonly-fe", "docs"] as const))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = buildProfileOptions(extensionDir, ctx.cwd, params.intent);
      const text = [
        `recommended: ${result.recommended}`,
        `reason: ${result.reason}`,
        "",
        "| Profile | Recommended | Use when |",
        "|---|---:|---|",
        ...result.options.map((option) => `| ${option.name} | ${option.recommended ? "yes" : "no"} | ${option.description} |`)
      ].join("\n");
      return {
        content: [{ type: "text", text }],
        details: result
      };
    }
  });

  pi.registerTool({
    name: "company_profile_apply",
    label: "Company Profile Apply",
    description: "Apply a built-in company profile to the current project by writing .pi/company-profile.json.",
    promptSnippet: "Apply a selected profile during project onboarding or profile switching.",
    promptGuidelines: [
      "Only call after the user has explicitly selected a profile, or when the user explicitly asked to apply the recommended profile.",
      "Use overwrite=true for direct profile-switch commands such as `/profile <profile>`, `/profiles apply <profile>`, or explicit replace/overwrite requests.",
      "Do not use overwrite=true for exploratory show/list/status requests."
    ],
    parameters: Type.Object({
      profile: Type.String({ minLength: 1 }),
      overwrite: Type.Optional(Type.Boolean()),
      projectId: Type.Optional(Type.String()),
      displayName: Type.Optional(Type.String())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const ok = await ctx.ui.confirm(
          `Apply company profile "${params.profile}" to this project?\n\nThis writes .pi/company-profile.json and .pi/company-profile.lock.json.`,
          "Company profile apply confirmation"
        );
        if (!ok) {
          return {
            content: [{ type: "text", text: `Profile apply denied by operator: ${params.profile}` }],
            isError: true
          };
        }
        const profile = writeProfileFromAdapter(extensionDir, ctx.cwd, params.profile, params.overwrite === true, params.projectId, params.displayName);
        appendTrace(ctx.cwd, { event: "profile_apply", profile: params.profile, projectId: profile.projectId, mode: profile.mode });
        appendSessionTrace(pi, { event: "profile_apply", profile: params.profile, projectId: profile.projectId, mode: profile.mode });
        return {
          content: [{ type: "text", text: `Profile applied: .pi/company-profile.json and .pi/company-profile.lock.json (${params.profile})` }],
          details: profile
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Profile apply failed: ${message}` }],
          isError: true
        };
      }
    }
  });

  pi.registerTool({
    name: "company_project_onboarding_record",
    label: "Company Project Onboarding Record",
    description: "Persist the first-run project context snapshot after the selected model has inspected the project.",
    promptSnippet: "Record the reusable project context snapshot after initial repo onboarding.",
    promptGuidelines: [
      "Use after login/model selection and a read-only project scout.",
      "Write concise architecture/context facts only; do not include secrets, tokens, or large source excerpts.",
      "Update .pi/project-context.md when project structure, stack, commands, or domain rules materially change."
    ],
    parameters: Type.Object({
      markdown: Type.String({ minLength: 100 }),
      summary: Type.String({ minLength: 10 }),
      sourceFiles: Type.Array(Type.Object({
        path: Type.String({ minLength: 1 }),
        reason: Type.String({ minLength: 1 })
      }), { minItems: 1 }),
      model: Type.Optional(Type.String()),
      updateTriggers: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
      notes: Type.Optional(Type.String())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const snapshot: ProjectOnboardingSnapshot = {
        schemaVersion: 1,
        projectId: profile.projectId,
        profileMode: profile.mode,
        contextFile: ".pi/project-context.md",
        summary: redactText(params.summary),
        model: params.model ? redactText(params.model) : undefined,
        sourceFiles: params.sourceFiles.map((file) => ({ path: file.path, reason: redactText(file.reason) })),
        updateTriggers: redactTextArray(params.updateTriggers ?? [
          "Project structure changed",
          "Stack/framework changed",
          "Verify commands changed",
          "Domain or ownership rules changed"
        ]),
        notes: params.notes ? redactText(params.notes) : undefined,
        recordedAt: nowIso()
      };
      writeProjectOnboarding(ctx.cwd, snapshot, params.markdown);
      appendTrace(ctx.cwd, { event: "project_onboarding_record", contextFile: snapshot.contextFile, sourceFiles: params.sourceFiles });
      appendSessionTrace(pi, { event: "project_onboarding_record", contextFile: snapshot.contextFile, sourceFiles: params.sourceFiles });

      return {
        content: [{ type: "text", text: "Project onboarding snapshot recorded: .pi/project-context.md" }],
        details: snapshot
      };
    }
  });

  pi.registerTool({
    name: "company_task_start",
    label: "Company Task Start",
    description: "Create a Task Implementation Contract for the current project before editing.",
    promptSnippet: "Start a governed implementation task and persist the task contract.",
    promptGuidelines: [
      "Call this before source edits in a project managed by Pi Company Platform.",
      "Use company_context first when possible."
    ],
    parameters: Type.Object({
      taskId: Type.Optional(Type.String({ minLength: 1 })),
      summary: Type.String({ minLength: 10 }),
      riskLane: StringEnum(["tiny", "normal", "high-risk"] as const),
      expectedOutput: Type.String({ minLength: 10 }),
      acceptanceCriteria: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      scope: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
      outOfScope: Type.Optional(Type.Array(Type.String({ minLength: 1 })))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const createdAt = nowIso();
      const safeSummary = redactText(params.summary);
      const taskId = safeTaskId(redactText(params.taskId ?? params.summary));
      const task: TaskContract = {
        taskId,
        summary: safeSummary,
        riskLane: params.riskLane,
        expectedOutput: redactText(params.expectedOutput),
        acceptanceCriteria: redactTextArray(params.acceptanceCriteria),
        scope: redactTextArray(params.scope),
        outOfScope: redactTextArray(params.outOfScope),
        protectedPaths: profile.protectedPaths ?? [],
        requiredContext: profile.requiredContext ?? [],
        contextManifest: [],
        memoryCitations: [],
        mcpCapabilities: profile.mcpCapabilities ?? [],
        verifyCommands: flattenVerifyCommands(profile),
        changedFiles: [],
        verifyEvidence: [],
        trace: { outcome: "pending" },
        createdAt,
        updatedAt: createdAt
      };
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, { taskId, event: "task_start", summary: task.summary, riskLane: params.riskLane });
      appendSessionTrace(pi, { taskId, event: "task_start", summary: task.summary, riskLane: params.riskLane });

      return {
        content: [{ type: "text", text: `Task contract created: .pi/company-state/tasks/${taskId}.json` }],
        details: task
      };
    }
  });

  pi.registerTool({
    name: "company_source_checkout",
    label: "Company Source Checkout",
    description: "Cache and refresh an external Git repository for targeted local inspection.",
    promptSnippet: "Use this before reading a user-provided external source repository.",
    promptGuidelines: [
      "Use for GitHub/GitLab/Bitbucket source repositories supplied by the user.",
      "Read targeted files from the returned checkout path; do not edit the shared cache."
    ],
    parameters: Type.Object({
      repoRef: Type.String({ minLength: 3, description: "owner/repo, host/owner/repo, https URL, or git@host:owner/repo.git" }),
      forceUpdate: Type.Optional(Type.Boolean({ description: "Fetch immediately even if the cache was refreshed recently." }))
    }),
    async execute(_toolCallId, params) {
      try {
        const repo = checkoutReferenceRepo(params.repoRef, params.forceUpdate === true);
        const text = [
          "Source cache ready:",
          `path: ${repo.checkoutPath}`,
          `url: ${repo.cloneUrl}`,
          `commit: ${repo.commit ?? "unknown"}`,
          `fetched: ${repo.fetched ? "yes" : "no"}`
        ].join("\n");
        return {
          content: [{ type: "text", text }],
          details: repo
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Source checkout failed: ${message}` }],
          isError: true
        };
      }
    }
  });

  pi.registerTool({
    name: "company_context_record",
    label: "Company Context Record",
    description: "Record context files read for a governed task.",
    promptSnippet: "Record required context files that were read for the task.",
    parameters: Type.Object({
      taskId: Type.String({ minLength: 1 }),
      files: Type.Array(Type.Object({
        path: Type.String({ minLength: 1 }),
        reason: Type.String({ minLength: 1 })
      }), { minItems: 1 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const runtime = resolveRuntimePolicy(profile);
      const budget = contextBudgetConfig(policy);
      const task = readTask(ctx.cwd, params.taskId);
      if (!task) {
        return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], isError: true };
      }
      if (runtime.contextBudget !== "off" && task.contextManifest.length + params.files.length > budget.maxManifestFiles) {
        return {
          content: [{ type: "text", text: `Context manifest budget exceeded: ${task.contextManifest.length + params.files.length} files > ${budget.maxManifestFiles}` }],
          isError: true
        };
      }
      const fileBudget = params.files.map((file) => candidateFileBudget(ctx.cwd, file.path, budget));
      const overLimit = fileBudget.filter((item) => item.overLimit);
      if (runtime.contextBudget === "enforce" && overLimit.length > 0) {
        return {
          content: [{ type: "text", text: `Context file budget exceeded: ${overLimit.map((item) => `${item.path}=${item.chars}`).join(", ")}` }],
          details: { budget, fileBudget },
          isError: true
        };
      }

      const safeFiles = params.files.map((file) => ({
        path: file.path,
        reason: redactText(file.reason)
      }));
      const seen = new Set(task.contextManifest.map((item) => `${item.path}\u0000${item.reason}`));
      for (const file of safeFiles) {
        const key = `${file.path}\u0000${file.reason}`;
        if (!seen.has(key)) task.contextManifest.push(file);
      }
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, { taskId: task.taskId, event: "context_record", files: safeFiles });
      appendSessionTrace(pi, { taskId: task.taskId, event: "context_record", files: safeFiles });

      return {
        content: [{ type: "text", text: `Context recorded for ${task.taskId}: ${params.files.length} file(s)` }],
        details: task
      };
    }
  });

  pi.registerTool({
    name: "company_verify_record",
    label: "Company Verify Record",
    description: "Record verification command evidence for a governed task.",
    promptSnippet: "Record actual verify command result before final.",
    parameters: Type.Object({
      taskId: Type.String({ minLength: 1 }),
      command: Type.String({ minLength: 1 }),
      exitCode: Type.Number(),
      summary: Type.String({ minLength: 1 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = readTask(ctx.cwd, params.taskId);
      if (!task) {
        return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], isError: true };
      }

      const observedEntries = [
        ...readObservedBashResults(observedBashLedgerPath(ctx.cwd), { maxEntries: 10000 }),
        ...bashResults.list()
      ];
      const observed = findMatchingObservedBashResult(observedEntries, {
        cwd: ctx.cwd,
        command: params.command,
        notBefore: task.createdAt,
        exitCode: params.exitCode
      });
      if (!observed.ok) {
        return {
          content: [{ type: "text", text: `Verify evidence rejected: ${observed.reason}` }],
          details: redactForStorage(observed),
          isError: true
        };
      }

      const safeCommand = redactText(params.command);
      const safeSummary = redactText(params.summary);
      const matchedProfileCommand = commandMatchesVerifyPlan(params.command, task.verifyCommands);
      task.verifyEvidence.push({
        command: safeCommand,
        exitCode: params.exitCode,
        summary: safeSummary,
        recordedAt: nowIso(),
        observed: true,
        observedAt: observed.entry.recordedAt,
        isError: observed.entry.isError,
        matchedProfileCommand
      });
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, { taskId: task.taskId, event: "verify_record", command: safeCommand, exitCode: params.exitCode, observedAt: observed.entry.recordedAt, matchedProfileCommand });
      appendSessionTrace(pi, { taskId: task.taskId, event: "verify_record", command: safeCommand, exitCode: params.exitCode, observedAt: observed.entry.recordedAt, matchedProfileCommand });

      const advisorySuffix = matchedProfileCommand ? "" : " Advisory only: command does not exactly match task verifyCommands and will not satisfy the passing final gate.";
      return {
        content: [{ type: "text", text: `Verify evidence recorded for ${task.taskId}: observed exit ${params.exitCode}.${advisorySuffix}` }],
        details: { task, observation: redactForStorage(observed.entry), matchedProfileCommand }
      };
    }
  });

  pi.registerTool({
    name: "company_memory_citation_record",
    label: "Company Memory Citation Record",
    description: "Record memory files used as advisory context for a governed task.",
    promptSnippet: "Record memory citations when project memory materially influenced planning or implementation.",
    parameters: Type.Object({
      taskId: Type.String({ minLength: 1 }),
      files: Type.Array(Type.Object({
        path: Type.String({ minLength: 1 }),
        reason: Type.String({ minLength: 1 })
      }), { minItems: 1 })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = readTask(ctx.cwd, params.taskId);
      if (!task) {
        return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], isError: true };
      }

      const safeFiles = params.files.map((file) => ({
        path: file.path,
        reason: redactText(file.reason)
      }));
      const seen = new Set(task.memoryCitations.map((item) => `${item.path}\u0000${item.reason}`));
      for (const file of safeFiles) {
        const key = `${file.path}\u0000${file.reason}`;
        if (!seen.has(key)) task.memoryCitations.push(file);
      }
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, { taskId: task.taskId, event: "memory_citation_record", files: safeFiles });
      appendSessionTrace(pi, { taskId: task.taskId, event: "memory_citation_record", files: safeFiles });

      return {
        content: [{ type: "text", text: `Memory citations recorded for ${task.taskId}: ${params.files.length} file(s)` }],
        details: task
      };
    }
  });

  pi.registerTool({
    name: "company_trace_record",
    label: "Company Trace Record",
    description: "Record final task trace and handoff evidence.",
    promptSnippet: "Record final trace before claiming task completion.",
    parameters: Type.Object({
      taskId: Type.String({ minLength: 1 }),
      outcome: StringEnum(["completed", "blocked", "partial", "failed"] as const),
      changedFiles: Type.Optional(Type.Array(Type.String())),
      friction: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const profile = loadProfileFromContext(ctx);
      const runtime = resolveRuntimePolicy(profile);
      const task = readTask(ctx.cwd, params.taskId);
      if (!task) {
        return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], isError: true };
      }

      const nextTask: TaskContract = {
        ...task,
        changedFiles: params.changedFiles ?? task.changedFiles,
        trace: {
          outcome: params.outcome,
          friction: params.friction ? redactText(params.friction) : undefined,
          notes: params.notes ? redactText(params.notes) : undefined,
          recordedAt: nowIso()
        }
      };
      const gate = evaluateTaskGate(nextTask, policy);
      if (params.outcome === "completed" && runtime.finalGate === "enforce" && gate.decision === "fail") {
        return {
          content: [{ type: "text", text: `Final gate blocked completion: missing ${gate.missing.join(", ")}` }],
          details: { gate, task: nextTask },
          isError: true
        };
      }

      writeTask(ctx.cwd, nextTask);
      appendTrace(ctx.cwd, {
        taskId: nextTask.taskId,
        event: "trace_record",
        outcome: params.outcome,
        changedFiles: nextTask.changedFiles,
        friction: nextTask.trace.friction,
        notes: nextTask.trace.notes
      });
      appendSessionTrace(pi, {
        taskId: nextTask.taskId,
        event: "trace_record",
        outcome: params.outcome,
        changedFiles: nextTask.changedFiles,
        friction: nextTask.trace.friction,
        notes: nextTask.trace.notes
      });

      return {
        content: [{ type: "text", text: `Trace recorded for ${nextTask.taskId}: ${params.outcome}${gate.decision === "fail" ? ` (gate warning: missing ${gate.missing.join(", ")})` : ""}` }],
        details: { task: nextTask, gate }
      };
    }
  });

  function permissionStatusText(permissionProfile: ResolvedPermissionProfile, config: Required<PermissionProfilesConfig>): string {
    return [
      `permissionProfile: ${permissionProfile.mode}`,
      `source: ${permissionProfile.source}${permissionProfile.requested ? ` (${permissionProfile.requested})` : ""}`,
      `runtimeEquivalent: ${permissionProfile.runtimeEquivalent}`,
      `allowedModes: ${config.allowedModes.join(", ")}`,
      `warning: ${permissionProfile.warning ?? "none"}`,
      "boundaries: protected-paths, secret redaction, capability lock, and destructive/external confirmations remain enforced"
    ].join("\n");
  }

  function emitPermissionStatus(ctx: ExtensionContext, permissionProfile: ResolvedPermissionProfile): void {
    const config = permissionProfilesConfig(policy);
    pi.sendMessage(
      {
        customType: "company-permission-profile",
        content: permissionStatusText(permissionProfile, config),
        display: true,
        details: {
          permissionProfile,
          allowedModes: config.allowedModes,
          envOverrideActive: Boolean(process.env.PI_COMPANY_PERMISSION_PROFILE?.trim()),
          commandOverrideActive: Boolean(permissionOverrideFromContext(ctx)),
          boundaries: {
            protectedPaths: "enforced",
            shellProtectedPaths: "enforced",
            secretRedaction: "enforced",
            capabilityLock: "enforced when profile declares capabilityPacks",
            destructiveExternalConfirmation: "enforced"
          }
        }
      },
      { triggerTurn: false }
    );
  }

  function registerPermissionProfileCommand(
    name: string,
    mode: PermissionProfileMode,
    description: string
  ): void {
    pi.registerCommand(name, {
      description,
      handler: async (args, ctx) => {
        const request = String(args ?? "").trim();
        setPermissionOverrideForContext(ctx, mode);
        const profile = loadProfileFromContext(ctx);
        const permissionProfile = resolvePermissionProfile(profile, policy, permissionOverrideFromContext(ctx));
        const isActive = permissionProfile.mode === mode && !permissionProfile.warning;
        const level = !isActive || mode === "trusted-full-access" ? "warning" : "info";
        const message = isActive
          ? `Company permission profile set to ${mode} for this session.`
          : `Requested ${mode}, but active profile is ${permissionProfile.mode}.`;
        ctx.ui.notify(message, level);
        if (permissionProfile.warning) ctx.ui.notify(permissionProfile.warning, "warning");
        if (permissionProfile.mode === "trusted-full-access") {
          ctx.ui.notify("Trusted full access is active; protected paths, secret redaction, and destructive/external confirmations remain enforced.", "warning");
        }
        emitPermissionStatus(ctx, permissionProfile);
        if (request) {
          pi.sendUserMessage(request, { deliverAs: "followUp" });
        }
      }
    });
  }

  pi.registerCommand("permission-status", {
    description: "Show the active runtime permission profile and guard boundaries",
    handler: async (_args, ctx) => {
      const profile = loadProfileFromContext(ctx);
      const permissionProfile = resolvePermissionProfile(profile, policy, permissionOverrideFromContext(ctx));
      ctx.ui.notify(`Company permission profile: ${permissionProfile.mode}`, permissionProfile.mode === "trusted-full-access" ? "warning" : "info");
      emitPermissionStatus(ctx, permissionProfile);
    }
  });

  registerPermissionProfileCommand("read-only", "read-only", "Switch this session to read-only permission profile");
  registerPermissionProfileCommand("workspace-write", "workspace-write", "Switch this session to workspace-write permission profile");
  registerPermissionProfileCommand("full-access", "trusted-full-access", "Switch this session to trusted full-access permission profile");
  registerPermissionProfileCommand("trusted-full-access", "trusted-full-access", "Alias for /full-access");

  function emitProfileStatus(ctx: ExtensionContext, detail = "concise"): void {
    const profile = loadProfileFromContext(ctx);
    const options = buildProfileOptions(extensionDir, ctx.cwd);
    const projectContextExists = fs.existsSync(projectContextFilePath(ctx.cwd));
    const profileExists = fs.existsSync(projectProfilePath(ctx.cwd));
    const profileNames = options.options.map((option) => option.name);
    const content = detail === "list"
      ? [
          `current: ${profile.mode ?? profile.projectId ?? "unprofiled"}`,
          `recommended: ${options.recommended}`,
          `profiles: ${profileNames.join(", ")}`,
          "apply: /profile <profile> or /profiles apply <profile>",
          "auto: /profile auto"
        ].join("\n")
      : [
          `profile: ${profile.mode ?? profile.projectId ?? "unprofiled"}`,
          `recommended: ${options.recommended}`,
          `profileFile: ${profileExists ? "exists" : "missing"}`,
          `projectContext: ${projectContextExists ? "exists" : "missing"}`,
          "usage: /profile <profile> | /profile auto | /profile list"
        ].join("\n");
    pi.sendMessage(
      {
        customType: "company-profile-status",
        content,
        display: true,
        details: {
          current: {
            projectId: profile.projectId,
            displayName: profile.displayName,
            mode: profile.mode,
            permissionProfile: profile.permissionProfile
          },
          recommended: options.recommended,
          reason: options.reason,
          profiles: profileNames,
          profileFile: profileExists,
          projectContext: projectContextExists
        }
      },
      { triggerTurn: false }
    );
  }

  function registerProfileCommand(name: string): void {
    pi.registerCommand(name, {
      description: "Show or apply the current project profile without a model follow-up",
      handler: async (args, ctx) => {
        const raw = String(args ?? "").trim();
        const tokens = raw.split(/\s+/).filter(Boolean);
        const normalized = tokens.map((token) => token.toLowerCase());
        if (!tokens.length || ["show", "status", "current"].includes(normalized[0])) {
          emitProfileStatus(ctx);
          return;
        }
        if (["list", "options", "help"].includes(normalized[0])) {
          emitProfileStatus(ctx, "list");
          return;
        }

        const cleaned = tokens.filter((token) => !/^--?(overwrite|replace|force)$/.test(token.toLowerCase()));
        let profileName = cleaned[0];
        let intent: string | undefined;
        if (["apply", "use", "switch", "set", "to"].includes(profileName?.toLowerCase() ?? "")) {
          profileName = cleaned[1];
        } else if (profileName?.toLowerCase() === "intent") {
          intent = cleaned[1];
          profileName = buildProfileOptions(extensionDir, ctx.cwd, intent).recommended;
        } else if (["auto", "recommended", "recommend"].includes(profileName?.toLowerCase() ?? "")) {
          profileName = buildProfileOptions(extensionDir, ctx.cwd).recommended;
        }

        if (!profileName) {
          ctx.ui.notify("Usage: /profile <profile> or /profile auto", "warning");
          emitProfileStatus(ctx, "list");
          return;
        }
        profileName = normalizeProjectProfileName(profileName);

        const currentProfile = loadProfileFromContext(ctx);
        try {
          const applied = writeProfileFromAdapter(
            extensionDir,
            ctx.cwd,
            profileName,
            true,
            currentProfile.projectId,
            currentProfile.displayName
          );
          appendTrace(ctx.cwd, { event: "profile_apply_command", command: name, profile: profileName, projectId: applied.projectId, mode: applied.mode, intent });
          appendSessionTrace(pi, { event: "profile_apply_command", command: name, profile: profileName, projectId: applied.projectId, mode: applied.mode, intent });
          const projectContextExists = fs.existsSync(projectContextFilePath(ctx.cwd));
          ctx.ui.notify(`Profile applied: ${applied.mode ?? profileName}`, "info");
          pi.sendMessage(
            {
              customType: "company-profile-applied",
              content: [
                `profile: ${applied.mode ?? profileName}`,
                "updated: .pi/company-profile.json",
                "updated: .pi/company-profile.lock.json",
                `projectContext: ${projectContextExists ? "exists" : "missing"}${projectContextExists ? "" : " — run /onboard-project"}`
              ].join("\n"),
              display: true,
              details: {
                profile: applied,
                profileFile: ".pi/company-profile.json",
                lockFile: ".pi/company-profile.lock.json",
                projectContext: projectContextExists
              }
            },
            { triggerTurn: false }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Profile apply failed: ${message}`, "warning");
          emitProfileStatus(ctx, "list");
        }
      }
    });
  }

  registerProfileCommand("profile");
  registerProfileCommand("profiles");

  pi.registerCommand("company-status", {
    description: "Show company Pi profile and guard state",
    handler: async (_args, ctx) => {
      const profile = loadProfileFromContext(ctx);
      const permissionProfile = resolvePermissionProfile(profile, policy, permissionOverrideFromContext(ctx));
      const requiredContext = [
        ...policy.defaultRequiredContext,
        ...(profile.requiredContext ?? [])
      ];
      const content = [
        `project: ${profile.displayName ?? profile.projectId ?? "unprofiled"}`,
        `mode: ${profile.mode ?? "unknown"}`,
        `permission: ${permissionProfile.mode}`,
        `requiredContext: ${Array.from(new Set(requiredContext)).join(", ") || "none"}`,
        `verifyGroups: ${Object.keys(profile.verifyCommands ?? {}).join(", ") || "none"}`
      ].join("\n");
      ctx.ui.notify(`Project profile: ${profile.displayName ?? profile.projectId ?? "unprofiled"}`, "info");
      pi.sendMessage(
        {
          customType: "company-status",
          content,
          display: true,
          details: {
            projectId: profile.projectId,
            displayName: profile.displayName,
            mode: profile.mode,
            permissionProfile,
            requiredContext: Array.from(new Set(requiredContext)),
            verifyCommands: Object.keys(profile.verifyCommands ?? {})
          }
        },
        { triggerTurn: false }
      );
    }
  });

  pi.registerCommand("company-memory", {
    description: "Show project memory policy and available memory files",
    handler: async (_args, ctx) => {
      const profile = loadProfileFromContext(ctx);
      const settings = resolveMemorySettings(profile);
      ctx.ui.notify(`Project memory: ${settings.enabled ? settings.mode : "off"}`, "info");
      pi.sendMessage(
        {
          customType: "company-memory-status",
          content: [
            `memory: ${settings.enabled ? settings.mode : "off"}`,
            `scope: ${settings.scope}`,
            `summary: ${settings.summaryFile}`,
            `handbook: ${settings.handbookFile}`,
            `writePolicy: ${settings.writePolicy}`
          ].join("\n"),
          display: true,
          details: settings
        },
        { triggerTurn: false }
      );
    }
  });

  pi.registerCommand("company-usage", {
    description: "Show live context usage, session file, and token/cost follow-up commands",
    handler: async (_args, ctx) => {
      const snapshot = buildUsageSnapshot(ctx, String(pi.getThinkingLevel()));
      const context = snapshot.contextUsage
        ? `${formatCount(snapshot.contextUsage.tokens)} / ${formatCount(snapshot.contextUsage.contextWindow)} (${formatPercent(snapshot.contextUsage.percent)})`
        : "context unavailable";
      ctx.ui.notify(`Company usage: ${context}`, "info");
      pi.sendMessage(
        {
          customType: "company-usage-snapshot",
          content: formatUsageSnapshot(snapshot),
          display: true,
          details: snapshot
        },
        { triggerTurn: false }
      );
    }
  });

  pi.registerCommand("task-preflight", {
    description: "Check context health before a large task; optionally compact",
    handler: async (args, ctx) => {
      const raw = String(args ?? "").trim();
      const workflow = raw.match(/\b(?:scout|be-to-fe|review|plan|platform-improve|task)\b/i)?.[0]?.toLowerCase() ?? "task";
      const snapshot = buildUsageSnapshot(ctx, String(pi.getThinkingLevel()));
      const preflight = buildContextPreflight(snapshot, workflow, raw.length);
      const context = snapshot.contextUsage
        ? `${formatCount(snapshot.contextUsage.tokens)} / ${formatCount(snapshot.contextUsage.contextWindow)} (${formatPercent(snapshot.contextUsage.percent)})`
        : "context unavailable";
      ctx.ui.notify(`Task preflight: ${preflight.recommendation}; ${context}`, preflight.recommendation === "ok" ? "info" : "warning");

      if (/\bcompact\b/i.test(raw)) {
        ctx.compact({
          customInstructions: [
            "Preserve current task decisions, project constraints, changed files, verify commands, open blockers, and next action.",
            "Drop repeated mandatory-flow boilerplate and stale exploration details.",
            "After compaction, required project context must be re-read from current repository files before implementation."
          ].join("\n")
        });
      }

      pi.sendMessage(
        {
          customType: "company-task-preflight",
          content: formatContextPreflight(preflight, snapshot),
          display: true,
          details: preflight
        },
        { triggerTurn: false }
      );
    }
  });

  async function startFreshWorkflow(workflow: "task" | "scout" | "be-to-fe", args: string, ctx: any) {
    const request = String(args ?? "").trim();
    if (!request) {
      ctx.ui.notify(`Usage: /fresh-${workflow} <request>`, "warning");
      return;
    }

    const label = shortTaskLabel(request);
    const command = `/${workflow} ${request}`;
    const result = await ctx.newSession({
      withSession: async (nextCtx) => {
        pi.setSessionName(`pi:${workflow}:${label}`);
        await nextCtx.sendUserMessage(command);
      }
    });
    if (result.cancelled) {
      ctx.ui.notify(`Fresh ${workflow} session cancelled`, "warning");
    }
  }

  pi.registerCommand("fresh-task", {
    description: "Start a fresh governed session and run /task with the request",
    handler: async (args, ctx) => {
      await startFreshWorkflow("task", String(args ?? ""), ctx);
    }
  });

  pi.registerCommand("fresh-scout", {
    description: "Start a fresh governed session and run /scout read-only with the request",
    handler: async (args, ctx) => {
      await startFreshWorkflow("scout", String(args ?? ""), ctx);
    }
  });

  pi.registerCommand("fresh-be-to-fe", {
    description: "Start a fresh governed session and run /be-to-fe with the request",
    handler: async (args, ctx) => {
      await startFreshWorkflow("be-to-fe", String(args ?? ""), ctx);
    }
  });
}
