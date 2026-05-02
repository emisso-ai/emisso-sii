# Source calibration status — last verified 2026-05-01

Reality check of every source adapter against its live HTTP target. Every entry below is **live-verified** with curl + corroborated by independent OSS scrapers where applicable.

| Source | Status | Verified | Outstanding |
|--------|--------|----------|-------------|
| `empresas-en-un-dia` | ✅ calibrated | URL, encoding, delimiter, columns, dates, region map | — |
| `cmf` | ✅ calibrated | URL, 5 verticals, selectors, no-pagination | Banks (separate landing, RUT not exposed) |
| `diario-oficial` | ✅ calibrated | URL, F5 cookie bypass, selectors, edition anchor | Production should inject feriado-aware edition resolver; PDF parsing for fechaInicio/repr/domicilio is Phase 2 |
| `chilecompra` | ✅ calibrated | URL, params, response shape, rate limits | Live verification with a real ticket still recommended before bulk runs |
| `sii-stc` | ✅ calibrated | URL, captcha bypass, ISO-8859-1, selectors, estado mapping | More AVISO samples (Bloqueado / Querella) to harden the estado heuristic |
| `sofofa` | ✅ calibrated | URL `/empresas-socias/`, 151 socios real, selectors | RUT not exposed by the source — discovery only via cross-ref with another adapter |
| `cnc` | ✅ calibrated (NEW) | 5 sub-URLs, 91 cards, parser | Same RUT caveat as sofofa |
| `prochile` | ❌ removed | Confirmed there is no public exporter catalogue | See note below for replacement strategy |

---

## empresas-en-un-dia

**Verified against** `https://datos.gob.cl/api/3/action/package_show?id=registro-de-empresas-y-sociedades`.

- One CSV per year (2013–2026), discovered via CKAN's `package_show` API.
- **Encoding:** UTF-8 with BOM. **Delimiter:** `;`. **Date format:** `DD-MM-YYYY`.
- **Header (verbatim):** `ID;RUT;Razon Social;Fecha de actuacion (1era firma);Fecha de registro (ultima firma);Fecha de aprobacion x SII;Anio;Mes;Comuna Tributaria;Region Tributaria;Codigo de sociedad;Tipo de actuacion;Capital;Comuna Social;Region Social`
- **Comuna:** uppercase ASCII; **Region:** numeric code 1–16, mapped to canonical names in-adapter.
- **`Tipo de actuacion`:** filter to `CONSTITUCIÓN` only; `MODIFICACIÓN` / `DISOLUCIÓN` / `MIGRACIÓN` are skipped.

Resource URLs are non-predictable (some years carry `_v2`/`_v3` suffixes), so they are discovered at runtime via CKAN. `years` option (default = current year + previous) trims the universe.

---

## cmf

**Verified against** `https://www.cmfchile.cl/institucional/mercados/consulta.php` with 5 verticals.

| Vertical | mercado | code | Param | Verified rows |
|---|---|---|---|---|
| Emisores de valores oferta pública | `V` | `RVEMI` | `entidad` | 350 |
| Corredores de bolsa | `V` | `COBOL` | `entidad` | 24 |
| AFP | `V` | `RGAFP` | `entidad` | 6 |
| Compañías seguros de vida | `S` | `CSVID` | `consulta` | 32 |
| Entidades informantes Ley 20.382 | `O` | `RGEIN` | `consulta` | 441 |

- **HTML structure:** single `<table>`, headers in first 2 `<tr>`s, then per-entity rows with 3 `<td>`: `[RUT, Razón Social, Estado]`. RUT is in `td:nth-child(1) a`, razón social in `td:nth-child(2) a`, estado (`VI`/`NV`) in `td:nth-child(3)`.
- **No pagination.** Each listing returns the full universe in one response.
- **Filter:** only `Estado=VI` rows are emitted. `signals.emisorRegulado: true` is set on every yield.

**Banks (TODO):** the bancos directory lives on a different landing (`/portal/principal/613/w3-propertyvalue-29006.html`) and does not expose RUT inline. Skipped in V1; would need RUT enrichment from another source.

---

## diario-oficial

