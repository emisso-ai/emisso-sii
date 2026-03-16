# @emisso/sii

TypeScript SDK for Chile's SII (Servicio de Impuestos Internos) — electronic invoicing (DTE), digital certificate authentication, folio management (CAF), RCV invoice listing, and document status queries. First open-source TypeScript library covering both DTE emission and portal data reading for Chilean tax integration.

## Structure

```
emisso-sii/
├── packages/
│   ├── engine/              @emisso/sii — pure SDK, zero DB
│   │   ├── src/
│   │   │   ├── types.ts         Zod schemas + interfaces (DTE types, RCV, certs)
│   │   │   ├── utils.ts         RUT validation, environment helpers
│   │   │   ├── cert/            Certificate loading (.p12/.pfx via node-forge)
│   │   │   ├── http/            SII HTTP client (axios + cookie persistence)
│   │   │   ├── auth/            SOAP auth (getSeed → signSeed → getToken)
│   │   │   ├── dte/             DTE XML building and signing (XML-DSIG)
│   │   │   ├── folios/          CAF folio range management
│   │   │   ├── recepcion/       DTE upload to SII
│   │   │   ├── estado/          DTE status queries
│   │   │   ├── portal/          Web portal login + session management
│   │   │   └── rcv/             RCV API (summaries, detail, CSV download)
│   │   └── tests/
│   └── api/                 @emisso/sii-api — Effect TS, Drizzle, PostgreSQL
│       ├── src/
│       │   ├── core/effect/     AppError, http-response, repo-helpers
│       │   ├── db/schema/       Drizzle tables (certificates, dte, folios, rcv)
│       │   ├── repos/           Data access layer
│       │   ├── services/        Business logic
│       │   ├── handlers/        HTTP handlers + router
│       │   ├── adapters/        Next.js adapter
│       │   └── validation/      Zod request schemas
│       └── tests/helpers/       PGLite test setup
```

## Commands

```bash
pnpm build        # Build all packages (tsup)
pnpm test:run     # Run all tests (CI mode)
pnpm lint         # Typecheck all packages (tsc --noEmit)
```

## Code Patterns

- **Engine:** Pure TypeScript, zero I/O beyond HTTP to SII, zod + axios + node-forge
- **API:** Effect TS layers (Repo → Service → Handler), Data.TaggedError
- **Auth:** SOAP XML with RSA-SHA1 signing (getSeed → signSeed → getToken)
- **DTE:** XML generation via fast-xml-parser, XML-DSIG signing via node-forge
- **Tests:** vitest, PGLite for API integration tests
- **Build:** tsup dual CJS+ESM with .d.ts

## Key Invariants

- SII limits concurrent sessions per RUT — always call `portalLogout()` after portal operations
- Certification env (`www4c.sii.cl`) for testing, production (`www4.sii.cl`) for live
- RCV is production-only — certification env exists but RCV endpoints only work in production
- Certificate passwords are never logged or persisted in plain text
- All XML must be UTF-8 encoded with proper namespace declarations
- DTE types are numeric strings: "33", "34", "39", "41", "46", "52", "56", "61", "110", "112"
