const REDACTION = "[REDACTED_SECRET]";

const TOKEN_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[opsru]_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
];

const CONNECTION_URL_PATTERN = /\b((?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s/"']+:)([^@\s/"']+)(@[^\s"'<>]+)/gi;
const BEARER_PATTERN = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{20,})\b/gi;
const SECRET_ASSIGNMENT_PATTERN = /(^|[\s{[,(;])((?:"|')?(?:[A-Za-z0-9_]*_)?(?:api[_-]?key|token|password|passwd|pwd|secret|credential|client_secret|access[_-]?token|refresh[_-]?token|secret_access_key|aws_secret_access_key)(?:"|')?\s*)(:|=(?!=))\s*(["']?)([^"'\s,;}]+)/gim;

function normalizeSecretValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[`"']|[`"']$/g, "")
    .replace(/[.;)]+$/g, "");
}

function looksLikeKnownSecret(value) {
  const tokenHit = TOKEN_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
  CONNECTION_URL_PATTERN.lastIndex = 0;
  BEARER_PATTERN.lastIndex = 0;
  return tokenHit || CONNECTION_URL_PATTERN.test(value) || BEARER_PATTERN.test(value);
}

function keyRequiresLowerThreshold(key) {
  return /password|passwd|pwd|secret|credential/i.test(key);
}

function valueLooksSensitive(key, value) {
  const clean = normalizeSecretValue(value);
  if (!clean) return false;
  if (/^(?:null|undefined|none|false|true|0|""|'')$/i.test(clean)) return false;
  if (looksLikeKnownSecret(clean)) return true;
  if (keyRequiresLowerThreshold(key)) return clean.length >= 8;
  return clean.length >= 12 && /[A-Za-z]/.test(clean) && /[0-9_\-+/=]/.test(clean);
}

export function redactSensitiveText(input) {
  if (typeof input !== "string") return { text: "", redacted: false };
  let text = input;

  text = text.replace(CONNECTION_URL_PATTERN, (_match, prefix, _password, suffix) => `${prefix}${REDACTION}${suffix}`);
  text = text.replace(BEARER_PATTERN, (_match, prefix) => `${prefix}${REDACTION}`);

  for (const pattern of TOKEN_PATTERNS) {
    text = text.replace(pattern, REDACTION);
  }

  text = text.replace(SECRET_ASSIGNMENT_PATTERN, (match, prefix, key, separator, quote, value) => {
    if (!valueLooksSensitive(key, value)) return match;
    return `${prefix}${key}${separator} ${quote}${REDACTION}`;
  });

  return { text, redacted: text !== input };
}

export function redactForStorage(value) {
  if (typeof value === "string") return redactSensitiveText(value).text;
  if (Array.isArray(value)) return value.map((item) => redactForStorage(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactForStorage(item)])
  );
}
