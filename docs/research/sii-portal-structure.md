# SII Portal Page Structures: RCV + Boletas de Honorarios

## Overview

This document details the technical architecture and page structures of two key SII (Servicio de Impuestos Internos) web portals: the Registro de Compras y Ventas (RCV) and the Boletas de Honorarios portal. Both are accessed through the main SII website (www.sii.cl) and share a common authentication system.

---

## 1. SII Authentication System

### 1.1 Web Portal Login (Browser-Based)

**Login URL:** `https://homer.sii.cl/`

The standard web login uses **RUT + Clave Tributaria** (tax password):
1. Navigate to `www.sii.cl` and click "Mi SII" (upper right)
2. Enter RUT (Chilean tax ID, format: 12.345.678-9)
3. Enter Clave Tributaria (tax password, minimum 8 characters)
4. System sets session cookies for authenticated access

**Password Recovery:** Sends verification code to registered email.

**Digital Certificate Login:** Some services require or support authentication via installed digital certificate (X.509) instead of or in addition to RUT+password. The certificate must be installed in the browser and is typically the legal representative's certificate.

### 1.2 SOAP Web Service Authentication (Automatic/Programmatic)

For programmatic access to DTE-related web services, SII provides a SOAP-based token authentication system:

**Step 1 — Request Seed (CrSeed):**
```
Production: https://palena.sii.cl/DTEWS/CrSeed.jws?WSDL
Certification: https://maullin.sii.cl/DTEWS/CrSeed.jws?WSDL
```
- Call `getSeed()` method
- Returns XML with a numeric seed value (limited validity, ~2 minutes)

**Step 2 — Sign the Seed:**
- Embed seed into XML template with `<getToken><item><Semilla>{seed}</Semilla></item>` structure
- Sign with XML-DSIG (enveloped signature) using PKCS#12 (.p12/.pfx) digital certificate
- Signature uses RSA-SHA1, includes RSAKeyValue and X509Certificate
- Template structure:
```xml
<?xml version="1.0"?>
<getToken>
  <item><Semilla>{seed}</Semilla></item>
  <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignedInfo>
      <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
      <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
      <Reference URI="">
        <Transforms>
          <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
        </Transforms>
        <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
        <DigestValue/>
      </Reference>
    </SignedInfo>
    <SignatureValue/>
    <KeyInfo>
      <KeyValue><RSAKeyValue><Modulus/><Exponent/></RSAKeyValue></KeyValue>
      <X509Data><X509Certificate/></X509Data>
    </KeyInfo>
  </Signature>
</getToken>
```

**Step 3 — Get Token (GetTokenFromSeed):**
```
Production: https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL
Certification: https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL
```
- Call `getToken(signedSeedXml)` method
- SII validates XML signature and seed validity
- Returns token on success (state "00"), error codes (-7 to 21) on failure
- Token is valid for ~2 minutes
- Token goes in HTTP headers for subsequent web service calls

### 1.3 Authentication Summary

| Method | Use Case | Credentials |
|--------|----------|-------------|
| RUT + Clave Tributaria | Browser portal access | Tax password |
| Digital Certificate (browser) | Enhanced portal access | X.509 cert installed in browser |
| SOAP Token (CrSeed → GetTokenFromSeed) | Programmatic DTE web services | PKCS#12 digital certificate |
| Cookie-based session | Portal scraping after login | Session cookies from RUT+password login |

**Important:** The SOAP authentication system is only for DTE-related web services. The RCV and Boletas de Honorarios portals are **browser-based applications** that require cookie-based session authentication (RUT + Clave Tributaria login). There are **no official REST/SOAP APIs** for querying RCV or Boletas de Honorarios data.

---

## 2. Registro de Compras y Ventas (RCV) Portal

### 2.1 Portal URL and Technology

**URL:** `https://www4.sii.cl/registrocompaborUI/`

**Technology Stack:**
- **Backend:** Java (confirmed by w3techs analysis of sii.cl)
- **Frontend:** Angular SPA (on www4 subdomain), with jQuery 3.1.1, Lodash, Moment.js
- **Web Server:** Apache HTTP Server
- **The URL pattern `*UI/` suggests a Single Page Application** — the `registrocompaborUI` name follows Angular routing conventions
- **SSL:** GlobalSign certificate
- **Analytics:** Dynatrace, Adobe DTM
- **Security:** HSTS, secure cookies, session cookies (up to 1 day expiration)
- **Encoding:** UTF-8, Gzip compression

### 2.2 Access Flow

1. Login at `www.sii.cl` → "Mi SII" with RUT + Clave Tributaria
2. Navigate: Servicios Online → Factura Electronica → Registro de Compras y Ventas
3. Or direct URL: `https://www4.sii.cl/registrocompaborUI/`
4. Select company RUT (if user represents multiple companies)
5. Select period (year + month)
6. Click "Consultar"

