import { describe, expect, it } from "vitest";
import { mergeCompany } from "./merge";
import type { SourceHit, SourceId, SourcePartial } from "./types";

function hits(...sources: SourceId[]): SourceHit[] {
  return sources.map((s) => ({
    source: s,
    fetchedAt: new Date().toISOString(),
    fingerprint: "test",
  }));
}

describe("mergeCompany", () => {
  it("returns canonical RUT and razon social fallback", () => {
    const partials = new Map<SourceId, SourcePartial>([
      ["empresas-en-un-dia", { rut: "76543210-K", razonSocial: "ACME SpA" }],
    ]);
    const merged = mergeCompany({
      rut: "76543210-K",
      partials,
      hits: hits("empresas-en-un-dia"),
    });
    expect(merged.rut).toBe("76543210-K");
    expect(merged.razonSocial).toBe("ACME SpA");
  });

  it("applies field precedence: most-trusted source wins", () => {
    const partials = new Map<SourceId, SourcePartial>([
      ["empresas-en-un-dia", { rut: "1-9", razonSocial: "Old Name" }],
      ["sii-stc", { rut: "1-9", razonSocial: "Canonical Name" }],
    ]);
    const merged = mergeCompany({
      rut: "1-9",
      partials,
      hits: hits("empresas-en-un-dia", "sii-stc"),
    });
    expect(merged.razonSocial).toBe("Canonical Name");
  });

  it("derives signals from source presence", () => {
    const partials = new Map<SourceId, SourcePartial>([
      ["sofofa", { rut: "1-9" }],
      ["chilecompra", { rut: "1-9" }],
      ["cmf", { rut: "1-9" }],
    ]);
    const merged = mergeCompany({
      rut: "1-9",
      partials,
      hits: hits("sofofa", "chilecompra", "cmf"),
    });
    expect(merged.signals.socioSofofa).toBe(true);
    expect(merged.signals.venceAlEstado).toBe(true);
    expect(merged.signals.emisorRegulado).toBe(true);
  });

  it("takes max of montoAdjudicadoMaxAnual across hits", () => {
    const partials = new Map<SourceId, SourcePartial>([
      ["chilecompra", { rut: "1-9", signals: { montoAdjudicadoMaxAnual: 100_000 } }],
      ["empresas-en-un-dia", { rut: "1-9", signals: { montoAdjudicadoMaxAnual: 500_000 } }],
    ]);
    const merged = mergeCompany({
      rut: "1-9",
      partials,
      hits: hits("chilecompra", "empresas-en-un-dia"),
    });
    expect(merged.signals.montoAdjudicadoMaxAnual).toBe(500_000);
  });

  it("scores higher with more sources and signals", () => {
    const minimal = mergeCompany({
      rut: "1-9",
      partials: new Map([["empresas-en-un-dia", { rut: "1-9", razonSocial: "X" }]]),
      hits: hits("empresas-en-un-dia"),
    });
    const rich = mergeCompany({
      rut: "1-9",
      partials: new Map<SourceId, SourcePartial>([
        ["empresas-en-un-dia", { rut: "1-9", razonSocial: "X" }],
        ["cmf", { rut: "1-9", dotacionAprox: 250 }],
        ["sofofa", { rut: "1-9" }],
        ["chilecompra", {
          rut: "1-9",
          signals: { montoAdjudicadoMaxAnual: 2_000_000_000 },
        }],
      ]),
      hits: hits("empresas-en-un-dia", "cmf", "sofofa", "chilecompra"),
    });
    expect(rich.score).toBeGreaterThan(minimal.score);
    expect(rich.score).toBeLessThanOrEqual(100);
  });
});
