import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

type ProjectProfile = {
  schemaVersion?: number;
  projectId?: string;
  displayName?: string;
  mode?: string;
  protectedPaths?: string[];
  requiredContext?: string[];
  verifyCommands?: Record<string, string[]>;
  mcpCapabilities?: string[];
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
  mcpCapabilities: string[];
  verifyCommands: string[];
  changedFiles: string[];
  verifyEvidence: Array<{ command: string; exitCode: number; summary: string; recordedAt: string }>;
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
  blockedCommandPatterns: string[];
  requireConfirmationPatterns: string[];
  defaultRequiredContext: string[];
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

const DEFAULT_POLICY: BasePolicy = {
  protectedPaths: [".git/**", "**/auth.json", "**/.env", "**/.env.*"],
  blockedCommandPatterns: ["rm -rf /", "rm -rf ~", "rm -rf $HOME", "git reset --hard", "git clean -fd"],
  requireConfirmationPatterns: ["deploy", "release", "publish", "migration", "gh pr merge", "git push"],
  defaultRequiredContext: ["AGENTS.md", "README.md"]
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
  const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
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

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function matchesAny(candidate: string, patterns: string[]): string | undefined {
  return patterns.find((pattern) => globToRegExp(pattern).test(candidate));
}

function commandIncludes(command: string, patterns: string[]): string | undefined {
  const normalized = command.toLowerCase();
  return patterns.find((pattern) => normalized.includes(pattern.toLowerCase()));
}

function extractLikelyPathFromInput(cwd: string, input: Record<string, unknown>): string | undefined {
  return normalizeRelative(cwd, input.path ?? input.filePath ?? input.target ?? input.filename);
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

function writeProjectOnboarding(cwd: string, snapshot: ProjectOnboardingSnapshot, markdown: string): ProjectOnboardingSnapshot {
  fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
  ensureStateDirs(cwd);
  fs.writeFileSync(projectContextFilePath(cwd), `${markdown.trimEnd()}\n`);
  fs.writeFileSync(onboardingStateFilePath(cwd), `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
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

function appendTrace(cwd: string, payload: Record<string, unknown>): void {
  ensureStateDirs(cwd);
  fs.appendFileSync(traceFilePath(cwd), `${JSON.stringify({ recordedAt: nowIso(), ...payload })}\n`);
}

function appendSessionTrace(pi: ExtensionAPI, payload: Record<string, unknown>): void {
  pi.appendEntry(COMPANY_TRACE_STATE_TYPE, {
    version: 1,
    recordedAt: nowIso(),
    ...payload
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

  pi.on("session_start", async (_event, ctx) => {
    const profile = loadProfileFromContext(ctx);
    const name = profile.displayName || profile.projectId || path.basename(ctx.cwd);
    pi.setSessionName(`pi:${name}`);
    const profileHint = fs.existsSync(projectProfilePath(ctx.cwd)) ? "" : " (run /onboard-project to select a profile)";
    ctx.ui.notify(`Company Pi guard loaded: ${name}${profileHint}`, "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    const profile = loadProfileFromContext(ctx);
    const protectedPaths = [
      ...policy.protectedPaths,
      ...(profile.protectedPaths ?? [])
    ];

    if (isToolCallEventType("bash", event)) {
      const command = String(event.input.command ?? "");
      const blocked = commandIncludes(command, policy.blockedCommandPatterns);
      if (blocked) {
        return { block: true, reason: `Blocked by company policy: ${blocked}` };
      }

      const protectedHit = protectedPaths.find((pattern) => command.includes(pattern.replace("/**", "")));
      if (protectedHit) {
        return { block: true, reason: `Command touches protected path: ${protectedHit}` };
      }

      const confirmPattern = commandIncludes(command, policy.requireConfirmationPatterns);
      if (confirmPattern) {
        const ok = await ctx.ui.confirm(
          `Command matches high-impact pattern "${confirmPattern}". Allow?`,
          "Company guard confirmation"
        );
        if (!ok) return { block: true, reason: `User denied high-impact command: ${confirmPattern}` };
      }
    }

    if (["write", "edit"].includes(event.toolName)) {
      const relativePath = extractLikelyPathFromInput(ctx.cwd, event.input as Record<string, unknown>);
      if (relativePath) {
        const matched = matchesAny(relativePath, protectedPaths);
        if (matched) {
          return { block: true, reason: `Blocked write to protected path: ${relativePath} matches ${matched}` };
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
        requiredContext: Array.from(new Set(requiredContext)),
        verifyCommands: profile.verifyCommands ?? {},
        mcpCapabilities: profile.mcpCapabilities ?? []
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
        `mcpCapabilities: ${payload.mcpCapabilities.join(", ") || "none"}`
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: payload
      };
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
        summary: params.summary,
        model: params.model,
        sourceFiles: params.sourceFiles,
        updateTriggers: params.updateTriggers ?? [
          "Project structure changed",
          "Stack/framework changed",
          "Verify commands changed",
          "Domain or ownership rules changed"
        ],
        notes: params.notes,
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
      const taskId = safeTaskId(params.taskId ?? params.summary);
      const task: TaskContract = {
        taskId,
        summary: params.summary,
        riskLane: params.riskLane,
        expectedOutput: params.expectedOutput,
        acceptanceCriteria: params.acceptanceCriteria,
        scope: params.scope,
        outOfScope: params.outOfScope ?? [],
        protectedPaths: profile.protectedPaths ?? [],
        requiredContext: profile.requiredContext ?? [],
        contextManifest: [],
        mcpCapabilities: profile.mcpCapabilities ?? [],
        verifyCommands: flattenVerifyCommands(profile),
        changedFiles: [],
        verifyEvidence: [],
        trace: { outcome: "pending" },
        createdAt,
        updatedAt: createdAt
      };
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, { taskId, event: "task_start", summary: params.summary, riskLane: params.riskLane });
      appendSessionTrace(pi, { taskId, event: "task_start", summary: params.summary, riskLane: params.riskLane });

      return {
        content: [{ type: "text", text: `Task contract created: .pi/company-state/tasks/${taskId}.json` }],
        details: task
      };
    }
  });

  pi.registerTool({
    name: "company_reference_checkout",
    label: "Company Reference Checkout",
    description: "Cache and refresh an external Git repository for targeted local inspection.",
    promptSnippet: "Use this before reading an external reference repository.",
    promptGuidelines: [
      "Use for GitHub/GitLab/Bitbucket reference repos.",
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
          "Reference repo ready:",
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
          content: [{ type: "text", text: `Reference checkout failed: ${message}` }],
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
      const task = readTask(ctx.cwd, params.taskId);
      if (!task) {
        return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], isError: true };
      }

      const seen = new Set(task.contextManifest.map((item) => `${item.path}\u0000${item.reason}`));
      for (const file of params.files) {
        const key = `${file.path}\u0000${file.reason}`;
        if (!seen.has(key)) task.contextManifest.push(file);
      }
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, { taskId: task.taskId, event: "context_record", files: params.files });
      appendSessionTrace(pi, { taskId: task.taskId, event: "context_record", files: params.files });

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

      task.verifyEvidence.push({
        command: params.command,
        exitCode: params.exitCode,
        summary: params.summary,
        recordedAt: nowIso()
      });
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, { taskId: task.taskId, event: "verify_record", command: params.command, exitCode: params.exitCode });
      appendSessionTrace(pi, { taskId: task.taskId, event: "verify_record", command: params.command, exitCode: params.exitCode });

      return {
        content: [{ type: "text", text: `Verify evidence recorded for ${task.taskId}: exit ${params.exitCode}` }],
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
      const task = readTask(ctx.cwd, params.taskId);
      if (!task) {
        return { content: [{ type: "text", text: `Task not found: ${params.taskId}` }], isError: true };
      }

      task.changedFiles = params.changedFiles ?? task.changedFiles;
      task.trace = {
        outcome: params.outcome,
        friction: params.friction,
        notes: params.notes,
        recordedAt: nowIso()
      };
      writeTask(ctx.cwd, task);
      appendTrace(ctx.cwd, {
        taskId: task.taskId,
        event: "trace_record",
        outcome: params.outcome,
        changedFiles: task.changedFiles,
        friction: params.friction,
        notes: params.notes
      });
      appendSessionTrace(pi, {
        taskId: task.taskId,
        event: "trace_record",
        outcome: params.outcome,
        changedFiles: task.changedFiles,
        friction: params.friction,
        notes: params.notes
      });

      return {
        content: [{ type: "text", text: `Trace recorded for ${task.taskId}: ${params.outcome}` }],
        details: task
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
}
