/**
 * Unit tests for the CMF adapter. All HTTP is mocked via injected `fetchImpl`
 * — no live network calls.
 *
 * Fixtures mirror the live HTML structure verified on 2026-05-01:
 *   <table>
 *     <tr> ... legal/header (no entidad.php anchor) ... </tr>
 *     <tr> ... legal/header (no entidad.php anchor) ... </tr>
 *     <tr>
 *       <td><a href="entidad.php?...">{RUT}</a></td>
 *       <td><a href="entidad.php?...">{RAZON SOCIAL}</a></td>
 *       <td class="nowrap">VI|NV</td>
 *     </tr>
 *     ...
 *   </table>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CMF_VERTICALS,
  CONSULTA_PATH,
  DEFAULT_BASE_URL,
  createCmfAdapter,
  parseListing,
  type CmfVertical,
} from "./cmf";
import type { SourcePartial } from "../types";

// ---------------------------------------------------------------------------
// HTML fixtures (real-shape minimal)
// ---------------------------------------------------------------------------

/**
 * Render a CMF-shaped listing: 2 header/legal rows (no entidad.php anchor)
 * followed by entity rows. Use this to build per-test fixtures.
 */
function renderListing(
  rows: ReadonlyArray<{ rut: string; razon: string; estado: "VI" | "NV" }>,
): string {
  const body = rows
    .map(
      (r) => `
      <tr>
        <td><a href="entidad.php?rut=${encodeURIComponent(r.rut)}">${r.rut}</a></td>
        <td><a href="entidad.php?rut=${encodeURIComponent(r.rut)}">${r.razon}</a></td>
        <td class="nowrap">${r.estado}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><body>
    <table>
      <tr><td colspan="3">Información legal — encabezado fila 1</td></tr>
      <tr>
        <td><b>RUT</b></td><td><b>Razón Social</b></td><td><b>Estado</b></td>
      </tr>
      ${body}
    </table>
  </body></html>`;
}

const EMPTY_LISTING_HTML = `<!doctype html><html><body>
  <table>
    <tr><td colspan="3">Información legal — encabezado fila 1</td></tr>
    <tr><td><b>RUT</b></td><td><b>Razón Social</b></td><td><b>Estado</b></td></tr>
  </table>
</body></html>`;

// ---------------------------------------------------------------------------
// Test fetch
// ---------------------------------------------------------------------------

interface MockedRoute {
  body: string;
  status?: number;
  /** When true, throw a generic Error to simulate a network failure. */
  networkError?: boolean;
}

function makeMockFetch(routes: Record<string, MockedRoute>): {
  impl: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const impl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push(url);
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const route = routes[url];
    if (!route) {
      return new Response(`Not found: ${url}`, { status: 404 });
    }
    if (route.networkError) {
      throw new Error(`Simulated network failure for ${url}`);
    }
    return new Response(route.body, { status: route.status ?? 200 });
  };
  return { impl, calls };
}

