import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistryCache, type RegistryCache } from "./cache";
import type { ChileanCompany } from "./types";

function makeCompany(overrides: Partial<ChileanCompany> = {}): ChileanCompany {
  return {
    rut: "76543210-K",
    razonSocial: "ACME SpA",
    rubroDescripcion: "Software",
    comuna: "Las Condes",
    region: "Metropolitana",
    fuentes: [],
    signals: {},
    score: 50,
    ...overrides,
  };
}

let cache: RegistryCache;

beforeEach(() => {
  cache = createRegistryCache(":memory:");
});

afterEach(() => {
  cache.close();
});

describe("RegistryCache", () => {
  it("upserts and reads back a company", () => {
    const c = makeCompany();
    cache.upsertCompany(c);
    expect(cache.getCompany("76543210-K")).toEqual(c);
  });

  it("filters by comuna", () => {
    cache.upsertCompany(makeCompany({ rut: "1-9", comuna: "Las Condes" }));
    cache.upsertCompany(makeCompany({ rut: "2-7", comuna: "Providencia" }));
    cache.upsertCompany(makeCompany({ rut: "3-5", comuna: "Maipú" }));
    const matches = cache.findCompanies({ comunas: ["Las Condes", "Providencia"] });
    expect(matches).toHaveLength(2);
  });

  it("filters by signals", () => {
    cache.upsertCompany(
      makeCompany({ rut: "1-9", signals: { vendeAlEstado: true } }),
    );
    cache.upsertCompany(makeCompany({ rut: "2-7", signals: {} }));
    const matches = cache.findCompanies({ signals: { vendeAlEstado: true } });
    expect(matches).toHaveLength(1);
    expect(matches[0].rut).toBe("1-9");
  });

  it("orders by score desc and respects limit", () => {
    cache.upsertCompany(makeCompany({ rut: "1-9", score: 30 }));
    cache.upsertCompany(makeCompany({ rut: "2-7", score: 90 }));
    cache.upsertCompany(makeCompany({ rut: "3-5", score: 60 }));
    const matches = cache.findCompanies({ limit: 2 });
    expect(matches.map((c) => c.rut)).toEqual(["2-7", "3-5"]);
  });

  it("excludes rubros via NOT LIKE", () => {
    cache.upsertCompany(makeCompany({ rut: "1-9", rubroDescripcion: "Software" }));
    cache.upsertCompany(
      makeCompany({ rut: "2-7", rubroDescripcion: "Construcción" }),
    );
    const matches = cache.findCompanies({ rubrosExcluye: ["construc"] });
    expect(matches.map((c) => c.rut)).toEqual(["1-9"]);
  });

  it("counts respecting filters", () => {
    cache.upsertCompany(makeCompany({ rut: "1-9", score: 30 }));
    cache.upsertCompany(makeCompany({ rut: "2-7", score: 90 }));
    expect(cache.countCompanies({ scoreMin: 50 })).toBe(1);
    expect(cache.countCompanies()).toBe(2);
  });

  it("stores and reads source hits", () => {
    cache.upsertSourceHit(
      "1-9",
      "empresas-en-un-dia",
      { rut: "1-9", razonSocial: "X" },
      "fp1",
    );
    cache.upsertSourceHit("1-9", "sofofa", { rut: "1-9", sitioWeb: "x.cl" }, "fp2");
    const hits = cache.getSourcePartials("1-9");
    expect(hits.size).toBe(2);
    expect(hits.get("sofofa")?.sitioWeb).toBe("x.cl");
  });
});
