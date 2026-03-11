import { describe, it, expect } from "vitest";
import { parseCaf } from "../src/folios";

describe("folios", () => {
  it("parseCaf throws not implemented", async () => {
    await expect(parseCaf("<CAF></CAF>")).rejects.toThrow("Not implemented");
  });
});
