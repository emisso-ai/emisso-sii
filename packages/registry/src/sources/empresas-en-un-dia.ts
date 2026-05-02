/**
 * Empresas en un Día — Chilean Ministry of Economy CSV registry.
 *
 * Public dataset of every company constituted via the simplified online
 * incorporation system (https://www.registrodeempresasysociedades.cl) since
 * 2013. Published as one CSV per year on datos.gob.cl (CKAN), refreshed
 * periodically. Each yearly resource has its own UUID URL — they are NOT
 * predictable (e.g. 2024 carries a `_v2` suffix, 2018 `_v2`, 2019 `_v3`,
 * 2016 `_v3`). We therefore discover them through CKAN's `package_show`
 * endpoint and filter to the years the caller cares about.
 *
 * Verified against datos.gob.cl on 2026-05-01:
 *   - Package: `registro-de-empresas-y-sociedades`
 *   - One CSV per year, format = "csv"
 *   - Encoding: UTF-8 with BOM (﻿) at start of header line
 *   - Delimiter: `;` (semicolon — NOT comma)
 *   - Header (literal):
 *       ID;RUT;Razon Social;Fecha de actuacion (1era firma);
 *       Fecha de registro (ultima firma);Fecha de aprobacion x SII;
 *       Anio;Mes;Comuna Tributaria;Region Tributaria;
 *       Codigo de sociedad;Tipo de actuacion;Capital;
 *       Comuna Social;Region Social
 *   - Date columns: DD-MM-YYYY
 *   - Comuna values: ALL CAPS (e.g. "EST CENTRAL", "LO BARNECHEA")
 *   - Region values: numeric code as string (e.g. "13")
 *   - Tipo de actuacion: "CONSTITUCIÓN" / "MODIFICACIÓN" / "DISOLUCIÓN" /
 *     "MIGRACIÓN" — we ONLY emit CONSTITUCIÓN rows (the merger treats
 *     presence in this dataset as "registro vigente").
 *
 * The full dataset is ~1.5M rows; default to the current and previous year
 * to avoid pulling everything on each sync.
 */
import Papa from "papaparse";

import { canonicalizeRut, cleanText, titleCaseEs } from "../normalize";
import type {
  SourceAdapter,
  SourceIngestOptions,
  SourcePartial,
} from "../types";

/** Default CKAN base. Override via `packageShowUrl` in tests. */
const CKAN_BASE = "https://datos.gob.cl";
/** Slug of the dataset on datos.gob.cl. */
const PACKAGE_ID = "registro-de-empresas-y-sociedades";
/** UTF-8 BOM that prefixes every yearly CSV. */
const BOM = "﻿";

export interface EmpresasEnUnDiaOptions {
  /** Override fetch (for testing or custom transports). Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Override CKAN package_show URL. Mostly useful for tests; defaults to
   * `${CKAN_BASE}/api/3/action/package_show?id=${PACKAGE_ID}`.
   */
  packageShowUrl?: string;
  /**
   * Skip CKAN discovery entirely and use this fixed list of CSV URLs.
   * When provided, `years` is ignored.
   */
  csvUrls?: string[];
  /**
   * Restrict the CKAN sweep to these years. Defaults to
   * `[currentYear, currentYear - 1]` to keep each sync bounded — the full
   * 2013–present dataset is ~1.5M rows. Ignored when `csvUrls` is passed.
   */
  years?: number[];
}

/**
 * Subset of CKAN's `package_show` response we actually consume.
 * The full payload is much larger but we keep the surface tight.
 */
interface CkanResource {
  format?: string;
  name?: string;
  url?: string;
}
interface CkanPackageShowResponse {
  result?: {
    resources?: CkanResource[];
  };
}

export function createEmpresasEnUnDiaAdapter(
  options: EmpresasEnUnDiaOptions = {},
): SourceAdapter {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const packageShowUrl =
    options.packageShowUrl ??
    `${CKAN_BASE}/api/3/action/package_show?id=${PACKAGE_ID}`;
  const csvUrlsOverride = options.csvUrls;
  const years = options.years;

  return {
    id: "empresas-en-un-dia",
    ingest(opts?: SourceIngestOptions) {
      return ingest(
        { fetchImpl, packageShowUrl, csvUrlsOverride, years },
        opts,
      );
    },
  };
}

interface IngestContext {
  fetchImpl: typeof fetch;
  packageShowUrl: string;
  csvUrlsOverride: string[] | undefined;
  years: number[] | undefined;
}

async function* ingest(
  ctx: IngestContext,
  opts: SourceIngestOptions = {},
): AsyncGenerator<SourcePartial, void, void> {
  const { signal, limit } = opts;
  if (signal?.aborted) return;

  const csvUrls = ctx.csvUrlsOverride
    ? ctx.csvUrlsOverride
    : await resolveCsvUrlsFromCkan(ctx, ctx.years, signal);

  let emitted = 0;
  let invalidRuts = 0;
  let nonConstitucionSkipped = 0;

  for (const url of csvUrls) {
    if (signal?.aborted) break;
    if (typeof limit === "number" && emitted >= limit) break;

    const remaining =
      typeof limit === "number" ? limit - emitted : undefined;

    const result = yield* streamCsv(ctx, url, signal, remaining);
    emitted += result.emitted;
    invalidRuts += result.invalidRuts;
    nonConstitucionSkipped += result.nonConstitucionSkipped;
  }

  if (invalidRuts > 0 || nonConstitucionSkipped > 0) {
    logSkipped(invalidRuts, nonConstitucionSkipped);
  }
}