### 2.3 Page Structure

The RCV interface has **two main tabs**:

#### Compras (Purchases) Tab
- **Default view** when loading a period
- Lists all purchase documents registered by SII for the selected period
- Includes documents issued by suppliers that SII has received electronically
- Note: Invoices requiring acceptance won't appear until accepted or 8 business days elapse (auto-accepted)

#### Ventas (Sales) Tab
- Lists all sales documents issued by the taxpayer
- Must be manually selected after changing periods (defaults back to Compras)

### 2.4 Data Fields / Columns

Documents are displayed in a **table format** with the following columns:

| Field | Description |
|-------|-------------|
| Tipo Documento | Document type code (factura, nota de credito, etc.) |
| Folio | Document number |
| Fecha | Document date |
| RUT Emisor/Receptor | Tax ID of issuer or receiver |
| Razon Social | Company/person name |
| Monto Neto | Net amount (before tax) |
| Monto Exento | Tax-exempt amount |
| Monto IVA | VAT amount |
| Monto Total | Total amount |

**Detail View:** Clicking on any document row opens more specific details about that transaction.

**CSV Export:** The "Descargar Detalles" button generates a CSV file with:
- Semicolon (`;`) separator (not comma, because names may contain commas)
- Up to 40 fields per document for Ventas (paper documents)
- Up to 28 fields per document for Compras (paper documents)
- First row contains column headers
- Electronic documents have fewer required fields

### 2.5 Document Types in RCV

The RCV supports multiple DTE (Documento Tributario Electronico) types:

| Code | Document Type |
|------|--------------|
| 33 | Factura Electronica |
| 34 | Factura No Afecta o Exenta Electronica |
| 39 | Boleta Electronica |
| 41 | Boleta Exenta Electronica |
| 43 | Liquidacion Factura Electronica |
| 46 | Factura de Compra Electronica |
| 52 | Guia de Despacho Electronica |
| 56 | Nota de Debito Electronica |
| 61 | Nota de Credito Electronica |
| 110 | Factura de Exportacion Electronica |
| 111 | Nota de Debito Exportacion Electronica |
| 112 | Nota de Credito Exportacion Electronica |

### 2.6 Filters and Navigation

- **Period selector:** Year dropdown + Month dropdown → "Consultar" button
- **Tab switching:** Compras / Ventas tabs at the top
- **Sorting:** Columns are sortable for review and analysis
- **Pagination:** Handled within the SPA (exact mechanism unclear — likely client-side for smaller datasets, server-side AJAX for larger ones)
- **No search/text filter visible** — period-based navigation only

### 2.7 Implications for Scraping

Since the RCV is an **Angular SPA**:
- Direct HTTP scraping won't work — JavaScript must execute to render content
- A headless browser (Playwright, Puppeteer) is required
- The SPA likely makes **internal AJAX/REST calls** to backend APIs (www4.sii.cl endpoints) to fetch data
- **Intercepting these internal API calls** may be more efficient than DOM scraping
- The CSV download feature could be leveraged as a simpler extraction method
- Session cookies from authentication must be maintained throughout

---

## 3. Boletas de Honorarios Portal

### 3.1 Portal URL and Technology

**URL:** `https://www4.sii.cl/boaborUI/`

**Technology:** Same stack as RCV — Angular SPA on www4.sii.cl subdomain. The `boaborUI` naming pattern matches `registrocompaborUI`, confirming consistent architecture.

### 3.2 Access Flow

1. Login at `www.sii.cl` → "Mi SII" with RUT + Clave Tributaria
2. Navigate: Servicios Online → Boletas de Honorarios Electronicas
3. Or via "Consultas sobre Boletas" section

### 3.3 Page Structure — Three Main Sections

#### 3.3.1 Boletas Emitidas (Issued Invoices)
- **Path:** Boleta de Honorarios Electronica → Consultar boletas emitidas
- Shows all boletas de honorarios the logged-in user has issued
- Reports available at daily, monthly, or annual granularity
- Can download listing as spreadsheet file
- Shows individual boleta details

#### 3.3.2 Boletas Recibidas (Received Invoices)
- **Path:** Mi SII → Servicios Online → Boletas de honorarios electronicas → Boletas de prestacion de servicios de terceros electronicas → Consulta de BTE's recibidas
- Shows boletas issued TO the logged-in user by other contributors
- Period-based query (select time range to view)

#### 3.3.3 Boletas de Terceros (Third-Party Verification)
- Allows verifying content of boletas issued by other contributors to third parties
- Used for cross-referencing and verification purposes

### 3.4 Data Fields

Key fields in boletas de honorarios:

