/**
 * ChileCompra / Mercado Público source adapter.
 *
 * Discovers Chilean companies that sell to the State by sweeping the public
 * `ordenesdecompra.json` endpoint **day by day** and aggregating unique
 * `Proveedor` blocks into one yield per RUT.
 *
 *   GET https://api.mercadopublico.cl/servicios/v1/publico/ordenesdecompra.json
 *       ?ticket=<ticket>
 *       &fecha=DDMMYYYY
 *
 * ## Verified API behavior (2026-05-01)
 *
 * Verified against the production API and cross-referenced with the
 * `gepd/MercadoPublico` OSS TypeScript types
 * (https://github.com/gepd/MercadoPublico — see `types.d.ts:72-101` for the
 * `OrdenDeCompra` listado item shape).
 *
 * 1. **Date parameter.** The endpoint accepts a single `fecha` parameter in
 *    `DDMMYYYY` format (no separators). Sending `fechadesde` / `fechahasta`
 *    yields HTTP 400 `{"Codigo":400,"Mensaje":"Nombre de parametro no válido."}`.
 *    There is no native date-range query — callers must iterate day-by-day.
 *
 * 2. **No pagination.** `pagina` is silently ignored. The response always
 *    returns the full set of orders for the requested day.
 *
 * 3. **Proveedor field paths.** The proveedor block uses `Codigo` and `Nombre`
 *    (not `CodigoProveedor` / `NombreProveedor`). The latter exist on the
 *    `licitaciones.json` endpoint, which is a different shape and not consumed
 *    here.
 *
 * 4. **Monto.** Use `item.Total` (gross, IVA included) and fall back to
 *    `item.TotalNeto`. `MontoTotalOC` does not exist on this endpoint.
 *
 * Expected response shape (subset we depend on):
 *
 *   {
 *     "Cantidad": number,
 *     "FechaCreacion": string,
 *     "Listado": [
 *       {
 *         "Codigo": "...",                  // OC code
 *         "Nombre": "...",
 *         "TotalNeto": number,              // sin IVA
 *         "Total": number,                  // con IVA — preferred
 *         "Fechas": { "FechaEnvio": "...", "FechaAceptacion": "..." },
 *         "Proveedor": {
 *           "Codigo": "76543210-3",         // ← canonicalizable RUT
 *           "Nombre": "ACME SpA"
 *         }
 *       }
 *     ]
 *   }
 *
 * ## Errors the API surfaces
 *
 *   - `{"Codigo": 203, "Mensaje": "Ticket no válido."}` — bad/expired ticket.
 *   - `{"Codigo": 400, "Mensaje": "..."}` — malformed query.
 *   - `{"Codigo": 10500, "Mensaje": "...peticiones simultáneas..."}` — the
 *     adapter sent two requests with the same ticket concurrently. We
 *     serialize via `minRequestIntervalMs` and additionally back off + retry
 *     once on this code.
 *
 * ## Rate limits (officially documented)
 *
 *   - 10 000 requests/day per ticket.
 *   - **No** concurrent requests permitted on the same ticket.
 *
 * The default `minRequestIntervalMs` is 1500 ms, leaving headroom under the
 * concurrent-call cap. The `ticket` is the user's auth credential
 * (registered free at desarrolladores.mercadopublico.cl). It is treated as a
 * secret: never logged, only ever placed into `params`.
 */

import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import axiosRetry from "axios-retry";
import { canonicalizeRut, cleanText } from "../normalize";
import type {
  SourceAdapter,
  SourceIngestOptions,
  SourcePartial,
} from "../types";

const DEFAULT_BASE_URL = "https://api.mercadopublico.cl/servicios/v1/publico/";
const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_RATE_LIMIT_MS = 1_500;
const CONCURRENT_BACKOFF_MS = 5_000;
const MAX_DAYS = 366; // hard cap; protects against absurd `since` values.

