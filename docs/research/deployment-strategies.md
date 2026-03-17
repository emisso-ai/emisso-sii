# Deployment Strategies for SII Scraping Service

Research into how to deploy a headless-browser-based scraping service that interacts with Chile's SII (Servicio de Impuestos Internos) portal. Covers serverless, dedicated server, and scraping-as-a-service options.

## Context & Requirements

- **Target site:** sii.cl (Chilean government tax portal)
- **Browser automation:** Playwright or Puppeteer (SII requires JavaScript rendering)
- **Authentication:** .p12 digital certificates for SII login
- **Latency sensitivity:** SII pages can be slow (5-30s response times)
- **Scale range:** 10 to 1,000+ requests/day depending on customer base
- **Data freshness:** Tax data updates monthly (RCV) or daily (boletas)

---

## 1. Serverless Options

### 1.1 Vercel Functions

| Attribute | Detail |
|---|---|
| Max function size | 250 MB uncompressed |
| Max execution time | 60s (Hobby), 300s (Pro with Fluid Compute), 800s (Pro extended) |
| Cold start | ~2-5s |
| Chromium compatibility | Possible with `@sparticuz/chromium` but tight on size limits |

**Verdict: Not recommended.** Chromium binary alone is ~280 MB uncompressed, which pushes against the 250 MB limit. While workarounds exist using `@sparticuz/chromium` (compressed to ~50 MB), the combination of function size constraints and SII's slow response times makes this fragile. Execution time limits on Hobby (60s) are too short for SII interactions that can take 10-30s per page.

### 1.2 Supabase Edge Functions

| Attribute | Detail |
|---|---|
| Runtime | Deno (V8 isolate) |
| Max CPU time | 2 seconds per request |
| Idle timeout | 150 seconds |
| Browser support | Not possible |

**Verdict: Not viable.** Supabase Edge Functions run in Deno V8 isolates with no filesystem access and strict 2-second CPU time limits. Launching a headless browser is not possible in this environment. Edge Functions are designed for lightweight API logic, not browser automation.

### 1.3 AWS Lambda with Chromium Layers

| Attribute | Detail |
|---|---|
| Max function size | 250 MB (layers) or 10 GB (container images) |
| Max execution time | 15 minutes |
| Cold start | ~5s (layer), ~10-40s (container with full Chromium) |
| Memory | Up to 10 GB |
| Chromium support | Excellent via `@sparticuz/chromium` or Docker images |

**Verdict: Strong option.** AWS Lambda is the most mature serverless platform for headless browsers. Two deployment approaches:

1. **Lambda Layers** with `@sparticuz/chromium`: Compressed Chromium (~50 MB) as a layer. Cold starts ~5s. Fits within 250 MB limit. Works well for lightweight scraping.

2. **Container Images** with official Playwright Docker base: Up to 10 GB image size. Full Chromium with all dependencies. Cold starts longer (~10-40s) but more reliable. Better for complex SII interactions.

**Key considerations:**
- 15-minute execution limit is more than enough for SII interactions
- AWS Lambda now bills for INIT phase (since Aug 2025), increasing costs for cold-start-heavy workloads by 10-50%
- Santiago region (`sa-east-1`) available for low latency to sii.cl
- Secrets Manager for .p12 certificate storage ($0.40/secret/month + $0.05 per 10K API calls)

**Cost estimate (sa-east-1):**
- 10 req/day: ~$1-2/month (with ARM, 1 GB memory, ~30s avg execution)
- 100 req/day: ~$10-15/month
- 1,000 req/day: ~$80-120/month (consider provisioned concurrency to reduce cold starts)

### 1.4 Google Cloud Functions

| Attribute | Detail |
|---|---|
| Max function size | 100 MB (source) / 500 MB (deployed) |
| Max execution time | 540s (gen2) |
| Cold start | ~5-10s |
| Chromium support | Yes, via `@sparticuz/chromium` or Cloud Run containers |

**Verdict: Viable but AWS Lambda is more mature for this use case.** Google Cloud Functions v2 (backed by Cloud Run) supports Puppeteer/Playwright with `@sparticuz/chromium`. The 100 MB source limit is tighter than AWS. Cloud Run (full container service) is a better GCP option for browser automation, with no size limits and up to 60-minute timeouts.

