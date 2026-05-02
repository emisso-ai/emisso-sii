/**
 * CMF (Comisión para el Mercado Financiero) source adapter.
 *
 * CMF is Chile's financial markets regulator. Its public consultation portal
 * exposes "fiscalizados" (regulated entities) per vertical via a single page:
 *
 *   https://www.cmfchile.cl/institucional/mercados/consulta.php
 *     ?mercado={M}&Estado=VI&entidad={CODE}      // also accepts &consulta={CODE}
 *
 * STRATEGY
 * --------
 * The endpoint above returns the FULL universe for a vertical in a single HTML
 * response (no pagination). We iterate the 5 verified verticals listed in
 * {@link CMF_VERTICALS}, parse each table row into a `SourcePartial`, and yield
 * everything with `signals.emisorRegulado: true`.
 *
 * VERIFIED VERTICALS (verified live on 2026-05-01)
 * ------------------------------------------------
 * | rubroDescripcion                         | mercado | code  | param    | rows |
 * | ---------------------------------------- | ------- | ----- | -------- | ---- |
 * | Emisor de Valores                        | V       | RVEMI | entidad  |  350 |
 * | Corredor de Bolsa                        | V       | COBOL | entidad  |   24 |
 * | AFP                                      | V       | RGAFP | entidad  |    6 |
 * | Compañía de Seguros de Vida              | S       | CSVID | consulta |   32 |
 * | Entidad Informante Ley 20.382            | O       | RGEIN | consulta |  441 |
 *
 * HTML SHAPE (verified live)
 * --------------------------
 *   <table>
 *     <tr>...legal/header...</tr>
 *     <tr>...legal/header...</tr>
 *     <tr>
 *       <td><a href="entidad.php?...">12345678-K</a></td>
 *       <td><a href="entidad.php?...">RAZÓN SOCIAL S.A.</a></td>
 *       <td class="nowrap">VI</td>          <!-- VI = vigente, NV = no vigente -->
 *     </tr>
 *     ...
 *   </table>
 *
 * We identify entity rows by the presence of an `<a href="entidad.php?...">`
 * anchor anywhere in the row (skipping the two header rows that have none).
 *
 * BANKS — NOT IN V1
 * -----------------
 * Banks are NOT exposed via `consulta.php`. Their landing
 * (`/portal/principal/613/w3-propertyvalue-29006.html`) lists 18 vigentes via
 * anchors but does NOT publish RUTs. The {@link SourceAdapter} contract
 * requires `rut` on every emitted partial, so banks are intentionally skipped
 * here until a complementary RUT source is wired in.
 *
 * RATE LIMITING
 * -------------
 * One request per vertical → 5 requests total per full sweep. We sleep
 * `requestDelayMs` (default 2 s) BETWEEN verticals.
 */

import * as cheerio from "cheerio";
import { canonicalizeRut, cleanText } from "../normalize";
import type {
  SourceAdapter,
  SourceIngestOptions,
  SourcePartial,
} from "../types";

// ----------------------------------------------------------------------------
// Public surface
// ----------------------------------------------------------------------------

/** Default base URL for the CMF portal. */
export const DEFAULT_BASE_URL = "https://www.cmfchile.cl";

/** Path for the per-vertical fiscalizados consultation. */
export const CONSULTA_PATH = "/institucional/mercados/consulta.php";

/**
 * Query parameter used by `consulta.php` to identify the vertical.
 *
 * Both `entidad` and `consulta` are accepted by the server and return the same
 * payload — but per-vertical the canonical query string differs (some appear
 * in CMF's own navigation as `entidad`, others as `consulta`). We preserve the
 * verified value to match what live URLs look like.
 */
export type CmfQueryParam = "entidad" | "consulta";

export interface CmfVertical {
  /** Vertical code passed to `entidad`/`consulta` query param. */
  code: string;
  /** Market identifier (V = valores, S = seguros, O = otros). */
  mercado: string;
  /** Which query parameter name carries the code on the CMF URL. */
  param: CmfQueryParam;
  /** Human-readable label assigned to `rubroDescripcion`. */
  rubroDescripcion: string;
}

/**
 * Verified verticals (live-checked 2026-05-01).
 *
 * Order is significant: the adapter iterates in this order and the tests
 * assert the visit sequence.
 */
export const CMF_VERTICALS: ReadonlyArray<CmfVertical> = [
  {
    code: "RVEMI",
    mercado: "V",
    param: "entidad",
    rubroDescripcion: "Emisor de Valores",
  },
  {
    code: "COBOL",
    mercado: "V",
    param: "entidad",
    rubroDescripcion: "Corredor de Bolsa",
  },
  {
    code: "RGAFP",
    mercado: "V",
    param: "entidad",
    rubroDescripcion: "AFP",
  },
  {
    code: "CSVID",
    mercado: "S",
    param: "consulta",
    rubroDescripcion: "Compañía de Seguros de Vida",
  },
  {
    code: "RGEIN",
    mercado: "O",
    param: "consulta",
    rubroDescripcion: "Entidad Informante Ley 20.382",
  },
];

/** Default inter-vertical delay (ms). The adapter sleeps this between requests. */
const REQUEST_DELAY_MS = 2_000;

