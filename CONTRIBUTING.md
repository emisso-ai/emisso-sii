# Contributing to @emisso/sii

`@emisso/sii`, `@emisso/sii-api`, and `@emisso/sii-cli` are discontinued and will receive no further maintenance or new versions. Existing published versions, source code, history, and the MIT license remain available. New SDK features, fixes, and release changesets are not being accepted.

For new integrations, use Notta's [REST API](https://notta.cl/docs/api-reference) or [MCP](https://notta.cl/docs/mcp). They are not drop-in replacements for the retired SDK.

`@emisso/registry-cl` is outside this retirement. This policy adds no maintenance commitment for that package, and the monorepo is not being archived.

## Getting Started

```bash
git clone https://github.com/emisso-ai/emisso-sii.git
cd emisso-sii
pnpm install
pnpm build       # registry-cl only
pnpm test:run    # registry-cl only
pnpm lint        # registry-cl only
```

## Project Structure

```
packages/
  engine/    @emisso/sii          — Discontinued SDK
  api/       @emisso/sii-api      — Discontinued self-hosted API
  cli/       @emisso/sii-cli      — Discontinued CLI
  registry/  @emisso/registry-cl  — Outside this retirement
```

## Development Workflow

This workflow applies to documentation corrections and work outside the retired SDK packages. It does not imply that a proposed contribution will be accepted or released.

1. **Fork** and create a branch from `main`
2. **Make changes** following the conventions below
3. **Add a changeset when a registry change requires a version**: `pnpm changeset`. Do not add SDK changesets or change SDK versions.
4. **Verify**: `pnpm build && pnpm lint && pnpm test:run` checks `registry-cl`. For documentation-only corrections, review content and links.
5. **Open a PR**

Before running historical API or CLI scripts, build their workspace dependency with `pnpm --filter @emisso/sii build`.

Historical SDK scripts remain available through exact package filters, such as `pnpm --filter @emisso/sii test:run`, `pnpm --filter @emisso/sii-api build`, or `pnpm --filter @emisso/sii-cli lint`. Their availability is not a maintenance or compatibility promise.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
- **TypeScript strict**, Zod at boundaries
- **Engine is pure** — zero I/O side effects in the SDK core
- **API uses Effect TS** — Repo, Service, Handler layers
- **Tests:** Vitest with hand-verified values. API tests use PGLite.

## Historical SDK material

SDK examples, API descriptions, design documents, and the roadmap are preserved as historical reference. They may describe incomplete or unimplemented behavior and are not a backlog for future SDK improvements.

## Reporting Issues

- **Documentation corrections:** Identify the page and the inaccurate statement
- **Reports about packages outside this retirement:** Include steps to reproduce and your environment; their status is separate from the SDK retirement
- **Security:** Email hello@emisso.ai (see [SECURITY.md](./SECURITY.md))

## License

By contributing, you agree your contributions are licensed under [MIT](./LICENSE).