| Field | Description |
|-------|-------------|
| Numero Boleta | Invoice number (folio) |
| Fecha Emision | Issue date |
| RUT Prestador | Service provider's tax ID |
| Nombre Prestador | Service provider's name |
| RUT Beneficiario | Client/beneficiary tax ID |
| Nombre Beneficiario | Client/beneficiary name |
| Descripcion Prestacion | Service description (can have multiple line items) |
| Monto Bruto | Gross amount |
| Retencion (%) | Withholding percentage (15.25% as of Jan 1, 2026) |
| Monto Retencion | Withholding amount |
| Monto Liquido | Net amount after withholding |
| Estado | Status (vigente/anulada) |
| Comuna | Municipality |
| Direccion | Address |

### 3.5 Key Differences from Regular Invoices (DTEs)

| Aspect | DTEs (Facturas) | Boletas de Honorarios |
|--------|-----------------|----------------------|
| Issued by | Companies | Individual professionals |
| Tax treatment | VAT (IVA) | Income tax withholding |
| Withholding | N/A | 15.25% (2026) |
| Portal | RCV (`registrocompaborUI`) | Boletas (`boaborUI`) |
| Document types | 33, 34, 39, etc. | BHE (emitidas), BTE (terceros/recibidas) |
| Emission | Via facturacion electronica system | Via SII portal or e-Honorarios app |
| Cancellation | Via notas de credito | Direct cancellation in portal |

### 3.6 Emission Flow (for context)

When emitting a new boleta de honorarios:
1. Enter all data (or use previously saved proposals)
2. Specify: prestador, beneficiario, servicio description, amount
3. System auto-calculates withholding based on current rate
4. Emission can be in CLP (pesos), USD, or UF (Unidad de Fomento)
5. System generates folio number and official document

### 3.7 Mobile App: e-Honorarios

SII provides an official mobile app "e-Honorarios" for:
- Issuing boletas de honorarios
- Consulting issued boletas
- Viewing received boletas
- Available on iOS and Android

---

## 4. Official SII Boletas API (Limited)

### 4.1 Boletas Core API

**URL:** `https://www4c.sii.cl/bolcoreinternetui/api/`

This is a documented OpenAPI/Swagger endpoint (version 1.0.5):
- Uses SwaggerUI for documentation
- Specification defined in `openapi.yaml`
- The `www4c` subdomain suggests a separate API cluster
- **Limited public documentation** — the Swagger UI is accessible but actual endpoint details require browser access

This appears to be a newer, REST-based API that SII is developing for boletas, though its completeness and public availability for third-party use is unclear.

### 4.2 Web Service for Boletas Electronicas (Comprobante de Boleta)

**Documentation:** `https://www.sii.cl/ccp/formato_envio_cp_electronico.pdf`

Official web service for electronic receipt stubs (comprobantes de pago electronico) — separate from boletas de honorarios.

---

## 5. Internal API Architecture (Inferred)

Based on the Angular SPA architecture and third-party API provider behavior, the SII portals likely use internal REST APIs:

### 5.1 Probable Internal API Pattern

```
https://www4.sii.cl/registrocompaborUI/api/...   (RCV data)
https://www4.sii.cl/boaborUI/api/...              (Boletas data)
```

These internal APIs likely:
- Accept and return JSON
- Use session cookies for authentication (same as browser session)
- Are called by the Angular frontend via AJAX/HttpClient
- Handle pagination server-side for large datasets
- Are NOT documented publicly or intended for third-party use

### 5.2 Evidence from Third-Party Providers

All major Chilean API providers (SimpleAPI, BaseAPI, API Gateway, Bolo, Floid, Chilesystems) confirm:

> "El SII no dispone de web services para estos efectos, por lo que todas las operaciones se realizan utilizando tecnicas de scraping."
> (SII does not provide web services for these purposes, so all operations are performed using scraping techniques.)

