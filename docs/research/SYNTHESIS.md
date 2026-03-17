# SII Research Synthesis

> Consolidated findings from 7 parallel research streams. March 2026.

## The Big Picture

**SII has two worlds:**
1. **Official APIs** (SOAP + REST) — for DTE emission, status queries, authentication. Well-documented, certificate-based.
2. **Web portal only** (no API) — for RCV (purchase/sales registry), Boletas de Honorarios, tax declarations. Angular SPAs on `www4.sii.cl`. Every company in the market (Fintoc, API Gateway, SimpleAPI, LibreDTE) confirms: **scraping is the only way**.

**Our unique position:** No TypeScript library exists that covers both worlds. LibreDTE (PHP, AGPL), cl-sii (Python, data models only), Sii.RegistroCompraVenta (.NET, RCV only). An MIT-licensed TypeScript SDK covering DTE + portal scraping would be first-of-its-kind.

---

## Key Technical Decisions

### 1. Scraping Approach: HTTP-first, Playwright for discovery

| Layer | Tool | Use for | Serverless? |
|-------|------|---------|-------------|
| Primary | axios + tough-cookie + cheerio | SOAP APIs, REST APIs, CSV downloads, reverse-engineered Angular backends | Yes (~5MB) |
| Discovery | Playwright | Reverse-engineer Angular SPA API contracts, then migrate to HTTP | No (~280MB) |

**Why:** SII has no CAPTCHAs or anti-bot measures. The Angular SPAs (RCV, boletas) make internal REST calls — once we capture those API contracts with Playwright's network interception, we can call them directly with axios. Playwright becomes a dev tool, not a production dependency.

**Critical insight from portal research:** RCV has a **CSV download** feature ("Descargar Detalles") — semicolon-separated, up to 40 fields. This may be the most reliable extraction method, bypassing Angular rendering entirely.

### 2. Authentication: Two separate flows

| Flow | For | Method |
|------|-----|--------|
| SOAP seed/token | DTE APIs (palena/maullin) | .p12 certificate → XML-DSIG → token cookie |
| Web portal login | RCV + Boletas portals | RUT + Clave Tributaria → session cookies |

Both are needed. The SOAP token does NOT work for portal access. Portal scraping requires browser-based or HTTP session login.

### 3. Package Architecture

```
@emisso/sii           # Core — HTTP only (axios, tough-cookie, cheerio, node-forge)
@emisso/sii-browser   # Optional — Playwright integration for discovery/fallback
```

Core stays lightweight and serverless-friendly. Browser package is opt-in for users who need Angular UI scraping.

### 4. Boletas de Honorarios: Separate from RCV

**Decision: Separate functions, potentially unified response type.**

Evidence:
- Different SII portal (`boaborUI` vs `registrocompaborUI`)
- Different data model (withholding % instead of IVA, professional society flag, VIG/ANUL status)
- Different navigation (Emitidas/Recibidas/Terceros sections)
- Fintoc merges them with `is_services_invoice` flag, but the SII sources are completely different

Recommend: `listInvoices()` for RCV, `listBoletasHonorarios()` for boletas. Both return similar envelope but different detail objects.

### 5. Deployment: Supabase + Vercel

The HTTP-only approach (no browser in production) unlocks Supabase + Vercel as the deployment target:

| Layer | Platform | Role |
|-------|----------|------|
| Frontend + Cron | Vercel (Next.js) | Dashboard UI, API routes, scheduled sync jobs |
| SII Integration | Supabase Edge Functions (Deno) | Auth flows, data fetching — all pure HTTP |
| Cache + Storage | Supabase Database (PostgreSQL) | Cached invoices/boletas, encrypted credentials, RLS |
| Dev tooling | Playwright (local only) | One-time Angular API reverse-engineering |

**Why it works:** SII calls are I/O-bound (waiting for responses), not CPU-bound. Edge Functions have 2s CPU limit but 150s idle timeout — HTTP requests to SII spend time waiting, not computing. Fallback: Vercel Serverless Functions (Node.js, 60-300s timeout) if Deno compatibility issues arise.