async function resolveCsvUrlsFromCkan(
  ctx: IngestContext,
  years: number[] | undefined,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const now = new Date();
  const wantYears =
    years && years.length > 0
      ? new Set(years)
      : new Set([now.getUTCFullYear(), now.getUTCFullYear() - 1]);

  const response = await ctx.fetchImpl(ctx.packageShowUrl, { signal });
  if (!response.ok) {
    throw new Error(
      `[empresas-en-un-dia] package_show failed: ${response.status} ${response.statusText}`,
    );
  }
  const json = (await response.json()) as CkanPackageShowResponse;
  const resources = json.result?.resources ?? [];

  const matches: { year: number; url: string }[] = [];
  for (const r of resources) {
    if (!r) continue;
    if ((r.format ?? "").toLowerCase() !== "csv") continue;
    const url = r.url;
    if (!url) continue;
    const year = extractYear(r.name, url);
    if (year === undefined) continue;
    if (!wantYears.has(year)) continue;
    matches.push({ year, url });
  }

  // Stable order: oldest first, so partial results are deterministic.
  matches.sort((a, b) => a.year - b.year);
  return matches.map((m) => m.url);
}

/**
 * Extract the year a CKAN resource describes. Prefers the `name` field
 * (e.g. "Constituciones del año 2025"), falling back to a 4-digit substring
 * in the URL filename (e.g. ".../2025-sociedades-..." or ".../202603-...").
 */
function extractYear(
  name: string | undefined,
  url: string,
): number | undefined {
  if (name) {
    const m = name.match(/(20\d{2})/);
    if (m) return Number(m[1]);
  }
  // Filename forms: "2025-sociedades-..." or "202603-sociedades-..."
  const path = url.split("?")[0];
  const filename = path.substring(path.lastIndexOf("/") + 1);
  const fnMatch = filename.match(/^(20\d{2})/);
  if (fnMatch) return Number(fnMatch[1]);
  const anyMatch = filename.match(/(20\d{2})/);
  if (anyMatch) return Number(anyMatch[1]);
  return undefined;
}

interface StreamResult {
  emitted: number;
  invalidRuts: number;
  nonConstitucionSkipped: number;
}

async function* streamCsv(
  ctx: IngestContext,
  url: string,
  signal: AbortSignal | undefined,
  limitForThisFile: number | undefined,
): AsyncGenerator<SourcePartial, StreamResult, void> {
  const response = await ctx.fetchImpl(url, { signal });
  if (!response.ok) {
    throw new Error(
      `[empresas-en-un-dia] fetch failed: ${response.status} ${response.statusText} (${url})`,
    );
  }
  if (!response.body) {
    throw new Error(`[empresas-en-un-dia] response has no body (${url})`);
  }

  const decoder = new TextDecoder("utf-8");
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();

  let buffer = "";
  let header: CanonicalField[] | null = null;
  let emitted = 0;
  let invalidRuts = 0;
  let nonConstitucionSkipped = 0;
  let bomStripped = false;

  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      if (!bomStripped) {
        if (buffer.startsWith(BOM)) buffer = buffer.slice(BOM.length);
        bomStripped = true;
      }

      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const rawLine = buffer.slice(0, newlineIdx).replace(/\r$/, "");
        buffer = buffer.slice(newlineIdx + 1);
        newlineIdx = buffer.indexOf("\n");

        if (rawLine.length === 0) continue;

        const cells = parseCsvLine(rawLine);
        if (!cells) continue;

        if (header === null) {
          header = cells.map((cell) => normalizeHeader(cell));
          continue;
        }

        if (signal?.aborted) break;

        const outcome = rowToPartial(header, cells);
        if (outcome.kind === "invalid-rut") {
          invalidRuts++;
          continue;
        }
        if (outcome.kind === "non-constitucion") {
          nonConstitucionSkipped++;
          continue;
        }

        yield outcome.partial;
        emitted++;

        if (
          typeof limitForThisFile === "number" &&
          emitted >= limitForThisFile
        ) {
          return { emitted, invalidRuts, nonConstitucionSkipped };
        }
      }
    }

    // Flush trailing line (no terminating newline).
    buffer += decoder.decode();
    if (!bomStripped && buffer.startsWith(BOM)) {
      buffer = buffer.slice(BOM.length);
    }
    const trailing = buffer.replace(/\r$/, "");
    if (trailing.length > 0 && header !== null) {
      const cells = parseCsvLine(trailing);
      if (cells) {
        const outcome = rowToPartial(header, cells);
        if (outcome.kind === "invalid-rut") {
          invalidRuts++;
        } else if (outcome.kind === "non-constitucion") {
          nonConstitucionSkipped++;
        } else if (!signal?.aborted) {
          if (
            typeof limitForThisFile !== "number" ||
            emitted < limitForThisFile
          ) {
            yield outcome.partial;
            emitted++;
          }
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // best-effort cleanup
    }
  }

  return { emitted, invalidRuts, nonConstitucionSkipped };
}

