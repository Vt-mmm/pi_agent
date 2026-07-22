#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expected = Object.freeze({
  projectId: "prj_k3yqhdVXhwJWH8KC0J17UDulsVpG",
  orgId: "team_XYGedgJi8GJXu25Fg2J7Bz0Q",
  projectName: "pi-agent"
});

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`);
  process.exit(1);
}

function parseArguments(values) {
  let projectFile = path.join(repositoryRoot, "docs-site", ".vercel", "project.json");
  let provided = false;
  for (let index = 0; index < values.length; index += 1) {
    const option = values[index];
    if (option === "-h" || option === "--help") {
      process.stdout.write("Usage: node scripts/verify-vercel-link.mjs [--project-file <path>]\n");
      process.stdout.write("Verify that local Vercel metadata targets the canonical pi-agent project.\n");
      process.exit(0);
    }
    if (option !== "--project-file") fail(`unknown option ${option}`);
    if (provided) fail("duplicate option --project-file");
    const value = values[index + 1];
    if (!value || value.startsWith("--")) fail("--project-file requires a value");
    projectFile = path.resolve(value);
    provided = true;
    index += 1;
  }
  return projectFile;
}

const projectFile = parseArguments(process.argv.slice(2));
let stat;
try {
  stat = fs.lstatSync(projectFile);
} catch (error) {
  fail(`Vercel project metadata is missing at ${projectFile}; run: vercel link --cwd docs-site --project pi-agent`);
}
if (stat.isSymbolicLink() || !stat.isFile()) fail("Vercel project metadata must be a regular, non-symlink file");
if (stat.size < 2 || stat.size > 16 * 1024) fail("Vercel project metadata has an unexpected size");

let actual;
try {
  actual = JSON.parse(fs.readFileSync(projectFile, "utf8"));
} catch (error) {
  fail(`Vercel project metadata is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
}
if (!actual || Array.isArray(actual) || typeof actual !== "object") fail("Vercel project metadata must be a JSON object");

for (const [key, value] of Object.entries(expected)) {
  if (actual[key] !== value) {
    fail(`Vercel ${key} is ${JSON.stringify(actual[key] ?? null)}; expected ${JSON.stringify(value)}. Relink with: vercel link --cwd docs-site --project pi-agent`);
  }
}

process.stdout.write(`PASS: Vercel link targets ${expected.projectName} (${expected.projectId})\n`);
