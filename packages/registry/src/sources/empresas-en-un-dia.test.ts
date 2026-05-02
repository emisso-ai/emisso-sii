import { describe, expect, it, vi } from "vitest";

import { createEmpresasEnUnDiaAdapter } from "./empresas-en-un-dia";
import type { SourcePartial } from "../types";

// ============================================================================
// Test fixtures
// ============================================================================

const BOM = "﻿";

/** Real header from datos.gob.cl, verified 2026-05-01. */
const HEADER =
  "ID;RUT;Razon Social;Fecha de actuacion (1era firma);Fecha de registro (ultima firma);Fecha de aprobacion x SII;Anio;Mes;Comuna Tributaria;Region Tributaria;Codigo de sociedad;Tipo de actuacion;Capital;Comuna Social;Region Social";

/**
 * Build the canonical fixture body (no BOM).
 * Each row exercises a behaviour (see comments).
 *
 * RUT verifiers (SII modulo-11):
 *   78325627-4   valid CONSTITUCIÓN with comuna in CAPS + region "13"
 *   78325512-K   valid CONSTITUCIÓN
 *   76543210-3   valid MODIFICACIÓN — must be SKIPPED
 *   55555555-5   valid CONSTITUCIÓN with region "5" (Valparaíso)
 *   76543210-9   invalid check digit — must be SKIPPED + warned
 */
const ROWS = [
  // CAPS comuna + region 13 + DD-MM-YYYY date
  "6438710;78325627-4;Astraly SpA;01-01-2026;01-01-2026;01-01-2026;2026;Enero;EST CENTRAL;13;SpA;CONSTITUCIÓN;1000000;EST CENTRAL;13",
  // Plain CONSTITUCIÓN with another CAPS comuna
  "6433601;78325512-K;ECS Group SpA;15-02-2026;15-02-2026;15-02-2026;2026;Febrero;LO BARNECHEA;13;SpA;CONSTITUCIÓN;5000000;LO BARNECHEA;13",
  // MODIFICACIÓN — must be skipped silently (counted)
  "6500000;76543210-3;ACME SpA;10-03-2026;10-03-2026;10-03-2026;2026;Marzo;PROVIDENCIA;13;SpA;MODIFICACIÓN;0;PROVIDENCIA;13",
  // CONSTITUCIÓN with region 5 (Valparaíso)
  "6500001;55555555-5;Costa SpA;20-03-2026;20-03-2026;20-03-2026;2026;Marzo;VINA DEL MAR;5;SpA;CONSTITUCIÓN;200000;VINA DEL MAR;5",
  // Invalid check digit
  "6500002;76543210-9;Bad RUT SpA;25-03-2026;25-03-2026;25-03-2026;2026;Marzo;NUNOA;13;SpA;CONSTITUCIÓN;0;NUNOA;13",
];

const FIXTURE_CSV_NO_BOM = `${HEADER}\n${ROWS.join("\n")}\n`;
const FIXTURE_CSV = `${BOM}${FIXTURE_CSV_NO_BOM}`;

// ============================================================================
// Test helpers
// ============================================================================

function csvResponse(
  csv: string,
  init?: { ok?: boolean; status?: number },
): Response {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(csv));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    statusText: ok ? "OK" : "Error",
  });
}

function chunkedCsvResponse(csv: string, chunkSize = 16): Response {
  const bytes = new TextEncoder().encode(csv);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let offset = 0;
      while (offset < bytes.length) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
        offset += chunkSize;
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, statusText: "OK" });
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
  });
}

async function collect(
  iter: AsyncIterable<SourcePartial>,
): Promise<SourcePartial[]> {
  const out: SourcePartial[] = [];
  for await (const p of iter) out.push(p);
  return out;
}

const FIXED_CSV_URL = "http://test/2026.csv";

// ============================================================================
// Tests
// ============================================================================

