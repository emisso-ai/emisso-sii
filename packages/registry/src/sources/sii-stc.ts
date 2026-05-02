/**
 * SII STC — "Consulta Situación Tributaria de Terceros".
 *
 * Source URL: https://zeus.sii.cl/cvc_cgi/stc/CViewCaptcha.cgi (captcha) +
 *             https://zeus.sii.cl/cvc_cgi/stc/getstc            (form post)
 *
 * Verified live: 2026-05-01.
 *
 * The STC service returns the tax status of an arbitrary RUT: razón social,
 * fecha de inicio de actividades, actividades económicas (giro código +
 * descripción + primera/segunda categoría + afecta IVA + fecha inicio), and
 * (when the contribuyente has them) AVISOs such as "Término de giro persona
 * natural" or "Bloqueado por SII / querella".
 *
 * ── Why this adapter does NOT need a portal session ──────────────────────────
 * The earlier version of this file routed traffic through an authenticated
 * www4.sii.cl session (`portalLogin()` from `@emisso/sii`) on the assumption
 * that authenticated callers bypass the captcha. That assumption was wrong:
 * STC is a **public** service hosted on a different host (`zeus.sii.cl`), it
 * is unrelated to the contribuyente's www4 session, and its captcha is
 * trivially auto-bypassable client-side. So the adapter no longer touches
 * `@emisso/sii` at all.
 *
 * Memory-note: the SII per-RUT session limit (error
 * `01.01.204.500.709.27`) does NOT apply here — STC does not consume a
 * portal session.
 *
 * ── Captcha bypass ───────────────────────────────────────────────────────────
 * The captcha endpoint returns JSON of the form
 *   { codigorespuesta, glosarespuesta, txtCaptcha, ... }
 * where `txtCaptcha` is base64. When decoded as latin1 (ISO-8859-1) the
 * literal 4-digit answer that the user is supposed to copy from the image
 * lives at byte offset [36, 40). The form post echoes both `txtCaptcha`
 * (verbatim) and `txt_code` (the 4 digits). This is the same trick used by
 * three independent OSS scrapers, all of which agree on the offset:
 *   - github.com/pdelteil/sii_situacion_tributaria
 *   - github.com/jcastro-zq/IDFiscal_Chile
 *   - github.com/rodrigore/sii_chile
 * Confirmed by live capture against zeus.sii.cl on 2026-05-01.
 *
 * If the SII rotates the encoding the request will surface a captcha-fail
 * page (`<script>alert('Por favor reingrese Captcha');history.go(-1);</script>`,
 * ~92 bytes). The adapter detects this and retries once with a fresh captcha
 * before giving up on that RUT.
 *
 * ── HTML parsing ─────────────────────────────────────────────────────────────
 * The response is HTML in ISO-8859-1 (NOT UTF-8). We decode via the native
 * `TextDecoder("iso-8859-1")` available on Node ≥ 18 — no `iconv-lite`.
 *
 * Selector reference (from real `BANCO DE CHILE` 97004000-5 sample):
 *   - Razón Social        → first body div, 4th direct child div
 *   - RUT con DV          → first body div, 6th direct child div
 *   - Fecha consulta      → <span> starting with "Fecha de realización de la consulta:"
 *   - Inicio Actividades  → <span> starting with "Contribuyente presenta Inicio de Actividades:"
 *   - Fecha Inicio Act.   → <span> starting with "Fecha de Inicio de Actividades:"
 *   - Empresa Menor Tamaño→ <span> starting with "Empresa de Menor Tama"
 *   - Actividades         → first <table> inside the body div, rows of 5 td/font cells
 *   - Documentos timbrados→ <table class="tabla">, rows of 2 td/font cells
 *   - Estado / observ.    → block "AVISO" + free-text observación
 *
 * NOTE: `tramoVentas` and `domicilio` were claimed by the old adapter but
 * **do not exist** in the public STC HTML — they were inventions. They have
 * been removed from the partial entirely.
 *
 * ── Estado inference ─────────────────────────────────────────────────────────
 *   AVISO contains "Término de giro"            → "no_vigente"
 *   AVISO contains "Bloqueado" or "Querella"    → "suspendida"
 *   No AVISO + non-empty actividades            → "activa"
 *   No AVISO + Inicio de Actividades = "NO"     → "activa" (persona sin actividad iniciada)
 *   No AVISO + empty actividades                → "activa" (best guess)
 *
 * Per-RUT failures (network, parse) are logged and skipped; the batch
 * continues.
 */

