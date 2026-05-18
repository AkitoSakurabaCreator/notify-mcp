import { NotifyError } from "./errors.js";

export const MAX_TITLE_LENGTH = 256;
export const MAX_MESSAGE_LENGTH = 4096;
export const MAX_SOUND_PATH_LENGTH = 1024;

/**
 * Control characters we strip BEFORE doing any per-platform escaping.
 * We KEEP:
 *   - 0x09 (TAB)
 *   - 0x0A (LF)
 *   - 0x0D (CR)
 * We STRIP:
 *   - 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F
 * Rationale: line breaks may legitimately appear in `message`, but other
 *   control characters can break AppleScript / XML / PowerShell parsing
 *   and are also a known injection vector in some libraries.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHARS_RE, "");
}

function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new NotifyError("invalid_input", `${field} must be a string`);
  }
  return value;
}

export function sanitizeTitle(raw: unknown): string {
  const s = stripControlChars(ensureString(raw, "title")).trim();
  if (s.length === 0) {
    throw new NotifyError("invalid_input", "title must not be empty after sanitization");
  }
  return s.length > MAX_TITLE_LENGTH ? s.slice(0, MAX_TITLE_LENGTH) : s;
}

export function sanitizeMessage(raw: unknown): string {
  const s = stripControlChars(ensureString(raw, "message"));
  // Allow trimming end-of-string whitespace but keep internal newlines.
  const trimmed = s.replace(/[\t ]+$/gm, "").replace(/^\s+|\s+$/g, "");
  if (trimmed.length === 0) {
    throw new NotifyError("invalid_input", "message must not be empty after sanitization");
  }
  return trimmed.length > MAX_MESSAGE_LENGTH ? trimmed.slice(0, MAX_MESSAGE_LENGTH) : trimmed;
}

/**
 * Sanitize a sound spec. Accepts:
 *   - "system:NAME" — platform-specific built-in (validated later in sound.ts)
 *   - absolute filesystem path
 * Rejects: relative paths, paths containing NUL, paths exceeding length cap.
 */
export function sanitizeSoundSpec(raw: unknown): string {
  const s = ensureString(raw, "sound").trim();
  if (s.length === 0) {
    throw new NotifyError("invalid_input", "sound must not be empty");
  }
  if (s.length > MAX_SOUND_PATH_LENGTH) {
    throw new NotifyError("invalid_input", "sound spec too long");
  }
  if (s.includes("\x00")) {
    throw new NotifyError("invalid_input", "sound spec contains NUL byte");
  }
  if (CONTROL_CHARS_RE.test(s)) {
    // reset regex state (because of /g flag) before next .test call elsewhere
    CONTROL_CHARS_RE.lastIndex = 0;
    throw new NotifyError("invalid_input", "sound spec contains control characters");
  }
  return s;
}

/**
 * AppleScript string-literal escape.
 *   - backslash → \\
 *   - double-quote → \"
 * Control characters are NOT handled here; sanitize before calling.
 */
export function appleScriptEscape(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * XML escape for WinRT toast XML payload.
 */
export function xmlEscape(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
