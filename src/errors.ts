/**
 * Structured error class used inside notify-mcp.
 * Carries a stable error code so MCP clients can branch on it,
 * while keeping internal details (stack traces, raw subprocess output)
 * out of the message returned to the LLM.
 */
export class NotifyError extends Error {
  public readonly code: NotifyErrorCode;

  constructor(code: NotifyErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "NotifyError";
  }
}

export type NotifyErrorCode =
  | "invalid_input"
  | "unsupported_platform"
  | "subprocess_failed"
  | "timeout"
  | "sound_not_found"
  | "sound_too_large"
  | "internal";

/** Convert unknown thrown value into a user-safe message. */
export function safeErrorMessage(e: unknown): string {
  if (e instanceof NotifyError) return e.message;
  if (e instanceof Error) {
    // strip stack info, keep only message
    return e.message.split("\n")[0] ?? "unknown error";
  }
  return "unknown error";
}
