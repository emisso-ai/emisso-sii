/**
 * CNC (Cámara Nacional de Comercio, Servicios y Turismo de Chile) source
 * adapter.
 *
 * The CNC publishes its socios directory across five sub-pages, partitioned by
 * member archetype. Verified live on 2026-05-01:
 *
 *   - https://cnc.cl/socios/empresas                       (~22 individual companies)
 *   - https://cnc.cl/socios/asociaciones-especializadas    (~35 sectoral guilds:
 *                                                            ABA, ANIB, ASIPLA, …)
 *   - https://cnc.cl/socios/camaras-regionales             (~19 regional chambers)
 *   - https://cnc.cl/socios/camaras-binacionales           (~14 bi-national chambers:
 *                                                            AmCham, CamChino,
 *                                                            Chileno-Alemana, …)
 *   - https://cnc.cl/socios/corporaciones-y-fundaciones    (~1)
 *
 * Total ≈ 91 socios with razón social + (often) sitio web + (often) teléfono.
 *
 * ── Why `ingest()` yields nothing ────────────────────────────────────────────
 * CNC does NOT expose RUTs. The {@link SourceAdapter} contract requires `rut`
 * on every emitted partial, so we cannot legitimately yield from `ingest()`
 * without first cross-referencing each razón social against another source
 * (Empresas-en-un-Día / SII / ChileCompra) to resolve the RUT. That cross-
 * reference is out of scope for this adapter; the merger handles it later.
 *
 * Therefore: `ingest()` returns an empty async iterable. To consume CNC data
 * directly, callers should use {@link listCncSocios} which yields
 * `{ razonSocial, sitioWeb?, telefono?, categoria }` records suitable for
 * downstream RUT resolution. This mirrors the design used by `sofofa.ts`.
 *
 * ── HTML structure (verified 2026-05-01) ─────────────────────────────────────
 * Each sub-page lists socios as `div.card` elements. The card text follows
 * the shape:
 *
 *   <NOMBRE> Fono: <TELEFONO> <URL>
 *
 * with `Fono:` and the URL both optional. Examples observed live:
 *
 *   "Bata Chile S.A Fono: 56 (2) 2560 4200 http://www.bata.com"
 *   "Alto S.A.  http://alto.cl"
 *   "British American Tobacco Chile Fono: 56 (2) 464 6000 http://www.chiletabacos.cl"
 *
 * When the URL is not in the text, an `<a href="http…">` inside the card is
 * used as a fallback.
 */

import * as cheerio from "cheerio";
import type { SourceAdapter, SourceIngestOptions, SourcePartial } from "../types";
import { cleanText } from "../normalize";

// ----------------------------------------------------------------------------
// Public surface
// ----------------------------------------------------------------------------

export type CncCategoria =
  | "empresas"
  | "asociaciones-especializadas"
  | "camaras-regionales"
  | "camaras-binacionales"
  | "corporaciones-y-fundaciones";

export interface CncAdapterOptions {
  /** Override the default `fetch` implementation (testability). */
  fetchImpl?: typeof fetch;
  /** Override the directory base URL. Defaults to https://cnc.cl/socios/. */
  baseUrl?: string;
  /**
   * Override the inter-request delay (ms). Defaults to 1500. Exposed for
   * forward-compat; not consumed by `ingest()` since it never fetches.
   */
  delayMs?: number;
}

export interface CncSocio {
  razonSocial: string;
  sitioWeb?: string;
  telefono?: string;
  categoria: CncCategoria;
}

export interface ListCncSociosOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
  /** Hard cap on records yielded across all sub-URLs. */
  limit?: number;
  /**
   * Override the inter-request delay (ms). Defaults to 1500. Exposed for
   * tests; production callers should not change this — CNC is a small site
   * and we should be polite.
   * @internal
   */
  delayMs?: number;
}

const DEFAULT_BASE_URL = "https://cnc.cl/socios/";

/** Rate limit between HTTP requests (ms). CNC is a small site; be polite. */
const DELAY_MS = 1500;

const CATEGORIAS: readonly CncCategoria[] = [
  "empresas",
  "asociaciones-especializadas",
  "camaras-regionales",
  "camaras-binacionales",
  "corporaciones-y-fundaciones",
] as const;

// ----------------------------------------------------------------------------
// Adapter
// ----------------------------------------------------------------------------

/**
 * Create a CNC source adapter. `ingest()` yields NOTHING because the source
 * does not expose RUTs. Use {@link listCncSocios} for raw records.
 */
export function createCncAdapter(options: CncAdapterOptions = {}): SourceAdapter {
  // Reserved for future use when a RUT-resolution layer is added.
  void options;

  return {
    id: "cnc",
    async *ingest(_opts?: SourceIngestOptions): AsyncIterable<SourcePartial> {
      // CNC publishes no RUTs. Emit nothing until a cross-reference layer
      // resolves razón social → RUT against another source.
      return;
    },
  };
}