function logSkipped(invalidRuts: number, nonConstitucion: number): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[empresas-en-un-dia] skipped ${invalidRuts} rows with invalid RUTs, ${nonConstitucion} non-CONSTITUCION rows`,
  );
}

/** Parse a single CSV line via papaparse. Delimiter: `;`. */
function parseCsvLine(line: string): string[] | null {
  const result = Papa.parse<string[]>(line, {
    header: false,
    skipEmptyLines: true,
    delimiter: ";",
  });
  const row = result.data[0];
  if (!row || row.length === 0) return null;
  return row;
}

type CanonicalField =
  | "rut"
  | "razonSocial"
  | "fechaInicio"
  | "comunaTributaria"
  | "regionTributaria"
  | "comunaSocial"
  | "regionSocial"
  | "tipoActuacion"
  | "ignored";

/**
 * Normalize a CSV header cell to a canonical field key.
 *
 * Strategy: lowercase, strip diacritics, collapse non-alphanumerics to a
 * single underscore. Match known patterns. Anything else becomes "ignored"
 * so we don't accidentally clobber a canonical key with a stray column.
 */
function normalizeHeader(raw: string): CanonicalField {
  const key = raw
    .replace(BOM, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (key === "rut") return "rut";
  if (key === "razon_social") return "razonSocial";
  if (key.startsWith("fecha_de_actuacion")) return "fechaInicio";
  if (key === "comuna_tributaria") return "comunaTributaria";
  if (key === "region_tributaria") return "regionTributaria";
  if (key === "comuna_social") return "comunaSocial";
  if (key === "region_social") return "regionSocial";
  if (key === "tipo_de_actuacion") return "tipoActuacion";
  return "ignored";
}

/** Map a region numeric code to its canonical Chilean region name. */
const REGION_NAMES: Record<string, string> = {
  "1": "Tarapacá",
  "2": "Antofagasta",
  "3": "Atacama",
  "4": "Coquimbo",
  "5": "Valparaíso",
  "6": "O'Higgins",
  "7": "Maule",
  "8": "Biobío",
  "9": "La Araucanía",
  "10": "Los Lagos",
  "11": "Aysén",
  "12": "Magallanes",
  "13": "Metropolitana",
  "14": "Los Ríos",
  "15": "Arica y Parinacota",
  "16": "Ñuble",
};

function regionFromCode(code: string | undefined): string | undefined {
  const trimmed = cleanText(code);
  if (!trimmed) return undefined;
  return REGION_NAMES[trimmed] ?? trimmed;
}

/** Convert "DD-MM-YYYY" to "YYYY-MM-DD". Returns undefined if it doesn't match. */
function ddmmyyyyToIso(input: string | undefined): string | undefined {
  const trimmed = cleanText(input);
  if (!trimmed) return undefined;
  const m = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Strip diacritics + uppercase, for case/accent-insensitive equality. */
function foldUpper(input: string): string {
  return input
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

type RowOutcome =
  | { kind: "ok"; partial: SourcePartial }
  | { kind: "invalid-rut" }
  | { kind: "non-constitucion" };

function rowToPartial(
  header: CanonicalField[],
  cells: string[],
): RowOutcome {
  const record: Partial<Record<CanonicalField, string>> = {};
  for (let i = 0; i < header.length; i++) {
    const key = header[i];
    if (!key || key === "ignored") continue;
    const value = cells[i];
    if (value === undefined) continue;
    record[key] = value;
  }

  // 1. Filter to CONSTITUCIÓN rows (case- and accent-insensitive).
  const tipo = record.tipoActuacion;
  if (tipo !== undefined && cleanText(tipo)) {
    if (foldUpper(tipo) !== "CONSTITUCION") {
      return { kind: "non-constitucion" };
    }
  }

  // 2. RUT is mandatory.
  const rawRut = record.rut;
  if (!rawRut || rawRut.trim().length === 0) {
    return { kind: "invalid-rut" };
  }

  let rut: string;
  try {
    rut = canonicalizeRut(rawRut);
  } catch {
    return { kind: "invalid-rut" };
  }

  const partial: SourcePartial = { rut };

  const razonSocial = cleanText(record.razonSocial);
  if (razonSocial) partial.razonSocial = razonSocial;

  const fechaInicio = ddmmyyyyToIso(record.fechaInicio);
  if (fechaInicio) partial.fechaInicio = fechaInicio;

  // Prefer the social (legal) location over the tax location, falling back.
  const comunaRaw = cleanText(record.comunaSocial) ?? cleanText(record.comunaTributaria);
  const comuna = titleCaseEs(comunaRaw);
  if (comuna) partial.comuna = comuna;

  const region =
    regionFromCode(record.regionSocial) ?? regionFromCode(record.regionTributaria);
  if (region) partial.region = region;

  return { kind: "ok", partial };
}
