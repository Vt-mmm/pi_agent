import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimedExitMatchesObserved,
  createBashResultLedger,
  normalizeEvidenceCommand,
  observedBashResultFromToolResultEvent
} from "../packages/pi-company-core/extensions/runtime-evidence.js";

describe("runtime verify evidence ledger", () => {
  it("normalizes command edges but preserves command identity", () => {
    assert.equal(normalizeEvidenceCommand(" npm test \r\n"), "npm test");
    assert.notEqual(normalizeEvidenceCommand("npm  test"), "npm test");
  });

  it("rejects forged verify records without a matching observed bash result", () => {
    const ledger = createBashResultLedger();
    ledger.record({
      cwd: "/repo",
      command: "echo ok",
      isError: false,
      recordedAtMs: Date.parse("2026-07-19T01:00:01.000Z")
    });

    const result = ledger.findMatching({
      cwd: "/repo",
      command: "npm test",
      notBefore: "2026-07-19T01:00:00.000Z",
      exitCode: 0
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /No matching bash tool_result/);
  });

  it("accepts a matching passing bash result after task start", () => {
    const ledger = createBashResultLedger();
    ledger.record({
      cwd: "/repo",
      command: "npm test",
      isError: false,
      recordedAtMs: Date.parse("2026-07-19T01:00:01.000Z")
    });

    const result = ledger.findMatching({
      cwd: "/repo",
      command: " npm test ",
      notBefore: "2026-07-19T01:00:00.000Z",
      exitCode: 0
    });

    assert.equal(result.ok, true);
    assert.equal(result.entry.command, "npm test");
  });

  it("rejects observations from before task start", () => {
    const ledger = createBashResultLedger();
    ledger.record({
      cwd: "/repo",
      command: "npm test",
      isError: false,
      recordedAtMs: Date.parse("2026-07-19T00:59:59.000Z")
    });

    const result = ledger.findMatching({
      cwd: "/repo",
      command: "npm test",
      notBefore: "2026-07-19T01:00:00.000Z",
      exitCode: 0
    });

    assert.equal(result.ok, false);
  });

  it("rejects claimed pass when Pi observed a bash error", () => {
    const ledger = createBashResultLedger();
    ledger.record({
      cwd: "/repo",
      command: "npm test",
      isError: true,
      recordedAtMs: Date.parse("2026-07-19T01:00:01.000Z")
    });

    const result = ledger.findMatching({
      cwd: "/repo",
      command: "npm test",
      notBefore: "2026-07-19T01:00:00.000Z",
      exitCode: 0
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /status does not match/);
  });

  it("accepts claimed failure when Pi observed a bash error", () => {
    assert.equal(claimedExitMatchesObserved(1, { isError: true }), true);
    assert.equal(claimedExitMatchesObserved(0, { isError: true }), false);
    assert.equal(claimedExitMatchesObserved(0, { isError: false }), true);
  });

  it("extracts observed bash result from Pi tool_result shape", () => {
    const observed = observedBashResultFromToolResultEvent({
      toolName: "bash",
      input: { command: "npm test" },
      isError: false,
      timestamp: "2026-07-19T01:00:01.000Z"
    }, "/repo");

    assert.equal(observed.normalizedCommand, "npm test");
    assert.equal(observed.cwd, "/repo");
    assert.equal(observed.recordedAt, "2026-07-19T01:00:01.000Z");
  });
});
