# Security Policy

`@emisso/sii`, `@emisso/sii-api`, and `@emisso/sii-cli` are discontinued. No versions of these packages receive maintenance or security updates. Existing published versions and source code remain available under their existing license.

## Reporting a Vulnerability

**Do not open a public issue.** Email **hello@emisso.ai** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

The reporting channel remains available for confidential disclosure. There is no promised response or remediation timeline for the retired SDK packages.

## Sensitive Areas

The historical SDK handles digital certificates (.p12/.pfx) and SII authentication tokens. Relevant areas for a report include:

- Certificate loading and private key handling (`packages/engine/src/cert/`)
- SOAP authentication and token management (`packages/engine/src/auth/`)
- Portal session management (`packages/engine/src/portal/`)

## Supported SDK Versions

None. The retirement applies to all published versions of the three SDK packages.

## Scope

- `@emisso/sii`
- `@emisso/sii-api`
- `@emisso/sii-cli`

`@emisso/registry-cl` is outside this retirement. This notice makes no new support, response-time, or remediation commitment for that package or other products.
