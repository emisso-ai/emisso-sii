/**
 * Public entry point: `createRegistry()` wires the cache, source adapters and
 * merger into a single API used by callers.
 */

import { createRegistryCache, type RegistryCache } from "./cache";
import { mergeCompany } from "./merge";
import { fingerprint } from "./normalize";
import type {
  ChileanCompany,
  IcpFilters,
  RegistryOptions,
  SourceAdapter,
  SourceHit,
  SourceId,
  SourcePartial,
  SyncOptions,
  SyncResult,
} from "./types";

export interface Registry {
  sync(opts?: SyncOptions): Promise<SyncResult[]>;
  findCompanies(filters: IcpFilters): ChileanCompany[];
  getCompany(rut: string): ChileanCompany | undefined;
  enrich(opts: { rut: string; sources?: SourceId[] }): Promise<ChileanCompany | undefined>;
  close(): void;
}

export function createRegistry(options: RegistryOptions = {}): Registry {
  const cacheFile = options.cacheDir ?? ".registry-cache/registry.sqlite";
  const cache = createRegistryCache(cacheFile);
  const adapters = options.sources ?? {};

  async function ingestOne(
    cache: RegistryCache,
    adapter: SourceAdapter,
    opts?: SyncOptions,
  ): Promise<SyncResult> {
    const start = Date.now();
    const result: SyncResult = {
      source: adapter.id,
      recordsIngested: 0,
      recordsUpdated: 0,
      errors: [],
      durationMs: 0,
    };

    try {
      const touchedRuts = new Set<string>();
      for await (const partial of adapter.ingest(opts)) {
        try {
          const fp = fingerprint(partial);
          cache.upsertSourceHit(partial.rut, adapter.id, partial, fp);
          touchedRuts.add(partial.rut);
          result.recordsIngested++;
        } catch (err) {
          result.errors.push({
            rut: partial.rut,
            message: (err as Error).message,
            cause: err,
          });
        }
      }

      // Re-merge every touched RUT to refresh canonical record.
      for (const rut of touchedRuts) {
        const partials = cache.getSourcePartials(rut);
        const hits: SourceHit[] = Array.from(partials.keys()).map((s) => ({
          source: s,
          fetchedAt: new Date().toISOString(),
          fingerprint: fingerprint(partials.get(s)),
        }));
        const merged = mergeCompany({ rut, partials, hits });
        cache.upsertCompany(merged);
        result.recordsUpdated++;
      }
    } catch (err) {
      result.errors.push({
        message: `Adapter ${adapter.id} failed: ${(err as Error).message}`,
        cause: err,
      });
    }

    result.durationMs = Date.now() - start;
    return result;
  }

  return {
    async sync(opts) {
      const requested = opts?.sources ?? (Object.keys(adapters) as SourceId[]);
      const results: SyncResult[] = [];
      for (const id of requested) {
        const adapter = adapters[id];
        if (!adapter) {
          results.push({
            source: id,
            recordsIngested: 0,
            recordsUpdated: 0,
            errors: [{ message: `Adapter ${id} is not registered` }],
            durationMs: 0,
          });
          continue;
        }
        results.push(await ingestOne(cache, adapter, opts));
      }
      return results;
    },

    findCompanies(filters) {
      return cache.findCompanies(filters);
    },

    getCompany(rut) {
      return cache.getCompany(rut);
    },

    async enrich({ rut, sources }) {
      const requested = sources ?? (Object.keys(adapters) as SourceId[]);
      for (const id of requested) {
        const adapter = adapters[id];
        if (!adapter) continue;
        for await (const partial of adapter.ingest({ limit: 1 })) {
          if (partial.rut !== rut) continue;
          const fp = fingerprint(partial);
          cache.upsertSourceHit(rut, id, partial, fp);
          break;
        }
      }
      const partials = cache.getSourcePartials(rut);
      if (partials.size === 0) return undefined;
      const hits: SourceHit[] = Array.from(partials.keys()).map((s) => ({
        source: s,
        fetchedAt: new Date().toISOString(),
        fingerprint: fingerprint(partials.get(s)),
      }));
      const merged = mergeCompany({ rut, partials, hits });
      cache.upsertCompany(merged);
      return merged;
    },

    close() {
      cache.close();
    },
  };
}
