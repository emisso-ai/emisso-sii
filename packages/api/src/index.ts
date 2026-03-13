// ── Schema exports ──
export { siiSchema } from "./db/schema/index.js";
export * from "./db/schema/index.js";

// ── Core ──
export {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  DbError,
  ConflictError,
  SiiAuthError,
  isAppError,
  serializeAppError,
  type AppError,
} from "./core/effect/app-error.js";
export {
  toErrorResponse,
  toErrorResponseFromUnknown,
  handleEffect,
  jsonResponse,
  createdResponse,
  noContentResponse,
} from "./core/effect/http-response.js";
export { queryOneOrFail } from "./core/effect/repo-helpers.js";
export { invoiceToRow, rowToInvoice } from "./core/bridge.js";

// ── Validation ──
export {
  SaveCredentialsSchema,
  SyncInvoicesSchema,
  ListInvoicesQuerySchema,
  SyncStatusQuerySchema,
} from "./validation/schemas.js";
export type {
  SaveCredentialsInput,
  SyncInvoicesInput,
  ListInvoicesQuery,
} from "./validation/schemas.js";

// ── Repos ──
export { createCredentialRepo, type CredentialRepo } from "./repos/credential-repo.js";
export { createTokenCacheRepo, type TokenCacheRepo } from "./repos/token-cache-repo.js";
export { createInvoiceRepo, type InvoiceRepo } from "./repos/invoice-repo.js";
export { createSyncJobRepo, type SyncJobRepo } from "./repos/sync-job-repo.js";

// ── Services ──
export { createCredentialService, type CredentialService } from "./services/credential-service.js";
export { createAuthService, type AuthService } from "./services/auth-service.js";
export { createInvoiceService, type InvoiceService } from "./services/invoice-service.js";

// ── Handlers ──
export { createRouter, type Route, type HandlerFn, type HandlerContext } from "./handlers/router.js";
export { createAuthHandlers } from "./handlers/auth-handlers.js";
export { createInvoiceHandlers } from "./handlers/invoice-handlers.js";
