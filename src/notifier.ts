import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getPlatform, type SupportedPlatform } from "./platform.js";
import { safeErrorMessage } from "./errors.js";
import {
  appleScriptEscape,
  sanitizeMessage,
  sanitizeTitle,
  sanitizeSoundSpec,
  xmlEscape,
} from "./sanitize.js";
import { playSound, type PlaySoundResult } from "./sound.js";

const execFileP = promisify(execFile);
const NOTIFY_TIMEOUT_MS = 5_000;

export type Urgency = "low" | "normal" | "critical";

export interface NotifyInput {
  title: string;
  message: string;
  urgency?: Urgency;
  sound?: string;
}

export interface NotifyResult {
  delivered: boolean;
  platform: SupportedPlatform;
  method: string;
  reason?: string;
  sound?: PlaySoundResult;
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const platform = getPlatform();
  const title = sanitizeTitle(input.title);
  const message = sanitizeMessage(input.message);
  const urgency: Urgency = input.urgency ?? "normal";
  const soundSpec = input.sound !== undefined ? sanitizeSoundSpec(input.sound) : undefined;

  let result: NotifyResult;

  switch (platform) {
    case "darwin":
      result = await notifyDarwin(platform, title, message);
      break;
    case "win32":
      result = await notifyWindows(platform, title, message);
      break;
    case "linux":
      result = await notifyLinux(platform, title, message, urgency);
      break;
  }

  if (soundSpec) {
    const sr = await playSound(soundSpec);
    result.sound = sr;
  }

  return result;
}

async function notifyDarwin(
  platform: SupportedPlatform,
  title: string,
  message: string,
): Promise<NotifyResult> {
  // AppleScript "display notification" requires literal string escaping for
  // backslash + double-quote. We pre-sanitized control chars in sanitize.ts.
  const t = appleScriptEscape(title);
  const m = appleScriptEscape(message);
  const script = `display notification "${m}" with title "${t}"`;

  try {
    await execFileP("/usr/bin/osascript", ["-e", script], { timeout: NOTIFY_TIMEOUT_MS });
    return { delivered: true, platform, method: "osascript" };
  } catch (e) {
    return {
      delivered: false,
      platform,
      method: "osascript",
      reason: safeErrorMessage(e),
    };
  }
}

/**
 * Windows: use a tiny PowerShell script that reads the title/message from
 * environment variables, builds a Toast XML, and sends it through WinRT.
 * The script body is a fixed literal — no untrusted interpolation.
 */
const WIN_TOAST_SCRIPT = `
$ErrorActionPreference = 'Stop'
$title = $env:NOTIFY_TITLE
$msg = $env:NOTIFY_MESSAGE
[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom.XmlDocument,ContentType=WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$payload = "<toast><visual><binding template='ToastGeneric'><text>$title</text><text>$msg</text></binding></visual></toast>"
$xml.LoadXml($payload)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('notify-mcp').Show($toast)
`.trim();

async function notifyWindows(
  platform: SupportedPlatform,
  title: string,
  message: string,
): Promise<NotifyResult> {
  // The values are XML-escaped here, NOT in PowerShell, so the literal in
  // env vars is a valid XML inner-text fragment.
  const xmlTitle = xmlEscape(title);
  const xmlMessage = xmlEscape(message);

  try {
    await execFileP(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WIN_TOAST_SCRIPT],
      {
        timeout: NOTIFY_TIMEOUT_MS,
        env: {
          ...process.env,
          NOTIFY_TITLE: xmlTitle,
          NOTIFY_MESSAGE: xmlMessage,
        },
      },
    );
    return { delivered: true, platform, method: "powershell-winrt-toast" };
  } catch (e) {
    return {
      delivered: false,
      platform,
      method: "powershell-winrt-toast",
      reason: safeErrorMessage(e),
    };
  }
}

async function notifyLinux(
  platform: SupportedPlatform,
  title: string,
  message: string,
  urgency: Urgency,
): Promise<NotifyResult> {
  const args = ["--urgency", urgency, "--app-name=notify-mcp", title, message];
  try {
    await execFileP("notify-send", args, { timeout: NOTIFY_TIMEOUT_MS });
    return { delivered: true, platform, method: "notify-send" };
  } catch (e) {
    return {
      delivered: false,
      platform,
      method: "notify-send",
      reason: safeErrorMessage(e),
    };
  }
}

// exposed for unit testing
export const _internal = {
  notifyDarwin,
  notifyWindows,
  notifyLinux,
  WIN_TOAST_SCRIPT,
};
