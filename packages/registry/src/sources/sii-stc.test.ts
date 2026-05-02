import { describe, expect, it, vi } from "vitest";

import {
  createSiiStcAdapter,
  fetchCaptcha,
  parseStcHtml,
  solveCaptcha,
} from "./sii-stc";
import type { SourcePartial } from "../types";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function collect(
  iter: AsyncIterable<SourcePartial>,
): Promise<SourcePartial[]> {
  const out: SourcePartial[] = [];
  for await (const p of iter) out.push(p);
  return out;
}

const BASE_URL = "https://zeus.sii.cl";
const CAPTCHA_URL = `${BASE_URL}/cvc_cgi/stc/CViewCaptcha.cgi`;
const SUBMIT_URL = `${BASE_URL}/cvc_cgi/stc/getstc`;

/**
 * Build a base64 `txtCaptcha` whose decoded latin1 form has the given 4-digit
 * answer at byte offset [36, 40). Any 4-character answer works — we use
 * arbitrary digits in tests.
 */
function makeTxtCaptcha(answer: string): string {
  if (answer.length !== 4) throw new Error("answer must be 4 chars");
  const prefix = "X".repeat(36);
  const tail = "Y".repeat(20);
  return Buffer.from(prefix + answer + tail, "latin1").toString("base64");
}

interface CaptchaJson {
  codigorespuesta: number;
  glosarespuesta: string;
  txtCaptcha: string;
}

function captchaResponse(answer: string): {
  body: CaptchaJson;
  init: { status: 200; headers: Record<string, string> };
} {
  return {
    body: {
      codigorespuesta: 0,
      glosarespuesta: "OK",
      txtCaptcha: makeTxtCaptcha(answer),
    },
    init: { status: 200, headers: { "Content-Type": "application/json" } },
  };
}

/** Encode an HTML body as ISO-8859-1 (the wire encoding zeus.sii.cl uses). */
function latin1ArrayBuffer(html: string): ArrayBuffer {
  const buf = Buffer.from(html, "latin1");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** Build a fetch mock that dispatches by URL + RUT body field. */
function makeFetchMock(opts: {
  /** Sequence of captcha answers handed out by the captcha endpoint. */
  captchaAnswers: string[];
  /** Map from RUT body ("97004000") → sequence of HTML responses. */
  rutResponses: Record<string, string[]>;
}): ReturnType<typeof vi.fn> {
  const captchas = [...opts.captchaAnswers];
  const queues: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(opts.rutResponses)) {
    queues[k] = [...v];
  }

  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url === CAPTCHA_URL) {
      if (captchas.length === 0) {
        throw new Error("test captcha queue exhausted");
      }
      const answer = captchas.shift() as string;
      const r = captchaResponse(answer);
      return new Response(JSON.stringify(r.body), r.init);
    }

    if (url === SUBMIT_URL) {
      const body = String(init?.body ?? "");
      const params = new URLSearchParams(body);
      const rutBody = params.get("RUT") ?? "";
      const queue = queues[rutBody];
      if (!queue || queue.length === 0) {
        throw new Error(
          `test rutResponses queue empty for RUT=${rutBody}`,
        );
      }
      const html = queue.shift() as string;
      return new Response(latin1ArrayBuffer(html), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=ISO-8859-1" },
      });
    }

    throw new Error(`unexpected URL: ${url}`);
  });
}

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

/**
 * Active company — 2 actividades económicas, no AVISO, "Empresa de Menor
 * Tamaño: NO". Razón social uses Ñ + tildes which test the latin1 decode.
 */
const BANCO_CHILE_HTML = `<!doctype html>
<html><body>
<div>
  <div>header 1</div>
  <div>header 2</div>
  <div>header 3</div>
  <div>BANCO DE CHILE</div>
  <div>spacer</div>
  <div>97.004.000-5</div>
  <span>Fecha de realización de la consulta: 01-05-2026</span>
  <span>Contribuyente presenta Inicio de Actividades: SI</span>
  <span>Fecha de Inicio de Actividades: 01-01-1893</span>
  <span>Empresa de Menor Tamaño: NO</span>
  <table>
    <tr>
      <td><font>BANCOS Y OTRAS INSTITUCIONES FINANCIERAS</font></td>
      <td><font>641100</font></td>
      <td><font>Primera</font></td>
      <td><font>Si</font></td>
      <td><font>01-01-1893</font></td>
    </tr>
    <tr>
      <td><font>OTROS TIPOS DE INTERMEDIACIÓN MONETARIA</font></td>
      <td><font>649200</font></td>
      <td><font>Primera</font></td>
      <td><font>No</font></td>
      <td><font>15-03-1995</font></td>
    </tr>
  </table>
  <table class="tabla">
    <tr><td><font>Factura Electrónica</font></td><td><font>30</font></td></tr>
  </table>
</div>
</body></html>`;

