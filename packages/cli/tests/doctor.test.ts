import { describe, expect, it } from "vitest";

describe("Doctor checks structure", () => {
  it("Node.js version is >= 18", () => {
    const nodeMajor = parseInt(process.version.slice(1), 10);
    expect(nodeMajor).toBeGreaterThanOrEqual(18);
  });

  it("@emisso/sii can be imported", async () => {
    const sii = await import("@emisso/sii");
    expect(sii).toBeDefined();
    expect(sii.validateRut).toBeTypeOf("function");
    expect(sii.formatRut).toBeTypeOf("function");
    expect(sii.loadCertFromFile).toBeTypeOf("function");
    expect(sii.authenticate).toBeTypeOf("function");
  });

  it("node-forge can be imported", async () => {
    const forge = await import("node-forge");
    expect(forge).toBeDefined();
    expect(forge.pki).toBeDefined();
  });
});
