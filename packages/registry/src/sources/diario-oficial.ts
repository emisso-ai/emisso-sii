/**
 * Diario Oficial — Chilean official gazette event-stream adapter.
 *
 * El Diario Oficial (https://www.diariooficial.interior.gob.cl/) publishes
 * daily editions including the legally-required publication of company
 * constitutions, modifications, and dissolutions ("Empresas y Sociedades").
 *
 * Unlike snapshot sources (e.g. `empresas-en-un-dia` CSV), this is an EVENT
 * STREAM — each edition is a delta. The adapter walks editions in the
 * requested date window and yields one `SourcePartial` per newly-constituted
 * company found.
 *
 * Primary value for the merger: SIGNAL FRESHNESS. Any company observed via
 * Diario Oficial within the last N days is, by definition, freshly
 * constituted. Downstream merger SHOULD consider boosting `score` based on
 * `fechaInicio` proximity to today (a "fresh registration" signal). This
 * adapter does not mutate `signals` itself — boosting is a merger-level
 * concern, and the per-extracto `fechaInicio` lives in the signed PDF (NOT
 * in the HTML — see Phase 2 TODO below).
 *
 * --------------------------------------------------------------------------
 * URL PATTERN (live-verified 2026-05-01)
 * --------------------------------------------------------------------------
 *     {baseUrl}/edicionelectronica/empresas_cooperativas.php
 *         ?date=DD-MM-YYYY&edition=NNNNN
 *
 * Edition numbers are MONOTONICALLY INCREASING (~1 per working day, skipping
 * Sundays and Chilean public holidays). Live anchor:
 *
 *     date=28-04-2026 → edition=44390
 *
 * Without a correct `edition=` param the page is unreachable, so the adapter
 * resolves an edition number for each target date. Default heuristic walks
 * working-days from the anchor; callers can inject their own resolver via
 * {@link DiarioOficialOptions.getEditionForDate} when they have a calendar
 * source that knows the actual feriado list.
 *
 * --------------------------------------------------------------------------
 * F5 / TSPD JS BOT CHALLENGE (live-verified 2026-05-01)
 * --------------------------------------------------------------------------
 * The site sits behind an F5 / TS-prefixed JavaScript bot challenge: the
 * first GET to any path returns a tiny (~6 KiB) skeleton with a
 * `<noscript>Please enable JavaScript</noscript>` body and `Set-Cookie`
 * headers like `TS7cf1f3b9027=...; TS246c89b2029=...`.
 *
 * Empirically verified (no Playwright required): replaying those cookies on
 * the next request yields the real HTML. The adapter therefore does a tiny
 * "warm-up" GET against the index page once, captures any `Set-Cookie`s,
 * then sends them on each edition request. If a response still looks like
 * the skeleton (small body + `<noscript>`) we retry up to 3 times with a
 * jittered 800–1500 ms backoff before giving up on that edition.
 *
 * --------------------------------------------------------------------------
 * HTML STRUCTURE (live-verified 2026-05-01)
 * --------------------------------------------------------------------------
 * Selectors corroborated against `pdelteil/sii_situacion_tributaria` patterns,
 * `NicolasArayaB/scraping_diario_oficial`, and the Medium write-up by
 * `kriman_65190`:
 *
 *   <section class="norma_general"><div class="wrapsection">
 *     <table>
 *       <tr class="title1"><td>CONSTITUCIONES</td></tr>          ← section header
 *       <tr class="title2"><td>SOCIEDADES POR ACCIONES</td></tr> ← entity-type header
 *       <tr class="title3"><td>REGION METROPOLITANA</td></tr>    ← geographic header
 *       <tr class="content">                                     ← one extracto
 *         <td>
 *           <div style="float:left;width:550px;">RAZON SOCIAL SPA</div>
 *           <div style="float:right;">76.543.210-3 *</div>       ← * = self-declared RUT
 *           <a href="/media/2026/04/28/CVE_C_SPA_20260428_firmado.pdf">…</a>
 *         </td>
 *       </tr>
 *       <tr class="content">…</tr>
 *       <tr class="title1"><td>MODIFICACIONES</td></tr>          ← next section
 *       …
 *     </table>
 *   </div></section>
 *
 * The PDF link's filename encodes the type via the {TIPO} segment:
 *   - `C_LTDA`, `C_SPA`, `C_EIRL` → constituciones (V1 emits these only)
 *   - `M_LTDA` etc.               → modificaciones (skipped)
 *   - `D_LTDA` etc.               → disoluciones (skipped)
 *
 * "No publications" indicators (per live verification on 28-04-2026):
 *   - `<p class="nofound">…</p>` block, OR
 *   - `<section class="norma_general">` empty/missing.
 *
 * RUTs ending with `*` were declared by the requester and not confirmed by
 * the Diario Oficial — the footer says so literally. We strip the asterisk
 * and emit the RUT anyway; downstream merger can treat the source-hit as
 * a weaker signal if/when we surface the asterisk in `signals`.
 *
 * --------------------------------------------------------------------------
 * PHASE 2 TODO — PDF parsing for fechaInicio / domicilio / representante
 * --------------------------------------------------------------------------
 * The HTML row carries ONLY razón social + RUT + a link to the signed PDF.
 * The constitution date, legal rep, and domicile live inside the PDF body.
 * V1 leaves these fields `undefined`; V2 should plug `pdf-parse` into a
 * second pass that follows `pdfHref` for each extracto and back-fills.
 */