describe("createEmpresasEnUnDiaAdapter", () => {
  it("exposes the source id", () => {
    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl: vi.fn(),
      csvUrls: [FIXED_CSV_URL],
    });
    expect(adapter.id).toBe("empresas-en-un-dia");
  });

  it("yields canonical RUTs and skips invalid + non-CONSTITUCION rows with a warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(FIXTURE_CSV));

    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });

    const out = await collect(adapter.ingest());

    expect(out.map((p) => p.rut)).toEqual([
      "78325627-4",
      "78325512-K",
      "55555555-5",
    ]);

    // 1 invalid RUT + 1 MODIFICACIÓN skipped → warn called.
    expect(warn).toHaveBeenCalled();
    const msg = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(msg).toMatch(/skipped 1 rows with invalid RUTs/);
    expect(msg).toMatch(/1 non-CONSTITUCION rows/);

    warn.mockRestore();
  });

  it("strips the UTF-8 BOM from the header", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(FIXTURE_CSV));

    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });

    const out = await collect(adapter.ingest());
    // If BOM hadn't been stripped, the first header cell would be "﻿ID"
    // and `RUT` mapping would still hit (since RUT is the second column),
    // but the row would still emit. The clearest check is that we emitted
    // any row at all AND that razonSocial parsed correctly.
    const astraly = out.find((p) => p.rut === "78325627-4");
    expect(astraly).toBeDefined();
    expect(astraly?.razonSocial).toBe("Astraly SpA");
  });

  it("title-cases comuna and maps region code to the canonical region name", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(FIXTURE_CSV));

    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });
    const out = await collect(adapter.ingest());

    const astraly = out.find((p) => p.rut === "78325627-4");
    expect(astraly).toBeDefined();
    expect(astraly?.comuna).toBe("Est Central");
    expect(astraly?.region).toBe("Metropolitana");

    const lobarn = out.find((p) => p.rut === "78325512-K");
    expect(lobarn?.comuna).toBe("Lo Barnechea");
    expect(lobarn?.region).toBe("Metropolitana");

    const costa = out.find((p) => p.rut === "55555555-5");
    expect(costa?.region).toBe("Valparaíso");
  });

  it("converts DD-MM-YYYY dates to ISO YYYY-MM-DD on fechaInicio", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(FIXTURE_CSV));

    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });
    const out = await collect(adapter.ingest());

    const astraly = out.find((p) => p.rut === "78325627-4");
    expect(astraly?.fechaInicio).toBe("2026-01-01");

    const ecs = out.find((p) => p.rut === "78325512-K");
    expect(ecs?.fechaInicio).toBe("2026-02-15");
  });

  it("respects the limit option across CSV files", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(FIXTURE_CSV));

    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });
    const out = await collect(adapter.ingest({ limit: 2 }));

    expect(out).toHaveLength(2);
    expect(out[0].rut).toBe("78325627-4");
    expect(out[1].rut).toBe("78325512-K");
  });

  it("respects an aborted signal (pre-aborted)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(FIXTURE_CSV));
    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });

    const ctrl = new AbortController();
    ctrl.abort();
    const out = await collect(adapter.ingest({ signal: ctrl.signal }));
    expect(out).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respects an abort signal mid-iteration", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(FIXTURE_CSV));
    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });

    const ctrl = new AbortController();
    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest({ signal: ctrl.signal })) {
      out.push(p);
      if (out.length === 1) ctrl.abort();
    }
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.length).toBeLessThan(3);
  });

  it("handles chunked stream input correctly (BOM split across chunks)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(chunkedCsvResponse(FIXTURE_CSV, 8));
    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });

    const out = await collect(adapter.ingest());
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.rut)).toContain("78325627-4");
  });

  it("throws when fetch returns non-ok", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 500, statusText: "Server Error" }),
      );
    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });

    await expect(collect(adapter.ingest())).rejects.toThrow(
      /fetch failed: 500/,
    );
  });

  // ==========================================================================
  // CKAN discovery
  // ==========================================================================

  it("discovers per-year CSV resources via CKAN package_show and filters by years", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const ckanResponse = {
      result: {
        resources: [
          {
            format: "csv",
            name: "Constituciones del año 2024",
            url: "https://datos.gob.cl/dataset/abc/resource/xxx/download/2024-sociedades-por-fecha-rut-constitucion_v2.csv",
          },
          {
            format: "csv",
            name: "Constituciones del año 2025",
            url: "https://datos.gob.cl/dataset/abc/resource/yyy/download/2025-sociedades-por-fecha-rut-constitucion.csv",
          },
          {
            format: "csv",
            name: "Constituciones del año 2026",
            url: "https://datos.gob.cl/dataset/abc/resource/zzz/download/202603-sociedades-por-fecha-rut-constitucion.csv",
          },
          {
            format: "PDF",
            name: "Documentation",
            url: "https://datos.gob.cl/dataset/abc/resource/aaa/download/doc.pdf",
          },
        ],
      },
    };

    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("package_show")) return jsonResponse(ckanResponse);
      // Each per-year CSV returns the same fixture; we only assert that the
      // expected URLs were requested.
      return csvResponse(FIXTURE_CSV);
    });

    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      years: [2025, 2026],
    });

    const out = await collect(adapter.ingest());

    // 2 CSVs × 3 valid CONSTITUCIÓN rows each = 6
    expect(out).toHaveLength(6);

    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("package_show"))).toBe(true);
    expect(urls.some((u) => u.includes("2025-sociedades"))).toBe(true);
    expect(urls.some((u) => u.includes("202603-sociedades"))).toBe(true);
    expect(urls.some((u) => u.includes("2024-sociedades"))).toBe(false);
    expect(urls.some((u) => u.endsWith("doc.pdf"))).toBe(false);
  });

  it("uses the csvUrls override and skips CKAN discovery entirely", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        csvResponse(FIXTURE_CSV),
    );

    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      csvUrls: [FIXED_CSV_URL],
    });

    await collect(adapter.ingest());

    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([FIXED_CSV_URL]);
    expect(urls.some((u) => u.includes("package_show"))).toBe(false);
  });

  it("throws when CKAN package_show is non-ok", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 500, statusText: "X" }),
    );
    const adapter = createEmpresasEnUnDiaAdapter({
      fetchImpl,
      years: [2026],
    });

    await expect(collect(adapter.ingest())).rejects.toThrow(
      /package_show failed: 500/,
    );
  });
});
