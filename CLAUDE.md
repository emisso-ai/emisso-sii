# @emisso/sii (discontinued)

`@emisso/sii`, `@emisso/sii-api`, and `@emisso/sii-cli` are discontinued. They receive no maintenance or new versions. Preserve published versions, source code, history, and licenses. Do not add SDK features, release changesets, or version bumps.

For new integrations, refer to Notta's [REST API](https://notta.cl/docs/api-reference) or [MCP](https://notta.cl/docs/mcp). They are not drop-in replacements for SDK imports or the self-hosted API.

`@emisso/registry-cl` is outside this retirement; do not infer a new maintenance commitment or archive the monorepo. The SDK architecture, examples, roadmap, and design documents are historical reference. They may describe incomplete APIs, including functions that throw `Not implemented`, and must not be promoted as a complete integration.

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
│   ├── api/                 @emisso/sii-api — Effect TS, Drizzle, PostgreSQL
│   │   ├── src/
│   │   │   ├── core/effect/     AppError, http-response, repo-helpers
│   │   │   ├── db/schema/       Drizzle tables (certificates, dte, folios, rcv)
│   │   │   ├── repos/           Data access layer
│   │   │   ├── services/        Business logic
│   │   │   ├── handlers/        HTTP handlers + router
│   │   │   ├── adapters/        Next.js adapter
│   │   │   └── validation/      Zod request schemas
│   │   └── tests/helpers/       PGLite test setup
│   ├── cli/                 @emisso/sii-cli — discontinued CLI
│   └── registry/            @emisso/registry-cl — outside this retirement
```

## Commands

```bash
pnpm build        # Build registry-cl
pnpm test         # Run registry-cl tests (watch mode)
pnpm test:run     # Run registry-cl tests (CI mode)
pnpm lint         # Typecheck registry-cl
```

Before running historical API or CLI scripts, build their workspace dependency with `pnpm --filter @emisso/sii build`.

For historical SDK inspection, use an exact package filter: `pnpm --filter @emisso/sii build`, `pnpm --filter @emisso/sii-api test:run`, or `pnpm --filter @emisso/sii-cli lint`. These scripts do not resume SDK maintenance or releases.

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
