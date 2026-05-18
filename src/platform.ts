import os from "node:os";

export type SupportedPlatform = "darwin" | "win32" | "linux";

/**
 * Detect current platform.
 * Throws if running on an unsupported OS (e.g. aix, freebsd, sunos, openbsd).
 */
export function getPlatform(): SupportedPlatform {
  const p = os.platform();
  if (p === "darwin" || p === "win32" || p === "linux") return p;
  throw new Error(`notify-mcp: unsupported platform "${p}". Supported: darwin, win32, linux.`);
}

export function isSupportedPlatform(p: string): p is SupportedPlatform {
  return p === "darwin" || p === "win32" || p === "linux";
}
