import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateRedactionBenchmark } from "../scripts/redaction-benchmark.mjs";

describe("sensitive-data benchmark", () => {
  it("meets contextual recall and benign preservation gates", () => {
    const result = evaluateRedactionBenchmark({ iterations: 2 });
    assert.equal(result.contextual.total, 52);
    assert.equal(result.contextual.recall, 1, JSON.stringify(result.contextual));
    assert.deepEqual(result.contextual.missed, []);
    assert.equal(result.benign.total, 30);
    assert.equal(result.benign.falsePositives, 0, JSON.stringify(result.benign));
    assert.equal(result.structured.sensitiveTotal, 8);
    assert.equal(result.structured.sensitiveRedacted, 8);
    assert.equal(result.structured.benignTotal, 7);
    assert.equal(result.structured.benignPreserved, 7);
    assert.ok(result.largeOutput.bytes >= 100_000);
    assert.equal(result.largeOutput.sensitiveValueRedacted, true);
    assert.equal(result.ok, true);
  });

  it("reports unlabeled entropy separately without making it an authorization claim", () => {
    const result = evaluateRedactionBenchmark({ iterations: 1 });
    assert.equal(result.unlabeledEntropy.total, 6);
    assert.equal(result.unlabeledEntropy.gated, false);
  });
});
