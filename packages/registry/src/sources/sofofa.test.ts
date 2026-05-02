import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createSofofaAdapter,
  listSofofaSocios,
  type SofofaSocio,
} from "./sofofa";

// ----------------------------------------------------------------------------
// HTML fixtures
// ----------------------------------------------------------------------------

const BASE_URL = "https://web.sofofa.cl/socios/";

const indexHtml = /* html */ `
  <html><body>
    <ul class="sectors">
      <li><a class="sector-link" href="/socios/?sector=alimentos">Alimentos</a></li>
      <li><a class="sector-link" href="/socios/?sector=metalurgia">Metalurgia</a></li>
    </ul>
  </body></html>
`;

const alimentosPage1Html = /* html */ `
  <html><body>
    <div class="socio-card">
      <h3 class="socio-nombre">  CARNES   ÑUBLE   S.A. </h3>
      <span class="socio-sector">Alimentos</span>
      <a class="socio-website" href="https://carnesnuble.cl">Sitio</a>
    </div>
    <div class="socio-card">
      <h3 class="socio-nombre">Lacteos del Sur SpA</h3>
      <span class="socio-sector">Alimentos</span>
    </div>
    <a class="next-page" href="/socios/?sector=alimentos&amp;page=2">Siguiente</a>
  </body></html>
`;

const alimentosPage2Html = /* html */ `
  <html><body>
    <div class="socio-card">
      <h3 class="socio-nombre">Conservas Maule Ltda.</h3>
      <span class="socio-sector">Alimentos</span>
      <a class="socio-website" href="https://conservasmaule.cl">Web</a>
    </div>
    <!-- no next-page link → end of pagination -->
  </body></html>
`;

const metalurgiaPage1Html = /* html */ `
  <html><body>
    <div class="socio-card">
      <h3 class="socio-nombre">Aceros Andinos S.A.</h3>
      <span class="socio-sector">Metalurgia</span>
      <a class="socio-website" href="https://acerosandinos.cl">Sitio</a>
    </div>
  </body></html>
`;

// ----------------------------------------------------------------------------
// Fetch mock helper
// ----------------------------------------------------------------------------

