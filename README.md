# @emisso/sii (discontinued)

> `@emisso/sii`, `@emisso/sii-api`, and `@emisso/sii-cli` are discontinued. They are no longer maintained and will receive no new versions. Existing published versions, source code, history, and the MIT license remain available.

For new integrations, use Notta's [REST API](https://notta.cl/docs/api-reference) or [MCP](https://notta.cl/docs/mcp). These services have their own interfaces and are not drop-in replacements for SDK imports or the self-hosted API.

`@emisso/registry-cl` is outside this retirement. See its [package documentation](./packages/registry/README.md). This notice adds no maintenance commitment for that package; the monorepo is not being archived.

## Historical SDK documentation

The examples and API descriptions below are retained for reference. They describe the former SDK design, not a supported or complete integration. Some functions remain unimplemented and throw `Not implemented`; these examples are not a guarantee of working end-to-end invoicing or future SII compatibility. The [roadmap](./ROADMAP.md) and SDK design/research documents under `docs/` are historical records, not planned work.

## Discontinued packages

| Package | Historical role | Existing-version installation |
|---------|-------------|---------|
| `@emisso/sii` | Core engine — auth, DTE, certificates (zero DB) | `npm install @emisso/sii` |
| `@emisso/sii-api` | Full-stack API layer (Drizzle + Effect) | `npm install @emisso/sii-api` |
| `@emisso/sii-cli` | Command-line interface | `npm install -g @emisso/sii-cli` |

## Historical examples — Engine

```bash
npm install @emisso/sii
```

### Authenticate with SII

```typescript
import { authenticate, loadCertFromFile } from "@emisso/sii";

const cert = loadCertFromFile("./cert.p12", "password");
const token = await authenticate(cert, { env: "certification" });
```

### List Invoices (RCV)

```typescript
import { authenticate, listInvoices, loadCertFromFile } from "@emisso/sii";

const cert = loadCertFromFile("./cert.p12", "password");
const token = await authenticate(cert, { env: "certification" });

const invoices = await listInvoices({
  token,
  rut: "76123456-7",
  period: { year: 2026, month: 3 },
  type: "received",
});
```

### Build and Sign a DTE

```typescript
import { buildDteXml, signDte, loadCertFromFile } from "@emisso/sii";

const cert = loadCertFromFile("./cert.p12", "password");

const xml = await buildDteXml({
  tipoDte: "33", // Factura Electrónica
  folio: 1,
  fechaEmision: "2026-03-13",
  emisor: {
    rut: "76123456-7",
    razonSocial: "Mi Empresa SpA",
    giro: "Desarrollo de Software",
    actividadEconomica: 620200,
    direccion: "Av. Providencia 1234",
    comuna: "Providencia",
  },
  receptor: {
    rut: "12345678-9",
    razonSocial: "Cliente Ejemplo Ltda.",
  },
  items: [
    { nombre: "Consultoría", cantidad: 1, precioUnitario: 100_000, montoItem: 100_000 },
  ],
  montoNeto: 100_000,
  iva: 19_000,
  montoTotal: 119_000,
});

const signedXml = await signDte(xml, cert);
```

### Submit to SII

```typescript
import { uploadDte } from "@emisso/sii";

const result = await uploadDte(signedXml, token, { env: "certification" });
console.log("Track ID:", result.trackId);
```

## Historical examples — Self-Hosted API

The retired API package was designed as a self-hosted REST layer with a certificate vault, DTE audit trail, and tenant separation. It is distinct from Notta's REST API.

```bash
npm install @emisso/sii-api
```

**1. Set environment variables:**

```bash
# .env.local
EMISSO_DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
```

**2. Run migrations:**

```bash
npx @emisso/sii-api migrate
```

**3. Mount in your Next.js app:**

```typescript
// app/api/sii/[...path]/route.ts
import { createSiiRouter } from "@emisso/sii-api/next";

export const { GET, POST, PUT, DELETE } = createSiiRouter({
  databaseUrl: process.env.EMISSO_DATABASE_URL!,
  basePath: "/api/sii",
  resolveTenantId: async (req) => {
    const session = await getSession(req); // your auth
    return session.tenantId;
  },
});
```

**4. Use the API:**

```bash
# Upload certificate
curl -X POST http://localhost:3000/api/sii/certificates \
  -F "file=@cert.p12" \
  -F "password=****" \
  -F "label=Empresa Principal"

# List received invoices
curl http://localhost:3000/api/sii/rcv/76123456-7/2026-03?type=received

# Create and submit DTE
curl -X POST http://localhost:3000/api/sii/dte \
  -H "Content-Type: application/json" \
  -d '{"type":33,"receptor":{"rut":"12345678-9","razonSocial":"Cliente SA"},"items":[...]}'
```

## DTE types in the historical schema