/**
 * Persona natural that closed (Término de giro). No actividades, AVISO block
 * with the observación line.
 */
const PERSONA_TGIRO_HTML = `<!doctype html>
<html><body>
<div>
  <div>header 1</div>
  <div>header 2</div>
  <div>header 3</div>
  <div>JUAN PÉREZ GONZÁLEZ</div>
  <div>spacer</div>
  <div>11.111.111-1</div>
  <span>Fecha de realización de la consulta: 01-05-2026</span>
  <span>Contribuyente presenta Inicio de Actividades: NO</span>
  <span>Empresa de Menor Tamaño: SI</span>
  <p><b>AVISO</b></p>
  <span>Observación: Término de giro persona natural</span>
  <span>La situación se presenta a contar del 15-08-2024</span>
</div>
</body></html>`;

/** The literal captcha-failure interstitial. */
const CAPTCHA_FAIL_HTML =
  "<script>alert('Por favor reingrese Captcha');history.go(-1);</script>";

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

describe("solveCaptcha", () => {
  it("extracts the 4-digit answer at offset [36, 40) from a base64 payload", () => {
    expect(solveCaptcha(makeTxtCaptcha("1234"))).toBe("1234");
    expect(solveCaptcha(makeTxtCaptcha("9070"))).toBe("9070");
  });

  it("throws when the decoded payload is too short", () => {
    const short = Buffer.from("hello", "latin1").toString("base64");
    expect(() => solveCaptcha(short)).toThrow(/too short/);
  });
});

describe("fetchCaptcha", () => {
  it("posts oper=0 and returns the solved answer", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["4242"],
      rutResponses: {},
    });
    const solved = await fetchCaptcha(
      fetchImpl as unknown as typeof fetch,
      BASE_URL,
    );
    expect(solved.answer).toBe("4242");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CAPTCHA_URL);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("oper=0");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("throws when txtCaptcha is missing from the response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ codigorespuesta: -1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      fetchCaptcha(fetchImpl as unknown as typeof fetch, BASE_URL),
    ).rejects.toThrow(/missing txtCaptcha/);
  });
});

// ----------------------------------------------------------------------------
// HTML parser (pure)
// ----------------------------------------------------------------------------

describe("parseStcHtml", () => {
  it("parses an active-company page with two actividades", () => {
    const out = parseStcHtml(BANCO_CHILE_HTML);
    expect(out.razonSocial).toBe("BANCO DE CHILE");
    expect(out.rut).toBe("97004000-5");
    expect(out.fechaInicio).toBe("01-01-1893");
    expect(out.presentaInicioActividades).toBe(true);
    expect(out.empresaMenorTamano).toBe("NO");
    expect(out.estado).toBe("activa");
    expect(out.actividades).toHaveLength(2);
    expect(out.actividades[0]).toEqual({
      codigo: "641100",
      descripcion: "BANCOS Y OTRAS INSTITUCIONES FINANCIERAS",
      categoria: "Primera",
      afectaIva: true,
      fechaInicio: "01-01-1893",
    });
    expect(out.actividades[1]).toEqual({
      codigo: "649200",
      descripcion: "OTROS TIPOS DE INTERMEDIACIÓN MONETARIA",
      categoria: "Primera",
      afectaIva: false,
      fechaInicio: "15-03-1995",
    });
  });

  it("infers no_vigente when AVISO + Término de giro", () => {
    const out = parseStcHtml(PERSONA_TGIRO_HTML);
    expect(out.razonSocial).toBe("JUAN PÉREZ GONZÁLEZ");
    expect(out.presentaInicioActividades).toBe(false);
    expect(out.empresaMenorTamano).toBe("SI");
    expect(out.actividades).toEqual([]);
    expect(out.observacion).toBe("Término de giro persona natural");
    expect(out.estado).toBe("no_vigente");
  });

  it("throws on the captcha-failure interstitial", () => {
    expect(() => parseStcHtml(CAPTCHA_FAIL_HTML)).toThrow(/captcha rejected/);
  });

  it("infers suspendida when AVISO + Bloqueado/Querella", () => {
    const html = `<html><body><div>
      <div>h1</div><div>h2</div><div>h3</div>
      <div>EMPRESA EJEMPLO SPA</div>
      <div>x</div>
      <div>76.543.210-3</div>
      <p>AVISO</p>
      <span>Observación: Bloqueado por querella</span>
    </div></body></html>`;
    expect(parseStcHtml(html).estado).toBe("suspendida");
  });
});

