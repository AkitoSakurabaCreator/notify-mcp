import { describe, it, expect } from "vitest";

import { createServer, SERVER_NAME, SERVER_VERSION } from "../src/server.js";

describe("createServer", () => {
  it("returns a server with name/version configured", () => {
    const s = createServer();
    expect(s).toBeDefined();
    expect(SERVER_NAME).toBe("notify-mcp");
    expect(SERVER_VERSION).toBe("0.1.0");
  });

  it("can be created multiple times without error", () => {
    expect(() => {
      createServer();
      createServer();
    }).not.toThrow();
  });
});