| Code | Document |
|------|----------|
| 33 | Factura Electrónica |
| 34 | Factura No Afecta o Exenta Electrónica |
| 39 | Boleta Electrónica |
| 41 | Boleta Exenta Electrónica |
| 46 | Factura de Compra Electrónica |
| 52 | Guía de Despacho Electrónica |
| 56 | Nota de Débito Electrónica |
| 61 | Nota de Crédito Electrónica |
| 110 | Factura de Exportación Electrónica |
| 112 | Nota de Crédito de Exportación Electrónica |

## Historical API reference

### Engine Exports (`@emisso/sii`)

| Export | Description |
|--------|-------------|
| `authenticate(cert, options)` | SOAP-based auth, returns SII token |
| `loadCertFromFile(path, password)` | Load .p12/.pfx certificate |
| `buildDteXml(document)` | Build DTE XML from structured input |
| `signDte(xml, cert)` | Sign DTE XML with certificate |
| `uploadDte(xml, token, options)` | Upload signed DTE to SII |
| `listInvoices(options)` | Fetch RCV invoice listing from SII |
| `fetchRcvResumen(options)` | Fetch RCV summary by period |
| `downloadRcvCsv(options)` | Download RCV as CSV |
| `portalLogin(rut, password)` | Web portal session login |

### API Endpoints (`@emisso/sii-api`)

```
POST   /certificates              Upload certificate (.p12)
GET    /certificates              List certificates for tenant
DELETE /certificates/:id          Remove certificate

POST   /dte                       Create DTE (draft)
POST   /dte/:id/sign              Sign DTE with certificate
POST   /dte/:id/submit            Submit to SII
GET    /dte/:id/status            Check SII status
GET    /dte                       List DTEs (with filters)

POST   /folios/upload             Upload CAF file
GET    /folios                    List folio ranges
GET    /folios/:dteType/next      Get next available folio

GET    /rcv/:rut/:period          Get invoice listing (cached)
POST   /rcv/:rut/:period/refresh  Force refresh from SII

GET    /submissions               Audit trail
GET    /submissions/:trackId      Submission detail
```

## Historical SDK configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SII_CERT_PATH` | Path to .p12/.pfx certificate | — |
| `SII_CERT_PASSWORD` | Certificate password | — |
| `SII_ENV` | `certification` or `production` | `certification` |
| `EMISSO_DATABASE_URL` | PostgreSQL connection (API only) | — |

## Historical CLI reference

```bash
npm install -g @emisso/sii-cli
```

### Commands

| Command | Description |
|---------|-------------|
| `sii auth login --cert cert.p12 --password ****` | Authenticate with SII, print token |
| `sii auth test --cert cert.p12 --password ****` | Verify token is still valid |
| `sii cert info --cert cert.p12 --password ****` | Show certificate subject, issuer, expiry |
| `sii cert verify --cert cert.p12 --password ****` | Validate .p12 certificate file |
| `sii invoices list --rut 76123456-7 --clave **** --period 2026-03` | List invoices from SII RCV |
| `sii invoices download --rut 76123456-7 --clave **** --period 2026-03 -o invoices.csv` | Download RCV as CSV |
| `sii rut validate 12345678-5` | Validate Chilean RUT |
| `sii rut format 123456785` | Format RUT with dash |
| `sii doctor` | Check system health and dependencies |

### Configuration

CLI flags take precedence over environment variables:

| Flag | Environment Variable | Description |
|------|---------------------|-------------|
| `--cert` | `SII_CERT_PATH` | Path to .p12 certificate |
| `--password` | `SII_CERT_PASSWORD` | Certificate password |
| `--env` | `SII_ENV` | `certification` or `production` |
| `--rut` | `SII_RUT` | Company RUT (for invoice commands) |
| `--clave` | `SII_CLAVE` | Clave tributaria (for portal login) |

### Output Formats

All commands support `--format table|csv|json` and `--json` shorthand. Defaults to table for TTY, CSV for pipes.

```bash
sii invoices list --rut 76123456-7 --clave **** --period 2026-03 --json
sii cert info --cert cert.p12 --password **** --format csv
```

## Development

```bash
pnpm install
pnpm build          # Build registry-cl
pnpm test           # Run registry-cl tests (watch mode)
pnpm test:run       # Run registry-cl tests (CI mode)
pnpm lint           # Typecheck registry-cl
```

The standard commands target `registry-cl` only. For historical API or CLI inspection, first build the engine with `pnpm --filter @emisso/sii build` so its workspace exports are available. Then invoke an exact package explicitly; for example:

```bash
pnpm --filter @emisso/sii build
pnpm --filter @emisso/sii-api test:run
pnpm --filter @emisso/sii-cli lint
```

Keeping these scripts available does not resume SDK maintenance or releases. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the repository's contribution scope and [SECURITY.md](./SECURITY.md) for confidential vulnerability reporting.

## License

MIT — [Emisso](https://emisso.ai)
