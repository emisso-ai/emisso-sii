# Chilean Fintech Landscape: SII Integration Approaches

Research into how Chilean fintechs and software companies integrate with the Servicio de Impuestos Internos (SII).

---

## 1. Fintoc — Fiscal Links

**What they do:** Y Combinator-backed startup ($7M Series A, 2024) offering account-to-account payments and fiscal data access in Chile and Mexico. Their "Fiscal Links" product connects to SII to retrieve electronic invoices and tax documents.

### Architecture

- **Widget-based credential capture:** Users enter SII credentials through Fintoc's JavaScript widget (`js.fintoc.com/v1/`). The widget is configured with `product: "invoices"`, `holderType: "individual" | "business"`, a public key, and a webhook URL.
- **Link Token model:** After successful authentication, Fintoc generates a Link Token representing the credential pair. Critically, **Fintoc does not store the Link Token** — it is sent once via webhook and must be stored by the integrator. This is the same pattern they use for bank links.
- **Likely scraping underneath:** Fintoc does not expose how they fetch SII data internally. Given that SII has no comprehensive REST API for invoice data, and Fintoc's documentation mentions "connecting to SII servers" and needing credentials with "all permissions to review balance, movements, historical statements," the implementation almost certainly uses **server-side browser automation or HTTP session scraping** against SII's web portal, similar to how Plaid/Belvo work for banking.
- **Refresh/sync strategy:** Not publicly documented. Given the credential model, they likely establish sessions on-demand or periodically using stored credentials (via Link Token) to pull updated invoice data.

### SDK Ecosystem

All open source (BSD-3/MIT licensed) on GitHub (`github.com/fintoc-com`):

| SDK | Language | Stars | Notes |
|-----|----------|-------|-------|
| fintoc-python | Python 3.6+ | 77 | Written by @nebil, original SDK |
| fintoc-node | TypeScript | 38 | Port of Python SDK by @daleal |
| fintoc-ruby | Ruby | 25 | Official |
| fintoc-react-native | TypeScript | 6 | Mobile widget integration |
| fintoc-js | TypeScript | 4 | ES module widget wrapper |
| fintoc-cli | Go | - | CLI tool |

Design philosophy: "Stick to the API design as much as possible, so that it feels ridiculously natural to use even while only reading the raw API documentation."

### Data Returned (Fiscal Links)

The invoice API returns comprehensive JSON including:
- Invoice numbers, dates, amounts
- Tax information (VAT, withholdings, commissions, tobacco taxes)
- Issuer and receiver details
- Invoice status and transaction categories
- Access to buy and sell registers (Registro de Compras y Ventas)

### Pricing

Not publicly listed. Contact-based sales. Recognized as one of CB Insights' 100 most promising fintechs (2024).

### Key Takeaway

Fintoc treats SII credentials the same way Plaid treats bank credentials: capture via widget, tokenize, scrape on the backend. They abstract the SII complexity behind a clean REST API. Their "we don't store the Link Token" claim is a security positioning choice — someone must store credentials to refresh data.

---

## 2. API Gateway (apigateway.cl) — SII Query Middleware

**What they do:** Pure SII-to-REST API translation layer. Tagline: "Worry about processing data, not extracting it."

### Architecture

- **REST API facade** over SII's various web interfaces
- **75+ API endpoints** organized by SII module:
  - 11 APIs for MIPYME software portal
  - 28 APIs for DTE (electronic tax documents)
  - 6 APIs for RCV (Registro de Compras y Ventas / purchase-sales registry)
  - 4 APIs for RTC (Registro de Transferencia de Creditos)
  - 17 APIs for BHE/BTE (honorarium vouchers)
  - 9 APIs for miscellaneous SII services
- Automates "tasks normally requiring manual intervention in the SII portal"
- They likely maintain persistent sessions with SII using client certificates and HTTP automation

### Pricing (CLP, monthly + VAT)

| Plan | Daily Queries | Price |
|------|--------------|-------|
| PYME | 500 | $40,000 |
| Business | 2,000 | $150,000 |
| Premier | 10,000 | $600,000 |
| Additional | per 10,000 | +$300,000 |

### Notable Clients

Gasco, Virgin Mobile, BCI, SumUp.

### Key Takeaway

This is the closest model to what emisso-sii could become: a REST API that wraps SII's various portals. They have 75+ endpoints covering nearly all SII operations. Their existence proves market demand for "SII as a REST API."

---

## 3. Floid (floid.io) — SII Data Verification API

**What they do:** API for automated tax status validation from SII. Targets fintech onboarding, KYC, and risk assessment.

### Architecture

- **Widget or API-based** credential capture (similar to Fintoc model)
- Flow: User enters RUT + SII credentials -> User authorizes -> Real-time SII connection -> Structured JSON/XML response
- Requires **explicit user consent** before accessing tax records
- ISO 27001 certified

### Data Provided

- Taxpayer registration status (natural persons and entities)
- Electronic tax documents (invoices, receipts, honorarium vouchers, credit notes, dispatch guides)
- Purchase and sales registry
- Activity start date, SII status, primary economic activity

### Use Cases