**Deno compatibility risks to validate in Phase 1:** node-forge (.p12 parsing), cookie management, XML-DSIG signing via Web Crypto API.

---

## Legal & Compliance Summary

| Factor | Status | Action |
|--------|--------|--------|
| Scraping legality | Gray area — no specific law prohibits it | Use credential-delegation with consent |
| SII Terms of Service | Prohibit automated access, but terms are non-contractual | Rate limit, don't disrupt, act on user's behalf |
| SII enforcement | No cases found of action against scrapers | Courts ruled SII can't arbitrarily block portal access |
| Data protection (current) | Ley 19.628 — weak enforcement | Basic consent framework sufficient |
| Data protection (Dec 2026) | Ley 21.719 — GDPR-like, new enforcement agency | **Must prepare now** — privacy by design, consent mgmt, breach notification |
| How others do it | Fintoc, Floid: widget-based credential capture + consent | Follow same model |

**Bottom line:** Use credential-delegation with explicit user consent (Fintoc model). Get a formal legal opinion before production launch. Start Ley 21.719 compliance prep now.

---

## Competitive Landscape

| Capability | API Gateway | Fintoc | LibreDTE | emisso-sii (target) |
|-----------|------------|--------|----------|-------------------|
| DTE Emission | No | No | Yes (PHP) | Yes (TypeScript) |
| RCV Reading | Yes (75+ endpoints) | Yes | Yes | Yes (planned) |
| Boleta Honorarios | Yes | Partial | Partial | Yes (planned) |
| Open Source | No | SDKs only | AGPL | **MIT** |
| TypeScript Native | No | Client only | No | **Yes** |
| Self-hostable | No | No | Yes | **Yes** |
| Serverless-ready | N/A | N/A | No | **Yes** |

**Market validation:** API Gateway has enterprise clients (Gasco, BCI, SumUp) paying $40K-600K CLP/month for SII-to-REST translation. Demand is proven.

---

## Recommended Implementation Order

### Phase 1: Authentication + HTTP Core
- Implement SOAP seed/token flow (.p12 → XML-DSIG → token)
- Implement web portal login (RUT + clave → session cookies)
- Build HTTP session management (tough-cookie, token refresh, retry)
- Test against real SII with provided credentials

### Phase 2: RCV Reading (Registro de Compras y Ventas)
- Start with CSV download approach (most reliable)
- Use Playwright to reverse-engineer Angular backend APIs
- Implement `listInvoices({ issueType, period, documentType })`
- Parse into Fintoc-inspired response schema
- Migrate from Playwright to direct HTTP once API contracts known

### Phase 3: Boletas de Honorarios
- Scrape `boaborUI` portal (emitidas + recibidas)
- Implement `listBoletasHonorarios({ type, period })`
- Define services invoice schema (withholding, status, professional society)

### Phase 4: Distribution & Deployment
- Publish `@emisso/sii` to npm (MIT license)
- Supabase Edge Functions for SII integration layer
- Vercel Next.js template with dashboard and cron sync
- Supabase DB schema for caching, credentials (RLS), audit trail
- Documentation and examples

### Phase 5: Write Operations (Future)
- Emitir boleta de honorarios
- Full DTE emission (already stubbed)

---

## Key References

| Resource | Why it matters |
|----------|---------------|
| [sergioocode/Sii.RegistroCompraVenta](https://github.com/sergioocode/Sii.RegistroCompraVenta) | Only open-source RCV scraper — .NET, HTTP+PFX cert |
| [LibreDTE/libredte-lib-core](https://github.com/LibreDTE/libredte-lib-core) | Gold standard for DTE operations — PHP, AGPL |
| [cl-sii-extraoficial/archivos-oficiales](https://github.com/cl-sii-extraoficial) | Stable SII schema/file references |
| [SII Boleta API Swagger](https://www4c.sii.cl/bolcoreinternetui/api/) | Undocumented REST API — worth exploring |
| [Apify SII Pre IVA Scraper](https://apify.com/joan.sevenscale/sii-chile-pre-iva) | Playwright-based SII portal automation reference |
| [SII Auth Manual](https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf) | Official seed/token authentication documentation |
