import { describe, it, expect } from "vitest";

import {
  appleScriptEscape,
  MAX_MESSAGE_LENGTH,
  MAX_TITLE_LENGTH,
  sanitizeMessage,
  sanitizeSoundSpec,
  sanitizeTitle,
  stripControlChars,
  xmlEscape,
} from "../src/sanitize.js";
import { NotifyError } from "../src/errors.js";

describe("stripControlChars", () => {
  it("removes NUL and other control bytes but keeps TAB/LF/CR", () => {
    const raw = "a\x00b\x01c\td\ne\rf\x7Fg";
    expect(stripControlChars(raw)).toBe("abc\td\ne\rfg");
  });
});

describe("sanitizeTitle", () => {
  it("trims and strips control chars", () => {
    expect(sanitizeTitle("  hi\x00world  ")).toBe("hiworld");
  });

  it("rejects non-string", () => {
    expect(() => sanitizeTitle(undefined as unknown as string)).toThrow(NotifyError);
    expect(() => sanitizeTitle(42 as unknown as string)).toThrow(NotifyError);
  });

  it("rejects empty after sanitization", () => {
    expect(() => sanitizeTitle("\x00\x01")).toThrow(/empty/);
    expect(() => sanitizeTitle("   ")).toThrow(/empty/);
  });

  it("truncates to MAX_TITLE_LENGTH", () => {
    const long = "a".repeat(MAX_TITLE_LENGTH + 50);
    expect(sanitizeTitle(long).length).toBe(MAX_TITLE_LENGTH);
  });
});

describe("sanitizeMessage", () => {
  it("preserves newlines", () => {
    expect(sanitizeMessage("hello\nworld")).toBe("hello\nworld");
  });

  it("strips control chars but keeps tab/lf/cr", () => {
    expect(sanitizeMessage("a\x01b\tc\nd")).toBe("ab\tc\nd");
  });

  it("rejects empty", () => {
    expect(() => sanitizeMessage("   ")).toThrow(/empty/);
  });

  it("truncates to MAX_MESSAGE_LENGTH", () => {
    const long = "x".repeat(MAX_MESSAGE_LENGTH + 100);
    expect(sanitizeMessage(long).length).toBe(MAX_MESSAGE_LENGTH);
  });
});

describe("sanitizeSoundSpec", () => {
  it("accepts system:NAME", () => {
    expect(sanitizeSoundSpec("system:Ping")).toBe("system:Ping");
  });

  it("accepts absolute path", () => {
    expect(sanitizeSoundSpec("/tmp/foo.wav")).toBe("/tmp/foo.wav");
  });

  it("rejects NUL", () => {
    expect(() => sanitizeSoundSpec("/tmp/foo\x00.wav")).toThrow(/NUL/);
  });

  it("rejects control chars", () => {
    expect(() => sanitizeSoundSpec("/tmp/foo\x01.wav")).toThrow(/control/);
  });

  it("rejects empty", () => {
    expect(() => sanitizeSoundSpec("   ")).toThrow(/empty/);
  });

  it("rejects too long", () => {
    expect(() => sanitizeSoundSpec("/" + "a".repeat(2000))).toThrow(/too long/);
  });
});

describe("appleScriptEscape", () => {
  it("escapes backslash and double-quote", () => {
    expect(appleScriptEscape('he said "hi"\\bye')).toBe('he said \\"hi\\"\\\\bye');
  });

  it("does not touch other characters", () => {
    expect(appleScriptEscape("plain text 123 +-*/")).toBe("plain text 123 +-*/");
  });
});

describe("xmlEscape", () => {
  it("escapes the five special characters", () => {
    expect(xmlEscape(`<a href="x" attr='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; attr=&apos;y&apos;&gt;&amp;&lt;/a&gt;",
    );
  });
});
