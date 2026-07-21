const REDACTION = "[REDACTED_SECRET]";

const TOKEN_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[opsru]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-(?:(?:proj|svcacct|admin|ant)-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
];

const CONNECTION_URL_PATTERN = /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s/"']+:)([^@\s/"']+)(@[^\s"'<>]+)/gi;
const BEARER_PATTERN = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{20,})\b/gi;
const SECRET_ASSIGNMENT_PATTERN = /(^|[\s{[,(;])((?:"|')?(?:[A-Za-z0-9_]*_)?(?:api[_-]?key|token|password|passwd|pwd|secret|credential|client_secret|access[_-]?token|refresh[_-]?token|secret_access_key|aws_secret_access_key)(?:"|')?\s*)(:|=(?!=))\s*(["']?)([^"'\s,;}]+)/gim;
const WHITESPACE_SECRET_ASSIGNMENT_PATTERN = /(^|[\s{[,(;])((?:"|')?(?:aws_)?secret_access_key(?:"|')?\s+)(["']?)([A-Za-z0-9/+=]{20,})/gim;

function normalizeSecretValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[`"']|[`"']$/g, "")
    .replace(/[.;)]+$/g, "");
}

function patternMatches(pattern, value) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function looksLikeKnownSecret(value) {
  return TOKEN_PATTERNS.some((pattern) => patternMatches(pattern, value))
    || patternMatches(CONNECTION_URL_PATTERN, value)
    || patternMatches(BEARER_PATTERN, value);
}

function keyRequiresLowerThreshold(key) {
  return /password|passwd|pwd|secret|credential/i.test(key);
}

function valueLooksPlaceholder(value) {
  const clean = normalizeSecretValue(value);
  if (!clean) return true;
  if (/^(?:null|undefined|none|false|true|0|""|'')$/i.test(clean)) return true;
  if (/^<[^>\n]{1,80}>$/.test(clean)) return true;
  if (/^(?:not-set|unset|placeholder|example|changeme|change-me|redacted|xxx|\*{3,})$/i.test(clean)) return true;
  if (/^your[-_][a-z0-9][a-z0-9_-]*$/i.test(clean)) return true;
  return false;
}

function valueLooksSensitive(key, value) {
  const clean = normalizeSecretValue(value);
  if (!clean || valueLooksPlaceholder(clean)) return false;
  if (looksLikeKnownSecret(clean)) return true;
  if (keyRequiresLowerThreshold(key)) return clean.length >= 8;
  return clean.length >= 12 && /[A-Za-z]/.test(clean) && /[0-9_\-+/=]/.test(clean);
}

export function redactSensitiveText(input) {
  if (typeof input !== "string") return { text: "", redacted: false };
  let text = input;

  text = text.replace(CONNECTION_URL_PATTERN, (_match, prefix, _password, suffix) => `${prefix}${REDACTION}${suffix}`);
  text = text.replace(BEARER_PATTERN, (_match, prefix) => `${prefix}${REDACTION}`);

  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, REDACTION);

  text = text.replace(SECRET_ASSIGNMENT_PATTERN, (match, prefix, key, separator, quote, value) => {
    if (!valueLooksSensitive(key, value)) return match;
    return `${prefix}${key}${separator} ${quote}${REDACTION}`;
  });

  text = text.replace(WHITESPACE_SECRET_ASSIGNMENT_PATTERN, (match, prefix, key, quote, value) => {
    if (!valueLooksSensitive(key, value)) return match;
    return `${prefix}${key}${quote}${REDACTION}`;
  });

  return { text, redacted: text !== input };
}

export function containsSensitiveText(input) {
  return typeof input === "string" && redactSensitiveText(input).redacted;
}

function redactStorageValue(value, key) {
  if (typeof value === "string") {
    const redacted = redactSensitiveText(value);
    if (redacted.redacted) return redacted.text;
    return key && valueLooksSensitive(key, value) ? REDACTION : value;
  }
  if (Array.isArray(value)) return value.map((item) => redactStorageValue(item, key));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, item]) => [childKey, redactStorageValue(item, childKey)])
  );
}

export function redactForStorage(value) {
  return redactStorageValue(value, undefined);
}
