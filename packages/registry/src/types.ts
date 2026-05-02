/**
 * Core domain types for @emisso/registry-cl.
 *
 * Every source adapter normalizes its raw payloads into `Partial<ChileanCompany>`
 * keyed by canonical RUT, then the merger consolidates per-RUT records into a
 * unified `ChileanCompany` with provenance and a derived score.
 */

// ============================================================================
// CORE COMPANY SHAPE
// ============================================================================

export interface ChileanCompany {
  /** Canonical RUT: digits + hyphen + verifier, uppercase. e.g. "76543210-K". */
  rut: string;
  razonSocial: string;
  rubroCodigo?: string;
  rubroDescripcion?: string;
  comuna?: string;
  region?: string;
  domicilio?: string;
  /** ISO date "YYYY-MM-DD". */
  fechaInicio?: string;
  estado?: CompanyEstado;
  /** Best estimate of headcount; sources differ in fidelity. */
  dotacionAprox?: number;
  /** Annual sales in UF, when known precisely. */
  ventasUf?: number;
  /** SII tramo de ventas (e.g. "1.1", "5.4") when only range is known. */
  tramoVentas?: string;
  sitioWeb?: string;
  emailContacto?: string;
  telefonoContacto?: string;
  representanteLegal?: string;
  /** All sources that produced data for this RUT. */
  fuentes: SourceHit[];
  signals: CompanySignals;
  /** 0-100 derived from source breadth + signals + size. */
  score: number;
}

export type CompanyEstado = "activa" | "suspendida" | "no_vigente";

export interface CompanySignals {
  /** Has won at least one ChileCompra licitation. */
  venceAlEstado?: boolean;
  /** Max annual award amount in CLP from ChileCompra. */
  montoAdjudicadoMaxAnual?: number;
  /** Listed on Bolsa de Santiago. */
  cotizada?: boolean;
  /** Member of Sofofa. */
  socioSofofa?: boolean;
  /** Listed in ProChile exporters catalogue. */
  exportadora?: boolean;
  /** Regulated by CMF (bank, AFP, insurer, securities issuer, etc.). */
  emisorRegulado?: boolean;
}

// ============================================================================
// PROVENANCE
// ============================================================================

export type SourceId =
  | "empresas-en-un-dia"
  | "chilecompra"
  | "cmf"
  | "sofofa"
  | "bolsa-santiago"
  | "cnc"
  | "diario-oficial"
  | "sii-stc";

export interface SourceHit {
  source: SourceId;
  /** ISO datetime when this record was fetched. */
  fetchedAt: string;
  /** Stable hash of the source payload, for change detection. */
  fingerprint: string;
}

// ============================================================================
// SIZE TIERS
// ============================================================================

/**
 * SII tramo families:
 *   1.x → micro (0-2400 UF)
 *   2.x → pequeña (2400-25000 UF)
 *   3.x → mediana (25000-100000 UF)
 *   4.x → grande (100000-600000 UF)
 *   5.x → grande+ (600000+ UF)
 */
export type SizeTier = "micro" | "pequeña" | "mediana" | "grande";

// ============================================================================
// QUERY API
// ============================================================================

export interface IcpFilters {
  comunas?: string[];
  regiones?: string[];
  rubrosIncluye?: string[];
  rubrosExcluye?: string[];
  /** Inclusive minimum size tier. */
  tamañoMin?: SizeTier;
  /** Inclusive maximum size tier. */
  tamañoMax?: SizeTier;
  /** Match if ALL listed signals are true. */
  signals?: Partial<CompanySignals>;
  /** Minimum derived score [0-100]. */
  scoreMin?: number;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SOURCE ADAPTER CONTRACT
// ============================================================================

/**
 * Every source adapter implements this contract. Adapters are responsible for
 *   - fetching their raw payloads with appropriate rate limits
 *   - normalizing fields to canonical shapes (RUT format, comuna title-case)
 *   - yielding partials keyed by `rut` plus whichever fields they observe
 *
 * Adapters MUST NOT write to storage; the registry orchestrator handles caching
 * and merging.
 */
export interface SourceAdapter {
  readonly id: SourceId;
  ingest(opts?: SourceIngestOptions): AsyncIterable<SourcePartial>;
}

export interface SourcePartial extends Partial<ChileanCompany> {
  /** RUT in canonical form, REQUIRED. */
  rut: string;
}

export interface SourceIngestOptions {
  signal?: AbortSignal;
  /** Hint for incremental fetches; sources may ignore if they only support full sweep. */
  since?: string;
  /** Hard cap on records emitted (useful for tests / dry-runs). */
  limit?: number;
}

// ============================================================================
// REGISTRY-LEVEL TYPES
// ============================================================================

export interface RegistryOptions {
  /** Path to SQLite cache. Use ":memory:" for tests. */
  cacheDir?: string;
  /** Override individual source adapters (useful for tests + DI). */
  sources?: Partial<Record<SourceId, SourceAdapter>>;
}

export interface SyncOptions extends SourceIngestOptions {
  sources?: SourceId[];
}

export interface SyncResult {
  source: SourceId;
  recordsIngested: number;
  recordsUpdated: number;
  errors: SyncError[];
  durationMs: number;
}

export interface SyncError {
  rut?: string;
  message: string;
  cause?: unknown;
}