import axios, { type AxiosInstance } from "axios";
import * as cheerio from "cheerio";

import { canonicalizeRut, cleanText } from "../normalize";
import type {
  SourceAdapter,
  SourceIngestOptions,
  SourcePartial,
} from "../types";

export const DEFAULT_BASE_URL =
  "https://www.diariooficial.interior.gob.cl";

/** Delay between consecutive edition fetches, in milliseconds. */
export const EDITION_DELAY_MS = 2000;

/** Max retries when an edition response is the F5 skeleton. */
export const SKELETON_MAX_RETRIES = 3;

/**
 * Anchor used by the default edition-number heuristic. Verified live
 * 2026-05-01: `date=28-04-2026` resolves to `edition=44390`. If the live site
 * drifts (rare), bump this in a single place rather than scattering offsets
 * through the adapter.
 */
export const DEFAULT_EDITION_ANCHOR: { readonly date: string; readonly edition: number } = {
  date: "2026-04-28",
  edition: 44390,
};

/**
 * Threshold below which a response body is suspected to be the F5 skeleton.
 * Skeleton ~6 KiB; real edition pages — even empty ones with `<p class="nofound">` —
 * are ~10+ KiB. 9000 bytes leaves headroom on both sides.
 */
const SKELETON_BODY_THRESHOLD = 9_000;

export interface DiarioOficialOptions {
  /**
   * Override fetch (for testing or custom transports). If provided, axios is
   * bypassed entirely. Defaults to a thin axios wrapper.
   */
  fetchImpl?: typeof fetch;
  /** Override the base URL. */
  baseUrl?: string;
  /**
   * Override the date window. If provided, takes precedence over
   * `opts.since` passed to `ingest()`.
   */
  dateRange?: { from: Date; to: Date };
  /**
   * Override the inter-edition delay (ms). Defaults to {@link EDITION_DELAY_MS}.
   * Set to 0 in tests to disable rate limiting.
   */
  delayMs?: number;
  /**
   * Inject a custom edition-number resolver. Receives a UTC Date and returns
   * the edition number to use in the URL, or `null` to skip this date. When
   * not provided, the adapter falls back to a working-day heuristic anchored
   * at {@link DEFAULT_EDITION_ANCHOR} which DOES NOT account for Chilean
   * public holidays — feriados that fall on weekdays will cause the heuristic
   * to drift by 1 per holiday in the window. Production callers should
   * inject a resolver backed by an actual feriado calendar.
   */
  getEditionForDate?: (date: Date) => Promise<number | null> | number | null;
  /**
   * Override the skeleton-retry sleep generator (ms). Mainly for tests; the
   * default jitters between 800–1500 ms.
   */
  skeletonRetryDelayMs?: () => number;
}

