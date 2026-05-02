import { describe, expect, it, vi, afterEach } from "vitest";
import { createCncAdapter, listCncSocios, type CncSocio } from "./cnc";

// ----------------------------------------------------------------------------
// HTML fixtures
//
// The five sub-URL paths under DEFAULT_BASE_URL = https://cnc.cl/socios/ :
//   - empresas
//   - asociaciones-especializadas
//   - camaras-regionales
//   - camaras-binacionales
//   - corporaciones-y-fundaciones
//
// Card layout (verified live 2026-05-01): div.card whose text reads
//   "<NOMBRE> Fono: <TELEFONO> <URL>"  (Fono and URL both optional).
// ----------------------------------------------------------------------------

const BASE_URL = "https://cnc.cl/socios/";
const URL_EMPRESAS = "https://cnc.cl/socios/empresas";
const URL_ASOC = "https://cnc.cl/socios/asociaciones-especializadas";
const URL_REGIONALES = "https://cnc.cl/socios/camaras-regionales";
const URL_BINAC = "https://cnc.cl/socios/camaras-binacionales";
const URL_CORP = "https://cnc.cl/socios/corporaciones-y-fundaciones";

const empresasHtml = /* html */ `
  <html><body>
    <div class="card">
      Bata Chile S.A Fono: 56 (2) 2560 4200 http://www.bata.com
    </div>
    <div class="card">
      British American Tobacco Chile Fono: 56 (2) 464 6000 http://www.chiletabacos.cl
    </div>
    <div class="card">
      Alto S.A.  http://alto.cl
    </div>
    <div class="card">
      <p>Solo Razón Social Sin Datos</p>
    </div>
  </body></html>
`;

// One card has no URL in the text: must fall back to the <a href> inside.
const asocHtml = /* html */ `
  <html><body>
    <div class="card">
      ABA - Asociación de Bancos Fono: 56 (2) 2222 2222
      <a href="https://www.aba.cl">visitar</a>
    </div>
    <div class="card">
      ASIPLA Fono: 56 (2) 3333 3333 https://www.asipla.cl
    </div>
    <div class="card">
      <!-- no razón social parseable: empty text -->
    </div>
  </body></html>
`;

const regionalesHtml = /* html */ `
  <html><body>
    <div class="card">
      Cámara de Comercio de Valparaíso Fono: 56 (32) 222 1111 https://www.ccsv.cl
    </div>
  </body></html>
`;

// Used only for the abort-stops-iteration test where we want an early sub-URL
// (empresas) to yield the first record before abort fires.
function fixtureRoutes(): Record<string, string> {
  return {
    [URL_EMPRESAS]: empresasHtml,
    [URL_ASOC]: asocHtml,
    [URL_REGIONALES]: regionalesHtml,
    [URL_BINAC]: "<html><body></body></html>",
    [URL_CORP]: "<html><body></body></html>",
  };
}

// ----------------------------------------------------------------------------
// Fetch mock helper
// ----------------------------------------------------------------------------

interface FetchMockOptions {
  routes: Record<string, string>;
  /** Sub-URLs that should fail with the given status (e.g. 500). */
  errors?: Record<string, number>;
}

