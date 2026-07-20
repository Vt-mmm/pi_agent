import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import {
  evaluateExecPolicyCore,
  findProtectedPathInCommand,
  globMatchesPath,
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

type ProjectProfile = {
  schemaVersion?: number;
  projectId?: string;
  displayName?: string;
  mode?: string;
  protectedPaths?: string[];
  shellProtectedPaths?: string[];
  requiredContext?: string[];
  verifyCommands?: Record<string, string[]>;
  mcpCapabilities?: string[];
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
  execPolicy?: ExecPolicyConfig;
  contextBudget?: ContextBudgetConfig;
  toolRegistry?: ToolRegistryConfig;
  finalGate?: FinalGateConfig;
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

type FinalGateConfig = {
  defaultMode?: "advisory" | "enforce";
  requireTaskContract?: boolean;
  requireContextManifest?: boolean;
  requireVerifyEvidence?: boolean;
  requireTrace?: boolean;
  requirePassingVerify?: boolean;
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

const DEFAULT_POLICY: BasePolicy = {
  protectedPaths: [".git/**", "**/auth.json", "**/.env", "**/.env.*"],
  shellProtectedPaths: [".git/**", "**/auth.json", "**/.env", "**/.env.*"],
  blockedCommandPatterns: ["rm -rf /", "rm -rf ~", "rm -rf $HOME", "git reset --hard", "git clean -fd"],
  requireConfirmationPatterns: ["deploy", "release", "publish", "migration", "gh pr merge", "git push"],
  defaultRequiredContext: ["AGENTS.md", "README.md"],
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
    rules: []
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
  "summary",
  "text"
]);

function isContentInputField(field: string | undefined): boolean {
  return field !== undefined && CONTENT_INPUT_FIELDS.has(field.toLowerCase().replace(/[-_]/g, ""));
}

const MAX_TOOL_INPUT_INSPECTION_DEPTH = 32;

type StringInputWalkResult = {
  items: Array<{ field: string; value: string }>;
  maxDepthExceeded?: string;
};

function walkStringInputs(value: unknown, keyPath: string[] = [], depth = 0): StringInputWalkResult {
  if (depth > MAX_TOOL_INPUT_INSPECTION_DEPTH) {
    return { items: [], maxDepthExceeded: keyPath.join(".") || "(input)" };
  }

  if (typeof value === "string") {
    const field = keyPath.at(-1);
    if (isContentInputField(field)) return { items: [] };
    return { items: [{ field: keyPath.join(".") || "(input)", value }] };
  }

  if (Array.isArray(value)) {
    const result: StringInputWalkResult = { items: [] };
    for (const item of value) {
      const child = walkStringInputs(item, keyPath, depth + 1);
      result.items.push(...child.items);
      if (child.maxDepthExceeded) result.maxDepthExceeded ??= child.maxDepthExceeded;
    }
    return result;
  }

  if (!value || typeof value !== "object") return { items: [] };

  const result: StringInputWalkResult = { items: [] };
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childResult = walkStringInputs(child, [...keyPath, key], depth + 1);
    result.items.push(...childResult.items);
    if (childResult.maxDepthExceeded) result.maxDepthExceeded ??= childResult.maxDepthExceeded;
  }
  return result;
}

function inspectPathInputsFromInput(cwd: string, input: Record<string, unknown>): {
  paths: Array<{ field: string; path: string }>;
  maxDepthExceeded?: string;
} {
  const paths: Array<{ field: string; path: string }> = [];
  const seen = new Set<string>();
  const walked = walkStringInputs(input);
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

function expandSimpleGlobAlternatives(pattern: string, max = 24): string[] {
  let results = [pattern];
  let changed = true;

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
      const options = match[1].split(",").map((option) => option.trim()).filter(Boolean);
      for (const option of options) {
        expanded.push(`${item.slice(0, match.index)}${option}${item.slice((match.index ?? 0) + match[0].length)}`);
        if (expanded.length >= max) break;
      }
      if (expanded.length >= max) break;
    }
    results = expanded.slice(0, max);
  }

  return results;
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

    for (const candidateGlob of expandSimpleGlobAlternatives(trimmed)) {
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

function evaluatePathLikeToolAccess(
  cwd: string,
  toolName: string,
  input: Record<string, unknown>,
  protectedPaths: string[],
  shellProtectedPaths: string[]
): { block: boolean; reason?: string } {
  const inspection = inspectPathInputsFromInput(cwd, input);
  if (inspection.maxDepthExceeded) {
    return {
      block: true,
      reason: `Blocked ${toolName}: tool input nesting exceeds inspection depth at ${inspection.maxDepthExceeded}`
    };
  }

  for (const item of inspection.paths) {
    const shellMatched = matchesAnyPath(item.path, shellProtectedPaths);
    if (shellMatched) {
      return {
        block: true,
        reason: `Blocked ${toolName} access to protected path from ${item.field}: ${item.path} matches ${shellMatched}`
      };
    }

    if (["write", "edit"].includes(toolName)) {
      const writeMatched = matchesAnyPath(item.path, protectedPaths);
      if (writeMatched) {
        return {
          block: true,
          reason: `Blocked ${toolName} write to protected path from ${item.field}: ${item.path} matches ${writeMatched}`
        };
      }
    }
  }

  if (toolName === "grep") {
    const hit = globTargetsProtectedPath(input.glob, shellProtectedPaths);
    if (hit) {
      return {
        block: true,
        reason: `Blocked grep glob targeting protected path: ${hit.glob} can match ${hit.example} via ${hit.pattern}`
      };
    }
  }

  if (toolName === "find") {
    const hit = globTargetsProtectedPath(input.pattern, shellProtectedPaths);
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
      if (linePath && matchesAnyPath(linePath, protectedPatterns)) {
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
      if (candidates.some((candidate) => matchesAnyPath(candidate, protectedPatterns))) {
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
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(personalized, null, 2)}\n`);
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
  const extensionDir = path.dirname(new URL(import.meta.url).pathname);
  const policy = loadPolicy(extensionDir);
  const bashResults = createBashResultLedger({ maxEntries: 300 });

  pi.on("session_start", async (_event, ctx) => {
    const profile = loadProfileFromContext(ctx);
    const name = profile.displayName || profile.projectId || path.basename(ctx.cwd);
    pi.setSessionName(`pi:${name}`);
    const profileHint = fs.existsSync(projectProfilePath(ctx.cwd)) ? "" : " (run /onboard-project to select a profile)";
    ctx.ui.notify(`Company Pi guard loaded: ${name}${profileHint}`, "info");
  });

  pi.on("tool_result", async (event, ctx) => {
    const profile = loadProfileFromContext(ctx);
    const shellProtectedPaths = [
      ...(policy.shellProtectedPaths ?? policy.protectedPaths),
      ...((profile.shellProtectedPaths ?? profile.protectedPaths) ?? [])
    ];

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

    if (event.toolName === "grep") {
      const filtered = filterGrepProtectedContent(event.content, shellProtectedPaths);
      if (filtered.changed) {
        const details = event.details && typeof event.details === "object"
          ? { ...event.details, protectedMatchesRedacted: filtered.redactedLines }
          : { protectedMatchesRedacted: filtered.redactedLines };
        return { content: filtered.content, details };
      }
    }

    if (event.toolName === "find" || event.toolName === "ls") {
      const input = event.input && typeof event.input === "object"
        ? event.input as Record<string, unknown>
        : {};
      const basePath = extractLikelyPathFromInput(ctx.cwd, input) || ".";
      const filtered = filterProtectedPathListContent(ctx.cwd, event.content, shellProtectedPaths, basePath, event.toolName);
      if (filtered.changed) {
        const details = event.details && typeof event.details === "object"
          ? { ...event.details, protectedPathsRedacted: filtered.redactedLines }
          : { protectedPathsRedacted: filtered.redactedLines };
        return { content: filtered.content, details };
      }
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    const profile = loadProfileFromContext(ctx);
    const runtime = resolveRuntimePolicy(profile);
    const protectedPaths = [
      ...policy.protectedPaths,
      ...(profile.protectedPaths ?? [])
    ];
    const shellProtectedPaths = [
      ...(policy.shellProtectedPaths ?? policy.protectedPaths),
      ...((profile.shellProtectedPaths ?? profile.protectedPaths) ?? [])
    ];
    const toolDecision = evaluateToolPolicy(event.toolName, profile, policy);
    if (toolDecision.decision === "block") {
      return { block: true, reason: `Tool registry blocked ${event.toolName}: ${toolDecision.reason}` };
    }
    const toolInput = event.input && typeof event.input === "object"
      ? event.input as Record<string, unknown>
      : {};

    if (isToolCallEventType("bash", event)) {
      const command = String(event.input.command ?? "");
      const execDecision = evaluateExecPolicy(command, profile, policy);
      if (execDecision.mode !== "off" && execDecision.decision === "forbid") {
        return { block: true, reason: execDecision.reasons.join("; ") };
      }

      const protectedHit = findProtectedPathInCommand(command, shellProtectedPaths);
      if (protectedHit) {
        return { block: true, reason: `Command touches protected path: ${protectedHit.candidate} matches ${protectedHit.pattern}` };
      }

      if (execDecision.mode !== "off" && execDecision.decision === "prompt") {
        const ok = await ctx.ui.confirm(
          `Command requires confirmation.\n\n${execDecision.reasons.join("\n")}\n\nAllow?`,
          "Company exec policy confirmation"
        );
        if (!ok) return { block: true, reason: `User denied command: ${execDecision.reasons.join("; ")}` };
      }
    }

    const pathDecision = evaluatePathLikeToolAccess(
      ctx.cwd,
      event.toolName,
      toolInput,
      protectedPaths,
      shellProtectedPaths
    );
    if (pathDecision.block) {
      return { block: true, reason: pathDecision.reason };
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
          source: fs.existsSync(projectProfilePath(ctx.cwd)) ? "project" : "fallback"
        },
        projectContext: {
          path: ".pi/project-context.md",
          exists: fs.existsSync(projectContextFilePath(ctx.cwd))
        },
        protectedPaths: profile.protectedPaths ?? [],
        shellProtectedPaths: profile.shellProtectedPaths ?? profile.protectedPaths ?? [],
        requiredContext: Array.from(new Set(requiredContext)),
        verifyCommands: profile.verifyCommands ?? {},
        mcpCapabilities: profile.mcpCapabilities ?? [],
        memory: resolveMemorySettings(profile),
        runtimePolicy: resolveRuntimePolicy(profile),
        policy: {
          execPolicy: execPolicyConfig(policy),
          contextBudget: contextBudgetConfig(policy),
          toolRegistry: toolRegistryConfig(policy),
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
      "Use overwrite=true only when the user explicitly asked to replace the existing project profile."
    ],
    parameters: Type.Object({
      profile: Type.String({ minLength: 1 }),
      overwrite: Type.Optional(Type.Boolean()),
      projectId: Type.Optional(Type.String()),
      displayName: Type.Optional(Type.String())
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      try {
        const profile = writeProfileFromAdapter(extensionDir, ctx.cwd, params.profile, params.overwrite === true, params.projectId, params.displayName);
        appendTrace(ctx.cwd, { event: "profile_apply", profile: params.profile, projectId: profile.projectId, mode: profile.mode });
        appendSessionTrace(pi, { event: "profile_apply", profile: params.profile, projectId: profile.projectId, mode: profile.mode });
        return {
          content: [{ type: "text", text: `Profile applied: .pi/company-profile.json (${params.profile})` }],
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

  pi.registerCommand("company-status", {
    description: "Show company Pi profile and guard state",
    handler: async (_args, ctx) => {
      const profile = loadProfileFromContext(ctx);
      ctx.ui.notify(`Project profile: ${profile.displayName ?? profile.projectId ?? "unprofiled"}`, "info");
      pi.sendUserMessage("Use company_context with detail=full and summarize the active project guard profile.", {
        deliverAs: "followUp"
      });
    }
  });

  pi.registerCommand("company-memory", {
    description: "Show project memory policy and available memory files",
    handler: async (_args, ctx) => {
      const profile = loadProfileFromContext(ctx);
      const settings = resolveMemorySettings(profile);
      ctx.ui.notify(`Project memory: ${settings.enabled ? settings.mode : "off"}`, "info");
      pi.sendUserMessage("Use company_memory_status with detail=full and summarize the active project memory policy.", {
        deliverAs: "followUp"
      });
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
}