**Note:** No Santiago/Chile region. Closest is `southamerica-east1` (Sao Paulo, Brazil), adding ~30-50ms latency compared to AWS `sa-east-1`.

### 1.5 Cloudflare Workers Browser Rendering API

| Attribute | Detail |
|---|---|
| Browser | Managed Chromium on Cloudflare edge |
| Included (Workers Paid) | 10 hours/month browser time, 10 concurrent browsers |
| Overage pricing | $0.09/browser-hour + $2.00/concurrent browser |
| API | Puppeteer (forked @cloudflare/puppeteer v1.0.4) and Playwright |
| Cold start | Very low (managed browser pool) |

**Verdict: Interesting but risky for SII use case.** Cloudflare manages the browser infrastructure entirely, eliminating cold start and size concerns. However:

- No South American edge locations with browser rendering (latency to sii.cl uncertain)
- Limited to Cloudflare's Puppeteer fork; SII-specific authentication flows (.p12 certificates) may require custom handling not supported in Workers environment
- Workers have limited filesystem access (no writing .p12 files to disk)
- Session management across requests is possible with Durable Objects

**Cost estimate:**
- 10 req/day (~5 min browser time/day): ~$5/month (within free tier of 10 hrs)
- 100 req/day (~50 min/day): ~$5 + ~$1.35/month overage
- 1,000 req/day (~8 hrs/day): ~$5 + ~$17/month overage

---

## 2. Dedicated Server Options

### 2.1 Fly.io (Recommended for dedicated)

| Attribute | Detail |
|---|---|
| Deployment | Docker containers |
| South America region | `gru` (Guarulhos/Sao Paulo, Brazil) |
| Pricing | Usage-based, ~$0.0035/hr for shared-cpu-1x (256 MB) |
| Egress (South America) | $0.04/GB |
| Playwright support | Full, via Docker images |

**Verdict: Strong option for dedicated deployment.** Fly.io supports Docker natively, making Playwright deployment straightforward using the official `mcr.microsoft.com/playwright` Docker image. Key advantages:

- South American region (Sao Paulo) for low latency to sii.cl (~20-40ms)
- Always-on or scale-to-zero with Fly Machines
- Full filesystem access for .p12 certificate handling
- No cold start concerns with always-on VMs
- Simple deployment with `fly deploy`

**Cost estimate:**
- shared-cpu-1x, 512 MB (always-on): ~$5-7/month
- shared-cpu-2x, 1 GB (for heavier loads): ~$12-15/month
- performance-1x, 2 GB (production): ~$30/month

### 2.2 Railway

| Attribute | Detail |
|---|---|
| Deployment | Docker or Nixpacks |
| Pricing | Usage-based, ~$0.016/CPU-hour |
| Hobby plan | $5/month with $5 free usage |
| Playwright support | Full, via Docker |

**Verdict: Good alternative to Fly.io.** Railway offers simpler DX with automatic Docker detection. However, no South American regions, so latency to sii.cl will be higher (100-200ms from US regions). Best for development/staging.

**Cost estimate:**
- Light usage (10 req/day): ~$5-7/month
- Medium usage (100 req/day): ~$10-15/month
- Heavy usage (1,000 req/day): ~$25-40/month

### 2.3 Render

| Attribute | Detail |
|---|---|
| Deployment | Docker |
| Pricing | Starts at $7/month for Starter instances |
| Bandwidth | $30/100 GB |
| Playwright support | Full, via Docker |

**Verdict: Viable but more expensive for bandwidth.** Render supports Docker deployments but charges more for bandwidth and has no South American regions. Better suited for web apps than background scraping services.

### 2.4 Self-hosted VPS (DigitalOcean, Hetzner, Vultr)

**Verdict: Most cost-effective at scale.** A $5-10/month VPS in Sao Paulo (DigitalOcean, Vultr) or a Hetzner server provides full control, lowest latency, and best price/performance. Requires more operational overhead (updates, monitoring, restarts).

**Cost estimate:**
- DigitalOcean Droplet (1 vCPU, 1 GB): $6/month
- Vultr Cloud Compute (1 vCPU, 1 GB): $5/month
- Hetzner CX22 (2 vCPU, 4 GB): ~$4.50/month (EU only, no South America)

---