function makeFetchMock(opts: FetchMockOptions): typeof fetch {
  const { routes, errors = {} } = opts;
  return vi.fn(async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const errStatus = errors[url];
    if (errStatus !== undefined) {
      return new Response("boom", { status: errStatus, statusText: "Server Error" });
    }
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

afterEach(() => {
  vi.restoreAllMocks();
});

// ----------------------------------------------------------------------------
// listCncSocios
// ----------------------------------------------------------------------------

describe("listCncSocios", () => {
  it("parses cards across sub-URLs and assigns the correct categoria", async () => {
    const fetchImpl = makeFetchMock({ routes: fixtureRoutes() });
    const collected: CncSocio[] = [];
    for await (const socio of listCncSocios({ fetchImpl, baseUrl: BASE_URL, delayMs: 0 })) {
      collected.push(socio);
    }

    // empresas: 4 valid (Bata, BAT, Alto, "Solo Razón Social Sin Datos" — a
    //   bare-name card with neither phone nor URL is still a valid socio)
    // asociaciones-especializadas: 2 valid (ABA, ASIPLA) — 1 empty card skipped
    // camaras-regionales: 1 (Valparaíso)
    // binacionales / corporaciones: empty fixtures → 0
    expect(collected).toHaveLength(7);

    const bata = collected.find((s) => s.razonSocial.startsWith("Bata"));
    expect(bata).toBeDefined();
    expect(bata?.categoria).toBe("empresas");
    expect(bata?.sitioWeb).toBe("http://www.bata.com");
    expect(bata?.telefono).toBe("56 (2) 2560 4200");

    const bat = collected.find((s) => s.razonSocial.startsWith("British"));
    expect(bat?.razonSocial).toBe("British American Tobacco Chile");
    expect(bat?.sitioWeb).toBe("http://www.chiletabacos.cl");
    expect(bat?.telefono).toBe("56 (2) 464 6000");
    expect(bat?.categoria).toBe("empresas");

    // No "Fono:" — only razón social + URL.
    const alto = collected.find((s) => s.razonSocial === "Alto S.A.");
    expect(alto).toBeDefined();
    expect(alto?.sitioWeb).toBe("http://alto.cl");
    expect(alto?.telefono).toBeUndefined();

    const asipla = collected.find((s) => s.razonSocial === "ASIPLA");
    expect(asipla?.categoria).toBe("asociaciones-especializadas");
    expect(asipla?.sitioWeb).toBe("https://www.asipla.cl");

    const valpo = collected.find((s) => s.razonSocial.startsWith("Cámara"));
    expect(valpo?.categoria).toBe("camaras-regionales");
  });

  it("falls back to <a href> when the card text has no URL", async () => {
    const fetchImpl = makeFetchMock({ routes: fixtureRoutes() });
    const all: CncSocio[] = [];
    for await (const socio of listCncSocios({ fetchImpl, baseUrl: BASE_URL, delayMs: 0 })) {
      all.push(socio);
    }
    const aba = all.find((s) => s.razonSocial.startsWith("ABA"));
    expect(aba).toBeDefined();
    // The text "ABA - Asociación de Bancos Fono: 56 (2) 2222 2222" has no
    // http URL — must come from the <a href="https://www.aba.cl">.
    expect(aba?.sitioWeb).toBe("https://www.aba.cl");
    expect(aba?.telefono).toBe("56 (2) 2222 2222");
    expect(aba?.categoria).toBe("asociaciones-especializadas");
  });

  it("skips cards without parseable razón social", async () => {
    const fetchImpl = makeFetchMock({ routes: fixtureRoutes() });
    const all: CncSocio[] = [];
    for await (const socio of listCncSocios({ fetchImpl, baseUrl: BASE_URL, delayMs: 0 })) {
      all.push(socio);
    }
    // The empty <div class="card"></div> in asocHtml must be skipped (only
    // 2 socios from that sub-URL, not 3).
    const fromAsoc = all.filter((s) => s.categoria === "asociaciones-especializadas");
    expect(fromAsoc).toHaveLength(2);
  });

  it("honors `limit` and stops the sweep early across sub-URLs", async () => {
    const fetchImpl = makeFetchMock({ routes: fixtureRoutes() });
    const collected: CncSocio[] = [];
    for await (const socio of listCncSocios({
      fetchImpl,
      baseUrl: BASE_URL,
      delayMs: 0,
      limit: 2,
    })) {
      collected.push(socio);
    }
    // Both must be from `empresas` (the first sub-URL fetched).
    expect(collected).toHaveLength(2);
    expect(collected.every((s) => s.categoria === "empresas")).toBe(true);
  });

  it("stops iterating when the abort signal fires", async () => {
    const fetchImpl = makeFetchMock({ routes: fixtureRoutes() });
    const ctrl = new AbortController();
    const collected: CncSocio[] = [];
    for await (const socio of listCncSocios({
      fetchImpl,
      baseUrl: BASE_URL,
      delayMs: 0,
      signal: ctrl.signal,
    })) {
      collected.push(socio);
      if (collected.length === 1) ctrl.abort();
    }
    // Without abort we'd see 6 records; abort must short-circuit.
    expect(collected.length).toBeLessThan(6);
    expect(collected.length).toBeGreaterThanOrEqual(1);
  });

  it("returns immediately when signal is already aborted", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const ctrl = new AbortController();
    ctrl.abort();
    const collected: CncSocio[] = [];
    for await (const socio of listCncSocios({
      fetchImpl,
      baseUrl: BASE_URL,
      delayMs: 0,
      signal: ctrl.signal,
    })) {
      collected.push(socio);
    }
    expect(collected).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("continues to the next sub-URL when one fails", async () => {
    // empresas → 500, but asociaciones / regionales should still produce.
    const fetchImpl = makeFetchMock({
      routes: fixtureRoutes(),
      errors: { [URL_EMPRESAS]: 500 },
    });
    const collected: CncSocio[] = [];
    for await (const socio of listCncSocios({ fetchImpl, baseUrl: BASE_URL, delayMs: 0 })) {
      collected.push(socio);
    }
    // 0 from empresas + 2 from asoc + 1 from regionales = 3
    expect(collected).toHaveLength(3);
    expect(collected.some((s) => s.categoria === "empresas")).toBe(false);
    expect(collected.filter((s) => s.categoria === "asociaciones-especializadas")).toHaveLength(2);
    expect(collected.filter((s) => s.categoria === "camaras-regionales")).toHaveLength(1);
  });
});

// ----------------------------------------------------------------------------
// createCncAdapter — ingest yields nothing
// ----------------------------------------------------------------------------

describe("createCncAdapter", () => {
  it("has the correct source id", () => {
    const adapter = createCncAdapter();
    expect(adapter.id).toBe("cnc");
  });

  it("ingest() yields nothing (CNC exposes no RUTs)", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const adapter = createCncAdapter({ fetchImpl });
    const collected = [];
    for await (const partial of adapter.ingest()) {
      collected.push(partial);
    }
    expect(collected).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ingest() respects an aborted signal (still yields nothing)", async () => {
    const adapter = createCncAdapter();
    const ctrl = new AbortController();
    ctrl.abort();
    const collected = [];
    for await (const partial of adapter.ingest({ signal: ctrl.signal })) {
      collected.push(partial);
    }
    expect(collected).toHaveLength(0);
  });
});
