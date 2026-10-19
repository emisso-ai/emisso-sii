# @emisso/sii — Roadmap

> Living document for the implementation journey of the SII SDK.
> Updated as phases complete. Each phase links to relevant research and decisions made.
> Full research: `docs/research/SYNTHESIS.md` | Individual reports: `docs/research/*.md`

## Current State

Scaffolded TypeScript SDK with complete type system (Zod schemas), utilities (RUT validation, env config), and module stubs for auth, DTE, folios, recepción, and estado. Nothing is implemented yet — all functions throw "Not implemented".

**Market position:** No TypeScript library exists that covers both DTE emission and portal data reading. LibreDTE (PHP, AGPL), cl-sii (Python, data models only), Sii.RegistroCompraVenta (.NET, RCV only). We would be the first MIT-licensed TypeScript SDK covering both worlds.

---

## Phase 1: Authentication + HTTP Core

**Goal:** Implement both authentication flows and build the HTTP session layer.

> Research completed: `docs/research/sii-official-apis.md`, `docs/research/scraping-frameworks.md`

### Decisions made (from research)

- **Scraping approach:** HTTP-first (axios + tough-cookie + cheerio) for ~80% of interactions. Playwright only for Angular UI reverse-engineering, not production.
- **No CAPTCHAs on SII** — just rate limiting and session cookies. No anti-bot measures.
- **Two auth flows needed:** SOAP seed/token (for DTE APIs) + web portal login (for RCV/Boletas). They are separate systems.
- **Package split:** `@emisso/sii` (HTTP core, ~5MB) + `@emisso/sii-browser` (optional Playwright, ~280MB)

### What to implement

1. **SOAP Authentication** (seed/token exchange)
   - `getSeed()` → call `CrSeed.jws` WSDL, parse XML seed
   - `signSeed()` → XML-DSIG with RSA-SHA1 using .p12 certificate (node-forge)
   - `getToken()` → call `GetTokenFromSeed.jws` with signed seed XML
   - Token goes as `Cookie: TOKEN=<value>` for subsequent SOAP API calls
   - Environments: `maullin.sii.cl` (certification) / `palena.sii.cl` (production)

2. **Web Portal Authentication** (for RCV + Boletas scraping)
   - Login at `homer.sii.cl` with RUT + Clave Tributaria
   - Capture session cookies for `www4.sii.cl` subdomains
   - Handle session expiry and token refresh
   - Can be done via HTTP POST (form submission) — no browser needed for login itself

3. **.p12 Certificate handling**
   - Load PKCS#12 from file or base64-encoded string (for cloud deployment)
   - Extract private key and certificate with node-forge
   - Support Node.js `https.Agent` with PFX for mTLS connections
   - Never write certificates to persistent filesystem

4. **Session management**
   - tough-cookie for cookie persistence across requests
   - Automatic token refresh on "NO ESTA AUTENTICADO" responses
   - Exponential backoff and retry (axios-retry)
   - Rate limiting: 2-5s between requests to avoid IP blocking

5. **Test harness**
   - Test against real SII using provided credentials (via env vars, never committed)
   - Validate both auth flows work end-to-end

### Deliverables

- Working `authenticate()` for SOAP APIs
- Working `portalLogin()` for web portal access
- Session management with automatic refresh
- Integration tests against real SII
- **Deno compatibility validation** — confirm all deps work in Supabase Edge Functions (node-forge, fast-xml-parser, zod, cookie handling). If blockers found, document and plan Vercel Serverless fallback.

---

## Phase 2: List Invoices (Registro de Compras y Ventas)

**Goal:** Read-only access to issued and received invoices from SII's RCV portal.

> Research completed: `docs/research/sii-portal-structure.md`, `docs/research/open-source-sii-projects.md`

### Key findings from research

