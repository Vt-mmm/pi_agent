const PATH_REDIRECT_OPERATORS = new Set(["<", ">", ">>", "1>", "1>>", "2>", "2>>", "&>", "&>>"]);
const DATA_ONLY_COMMANDS = new Set(["echo", "printf"]);

function escapeRegex(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

export function normalizePathCandidate(candidate) {
  if (typeof candidate !== "string") return "";
  if (candidate.trim() === "/") return "/";
  return candidate
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function segmentMatches(patternSegment, candidateSegment) {
  if (patternSegment === "*") return candidateSegment.length > 0;
  const regex = new RegExp(`^${escapeRegex(patternSegment).replace(/\*/g, "[^/]*")}$`);
  return regex.test(candidateSegment);
}

export function globMatchesPath(pattern, candidate) {
  const normalizedPattern = normalizePathCandidate(pattern);
  const normalizedCandidate = normalizePathCandidate(candidate);
  if (!normalizedPattern || !normalizedCandidate) return false;

  const patternSegments = normalizedPattern.split("/").filter(Boolean);
  const candidateSegments = normalizedCandidate.split("/").filter(Boolean);

  function match(patternIndex, candidateIndex) {
    if (patternIndex === patternSegments.length) return candidateIndex === candidateSegments.length;

    const patternSegment = patternSegments[patternIndex];
    if (patternSegment === "**") {
      if (match(patternIndex + 1, candidateIndex)) return true;
      for (let nextCandidate = candidateIndex; nextCandidate < candidateSegments.length; nextCandidate += 1) {
        if (match(patternIndex + 1, nextCandidate + 1)) return true;
      }
      return false;
    }

    if (candidateIndex >= candidateSegments.length) return false;
    if (!segmentMatches(patternSegment, candidateSegments[candidateIndex])) return false;
    return match(patternIndex + 1, candidateIndex + 1);
  }

  return match(0, 0);
}

export function matchesAnyPath(candidate, patterns) {
  const normalizedCandidate = normalizePathCandidate(candidate);
  return patterns.find((pattern) => {
    if (globMatchesPath(pattern, normalizedCandidate)) return true;
    if (pattern.endsWith("/**")) {
      const basePattern = pattern.slice(0, -3);
      return globMatchesPath(basePattern, normalizedCandidate);
    }
    return false;
  });
}

export function splitShellSegments(command) {
  const segments = [];
  let current = "";
  let quote;
  let escaped = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if ((char === "'" || char === "\"") && !quote) {
      quote = char;
      current += char;
      continue;
    }
    if (quote === char) {
      quote = undefined;
      current += char;
      continue;
    }
    if (!quote && (char === ";" || char === "|" || (char === "&" && next === "&") || (char === "|" && next === "|"))) {
      const segment = current.trim();
      if (segment) segments.push(segment);
      current = "";
      if ((char === "&" && next === "&") || (char === "|" && next === "|")) index += 1;
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail) segments.push(tail);
  return segments.length ? segments : [command.trim()].filter(Boolean);
}

export function shellWords(segment) {
  const words = [];
  let current = "";
  let quote;
  let escaped = false;
  for (const char of segment.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if ((char === "'" || char === "\"") && !quote) {
      quote = char;
      continue;
    }
    if (quote === char) {
      quote = undefined;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) words.push(current);
  return words;
}

export function arrayStartsWith(items, prefix) {
  return prefix.length > 0 && prefix.every((item, index) => items[index] === item);
}

function commandRuleMatches(rule, segment, words) {
  if (rule.match === "prefix") {
    const prefix = Array.isArray(rule.value) ? rule.value : shellWords(rule.value);
    return arrayStartsWith(words, prefix);
  }
  const raw = Array.isArray(rule.value) ? rule.value.join(" ") : rule.value;
  if (rule.match === "contains") return segment.toLowerCase().includes(raw.toLowerCase());
  try {
    return new RegExp(raw, "i").test(segment);
  } catch {
    return false;
  }
}

function flagChars(word) {
  if (!word.startsWith("-") || word.startsWith("--")) return "";
  return word.slice(1);
}

function isRootOrHomeTarget(word) {
  const normalized = normalizePathCandidate(word);
  return normalized === "/" || normalized === "~" || normalized === "$HOME" || normalized === "${HOME}";
}

function rmFinding(words) {
  const command = words[0] ?? "";
  const dynamicCommand = command.startsWith("$");
  if (command !== "rm" && !dynamicCommand) return undefined;

  let recursive = false;
  let force = false;
  const targets = [];
  for (const word of words.slice(1)) {
    if (word === "--recursive") {
      recursive = true;
      continue;
    }
    if (word === "--force") {
      force = true;
      continue;
    }
    if (word.startsWith("-") && word !== "-") {
      const chars = flagChars(word);
      if (chars.includes("r") || chars.includes("R")) recursive = true;
      if (chars.includes("f")) force = true;
      continue;
    }
    targets.push(word);
  }

  if (targets.some(isRootOrHomeTarget) && (recursive || force || dynamicCommand)) {
    return "Refusing recursive/forced removal of root or home target.";
  }
  return undefined;
}

function findDeleteFinding(words) {
  if (words[0] !== "find") return undefined;
  if (!words.includes("-delete")) return undefined;
  const firstTarget = words.slice(1).find((word) => !word.startsWith("-"));
  if (firstTarget && isRootOrHomeTarget(firstTarget)) {
    return "Refusing find -delete against root or home target.";
  }
  return undefined;
}

function ddFinding(words) {
  if (words[0] !== "dd") return undefined;
  const out = words.find((word) => /^of=\/dev\/(?:sd[a-z]\d*|hd[a-z]\d*|xvd[a-z]\d*|nvme\d+n\d+(?:p\d+)?|disk\d+|rdisk\d+|mapper\/.+)$/i.test(word));
  return out ? `Refusing dd write to block device ${out}.` : undefined;
}

function semanticCommandFindings(words) {
  return [rmFinding(words), findDeleteFinding(words), ddFinding(words)].filter(Boolean);
}

function legacyPatternMatchesSegment(pattern, words) {
  const patternWords = shellWords(pattern);
  return arrayStartsWith(words, patternWords);
}

export function evaluateExecPolicyCore(command, options) {
  const policy = options.policy ?? {};
  const mode = options.mode ?? policy.execPolicy?.defaultMode ?? "enforce";
  const execPolicy = {
    bannedPrefixSuggestions: policy.execPolicy?.bannedPrefixSuggestions ?? [],
    rules: policy.execPolicy?.rules ?? []
  };
  const reasons = [];
  const segments = splitShellSegments(command).map((segment) => {
    const words = shellWords(segment);
    const matches = [];
    const warnings = [];

    for (const prefix of execPolicy.bannedPrefixSuggestions) {
      if (arrayStartsWith(words, prefix)) {
        warnings.push(`Do not persist broad approval prefix: ${prefix.join(" ")}`);
      }
    }

    for (const rule of execPolicy.rules) {
      if (!commandRuleMatches(rule, segment, words)) continue;
      matches.push(`${rule.action}:${rule.id}`);
      if (rule.action === "forbid") reasons.push(`Forbidden by exec policy ${rule.id}: ${rule.reason}`);
      if (rule.action === "prompt") reasons.push(`Prompt required by exec policy ${rule.id}: ${rule.reason}`);
    }

    for (const finding of semanticCommandFindings(words)) {
      matches.push("forbid:semantic-shell-safety");
      reasons.push(finding);
    }

    for (const pattern of policy.blockedCommandPatterns ?? []) {
      if (!legacyPatternMatchesSegment(pattern, words)) continue;
      matches.push(`forbid:legacy:${pattern}`);
      reasons.push(`Blocked by legacy policy pattern: ${pattern}`);
    }

    return { command: segment, words, matches, warnings };
  });

  const normalizedCommand = command.toLowerCase();
  for (const pattern of policy.requireConfirmationPatterns ?? []) {
    if (normalizedCommand.includes(String(pattern).toLowerCase())) {
      reasons.push(`Confirmation required by legacy policy pattern: ${pattern}`);
      break;
    }
  }

  const hasForbid = reasons.some((reason) => reason.startsWith("Forbidden") || reason.startsWith("Blocked") || reason.startsWith("Refusing"));
  const hasPrompt = reasons.some((reason) => reason.startsWith("Prompt") || reason.startsWith("Confirmation"));
  return {
    mode,
    decision: mode === "off" ? "allow" : hasForbid ? "forbid" : hasPrompt ? "prompt" : "allow",
    reasons,
    segments
  };
}

function isShellProtectedPattern(pattern) {
  return /(?:^|\/)\.env(?:$|\.)/.test(pattern)
    || /auth\.json$/.test(pattern)
    || pattern.startsWith(".git");
}

function pathCandidateFromOption(word) {
  const atMatch = word.match(/^@(.+)$/) ?? word.match(/=@(.+)$/);
  if (atMatch) return atMatch[1];
  const equalsMatch = word.match(/^(?:--?[A-Za-z0-9-]+)=(.+)$/);
  return equalsMatch ? equalsMatch[1] : undefined;
}

function isPathLike(word) {
  if (!word || word === "-") return false;
  if (word.startsWith("http://") || word.startsWith("https://")) return false;
  return word.startsWith(".")
    || word.startsWith("/")
    || word.startsWith("~/")
    || word.startsWith("$HOME/")
    || word.includes("/")
    || word === "auth.json";
}

export function extractShellPathCandidates(command) {
  const candidates = [];
  for (const segment of splitShellSegments(command)) {
    const words = shellWords(segment);
    const commandName = words[0] ?? "";
    if (DATA_ONLY_COMMANDS.has(commandName)) {
      for (let index = 1; index < words.length; index += 1) {
        if (PATH_REDIRECT_OPERATORS.has(words[index]) && words[index + 1]) candidates.push(words[index + 1]);
      }
      continue;
    }

    for (let index = 1; index < words.length; index += 1) {
      const word = words[index];
      if (PATH_REDIRECT_OPERATORS.has(word) && words[index + 1]) {
        candidates.push(words[index + 1]);
        index += 1;
        continue;
      }
      if (/^(?:\d*)>>?/.test(word) || /^&>>?/.test(word)) {
        const pathPart = word.replace(/^(?:\d*|&)>>?/, "");
        if (pathPart) candidates.push(pathPart);
        continue;
      }
      const optionPath = pathCandidateFromOption(word);
      if (optionPath) {
        candidates.push(optionPath);
        continue;
      }
      if (word.startsWith("-")) continue;
      if (isPathLike(word)) candidates.push(word);
    }
  }
  return candidates.map(normalizePathCandidate).filter(Boolean);
}

export function findProtectedPathInCommand(command, protectedPatterns) {
  const shellPatterns = protectedPatterns.filter(isShellProtectedPattern);
  for (const candidate of extractShellPathCandidates(command)) {
    const pattern = matchesAnyPath(candidate, shellPatterns);
    if (pattern) return { candidate, pattern };
  }
  return undefined;
}
