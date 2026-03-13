import {
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { SiiEnv } from "@emisso/sii";
import { siiSchema } from "./index.js";

export const credentials = siiSchema.table(
  "credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    // NOTE: `env` is typed as SiiEnv at the application layer via Drizzle's $type<>().
    // A DB-level CHECK constraint (env IN ('production','certification')) should be
    // added via a future migration to enforce this at the database level as well.
    env: text("env").notNull().$type<SiiEnv>(),
    // TODO: ENCRYPT AT REST — these fields store sensitive SII credentials.
    // Must implement application-level encryption (AES-256-GCM) before production.
    certBase64: text("cert_base64"),
    certPassword: text("cert_password"),
    portalRut: text("portal_rut"),
    // TODO: ENCRYPT AT REST — portal password stores sensitive SII credentials.
    // Must implement application-level encryption (AES-256-GCM) before production.
    portalPassword: text("portal_password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [unique("uq_credentials_tenant_env").on(table.tenantId, table.env)],
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
