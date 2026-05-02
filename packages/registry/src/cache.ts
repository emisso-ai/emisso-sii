/**
 * SQLite-backed cache for the registry. Stores both the merged canonical
 * `ChileanCompany` per RUT and the per-source raw partials for provenance.
 *
 * The schema extracts a few index columns (comuna, rubro, signals, score) so
 * filter queries don't need JSON1; the full record is kept as JSON in `data`.
 */

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import type { ChileanCompany, IcpFilters, SourceId, SourcePartial } from "./types";

export interface RegistryCache {
  upsertSourceHit(rut: string, source: SourceId, partial: SourcePartial, fingerprint: string): void;
  upsertCompany(company: ChileanCompany): void;
  getCompany(rut: string): ChileanCompany | undefined;
  getSourcePartials(rut: string): Map<SourceId, SourcePartial>;
  findCompanies(filters: IcpFilters): ChileanCompany[];
  countCompanies(filters?: IcpFilters): number;
  close(): void;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  rut TEXT PRIMARY KEY,
  razon_social TEXT NOT NULL,
  rubro_codigo TEXT,
  rubro_descripcion TEXT,
  comuna TEXT,
  region TEXT,
  dotacion_aprox INTEGER,
  tramo_ventas TEXT,
  signal_vende_estado INTEGER NOT NULL DEFAULT 0,
  signal_cotizada INTEGER NOT NULL DEFAULT 0,
  signal_socio_sofofa INTEGER NOT NULL DEFAULT 0,
  signal_exportadora INTEGER NOT NULL DEFAULT 0,
  signal_emisor_regulado INTEGER NOT NULL DEFAULT 0,
  monto_adjudicado_max INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_comuna ON companies(comuna);
CREATE INDEX IF NOT EXISTS idx_companies_region ON companies(region);
CREATE INDEX IF NOT EXISTS idx_companies_rubro ON companies(rubro_codigo);
CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(score DESC);

CREATE TABLE IF NOT EXISTS source_hits (
  rut TEXT NOT NULL,
  source TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (rut, source)
);
CREATE INDEX IF NOT EXISTS idx_source_hits_source ON source_hits(source);
`;

export function createRegistryCache(filename: string): RegistryCache {
  const db: DB = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  const upsertCompanyStmt = db.prepare(`
    INSERT INTO companies (
      rut, razon_social, rubro_codigo, rubro_descripcion, comuna, region,
      dotacion_aprox, tramo_ventas,
      signal_vende_estado, signal_cotizada, signal_socio_sofofa,
      signal_exportadora, signal_emisor_regulado,
      monto_adjudicado_max, score, data, updated_at
    ) VALUES (
      @rut, @razon_social, @rubro_codigo, @rubro_descripcion, @comuna, @region,
      @dotacion_aprox, @tramo_ventas,
      @signal_vende_estado, @signal_cotizada, @signal_socio_sofofa,
      @signal_exportadora, @signal_emisor_regulado,
      @monto_adjudicado_max, @score, @data, @updated_at
    )
    ON CONFLICT(rut) DO UPDATE SET
      razon_social = excluded.razon_social,
      rubro_codigo = excluded.rubro_codigo,
      rubro_descripcion = excluded.rubro_descripcion,
      comuna = excluded.comuna,
      region = excluded.region,
      dotacion_aprox = excluded.dotacion_aprox,
      tramo_ventas = excluded.tramo_ventas,
      signal_vende_estado = excluded.signal_vende_estado,
      signal_cotizada = excluded.signal_cotizada,
      signal_socio_sofofa = excluded.signal_socio_sofofa,
      signal_exportadora = excluded.signal_exportadora,
      signal_emisor_regulado = excluded.signal_emisor_regulado,
      monto_adjudicado_max = excluded.monto_adjudicado_max,
      score = excluded.score,
      data = excluded.data,
      updated_at = excluded.updated_at
  `);

  const upsertHitStmt = db.prepare(`
    INSERT INTO source_hits (rut, source, fingerprint, fetched_at, data)
    VALUES (@rut, @source, @fingerprint, @fetched_at, @data)
    ON CONFLICT(rut, source) DO UPDATE SET
      fingerprint = excluded.fingerprint,
      fetched_at = excluded.fetched_at,
      data = excluded.data
  `);

  const getCompanyStmt = db.prepare(`SELECT data FROM companies WHERE rut = ?`);
  const getHitsStmt = db.prepare(`SELECT source, data FROM source_hits WHERE rut = ?`);

  return {
    upsertCompany(company) {
      upsertCompanyStmt.run({
        rut: company.rut,
        razon_social: company.razonSocial,
        rubro_codigo: company.rubroCodigo ?? null,
        rubro_descripcion: company.rubroDescripcion ?? null,
        comuna: company.comuna ?? null,
        region: company.region ?? null,
        dotacion_aprox: company.dotacionAprox ?? null,
        tramo_ventas: company.tramoVentas ?? null,
        signal_vende_estado: company.signals.venceAlEstado ? 1 : 0,
        signal_cotizada: company.signals.cotizada ? 1 : 0,
        signal_socio_sofofa: company.signals.socioSofofa ? 1 : 0,
        signal_exportadora: company.signals.exportadora ? 1 : 0,
        signal_emisor_regulado: company.signals.emisorRegulado ? 1 : 0,
        monto_adjudicado_max: company.signals.montoAdjudicadoMaxAnual ?? null,
        score: company.score,
        data: JSON.stringify(company),
        updated_at: Date.now(),
      });
    },

    upsertSourceHit(rut, source, partial, fingerprint) {
      upsertHitStmt.run({
        rut,
        source,
        fingerprint,
        fetched_at: new Date().toISOString(),
        data: JSON.stringify(partial),
      });
    },

    getCompany(rut) {
      const row = getCompanyStmt.get(rut) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as ChileanCompany) : undefined;
    },

    getSourcePartials(rut) {
      const rows = getHitsStmt.all(rut) as Array<{ source: SourceId; data: string }>;
      const map = new Map<SourceId, SourcePartial>();
      for (const r of rows) map.set(r.source, JSON.parse(r.data) as SourcePartial);
      return map;
    },

    findCompanies(filters) {
      const { sql, params } = buildFilterQuery(filters);
      const rows = db.prepare(sql).all(...params) as Array<{ data: string }>;
      return rows.map((r) => JSON.parse(r.data) as ChileanCompany);
    },

    countCompanies(filters) {
      const { sql, params } = buildFilterQuery(filters ?? {}, true);
      const row = db.prepare(sql).get(...params) as { n: number };
      return row.n;
    },

    close() {
      db.close();
    },
  };
}

function buildFilterQuery(filters: IcpFilters, count = false) {
  const wheres: string[] = [];
  const params: unknown[] = [];

  if (filters.comunas?.length) {
    wheres.push(`comuna IN (${filters.comunas.map(() => "?").join(",")})`);
    params.push(...filters.comunas);
  }
  if (filters.regiones?.length) {
    wheres.push(`region IN (${filters.regiones.map(() => "?").join(",")})`);
    params.push(...filters.regiones);
  }
  if (filters.rubrosIncluye?.length) {
    const clauses = filters.rubrosIncluye.map(() => `rubro_descripcion LIKE ?`);
    wheres.push(`(${clauses.join(" OR ")})`);
    params.push(...filters.rubrosIncluye.map((r) => `%${r}%`));
  }
  if (filters.rubrosExcluye?.length) {
    for (const r of filters.rubrosExcluye) {
      wheres.push(`(rubro_descripcion IS NULL OR rubro_descripcion NOT LIKE ?)`);
      params.push(`%${r}%`);
    }
  }
  if (filters.signals) {
    if (filters.signals.venceAlEstado) wheres.push(`signal_vende_estado = 1`);
    if (filters.signals.cotizada) wheres.push(`signal_cotizada = 1`);
    if (filters.signals.socioSofofa) wheres.push(`signal_socio_sofofa = 1`);
    if (filters.signals.exportadora) wheres.push(`signal_exportadora = 1`);
    if (filters.signals.emisorRegulado) wheres.push(`signal_emisor_regulado = 1`);
  }
  if (typeof filters.scoreMin === "number") {
    wheres.push(`score >= ?`);
    params.push(filters.scoreMin);
  }

  const whereSql = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

  if (count) {
    return { sql: `SELECT COUNT(*) AS n FROM companies ${whereSql}`, params };
  }

  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  return {
    sql: `SELECT data FROM companies ${whereSql} ORDER BY score DESC LIMIT ? OFFSET ?`,
    params: [...params, limit, offset],
  };
}