**Verified against** `https://www.diariooficial.interior.gob.cl/edicionelectronica/empresas_cooperativas.php?date=DD-MM-YYYY&edition=NNNNN`.

- **F5/TSPD JS bot challenge** is bypassable without Playwright: warm-up GET to `/edicionelectronica/` → harvest `Set-Cookie` (`TS7cf1f3b9027`, `TS246c89b2029`) → replay on edition GETs. Skeleton responses (~6 KiB + `<noscript>`) trigger up to 3 retries with jittered backoff.
- **Edition resolver** anchored at `{ date: "2026-04-28", edition: 44390 }`. Default heuristic walks Mon–Sat (skips Sundays). Production callers should inject `getEditionForDate` backed by a Chilean feriado calendar — weekday holidays will desync the default by +1 per holiday.
- **Selectors:** `tr.title1` (section header) → walk siblings until next `tr.title1`, collect `tr.content` rows. Per row: `td > div[style*="float:left"]` for razón social, `td > div[style*="float:right"]` for RUT (asterisk-stripped, self-declared flag retained internally), `td > a[href$=".pdf"]` for the signed PDF link.
- **TIPO filter:** PDF filename must start with `C_` (constitución). `M_*`/`D_*` (modificación/disolución) are dropped.
- **Empty-edition signal:** `<p class="nofound">` or empty `<section class="norma_general">`.

**Phase 2 TODO:** `fechaInicio`, `representanteLegal`, `domicilio` live in the signed PDF body, not the HTML. A second pass with `pdf-parse` is the planned enhancement.

---

## chilecompra

**Verified against** `gepd/MercadoPublico` (TS SDK, MIT) `types.d.ts:72-101` + live probes against `api.mercadopublico.cl`.

- **Endpoint:** `GET /servicios/v1/publico/ordenesdecompra.json?ticket=...&fecha=DDMMYYYY`.
- **Date param:** `fecha` (singular) with `DDMMYYYY` (no separators). Anything else returns `HTTP 400 "Nombre de parametro no válido."`. Adapter iterates day-by-day.
- **Response shape (subset):**
  ```jsonc
  { "Cantidad": N, "Listado": [
    { "Codigo": "...", "Total": 1190000, "TotalNeto": 1000000,
      "Fechas": { "FechaEnvio": "...", "FechaAceptacion": "..." },
      "Proveedor": { "Codigo": "76543210-3", "Nombre": "ACME SpA" } } ] }
  ```
- **Field paths:** `Listado[].Proveedor.Codigo` (RUT, NOT `CodigoProveedor`), `Proveedor.Nombre` (NOT `NombreProveedor`), `Total` (gross) with `TotalNeto` fallback (NOT `MontoTotalOC`).
- **No pagination.** Each daily response holds the day's universe (typically 100–2000 OCs).
- **Rate limits:** 10 000 requests/day per ticket; **no concurrent requests** (`Codigo=10500` if you try). Default `minRequestIntervalMs: 1500`. The adapter retries once with backoff on `Codigo=10500`.
- **Aggregation:** the adapter dedupes by RUT across the sweep and emits each provider exactly once with the max `Total` observed.
- **Errors:** `ChileCompraApiError` exported, surfaces `Codigo=203` (invalid ticket), `Codigo=400` (bad param), `Codigo=10500` (concurrent).
- **OCDS alternative** (`apis.mercadopublico.cl/OCDS/data/listaAñoMes/...`) is documented but not wired up — it allows ticket-less paginated access for backfill, useful as a future complement.

---

## sii-stc

**Verified live + corroborated against three OSS scrapers** (`pdelteil/sii_situacion_tributaria`, `jcastro-zq/IDFiscal_Chile`, `rodrigore/sii_chile`).

