import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repositoryRoot, "scripts", "verify-vercel-link.mjs");
const temporaryRoots = new Set();
const canonical = {
  projectId: "prj_k3yqhdVXhwJWH8KC0J17UDulsVpG",
  orgId: "team_XYGedgJi8GJXu25Fg2J7Bz0Q",
  projectName: "pi-agent"
};

after(() => {
  for (const root of temporaryRoots) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("pi-vercel-link-")) continue;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture(contents) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-vercel-link-"));
  temporaryRoots.add(root);
  const target = path.join(root, "project.json");
  fs.writeFileSync(target, typeof contents === "string" ? contents : `${JSON.stringify(contents)}\n`);
  return { root, target };
}

function run(target, extra = []) {
  return spawnSync(process.execPath, [script, "--project-file", target, ...extra], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}

describe("Vercel project link preflight", () => {
  it("accepts only the canonical project identity", () => {
    const { target } = fixture(canonical);
    const result = run(target);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS: Vercel link targets pi-agent/);
  });

  it("rejects stale, malformed, and non-object metadata", () => {
    for (const contents of [
      { ...canonical, projectId: "prj_stale", projectName: "docs-site" },
      "{not-json\n",
      "[]\n"
    ]) {
      const { target } = fixture(contents);
      const result = run(target);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^FAIL:/);
    }
  });

  it("rejects symlink metadata", () => {
    const { root, target } = fixture(canonical);
    const link = path.join(root, "linked-project.json");
    fs.symlinkSync(target, link);
    const result = run(link);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /regular, non-symlink/);
  });

  it("has side-effect-free help and rejects malformed arguments", () => {
    const help = spawnSync(process.execPath, [script, "--help"], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);

    const malformed = spawnSync(process.execPath, [script, "--project-file"], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /requires a value/);
  });
});