import { load, type CheerioAPI } from "cheerio";

import { canonicalizeRut, cleanText } from "../normalize";
import type {
  CompanyEstado,
  SourceAdapter,
  SourceIngestOptions,
  SourcePartial,
} from "../types";

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

/** Default base URL for the STC service. Captcha + form post live under it. */
const DEFAULT_BASE_URL = "https://zeus.sii.cl";

const CAPTCHA_PATH = "/cvc_cgi/stc/CViewCaptcha.cgi";
const SUBMIT_PATH = "/cvc_cgi/stc/getstc";

/** Default delay between requests (ms). SII is strict; 5s per spec. */
const DEFAULT_RATE_LIMIT_MS = 5_000;

/**
 * Offsets within the latin1-decoded `txtCaptcha` payload where the literal
 * 4-digit answer lives. Confirmed across three OSS scrapers + live capture.
 */
const CAPTCHA_ANSWER_OFFSET = 36;
const CAPTCHA_ANSWER_LENGTH = 4;

/**
 * Marker substring of the captcha-failure HTML response. The full body is
 * roughly `<script>alert('Por favor reingrese Captcha');history.go(-1);</script>`.
 */
const CAPTCHA_FAIL_MARKER = "Por favor reingrese Captcha";

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

export interface SiiStcAdapterOptions {
  /**
   * Explicit list of target RUTs to enrich. The adapter canonicalizes each
   * one and skips duplicates / invalid entries.
   */
  ruts: string[];
  /** Override the global `fetch` (mostly for tests). */
  fetchImpl?: typeof fetch;
  /** Override the rate-limit delay between RUTs (default 5000ms). */
  rateLimitMs?: number;
  /** Override the base URL (default https://zeus.sii.cl). For tests. */
  baseUrl?: string;
  /**
   * Override the sleep primitive. Defaults to `setTimeout` and respects
   * `AbortSignal`. Tests inject a no-op so they don't actually wait.
   */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** One row of the STC actividades económicas table. */
export interface SiiStcActividad {
  /** 6-digit SII activity code. */
  codigo: string;
  /** Free-text description ("Servicios de consultoría informática", etc.). */
  descripcion: string;
  /** "Primera" or "Segunda" categoría (or undefined if unknown). */
  categoria?: "Primera" | "Segunda";
  /** True if the SII reports this activity as IVA-affected. */
  afectaIva?: boolean;
  /** Fecha de inicio of this specific activity, as printed (DD-MM-YYYY). */
  fechaInicio?: string;
}

/** Full structured shape of a parsed STC page (super-set of `SourcePartial`). */
export interface SiiStcParseResult {
  rut?: string;
  razonSocial?: string;
  fechaInicio?: string;
  estado?: CompanyEstado;
  /** Did the SII flag "Contribuyente presenta Inicio de Actividades: SI"? */
  presentaInicioActividades?: boolean;
  /** "SI"/"NO" for "Empresa de Menor Tamaño" (typed loosely so SII text changes don't break it). */
  empresaMenorTamano?: string;
  actividades: SiiStcActividad[];
  /** Free-text "Observación" line printed under an AVISO block. */
  observacion?: string;
}

// ----------------------------------------------------------------------------
// Adapter
// ----------------------------------------------------------------------------

export function createSiiStcAdapter(
  options: SiiStcAdapterOptions,
): SourceAdapter {
  const ruts = options.ruts;
  const fetchImpl = options.fetchImpl ?? fetch;
  const rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const sleep = options.sleep ?? defaultSleep;

  return {
    id: "sii-stc",
    ingest(opts?: SourceIngestOptions) {
      return ingest(
        { ruts, fetchImpl, rateLimitMs, baseUrl, sleep },
        opts,
      );
    },
  };
}

interface IngestContext {
  ruts: string[];
  fetchImpl: typeof fetch;
  rateLimitMs: number;
  baseUrl: string;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

async function* ingest(
  ctx: IngestContext,
  opts: SourceIngestOptions = {},
): AsyncGenerator<SourcePartial, void, void> {
  const { signal, limit } = opts;
  if (signal?.aborted) return;

  const targets = canonicalizeTargets(ctx.ruts);
  if (targets.length === 0) return;

  let emitted = 0;
  let isFirst = true;

  for (const rut of targets) {
    if (signal?.aborted) return;
    if (typeof limit === "number" && emitted >= limit) return;

    if (!isFirst && ctx.rateLimitMs > 0) {
      await ctx.sleep(ctx.rateLimitMs, signal);
      if (signal?.aborted) return;
    }
    isFirst = false;

    let partial: SourcePartial | null;
    try {
      partial = await fetchOne(ctx, rut, signal);
    } catch (err) {
      logFetchFailure(rut, err);
      continue;
    }

    if (partial === null) continue;
    yield partial;
    emitted++;
  }
}

function canonicalizeTargets(ruts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ruts) {
    if (!raw) continue;
    let canon: string;
    try {
      canon = canonicalizeRut(raw);
    } catch {
      continue;
    }
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Network — captcha + submit
// ----------------------------------------------------------------------------

interface SolvedCaptcha {
  txtCaptcha: string;
  answer: string;
}

/**
 * Fetch and solve a captcha. The SII captcha is self-defeating: the JSON
 * payload includes the literal answer at byte offset [36, 40) of the
 * latin1-decoded `txtCaptcha`. See file header for citations.
 */
export async function fetchCaptcha(
  fetchImpl: typeof fetch,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<SolvedCaptcha> {
  const res = await fetchImpl(`${baseUrl}${CAPTCHA_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "oper=0",
    signal,
  });
  if (!res.ok) {
    throw new Error(
      `[sii-stc] captcha fetch failed: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const json = (await res.json()) as { txtCaptcha?: unknown };
  const txtCaptcha = json.txtCaptcha;
  if (typeof txtCaptcha !== "string" || txtCaptcha.length === 0) {
    throw new Error("[sii-stc] captcha payload missing txtCaptcha");
  }
  return { txtCaptcha, answer: solveCaptcha(txtCaptcha) };
}

/**
 * Decode the base64 `txtCaptcha` string and extract the 4-digit answer at
 * offset [36, 40). Exposed for tests.
 */
export function solveCaptcha(txtCaptcha: string): string {
  const decoded = Buffer.from(txtCaptcha, "base64").toString("latin1");
  if (decoded.length < CAPTCHA_ANSWER_OFFSET + CAPTCHA_ANSWER_LENGTH) {
    throw new Error(
      `[sii-stc] captcha payload too short to contain answer ` +
        `(decoded length ${decoded.length})`,
    );
  }
  return decoded.slice(
    CAPTCHA_ANSWER_OFFSET,
    CAPTCHA_ANSWER_OFFSET + CAPTCHA_ANSWER_LENGTH,
  );
}

/**
 * POST the STC form for one RUT. Returns the response body decoded as
 * ISO-8859-1 (the native encoding of zeus.sii.cl HTML).
 */
export async function fetchStc(
  fetchImpl: typeof fetch,
  baseUrl: string,
  rutBody: string,
  dv: string,
  txtCaptcha: string,
  answer: string,
  signal?: AbortSignal,
): Promise<string> {
  const body = new URLSearchParams({
    RUT: rutBody,
    DV: dv,
    PRG: "STC",
    OPC: "NOR",
    txt_code: answer,
    txt_captcha: txtCaptcha,
  });
  const res = await fetchImpl(`${baseUrl}${SUBMIT_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal,
  });
  if (!res.ok) {
    throw new Error(
      `[sii-stc] submit failed: HTTP ${res.status} ${res.statusText}`,
    );
  }
  const buf = await res.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buf);
}

async function fetchOne(
  ctx: IngestContext,
  rut: string,
  signal?: AbortSignal,
): Promise<SourcePartial | null> {
  const [body, dv] = rut.split("-");

  // Up to 2 attempts: if the first response is the "reingrese captcha" page
  // we retry once with a fresh captcha. After that we give up on this RUT.
  const MAX_ATTEMPTS = 2;
  let html = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return null;
    const captcha = await fetchCaptcha(ctx.fetchImpl, ctx.baseUrl, signal);
    if (signal?.aborted) return null;
    html = await fetchStc(
      ctx.fetchImpl,
      ctx.baseUrl,
      body,
      dv,
      captcha.txtCaptcha,
      captcha.answer,
      signal,
    );
    if (!html.includes(CAPTCHA_FAIL_MARKER)) break;
    if (attempt === MAX_ATTEMPTS - 1) {
      throw new Error("[sii-stc] captcha rejected after retry");
    }
  }

  const parsed = parseStcHtml(html);
  return projectToPartial(parsed, rut);
}

// ----------------------------------------------------------------------------
// HTML parser
// ----------------------------------------------------------------------------

/**
 * Parse a raw STC HTML page into a structured shape. Pure function — exposed
 * so callers can run their own analysis without the network plumbing.
 *
 * Throws if the page is the "reingrese captcha" interstitial; the adapter's
 * retry loop catches that earlier, so this throw is defensive.
 */
export function parseStcHtml(html: string): SiiStcParseResult {
  if (html.includes(CAPTCHA_FAIL_MARKER)) {
    throw new Error("[sii-stc] captcha rejected");
  }

  const $ = load(html);
  const root = $("body > div").first();

  const result: SiiStcParseResult = {
    actividades: [],
  };

  // --- Razón social: /html/body/div/div[4] -----------------------------------
  const razonSocial = cleanText(
    root.children("div").eq(3).text(),
  );
  if (razonSocial) result.razonSocial = razonSocial;

  // --- RUT-with-DV: /html/body/div/div[6] ------------------------------------
  const rutText = cleanText(root.children("div").eq(5).text());
  if (rutText) {
    const m = rutText.match(/(\d{1,8}[\d.]*-?[0-9Kk])/);
    if (m) {
      try {
        result.rut = canonicalizeRut(m[1]);
      } catch {
        // ignore — we'll fall back to the canonical RUT supplied by the caller
      }
    }
  }

  // --- Span-labelled fields --------------------------------------------------
  $("span").each((_, el) => {
    const text = cleanText($(el).text());
    if (!text) return;

    if (text.startsWith("Contribuyente presenta Inicio de Actividades:")) {
      const value = afterColon(text);
      if (value) result.presentaInicioActividades = /^si$/i.test(value);
      return;
    }
    if (text.startsWith("Fecha de Inicio de Actividades:")) {
      const value = afterColon(text);
      if (value) result.fechaInicio = value;
      return;
    }
    if (text.startsWith("Empresa de Menor Tama")) {
      const value = afterColon(text);
      if (value) result.empresaMenorTamano = value;
      return;
    }
    if (text.startsWith("Observación:")) {
      const value = afterColon(text);
      if (value) result.observacion = value;
      return;
    }
  });

  // --- Actividades económicas (first table inside the root div) -------------
  result.actividades = parseActividadesTable($, root);

  // --- Estado inference -----------------------------------------------------
  result.estado = inferEstado($, result);

  return result;
}

function afterColon(text: string): string {
  const idx = text.indexOf(":");
  if (idx === -1) return "";
  return text.slice(idx + 1).trim();
}

function parseActividadesTable(
  $: CheerioAPI,
  root: ReturnType<CheerioAPI>,
): SiiStcActividad[] {
  const out: SiiStcActividad[] = [];
  // First non-`tabla` table inside root — the documentos-timbrados block uses
  // `class="tabla"` and we want to skip it. We DO accept it as a fallback if
  // it's the only table available.
  const tables = root.find("table");
  if (tables.length === 0) return out;

  let chosen = tables.filter((_, t) => !$(t).hasClass("tabla")).first();
  if (chosen.length === 0) chosen = tables.first();

  chosen.find("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;

    // Each cell wraps its content in <font> per the live SII markup. Fall
    // back to the cell's text if there's no <font>.
    const readCell = (i: number): string => {
      if (i >= cells.length) return "";
      const cell = cells.eq(i);
      const fontText = cleanText(cell.find("font").first().text());
      if (fontText) return fontText;
      return cleanText(cell.text()) ?? "";
    };

    const descripcion = readCell(0);
    const codigo = readCell(1);
    const categoriaRaw = readCell(2);
    const afectaIvaRaw = readCell(3);
    const fechaInicio = readCell(4);

    // A real activity row has a 6-digit code in column 2.
    if (!/^\d{6}$/.test(codigo)) return;
    if (!descripcion) return;

    const actividad: SiiStcActividad = { codigo, descripcion };

    if (/primera/i.test(categoriaRaw)) actividad.categoria = "Primera";
    else if (/segunda/i.test(categoriaRaw)) actividad.categoria = "Segunda";

    if (/^si$/i.test(afectaIvaRaw)) actividad.afectaIva = true;
    else if (/^no$/i.test(afectaIvaRaw)) actividad.afectaIva = false;

    if (fechaInicio) actividad.fechaInicio = fechaInicio;

    out.push(actividad);
  });

  return out;
}

function inferEstado(
  $: CheerioAPI,
  parsed: SiiStcParseResult,
): CompanyEstado {
  // Search for an AVISO marker. We look at the body text rather than a
  // specific selector — the SII inconsistently styles this block.
  const bodyText = $("body").text();
  const lower = bodyText.toLowerCase();

  // Only treat as AVISO if the literal word appears AND we have a known
  // observation pattern; otherwise we'd mis-classify pages that happen to
  // mention "aviso" in another context.
  const hasAviso = lower.includes("aviso");
  const obs = (parsed.observacion ?? "").toLowerCase();
  const observacionInBody =
    lower.includes("término de giro") ||
    lower.includes("termino de giro") ||
    lower.includes("bloqueado") ||
    lower.includes("querella");

  if (hasAviso && observacionInBody) {
    if (obs.includes("término de giro") || obs.includes("termino de giro")) {
      return "no_vigente";
    }
    if (obs.includes("bloqueado") || obs.includes("querella")) {
      return "suspendida";
    }
    // AVISO present, body mentions one of those terms but observación field
    // didn't get parsed — fall back to the body text.
    if (lower.includes("término de giro") || lower.includes("termino de giro")) {
      return "no_vigente";
    }
    return "suspendida";
  }

  // No AVISO → activa.
  return "activa";
}

// ----------------------------------------------------------------------------
// Projection: parsed → SourcePartial
// ----------------------------------------------------------------------------

function projectToPartial(
  parsed: SiiStcParseResult,
  canonicalRut: string,
): SourcePartial | null {
  const partial: SourcePartial = { rut: canonicalRut };

  if (parsed.razonSocial) partial.razonSocial = parsed.razonSocial;
  if (parsed.fechaInicio) partial.fechaInicio = parsed.fechaInicio;
  if (parsed.estado) partial.estado = parsed.estado;

  const primary = parsed.actividades[0];
  if (primary) {
    partial.rubroCodigo = primary.codigo;
    partial.rubroDescripcion = primary.descripcion;
  }

  // Treat as "no encontrado" only when literally nothing useful came back.
  const hasContent =
    partial.razonSocial !== undefined ||
    partial.fechaInicio !== undefined ||
    partial.rubroCodigo !== undefined ||
    parsed.estado !== undefined;
  if (!hasContent) return null;

  return partial;
}

// ----------------------------------------------------------------------------
// Diagnostics
// ----------------------------------------------------------------------------

function logFetchFailure(rut: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.warn(`[sii-stc] failed to enrich ${rut}: ${message}`);
}

// ----------------------------------------------------------------------------
// Sleep
// ----------------------------------------------------------------------------

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return new DOMException("Aborted", "AbortError");
}