## 3. Scraping-as-a-Service

### 3.1 Browserless.io

| Attribute | Detail |
|---|---|
| Pricing model | Unit-based (1 unit = 30s of browser time) |
| Free tier | 1,000 units/month |
| Starter plan | $50/month |
| Scale plan | $200/month |
| Self-hosted | Open source, Docker-based |

**Verdict: Good hybrid option.** Browserless can be used as a managed API or self-hosted via Docker. The self-hosted option is particularly attractive: run browserless in a Docker container on Fly.io or a VPS, giving you the browser management benefits without per-unit costs.

**Considerations for SII:**
- Custom authentication flows (.p12 certificates) require careful integration
- Self-hosted mode gives full control over certificate handling
- Connection pooling and queue management built-in

### 3.2 Apify

| Attribute | Detail |
|---|---|
| Pricing model | Platform credits |
| Free tier | Small monthly credit allowance |
| Paid plans | From $49/month (Personal) |
| Infrastructure | Managed actors (containers) |

**Verdict: Overkill for our use case.** Apify is a full scraping platform with a marketplace of pre-built "Actors." Best for e-commerce scraping or social media monitoring. The SII scraping logic is too custom and domain-specific to benefit from Apify's platform features. The credit-based pricing adds unpredictability.

### 3.3 ScrapingBee

| Attribute | Detail |
|---|---|
| Pricing model | API credits |
| Plans | $49 (Freelance), $99 (Startup), $249 (Business) |
| JavaScript rendering | Business plan only ($249+) |
| Proxy rotation | Built-in |

**Verdict: Not recommended.** JavaScript rendering (required for SII) only available on the $249/month Business plan. The API-based approach doesn't support .p12 certificate authentication flows. Designed for simpler scraping scenarios, not authenticated government portals.

### 3.4 ScrapFly

| Attribute | Detail |
|---|---|
| Pricing model | Credit-based (1-25 credits per request) |
| Starting price | $30/month for 200K requests |
| Success rate | 98.8% average |
| Features | Headless browsers, anti-bot bypass, AI extraction |

**Verdict: Not recommended for SII.** Similar limitations to ScrapingBee. Credit-based pricing with variable per-request costs (1-25 credits). Does not support custom .p12 certificate authentication. Better suited for public web scraping.

---

## 4. Credential & Certificate Security

### .p12 Certificate Handling by Platform

| Platform | Certificate Storage | Security Level |
|---|---|---|
| AWS Lambda | Secrets Manager or KMS-encrypted env vars | High (IAM + encryption at rest) |
| Fly.io | Fly Secrets (encrypted env vars) or mounted volumes | Medium-High |
| Railway | Environment variables (encrypted) | Medium |
| Cloudflare Workers | Workers Secrets (encrypted) | Medium (no filesystem) |
| Self-hosted VPS | Filesystem with restricted permissions | Depends on setup |
| Scraping services | Not supported for .p12 | Low/Not applicable |

### Recommended Approach

1. **Store .p12 certificates as base64-encoded secrets** in the platform's secrets manager
2. **Decode at runtime** into a temporary buffer (never write to permanent filesystem)
3. **Use node-forge or native crypto** to extract the private key and certificate from the .p12 in memory
4. **For AWS Lambda**: Use Secrets Manager with automatic rotation + KMS encryption. Cache the decoded certificate in the Lambda execution context for warm invocations
5. **For Fly.io/VPS**: Store as encrypted environment variables. The `emisso-sii` SDK already handles .p12 parsing with node-forge

### Key Security Considerations