- **Onboarding:** Verify SII registration status
- **Risk evaluation:** Assess tax situation and economic activity
- **KYC/fraud prevention:** Confirm active registration
- **Process automation:** Validate supplier/employee tax status

### Key Takeaway

Floid focuses on the read/query side of SII (not DTE emission). Their consent-based model is worth noting for compliance. They package SII data for fintech risk assessment rather than invoicing.

---

## 4. SimpleAPI / ChileSystems (simpleapi.cl)

**What they do:** DTE emission API — lets developers issue electronic invoices directly with SII without intermediaries.

### Architecture

- **REST API** with HTTP protocol support (web, desktop, mobile)
- **.NET SDK** (C# with .NET Standard 2.0) via NuGet
- Deployable on Linux or Windows (IIS, Nginx, Apache)
- DTE flow: XML generation -> Digital signature (timbraje y firmado) -> PDF417 barcode -> SII submission (within 12-hour window)

### Pricing

- **Free tier:** Up to 500 monthly API calls
- **Paid plans:** Up to 150,000 monthly queries (annual subscription)
- **Source code purchase:** One-time fee, unlimited usage, self-hosted

### Key Takeaway

Self-hostable DTE emission. The "source code purchase" option is unusual — they sell you the code to run yourself. Their .NET focus limits adoption vs. REST-only approaches.

---

## 5. Haulmer / OpenFactura (haulmer.com, openfactura.cl)

**What they do:** Chile's leading DTE provider. OpenFactura is their developer-facing product.

### Architecture

- **RESTful API** with JSON request/response
- Supports 8 document types: Electronic Invoice, Non-Taxable Invoice, Debit Note, Credit Note, Electronic Receipt, Tax-Exempt Receipt, Invoice-Settlement, Dispatch Guide
- **Instant validation** — Haulmer validates documents immediately (vs. SII's 30-minute delay)
- Integrations: Shopify, WooCommerce, Prestashop, WHMCS, Google Sheets
- WooCommerce plugin open-sourced on GitHub

### Key Takeaway

OpenFactura dominates the "plug and play" DTE market. Their instant validation (before SII confirms) adds value. Heavy focus on e-commerce integrations.

---

## 6. Bsale (bsale.cl) — Sales Management + DTE

**What they do:** Full sales management system with integrated SII-certified electronic invoicing.

### Architecture

- **API with security token** — token provided upon service contract, configured per-branch
- SII-certified as a "market-based electronic invoicing system"
- Issues all DTE types: receipts, invoices, credit notes, debit notes
- Designed as middleware: ERP/POS systems connect to Bsale API, Bsale handles SII submission
- Integration partners: Fudo (restaurant POS), Chipax (accounting)

### Key Takeaway

Bsale is a vertically integrated solution (POS + invoicing + SII). Not an API-first product like API Gateway, but widely used by Chilean SMEs. Shows the "bundled" approach to SII integration.

---

## 7. Nubox (nubox.com) — Accounting Software + SII

**What they do:** Cloud accounting, invoicing, and payroll software for Chilean SMEs and accountants.

### Architecture

- **Tight SII integration** — approved by SII for DTE issuance
- Automatic sync between invoicing (Fa module) and accounting (Co module)
- Multi-company support with SII data lookup (customer info in 3 clicks)
- Continuously updated per SII resolutions and regulations
- No public REST API — meant as end-user software, not developer platform

### Key Takeaway

Nubox represents the "traditional accounting software" approach. Not relevant as a technical architecture model, but shows the competitive landscape for SME tax compliance.

---

## 8. LibreDTE (libredte.cl) — Open Source DTE

**What they do:** The only free/open-source Chilean electronic invoicing framework. AGPL licensed.

### Architecture

- **Core library:** PHP (`libredte-lib-core`) handles all SII interaction
- **Key modules:**
  - `FirmaElectronica` — Digital certificate (.p12) loading, XML signing
  - `Sii/` — SOAP/WSDL communication with SII web services
  - `RegistroCompraVenta` — Purchase and sales registry queries
  - XML generation and manipulation for DTE documents
  - Document transfer and certification workflows
- **API layer:** REST API wrapping the core library
- **API clients:** Python (`libredte-api-client-python` on PyPI), PHP, Java, VB.NET
- **Hosting options:** SaaS (libredte.cl) or self-hosted (Community Edition)
- **Authentication:** User hash-based API auth, environment variable configuration

### Certificate Handling

- Loads `.p12` (PKCS#12) digital certificates
- Used for XML digital signatures on DTEs
- Used for SOAP authentication with SII web services
- Certificate-based authentication to SII (not username/password for DTE operations)

### Key Takeaway

LibreDTE is the most architecturally relevant reference for emisso-sii. It proves that a PHP library can handle the full DTE lifecycle (XML generation, signing, SII submission, registry queries). The AGPL license means any modifications must be open-sourced. Their Python API client pattern is directly relevant to our TypeScript approach.

---

## 9. Other Notable Projects

### cl-sii (Python, by Cordada)

- GitHub: `cordada/lib-cl-sii-python`
- PyPI: `cl-sii`
- Supports Python 3.9-3.13
- Focuses on SII data types and models (RUT, DTE types, etc.)
- 8 contributors, healthy release cadence
- Documentation at lib-cl-sii-python.readthedocs.io
- More of a data model library than a full SII integration

### Sii.DescargaFolio (.NET, by sergioocode)

- .NET solution for downloading CAF (folio assignment) files from SII
- Uses PFX certificate stored in Azure Blob Storage
- Authenticated HTTP calls via HttpClient
- Shows the pattern: cloud-stored certificate + programmatic SII access

### SII Chile Pre IVA Scraper (Apify)

- Apify actor for scraping Pre IVA data from SII portal
- Logs in with tax credentials
- Browser automation to extract totals
- Returns JSON/CSV
- Confirms: SII portal scraping is a common pattern in the ecosystem

---

## 10. Credential and Certificate Security Patterns

Across the landscape, three distinct authentication patterns emerge:

### Pattern A: User Credentials via Widget (Fintoc, Floid)
- User enters SII username/password in a secure widget
- Tokenized into a "Link Token"
- Backend uses credentials to scrape/query SII on behalf of user
- Token stored by integrator, not by the platform (claimed)
- **Risk:** Credential storage responsibility shifted to integrator

### Pattern B: Digital Certificate (LibreDTE, emisso-sii, SimpleAPI)
- .p12/.pfx certificate loaded server-side
- Used for XML signing and SOAP authentication
- Certificate represents the company, not individual user
- **Risk:** Certificate must be securely stored (HSM, vault, encrypted at rest)

### Pattern C: API Token via Provider (Bsale, Haulmer/OpenFactura)
- User contracts with DTE provider
- Provider holds SII relationship and certificates
- User gets an API token from the provider
- Provider handles all SII communication
- **Risk:** Dependency on provider; less control

---

## 11. Architectural Lessons for emisso-sii

### What the market validates

1. **REST API over SII is in demand** — API Gateway has 75+ endpoints and enterprise clients (Gasco, BCI)
2. **Widget-based credential capture works** — Fintoc and Floid prove the UX pattern
3. **Scraping is the accepted approach** for reading data from SII portals (RCV, boletas, invoice status)
4. **Certificate management is the core trust problem** — every provider handles it differently
5. **Free tier + paid scaling** is the standard pricing model (SimpleAPI: 500 free calls/month)

### What emisso-sii can differentiate on

1. **TypeScript-native:** No existing TypeScript SII library exists at this level. LibreDTE is PHP, cl-sii is Python, SimpleAPI is .NET.
2. **Modern stack:** Node.js/Deno runtime vs. PHP/Python — better fit for serverless (Vercel, Supabase Edge Functions)
3. **Open source with clear license:** MIT vs LibreDTE's AGPL (which scares enterprise users)
4. **Dual mode:** Both DTE emission (like LibreDTE/SimpleAPI) AND data reading (like Fintoc/API Gateway) in one library
5. **Effect TS patterns:** Typed errors and composable services — more robust than try/catch patterns in existing libraries

### Competitive positioning

| Capability | API Gateway | Fintoc | LibreDTE | SimpleAPI | emisso-sii (target) |
|-----------|------------|--------|----------|-----------|-------------------|
| DTE Emission | No | No | Yes | Yes | Yes |
| RCV Reading | Yes | Yes | Yes | No | Yes (planned) |
| Boleta Reading | Yes | No | Partial | No | Yes (planned) |
| TypeScript SDK | No | Yes (node) | No | No | Native |
| Open Source | No | SDKs only | Yes (AGPL) | No | Yes (MIT) |
| Self-hostable | No | No | Yes | Yes | Yes |
| Certificate Mgmt | N/A | N/A | Basic | Basic | Modern (vault-ready) |

---

## Sources

- Fintoc Docs: https://docs.fintoc.com/docs/fiscal-links
- Fintoc Widget Guide: https://docs.fintoc.com/docs/guides-fiscal-link-with-widget
- Fintoc GitHub: https://github.com/fintoc-com
- Fintoc TechCrunch: https://techcrunch.com/2024/04/25/fintoc-a2a-payments-chile-mexico/
- API Gateway: https://www.apigateway.cl/
- Floid SII API: https://www.floid.io/servicios/api-sii
- SimpleAPI: https://www.simpleapi.cl/
- Haulmer/OpenFactura: https://www.haulmer.com/factura-electronica/api
- OpenFactura API Docs: https://docsapi-openfactura.haulmer.com/
- Bsale: https://www.bsale.cl/sheet/api-factura-electronica
- Nubox SII Integration: https://help.nubox.com/es/articles/8201944-integracion-de-contabilidad-con-el-sii
- LibreDTE: https://www.libredte.cl/
- LibreDTE Core: https://github.com/LibreDTE/libredte-lib-core
- LibreDTE API Clients: https://developers.libredte.cl/
- cl-sii Python: https://github.com/cordada/lib-cl-sii-python
- SII GitHub Topic: https://github.com/topics/sii
- Apify SII Scraper: https://apify.com/joan.sevenscale/sii-chile-pre-iva/api/python
