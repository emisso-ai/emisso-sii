import { Effect } from "effect";
import {
  loadCertFromBase64,
  getSeed,
  signSeedFromCertData,
  getToken,
  portalLogin,
  type SiiToken,
  type PortalSession,
  type SiiEnv,
} from "@emisso/sii";
import type { CredentialRepo } from "../repos/credential-repo.js";
import type { TokenCacheRepo } from "../repos/token-cache-repo.js";
import { SiiAuthError, type AppError } from "../core/effect/app-error.js";

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Authenticate with SII SOAP using base64 certificate data.
 */
async function authenticateSoap(
  certBase64: string,
  certPassword: string,
  env: SiiEnv,
): Promise<SiiToken> {
  const certData = loadCertFromBase64(certBase64, certPassword);
  const seed = await getSeed({ certPath: "", certPassword: "", env });
  const signedSeed = signSeedFromCertData(seed, certData);
  return getToken(signedSeed, { certPath: "", certPassword: "", env });
}

export function createAuthService(deps: {
  credentialRepo: CredentialRepo;
  tokenCacheRepo: TokenCacheRepo;
}) {
  const { credentialRepo, tokenCacheRepo } = deps;

  return {
    /**
     * Get a valid SOAP token, using cache if available.
     */
    getSoapToken(
      tenantId: string,
      env: SiiEnv,
    ): Effect.Effect<SiiToken, AppError> {
      return Effect.gen(function* () {
        const cred = yield* credentialRepo.getByTenantAndEnv(tenantId, env);

        if (!cred.certBase64 || !cred.certPassword) {
          return yield* Effect.fail(
            SiiAuthError.make("No certificate configured for SOAP authentication"),
          );
        }

        // Check cache
        const cached = yield* tokenCacheRepo.get(cred.id, "soap");
        if (cached && new Date(cached.expiresAt).getTime() > Date.now()) {
          return { token: cached.tokenValue, expiresAt: new Date(cached.expiresAt) };
        }

        // Authenticate with SII
        const siiToken = yield* Effect.tryPromise({
          try: () => authenticateSoap(cred.certBase64!, cred.certPassword!, env),
          catch: (e) =>
            SiiAuthError.make(`SOAP authentication failed: ${toMessage(e)}`, e),
        });

        // Cache the token
        yield* tokenCacheRepo.upsert(
          cred.id,
          "soap",
          siiToken.token,
          siiToken.expiresAt,
        );

        return siiToken;
      });
    },

    /**
     * Get a portal session via fresh login.
     */
    getPortalSession(
      tenantId: string,
      env: SiiEnv,
    ): Effect.Effect<PortalSession, AppError> {
      return Effect.gen(function* () {
        const cred = yield* credentialRepo.getByTenantAndEnv(tenantId, env);

        if (!cred.portalRut || !cred.portalPassword) {
          return yield* Effect.fail(
            SiiAuthError.make("No portal credentials configured"),
          );
        }

        // Login to portal
        const session = yield* Effect.tryPromise({
          try: () =>
            portalLogin({
              rut: cred.portalRut!,
              claveTributaria: cred.portalPassword!,
              env,
            }),
          catch: (e) =>
            SiiAuthError.make(`Portal login failed: ${toMessage(e)}`, e),
        });

        return session;
      });
    },

    /**
     * Test credentials by attempting authentication.
     * Runs SOAP and portal tests concurrently.
     */
    testConnection(
      tenantId: string,
      env: SiiEnv,
    ): Effect.Effect<{ soap: boolean; portal: boolean; errors: string[] }, AppError> {
      return Effect.gen(function* () {
        const cred = yield* credentialRepo.getByTenantAndEnv(tenantId, env);
        const errors: string[] = [];

        // Build test effects
        const soapTest = cred.certBase64 && cred.certPassword
          ? Effect.tryPromise({
              try: () => authenticateSoap(cred.certBase64!, cred.certPassword!, env).then(() => true),
              catch: (e) => toMessage(e),
            }).pipe(Effect.catchAll((msg) => {
              errors.push(`SOAP: ${msg}`);
              return Effect.succeed(false);
            }))
          : Effect.sync(() => {
              errors.push("SOAP: No certificate configured");
              return false;
            });

        const portalTest = cred.portalRut && cred.portalPassword
          ? Effect.tryPromise({
              try: () =>
                portalLogin({
                  rut: cred.portalRut!,
                  claveTributaria: cred.portalPassword!,
                  env,
                }).then(() => true),
              catch: (e) => toMessage(e),
            }).pipe(Effect.catchAll((msg) => {
              errors.push(`Portal: ${msg}`);
              return Effect.succeed(false);
            }))
          : Effect.sync(() => {
              errors.push("Portal: No portal credentials configured");
              return false;
            });

        // Run both tests concurrently
        const [soapOk, portalOk] = yield* Effect.all(
          [soapTest, portalTest],
          { concurrency: 2 },
        );

        return { soap: soapOk, portal: portalOk, errors };
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