/** Build the canonical CMF URL for a vertical, mirroring the adapter's logic. */
function urlFor(vertical: CmfVertical, base: string = DEFAULT_BASE_URL): string {
  const params = new URLSearchParams();
  params.set("mercado", vertical.mercado);
  params.set("Estado", "VI");
  params.set(vertical.param, vertical.code);
  return `${base}${CONSULTA_PATH}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Common test setup — silence console.warn so test output stays clean.
// ---------------------------------------------------------------------------

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCmfAdapter", () => {
  it("exposes id 'cmf'", () => {
    const adapter = createCmfAdapter();
    expect(adapter.id).toBe("cmf");
  });

  it("CMF_VERTICALS has the 5 verified verticals in the documented order", () => {
    expect(CMF_VERTICALS.map((v) => v.code)).toEqual([
      "RVEMI",
      "COBOL",
      "RGAFP",
      "CSVID",
      "RGEIN",
    ]);
    expect(CMF_VERTICALS.map((v) => v.rubroDescripcion)).toEqual([
      "Emisor de Valores",
      "Corredor de Bolsa",
      "AFP",
      "Compañía de Seguros de Vida",
      "Entidad Informante Ley 20.382",
    ]);
    // Verticals 0-2 use entidad, 3-4 use consulta.
    expect(CMF_VERTICALS[0].param).toBe("entidad");
    expect(CMF_VERTICALS[1].param).toBe("entidad");
    expect(CMF_VERTICALS[2].param).toBe("entidad");
    expect(CMF_VERTICALS[3].param).toBe("consulta");
    expect(CMF_VERTICALS[4].param).toBe("consulta");
  });

  it("walks all 5 verticals in order with the documented URL shape", async () => {
    const routes: Record<string, MockedRoute> = {};
    for (const v of CMF_VERTICALS) {
      routes[urlFor(v)] = { body: EMPTY_LISTING_HTML };
    }
    const { impl, calls } = makeMockFetch(routes);

    const adapter = createCmfAdapter({ fetchImpl: impl, requestDelayMs: 0 });
    for await (const _ of adapter.ingest()) {
      // No rows — just exercising the URL walk.
    }

    expect(calls).toEqual(CMF_VERTICALS.map((v) => urlFor(v)));
  });

  it("yields entities with canonical RUT, rubroDescripcion and emisorRegulado", async () => {
    // Use a single-vertical adapter to keep the assertions focused.
    const vertical: CmfVertical = CMF_VERTICALS[0]; // Emisor de Valores
    const html = renderListing([
      { rut: "76.543.210-3", razon: "ACME CAPITAL S.A.", estado: "VI" },
      { rut: "78.123.456-7", razon: "BETA INVERSIONES SPA", estado: "VI" },
    ]);
    const { impl } = makeMockFetch({ [urlFor(vertical)]: { body: html } });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      verticals: [vertical],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(2);
    expect(out[0].rut).toBe("76543210-3");
    expect(out[0].razonSocial).toBe("ACME CAPITAL S.A.");
    expect(out[0].rubroDescripcion).toBe("Emisor de Valores");
    expect(out[0].signals?.emisorRegulado).toBe(true);

    expect(out[1].rut).toBe("78123456-7");
    expect(out[1].razonSocial).toBe("BETA INVERSIONES SPA");
    expect(out[1].rubroDescripcion).toBe("Emisor de Valores");
    expect(out[1].signals?.emisorRegulado).toBe(true);
  });

  it("canonicalizes RUTs that contain dots and the K verifier", async () => {
    const vertical: CmfVertical = CMF_VERTICALS[2]; // AFP
    // 11.223.344-K is a valid mod-11 RUT (body 11223344 → DV K).
    const html = renderListing([
      { rut: "11.223.344-K", razon: "AFP TEST UNO S.A.", estado: "VI" },
    ]);
    const { impl } = makeMockFetch({ [urlFor(vertical)]: { body: html } });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      verticals: [vertical],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(1);
    expect(out[0].rut).toBe("11223344-K");
    expect(out[0].rubroDescripcion).toBe("AFP");
  });

  it("skips rows with estado=NV", async () => {
    const vertical: CmfVertical = CMF_VERTICALS[0];
    const html = renderListing([
      { rut: "76.543.210-3", razon: "VIGENTE S.A.", estado: "VI" },
      { rut: "78.123.456-7", razon: "NO VIGENTE S.A.", estado: "NV" },
    ]);
    const { impl } = makeMockFetch({ [urlFor(vertical)]: { body: html } });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      verticals: [vertical],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(1);
    expect(out[0].rut).toBe("76543210-3");
  });

  it("skips header/legal rows that lack an entidad.php anchor", async () => {
    // The listing renderer already includes 2 header rows without
    // entidad.php anchors. Confirm they are not emitted as entities.
    const vertical: CmfVertical = CMF_VERTICALS[0];
    const html = renderListing([
      { rut: "76.543.210-3", razon: "ACME S.A.", estado: "VI" },
    ]);
    const { impl } = makeMockFetch({ [urlFor(vertical)]: { body: html } });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      verticals: [vertical],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    // Exactly one entity row in the fixture; if the header rows leaked, we'd
    // see >1 (or, more likely, the parser would error trying to canonicalize
    // their non-RUT content).
    expect(out).toHaveLength(1);
  });

  it("skips rows with malformed RUT and warns", async () => {
    const customWarn = vi.fn();
    const vertical: CmfVertical = CMF_VERTICALS[0];
    // Hand-roll a row whose RUT cell isn't a real RUT but still has the
    // required entidad.php anchor and 3 cells with estado=VI.
    const html = `<!doctype html><html><body>
      <table>
        <tr><td colspan="3">Encabezado legal</td></tr>
        <tr><td><b>RUT</b></td><td><b>Razón Social</b></td><td><b>Estado</b></td></tr>
        <tr>
          <td><a href="entidad.php?x=1">no-es-un-rut</a></td>
          <td><a href="entidad.php?x=1">RAZON BAD S.A.</a></td>
          <td class="nowrap">VI</td>
        </tr>
        <tr>
          <td><a href="entidad.php?x=2">76.543.210-3</a></td>
          <td><a href="entidad.php?x=2">RAZON OK S.A.</a></td>
          <td class="nowrap">VI</td>
        </tr>
      </table>
    </body></html>`;
    const { impl } = makeMockFetch({ [urlFor(vertical)]: { body: html } });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      warn: customWarn,
      verticals: [vertical],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(1);
    expect(out[0].rut).toBe("76543210-3");
    expect(customWarn).toHaveBeenCalled();
    const warnMessages = customWarn.mock.calls.map((c) => c[0]);
    expect(warnMessages.some((m: string) => /invalid RUT/i.test(m))).toBe(true);
  });

  it("assigns the correct rubroDescripcion per vertical", async () => {
    // Use the canonical 5 verticals; supply 1 row each.
    const routes: Record<string, MockedRoute> = {};
    // All five are mod-11 valid: bodies 11111111, 22222222, 33333333,
    // 11223344, 76543210 → DVs 1, 2, 3, K, 3 respectively.
    const ruts = [
      "11.111.111-1",
      "22.222.222-2",
      "33.333.333-3",
      "11.223.344-K",
      "76.543.210-3",
    ];
    CMF_VERTICALS.forEach((v, i) => {
      routes[urlFor(v)] = {
        body: renderListing([
          { rut: ruts[i], razon: `ENTIDAD ${i} S.A.`, estado: "VI" },
        ]),
      };
    });
    const { impl } = makeMockFetch(routes);

    const adapter = createCmfAdapter({ fetchImpl: impl, requestDelayMs: 0 });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(5);
    expect(out.map((p) => p.rubroDescripcion)).toEqual(
      CMF_VERTICALS.map((v) => v.rubroDescripcion),
    );
    for (const p of out) {
      expect(p.signals?.emisorRegulado).toBe(true);
    }
  });

  it("respects opts.limit across verticals", async () => {
    const routes: Record<string, MockedRoute> = {};
    // All five are mod-11 valid: bodies 11111111, 22222222, 33333333,
    // 11223344, 76543210 → DVs 1, 2, 3, K, 3 respectively.
    const ruts = [
      "11.111.111-1",
      "22.222.222-2",
      "33.333.333-3",
      "11.223.344-K",
      "76.543.210-3",
    ];
    CMF_VERTICALS.forEach((v, i) => {
      routes[urlFor(v)] = {
        body: renderListing([
          { rut: ruts[i], razon: `ENTIDAD ${i} S.A.`, estado: "VI" },
        ]),
      };
    });
    const { impl } = makeMockFetch(routes);

    const adapter = createCmfAdapter({ fetchImpl: impl, requestDelayMs: 0 });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest({ limit: 2 })) out.push(p);

    expect(out).toHaveLength(2);
    // First two by document order are RVEMI then COBOL.
    expect(out[0].rubroDescripcion).toBe("Emisor de Valores");
    expect(out[1].rubroDescripcion).toBe("Corredor de Bolsa");
  });

  it("respects opts.signal abort during iteration", async () => {
    const vertical: CmfVertical = CMF_VERTICALS[0];
    const html = renderListing([
      { rut: "76.543.210-3", razon: "UNO S.A.", estado: "VI" },
      { rut: "78.123.456-7", razon: "DOS S.A.", estado: "VI" },
    ]);
    const { impl } = makeMockFetch({ [urlFor(vertical)]: { body: html } });

    const controller = new AbortController();
    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      verticals: [vertical],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest({ signal: controller.signal })) {
      out.push(p);
      controller.abort(); // Abort after first emission.
    }

    expect(out).toHaveLength(1);
  });

  it("continues to the next vertical when a fetch returns HTTP 5xx", async () => {
    const customWarn = vi.fn();
    const v0 = CMF_VERTICALS[0];
    const v1 = CMF_VERTICALS[1];

    const okHtml = renderListing([
      { rut: "76.543.210-3", razon: "BUENA S.A.", estado: "VI" },
    ]);
    const { impl } = makeMockFetch({
      [urlFor(v0)]: { body: "boom", status: 503 },
      [urlFor(v1)]: { body: okHtml },
    });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      warn: customWarn,
      verticals: [v0, v1],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(1);
    expect(out[0].rubroDescripcion).toBe("Corredor de Bolsa");
    expect(customWarn).toHaveBeenCalled();
  });

  it("continues to the next vertical when a fetch throws a network error", async () => {
    const customWarn = vi.fn();
    const v0 = CMF_VERTICALS[0];
    const v1 = CMF_VERTICALS[1];

    const okHtml = renderListing([
      { rut: "76.543.210-3", razon: "RECUPERADA S.A.", estado: "VI" },
    ]);
    const { impl } = makeMockFetch({
      [urlFor(v0)]: { body: "", networkError: true },
      [urlFor(v1)]: { body: okHtml },
    });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      warn: customWarn,
      verticals: [v0, v1],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(1);
    expect(out[0].razonSocial).toBe("RECUPERADA S.A.");
    expect(customWarn).toHaveBeenCalled();
  });

  it("yields nothing for an empty listing (no entity rows)", async () => {
    const vertical: CmfVertical = CMF_VERTICALS[0];
    const { impl } = makeMockFetch({
      [urlFor(vertical)]: { body: EMPTY_LISTING_HTML },
    });

    const adapter = createCmfAdapter({
      fetchImpl: impl,
      requestDelayMs: 0,
      verticals: [vertical],
    });

    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest()) out.push(p);

    expect(out).toHaveLength(0);
  });
});

describe("parseListing (internal)", () => {
  it("returns SourcePartials for VI rows only and tags rubroDescripcion", () => {
    const vertical: CmfVertical = CMF_VERTICALS[3]; // CSVID
    const html = renderListing([
      { rut: "76.543.210-3", razon: "VIDA S.A.", estado: "VI" },
      { rut: "78.123.456-7", razon: "DESACTIVADA S.A.", estado: "NV" },
    ]);

    const partials = parseListing(html, vertical);
    expect(partials).toHaveLength(1);
    expect(partials[0].rut).toBe("76543210-3");
    expect(partials[0].rubroDescripcion).toBe("Compañía de Seguros de Vida");
    expect(partials[0].signals?.emisorRegulado).toBe(true);
  });
});
