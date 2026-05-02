import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChileCompraApiError,
  createChileCompraAdapter,
  toApiDate,
} from "./chilecompra";
import type { SourcePartial } from "../types";

// ---------------------------------------------------------------------------
// Fixtures (shape verified against gepd/MercadoPublico types.d.ts:72-101)
// ---------------------------------------------------------------------------

const TICKET = "test-ticket-abc123";
const BASE_URL = "https://api.test.invalid/servicios/v1/publico/";

interface OcListadoItem {
  Codigo: string;
  Nombre: string;
  TotalNeto?: number;
  Total?: number;
  Fechas?: { FechaEnvio?: string; FechaAceptacion?: string };
  Proveedor: { Codigo: string; Nombre: string };
}

interface OcResponse {
  Cantidad: number;
  FechaCreacion?: string;
  Listado: OcListadoItem[];
}

function ocResponse(items: OcListadoItem[]): OcResponse {
  return {
    Cantidad: items.length,
    FechaCreacion: "2026-05-01T00:00:00Z",
    Listado: items,
  };
}

const ACME_DAY1 = ocResponse([
  {
    Codigo: "734-1-SE26",
    Nombre: "Suministro de papelería",
    Total: 1_190_000,
    TotalNeto: 1_000_000,
    Fechas: { FechaEnvio: "2026-04-15T09:00:00", FechaAceptacion: "2026-04-15T10:00:00" },
    Proveedor: { Codigo: "76543210-3", Nombre: "ACME SpA" },
  },
  {
    Codigo: "734-2-SE26",
    Nombre: "Servicio de aseo",
    Total: 595_000,
    TotalNeto: 500_000,
    Proveedor: { Codigo: "77000000-9", Nombre: "Globex Ltda." },
  },
  {
    Codigo: "734-3-SE26",
    Nombre: "Item con RUT inválido",
    Total: 2_000_000,
    Proveedor: {
      // Invalid check digit (real verifier for 11.111.111 is "1").
      Codigo: "11111111-9",
      Nombre: "Bogus SpA",
    },
  },
]);

const ACME_DAY2 = ocResponse([
  {
    Codigo: "734-4-SE26",
    Nombre: "Compra adicional",
    // Same RUT as day 1, larger amount → should bump max.
    Total: 3_500_000,
    TotalNeto: 2_941_176,
    Proveedor: { Codigo: "76543210-3", Nombre: "ACME SpA" },
  },
  {
    Codigo: "734-5-SE26",
    Nombre: "Asesoría TI",
    Total: 250_000,
    Proveedor: { Codigo: "78111222-4", Nombre: "Initech Servicios SpA" },
  },
]);

const ACME_DAY3 = ocResponse([
  {
    Codigo: "734-6-SE26",
    Nombre: "Hardware",
    // Same RUT yet again, smaller — max stays at 3_500_000.
    Total: 2_000_000,
    Proveedor: { Codigo: "76543210-3", Nombre: "ACME SpA" },
  },
  {
    Codigo: "734-7-SE26",
    Nombre: "Hosting",
    Total: 750_000,
    Proveedor: { Codigo: "79222333-8", Nombre: "Pied Piper SpA" },
  },
]);

const EMPTY_DAY: OcResponse = { Cantidad: 0, Listado: [] };

const INVALID_TICKET_RESPONSE = {
  Codigo: 203,
  Mensaje: "Ticket no válido.",
};

const BAD_PARAM_RESPONSE = {
  Codigo: 400,
  Mensaje: "Nombre de parametro no válido.",
};

const CONCURRENT_RESPONSE = {
  Codigo: 10500,
  Mensaje: "Existen peticiones simultáneas para el mismo ticket.",
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Mock by `fecha` query param. Default response (empty body) is returned for
 * unknown days so test setup stays minimal.
 */
function makeFetchMockByDate(byDate: Map<string, unknown>) {
  const seenUrls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    seenUrls.push(url);
    const u = new URL(url);
    const fecha = u.searchParams.get("fecha");
    if (fecha && byDate.has(fecha)) return byDate.get(fecha);
    return EMPTY_DAY;
  });
  return { impl, seenUrls };
}

/**
 * Sequential mock: returns each entry of `responses` in order, then EMPTY_DAY.
 */
function makeFetchMockSequential(responses: unknown[]) {
  const seenUrls: string[] = [];
  let i = 0;
  const impl = vi.fn(async (url: string) => {
    seenUrls.push(url);
    const body = i < responses.length ? responses[i] : EMPTY_DAY;
    i++;
    return body;
  });
  return { impl, seenUrls };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createChileCompraAdapter — construction", () => {
  it("validates ticket presence", () => {
    expect(() => createChileCompraAdapter({ ticket: "" })).toThrow(/ticket/i);
    expect(() => createChileCompraAdapter({ ticket: "   " })).toThrow(/ticket/i);
  });

  it("exposes the right SourceId", () => {
    const adapter = createChileCompraAdapter({ ticket: TICKET });
    expect(adapter.id).toBe("chilecompra");
  });
});