/** Public for test ergonomics — the signature matches `SourceAdapter`. */
export function createDiarioOficialAdapter(
  options: DiarioOficialOptions = {},
): SourceAdapter {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl;
  const dateRange = options.dateRange;
  const delayMs = options.delayMs ?? EDITION_DELAY_MS;
  const getEditionForDate =
    options.getEditionForDate ?? defaultEditionResolver;
  const skeletonRetryDelayMs =
    options.skeletonRetryDelayMs ?? defaultSkeletonRetryDelay;

  // Lazy axios instance — only constructed if fetchImpl is not provided.
  let axiosInstance: AxiosInstance | null = null;
  const getAxios = (): AxiosInstance => {
    if (axiosInstance === null) {
      axiosInstance = axios.create({
        baseURL: baseUrl,
        timeout: 30_000,
        validateStatus: (status) => status >= 200 && status < 500,
        headers: {
          "User-Agent":
            "@emisso/registry-cl (Diario Oficial event-stream adapter)",
        },
      });
    }
    return axiosInstance;
  };

  return {
    id: "diario-oficial",
    ingest(opts?: SourceIngestOptions) {
      return ingest(
        {
          baseUrl,
          fetchImpl,
          dateRange,
          getAxios,
          delayMs,
          getEditionForDate,
          skeletonRetryDelayMs,
          cookieStore: new Map<string, string>(),
        },
        opts,
      );
    },
  };
}

// ============================================================================
// INTERNALS
// ============================================================================

interface IngestContext {
  baseUrl: string;
  fetchImpl: typeof fetch | undefined;
  dateRange: { from: Date; to: Date } | undefined;
  getAxios: () => AxiosInstance;
  delayMs: number;
  getEditionForDate: (date: Date) => Promise<number | null> | number | null;
  skeletonRetryDelayMs: () => number;
  /** Per-host (origin) cookie store, populated on warmup, replayed thereafter. */
  cookieStore: Map<string, string>;
}

interface FetchResult {
  status: number;
  body: string;
  /** Raw `set-cookie` header values in the order received. */
  setCookies: ReadonlyArray<string>;
}