function makeFetchMock(routes: Record<string, string>): typeof fetch {
  return vi.fn(async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = routes[url];
    if (body === undefined) {
      return new Response(`not found: ${url}`, { status: 404 });
    }
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as unknown as typeof fetch;
}

// ----------------------------------------------------------------------------
// Setup: tests pass `rateLimitMs: 0` to skip the inter-request delay.
// ----------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------
// listSofofaSocios
// ----------------------------------------------------------------------------

describe("listSofofaSocios", () => {
  it("yields normalized records across sectors and paginated pages", async () => {
    const fetchImpl = makeFetchMock({
      [BASE_URL]: indexHtml,
      "https://web.sofofa.cl/socios/?sector=alimentos": alimentosPage1Html,
      "https://web.sofofa.cl/socios/?sector=alimentos&page=2": alimentosPage2Html,
      "https://web.sofofa.cl/socios/?sector=metalurgia": metalurgiaPage1Html,
    });

    const collected: SofofaSocio[] = [];
    for await (const socio of listSofofaSocios({ fetchImpl, baseUrl: BASE_URL, rateLimitMs: 0 })) {
      collected.push(socio);
    }

    expect(collected).toHaveLength(4);
    // Order: alimentos page 1 (2), alimentos page 2 (1), metalurgia page 1 (1).
    expect(collected.map((s) => s.razonSocial)).toEqual([
      "CARNES ÑUBLE S.A.", // cleanText collapses whitespace
      "Lacteos del Sur SpA",
      "Conservas Maule Ltda.",
      "Aceros Andinos S.A.",
    ]);
  });

  it("applies cleanText to razon social (collapses whitespace)", async () => {
    const fetchImpl = makeFetchMock({
      [BASE_URL]: indexHtml,
      "https://web.sofofa.cl/socios/?sector=alimentos": alimentosPage1Html,
      "https://web.sofofa.cl/socios/?sector=alimentos&page=2": alimentosPage2Html,
      "https://web.sofofa.cl/socios/?sector=metalurgia": metalurgiaPage1Html,
    });

    const first: SofofaSocio[] = [];
    for await (const socio of listSofofaSocios({ fetchImpl, baseUrl: BASE_URL, rateLimitMs: 0 })) {
      first.push(socio);
      if (first.length === 1) break;
    }
    // Raw HTML has "  CARNES   ÑUBLE   S.A. " with extra spaces.
    expect(first[0].razonSocial).toBe("CARNES ÑUBLE S.A.");
  });

  it("captures sector and sitioWeb when present, omits when absent", async () => {
    const fetchImpl = makeFetchMock({
      [BASE_URL]: indexHtml,
      "https://web.sofofa.cl/socios/?sector=alimentos": alimentosPage1Html,
      "https://web.sofofa.cl/socios/?sector=alimentos&page=2": alimentosPage2Html,
      "https://web.sofofa.cl/socios/?sector=metalurgia": metalurgiaPage1Html,
    });

    const all: SofofaSocio[] = [];
    for await (const socio of listSofofaSocios({ fetchImpl, baseUrl: BASE_URL, rateLimitMs: 0 })) {
      all.push(socio);
    }

    const carnes = all.find((s) => s.razonSocial.startsWith("CARNES"));
    expect(carnes).toBeDefined();
    expect(carnes?.sector).toBe("Alimentos");
    expect(carnes?.sitioWeb).toBe("https://carnesnuble.cl");

    const lacteos = all.find((s) => s.razonSocial === "Lacteos del Sur SpA");
    expect(lacteos).toBeDefined();
    expect(lacteos?.sector).toBe("Alimentos");
    expect(lacteos?.sitioWeb).toBeUndefined();
  });

  it("falls back to the base URL when no sector links are present", async () => {
    const fetchImpl = makeFetchMock({
      [BASE_URL]: metalurgiaPage1Html, // no sector-link anchors → use base URL itself
    });

    const all: SofofaSocio[] = [];
    for await (const socio of listSofofaSocios({ fetchImpl, baseUrl: BASE_URL, rateLimitMs: 0 })) {
      all.push(socio);
    }

    expect(all).toHaveLength(1);
    expect(all[0].razonSocial).toBe("Aceros Andinos S.A.");
  });

  it("stops iterating when the abort signal fires", async () => {
    const fetchImpl = makeFetchMock({
      [BASE_URL]: indexHtml,
      "https://web.sofofa.cl/socios/?sector=alimentos": alimentosPage1Html,
      "https://web.sofofa.cl/socios/?sector=alimentos&page=2": alimentosPage2Html,
      "https://web.sofofa.cl/socios/?sector=metalurgia": metalurgiaPage1Html,
    });

    const ctrl = new AbortController();
    const collected: SofofaSocio[] = [];
    for await (const socio of listSofofaSocios({
      fetchImpl,
      baseUrl: BASE_URL,
      signal: ctrl.signal,
      rateLimitMs: 0,
    })) {
      collected.push(socio);
      if (collected.length === 1) {
        ctrl.abort();
      }
    }

    // Without abort we'd see 4 records; abort must short-circuit.
    expect(collected.length).toBeLessThan(4);
    expect(collected.length).toBeGreaterThanOrEqual(1);
  });

  it("returns immediately when signal is already aborted", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const ctrl = new AbortController();
    ctrl.abort();

    const collected: SofofaSocio[] = [];
    for await (const socio of listSofofaSocios({
      fetchImpl,
      baseUrl: BASE_URL,
      signal: ctrl.signal,
      rateLimitMs: 0,
    })) {
      collected.push(socio);
    }

    expect(collected).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------------------------------------
// createSofofaAdapter — ingest yields nothing
// ----------------------------------------------------------------------------

describe("createSofofaAdapter", () => {
  it("has the correct source id", () => {
    const adapter = createSofofaAdapter();
    expect(adapter.id).toBe("sofofa");
  });

  it("ingest() yields nothing (Sofofa exposes no RUTs)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const adapter = createSofofaAdapter({ fetchImpl });

    const collected = [];
    for await (const partial of adapter.ingest()) {
      collected.push(partial);
    }

    expect(collected).toHaveLength(0);
    // Should not even hit the network.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ingest() respects an aborted signal (still yields nothing)", async () => {
    const adapter = createSofofaAdapter();
    const ctrl = new AbortController();
    ctrl.abort();

    const collected = [];
    for await (const partial of adapter.ingest({ signal: ctrl.signal })) {
      collected.push(partial);
    }
    expect(collected).toHaveLength(0);
  });
});
