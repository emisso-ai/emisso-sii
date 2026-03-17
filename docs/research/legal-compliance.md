# Legal and Compliance Analysis: SII Scraping in Chile

> Research date: March 2026

## Executive Summary

There is **no specific Chilean law** that explicitly prohibits or authorizes web scraping. The legality depends on multiple factors: whether authentication is bypassed, whether personal data is collected, whether the site's terms of service are violated, and the purpose of data use. SII's terms prohibit automated mechanisms and commercial use of data, but established companies (Fintoc, LibreDTE, Bsale) operate in this space using credential-delegated access with user consent. The upcoming Ley 21.719 (effective December 2026) will significantly tighten data protection requirements.

---

## 1. Is Scraping sii.cl Legal in Chile?

### No Specific Scraping Law

Chile has **no dedicated legislation** addressing web scraping. Legality is determined by the intersection of several laws:

- **Ley 21.459 (Computer Crimes, 2022):** Criminalizes unauthorized access to computer systems. Key threshold: accessing "without authorization or exceeding authorization **and overcoming technical barriers or technological security measures**." Penalty: minor imprisonment or fine of 11-20 UTM. If scraping uses legitimately delegated credentials (with user consent) and does not bypass CAPTCHAs or security measures, it likely does not meet this threshold.

- **Ley 19.628 (Data Protection, 1999):** Protects personal data in registries. Tax data (RUT, income, invoices) constitutes personal data. Processing requires consent or legal basis. Currently weak enforcement, but this changes with Ley 21.719.

- **Civil liability:** Violating a website's terms of service can trigger civil claims, even if not criminal. SII could seek injunctive relief or damages.

### Supreme Court Precedent on Web Scraping (Rol 15245-2019)

The Corte Suprema ruled on scraping the Judicial Branch's website. A law firm extracted debtor data from public court records to solicit clients. The Court **rejected the protection action** against the scraper, effectively allowing the practice for publicly available data. This is the closest precedent, though it involved public (unauthenticated) data, which differs from SII's authenticated portal.

### Key Legal Distinction

| Scenario | Risk Level | Rationale |
|----------|-----------|-----------|
| Scraping public SII pages (no auth) | Low | Publicly available data, Transparency Law applies |
| Authenticated access with user-delegated credentials | Medium | User consents, but SII ToS prohibit automated access |
| Bypassing CAPTCHAs or security measures | High | Likely violates Ley 21.459 (computer crimes) |
| Collecting/selling personal tax data commercially | High | Violates Ley 19.628 and SII ToS |

---

## 2. SII Terms of Service Analysis

