import { describe, it, expect } from "vitest";
import { queryUploadStatus } from "../src/estado";

describe("estado", () => {
  it("queryUploadStatus throws not implemented", async () => {
    await expect(
      queryUploadStatus("123", { token: "test", expiresAt: new Date() }, {
        certPath: "./test.p12",
        certPassword: "test",
        env: "certification",
      })
    ).rejects.toThrow("Not implemented");
  });
});
