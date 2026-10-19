# @emisso/sii (discontinued) — Copilot Instructions

`@emisso/sii`, `@emisso/sii-api`, and `@emisso/sii-cli` are discontinued. Preserve their published versions, source, history, and licenses; do not add SDK features, fixes, release changesets, or version bumps. Their architecture and examples below are historical and may contain unimplemented functions.

For new Notta integrations, use https://notta.cl/docs/api-reference or https://notta.cl/docs/mcp. These are service interfaces, not drop-in SDK replacements. `@emisso/registry-cl` is outside this retirement; do not archive the monorepo or infer a new maintenance commitment.

## Monorepo Structure

- `packages/engine/` — `@emisso/sii`: Pure SDK, no database. Auth, DTE, RCV, certificates.
- `packages/api/` — `@emisso/sii-api`: REST API with Drizzle ORM + Effect TS + PostgreSQL.
- `packages/cli/` — `@emisso/sii-cli`: Discontinued CLI.
- `packages/registry/` — `@emisso/registry-cl`: Outside this retirement.

## Code Style

- TypeScript strict mode, ESM-first (CJS compat via tsup)
- Zod for all external data validation
- Engine has zero side effects beyond HTTP calls to SII
- API uses Effect TS layers: Repo → Service → Handler
- Tests: vitest; API integration tests use PGLite
- Conventional Commits

## Testing

```bash
pnpm test:run     # registry-cl only, CI mode
pnpm test         # registry-cl only, watch mode
```

## Key Patterns

- Certificate loading always via `loadCertFromFile()` — never raw file reads
- SII auth is SOAP-based: getSeed → signSeed (RSA-SHA1) → getToken
- DTE XML uses fast-xml-parser for generation, node-forge for XML-DSIG signing
- RCV data comes from SII's Angular SPA APIs (reverse-engineered endpoints)
- All DTE types are numeric strings: "33", "34", "39", etc.
