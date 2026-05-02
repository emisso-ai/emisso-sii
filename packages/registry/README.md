# @emisso/registry-cl

> Chilean active-company registry — discovery + enrichment SDK.

Aggregates public Chilean sources (Empresas en un Día, ChileCompra, CMF, Sofofa, ProChile, Diario Oficial, SII) into a single filterable index keyed by RUT. Designed for B2B prospecting, ICP discovery, and enrichment of known RUTs.

## Install

```bash
pnpm add @emisso/registry-cl
```

## Quick start

```ts
import {
  createRegistry,
  createEmpresasEnUnDiaAdapter,
  createChileCompraAdapter,
  createCmfAdapter,
} from "@emisso/registry-cl";

const registry = createRegistry({
  cacheDir: ".registry-cache/registry.sqlite",
  sources: {
    "empresas-en-un-dia": createEmpresasEnUnDiaAdapter(),
    chilecompra: createChileCompraAdapter({ ticket: process.env.CHILECOMPRA_TICKET! }),
    cmf: createCmfAdapter(),
  },
});

await registry.sync({ sources: ["empresas-en-un-dia", "chilecompra", "cmf"] });

const matches = registry.findCompanies({
  comunas: ["Las Condes", "Providencia"],
  rubrosIncluye: ["seguros", "salud"],
  signals: { venceAlEstado: true },
  scoreMin: 40,
  limit: 50,
});

for (const c of matches) {
  console.log(c.rut, c.razonSocial, c.score);
}
```

## Sources

| ID | Source | Coverage | Cost | Provides RUT? |
|----|--------|----------|------|---------------|
| `empresas-en-un-dia` | datos.gob.cl `registro-de-empresas-y-sociedades` (CKAN) | ~1.5M Chilean companies, one CSV per year | free | ✅ yes |
| `chilecompra` | api.mercadopublico.cl OCs (day-by-day sweep) | ~250k state suppliers | free (ticket) | ✅ yes (`Proveedor.Codigo`) |
| `cmf` | cmfchile.cl `consulta.php` × 5 verticals | ~850 regulated entities (emisores, corredores, AFP, seguros vida, Ley 20.382) | free | ✅ yes |
| `sofofa` | sofofa.cl/empresas-socias | 151 industrial socios (sector + sitio web) | free | ❌ no — `listSofofaSocios()` only |
| `cnc` | cnc.cl/socios × 5 sub-URLs | 91 commerce members + chambers + sectoral associations | free | ❌ no — `listCncSocios()` only |
| `diario-oficial` | diariooficial.interior.gob.cl `empresas_cooperativas.php` | event stream of new constituciones | free | ✅ yes (RUT inline in HTML) |
| `sii-stc` | zeus.sii.cl STC (no portal session, captcha auto-bypass) | per-RUT enrichment | free | ✅ yes (input) |

**Removed** (verified to have no public endpoint): `prochile`. See `CALIBRATION.md` for the discovery-vs-enrichment strategy that replaces it.

## License

MIT — see [LICENSE](../../LICENSE).
