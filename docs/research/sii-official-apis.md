# SII Official APIs Research

## Overview

Chile's Servicio de Impuestos Internos (SII) provides a mix of SOAP web services (for DTE/factura electronica) and a newer REST API (for boleta electronica). Many operations — notably Registro de Compras y Ventas (RCV) and Boletas de Honorarios — have **no official API** and are only accessible via the web portal.

---

## 1. Environments

| Environment | Purpose | Hosts |
|---|---|---|
| **Certification** | Testing/certification | `maullin.sii.cl` (DTE SOAP), `pangal.sii.cl` (Boleta REST send), `apicert.sii.cl` (Boleta REST auth), `ws2.sii.cl` (Reclamo SOAP) |
| **Production** | Live operations | `palena.sii.cl` (DTE SOAP), `rahue.sii.cl` (Boleta REST send), `api.sii.cl` (Boleta REST auth), `ws1.sii.cl` (Reclamo SOAP) |

Additional hosts:
- `www4c.sii.cl` — Swagger UI for Boleta Electronica API documentation
- `www4.sii.cl` — Alternative production host

---

## 2. Authentication Flow (Seed/Token Exchange)

All SII web services use a certificate-based authentication flow:

### Step 1: Get Seed (Semilla)
- **WSDL:** `https://{host}/DTEWS/CrSeed.jws?WSDL`
- **Operation:** `getSeed` — returns an XML containing a random seed value
- **No authentication required** for this step

### Step 2: Sign Seed & Get Token
- **WSDL:** `https://{host}/DTEWS/GetTokenFromSeed.jws?WSDL`
- **Operation:** `getToken` — accepts the seed signed with your private key (XML-DSIG), returns a token
- **Requires:** Valid digital certificate (X.509) issued by an accredited Chilean CA
- **Signature:** XML-DSIG with SHA1withRSA (RSA-SHA1)

### Step 3: Use Token
- For **SOAP services**: Add `Cookie: TOKEN=<token_value>` in the SOAP header
- For **REST services**: Add `Cookie: TOKEN=<token_value>` as HTTP header
- Token expires after some time; "NO ESTA AUTENTICADO" response means renewal needed

### Hosts for Auth
| Environment | Seed & Token |
|---|---|
| Certification | `maullin.sii.cl` (DTE) / `apicert.sii.cl` (Boleta) |
| Production | `palena.sii.cl` (DTE) / `api.sii.cl` (Boleta) |

---

## 3. SOAP Web Services (DTE — Factura Electronica)

### 3.1 Authentication
| Service | WSDL |
|---|---|
| CrSeed (Get Seed) | `https://{maullin\|palena}.sii.cl/DTEWS/CrSeed.jws?WSDL` |
| GetTokenFromSeed | `https://{maullin\|palena}.sii.cl/DTEWS/GetTokenFromSeed.jws?WSDL` |

### 3.2 DTE Upload (Send Documents)
| Service | URL |
|---|---|
| DTEUpload | `https://{maullin\|palena}.sii.cl/cgi_dte/UPL/DTEUpload` |

- **Method:** HTTP POST with `multipart/form-data`
- **Required Header:** `User-Agent: Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)`
- Accepts signed XML EnvioDTE documents
- Returns a TRACKID for status tracking

### 3.3 Query DTE Status
| Service | WSDL |
|---|---|
| QueryEstDte | `https://{maullin\|palena}.sii.cl/DTEWS/QueryEstDte.jws?WSDL` |
| QueryEstDteAv (Advanced) | `https://{maullin\|palena}.sii.cl/DTEWS/services/QueryEstDteAv?wsdl` |

- **QueryEstDte:** Basic status query for a specific DTE (by RUT, type, folio)
- **QueryEstDteAv:** Advanced query with more detailed status information
- Both require authentication token

### 3.4 Query Upload/Envio Status
| Service | WSDL |
|---|---|
| QueryEstUp | `https://{maullin\|palena}.sii.cl/DTEWS/QueryEstUp.jws?WSDL` |

- Given a TRACKID, returns: document type, total documents, accepted count, rejected count, repair notices

### 3.5 DTE Email Resend
| Service | WSDL |
|---|---|
| wsDTECorreo | `https://{maullin\|palena}.sii.cl/DTEWS/wsDTECorreo.jws?WSDL` |

- Request re-sending of DTE validation email

