import { Effect } from "effect";
import type { SiiEnv } from "@emisso/sii";
import type { CredentialRepo } from "../repos/credential-repo.js";
import type { TokenCacheRepo } from "../repos/token-cache-repo.js";
import type { Credential } from "../db/schema/index.js";
import type { SaveCredentialsInput } from "../validation/schemas.js";
import { NotFoundError, type AppError } from "../core/effect/app-error.js";

export function createCredentialService(deps: {
  credentialRepo: CredentialRepo;
  tokenCacheRepo: TokenCacheRepo;
  encrypt?: (plaintext: string) => string;
  decrypt?: (ciphertext: string) => string;
}) {
  const { credentialRepo, tokenCacheRepo } = deps;
  const enc = (v: string | null | undefined) =>
    v && deps.encrypt ? deps.encrypt(v) : v;
  const dec = (v: string | null) =>
    v && deps.decrypt ? deps.decrypt(v) : v;

  return {
    save(
      tenantId: string,
      input: SaveCredentialsInput,
    ): Effect.Effect<Credential, AppError> {
      return credentialRepo.upsert(tenantId, {
        env: input.env,
        certBase64: enc(input.certBase64) ?? null,
        certPassword: enc(input.certPassword) ?? null,
        portalRut: input.portalRut ?? null,
        portalPassword: enc(input.portalPassword) ?? null,
      });
    },

    getStatus(
      tenantId: string,
      env: SiiEnv,
    ): Effect.Effect<{
      connected: boolean;
      env: string;
      hasCert: boolean;
      hasPortal: boolean;
      portalRut: string | null;
    }, AppError> {
      return credentialRepo.getByTenantAndEnv(tenantId, env).pipe(
        Effect.map((cred) => ({
          connected: true,
          env: cred.env,
          hasCert: !!cred.certBase64,
          hasPortal: !!cred.portalRut && !!cred.portalPassword,
          portalRut: cred.portalRut,
        })),
        Effect.catchTag("NotFoundError", () =>
          Effect.succeed({
            connected: false,
            env,
            hasCert: false,
            hasPortal: false,
            portalRut: null,
          }),
        ),
      );
    },

    disconnect(
      tenantId: string,
      env: SiiEnv,
    ): Effect.Effect<void, AppError> {
      return Effect.gen(function* () {
        // Get credential to clean up token cache
        const cred = yield* credentialRepo.getByTenantAndEnv(tenantId, env);

        // Token cache cascades on delete, but explicit cleanup is clearer
        yield* tokenCacheRepo.deleteByCredential(cred.id);
        yield* credentialRepo.delete(tenantId, env);
      });
    },
  };
}

export type CredentialService = ReturnType<typeof createCredentialService>;