// ----------------------------------------------------------------------------
// Adapter — full ingest pipeline
// ----------------------------------------------------------------------------

describe("createSiiStcAdapter", () => {
  it("exposes the source id", () => {
    const adapter = createSiiStcAdapter({ ruts: [] });
    expect(adapter.id).toBe("sii-stc");
  });

  it("yields a partial for an active company with the correct RUT, razón social and rubro", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1234"],
      rutResponses: { "97004000": [BANCO_CHILE_HTML] },
    });
    const adapter = createSiiStcAdapter({
      ruts: ["97.004.000-5"], // dotted form must canonicalize
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });

    const out = await collect(adapter.ingest());
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      rut: "97004000-5",
      razonSocial: "BANCO DE CHILE",
      fechaInicio: "01-01-1893",
      estado: "activa",
      rubroCodigo: "641100",
      rubroDescripcion: "BANCOS Y OTRAS INSTITUCIONES FINANCIERAS",
    });

    // Verify the form-post body contains the right fields.
    const submitCall = fetchImpl.mock.calls.find(
      (c) => c[0] === SUBMIT_URL,
    );
    expect(submitCall).toBeDefined();
    const submitInit = submitCall?.[1] as RequestInit;
    const bodyParams = new URLSearchParams(String(submitInit.body));
    expect(bodyParams.get("RUT")).toBe("97004000");
    expect(bodyParams.get("DV")).toBe("5");
    expect(bodyParams.get("PRG")).toBe("STC");
    expect(bodyParams.get("OPC")).toBe("NOR");
    expect(bodyParams.get("txt_code")).toBe("1234");
    expect(bodyParams.get("txt_captcha")).toBe(makeTxtCaptcha("1234"));
  });

  it("yields a partial flagged as no_vigente for a Término-de-giro persona", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["7777"],
      rutResponses: { "11111111": [PERSONA_TGIRO_HTML] },
    });
    const adapter = createSiiStcAdapter({
      ruts: ["11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest());
    expect(out).toHaveLength(1);
    expect(out[0].rut).toBe("11111111-1");
    expect(out[0].razonSocial).toBe("JUAN PÉREZ GONZÁLEZ");
    expect(out[0].estado).toBe("no_vigente");
    expect(out[0].rubroCodigo).toBeUndefined();
  });

  it("preserves Ñ and tildes via ISO-8859-1 decode (not garbled by UTF-8 mismatch)", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111"],
      rutResponses: { "11111111": [PERSONA_TGIRO_HTML] },
    });
    const adapter = createSiiStcAdapter({
      ruts: ["11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest());
    expect(out[0].razonSocial).toContain("PÉREZ");
    expect(out[0].razonSocial).toContain("GONZÁLEZ");
  });

  it("retries once on captcha-fail and then succeeds", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111", "2222"],
      rutResponses: {
        "97004000": [CAPTCHA_FAIL_HTML, BANCO_CHILE_HTML],
      },
    });
    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest());
    expect(out).toHaveLength(1);
    expect(out[0].razonSocial).toBe("BANCO DE CHILE");

    // Captcha was fetched twice (initial + retry), submit was called twice
    const captchaCalls = fetchImpl.mock.calls.filter(
      (c) => c[0] === CAPTCHA_URL,
    );
    const submitCalls = fetchImpl.mock.calls.filter(
      (c) => c[0] === SUBMIT_URL,
    );
    expect(captchaCalls).toHaveLength(2);
    expect(submitCalls).toHaveLength(2);
  });

  it("logs and skips a RUT that captcha-fails twice in a row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111", "2222", "3333"],
      rutResponses: {
        "97004000": [CAPTCHA_FAIL_HTML, CAPTCHA_FAIL_HTML],
        "11111111": [PERSONA_TGIRO_HTML],
      },
    });
    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5", "11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest());
    expect(out.map((p) => p.rut)).toEqual(["11111111-1"]);
    const messages = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(messages).toMatch(/97004000-5/);
    expect(messages).toMatch(/captcha rejected/i);
    warn.mockRestore();
  });

  it("rate-limits between RUTs (default 5000ms, only between requests)", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111", "2222"],
      rutResponses: {
        "97004000": [BANCO_CHILE_HTML],
        "11111111": [PERSONA_TGIRO_HTML],
      },
    });
    const sleepCalls: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });
    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5", "11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep,
    });
    await collect(adapter.ingest());
    expect(sleepCalls).toEqual([5_000]);
  });

  it("respects a custom rateLimitMs", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111", "2222"],
      rutResponses: {
        "97004000": [BANCO_CHILE_HTML],
        "11111111": [PERSONA_TGIRO_HTML],
      },
    });
    const sleepCalls: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      sleepCalls.push(ms);
    });
    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5", "11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      rateLimitMs: 100,
      sleep,
    });
    await collect(adapter.ingest());
    expect(sleepCalls).toEqual([100]);
  });

  it("dedupes and drops invalid RUTs from the input list", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111"],
      rutResponses: {
        "97004000": [BANCO_CHILE_HTML],
      },
    });
    const adapter = createSiiStcAdapter({
      ruts: [
        "97.004.000-5",
        "97004000-5", // canonical duplicate
        "not-a-rut", // invalid
        "97004000-9", // wrong DV
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest());
    expect(out).toHaveLength(1);
    const submitCalls = fetchImpl.mock.calls.filter(
      (c) => c[0] === SUBMIT_URL,
    );
    expect(submitCalls).toHaveLength(1);
  });

  it("respects opts.limit and stops after N partials", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111", "2222"],
      rutResponses: {
        "97004000": [BANCO_CHILE_HTML],
        "11111111": [PERSONA_TGIRO_HTML],
      },
    });
    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5", "11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest({ limit: 1 }));
    expect(out).toHaveLength(1);
    const submitCalls = fetchImpl.mock.calls.filter(
      (c) => c[0] === SUBMIT_URL,
    );
    expect(submitCalls).toHaveLength(1);
  });

  it("respects a pre-aborted signal — never fetches", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: [],
      rutResponses: {},
    });
    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await collect(adapter.ingest({ signal: ctrl.signal }));
    expect(out).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respects an abort signal mid-iteration", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: ["1111", "2222"],
      rutResponses: {
        "97004000": [BANCO_CHILE_HTML],
        "11111111": [PERSONA_TGIRO_HTML],
      },
    });
    const ctrl = new AbortController();
    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5", "11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out: SourcePartial[] = [];
    for await (const p of adapter.ingest({ signal: ctrl.signal })) {
      out.push(p);
      ctrl.abort();
    }
    expect(out).toHaveLength(1);
    expect(out[0].rut).toBe("97004000-5");
    // Only the first RUT's captcha + submit were fetched.
    const submitCalls = fetchImpl.mock.calls.filter(
      (c) => c[0] === SUBMIT_URL,
    );
    expect(submitCalls).toHaveLength(1);
  });

  it("returns nothing for an empty rut list (no fetch fired)", async () => {
    const fetchImpl = makeFetchMock({
      captchaAnswers: [],
      rutResponses: {},
    });
    const adapter = createSiiStcAdapter({
      ruts: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest());
    expect(out).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("logs and skips an individual RUT when its fetch throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error("network down");
      })
      // Captcha for the second RUT
      .mockImplementationOnce(async () => {
        const r = captchaResponse("9999");
        return new Response(JSON.stringify(r.body), r.init);
      })
      // Submit for the second RUT
      .mockImplementationOnce(
        async () =>
          new Response(latin1ArrayBuffer(PERSONA_TGIRO_HTML), {
            status: 200,
            headers: { "Content-Type": "text/html; charset=ISO-8859-1" },
          }),
      );

    const adapter = createSiiStcAdapter({
      ruts: ["97004000-5", "11111111-1"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: BASE_URL,
      sleep: async () => {},
    });
    const out = await collect(adapter.ingest());
    expect(out.map((p) => p.rut)).toEqual(["11111111-1"]);
    const messages = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(messages).toMatch(/97004000-5/);
    expect(messages).toMatch(/network down/);
    warn.mockRestore();
  });
});