### 3.6 Acceptance/Complaint Registration (Registro Reclamo)
| Service | WSDL |
|---|---|
| RegistroReclamoDTE (Cert) | `https://ws2.sii.cl/WSREGISTRORECLAMODTECERT/registroreclamodteservice?wsdl` |
| RegistroReclamoDTE (Prod) | `https://ws1.sii.cl/WSREGISTRORECLAMODTE/registroreclamodteservice?wsdl` |

**Operations:**
- `ingresarAceptacionReclamoDoc` — Accept (ACD) or file complaint (RCD) against a DTE
- `listarEventosHistDoc` — List historical events for a document
- `consultarDocDteDcto` — Query document details
- `consultarFechaRecepcionSii` — Query SII reception date

### 3.7 Boleta Comprobante (Receipt Voucher)
| Service | WSDL |
|---|---|
| ComprobanteBoleta (Cert) | `https://ws2.sii.cl/WSCOMPROBANTEBOLETAAUTCERT/comprobanteboletaservice?wsdl` |
| ComprobanteBoleta (Prod) | `https://ws1.sii.cl/WSCOMPROBANTEBOLETA2/comprobanteboletaservice?wsdl` |

---

## 4. REST API (Boleta Electronica)

The SII provides a modern REST API specifically for **Boleta Electronica** (DTE types 39 and 41).

### Swagger/OpenAPI Documentation
- `https://www4c.sii.cl/bolcoreinternetui/api/` — Swagger UI (OpenAPI 3.0, version 1.0.5)

### Base URLs
| Environment | Auth Server | Document Server |
|---|---|---|
| Certification | `apicert.sii.cl` | `pangal.sii.cl` |
| Production | `api.sii.cl` | `rahue.sii.cl` |

### Known Endpoints
- `GET /recursos/v1/...` — Seed and token operations
- `POST /recursos/v1/boleta.electronica.envio` — Send boleta electronica
- Query TRACKID status
- Query boleta status

### Required Headers
```
Cookie: TOKEN=<token_value>
Accept: application/json
User-Agent: Mozilla/4.0 (compatible; PROG 1.0; Windows NT)
Host: <server_name>
```

### Document Format
- XML encoding: ISO-8859-1
- DTE Type 39 = Boleta Electronica
- DTE Type 41 = Boleta Electronica Exenta
- CAF (Codigo de Autorizacion de Folios) required for folio ranges
- Service Indicator (IndServicio) = 3 for boletas

---

## 5. What Has NO Official API

