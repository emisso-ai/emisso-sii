# Security Policy

## Reporting a Vulnerability

**Do not open a public issue.** Email **hello@emisso.ai** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge within 48 hours and aim to fix critical issues within 7 days.

## Sensitive Areas

This SDK handles digital certificates (.p12/.pfx) and SII authentication tokens. Issues in these areas are treated with highest priority:

- Certificate loading and private key handling (`packages/engine/src/cert/`)
- SOAP authentication and token management (`packages/engine/src/auth/`)
- Portal session management (`packages/engine/src/portal/`)

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Scope

- `@emisso/sii`
- `@emisso/sii-api`
