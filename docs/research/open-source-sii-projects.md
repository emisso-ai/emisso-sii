# Open-Source SII Libraries and Scrapers

Research conducted: March 2026

This document catalogs every significant open-source project that interacts with Chile's Servicio de Impuestos Internos (SII), covering DTE issuance, data scraping, tax status queries, and related tooling.

---

## Table of Contents

1. [PHP Libraries](#php-libraries)
2. [Python Libraries](#python-libraries)
3. [Node.js / TypeScript Libraries](#nodejs--typescript-libraries)
4. [Ruby Libraries](#ruby-libraries)
5. [.NET Libraries](#net-libraries)
6. [Java Libraries](#java-libraries)
7. [Odoo / ERP Modules](#odoo--erp-modules)
8. [SII Scrapers (Dedicated)](#sii-scrapers-dedicated)
9. [Commercial SII APIs (Closed Source, for Reference)](#commercial-sii-apis)
10. [Chilean Fintech Open-Source Components](#chilean-fintech-open-source)
11. [Community Resources](#community-resources)
12. [Summary Matrix](#summary-matrix)
13. [Recommendations for emisso-sii](#recommendations)

---

## PHP Libraries

### LibreDTE (libredte-lib-core)

- **Repo:** https://github.com/LibreDTE/libredte-lib-core
- **Organization:** https://github.com/LibreDTE
- **Website:** https://www.libredte.cl/
- **Language:** PHP 8.4+
- **License:** AGPL-3.0 (no commercial license available)
- **Maintainer:** SASCO SpA
- **Status:** Actively maintained, CI runs on master

**What it does:**
- SII authentication token generation
- DTE XML generation, signing, and validation
- EnvioDTE XML creation (batch sending)
- Sending XML to SII (upload)
- Querying DTE status from SII
- Querying submission status
- Libro de Compras/Ventas generation
- Folio (CAF) management
- PDF417 barcode generation for printed DTEs
- CSV batch processing

**Approach:** Direct HTTP requests to SII SOAP/REST endpoints. Uses x509 digital certificates for authentication. No headless browser.

**Ecosystem:**
- `libredte-sdk-php` - PHP client for LibreDTE's own SaaS API
- `libredte-sdk-python` - Python client for LibreDTE SaaS
- `apigateway-client-php` - PHP client for apigateway.cl
- `libredte-lib` (legacy) - Original library, now superseded by libredte-lib-core

**Rating: 9/10** - The most mature and comprehensive SII library in any language. Battle-tested in production by many Chilean companies. AGPL license is restrictive for proprietary use.

---

### FacTronica

- **Org:** https://github.com/FacTronica
- **Language:** PHP
- **License:** Varies (some repos are documentation for their commercial API)
- **Status:** Moderately maintained

**Repositories:**
- `BoletaHonorariosEmitir` - Integration for issuing boletas de honorarios
- `EmitirBoletaElectronica` - Electronic receipt (boleta) issuance via their API
- `ConsultarEstadoEnvio` - Query DTE submission status at SII
- `SII_SSL` - SSL 1.2 connection to SII
- `ConsumoFoliosBoletasElectronicas` - Folio consumption reports for electronic boletas
- `FacturaElectronicaAfecta` - Electronic invoice issuance

**Approach:** HTTP requests via cURL with digital certificate auth. JSON data exchange for their API, XML for SII direct interaction.

**Caveat:** The open-source code is primarily integration examples. The actual API (BoletaHonorariosEmitir) is commercial: one-time 20 UF (~$740K CLP) or monthly 1 UF (~$37K CLP).

**Rating: 5/10** - Useful reference code but not a standalone library. Commercial product with open examples.

---

### rodrigore/sii_chile (PHP port)

- **Repo:** https://github.com/rodrigore/sii_chile
- **Language:** PHP (Composer package)
- **License:** Not specified
- **Status:** Low maintenance

**What it does:** Port of the Ruby `sii_chile` gem. Queries SII public data (razon social, economic activities) for a given RUT using HTTP scraping via Guzzle + Symfony DomCrawler.

**Approach:** HTTP scraping of SII captcha service endpoint (`zeus.sii.cl`). No certificate auth needed (public data only).

**Rating: 3/10** - Very limited scope. Only reads public taxpayer info.

---

### caherrera/laravel-sii-chile

- **Repo:** https://github.com/caherrera/laravel-sii-chile
- **Language:** PHP (Laravel Service Provider)
- **Status:** Low maintenance

**What it does:** Laravel wrapper for SII integration. Limited documentation.

**Rating: 2/10** - Incomplete, poorly documented.

---

### HSD-CL/dte-cl

- **Repo:** https://github.com/HSD-CL/dte-cl
- **Language:** PHP (Laravel package)
- **Packagist:** hsd-cl/dte-cl
- **Status:** Low maintenance

**What it does:** Laravel package wrapping LibreDTE for DTE issuance in Chile. Provides a Laravel-friendly interface to LibreDTE's core functionality.

**Rating: 4/10** - Thin wrapper over LibreDTE. Useful only if you're already on Laravel.

---

## Python Libraries

### cordada/lib-cl-sii-python

- **Repo:** https://github.com/cordada/lib-cl-sii-python
- **PyPI:** `cl-sii`
- **Docs:** https://lib-cl-sii-python.readthedocs.io
- **Language:** Python 3.9+
- **License:** MIT
- **Status:** Actively maintained

**What it does:**
- Data models for Chilean tax entities (RUT, DTE types, etc.)
- DTE XML parsing and validation
- Crypto operations for DTE signing
- Data type definitions for SII document types (includes DTE 43 Liquidacion-Factura)

**Approach:** Library focused on data modeling and XML processing. Does NOT directly call SII APIs or scrape. Provides the building blocks for other tools to interact with SII.

**Rating: 7/10** - Well-structured, MIT-licensed, good Python typing. But does not handle SII communication directly -- it's a data layer, not an integration layer.

---

### voipir/python-sii

- **Repo:** https://github.com/voipir/python-sii
- **Language:** Python
- **License:** LGPL-3.0
- **Status:** Low maintenance (older project)

**What it does:**
- LibroVentas (sales book) creation
- SII server authentication with x509 certificates (automatic session negotiation)
- Document signing
- Upload of sales documents
- Upload of accounting reports
- TeX template generation for DTE PDFs
- PDF generation and printing

**Approach:** Direct HTTP requests to SII with certificate-based authentication. No headless browser.

**Rating: 5/10** - Decent feature set but LGPL license, low maintenance, poor documentation. Recommends looking at `python-sii-utils` for usage examples.

---

### bluemindsspa/facturacion_electronica

- **Repo:** https://github.com/bluemindsspa/facturacion_electronica
- **Language:** Python
- **License:** Not specified
- **Status:** Moderately maintained

**What it does:**
- XML exchange/reception (envio, recepcion, validacion comercial)
- Libro de Compras y Ventas generation and SII submission
- Folio consumption reporting
- Electronic receipt (boleta 39, 41) support (partial)
- Credit note for boletas
- SII certification support

**Approach:** Direct HTTP/SOAP to SII. Extracted from dansanti/l10n_cl_fe Odoo module to be framework-independent.

**Rating: 6/10** - Good coverage of DTE operations. Extracted from Odoo ecosystem, so API design reflects that heritage.

---

### pdelteil/sii_situacion_tributaria

- **Repo:** https://github.com/pdelteil/sii_situacion_tributaria
- **Language:** Python
- **Status:** Minimal, script-level

**What it does:** Script to query the tax status (situacion tributaria) of third parties from SII.

**Approach:** HTTP scraping. Translation from Ruby (sagmor/sii_chile).

**Rating: 2/10** - Single-purpose script. Useful as reference only.

---

### kripper/superfactura-api-python

- **Repo:** https://github.com/kripper/superfactura-api-python
- **Language:** Python
- **Status:** Low maintenance

**What it does:** API client for SuperFactura's commercial electronic invoicing service.

**Approach:** REST API client (not direct SII interaction). Calls SuperFactura's servers.

**Rating: 2/10** - Just a client for a commercial API, not SII-direct.

---

### EstebanFuentealba's Gists

- **Auth Gist:** https://gist.github.com/EstebanFuentealba/d8f2e60b2b2f1bac13ba
- **DTE Cert Gist:** https://gist.github.com/EstebanFuentealba/e9fd215b557c06c2cd0b
- **Language:** Python

**What it does:** Demonstrates SII authentication with digital certificates in Python, and DTE certification test set processing.

**Rating: 3/10** - Valuable reference for understanding the auth flow. Not a library.

---

## Node.js / TypeScript Libraries

### gepd/HTTP-DTE

- **Repo:** https://github.com/gepd/HTTP-DTE
- **Language:** Docker container (Slim framework internally), Node.js optional app
- **License:** MIT
- **Status:** Moderately maintained

**What it does:**
- HTTP API for generating and sending DTEs to SII
- Endpoints for signatures, folios, document types, sender/receiver management
- Docker-based deployment with docker-compose

**Approach:** Containerized HTTP API. Can be used from any language. Internally wraps SII interaction.

**Rating: 5/10** - Interesting architecture (language-agnostic via HTTP). MIT licensed. But it's a full service, not an embeddable library. Good for microservices architecture.

---

### situacion-tributaria-sii (npm)

- **Package:** https://www.npmjs.com/package/situacion-tributaria-sii
- **Language:** JavaScript/TypeScript
- **Version:** 1.0.1 (published ~6 months ago as of March 2026)
- **Status:** New, minimal

**What it does:** Queries tax status (situacion tributaria) of a taxpayer from SII. Returns structured data: RUT, razon social, activity start date, economic activities, authorized document formats.

**Approach:** HTTP scraping of SII public pages. No certificate auth needed.

**Rating: 3/10** - Very limited scope (public data query only). But relevant as one of the few npm packages for SII.

---

### @gonzitaji/scraper-base-sii (npm)

- **Package:** https://www.npmjs.com/package/@gonzitaji/scraper-base-sii
- **Language:** JavaScript
- **Version:** 1.0.5 (last published ~3 years ago)
- **Status:** Abandoned

**What it does:** Base scraper for SII. Limited documentation available.

**Approach:** HTTP scraping.

**Rating: 1/10** - Abandoned, poorly documented. Not usable.

---

### emisso-sii (our own)

- **Repo:** `emisso-ai/emisso-sii`
- **Language:** TypeScript
- **License:** Open source
- **Status:** Active development

**What it does:** Handles DTE (electronic invoicing), certificate authentication, folio management, document status queries. Uses tsup (CJS+ESM), vitest, zod, axios, fast-xml-parser, node-forge.

**Note:** This is our own library -- included here for completeness in the landscape analysis.

---

## Ruby Libraries

### sagmor/sii_chile

- **Repo:** https://github.com/sagmor/sii_chile
- **Language:** Ruby (gem)
- **Hosted:** Also available as a Heroku app at `siichile.herokuapp.com`
- **Status:** Low maintenance

**What it does:** Queries SII public data (razon social, economic activities) for a given RUT. Available as a gem or a hosted web API.

**Approach:** HTTP scraping of SII public captcha endpoint. No certificate auth.

**Rating: 3/10** - Limited scope (public data only). Has a nice hosted API aspect.

---

## .NET Libraries

### sergioocode/Sii.RegistroCompraVenta

- **Repo:** https://github.com/sergioocode/Sii.RegistroCompraVenta
- **Language:** C# / .NET
- **Status:** Active (references 2025 data)

**What it does:**
- Queries Registro de Compras y Ventas (RCV) from SII
- Returns DTE summaries grouped by state: REGISTRO, RECLAMADO, PENDIENTE
- Exposes REST API endpoint for queries
- Supports certificate storage in Azure Blob Storage or local Azurite emulator

**Approach:** HTTP scraping with PFX digital certificate authentication via HttpClient. No headless browser. Certificate-based auth to access authenticated SII pages.

**Rating: 7/10** - One of the few projects that actually scrapes authenticated SII data (RCV). Good architecture with Azure integration. Directly relevant to our RCV scraping needs.

---

### sergioocode/Sii.ValidarXmlDte

- **Repo:** https://github.com/sergioocode/Sii.ValidarXmlDte
- **Language:** C# / .NET
- **Status:** Active

**What it does:** Validates DTE XML documents against SII requirements.

**Rating: 4/10** - Narrow scope but useful reference for XML validation logic.

---

## Java Libraries

### LibreDTE Java Client

- **Via:** LibreDTE organization
- **Language:** Java
- **Status:** Part of LibreDTE ecosystem

**What it does:** Client for integrating with LibreDTE's web services from Java. Not a direct SII integration -- calls LibreDTE's SaaS API.

**Rating: 2/10** - Just an API client for LibreDTE SaaS, not direct SII.

---

## Odoo / ERP Modules

### dansanti/l10n_cl_dte

- **Repo:** https://github.com/dansanti/l10n_cl_dte
- **GitLab:** https://gitlab.com/dansanti/l10n_cl_dte
- **Language:** Python (Odoo module)
- **Maintainer:** Daniel Santibanez Polanco, BMyA SA
- **Status:** Mature

**What it does:**
- Full Chilean electronic invoicing for Odoo (direct SII integration)
- CAF (folio) management
- DTE XML generation and signing
- SII submission
- Electronic factoring (cesion de creditos)
- Export invoicing (DTE 110, 111, 112)
- POS electronic invoicing

**Related modules:**
- `l10n_cl_fe` (newer version)
- `l10n_cl_dte_factoring` (electronic factoring)
- `l10n_cl_dte_exportacion` (export invoices)

**Approach:** Direct SII SOAP/HTTP integration with digital certificates. Embedded in Odoo's ORM.

**Rating: 7/10** - Very complete for Odoo users. Tightly coupled to Odoo framework, so not reusable outside it. Important reference for the full scope of SII DTE operations.

---

### odoo-chile/l10n_cl_invoice

- **Repo:** https://github.com/odoo-chile/l10n_cl_invoice
- **Language:** Python (Odoo module)
- **Status:** Older

**What it does:** Chilean invoice localization for Odoo. Predecessor to dansanti's modules.

**Rating: 3/10** - Older, less complete than dansanti's version.

---

### diegod8x/dte

- **Repo:** https://github.com/diegod8x/dte
- **Language:** PHP (CakePHP 3.x)
- **Status:** Low maintenance

**What it does:** Electronic invoicing certification module for CakePHP.

**Rating: 2/10** - Framework-specific, low maintenance, limited scope.

---

## SII Scrapers (Dedicated)

### Apify SII Chile Pre IVA Scraper

- **URL:** https://apify.com/joan.sevenscale/sii-chile-pre-iva
- **Language:** JavaScript (Apify Actor)
- **Approach:** Headless browser (Playwright)
- **Status:** Available on Apify marketplace

**What it does:**
- Logs into SII with RUT and tax key (clave tributaria)
- Navigates the SII portal using Playwright
- Extracts Pre IVA data (taxable, exempt, IVA, totals)
- Returns data in JSON/CSV format
- Supports multiple RUTs and periods

**Approach:** Playwright headless browser. Full browser automation to navigate authenticated SII pages.

**Rating: 6/10** - One of the few solutions that actually automates the SII portal with a headless browser. Tied to Apify platform. Good reference for understanding what's possible with browser automation on SII.

---

### fthernan/sii_scraper

- **URL:** https://fthernan.github.io/sii_scraper
- **Language:** Python (OpenCV-based)
- **Status:** Archived/educational

**What it does:** Scrapes SII's webmap (property/terrain data). Uses computer vision (OpenCV) to extract shapes from rasterized WMS map tiles.

**Not relevant to tax/DTE operations.** This scrapes property data, not tax documents.

**Rating: 1/10** for our purposes - Different domain (property maps, not tax operations).

---

## Commercial SII APIs

These are not open source but important to understand the competitive landscape:

### API Gateway (apigateway.cl)

- **Website:** https://www.apigateway.cl/
- **Docs:** https://developers.apigateway.cl/
- **Auth:** OAuth2
- **Pricing:** Free trial (10 days), then paid plans

**What it does:** REST API that wraps SII functionality. Automates tasks that normally require manual portal access. Provides structured JSON responses from SII data.

**Approach:** Scraping-based (they scrape SII on your behalf). The SII does not have web services for many operations, so API Gateway fills the gap.

**Note:** LibreDTE publishes an `apigateway-client-php` library to interact with this service.

---

### SimpleAPI (simpleapi.cl)

- **Website:** https://www.simpleapi.cl/Productos/SimpleRCV
- **Pricing:** Free API key available, annual paid plans

**SimpleRCV product:**
- Obtains Registro de Compras y Ventas from SII
- Returns same data as SII portal's RCV download, in JSON format
- Works independently of the taxpayer's billing software
- Does not store generated information

**Approach:** Scraping-based. Explicitly states that SII has no web services for RCV, so they use scraping.

---

### SuperFactura

- **Clients:** https://github.com/kripper/superfactura-api-python, https://github.com/kripper/superfactura-api-net
- **Type:** Commercial DTE issuance service with API clients

---

### Haulmer / OpenFactura

- **Repo:** https://github.com/haulmer/openfactura-prestashop (PrestaShop plugin only)
- **Website:** OpenFactura is SII-certified software for DTE issuance
- **Type:** Commercial. Only the PrestaShop integration plugin is open source.

---

## Chilean Fintech Open-Source Components

### Fintoc

- **GitHub:** https://github.com/fintoc-com
- **Open-source repos:** `fintoc-node`, `fintoc-python`, `fintoc-ruby`, `fintoc-react-native`, `fintoc-js`, `fintoc-cli`
- **What they do:** API clients for Fintoc's bank connectivity and SII data platform
- **SII-specific:** Fintoc connects to SII to pull invoices, tax returns, payroll data, and boletas de honorarios. But the scraping/integration code is proprietary -- only API clients are open source.

**Relevance:** Fintoc validates the market for SII data extraction but doesn't share their scraping approach.

---

### Bsale, Nubox

No significant open-source components found. These are proprietary platforms.

---

## Community Resources

### cl-sii-extraoficial

- **Org:** https://github.com/cl-sii-extraoficial
- **Repos:**
  - `archivos-oficiales` - Unofficial mirror of SII official files (schemas, XSDs, etc.) with stable URLs
  - `bug-tracker` - Unofficial bug tracker for SII systems
  - `data-publicada` - Publicly released SII data

**Rating: 8/10** - Extremely valuable community resource. Provides stable references to SII files that frequently change URLs. Essential for any SII integration project.

---

### falconsoft3d/documentacion-dte

- **Repo:** https://github.com/falconsoft3d/documentacion-dte
- **What it does:** Documentation for Chilean electronic invoicing. Installation guides for Odoo + SII.

---

## Summary Matrix

| Project | Language | Scope | Auth Method | Approach | Scrapes SII? | Maintained | License | Rating |
|---------|----------|-------|-------------|----------|--------------|------------|---------|--------|
| **LibreDTE lib-core** | PHP 8.4 | Full DTE lifecycle | x509 cert | HTTP/SOAP | No (uses APIs) | Yes | AGPL-3.0 | 9/10 |
| **cordada/lib-cl-sii-python** | Python 3.9+ | Data models, XML | N/A | Library | No | Yes | MIT | 7/10 |
| **Sii.RegistroCompraVenta** | .NET | RCV extraction | PFX cert | HTTP scraping | **Yes (RCV)** | Yes | Not specified | 7/10 |
| **dansanti/l10n_cl_dte** | Python/Odoo | Full DTE | x509 cert | HTTP/SOAP | No | Yes | LGPL | 7/10 |
| **bluemindsspa/facturacion_electronica** | Python | DTE + Libros | x509 cert | HTTP/SOAP | No | Moderate | Not specified | 6/10 |
| **Apify SII Pre IVA** | JS/Playwright | Pre IVA data | RUT + clave | **Headless browser** | **Yes** | Yes | Proprietary | 6/10 |
| **gepd/HTTP-DTE** | Docker/Node | DTE issuance | x509 cert | HTTP API container | No | Moderate | MIT | 5/10 |
| **voipir/python-sii** | Python | DTE + upload | x509 cert | HTTP | No | Low | LGPL-3.0 | 5/10 |
| **FacTronica** | PHP | DTE + boletas | cert/RUT | HTTP | No | Moderate | Commercial | 5/10 |
| **situacion-tributaria-sii** | JS/npm | Tax status query | None (public) | HTTP scraping | Minimal | New | Not specified | 3/10 |
| **sagmor/sii_chile** | Ruby | Tax status query | None (public) | HTTP scraping | Minimal | Low | Not specified | 3/10 |
| **rodrigore/sii_chile** | PHP | Tax status query | None (public) | HTTP scraping | Minimal | Low | Not specified | 3/10 |
| **@gonzitaji/scraper-base-sii** | JS/npm | Base scraper | Unknown | HTTP scraping | Unknown | Abandoned | Not specified | 1/10 |

---

## Recommendations

### Key Takeaways

1. **No existing TypeScript library covers our needs.** The Node.js/TypeScript ecosystem for SII is extremely sparse. `emisso-sii` is already the most complete TypeScript SII library.

2. **LibreDTE is the gold standard** but is PHP-only and AGPL-licensed. It provides the most comprehensive reference for understanding the full scope of SII DTE operations.

3. **RCV scraping is rare.** Only `Sii.RegistroCompraVenta` (.NET) does it open-source, using HTTP requests with PFX certificate auth. The Apify actor uses Playwright for Pre IVA data. Commercial services (SimpleAPI, API Gateway) confirm that scraping is the only way to get RCV data since SII has no API for it.

4. **Two authentication patterns exist:**
   - **x509 digital certificate** (PFX/P12) - for DTE operations and authenticated portal access
   - **RUT + clave tributaria** - for portal login (used by Apify scraper, Fintoc)

5. **Scraping approach split:**
   - **HTTP-based scraping** (used by sergioocode, SimpleAPI, API Gateway) - faster, more reliable, lower resource usage
   - **Headless browser** (used by Apify/Playwright) - handles JavaScript-rendered pages, more brittle

6. **Fintoc validates the market** for SII data extraction (RCV, boletas, tax returns) but their core scraping technology is proprietary.

### What to Study Further

- **sergioocode/Sii.RegistroCompraVenta**: Study the .NET code for RCV scraping patterns -- certificate auth flow, API endpoint discovery, data parsing. This is the closest open-source reference to what we need for RCV.
- **LibreDTE lib-core**: Reference for complete DTE XML handling, SII SOAP endpoints, and certificate operations.
- **Apify SII Pre IVA**: Reference for Playwright-based SII portal automation.
- **cl-sii-extraoficial/archivos-oficiales**: Use for stable references to SII schemas and documentation.

### Gaps Our Library Can Fill

- **TypeScript RCV scraper** - No open-source solution exists in this language
- **TypeScript Boleta de Honorarios** - No solution exists
- **Unified TypeScript SII client** - Combining DTE operations (which we already have) with portal scraping
- **Modern architecture** - Effect TS, Zod validation, proper error handling -- no existing project uses modern TypeScript patterns
