export function normalizeEvidenceCommand(command) {
  return String(command ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function normalizeCwd(cwd) {
  return String(cwd ?? "").trim();
}

function parseTimeMs(value, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numericExitCode(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number.parseInt(value, 10);
  return undefined;
}

export function claimedExitMatchesObserved(exitCode, observed) {
  const claimed = numericExitCode(exitCode);
  if (claimed === undefined) return false;
  if (typeof observed?.exitCode === "number") return observed.exitCode === claimed;
  return observed?.isError === true ? claimed !== 0 : claimed === 0;
}

export function extractBashCommandFromToolResultEvent(event) {
  if (!event || event.toolName !== "bash") return "";
  const input = event.input;
  if (input && typeof input.command === "string") return input.command;
  if (input && typeof input === "object" && input.args && typeof input.args.command === "string") return input.args.command;
  return "";
}

export function observedBashResultFromToolResultEvent(event, cwd, nowMs = Date.now()) {
  const command = extractBashCommandFromToolResultEvent(event);
  const normalizedCommand = normalizeEvidenceCommand(command);
  if (!normalizedCommand) return undefined;
  const exitCode = numericExitCode(event?.details?.exitCode ?? event?.details?.status ?? event?.exitCode);
  const recordedAtMs = parseTimeMs(event?.timestamp, nowMs);
  return {
    cwd: normalizeCwd(cwd),
    command,
    normalizedCommand,
    isError: event?.isError === true,
    exitCode,
    recordedAt: new Date(recordedAtMs).toISOString(),
    recordedAtMs,
    toolCallId: event?.toolCallId ?? event?.id
  };
}

export function createBashResultLedger(options = {}) {
  const maxEntries = Number.isInteger(options.maxEntries) ? options.maxEntries : 300;
  const entries = [];

  function prune() {
    while (entries.length > maxEntries) entries.shift();
  }

  return {
    record(entry) {
      const normalizedCommand = normalizeEvidenceCommand(entry?.command);
      if (!normalizedCommand) return undefined;
      const recordedAtMs = parseTimeMs(entry?.recordedAtMs ?? entry?.recordedAt);
      const observed = {
        cwd: normalizeCwd(entry?.cwd),
        command: String(entry.command),
        normalizedCommand,
        isError: entry?.isError === true,
        exitCode: numericExitCode(entry?.exitCode),
        recordedAt: entry?.recordedAt ?? new Date(recordedAtMs).toISOString(),
        recordedAtMs,
        toolCallId: entry?.toolCallId
      };
      entries.push(observed);
      prune();
      return observed;
    },

    findMatching({ cwd, command, notBefore, exitCode }) {
      const normalizedCommand = normalizeEvidenceCommand(command);
      const normalizedCwd = normalizeCwd(cwd);
      const notBeforeMs = notBefore ? parseTimeMs(notBefore, 0) : 0;
      if (!normalizedCommand) {
        return { ok: false, reason: "Verify command is empty after normalization." };
      }

      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry.cwd !== normalizedCwd) continue;
        if (entry.normalizedCommand !== normalizedCommand) continue;
        if (entry.recordedAtMs < notBeforeMs) continue;
        if (!claimedExitMatchesObserved(exitCode, entry)) {
          return {
            ok: false,
            reason: `Observed command status does not match claimed exitCode ${exitCode}.`,
            entry
          };
        }
        return { ok: true, entry };
      }

      return {
        ok: false,
        reason: "No matching bash tool_result observed for this command after task start."
      };
    },

    list() {
      return entries.map((entry) => ({ ...entry }));
    }
  };
}