describe("toApiDate", () => {
  it("formats DDMMYYYY without separators", () => {
    // 2026-06-12 (UTC) → 12062026
    expect(toApiDate(new Date(Date.UTC(2026, 5, 12)))).toBe("12062026");
    // 2026-01-05 → 05012026
    expect(toApiDate(new Date(Date.UTC(2026, 0, 5)))).toBe("05012026");
  });
});

describe("createChileCompraAdapter — sweep", () => {
  it("iterates day-by-day using fecha=DDMMYYYY (not fechadesde/hasta)", async () => {
    const { impl, seenUrls } = makeFetchMockByDate(new Map());
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      // 3-day window → 4 days inclusive (today + 3 prior)
      windowDays: 3,
    });

    await collect(adapter.ingest());

    expect(seenUrls.length).toBe(4);
    for (const url of seenUrls) {
      const u = new URL(url);
      // Bug 1: must use `fecha` (singular, no separators), not fechadesde/hasta.
      expect(u.searchParams.get("fecha")).toMatch(/^\d{8}$/);
      expect(u.searchParams.get("fechadesde")).toBeNull();
      expect(u.searchParams.get("fechahasta")).toBeNull();
      expect(u.searchParams.get("pagina")).toBeNull();
      // Ticket present on every URL.
      expect(u.searchParams.get("ticket")).toBe(TICKET);
    }

    // Days are distinct.
    const fechas = seenUrls.map((u) => new URL(u).searchParams.get("fecha"));
    expect(new Set(fechas).size).toBe(fechas.length);
  });

  it("extracts Proveedor.Codigo / Proveedor.Nombre (not CodigoProveedor)", async () => {
    const { impl } = makeFetchMockSequential([ACME_DAY1]);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 1,
    });

    const yielded = await collect(adapter.ingest());
    const ruts = new Set(yielded.map((y) => y.rut));

    expect(ruts.has("76543210-3")).toBe(true);
    expect(ruts.has("77000000-9")).toBe(true);

    const acme = yielded.find((y) => y.rut === "76543210-3");
    expect(acme?.razonSocial).toBe("ACME SpA");
  });

  it("uses Total (gross) as monto, falling back to TotalNeto", async () => {
    const items: OcListadoItem[] = [
      {
        Codigo: "X-1",
        Nombre: "Tiene Total",
        Total: 1_190_000,
        TotalNeto: 1_000_000,
        Proveedor: { Codigo: "76543210-3", Nombre: "ACME SpA" },
      },
      {
        Codigo: "X-2",
        Nombre: "Solo TotalNeto",
        TotalNeto: 500_000,
        Proveedor: { Codigo: "77000000-9", Nombre: "Globex Ltda." },
      },
    ];
    const { impl } = makeFetchMockSequential([ocResponse(items)]);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 1,
    });

    const yielded = await collect(adapter.ingest());
    const acme = yielded.find((y) => y.rut === "76543210-3");
    const globex = yielded.find((y) => y.rut === "77000000-9");
    expect(acme?.signals?.montoAdjudicadoMaxAnual).toBe(1_190_000);
    expect(globex?.signals?.montoAdjudicadoMaxAnual).toBe(500_000);
  });

  it("aggregates per-RUT across days and yields once with the max monto", async () => {
    // Day-keyed mock so we can place the same RUT on three distinct days
    // with different montos: 1M, 3M, 2M → expect 3M.
    const today = new Date();
    const d1 = new Date(today);
    d1.setUTCDate(today.getUTCDate() - 2);
    const d2 = new Date(today);
    d2.setUTCDate(today.getUTCDate() - 1);
    const d3 = new Date(today);

    const byDate = new Map<string, OcResponse>([
      [
        toApiDate(d1),
        ocResponse([
          {
            Codigo: "OC-1",
            Nombre: "small",
            Total: 1_000_000,
            Proveedor: { Codigo: "76543210-3", Nombre: "ACME SpA" },
          },
        ]),
      ],
      [
        toApiDate(d2),
        ocResponse([
          {
            Codigo: "OC-2",
            Nombre: "biggest",
            Total: 3_000_000,
            Proveedor: { Codigo: "76543210-3", Nombre: "ACME SpA" },
          },
        ]),
      ],
      [
        toApiDate(d3),
        ocResponse([
          {
            Codigo: "OC-3",
            Nombre: "medium",
            Total: 2_000_000,
            Proveedor: { Codigo: "76543210-3", Nombre: "ACME SpA" },
          },
        ]),
      ],
    ]);

    const { impl } = makeFetchMockByDate(byDate);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 2, // covers d1, d2, d3 (today)
    });

    const yielded = await collect(adapter.ingest());
    const acme = yielded.filter((y) => y.rut === "76543210-3");
    expect(acme).toHaveLength(1);
    expect(acme[0].signals?.montoAdjudicadoMaxAnual).toBe(3_000_000);
    expect(acme[0].signals?.venceAlEstado).toBe(true);
  });

  it("yields each unique RUT exactly once across the sweep", async () => {
    const { impl } = makeFetchMockSequential([ACME_DAY1, ACME_DAY2, ACME_DAY3]);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 2,
    });

    const yielded = await collect(adapter.ingest());
    const ruts = yielded.map((y) => y.rut);
    expect(new Set(ruts).size).toBe(ruts.length);
    expect(new Set(ruts)).toEqual(
      new Set(["76543210-3", "77000000-9", "78111222-4", "79222333-8"]),
    );
    // ACME's max across days = 3.5M.
    const acme = yielded.find((y) => y.rut === "76543210-3");
    expect(acme?.signals?.montoAdjudicadoMaxAnual).toBe(3_500_000);
  });

  it("skips invalid RUTs without throwing", async () => {
    const { impl } = makeFetchMockSequential([ACME_DAY1]);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 1,
    });

    const yielded = await collect(adapter.ingest());
    const ruts = new Set(yielded.map((y) => y.rut));
    expect(ruts.has("11111111-9")).toBe(false);
    expect(ruts.has("11111111-1")).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("respects `limit` and stops accepting new RUTs", async () => {
    const { impl } = makeFetchMockSequential([ACME_DAY1, ACME_DAY2, ACME_DAY3]);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 2,
    });

    const yielded = await collect(adapter.ingest({ limit: 2 }));
    const distinct = new Set(yielded.map((y: SourcePartial) => y.rut));
    expect(distinct.size).toBe(2);
    // First two valid RUTs encountered come from day 1: ACME and Globex.
    expect(distinct.has("76543210-3")).toBe(true);
    expect(distinct.has("77000000-9")).toBe(true);
  });

  it("uses `since` to set the start of the day-by-day sweep", async () => {
    const { impl, seenUrls } = makeFetchMockByDate(new Map());
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
    });

    // since = 3 days ago → 4 days inclusive (since, since+1, since+2, today)
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 3);
    since.setUTCHours(0, 0, 0, 0);

    await collect(adapter.ingest({ since: since.toISOString() }));

    // Earliest URL must use the `since` day.
    const fechas = seenUrls.map((u) => new URL(u).searchParams.get("fecha"));
    expect(fechas[0]).toBe(toApiDate(since));
    expect(seenUrls.length).toBe(4);
  });
});

