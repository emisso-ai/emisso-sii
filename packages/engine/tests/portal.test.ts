import { describe, it, expect, vi } from "vitest";
import { splitRut, getPortalBaseUrl } from "../src/utils";
import { PortalConfigSchema } from "../src/types";

describe("portal", () => {
  describe("splitRut", () => {
    it("splits RUT with dash", () => {
      const { rutBody, dv } = splitRut("76123456-7");
      expect(rutBody).toBe("76123456");
      expect(dv).toBe("7");
    });

    it("splits RUT with dots and dash", () => {
      const { rutBody, dv } = splitRut("76.123.456-7");
      expect(rutBody).toBe("76123456");
      expect(dv).toBe("7");
    });

    it("handles K as DV", () => {
      const { rutBody, dv } = splitRut("12345678-K");
      expect(rutBody).toBe("12345678");
      expect(dv).toBe("K");
    });

    it("throws on invalid RUT", () => {
      expect(() => splitRut("invalid")).toThrow("Invalid RUT format");
    });
  });

  describe("getPortalBaseUrl", () => {
    it("returns homer for production", () => {
      expect(getPortalBaseUrl("production")).toBe("https://homer.sii.cl");
    });

    it("returns zeusr for certification", () => {
      expect(getPortalBaseUrl("certification")).toBe("https://zeusr.sii.cl");
    });
  });

  describe("PortalConfigSchema", () => {
    it("validates correct config", () => {
      const result = PortalConfigSchema.safeParse({
        rut: "76123456-7",
        claveTributaria: "mypassword",
        env: "certification",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing fields", () => {
      const result = PortalConfigSchema.safeParse({
        rut: "76123456-7",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid env", () => {
      const result = PortalConfigSchema.safeParse({
        rut: "76123456-7",
        claveTributaria: "pass",
        env: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe.skipIf(!process.env.SII_PORTAL_RUT)("integration: SII portal auth", () => {
  it("logs into SII portal", async () => {
    const { portalLogin } = await import("../src/portal");
    const session = await portalLogin({
      rut: process.env.SII_PORTAL_RUT!,
      claveTributaria: process.env.SII_PORTAL_PASSWORD!,
      env: "certification",
    });
    expect(session.isAuthenticated).toBe(true);
  });
});