export interface CreateCmfAdapterOptions {
  /**
   * Inject a custom `fetch` implementation for testing. Defaults to the
   * runtime `fetch` (Node 18+).
   */
  fetchImpl?: typeof fetch;
  /** Override the base URL. Defaults to {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /** Override the verticals list. Defaults to {@link CMF_VERTICALS}. */
  verticals?: ReadonlyArray<CmfVertical>;
  /** Override the inter-request delay (ms). Tests pass 0. */
  requestDelayMs?: number;
  /**
   * Logger for non-fatal warnings (HTTP failure on a single vertical, malformed
   * row, etc.). Defaults to `console.warn`.
   */
  warn?: (msg: string, err?: unknown) => void;
}

/**
 * Build a {@link SourceAdapter} for CMF's fiscalizados directory.
 *
 * Iterates {@link CMF_VERTICALS} in order, fetching each vertical's listing in
 * a single HTTP call and yielding one `SourcePartial` per `Estado=VI` row with
 * a valid RUT.
 *
 * @example
 * ```ts
 * const adapter = createCmfAdapter();
 * for await (const partial of adapter.ingest({ limit: 50 })) {
 *   console.log(partial.rut, partial.razonSocial, partial.rubroDescripcion);
 * }
 * ```
 *
 * @remarks Banks are intentionally NOT scraped in V1 — see file header.
 */
export function createCmfAdapter(
  options: CreateCmfAdapterOptions = {},
): SourceAdapter {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const verticals = options.verticals ?? CMF_VERTICALS;
  const requestDelayMs = options.requestDelayMs ?? REQUEST_DELAY_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const warn =
    options.warn ?? ((msg: string, err?: unknown) => console.warn(msg, err));

  function buildUrl(v: CmfVertical): string {
    const params = new URLSearchParams();
    params.set("mercado", v.mercado);
    params.set("Estado", "VI");
    params.set(v.param, v.code);
    return `${baseUrl}${CONSULTA_PATH}?${params.toString()}`;
  }

  async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
    const init: RequestInit = signal ? { signal } : {};
    const res = await fetchImpl(url, init);
    if (!res.ok) {
      throw new Error(
        `CMF: GET ${url} -> ${res.status} ${res.statusText ?? ""}`.trim(),
      );
    }
    return res.text();
  }

  async function* ingest(
    opts?: SourceIngestOptions,
  ): AsyncIterable<SourcePartial> {
    const signal = opts?.signal;
    const limit = opts?.limit;
    let emitted = 0;
    let firstRequest = true;

    for (const vertical of verticals) {
      if (signal?.aborted) return;
      if (limit !== undefined && emitted >= limit) return;

      // Rate-limit between verticals (not before the first one).
      if (!firstRequest) {
        await sleep(requestDelayMs, signal);
        if (signal?.aborted) return;
      }
      firstRequest = false;

      const url = buildUrl(vertical);
      let html: string;
      try {
        html = await fetchHtml(url, signal);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // A failure on one vertical must NOT halt the remaining verticals.
        warn(`CMF: failed to fetch vertical ${vertical.code} (${url})`, err);
        continue;
      }

      for (const partial of parseListing(html, vertical, warn)) {
        if (signal?.aborted) return;
        if (limit !== undefined && emitted >= limit) return;
        yield partial;
        emitted++;
      }
    }
  }

  return {
    id: "cmf",
    ingest,
  };
}

// ----------------------------------------------------------------------------
// HTML parsing
// ----------------------------------------------------------------------------

/**
 * Parse a vertical listing into `SourcePartial`s.
 *
 * Iterates every `<tr>` under any `<table>` and keeps rows that contain at
 * least one `<a href="entidad.php?...">` anchor — that filters out the two
 * legal/header rows verified live.
 *
 * @internal Exported for tests only.
 */
export function parseListing(
  html: string,
  vertical: CmfVertical,
  warn: (msg: string, err?: unknown) => void = () => {},
): SourcePartial[] {
  const $ = cheerio.load(html);
  const out: SourcePartial[] = [];

  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    // Skip rows without an entidad.php anchor (header/legal rows).
    if ($tr.find('a[href*="entidad.php"]').length === 0) return;

    const $tds = $tr.find("td");
    if ($tds.length < 3) return;

    // Estado is the 3rd <td>. Filter to VI (vigente).
    const estado = cleanText($tds.eq(2).text());
    if (estado !== "VI") return;

    // RUT lives inside the anchor in the 1st <td>.
    const rutRaw = cleanText($tds.eq(0).find("a").first().text());
    if (!rutRaw) return;

    let rut: string;
    try {
      rut = canonicalizeRut(rutRaw);
    } catch (err) {
      warn(`CMF: skipping row with invalid RUT "${rutRaw}"`, err);
      return;
    }

    // Razón social lives inside the anchor in the 2nd <td>. CMF emits it in
    // ALL CAPS (e.g. "A5 CAPITAL S.A."). We preserve the original casing —
    // applying title-case here would break legal suffixes ("S.A." → "S.a."),
    // and the merger can normalize once across all sources if needed.
    const razonSocial = cleanText($tds.eq(1).find("a").first().text());
    if (!razonSocial) return;

    out.push({
      rut,
      razonSocial,
      rubroDescripcion: vertical.rubroDescripcion,
      signals: { emisorRegulado: true },
    });
  });

  return out;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Sleep helper that cooperates with `AbortSignal`. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    if (ms <= 0) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
