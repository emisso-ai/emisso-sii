# Contributing to @emisso/sii

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/emisso-ai/emisso-sii.git
cd emisso-sii
pnpm install
pnpm build
pnpm test:run
pnpm lint
```

## Project Structure

```
packages/
  engine/   @emisso/sii      — Pure SDK: auth, DTE, RCV, certificates (zero DB)
  api/      @emisso/sii-api  — REST API: Effect TS + Drizzle + PostgreSQL
```

## Development Workflow

1. **Fork** and create a branch from `main`
2. **Make changes** following the conventions below
3. **Add a changeset**: `pnpm changeset`
4. **Verify**: `pnpm build && pnpm lint && pnpm test:run`
5. **Open a PR**

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat(dte):`, `fix(rcv):`, etc.
- **TypeScript strict**, Zod at boundaries
- **Engine is pure** — zero I/O side effects in the SDK core
- **API uses Effect TS** — Repo, Service, Handler layers
- **Tests:** Vitest with hand-verified values. API tests use PGLite.

## Ideas Welcome

- New DTE document types
- RCV improvements and new report formats
- Portal integrations
- API endpoints
- Documentation and examples

## Reporting Issues

- **Bugs:** Include steps to reproduce and your environment
- **Features:** Describe the use case
- **Security:** Email hello@emisso.ai (see [SECURITY.md](./SECURITY.md))

## License

By contributing, you agree your contributions are licensed under [MIT](./LICENSE).