// Sentinel "Codigo" values returned in the JSON body (HTTP 200 + Codigo field
// is ChileCompra's pattern for app-level errors).
const ERR_INVALID_TICKET = 203;
const ERR_BAD_PARAM = 400;
const ERR_CONCURRENT = 10500;

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface ChileCompraAdapterOptions {
  /** Free ticket from desarrolladores.mercadopublico.cl. Required. */
  ticket: string;
  /** Override the API base URL (mostly for tests). */
  baseUrl?: string;
  /** How many days back to sweep when `opts.since` is not provided. */
  windowDays?: number;
  /** Minimum delay between requests (ms). Set to 0 in tests. */
  minRequestIntervalMs?: number;
  /** Inject a pre-configured axios instance (overrides retry/baseURL setup). */
  axiosInstance?: AxiosInstance;
  /**
   * Inject a custom fetch-like function. When provided takes priority over
   * `axiosInstance`. The function receives the fully-built URL (including
   * query string) and is expected to return parsed JSON.
   *
   * Use either `axiosInstance` or `fetchImpl` for testability — fetchImpl is
   * lighter, axiosInstance is closer to production behavior.
   */
  fetchImpl?: (url: string, init?: { signal?: AbortSignal }) => Promise<unknown>;
  /**
   * Wait helper — overridable in tests so backoff retries don't really sleep.
   * Defaults to a real setTimeout-based sleep that respects AbortSignal.
   */
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Response shape (only the fields we use)
// ---------------------------------------------------------------------------

interface OcResponse {
  Cantidad?: number;
  FechaCreacion?: string;
  Listado?: OcListadoItem[];
  /** Present on app-level errors (e.g. invalid ticket, bad param, concurrent). */
  Codigo?: number;
  Mensaje?: string;
}

interface OcListadoItem {
  Codigo?: string;
  Nombre?: string;
  TotalNeto?: number;
  Total?: number;
  Fechas?: {
    FechaEnvio?: string;
    FechaAceptacion?: string;
  };
  Proveedor?: {
    Codigo?: string;
    Nombre?: string;
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown when the API returns an app-level error (`Codigo` field set to a
 * non-success value) or a transport-level HTTP 4xx that we choose to surface
 * (e.g. malformed param). Network errors and 5xx are handled by axios-retry.
 */
export class ChileCompraApiError extends Error {
  readonly code: number;
  readonly apiMessage: string;
  constructor(code: number, apiMessage: string) {
    super(`ChileCompra API error ${code}: ${apiMessage}`);
    this.name = "ChileCompraApiError";
    this.code = code;
    this.apiMessage = apiMessage;
  }
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createChileCompraAdapter(
  options: ChileCompraAdapterOptions,
): SourceAdapter {
  if (!options.ticket || options.ticket.trim().length === 0) {
    throw new Error("createChileCompraAdapter: ticket is required");
  }

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/?$/, "/");
  const windowDays = Math.min(
    Math.max(options.windowDays ?? DEFAULT_WINDOW_DAYS, 1),
    MAX_DAYS,
  );
  const minIntervalMs = options.minRequestIntervalMs ?? DEFAULT_RATE_LIMIT_MS;
  const sleepImpl = options.sleepImpl ?? defaultSleep;

  const client = options.fetchImpl
    ? null
    : (options.axiosInstance ?? buildDefaultClient(baseUrl));

  return {
    id: "chilecompra",
    async *ingest(
      opts: SourceIngestOptions = {},
    ): AsyncIterable<SourcePartial> {
      const { signal, limit, since } = opts;

      // Build inclusive [start, end] day range. Iterate forward (older →
      // newer) so callers using `since` for incremental sweeps progress
      // monotonically.
      const end = new Date();
      const start = since ? parseSinceDate(since) : daysAgo(windowDays);
      // Clamp very-old `since` values; protects against accidental year-long
      // sweeps that would burn the daily quota.
      const earliest = daysAgo(MAX_DAYS);
      const effectiveStart = start.getTime() < earliest.getTime() ? earliest : start;

      // Per-RUT aggregation: dedupe across days, retain the largest monto
      // observed in the window. We yield each RUT exactly once at the end
      // of the sweep so callers don't see duplicate emissions.
      const aggregates = new Map<
        string,
        { razonSocial: string; maxMonto: number }
      >();
      let invalidCount = 0;
      let lastRequestTs = 0;

      const days = enumerateDays(effectiveStart, end);

      for (const day of days) {
        if (signal?.aborted) return;
        if (limit !== undefined && aggregates.size >= limit) break;

        // Self rate limit (per ticket; the API rejects concurrent calls).
        if (minIntervalMs > 0) {
          const elapsed = Date.now() - lastRequestTs;
          if (elapsed < minIntervalMs) {
            await sleepImpl(minIntervalMs - elapsed, signal);
          }
        }
        lastRequestTs = Date.now();

        const url = buildUrl(baseUrl, "ordenesdecompra.json", {
          fecha: toApiDate(day),
          ticket: options.ticket,
        });

        let payload: OcResponse;
        try {
          payload = await fetchDay(url, {
            fetchImpl: options.fetchImpl,
            client,
            signal,
          });
        } catch (err) {
          throw err;
        }

        // App-level error sentinel: ChileCompra returns HTTP 200 with a
        // `Codigo` field on errors. Distinguish from a successful empty day
        // (which has Cantidad=0 and Listado=[]) by the presence of `Mensaje`.
        if (
          typeof payload.Codigo === "number" &&
          payload.Codigo !== 0 &&
          typeof payload.Mensaje === "string"
        ) {
          if (payload.Codigo === ERR_CONCURRENT) {
            // Back off and retry the same day exactly once. If we get a
            // second concurrent error we surface it.
            await sleepImpl(CONCURRENT_BACKOFF_MS, signal);
            lastRequestTs = Date.now();
            payload = await fetchDay(url, {
              fetchImpl: options.fetchImpl,
              client,
              signal,
            });
            if (
              typeof payload.Codigo === "number" &&
              payload.Codigo !== 0 &&
              typeof payload.Mensaje === "string"
            ) {
              throw new ChileCompraApiError(payload.Codigo, payload.Mensaje);
            }
          } else if (payload.Codigo === ERR_INVALID_TICKET) {
            throw new ChileCompraApiError(payload.Codigo, payload.Mensaje);
          } else if (payload.Codigo === ERR_BAD_PARAM) {
            throw new ChileCompraApiError(payload.Codigo, payload.Mensaje);
          } else {
            throw new ChileCompraApiError(payload.Codigo, payload.Mensaje);
          }
        }

        const listado = payload.Listado ?? [];
        if (listado.length === 0) continue;

        for (const item of listado) {
          if (signal?.aborted) return;

          const codigo = item.Proveedor?.Codigo?.trim();
          const nombre = cleanText(item.Proveedor?.Nombre);
          if (!codigo || !nombre) {
            invalidCount++;
            continue;
          }

          let canon: string;
          try {
            canon = canonicalizeRut(codigo);
          } catch {
            invalidCount++;
            // Single warn per invalid RUT; do not echo the value to avoid
            // log noise on systematically dirty data, and never include the
            // ticket.
            // eslint-disable-next-line no-console
            console.warn(
              `[chilecompra] skipping invalid RUT (count=${invalidCount})`,
            );
            continue;
          }

          const monto = pickMonto(item);
          const prev = aggregates.get(canon);
          if (prev) {
            if (monto > prev.maxMonto) prev.maxMonto = monto;
            // Prefer the longer / first-seen razonSocial; ChileCompra is
            // inconsistent about casing and trailing spaces.
            if (nombre.length > prev.razonSocial.length) {
              prev.razonSocial = nombre;
            }
          } else {
            // Stop accepting brand new RUTs once we hit the limit, but keep
            // updating montos for already-tracked RUTs (cheap and improves
            // accuracy for what we'll yield).
            if (limit !== undefined && aggregates.size >= limit) continue;
            aggregates.set(canon, { razonSocial: nombre, maxMonto: monto });
          }
        }
      }

      // Yield once per unique RUT after the entire sweep, so the adapter
      // itself dedupes (no reliance on downstream merger).
      for (const [rut, agg] of aggregates) {
        if (signal?.aborted) return;
        const partial: SourcePartial = {
          rut,
          razonSocial: agg.razonSocial,
          signals: {
            venceAlEstado: true,
            montoAdjudicadoMaxAnual: agg.maxMonto > 0 ? agg.maxMonto : undefined,
          },
        };
        yield partial;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDefaultClient(baseURL: string): AxiosInstance {
  const instance = axios.create({ baseURL, timeout: 30_000 });
  axiosRetry(instance, {
    retries: 4,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      if (axiosRetry.isNetworkOrIdempotentRequestError(error)) return true;
      const status = error.response?.status;
      return status === 429 || (status !== undefined && status >= 500);
    },
  });
  return instance;
}

function buildUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
): string {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function fetchDay(
  url: string,
  ctx: {
    fetchImpl?: (
      url: string,
      init?: { signal?: AbortSignal },
    ) => Promise<unknown>;
    client: AxiosInstance | null;
    signal?: AbortSignal;
  },
): Promise<OcResponse> {
  if (ctx.fetchImpl) {
    const raw = await ctx.fetchImpl(url, { signal: ctx.signal });
    return raw as OcResponse;
  }
  if (!ctx.client) throw new Error("chilecompra: no HTTP client configured");
  const config: AxiosRequestConfig = { signal: ctx.signal };
  const response = await ctx.client.get<OcResponse>(url, config);
  return response.data;
}

function pickMonto(item: OcListadoItem): number {
  const candidates = [item.Total, item.TotalNeto];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return 0;
}

/**
 * Format a Date as the API's `fecha=DDMMYYYY` (no separators). Uses UTC so
 * boundaries don't shift around midnight in CL timezone.
 */
export function toApiDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getUTCFullYear());
  return `${dd}${mm}${yyyy}`;
}

function parseSinceDate(since: string): Date {
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`chilecompra: invalid since date: ${since}`);
  }
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Inclusive enumeration of UTC days from `start` to `end`. Order is
 * chronological (oldest first). Both endpoints are normalized to 00:00 UTC
 * before stepping.
 */
function enumerateDays(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const stop = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  // Guard against absurd ranges.
  let safety = MAX_DAYS + 1;
  while (cursor.getTime() <= stop && safety-- > 0) {
    out.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