// ----------------------------------------------------------------------------
// Raw socio listing (caller-driven RUT resolution)
// ----------------------------------------------------------------------------

/**
 * Stream socios from CNC's directory across the five sub-pages. Yields
 * `{ razonSocial, sitioWeb?, telefono?, categoria }` records with
 * `cleanText` applied to all string fields. Respects the rate limit
 * between HTTP requests.
 *
 * If a sub-page fetch fails, the error is swallowed and iteration continues
 * with the next sub-page so a single transient 5xx does not abort the sweep.
 *
 * The caller is responsible for resolving each record's RUT (typically by
 * fuzzy-matching `razonSocial` against Empresas-en-un-Día / SII).
 *
 * @example
 * ```ts
 * for await (const socio of listCncSocios({ signal })) {
 *   const rut = await resolveRut(socio.razonSocial);
 *   if (rut) emit({ rut, razonSocial: socio.razonSocial, sitioWeb: socio.sitioWeb });
 * }
 * ```
 */
export async function* listCncSocios(
  opts: ListCncSociosOptions = {},
): AsyncIterable<CncSocio> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const signal = opts.signal;
  const delayMs = opts.delayMs ?? DELAY_MS;
  const limit = opts.limit;

  if (signal?.aborted) return;

  let yielded = 0;
  let firstFetch = true;

  for (const categoria of CATEGORIAS) {
    if (signal?.aborted) return;
    if (limit !== undefined && yielded >= limit) return;

    const subUrl = absoluteUrl(categoria, baseUrl);

    // Rate-limit before every fetch except the very first one.
    if (!firstFetch && delayMs > 0) {
      await sleep(delayMs, signal);
      if (signal?.aborted) return;
    }
    firstFetch = false;

    let html: string;
    try {
      html = await fetchHtml(fetchImpl, subUrl, signal);
    } catch {
      // Tolerate per-sub-URL failures: skip this categoria and move on.
      continue;
    }

    if (signal?.aborted) return;

    for (const socio of extractCards(html, categoria)) {
      if (signal?.aborted) return;
      if (limit !== undefined && yielded >= limit) return;
      yield socio;
      yielded++;
    }
  }
}

// ----------------------------------------------------------------------------
// HTML extraction (selectors verified against live CNC HTML on 2026-05-01)
// ----------------------------------------------------------------------------

/**
 * Parse a CNC sub-page and return its socios. Each `div.card` is parsed in
 * three steps:
 *
 *   1. URL  → first inline `https?://…` token in the text, falling back to the
 *             first `<a href="http…">` inside the card.
 *   2. Phone → captured from the `Fono: <digits/spaces/()+-/>` token after the
 *              URL is removed from the working text.
 *   3. Razón social → whatever non-empty text remains before `Fono:` and the
 *              URL, with any anchor-only labels (e.g. "visitar") stripped via
 *              `cleanText`.
 *
 * This three-pass approach is more forgiving than a single monolithic regex
 * because real CNC cards may include trailing anchor labels ("visitar") that
 * a strict regex would refuse.
 */
function extractCards(html: string, categoria: CncCategoria): CncSocio[] {
  const $ = cheerio.load(html);
  const out: CncSocio[] = [];

  const urlRe = /(https?:\/\/\S+)/i;
  const phoneRe = /Fono:\s*([\d\s()+\-]+?)\s*(?:$|(?=https?:\/\/))/i;

  $("div.card").each((_, el) => {
    const card = $(el);

    // Strip anchor *text* (e.g. "visitar") before extracting the line; the
    // anchor `href` is recovered separately below as a URL fallback.
    const cardForText = card.clone();
    cardForText.find("a").remove();
    const raw = cleanText(cardForText.text());
    if (!raw) return;

    // 1. URL — prefer inline, fall back to the first http anchor.
    let working = raw;
    let sitioWeb = cleanText(working.match(urlRe)?.[1]);
    if (sitioWeb) {
      working = working.replace(urlRe, "").trim();
    } else {
      const href = card.find('a[href^="http"]').first().attr("href");
      sitioWeb = cleanText(href);
    }

    // 2. Phone — only the digits/spaces/()+- after "Fono:".
    const phoneMatch = working.match(phoneRe);
    const telefono = cleanText(phoneMatch?.[1]);
    if (phoneMatch) {
      working = working.replace(phoneRe, "").trim();
      // Also strip any leftover bare "Fono:" with no digits.
      working = working.replace(/Fono:\s*$/i, "").trim();
    }

    // 3. Razón social — what's left.
    const razonSocial = cleanText(working);
    if (!razonSocial) return;

    const socio: CncSocio = { razonSocial, categoria };
    if (sitioWeb) socio.sitioWeb = sitioWeb;
    if (telefono) socio.telefono = telefono;
    out.push(socio);
  });

  return out;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function fetchHtml(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const init: RequestInit = signal ? { signal } : {};
  const res = await fetchImpl(url, init);
  if (!res.ok) {
    throw new Error(`CNC: GET ${url} → ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
