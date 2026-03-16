import { describe, expect, it } from "vitest";
import { parsePeriod, effectifyConfig } from "../src/utils";
import { CliError } from "@emisso/cli-core";
import { Effect } from "effect";

describe("parsePeriod", () => {
  it("parses a valid period", () => {
    expect(parsePeriod("2024-03")).toEqual({ year: 2024, month: 3 });
  });

  it("parses January", () => {
    expect(parsePeriod("2024-01")).toEqual({ year: 2024, month: 1 });
  });

  it("parses December", () => {
    expect(parsePeriod("2024-12")).toEqual({ year: 2024, month: 12 });
  });

  it("throws on invalid format (no dash)", () => {
    expect(() => parsePeriod("202403")).toThrow("Invalid period format");
  });

  it("throws on invalid format (single digit month)", () => {
    expect(() => parsePeriod("2024-3")).toThrow("Invalid period format");
  });

  it("throws on month 00", () => {
    expect(() => parsePeriod("2024-00")).toThrow("Invalid month: 0");
  });

  it("throws on month 13", () => {
    expect(() => parsePeriod("2024-13")).toThrow("Invalid month: 13");
  });

  it("throws on year below 2000", () => {
    expect(() => parsePeriod("1999-06")).toThrow("Invalid year: 1999");
  });

  it("throws on year above 2100", () => {
    expect(() => parsePeriod("2101-06")).toThrow("Invalid year: 2101");
  });

  it("accepts boundary year 2000", () => {
    expect(parsePeriod("2000-01")).toEqual({ year: 2000, month: 1 });
  });

  it("accepts boundary year 2100", () => {
    expect(parsePeriod("2100-12")).toEqual({ year: 2100, month: 12 });
  });
});

describe("effectifyConfig", () => {
  it("returns the value on success", async () => {
    const result = await Effect.runPromise(effectifyConfig(() => 42));
    expect(result).toBe(42);
  });

  it("converts CliError throws to Effect failures", async () => {
    const error = new CliError({ kind: "bad-args", message: "test" });
    const result = await Effect.runPromiseExit(effectifyConfig(() => { throw error; }));
    expect(result._tag).toBe("Failure");
  });

  it("rethrows non-CliError exceptions", async () => {
    await expect(
      Effect.runPromise(effectifyConfig(() => { throw new Error("unexpected"); })),
    ).rejects.toThrow("unexpected");
  });
});