### 5.1 Registro de Compras y Ventas (RCV) — NO API
- **No official SOAP or REST web service exists** for listing/downloading RCV data
- The RCV is only accessible via the web portal at `https://www4.sii.cl/` (requires certificate login)
- All third-party solutions (SimpleAPI, API Gateway, BaseAPI, APISII) use **web scraping** to extract RCV data
- Open source: [Sii.RegistroCompraVenta](https://github.com/sergioocode/Sii.RegistroCompraVenta) (.NET scraping solution)
- RCV data can be downloaded as CSV from the portal manually

### 5.2 Boletas de Honorarios — NO API
- **No official web service exists** for issuing, querying, or managing Boletas de Honorarios
- All operations (emit, cancel, query) are only available via the SII web portal
- Third-party solutions (Bolo, SimpleAPI, API Gateway) all use **web scraping**
- Open source: [BoletaHonorariosEmitir](https://github.com/FacTronica/BoletaHonorariosEmitir)

### 5.3 Other Portal-Only Operations
- Taxpayer status queries (Situacion Tributaria)
- CAF (folio) management beyond initial assignment
- Certificate management
- Tax declarations (F29, DJ, etc.)
- Contributor data queries

---

## 6. Official SII Developer Documentation

All PDFs are hosted at `sii.cl`:

| Document | URL |
|---|---|
| Technical Instructive (main index) | https://www.sii.cl/factura_electronica/factura_mercado/instructivo.htm |
| Technical Documentation Index | https://www.sii.cl/factura_electronica/tecnica.htm |
| Authentication Manual | https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf |
| Query DTE Status Manual | https://www.sii.cl/factura_electronica/factura_mercado/estado_dte.pdf |
| Advanced Query DTE Manual | https://www.sii.cl/factura_electronica/factura_mercado/OIFE2006_QueryEstDteAv_MDE.pdf |
| Query Upload Status Manual | https://www.sii.cl/factura_electronica/factura_mercado/estado_envio.pdf |
| DTE Email Resend Manual | https://www.sii.cl/factura_electronica/factura_mercado/OIFE2005_wsDTECorreo_MDE.pdf |
| Reclamo DTE Web Service (v1.1) | https://www.sii.cl/factura_electronica/Webservice_Registro_Reclamo_DTE_V1.1.pdf |
| Reclamo DTE Web Service (v1.2) | https://www.sii.cl/factura_electronica/Webservice_Registro_Reclamo_DTE_V1.2.pdf |
| Boleta Electronica Instructive | https://www.sii.cl/factura_electronica/factura_mercado/Instructivo_Emision_Boleta_Elect.pdf |
| Boleta Comprobante Manual | https://www.sii.cl/ccp/formato_envio_cp_electronico.pdf |
| DTE Upload Manual | https://www.sii.cl/factura_electronica/factura_mercado/envio.pdf |
| DTE Emission Instructive | https://www.sii.cl/factura_electronica/instructivo_emision.pdf |
| Operation Model | https://www.sii.cl/factura_electronica/modelo_operacion.pdf |

---

## 7. Access Requirements

### Digital Certificate
- Must be an **Advanced Electronic Signature** certificate (Firma Electronica Avanzada)
- Issued by an accredited Chilean CA (E-Sign, CertificadoDigital, etc.)
- Can be personal (natural person) or for a legal representative
- Certificate contains RUT which determines authorization scope

### DTE Certification Process
- Each taxpayer must complete a certification process per document type
- Involves generating a test set (set de prueba) and submitting to SII
- Software is NOT certified — the taxpayer's documents are certified
- Separate certification for: Factura, Nota de Credito, Nota de Debito, Guia de Despacho, Boleta, etc.

### Folio Assignment (CAF)
- Must request CAF (Codigo de Autorizacion de Folios) from SII for each document type
- CAF is an XML file containing authorized folio ranges
- Required for signing documents (provides the folio range and SII's authorization)

---

## 8. Rate Limits and IP Restrictions

### Official Rate Limits
- SII does not publish official rate limits
- No documented API quotas in official documentation

### Known Restrictions (as of 2025)
- SII has implemented **IP-based blocking** that affects all platforms interacting with their services
- Connections can be **blocked after ~20 seconds** (cURL error 28: Connection timed out after 20001 milliseconds)
- These restrictions primarily target scraping operations but can also affect legitimate API usage
- Third-party providers (API Gateway) have implemented IP rotation and proxy solutions to mitigate

### Best Practices
- Use connection pooling and reuse tokens (don't request new token per operation)
- Implement exponential backoff on failures
- Avoid aggressive concurrent requests
- SII systems have known downtime during maintenance windows (typically nights/weekends)

---

## 9. Summary: API vs Portal vs Scraping

| Operation | Method | Endpoints |
|---|---|---|
| **Authentication (seed/token)** | SOAP API | CrSeed, GetTokenFromSeed |
| **Send DTE (Factura, NC, ND, GD)** | HTTP POST | DTEUpload |
| **Query DTE status** | SOAP API | QueryEstDte, QueryEstDteAv |
| **Query upload status** | SOAP API | QueryEstUp |
| **Accept/Complain DTE** | SOAP API | RegistroReclamoDTE |
| **Send Boleta Electronica** | REST API | boleta.electronica.envio |
| **Query Boleta status** | REST API | via api.sii.cl |
| **Boleta Comprobante** | SOAP API | ComprobanteBoleta |
| **DTE Email Resend** | SOAP API | wsDTECorreo |
| **List RCV (purchases/sales)** | Portal only / Scraping | No official API |
| **Boletas de Honorarios** | Portal only / Scraping | No official API |
| **Tax declarations (F29, DJ)** | Portal only | No API |
| **Taxpayer status queries** | Portal only / Scraping | No official API |
| **CAF/Folio management** | Portal only | No API |

---

## 10. Key Takeaways for emisso-sii

1. **DTE operations are well-served by official SOAP APIs** — send, query status, accept/reject
2. **Boleta Electronica has a modern REST API** — newer, JSON-based, documented with Swagger
3. **RCV has NO official API** — this is a critical gap; all solutions use scraping
4. **Boletas de Honorarios have NO official API** — all solutions use scraping
5. **Authentication is uniform** — seed/token exchange with certificate, works across all services
6. **SII actively restricts scraping** — IP blocking, timeouts, no official support
7. **The existing emisso-sii SDK** should cover auth + DTE SOAP + Boleta REST; RCV/Honorarios would require a separate scraping layer