This confirms there are **no official public APIs** for RCV or Boletas queries. Third-party providers use:
- **Selenium** (SimpleAPI — C# .NET 6)
- **Playwright** (Apify SII scraper)
- **HTTP session replay** (intercepting internal API calls after login)

---

## 6. Community Knowledge and Developer Resources

### 6.1 Open Source Projects

| Project | Language | Stars | What It Does |
|---------|----------|-------|-------------|
| [cordada/lib-cl-sii-python](https://github.com/cordada/lib-cl-sii-python) | Python | - | General SII library |
| [lalote/sii_auth](https://github.com/lalote/sii_auth) | Java | - | SOAP authentication (seed/token) |
| [EstebanFuentealba/sii-auth-gist](https://gist.github.com/EstebanFuentealba/d8f2e60b2b2f1bac13ba) | Python | - | Complete auth flow in Python |
| [FacTronica/DescargarRCV](https://github.com/FacTronica/DescargarRCV) | cURL | - | Download RCV via FacTronica service |
| [FacTronica/BoletaHonorariosEmitir](https://github.com/FacTronica/BoletaHonorariosEmitir) | API | - | Emit boletas via FacTronica |
| [tonicanada/sii_chile_xml_to_pdf](https://github.com/tonicanada/sii_chile_xml_to_pdf) | Python | 24 | Convert DTE XML to PDF |
| [pdelteil/sii_situacion_tributaria](https://github.com/pdelteil/sii_situacion_tributaria) | Python | 16 | Query taxpayer status |
| [gepd/HTTP-DTE](https://github.com/gepd/HTTP-DTE) | - | - | HTTP API for DTE emission |
| [sagmor/sii_chile](https://github.com/sagmor/sii_chile) | - | - | SII queries by RUT |

### 6.2 Third-Party API Providers

| Provider | URL | Services | Pricing |
|----------|-----|----------|---------|
| SimpleAPI | simpleapi.cl | RCV, Boletas, DTE | Free 30 queries/mo, paid plans |
| BaseAPI | baseapi.cl | RCV, Boletas, DTEs, Contribuyente | API key, tiered |
| API Gateway | apigateway.cl | Full SII integration | Subscription |
| Bolo | bolo.cl | Boletas de Honorarios API | Subscription |
| Floid | floid.io | SII validation, RCV | Enterprise |
| Chilesystems | chilesystems.com | Facturacion, RCV | Subscription |
| Apify (SII Pre IVA) | apify.com | RCV Pre-IVA scraping | Pay-per-use |

### 6.3 Key Blog Resources

- [Factura Electronica Desarrolladores .Net](http://lenguajedemaquinas.blogspot.com/) — Detailed .NET tutorials for SII authentication, seed/token, DTE submission
- [The Geek Project](https://thegeekproject.wordpress.com/2018/09/12/c-y-s-i-i-servicio-impuestos-internos/) — C# SII integration
- [ncw-apuntes](http://ncw-apuntes.blogspot.com/2015/05/autenticacion-con-sii-certificado-pfx.html) — Linux PFX certificate auth
- [CryptoSys](https://cryptosys.net/pki/xmldsig-ChileSII.html) — XML-DSIG and Chile SII signing details
- [Nubox Blog](https://blog.nubox.com/contadores/como-consulto-el-rcv-en-el-sii) — RCV navigation tutorial

---

## 7. Scraping Strategy Recommendations

### 7.1 For RCV Data

**Approach A — CSV Download (Simplest):**
1. Login via headless browser (Playwright)
2. Navigate to RCV portal
3. Select period
4. Click "Descargar Detalles" for Compras and Ventas
5. Parse resulting CSV files (semicolon-separated)
6. Pros: Reliable, complete data, no pagination issues
7. Cons: Slower, requires full page render

**Approach B — Internal API Interception (Most Efficient):**
1. Login via headless browser
2. Intercept XHR/fetch calls made by the Angular SPA
3. Replay those internal API calls directly with session cookies
4. Pros: Fast, JSON format, can handle pagination
5. Cons: Requires reverse-engineering internal API, may break with updates

**Approach C — DOM Scraping (Fallback):**
1. Login and navigate with headless browser
2. Extract data from rendered table elements
3. Handle pagination by clicking through pages
4. Pros: Works regardless of API changes
5. Cons: Slowest, fragile selectors

### 7.2 For Boletas de Honorarios

**Same three approaches apply**, with additional considerations:
- Three separate sections to scrape (emitidas, recibidas, terceros)
- Different navigation paths for each
- The spreadsheet download feature may be the most reliable method
- Period-based queries (daily, monthly, annual)

### 7.3 Authentication for Scraping

For both portals, the recommended auth flow for scraping:
1. Use Playwright to navigate to `homer.sii.cl`
2. Fill RUT + Clave Tributaria form
3. Submit and wait for redirect
4. Capture session cookies
5. Use cookies for subsequent requests (either browser-based or HTTP client)

**Digital certificate auth** is more complex for scraping but more robust:
- Requires loading PKCS#12 certificate into headless browser
- Or use the SOAP token flow and inject token as cookie/header

---

## 8. Key Takeaways

1. **No public APIs exist** for RCV or Boletas de Honorarios queries — scraping is the only option
2. Both portals are **Angular SPAs** on `www4.sii.cl` backed by Java
3. Authentication is **RUT + Clave Tributaria** with session cookies
4. The SOAP token system is only for DTE web services, not portal access
5. **CSV download** is the most reliable data extraction method for RCV
6. Internal Angular API calls can be intercepted for more efficient data access
7. All major Chilean fintech/API providers use scraping under the hood
8. SII has a newer REST API at `www4c.sii.cl/bolcoreinternetui/api/` but it's not well documented
9. The `www4` subdomain hosts all interactive portal applications
10. Session cookies, HSTS, and secure cookie flags must be handled properly
