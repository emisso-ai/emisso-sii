# Scraping Frameworks Comparison for SII Use Case

> Research date: 2026-03-12

## Context

This document evaluates scraping and automation frameworks for interacting with Chile's SII (Servicio de Impuestos Internos) portal at sii.cl. The SII portal exposes tax data through a mix of legacy SOAP/XML web services, newer REST APIs, and Angular-based web UIs that require browser-based authentication.

## SII Portal Technical Profile

### Authentication Flow

SII uses a two-phase authentication model:

1. **Seed/Token (Semilla/Token) flow for APIs:** Request a seed from `CrSeed.jws` (getSeed), sign it with a .p12 digital certificate (XML-DSIG), then exchange the signed seed for a token via `GetTokenFromSeed.jws`. The token is then used as a session cookie for subsequent requests.

2. **Web portal login:** RUT + Clave Tributaria (tax key) or digital certificate (.p12) authentication via browser. Sets `TOKEN` session cookie. The newer Angular UIs (registrocomprasborUI, boaborUI) rely on this session cookie.

### Portal Architecture

- **Legacy pages:** Server-rendered HTML (JSP-based), some with JavaScript dependencies
- **Newer UIs:** Angular single-page applications (e.g., RCV purchase/sales registry, boleta registry)
- **APIs:** Mix of SOAP/XML (DTE submission, authentication) and REST/JSON (newer boleta APIs at `apicert.sii.cl`)

### Anti-Bot Measures

SII does **not** currently employ:
- CAPTCHAs
- JavaScript challenges / fingerprinting
- Sophisticated WAF or bot detection

However, SII does:
- Rate-limit aggressive requests (connection resets after too many rapid requests)
- Require valid session cookies for all authenticated endpoints
- Use SSL/TLS with client certificate requirements for certain API endpoints
- Block requests without proper User-Agent headers on some endpoints

### JavaScript Rendering Requirements

- **Legacy pages:** Minimal JS — can be scraped with HTTP-only approaches after authentication
- **Angular UIs (RCV, boletas):** Require full JavaScript rendering. These UIs make XHR/fetch calls to backend APIs that could potentially be called directly if the API contracts are reverse-engineered
- **API endpoints:** No rendering needed — pure HTTP with XML or JSON payloads

---

## Framework Comparison

### 1. Playwright

**Overview:** Microsoft's browser automation library. Controls Chromium, Firefox, and WebKit. TypeScript-native.

