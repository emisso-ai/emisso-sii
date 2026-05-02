/**
 * Sofofa (Sociedad de Fomento Fabril) source adapter.
 *
 * Sofofa is Chile's federation of industrial companies. Its public socios
 * directory (~3,500 members) is at https://web.sofofa.cl/socios/, paginated by
 * sector. Each entry typically shows: razón social, sector industrial, sitio
 * web, and (sometimes) a contact email.
 *
 * ── Why `ingest()` yields nothing ────────────────────────────────────────────
 * Sofofa does NOT publish RUT alongside socios. The {@link SourceAdapter}
 * contract requires `rut` on every emitted partial, so we cannot legitimately
 * yield from `ingest()` without first cross-referencing each razón social
 * against another source (Empresas-en-un-Día / SII / ChileCompra) to resolve
 * the RUT. That cross-reference is out of scope for this adapter; the merger
 * will handle it later.
 *
 * Therefore: `ingest()` returns an empty async iterable. To consume Sofofa
 * data directly, callers should use {@link listSofofaSocios} which yields
 * `{ razonSocial, sector, sitioWeb }` records suitable for downstream RUT
 * resolution.
 *
 * ── Selector assumptions (NOT verified against live HTML) ────────────────────
 * The actual Sofofa HTML structure is undocumented; the selectors below
 * encode best-guesses based on common WordPress directory plugins and the
 * site's general layout. They MUST be revalidated against real fixtures
 * before this adapter ships against production.
 *
 *   Sector index page (https://web.sofofa.cl/socios/):
 *     - `a.sector-link[href]` — list of sector category URLs
 *
 *   Sector listing page (e.g. .../socios/?sector=alimentos):
 *     - `.socio-card` — each socio entry container
 *     - `.socio-card .socio-nombre` — razón social
 *     - `.socio-card .socio-sector` — sector text (fallback to current sector page)
 *     - `.socio-card a.socio-website[href]` — sitio web
 *     - `a.next-page[href]` — next-page pagination link
 */

import * as cheerio from "cheerio";
import type { SourceAdapter, SourceIngestOptions, SourcePartial } from "../types";
import { cleanText } from "../normalize";

// ----------------------------------------------------------------------------
// Public surface
// ----------------------------------------------------------------------------

export interface SofofaAdapterOptions {
  /** Override the default `fetch` implementation (testability). */
  fetchImpl?: typeof fetch;
  /** Override the directory base URL. Defaults to https://web.sofofa.cl/socios/. */
  baseUrl?: string;
}

export interface SofofaSocio {
  razonSocial: string;
  sector?: string;
  sitioWeb?: string;
}

export interface ListSofofaSociosOptions {
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
  /**
   * Override the inter-request delay (ms). Defaults to 1500. Exposed for
   * tests; production callers should not change this — Sofofa is a small
   * site and we should be polite.
   * @internal
   */
  rateLimitMs?: number;
}

const DEFAULT_BASE_URL = "https://web.sofofa.cl/socios/";

/** Rate limit between HTTP requests (ms). Sofofa is a small site; be polite. */
const RATE_LIMIT_MS = 1500;

// ----------------------------------------------------------------------------
// Adapter
// ----------------------------------------------------------------------------

/**
 * Create a Sofofa source adapter. `ingest()` yields NOTHING because the source
 * does not expose RUTs. Use {@link listSofofaSocios} for raw records.
 */
export function createSofofaAdapter(options: SofofaAdapterOptions = {}): SourceAdapter {
  // Reserved for future use when a RUT-resolution layer is added.
  void options;

  return {
    id: "sofofa",
    async *ingest(_opts?: SourceIngestOptions): AsyncIterable<SourcePartial> {
      // Sofofa publishes no RUTs. Emit nothing until a cross-reference layer
      // resolves razón social → RUT against another source.
      return;
    },
  };
}