- **Endpoint host:** `zeus.sii.cl` (NOT `zeusr.sii.cl` — that one returns 404).
- **No portal session needed.** STC is public on a different host; it does NOT consume the contribuyente's www4 session, so the SII per-RUT session limit (`01.01.204.500.709.27`) does not apply.
- **Captcha bypass:** `POST /cvc_cgi/stc/CViewCaptcha.cgi` with `oper=0` returns JSON `{ txtCaptcha, ... }`. Decode `txtCaptcha` as latin1; the literal 4-digit answer lives at offset `[36, 40)`. The form post echoes both.
- **Submit:** `POST /cvc_cgi/stc/getstc` form-encoded with `RUT`, `DV`, `PRG=STC`, `OPC=NOR`, `txt_code`, `txt_captcha`. Response is HTML in **ISO-8859-1** (decoded via native `TextDecoder("iso-8859-1")` — no `iconv-lite`).
- **Captcha-fail response:** body contains `Por favor reingrese Captcha` (~92-byte JS alert). The adapter retries once with a fresh captcha before giving up on that RUT.
- **Selectors:** body's first `<div>`, then 4th direct child `<div>` for razón social, 6th for RUT-with-DV; `<span>` text-prefix matching for `Fecha de Inicio de Actividades:` etc.; first non-`<table class="tabla">` `<table>` for actividades (rows of 5 `<td>/<font>` cells: giro, código 6 dígitos, categoría Primera/Segunda, afecta IVA Si/No, fecha).
- **Estado inference:** AVISO + `Término de giro` → `no_vigente`; AVISO + `Bloqueado`/`Querella` → `suspendida`; otherwise → `activa`.
- **`tramoVentas` and `domicilio` were inventions** of the previous adapter — they do not exist in the public STC response and have been removed from the partial.
- Per-RUT rate limit: 5 s default.

---

## sofofa

**Verified live** at `https://www.sofofa.cl/empresas-socias/` — 151 socios with sector + sitio web.

- The previous URL `/socios/` is and always was 404 (Wayback confirms no historical version).
- **Selectors:** `div.empresa-grid` (8 sectors) → `div.empresa-item` → `> a > h4` (nombre), `> a[href]` (sitio web).
- No pagination. Server-rendered.
- **RUT not exposed.** `ingest()` yields nothing; raw scraping is exposed via `listSofofaSocios()` for downstream cross-reference.

---

## cnc — NEW

**Verified live** at `https://cnc.cl/socios/{empresas|asociaciones-especializadas|camaras-regionales|camaras-binacionales|corporaciones-y-fundaciones}` — 91 cards across 5 sub-URLs.

- **Per card:** `div.card` with text `<NOMBRE> Fono: <TEL> <URL>`. Parser extracts via 3-pass (URL → phone → razón social) so anchor labels like "visitar" don't break it.
- Most valuable subset: `asociaciones-especializadas` (35) — chambers and gremios sectoriales (ABA, ANIB, ASIPLA, etc.).
- **RUT not exposed.** Same split-pattern as Sofofa: `ingest()` yields nothing; `listCncSocios()` for raw rows.

---

## prochile — REMOVED

ProChile does not publish a unified exporter catalogue. The previous URL `/landing/exportadores` was 404 and Wayback shows no historical structured catalogue.

**Aduanas DUS** (datos.gob.cl `registro-de-exportacion-{year}`) was evaluated as a replacement and rejected: the dataset uses `NRO_EXPORTADOR` synthetic IDs and **does not expose razón social or RUT** by design (privacy-preserving). It is useful as a scoring layer (volume, destination, HS) once you already have nominal exporters from elsewhere — not as a discovery source.

**Future replacement strategy** (out of scope for this PR): a two-layer architecture where discovery comes from sectoral gremios (Wines of Chile, Asoex, ChileVid, ChileNut) and binational chambers (AmCham, CamChino), then enrichment scores via Aduanas DUS by matching on commune + sector + FOB volume.

---

## Production readiness checklist

- [x] `empresas-en-un-dia` — safe to ship
- [x] `cmf` — safe to ship (banks excluded)
- [x] `chilecompra` — safe to ship after first integration test with a real ticket
- [x] `diario-oficial` — safe to ship if a feriado-aware `getEditionForDate` is injected
- [x] `sii-stc` — safe to ship; consider broader AVISO sample collection over time
- [x] `sofofa` / `cnc` — safe to ship as discovery-only sources (no RUT)
- [ ] PDF parsing for `diario-oficial` (Phase 2)
- [ ] Bancos in `cmf` (when a RUT side-channel is available)
- [ ] Exporter discovery replacement for `prochile`