- Never log certificate contents or passphrases
- Rotate certificates when they expire (typically annually for SII certificates)
- Use per-tenant certificate isolation (each customer's .p12 stored separately)
- Implement access controls so only the scraping service can read certificates
- Consider a dedicated secrets management service (HashiCorp Vault, AWS Secrets Manager) for multi-tenant deployments

---

## 5. Caching Strategy

### Data Freshness Requirements

| Data Type | Update Frequency | Cache TTL | Notes |
|---|---|---|---|
| RCV (Registro de Compras y Ventas) | Monthly (by SII schedule) | 24 hours | Only changes after monthly SII processing |
| Boletas Electronicas | Daily | 1-4 hours | New boletas appear throughout the day |
| DTE Status | On-demand | 15-60 minutes | Status changes (aceptado, rechazado) |
| Company Tax Info | Rarely | 7 days | Razon social, giro, address |
| Folio Availability | On-demand | 5 minutes | Changes with each document issued |

### Caching Architecture

```
Request -> Check Cache (Redis/Supabase) -> Cache Hit? -> Return cached data
                                        -> Cache Miss? -> Queue scraping job
                                                       -> Scrape SII
                                                       -> Store in cache
                                                       -> Return fresh data
```

### Recommended Implementation

1. **Primary cache:** Supabase (PostgreSQL) for structured tax data with `last_scraped_at` timestamps
2. **Rate limiting cache:** Redis (Upstash) for scraping rate limits and job deduplication
3. **Background refresh:** Cron jobs to refresh data before cache expires (avoid user-facing latency)
4. **Staleness tolerance:** Return cached data immediately + trigger background refresh if stale
5. **Per-tenant scheduling:** Each tenant's data refreshed on its own schedule based on their plan tier

---

## 6. Recommendation Summary

### For MVP / Early Stage (< 100 req/day)

**Primary: Fly.io with Docker**
- Deploy Playwright in a Docker container on Fly.io `gru` region (Sao Paulo)
- Always-on shared-cpu-1x (512 MB) at ~$5-7/month
- Full .p12 certificate support via Fly Secrets
- Simple deployment, low latency to sii.cl
- Scale up VM size as needed

**Why not serverless?** SII's slow page loads and .p12 certificate requirements make serverless environments fragile. The cost difference at low volumes is negligible ($5-7/month for Fly.io vs $1-5/month for Lambda), and the operational simplicity is worth it.

### For Scale (100-1,000 req/day)

**Primary: AWS Lambda (container images) in sa-east-1**
- Playwright in Docker container image (up to 10 GB)
- 15-minute execution timeout
- Auto-scaling with no server management
- Secrets Manager for .p12 certificates
- Cost-effective at $15-120/month depending on volume

**Secondary: Fly.io with autoscaling Machines**
- Scale from 1 to N machines based on queue depth
- More predictable costs than Lambda at high volume
- Better cold-start performance (always-warm option)

### For Enterprise (1,000+ req/day)

**Primary: Dedicated VPS cluster + self-hosted Browserless**
- 2-3 VPS instances in Sao Paulo with Browserless Docker
- Connection pooling, queue management, browser recycling
- Most cost-effective at ~$15-30/month total
- Full control over infrastructure and certificates

### What to Avoid

- **Supabase Edge Functions**: Cannot run browsers
- **Vercel Functions**: Size limits too restrictive for Chromium
- **ScrapingBee/ScrapFly**: Cannot handle .p12 certificate auth
- **Apify**: Overkill and expensive for this specific use case
- **Cloudflare Workers Browser Rendering**: Promising but .p12 handling is a blocker and no South American presence confirmed

---

## Sources

- [Sparticuz/chromium - GitHub](https://github.com/Sparticuz/chromium)
- [Playwright on Vercel - ZenRows](https://www.zenrows.com/blog/playwright-vercel)
- [Cloudflare Browser Rendering Pricing](https://developers.cloudflare.com/browser-rendering/pricing/)
- [Cloudflare Browser Rendering Docs](https://developers.cloudflare.com/browser-rendering/)
- [Fly.io Pricing](https://fly.io/pricing/)
- [Fly.io Playwright Deployment](https://stephenhaney.com/2024/playwright-on-fly-io-with-bun/)
- [AWS Lambda Cold Starts 2025](https://edgedelta.com/company/knowledge-center/aws-lambda-cold-start-cost)
- [Browserless.io Pricing](https://www.browserless.io/pricing)
- [Supabase Edge Functions Limits](https://supabase.com/docs/guides/functions/limits)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [AWS Secrets Manager for Certificates](https://aws.amazon.com/blogs/security/use-aws-secrets-manager-to-simplify-the-management-of-private-certificates/)
- [Google Cloud Run Browser Automation](https://docs.cloud.google.com/run/docs/browser-automation)
- [ScrapFly Pricing](https://scrapfly.io/pricing)
- [Railway vs Fly.io Comparison](https://docs.railway.com/platform/compare-to-fly)
