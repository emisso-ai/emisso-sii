# @emisso/sii (discontinued)

> `@emisso/sii`, `@emisso/sii-api`, and `@emisso/sii-cli` are discontinued. They receive no maintenance or new versions. Preserve published versions, source code, history, and licenses.

For new integrations, refer to Notta's [REST API](https://notta.cl/docs/api-reference) or [MCP](https://notta.cl/docs/mcp). They have separate interfaces and are not drop-in replacements for SDK imports or the self-hosted API.

`@emisso/registry-cl` is outside this retirement; do not infer a new maintenance commitment or archive the monorepo. Do not add SDK features, release changesets, or version bumps. Historical SDK docs and examples can describe incomplete APIs, including functions that throw `Not implemented`; do not present them as complete or recommended integrations.

## Historical SDK overview

The retained SDK design covers certificate authentication, electronic document (DTE) processing, and RCV invoice access. The API package contains a self-hosted REST layer using PostgreSQL. This describes the historical code organization, not a guarantee that each operation is implemented or compatible with the current SII.

## Architecture

Monorepo packages:

- **`packages/engine`** (`@emisso/sii`) — Pure SDK. Auth, DTE, RCV, certificates. Zero database dependency. Dependencies: axios, fast-xml-parser, node-forge, zod.
- **`packages/api`** (`@emisso/sii-api`) — REST API layer. Drizzle ORM + Effect TS + PostgreSQL. Next.js adapter included.
- **`packages/cli`** (`@emisso/sii-cli`) — Discontinued command-line interface.
- **`packages/registry`** (`@emisso/registry-cl`) — Company registry, outside this retirement.

## Historical SDK example

Retained for reference only; this is not a supported integration guide.

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
pnpm build                # Build registry-cl
pnpm test                 # Run registry-cl tests (watch mode)
pnpm test:run             # Run registry-cl tests (CI mode)
pnpm lint                 # Typecheck registry-cl
```

Before running historical API or CLI scripts, build their workspace dependency with `pnpm --filter @emisso/sii build`.

For historical SDK inspection, use an exact package filter: `pnpm --filter @emisso/sii build`, `pnpm --filter @emisso/sii-api test:run`, or `pnpm --filter @emisso/sii-cli lint`. These scripts do not resume SDK maintenance or releases.

## Code Style

- TypeScript strict mode, ESM-first (CJS compat via tsup)
- Zod for all external data validation
- Engine is pure — no database, no side effects beyond HTTP calls to SII
- API uses Effect TS layers: Repo → Service → Handler
- Tests use vitest; API tests use PGLite for real PostgreSQL
- Conventional Commits for git messages