describe("createChileCompraAdapter — error handling", () => {
  it("throws ChileCompraApiError on Codigo=400 (bad param)", async () => {
    const { impl } = makeFetchMockSequential([BAD_PARAM_RESPONSE]);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 1,
    });

    await expect(collect(adapter.ingest())).rejects.toMatchObject({
      name: "ChileCompraApiError",
      code: 400,
      apiMessage: "Nombre de parametro no válido.",
    });
  });

  it("throws ChileCompraApiError on Codigo=203 (invalid ticket)", async () => {
    const { impl } = makeFetchMockSequential([INVALID_TICKET_RESPONSE]);
    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 1,
    });

    const err = await collect(adapter.ingest()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChileCompraApiError);
    if (err instanceof ChileCompraApiError) {
      expect(err.code).toBe(203);
      expect(err.apiMessage).toMatch(/ticket/i);
    }
  });

  it("backs off and retries once on Codigo=10500 (concurrent)", async () => {
    // Day 1: concurrent error → after backoff, success with one OC.
    // Day 2 (today): empty.
    const { impl } = makeFetchMockSequential([
      CONCURRENT_RESPONSE,
      ACME_DAY1, // retry succeeds
      EMPTY_DAY,
    ]);
    const sleepImpl = vi.fn(async () => undefined);

    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 1,
      sleepImpl,
    });

    const yielded = await collect(adapter.ingest());

    // 1 day failed + 1 retry + 1 day success = 3 fetches at minimum.
    expect(impl.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Backoff sleep was triggered.
    expect(sleepImpl).toHaveBeenCalled();
    // We got the ACME data from the retry.
    const ruts = new Set(yielded.map((y) => y.rut));
    expect(ruts.has("76543210-3")).toBe(true);
  });

  it("surfaces ChileCompraApiError if a second concurrent error follows the retry", async () => {
    const { impl } = makeFetchMockSequential([
      CONCURRENT_RESPONSE,
      CONCURRENT_RESPONSE,
    ]);
    const sleepImpl = vi.fn(async () => undefined);

    const adapter = createChileCompraAdapter({
      ticket: TICKET,
      baseUrl: BASE_URL,
      fetchImpl: impl,
      minRequestIntervalMs: 0,
      windowDays: 0, // single day
      sleepImpl,
    });

    await expect(collect(adapter.ingest())).rejects.toMatchObject({
      name: "ChileCompraApiError",
      code: 10500,
    });
  });
});
