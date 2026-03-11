# @emisso/sii

TypeScript SDK for Chile's SII (Servicio de Impuestos Internos) — electronic invoicing, tax documents, and folio management.

## Install

```bash
npm install @emisso/sii
```

## Features

- **Auth** — Certificate-based authentication with SII web services
- **DTE** — Build, sign, and upload electronic tax documents (Factura, Boleta, Nota de Crédito, etc.)
- **Folios** — Parse and manage CAF (folio authorization) files
- **Recepción** — Send acceptance/rejection responses for received DTEs
- **Estado** — Query document and upload status from SII

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

## Quick Start

```bash
cp .env.example .env
# Edit .env with your certificate path and password
```

```typescript
import { authenticate, buildDteXml, signDte, uploadDte, loadConfigFromEnv } from "@emisso/sii";
import type { DteDocument } from "@emisso/sii";

const config = loadConfigFromEnv();
const token = await authenticate(config);

const document: DteDocument = {
  tipoDte: "33",
  folio: 1,
  fechaEmision: "2026-03-11",
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
    {
      nombre: "Servicio de Consultoría",
      cantidad: 1,
      precioUnitario: 100000,
      montoItem: 100000,
    },
  ],
  montoNeto: 100000,
  iva: 19000,
  montoTotal: 119000,
};

const xml = await buildDteXml(document);
const signed = await signDte(xml, config.certPath, config.certPassword);
const result = await uploadDte(signed, token, config);

console.log("Track ID:", result.trackId);
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SII_CERT_PATH` | Path to .p12/.pfx certificate | — |
| `SII_CERT_PASSWORD` | Certificate password | — |
| `SII_ENV` | `certification` or `production` | `certification` |

## Development

```bash
npm install
npm run build    # Build CJS + ESM
npm run test     # Run tests
npm run lint     # Type check
```

## License

MIT — [Emisso](https://emisso.ai)
