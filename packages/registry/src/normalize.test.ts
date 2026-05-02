import { describe, expect, it } from "vitest";
import {
  canonicalizeRut,
  computeRutVerifier,
  fingerprint,
  headcountToSizeTier,
  isValidRut,
  sizeTierAtLeast,
  sizeTierAtMost,
  titleCaseEs,
  tramoToSizeTier,
} from "./normalize";

describe("canonicalizeRut", () => {
  it.each([
    ["76.543.210-3", "76543210-3"],
    ["76543210-3", "76543210-3"],
    ["123456785", "12345678-5"],
    ["1-9", "1-9"],
    ["12345678-5", "12345678-5"],
  ])("normalizes %s → %s", (input, expected) => {
    expect(canonicalizeRut(input)).toBe(expected);
  });

  it("rejects empty input", () => {
    expect(() => canonicalizeRut("")).toThrow();
  });

  it("rejects bad format", () => {
    expect(() => canonicalizeRut("not-a-rut")).toThrow(/Invalid RUT format/);
  });

  it("rejects bad check digit", () => {
    expect(() => canonicalizeRut("76543210-9")).toThrow(/check digit mismatch/);
  });
});

describe("isValidRut", () => {
  it("returns true for valid RUTs", () => {
    expect(isValidRut("76.543.210-3")).toBe(true);
    expect(isValidRut("1-9")).toBe(true);
  });
  it("returns false for invalid RUTs", () => {
    expect(isValidRut("not-a-rut")).toBe(false);
    expect(isValidRut("76543210-1")).toBe(false);
  });
});

describe("computeRutVerifier", () => {
  it.each([
    ["76543210", "3"],
    ["1", "9"],
    ["12345678", "5"],
  ])("computes verifier for %s → %s", (body, expected) => {
    expect(computeRutVerifier(body)).toBe(expected);
  });
});

describe("titleCaseEs", () => {
  it.each([
    ["LAS CONDES", "Las Condes"],
    ["providencia", "Providencia"],
    ["  ÑUÑOA  ", "Ñuñoa"],
  ])("title-cases %s → %s", (input, expected) => {
    expect(titleCaseEs(input)).toBe(expected);
  });

  it("handles undefined", () => {
    expect(titleCaseEs(undefined)).toBeUndefined();
  });
});

describe("tramoToSizeTier", () => {
  it.each([
    ["1.1", "micro"],
    ["1.2", "micro"],
    ["2.1", "pequeña"],
    ["3.4", "mediana"],
    ["4.1", "grande"],
    ["5.4", "grande"],
  ] as const)("maps tramo %s → %s", (tramo, expected) => {
    expect(tramoToSizeTier(tramo)).toBe(expected);
  });

  it("returns undefined for unknown", () => {
    expect(tramoToSizeTier(undefined)).toBeUndefined();
    expect(tramoToSizeTier("9.9")).toBeUndefined();
  });
});

describe("headcountToSizeTier", () => {
  it.each([
    [5, "micro"],
    [25, "pequeña"],
    [100, "mediana"],
    [500, "grande"],
  ] as const)("maps headcount %d → %s", (n, expected) => {
    expect(headcountToSizeTier(n)).toBe(expected);
  });
});

describe("size tier comparators", () => {
  it("sizeTierAtLeast", () => {
    expect(sizeTierAtLeast("mediana", "pequeña")).toBe(true);
    expect(sizeTierAtLeast("micro", "mediana")).toBe(false);
    expect(sizeTierAtLeast(undefined, "micro")).toBe(false);
  });
  it("sizeTierAtMost", () => {
    expect(sizeTierAtMost("pequeña", "mediana")).toBe(true);
    expect(sizeTierAtMost("grande", "mediana")).toBe(false);
  });
});

describe("fingerprint", () => {
  it("is stable across key order", () => {
    const a = fingerprint({ x: 1, y: 2 });
    const b = fingerprint({ y: 2, x: 1 });
    expect(a).toBe(b);
  });
  it("changes when payload changes", () => {
    const a = fingerprint({ x: 1 });
    const b = fingerprint({ x: 2 });
    expect(a).not.toBe(b);
  });
});
