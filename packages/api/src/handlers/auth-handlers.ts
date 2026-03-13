import { Effect } from "effect";
import type { HandlerFn } from "./router.js";
import { resolveEnv } from "./handler-utils.js";
import type { CredentialService } from "../services/credential-service.js";
import type { AuthService } from "../services/auth-service.js";
import { SaveCredentialsSchema } from "../validation/schemas.js";
import { ValidationError } from "../core/effect/app-error.js";
import {
  jsonResponse,
  noContentResponse,
  toErrorResponseFromUnknown,
} from "../core/effect/http-response.js";

export function createAuthHandlers(deps: {
  credentialService: CredentialService;
  authService: AuthService;
}) {
  const { credentialService, authService } = deps;

  const saveCredentials: HandlerFn = async (req, ctx) => {
    try {
      const body = await req.json();
      const parsed = SaveCredentialsSchema.safeParse(body);
      if (!parsed.success) {
        throw ValidationError.fromZodErrors(
          "Invalid credentials data",
          parsed.error.issues,
        );
      }
      const result = await Effect.runPromise(
        credentialService.save(ctx.tenantId, parsed.data),
      );
      return jsonResponse({
        id: result.id,
        env: result.env,
        hasCert: !!result.certBase64,
        hasPortal: !!result.portalRut,
        portalRut: result.portalRut,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      });
    } catch (e) {
      return toErrorResponseFromUnknown(e);
    }
  };

  const getStatus: HandlerFn = async (req, ctx) => {
    try {
      const env = resolveEnv(req);
      const result = await Effect.runPromise(
        credentialService.getStatus(ctx.tenantId, env),
      );
      return jsonResponse(result);
    } catch (e) {
      return toErrorResponseFromUnknown(e);
    }
  };

  const testConnection: HandlerFn = async (req, ctx) => {
    try {
      const env = resolveEnv(req);
      const result = await Effect.runPromise(
        authService.testConnection(ctx.tenantId, env),
      );
      return jsonResponse(result);
    } catch (e) {
      return toErrorResponseFromUnknown(e);
    }
  };

  const disconnect: HandlerFn = async (req, ctx) => {
    try {
      const env = resolveEnv(req);
      await Effect.runPromise(
        credentialService.disconnect(ctx.tenantId, env),
      );
      return noContentResponse();
    } catch (e) {
      return toErrorResponseFromUnknown(e);
    }
  };

  return {
    saveCredentials,
    getStatus,
    testConnection,
    disconnect,
  };
}
