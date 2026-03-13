import { Effect } from "effect";
import type { HandlerFn } from "./router.js";
import { resolveEnv } from "./handler-utils.js";
import type { CredentialService } from "../services/credential-service.js";
import type { AuthService } from "../services/auth-service.js";
import { SaveCredentialsSchema } from "../validation/schemas.js";
import { ValidationError } from "../core/effect/app-error.js";
import {
  noContentResponse,
  handleEffect,
} from "../core/effect/http-response.js";

export function createAuthHandlers(deps: {
  credentialService: CredentialService;
  authService: AuthService;
}) {
  const { credentialService, authService } = deps;

  const saveCredentials: HandlerFn = (req, ctx) =>
    handleEffect(
      Effect.gen(function* () {
        const body = yield* Effect.tryPromise({
          try: () => req.json(),
          catch: () => ValidationError.make("Invalid JSON body"),
        });
        const parsed = SaveCredentialsSchema.safeParse(body);
        if (!parsed.success) {
          return yield* Effect.fail(
            ValidationError.fromZodErrors("Invalid credentials data", parsed.error.issues),
          );
        }
        const result = yield* credentialService.save(ctx.tenantId, parsed.data);
        return {
          id: result.id,
          env: result.env,
          hasCert: !!result.certBase64,
          hasPortal: !!result.portalRut,
          portalRut: result.portalRut,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        };
      }),
    );

  const getStatus: HandlerFn = (req, ctx) => {
    const env = resolveEnv(req);
    return handleEffect(credentialService.getStatus(ctx.tenantId, env));
  };

  const testConnection: HandlerFn = (req, ctx) => {
    const env = resolveEnv(req);
    return handleEffect(authService.testConnection(ctx.tenantId, env));
  };

  const disconnect: HandlerFn = (req, ctx) => {
    const env = resolveEnv(req);
    return handleEffect(
      credentialService.disconnect(ctx.tenantId, env).pipe(Effect.map(() => null)),
      () => noContentResponse(),
    );
  };

  return {
    saveCredentials,
    getStatus,
    testConnection,
    disconnect,
  };
}
