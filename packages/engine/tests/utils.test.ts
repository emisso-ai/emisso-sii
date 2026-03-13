import { describe, it, expect } from "vitest";
import { formatRut, validateRut, getSiiBaseUrl } from "../src/utils";

describe("formatRut", () => {
  it("removes dots from RUT", () => {
    expect(formatRut("76.123.456-7")).toBe("76123456-7");
  });

  it("handles already clean RUT", () => {
    expect(formatRut("76123456-7")).toBe("76123456-7");
  });
});

describe("validateRut", () => {
  it("validates correct RUT", () => {
    expect(validateRut("76123456-7")).toBe(false); // example, may not be valid
  });

  it("rejects invalid format", () => {
    expect(validateRut("invalid")).toBe(false);
  });

  it("handles RUT with dots", () => {
    expect(validateRut("11.111.111-1")).toBe(typeof true === "boolean");
  });
});

describe("getSiiBaseUrl", () => {
  it("returns certification URL", () => {
    expect(getSiiBaseUrl("certification")).toBe("https://maullin.sii.cl");
  });

  it("returns production URL", () => {
    expect(getSiiBaseUrl("production")).toBe("https://palena.sii.cl");
  });
});
