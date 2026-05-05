/**
 * Merge logic: collapses per-source partials into a single canonical
 * `ChileanCompany` and assigns a derived score in [0, 100].
 */

import type {
  ChileanCompany,
  CompanySignals,
  SourceHit,
  SourceId,
  SourcePartial,
} from "./types";

interface MergeInput {
  rut: string;
  partials: Map<SourceId, SourcePartial>;
  hits: SourceHit[];
}

/**
 * Field-level precedence: which sources we trust most for which field. Higher
 * index = higher trust (last write wins among trusted sources).
 */
const FIELD_PRECEDENCE: Record<string, SourceId[]> = {
  razonSocial: ["empresas-en-un-dia", "chilecompra", "cmf", "sii-stc"],
  rubroCodigo: ["empresas-en-un-dia", "chilecompra", "cmf", "sii-stc"],
  rubroDescripcion: ["empresas-en-un-dia", "chilecompra", "sofofa", "cmf", "sii-stc"],
  comuna: ["empresas-en-un-dia", "chilecompra", "sii-stc"],
  region: ["empresas-en-un-dia", "chilecompra", "sii-stc"],
  domicilio: ["chilecompra", "cmf", "sii-stc"],
  fechaInicio: ["empresas-en-un-dia", "sii-stc", "diario-oficial"],
  estado: ["sii-stc", "empresas-en-un-dia"],
  dotacionAprox: ["cmf", "chilecompra", "sii-stc"],
  ventasUf: ["cmf", "sii-stc"],
  tramoVentas: ["sii-stc"],
  sitioWeb: ["sofofa", "cnc", "cmf", "bolsa-santiago"],
  emailContacto: ["chilecompra", "sofofa", "cnc"],
  telefonoContacto: ["chilecompra", "sofofa"],
  representanteLegal: ["cmf", "diario-oficial", "sii-stc"],
};

export function mergeCompany(input: MergeInput): ChileanCompany {
  const { rut, partials, hits } = input;

  const merged: ChileanCompany = {
    rut,
    razonSocial: pickField(partials, "razonSocial") ?? `RUT ${rut}`,
    fuentes: hits,
    signals: deriveSignals(partials),
    score: 0,
  };

  for (const field of [
    "rubroCodigo",
    "rubroDescripcion",
    "comuna",
    "region",
    "domicilio",
    "fechaInicio",
    "estado",
    "dotacionAprox",
    "ventasUf",
    "tramoVentas",
    "sitioWeb",
    "emailContacto",
    "telefonoContacto",
    "representanteLegal",
  ] as const) {
    const value = pickField(partials, field);
    if (value !== undefined) (merged as unknown as Record<string, unknown>)[field] = value;
  }

  merged.score = computeScore(merged);
  return merged;
}

function pickField<K extends keyof ChileanCompany>(
  partials: Map<SourceId, SourcePartial>,
  field: K,
): ChileanCompany[K] | undefined {
  const order = FIELD_PRECEDENCE[field as string] ?? [];
  // Iterate in reverse precedence so the most-trusted source wins.
  for (let i = order.length - 1; i >= 0; i--) {
    const partial = partials.get(order[i]);
    const value = partial?.[field];
    if (value !== undefined && value !== null && value !== "") {
      return value as ChileanCompany[K];
    }
  }
  // Fallback: any source that has the field, last write wins.
  for (const partial of partials.values()) {
    const value = partial[field];
    if (value !== undefined && value !== null && value !== "") {
      return value as ChileanCompany[K];
    }
  }
  return undefined;
}

function deriveSignals(partials: Map<SourceId, SourcePartial>): CompanySignals {
  const signals: CompanySignals = {};
  for (const partial of partials.values()) {
    if (partial.signals?.vendeAlEstado) signals.vendeAlEstado = true;
    if (partial.signals?.cotizada) signals.cotizada = true;
    if (partial.signals?.socioSofofa) signals.socioSofofa = true;
    if (partial.signals?.exportadora) signals.exportadora = true;
    if (partial.signals?.emisorRegulado) signals.emisorRegulado = true;
    const monto = partial.signals?.montoAdjudicadoMaxAnual;
    if (typeof monto === "number") {
      signals.montoAdjudicadoMaxAnual = Math.max(
        signals.montoAdjudicadoMaxAnual ?? 0,
        monto,
      );
    }
  }
  // Derive from source presence even if the source didn't tag the signal.
  if (partials.has("sofofa")) signals.socioSofofa = true;
  if (partials.has("cmf")) signals.emisorRegulado = true;
  if (partials.has("bolsa-santiago")) signals.cotizada = true;
  if (partials.has("chilecompra")) signals.vendeAlEstado = true;
  return signals;
}

/**
 * Score 0-100. Heuristic favors:
 *   - breadth of sources (more hits → higher quality)
 *   - presence of "size" signals (CMF, Sofofa, Bolsa, ChileCompra big tickets)
 *   - direct headcount or sales data
 */
function computeScore(company: ChileanCompany): number {
  let score = 0;
  // Source breadth: up to 30 points (5 per source, capped).
  score += Math.min(company.fuentes.length * 5, 30);

  // Size signals: 25 points if regulated/cotized, 15 if Sofofa, 10 if exporter.
  if (company.signals.emisorRegulado) score += 25;
  if (company.signals.cotizada) score += 25;
  if (company.signals.socioSofofa) score += 15;
  if (company.signals.exportadora) score += 10;

  // ChileCompra signal: scaled by award size.
  const monto = company.signals.montoAdjudicadoMaxAnual ?? 0;
  if (monto > 1_000_000_000) score += 20;
  else if (monto > 200_000_000) score += 12;
  else if (monto > 50_000_000) score += 6;
  else if (company.signals.vendeAlEstado) score += 3;

  // Headcount precision: 10 points if known.
  if (typeof company.dotacionAprox === "number") score += 10;
  // Sales precision: 10 points if known.
  if (typeof company.ventasUf === "number") score += 10;

  return Math.min(score, 100);
}