Source: [SII Terminos y Condiciones](https://www.sii.cl/sobre_el_sii/terminos_sitio_web.html)

### Key Restrictions

1. **Automated mechanisms prohibited:** "mecanismos automaticos que puedan obstaculizar las funcionalidades de la plataforma" (automatic mechanisms that could obstruct platform functionality).

2. **Personal, non-commercial use only:** Information may only be used "de manera personal y no comercial" (personally and non-commercially).

3. **No redistribution:** Users cannot "ceder, comercializar, circular, retransmitir o distribuir" (transfer, commercialize, circulate, retransmit or distribute) information.

4. **Intellectual property:** All site content, design, and programming belong to SII. Modification, copying, or distribution requires "autorizacion previa, expresa y por escrito del SII" (prior, express, written authorization).

### Important Nuances

- These terms are explicitly stated to **not constitute a contract** between SII and users.
- Tax services affecting contributors' rights are governed by **tax regulations**, not these terms.
- The terms do not specify penalties for violations; enforcement falls to general Chilean law.
- The prohibition on automated mechanisms focuses on **obstruction of functionality**, not all automation.

### Practical Implication

The terms create a civil (not criminal) risk. SII could block access or pursue civil claims, but the terms themselves are non-contractual. Rate-limited, non-disruptive automation that respects user delegation is in a gray area.

---

## 3. How Established Companies Handle This

### Fintoc

- **Model:** Credential-delegated access. Users provide their SII credentials (RUT + clave tributaria) to Fintoc, which accesses SII on their behalf.
- **Legal basis:** User consent and authorization. Fintoc's terms state they act as "mere intermediary" and are "not responsible for subsequent treatment of information by clients."
- **Regulatory position:** Regulated by CMF under Ley Fintech 21.521. Holds proper licensing.
- **Technical approach:** Screen scraping / browser automation with user-provided credentials.

### LibreDTE (SASCO SpA)

- **Model:** Open-source electronic invoicing platform. Uses SII's official SOAP web services for DTE emission, plus an API Gateway for additional SII queries.
- **Legal basis:** Operates as an authorized electronic invoicing provider listed on SII's provider registry. Uses official APIs where available, supplements with scraping for data not exposed via API.
- **Key insight:** LibreDTE publicly states that SII does **not certify software** — it only authorizes **taxpayers** to issue DTEs. The software provider list is informational only.

### Bsale

- **Model:** SaaS invoicing platform with API. Handles SII complexity internally.
- **Legal basis:** Listed as electronic invoicing provider on SII. Manages the SII connection for clients.

### Nubox

- **Model:** Accounting/invoicing platform integrated with Fintoc for data aggregation.
- **Legal basis:** Certified electronic invoicing provider. Uses combination of official SII APIs and Fintoc's data aggregation.

### Common Pattern

All established companies:
1. Operate with **explicit user consent** (credential delegation)
2. Are **registered** with SII as electronic invoicing providers where applicable
3. Are **regulated** by CMF where financial services are involved
4. Use a **hybrid approach**: official APIs for DTE emission + scraping/automation for data retrieval
5. Maintain **terms of service** that disclaim liability and establish data handling practices

---

## 4. Data Protection: Current and Future Law

### Current: Ley 19.628 (1999)

- Protects "personal data" in registries and databases
- Tax data (RUT, income declarations, invoices) qualifies as personal data
- Requires consent for processing, with exceptions for publicly available data
- **Weak enforcement**: No independent authority, no significant fines
- Data on economic/financial obligations can be communicated under specific conditions

### Constitutional: Ley 21.096 (2018)

- Elevated data protection to **constitutional right** (Article 19 No. 4 of the Constitution)
- Establishes that "the protection of personal data" is guaranteed, and processing can only occur "in the cases and forms determined by law"

### Future: Ley 21.719 (Effective December 1, 2026)

This is a **major change**. Key provisions:

- **Creates the Agencia de Proteccion de Datos Personales** (Data Protection Agency) — independent enforcement body
- **New principles:** Lawfulness, loyalty, purpose limitation, data quality, accountability, security, transparency
- **Enhanced rights:** Access, rectification, deletion, blocking (ARCO rights, similar to GDPR)
- **Obligations:** Transparency, confidentiality, privacy by design, security measures, breach reporting
- **Sanctions:** Fines and inclusion in National Registry of Sanctions and Compliance
- **Replaces** Ley 19.628 entirely

### Implications for SII Scraping

Under Ley 21.719 (from December 2026):

1. **Legal basis required:** Must have explicit consent or another lawful basis for processing tax data
2. **Purpose limitation:** Data collected for one purpose cannot be repurposed without consent
3. **Data minimization:** Only collect what is strictly necessary
4. **Security obligations:** Must implement adequate security measures
5. **Breach notification:** Must report data breaches to the authority
6. **Corporate liability:** Companies can be held liable for data protection violations
7. **Cross-border transfers:** Restrictions on transferring personal data outside Chile

This law significantly increases the compliance burden and makes a proper consent/authorization framework essential.

---

## 5. SII Certification and Authorization

### Electronic Invoicing Certification Process

Source: [SII Certificacion](https://www.sii.cl/factura_electronica/factura_mercado/proceso_certificacion.htm)

The certification process includes:

1. **Test set assigned by SII** — generating sample DTEs
2. **Simulation set** — end-to-end DTE lifecycle testing
3. **Information exchange set** — inter-company DTE exchange
4. **Print sample submission** — physical representation of electronic documents
5. **Progress declaration** — attestation of readiness

### What Certification Covers

- **DTE emission only:** Generation, signing, and submission of electronic tax documents
- **DTE reception:** Receiving and validating incoming DTEs
- **Does NOT cover:** Read access to RCV (Registro de Compras y Ventas), tax declarations, boletas, or other query operations

### Critical Distinction

> SII authorizes **taxpayers** to emit DTEs, not software. The software provider list is purely informational. (Source: [LibreDTE blog](https://www.libredte.cl/blog/libredte-3/sii-certifica-o-autoriza-a-los-software-de-facturacion-99))

### "Fast Track" Provider Enrollment

SII maintains a list of authorized providers ("proveedores certificados/enroladores fast track") who can expedite client onboarding to electronic invoicing. Requirements:
- Contact SII help desk
- Declare if distributor or own software
- Provide software characteristics and website
- List of taxpayers using the software
- Company logo

This is **not a technical certification** — it's a registry listing.

### No Read-Access Authorization

There is **no SII certification or authorization process** for read access to the portal. The SII provides:
- SOAP web services for DTE submission/querying (authenticated with digital certificate)
- A basic REST API for boletas (`/bolcoreinternetui/api/`)
- The web portal for all other queries

For data retrieval beyond these APIs, companies must use the web portal directly.

---

## 6. Precedents: SII Actions Against Automated Access

### No Direct Anti-Scraper Actions Found

Research found **no cases** of SII taking legal action specifically against scrapers or automated access tools.

### SII Portal Blocking Precedents

SII has blocked taxpayer access to its portal, but courts have pushed back:

1. **Corte Suprema, April 2025:** Confirmed that SII blocking a taxpayer's portal access without prior notification was **illegal and arbitrary**. The court found "no legal norm authorizing [SII] to block access to the virtual platform" and characterized SII's action as "self-enforcement" (autotutela) based on an internal plan (Modelo Integrado de Gestion de Cumplimiento Tributario) without legal backing.

2. **Corte Suprema, May 2025:** Again ordered SII to unblock a taxpayer's credentials, ruling the block was unconstitutional.

3. **Corte de Apelaciones Santiago, July 2025:** Upheld SII's right to block electronic stamping (timbraje) as a legitimate control/audit measure under Articles 6 and 8 bis of the Tax Code.

### Key Takeaway

Courts have established that:
- SII **cannot arbitrarily block portal access** without legal basis and due process
- SII **can** restrict specific functions (like timbraje) as part of legitimate audit processes
- Taxpayers have a **right to access** SII's digital services

This precedent is favorable for automated access: if SII cannot block legitimate taxpayer access, it strengthens the argument that credential-delegated automation (with user consent) is accessing on behalf of an authorized user.

---

## 7. Regulatory Framework: CMF and Fintech

### Ley Fintech 21.521 (2023)

- Establishes framework for fintech service providers
- Creates the **Sistema de Finanzas Abiertas (SFA)** — Chile's open finance system
- Regulates exchange of financial customer information between providers
- Requires explicit customer consent for data sharing
- CMF is the supervisory authority

### Open Finance Regulation (CMF, 2025)

- Three-level regulatory structure for the SFA
- Covers: general terms, customer identification data, transaction history
- Implementation timeline: 5 years total, phased by institution type
- Technical API standards being developed by CMF

### Relevance to SII Data Access

- The Fintech Law does **not directly cover SII tax data** — it focuses on financial institutions regulated by CMF
- However, fintech providers must **report to SII** about accounts with high transaction volumes (50+ transfers/month)
- Open Finance creates a **precedent and framework** for consent-based data sharing that could extend to tax data in the future
- Fintechs accessing SII data do so outside the Fintech Law framework, relying instead on user consent and credential delegation

---

## 8. Best Practices for Responsible Scraping

### Rate Limiting

- Implement delays between requests (2-5 seconds minimum)
- Use exponential backoff on errors
- Limit concurrent sessions per tenant
- Respect HTTP 429 (Too Many Requests) responses
- Target off-peak hours for bulk operations (Chilean business hours: 9am-6pm CLT)

### User-Agent Identification

- Use a descriptive User-Agent string identifying the service
- Example: `emisso-sii/1.0 (+https://emisso.io/sii-integration)`
- Do not impersonate browsers or mask automated access

### Caching

- Cache static/semi-static data aggressively (company info, historical invoices)
- Use reasonable TTLs (RCV data: 1-4 hours, boletas: 15-30 minutes)
- Implement conditional requests where supported
- Store and reuse session tokens within their validity period

### Consent and Authorization

- Always obtain explicit user consent before accessing their SII data
- Clearly explain what data will be accessed and how it will be used
- Provide mechanism to revoke access
- Store credentials securely (encrypted at rest, never logged)
- Implement audit trails for all data access

### Data Handling

- Minimize data collection — only retrieve what is needed
- Encrypt data in transit (TLS) and at rest
- Implement data retention policies
- Provide data deletion on user request
- Do not share raw tax data with third parties without consent

### Operational

- Monitor for SII portal changes and adapt quickly
- Implement health checks and alerting
- Have fallback mechanisms for when scraping fails
- Maintain documentation of all data flows

---

## 9. Government Digitalization and Future API Plans

### Chile Digital Strategy 2030

- Chile rose from 32nd to 10th in the OECD Digital Government Index (2025)
- Leading Latin American country in digital government
- State Interoperability Platform (PIDE) being expanded
- Moving from SOAP to REST API architectures

### Government API Initiative

- [Kit Digital](https://kitdigital.gob.cl/) provides API construction guidelines for government services
- Push toward standardized government APIs
- Electronic notification system (CasillaUnica) launching 2026

### SII-Specific Modernization

- SII already offers some REST APIs (boletas API: `/bolcoreinternetui/api/`)
- SOAP services for DTE operations remain the primary integration path
- No announced plans for a comprehensive modern REST API for data retrieval
- The existing web portal remains the primary interface for data queries

### Implications

While Chile is modernizing government APIs broadly, SII's data retrieval capabilities are likely to remain limited in the near term. The scraping approach will remain necessary for accessing RCV, boletas, and other query data until SII expands its API surface.

---

## 10. Risk Assessment for Emisso

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| SII blocks automated access | Medium | High | Rate limiting, session management, user-agent identification |
| Civil claim from SII ToS violation | Low | Medium | User consent framework, non-commercial personal use argument |
| Criminal prosecution under Ley 21.459 | Very Low | High | Use delegated credentials only, never bypass security measures |
| Data protection violation (current) | Low | Low | Consent framework, data minimization |
| Data protection violation (post Dec 2026) | Medium | High | Full Ley 21.719 compliance program needed |
| CMF regulatory action | Low | Medium | Monitor fintech regulations, consider CMF registration if needed |

### Recommended Legal Strategy

1. **User consent model:** Always access SII with user-delegated credentials and explicit consent. Never scrape without authorization.

2. **Terms of Service:** Document that access is personal (on behalf of the user) and non-commercial (providing a service the user requested). This is the same model Fintoc and others use.

3. **Data protection compliance:** Begin preparing for Ley 21.719 now — implement privacy by design, consent management, data minimization, and breach notification capabilities.

4. **SII provider registration:** Consider registering as an electronic invoicing solution provider with SII for credibility, even though it doesn't cover data retrieval.

5. **Rate limiting and responsible access:** Implement all best practices to avoid disrupting SII services. This demonstrates good faith.

6. **Legal opinion:** Obtain a formal legal opinion from a Chilean technology/tax law firm before production launch. Key firms: Carey, Barros & Errazuriz, Prieto, CMM.

7. **Monitor regulatory changes:** The Fintech Law and Open Finance regulations may eventually extend to tax data, creating a formal framework for access.

---

## Sources

### Official Sources
- [SII Terms and Conditions](https://www.sii.cl/sobre_el_sii/terminos_sitio_web.html)
- [SII Privacy Declaration](https://www.sii.cl/sobre_el_sii/declaracion_de_privacidad.html)
- [SII Electronic Invoicing Certification](https://www.sii.cl/factura_electronica/factura_mercado/proceso_certificacion.htm)
- [SII Authorized Providers](https://www.sii.cl/factura_electronica/prov/emp_prov.htm)
- [Ley 19.628 - Data Protection](https://www.bcn.cl/leychile/navegar?idNorma=141599)
- [Ley 21.096 - Constitutional Data Protection](https://www.bcn.cl/leychile/navegar?idNorma=1119730)
- [Ley 21.459 - Computer Crimes](https://www.bcn.cl/leychile/navegar?idNorma=1177743)
- [Ley 21.521 - Fintech Law](https://www.bcn.cl/leychile/navegar?idNorma=1187323)
- [Ley 21.719 - New Data Protection](https://www.bcn.cl/leychile/navegar?idNorma=1209272)

### Court Decisions
- Corte Suprema Rol 15245-2019 (web scraping of Judicial Branch website)
- Corte Suprema April 2025 (SII portal blocking declared illegal)
- Corte Suprema May 2025 (SII credential blocking declared unconstitutional)

### Industry Sources
- [LibreDTE - SII certification vs authorization](https://www.libredte.cl/blog/libredte-3/sii-certifica-o-autoriza-a-los-software-de-facturacion-99)
- [Fintoc Terms and Conditions](https://fintoc.com/cl/legal/terminos-y-condiciones)
- [Fintoc Developer Docs](https://docs.fintoc.com/docs/welcome)
- [CMF Open Finance Regulation](https://www.cmfchile.cl/portal/prensa/615/w3-article-82737.html)
- [Web Scraping Legal Analysis Chile (Flunt)](https://flunt.cl/2025/03/05/web-scraping-legal-chile-empresas/)
- [Chile Digital Government Strategy 2030](https://wikiguias.digital.gob.cl/Estrategias/Estrategia-2030)
- [OECD Digital Government in Chile](https://www.oecd.org/en/publications/digital-government-in-chile_d1b72d93-en.html)

### Regulatory
- [CMF Fintech Portal](https://www.cmfchile.cl/portal/principal/613/w3-propertyvalue-43589.html)
- [Data Protection Implementation Guide](https://wikiguias.digital.gob.cl/datos-personales/guia-practica-implementacion-nueva-ley-datos-personales)
