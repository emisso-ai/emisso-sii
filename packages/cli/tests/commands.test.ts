import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { validateRut, formatRut } from "@emisso/sii";
import { makeTestRenderer, OutputRenderer } from "@emisso/cli-core";

describe("RUT commands", () => {
  it("validates a valid RUT", () => {
    expect(validateRut("76123456-0")).toBe(true);
  });

  it("validates an invalid RUT", () => {
    expect(validateRut("76123456-K")).toBe(false);
  });

  it("formats a RUT removing dots", () => {
    expect(formatRut("76.123.456-0")).toBe("76123456-0");
  });

  it("formats a RUT removing spaces", () => {
    expect(formatRut(" 76123456-0 ")).toBe("76123456-0");
  });
});

describe("OutputRenderer integration", () => {
  it("captures rendered output via makeTestRenderer", async () => {
    const { stdout, layer } = makeTestRenderer();

    const program = Effect.gen(function* () {
      const renderer = yield* OutputRenderer;
      yield* renderer.renderSuccess({ test: true }, 100);
    });

    await Effect.runPromise(Effect.provide(program, layer));

    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.test).toBe(true);
    expect(parsed.meta.duration_ms).toBe(100);
  });
});
