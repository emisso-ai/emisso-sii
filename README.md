# @emisso/sii

TypeScript SDK for Chile's SII (Servicio de Impuestos Internos) — electronic invoicing (DTE), certificate authentication, folio management, and invoice listing (RCV).

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| `@emisso/sii` | Core engine — auth, DTE, certificates (zero DB) | `npm install @emisso/sii` |
| `@emisso/sii-api` | Full-stack API layer (Drizzle + Effect) | `npm install @emisso/sii-api` |

## Quick Start — Engine

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

## Quick Start — Self-Hosted API

For teams that need a REST API with certificate vault, DTE audit trail, and multi-tenant.

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

## Supported DTE Types

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

## API Reference

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

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SII_CERT_PATH` | Path to .p12/.pfx certificate | — |
| `SII_CERT_PASSWORD` | Certificate password | — |
| `SII_ENV` | `certification` or `production` | `certification` |
| `EMISSO_DATABASE_URL` | PostgreSQL connection (API only) | — |

## Development

```bash
pnpm install
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm lint           # Typecheck all packages
```

## License

MIT — [Emisso](https://emisso.ai)
