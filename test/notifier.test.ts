import { describe, it, expect } from "vitest";

import { _internal } from "../src/notifier.js";

describe("Windows toast script integrity", () => {
  it("does NOT interpolate the title/message into the script body", () => {
    const script = _internal.WIN_TOAST_SCRIPT;
    expect(script).toContain("$env:NOTIFY_TITLE");
    expect(script).toContain("$env:NOTIFY_MESSAGE");
    // belt-and-suspenders: no obvious injection markers
    expect(script).not.toMatch(/\$\{/);
  });

  it("uses ToastNotificationManager API", () => {
    const script = _internal.WIN_TOAST_SCRIPT;
    expect(script).toContain("ToastNotificationManager");
    expect(script).toContain("ToastNotification");
    expect(script).toContain("notify-mcp");
  });
});
