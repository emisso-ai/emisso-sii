# @emisso/sii — Copilot Instructions

TypeScript SDK for Chile's SII (Servicio de Impuestos Internos) — electronic invoicing, certificate auth, and invoice listing.

## Monorepo Structure

- `packages/engine/` — `@emisso/sii`: Pure SDK, no database. Auth, DTE, RCV, certificates.
- `packages/api/` — `@emisso/sii-api`: REST API with Drizzle ORM + Effect TS + PostgreSQL.

## Code Style

- TypeScript strict mode, ESM-first (CJS compat via tsup)
- Zod for all external data validation
- Engine has zero side effects beyond HTTP calls to SII
- API uses Effect TS layers: Repo → Service → Handler
- Tests: vitest; API integration tests use PGLite
- Conventional Commits: `feat(engine): add folio validation`

## Testing

```bash
pnpm test:run     # CI mode
pnpm test         # Watch mode
```

## Key Patterns

- Certificate loading always via `loadCertFromFile()` — never raw file reads
- SII auth is SOAP-based: getSeed → signSeed (RSA-SHA1) → getToken
- DTE XML uses fast-xml-parser for generation, node-forge for XML-DSIG signing
- RCV data comes from SII's Angular SPA APIs (reverse-engineered endpoints)
- All DTE types are numeric strings: "33", "34", "39", etc.
