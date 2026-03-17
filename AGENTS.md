# @emisso/sii

> TypeScript SDK for Chile's SII (Servicio de Impuestos Internos) — electronic invoicing (DTE), certificate authentication, folio management, and invoice listing (RCV).

## Overview

@emisso/sii lets TypeScript and Node.js developers interact with Chile's tax authority (SII) programmatically. It handles SOAP-based authentication with .p12 digital certificates, builds and signs XML electronic documents (DTE), submits them to SII, and reads issued/received invoices via the RCV portal. An optional API package adds a self-hosted REST layer with PostgreSQL persistence, certificate vault, and multi-tenant support.

## Architecture

Monorepo with two packages:

- **`packages/engine`** (`@emisso/sii`) — Pure SDK. Auth, DTE, RCV, certificates. Zero database dependency. Dependencies: axios, fast-xml-parser, node-forge, zod.
- **`packages/api`** (`@emisso/sii-api`) — REST API layer. Drizzle ORM + Effect TS + PostgreSQL. Next.js adapter included.

## Getting Started

```bash
npm install @emisso/sii
```

```typescript
import { authenticate, loadCertFromFile, listInvoices } from "@emisso/sii";

const cert = loadCertFromFile("./cert.p12", "password");
const token = await authenticate(cert, { env: "certification" });
const invoices = await listInvoices({
  token,
  rut: "76123456-7",
  period: { year: 2026, month: 3 },
  type: "received",
});
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/engine/src/index.ts` | Public API — all engine exports |
| `packages/engine/src/auth/` | SOAP authentication (seed, sign, token) |
| `packages/engine/src/dte/` | DTE XML building and signing |
| `packages/engine/src/rcv/` | RCV invoice listing and CSV download |
| `packages/engine/src/cert/` | Certificate loading (.p12/.pfx) |
| `packages/engine/src/portal/` | Web portal login and session management |
| `packages/engine/src/types.ts` | All Zod schemas and TypeScript types |
| `packages/api/src/index.ts` | API package exports |
| `packages/api/src/adapters/next.ts` | Next.js App Router adapter |
| `packages/api/src/db/schema/` | Drizzle database schema |

## Development

```bash
pnpm install              # Install dependencies
pnpm build                # Build all packages (tsup)
pnpm test                 # Run tests (vitest, watch mode)
pnpm test:run             # Run tests (CI mode)
pnpm lint                 # Typecheck (tsc --noEmit)
```

## Code Style

- TypeScript strict mode, ESM-first (CJS compat via tsup)
- Zod for all external data validation
- Engine is pure — no database, no side effects beyond HTTP calls to SII
- API uses Effect TS layers: Repo → Service → Handler
- Tests use vitest; API tests use PGLite for real PostgreSQL
- Conventional Commits for git messages
