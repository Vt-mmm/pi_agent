import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function writeModule(target, source) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}

function writeRuntimeStubs(root) {
  writeModule(path.join(root, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), JSON.stringify({
    type: "module",
    exports: "./index.js"
  }));
  writeModule(path.join(root, "node_modules", "@earendil-works", "pi-coding-agent", "index.js"), [
    "export function isToolCallEventType(name, event) {",
    "  return event?.toolName === name;",
    "}",
    ""
  ].join("\n"));

  writeModule(path.join(root, "node_modules", "@earendil-works", "pi-ai", "package.json"), JSON.stringify({
    type: "module",
    exports: "./index.js"
  }));
  writeModule(path.join(root, "node_modules", "@earendil-works", "pi-ai", "index.js"), [
    "export function StringEnum(values) {",
    "  return { enum: values };",
    "}",
    ""
  ].join("\n"));

  writeModule(path.join(root, "node_modules", "typebox", "package.json"), JSON.stringify({
    type: "module",
    exports: "./index.js"
  }));
  writeModule(path.join(root, "node_modules", "typebox", "index.js"), [
    "const passthrough = (schema = {}) => schema;",
    "export const Type = {",
    "  Object: (properties = {}, options = {}) => ({ type: 'object', properties, ...options }),",
    "  Optional: passthrough,",
    "  String: (options = {}) => ({ type: 'string', ...options }),",
    "  Number: (options = {}) => ({ type: 'number', ...options }),",
    "  Boolean: (options = {}) => ({ type: 'boolean', ...options }),",
    "  Array: (items = {}, options = {}) => ({ type: 'array', items, ...options })",
    "};",
    ""
  ].join("\n"));
}

function copyCompanyPackage(root) {
  const packageRoot = path.join(root, "packages", "pi-company-core");
  fs.cpSync(path.join(repoRoot, "packages", "pi-company-core"), packageRoot, { recursive: true });
  fs.copyFileSync(path.join(repoRoot, "package.json"), path.join(root, "package.json"));
  fs.cpSync(path.join(repoRoot, "adapters"), path.join(root, "adapters"), { recursive: true });
  fs.cpSync(path.join(repoRoot, "packs"), path.join(root, "packs"), { recursive: true });
  fs.cpSync(path.join(repoRoot, "evals"), path.join(root, "evals"), { recursive: true });
  return packageRoot;
}

async function loadGuardFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-guard-integration-"));
  writeRuntimeStubs(root);
  const packageRoot = copyCompanyPackage(root);
  const moduleUrl = pathToFileURL(path.join(packageRoot, "extensions", "company-guard.ts")).href;
  const imported = await import(`${moduleUrl}?t=${Date.now()}-${Math.random()}`);
  return { root, companyGuard: imported.default };
}

function createProject(root) {
  const cwd = path.join(root, "project");
  fs.mkdirSync(path.join(cwd, ".pi", "company-state", "tasks"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.mkdirSync(path.join(cwd, "screenshots"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".env"), "TOKEN=fake-token\n");
  fs.writeFileSync(path.join(cwd, "README.md"), "# Fixture\n");
  fs.writeFileSync(path.join(cwd, "screenshots", "Ảnh màn hình 2026-07-20 lúc 12.00.00.png"), Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  ));
  fs.writeFileSync(path.join(cwd, ".pi", "company-profile.json"), `${JSON.stringify({
    schemaVersion: 1,
    projectId: "integration-project",
    displayName: "Integration Project",
    mode: "node-typescript",
    protectedPaths: [],
    shellProtectedPaths: [],
    requiredContext: [],
    verifyCommands: {
      test: ["npm test"]
    },
    mcpCapabilities: ["filesystem-readonly", "filesystem-write", "shell"],
    runtimePolicy: {
      execPolicy: "enforce",
      contextBudget: "enforce",
      toolRegistry: "advisory",
      finalGate: "enforce"
    }
  }, null, 2)}\n`);
  return cwd;
}

function createPiHarness() {
  const handlers = new Map();
  const tools = new Map();
  const commands = new Map();
  const entries = [];
  let sessionName = "";
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    sendMessage(message) {
      entries.push({ type: "message", payload: message });
    },
    appendEntry(type, payload) {
      entries.push({ type, payload });
    },
    setSessionName(name) {
      sessionName = name;
    },
    getThinkingLevel() {
      return "xhigh";
    }
  };
  return { pi, handlers, tools, commands, entries, getSessionName: () => sessionName };
}