async function* ingest(
  ctx: IngestContext,
  opts: SourceIngestOptions = {},
): AsyncGenerator<SourcePartial, void, void> {
  const { signal, limit } = opts;
  if (signal?.aborted) return;

  const { from, to } = resolveDateRange(ctx.dateRange, opts.since);
  if (from.getTime() > to.getTime()) return;

  let emitted = 0;
  let invalidRuts = 0;
  let firstEdition = true;

  for (const date of iterateDates(from, to)) {
    if (signal?.aborted) {
      logSkipped(invalidRuts);
      return;
    }

    if (!firstEdition) {
      try {
        await delay(ctx.delayMs, signal);
      } catch {
        logSkipped(invalidRuts);
        return;
      }
    }
    firstEdition = false;

    let editionNumber: number | null;
    try {
      editionNumber = await Promise.resolve(ctx.getEditionForDate(date));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[diario-oficial] edition resolver threw for ${formatYyyyMmDd(date)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }
    if (editionNumber === null || editionNumber <= 0) continue;

    const url = editionUrl(ctx.baseUrl, date, editionNumber);
    let result: FetchResult;
    try {
      result = await fetchWithCookieWarmup(ctx, url, signal);
    } catch (err) {
      if (signal?.aborted) {
        logSkipped(invalidRuts);
        return;
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[diario-oficial] fetch error for ${formatYyyyMmDd(date)} (edition ${editionNumber}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }

    if (result.status === 404) continue;
    if (result.status < 200 || result.status >= 300) {
      // eslint-disable-next-line no-console
      console.warn(
        `[diario-oficial] unexpected status ${result.status} for ${formatYyyyMmDd(date)} (edition ${editionNumber})`,
      );
      continue;
    }

    const extractos = parseEdition(result.body);
    if (extractos.length === 0) continue;

    for (const raw of extractos) {
      if (signal?.aborted) {
        logSkipped(invalidRuts);
        return;
      }

      const partial = extractToPartial(raw);
      if (partial === null) {
        invalidRuts++;
        continue;
      }

      yield partial;
      emitted++;

      if (typeof limit === "number" && emitted >= limit) {
        logSkipped(invalidRuts);
        return;
      }
    }
  }

  logSkipped(invalidRuts);
}

function logSkipped(count: number): void {
  if (count <= 0) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[diario-oficial] skipped ${count} extractos with unparseable RUTs`,
  );
}

// ============================================================================
// FETCH + COOKIE WARMUP
// ============================================================================

/**
 * Fetch an edition URL with F5/TSPD bot-challenge bypass.
 *
 *   1. If we have no cookies for this origin yet, GET the warmup URL
 *      (`/edicionelectronica/`) and harvest any `set-cookie` headers.
 *   2. GET the edition URL with `Cookie:` set to the harvested values.
 *   3. If the response body still looks like the skeleton challenge
 *      (small + contains `<noscript>`), sleep + retry up to
 *      {@link SKELETON_MAX_RETRIES} times.
 *
 * Exported so the test suite can exercise the cookie + retry behavior in
 * isolation; production code calls it via `ingest()`.
 */
export async function fetchWithCookieWarmup(
  ctx: IngestContext,
  url: string,
  signal: AbortSignal | undefined,
): Promise<FetchResult> {
  const origin = originOf(url);
  if (!ctx.cookieStore.has(origin)) {
    const warmupUrl = warmupUrlFor(ctx.baseUrl);
    try {
      const warmup = await rawFetch(ctx, warmupUrl, signal, undefined);
      const cookieValue = mergeCookies(undefined, warmup.setCookies);
      if (cookieValue) ctx.cookieStore.set(origin, cookieValue);
    } catch {
      // Warmup failure isn't fatal; fall through and let the real GET
      // try without cookies — it'll just trigger the skeleton retry path.
    }
  }

  for (let attempt = 0; attempt <= SKELETON_MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error("aborted");

    const cookie = ctx.cookieStore.get(origin);
    const result = await rawFetch(ctx, url, signal, cookie);

    // Always merge any new cookies the server hands us — TS tokens rotate.
    if (result.setCookies.length > 0) {
      const merged = mergeCookies(cookie, result.setCookies);
      if (merged) ctx.cookieStore.set(origin, merged);
    }

    if (result.status < 200 || result.status >= 300) return result;
    if (!isSkeletonResponse(result.body)) return result;

    if (attempt === SKELETON_MAX_RETRIES) {
      throw new Error(
        `Diario Oficial returned the F5/TSPD skeleton ${SKELETON_MAX_RETRIES + 1}x for ${url}`,
      );
    }
    await delay(ctx.skeletonRetryDelayMs(), signal);
  }
  // Unreachable — the loop either returns or throws. Kept for tsc.
  throw new Error("unreachable");
}

async function rawFetch(
  ctx: IngestContext,
  url: string,
  signal: AbortSignal | undefined,
  cookie: string | undefined,
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    "User-Agent":
      "@emisso/registry-cl (Diario Oficial event-stream adapter)",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
  if (cookie) headers["Cookie"] = cookie;

  if (ctx.fetchImpl) {
    const response = await ctx.fetchImpl(url, { signal, headers });
    const body = await response.text();
    return {
      status: response.status,
      body,
      setCookies: extractSetCookieFromHeaders(response.headers),
    };
  }
  const response = await ctx.getAxios().get<string>(url, {
    signal,
    headers,
    responseType: "text",
    transformResponse: [(data: unknown) => data as string],
  });
  const setCookieHeader = response.headers["set-cookie"];
  const setCookies: string[] = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : typeof setCookieHeader === "string"
      ? [setCookieHeader]
      : [];
  return {
    status: response.status,
    body: typeof response.data === "string" ? response.data : "",
    setCookies,
  };
}

/**
 * Extract `set-cookie` values from a `Headers`-like object. Browsers/undici
 * fold multiple `Set-Cookie` headers into a single comma-joined string when
 * read via `headers.get()`; using `getSetCookie()` (Node 19+) preserves the
 * array. We try the latter first.
 */
function extractSetCookieFromHeaders(headers: Headers): ReadonlyArray<string> {
  const maybeGetSetCookie = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof maybeGetSetCookie === "function") {
    return maybeGetSetCookie.call(headers);
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/**
 * Reduce raw `set-cookie` header values to a single `Cookie:` request header,
 * preserving any prior cookie pairs we already had for this origin.
 */
function mergeCookies(
  prior: string | undefined,
  setCookies: ReadonlyArray<string>,
): string | undefined {
  const pairs = new Map<string, string>();
  // Seed from prior request header.
  if (prior) {
    for (const piece of prior.split(/;\s*/)) {
      const eq = piece.indexOf("=");
      if (eq <= 0) continue;
      pairs.set(piece.slice(0, eq).trim(), piece.slice(eq + 1).trim());
    }
  }
  for (const raw of setCookies) {
    // Each `set-cookie` header is "name=value; attr1=...; attr2=...".
    // We only need the first segment.
    const firstSeg = raw.split(";", 1)[0];
    const eq = firstSeg.indexOf("=");
    if (eq <= 0) continue;
    const name = firstSeg.slice(0, eq).trim();
    const value = firstSeg.slice(eq + 1).trim();
    if (name.length === 0) continue;
    pairs.set(name, value);
  }
  if (pairs.size === 0) return undefined;
  return Array.from(pairs.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function isSkeletonResponse(body: string): boolean {
  if (body.length === 0) return true;
  if (body.length >= SKELETON_BODY_THRESHOLD) return false;
  return /<noscript[^>]*>/i.test(body);
}

function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

function warmupUrlFor(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/edicionelectronica/`;
}

/** Default 800–1500 ms jittered delay between skeleton-retry attempts. */
function defaultSkeletonRetryDelay(): number {
  return 800 + Math.floor(Math.random() * 700);
}

async function delay(
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw new Error("aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// ============================================================================
// EDITION-NUMBER RESOLVER
// ============================================================================

/**
 * Default resolver: anchored at {@link DEFAULT_EDITION_ANCHOR}, walks
 * working-days (Mon–Sat, since the Diario Oficial does not publish on
 * Sundays). DOES NOT account for Chilean public holidays — drifts by 1 per
 * weekday feriado in the window. Inject {@link DiarioOficialOptions.getEditionForDate}
 * for production-grade calendar awareness.
 */
function defaultEditionResolver(date: Date): number | null {
  if (date.getUTCDay() === 0) return null; // Sunday — no edition.
  const anchor = parseIsoDate(DEFAULT_EDITION_ANCHOR.date);
  if (!anchor) return null;
  const target = startOfDay(date);
  const sign = target.getTime() >= anchor.getTime() ? 1 : -1;
  let workingDays = 0;
  const cursor = new Date(anchor.getTime());
  // Iterate from anchor toward target counting non-Sundays.
  while (cursor.getTime() !== target.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + sign);
    if (cursor.getUTCDay() !== 0) workingDays += sign;
  }
  return DEFAULT_EDITION_ANCHOR.edition + workingDays;
}

// ============================================================================
// DATE HELPERS
// ============================================================================

function resolveDateRange(
  override: { from: Date; to: Date } | undefined,
  since: string | undefined,
): { from: Date; to: Date } {
  if (override) {
    return {
      from: startOfDay(override.from),
      to: startOfDay(override.to),
    };
  }
  const to = startOfDay(new Date());
  if (!since) {
    return { from: to, to };
  }
  const fromParsed = parseIsoDate(since);
  return {
    from: fromParsed ? startOfDay(fromParsed) : to,
    to,
  };
}

function* iterateDates(from: Date, to: Date): Generator<Date, void, void> {
  const cursor = new Date(from.getTime());
  while (cursor.getTime() <= to.getTime()) {
    yield new Date(cursor.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function startOfDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function parseIsoDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return new Date(Date.UTC(yyyy, mm - 1, dd));
}

function formatYyyyMmDd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDdMmYyyy(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}-${m}-${y}`;
}

// ============================================================================
// URL + PARSING
// ============================================================================

/**
 * Build the URL for a given edition date + edition number, matching the
 * live-verified pattern (2026-05-01).
 */
function editionUrl(baseUrl: string, date: Date, edition: number): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/edicionelectronica/empresas_cooperativas.php?date=${formatDdMmYyyy(date)}&edition=${edition}`;
}

/** Raw extract data parsed from a single edition's HTML. */
interface ExtractoRaw {
  /** RUT text as it appears in the row's right-floated div (asterisk stripped). */
  rutText: string;
  /** True if the RUT was self-declared (had a `*` suffix in the source HTML). */
  rutSelfDeclared: boolean;
  razonSocial: string | undefined;
  /** PDF link href, used to confirm TIPO=C_*. */
  pdfHref: string | undefined;
  /** Type code parsed from the PDF filename (e.g. "C_SPA", "C_LTDA"). */
  tipoCode: string | undefined;
}

const PDF_FILENAME_RE = /\/([^\/]+?)_([CMD]_[A-Z]+)_\d{8}_firmado\.pdf/i;

/**
 * Parse a Diario Oficial edition HTML payload into an array of constitution
 * extracts. Modificaciones / disoluciones are filtered out at parse time.
 *
 * Strategy (live-verified 2026-05-01):
 *   - Find every `tr.title1` whose text contains "CONSTITUCIONES".
 *   - For each, walk forward through siblings collecting `tr.content` rows
 *     until we hit another `tr.title1` (the next section's boundary).
 *   - For each `tr.content`, extract:
 *       razón social → `td > div[style*="float:left"]`
 *       RUT          → `td > div[style*="float:right"]` (strip `*`)
 *       PDF link     → `td > a[href$=".pdf"]` (filename must contain `_C_`)
 *
 * Exported for testability.
 */
export function parseEdition(html: string): ExtractoRaw[] {
  if (!html || html.length === 0) return [];
  const $ = cheerio.load(html);

  // Quick guard — empty editions explicitly say so via <p class="nofound">,
  // and a page with no <tr.title1> blocks definitionally has nothing to yield.
  if ($("p.nofound").length > 0 && $("tr.title1").length === 0) return [];

  const out: ExtractoRaw[] = [];

  $("tr.title1").each((_idx, headerEl) => {
    const headerText = ($(headerEl).text() ?? "").toLowerCase();
    if (!headerText.includes("constituc")) return;

    // Walk forward through siblings until the next title1 boundary.
    // Type inferred from cheerio so we keep the AnyNode generic without
    // having to import it from domhandler.
    let cursor = $(headerEl).next();
    while (cursor.length > 0) {
      const tagClass = (cursor.attr("class") ?? "").toLowerCase();
      if (tagClass.split(/\s+/).includes("title1")) break;
      if (tagClass.split(/\s+/).includes("content")) {
        const raw = parseContentRow($, cursor);
        if (raw) out.push(raw);
      }
      cursor = cursor.next();
    }
  });

  return out;
}

/** Infer Cheerio<AnyNode> via the API itself so we don't need a domhandler import. */
type CheerioNode = ReturnType<cheerio.CheerioAPI>;

function parseContentRow(
  $: cheerio.CheerioAPI,
  $row: CheerioNode,
): ExtractoRaw | null {
  // Razón social: the float:left inline-styled div.
  const razonSocialRaw = $row
    .find('td > div[style*="float:left"], td div[style*="float:left"]')
    .first()
    .text();
  const razonSocial = cleanText(razonSocialRaw);

  // RUT: the float:right inline-styled div. Strip the `*` self-declared
  // marker before we hand it to canonicalizeRut.
  const rutRaw = $row
    .find('td > div[style*="float:right"], td div[style*="float:right"]')
    .first()
    .text();
  const rutCleaned = cleanText(rutRaw);
  if (!rutCleaned) return null;

  const rutSelfDeclared = rutCleaned.includes("*");
  const rutText = rutCleaned.replace(/\*/g, "").trim();
  if (rutText.length === 0) return null;

  // PDF link confirms TIPO = C_*.
  const $pdfLink = $row.find('td a[href$=".pdf"], td a[href*=".pdf"]').first();
  const pdfHref = $pdfLink.attr("href") ?? undefined;
  let tipoCode: string | undefined;
  if (pdfHref) {
    const match = pdfHref.match(PDF_FILENAME_RE);
    if (match) tipoCode = match[2].toUpperCase();
  }

  // Defense in depth: the parent section is "CONSTITUCIONES" but PDFs
  // occasionally leak in from sibling sections. Require a C_* TIPO when we
  // can read it; if we can't, we trust the parent header.
  if (tipoCode && !tipoCode.startsWith("C_")) return null;

  return {
    rutText,
    rutSelfDeclared,
    razonSocial,
    pdfHref,
    tipoCode,
  };
}

function extractToPartial(raw: ExtractoRaw): SourcePartial | null {
  let rut: string;
  try {
    rut = canonicalizeRut(raw.rutText);
  } catch {
    return null;
  }

  const partial: SourcePartial = { rut };
  if (raw.razonSocial) partial.razonSocial = raw.razonSocial;
  // fechaInicio, representanteLegal, domicilio: deliberately omitted in V1.
  // See top-of-file Phase 2 TODO — these live in the signed PDF.
  return partial;
}
