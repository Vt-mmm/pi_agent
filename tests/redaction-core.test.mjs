import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  redactForStorage,
  redactSensitiveText
} from "../packages/pi-company-core/extensions/redaction-core.js";

describe("sensitive text redaction", () => {
  const joined = (...parts) => parts.join("");
  const dashJoined = (...parts) => parts.join("-");
  const underscoreJoined = (...parts) => parts.join("_");
  const leakedSecrets = [
    ["AWS secret access key", "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"],
    ["Postgres connection string", "postgres://app:supersecretpass@db.example.com:5432/prod"],
    ["GitHub fine-grained PAT", joined("github_pat_", "11AAAAAAA0", "abcdefghijklmnopqrstuvwxyz")],
    ["Stripe live key", underscoreJoined("sk", "live", "51NxTExampleSecretValue123456")],
    ["Slack bot token", dashJoined("xoxb", "123456789012", "123456789012", "AbCdEfGhIjKlMnOp")],
    ["database password", "DATABASE_PASSWORD=CorrectHorse42"],
    ["Google API key", joined("AIza", "SyDExampleKeyWithEnoughLength123456")],
    ["JSON api_key", `{"api_key":"${joined("AIza", "SyDExampleKeyWithEnoughLength123456")}"}`],
    ["Bearer token", "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadSignature123"],
    ["JWT token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456"],
    ["OpenAI style key", dashJoined("sk", "abcdefghijklmnopqrstuvwxyz1234567890")],
    ["PEM block", "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----"]
  ];

  for (const [name, text] of leakedSecrets) {
    it(`redacts ${name}`, () => {
      const result = redactSensitiveText(text);
      assert.equal(result.redacted, true);
      assert.match(result.text, /\[REDACTED_SECRET\]/);
      for (const fragment of [
        "CorrectHorse42",
        "supersecretpass",
        joined("github", "_pat_"),
        underscoreJoined("sk", "live", ""),
        dashJoined("xoxb", ""),
        joined("AI", "za"),
        "eyJhbGci",
        "abcdefghijklmnopqrstuvwxyz1234567890",
        "PRIVATE KEY"
      ]) {
        assert.equal(result.text.includes(fragment), false, `${name} leaked ${fragment}`);
      }
    });
  }

  const benignTexts = [
    "The secret: always run tests before final.",
    "token: null",
    "if (token === undefined) return;",
    "api_key: placeholder",
    "password: short"
  ];

  for (const text of benignTexts) {
    it(`does not redact benign prose: ${text}`, () => {
      const result = redactSensitiveText(text);
      assert.equal(result.redacted, false);
      assert.equal(result.text, text);
    });
  }

  it("recursively redacts storage payloads", () => {
    const result = redactForStorage({
      summary: "DATABASE_PASSWORD=CorrectHorse42",
      nested: ["token: null", joined("github_pat_", "11AAAAAAA0", "abcdefghijklmnopqrstuvwxyz")]
    });
    assert.deepEqual(result, {
      summary: "DATABASE_PASSWORD= [REDACTED_SECRET]",
      nested: ["token: null", "[REDACTED_SECRET]"]
    });
  });
});