- RCV portal (`registrocompaborUI`) is an Angular SPA on `www4.sii.cl`
- **CSV download exists** ("Descargar Detalles") — semicolon-separated, up to 40 fields for Ventas, 28 for Compras. This is the most reliable extraction method.
- Compras (purchases/received) and Ventas (sales/issued) are separate tabs
- Period-based navigation (year + month), no text search
- The Angular SPA makes internal AJAX calls — can be reverse-engineered with Playwright, then called directly via HTTP
- Only open-source RCV scraper: `sergioocode/Sii.RegistroCompraVenta` (.NET, HTTP+PFX)

### Extraction strategy (ordered by reliability)

1. **CSV download** — trigger "Descargar Detalles" via HTTP, parse CSV. Most stable, complete data.
2. **Internal API interception** — use Playwright once to capture Angular backend API contracts, then call via HTTP. Fastest at runtime.
3. **DOM scraping** — fallback only. Parse rendered HTML tables.

### API design (Fintoc-inspired)

```typescript
listInvoices({
  issueType: "issued" | "received",
  period: { year: number, month: number },
  documentType?: number,  // SII DTE code (33, 34, 61, etc.)
})
```

Response model:
- Core fields: `id`, `number` (folio), `issuer` (RUT + name), `receiver` (RUT + name), `date`, `totalAmount`, `netAmount`, `currency`, `taxPeriod`
- SII-specific nested under `institutionInvoice`: `documentType`, `invoiceStatus`, `vatAmount`, `exemptAmount`, `confirmationStatus`

### What to implement

- Navigate to RCV portal with authenticated session
- Download CSV for both Compras and Ventas
- Parse CSV into structured invoice objects (Zod schemas)
- Map SII fields to Fintoc-inspired schema (document the mapping)
- Support period-based filtering
- Handle edge cases: no data, session timeout, multi-month fetching
- Integration tests against real SII data

---

## Phase 3: Boletas de Honorarios

**Goal:** Read-only access to service invoices (boletas de honorarios), both issued and received.

> Research completed: `docs/research/sii-portal-structure.md`, `docs/research/chilean-fintech-landscape.md`

### Decision: Separate endpoint

Boletas de honorarios are fundamentally different from RCV invoices:
- **Different portal:** `boaborUI` vs `registrocompaborUI`
- **Different data model:** withholding (15.25% in 2026) instead of IVA, professional society flag, VIG/ANUL status
- **Different sections:** Emitidas, Recibidas, Terceros
- **Different tax treatment:** income tax withholding vs VAT

API: `listBoletasHonorarios()` — separate from `listInvoices()`.

### Data model

| Field | Description |
|-------|-------------|
| numeroBoleta | Invoice folio number |
| fechaEmision | Issue date |
| prestador | Service provider (RUT + name) |
| beneficiario | Client/beneficiary (RUT + name) |
| descripcion | Service description |
| montoBruto | Gross amount |
| retencionPorcentaje | Withholding rate (15.25% for 2026) |
| montoRetencion | Withholding amount |
| montoLiquido | Net amount after withholding |
| estado | Status: VIG (vigente), ANUL (anulada), etc. |

### What to implement

- Navigate to boletas portal with authenticated session
- Scrape emitidas and recibidas sections
- Parse into typed boleta objects (Zod schemas)
- Support period-based filtering (daily, monthly, annual)
- Leverage spreadsheet download if available
- Integration tests

---

## Phase 4: Deployment & Distribution

**Goal:** Deploy emisso-sii on Supabase + Vercel — our standard stack.

> Research completed: `docs/research/deployment-strategies.md`, `docs/research/legal-compliance.md`

### Decision: Supabase + Vercel (HTTP-only, no browser in production)

The HTTP-first approach eliminates the browser dependency entirely in production. SII interactions are I/O-bound (waiting for SII responses), not CPU-bound — making them compatible with serverless constraints.

#### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Vercel (Next.js App Router)                            │
│  ├── Dashboard UI for agencies                          │
│  ├── API Routes → call Supabase Edge Functions          │
│  └── Cron jobs (Vercel Cron) → trigger background sync  │
├─────────────────────────────────────────────────────────┤
│  Supabase Edge Functions (Deno)                         │
│  ├── sii-auth       → SOAP seed/token + portal login    │
│  ├── sii-invoices   → RCV fetch (CSV download or API)   │
│  ├── sii-boletas    → Boletas de honorarios fetch        │
│  └── sii-status     → DTE status queries                │
├─────────────────────────────────────────────────────────┤
│  Supabase Database (PostgreSQL + RLS)                   │
│  ├── Cached invoices/boletas (with last_scraped_at)     │
│  ├── Encrypted credentials (per-tenant, RLS-isolated)   │
│  ├── Sync job queue and status                          │
│  └── Audit trail for data access                        │
├─────────────────────────────────────────────────────────┤
│  Playwright (LOCAL DEV ONLY)                            │
│  └── One-time reverse-engineering of Angular API URLs   │
└─────────────────────────────────────────────────────────┘
```

#### Why this works

| Concern | Resolution |
|---------|-----------|
| Edge Functions 2s CPU limit | SII calls are I/O-bound (network wait). CPU time for XML/CSV parsing is ~50-200ms. The 150s idle timeout covers SII's slow responses. |
| Edge Functions no filesystem | .p12 certs stored as base64 in Supabase Vault/secrets, decoded in memory. No disk needed. |
| Edge Functions Deno runtime | `fetch` API handles cookies natively. XML parsing via `fast-xml-parser` (Deno-compatible). Crypto via Web Crypto API or `node-forge` with npm: specifier. |
| Vercel 250MB size limit | Not an issue — no Chromium. HTTP-only bundle is ~5MB. |
| SII slow responses (5-30s) | Edge Functions idle timeout is 150s. Vercel Functions timeout is 60-300s. Both sufficient. |

#### Deno compatibility checklist (validate in Phase 1)

- [ ] `fetch` with cookie persistence across redirects (may need manual cookie jar)
- [ ] `node-forge` via `npm:node-forge` specifier for .p12 parsing and XML-DSIG
- [ ] `fast-xml-parser` via `npm:fast-xml-parser` for SOAP XML
- [ ] `zod` via `npm:zod` for response validation
- [ ] Web Crypto API for RSA-SHA1 signing (or fall back to node-forge)

**Fallback:** If Edge Functions hit limits (CPU, Deno compat), move SII-specific routes to Vercel Serverless Functions (Node.js runtime, 60-300s timeout, full npm ecosystem). Both options stay within Supabase + Vercel.

#### Caching strategy (Supabase DB)

| Data Type | Cache TTL | Refresh trigger |
|-----------|-----------|----------------|
| RCV invoices | 24 hours | Vercel Cron (daily) or on-demand |
| Boletas de honorarios | 1-4 hours | Vercel Cron or on-demand |
| DTE status | 15-60 minutes | On-demand |
| Company tax info | 7 days | On-demand |

Pattern: Return cached data immediately + trigger background refresh if stale. Agencies see fast responses; SII is hit asynchronously.

### Distribution model

1. **`@emisso/sii` on npm** — MIT-licensed core package. The HTTP library that any Node.js/Deno project can use directly.

2. **Supabase + Vercel template** — A deployable template repo that agencies clone into their own Supabase project + Vercel workspace. Includes Edge Functions, DB migrations, and Next.js dashboard. Agencies own their infra and data.

3. **Emisso-hosted (future)** — For agencies that don't want to manage infra. We run the Supabase + Vercel stack; they call our API. Requires solving credential trust (Fintoc-style widget).

### Credential security

- .p12 certificates stored as base64 in Supabase Vault (encrypted at rest)
- Decoded at runtime in Edge Function memory, never persisted to disk
- Per-tenant isolation via RLS — each agency can only access their own credentials
- RUT + Clave Tributaria stored encrypted in Supabase DB, decrypted only during SII sessions
- Audit trail: every SII access logged with timestamp, tenant, and operation

### Legal compliance checklist

- [ ] User consent model (credential-delegation, like Fintoc)
- [ ] Rate limiting (2-5s between SII requests, enforced in Edge Functions)
- [ ] Descriptive User-Agent header (`emisso-sii/1.0`)
- [ ] Prepare for Ley 21.719 (effective Dec 2026) — privacy by design, consent management, breach notification
- [ ] Formal legal opinion before production launch
- [ ] Consider SII provider registration for credibility

---

## Phase 5: Write Operations (Future)

**Goal:** Enable issuing documents through SII, starting with boletas de honorarios.

> Not in scope yet. Captured here for context.

### Key insight from research

- **Emitir Boleta de Honorarios** — portal-only, requires scraping the emission form
- **DTE emission** (facturas, notas de crédito) — has official SOAP APIs. The existing auth module handles this.
- **Boleta Electrónica** (tipo 39, 41) — has a modern REST API at `pangal.sii.cl`/`rahue.sii.cl` with Swagger docs at `www4c.sii.cl`

Priority: Boleta de honorarios emission first (high demand, no API). DTE emission second (official APIs, already stubbed).

---

## Decision Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-03-12 | Created roadmap | Phases 1-4 focus on read operations; write ops deferred to Phase 5 |
| 2026-03-12 | HTTP-first scraping | Research confirmed SII has no CAPTCHAs. Playwright only for API discovery, not production. See `docs/research/scraping-frameworks.md` |
| 2026-03-12 | Separate boletas endpoint | Different SII portal, different data model, different tax treatment. See `docs/research/sii-portal-structure.md` |
| 2026-03-12 | Supabase + Vercel deployment | HTTP-only approach makes Edge Functions viable (I/O-bound, not CPU-bound). No browser in production. Deno compat to validate in Phase 1. Fallback: Vercel Serverless Functions (Node.js). |
| 2026-03-12 | User consent model for legal | Following Fintoc/Floid pattern. Credential-delegation with explicit consent. Must prepare for Ley 21.719 (Dec 2026). See `docs/research/legal-compliance.md` |
| 2026-03-12 | CSV download for RCV | Most reliable extraction method. Angular SPA internals can change; CSV format is stable. See `docs/research/sii-portal-structure.md` |

---

## Research Index

| Document | Contents |
|----------|----------|
| `docs/research/SYNTHESIS.md` | Consolidated findings and strategic decisions |
| `docs/research/sii-official-apis.md` | All SOAP/REST endpoints, WSDLs, auth flow details |
| `docs/research/open-source-sii-projects.md` | 30+ projects analyzed across 6 languages |
| `docs/research/scraping-frameworks.md` | Playwright vs Puppeteer vs HTTP comparison |
| `docs/research/sii-portal-structure.md` | RCV + Boletas page structures, fields, navigation |
| `docs/research/chilean-fintech-landscape.md` | Fintoc, API Gateway, LibreDTE, and competitors |
| `docs/research/legal-compliance.md` | Chilean law, SII ToS, Ley 21.719, risk assessment |
| `docs/research/deployment-strategies.md` | Serverless, VPS, and BaaS options with pricing |

---

## References

- [Fintoc Fiscal Links](https://docs.fintoc.com/docs/fiscal-links) — API design reference
- [Fintoc Invoice Object](https://docs.fintoc.com/reference/invoices-object) — Data model reference
- [SII Auth Manual (PDF)](https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf)
- [SII Boleta API Swagger](https://www4c.sii.cl/bolcoreinternetui/api/)
- [sergioocode/Sii.RegistroCompraVenta](https://github.com/sergioocode/Sii.RegistroCompraVenta) — .NET RCV scraper
- [LibreDTE/libredte-lib-core](https://github.com/LibreDTE/libredte-lib-core) — PHP DTE reference
- [cl-sii-extraoficial](https://github.com/cl-sii-extraoficial) — Stable SII schema references