function createContext(cwd, options = {}) {
  const notices = [];
  return {
    cwd,
    mode: "test",
    model: { provider: "test", id: "model" },
    ui: {
      notices,
      notify(message, level) {
        notices.push({ message, level });
      },
      confirm: async () => false
    },
    isProjectTrusted: () => true,
    getContextUsage: () => options.contextUsage ?? ({ tokens: 0, contextWindow: 1000, percent: 0 }),
    compact: () => {
      notices.push({ message: "compact called", level: "info" });
    },
    sessionManager: {
      getSessionFile: () => path.join(cwd, ".pi", "session.jsonl"),
      getSessionId: () => "session-test",
      getSessionName: () => "session",
      getEntries: () => [],
      getBranch: () => []
    }
  };
}

function nestedInput(depth, leaf) {
  let value = leaf;
  for (let index = 0; index < depth; index += 1) {
    value = { nest: value };
  }
  return value;
}

async function callToolCall(handler, ctx, toolName, input) {
  return await handler({ toolName, input }, ctx) ?? {};
}

async function callToolResult(handler, ctx, toolName, input, content) {
  return await handler({ toolName, input, content, isError: false }, ctx) ?? {};
}

describe("company guard integration", () => {
  it("loads the extension and registers runtime hooks/tools/commands", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();

    companyGuard(harness.pi);
    await harness.handlers.get("session_start")({}, ctx);

    assert.equal(harness.tools.size, 19);
    assert.equal(harness.commands.size, 7);
    assert.deepEqual([...harness.handlers.keys()].sort(), ["input", "session_start", "tool_call", "tool_result"]);
    assert.equal(harness.getSessionName(), "pi:Integration Project");
    assert.match(ctx.ui.notices[0].message, /Company Pi guard loaded: Integration Project/);
  });

  it("applies a profile with a matching deterministic capability lock", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);

    const result = await harness.tools.get("company_profile_apply").execute(
      "profile-apply-test",
      { profile: "generic", overwrite: true, projectId: "locked-project", displayName: "Locked Project" },
      undefined,
      () => {},
      ctx
    );

    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /company-profile.lock.json/);
    const profile = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "company-profile.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(cwd, ".pi", "company-profile.lock.json"), "utf8"));
    assert.equal(profile.projectId, "locked-project");
    assert.equal(lock.profile.projectId, "locked-project");
    assert.deepEqual(lock.packs.map((pack) => pack.name), ["engineering-base"]);
    assert.deepEqual(lock.permissions.externalActions, []);
    assert.deepEqual(lock.permissions.networkDomains, []);

    await harness.handlers.get("session_start")({}, ctx);
    lock.profile.digest = `sha256:${"0".repeat(64)}`;
    fs.writeFileSync(path.join(cwd, ".pi", "company-profile.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
    const blockedAfterTamper = await callToolCall(harness.handlers.get("tool_call"), ctx, "bash", { command: "echo should-not-run" });
    assert.equal(blockedAfterTamper.block, true);
    assert.match(blockedAfterTamper.reason, /does not match/);
  });

  it("enforces resolved filesystem scopes for path-like tools", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const manifestPath = path.join(root, "packs", "engineering-base", "pack.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.spec.permissions.filesystemRead = ["src/**"];
    manifest.spec.permissions.filesystemWrite = ["src/**"];
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const adapterPath = path.join(root, "adapters", "generic", "profile.json");
    const adapter = JSON.parse(fs.readFileSync(adapterPath, "utf8"));
    adapter.capabilityPolicy.allowedFilesystemRead = ["src/**"];
    adapter.capabilityPolicy.allowedFilesystemWrite = ["src/**"];
    fs.writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`);

    const cwd = createProject(root);
    fs.mkdirSync(path.join(cwd, "other-dir"), { recursive: true });
    fs.symlinkSync("../.env", path.join(cwd, "src", "config-link"));
    fs.symlinkSync("../other-dir", path.join(cwd, "src", "output-link"));
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const applied = await harness.tools.get("company_profile_apply").execute(
      "scoped-profile-test",
      { profile: "generic", overwrite: true },
      undefined,
      () => {},
      ctx
    );
    assert.equal(applied.isError, undefined);

    const toolCall = harness.handlers.get("tool_call");
    const outsideRead = await callToolCall(toolCall, ctx, "read", { path: "README.md" });
    const insideRead = await callToolCall(toolCall, ctx, "read", { path: "src/index.ts" });
    const outsideWrite = await callToolCall(toolCall, ctx, "write", { path: "notes.txt", content: "x" });
    const insideWrite = await callToolCall(toolCall, ctx, "write", { path: "src/index.ts", content: "x" });
    const scopedGrep = await callToolCall(toolCall, ctx, "grep", { pattern: "export", path: "src", glob: "*.ts" });
    const escapingGrep = await callToolCall(toolCall, ctx, "grep", { pattern: "Fixture", path: "src", glob: "../*.md" });
    const companyEnum = await callToolCall(toolCall, ctx, "company_memory_note", { note: "bounded", source: "explicit-user-request" });
    const defaultGrep = await callToolCall(toolCall, ctx, "grep", { pattern: "export" });
    const defaultFind = await callToolCall(toolCall, ctx, "find", { pattern: "*.ts" });
    const defaultList = await callToolCall(toolCall, ctx, "ls", {});
    const symlinkedSecretRead = await callToolCall(toolCall, ctx, "read", { path: "src/config-link" });
    const symlinkedDirectoryWrite = await callToolCall(toolCall, ctx, "write", { path: "src/output-link/file.txt", content: "x" });
    const absoluteOutsideRead = await callToolCall(toolCall, ctx, "read", { path: path.join(root, "outside.txt") });
    assert.equal(outsideRead.block, true);
    assert.notEqual(insideRead.block, true);
    assert.equal(outsideWrite.block, true);
    assert.notEqual(insideWrite.block, true);
    assert.notEqual(scopedGrep.block, true);
    assert.equal(escapingGrep.block, true);
    assert.notEqual(companyEnum.block, true);
    assert.equal(defaultGrep.block, true);
    assert.equal(defaultFind.block, true);
    assert.equal(defaultList.block, true);
    assert.equal(symlinkedSecretRead.block, true);
    assert.match(symlinkedSecretRead.reason, /symbolic link/);
    assert.equal(symlinkedDirectoryWrite.block, true);
    assert.match(symlinkedDirectoryWrite.reason, /symbolic link/);
    assert.equal(absoluteOutsideRead.block, true);
  });

  it("collapses pasted mandatory-flow boilerplate before agent processing", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const input = harness.handlers.get("input");

    const longPrompt = [
      "Implement this task:",
      "",
      "```text",
      "Scout giúp anh logic payment FE đã mapping với BE chưa. Backend read-only. Do not edit source.",
      "```",
      "",
      "Mandatory flow:",
      "1. Call company_context.",
      "2. Build with company_task_start.",
      "3. Record with company_context_record.",
      "4. Record verify with company_verify_record.",
      "5. Call company_task_gate_check.",
      "",
      "Output format:",
      "- Changed files.",
      "- Verify command/result."
    ].join("\n");

    const result = await input({ text: longPrompt, source: "interactive" }, ctx);
    assert.equal(result.action, "transform");
    assert.match(result.text, /^\/scout Scout giúp anh logic payment FE/);
    assert.doesNotMatch(result.text, /Mandatory flow/);
  });

  it("routes heavy-session scout requests into a fresh governed session command", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd, { contextUsage: { tokens: 850, contextWindow: 1000, percent: 85 } });
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const input = harness.handlers.get("input");

    const result = await input({
      text: "/scout Scout payment FE mapping vs BE contract. Backend read-only. Do not edit source.",
      source: "interactive"
    }, ctx);

    assert.equal(result.action, "transform");
    assert.match(result.text, /^\/fresh-scout Scout payment FE mapping/);
  });

  it("attaches local image paths from chat input and replaces them with image markers", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const input = harness.handlers.get("input");
    const imagePath = path.join(cwd, "screenshots", "Ảnh màn hình 2026-07-20 lúc 12.00.00.png");

    const result = await input({
      text: `Scout UI bug from screenshot: ${imagePath}`,
      source: "interactive"
    }, ctx);

    assert.equal(result.action, "transform");
    assert.match(result.text, /\[image1\]/);
    assert.doesNotMatch(result.text, new RegExp(imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].type, "image");
    assert.equal(result.images[0].mimeType, "image/png");
    assert.ok(result.images[0].data.length > 0);
  });

  it("also attaches image paths for extension-delivered fresh workflow prompts", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const input = harness.handlers.get("input");
    const imagePath = path.join(cwd, "screenshots", "Ảnh màn hình 2026-07-20 lúc 12.00.00.png");

    const result = await input({
      text: `/scout Check this screenshot ${imagePath}`,
      source: "extension"
    }, ctx);

    assert.equal(result.action, "transform");
    assert.match(result.text, /^\/scout Check this screenshot \[image1\]/);
    assert.equal(result.images.length, 1);
  });

  it("blocks raw access to secrets, guard state, and guard profile without false positives", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    fs.symlinkSync("../.env", path.join(cwd, "src", "config-link"));
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const toolCall = harness.handlers.get("tool_call");

    const blocked = [
      ["bash", { command: "cat .env" }],
      ["bash", { command: "cat .ENV" }],
      ["bash", { command: "printf x > .Env.Local" }],
      ["bash", { command: "cat src/config-link" }],
      ["bash", { command: "cat .pi/company-profile.json" }],
      ["bash", { command: "cat .pi/company-profile.lock.json" }],
      ["bash", { command: "cat .pi/settings.json" }],
      ["bash", { command: "echo forged >> .pi/company-state/observed-bash.jsonl" }],
      ["read", { path: ".env" }],
      ["read", { path: ".ENV" }],
      ["read", { path: "src/config-link" }],
      ["read", { path: ".pi/company-profile.json" }],
      ["read", { path: ".pi/company-profile.lock.json" }],
      ["read", { path: ".pi/settings.json" }],
      ["read", { file_path: ".pi/company-profile.json" }],
      ["read", { path: ".pi/company-state/tasks/x.json" }],
      ["grep", { pattern: ".", path: ".env", context: 5 }],
      ["grep", { pattern: ".", path: "auth.json", context: 5 }],
      ["grep", { pattern: ".", path: ".pi/company-profile.json", context: 5 }],
      ["grep", { pattern: ".", path: ".pi/company-state/observed-bash.jsonl", context: 5 }],
      ["grep", { pattern: "TOKEN", path: ".", glob: ".env*" }],
      ["grep", { pattern: "TOKEN", path: ".", glob: "**/.env*" }],
      ["grep", { pattern: "TOKEN", path: ".", glob: "{README.md,.env}" }],
      ["find", { pattern: ".env*", path: "." }],
      ["find", { pattern: "auth.json", path: "." }],
      ["find", { pattern: "company-profile.json", path: "." }],
      ["find", { pattern: "*", path: ".pi/company-state" }],
      ["ls", { path: ".pi/company-state" }],
      ["custom_reader", { path: ".env" }],
      ["custom_reader", { targetPath: ".pi/company-profile.json" }],
      ["mcp__fs__read", { dir: ".env" }],
      ["mcp__fs__read", { directory: ".env" }],
      ["mcp__fs__read", { source: ".env" }],
      ["mcp__fs__read", { src: ".env" }],
      ["mcp__fs__read", { dest: ".env" }],
      ["mcp__fs__read", { destination: ".env" }],
      ["mcp__fs__read", { output: ".env" }],
      ["mcp__fs__read", { outputPath: ".env" }],
      ["mcp__fs__read", { uri: ".env" }],
      ["mcp__fs__read", { location: ".env" }],
      ["mcp__fs__read", { notebook_path: ".env" }],
      ["mcp__fs__read", { absolute_path: ".env" }],
      ["mcp__fs__read", { path: [".env"] }],
      ["mcp__fs__read", { args: { path: ".env" } }],
      ["mcp__fs__read", { paths: [".env"] }],
      ["mcp__fs__read", { files: [".env"] }],
      ["mcp__fs__read", { uri: pathToFileURL(path.join(cwd, ".env")).href }],
      ["mcp__fs__read", { uri: "%2Eenv" }],
      ["mcp__fs__read", { location: ".%65nv" }],
      ["mcp__fs__read", nestedInput(32, { path: ".env" })],
      ["mcp__fs__read", nestedInput(33, { path: "README.md" })],
      ["write", { path: ".env", content: "x" }],
      ["write", { path: ".ENV", content: "x" }],
      ["write", { path: ".pi/company-state/observed-bash.jsonl", content: "x" }],
      ["write", { file_path: ".pi/company-state/observed-bash.jsonl", content: "x" }],
      ["write", { path: ".pi/company-state/tasks/x.json", content: "x" }],
      ["write", { path: ".pi/company-profile.json", content: "{}" }],
      ["write", { path: ".pi/company-profile.lock.json", content: "{}" }],
      ["write", { path: ".pi/settings.json", content: "{}" }],
      ["edit", { path: ".pi/company-profile.json", old: "x", new: "y" }],
      ["edit", { path: ".pi/company-profile.lock.json", old: "x", new: "y" }],
      ["edit", { path: ".pi/settings.json", old: "x", new: "y" }]
    ];

    for (const [toolName, input] of blocked) {
      const result = await callToolCall(toolCall, ctx, toolName, input);
      assert.equal(result.block, true, `${toolName} ${JSON.stringify(input)} should be blocked`);
    }

    const allowed = [
      ["bash", { command: "echo ok" }],
      ["read", { path: "README.md" }],
      ["grep", { pattern: "Fixture", path: "README.md" }],
      ["grep", { pattern: "Fixture", path: ".", glob: "*.md" }],
      ["grep", { pattern: "name", path: ".", glob: "*.json" }],
      ["find", { pattern: "*.md", path: "." }],
      ["find", { pattern: "*.json", path: "." }],
      ["ls", { path: "src" }],
      ["custom_reader", { path: "README.md" }],
      ["custom_reader", nestedInput(20, { path: "README.md" })],
      ["custom_search", { query: ".env", pattern: ".env", content: "cat .env", command: "cat .env", text: ".env" }],
      ["write", { path: "src/index.ts", content: "export {};\n" }],
      ["edit", { path: "README.md", old: "Fixture", new: "Fixture" }]
    ];

    for (const [toolName, input] of allowed) {
      const result = await callToolCall(toolCall, ctx, toolName, input);
      assert.notEqual(result.block, true, `${toolName} ${JSON.stringify(input)} should be allowed`);
    }
  });

  it("redacts protected grep result lines from broad searches", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const toolResult = harness.handlers.get("tool_result");

    const mixed = await callToolResult(toolResult, ctx, "grep", { pattern: "runtimePolicy", path: "." }, [
      {
        type: "text",
        text: [
          ".pi/company-profile.json:3: runtimePolicy secret",
          "README.md:1: Fixture runtimePolicy mention"
        ].join("\n")
      }
    ]);

    assert.equal(mixed.details.protectedMatchesRedacted, 1);
    assert.match(mixed.content[0].text, /README\.md:1/);
    assert.match(mixed.content[0].text, /redacted 1 protected grep line/);
    assert.doesNotMatch(mixed.content[0].text, /\.pi\/company-profile\.json/);
    assert.doesNotMatch(mixed.content[0].text, /runtimePolicy secret/);

    const protectedOnly = await callToolResult(toolResult, ctx, "grep", { pattern: "TOKEN", path: "." }, [
      {
        type: "text",
        text: ".env:1: TOKEN=fake-token"
      }
    ]);

    assert.equal(protectedOnly.details.protectedMatchesRedacted, 1);
    assert.match(protectedOnly.content[0].text, /No matches found in non-protected paths/);
    assert.doesNotMatch(protectedOnly.content[0].text, /fake-token/);
  });

  it("redacts protected find and ls metadata from broad result output", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);
    const toolResult = harness.handlers.get("tool_result");

    const findResult = await callToolResult(toolResult, ctx, "find", { pattern: "*.json", path: "." }, [
      {
        type: "text",
        text: [
          "auth.json",
          "package.json",
          ".pi/company-profile.json",
          "src/config.json"
        ].join("\n")
      }
    ]);

    assert.equal(findResult.details.protectedPathsRedacted, 2);
    assert.match(findResult.content[0].text, /package\.json/);
    assert.match(findResult.content[0].text, /src\/config\.json/);
    assert.match(findResult.content[0].text, /redacted 2 protected find lines/);
    assert.doesNotMatch(findResult.content[0].text, /auth\.json/);
    assert.doesNotMatch(findResult.content[0].text, /\.pi\/company-profile\.json/);

    const lsResult = await callToolResult(toolResult, ctx, "ls", { path: ".pi" }, [
      {
        type: "text",
        text: [
          "company-profile.json",
          "company-state/",
          "mcp.json"
        ].join("\n")
      }
    ]);

    assert.equal(lsResult.details.protectedPathsRedacted, 2);
    assert.match(lsResult.content[0].text, /mcp\.json/);
    assert.match(lsResult.content[0].text, /redacted 2 protected ls lines/);
    assert.doesNotMatch(lsResult.content[0].text, /company-profile\.json/);
    assert.doesNotMatch(lsResult.content[0].text, /company-state/);
  });

  it("still lets company tools and hooks write governed state internally", async () => {
    const { root, companyGuard } = await loadGuardFixture();
    const cwd = createProject(root);
    const ctx = createContext(cwd);
    const harness = createPiHarness();
    companyGuard(harness.pi);

    const taskStart = harness.tools.get("company_task_start");
    const verifyRecord = harness.tools.get("company_verify_record");
    const toolResult = harness.handlers.get("tool_result");

    const start = await taskStart.execute("tool-1", {
      taskId: "integration-task",
      summary: "Integration task verifies guard state protection",
      riskLane: "normal",
      expectedOutput: "Guard state remains protected while company tools work.",
      acceptanceCriteria: ["Task state can be written by company tools"],
      scope: ["src/**"],
      outOfScope: []
    }, undefined, undefined, ctx);
    assert.equal(start.isError, undefined);

    await toolResult({
      toolName: "bash",
      input: { command: "npm test" },
      isError: false
    }, ctx);

    const verify = await verifyRecord.execute("tool-2", {
      taskId: "integration-task",
      command: "npm test",
      exitCode: 0,
      summary: "Tests passed."
    }, undefined, undefined, ctx);

    assert.equal(verify.isError, undefined);
    assert.equal(verify.details.task.verifyEvidence[0].observed, true);
    assert.equal(verify.details.task.verifyEvidence[0].matchedProfileCommand, true);
    assert.ok(fs.existsSync(path.join(cwd, ".pi", "company-state", "observed-bash.jsonl")));
    assert.ok(fs.existsSync(path.join(cwd, ".pi", "company-state", "tasks", "integration-task.json")));
  });
});
