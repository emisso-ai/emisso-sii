import { describe, it, expect } from "vitest";
import { authenticate } from "../src/auth";

describe("auth", () => {
  it("authenticate throws not implemented", async () => {
    await expect(
      authenticate({
        certPath: "./test.p12",
        certPassword: "test",
        env: "certification",
      })
    ).rejects.toThrow("Not implemented");
  });
});