// ----------------------------------------------------------------------------
// Raw socio listing (caller-driven RUT resolution)
// ----------------------------------------------------------------------------

/**
 * Stream socios from Sofofa's directory, paginated by sector.
 *
 * Yields `{ razonSocial, sector, sitioWeb }` records with `cleanText` applied
 * to all string fields. Respects the rate limit between HTTP requests.
 *
 * The caller is responsible for resolving each record's RUT (typically by
 * fuzzy-matching `razonSocial` against Empresas-en-un-Día / SII).
 *
 * @example
 * ```ts
 * for await (const socio of listSofofaSocios({ signal })) {
 *   const rut = await resolveRut(socio.razonSocial);
 *   if (rut) emit({ rut, razonSocial: socio.razonSocial, sitioWeb: socio.sitioWeb });
 * }
 * ```
 */
export async function* listSofofaSocios(
  opts: ListSofofaSociosOptions = {},
): AsyncIterable<SofofaSocio> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const signal = opts.signal;
  const rateLimitMs = opts.rateLimitMs ?? RATE_LIMIT_MS;

  if (signal?.aborted) return;

  // 1. Fetch the index to discover sector pages.
  const indexHtml = await fetchHtml(fetchImpl, baseUrl, signal);
  if (signal?.aborted) return;

  const sectorUrls = extractSectorUrls(indexHtml, baseUrl);

  // If no explicit sector links are found, treat the index itself as the
  // single listing page (defensive against layout drift).
  const startUrls = sectorUrls.length > 0 ? sectorUrls : [baseUrl];

  // 2. For each sector, walk pagination and yield socios.
  for (const sectorUrl of startUrls) {
    if (signal?.aborted) return;

    let nextUrl: string | undefined = sectorUrl;
    const visited = new Set<string>();

    while (nextUrl !== undefined) {
      if (signal?.aborted) return;
      if (visited.has(nextUrl)) break; // safety: prevent infinite loops
      visited.add(nextUrl);

      // Rate-limit before every request (except the very first sector URL,
      // which is delayed implicitly by the index fetch above).
      if (rateLimitMs > 0) {
        await sleep(rateLimitMs, signal);
        if (signal?.aborted) return;
      }

      const html = await fetchHtml(fetchImpl, nextUrl, signal);
      if (signal?.aborted) return;

      const { socios, nextPageUrl } = extractSectorPage(html, nextUrl);
      for (const socio of socios) {
        if (signal?.aborted) return;
        yield socio;
      }

      nextUrl = nextPageUrl;
    }
  }
}

// ----------------------------------------------------------------------------
// HTML extraction (selectors documented in the file header)
// ----------------------------------------------------------------------------

function extractSectorUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $("a.sector-link[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    urls.push(absoluteUrl(href, baseUrl));
  });
  return urls;
}

function extractSectorPage(
  html: string,
  pageUrl: string,
): { socios: SofofaSocio[]; nextPageUrl?: string } {
  const $ = cheerio.load(html);
  const socios: SofofaSocio[] = [];

  $(".socio-card").each((_, el) => {
    const card = $(el);
    const razonRaw = card.find(".socio-nombre").first().text();
    const razonSocial = cleanText(razonRaw);
    if (!razonSocial) return;

    const sector = cleanText(card.find(".socio-sector").first().text());
    const sitioRaw = card.find("a.socio-website[href]").first().attr("href");
    const sitioWeb = cleanText(sitioRaw);

    const socio: SofofaSocio = { razonSocial };
    if (sector) socio.sector = sector;
    if (sitioWeb) socio.sitioWeb = sitioWeb;
    socios.push(socio);
  });

  const nextHref = $("a.next-page[href]").first().attr("href");
  const nextPageUrl = nextHref ? absoluteUrl(nextHref, pageUrl) : undefined;

  return { socios, nextPageUrl };
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
    throw new Error(`Sofofa: GET ${url} → ${res.status} ${res.statusText}`);
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