| Criterion | Assessment |
|---|---|
| **SII compatibility** | Excellent. Native `clientCertificates` option supports .p12 via `pfxPath` + `passphrase`. Handles session cookies automatically. Works with both legacy and Angular UIs. |
| **Certificate auth (.p12)** | Built-in since v1.46. Configure via `browser.newContext({ clientCertificates: [{ origin, pfxPath, passphrase }] })`. Some edge cases reported with headless mode (issue #33563), but generally works. |
| **Session management** | Excellent. Auto-wait for network idle, cookie persistence via browser contexts, `storageState` for session save/restore. |
| **Reliability** | Very high. Auto-wait eliminates most flakiness. Network interception for monitoring API calls. |
| **Resource usage** | Heavy. Chromium: ~150-300 MB RAM per instance. CPU-intensive. Cold start ~2-5s. |
| **Error recovery** | Good. Built-in retry via test runner. Manual retry logic needed for scraping use. Tracing and screenshots for debugging. |
| **Serverless feasibility** | Challenging. Chromium binary is ~280 MB uncompressed, exceeding most function size limits. Requires `@sparticuz/chromium` (~50 MB compressed) for Lambda/Vercel. Vercel has 250 MB unzipped limit. Works on AWS Lambda with container images or layers. Not feasible on Supabase Edge Functions (Deno, no browser). |
| **TypeScript support** | Excellent. First-class TypeScript, full type definitions, developed in TypeScript. |
| **Community** | ~64k GitHub stars. Active development by Microsoft. Monthly releases. |
| **npm install size** | `playwright-core`: ~8 MB. Browser binaries: ~150 MB each (downloaded separately). |

**Pros:**
- Best .p12 certificate support among browser automation tools
- Auto-wait eliminates timing issues with Angular SPAs
- Network interception allows capturing API calls made by Angular UIs
- Can record sessions and generate scripts
- `storageState` enables session persistence across runs

**Cons:**
- Heaviest resource footprint
- Serverless deployment requires significant workarounds
- Overkill for endpoints that don't need JS rendering

---

### 2. Puppeteer

**Overview:** Google's Chrome DevTools Protocol library. Chrome/Chromium only. JavaScript/TypeScript.

| Criterion | Assessment |
|---|---|
| **SII compatibility** | Good. Can handle the web portal flow. Certificate auth requires workarounds. |
| **Certificate auth (.p12)** | No native support. Must use request interception + custom HTTPS agent, or launch Chrome with `--ignore-certificate-errors` flags and import cert to browser profile. Fragile. |
| **Session management** | Good. Cookie management via `page.cookies()` / `page.setCookie()`. No built-in storageState equivalent. |
| **Reliability** | Good, but less robust than Playwright. No auto-wait — requires manual `waitForSelector`/`waitForNavigation`. |
| **Resource usage** | Similar to Playwright (~150-250 MB RAM). Slightly lighter due to Chrome-only. |
| **Error recovery** | Basic. No built-in retry. Manual implementation needed. |
| **Serverless feasibility** | Same constraints as Playwright. Works with `@sparticuz/chromium` on Lambda. `puppeteer-core` + custom Chromium is the standard Lambda pattern. |
| **TypeScript support** | Good. Full type definitions. Maintained in TypeScript since v20+. |
| **Community** | ~87k GitHub stars. Maintained by Google. Slightly slower release cadence than Playwright. |
| **npm install size** | `puppeteer-core`: ~4 MB. Chromium: ~150 MB (downloaded separately). |

**Pros:**
- Lighter than Playwright (single browser engine)
- More established Lambda deployment patterns
- Large ecosystem of plugins (`puppeteer-extra` for stealth, ad blocking)

**Cons:**
- No native .p12 certificate support — deal-breaker for SII certificate auth
- Chrome-only
- Manual wait management increases flakiness with Angular UIs
- Being gradually superseded by Playwright in the ecosystem

---

### 3. HTTP-based (axios/got + tough-cookie)

**Overview:** Pure HTTP approach without a browser. Uses HTTP clients for direct API calls and HTML fetching.

| Criterion | Assessment |
|---|---|
| **SII compatibility** | Good for API endpoints (SOAP/REST). Cannot render Angular UIs. Can scrape legacy HTML pages. |
| **Certificate auth (.p12)** | Excellent. Node.js `https.Agent` natively supports PFX/P12: `new https.Agent({ pfx: fs.readFileSync('cert.p12'), passphrase: '...' })`. Works with both axios and got. |
| **Session management** | Good with `tough-cookie` or `got`'s built-in cookie jar. Manual but predictable. |
| **Reliability** | Excellent for HTTP-only targets. No browser flakiness. Deterministic behavior. |
| **Resource usage** | Minimal. ~10-30 MB RAM. Sub-second response times. No browser overhead. |
| **Error recovery** | Excellent. `axios-retry` or `got`'s built-in retry with backoff. Easy to implement circuit breakers. |
| **Serverless feasibility** | Excellent. Tiny bundle size. Works on Vercel Functions, AWS Lambda, even Supabase Edge Functions (with Deno-compatible HTTP client). |
| **TypeScript support** | Good. Both axios and got have full type definitions. |
| **Community** | axios: ~105k stars. got: ~14k stars. Mature, stable. |
| **npm install size** | axios: ~2 MB. got: ~1 MB. tough-cookie: ~200 KB. Total: ~3-5 MB. |

**Pros:**
- Best .p12/mTLS support via native Node.js HTTPS agent
- Lightest resource footprint by far
- Perfect for serverless deployment
- Fastest execution (no browser startup/rendering)
- Works for SII's SOAP APIs (seed/token auth, DTE submission)
- Works for SII's REST APIs (boleta endpoints at apicert.sii.cl)

**Cons:**
- Cannot render Angular UIs (RCV, boletas web views)
- Must reverse-engineer API contracts for Angular UI data
- HTML parsing requires Cheerio or similar
- More manual session management

---

### 4. Cheerio

**Overview:** Fast HTML parser using jQuery-like API. Pairs with HTTP clients for HTML scraping.

| Criterion | Assessment |
|---|---|
| **SII compatibility** | Good for legacy server-rendered HTML pages. Useless for Angular SPAs. |
| **Role** | Complementary — pairs with axios/got for parsing HTML responses. Not a standalone scraper. |
| **Resource usage** | Minimal. ~5 MB install. Fast parsing. |
| **TypeScript support** | Full type definitions. |
| **Community** | ~28k GitHub stars. Actively maintained. |

**Best used:** Combined with HTTP-based approach for parsing SII's legacy HTML pages (e.g., tax status pages, certificate info pages).

---

### 5. Crawlee (by Apify)

**Overview:** High-level scraping framework that wraps Playwright, Puppeteer, or Cheerio with anti-blocking, session rotation, and request queuing.

| Criterion | Assessment |
|---|---|
| **SII compatibility** | Good. Wraps Playwright/Puppeteer so inherits their capabilities. PlaywrightCrawler handles Angular UIs. CheerioCrawler handles legacy pages. |
| **Certificate auth (.p12)** | Inherits from underlying engine. With PlaywrightCrawler, can use Playwright's `clientCertificates`. |
| **Session management** | Excellent. Built-in `SessionPool` with automatic rotation, persistence, and health tracking. |
| **Reliability** | Excellent. Built-in request queue with persistence (survives crashes), automatic retries with backoff, error snapshots. |
| **Resource usage** | Same as underlying engine (Playwright/Puppeteer). Crawlee adds ~20 MB overhead. |
| **Error recovery** | Best-in-class. Automatic retries, request queue persistence to disk, failed request tracking. |
| **Serverless feasibility** | Poor for browser-based crawlers (same Chromium size issues). CheerioCrawler works in serverless. Designed more for long-running processes on Apify platform or VMs. |
| **TypeScript support** | Excellent. Written in TypeScript. Full type definitions. |
| **Community** | ~16k GitHub stars. Backed by Apify (commercial company). Active development. |
| **npm install size** | `crawlee`: ~15 MB (core). Plus browser engine dependencies. |

**Pros:**
- Unified interface across Playwright/Puppeteer/Cheerio
- Best error recovery and retry logic out of the box
- Session pool management
- Anti-fingerprinting (browser fingerprint rotation)
- Request queue persistence

**Cons:**
- Adds abstraction layer and complexity
- Serverless deployment still limited by browser binary size
- Anti-bot features (proxy rotation, fingerprinting) are overkill for SII (no anti-bot measures)
- Heavier dependency tree
- Designed for large-scale crawling; SII use case is targeted scraping

---

## Recommendation for SII

### Hybrid Approach: HTTP-first + Playwright fallback

The optimal strategy for the emisso-sii SDK is a **layered approach**:

#### Layer 1: HTTP-based (Primary) — axios + tough-cookie + cheerio

Use for:
- **SOAP API authentication** (seed/token flow with XML-DSIG signing)
- **REST API calls** (boleta APIs at apicert.sii.cl)
- **DTE submission and status queries**
- **Legacy HTML page scraping** (tax status, certificate info)
- **Any endpoint where API contracts are known**

This covers ~70-80% of SII interactions. Benefits: serverless-compatible, fast, reliable, tiny footprint.

#### Layer 2: Playwright (Fallback) — for Angular UIs

Use for:
- **RCV (Registro de Compras y Ventas)** — Angular SPA that may require browser rendering
- **Boleta registry UI** — Angular SPA
- **Any new Angular-based UI where API contracts are unknown**

Strategy: Use Playwright's network interception to **reverse-engineer the underlying API calls** made by Angular UIs, then migrate those to Layer 1. Playwright becomes a development/discovery tool rather than a production dependency.

#### Layer 3: Optional — Direct API calls to Angular backends

Once Angular UI API contracts are reverse-engineered via Playwright, call them directly with axios. The Angular UIs typically call REST APIs with the same session cookie. This eliminates the browser dependency for production use.

### Implementation Priority

```
Phase 1: HTTP-based core (axios + tough-cookie + cheerio)
  - .p12 certificate loading and mTLS
  - Seed/token authentication flow
  - SOAP API wrappers (DTE, IECV)
  - REST API wrappers (boletas)
  - Legacy HTML scraping

Phase 2: Playwright integration (optional module)
  - Browser-based auth for web portal
  - Network interception to capture Angular API contracts
  - Session cookie extraction for use with HTTP layer
  - Exported as separate package or optional dependency

Phase 3: Direct Angular backend calls
  - Replace Playwright with direct HTTP calls to Angular backends
  - Use session cookies from Phase 1 auth
  - Full serverless compatibility
```

### Package Architecture

```
@emisso/sii                    # Core - HTTP only (axios, tough-cookie, cheerio)
@emisso/sii-browser            # Optional - Playwright integration
```

This keeps the core package lightweight (~5 MB) and serverless-friendly, while offering browser automation as an opt-in for users who need Angular UI scraping or interactive session management.

---

## Comparison Summary

| Feature | Playwright | Puppeteer | HTTP (axios/got) | Cheerio | Crawlee |
|---|---|---|---|---|---|
| .p12 cert auth | Built-in | Workaround | Native (best) | N/A | Inherited |
| Angular UI rendering | Yes | Yes | No | No | Yes |
| Resource usage | Heavy (~300MB) | Heavy (~250MB) | Light (~30MB) | Minimal | Heavy |
| Serverless ready | Difficult | Difficult | Excellent | Excellent | Difficult |
| Session management | Excellent | Good | Manual (good) | N/A | Best |
| Error recovery | Good | Basic | Good (w/ libs) | N/A | Best |
| TypeScript | Excellent | Good | Good | Good | Excellent |
| npm size (core) | ~8 MB | ~4 MB | ~3 MB | ~5 MB | ~15 MB |
| SII suitability | High | Medium | High (non-SPA) | Complementary | Overkill |

---

## References

- [Playwright Client Certificates API](https://playwright.dev/docs/api/class-browsertype)
- [Playwright Client Certificate Auth Example](https://github.com/marianfoo/clientcertificate-auth-playwright)
- [Puppeteer Certificate Auth Issue #1319](https://github.com/puppeteer/puppeteer/issues/1319)
- [Axios mTLS Implementation](https://smallstep.com/hello-mtls/doc/client/axios)
- [Crawlee GitHub Repository](https://github.com/apify/crawlee)
- [@sparticuz/chromium for Serverless](https://github.com/Sparticuz/chromium)
- [Running Playwright on Vercel](https://www.zenrows.com/blog/playwright-vercel)
- [Running Playwright on AWS Lambda](https://www.browsercat.com/post/running-playwright-on-aws-lambda)
- [SII Authentication Developer Manual](https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf)
- [SII Boleta API Documentation](https://www4c.sii.cl/bolcoreinternetui/api/)
- [XML-DSIG and Chile SII](https://cryptosys.net/pki/xmldsig-ChileSII.html)
- [SII Pre IVA Scraper on Apify](https://apify.com/joan.sevenscale/sii-chile-pre-iva/api/python)
- [Playwright vs Puppeteer Comparison (Apify)](https://blog.apify.com/playwright-vs-puppeteer/)
