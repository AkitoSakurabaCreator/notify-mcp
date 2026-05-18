import { describe, it, expect } from "vitest";

import { listSystemSounds, playSound, SYSTEM_SOUNDS } from "../src/sound.js";
import { getPlatform } from "../src/platform.js";

describe("listSystemSounds", () => {
  it("returns the current platform allowlist", () => {
    const r = listSystemSounds();
    expect(r.platform).toBe(getPlatform());
    expect(Array.isArray(r.sounds)).toBe(true);
    expect(r.sounds.length).toBeGreaterThan(0);
    for (const s of r.sounds) {
      expect((SYSTEM_SOUNDS[r.platform] as readonly string[]).includes(s)).toBe(true);
    }
  });
});

describe("playSound input validation", () => {
  it("rejects relative file paths", async () => {
    const r = await playSound("relative/path.wav");
    expect(r.played).toBe(false);
    if (!r.played) expect(r.reason).toMatch(/absolute/);
  });

  it("rejects non-existent absolute file", async () => {
    const r = await playSound("/definitely/does/not/exist/__notify_mcp_test__.wav");
    expect(r.played).toBe(false);
    if (!r.played) expect(r.reason).toMatch(/not found/);
  });

  it("rejects unknown system sound", async () => {
    const r = await playSound("system:__DefinitelyNotASystemSound__");
    expect(r.played).toBe(false);
    if (!r.played) expect(r.reason).toMatch(/unknown system sound/);
  });

  it("rejects NUL byte in path", async () => {
    await expect(playSound("/tmp/foo\x00.wav")).rejects.toThrow();
  });
});
