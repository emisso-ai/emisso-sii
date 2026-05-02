/**
 * @emisso/registry-cl
 *
 * Chilean active company registry — discovery + enrichment SDK. Aggregates
 * public sources (Empresas en un Día, ChileCompra, CMF, Sofofa, ProChile,
 * Diario Oficial, SII) into a unified, filterable index.
 */

export { createRegistry, type Registry } from "./registry";
export { createRegistryCache, type RegistryCache } from "./cache";
export { mergeCompany } from "./merge";
export {
  canonicalizeRut,
  isValidRut,
  computeRutVerifier,
  titleCaseEs,
  cleanText,
  tramoToSizeTier,
  headcountToSizeTier,
  sizeTierAtLeast,
  sizeTierAtMost,
  fingerprint,
} from "./normalize";

export type {
  ChileanCompany,
  CompanyEstado,
  CompanySignals,
  IcpFilters,
  RegistryOptions,
  SizeTier,
  SourceAdapter,
  SourceHit,
  SourceId,
  SourceIngestOptions,
  SourcePartial,
  SyncError,
  SyncOptions,
  SyncResult,
} from "./types";
