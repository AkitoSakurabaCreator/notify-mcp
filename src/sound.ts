import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { getPlatform, type SupportedPlatform } from "./platform.js";
import { safeErrorMessage } from "./errors.js";
import { sanitizeSoundSpec } from "./sanitize.js";

const execFileP = promisify(execFile);

const MAX_SOUND_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const SOUND_TIMEOUT_MS = 10_000;

/**
 * Allowlist of system sounds per platform.
 *
 * macOS: files under /System/Library/Sounds/*.aiff (Apple-built-in)
 * win32: System.Media.SystemSounds members
 * linux: libcanberra event IDs (only used if canberra-gtk-play is available)
 */
export const SYSTEM_SOUNDS: Record<SupportedPlatform, readonly string[]> = {
  darwin: [
    "Basso",
    "Blow",
    "Bottle",
    "Frog",
    "Funk",
    "Glass",
    "Hero",
    "Morse",
    "Ping",
    "Pop",
    "Purr",
    "Sosumi",
    "Submarine",
    "Tink",
  ],
  win32: ["Beep", "Asterisk", "Exclamation", "Hand", "Question"],
  linux: ["bell", "message", "complete", "alarm", "dialog-warning"],
} as const;

export type PlaySoundResult = { played: true; method: string } | { played: false; reason: string };

export function listSystemSounds(): { platform: SupportedPlatform; sounds: string[] } {
  const platform = getPlatform();
  return { platform, sounds: [...SYSTEM_SOUNDS[platform]] };
}

export async function playSound(rawSpec: string): Promise<PlaySoundResult> {
  const spec = sanitizeSoundSpec(rawSpec);
  const platform = getPlatform();

  if (spec.startsWith("system:")) {
    const name = spec.slice("system:".length);
    return playSystemSound(platform, name);
  }
  return playFileSound(platform, spec);
}

async function playSystemSound(
  platform: SupportedPlatform,
  name: string,
): Promise<PlaySoundResult> {
  if (!(SYSTEM_SOUNDS[platform] as readonly string[]).includes(name)) {
    return {
      played: false,
      reason: `unknown system sound for ${platform}: "${name}". See list_sounds.`,
    };
  }

  try {
    if (platform === "darwin") {
      const file = `/System/Library/Sounds/${name}.aiff`;
      await execFileP("/usr/bin/afplay", [file], { timeout: SOUND_TIMEOUT_MS });
      return { played: true, method: "afplay" };
    }
    if (platform === "win32") {
      // Static script — no untrusted interpolation. The system sound name is
      // already validated against an allowlist above, so embedding it as a
      // literal is safe.
      const script = `[System.Media.SystemSounds]::${name}.Play(); Start-Sleep -Milliseconds 500`;
      await execFileP(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        { timeout: SOUND_TIMEOUT_MS },
      );
      return { played: true, method: "powershell-system-sound" };
    }
    // linux
    const eventId =
      (
        { bell: "bell", message: "message-new-instant", complete: "complete" } as Record<
          string,
          string
        >
      )[name] ?? name;
    await execFileP("canberra-gtk-play", ["--id", eventId], {
      timeout: SOUND_TIMEOUT_MS,
    });
    return { played: true, method: "canberra-gtk-play" };
  } catch (e) {
    return { played: false, reason: safeErrorMessage(e) };
  }
}

async function playFileSound(
  platform: SupportedPlatform,
  soundPath: string,
): Promise<PlaySoundResult> {
  if (!path.isAbsolute(soundPath)) {
    return {
      played: false,
      reason: 'sound path must be absolute or use "system:NAME" form',
    };
  }
  const resolved = path.resolve(soundPath);

  if (!existsSync(resolved)) {
    return { played: false, reason: "sound file not found" };
  }
  let st;
  try {
    st = statSync(resolved);
  } catch (e) {
    return { played: false, reason: safeErrorMessage(e) };
  }
  if (!st.isFile()) {
    return { played: false, reason: "sound path is not a regular file" };
  }
  if (st.size > MAX_SOUND_FILE_BYTES) {
    return { played: false, reason: `sound file too large (>${MAX_SOUND_FILE_BYTES} bytes)` };
  }

  try {
    if (platform === "darwin") {
      await execFileP("/usr/bin/afplay", [resolved], { timeout: SOUND_TIMEOUT_MS });
      return { played: true, method: "afplay" };
    }
    if (platform === "win32") {
      // SECURITY: never interpolate the path into the PowerShell script.
      // Pass it via an environment variable, and reference it as
      // `$env:NOTIFY_SOUND_PATH` in a fixed script string.
      const script =
        "$p=$env:NOTIFY_SOUND_PATH; if(-not(Test-Path -LiteralPath $p)){exit 2}; (New-Object System.Media.SoundPlayer $p).PlaySync()";
      await execFileP(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        {
          timeout: SOUND_TIMEOUT_MS,
          env: { ...process.env, NOTIFY_SOUND_PATH: resolved },
        },
      );
      return { played: true, method: "powershell-soundplayer" };
    }
    // linux: try paplay, then aplay
    try {
      await execFileP("paplay", [resolved], { timeout: SOUND_TIMEOUT_MS });
      return { played: true, method: "paplay" };
    } catch {
      await execFileP("aplay", ["-q", resolved], { timeout: SOUND_TIMEOUT_MS });
      return { played: true, method: "aplay" };
    }
  } catch (e) {
    return { played: false, reason: safeErrorMessage(e) };
  }
}

// re-export for tests
export { MAX_SOUND_FILE_BYTES, SOUND_TIMEOUT_MS };
export type { SupportedPlatform };

// expose for unit testing without depending on real OS
export const _internal = {
  playSystemSound,
  playFileSound,
};
